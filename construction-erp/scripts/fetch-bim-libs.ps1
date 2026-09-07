# Fetch the BIM viewer's third-party libraries on Windows.
#
# Run from the construction-erp folder:
#   powershell -ExecutionPolicy Bypass -File scripts\fetch-bim-libs.ps1
#
# Run on the host, not inside the container. Docker mounts custom-addons
# read-only, so the container cannot write these files.

$ErrorActionPreference = "Stop"

$WebIfcVersion = "0.0.77"   # MPL-2.0 - https://github.com/ThatOpen/engine_web-ifc
$ThreeVersion  = "0.170.0"  # MIT     - https://github.com/mrdoob/three.js

$Root = Split-Path -Parent $PSScriptRoot
$Lib  = Join-Path $Root "custom-addons\construction_bim\static\lib"
$Tmp  = Join-Path ([System.IO.Path]::GetTempPath()) ("bimlibs-" + [guid]::NewGuid())

New-Item -ItemType Directory -Force -Path (Join-Path $Lib "web-ifc") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $Lib "three")   | Out-Null
New-Item -ItemType Directory -Force -Path $Tmp                       | Out-Null

function Get-Package {
    param($Name, $Version, $Out)

    $url = "https://registry.npmjs.org/$Name/-/$Name-$Version.tgz"
    Write-Host "==> $Name $Version"

    # Progress rendering makes Invoke-WebRequest crawl on large files.
    $previous = $ProgressPreference
    $ProgressPreference = "SilentlyContinue"
    try {
        Invoke-WebRequest -Uri $url -OutFile $Out -UseBasicParsing
    }
    finally {
        $ProgressPreference = $previous
    }

    # tar ships with Windows 10 1803 and later.
    tar -xzf $Out -C $Tmp
    if ($LASTEXITCODE -ne 0) {
        throw "could not unpack $Name"
    }
}

try {
    Get-Package "web-ifc" $WebIfcVersion (Join-Path $Tmp "web-ifc.tgz")
    Copy-Item (Join-Path $Tmp "package\web-ifc-api-iife.js") (Join-Path $Lib "web-ifc") -Force
    Copy-Item (Join-Path $Tmp "package\web-ifc.wasm")        (Join-Path $Lib "web-ifc") -Force
    Copy-Item (Join-Path $Tmp "package\LICENSE.md")          (Join-Path $Lib "web-ifc") -Force
    Remove-Item (Join-Path $Tmp "package") -Recurse -Force

    Get-Package "three" $ThreeVersion (Join-Path $Tmp "three.tgz")
    Copy-Item (Join-Path $Tmp "package\build\three.module.min.js") (Join-Path $Lib "three") -Force
    Copy-Item (Join-Path $Tmp "package\LICENSE")                   (Join-Path $Lib "three") -Force
    Remove-Item (Join-Path $Tmp "package") -Recurse -Force

    # SOURCES.md is tracked and already records these exact pinned versions.
    # Do not rewrite it here: Windows PowerShell 5 would add a UTF-8 BOM and
    # leave an otherwise clean checkout showing a modified tracked file.
    Write-Host ">> BIM libraries in $Lib"
    Write-Host ">> Reload the model page in your browser. No restart needed."
}
finally {
    if (Test-Path $Tmp) {
        Remove-Item $Tmp -Recurse -Force
    }
}
