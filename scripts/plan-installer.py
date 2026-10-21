"""Generate a non-mutating CivicSuite installer plan."""

from __future__ import annotations

import argparse
import ctypes
import gzip
import hashlib
import json
import platform
import shutil
import subprocess
import sys
import tarfile
import tomllib
import zipfile
import time
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from uuid import uuid4


ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "installer" / "modules.json"
REPORT_ROOT = ROOT / "installer" / "reports"
GENERATED_ROOT = ROOT / "installer" / "generated"
PACKAGE_ROOT = GENERATED_ROOT / "packages"
NATIVE_ROOT = GENERATED_ROOT / "native"
BUNDLE_ROOT = GENERATED_ROOT / "bundles"
DIST_ROOT = ROOT / "installer" / "dist"
SERVICE_CLEANROOM_RUNNER = ROOT / "scripts" / "run-civicrecords-cleanroom.py"
INSTALLER_LIFECYCLE_RUNNER = ROOT / "scripts" / "run-clerk-core-installer.py"
SUITE_LAUNCHER_SOURCE = ROOT / "installer" / "runtime" / "suite-launcher"
SUITE_LAUNCHER_PACKAGE_DIR = "suite-launcher"
SUITE_LAUNCHER_PORT = 18082
SUITE_SESSION_ENV = "CIVICCORE_SUITE_SESSION_SECRET"
SUITE_SESSION_REVOCATION_ENV = "CIVICCORE_SUITE_SESSION_REVOCATION_FILE"
SUITE_SESSION_REVOCATION_FILE_NAME = "civiccore_suite_session_revocations.json"
SUITE_SESSION_REVOCATION_CONTAINER_PATH = f"/civicsuite-shared/{SUITE_SESSION_REVOCATION_FILE_NAME}"
DEFAULT_SIGNING_STATUS = {
    "signed": False,
    "status": "unsigned_public_use_starter",
    "reason": "CivicSuite is an open-source public-use starter release and the installer is intentionally unsigned.",
    "trust_path": "Verify the release SHA256 checksum and official CivicSuite release source before running the installer package.",
}

CITY_CORE_SIGNING_STATUS = {
    "signed": False,
    "status": "unsigned_city_core_beta",
    "reason": "CivicSuite city-core is an unsigned beta installer package pending Linux and Windows matching-host lifecycle proof.",
    "trust_path": "Verify the release SHA256 checksum and official CivicSuite release source before running the installer package.",
}

INNO_APP_IDS = {
    "city-core": "5D8D0E49-99F6-4AFB-88DD-7BE93162A554",
    "clerk-core": "93D44C49-0CF0-44FB-B041-0EF20C43FA32",
}

ARCHIVE_HYGIENE_FORBIDDEN_MARKERS = (
    "/.agent-runs/",
    "/.runtime-proof",
    "/.venv",
    "/__pycache__/",
    "/.pytest_cache/",
    "/.ruff_cache/",
    "/node_modules/",
    "/playwright-report/",
    "/test-results/",
    "/installer/reports/",
)

SOURCE_BUNDLE_FORBIDDEN_NAMES = {
    ".agent-runs",
    ".agents",
    ".claude",
    ".env",
    ".git",
    ".pytest_cache",
    ".ruff_cache",
    ".venv",
    "__pycache__",
    "build",
    "dist",
    "node_modules",
    "playwright-report",
    "superpowers",
    "test-results",
}
SOURCE_BUNDLE_FORBIDDEN_PREFIXES = (
    ".runtime-proof",
    ".tmp-",
    ".venv",
)


def _distribution_copy(profile_id: str) -> dict[str, str | dict[str, bool | str]]:
    if profile_id == "city-core":
        return {
            "console_title": "CivicSuite city-core unsigned beta installer package",
            "project_status": "Project status: city-core beta; Linux and Windows matching-host lifecycle proof is required before promotion.",
            "notice_heading": "Unsigned City-Core Beta Notice",
            "notice_body": (
                "This package is unsigned. CivicSuite city-core is an open-source beta "
                "installer package pending Linux and Windows matching-host lifecycle "
                "proof. Signing certificates are not used for this beta installer path."
            ),
            "native_wrapper_status": "manifests_generated",
            "distribution_status": "unsigned_city_core_beta",
            "next_action": "Publish only after the Linux and Windows lifecycle evidence, SHA256 checksum, and official-source trust path are verified.",
            "signing": CITY_CORE_SIGNING_STATUS,
        }
    return {
        "console_title": "CivicSuite OSS public-use starter installer package",
        "project_status": "Project status: public-use starter release; the installer is intentionally unsigned.",
        "notice_heading": "Unsigned OSS Beta Notice",
        "notice_body": (
            "This package is unsigned. CivicSuite is an open-source public-use starter "
            "release and signing certificates are not used for the public installer path."
        ),
        "native_wrapper_status": "manifests_generated",
        "distribution_status": "unsigned_public_use_starter",
        "next_action": "Publish verified unsigned public-use starter archives only through the SHA256 and official-source trust path.",
        "signing": DEFAULT_SIGNING_STATUS,
    }


class PlannerError(RuntimeError):
    pass


READINESS_SCENARIOS = {
    "nominal": set(),
    "missing-docker": {"container-runtime"},
    "windows-missing-wsl": {"wsl2"},
    "low-resources": {"disk-memory"},
    "ollama-missing": {"ollama"},
    "civiccore-mismatch": {"civiccore-compatibility"},
}

EXECUTION_TOKEN = "_".join(("I", "UNDERSTAND", "THIS", "MUTATES", "HOST"))
MIN_FREE_DISK_BYTES = 60 * 1024 * 1024 * 1024
MIN_MEMORY_BYTES = 8 * 1024 * 1024 * 1024
WINDOWS_DOCKER_DESKTOP_BIN = Path("C:/Program Files/Docker/Docker/resources/bin")

EXECUTOR_PHASES = [
    {
        "id": "preflight",
        "label": "Preflight",
        "purpose": "Confirm manifest, profile, dependency order, host readiness, and required evidence paths.",
        "mutates_host": False,
        "required_inputs": ["manifest", "profile", "readiness"],
        "required_evidence": ["dry_run_plan", "readiness_report"],
        "blocks_on": ["blocked_readiness", "unknown_module", "dependency_cycle"],
    },
    {
        "id": "approval",
        "label": "Approval Gate",
        "purpose": "Require explicit operator approval before any future host mutation.",
        "mutates_host": False,
        "required_inputs": ["execution_token", "resolved_plan"],
        "required_evidence": ["approval_record", "planned_actions"],
        "blocks_on": ["missing_execution_token", "readiness_blocker"],
    },
    {
        "id": "execute",
        "label": "Execute Install",
        "purpose": "Future mutating phase that installs CivicCore first and then selected modules.",
        "mutates_host": True,
        "required_inputs": ["approved_plan", "module_artifacts"],
        "required_evidence": ["install_log", "artifact_versions", "service_config"],
        "blocks_on": [
            "executor_not_implemented",
            "artifact_missing",
            "version_mismatch",
        ],
    },
    {
        "id": "verify",
        "label": "Verify Install",
        "purpose": "Verify selected services, health checks, restart behavior, and actionable failure output.",
        "mutates_host": False,
        "required_inputs": ["installed_profile"],
        "required_evidence": ["health_checks", "restart_check", "failure_copy_check"],
        "blocks_on": ["service_unhealthy", "restart_failed", "missing_evidence"],
    },
    {
        "id": "repair",
        "label": "Repair",
        "purpose": "Future mutating phase that repairs a failed or drifted local profile.",
        "mutates_host": True,
        "required_inputs": ["diagnostics", "approved_repair_plan"],
        "required_evidence": ["repair_log", "post_repair_health_checks"],
        "blocks_on": ["repair_not_approved", "unsafe_drift"],
    },
    {
        "id": "rollback",
        "label": "Rollback Or Uninstall",
        "purpose": "Future mutating phase that rolls back or removes selected services with evidence.",
        "mutates_host": True,
        "required_inputs": ["approved_rollback_plan", "installed_profile"],
        "required_evidence": ["rollback_log", "remaining_state_report"],
        "blocks_on": ["rollback_not_approved", "data_loss_risk_unacknowledged"],
    },
]

EVIDENCE_SCHEMA_VERSION = 1
EVIDENCE_REPORTS = [
    {
        "id": "dry_run_plan",
        "phase": "preflight",
        "path_template": "installer/reports/{run_id}/dry-run-plan.json",
        "required_fields": ["run_id", "profile", "modules", "actions", "mutates_host"],
        "redaction": "no secrets expected; reject environment dumps",
    },
    {
        "id": "readiness_report",
        "phase": "preflight",
        "path_template": "installer/reports/{run_id}/readiness.json",
        "required_fields": [
            "run_id",
            "status",
            "checks",
            "next_action",
            "detection_source",
        ],
        "redaction": "allow executable paths and resource totals; reject tokens and env vars",
    },
    {
        "id": "approval_record",
        "phase": "approval",
        "path_template": "installer/reports/{run_id}/approval.json",
        "required_fields": [
            "run_id",
            "approval_required",
            "approval_received",
            "operator_action",
        ],
        "redaction": "record token presence only, never persist raw approval token",
    },
    {
        "id": "install_log",
        "phase": "execute",
        "path_template": "installer/reports/{run_id}/install-log.jsonl",
        "required_fields": ["run_id", "timestamp", "module", "step", "status"],
        "redaction": "scrub secrets, local usernames in URLs, and auth headers",
    },
    {
        "id": "artifact_versions",
        "phase": "execute",
        "path_template": "installer/reports/{run_id}/artifact-versions.json",
        "required_fields": ["run_id", "artifacts", "mutates_host"],
        "redaction": "public version metadata only",
    },
    {
        "id": "service_config",
        "phase": "execute",
        "path_template": "installer/reports/{run_id}/service-config.json",
        "required_fields": [
            "run_id",
            "services",
            "ports",
            "data_paths",
            "mutates_host",
        ],
        "redaction": "record paths and ports; reject secret values",
    },
    {
        "id": "health_checks",
        "phase": "verify",
        "path_template": "installer/reports/{run_id}/health-checks.json",
        "required_fields": ["run_id", "checks", "mutates_host"],
        "redaction": "response summaries only, no full records or sensitive payloads",
    },
    {
        "id": "restart_check",
        "phase": "verify",
        "path_template": "installer/reports/{run_id}/restart-check.json",
        "required_fields": [
            "run_id",
            "module",
            "restart_attempted",
            "status",
            "duration_seconds",
        ],
        "redaction": "timing and status only",
    },
    {
        "id": "failure_copy_check",
        "phase": "verify",
        "path_template": "installer/reports/{run_id}/failure-copy-check.json",
        "required_fields": ["run_id", "scenario", "message", "fix_steps"],
        "redaction": "operator-facing copy only",
    },
    {
        "id": "repair_log",
        "phase": "repair",
        "path_template": "installer/reports/{run_id}/repair-log.jsonl",
        "required_fields": [
            "run_id",
            "timestamp",
            "module",
            "diagnostic",
            "repair_step",
            "status",
        ],
        "redaction": "scrub secrets and local account identifiers",
    },
    {
        "id": "post_repair_health_checks",
        "phase": "repair",
        "path_template": "installer/reports/{run_id}/post-repair-health-checks.json",
        "required_fields": ["run_id", "module", "status", "remaining_failures"],
        "redaction": "summaries only",
    },
    {
        "id": "rollback_log",
        "phase": "rollback",
        "path_template": "installer/reports/{run_id}/rollback-log.jsonl",
        "required_fields": ["run_id", "timestamp", "module", "rollback_step", "status"],
        "redaction": "scrub secrets and local account identifiers",
    },
    {
        "id": "remaining_state_report",
        "phase": "rollback",
        "path_template": "installer/reports/{run_id}/remaining-state.json",
        "required_fields": [
            "run_id",
            "remaining_services",
            "remaining_data_paths",
            "operator_next_action",
        ],
        "redaction": "paths allowed; no credentials or data payloads",
    },
]

REPORTS_BY_ID = {str(report["id"]): report for report in EVIDENCE_REPORTS}
SECRET_FIELD_MARKERS = (
    "authorization",
    "cookie",
    "credential",
    "env",
    "environment",
    "jwt",
    "key",
    "password",
    "secret",
    "token",
)


def load_manifest(path: Path = MANIFEST) -> dict[str, Any]:
    with path.open(encoding="utf-8") as handle:
        data = json.load(handle)
    if not isinstance(data, dict):
        raise PlannerError("Manifest root must be an object.")
    return data


def declared_source_commit(module_name: str, manifest: dict[str, Any] | None = None) -> str | None:
    manifest_data = manifest or load_manifest()
    modules = manifest_data.get("modules", [])
    if not isinstance(modules, list):
        raise PlannerError("Manifest modules must be a list.")
    for module in modules:
        if isinstance(module, dict) and module.get("id") == module_name:
            value = module.get("source_commit")
            return str(value) if value else None
    return None


def git_head(path: Path) -> str:
    proc = subprocess.run(
        ["git", "-C", str(path), "rev-parse", "HEAD"],
        capture_output=True,
        text=True,
        check=False,
    )
    if proc.returncode != 0:
        detail = (proc.stderr or proc.stdout).strip()
        raise PlannerError(f"Cannot read source git HEAD at {path}: {detail}")
    return proc.stdout.strip()


def enforce_source_commit(module_name: str, source: Path) -> str | None:
    declared = declared_source_commit(module_name)
    if not declared:
        return None
    actual = git_head(source)
    if actual != declared:
        raise PlannerError(
            f"Source commit mismatch for {module_name}: modules.json declares {declared}, "
            f"but {source} is at {actual}. Checkout the declared commit, or update "
            "installer/modules.json to reflect the current source-root state."
        )
    return actual


def make_run_id(now: datetime | None = None) -> str:
    timestamp = (now or datetime.now(UTC)).strftime("%Y%m%dT%H%M%SZ")
    return f"{timestamp}-{uuid4().hex[:8]}"


def _contains_secret_shape(value: Any, *, parent_key: str = "") -> bool:
    if isinstance(value, dict):
        for key, child in value.items():
            key_text = str(key).lower()
            if any(marker in key_text for marker in SECRET_FIELD_MARKERS):
                return True
            if _contains_secret_shape(child, parent_key=key_text):
                return True
    elif isinstance(value, list):
        return any(
            _contains_secret_shape(item, parent_key=parent_key) for item in value
        )
    return False


def _validate_required_fields(report_id: str, payload: dict[str, Any]) -> list[str]:
    report = REPORTS_BY_ID[report_id]
    errors: list[str] = []
    for field in report["required_fields"]:
        if field not in payload:
            errors.append(f"{report_id} missing required field: {field}")
    if _contains_secret_shape(payload):
        errors.append(
            f"{report_id} contains a field that looks secret-bearing or like an environment dump"
        )
    return errors


def _write_json_report(report_id: str, payload: dict[str, Any]) -> Path:
    if report_id not in REPORTS_BY_ID:
        raise PlannerError(f"Unknown evidence report id: {report_id}")
    errors = _validate_required_fields(report_id, payload)
    if errors:
        raise PlannerError("; ".join(errors))
    path = ROOT / str(REPORTS_BY_ID[report_id]["path_template"]).format(
        run_id=payload["run_id"]
    )
    if not _is_within(path, REPORT_ROOT):
        raise PlannerError(f"Report path is outside installer reports root: {path}")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    return path


def _is_within(child: Path, parent: Path) -> bool:
    try:
        child.resolve().relative_to(parent.resolve())
    except ValueError:
        return False
    return True


def _dry_run_report_payload(*, run_id: str, plan: dict[str, Any]) -> dict[str, Any]:
    return {
        "run_id": run_id,
        "profile": plan["profile"],
        "modules": plan["modules"],
        "actions": plan["actions"],
        "mutates_host": plan["mutates_host"],
        "dry_run": plan["dry_run"],
        "menu_style": plan.get("menu_style", {}),
        "host": plan.get("host", {}),
    }


def _readiness_report_payload(
    *, run_id: str, readiness: dict[str, Any]
) -> dict[str, Any]:
    block = readiness["readiness"]
    return {
        "run_id": run_id,
        "status": block["status"],
        "checks": block["checks"],
        "next_action": block["next_action"],
        "detection_source": readiness["detection_source"],
        "profile": readiness["profile"],
        "scenario": readiness.get("scenario"),
        "mutates_host": readiness["mutates_host"],
        "dry_run": readiness["dry_run"],
    }


def _approval_report_payload(*, run_id: str, gate: dict[str, Any]) -> dict[str, Any]:
    return {
        "run_id": run_id,
        "approval_required": True,
        "approval_received": gate["approval_received"],
        "operator_action": "execution_requested",
        "execution_status": gate["execution_status"],
        "gate_status": gate["gate_status"],
        "mutates_host": gate["mutates_host"],
        "dry_run": gate["dry_run"],
        "next_action": gate["next_action"],
    }


def _artifact_report_payload(
    *, run_id: str, artifact_resolution: dict[str, Any]
) -> dict[str, Any]:
    return {
        "run_id": run_id,
        "artifacts": artifact_resolution["artifacts"],
        "mutates_host": artifact_resolution["mutates_host"],
        "profile": artifact_resolution["profile"],
        "status": artifact_resolution["status"],
        "blockers": artifact_resolution["blockers"],
        "next_action": artifact_resolution["next_action"],
    }


def _service_config_report_payload(
    *, run_id: str, profile_config: dict[str, Any]
) -> dict[str, Any]:
    return {
        "run_id": run_id,
        "services": profile_config["services"],
        "ports": profile_config["ports"],
        "data_paths": profile_config["data_paths"],
        "mutates_host": profile_config["mutates_host"],
        "profile": profile_config["profile"],
        "status": profile_config["status"],
        "next_action": profile_config["next_action"],
    }


def _health_report_payload(
    *, run_id: str, health_plan: dict[str, Any]
) -> dict[str, Any]:
    return {
        "run_id": run_id,
        "checks": health_plan["checks"],
        "mutates_host": health_plan["mutates_host"],
        "profile": health_plan["profile"],
        "status": health_plan["status"],
        "next_action": health_plan["next_action"],
    }


