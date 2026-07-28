param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("today", "yesterday", "day_before", "weekly", "fortnight", "monthly", "quarterly")]
    [string]$Slot,

    [Parameter(Mandatory = $true)]
    [string]$Code
)

$ErrorActionPreference = "Stop"
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
$envFile = Join-Path $projectRoot ".env"
if (-not (Test-Path -LiteralPath $envFile)) {
    throw "The project .env file was not found."
}

$settings = @{}
Get-Content -LiteralPath $envFile | ForEach-Object {
    if ($_ -match '^\s*([^#][^=]*)=(.*)$') {
        $settings[$matches[1].Trim()] = $matches[2].Trim()
    }
}
if (-not $settings.ContainsKey("DB_ADMIN_PASSWORD") -or -not $settings.ContainsKey("DB_PASSWORD")) {
    throw "DB_ADMIN_PASSWORD and DB_PASSWORD are required in .env."
}

$docker = "docker"
$desktopDocker = "C:\Users\hossi\AppData\Local\Programs\DockerDesktop\resources\bin\docker.exe"
if (Test-Path -LiteralPath $desktopDocker) {
    $docker = $desktopDocker
}

Push-Location $projectRoot
try {
    Write-Host "Stopping Majal application before protected restore..."
    & $docker compose stop odoo
    if ($LASTEXITCODE -ne 0) {
        throw "Could not stop the Majal application."
    }

    $env:MAJAL_DB_ADMIN_PASSWORD = $settings["DB_ADMIN_PASSWORD"]
    $env:MAJAL_DB_APP_PASSWORD = $settings["DB_PASSWORD"]
    & $docker compose run --rm --no-deps `
        -e MAJAL_DB_ADMIN_PASSWORD `
        -e MAJAL_DB_APP_PASSWORD `
        --entrypoint python3 odoo `
        /mnt/custom-addons/majal_administration/scripts/restore_database.py `
        --slot $Slot --code $Code
    if ($LASTEXITCODE -ne 0) {
        throw "Protected restore did not complete. The recovery executor attempted an automatic rollback."
    }
}
finally {
    Remove-Item Env:MAJAL_DB_ADMIN_PASSWORD -ErrorAction SilentlyContinue
    Remove-Item Env:MAJAL_DB_APP_PASSWORD -ErrorAction SilentlyContinue
    Write-Host "Starting Majal application..."
    & $docker compose up -d odoo
    Pop-Location
}
