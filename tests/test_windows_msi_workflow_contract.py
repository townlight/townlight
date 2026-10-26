# SPDX-License-Identifier: Apache-2.0
# Copyright (c) The CivicSuite Authors
"""Fail-closed contracts for Windows MSI validation and publication."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
BUILD_WORKFLOW = ROOT / ".github" / "workflows" / "desktop-windows-msi.yml"
RELEASE_WORKFLOW = ROOT / ".github" / "workflows" / "release-windows-msi.yml"


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


@pytest.mark.parametrize(
    ("module_id", "repository"),
    [("civicrecords-ai", "townlight/sunshine"), ("civicclerk", "townlight/meetings"), ("civiccode", "townlight/ordinances")],
)
def test_checkout_pins_match_the_accepted_installer_source(module_id: str, repository: str) -> None:
    manifest = json.loads(_read(ROOT / "installer" / "modules.json"))
    module = next(module for module in manifest["modules"] if module["id"] == module_id)
    pin = module["source_commit"]
    for path in (BUILD_WORKFLOW, ROOT / ".github" / "workflows" / "installer-cleanroom.yml"):
        workflow = _read(path)
        # Cleanroom/default MSI composition retains accepted release pins.
        # The explicit unsigned Planning candidate resolves its separate source
        # manifest; it must not repin the historical installer contract.
        if path == BUILD_WORKFLOW:
            integration = workflow.split("  desktop-civiccore-integration:", 1)[1].split("\n  windows-msi-lifecycle:", 1)[0]
            candidate = json.loads(_read(ROOT / "config" / "planning-staff-beta-sources.json"))
            candidate_pin = candidate["sources"][repository]
            checkout = integration.split(f"repository: {repository}", 1)[1].split("\n      - ", 1)[0]
            if module_id == "civicrecords-ai":
                assert "ref: ${{ steps.candidate.outputs.records_ref }}" in checkout
                assert candidate_pin == candidate["sources"][repository]
            else:
                assert f"ref: {candidate_pin}" in checkout
            workflow = workflow.replace(integration, "")
        checkouts = workflow.split(f"repository: {repository}")[1:]
        assert checkouts, f"No {module_id} checkout in {path.name}"
        for checkout in checkouts:
            checkout_inputs = checkout.split("\n      - ", 1)[0]
            if path == BUILD_WORKFLOW and module_id == "civicrecords-ai":
                assert "ref: ${{ steps.candidate.outputs.records_ref }}" in checkout_inputs
                resolver = _read(ROOT / "desktop/scripts/resolve-msi-candidate.ps1")
                assert f"$RecordsRef = '{pin}'" in resolver
                assert "$RecordsRef = $Pins.sources.'townlight/sunshine'" in resolver
                continue
            assert f"ref: {pin}" in checkout_inputs, path.name


def test_planning_candidate_pins_are_explicit_and_confined_to_development() -> None:
    import re

    development = json.loads(_read(ROOT / "config/planning-preview-sources.json"))
    beta = json.loads(_read(ROOT / "config/planning-staff-beta-sources.json"))
    assert development["profile"] == "planning-preview"
    assert development["development_only"] is True
    assert development["sources"]["townlight/plan"] == "c0bd9bd40379764437db10b475fed0bee36175c6"
    assert development["sources"]["townlight/sunshine"] == "28a2eba1878e2fda10615a28c5f4274de216c9da"
    assert beta["profile"] == "planning-staff-beta" and beta["development_only"] is False
    assert beta["sources"].keys() == development["sources"].keys()
    for repository, pin in beta["sources"].items():
        assert re.fullmatch(r"[0-9a-f]{40}", pin)
        if repository not in {"townlight/plan", "townlight/sunshine"}:
            assert pin == development["sources"][repository]
    integration = _read(BUILD_WORKFLOW).split("  desktop-civiccore-integration:", 1)[1].split("\n  windows-msi-lifecycle:", 1)[0]
    for repository, output in (("townlight/plan", "planning_ref"), ("townlight/sunshine", "records_ref")):
        checkout = integration.split(f"repository: {repository}", 1)[1].split("\n      - ", 1)[0]
        assert f"ref: ${{{{ steps.candidate.outputs.{output} }}}}" in checkout
    assert "'-ProductProfile', '${{ steps.candidate.outputs.runtime_profile }}'" in integration
    assert "TOWNLIGHT_TEST_RUNTIME_PROFILE: ${{ steps.candidate.outputs.runtime_profile }}" in integration
    resolver = _read(ROOT / "desktop/scripts/resolve-msi-candidate.ps1")
    assert "$RuntimeProfile = 'planning-preview'" in resolver
    assert "$RuntimeProfile = 'permitting-preview'" in resolver


def test_planning_msi_candidate_uses_the_same_overlay_for_build_and_bundle() -> None:
    workflow = _read(BUILD_WORKFLOW)
    contract = json.loads(_read(ROOT / "config/planning-msi-candidate.json"))
    overlay = json.loads(_read(ROOT / "desktop" / contract["tauri_config"]))
    base = json.loads(_read(ROOT / "desktop/src-tauri/tauri.conf.json"))
    assert overlay == {"version": contract["desktop_version"]}
    assert tuple(map(int, contract["windows_product_version"].split("."))) > (1, 4, 0, 1)
    assert base["version"] == "1.4.0-1"
    assert contract["development_only"] is True
    assert contract["publication_allowed"] is False
    assert "build --no-bundle ${{ steps.candidate.outputs.tauri_args }}" in workflow
    assert "bundle --bundles msi --no-binary-patching ${{ steps.candidate.outputs.tauri_args }}" in workflow
    assert "ProductProfile=${{ steps.candidate.outputs.product_profile }}" in workflow
    assert "planning-candidate-provenance.json" in workflow


def test_routine_ci_builds_a_visibly_unsigned_private_artifact() -> None:
    workflow = _read(BUILD_WORKFLOW)

    assert "sign_for_publication:" in workflow
    assert 'type: boolean' in workflow
    assert "default: false" in workflow
    assert "civicsuite-windows-local-msi-UNSIGNED" in workflow
    assert '"signature_state=UNSIGNED"' in workflow
    assert '"$($msi.BaseName)-UNSIGNED$($msi.Extension)"' in workflow
    assert '$signature.Status -ne "NotSigned"' in workflow
    assert '"false"' in workflow


def test_signing_is_an_explicit_manual_publication_gate() -> None:
    workflow = _read(BUILD_WORKFLOW)
    gate = (
        "github.event_name == 'workflow_dispatch' && "
        "inputs.sign_for_publication"
    )

    assert workflow.count(gate) >= 5
    assert '"${{ github.ref }}" -ne "refs/heads/main"' in workflow
    assert "civicsuite-windows-local-msi-SIGNED" in workflow
    assert "azure/artifact-signing-action@v2" in workflow
    assert "CN=Scott Converse" in workflow
    assert "TimeStamperCertificate" in workflow
    assert "PublicationAllowed=$publicationAllowed" in workflow


def test_lifecycle_consumes_and_verifies_the_same_classified_artifact() -> None:
    workflow = _read(BUILD_WORKFLOW)

    assert "name: ${{ needs.windows-local-msi.outputs.artifact_name }}" in workflow
    assert "EXPECTED_SIGNATURE_STATE:" in workflow
    assert "Unsigned CI MSI filename is not visibly marked UNSIGNED" in workflow
    assert "Evidence does not classify the MSI as UNSIGNED" in workflow
    assert "Signed lifecycle lane received an unexpected signer" in workflow
    assert 'Where-Object { $_.DisplayName -like "*Townlight*" }' in workflow
    assert "Launch the installed Townlight application" in workflow
    _assert_installed_startup_requires_webview(workflow)
    assert "Repair the installed Townlight MSI" in workflow
    assert 'Start-Process msiexec.exe -ArgumentList @("/fa"' in workflow
    assert 'Join-Path $env:LOCALAPPDATA "CivicSuite\\workflows\\city-work.json"' in workflow
    assert workflow.count('-replace "`r`n?", "`n"') >= 1


def _assert_installed_startup_requires_webview(workflow: str) -> None:
    launch = workflow.split("- name: Launch the installed Townlight application", 1)[1]
    launch = launch.split("- name: Repair the installed Townlight MSI", 1)[0]
    assert "--remote-debugging-port=9222" in launch
    assert "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Edge\\WebView2\\AdditionalBrowserArguments" in launch
    assert "$debugAppName = Split-Path -Leaf $env:TOWNLIGHT_EXE" in launch
    assert "Remove-ItemProperty -LiteralPath $debugPolicy -Name $debugAppName" in launch
    assert "Get-NetTCPConnection -LocalPort 9222 -State Listen" in launch
    assert "http://127.0.0.1:9222/json/list" in launch
    assert "$_.type -eq 'page'" in launch
    assert "$_.title -eq 'Townlight'" in launch
    assert "if (-not $ready) {" in launch
    assert "throw 'Installed Townlight did not open its WebView page within 60 seconds.'" in launch
    assert "finally" in launch


@pytest.mark.parametrize("removed", [
    "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Edge\\WebView2\\AdditionalBrowserArguments",
    "Get-NetTCPConnection -LocalPort 9222 -State Listen",
    "http://127.0.0.1:9222/json/list",
    "$_.title -eq 'Townlight'",
    "if (-not $ready) {",
    "throw 'Installed Townlight did not open its WebView page within 60 seconds.'",
])
def test_installed_startup_contract_rejects_weakened_proof(removed: str) -> None:
    workflow = _read(BUILD_WORKFLOW)
    with pytest.raises(AssertionError):
        _assert_installed_startup_requires_webview(workflow.replace(removed, "REMOVED"))


def test_release_accepts_only_a_signed_artifact_for_the_tag_commit() -> None:
    workflow = _read(RELEASE_WORKFLOW)

    assert "actions: read" in workflow
    assert "--event workflow_dispatch" in workflow
    assert "--branch main" in workflow
    assert "$_.headSha -eq $tagSha" in workflow
    assert workflow.count("civicsuite-windows-local-msi-SIGNED") >= 2
    assert "Get-AuthenticodeSignature" in workflow
    assert "CN=Scott Converse" in workflow
    assert "signtool.FullName verify /pa /v" in workflow
    assert "SignatureState=Valid" in workflow
    assert "PublicationAllowed=true" in workflow
    assert '-replace "`r`n?", "`n"' in workflow
    assert "civicsuite-windows-local-msi -D" not in workflow


def test_release_stages_a_draft_before_human_publication() -> None:
    workflow = _read(RELEASE_WORKFLOW)

    assert "gh release create $tag --draft --prerelease" in workflow
    assert "publication remains blocked" in workflow
    assert "gh release edit" not in workflow


def test_signing_comments_do_not_repeat_the_false_subscription_claim() -> None:
    workflow = _read(BUILD_WORKFLOW)

    assert "has no subscription" not in workflow
    assert "no subscription to federate" not in workflow
    assert "future OIDC migration" in workflow


def test_public_product_name_changes_without_replacing_installer_identity() -> None:
    workflow = _read(BUILD_WORKFLOW)
    tauri_config = _read(ROOT / "desktop" / "src-tauri" / "tauri.conf.json")

    assert '"productName": "Townlight"' in tauri_config
    assert '"publisher": "Townlight"' in tauri_config
    assert '"identifier": "org.civicsuite.desktop"' in tauri_config
    assert '"upgradeCode": "a63fc1d3-5437-5f55-89a2-fef93fb1f930"' in tauri_config
    assert "Townlight Windows Local MSI build evidence" in workflow
    assert "UpgradeCode=a63fc1d3-5437-5f55-89a2-fef93fb1f930" in workflow


def test_publication_signs_executable_before_bundling_and_checks_embedded_bytes() -> None:
    workflow = _read(BUILD_WORKFLOW)
    stages = [
        "run: npm run tauri -- build --no-bundle",
        "name: Record unsigned executable intake",
        "name: Sign desktop executable (Azure Artifact Signing)",
        "name: Verify executable before packaging",
        "name: Record executable bytes before bundling",
        "run: npm run tauri -- bundle --bundles msi --no-binary-patching",
        "name: Verify bundling preserved executable bytes",
        "name: Sign MSI (Azure Trusted Signing)",
        "name: Verify packaged executable and write signing receipt",
    ]
    positions = [workflow.index(stage) for stage in stages]
    assert positions == sorted(positions)
    assert workflow.count("uses: azure/artifact-signing-action@v2") == 2
    assert "MSI does not contain the exact signed executable" in workflow
    assert "Verify installed executable trust and exact bytes" in workflow
    assert "Installed executable hash differs from packaged evidence" in workflow
    assert "Bundling changed executable bytes after signing intake." in workflow
    package = json.loads(_read(ROOT / "desktop" / "package.json"))
    assert package["devDependencies"]["@tauri-apps/cli"] == "2.12.0"


def test_release_checks_both_artifacts_and_receipt_against_selected_run() -> None:
    workflow = _read(RELEASE_WORKFLOW)
    assert "$receipt.source_commit -ne $tagSha" in workflow
    assert "$receipt.workflow_run -ne [string]$run.databaseId" in workflow
    assert "verify-publication-signature.ps1 -Path $embedded[0].FullName" in workflow
    assert "$entries[0].signed_sha256 -ne $sha" in workflow
    assert "$entries[0].signer_thumbprint -ne $sig.SignerCertificate.Thumbprint" in workflow
    assert "--clobber" not in workflow
    assert "Release destination must be an empty draft" in workflow


def test_staff_beta_release_requires_its_composition_and_embedded_provenance() -> None:
    workflow = _read(RELEASE_WORKFLOW)
    assert "townlight-records-meetings-code-zoning-planning-v*" in workflow
    assert "ProductProfile=planning-staff-beta" in workflow
    assert "$receipt.planning_provenance_sha256 -ne $proofSha" in workflow
    assert "$proof.umbrella_source_commit -ne $tagSha" in workflow
    assert "$proof.sources_manifest_sha256 -ne $sourcesSha" in workflow
    assert "$proof.package_versions.'civicrecords-ai' -ne $planning.Contract.records_package_version" in workflow
    assert "$_.source_commit -eq $pin.Value" in workflow
    assert "opt-in staff Planning beta" in workflow
    # The release consumer expects a flat signed artifact, as before.
    signed = _read(BUILD_WORKFLOW).split("- name: Upload SIGNED Windows Local MSI for publication gate", 1)[1].split("\n  desktop-civiccore-integration:", 1)[0]
    assert "civicsuite/desktop/src-tauri/target/release/bundle/msi/planning-candidate-provenance.json" in signed
    assert "civicsuite/config/" not in signed
    assert "civicsuite/desktop/runtime/" not in signed
    payload = _read(ROOT / "desktop/scripts/prepare-runtime-payload.ps1")
    assert "Get-PlanningBuildContract -Profile $PlanningBuildProfile" in payload
    assert "metadata.version('civicrecords-ai') == '$($PlanningBuild.RecordsVersion)'" in payload
    assert "sources_manifest_sha256 = Get-Sha256" in payload


def test_planning_resolver_selects_beta_without_opening_development_signing(tmp_path: Path) -> None:
    import shutil
    import subprocess

    pwsh = shutil.which("pwsh")
    if not pwsh:
        pytest.skip("PowerShell is required for the executable resolver contract")
    # Real resolver execution only; never dispatch a workflow or invoke signing.
    for relative in (
        "desktop/scripts/resolve-msi-candidate.ps1", "desktop/scripts/planning-build-contract.ps1",
        "desktop/src-tauri/tauri.planning-candidate.conf.json", "desktop/src-tauri/tauri.planning-staff-beta.conf.json",
        "config/planning-msi-candidate.json", "config/planning-preview-sources.json",
        "config/planning-staff-beta.json", "config/planning-staff-beta-sources.json",
        "desktop/scripts/permitting-build-contract.ps1", "desktop/src-tauri/tauri.permitting-candidate.conf.json",
        "config/permitting-msi-candidate.json", "config/permitting-preview-sources.json",
        "desktop/scripts/inspections-build-contract.ps1", "desktop/src-tauri/tauri.inspections-candidate.conf.json",
        "config/inspections-msi-candidate.json", "config/inspections-preview-sources.json",
    ):
        target = tmp_path / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(ROOT / relative, target)
    script = tmp_path / "check.ps1"
    script.write_text(r'''$ErrorActionPreference = 'Stop'
$env:GITHUB_OUTPUT = ''
function Resolve($Profile, $Branch, $Sign = $false) {
    & "$PSScriptRoot/desktop/scripts/resolve-msi-candidate.ps1" -RequestedProfile $Profile -SourceBranch $Branch -SignForPublication:$Sign | ConvertFrom-Json
}
if ((Resolve automatic main).product_profile -ne 'zoning-beta') { throw 'main default changed' }
$inspect = Resolve automatic inspections/connected-workflow
if ($inspect.product_profile -ne 'inspections-preview' -or $inspect.runtime_profile -ne 'inspections-preview' -or $inspect.desktop_version -ne '1.7.0-1' -or $inspect.inspections_ref -notmatch '^[0-9a-f]{40}$' -or $inspect.permitting_ref -notmatch '^[0-9a-f]{40}$') { throw 'Inspections composition mismatch' }
$inspectionOverlay = Get-Content "$PSScriptRoot/desktop/src-tauri/tauri.inspections-candidate.conf.json" -Raw | ConvertFrom-Json
if ($inspectionOverlay.identifier -ne 'org.townlight.inspections.candidate' -or $inspectionOverlay.bundle.windows.wix.upgradeCode -eq '53211081-ea8b-4882-a752-d80a9363cda6') { throw 'Separate Inspections identity required' }
$permit = Resolve automatic permitting/connected-workflow
if ($permit.product_profile -ne 'permitting-preview' -or $permit.runtime_profile -ne 'permitting-preview' -or $permit.desktop_version -ne '1.6.0-1' -or $permit.permitting_ref -notmatch '^[0-9a-f]{40}$') { throw 'Permitting composition mismatch' }
$overlay = Get-Content "$PSScriptRoot/desktop/src-tauri/tauri.permitting-candidate.conf.json" -Raw | ConvertFrom-Json
if ($overlay.bundle.windows.wix.upgradeCode -ne '53211081-ea8b-4882-a752-d80a9363cda6') { throw 'Permitting installer identity changed' }
if ((Resolve automatic planning/p6-candidate).product_profile -ne 'planning-preview') { throw 'development default changed' }
$beta = Resolve automatic planning/layouts-beta-1-5-1
if ($beta.product_profile -ne 'planning-staff-beta' -or $beta.runtime_profile -ne 'planning-preview' -or $beta.desktop_version -ne '1.5.1-1') { throw 'beta composition mismatch' }
# Only validates future eligibility; no signer is called by this resolver.
if ((Resolve planning-staff-beta main $true).product_profile -ne 'planning-staff-beta') { throw 'explicit main selection failed' }
function MustReject([scriptblock]$Action) {
    $rejected = $false
    try { & $Action | Out-Null } catch { $rejected = $true }
    if (-not $rejected) { throw 'Expected refusal' }
}
MustReject { Resolve planning-preview main $true }
if ((Resolve inspections-preview main $true).product_profile -ne 'inspections-preview') { throw 'Inspections explicit main selection failed' }
MustReject { Resolve inspections-preview inspections/connected-workflow $true }
$inspectPath = "$PSScriptRoot/config/inspections-msi-candidate.json"
$inspectContract = Get-Content $inspectPath -Raw | ConvertFrom-Json
$inspectTag = $inspectContract.release_tag
$inspectContract.release_tag = 'unexpected-tag'
$inspectContract | ConvertTo-Json | Set-Content $inspectPath
MustReject { Resolve inspections-preview main $true }
$inspectContract.release_tag = $inspectTag
$inspectContract | ConvertTo-Json | Set-Content $inspectPath
if ((Resolve permitting-preview main $true).product_profile -ne 'permitting-preview') { throw 'Permitting explicit main selection failed' }
MustReject { Resolve permitting-preview permitting/connected-workflow $true }
MustReject { Resolve permitting-preview release/permitting-1-6-0-signing $true }
if ((Resolve automatic release/permitting-1-6-0-signing).product_profile -ne 'permitting-preview') { throw 'Release CI must exercise Permitting' }
$permitPath = "$PSScriptRoot/config/permitting-msi-candidate.json"
$permitContract = Get-Content $permitPath -Raw | ConvertFrom-Json
if ($permitContract.development_only -ne $false -or $permitContract.publication_allowed -ne $true) { throw 'Temporary private-only restriction remains' }
$permitContract.publication_allowed = $false
$permitContract | ConvertTo-Json | Set-Content $permitPath
MustReject { Resolve permitting-preview main $true }
$permitContract.publication_allowed = $true
$permitContract | ConvertTo-Json | Set-Content $permitPath
MustReject { Resolve planning-staff-beta planning/layouts-beta-1-5-1 $true }
$path = "$PSScriptRoot/config/planning-staff-beta.json"
$c = Get-Content $path -Raw | ConvertFrom-Json
$c.planning_package_version = '0.3.0+dev.1'
$c | ConvertTo-Json | Set-Content $path
MustReject { Resolve planning-staff-beta main }
$c.planning_package_version = '0.3.0'
$c | ConvertTo-Json | Set-Content $path
$path = "$PSScriptRoot/config/planning-staff-beta-sources.json"
$pins = Get-Content $path -Raw | ConvertFrom-Json
$pins.sources.'townlight/plan' = 'main'
$pins | ConvertTo-Json | Set-Content $path
MustReject { Resolve planning-staff-beta main }
Write-Output 'PASS selection and fail-closed release identities'
''', encoding="utf-8")
    result = subprocess.run([pwsh, "-NoProfile", "-File", str(script)], capture_output=True, text=True, timeout=30)
    assert result.returncode == 0, result.stdout + result.stderr
    assert "PASS selection" in result.stdout


def test_inspections_release_requires_exact_composition_and_embedded_provenance() -> None:
    workflow = _read(RELEASE_WORKFLOW)
    assert 'townlight-records-meetings-code-zoning-planning-permitting-inspections-v*' in workflow
    assert '$tag -ne $inspections.Contract.release_tag' in workflow
    assert 'ProductProfile=inspections-preview' in workflow
    assert 'RuntimeProfile=inspections-preview' in workflow
    assert '$receipt.inspections_provenance_sha256 -ne $proofSha' in workflow
    assert 'inspections-candidate-provenance.json -Recurse -File' in workflow
    assert '$proof.package_versions.civicinspect -ne $inspections.Contract.inspections_package_version' in workflow
    assert '$proof.package_versions.civicpermit -ne $inspections.Contract.permitting_package_version' in workflow
    assert '@($proof.sources).Count -ne 10 -or @($proof.wheels).Count -ne 4' in workflow
    assert 'foreach ($pin in $inspections.Pins.sources.PSObject.Properties)' in workflow
    assert '$isPlanning -or $isPermitting -or $isInspections' in workflow
