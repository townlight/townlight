param(
    [switch]$Readiness,
    [switch]$Plan,
    [switch]$Install,
    [switch]$Verify,
    [switch]$Repair,
    [switch]$Backup,
    [switch]$Restore,
    [switch]$Uninstall,
    [switch]$FirstRun,
    [switch]$SuiteLauncher,
    [switch]$GuidedSetup,
    [switch]$ManualPrerequisite,
    [ValidateSet("protected", "bearer", "open")]
    [string]$StaffMode = "protected",
    [switch]$WorkflowProof,
    [string[]]$Module
)

$ErrorActionPreference = "Stop"
$PackageDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = Resolve-Path (Join-Path $PackageDir "..\..\..\..\..")
$Planner = Join-Path $RepoRoot "scripts\plan-installer.py"
$Lifecycle = Join-Path $RepoRoot "scripts\run-clerk-core-installer.py"
$script:TownlightLastLifecycleExitCode = 0

function ConvertTo-WslArg([string]$Value) {
    $SingleQuote = [char]39
    $Replacement = $SingleQuote + '"' + $SingleQuote + '"' + $SingleQuote
    return $SingleQuote + $Value.Replace([string]$SingleQuote, $Replacement) + $SingleQuote
}

function ConvertTo-WslPath([string]$Value) {
    $Resolved = [System.IO.Path]::GetFullPath($Value)
    if ($Resolved -match '^([A-Za-z]):\\(.*)$') {
        $Drive = $Matches[1].ToLowerInvariant()
        $Tail = $Matches[2] -replace [regex]::Escape([string][char]92), '/'
        return "/mnt/$Drive/$Tail"
    }
    $Converted = & wsl wslpath -a $Resolved 2>$null
    if ($LASTEXITCODE -ne 0 -or -not $Converted) {
        throw "Could not translate Windows path for WSL: $Resolved"
    }
    return ($Converted | Select-Object -First 1).Trim()
}

function Test-WslDocker {
    $null = & wsl bash -lc 'docker info --format "{{.ServerVersion}}" >/dev/null 2>&1'
    return $LASTEXITCODE -eq 0
}

function Test-TownlightAdmin {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Get-TownlightLastExitCode {
    if ($null -eq $LASTEXITCODE) {
        return 0
    }
    return [int]$LASTEXITCODE
}

function Get-TownlightBootstrapReportDir {
    $ReportDir = Join-Path $RepoRoot "installer\reports\docker-wsl-bootstrap"
    New-Item -ItemType Directory -Force -Path $ReportDir | Out-Null
    return $ReportDir
}

function Write-TownlightBootstrapLog([string]$Name, [string]$Content) {
    $ReportDir = Get-TownlightBootstrapReportDir
    $Path = Join-Path $ReportDir $Name
    $Content | Out-File -FilePath $Path -Encoding utf8
    Write-Host "Bootstrap evidence: $Path"
}

function Register-TownlightRunOnce {
    $Command = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`" -FirstRun"
    New-ItemProperty -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\RunOnce" -Name "TownlightInstallerResume" -Value $Command -PropertyType String -Force | Out-Null
    Write-Host "Townlight will resume after reboot using Windows RunOnce."
}

function Get-TownlightInstallRoot {
    if ($env:TOWNLIGHT_INSTALLER_INSTALL_ROOT) {
        return $env:TOWNLIGHT_INSTALLER_INSTALL_ROOT
    }
    return (Join-Path $RepoRoot "installer\runtime\clerk-core")
}

function Read-TownlightWizardValue([string]$Label, [string]$Default = "", [switch]$Required) {
    $EnvName = "TOWNLIGHT_" + ($Label.ToUpperInvariant() -replace "[^A-Z0-9]+", "_").Trim("_")
    $Preset = [Environment]::GetEnvironmentVariable($EnvName)
    if ($Preset) {
        Write-Host "$Label`: $Preset"
        return $Preset
    }
    while ($true) {
        $Suffix = if ($Default) { " [$Default]" } else { "" }
        $Value = Read-Host "$Label$Suffix"
        if (-not $Value -and $Default) { $Value = $Default }
        if ($Value -or -not $Required) { return $Value }
        Write-Host "This field is required so Townlight can finish first-run setup."
    }
}

