#!/usr/bin/env bash
# verify-docs.sh â€” townlight umbrella docs sanity check
# 1) Required artifacts exist
# 2) No stale current-facing strings (CHANGELOG history exempt)
# Exits 1 on first failure; prints PASS at the end.
set -u
fail=0

REQUIRED=(
  README.md
  README.txt
  USER-MANUAL.md
  USER-MANUAL.txt
  CHANGELOG.md
  STATUS.md
  FAQ.md
  ARCHITECTURE.md
  CONTRIBUTING.md
  LICENSE
  SECURITY.md
  CODE_OF_CONDUCT.md
  SUPPORT.md
  .gitignore
  docs/index.html
  docs/troubleshooting.md
  docs/release-recovery-status.md
  docs/release-lockstep/downstream-pins.md
  docs/compatibility/index.md
  docs/deployment/local-demo-profile.md
  docs/installer/suite-installer-plan.md
  docs/installer/installer-checkpoint-2026-05-09.md
  docs/installer/starter-set-outside-test-guide.md
  docs/installer/starter-set-public-use-readiness-gate.md
  docs/installer/clerk-core-public-use-release-gate-audit-2026-05-21.md
  docs/ux/shared-shell-inventory.md
  docs/architecture/ADR-0004-shared-shell-boundaries.md
  docs/connectors/import-export-template.md
  docs/architecture/ADR-0005-connector-import-export-boundaries.md
  docs/townlight_core/v0.3-extraction-proposal.md
  docs/architecture/ADR-0006-townlight_core-v0-3-extraction-scope.md
  docs/roadmap/townlight_meetings-production-depth-workflow.md
  docs/architecture/ADR-0007-first-production-depth-workflow.md
  docs/github-discussions-seed.md
  scripts/verify-deployment-profile.py
  scripts/verify-installer-plan.py
  scripts/plan-installer.py
  scripts/verify-suite-state.py
  scripts/verify-release-lockstep.py
  .github/workflows/release-lockstep-gate.yml
  .github/PULL_REQUEST_TEMPLATE.md
  .github/ISSUE_TEMPLATE/bug_report.md
  .github/ISSUE_TEMPLATE/feature_request.md
  .github/ISSUE_TEMPLATE/documentation.md
)

echo "==> Required-artifact check"
for f in "${REQUIRED[@]}"; do
  if [ ! -f "$f" ]; then
    echo "  MISSING: $f"
    fail=1
  fi
done

echo "==> Stale current-facing strings check (CHANGELOG, ADRs, SUPERVISOR.md, compatibility history exempt)"
# Flag stale current-facing strings after the records-ai transfer.
PATTERN='Phase 0 scaffold|townlight_core[^,]{0,30}0\.1\.0|github\.com/scottconverse/townlight_records|scottconverse/townlight_records|will transfer|transfer has not happened|transfer hasn'\''t happened|0\.1\.0\.dev0|0\.1\.1\.dev0|~=0\.2|==0\.2\.0 for current foundation|future modules not created yet|Five additional modules|v0\.1\.0 foundation lane|Status: shipping v0\.1\.0 foundation|Status: shipping v0\.1\.0 runtime foundation|Shipping v0\.1\.0</span>'
HITS=$(grep -rn -E "$PATTERN" README.md USER-MANUAL.md docs/ \
       --include='*.md' --include='*.html' 2>/dev/null \
       | grep -vE 'CHANGELOG|docs/architecture/ADR-|docs/SUPERVISOR\.md|docs/compatibility/index\.md|docs/github-discussions-seed\.md|docs/governance/townlight_records-org-transfer-runbook\.md' \
       || true)
if [ -n "$HITS" ]; then
  echo "  STALE STRINGS FOUND:"
  echo "$HITS" | sed 's/^/    /'
  fail=1
fi

