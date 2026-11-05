function Get-InspectionsBuildContract {
    param([string]$RepoRoot = (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent))
    $ContractPath = 'config/inspections-msi-candidate.json'
    $Contract = Get-Content -LiteralPath (Join-Path $RepoRoot $ContractPath) -Raw | ConvertFrom-Json
    $Pins = Get-Content -LiteralPath (Join-Path $RepoRoot 'config/inspections-preview-sources.json') -Raw | ConvertFrom-Json
    $Overlay = Get-Content -LiteralPath (Join-Path $RepoRoot 'desktop/src-tauri/tauri.inspections-candidate.conf.json') -Raw | ConvertFrom-Json
    if ($Contract.profile -ne 'inspections-preview' -or $Contract.sources_manifest -ne 'config/inspections-preview-sources.json' -or
        $Contract.tauri_config -ne 'src-tauri/tauri.inspections-candidate.conf.json' -or $Contract.development_only -ne $false -or
        $Contract.publication_allowed -ne $false -or $Contract.signing_eligible -ne $true -or
        $Contract.publication_requires_signed_acceptance -ne $true -or
        $Contract.release_tag -ne 'townlight-v1.7.1-beta.1' -or
        $Pins.profile -ne 'inspections-preview' -or $Pins.development_only -ne $false -or
        $Contract.desktop_version -ne '1.7.1-1' -or $Contract.windows_product_version -ne '1.7.1.1' -or
        $Overlay.version -ne $Contract.desktop_version -or $Overlay.identifier -ne 'org.townlight.windows.fixes.candidate' -or
        $Overlay.productName -ne 'Townlight Windows Fix Candidate' -or
        $Overlay.bundle.windows.wix.upgradeCode -ne '0b97efae-2a2e-4e88-a81c-3aad1a52c2cc' -or
        $Contract.inspections_package_version -ne '0.3.0+dev.2' -or $Contract.permitting_package_version -ne '0.3.0+dev.2' -or
        $Contract.core_package_version -ne '1.3.0.dev2' -or $Contract.records_package_version -ne '1.8.0.dev2' -or
        $Contract.planning_package_version -ne '0.4.0.dev2' -or
        $Contract.meetings_package_version -ne '1.0.5' -or $Contract.code_package_version -ne '1.0.9' -or
        $Contract.zoning_package_version -ne '0.2.3' -or $Contract.access_package_version -ne '0.5.0' -or
        $Contract.notice_package_version -ne '0.3.0' -or $Contract.runtime_package_version -ne '0.2.1' -or
        $Contract.station_package_version -ne '0.3.0' -or $Contract.fresh_profile_only -ne $true -or
        $Contract.legacy_upgrade_supported -ne $false) { throw 'Inspections release identity mismatch.' }
    $Repositories = @('townlight/core', 'townlight/sunshine', 'townlight/meetings', 'townlight/ordinances', 'townlight/zone', 'townlight/plan', 'townlight/notice', 'townlight/access', 'townlight/permit', 'townlight/inspect', 'townlight/station')
    if (@(Compare-Object $Repositories @($Pins.sources.PSObject.Properties.Name)).Count) { throw 'Coordinated candidate requires exactly eleven component source pins.' }
    foreach ($Pin in $Pins.sources.PSObject.Properties) {
        if ($Pin.Value -notmatch '^[0-9a-f]{40}$') { throw "Invalid Inspections source pin: $($Pin.Name)" }
    }
    return @{Contract=$Contract; Pins=$Pins; ContractPath=$ContractPath; OverlayPath=$Contract.tauri_config; DevelopmentOnly=$false; RecordsVersion=$Contract.records_package_version}
}
