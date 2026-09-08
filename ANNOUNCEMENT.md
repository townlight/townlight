# CivicSuite Windows Local 1.0.2 — GA candidate, public beta — local AI now behind every AI feature in the suite, including the new Accessibility tab

**TL;DR:** CivicSuite city-core for Windows v1.0.2 is out. One MSI still installs the whole six-module suite — database, local AI model, and clerk workflows on one Windows machine — and this release makes the suite better in three ways: the **Accessibility tab is now on screen and three of its tools run on the suite's local AI**, a shared engine fix **improved the output quality of every AI feature in the suite**, and a clean-machine fix means **first-run setup now completes on a factory-fresh Windows PC**. No cloud, no signup, no telemetry. Download it, run it, try it.

Get it: <https://github.com/townlight/townlight/releases/latest>

---

## What changed since v1.0.1

Three things, in plain English.

**1. The Accessibility tab is here, and it uses the local AI.** The **Accessibility** primary-nav tab now ships in the desktop app (v1.0.1 bundled the CivicAccess module's code and database under the hood, but no on-screen tab). Three of its seven tools run on the suite's local AI engine:

- **Plain-Language Rewrite** — drafts a real plain-language version of the text you paste.
- **Multilingual Variant** — drafts a translation of your actual text into any language you name.
- **Accessibility Review** — runs five deterministic WCAG checks (same as ever) and, new, stores a
  short AI-drafted "fix this first, and here's why" analysis with the saved review.

Everything runs on the model already on your machine — nothing leaves it. Every AI output is labeled as a draft; a human reviews before anything publishes; translations must go to a qualified human translator. The review's pass/fail status comes only from the deterministic checks — the AI never adds, removes, or reclassifies a finding. If the local model is ever missing or broken, the tab shows an explicit **"AI engine not ready"** banner with a one-click path to model setup, and every tool keeps working in clearly-labeled sample mode — the deterministic checks and checklist tools don't depend on the AI at all. Persisted reviews are advisory clerk support, not a certified accessibility audit; that disclaimer is on every page. The other four tools (accessible form planning, publishing-workflow checklist, ADA Title II review-support, tagged-PDF heading checks) are checklist-shaped on purpose and stay deterministic.

**2. Every AI feature in the suite got better.** While wiring the Accessibility tools we found and fixed a bug in the suite's shared text-generation path that had been quietly degrading output quality. Because the fix is in the shared engine, it improves **all** the AI features — CivicClerk meeting-minutes drafts, CivicRecords AI response drafts, CivicCode guidance, and the three new Accessibility tools alike. Same model, same machine, noticeably better drafts.

**3. First-run setup now works on a truly fresh PC.** On a factory-fresh Windows machine with no other software installed, the bundled database could fail to start on the very first launch (a standard Microsoft runtime component that most PCs already have was missing). v1.0.2 bundles that component alongside the database, so setup completes on a clean machine with no extra downloads or installs. This affected every v1.0.x build, not just this one — v1.0.2 fixes it.

The two-month CivicAccess city-core integration runway is complete: Phase A (module hardening to v0.4.0) done, Phase B (desktop runtime wiring) done, Phase C (city-core registry flip 5→6) done, and **Phase D (clean-machine acceptance) — PASS**. Phase D was two full runs of the real MSI in a clean Windows Sandbox — the canonical "fresh clerk PC." Run 1 verified the whole chain end to end — install → the full 10-step first-run wizard → admin sign-in → the ~6.97 GB model download with the app's own streamed SHA-256 verification and all six readiness checks green → all three Accessibility AI features producing clean, correctly-labeled output through the real app bridge — **and** caught the clean-machine database bug described above. The fix shipped in this release, and run 2 proved it: on a clean machine with no system runtime present, the bundled PostgreSQL initializes a full working database. The full Phase D story is in the [v1.0.2 release notes](https://github.com/townlight/townlight/releases/tag/civicsuite-windows-local-v1.0.2).

### For IT: the technical specifics

- **Shared generation fix ([PR #220](https://github.com/townlight/townlight/pull/220), merge `0b0170a`).** The shared helper `generate_local_text` posted to Ollama's `/api/generate` with `raw: true` and a hand-built `<start_of_turn>` turn-format prompt. The pinned model loads with a `gemma4` renderer/parser, and `raw: true` bypasses it, so internal control tokens leaked and generation degenerated. The fix switches the helper to **`/api/chat`** with a single user message, letting Ollama apply the model's own template and parser — one shared-helper change that repairs every AI feature suite-wide. Generation config: temperature 0.2, `num_predict` 512, `num_ctx` 8192, 180 s timeout.
- **Clean-machine fix ([PR #221](https://github.com/townlight/townlight/pull/221), merge `0b797c4`).** The portable PostgreSQL 17 binaries link against the Microsoft VC++ runtime, which a factory-fresh Windows doesn't have (CI never saw it — GitHub's `windows-latest` runners ship the redistributable preinstalled; only the clean-sandbox Phase D could catch it: `initdb.exe` died with "VCRUNTIME140.dll was not found"). The runtime payload now stages `vcruntime140.dll`, `vcruntime140_1.dll`, and `msvcp140.dll` into `postgres\bin` next to the binaries, and those DLLs are in the payload's required-files manifest, so any regression fails the build loudly. Pre-existing across v1.0.x, not a CivicAccess regression.
- **Dual-path AI design.** CivicAccess is the suite's first dual-path AI module: a per-call readiness probe, an explicit "AI engine not ready" state, and deterministic fallbacks for every tool (the three older AI callers hard-stop when the model is absent). The Accessibility tab is a native Rust port with full audit-chain and cross-module-search integration.
- **Release build.** The MSI is built by public GitHub Actions run `28626482190` on main merge commit `0b797c4` and passed the CI install → first-run → backup-restore → uninstall lifecycle before publication. SHA-256 and size are in the install section below.

## What this is

CivicSuite is open-source municipal software designed to run **locally on a city's own hardware**. The Windows Local "city-core" build is one MSI installer (~1.65 GB) that sets up, with no terminal and no developer tooling:

- a bundled portable **PostgreSQL 17 + pgvector** data store,
- a bundled portable **Ollama** runtime with a pinned **Gemma 4 12B QAT** model (~6.97 GB, downloaded and checksum-verified on first run) — the engine behind the records, minutes, code, and now accessibility AI features,
- and **six city-core modules**: CivicCore (shared platform), CivicRecords AI (public records / FOIA), CivicClerk (meetings / agendas / minutes), CivicCode (municipal code), CivicNotice (public notices), and **CivicAccess** (accessibility + records-ready export — tab and local-AI drafting new in v1.0.2).

Everything — your data, your documents, your audit trail, the AI model — stays on the machine. There is no vendor cloud, no per-seat licensing, and no telemetry by design. Code is Apache-2.0; docs are CC BY 4.0.

## Why "GA candidate" *and* "public beta"

Same posture as v1.0.1; the bundled scope grew:

- **GA candidate** describes maturity. The v1.0.2 MSI passed CI lifecycle validation (install → first-run → backup-restore → uninstall on a fresh `windows-latest` runner, run `28626482190`), and **Phase D clean-machine acceptance passed** — two full Windows Sandbox runs of the shipped installer covering install, the complete first-run wizard, admin sign-in, the model download/verify/load chain, and the three Accessibility AI features live against the real model, including the run that caught (and this release's fix that closed) the clean-machine database bug. See "What changed" above and the [v1.0.2 release notes](https://github.com/townlight/townlight/releases/tag/civicsuite-windows-local-v1.0.2) for the full story.
- **Public beta** describes the stage. The MSI is Authenticode code-signed via Azure Trusted Signing. A new certificate has no reputation yet, so Windows SmartScreen may still prompt on first run — click *More info*, confirm it shows a verified publisher (not "Unknown Publisher"), then *Run anyway*.

## Install (60-second version)

1. Download `CivicSuite_1.0.2_x64_en-US.msi` **and** `CivicSuite-msi-evidence.txt` from the [latest release](https://github.com/townlight/townlight/releases/latest).
2. Verify the SHA-256 checksum in PowerShell: run `Get-FileHash CivicSuite_1.0.2_x64_en-US.msi -Algorithm SHA256` and check it matches the `SHA256=` line in the evidence file (and the value below). Matching hash = the file you have is byte-for-byte the file the public CI run built. If it doesn't match, delete and re-download from the official release page only.
3. Follow the installer, open CivicSuite, and complete first-run setup (city profile, first admin, backup folder).
4. On first run the app downloads and verifies the ~6.97 GB model. After that it's fully local — including all the AI features.

**Recommended machine:** 64-bit Windows 10/11 with WebView2, **32 GB RAM** recommended (16 GB is a workable minimum; the model needs ~6.7 GB resident, plus headroom for the local database, services, and generation context), **~15 GB free disk**. No Docker, no WSL, no terminal.

Verify your download: SHA-256 `bbdeb1b69e846d3ccb8c961502f4b2f158e92623e7bf4dfa9d4c4bf2f9a0fd02` (1,646,999,452 bytes).

## Upgrade from v1.0.1

In-place upgrade supported via same product code. No uninstall needed. Your saved work (the `city-work.json` data file) loads unchanged — files saved by v1.0.1 simply don't have the new fields yet, and that's fine. No data loss. First run after upgrade does NOT re-download the Gemma model — the new AI features use the model you already have.

## What it is *not* (yet)

Being honest about the edges matters more than the launch:

- Not production-ready, not city-ready, not procurement-ready. It's a beta.
- Not a compliance tool. AI drafts are labeled drafts; humans decide; nothing in the Accessibility tab is a certified audit, legal determination, or certified translation.
- Not the full suite. City-core is six modules; **CivicZone / CivicPlan / CivicPermit / CivicInspect** remain queued Tier 2.
- macOS lifecycle is not certified; Windows Local is the supported operator path.
- The MSI bundles module source pinned by commit; for two modules the bundled commit is *ahead* of the latest published release tag. The trust path is the `source_commit` pin plus the MSI checksum — see [PROVENANCE.md](PROVENANCE.md).

## Help and feedback

- Install help and recovery: [SUPPORT.md](SUPPORT.md) and the operator walkthrough in [docs/installer/operator-walkthrough.md](docs/installer/operator-walkthrough.md).
- Questions: [FAQ.md](FAQ.md).
- Security issues: open a private advisory — see [SECURITY.md](SECURITY.md).
- Found a bug? Open an issue. This is exactly what a public beta is for.

CivicSuite is unfunded, volunteer-maintained open source. If it's useful to your city, the best thanks is to try it and tell us what broke.
