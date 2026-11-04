"""Fail release-tag PRs that do not update the whole release truth surface."""

from __future__ import annotations

import os
import subprocess
import sys


REQUIRED_PATHS = (
    "docs/TownlightUnifiedSpec.md",
    "docs/release-recovery-status.md",
    "scripts/verify-suite-state.py",
    "installer/modules.json",
    "CHANGELOG.md",
)
DOWNSTREAM_RECORD = "docs/release-lockstep/downstream-pins.md"


def changed_files(base_ref: str) -> set[str]:
    base = f"origin/{base_ref}"
    subprocess.run(["git", "fetch", "origin", base_ref, "--depth=1"], check=False)
    proc = subprocess.run(
        ["git", "diff", "--name-only", f"{base}...HEAD"],
        check=False,
        text=True,
        capture_output=True,
    )
    if proc.returncode != 0:
        print(proc.stderr or proc.stdout, file=sys.stderr)
        raise SystemExit(proc.returncode)
    changed = {line.strip().replace("\\", "/") for line in proc.stdout.splitlines() if line.strip()}
    if not os.environ.get("GITHUB_ACTIONS"):
        worktree = subprocess.run(
            ["git", "diff", "--name-only"],
            check=False,
            text=True,
            capture_output=True,
        )
        if worktree.returncode == 0:
            changed.update(
                line.strip().replace("\\", "/")
                for line in worktree.stdout.splitlines()
                if line.strip()
            )
        untracked = subprocess.run(
            ["git", "ls-files", "--others", "--exclude-standard"],
            check=False,
            text=True,
            capture_output=True,
        )
        if untracked.returncode == 0:
            changed.update(
                line.strip().replace("\\", "/")
                for line in untracked.stdout.splitlines()
                if line.strip()
            )
    return changed


def main() -> int:
    base_ref = os.environ.get("GITHUB_BASE_REF") or os.environ.get("BASE_REF") or "main"
    changed = changed_files(base_ref)
    missing = [path for path in REQUIRED_PATHS if path not in changed]
    downstream_pin_touched = any(path.endswith("/pyproject.toml") for path in changed)
    downstream_record_touched = DOWNSTREAM_RECORD in changed

    if missing or not (downstream_pin_touched or downstream_record_touched):
        print("RELEASE-LOCKSTEP-GATE: FAILED")
        if missing:
            print("Missing required umbrella truth artifacts:")
            for path in missing:
                print(f"- {path}")
        if not (downstream_pin_touched or downstream_record_touched):
            print(f"- downstream module pyproject.toml pin/version change or {DOWNSTREAM_RECORD}")
        return 1

    print("RELEASE-LOCKSTEP-GATE: PASSED")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
