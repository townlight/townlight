#Requires -Version 5.1
[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$Path)
$ErrorActionPreference = 'Stop'
$signtool = Get-ChildItem 'C:\Program Files (x86)\Windows Kits\10\bin' -Recurse -Filter signtool.exe -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -match '\\x64\\' } | Sort-Object FullName -Descending | Select-Object -First 1
if (-not $signtool) { throw 'signtool.exe not found; refusing publication verification.' }
& $signtool.FullName verify /pa /v $Path
if ($LASTEXITCODE -ne 0) { throw 'signtool rejected the publication artifact.' }
$signature = Get-AuthenticodeSignature -LiteralPath $Path
if ($signature.Status -ne 'Valid') { throw 'Publication artifact signature is not Valid.' }
if ($signature.SignerCertificate.Subject -notmatch '(^|,\s*)CN=Scott Converse(,|$)') {
    throw 'Publication artifact signer is not CN=Scott Converse.'
}
if (-not $signature.TimeStamperCertificate) { throw 'Publication artifact has no timestamp certificate.' }
Write-Output "Verified publication signature: $(Split-Path $Path -Leaf)"
