#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Policy: live, real-wire, and integration test names must match mechanics."""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path
from typing import Iterable

CLAIM_MARKERS = ("_live_", "_real_wire_", "_integration_")
PATCH_CALL_RE = re.compile(r"\bmonkeypatch\.setattr\s*\(")
WORD_RE = re.compile(r"[a-z0-9]+")
GENERIC_WORDS = {
    "async",
    "case",
    "e2e",
    "for",
    "integration",
    "live",
    "real",
    "test",
    "tests",
    "unit",
    "wire",
}
MESSAGE = (
    "Live/real-wire/integration test filename monkeypatches the named boundary; "
    "rename it as unit/shape coverage or exercise the real boundary."
)


def _iter_python_files(paths: Iterable[str | Path]) -> list[Path]:
    files: list[Path] = []
    for raw_path in paths:
        path = Path(raw_path)
        if path.is_dir():
            files.extend(child for child in sorted(path.rglob("test*.py")) if child.is_file())
        elif path.is_file() and path.suffix == ".py":
            files.append(path)
    return files


def _claimed_boundary_words(path: Path) -> set[str]:
    stem = path.stem.lower()
    if not any(marker in stem for marker in CLAIM_MARKERS):
        return set()
    return {word for word in WORD_RE.findall(stem) if word not in GENERIC_WORDS}


def _line_words(line: str) -> set[str]:
    return {word for word in WORD_RE.findall(line.lower()) if word not in GENERIC_WORDS}


def _monkeypatches_named_boundary(line: str, boundary_words: set[str]) -> bool:
    if not PATCH_CALL_RE.search(line):
        return False
    overlap = boundary_words & _line_words(line)
    return len(overlap) >= 2


def scan_test_naming_honesty(paths: Iterable[str | Path]) -> list[dict[str, object]]:
    """Return findings for live/real-wire tests that mock their named boundary."""
    findings: list[dict[str, object]] = []
    for path in _iter_python_files(paths):
        boundary_words = _claimed_boundary_words(path)
        if not boundary_words:
            continue
        try:
            lines = path.read_text(encoding="utf-8").splitlines()
        except UnicodeDecodeError:
            continue
        for line_number, line in enumerate(lines, start=1):
            if _monkeypatches_named_boundary(line, boundary_words):
                findings.append({"path": str(path), "line": line_number, "message": MESSAGE})
    return findings


def _default_paths() -> list[Path]:
    root = Path.cwd()
    return [path for path in (root / "tests", root / "scripts") if path.exists()]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "paths",
        nargs="*",
        help="Files or directories to scan. Defaults to tests/ and scripts/ when present.",
    )
    args = parser.parse_args()

    paths = [Path(path) for path in args.paths] if args.paths else _default_paths()
    findings = scan_test_naming_honesty(paths)
    if findings:
        print("check_test_naming_honesty: FAIL")
        for finding in findings:
            print(f"  {finding['path']}:{finding['line']}: {finding['message']}")
        return 1

    print(f"check_test_naming_honesty: PASS - scanned {len(_iter_python_files(paths))} file(s).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
