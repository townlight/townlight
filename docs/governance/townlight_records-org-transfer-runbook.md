# Townlight Records Org Transfer Runbook

Status: ready for execution
Owner: Townlight maintainer
Source repo: `scottconverse/townlight_records`
Target repo: `Townlight/townlight_records`
Prepared: 2026-04-25

## Goal

Move the shipping Townlight Records module into the Townlight GitHub org so every
suite module lives under `Townlight/*`. Preserve history, issues, releases,
tags, discussions, stars, and GitHub redirects by using GitHub's native
repository transfer flow.

## Current GitHub State

- `Townlight/townlight`: exists, public, default branch `main`.
- `Townlight/townlight_core`: exists, public, default branch `main`.
- `Townlight/townlight_records`: does not exist yet.
- `scottconverse/townlight_records`: exists, public, default branch `master`,
  issues enabled, discussions enabled, wiki disabled, not archived.

## Transfer Strategy

Use GitHub repository transfer:

```bash
gh api \
  --method POST \
  repos/scottconverse/townlight_records/transfer \
  -f new_owner=Townlight
```

Do not create a fresh repo and push a mirror unless native transfer fails.
Native transfer is required because it preserves releases, tags, discussions,
issues, PR history, and automatic redirects from the old URL.

## Freeze Window

Before transfer:

1. Ensure no release workflow is running on `scottconverse/townlight_records`.
2. Ensure no PR merge is in progress.
3. Confirm `Townlight/townlight_records` still does not exist.
4. Confirm `scottconverse/townlight_records` default branch is still `master`.
5. Record current latest release and asset URLs.

## Current-Facing URL Rewrite Scope

After transfer, update current-facing references from
`scottconverse/townlight_records` to `Townlight/townlight_records`.

Records-ai current-facing files:

- `README.md`
- `README.txt`
- `USER-MANUAL.md`
- `USER-MANUAL.txt`
- generated `README.docx`, `README.pdf`, `README-FULL.pdf`
- generated `USER-MANUAL.docx`, `USER-MANUAL.pdf`
- `CODE_OF_CONDUCT.md`
- `CONTRIBUTING.md`
- `SECURITY.md`
- `SUPPORT.md`
- `.github/release-notes-preamble.md`
- `docs/index.html`
- `docs/github-discussions-seed.md`
- `docs/UNIFIED-SPEC.md`
- generated `docs/UNIFIED-SPEC.docx`
- generated `docs/TownlightRecordsAI-UnifiedSpec-v3.1.docx`
- generated manuals under `docs/*.html`, `docs/*.docx`, `docs/*.pdf`
- docs generator sources:
  - `backend/scripts/generate_pdf.py`
  - `docs/generate-manual-docx.js`
  - `docs/generate_docx.py`
  - `docs/generate_pdfs.py`

Townlight umbrella current-facing files:

- `README.md`
- `README.txt`
- `USER-MANUAL.md`
- `USER-MANUAL.txt`
- generated `USER-MANUAL.docx`, `USER-MANUAL.pdf`
- `CONTRIBUTING.md`
- `SECURITY.md`
- `SUPPORT.md`
- `.github/ISSUE_TEMPLATE/bug_report.md`
- `.github/PULL_REQUEST_TEMPLATE.md`
- `docs/index.html`
- `docs/compatibility/index.md`
- `docs/github-discussions-seed.md`
- `scripts/verify-docs.sh`

Townlight Core current-facing files:

- `CONTRIBUTING.md`
- `USER-MANUAL.md`
- `USER-MANUAL.txt`

## References To Preserve As Historical

Do not blindly rewrite old release-history or audit-history references. Preserve
old URLs when they are explicitly historical, for example:

- old release-note narratives in `CHANGELOG.md`
- old v1.2.0 installer examples in historical update notices
- archived `.claude/RESUME-*` context files
- old design/audit review documents
- spec text that describes repository state at a prior point in time

If a historical URL appears in a current support, install, security, or landing
surface, rewrite it. If it appears inside a dated release-history paragraph,
leave it unless the paragraph claims to be current.

## Post-Transfer GitHub Checks

Immediately after transfer:

```bash
gh repo view Townlight/townlight_records \
  --json nameWithOwner,visibility,defaultBranchRef,hasIssuesEnabled,hasDiscussionsEnabled,hasWikiEnabled,isArchived,url

gh repo view scottconverse/townlight_records \
  --json nameWithOwner,url
```

Expected:

- `Townlight/townlight_records` exists.
- Visibility remains public.
- Default branch remains `master`.
- Issues remain enabled.
- Discussions remain enabled.
- Wiki remains disabled.
- Old `scottconverse/townlight_records` URL redirects.

## Local Remote Updates

After transfer:

```bash
cd townlight_records
git remote set-url origin https://github.com/Townlight/townlight_records.git
git fetch origin
git status --short --branch
```

Expected:

- Local `master` tracks `origin/master`.
- No uncommitted local work is lost.
- Existing local feature branches remain local.

## Verification Gates

Records-ai:

```bash
python -m ruff check .
bash scripts/verify-release.sh
cd frontend && node node_modules/vitest/dist/cli.js run
```

Townlight:

```bash
python -m ruff check .
bash scripts/verify-docs.sh
```

Townlight Core:

```bash
python -m ruff check .
bash scripts/verify-release.sh
```

Browser QA:

- records-ai landing page renders and links to `Townlight/townlight_records`.
- Townlight landing page links to `Townlight/townlight_records`.
- Townlight Core docs route records-ai issues to `Townlight/townlight_records`.
- Console has zero errors on landing pages.
- Desktop and mobile widths both render correctly.

Release URL checks:

- `https://github.com/Townlight/townlight_records/releases/tag/v1.4.0`
- `https://github.com/Townlight/townlight_records/releases/download/v1.4.0/TownlightRecordsAI-1.4.0-Setup.exe`
- old `scottconverse` release URLs redirect.

## Done Definition

- Native GitHub transfer complete.
- `Townlight/townlight_records` is the canonical repo.
- All current-facing docs in all three repos use `Townlight/townlight_records`.
- Historical references are intentionally preserved and documented.
- Generated PDF/DOCX/TXT artifacts regenerated where source text changed.
- GitHub Actions green in records-ai after transfer.
- `verify-release.sh` passes in records-ai and townlight_core.
- `verify-docs.sh` passes in townlight.
- Browser QA passes for all landing pages.
- Compatibility matrix updated.
- No Phase 3 or new-module code started in the same batch.
