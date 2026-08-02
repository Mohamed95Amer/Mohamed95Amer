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
    return Invoke-RestMethod @parameters
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
        -Command 'test -x /usr/bin/chroot-prepare'
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
install -d -m 0700 "$mount_root/root/.ssh"
touch "$mount_root/root/.ssh/authorized_keys"
chmod 0600 "$mount_root/root/.ssh/authorized_keys"
public_key="$(printf '%s' '__PUBLIC_KEY_BASE64__' | base64 -d)"
grep -qxF "$public_key" "$mount_root/root/.ssh/authorized_keys" || \
    printf '%s\n' "$public_key" >> "$mount_root/root/.ssh/authorized_keys"
sync
echo "Injected MajalOps administrator key into $root_device."
'@.Replace('__PUBLIC_KEY_BASE64__', $publicKeyBase64)
$repairScriptBase64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($repairScript))
$rescueSshArgs = @('-p', "$SshPort", '-i', $IdentityFile, '-o', 'BatchMode=yes',
    '-o', 'StrictHostKeyChecking=yes', '-o', "UserKnownHostsFile=$rescueKnownHosts",
    '-o', 'KexAlgorithms=curve25519-sha256', '-o', 'HostKeyAlgorithms=ssh-ed25519')
& ssh.exe @rescueSshArgs "root@$ServerIp" "printf '%s' '$repairScriptBase64' | base64 -d | bash"
if ($LASTEXITCODE -ne 0) { throw 'Could not inject the administrator key into the installed Ubuntu system.' }

$diskBoot = Invoke-HetznerApi -Method POST -Path "/servers/$ServerId/actions/reboot"
Wait-HetznerAction -ActionId ([long]$diskBoot.action.id)
$rootReady = $false
for ($attempt = 1; $attempt -le 60 -and -not $rootReady; $attempt++) {
    Start-Sleep -Seconds 5
    $rootReady = Test-KeyOnlySsh -User 'root'
}
if (-not $rootReady) { throw 'Ubuntu did not return with root key-only SSH access after Rescue recovery.' }
Write-Output 'Recovered root key-only SSH access through the Hetzner Rescue System.'
