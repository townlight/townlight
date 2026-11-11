# Townlight Windows beta support

## Shared meeting imports · Windows 1.8.1.1

Windows 1.8.1.1 adds shared meeting imports for 31 source families, with 34 supported source/format pairs. Installed Windows Sandbox checks exercised preview, save and durable readback using public captures and fixtures, plus the documented Townlight handoffs. These checks do not establish automatic discovery on every live portal or a complete retest of every module.

[All 31 sources, formats and handoffs](https://townlight.github.io/manuals/meeting-imports.html) · [Installed acceptance](https://github.com/townlight/townlight/releases/download/townlight-windows-v1.8.1.1/ACCEPTANCE-Windows-1.8.1.1.md).

Windows 1.8.1.1 has fresh-install acceptance. An in-place upgrade to 1.8.1.1 was not exercised. The previous Windows 1.8.0.1 release tested upgrade from 1.7.2.1; that result applies to 1.8.0.1. Before an existing-city evaluation, back up city data and settings, close Townlight, keep the existing %LOCALAPPDATA%\CivicSuite profile, and use the same Windows account. Keep the prior installer and a restore path. Station continues to use its separately configured service.

The accepted MSI contains Townlight Runtime 0.3.1 and Meetings 1.0.6 distributions. Its health version strings still report Runtime 0.3.0 and Meetings 1.0.5. Default-branch source corrects those display strings; the signed MSI and its exact build source remain unchanged.


These instructions cover the signed **Windows x64 public beta 1.8.1.1**.

[Download the current Windows MSI](https://github.com/townlight/townlight/releases/download/townlight-windows-v1.8.1.1/Townlight-Windows-x64-1.8.1.1.msi) ·
[Release and checksums](https://github.com/townlight/townlight/releases/tag/townlight-windows-v1.8.1.1) ·
[Suite manual](https://townlight.github.io/manuals/suite.html) ·
[Public beta announcement](https://townlight.github.io/announcement.html)

## Installation and recovery

**Fresh installation.** For a fresh installation, run the signed Windows 1.8.1.1 MSI, then follow first-run setup with an empty database and a new Townlight profile. Follow the [first-run instructions](https://townlight.github.io/manuals/suite.html#first-run).

Windows 1.8.1.1 has fresh-install acceptance. An in-place upgrade to 1.8.1.1 was not exercised. The previous Windows 1.8.0.1 release tested upgrade from 1.7.2.1; that result applies to 1.8.0.1. Before an existing-city evaluation, back up city data and settings, close Townlight, keep the existing %LOCALAPPDATA%\CivicSuite profile, and use the same Windows account. Keep the prior installer and a restore path. Station continues to use its separately configured service.

Follow the [backup, recovery and maintenance guidance](https://townlight.github.io/manuals/suite.html#backup-recovery-and-maintenance).
Preserve existing data and backups. Do not rename or delete the compatibility
profile directory `%LOCALAPPDATA%\CivicSuite` to work around a setup problem.

Verify the downloaded MSI against the [release checksums](https://github.com/townlight/townlight/releases/download/townlight-windows-v1.8.1.1/SHA256SUMS-Windows-1.8.1.1.txt) and check
its Authenticode signature is `Valid`, with signer Scott Converse. Use the exact
release link here; GitHub's Latest download now resolves to this public beta. The [acceptance summary](https://github.com/townlight/townlight/releases/download/townlight-windows-v1.8.1.1/ACCEPTANCE-Windows-1.8.1.1.md) describes the installed checks
and their limits. Local-model acceptance used a 16 GiB Sandbox; an 8 GiB run
timed out without saving a draft.

For setup problems, consult [troubleshooting](https://townlight.github.io/manuals/suite.html#troubleshooting)
before filing an installer issue. Do not remove a database or existing profile
as a troubleshooting shortcut.

See the [Windows staff workflow guide](https://townlight.github.io/manuals/windows-staff-workflows.html) for roles and cross-module staff workflows.

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

- Installed version (**1.8.1.1**) and Windows version.
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
