<a id="civicsuite-voice-standard"></a>

# Townlight voice standard

> **Targets** `docs/design/` in the umbrella repo, alongside
> `windows-desktop-design-control.md` and `civicsuite-ui-patterns.md`. This is
> the writing counterpart to the token authority: it governs the **words** on
> every visitor-facing surface. Drafted from the 2026-07-03 visitor audit (77
> findings) against the post-#231 cleaned baseline.
>
> **Division of labor:** this doc defines the rules; CI enforces them. Section 6
> is the machine-checkable summary the gate implements. When a rule below says
> `[GATE]`, it is enforceable and belongs in the check.

The audit's largest defect class was not visual — it was language: internal
jargon on public pages, developer/agent leakage, warnings placed where positive
claims belong, and drift between surfaces. The suite's whole pitch is honesty and
sovereignty; the writing has to read that way to a first-time city clerk, not to
the team that built it.

---

## 1. Audiences and the two-voice pattern

Every visitor-facing surface serves one or both of two readers. Keep them in
separate, labeled blocks — never blend registers in one paragraph.

| Voice | Reader | Assumes | Register |
|---|---|---|---|
| **Plain** | Clerk, city manager, elected official, procurement | No IT department, no CS background | Short sentences, no acronyms on first use, "your records / your computer" |
| **Technical** | City IT, security evaluator | Reads a stack, verifies a hash | Precise, exact versions and hashes, still no *internal* jargon |

**Rules**
- The landing page, README top, STATUS.md, FAQ, and USER-MANUAL lead with the
  **Plain** voice. Technical detail goes in a labeled "For IT" block or a linked
  doc.
- Both voices are **honest**. Plain does not mean vague — it means decoded.
- Neither voice uses the project's internal process vocabulary (§2) or leaks
  developer/agent artifacts (§3).

---

## 2. Plain-English glossary — banned jargon `[GATE]`

These internal terms appeared on visitor surfaces in the audit. The left column
is a **denylist**: it must not appear in visitor-facing docs. Use the right
column. (Internal roadmap/ADR/audit docs may keep the private vocabulary.)

| Do not write (visitor surfaces) | Write instead |
|---|---|
| release car | released module · the current release |
| demotion-truth label · demotion-truth state | version lowered to match its real maturity |
| truth-repair demotion release · no-functional-upgrade demotion release | early scaffold; full build still queued |
| promotion package | the modules in the current release |
| post-starter module labels | *(rephrase around what the module actually is)* |
| truth-reconciled · beta-ready truth-reconciled · `city_core_beta_ready_truth_reconciled` | beta (version labels reconciled with what actually works) |
| matching-host lifecycle · matching-host evidence | tested on the same operating system it ships for |
| wrapper profile | *(name the actual packaging, e.g. "the earlier Docker packaging")* |
| recovery gates · release-recovery gates | our release-integrity checks |
| recovery patch required | needs a corrective update before release |
| QA-B1 (walkthrough) | the clean-machine install test |
| YELLOW / GREEN beta (status colors) | *(state the status in words: "in beta", "released")* |
| the active suite integration target | the product we ship today |

**Rule:** if a term is meaningful only to someone who has read the internal
roadmap, it does not belong on a visitor page. Define it once in plain words or
replace it.

---

## 3. No internal leakage `[GATE]`

Developer- and agent-facing artifacts must never appear on a public surface.
Each pattern below is a hard denylist entry.

- **Personal names / owners.** No first names. "Scott" → **the project owner**.
  No "the project owner directed…" narration — just state the fact.
- **Local machine paths.** No `C:\dev\Claude\…`, no `~/.claude/…`, no
  `bridge/for-scott`, no `*(Cowork-local)*`, no `agent-runs/…`. If evidence
  matters, commit it under `docs/evidence/` and link it; otherwise write
  "internal run evidence, available on request".
- **Internal tool / lane names.** No `gauntletgate`, `render_topology` re-run
  instructions in visible text (keep them inside HTML comments), `QA-B1` codes.
- **Secrets, even by name.** Never print a secret's name (e.g. no
  `CIVICACCESS_TRUSTED_WRITE_TOKEN`).
- **"this run" / "the active PR".** A visitor's trust path is the published
  release + SHA-256, not an internal run. Name the release and link it.
- **Bare internal references.** A `PR #NNN`, `run NNNNN`, `ADR-000N`, spec name
  (`UnifiedSpec`), or file (`CONSISTENCY.md`) mentioned on a visitor surface must
  be **a link**, or be cut. No bare "#183" with no context. `[GATE]`: flag
  `PR #\d+`, `run \d{6,}`, `ADR-\d`, and known-doc names that are not inside a
  markdown link.
