"""Focused contract checks for the pinned Station Windows Python dependency."""
from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
HELPER = ROOT / "desktop/scripts/station-python-dependency.ps1"
PREPARE = ROOT / "desktop/scripts/prepare-runtime-payload.ps1"
SOURCES = ROOT / "desktop/runtime/windows-runtime-sources.json"


def test_station_pywin32_source_is_exact_and_used_only_for_inspections_preview() -> None:
    manifest = json.loads(SOURCES.read_text(encoding="utf-8"))
    python = manifest["sources"]["python"]
    source = python["station_pywin32"]
    assert source == {
        "distribution": "pywin32",
        "version": "312",
        "python_tag": "cp313",
        "abi_tag": "cp313",
        "platform_tag": "win_amd64",
        "filename": "pywin32-312-cp313-cp313-win_amd64.whl",
        "size_bytes": 6914298,
        "download_url": "https://files.pythonhosted.org/packages/ba/db/36a78e3403099d31d9746d13fdcde5accc43c1155f375a34d15983a479a7/pywin32-312-cp313-cp313-win_amd64.whl",
        "download_sha256": "c53e878d15a1c44788082bfe712a905433473aa38f86375b7cf8b45e3acbaaf9",
    }
    prepare = PREPARE.read_text(encoding="utf-8")
    assert "station-python-dependency.ps1" in prepare
    assert "Install-StationPythonDependency" in prepare
    assert "Test-StationPythonDependencyRuntime" in prepare
    assert "if ($ProductProfile -eq 'inspections-preview')" in prepare
    assert "'--no-deps'" in prepare


def test_station_pywin32_installer_and_read_only_runtime_probes(tmp_path: Path) -> None:
    pwsh = shutil.which("pwsh")
    if not pwsh:
        pytest.skip("PowerShell Core is required for Station dependency helper checks")

    script = tmp_path / "station-python-dependency-contract.ps1"
    script.write_text(
        r'''$ErrorActionPreference = 'Stop'
. $env:STATION_DEPENDENCY_HELPER

function Assert($Condition, $Message) {
    if (-not $Condition) { throw $Message }
}
function MustReject([scriptblock]$Action, $Message) {
    $Rejected = $false
    try { & $Action | Out-Null } catch { $Rejected = $true }
    if (-not $Rejected) { throw $Message }
}
function Get-Sha256([string]$Path) {
    return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}
function Invoke-TownlightDownload {
    param([string]$Url, [string]$Destination, [string]$ExpectedSha256)
    if ($Url -ne $script:SourceUrl) { throw "Unexpected wheel URL: $Url" }
    Copy-Item -LiteralPath $env:STATION_FAKE_WHEEL -Destination $Destination -Force
    return Get-Sha256 -Path $Destination
}
function Invoke-PythonPayloadCommand {
    param([string]$PythonRoot, [string[]]$Arguments, [hashtable]$ExtraEnvironment = @{})
    $script:Calls.Add([pscustomobject]@{ PythonRoot=$PythonRoot; Arguments=@($Arguments) })
}

$Manifest = Get-Content -LiteralPath $env:STATION_SOURCES -Raw | ConvertFrom-Json
$Source = $Manifest.sources.python.station_pywin32.PSObject.Copy()
$script:SourceUrl = [string]$Source.download_url
[System.IO.File]::WriteAllText($env:STATION_FAKE_WHEEL, 'test-only wheel bytes', [System.Text.UTF8Encoding]::new($false))
$Source.download_sha256 = Get-Sha256 -Path $env:STATION_FAKE_WHEEL
$script:Calls = [System.Collections.Generic.List[object]]::new()
$CacheRoot = Join-Path $env:STATION_TEST_ROOT 'cache'
$PythonRoot = Join-Path $env:STATION_TEST_ROOT 'python'
New-Item -ItemType Directory -Force -Path $PythonRoot | Out-Null

$Installed = Install-StationPythonDependency -Source $Source -PythonRoot $PythonRoot -CacheRoot $CacheRoot
Assert ($Installed.status -eq 'installed' -and $Installed.version -eq '312' -and
    $Installed.filename -eq 'pywin32-312-cp313-cp313-win_amd64.whl' -and
    $Installed.sha256 -eq $Source.download_sha256) 'Pinned pywin32 installation receipt is incorrect.'
Assert ($script:Calls.Count -eq 2) "Expected target check and one-wheel install, got $($script:Calls.Count) commands."
$InstallCommand = $script:Calls[1].Arguments -join ' '
Assert ($InstallCommand -match '(?i)-m pip install' -and $InstallCommand -match '--no-index' -and
    $InstallCommand -match '--no-deps' -and $InstallCommand -match '--force-reinstall' -and
    $InstallCommand -match [regex]::Escape('pywin32-312-cp313-cp313-win_amd64.whl')) 'Installer did not use only the verified pinned wheel.'

$Verification = Test-StationPythonDependencyRuntime -PythonRoot $PythonRoot
Assert ($Verification.pip_check -eq 'passed' -and $Verification.declared_dependency_imports -eq 'passed' -and
    $Verification.read_only_process_token_probe -eq 'passed' -and $Verification.station_cli_help -eq 'passed') 'Station dependency verification receipt is incomplete.'
Assert ($script:Calls.Count -eq 5) "Expected pip check, imports/token probe and CLI help; got $($script:Calls.Count - 2) verification commands."
Assert (($script:Calls[2].Arguments -join ' ') -eq '-m pip check') 'Actual runtime verifier omitted pip check.'
$Probe = $script:Calls[3].Arguments -join "`n"
foreach ($Name in @('fastapi', 'httpx', 'psycopg2', 'pydantic', 'sqlalchemy', 'uvicorn', 'win32api', 'win32security', 'OpenProcessToken', 'GetTokenInformation', 'ConvertSidToStringSid')) {
    Assert ($Probe.Contains($Name)) "Read-only Station dependency probe omitted $Name."
}
Assert (-not $Probe.Contains('SetFileSecurity')) 'Dependency probe must not mutate filesystem ACLs.'
Assert (($script:Calls[4].Arguments -join ' ') -eq '-m townlight_station.cli --help') 'Station CLI read-only help probe was not invoked.'

$BadPlatform = $Source.PSObject.Copy()
$BadPlatform.platform_tag = 'win32'
MustReject { Install-StationPythonDependency -Source $BadPlatform -PythonRoot $PythonRoot -CacheRoot (Join-Path $env:STATION_TEST_ROOT 'bad-platform') } 'Incompatible pywin32 platform was accepted.'
$BadHash = $Source.PSObject.Copy()
$BadHash.download_sha256 = '0' * 64
MustReject { Install-StationPythonDependency -Source $BadHash -PythonRoot $PythonRoot -CacheRoot (Join-Path $env:STATION_TEST_ROOT 'bad-hash') } 'Mismatched pywin32 wheel bytes were accepted.'
''',
        encoding="utf-8",
    )
    fake_wheel = tmp_path / "fake-pywin32.whl"
    env = __import__("os").environ.copy()
    env["STATION_DEPENDENCY_HELPER"] = str(HELPER)
    env["STATION_SOURCES"] = str(SOURCES)
    env["STATION_FAKE_WHEEL"] = str(fake_wheel)
    env["STATION_TEST_ROOT"] = str(tmp_path)
    result = subprocess.run(
        [pwsh, "-NoProfile", "-File", str(script)],
        capture_output=True,
        text=True,
        env=env,
        check=False,
    )
    assert result.returncode == 0, result.stdout + result.stderr