def write_report_for_plan(
    *,
    plan: dict[str, Any],
    mode: str,
    run_id: str | None = None,
) -> dict[str, Any]:
    report_run_id = run_id or make_run_id()
    written: list[Path] = []
    if mode == "plan":
        written.append(
            _write_json_report(
                "dry_run_plan", _dry_run_report_payload(run_id=report_run_id, plan=plan)
            )
        )
    elif mode == "readiness":
        written.append(
            _write_json_report(
                "readiness_report",
                _readiness_report_payload(run_id=report_run_id, readiness=plan),
            )
        )
    elif mode == "approval":
        written.append(
            _write_json_report(
                "approval_record",
                _approval_report_payload(run_id=report_run_id, gate=plan),
            )
        )
    elif mode == "artifacts":
        written.append(
            _write_json_report(
                "artifact_versions",
                _artifact_report_payload(
                    run_id=report_run_id, artifact_resolution=plan
                ),
            )
        )
    elif mode == "profile_config":
        written.append(
            _write_json_report(
                "service_config",
                _service_config_report_payload(
                    run_id=report_run_id, profile_config=plan
                ),
            )
        )
    elif mode == "health_checks":
        written.append(
            _write_json_report(
                "health_checks",
                _health_report_payload(run_id=report_run_id, health_plan=plan),
            )
        )
    else:
        raise PlannerError(f"Report writing is not supported for mode: {mode}")
    return {
        "run_id": report_run_id,
        "reports_written": [str(path.relative_to(ROOT)) for path in written],
        "mutates_host": False,
    }


def _profiles_by_id(manifest: dict[str, Any]) -> dict[str, dict[str, Any]]:
    profiles = manifest.get("profiles", [])
    if not isinstance(profiles, list):
        raise PlannerError("Manifest profiles must be a list.")
    return {
        str(profile.get("id")): profile
        for profile in profiles
        if isinstance(profile, dict) and profile.get("id")
    }


def _modules_by_id(manifest: dict[str, Any]) -> dict[str, dict[str, Any]]:
    modules = manifest.get("modules", [])
    if not isinstance(modules, list):
        raise PlannerError("Manifest modules must be a list.")
    return {
        str(module.get("id")): module
        for module in modules
        if isinstance(module, dict) and module.get("id")
    }


def _menu_styles_by_id(manifest: dict[str, Any]) -> dict[str, dict[str, Any]]:
    styles = manifest.get("menu_styles", [])
    if not isinstance(styles, list):
        raise PlannerError("Manifest menu_styles must be a list.")
    return {
        str(style.get("id")): style
        for style in styles
        if isinstance(style, dict) and style.get("id")
    }


def _resolve_module_order(
    module_ids: list[str], modules: dict[str, dict[str, Any]]
) -> list[str]:
    resolved: list[str] = []
    visiting: set[str] = set()
    visited: set[str] = set()

    def visit(module_id: str) -> None:
        if module_id in visited:
            return
        if module_id in visiting:
            raise PlannerError(f"Dependency cycle detected at {module_id}.")
        if module_id not in modules:
            raise PlannerError(f"Unknown module: {module_id}")
        visiting.add(module_id)
        dependencies = modules[module_id].get("dependencies", [])
        if not isinstance(dependencies, list):
            raise PlannerError(f"Module {module_id} dependencies must be a list.")
        for dependency in dependencies:
            visit(str(dependency))
        visiting.remove(module_id)
        visited.add(module_id)
        resolved.append(module_id)

    for module_id in module_ids:
        visit(module_id)
    return resolved


def _host_platform() -> dict[str, str]:
    return {
        "system": platform.system() or "unknown",
        "release": platform.release() or "unknown",
        "machine": platform.machine() or "unknown",
    }


def _baseline_checks(system: str) -> list[dict[str, str]]:
    checks = [
        {
            "id": "container-runtime",
            "description": "Docker Desktop or Docker Engine is installed and running.",
            "mode": "detect_or_guide",
        },
        {
            "id": "disk-memory",
            "description": "Host has enough RAM and disk for the selected profile.",
            "mode": "detect",
        },
        {
            "id": "ollama",
            "description": "Ollama is available when the selected profile enables local LLM features.",
            "mode": "optional",
        },
    ]
    if system.lower() == "windows":
        checks.insert(
            1,
            {
                "id": "wsl2",
                "description": "WSL 2 and Virtual Machine Platform are enabled when Docker Desktop requires them.",
                "mode": "detect_or_guide",
            },
        )
    return checks


def _run_probe(command: list[str], timeout: int = 5) -> dict[str, Any]:
    try:
        proc = subprocess.run(
            command, capture_output=True, text=True, timeout=timeout, check=False
        )
    except FileNotFoundError:
        return {"ok": False, "detail": f"{command[0]} was not found."}
    except subprocess.TimeoutExpired:
        return {
            "ok": False,
            "detail": f"{' '.join(command)} timed out after {timeout} seconds.",
        }
    output = (proc.stdout or proc.stderr).replace("\x00", "").strip()
    return {
        "ok": proc.returncode == 0,
        "detail": output.splitlines()[0] if output else f"exit code {proc.returncode}",
    }


def _known_command_path(name: str) -> str | None:
    found = shutil.which(name)
    if found:
        return found
    if platform.system() == "Windows" and name == "docker":
        docker_exe = WINDOWS_DOCKER_DESKTOP_BIN / "docker.exe"
        if docker_exe.is_file():
            return str(docker_exe)
    return None


def _probe_wsl_docker(wsl_path: str | None) -> dict[str, Any] | None:
    if not wsl_path:
        return None
    return _run_probe(
        [wsl_path, "bash", "-lc", "docker info --format '{{.ServerVersion}}'"],
        timeout=30,
    )


def _memory_bytes() -> int | None:
    if platform.system().lower() == "windows":

        class MemoryStatusEx(ctypes.Structure):
            _fields_ = [
                ("dwLength", ctypes.c_ulong),
                ("dwMemoryLoad", ctypes.c_ulong),
                ("ullTotalPhys", ctypes.c_ulonglong),
                ("ullAvailPhys", ctypes.c_ulonglong),
                ("ullTotalPageFile", ctypes.c_ulonglong),
                ("ullAvailPageFile", ctypes.c_ulonglong),
                ("ullTotalVirtual", ctypes.c_ulonglong),
                ("ullAvailVirtual", ctypes.c_ulonglong),
                ("ullAvailExtendedVirtual", ctypes.c_ulonglong),
            ]

        status = MemoryStatusEx()
        status.dwLength = ctypes.sizeof(MemoryStatusEx)
        if ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(status)):
            return int(status.ullTotalPhys)
        return None
    try:
        page_size = int(getattr(__import__("os"), "sysconf")("SC_PAGE_SIZE"))
        page_count = int(getattr(__import__("os"), "sysconf")("SC_PHYS_PAGES"))
        return page_size * page_count
    except (AttributeError, OSError, ValueError):
        return None


def detect_host_dependencies(host: dict[str, str] | None = None) -> dict[str, Any]:
    host_info = host or _host_platform()
    system = str(host_info.get("system", "")).lower()
    docker_path = _known_command_path("docker")
    ollama_path = _known_command_path("ollama")
    docker_probe = (
        _run_probe([docker_path, "info", "--format", "{{.ServerVersion}}"])
        if docker_path
        else None
    )
    root_usage = shutil.disk_usage(ROOT)
    memory_total = _memory_bytes()

    checks: dict[str, dict[str, Any]] = {}
    checks["container-runtime"] = {
        "detected": bool(docker_path and docker_probe and docker_probe["ok"]),
        "evidence": {
            "docker_path": docker_path,
            "probe": docker_probe,
        },
    }
    checks["disk-memory"] = {
        "detected": root_usage.free >= MIN_FREE_DISK_BYTES
        and (memory_total is None or memory_total >= MIN_MEMORY_BYTES),
        "evidence": {
            "free_disk_bytes": root_usage.free,
            "required_free_disk_bytes": MIN_FREE_DISK_BYTES,
            "memory_bytes": memory_total,
            "required_memory_bytes": MIN_MEMORY_BYTES,
        },
    }
    checks["ollama"] = {
        "detected": bool(ollama_path),
        "evidence": {
            "ollama_path": ollama_path,
        },
    }
    if system == "windows":
        wsl_path = shutil.which("wsl.exe") or shutil.which("wsl")
        wsl_probe = _run_probe([wsl_path, "--status"], timeout=20) if wsl_path else None
        wsl_docker_probe = _probe_wsl_docker(wsl_path)
        if not checks["container-runtime"]["detected"] and wsl_docker_probe and wsl_docker_probe["ok"]:
            checks["container-runtime"]["detected"] = True
            checks["container-runtime"]["evidence"]["fallback"] = "wsl_docker"
            checks["container-runtime"]["evidence"]["wsl_docker_probe"] = wsl_docker_probe
        checks["wsl2"] = {
            "detected": bool(wsl_path and wsl_probe and wsl_probe["ok"]),
            "evidence": {
                "wsl_path": wsl_path,
                "probe": wsl_probe,
                "docker_probe": wsl_docker_probe,
            },
        }
    checks["civiccore-compatibility"] = {
        "detected": True,
        "evidence": {
            "source": "installer/modules.json",
            "note": "Compatibility is manifest-based in this dry-run slice.",
        },
    }
    checks["suite-launcher-runtime"] = {
        "detected": SUITE_LAUNCHER_SOURCE.is_dir()
        and (SUITE_LAUNCHER_SOURCE / "index.html").is_file()
        and (SUITE_LAUNCHER_SOURCE / "scripts" / "serve.mjs").is_file(),
        "evidence": {
            "source": str(SUITE_LAUNCHER_SOURCE.relative_to(ROOT)),
            "port": SUITE_LAUNCHER_PORT,
        },
    }
    checks["shared-staff-session-env"] = {
        "detected": True,
        "evidence": {
            "env_var": SUITE_SESSION_ENV,
            "value_source": "generated on first install if missing",
        },
    }
    return {
        "dry_run": True,
        "mutates_host": False,
        "detection_source": "host_read_only",
        "host": host_info,
        "checks": checks,
    }


def _readiness_messages() -> dict[str, dict[str, Any]]:
    return {
        "container-runtime": {
            "ok": "Container runtime is available for CivicSuite services.",
            "fail": "Docker Desktop or Docker Engine is not available.",
            "severity": "blocker",
            "fix_steps": [
                "Install Docker Desktop on Windows/macOS or Docker Engine on Linux.",
                "Start Docker and wait until it reports that the engine is running.",
                "Run the dry-run readiness check again before installing modules.",
            ],
        },
        "wsl2": {
            "ok": "WSL 2 support is available for Docker Desktop on Windows.",
            "fail": "WSL 2 or Virtual Machine Platform is missing on Windows.",
            "severity": "blocker",
            "fix_steps": [
                "Enable WSL 2 and Virtual Machine Platform from Windows Features.",
                "Reboot Windows if the feature installer asks for it.",
                "Open Docker Desktop and confirm it is using the WSL 2 backend.",
            ],
        },
        "disk-memory": {
            "ok": "Host resources are sufficient for the selected profile.",
            "fail": "The selected profile may not have enough disk or memory.",
            "severity": "blocker",
            "fix_steps": [
                "Free disk space or choose a smaller installer profile.",
                "Close memory-heavy applications before starting local services.",
                "Re-run readiness after changing the profile or host resources.",
            ],
        },
        "ollama": {
            "ok": "Ollama is available when local LLM features are selected.",
            "fail": "Ollama is not available; local LLM features may be disabled.",
            "severity": "warning",
            "fix_steps": [
                "Install Ollama if this profile will use local LLM features.",
                "Start Ollama and confirm models are available.",
                "Continue without Ollama only if local LLM behavior is not required.",
            ],
        },
        "civiccore-compatibility": {
            "ok": "Selected modules are compatible with their recorded CivicCore requirements.",
            "fail": "One or more selected modules require a different CivicCore version.",
            "severity": "blocker",
            "fix_steps": [
                "Review the selected module list and CivicCore requirement in installer/modules.json.",
                "Choose a compatible profile or update the compatibility matrix before install.",
                "Do not install a module against an unverified CivicCore version.",
            ],
        },
        "suite-launcher-runtime": {
            "ok": f"Suite launcher runtime files are present for city-core on localhost:{SUITE_LAUNCHER_PORT}.",
            "fail": "Suite launcher runtime files are missing from installer/runtime/suite-launcher.",
            "severity": "blocker",
            "fix_steps": [
                "Restore installer/runtime/suite-launcher with index.html, package.json, scripts/serve.mjs, and src assets.",
                "Regenerate the city-core package so the suite launcher is copied into the operator package.",
                "Run readiness again before install or verify.",
            ],
        },
        "shared-staff-session-env": {
            "ok": f"Shared staff session check is planned through {SUITE_SESSION_ENV}.",
            "fail": f"Shared staff session check is not represented through {SUITE_SESSION_ENV}.",
            "severity": "blocker",
            "fix_steps": [
                "Regenerate the city-core plan so the shared staff session env var is present.",
                "Run install or repair so the runtime can create the value if it is missing.",
                "Run verify and inspect the shared_staff_session_presence check before staff use.",
            ],
        },
    }


def build_menu_model(
    *, manifest: dict[str, Any], menu_style: str = "guided"
) -> dict[str, Any]:
    profiles = _profiles_by_id(manifest)
    modules = _modules_by_id(manifest)
    menu_styles = _menu_styles_by_id(manifest)
    if menu_style not in menu_styles:
        raise PlannerError(f"Unknown menu style: {menu_style}")

    selectable_modules = [
        {
            "id": module_id,
            "display_name": module.get("display_name"),
            "role": module.get("role"),
            "tier": module.get("tier"),
            "dependencies": module.get("dependencies", []),
            "civiccore_requirement": module.get("civiccore_requirement"),
        }
        for module_id, module in modules.items()
        if module.get("selectable") is True
    ]

    profile_choices = [
        {
            "id": profile_id,
            "label": profile.get("label"),
            "description": profile.get("description"),
            "modules": profile.get("modules", []),
        }
        for profile_id, profile in profiles.items()
    ]

    return {
        "dry_run": True,
        "mutates_host": False,
        "menu_style": menu_styles[menu_style],
        "default_profile": "clerk-core",
        "profile_choices": profile_choices,
        "module_selector": {
            "source": "installer/modules.json",
            "civiccore_is_required": True,
            "selectable_modules": selectable_modules,
        },
    }


def build_readiness_model(
    *,
    manifest: dict[str, Any],
    profile_id: str,
    selected_modules: list[str] | None = None,
    menu_style: str = "guided",
    host: dict[str, str] | None = None,
    scenario: str = "nominal",
    detected: dict[str, Any] | None = None,
) -> dict[str, Any]:
    if scenario not in READINESS_SCENARIOS:
        raise PlannerError(f"Unknown readiness scenario: {scenario}")
    plan = build_install_plan(
        manifest=manifest,
        profile_id=profile_id,
        selected_modules=selected_modules,
        menu_style=menu_style,
        host=host,
    )
    failed_checks = READINESS_SCENARIOS[scenario]
    messages = _readiness_messages()
    checks: list[dict[str, Any]] = []

    check_ids = [
        action["id"] for action in plan["actions"] if action.get("type") == "check"
    ]
    check_ids.append("civiccore-compatibility")
    for check_id in check_ids:
        message = messages[check_id]
        detected_check = None
        if detected:
            detected_checks = detected.get("checks", {})
            if isinstance(detected_checks, dict):
                detected_check = detected_checks.get(check_id)
        failed = check_id in failed_checks
        if detected_check is not None:
            failed = not bool(detected_check.get("detected"))
        checks.append(
            {
                "id": check_id,
                "status": "failed" if failed else "passed",
                "severity": message["severity"] if failed else "info",
                "message": message["fail"] if failed else message["ok"],
                "fix_steps": message["fix_steps"] if failed else [],
                "evidence": detected_check.get("evidence", {})
                if isinstance(detected_check, dict)
                else {},
            }
        )

    blockers = [
        check
        for check in checks
        if check["status"] == "failed" and check["severity"] == "blocker"
    ]
    warnings = [
        check
        for check in checks
        if check["status"] == "failed" and check["severity"] == "warning"
    ]
    return {
        "dry_run": True,
        "mutates_host": False,
        "profile": profile_id,
        "menu_style": plan["menu_style"],
        "host": plan["host"],
        "scenario": scenario,
        "detection_source": detected.get("detection_source")
        if detected
        else "synthetic",
        "readiness": {
            "status": "blocked" if blockers else "warning" if warnings else "ready",
            "checks": checks,
            "next_action": (
                "Resolve blocker fix steps, then run readiness again."
                if blockers
                else "Review warning fix steps or continue if the limitation is acceptable."
                if warnings
                else "Continue to dry-run install planning; no host changes have been made."
            ),
        },
    }


def build_execution_gate(
    *,
    manifest: dict[str, Any],
    profile_id: str,
    selected_modules: list[str] | None = None,
    menu_style: str = "guided",
    approval_token: str | None = None,
) -> dict[str, Any]:
    plan = build_install_plan(
        manifest=manifest,
        profile_id=profile_id,
        selected_modules=selected_modules,
        menu_style=menu_style,
    )
    approved = approval_token == EXECUTION_TOKEN
    return {
        "dry_run": True,
        "mutates_host": False,
        "execution_requested": True,
        "execution_status": "not_implemented",
        "gate_status": "approved_but_executor_missing" if approved else "blocked",
        "approval_required": EXECUTION_TOKEN,
        "approval_received": approved,
        "message": (
            "Execution approval token was provided, but no mutating executor exists in this slice."
            if approved
            else "Install execution is blocked. Re-run with dry-run planning, or provide the explicit approval token only after a mutating executor is reviewed and authorized."
        ),
        "next_action": (
            "Build and review the real executor in a separate guarded slice before allowing host mutation."
            if approved
            else "Review the dry-run plan and readiness output; do not install until the execution gate is intentionally implemented."
        ),
        "planned_modules": plan["modules"],
        "planned_action_count": len(plan["actions"]),
    }


def _local_repo_path(repo: str) -> Path:
    name = repo.split("/")[-1]
    if name == "civicsuite":
        return ROOT
    return ROOT.parent / name


def _read_pyproject_version(path: Path) -> str | None:
    for candidate in (path / "pyproject.toml", path / "backend" / "pyproject.toml"):
        if not candidate.is_file():
            continue
        try:
            data = tomllib.loads(candidate.read_text(encoding="utf-8"))
        except (tomllib.TOMLDecodeError, UnicodeDecodeError):
            continue
        project = data.get("project", {})
        if isinstance(project, dict) and project.get("version"):
            return str(project["version"])
        tool = data.get("tool", {})
        poetry = tool.get("poetry", {}) if isinstance(tool, dict) else {}
        if isinstance(poetry, dict) and poetry.get("version"):
            return str(poetry["version"])
    return None