function Invoke-TownlightFirstRunWizard {
    $SetupPath = $env:TOWNLIGHT_SETUP_PATH
    if (-not $SetupPath) {
        Write-Host ""
        Write-Host "Choose setup path:"
        Write-Host "1. Guided Setup - install missing WSL/Docker components with admin consent."
        Write-Host "2. Manual Prerequisite - Docker Desktop + WSL2 are already installed."
        $SetupPath = Read-Host "Enter 1 for Guided Setup or 2 for Manual Prerequisite"
    }
    if ($SetupPath -eq "guided") { $SetupPath = "1" }
    if ($SetupPath -eq "manual") { $SetupPath = "2" }
    if ($SetupPath -ne "1" -and $SetupPath -ne "2") {
        Write-Error "Choose 1 or 2. No installation was started."
        exit 2
    }

    $OperatorName = Read-TownlightWizardValue "operator name" -Required
    $OrganizationName = Read-TownlightWizardValue "organization name" -Required
    $AdminEmail = Read-TownlightWizardValue "admin email" "admin@example.gov" -Required
    $TimeZone = Read-TownlightWizardValue "time zone" ([TimeZoneInfo]::Local.Id) -Required
    $LicenseAccept = $env:TOWNLIGHT_LICENSE_ACCEPT
    if (-not $LicenseAccept) {
        $LicenseAccept = Read-Host "Type ACCEPT to confirm Townlight terms and the Docker Desktop license prompt when Docker Desktop first starts"
    }
    if ($LicenseAccept -ne "ACCEPT") {
        Write-Error "License acceptance is required before first-run install. No installation was started."
        exit 2
    }

    $env:TOWNLIGHT_FIRST_ADMIN_EMAIL = $AdminEmail

    $ReportDir = Join-Path $RepoRoot "installer\reports\first-run"
    New-Item -ItemType Directory -Force -Path $ReportDir | Out-Null
    $InstallRoot = Get-TownlightInstallRoot
    $ReportPath = Join-Path $ReportDir "first-run-setup.json"
    @{
        setup_path = $(if ($SetupPath -eq "1") { "guided" } else { "manual-prerequisite" })
        operator_name = $OperatorName
        organization_name = $OrganizationName
        admin_email = $AdminEmail
        time_zone = $TimeZone
        license_acceptance = "accepted"
        install_root = $InstallRoot
        generated_at = (Get-Date).ToUniversalTime().ToString("o")
        rotation_required = $true
    } | ConvertTo-Json | Out-File -FilePath $ReportPath -Encoding utf8
    Write-Host "First-run setup evidence: $ReportPath"
    return @{
        setup_path = $SetupPath
        admin_email = $AdminEmail
        install_root = $InstallRoot
    }
}

function Show-TownlightPostInstallDashboard([hashtable]$Wizard) {
    $CredentialPath = Join-Path $Wizard.install_root "sources\townlight_records\data\secrets\first_admin_password"
    Write-Host ""
    Write-Host "Townlight staff dashboard is installed."
    Write-Host "Admin email: $($Wizard.admin_email)"
    Write-Host "Initial administrator credential file: $CredentialPath"
    Write-Host "Open that file once, sign in, rotate the credential immediately, then store the rotated value in your municipal vault."
    Write-Host "Suite launcher: http://127.0.0.1:18082/"
    Write-Host "Shared staff session check: TOWNLIGHT_CORE_SUITE_SESSION_SECRET is generated during install if missing."
    Write-Host "Records AI staff dashboard: http://127.0.0.1:18080/"
    Write-Host "TownlightMeetings staff dashboard: http://127.0.0.1:18081/"
    Write-Host "TownlightCode API/search: http://127.0.0.1:18820/"
}

