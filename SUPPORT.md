# Townlight Windows beta support

## Windows 1.11.0.1 signed public beta

The signed beta adds Townlight Utilities, Townlight Library, and Townlight Elections for staff-led public workflows.

A hosted fresh exercise observed all three products plus backup and restore. A two-PC check confirmed Townlight Utilities and Townlight Library’s scheduled portal publication, test email, and a verified Records attachment after desktop exit. That check stopped before reopened-desktop checks and Townlight Elections. An upgrade from 1.10.0.1 reached retained data and Townlight Library, but Elections upgrade and final uninstall preservation remain unverified.

[Signed Windows installer](https://github.com/townlight/townlight/releases/download/townlight-windows-v1.11.0.1/Townlight-Windows-x64-1.11.0.1.msi) · [Release and corresponding source](https://github.com/townlight/townlight/releases/tag/townlight-windows-v1.11.0.1) · [Installed acceptance](https://github.com/townlight/townlight/releases/download/townlight-windows-v1.11.0.1/ACCEPTANCE-Windows-1.11.0.1.md) · [Department workflow guide](docs/windows-utilities-library-elections.md)

## Historical Windows 1.9.3.1 release

Windows 1.9.3.1 is an earlier signed Suite release. It includes Data reviewed Contract datasets, Budget adoption, Grants award/report and archive workflows.

[Release and downloads](https://github.com/townlight/townlight/releases/tag/townlight-windows-v1.9.3.1) · [Signed Windows MSI](https://github.com/townlight/townlight/releases/download/townlight-windows-v1.9.3.1/Townlight-Windows-x64-1.9.3.1.msi) · [Acceptance and limits](https://github.com/townlight/townlight/releases/download/townlight-windows-v1.9.3.1/ACCEPTANCE-Windows-1.9.3.1.md) · [Maintainer handoff](https://github.com/townlight/townlight/releases/download/townlight-windows-v1.9.3.1/HANDOFF-Windows-1.9.3.1.md)

## Windows 1.9.2.1 shared staff release

The previous signed MSI supports shared Meetings and Records use from Windows workstations, reviewed council packet revisions, and queued delivery of separately approved material to a separately deployed portal. Review the [release and downloads](https://github.com/townlight/townlight/releases/tag/townlight-windows-v1.9.2.1), [signed MSI](https://github.com/townlight/townlight/releases/download/townlight-windows-v1.9.2.1/Townlight-Windows-x64-1.9.2.1.msi), and [acceptance and limits](https://github.com/townlight/townlight/releases/download/townlight-windows-v1.9.2.1/ACCEPTANCE-Windows-1.9.2.1.md).

Acceptance used synthetic data and a test portal on the physical Windows host with a clean Windows Sandbox guest on the same PC. It does not establish two physical PCs, recovery on another computer or account, production portal or city network operation, direct MSI upgrade from an earlier version, new hardware or broadcast acceptance, or PDF/UA and full assistive-technology review.

For install and recovery issues, back up city data and settings before changing an existing profile. The 1.9.2.1 acceptance does not cover direct MSI upgrades from earlier versions. The Townlight Portal server is not installed by the MSI.

## Installation and recovery

**Fresh installation.** Run the signed Windows 1.9.2.1 MSI, then follow first-run setup with an empty database and a new Townlight profile. Follow the [first-run instructions](https://townlight.github.io/manuals/suite.html#first-run).

**Upgrading an existing installation.** Back up city data and settings before changing an existing profile. Windows 1.9.2.1 acceptance does not cover direct MSI upgrades from earlier versions. Follow the [backup, recovery and maintenance guidance](https://townlight.github.io/manuals/suite.html#backup-recovery-and-maintenance). Preserve existing data and backups. Do not rename or delete the compatibility profile directory `%LOCALAPPDATA%\CivicSuite` to work around a setup problem.

Verify the downloaded MSI against the [Windows 1.9.2.1 release checksums](https://github.com/townlight/townlight/releases/download/townlight-windows-v1.9.2.1/SHA256SUMS-Windows-1.9.2.1.txt) and check its Authenticode signature is `Valid`, with signer Scott Converse. Use the exact previous [release link](https://github.com/townlight/townlight/releases/tag/townlight-windows-v1.9.2.1); GitHub's Latest download resolves to this public beta. See the [acceptance summary](https://github.com/townlight/townlight/releases/download/townlight-windows-v1.9.2.1/ACCEPTANCE-Windows-1.9.2.1.md) for the installed checks and limits.

For setup problems, consult [troubleshooting](https://townlight.github.io/manuals/suite.html#troubleshooting) before filing an installer issue. Do not remove a database or existing profile as a troubleshooting shortcut. See the [Windows staff workflow guide](https://townlight.github.io/manuals/windows-staff-workflows.html) for roles and cross-module staff workflows.

### Earlier release context

Windows 1.9.1.1 added Open Hall branding, clerk workflow improvements, Records setup checks and Station 0.4.4. Its C920 camera and microphone result applies only to that release; it does not establish the 1.9.2.1 hardware limits stated above. The [1.9.1.1 release](https://github.com/townlight/townlight/releases/tag/townlight-windows-v1.9.1.1) and [acceptance summary](https://github.com/townlight/townlight/releases/download/townlight-windows-v1.9.1.1/ACCEPTANCE-Windows-1.9.1.1.md) retain their original identities.

Windows 1.8.1.1 added shared meeting imports for 31 source families, with 34 supported source/format pairs. Its installed checks used public captures and fixtures; they do not establish automatic discovery on every live portal or a complete retest of every module. See [all 31 sources and formats](https://townlight.github.io/manuals/meeting-imports.html) and the [1.8.1.1 acceptance summary](https://github.com/townlight/townlight/releases/download/townlight-windows-v1.8.1.1/ACCEPTANCE-Windows-1.8.1.1.md).

## Where to report a problem

| Area | Issue tracker |
| --- | --- |
| Installer, first run, desktop shell, documentation or cross-product workflow | [Townlight Suite](https://github.com/townlight/townlight/issues) |
| Shared identity, permissions, audit or platform services | [Core](https://github.com/townlight/core/issues) |
| Public records | [Records](https://github.com/townlight/sunshine/issues) |
| Meetings, agendas, votes or minutes | [Meetings](https://github.com/townlight/meetings/issues) |
| Municipal code, proposals or adoption | [Code](https://github.com/townlight/ordinances/issues) |
| Accessibility reviews, drafts or exports | [Access](https://github.com/townlight/access/issues) |
| Notice review, approval, proof or archive | [Notice](https://github.com/townlight/notice/issues) |
| Zoning | [Zoning](https://github.com/townlight/zone/issues) |
| Planning | [Planning](https://github.com/townlight/plan/issues) |
| Permitting | [Permitting](https://github.com/townlight/permit/issues) |
| Inspections | [Inspections](https://github.com/townlight/inspect/issues) |
| Station capture or media handoff | [Station](https://github.com/townlight/station/issues) |

If you cannot identify the owning product, start with the Suite issue tracker.
For questions and evaluation feedback, use
[Townlight Discussions](https://github.com/townlight/townlight/discussions).

## What to include

- Installed version (**1.9.2.1**) and Windows version.
- The selected products/profile and whether this was a fresh installation.
- Steps to reproduce, what you expected and what happened.
- Redacted error messages, logs or screenshots, using synthetic data where possible.

Do not attach resident information, credentials, tokens, database copies or
unredacted backups to public issues. Do not post security vulnerabilities in
public issues: follow the [security policy](https://github.com/townlight/townlight/blob/main/SECURITY.md)
and report privately to the affected repository.

## Separate deployments and evidence

The [resident portal](https://townlight.github.io/manuals/portal.html) requires
separate deployment. The Windows installer does not provision a public website.
Standalone CivicCast remains a separate product. The current Windows acceptance
uses synthetic data and does not establish a live city deployment or physical
broadcast acceptance. Follow each product guide for its supported workflow.