def _latest_local_tag(path: Path) -> str | None:
    if not (path / ".git").exists():
        return None
    try:
        proc = subprocess.run(
            ["git", "tag", "--sort=-creatordate"],
            cwd=path,
            capture_output=True,
            text=True,
            check=False,
            timeout=5,
        )
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return None
    if proc.returncode != 0:
        return None
    tags = [line.strip() for line in proc.stdout.splitlines() if line.strip()]
    return tags[0] if tags else None


def _checksum_assets(path: Path) -> list[str]:
    candidates = [
        path / "dist" / "SHA256SUMS.txt",
        path / "release" / "SHA256SUMS.txt",
        path / "SHA256SUMS.txt",
    ]
    return [
        str(candidate.relative_to(path))
        for candidate in candidates
        if candidate.is_file()
    ]


def _dist_assets(path: Path, package_name: str, version: str | None) -> list[Path]:
    if not version:
        return []
    dist = path / "dist"
    if not dist.is_dir():
        return []
    normalized_name = package_name.replace("-", "_")
    patterns = [
        f"{normalized_name}-{version}-*.whl",
        f"{package_name}-{version}-*.whl",
        f"{normalized_name}-{version}.tar.gz",
        f"{package_name}-{version}.tar.gz",
    ]
    assets: list[Path] = []
    for pattern in patterns:
        assets.extend(sorted(dist.glob(pattern)))
    return assets


def build_artifact_resolution(
    *,
    manifest: dict[str, Any],
    profile_id: str,
    selected_modules: list[str] | None = None,
    menu_style: str = "guided",
    host: dict[str, str] | None = None,
) -> dict[str, Any]:
    plan = build_install_plan(
        manifest=manifest,
        profile_id=profile_id,
        selected_modules=selected_modules,
        menu_style=menu_style,
        host=host,
    )
    modules = _modules_by_id(manifest)
    artifacts: list[dict[str, Any]] = []
    blockers: list[str] = []
    warnings: list[str] = []
    for module_id in plan["modules"]:
        module = modules[module_id]
        repo = str(module.get("repo", ""))
        local_path = _local_repo_path(repo)
        local_exists = local_path.exists()
        version = _read_pyproject_version(local_path) if local_exists else None
        latest_tag = _latest_local_tag(local_path) if local_exists else None
        checksum_files = _checksum_assets(local_path) if local_exists else []
        dist_assets = (
            _dist_assets(local_path, module_id, version) if local_exists else []
        )
        artifact_status = "resolved"
        if not local_exists:
            artifact_status = "blocked"
            blockers.append(f"{module_id}: local checkout not found at {local_path}")
        elif not version:
            artifact_status = "needs_version_metadata"
            warnings.append(
                f"{module_id}: version metadata was not found in pyproject surfaces"
            )
        elif not latest_tag:
            artifact_status = "needs_release_tag"
            warnings.append(f"{module_id}: no local release tag was found")
        elif not dist_assets:
            artifact_status = "needs_dist_artifact"
            warnings.append(
                f"{module_id}: no local dist artifact found for version {version}"
            )
        if not checksum_files:
            warnings.append(
                f"{module_id}: no local SHA256SUMS.txt found in standard artifact paths"
            )
        artifacts.append(
            {
                "module": module_id,
                "display_name": module.get("display_name"),
                "repo": repo,
                "local_path": str(local_path),
                "local_checkout_found": local_exists,
                "version": version,
                "latest_local_tag": latest_tag,
                "civiccore_requirement": module.get("civiccore_requirement"),
                "checksum_files": checksum_files,
                "dist_assets": [
                    str(asset.relative_to(local_path)) for asset in dist_assets
                ],
                "artifact_status": artifact_status,
                "resolver_mode": "local_read_only",
            }
        )
    return {
        "dry_run": True,
        "mutates_host": False,
        "profile": profile_id,
        "modules": plan["modules"],
        "artifacts": artifacts,
        "status": "blocked" if blockers else "warning" if warnings else "ready",
        "blockers": blockers,
        "warnings": warnings,
        "next_action": (
            "Resolve missing local checkouts before installer execution."
            if blockers
            else "Review warnings and add artifact metadata/checksums before host mutation."
            if warnings
            else "Artifact metadata is ready for non-mutating profile config generation."
        ),
    }


def build_profile_config(
    *,
    manifest: dict[str, Any],
    profile_id: str,
    selected_modules: list[str] | None = None,
    menu_style: str = "guided",
    host: dict[str, str] | None = None,
) -> dict[str, Any]:
    plan = build_install_plan(
        manifest=manifest,
        profile_id=profile_id,
        selected_modules=selected_modules,
        menu_style=menu_style,
        host=host,
    )
    modules = _modules_by_id(manifest)
    services: list[dict[str, Any]] = []
    ports: list[dict[str, Any]] = []
    data_paths: list[dict[str, Any]] = []
    for module_id in plan["modules"]:
        module = modules[module_id]
        service_name = module_id.replace("-", "_")
        default_port = module.get("default_port")
        services.append(
            {
                "module": module_id,
                "service_name": service_name,
                "repo": module.get("repo"),
                "compose_profile": profile_id,
                "depends_on": [
                    dependency.replace("-", "_")
                    for dependency in module.get("dependencies", [])
                ],
                "health_endpoint": f"http://localhost:{default_port}/health"
                if default_port
                else None,
                "configuration_status": "planned_only",
            }
        )
        if default_port:
            ports.append(
                {
                    "module": module_id,
                    "service_name": service_name,
                    "container_port": default_port,
                    "host_port": default_port,
                }
            )
        data_paths.append(
            {
                "module": module_id,
                "service_name": service_name,
                "path": f"data/{module_id}",
                "purpose": "planned local persistent data root",
            }
        )
    if _uses_suite_launcher(profile_id, plan["modules"]):
        services.append(
            {
                "module": "city-core",
                "service_name": "suite_launcher",
                "repo": None,
                "compose_profile": profile_id,
                "depends_on": [
                    module_id.replace("-", "_")
                    for module_id in plan["modules"]
                    if module_id != "civiccore"
                ],
                "health_endpoint": f"http://localhost:{SUITE_LAUNCHER_PORT}/",
                "configuration_status": "planned_static_runtime",
                "runtime_config": _suite_launcher_config(
                    package_relative_path=SUITE_LAUNCHER_PACKAGE_DIR
                ),
            }
        )
        ports.append(
            {
                "module": "city-core",
                "service_name": "suite_launcher",
                "container_port": None,
                "host_port": SUITE_LAUNCHER_PORT,
                "purpose": "suite launcher local browser entrypoint",
            }
        )
        data_paths.append(
            {
                "module": "city-core",
                "service_name": "suite_launcher",
                "path": f"installer/runtime/clerk-core/{SUITE_LAUNCHER_PACKAGE_DIR}",
                "purpose": "installed suite launcher runtime copy",
            }
        )
    return {
        "dry_run": True,
        "mutates_host": False,
        "profile": profile_id,
        "compose_file": f"installer/generated/{profile_id}/compose.yaml",
        "env_file": f"installer/generated/{profile_id}/.env.example",
        "services": services,
        "ports": ports,
        "data_paths": data_paths,
        "status": "planned",
        "next_action": "Review generated profile plan before any compose/env files are written.",
    }


def build_health_check_plan(
    *,
    manifest: dict[str, Any],
    profile_id: str,
    selected_modules: list[str] | None = None,
    menu_style: str = "guided",
    host: dict[str, str] | None = None,
) -> dict[str, Any]:
    profile_config = build_profile_config(
        manifest=manifest,
        profile_id=profile_id,
        selected_modules=selected_modules,
        menu_style=menu_style,
        host=host,
    )
    checks: list[dict[str, Any]] = []
    for service in profile_config["services"]:
        endpoint = service.get("health_endpoint")
        if service["service_name"] == "suite_launcher":
            checks.append(
                {
                    "module": service["module"],
                    "service_name": service["service_name"],
                    "endpoint": endpoint,
                    "status": "planned_only",
                    "starts_service": False,
                    "actionable_failure": (
                        "If the suite launcher check fails, confirm the packaged "
                        f"{SUITE_LAUNCHER_PACKAGE_DIR} directory exists, start it "
                        f"on localhost:{SUITE_LAUNCHER_PORT}, and rerun verify."
                    ),
                    "shared_staff_session_check": SUITE_SESSION_ENV,
                }
            )
            continue
        checks.append(
            {
                "module": service["module"],
                "service_name": service["service_name"],
                "endpoint": endpoint,
                "status": "planned_only" if endpoint else "manual_check_required",
                "starts_service": False,
                "actionable_failure": (
                    f"If {service['module']} health fails, inspect its install log, port assignment, and CivicCore compatibility before retrying."
                    if endpoint
                    else f"{service['module']} has no default port; define a module-specific health proof before execution."
                ),
            }
        )
    return {
        "dry_run": True,
        "mutates_host": False,
        "starts_service": False,
        "profile": profile_id,
        "checks": checks,
        "status": "planned",
        "next_action": "Use this health plan after an approved executor starts services in a future slice.",
    }


def _minimal_civiccore_artifact(artifact_resolution: dict[str, Any]) -> dict[str, Any]:
    artifacts = artifact_resolution.get("artifacts", [])
    for artifact in artifacts:
        if isinstance(artifact, dict) and artifact.get("module") == "civiccore":
            return artifact
    raise PlannerError("CivicCore artifact metadata was not resolved.")


def _windows_path_string(path: Path) -> str:
    text = str(path)
    if text.startswith("/mnt/") and len(text) > 6 and text[6] == "/":
        drive = text[5].upper()
        return f"{drive}:/{text[7:]}"
    return text.replace("\\", "/")


def _posix_path_string(path: Path) -> str:
    text = str(path).replace("\\", "/")
    if len(text) >= 3 and text[1:3] == ":/":
        drive = text[0].lower()
        return f"/mnt/{drive}/{text[3:]}"
    return text


def _install_kit_files(*, artifact: dict[str, Any]) -> dict[str, str]:
    version = artifact.get("version")
    if not version:
        raise PlannerError(
            "CivicCore version metadata is required before generating an install kit."
        )
    local_path = Path(str(artifact.get("local_path", "")))
    dist_assets = artifact.get("dist_assets", [])
    wheel_assets = [asset for asset in dist_assets if str(asset).endswith(".whl")]
    if not wheel_assets:
        raise PlannerError(
            "CivicCore wheel artifact is required before generating an install kit."
        )
    wheel_path = local_path / str(wheel_assets[0])
    wheel_for_windows = _windows_path_string(wheel_path)
    wheel_for_posix = _posix_path_string(wheel_path)
    plan = {
        "profile": "minimal",
        "modules": ["civiccore"],
        "mutates_host_when_run": True,
        "generated_by": "scripts/plan-installer.py --generate-install-kit",
        "civiccore": {
            "version": version,
            "local_artifact": _windows_path_string(wheel_path),
            "local_artifact_posix": wheel_for_posix,
            "repo_path": str(local_path),
            "verify_command": 'python -c "import civiccore; print(civiccore.__version__)"',
        },
        "operator_boundary": {
            "generator_mutates_host": False,
            "installer_scripts_mutate_when_operator_runs_them": True,
            "does_not_install_system_dependencies": True,
            "does_not_start_services": True,
        },
    }
    return {
        "README.md": f"""# CivicSuite Minimal Install Kit

Profile: `minimal`

This generated kit installs CivicCore only. It does not install Docker, WSL,
Python, or other baseline system dependencies. It does not start services or
containers.

Run one of the platform scripts from this directory after reviewing
`civiccore-install-plan.json`.

Windows:

```powershell
.\\install-civiccore.ps1
.\\verify-civiccore.ps1
.\\reset-civiccore.ps1
```

macOS/Linux:

```bash
bash install-civiccore.sh
bash verify-civiccore.sh
bash reset-civiccore.sh
```

The install scripts create a local `.venv` inside this generated kit and install
CivicCore from the local wheel artifact:

Windows artifact path:

`{wheel_for_windows}`

macOS/Linux/WSL artifact path:

`{wheel_for_posix}`
""",
        "requirements.txt": f"{wheel_for_windows}\n",
        "civiccore-install-plan.json": json.dumps(plan, indent=2, sort_keys=True)
        + "\n",
        "install-civiccore.ps1": f"""$ErrorActionPreference = "Stop"
$KitRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$VenvPath = Join-Path $KitRoot ".venv"
$WheelPath = "{wheel_for_windows}"

function Invoke-Step {{
    param([scriptblock]$Command)
    & $Command
    if ($LASTEXITCODE -ne 0) {{
        throw "Command failed with exit code $LASTEXITCODE"
    }}
}}

if (-not (Get-Command python -ErrorAction SilentlyContinue)) {{
    throw "Python 3.11+ is required before installing CivicCore. Install Python, reopen this terminal, then rerun this script."
}}

Invoke-Step {{ python -m venv $VenvPath }}
Invoke-Step {{ & (Join-Path $VenvPath "Scripts\\python.exe") -m pip install --upgrade pip }}
Invoke-Step {{ & (Join-Path $VenvPath "Scripts\\python.exe") -m pip install $WheelPath }}
Invoke-Step {{ & (Join-Path $VenvPath "Scripts\\python.exe") -c "import civiccore; print('CivicCore ' + civiccore.__version__ + ' installed')" }}
""",
        "install-civiccore.sh": f"""#!/usr/bin/env bash
set -euo pipefail
KIT_ROOT="$(cd "$(dirname "${{BASH_SOURCE[0]}}")" && pwd)"
VENV_PATH="${{KIT_ROOT}}/.venv"
WHEEL_PATH="{wheel_for_posix}"

if ! command -v python3 >/dev/null 2>&1; then
  echo "Python 3.11+ is required before installing CivicCore. Install Python, reopen this terminal, then rerun this script." >&2
  exit 1
fi

python3 -m venv "${{VENV_PATH}}"
"${{VENV_PATH}}/bin/python" -m pip install --upgrade pip
"${{VENV_PATH}}/bin/python" -m pip install "${{WHEEL_PATH}}"
"${{VENV_PATH}}/bin/python" -c "import civiccore; print('CivicCore ' + civiccore.__version__ + ' installed')"
""",
        "verify-civiccore.ps1": """$ErrorActionPreference = "Stop"
$KitRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$PythonPath = Join-Path $KitRoot ".venv\\Scripts\\python.exe"

if (-not (Test-Path $PythonPath)) {
    throw "CivicCore is not installed in this kit yet. Run .\\install-civiccore.ps1 first."
}

& $PythonPath -c "import civiccore; print(civiccore.__version__)"
""",
        "reset-civiccore.ps1": """$ErrorActionPreference = "Stop"
$KitRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$VenvPath = Join-Path $KitRoot ".venv"

if (Test-Path $VenvPath) {
    Remove-Item -LiteralPath $VenvPath -Recurse -Force
    Write-Host "Removed kit-local CivicCore virtual environment: $VenvPath"
} else {
    Write-Host "No kit-local CivicCore virtual environment found. Nothing to reset."
}
""",
        "verify-civiccore.sh": """#!/usr/bin/env bash
set -euo pipefail
KIT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PYTHON_PATH="${KIT_ROOT}/.venv/bin/python"

if [[ ! -x "${PYTHON_PATH}" ]]; then
  echo "CivicCore is not installed in this kit yet. Run bash install-civiccore.sh first." >&2
  exit 1
fi

"${PYTHON_PATH}" -c "import civiccore; print(civiccore.__version__)"
""",
        "reset-civiccore.sh": """#!/usr/bin/env bash
set -euo pipefail
KIT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV_PATH="${KIT_ROOT}/.venv"

if [[ -d "${VENV_PATH}" ]]; then
  rm -rf "${VENV_PATH}"
  echo "Removed kit-local CivicCore virtual environment: ${VENV_PATH}"
else
  echo "No kit-local CivicCore virtual environment found. Nothing to reset."
fi
""",
    }


def generate_minimal_install_kit(
    *,
    manifest: dict[str, Any],
    output_root: Path = GENERATED_ROOT,
) -> dict[str, Any]:
    plan = build_install_plan(
        manifest=manifest, profile_id="minimal", menu_style="guided"
    )
    if plan["modules"] != ["civiccore"]:
        raise PlannerError("Minimal install kit may only include CivicCore.")
    artifacts = build_artifact_resolution(
        manifest=manifest, profile_id="minimal", menu_style="guided"
    )
    artifact = _minimal_civiccore_artifact(artifacts)
    files = _install_kit_files(artifact=artifact)
    target = output_root / "minimal"
    if not _is_within(target, output_root):
        raise PlannerError(
            f"Generated installer path is outside installer generated root: {target}"
        )
    written: list[str] = []
    target.mkdir(parents=True, exist_ok=True)
    for relative_path, content in files.items():
        path = target / relative_path
        if not _is_within(path, target):
            raise PlannerError(
                f"Generated installer file path escaped target root: {path}"
            )
        path.write_text(content, encoding="utf-8", newline="\n")
        written.append(str(path.relative_to(ROOT)))
    for script_name in (
        "install-civiccore.sh",
        "verify-civiccore.sh",
        "reset-civiccore.sh",
    ):
        script = target / script_name
        try:
            script.chmod(0o755)
        except OSError:
            pass
    return {
        "dry_run": False,
        "mutates_host": False,
        "profile": "minimal",
        "modules": ["civiccore"],
        "generated_root": str(target.relative_to(ROOT)),
        "files_written": written,
        "installer_scripts_mutate_when_run": True,
        "does_not_install_system_dependencies": True,
        "does_not_start_services": True,
        "next_action": "Review the generated kit, then run the platform install script only when host mutation is approved.",
    }


def _package_platforms(host: dict[str, str] | None = None) -> list[str]:
    if not host:
        return ["windows", "macos", "linux"]
    system = str(host.get("system", "")).lower()
    if "windows" in system:
        return ["windows"]
    if "darwin" in system or "mac" in system:
        return ["macos"]
    if "linux" in system:
        return ["linux"]
    return ["windows", "macos", "linux"]


def _uses_suite_launcher(profile_id: str, module_ids: list[str]) -> bool:
    return profile_id == "city-core" or (
        "civicrecords-ai" in module_ids
        and "civicclerk" in module_ids
        and "civiccode" in module_ids
    )


