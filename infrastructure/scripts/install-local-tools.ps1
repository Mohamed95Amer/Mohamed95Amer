[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$infraRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$toolRoot = Join-Path $infraRoot '.generated\tools'
$ghRoot = Join-Path $toolRoot 'gh'
$existing = Get-ChildItem -Path $ghRoot -Recurse -Filter gh.exe -ErrorAction SilentlyContinue | Select-Object -First 1
if ($existing) {
    Write-Output $existing.FullName
    exit 0
}

New-Item -ItemType Directory -Path $toolRoot -Force | Out-Null
$headers = @{ 'User-Agent' = 'MajalOps-Local-Tool-Bootstrap' }
$release = Invoke-RestMethod -Headers $headers -Uri 'https://api.github.com/repos/cli/cli/releases/latest'
$asset = $release.assets | Where-Object { $_.name -match '^gh_[0-9.]+_windows_amd64\.zip$' } | Select-Object -First 1
if (-not $asset) { throw 'The official GitHub CLI Windows archive was not found.' }
if ($asset.digest -notmatch '^sha256:([a-fA-F0-9]{64})$') { throw 'GitHub did not publish an API SHA-256 digest for the CLI archive.' }
$expected = $Matches[1]
$archive = Join-Path $toolRoot $asset.name
Invoke-WebRequest -Headers $headers -Uri $asset.browser_download_url -OutFile $archive
$actual = (Get-FileHash -Algorithm SHA256 -LiteralPath $archive).Hash
if ($actual -ne $expected) { throw 'GitHub CLI archive checksum verification failed.' }

New-Item -ItemType Directory -Path $ghRoot -Force | Out-Null
Expand-Archive -LiteralPath $archive -DestinationPath $ghRoot
$gh = Get-ChildItem -Path $ghRoot -Recurse -Filter gh.exe | Select-Object -First 1
if (-not $gh) { throw 'GitHub CLI executable was not found after extraction.' }
& $gh.FullName version
if ($LASTEXITCODE -ne 0) { throw 'The downloaded GitHub CLI could not run.' }
Write-Output $gh.FullName
