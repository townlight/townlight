"""Focused PowerShell contract checks for the accepted Station media subtree."""
from __future__ import annotations

import os
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
HELPER = ROOT / "desktop/scripts/station-media-payload.ps1"


def test_station_media_payload_copy_lock_and_fail_closed_contract(tmp_path: Path) -> None:
    pwsh = shutil.which("pwsh")
    if not pwsh:
        pytest.skip("PowerShell is required for the Station payload helper contract")

    script = tmp_path / "station-payload-contract.ps1"
    script.write_text(
        r'''$ErrorActionPreference = 'Stop'
$tokens = $null
$parseErrors = $null
$PrepareAst = [System.Management.Automation.Language.Parser]::ParseFile($env:STATION_PREPARE_SCRIPT, [ref]$tokens, [ref]$parseErrors)
if ($parseErrors.Count) { throw ($parseErrors | Out-String) }
. $env:STATION_PAYLOAD_HELPER

function Assert($Condition, $Message) {
    if (-not $Condition) { throw $Message }
}
function MustReject([scriptblock]$Action, $Message) {
    $Rejected = $false
    try { & $Action | Out-Null } catch { $Rejected = $true }
    if (-not $Rejected) { throw $Message }
}
function Write-TestTree($Root) {
    $Station = Join-Path $Root 'PFiles/Townlight/_up_/runtime/payload/station'
    $Files = [ordered]@{
        'bin/ffmpeg.exe' = 'synthetic ffmpeg bytes'
        'bin/ffprobe.exe' = 'synthetic ffprobe bytes'
        'bin/FFMPEG-LICENSE.txt' = 'synthetic license text'
        'runtime/python.exe' = 'synthetic python bytes'
        'runtime/python311.dll' = 'runtime dependency'
        'media-source/civiccast/app.py' = 'synthetic media app'
        'media-source/civiccast/cli.py' = 'synthetic media cli'
        'media-source/civiccast/dependency.py' = 'preserved source dependency'
        'DELIVERY-INTEGRATIONS.md' = 'existing delivery notices'
    }
    foreach ($Entry in $Files.GetEnumerator()) {
        $Path = Join-Path $Station ($Entry.Key.Replace('/', '\'))
        New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Path) | Out-Null
        [System.IO.File]::WriteAllText($Path, [string]$Entry.Value, [System.Text.UTF8Encoding]::new($false))
    }
    return $Station
}

$Work = $env:STATION_PAYLOAD_TEST_ROOT
$Msi = Join-Path $Work 'accepted.msi'
[System.IO.File]::WriteAllText($Msi, 'synthetic signed-MSI bytes', [System.Text.UTF8Encoding]::new($false))
$MsiSha = (Get-FileHash -LiteralPath $Msi -Algorithm SHA256).Hash.ToLowerInvariant()
$Extraction = Join-Path $Work 'accepted-extraction'
$StationRoot = Write-TestTree $Extraction
$Locked = @{}
foreach ($Name in @('civiccast/app.py', 'civiccast/cli.py', 'civiccast/dependency.py')) {
    $Path = Join-Path $StationRoot ('media-source/' + $Name.Replace('/', '\'))
    $Locked[$Name] = (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}
$MediaLockRoot = Join-Path $Work 'station-source/townlight_station'
New-Item -ItemType Directory -Force -Path $MediaLockRoot | Out-Null
@{ source_commit = ('a' * 40); files = $Locked } |
    ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $MediaLockRoot 'media-lock.json') -Encoding utf8

$Source = [pscustomobject]@{
    id = 'station-media'
    label = 'Townlight Station media tools'
    archive_name = 'Townlight-Windows-x64-1.8.1.1.msi'
    download_url = 'https://example.invalid/accepted.msi'
    download_sha256 = $MsiSha
    signer_common_name = 'Scott Converse'
    payload_relative_path = 'PFiles/Townlight/_up_/runtime/payload/station'
    required_files = @(
        'bin/ffmpeg.exe', 'bin/ffprobe.exe', 'bin/FFMPEG-LICENSE.txt',
        'runtime/python.exe', 'media-source/civiccast/app.py', 'media-source/civiccast/cli.py'
    )
}
$GoodSignature = { param($Path) [pscustomobject]@{ Status='Valid'; SignerCertificate=[pscustomobject]@{ Subject='CN=Scott Converse' } } }
$NeverExtract = { param($Path, $TargetRoot) throw 'Unexpected extraction in existing-root test' }
$Payload = Join-Path $Work 'payload'
$Cache = Join-Path $Work 'cache'
$MediaLock = Join-Path $MediaLockRoot 'media-lock.json'
$First = Install-AcceptedStationMediaPayload -Source $Source -CacheRoot $Cache -PayloadRoot $Payload `
    -MediaLockPath $MediaLock -MsiPath $Msi -ExistingMsiExtractRoot $Extraction `
    -SignatureAction $GoodSignature -ExtractAction $NeverExtract
Assert ($First.status -eq 'installed' -and $First.files -eq 9 -and $First.media_lock_files -eq 3) ("Station subtree was not copied and locked: $($First | ConvertTo-Json -Depth 6 -Compress)")
$Installed = Join-Path $Payload 'station'
$FunctionNames = @('Join-TownlightPath', 'Get-Sha256', 'Get-PayloadRequiredFileLock', 'New-RuntimePayloadLock')
foreach ($FunctionName in $FunctionNames) {
    $Definition = $PrepareAst.EndBlock.Statements | Where-Object {
        $_ -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $_.Name -eq $FunctionName
    }
    if (-not $Definition) { throw "Required runtime-lock function not found: $FunctionName" }
    Invoke-Expression $Definition.Extent.Text
}
$PayloadManifest = [pscustomobject]@{ profile='windows-local-1.0'; payloads=@() }
$BuiltLock = New-RuntimePayloadLock -PayloadManifest $PayloadManifest -PayloadRoot $Payload -ProductProfile 'inspections-preview' -StationMediaSource $Source
$StationLock = @($BuiltLock.payloads | Where-Object { $_.id -eq 'station-media' })
Assert ($StationLock.Count -eq 1 -and $StationLock[0].required_files.Count -eq 6) 'Existing runtime lock builder omitted Station required files.'
foreach ($LockedFile in $StationLock[0].required_files) {
    $CopiedPath = Join-Path $Installed ($LockedFile.path.Replace('/', '\'))
    Assert ($LockedFile.sha256 -eq (Get-FileHash -LiteralPath $CopiedPath -Algorithm SHA256).Hash.ToLowerInvariant()) "Station lock hash differs: $($LockedFile.path)"
}
foreach ($Relative in @('bin/ffmpeg.exe', 'bin/ffprobe.exe', 'bin/FFMPEG-LICENSE.txt', 'runtime/python.exe',
        'runtime/python311.dll', 'media-source/civiccast/app.py', 'media-source/civiccast/cli.py',
        'media-source/civiccast/dependency.py', 'DELIVERY-INTEGRATIONS.md')) {
    $SourcePath = Join-Path $StationRoot ($Relative.Replace('/', '\'))
    $DestinationPath = Join-Path $Installed ($Relative.Replace('/', '\'))
    Assert ((Get-FileHash -LiteralPath $SourcePath -Algorithm SHA256).Hash -eq (Get-FileHash -LiteralPath $DestinationPath -Algorithm SHA256).Hash) "Copied Station bytes differ: $Relative"
}
$Second = Install-AcceptedStationMediaPayload -Source $Source -CacheRoot $Cache -PayloadRoot $Payload `
    -MediaLockPath $MediaLock -MsiPath $Msi -ExistingMsiExtractRoot $Extraction `
    -SignatureAction $GoodSignature -ExtractAction $NeverExtract
Assert ($Second.status -eq 'present') 'Matching existing Station tree is not idempotent.'

$DownloadAction = {
    param($Url, $Destination, $ExpectedSha256)
    Copy-Item -LiteralPath $Msi -Destination $Destination
    $script:StationTestDownloadCalls++
}
$script:StationTestDownloadCalls = 0
$DownloadedPayload = Join-Path $Work 'payload-downloaded'
$Downloaded = Install-AcceptedStationMediaPayload -Source $Source -CacheRoot $Cache -PayloadRoot $DownloadedPayload `
    -MediaLockPath $MediaLock -ExistingMsiExtractRoot $Extraction -SignatureAction $GoodSignature `
    -ExtractAction $NeverExtract -DownloadAction $DownloadAction
Assert ($script:StationTestDownloadCalls -eq 1 -and $Downloaded.status -eq 'installed') 'Pinned cached download path was not exercised.'

$ExtractionCalls = 0
$ExtractAction = {
    param($Path, $TargetRoot)
    $script:StationTestExtractPath = $TargetRoot
    Write-TestTree $TargetRoot | Out-Null
    $script:StationTestExtractionCalls++
    return 0
}
$script:StationTestExtractionCalls = 0
$ExtractedPayload = Join-Path $Work 'payload-extracted'
$Extracted = Install-AcceptedStationMediaPayload -Source $Source -CacheRoot $Cache -PayloadRoot $ExtractedPayload `
    -MediaLockPath $MediaLock -MsiPath $Msi -SignatureAction $GoodSignature -ExtractAction $ExtractAction
Assert ($script:StationTestExtractionCalls -eq 1 -and $Extracted.status -eq 'installed') 'Default short-path extraction flow was not exercised.'
Assert (-not (Test-Path -LiteralPath $script:StationTestExtractPath)) 'Owned short extraction target was not cleaned up.'

$WrongHash = $Source.PSObject.Copy()
$WrongHash.download_sha256 = '0' * 64
MustReject { Install-AcceptedStationMediaPayload -Source $WrongHash -CacheRoot $Cache -PayloadRoot (Join-Path $Work 'bad-hash') `
    -MediaLockPath $MediaLock -MsiPath $Msi -ExistingMsiExtractRoot $Extraction -SignatureAction $GoodSignature -ExtractAction $NeverExtract } 'Wrong MSI hash was accepted.'

$BadSignature = { param($Path) [pscustomobject]@{ Status='NotTrusted'; SignerCertificate=[pscustomobject]@{ Subject='CN=Scott Converse' } } }
MustReject { Install-AcceptedStationMediaPayload -Source $Source -CacheRoot $Cache -PayloadRoot (Join-Path $Work 'bad-signature') `
    -MediaLockPath $MediaLock -MsiPath $Msi -ExistingMsiExtractRoot $Extraction -SignatureAction $BadSignature -ExtractAction $NeverExtract } 'Invalid MSI signature was accepted.'

$OriginalLock = Get-Content -LiteralPath $MediaLock -Raw
$BrokenLock = @{ source_commit = ('a' * 40); files = @{ 'civiccast/app.py' = ('0' * 64) } } | ConvertTo-Json -Depth 8
Set-Content -LiteralPath $MediaLock -Value $BrokenLock -Encoding utf8
MustReject { Install-AcceptedStationMediaPayload -Source $Source -CacheRoot $Cache -PayloadRoot (Join-Path $Work 'bad-media-lock') `
    -MediaLockPath $MediaLock -MsiPath $Msi -ExistingMsiExtractRoot $Extraction -SignatureAction $GoodSignature -ExtractAction $NeverExtract } 'Incorrect Station media-lock bytes were accepted.'
Set-Content -LiteralPath $MediaLock -Value $OriginalLock -Encoding utf8

$IncompleteExtraction = Join-Path $Work 'incomplete-extraction'
New-Item -ItemType Directory -Force -Path $IncompleteExtraction | Out-Null
MustReject { Install-AcceptedStationMediaPayload -Source $Source -CacheRoot $Cache -PayloadRoot (Join-Path $Work 'incomplete') `
    -MediaLockPath $MediaLock -MsiPath $Msi -ExistingMsiExtractRoot $IncompleteExtraction -SignatureAction $GoodSignature -ExtractAction $NeverExtract } 'Missing MSI subtree was accepted.'
''',
        encoding="utf-8",
    )
    env = os.environ.copy()
    env["STATION_PAYLOAD_HELPER"] = str(HELPER)
    env["STATION_PREPARE_SCRIPT"] = str(ROOT / "desktop/scripts/prepare-runtime-payload.ps1")
    env["STATION_PAYLOAD_TEST_ROOT"] = str(tmp_path)
    result = subprocess.run(
        [pwsh, "-NoProfile", "-File", str(script)],
        capture_output=True,
        text=True,
        env=env,
        check=False,
    )
    assert result.returncode == 0, result.stdout + result.stderr