def _suite_launcher_config(*, package_relative_path: str | None = None) -> dict[str, Any]:
    config: dict[str, Any] = {
        "component": "suite-launcher",
        "source": str(SUITE_LAUNCHER_SOURCE.relative_to(ROOT)),
        "port": SUITE_LAUNCHER_PORT,
        "url": f"http://127.0.0.1:{SUITE_LAUNCHER_PORT}/",
        "modules": [
            {"id": "records", "port": 18080, "href": "http://127.0.0.1:18080/"},
            {"id": "clerk", "port": 18081, "href": "http://127.0.0.1:18081/"},
            {"id": "code", "port": 18820, "href": "http://127.0.0.1:18820/"},
        ],
        "shared_staff_session": {
            "env_var": SUITE_SESSION_ENV,
            "revocation_env_var": SUITE_SESSION_REVOCATION_ENV,
            "revocation_file": SUITE_SESSION_REVOCATION_CONTAINER_PATH,
            "value_source": "generated on first install if missing",
            "persisted_value_in_plan": False,
        },
    }
    if package_relative_path is not None:
        config["package_path"] = package_relative_path
    return config


def _package_launcher_name(platform_id: str) -> str:
    if platform_id == "windows":
        return "start-civicsuite-installer.ps1"
    return "start-civicsuite-installer.sh"


