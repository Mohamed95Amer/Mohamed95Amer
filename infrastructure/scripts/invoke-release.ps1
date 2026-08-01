[CmdletBinding()]
param(
    [string] $Repository = 'Mohamed95Amer/Mohamed95Amer',
    [ValidateSet('patch', 'minor', 'major')] [string] $Bump = 'patch',
    [string] $Ref = ''
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
if (-not (Get-Command gh -ErrorAction SilentlyContinue)) { throw 'GitHub CLI is not installed.' }
if (-not (Get-Command git -ErrorAction SilentlyContinue)) { throw 'Git is not installed.' }
& gh auth status
if ($LASTEXITCODE -ne 0) { throw 'Authenticate GitHub CLI first with gh auth login.' }

$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..')).Path
if ([string]::IsNullOrWhiteSpace($Ref)) {
    $Ref = (& git -C $repoRoot branch --show-current).Trim()
}
if ([string]::IsNullOrWhiteSpace($Ref)) { throw 'Could not determine the Git branch.' }
$dirty = & git -C $repoRoot status --porcelain
if ($dirty) { throw 'The working tree must be committed and pushed before a release can be built.' }
& git -C $repoRoot fetch origin $Ref --quiet
if ($LASTEXITCODE -ne 0) { throw "Remote branch origin/$Ref does not exist." }
$localSha = (& git -C $repoRoot rev-parse HEAD).Trim()
$remoteSha = (& git -C $repoRoot rev-parse "origin/$Ref").Trim()
if ($localSha -ne $remoteSha) { throw "Local HEAD is not equal to origin/$Ref. Push it before releasing." }

$before = [DateTime]::UtcNow
$requestTag = "majalops-release-request-$Bump-$($before.ToString('yyyyMMddHHmmss'))-$($localSha.Substring(0, 8))"
& git -C $repoRoot tag $requestTag $localSha
if ($LASTEXITCODE -ne 0) { throw "Could not create local release-request tag $requestTag." }
try {
    & git -C $repoRoot push origin "refs/tags/${requestTag}:refs/tags/${requestTag}"
    if ($LASTEXITCODE -ne 0) { throw "Could not push release-request tag $requestTag." }
} catch {
    & git -C $repoRoot tag --delete $requestTag 2>$null
    throw
}
& git -C $repoRoot tag --delete $requestTag | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Could not remove local release-request tag $requestTag." }

$run = $null
for ($attempt = 1; $attempt -le 30 -and $null -eq $run; $attempt++) {
    Start-Sleep -Seconds 3
    $json = & gh run list --repo $Repository --event push --limit 50 `
        --json databaseId,createdAt,headSha,headBranch,status,workflowName
    if ($LASTEXITCODE -ne 0) { throw 'Could not query GitHub workflow runs.' }
    $runs = @($json | ConvertFrom-Json)
    $run = $runs | Where-Object {
        ([DateTime]$_.createdAt).ToUniversalTime() -ge $before.AddMinutes(-1) -and
        $_.headSha -eq $localSha -and
        $_.headBranch -eq $requestTag -and
        $_.workflowName -eq 'MajalOps Release and Deploy'
    } | Sort-Object { [DateTime]$_.createdAt } -Descending | Select-Object -First 1
}
if ($null -eq $run) {
    & git -C $repoRoot push origin ":refs/tags/$requestTag" 2>$null
    throw 'The tag-triggered release run did not appear within 90 seconds.'
}

Write-Output "Waiting for GitHub release run $($run.databaseId)..."
& gh run watch $run.databaseId --repo $Repository --exit-status
if ($LASTEXITCODE -ne 0) { throw "Release workflow $($run.databaseId) failed." }

$generated = Join-Path (Resolve-Path (Join-Path $PSScriptRoot '..')).Path '.generated'
New-Item -ItemType Directory -Path $generated -Force | Out-Null
$downloadDir = Join-Path $generated "release-$($run.databaseId)"
if (Test-Path -LiteralPath $downloadDir) { throw "Refusing to overwrite existing download directory: $downloadDir" }
& gh run download $run.databaseId --repo $Repository --name majalops-image-reference --dir $downloadDir
if ($LASTEXITCODE -ne 0) { throw 'Could not download the immutable image reference.' }
$imageRef = (Get-Content -LiteralPath (Join-Path $downloadDir 'image-reference.txt') -Raw).Trim()
if ($imageRef -notmatch '^ghcr\.io/mohamed95amer/majalops-platform@sha256:[a-fA-F0-9]{64}$') {
    throw 'The workflow returned an invalid image reference.'
}
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText(
    (Join-Path $generated 'release.env'),
    "MAJAL_IMAGE=$imageRef$([Environment]::NewLine)",
    $utf8NoBom
)
Write-Output "Release completed: $imageRef"
Write-Output $imageRef
