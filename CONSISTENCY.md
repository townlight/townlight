# CivicSuite — Consistency Reference

## Townlight Records beta.2 candidate (2026-10-07)

The current candidate uses public label `1.1.0-beta.2`, desktop build version
`1.1.0-2`, and a Records profile of Core + Records + Notice + Access. The
Records source pin is `ff99d8c7e692ba1f75e1781f517bb54f5c618b48` in
`townlight/sunshine`. Both desktop EXE and MSI must be signed and independently
verified before publication. Existing beta.1 evidence proves only beta.1 bytes.
The candidate remains unpublished, and architecture convergence remains a
blocking gate before Meetings. The legacy reference below is historical.

Every count, cross-reference, version, and named fact used in CHARTER.md and README.md is verified here against the source-of-truth spec. Update this file whenever any of those facts change. Do not let the charter or README drift from this table.

Last verified: June 27, 2026.

---

## 1. The big numbers (the ones that drift first)

| Claim | Value | Source | Verified |
|---|---|---|---|
| Total product modules in catalog | **27** | `docs/CivicSuiteUnifiedSpec.md` module headings, `installer/modules.json`, and live `CivicSuite` GitHub org repo list | verified |
| Shared platform modules | **1** (`CivicCore`) | `specs/01_catalog.md` Tier 0 and `specs/02_CivicCore.md` | verified |
| Total tiers in catalog | **7** (Tier 0 through Tier 6) | `specs/01_catalog.md` section headers 7–13 | ✅ |
| CivicCore extraction phases | **6** (Phase 0 through Phase 5) | `specs/02_CivicCore.md` §12 ("The six phases") | ✅ |
| CivicRecords AI test modules (regression baseline) | **36** | `specs/02_CivicCore.md` §15 and §17 | ✅ |
| Phase 1 scope (subsystems extracted) | **4** (User, Role, Department, audit_log) | `specs/02_CivicCore.md` §12 phase 1 row | ✅ |
| CivicCore directory layout subdirs | **14** (auth, audit, llm, ingest, search, connectors, notifications, onboarding, catalog, exemptions, verification, models, migrations, scaffold) | `specs/02_CivicCore.md` Appendix B | ✅ |
| CivicClerk entity tables | **15** | `specs/03_civicclerk.md` §12 | ✅ |
| CivicClerk REST endpoints | **25** | `specs/03_civicclerk.md` §29 | ✅ |
| CivicClerk frontend pages | **20** | `specs/03_civicclerk.md` §30 | ✅ |
| CivicClerk prompts | **9** | `specs/03_civicclerk.md` §17 | ✅ |
| CivicClerk RBAC roles | **9** | `specs/03_civicclerk.md` §26 | ✅ |
| CivicClerk connectors | **11** | `specs/03_civicclerk.md` §33 | ✅ |
| CivicClerk test areas | **15** | `specs/03_civicclerk.md` §39 | ✅ |
| CivicZone entity tables | **11** | `specs/04_civiczone.md` §8 | ✅ |
| CivicZone REST endpoints | **17** | `specs/04_civiczone.md` §28 | ✅ |
| CivicZone frontend pages | **14** | `specs/04_civiczone.md` §29 | ✅ |
| CivicZone prompts | **7** | `specs/04_civiczone.md` §13 | ✅ |
| CivicZone RBAC roles | **7** | `specs/04_civiczone.md` §23 | ✅ |
| CivicZone connectors | **8** | `specs/04_civiczone.md` §32 | ✅ |
| CivicZone test areas | **13** | `specs/04_civiczone.md` §38 | ✅ |

---

## 2. Module count by tier

The product-module total is 27. `CivicCore` is the shared platform prerequisite and is counted separately so product-module math does not drift.

| Tier | Name | Count | Modules |
|---|---|---|---|
| 0 | Foundation platform | 1 platform | CivicCore |
| 1 | Clerk Core | 4 | CivicRecords AI, CivicClerk, CivicCode, CivicAccess |
| 2 | Land Use & Development | 4 | CivicZone, CivicPlan, CivicPermit Assist, CivicInspect |
| 3 | Administrative Expansion | 5 | CivicGrants, CivicProcure Assist, CivicContracts, CivicBoards, CivicNotice |
| 4 | Operations & Resident Services | 5 | Civic311, CivicComms, CivicData Bridge, CivicRegWatch, CivicAPI |
| 5 | Internal Business Functions | 4 | CivicHR Assist, CivicBudget Assist, CivicLegal Research, CivicElections Assist |
| 6 | Specialized | 5 | CivicUtility Assist, CivicCourt Assist, CivicSafety Assist, CivicLibrary, CivicParks |
| **Product total** | | **27** | |
| **Platform + product total** | | **28** | Includes CivicCore plus all product modules |

