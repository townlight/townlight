#Requires -Version 7.0
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$SignedArtifactRoot,
    [Parameter(Mandatory)][string]$ExpectedSigningRun,
    [Parameter(Mandatory)][string]$ExpectedIntakeSha256,
    [Parameter(Mandatory)][string]$ExpectedUnsignedMsiSha256,
    [Parameter(Mandatory)][string]$ExpectedMsiSha256,
    [Parameter(Mandatory)][string]$ExpectedExeSha256
)
$ErrorActionPreference = 'Stop'
foreach ($hash in @($ExpectedIntakeSha256, $ExpectedUnsignedMsiSha256, $ExpectedMsiSha256, $ExpectedExeSha256)) {
    if ($hash -cnotmatch '^[a-f0-9]{64}$') { throw 'Expected SHA256 must be lowercase hexadecimal.' }
}
if ($ExpectedSigningRun -notmatch '^[1-9][0-9]*$') { throw 'Invalid expected signing run.' }
if (-not $env:RUNNER_TEMP -or -not (Test-Path -LiteralPath $env:RUNNER_TEMP -PathType Container)) { throw 'RUNNER_TEMP is required.' }
$archivePath = Join-Path (Resolve-Path -LiteralPath $SignedArtifactRoot).ProviderPath 'signed-native-payload.zip'
$nativeName = "$ExpectedUnsignedMsiSha256.msi"
$expectedEntries = @('manifest.json', 'signing-receipt.json', $nativeName)
$archive = [IO.Compression.ZipFile]::OpenRead($archivePath)
try {
    $names = @($archive.Entries.FullName)
    if ($names.Count -ne 3 -or @($names | Select-Object -Unique).Count -ne 3) { throw 'Signed ZIP must contain exactly three unique files.' }
    foreach ($entry in $archive.Entries) {
        if ($entry.FullName -cnotin $expectedEntries -or $entry.Length -gt 2147483647 -or $entry.Length -le 0) { throw 'Unexpected or oversized signed ZIP entry.' }
    }
    $ownedRoot = Join-Path $env:RUNNER_TEMP ("ule-signed-artifact-" + [guid]::NewGuid().ToString('N'))
    [IO.Directory]::CreateDirectory($ownedRoot) | Out-Null
    foreach ($entry in $archive.Entries) {
        [IO.Compression.ZipFileExtensions]::ExtractToFile($entry, (Join-Path $ownedRoot $entry.FullName), $false)
    }
} finally { $archive.Dispose() }
$manifest = Get-Content -LiteralPath (Join-Path $ownedRoot 'manifest.json') -Raw | ConvertFrom-Json
$receipt = Get-Content -LiteralPath (Join-Path $ownedRoot 'signing-receipt.json') -Raw | ConvertFrom-Json
if ($manifest.schema_version -ne 1 -or $manifest.publication_allowed -isnot [bool] -or $manifest.publication_allowed -ne $false -or
    $receipt.publication_allowed -isnot [bool] -or $receipt.publication_allowed -ne $false) { throw 'Unsupported or publishable signing metadata.' }
if (@($manifest.files).Count -ne 1 -or @($receipt.files).Count -ne 1) { throw 'Exactly one signed MSI mapping is required.' }
$mf = $manifest.files[0]
$rf = $receipt.files[0]
if ($mf.name -cne $nativeName -or $rf.name -cne $nativeName -or $mf.unsigned_sha256 -cne $ExpectedUnsignedMsiSha256 -or
    $rf.unsigned_sha256 -cne $ExpectedUnsignedMsiSha256 -or $rf.signed_sha256 -cne $ExpectedMsiSha256 -or
    [string]$receipt.workflow_run -cne $ExpectedSigningRun -or $receipt.intake_sha256 -cne $ExpectedIntakeSha256) { throw 'Signing receipt identity or hash mismatch.' }
if ($mf.bytes -isnot [ValueType] -or $mf.bytes -le 0 -or $rf.status -cne 'Valid' -or
    $rf.subject -notmatch '(^|,\s*)CN=Scott Converse(,|$)' -or [string]::IsNullOrWhiteSpace($rf.timestamp_subject)) { throw 'Invalid signing receipt metadata.' }
if (@($mf.paths).Count -ne 1 -or @($rf.paths).Count -ne 1 -or $mf.paths[0] -cne $rf.paths[0] -or
    $mf.paths[0] -notmatch '^[^/\\:]+\.msi$' -or $mf.paths[0].Contains('..')) { throw 'Invalid original MSI path mapping.' }
$msiPath = Join-Path $ownedRoot $nativeName
$msiSha = (Get-FileHash -LiteralPath $msiPath -Algorithm SHA256).Hash.ToLowerInvariant()
if ($msiSha -cne $ExpectedMsiSha256) { throw 'Signed MSI bytes differ from expected hash.' }
$signatureVerifier = Join-Path $PSScriptRoot 'verify-publication-signature.ps1'
& $signatureVerifier -Path $msiPath *> (Join-Path $ownedRoot 'msi-signature.log')
$msiSignature = Get-AuthenticodeSignature -LiteralPath $msiPath
if ($msiSignature.SignerCertificate.Subject -cne $rf.subject -or $msiSignature.TimeStamperCertificate.Subject -cne $rf.timestamp_subject) { throw 'Actual MSI certificate metadata differs from receipt.' }
$administrativeRoot = Join-Path $ownedRoot 'administrative'
[IO.Directory]::CreateDirectory($administrativeRoot) | Out-Null
$extractionLog = Join-Path $ownedRoot 'administrative-extraction.log'
# Administrative extraction does not register or install the product.
$arguments = '/a "{0}" /qn TARGETDIR="{1}" /L*v "{2}"' -f $msiPath, $administrativeRoot, $extractionLog
$process = Start-Process -FilePath (Join-Path $env:SystemRoot 'System32/msiexec.exe') -ArgumentList $arguments -WindowStyle Hidden -Wait -PassThru
if ($process.ExitCode -ne 0) { throw "MSI administrative extraction failed: $($process.ExitCode)." }
$executables = @(Get-ChildItem -LiteralPath $administrativeRoot -Recurse -File -Filter 'townlight-desktop.exe')
if ($executables.Count -ne 1) { throw 'Expected exactly one embedded Townlight executable.' }
$exePath = $executables[0].FullName
$exeSha = (Get-FileHash -LiteralPath $exePath -Algorithm SHA256).Hash.ToLowerInvariant()
if ($exeSha -cne $ExpectedExeSha256) { throw 'Embedded signed EXE bytes differ from expected hash.' }
& $signatureVerifier -Path $exePath *> (Join-Path $ownedRoot 'exe-signature.log')
$exeSignature = Get-AuthenticodeSignature -LiteralPath $exePath
[pscustomobject][ordered]@{
    msi_path = $msiPath
    extraction_root = $ownedRoot
    archive_sha256 = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant()
    workflow_run = $ExpectedSigningRun
    intake_sha256 = $ExpectedIntakeSha256
    unsigned_msi_sha256 = $ExpectedUnsignedMsiSha256
    msi_sha256 = $msiSha
    exe_path = $exePath
    exe_sha256 = $exeSha
    signer = $msiSignature.SignerCertificate.Subject
    timestamp_subject = $msiSignature.TimeStamperCertificate.Subject
    exe_signer = $exeSignature.SignerCertificate.Subject
    exe_timestamp_subject = $exeSignature.TimeStamperCertificate.Subject
    publication_allowed = $false
}
