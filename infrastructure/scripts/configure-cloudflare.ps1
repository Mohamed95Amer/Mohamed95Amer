[CmdletBinding()]
param(
    [string] $ZoneName = 'majalops.com',
    [string] $Hostname = 'platform.majalops.com',
    [Parameter(Mandatory = $true)] [string] $ServerIPv4,
    [string] $ServerIPv6 = '',
    [bool] $Proxied = $false,
    [switch] $ConfigureZoneSettings,
    [switch] $RemoveStaleAAAA
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$apiToken = $env:CLOUDFLARE_API_TOKEN
if ([string]::IsNullOrWhiteSpace($apiToken)) {
    throw 'Set CLOUDFLARE_API_TOKEN in the current process. Do not pass it on the command line.'
}
if ($ServerIPv4 -notmatch '^(?:\d{1,3}\.){3}\d{1,3}$') {
    throw 'ServerIPv4 is invalid.'
}
if ($Hostname -notlike "*.$ZoneName" -and $Hostname -ne $ZoneName) {
    throw "Hostname must belong to $ZoneName."
}

$headers = @{
    Authorization = "Bearer $apiToken"
    'Content-Type' = 'application/json'
}
$apiBase = 'https://api.cloudflare.com/client/v4'

function Invoke-CloudflareApi {
    param([string] $Method, [string] $Path, [object] $Body = $null)
    $parameters = @{ Method = $Method; Uri = "$apiBase$Path"; Headers = $headers }
    if ($null -ne $Body) { $parameters.Body = ($Body | ConvertTo-Json -Depth 10 -Compress) }
    $response = Invoke-RestMethod @parameters
    if (-not $response.success) {
        $errors = ($response.errors | ConvertTo-Json -Compress)
        throw "Cloudflare API failed: $errors"
    }
    return $response
}

function Set-DnsRecord {
    param([string] $ZoneId, [string] $Type, [string] $Name, [string] $Content, [bool] $UseProxy)
    $encodedName = [uri]::EscapeDataString($Name)
    $lookup = Invoke-CloudflareApi -Method GET -Path "/zones/$ZoneId/dns_records?type=$Type&name=$encodedName"
    if (@($lookup.result).Count -gt 1) { throw "Multiple $Type records exist for $Name; refusing ambiguous update." }
    $body = @{
        type = $Type
        name = $Name
        content = $Content
        ttl = 1
        proxied = $UseProxy
        comment = 'Managed by MajalOps infrastructure automation'
    }
    if (@($lookup.result).Count -eq 1) {
        $recordId = $lookup.result[0].id
        [void](Invoke-CloudflareApi -Method PATCH -Path "/zones/$ZoneId/dns_records/$recordId" -Body $body)
        Write-Output "Updated $Type $Name -> $Content (proxied=$UseProxy)"
    } else {
        [void](Invoke-CloudflareApi -Method POST -Path "/zones/$ZoneId/dns_records" -Body $body)
        Write-Output "Created $Type $Name -> $Content (proxied=$UseProxy)"
    }
}

$verification = Invoke-CloudflareApi -Method GET -Path '/user/tokens/verify'
if ($verification.result.status -ne 'active') { throw 'Cloudflare token is not active.' }

$zoneLookup = Invoke-CloudflareApi -Method GET -Path "/zones?name=$([uri]::EscapeDataString($ZoneName))&status=active"
if (@($zoneLookup.result).Count -ne 1) { throw "Expected one active Cloudflare zone named $ZoneName." }
$zoneId = $zoneLookup.result[0].id

Set-DnsRecord -ZoneId $zoneId -Type A -Name $Hostname -Content $ServerIPv4 -UseProxy $Proxied
if (-not [string]::IsNullOrWhiteSpace($ServerIPv6)) {
    Set-DnsRecord -ZoneId $zoneId -Type AAAA -Name $Hostname -Content $ServerIPv6 -UseProxy $Proxied
} elseif ($RemoveStaleAAAA) {
    $lookup = Invoke-CloudflareApi -Method GET -Path "/zones/$zoneId/dns_records?type=AAAA&name=$([uri]::EscapeDataString($Hostname))"
    foreach ($record in @($lookup.result)) {
        [void](Invoke-CloudflareApi -Method DELETE -Path "/zones/$zoneId/dns_records/$($record.id)")
        Write-Output "Removed stale AAAA record $Hostname"
    }
}

if ($ConfigureZoneSettings) {
    foreach ($setting in @(
        @{ id = 'ssl'; value = 'strict' },
        @{ id = 'min_tls_version'; value = '1.2' },
        @{ id = 'always_use_https'; value = 'on' }
    )) {
        [void](Invoke-CloudflareApi -Method PATCH -Path "/zones/$zoneId/settings/$($setting.id)" -Body @{ value = $setting.value })
        Write-Output "Set Cloudflare $($setting.id)=$($setting.value)"
    }
}

$generatedDir = Join-Path (Resolve-Path (Join-Path $PSScriptRoot '..')).Path '.generated'
New-Item -ItemType Directory -Path $generatedDir -Force | Out-Null
$generatedContent = @(
    "CLOUDFLARE_ZONE_ID=$zoneId"
    "MAJAL_DOMAIN=$Hostname"
    "SERVER_IPV4=$ServerIPv4"
    "SERVER_IPV6=$ServerIPv6"
    "CLOUDFLARE_PROXIED=$Proxied"
) -join [Environment]::NewLine
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText(
    (Join-Path $generatedDir 'cloudflare.env'),
    "$generatedContent$([Environment]::NewLine)",
    $utf8NoBom
)
Write-Output "Cloudflare configuration completed for $Hostname"
