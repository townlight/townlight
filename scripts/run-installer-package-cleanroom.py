"""Extract a Townlight release archive and run the installer lifecycle."""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import tarfile
import time
import zipfile
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4


ROOT = Path(__file__).resolve().parents[1]
REPORT_ROOT = ROOT / "installer" / "reports"
DEFAULT_MIN_CLEANROOM_FREE_DISK_GB = 60
BYTES_PER_GB = 1024 * 1024 * 1024
PLATFORM_LAUNCHERS = {
    "linux": Path("installer/generated/packages/clerk-core/linux/start-townlight-installer.sh"),
    "macos": Path("installer/generated/packages/clerk-core/macos/start-townlight-installer.sh"),
    "windows": Path("installer/generated/packages/clerk-core/windows/start-townlight-installer.ps1"),
}
LAUNCHER_NAMES = {
    "linux": "start-townlight-installer.sh",
    "macos": "start-townlight-installer.sh",
    "windows": "start-townlight-installer.ps1",
}


def minimum_cleanroom_free_disk_gb() -> int:
    value = os.environ.get("TOWNLIGHT_CLEANROOM_MIN_FREE_GB")
    if not value:
        return DEFAULT_MIN_CLEANROOM_FREE_DISK_GB
    try:
        parsed = int(value)
    except ValueError as exc:
        raise RuntimeError("TOWNLIGHT_CLEANROOM_MIN_FREE_GB must be a positive integer.") from exc
    if parsed <= 0:
        raise RuntimeError("TOWNLIGHT_CLEANROOM_MIN_FREE_GB must be a positive integer.")
    return parsed
DEPENDENCY_GATE_MARKERS = (
    "toomanyrequests",
    "too many requests",
    "unauthenticated pull rate limit",
    "failed to resolve source metadata for docker.io",
)


def make_run_id() -> str:
    stamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    return f"installer-package-cleanroom-{stamp}-{uuid4().hex[:8]}"


def run(command: list[str], *, cwd: Path, timeout: int, env: dict[str, str] | None = None) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        command,
        cwd=cwd,
        env=env,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False,
        timeout=timeout,
    )


def disk_snapshot(path: Path = ROOT) -> dict[str, object]:
    usage = shutil.disk_usage(path)
    minimum_free_disk_gb = minimum_cleanroom_free_disk_gb()
    minimum_free_disk_bytes = minimum_free_disk_gb * BYTES_PER_GB
    return {
        "path": str(path),
        "total_bytes": usage.total,
        "used_bytes": usage.used,
        "free_bytes": usage.free,
        "required_free_gb": minimum_free_disk_gb,
        "required_free_bytes": minimum_free_disk_bytes,
        "default_required_free_gb": DEFAULT_MIN_CLEANROOM_FREE_DISK_GB,
        "passed": usage.free >= minimum_free_disk_bytes,
    }


def run_cleanup_command(command: list[str], *, timeout: int = 900) -> dict[str, object]:
    proc = run(command, cwd=ROOT, timeout=timeout)
    return {
        "command": command,
        "returncode": proc.returncode,
        "stdout": proc.stdout[-8000:],
        "stderr": proc.stderr[-8000:],
    }


