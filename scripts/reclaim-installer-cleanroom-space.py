"""Reclaim disposable installer build inputs before hosted cleanroom lifecycle runs."""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
from datetime import UTC, datetime
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
REPORT_ROOT = ROOT / "installer" / "reports"
REPO_RECLAIM_TARGETS = (
    ROOT / "installer" / "generated",
    ROOT / "modules" / "townlight_records",
    ROOT / "modules" / "townlight_meetings",
    ROOT / "modules" / "townlight_code",
)
HOST_LINUX_RECLAIM_TARGETS = (
    Path("/usr/local/lib/android"),
    Path("/usr/share/dotnet"),
    Path("/usr/share/swift"),
    Path("/opt/ghc"),
    Path("/usr/local/.ghcup"),
    Path("/opt/hostedtoolcache/CodeQL"),
    Path("/opt/hostedtoolcache/Java_Temurin-Hotspot_jdk"),
    Path("/opt/hostedtoolcache/Ruby"),
    Path("/opt/hostedtoolcache/go"),
)


def disk_snapshot() -> dict[str, object]:
    usage = shutil.disk_usage(ROOT)
    return {
        "path": str(ROOT),
        "total_bytes": usage.total,
        "used_bytes": usage.used,
        "free_bytes": usage.free,
    }


def ensure_inside_root(path: Path) -> Path:
    root = ROOT.resolve()
    resolved = path.resolve()
    if not resolved.is_relative_to(root):
        raise RuntimeError(f"Refusing to reclaim path outside repository root: {resolved}")
    return resolved


def path_size(path: Path) -> int:
    if not path.exists():
        return 0
    if path.is_file():
        return path.stat().st_size
    total = 0
    for child in path.rglob("*"):
        try:
            if child.is_file():
                total += child.stat().st_size
        except OSError:
            continue
    return total


def reclaim_target(path: Path) -> dict[str, object]:
    resolved = ensure_inside_root(path)
    evidence: dict[str, object] = {
        "path": str(resolved),
        "relative_path": str(resolved.relative_to(ROOT.resolve())),
        "scope": "repository",
    }
    if not resolved.exists():
        evidence["status"] = "absent"
        evidence["bytes_before"] = 0
        return evidence
    evidence["bytes_before"] = path_size(resolved)
    if resolved.is_dir():
        shutil.rmtree(resolved)
    else:
        resolved.unlink()
    evidence["status"] = "removed"
    evidence["exists_after"] = resolved.exists()
    return evidence


def is_github_hosted_linux() -> bool:
    return (
        os.environ.get("GITHUB_ACTIONS") == "true"
        and os.environ.get("RUNNER_OS") == "Linux"
        and sys.platform.startswith("linux")
    )


def host_target_allowed(path: Path) -> Path:
    resolved = path.resolve()
    allowed = {target.resolve() for target in HOST_LINUX_RECLAIM_TARGETS}
    if resolved not in allowed:
        raise RuntimeError(f"Refusing to reclaim unapproved hosted-runner path: {resolved}")
    return resolved


def tail(value: str, limit: int = 4000) -> str:
    return value[-limit:]


def reclaim_host_target(path: Path) -> dict[str, object]:
    resolved = host_target_allowed(path)
    evidence: dict[str, object] = {
        "path": str(resolved),
        "scope": "github-hosted-linux",
    }
    if not is_github_hosted_linux():
        evidence["status"] = "skipped_not_github_hosted_linux"
        evidence["bytes_before"] = 0
        return evidence
    if not resolved.exists():
        evidence["status"] = "absent"
        evidence["bytes_before"] = 0
        return evidence

    evidence["bytes_before"] = path_size(resolved)
    sudo = shutil.which("sudo")
    rm = shutil.which("rm")
    if not sudo or not rm:
        evidence["status"] = "skipped_missing_cleanup_tool"
        evidence["sudo_found"] = bool(sudo)
        evidence["rm_found"] = bool(rm)
        return evidence

    proc = subprocess.run(
        [sudo, rm, "-rf", "--one-file-system", str(resolved)],
        cwd=ROOT,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False,
        timeout=1800,
    )
    evidence["returncode"] = proc.returncode
    evidence["stdout"] = tail(proc.stdout)
    evidence["stderr"] = tail(proc.stderr)
    evidence["exists_after"] = resolved.exists()
    evidence["status"] = "removed" if proc.returncode == 0 and not resolved.exists() else "failed"
    return evidence


def main() -> int:
    parser = argparse.ArgumentParser(description="Reclaim disposable hosted-runner installer workspace artifacts.")
    parser.add_argument("--run-id", required=True)
    parser.add_argument(
        "--approved",
        action="store_true",
        help="Confirm this cleanup is running in a disposable hosted-runner workspace.",
    )
    args = parser.parse_args()
    if not args.approved:
        print("ERROR: refusing cleanup without --approved", flush=True)
        return 2

    report_dir = REPORT_ROOT / args.run_id
    report_dir.mkdir(parents=True, exist_ok=True)
    before = disk_snapshot()
    repository_targets = [reclaim_target(path) for path in REPO_RECLAIM_TARGETS]
    host_targets = [reclaim_host_target(path) for path in HOST_LINUX_RECLAIM_TARGETS]
    after = disk_snapshot()
    evidence = {
        "run_id": args.run_id,
        "created_at": datetime.now(UTC).isoformat(),
        "status": "passed",
        "purpose": (
            "Remove generated bundle sources after release archives are created so the "
            "hosted cleanroom lifecycle has enough free disk to extract and run the archive."
        ),
        "disk_before": before,
        "disk_after": after,
        "free_bytes_reclaimed": int(after["free_bytes"]) - int(before["free_bytes"]),
        "targets": repository_targets + host_targets,
        "repository_targets": repository_targets,
        "host_targets": host_targets,
    }
    (report_dir / "hosted-runner-workspace-reclaim.json").write_text(
        json.dumps(evidence, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    print(json.dumps(evidence, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
