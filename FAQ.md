# CivicSuite FAQ

**Last verified:** 2026-07-02 (civicsuite-windows-local-v1.0.2)

This FAQ is for civic operators (city CIO, clerk, IT lead, attorney, procurement officer) evaluating whether CivicSuite is right for them. For engineering-level questions, see [CONTRIBUTING.md](CONTRIBUTING.md). For module-by-module status, see [STATUS.md](STATUS.md).

---

## How does a Windows operator actually install city-core? (start here)

The supported operator path is the **CivicSuite Windows Local "city-core" desktop app**: a single Tauri/WebView2 MSI installer (about 1.65 GB) that you run like any normal Windows program. It bundles a portable PostgreSQL 17 with pgvector and a portable Ollama runtime. There is **no Docker, no WSL, no terminal, and no developer tooling** on this path.

**Where to download:** get `CivicSuite_1.0.2_x64_en-US.msi` from the current release tag, <https://github.com/townlight/townlight/releases/tag/civicsuite-windows-local-v1.0.2>, and verify its SHA-256 before running: `bbdeb1b69e846d3ccb8c961502f4b2f158e92623e7bf4dfa9d4c4bf2f9a0fd02`.

What an operator does:

1. Run the MSI on a 64-bit Windows 10/11 machine that has WebView2.
2. Follow the installer screens.
3. Open CivicSuite and complete first-run setup (city profile, first CivicSuite admin, backup folder).
4. At first run the app downloads the pinned Gemma 4 12B QAT model (about 6.97 GB) from Hugging Face and verifies its checksum before AI workflows turn on. After that the model is local; no cloud account is needed.

Recommended machine: **32 GB RAM** (16 GB is a workable minimum; the local model needs about 6.7 GB resident at runtime on top of Windows, PostgreSQL, and services, and 32 GB leaves headroom for the local database and the generation context) and **at least 15 GB free disk** (1.65 GB MSI + about 7 GB model + data/backup headroom; the installer enforces a 15 GB floor for the model download).

