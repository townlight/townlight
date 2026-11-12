# SPDX-License-Identifier: AGPL-3.0-only
# Copyright (c) The CivicSuite Authors

function Install-StationPythonDependency {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory=$true)][object]$Source,
        [Parameter(Mandatory=$true)][string]$PythonRoot,
        [Parameter(Mandatory=$true)][string]$CacheRoot
    )

    $ExpectedWheel = 'pywin32-312-cp313-cp313-win_amd64.whl'
    if ($Source.distribution -ne 'pywin32' -or $Source.version -ne '312' -or
        $Source.python_tag -ne 'cp313' -or $Source.abi_tag -ne 'cp313' -or $Source.platform_tag -ne 'win_amd64' -or
        $Source.filename -ne $ExpectedWheel -or $Source.size_bytes -ne 6914298 -or
        $Source.download_sha256 -notmatch '^[0-9a-fA-F]{64}$') {
        throw 'Station pywin32 source must match the pinned CPython 3.13 Windows x86-64 wheel contract.'
    }
    $WheelUri = [uri][string]$Source.download_url
    if ($WheelUri.Scheme -ne 'https' -or $WheelUri.DnsSafeHost -ne 'files.pythonhosted.org' -or
        [System.IO.Path]::GetFileName($WheelUri.AbsolutePath) -ne $ExpectedWheel) {
        throw 'Station pywin32 wheel URL must be the pinned HTTPS files.pythonhosted.org artifact.'
    }

    New-Item -ItemType Directory -Path $CacheRoot -Force | Out-Null
    $WheelPath = Join-Path $CacheRoot $ExpectedWheel
    $WheelSha256 = Invoke-TownlightDownload -Url $Source.download_url `
        -Destination $WheelPath -ExpectedSha256 $Source.download_sha256
    if ($WheelSha256 -ne $Source.download_sha256.ToLowerInvariant()) {
        throw "Station pywin32 wheel SHA-256 mismatch: expected $($Source.download_sha256), got $WheelSha256"
    }

    Test-StationPythonTarget -PythonRoot $PythonRoot
    $InstallArguments = Get-StationPythonInstallArguments -WheelPath $WheelPath
    Invoke-PythonPayloadCommand -PythonRoot $PythonRoot -Arguments $InstallArguments
    return [pscustomobject]@{
        status = 'installed'
        distribution = $Source.distribution
        version = $Source.version
        filename = $ExpectedWheel
        sha256 = $WheelSha256
    }
}

function Get-StationPythonInstallArguments {
    [CmdletBinding()]
    param([Parameter(Mandatory=$true)][string]$WheelPath)

    return @(
        '-m', 'pip', 'install', '--disable-pip-version-check', '--no-warn-script-location',
        '--no-index', '--no-deps', '--force-reinstall', $WheelPath
    )
}

function Test-StationPythonTarget {
    [CmdletBinding()]
    param([Parameter(Mandatory=$true)][string]$PythonRoot)

    # Keep Python code free of embedded double quotes: Windows PowerShell 5's
    # native-argument marshaller strips them while forwarding `python -c`.
    $TargetCheck = @'
import struct, sys
if sys.platform != 'win32' or sys.version_info[:2] != (3, 13) or struct.calcsize('P') != 8:
    raise SystemExit('Station pywin32 wheel requires CPython 3.13 Windows x86-64; got {} / {} / {}-bit'.format(sys.version, sys.platform, struct.calcsize('P') * 8))
'@
    Invoke-PythonPayloadCommand -PythonRoot $PythonRoot -Arguments @('-c', $TargetCheck) `
        -ExtraEnvironment @{ PYTHONDONTWRITEBYTECODE = '1' }
}

function Test-StationPythonDependencyRuntime {
    [CmdletBinding()]
    param([Parameter(Mandatory=$true)][string]$PythonRoot)

    $ReadOnlyEnvironment = @{ PYTHONDONTWRITEBYTECODE = '1' }
    Invoke-PythonPayloadCommand -PythonRoot $PythonRoot -Arguments @('-m', 'pip', 'check') `
        -ExtraEnvironment $ReadOnlyEnvironment
    $DependencyProbe = @'
import fastapi, httpx, psycopg2, pydantic, sqlalchemy, uvicorn
import win32api, win32security
token = win32security.OpenProcessToken(win32api.GetCurrentProcess(), win32security.TOKEN_QUERY)
try:
    sid = win32security.GetTokenInformation(token, win32security.TokenUser)[0]
    caller = win32security.ConvertSidToStringSid(sid)
    if not caller.startswith('S-1-'):
        raise RuntimeError('Read-only process-token SID probe returned an invalid SID')
finally:
    token.Close()
print('Station dependencies and read-only Windows process-token probe passed')
'@
    Invoke-PythonPayloadCommand -PythonRoot $PythonRoot -Arguments @('-c', $DependencyProbe) `
        -ExtraEnvironment $ReadOnlyEnvironment
    Invoke-PythonPayloadCommand -PythonRoot $PythonRoot -Arguments @('-m', 'townlight_station.cli', '--help') `
        -ExtraEnvironment $ReadOnlyEnvironment
    return [pscustomobject]@{
        pip_check = 'passed'
        declared_dependency_imports = 'passed'
        read_only_process_token_probe = 'passed'
        station_cli_help = 'passed'
    }
}
