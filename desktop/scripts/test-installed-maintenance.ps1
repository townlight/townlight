param(
  [Parameter(Mandatory=$true)][string]$MsiPath,
  [ValidateSet('fresh','upgrade','recorder','station-long')][string]$Mode,
  [Parameter(Mandatory=$true)][string]$EvidenceRoot,
  [ValidatePattern('^[0-9a-f]{40}$')][string]$SourceCommit = $env:GITHUB_SHA,
  [switch]$UnsignedRecorderCandidate,
  [ValidatePattern('^[0-9a-f]{64}$')][string]$ExpectedMsiSha256
)
$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_OS -ne 'Windows') { throw 'Disposable GitHub-hosted Windows only.' }
$MsiPath = (Resolve-Path -LiteralPath $MsiPath).Path
if ($UnsignedRecorderCandidate) {
  if ($Mode -ne 'recorder' -or -not $ExpectedMsiSha256) { throw 'Unsigned acceptance is limited to a hash-bound unpublished recorder candidate.' }
  if ((Get-FileHash -LiteralPath $MsiPath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $ExpectedMsiSha256) { throw 'Candidate artifact hash differs.' }
}
$repo = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$candidateVersion = (Get-Content (Join-Path $repo 'config/inspections-msi-candidate.json') -Raw | ConvertFrom-Json).windows_product_version
$EvidenceRoot = [IO.Path]::GetFullPath($EvidenceRoot)
New-Item -ItemType Directory -Force -Path $EvidenceRoot | Out-Null
$profile = Join-Path $env:LOCALAPPDATA 'CivicSuite'
if (Test-Path -LiteralPath $profile) { throw 'Clean installed acceptance requires an absent pre-existing Townlight profile.' }
$exe = Join-Path $env:ProgramFiles 'Townlight\townlight-desktop.exe'
$debugPolicy = 'HKLM:\SOFTWARE\Policies\Microsoft\Edge\WebView2\AdditionalBrowserArguments'
$appName = 'townlight-desktop.exe'
$priorKey = Get-Item -LiteralPath $debugPolicy -ErrorAction SilentlyContinue
$hadPolicy = $priorKey -and $priorKey.GetValueNames() -contains $appName
if ($hadPolicy) { $priorValue=$priorKey.GetValue($appName); $priorKind=$priorKey.GetValueKind($appName) }
$script:ownedApp = $null
function Install-Candidate([string]$Path, [string]$Label) {
  if (-not $UnsignedRecorderCandidate) { & (Join-Path $PSScriptRoot 'verify-publication-signature.ps1') -Path $Path }
  elseif ((Get-AuthenticodeSignature -LiteralPath $Path).Status -ne 'NotSigned') { throw 'Expected the unchanged unsigned PR build, not an invalid signature.' }
  $log = Join-Path $EvidenceRoot "$Label-msiexec.log"
  $p = Start-Process msiexec.exe -ArgumentList @('/i',('"'+$Path+'"'),'/qn','/norestart','/l*v',('"'+$log+'"')) -WindowStyle Hidden -Wait -PassThru
  if ($p.ExitCode -notin @(0,3010)) { throw "$Label MSI installation failed: $($p.ExitCode)" }
  if (-not $UnsignedRecorderCandidate) { & (Join-Path $PSScriptRoot 'verify-publication-signature.ps1') -Path $exe }
}
function Run-Installed([string]$Phase) {
  if (Get-NetTCPConnection -LocalPort 9222 -State Listen -ErrorAction SilentlyContinue) { throw 'Installed acceptance debug port is already occupied.' }
  New-Item -Path $debugPolicy -Force | Out-Null
  New-ItemProperty -LiteralPath $debugPolicy -Name $appName -PropertyType String -Value '--remote-debugging-port=9222' -Force | Out-Null
  $priorSuppressOpenBrowser=$env:TOWNLIGHT_SUPPRESS_OPEN_BROWSER
  $env:TOWNLIGHT_SUPPRESS_OPEN_BROWSER = '1'
  try { $script:ownedApp = Start-Process -FilePath $exe -WindowStyle Hidden -PassThru }
  finally { $env:TOWNLIGHT_SUPPRESS_OPEN_BROWSER=$priorSuppressOpenBrowser }
  try {
    $ready=$false; $deadline=(Get-Date).AddSeconds(120)
    while ((Get-Date) -lt $deadline) {
      $script:ownedApp.Refresh()
      if ($script:ownedApp.HasExited) { throw "Installed app exited: $($script:ownedApp.ExitCode)" }
      try {
        $pages=Invoke-RestMethod 'http://127.0.0.1:9222/json/list' -TimeoutSec 2
        $ready=@($pages | Where-Object { $_.type -eq 'page' -and $_.title -eq 'Townlight' -and $_.webSocketDebuggerUrl }).Count -gt 0
      } catch { $ready=$false }
      if ($ready) { break }; Start-Sleep -Seconds 1
    }
    if (-not $ready) { throw 'Installed Townlight WebView did not become ready.' }
    Push-Location (Join-Path $repo 'desktop')
    try {
      node tests/installed/maintenance.mjs $Phase $EvidenceRoot
      if ($LASTEXITCODE -ne 0) { throw "Installed $Phase acceptance failed." }
    } finally { Pop-Location }
  } finally {
    if ($script:ownedApp -and -not $script:ownedApp.HasExited) {
      # This Process object is the exact executable launched by this function.
      Stop-Process -Id $script:ownedApp.Id -Force
      $script:ownedApp.WaitForExit()
    }
    $script:ownedApp=$null
  }
}
function Product-Registration {
  $keys=@('HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*','HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*')
  @(Get-ItemProperty $keys -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -eq 'Townlight' })
}
try {
  $retained=@()
  $baselineVersion=$null
  if ($Mode -eq 'upgrade') {
    $previous=Join-Path $env:RUNNER_TEMP 'townlight-previous-release'
    New-Item -ItemType Directory -Path $previous | Out-Null
    gh release download townlight-windows-v1.9.2.1 --repo townlight/townlight --pattern '*.msi' --dir $previous
    if ($LASTEXITCODE -ne 0) { throw 'Previous public MSI download failed.' }
    $old=@(Get-ChildItem -LiteralPath $previous -Filter '*.msi' -File)
    if ($old.Count -ne 1 -or (Get-FileHash -LiteralPath $old[0].FullName -Algorithm SHA256).Hash.ToLowerInvariant() -ne '3242792ad6c825a5057d96c5e1d9d45fb5726ccbfba7ab24a2b428a54e63b0bf') { throw 'Previous release identity mismatch.' }
    Install-Candidate $old[0].FullName 'baseline-1.9.2.1'
    $baselineVersion='1.9.2.1'
    $baselineRegistered=@(Product-Registration)
    if ($baselineRegistered.Count -ne 1 -or $baselineRegistered[0].DisplayVersion -ne '1.9.2.1') { throw 'Baseline registration/version verification failed.' }
    Run-Installed 'seed'
    $marker=Join-Path $profile 'Data\maintenance-retention.txt'
    [IO.File]::WriteAllText($marker,'Synthetic Windows maintenance retention marker')
    foreach ($relative in @('config\city-profile.json','config\first-admin.json','Data\maintenance-retention.txt')) {
      $file=Join-Path $profile $relative
      if (-not (Test-Path -LiteralPath $file)) { throw "Baseline retention fixture absent: $relative" }
      $retained+=@{path=$relative;sha256=(Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash}
    }
  }
  Install-Candidate $MsiPath ('candidate-'+$candidateVersion)
  $registered=@(Product-Registration)
  if ($registered.Count -ne 1 -or $registered[0].DisplayVersion -ne $candidateVersion) { throw 'Candidate registration/version or upgrade replacement failed.' }

  if ($Mode -eq 'station-long' -and $env:TOWNLIGHT_TEST_DATA_ROOT) {
    # Keep PostgreSQL on the default filesystem; only recorded media uses the larger drive.

    $dataParent  = Join-Path $profile 'Data'
    $stationLink = Join-Path $dataParent 'station'
    if (Test-Path -LiteralPath $stationLink) {
        throw "Refusing to touch existing station directory: $stationLink"
    }

    $target = $env:TOWNLIGHT_TEST_DATA_ROOT
    New-Item -ItemType Directory -Path $target -Force     | Out-Null
    New-Item -ItemType Directory -Path $dataParent -Force | Out-Null

    New-Item -ItemType Junction -Path $stationLink -Target $target | Out-Null


    $py = Join-Path $env:ProgramFiles 'Townlight\_up_\runtime\payload\python\python.exe'
    if (-not (Test-Path -LiteralPath $py)) { throw "Bundled python missing: $py" }

    $probe  = Join-Path $EvidenceRoot 'station-long-disk-probe.json'
    $pyCode = @"
import json, os, shutil
target  = os.environ['TOWNLIGHT_TEST_DATA_ROOT']
station = r'''$stationLink'''
out = {
    'target': target,
    'target_disk_usage': shutil.disk_usage(target)._asdict(),
    'junction_path': station,
    'junction_disk_usage': shutil.disk_usage(station)._asdict(),
}
with open(r'''$probe''', 'w', encoding='utf-8') as f:
    json.dump(out, f, indent=2)
"@
    & $py -c $pyCode
    if ($LASTEXITCODE -ne 0) { throw "Python disk probe failed: $LASTEXITCODE" }

    $data = Get-Content -LiteralPath $probe -Raw | ConvertFrom-Json
    if ($data.junction_disk_usage.total -ne $data.target_disk_usage.total) {
        throw "Station path does not report the recording volume capacity"
    }
}

  Run-Installed $Mode
  foreach ($entry in $retained) {
    if ((Get-FileHash -LiteralPath (Join-Path $profile $entry.path) -Algorithm SHA256).Hash -ne $entry.sha256) { throw "Upgrade changed retained $($entry.path)" }
  }
  if (-not (Test-Path -LiteralPath $profile)) { throw 'Installed run did not preserve the Townlight profile.' }
  $retainedProfilePreserved=$true
  [ordered]@{passed=$true;mode=$Mode;version=$candidateVersion;source_commit=$SourceCommit;harness_commit=$env:GITHUB_SHA;signature_state=if($UnsignedRecorderCandidate){'unsigned internal PR candidate; not publication acceptance'}else{'verified signed'};msi_sha256=(Get-FileHash -LiteralPath $MsiPath -Algorithm SHA256).Hash.ToLowerInvariant();retained=$retained;baseline_version=$baselineVersion;retained_profile_preserved=$retainedProfilePreserved;at=[datetime]::UtcNow.ToString('o')} | ConvertTo-Json -Depth 8 | Set-Content (Join-Path $EvidenceRoot 'installed-acceptance.json') -Encoding utf8
} finally {
  if ($hadPolicy) { (Get-Item -LiteralPath $debugPolicy).SetValue($appName,$priorValue,$priorKind) }
}
