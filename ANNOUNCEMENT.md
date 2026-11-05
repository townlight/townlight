# Townlight Windows public beta 1.7.2.1 is available

Municipal software cities can actually own.

Townlight's signed Windows x64 public beta is available now. It brings municipal
work into connected local workspaces, with a record of the sources, staff review
and decisions behind it. The installer was published on 5 November 2026; this
announcement covers the exact signed Windows 1.7.2.1 candidate.

[Download the signed Windows MSI](https://github.com/townlight/townlight/releases/download/townlight-windows-v1.7.2.1/Townlight-Windows-x64-1.7.2.1.msi) ·
[Release, corresponding source and checksums](https://github.com/townlight/townlight/releases/tag/townlight-windows-v1.7.2.1) ·
[Read the manual](https://townlight.github.io/manuals/suite.html) ·
[Get help or report a problem](https://townlight.github.io/support.html)

## What you can evaluate

- **Records:** public-records request, review and export workflows.
- **Meetings:** meeting and agenda preparation, packets, motions and votes,
  minutes, archives and proceedings readback.
- **Code:** proposal and adoption work connected to Meetings.
- **Access:** saved accessibility reviews, local-model rewrite and Spanish
  translation drafts, retained provenance and Records exports for human review.
- **Notice:** content-bound review and approval, posting proof, verified archives
  and Records readback.
- **Zoning, Planning, Permitting and Inspections:** staff workspaces whose
  exercised paths and limits are described in the manuals and acceptance.
- **Station:** meeting media and the Meetings â†’ Station â†’ Records handoff.
  Standalone CivicCast remains separate.

Core supplies shared platform services. Current owned code and manuals are
AGPL-3.0-only; retained historical grants and third-party notices still apply.

## What was verified

Windows 1.7.2.1 changes installer metadata and displays Townlight as the installed product name. Its new outer MSI is Azure-signed by Scott Converse and independently verified. The signed application/runtime cabinet is unchanged from 1.7.1.1. Functional and fresh-install evidence is reused from 1.7.1.1; no full-suite or independent fresh-install rerun is claimed for this metadata revision. See the release for separately dated installed upgrade evidence. Upgrade from 1.7.0.1 is not established. Station requires separate setup.

The MSI, desktop executable and portable Access launcher are signed by **Scott Converse** with valid timestamps. This changes only installer metadata; the signed application/runtime bytes and their original source identity are unchanged. The 1.7.1.1 release remains intact. Read the [acceptance summary](https://github.com/townlight/townlight/releases/download/townlight-windows-v1.7.2.1/Metadata-Verification-Windows-1.7.2.1.md) for the exact new and reused evidence. AI output remains a draft requiring staff review.

## Install this beta on a fresh profile

1. Download `Townlight-Windows-x64-1.7.2.1.msi` and the
   [published checksums](https://github.com/townlight/townlight/releases/download/townlight-windows-v1.7.2.1/SHA256SUMS-Windows-1.7.2.1.txt) from this exact release.
2. In PowerShell, run `Get-FileHash .\Townlight-Windows-x64-1.7.2.1.msi -Algorithm SHA256`.
   The MSI SHA-256 must be
   `10f811c2e19db1e11ddfd0dc89e082b164c1b9c3942bba91c8b170225b91cc73`.
3. Check the installer signature with
   `Get-AuthenticodeSignature .\Townlight-Windows-x64-1.7.2.1.msi`.
   It must report `Valid`; confirm the signer matches the publisher named on the release page before installing.
4. Follow the [first-run guide](https://townlight.github.io/manuals/suite.html#first-run)
   and evaluate with synthetic data first.

**This MSI does not upgrade an existing legacy profile.** Preserve existing data
and backups; follow the manual's recovery guidance. Use the explicit download
above: GitHub's Latest download now resolves to this public beta.

## Portal and branding

The resident portal is a separately deployed beta with its own
[release](https://github.com/townlight/townlight/releases/tag/townlight-beta-1-resident-portal)
and [deployment guide](https://townlight.github.io/manuals/portal.html). Installing
this Windows MSI does not deploy a public website.

The website and documentation now use the selected
[Open Hall identity](https://townlight.github.io/brand/). Application and installer
icons will adopt it in the next software update. This separately versioned installer changes the installed name to Townlight and preserves the accepted signed application and runtime cabinet without rebuilding them. The previous Windows release and its evidence remain intact.

## Try it and tell us what happened

Start with the [Windows download](https://github.com/townlight/townlight/releases/download/townlight-windows-v1.7.2.1/Townlight-Windows-x64-1.7.2.1.msi) and
[Suite manual](https://townlight.github.io/manuals/suite.html). Report reproducible
problems through the [support page](https://townlight.github.io/support.html),
including version 1.7.2.1 and redacted evidence. Report vulnerabilities privately
through the [security policy](https://github.com/townlight/townlight/blob/main/SECURITY.md).
