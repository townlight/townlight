# SPDX-License-Identifier: AGPL-3.0-only
# Copyright (c) The CivicSuite Authors

#Requires -Version 5.1
[CmdletBinding()]
param(
    [string]$RepoRoot = "",
    [string]$ManifestPath = "",
    [string]$PayloadManifestPath = "",
    [string]$PayloadRoot = "",
    [string]$RecordsBackendRoot = "",
    [switch]$ReuseInstalledServiceDependencies,
    [ValidateSet("records-beta", "city-core", "meetings-beta", "zoning-beta", "planning-preview", "permitting-preview", "inspections-preview")]
    [string]$ProductProfile = "records-beta",
    [string]$MeetingsRoot = "",
    [string]$CodeRoot = "",
    [string]$ZoningRoot = "",
    [string]$PlanningRoot = "",
    [string]$PermittingRoot = "",
    [string]$InspectionsRoot = "",
    [ValidateSet('planning-preview', 'planning-staff-beta', 'permitting-preview', 'inspections-preview')]
    [string]$PlanningBuildProfile = 'planning-preview',
    [switch]$SkipDownloads,
    [switch]$SkipPgvectorBuild
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot 'planning-build-contract.ps1')
. (Join-Path $PSScriptRoot 'permitting-build-contract.ps1')
. (Join-Path $PSScriptRoot 'inspections-build-contract.ps1')

if ($PlanningBuildProfile -eq 'planning-staff-beta' -and $ProductProfile -ne 'planning-preview') {
    throw 'The staff beta build requires the existing planning-preview runtime composition.'
}

if (-not $RepoRoot) {
    $RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
}

function Read-JsonFile {
    param([string]$Path)
    return Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json
}

function Write-JsonFile {
    param(
        [string]$Path,
        [object]$Value
    )
    $Parent = Split-Path -Parent $Path
    if ($Parent) {
        New-Item -ItemType Directory -Force -Path $Parent | Out-Null
    }
    $Json = $Value | ConvertTo-Json -Depth 12
    $Utf8NoBom = [System.Text.UTF8Encoding]::new($false)
    [System.IO.File]::WriteAllText($Path, "$Json`r`n", $Utf8NoBom)
}

function Install-PostgisPayload {
    param(
        [Parameter(Mandatory=$true)][object]$Source,
        [Parameter(Mandatory=$true)][string]$CacheRoot,
        [Parameter(Mandatory=$true)][string]$PayloadRoot
    )

    if (-not $Source -or -not $Source.download_url) {
        throw "Source.download_url is required."
    }
    if (-not $Source.download_sha256) {
        throw "Source.download_sha256 is required and must be nonempty."
    }

    $zipPath = Join-Path $CacheRoot 'postgis-bundle-pg17-3.6.2x64.zip'
    $ExpectedSha256 = $Source.download_sha256

    Invoke-CivicDownload -Url $Source.download_url -Destination $zipPath -ExpectedSha256 $ExpectedSha256
    $Hash = Test-CivicDownloadHash -Path $zipPath -ExpectedSha256 $ExpectedSha256 -Url $Source.download_url

    $expandRoot = Join-Path $CacheRoot 'postgis-3.6.2'
    Expand-Archive -Path $zipPath -DestinationPath $expandRoot -Force

    $bundleRoot = Join-Path $expandRoot 'postgis-bundle-pg17-3.6.2x64'
    $payloadPostgres = Join-Path $PayloadRoot 'postgres'

    foreach ($name in @('bin', 'lib', 'share')) {
        $srcDir = Join-Path $bundleRoot $name
        if (-not (Test-Path -LiteralPath $srcDir -PathType Container)) {
            throw "Missing PostGIS source directory: $srcDir"
        }
    }

    foreach ($name in @('bin', 'lib', 'share')) {
        $srcDir = Join-Path $bundleRoot $name
        $destDir = Join-Path $payloadPostgres $name
        New-Item -ItemType Directory -Path $destDir -Force | Out-Null
        Get-ChildItem -LiteralPath $srcDir -Force | Copy-Item -Destination $destDir -Recurse -Force
    }

    return @{ status = 'installed'; sha256 = $Hash; version = '3.6.2' }
}

function Get-Sha256 {
    param([string]$Path)
    $Stream = [System.IO.File]::OpenRead($Path)
    $Sha256 = [System.Security.Cryptography.SHA256]::Create()
    try {
        $HashBytes = $Sha256.ComputeHash($Stream)
        return -join ($HashBytes | ForEach-Object { $_.ToString("x2") })
    } finally {
        $Stream.Dispose()
        $Sha256.Dispose()
    }
}

function Test-CivicDownloadHash {
    param(
        [string]$Path,
        [string]$ExpectedSha256,
        [string]$Url
    )
    $ActualSha256 = Get-Sha256 -Path $Path
    if ($ExpectedSha256 -and ($ActualSha256 -ne $ExpectedSha256.ToLowerInvariant())) {
        throw "Downloaded payload hash mismatch for ${Url}: expected $ExpectedSha256, got $ActualSha256"
    }
    return $ActualSha256
}

function Join-CivicPath {
    param(
        [string]$Root,
        [string]$RelativePath
    )
    $Path = $Root
    foreach ($Part in ($RelativePath -split "[/\\]+")) {
        if ($Part) {
            $Path = Join-Path $Path $Part
        }
    }
    return $Path
}

function Get-PayloadRequiredFileLock {
    param(
        [string]$PayloadRoot,
        [object]$Payload,
        [string]$ProductProfile
    )
    $SourceRoot = Join-CivicPath -Root $PayloadRoot -RelativePath $Payload.source_dir
    $Files = @()
    $RequiredFiles = @($Payload.required_files)
    if ($Payload.profile_required_files) {
        $ProfileFiles = $Payload.profile_required_files.PSObject.Properties[$ProductProfile]
        if ($ProfileFiles) {
            $RequiredFiles += @($ProfileFiles.Value)
        }
    }
    foreach ($RequiredFile in ($RequiredFiles | Select-Object -Unique)) {
        $Path = Join-CivicPath -Root $SourceRoot -RelativePath $RequiredFile
        if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
            throw "Runtime payload $($Payload.id) is missing required file for lock: $RequiredFile"
        }
        $Item = Get-Item -LiteralPath $Path
        $Files += [ordered]@{
            path = $RequiredFile
            size_bytes = $Item.Length
            sha256 = Get-Sha256 -Path $Path
        }
    }
    return [ordered]@{
        id = $Payload.id
        label = $Payload.label
        source_dir = $Payload.source_dir
        status = "present"
        required_files = $Files
    }
}

function New-RuntimePayloadLock {
    param(
        [object]$PayloadManifest,
        [string]$PayloadRoot,
        [string]$ProductProfile
    )
    $PayloadLocks = @()
    foreach ($Payload in $PayloadManifest.payloads) {
        $PayloadLocks += Get-PayloadRequiredFileLock -PayloadRoot $PayloadRoot -Payload $Payload -ProductProfile $ProductProfile
    }
    return [ordered]@{
        schema_version = 1
        profile = $PayloadManifest.profile
        product_profile = $ProductProfile
        generated_at = (Get-Date).ToUniversalTime().ToString("o")
        payload_root = $PayloadRoot
        payloads = $PayloadLocks
    }
}