function Invoke-TownlightGuidedSetup {
    if (-not (Test-TownlightAdmin)) {
        Write-Host "Townlight needs Windows administrator consent to install WSL/Docker prerequisites."
        Start-Process powershell.exe -Verb RunAs -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $PSCommandPath, "-GuidedSetup")
        exit 0
    }

    $Build = [Environment]::OSVersion.Version.Build
    $Arch = $env:PROCESSOR_ARCHITECTURE
    if ($Build -lt 19041) {
        Write-Error "Windows 10 build 19041+ or Windows 11 is required. Ask IT to upgrade Windows, then rerun Townlight."
        exit 2
    }
    if ($Arch -ne "AMD64") {
        Write-Error "This Townlight installer supports AMD64 Windows only in this run. ARM Windows is out of scope."
        exit 2
    }

    $ReportDir = Get-TownlightBootstrapReportDir
    $WslStatus = (& wsl --status 2>&1 | Out-String)
    Write-TownlightBootstrapLog "windows-wsl-status-before.txt" $WslStatus
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Installing WSL2 and Virtual Machine Platform with Microsoft's official wsl --install path."
        $WslInstall = (& wsl --install 2>&1 | Out-String)
        Write-TownlightBootstrapLog "windows-wsl-install.txt" $WslInstall
        Register-TownlightRunOnce
        Write-Host "If Windows asks to reboot, reboot now. Townlight will resume automatically."
        exit $LASTEXITCODE
    }

    $DockerDesktop = Join-Path $env:ProgramFiles "Docker\Docker\Docker Desktop.exe"
    if (-not (Test-Path $DockerDesktop)) {
        $InstallerUrl = "https://desktop.docker.com/win/main/amd64/Docker%20Desktop%20Installer.exe"
        $InstallerPath = Join-Path $ReportDir "Docker Desktop Installer.exe"
        Write-Host "Downloading Docker Desktop from the official Docker Desktop URL."
        Invoke-WebRequest -Uri $InstallerUrl -OutFile $InstallerPath
        $Hash = Get-FileHash -Algorithm SHA256 -Path $InstallerPath
        Write-TownlightBootstrapLog "docker-desktop-download.json" (@{ url = $InstallerUrl; path = $InstallerPath; sha256 = $Hash.Hash; downloaded_at = (Get-Date).ToUniversalTime().ToString("o") } | ConvertTo-Json)
        $InstallLog = Join-Path $ReportDir "docker-desktop-install.txt"
        $Proc = Start-Process -FilePath $InstallerPath -ArgumentList @("install", "--quiet") -Wait -PassThru -RedirectStandardOutput $InstallLog -RedirectStandardError "$InstallLog.err"
        Register-TownlightRunOnce
        if ($Proc.ExitCode -ne 0) {
            Write-Error "Docker Desktop installer exited with $($Proc.ExitCode). Review $InstallLog and $InstallLog.err, then ask IT for help."
            exit $Proc.ExitCode
        }
        Write-Host "Docker Desktop installed. Start Docker Desktop, accept Docker's license at first start, then rerun Townlight if it does not resume automatically."
        exit 0
    }

    Write-Host "Guided setup prerequisites are present. Continuing with Townlight readiness."
}

function Invoke-TownlightLifecycle([string]$Mode, [string[]]$LifecycleArgs, [switch]$ReturnAfter) {
    if (Test-WslDocker) {
        $RepoRootWsl = ConvertTo-WslPath $RepoRoot
        $EnvParts = @()
        if ($env:TOWNLIGHT_INSTALLER_RUN_ID) {
            $EnvParts += "export TOWNLIGHT_INSTALLER_RUN_ID=$(ConvertTo-WslArg $env:TOWNLIGHT_INSTALLER_RUN_ID);"
        }
        if ($env:TOWNLIGHT_INSTALLER_INSTALL_ROOT) {
            $InstallRootWsl = ConvertTo-WslPath $env:TOWNLIGHT_INSTALLER_INSTALL_ROOT
            $EnvParts += "export TOWNLIGHT_INSTALLER_INSTALL_ROOT=$(ConvertTo-WslArg $InstallRootWsl);"
        }
        if ($env:TOWNLIGHT_INSTALLER_PORT_OFFSET) {
            $EnvParts += "export TOWNLIGHT_INSTALLER_PORT_OFFSET=$(ConvertTo-WslArg $env:TOWNLIGHT_INSTALLER_PORT_OFFSET);"
        }
        if ($env:TOWNLIGHT_INSTALLER_PROJECT_SUFFIX) {
            $EnvParts += "export TOWNLIGHT_INSTALLER_PROJECT_SUFFIX=$(ConvertTo-WslArg $env:TOWNLIGHT_INSTALLER_PROJECT_SUFFIX);"
        }
        if ($env:TOWNLIGHT_FIRST_ADMIN_EMAIL) {
            $EnvParts += "export TOWNLIGHT_FIRST_ADMIN_EMAIL=$(ConvertTo-WslArg $env:TOWNLIGHT_FIRST_ADMIN_EMAIL);"
        }
        if ($env:DOCKER_CONFIG) {
            $DockerConfigWsl = ConvertTo-WslPath $env:DOCKER_CONFIG
            $EnvParts += "export DOCKER_CONFIG=$(ConvertTo-WslArg $DockerConfigWsl);"
        }
        $AllArgs = @($Mode) + @($LifecycleArgs)
        $QuotedArgs = $AllArgs | ForEach-Object { ConvertTo-WslArg $_ }
        $Command = ($EnvParts -join " ") + " cd $(ConvertTo-WslArg $RepoRootWsl) && python3 scripts/run-clerk-core-installer.py " + ($QuotedArgs -join " ")
        & wsl bash -lc $Command
        $ExitCode = Get-TownlightLastExitCode
        if ($ReturnAfter) {
            $script:TownlightLastLifecycleExitCode = $ExitCode
            return
        }
        exit $ExitCode
    }

    python $Lifecycle $Mode @LifecycleArgs
    $ExitCode = Get-TownlightLastExitCode
    if ($ReturnAfter) {
        $script:TownlightLastLifecycleExitCode = $ExitCode
        return
    }
    exit $ExitCode
}

