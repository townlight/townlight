#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Policy: workflow-cost evidence must be replayable from a captured ledger."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path


def _repo_root() -> Path:
    return Path.cwd()


def _changed_workflows(root: Path) -> list[Path]:
    import subprocess

    result = subprocess.run(
        ["git", "status", "--short", "--", ".github/workflows"],
        cwd=root,
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        return []
    paths: list[Path] = []
    for line in result.stdout.splitlines():
        raw = line[3:].strip()
        if raw:
            paths.append(root / raw)
    return paths


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run", help="Pipeline run id whose evidence directory contains workflow-cost-ledger.md")
    args = parser.parse_args()

    root = _repo_root()
    changed = _changed_workflows(root)
    if not changed:
        print("check_workflow_cost_ledger: PASS - no workflow changes in working tree.")
        return 0

    if not args.run:
        print("check_workflow_cost_ledger: FAIL - workflow changes require --run and workflow-cost-ledger.md.")
        return 1

    ledger = root / ".agent-runs" / args.run / "workflow-cost-ledger.md"
    if not ledger.is_file():
        print(f"check_workflow_cost_ledger: FAIL - missing {ledger}")
        return 1
    text = ledger.read_text(encoding="utf-8")
    required = ("Captured at:", "Diff base:", "Workflow files:")
    missing = [item for item in required if item not in text]
    if missing:
        print(f"check_workflow_cost_ledger: FAIL - {ledger} missing {', '.join(missing)}")
        return 1

    print(f"check_workflow_cost_ledger: PASS - replay ledger present at {ledger}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
