param(
    [string]$Profile = "clerk-core",
    [string]$MenuStyle = "guided",
    [switch]$ShowMenu,
    [switch]$ShowReadiness,
    [switch]$DetectHost,
    [string]$ReadinessScenario = "nominal",
    [switch]$Execute,
    [switch]$ShowExecutorDesign,
    [switch]$ShowEvidenceSchema,
    [switch]$ShowArtifacts,
    [switch]$ShowProfileConfig,
    [switch]$ShowHealthChecks,
    [switch]$ShowPreflight,
    [switch]$GenerateInstallKit,
    [switch]$GenerateProfilePackage,
    [switch]$GenerateReleaseArtifacts,
    [string]$InstallerVersion = "0.1.0",
    [ValidateSet("all", "windows", "macos", "linux")]
    [string]$PackagePlatform = "all",
    [switch]$RunCleanroomProof,
    [switch]$RunCleanroomGate,
    [switch]$WriteReport,
    [string]$RunId = "",
    [string]$ApprovalToken = "",
    [string[]]$Module = @()
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = Resolve-Path (Join-Path $ScriptDir "..\..")
$Planner = Join-Path $RepoRoot "scripts\plan-installer.py"

$ArgsList = @($Planner, "--profile", $Profile, "--menu-style", $MenuStyle)
if (-not $RunCleanroomProof -and -not $RunCleanroomGate -and -not $GenerateProfilePackage -and -not $GenerateReleaseArtifacts) {
    $ArgsList += "--dry-run"
}
if ($ShowMenu) {
    $ArgsList += "--show-menu"
}
if ($ShowReadiness) {
    $ArgsList += @("--show-readiness", "--readiness-scenario", $ReadinessScenario)
    if ($DetectHost) {
        $ArgsList += "--detect-host"
    }
}
if ($Execute) {
    $ArgsList += "--execute"
    if ($ApprovalToken) {
        $ArgsList += @("--approval-token", $ApprovalToken)
    }
}
if ($ShowExecutorDesign) {
    $ArgsList += "--show-executor-design"
}
if ($ShowEvidenceSchema) {
    $ArgsList += "--show-evidence-schema"
}
if ($ShowArtifacts) {
    $ArgsList += "--show-artifacts"
}
if ($ShowProfileConfig) {
    $ArgsList += "--show-profile-config"
}
if ($ShowHealthChecks) {
    $ArgsList += "--show-health-checks"
}
if ($ShowPreflight) {
    $ArgsList += "--show-preflight"
}
if ($GenerateInstallKit) {
    $ArgsList += "--generate-install-kit"
}
if ($GenerateProfilePackage) {
    $ArgsList += @("--generate-profile-package", "--package-platform", $PackagePlatform)
}
if ($GenerateReleaseArtifacts) {
    $ArgsList += @("--generate-release-artifacts", "--package-platform", $PackagePlatform, "--installer-version", $InstallerVersion)
}
if ($RunCleanroomProof) {
    $ArgsList += "--run-cleanroom-proof"
    if ($RunId) {
        $ArgsList += @("--run-id", $RunId)
    }
}
if ($RunCleanroomGate) {
    $ArgsList += "--run-cleanroom-gate"
    if ($RunId) {
        $ArgsList += @("--run-id", $RunId)
    }
}
if ($WriteReport) {
    $ArgsList += "--write-report"
    if ($RunId) {
        $ArgsList += @("--run-id", $RunId)
    }
}
foreach ($ModuleId in $Module) {
    $ArgsList += @("--module", $ModuleId)
}

if ($RunCleanroomProof -or $RunCleanroomGate) {
    Write-Host "Townlight installer launcher: Windows cleanroom mode"
} else {
    Write-Host "Townlight installer launcher: Windows dry-run only"
}
Write-Host "Profile: $Profile"
Write-Host "Menu style: $MenuStyle"
if ($ShowReadiness) {
    Write-Host "Readiness scenario: $ReadinessScenario"
    if ($DetectHost) {
        Write-Host "Detection mode: host read-only"
    }
}
if ($Execute) {
    Write-Host "Execution gate requested: blocked by default"
}
if ($ShowExecutorDesign) {
    Write-Host "Executor design requested: dry-run only"
}
if ($ShowEvidenceSchema) {
    Write-Host "Evidence schema requested: dry-run only"
}
if ($ShowArtifacts) {
    Write-Host "Artifact/version resolver requested: dry-run only"
}
if ($ShowProfileConfig) {
    Write-Host "Profile config requested: dry-run only"
}
if ($ShowHealthChecks) {
    Write-Host "Health-check plan requested: dry-run only"
}
if ($ShowPreflight) {
    Write-Host "Executor preflight requested: blocked dry-run only"
}
if ($GenerateInstallKit) {
    Write-Host "Minimal Townlight Core install kit generation requested: writes installer/generated only"
}
if ($GenerateProfilePackage) {
    Write-Host "Profile package generation requested: writes installer/generated/packages only"
}
if ($GenerateReleaseArtifacts) {
    Write-Host "Release artifact generation requested: writes installer/generated/native and installer/dist"
}
if ($RunCleanroomProof) {
    Write-Host "Cleanroom proof requested: Docker cleanroom runner will build/start/verify/teardown"
}
if ($RunCleanroomGate) {
    Write-Host "Cleanroom gate requested: Docker cleanroom runner will build/start/verify/teardown and print concise pass/fail output"
}
if ($WriteReport) {
    Write-Host "Evidence report requested: installer/reports dry-run evidence only"
}
python @ArgsList
