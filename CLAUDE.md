<a id="civicsuite--project-instructions-for-claude-code"></a>

# Townlight — project instructions for Claude Code

Townlight is an open-source, local-first municipal operations suite. The umbrella repo at `townlight/townlight` holds suite-level documentation, governance, compatibility tracking, the release ladder, and the verification scripts that keep 27 module repos in lockstep. Module products (Townlight Core, Townlight Records, Townlight Meetings, Townlight Zoning, Townlight Code, Townlight Access, and 21+ more) live in sibling repos under the same GitHub org.

Read this file before doing anything. The "Pipeline drafter notes" section is the load-bearing part for `agent-pipeline-claude:run` — it tells the manifest-drafter where everything lives.

## Pipeline drafter notes

When `agent-pipeline-claude:run` produces a manifest for Townlight work, the drafter must pull from these sources (in this order):

1. **`docs/CivicSuiteUnifiedSpec.md`** — canonical product spec. Always cite the relevant section number when the manifest invokes a closed architectural decision, a module's canonical scope, or a non-negotiable.
   - §4 — suite-wide non-negotiables (product / AI / sovereignty / docs+QA principles)
   - §5 — standard module architecture (§5.1 backend, §5.2 frontend, §5.3 AI, §5.4 data+search, §5.5 connectors)
   - §8 Townlight Records, §9 Townlight Meetings, §10 Townlight Zoning, §11 Townlight Code, §12 Townlight Access — canonical scopes
   - §15.4 — accessibility (WCAG 2.2 AA load-bearing)
   - §17 — documentation standard
   - §22 — open and closed decisions

2. **`docs/design/ui-ux-prototype/`** — **canonical UI/UX specification** (interactive React+Babel prototype built by Claude Design). Any manifest touching user-visible code, copy, or layout must:
   - Pull in the relevant `*.jsx` file(s) (e.g., `clerk.jsx` for Townlight Meetings UI work, `records.jsx` for Townlight Records work, `shell.jsx` for app-shell or topbar changes).
   - Cite `styles.css` design tokens (typography: Inter / Source Serif 4 / JetBrains Mono; color tokens like `--paper-2`, `--rule`; spacing scale) when verifying a visual change.
   - Respect the three architectural commitments captured in `docs/design/ui-ux-prototype/README.md`: three surfaces (Staff/Resident/IT-Admin), audit drawer always one click away, ⌘K palette as primary navigation.
   - **If a PR's UI work conflicts with the prototype, the prototype is authoritative.** A design-change PR must update the prototype in the same change set.

3. **`STATUS.md`** — current shipped/recovery truth. The unified spec describes architectural intent; STATUS.md describes what is shipped today. When a manifest depends on a module being at a specific version, verify against STATUS.md and `scripts/verify-suite-state.py --remote-only`.

4. **`.agent-workflows/ACTIVE_WORK_QUEUE.md`** — current target tracking. The active target plus queued targets live here. A manifest claiming to advance the queue must name the queue entry it advances.

5. **`.agent-workflows/HANDOFF_*.md`** — historical handoffs. Read the latest dated handoff at session start. The most recent B2 completion handoff is `HANDOFF_2026-05-12_B2_COMPLETE.md` (B2 closed, Townlight Records v1.6.0, suite-truth reconciled); current release truth has since advanced to Townlight Records v1.6.1.

6. **`docs/adr/`** — architectural decision records. `0001-canonical-decisions-live-in-unified-spec.md` is the bridge document that activates the ADR policy gate while per-decision ADRs are extracted over time.

7. **`scripts/verify-suite-state.py`** — the suite-truth verifier. Any manifest that changes module versions or compatibility claims must run this script as part of its acceptance and paste the output.

8. **Module-specific specs.** For work that lives primarily inside a single sibling repo (Townlight Records, Townlight Meetings, etc.), the module's own `README.md`, `CHANGELOG.md`, and the relevant unified-spec section are sources of truth. Manifests targeting module work must reference both.

