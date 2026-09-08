# Townlight Records — User Manual

**Candidate version:** 1.1.0-beta.1

**Last updated:** 2026-08-20

**Publication status:** release candidate; not yet a published beta

Townlight Records is a local-first Windows system for receiving, searching,
reviewing, approving, releasing, and tracking municipal public-records
requests. The first product profile installs Townlight Core, Townlight Records,
Townlight Notice, and Townlight Access.

## Before installing

Do not use an unsigned GitHub Actions artifact as a public release. The beta is
ready for external use only when a prerelease named
`townlight-records-v1.1.0-beta.1` appears under the
[Townlight releases page](https://github.com/townlight/townlight/releases) with
the signed MSI and its evidence file.

Before running the MSI:

1. Confirm its Authenticode status is `Valid`.
2. Confirm the signer subject matches the identity published with the release evidence.
3. Compare the MSI's SHA-256 with the release evidence.
4. Install only the exact signed asset attached to the release.

Townlight runs locally. The normal operator path does not require Docker, WSL,
a terminal, or a hosted vendor account. A local AI model is optional for the
deterministic Records demo journey; human review remains mandatory before
release.

## First run

1. Choose the local data and backup folders. The application location is owned
   by Windows Installer.
2. Keep the default **Townlight Records** profile unless you are intentionally
   testing another profile. Townlight Core cannot be removed.
3. Enter the municipality name, state, time zone, and records contact.
4. Create the first Townlight admin and store its passcode in an approved
   password vault.
5. Sign in as that admin and confirm the backup folder.
6. Complete System Health. If you will use local-AI features, download, verify,
   and start the pinned model through the guided controls.
7. Finish setup and open Records Requests.

## Load the fictional demonstration town

The beta includes **Town of Redstone Valley (Fictional)**. Loading is explicit
and restricted to a signed-in Townlight admin.

1. Start with an empty local city-work profile.
2. Open **Records Requests** on the Staff surface.
3. Select **Load demo town** and confirm the guided review.
4. Verify the persistent synthetic-data banner and watermark.

Townlight creates and verifies a backup before loading, validates the fixture
and artifact hashes, writes atomically, reads the saved state back, and restores
the prior state if verification fails. It refuses to overwrite an existing
non-empty profile and never loads demo content automatically.

All visible people, places, cases, contacts, and records in this fixture are
fictional. No Longmont or Longmont Public Media text, files, videos, or
transcripts are redistributed.

## Complete the Records beta journey

Use the fictional request to verify the product end to end:

1. Calculate the response deadline and record its human-readable basis.
2. Assign the request to a records officer.
3. Record a search session with searched locations, results, and exact
   citations.
4. Review possible exemptions and save the human decision and basis. Townlight
   does not auto-deny or auto-redact.
5. Open **Accessibility** and run the deterministic review on the proposed
   public response.
6. Return to Records, save the response draft, and record explicit human
   approval.
7. Build the release package and export the response.
8. Mark the request fulfilled, then close it.
9. Switch to **Resident/Public** and verify that public status is visible while
   staff-only reviewer/contact information is absent.
10. Open **System Health**, create a backup, restore it, restart Townlight
    offline, and confirm the request and audit history remain available.

## Backup, repair, and uninstall

- **Backup Now** creates a manifest-backed local profile backup.
- **Restore Latest Backup** verifies the backup before replacing current state
  and preserves the per-install secret.
- **Repair** uses Windows Installer to repair product files without replacing
  municipal data.
- **Prepare Uninstall** creates a final backup before local profile removal.
- Windows **Installed apps** removes the Townlight application. Verify the
  agreed retention choice for municipal data and backups separately.

## Beta limits and architecture

The Records beta's user-facing domain workflow currently executes in the Rust
desktop application. The installed Python/FastAPI Records, Notice, and Access
packages are reference/contract implementations for this release, not the
desktop execution path. A blocking convergence program moves domain work to a
single Python/PostgreSQL path before Townlight Meetings ships.

Public names use Townlight. Existing `civic*` package/import IDs, database and
schema names, environment variables, MSI identity, and legacy local-data paths
remain compatibility identifiers until an explicit migration exists.

## Support and evidence

- Current release process: [RELEASING.md](RELEASING.md)
- Troubleshooting: [docs/troubleshooting.md](docs/troubleshooting.md)
- Architecture: [ARCHITECTURE.md](ARCHITECTURE.md)
- Honest current status: [STATUS.md](STATUS.md)
- Source and artifact provenance: [PROVENANCE.md](PROVENANCE.md)

---

## Historical predecessor manual (not current)

The remainder of this file is retained as a historical CivicSuite city-core
manual. Its old product names, versions, download links, and module bundle are
not instructions for the Townlight Records beta.

## Part 1 — For municipal decision-makers

### What is CivicSuite?

CivicSuite is an **open-source municipal product family**. It is not one giant program. It is a planned collection of modules a city can install one at a time, on its own hardware, on its own schedule. Cities do not need to send operational data to a vendor cloud, do not pay per seat, and can inspect or modify the source code.

### Current honest state

The Windows Local city-core package (`civicsuite-windows-local-v1.0.2`) is a **GA candidate now open for public beta**: validated end-to-end on a clean machine. The MSI is Authenticode code-signed via Azure Trusted Signing; a new certificate has no reputation yet, so Windows SmartScreen may still prompt on first run — click *More info*, confirm it shows a verified publisher (not "Unknown Publisher"), then *Run anyway* (see [docs/troubleshooting.md](docs/troubleshooting.md)). For the **other** modules, public "shipping," "product-ready," and "v1.0.0 proves release maturity" claims remain frozen until each repo re-earns that status through the release-verification gates in [docs/release-recovery-status.md](docs/release-recovery-status.md).

- `civiccore` is the shared platform; v1.2.0 is the current city-core platform release.
- `civicrecords-ai` (FOIA / records) is the current developer-preview records module release at v1.7.3.
- `civicclerk` (meetings) is the current meeting workflow module release at v1.0.4.
- `civiccode` is the current municipal-code module release at v1.0.8.
- `civicnotice` is the current public-notice workflow module release at v0.2.0.
- `civicaccess` v0.4.0 (accessibility + records-ready export) is the sixth city-core module release on CivicCore v1.2.0; the Accessibility tab ships in the desktop shell as of v1.0.2 (see Part 1.6).
- CivicZone, CivicPlan, CivicPermit, and CivicInspect are queued Tier 2 modules, not city-core products.
- The active city-core installer path is the Windows Local Tauri/WebView2 desktop app with portable local runtime services, local backup/restore, local file evidence, local model setup, and a normal Windows uninstall entry.
- The desktop app is the staff, resident/public preview, and IT/admin front door for the current city-core beta package. It is local-only by default and does not require Docker, WSL, a terminal, or developer tooling for the clerk path.

A municipality should evaluate the Windows Local city-core package as a beta package, not as a completed full-suite procurement product.

### Callout — how the CivicAccess module arrived (v1.0.1 → v1.0.2)

> **In plain English.** CivicSuite v1.0.1 bundled the **CivicAccess** module under the hood — its code was installed on disk, its database tables were created on first run, a secret token was provisioned for it, and the system reported it as available — but there was no on-screen tab yet. **The current v1.0.2 release ships the on-screen "Accessibility" workflow tab and its buttons**, so a clerk now sees six workflow areas (Meetings, Records, Code, Notice, Accessibility, Search). Three of the tab's tools draft with the suite's local AI engine — see Part 1.6 for what they do and the human-review rules that apply.

> **For IT.** Per the [2026-06-29 deep-read audit](docs/audits/civicaccess-citycore-deep-read-2026-06-29/FINAL-REPORT.md), v1.0.1 bundled the module's runtime without UI (Phases B/C). v1.0.2 completed it: PR [#216](https://github.com/townlight/townlight/pull/216) delivered the native Accessibility tab and PR [#220](https://github.com/townlight/townlight/pull/220) put its three drafting tools on the shared local AI engine, with deterministic fallbacks retained.

### What this means for your city

- **No vendor lock-in.** You run the software on your own hardware.
- **No mandatory cloud dependency.** Local-first by design.
- **No per-seat billing.** The Apache 2.0 license forecloses metering.
- **You can evaluate one module at a time.** No need to adopt the whole suite.
- **You still own operations.** Not a managed SaaS. Your IT team, or a contractor you choose, runs install / upgrades / recovery.

---

## Part 1.5 — Your first task with the city-core desktop app

If you want to try CivicSuite today, start with the Windows Local city-core desktop installer and the operator walkthrough in [docs/installer/operator-walkthrough.md](docs/installer/operator-walkthrough.md).

### Prerequisites

- A Windows workstation with enough CPU, memory, and disk for local services, city data, backups, and the Gemma 4 12B QAT model file.
- Permission to install normal Windows desktop software.
- A stable internet connection for first install and model download unless IT has already staged the model file.
- A city name, records contact, clerk contact, first CivicSuite admin name/email, and backup folder location.

### System requirements

- **Operating system.** 64-bit Windows 10 or Windows 11 with the WebView2 runtime (current Windows builds include it).
- **Memory.** 32 GB RAM recommended (16 GB is a workable minimum). The local Gemma 4 12B QAT model needs about 6.7 GB resident at runtime on top of Windows, the portable PostgreSQL store, and the local services; 32 GB leaves comfortable headroom for the local database and the generation context.
- **Disk.** About 15 GB free at minimum: roughly 1.65 GB for the MSI, about 7 GB for the downloaded model file, and headroom for city data and backups. First-run setup enforces a 15 GB free-disk floor before the model download.
- **Network.** A stable internet connection for the first install and the model download, unless IT has already staged the model file.

### Install (Windows Local desktop)

1. Download `CivicSuite_1.0.2_x64_en-US.msi` from the current GitHub release: <https://github.com/townlight/townlight/releases/tag/civicsuite-windows-local-v1.0.2>.
2. Verify the SHA-256 checksum matches the published value: `bbdeb1b69e846d3ccb8c961502f4b2f158e92623e7bf4dfa9d4c4bf2f9a0fd02`.
3. Open the installer and follow the installer screens.
4. Open CivicSuite after install.
5. Complete first-run setup: local folders, City Core module selection, city profile, first CivicSuite admin sign-in, backup folder, Gemma 4 12B QAT download/resume, checksum verification, health verification, and finish.
6. Add clerk, records, code, or city-staff users from Settings when staff need separate local sign-ins.
7. Use Meetings & Notices, Records Requests, Code & Ordinances, Search City Knowledge, System Health, and Settings from the desktop app.

### Install (Linux / macOS)

Linux and macOS are not the current clerk install promise for Windows Local 1.0. Treat older Linux/macOS archive evidence, and evidence from the earlier Docker-based wrapper profile, as historical until those profiles receive their own refreshed install-lifecycle testing on the same operating system they ship for.

### Trust path for city-core artifacts

City-core artifacts ship from the published GitHub release, not restored committed `installer/dist` files. Before testing a package:

1. Download from the published release tag: <https://github.com/townlight/townlight/releases/tag/civicsuite-windows-local-v1.0.2>.
2. Verify the MSI SHA-256 matches the published value: `bbdeb1b69e846d3ccb8c961502f4b2f158e92623e7bf4dfa9d4c4bf2f9a0fd02`.
3. Confirm the source pins in `installer/modules.json` match the city-core module commits.
4. For module release assets, confirm the published SHA256 and attestation assets recorded in the module release evidence where applicable.

Do not restore old generated installer artifacts unless the maintainers explicitly decide that those artifacts should be restored.

### First task: complete local setup

1. Open CivicSuite from Windows.
2. Complete the City Core setup checklist.
3. Create the first CivicSuite admin and store the passcode in the city's password vault.
4. Add staff users from Settings.
5. Open System Health and verify local services, local model, storage, backup, and task queue status.
6. Start with one real workflow: create a meeting in Meetings & Notices, create a records request in Records Requests, or import a code source in Code & Ordinances.

### What you should expect

- **What works in the Windows Local city-core target.** Local setup, city profile, local users/RBAC, meetings/notices/minutes/votes/archive workflows, public-notice checklist/posting/archive workflows, records intake/search/review/response/export workflows, municipal code import/guidance/publish/handoff workflows, cross-module local search, health, backup/restore, support bundle, repair, and uninstall handoff. The current v1.0.2 MSI artifact has passed its clean-machine gates: the clean-machine install test on v1.0.1 and the Phase D clean-VM acceptance on v1.0.2.
- **What still needs its own proof gate.** Each future module outside the city-core set.
- **What's not in this package.** The remaining module catalog is installed later through the module-manager contract after each module passes package and proof gates.

### Where to go next

- For real evaluation: stand up a non-production tenant, ingest a representative document corpus, and run a week of internal staff requests through it.
- For procurement: wait for a later procurement-readiness gate; this beta package (version labels reconciled with what actually works) is not procurement-ready.
- For development: read [CONTRIBUTING.md](CONTRIBUTING.md) and the records-ai `docs/`.

---

## Part 1.6 — Accessibility tab: first-clerk walkthrough

**For clerks.** Starting in v1.0.2, the desktop app has an **Accessibility** tab between Public Notices and Search City Knowledge. It gives you seven small tools for getting public-facing text and forms in better shape before you publish them:

- **Accessibility Review (WCAG sample)** — paste a document's title and body text and run a sample check. It flags things like a missing title, missing alt text on images, very long unbroken paragraphs, or text that isn't tagged as English. An empty field just becomes a flagged item, not an error — you can save a review with findings and come back to fix them. When the local AI model is ready, the saved review also includes a short **AI remediation analysis** — which finding to fix first and why — clearly labeled as advisory; the AI never adds or removes findings, and reviews save normally even if the AI engine is down.
- **Plain-Language Rewrite** — when the local AI model is ready, drafts a real plain-language rewrite of your text on this machine (nothing is sent anywhere). If the AI engine is not ready, it falls back to a simple phrase swap ("remit payment" → "pay") and tells you so. Either way it's a starting draft, not a finished rewrite — a person still needs to read it before it goes out.
- **Multilingual Variant** — when the local AI model is ready, drafts a translation of your actual text into the language you name. If the AI engine is not ready, you get a canned sample line for Spanish or Vietnamese, or a placeholder for any other language, clearly labeled. No output from this tool is a certified translation; every draft must go to a qualified human translator before publication.
- **Accessible Form Plan** — checks that a form you're planning has a name field, a contact field, and a way to describe the request, and gives you a short checklist either way.
- **Publishing Workflow Checklist** — tells you what's still missing (review done? plain-language summary attached? translation reviewed?) before you publish something.
- **ADA Title II Review-Support Plan** — a starting checklist for a service or program review; it does not replace your ADA coordinator's sign-off.
- **Tagged-PDF Expectation Plan** — checks that the heading levels you plan to use in a PDF start at 1 and don't skip a level (e.g., jumping from H1 straight to H3), which is one of the most common ways PDFs fail accessibility checks.

**The AI engine status, in plain terms.** The three AI-capable tools (review analysis, rewrite, variant) run on the same local AI model the rest of CivicSuite uses — the one downloaded during first-run setup. If that model is missing or broken (for example, the file was deleted), the tab shows a banner: *"AI engine not ready"* — with a button that takes you straight to the model setup screen in System Health. Until it's fixed, the three tools run in clearly-labeled sample mode, and the five WCAG checks plus all four checklist tools keep working exactly as before. Nothing dead-ends. Running any of the three AI-capable tools first shows a review-before-you-run confirmation (the same pattern as the app's other AI drafting buttons), because a real AI draft can take a couple of minutes on modest hardware.