Source: `docs/CivicSuiteUnifiedSpec.md` Tier 0 through Tier 6 module headings, `installer/modules.json`, and the live `CivicSuite` GitHub org repo list checked on 2026-05-23.

---

## 3. Module naming convention

The catalog uses two forms for some modules:

- **Bare name** (`CivicCourt`, `CivicHR`, `CivicBudget`, `CivicSafety`, `CivicUtility`, `CivicProcure`, `CivicLegal`, `CivicElections`, `CivicData`, `CivicPermit`) used in tier rollout lists where context is implicit.
- **"Assist" or "Bridge" suffix** (`CivicCourt Assist`, `CivicHR Assist`, `CivicBudget Assist`, `CivicSafety Assist`, `CivicUtility Assist`, `CivicProcure Assist`, `CivicLegal Research`, `CivicElections Assist`, `CivicData Bridge`, `CivicPermit Assist`) used when explaining scope and clarifying that the module is a copilot/bridge, not a system-of-record replacement.

Both forms are intentional and refer to the same module. The bare form is the casual reference; the suffixed form is the canonical product name. CHARTER.md uses bare forms in the do-not-spec list (which is informal); CONSISTENCY.md and the catalog tier table above use the canonical suffixed forms where they apply.

If the dev team needs to import a module name, use the canonical suffixed form. If the dev team is referring conversationally, either is fine.

---

## 4. Spec section cross-references used in CHARTER.md

Every CHARTER reference to a spec section, verified against the actual spec section number.

| CHARTER reference | Target | Verified? |
|---|---|---|
| "CivicCore Extraction Spec §8 (extraction inventory)" | `02_CivicCore.md` §8 = "The extraction inventory" | ✅ |
| "CivicCore Extraction Spec §9 (what stays in CivicRecords AI)" | `02_CivicCore.md` §9 = "What stays in CivicRecords AI" | ✅ |
| "CivicCore Extraction Spec §18 (Risks table, mitigation row 7)" | `02_CivicCore.md` §18 = "Risks and mitigations"; row 7 is "Contributor confusion about where to file a bug" → "Each repo's CONTRIBUTING.md has a 'where does this bug go' decision tree" | ✅ |
| "CivicCore Extraction Spec Appendix B" | `02_CivicCore.md` Appendix B = "Directory layout (civiccore repo)" | ✅ |
| "CivicClerk spec §12 (Entity overview)" | `03_civicclerk.md` §12 = "Entity overview" (15 tables) | ✅ |
| "CivicClerk spec §29 (REST API)" | `03_civicclerk.md` §29 = "REST API" (25 endpoints) | ✅ |
| "the catalog §16–20 (the 'what NOT to build' sections)" | `01_catalog.md` §16 = "Not a First-Wave ERP Replacement", §17 = "Not a First-Wave Utility Billing Replacement", §18 = "Not a First-Wave Permitting System of Record", §19 = "Not a CAD/RMS or Courts System", §20 = "Not a Cloud Service" | ✅ |

---

## 5. Phase 0 vs extraction inventory (avoid the trap)

The CivicCore Extraction Spec §12 defines Phase 0 as exactly: *"Create civiccore repo skeleton. Create civicsuite umbrella repo. Copy LICENSE, README, CI scaffolding. Agree on public API surface."*

The extraction inventory is **not** part of Phase 0. It is preparation work that produces the Phase 1 checklist. CHARTER.md is careful to use the phrase "extraction inventory (preparation for Phase 1)" rather than "Phase 0 inventory" when describing this work, so the labeling matches the spec.

If a future doc says "Phase 0 inventory" or names the branch `civiccore-phase-0-inventory`, it has drifted. The canonical branch name in CHARTER.md is `civiccore-extraction-inventory`.

---

## 6. License language (do not paraphrase)

| Asset | License | Source of phrasing |
|---|---|---|
| Code (every repo) | Apache License 2.0 | `02_CivicCore.md` Appendix D |
| Documentation | CC BY 4.0 | `02_CivicCore.md` Appendix D |
| Prompt libraries (if separated) | CC BY-SA 4.0 | `02_CivicCore.md` Appendix D |
| Third-party deps | Permissive or weak-copyleft only; AGPL and GPL-3.0 blocked | `02_CivicCore.md` Appendix D |
| Redis | Pin `<8.0` (BSD); never SSPL releases | `02_CivicCore.md` Appendix D |

