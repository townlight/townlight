param(
  [Parameter(Mandatory=$true)][string]$MsiPath,
  [ValidateSet('fresh','upgrade')][string]$Mode,
  [Parameter(Mandatory=$true)][string]$EvidenceRoot
)
$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_OS -ne 'Windows') { throw 'Disposable GitHub-hosted Windows only.' }
$MsiPath = (Resolve-Path -LiteralPath $MsiPath).Path
$repo = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
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
  & (Join-Path $PSScriptRoot 'verify-publication-signature.ps1') -Path $Path
  $log = Join-Path $EvidenceRoot "$Label-msiexec.log"
  $p = Start-Process msiexec.exe -ArgumentList @('/i',('"'+$Path+'"'),'/qn','/norestart','/l*v',('"'+$log+'"')) -WindowStyle Hidden -Wait -PassThru
  if ($p.ExitCode -notin @(0,3010)) { throw "$Label MSI installation failed: $($p.ExitCode)" }
  & (Join-Path $PSScriptRoot 'verify-publication-signature.ps1') -Path $exe
}
function Run-Installed([string]$Phase) {
  if (Get-NetTCPConnection -LocalPort 9222 -State Listen -ErrorAction SilentlyContinue) { throw 'Installed acceptance debug port is already occupied.' }
  New-Item -Path $debugPolicy -Force | Out-Null
  New-ItemProperty -LiteralPath $debugPolicy -Name $appName -PropertyType String -Value '--remote-debugging-port=9222' -Force | Out-Null
  $script:ownedApp = Start-Process -FilePath $exe -WindowStyle Hidden -PassThru
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
  if ($Mode -eq 'upgrade') {
    $previous=Join-Path $env:RUNNER_TEMP 'townlight-previous-release'
    New-Item -ItemType Directory -Path $previous | Out-Null
    gh release download townlight-windows-v1.8.1.1 --repo townlight/townlight --pattern '*.msi' --dir $previous
    if ($LASTEXITCODE -ne 0) { throw 'Previous public MSI download failed.' }
    $old=@(Get-ChildItem -LiteralPath $previous -Filter '*.msi' -File)
    if ($old.Count -ne 1 -or (Get-FileHash -LiteralPath $old[0].FullName -Algorithm SHA256).Hash.ToLowerInvariant() -ne '9e9363ec5119a2ee4c0d69b4dd40b21a535571a11eb3750d57b8a24d4472a5da') { throw 'Previous release identity mismatch.' }
    Install-Candidate $old[0].FullName 'baseline-1.8.1.1'
    Run-Installed 'seed'
    $marker=Join-Path $profile 'Data\maintenance-retention.txt'
    [IO.File]::WriteAllText($marker,'Synthetic Windows maintenance retention marker')
    foreach ($relative in @('config\city-profile.json','config\first-admin.json','Data\maintenance-retention.txt')) {
      $file=Join-Path $profile $relative
      if (-not (Test-Path -LiteralPath $file)) { throw "Baseline retention fixture absent: $relative" }
      $retained+=@{path=$relative;sha256=(Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash}
    }
  }
  Install-Candidate $MsiPath 'candidate-1.8.2.1'
  $registered=@(Product-Registration)
  if ($registered.Count -ne 1 -or $registered[0].DisplayVersion -ne '1.8.2.1') { throw 'Candidate registration/version or upgrade replacement failed.' }
  Run-Installed $Mode
  foreach ($entry in $retained) {
    if ((Get-FileHash -LiteralPath (Join-Path $profile $entry.path) -Algorithm SHA256).Hash -ne $entry.sha256) { throw "Upgrade changed retained $($entry.path)" }
  }
  $uninstallLog=Join-Path $EvidenceRoot 'uninstall.log'
  $p=Start-Process msiexec.exe -ArgumentList @('/x',('"'+$MsiPath+'"'),'/qn','/norestart','/l*v',('"'+$uninstallLog+'"')) -WindowStyle Hidden -Wait -PassThru
  if ($p.ExitCode -notin @(0,3010) -or @(Product-Registration).Count -ne 0 -or (Test-Path -LiteralPath $exe)) { throw 'Uninstall did not remove program and Windows registration.' }
  foreach ($relative in @('config\city-profile.json','Data\postgres\PG_VERSION')) {
    if (-not (Test-Path -LiteralPath (Join-Path $profile $relative))) { throw "Uninstall removed saved city state: $relative" }
  }
  [ordered]@{passed=$true;mode=$Mode;version='1.8.2.1';source_commit=$env:GITHUB_SHA;msi_sha256=(Get-FileHash -LiteralPath $MsiPath -Algorithm SHA256).Hash.ToLowerInvariant();retained=$retained;uninstall_preserved_profile=$true;at=[datetime]::UtcNow.ToString('o')} | ConvertTo-Json -Depth 8 | Set-Content (Join-Path $EvidenceRoot 'installed-acceptance.json') -Encoding utf8
} finally {
  if ($hadPolicy) { (Get-Item -LiteralPath $debugPolicy).SetValue($appName,$priorValue,$priorKind) }
  elseif (Test-Path -LiteralPath $debugPolicy) { Remove-ItemProperty -LiteralPath $debugPolicy -Name $appName -ErrorAction SilentlyContinue }
}