Every review you save shows up in a list below the forms (the most recent 20 by default; use the "Show all" button if you have more). Each row has a **Generate Records-Ready Export** button (packages an advisory checklist, not a certified document) and a **Delete Review** button if you saved one by mistake — clicking Delete Review opens a confirmation screen showing that review's title and status before anything is removed, the same review-before-you-commit pattern used throughout the app. **Persisted reviews are advisory clerk support, not a certified accessibility audit.** That line is on every page in this tab. Final compliance sign-off always comes from a qualified human reviewer, not this tool.

One known gap as of v1.0.2: there is no standalone "build me an export checklist" tool that works without first saving a review — you save a review, then export it. A separate before-you-save preview tool is planned for a later release.

**For IT/technical readers.** The Accessibility tab is a native Rust port of the standalone CivicAccess module's helpers (`access_review.py`, `plain_language.py`, `multilingual.py`, `workflows.py`), run against a `state.access` field on the same `city-work.json` the other five city-core modules use — no separate database call for this tab. As of v1.0.2 the three AI-capable tools call the suite's local model layer (`model.rs::generate_local_text`, the bundled Ollama serving the pinned Gemma 4 12B QAT Q4_0 on `127.0.0.1:15434`) — the same path CivicClerk minutes drafts, CivicRecords response drafts, and CivicCode guidance use, with a per-call live readiness probe and a deterministic fallback branch when the six readiness checks don't all pass. AI analyses persist on the saved review as optional `ai_analysis`/`ai_analysis_model` fields (older saved states load unchanged). Every action writes to both a per-module `audit_events` mirror and the platform-wide hash-chained `audit_entries` (capped FIFO past 5,000 per-module events; the global chain is uncapped), and AI-path audit entries name the runtime model used. Saved reviews surface in cross-module Search City Knowledge alongside meetings, records, code, and notices. Input length caps mirror the upstream Pydantic models (title 500 chars, body/text 5000 chars, language tag 80 chars). The upstream Python module remains deterministic v0.4.0; the AI integration lives in the desktop Rust port, matching how the other AI-capable modules ship.