@pytest.mark.parametrize("host", ["powershell.exe", "pwsh.exe"])
def test_station_msi_signature_resolves_security_module_for_each_host(host: str, tmp_path: Path) -> None:
    if os.name != "nt":
        pytest.skip("Authenticode verification requires Windows")
    executable = shutil.which(host)
    if not executable:
        pytest.skip(f"{host} is not installed")

    signed_probe = Path(os.environ.get("WINDIR", r"C:\Windows")) / "System32/kernel32.dll"
    assert signed_probe.is_file(), f"Signed Windows probe file is missing: {signed_probe}"
    env = os.environ.copy()
    env["STATION_PAYLOAD_HELPER"] = str(HELPER)
    env["STATION_SIGNED_PROBE"] = str(signed_probe)
    # Exercise the explicit host-local manifest import independently of an
    # inherited module search path from the parent PowerShell/npm process.
    env["PSModulePath"] = str(tmp_path / "empty-module-path")
    command = r'''
$ErrorActionPreference = 'Stop'
. $env:STATION_PAYLOAD_HELPER
$signature = Get-StationMsiAuthenticodeSignature -Path $env:STATION_SIGNED_PROBE
if ([string]$signature.Status -ne 'Valid') { throw "Signed probe was not Valid: $($signature.Status)" }
[pscustomobject]@{ edition=$PSVersionTable.PSEdition; status=[string]$signature.Status } | ConvertTo-Json -Compress
'''
    result = subprocess.run(
        [executable, "-NoLogo", "-NoProfile", "-NonInteractive", "-Command", command],
        capture_output=True,
        text=True,
        env=env,
        check=False,
    )
    assert result.returncode == 0, result.stdout + result.stderr
    assert '"status":"Valid"' in result.stdout


