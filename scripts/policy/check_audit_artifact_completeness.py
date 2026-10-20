#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Policy: independent audit-team artifacts must be complete enough to gate release."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

REQUIRED_FILES = (
    "00-executive-audit.md",
    "01-engineering-deepdive.md",
    "02-uiux-deepdive.md",
    "03-documentation-deepdive.md",
    "04-test-deepdive.md",
    "05-qa-deepdive.md",
    "sprint-punchlist.md",
    "next-sprint-watchlist.md",
)
MIN_DEEPDIVE_BYTES = 4096


def _default_dirs() -> list[Path]:
    root = Path.cwd()
    runs = root / ".agent-runs"
    if not runs.exists():
        return []
    return [path for path in runs.rglob("audit-team-claude") if path.is_dir()]


def scan_audit_dirs(paths: list[Path]) -> list[str]:
    findings: list[str] = []
    for audit_dir in paths:
        for name in REQUIRED_FILES:
            path = audit_dir / name
            if not path.is_file():
                findings.append(f"{path}: missing required independent-audit artifact")
                continue
            if "deepdive" in name and path.stat().st_size < MIN_DEEPDIVE_BYTES:
                findings.append(
                    f"{path}: role deepdive is {path.stat().st_size} bytes; minimum is {MIN_DEEPDIVE_BYTES}"
                )
    return findings


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("paths", nargs="*", help="audit-team-claude directories to scan")
    args = parser.parse_args()

    paths = [Path(path) for path in args.paths] if args.paths else _default_dirs()
    findings = scan_audit_dirs(paths)
    if findings:
        print("check_audit_artifact_completeness: FAIL")
        for finding in findings:
            print(f"  {finding}")
        return 1

    print(f"check_audit_artifact_completeness: PASS - scanned {len(paths)} audit-team package(s).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