---

## Part 2 — For developers and IT staff

### What lives in the umbrella repo?

The `civicsuite` repo is **documentation-, governance-, and coordination-first**. It contains:

- the [Charter](CHARTER.md), [Continuity plan](SUCCESSION.md), [Compatibility matrix](docs/compatibility/index.md), [Roadmap](docs/roadmap/index.md)
- the [Shared extraction consumer rollout playbook](docs/roadmap/shared-extraction-consumer-rollout.md)
- the unified suite specification and module catalog under `docs/` and `specs/`
- suite-level governance and ADRs
- the **suite installer** under `installer/` (a prior Clerk-Core starter release path plus the active city-core profile work)
- verification scripts under `scripts/`

The umbrella does **not** contain runtime code for individual products — that lives in the per-module repos.

### Module repos

| Repo | Status (see STATUS.md for full detail) |
|---|---|
| `civicrecords-ai` | v1.7.3 developer-preview city-core records module release |
| `civiccore` | Shared platform; v1.2.0 current city-core platform |
| `civicclerk` | v1.0.4 meeting workflow city-core module release |
| `civiccode` | v1.0.8 municipal-code city-core module release |
| `civicnotice` | v0.2.0 public-notice workflow city-core module release |
| `civicaccess` | v0.4.0 accessibility + records-ready export city-core module release (sixth city-core module — bundled since v1.0.1; its on-screen Accessibility tab ships as of v1.0.2, see Part 1 callout) |
| `civiczone`, `civicplan`, `civicpermit`, `civicinspect` | Queued Tier 2 modules on corrected version labels (version lowered to match actual maturity) |
| `civicgrants`, `civicprocure` | v0.2.0 corrected version labels at scaffold depth |
| All others | Foundation surfaces (v0.1.x) |
| `civicregwatch`, `civicapi` | Planned; spec only |

