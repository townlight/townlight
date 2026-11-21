# Townlight Windows public beta 1.9.0.1 is available

## Windows 1.9.0.1 Station recorder release

Windows 1.9.0.1 integrates Station setup, camera and microphone selection, renewable operator sessions and verified large-recording transfers to Records.

Windows 1.9.0.1 has signed fresh-install acceptance, including Station recording, Records handoff and recovery. Set up Station during Townlight first run. Read the acceptance summary before upgrading.

[Release and downloads](https://github.com/townlight/townlight/releases/tag/townlight-windows-v1.9.0.1) · [Acceptance and limits](https://github.com/townlight/townlight/releases/download/townlight-windows-v1.9.0.1/ACCEPTANCE-Windows-1.9.0.1.md).

## Shared meeting imports · Windows 1.8.1.1

Windows 1.8.1.1 adds shared meeting imports for 31 source families, with 34 supported source/format pairs. Installed Windows Sandbox checks exercised preview, save and durable readback using public captures and fixtures, plus the documented Townlight handoffs. These checks do not establish automatic discovery on every live portal or a complete retest of every module.

[All 31 sources, formats and handoffs](https://townlight.github.io/manuals/meeting-imports.html) · [Installed acceptance](https://github.com/townlight/townlight/releases/download/townlight-windows-v1.8.1.1/ACCEPTANCE-Windows-1.8.1.1.md).

Windows 1.9.0.1 has signed fresh-install acceptance, including Station recording, Records handoff and recovery. Set up Station during Townlight first run. Read the acceptance summary before upgrading.

Windows 1.9.0.1 contains Station 0.4.0, Records 1.8.0.dev4, Townlight Runtime 0.3.2 and Meetings 1.0.6. Its current component sources and installed evidence are identified in the maintenance acceptance summary.


Municipal software cities can actually own.

Townlight's signed Windows x64 public beta is available now. It brings municipal
work into connected local workspaces, with a record of the sources, staff review
and decisions behind it. Download the installer from the release below; this
announcement covers the exact signed Windows 1.9.0.1 Station recorder release.

[Download the signed Windows MSI](https://github.com/townlight/townlight/releases/download/townlight-windows-v1.9.0.1/Townlight-Windows-x64-1.9.0.1.msi) ·
[Release, corresponding source and checksums](https://github.com/townlight/townlight/releases/tag/townlight-windows-v1.8.1.1) ·
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

Windows 1.8.1.1 adds shared meeting imports for 31 source families, with 34 supported source/format pairs. Installed Windows Sandbox checks exercised preview, save and durable readback using public captures and fixtures, plus the documented Townlight handoffs. These checks do not establish automatic discovery on every live portal or a complete retest of every module.

The MSI and desktop executable have valid timestamped Authenticode signatures. Read the [acceptance summary](https://github.com/townlight/townlight/releases/download/townlight-windows-v1.8.1.1/ACCEPTANCE-Windows-1.8.1.1.md) and [Windows staff workflow guide](https://townlight.github.io/manuals/windows-staff-workflows.html).

## Install or upgrade this beta

1. Download `Townlight-Windows-x64-1.9.0.1.msi` and the
   [published checksums](https://github.com/townlight/townlight/releases/download/townlight-windows-v1.9.0.1/SHA256SUMS-Windows-1.9.0.1.txt) from this exact release.
2. In PowerShell, run `Get-FileHash .\Townlight-Windows-x64-1.9.0.1.msi -Algorithm SHA256`.
   The MSI SHA-256 must be
   `9e9363ec5119a2ee4c0d69b4dd40b21a535571a11eb3750d57b8a24d4472a5da`.
3. Check the installer signature with
   `Get-AuthenticodeSignature .\Townlight-Windows-x64-1.9.0.1.msi`.
   It must report `Valid`; confirm the signer matches the publisher named on the release page before installing.

**Fresh installation.** For a fresh installation, run the signed Windows 1.9.0.1 MSI, then follow first-run setup with an empty database and a new Townlight profile. Follow the [first-run guide](https://townlight.github.io/manuals/suite.html#first-run) and evaluate with synthetic data first.

Windows 1.9.0.1 has signed fresh-install acceptance, including Station recording, Records handoff and recovery. Set up Station during Townlight first run. Read the acceptance summary before upgrading.

## Portal and branding

The resident portal is a separately deployed beta with its own
[release](https://github.com/townlight/townlight/releases/tag/townlight-beta-1-resident-portal)
and [deployment guide](https://townlight.github.io/manuals/portal.html). Installing
this Windows MSI does not deploy a public website.

The website and documentation now use the selected
[Open Hall identity](https://townlight.github.io/brand/). Application and installer
icons will adopt it in the next software update. This release includes a rebuilt Windows desktop and updated local runtime. The previous Windows release and its evidence remain intact.

## Try it and tell us what happened

Start with the [Windows download](https://github.com/townlight/townlight/releases/download/townlight-windows-v1.9.0.1/Townlight-Windows-x64-1.9.0.1.msi) and
[Suite manual](https://townlight.github.io/manuals/suite.html). Report reproducible
problems through the [support page](https://townlight.github.io/support.html),
including version 1.9.0.1 and redacted evidence. Report vulnerabilities privately
through the [security policy](https://github.com/townlight/townlight/blob/main/SECURITY.md).
