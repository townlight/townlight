"""Verify the CivicSuite suite-installer design contract."""

from __future__ import annotations

import json
import os
import shutil
import sys
import argparse
import importlib.util
import subprocess
import tempfile
from pathlib import Path
from typing import Any, cast


ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "installer" / "modules.json"
CONTRACT = ROOT / "installer" / "README.md"
PLAN = ROOT / "docs" / "installer" / "suite-installer-plan.md"
STARTER_SET_CONTRACT = ROOT / "docs" / "installer" / "starter-set-release-contract.md"
OUTSIDE_TEST_GUIDE = ROOT / "docs" / "installer" / "starter-set-outside-test-guide.md"
PLANNER = ROOT / "scripts" / "plan-installer.py"
INSTALLER_LIFECYCLE_RUNNER = ROOT / "scripts" / "run-clerk-core-installer.py"
PACKAGE_CLEANROOM_RUNNER = ROOT / "scripts" / "run-installer-package-cleanroom.py"
CLEANROOM_RUNNER = ROOT / "scripts" / "run-minimal-cleanroom.py"
SERVICE_CLEANROOM_RUNNER = ROOT / "scripts" / "run-civicrecords-cleanroom.py"
MODULE_MANIFEST_CONTRACT_VERIFIER = (
    ROOT / "scripts" / "verify-module-manifest-contract.py"
)
WINDOWS_LAUNCHER = ROOT / "installer" / "windows" / "plan-installer.ps1"
MACOS_LAUNCHER = ROOT / "installer" / "macos" / "plan-installer.sh"
LINUX_LAUNCHER = ROOT / "installer" / "linux" / "plan-installer.sh"
INSTALLER_CLEANROOM_WORKFLOW = (
    ROOT / ".github" / "workflows" / "installer-cleanroom.yml"
)
GENERATED_MINIMAL = ROOT / "installer" / "generated" / "minimal"
GENERATED_PACKAGES = ROOT / "installer" / "generated" / "packages"
GENERATED_NATIVE = ROOT / "installer" / "generated" / "native"
DIST = ROOT / "installer" / "dist"
REPORTS = ROOT / "installer" / "reports"
GENERATED_ARTIFACT_ROOTS = (
    GENERATED_MINIMAL,
    GENERATED_PACKAGES,
    GENERATED_NATIVE,
    DIST,
    REPORTS,
)

REQUIRED_PROFILES = {
    "minimal",
    "clerk-core",
    "city-core",
    "land-use",
    "full-suite",
    "custom",
}
REQUIRED_MODULES = {
    "civiccore",
    "civicrecords-ai",
    "civicclerk",
    "civiccode",
    "civiczone",
    "civicaccess",
    "civicplan",
    "civicpermit",
    "civicinspect",
    "civicgrants",
    "civicprocure",
    "civiccontracts",
    "civicboards",
    "civicnotice",
    "civic311",
    "civiccomms",
    "civicdata",
    "civicregwatch",
    "civicapi",
    "civichr",
    "civicbudget",
    "civiclegal",
    "civicelections",
    "civicutility",
    "civiccourt",
    "civicsafety",
    "civiclibrary",
    "civicparks",
}
PLANNED_NON_SELECTABLE_MODULES = {"civicregwatch", "civicapi"}
REQUIRED_DOC_PHRASES = (
    "zero-baseline machine",
    "CivicCore",
    "module selector",
    "menu style",
    "readiness",
    "fix steps",
    "execution gate",
    "dependency detection",
    "executor state machine",
    "evidence schema",
    "report writer",
    "artifact/version resolver",
    "profile config",
    "health-check plan",
    "executor preflight",
    "install kit",
    "profile package",
    "release artifacts",
    "unsigned OSS beta",
    "cleanroom",
    "cleanroom gate",
    "Playwright",
    "Windows",
    "macOS",
    "Linux",
    "design contract, not implementation",
)
ALLOWED_EVIDENCE_CLASSIFICATIONS = {
    "archive_readiness_only",
    "matching_host_lifecycle",
    "matching_host_lifecycle_failed",
    "dependency_gate_blocked",
    "host_platform_mismatch",
    "unsupported_lifecycle",
}


def fail(message: str) -> str:
    return f"FAIL: {message}"


def snapshot_generated_artifacts() -> tuple[set[Path], set[Path]]:
    files: set[Path] = set()
    directories: set[Path] = set()
    for root in GENERATED_ARTIFACT_ROOTS:
        if not root.exists():
            continue
        directories.add(root.relative_to(ROOT))
        for path in root.rglob("*"):
            relative = path.relative_to(ROOT)
            if path.is_dir():
                directories.add(relative)
            else:
                files.add(relative)
    return files, directories


def cleanup_generated_artifact_noise(
    before_files: set[Path], before_directories: set[Path]
) -> None:
    for root in GENERATED_ARTIFACT_ROOTS:
        if not root.exists():
            continue
        for path in sorted(
            root.rglob("*"), key=lambda item: len(item.parts), reverse=True
        ):
            relative = path.relative_to(ROOT)
            if path.is_file() and relative not in before_files:
                path.unlink()
            elif (
                path.is_dir()
                and relative not in before_directories
                and not any(path.iterdir())
            ):
                path.rmdir()


def load_manifest() -> dict[str, object]:
    with MANIFEST.open(encoding="utf-8") as handle:
        data = json.load(handle)
    if not isinstance(data, dict):
        raise AssertionError("manifest root must be a JSON object")
    return data


def has_local_civiccore_wheel() -> bool:
    if os.environ.get("CIVICSUITE_VERIFY_NO_LOCAL_CIVICCORE") == "1":
        return False
    dist = ROOT.parent / "civiccore" / "dist"
    return dist.is_dir() and any(dist.glob("civiccore-*.whl"))


def check_docs() -> list[str]:
    errors: list[str] = []
    for path in (CONTRACT, PLAN):
        if not path.is_file():
            errors.append(fail(f"missing {path.relative_to(ROOT)}"))
            continue
        text = path.read_text(encoding="utf-8")
        for phrase in REQUIRED_DOC_PHRASES:
            if phrase not in text:
                errors.append(
                    fail(f"{path.relative_to(ROOT)} missing phrase: {phrase}")
                )
    if not STARTER_SET_CONTRACT.is_file():
        errors.append(fail(f"missing {STARTER_SET_CONTRACT.relative_to(ROOT)}"))
    else:
        contract = STARTER_SET_CONTRACT.read_text(encoding="utf-8")
        for phrase in (
            "CivicCore installs first",
            "CivicSunshine and CivicMeetings are selectable",
            "Windows and Linux package lifecycle proof are required",
            "macOS archives and wrapper manifests are generated and supported at beta",
            "before any macOS lifecycle certification claim",
            "CivicSunshine reports v1.7.3",
            "CivicMeetings reports v1.0.4 with CivicCore v1.2.0",
            "install --staff-mode bearer --workflow-proof",
            "first-admin JWT auth",
            "bearer-protected staff auth",
            "exercise the search surface",
            "submit the request for review",
            "motion/vote capture",
            "automatic-minutes-posting",
            "Reports must not persist the CivicSunshine admin password or bearer token",
            "Package Cleanroom Contract",
            "run-installer-package-cleanroom.py --archive installer\\dist\\CivicSuite-clerk-core-windows-0.1.0.zip --platform windows --staff-mode bearer --workflow-proof",
            "workflow_proof_requested=true",
            "civicclerk_staff_mode=bearer",
            "Windows package workflow proof has been run on a Windows 11 host with",
            "not yet a claim that CivicSunshine and CivicMeetings exchange workflow records",
        ):
            if phrase not in contract:
                errors.append(
                    fail(
                        f"{STARTER_SET_CONTRACT.relative_to(ROOT)} missing phrase: {phrase}"
                    )
                )
    if not OUTSIDE_TEST_GUIDE.is_file():
        errors.append(fail(f"missing {OUTSIDE_TEST_GUIDE.relative_to(ROOT)}"))
    else:
        guide = OUTSIDE_TEST_GUIDE.read_text(encoding="utf-8")
        for phrase in (
            "outside-party test path",
            "Linux",
            "Windows 10/11",
            "macOS archives are built",
            "SmartScreen or Unknown Publisher warnings are normal",
            "SHA256 checksum matches",
            "official CivicSuite release source",
            "Install",
            "Verify",
            "Repair",
            "Uninstall",
            "CivicSunshine API health returns `status=ok` and `version=1.7.3`",
            "CivicMeetings API health returns `status=ok`, `version=1.0.4`, and",
            "anonymous staff writes are",
            "submits review",
            "staff-reviewable response",
            "packet finalization",
            "public archive calendar/search visibility",
            "run-installer-package-cleanroom.py --archive installer\\dist\\CivicSuite-clerk-core-windows-0.1.0.zip --platform windows --staff-mode bearer --workflow-proof",
            "workflow_proof_requested=true",
            "civicclerk_staff_mode=bearer",
            "evidence_classification=matching_host_lifecycle",
            "does not claim live workflow-record exchange",
            "not a municipal procurement-ready",
        ):
            if phrase not in guide:
                errors.append(
                    fail(
                        f"{OUTSIDE_TEST_GUIDE.relative_to(ROOT)} missing phrase: {phrase}"
                    )
                )
    contract_text = CONTRACT.read_text(encoding="utf-8") if CONTRACT.is_file() else ""
    if (
        "certificates are available" in contract_text
        or "should go away once project signing" in contract_text
    ):
        errors.append(
            fail(
                "installer README must not imply future signing is the public beta trust path"
            )
        )
    return errors


