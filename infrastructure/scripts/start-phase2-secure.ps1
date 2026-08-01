[CmdletBinding()]
param(
    [string] $TlsEmail = '',
    [string] $Domain = 'platform.majalops.com',
    [ValidateSet('patch', 'minor', 'major')] [string] $ReleaseBump = 'patch',
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

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
if ([string]::IsNullOrWhiteSpace($TlsEmail)) {
    $TlsEmail = Read-Host -Prompt 'Certificate alert email'
}
if ($TlsEmail -notmatch '^[^@\s]+@[^@\s]+\.[^@\s]+$') { throw 'TlsEmail is invalid.' }

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
        -ReleaseBump $ReleaseBump `
        -EnableExternalHealth:$EnableExternalHealth
} finally {
    Remove-Item Env:HCLOUD_TOKEN -ErrorAction SilentlyContinue
    Remove-Item Env:CLOUDFLARE_API_TOKEN -ErrorAction SilentlyContinue
    Remove-Item Env:GHCR_TOKEN -ErrorAction SilentlyContinue
    Remove-Item Env:GHCR_USERNAME -ErrorAction SilentlyContinue
    Pop-Location
    Write-Output 'Provider tokens were cleared from this PowerShell process.'
}
