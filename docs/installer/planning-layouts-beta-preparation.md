# Townlight Planning layouts: 1.5.1-beta.1 preparation

Status: source preparation only. This update does not sign an installer, create a
tag or release, publish assets, or change default downloads. The published
[Planning 1.5.0-beta.1](https://github.com/townlight/townlight/releases/tag/townlight-records-meetings-code-zoning-planning-v1.5.0-beta.1)
and [signed 1.4 release](https://github.com/townlight/townlight/releases/tag/townlight-records-meetings-code-zoning-v1.4.0-beta.1)
remain unchanged. Earlier preparation and acceptance documents describe their
original versions and evidence.

## Frozen scope and identity

The successor is an opt-in staff beta, not general availability or a public
Planning portal. [PR #275](https://github.com/townlight/townlight/pull/275), merged
at `9673126730c22b737f9e9860c9381b12e5a17f7e`, adds the analyses list and open-analysis
Draft, Reviewed and public-preview layouts, with draft retention and existing
permission/revision/hash checks. See the [workspace guide](../desktop/planning-workspace.md).
No backend, schema or module changes are included in this release preparation.

- Release label: **1.5.1-beta.1**.
- Reserved future tag: `townlight-records-meetings-code-zoning-planning-v1.5.1-beta.1`.
- Desktop version: `1.5.1-1`; Windows MSI ProductVersion: `1.5.1.1`.
- Build profile: `planning-staff-beta`; installed runtime selection: `planning-preview`.
- Source preparation branch: `planning/layouts-beta-1-5-1`.

`config/planning-staff-beta.json`, the Tauri beta version overlay and the explicit
identity guard in `desktop/scripts/planning-build-contract.ps1` agree on this
version. The eight sources in `config/planning-staff-beta-sources.json` are
unchanged: Planning `0.3.0`, Records `1.7.4`, Core `1.2.1` and all other module pins
retain their prior identities. No module publication is implied. Records remains
the default; Permitting, Inspections and the wider land-use profile remain disabled.

Application ID `org.civicsuite.desktop`, MSI upgrade code
`a63fc1d3-5437-5f55-89a2-fef93fb1f930`, compatibility paths and API/package identifiers
are preserved. The separate P5/P6 development contracts and source manifests are
unchanged. No existing installer, historical receipt or release asset is replaced.

## Build selection and evidence reuse

The preparation branch selects the staff-beta contract automatically. Ordinary
`main` builds still select `zoning-beta`; their MSI is not the Planning release
candidate. A later authorized candidate must explicitly select
`product_profile=planning-staff-beta` from the approved main commit. Routine CI
artifacts remain visibly unsigned and cannot satisfy publication gates. Existing
manual-main signing, signature, timestamp, provenance and immutable-asset checks
remain intact.

Reuse PR #275's passed static/frontend checks and five focused Planning browser
checks, plus required CI: verify run `39882270522`; unsigned Windows MSI build,
desktop/Core integration and MSI install/first-run/backup-restore/uninstall
lifecycle run `39882270488`. Those results describe the tested layout source and
artifacts. They do not certify new signed 1.5.1 bytes.

For this preparation, run the affected resolver contract check and normal
repository-required CI. Do not rerun broad local suites or dispatch additional
builds. CI triggered by this source PR is required evidence for its new identity;
it does not replace or relabel earlier evidence. No Sandbox work is included.

## Acceptance limits and later delivery

No signed 1.5.1 candidate exists as a result of this preparation. Exact signed
1.5.0 fresh installation and Planning acceptance remain historical evidence for
1.5.0 only. The populated signed-1.4 upgrade to the published Planning beta remains
unverified; upgrading either 1.4 or 1.5.0 to new signed 1.5.1 bytes is unverified.
Earlier unsigned P6 upgrade and recovery results are supporting evidence only.

Future notes must retain these upgrade limitations and distinguish source/browser
checks, unsigned CI lifecycle and exact signed-artifact acceptance. Existing 1.4
users should retain their installation and evaluate the beta in a separate Windows
environment. Selecting a different data profile does not isolate an MSI upgrade.
Retain the prior installer and corresponding coherent backup; do not open a newer
migrated database with older code or claim an in-place downgrade procedure.

After separate authorization, the bounded remaining work is one signed Planning
candidate, signature/source/hash verification and one short installed check of
the changed list-to-reviewed-public-preview journey in an agreed Windows
environment. No Sandbox or shared prerequisite repair is planned. New signing,
tagging and prerelease publication require their corresponding authorization;
publication must reuse the accepted candidate without a second build. Release
notes, checksums, provenance and acceptance disclosures must refer to those exact
bytes. Preserve all historical releases and existing default download destinations.

This preparation stops with one reviewable source PR and its required checks.
It does not authorize merging, signing, tagging or publication.
