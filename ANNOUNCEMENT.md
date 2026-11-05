# Townlight Windows public beta 1.7.1.1 is available

Municipal software cities can actually own.

Townlight's signed Windows x64 public beta is available now. It brings municipal
work into connected local workspaces, with a record of the sources, staff review
and decisions behind it. The installer was published on 5 November 2026; this
announcement covers the exact signed Windows 1.7.1.1 candidate.

[Download the signed Windows MSI](https://github.com/townlight/townlight/releases/download/townlight-v1.7.1-beta.1/Townlight-Windows-x64-1.7.1.1.msi) Â·
[Release, corresponding source and checksums](https://github.com/townlight/townlight/releases/tag/townlight-v1.7.1-beta.1) Â·
[Read the manual](https://townlight.github.io/manuals/suite.html) Â·
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
The exact MSI is signed by **Scott Converse** with a valid Microsoft timestamp. Fresh Windows Sandbox installation passed **34 control checks and three independent provenance checks**, including supported profile removal/reinstallation and retained Records data. The revision fixes nine confirmed installed defects from the original beta audit.

Other workflow evidence is reused for unchanged behavior, including Meetings/Code, Records links, separately provisioned finite Station recording, backup/restore and earlier real local-model drafts. Read the [acceptance summary](https://github.com/townlight/townlight/releases/download/townlight-v1.7.1-beta.1/ACCEPTANCE-Windows-1.7.1.1.md) for the exact evidence boundary and remaining unimplemented or unexercised paths. This is not a claim that every workflow was rerun on 1.7.1.1. AI output remains a draft requiring staff review.

## Install this beta on a fresh profile

1. Download `Townlight-Windows-x64-1.7.1.1.msi` and the
   [published checksums](https://github.com/townlight/townlight/releases/download/townlight-v1.7.1-beta.1/SHA256SUMS-Windows-1.7.1.1.txt) from this exact release.
2. In PowerShell, run `Get-FileHash .\Townlight-Windows-x64-1.7.1.1.msi -Algorithm SHA256`.
   The MSI SHA-256 must be
   `7553bb3ca457360a99878953f86d54211d77a250129a6744d9d637a2fb4be9e3`.
3. Check the installer signature with
   `Get-AuthenticodeSignature .\Townlight-Windows-x64-1.7.1.1.msi`.
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
icons will adopt it in the next software update. This release promotes the already signed and tested candidate without rebuilding it. The previous Windows release and its evidence remain intact.

## Try it and tell us what happened

Start with the [Windows download](https://github.com/townlight/townlight/releases/download/townlight-v1.7.1-beta.1/Townlight-Windows-x64-1.7.1.1.msi) and
[Suite manual](https://townlight.github.io/manuals/suite.html). Report reproducible
problems through the [support page](https://townlight.github.io/support.html),
including version 1.7.1.1 and redacted evidence. Report vulnerabilities privately
through the [security policy](https://github.com/townlight/townlight/blob/main/SECURITY.md).
