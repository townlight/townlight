param(
  [Parameter(Mandatory=$true)][string]$MsiPath,
  [ValidateSet('fresh','upgrade','recorder','community')][string]$Mode,
  [Parameter(Mandatory=$true)][string]$EvidenceRoot,
  [ValidatePattern('^[0-9a-f]{40}$')][string]$SourceCommit = $env:GITHUB_SHA,
  [switch]$UnsignedRecorderCandidate,
  [ValidatePattern('^[0-9a-f]{64}$')][string]$ExpectedMsiSha256
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'installed-foreground-process.ps1')
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
$script:communityFixture = $null
function Resolve-CommunityPython {
  $requested = $env:TOWNLIGHT_TEST_PYTHON
  if ($requested) {
    $command = Get-Command -Name $requested -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($command) { return $command.Source }
    if (Test-Path -LiteralPath $requested -PathType Leaf) { return (Resolve-Path -LiteralPath $requested).Path }
    throw "TOWNLIGHT_TEST_PYTHON does not resolve to an executable: $requested"
  }
  $command = Get-Command -Name python -CommandType Application -ErrorAction Stop | Select-Object -First 1
  if (-not $command) { throw 'Community acceptance requires python from PATH.' }
  return $command.Source
}
function Assert-CommunityTestTools([string]$Python) {
  $portalRoot = Join-Path $repo 'portal'
  Push-Location $portalRoot
  try {
    & $Python -c "import aiosmtpd, django, portal, waitress, cryptography"
    if ($LASTEXITCODE -ne 0) { throw 'Community acceptance requires aiosmtpd and the portal test tools installed for the selected Python.' }
  } finally { Pop-Location }
}
function Start-CommunityFixture([string]$Python) {
  $fixtureRoot = Join-Path $EvidenceRoot 'community-fixture'
  New-Item -ItemType Directory -Force -Path $fixtureRoot | Out-Null
  $portalRoot = Join-Path $repo 'portal'
  $scriptPath = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\tests\installed\community-services.py'))
  if (-not (Test-Path -LiteralPath $scriptPath -PathType Leaf)) { throw "Community fixture script is absent: $scriptPath" }
  if (-not (Test-Path -LiteralPath $portalRoot -PathType Container)) { throw "Portal root is absent: $portalRoot" }
  $portalPort = 24680
  $smtpPort = 24681
  foreach ($port in @($portalPort, $smtpPort)) {
    if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) { throw "Community fixture port $port is already occupied." }
  }
  $stdout = Join-Path $EvidenceRoot 'community-fixture.stdout.log'
  $stderr = Join-Path $EvidenceRoot 'community-fixture.stderr.log'
  $arguments = @(('"'+$scriptPath+'"'),'--root',('"'+$fixtureRoot+'"'),'--portal-root',('"'+$portalRoot+'"'),'--portal-scheme','https','--portal-port',[string]$portalPort,'--smtp-port',[string]$smtpPort)
  $process = Start-Process -FilePath $Python -ArgumentList $arguments -WorkingDirectory $repo -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru
  return [pscustomobject]@{
    Process = $process
    Root = $fixtureRoot
    PortalPort = $portalPort
    SmtpPort = $smtpPort
    StatePath = Join-Path $fixtureRoot 'fixture-state.json'
    OwnedCertificate = $null
  }
}
function Add-CommunityFixtureTrust($Fixture, [string]$CaPath) {
  if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_OS -ne 'Windows' -or $env:RUNNER_ENVIRONMENT -ne 'github-hosted') { throw "Refusing fixture trust outside ephemeral GitHub-hosted Windows runner." }
  if ($Fixture.OwnedCertificate) { return }
  $cert = New-Object -TypeName System.Security.Cryptography.X509Certificates.X509Certificate2 -ArgumentList $CaPath
  $store = New-Object -TypeName System.Security.Cryptography.X509Certificates.X509Store -ArgumentList @([System.Security.Cryptography.X509Certificates.StoreName]::Root, [System.Security.Cryptography.X509Certificates.StoreLocation]::LocalMachine)
  try {
    $store.Open([System.Security.Cryptography.X509Certificates.OpenFlags]::ReadWrite)
    $existing = $store.Certificates.Find([System.Security.Cryptography.X509Certificates.X509FindType]::FindByThumbprint, $cert.Thumbprint, $false)
    if ($existing.Count -gt 0) { throw "Fixture CA thumbprint $($cert.Thumbprint) is already trusted; refusing to alter preexisting trust." }
    Write-Host "Community fixture: adding CA trust to LocalMachine Root"
    $Fixture.OwnedCertificate = $cert
    $store.Add($cert)
    Write-Host "Community fixture: CA trust added"
  } catch {
    if (-not $Fixture.OwnedCertificate) { $cert.Dispose() }
    throw
  } finally {
    $store.Close()
    $store.Dispose()
  }
}
function Remove-CommunityFixtureTrust($Fixture) {
  if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_OS -ne 'Windows' -or $env:RUNNER_ENVIRONMENT -ne 'github-hosted') { throw "Refusing fixture trust removal outside ephemeral GitHub-hosted Windows runner." }
  if (-not $Fixture -or -not $Fixture.OwnedCertificate) { return }
  $cert = $Fixture.OwnedCertificate
  $thumbprint = $cert.Thumbprint
  $store = New-Object -TypeName System.Security.Cryptography.X509Certificates.X509Store -ArgumentList @([System.Security.Cryptography.X509Certificates.StoreName]::Root, [System.Security.Cryptography.X509Certificates.StoreLocation]::LocalMachine)
  try {
    $store.Open([System.Security.Cryptography.X509Certificates.OpenFlags]::ReadWrite)
    $store.Remove($cert)
  } finally {
    $store.Close()
    $store.Dispose()
    $Fixture.OwnedCertificate = $null
    $cert.Dispose()
  }
  $verify = New-Object -TypeName System.Security.Cryptography.X509Certificates.X509Store -ArgumentList @([System.Security.Cryptography.X509Certificates.StoreName]::Root, [System.Security.Cryptography.X509Certificates.StoreLocation]::LocalMachine)
  try {
    $verify.Open([System.Security.Cryptography.X509Certificates.OpenFlags]::ReadOnly)
    $remaining = $verify.Certificates.Find([System.Security.Cryptography.X509Certificates.X509FindType]::FindByThumbprint, $thumbprint, $false)
    if ($remaining.Count -gt 0) { throw "Fixture CA thumbprint $thumbprint remained trusted after removal." }
    Write-Host "Community fixture: CA trust removed and verified absent"
  } finally {
    $verify.Close()
    $verify.Dispose()
  }
}
function Wait-CommunityFixture($Fixture) {
  $deadline = (Get-Date).AddSeconds(180)
  while ((Get-Date) -lt $deadline) {
    $Fixture.Process.Refresh()
    if ($Fixture.Process.HasExited) {
      $stderrPath = Join-Path $EvidenceRoot 'community-fixture.stderr.log'
      $tail = if (Test-Path -LiteralPath $stderrPath) { Get-Content -LiteralPath $stderrPath -Tail 40 | Out-String } else { '' }
      throw "Community fixture exited before readiness: $($Fixture.Process.ExitCode)`n$tail"
    }
    if (Test-Path -LiteralPath $Fixture.StatePath) {
      try { $state = Get-Content -LiteralPath $Fixture.StatePath -Raw | ConvertFrom-Json } catch { $state = $null }
      if ($state -and [int]$state.pid -eq [int]$Fixture.Process.Id) {
        $expectedPortal = "https://127.0.0.1:$($Fixture.PortalPort)"
        if ($state.portal_scheme -ne 'https') { throw "Community fixture state portal_scheme must be https but was '$($state.portal_scheme)'." }
        if ([string]$state.portal_url -ne $expectedPortal) { throw "Community fixture state portal_url mismatch: expected $expectedPortal but state reported $($state.portal_url)" }
        if (-not $state.runtime_environment -or [string]$state.runtime_environment.TOWNLIGHT_PUBLISHER_PUBLISH_ORIGIN -ne $expectedPortal) { throw "Community fixture state runtime_environment.TOWNLIGHT_PUBLISHER_PUBLISH_ORIGIN mismatch: expected $expectedPortal but state reported $($state.runtime_environment.TOWNLIGHT_PUBLISHER_PUBLISH_ORIGIN)" }
        $expectedCa = [IO.Path]::GetFullPath((Join-Path $Fixture.Root 'tls\ca.crt'))
        if (-not $state.paths.ca_cert) { throw 'Community fixture state did not expose paths.ca_cert.' }
        $actualCa = [IO.Path]::GetFullPath([string]$state.paths.ca_cert)
        if ($actualCa -ne $expectedCa) { throw "Community fixture CA path mismatch: expected $expectedCa but state reported $actualCa" }
        Add-CommunityFixtureTrust $Fixture $actualCa
        $httpsReady = $false
        try {
          $response = Invoke-WebRequest -Uri "https://127.0.0.1:$($Fixture.PortalPort)/" -UseBasicParsing -TimeoutSec 2
          $httpsReady = $null -ne $response.StatusCode
        } catch { $httpsReady = $null -ne $_.Exception.Response }
        if ($httpsReady) { return $state }
      }
    }
    Start-Sleep -Milliseconds 500
  }
  throw 'Community fixture did not become ready (fixture-state, trust, and HTTPS) within 180 seconds.'
}
function Set-CommunityRuntimeEnvironment($Fixture, $State, $Restore) {
  if (-not $State.runtime_environment) { throw 'Community fixture state did not expose runtime_environment.' }
  $values = @{}
  foreach ($property in $State.runtime_environment.PSObject.Properties) {
    $values[$property.Name] = [string]$property.Value
  }
  $values['TOWNLIGHT_COMMUNITY_FIXTURE_ROOT'] = $Fixture.Root
  $values['TOWNLIGHT_COMMUNITY_PORTAL_URL'] = "https://127.0.0.1:$($Fixture.PortalPort)"
  foreach ($name in $values.Keys) {
    $Restore[$name] = [pscustomobject]@{
      present = Test-Path -LiteralPath ('Env:'+$name)
      value = [Environment]::GetEnvironmentVariable($name, 'Process')
    }
    [Environment]::SetEnvironmentVariable($name, $values[$name], 'Process')
  }
}
function Restore-ProcessEnvironment($Restore) {
  foreach ($name in @($Restore.Keys)) {
    $prior = $Restore[$name]
    if ($prior.present) { [Environment]::SetEnvironmentVariable($name, $prior.value, 'Process') }
    else { [Environment]::SetEnvironmentVariable($name, $null, 'Process') }
  }
}
function Stop-CommunityFixture($Fixture) {
  if (-not $Fixture) { return }
  $process = $Fixture.Process
  $process.Refresh()
  if (-not $process.HasExited) {
    # This is the exact Process object/PID started by Start-CommunityFixture.
    Stop-Process -Id $process.Id -Force
    $process.WaitForExit()
  }
}
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
  $fixture = $null
  $environmentRestore = @{}
  New-Item -Path $debugPolicy -Force | Out-Null
  New-ItemProperty -LiteralPath $debugPolicy -Name $appName -PropertyType String -Value '--remote-debugging-port=9222' -Force | Out-Null
  $communityReady = $false
  try {
    if ($Phase -eq 'community') {
      $python = Resolve-CommunityPython
      Assert-CommunityTestTools $python
      $fixture = Start-CommunityFixture $python
      $fixtureState = Wait-CommunityFixture $fixture
      Set-CommunityRuntimeEnvironment $fixture $fixtureState $environmentRestore
      $script:communityFixture = [ordered]@{
        role = 'actual headless acceptance fixture; not an acceptance result'
        pid = $fixture.Process.Id
        root = $fixture.Root
        portal_port = $fixture.PortalPort
        smtp_port = $fixture.SmtpPort
        state = $fixture.StatePath
        readiness = 'fixture-state PID matched the owned process, paths.ca_cert matched fixture root/tls/ca.crt, and the portal answered verified HTTPS'
        fixture_is_acceptance = $false
      }
    }
    $env:TOWNLIGHT_SUPPRESS_OPEN_BROWSER = '1'
    try { $script:ownedApp = Start-Process -FilePath $exe -WindowStyle Hidden -PassThru }
    finally { Remove-Item Env:TOWNLIGHT_SUPPRESS_OPEN_BROWSER }
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
        if ($Phase -eq 'community') { $communityReady = $true }
      } finally { Pop-Location }
    } finally {
      if ($script:ownedApp -and -not $script:ownedApp.HasExited) {
        # This Process object is the exact executable launched by this function.
        Stop-Process -Id $script:ownedApp.Id -Force
        $script:ownedApp.WaitForExit()
      }
      if ($script:ownedApp) {
        $script:ownedApp.Refresh()
        [ordered]@{
          pid = $script:ownedApp.Id
          exited = $script:ownedApp.HasExited
          at = [DateTime]::UtcNow.ToString('o')
        } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $EvidenceRoot 'communications-app-stopped.json') -Encoding utf8
      }
      $script:ownedApp=$null
    }
    if ($communityReady) {
      $staffStdout = Join-Path $EvidenceRoot 'communications-staff-host.stdout.log'
      $staffStderr = Join-Path $EvidenceRoot 'communications-staff-host.stderr.log'
      $staffStopStdout = Join-Path $EvidenceRoot 'staff-stop.stdout.log'
      $staffStopStderr = Join-Path $EvidenceRoot 'staff-stop.stderr.log'

      Invoke-InstalledWithCleanup -Action {
        Write-Host 'Community phase: staff host start'
        Invoke-InstalledForegroundProcess -FilePath $exe -ArgumentList @('--townlight-staff-host','start') -Label 'Townlight staff host start' -Stdout $staffStdout -Stderr $staffStderr -TimeoutSeconds 300

        Write-Host 'Community phase: unattended verification'
        Push-Location (Join-Path $repo 'desktop')
        try {
          node tests/installed/communications-unattended.mjs verify $EvidenceRoot $env:TOWNLIGHT_COMMUNITY_PORTAL_URL $fixture.Root
          if ($LASTEXITCODE -ne 0) { throw 'Installed community communications unattended verification failed.' }
        } finally {
          Pop-Location
        }
      } -Cleanup {
        Write-Host 'Community phase: staff host stop'
        Invoke-InstalledForegroundProcess -FilePath $exe -ArgumentList @('--townlight-staff-host','stop') -Label 'Townlight staff host stop' -Stdout $staffStopStdout -Stderr $staffStopStderr -TimeoutSeconds 120
      }
    }
  } finally {
    # The fixture must outlive the app, and only then may its exact owned PID stop.
    try {
      if ($fixture) { Write-Host 'Community phase: fixture shutdown' }
      Stop-CommunityFixture $fixture
    } finally {
      try {
        if ($environmentRestore.Count -gt 0) { Restore-ProcessEnvironment $environmentRestore }
      } finally {
        Remove-CommunityFixtureTrust $fixture
      }
    }
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
    gh release download townlight-windows-v1.9.3.2 --repo townlight/townlight --pattern '*.msi' --dir $previous
    if ($LASTEXITCODE -ne 0) { throw 'Previous public MSI download failed.' }
    $old=@(Get-ChildItem -LiteralPath $previous -Filter '*.msi' -File)
    if ($old.Count -ne 1 -or (Get-FileHash -LiteralPath $old[0].FullName -Algorithm SHA256).Hash.ToLowerInvariant() -ne 'b00510e0649552b5efd9744513bf9fcaf59cbee5755fd864eb922a5151c96b77') { throw 'Previous release identity mismatch.' }
    Install-Candidate $old[0].FullName 'baseline-1.9.3.2'
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
  Run-Installed $Mode
  if ($Mode -eq 'community') {
    foreach ($relative in @('community-setup.json','community-workflows.json','community-readback.json','community-outcome.json','backup-restore.json','community-fixture/fixture-state.json')) {
      if (-not (Test-Path -LiteralPath (Join-Path $EvidenceRoot $relative))) { throw "Community acceptance evidence absent: $relative" }
    }
  }
  foreach ($entry in $retained) {
    if ((Get-FileHash -LiteralPath (Join-Path $profile $entry.path) -Algorithm SHA256).Hash -ne $entry.sha256) { throw "Upgrade changed retained $($entry.path)" }
  }
  $uninstallLog=Join-Path $EvidenceRoot 'uninstall.log'
  $p=Start-Process msiexec.exe -ArgumentList @('/x',('"'+$MsiPath+'"'),'/qn','/norestart','/l*v',('"'+$uninstallLog+'"')) -WindowStyle Hidden -Wait -PassThru
  if ($p.ExitCode -notin @(0,3010) -or @(Product-Registration).Count -ne 0 -or (Test-Path -LiteralPath $exe)) { throw 'Uninstall did not remove program and Windows registration.' }
  foreach ($relative in @('config\city-profile.json','Data\postgres\PG_VERSION')) {
    if (-not (Test-Path -LiteralPath (Join-Path $profile $relative))) { throw "Uninstall removed saved city state: $relative" }
  }
  $communityFixtureEvidence = $null
  $communityEvidence = $null
  if ($Mode -eq 'community') {
    $communityFixtureEvidence = $script:communityFixture
    $communityEvidence = [ordered]@{
      outcome = 'community-outcome.json'
      workflows = 'community-workflows.json'
      readback = 'community-readback.json'
      backup_restore = 'backup-restore.json'
      fixture_state = 'community-fixture/fixture-state.json'
      fixture_is_acceptance = $false
      note = 'Fixture serves synthetic local services only; candidate acceptance comes from the listed installed-app outcome, readback and backup-restore evidence.'
    }
  }
  [ordered]@{passed=$true;mode=$Mode;version=$candidateVersion;source_commit=$SourceCommit;harness_commit=$env:GITHUB_SHA;signature_state=if($UnsignedRecorderCandidate){'unsigned internal PR candidate; not publication acceptance'}else{'verified signed'};msi_sha256=(Get-FileHash -LiteralPath $MsiPath -Algorithm SHA256).Hash.ToLowerInvariant();retained=$retained;uninstall_preserved_profile=$true;community_fixture=$communityFixtureEvidence;community_evidence=$communityEvidence;at=[datetime]::UtcNow.ToString('o')} | ConvertTo-Json -Depth 8 | Set-Content (Join-Path $EvidenceRoot 'installed-acceptance.json') -Encoding utf8
} finally {
  if ($hadPolicy) { (Get-Item -LiteralPath $debugPolicy).SetValue($appName,$priorValue,$priorKind) }
  elseif (Test-Path -LiteralPath $debugPolicy) { Remove-ItemProperty -LiteralPath $debugPolicy -Name $appName -ErrorAction SilentlyContinue }
}
