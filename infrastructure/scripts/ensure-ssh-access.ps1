[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)] [long] $ServerId,
    [Parameter(Mandatory = $true)] [string] $ServerIp,
    [string] $IdentityFile = 'C:\Users\hossi\.ssh\majalops_admin',
    [string] $AdminUser = 'majaladmin',
    [int] $SshPort = 22
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$apiToken = $env:HCLOUD_TOKEN
if ([string]::IsNullOrWhiteSpace($apiToken)) { throw 'HCLOUD_TOKEN is required for SSH recovery.' }
if ($AdminUser -notmatch '^[a-z_][a-z0-9_-]*[$]?$') { throw 'AdminUser is not a valid Linux account name.' }
if (-not (Test-Path -LiteralPath $IdentityFile -PathType Leaf)) { throw "SSH identity not found: $IdentityFile" }
$publicKeyFile = "$IdentityFile.pub"
if (-not (Test-Path -LiteralPath $publicKeyFile -PathType Leaf)) { throw "SSH public key not found: $publicKeyFile" }
$knownHostsFile = Join-Path (Split-Path -Parent $IdentityFile) 'known_hosts'
if (-not (Test-Path -LiteralPath $knownHostsFile -PathType Leaf)) {
    throw 'The installed-system SSH host key must be verified and pinned before automated recovery.'
}

$headers = @{ Authorization = "Bearer $apiToken"; 'Content-Type' = 'application/json' }
$apiBase = 'https://api.hetzner.cloud/v1'
$generatedDir = Join-Path (Resolve-Path (Join-Path $PSScriptRoot '..')).Path '.generated'
New-Item -ItemType Directory -Path $generatedDir -Force | Out-Null

function Invoke-HetznerApi {
    param([string] $Method, [string] $Path, [object] $Body = $null)
    $parameters = @{ Method = $Method; Uri = "$apiBase$Path"; Headers = $headers }
    if ($null -ne $Body) { $parameters.Body = ($Body | ConvertTo-Json -Depth 12 -Compress) }
    for ($attempt = 1; $attempt -le 5; $attempt++) {
        try {
            return Invoke-RestMethod @parameters
        } catch {
            if ($attempt -eq 5) { throw }
            Start-Sleep -Seconds ([int][Math]::Pow(2, $attempt - 1))
        }
    }
}

function Wait-HetznerAction {
    param([long] $ActionId, [int] $TimeoutSeconds = 180)
    $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
    do {
        $result = Invoke-HetznerApi -Method GET -Path "/actions/$ActionId"
        if ($result.action.status -eq 'success') { return }
        if ($result.action.status -eq 'error') {
            throw "Hetzner action $ActionId failed: $($result.action.error.message)"
        }
        Start-Sleep -Seconds 2
    } while ([DateTime]::UtcNow -lt $deadline)
    throw "Hetzner action $ActionId did not finish within $TimeoutSeconds seconds."
}

