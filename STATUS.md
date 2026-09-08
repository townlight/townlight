# Townlight status

**Last verified:** 2026-08-27

**Active product:** Townlight Records 1.1.0-beta.1 release candidate

**Publication status:** not yet published

## Current Records beta truth

| Gate | Current state |
|---|---|
| Product profile | Townlight Core + Townlight Records + Townlight Notice + Townlight Access |
| Fresh-install default | `records-beta`; Meetings and Code are not installed |
| Demo data | Deterministic fictional Redstone Valley fixture; explicit load only |
| State safety | `city-work.json` schema version 1; missing-version upgrade requires verified backup; unsupported future versions fail closed |
| Local product tests | Passed: 197 Rust tests, 30 browser tests, desktop static/state tests, production build, dependency audit, suite-state checks, Rust formatting, and Git whitespace checks |
| Module integration | Accepted and pinned: Core `b4d0156`, Records `edf1c8d`, Notice `79b8d07`, Access `b9100ed` |
| Unsigned MSI | PR #248 verified candidate code head `dc77736` passed build, real-runtime integration, install, launch, first run, backup/restore, repair, and uninstall; evidence records `SignatureState=UNSIGNED` and `PublicationAllowed=false` |
| Signing | Townlight organization credentials exist; the exact merged `main` commit has not yet been signed |
| Release | Blocked only until merge, validated publisher signature, signed clean-machine journey, exact-SHA tag, and human publication approval pass |

The beta's public Records/Notice/Access workflow currently executes in the Rust
desktop application. Installed Python/FastAPI modules are reference/contract
implementations in this release. Convergence to one Python/PostgreSQL domain
path is a blocking gate before Townlight Meetings.

Public names use Townlight. Legacy `civic*` package/import/database/environment
identities and the existing MSI/data identities remain compatibility contracts.

## Historical predecessor status (not current)

The generated and narrative material below is the retained CivicSuite
city-core snapshot. It is not the current Townlight Records release claim.

## Active City-Core Target (historical GA-candidate snapshot)

