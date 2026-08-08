[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)] [string] $TlsEmail,
    [string] $MajalImage = '',
    [ValidateSet('patch', 'minor', 'major')] [string] $ReleaseBump = 'patch',
    [string] $Domain = 'platform.majalops.com',
    [string] $Repository = 'Mohamed95Amer/Mohamed95Amer',
    [string] $IdentityFile = 'C:\Users\hossi\.ssh\majalops_admin',
    [string] $SshUser = 'majaladmin',
    [int] $SshPort = 22,
    [bool] $CloudflareProxied = $false,
    [ValidateSet('platform', 'staging')] [string] $EnvironmentName = 'platform',
    [string] $ServerName = '',
    [string] $FirewallName = '',
    [switch] $EnableExternalHealth
)

if ([string]::IsNullOrWhiteSpace($ServerName)) {
    $ServerName = if ($EnvironmentName -eq 'platform') { 'majalops-platform-01' } else { 'majalops-staging-01' }
}
if ([string]::IsNullOrWhiteSpace($FirewallName)) {
    $FirewallName = "majalops-$EnvironmentName-firewall"
}

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Require-EnvironmentSecret {
    param([string] $Name)
    $value = [Environment]::GetEnvironmentVariable($Name, 'Process')
    if ([string]::IsNullOrWhiteSpace($value)) {
        throw "Set $Name in this PowerShell process. Never put it in Git or a command-line argument."
    }
}

foreach ($name in @('HCLOUD_TOKEN', 'CLOUDFLARE_API_TOKEN', 'GHCR_USERNAME', 'GHCR_TOKEN')) {
    Require-EnvironmentSecret -Name $name
}
if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
    $toolOutput = & (Join-Path $PSScriptRoot 'install-local-tools.ps1')
    $ghPath = @($toolOutput | Where-Object { $_ -match 'gh\.exe$' })[-1]
    if (-not (Test-Path -LiteralPath $ghPath)) { throw 'Portable GitHub CLI setup failed.' }
    $env:PATH = "$(Split-Path -Parent $ghPath);$env:PATH"
}
& gh auth status
if ($LASTEXITCODE -ne 0) { throw 'GitHub CLI is not authenticated.' }
if ([string]::IsNullOrWhiteSpace($MajalImage)) {
    Write-Output 'STEP 0/5: Building, attesting and publishing the first immutable MajalOps release.'
    $releaseOutput = & (Join-Path $PSScriptRoot 'invoke-release.ps1') `
        -Repository $Repository -Bump $ReleaseBump
    $MajalImage = @($releaseOutput | Where-Object {
        $_ -match '^ghcr\.io/mohamed95amer/majalops-platform@sha256:[a-fA-F0-9]{64}$'
    })[-1]
}
if ($MajalImage -notmatch '^ghcr\.io/mohamed95amer/majalops-platform@sha256:[a-fA-F0-9]{64}$') {
    throw 'MajalImage must be the immutable MajalOps GHCR image digest.'
}

$scripts = $PSScriptRoot
Write-Output "STEP 1/5: Applying Hetzner firewall, backup and deletion-protection controls to $ServerName ($EnvironmentName)."
& (Join-Path $scripts 'configure-hetzner.ps1') -ServerName $ServerName -FirewallName $FirewallName -EnvironmentName $EnvironmentName -SshPort $SshPort

$serverEnv = Join-Path (Join-Path $scripts '..\.generated') 'server.env'
$values = @{}
foreach ($line in Get-Content -LiteralPath $serverEnv) {
    if ($line -match '^([^=]+)=(.*)$') { $values[$Matches[1]] = $Matches[2] }
}
$serverIp = $values.SERVER_IPV4
if ([string]::IsNullOrWhiteSpace($serverIp)) { throw 'Hetzner automation did not return SERVER_IPV4.' }

Write-Output 'STEP 2/5: Creating or updating Cloudflare DNS and zone security settings.'
& (Join-Path $scripts 'configure-cloudflare.ps1') `
    -Hostname $Domain -ServerIPv4 $serverIp -Proxied $CloudflareProxied `
    -ConfigureZoneSettings -RemoveStaleAAAA

Write-Output 'STEP 3/5: Provisioning the platform through strict host-key SSH.'
& (Join-Path $scripts 'ensure-ssh-access.ps1') `
    -ServerId ([long]$values.HETZNER_SERVER_ID) -ServerIp $serverIp `
    -IdentityFile $IdentityFile -AdminUser $SshUser -SshPort $SshPort
& (Join-Path $scripts 'remote-bootstrap.ps1') `
    -ServerIp $serverIp -TlsEmail $TlsEmail -MajalImage $MajalImage `
    -Domain $Domain -SshUser $SshUser -AdminUser $SshUser `
    -SshPort $SshPort -IdentityFile $IdentityFile -EnvironmentName $EnvironmentName

Write-Output "STEP 4/5: Configuring the $EnvironmentName GitHub environment, variables and restricted deploy secrets."
# configure-github.ps1's own -SshUser default ('majaldeploy') is the
# restricted forced-command deploy key user, deliberately distinct from
# $SshUser above (the human admin account used for STEP 3's provisioning
# SSH session) -- do not pass $SshUser through here.
& (Join-Path $scripts 'configure-github.ps1') `
    -Repository $Repository -ServerIp $serverIp -SshPort "$SshPort" `
    -HealthUrl "https://$Domain/healthz" -EnvironmentName $EnvironmentName -EnableExternalHealth:$EnableExternalHealth

Write-Output 'STEP 5/5: Running an external TLS health check.'
$response = Invoke-WebRequest -UseBasicParsing -Uri "https://$Domain/healthz" -TimeoutSec 30
if ($response.StatusCode -lt 200 -or $response.StatusCode -ge 300) {
    throw "External health check returned HTTP $($response.StatusCode)."
}

Write-Output "MajalOps Phase 2 provisioning completed: https://$Domain"
Write-Output 'Clear token variables from this PowerShell window, then close it.'
