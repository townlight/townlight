#!/usr/bin/env python3
"""Token vendored-copy drift gate.

The token authority is townlight_core-ui/tokens/tokens.css in the Townlight/townlight_core
repo (see docs/design/windows-desktop-design-control.md, Token Authority).
Consumers in this repo vendor a copy; this gate fails the build if a vendored
copy drifts from the authority.

Vendored copies checked:
  - docs/tokens.css (consumed by docs/module-explorer.html)

Pinning: compared against townlight_core main HEAD for now. TODO: once townlight_core
cuts a release containing townlight_core-ui/, pin to the townlight_core version the
suite consumes (installer/modules.json source_commit) instead of main.

Requires: gh CLI authenticated (same requirement as verify-suite-state.py).
Exit 0 = all vendored copies match; 1 = drift or fetch failure.
"""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
AUTHORITY_REPO = "Townlight/townlight_core"
AUTHORITY_PATH = "townlight_core-ui/tokens/tokens.css"
# Pinned to the exact townlight_core commit the vendored copy was taken from
# (the PR #66 merge that established townlight_core-ui/tokens/). This makes the gate
# deterministic: it fails only when OUR vendored copy drifts, never because an
# unrelated change landed on townlight_core main. Bump this SHA when re-vendoring.
# TODO: switch to a townlight_core release tag once one ships containing townlight_core-ui/.
AUTHORITY_REF = "78033cc8aa945446d7fb0576a9026d42e2f905d8"
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