def check_clerk_core_staff_mode_contract() -> list[str]:
    errors: list[str] = []
    if not INSTALLER_LIFECYCLE_RUNNER.is_file():
        return [fail(f"missing {INSTALLER_LIFECYCLE_RUNNER.relative_to(ROOT)}")]
    spec = importlib.util.spec_from_file_location(
        "run_clerk_core_installer", INSTALLER_LIFECYCLE_RUNNER
    )
    if spec is None or spec.loader is None:
        return [fail("could not load clerk-core installer lifecycle runner")]
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    proof_root = ROOT / "installer" / "reports" / "verify-clerk-auth-default"
    proof_root.mkdir(parents=True, exist_ok=True)
    default_env = proof_root / "default.env"
    open_env = proof_root / "open.env"
    bearer_env = proof_root / "bearer.env"
    for path in (default_env, open_env, bearer_env):
        if path.exists():
            path.unlink()
    module.write_clerk_env(default_env)
    module.write_clerk_env(open_env, staff_mode=module.CLERK_STAFF_MODE_OPEN)
    module.write_clerk_env(bearer_env, staff_mode=module.CLERK_STAFF_MODE_BEARER)
    default_text = default_env.read_text(encoding="utf-8")
    open_text = open_env.read_text(encoding="utf-8")
    bearer_text = bearer_env.read_text(encoding="utf-8")

    if "CIVICCLERK_STAFF_AUTH_MODE=protected" not in default_text:
        errors.append(fail("clerk-core installer default staff mode must be protected"))
    if "CIVICCLERK_STAFF_AUTH_MODE=open" not in open_text:
        errors.append(
            fail("clerk-core installer open mode must remain explicit opt-in")
        )
    if "CIVICCLERK_STAFF_AUTH_MODE=bearer" not in bearer_text:
        errors.append(
            fail(
                "clerk-core installer bearer mode must be available for workflow proof"
            )
        )
    if "CIVICCLERK_STAFF_AUTH_TOKEN_ROLES=" not in bearer_text:
        errors.append(
            fail("clerk-core installer bearer mode must configure proof token roles")
        )

    runner_text = INSTALLER_LIFECYCLE_RUNNER.read_text(encoding="utf-8")
    for phrase in (
        "--staff-mode",
        "--workflow-proof",
        "--port-offset",
        "--records-api-port",
        "--compose-project-suffix",
        "CIVICSUITE_INSTALLER_RUN_ID",
        "CIVICSUITE_INSTALLER_INSTALL_ROOT",
        "compose_projects",
        "verify_civiccore_contract",
        "verify_starter_set_workflow_contract",
        "civicrecords_workflow",
        "civicclerk_bearer_workflow",
        "search_records",
        "submit_request_review",
        "draft_response_letter",
        "create_packet_assembly",
        "create_minutes_draft",
        "public_archive_search",
        "starter_set_civiccore_contract",
        "EXPECTED_CIVICCORE_VERSION = \"1.2.0\"",
        "EXPECTED_RECORDS_VERSION = \"1.7.3\"",
        "EXPECTED_CLERK_VERSION = \"1.0.4\"",
        "allows anonymous writes to civicclerk endpoints",
        "Use ONLY for local rehearsal",
        "Re-run with --staff-mode protected",
    ):
        if phrase not in runner_text:
            errors.append(
                fail(
                    f"clerk-core installer staff-mode warning missing phrase: {phrase}"
                )
            )
    with tempfile.TemporaryDirectory() as temp_dir:
        compose_file = Path(temp_dir) / "docker-compose.yml"
        compose_file.write_text(
            "services:\n"
            "  api:\n"
            "    ports:\n"
            '      - "8000:8000"\n'
            "  frontend:\n"
            "    ports:\n"
            '      - "8080:80"\n',
            encoding="utf-8",
        )
        module.normalize_records_compose_ports(
            Path(temp_dir), {"api": 18123, "web": 18124}
        )
        normalized = compose_file.read_text(encoding="utf-8")
        if '"8000:8000"' in normalized or '"8080:80"' in normalized:
            errors.append(
                fail(
                    "clerk-core installer must replace CivicSunshine default host ports"
                )
            )
        if '"18123:8000"' not in normalized or '"18124:80"' not in normalized:
            errors.append(
                fail(
                    "clerk-core installer must normalize CivicSunshine ports to resolved installer ports"
                )
            )
        env_file = Path(temp_dir) / ".env"
        module.write_records_env(env_file, {"api": 18123, "web": 18124})
        env_text = env_file.read_text(encoding="utf-8")
        if (
            "CIVICRECORDS_API_PORT=18123" not in env_text
            or "CIVICRECORDS_WEB_PORT=18124" not in env_text
        ):
            errors.append(
                fail(
                    "clerk-core installer must write CivicSunshine resolved host ports into .env"
                )
            )
        if "PORTAL_MODE=private" not in env_text:
            errors.append(
                fail(
                    "clerk-core installer must keep CivicSunshine private mode as the default for smaller profiles"
                )
            )
        module.write_records_env(env_file, {"api": 18125, "web": 18126})
        updated_env_text = env_file.read_text(encoding="utf-8")
        if (
            "CIVICRECORDS_API_PORT=18125" not in updated_env_text
            or "CIVICRECORDS_WEB_PORT=18126" not in updated_env_text
        ):
            errors.append(
                fail(
                    "clerk-core installer must refresh CivicSunshine host ports in existing .env files"
                )
            )
        module.write_records_env(env_file, {"api": 18127, "web": 18128}, portal_mode="public")
        public_env_text = env_file.read_text(encoding="utf-8")
        if "PORTAL_MODE=public" not in public_env_text:
            errors.append(
                fail(
                    "city-core installer must be able to write CivicSunshine public portal mode"
                )
            )
        if module.records_portal_mode_for_modules(["civicrecords-ai", "civicclerk"]) != "private":
            errors.append(fail("clerk-core selected modules must resolve CivicSunshine private portal mode"))
        if (
            module.records_portal_mode_for_modules(["civicrecords-ai", "civicclerk", "civiccode"])
            != "public"
        ):
            errors.append(fail("city-core selected modules must resolve CivicSunshine public portal mode"))
    isolation = module.resolve_isolation(run_id="verify-isolation-run", port_offset=37)
    ports = isolation.get("ports", {})
    projects = isolation.get("compose_projects", {})
    if (
        not isinstance(ports, dict)
        or ports.get("civicrecords-ai", {}).get("api") != 18037
    ):
        errors.append(
            fail(
                "clerk-core installer must derive CivicSunshine API port from the run isolation model"
            )
        )
    if not isinstance(projects, dict) or projects.get(
        "civicrecords-ai"
    ) == projects.get("civicclerk"):
        errors.append(
            fail(
                "clerk-core installer must resolve distinct compose project names per module"
            )
        )
    if (
        "civicsuite-clerk-core-records" in runner_text
        or "civicsuite-clerk-core-clerk" in runner_text
    ):
        errors.append(
            fail(
                "clerk-core installer must not hard-code the legacy compose project names"
            )
        )
    return errors


def check_cleanroom_workflow(data: dict[str, object]) -> list[str]:
    errors: list[str] = []
    if not INSTALLER_CLEANROOM_WORKFLOW.is_file():
        return [fail(f"missing {INSTALLER_CLEANROOM_WORKFLOW.relative_to(ROOT)}")]
    text = INSTALLER_CLEANROOM_WORKFLOW.read_text(encoding="utf-8")
    required_phrases = [
        "workflow_dispatch",
        "pull_request:",
        "concurrency:",
        "run-installer-package-cleanroom.py",
        "--skip-install",
        "ci-linux-package-lifecycle",
        "actions/upload-artifact@v4",
        "retention-days:",
        "--profile \"${{ matrix.profile }}\"",
        "CivicSuite-city-core-linux-0.1.2.tar.gz",
        "--staff-mode bearer --workflow-proof",
        "workflow proof",
    ]
    cleanroom_module_ids = (
        "civicrecords-ai",
        "civicclerk",
        "civiccode",
        "civicnotice",
        "civicaccess",
    )
    modules = data.get("modules", [])
    module_by_id = {
        str(module.get("id")): module
        for module in modules
        if isinstance(module, dict)
    }
    for module_id in cleanroom_module_ids:
        module = module_by_id.get(module_id, {})
        required_phrases.extend(
            (
                f"repository: {module.get('repo')}",
                f"ref: {module.get('source_commit')}",
                f"path: modules/{module_id}",
            )
        )
    for phrase in required_phrases:
        if phrase not in text:
            errors.append(
                fail(f"installer cleanroom workflow missing phrase: {phrase}")
            )
    if "schedule:" in text:
        errors.append(
            fail(
                "installer cleanroom workflow must not include a daily cron without explicit approval"
            )
        )
    for platform in ("windows", "macos", "linux"):
        if f"platform: {platform}" not in text:
            errors.append(
                fail(
                    f"installer cleanroom workflow missing {platform} readiness/plan job"
                )
            )
    return errors


def check_package_cleanroom_evidence_contract(
    *, require_reports: bool = False
) -> list[str]:
    errors: list[str] = []
    if not PACKAGE_CLEANROOM_RUNNER.is_file():
        return [fail(f"missing {PACKAGE_CLEANROOM_RUNNER.relative_to(ROOT)}")]
    runner_text = PACKAGE_CLEANROOM_RUNNER.read_text(encoding="utf-8")
    for phrase in (
        "evidence_classification",
        "archive_readiness_only",
        "matching_host_lifecycle",
        "dependency_gate_blocked",
        "unsupported_lifecycle",
        "darwin",
        "CIVICSUITE_INSTALLER_RUN_ID",
        "--workflow-proof",
        "workflow_proof_requested",
        "civicclerk_staff_mode",
        "cleanup_error",
        "extracted_bundle_retained",
    ):
        if phrase not in runner_text:
            errors.append(
                fail(
                    f"package cleanroom runner missing evidence guard phrase: {phrase}"
                )
            )
    report_paths = sorted(REPORTS.glob("*/installer-package-cleanroom.json"))
    if not report_paths:
        if require_reports:
            errors.append(
                fail(
                    "package cleanroom evidence must include at least one installer-package-cleanroom.json report"
                )
            )
        return errors
    required_fields = {
        "platform",
        "host_platform",
        "mutates_host",
        "status",
        "evidence_classification",
        "host_platform_matches_target",
        "requested_mutating_lifecycle",
        "certification_scope",
        "lifecycle_isolation",
    }
    lifecycle_modes = {"install", "repair", "verify", "backup", "restore", "uninstall"}
    for report_path in report_paths:
        report = json.loads(report_path.read_text(encoding="utf-8"))
        missing = sorted(required_fields - set(report))
        if missing:
            errors.append(
                fail(
                    f"{report_path.relative_to(ROOT)} missing fields: {', '.join(missing)}"
                )
            )
            continue
        classification = str(report.get("evidence_classification"))
        if classification not in ALLOWED_EVIDENCE_CLASSIFICATIONS:
            errors.append(
                fail(
                    f"{report_path.relative_to(ROOT)} has unknown evidence_classification {classification}"
                )
            )
        platform = str(report.get("platform"))
        host = str(
            report.get("normalized_host_platform") or report.get("host_platform")
        )
        if (
            platform == "macos"
            and host != "macos"
            and classification == "matching_host_lifecycle"
        ):
            errors.append(
                fail(
                    f"{report_path.relative_to(ROOT)} must not certify macOS lifecycle from non-Darwin host"
                )
            )
        if (
            classification == "archive_readiness_only"
            and report.get("mutates_host") is not False
        ):
            errors.append(
                fail(
                    f"{report_path.relative_to(ROOT)} archive/readiness evidence must be non-mutating"
                )
            )
        if classification == "matching_host_lifecycle":
            modes = {
                str(step.get("mode"))
                for step in report.get("steps", [])
                if isinstance(step, dict)
            }
            isolation = report.get("lifecycle_isolation", {})
            resolved_modes = (
                isolation.get("resolved_modes", [])
                if isinstance(isolation, dict)
                else []
            )
            if (
                report.get("status") != "passed"
                or report.get("mutates_host") is not True
            ):
                errors.append(
                    fail(
                        f"{report_path.relative_to(ROOT)} matching-host lifecycle must pass and mutate host"
                    )
                )
            if not lifecycle_modes.issubset(modes):
                errors.append(
                    fail(
                        f"{report_path.relative_to(ROOT)} matching-host lifecycle missing lifecycle modes"
                    )
                )
            if report.get("host_platform_matches_target") is not True:
                errors.append(
                    fail(
                        f"{report_path.relative_to(ROOT)} matching-host lifecycle must record host/platform match"
                    )
                )
            if not isinstance(resolved_modes, list) or not any(
                isinstance(item, dict)
                and item.get("ports")
                and item.get("compose_projects")
                for item in resolved_modes
            ):
                errors.append(
                    fail(
                        f"{report_path.relative_to(ROOT)} matching-host lifecycle must record resolved isolation values"
                    )
                )
    return errors


