[CmdletBinding()]
param(
    [string] $ServerIp = '',
    [Parameter(Mandatory = $true)] [string] $TlsEmail,
    [Parameter(Mandatory = $true)] [string] $MajalImage,
    [string] $Domain = 'platform.majalops.com',
    [string] $SshUser = 'majaladmin',
    [string] $AdminUser = 'majaladmin',
    [int] $SshPort = 22,
    [string] $IdentityFile = 'C:\Users\hossi\.ssh\majalops_admin'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$ghcrUsername = $env:GHCR_USERNAME
$ghcrToken = $env:GHCR_TOKEN

if (-not (Test-Path -LiteralPath $IdentityFile -PathType Leaf)) {
    throw "SSH identity not found: $IdentityFile"
}
if ($MajalImage -notmatch '@sha256:[a-fA-F0-9]{64}$') {
    throw 'MajalImage must be an immutable GHCR sha256 digest.'
}

$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..')).Path
$infraRoot = Join-Path $repoRoot 'infrastructure'
$generatedDir = Join-Path $infraRoot '.generated'
New-Item -ItemType Directory -Path $generatedDir -Force | Out-Null
if ([string]::IsNullOrWhiteSpace($ServerIp)) {
    $serverEnv = Join-Path $generatedDir 'server.env'
    if (-not (Test-Path -LiteralPath $serverEnv)) { throw 'ServerIp is required until configure-hetzner.ps1 creates .generated/server.env.' }
    $serverLine = Get-Content -LiteralPath $serverEnv | Where-Object { $_ -like 'SERVER_IPV4=*' } | Select-Object -First 1
    $ServerIp = ($serverLine -split '=', 2)[1]
}
$known = & ssh-keygen -F "[$ServerIp]:$SshPort" 2>$null
if (-not $known) {
    $known = & ssh-keygen -F $ServerIp 2>$null
}
if (-not $known) {
    throw "The server host key is not in known_hosts. Connect once and verify its Hetzner-console fingerprint before rerunning."
}

$sshTarget = "$SshUser@$ServerIp"
$sshArgs = @('-p', "$SshPort", '-i', $IdentityFile, '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes')
$scpArgs = @('-P', "$SshPort", '-i', $IdentityFile, '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes')
$remoteStaging = '/tmp/majalops-phase2-infrastructure'

function Test-KeyOnlySsh {
    param([string] $Target, [string] $Command)
    $previousPreference = $ErrorActionPreference
    $exitCode = 255
    try {
        $ErrorActionPreference = 'Continue'
        & ssh @sshArgs $Target $Command *> $null
        $exitCode = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previousPreference
    }
    return ($exitCode -eq 0)
}

if (-not (Test-KeyOnlySsh -Target $sshTarget -Command 'sudo -n true')) {
    Write-Output "Administrator $SshUser is not ready; starting the two-stage root bootstrap."
    $rootTarget = "root@$ServerIp"
    if (-not (Test-KeyOnlySsh -Target $rootTarget -Command 'true')) {
        throw 'Root key-only SSH access is required for the initial administrator bootstrap.'
    }

    & ssh @sshArgs $rootTarget "rm -rf '$remoteStaging'; mkdir -p '$remoteStaging'"
    if ($LASTEXITCODE -ne 0) { throw 'Could not create the root bootstrap staging directory.' }
    & scp @scpArgs -r "$infraRoot\*" "${rootTarget}:$remoteStaging/"
    if ($LASTEXITCODE -ne 0) { throw 'Initial infrastructure upload as root failed.' }

    $bootstrapStageOne = @"
env ADMIN_USER='$AdminUser' ADMIN_AUTHORIZED_KEYS_FILE='/root/.ssh/authorized_keys' HOSTNAME_FQDN='majalops-platform-01' SERVER_TIMEZONE='UTC' SSH_PORT='$SshPort' HARDEN_SSH='0' bash '$remoteStaging/scripts/bootstrap-server.sh'
"@
    & ssh @sshArgs $rootTarget $bootstrapStageOne.Trim()
    if ($LASTEXITCODE -ne 0) { throw 'Initial server bootstrap failed before SSH lockdown.' }

    if (-not (Test-KeyOnlySsh -Target $sshTarget -Command 'sudo -n true')) {
        throw "$SshUser key-only SSH and non-interactive sudo validation failed before lockdown."
    }

    $bootstrapStageTwo = @"
env ADMIN_USER='$AdminUser' ADMIN_AUTHORIZED_KEYS_FILE='/root/.ssh/authorized_keys' HOSTNAME_FQDN='majalops-platform-01' SERVER_TIMEZONE='UTC' SSH_PORT='$SshPort' HARDEN_SSH='1' CONFIRM_ADMIN_SSH_TESTED='YES' bash '$remoteStaging/scripts/bootstrap-server.sh'
"@
    & ssh @sshArgs $rootTarget $bootstrapStageTwo.Trim()
    if ($LASTEXITCODE -ne 0) { throw 'SSH lockdown stage failed.' }

    if (-not (Test-KeyOnlySsh -Target $sshTarget -Command 'sudo -n true')) {
        throw "$SshUser failed final key-only SSH and sudo validation."
    }
    if (Test-KeyOnlySsh -Target $rootTarget -Command 'true') { throw 'Root SSH remained available after lockdown.' }
    Write-Output "Created and verified $SshUser, then disabled root and password SSH login."
}

if ([string]::IsNullOrWhiteSpace($ghcrUsername) -or [string]::IsNullOrWhiteSpace($ghcrToken)) {
    throw 'Set GHCR_USERNAME and GHCR_TOKEN in this PowerShell process. The token needs read:packages and is never passed on the command line.'
}
$ghcrToken | & ssh @sshArgs $sshTarget "sudo docker login ghcr.io -u '$ghcrUsername' --password-stdin"
if ($LASTEXITCODE -ne 0) { throw 'Private GHCR login failed.' }

& ssh @sshArgs $sshTarget "sudo rm -rf '$remoteStaging'; mkdir -p '$remoteStaging'"
if ($LASTEXITCODE -ne 0) { throw 'Could not create remote staging directory.' }

& scp @scpArgs -r "$infraRoot\*" "${sshTarget}:$remoteStaging/"
if ($LASTEXITCODE -ne 0) { throw 'Infrastructure upload failed.' }

$remoteCommand = @"
sudo env CONFIRM_PROVISION=YES ADMIN_USER='$AdminUser' SSH_PORT='$SshPort' MAJAL_DOMAIN='$Domain' TLS_EMAIL='$TlsEmail' MAJAL_IMAGE='$MajalImage' bash '$remoteStaging/scripts/provision-platform.sh'
"@
& ssh @sshArgs $sshTarget $remoteCommand.Trim()
if ($LASTEXITCODE -ne 0) { throw 'Remote provisioning failed. Review /var/log/majalops/provision-platform.log.' }

$deployKey = Join-Path $generatedDir 'majaldeploy_ed25519'
if (-not (Test-Path -LiteralPath $deployKey)) {
    & ssh-keygen -q -t ed25519 -N '' -C 'MajalOps GitHub deployment' -f $deployKey
    if ($LASTEXITCODE -ne 0) { throw 'Could not generate restricted deployment key.' }
}
& scp @scpArgs "$deployKey.pub" "${sshTarget}:$remoteStaging/majaldeploy_ed25519.pub"
if ($LASTEXITCODE -ne 0) { throw 'Could not upload deployment public key.' }
& ssh @sshArgs $sshTarget "sudo env DEPLOY_PUBLIC_KEY_FILE='$remoteStaging/majaldeploy_ed25519.pub' bash '$remoteStaging/scripts/configure-deploy-user.sh'"
if ($LASTEXITCODE -ne 0) { throw 'Could not configure restricted deployment identity.' }

$knownLines = & ssh-keygen -F "[$ServerIp]:$SshPort" 2>$null
if (-not $knownLines) { $knownLines = & ssh-keygen -F $ServerIp 2>$null }
$knownLines | Where-Object { $_ -and -not $_.StartsWith('#') } | Set-Content -LiteralPath (Join-Path $generatedDir 'known_hosts') -Encoding ascii

Write-Output "Provisioning succeeded: https://$Domain"
Write-Output "Next automated step: powershell -File infrastructure\scripts\configure-github.ps1 -ServerIp $ServerIp"
