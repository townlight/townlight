# Townlight Windows public beta 1.8.0.1 is available

Municipal software cities can actually own.

Townlight's signed Windows x64 public beta is available now. It brings municipal
work into connected local workspaces, with a record of the sources, staff review
and decisions behind it. The installer was published on 5 November 2026; this
announcement covers the exact signed Windows 1.8.0.1 candidate.

[Download the signed Windows MSI](https://github.com/townlight/townlight/releases/download/townlight-windows-v1.8.0.1/Townlight-Windows-x64-1.8.0.1.msi) ·
[Release, corresponding source and checksums](https://github.com/townlight/townlight/releases/tag/townlight-windows-v1.8.0.1) ·
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

Windows 1.8.0.1 adds Boards & Commissions, Contracts, and Procurement to the full Windows profile. The signed Windows Sandbox checks cover a fresh installation, the three staff workflows, role boundaries, record persistence, and upgrade from 1.7.2.1 with retained city data and settings. Station continues to use its separately configured local service.

The MSI and desktop executable have valid timestamped Authenticode signatures. Read the [acceptance summary](https://github.com/townlight/townlight/releases/download/townlight-windows-v1.8.0.1/ACCEPTANCE-Windows-1.8.0.1.md) and [Windows staff workflow guide](https://townlight.github.io/manuals/windows-staff-workflows.html).

## Install or upgrade this beta

1. Download `Townlight-Windows-x64-1.8.0.1.msi` and the
   [published checksums](https://github.com/townlight/townlight/releases/download/townlight-windows-v1.8.0.1/SHA256SUMS-Windows-1.8.0.1.txt) from this exact release.
2. In PowerShell, run `Get-FileHash .\Townlight-Windows-x64-1.8.0.1.msi -Algorithm SHA256`.
   The MSI SHA-256 must be
   `3085817377cf813debe558d280278e2b9d11311388aa41eb184c9ba80cfbb35a`.
3. Check the installer signature with
   `Get-AuthenticodeSignature .\Townlight-Windows-x64-1.8.0.1.msi`.
   It must report `Valid`; confirm the signer matches the publisher named on the release page before installing.

**Fresh installation.** For a fresh installation, run the signed Windows 1.8.0.1 MSI, then follow first-run setup with an empty database and a new Townlight profile. Follow the [first-run guide](https://townlight.github.io/manuals/suite.html#first-run) and evaluate with synthetic data first.

**Upgrade from 1.7.2.1.** For the tested upgrade from 1.7.2.1, back up city data and settings, close Townlight, run the signed Windows 1.8.0.1 MSI, and reopen Townlight under the same Windows account with its existing profile. Keep the existing `%LOCALAPPDATA%\CivicSuite` directory. Upgrade paths from versions older than 1.7.2.1 are unverified. Station uses its separately configured service.

## Portal and branding

The resident portal is a separately deployed beta with its own
[release](https://github.com/townlight/townlight/releases/tag/townlight-beta-1-resident-portal)
and [deployment guide](https://townlight.github.io/manuals/portal.html). Installing
this Windows MSI does not deploy a public website.

The website and documentation now use the selected
[Open Hall identity](https://townlight.github.io/brand/). Application and installer
icons will adopt it in the next software update. This release includes a rebuilt Windows desktop and updated local runtime. The previous Windows release and its evidence remain intact.

## Try it and tell us what happened

Start with the [Windows download](https://github.com/townlight/townlight/releases/download/townlight-windows-v1.8.0.1/Townlight-Windows-x64-1.8.0.1.msi) and
[Suite manual](https://townlight.github.io/manuals/suite.html). Report reproducible
problems through the [support page](https://townlight.github.io/support.html),
including version 1.8.0.1 and redacted evidence. Report vulnerabilities privately
through the [security policy](https://github.com/townlight/townlight/blob/main/SECURITY.md).
