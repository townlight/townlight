# Townlight Windows public beta 1.7.0.1 is available

Municipal software cities can actually own.

Townlight's signed Windows x64 public beta is available now. It brings municipal
work into connected local workspaces, with a record of the sources, staff review
and decisions behind it. The installer was published on 3 November 2026; this
announcement was updated on 4 November 2026.

[Download the signed Windows MSI](https://github.com/townlight/townlight/releases/download/townlight-beta-1-windows-1.7.0.1/Townlight-Candidate-Windows-x64.msi) Â·
[Release, corresponding source and checksums](https://github.com/townlight/townlight/releases/tag/townlight-beta-1-windows-1.7.0.1) Â·
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

The exact signed MSI passed fresh Windows
Sandbox acceptance using synthetic data. Installed checks covered the Meetings
and Code workflows, Access review/export and real local-model drafts, Notice
review/proof/archive, the recorded-file Station/Records handoff, selected other
product paths, backup/restore, legacy-profile protection and uninstall.

Read the [acceptance summary and limits](https://github.com/townlight/townlight/releases/download/townlight-beta-1-windows-1.7.0.1/ACCEPTANCE-Windows-1.7.0.1.md) for the precise coverage.
Access local-model draft acceptance used a 16 GiB Sandbox. This evidence does
not certify every screen, city configuration, physical broadcast system or
external service. AI output remains a draft requiring staff review.

## Install this beta on a fresh profile

1. Download `Townlight-Candidate-Windows-x64.msi` and the
   [published checksums](https://github.com/townlight/townlight/releases/download/townlight-beta-1-windows-1.7.0.1/SHA256SUMS-Windows-1.7.0.1.txt) from this exact release.
2. In PowerShell, run `Get-FileHash .\Townlight-Candidate-Windows-x64.msi -Algorithm SHA256`.
   The MSI SHA-256 must be
   `8cebaea95fa62f582326a1a0c1af3cb54233c40dbb41d88324170eb1b3f25ade`.
3. Check the installer signature with
   `Get-AuthenticodeSignature .\Townlight-Candidate-Windows-x64.msi`.
   It must report `Valid`; confirm the signer matches the publisher named on the release page before installing.
4. Follow the [first-run guide](https://townlight.github.io/manuals/suite.html#first-run)
   and evaluate with synthetic data first.

**This MSI does not upgrade an existing legacy profile.** Preserve existing data
and backups; follow the manual's recovery guidance. Use the explicit download
above: GitHub's generic Latest shortcut currently points to an older release.

## Portal and branding

The resident portal is a separately deployed beta with its own
[release](https://github.com/townlight/townlight/releases/tag/townlight-beta-1-resident-portal)
and [deployment guide](https://townlight.github.io/manuals/portal.html). Installing
this Windows MSI does not deploy a public website.

The website and documentation now use the selected
[Open Hall identity](https://townlight.github.io/brand/). Application and installer
icons will adopt it in the next software update. The existing signed MSI,
corresponding source, checksums and original acceptance evidence are unchanged.

## Try it and tell us what happened

Start with the [Windows download](https://github.com/townlight/townlight/releases/download/townlight-beta-1-windows-1.7.0.1/Townlight-Candidate-Windows-x64.msi) and
[Suite manual](https://townlight.github.io/manuals/suite.html). Report reproducible
problems through the [support page](https://townlight.github.io/support.html),
including version 1.7.0.1 and redacted evidence. Report vulnerabilities privately
through the [security policy](https://github.com/townlight/townlight/blob/main/SECURITY.md).
