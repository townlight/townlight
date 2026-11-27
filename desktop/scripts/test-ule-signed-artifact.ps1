#Requires -Version 7.0
$ErrorActionPreference = 'Stop'
$root = Join-Path ([IO.Path]::GetTempPath()) ('ule-artifact-fixture-' + [guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($root) | Out-Null
$oldTemp = $env:RUNNER_TEMP
$env:RUNNER_TEMP = $root
$unsigned = 'a' * 64
$signed = 'b' * 64
$intake = 'c' * 64
$exe = 'd' * 64
$scriptPath = Join-Path $PSScriptRoot 'verify-ule-signed-artifact.ps1'
$cases = @('extra-entry', 'wrong-run', 'wrong-intake', 'wrong-signed-hash', 'publishable', 'wrong-path', 'wrong-name', 'changed-msi')
try {
    foreach ($case in $cases) {
        $caseRoot = Join-Path $root $case
        [IO.Directory]::CreateDirectory($caseRoot) | Out-Null
        $entry = @{name="$unsigned.msi"; paths=@('Townlight.msi'); unsigned_sha256=$unsigned; bytes=5}
        $mapping = @{name="$unsigned.msi"; paths=@('Townlight.msi'); unsigned_sha256=$unsigned; signed_sha256=$signed; status='Valid'; subject='CN=Scott Converse'; timestamp_subject='CN=Timestamp'}
        $manifest = @{schema_version=1; publication_allowed=$false; files=@($entry)}
        $receipt = @{workflow_run='123'; intake_sha256=$intake; publication_allowed=$false; files=@($mapping)}
        switch ($case) {
            'wrong-run' { $receipt.workflow_run='124' }
            'wrong-intake' { $receipt.intake_sha256='e'*64 }
            'wrong-signed-hash' { $mapping.signed_sha256='e'*64 }
            'publishable' { $receipt.publication_allowed=$true }
            'wrong-path' { $mapping.paths=@('../Townlight.msi') }
            'wrong-name' { $entry.name='e'*64+'.msi' }
        }
        $zip = [IO.Compression.ZipFile]::Open((Join-Path $caseRoot 'signed-native-payload.zip'), [IO.Compression.ZipArchiveMode]::Create)
        try {
            $contents = @{'manifest.json'=($manifest|ConvertTo-Json -Depth 8); 'signing-receipt.json'=($receipt|ConvertTo-Json -Depth 8); "$unsigned.msi"='bytes'}
            if ($case -eq 'extra-entry') { $contents['alternate.msi']='other' }
            foreach ($name in $contents.Keys) {
                $writer=[IO.StreamWriter]::new($zip.CreateEntry($name).Open())
                try { $writer.Write($contents[$name]) } finally { $writer.Dispose() }
            }
        } finally { $zip.Dispose() }
        $caught=$null
        try { & $scriptPath -SignedArtifactRoot $caseRoot -ExpectedSigningRun '123' -ExpectedIntakeSha256 $intake -ExpectedUnsignedMsiSha256 $unsigned -ExpectedMsiSha256 $signed -ExpectedExeSha256 $exe | Out-Null }
        catch { $caught=$_.Exception.Message }
        if (-not $caught -or $caught -notmatch 'ZIP|receipt|metadata|mapping|bytes differ') { throw "Unexpected acceptance or failure for ${case}: $caught" }
        if (@(Get-ChildItem -LiteralPath $caseRoot -Recurse -Filter 'administrative-extraction.log').Count) { throw 'Rejected metadata reached extraction.' }
    }
    Write-Output "Signed artifact negative fixture: $($cases.Count) passed; no valid signature or installed acceptance claimed."
} finally { $env:RUNNER_TEMP=$oldTemp }