def cleanroom_hygiene(*, report_dir: Path, allow_host_cleanup: bool) -> tuple[bool, dict[str, object]]:
    minimum_free_disk_gb = minimum_cleanroom_free_disk_gb()
    minimum_free_disk_bytes = minimum_free_disk_gb * BYTES_PER_GB
    before = disk_snapshot()
    evidence: dict[str, object] = {
        "minimum_free_disk_gb": minimum_free_disk_gb,
        "minimum_free_disk_bytes": minimum_free_disk_bytes,
        "default_minimum_free_disk_gb": DEFAULT_MIN_CLEANROOM_FREE_DISK_GB,
        "before": before,
        "cleanup_approved": allow_host_cleanup,
        "cleanup_steps": [],
    }
    if before["passed"] and not allow_host_cleanup:
        evidence["status"] = "passed"
        evidence["after"] = before
        return True, evidence

    if not before["passed"] and not allow_host_cleanup:
        evidence["status"] = "blocked"
        evidence["message"] = (
            f"Cleanroom lifecycle requires at least {minimum_free_disk_gb} GB free. Global Docker/WSL cleanup "
            "is destructive and requires a dedicated cleanroom host or explicit approval."
        )
        evidence["after"] = before
        return False, evidence

    steps: list[dict[str, object]] = []
    docker = shutil.which("docker")
    if docker:
        steps.append(run_cleanup_command([docker, "system", "prune", "-af"], timeout=1800))
        steps.append(run_cleanup_command([docker, "network", "prune", "-f"], timeout=300))
    else:
        steps.append({"command": ["docker", "system", "prune", "-af"], "returncode": 127, "stdout": "", "stderr": "docker was not found"})
        steps.append({"command": ["docker", "network", "prune", "-f"], "returncode": 127, "stdout": "", "stderr": "docker was not found"})

    if sys.platform.startswith("win"):
        wsl = shutil.which("wsl.exe") or shutil.which("wsl")
        if wsl:
            steps.append(run_cleanup_command([wsl, "--shutdown"], timeout=300))
        powershell = shutil.which("powershell") or shutil.which("pwsh")
        if powershell:
            steps.append(
                run_cleanup_command(
                    [
                        powershell,
                        "-NoProfile",
                        "-ExecutionPolicy",
                        "Bypass",
                        "-Command",
                        "$vhd = Get-ChildItem $env:LOCALAPPDATA\\Packages -Recurse -Filter ext4.vhdx -ErrorAction SilentlyContinue | Sort-Object Length -Descending | Select-Object -First 1; if ($vhd) { Optimize-VHD -Path $vhd.FullName -Mode Full } else { Write-Output 'No WSL ext4.vhdx found.' }",
                    ],
                    timeout=1800,
                )
            )

    after = disk_snapshot()
    evidence["cleanup_steps"] = steps
    evidence["after"] = after
    cleanup_failed = any(int(step.get("returncode", 1)) != 0 for step in steps)
    evidence["status"] = "warning" if after["passed"] and cleanup_failed else "passed" if after["passed"] else "blocked"
    if not after["passed"]:
        evidence["message"] = (
            f"Cleanroom lifecycle remains below {minimum_free_disk_gb} GB free after approved cleanup."
        )
    elif cleanup_failed:
        evidence["message"] = "Cleanroom lifecycle has enough free disk, but approved Docker cleanup reported a warning."
    report_dir.mkdir(parents=True, exist_ok=True)
    (report_dir / "cleanroom-hygiene-evidence.json").write_text(
        json.dumps(evidence, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    return bool(after["passed"]), evidence


def extract(archive: Path, target: Path) -> Path:
    target.mkdir(parents=True, exist_ok=True)
    if archive.suffix == ".zip":
        with zipfile.ZipFile(archive) as handle:
            handle.extractall(target)
    else:
        with tarfile.open(archive, "r:gz") as handle:
            handle.extractall(target)
    roots = [path for path in target.iterdir() if path.is_dir()]
    if len(roots) != 1:
        raise RuntimeError(f"Expected one extracted bundle root in {target}, found {len(roots)}.")
    return roots[0]


def remove_tree_with_retry(path: Path) -> None:
    last_error: OSError | None = None
    for attempt in range(8):
        try:
            for child in path.rglob("*"):
                try:
                    child.chmod(0o700 if child.is_dir() else 0o600)
                except OSError:
                    pass
            try:
                path.chmod(0o700)
            except OSError:
                pass
            shutil.rmtree(path)
            return
        except OSError as exc:
            last_error = exc
            time.sleep(0.25 * (attempt + 1))
    if last_error is not None:
        raise last_error


def infer_platform(archive: Path) -> str:
    name = archive.name.lower()
    for platform in PLATFORM_LAUNCHERS:
        if platform in name:
            return platform
    raise RuntimeError(
        f"Could not infer package platform from {archive.name}. "
        f"Pass --platform with one of: {', '.join(sorted(PLATFORM_LAUNCHERS))}."
    )


def find_launcher(bundle_root: Path, platform: str) -> Path:
    expected = LAUNCHER_NAMES[platform]
    matches = sorted(
        bundle_root.glob(f"installer/generated/packages/*/{platform}/{expected}")
    )
    if len(matches) == 1:
        return matches[0]
    legacy = bundle_root / PLATFORM_LAUNCHERS[platform]
    if legacy.is_file():
        return legacy
    raise RuntimeError(
        f"Expected one {platform} launcher named {expected} in {bundle_root}; found {len(matches)}."
    )


def launcher_command(
    platform: str,
    launcher: Path,
    mode: str,
    bundle_root: Path,
    *,
    staff_mode: str = "protected",
    workflow_proof: bool = False,
) -> list[str]:
    launcher_arg = launcher.relative_to(bundle_root).as_posix()
    if platform == "windows":
        switches = {
            "readiness": [],
            "plan": ["-Plan"],
            "install": ["-Install"],
            "repair": ["-Repair"],
            "verify": ["-Verify"],
            "uninstall": ["-Uninstall"],
            "backup": ["-Backup"],
            "restore": ["-Restore"],
            "gate": ["-Gate"],
        }
        lifecycle_args: list[str] = []
        if mode in {"install", "repair", "verify"}:
            lifecycle_args.extend(["-StaffMode", staff_mode])
            if workflow_proof:
                lifecycle_args.append("-WorkflowProof")
        return [
            "powershell",
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            launcher_arg,
            *switches[mode],
            *lifecycle_args,
        ]
    lifecycle_args = []
    if mode in {"install", "repair", "verify"}:
        lifecycle_args.extend(["--staff-mode", staff_mode])
        if workflow_proof:
            lifecycle_args.append("--workflow-proof")
    return ["bash", launcher_arg, mode, *lifecycle_args]


def mode_timeout(mode: str) -> int:
    if mode in {"install", "repair", "gate"}:
        return 3600
    return 900


def parse_json_from_output(output: str) -> dict[str, object] | None:
    decoder = json.JSONDecoder()
    for index, char in enumerate(output):
        if char != "{":
            continue
        try:
            parsed, end = decoder.raw_decode(output[index:])
        except json.JSONDecodeError:
            continue
        if output[index + end :].strip():
            continue
        if isinstance(parsed, dict):
            return parsed
    return None


def lifecycle_summary(mode: str, payload: dict[str, object] | None) -> dict[str, object] | None:
    if not payload:
        return None
    summary: dict[str, object] = {"mode": mode}
    for key in (
        "run_id",
        "status",
        "mutates_host",
        "ports",
        "compose_projects",
        "isolation_id",
        "port_offset",
        "error",
        "fix_steps",
    ):
        if key in payload:
            summary[key] = payload[key]
    return summary


def retain_lifecycle_evidence(bundle_root: Path, report_dir: Path) -> list[str]:
    evidence_root = report_dir / "retained-lifecycle-evidence"
    retained: list[str] = []
    patterns = (
        "installer/reports/**/*.json",
        "installer/runtime/**/backups/**/backup-manifest.json",
        "installer/runtime/**/backups/**/record-survival-ledger.json",
    )
    for pattern in patterns:
        for source in sorted(bundle_root.glob(pattern)):
            if not source.is_file():
                continue
            target = evidence_root / source.relative_to(bundle_root)
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, target)
            retained.append(str(target))
    return retained


def normalized_host_platform() -> str:
    if sys.platform.startswith("win"):
        return "windows"
    if sys.platform == "darwin":
        return "macos"
    if sys.platform.startswith("linux"):
        return "linux"
    return sys.platform


def classify_evidence(
    *,
    platform: str,
    host_platform: str,
    skip_install: bool,
    status: str,
    lifecycle_blocked: bool,
    dependency_gate_blocked: bool,
) -> str:
    if skip_install:
        return "archive_readiness_only"
    if dependency_gate_blocked:
        return "dependency_gate_blocked"
    if lifecycle_blocked:
        if platform == "macos" and host_platform != "macos":
            return "unsupported_lifecycle"
        return "host_platform_mismatch"
    if platform == host_platform and status == "passed":
        return "matching_host_lifecycle"
    if platform == host_platform:
        return "matching_host_lifecycle_failed"
    return "host_platform_mismatch"


def certification_scope(classification: str) -> str:
    scopes = {
        "archive_readiness_only": "Archive extraction, readiness, and dry-run plan only; not lifecycle certification.",
        "matching_host_lifecycle": "Matching-host install, repair, verify, backup, restore, and uninstall lifecycle evidence.",
        "matching_host_lifecycle_failed": "Matching-host lifecycle was attempted but did not pass.",
        "dependency_gate_blocked": "Matching-host lifecycle was blocked by an external dependency gate such as Docker Hub rate limiting.",
        "host_platform_mismatch": "Host platform did not match package target; not lifecycle certification.",
        "unsupported_lifecycle": "Requested lifecycle is unsupported on this host; not lifecycle certification.",
    }
    return scopes[classification]


def dependency_gate_message(steps: list[dict[str, object]]) -> str | None:
    for step in steps:
        stdout = str(step.get("stdout") or "")
        stderr = str(step.get("stderr") or "")
        combined = f"{stdout}\n{stderr}".lower()
        if any(marker in combined for marker in DEPENDENCY_GATE_MARKERS):
            return (
                "Docker Hub rate limiting blocked the lifecycle container build. "
                "This is an external dependency gate, not product code failure."
            )
    return None


def main() -> int:
    parser = argparse.ArgumentParser(description="Run a cleanroom installer package lifecycle.")
    parser.add_argument("--archive", default=str(ROOT / "installer" / "dist" / "Townlight-clerk-core-linux-0.1.0.tar.gz"))
    parser.add_argument("--platform", choices=sorted(PLATFORM_LAUNCHERS), default=None)
    parser.add_argument("--run-id", default=None)
    parser.add_argument("--skip-install", action="store_true", help="Only verify archive extraction, readiness, and plan.")
    parser.add_argument("--gate", action="store_true", help="Run the cleanroom gate after readiness and plan.")
    parser.add_argument("--staff-mode", choices=("protected", "bearer", "open"), default="protected")
    parser.add_argument(
        "--workflow-proof",
        action="store_true",
        help=(
            "Run the mutating starter-set workflow proof during install. Repair/verify keep service checks "
            "only because first-admin password rotation consumes the one-time setup secret."
        ),
    )
    parser.add_argument(
        "--allow-host-cleanup",
        action="store_true",
        help=(
            "Authorize global Docker prune and WSL shutdown/compaction when the cleanroom host has less "
            "than the configured free-disk floor."
        ),
    )
    args = parser.parse_args()

    archive = Path(args.archive).resolve()
    if not archive.is_file():
        print(f"ERROR: release archive not found: {archive}", file=sys.stderr)
        return 2
    platform = args.platform or infer_platform(archive)
    run_id = args.run_id or make_run_id()
    report_dir = REPORT_ROOT / run_id
    hygiene_ok, hygiene = cleanroom_hygiene(
        report_dir=report_dir,
        allow_host_cleanup=args.allow_host_cleanup
        or os.environ.get("TOWNLIGHT_CLEANROOM_HOST_CLEANUP_APPROVED") == "1",
    )
    if not hygiene_ok:
        proof = {
            "run_id": run_id,
            "archive": str(archive),
            "status": "blocked",
            "evidence_classification": "cleanroom_hygiene_blocked",
            "certification_scope": "Cleanroom lifecycle did not run because host hygiene failed before extraction.",
            "cleanroom_hygiene": hygiene,
        }
        report_dir.mkdir(parents=True, exist_ok=True)
        (report_dir / "installer-package-cleanroom.json").write_text(
            json.dumps(proof, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )
        print(json.dumps(proof, indent=2, sort_keys=True))
        return 1
    extract_root = report_dir / "extracted"
    bundle_root = extract(archive, extract_root)
    launcher = find_launcher(bundle_root, platform)
    if not launcher.is_file():
        print(f"ERROR: extracted launcher missing: {launcher}", file=sys.stderr)
        return 2
    try:
        launcher.chmod(0o755)
    except OSError:
        pass

    steps: list[dict[str, object]] = []
    host_platform = normalized_host_platform()
    host_platform_matches_target = platform == host_platform
    lifecycle_requested = (not args.skip_install) or args.gate
    lifecycle_blocked = lifecycle_requested and not host_platform_matches_target
    launcher_env = os.environ.copy()
    launcher_env["TOWNLIGHT_INSTALLER_RUN_ID"] = run_id
    if platform == "windows" and host_platform_matches_target:
        launcher_env["TOWNLIGHT_INSTALLER_INSTALL_ROOT"] = str(bundle_root / "r")
    modes = ["readiness", "plan"]
    if lifecycle_requested and not lifecycle_blocked:
        modes.extend(["preclean", "install", "repair", "verify", "backup", "restore", "uninstall"])
    if args.gate and not lifecycle_blocked:
        modes.append("gate")
    status = "passed"
    lifecycle_summaries: list[dict[str, object]] = []
    workflow_proof_modes: list[str] = []
    for mode in modes:
        mode_workflow_proof = args.workflow_proof and mode == "install"
        if mode_workflow_proof:
            workflow_proof_modes.append(mode)
        launcher_mode = "uninstall" if mode == "preclean" else mode
        command = launcher_command(
            platform,
            launcher,
            launcher_mode,
            bundle_root,
            staff_mode=args.staff_mode,
            workflow_proof=mode_workflow_proof,
        )
        proc = run(command, cwd=bundle_root, timeout=mode_timeout(launcher_mode), env=launcher_env)
        parsed_output = parse_json_from_output(proc.stdout)
        summary = lifecycle_summary(mode, parsed_output)
        if summary is not None and "ports" in summary:
            lifecycle_summaries.append(summary)
        steps.append(
            {
                "mode": mode,
                "command": command,
                "returncode": proc.returncode,
                "stdout": proc.stdout[-8000:],
                "stderr": proc.stderr[-8000:],
            }
        )
        if proc.returncode != 0:
            status = "failed"
            if mode in {"install", "repair", "verify", "backup", "restore", "gate"}:
                cleanup_command = launcher_command(platform, launcher, "uninstall", bundle_root)
                cleanup = run(cleanup_command, cwd=bundle_root, timeout=900, env=launcher_env)
                steps.append(
                    {
                        "mode": "cleanup_after_failure",
                        "command": cleanup_command,
                        "returncode": cleanup.returncode,
                        "stdout": cleanup.stdout[-8000:],
                        "stderr": cleanup.stderr[-8000:],
                    }
                )
            break
    if lifecycle_blocked:
        status = "blocked"
        steps.append(
            {
                "mode": "lifecycle_blocked",
                "returncode": 2,
                "stdout": "",
                "stderr": (
                    f"Lifecycle certification for {platform} requires a matching host. "
                    f"Current host is {host_platform} ({sys.platform})."
                ),
            }
        )

    dependency_gate = dependency_gate_message(steps) if status == "failed" else None
    if dependency_gate:
        status = "blocked"

    classification = classify_evidence(
        platform=platform,
        host_platform=host_platform,
        skip_install=args.skip_install,
        status=status,
        lifecycle_blocked=lifecycle_blocked,
        dependency_gate_blocked=dependency_gate is not None,
    )

    retained_evidence = retain_lifecycle_evidence(bundle_root, report_dir)

    cleanup_error: str | None = None
    extracted_bundle_retained = False
    if extract_root.exists():
        try:
            remove_tree_with_retry(extract_root)
        except OSError as exc:
            cleanup_error = str(exc)
            extracted_bundle_retained = True

    proof = {
        "run_id": run_id,
        "archive": str(archive),
        "platform": platform,
        "host_platform": sys.platform,
        "normalized_host_platform": host_platform,
        "host_platform_matches_target": host_platform_matches_target,
        "bundle_root": str(bundle_root),
        "extracted_bundle_retained": extracted_bundle_retained,
        "status": status,
        "mutates_host": lifecycle_requested and not lifecycle_blocked,
        "requested_mutating_lifecycle": lifecycle_requested,
        "workflow_proof_requested": args.workflow_proof,
        "workflow_proof_modes": workflow_proof_modes,
        "townlight_meetings_staff_mode": args.staff_mode,
        "dependency_gate": {
            "blocked": dependency_gate is not None,
            "message": dependency_gate,
            "allowed_ci_pass": classification == "dependency_gate_blocked",
        },
        "lifecycle_isolation": {
            "run_id": run_id,
            "environment": {
                "TOWNLIGHT_INSTALLER_RUN_ID": run_id,
                "TOWNLIGHT_INSTALLER_INSTALL_ROOT": launcher_env.get("TOWNLIGHT_INSTALLER_INSTALL_ROOT"),
            },
            "resolved_modes": lifecycle_summaries,
        },
        "evidence_classification": classification,
        "certification_scope": certification_scope(classification),
        "cleanroom_hygiene": hygiene,
        "retained_lifecycle_evidence": retained_evidence,
        "steps": steps,
    }
    if cleanup_error:
        proof["cleanup_error"] = cleanup_error
    report_dir.mkdir(parents=True, exist_ok=True)
    (report_dir / "installer-package-cleanroom.json").write_text(
        json.dumps(proof, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    print(json.dumps(proof, indent=2, sort_keys=True))
    return 0 if status == "passed" or classification == "dependency_gate_blocked" else 1


if __name__ == "__main__":
    raise SystemExit(main())
