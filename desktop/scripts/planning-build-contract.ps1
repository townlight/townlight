# Shared build identity only; the installed selection remains planning-preview.
function Get-PlanningBuildContract {
    param(
        [ValidateSet('planning-preview', 'planning-staff-beta')][string]$Profile,
        [string]$RepoRoot = (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent)
    )
    $ContractPath = if ($Profile -eq 'planning-preview') { 'config/planning-msi-candidate.json' } else { 'config/planning-staff-beta.json' }
    $Contract = Get-Content -LiteralPath (Join-Path $RepoRoot $ContractPath) -Raw | ConvertFrom-Json
    # All command/path outputs are allowlisted here, not interpolated from JSON.
    $SourcesPath = if ($Profile -eq 'planning-preview') { 'config/planning-preview-sources.json' } else { 'config/planning-staff-beta-sources.json' }
    $OverlayPath = if ($Profile -eq 'planning-preview') { 'src-tauri/tauri.planning-candidate.conf.json' } else { 'src-tauri/tauri.planning-staff-beta.conf.json' }
    if ($Contract.profile -ne $Profile -or $Contract.sources_manifest -ne $SourcesPath -or $Contract.tauri_config -ne $OverlayPath) {
        throw 'Planning build profile/path contract mismatch.'
    }
    $Pins = Get-Content -LiteralPath (Join-Path $RepoRoot $SourcesPath) -Raw | ConvertFrom-Json
    $Overlay = Get-Content -LiteralPath (Join-Path $RepoRoot ('desktop/' + $OverlayPath)) -Raw | ConvertFrom-Json
    if ($Pins.profile -ne $Profile -or @($Overlay.PSObject.Properties).Count -ne 1 -or $Overlay.version -ne $Contract.desktop_version -or
        $Contract.desktop_version -notmatch '^(\d+)\.(\d+)\.(\d+)-(\d+)$') {
        throw 'Planning build profile/version contract mismatch.'
    }
    $MsiVersion = ($Matches[1..4] -join '.')
    if ($MsiVersion -ne $Contract.windows_product_version -or $Contract.core_package_version -ne '1.2.1') {
        throw 'Planning MSI/Core version contract mismatch.'
    }
    $Repositories = @('townlight/core', 'townlight/sunshine', 'townlight/meetings', 'townlight/ordinances', 'townlight/zone', 'townlight/plan', 'townlight/notice', 'townlight/access')
    $Names = @($Pins.sources.PSObject.Properties.Name)
    if (@(Compare-Object $Repositories $Names).Count) { throw 'Planning requires exactly the eight pinned module sources.' }
    foreach ($Pin in $Pins.sources.PSObject.Properties) {
        if ($Pin.Value -notmatch '^[0-9a-f]{40}$') { throw "Invalid Planning source pin: $($Pin.Name)" }
    }
    $IsDevelopment = $Profile -eq 'planning-preview'
    if ($IsDevelopment) {
        if ($Contract.development_only -ne $true -or $Contract.publication_allowed -ne $false -or $Pins.development_only -ne $true) {
            throw 'Planning development candidate must remain unsigned and non-publishable.'
        }
        $RecordsVersion = '1.7.3'
    } else {
        if ($Contract.development_only -ne $false -or $Pins.development_only -ne $false -or
            $Contract.signing_eligible -ne $true -or $Contract.publication_requires_signed_acceptance -ne $true -or
            $Contract.runtime_profile -ne 'planning-preview' -or $Contract.channel -ne 'opt-in-staff-beta' -or
            $Contract.release_tag -ne 'townlight-records-meetings-code-zoning-planning-v1.5.0-beta.1' -or
            $Contract.desktop_version -ne '1.5.0-1' -or $Contract.windows_product_version -ne '1.5.0.1' -or
            $Contract.planning_package_version -ne '0.3.0' -or $Contract.records_package_version -ne '1.7.4') {
            throw 'Planning staff beta release contract mismatch.'
        }
        $RecordsVersion = $Contract.records_package_version
    }
    return @{ Contract = $Contract; Pins = $Pins; ContractPath = $ContractPath; OverlayPath = $OverlayPath; DevelopmentOnly = $IsDevelopment; RecordsVersion = $RecordsVersion }
}