def check_public_claims_bounded() -> list[str]:
    errors: list[str] = []
    docs = [
        ROOT / "README.md",
        ROOT / "STATUS.md",
        ROOT / "FAQ.md",
        ROOT / "USER-MANUAL.md",
        CONTRACT,
        PLAN,
    ]
    forbidden_phrases = (
        "Windows and Linux lifecycle proof passed",
        "macOS lifecycle certification passed",
        "procurement ready",
        "signed native installers",
        "Suite 1.0",
    )
    for path in docs:
        if not path.is_file():
            errors.append(
                fail(f"missing public claim surface {path.relative_to(ROOT)}")
            )
            continue
        text = path.read_text(encoding="utf-8")
        for phrase in forbidden_phrases:
            if phrase in text:
                errors.append(
                    fail(
                        f"{path.relative_to(ROOT)} contains overbroad claim phrase: {phrase}"
                    )
                )
    return errors


def check_manifest(data: dict[str, object]) -> list[str]:
    errors: list[str] = []
    if data.get("schema_version") != 1:
        errors.append(fail("schema_version must be 1"))
    if data.get("installer_status") not in {
        "clerk_core_public_use_starter_v0_1_0_published",
        "city_core_beta_ready_truth_reconciled",
        "city_core_implemented_pending_ci_and_audit_full",
        "city_core_implemented_pending_browser_qa_and_audit_full",
        "city_core_implemented_pending_audit_full",
        "townlight_records_beta_candidate",
        "townlight_records_meetings_beta_candidate",
        "townlight_records_meetings_code_beta_candidate",
    }:
        errors.append(
            fail(
                "installer_status must describe an accepted published, implementation, or Townlight Records–Meetings beta candidate state"
            )
        )

    menu_styles = data.get("menu_styles")
    profiles = data.get("profiles")
    modules = data.get("modules")
    if not isinstance(menu_styles, list):
        return errors + [fail("menu_styles must be a list")]
    if not isinstance(profiles, list):
        return errors + [fail("profiles must be a list")]
    if not isinstance(modules, list):
        return errors + [fail("modules must be a list")]

    style_ids = {
        str(style.get("id")) for style in menu_styles if isinstance(style, dict)
    }
    required_styles = {"guided", "department", "advanced"}
    missing_styles = required_styles - style_ids
    if missing_styles:
        errors.append(fail(f"missing menu styles: {', '.join(sorted(missing_styles))}"))

    profile_ids = {
        str(profile.get("id")) for profile in profiles if isinstance(profile, dict)
    }
    missing_profiles = REQUIRED_PROFILES - profile_ids
    if missing_profiles:
        errors.append(fail(f"missing profiles: {', '.join(sorted(missing_profiles))}"))

    module_by_id = {
        str(module.get("id")): module
        for module in modules
        if isinstance(module, dict) and module.get("id")
    }
    missing_modules = REQUIRED_MODULES - set(module_by_id)
    if missing_modules:
        errors.append(fail(f"missing modules: {', '.join(sorted(missing_modules))}"))
    extra_modules = set(module_by_id) - REQUIRED_MODULES
    if extra_modules:
        errors.append(fail(f"unexpected modules: {', '.join(sorted(extra_modules))}"))
    if len(module_by_id) != len(modules):
        errors.append(
            fail("module ids must be unique and every module must have an id")
        )

    civiccore = module_by_id.get("civiccore", {})
    if isinstance(civiccore, dict):
        if civiccore.get("selectable") is not False:
            errors.append(fail("civiccore must not be directly selectable"))
        if civiccore.get("required") is not True:
            errors.append(fail("civiccore must be required"))

    for module_id, module in module_by_id.items():
        if not isinstance(module, dict):
            continue
        dependencies = module.get("dependencies", [])
        if not isinstance(dependencies, list):
            errors.append(fail(f"{module_id} dependencies must be a list"))
            continue
        for dependency in dependencies:
            if dependency not in module_by_id:
                errors.append(
                    fail(f"{module_id} depends on unknown module {dependency}")
                )
        proof = module.get("proof_required", [])
        if not isinstance(proof, list) or not proof:
            errors.append(fail(f"{module_id} must define proof_required"))

    for profile in profiles:
        if not isinstance(profile, dict):
            errors.append(fail("profile entry must be an object"))
            continue
        profile_modules = profile.get("modules", [])
        if not isinstance(profile_modules, list):
            errors.append(fail(f"profile {profile.get('id')} modules must be a list"))
            continue
        if profile.get("id") != "custom" and "civiccore" not in profile_modules:
            errors.append(fail(f"profile {profile.get('id')} must include civiccore"))
        for module_id in profile_modules:
            if module_id not in module_by_id:
                errors.append(
                    fail(
                        f"profile {profile.get('id')} references unknown module {module_id}"
                    )
                )

    return errors


def check_module_manifest_contract() -> list[str]:
    if not MODULE_MANIFEST_CONTRACT_VERIFIER.is_file():
        return [fail(f"missing {MODULE_MANIFEST_CONTRACT_VERIFIER.relative_to(ROOT)}")]
    result = subprocess.run(
        [sys.executable, str(MODULE_MANIFEST_CONTRACT_VERIFIER)],
        cwd=ROOT,
        text=True,
        capture_output=True,
    )
    if result.returncode == 0:
        return []
    detail = (result.stdout + result.stderr).strip()
    return [fail(detail or "module manifest contract verification failed")]