### Dependency rule

**Modules depend on `civiccore`. `civiccore` never depends on modules.**

### How to evaluate a module

1. Read the module's `README.md`.
2. Read the module's `USER-MANUAL.md`.
3. Read the module's `CHANGELOG.md`.
4. Follow the module's `CONTRIBUTING.md` install steps on a clean machine.
5. Run the module's verification gates (`scripts/verify-release.sh` if present).
6. Cross-check against [STATUS.md](STATUS.md) and [docs/release-recovery-status.md](docs/release-recovery-status.md) before promoting any claim about the module.

### How releases are coordinated

When shared-platform behavior changes:

1. `civiccore` ships first.
2. Consumer modules adopt via a bounded rollout.
3. The compatibility matrix is updated.
4. Current-facing docs are updated in both the consumer repo and the umbrella repo when suite-level status changes.

The current standardized consumer adoption process: [docs/roadmap/shared-extraction-consumer-rollout.md](docs/roadmap/shared-extraction-consumer-rollout.md).

### How to contribute

- Suite-wide roadmap, governance, compatibility, or umbrella documentation work belongs in this repo.
- Product / module bugs and features belong in the relevant module repo.
- The umbrella repo also holds the suite-installer scaffolding and verification scripts; contributions to those land here.

Start with [CONTRIBUTING.md](CONTRIBUTING.md) and [docs/governance/index.md](docs/governance/index.md).

