#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Policy: generated USER-MANUAL PDF and DOCX must be current with markdown."""

from __future__ import annotations

import sys
from pathlib import Path


def main() -> int:
    root = Path.cwd()
    markdown = root / "USER-MANUAL.md"
    artifacts = [root / "USER-MANUAL.pdf", root / "USER-MANUAL.docx"]
    if not markdown.is_file():
        print(f"check_user_manual_artifacts: FAIL - missing {markdown}")
        return 1
    missing = [path for path in artifacts if not path.is_file()]
    if missing:
        print("check_user_manual_artifacts: FAIL")
        for path in missing:
            print(f"  missing {path}")
        return 1
    markdown_mtime = markdown.stat().st_mtime
    stale = [path for path in artifacts if path.stat().st_mtime < markdown_mtime]
    if stale:
        print("check_user_manual_artifacts: FAIL")
        for path in stale:
            print(f"  {path} is older than {markdown}")
        print("  Fix: run python scripts/gen-user-manual.py")
        return 1
    print("check_user_manual_artifacts: PASS - PDF and DOCX are current.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
