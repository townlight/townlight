# SPDX-License-Identifier: AGPL-3.0-only
param([Parameter(Mandatory)][string]$ArtifactRoot,[Parameter(Mandatory)][string]$EvidenceRoot)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
if($env:GITHUB_ACTIONS -cne 'true' -or $env:RUNNER_OS -cne 'Windows' -or $env:RUNNER_ENVIRONMENT -cne 'github-hosted'){throw 'Hosted Windows CI required'}
$candidate=& "$PSScriptRoot/verify-recorder-candidate.ps1" -ArtifactRoot $ArtifactRoot
$temp=[IO.Path]::GetFullPath($env:RUNNER_TEMP).TrimEnd('\')+'\'
$evidence=[IO.Path]::GetFullPath($EvidenceRoot)
if(!$evidence.StartsWith($temp,[StringComparison]::OrdinalIgnoreCase)){throw 'Evidence root outside runner temporary directory'}
New-Item -ItemType Directory -Path $evidence -Force | Out-Null
$id=[Guid]::NewGuid().ToString('N').Substring(0,8)
$job=Join-Path $temp ('TLq-'+$id)
$probe=Join-Path $job 'probe'
$primary=$cleanup=$null; $code=-1; $childrenAbsent=$false; $stage='private_root'; $extractExit=$null; $msiErrors=@()
try {
    New-Item -ItemType Directory -Path $job | Out-Null
    $sid=[Security.Principal.WindowsIdentity]::GetCurrent().User
    $acl=[Security.AccessControl.DirectorySecurity]::new()
    $acl.SetOwner($sid); $acl.SetAccessRuleProtection($true,$false)
    $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($sid,'FullControl','ContainerInherit,ObjectInherit','None','Allow'))
    $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new('S-1-5-18'),'FullControl','ContainerInherit,ObjectInherit','None','Allow'))
    Set-Acl -LiteralPath $job -AclObject $acl
    [ordered]@{source_commit=$candidate.SourceCommit;workflow_run=$candidate.Run;msi_sha256=$candidate.MsiSHA256;harness_commit=$env:GITHUB_SHA;purpose='Noninstalled short recorder diagnostic only'} | ConvertTo-Json | Set-Content (Join-Path $evidence 'candidate.json')
    $cpu=Get-CimInstance Win32_Processor; $os=Get-CimInstance Win32_OperatingSystem
    [ordered]@{cpu=@($cpu|Select-Object Name,NumberOfCores,NumberOfLogicalProcessors);total_memory_kib=$os.TotalVisibleMemorySize;free_memory_kib=$os.FreePhysicalMemory;temp_disk_free=[IO.DriveInfo]::new([IO.Path]::GetPathRoot($job)).AvailableFreeSpace;started_at=[DateTime]::UtcNow.ToString('o')} | ConvertTo-Json -Depth 5 | Set-Content (Join-Path $evidence 'capacity.json')
    $stage='administrative_extract'; $image=Join-Path $job 'image'
    $extractLog=Join-Path $job 'extract.log'
    $extract=Start-Process msiexec.exe -ArgumentList @('/a',('"'+$candidate.MsiPath+'"'),'/qn',('TARGETDIR="'+$image+'"'),'/l*v',('"'+$extractLog+'"')) -WindowStyle Hidden -Wait -PassThru
    $extractExit=$extract.ExitCode
    if($extractExit -ne 0){throw 'Administrative extraction failed'}
    $stage='payload_selector'; $py=@(Get-ChildItem -LiteralPath $image -Recurse -File -Filter python.exe | Where-Object {$_.FullName.EndsWith('\runtime\payload\python\python.exe',[StringComparison]::OrdinalIgnoreCase)})
    if($py.Count -ne 1){throw 'Payload selector failed'}
    $payload=$py[0].Directory.Parent.FullName
    New-Item -ItemType Directory -Path $probe | Out-Null
    $stage='noninstalled_probe'; & $py[0].FullName -B "$PSScriptRoot/recorder_probe.py" --payload $payload --root $probe --seconds 90
    $code=$LASTEXITCODE
} catch {$primary=$_.Exception.GetType().Name}
finally {
    try {
        if(Test-Path -LiteralPath (Join-Path $job 'extract.log')){$text=Get-Content -LiteralPath (Join-Path $job 'extract.log') -Raw; $msiErrors=@([regex]::Matches($text,'Error [0-9]{4}')|ForEach-Object {$_.Value}|Select-Object -Unique)}
        $receipt=Join-Path $probe 'receipt.json'
        if(Test-Path -LiteralPath $receipt){Copy-Item -LiteralPath $receipt -Destination (Join-Path $evidence 'receipt.json')}
    } catch {if(!$primary){$primary=$_.Exception.GetType().Name}}
    try {
        $resolved=[IO.Path]::GetFullPath($job)
        if(!$resolved.StartsWith($temp,[StringComparison]::OrdinalIgnoreCase) -or [IO.Path]::GetFileName($resolved) -cne ('TLq-'+$id)){throw 'Cleanup target failed'}
        $active=@(Get-CimInstance Win32_Process | Where-Object {$_.ExecutablePath -and $_.ExecutablePath.StartsWith($resolved+'\',[StringComparison]::OrdinalIgnoreCase)})
        $childrenAbsent=$active.Count -eq 0
        if(!$childrenAbsent){throw 'Owned extracted child remains'}
        if(Test-Path -LiteralPath $job){Remove-Item -LiteralPath $job -Recurse -Force}
    } catch {$cleanup=$_.Exception.GetType().Name}
    [ordered]@{stage=$stage;primary_error_type=$primary;cleanup_error_type=$cleanup;extraction_exit=$extractExit;msi_errors=$msiErrors;probe_exit=$code;owned_extracted_children_absent=$childrenAbsent;private_root_absent=!(Test-Path -LiteralPath $job)} | ConvertTo-Json | Set-Content (Join-Path $evidence 'cleanup.json')
}
if($primary -or $cleanup -or $code -ne 0){exit 1}
