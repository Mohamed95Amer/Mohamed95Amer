[CmdletBinding()]
param(
    [string] $ServerName = 'majalops-platform-01',
    [string] $FirewallName = 'majalops-platform-firewall',
    [int] $SshPort = 22,
    [string[]] $SshAllowedCidrs = @('0.0.0.0/0', '::/0'),
    [bool] $EnableBackups = $true,
    [bool] $EnableProtection = $true
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$apiToken = $env:HCLOUD_TOKEN
if ([string]::IsNullOrWhiteSpace($apiToken)) {
    throw 'Set HCLOUD_TOKEN in the current process. Do not pass it on the command line.'
}
$headers = @{ Authorization = "Bearer $apiToken"; 'Content-Type' = 'application/json' }
$apiBase = 'https://api.hetzner.cloud/v1'

function Invoke-HetznerApi {
    param([string] $Method, [string] $Path, [object] $Body = $null)
    $parameters = @{ Method = $Method; Uri = "$apiBase$Path"; Headers = $headers }
    if ($null -ne $Body) { $parameters.Body = ($Body | ConvertTo-Json -Depth 12 -Compress) }
    return Invoke-RestMethod @parameters
}

$serverLookup = Invoke-HetznerApi -Method GET -Path "/servers?name=$([uri]::EscapeDataString($ServerName))"
if (@($serverLookup.servers).Count -ne 1) { throw "Expected exactly one Hetzner server named $ServerName." }
$server = $serverLookup.servers[0]
if ($server.server_type.name -ne 'cpx22') { throw "Expected CPX22, found $($server.server_type.name)." }
if ($server.datacenter.location.name -ne 'nbg1') { throw "Expected Nuremberg nbg1, found $($server.datacenter.location.name)." }
if ($server.image.os_flavor -ne 'ubuntu' -or $server.image.os_version -notlike '24.04*') {
    throw "Expected Ubuntu 24.04, found $($server.image.description)."
}

$rules = @(
    @{ direction = 'in'; protocol = 'tcp'; port = "$SshPort"; source_ips = $SshAllowedCidrs; description = 'Key-only SSH' },
    @{ direction = 'in'; protocol = 'tcp'; port = '80'; source_ips = @('0.0.0.0/0','::/0'); description = 'HTTP redirect and ACME' },
    @{ direction = 'in'; protocol = 'tcp'; port = '443'; source_ips = @('0.0.0.0/0','::/0'); description = 'MajalOps HTTPS' },
    @{ direction = 'in'; protocol = 'icmp'; source_ips = @('0.0.0.0/0','::/0'); description = 'Diagnostics and path MTU' }
)
$firewallLookup = Invoke-HetznerApi -Method GET -Path "/firewalls?name=$([uri]::EscapeDataString($FirewallName))"
if (@($firewallLookup.firewalls).Count -eq 0) {
    $created = Invoke-HetznerApi -Method POST -Path '/firewalls' -Body @{
        name = $FirewallName
        labels = @{ owner = 'majalops'; environment = 'platform' }
        rules = $rules
        apply_to = @(@{ type = 'server'; server = @{ id = $server.id } })
    }
    $firewall = $created.firewall
    Write-Output "Created and attached firewall $FirewallName"
} elseif (@($firewallLookup.firewalls).Count -eq 1) {
    $firewall = $firewallLookup.firewalls[0]
    [void](Invoke-HetznerApi -Method POST -Path "/firewalls/$($firewall.id)/actions/set_rules" -Body @{ rules = $rules })
    $attached = @($firewall.applied_to | Where-Object { $_.type -eq 'server' -and $_.server.id -eq $server.id }).Count -gt 0
    if (-not $attached) {
        [void](Invoke-HetznerApi -Method POST -Path "/firewalls/$($firewall.id)/actions/apply_to_resources" -Body @{
            apply_to = @(@{ type = 'server'; server = @{ id = $server.id } })
        })
    }
    Write-Output "Updated and verified firewall $FirewallName"
} else {
    throw "Multiple Hetzner firewalls named $FirewallName exist."
}

if ($EnableProtection) {
    [void](Invoke-HetznerApi -Method POST -Path "/servers/$($server.id)/actions/change_protection" -Body @{ delete = $true; rebuild = $true })
    Write-Output 'Enabled delete and rebuild protection.'
}
if ($EnableBackups -and [string]::IsNullOrWhiteSpace([string]$server.backup_window)) {
    [void](Invoke-HetznerApi -Method POST -Path "/servers/$($server.id)/actions/enable_backup")
    Write-Output 'Enabled Hetzner backups.'
}
[void](Invoke-HetznerApi -Method PUT -Path "/servers/$($server.id)" -Body @{
    labels = @{ owner = 'majalops'; environment = 'platform'; data = 'no-customer-production' }
})

$generatedDir = Join-Path (Resolve-Path (Join-Path $PSScriptRoot '..')).Path '.generated'
New-Item -ItemType Directory -Path $generatedDir -Force | Out-Null
$ipv6 = if ($null -ne $server.public_net.ipv6) { $server.public_net.ipv6.ip } else { '' }
$generatedContent = @(
    "HETZNER_SERVER_ID=$($server.id)"
    "HETZNER_FIREWALL_ID=$($firewall.id)"
    "SERVER_NAME=$ServerName"
    "SERVER_IPV4=$($server.public_net.ipv4.ip)"
    "SERVER_IPV6=$ipv6"
    "SERVER_TYPE=$($server.server_type.name)"
    "SERVER_LOCATION=$($server.datacenter.location.name)"
) -join [Environment]::NewLine
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText(
    (Join-Path $generatedDir 'server.env'),
    "$generatedContent$([Environment]::NewLine)",
    $utf8NoBom
)

Write-Output "Hetzner configuration completed. IPv4: $($server.public_net.ipv4.ip)"
