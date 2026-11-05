# SPDX-License-Identifier: AGPL-3.0-only
# Preserve the tested runtime for the Windows product-name-only release.
[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$RepoRoot,[string]$PayloadRoot='', [string]$AcceptedMsi='', [switch]$SkipDownloads)
$ErrorActionPreference='Stop'
$expected='7553bb3ca457360a99878953f86d54211d77a250129a6744d9d637a2fb4be9e3'
if(!$PayloadRoot){$PayloadRoot=Join-Path $RepoRoot 'desktop/runtime/payload'}
foreach($subtree in @('python','postgres','ollama','station')){
    if(Test-Path (Join-Path $PayloadRoot $subtree)){throw 'Payload is populated; inspect it before assembly'}
}
if(!$AcceptedMsi){
    $cache=Join-Path $RepoRoot '.runtime-cache/windows-local-1.0'
    New-Item -ItemType Directory -Path $cache -Force|Out-Null
    $AcceptedMsi=Join-Path $cache 'Townlight-Windows-x64-1.7.1.1.msi'
    if(!(Test-Path $AcceptedMsi)){
        if($SkipDownloads){throw 'Accepted runtime MSI is not cached; downloads disabled'}
        Invoke-WebRequest -UseBasicParsing -Uri 'https://github.com/townlight/townlight/releases/download/townlight-v1.7.1-beta.1/Townlight-Windows-x64-1.7.1.1.msi' -OutFile $AcceptedMsi
    }
}
$AcceptedMsi=(Get-Item -LiteralPath $AcceptedMsi).FullName
if((Get-FileHash -LiteralPath $AcceptedMsi -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expected){throw 'Accepted runtime MSI hash mismatch'}
& (Join-Path $PSScriptRoot 'verify-publication-signature.ps1') -Path $AcceptedMsi
# Short path avoids Windows Installer's legacy path-length limit.
$extract=Join-Path ($env:SystemDrive+'\') ('tl-base-'+[guid]::NewGuid().ToString('N').Substring(0,8))
$resolved=[IO.Path]::GetFullPath($extract)
if($resolved -notmatch '^[A-Za-z]:\\tl-base-[0-9a-f]{8}$' -or (Test-Path $resolved)){throw 'Unsafe or existing extraction target'}
New-Item -ItemType Directory -Path $resolved|Out-Null
$owned=$resolved
try {
    $log=Join-Path $RepoRoot '.runtime-cache/accepted-runtime-extraction.log'
    New-Item -ItemType Directory -Force -Path (Split-Path $log -Parent)|Out-Null
    $p=Start-Process msiexec.exe -ArgumentList @('/a',('"'+$AcceptedMsi+'"'),'/qn',('TARGETDIR="'+$resolved+'"'),'/l*v',('"'+$log+'"')) -WindowStyle Hidden -Wait -PassThru
    if($p.ExitCode -ne 0){throw "Accepted MSI administrative extraction failed: $($p.ExitCode)"}
    $locks=@(Get-ChildItem -LiteralPath $resolved -Recurse -File -Filter runtime-payload-lock.json)
    if($locks.Count -ne 1){throw 'Accepted MSI payload is ambiguous'}
    $inputRoot=Split-Path $locks[0].FullName -Parent
    New-Item -ItemType Directory -Path $PayloadRoot -Force|Out-Null
    foreach($name in @('python','postgres','ollama','station','runtime-payload-lock.json')){
        $input=Join-Path $inputRoot $name
        if(!(Test-Path -LiteralPath $input)){throw "Accepted payload lacks $name"}
        if(Test-Path -LiteralPath $input -PathType Container){
            & robocopy.exe $input (Join-Path $PayloadRoot $name) /E /COPY:DAT /R:0 /W:0 /MT:4 /NFL /NDL /NJH /NJS /NP
            if($LASTEXITCODE -ge 8){throw "Accepted subtree copy failed: $name ($LASTEXITCODE)"}
        }else{
            Copy-Item -LiteralPath $input -Destination $PayloadRoot
        }
    }
    & (Join-Path $PayloadRoot 'python/python.exe') -I -B (Join-Path $PSScriptRoot 'bind-accepted-runtime.py') --repo $RepoRoot --payload $PayloadRoot --accepted-msi-sha256 $expected
    if($LASTEXITCODE -ne 0){throw 'Accepted runtime provenance binding failed'}
} finally {
    if([IO.Path]::GetFullPath($owned) -cne $resolved -or $resolved -notmatch '^[A-Za-z]:\\tl-base-[0-9a-f]{8}$'){throw 'Extraction cleanup ownership mismatch'}
    Remove-Item -LiteralPath $resolved -Recurse -Force
}
Write-Output 'Preserved accepted 1.7.1.1 runtime, Station media, signed Access launcher and all preview provenance.'
