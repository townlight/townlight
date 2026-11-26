# SPDX-License-Identifier: AGPL-3.0-only
param([Parameter(Mandatory)][string]$ArtifactRoot)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$src='d1687e6950032352f74a2890d0b2fbce107ce131'
$run=45863660564
$sha='8845a59ed5846f7ee3bd196f290610aa5d9c14dbd0794cf99f44f09d6ee55ea8'
$msis=@(Get-ChildItem -LiteralPath $ArtifactRoot -Recurse -File -Filter *.msi)
if($msis.Count -ne 1){throw 'Expected exactly one MSI'}
$rs=@(Get-ChildItem -LiteralPath $ArtifactRoot -Recurse -File -Filter 'Townlight-signing-receipt.json')
if($rs.Count -ne 1){throw 'Expected exactly one receipt'}
$msi=$msis[0]; $r=Get-Content -LiteralPath $rs[0].FullName -Raw | ConvertFrom-Json
if($r.source_commit -ne $src){throw 'source_commit mismatch'}
if([string]$r.workflow_run -ne [string]$run){throw 'workflow_run mismatch'}
$fs=@($r.files)
$m=@($fs | Where-Object { $_.file -ceq $msi.Name })
if($m.Count -ne 1){throw 'Receipt file entry mismatch'}
if($m[0].signed_sha256 -ne $sha){throw 'signed_sha256 mismatch'}
$actual=(Get-FileHash -LiteralPath $msi.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
if($actual -ne $sha){throw 'MSI hash mismatch'}
$sig=Get-AuthenticodeSignature -LiteralPath $msi.FullName
if($sig.Status -ne 'Valid'){throw 'Invalid Authenticode signature'}
if($sig.SignerCertificate.Subject -notlike '*CN=Scott Converse*'){throw 'Signer subject mismatch'}
if($null -eq $sig.TimeStamperCertificate){throw 'Missing timestamp certificate'}
[pscustomobject]@{
  MsiPath=$msi.FullName
  SourceCommit=$r.source_commit
  Run=$r.workflow_run
  MsiSHA256=$actual
}
