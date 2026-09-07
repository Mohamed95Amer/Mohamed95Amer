[CmdletBinding()]
param([string] $Repository = 'Mohamed95Amer/Mohamed95Amer')

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
if (-not (Get-Command gh -ErrorAction SilentlyContinue)) { throw 'GitHub CLI is not installed.' }
& gh auth status
if ($LASTEXITCODE -ne 0) { throw 'Authenticate GitHub CLI first with gh auth login.' }

$mapping = [ordered]@{
    ALERT_SLACK_WEBHOOK_URL = 'SLACK_WEBHOOK_URL'
    ALERT_TEAMS_WEBHOOK_URL = 'TEAMS_WEBHOOK_URL'
    ALERT_DISCORD_WEBHOOK_URL = 'DISCORD_WEBHOOK_URL'
    ALERT_GENERIC_WEBHOOK_URL = 'GENERIC_WEBHOOK_URL'
    ALERT_SMTP_HOST = 'SMTP_HOST'
    ALERT_SMTP_PORT = 'SMTP_PORT'
    ALERT_SMTP_USERNAME = 'SMTP_USERNAME'
    ALERT_SMTP_PASSWORD = 'SMTP_PASSWORD'
    ALERT_EMAIL_FROM = 'EMAIL_FROM'
    ALERT_EMAIL_TO = 'EMAIL_TO'
}

$emailValues = @('SMTP_HOST','SMTP_USERNAME','SMTP_PASSWORD','EMAIL_FROM','EMAIL_TO') | ForEach-Object {
    [Environment]::GetEnvironmentVariable($_, 'Process')
}
$emailCount = @($emailValues | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }).Count
if ($emailCount -ne 0 -and $emailCount -ne $emailValues.Count) {
    throw 'Email monitoring is only partially configured. Set SMTP_HOST, SMTP_USERNAME, SMTP_PASSWORD, EMAIL_FROM and EMAIL_TO together.'
}

$configured = 0
foreach ($githubName in $mapping.Keys) {
    $processName = $mapping[$githubName]
    $value = [Environment]::GetEnvironmentVariable($processName, 'Process')
    if ([string]::IsNullOrWhiteSpace($value)) { continue }
    $value | & gh secret set $githubName --repo $Repository
    if ($LASTEXITCODE -ne 0) { throw "Could not set GitHub secret $githubName." }
    $configured++
}
if ($configured -eq 0) {
    Write-Output 'No notification variables were set; GitHub secrets were unchanged.'
} else {
    Write-Output "Configured $configured encrypted GitHub notification secret(s). Values were not printed."
}
