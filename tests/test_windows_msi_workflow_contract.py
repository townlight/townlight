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


def test_records_checkout_pins_match_the_accepted_installer_source() -> None:
    manifest = json.loads(_read(ROOT / "installer" / "modules.json"))
    records = next(module for module in manifest["modules"] if module["id"] == "civicrecords-ai")
    pin = records["source_commit"]
    for path in (BUILD_WORKFLOW, ROOT / ".github" / "workflows" / "installer-cleanroom.yml"):
        workflow = _read(path)
        checkouts = workflow.split("repository: townlight/sunshine")[1:]
        assert checkouts, f"No Records checkout in {path.name}"
        for checkout in checkouts:
            checkout_inputs = checkout.split("\n      - ", 1)[0]
            assert f"ref: {pin}" in checkout_inputs, path.name


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
    assert "Get-NetTCPConnection -LocalPort 9222 -State Listen" in launch
    assert "http://127.0.0.1:9222/json/list" in launch
    assert "$_.type -eq 'page'" in launch
    assert "$_.title -eq 'Townlight'" in launch
    assert "if (-not $ready) { throw" in launch
    assert "finally" in launch


@pytest.mark.parametrize("removed", [
    "Get-NetTCPConnection -LocalPort 9222 -State Listen",
    "http://127.0.0.1:9222/json/list",
    "$_.title -eq 'Townlight'",
    "if (-not $ready) { throw",
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
    assert "$receiptFiles[0].FullName --clobber" in workflow
