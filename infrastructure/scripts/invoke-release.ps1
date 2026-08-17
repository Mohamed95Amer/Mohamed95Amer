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
$dirty = @(& git -C $repoRoot status --porcelain --untracked-files=all)
if ($dirty.Count -gt 0) { throw 'The working tree must be committed and pushed before a release can be built.' }
& git -C $repoRoot fetch origin $Ref --quiet
if ($LASTEXITCODE -ne 0) { throw "Remote branch origin/$Ref does not exist." }
$localSha = (& git -C $repoRoot rev-parse HEAD).Trim()
$remoteSha = (& git -C $repoRoot rev-parse "origin/$Ref").Trim()
if ($localSha -ne $remoteSha) { throw "Local HEAD is not equal to origin/$Ref. Push it before releasing." }

$shortSha = $localSha.Substring(0, 8)
$requestTag = $null
$releaseSha = $null
$before = [DateTime]::UtcNow

# Recover a completed release when the only commits after it repair this watcher.
# This prevents a local post-release failure from producing an unintended new version.
$releaseTagLines = @(& git -C $repoRoot ls-remote --tags origin 'refs/tags/v*')
if ($LASTEXITCODE -ne 0) { throw 'Could not inspect existing version tags.' }
$releaseTagMap = @{}
foreach ($line in $releaseTagLines) {
    $parts = $line -split "`t", 2
    if ($parts.Count -ne 2) { continue }
    $tagRef = $parts[1]
    $tagName = ($tagRef -replace '^refs/tags/', '') -replace '\^\{\}$', ''
    if ($tagName -notmatch '^v([0-9]+\.[0-9]+\.[0-9]+)$') { continue }
    if ($tagRef -like '*^{}' -or -not $releaseTagMap.ContainsKey($tagName)) {
        $releaseTagMap[$tagName] = $parts[0]
    }
}
$releaseTags = @($releaseTagMap.GetEnumerator() | ForEach-Object {
    [pscustomobject]@{
        Name = $_.Key
        Sha = $_.Value
        Version = [version]($_.Key.Substring(1))
    }
} | Sort-Object Version -Descending)

foreach ($releaseTag in $releaseTags) {
    & git -C $repoRoot merge-base --is-ancestor $releaseTag.Sha $localSha 2>$null
    if ($LASTEXITCODE -ne 0) { continue }
    $changedSinceRelease = @(& git -C $repoRoot diff --name-only $releaseTag.Sha $localSha)
    $nonWatcherChanges = @($changedSinceRelease | Where-Object {
        $_ -ne 'infrastructure/scripts/invoke-release.ps1'
    })
    if ($nonWatcherChanges.Count -eq 0) {
        $releaseSha = $releaseTag.Sha
        $before = [DateTime]::UtcNow.AddDays(-7)
        Write-Output "Recovering completed release $($releaseTag.Name)."
        break
    }
}

$tagPattern = "refs/tags/majalops-release-request-$Bump-*"
$existingTags = @()
if ([string]::IsNullOrWhiteSpace($releaseSha)) {
    $remoteTagLines = @(& git -C $repoRoot ls-remote --tags origin $tagPattern)
    if ($LASTEXITCODE -ne 0) { throw 'Could not inspect existing release-request tags.' }
    $existingTags = @($remoteTagLines | ForEach-Object {
        $parts = $_ -split "`t", 2
        if ($parts.Count -eq 2 -and $parts[1] -notlike '*^{}') {
            $tagName = $parts[1] -replace '^refs/tags/', ''
            if ($tagName -match '^majalops-release-request-(patch|minor|major)-[0-9]{14}-[a-f0-9]{8}$') {
                & git -C $repoRoot merge-base --is-ancestor $parts[0] $localSha 2>$null
                if ($LASTEXITCODE -eq 0) {
                    [pscustomobject]@{ Name = $tagName; Sha = $parts[0] }
                }
            }
        }
    } | Where-Object { $null -ne $_ } | Sort-Object Name -Descending)
}

if (-not [string]::IsNullOrWhiteSpace($releaseSha)) {
    # The matching completed workflow run is located below.
} elseif ($existingTags.Count -gt 0) {
    $requestTag = $existingTags[0].Name
    $releaseSha = $existingTags[0].Sha
    $before = [DateTime]::UtcNow.AddDays(-7)
    Write-Output "Resuming existing release request: $requestTag"
} else {
    $before = [DateTime]::UtcNow
    $requestTag = "majalops-release-request-$Bump-$($before.ToString('yyyyMMddHHmmss'))-$shortSha"
    $releaseSha = $localSha
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
}

$run = $null
for ($attempt = 1; $attempt -le 30 -and $null -eq $run; $attempt++) {
    Start-Sleep -Seconds 3
    $jsonLines = @(& gh run list --repo $Repository --event push --limit 50 `
        --json databaseId,createdAt,headSha,headBranch,status,workflowName
    )
    if ($LASTEXITCODE -ne 0) { throw 'Could not query GitHub workflow runs.' }
    $runs = ConvertFrom-Json -InputObject ($jsonLines -join [Environment]::NewLine)
    $matchingRuns = @()
    foreach ($candidate in $runs) {
        $createdAt = [DateTimeOffset]::Parse([string]$candidate.createdAt).UtcDateTime
        if ($createdAt -ge $before.AddMinutes(-1) -and
            $candidate.headSha -eq $releaseSha -and
            $candidate.workflowName -eq 'MajalOps Release and Deploy') {
            $matchingRuns += $candidate
        }
    }
    $run = $matchingRuns | Sort-Object {
        [DateTimeOffset]::Parse([string]$_.createdAt).UtcDateTime
    } -Descending | Select-Object -First 1
}
if ($null -eq $run) {
    if (-not [string]::IsNullOrWhiteSpace($requestTag)) {
        & git -C $repoRoot push origin ":refs/tags/$requestTag" 2>$null
    }
    throw 'The tag-triggered release run did not appear within 90 seconds.'
}

Write-Output "Waiting for GitHub release run $($run.databaseId)..."
& gh run watch $run.databaseId --repo $Repository --exit-status
if ($LASTEXITCODE -ne 0) {
    if (-not [string]::IsNullOrWhiteSpace($requestTag)) {
        & git -C $repoRoot push origin ":refs/tags/$requestTag" 2>$null
    }
    throw "Release workflow $($run.databaseId) failed."
}

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
