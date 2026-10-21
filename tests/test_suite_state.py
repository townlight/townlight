# SPDX-License-Identifier: AGPL-3.0-only
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


def test_catalog_has_28_stable_townlight_names_with_unique_legacy_ids() -> None:
    state = _load(suite_state.STATE_PATH)
    modules = state["modules"]
    assert isinstance(modules, dict)
    assert len(modules) == 28
    assert set(state["module_order"]) == set(modules)
    assert all(
        module["public_name"].startswith("Townlight") for module in modules.values()
    )
    technical_ids = [module["legacy"]["technical_id"] for module in modules.values()]
    assert len(technical_ids) == len(set(technical_ids))


def test_records_product_is_a_system_and_publication_is_deferred() -> None:
    state = _load(suite_state.STATE_PATH)
    records = state["products"]["records"]
    assert records["public_name"] == "Townlight Records"
    assert records["modules"] == ["core", "records", "notice", "access"]
    assert records["status"] == "stabilizing"
    assert records["public_website_status"] == "deferred-until-public-beta-ready"
    assert state["profiles"]["records-beta"]["modules"] == records["modules"]
    assert state["modules"]["notice"]["dependencies"] == ["core"]


def test_spec_only_modules_have_no_runtime_identity() -> None:
    state = _load(suite_state.STATE_PATH)
    for module_id in ("regulatory-watch", "api"):
        module = state["modules"][module_id]
        assert module["repository"] is None
        assert set(module["versions"].values()) == {None}
        assert module["maturity"]["availability"] == "spec-only"


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
        item for item in installer["modules"] if item["id"] == "civicrecords-ai"
    )
    module["current_version"] = "9.9.9"
    errors = suite_state.compare_legacy_sources(state, installer, public_status)
    assert any(
        "installer.modules.civicrecords-ai.current_version" in error for error in errors
    )


def test_public_status_maturity_drift_is_rejected() -> None:
    state = _load(suite_state.STATE_PATH)
    installer = _load(suite_state.INSTALLER_PATH)
    public_status = copy.deepcopy(_load(suite_state.PUBLIC_STATUS_PATH))
    module = next(
        item for item in public_status["modules"] if item["id"] == "civicnotice"
    )
    module["public_status"]["grade"] = "foundation"
    errors = suite_state.compare_legacy_sources(state, installer, public_status)
    assert any(
        "public_status.modules.civicnotice.public_status.grade" in error
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
    state["modules"]["access"]["legacy"]["product_names"] = ["CivicSunshine"]
    state["modules"]["access"]["legacy"]["package_names"] = ["civicrecords-ai"]
    state["modules"]["access"]["repository"]["aliases"] = ["CivicSuite/civicrecords-ai"]

    errors = suite_state.validate_state(state)

    assert any("duplicate alias CivicSunshine" in error for error in errors)
    assert any("duplicate alias civicrecords-ai" in error for error in errors)
    assert any(
        "duplicate alias CivicSuite/civicrecords-ai" in error for error in errors
    )