function Test-KeyOnlySsh {
    param([string] $User, [string] $KnownHosts = $knownHostsFile, [string] $Command = 'true')
    $previousPreference = $ErrorActionPreference
    $exitCode = 255
    try {
        $ErrorActionPreference = 'Continue'
        & ssh.exe -p $SshPort -i $IdentityFile -o BatchMode=yes -o StrictHostKeyChecking=yes `
            -o ConnectTimeout=10 -o ConnectionAttempts=1 `
            -o "UserKnownHostsFile=$KnownHosts" -o KexAlgorithms=curve25519-sha256 `
            -o HostKeyAlgorithms=ssh-ed25519 "$User@$ServerIp" $Command *> $null
        $exitCode = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previousPreference
    }
    return ($exitCode -eq 0)
}

if (Test-KeyOnlySsh -User $AdminUser -Command 'sudo -n true') {
    Write-Output "$AdminUser key-only SSH access is already ready."
    return
}
if (Test-KeyOnlySsh -User 'root') {
    Write-Output 'Root key-only SSH access is available; rescue recovery is not required.'
    return
}

Write-Output 'No authorized local key was found on the installed server. Starting Hetzner Rescue recovery.'
$publicKey = (Get-Content -LiteralPath $publicKeyFile -Raw).Trim()
if ($publicKey -notmatch '^ssh-ed25519\s+[A-Za-z0-9+/=]+(?:\s+.*)?$') {
    throw 'The recovery public key is not a valid single-line Ed25519 public key.'
}
$publicKeyParts = @($publicKey -split '\s+')
$publicKeyIdentity = "$($publicKeyParts[0]) $($publicKeyParts[1])"

$keyLookup = Invoke-HetznerApi -Method GET -Path '/ssh_keys?per_page=50'
$matchingKeys = @($keyLookup.ssh_keys | Where-Object {
    $remoteParts = @(([string]$_.public_key).Trim() -split '\s+')
    $remoteParts.Count -ge 2 -and "$($remoteParts[0]) $($remoteParts[1])" -eq $publicKeyIdentity
})
if ($matchingKeys.Count -gt 1) { throw 'Multiple Hetzner SSH keys match the local public key.' }
if ($matchingKeys.Count -eq 1) {
    $sshKeyId = [long]$matchingKeys[0].id
    Write-Output "Using existing Hetzner SSH key $sshKeyId for rescue."
} else {
    $keyHash = (Get-FileHash -LiteralPath $publicKeyFile -Algorithm SHA256).Hash.Substring(0, 12).ToLowerInvariant()
    $createdKey = Invoke-HetznerApi -Method POST -Path '/ssh_keys' -Body @{
        name = "majalops-admin-$keyHash"
        public_key = $publicKey
        labels = @{ owner = 'majalops'; purpose = 'platform-admin-recovery' }
    }
    $sshKeyId = [long]$createdKey.ssh_key.id
    Write-Output "Registered Hetzner SSH key $sshKeyId for rescue."
}

$rescue = Invoke-HetznerApi -Method POST -Path "/servers/$ServerId/actions/enable_rescue" -Body @{
    type = 'linux64'
    ssh_keys = @($sshKeyId)
}
Wait-HetznerAction -ActionId ([long]$rescue.action.id)
$restart = Invoke-HetznerApi -Method POST -Path "/servers/$ServerId/actions/reboot"
Wait-HetznerAction -ActionId ([long]$restart.action.id)

$gitScanner = 'C:\Program Files\Git\usr\bin\ssh-keyscan.exe'
$scanner = if (Test-Path -LiteralPath $gitScanner -PathType Leaf) { $gitScanner } else { 'ssh-keyscan.exe' }
$rescueKnownHosts = Join-Path $generatedDir 'rescue_known_hosts'
$rescueReady = $false
for ($attempt = 1; $attempt -le 48 -and -not $rescueReady; $attempt++) {
    Start-Sleep -Seconds 5
    $previousPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        $scanLines = @(& $scanner -T 10 -p $SshPort -t ed25519 $ServerIp 2>$null)
    } finally {
        $ErrorActionPreference = $previousPreference
    }
    $hostKey = @($scanLines | Where-Object { $_ -match '^\S+\s+ssh-ed25519\s+' } | Select-Object -First 1)
    if ($hostKey.Count -eq 0) { continue }
    Set-Content -LiteralPath $rescueKnownHosts -Value $hostKey[0] -Encoding ascii
    $rescueReady = Test-KeyOnlySsh -User 'root' -KnownHosts $rescueKnownHosts `
        -Command 'command -v chroot-prepare >/dev/null 2>&1'
}
if (-not $rescueReady) { throw 'The Hetzner Rescue System did not become reachable with the registered SSH key.' }
$rescueFingerprint = (& ssh-keygen -lf $rescueKnownHosts -E sha256).Trim()
Write-Output "Pinned temporary Rescue host key: $rescueFingerprint"

$publicKeyBase64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($publicKey))
$repairScript = @'
set -Eeuo pipefail
mount_root=/mnt/majalops-installed-root
mkdir -p "$mount_root"
root_device=''
while read -r device type filesystem; do
    [[ "$type" == "part" ]] || continue
    [[ "$filesystem" == "ext4" || "$filesystem" == "xfs" ]] || continue
    if mount -o ro "$device" "$mount_root" 2>/dev/null; then
        if [[ -f "$mount_root/etc/os-release" ]] && grep -Eq '^ID=ubuntu$' "$mount_root/etc/os-release"; then
            root_device="$device"
            umount "$mount_root"
            break
        fi
        umount "$mount_root"
    fi
done < <(lsblk -rpno NAME,TYPE,FSTYPE)
[[ -n "$root_device" ]] || { echo 'Installed Ubuntu root partition not found.' >&2; exit 1; }
mount "$root_device" "$mount_root"
trap 'mountpoint -q "$mount_root" && umount "$mount_root"' EXIT
admin_user='__ADMIN_USER__'
admin_record="$(awk -F: -v user="$admin_user" '$1 == user { print; exit }' "$mount_root/etc/passwd")"
[[ -n "$admin_record" ]] || { echo "Installed admin user $admin_user not found." >&2; exit 1; }
IFS=: read -r _ _ admin_uid admin_gid _ admin_home _ <<< "$admin_record"
admin_ssh_dir="$mount_root$admin_home/.ssh"
admin_keys="$admin_ssh_dir/authorized_keys"
install -d -m 0700 -o "$admin_uid" -g "$admin_gid" "$admin_ssh_dir"
touch "$admin_keys"
chown "$admin_uid:$admin_gid" "$admin_keys"
chmod 0600 "$admin_keys"
public_key="$(printf '%s' '__PUBLIC_KEY_BASE64__' | base64 -d)"
grep -qxF "$public_key" "$admin_keys" || printf '%s\n' "$public_key" >> "$admin_keys"
# Earlier rejected-key recovery attempts can leave the operator IP persisted
# in Fail2ban's database for an hour. Preserve the database for forensics, but
# move it out of the active path so the valid recovered key can be verified.
fail2ban_db="$mount_root/var/lib/fail2ban/fail2ban.sqlite3"
if [[ -f "$fail2ban_db" ]]; then
    fail2ban_backup="${fail2ban_db}.before-majalops-ssh-recovery.$(date -u +%Y%m%dT%H%M%SZ)"
    mv "$fail2ban_db" "$fail2ban_backup"
