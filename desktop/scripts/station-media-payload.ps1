# SPDX-License-Identifier: AGPL-3.0-only
# Copyright (c) The CivicSuite Authors

function Get-StationPayloadSha256 {
    param([Parameter(Mandatory=$true)][string]$Path)
    $Stream = [System.IO.File]::OpenRead($Path)
    $Sha256 = [System.Security.Cryptography.SHA256]::Create()
    try {
        return -join ($Sha256.ComputeHash($Stream) | ForEach-Object { $_.ToString('x2') })
    } finally {
        $Stream.Dispose()
        $Sha256.Dispose()
    }
}

function Join-StationPayloadPath {
    param(
        [Parameter(Mandatory=$true)][string]$Root,
        [Parameter(Mandatory=$true)][string]$RelativePath
    )
    if ([System.IO.Path]::IsPathRooted($RelativePath) -or $RelativePath.Contains(':') -or $RelativePath.Contains('\')) {
        throw "Unsafe Station payload relative path: $RelativePath"
    }
    $Parts = $RelativePath.Split('/')
    if ($Parts.Count -eq 0 -or @($Parts | Where-Object { -not $_ -or $_ -eq '.' -or $_ -eq '..' }).Count -gt 0) {
        throw "Unsafe Station payload relative path: $RelativePath"
    }
    $Result = $Root
    foreach ($Part in $Parts) {
        $Result = Join-Path $Result $Part
    }
    $RootFull = [System.IO.Path]::GetFullPath($Root).TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
    $ResultFull = [System.IO.Path]::GetFullPath($Result)
    if (-not $ResultFull.StartsWith($RootFull, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Station payload path escaped its root: $RelativePath"
    }
    return $ResultFull
}

function Get-StationPayloadInventory {
    param([Parameter(Mandatory=$true)][string]$Root)
    $RootItem = Get-Item -LiteralPath $Root -ErrorAction Stop
    if (-not $RootItem.PSIsContainer -or ($RootItem.Attributes -band [System.IO.FileAttributes]::ReparsePoint)) {
        throw "Station payload root must be a regular directory: $Root"
    }
    $RootFull = [System.IO.Path]::GetFullPath($Root).TrimEnd([System.IO.Path]::DirectorySeparatorChar)
    $RootBoundary = $RootFull + [System.IO.Path]::DirectorySeparatorChar
    $Files = [System.Collections.Generic.Dictionary[string,object]]::new([System.StringComparer]::Ordinal)
    $Directories = [System.Collections.Generic.List[string]]::new()
    $CaseInsensitivePaths = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
    $Pending = [System.Collections.Generic.Stack[string]]::new()
    $Pending.Push($RootFull)
    while ($Pending.Count -gt 0) {
        $Current = $Pending.Pop()
        foreach ($Entry in @(Get-ChildItem -LiteralPath $Current -Force -ErrorAction Stop)) {
            if ($Entry.Attributes -band [System.IO.FileAttributes]::ReparsePoint) {
                throw "Station payload contains a reparse point: $($Entry.FullName)"
            }
            $FullPath = [System.IO.Path]::GetFullPath($Entry.FullName)
            if (-not $FullPath.StartsWith($RootBoundary, [System.StringComparison]::OrdinalIgnoreCase)) {
                throw "Station payload entry escaped its root: $FullPath"
            }
            $RelativePath = $FullPath.Substring($RootBoundary.Length).Replace('\', '/')
            if (-not $CaseInsensitivePaths.Add($RelativePath)) {
                throw "Station payload contains paths that collide on Windows: $RelativePath"
            }
            if ($Entry.PSIsContainer) {
                $Directories.Add($RelativePath)
                $Pending.Push($FullPath)
            } else {
                $Files.Add($RelativePath, [pscustomobject]@{
                    size_bytes = [long]$Entry.Length
                    sha256 = Get-StationPayloadSha256 -Path $FullPath
                })
            }
        }
    }
    return [pscustomobject]@{ files = $Files; directories = $Directories }
}

function Assert-StationMediaLock {
    param(
        [Parameter(Mandatory=$true)][object]$Inventory,
        [Parameter(Mandatory=$true)][string]$MediaLockPath
    )
    if (-not (Test-Path -LiteralPath $MediaLockPath -PathType Leaf)) {
        throw "Pinned Station media lock is missing: $MediaLockPath"
    }
    $Lock = Get-Content -LiteralPath $MediaLockPath -Raw | ConvertFrom-Json
    $LockedFiles = @($Lock.files.PSObject.Properties)
    if (-not $Lock.files -or $LockedFiles.Count -eq 0) {
        throw 'Pinned Station media lock must contain a nonempty files mapping.'
    }
    foreach ($LockedFile in $LockedFiles) {
        $RelativePath = [string]$LockedFile.Name
        $ExpectedSha256 = [string]$LockedFile.Value
        if ($ExpectedSha256 -notmatch '^[0-9a-fA-F]{64}$') {
            throw "Pinned Station media lock has an invalid SHA-256: $RelativePath"
        }
        # Validate the media-lock key as a portable relative path, then test it
        # against the already-hashed payload inventory without resolving it on
        # the build host's current directory.
        $null = Join-StationPayloadPath -Root ([System.IO.Path]::GetTempPath()) -RelativePath $RelativePath
        $InventoryPath = 'media-source/' + $RelativePath
        if (-not $Inventory.files.ContainsKey($InventoryPath)) {
            throw "Station MSI payload is missing media-lock file: $RelativePath"
        }
        if ($Inventory.files[$InventoryPath].sha256 -ne $ExpectedSha256.ToLowerInvariant()) {
            throw "Station MSI media-lock hash mismatch: $RelativePath"
        }
    }
    return $LockedFiles.Count
}

function Compare-StationPayloadInventory {
    param(
        [Parameter(Mandatory=$true)][object]$Expected,
        [Parameter(Mandatory=$true)][object]$Actual,
        [Parameter(Mandatory=$true)][string]$Label
    )
    if ($Expected.files.Count -ne $Actual.files.Count) {
        throw "$Label Station payload file count differs: expected $($Expected.files.Count), got $($Actual.files.Count)"
    }
    foreach ($RelativePath in $Expected.files.Keys) {
        if (-not $Actual.files.ContainsKey($RelativePath)) {
            throw "$Label Station payload file is missing or renamed: $RelativePath"
        }
        $ExpectedFile = $Expected.files[$RelativePath]
        $ActualFile = $Actual.files[$RelativePath]
        if ($ExpectedFile.size_bytes -ne $ActualFile.size_bytes -or $ExpectedFile.sha256 -ne $ActualFile.sha256) {
            throw "$Label Station payload bytes differ: $RelativePath"
        }
    }
    if ($Expected.directories.Count -ne $Actual.directories.Count) {
        throw "$Label Station payload directory count differs."
    }
    foreach ($RelativePath in $Expected.directories) {
        if (-not $Actual.directories.Contains($RelativePath)) {
            throw "$Label Station payload directory is missing or renamed: $RelativePath"
        }
    }
}

function Install-AcceptedStationMediaPayload {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory=$true)][object]$Source,
        [Parameter(Mandatory=$true)][string]$CacheRoot,
        [Parameter(Mandatory=$true)][string]$PayloadRoot,
        [Parameter(Mandatory=$true)][string]$MediaLockPath,
        [string]$MsiPath = '',
        [string]$ExistingMsiExtractRoot = '',
        [scriptblock]$DownloadAction = {
            param($Url, $Destination, $ExpectedSha256)
            Invoke-TownlightDownload -Url $Url -Destination $Destination -ExpectedSha256 $ExpectedSha256 | Out-Null
        },
        [scriptblock]$SignatureAction = {
            param($Path)
            Get-AuthenticodeSignature -LiteralPath $Path
        },
        [scriptblock]$ExtractAction = {
            param($Path, $TargetRoot)
            $Arguments = '/a "{0}" /qn TARGETDIR="{1}"' -f $Path, $TargetRoot
            $Msiexec = Join-Path $env:SystemRoot 'System32/msiexec.exe'
            $Process = Start-Process -FilePath $Msiexec -ArgumentList $Arguments -Wait -PassThru -NoNewWindow
            return $Process.ExitCode
        }
    )

    if (-not $Source.download_url -or $Source.download_sha256 -notmatch '^[0-9a-fA-F]{64}$' -or -not $Source.archive_name) {
        throw 'Station media source requires its pinned download URL, SHA-256, and archive name.'
    }
    if (-not $Source.payload_relative_path -or -not $Source.signer_common_name -or @($Source.required_files).Count -eq 0) {
        throw 'Station media source requires its payload path, signer, and required files.'
    }

    New-Item -ItemType Directory -Path $CacheRoot -Force | Out-Null
    New-Item -ItemType Directory -Path $PayloadRoot -Force | Out-Null
    if (-not $MsiPath) {
        $MsiPath = Join-Path $CacheRoot $Source.archive_name
        & $DownloadAction $Source.download_url $MsiPath $Source.download_sha256
    }
    if (-not (Test-Path -LiteralPath $MsiPath -PathType Leaf)) {
        throw "Pinned Station MSI is missing: $MsiPath"
    }
    $MsiPath = (Resolve-Path -LiteralPath $MsiPath).Path
    $MsiSha256 = Get-StationPayloadSha256 -Path $MsiPath
    if ($MsiSha256 -ne $Source.download_sha256.ToLowerInvariant()) {
        throw "Pinned Station MSI SHA-256 mismatch: expected $($Source.download_sha256), got $MsiSha256"
    }
    $Signature = & $SignatureAction $MsiPath
    $SignerPattern = '(^|,\s*)CN=' + [regex]::Escape([string]$Source.signer_common_name) + '(,|$)'
    if ([string]$Signature.Status -ne 'Valid' -or [string]$Signature.SignerCertificate.Subject -notmatch $SignerPattern) {
        throw "Pinned Station MSI must have a Valid Authenticode signature from CN=$($Source.signer_common_name)."
    }

    $OwnedTempRoot = ''
    $OwnsTempRoot = $false
    $OwnedStagingRoot = ''
    $OwnsStagingRoot = $false
    try {
        if ($ExistingMsiExtractRoot) {
            $ExtractionRoot = (Resolve-Path -LiteralPath $ExistingMsiExtractRoot).Path
        } else {
            if (-not $env:SystemDrive) { throw 'SystemDrive is required for a short Station MSI administrative-extraction path.' }
            $DriveRoot = [System.IO.Path]::GetPathRoot([System.IO.Path]::GetFullPath($env:SystemRoot))
            $OwnedTempRoot = Join-Path $DriveRoot ('tlst-' + [guid]::NewGuid().ToString('N').Substring(0, 12))
            if (Test-Path -LiteralPath $OwnedTempRoot) { throw "Refusing to reuse Station extraction target: $OwnedTempRoot" }
            New-Item -ItemType Directory -Path $OwnedTempRoot | Out-Null
            $OwnsTempRoot = $true
            $ExtractExitCode = & $ExtractAction $MsiPath $OwnedTempRoot
            if ([int]$ExtractExitCode -ne 0) {
                throw "Station MSI administrative extraction failed with exit code $ExtractExitCode."
            }
            $ExtractionRoot = $OwnedTempRoot
        }

        $SourceStationRoot = Join-StationPayloadPath -Root $ExtractionRoot -RelativePath $Source.payload_relative_path
        if (-not (Test-Path -LiteralPath $SourceStationRoot -PathType Container)) {
            throw "Pinned Station subtree is missing from the verified MSI extraction: $($Source.payload_relative_path)"
        }
        $SourceInventory = Get-StationPayloadInventory -Root $SourceStationRoot
        foreach ($RequiredFile in $Source.required_files) {
            if (-not $SourceInventory.files.ContainsKey([string]$RequiredFile)) {
                throw "Pinned Station subtree is missing required file: $RequiredFile"
            }
        }
        $LockedMediaFiles = Assert-StationMediaLock -Inventory $SourceInventory -MediaLockPath $MediaLockPath

        $DestinationRoot = Join-Path $PayloadRoot 'station'
        if (Test-Path -LiteralPath $DestinationRoot) {
            $DestinationInventory = Get-StationPayloadInventory -Root $DestinationRoot
            Compare-StationPayloadInventory -Expected $SourceInventory -Actual $DestinationInventory -Label 'Existing destination'
            return [ordered]@{
                status = 'present'
                source = $Source.download_url
                source_msi_sha256 = $MsiSha256
                signer_subject = [string]$Signature.SignerCertificate.Subject
                files = $SourceInventory.files.Count
                bytes = [long](($SourceInventory.files.Values | Measure-Object -Property size_bytes -Sum).Sum)
                media_lock_files = $LockedMediaFiles
                path = $DestinationRoot
            }
        }

        $OwnedStagingRoot = Join-Path $PayloadRoot ('station.__prepare-' + [guid]::NewGuid().ToString('N'))
        if (Test-Path -LiteralPath $OwnedStagingRoot) { throw "Refusing to reuse Station staging path: $OwnedStagingRoot" }
        New-Item -ItemType Directory -Path $OwnedStagingRoot | Out-Null
        $OwnsStagingRoot = $true
        foreach ($RelativeDirectory in @($SourceInventory.directories | Sort-Object { $_.Split('/').Count }, { $_ })) {
            $DirectoryPath = Join-StationPayloadPath -Root $OwnedStagingRoot -RelativePath $RelativeDirectory
            New-Item -ItemType Directory -Path $DirectoryPath -Force | Out-Null
        }
        foreach ($RelativePath in $SourceInventory.files.Keys) {
            $SourcePath = Join-StationPayloadPath -Root $SourceStationRoot -RelativePath $RelativePath
            $DestinationPath = Join-StationPayloadPath -Root $OwnedStagingRoot -RelativePath $RelativePath
            $ParentPath = Split-Path -Parent $DestinationPath
            if (-not (Test-Path -LiteralPath $ParentPath -PathType Container)) {
                New-Item -ItemType Directory -Path $ParentPath -Force | Out-Null
            }
            [System.IO.File]::Copy($SourcePath, $DestinationPath)
        }
        $StagingInventory = Get-StationPayloadInventory -Root $OwnedStagingRoot
        Compare-StationPayloadInventory -Expected $SourceInventory -Actual $StagingInventory -Label 'Staged destination'
        [System.IO.Directory]::Move($OwnedStagingRoot, $DestinationRoot)
        $OwnsStagingRoot = $false

        return [ordered]@{
            status = 'installed'
            source = $Source.download_url
            source_msi_sha256 = $MsiSha256
            signer_subject = [string]$Signature.SignerCertificate.Subject
            files = $SourceInventory.files.Count
            bytes = [long](($SourceInventory.files.Values | Measure-Object -Property size_bytes -Sum).Sum)
            media_lock_files = $LockedMediaFiles
            path = $DestinationRoot
        }
    } finally {
        if ($OwnsStagingRoot -and $OwnedStagingRoot -and (Test-Path -LiteralPath $OwnedStagingRoot)) {
            $PayloadBoundary = [System.IO.Path]::GetFullPath($PayloadRoot).TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
            $StagingFull = [System.IO.Path]::GetFullPath($OwnedStagingRoot)
            if (-not $StagingFull.StartsWith($PayloadBoundary, [System.StringComparison]::OrdinalIgnoreCase) -or (Split-Path -Leaf $StagingFull) -notmatch '^station\.__prepare-[0-9a-f]{32}$') {
                throw "Refusing unsafe Station staging cleanup target: $StagingFull"
            }
            Remove-Item -LiteralPath $StagingFull -Recurse -Force
        }
        if ($OwnsTempRoot -and $OwnedTempRoot -and (Test-Path -LiteralPath $OwnedTempRoot)) {
            $TempFull = [System.IO.Path]::GetFullPath($OwnedTempRoot)
            $SystemDriveRoot = [System.IO.Path]::GetPathRoot([System.IO.Path]::GetFullPath($env:SystemRoot))
            $SystemDriveBoundary = $SystemDriveRoot.TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
            if (-not $TempFull.StartsWith($SystemDriveBoundary, [System.StringComparison]::OrdinalIgnoreCase) -or
                (Split-Path -Leaf $TempFull) -notmatch '^tlst-[0-9a-f]{12}$' -or
                $TempFull -ne [System.IO.Path]::GetFullPath($OwnedTempRoot)) {
                throw "Refusing unsafe Station MSI extraction cleanup target: $TempFull"
            }
            Remove-Item -LiteralPath $TempFull -Recurse -Force
        }
    }
}
