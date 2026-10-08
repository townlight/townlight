# CivicCore <-> Module Compatibility Matrix

## Townlight Records beta.2 rc.3 source-pin pairing

Published 2026-10-08 after signing, exact installed acceptance, and owner
publication approval. The rc.3 tag preserves older draft evidence;
MSI metadata remains `1.1.0-2` / Windows ProductVersion `1.1.0.2`.
The Records desktop profile pins Core `b4d0156bdc6883c1c3ef167abe0379f9ca32b258`
with Records `ff99d8c7e692ba1f75e1781f517bb54f5c618b48`, Notice
`79b8d07199ee77cd425b31c0e0a44f3a0832b810`, and Access
`b9100edc80ca496d6061f1cdb3eb39a60ff5f31a`. Only the Records source commit
advances from beta.1; package versions and Core compatibility requirements
remain unchanged. Source pins identify the bundled code independently of
the older published module tags.

This matrix tracks the compatibility contract between the shared `civiccore`
package and the suite modules that consume it. It is the suite's
authoritative record of release pairings - when a row changes, this is the
canonical record.

Label status as of 2026-07-02: the rows below record release pairings and
version labels, **not product-readiness claims**. The city-core modules are
released; scaffold-depth modules carry corrected early-stage version labels
(version lowered to match actual maturity). Public labels remain provisional
until each repo passes the release-verification gates in
[docs/release-recovery-status.md](../release-recovery-status.md), which also
covers the May 2026 label correction.

