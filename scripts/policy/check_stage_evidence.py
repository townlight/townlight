#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Policy: stage branches must carry durable ledger and audit-lite evidence."""

from __future__ import annotations

import argparse
import os
import re
import subprocess
import sys
from pathlib import Path


STAGE_BRANCH = re.compile(r"^stage-(?P<number>\d+)-")


def _repo_root() -> Path:
    proc = subprocess.run(
        ["git", "rev-parse", "--show-toplevel"],
        capture_output=True,
        text=True,
        check=False,
    )
    if proc.returncode == 0 and proc.stdout.strip():
        return Path(proc.stdout.strip())
    return Path.cwd()


def _current_branch(root: Path) -> str:
    env_branch = os.environ.get("GITHUB_HEAD_REF") or os.environ.get("GITHUB_REF_NAME")
    if env_branch:
        return env_branch.strip()
    proc = subprocess.run(
        ["git", "branch", "--show-current"],
        cwd=root,
        capture_output=True,
        text=True,
        check=False,
    )
    return proc.stdout.strip()


def _git_tracked(root: Path, path: str) -> bool:
    proc = subprocess.run(
        ["git", "ls-files", "--error-unmatch", path],
        cwd=root,
        capture_output=True,
        text=True,
        check=False,
    )
    return proc.returncode == 0


def _tracked_audit_lite_reports(root: Path, stage_number: str) -> list[str]:
    proc = subprocess.run(
        ["git", "ls-files", f"docs/process/audits/audit-lite-stage-{stage_number}-*.md"],
        cwd=root,
        capture_output=True,
        text=True,
        check=False,
    )
    if proc.returncode != 0:
        return []
    return [line.strip() for line in proc.stdout.splitlines() if line.strip()]


def evaluate(branch: str, root: Path) -> list[str]:
    match = STAGE_BRANCH.match(branch)
    if not match:
        return []

    stage_number = match.group("number")
    findings: list[str] = []

    ledger_rel = f"docs/process/stages/{branch}.md"
    ledger = root / ledger_rel
    if not ledger.is_file():
        findings.append(f"missing stage ledger: {ledger}")
    elif not _git_tracked(root, ledger_rel):
        findings.append(f"stage ledger exists but is not tracked: {ledger}")

    reports = _tracked_audit_lite_reports(root, stage_number)
    if not reports:
        findings.append(
            f"missing tracked audit-lite report for stage {stage_number}: docs/process/audits/audit-lite-stage-{stage_number}-*.md"
        )

    if ledger.is_file():
        text = ledger.read_text(encoding="utf-8", errors="replace")
        if "audit-lite-stage-" not in text:
            findings.append(f"stage ledger does not reference audit-lite evidence: {ledger}")
        if "Stage Closeout" not in text:
            findings.append(f"stage ledger is missing a Stage Closeout section: {ledger}")

    return findings


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--branch", help="Branch to check. Defaults to current branch or GitHub head ref.")
    args = parser.parse_args()

    root = _repo_root()
    branch = args.branch or _current_branch(root)
    if not branch:
        print("check_stage_evidence: FAIL - unable to determine branch", file=sys.stderr)
        return 1

    findings = evaluate(branch, root)
    if findings:
        print(f"check_stage_evidence: FAIL for {branch}")
        for finding in findings:
            print(f"  - {finding}")
        return 1

    if STAGE_BRANCH.match(branch):
        print(f"check_stage_evidence: PASS for stage branch {branch}")
    else:
        print(f"check_stage_evidence: PASS - {branch} is not a stage branch")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