fi
installed_host_key="$(cat "$mount_root/etc/ssh/ssh_host_ed25519_key.pub")"
sync
echo "Injected MajalOps administrator key for $admin_user into $root_device."
echo "MAJAL_INSTALLED_HOST_KEY=$installed_host_key"
'@.Replace('__PUBLIC_KEY_BASE64__', $publicKeyBase64).Replace('__ADMIN_USER__', $AdminUser)
$repairScript = $repairScript -replace "`r`n", "`n"
$repairScriptBase64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($repairScript))
$rescueSshArgs = @('-p', "$SshPort", '-i', $IdentityFile, '-o', 'BatchMode=yes',
    '-o', 'StrictHostKeyChecking=yes', '-o', "UserKnownHostsFile=$rescueKnownHosts",
    '-o', 'KexAlgorithms=curve25519-sha256', '-o', 'HostKeyAlgorithms=ssh-ed25519')
$repairOutput = @(& ssh.exe @rescueSshArgs "root@$ServerIp" "printf '%s' '$repairScriptBase64' | base64 -d | bash -s")
$repairExitCode = $LASTEXITCODE
$repairOutput | Write-Output
if ($repairExitCode -ne 0) { throw 'Could not inject the administrator key into the installed Ubuntu system.' }

$installedHostKeyRecord = @($repairOutput | Where-Object { $_ -match '^MAJAL_INSTALLED_HOST_KEY=ssh-ed25519\s+[A-Za-z0-9+/=]+' } | Select-Object -First 1)
if ($installedHostKeyRecord.Count -ne 1) { throw 'Could not read the installed Ubuntu ED25519 host key during recovery.' }
$installedHostKey = $installedHostKeyRecord[0].Substring('MAJAL_INSTALLED_HOST_KEY='.Length).Trim()
$installedHostKeyParts = @($installedHostKey -split '\s+')
$knownHostName = if ($SshPort -eq 22) { $ServerIp } else { "[$ServerIp]:$SshPort" }
$knownHostEntry = "$knownHostName $($installedHostKeyParts[0]) $($installedHostKeyParts[1])"
$previousPreference = $ErrorActionPreference
try {
    $ErrorActionPreference = 'Continue'
    & ssh-keygen.exe -R $knownHostName -f $knownHostsFile *> $null
} finally {
    $ErrorActionPreference = $previousPreference
}
Add-Content -LiteralPath $knownHostsFile -Value $knownHostEntry -Encoding ascii
Write-Output "Pinned installed Ubuntu host key from the recovered disk."

try {
    $diskBoot = Invoke-HetznerApi -Method POST -Path "/servers/$ServerId/actions/reboot"
    Wait-HetznerAction -ActionId ([long]$diskBoot.action.id)
} catch {
    Write-Warning "Hetzner API reboot failed after verified key injection; falling back to Rescue SSH reboot: $($_.Exception.Message)"
    $previousPreference = $ErrorActionPreference
    $rebootExitCode = 255
    try {
        $ErrorActionPreference = 'Continue'
        & ssh.exe @rescueSshArgs "root@$ServerIp" 'sync; systemctl reboot' *> $null
        $rebootExitCode = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previousPreference
    }
    if ($rebootExitCode -notin @(0, 255)) { throw 'Could not reboot from the Rescue environment.' }
}
$adminReady = $false
for ($attempt = 1; $attempt -le 20 -and -not $adminReady; $attempt++) {
    # UFW's SSH limit rule treats rapid probes as abuse. Keep verification
    # below that threshold while retaining an overall five-minute timeout.
    Start-Sleep -Seconds 15
    $adminReady = Test-KeyOnlySsh -User $AdminUser -Command 'sudo -n true'
}
if (-not $adminReady) { throw "Ubuntu did not return with $AdminUser key-only sudo access after Rescue recovery." }
Write-Output "Recovered $AdminUser key-only sudo access through the Hetzner Rescue System."
