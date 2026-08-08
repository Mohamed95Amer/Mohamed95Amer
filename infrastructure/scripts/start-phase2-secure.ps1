[CmdletBinding()]
param(
    [string] $TlsEmail = '',
    [string] $Domain = 'platform.majalops.com',
    [string] $MajalImage = '',
    [string] $IdentityFile = 'C:\Users\hossi\.ssh\majalops_admin',
    [ValidateSet('patch', 'minor', 'major')] [string] $ReleaseBump = 'patch',
    [ValidateSet('platform', 'staging')] [string] $EnvironmentName = 'platform',
    [ValidateSet('', 'cpx22', 'cx33')] [string] $ExpectedServerType = '',
    [switch] $EnableExternalHealth
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Read-SecretEnvironmentVariable {
    param(
        [Parameter(Mandatory = $true)] [string] $Name,
        [Parameter(Mandatory = $true)] [string] $Prompt
    )

    $secureValue = Read-Host -Prompt $Prompt -AsSecureString
    if ($secureValue.Length -eq 0) { throw "$Name cannot be empty." }
    $pointer = [IntPtr]::Zero
    try {
        $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureValue)
        $plainValue = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
        [Environment]::SetEnvironmentVariable($Name, $plainValue, 'Process')
    } finally {
        if ($pointer -ne [IntPtr]::Zero) {
            [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
        }
        $plainValue = $null
        $secureValue.Dispose()
    }
}

function Test-ProviderEndpoint {
    param(
        [Parameter(Mandatory = $true)] [string] $Name,
        [Parameter(Mandatory = $true)] [string] $Uri
    )

    $lastError = $null
    foreach ($delay in @(0, 2, 4, 8)) {
        if ($delay -gt 0) { Start-Sleep -Seconds $delay }
        try {
            [void](Invoke-WebRequest -UseBasicParsing -Uri $Uri -TimeoutSec 15)
            Write-Output "$Name endpoint is reachable."
            return
        } catch {
            $lastError = $_
            if ($null -ne $_.Exception.Response) {
                Write-Output "$Name endpoint is reachable."
                return
            }
        }
    }
    throw "$Name endpoint is not reachable after four attempts: $($lastError.Exception.Message)"
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$releaseEnv = Join-Path (Join-Path $PSScriptRoot '..\.generated') 'release.env'
if ([string]::IsNullOrWhiteSpace($MajalImage) -and (Test-Path -LiteralPath $releaseEnv)) {
    foreach ($line in Get-Content -LiteralPath $releaseEnv) {
        if ($line -match '^MAJAL_IMAGE=(.+)$') {
            $MajalImage = $Matches[1].Trim()
            break
        }
    }
}
if (-not [string]::IsNullOrWhiteSpace($MajalImage) -and
    $MajalImage -notmatch '^ghcr\.io/mohamed95amer/majalops-platform@sha256:[a-fA-F0-9]{64}$') {
    throw 'MajalImage must be an immutable MajalOps GHCR image digest.'
}
if ([string]::IsNullOrWhiteSpace($TlsEmail)) {
    $TlsEmail = Read-Host -Prompt 'Certificate alert email'
}
if ($TlsEmail -notmatch '^[^@\s]+@[^@\s]+\.[^@\s]+$') { throw 'TlsEmail is invalid.' }

Write-Output 'Checking provider DNS and HTTPS before requesting credentials.'
Test-ProviderEndpoint -Name 'Hetzner' -Uri 'https://api.hetzner.cloud/v1/servers'
Test-ProviderEndpoint -Name 'Cloudflare' -Uri 'https://api.cloudflare.com/client/v4/zones?per_page=1'
Test-ProviderEndpoint -Name 'GitHub' -Uri 'https://api.github.com/meta'

Write-Output 'Replacement tokens are requested with masked input and will not enter PowerShell history.'
Read-SecretEnvironmentVariable -Name 'HCLOUD_TOKEN' -Prompt 'New Hetzner token'
Read-SecretEnvironmentVariable -Name 'CLOUDFLARE_API_TOKEN' -Prompt 'New Cloudflare token'
Read-SecretEnvironmentVariable -Name 'GHCR_TOKEN' -Prompt 'New GitHub package token'
$env:GHCR_USERNAME = 'Mohamed95Amer'

Push-Location $repoRoot
try {
    & (Join-Path $PSScriptRoot 'invoke-phase2.ps1') `
        -TlsEmail $TlsEmail `
        -Domain $Domain `
        -MajalImage $MajalImage `
        -IdentityFile $IdentityFile `
        -ReleaseBump $ReleaseBump `
        -EnvironmentName $EnvironmentName `
        -ExpectedServerType $ExpectedServerType `
        -EnableExternalHealth:$EnableExternalHealth
} finally {
    Remove-Item Env:HCLOUD_TOKEN -ErrorAction SilentlyContinue
    Remove-Item Env:CLOUDFLARE_API_TOKEN -ErrorAction SilentlyContinue
    Remove-Item Env:GHCR_TOKEN -ErrorAction SilentlyContinue
    Remove-Item Env:GHCR_USERNAME -ErrorAction SilentlyContinue
    Pop-Location
    Write-Output 'Provider tokens were cleared from this PowerShell process.'
}
