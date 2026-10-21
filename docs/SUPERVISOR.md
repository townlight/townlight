# SUPERVISOR — CivicSuite Operating Card

For Scott. One page. CivicSuite is the umbrella repo (github.com/CivicSuite org) — suite-wide docs, ADRs, roadmap, governance, and the CivicCore ↔ module compatibility matrix. **It holds no code.** Code lives in `civiccore` and `civicrecords-ai` (and future module repos). Treat this repo as the coordination layer.

---

## 1. Before every session (30 seconds)

Skim in this order:

1. `README.md` — what's here and the entry workflow (paste `CHARTER.md` to a new Claude).
2. `CHARTER.md` — the single source of truth the agent reads first; contains roadmap + governance + bug-routing + compatibility matrix.
3. `CONSISTENCY.md` — the numbers table (27 product modules plus CivicCore, 7 tiers, 6 CivicCore phases, etc.). If a number changed in any spec, this must match.
4. `docs/roadmap/index.md`, `docs/architecture/index.md` (ADR-0001/0002/0003), `docs/governance/index.md` — only if the session touches them.
5. `CHANGELOG.md` `[Unreleased]` — what's already been noted since the last release.

If any number disagrees across those files, stop and flag it before any new work.

---

## 2. During the session — what you actually do

This is coordination work, not implementation. Five concrete actions:

1. **Route the request to the correct repo.** Use the bug-routing tree in `CONTRIBUTING.md` / `CHARTER.md` (shared-platform → `civiccore`; records-lifecycle → `civicrecords-ai`; cross-module/roadmap/ADR/governance → here). If the request is code, redirect — this repo is docs-only.
2. **Keep `CONSISTENCY.md` true.** Any change to a spec number (module count, tier count, phase count, CivicClerk entity/endpoint/page counts, CivicZone counts, etc.) must update `CONSISTENCY.md` in the same commit. This is the anti-drift mechanism for a docs umbrella.
3. **Record cross-module decisions as ADRs.** New file `docs/architecture/ADR-NNNN-short-title.md`, add to the ADR index in `docs/architecture/index.md`, note it in `CHANGELOG.md`. ADRs scoped to a single module live in that module's repo, not here.
4. **Keep the compatibility matrix current.** When `civiccore` or `civicrecords-ai` cuts a release, update the matrix row in `CHARTER.md` (repo, current version, compatible CivicCore range, last verified). Notify downstream module repos if the compatible range changed.
5. **Verify before declaring done.** There is no `verify-release.sh`, no `tests/`, no `scripts/`, no `.claude/` hooks, no `package.json` or `pyproject.toml` in this repo. Verification here = human review of the rendered Markdown + landing page (`docs/index.html`) + a link-and-number audit against `CONSISTENCY.md`. Code tests run in the downstream repos (`civiccore`, `civicrecords-ai`) — link to their CI as evidence if the change implies a downstream change.

---

## 3. Hard rules active on this project

1. **Read before you write** — fires constantly; always read `CHARTER.md` + `CONSISTENCY.md` + target doc before editing.
2. **Run before you declare done** — for a docs repo, "run" means render the Markdown, open `docs/index.html`, and cross-check numbers against `CONSISTENCY.md`.
3. **Tests for logic changes** — mostly N/A; no code here. Downstream changes must land with tests in the downstream repo.
4a. **Never skip tests** — N/A here; enforce it in `civiccore` / `civicrecords-ai` PRs this umbrella references.
4. **No secrets in client code** — zero secrets belong in this repo; no `.env`, no keys, no internal URLs.
5. **Challenge bad requirements** — fires often at the coordination layer; roadmap reshuffles, premature module builds, numbers that don't reconcile, and off-charter asks should be pushed back before they infect the specs.
6. **Work incrementally** — one spec / ADR / matrix row per commit; don't bulk-edit four specs in one pass without a CONSISTENCY.md reconciliation.
7. **No wasteful operations** — don't re-scaffold, don't regenerate whole specs when a section edit suffices.
8. **Stay in scope** — fires constantly; this repo attracts drive-by "while we're here" edits to modules that belong in their own repos.
9. **coder-ui-qa-test Documentation Gate** — 6 artifacts present before any push: `README.md`, `CHANGELOG.md`, `CONTRIBUTING.md`, `LICENSE` (note: `LICENSE` is the AGPL-3.0 code license, with `LICENSE-EXCEPTION.md`, a `LICENSE-CODE` pointer, and `LICENSE-DOCS` for CC BY 4.0 docs), `.gitignore`, `docs/index.html`. All currently present — do not let anyone remove one.
10. **Subagent Obligation** — fires any time a change touches 2+ non-overlapping docs (e.g., update a spec, its CONSISTENCY row, and an ADR). Dispatch parallel subagents for disjoint files. 3rd distinct inline edit is hook-blocked.
11. **Commit-Size Acknowledgment Gate** — >800 lines needs a bracketed token (`[MVP]`, `[LARGE-CHANGE]`, `[REFACTOR]`, `[INITIAL]`, `[MERGE]`, `[REVERT]`, `[SCOPE-EXPANSION: reason]`). The Phase 0 scaffold commit already used this pattern; later multi-spec passes may trigger it too.

---

## 4. Four-pass gate

See `coder-ui-qa-test` skill.

---

## 5. Good session ending — CivicSuite checklist

Finished coordination work looks like this:

- [ ] Edits are confined to this repo. No code files touched. No sibling-repo files touched from here.
- [ ] `CONSISTENCY.md` reconciles: every number cited in any edited spec matches the table; every table row's source reference still resolves.
- [ ] If a spec count changed: `CONSISTENCY.md` + the spec + any ADR that references that number all updated in the same commit.
- [ ] If an ADR was added: file created, listed in `docs/architecture/index.md`, and noted in `CHANGELOG.md` `[Unreleased]`.
- [ ] If the compatibility matrix changed: `CHARTER.md` row updated, and the downstream repo (`civiccore` or `civicrecords-ai`) has been notified — open a tracking issue there if the range changed.
- [ ] `CHANGELOG.md` `[Unreleased]` has an entry for every user-visible doc change.
- [ ] `docs/index.html` landing page still reflects current positioning (check when roadmap or module list changes).
- [ ] No half-done cross-repo state: no edit here that assumes a downstream commit that hasn't landed yet. If it does, call it out explicitly and link the downstream issue/PR.
- [ ] Commit message is scoped (`docs(adr):`, `docs(changelog):`, `docs:`) and the commit follows the existing history style (see `git log --oneline`).
- [ ] Report to Scott: what changed, what's still open, what needs downstream follow-up. Do not push without explicit approval.
