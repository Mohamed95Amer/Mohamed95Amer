<#
.SYNOPSIS
  One scheduled run of the Majal sales pipeline.

.DESCRIPTION
  Called by Windows Task Scheduler. Everything it does is safe to repeat: the
  enricher only touches leads missing values, the publishers only take what
  Majal has already approved, and the sequence engine drafts rather than sends.
  A run that fires twice does no harm; a run that is missed is caught by the
  next one.

  Nothing here sends outreach. Odoo's own cron does that, capped, and only for
  messages a human approved. This script is the part that needs a desktop
  session: the local model and the two subscription CLIs.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File sales-agents\run-daily.ps1
#>

[CmdletBinding()]
param(
    [int]$EnrichLimit = 100,
    [switch]$DryRun
)

$ErrorActionPreference = 'Continue'   # one failing stage must not kill the rest
$root = Split-Path -Parent $PSScriptRoot
$log  = Join-Path $PSScriptRoot 'logs'
New-Item -ItemType Directory -Force -Path $log | Out-Null
$stamp     = Get-Date -Format 'yyyy-MM-dd'
$transcript = Join-Path $log "run-$stamp.log"
Start-Transcript -Path $transcript -Append | Out-Null

function Step {
    param([string]$Name, [scriptblock]$Body)
    Write-Host ""
    Write-Host "=== $Name ===" -ForegroundColor Cyan
    try { & $Body }
    catch { Write-Host "  ! $Name failed: $_" -ForegroundColor Red }
}

Write-Host "Majal sales run — $(Get-Date -Format 'yyyy-MM-dd HH:mm')"

# Fail loudly and early rather than producing a run that looks successful and
# did nothing. A silent no-op is the failure mode worth engineering against.
Step 'Preflight' {
    $status = & python (Join-Path $PSScriptRoot 'lib\preflight.py')
    Write-Host $status
    if ($LASTEXITCODE -ne 0) { throw 'preflight failed — see above' }
}

Step 'Enrich leads (free, local model)' {
    $args = @((Join-Path $PSScriptRoot 'enrich_leads.py'), '--limit', $EnrichLimit)
    if (-not $DryRun) { $args += '--commit' }
    & python @args
}

Step 'Publish approved social posts' {
    $args = @((Join-Path $PSScriptRoot 'publish.py'), '--all')
    if ($DryRun) { $args += '--dry-run' }
    & python @args
}

Write-Host ""
Write-Host "Done. Open Majal -> My Day to approve today's queue." -ForegroundColor Green
Write-Host "Log: $transcript"
Stop-Transcript | Out-Null