def _package_launcher_text(
    *, platform_id: str, profile_id: str, menu_style: str
) -> str:
    copy = _distribution_copy(profile_id)
    # Default-profile lifecycle modules = this profile's modules minus civiccore (always installed),
    # derived from modules.json so a city-core membership change can never desync the launcher
    # (a hard-coded list here previously dropped the 6th module from install/verify/backup/restore).
    _manifest = load_manifest()
    _profile = next(
        (p for p in _manifest.get("profiles", []) if isinstance(p, dict) and p.get("id") == profile_id),
        None,
    )
    _default_modules = [
        str(module_id)
        for module_id in ((_profile or {}).get("modules", []) or [])
        if module_id != "civiccore"
    ]
    if profile_id == "city-core" and _default_modules:
        _ps_default_block = (
            "$DefaultProfileModules = @("
            + ", ".join(f'"{m}"' for m in _default_modules)
            + ")\n"
            "foreach ($DefaultModule in $DefaultProfileModules) {\n"
            '    $LifecycleModuleArgs += @("--module", $DefaultModule)\n'
            "}\n"
        )
        _sh_default_args = " ".join(f'"--module" "{m}"' for m in _default_modules)
    else:
        _ps_default_block = ""
        _sh_default_args = ""
    if platform_id == "windows":
        return f"""param(
    [switch]$Readiness,
    [switch]$Plan,
    [switch]$Install,
    [switch]$Verify,
    [switch]$Repair,
    [switch]$Backup,
    [switch]$Restore,
    [switch]$Uninstall,
    [switch]$FirstRun,
    [switch]$SuiteLauncher,
    [switch]$GuidedSetup,
    [switch]$ManualPrerequisite,
    [ValidateSet("protected", "bearer", "open")]
    [string]$StaffMode = "protected",
    [switch]$WorkflowProof,
    [string[]]$Module
)

$ErrorActionPreference = "Stop"
$PackageDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = Resolve-Path (Join-Path $PackageDir "..\\..\\..\\..\\..")
$Planner = Join-Path $RepoRoot "scripts\\plan-installer.py"
$Lifecycle = Join-Path $RepoRoot "scripts\\run-clerk-core-installer.py"
$script:CivicSuiteLastLifecycleExitCode = 0

function ConvertTo-WslArg([string]$Value) {{
    $SingleQuote = [char]39
    $Replacement = $SingleQuote + '"' + $SingleQuote + '"' + $SingleQuote
    return $SingleQuote + $Value.Replace([string]$SingleQuote, $Replacement) + $SingleQuote
}}

function ConvertTo-WslPath([string]$Value) {{
    $Resolved = [System.IO.Path]::GetFullPath($Value)
    if ($Resolved -match '^([A-Za-z]):\\\\(.*)$') {{
        $Drive = $Matches[1].ToLowerInvariant()
        $Tail = $Matches[2] -replace [regex]::Escape([string][char]92), '/'
        return "/mnt/$Drive/$Tail"
    }}
    $Converted = & wsl wslpath -a $Resolved 2>$null
    if ($LASTEXITCODE -ne 0 -or -not $Converted) {{
        throw "Could not translate Windows path for WSL: $Resolved"
    }}
    return ($Converted | Select-Object -First 1).Trim()
}}

function Test-WslDocker {{
    $null = & wsl bash -lc 'docker info --format "{{{{.ServerVersion}}}}" >/dev/null 2>&1'
    return $LASTEXITCODE -eq 0
}}

function Test-CivicSuiteAdmin {{
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}}

function Get-CivicSuiteLastExitCode {{
    if ($null -eq $LASTEXITCODE) {{
        return 0
    }}
    return [int]$LASTEXITCODE
}}

function Get-CivicSuiteBootstrapReportDir {{
    $ReportDir = Join-Path $RepoRoot "installer\\reports\\docker-wsl-bootstrap"
    New-Item -ItemType Directory -Force -Path $ReportDir | Out-Null
    return $ReportDir
}}

function Write-CivicSuiteBootstrapLog([string]$Name, [string]$Content) {{
    $ReportDir = Get-CivicSuiteBootstrapReportDir
    $Path = Join-Path $ReportDir $Name
    $Content | Out-File -FilePath $Path -Encoding utf8
    Write-Host "Bootstrap evidence: $Path"
}}

function Register-CivicSuiteRunOnce {{
    $Command = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`" -FirstRun"
    New-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\RunOnce" -Name "CivicSuiteInstallerResume" -Value $Command -PropertyType String -Force | Out-Null
    Write-Host "CivicSuite will resume after reboot using Windows RunOnce."
}}

function Get-CivicSuiteInstallRoot {{
    if ($env:CIVICSUITE_INSTALLER_INSTALL_ROOT) {{
        return $env:CIVICSUITE_INSTALLER_INSTALL_ROOT
    }}
    return (Join-Path $RepoRoot "installer\\runtime\\clerk-core")
}}

function Read-CivicSuiteWizardValue([string]$Label, [string]$Default = "", [switch]$Required) {{
    $EnvName = "CIVICSUITE_" + ($Label.ToUpperInvariant() -replace "[^A-Z0-9]+", "_").Trim("_")
    $Preset = [Environment]::GetEnvironmentVariable($EnvName)
    if ($Preset) {{
        Write-Host "$Label`: $Preset"
        return $Preset
    }}
    while ($true) {{
        $Suffix = if ($Default) {{ " [$Default]" }} else {{ "" }}
        $Value = Read-Host "$Label$Suffix"
        if (-not $Value -and $Default) {{ $Value = $Default }}
        if ($Value -or -not $Required) {{ return $Value }}
        Write-Host "This field is required so CivicSuite can finish first-run setup."
    }}
}}

function Invoke-CivicSuiteFirstRunWizard {{
    $SetupPath = $env:CIVICSUITE_SETUP_PATH
    if (-not $SetupPath) {{
        Write-Host ""
        Write-Host "Choose setup path:"
        Write-Host "1. Guided Setup - install missing WSL/Docker components with admin consent."
        Write-Host "2. Manual Prerequisite - Docker Desktop + WSL2 are already installed."
        $SetupPath = Read-Host "Enter 1 for Guided Setup or 2 for Manual Prerequisite"
    }}
    if ($SetupPath -eq "guided") {{ $SetupPath = "1" }}
    if ($SetupPath -eq "manual") {{ $SetupPath = "2" }}
    if ($SetupPath -ne "1" -and $SetupPath -ne "2") {{
        Write-Error "Choose 1 or 2. No installation was started."
        exit 2
    }}

    $OperatorName = Read-CivicSuiteWizardValue "operator name" -Required
    $OrganizationName = Read-CivicSuiteWizardValue "organization name" -Required
    $AdminEmail = Read-CivicSuiteWizardValue "admin email" "admin@example.gov" -Required
    $TimeZone = Read-CivicSuiteWizardValue "time zone" ([TimeZoneInfo]::Local.Id) -Required
    $LicenseAccept = $env:CIVICSUITE_LICENSE_ACCEPT
    if (-not $LicenseAccept) {{
        $LicenseAccept = Read-Host "Type ACCEPT to confirm CivicSuite terms and the Docker Desktop license prompt when Docker Desktop first starts"
    }}
    if ($LicenseAccept -ne "ACCEPT") {{
        Write-Error "License acceptance is required before first-run install. No installation was started."
        exit 2
    }}

    $env:CIVICSUITE_FIRST_ADMIN_EMAIL = $AdminEmail

    $ReportDir = Join-Path $RepoRoot "installer\\reports\\first-run"
    New-Item -ItemType Directory -Force -Path $ReportDir | Out-Null
    $InstallRoot = Get-CivicSuiteInstallRoot
    $ReportPath = Join-Path $ReportDir "first-run-setup.json"
    @{{
        setup_path = $(if ($SetupPath -eq "1") {{ "guided" }} else {{ "manual-prerequisite" }})
        operator_name = $OperatorName
        organization_name = $OrganizationName
        admin_email = $AdminEmail
        time_zone = $TimeZone
        license_acceptance = "accepted"
        install_root = $InstallRoot
        generated_at = (Get-Date).ToUniversalTime().ToString("o")
        rotation_required = $true
    }} | ConvertTo-Json | Out-File -FilePath $ReportPath -Encoding utf8
    Write-Host "First-run setup evidence: $ReportPath"
    return @{{
        setup_path = $SetupPath
        admin_email = $AdminEmail
        install_root = $InstallRoot
    }}
}}

function Show-CivicSuitePostInstallDashboard([hashtable]$Wizard) {{
    $CredentialPath = Join-Path $Wizard.install_root "sources\\civicrecords-ai\\data\\secrets\\first_admin_password"
    Write-Host ""
    Write-Host "CivicSuite staff dashboard is installed."
    Write-Host "Admin email: $($Wizard.admin_email)"
    Write-Host "Initial administrator credential file: $CredentialPath"
    Write-Host "Open that file once, sign in, rotate the credential immediately, then store the rotated value in your municipal vault."
    Write-Host "Suite launcher: http://127.0.0.1:{SUITE_LAUNCHER_PORT}/"
    Write-Host "Shared staff session check: {SUITE_SESSION_ENV} is generated during install if missing."
    Write-Host "Records AI staff dashboard: http://127.0.0.1:18080/"
    Write-Host "CivicClerk staff dashboard: http://127.0.0.1:18081/"
    Write-Host "CivicCode API/search: http://127.0.0.1:18820/"
}}

function Invoke-CivicSuiteGuidedSetup {{
    if (-not (Test-CivicSuiteAdmin)) {{
        Write-Host "CivicSuite needs Windows administrator consent to install WSL/Docker prerequisites."
        Start-Process powershell.exe -Verb RunAs -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $PSCommandPath, "-GuidedSetup")
        exit 0
    }}

    $Build = [Environment]::OSVersion.Version.Build
    $Arch = $env:PROCESSOR_ARCHITECTURE
    if ($Build -lt 19041) {{
        Write-Error "Windows 10 build 19041+ or Windows 11 is required. Ask IT to upgrade Windows, then rerun CivicSuite."
        exit 2
    }}
    if ($Arch -ne "AMD64") {{
        Write-Error "This CivicSuite installer supports AMD64 Windows only in this run. ARM Windows is out of scope."
        exit 2
    }}

    $ReportDir = Get-CivicSuiteBootstrapReportDir
    $WslStatus = (& wsl --status 2>&1 | Out-String)
    Write-CivicSuiteBootstrapLog "windows-wsl-status-before.txt" $WslStatus
    if ($LASTEXITCODE -ne 0) {{
        Write-Host "Installing WSL2 and Virtual Machine Platform with Microsoft's official wsl --install path."
        $WslInstall = (& wsl --install 2>&1 | Out-String)
        Write-CivicSuiteBootstrapLog "windows-wsl-install.txt" $WslInstall
        Register-CivicSuiteRunOnce
        Write-Host "If Windows asks to reboot, reboot now. CivicSuite will resume automatically."
        exit $LASTEXITCODE
    }}

    $DockerDesktop = Join-Path $env:ProgramFiles "Docker\\Docker\\Docker Desktop.exe"
    if (-not (Test-Path $DockerDesktop)) {{
        $InstallerUrl = "https://desktop.docker.com/win/main/amd64/Docker%20Desktop%20Installer.exe"
        $InstallerPath = Join-Path $ReportDir "Docker Desktop Installer.exe"
        Write-Host "Downloading Docker Desktop from the official Docker Desktop URL."
        Invoke-WebRequest -Uri $InstallerUrl -OutFile $InstallerPath
        $Hash = Get-FileHash -Algorithm SHA256 -Path $InstallerPath
        Write-CivicSuiteBootstrapLog "docker-desktop-download.json" (@{{ url = $InstallerUrl; path = $InstallerPath; sha256 = $Hash.Hash; downloaded_at = (Get-Date).ToUniversalTime().ToString("o") }} | ConvertTo-Json)
        $InstallLog = Join-Path $ReportDir "docker-desktop-install.txt"
        $Proc = Start-Process -FilePath $InstallerPath -ArgumentList @("install", "--quiet") -Wait -PassThru -RedirectStandardOutput $InstallLog -RedirectStandardError "$InstallLog.err"
        Register-CivicSuiteRunOnce
        if ($Proc.ExitCode -ne 0) {{
            Write-Error "Docker Desktop installer exited with $($Proc.ExitCode). Review $InstallLog and $InstallLog.err, then ask IT for help."
            exit $Proc.ExitCode
        }}
        Write-Host "Docker Desktop installed. Start Docker Desktop, accept Docker's license at first start, then rerun CivicSuite if it does not resume automatically."
        exit 0
    }}

    Write-Host "Guided setup prerequisites are present. Continuing with CivicSuite readiness."
}}

function Invoke-CivicSuiteLifecycle([string]$Mode, [string[]]$LifecycleArgs, [switch]$ReturnAfter) {{
    if (Test-WslDocker) {{
        $RepoRootWsl = ConvertTo-WslPath $RepoRoot
        $EnvParts = @()
        if ($env:CIVICSUITE_INSTALLER_RUN_ID) {{
            $EnvParts += "export CIVICSUITE_INSTALLER_RUN_ID=$(ConvertTo-WslArg $env:CIVICSUITE_INSTALLER_RUN_ID);"
        }}
        if ($env:CIVICSUITE_INSTALLER_INSTALL_ROOT) {{
            $InstallRootWsl = ConvertTo-WslPath $env:CIVICSUITE_INSTALLER_INSTALL_ROOT
            $EnvParts += "export CIVICSUITE_INSTALLER_INSTALL_ROOT=$(ConvertTo-WslArg $InstallRootWsl);"
        }}
        if ($env:CIVICSUITE_INSTALLER_PORT_OFFSET) {{
            $EnvParts += "export CIVICSUITE_INSTALLER_PORT_OFFSET=$(ConvertTo-WslArg $env:CIVICSUITE_INSTALLER_PORT_OFFSET);"
        }}
        if ($env:CIVICSUITE_INSTALLER_PROJECT_SUFFIX) {{
            $EnvParts += "export CIVICSUITE_INSTALLER_PROJECT_SUFFIX=$(ConvertTo-WslArg $env:CIVICSUITE_INSTALLER_PROJECT_SUFFIX);"
        }}
        if ($env:CIVICSUITE_FIRST_ADMIN_EMAIL) {{
            $EnvParts += "export CIVICSUITE_FIRST_ADMIN_EMAIL=$(ConvertTo-WslArg $env:CIVICSUITE_FIRST_ADMIN_EMAIL);"
        }}
        if ($env:DOCKER_CONFIG) {{
            $DockerConfigWsl = ConvertTo-WslPath $env:DOCKER_CONFIG
            $EnvParts += "export DOCKER_CONFIG=$(ConvertTo-WslArg $DockerConfigWsl);"
        }}
        $AllArgs = @($Mode) + @($LifecycleArgs)
        $QuotedArgs = $AllArgs | ForEach-Object {{ ConvertTo-WslArg $_ }}
        $Command = ($EnvParts -join " ") + " cd $(ConvertTo-WslArg $RepoRootWsl) && python3 scripts/run-clerk-core-installer.py " + ($QuotedArgs -join " ")
        & wsl bash -lc $Command
        $ExitCode = Get-CivicSuiteLastExitCode
        if ($ReturnAfter) {{
            $script:CivicSuiteLastLifecycleExitCode = $ExitCode
            return
        }}
        exit $ExitCode
    }}

    python $Lifecycle $Mode @LifecycleArgs
    $ExitCode = Get-CivicSuiteLastExitCode
    if ($ReturnAfter) {{
        $script:CivicSuiteLastLifecycleExitCode = $ExitCode
        return
    }}
    exit $ExitCode
}}

Write-Host "{copy['console_title']}"
Write-Host "Signing status: unsigned. Windows may show SmartScreen or unknown publisher warnings."
Write-Host "Trust path: verify the SHA256 checksum from installer\\dist and the official CivicSuite release source before running lifecycle commands."
Write-Host "{copy['project_status']}"

$PlannerArgs = @("--menu-style", "{menu_style}", "--dry-run")
$LifecycleModuleArgs = @()
$LifecycleModeArgs = @("--staff-mode", $StaffMode)
{_ps_default_block}
if ($WorkflowProof) {{
    $LifecycleModeArgs += "--workflow-proof"
}}
if ($Module -and $Module.Count -gt 0) {{
    $PlannerArgs = @("--profile", "custom") + $PlannerArgs
    $LifecycleModuleArgs = @()
    foreach ($SelectedModule in $Module) {{
        $PlannerArgs += @("--module", $SelectedModule)
        $LifecycleModuleArgs += @("--module", $SelectedModule)
    }}
}} else {{
    $PlannerArgs = @("--profile", "{profile_id}") + $PlannerArgs
}}

if ($Plan) {{
    python $Planner @PlannerArgs
    exit (Get-CivicSuiteLastExitCode)
}}

if ($SuiteLauncher) {{
    $SuiteLauncherScript = Join-Path $PackageDir "{SUITE_LAUNCHER_PACKAGE_DIR}\\scripts\\serve.mjs"
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) {{
        Write-Error "Node.js is required to serve the suite launcher. Install Node.js 20+, reopen this terminal, then rerun with -SuiteLauncher."
        exit 2
    }}
    if (-not (Test-Path $SuiteLauncherScript)) {{
        Write-Error "Suite launcher files are missing from this package. Regenerate the city-core package before serving the launcher."
        exit 2
    }}
    & node $SuiteLauncherScript --port {SUITE_LAUNCHER_PORT}
    exit (Get-CivicSuiteLastExitCode)
}}

if ($GuidedSetup) {{
    Invoke-CivicSuiteGuidedSetup
    python $Planner @PlannerArgs --show-readiness --detect-host
    exit (Get-CivicSuiteLastExitCode)
}}

if ($FirstRun) {{
    $Wizard = Invoke-CivicSuiteFirstRunWizard
    if ($Wizard.setup_path -eq "1") {{
        Invoke-CivicSuiteGuidedSetup
    }}
    python $Planner @PlannerArgs --show-readiness --detect-host
    $PlannerExit = Get-CivicSuiteLastExitCode
    if ($PlannerExit -ne 0) {{ exit $PlannerExit }}
    if ($env:CIVICSUITE_FIRST_RUN_SMOKE_ONLY -eq "1") {{
        Write-Host "First-run smoke only: setup wizard and readiness passed; install was not started."
        exit 0
    }}
    Invoke-CivicSuiteLifecycle "install" (@($LifecycleModeArgs) + @($LifecycleModuleArgs)) -ReturnAfter
    $InstallExit = $script:CivicSuiteLastLifecycleExitCode
    if ($InstallExit -ne 0) {{ exit $InstallExit }}
    Show-CivicSuitePostInstallDashboard $Wizard
    exit 0
}}

if ($ManualPrerequisite) {{
    python $Planner @PlannerArgs --show-readiness --detect-host
    $PlannerExit = Get-CivicSuiteLastExitCode
    if ($PlannerExit -ne 0) {{ exit $PlannerExit }}
    Invoke-CivicSuiteLifecycle "install" (@($LifecycleModeArgs) + @($LifecycleModuleArgs))
}}

if ($Install) {{
    Invoke-CivicSuiteLifecycle "install" (@($LifecycleModeArgs) + @($LifecycleModuleArgs))
}}

if ($Verify) {{
    Invoke-CivicSuiteLifecycle "verify" (@($LifecycleModeArgs) + @($LifecycleModuleArgs))
}}

if ($Repair) {{
    Invoke-CivicSuiteLifecycle "repair" (@($LifecycleModeArgs) + @($LifecycleModuleArgs))
}}

if ($Backup) {{
    Invoke-CivicSuiteLifecycle "backup" (@($LifecycleModuleArgs))
}}

if ($Restore) {{
    Invoke-CivicSuiteLifecycle "restore" (@($LifecycleModuleArgs))
}}

if ($Uninstall) {{
    Invoke-CivicSuiteLifecycle "uninstall" (@($LifecycleModuleArgs))
}}

python $Planner @PlannerArgs --show-readiness --detect-host
exit $LASTEXITCODE
"""
    return f"""#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${{BASH_SOURCE[0]}}")" && pwd)"
REPO_ROOT="$(cd "${{SCRIPT_DIR}}/../../../../.." && pwd)"
PLANNER="${{REPO_ROOT}}/scripts/plan-installer.py"
LIFECYCLE="${{REPO_ROOT}}/scripts/run-clerk-core-installer.py"

echo "{copy['console_title']}"
echo "Signing status: unsigned. Your OS may show an unknown developer/publisher warning."
echo "Trust path: verify the SHA256 checksum from installer/dist and the official CivicSuite release source before running lifecycle commands."
echo "{copy['project_status']}"

MODE="${{1:-readiness}}"
if [[ "$#" -gt 0 ]]; then
  shift || true
fi

PLANNER_ARGS=(--menu-style "{menu_style}" --dry-run)
LIFECYCLE_MODULE_ARGS=({_sh_default_args})
LIFECYCLE_MODE_ARGS=(--staff-mode protected)
SELECTED_MODULES=()
first_run_wizard() {{
  local setup_path="${{CIVICSUITE_SETUP_PATH:-}}"
  if [[ -z "$setup_path" ]]; then
    echo ""
    echo "Choose setup path:"
    echo "1. Guided Setup - install missing Docker Engine components with sudo consent."
    echo "2. Manual Prerequisite - Docker Engine is already installed."
    printf "Enter 1 for Guided Setup or 2 for Manual Prerequisite: "
    read -r setup_path
  fi
  if [[ "$setup_path" == "guided" ]]; then setup_path="1"; fi
  if [[ "$setup_path" == "manual" ]]; then setup_path="2"; fi
  if [[ "$setup_path" != "1" && "$setup_path" != "2" ]]; then
    echo "Choose 1 or 2. No installation was started." >&2
    exit 2
  fi
  read_wizard_value "operator name" CIVICSUITE_OPERATOR_NAME "" required
  operator_name="$WIZARD_VALUE"
  read_wizard_value "organization name" CIVICSUITE_ORGANIZATION_NAME "" required
  organization_name="$WIZARD_VALUE"
  read_wizard_value "admin email" CIVICSUITE_ADMIN_EMAIL "admin@example.gov" required
  admin_email="$WIZARD_VALUE"
  read_wizard_value "time zone" CIVICSUITE_TIME_ZONE "$(detect_timezone)" required
  time_zone="$WIZARD_VALUE"
  license_accept="${{CIVICSUITE_LICENSE_ACCEPT:-}}"
  if [[ -z "$license_accept" ]]; then
    printf "Type ACCEPT to confirm CivicSuite terms and any Docker license prompt shown by Docker: "
    read -r license_accept
  fi
  if [[ "$license_accept" != "ACCEPT" ]]; then
    echo "License acceptance is required before first-run install. No installation was started." >&2
    exit 2
  fi
  export CIVICSUITE_FIRST_ADMIN_EMAIL="$admin_email"
  first_run_report_dir="${{REPO_ROOT}}/installer/reports/first-run"
  mkdir -p "$first_run_report_dir"
  first_run_report="${{first_run_report_dir}}/first-run-setup.json"
  setup_label="manual-prerequisite"
  if [[ "$setup_path" == "1" ]]; then setup_label="guided"; fi
  python3 - "$first_run_report" "$setup_label" "$operator_name" "$organization_name" "$admin_email" "$time_zone" "${{CIVICSUITE_INSTALLER_INSTALL_ROOT:-${{REPO_ROOT}}/installer/runtime/clerk-core}}" <<'PY'
import json, sys
from datetime import datetime, UTC
path, setup, operator, org, email, tz, root = sys.argv[1:]
payload = {{
    "setup_path": setup,
    "operator_name": operator,
    "organization_name": org,
    "admin_email": email,
    "time_zone": tz,
    "license_acceptance": "accepted",
    "install_root": root,
    "generated_at": datetime.now(UTC).isoformat(),
    "rotation_required": True,
}}
open(path, "w", encoding="utf-8").write(json.dumps(payload, indent=2) + "\\n")
PY
  echo "First-run setup evidence: $first_run_report"
  WIZARD_SETUP_PATH="$setup_path"
  WIZARD_ADMIN_EMAIL="$admin_email"
  WIZARD_INSTALL_ROOT="${{CIVICSUITE_INSTALLER_INSTALL_ROOT:-${{REPO_ROOT}}/installer/runtime/clerk-core}}"
}}

read_wizard_value() {{
  local label="$1"
  local env_name="$2"
  local default="$3"
  local required="${{4:-}}"
  local preset="${{!env_name:-}}"
  if [[ -n "$preset" ]]; then
    echo "$label: $preset"
    WIZARD_VALUE="$preset"
    return
  fi
  while true; do
    if [[ -n "$default" ]]; then
      printf "%s [%s]: " "$label" "$default"
    else
      printf "%s: " "$label"
    fi
    read -r value
    if [[ -z "$value" && -n "$default" ]]; then value="$default"; fi
    if [[ -n "$value" || "$required" != "required" ]]; then
      WIZARD_VALUE="$value"
      return
    fi
    echo "This field is required so CivicSuite can finish first-run setup."
  done
}}

detect_timezone() {{
  if command -v timedatectl >/dev/null 2>&1; then
    timedatectl show -p Timezone --value 2>/dev/null || true
  fi
}}

show_post_install_dashboard() {{
  local credential_path="${{WIZARD_INSTALL_ROOT}}/sources/civicrecords-ai/data/secrets/first_admin_password"
  echo ""
  echo "CivicSuite staff dashboard is installed."
  echo "Admin email: $WIZARD_ADMIN_EMAIL"
  echo "Initial administrator credential file: $credential_path"
  echo "Open that file once, sign in, rotate the credential immediately, then store the rotated value in your municipal vault."
  echo "Suite launcher: http://127.0.0.1:{SUITE_LAUNCHER_PORT}/"
  echo "Shared staff session check: {SUITE_SESSION_ENV} is generated during install if missing."
  echo "Records AI staff dashboard: http://127.0.0.1:18080/"
  echo "CivicClerk staff dashboard: http://127.0.0.1:18081/"
  echo "CivicCode API/search: http://127.0.0.1:18820/"
}}

while [[ "$#" -gt 0 ]]; do
  case "$1" in
    --staff-mode)
      if [[ "$#" -lt 2 ]]; then
        echo "--staff-mode requires protected, bearer, or open" >&2
        exit 2
      fi
      LIFECYCLE_MODE_ARGS=(--staff-mode "$2")
      shift 2
      ;;
    --workflow-proof)
      LIFECYCLE_MODE_ARGS+=(--workflow-proof)
      shift
      ;;
    --module)
      if [[ "$#" -lt 2 ]]; then
        echo "--module requires civicrecords-ai, civicclerk, civiccode, civicnotice, or civicaccess" >&2
        exit 2
      fi
      SELECTED_MODULES+=("$2")
      LIFECYCLE_MODULE_ARGS+=(--module "$2")
      shift 2
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 2
      ;;
  esac
done

if [[ "${{#SELECTED_MODULES[@]}}" -gt 0 ]]; then
  PLANNER_ARGS=(--profile custom "${{PLANNER_ARGS[@]}}")
  LIFECYCLE_MODULE_ARGS=()
  for selected_module in "${{SELECTED_MODULES[@]}}"; do
    PLANNER_ARGS+=(--module "${{selected_module}}")
    LIFECYCLE_MODULE_ARGS+=(--module "${{selected_module}}")
  done
else
  PLANNER_ARGS=(--profile {profile_id} "${{PLANNER_ARGS[@]}}")
fi

case "${{MODE}}" in
  first-run)
    first_run_wizard
    if [[ "$WIZARD_SETUP_PATH" == "1" ]]; then
      bash "$0" bootstrap-prerequisites
    fi
    python3 "${{PLANNER}}" "${{PLANNER_ARGS[@]}}" --show-readiness --detect-host
    if [[ "${{CIVICSUITE_FIRST_RUN_SMOKE_ONLY:-}}" == "1" ]]; then
      echo "First-run smoke only: setup wizard and readiness passed; install was not started."
      exit 0
    fi
    python3 "${{LIFECYCLE}}" install "${{LIFECYCLE_MODE_ARGS[@]}}" "${{LIFECYCLE_MODULE_ARGS[@]}}"
    show_post_install_dashboard
    ;;
  bootstrap-prerequisites)
    if [[ "{platform_id}" == "macos" ]]; then
      echo "macOS prerequisite bootstrap is out of scope for this run. Use the documented beta readiness path only." >&2
      exit 2
    fi
    report_dir="${{REPO_ROOT}}/installer/reports/docker-wsl-bootstrap"
    mkdir -p "$report_dir"
    if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
      echo "Docker Engine is already installed and running."
      exit 0
    fi
    run_as_root() {{
      if [[ "$(id -u)" -eq 0 ]]; then
        "$@"
      else
        sudo "$@"
      fi
    }}
    start_docker_service() {{
      if command -v systemctl >/dev/null 2>&1; then
        run_as_root systemctl enable --now docker || run_as_root systemctl start docker || true
      elif command -v service >/dev/null 2>&1; then
        run_as_root service docker start || true
      fi
    }}
    unsupported_distro() {{
      local distro="${{1:-unknown}}"
      echo "Guided setup supports Ubuntu, Debian, Fedora, CentOS, and RHEL through Docker's signed package repositories." >&2
      echo "Detected Linux distribution: $distro." >&2
      echo "Fix: install Docker Engine from https://docs.docker.com/engine/install/ for this host, then rerun with setup path 2 (Manual Prerequisite)." >&2
      exit 2
    }}
    install_docker_apt_repo() {{
      local repo_id="$1"
      local codename="$2"
      if [[ -z "$codename" ]]; then
        echo "Could not detect the Debian/Ubuntu release codename for Docker's apt repository." >&2
        echo "Fix: install Docker Engine manually from https://docs.docker.com/engine/install/${{repo_id}}/, then rerun with setup path 2 (Manual Prerequisite)." >&2
        exit 2
      fi
      run_as_root apt-get update
      run_as_root apt-get install -y ca-certificates curl gnupg
      run_as_root install -m 0755 -d /etc/apt/keyrings
      curl -fsSL "https://download.docker.com/linux/${{repo_id}}/gpg" | run_as_root tee /etc/apt/keyrings/docker.asc >/dev/null
      run_as_root chmod a+r /etc/apt/keyrings/docker.asc
      echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/${{repo_id}} $codename stable" | run_as_root tee /etc/apt/sources.list.d/docker.list >/dev/null
      run_as_root apt-get update
      run_as_root apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    }}
    install_docker_rpm_repo() {{
      local repo_id="$1"
      local repo_url="https://download.docker.com/linux/${{repo_id}}/docker-ce.repo"
      if command -v dnf >/dev/null 2>&1; then
        run_as_root dnf -y install dnf-plugins-core
        if ! run_as_root dnf config-manager addrepo --from-repofile "$repo_url"; then
          run_as_root dnf config-manager --add-repo "$repo_url"
        fi
        run_as_root dnf -y install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
      elif command -v yum >/dev/null 2>&1; then
        run_as_root yum install -y yum-utils
        run_as_root yum-config-manager --add-repo "$repo_url"
        run_as_root yum install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
      else
        echo "Could not find dnf or yum for Docker's rpm repository setup." >&2
        exit 2
      fi
    }}
    if [[ ! -r /etc/os-release ]]; then
      unsupported_distro "missing /etc/os-release"
    fi
    # shellcheck disable=SC1091
    . /etc/os-release
    os_id="${{ID:-}}"
    codename="${{VERSION_CODENAME:-}}"
    if [[ -z "$codename" && -n "${{UBUNTU_CODENAME:-}}" ]]; then
      codename="$UBUNTU_CODENAME"
    fi
    case "$os_id" in
      ubuntu|debian)
        install_docker_apt_repo "$os_id" "$codename" 2>&1 | tee "$report_dir/docker-repository-install.txt"
        ;;
      fedora|centos|rhel)
        install_docker_rpm_repo "$os_id" 2>&1 | tee "$report_dir/docker-repository-install.txt"
        ;;
      *)
        unsupported_distro "$os_id"
        ;;
    esac
    start_docker_service
    docker --version | tee "$report_dir/docker-version.txt" || true
    run_as_root docker info > "$report_dir/docker-info.txt" 2>&1 || true
    printf '{{"installer":"docker-engine-signed-repository","distribution":"%s","installed_at":"%s","docs":"https://docs.docker.com/engine/install/"}}\\n' "$os_id" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$report_dir/docker-repository-install.json"
    ;;
  plan)
    python3 "${{PLANNER}}" "${{PLANNER_ARGS[@]}}"
    ;;
  launcher)
    launcher_script="${{SCRIPT_DIR}}/{SUITE_LAUNCHER_PACKAGE_DIR}/scripts/serve.mjs"
    if ! command -v node >/dev/null 2>&1; then
      echo "Node.js is required to serve the suite launcher. Install Node.js 20+, reopen this terminal, then rerun launcher mode." >&2
      exit 2
    fi
    if [[ ! -f "$launcher_script" ]]; then
      echo "Suite launcher files are missing from this package. Regenerate the city-core package before serving the launcher." >&2
      exit 2
    fi
    node "$launcher_script" --port {SUITE_LAUNCHER_PORT}
    ;;
  install)
    python3 "${{LIFECYCLE}}" install "${{LIFECYCLE_MODE_ARGS[@]}}" "${{LIFECYCLE_MODULE_ARGS[@]}}"
    ;;
  verify)
    python3 "${{LIFECYCLE}}" verify "${{LIFECYCLE_MODE_ARGS[@]}}" "${{LIFECYCLE_MODULE_ARGS[@]}}"
    ;;
  repair)
    python3 "${{LIFECYCLE}}" repair "${{LIFECYCLE_MODE_ARGS[@]}}" "${{LIFECYCLE_MODULE_ARGS[@]}}"
    ;;
  backup)
    python3 "${{LIFECYCLE}}" backup "${{LIFECYCLE_MODULE_ARGS[@]}}"
    ;;
  restore)
    python3 "${{LIFECYCLE}}" restore "${{LIFECYCLE_MODULE_ARGS[@]}}"
    ;;
  uninstall)
    python3 "${{LIFECYCLE}}" uninstall "${{LIFECYCLE_MODULE_ARGS[@]}}"
    ;;
  readiness)
    python3 "${{PLANNER}}" "${{PLANNER_ARGS[@]}}" --show-readiness --detect-host
    ;;
  *)
    echo "Usage: $0 [first-run|bootstrap-prerequisites|readiness|plan|launcher|install|verify|repair|backup|restore|uninstall] [--staff-mode protected|bearer|open] [--workflow-proof] [--module civicrecords-ai] [--module civicclerk] [--module civiccode] [--module civicnotice] [--module civicaccess]" >&2
    exit 2
    ;;
esac
"""


