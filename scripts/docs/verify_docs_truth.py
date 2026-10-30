#!/usr/bin/env python3
"""Focused docs truth checks for the city-core docs cleanup slice."""
from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

FAQ = ROOT / "FAQ.md"

FORBIDDEN = re.compile(
    r"public-use|city-ready|procurement-ready|procurement readiness|production-ready|"
    r"production readiness|macOS lifecycle certified|macOS lifecycle certification|full-suite release",
    re.IGNORECASE,
)
NEGATION = re.compile(r"\b(not|no|never|without|blocked|forbidden|do not|does not|must not|out of scope|until)\b", re.IGNORECASE)


def check_faq_forbidden_context() -> list[str]:
    errors: list[str] = []
    lines = FAQ.read_text(encoding="utf-8").splitlines()
    for number, line in enumerate(lines, 1):
        if not FORBIDDEN.search(line):
            continue
        window = " ".join(lines[max(0, number - 2): number + 1])
        if not NEGATION.search(window):
            errors.append(f"FAQ.md:{number}: forbidden claim lacks negation context: {line}")
    return errors


def check_civicaccess_not_public_path() -> list[str]:
    text = FAQ.read_text(encoding="utf-8")
    patterns = [
        r"CivicAccess[^\n]{0,120}public-use",
        r"public-use[^\n]{0,120}CivicAccess",
        r"CivicAccess\s+v1\.0\.0",
    ]
    errors: list[str] = []
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            errors.append(f"FAQ.md: CivicAccess appears in public-use/repaired-v1 framing: {match.group(0)}")
    return errors


def check_topology() -> list[str]:
    result = subprocess.run(
        [sys.executable, str(ROOT / "scripts" / "docs" / "render_topology.py"), "--check"],
        cwd=ROOT,
        text=True,
        capture_output=True,
    )
    if result.returncode == 0:
        return []
    detail = (result.stdout + result.stderr).strip()
    return [detail or "USER-MANUAL.md topology block is stale"]


def main() -> int:
    errors: list[str] = []
    errors.extend(check_faq_forbidden_context())
    errors.extend(check_civicaccess_not_public_path())
    errors.extend(check_topology())
    for filename in ("USER-MANUAL.md", "USER-MANUAL.txt"):
        manual = (ROOT / filename).read_text(encoding="utf-8")
        for value in ("Townlight Beta 1", "1.6.0.1", "1.3.0.dev1", "1.8.0.dev1", "Station", "AGPL"):
            if value not in manual:
                errors.append(f"{filename}: missing accepted beta identity {value}")
    for filename in ("docs/beta-1/pdf/Townlight-Suite-Manual-Beta-1.pdf", "docs/beta-1/docx/Townlight-Suite-Manual-Beta-1.docx", "release/BETA-1-PROVENANCE.json"):
        if not (ROOT / filename).is_file():
            errors.append(f"Missing accepted beta artifact: {filename}")

    if errors:
        print("FAIL: docs truth checks failed")
        for error in errors:
            print(f"  - {error}")
        return 1
    print("PASS: docs truth checks passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
