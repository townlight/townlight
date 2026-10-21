#!/usr/bin/env python3
"""Verify the CivicSuite module package registry contract."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
REGISTRY = ROOT / "installer" / "modules.json"
CONTRACT = ROOT / "installer" / "module-manifest-contract.json"
DESIGN_CONTROL = ROOT / "docs" / "design" / "windows-desktop-design-control.md"
ADR = ROOT / "docs" / "architecture" / "ADR-0010-module-package-contract.md"

MODULE_ID_RE = re.compile(r"^[a-z0-9][a-z0-9-]*$")
VERSION_RE = re.compile(r"^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$")
SHA1_RE = re.compile(r"^[a-f0-9]{40}$")


def _load_json(path: Path) -> dict[str, Any]:
    with path.open(encoding="utf-8") as handle:
        data = json.load(handle)
    if not isinstance(data, dict):
        raise ValueError(f"{path.relative_to(ROOT)} must be a JSON object")
    return data


def fail(message: str) -> str:
    return f"FAIL: {message}"


def _field_errors(
    item: dict[str, Any],
    fields: list[str],
    context: str,
) -> list[str]:
    return [fail(f"{context} missing required field {field}") for field in fields if field not in item]


def _is_ready_module(module: dict[str, Any], contract: dict[str, Any]) -> bool:
    status = str(module.get("installer_status", ""))
    markers = contract.get("ready_status_markers", [])
    return any(str(marker) in status for marker in markers)


def _validate_profiles(
    data: dict[str, Any],
    contract: dict[str, Any],
    module_ids: set[str],
) -> list[str]:
    errors: list[str] = []
    profiles = data.get("profiles")
    if not isinstance(profiles, list):
        return [fail("profiles must be a list")]

    seen: set[str] = set()
    required_fields = list(contract["required_profile_fields"])
    city_core_profile = list(contract["city_core_profile"])
    found_city_core = False
    found_custom = False

    for index, profile in enumerate(profiles):
        context = f"profiles[{index}]"
        if not isinstance(profile, dict):
            errors.append(fail(f"{context} must be an object"))
            continue
        errors.extend(_field_errors(profile, required_fields, context))

        profile_id = profile.get("id")
        if not isinstance(profile_id, str) or not profile_id:
            errors.append(fail(f"{context} id must be a non-empty string"))
            continue
        if profile_id in seen:
            errors.append(fail(f"profile id {profile_id} is duplicated"))
        seen.add(profile_id)

        modules = profile.get("modules")
        if not isinstance(modules, list):
            errors.append(fail(f"profile {profile_id} modules must be a list"))
            continue
        for module_id in modules:
            if module_id not in module_ids:
                errors.append(fail(f"profile {profile_id} references unknown module {module_id}"))

        if profile_id == "city-core":
            found_city_core = True
            if modules != city_core_profile:
                errors.append(
                    fail(
                        "city-core profile must install the contract city-core modules in order"
                    )
                )
            if profile.get("disabled") is True:
                errors.append(fail("city-core profile must not be disabled"))

        if profile_id == "custom":
            found_custom = True
            if modules:
                errors.append(fail("custom profile must start with an empty module list"))

    if not found_city_core:
        errors.append(fail("missing city-core profile"))
    if not found_custom:
        errors.append(fail("missing custom profile"))
    return errors


def _validate_modules(data: dict[str, Any], contract: dict[str, Any]) -> tuple[list[str], set[str]]:
    errors: list[str] = []
    modules = data.get("modules")
    if not isinstance(modules, list):
        return [fail("modules must be a list")], set()

    seen: set[str] = set()
    required_fields = list(contract["required_module_fields"])
    ready_fields = list(contract["required_ready_module_fields"])
    repo_null_statuses = set(contract["planned_repo_null_statuses"])
    city_core_required = set(contract["city_core_profile"])

    for index, module in enumerate(modules):
        context = f"modules[{index}]"
        if not isinstance(module, dict):
            errors.append(fail(f"{context} must be an object"))
            continue

        errors.extend(_field_errors(module, required_fields, context))
        module_id = module.get("id")
        if not isinstance(module_id, str) or not MODULE_ID_RE.match(module_id):
            errors.append(fail(f"{context} id must be lower-case kebab/module id"))
            continue
        if module_id in seen:
            errors.append(fail(f"module id {module_id} is duplicated"))
        seen.add(module_id)

        dependencies = module.get("dependencies")
        if not isinstance(dependencies, list) or any(not isinstance(dep, str) for dep in dependencies):
            errors.append(fail(f"{module_id} dependencies must be a list of module ids"))
        elif module_id in dependencies:
            errors.append(fail(f"{module_id} cannot depend on itself"))

        proof_required = module.get("proof_required")
        if not isinstance(proof_required, list) or not proof_required:
            errors.append(fail(f"{module_id} proof_required must be a non-empty list"))
        elif any(not isinstance(item, str) or not item for item in proof_required):
            errors.append(fail(f"{module_id} proof_required entries must be non-empty strings"))

        if module.get("required") is True and module.get("selectable") is True:
            errors.append(fail(f"{module_id} cannot be both required and selectable"))

        if module_id == "civiccore":
            if module.get("required") is not True:
                errors.append(fail("civiccore must be required"))
            if module.get("selectable") is not False:
                errors.append(fail("civiccore must not be selectable"))
            if module.get("civiccore_requirement") is not None:
                errors.append(fail("civiccore civiccore_requirement must be null"))
        elif module.get("repo") is not None and "civiccore" not in dependencies:
            errors.append(fail(f"{module_id} must depend on civiccore"))

        if module.get("repo") is None:
            if module.get("selectable") is not False:
                errors.append(fail(f"{module_id} without a runtime repo must not be selectable"))
            if module.get("installer_status") not in repo_null_statuses:
                errors.append(fail(f"{module_id} without a runtime repo must use planned runtime status"))

        if _is_ready_module(module, contract) or module_id in city_core_required:
            errors.extend(_field_errors(module, ready_fields, module_id))
            version = module.get("current_version")
            if not isinstance(version, str) or not VERSION_RE.match(version):
                errors.append(fail(f"{module_id} current_version must be semantic version text"))
            source_commit = module.get("source_commit")
            if module_id != "civiccore":
                if not isinstance(source_commit, str) or not SHA1_RE.match(source_commit):
                    errors.append(fail(f"{module_id} source_commit must be a full 40-character SHA1"))

        default_port = module.get("default_port")
        if default_port is not None and (
            not isinstance(default_port, int) or default_port < 1024 or default_port > 65535
        ):
            errors.append(fail(f"{module_id} default_port must be an integer TCP port"))

    for module in modules:
        if not isinstance(module, dict):
            continue
        module_id = module.get("id")
        dependencies = module.get("dependencies")
        if not isinstance(module_id, str) or not isinstance(dependencies, list):
            continue
        for dependency in dependencies:
            if dependency not in seen:
                errors.append(fail(f"{module_id} depends on unknown module {dependency}"))

    return errors, seen


def _validate_docs(contract: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    for path in (DESIGN_CONTROL, ADR):
        if not path.is_file():
            errors.append(fail(f"missing {path.relative_to(ROOT)}"))
            continue
        text = path.read_text(encoding="utf-8")
        for phrase in (
            "Tauri/WebView2",
            "Townlight Core is always installed" if path == DESIGN_CONTROL else "CivicCore is always installed",
            "module manager",
            "Docker",
            "WSL",
        ):
            if phrase not in text:
                errors.append(fail(f"{path.relative_to(ROOT)} missing phrase: {phrase}"))

    contract_text = json.dumps(contract, sort_keys=True)
    for phrase in ("routes", "permissions", "health_checks", "backup_hooks", "uninstall_hooks"):
        if phrase not in contract_text:
            errors.append(fail(f"contract missing future desktop field {phrase}"))
    return errors


def validate_manifest_data(data: dict[str, Any], contract: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    errors.extend(_field_errors(data, list(contract["required_root_fields"]), "registry root"))
    if data.get("schema_version") != 1:
        errors.append(fail("schema_version must be 1"))
    if data.get("module_contract_version") != contract.get("contract_version"):
        errors.append(fail("module_contract_version must match contract_version"))

    module_errors, module_ids = _validate_modules(data, contract)
    errors.extend(module_errors)
    errors.extend(_validate_profiles(data, contract, module_ids))
    return errors


def main() -> int:
    contract = _load_json(CONTRACT)
    data = _load_json(REGISTRY)
    errors = validate_manifest_data(data, contract)
    errors.extend(_validate_docs(contract))

    if errors:
        print("FAIL: module manifest contract verification failed")
        for error in errors:
            print(f"  - {error}")
        return 1

    print("PASS: module manifest contract valid")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