def _package_readme_text(
    *, profile_id: str, menu_style: str, platform_id: str, plan: dict[str, Any]
) -> str:
    copy = _distribution_copy(profile_id)
    launcher = _package_launcher_name(platform_id)
    module_lines = "\n".join(f"- {module_id}" for module_id in plan["modules"])
    lifecycle_modules = [module_id for module_id in plan["modules"] if module_id != "civiccore"]
    lifecycle_module_args_ps = " ".join(f"-Module {module_id}" for module_id in lifecycle_modules)
    lifecycle_module_args_sh = " ".join(f"--module {module_id}" for module_id in lifecycle_modules)
    if platform_id == "windows":
        readiness = f".\\{launcher} -Readiness"
        plan_command = f".\\{launcher} -Plan"
        records_only_plan = f".\\{launcher} -Plan -Module civicrecords-ai"
        clerk_only_plan = f".\\{launcher} -Plan -Module civicclerk"
        code_only_plan = f".\\{launcher} -Plan -Module civiccode"
        notice_only_plan = f".\\{launcher} -Plan -Module civicnotice"
        access_only_plan = f".\\{launcher} -Plan -Module civicaccess"
        both_install = (
            f".\\{launcher} -Install {lifecycle_module_args_ps}".strip()
        )
        workflow_proof = f".\\{launcher} -Install -StaffMode bearer -WorkflowProof"
        suite_launcher_command = f".\\{launcher} -SuiteLauncher"
    else:
        readiness = f"bash ./{launcher} readiness"
        plan_command = f"bash ./{launcher} plan"
        records_only_plan = f"bash ./{launcher} plan --module civicrecords-ai"
        clerk_only_plan = f"bash ./{launcher} plan --module civicclerk"
        code_only_plan = f"bash ./{launcher} plan --module civiccode"
        notice_only_plan = f"bash ./{launcher} plan --module civicnotice"
        access_only_plan = f"bash ./{launcher} plan --module civicaccess"
        both_install = (
            f"bash ./{launcher} install {lifecycle_module_args_sh}".strip()
        )
        workflow_proof = (
            f"bash ./{launcher} install --staff-mode bearer --workflow-proof"
        )
        suite_launcher_command = f"bash ./{launcher} launcher"
    return f"""# CivicSuite Installer Package - {platform_id}

Profile: `{profile_id}`
Menu style: `{menu_style}`

## {copy['notice_heading']}

{copy['notice_body']} Windows may show SmartScreen or Unknown Publisher
warnings. macOS may show unidentified developer warnings. Linux package tools
may show an unsigned/local package warning.

This is expected for this beta distribution. Verify the SHA256 checksum from
`installer/dist` and confirm the artifact came from the official CivicSuite
GitHub release source or your IT team's verified source build before running
the package. If the checksum does not match, stop and download the artifact
again from the project release source.

## Platform Warning Guidance

- Windows: choose More info, confirm the app name/path, then choose Run anyway
  only after the checksum matches and the artifact source is verified.
- macOS: use System Settings > Privacy & Security to allow the package only
  after the checksum matches.
- Linux: install from the local archive/package only after verifying the
  checksum file.
- Docker Desktop or Docker Engine is running. If it is not running, the installer
  says how to start Docker before retrying.
- Required ports are free. If a port is occupied, rerun after closing the
  conflicting service or use the documented port-offset flags from the lifecycle
  runner.
- The host has at least 8 GB RAM and 60 GB free disk for the full city-core
  stack.
- Windows hosts need WSL2 and Docker Desktop. macOS hosts need Docker Desktop
  or a compatible Docker Engine and permission to run an unsigned local archive.

This package is the operator-facing installer entrypoint for the selected
platform. First-run mode offers Guided Setup for missing Docker/WSL
prerequisites where this run supports it, or Manual Prerequisite mode for
IT-managed machines. After prerequisites are present, it checks readiness,
renders the selected install plan, installs the {profile_id} runtime from the
bundled module sources, verifies live service health, repairs by
rebuilding/restarting the stack, backs up/restores data, and uninstalls Docker
resources for the profile.

## First Run

1. For the non-technical operator path, run first-run:

   ```text
   {"." + "\\" + launcher + " -FirstRun" if platform_id == "windows" else "bash ./" + launcher + " first-run"}
   ```

   The wizard asks for setup path, operator name, organization name, admin
   email, time zone, license acceptance, and then performs the smoke/readiness
    check before installing. After install, it prints staff dashboard URLs and
    the local credential-file path for the generated first administrator login.
    Open that file once, sign in, rotate the credential immediately, then store
    the rotated value in the municipal vault.

    City-core packages include the suite launcher runtime under
    `{SUITE_LAUNCHER_PACKAGE_DIR}` and plan it for
    `http://127.0.0.1:{SUITE_LAUNCHER_PORT}/`. The installer runtime also
    creates `{SUITE_SESSION_ENV}` on first install if it is missing, then shares
    that value with the selected staff services for the local session boundary.
    To serve the launcher after install or during QA, run:

    ```text
    {suite_launcher_command}
    ```

2. For IT/admin checks, run readiness:

   ```text
   {readiness}
   ```

3. Review the dry-run plan:

   ```text
   {plan_command}
   ```

4. Install the selected profile manually:

   ```text
   {"." + "\\" + launcher + " -Install" if platform_id == "windows" else "bash ./" + launcher + " install"}
   ```

   Available lifecycle modes: readiness, plan, install, verify, repair,
   backup, restore, and uninstall. Install, repair, backup, restore, and
   uninstall are mutating: they create or remove Docker resources and write
   installer reports.

## Selected Modules

{module_lines}

The default package selection installs this package profile on top of the
CivicCore base contract. Operators can choose one module or the whole profile:

```text
{records_only_plan}
{clerk_only_plan}
{code_only_plan}
{notice_only_plan}
{access_only_plan}
{both_install}
```

When a module is selected explicitly, plan/readiness use the same selection
and install/verify/repair/backup/restore/uninstall pass it through to the
lifecycle runner.

For a mutating workflow proof, use bearer staff mode so CivicClerk writes are
protected while the proof creates real starter-set test records:

```text
{workflow_proof}
```

## Boundary

- Readiness and plan modes are non-mutating.
- Install/repair mode is mutating: it builds and starts the selected modules
  from the bundled source tree.
- Verify mode checks live service endpoints. `--workflow-proof` /
  `-WorkflowProof` also creates live CivicRecords AI request/search/review/
  response proof records, CivicClerk agenda/packet/minutes/vote/notice/
  archive proof records, CivicCode health/public lookup proof when
  CivicCode is selected, and a CivicAccess accessibility-review record
  round-trip proof when CivicAccess is selected.
- Backup mode writes per-module PostgreSQL custom dumps plus a manifest under
  the installer runtime backup directory.
- Restore mode verifies the latest backup by restoring each dump into a
  temporary PostgreSQL restore-probe database and removing that probe after the
  check completes.
- Uninstall mode removes the selected module Docker containers and volumes.
- Re-running install or repair over an existing install is expected to be
  idempotent: the installer keeps existing source trees and refreshes runtime
  configuration without deleting data. Use backup before any destructive reset.
- Rollback path: run backup, then uninstall; if you need a clean reset, remove
  the runtime directory only after confirming the backup manifest and dumps
  exist.
- Native host installer wrappers are generated but unsigned for this distribution.

The repo/source checkout cleanroom gate remains available outside this
distributable archive:

```text
python scripts/plan-installer.py --profile {profile_id} --run-cleanroom-gate
```

That source gate uses repo-local Playwright dependencies and is not packaged
inside the distributable archive.
"""


def _copy_suite_launcher_package(package_dir: Path) -> list[str]:
    if not SUITE_LAUNCHER_SOURCE.is_dir():
        raise PlannerError(
            f"Suite launcher runtime source is missing: {SUITE_LAUNCHER_SOURCE}"
        )
    target = package_dir / SUITE_LAUNCHER_PACKAGE_DIR
    if target.exists():
        shutil.rmtree(target)
    shutil.copytree(
        SUITE_LAUNCHER_SOURCE,
        target,
        ignore=shutil.ignore_patterns(
            "node_modules",
            "playwright-report",
            "test-results",
            ".DS_Store",
        ),
    )
    config_path = target / "civicsuite-launcher-config.json"
    config_path.write_text(
        json.dumps(
            _suite_launcher_config(package_relative_path=SUITE_LAUNCHER_PACKAGE_DIR),
            indent=2,
            sort_keys=True,
        )
        + "\n",
        encoding="utf-8",
        newline="\n",
    )
    copied = [
        str(path.relative_to(ROOT))
        for path in sorted(target.rglob("*"))
        if path.is_file()
    ]
    return copied


def generate_profile_package(
    *,
    manifest: dict[str, Any],
    profile_id: str,
    selected_modules: list[str] | None = None,
    menu_style: str = "guided",
    platform_id: str = "all",
    output_root: Path = PACKAGE_ROOT,
) -> dict[str, Any]:
    platforms = ["windows", "macos", "linux"] if platform_id == "all" else [platform_id]
    allowed_platforms = {"windows", "macos", "linux"}
    unknown_platforms = sorted(set(platforms) - allowed_platforms)
    if unknown_platforms:
        raise PlannerError(
            f"Unknown installer package platform: {', '.join(unknown_platforms)}"
        )
    written: list[str] = []
    for target_platform in platforms:
        plan = build_install_plan(
            manifest=manifest,
            profile_id=profile_id,
            selected_modules=selected_modules,
            menu_style=menu_style,
            host=_package_host(target_platform),
        )
        package_dir = output_root / profile_id / target_platform
        if not _is_within(package_dir, output_root):
            raise PlannerError(
                f"Generated package path is outside installer package root: {package_dir}"
            )
        if package_dir.exists():
            shutil.rmtree(package_dir)
        package_dir.mkdir(parents=True, exist_ok=True)
        files = {
            "README.md": _package_readme_text(
                profile_id=profile_id,
                menu_style=menu_style,
                platform_id=target_platform,
                plan=plan,
            ),
            "install-plan.json": json.dumps(plan, indent=2, sort_keys=True) + "\n",
            _package_launcher_name(target_platform): _package_launcher_text(
                platform_id=target_platform,
                profile_id=profile_id,
                menu_style=menu_style,
            ),
        }
        for relative_path, content in files.items():
            path = package_dir / relative_path
            if not _is_within(path, package_dir):
                raise PlannerError(
                    f"Generated package file path escaped package root: {path}"
                )
            path.write_text(content, encoding="utf-8", newline="\n")
            written.append(str(path.relative_to(ROOT)))
        if _uses_suite_launcher(profile_id, plan["modules"]):
            written.extend(_copy_suite_launcher_package(package_dir))
        launcher = package_dir / _package_launcher_name(target_platform)
        try:
            launcher.chmod(0o755)
        except OSError:
            pass
    return {
        "dry_run": False,
        "mutates_host": False,
        "profile": profile_id,
        "menu_style": menu_style,
        "package_root": str((output_root / profile_id).relative_to(ROOT)),
        "platforms": platforms,
        "modules": build_install_plan(
            manifest=manifest,
            profile_id=profile_id,
            selected_modules=selected_modules,
            menu_style=menu_style,
            host=_package_host(platforms[0]),
        )["modules"],
        "files_written": written,
        "operator_entrypoints_mutate_only_in_gate_mode": True,
        "native_installers_packaged": False,
        "next_action": "Review generated platform packages, then run readiness from the target platform package.",
    }


def _package_host(platform_id: str) -> dict[str, str]:
    if platform_id == "windows":
        return {"system": "Windows", "release": "10/11", "machine": "x86_64"}
    if platform_id == "macos":
        return {"system": "Darwin", "release": "13+", "machine": "x86_64/arm64"}
    if platform_id == "linux":
        return {"system": "Linux", "release": "Ubuntu LTS", "machine": "x86_64/arm64"}
    raise PlannerError(f"Unknown installer package platform: {platform_id}")


def _native_manifest_files(
    *, profile_id: str, platform_id: str, version: str, package_dir: Path
) -> dict[str, str]:
    copy = _distribution_copy(profile_id)
    package_rel = package_dir.relative_to(ROOT).as_posix()
    app_id = INNO_APP_IDS.get(profile_id, INNO_APP_IDS["clerk-core"])
    if platform_id == "windows":
        return {
            "CivicSuiteInstaller.iss": f"""; CivicSuite Windows installer wrapper manifest.
; {copy['console_title']}: build with Inno Setup after reviewing the generated package payload.

#define AppName "CivicSuite"
#define AppVersion "{version}"
#define AppPublisher "CivicSuite"
#define PackageSource "..\\..\\packages\\{profile_id}\\windows"

[Setup]
AppId={{{{{app_id}}}
AppName={{#AppName}}
AppVersion={{#AppVersion}}
AppPublisher={{#AppPublisher}}
DefaultDirName={{autopf}}\\CivicSuite
DefaultGroupName=CivicSuite
OutputBaseFilename=CivicSuite-{profile_id}-Setup-{version}
Compression=lzma
SolidCompression=yes
PrivilegesRequired=lowest

[Files]
Source: "{{#PackageSource}}\\*"; DestDir: "{{app}}"; Flags: recursesubdirs createallsubdirs

[Icons]
Name: "{{group}}\\CivicSuite Installer"; Filename: "powershell.exe"; Parameters: "-ExecutionPolicy Bypass -File ""{{app}}\\start-civicsuite-installer.ps1"" -Readiness"
""",
            "README.md": f"""# Windows Native Wrapper

Payload source: `{package_rel}`

Use `CivicSuiteInstaller.iss` with Inno Setup to build a Windows installer that
wraps the generated operator package. The wrapper opens the readiness flow by
default and keeps privileged dependency installation outside silent mutation.

This beta wrapper is intentionally unsigned for the public CivicSuite
open-source path. Windows SmartScreen or Unknown Publisher warnings are
expected. Verify the release SHA256 checksum and official CivicSuite source
before running the installer, then use More info > Run anyway only if the
checksum and source match.
""",
        }
    if platform_id == "macos":
        return {
            "distribution.xml": f"""<?xml version="1.0" encoding="utf-8"?>
<installer-gui-script minSpecVersion="1">
  <title>CivicSuite {profile_id}</title>
  <options customize="never" require-scripts="false"/>
  <domains enable_anywhere="true"/>
  <pkg-ref id="gov.civicsuite.{profile_id}" version="{version}">CivicSuite-{profile_id}.pkg</pkg-ref>
  <choices-outline>
    <line choice="default"/>
  </choices-outline>
  <choice id="default" title="CivicSuite {profile_id}">
    <pkg-ref id="gov.civicsuite.{profile_id}"/>
  </choice>
</installer-gui-script>
""",
            "pkgbuild.txt": f"""pkgbuild --root "{package_rel}" --identifier gov.civicsuite.{profile_id} --version {version} CivicSuite-{profile_id}.pkg
productbuild --distribution distribution.xml --package-path . CivicSuite-{profile_id}-{version}.pkg
""",
            "README.md": f"""# macOS Native Wrapper

Payload source: `{package_rel}`

Use `pkgbuild` and `productbuild` with the included distribution file to create
a macOS package. This beta wrapper is intentionally unsigned for the public
CivicSuite open-source path. macOS unidentified developer warnings are
expected. Verify the release SHA256 checksum and official CivicSuite source
before allowing the package in Privacy & Security.
""",
        }
    return {
        "debian/control": f"""Package: civicsuite-{profile_id}
Version: {version}
Section: admin
Priority: optional
Architecture: all
Maintainer: CivicSuite <support@civicsuite.local>
Depends: python3
Description: CivicSuite {profile_id} installer package
 Operator-facing CivicSuite installer package with readiness, plan, verify,
 repair, uninstall, and cleanroom gate entrypoints.
""",
        "debian/install": f"""../../packages/{profile_id}/linux/* opt/civicsuite/{profile_id}/
""",
        "debian/postinst": """#!/usr/bin/env bash
set -euo pipefail
echo "CivicSuite package installed. Run /opt/civicsuite/*/start-civicsuite-installer.sh readiness"
""",
        "README.md": f"""# Linux Native Wrapper

Payload source: `{package_rel}`

Use the `debian/` metadata as the first `.deb` wrapper for the generated Linux
operator package. Dependency installation remains explicit and operator-led.
This beta wrapper is intentionally unsigned for the public CivicSuite
open-source path. Verify the release SHA256 checksum and official CivicSuite
source before installing the local package.
""",
    }


def _write_tree(root: Path, files: dict[str, str]) -> list[str]:
    written: list[str] = []
    for relative_path, content in files.items():
        path = root / relative_path
        if not _is_within(path, root):
            raise PlannerError(f"Generated file path escaped root: {path}")
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8", newline="\n")
        written.append(str(path.relative_to(ROOT)))
        if path.name == "postinst":
            try:
                path.chmod(0o755)
            except OSError:
                pass
    return written


