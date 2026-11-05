# SPDX-License-Identifier: AGPL-3.0-only
# Build the portable launcher already used by accepted Windows1.7.1.1.
param([Parameter(Mandatory=$true)][string]$PythonRoot,[string]$RepoRoot='')
$ErrorActionPreference='Stop'
if(!$RepoRoot){$RepoRoot=Split-Path (Split-Path $PSScriptRoot -Parent) -Parent}
$PythonRoot=[IO.Path]::GetFullPath($PythonRoot)
$source=Join-Path $RepoRoot 'desktop/runtime/launchers/access-db-status.rs'
$launcher=Join-Path $PythonRoot 'Scripts/townlight_access-db-status.exe'
if(!(Test-Path (Join-Path $PythonRoot 'python.exe'))){throw 'Bundled Python is required'}
& rustc --edition 2021 -C opt-level=s -C panic=abort -C target-feature=+crt-static -o $launcher $source
if($LASTEXITCODE -ne 0){throw 'Portable Access launcher compilation failed'}
# Moving the complete runtime makes an absolute build-path launcher fail.
# Restore the original directory even if the actual CLI help check fails.
$relocated=$PythonRoot+'-relocation-probe'
$parentBoundary=[IO.Path]::GetFullPath((Split-Path $PythonRoot -Parent)).TrimEnd([IO.Path]::DirectorySeparatorChar)+[IO.Path]::DirectorySeparatorChar
if([IO.Path]::GetFileName($PythonRoot) -cne 'python' -or !$PythonRoot.StartsWith($parentBoundary,[StringComparison]::OrdinalIgnoreCase) -or !([IO.Path]::GetFullPath($relocated)).StartsWith($parentBoundary,[StringComparison]::OrdinalIgnoreCase)){throw 'Python relocation targets escape the named payload directory'}
if(Test-Path $relocated){throw 'Relocation target already exists; inspect it'}
Move-Item -LiteralPath $PythonRoot -Destination $relocated
try {
    $help=& (Join-Path $relocated 'Scripts/townlight_access-db-status.exe') --help
    if($LASTEXITCODE -ne 0 -or ($help -join "`n") -notmatch '--db-url'){
        throw 'Access CLI did not run from the relocated bundled interpreter'
    }
    Write-Output 'Portable Access CLI --help passed after runtime relocation.'
} finally {
    if(Test-Path $PythonRoot){throw 'Original Python directory unexpectedly reappeared; preserve both directories'}
    Move-Item -LiteralPath $relocated -Destination $PythonRoot
}