def check_planner(data: dict[str, object]) -> list[str]:
    errors: list[str] = []
    modules = data.get("modules", [])
    module_by_id = {
        str(module.get("id")): module
        for module in modules
        if isinstance(module, dict)
    }
    if not PLANNER.is_file():
        return [fail(f"missing {PLANNER.relative_to(ROOT)}")]
    if not CLEANROOM_RUNNER.is_file():
        errors.append(fail(f"missing {CLEANROOM_RUNNER.relative_to(ROOT)}"))
    if not SERVICE_CLEANROOM_RUNNER.is_file():
        errors.append(fail(f"missing {SERVICE_CLEANROOM_RUNNER.relative_to(ROOT)}"))

    spec = importlib.util.spec_from_file_location("plan_installer", PLANNER)
    if spec is None or spec.loader is None:
        return [fail("could not load planner module")]
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    scenarios = {
        "minimal": ["civiccore"],
        "clerk-core": ["civiccore", "civicrecords-ai", "civicclerk"],
        "city-core": [
            "civiccore",
            "civicrecords-ai",
            "civicclerk",
            "civiccode",
            "civicnotice",
            "civicaccess",
        ],
    }
    for profile, expected_modules in scenarios.items():
        plan = module.build_install_plan(
            manifest=data,
            profile_id=profile,
            menu_style="guided",
            host={"system": "Windows", "release": "test", "machine": "x86_64"},
        )
        if plan.get("mutates_host") is not False:
            errors.append(fail(f"{profile} plan must be non-mutating"))
        if plan.get("dry_run") is not True:
            errors.append(fail(f"{profile} plan must be marked dry_run"))
        if plan.get("modules") != expected_modules:
            errors.append(
                fail(
                    f"{profile} module order {plan.get('modules')} != {expected_modules}"
                )
            )
        action_types = [
            action.get("type")
            for action in plan.get("actions", [])
            if isinstance(action, dict)
        ]
        if "check" not in action_types:
            errors.append(fail(f"{profile} plan missing baseline checks"))
        if "install_module" not in action_types:
            errors.append(fail(f"{profile} plan missing install_module actions"))
        if action_types[-1:] != ["verify_profile"]:
            errors.append(fail(f"{profile} plan must end with verify_profile"))
        if plan.get("menu_style", {}).get("id") != "guided":
            errors.append(fail(f"{profile} plan missing guided menu style"))
        if profile == "clerk-core":
            verify_actions = [
                action
                for action in plan.get("actions", [])
                if isinstance(action, dict) and action.get("type") == "verify_profile"
            ]
            verify_proof = verify_actions[0].get("proof", []) if verify_actions else []
            for proof in (
                "health_checks",
                "restart",
                "backup",
                "restore",
                "actionable_failure_copy",
            ):
                if proof not in verify_proof:
                    errors.append(
                        fail(f"clerk-core verify_profile missing proof {proof}")
                    )
            for module_id in ("civicrecords-ai", "civicclerk"):
                install_actions = [
                    action
                    for action in plan.get("actions", [])
                    if isinstance(action, dict) and action.get("module") == module_id
                ]
                proof_required = (
                    install_actions[0].get("proof_required", [])
                    if install_actions
                    else []
                )
                for proof in (
                    "install",
                    "health_check",
                    "restart",
                    "repair",
                    "backup",
                    "restore",
                ):
                    if proof not in proof_required:
                        errors.append(
                            fail(
                                f"{module_id} install action missing proof requirement {proof}"
                            )
                        )

    profiles_list = cast(list[dict[str, Any]], data.get("profiles", []))
    full_suite_profile = next(
        (
            profile
            for profile in profiles_list
            if isinstance(profile, dict) and profile.get("id") == "full-suite"
        ),
        {},
    )
    if full_suite_profile.get("disabled") is not True:
        errors.append(fail("full-suite profile must be disabled until coherent suite proof"))
    try:
        module.build_install_plan(
            manifest=data,
            profile_id="full-suite",
            menu_style="guided",
            host={"system": "Windows", "release": "test", "machine": "x86_64"},
        )
    except Exception as exc:
        if "Profile full-suite is disabled" not in str(exc):
            errors.append(fail(f"full-suite disabled profile failed with wrong error: {exc}"))
    else:
        errors.append(fail("full-suite profile should be blocked while disabled"))

    land_use_profile = next(
        (
            profile
            for profile in profiles_list
            if isinstance(profile, dict) and profile.get("id") == "land-use"
        ),
        {},
    )
    if land_use_profile.get("disabled") is not True:
        errors.append(fail("land-use profile must be disabled until Tier 2 work"))
    try:
        module.build_install_plan(
            manifest=data,
            profile_id="land-use",
            menu_style="guided",
            host={"system": "Windows", "release": "test", "machine": "x86_64"},
        )
    except Exception as exc:
        if "Profile land-use is disabled" not in str(exc):
            errors.append(fail(f"land-use disabled profile failed with wrong error: {exc}"))
    else:
        errors.append(fail("land-use profile should be blocked while disabled"))

    menu_model = module.build_menu_model(manifest=data, menu_style="department")
    if menu_model.get("mutates_host") is not False:
        errors.append(fail("menu model must be non-mutating"))
    if menu_model.get("menu_style", {}).get("id") != "department":
        errors.append(fail("menu model must preserve selected menu style"))
    profile_ids = {
        profile.get("id")
        for profile in menu_model.get("profile_choices", [])
        if isinstance(profile, dict)
    }
    if not REQUIRED_PROFILES.issubset(profile_ids):
        errors.append(fail("menu model must expose all required profiles"))
    selector = menu_model.get("module_selector", {})
    selectable = (
        selector.get("selectable_modules", []) if isinstance(selector, dict) else []
    )
    expected_selectable_count = len(
        REQUIRED_MODULES - {"civiccore"} - PLANNED_NON_SELECTABLE_MODULES
    )
    if not isinstance(selectable, list) or len(selectable) != expected_selectable_count:
        errors.append(
            fail("menu model must expose every selectable non-CivicCore module")
        )
    civicinspect_selector = [
        item
        for item in selectable
        if isinstance(item, dict) and item.get("id") == "civicinspect"
    ]
    if not civicinspect_selector:
        errors.append(
            fail("menu model must expose CivicInspect as a selectable module")
        )
    elif civicinspect_selector[0].get("civiccore_requirement") != "1.1.0":
        errors.append(fail("CivicInspect selector must require CivicCore 1.1.0"))

    civicinspect_plan = module.build_install_plan(
        manifest=data,
        profile_id="custom",
        selected_modules=["civicinspect"],
        menu_style="guided",
        host={"system": "Windows", "release": "test", "machine": "x86_64"},
    )
    if "civicinspect" not in civicinspect_plan.get("modules", []):
        errors.append(fail("custom CivicInspect plan must include civicinspect"))
    for required_dependency in ("civiccore", "civiccode", "civicpermit"):
        if required_dependency not in civicinspect_plan.get("modules", []):
            errors.append(
                fail(
                    f"custom CivicInspect plan missing dependency {required_dependency}"
                )
            )
    civicinspect_actions = [
        action
        for action in civicinspect_plan.get("actions", [])
        if isinstance(action, dict) and action.get("module") == "civicinspect"
    ]
    if not civicinspect_actions:
        errors.append(
            fail("custom CivicInspect plan must include a CivicInspect install action")
        )
    else:
        action = civicinspect_actions[0]
        if action.get("civiccore_requirement") != "1.1.0":
            errors.append(
                fail("CivicInspect install action must require CivicCore 1.1.0")
            )
        proof_required = action.get("proof_required", [])
        for proof in (
            "module_selection",
            "install_plan",
            "artifact_resolution",
            "health_check",
            "restart",
        ):
            if proof not in proof_required:
                errors.append(
                    fail(
                        f"CivicInspect install action missing proof requirement {proof}"
                    )
                )

    civicgrants_selector = [
        item
        for item in selectable
        if isinstance(item, dict) and item.get("id") == "civicgrants"
    ]
    if not civicgrants_selector:
        errors.append(fail("menu model must expose CivicGrants as a selectable module"))
    elif civicgrants_selector[0].get("civiccore_requirement") != "1.1.0":
        errors.append(fail("CivicGrants selector must require CivicCore 1.1.0"))

    civicgrants_plan = module.build_install_plan(
        manifest=data,
        profile_id="custom",
        selected_modules=["civicgrants"],
        menu_style="guided",
        host={"system": "Windows", "release": "test", "machine": "x86_64"},
    )
    if "civicgrants" not in civicgrants_plan.get("modules", []):
        errors.append(fail("custom CivicGrants plan must include civicgrants"))
    for required_dependency in ("civiccore", "civicrecords-ai"):
        if required_dependency not in civicgrants_plan.get("modules", []):
            errors.append(
                fail(
                    f"custom CivicGrants plan missing dependency {required_dependency}"
                )
            )
    civicgrants_actions = [
        action
        for action in civicgrants_plan.get("actions", [])
        if isinstance(action, dict) and action.get("module") == "civicgrants"
    ]
    if not civicgrants_actions:
        errors.append(
            fail("custom CivicGrants plan must include a CivicGrants install action")
        )
    else:
        action = civicgrants_actions[0]
        if action.get("civiccore_requirement") != "1.1.0":
            errors.append(
                fail("CivicGrants install action must require CivicCore 1.1.0")
            )
        proof_required = action.get("proof_required", [])
        for proof in (
            "module_selection",
            "install_plan",
            "artifact_resolution",
            "health_check",
            "restart",
        ):
            if proof not in proof_required:
                errors.append(
                    fail(
                        f"CivicGrants install action missing proof requirement {proof}"
                    )
                )

    civicprocure_selector = [
        item
        for item in selectable
        if isinstance(item, dict) and item.get("id") == "civicprocure"
    ]
    if not civicprocure_selector:
        errors.append(
            fail("menu model must expose CivicProcure as a selectable module")
        )
    elif civicprocure_selector[0].get("civiccore_requirement") != "1.1.0":
        errors.append(fail("CivicProcure selector must require CivicCore 1.1.0"))

    civicprocure_plan = module.build_install_plan(
        manifest=data,
        profile_id="custom",
        selected_modules=["civicprocure"],
        menu_style="guided",
        host={"system": "Windows", "release": "test", "machine": "x86_64"},
    )
    if "civicprocure" not in civicprocure_plan.get("modules", []):
        errors.append(fail("custom CivicProcure plan must include civicprocure"))
    for required_dependency in ("civiccore",):
        if required_dependency not in civicprocure_plan.get("modules", []):
            errors.append(
                fail(
                    f"custom CivicProcure plan missing dependency {required_dependency}"
                )
            )
    civicprocure_actions = [
        action
        for action in civicprocure_plan.get("actions", [])
        if isinstance(action, dict) and action.get("module") == "civicprocure"
    ]
    if not civicprocure_actions:
        errors.append(
            fail("custom CivicProcure plan must include a CivicProcure install action")
        )
    else:
        action = civicprocure_actions[0]
        if action.get("civiccore_requirement") != "1.1.0":
            errors.append(
                fail("CivicProcure install action must require CivicCore 1.1.0")
            )
        proof_required = action.get("proof_required", [])
        for proof in (
            "module_selection",
            "install_plan",
            "artifact_resolution",
            "health_check",
            "restart",
        ):
            if proof not in proof_required:
                errors.append(
                    fail(
                        f"CivicProcure install action missing proof requirement {proof}"
                    )
                )

    readiness_scenarios = {
        "nominal": "ready",
        "missing-docker": "blocked",
        "windows-missing-wsl": "blocked",
        "low-resources": "blocked",
        "ollama-missing": "warning",
        "civiccore-mismatch": "blocked",
    }
    for scenario, expected_status in readiness_scenarios.items():
        readiness = module.build_readiness_model(
            manifest=data,
            profile_id="clerk-core",
            menu_style="guided",
            host={"system": "Windows", "release": "test", "machine": "x86_64"},
            scenario=scenario,
        )
        if readiness.get("mutates_host") is not False:
            errors.append(fail(f"{scenario} readiness must be non-mutating"))
        readiness_block = readiness.get("readiness", {})
        if readiness_block.get("status") != expected_status:
            errors.append(
                fail(
                    f"{scenario} readiness status {readiness_block.get('status')} != {expected_status}"
                )
            )
        if not readiness_block.get("next_action"):
            errors.append(fail(f"{scenario} readiness missing next_action"))
        checks = readiness_block.get("checks", [])
        failed_checks = [
            check
            for check in checks
            if isinstance(check, dict) and check.get("status") == "failed"
        ]
        for check in failed_checks:
            if not check.get("message"):
                errors.append(fail(f"{scenario} failed check missing message"))
            fix_steps = check.get("fix_steps")
            if not isinstance(fix_steps, list) or len(fix_steps) < 2:
                errors.append(
                    fail(f"{scenario} failed check missing actionable fix_steps")
                )

    detected = module.detect_host_dependencies(
        host={"system": "Windows", "release": "test", "machine": "x86_64"}
    )
    if detected.get("mutates_host") is not False:
        errors.append(fail("host dependency detection must be non-mutating"))
    if detected.get("detection_source") != "host_read_only":
        errors.append(
            fail("host dependency detection must identify host_read_only source")
        )
    detected_readiness = module.build_readiness_model(
        manifest=data,
        profile_id="clerk-core",
        menu_style="guided",
        host={"system": "Windows", "release": "test", "machine": "x86_64"},
        detected=detected,
    )
    readiness_block = detected_readiness.get("readiness", {})
    if detected_readiness.get("mutates_host") is not False:
        errors.append(fail("detected readiness must be non-mutating"))
    if detected_readiness.get("detection_source") != "host_read_only":
        errors.append(fail("detected readiness must preserve host_read_only source"))
    if readiness_block.get("status") not in {"ready", "warning", "blocked"}:
        errors.append(
            fail(
                f"detected readiness has invalid status {readiness_block.get('status')}"
            )
        )
    for check in readiness_block.get("checks", []):
        if isinstance(check, dict) and "evidence" not in check:
            errors.append(fail("detected readiness checks must include evidence"))

    blocked_gate = module.build_execution_gate(
        manifest=data,
        profile_id="minimal",
        menu_style="guided",
    )
    if blocked_gate.get("mutates_host") is not False:
        errors.append(fail("blocked execution gate must be non-mutating"))
    if blocked_gate.get("gate_status") != "blocked":
        errors.append(fail("execution gate without token must be blocked"))
    if not blocked_gate.get("next_action"):
        errors.append(fail("blocked execution gate missing next_action"))

    approved_gate = module.build_execution_gate(
        manifest=data,
        profile_id="minimal",
        menu_style="guided",
        approval_token=module.EXECUTION_TOKEN,
    )
    if approved_gate.get("mutates_host") is not False:
        errors.append(fail("approved execution gate must still be non-mutating"))
    if approved_gate.get("execution_status") != "not_implemented":
        errors.append(fail("approved execution gate must not imply execution exists"))

    executor_design = module.build_executor_design(
        manifest=data,
        profile_id="minimal",
        menu_style="guided",
    )
    if executor_design.get("mutates_host") is not False:
        errors.append(fail("executor design must be non-mutating"))
    if executor_design.get("executor_status") != "design_only":
        errors.append(fail("executor design must be design_only"))
    state_machine = executor_design.get("state_machine", {})
    phases = state_machine.get("phases", []) if isinstance(state_machine, dict) else []
    phase_ids = {
        str(phase.get("id"))
        for phase in phases
        if isinstance(phase, dict) and phase.get("id")
    }
    required_phases = {
        "preflight",
        "approval",
        "execute",
        "verify",
        "repair",
        "rollback",
    }
    if phase_ids != required_phases:
        errors.append(
            fail(
                f"executor design phases {sorted(phase_ids)} != {sorted(required_phases)}"
            )
        )
    mutating_phases = [
        phase
        for phase in phases
        if isinstance(phase, dict) and phase.get("mutates_host") is True
    ]
    if {phase.get("id") for phase in mutating_phases} != {
        "execute",
        "repair",
        "rollback",
    }:
        errors.append(
            fail(
                "executor design must mark only execute/repair/rollback as future mutating phases"
            )
        )
    for phase in phases:
        if not isinstance(phase, dict):
            continue
        if not phase.get("required_evidence"):
            errors.append(
                fail(f"executor phase {phase.get('id')} missing required_evidence")
            )
        if not phase.get("blocks_on"):
            errors.append(fail(f"executor phase {phase.get('id')} missing blocks_on"))

    evidence_schema = module.build_evidence_schema(
        manifest=data,
        profile_id="minimal",
        menu_style="guided",
    )
    if evidence_schema.get("mutates_host") is not False:
        errors.append(fail("evidence schema must be non-mutating"))
    if evidence_schema.get("schema_version") != 1:
        errors.append(fail("evidence schema version must be 1"))
    if evidence_schema.get("missing_phase_reports"):
        errors.append(
            fail(
                f"evidence schema missing phase reports: {evidence_schema.get('missing_phase_reports')}"
            )
        )
    reports = evidence_schema.get("reports", [])
    report_ids = set()
    for report in reports:
        if not isinstance(report, dict):
            errors.append(fail("evidence report entries must be objects"))
            continue
        report_id = report.get("id")
        if not report_id:
            errors.append(fail("evidence report missing id"))
        if report_id in report_ids:
            errors.append(fail(f"duplicate evidence report id {report_id}"))
        report_ids.add(report_id)
        required_fields = report.get("required_fields")
        if not isinstance(required_fields, list) or "run_id" not in required_fields:
            errors.append(fail(f"evidence report {report_id} must require run_id"))
        if "installer/reports/{run_id}/" not in str(report.get("path_template")):
            errors.append(
                fail(
                    f"evidence report {report_id} must live under installer/reports/{{run_id}}"
                )
            )
        if not report.get("redaction"):
            errors.append(fail(f"evidence report {report_id} missing redaction rule"))

    run_id = "verify-installer-report-writer"
    dry_run_plan = module.build_install_plan(
        manifest=data,
        profile_id="minimal",
        menu_style="guided",
        host={"system": "Windows", "release": "test", "machine": "x86_64"},
    )
    report_result = module.write_report_for_plan(
        plan=dry_run_plan, mode="plan", run_id=run_id
    )
    report_paths = report_result.get("reports_written", [])
    if report_result.get("mutates_host") is not False:
        errors.append(fail("report writer must be non-mutating to host"))
    if report_paths != [
        "installer\\reports\\verify-installer-report-writer\\dry-run-plan.json"
    ] and report_paths != [
        "installer/reports/verify-installer-report-writer/dry-run-plan.json"
    ]:
        errors.append(fail(f"unexpected dry-run report paths: {report_paths}"))
    dry_run_report = ROOT / "installer" / "reports" / run_id / "dry-run-plan.json"
    if not dry_run_report.is_file():
        errors.append(fail("dry-run report writer did not create dry-run-plan.json"))
    else:
        report_data = json.loads(dry_run_report.read_text(encoding="utf-8"))
        for field in ("run_id", "profile", "modules", "actions", "mutates_host"):
            if field not in report_data:
                errors.append(fail(f"dry-run report missing {field}"))
        if report_data.get("mutates_host") is not False:
            errors.append(fail("dry-run report must record mutates_host false"))

    readiness = module.build_readiness_model(
        manifest=data,
        profile_id="minimal",
        menu_style="guided",
        host={"system": "Windows", "release": "test", "machine": "x86_64"},
        scenario="missing-docker",
    )
    module.write_report_for_plan(plan=readiness, mode="readiness", run_id=run_id)
    readiness_report = ROOT / "installer" / "reports" / run_id / "readiness.json"
    if not readiness_report.is_file():
        errors.append(fail("readiness report writer did not create readiness.json"))
    else:
        readiness_data = json.loads(readiness_report.read_text(encoding="utf-8"))
        if readiness_data.get("status") != "blocked":
            errors.append(
                fail("readiness report should record blocked missing-docker scenario")
            )
        if not readiness_data.get("next_action"):
            errors.append(fail("readiness report missing next_action"))

    gate = module.build_execution_gate(
        manifest=data, profile_id="minimal", menu_style="guided"
    )
    module.write_report_for_plan(plan=gate, mode="approval", run_id=run_id)
    approval_report = ROOT / "installer" / "reports" / run_id / "approval.json"
    if not approval_report.is_file():
        errors.append(fail("approval report writer did not create approval.json"))
    else:
        approval_data = json.loads(approval_report.read_text(encoding="utf-8"))
        if approval_data.get("approval_received") is not False:
            errors.append(
                fail("approval report should record no approval token by default")
            )
        if "approval_required" not in approval_data:
            errors.append(fail("approval report missing approval_required"))

    try:
        module._write_json_report(
            "approval_record", {"run_id": "bad", "token": "secret"}
        )
    except Exception as exc:
        if "secret" not in str(exc) and "required field" not in str(exc):
            errors.append(fail(f"secret-shaped report failed with wrong error: {exc}"))
    else:
        errors.append(fail("secret-shaped report should be rejected"))

    artifacts = module.build_artifact_resolution(
        manifest=data,
        profile_id="minimal",
        menu_style="guided",
        host={"system": "Windows", "release": "test", "machine": "x86_64"},
    )
    if artifacts.get("mutates_host") is not False:
        errors.append(fail("artifact resolver must be non-mutating"))
    if not artifacts.get("artifacts"):
        errors.append(fail("artifact resolver must return artifact rows"))
    if artifacts.get("status") not in {"ready", "warning", "blocked"}:
        errors.append(
            fail(f"artifact resolver invalid status {artifacts.get('status')}")
        )
    module.write_report_for_plan(plan=artifacts, mode="artifacts", run_id=run_id)
    artifact_report = ROOT / "installer" / "reports" / run_id / "artifact-versions.json"
    if not artifact_report.is_file():
        errors.append(
            fail("artifact report writer did not create artifact-versions.json")
        )
    else:
        artifact_data = json.loads(artifact_report.read_text(encoding="utf-8"))
        if artifact_data.get("mutates_host") is not False or not artifact_data.get(
            "artifacts"
        ):
            errors.append(
                fail("artifact report must be non-mutating and include artifacts")
            )

    profile_config = module.build_profile_config(
        manifest=data,
        profile_id="clerk-core",
        menu_style="guided",
        host={"system": "Windows", "release": "test", "machine": "x86_64"},
    )
    if profile_config.get("mutates_host") is not False:
        errors.append(fail("profile config planner must be non-mutating"))
    if not profile_config.get("services") or not profile_config.get("data_paths"):
        errors.append(
            fail("profile config planner must include services and data paths")
        )
    module.write_report_for_plan(
        plan=profile_config, mode="profile_config", run_id=run_id
    )
    service_report = ROOT / "installer" / "reports" / run_id / "service-config.json"
    if not service_report.is_file():
        errors.append(
            fail("profile config report writer did not create service-config.json")
        )

    health_plan = module.build_health_check_plan(
        manifest=data,
        profile_id="clerk-core",
        menu_style="guided",
        host={"system": "Windows", "release": "test", "machine": "x86_64"},
    )
    if (
        health_plan.get("mutates_host") is not False
        or health_plan.get("starts_service") is not False
    ):
        errors.append(fail("health-check plan must not mutate or start services"))
    if not health_plan.get("checks"):
        errors.append(fail("health-check plan must include checks"))
    module.write_report_for_plan(plan=health_plan, mode="health_checks", run_id=run_id)
    health_report = ROOT / "installer" / "reports" / run_id / "health-checks.json"
    if not health_report.is_file():
        errors.append(
            fail("health-check report writer did not create health-checks.json")
        )

    preflight = module.build_executor_preflight(
        manifest=data,
        profile_id="minimal",
        menu_style="guided",
        host={"system": "Windows", "release": "test", "machine": "x86_64"},
    )
    if preflight.get("mutates_host") is not False:
        errors.append(fail("executor preflight must be non-mutating"))
    if preflight.get(
        "status"
    ) != "blocked" or "executor_not_implemented" not in preflight.get("blockers", []):
        errors.append(
            fail(
                "executor preflight must remain blocked while executor is not implemented"
            )
        )

    if not hasattr(module, "run_clerk_core_cleanroom_proof"):
        errors.append(fail("planner must expose clerk-core cleanroom proof runner"))
    if not hasattr(module, "run_clerk_core_cleanroom_gate"):
        errors.append(fail("planner must expose clerk-core cleanroom gate runner"))
    if not hasattr(module, "summarize_clerk_core_cleanroom_gate"):
        errors.append(fail("planner must expose clerk-core cleanroom gate summarizer"))
    else:
        gate_summary = module.summarize_clerk_core_cleanroom_gate(
            {
                "status": "passed",
                "run_id": "verify-summary-only",
                "proof_path": "installer/reports/verify-summary-only/service-ui-proof.json",
                "api_health": "passed",
                "frontend_health": "passed",
                "playwright_live_ui": "passed",
            }
        )
        if (
            gate_summary.get("gate") != "clerk-core-cleanroom"
            or gate_summary.get("status") != "passed"
        ):
            errors.append(
                fail("cleanroom gate summary must expose a named passed gate")
            )
        if (
            gate_summary.get("dry_run") is not False
            or gate_summary.get("mutates_host") is not True
        ):
            errors.append(
                fail(
                    "cleanroom gate summary must clearly mark mutating non-dry-run scope"
                )
            )
        if len(gate_summary.get("checks", [])) != 3:
            errors.append(
                fail(
                    "cleanroom gate summary must include API, frontend, and Playwright checks"
                )
            )
        failed_summary = module.summarize_clerk_core_cleanroom_gate(
            {
                "status": "failed",
                "run_id": "verify-summary-only",
                "proof_path": "installer/reports/verify-summary-only/service-ui-proof.json",
                "api_health": "passed",
                "frontend_health": "failed",
                "playwright_live_ui": None,
            }
        )
        if failed_summary.get(
            "status"
        ) != "failed" or "Gate failed" not in failed_summary.get("next_action", ""):
            errors.append(
                fail("cleanroom gate summary must provide actionable failure output")
            )

    for flag in ("--run-cleanroom-proof", "--run-cleanroom-gate"):
        proc = subprocess.run(
            [
                sys.executable,
                str(PLANNER),
                "--profile",
                "clerk-core",
                flag,
                "--dry-run",
            ],
            cwd=ROOT,
            capture_output=True,
            text=True,
            check=False,
        )
        if proc.returncode == 0:
            errors.append(
                fail(
                    f"{flag} must reject --dry-run because it mutates Docker/evidence state"
                )
            )
        if "cannot be combined" not in proc.stderr:
            errors.append(
                fail(f"{flag} dry-run rejection must explain the operator fix")
            )

    if not hasattr(module, "generate_profile_package"):
        errors.append(fail("planner must expose profile package generator"))
    else:
        package = module.generate_profile_package(
            manifest=data,
            profile_id="clerk-core",
            menu_style="guided",
            platform_id="all",
        )
        if package.get("mutates_host") is not False:
            errors.append(fail("profile package generator must not mutate host state"))
        if package.get("native_installers_packaged") is not False:
            errors.append(
                fail(
                    "profile package generator must not claim native installers are packaged"
                )
            )
        if package.get("platforms") != ["windows", "macos", "linux"]:
            errors.append(
                fail(
                    "profile package generator must emit all platform packages by default"
                )
            )
        for platform_id, launcher in (
            ("windows", "start-civicsuite-installer.ps1"),
            ("macos", "start-civicsuite-installer.sh"),
            ("linux", "start-civicsuite-installer.sh"),
        ):
            package_dir = GENERATED_PACKAGES / "clerk-core" / platform_id
            for name in ("README.md", "install-plan.json", launcher):
                if not (package_dir / name).is_file():
                    errors.append(fail(f"profile package missing {platform_id}/{name}"))
            readme_path = package_dir / "README.md"
            if readme_path.is_file():
                readme = readme_path.read_text(encoding="utf-8")
                for phrase in (
                    "unsigned",
                    "public-use starter",
                    "SHA256",
                    "Windows",
                    "official CivicSuite",
                    "workflow proof",
                    "bearer staff mode",
                ):
                    if phrase not in readme:
                        errors.append(
                            fail(
                                f"profile package {platform_id} README missing unsigned public-use starter phrase: {phrase}"
                            )
                        )
            launcher_path = package_dir / launcher
            if launcher_path.is_file():
                launcher_text = launcher_path.read_text(encoding="utf-8")
                for phrase in (
                    "unsigned",
                    "SHA256",
                    "public-use starter",
                    "official CivicSuite",
                    "workflow-proof" if platform_id != "windows" else "WorkflowProof",
                ):
                    if phrase not in launcher_text:
                        errors.append(
                            fail(
                                f"profile package {platform_id} launcher missing unsigned public-use starter phrase: {phrase}"
                            )
                        )
            plan_path = package_dir / "install-plan.json"
            if plan_path.is_file():
                plan_data = json.loads(plan_path.read_text(encoding="utf-8"))
                if plan_data.get(
                    "profile"
                ) != "clerk-core" or "civiccore" not in plan_data.get("modules", []):
                    errors.append(
                        fail(
                            f"profile package {platform_id} plan has wrong profile/modules"
                        )
                    )
                manifest_module_items = data.get("modules", [])
                manifest_modules = {
                    str(item.get("id")): item
                    for item in cast(list[dict[str, Any]], manifest_module_items)
                    if isinstance(item, dict) and item.get("id")
                }
                plan_modules = {
                    str(item.get("module")): item
                    for item in plan_data.get("actions", [])
                    if isinstance(item, dict) and item.get("type") == "install_module"
                }
                expected_records_requirement = manifest_modules.get(
                    "civicrecords-ai", {}
                ).get("civiccore_requirement")
                actual_records_requirement = plan_modules.get(
                    "civicrecords-ai", {}
                ).get("civiccore_requirement")
                if actual_records_requirement != expected_records_requirement:
                    errors.append(
                        fail(
                            f"profile package {platform_id} CivicSunshine CivicCore requirement "
                            f"drifted from manifest: {actual_records_requirement!r} != {expected_records_requirement!r}"
                        )
                    )
        bash = bash_command()
        for platform_id in ("macos", "linux"):
            if not bash:
                errors.append(fail(f"profile package {platform_id} launcher checks require bash"))
                continue
            package_launcher = (
                GENERATED_PACKAGES
                / "clerk-core"
                / platform_id
                / "start-civicsuite-installer.sh"
            )
            ok, output = run_launcher(
                [bash, package_launcher.relative_to(ROOT).as_posix(), "plan"]
            )
            if not ok:
                errors.append(
                    fail(f"profile package {platform_id} launcher failed: {output}")
                )
            elif (
                '"profile": "clerk-core"' not in output
                or '"mutates_host": false' not in output
            ):
                errors.append(
                    fail(
                        f"profile package {platform_id} launcher did not return the dry-run plan"
                    )
                )
        windows_launcher = (
            GENERATED_PACKAGES
            / "clerk-core"
            / "windows"
            / "start-civicsuite-installer.ps1"
        )
        if powershell_command():
            ok, output = run_launcher(
                [
                    powershell_command() or "powershell",
                    "-NoProfile",
                    "-ExecutionPolicy",
                    "Bypass",
                    "-File",
                    str(windows_launcher),
                    "-Plan",
                ]
            )
            if not ok:
                errors.append(
                    fail(f"profile package windows launcher failed: {output}")
                )
            elif (
                '"profile": "clerk-core"' not in output
                or '"mutates_host": false' not in output
            ):
                errors.append(
                    fail(
                        "profile package windows launcher did not return the dry-run plan"
                    )
                )

    if not hasattr(module, "generate_release_artifacts"):
        errors.append(fail("planner must expose release artifact generator"))
    else:
        release = module.generate_release_artifacts(
            manifest=data,
            profile_id="clerk-core",
            menu_style="guided",
            version="0.1.0",
            platform_id="all",
        )
        if release.get("mutates_host") is not False:
            errors.append(fail("release artifact generator must not mutate host state"))
        if release.get("native_installers_built") is not False:
            errors.append(
                fail(
                    "release artifact generator must not claim signed native installers were built"
                )
            )
        if len(release.get("archives", [])) != 3:
            errors.append(
                fail("release artifact generator must emit one archive per platform")
            )
        for artifact in release.get("archives", []):
            artifact_path = ROOT / artifact.get("path", "")
            if not artifact_path.is_file():
                errors.append(fail(f"release archive missing: {artifact.get('path')}"))
            if len(str(artifact.get("sha256", ""))) != 64:
                errors.append(
                    fail(f"release archive missing sha256: {artifact.get('path')}")
                )
            if hasattr(module, "_archive_forbidden_entries"):
                forbidden_entries = module._archive_forbidden_entries(artifact_path)
                if forbidden_entries:
                    sample = ", ".join(forbidden_entries[:5])
                    errors.append(
                        fail(
                            f"release archive contains forbidden local state: "
                            f"{artifact.get('path')} ({sample})"
                        )
                    )
        checksum_path = ROOT / release.get("checksum_file", "")
        manifest_path = ROOT / release.get("release_manifest", "")
        if not checksum_path.is_file():
            errors.append(fail("release artifacts must write SHA256SUMS"))
        if not manifest_path.is_file():
            errors.append(fail("release artifacts must write release manifest"))
        else:
            release_manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            signing = release_manifest.get("signing", {})
            if (
                release_manifest.get("distribution_status")
                != "unsigned_public_use_starter"
            ):
                errors.append(
                    fail(
                        "release manifest must mark unsigned public-use starter distribution"
                    )
                )
            if signing.get("signed") is not False or "SHA256" not in signing.get(
                "trust_path", ""
            ):
                errors.append(
                    fail(
                        "release manifest must document unsigned signing status and SHA256 trust path"
                    )
                )
            signing_text = json.dumps(signing, sort_keys=True)
            if "official CivicSuite" not in signing_text:
                errors.append(
                    fail(
                        "release manifest signing block must require official CivicSuite source verification"
                    )
                )
            if (
                "build/sign" in release_manifest.get("next_action", "")
                or "certificates are available" in signing_text
            ):
                errors.append(
                    fail(
                        "release manifest must not imply future paid signing is the public trust path"
                    )
                )
            archive_hygiene = release_manifest.get("archive_hygiene", {})
            if archive_hygiene.get("status") != "passed":
                errors.append(
                    fail("release manifest must record passed archive hygiene")
                )
        for platform_id, required in (
            ("windows", "CivicSuiteInstaller.iss"),
            ("macos", "distribution.xml"),
            ("linux", "debian/control"),
        ):
            if not (GENERATED_NATIVE / "clerk-core" / platform_id / required).is_file():
                errors.append(fail(f"native wrapper missing {platform_id}/{required}"))
            native_readme = GENERATED_NATIVE / "clerk-core" / platform_id / "README.md"
            if native_readme.is_file():
                text = native_readme.read_text(encoding="utf-8")
                if (
                    "unsigned" not in text
                    or "SHA256" not in text
                    or "official CivicSuite" not in text
                ):
                    errors.append(
                        fail(
                            f"native wrapper {platform_id} README must explain unsigned checksum trust path"
                        )
                    )

        city_core_release = module.generate_release_artifacts(
            manifest=data,
            profile_id="city-core",
            menu_style="guided",
            version="0.1.2",
            platform_id="all",
        )
        if city_core_release.get("mutates_host") is not False:
            errors.append(fail("city-core release artifact generator must not mutate host state"))
        if city_core_release.get("modules") != [
            "civiccore",
            "civicrecords-ai",
            "civicclerk",
            "civiccode",
            "civicnotice",
            "civicaccess",
        ]:
            errors.append(fail("city-core release artifacts must package the six city-core modules"))
        if len(city_core_release.get("archives", [])) != 3:
            errors.append(fail("city-core release artifacts must emit one archive per platform"))
        city_manifest_path = ROOT / city_core_release.get("release_manifest", "")
        if not city_manifest_path.is_file():
            errors.append(fail("city-core release artifacts must write release manifest"))
        else:
            city_manifest = json.loads(city_manifest_path.read_text(encoding="utf-8"))
            support = city_manifest.get("platform_support", {})
            macos_support = support.get("macos", {}) if isinstance(support, dict) else {}
            if macos_support.get("support_status") != "beta":
                errors.append(
                    fail("city-core release manifest must label macOS package support as beta")
                )
        for platform_id, launcher in (
            ("windows", "start-civicsuite-installer.ps1"),
            ("macos", "start-civicsuite-installer.sh"),
            ("linux", "start-civicsuite-installer.sh"),
        ):
            package_dir = GENERATED_PACKAGES / "city-core" / platform_id
            for name in ("README.md", "install-plan.json", launcher):
                if not (package_dir / name).is_file():
                    errors.append(fail(f"city-core package missing {platform_id}/{name}"))
            # Derive expected members from the city-core profile so adding a module can never
            # silently desync this gate (a hard-coded list previously let the launcher drop the
            # 6th module while CI stayed green).
            city_core_profile = next(
                (
                    profile
                    for profile in data.get("profiles", [])
                    if isinstance(profile, dict) and profile.get("id") == "city-core"
                ),
                {},
            )
            expected_city_core_modules = [
                str(module_id) for module_id in city_core_profile.get("modules", [])
            ]
            # The launcher installs civiccore separately; its default-profile list is the rest.
            expected_launcher_modules = [
                module_id
                for module_id in expected_city_core_modules
                if module_id != "civiccore"
            ]
            plan_path = package_dir / "install-plan.json"
            if plan_path.is_file():
                plan_data = json.loads(plan_path.read_text(encoding="utf-8"))
                if plan_data.get("profile") != "city-core":
                    errors.append(fail(f"city-core package {platform_id} plan has wrong profile"))
                plan_modules = plan_data.get("modules", [])
                for required_module in expected_city_core_modules:
                    if required_module not in plan_modules:
                        errors.append(
                            fail(
                                f"city-core package {platform_id} plan missing {required_module}"
                            )
                        )
                install_actions = [
                    action
                    for action in plan_data.get("actions", [])
                    if isinstance(action, dict) and action.get("type") == "install_module"
                ]
                for action in install_actions:
                    module_id = action.get("module")
                    expected_requirement = module_by_id.get(str(module_id), {}).get(
                        "civiccore_requirement"
                    )
                    if (
                        module_id in set(expected_launcher_modules)
                        and action.get("civiccore_requirement") != expected_requirement
                    ):
                        errors.append(
                            fail(
                                f"city-core package {platform_id} {module_id} must install against CivicCore {expected_requirement}"
                            )
                        )
            launcher_path = package_dir / launcher
            if launcher_path.is_file():
                launcher_text = launcher_path.read_text(encoding="utf-8")
                missing_in_launcher = [
                    module_id
                    for module_id in expected_launcher_modules
                    if module_id not in launcher_text
                ]
                if missing_in_launcher:
                    errors.append(
                        fail(
                            "city-core package "
                            f"{platform_id} launcher must pass every city-core module through "
                            f"lifecycle commands; missing: {', '.join(missing_in_launcher)}"
                        )
                    )

    if has_local_civiccore_wheel():
        install_kit = module.generate_minimal_install_kit(manifest=data)
        if install_kit.get("mutates_host") is not False:
            errors.append(
                fail("minimal install kit generator must not mutate host state")
            )
        if install_kit.get("installer_scripts_mutate_when_run") is not True:
            errors.append(
                fail(
                    "minimal install kit must clearly label installer scripts as mutating when run"
                )
            )
    expected_generated = {
        "README.md",
        "requirements.txt",
        "civiccore-install-plan.json",
        "install-civiccore.ps1",
        "install-civiccore.sh",
        "verify-civiccore.ps1",
        "verify-civiccore.sh",
        "reset-civiccore.ps1",
        "reset-civiccore.sh",
    }
    missing_generated = [
        name for name in expected_generated if not (GENERATED_MINIMAL / name).is_file()
    ]
    if missing_generated:
        errors.append(
            fail(
                f"minimal install kit missing files: {', '.join(sorted(missing_generated))}"
            )
        )
    plan_path = GENERATED_MINIMAL / "civiccore-install-plan.json"
    if plan_path.is_file():
        generated_plan = json.loads(plan_path.read_text(encoding="utf-8"))
        if generated_plan.get("profile") != "minimal" or generated_plan.get(
            "modules"
        ) != ["civiccore"]:
            errors.append(fail("minimal install kit plan must install CivicCore only"))
        boundary = generated_plan.get("operator_boundary", {})
        if boundary.get("does_not_install_system_dependencies") is not True:
            errors.append(
                fail(
                    "minimal install kit must not claim to install system dependencies"
                )
            )
        if boundary.get("does_not_start_services") is not True:
            errors.append(fail("minimal install kit must not start services"))
    requirements = GENERATED_MINIMAL / "requirements.txt"
    if requirements.is_file():
        requirements_text = requirements.read_text(encoding="utf-8")
        if (
            "civiccore-1.1.0-py3-none-any.whl" not in requirements_text
            and "civiccore-1.2.0-py3-none-any.whl" not in requirements_text
        ):
            errors.append(
                fail("minimal install kit requirements must point to a CivicCore wheel")
            )

    try:
        module.build_install_plan(
            manifest=data, profile_id="custom", selected_modules=[]
        )
    except Exception as exc:
        if "Custom profile requires" not in str(exc):
            errors.append(fail(f"custom profile failed with wrong error: {exc}"))
    else:
        errors.append(fail("custom profile without modules should fail"))

    return errors


