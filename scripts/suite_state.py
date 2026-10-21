#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
# Copyright (c) The CivicSuite Authors
"""Load and validate Townlight's additive canonical suite-state manifest."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
STATE_PATH = ROOT / "config" / "suite-state.json"
SCHEMA_PATH = ROOT / "config" / "suite-state.schema.json"
INSTALLER_PATH = ROOT / "installer" / "modules.json"
PUBLIC_STATUS_PATH = ROOT / "installer" / "modules.public-status.json"

SEMVER_RE = re.compile(r"^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$")
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
SHA1_RE = re.compile(r"^[a-f0-9]{40}$")
ID_RE = re.compile(r"^[a-z0-9][a-z0-9-]*$")

REQUIRED_ROOT_FIELDS = {
    "schema_version",
    "brand",
    "desktop_release",
    "asset_policies",
    "products",
    "profiles",
    "module_order",
    "modules",
}
REQUIRED_MODULE_FIELDS = {
    "public_name",
    "public_slug",
    "legacy",
    "repository",
    "versions",
    "release",
    "compatibility",
    "dependencies",
    "maturity",
    "installer",
}
MATURITY_STATES = {
    "platform",
    "public-beta",
    "candidate",
    "queued",
    "early-scaffold",
    "foundation",
    "spec-only",
}
LEGACY_GRADES = {
    "platform",
    "released",
    "queued",
    "early-scaffold",
    "foundation",
    "planned",
}


def validate_against_schema(data: dict[str, Any], schema: dict[str, Any]) -> list[str]:
    """Validate the manifest with its checked-in JSON Schema."""

    try:
        import jsonschema
    except ModuleNotFoundError:
        return ["schema validation requires the jsonschema package"]

    try:
        jsonschema.Draft202012Validator.check_schema(schema)
    except jsonschema.SchemaError as exc:
        return [f"schema: invalid JSON Schema: {exc.message}"]

    validator = jsonschema.Draft202012Validator(
        schema,
        format_checker=jsonschema.FormatChecker(),
    )
    errors: list[str] = []
    for error in sorted(
        validator.iter_errors(data), key=lambda item: list(item.absolute_path)
    ):
        path = ".".join(str(part) for part in error.absolute_path) or "root"
        errors.append(f"schema validation: {path}: {error.message}")
    return errors


def load_json(path: Path) -> dict[str, Any]:
    """Load a JSON object with a path-specific error."""
    try:
        data = json.loads(path.read_text(encoding="utf-8-sig"))
    except FileNotFoundError as exc:
        raise ValueError(f"missing JSON file: {path}") from exc
    except json.JSONDecodeError as exc:
        raise ValueError(f"invalid JSON in {path}: {exc}") from exc
    if not isinstance(data, dict):
        raise TypeError(f"{path} must contain a JSON object")
    return data


def _is_semver(value: Any, *, nullable: bool = False) -> bool:
    return (nullable and value is None) or (
        isinstance(value, str) and SEMVER_RE.fullmatch(value) is not None
    )


def _is_date(value: Any, *, nullable: bool = False) -> bool:
    return (nullable and value is None) or (
        isinstance(value, str) and DATE_RE.fullmatch(value) is not None
    )


def _unknown_and_missing(
    value: dict[str, Any], required: set[str], context: str
) -> list[str]:
    errors = [
        f"{context}: missing field {field}" for field in sorted(required - set(value))
    ]
    errors.extend(
        f"{context}: unexpected field {field}"
        for field in sorted(set(value) - required)
    )
    return errors


def _reference_errors(
    refs: Any, module_ids: set[str], context: str, *, allow_empty: bool = True
) -> list[str]:
    if not isinstance(refs, list):
        return [f"{context}: must be a list"]
    errors: list[str] = []
    if not allow_empty and not refs:
        errors.append(f"{context}: must not be empty")
    if len(refs) != len({str(item) for item in refs}):
        errors.append(f"{context}: contains duplicate module references")
    for ref in refs:
        if not isinstance(ref, str) or ref not in module_ids:
            errors.append(f"{context}: unknown module reference {ref!r}")
    return errors


def _cycle_errors(modules: dict[str, Any]) -> list[str]:
    visiting: set[str] = set()
    visited: set[str] = set()
    stack: list[str] = []
    errors: list[str] = []

    def visit(module_id: str) -> None:
        if module_id in visited:
            return
        if module_id in visiting:
            start = stack.index(module_id)
            errors.append(
                "dependency cycle: " + " -> ".join(stack[start:] + [module_id])
            )
            return
        visiting.add(module_id)
        stack.append(module_id)
        module = modules.get(module_id)
        if isinstance(module, dict):
            dependencies = module.get("dependencies", [])
            if isinstance(dependencies, list):
                for dependency in dependencies:
                    if isinstance(dependency, str) and dependency in modules:
                        visit(dependency)
        stack.pop()
        visiting.remove(module_id)
        visited.add(module_id)

    for module_id in modules:
        visit(module_id)
    return errors


def validate_state(data: dict[str, Any]) -> list[str]:
    """Validate the committed state contract without third-party dependencies."""
    errors = _unknown_and_missing(data, REQUIRED_ROOT_FIELDS, "root")
    if data.get("schema_version") != 1:
        errors.append("root: schema_version must be 1")

    brand = data.get("brand")
    if not isinstance(brand, dict):
        errors.append("brand: must be an object")
    else:
        required = {
            "name",
            "organization",
            "umbrella_repository",
            "domains",
            "legacy_organizations",
        }
        errors.extend(_unknown_and_missing(brand, required, "brand"))
        if brand.get("name") != "Townlight":
            errors.append("brand.name: must be Townlight")
        if brand.get("organization") != "townlight":
            errors.append("brand.organization: must be townlight")
        if brand.get("umbrella_repository") != "townlight/townlight":
            errors.append("brand.umbrella_repository: must be townlight/townlight")
        domains = brand.get("domains")
        if not isinstance(domains, list) or not domains:
            errors.append("brand.domains: must be a non-empty list")
        elif len(domains) != len(set(domains)):
            errors.append("brand.domains: contains duplicates")

    asset_policies = data.get("asset_policies")
    if not isinstance(asset_policies, dict) or not asset_policies:
        errors.append("asset_policies: must be a non-empty object")
        asset_policy_ids: set[str] = set()
    else:
        asset_policy_ids = set(asset_policies)
        for policy_id, asset_types in asset_policies.items():
            if not isinstance(asset_types, list) or len(asset_types) != len(
                set(asset_types)
            ):
                errors.append(f"asset_policies.{policy_id}: must be a unique list")

    desktop = data.get("desktop_release")
    if not isinstance(desktop, dict):
        errors.append("desktop_release: must be an object")
    else:
        required = {
            "version",
            "tag",
            "commit",
            "channel",
            "published_at",
            "asset_policy",
        }
        errors.extend(_unknown_and_missing(desktop, required, "desktop_release"))
        if not _is_semver(desktop.get("version")):
            errors.append("desktop_release.version: must be semantic version text")
        if not isinstance(desktop.get("commit"), str) or not SHA1_RE.fullmatch(
            desktop["commit"]
        ):
            errors.append(
                "desktop_release.commit: must be a 40-character lowercase SHA-1"
            )
        if not _is_date(desktop.get("published_at")):
            errors.append("desktop_release.published_at: must be YYYY-MM-DD")
        if desktop.get("asset_policy") not in asset_policy_ids:
            errors.append("desktop_release.asset_policy: unknown asset policy")

    modules = data.get("modules")
    if not isinstance(modules, dict):
        return errors + ["modules: must be an object"]
    module_ids = set(modules)
    if len(module_ids) != 28:
        errors.append(f"modules: expected 28 catalog modules, found {len(module_ids)}")

    order = data.get("module_order")
    if not isinstance(order, list):
        errors.append("module_order: must be a list")
    else:
        if len(order) != len({str(item) for item in order}):
            errors.append("module_order: contains duplicates")
        if set(order) != module_ids:
            errors.append("module_order: must contain every module exactly once")

    technical_ids: set[str] = set()
    public_slugs: set[str] = set()
    repository_names: set[str] = set()
    legacy_product_names: set[str] = set()
    legacy_package_names: set[str] = set()
    legacy_repository_aliases: set[str] = set()
    for module_id, module in modules.items():
        context = f"modules.{module_id}"
        if not ID_RE.fullmatch(module_id):
            errors.append(f"{context}: invalid stable module id")
        if not isinstance(module, dict):
            errors.append(f"{context}: must be an object")
            continue
        errors.extend(_unknown_and_missing(module, REQUIRED_MODULE_FIELDS, context))

        public_name = module.get("public_name")
        public_slug = module.get("public_slug")
        if not isinstance(public_name, str) or not public_name.startswith("Townlight"):
            errors.append(f"{context}.public_name: must use the Townlight house brand")
        if not isinstance(public_slug, str) or not ID_RE.fullmatch(public_slug):
            errors.append(f"{context}.public_slug: invalid slug")
        elif public_slug in public_slugs:
            errors.append(f"{context}.public_slug: duplicate slug {public_slug}")
        else:
            public_slugs.add(public_slug)

        legacy = module.get("legacy")
        if not isinstance(legacy, dict):
            errors.append(f"{context}.legacy: must be an object")
            technical_id = None
        else:
            required = {"technical_id", "product_names", "package_names"}
            errors.extend(_unknown_and_missing(legacy, required, f"{context}.legacy"))
            technical_id = legacy.get("technical_id")
            if not isinstance(technical_id, str) or not ID_RE.fullmatch(technical_id):
                errors.append(f"{context}.legacy.technical_id: invalid technical id")
            elif technical_id in technical_ids:
                errors.append(
                    f"{context}.legacy.technical_id: duplicate {technical_id}"
                )
            else:
                technical_ids.add(technical_id)
            names = legacy.get("product_names")
            if not isinstance(names, list) or not names:
                errors.append(
                    f"{context}.legacy.product_names: must be a non-empty list"
                )
            else:
                for name in names:
                    if not isinstance(name, str) or not name:
                        errors.append(
                            f"{context}.legacy.product_names: entries must be strings"
                        )
                    elif name in legacy_product_names:
                        errors.append(
                            f"{context}.legacy.product_names: duplicate alias {name}"
                        )
                    else:
                        legacy_product_names.add(name)
            packages = legacy.get("package_names")
            if not isinstance(packages, list):
                errors.append(f"{context}.legacy.package_names: must be a list")
            else:
                for package in packages:
                    if not isinstance(package, str) or not package:
                        errors.append(
                            f"{context}.legacy.package_names: entries must be strings"
                        )
                    elif package in legacy_package_names:
                        errors.append(
                            f"{context}.legacy.package_names: duplicate alias {package}"
                        )
                    else:
                        legacy_package_names.add(package)

        repository = module.get("repository")
        if repository is not None:
            if not isinstance(repository, dict):
                errors.append(f"{context}.repository: must be an object or null")
            else:
                required = {"name", "aliases", "default_branch", "manifest_path"}
                errors.extend(
                    _unknown_and_missing(repository, required, f"{context}.repository")
                )
                name = repository.get("name")
                if not isinstance(name, str) or not name.startswith("townlight/"):
                    errors.append(
                        f"{context}.repository.name: must use the townlight organization"
                    )
                elif name in repository_names:
                    errors.append(f"{context}.repository.name: duplicate {name}")
                else:
                    repository_names.add(name)
                aliases = repository.get("aliases")
                if not isinstance(aliases, list):
                    errors.append(f"{context}.repository.aliases: must be a list")
                else:
                    for alias in aliases:
                        if not isinstance(alias, str) or not alias:
                            errors.append(
                                f"{context}.repository.aliases: entries must be strings"
                            )
                        elif alias in legacy_repository_aliases:
                            errors.append(
                                f"{context}.repository.aliases: duplicate alias {alias}"
                            )
                        else:
                            legacy_repository_aliases.add(alias)

        versions = module.get("versions")
        if not isinstance(versions, dict):
            errors.append(f"{context}.versions: must be an object")
        else:
            required = {"development", "released", "installer", "public_status"}
            errors.extend(
                _unknown_and_missing(versions, required, f"{context}.versions")
            )
            for field in required:
                if not _is_semver(versions.get(field), nullable=True):
                    errors.append(
                        f"{context}.versions.{field}: must be semantic version text or null"
                    )

        release = module.get("release")
        if not isinstance(release, dict):
            errors.append(f"{context}.release: must be an object")
        else:
            required = {"tag", "published_at", "asset_policy"}
            errors.extend(_unknown_and_missing(release, required, f"{context}.release"))
            if not _is_date(release.get("published_at"), nullable=True):
                errors.append(
                    f"{context}.release.published_at: must be YYYY-MM-DD or null"
                )
            if release.get("asset_policy") not in asset_policy_ids:
                errors.append(f"{context}.release.asset_policy: unknown asset policy")

        compatibility = module.get("compatibility")
        if not isinstance(compatibility, dict):
            errors.append(f"{context}.compatibility: must be an object")
        else:
            required = {"development_core", "installer_core", "public_status_core"}
            errors.extend(
                _unknown_and_missing(
                    compatibility, required, f"{context}.compatibility"
                )
            )
            for field in required:
                if not _is_semver(compatibility.get(field), nullable=True):
                    errors.append(
                        f"{context}.compatibility.{field}: must be semantic version text or null"
                    )

        dependencies = module.get("dependencies")
        errors.extend(
            _reference_errors(dependencies, module_ids, f"{context}.dependencies")
        )
        if isinstance(dependencies, list) and module_id in dependencies:
            errors.append(f"{context}.dependencies: module cannot depend on itself")

        maturity = module.get("maturity")
        availability = None
        if not isinstance(maturity, dict):
            errors.append(f"{context}.maturity: must be an object")
        else:
            required = {
                "state",
                "availability",
                "arch_tier",
                "legacy_grade",
                "public_status_released_at",
            }
            errors.extend(
                _unknown_and_missing(maturity, required, f"{context}.maturity")
            )
            if maturity.get("state") not in MATURITY_STATES:
                errors.append(f"{context}.maturity.state: invalid state")
            availability = maturity.get("availability")
            if availability not in {"runtime", "spec-only"}:
                errors.append(f"{context}.maturity.availability: invalid availability")
            if maturity.get("legacy_grade") not in LEGACY_GRADES:
                errors.append(f"{context}.maturity.legacy_grade: invalid grade")
            if not _is_date(maturity.get("public_status_released_at"), nullable=True):
                errors.append(
                    f"{context}.maturity.public_status_released_at: must be YYYY-MM-DD or null"
                )

        installer = module.get("installer")
        if not isinstance(installer, dict):
            errors.append(f"{context}.installer: must be an object")
        else:
            required = {"tier", "role", "status", "source_commit"}
            errors.extend(
                _unknown_and_missing(installer, required, f"{context}.installer")
            )
            source_commit = installer.get("source_commit")
            if source_commit is not None and (
                not isinstance(source_commit, str)
                or not SHA1_RE.fullmatch(source_commit)
            ):
                errors.append(
                    f"{context}.installer.source_commit: must be a SHA-1 or null"
                )

        if availability == "spec-only":
            if repository is not None:
                errors.append(
                    f"{context}: spec-only module must not declare a repository"
                )
            if isinstance(versions, dict) and any(
                value is not None for value in versions.values()
            ):
                errors.append(f"{context}: spec-only module versions must all be null")
        elif availability == "runtime":
            if repository is None:
                errors.append(f"{context}: runtime module must declare a repository")
            if isinstance(versions, dict) and (
                versions.get("development") is None or versions.get("released") is None
            ):
                errors.append(
                    f"{context}: runtime module needs development and released versions"
                )

    errors.extend(_cycle_errors(modules))

    for group_name in ("products", "profiles"):
        groups = data.get(group_name)
        if not isinstance(groups, dict) or not groups:
            errors.append(f"{group_name}: must be a non-empty object")
            continue
        for group_id, group in groups.items():
            if not isinstance(group, dict):
                errors.append(f"{group_name}.{group_id}: must be an object")
                continue
            errors.extend(
                _reference_errors(
                    group.get("modules"),
                    module_ids,
                    f"{group_name}.{group_id}.modules",
                    allow_empty=group_id == "custom",
                )
            )
    return errors


def validate_schema_document(schema: dict[str, Any]) -> list[str]:
    """Keep the checked-in schema aligned with the dependency-free validator."""
    errors: list[str] = []
    if schema.get("$schema") != "https://json-schema.org/draft/2020-12/schema":
        errors.append("schema: must declare JSON Schema draft 2020-12")
    if (
        schema.get("type") != "object"
        or schema.get("additionalProperties") is not False
    ):
        errors.append("schema: root must be a closed object")
    if set(schema.get("required", [])) != REQUIRED_ROOT_FIELDS:
        errors.append("schema: root required fields differ from runtime validator")
    properties = schema.get("properties")
    if not isinstance(properties, dict):
        return errors + ["schema: properties must be an object"]
    if properties.get("schema_version", {}).get("const") != 1:
        errors.append("schema: schema_version const must be 1")
    modules = properties.get("modules", {})
    if modules.get("minProperties") != 28 or modules.get("maxProperties") != 28:
        errors.append("schema: modules must require exactly 28 entries")
    definitions = schema.get("$defs")
    if not isinstance(definitions, dict):
        return errors + ["schema: $defs must be an object"]
    module_definition = definitions.get("module")
    if not isinstance(module_definition, dict):
        errors.append("schema: $defs.module must be an object")
    elif set(module_definition.get("required", [])) != REQUIRED_MODULE_FIELDS:
        errors.append("schema: module required fields differ from runtime validator")
    return errors


def _index(
    items: Any, key: str, context: str
) -> tuple[dict[str, dict[str, Any]], list[str]]:
    if not isinstance(items, list):
        return {}, [f"{context}: must be a list"]
    indexed: dict[str, dict[str, Any]] = {}
    errors: list[str] = []
    for position, item in enumerate(items):
        if not isinstance(item, dict) or not isinstance(item.get(key), str):
            errors.append(f"{context}[{position}]: missing string {key}")
            continue
        item_id = item[key]
        if item_id in indexed:
            errors.append(f"{context}: duplicate {key} {item_id}")
        indexed[item_id] = item
    return indexed, errors


def compare_legacy_sources(
    state: dict[str, Any], installer: dict[str, Any], public_status: dict[str, Any]
) -> list[str]:
    """Ensure the additive manifest faithfully describes today's legacy consumers."""
    errors: list[str] = []
    modules = state["modules"]
    state_by_technical = {
        module["legacy"]["technical_id"]: (stable_id, module)
        for stable_id, module in modules.items()
    }
    installer_by_id, index_errors = _index(
        installer.get("modules"), "id", "installer.modules"
    )
    errors.extend(index_errors)
    status_by_id, index_errors = _index(
        public_status.get("modules"), "id", "public_status.modules"
    )
    errors.extend(index_errors)
    expected_ids = set(state_by_technical)
    if set(installer_by_id) != expected_ids:
        errors.append(
            "installer.modules: technical-id set differs from canonical state"
        )
    if set(status_by_id) != expected_ids:
        errors.append(
            "public_status.modules: technical-id set differs from canonical state"
        )

    stable_to_technical = {
        stable_id: module["legacy"]["technical_id"]
        for stable_id, module in modules.items()
    }
    for technical_id, (stable_id, module) in state_by_technical.items():
        current = installer_by_id.get(technical_id)
        if current is not None:
            context = f"installer.modules.{technical_id}"
            accepted_names = {module["public_name"], *module["legacy"]["product_names"]}
            if current.get("display_name") not in accepted_names:
                errors.append(
                    f"{context}.display_name: unrecognized current or legacy name"
                )
            repository = module["repository"]
            accepted_repositories = (
                {None}
                if repository is None
                else {repository["name"], *repository["aliases"]}
            )
            if current.get("repo") not in accepted_repositories:
                errors.append(
                    f"{context}.repo: does not match canonical repository or alias"
                )
            expected = {
                "tier": module["installer"]["tier"],
                "role": module["installer"]["role"],
                "installer_status": module["installer"]["status"],
                "current_version": module["versions"]["installer"],
                "civiccore_requirement": module["compatibility"]["installer_core"],
            }
            for field, value in expected.items():
                if current.get(field) != value:
                    errors.append(
                        f"{context}.{field}: {current.get(field)!r} != {value!r}"
                    )
            expected_dependencies = [
                stable_to_technical[item] for item in module["dependencies"]
            ]
            if current.get("dependencies") != expected_dependencies:
                errors.append(
                    f"{context}.dependencies: legacy dependency projection differs"
                )
            source_commit = module["installer"]["source_commit"]
            if current.get("source_commit") != source_commit:
                errors.append(
                    f"{context}.source_commit: {current.get('source_commit')!r} != {source_commit!r}"
                )

        status = status_by_id.get(technical_id)
        if status is not None:
            context = f"public_status.modules.{technical_id}"
            accepted_names = {module["public_name"], *module["legacy"]["product_names"]}
            if status.get("name") not in accepted_names:
                errors.append(f"{context}.name: unrecognized current or legacy name")
            expected = {
                "arch_tier": module["maturity"]["arch_tier"],
                "current_version": module["versions"]["public_status"],
                "civiccore_requirement": module["compatibility"]["public_status_core"],
            }
            for field, value in expected.items():
                if status.get(field) != value:
                    errors.append(
                        f"{context}.{field}: {status.get(field)!r} != {value!r}"
                    )
            public = status.get("public_status")
            if not isinstance(public, dict):
                errors.append(f"{context}.public_status: must be an object")
            else:
                if public.get("grade") != module["maturity"]["legacy_grade"]:
                    errors.append(
                        f"{context}.public_status.grade: differs from legacy grade"
                    )
                if (
                    public.get("released_date")
                    != module["maturity"]["public_status_released_at"]
                ):
                    errors.append(
                        f"{context}.public_status.released_date: differs from recorded legacy date"
                    )

    installer_profiles, index_errors = _index(
        installer.get("profiles"), "id", "installer.profiles"
    )
    errors.extend(index_errors)
    if set(installer_profiles) != set(state["profiles"]):
        errors.append("installer.profiles: profile-id set differs from canonical state")
    for profile_id, profile in state["profiles"].items():
        current = installer_profiles.get(profile_id)
        if current is None:
            continue
        expected_modules = [stable_to_technical[item] for item in profile["modules"]]
        if current.get("modules") != expected_modules:
            errors.append(
                f"installer.profiles.{profile_id}.modules: projection differs"
            )
        if bool(current.get("disabled", False)) != profile["disabled"]:
            errors.append(
                f"installer.profiles.{profile_id}.disabled: projection differs"
            )
    return errors


def validate_all(
    state_path: Path = STATE_PATH,
    schema_path: Path = SCHEMA_PATH,
    installer_path: Path = INSTALLER_PATH,
    public_status_path: Path = PUBLIC_STATUS_PATH,
) -> list[str]:
    """Validate state, schema contract, and the two existing catalog projections."""
    state = load_json(state_path)
    schema = load_json(schema_path)
    installer = load_json(installer_path)
    public_status = load_json(public_status_path)
    errors = validate_state(state)
    errors.extend(validate_schema_document(schema))
    errors.extend(validate_against_schema(state, schema))
    if not errors:
        errors.extend(compare_legacy_sources(state, installer, public_status))
    return errors
