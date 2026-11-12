# SPDX-License-Identifier: AGPL-3.0-only
# Copyright (c) The CivicSuite Authors
[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][string]$Python,
    [Parameter(Mandatory=$true)][string]$WheelPath,
    [Parameter(Mandatory=$true)][string]$ExpectedSha256,
    [Parameter(Mandatory=$true)][string]$ReceiptPath
)
$ErrorActionPreference = 'Stop'
if ($ExpectedSha256 -notmatch '^[a-fA-F0-9]{64}$') { throw 'An exact connector wheel SHA256 is required.' }
$Wheel = (Resolve-Path -LiteralPath $WheelPath).Path
$stream = [System.IO.File]::OpenRead($Wheel)
$hasher = [System.Security.Cryptography.SHA256]::Create()
try {
    $Actual = -join ($hasher.ComputeHash($stream) | ForEach-Object { $_.ToString('x2') })
} finally {
    $hasher.Dispose()
    $stream.Dispose()
}
if ($Actual -ne $ExpectedSha256.ToLowerInvariant()) { throw 'Connector wheel hash mismatch; nothing installed.' }
$Check = @'
import email.parser,sys,zipfile
with zipfile.ZipFile(sys.argv[1]) as wheel:
    metadata=[name for name in wheel.namelist() if name.endswith('.dist-info/METADATA')]
    assert len(metadata)==1, 'Expected one wheel distribution'
    msg=email.parser.BytesParser().parsebytes(wheel.read(metadata[0]))
    assert msg['Name'].replace('_','-')=='quorumrelay', 'Wrong connector distribution'
    assert msg['Version']=='0.1.0.dev4', 'Wrong connector version'
'@
& $Python -c $Check $Wheel
if ($LASTEXITCODE -ne 0) { throw 'Connector wheel metadata verification failed.' }
& $Python -m pip install --no-index --no-deps --force-reinstall --disable-pip-version-check $Wheel
if ($LASTEXITCODE -ne 0) { throw 'Connector wheel installation failed.' }
& $Python -c "import importlib.metadata as m; from quorumrelay import create_engine; from civic_data_connectors.legacy import legacy_previews; assert m.version('quorumrelay')=='0.1.0.dev4'; assert len(create_engine().execute('providers',{}).data['providers'])==31"
if ($LASTEXITCODE -ne 0) { throw 'Installed connector import/version/roster verification failed.' }
$Receipt = [ordered]@{
    package = 'quorumrelay'; version = '0.1.0.dev4'; schema_version = '2.0.0'
    wheel = [System.IO.Path]::GetFileName($Wheel); sha256 = $Actual
    verified_at = [DateTime]::UtcNow.ToString('o'); acceptance = 'local-development-only'
}
$Parent = Split-Path -Parent $ReceiptPath
New-Item -ItemType Directory -Force -Path $Parent | Out-Null
$Receipt | ConvertTo-Json | Set-Content -LiteralPath $ReceiptPath -Encoding utf8
