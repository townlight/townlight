param(
    [ValidateSet('automatic', 'zoning-beta', 'planning-preview')]
    [string]$RequestedProfile = 'automatic',
    [string]$SourceBranch = '',
    [switch]$SignForPublication
)
$ErrorActionPreference = 'Stop'
$RepoRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$Contract = Get-Content (Join-Path $RepoRoot 'config/planning-msi-candidate.json') -Raw | ConvertFrom-Json
$Selected = $RequestedProfile
if ($Selected -eq 'automatic') {
    $Selected = if ($SourceBranch -eq $Contract.source_branch) { 'planning-preview' } else { 'zoning-beta' }
}
$RecordsRef = '45042345b5ca90ff837ae99275058b1ace733c9a'
$PlanningRef = ''
$TauriArgs = ''
if ($Selected -eq 'planning-preview') {
    if ($SignForPublication -or $Contract.publication_allowed -or -not $Contract.development_only) {
        throw 'Planning MSI candidate is unsigned and private; signing/publication is not permitted.'
    }
    $Pins = Get-Content (Join-Path $RepoRoot $Contract.sources_manifest) -Raw | ConvertFrom-Json
    $Overlay = Get-Content (Join-Path $RepoRoot ('desktop/' + $Contract.tauri_config)) -Raw | ConvertFrom-Json
    if ($Contract.profile -ne $Selected -or $Pins.profile -ne $Selected -or -not $Pins.development_only -or $Overlay.version -ne $Contract.desktop_version) {
        throw 'Planning candidate profile/version contract mismatch.'
    }
    foreach ($Pin in $Pins.sources.PSObject.Properties) {
        if ($Pin.Value -notmatch '^[0-9a-f]{40}$') { throw "Invalid candidate source pin: $($Pin.Name)" }
    }
    $RecordsRef = $Pins.sources.'townlight/sunshine'
    $PlanningRef = $Pins.sources.'townlight/plan'
    # An allowlisted literal, never user-supplied command text.
    $TauriArgs = '--config src-tauri/tauri.planning-candidate.conf.json'
}
$Result = [ordered]@{product_profile=$Selected; records_ref=$RecordsRef; planning_ref=$PlanningRef; tauri_args=$TauriArgs}
if ($env:GITHUB_OUTPUT) {
    foreach ($Key in $Result.Keys) { "$Key=$($Result[$Key])" | Out-File -LiteralPath $env:GITHUB_OUTPUT -Append -Encoding utf8 }
}
$Result | ConvertTo-Json
