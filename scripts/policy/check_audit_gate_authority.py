#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Policy: reserve "audited" claims for independent audit evidence."""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path
from typing import Iterable

AUDITED_RE = re.compile(r"\baudited\b", re.IGNORECASE)
AUDITED_HEAD_RE = re.compile(r"^\s*(?:\*\*)?Audited head\s*:\s*(?:\*\*)?", re.IGNORECASE)
EVIDENCE_RE = re.compile(r"audit-team-claude", re.IGNORECASE)
MESSAGE = "Use of 'audited' requires an independent audit-team-claude evidence path."
ALLOWLIST_RE = (
    re.compile(r"\baudited UX evidence\b", re.IGNORECASE),
    re.compile(r"\bstable and audited\b", re.IGNORECASE),
    re.compile(r"\bAudited on 20\d\d-\d\d-\d\d\b", re.IGNORECASE),
    re.compile(r"\bAudited live baseline\b", re.IGNORECASE),
    re.compile(r"\bmatrix get audited\b", re.IGNORECASE),
    re.compile(r"\bwill be audited\b", re.IGNORECASE),
    re.compile(r"\bclaim independent audit status\b", re.IGNORECASE),
    re.compile(r"\bnot audited\b", re.IGNORECASE),
    re.compile(r"\baudited read path\b", re.IGNORECASE),
    re.compile(r"\bindependently audited\b", re.IGNORECASE),
)
TEXT_SUFFIXES = {
    ".adoc",
    ".html",
    ".json",
    ".md",
    ".rst",
    ".txt",
    ".yaml",
    ".yml",
}


def _iter_files(paths: Iterable[str | Path]) -> list[Path]:
    files: list[Path] = []
    for raw_path in paths:
        path = Path(raw_path)
        if path.is_dir():
            files.extend(
                child
                for child in sorted(path.rglob("*"))
                if child.is_file() and child.suffix.lower() in TEXT_SUFFIXES
            )
        elif path.is_file():
            files.append(path)
    return files


def _read_text(path: Path) -> str | None:
    try:
        return path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        return None


def _has_independent_evidence_path(path: Path, lines: list[str]) -> bool:
    if EVIDENCE_RE.search(path.as_posix()):
        return True
    for line in lines:
        if not EVIDENCE_RE.search(line):
            continue
        if "/" in line or "\\" in line or ".md" in line:
            return True
    return False


def scan_audited_claims(paths: Iterable[str | Path]) -> list[dict[str, object]]:
    """Return unsupported ``audited`` wording findings for the given files."""
    findings: list[dict[str, object]] = []
    for path in _iter_files(paths):
        text = _read_text(path)
        if text is None:
            continue
        lines = text.splitlines()
        if _has_independent_evidence_path(path, lines):
            continue
        for line_number, line in enumerate(lines, start=1):
            if AUDITED_HEAD_RE.match(line):
                continue
            if any(pattern.search(line) for pattern in ALLOWLIST_RE):
                continue
            if AUDITED_RE.search(line):
                findings.append({"path": str(path), "line": line_number, "message": MESSAGE})
    return findings


def _default_paths() -> list[Path]:
    root = Path.cwd()
    return [path for path in (root / "docs",) if path.exists()]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "paths",
        nargs="*",
        help="Files or directories to scan. Defaults to docs/ and .agent-runs/ when present.",
    )
    args = parser.parse_args()

    paths = [Path(path) for path in args.paths] if args.paths else _default_paths()
    findings = scan_audited_claims(paths)
    if findings:
        print("check_audit_gate_authority: FAIL")
        for finding in findings:
            print(f"  {finding['path']}:{finding['line']}: {finding['message']}")
        return 1

    print(f"check_audit_gate_authority: PASS - scanned {len(_iter_files(paths))} file(s).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