Project standardized on Apache License 2.0 for code on 2026-04-23 (Scott confirmed in CivicSuite kickoff). Earlier drafts referenced MIT; those have been updated. The "MIT 2.0 does not exist" caveat is no longer load-bearing and was removed.

---

## 7. Default model and infra versions

| Asset | Version | Source |
|---|---|---|
| Default LLM | Gemma 4 (via Ollama, local) | `01_catalog.md` §3, `02_CivicCore.md` §6.1, all module specs |
| Embeddings | nomic-embed-text (via Ollama, local) | All module specs |
| Transcription (CivicClerk) | Whisper large-v3 default, configurable | `03_civicclerk.md` §19 |
| Database | Bundled portable PostgreSQL 17 + pgvector | `installer/modules.json` (civiccore `portable-postgres` service), `docs/installer/operator-walkthrough.md` |
| Local model runtime | Bundled Ollama serving the pinned Gemma 4 12B QAT model | `desktop/runtime/gemma4-model.json`, `docs/installer/operator-walkthrough.md` |
| Desktop shell / frontend | Tauri + WebView2 (the `desktop-shell` service) | `installer/modules.json` (civiccore `tauri-webview` service), `docs/installer/operator-walkthrough.md` |
| City services | Embedded CPython (`bundled-python`) per module | `installer/modules.json` module `services` |
| Task queue / workers | PostgreSQL-backed local task-queue worker (`local-worker`) | `installer/modules.json` (civiccore `task-queue` service) |

The Windows-Local desktop product does **not** ship Redis, Celery/Celery Beat,
React, nginx, or a standalone FastAPI/Uvicorn server. Those belong only to the
legacy Linux/developer CI proof path and are **not part of the Windows-Local
shipped stack**; the desktop shell is Tauri/WebView2 and the queue is the
PostgreSQL-backed local worker above. Do not reintroduce them as the desktop
stack.

---

## 8. Compliance dates and named statutes

| Item | Value | Source |
|---|---|---|
| ADA Title II compliance — entities 50,000+ population | April 24, 2026 (deadline has passed) | DOJ ADA Title II web/mobile rule (April 2024) |
| ADA Title II compliance — smaller entities and special districts | April 26, 2027 | same |
| Open Meetings Act named examples | Florida §286.011 (Sunshine Law); California Brown Act; Texas Chapter 551; New York Open Meetings Law; Colorado §24-6-401 et seq. | `03_civicclerk.md` §21 |

---

## 9. Repo names (lowercase, hyphenated where needed)

- `civicsuite` (umbrella)
- `civiccore` (shared platform package)
- `civicrecords-ai` (existing records module — keeps the `-ai` suffix per Appendix A naming convention)
- `civicclerk` (future)
- `civiccode` (future)
- `civiczone` (future)
- `civicregwatch` (future)
- `civicapi` (future)
- `civicsuite-prompts` (optional separate prompt library)
- `civicsuite-deploy` (optional separate deployment manifests)

Only `civicrecords-ai` keeps the `-ai` suffix; subsequent module repos drop it because suite identity carries it.

---

## 10. Drift watch — where I have failed before

These specific drifts have been introduced and fixed in this workspace's history. Future writers, re-check these on every revision:

1. **"6 tiers" vs "7 tiers"** — the catalog body has 7 tier section headers. If a summary text or doc says "6 tiers" it has drifted to a stale number.
2. **"§17" vs "§18" for the bug-filing decision tree** — the decision tree is described in §18 (Risks table). Any reference to §17 has drifted.
3. **"Phase 0 inventory" labeling** — Phase 0 in the spec is repo skeleton only. Inventory is preparation for Phase 1, not part of Phase 0.
4. **`.docx` vs `.md` filename references** — markdown is canonical in this workspace. Any reference to `.docx` filenames as the primary read target has drifted.
5. **MIT vs. Apache 2.0** — project standardized on Apache 2.0 on 2026-04-23. Any new text claiming MIT for code has drifted from the current decision. The umbrella's documentation license (CC BY 4.0) and the optional prompt-library license (CC BY-SA 4.0) are unchanged.
6. **Spec-vs-reality path drift** — Day-3 inventory (2026-04-23) found 6 places where spec 02 §8/§9 named paths in civicrecords-ai that didn't exist or had moved. Spec was updated to match reality. Future drift in either direction (renaming files in civicrecords-ai or rewriting spec paths) needs to be reconciled in the same PR.

7. **27 product modules plus CivicCore** - older text drifted between incompatible suite counts. The reconciled current suite has 27 product modules plus the CivicCore shared platform. Do not collapse those into a single ambiguous count.

If you find any of these in a future version of CHARTER, README, or any spec, fix it and re-run the audit.
