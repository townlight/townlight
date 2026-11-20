# Organization cleanup — November 2026

The published Windows 1.8.1.1 MSI and its source archive, tag and evidence remain unchanged. Current source corrections below are for a future build; they are not retroactive claims about that MSI.

## Current source corrections

Standalone Boards and Contracts staff API routes require configured Core staff-key and role checks. Their sample/health surfaces remain public. The installed Windows application continues to use the separate authenticated municipal staff bridge. Direct Python runtime starts require an explicit `DATABASE_URL`; the supervisor already supplies its generated local database credentials. The Python runtime no longer silently selects a shared fallback password.

The Boards registration helper now has a descriptive source name with a compatibility export for pinned callers; board persistence and auditing are unchanged. QuorumRelay has explicit AGPL-3.0-only package licensing. Current Procurement source is aligned with its AGPL Core dependency, retaining original Apache notices and historical grants.

## Released component source identities

Package version numbers alone do not identify the shipped source. The following immutable pins describe the published bundle; missing standalone version tags are not evidence that the MSI contains different code. No artificial component release tags were created.

| Component | Package version in bundle | Exact pinned source |
|---|---|---|
| Townlight Core | 1.3.0.dev2 | [3021821bf9a9](https://github.com/townlight/core/tree/3021821bf9a92c790a399ad12aed821d65b09105) |
| Townlight Records | 1.8.0.dev2 | [e1b712091c38](https://github.com/townlight/sunshine/tree/e1b712091c38fadeb00c19233d7f2bf1280fc248) |
| Townlight Meetings | 1.0.6 | [77ae8781f4a4](https://github.com/townlight/meetings/tree/77ae8781f4a414f6f85c35a7e4394e29b0e0f21d) |
| Townlight Code | 1.0.9 | [22d00f560cc4](https://github.com/townlight/ordinances/tree/22d00f560cc45088a5b24a3f997787ee9c7a5e31) |
| Townlight Access | 0.5.0 | [f377a9a6e2a1](https://github.com/townlight/access/tree/f377a9a6e2a14d890333a20eab9277d644a9aaeb) |
| Townlight Notice | 0.3.0 | [4edf01296b0a](https://github.com/townlight/notice/tree/4edf01296b0ad56a331e7fdd9b7c2d19c20b8e48) |
| Townlight Zoning | 0.2.3 | [fb352955720d](https://github.com/townlight/zone/tree/fb352955720db2e6e21caca816a8eb609a49f768) |
| Townlight Planning | 0.4.0.dev2 | [7de514f1afd7](https://github.com/townlight/plan/tree/7de514f1afd720f93bd70a4866c3389ef621dc49) |
| Townlight Permitting | 0.3.0+dev.2 | [224116d9c714](https://github.com/townlight/permit/tree/224116d9c714f613646f2b6ce2cbb687cb5e0040) |
| Townlight Inspections | 0.3.0+dev.2 | [a6861f262328](https://github.com/townlight/inspect/tree/a6861f262328e7645557ad2a2600db4a12a5046c) |
| Townlight Station | 0.3.1 | [5e65aa407959](https://github.com/townlight/station/tree/5e65aa40795933ce2f39b195f869dacb9d4aa6a8) |
| Townlight Boards & Commissions | 0.2.0 | [d14340b713c8](https://github.com/townlight/boards/tree/d14340b713c880908cc27e383a59271ed0471ac0) |
| Townlight Contracts | 0.2.0 | [873de5bbff0f](https://github.com/townlight/contracts/tree/873de5bbff0f596b2c7cf20da4c68e94c3c3934c) |
| Townlight Procurement | 0.3.0 | [f10cd99f65f5](https://github.com/townlight/procure/tree/f10cd99f65f5f867d331af3bd6e60742bca61268) |

Canonical bundle identity: [1.8.1.1 acceptance](https://github.com/townlight/townlight/releases/download/townlight-windows-v1.8.1.1/ACCEPTANCE-Windows-1.8.1.1.md). Station beta-1 is the Python service; the separate Rust kernel is not the published service.

## CI and historical runs

Bounded Windows jobs run existing Python contracts, with retained test reports; they do not claim an installed full-suite retest. Existing hosted database/browser checks remain. Playwright jobs use the supported ubuntu-24.04 runner image after ubuntu-latest moved to unsupported 26.04; this is maintenance of existing CI, not a Linux product release.

Historical failed release workflows remain visible: Inspections v0.2.2, run 26332943411 (May 23), and Code v0.5.0, run 25622555452 (May 10). They are not evidence of failure of the accepted Windows 1.8.1.1 MSI. Do not rerun obsolete publication jobs.

## Repository size and cleanup

Measured full Git pack: 2.05 GiB. Repeated historical generated installers dominate; the largest individual retained blob is the 38,856,053-byte installed evidence ZIP. That ZIP and its member checksums are preserved. Removed current-tree disposable log, obsolete Linux archive and duplicate brand ZIP are itemized with their hashes and historical locations in [the cleanup manifest](current-tree-cleanup-2026-11.json). The canonical Open Hall package remains at `docs/brand/Townlight-Open-Hall-Brand.zip`.

LFS was permitted and evaluated. Converting current files would leave old blobs in history, so this change does not claim to reduce historical clone size. No history rewrite or evidence deletion was performed.

## Signing: owner scope decision

Scott explicitly removed OIDC migration on November 19, 2026. It is not a release gate, remaining cleanup obligation or implied authorization. The temporary probe/bootstrap workflow was removed; issue #249 is closed as not planned. Keep the existing supported client-secret signing method and every signature/timestamp verification safeguard. Any future OIDC project requires new explicit owner approval. See [the owner decision](SIGNING-SCOPE.md). No Azure credential or role changed.

## Dependency-alert configuration

Checked all 31 organization repositories through the authenticated GitHub API. Thirty already had Dependabot alerts enabled; Records (`sunshine`) had them disabled. Enabled Records alerts and verified its alert response. All 31 repositories reported zero alerts when checked on November 19, 2026. This is a dated observation, not a guarantee that future alerts cannot appear. No dependency upgrade or new release gate was added.

## Historical storage attribution

The full mirror contains a 2.05 GiB Git pack. Historical `installer/dist` objects account for 6,457,213,460 raw uncompressed bytes across 485 distinct blobs; compression and delta storage make this different from actual clone size. Current-tree removals total 21,883,763 bytes. Retained evidence and historical installer identities are unchanged. The temporary measurement mirror is disposable after its attribution receipt is saved.

## Original pull-request dispositions

- [townlight/townlight #311](https://github.com/townlight/townlight/pull/311): retained open. Preserve separate QuorumRelay integration work in flight; not merged or changed by this cleanup.
- [townlight/core #79](https://github.com/townlight/core/pull/79): retained open. Preserve the independent catalog-collation fix for its own validation; not part of documentation/maintenance delivery and absent from unchanged released MSI.
- [townlight/ordinances #79](https://github.com/townlight/ordinances/pull/79): closed without merging; source retained. Superseded dependency/release preparation for old CivicCore 1.2.1; current package uses Townlight Core 1.3.0.dev2.
- [townlight/meetings #179](https://github.com/townlight/meetings/pull/179): closed without merging; source retained. Superseded rename to CivicSunshine conflicts with current Townlight Records branding and current source pairing.
- [townlight/sunshine #103](https://github.com/townlight/sunshine/pull/103): closed without merging; source retained. Superseded SignPath proposal; current Windows releases use the documented Azure Scott Converse signing path.
- [townlight/core #63](https://github.com/townlight/core/pull/63): closed without merging; source retained. Unadopted legacy pipeline scaffolding; current owner bounded-completion contract does not authorize introducing these generic process gates.
- [townlight/meetings #170](https://github.com/townlight/meetings/pull/170): closed without merging; source retained. Unadopted legacy pipeline scaffolding; current owner bounded-completion contract does not authorize introducing these generic process gates.
- [townlight/ordinances #74](https://github.com/townlight/ordinances/pull/74): closed without merging; source retained. Unadopted legacy pipeline scaffolding; current owner bounded-completion contract does not authorize introducing these generic process gates.
- [townlight/core #59](https://github.com/townlight/core/pull/59): closed without merging; source retained. Historical proof-document clarification predating current naming and release documentation. Preserve this proposed patch in the closed PR; do not rewrite historical evidence during current cleanup.
- [townlight/sunshine #23](https://github.com/townlight/sunshine/pull/23): closed without merging; source retained. Historical Phase 1 extraction inventory draft predating the completed Core extraction and naming migration; retained as historical proposed documentation, not a current implementation obligation.

The two retained PRs are separate existing work, not new release requirements introduced by this cleanup. Closed proposals retain their branches/commits and review history.

## Issue reconciliation

Historical Suite release closeout #298 and inner-executable signing #253 are closed as resolved by their existing release evidence. Records transfer #27 and obsolete footer #88 are closed against current repository/source readback. OIDC #249 is closed as not planned by explicit owner decision. Records #98 remains an explicitly nonblocking runtime-guidance backlog item; this cleanup does not turn it into a release requirement.

The current hosted Windows image exposed an archive-module/.NET overload incompatibility under Windows PowerShell 5.1. Runtime ZIP staging now uses compatible entry-level extraction, preserving overlay files and path-escape protection. Four real-shell regression checks passed locally across Windows PowerShell 5.1 and PowerShell 7; required Windows CI reruns against the corrected source. This packaging fix does not replace the published MSI.