def run_launcher(command: list[str]) -> tuple[bool, str]:
    proc = subprocess.run(
        command, cwd=ROOT, capture_output=True, text=True, check=False
    )
    output = "\n".join(
        part for part in (proc.stdout.strip(), proc.stderr.strip()) if part
    )
    return proc.returncode == 0, output


def powershell_command() -> str | None:
    if os.environ.get("CIVICSUITE_VERIFY_NO_POWERSHELL") == "1":
        return None
    return shutil.which("powershell") or shutil.which("pwsh")


def bash_command() -> str | None:
    if os.environ.get("CIVICSUITE_VERIFY_NO_BASH") == "1":
        return None
    candidates = (
        os.environ.get("GIT_BASH"),
        r"C:\Program Files\Git\bin\bash.exe",
        shutil.which("bash"),
    )
    for candidate in candidates:
        if candidate and Path(candidate).is_file():
            return candidate
    return None


def check_launchers() -> list[str]:
    errors: list[str] = []
    launchers = {
        "windows": WINDOWS_LAUNCHER,
        "macos": MACOS_LAUNCHER,
        "linux": LINUX_LAUNCHER,
    }
    for name, path in launchers.items():
        if not path.is_file():
            errors.append(fail(f"missing launcher {path.relative_to(ROOT)}"))
            continue
        text = path.read_text(encoding="utf-8")
        if "--dry-run" not in text:
            errors.append(fail(f"{name} launcher must force --dry-run"))
        forbidden_phrases = (
            "docker compose up",
            "docker run",
            "pip install",
            "npm install",
            "Start-Service",
            "apt install",
            "brew install",
        )
        for phrase in forbidden_phrases:
            if phrase in text:
                errors.append(
                    fail(f"{name} launcher contains mutating phrase: {phrase}")
                )

    powershell = powershell_command()
    if WINDOWS_LAUNCHER.is_file() and powershell:
        ok, output = run_launcher(
            [
                powershell,
                "-NoProfile",
                "-ExecutionPolicy",
                "Bypass",
                "-File",
                str(WINDOWS_LAUNCHER),
                "-Profile",
                "minimal",
                "-ShowReadiness",
                "-DetectHost",
                "-ReadinessScenario",
                "missing-docker",
            ]
        )
        if not ok:
            errors.append(fail(f"windows launcher failed: {output}"))
        elif (
            '"mutates_host": false' not in output
            or '"detection_source": "host_read_only"' not in output
        ):
            errors.append(
                fail("windows launcher output did not prove mutates_host false")
            )

        ok, output = run_launcher(
            [
                powershell,
                "-NoProfile",
                "-ExecutionPolicy",
                "Bypass",
                "-File",
                str(WINDOWS_LAUNCHER),
                "-Profile",
                "minimal",
                "-Execute",
            ]
        )
        if not ok:
            errors.append(fail(f"windows execution gate failed: {output}"))
        elif (
            '"mutates_host": false' not in output
            or '"gate_status": "blocked"' not in output
        ):
            errors.append(
                fail("windows execution gate did not stay blocked and non-mutating")
            )

        ok, output = run_launcher(
            [
                powershell,
                "-NoProfile",
                "-ExecutionPolicy",
                "Bypass",
                "-File",
                str(WINDOWS_LAUNCHER),
                "-Profile",
                "minimal",
                "-ShowExecutorDesign",
            ]
        )
        if not ok:
            errors.append(fail(f"windows executor design failed: {output}"))
        elif (
            '"mutates_host": false' not in output
            or '"executor_status": "design_only"' not in output
        ):
            errors.append(
                fail(
                    "windows executor design did not stay design-only and non-mutating"
                )
            )

        ok, output = run_launcher(
            [
                powershell,
                "-NoProfile",
                "-ExecutionPolicy",
                "Bypass",
                "-File",
                str(WINDOWS_LAUNCHER),
                "-Profile",
                "minimal",
                "-ShowEvidenceSchema",
            ]
        )
        if not ok:
            errors.append(fail(f"windows evidence schema failed: {output}"))
        elif (
            '"mutates_host": false' not in output or '"schema_version": 1' not in output
        ):
            errors.append(fail("windows evidence schema did not stay non-mutating"))

        ok, output = run_launcher(
            [
                powershell,
                "-NoProfile",
                "-ExecutionPolicy",
                "Bypass",
                "-File",
                str(WINDOWS_LAUNCHER),
                "-Profile",
                "minimal",
                "-WriteReport",
                "-RunId",
                "verify-windows-launcher-report",
            ]
        )
        if not ok:
            errors.append(fail(f"windows report writer failed: {output}"))
        elif '"evidence_report"' not in output or '"mutates_host": false' not in output:
            errors.append(
                fail(
                    "windows report writer did not return non-mutating evidence_report"
                )
            )

        for switch, marker in (
            ("-ShowArtifacts", '"artifacts"'),
            ("-ShowProfileConfig", '"services"'),
            ("-ShowHealthChecks", '"checks"'),
            ("-ShowPreflight", '"executor_not_implemented"'),
        ):
            ok, output = run_launcher(
                [
                    powershell,
                    "-NoProfile",
                    "-ExecutionPolicy",
                    "Bypass",
                    "-File",
                    str(WINDOWS_LAUNCHER),
                    "-Profile",
                    "minimal",
                    switch,
                ]
            )
            if not ok:
                errors.append(fail(f"windows launcher {switch} failed: {output}"))
            elif '"mutates_host": false' not in output or marker not in output:
                errors.append(
                    fail(
                        f"windows launcher {switch} did not return expected non-mutating model"
                    )
                )
        if has_local_civiccore_wheel():
            ok, output = run_launcher(
                [
                    powershell,
                    "-NoProfile",
                    "-ExecutionPolicy",
                    "Bypass",
                    "-File",
                    str(WINDOWS_LAUNCHER),
                    "-Profile",
                    "minimal",
                    "-GenerateInstallKit",
                ]
            )
            if not ok:
                errors.append(
                    fail(f"windows launcher -GenerateInstallKit failed: {output}")
                )
            elif (
                '"mutates_host": false' not in output
                or '"generated_root"' not in output
            ):
                errors.append(
                    fail(
                        "windows launcher -GenerateInstallKit did not return expected non-mutating model"
                    )
                )
        ok, output = run_launcher(
            [
                powershell,
                "-NoProfile",
                "-ExecutionPolicy",
                "Bypass",
                "-File",
                str(WINDOWS_LAUNCHER),
                "-Profile",
                "clerk-core",
                "-GenerateProfilePackage",
            ]
        )
        if not ok:
            errors.append(
                fail(f"windows launcher -GenerateProfilePackage failed: {output}")
            )
        elif '"mutates_host": false' not in output or '"package_root"' not in output:
            errors.append(
                fail(
                    "windows launcher -GenerateProfilePackage did not return expected package model"
                )
            )
        ok, output = run_launcher(
            [
                powershell,
                "-NoProfile",
                "-ExecutionPolicy",
                "Bypass",
                "-File",
                str(WINDOWS_LAUNCHER),
                "-Profile",
                "clerk-core",
                "-GenerateReleaseArtifacts",
            ]
        )
        if not ok:
            errors.append(
                fail(f"windows launcher -GenerateReleaseArtifacts failed: {output}")
            )
        elif (
            '"mutates_host": false' not in output or '"release_manifest"' not in output
        ):
            errors.append(
                fail(
                    "windows launcher -GenerateReleaseArtifacts did not return expected artifact model"
                )
            )
        launcher_text = WINDOWS_LAUNCHER.read_text(encoding="utf-8")
        if (
            "RunCleanroomProof" not in launcher_text
            or "--run-cleanroom-proof" not in launcher_text
        ):
            errors.append(fail("windows launcher missing cleanroom proof switch"))
        if (
            "RunCleanroomGate" not in launcher_text
            or "--run-cleanroom-gate" not in launcher_text
        ):
            errors.append(fail("windows launcher missing cleanroom gate switch"))

    bash = bash_command()
    for name, path in (("macos", MACOS_LAUNCHER), ("linux", LINUX_LAUNCHER)):
        if not path.is_file():
            continue
        if not bash:
            errors.append(fail(f"{name} launcher checks require bash"))
            continue
        launcher_path = path.relative_to(ROOT).as_posix()
        ok, output = run_launcher(
            [
                bash,
                launcher_path,
                "--profile",
                "minimal",
                "--show-readiness",
                "--detect-host",
                "--readiness-scenario",
                "missing-docker",
            ]
        )
        if not ok:
            errors.append(fail(f"{name} launcher failed: {output}"))
        elif (
            '"mutates_host": false' not in output
            or '"detection_source": "host_read_only"' not in output
        ):
            errors.append(
                fail(f"{name} launcher output did not prove mutates_host false")
            )
        ok, output = run_launcher(
            [bash, launcher_path, "--profile", "minimal", "--execute"]
        )
        if not ok:
            errors.append(fail(f"{name} execution gate failed: {output}"))
        elif (
            '"mutates_host": false' not in output
            or '"gate_status": "blocked"' not in output
        ):
            errors.append(
                fail(f"{name} execution gate did not stay blocked and non-mutating")
            )
        ok, output = run_launcher(
            [bash, launcher_path, "--profile", "minimal", "--show-executor-design"]
        )
        if not ok:
            errors.append(fail(f"{name} executor design failed: {output}"))
        elif (
            '"mutates_host": false' not in output
            or '"executor_status": "design_only"' not in output
        ):
            errors.append(
                fail(
                    f"{name} executor design did not stay design-only and non-mutating"
                )
            )
        ok, output = run_launcher(
            [bash, launcher_path, "--profile", "minimal", "--show-evidence-schema"]
        )
        if not ok:
            errors.append(fail(f"{name} evidence schema failed: {output}"))
        elif (
            '"mutates_host": false' not in output or '"schema_version": 1' not in output
        ):
            errors.append(fail(f"{name} evidence schema did not stay non-mutating"))
        ok, output = run_launcher(
            [
                bash,
                launcher_path,
                "--profile",
                "minimal",
                "--write-report",
                "--run-id",
                f"verify-{name}-launcher-report",
            ]
        )
        if not ok:
            errors.append(fail(f"{name} report writer failed: {output}"))
        elif '"evidence_report"' not in output or '"mutates_host": false' not in output:
            errors.append(
                fail(
                    f"{name} report writer did not return non-mutating evidence_report"
                )
            )
        for flag, marker in (
            ("--show-artifacts", '"artifacts"'),
            ("--show-profile-config", '"services"'),
            ("--show-health-checks", '"checks"'),
            ("--show-preflight", '"executor_not_implemented"'),
        ):
            ok, output = run_launcher(
                [bash, launcher_path, "--profile", "minimal", flag]
            )
            if not ok:
                errors.append(fail(f"{name} launcher {flag} failed: {output}"))
            elif '"mutates_host": false' not in output or marker not in output:
                errors.append(
                    fail(
                        f"{name} launcher {flag} did not return expected non-mutating model"
                    )
                )
        if has_local_civiccore_wheel():
            ok, output = run_launcher(
                [
                    bash,
                    launcher_path,
                    "--profile",
                    "minimal",
                    "--generate-install-kit",
                ]
            )
            if not ok:
                errors.append(
                    fail(f"{name} launcher --generate-install-kit failed: {output}")
                )
            elif (
                '"mutates_host": false' not in output
                or '"generated_root"' not in output
            ):
                errors.append(
                    fail(
                        f"{name} launcher --generate-install-kit did not return expected non-mutating model"
                    )
                )
        ok, output = run_launcher(
            [
                bash,
                launcher_path,
                "--profile",
                "clerk-core",
                "--generate-profile-package",
            ]
        )
        if not ok:
            errors.append(
                fail(f"{name} launcher --generate-profile-package failed: {output}")
            )
        elif '"mutates_host": false' not in output or '"package_root"' not in output:
            errors.append(
                fail(
                    f"{name} launcher --generate-profile-package did not return expected package model"
                )
            )
        ok, output = run_launcher(
            [
                bash,
                launcher_path,
                "--profile",
                "clerk-core",
                "--generate-release-artifacts",
            ]
        )
        if not ok:
            errors.append(
                fail(f"{name} launcher --generate-release-artifacts failed: {output}")
            )
        elif (
            '"mutates_host": false' not in output or '"release_manifest"' not in output
        ):
            errors.append(
                fail(
                    f"{name} launcher --generate-release-artifacts did not return expected artifact model"
                )
            )
        launcher_text = path.read_text(encoding="utf-8")
        if "--run-cleanroom-proof" not in launcher_text:
            errors.append(fail(f"{name} launcher missing cleanroom proof flag"))
        if "--run-cleanroom-gate" not in launcher_text:
            errors.append(fail(f"{name} launcher missing cleanroom gate flag"))

    return errors


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Verify the CivicSuite suite-installer design contract."
    )
    parser.add_argument(
        "--require-package-cleanroom-evidence",
        action="store_true",
        help="Fail when installer package cleanroom reports are absent.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    print("==> CivicSuite installer plan verification")
    before_files, before_directories = snapshot_generated_artifacts()
    errors = []
    try:
        if not MANIFEST.is_file():
            errors.append(fail(f"missing {MANIFEST.relative_to(ROOT)}"))
        else:
            try:
                manifest = load_manifest()
                errors.extend(check_manifest(manifest))
                errors.extend(check_module_manifest_contract())
                errors.extend(check_planner(manifest))
                errors.extend(check_launchers())
                errors.extend(check_cleanroom_workflow(manifest))
            except Exception as exc:
                errors.append(fail(f"could not parse manifest: {exc}"))
        errors.extend(check_docs())
        errors.extend(check_clerk_core_staff_mode_contract())
        require_package_reports = (
            args.require_package_cleanroom_evidence
            or os.environ.get("CIVICSUITE_REQUIRE_PACKAGE_CLEANROOM_EVIDENCE") == "1"
        )
        errors.extend(
            check_package_cleanroom_evidence_contract(
                require_reports=require_package_reports
            )
        )
        errors.extend(check_public_claims_bounded())
    finally:
        cleanup_generated_artifact_noise(before_files, before_directories)

    if errors:
        for error in errors:
            print(error)
        print("VERIFY-INSTALLER-PLAN: FAILED")
        return 1
    print("VERIFY-INSTALLER-PLAN: PASSED")
    return 0


if __name__ == "__main__":
    sys.exit(main())
