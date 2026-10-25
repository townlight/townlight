# Townlight Planning 1.5.1 — fresh Windows installations

## Supported scope

Opt-in staff Planning supports adopted plan sources and originals, cited saved
analyses, explicit staff review, separately edited public summaries,
permission-controlled immutable snapshots and explicit Records attachment.
Planning supports human judgment; it does not make land-use, entitlement, legal
or elected-body determinations. Permitting, Inspections and a broader public
Planning portal are outside scope. Records remains the installation default;
optional AI is not required.

The owner confirmed on October 24, 2026 that there are no existing user
installations. Historical signed 1.4 and 1.5.0 upgrades are outside this release's
supported installation scope and remain unverified. They do not block this
fresh-install release. No upgrade, VM or Sandbox work is required. A different
data profile does not isolate an MSI upgrade; do not open a migrated database
using older code. Preserve prior installers and matching coherent backups.

## Exact accepted installer

- Release: **1.5.1**, tag `townlight-records-meetings-code-zoning-planning-v1.5.1`.
- Signed source: `7ccfea24cd1da385faedc75544fe32f957b94083`, including PR #278.
- Successful signed build/integration/lifecycle run: `40116067286`.
- Original signed artifact: `12570477112`.
- Desktop version: `1.5.1-1`; MSI ProductVersion: `1.5.1.1`.
- MSI: `Townlight_1.5.1-1_x64_en-US.msi` (1,718,542,336 bytes).
- MSI SHA256: `3c6fe6baee8b56b1f03fd241c209ff426e14af145c1ae6fb3c3473272c066a62`.
- Embedded EXE SHA256: `7f415efee01e3c2bf670eca7154f1ca01b3e6f03b24cc575d716082d6a66c077`.
- Provenance SHA256: `4270c9cae8ad0779100369d99c332ee7d930b8632593842a77eb31ce24cf7de0`.

This is byte-for-byte the accepted 1.5.1-beta.1 installer, signed by Scott
Converse with a Microsoft timestamp. Its frozen contract, `planning-staff-beta`
build profile, `planning-preview` runtime identifier and **Townlight Planning
development preview** selection label remain unchanged for compatibility and
provenance. Select that profile explicitly through normal controls. Public
release classification is separate from these retained internal names and the
numeric MSI version. No installer or module is rebuilt or re-signed.
`config/planning-staff-release.json` pins this one promotion separately from the
original signed build contract.

## Passed evidence reused

The signed candidate's build, desktop/Core integration and MSI
install/first-run/backup-restore/uninstall lifecycle passed. Signature, timestamp,
source/run, embedded EXE, frozen contract and eight pinned sources were verified.
Exact host installation returned MSI exit 0 with matching hashes and no restart.
The installed native backend passed the Analyses list, ready policy library,
native source preview, one cited saved draft, explicit review and public preview
excluding private notes and full staff analysis. Prior setup, initialization,
migration and opt-in evidence was reused.

P5/P6 and signed 1.5.0 acceptance supply unchanged feature evidence for source
history, snapshot export, Records handoff, permissions, revocation, restart and
recovery. Earlier unsigned uninstall/reinstall and recovery results are supporting
evidence, not new execution against final signed 1.5.1 bytes. No new installed
tests or broad local reruns are required for this unchanged candidate.

## Operating limits

- Starting stopped services can leave a saved Records launch error visible. After
  services start, use **Retry Records**; this cleared the error in acceptance.
- Drafts are not autosaved to disk. Save before closing or signing out.
- Project filtering covers the loaded page. Use Next page for more analyses.
- Public preview excludes private notes and full staff analysis. Creating a
  reviewed snapshot does not publish a document or release a Records response.

See the [workspace guide](../desktop/planning-workspace.md). This release does not
claim broad public usability, full-suite city readiness, municipal SSO or verified
historical upgrades. It does not rehabilitate the Planning module's historical
erroneous v1.0.0 release or publish a new module version.

## Authorized delivery

The owner authorized push, normal protected merge, tag and publication on October
24, 2026. Required CI for changed release tooling remains required; existing
product evidence is reused. The stable tag targets the accepted signed source,
not the later tooling/docs merge. The attachment workflow restricts this promotion
to its exact source, signing run, artifact ID and MSI hash while retaining every
original signature, receipt, embedded provenance, frozen contract, eight-source
and immutable-history guard. No new signing is authorized or needed.

Publish as a non-prerelease with `make_latest=false`. Preserve default downloads,
Records-only default selection, the 1.5.1-beta.1 release, signed 1.4/1.5.0 and all
other historical tags, assets and evidence. Publication is complete only after
public metadata, exact assets and installer-link availability are read back.