| Module          | Repo                           | Current version | Released   | Compatible CivicCore range | Last verified | Notes |
|-----------------|--------------------------------|-----------------|------------|----------------------------|---------------|-------|
| civiccore       | townlight/core                 | 1.2.1           | 2026-07-04 | n/a                        | 2026-08-20    | Townlight Core release used by the Records beta candidate, including Windows-local platform contracts and the PostgreSQL-backed local task queue/worker. |
| civicrecords-ai | townlight/sunshine             | 1.7.3           | 2026-05-23 | `==1.2.1`                  | 2026-08-20    | Townlight Records beta candidate source pin with safe deterministic fixtures and connector provenance; the package release remains 1.7.3. |
| civicclerk      | CivicSuite/civicclerk          | 1.0.4           | 2026-06-13 | `==1.2.0`                  | 2026-06-13    | City-core clerk module release with persistence refresh and protected staff auth defaults retained. |
| civicregwatch   | CivicSuite/civicregwatch       | planned         | not released | TBD                      | 2026-04-30    | New planned federal regulatory intelligence module. Implementation spec exists in `specs/05_civicregwatch.md`; repo and civiccore pin are not scaffolded yet. |
| civicapi        | CivicSuite/civicapi            | planned         | not released | TBD                      | 2026-04-30    | New planned public read-only data gateway module. Implementation spec exists in `specs/06_civicapi.md`; repo and civiccore pin are not scaffolded yet. |
| civiccode       | CivicSuite/civiccode           | 1.0.8           | 2026-05-23 | `==1.2.0`                  | 2026-05-23    | City-core municipal-code module release; v1.0.8 supersedes v1.0.0 and consumes CivicCore shared ingestion. |
| civiczone       | CivicSuite/civiczone           | 0.2.2           | 2026-05-23 | `==1.1.0`                  | 2026-05-23    | Early scaffold; version label corrected to match actual maturity; full build queued for Tier 2. |
| civicaccess     | townlight/access               | 0.4.0           | 2026-06-28 | `==1.2.1`                  | 2026-08-20    | Townlight Access provides the accessibility and records-release review capability bundled in the Records beta candidate. |
| civicplan       | CivicSuite/civicplan           | 0.2.2           | 2026-05-23 | `==1.1.0`                  | 2026-05-23    | Early scaffold; version label corrected to match actual maturity; full build queued for Tier 2. |
| civicpermit     | CivicSuite/civicpermit         | 0.2.2           | 2026-05-23 | `==1.1.0`                  | 2026-05-23    | Early scaffold; version label corrected to match actual maturity; full build queued for Tier 2. |
| civicinspect    | CivicSuite/civicinspect        | 0.2.2           | 2026-05-23 | `==1.1.0`                  | 2026-05-23    | Early scaffold; version label corrected to match actual maturity; full build queued for Tier 2. |
| civicgrants     | CivicSuite/civicgrants         | 0.2.0           | 2026-05-10 | `==1.1.0`                  | 2026-05-11    | D2/B3 rollout consumes CivicCore v1.1.0 shared `staff_key_gate`; module remains scaffold-depth, not v1.0 product-ready. |
| civicprocure    | CivicSuite/civicprocure        | 0.2.0           | 2026-05-10 | `==1.1.0`                  | 2026-05-11    | D2/B3 rollout consumes CivicCore v1.1.0 shared `staff_key_gate`; module remains scaffold-depth, not v1.0 product-ready. |
| civiccontracts  | CivicSuite/civiccontracts      | 0.1.1           | 2026-04-28 | `==0.3.0`                  | 2026-04-28    | Dependency-alignment release: contract repository foundation preserved while moving to civiccore 0.3.0 shared primitives. |
| civicboards     | CivicSuite/civicboards         | 0.1.1           | 2026-04-28 | `==0.3.0`                  | 2026-04-28    | Dependency-alignment release: board administration foundation preserved while moving to civiccore 0.3.0 shared primitives. |
| civicnotice     | townlight/notice               | 0.2.0           | 2026-06-19 (tag); release published 2026-07-03 | `==1.2.1`     | 2026-08-20    | Townlight Notice supplies deterministic deadline, proof, and archive support for the Records beta candidate. The [v0.2.0 release](https://github.com/townlight/notice/releases/tag/v0.2.0) remains the published package. |
| civic311        | CivicSuite/civic311            | 0.1.1           | 2026-04-28 | `==0.3.0`                  | 2026-04-28    | Dependency-alignment release: resident service request foundation preserved while moving to civiccore 0.3.0 shared primitives. |
| civiccomms      | CivicSuite/civiccomms          | 0.1.1           | 2026-04-28 | `==0.3.0`                  | 2026-04-28    | Dependency-alignment release: public communications foundation preserved while moving to civiccore 0.3.0 shared primitives. |
| civicdata       | CivicSuite/civicdata           | 0.1.2           | 2026-04-29 | `==0.4.0`                  | 2026-04-29    | Auth-protected persisted retrieval rollout consumes the published `civiccore v0.4.0` release. |
| civichr         | CivicSuite/civichr             | 0.1.1           | 2026-04-28 | `==0.3.0`                  | 2026-04-28    | Dependency-alignment release: HR policy support foundation preserved while moving to civiccore 0.3.0 shared primitives. |
| civicbudget     | CivicSuite/civicbudget         | 0.1.2           | 2026-04-29 | `==0.4.0`                  | 2026-04-29    | Auth-protected persisted retrieval rollout consumes the published `civiccore v0.4.0` release. |
| civiclegal      | CivicSuite/civiclegal          | 0.1.2           | 2026-04-29 | `==0.11.0`                 | 2026-04-29    | Privilege-aware search/access filtering now consumes the published `civiccore v0.11.0` release wheel. |
| civicelections  | CivicSuite/civicelections      | 0.1.1           | 2026-04-28 | `==0.3.0`                  | 2026-04-28    | Dependency-alignment release: election administration support foundation preserved while moving to civiccore 0.3.0 shared primitives. |
| civicutility    | CivicSuite/civicutility        | 0.1.1           | 2026-04-28 | `==0.3.0`                  | 2026-04-28    | Dependency-alignment release: utility support foundation preserved while moving to civiccore 0.3.0 shared primitives. |
| civiccourt      | CivicSuite/civiccourt          | 0.1.2           | 2026-04-29 | `==0.4.0`                  | 2026-04-29    | Auth-protected persisted retrieval rollout consumes the published `civiccore v0.4.0` release. |
| civicsafety     | CivicSuite/civicsafety         | 0.1.1           | 2026-04-28 | `==0.3.0`                  | 2026-04-28    | Dependency-alignment release: public-safety administrative support foundation preserved while moving to civiccore 0.3.0 shared primitives. |
| civiclibrary    | CivicSuite/civiclibrary        | 0.1.1           | 2026-04-28 | `==0.3.0`                  | 2026-04-28    | Dependency-alignment release: library support foundation preserved while moving to civiccore 0.3.0 shared primitives. |
| civicparks      | CivicSuite/civicparks          | 0.1.1           | 2026-04-28 | `==0.3.0`                  | 2026-04-28    | Dependency-alignment release: parks and recreation support foundation preserved while moving to civiccore 0.3.0 shared primitives. |

## Desktop Windows-Local product

The rows above track the per-module `civiccore` pairing contract. The
Windows-Local desktop product is a different kind of artifact: a packaged MSI
that bundles a fixed set of city-core module versions on one CivicCore platform
version, not a module that consumes CivicCore. It is recorded here as its own
section rather than as a module row.

`civicsuite-windows-local-v1.0.3` is the Latest Windows-Local release
(2026-07-11). It supersedes v1.0.2, which superseded v1.0.1 and v1.0.0; the
`windows-local-msi-firstrun-fix-rc1` prerelease is retired. v1.0.3 is the first
**Authenticode code-signed** MSI (Azure Trusted Signing). Because the
certificate is new, SmartScreen may still show "Windows protected your PC" on
first run - choose "More info", confirm it shows a verified publisher (not
"Unknown Publisher"), then "Run anyway"; this fades as the certificate builds
reputation. (v1.0.1 and v1.0.2 were unsigned betas.) This product is
BETA. It does not claim public-use readiness, city-ready status,
procurement/production readiness, macOS lifecycle certification, or full-suite
release.

| Product                            | Released   | CivicCore platform | Status        | Notes |
|------------------------------------|------------|--------------------|---------------|-------|
| civicsuite-windows-local-v1.0.3    | 2026-07-11 | 1.2.0              | signed beta   | Latest Windows-Local release; first Authenticode code-signed MSI (Azure Trusted Signing). Same six-module city-core profile as v1.0.2 with the unsigned/SmartScreen warning surfaces removed. Supersedes v1.0.2. |
| civicsuite-windows-local-v1.0.2    | 2026-07-02 | 1.2.0              | unsigned beta | Superseded by v1.0.3. Tauri/WebView2 desktop MSI bundling the six-module city-core profile (adds CivicAccess 0.4.0 with real local-AI accessibility features) on CivicCore 1.2.0. Supersedes v1.0.1. |
| civicsuite-windows-local-v1.0.1    | 2026-06-19 | 1.2.0              | unsigned beta | Superseded by v1.0.2. Tauri/WebView2 desktop MSI bundling the five city-core modules on CivicCore 1.2.0. Supersedes v1.0.0; firstrun-fix-rc1 prerelease retired. |

Modules pinned into the Townlight Records beta candidate. Technical IDs remain stable for compatibility; the installer uses exact source commits recorded in `installer/modules.json`:

| Module          | Version | CivicCore platform |
|-----------------|---------|--------------------|
| civiccore       | 1.2.1   | n/a (platform)     |
| civicrecords-ai | 1.7.3   | 1.2.1              |
| civicnotice     | 0.2.0   | 1.2.1              |
| civicaccess     | 0.4.0   | 1.2.1              |

## CO-7 placeholder audit

Audited on 2026-05-05 before the CivicCore freeze-line tag. The audit searched
all module repos in this matrix for production reliance on
`civiccore.catalog`, `civiccore.exemptions`, and `civiccore.scaffold`.

Command shape:

```powershell
git -C <module> grep -n -E 'civiccore\.(catalog|exemptions|scaffold)|from civiccore import (catalog|exemptions|scaffold)|import civiccore\.(catalog|exemptions|scaffold)' -- .
```

Result: no production-code reliance found. CivicClerk and CivicCode contain
test-only mentions of `civiccore.catalog` and `civiccore.exemptions` in schema
guard tests that assert module tables do not foreign-key into unreleased
CivicCore placeholder targets. Those tests are compatibility safeguards, not
runtime dependencies.

## Reading a row

Rows record the exact CivicCore version a module release is verified against.
Mixing other CivicCore versions with a module release produces undefined
behavior. The `civiccore` row records the latest platform release; module rows
record exact local and published pins when they differ.

## Tested pairs (history)

| Date       | civiccore | Module / version       | Result | Evidence |
|------------|-----------|------------------------|--------|----------|
| 2026-05-21 | 1.1.0     | civicpermit 1.0.0      | green  | CivicPermit PR #12 merged; main verify run `26233364327` passed; repaired tag `v1.0.0` peels to `da4ee8e3194eedc15361cf1baf9bab1e5bce5d6f`; release workflow run `26233455321` and tag verify run `26233454863` passed release verification, public browser QA, artifact build, and GitHub release publication with wheel, sdist, and SHA256SUMS assets. (v1.0.0 label later corrected — see [docs/release-recovery-status.md](../release-recovery-status.md)) |
| 2026-05-21 | 1.1.0     | civicinspect 1.0.0     | green  | CivicInspect PR #10 merged; main verify run `26236492518` passed; repaired tag `v1.0.0` peels to `a018241d801feb89e9ff5bf29666edbeda6a2c9a`; release workflow run `26236555671` and tag verify run `26236555694` passed release verification, public browser QA, artifact build, and GitHub release publication with wheel, sdist, and SHA256SUMS assets. (v1.0.0 label later corrected — see [docs/release-recovery-status.md](../release-recovery-status.md)) |
| 2026-05-21 | 1.1.0     | civicplan 1.0.0        | green  | CivicPlan PR #11 merged; main verify run `26229109178` passed; tag `v1.0.0` now peels to `5e23679f1122cfb0744e8c71aecdf6cf52283bf0`; release workflow run `26229189252` and tag verify run `26229189480` passed release verification, public browser QA, artifact build, and GitHub release publication with wheel, sdist, and SHA256SUMS assets. (v1.0.0 label later corrected — see [docs/release-recovery-status.md](../release-recovery-status.md)) |
| 2026-05-21 | 1.1.0     | civiccode 1.0.0        | green  | CivicCode PR #56 and #57 merged; main verify run `26219229208` passed; tag `v1.0.0` now peels to `cb5f23eb437863b602df2ba2825bb72fd26e1154`; release workflow run `26219395141` passed release verification, public browser QA, artifact build, release attestation verification, and GitHub release publication with wheel, sdist, attestation, bundle, and SHA256SUMS assets. |
| 2026-05-21 | 1.1.0     | civicaccess 1.0.0      | green  | CivicAccess PR #6 merged; main verify run `26222780265` passed; tag `v1.0.0` peels to `e29e701d96817a1aaca053ae8979851d9fb9dc51`; GitHub release published wheel, sdist, and SHA256SUMS assets after public browser QA and release-gate audit. (v1.0.0 label later corrected — see [docs/release-recovery-status.md](../release-recovery-status.md)) |
| 2026-05-15 | 1.0.1     | civicrecords-ai 1.6.1       | green  | Ingestion worker event-loop recovery patch shipped; worker tasks create and dispose their async SQLAlchemy engine inside each task coroutine instead of reusing a module-global engine across Celery prefork task event loops. |
| 2026-05-12 | 1.0.1     | civicrecords-ai 1.6.0       | green  | B2 audit punch-list closed: JWT_SECRET and FIRST_ADMIN_PASSWORD material moved to Docker Compose secret files; release verifier and contract test enforce the literal `JWT_SECRET\|FIRST_ADMIN_PASSWORD` directive grep returning zero container env matches. |
| 2026-05-11 | 1.1.0     | civiccore 1.1.0 + civiccode/civicplan/civicpermit/civicinspect/civicgrants/civicprocure | green | CivicCore v1.1.0 shipped `staff_key_gate`; six D2/B3 module PRs updated hash-locked pins and replaced bespoke staff-key comparisons where present. |
| 2026-05-10 | 1.0.1     | civiccore 1.0.1        | green  | CivicCore recovery patch shipped with auth-error-payload hardening; downstream pin sweep reconciled CivicClerk, CivicCode, CivicZone, CivicPlan, CivicPermit, CivicInspect, CivicGrants, and CivicProcure to the hash-locked v1.0.1 wheel. |
| 2026-05-06 | 1.0.0     | civicclerk 1.0.0       | green  | civicclerk release `v1.0.0` is published with wheel, source distribution, SHA256SUMS, and release handoff assets; PR #153 merged integration-depth contracts into main at ee1b7a0; `bash scripts/verify-release.sh` passed with 585 backend tests, docs, docs-render smoke, prompt evals, frontend audit/build/tests, package build, and release contract tests; docs-render/browser evidence claimed 200 cases with zero console, text, keyboard, focus, or overflow failures. |
| 2026-05-05 | 1.0.0     | civiccore 1.0.0        | green  | civiccore release `v1.0` was the shared-platform release at the time; release assets published `civiccore-1.0.0` wheel and source distribution after CO-9 closeout and evidence-manifest hash refresh. |
| 2026-05-05 | 0.22.1    | civiccore 0.22.1       | green  | civiccore v0.22.1 is the first attested baseline release; CO-6 cleanroom harness PR #47 merged at fed0639 with GitHub `civiccore CI` and `civiccore cleanroom` green, local two-run cleanroom stable manifest hash `aed4295021277702eec4c4cffd53a8bd0cb4208e0075f46098f77f7d436af647`, and release-provenance/SHA256SUMS/Sigstore paths green against the published v0.22.1 assets. |
| 2026-05-04 | 0.22.0    | civiccode 0.1.17       | green  | civiccode PR #40 merged at f3e54e8 for durable codifier sync source state; PR #41 merged at a1f414a for release-signing documentation and the release-provenance gate; `bash scripts/verify-release.sh` passed post-merge with 154 tests, docs gate, placeholder import gate, Ruff, build artifact checks, and SHA256SUMS; docs-render smoke evidence captured desktop/mobile durable codifier sync-state docs states with zero console events and no horizontal overflow; GitHub release `v0.1.17` published wheel, sdist, and SHA256SUMS assets after release provenance verification passed against annotated tag object 31d9d18 and GitHub-verified target commit a1f414a |
| 2026-05-04 | 0.22.0    | civiccode 0.1.16       | green  | civiccode main at 1e66a87 after PR #39 CI passed; `bash scripts/verify-release.sh` passed post-merge with 153 tests, docs gate, placeholder import gate, Ruff, build artifact checks, and SHA256SUMS; docs-render smoke evidence captured desktop/mobile durable import-job ledger docs states with zero console events and no horizontal overflow; GitHub release `v0.1.16` published wheel, sdist, and SHA256SUMS assets |
| 2026-05-04 | 0.22.0    | civiccode 0.1.15       | green  | civiccode PR #38 merged at dbbdb0a; `bash scripts/verify-release.sh` passed post-merge with 151 tests, docs gate, placeholder import gate, Ruff, build artifact checks, and SHA256SUMS; docs-render smoke evidence captured desktop/mobile durable CivicClerk handoff persistence docs states with zero console events and no horizontal overflow; GitHub release `v0.1.15` published wheel, sdist, and SHA256SUMS assets |
| 2026-05-04 | 0.22.0    | civiccode 0.1.14       | green  | civiccode PR #37 merged at f5474b0; `bash scripts/verify-release.sh` passed post-merge with 149 tests, docs gate, placeholder import gate, Ruff, build artifact checks, and SHA256SUMS; docs-render smoke evidence captured desktop/mobile durable staff guidance docs states with zero console events and no horizontal overflow; main CI run 25326459632 passed; GitHub release `v0.1.14` published wheel, sdist, and SHA256SUMS assets |
| 2026-05-04 | 0.22.0    | civiccode 0.1.13       | green  | civiccode PR #36 merged at 63009d0; `bash scripts/verify-release.sh` passed post-merge with 146 tests, docs gate, placeholder import gate, Ruff, build artifact checks, and SHA256SUMS; docs-render smoke evidence captured desktop/mobile durable section lifecycle docs states with zero console events and no horizontal overflow; main CI run 25322924453 passed; GitHub release `v0.1.13` published wheel, sdist, and SHA256SUMS assets |
| 2026-05-04 | 0.22.0    | civiccode 0.1.12       | green  | civiccode PR #35 merged at c038ca2; `bash scripts/verify-release.sh` passed post-merge with 144 tests, docs gate, placeholder import gate, Ruff, build artifact checks, and SHA256SUMS; docs-render smoke evidence captured desktop/mobile durable popular-question discovery docs states with zero console events and no horizontal overflow; main CI run 25321903471 passed; GitHub release `v0.1.12` published wheel, sdist, and SHA256SUMS assets |
| 2026-05-03 | 0.22.0    | civiccode 0.1.11       | green  | civiccode PR #34 merged at a783d18; `bash scripts/verify-release.sh` passed post-merge with 142 tests, docs gate, placeholder import gate, Ruff, build artifact checks, and SHA256SUMS; docs-render smoke evidence captured desktop/mobile popular-question and related-material discovery states with zero console events and no horizontal overflow; main CI run 25277308021 passed; GitHub release `v0.1.11` published wheel, sdist, and SHA256SUMS assets |
| 2026-05-03 | 0.22.0    | civiccode 0.1.10       | green  | civiccode PR #33 merged at d98b319; `bash scripts/verify-release.sh` passed post-merge with 135 tests, docs gate, placeholder import gate, Ruff, build artifact checks, and SHA256SUMS; Docker Compose PostgreSQL 17 + pgvector demo smoke passed on isolated port 18011; Docker/PostgreSQL backup-restore rehearsal passed with `pg_dump`, `pg_restore`, restored application table verification, checksum manifest, and temporary restore database cleanup; docs-render smoke evidence captured desktop/mobile docs states with zero console events and no horizontal overflow; main CI run 25276786155 passed; GitHub release `v0.1.10` published wheel, sdist, and SHA256SUMS assets |
| 2026-05-03 | 0.22.0    | civiccode 0.1.9        | green  | civiccode PR #32 merged at 52ad536; `bash scripts/verify-release.sh` passed post-merge with 130 tests, docs gate, placeholder import gate, Ruff, build artifact checks, and SHA256SUMS; Docker Compose PostgreSQL 17 + pgvector demo smoke passed with seeded public and staff workspaces; docs-render smoke evidence captured public/staff desktop/mobile states with zero console events; main CI run 25276253860 passed; GitHub release `v0.1.9` published wheel, sdist, and SHA256SUMS assets |
| 2026-05-03 | 0.22.0    | civiccode 0.1.8        | green  | civiccode PR #31 merged at bad214b; `bash scripts/verify-release.sh` passed post-merge with 128 tests, docs gate, placeholder import gate, Ruff, build artifact checks, docs-render smoke evidence, and SHA256SUMS; main CI run 25275545604 passed; GitHub release `v0.1.8` published wheel, sdist, and SHA256SUMS assets |
| 2026-05-03 | 0.22.0    | civicclerk 0.1.20      | green  | civicclerk PR #138 merged at 4a100f1; `bash scripts/verify-release.sh` passed post-merge with 540 backend tests, docs, docs-render smoke, prompt evals, frontend audit/build/tests, package build, checksums, and release contract; main CI run 25274819496 passed; release workflow run 25274852339 published wheel, sdist, and SHA256SUMS assets |
| 2026-05-03 | 0.22.0    | civicrecords-ai 1.4.10 | green  | civicrecords-ai PR #63 merged at d50b9ee; release `v1.4.10` published unsigned Windows installer and checksum assets after the CivicCore v0.22.0 source-status consumer alignment |
| 2026-05-03 | 0.22.0    | civiccore 0.22.0       | green  | civiccore release `v0.22.0` published wheel, sdist, and SHA256SUMS assets for shared sync source-list health projection |
| 2026-05-03 | 0.21.0    | civiccode 0.1.7        | green  | civiccode PR #30 merged at f69c1e3; `bash scripts/verify-release.sh` passed post-merge with 128 tests, docs gate, placeholder import gate, Ruff, build artifact checks, and SHA256SUMS; main CI run 25271655878 passed; GitHub release `v0.1.7` published wheel, sdist, and SHA256SUMS assets |
| 2026-05-03 | 0.21.0    | civiccode 0.1.6        | green  | civiccode PR #29 merged at 4dc0997; `bash scripts/verify-release.sh` passed post-merge with 121 tests, docs gate, placeholder import gate, Ruff, build artifact checks, and SHA256SUMS; main CI run 25271238231 passed; GitHub release `v0.1.6` published wheel, sdist, and SHA256SUMS assets |
| 2026-05-03 | 0.21.0    | civicclerk 0.1.19      | green  | civicclerk PR #137 merged at e261b43; `bash scripts/verify-release.sh` passed post-merge with 539 backend tests, docs, docs-render smoke, prompt evals, frontend audit/build/tests, package build, checksums, and release contract; main CI run 25270758909 passed; release workflow run 25270834580 published wheel, sdist, and SHA256SUMS assets |
| 2026-05-02 | 0.21.0    | civicrecords-ai 1.4.8  | green  | civicrecords-ai PR #59 and PR #60 merged through f20e3e7; release `v1.4.8` published with unsigned Windows installer assets while consuming CivicCore v0.21.0 shared scheduling helpers |
| 2026-05-02 | 0.21.0    | civiccore 0.21.0       | green  | civiccore PR #34 merged at 4a1eb71; release `v0.21.0` published wheel, sdist, and SHA256SUMS assets for shared scheduling helpers |
| 2026-05-02 | 0.20.0    | civicclerk 0.1.18      | green  | civicclerk PR #136 merged at fe7ddc4; `bash scripts/verify-release.sh` passed with 539 backend tests, docs, docs-render smoke, prompt evals, frontend audit/build/tests, package build, checksums, and release contract; main CI run 25256065842 passed; release workflow run 25256107238 published wheel, sdist, and SHA256SUMS assets |
| 2026-05-02 | 0.20.0    | civicrecords-ai 1.4.7  | green  | civicrecords-ai PR #58 merged at 884cf5c; `bash scripts/verify-release.sh` passed; master CI run 25255230035 passed; GitHub release `v1.4.7` published unsigned Windows installer and checksum assets while consuming CivicCore v0.20.0 shared startup config validation |
| 2026-05-02 | 0.20.0    | civiccore 0.20.0       | green  | civiccore PR #33 merged at ad66681; `bash scripts/verify-release.sh` passed with 238 tests and fresh venv install verification; main CI run 25254779253 passed; release workflow run 25254819041 published wheel, sdist, and SHA256SUMS assets |
| 2026-05-02 | 0.19.0    | civiccode 0.1.5        | green  | civiccode PR #28 merged at 22d1602; `bash scripts/verify-release.sh` passed with 115 tests, docs gate, placeholder import gate, Ruff, and build artifact checks; main CI run 25252849777 passed; GitHub release `v0.1.5` published wheel, sdist, and SHA256SUMS assets |
| 2026-05-02 | 0.19.0    | civicclerk 0.1.17      | green  | civicclerk PR #134 merged at 94f43ce; PR #135 fixed CI CivicCore wheel-pin drift at 5b6e28e; `bash scripts/verify-release.sh` passed; main CI run 25251247832 passed; release workflow run 25251278443 published wheel, sdist, and SHA256SUMS assets |
| 2026-05-02 | 0.19.0    | civicrecords-ai 1.4.6  | green  | civicrecords-ai PR #57 merged at decab6a; `bash scripts/verify-release.sh` passed; master CI run 25250635852 passed; GitHub release `v1.4.6` published unsigned Windows installer and checksum assets while consuming CivicCore v0.19.0 shared contracts |
| 2026-05-02 | 0.18.1    | civicclerk 0.1.16      | green  | civicclerk PR #133 merged at c4455a3; `bash scripts/verify-release.sh` passed; main CI run 25249364936 passed; release workflow run 25249394980 published wheel, sdist, and SHA256SUMS assets |
| 2026-05-02 | 0.18.1    | civicrecords-ai 1.4.5  | green  | civicrecords-ai PR #55 merged at 1bd3d1c; `bash scripts/verify-release.sh` passed; master CI run 25246593265 passed; GitHub release `v1.4.5` published unsigned Windows installer and checksum assets while consuming shared CivicCore sync primitives |
| 2026-05-02 | 0.18.1    | civicclerk 0.1.15      | green  | civicclerk PR #126 and PR #127 merged; main at 0792db7; `bash scripts/verify-release.sh` passed; main CI run 25247765134 passed; release workflow run 25247799821 published wheel, sdist, and SHA256SUMS assets |
| 2026-05-01 | 0.17.0    | civicrecords-ai 1.4.4  | green  | civicrecords-ai PR #54 merged at 1a7d2c0; `bash scripts/verify-release.sh` passed; master CI run 25238649491 passed; GitHub release `v1.4.4` published unsigned Windows installer and checksum assets |
| 2026-05-01 | 0.17.0    | civicclerk 0.1.13      | green  | civicclerk main at 77599cb; PR #108 merged; `bash scripts/verify-release.sh` passed; GitHub release `v0.1.13` published wheel, sdist, and SHA256SUMS assets |
| 2026-04-29 | 0.11.0    | civicclerk 0.1.4       | green  | civiccore PR #22 merged and v0.11.0 assets published; civicclerk PR #38 merged at 79d9b3b; PR #39 fixed CI wheel-pin drift; verify-release.sh PASSED post-merge |
| 2026-04-29 | 0.11.0    | civiclegal 0.1.2       | green  | civiclegal PR #4 merged at 09ce3b8; PR #5 fixed workflow wheel-pin drift; verify-release.sh PASSED post-merge |
| 2026-04-29 | 0.10.0    | civicrecords-ai 1.4.1  | green  | records-ai PR #51 merged at fa0ef0c; onboarding helper rollout verified against published civiccore v0.10.0 wheel |
| 2026-04-29 | 0.4.0     | civicbudget 0.1.2      | green  | civicbudget PR #4 merged; auth rollout verified against published civiccore v0.4.0 release |
| 2026-04-29 | 0.4.0     | civiccourt 0.1.2       | green  | civiccourt PR #4 merged at bc8f0e4; verify-release.sh PASSED post-merge |
| 2026-04-29 | 0.4.0     | civicdata 0.1.2        | green  | civicdata PR #5 merged at 5d8378d; verify-release.sh PASSED post-merge |
| 2026-04-28 | 0.3.0     | civicrecords-ai 1.4.1  | green  | civicrecords-ai PR #48 merged at ac71f61; release workflow run 25071324131; v1.4.1 installer assets published; verify-release.sh PASSED |
| 2026-04-28 | 0.3.0     | civicclerk 0.1.1       | green  | civicclerk PR #29 merged at 7d54d30; 382 tests passed; verify-release.sh PASSED; GitHub release assets published |
| 2026-04-28 | 0.3.0     | civiccore 0.3.0        | green  | civiccore release workflow run 25037429110; PR #14; 122 tests passed; release assets published |
| 2026-04-27 | 0.2.0     | civicclerk 0.1.0       | green  | civicclerk release workflow run 24975592931; CivicClerk v0.1.0 published with civiccore 0.2.0 wheel |
| 2026-04-25 | 0.2.0     | civicrecords-ai 1.4.0  | green  | records-ai release workflow run 24943570795; CivicRecords AI v1.4.0 published with civiccore 0.2.0 wheel |

## Update policy

- Updated every time a module ships a new version that changes its civiccore pin.
- Updated every time civiccore ships a new MINOR or MAJOR.
- When a row changes, also update `CONSISTENCY.md` if any number listed there moves.
