#!/usr/bin/env python3
"""Token vendored-copy drift gate.

The token authority is the exact Core source pinned below, in the
townlight/core repository (see docs/design/windows-desktop-design-control.md).
Consumers in this repo vendor a copy; this gate fails the build if a vendored
copy drifts from the authority.

Vendored copies checked:
  - docs/tokens.css (consumed by docs/module-explorer.html)

The pin matches the coordinated Windows candidate's Core source. The vendored
copy must match that authority, including its current naming.

Requires: gh CLI authenticated (same requirement as verify-suite-state.py).
Exit 0 = all vendored copies match; 1 = drift or fetch failure.
"""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
AUTHORITY_REPO = "townlight/core"
AUTHORITY_PATH = "townlight_core-ui/tokens/tokens.css"
# Pinned to the coordinated candidate's exact renamed Core source. This makes the gate
# deterministic: it fails only when OUR vendored copy drifts, never because an
# unrelated change landed on townlight_core main. Bump this SHA when re-vendoring.
# TODO: switch to a townlight_core release tag once one ships containing townlight_core-ui/.
AUTHORITY_REF = "3021821bf9a92c790a399ad12aed821d65b09105"
VENDORED = [ROOT / "docs" / "tokens.css"]


def normalize(text: str) -> str:
    return text.replace("\r\n", "\n").rstrip("\n")


def fetch_authority() -> str:
    result = subprocess.run(
        ["gh", "api", f"repos/{AUTHORITY_REPO}/contents/{AUTHORITY_PATH}?ref={AUTHORITY_REF}",
         "-H", "Accept: application/vnd.github.raw+json"],
        capture_output=True, text=True, encoding="utf-8", timeout=60)
    if result.returncode != 0:
        print(f"FAIL: could not fetch authority tokens.css from {AUTHORITY_REPO}: "
              f"{result.stderr.strip()[:200]}")
        sys.exit(1)
    return result.stdout


def main() -> int:
    authority = normalize(fetch_authority())
    failed = False
    for path in VENDORED:
        if not path.exists():
            print(f"FAIL: vendored copy missing: {path.relative_to(ROOT)}")
            failed = True
            continue
        if normalize(path.read_text(encoding="utf-8")) != authority:
            print(f"FAIL: {path.relative_to(ROOT)} drifted from "
                  f"{AUTHORITY_REPO}/{AUTHORITY_PATH} — re-vendor the authority copy")
            failed = True
        else:
            print(f"PASS: {path.relative_to(ROOT)} matches the token authority")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
