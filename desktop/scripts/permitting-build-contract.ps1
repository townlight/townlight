function Get-PermittingBuildContract {
    param([string]$RepoRoot = (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent))
    $ContractPath = 'config/permitting-msi-candidate.json'
    $Contract = Get-Content -LiteralPath (Join-Path $RepoRoot $ContractPath) -Raw | ConvertFrom-Json
    $Pins = Get-Content -LiteralPath (Join-Path $RepoRoot 'config/permitting-preview-sources.json') -Raw | ConvertFrom-Json
    $Overlay = Get-Content -LiteralPath (Join-Path $RepoRoot 'desktop/src-tauri/tauri.permitting-candidate.conf.json') -Raw | ConvertFrom-Json
    if ($Contract.profile -ne 'permitting-preview' -or $Contract.sources_manifest -ne 'config/permitting-preview-sources.json' -or
        $Contract.tauri_config -ne 'src-tauri/tauri.permitting-candidate.conf.json' -or $Contract.development_only -ne $true -or
        $Contract.publication_allowed -ne $false -or $Pins.profile -ne 'permitting-preview' -or $Pins.development_only -ne $true -or
        $Contract.desktop_version -ne '1.6.0-1' -or $Contract.windows_product_version -ne '1.6.0.1' -or
        $Overlay.version -ne $Contract.desktop_version -or $Overlay.identifier -ne 'org.townlight.permitting.candidate' -or
        $Overlay.productName -ne 'Townlight Permitting Candidate' -or
        $Overlay.bundle.windows.wix.upgradeCode -ne '53211081-ea8b-4882-a752-d80a9363cda6' -or
        $Contract.permitting_package_version -ne '0.3.0+dev.1' -or
        $Contract.core_package_version -ne '1.2.1' -or $Contract.records_package_version -ne '1.7.4' -or
        $Contract.planning_package_version -ne '0.3.0') { throw 'Permitting unsigned candidate identity mismatch.' }
    $Repositories = @('townlight/core', 'townlight/sunshine', 'townlight/meetings', 'townlight/ordinances', 'townlight/zone', 'townlight/plan', 'townlight/notice', 'townlight/access', 'townlight/permit')
    if (@(Compare-Object $Repositories @($Pins.sources.PSObject.Properties.Name)).Count) { throw 'Permitting requires exactly nine source pins.' }
    foreach ($Pin in $Pins.sources.PSObject.Properties) {
        if ($Pin.Value -notmatch '^[0-9a-f]{40}$') { throw "Invalid Permitting source pin: $($Pin.Name)" }
    }
    return @{Contract=$Contract; Pins=$Pins; ContractPath=$ContractPath; OverlayPath=$Contract.tauri_config; DevelopmentOnly=$true; RecordsVersion=$Contract.records_package_version}
}
