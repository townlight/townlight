function Get-InspectionsBuildContract {
    param([string]$RepoRoot = (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent))
    $ContractPath = 'config/inspections-msi-candidate.json'
    $Contract = Get-Content -LiteralPath (Join-Path $RepoRoot $ContractPath) -Raw | ConvertFrom-Json
    $Pins = Get-Content -LiteralPath (Join-Path $RepoRoot 'config/inspections-preview-sources.json') -Raw | ConvertFrom-Json
    $Overlay = Get-Content -LiteralPath (Join-Path $RepoRoot 'desktop/src-tauri/tauri.inspections-candidate.conf.json') -Raw | ConvertFrom-Json
    if ($Contract.profile -ne 'inspections-preview' -or $Contract.sources_manifest -ne 'config/inspections-preview-sources.json' -or
        $Contract.tauri_config -ne 'src-tauri/tauri.inspections-candidate.conf.json' -or $Contract.development_only -ne $false -or
        $Contract.publication_allowed -ne $true -or $Contract.signing_eligible -ne $true -or
        $Contract.publication_requires_signed_acceptance -ne $true -or
        $Pins.profile -ne 'inspections-preview' -or $Pins.development_only -ne $false -or
        $Contract.desktop_version -ne '1.7.0-1' -or $Contract.windows_product_version -ne '1.7.0.1' -or
        $Overlay.version -ne $Contract.desktop_version -or $Overlay.identifier -ne 'org.townlight.inspections.candidate' -or
        $Overlay.productName -ne 'Townlight Inspections Candidate' -or
        $Overlay.bundle.windows.wix.upgradeCode -ne '9e5bde3b-4ce2-4568-97bc-8e618853b93e' -or
        $Contract.inspections_package_version -ne '0.3.0+dev.1' -or $Contract.permitting_package_version -ne '0.3.0+dev.1' -or
        $Contract.core_package_version -ne '1.2.1' -or $Contract.records_package_version -ne '1.7.4' -or
        $Contract.planning_package_version -ne '0.3.0') { throw 'Inspections release identity mismatch.' }
    $Repositories = @('townlight/core', 'townlight/sunshine', 'townlight/meetings', 'townlight/ordinances', 'townlight/zone', 'townlight/plan', 'townlight/notice', 'townlight/access', 'townlight/permit', 'townlight/inspect')
    if (@(Compare-Object $Repositories @($Pins.sources.PSObject.Properties.Name)).Count) { throw 'Inspections requires exactly ten source pins.' }
    foreach ($Pin in $Pins.sources.PSObject.Properties) {
        if ($Pin.Value -notmatch '^[0-9a-f]{40}$') { throw "Invalid Inspections source pin: $($Pin.Name)" }
    }
    return @{Contract=$Contract; Pins=$Pins; ContractPath=$ContractPath; OverlayPath=$Contract.tauri_config; DevelopmentOnly=$false; RecordsVersion=$Contract.records_package_version}
}
