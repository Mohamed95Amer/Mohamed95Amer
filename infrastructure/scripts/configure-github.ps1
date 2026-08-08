[CmdletBinding()]
param(
    [string] $Repository = 'Mohamed95Amer/Mohamed95Amer',
    [Parameter(Mandatory = $true)] [string] $ServerIp,
    [string] $SshPort = '22',
    [string] $SshUser = 'majaldeploy',
    [string] $HealthUrl = 'https://platform.majalops.com/healthz',
    [string] $DeployPrivateKey = '',
    [string] $KnownHostsFile = '',
    [ValidateSet('platform', 'staging')] [string] $EnvironmentName = 'platform',
    [switch] $EnableExternalHealth
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

# Secrets/variables are namespaced by prefix (PLATFORM_* / STAGING_*) rather
# than relying on GitHub's per-environment secret scoping, so one target's
# credentials can never be read by mistake while resolving the other's -- the
# release workflow selects the prefix from its own `target` input, not from
# whichever environment happens to be active.
$prefix = $EnvironmentName.ToUpperInvariant()

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) { throw 'GitHub CLI is not installed.' }
& gh auth status
if ($LASTEXITCODE -ne 0) { throw 'Authenticate GitHub CLI first with: gh auth login' }

$generated = Join-Path (Resolve-Path (Join-Path $PSScriptRoot '..')).Path '.generated'
if ([string]::IsNullOrWhiteSpace($DeployPrivateKey)) { $DeployPrivateKey = Join-Path $generated "majaldeploy_${EnvironmentName}_ed25519" }
if ([string]::IsNullOrWhiteSpace($KnownHostsFile)) { $KnownHostsFile = Join-Path $generated "known_hosts_${EnvironmentName}" }
if (-not (Test-Path -LiteralPath $DeployPrivateKey -PathType Leaf)) { throw "Missing deploy key: $DeployPrivateKey" }
if (-not (Test-Path -LiteralPath $KnownHostsFile -PathType Leaf)) { throw "Missing known_hosts file: $KnownHostsFile" }

& gh variable set "${prefix}_HOST" --repo $Repository --body $ServerIp
& gh variable set "${prefix}_SSH_PORT" --repo $Repository --body $SshPort
& gh variable set "${prefix}_SSH_USER" --repo $Repository --body $SshUser
if ($EnvironmentName -eq 'platform') {
    # Scheduled external synthetic monitoring currently watches one target;
    # extending it to staging is a separate monitoring change, not this one.
    & gh variable set MAJALOPS_HEALTH_URL --repo $Repository --body $HealthUrl
    $external = if ($EnableExternalHealth) { 'true' } else { 'false' }
    & gh variable set ENABLE_EXTERNAL_HEALTH --repo $Repository --body $external
}

Get-Content -LiteralPath $DeployPrivateKey -Raw | & gh secret set "${prefix}_SSH_PRIVATE_KEY" --repo $Repository
Get-Content -LiteralPath $KnownHostsFile -Raw | & gh secret set "${prefix}_KNOWN_HOSTS" --repo $Repository
if ($LASTEXITCODE -ne 0) { throw 'GitHub secret configuration failed.' }

foreach ($environment in @('release', $EnvironmentName)) {
    '{}' | & gh api --method PUT "repos/$Repository/environments/$environment" --input -
    if ($LASTEXITCODE -ne 0) { throw "Could not create GitHub environment $environment." }
}
Write-Output "GitHub variables, restricted SSH secrets, and the $EnvironmentName environment are configured."