---

## Part 3 — Architecture reference

The full suite architecture, dependency graph, data-flow rules, and CivicCore extraction phasing live in [ARCHITECTURE.md](ARCHITECTURE.md). The text-and-ASCII summary below is a quick orientation; the full diagram is in ARCHITECTURE.md.

### Suite topology (generated summary)

<!-- BEGIN GENERATED SUITE TOPOLOGY -->

<!-- Maintainers: re-run `python scripts/docs/render_topology.py --check` before publishing docs. -->
Generated from `installer/modules.json`.

- Root installer truth label: `townlight_records_beta_candidate`.
- Primary product profile: `records-beta` (Townlight Records).
- Townlight Records profile status: `stabilizing`.
- Only the Townlight Records modules are represented in this candidate table.
- Disabled profiles and excluded modules remain documented as out of scope until their own gates clear.

| Module | Version | Role | Dependencies | Source commit | Installer status |
|---|---:|---|---|---|---|
| Townlight Core | 1.2.1 | shared platform | none | `b4d0156bdc68` | `v1_2_1_records_beta_platform` |
| Townlight Records | 1.7.3 | records workflow | `civiccore` | `edf1c8d8078c` | `v1_7_3_records_beta_candidate` |
| Townlight Notice | 0.2.0 | public notice workflow | `civiccore` | `79b8d07199ee` | `v0_2_0_records_beta_candidate` |
| Townlight Access | 0.4.0 | accessibility + records-ready export | `civiccore` | `b9100edc80ca` | `v0_4_0_records_beta_candidate` |

