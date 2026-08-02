[CmdletBinding()]
param(
    [string] $ServerIp = '178.105.174.55',
    [string] $SshUser = 'majaladmin',
    [int] $SshPort = 22,
    [string] $IdentityFile = 'C:\Users\hossi\.ssh\majalops_admin_20260802',
    [string] $KnownHostsFile = 'C:\Users\hossi\.ssh\known_hosts'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

foreach ($path in @($IdentityFile, $KnownHostsFile)) {
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
        throw "Required SSH file not found: $path"
    }
}

function ConvertFrom-MajalSecureString {
    param([Security.SecureString] $Value)
    $pointer = [IntPtr]::Zero
    try {
        $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Value)
        return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    } finally {
        if ($pointer -ne [IntPtr]::Zero) {
            [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
        }
    }
}

$firstSecure = Read-Host 'New password (16+; no spaces, apostrophes, or backslashes)' -AsSecureString
$secondSecure = Read-Host 'Confirm the new password' -AsSecureString
$first = $null
$second = $null
$bytes = $null
try {
    $first = ConvertFrom-MajalSecureString $firstSecure
    $second = ConvertFrom-MajalSecureString $secondSecure
    if ($first -cne $second) { throw 'The passwords do not match.' }
    if ($first.Length -lt 16) { throw 'Use at least 16 characters.' }
    if ($first.Contains("`r") -or $first.Contains("`n")) {
        throw 'The password cannot contain line breaks.'
    }
    if ($first -notmatch '^[\x21-\x26\x28-\x5B\x5D-\x7E]+$') {
        throw "Use printable English characters without spaces, apostrophes ('), or backslashes (\)."
    }

    $bytes = [Text.Encoding]::UTF8.GetBytes($first)
    $payload = [Convert]::ToBase64String($bytes)
    $sshArgs = @(
        '-p', "$SshPort", '-i', $IdentityFile,
        '-o', 'IdentitiesOnly=yes',
        '-o', 'StrictHostKeyChecking=yes',
        '-o', "UserKnownHostsFile=$KnownHostsFile",
        "$SshUser@$ServerIp",
        'sudo /opt/majalops/infrastructure/scripts/set-platform-admin-password.sh'
    )
    $payload | & ssh.exe @sshArgs
    if ($LASTEXITCODE -ne 0) { throw 'The remote password update failed.' }
    Write-Output 'Password changed. Sign in as admin@majalops.com.'
} finally {
    if ($null -ne $bytes) { [Array]::Clear($bytes, 0, $bytes.Length) }
    $payload = $null
    $first = $null
    $second = $null
    $firstSecure.Dispose()
    $secondSecure.Dispose()
}