echo "==> Release-recovery overclaim check"
OVERCLAIM_PATTERN='positioned as production-usable|flagship shipping product|developer-finished|clear second-product candidate|productizing second-product candidate|Browser QA passed|browser QA passed|React staff workspace and public portal'
OVERCLAIM_HITS=$(grep -rn -E "$OVERCLAIM_PATTERN" README.md USER-MANUAL.md docs/ \
       --include='*.md' --include='*.html' 2>/dev/null \
       | grep -vE 'CHANGELOG|docs/architecture/ADR-|docs/compatibility/index\.md|docs/release-recovery-status\.md|docs/governance/townlight_records-org-transfer-runbook\.md' \
       || true)
if [ -n "$OVERCLAIM_HITS" ]; then
  echo "  OVERCLAIM STRINGS FOUND:"
  echo "$OVERCLAIM_HITS" | sed 's/^/    /'
  fail=1
fi

echo "==> Clerk-core public-use overclaim check"
PUBLIC_USE_HITS=$(python3 - <<'PY'
from __future__ import annotations

import pathlib
import re

ROOT = pathlib.Path.cwd()
FILES = [
    ROOT / "README.md",
    ROOT / "README.txt",
    ROOT / "USER-MANUAL.md",
    ROOT / "USER-MANUAL.txt",
    ROOT / "STATUS.md",
    ROOT / "FAQ.md",
    ROOT / "docs",
]
EXCLUDE_PARTS = {
    "CHANGELOG.md",
    "compatibility",
    "release-recovery-status.md",
    "github-discussions-seed.md",
    "governance",
    "audits",
}
PHRASES = re.compile(
    r"(?:is|are|now|status:)\s+(?:a\s+)?(?:public-use ready|city-ready|"
    r"production-ready|procurement-ready|public-use release)|"
    r"(?:public-use|city|production|procurement)-ready release|"
    r"full-suite release|live cross-module(?: records)? exchange|"
    r"macos lifecycle certification (?:passed|complete|certified)",
    re.IGNORECASE,
)
NEGATIONS = (
    "not ",
    "no ",
    "does not",
    "do not",
    "must not",
    "without",
    "avoid",
    "blocked",
    "forbidden",
    "outside scope",
    "outside-test",
    "until",
    "remains",
    "deferred",
    "difference between",
    "halt trigger",
    "halt triggers",
    "allowed current claim",
    "forbidden claims",
)

def iter_paths() -> list[pathlib.Path]:
    paths: list[pathlib.Path] = []
    for item in FILES:
        if item.is_file():
            paths.append(item)
        elif item.is_dir():
            paths.extend(
                p
                for p in item.rglob("*")
                if p.suffix.lower() in {".md", ".html"}
                and not any(part in EXCLUDE_PARTS for part in p.parts)
            )
    return sorted(set(paths))

for path in iter_paths():
    rel = path.relative_to(ROOT)
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except UnicodeDecodeError:
        continue
    for number, line in enumerate(lines, 1):
        if not PHRASES.search(line):
            continue
        context = "\n".join(lines[max(0, number - 4):number])
        lowered = context.lower()
        if any(token in lowered for token in NEGATIONS):
            continue
        print(f"{rel}:{number}: {line}")
PY
)
PUBLIC_USE_STATUS=$?
if [ $PUBLIC_USE_STATUS -ne 0 ]; then
  echo "  PUBLIC-USE OVERCLAIM CHECK FAILED TO RUN"
  fail=1
fi
if [ -n "$PUBLIC_USE_HITS" ]; then
  echo "  PUBLIC-USE OVERCLAIM STRINGS FOUND:"
  echo "$PUBLIC_USE_HITS" | sed 's/^/    /'
  fail=1
fi

echo "==> City-core docs truth check"
if ! python3 scripts/docs/verify_docs_truth.py; then
  fail=1
fi

if [ $fail -ne 0 ]; then
  echo "FAIL"
  exit 1
fi
echo "PASS"
