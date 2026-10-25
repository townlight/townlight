param(
    [ValidateSet('automatic', 'zoning-beta', 'planning-preview', 'planning-staff-beta', 'permitting-preview')]
    [string]$RequestedProfile = 'automatic',
    [string]$SourceBranch = '',
    [switch]$SignForPublication
)
$ErrorActionPreference = 'Stop'
$RepoRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
. (Join-Path $PSScriptRoot 'planning-build-contract.ps1')
. (Join-Path $PSScriptRoot 'permitting-build-contract.ps1')
$Contract = Get-Content (Join-Path $RepoRoot 'config/planning-msi-candidate.json') -Raw | ConvertFrom-Json
$BetaContract = Get-Content (Join-Path $RepoRoot 'config/planning-staff-beta.json') -Raw | ConvertFrom-Json
$Selected = $RequestedProfile
if ($Selected -eq 'automatic') {
    $Selected = if ($SourceBranch -in @('permitting/connected-workflow', 'release/permitting-1-6-0-signing')) { 'permitting-preview' } elseif ($SourceBranch -eq $BetaContract.source_branch) { 'planning-staff-beta' } elseif ($SourceBranch -eq $Contract.source_branch) { 'planning-preview' } else { 'zoning-beta' }
}
$RecordsRef = '45042345b5ca90ff837ae99275058b1ace733c9a'
$PlanningRef = ''
$PermittingRef = ''
$TauriArgs = ''
$RuntimeProfile = $Selected
$PlanningContract = ''
$DesktopVersion = ''
if ($Selected -in @('planning-preview', 'planning-staff-beta')) {
    $Build = Get-PlanningBuildContract -Profile $Selected -RepoRoot $RepoRoot
    $Contract = $Build.Contract
    $Pins = $Build.Pins
    if ($Build.DevelopmentOnly -and $SignForPublication) {
        throw 'Planning MSI candidate is unsigned and private; signing/publication is not permitted.'
    }
    if ($SignForPublication -and $SourceBranch -ne 'main') {
        throw 'Planning publication signing requires an explicit manual main-branch run.'
    }
    $RecordsRef = $Pins.sources.'townlight/sunshine'
    $PlanningRef = $Pins.sources.'townlight/plan'
    # An allowlisted literal, never user-supplied command text.
    $TauriArgs = if ($Selected -eq 'planning-preview') { '--config src-tauri/tauri.planning-candidate.conf.json' } else { '--config src-tauri/tauri.planning-staff-beta.conf.json' }
    $RuntimeProfile = 'planning-preview'
    $PlanningContract = $Build.ContractPath
    $DesktopVersion = $Contract.desktop_version
}
if ($Selected -eq 'permitting-preview') {
    if ($SignForPublication -and $SourceBranch -ne 'main') {
        throw 'Permitting publication signing requires an explicit manual main-branch run.'
    }
    $Build = Get-PermittingBuildContract -RepoRoot $RepoRoot
    $RecordsRef = $Build.Pins.sources.'townlight/sunshine'
    $PlanningRef = $Build.Pins.sources.'townlight/plan'
    $PermittingRef = $Build.Pins.sources.'townlight/permit'
    $RuntimeProfile = 'permitting-preview'
    $PlanningContract = $Build.ContractPath
    $DesktopVersion = $Build.Contract.desktop_version
    $TauriArgs = '--config src-tauri/tauri.permitting-candidate.conf.json'
}
$Result = [ordered]@{product_profile=$Selected; runtime_profile=$RuntimeProfile; records_ref=$RecordsRef; planning_ref=$PlanningRef; permitting_ref=$PermittingRef; tauri_args=$TauriArgs; planning_contract=$PlanningContract; desktop_version=$DesktopVersion}
if ($env:GITHUB_OUTPUT) {
    foreach ($Key in $Result.Keys) { "$Key=$($Result[$Key])" | Out-File -LiteralPath $env:GITHUB_OUTPUT -Append -Encoding utf8 }
}
$Result | ConvertTo-Json