Write-Host "Townlight city-core unsigned beta installer package"
Write-Host "Signing status: unsigned. Windows may show SmartScreen or unknown publisher warnings."
Write-Host "Trust path: verify the SHA256 checksum from installer\dist and the official Townlight release source before running lifecycle commands."
Write-Host "Project status: city-core beta; Linux and Windows matching-host lifecycle proof is required before promotion."

$PlannerArgs = @("--menu-style", "guided", "--dry-run")
$LifecycleModuleArgs = @()
$LifecycleModeArgs = @("--staff-mode", $StaffMode)
$DefaultProfileModules = @("townlight_records", "townlight_meetings", "townlight_code", "townlight_notice", "townlight_access")
foreach ($DefaultModule in $DefaultProfileModules) {
    $LifecycleModuleArgs += @("--module", $DefaultModule)
}

if ($WorkflowProof) {
    $LifecycleModeArgs += "--workflow-proof"
}
if ($Module -and $Module.Count -gt 0) {
    $PlannerArgs = @("--profile", "custom") + $PlannerArgs
    $LifecycleModuleArgs = @()
    foreach ($SelectedModule in $Module) {
        $PlannerArgs += @("--module", $SelectedModule)
        $LifecycleModuleArgs += @("--module", $SelectedModule)
    }
} else {
    $PlannerArgs = @("--profile", "city-core") + $PlannerArgs
}

if ($Plan) {
    python $Planner @PlannerArgs
    exit (Get-TownlightLastExitCode)
}

if ($SuiteLauncher) {
    $SuiteLauncherScript = Join-Path $PackageDir "suite-launcher\scripts\serve.mjs"
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
        Write-Error "Node.js is required to serve the suite launcher. Install Node.js 20+, reopen this terminal, then rerun with -SuiteLauncher."
        exit 2
    }
    if (-not (Test-Path $SuiteLauncherScript)) {
        Write-Error "Suite launcher files are missing from this package. Regenerate the city-core package before serving the launcher."
        exit 2
    }
    & node $SuiteLauncherScript --port 18082
    exit (Get-TownlightLastExitCode)
}

if ($GuidedSetup) {
    Invoke-TownlightGuidedSetup
    python $Planner @PlannerArgs --show-readiness --detect-host
    exit (Get-TownlightLastExitCode)
}

if ($FirstRun) {
    $Wizard = Invoke-TownlightFirstRunWizard
    if ($Wizard.setup_path -eq "1") {
        Invoke-TownlightGuidedSetup
    }
    python $Planner @PlannerArgs --show-readiness --detect-host
    $PlannerExit = Get-TownlightLastExitCode
    if ($PlannerExit -ne 0) { exit $PlannerExit }
    if ($env:TOWNLIGHT_FIRST_RUN_SMOKE_ONLY -eq "1") {
        Write-Host "First-run smoke only: setup wizard and readiness passed; install was not started."
        exit 0
    }
    Invoke-TownlightLifecycle "install" (@($LifecycleModeArgs) + @($LifecycleModuleArgs)) -ReturnAfter
    $InstallExit = $script:TownlightLastLifecycleExitCode
    if ($InstallExit -ne 0) { exit $InstallExit }
    Show-TownlightPostInstallDashboard $Wizard
    exit 0
}

if ($ManualPrerequisite) {
    python $Planner @PlannerArgs --show-readiness --detect-host
    $PlannerExit = Get-TownlightLastExitCode
    if ($PlannerExit -ne 0) { exit $PlannerExit }
    Invoke-TownlightLifecycle "install" (@($LifecycleModeArgs) + @($LifecycleModuleArgs))
}

if ($Install) {
    Invoke-TownlightLifecycle "install" (@($LifecycleModeArgs) + @($LifecycleModuleArgs))
}

if ($Verify) {
    Invoke-TownlightLifecycle "verify" (@($LifecycleModeArgs) + @($LifecycleModuleArgs))
}

if ($Repair) {
    Invoke-TownlightLifecycle "repair" (@($LifecycleModeArgs) + @($LifecycleModuleArgs))
}

if ($Backup) {
    Invoke-TownlightLifecycle "backup" (@($LifecycleModuleArgs))
}

if ($Restore) {
    Invoke-TownlightLifecycle "restore" (@($LifecycleModuleArgs))
}

if ($Uninstall) {
    Invoke-TownlightLifecycle "uninstall" (@($LifecycleModuleArgs))
}

python $Planner @PlannerArgs --show-readiness --detect-host
exit $LASTEXITCODE
