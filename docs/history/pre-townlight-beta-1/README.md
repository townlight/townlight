# Townlight

Eight connected local-first municipal products: Core, Records, Meetings, Code, Zoning, Planning, Permitting and Inspections. Human review, source provenance and explicit release decisions connect the work.

[Organization and all products](https://townlight.github.io/) · [Overall operating manual](USER-MANUAL.md) · [Feature/integration assessment](docs/assessment/feature-and-integration-review.md)

The accepted Windows workflows extend through signed [Inspections 1.7.0-beta.1](https://github.com/townlight/townlight/releases/tag/townlight-records-meetings-code-zoning-planning-permitting-inspections-v1.7.0-beta.1) and [Permitting 1.6.0-beta.1](https://github.com/townlight/townlight/releases/tag/townlight-records-meetings-code-zoning-planning-permitting-v1.6.0-beta.1); [Planning 1.5.1](https://github.com/townlight/townlight/releases/tag/townlight-records-meetings-code-zoning-planning-v1.5.1) retains its fresh-install boundary. The [default signed download](https://github.com/townlight/townlight/releases/tag/townlight-records-meetings-code-zoning-v1.4.0-beta.1) remains 1.4.0-beta.1 with Records-only selected by default. Newer compositions are explicit choices, not changed default downloads.

Use the product manual for the installed workflow and the exact release acceptance for its boundaries. The broader specifications contain confirmed gaps and explicit deferrals; accepted connected workflows do not establish every specified feature or every possible pairwise integration. No application or installer changes accompany this documentation update.

| Product | Operators | Release context | Guide |
|---|---|---|---|
| [Core](https://townlight.github.io/products/core/) | IT and platform maintainers | [Core 1.2.1, bundled in accepted desktop compositions](https://github.com/townlight/townlight/releases/tag/townlight-records-meetings-code-zoning-planning-permitting-inspections-v1.7.0-beta.1) | [Manual](https://github.com/townlight/core/blob/main/USER-MANUAL.md) |
| [Records](https://townlight.github.io/products/records/) | Records officers, clerks and authorized reviewers | [Records 1.7.4 in the accepted 1.7 desktop composition](https://github.com/townlight/townlight/releases/tag/townlight-records-meetings-code-zoning-planning-permitting-inspections-v1.7.0-beta.1) | [Manual](https://github.com/townlight/sunshine/blob/master/USER-MANUAL.md) |
| [Meetings](https://townlight.github.io/products/meetings/) | Clerks, meeting staff and authorized reviewers | [Meetings 1.0.4 in accepted connected desktops](https://github.com/townlight/townlight/releases/tag/townlight-records-meetings-code-zoning-planning-permitting-inspections-v1.7.0-beta.1) | [Manual](https://github.com/townlight/meetings/blob/main/USER-MANUAL.md) |
| [Code](https://townlight.github.io/products/code/) | Clerks, code custodians and legal reviewers | [Code 1.0.8 in accepted connected desktops](https://github.com/townlight/townlight/releases/tag/townlight-records-meetings-code-zoning-planning-permitting-inspections-v1.7.0-beta.1) | [Manual](https://github.com/townlight/ordinances/blob/main/USER-MANUAL.md) |
| [Zoning](https://townlight.github.io/products/zoning/) | Planners and authorized land-use staff | [Connected Zoning in signed desktop 1.4.0-beta.1 and later compositions](https://github.com/townlight/townlight/releases/tag/townlight-records-meetings-code-zoning-v1.4.0-beta.1) | [Manual](https://github.com/townlight/zone/blob/main/USER-MANUAL.md) |
| [Planning](https://townlight.github.io/products/planning/) | Planning staff and authorized reviewers | [Signed Planning 1.5.1, fresh-install scope](https://github.com/townlight/townlight/releases/tag/townlight-records-meetings-code-zoning-planning-v1.5.1) | [Manual](https://github.com/townlight/plan/blob/main/USER-MANUAL.md) |
| [Permitting](https://townlight.github.io/products/permitting/) | Permit intake and development-review staff | [Signed Permitting 1.6.0-beta.1](https://github.com/townlight/townlight/releases/tag/townlight-records-meetings-code-zoning-planning-permitting-v1.6.0-beta.1) | [Manual](https://github.com/townlight/permit/blob/main/USER-MANUAL.md) |
| [Inspections](https://townlight.github.io/products/inspections/) | Inspectors and authorized reviewing staff | [Signed Inspections 1.7.0-beta.1](https://github.com/townlight/townlight/releases/tag/townlight-records-meetings-code-zoning-planning-permitting-inspections-v1.7.0-beta.1) | [Manual](https://github.com/townlight/inspect/blob/main/USER-MANUAL.md) |

## Historical project reference

The retained sections below describe earlier release/package states. Their “unreleased” labels and older product coverage are historical; the table and operating manual above give the current accepted compositions. Detailed contributor/reference information remains available for its matching version.

# Townlight

## Planning 1.5.1 for fresh Windows installations

The opt-in staff Planning release uses the same signed, installed-accepted
1.5.1-beta.1 installer. It supports cited policy sources, saved staff analyses,
explicit review and permission-controlled snapshots. Records remains the default.
Choose the retained **Townlight Planning development preview** selection to opt in.
Historical-version upgrades are outside this release's supported scope.

[Planning release](https://github.com/townlight/townlight/releases/tag/townlight-records-meetings-code-zoning-planning-v1.5.1) ·
[Exact installer, evidence and operating limits](docs/installer/planning-1.5.1-fresh-install-release.md) ·
[Staff workspace guide](docs/desktop/planning-workspace.md)

Existing default downloads and historical releases below remain unchanged.

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

**Open-source, local-first municipal software, released one useful public
product at a time.**

## Planning development preview

The opt-in `planning-preview` source candidate adds native Planning sources,
staff analysis/review, exact snapshot export and explicit Records selection.
It is unreleased development work, separate from the signed 1.4 installer.
See the [preview manual and recovery boundaries](docs/installer/planning-development-preview.md).

## Historical Records + Meetings + Code — 1.3.0-beta.1 public beta

This release connects three products on one local Python/PostgreSQL
domain path. Select **city-core** during setup or in Settings: Core, Records,
Meetings, Code, Notice and Access. Records-only remains the default; existing
saved selections are preserved.

Code proposals can link to Meetings agenda items. An authorized human records
adoption explicitly; a motion or adopted minutes is not a mandatory prerequisite.
Codification is a separate decision. Records can attach permitted public Code
and Meetings documents with source history, version/effective-date citations
and content hashes preserved. Restricted material remains protected.

The obsolete Rust JSON business implementation is retired; Rust retains native
integration, supervision and migration/recovery support. Historical snapshots
remain available for supported migration, not fallback or dual writing.

**Release status:** the exact signed MSI and embedded EXE passed independent
signature/hash verification, fresh connected installed acceptance and a populated
signed Records–Meetings 1.2 upgrade on October 20, 2026. Recovery, offline use and
retained-data uninstall passed. This is a public beta, not general availability.
Download the signed MSI from the
[1.3.0-beta.1 release](https://github.com/townlight/townlight/releases/tag/townlight-records-meetings-code-v1.3.0-beta.1).
See [release acceptance](docs/installer/townlight-records-meetings-code-beta1-acceptance.md)
and [the manual](USER-MANUAL.md). Optional Meetings AI minutes/transcription and
the remaining suite products are not part of this bounded release.

## Previous public release: Townlight Records + Meetings

Townlight Records + Meetings 1.2.0-beta.1 is a signed, installed-tested public beta. It is a Windows
desktop system for public-records intake, deadline calculation, assignment,
search with citations, human exemption decisions, accessibility review,
approval, release packaging, fulfillment, public status, audit history, and
backup/restore, connected to meeting agendas, packets, notices, proceedings,
manual minutes and local archives. Permitted meeting documents attach to Records
with source identity, citation, hash and audit history retained.

Choose **Townlight Records + Meetings** (`meetings-beta`) for the connected profile:

- Townlight Core
- Townlight Records (`townlight/sunshine`)
- Townlight Meetings
- Townlight Notice
- Townlight Access

The default `records-beta` selection remains Records-only with Core, Notice and
Access; select `meetings-beta` explicitly to add Meetings. Code is not included.
The operator path requires no Docker, WSL, terminal, or
developer tooling.

The beta includes an explicit, local-admin-only fictional demo town. Redstone
Valley records are independently authored, deterministic, hashed, visibly
watermarked, and never loaded automatically. No Longmont or Longmont Public
Media content is redistributed in this fixture.

The release pipeline signs the desktop executable before packaging and then
signs the MSI. This release passed independent signature/hash verification,
fresh connected-workflow acceptance and a populated Records beta.3 upgrade on
October 19, 2026, including recovery and retained-data uninstall.
Install the signed MSI attached to the
[`townlight-records-meetings-v1.2.0-beta.1` release](https://github.com/townlight/townlight/releases/tag/townlight-records-meetings-v1.2.0-beta.1)
with its [completed installed-acceptance record](docs/installer/townlight-records-meetings-beta1-acceptance.md).
This is a public beta, not a general-availability release or completion of the
entire suite specification. Historical releases and dormant drafts are preserved.
Saving or successfully
generating different response text requires fresh human approval before export.
Failed generation, identical-text saves, and unrelated request edits preserve
approval; historical approval notes and exported files remain intact.
See [RELEASING.md](RELEASING.md) and
[USER-MANUAL.md](USER-MANUAL.md).

### Historical predecessor architecture (1.2 and earlier)

### Connected workflow boundaries

Authorized human workflow decisions remain explicit and audited. Draft minutes
may be posted before adoption and remain labeled as drafts; signing is separate
from adoption. Restricted archives remain protected. Attaching a permitted
Meetings source does not approve or publish a Records response. Local archives
are not an automatically hosted public website. Optional native Meetings AI
minutes/transcription and Code are not part of this release claim.

### Released Records architecture

After explicit activation, beta.3 routes Records through the bundled Python
service and PostgreSQL database. Validated import preserves existing requests,
audit history, Access evidence and exports. The old JSON becomes read-only
historical evidence, not a fallback or a way to recover newer work.
See the upgrade and recovery instructions in [USER-MANUAL.md](USER-MANUAL.md).

Rust retains native desktop integration, supervision and unmigrated city-core
compatibility handlers. This is one active connected Python/PostgreSQL domain
path, not a claim that all municipal Rust has been deleted. Code remains a future
stage under the connected-system plan. Historical Records beta.3 remains preserved.

Public branding is Townlight. Existing `civic*` imports, database names,
environment variables, MSI identity, and legacy data paths remain compatibility
identifiers until explicit migrations exist.

---

## Historical predecessor suite status (not current)

The material below is retained for audit/history. It describes the earlier
CivicSuite city-core releases and must not be read as the current Townlight
Records candidate or release instructions.

Status snapshot: **2026-07-02** (current release: `civicsuite-windows-local-v1.0.2`, Latest — GA candidate, open for public beta)

| Tier | Scope | What it means today |
|---|---:|---|
| City-core module releases | CivicCore plus 5 product repos | CivicCore v1.2.0 is the shared platform release and now carries the Windows-local platform contracts plus PostgreSQL-backed task queue/worker. CivicRecords AI v1.7.3, CivicClerk v1.0.4, CivicCode v1.0.8, CivicNotice v0.2.0, and CivicAccess v0.4.0 are the city-core module releases. The shipped product path is the Windows Local Tauri/WebView2 desktop app with a portable-native runtime and local-only clerk path. |
| Queued modules | Tier 2 | CivicZone, CivicPlan, CivicPermit, and CivicInspect are queued on corrected version labels, not city-core public-use releases. |
| Foundation / planned | 18 named product modules | The rest of the visible catalog has bounded runtime foundations or implementation specs. These are not city-ready products. `CivicRegWatch` and `CivicAPI` are planned modules with detailed specs but no runtime repos yet. The reconciled unified spec, installer metadata, and live GitHub org state now enumerate 27 product modules plus CivicCore. |

`civiccore` is the shared platform package consumed by every module; v1.2.0 is the current city-core platform release with shared document ingestion, Windows-local platform contracts, the PostgreSQL-backed local task queue/worker, shared `staff_key_gate` support, and the earlier auth-error-payload hardening included.

The most important distinction: **"all repos have releases" is not the same thing as "a city can run on this suite."** That gap is what the [release-verification gates](docs/release-recovery-status.md) exist to close.

## Historical 2026-07-02 availability snapshot

- **`civicrecords-ai`** (FOIA / public records) - v1.7.3 — city-core records module, shipped in the v1.0.2 build, on CivicCore v1.2.0. Repo: <https://github.com/townlight/sunshine>
- **`civiccore`** (shared platform) - v1.2.0 is the current shared-platform release for city-core. Repo: <https://github.com/townlight/core>
- **`civicclerk`** (meetings/agendas/minutes) - v1.0.4 is the current meeting workflow module release with protected staff auth defaults. Repo: <https://github.com/townlight/meetings>
- **`civiccode`** - v1.0.8 is the current municipal-code city-core module release on CivicCore v1.2.0.
- **`civicnotice`** - v0.2.0 is the current public-notice city-core module release on CivicCore v1.2.0.
- **`civicaccess`** - v0.4.0 accessibility and records-ready export city-core module release on CivicCore v1.2.0 (sixth city-core module; its clerk-facing Accessibility workflow tab — with three local-AI features — is the headline of the current v1.0.2 build).
- **`civiczone`, `civicplan`, `civicpermit`, `civicinspect`** - queued Tier 2 modules on corrected version labels; not part of city-core.
- **`civicgrants`, `civicprocure`** - tagged v1.0.0 after (in violation of) the 2026-05-07 release halt; those false labels are being superseded by early-stage v0.2.0 recovery releases ([history](docs/release-recovery-status.md)).
- **`CivicRegWatch` and `CivicAPI`** — planned modules. Detailed specs in [specs/05_civicregwatch.md](specs/05_civicregwatch.md) and [specs/06_civicapi.md](specs/06_civicapi.md); no runtime repos yet.
- **The remaining 14 modules** are foundation-tier: schemas, sample workflow slices, tests, and release gates. They do not yet ship the workflow, security, identity, connector, or operational depth required for municipal use.

For honest module-by-module status see [STATUS.md](STATUS.md).

## Historical 2026-07-02 priorities

The canonical roadmap lives at [docs/roadmap/index.md](docs/roadmap/index.md). As of 2026-07-02 the suite runs under the [full-suite finishing program](docs/roadmap/full-suite-program.md): all 27 modules finished one at a time behind a clean-VM definition of done, on the portable-native Windows runtime per [ADR-0008](docs/architecture/ADR-0008-portable-native-windows-runtime.md)/[ADR-0009](docs/architecture/ADR-0009-postgres-backed-queue-windows-profile.md) — the runtime v1.0.2 already ships. The immediate sequence within that program:

1. Public-beta feedback intake and fixes for the shipped v1.0.2 city-core build.
2. Module-by-module finishing in the program's approved order, one module in flight at a time.

The Windows MSI is Authenticode code-signed via Azure Trusted Signing. Because the certificate is new, Windows SmartScreen may still show *"Windows protected your PC"* on first run — click **More info**, confirm it shows a **verified publisher** (not "Unknown Publisher"), then **Run anyway**. This is normal for a newly-signed app and stops as the certificate builds reputation. See [docs/troubleshooting.md](docs/troubleshooting.md#windows-smartscreen-when-you-run-the-installer).

## Historical predecessor quick start

**Windows Local city-core (current beta target):** the active installable product path is the CivicSuite desktop app under `desktop/`. It packages a Tauri/WebView2 Windows MSI, a portable PostgreSQL 17 + pgvector data store, bundled CPython city services, a PostgreSQL-backed task queue, local file storage, local backup/restore, local repair/support-bundle flows, Windows uninstall handoff, and Gemma 4 12B QAT Q4_0 model setup through explicit download/checksum/runtime registration.

- City Core installs CivicCore plus CivicRecords AI, CivicClerk, CivicCode, CivicNotice, and CivicAccess. CivicCore is always installed and cannot be deselected.
- 32 GB RAM is recommended (16 GB is a workable minimum) — headroom for the local model resident alongside PostgreSQL and the services.
- The end-user Windows clerk path does not require Docker, WSL, a terminal, a browser URL, or developer tooling.
- First-run setup covers local folders, module selection, city profile, first CivicSuite admin sign-in, backup folder, model download/verification, health verification, and finish.
- Trust path: download `CivicSuite_1.0.2_x64_en-US.msi` from the [civicsuite-windows-local-v1.0.2 release](https://github.com/townlight/townlight/releases/tag/civicsuite-windows-local-v1.0.2), verify its SHA-256 `bbdeb1b69e846d3ccb8c961502f4b2f158e92623e7bf4dfa9d4c4bf2f9a0fd02`, and confirm the module pins in [installer/modules.json](installer/modules.json).
- macOS and Linux package paths remain separate future or historical profiles until each has refreshed install-lifecycle testing on the same operating system it ships for.

See [docs/troubleshooting.md](docs/troubleshooting.md) for operator recovery guidance, [installer/README.md](installer/README.md) for the generated-package contract, and [docs/installer/suite-installer-plan.md](docs/installer/suite-installer-plan.md) for the plan.
Operators evaluating the Windows Local city-core beta path should use [docs/installer/operator-walkthrough.md](docs/installer/operator-walkthrough.md).

**Per-module install path:**

- FOIA / public records: <https://github.com/townlight/sunshine> - module release consumed by the Windows Local city-core package.
- Other modules: see each module's README for install instructions. Most modules ship as Python packages depending on `civiccore`.

If you are orienting yourself for the first time, read in this order:

1. [STATUS.md](STATUS.md) — module-by-module honest status
2. [FAQ.md](FAQ.md) — common operator questions
3. [USER-MANUAL.md](USER-MANUAL.md)
4. [docs/release-recovery-status.md](docs/release-recovery-status.md) — what "provisional" actually means
5. [CHARTER.md](CHARTER.md) — the engineering principles
6. [docs/CivicSuiteUnifiedSpec.md](docs/CivicSuiteUnifiedSpec.md) — architectural intent (note: per-module status lines in the spec are stale; use STATUS.md for current truth)
7. [docs/compatibility/index.md](docs/compatibility/index.md) — module ↔ civiccore version pairings (this is the single source of truth for version pairings)

## Repo Map

| Repo | Role |
|---|---|
| `civicsuite` | Umbrella: roadmap, governance, specs, ADRs, compatibility matrix, suite-installer scaffolding |
| `civiccore` | Shared platform package consumed by every module |
| `civicrecords-ai` | v1.7.3 — city-core records module (FOIA/public records), shipped in the v1.0.2 build |
| `civicclerk` | v1.0.4 meeting workflow city-core module release |
| `civiccode` | v1.0.8 municipal-code city-core module release |
| `civicnotice` | v0.2.0 public-notice workflow city-core module release |
| `civicaccess` | v0.4.0 city-core module release (sixth city-core module — its Accessibility tab, with three local-AI features, shipped in v1.0.2) |
| `civiczone` | Queued Tier 2 land-use module on a corrected version label |
| `civicplan` | Queued Tier 2 planning module on a corrected version label |
| `civicpermit` | Queued Tier 2 permit module on a corrected version label |
| `civicinspect` | Queued Tier 2 inspection module on a corrected version label |
| `civicgrants`, `civicprocure` | v0.2.0 early-stage recovery releases; remaining modules are foundation-tier |
| `civicregwatch` | Planned federal regulatory intelligence module; spec exists, repo not scaffolded |
| `civicapi` | Planned public read-only data gateway module; spec exists, repo not scaffolded |

## Architecture

Townlight uses a deliberately boring stack. Every module inherits these defaults:

| Layer | Choice | Pin / Notes |
|---|---|---|
| Backend | FastAPI on Uvicorn | — |
| Database | PostgreSQL 17 + `pgvector` | Required for vector search |
| Queue | PostgreSQL-backed Townlight Core task queue | Windows Local profile |
| Workers | Bundled CPython city services | Windows Local profile |
| LLM runtime | Ollama (local) | Default Gemma 4 family |
| Embeddings | `nomic-embed-text` | Local |
| Frontend | Tauri/WebView2 desktop shell | Windows Local profile |

**Dependency rule:** modules depend on `civiccore`; `civiccore` never depends on modules. Cities run the stack on their own hardware. No cloud, no telemetry, no per-seat pricing.

The installable six-module city-core beta shipped in `civicsuite-windows-local-v1.0.2`; the remaining modules deepen one at a time rather than all 27 product modules becoming equally deep at once. That distinction is intentional and load-bearing.

For the full architecture diagram and data-flow rules, see [ARCHITECTURE.md](ARCHITECTURE.md). For the dependency-pinning matrix between modules and civiccore versions, see [docs/compatibility/index.md](docs/compatibility/index.md).

## Continuity

Continuity is now an explicit gate, not a "later" governance item.

- Continuity plan: [SUCCESSION.md](SUCCESSION.md)
- Governance index: [docs/governance/index.md](docs/governance/index.md)
- Charter: [CHARTER.md](CHARTER.md)

The `CivicSuite` GitHub org has two active owners (`scottconverse` and `APirateMonk`).

## Documentation

- Front door: this README
- Status: [STATUS.md](STATUS.md)
- FAQ: [FAQ.md](FAQ.md)
- Architecture: [ARCHITECTURE.md](ARCHITECTURE.md)
- Recovery status: [docs/release-recovery-status.md](docs/release-recovery-status.md)
- Troubleshooting: [docs/troubleshooting.md](docs/troubleshooting.md)
- Roadmap: [docs/roadmap/index.md](docs/roadmap/index.md)
- Governance: [docs/governance/index.md](docs/governance/index.md)
- Compatibility matrix: [docs/compatibility/index.md](docs/compatibility/index.md)
- Unified spec (architectural intent only — see STATUS.md for current truth): [docs/CivicSuiteUnifiedSpec.md](docs/CivicSuiteUnifiedSpec.md)
- User manual: [USER-MANUAL.md](USER-MANUAL.md)

## Licensing

- Documentation: CC BY 4.0
- Owned code in this private candidate: AGPL-3.0-only (see LICENSE-CODE). Historical Apache grants are preserved.
- New Townlight code candidates follow AGPL-3.0-only; suite-wide reconciliation is tracked separately. Documentation remains CC BY 4.0.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the bug-routing decision tree. By participating, you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).

## Support

See [SUPPORT.md](SUPPORT.md) for support paths and [SECURITY.md](SECURITY.md) for vulnerability reporting.
## Historical Z2 development checkpoint (superseded by 1.4)

The local development branch adds parcel-scoped allowed/conditional/prohibited-use
and dimensional answers bound to actual Townlight Code section, version, effective
date and source identities. Unsupported, conflicting or stale bindings are shown
as needing planner attention, not invented determinations. This is structured
staff-configured lookup, not AI interpretation or legal advice.

The separate Zoning desktop component has resident lookup/question controls and
an authenticated staff workspace: cited rule registration, persisted question
history, planner queue, corrections, basic counts/repeated questions and draft
report outlines. Human corrections do not require an earlier automated flag,
nonempty justification or an extra approval. Original answers and audit history
remain intact. Staff notes/reviews are not included in resident responses.

This is not a released or installed Zoning candidate. The published
Records–Meetings–Code 1.3.0-beta.1 is unchanged. The Z2 operator guide is
zone/docs/Z2-CITED-WORKFLOWS.md.

## Historical Z3 development checkpoint (superseded by 1.4)

Authorized staff can explicitly link a permitted public Meetings archive document
to a Zoning question as hearing context, context or precedent. This is historical
context, not a Code amendment or binding determination. Links retain source IDs,
archive/version identities, content hashes and actor history.

Staff can create a separate immutable Zoning source snapshot and select eligible
snapshots from Records. Staff-only snapshots and private review notes are not
offered as public Records sources. Permissions and content hashes are rechecked
when retrieving or attaching sources; a saved link does not bypass later access
restrictions. Existing stored evidence is preserved rather than rewritten.

Creating or attaching a snapshot does not approve a response or publish anything.
Human corrections remain available without an automatic flag or mandatory
justification. Packaged/installed acceptance and opt-in profile delivery remain
Z4. See zone/docs/Z3-CONNECTED-SOURCES.md. No new public release is claimed.
