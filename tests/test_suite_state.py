# SPDX-License-Identifier: Apache-2.0
# Copyright (c) The CivicSuite Authors
"""Contract tests for the additive Townlight suite-state truth spine."""

from __future__ import annotations

import copy
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import suite_state


def _load(path: Path) -> dict[str, object]:
    return json.loads(path.read_text(encoding="utf-8"))


def test_committed_state_and_legacy_projections_pass() -> None:
    assert suite_state.validate_all() == []


def test_catalog_has_11_kept_townlight_modules_with_unique_technical_ids() -> None:
    state = _load(suite_state.STATE_PATH)
    modules = state["modules"]
    assert isinstance(modules, dict)
    assert len(modules) == 11
    assert "station" in modules
    assert set(state["module_order"]) == set(modules)
    assert all(
        module["public_name"].startswith("Townlight") for module in modules.values()
    )
    technical_ids = [module["legacy"]["technical_id"] for module in modules.values()]
    assert len(technical_ids) == len(set(technical_ids))


def test_records_product_is_a_system_and_publication_is_recorded() -> None:
    state = _load(suite_state.STATE_PATH)
    records = state["products"]["records"]
    assert records["public_name"] == "Townlight Records"
    assert records["modules"] == ["core", "records", "notice", "access"]
    assert records["status"] == "candidate"
    assert records["public_website_status"] == "prepared; unpublished candidate"
    assert state["desktop_release"]["version"] == "1.7.1-1"
    assert state["desktop_release"]["channel"] == "candidate"
    assert state["profiles"]["records-beta"]["modules"] == records["modules"]
    assert state["modules"]["notice"]["dependencies"] == ["core"]


def test_retired_foundations_are_absent_from_current_catalog() -> None:
    state = _load(suite_state.STATE_PATH)
    for module_id in ("regulatory-watch", "api", "procurement", "boards", "grants"):
        assert module_id not in state["modules"]
        assert all(module_id not in profile["modules"] for profile in state["profiles"].values())


def test_unknown_dependency_is_rejected() -> None:
    state = copy.deepcopy(_load(suite_state.STATE_PATH))
    state["modules"]["records"]["dependencies"].append("missing-module")
    errors = suite_state.validate_state(state)
    assert any("unknown module reference 'missing-module'" in error for error in errors)


def test_dependency_cycle_is_rejected() -> None:
    state = copy.deepcopy(_load(suite_state.STATE_PATH))
    state["modules"]["core"]["dependencies"].append("records")
    errors = suite_state.validate_state(state)
    assert any(error.startswith("dependency cycle:") for error in errors)


def test_current_legacy_display_names_are_accepted_during_migration() -> None:
    state = _load(suite_state.STATE_PATH)
    installer = _load(suite_state.INSTALLER_PATH)
    public_status = _load(suite_state.PUBLIC_STATUS_PATH)
    assert suite_state.compare_legacy_sources(state, installer, public_status) == []


def test_installer_version_drift_is_rejected() -> None:
    state = _load(suite_state.STATE_PATH)
    installer = copy.deepcopy(_load(suite_state.INSTALLER_PATH))
    public_status = _load(suite_state.PUBLIC_STATUS_PATH)
    module = next(
        item for item in installer["modules"] if item["id"] == "townlight_records"
    )
    module["current_version"] = "9.9.9"
    errors = suite_state.compare_legacy_sources(state, installer, public_status)
    assert any(
        "installer.modules.townlight_records.current_version" in error for error in errors
    )


def test_public_status_maturity_drift_is_rejected() -> None:
    state = _load(suite_state.STATE_PATH)
    installer = _load(suite_state.INSTALLER_PATH)
    public_status = copy.deepcopy(_load(suite_state.PUBLIC_STATUS_PATH))
    module = next(
        item for item in public_status["modules"] if item["id"] == "townlight_notice"
    )
    module["public_status"]["grade"] = "foundation"
    errors = suite_state.compare_legacy_sources(state, installer, public_status)
    assert any(
        "public_status.modules.townlight_notice.public_status.grade" in error
        for error in errors
    )


def test_schema_declares_the_same_version_as_the_manifest() -> None:
    state = _load(suite_state.STATE_PATH)
    schema = _load(suite_state.SCHEMA_PATH)
    assert schema["$schema"] == "https://json-schema.org/draft/2020-12/schema"
    assert schema["properties"]["schema_version"]["const"] == state["schema_version"]
    assert suite_state.validate_schema_document(schema) == []


def test_schema_runtime_contract_drift_is_rejected() -> None:
    schema = copy.deepcopy(_load(suite_state.SCHEMA_PATH))
    schema["$defs"]["module"]["required"].remove("legacy")
    errors = suite_state.validate_schema_document(schema)
    assert "schema: module required fields differ from runtime validator" in errors


def test_json_schema_constraints_are_enforced() -> None:
    state = copy.deepcopy(_load(suite_state.STATE_PATH))
    schema = _load(suite_state.SCHEMA_PATH)
    state["desktop_release"]["channel"] = "marketing-preview"
    state["modules"]["records"]["maturity"]["arch_tier"] = 999
    state["modules"]["records"]["legacy"]["product_names"] = [42]

    errors = suite_state.validate_against_schema(state, schema)

    assert any("desktop_release.channel" in error for error in errors)
    assert any("modules.records.maturity.arch_tier" in error for error in errors)
    assert any("modules.records.legacy.product_names.0" in error for error in errors)


def test_duplicate_legacy_aliases_are_rejected() -> None:
    state = copy.deepcopy(_load(suite_state.STATE_PATH))
    state["modules"]["access"]["legacy"]["product_names"] = ["Townlight Records"]
    state["modules"]["access"]["legacy"]["package_names"] = ["townlight-records"]
    state["modules"]["core"]["repository"]["aliases"] = ["townlight/duplicate-test"]
    state["modules"]["access"]["repository"]["aliases"] = ["townlight/duplicate-test"]

    errors = suite_state.validate_state(state)

    assert any("duplicate alias Townlight Records" in error for error in errors)
    assert any("duplicate alias townlight-records" in error for error in errors)
    assert any(
        "duplicate alias townlight/duplicate-test" in error for error in errors
    )