def _archive_directory(source: Path, target: Path, *, platform_id: str) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.suffix == ".zip":
        with zipfile.ZipFile(target, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            for path in sorted(source.rglob("*")):
                if path.is_file():
                    info = zipfile.ZipInfo(
                        str(path.relative_to(source.parent)).replace("\\", "/")
                    )
                    info.date_time = (2026, 1, 1, 0, 0, 0)
                    info.external_attr = (
                        0o755 if path.suffix == ".sh" else 0o644
                    ) << 16
                    archive.writestr(
                        info, path.read_bytes(), compress_type=zipfile.ZIP_DEFLATED
                    )
        return
    with target.open("wb") as raw:
        with gzip.GzipFile(filename="", mode="wb", fileobj=raw, mtime=0) as gz:
            with tarfile.open(fileobj=gz, mode="w") as archive:
                for path in sorted(source.rglob("*")):
                    arcname = (
                        source.name / path.relative_to(source)
                        if isinstance(source.name, Path)
                        else f"{source.name}/{path.relative_to(source).as_posix()}"
                    )
                    info = archive.gettarinfo(str(path), arcname=arcname)
                    info.mtime = 0
                    info.uid = 0
                    info.gid = 0
                    info.uname = ""
                    info.gname = ""
                    if path.is_file():
                        with path.open("rb") as handle:
                            archive.addfile(info, handle)
                    else:
                        archive.addfile(info)


def _copy_bundle_source(module_name: str, target: Path) -> None:
    source = ROOT / "modules" / module_name
    if not source.is_dir():
        source = ROOT.parent / module_name
    if not source.is_dir():
        target.mkdir(parents=True, exist_ok=True)
        (target / "SOURCE_NOT_BUNDLED.txt").write_text(
            f"""# {module_name} source not bundled

The local module checkout was not available when this bundle was generated.
This fallback is used by umbrella-repo CI, which verifies the generator without
checking out sibling module repositories.

Release archives intended for operators must be generated from a workspace that
contains the sibling `{module_name}` checkout and must pass
`scripts/run-installer-package-cleanroom.py`.
""",
            encoding="utf-8",
            newline="\n",
        )
        return
    source_root = source.resolve()
    source_commit = enforce_source_commit(module_name, source_root)

    def ignore(directory: str, names: list[str]) -> set[str]:
        ignored: set[str] = set()
        rel_dir = Path(directory).resolve().relative_to(source_root)
        rel_parts = set(rel_dir.parts)
        for name in names:
            if name in SOURCE_BUNDLE_FORBIDDEN_NAMES:
                ignored.add(name)
                continue
            if any(
                name.startswith(prefix) for prefix in SOURCE_BUNDLE_FORBIDDEN_PREFIXES
            ):
                ignored.add(name)
                continue
            if name == ".agent-workflows":
                ignored.add(name)
                continue
            if name == "docs" and module_name != "civicrecords-ai":
                ignored.add(name)
                continue
            if name == "tests":
                ignored.add(name)
                continue
            if "backend" in rel_parts and name == "tests":
                ignored.add(name)
                continue
            if "installer" in rel_parts and name == "reports":
                ignored.add(name)
                continue
            if name == "run-civicclerk-cleanroom.sh":
                ignored.add(name)
        return ignored

    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(source, target, ignore=ignore, dirs_exist_ok=True)
    if source_commit:
        (target / "SOURCE_COMMIT.txt").write_text(
            f"{source_commit}\n",
            encoding="utf-8",
            newline="\n",
        )
    if module_name == "civicrecords-ai":
        tests_dir = target / "backend" / "tests"
        tests_dir.mkdir(parents=True, exist_ok=True)
        (tests_dir / ".bundle-placeholder").write_text(
            "Preserves the Dockerfile-required tests directory in zip archives.\n",
            encoding="utf-8",
            newline="\n",
        )
        ledger = source / "docs" / "ops" / "tier1-retrofit-ledger.json"
        if ledger.is_file():
            ledger_target = target / "docs" / "ops" / "tier1-retrofit-ledger.json"
            ledger_target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(ledger, ledger_target)


def _stage_release_bundle(
    *, profile_id: str, platform_id: str, package_dir: Path
) -> Path:
    copy = _distribution_copy(profile_id)
    bundle_dir = (
        BUNDLE_ROOT
        / profile_id
        / platform_id
        / f"CivicSuite-{profile_id}-{platform_id}"
    )
    if not _is_within(bundle_dir, BUNDLE_ROOT):
        raise PlannerError(
            f"Bundle path is outside generated bundle root: {bundle_dir}"
        )
    if bundle_dir.exists():
        for attempt in range(3):
            try:
                shutil.rmtree(bundle_dir)
                break
            except OSError:
                if attempt == 2:
                    raise
                time.sleep(1)
    staged_package = (
        bundle_dir / "installer" / "generated" / "packages" / profile_id / platform_id
    )
    staged_package.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(package_dir, staged_package)
    (bundle_dir / "scripts").mkdir(parents=True, exist_ok=True)
    shutil.copy2(
        ROOT / "scripts" / "plan-installer.py",
        bundle_dir / "scripts" / "plan-installer.py",
    )
    shutil.copy2(
        INSTALLER_LIFECYCLE_RUNNER,
        bundle_dir / "scripts" / "run-clerk-core-installer.py",
    )
    shutil.copy2(
        SERVICE_CLEANROOM_RUNNER,
        bundle_dir / "scripts" / "run-civicrecords-cleanroom.py",
    )
    (bundle_dir / "installer").mkdir(parents=True, exist_ok=True)
    shutil.copy2(MANIFEST, bundle_dir / "installer" / "modules.json")
    plan_path = package_dir / "install-plan.json"
    plan_modules: list[str] = []
    if plan_path.is_file():
        plan = json.loads(plan_path.read_text(encoding="utf-8"))
        plan_modules = [str(module_id) for module_id in plan.get("modules", [])]
    if _uses_suite_launcher(profile_id, plan_modules):
        runtime_launcher = bundle_dir / "installer" / "runtime" / "suite-launcher"
        runtime_launcher.parent.mkdir(parents=True, exist_ok=True)
        shutil.copytree(
            SUITE_LAUNCHER_SOURCE,
            runtime_launcher,
            ignore=shutil.ignore_patterns(
                "node_modules",
                "playwright-report",
                "test-results",
                ".DS_Store",
            ),
        )
    modules_root = bundle_dir / "modules"
    modules_root.mkdir(parents=True, exist_ok=True)
    bundled_modules = ["civicrecords-ai", "civicclerk"]
    if plan_modules:
        bundled_modules = [
            str(module_id)
            for module_id in plan_modules
            if str(module_id) != "civiccore"
        ]
    for module_name in bundled_modules:
        _copy_bundle_source(module_name, modules_root / module_name)
    (bundle_dir / "README.md").write_text(
        f"""# CivicSuite {profile_id} Installer Bundle

{copy['notice_body']} This bundle is self-contained for the {profile_id}
profile. It includes the installer lifecycle runner, the selected platform
package, and the module source trees needed to build/start the selected
CivicSuite modules with Docker.

Start here:

```text
installer/generated/packages/{profile_id}/{platform_id}/{_package_launcher_name(platform_id)}
```

Verify the release SHA256 checksum before running install.
""",
        encoding="utf-8",
        newline="\n",
    )
    return bundle_dir


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _chunk_text(value: str, width: int = 76) -> list[str]:
    return [value[index : index + width] for index in range(0, len(value), width)]


def _write_windows_one_click_installer(
    *, archive_path: Path, target_path: Path, profile_id: str, version: str
) -> None:
    marker = b"\r\n__CIVICSUITE_ZIP_PAYLOAD_BELOW__\r\n"
    target_path.parent.mkdir(parents=True, exist_ok=True)
    script = f"""@echo off
setlocal EnableExtensions
title CivicSuite {profile_id} installer {version}
set "RUNROOT=%TEMP%\\CivicSuite-%RANDOM%-%RANDOM%"
mkdir "%RUNROOT%" >nul 2>nul
set "ARCHIVE=%RUNROOT%\\payload.zip"
set "EXTRACTED=%RUNROOT%\\bundle"
set "CIVICSUITE_SELF=%~f0"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$self=$env:CIVICSUITE_SELF; $bytes=[IO.File]::ReadAllBytes($self); $markerText=([string][char]13)+([string][char]10)+'__CIVICSUITE_ZIP_PAYLOAD_BELOW__'+([string][char]13)+([string][char]10); $marker=[Text.Encoding]::ASCII.GetBytes($markerText); $start=-1; for($i=0; $i -le $bytes.Length-$marker.Length; $i++) {{ $ok=$true; for($j=0; $j -lt $marker.Length; $j++) {{ if($bytes[$i+$j] -ne $marker[$j]) {{ $ok=$false; break }} }} if($ok) {{ $start=$i+$marker.Length; break }} }} if($start -lt 0) {{ Write-Error 'Could not find the embedded CivicSuite installer payload. Fix: verify the downloaded file is complete, then run it again.'; exit 1 }} $payload=New-Object byte[] ($bytes.Length-$start); [Array]::Copy($bytes,$start,$payload,0,$payload.Length); [IO.File]::WriteAllBytes($env:ARCHIVE,$payload); Expand-Archive -LiteralPath $env:ARCHIVE -DestinationPath $env:EXTRACTED -Force; $launcher = Get-ChildItem -LiteralPath $env:EXTRACTED -Recurse -Filter start-civicsuite-installer.ps1 | Where-Object {{ $_.FullName -like '*\\installer\\generated\\packages\\*\\windows\\*' }} | Select-Object -First 1; if (-not $launcher) {{ Write-Error 'CivicSuite Windows launcher was not found after extraction.'; exit 1 }}; if ($env:CIVICSUITE_ONE_CLICK_SMOKE_ONLY -eq '1') {{ & $launcher.FullName -Readiness; exit $LASTEXITCODE }}; & $launcher.FullName -FirstRun"
set "STATUS=%ERRORLEVEL%"
if not "%STATUS%"=="0" (
  echo CivicSuite installation did not pass.
  echo Fix: read the readiness message above, resolve the listed item, and run this installer again.
  pause
)
exit /b %STATUS%
"""
    with target_path.open("wb") as handle:
        handle.write(script.encode("utf-8").replace(b"\n", b"\r\n"))
        handle.write(marker)
        handle.write(archive_path.read_bytes())


def _write_linux_one_click_installer(
    *, archive_path: Path, target_path: Path, profile_id: str, version: str
) -> None:
    script = f"""#!/usr/bin/env bash
set -euo pipefail
echo "CivicSuite {profile_id} one-click installer {version}"
RUNROOT="${{TMPDIR:-/tmp}}/civicsuite-{profile_id}-$RANDOM-$$"
mkdir -p "$RUNROOT"
ARCHIVE="$RUNROOT/payload.tar.gz"
PAYLOAD_LINE=$(awk '/^__CIVICSUITE_PAYLOAD_BELOW__$/ {{ print NR + 1; exit 0; }}' "$0")
if [[ -z "${{PAYLOAD_LINE:-}}" ]]; then
  echo "Could not find the embedded CivicSuite installer payload." >&2
  echo "Fix: verify the downloaded file is complete, then run it again." >&2
  exit 1
fi
tail -n +"$PAYLOAD_LINE" "$0" > "$ARCHIVE"
tar -xzf "$ARCHIVE" -C "$RUNROOT"
launcher=$(find "$RUNROOT" -path "*/installer/generated/packages/*/linux/start-civicsuite-installer.sh" -print -quit)
if [[ -z "${{launcher:-}}" ]]; then
  echo "CivicSuite Linux launcher was not found after extraction." >&2
  echo "Fix: verify the downloaded file is complete, then run it again." >&2
  exit 1
fi
bash "$launcher" readiness
if [[ "${{CIVICSUITE_ONE_CLICK_SMOKE_ONLY:-}}" == "1" ]]; then
  exit 0
fi
exec bash "$launcher" first-run
__CIVICSUITE_PAYLOAD_BELOW__
"""
    target_path.parent.mkdir(parents=True, exist_ok=True)
    with target_path.open("wb") as handle:
        handle.write(script.encode("utf-8"))
        handle.write(archive_path.read_bytes())
    try:
        target_path.chmod(0o755)
    except OSError:
        pass


def _archive_forbidden_entries(path: Path) -> list[str]:
    if not path.is_file():
        return [f"<missing archive: {path}>"]

    if path.suffix == ".zip":
        with zipfile.ZipFile(path) as archive:
            names = archive.namelist()
    else:
        with tarfile.open(path, "r:gz") as archive:
            names = archive.getnames()

    forbidden: list[str] = []
    for name in names:
        normalized = "/" + name.replace("\\", "/").lstrip("/")
        if any(marker in normalized for marker in ARCHIVE_HYGIENE_FORBIDDEN_MARKERS):
            forbidden.append(name)
    return forbidden


def generate_release_artifacts(
    *,
    manifest: dict[str, Any],
    profile_id: str,
    selected_modules: list[str] | None = None,
    menu_style: str = "guided",
    version: str = "0.1.0",
    platform_id: str = "all",
) -> dict[str, Any]:
    copy = _distribution_copy(profile_id)
    package = generate_profile_package(
        manifest=manifest,
        profile_id=profile_id,
        selected_modules=selected_modules,
        menu_style=menu_style,
        platform_id=platform_id,
    )
    platforms = package["platforms"]
    native_written: list[str] = []
    archives: list[dict[str, str]] = []
    one_click_installers: list[dict[str, str]] = []
    for target_platform in platforms:
        package_dir = PACKAGE_ROOT / profile_id / target_platform
        native_dir = NATIVE_ROOT / profile_id / target_platform
        native_written.extend(
            _write_tree(
                native_dir,
                _native_manifest_files(
                    profile_id=profile_id,
                    platform_id=target_platform,
                    version=version,
                    package_dir=package_dir,
                ),
            )
        )
        suffix = ".zip" if target_platform == "windows" else ".tar.gz"
        archive_name = f"CivicSuite-{profile_id}-{target_platform}-{version}{suffix}"
        archive_path = DIST_ROOT / archive_name
        bundle_dir = _stage_release_bundle(
            profile_id=profile_id, platform_id=target_platform, package_dir=package_dir
        )
        _archive_directory(bundle_dir, archive_path, platform_id=target_platform)
        forbidden_entries = _archive_forbidden_entries(archive_path)
        if forbidden_entries:
            sample = ", ".join(forbidden_entries[:5])
            raise PlannerError(
                f"Release archive hygiene failed for {archive_path.relative_to(ROOT)}: "
                f"{len(forbidden_entries)} forbidden entr{'y' if len(forbidden_entries) == 1 else 'ies'} "
                f"including {sample}"
            )
        archives.append(
            {
                "platform": target_platform,
                "path": str(archive_path.relative_to(ROOT)),
                "sha256": _sha256(archive_path),
                "bundle_root": str(bundle_dir.relative_to(ROOT)),
                "support_status": "beta" if target_platform == "macos" else "supported_package",
                "certification_scope": (
                    "macOS archive/readiness beta; not matching-host lifecycle certification"
                    if target_platform == "macos"
                    else "package archive generated for matching-host cleanroom lifecycle"
                ),
            }
        )
        if target_platform == "windows":
            installer_path = DIST_ROOT / f"CivicSuite-{profile_id}-{target_platform}-{version}.cmd"
            _write_windows_one_click_installer(
                archive_path=archive_path,
                target_path=installer_path,
                profile_id=profile_id,
                version=version,
            )
            one_click_installers.append(
                {
                    "platform": target_platform,
                    "path": str(installer_path.relative_to(ROOT)),
                    "sha256": _sha256(installer_path),
                    "source_archive": str(archive_path.relative_to(ROOT)),
                    "entrypoint": "double-click .cmd; readiness then install",
                    "support_status": "supported_one_click",
                    "certification_scope": "Windows one-click wrapper around matching-host package lifecycle",
                }
            )
        elif target_platform == "linux":
            installer_path = DIST_ROOT / f"CivicSuite-{profile_id}-{target_platform}-{version}.run"
            _write_linux_one_click_installer(
                archive_path=archive_path,
                target_path=installer_path,
                profile_id=profile_id,
                version=version,
            )
            one_click_installers.append(
                {
                    "platform": target_platform,
                    "path": str(installer_path.relative_to(ROOT)),
                    "sha256": _sha256(installer_path),
                    "source_archive": str(archive_path.relative_to(ROOT)),
                    "entrypoint": "double-click or run .run; readiness then install",
                    "support_status": "supported_one_click",
                    "certification_scope": "Linux one-click wrapper around matching-host package lifecycle",
                }
            )
    checksum_artifacts = archives + one_click_installers
    checksum_path = DIST_ROOT / f"CivicSuite-{profile_id}-{version}-SHA256SUMS.txt"
    checksum_path.parent.mkdir(parents=True, exist_ok=True)
    checksum_path.write_text(
        "".join(
            f"{artifact['sha256']}  {Path(artifact['path']).name}\n"
            for artifact in checksum_artifacts
        ),
        encoding="utf-8",
        newline="\n",
    )
    release_manifest = {
        "schema_version": 1,
        "installer_version": version,
        "distribution_status": copy["distribution_status"],
        "signing": copy["signing"],
        "profile": profile_id,
        "menu_style": menu_style,
        "platforms": platforms,
        "modules": package["modules"],
        "platform_support": {
            platform: {
                "support_status": "beta" if platform == "macos" else "supported_package",
                "certification_scope": (
                    "macOS archive/readiness beta; not matching-host lifecycle certification"
                    if platform == "macos"
                    else "matching-host cleanroom lifecycle required for promotion"
                ),
            }
            for platform in platforms
        },
        "archives": archives,
        "one_click_installers": one_click_installers,
        "one_click_installers_built": bool(one_click_installers),
        "archive_hygiene": {
            "forbidden_markers": list(ARCHIVE_HYGIENE_FORBIDDEN_MARKERS),
            "status": "passed",
        },
        "checksum_file": str(checksum_path.relative_to(ROOT)),
        "native_wrapper_status": "manifests_generated",
        "native_installers_built": False,
        "next_action": copy["next_action"],
    }
    manifest_path = (
        DIST_ROOT / f"CivicSuite-{profile_id}-{version}-release-manifest.json"
    )
    manifest_path.write_text(
        json.dumps(release_manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    return {
        "dry_run": False,
        "mutates_host": False,
        "profile": profile_id,
        "installer_version": version,
        "platforms": platforms,
        "modules": package["modules"],
        "package_files_written": package["files_written"],
        "native_files_written": native_written,
        "archives": archives,
        "one_click_installers": one_click_installers,
        "one_click_installers_built": bool(one_click_installers),
        "checksum_file": str(checksum_path.relative_to(ROOT)),
        "release_manifest": str(manifest_path.relative_to(ROOT)),
        "native_installers_built": False,
        "signing": copy["signing"],
        "next_action": copy["next_action"],
    }


def run_clerk_core_cleanroom_proof(*, run_id: str | None = None) -> dict[str, Any]:
    proof_run_id = run_id or f"clerk-core-cleanroom-{make_run_id()}"
    if not SERVICE_CLEANROOM_RUNNER.is_file():
        raise PlannerError(
            f"Missing service cleanroom runner: {SERVICE_CLEANROOM_RUNNER}"
        )
    proc = subprocess.run(
        [sys.executable, str(SERVICE_CLEANROOM_RUNNER), "--run-id", proof_run_id],
        cwd=ROOT,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False,
        timeout=3600,
    )
    proof_path = REPORT_ROOT / proof_run_id / "service-ui-proof.json"
    proof: dict[str, Any] | None = None
    if proof_path.is_file():
        proof = json.loads(proof_path.read_text(encoding="utf-8"))
    status = (
        "passed"
        if proc.returncode == 0 and proof and proof.get("status") == "passed"
        else "failed"
    )
    return {
        "dry_run": False,
        "mutates_host": True,
        "profile": "clerk-core",
        "proof_mode": "cleanroom-service",
        "run_id": proof_run_id,
        "status": status,
        "runner": str(SERVICE_CLEANROOM_RUNNER.relative_to(ROOT)),
        "proof_path": str(proof_path.relative_to(ROOT)),
        "api_health": _proof_step_status(proof, "api_health"),
        "frontend_health": _proof_step_status(proof, "frontend_health"),
        "playwright_live_ui": _proof_step_status(proof, "playwright_live_ui"),
        "stdout": proc.stdout,
        "stderr": proc.stderr,
        "returncode": proc.returncode,
        "next_action": (
            "Use this cleanroom proof as the clerk-core service gate."
            if status == "passed"
            else "Inspect service-ui-proof.json and runner output for the failing cleanroom step."
        ),
    }


def summarize_clerk_core_cleanroom_gate(proof: dict[str, Any]) -> dict[str, Any]:
    status = "passed" if proof.get("status") == "passed" else "failed"
    check_names = (
        "api_health",
        "frontend_health",
        "playwright_live_ui",
    )
    checks = [
        {
            "name": name,
            "status": proof.get(name) or "missing",
            "next_action": (
                "No action required."
                if proof.get(name) == "passed"
                else f"Inspect {proof.get('proof_path', 'service-ui-proof.json')} and fix the {name} failure."
            ),
        }
        for name in check_names
    ]
    return {
        "dry_run": False,
        "mutates_host": True,
        "gate": "clerk-core-cleanroom",
        "profile": "clerk-core",
        "status": status,
        "run_id": proof.get("run_id"),
        "proof_path": proof.get("proof_path"),
        "host_mutation_scope": [
            "Docker images",
            "Docker containers",
            "Docker networks",
            "Docker volumes",
            "installer report evidence",
        ],
        "teardown": "Compose stack is torn down with volumes removed by the cleanroom runner.",
        "checks": checks,
        "next_action": (
            "Gate passed. Treat clerk-core service/UI cleanroom evidence as current."
            if status == "passed"
            else "Gate failed. Open the proof path and runner output, fix the first failed check, then rerun this gate."
        ),
    }


def run_clerk_core_cleanroom_gate(*, run_id: str | None = None) -> dict[str, Any]:
    proof = run_clerk_core_cleanroom_proof(run_id=run_id)
    return summarize_clerk_core_cleanroom_gate(proof)


def _proof_step_status(proof: dict[str, Any] | None, step_name: str) -> str | None:
    if not proof:
        return None
    for step in proof.get("steps", []):
        if isinstance(step, dict) and step.get("name") == step_name:
            if "status" in step:
                return str(step["status"])
            if "returncode" in step:
                return "passed" if step.get("returncode") == 0 else "failed"
    return None


def build_executor_preflight(
    *,
    manifest: dict[str, Any],
    profile_id: str,
    selected_modules: list[str] | None = None,
    menu_style: str = "guided",
    host: dict[str, str] | None = None,
    readiness_scenario: str = "nominal",
) -> dict[str, Any]:
    readiness = build_readiness_model(
        manifest=manifest,
        profile_id=profile_id,
        selected_modules=selected_modules,
        menu_style=menu_style,
        host=host,
        scenario=readiness_scenario,
    )
    artifacts = build_artifact_resolution(
        manifest=manifest,
        profile_id=profile_id,
        selected_modules=selected_modules,
        menu_style=menu_style,
        host=host,
    )
    profile_config = build_profile_config(
        manifest=manifest,
        profile_id=profile_id,
        selected_modules=selected_modules,
        menu_style=menu_style,
        host=host,
    )
    health = build_health_check_plan(
        manifest=manifest,
        profile_id=profile_id,
        selected_modules=selected_modules,
        menu_style=menu_style,
        host=host,
    )
    blockers: list[str] = []
    if readiness["readiness"]["status"] == "blocked":
        blockers.append("readiness_blocked")
    if artifacts["status"] == "blocked":
        blockers.append("artifact_resolution_blocked")
    blockers.append("executor_not_implemented")
    return {
        "dry_run": True,
        "mutates_host": False,
        "profile": profile_id,
        "status": "blocked",
        "blockers": blockers,
        "readiness_status": readiness["readiness"]["status"],
        "artifact_status": artifacts["status"],
        "profile_config_status": profile_config["status"],
        "health_plan_status": health["status"],
        "approval_required": EXECUTION_TOKEN,
        "next_action": "Executor remains blocked until readiness, artifact resolution, profile config, health planning, and user approval are all satisfied in a future mutating tier.",
    }


def build_executor_design(
    *,
    manifest: dict[str, Any],
    profile_id: str,
    selected_modules: list[str] | None = None,
    menu_style: str = "guided",
) -> dict[str, Any]:
    plan = build_install_plan(
        manifest=manifest,
        profile_id=profile_id,
        selected_modules=selected_modules,
        menu_style=menu_style,
    )
    return {
        "dry_run": True,
        "mutates_host": False,
        "executor_status": "design_only",
        "profile": profile_id,
        "menu_style": plan["menu_style"],
        "planned_modules": plan["modules"],
        "state_machine": {
            "entry_phase": "preflight",
            "terminal_phases": ["verify", "rollback"],
            "phases": EXECUTOR_PHASES,
            "transition_order": [
                "preflight",
                "approval",
                "execute",
                "verify",
                "repair",
                "rollback",
            ],
        },
        "implementation_boundary": {
            "allowed_now": [
                "render executor design",
                "validate required phases",
                "verify mutating phases are marked future-only",
            ],
            "forbidden_now": [
                "install dependencies",
                "start services",
                "start containers",
                "write host configuration",
                "run module installers",
            ],
        },
        "next_action": "Review executor design before any mutating executor implementation is created.",
    }


def build_evidence_schema(
    *,
    manifest: dict[str, Any],
    profile_id: str,
    selected_modules: list[str] | None = None,
    menu_style: str = "guided",
) -> dict[str, Any]:
    executor = build_executor_design(
        manifest=manifest,
        profile_id=profile_id,
        selected_modules=selected_modules,
        menu_style=menu_style,
    )
    phase_ids = {phase["id"] for phase in EXECUTOR_PHASES}
    report_phase_ids = {report["phase"] for report in EVIDENCE_REPORTS}
    missing_phase_reports = sorted(phase_ids - report_phase_ids)
    return {
        "dry_run": True,
        "mutates_host": False,
        "schema_version": EVIDENCE_SCHEMA_VERSION,
        "profile": profile_id,
        "planned_modules": executor["planned_modules"],
        "report_root": "installer/reports/{run_id}",
        "run_id_format": "UTC timestamp plus short random suffix",
        "reports": EVIDENCE_REPORTS,
        "validation_rules": [
            "Every executor phase must have at least one evidence report.",
            "Every evidence report must include run_id and required_fields.",
            "Mutating phases must write append-only logs before and after each mutating step.",
            "Reports must record operator-facing next actions for failures.",
            "Reports must not persist secrets, raw environment dumps, auth headers, or data payloads.",
        ],
        "missing_phase_reports": missing_phase_reports,
        "next_action": "Review evidence schema before implementing report writers or mutating executor phases.",
    }


def build_install_plan(
    *,
    manifest: dict[str, Any],
    profile_id: str,
    selected_modules: list[str] | None = None,
    menu_style: str = "guided",
    host: dict[str, str] | None = None,
) -> dict[str, Any]:
    profiles = _profiles_by_id(manifest)
    modules = _modules_by_id(manifest)
    menu_styles = _menu_styles_by_id(manifest)
    if profile_id not in profiles:
        raise PlannerError(f"Unknown profile: {profile_id}")
    if menu_style not in menu_styles:
        raise PlannerError(f"Unknown menu style: {menu_style}")

    profile = profiles[profile_id]
    if profile_id == "custom":
        requested = selected_modules or []
        if not requested:
            raise PlannerError("Custom profile requires at least one selected module.")
        requested_modules = ["civiccore", *requested]
    else:
        if profile.get("disabled") is True:
            reason = profile.get("disabled_reason") or "profile is disabled"
            raise PlannerError(f"Profile {profile_id} is disabled: {reason}")
        profile_modules = profile.get("modules", [])
        if not isinstance(profile_modules, list):
            raise PlannerError(f"Profile {profile_id} modules must be a list.")
        requested_modules = [str(module_id) for module_id in profile_modules]

    ordered_ids = _resolve_module_order(requested_modules, modules)
    host_info = host or _host_platform()
    baseline_checks = _baseline_checks(str(host_info.get("system", "")))

    actions: list[dict[str, Any]] = []
    for check in baseline_checks:
        actions.append({"type": "check", **check})
    if _uses_suite_launcher(profile_id, ordered_ids):
        actions.extend(
            [
                {
                    "type": "check",
                    "id": "suite-launcher-runtime",
                    "mode": "file_and_port_plan",
                    "description": (
                        "Suite launcher runtime files are packaged and planned "
                        f"for localhost:{SUITE_LAUNCHER_PORT}."
                    ),
                },
                {
                    "type": "check",
                    "id": "shared-staff-session-env",
                    "mode": "env_plan",
                    "description": (
                        f"Shared staff session env var {SUITE_SESSION_ENV} is "
                        "created at runtime if missing and shared with selected services."
                    ),
                },
            ]
        )
    for module_id in ordered_ids:
        module = modules[module_id]
        actions.append(
            {
                "type": "install_module",
                "module": module_id,
                "display_name": module.get("display_name"),
                "repo": module.get("repo"),
                "civiccore_requirement": module.get("civiccore_requirement"),
                "proof_required": module.get("proof_required", []),
            }
        )
    verification_proof = [
        "health_checks",
        "restart",
        "backup",
        "restore",
        "actionable_failure_copy",
    ]
    if _uses_suite_launcher(profile_id, ordered_ids):
        verification_proof.extend(
            [
                "suite_launcher_files",
                "suite_launcher_port_config",
                "shared_staff_session_check",
            ]
        )
    if _uses_suite_launcher(profile_id, ordered_ids):
        actions.append(
            {
                "type": "configure_runtime",
                **_suite_launcher_config(),
            }
        )
    actions.append(
        {
            "type": "verify_profile",
            "profile": profile_id,
            "proof": verification_proof,
        }
    )

    return {
        "dry_run": True,
        "mutates_host": False,
        "profile": profile_id,
        "profile_label": profile.get("label"),
        "menu_style": menu_styles[menu_style],
        "host": host_info,
        "modules": ordered_ids,
        "actions": actions,
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Create a non-mutating Townlight installer plan."
    )
    parser.add_argument(
        "--profile", required=True, help="Profile id from installer/modules.json."
    )
    parser.add_argument(
        "--module",
        action="append",
        default=[],
        help="Module id for custom profile. May be passed more than once.",
    )
    parser.add_argument("--manifest", default=str(MANIFEST))
    parser.add_argument(
        "--menu-style",
        default="guided",
        help="Menu style id from installer/modules.json.",
    )
    parser.add_argument(
        "--show-menu",
        action="store_true",
        help="Print the non-mutating profile/module selector model.",
    )
    parser.add_argument(
        "--show-readiness",
        action="store_true",
        help="Print the non-mutating readiness/error-state model.",
    )
    parser.add_argument(
        "--detect-host",
        action="store_true",
        help="Use read-only host dependency detection for readiness output.",
    )
    parser.add_argument(
        "--execute",
        action="store_true",
        help="Request install execution. This slice always returns a non-mutating gate result.",
    )
    parser.add_argument(
        "--show-executor-design",
        action="store_true",
        help="Print the future executor state machine without implementing host mutation.",
    )
    parser.add_argument(
        "--show-evidence-schema",
        action="store_true",
        help="Print the future installer evidence/report schema without writing reports.",
    )
    parser.add_argument(
        "--show-artifacts",
        action="store_true",
        help="Print non-mutating local artifact and version resolution for the selected profile.",
    )
    parser.add_argument(
        "--show-profile-config",
        action="store_true",
        help="Print non-mutating compose/profile configuration planning for the selected profile.",
    )
    parser.add_argument(
        "--show-health-checks",
        action="store_true",
        help="Print non-mutating health-check planning for the selected profile.",
    )
    parser.add_argument(
        "--show-preflight",
        action="store_true",
        help="Print non-mutating executor preflight status for the selected profile.",
    )
    parser.add_argument(
        "--generate-install-kit",
        action="store_true",
        help="Write the minimal Townlight Core install kit under installer/generated/minimal.",
    )
    parser.add_argument(
        "--generate-profile-package",
        action="store_true",
        help="Write cross-platform operator package files under installer/generated/packages.",
    )
    parser.add_argument(
        "--generate-release-artifacts",
        action="store_true",
        help="Write profile packages, native wrapper manifests, archives, and checksums.",
    )
    parser.add_argument(
        "--installer-version",
        default="0.1.0",
        help="Installer artifact version for --generate-release-artifacts.",
    )
    parser.add_argument(
        "--package-platform",
        default="all",
        choices=("all", "windows", "macos", "linux"),
        help="Platform to generate for --generate-profile-package.",
    )
    parser.add_argument(
        "--run-cleanroom-proof",
        action="store_true",
        help="Run the mutating cleanroom proof for the selected profile.",
    )
    parser.add_argument(
        "--run-cleanroom-gate",
        action="store_true",
        help="Run the mutating clerk-core cleanroom gate and print concise pass/fail output.",
    )
    parser.add_argument(
        "--write-report",
        action="store_true",
        help="Write a validated non-mutating installer evidence report for plan/readiness/approval output.",
    )
    parser.add_argument(
        "--run-id",
        default=None,
        help="Optional run id for --write-report. Defaults to a UTC timestamp plus random suffix.",
    )
    parser.add_argument(
        "--approval-token",
        default=None,
        help="Explicit approval token for future mutating execution gates.",
    )
    parser.add_argument(
        "--readiness-scenario",
        default="nominal",
        choices=sorted(READINESS_SCENARIOS),
        help="Synthetic dry-run readiness state to render.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Required; planner does not mutate host state.",
    )
    args = parser.parse_args()

    mutating_cleanroom_requested = args.run_cleanroom_proof or args.run_cleanroom_gate
    if args.dry_run and mutating_cleanroom_requested:
        print(
            "ERROR: --dry-run cannot be combined with the mutating cleanroom proof/gate. "
            "Rerun without --dry-run only when Docker cleanroom mutation is approved.",
            file=sys.stderr,
        )
        return 2
    if (
        not args.dry_run
        and not args.generate_install_kit
        and not args.generate_profile_package
        and not args.generate_release_artifacts
        and not mutating_cleanroom_requested
    ):
        print(
            "ERROR: --dry-run is required. This planner is non-mutating.",
            file=sys.stderr,
        )
        return 2

    try:
        manifest = load_manifest(Path(args.manifest))
        report_mode = "plan"
        if args.show_menu:
            plan = build_menu_model(manifest=manifest, menu_style=args.menu_style)
            report_mode = "menu"
        elif args.show_readiness:
            detected = detect_host_dependencies() if args.detect_host else None
            plan = build_readiness_model(
                manifest=manifest,
                profile_id=args.profile,
                selected_modules=[str(module) for module in args.module],
                menu_style=args.menu_style,
                scenario=args.readiness_scenario,
                detected=detected,
            )
            report_mode = "readiness"
        elif args.execute:
            plan = build_execution_gate(
                manifest=manifest,
                profile_id=args.profile,
                selected_modules=[str(module) for module in args.module],
                menu_style=args.menu_style,
                approval_token=args.approval_token,
            )
            report_mode = "approval"
        elif args.show_executor_design:
            plan = build_executor_design(
                manifest=manifest,
                profile_id=args.profile,
                selected_modules=[str(module) for module in args.module],
                menu_style=args.menu_style,
            )
            report_mode = "executor_design"
        elif args.show_evidence_schema:
            plan = build_evidence_schema(
                manifest=manifest,
                profile_id=args.profile,
                selected_modules=[str(module) for module in args.module],
                menu_style=args.menu_style,
            )
            report_mode = "evidence_schema"
        elif args.show_artifacts:
            plan = build_artifact_resolution(
                manifest=manifest,
                profile_id=args.profile,
                selected_modules=[str(module) for module in args.module],
                menu_style=args.menu_style,
            )
            report_mode = "artifacts"
        elif args.show_profile_config:
            plan = build_profile_config(
                manifest=manifest,
                profile_id=args.profile,
                selected_modules=[str(module) for module in args.module],
                menu_style=args.menu_style,
            )
            report_mode = "profile_config"
        elif args.show_health_checks:
            plan = build_health_check_plan(
                manifest=manifest,
                profile_id=args.profile,
                selected_modules=[str(module) for module in args.module],
                menu_style=args.menu_style,
            )
            report_mode = "health_checks"
        elif args.show_preflight:
            plan = build_executor_preflight(
                manifest=manifest,
                profile_id=args.profile,
                selected_modules=[str(module) for module in args.module],
                menu_style=args.menu_style,
                readiness_scenario=args.readiness_scenario,
            )
            report_mode = "preflight"
        elif args.generate_install_kit:
            if args.profile != "minimal":
                raise PlannerError(
                    "--generate-install-kit currently supports only --profile minimal."
                )
            plan = generate_minimal_install_kit(manifest=manifest)
            report_mode = "generate_install_kit"
        elif args.generate_profile_package:
            plan = generate_profile_package(
                manifest=manifest,
                profile_id=args.profile,
                selected_modules=[str(module) for module in args.module],
                menu_style=args.menu_style,
                platform_id=args.package_platform,
            )
            report_mode = "profile_package"
        elif args.generate_release_artifacts:
            plan = generate_release_artifacts(
                manifest=manifest,
                profile_id=args.profile,
                selected_modules=[str(module) for module in args.module],
                menu_style=args.menu_style,
                version=args.installer_version,
                platform_id=args.package_platform,
            )
            report_mode = "release_artifacts"
        elif args.run_cleanroom_proof:
            if args.profile != "clerk-core":
                raise PlannerError(
                    "--run-cleanroom-proof currently supports only --profile clerk-core."
                )
            plan = run_clerk_core_cleanroom_proof(run_id=args.run_id)
            report_mode = "cleanroom_proof"
        elif args.run_cleanroom_gate:
            if args.profile != "clerk-core":
                raise PlannerError(
                    "--run-cleanroom-gate currently supports only --profile clerk-core."
                )
            plan = run_clerk_core_cleanroom_gate(run_id=args.run_id)
            report_mode = "cleanroom_gate"
        else:
            plan = build_install_plan(
                manifest=manifest,
                profile_id=args.profile,
                selected_modules=[str(module) for module in args.module],
                menu_style=args.menu_style,
            )
            report_mode = "plan"
        if args.write_report:
            plan["evidence_report"] = write_report_for_plan(
                plan=plan,
                mode=report_mode,
                run_id=args.run_id,
            )
    except PlannerError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2

    print(json.dumps(plan, indent=2, sort_keys=True))
    if args.run_cleanroom_gate and plan.get("status") != "passed":
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
