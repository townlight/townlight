#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Policy: executive audit head stamps must match the current git HEAD.

The check is enforced when explicitly requested with
``--require-consistency`` or when the current pull request carries the
``release-tag`` label. It scans executive reports under ``audit-full`` and
``audit-team-claude`` directories and compares their ``Audited head:`` line to
``git rev-parse HEAD``.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

AUDIT_DIR_NAMES = {"audit-full", "audit-team-claude"}
EXECUTIVE_REPORT_NAME = "00-executive-audit.md"
AUDITED_HEAD_RE = re.compile(
    r"^\s*(?:\*\*)?Audited head\s*:\s*(?:\*\*)?\s*`?([0-9a-fA-F]{7,40})`?",
    re.IGNORECASE,
)


@dataclass(frozen=True)
class AuditHeadFinding:
    path: str
    line: int
    message: str


def _repo_root() -> Path:
    result = subprocess.run(
        ["git", "rev-parse", "--show-toplevel"],
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode == 0 and result.stdout.strip():
        return Path(result.stdout.strip()).resolve()
    return Path.cwd().resolve()


def _current_head(repo_root: Path) -> str:
    result = subprocess.run(
        ["git", "rev-parse", "HEAD"],
        cwd=repo_root,
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0 or not result.stdout.strip():
        detail = (result.stderr or result.stdout or "unknown git error").strip()
        raise RuntimeError(f"cannot read current git HEAD: {detail}")
    return result.stdout.strip().lower()


def _iter_executive_reports(paths: Iterable[str | Path]) -> list[Path]:
    reports: list[Path] = []
    for raw_path in paths:
        path = Path(raw_path)
        if path.is_file() and path.name == EXECUTIVE_REPORT_NAME:
            reports.append(path)
            continue
        if not path.is_dir():
            continue
        for child in sorted(path.rglob(EXECUTIVE_REPORT_NAME)):
            if child.parent.name in AUDIT_DIR_NAMES:
                reports.append(child)
    return sorted(set(reports))


def _extract_audited_heads(path: Path) -> list[tuple[int, str]]:
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except UnicodeDecodeError:
        return []
    heads: list[tuple[int, str]] = []
    for line_number, line in enumerate(lines, start=1):
        match = AUDITED_HEAD_RE.match(line)
        if match:
            heads.append((line_number, match.group(1).lower()))
    return heads


def scan_audit_head_consistency(
    paths: Iterable[str | Path], current_head: str
) -> list[AuditHeadFinding]:
    """Return findings for executive audit reports whose head stamp drifted."""
    findings: list[AuditHeadFinding] = []
    normalized_head = current_head.lower()
    for report in _iter_executive_reports(paths):
        audited_heads = _extract_audited_heads(report)
        if not audited_heads:
            findings.append(
                AuditHeadFinding(
                    path=str(report),
                    line=1,
                    message="Executive audit report is missing an 'Audited head:' line.",
                )
            )
            continue
        for line_number, audited_head in audited_heads:
            if len(audited_head) != 40:
                findings.append(
                    AuditHeadFinding(
                        path=str(report),
                        line=line_number,
                        message=(
                            "Audited head must be the full 40-character git SHA "
                            f"for current HEAD {normalized_head}."
                        ),
                    )
                )
                continue
            if audited_head != normalized_head:
                findings.append(
                    AuditHeadFinding(
                        path=str(report),
                        line=line_number,
                        message=(
                            f"Audited head {audited_head} does not match current "
                            f"HEAD {normalized_head}."
                        ),
                    )
                )
    return findings


def _event_has_release_tag(event_path: str | None) -> bool:
    if not event_path:
        return False
    try:
        event = json.loads(Path(event_path).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return False
    pull_request = event.get("pull_request")
    if not isinstance(pull_request, dict):
        return False
    labels = pull_request.get("labels") or []
    return any(isinstance(label, dict) and label.get("name") == "release-tag" for label in labels)


def _gh_pr_has_release_tag(repo_root: Path) -> bool:
    result = subprocess.run(
        ["gh", "pr", "view", "--json", "labels"],
        cwd=repo_root,
        capture_output=True,
        text=True,
        check=False,
        timeout=10,
    )
    if result.returncode != 0 or not result.stdout.strip():
        return False
    try:
        data = json.loads(result.stdout)
    except json.JSONDecodeError:
        return False
    labels = data.get("labels") or []
    return any(isinstance(label, dict) and label.get("name") == "release-tag" for label in labels)


def _release_tag_pr_detected(repo_root: Path) -> bool:
    forced = os.environ.get("CIVICSUITE_RELEASE_TAG_PR", "").strip().lower()
    if forced in {"1", "true", "yes"}:
        return True
    if forced in {"0", "false", "no"}:
        return False
    if _event_has_release_tag(os.environ.get("GITHUB_EVENT_PATH")):
        return True
    return _gh_pr_has_release_tag(repo_root)


def _default_paths(repo_root: Path) -> list[Path]:
    runs = repo_root / ".agent-runs"
    return [runs] if runs.exists() else []


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "paths",
        nargs="*",
        help="Files or directories to scan. Defaults to .agent-runs/ when present.",
    )
    parser.add_argument(
        "--require-consistency",
        action="store_true",
        help="Enforce the check even when the current PR is not detected as release-tag.",
    )
    parser.add_argument("--run", help="Limit default scan to .agent-runs/<run>.")
    parser.add_argument("--head", help="Override current git HEAD for tests or replay.")
    args = parser.parse_args()

    repo_root = _repo_root()
    active = args.require_consistency or _release_tag_pr_detected(repo_root)
    if args.paths:
        paths = [Path(path) for path in args.paths]
    elif args.run:
        run_path = repo_root / ".agent-runs" / args.run
        paths = [run_path] if run_path.exists() else []
    else:
        paths = _default_paths(repo_root)

    if not active:
        print(
            "check_audit_head_consistency: SKIP - current PR is not detected as release-tag; "
            "use --require-consistency to enforce."
        )
        return 0

    try:
        current_head = (args.head or _current_head(repo_root)).lower()
    except RuntimeError as exc:
        print(f"check_audit_head_consistency: FAIL - {exc}")
        return 1

    reports = _iter_executive_reports(paths)
    findings = scan_audit_head_consistency(paths, current_head)
    if findings:
        print("check_audit_head_consistency: FAIL")
        for finding in findings:
            print(f"  {finding.path}:{finding.line}: {finding.message}")
        return 1

    print(
        "check_audit_head_consistency: PASS - "
        f"scanned {len(reports)} executive audit report(s)."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
