# Townlight status

## Planning 1.5.1 fresh-install delivery

The owner authorized a stable fresh-install Planning release on October 24, 2026,
reusing signed candidate40116067286 and its passed installed acceptance. There are
no installed users requiring historical migrations. Signed 1.4/1.5.0 upgrades
remain unverified and outside this release scope. No new installer is built or
signed. [Scope, exact identity and evidence](docs/installer/planning-1.5.1-fresh-install-release.md).
The [release page](https://github.com/townlight/townlight/releases/tag/townlight-records-meetings-code-zoning-planning-v1.5.1)
records actual publication; source preparation alone is not delivery.
Existing default downloads and the historical evidence below are preserved.

**Historical release verified:** October 21, 2026

## Records + Meetings + Code + Zoning 1.4.0-beta.1 public beta

Published October 21, 2026. Four connected Townlight products run locally through
bundled Python services and PostgreSQL, with Core, Notice and Access supporting
them. This is a bounded Windows public beta, not general availability or completion
of the full municipal suite.

[Download the signed Windows installer](https://github.com/townlight/townlight/releases/tag/townlight-records-meetings-code-zoning-v1.4.0-beta.1) ·
[Signed acceptance and limits](docs/installer/townlight-zoning-beta1-signed-acceptance.md) · [User manual](USER-MANUAL.md)

Records-only remains the installation default. Explicitly select **zoning-beta**
for Records, Meetings, Code and Zoning. Existing saved selections are preserved;
**city-core** continues to select Records, Meetings and Code without Zoning.
Planning, Permitting and Inspections are not enabled by zoning-beta.

Zoning imports staff-supplied EPSG:4326 GeoJSON bundles using PostgreSQL
17.10/PostGIS 3.6.2. Cited rules, human corrections, permitted Meetings history and
explicitly public immutable Zoning snapshots connect to Records with source
history and hashes preserved. Private notes remain protected. Answers are
informational, not zoning determinations, permit approvals or legal advice.

The exact signed MSI and embedded EXE passed independent signature/hash checks,
fresh installed workflows, populated signed 1.3 upgrade, backup/restore and
retained-data uninstall. Optional local AI is not required for these deterministic
workflows. Human response approval and final export remain separate from attaching
a source; no automatic public publication is introduced.

## Historical Records beta.3

Townlight Records 1.1.0-beta.3 remains preserved with its original evidence.

[Download the beta](https://github.com/townlight/townlight/releases/tag/townlight-records-v1.1.0-beta.3).
The exact signed MSI and inner executable passed direct rc.3 upgrade and fresh
installation, Records/public-privacy workflows, real local AI and renewed
approval, offline operation, backup/restore, repair, retained-data reinstall,
explicit profile removal/final backup, and uninstall. Final installed acceptance
completed October 19 at 02:31:39 MDT (08:31:39 UTC).

Records uses Python/PostgreSQL after explicit administrator activation, with
validated import and no fallback to legacy JSON. Rust retains native integration
and unmigrated city-core compatibility; Meetings and Code are not delivered here.
This is the bounded Records update, not completion of every historical suite feature.

Merged [Records PR #111](https://github.com/townlight/sunshine/pull/111) and
[desktop PR #260](https://github.com/townlight/townlight/pull/260).
[Signing run 39211809039](https://github.com/townlight/townlight/actions/runs/39211809039)
passed all jobs. See the [beta.3 acceptance record](docs/installer/townlight-records-beta3-acceptance.md)
for exact hashes, tested environments, evidence and limits.

## Historical Records–Meetings 1.2.0-beta.1 acceptance

The `1.2.0-beta.1` release source is merged and signed. Its required PR checks,
real-runtime integration and installed MSI lifecycle passed. Independent local
verification of the downloaded MSI confirms the receipt hash and Valid publisher
signature. Final installed connected-workflow, Records beta.3
preserved-data upgrade, recovery and retained-data uninstall all passed on
October 19, 2026. The final guest was released at 22:24:16 MDT.

The explicit `meetings-beta` profile adds Meetings to Core, Records, Notice and
Access. Records-only remains the default. Code and optional native Meetings AI
minutes/transcription are outside this release. See the
[candidate acceptance record](docs/installer/townlight-records-meetings-beta1-acceptance.md).

## Historical beta.2 rc.3 release and earlier recovery work

**Active product:** Townlight Records 1.1.0-beta.2 (rc.3), signed installed acceptance passed

**Publication status:** published public beta with the project owner's explicit approval on 2026-10-08 at 06:47:25 MDT (12:47:25 UTC). The exact signed rc.3 installer passed installed Records acceptance. [Download the beta](https://github.com/townlight/townlight/releases/tag/townlight-records-v1.1.0-beta.2-rc.3). Earlier signed drafts remain preserved and are not accepted releases.

The rc.2 startup correction passed installed Records, offline, backup/restore,
upgrade, repair, and uninstall checks, but real local-AI testing found changed
response text could export under the previous text's approval. Rc.2 is dormant.
[PR #256](https://github.com/townlight/townlight/pull/256) contains only the accepted response-text correction and is merged at
`22ee2dea9a6038dc1ab1acf45bfe873ae59affe0`; all required PR checks passed.
Signed replacement run [37736131162](https://github.com/townlight/townlight/actions/runs/37736131162)
is the rc.3 candidate build and passed. Independent rc.3 installed acceptance
passed on the exact signed MSI; rc.2 evidence does not certify rc.3. Failed generation and
unrelated edits preserve approval. The blanket-policy branch remains dormant.

See the [rc.3 installed acceptance record](docs/installer/townlight-records-beta2-rc3-acceptance.md)
for hashes, signatures, fresh installation, Records workflow, privacy, offline
work, backup/restore, repair, supported upgrade, real local AI approval checks,
and both uninstall paths. Documentation-only merges do not change the signed bytes.

## Clean-machine startup correction

Signed run [37694186543](https://github.com/townlight/townlight/actions/runs/37694186543)
produced independently verified MSI/EXE signatures and passed CI lifecycle.
The same MSI (`b3f11d6ada4014670246a4662e4432b66b20cb79f6d67a2b3c26d4f0b7d9d5f6`)
installed successfully in a fresh Windows Sandbox, but its EXE imports
`VCRUNTIME140.dll` and `VCRUNTIME140_1.dll` absent from both the system and the
desktop executable directory. Python/PostgreSQL app-local CRT files do not
satisfy desktop startup. This candidate is not accepted for publication.

The correction statically links the desktop MSVC CRT and adds actual PE-import
inspection before signing. The negative gate rejects the defective EXE.
A replacement must pass that gate, be signed, and complete installed acceptance.
CI's installed-process survival check alone did not prove a usable app window.
The follow-up batch also requires an actual Townlight WebView page during CI
startup and adds an explicit authenticated choice to defer optional AI weights.
Deferral still requires all prior setup steps and local runtime health checks;
opting into AI retains checksum and model-readiness requirements. Targeted local
verification passed 24 first-run tests, the admin authorization test, static
smoke, and workflow YAML parsing. This is not installed candidate acceptance.

Combined run [37702668762](https://github.com/townlight/townlight/actions/runs/37702668762)
passed real-runtime integration, the MSI build, 200 Rust tests, browser tests,
and the actual EXE import gate. MSI installation passed, but the installed
WebView probe timed out. The install log confirms WebView2 153 is present.
Microsoft documents that elevated WebView2 150+ hosts ignore environment-only
debug switches; the revised probe uses an app-specific HKLM policy on the
disposable runner and restores it afterward. The real page-readiness gate is
unchanged. A stale source-contract assertion is corrected in the same batch.
This harness diagnosis still requires confirmation from the next CI run.

## Restart work

The beta.2 changes sign the desktop executable before MSI bundling and then
sign the outer MSI. Extraction, installed-file, and release-stage checks verify
the inner executable's signature and exact hash. A signing receipt records both
artifacts and the build commit/run. Desktop build versions advance to `1.1.0-2`.
Records source advances to `ff99d8c7` for the reviewed post-transfer repository
URL and dependency-lock cleanup. Core, Notice, and Access pins are unchanged.

Existing beta.1 evidence below remains historical evidence for those bytes;
it does not prove beta.2. Full signed clean-machine acceptance and publication
approval remain required. Convergence remains blocking before Meetings.

## Records beta.1 baseline evidence

| Gate | Current state |
|---|---|
| Product profile | Townlight Core + Townlight Records + Townlight Notice + Townlight Access |
| Fresh-install default | `records-beta`; Meetings and Code are not installed |
| Demo data | Deterministic fictional Redstone Valley fixture; explicit load only |
| State safety | `city-work.json` schema version 1; missing-version upgrade requires verified backup; unsupported future versions fail closed |
| Local product tests | Passed: 197 Rust tests, 30 browser tests, desktop static/state tests, production build, dependency audit, suite-state checks, Rust formatting, and Git whitespace checks |
| Module integration | Accepted and pinned: Core `b4d0156`, Records `edf1c8d`, Notice `79b8d07`, Access `b9100ed`. Gemma 4 model pin re-pinned 2026-09-08 to immutable HF revision `29d09777` (PR #250); live org references repointed to `townlight/*` (PR #251) |
| Unsigned MSI | PR #248 verified candidate code head `dc77736` passed build, real-runtime integration, install, launch, first run, backup/restore, repair, and uninstall; evidence records `SignatureState=UNSIGNED` and `PublicationAllowed=false` |
| Signing | Merged `main` `397023c9` signed by manual publication run [34268337013](https://github.com/townlight/townlight/actions/runs/34268337013); `Townlight_1.1.0-1_x64_en-US.msi` SHA-256 `1b2eff2428db5d9bf32b1a17dac322b02b0d9120a213e8413844a5f5f9cfb30e`, signer subject equal to the validated individual publisher identity in RELEASING.md, thumbprint `C763F2374C54FF70DF98FCA312E235C77D989524`, RFC3161 timestamp 2026-09-08; independently re-verified on MICROMONSTERPC with `signtool verify /pa /v` (0 errors) and `Get-AuthenticodeSignature` (Valid), and again inside a fresh Windows Sandbox before install |
| Release | Annotated tag `townlight-records-v1.1.0-beta.1` at `397023c9`; `release-windows-msi` run [34275611374](https://github.com/townlight/townlight/actions/runs/34275611374) attached the signed MSI and evidence to a **draft** prerelease. Signed Sandbox install of the MSI passed (msiexec exit 0, product Townlight 1.1.0.1). Remaining before publication: the hands-on Records beta journey (USER-MANUAL.md steps 1-10) on the signed install and human publication approval |

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
- **Published beta capability:** Available in a published bounded Townlight desktop beta or recorded standalone release; select the documented profile and read its limits.
- **Queued · Tier 2:** Early scaffold with a corrected version label; full build queued for Tier 2.
- **Early scaffold:** Early scaffold; not city-ready.
- **Foundation:** Package/schema/sample-depth foundation only; not product-ready.
- **Planned:** Spec exists; no runtime repo yet.

## Module Status (all 28)

| Module | Version | Status | Released | Note |
|---|---|---|---|---|
| Townlight Core | 1.2.1 | Shared platform | 2026-07-04 | Shared platform for identity, audit, retention, local tasks, and document ingestion. Version 1.2.1 is always installed with Townlight Records. |
| Townlight Records | 1.7.3 | Published beta capability | 2026-05-24 | Public-records intake, cited search, human review, release packaging, fulfillment and public status. The connected 1.4.0-beta.1 desktop uses Python/PostgreSQL and can attach permitted Meetings and Code sources with history, citations and hashes. |
| Townlight Meetings | 1.0.4 | Published beta capability | 2026-06-13 | Agendas, packets, delivery, notices, proceedings and manual minutes. Connected 1.4.0-beta.1 supports explicit Code agenda/adoption links and permitted source attachments to Records; optional native AI minutes/transcription is not claimed. |
| Townlight Code | 1.0.8 | Published beta capability | 2026-05-23 | Current and historical ordinance versions, meeting-linked proposals, explicit human adoption and separate codification. Connected 1.4.0-beta.1 supplies permitted cited source copies to Records without exposing restricted material. |
| Townlight Access | 0.4.0 | Published beta capability | 2026-06-28 | Accessibility and records-release review, including plain-language, translation, and WCAG-oriented checks. Bundled with Townlight Records beta. |
| Townlight Zoning | 0.2.2 | Published beta capability | 2026-05-23 | Connected desktop 1.4.0-beta.1 includes opt-in Zoning: staff GeoJSON import, PostGIS lookup, cited rules, human corrections and public immutable Records sources. Standalone package version 0.2.2 is historical; live GIS ingestion, determinations and the wider land-use suite are not delivered. |
| Townlight Planning | 0.2.2 | Queued · Tier 2 | 2026-05-23 | Comprehensive-plan policy lookup. Early scaffold; full build queued. |
| Townlight Permitting | 0.2.2 | Queued · Tier 2 | 2026-05-23 | Permit pre-application and development-review intake. Early scaffold; full build queued. |
| Townlight Inspections | 0.2.2 | Queued · Tier 2 | 2026-05-23 | Inspection assistant foundation. Early scaffold; full build queued. |
| Townlight Grants | 0.2.0 | Early scaffold | 2026-05-10 | Grant-opportunity triage and compliance support. Early scaffold; not city-ready. |
| Townlight Procurement | 0.2.0 | Early scaffold | 2026-05-10 | Procurement RFP drafting and award-packet support. Early scaffold; not city-ready. |
| Townlight Contracts | 0.1.1 | Foundation | 2026-04-28 | Contract repository and renewal visibility. Schema/spec foundation; not city-ready. |
| Townlight Boards | 0.1.1 | Foundation | 2026-04-28 | Board and commission administration. Schema/spec foundation; not city-ready. |
| Townlight Notice | 0.2.0 | Published beta capability | 2026-07-03 | Deterministic deadline, proof, and archive support bundled with Townlight Records beta. |
| Townlight 311 | 0.1.1 | Foundation | 2026-04-28 | Resident service-request intake and Open311 export. Schema/spec foundation; not city-ready. |
| Townlight Communications | 0.1.1 | Foundation | 2026-04-28 | Source-backed public explainers and communications support. Schema/spec foundation; not city-ready. |
| Townlight Data | 0.1.2 | Foundation | 2026-04-29 | Open-data and transparency publishing. Schema/spec foundation; not city-ready. |
| Townlight Regulatory Watch | — | Planned | — | Federal regulatory-intelligence module. Detailed spec exists; no runtime repo yet. |
| Townlight API | — | Planned | — | Public read-only data gateway. Detailed spec exists; no runtime repo yet. |
| Townlight HR | 0.1.1 | Foundation | 2026-04-28 | Personnel-policy and HR knowledge support. Schema/spec foundation; not city-ready. |
| Townlight Budget | 0.1.2 | Foundation | 2026-04-29 | Budget-narrative and transparency support. Schema/spec foundation; not city-ready. |
| Townlight Legal | 0.1.2 | Foundation | 2026-04-29 | Internal legal-record research support. Schema/spec foundation; not city-ready. |
| Townlight Elections | 0.1.1 | Foundation | 2026-04-28 | Election-administration support. Schema/spec foundation; not city-ready. |
| Townlight Utilities | 0.1.1 | Foundation | 2026-04-28 | Utility-operations support. Schema/spec foundation; not city-ready. |
| Townlight Courts | 0.1.2 | Foundation | 2026-04-29 | Municipal-court support. Schema/spec foundation; not city-ready. |
| Townlight Safety | 0.1.1 | Foundation | 2026-04-28 | Public-safety administrative support. Schema/spec foundation; not city-ready. |
| Townlight Library | 0.1.1 | Foundation | 2026-04-28 | Library-operations support. Schema/spec foundation; not city-ready. |
| Townlight Parks | 0.1.1 | Foundation | 2026-04-28 | Parks-and-recreation support. Schema/spec foundation; not city-ready. |

<!-- END GENERATED MODULE STATUS -->

## Corrective Release Decision

In May 2026 the project audited and corrected overstated version labels; the full history is in [docs/release-recovery-status.md](docs/release-recovery-status.md).

As of 2026-05-14, the release-integrity decision is:

| Repo | Correct label | Status |
|---|---:|---|
| civiccore | v1.2.0 shipped | Real shared platform; v1.2.0 shipped the shared document-ingestion pipeline and now includes the Windows-local platform contracts plus PostgreSQL-backed task queue/worker. |
| civicclerk | v1.0.4 shipped | Real meeting workflow module release pinned to Townlight Core v1.2.0; protected staff auth defaults remain required. |
| civicrecords-ai | v1.7.3 shipped | Developer preview records module release pinned to Townlight Core v1.2.0 and consuming shared Townlight Core ingestion; v1.7.3 adds release-asset convention bring-up without functional installer behavior changes. |
| civiccode | v1.0.8 shipped | City-core module release pinned to Townlight Core v1.2.0; v1.0.8 supersedes the earlier v1.0.0 posture and carries release attestation. |
| civicnotice | v0.2.0 shipped | City-core public-notice workflow module release pinned to Townlight Core v1.2.0; installed through the Windows Local city-core profile with checklist, posting proof, archive export, backup/restore, and search wiring. |
| civicaccess | v0.4.0 city-core module release | Sixth city-core module on Townlight Core v1.2.0; accessibility + records-ready export; ships in the six-module Townlight Windows Local v1.0.2 release with three features on the suite's shared local AI engine. Phase D `clean_vm_dod_passed` PASS; `accessibility_passed` FAIL on v1.0.2 (the Accessibility tab was unreachable in the shipped shell and records-export wrote no artifact; both fixed on main). |
| civiczone | v0.2.2 | Narrow corrective release that lowered the version label to match actual maturity; no functional upgrade; queued for Tier 2 real work. |
| civicplan | v0.2.2 | Narrow corrective release that lowered the version label to match actual maturity; no functional upgrade; queued for Tier 2 real work. |
| civicpermit | v0.2.2 | Narrow corrective release that lowered the version label to match actual maturity; no functional upgrade; queued for Tier 2 real work. |
| civicinspect | v0.2.2 | Narrow corrective release that lowered the version label to match actual maturity; no functional upgrade; queued for Tier 2 real work. |
| civicgrants | v0.2.0 | Corrected from an earlier overstated v1.0.0 label; scaffold-depth grants support. |
| civicprocure | v0.2.0 | Corrected from an earlier overstated v1.0.0 label; scaffold-depth procurement support. |

All other modules remain foundation-only unless their own repo evidence says otherwise and the compatibility matrix agrees.

## What Works Today

- `civiccore` v1.2.0 is the current shared platform release and includes the shared document-ingestion pipeline, Windows-local platform contracts, and PostgreSQL-backed local task queue/worker used by the city-core module releases.
- `civicrecords-ai` v1.7.3 remains developer preview, consumes Townlight Core v1.2.0 shared ingestion, and keeps the city-core installer on the vendored-source path.
- `civicclerk` v1.0.4 is the current meeting workflow module release for city-core.
- `civiccode` v1.0.8 is the current municipal-code module release for city-core.
- `civicnotice` v0.2.0 is the current public-notice workflow module release for city-core.
- The active Windows Local city-core desktop path now covers first-run local folders, module profile selection, city profile, first Townlight admin sign-in, Gemma 4 12B QAT model setup, local users/RBAC, city-core workflows, task queue health, local file evidence, exports, backup/restore, repair, support bundle, and uninstall handoff. The clean-machine Windows Local lifecycle test passed end-to-end on a fresh Windows Sandbox for the 1.0.1 MSI, and the released 1.0.2 MSI passed Phase D clean-VM acceptance across two full Windows Sandbox runs (install → full wizard → admin sign-in → model download/verify → live AI output through the real app bridge).
- v1.0.2 fixed the suite's shared local-AI generation helper: it now calls the bundled Ollama's `/api/chat` instead of `/api/generate` with raw hand-built prompts (which bypassed the pinned model's own template/parser and produced unusable output against the real model). Because the helper is shared, the fix repaired output quality for every AI feature in the suite — Townlight Meetings minutes, Townlight Records responses, Townlight Code guidance, and the three Townlight Access features (generation config: temperature 0.2, num_predict 512, num_ctx 8192, 180 s timeout). Caught by the Phase D clean-VM dress rehearsal against the real model; fixed in [PR #220](https://github.com/townlight/townlight/pull/220) (merge `0b0170a`).
- v1.0.2 also fixed a clean-machine defect pre-existing across v1.0.x (not a Townlight Access regression): the runtime payload now stages the Microsoft VC++ runtime DLLs (`vcruntime140.dll`, `vcruntime140_1.dll`, `msvcp140.dll`) into `postgres\bin`, so the bundled PostgreSQL starts on a factory-fresh Windows PC with no VC++ redistributable installed. Found by Phase D clean-sandbox acceptance (`initdb.exe` failed with "VCRUNTIME140.dll was not found"); proven fixed in the second clean-sandbox run, where initdb built a full PostgreSQL 17.10 cluster with no system runtime present. Fixed in [PR #221](https://github.com/townlight/townlight/pull/221) (merge `0b797c4`).
- The suite-level `clerk-core` installer beta now records its verification evidence: clean-environment package testing, isolated test ports/projects, proof that workflows run on the installed stack, and full install-lifecycle testing on Linux itself covering install, repair, verify, backup, restore, and uninstall. For Windows and macOS, the earlier Docker-based wrapper profile's claims remain limited to archive/readiness checks until the same install-lifecycle testing passes on those operating systems.
- Townlight Access is the sixth city-core module at v0.4.0, with three of its tools running on the suite's shared local AI engine — real drafts, labeled fallbacks, human review always required. Its Accessibility workflow tab was built for v1.0.2 but a navigation omission left it unreachable in the shipped shell; that fix and the records-export fix land in the next release (see the Townlight Access section above).
- Townlight Zoning, Townlight Planning, Townlight Permitting, and Townlight Inspections carry v0.2.2 corrected version labels, not public-use release status.
- `civicgrants` and `civicprocure` contain useful scaffolds and local mocks, but they are not city-ready products.

## What Does Not Work Yet

A municipality should not treat Townlight as a finished full-suite procurement product today. The released beta is the Windows Local city-core package only: Townlight Core, Townlight Records, Townlight Meetings, Townlight Code, Townlight Notice, Townlight Access, and the desktop installer shell. Missing proof is module-by-module feature completion for the rest of the unified spec; the clean-machine gates for the Windows Local package have passed (the clean-machine install test on the v1.0.1 MSI, Phase D clean-VM acceptance on the v1.0.2 MSI). the Windows MSI is Authenticode code-signed via Azure Trusted Signing as of `v1.0.3`; macOS remains readiness-only, Tier 2 modules remain queued, and everything still runs fully local — no cloud calls, no telemetry.