- **Internal QA voice.** Do not tell a clerk to "record it as a release
  blocker." Write: "this is a bug — please report it on the GitHub issue tracker
  (link)."

---

## 4. Honest-status phrasing

The project's honesty is an asset. Phrase it so it reads as confidence, not as a
red flag.

- **Lead with the positive current state.** State what a thing *is* now, then
  (optionally) link the history. The Townlight Access note leads "Sixth city-core
  module, shipped in v1.0.2 with local-AI accessibility features," not
  "a re-probe reversed the 2026-05-23 demotion."
- **Don't put a warning where a positive claim belongs.** A headline, a hero, an
  "available today" line, and the top of a matrix are positive-claim slots. Move
  caveats out of them. (Audit: "not public-use ready" six lines under "use it
  now"; the compat matrix opening with "labels are provisional".)
- **One link to the history, not history inline.** The 2026-05 label-freeze
  story lives in `docs/release-recovery-status.md`. Reference it once; don't
  re-narrate "false labels" on every surface.
- **No self-contradiction across labels.** A module is either city-core-released
  or developer-preview — pick the one true label per surface and match it to the
  current release. `[GATE]` (soft): flag a module described with two different
  maturity words on the same page.
- **Annotate version regressions.** If a history table shows a version higher
  than the current one (a later-demoted label), annotate the row
  ("v1.0.0 later lowered — see recovery status") rather than leaving the
  contradiction bare.
- **Status vocabulary is finite and shared.** Status words come from the honest
  status set (§5 of the design-system plan): the same labels in the badges, the
  module explorer, and STATUS.md, generated from the `public_status` block in
  `installer/modules.json`. Do not invent a new status phrase per surface.

---

## 5. Links and freshness discipline `[GATE]`

- **Make the important pointer clickable.** The operator walkthrough, the
  releases page, `installer/modules.json`, specs — if a visitor is told to go
  there, it is a link on first mention, not inline code.
- **Pin version-specific links; float only "latest".** A link labeled
  "v1.0.2 release notes" points at the **tag** URL
  (`/releases/tag/civicsuite-windows-local-v1.0.2`), never `/releases/latest`.
  Use `/releases/latest` only where the text genuinely means "the newest
  release." `[GATE]`: flag a link whose text names a specific version but whose
  href is `/latest`.
- **One verification-date source per doc.** A doc's "Last verified" header stamp
  governs. Do not scatter conflicting inline "as of DATE" claims that drift from
  it. `[GATE]`: flag an inline `as of \d{4}-\d{2}-\d{2}` that is older than the
  file's header stamp.
- **No dead links.** `[GATE]`: every relative link resolves on `main`; every
  named-but-unlinked doc either exists and is linked or is removed.
- **One figure for one fact.** MSI size, module counts, deadlines: state a single
  number and reuse it. `[GATE]` (soft): flag the same named quantity given two
  values across audited files (e.g. MSI size "1.5 GB" vs "1.65 GB").

---

## 6. What CI enforces (implementation summary)

The gate runs over the visitor-facing set (README, STATUS, FAQ, USER-MANUAL,
ANNOUNCEMENT, PROVENANCE, ARCHITECTURE, `docs/compatibility/index.md`,
`docs/troubleshooting.md`, `docs/installer/operator-walkthrough.md`, release
bodies, discussions where automatable):

1. **Jargon denylist (§2):** fail on any left-column term.
2. **Leakage denylist (§3):** fail on personal names, local-path patterns,
   internal tool/lane names, secret names, `*(Cowork-local)*`.
3. **Unlinked internal references (§3):** flag `PR #\d+`, `run \d{6,}`,
   `ADR-\d`, and known doc names not inside a markdown link.
4. **Version-pinned link points at `/latest` (§5).**
5. **Inline date older than the header "Last verified" stamp (§5).**
6. **Dead relative links (§5).**
7. **Same named quantity with divergent values across files (§5, soft).**
8. **Two maturity labels for one module on one page (§4, soft).**

Soft checks warn; the rest fail the build. Additions to the denylists land in
this doc first, then the gate — this doc stays the source of truth for the words,
the same way `tokens.css` is the source for the values.

**Implemented in** [`scripts/docs/check_voice.py`](../../scripts/docs/check_voice.py),
run by the `verify` CI workflow over the visitor-facing set. It scans rendered
prose only — fenced code, HTML comments, generated blocks, and markdown table
rows (reference data) are excluded, so machine labels and history tables do not
trip the denylists. `python scripts/docs/check_voice.py --selftest` proves the
detectors catch a known-bad blob and pass a linked reference.