function Invoke-CivicDownload {
    param(
        [string]$Url,
        [string]$Destination,
        [string]$ExpectedSha256 = ""
    )
    if (Test-Path -LiteralPath $Destination) {
        $CachedSha256 = Get-Sha256 -Path $Destination
        if ((-not $ExpectedSha256) -or ($CachedSha256 -eq $ExpectedSha256.ToLowerInvariant())) {
            return $CachedSha256
        }
        if ($SkipDownloads) {
            throw "Cached payload hash mismatch for ${Url}: expected $ExpectedSha256, got $CachedSha256"
        }
        Remove-Item -LiteralPath $Destination -Force
    }
    if ($SkipDownloads) {
        throw "Download required but -SkipDownloads was supplied: $Url"
    }
    $Parent = Split-Path -Parent $Destination
    New-Item -ItemType Directory -Force -Path $Parent | Out-Null
    $TempDestination = "$Destination.download"
    $CurlCommand = Get-Command curl.exe -ErrorAction SilentlyContinue
    $LastError = $null
    for ($Attempt = 1; $Attempt -le 3; $Attempt++) {
        try {
            if ($CurlCommand) {
                # Keep the partial file across attempts and process restarts. The
                # portable Ollama payload is over 1 GB; restarting it from zero on
                # a transient CDN disconnect wastes both hosted-runner time and
                # bandwidth. curl's automatic offset resumes the exact same bytes.
                $CurlArguments = @(
                    "--fail",
                    "--location",
                    "--silent",
                    "--show-error",
                    "--retry", "3",
                    "--retry-delay", "2",
                    "--connect-timeout", "30",
                    "--max-time", "1800",
                    "--speed-limit", "1024",
                    "--speed-time", "60",
                    "--continue-at", "-",
                    "--output", $TempDestination,
                    "--user-agent", "CivicSuite-WindowsLocalRuntime/1.0",
                    $Url
                )
                & $CurlCommand.Source @CurlArguments
                $CurlExitCode = $LASTEXITCODE
                if ($CurlExitCode -eq 33 -and (Test-Path -LiteralPath $TempDestination)) {
                    # Exit 33 means the remote endpoint rejected the saved range.
                    # Discard only that incompatible partial and retry once from
                    # byte zero; all ordinary transient failures retain progress.
                    Remove-Item -LiteralPath $TempDestination -Force
                    & $CurlCommand.Source @CurlArguments
                    $CurlExitCode = $LASTEXITCODE
                }
                if ($CurlExitCode -ne 0) {
                    throw "curl.exe failed with exit code $CurlExitCode while downloading $Url"
                }
            } else {
                # Compatibility fallback for older Windows build hosts. It cannot
                # resume, so never feed Invoke-WebRequest a partial curl artifact.
                if (Test-Path -LiteralPath $TempDestination) {
                    Remove-Item -LiteralPath $TempDestination -Force
                }
                Invoke-WebRequest -Uri $Url -OutFile $TempDestination -UseBasicParsing -TimeoutSec 1800 -Headers @{ "User-Agent" = "CivicSuite-WindowsLocalRuntime/1.0" }
            }
            Move-Item -LiteralPath $TempDestination -Destination $Destination -Force
            return Test-CivicDownloadHash -Path $Destination -ExpectedSha256 $ExpectedSha256 -Url $Url
        } catch {
            $LastError = $_
            if ($ExpectedSha256 -and (Test-Path -LiteralPath $Destination)) {
                $FailedSha256 = Get-Sha256 -Path $Destination
                if ($FailedSha256 -ne $ExpectedSha256.ToLowerInvariant()) {
                    Remove-Item -LiteralPath $Destination -Force -ErrorAction SilentlyContinue
                }
            }
            if ($Attempt -lt 3) {
                Start-Sleep -Seconds ([Math]::Min(10, [Math]::Pow(2, $Attempt)))
            }
        }
    }
    throw $LastError
}

function Invoke-CivicRestMethod {
    param(
        [string]$Uri,
        [string]$Label,
        [hashtable]$Headers = @{ "User-Agent" = "CivicSuite-WindowsLocalRuntime/1.0" }
    )
    $LastError = $null
    for ($Attempt = 1; $Attempt -le 5; $Attempt++) {
        try {
            return Invoke-RestMethod -Uri $Uri -Headers $Headers -TimeoutSec 30 -ErrorAction Stop
        } catch {
            $LastError = $_
            if ($Attempt -lt 5) {
                Start-Sleep -Seconds ([Math]::Min(30, [Math]::Pow(2, $Attempt)))
            }
        }
    }
    throw "$Label failed after 5 attempts: $($LastError.Exception.Message)"
}

function Expand-CivicZip {
    param(
        [string]$Archive,
        [string]$Destination
    )
    if (Test-Path -LiteralPath $Destination) {
        Remove-Item -LiteralPath $Destination -Recurse -Force
    }
    New-Item -ItemType Directory -Force -Path $Destination | Out-Null
    Expand-Archive -LiteralPath $Archive -DestinationPath $Destination -Force
}