The current release is **[civicsuite-windows-local-v1.0.2](https://github.com/townlight/townlight/releases/tag/civicsuite-windows-local-v1.0.2)** (Latest; it supersedes v1.0.1, which superseded v1.0.0; the earlier first-run-fix prerelease is retired). For the full step-by-step, see [docs/installer/operator-walkthrough.md](docs/installer/operator-walkthrough.md).

This is a **GA candidate, open for public beta**: feature-complete for city-core and validated end-to-end on a clean machine. The MSI is Authenticode code-signed via Azure Trusted Signing. Because the certificate is new, Windows SmartScreen may still show *"Windows protected your PC"* on first run — click **More info**, confirm it shows a **verified publisher** (not "Unknown Publisher"), then **Run anyway** (see [docs/troubleshooting.md](docs/troubleshooting.md#windows-smartscreen-when-you-run-the-installer)). You can download and use it now for real hands-on evaluation and early adoption. It is still a **beta** — **not yet production-, city-, or procurement-ready** — so do not run your city's system of record on it yet.

## Can my city rely on CivicSuite for live operations today?

**No.** The honest current package is the city-core beta installer profile (version labels reconciled with what actually works): CivicCore v1.2.0, CivicRecords AI v1.7.3, CivicClerk v1.0.4, CivicCode v1.0.8, CivicNotice v0.2.0, CivicAccess v0.4.0, and the suite installer. That profile has current install-lifecycle testing on Windows — the same operating system it ships for (older Linux lifecycle evidence is historical) — plus first-run browser QA, green PR CI, and audit-full evidence with zero unresolved Blocker or Critical findings in the active run record.

That is still a bounded beta package. It is **not city-ready, not procurement-ready, not production-ready, not macOS lifecycle certified, and not a full-suite release**. CivicAccess v0.4.0 joined city-core as the sixth module on 2026-06-29 (a follow-up in-depth review qualified it for city-core, reversing the 2026-05-23 "needs work" demotion — a failed depth review); the current v1.0.2 MSI installs all six city-core modules — **the CivicAccess module code, database schema, and write-token secret are bundled, and its on-screen Accessibility workflow tab, with three local-AI tools, ships in the desktop UI as of v1.0.2** (see [docs/audits/civicaccess-citycore-deep-read-2026-06-29/FINAL-REPORT.md](docs/audits/civicaccess-citycore-deep-read-2026-06-29/FINAL-REPORT.md)). CivicZone, CivicPlan, CivicPermit, and CivicInspect remain queued Tier 2 modules on corrected version labels (versions lowered to match actual maturity).

Any vendor or integrator claiming a completed CivicSuite municipal deployment or a full-suite operational release is making a claim the project docs do not support.

## What is the difference between a "release tag" and a reliable operator package?

A release tag means a repository has a version label on a commit. A reliable operator package means the exact package has evidence: lifecycle install and repair, clean verification, browser-tested user flows, security and version checks, documented limitations, and CI/audit evidence.

CivicSuite has many tags. Only the scoped package evidence in [STATUS.md](STATUS.md), [docs/release-recovery-status.md](docs/release-recovery-status.md), and the active run record should be treated as current truth.

## Can I install only one module, say just CivicClerk, without the rest?

In principle, yes. The dependency rule is: every module depends on `civiccore`; modules do not depend on each other except where noted (for example, `civiccode` depends on `civicclerk` for adopted-ordinance handoff intake). A single-module install is a supported design goal.

In practice, use the installer profile that has evidence for your evaluation. Clerk-Core has a bounded starter installer lineage for CivicCore, CivicRecords AI, and CivicClerk. City-core is the active beta profile (version labels reconciled with what actually works) that adds CivicCode, CivicNotice, and CivicAccess. The Tier 2 land-use modules are not part of city-core today.

## What does a civic operator need to run the city-core beta?

The operator path is the Windows Local "city-core" desktop MSI. You need:

- A **64-bit Windows 10 or 11** workstation with **WebView2** present (WebView2 ships with current Windows; the installer relies on it for the desktop shell).
- **32 GB RAM recommended (16 GB is a workable minimum).** The local Gemma 4 model needs about 6.7 GB resident at runtime on top of Windows, PostgreSQL, and the bundled services; 32 GB leaves comfortable headroom for the local database and the generation context.
- **At least 15 GB free disk.** That covers the roughly 1.65 GB MSI, the about 7 GB model download, and data/backup headroom. The installer enforces a 15 GB floor before it will download the model.
- **Permission to install normal Windows desktop software**, and a stable internet connection for the first-run model download (about 6.97 GB from Hugging Face) unless IT has already staged the model file.
- Access to city documents for representative, non-production evaluation.

You do **not** need Docker, WSL, a terminal, a developer account, cloud accounts, SaaS subscriptions, vendor relationships, or per-seat licensing. PostgreSQL 17 with pgvector and the Ollama model runtime are bundled portably inside the app. If the installed app ever asks for Docker, WSL, terminal commands, or manual config-file edits, that is a Windows Local release-blocking bug, not an operator step.

**Legacy developer/CI path (not the operator path):** the project also keeps a Linux/Docker lifecycle as a developer and CI proof path only. That path uses Docker Engine on Linux (with Docker Desktop and WSL 2 on Windows/macOS) and larger build-host resources, and it is the source of the older "8+ cores, 32 GB RAM, 60 GB disk, Docker/WSL" guidance. It exists to prove builds in CI; it is never how a clerk or city IT operator installs city-core. If you are a city operator, ignore the Docker/WSL path and use the Windows Local MSI above.

## What is the suite launcher?

If you installed the Windows Local desktop app, the desktop app itself is your front door: a clerk opens CivicSuite from the Start menu like any other program and works entirely inside that window. You will not see a separate "launcher" page on this path.

The suite launcher is a browser page that belongs to the separate Docker/server profile (the developer and CI path described above, not the operator path). In that profile it gives staff, resident, and IT-admin views over the locally running services. It is useful for operator orientation and QA state checks, but it is **not** a claim that CivicSuite has completed municipal SSO, shared identity federation, or a cross-city managed service.

## How do I know an installer package is the one I should test?

Use the live trust path, not stale committed artifacts:

1. Check the active run evidence path named in [README.md](README.md) and [STATUS.md](STATUS.md).
2. Verify the generated `SHA256SUMS` or release-manifest hash for the artifact you are about to run.
3. Confirm the package came from the official CivicSuite repo or the recorded local run evidence.
4. Confirm source pins in `installer/modules.json` match the vendored source commits for CivicCore, CivicRecords AI, CivicClerk, CivicCode, CivicNotice, and CivicAccess.
5. For module release assets, verify the published SHA256 and attestation assets recorded in each module's release evidence.

Do not restore old `installer/dist` artifacts unless the maintainers explicitly decide that the prior committed artifacts should be revived. The default is live regenerated artifacts with evidence paths.

## Why are some modules called "CivicCourt Assist" and others bare "CivicCourt"?

Both names refer to the same thing: CivicCourt, a planned specialized-tier module. The "Assist" / "Bridge" / "Research" suffix is the canonical product name when the module needs to be clearly described as a copilot or bridge, not a system-of-record replacement. The bare name is the casual reference used in tier rollout lists. [CONSISTENCY.md](https://github.com/townlight/townlight/blob/main/CONSISTENCY.md) section 3 documents this convention.

CivicSuite is deliberately not a system-of-record replacement for ERP, utility billing, permitting, CAD/RMS, or court case management. The "Assist" naming is the suite's way of being explicit about that scope boundary.

## Is air-gapped deployment supported today?

Architecturally yes; verified under the full standard no. Every module is designed to operate without outbound network calls in the default local deployment profile. The CivicCore sovereignty principles and the module-level "Air-gap behavior" test areas are explicit about this. Treat air-gap as a design target under verification, not as a completed operator claim.

## Can I migrate from Granicus / Legistar / PrimeGov / NovusAGENDA?

CivicClerk's spec lists imports from these platforms as priority integrations, and `civicclerk` ships local-payload importers for them today. **Local-payload** means: you provide an export file from your incumbent system, and the CivicClerk import path normalizes it through CivicCore's connector contract. This is **not** a live API connection to those vendors. There is no "click here to migrate from Legistar" flow yet. A real migration today is a hands-on exercise with a clerk, an integrator, and exported data files.

## Does CivicAccess satisfy our ADA Title II compliance obligation?

No. **Persisted reviews are advisory clerk support, not a certified accessibility audit.** CivicAccess gives clerks a starting toolkit: WCAG sample review (five deterministic rule checks, plus an advisory analysis drafted by the local AI model when it is ready), plain-language rewrite drafts and multilingual variant drafts (drafted by the local AI model when it is ready, with deterministic sample fallbacks that say so when it is not), accessible form planning, publishing-workflow blockers, ADA Title II review-support planning, and tagged-PDF heading-order checks. Every output is advisory local compute — AI-drafted text is always labeled, never published without human review, and never changes a review's deterministic findings — not a legal or accessibility-vendor determination. Final ADA Title II compliance review must come from a qualified human reviewer or certified accessibility vendor. The same disclaimer is repeated on every page of the in-app Accessibility tab (see Part 1.6 of [USER-MANUAL.md](USER-MANUAL.md)).

## Does CivicSuite document any municipal live deployments?

No. There are mock-city test fixtures, demo seed data ("City of Brookfield"), and Docker Compose product rehearsals, but no documented live municipal deployment in the project docs as of 2026-07-02.

## What's the licensing model? Will I owe per-seat fees?

- **Code:** Apache License 2.0. Permissive. You can run, modify, and redistribute. No per-seat licensing.
- **Documentation:** CC BY 4.0. You can adapt and republish with attribution.
- **No telemetry, no per-seat metering, no vendor cloud dependency** by design.

CivicSuite is unfunded volunteer-maintained open source. There is no paid support contract today.

## What happens if the maintainer disappears?

[SUCCESSION.md](SUCCESSION.md) documents the continuity model. The CivicSuite GitHub org has two active owners (`scottconverse`, `APirateMonk`). Release credentials, recovery procedures, and minimum-knowledge packets are documented. The license guarantees that even if both maintainers vanished tomorrow, your city would still have the code, the right to use it, the right to modify it, and the right to fork it. The suite's local-first, sovereign-by-design posture explicitly avoids vendor lock-in.

## How do I report a security issue?

Open a private GitHub Security Advisory on the affected repo. See [SECURITY.md](SECURITY.md) for routing. For suite-wide architectural issues, advisories on the `civicsuite` umbrella are accepted.

## How do I follow progress?

- [CHANGELOG.md](CHANGELOG.md) for umbrella-level changes.
- [STATUS.md](STATUS.md) for the plain-English current state.
- [docs/release-recovery-status.md](docs/release-recovery-status.md) for the gate-passing scoreboard.
- [docs/release-lockstep/downstream-pins.md](docs/release-lockstep/downstream-pins.md) for pinned module/version/source evidence.
- Each module repo's CHANGELOG for that module's actual code changes.

## I'm an engineer. Where do I start?

1. Read [CHARTER.md](CHARTER.md) for the engineering principles.
2. Read [STATUS.md](STATUS.md) to know which modules are real today.
3. Pick the relevant module or installer profile and follow its current README.
4. Run that module's verification gates.
5. Read [CONTRIBUTING.md](CONTRIBUTING.md) for the bug-routing decision tree.

## I'm a procurement officer. What should I tell my city?

That CivicSuite is a credible open-source civic-tech project under active development, and that it is **not yet ready for production procurement**. A pilot evaluation is reasonable; a procurement decision based on the current state is not.

Re-evaluate after the [release-verification gates](docs/release-recovery-status.md) pass. The recovery-status doc and STATUS.md will tell you when that has happened, repo by repo.