def test_station_source_is_pinned_and_prepare_path_is_profile_limited() -> None:
    import json

    sources = json.loads((ROOT / "desktop/runtime/windows-runtime-sources.json").read_text(encoding="utf-8"))
    station = sources["sources"]["station_media"]
    assert station["version"] == "1.8.1.1"
    assert station["download_sha256"] == "9e9363ec5119a2ee4c0d69b4dd40b21a535571a11eb3750d57b8a24d4472a5da"
    assert station["payload_relative_path"] == "PFiles/Townlight/_up_/runtime/payload/station"
    assert len(station["required_files"]) == 6

    script = (ROOT / "desktop/scripts/prepare-runtime-payload.ps1").read_text(encoding="utf-8")
    helper = HELPER.read_text(encoding="utf-8")
    payload_manifest = json.loads((ROOT / "desktop/runtime/windows-runtime-payloads.json").read_text(encoding="utf-8"))
    assert "Install-AcceptedStationMediaPayload" in script
    assert "station-media" in script
    assert "Invoke-TownlightDownload" in helper
    assert "Get-AuthenticodeSignature" in helper
    assert "Join-Path $env:SystemRoot 'System32/msiexec.exe'" in helper
    assert "Start-Process -FilePath $Msiexec" in helper
    assert "'/a \"{0}\" /qn TARGETDIR=\"{1}\"'" in helper
    assert "Get-PayloadRequiredFileLock -PayloadRoot $PayloadRoot -Payload $StationPayload" in script
    assert len(payload_manifest["payloads"]) == 3