## Order of operations

Townlight work flows: **branch from main → produce a manifest that names the target from `ACTIVE_WORK_QUEUE.md` (or a queued target with explicit promotion) → APPROVE in chat → pipeline runs research / plan / execute / verify / drift / critic → manager decision → admin-merge → update `ACTIVE_WORK_QUEUE.md` → close the handoff in `.agent-workflows/`.** No silent scope expansion. Findings dispatch by severity per the §22.5 overflow rule (Blocker stops work; Critical only if it fits; Major queues for next; Minor/Nit collects in `next-cleanup.md`).

## Tooling

- **Python 3.12+** at module level; type hints throughout; strict mypy in service modules.
- **Linter / formatter:** ruff.
- **Tests:** pytest + hypothesis. Coverage targets per spec §5.1.
- **Database:** PostgreSQL 17 + pgvector; migrations via Alembic.
- **Messaging:** NATS JetStream (per closed decision, unified spec §22).
- **AI runtime:** Ollama for LLMs, faster-whisper (CTranslate2) for ASR.
- **Frontend:** React 18 + Vite + TypeScript + Tailwind + shadcn/ui (per unified spec §5.2).
- **Documentation rendering:** MkDocs Material (docs site); Pandoc (USER-MANUAL.pdf / .docx).
- **Commit convention:** Conventional Commits + DCO sign-off (every commit ends with `Signed-off-by: Name <email>`). For Townlight commits, Scott Converse is the primary author. The `Signed-off-by:` trailer credits whoever did the work, for example `Signed-off-by: Codex <codex@openai.com>` when Codex implemented. Do not use a `Co-Authored-By:` trailer; it is not the Townlight convention.
- **Pre-commit hooks:** ruff, mypy, trailing-whitespace, end-of-file-fixer, conventional-commit-message check.
- **License header:** `# SPDX-License-Identifier: Apache-2.0` on every source file; `# Copyright (c) The CivicSuite Authors`.

## Local workspace root

Active Townlight work must use a local, non-cloud-synced workspace root. The current Windows root is:

`C:\dev\Codex`

(The former `C:\dev\Claude` root is historical — `STATUS.md` already records those references as
historical, and the current machine's new-machine handoff provisions repos under `C:\dev\Codex`.)

Do not create, clone, write, branch, commit, push, or run Townlight product workflows from cloud-synced user-profile folders. If evidence or handoff text points at an older cloud-synced workspace path, repair the reference before relying on it for current work.

## Non-negotiables

Read `docs/CivicSuiteUnifiedSpec.md` §4 before any work that touches:

- User-facing surfaces (§4.1) — design every state (loading, success-with-data, empty, error, partial); UI/UX prototype is authoritative.
- AI artifacts (§4.2) — operator-approval-before-publish, refusal-on-uncertainty.
- Prohibited uses (§4.3) — voice cloning, sentiment scoring of named individuals, biometric ID, predictive scoring of residents, retention of resident audio for AI training, covert recording, selling subscriber data. PRs violating §4.3 close without review.
- Documentation artifacts (§4.4) — every release ships with the full doc artifact set.
- Test gates (§4.5).
- Archival behavior (§4.6) — every public-record meeting publishes to portal + IA + local NAS.

The maintainer-level enforcement of §4 is real, not aspirational.

## 5-lens self-audit before every push

Per `docs/process/` standards (PR #125 added this rule), every push that touches code, docs, or status artifacts runs a hostile 5-lens self-audit on the actual diff: Engineering (grep every claim/path/SHA), UX (read every user-visible string cold; respect the UI/UX prototype), Tests (real assertions not just exercise), Docs (CHANGELOG/HANDOFF/spec moved where they should), QA (cross-file consistency, no forbidden status words). Report format goes in the push body.

This rule is the implementation-side counterpart to the cross-agent verification protocol at `C:\dev\Claude\CIVICSUITE_AUDIT_PROTOCOL.md`.