Disabled profiles:
- `land-use` (Land Use): queued - depends on Tier 2 module work after city-core ships
- `full-suite` (Full Suite): 14 modules remain pre-1.0 scaffolds pinned to older CivicCore lines; not installable as a coherent suite

<!-- END GENERATED SUITE TOPOLOGY -->

### Upgrade and migration order

When `civiccore` ships a backward-compatible change:
1. `civiccore` releases the new version.
2. Compatibility matrix is updated.
3. Consumers adopt via the rollout playbook.

When `civiccore` ships a breaking change:
1. Change is documented in advance (ADR).
2. `civiccore` releases first.
3. Consumers ship paired changes.
4. Compatibility matrix records the new pairing.

### Continuity and governance

Continuity is now a gate, not a future aspiration. See [SUCCESSION.md](SUCCESSION.md). The roadmap that governs the rest of the program is [docs/roadmap/index.md](docs/roadmap/index.md).

---

## Glossary

- **ADA Title II** — accessibility compliance requirement for public-sector digital services. Under the DOJ's April 2024 web/mobile rule, public entities of 50,000+ population had to comply by April 24, 2026 (that deadline has passed); smaller entities and special districts must comply by April 26, 2027.
- **ADR** — Architecture Decision Record.
- **Air-gap** — operating without an outbound network connection.
- **CC BY 4.0** — Creative Commons Attribution license used for documentation.
- **CI** — continuous integration.
- **Connector** — module-side adapter that imports data from a city system. Read-first by design.
- **FOIA** — Freedom of Information Act and related public-records laws.
- **LLM** — large language model.
- **Local-first** — software designed to run on infrastructure the city controls.
- **Module** — a single CivicSuite product (e.g., civicclerk, civicrecords-ai).
- **Open source** — software available under a license allowing use, modification, and redistribution.
- **Pinned version** — a specific exact dependency pairing rather than a range.
- **Procurement-ready** — has passed the release-verification gates and can be evaluated against city procurement standards. Distinct from "has a release tag."
- **Provisional** — has a version label but the label is not currently a promotion claim.
- **Release-verification gate** — one of the ten checks documented in [docs/release-recovery-status.md](docs/release-recovery-status.md) that must pass before a "shipping" claim can be re-issued.
- **Sovereign deployment** — software running on infrastructure the city controls.
- **Sigstore / cosign** — signing tooling used for `civiccore` release attestations starting v0.22.1.
- **WCAG 2.2 AA** — Web Content Accessibility Guidelines target for public-facing surfaces.
- **Wheel** — Python package distribution format.

---

## When something goes wrong

| Symptom | Where to look |
|---|---|
| Module will not install | Open Settings > Module Catalog, review dependencies and proof status, then use the guided install/update/repair action for ready modules. CivicCore stays installed. |
| Desktop app opens but shows no module activity | Open System Health, check local services, task queue schema, local model, and enabled module state, then use Repair after reviewing the repair panel. |
| Unsure whether an artifact is current | Verify the live `SHA256SUMS` or release manifest from the active run evidence path; do not rely on restored `installer/dist` files unless the maintainers explicitly approved restoration. |
| `civiccore` version mismatch | [docs/compatibility/index.md](docs/compatibility/index.md) is the canonical pairing source. |
| README says "shipping," recovery doc says "frozen" | The recovery doc wins. See [docs/release-recovery-status.md](docs/release-recovery-status.md). |
| Unsure where to file a bug | [CONTRIBUTING.md](CONTRIBUTING.md) — bug-routing decision tree. |
| Security issue | [SECURITY.md](SECURITY.md) — open a private GitHub Security Advisory. |
| General support question | [SUPPORT.md](SUPPORT.md). |
| Disk still full after uninstall | By design, a plain Windows uninstall (Settings > Installed apps, or Add/Remove Programs) removes the program files but leaves the downloaded ~7 GB Gemma 4 model, your city data, and your backups on disk so a reinstall can restore them. To reclaim that space, delete the configured local data and backup folders, and the model folder, manually after uninstall once you are sure you no longer need them. |
| First-time evaluator | [FAQ.md](FAQ.md), then [STATUS.md](STATUS.md), then this manual. |