function Expand-PostgresServerPayload {
    param(
        [string]$Archive,
        [string]$Destination
    )
    if (Test-Path -LiteralPath $Destination) {
        Remove-Item -LiteralPath $Destination -Recurse -Force
    }
    New-Item -ItemType Directory -Force -Path $Destination | Out-Null

    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $DestinationRoot = [System.IO.Path]::GetFullPath($Destination)
    $ServerDirectories = @("bin", "include", "lib", "share")
    $ServerFiles = @("server_license.txt", "commandlinetools_3rd_party_licenses.txt")
    $Zip = [System.IO.Compression.ZipFile]::OpenRead($Archive)
    try {
        foreach ($Entry in $Zip.Entries) {
            $NormalizedName = $Entry.FullName -replace "\\", "/"
            if (-not $NormalizedName.StartsWith("pgsql/", [System.StringComparison]::OrdinalIgnoreCase)) {
                continue
            }
            $RelativeName = $NormalizedName.Substring(6)
            if (-not $RelativeName) {
                continue
            }
            $FirstSegment = ($RelativeName -split "/", 2)[0]
            if (($ServerDirectories -notcontains $FirstSegment) -and ($ServerFiles -notcontains $RelativeName)) {
                continue
            }
            $Target = Join-Path $Destination ($RelativeName -replace "/", "\")
            $TargetPath = [System.IO.Path]::GetFullPath($Target)
            if (-not $TargetPath.StartsWith($DestinationRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
                throw "PostgreSQL archive contains an unsafe path: $($Entry.FullName)"
            }
            if ($NormalizedName.EndsWith("/")) {
                New-Item -ItemType Directory -Force -Path $TargetPath | Out-Null
                continue
            }
            $Parent = Split-Path -Parent $TargetPath
            if ($Parent) {
                New-Item -ItemType Directory -Force -Path $Parent | Out-Null
            }
            [System.IO.Compression.ZipFileExtensions]::ExtractToFile($Entry, $TargetPath, $true)
        }
    } finally {
        $Zip.Dispose()
    }

    foreach ($RequiredFile in @("bin\pg_ctl.exe", "bin\initdb.exe", "bin\postgres.exe", "share\postgresql.conf.sample")) {
        if (-not (Test-Path -LiteralPath (Join-Path $Destination $RequiredFile))) {
            throw "PostgreSQL server payload missing required file after extraction: $RequiredFile"
        }
    }
}

function Get-MsvcDevCmdPath {
    $VsWhereCandidates = @(
        "C:\Program Files (x86)\Microsoft Visual Studio\Installer\vswhere.exe"
    )
    $VsWhereCommand = Get-Command vswhere.exe -ErrorAction SilentlyContinue
    if ($VsWhereCommand) {
        $VsWhereCandidates += $VsWhereCommand.Source
    }
    foreach ($VsWhere in $VsWhereCandidates | Select-Object -Unique) {
        if (-not (Test-Path -LiteralPath $VsWhere)) {
            continue
        }
        $InstallPath = & $VsWhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
        if ($InstallPath) {
            $DevCmd = Join-Path $InstallPath "Common7\Tools\VsDevCmd.bat"
            if (Test-Path -LiteralPath $DevCmd) {
                return $DevCmd
            }
        }
    }
    return $null
}

function Get-VcRuntimeRedistDir {
    # Locate the x64 Visual C++ runtime redistributable folder (Microsoft.VC*.CRT)
    # shipped with the installed Visual Studio / Build Tools. These DLLs are
    # redistributable and are what the portable EnterpriseDB PostgreSQL binaries
    # link against but do NOT ship (the EDB *installer* normally lays down the
    # VC++ redist; the portable ZIP extraction skips it).
    $VsWhereCandidates = @(
        "C:\Program Files (x86)\Microsoft Visual Studio\Installer\vswhere.exe"
    )
    $VsWhereCommand = Get-Command vswhere.exe -ErrorAction SilentlyContinue
    if ($VsWhereCommand) {
        $VsWhereCandidates += $VsWhereCommand.Source
    }
    foreach ($VsWhere in $VsWhereCandidates | Select-Object -Unique) {
        if (-not (Test-Path -LiteralPath $VsWhere)) {
            continue
        }
        $InstallPath = & $VsWhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
        if (-not $InstallPath) {
            continue
        }
        $RedistRoot = Join-Path $InstallPath "VC\Redist\MSVC"
        if (-not (Test-Path -LiteralPath $RedistRoot)) {
            continue
        }
        $CrtDir = Get-ChildItem -LiteralPath $RedistRoot -Recurse -Directory -Filter "Microsoft.VC*.CRT" -ErrorAction SilentlyContinue |
            Where-Object { $_.FullName -match "\\x64\\" } |
            Sort-Object FullName -Descending |
            Select-Object -First 1
        if ($CrtDir -and (Test-Path -LiteralPath (Join-Path $CrtDir.FullName "vcruntime140.dll"))) {
            return $CrtDir.FullName
        }
    }
    return $null
}

function Copy-PostgresVcRuntime {
    # Stage the VC++ runtime DLLs next to the PostgreSQL binaries so pg_ctl.exe /
    # initdb.exe / postgres.exe start on a clean Windows machine that has no
    # system-wide VC++ redistributable (e.g. a fresh clerk PC or Windows Sandbox).
    # Windows resolves an EXE's imports from its own directory first, so placing
    # the DLLs in postgres\bin is sufficient and self-contained.
    param([string]$PostgresRoot)
    $BinDir = Join-Path $PostgresRoot "bin"
    if (-not (Test-Path -LiteralPath $BinDir)) {
        throw "PostgreSQL bin directory not found for VC++ runtime staging: $BinDir"
    }
    $Essential = @("vcruntime140.dll", "vcruntime140_1.dll", "msvcp140.dll")
    $Present = @($Essential | Where-Object { Test-Path -LiteralPath (Join-Path $BinDir $_) })
    if ($Present.Count -eq $Essential.Count) {
        return [ordered]@{ status = "present"; dlls = $Present }
    }
    $CrtDir = Get-VcRuntimeRedistDir
    if (-not $CrtDir) {
        throw "Could not locate the x64 Visual C++ runtime redistributable (Microsoft.VC*.CRT) via vswhere. The bundled PostgreSQL requires VCRUNTIME140.dll et al. to start on a clean machine; install the 'Desktop development with C++' workload or the VC++ redistributable in the build environment."
    }
    $Copied = @()
    foreach ($Dll in (Get-ChildItem -LiteralPath $CrtDir -Filter *.dll)) {
        Copy-Item -LiteralPath $Dll.FullName -Destination (Join-Path $BinDir $Dll.Name) -Force
        $Copied += $Dll.Name
    }
    foreach ($Required in $Essential) {
        if (-not (Test-Path -LiteralPath (Join-Path $BinDir $Required))) {
            throw "VC++ runtime staging did not produce required $Required in $BinDir (source: $CrtDir)"
        }
    }
    return [ordered]@{ status = "installed"; source = $CrtDir; dlls = $Copied }
}

function Copy-PythonVcRuntime {
    # The embedded CPython distribution ships vcruntime140.dll (and _1) but NOT
    # msvcp140.dll. Native extensions built with the C++ runtime need it:
    # greenlet's _greenlet.cp313-win_amd64.pyd fails to load without it, which
    # aborts SQLAlchemy's async engine and therefore every city-core migration on
    # a clean machine with no system-wide VC++ redistributable. v1.0.2 shipped
    # this way. Stage the same CRT set next to python.exe, which Windows resolves
    # first for that process and its extension modules.
    param([string]$PythonRoot)
    if (-not (Test-Path -LiteralPath $PythonRoot)) {
        throw "Python payload directory not found for VC++ runtime staging: $PythonRoot"
    }
    $Essential = @("vcruntime140.dll", "vcruntime140_1.dll", "msvcp140.dll")
    $Present = @($Essential | Where-Object { Test-Path -LiteralPath (Join-Path $PythonRoot $_) })
    if ($Present.Count -eq $Essential.Count) {
        return [ordered]@{ status = "present"; dlls = $Present }
    }
    $CrtDir = Get-VcRuntimeRedistDir
    if (-not $CrtDir) {
        throw "Could not locate the x64 Visual C++ runtime redistributable (Microsoft.VC*.CRT) via vswhere. The embedded Python requires msvcp140.dll for native extensions (greenlet) to import on a clean machine."
    }
    # Copy the whole CRT redist set (same as Copy-PostgresVcRuntime) rather than a
    # hand-maintained allowlist: a future native wheel that links an additional CRT
    # DLL (msvcp140_1.dll, concrt140.dll, ...) would otherwise silently reproduce
    # the exact clean-machine import failure F-A11Y-3 was. $Essential is only the
    # post-copy verification floor.
    $Copied = @()
    foreach ($Dll in (Get-ChildItem -LiteralPath $CrtDir -Filter *.dll)) {
        Copy-Item -LiteralPath $Dll.FullName -Destination (Join-Path $PythonRoot $Dll.Name) -Force
        $Copied += $Dll.Name
    }
    foreach ($Required in $Essential) {
        if (-not (Test-Path -LiteralPath (Join-Path $PythonRoot $Required))) {
            throw "VC++ runtime staging did not produce required $Required in $PythonRoot (source: $CrtDir)"
        }
    }
    return [ordered]@{ status = "installed"; source = $CrtDir; dlls = $Copied }
}

function Invoke-PgvectorBuild {
    param(
        [string]$SourceDir,
        [string]$PostgresRoot
    )
    $HasMsvcPath = (Get-Command cl.exe -ErrorAction SilentlyContinue) -and
        (Get-Command nmake.exe -ErrorAction SilentlyContinue)
    $DevCmd = Get-MsvcDevCmdPath
    if ((-not $HasMsvcPath) -and (-not $DevCmd)) {
        throw "MSVC cl.exe and nmake.exe are required to build pgvector for the Windows payload."
    }

    Push-Location $SourceDir
    try {
        $StdoutPath = [System.IO.Path]::GetTempFileName()
        $StderrPath = [System.IO.Path]::GetTempFileName()
        if ($DevCmd) {
            $BuildCommand = "call `"$DevCmd`" -arch=x64 -host_arch=x64 >nul && set `"PGROOT=$PostgresRoot`" && nmake /F Makefile.win && nmake /F Makefile.win install"
        } else {
            $BuildCommand = "set `"PGROOT=$PostgresRoot`" && nmake /F Makefile.win && nmake /F Makefile.win install"
        }
        $Process = Start-Process `
            -FilePath "cmd.exe" `
            -ArgumentList @("/D", "/S", "/C", $BuildCommand) `
            -WorkingDirectory $SourceDir `
            -NoNewWindow `
            -Wait `
            -PassThru `
            -RedirectStandardOutput $StdoutPath `
            -RedirectStandardError $StderrPath
        $BuildExitCode = $Process.ExitCode
        Get-Content -LiteralPath $StdoutPath -ErrorAction SilentlyContinue | ForEach-Object { Write-Host $_ }
        Get-Content -LiteralPath $StderrPath -ErrorAction SilentlyContinue | ForEach-Object { Write-Host $_ }
        if ($BuildExitCode -ne 0) {
            throw "pgvector build failed with exit code $BuildExitCode"
        }
    } finally {
        if ($StdoutPath -and (Test-Path -LiteralPath $StdoutPath)) {
            Remove-Item -LiteralPath $StdoutPath -Force -ErrorAction SilentlyContinue
        }
        if ($StderrPath -and (Test-Path -LiteralPath $StderrPath)) {
            Remove-Item -LiteralPath $StderrPath -Force -ErrorAction SilentlyContinue
        }
        Pop-Location
    }
}

function Get-PostgresBinaryUrl {
    param(
        [string]$DownloadPage,
        [int]$MajorVersion
    )
    if ($SkipDownloads) {
        throw "PostgreSQL download discovery requires network access."
    }
    $Html = (Invoke-WebRequest -Uri $DownloadPage -UseBasicParsing).Content
    $Normalized = $Html -replace "`r", "" -replace "&amp;", "&" -replace "\\/", "/"
    $Pattern = "(?is)Binaries\s+from\s+installer.*?Version\s*(?:<!--\s*-->\s*)?" +
        [regex]::Escape([string]$MajorVersion) +
        "\.\d+.*?<a\s+href=[""'](?<url>https?://sbp\.enterprisedb\.com/getfile\.jsp\?fileid=\d+)[""'][^>]*>\s*<img[^>]+alt=[""']Windows\s+x86-64[""']"
    $Match = [regex]::Match($Normalized, $Pattern)
    if ($Match.Success) {
        return $Match.Groups["url"].Value
    }
    throw "Could not discover PostgreSQL $MajorVersion Windows binary URL from $DownloadPage"
}

function Get-PostgresSourceUrl {
    param([object]$Source)
    if ($Source.download_url) {
        return [string]$Source.download_url
    }
    return Get-PostgresBinaryUrl -DownloadPage $Source.download_page -MajorVersion $Source.major_version
}

function Install-PostgresPayload {
    param(
        [object]$Source,
        [string]$CacheRoot,
        [string]$PayloadRoot
    )
    $Destination = Join-Path $PayloadRoot "postgres"
    if (Test-Path -LiteralPath (Join-Path $Destination "bin\pg_ctl.exe")) {
        return @{ status = "present"; path = $Destination }
    }
    $Url = Get-PostgresSourceUrl -Source $Source
    $Archive = Join-Path $CacheRoot "postgres-windows-binaries.zip"
    $ExpectedSha256 = ""
    if ($Source.download_sha256) {
        $ExpectedSha256 = [string]$Source.download_sha256
    }
    try {
        $Sha = Invoke-CivicDownload -Url $Url -Destination $Archive -ExpectedSha256 $ExpectedSha256
    } catch {
        if (-not $Source.download_page) {
            throw
        }
        Write-Warning "Direct PostgreSQL binary download failed; falling back to PostgreSQL download-page discovery. $($_.Exception.Message)"
        $FallbackUrl = Get-PostgresBinaryUrl -DownloadPage $Source.download_page -MajorVersion $Source.major_version
        if ($FallbackUrl -eq $Url) {
            throw
        }
        $Url = $FallbackUrl
        $Sha = Invoke-CivicDownload -Url $Url -Destination $Archive -ExpectedSha256 $ExpectedSha256
    }
    Expand-PostgresServerPayload -Archive $Archive -Destination $Destination
    return @{ status = "installed"; url = $Url; sha256 = $Sha; path = $Destination }
}

function Install-PythonPayload {
    param(
        [object]$Source,
        [string]$CacheRoot,
        [string]$PayloadRoot,
        [string]$RepoRoot,
        [string]$ProductProfile
    )
    $Destination = Join-Path $PayloadRoot "python"
    $Status = "present"
    if (Test-Path -LiteralPath (Join-Path $Destination "python.exe")) {
        $Sha = $null
    } else {
        $Archive = Join-Path $CacheRoot ("python-{0}-embed-amd64.zip" -f $Source.version)
        $Sha = Invoke-CivicDownload -Url $Source.download_url -Destination $Archive
        Expand-CivicZip -Archive $Archive -Destination $Destination
        $Pth = Join-Path $Destination $Source.pth_file
        if (Test-Path -LiteralPath $Pth) {
            $Content = Get-Content -LiteralPath $Pth
            $Content = $Content | ForEach-Object {
                if ($_ -eq "#import site") { "import site" } else { $_ }
            }
            $Content | Set-Content -LiteralPath $Pth -Encoding ASCII
        }
        $Status = "installed"
    }
    New-Item -ItemType Directory -Force -Path (Join-Path $Destination "Lib\site-packages") | Out-Null
    Write-PythonNoUserSiteGuard -PythonRoot $Destination
    $Packages = Install-PythonServicePackages -Source $Source -CacheRoot $CacheRoot -PythonRoot $Destination -RepoRoot $RepoRoot -ProductProfile $ProductProfile
    $Result = @{
        status = $Status
        url = $Source.download_url
        path = $Destination
        packages = $Packages
    }
    if ($Sha) {
        $Result.sha256 = $Sha
    }
    return $Result
}

function Write-PythonNoUserSiteGuard {
    param([string]$PythonRoot)
    $SitePackages = Join-Path $PythonRoot "Lib\site-packages"
    New-Item -ItemType Directory -Force -Path $SitePackages | Out-Null
    @'
"""Keep the CivicSuite embedded runtime isolated from user Python packages."""

from __future__ import annotations

import os
import site
import sys

site.ENABLE_USER_SITE = False

try:
    _user_site = site.getusersitepackages()
except Exception:
    _user_site = None

if _user_site:
    _normalized_user_site = os.path.normcase(os.path.abspath(_user_site))
    sys.path[:] = [
        path
        for path in sys.path
        if os.path.normcase(os.path.abspath(path)) != _normalized_user_site
        and not os.path.normcase(os.path.abspath(path)).startswith(_normalized_user_site + os.sep)
    ]
'@ | Set-Content -LiteralPath (Join-Path $SitePackages "sitecustomize.py") -Encoding UTF8
}

function Invoke-PythonPayloadCommand {
    param(
        [string]$PythonRoot,
        [string[]]$Arguments,
        [hashtable]$ExtraEnvironment = @{}
    )
    $Python = Join-Path $PythonRoot "python.exe"
    if (-not (Test-Path -LiteralPath $Python)) {
        throw "Embedded Python was not found at $Python"
    }
    if (-not $ExtraEnvironment.ContainsKey("PYTHONNOUSERSITE")) {
        $ExtraEnvironment["PYTHONNOUSERSITE"] = "1"
    }
    $PreviousValues = @{}
    foreach ($Name in $ExtraEnvironment.Keys) {
        $PreviousValues[$Name] = [Environment]::GetEnvironmentVariable($Name, "Process")
        [Environment]::SetEnvironmentVariable($Name, [string]$ExtraEnvironment[$Name], "Process")
    }
    $PreviousErrorActionPreference = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        $Output = & $Python @Arguments 2>&1
        $ExitCode = $LASTEXITCODE
        $Output | ForEach-Object { Write-Host $_ }
        if ($ExitCode -ne 0) {
            throw "Embedded Python command failed with exit code ${ExitCode}: $($Arguments -join ' ')"
        }
    } finally {
        $ErrorActionPreference = $PreviousErrorActionPreference
        foreach ($Name in $ExtraEnvironment.Keys) {
            [Environment]::SetEnvironmentVariable($Name, $PreviousValues[$Name], "Process")
        }
    }
}

function Ensure-PythonPip {
    param(
        [object]$Source,
        [string]$CacheRoot,
        [string]$PythonRoot
    )
    $Python = Join-Path $PythonRoot "python.exe"
    $PreviousErrorActionPreference = $ErrorActionPreference
    $PreviousNoUserSite = [Environment]::GetEnvironmentVariable("PYTHONNOUSERSITE", "Process")
    $ErrorActionPreference = "Continue"
    try {
        [Environment]::SetEnvironmentVariable("PYTHONNOUSERSITE", "1", "Process")
        & $Python -c "import pip" 1>$null 2>$null
        $PipExitCode = $LASTEXITCODE
    } finally {
        [Environment]::SetEnvironmentVariable("PYTHONNOUSERSITE", $PreviousNoUserSite, "Process")
        $ErrorActionPreference = $PreviousErrorActionPreference
    }
    if ($PipExitCode -eq 0) {
        return @{ status = "present" }
    }
    $GetPip = Join-Path $CacheRoot "get-pip.py"
    $Sha = Invoke-CivicDownload -Url $Source.get_pip_url -Destination $GetPip
    Invoke-PythonPayloadCommand -PythonRoot $PythonRoot -Arguments @(
        $GetPip,
        "--no-warn-script-location",
        "--disable-pip-version-check"
    )
    return @{ status = "installed"; url = $Source.get_pip_url; sha256 = $Sha }
}

function Test-PythonServiceImports {
    param(
        [string]$PythonRoot,
        [string]$ProductProfile
    )
    $ImportNames = @(
        "civiccore",
        "app.main",
        "civicnotice.main",
        "civicaccess.main",
        "civicsuite_runtime.services",
        "civicsuite_runtime.migrate"
    )
    if ($ProductProfile -in @("city-core", "zoning-beta", "planning-preview", "permitting-preview", "inspections-preview")) {
        $ImportNames += @("civicclerk.main", "civiccode.main")
    }
    if ($ProductProfile -in @("zoning-beta", "planning-preview", "permitting-preview", "inspections-preview")) {
        $ImportNames += @("civiczone.connected_sources", "civicsuite_runtime.zoning_bridge", "civicsuite_runtime.zoning_records")
    }
    if ($ProductProfile -in @("planning-preview", "permitting-preview", "inspections-preview")) {
        $ImportNames += @("civicplan.migrations", "civicplan.workflow_store", "civicsuite_runtime.planning_bridge", "app.requests.planning_sources")
    }
    if ($ProductProfile -eq "meetings-beta") {
        $ImportNames += @(
            "civicclerk.main",
            "civicclerk.desktop_delivery",
            "civicclerk.records_sources",
            "civicsuite_runtime.meetings_bridge"
        )
    }
    $ImportCsv = $ImportNames -join ","
    $ImportScript = @"
import importlib
import os
os.environ.setdefault('TESTING', 'true')
os.environ.setdefault('PORTAL_MODE', 'private')
os.environ.setdefault('TOWNLIGHT_PRODUCT_PROFILE', '$ProductProfile')
os.environ.setdefault('DATABASE_URL', 'postgresql+asyncpg://civicsuite:civicsuite@127.0.0.1:15432/civicsuite')
for name in '$ImportCsv'.split(','):
    importlib.import_module(name)
print('Townlight embedded Python service imports verified for $ProductProfile')
"@
    Invoke-PythonPayloadCommand -PythonRoot $PythonRoot -Arguments @("-c", $ImportScript)
}

function Copy-CivicRecordsMigrations {
    param(
        [string]$PythonRoot,
        [string]$RepoRoot
    )
    $SourceRoot = if ($RecordsBackendRoot) { (Resolve-Path $RecordsBackendRoot).Path } else { (Resolve-Path (Join-Path $RepoRoot "..\civicrecords-ai\backend")).Path }
    $Destination = Join-Path $PythonRoot "Lib\site-packages\civicsuite_runtime\civicrecords_alembic"
    $DestinationRoot = [System.IO.Path]::GetFullPath((Join-Path $PythonRoot "Lib\site-packages\civicsuite_runtime"))
    $DestinationPath = [System.IO.Path]::GetFullPath($Destination)
    if (-not $DestinationPath.StartsWith($DestinationRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to reset Townlight Records migration payload outside embedded runtime: $DestinationPath"
    }
    if (Test-Path -LiteralPath $DestinationPath) {
        Remove-Item -LiteralPath $DestinationPath -Recurse -Force
    }
    New-Item -ItemType Directory -Force -Path $DestinationPath | Out-Null
    Copy-Item -LiteralPath (Join-Path $SourceRoot "alembic.ini") -Destination (Join-Path $DestinationPath "alembic.ini") -Force
    Copy-Item -LiteralPath (Join-Path $SourceRoot "alembic") -Destination (Join-Path $DestinationPath "alembic") -Recurse -Force
}

function Install-PythonServicePackages {
    param(
        [object]$Source,
        [string]$CacheRoot,
        [string]$PythonRoot,
        [string]$RepoRoot,
        [string]$ProductProfile
    )
    $PipStatus = Ensure-PythonPip -Source $Source -CacheRoot $CacheRoot -PythonRoot $PythonRoot
    $CivicRecords = if ($RecordsBackendRoot) { (Resolve-Path $RecordsBackendRoot).Path } else { (Resolve-Path (Join-Path $RepoRoot "..\civicrecords-ai\backend")).Path }
    $RuntimeBridge = (Resolve-Path (Join-Path $RepoRoot "desktop\runtime\python-services")).Path

    $ServicePackages = @($CivicRecords, $RuntimeBridge)
    if (-not $ReuseInstalledServiceDependencies) {
        $CivicCore = (Resolve-Path (Join-Path $RepoRoot "..\civiccore")).Path
        $CivicNotice = (Resolve-Path (Join-Path $RepoRoot "..\civicnotice")).Path
        $CivicAccess = (Resolve-Path (Join-Path $RepoRoot "..\civicaccess")).Path
        $ServicePackages += @($CivicNotice, $CivicAccess)
    }
    if ($ProductProfile -in @("city-core", "zoning-beta", "planning-preview", "permitting-preview", "inspections-preview")) {
        $CivicClerk = if ($MeetingsRoot) { (Resolve-Path $MeetingsRoot).Path } else { (Resolve-Path (Join-Path $RepoRoot "..\civicclerk")).Path }
        $CivicCode = if ($CodeRoot) { (Resolve-Path $CodeRoot).Path } else { (Resolve-Path (Join-Path $RepoRoot "..\civiccode")).Path }
        $ServicePackages += @($CivicClerk, $CivicCode)
    }
    if ($ProductProfile -in @("zoning-beta", "planning-preview", "permitting-preview", "inspections-preview")) {
        $CivicZone = if ($ZoningRoot) { (Resolve-Path $ZoningRoot).Path } else { (Resolve-Path (Join-Path $RepoRoot "..\zone")).Path }
        $ServicePackages += @($CivicZone)
    }
    $DevelopmentSources = @()
    if ($ProductProfile -in @("planning-preview", "permitting-preview", "inspections-preview")) {
        if (-not $PlanningRoot -or -not $RecordsBackendRoot) { throw "planning-preview requires explicit PlanningRoot and RecordsBackendRoot candidate sources." }
        if ($ReuseInstalledServiceDependencies) { throw 'Planning candidate provenance requires all pinned service sources; do not reuse unproven installed dependencies.' }
        $CivicPlan = (Resolve-Path $PlanningRoot).Path
        $PlanningBuild = if ($ProductProfile -eq 'inspections-preview') { Get-InspectionsBuildContract -RepoRoot $RepoRoot } elseif ($ProductProfile -in @('permitting-preview', 'inspections-preview')) { Get-PermittingBuildContract -RepoRoot $RepoRoot } else { Get-PlanningBuildContract -Profile $PlanningBuildProfile -RepoRoot $RepoRoot }
        $CandidatePins = $PlanningBuild.Pins
        $SourceRoots = [ordered]@{
            'townlight/core' = $CivicCore; 'townlight/sunshine' = $CivicRecords
            'townlight/meetings' = $CivicClerk; 'townlight/ordinances' = $CivicCode
            'townlight/zone' = $CivicZone; 'townlight/plan' = $CivicPlan
            'townlight/notice' = $CivicNotice; 'townlight/access' = $CivicAccess
        }
        $CandidateSourceRoots = @($CivicRecords, $CivicPlan)
        if ($ProductProfile -in @('permitting-preview', 'inspections-preview')) {
            if (-not $PermittingRoot -or $PlanningBuildProfile -ne $ProductProfile) { throw 'Explicit Permitting source/build profile required.' }
            $CivicPermit = (Resolve-Path $PermittingRoot).Path
            $SourceRoots['townlight/permit'] = $CivicPermit
            $CandidateSourceRoots += $CivicPermit
        }
        if ($ProductProfile -eq 'inspections-preview') {
            if (-not $InspectionsRoot -or $PlanningBuildProfile -ne 'inspections-preview') { throw 'Explicit Inspections source/build profile required.' }
            $CivicInspect = (Resolve-Path $InspectionsRoot).Path
            $SourceRoots['townlight/inspect'] = $CivicInspect
            $CandidateSourceRoots += $CivicInspect
            $InspectionTranscriber = Join-Path $CivicInspect 'inspection-transcriber'
            if (-not (Test-Path -LiteralPath (Join-Path $InspectionTranscriber 'pyproject.toml'))) { throw 'Pinned Inspections source is missing its accepted transcription package.' }
            $CandidateSourceRoots += $InspectionTranscriber
        }
        foreach ($Repository in $SourceRoots.Keys) {
            $CandidateSource = $SourceRoots[$Repository]
            $Commit = (& git -C $CandidateSource rev-parse HEAD).Trim()
            $Dirty = & git -C $CandidateSource status --porcelain --untracked-files=normal
            if ($LASTEXITCODE -ne 0 -or $Dirty -or $Commit -ne $CandidatePins.sources.$Repository) { throw "Planning source must be clean at its explicit build pin: $Repository" }
            $DevelopmentSources += @{ repository = $Repository; source_commit = $Commit }
        }
        Invoke-PythonPayloadCommand -PythonRoot $PythonRoot -Arguments @('-m', 'pip', 'install', '--disable-pip-version-check', '--no-warn-script-location', 'setuptools>=68', 'wheel', 'hatchling>=1.27.0')
        $WheelRoot = Join-Path $CacheRoot ("planning-candidate-" + [guid]::NewGuid().ToString('N'))
        New-Item -ItemType Directory -Force -Path $WheelRoot | Out-Null
        foreach ($CandidateSource in $CandidateSourceRoots) {
            $Commit = (& git -C $CandidateSource rev-parse HEAD).Trim()
            if ($LASTEXITCODE -ne 0 -or $Commit -notmatch '^[0-9a-f]{40}$') { throw "Candidate source must have a Git commit." }
            $Dirty = & git -C $CandidateSource status --porcelain --untracked-files=normal
            if ($LASTEXITCODE -ne 0 -or $Dirty) { throw "Commit candidate source before packaging: $CandidateSource" }
            Invoke-PythonPayloadCommand -PythonRoot $PythonRoot -Arguments @('-m', 'pip', 'wheel', '--no-deps', '--no-build-isolation', '--no-index', '--wheel-dir', $WheelRoot, $CandidateSource)
        }
        $ServicePackages = @($ServicePackages | Where-Object { $_ -ne $CivicRecords })
        $CandidateWheels = @(Get-ChildItem -LiteralPath $WheelRoot -Filter '*.whl')
        if ($CandidateWheels.Count -ne $CandidateSourceRoots.Count) { throw "Expected one wheel for each pinned candidate package." }
        $ServicePackages += @($CandidateWheels | ForEach-Object { $_.FullName })
        $ProvenanceName = if ($ProductProfile -eq 'inspections-preview') { 'inspections-candidate-provenance.json' } elseif ($ProductProfile -eq 'permitting-preview') { 'permitting-candidate-provenance.json' } else { 'planning-candidate-provenance.json' }
        Write-JsonFile -Path (Join-Path $PythonRoot $ProvenanceName) -Value @{
            profile = $ProductProfile; build_profile = $PlanningBuildProfile
            development_only = $PlanningBuild.DevelopmentOnly; sources = $DevelopmentSources
            contract_sha256 = Get-Sha256 -Path (Join-Path $RepoRoot $PlanningBuild.ContractPath)
            sources_manifest_sha256 = Get-Sha256 -Path (Join-Path $RepoRoot $PlanningBuild.Contract.sources_manifest)
            wheels = @($CandidateWheels | ForEach-Object { @{ name = $_.Name; sha256 = Get-Sha256 -Path $_.FullName } })
        }
    }
    if ($ProductProfile -eq "meetings-beta") {
        $CivicClerk = if ($MeetingsRoot) { (Resolve-Path $MeetingsRoot).Path } else { (Resolve-Path (Join-Path $RepoRoot "..\civicclerk")).Path }
        $ServicePackages += @($CivicClerk)
    }
    $ServiceInstallArguments = @(
        "-m", "pip", "install",
        "--disable-pip-version-check",
        "--no-warn-script-location",
        "setuptools>=68",
        "wheel",
        "hatchling>=1.27.0"
    )
    if (-not $ReuseInstalledServiceDependencies) {
    Invoke-PythonPayloadCommand -PythonRoot $PythonRoot -Arguments $ServiceInstallArguments
    Invoke-PythonPayloadCommand -PythonRoot $PythonRoot -Arguments @(
        "-m", "pip", "install",
        "--disable-pip-version-check",
        "--no-warn-script-location",
        "--no-build-isolation",
        $CivicCore,
        "psycopg2-binary>=2.9.0,<3.0.0",
        "PyMuPDF>=1.26.0,<2.0.0"
    )
    }
    $ServicePackageInstallArguments = @(
        "-m", "pip", "install",
        "--disable-pip-version-check",
        "--no-warn-script-location",
        "--no-build-isolation",
        "--no-deps",
        "--force-reinstall"
    ) + $ServicePackages
    if ($ReuseInstalledServiceDependencies) { $ServicePackageInstallArguments += "--no-index" }
    Invoke-PythonPayloadCommand -PythonRoot $PythonRoot -Arguments $ServicePackageInstallArguments
    Copy-CivicRecordsMigrations -PythonRoot $PythonRoot -RepoRoot $RepoRoot
    Test-PythonServiceImports -PythonRoot $PythonRoot -ProductProfile $ProductProfile
    if ($ProductProfile -in @('permitting-preview', 'inspections-preview')) {
        Invoke-PythonPayloadCommand -PythonRoot $PythonRoot -Arguments @('-c', "import civicpermit.workflow_store, civicsuite_runtime.permitting_bridge") -ExtraEnvironment @{TESTING='1'}
    }
    if ($ProductProfile -eq 'inspections-preview') {
        Invoke-PythonPayloadCommand -PythonRoot $PythonRoot -Arguments @('-c', 'import civicinspect.workflow_store, civicsuite_runtime.inspections_bridge, textflowkit.core.whistle') -ExtraEnvironment @{TESTING='1'}
    }
    $InstalledPackages = @("civiccore", "civicrecords-ai", "civicnotice", "civicaccess", "civicsuite-runtime")
    if ($ProductProfile -in @("city-core", "zoning-beta", "planning-preview", "permitting-preview", "inspections-preview")) {
        $InstalledPackages += @("civicclerk", "civiccode")
    }
    if ($ProductProfile -in @("zoning-beta", "planning-preview", "permitting-preview", "inspections-preview")) {
        $InstalledPackages += @("civiczone")
    }
    if ($ProductProfile -in @("planning-preview", "permitting-preview", "inspections-preview")) { $InstalledPackages += @("civicplan") }
    if ($ProductProfile -in @("permitting-preview", "inspections-preview")) { $InstalledPackages += @("civicpermit") }
    if ($ProductProfile -eq "inspections-preview") { $InstalledPackages += @("civicinspect", "townlight-inspection-transcriber") }
    if ($ProductProfile -eq "meetings-beta") {
        $InstalledPackages += @("civicclerk")
    }
    if ($ProductProfile -in @("planning-preview", "permitting-preview", "inspections-preview")) {
        $UmbrellaCommit = (& git -C $RepoRoot rev-parse HEAD).Trim()
        $UmbrellaDirty = & git -C $RepoRoot status --porcelain --untracked-files=normal
        if ($LASTEXITCODE -ne 0 -or $UmbrellaDirty) { throw 'Commit the umbrella build candidate before preparing its provenance.' }
        $PackageCsv = $InstalledPackages -join ','
        $ProvenanceScript = @"
import importlib.metadata as metadata
import json
from pathlib import Path
from app.desktop_bridge.router import router
from fastapi import FastAPI
from civicplan.source_store import PlanSourceRepository
from civicplan.workflow_store import WorkflowRepository
probe = FastAPI()
probe.include_router(router)
route_paths = set(probe.openapi()['paths'])
assert hasattr(PlanSourceRepository, 'inventory') and hasattr(WorkflowRepository, 'preview_snapshot')
assert '/desktop/v1/planning-sources/search' in route_paths
assert metadata.version('civicplan') == '$($PlanningBuild.Contract.planning_package_version)'
assert metadata.version('civicrecords-ai') == '$($PlanningBuild.RecordsVersion)'
assert metadata.version('civiccore') == '$($PlanningBuild.Contract.core_package_version)'
if '$ProductProfile' in ('permitting-preview', 'inspections-preview'):
    assert metadata.version('civicpermit') == '$($PlanningBuild.Contract.permitting_package_version)'
    assert '/desktop/v1/permitting-sources/search' in route_paths
if '$ProductProfile' == 'inspections-preview':
    assert metadata.version('civicinspect') == '$($PlanningBuild.Contract.inspections_package_version)'
    assert '/desktop/v1/inspections-sources/search' in route_paths
path = Path(r'$PythonRoot') / '$ProvenanceName'
receipt = json.loads(path.read_text(encoding='utf-8-sig'))
receipt['umbrella_source_commit'] = '$UmbrellaCommit'
receipt['package_versions'] = {name: metadata.version(name) for name in '$PackageCsv'.split(',')}
path.write_text(json.dumps(receipt, indent=2) + '\n', encoding='utf-8')
"@
        Invoke-PythonPayloadCommand -PythonRoot $PythonRoot -Arguments @('-c', $ProvenanceScript) -ExtraEnvironment @{ TESTING = '1' }
    }
    return @{
        pip = $PipStatus
        installed = $InstalledPackages
    }
}

function Install-OllamaPayload {
    param(
        [object]$Source,
        [string]$CacheRoot,
        [string]$PayloadRoot
    )
    $Destination = Join-Path $PayloadRoot "ollama"
    if (Test-Path -LiteralPath (Join-Path $Destination "ollama.exe")) {
        return @{ status = "present"; path = $Destination }
    }
    if ($SkipDownloads) {
        throw "Ollama download requires network access."
    }
    if ($Source.download_url) {
        $AssetName = [System.IO.Path]::GetFileName(([System.Uri][string]$Source.download_url).AbsolutePath)
        if (-not $AssetName) {
            $AssetName = [string]$Source.asset_name_pattern
        }
        $Archive = Join-Path $CacheRoot $AssetName
        $ExpectedSha256 = ""
        if ($Source.download_sha256) {
            $ExpectedSha256 = [string]$Source.download_sha256
        }
        $Sha = Invoke-CivicDownload -Url $Source.download_url -Destination $Archive -ExpectedSha256 $ExpectedSha256
        Expand-CivicZip -Archive $Archive -Destination $Destination
        if (-not (Test-Path -LiteralPath (Join-Path $Destination "ollama.exe"))) {
            $Ollama = Get-ChildItem -LiteralPath $Destination -Recurse -Filter "ollama.exe" | Select-Object -First 1
            if ($Ollama) {
                Copy-Item -LiteralPath $Ollama.FullName -Destination (Join-Path $Destination "ollama.exe") -Force
            }
        }
        return @{ status = "installed"; url = $Source.download_url; sha256 = $Sha; version = $Source.version; path = $Destination }
    }
    $Release = Invoke-CivicRestMethod `
        -Uri $Source.release_api `
        -Label "Ollama release lookup" `
        -Headers @{ "User-Agent" = "CivicSuite-runtime-payload" }
    $Asset = $Release.assets | Where-Object { $_.name -eq $Source.asset_name_pattern } | Select-Object -First 1
    if (-not $Asset) {
        throw "Could not find Ollama asset $($Source.asset_name_pattern) in latest release."
    }
    $Archive = Join-Path $CacheRoot $Asset.name
    $Sha = Invoke-CivicDownload -Url $Asset.browser_download_url -Destination $Archive
    Expand-CivicZip -Archive $Archive -Destination $Destination
    if (-not (Test-Path -LiteralPath (Join-Path $Destination "ollama.exe"))) {
        $Ollama = Get-ChildItem -LiteralPath $Destination -Recurse -Filter "ollama.exe" | Select-Object -First 1
        if ($Ollama) {
            Copy-Item -LiteralPath $Ollama.FullName -Destination (Join-Path $Destination "ollama.exe") -Force
        }
    }
    return @{ status = "installed"; url = $Asset.browser_download_url; sha256 = $Sha; version = $Release.tag_name; path = $Destination }
}

function Install-InspectionVoicePayload {
    param([object]$Source, [string]$CacheRoot, [string]$PythonRoot)
    if (-not $Source.download_sha256 -or -not $Source.download_url -or -not $Source.asset_api_url) {
        throw 'Inspection voice assets require explicit pinned download metadata.'
    }
    $Archive = Join-Path $CacheRoot 'Townlight-Beta-1-Inspection-Voice-Assets.zip'
    if (-not (Test-Path -LiteralPath $Archive) -or (Get-Sha256 -Path $Archive) -ne $Source.download_sha256) {
        if ($SkipDownloads) { throw 'Pinned inspection voice assets are not cached.' }
        if ($env:GH_TOKEN) {
            # The same repository's read-only Actions token can retrieve the
            # accepted build input while the coordinated release is still draft.
            # Keep the token in-process; do not put it in native command args.
            Invoke-WebRequest -Uri $Source.asset_api_url -Headers @{
                Authorization = "Bearer $env:GH_TOKEN"
                Accept = 'application/octet-stream'
            } -OutFile $Archive -UseBasicParsing
        } else {
            Invoke-CivicDownload -Url $Source.download_url -Destination $Archive -ExpectedSha256 $Source.download_sha256 | Out-Null
        }
    }
    $Hash = Get-Sha256 -Path $Archive
    if ($Hash -ne $Source.download_sha256) { throw 'Inspection voice archive hash mismatch.' }
    # Add this small asset subtree without resetting the provisioned interpreter.
    Expand-Archive -LiteralPath $Archive -DestinationPath $PythonRoot -Force
    foreach ($Entry in $Source.required_sha256.PSObject.Properties) {
        $File = Join-CivicPath -Root $PythonRoot -RelativePath $Entry.Name
        if (-not (Test-Path -LiteralPath $File) -or (Get-Sha256 -Path $File) -ne $Entry.Value) {
            throw "Inspection voice asset hash mismatch: $($Entry.Name)"
        }
    }
    return @{status='installed'; sha256=$Hash; source=$Source.download_url}
}

function Install-PgvectorPayload {
    param(
        [object]$Source,
        [string]$CacheRoot,
        [string]$PayloadRoot
    )
    $PostgresRoot = Join-Path $PayloadRoot "postgres"
    if ((Test-Path -LiteralPath (Join-Path $PostgresRoot "share\extension\vector.control")) -and
        (Test-Path -LiteralPath (Join-Path $PostgresRoot "lib\vector.dll"))) {
        return @{ status = "present"; path = $PostgresRoot }
    }
    if ($SkipPgvectorBuild) {
        return @{ status = "skipped"; reason = "SkipPgvectorBuild"; path = $PostgresRoot }
    }
    if (-not (Get-Command git.exe -ErrorAction SilentlyContinue)) {
        throw "git.exe is required to fetch pgvector."
    }
    $SourceDir = Join-Path $CacheRoot "pgvector"
    if (-not (Test-Path -LiteralPath $SourceDir)) {
        git clone --branch $Source.tag --depth 1 $Source.git_url $SourceDir
    }
    Invoke-PgvectorBuild -SourceDir $SourceDir -PostgresRoot $PostgresRoot
    return @{ status = "installed"; tag = $Source.tag; path = $PostgresRoot }
}

if (-not $ManifestPath) {
    $ManifestPath = Join-Path $RepoRoot "desktop\runtime\windows-runtime-sources.json"
}
if (-not $PayloadManifestPath) {
    $PayloadManifestPath = Join-Path $RepoRoot "desktop\runtime\windows-runtime-payloads.json"
}
if (-not $PayloadRoot) {
    $PayloadRoot = Join-Path $RepoRoot "desktop\runtime\payload"
}

$Manifest = Read-JsonFile -Path $ManifestPath
if ($Manifest.schema_version -ne 1 -or $Manifest.profile -ne "windows-local-1.0") {
    throw "Unsupported runtime source manifest."
}
$PayloadManifest = Read-JsonFile -Path $PayloadManifestPath
if ($PayloadManifest.schema_version -ne 1 -or $PayloadManifest.profile -ne "windows-local-1.0") {
    throw "Unsupported runtime payload manifest."
}

$CacheRoot = Join-Path $RepoRoot ".runtime-cache\windows-local-1.0"
New-Item -ItemType Directory -Force -Path $CacheRoot | Out-Null
New-Item -ItemType Directory -Force -Path $PayloadRoot | Out-Null

$Report = [ordered]@{
    schema_version = 1
    profile = $PayloadManifest.profile
    product_profile = $ProductProfile
    generated_at = (Get-Date).ToUniversalTime().ToString("o")
    payload_root = $PayloadRoot
    postgres = Install-PostgresPayload -Source $Manifest.sources.postgres -CacheRoot $CacheRoot -PayloadRoot $PayloadRoot
    python = Install-PythonPayload -Source $Manifest.sources.python -CacheRoot $CacheRoot -PayloadRoot $PayloadRoot -RepoRoot $RepoRoot -ProductProfile $ProductProfile
    ollama = Install-OllamaPayload -Source $Manifest.sources.ollama -CacheRoot $CacheRoot -PayloadRoot $PayloadRoot
}
$Report.pgvector = Install-PgvectorPayload -Source $Manifest.sources.pgvector -CacheRoot $CacheRoot -PayloadRoot $PayloadRoot
if ($ProductProfile -in @("zoning-beta", "planning-preview", "permitting-preview", "inspections-preview")) {
    $Report.postgis = Install-PostgisPayload -Source $Manifest.sources.postgis -CacheRoot $CacheRoot -PayloadRoot $PayloadRoot
}
$Report.postgres_vcruntime = Copy-PostgresVcRuntime -PostgresRoot (Join-Path $PayloadRoot "postgres")
$Report.python_vcruntime = Copy-PythonVcRuntime -PythonRoot (Join-Path $PayloadRoot "python")
if ($ProductProfile -eq 'inspections-preview') {
    $Report.inspection_voice = Install-InspectionVoicePayload -Source $Manifest.sources.inspection_voice -CacheRoot $CacheRoot -PythonRoot (Join-Path $PayloadRoot 'python')
}
# Python imports generate __pycache__ paths that can exceed the WiX linker limit.
# They are regenerable bytecode and must not be shipped; remove only those directories before hashing.
$PythonRoot = Join-Path $PayloadRoot "python"
$PythonRootFull = [System.IO.Path]::GetFullPath($PythonRoot)
$PythonRootBoundary = $PythonRootFull.TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
Get-ChildItem -LiteralPath $PythonRoot -Directory -Recurse -Filter __pycache__ |
    Sort-Object FullName -Descending |
    ForEach-Object {
        $CachePath = [System.IO.Path]::GetFullPath($_.FullName)
        if (-not $CachePath.StartsWith($PythonRootBoundary, [System.StringComparison]::OrdinalIgnoreCase)) {
            throw "Refusing to remove __pycache__ outside Python payload root: $CachePath"
        }
        Remove-Item -LiteralPath $CachePath -Recurse -Force
    }
$PayloadLock = New-RuntimePayloadLock -PayloadManifest $PayloadManifest -PayloadRoot $PayloadRoot -ProductProfile $ProductProfile
$Report.payloads = $PayloadLock.payloads

Write-JsonFile -Path (Join-Path $PayloadRoot "runtime-payload-lock.json") -Value $Report
Write-Output ("Prepared Townlight Windows runtime payload for {0} at {1}" -f $ProductProfile, $PayloadRoot)