The active city-core release package is CivicCore, CivicRecords AI, CivicClerk, CivicCode, CivicNotice, CivicAccess, and the Windows Local desktop installer shell. The current released modules are CivicCore `v1.2.0`, CivicRecords AI `v1.7.3`, CivicClerk `v1.0.4`, CivicCode `v1.0.8`, CivicNotice `v0.2.0`, and CivicAccess `v0.4.0`; [PR #183](https://github.com/townlight/townlight/pull/183) records predecessor evidence for the earlier Docker-based wrapper profile. The current released beta is CivicSuite Windows Local `v1.0.3` (the first Authenticode-signed release, superseding v1.0.2 and carrying the earlier accessibility fixes): one MSI installing the six-module city-core suite as a Tauri/WebView2 Windows desktop app with portable PostgreSQL 17 + pgvector, bundled CPython city services, PostgreSQL-backed task queue, local file storage, local model setup, backup/restore, repair, support bundle, and Windows uninstall handoff. The clean-machine install test passed end-to-end on the v1.0.1 MSI, and Phase D's `clean_vm_dod_passed` gate passed on the v1.0.2 MSI across two full Windows Sandbox runs. Phase D's second gate, `accessibility_passed`, was run on 2026-07-09 and **fails** on v1.0.2 (see below); the release gates are therefore not all complete for that build. The package is therefore a **GA candidate now open for public beta**; the Windows MSI is Authenticode code-signed via Azure Trusted Signing as of the `v1.0.3` release. macOS remains at beta-level readiness only until install-lifecycle testing passes on macOS itself.

The operator path is local-only on Windows and does not require Docker, WSL, a terminal, or a browser URL. The released `civicsuite-windows-local-v1.0.2` MSI was built by [GitHub Actions run 28626482190](https://github.com/townlight/townlight/actions/runs/28626482190) from main merge commit `0b797c4` (SHA-256 `bbdeb1b69e846d3ccb8c961502f4b2f158e92623e7bf4dfa9d4c4bf2f9a0fd02`, 1,646,999,452 bytes). Verify the downloaded MSI against that checksum or the release manifest, confirm the `installer/modules.json` `source_commit` pins for the six city-core repos, and use published module hashes/attestations where applicable. Only release-page artifacts are canonical.

**Bundled source vs published releases (disclosure):** the MSI installs module source pinned by commit, not the published release tags, and for two modules the bundled commit is **ahead of** the latest published release — CivicRecords AI ships `e2208827` (ahead of `v1.7.3`) and CivicClerk ships `fa1874ed` (ahead of `v1.0.4`). The full bundled-commit-to-release mapping and the verification path are documented in [PROVENANCE.md](PROVENANCE.md). For those two modules the trust path is the `source_commit` pin plus the MSI checksum/manifest, not the release tag.

CivicAccess is the sixth city-core module at v0.4.0 (accessibility + records-ready export) on CivicCore v1.2.0. A follow-up in-depth review (2026-06-29; see [docs/audits/civicaccess-citycore-reprobe-2026-06-29.md](docs/audits/civicaccess-citycore-reprobe-2026-06-29.md)) qualified it for city-core, reversing the 2026-05-23 "needs work" demotion (a failed depth review). The city-core profile, registry, contract, gates, compatibility/spec truth, and the desktop UI all reflect six modules, and the released v1.0.2 MSI installs all six.

The v1.0.1 UI gap is closed: Phase B ([PR #213](https://github.com/townlight/townlight/pull/213)) wired the runtime, Phase C ([PR #214](https://github.com/townlight/townlight/pull/214)) updated the module registry from five modules to six, and v1.0.2 built the clerk-facing **Accessibility** workflow tab in the desktop shell ([PR #216](https://github.com/townlight/townlight/pull/216), mirroring the [CivicNotice precedent #193](https://github.com/townlight/townlight/pull/193)). The view itself is complete and correct, but a navigation omission in the shipped shell left it unreachable on every v1.0.2 install; the one-line fix and a drift guard land in the next release.

Three of the tab's tools run on the suite's shared local AI engine ([PR #220](https://github.com/townlight/townlight/pull/220), merge `0b0170a`): Plain-Language Rewrite drafts a real rewrite of the entered text, Multilingual Variant drafts a real translation into the named language, and Accessibility Review stores a short AI-drafted remediation analysis alongside its five deterministic WCAG checks. AI drafts are labeled, humans decide, review status derives only from the deterministic rules (never from AI), and every feature degrades to clearly-labeled deterministic behavior with an explicit "AI engine not ready" state when the local engine is unavailable.

Phase D clean-VM acceptance ([manifest](docs/roadmap/civicaccess-citycore-integration/phase-D-cleanvm-accessibility-dod.manifest.yaml)) requires **two** gates. On v1.0.2 only one of them passed.

- `clean_vm_dod_passed` — **PASS** across two full Windows Sandbox runs: install → the full first-run wizard → admin sign-in → model download and the app's own streamed SHA-256 verify (all six readiness checks green) → all three CivicAccess AI features producing clean, correctly-labeled output through the real app bridge. It caught the clean-machine database defect fixed in this release; the second run verified the released MSI initializes its PostgreSQL data store on a clean machine with no system VC++ runtime present.
- `accessibility_passed` — **FAIL**. This gate was never exercised for v1.0.2; the 2026-07-02 evidence kit contains no accessibility artifacts. It was run for the first time on 2026-07-09 against the released MSI. Keyboard-only traversal, screen-reader/ARIA, and WCAG 2.1 AA all **pass** on the real rendered surfaces (axe-core: 0 violations across staff and public areas; 0 focusable elements without a visible focus indicator), and the write boundary enforces. **Export correctness fails** — `civicaccess-records-export` writes no artifact — and the run additionally found that the **Accessibility tab is unreachable in the shipped app** and that **city-core migrations abort on a genuinely clean machine** (the bundled Python payload omits `msvcp140.dll`). Evidence and findings: [docs/evidence/civicaccess-v102-phaseD-a11y-2026-07-09/](docs/evidence/civicaccess-v102-phaseD-a11y-2026-07-09/README.md).

All three defects are fixed on `main` and ship in the next release. v1.0.2 itself remains as published. Full background: [docs/audits/civicaccess-citycore-deep-read-2026-06-29/FINAL-REPORT.md](docs/audits/civicaccess-citycore-deep-read-2026-06-29/FINAL-REPORT.md).

The four earlier overstated version labels for CivicZone, CivicPlan, CivicPermit, and CivicInspect have been displaced by narrow `v0.2.2` corrective releases that lowered the version labels to match actual maturity. Those releases add no functionality and do not promote Tier 2. The reconciled unified spec, installer metadata, and live GitHub org state enumerate 27 product modules plus CivicCore.

<!-- BEGIN GENERATED MODULE STATUS (scripts/docs/render_public_status.py) -->

## Status Legend

Status labels below are the suite's shared status set, generated from
[`installer/modules.public-status.json`](installer/modules.public-status.json) — the same source the [module explorer](docs/module-explorer.html) renders.

- **Shared platform:** The shared platform every module depends on; always installed.
- **Released · city-core:** Released city-core module — ships in the current Windows Local release.
- **Queued · Tier 2:** Early scaffold with a corrected version label; full build queued for Tier 2.
- **Early scaffold:** Early scaffold; not city-ready.
- **Foundation:** Package/schema/sample-depth foundation only; not product-ready.
- **Planned:** Spec exists; no runtime repo yet.

## Module Status (all 28)

| Module | Version | Status | Released | Note |
|---|---|---|---|---|
| Townlight Core | 1.2.1 | Shared platform | 2026-07-04 | Shared platform for identity, audit, retention, local tasks, and document ingestion. Version 1.2.1 is always installed with Townlight Records. |
| Townlight Records | 1.7.3 | Released · city-core | 2026-05-24 | Public-records intake, cited search, human exemption review, release packaging, fulfillment, and public status. The beta desktop currently executes its native Rust workflow. |
| CivicClerk | 1.0.4 | Released · city-core | 2026-06-13 | Meetings, agendas, packets, minutes, and votes. Ships in v1.0.2. |
| CivicCode | 1.0.8 | Released · city-core | 2026-05-23 | Searchable municipal code and ordinances with AI-assisted guidance. Ships in v1.0.2. |
| Townlight Access | 0.4.0 | Released · city-core | 2026-06-28 | Accessibility and records-release review, including plain-language, translation, and WCAG-oriented checks. Bundled with Townlight Records beta. |
| CivicZone | 0.2.2 | Queued · Tier 2 | 2026-05-23 | Parcel-aware zoning and land-use Q&A. Early scaffold; full build queued as the next Tier 2 lane. |
| CivicPlan | 0.2.2 | Queued · Tier 2 | 2026-05-23 | Comprehensive-plan policy lookup. Early scaffold; full build queued. |
| CivicPermit Assist | 0.2.2 | Queued · Tier 2 | 2026-05-23 | Permit pre-application and development-review intake. Early scaffold; full build queued. |
| CivicInspect | 0.2.2 | Queued · Tier 2 | 2026-05-23 | Inspection assistant foundation. Early scaffold; full build queued. |
| CivicGrants | 0.2.0 | Early scaffold | 2026-05-10 | Grant-opportunity triage and compliance support. Early scaffold; not city-ready. |
| CivicProcure Assist | 0.2.0 | Early scaffold | 2026-05-10 | Procurement RFP drafting and award-packet support. Early scaffold; not city-ready. |
| CivicContracts | 0.1.1 | Foundation | 2026-04-28 | Contract repository and renewal visibility. Schema/spec foundation; not city-ready. |
| CivicBoards | 0.1.1 | Foundation | 2026-04-28 | Board and commission administration. Schema/spec foundation; not city-ready. |
| Townlight Notice | 0.2.0 | Released · city-core | 2026-07-03 | Deterministic deadline, proof, and archive support bundled with Townlight Records beta. |
| Civic311 | 0.1.1 | Foundation | 2026-04-28 | Resident service-request intake and Open311 export. Schema/spec foundation; not city-ready. |
| CivicComms | 0.1.1 | Foundation | 2026-04-28 | Source-backed public explainers and communications support. Schema/spec foundation; not city-ready. |
| CivicData Bridge | 0.1.2 | Foundation | 2026-04-29 | Open-data and transparency publishing. Schema/spec foundation; not city-ready. |
| CivicRegWatch | — | Planned | — | Federal regulatory-intelligence module. Detailed spec exists; no runtime repo yet. |
| CivicAPI | — | Planned | — | Public read-only data gateway. Detailed spec exists; no runtime repo yet. |
| CivicHR Assist | 0.1.1 | Foundation | 2026-04-28 | Personnel-policy and HR knowledge support. Schema/spec foundation; not city-ready. |
| CivicBudget Assist | 0.1.2 | Foundation | 2026-04-29 | Budget-narrative and transparency support. Schema/spec foundation; not city-ready. |
| CivicLegal Research | 0.1.2 | Foundation | 2026-04-29 | Internal legal-record research support. Schema/spec foundation; not city-ready. |
| CivicElections Assist | 0.1.1 | Foundation | 2026-04-28 | Election-administration support. Schema/spec foundation; not city-ready. |
| CivicUtility Assist | 0.1.1 | Foundation | 2026-04-28 | Utility-operations support. Schema/spec foundation; not city-ready. |
| CivicCourt Assist | 0.1.2 | Foundation | 2026-04-29 | Municipal-court support. Schema/spec foundation; not city-ready. |
| CivicSafety Assist | 0.1.1 | Foundation | 2026-04-28 | Public-safety administrative support. Schema/spec foundation; not city-ready. |
| CivicLibrary | 0.1.1 | Foundation | 2026-04-28 | Library-operations support. Schema/spec foundation; not city-ready. |
| CivicParks | 0.1.1 | Foundation | 2026-04-28 | Parks-and-recreation support. Schema/spec foundation; not city-ready. |

<!-- END GENERATED MODULE STATUS -->

## Corrective Release Decision

In May 2026 the project audited and corrected overstated version labels; the full history is in [docs/release-recovery-status.md](docs/release-recovery-status.md).

As of 2026-05-14, the release-integrity decision is:

| Repo | Correct label | Status |
|---|---:|---|
| civiccore | v1.2.0 shipped | Real shared platform; v1.2.0 shipped the shared document-ingestion pipeline and now includes the Windows-local platform contracts plus PostgreSQL-backed task queue/worker. |
| civicclerk | v1.0.4 shipped | Real meeting workflow module release pinned to CivicCore v1.2.0; protected staff auth defaults remain required. |
| civicrecords-ai | v1.7.3 shipped | Developer preview records module release pinned to CivicCore v1.2.0 and consuming shared CivicCore ingestion; v1.7.3 adds release-asset convention bring-up without functional installer behavior changes. |
| civiccode | v1.0.8 shipped | City-core module release pinned to CivicCore v1.2.0; v1.0.8 supersedes the earlier v1.0.0 posture and carries release attestation. |
| civicnotice | v0.2.0 shipped | City-core public-notice workflow module release pinned to CivicCore v1.2.0; installed through the Windows Local city-core profile with checklist, posting proof, archive export, backup/restore, and search wiring. |
| civicaccess | v0.4.0 city-core module release | Sixth city-core module on CivicCore v1.2.0; accessibility + records-ready export; ships in the six-module CivicSuite Windows Local v1.0.2 release with three features on the suite's shared local AI engine. Phase D `clean_vm_dod_passed` PASS; `accessibility_passed` FAIL on v1.0.2 (the Accessibility tab was unreachable in the shipped shell and records-export wrote no artifact; both fixed on main). |
| civiczone | v0.2.2 | Narrow corrective release that lowered the version label to match actual maturity; no functional upgrade; queued for Tier 2 real work. |
| civicplan | v0.2.2 | Narrow corrective release that lowered the version label to match actual maturity; no functional upgrade; queued for Tier 2 real work. |
| civicpermit | v0.2.2 | Narrow corrective release that lowered the version label to match actual maturity; no functional upgrade; queued for Tier 2 real work. |
| civicinspect | v0.2.2 | Narrow corrective release that lowered the version label to match actual maturity; no functional upgrade; queued for Tier 2 real work. |
| civicgrants | v0.2.0 | Corrected from an earlier overstated v1.0.0 label; scaffold-depth grants support. |
| civicprocure | v0.2.0 | Corrected from an earlier overstated v1.0.0 label; scaffold-depth procurement support. |

All other modules remain foundation-only unless their own repo evidence says otherwise and the compatibility matrix agrees.

## What Works Today

- `civiccore` v1.2.0 is the current shared platform release and includes the shared document-ingestion pipeline, Windows-local platform contracts, and PostgreSQL-backed local task queue/worker used by the city-core module releases.
- `civicrecords-ai` v1.7.3 remains developer preview, consumes CivicCore v1.2.0 shared ingestion, and keeps the city-core installer on the vendored-source path.
- `civicclerk` v1.0.4 is the current meeting workflow module release for city-core.
- `civiccode` v1.0.8 is the current municipal-code module release for city-core.
- `civicnotice` v0.2.0 is the current public-notice workflow module release for city-core.
- The active Windows Local city-core desktop path now covers first-run local folders, module profile selection, city profile, first CivicSuite admin sign-in, Gemma 4 12B QAT model setup, local users/RBAC, city-core workflows, task queue health, local file evidence, exports, backup/restore, repair, support bundle, and uninstall handoff. The clean-machine Windows Local lifecycle test passed end-to-end on a fresh Windows Sandbox for the 1.0.1 MSI, and the released 1.0.2 MSI passed Phase D clean-VM acceptance across two full Windows Sandbox runs (install → full wizard → admin sign-in → model download/verify → live AI output through the real app bridge).
- v1.0.2 fixed the suite's shared local-AI generation helper: it now calls the bundled Ollama's `/api/chat` instead of `/api/generate` with raw hand-built prompts (which bypassed the pinned model's own template/parser and produced unusable output against the real model). Because the helper is shared, the fix repaired output quality for every AI feature in the suite — CivicClerk minutes, CivicRecords responses, CivicCode guidance, and the three CivicAccess features (generation config: temperature 0.2, num_predict 512, num_ctx 8192, 180 s timeout). Caught by the Phase D clean-VM dress rehearsal against the real model; fixed in [PR #220](https://github.com/townlight/townlight/pull/220) (merge `0b0170a`).
- v1.0.2 also fixed a clean-machine defect pre-existing across v1.0.x (not a CivicAccess regression): the runtime payload now stages the Microsoft VC++ runtime DLLs (`vcruntime140.dll`, `vcruntime140_1.dll`, `msvcp140.dll`) into `postgres\bin`, so the bundled PostgreSQL starts on a factory-fresh Windows PC with no VC++ redistributable installed. Found by Phase D clean-sandbox acceptance (`initdb.exe` failed with "VCRUNTIME140.dll was not found"); proven fixed in the second clean-sandbox run, where initdb built a full PostgreSQL 17.10 cluster with no system runtime present. Fixed in [PR #221](https://github.com/townlight/townlight/pull/221) (merge `0b797c4`).
- The suite-level `clerk-core` installer beta now records its verification evidence: clean-environment package testing, isolated test ports/projects, proof that workflows run on the installed stack, and full install-lifecycle testing on Linux itself covering install, repair, verify, backup, restore, and uninstall. For Windows and macOS, the earlier Docker-based wrapper profile's claims remain limited to archive/readiness checks until the same install-lifecycle testing passes on those operating systems.
- CivicAccess is the sixth city-core module at v0.4.0, with three of its tools running on the suite's shared local AI engine — real drafts, labeled fallbacks, human review always required. Its Accessibility workflow tab was built for v1.0.2 but a navigation omission left it unreachable in the shipped shell; that fix and the records-export fix land in the next release (see the CivicAccess section above).
- CivicZone, CivicPlan, CivicPermit, and CivicInspect carry v0.2.2 corrected version labels, not public-use release status.
- `civicgrants` and `civicprocure` contain useful scaffolds and local mocks, but they are not city-ready products.

## What Does Not Work Yet

A municipality should not treat CivicSuite as a finished full-suite procurement product today. The released beta is the Windows Local city-core package only: CivicCore, CivicRecords AI, CivicClerk, CivicCode, CivicNotice, CivicAccess, and the desktop installer shell. Missing proof is module-by-module feature completion for the rest of the unified spec; the clean-machine gates for the Windows Local package have passed (the clean-machine install test on the v1.0.1 MSI, Phase D clean-VM acceptance on the v1.0.2 MSI). the Windows MSI is Authenticode code-signed via Azure Trusted Signing as of `v1.0.3`; macOS remains readiness-only, Tier 2 modules remain queued, and everything still runs fully local — no cloud calls, no telemetry.
