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

## Signing migration

The main-only OIDC probe is separate from software release generation. Azure initially returned AADSTS70025 because no federation was configured. The actual immutable GitHub subject is `repo:townlight@316295879/townlight@1219689730:ref:refs/heads/main`; broad PR or arbitrary-branch trust is not acceptable. The existing signing route stays available until OIDC signing and independent signature verification pass. Shared organization credentials must not be revoked for sibling repositories.

The opt-in setup attempt also returned HTTP 403 from Microsoft Graph: the signing app lacks authority to administer its Entra application. CivicCast `CODE_SIGNING_POLICY.md` confirms its existing path uses the same client secret and has no federation. OIDC migration remains incomplete pending tenant application-admin authority; do not remove the proven signing route or shared sibling secrets.
