"""Lightweight secret-pattern scan for the Townlight umbrella repo.

This is not a replacement for a dedicated scanner such as gitleaks in product
repos. It is a zero-dependency CI ratchet for the umbrella docs/scripts repo.
"""

from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

EXCLUDED_DIRS = {
    ".git",
    ".pytest_cache",
    ".ruff_cache",
    "__pycache__",
    "audit-browser-qa",
    ".venv",
    "reports",
    "test-results",
}

EXCLUDED_SUFFIXES = {
    ".docx",
    ".pdf",
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".svg",
    ".ico",
}

ALLOWLIST = {
    "${{ github.token }}",
    "mock-client-secret-not-reported",
    "No secrets in client code",
}

PATTERNS = [
    re.compile(r"-----BEGIN (?:RSA |OPENSSH |EC |DSA |)PRIVATE KEY-----"),
    re.compile(r"ghp_[A-Za-z0-9_]{20,}"),
    re.compile(r"github_pat_[A-Za-z0-9_]{20,}"),
    re.compile(r"sk-[A-Za-z0-9]{20,}"),
    re.compile(r"(?i)(api[_-]?key|client[_-]?secret|password|token)\s*=\s*['\"][^'\"\s]{12,}['\"]"),
]


def should_scan(path: Path) -> bool:
    if path.suffix.lower() in EXCLUDED_SUFFIXES:
        return False
    return not any(part in EXCLUDED_DIRS for part in path.relative_to(ROOT).parts)


def candidate_paths() -> list[Path]:
    """Return tracked and non-ignored untracked files, including pre-commit additions."""
    result = subprocess.run(
        [
            "git",
            "-c",
            f"safe.directory={ROOT.as_posix()}",
            "ls-files",
            "--cached",
            "--others",
            "--exclude-standard",
            "-z",
        ],
        cwd=ROOT,
        check=False,
        capture_output=True,
    )
    if result.returncode != 0:
        detail = result.stderr.decode("utf-8", errors="replace").strip()
        raise RuntimeError(f"git ls-files failed: {detail or 'unknown error'}")
    return [
        ROOT / raw_path.decode("utf-8", errors="surrogateescape")
        for raw_path in result.stdout.split(b"\0")
        if raw_path
    ]


def main() -> int:
    findings: list[str] = []
    try:
        paths = candidate_paths()
    except RuntimeError as error:
        print(f"VERIFY-SECRET-SCAN: FAILED\n  {error}")
        return 1
    for path in paths:
        if not path.is_file() or not should_scan(path):
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        for line_no, line in enumerate(text.splitlines(), start=1):
            if any(allowed in line for allowed in ALLOWLIST):
                continue
            if any(pattern.search(line) for pattern in PATTERNS):
                rel = path.relative_to(ROOT).as_posix()
                findings.append(f"{rel}:{line_no}: possible secret pattern")

    if findings:
        print("VERIFY-SECRET-SCAN: FAILED")
        for finding in findings:
            print(f"  {finding}")
        return 1

    print("VERIFY-SECRET-SCAN: PASSED")
    return 0


if __name__ == "__main__":
    sys.exit(main())
