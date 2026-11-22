[CmdletBinding()]
param(
    [Parameter(Mandatory)] [ValidateSet('Export', 'Import')] [string] $Action,
    [Parameter(Mandatory)] [string] $ProfileRoot,
    [Parameter(Mandatory)] [string] $BackupDirectory,
    [Parameter(Mandatory)] [string] $EscrowFile,
    [string] $Recipient
)

# The ordinary backup continues to omit secrets. This separately encrypted
# envelope lets an authorized recovery operator reopen a cold physical cluster.

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-LocalAbsolutePath([string] $Path) {
    if ($Path -notmatch '^[A-Za-z]:[\\/]' -or $Path -match '(^|[\\/])\.\.([\\/]|$)') {
        throw 'Use an absolute local Windows path.'
    }
    return [IO.Path]::GetFullPath($Path).TrimEnd('\')
}

function Confirm-NotReparsePoint([string] $Path) {
    if (Test-Path -LiteralPath $Path) {
        $item = Get-Item -LiteralPath $Path -Force
        if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) {
            throw 'A recovery path points to a reparse point. Use the original protected folder.'
        }
    }
}

function Save-SecretAtomically([string] $Destination, [byte[]] $Content) {
    $scratch = Join-Path (Split-Path -Parent $Destination) ('.recovery-' + [Guid]::NewGuid().ToString('N'))
    try {
        [IO.File]::WriteAllBytes($scratch, $Content)
        if ([IO.File]::Exists($Destination)) {
            [IO.File]::Replace($scratch, $Destination, [NullString]::Value)
        } else {
            [IO.File]::Move($scratch, $Destination)
        }
    } finally {
        if ([IO.File]::Exists($scratch)) { [IO.File]::Delete($scratch) }
    }
}

$profile = Get-LocalAbsolutePath $ProfileRoot
$backup = Get-LocalAbsolutePath $BackupDirectory
$escrow = Get-LocalAbsolutePath $EscrowFile
$secretRoot = Join-Path $profile 'config\secrets'
$manifestPath = Join-Path $backup 'backup-manifest.json'
foreach ($path in @($profile, (Join-Path $profile 'config'), $secretRoot, $backup, $manifestPath, $escrow)) {
    Confirm-NotReparsePoint $path
}
if (!(Test-Path -LiteralPath $secretRoot -PathType Container)) {
    throw 'Run Townlight setup under the intended Windows host account first.'
}
if ($escrow.StartsWith($backup + '\', [StringComparison]::OrdinalIgnoreCase) -or
    $escrow.StartsWith($profile + '\', [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Store the encrypted recovery file separately from the normal backup and profile.'
}
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
if ($manifest.schema_version -ne 1 -or $manifest.database_consistency -ne 'postgres-clean-shutdown-v1' -or
    (Get-LocalAbsolutePath $manifest.source_root) -ine $profile) {
    throw 'Use a verified cold Townlight backup and the same absolute profile location as the original host.'
}
$dataRoot = Get-LocalAbsolutePath $manifest.data_source
$configRoot = Join-Path $profile 'config'
$manifestHash = (Get-FileHash -LiteralPath $manifestPath -Algorithm SHA256).Hash
$control = @($manifest.files | Where-Object { ($_.path -replace '\\', '/') -ceq 'Data/postgres/global/pg_control' })
if ($control.Count -ne 1 -or $control[0].sha256 -notmatch '^[0-9a-fA-F]{64}$') {
    throw 'The backup does not identify a unique physical PostgreSQL control file.'
}
$clusterHash = (Get-FileHash -LiteralPath (Join-Path $backup 'Data\postgres\global\pg_control') -Algorithm SHA256).Hash
if ($clusterHash -ine $control[0].sha256) { throw 'The backup control file does not match its manifest.' }

$names = @('postgres-password.txt', 'encryption_key.txt')
foreach ($name in $names) { Confirm-NotReparsePoint (Join-Path $secretRoot $name) }

if ($Action -eq 'Export') {
    if (!$Recipient) { throw 'Provide the city recovery certificate (document-encryption public certificate).' }
    if (Test-Path -LiteralPath $escrow) { throw 'Choose a new escrow file.' }
    $values = @{}
    foreach ($name in $names) {
        $bytes = [IO.File]::ReadAllBytes((Join-Path $secretRoot $name))
        if ($bytes.Length -lt 16 -or $bytes.Length -gt 200) { throw 'A required recovery secret is invalid.' }
        $values[$name] = [Convert]::ToBase64String($bytes)
    }
    $body = @{ version = 1; manifest_sha256 = $manifestHash; cluster_sha256 = $clusterHash; secrets = $values }
    $protected = Protect-CmsMessage -To $Recipient -Content ($body | ConvertTo-Json -Depth 3 -Compress)
    $encoded = [Text.Encoding]::UTF8.GetBytes($protected + "`n")
    $output = [IO.File]::Open($escrow, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write)
    try { $output.Write($encoded, 0, $encoded.Length) } finally { $output.Dispose() }
    Write-Output 'Encrypted Townlight recovery escrow was saved separately.'
    return
}

$targetData = Get-LocalAbsolutePath ((Get-Content -LiteralPath (Join-Path $configRoot 'locations.json') -Raw | ConvertFrom-Json).data_root)
if ($targetData -ine $dataRoot -or (Test-Path -LiteralPath (Join-Path $targetData 'postgres\postmaster.pid'))) {
    throw 'Restore into the original data path and stop PostgreSQL before applying escrow.'
}
$targetControl = Join-Path $targetData 'postgres\global\pg_control'
Confirm-NotReparsePoint $targetControl
if ((Get-FileHash -LiteralPath $targetControl -Algorithm SHA256).Hash -ine $clusterHash) {
    throw 'The installed data is not the exact restored cold cluster. No secrets were changed.'
}
try {
    $data = (Unprotect-CmsMessage -LiteralPath $escrow) | ConvertFrom-Json
    if ($data.version -ne 1 -or $data.manifest_sha256 -ine $manifestHash -or $data.cluster_sha256 -ine $clusterHash) {
        throw 'The escrow identity does not match the backup.'
    }
    $values = @{}
    foreach ($name in $names) {
        $value = [Convert]::FromBase64String($data.secrets.PSObject.Properties[$name].Value)
        if ($value.Length -lt 16 -or $value.Length -gt 200) { throw 'A recovery secret is invalid.' }
        $values[$name] = $value
    }
} catch {
    throw 'The recovery certificate could not open a matching escrow. No secrets were changed.'
}
$previous = @{}
$written = [Collections.Generic.List[string]]::new()
try {
    foreach ($name in $names) {
        $destination = Join-Path $secretRoot $name
        if ([IO.File]::Exists($destination)) { $previous[$name] = [IO.File]::ReadAllBytes($destination) }
        Save-SecretAtomically $destination $values[$name]
        $written.Add($name)
    }
} catch {
    foreach ($name in $written) {
        $destination = Join-Path $secretRoot $name
        if ($previous.ContainsKey($name)) { Save-SecretAtomically $destination $previous[$name] }
        else { [IO.File]::Delete($destination) }
    }
    throw 'The escrow could not be applied. Keep services stopped and verify the protected secret files.'
}
Write-Output 'Recovery credentials applied to the matched cold Townlight database. Start services and verify the restored records.'
