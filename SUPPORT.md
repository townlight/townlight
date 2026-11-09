# Townlight Windows beta support

These instructions cover the signed **Windows x64 public beta 1.8.0.1**.

[Download the current Windows MSI](https://github.com/townlight/townlight/releases/download/townlight-windows-v1.8.0.1/Townlight-Windows-x64-1.8.0.1.msi) ·
[Release and checksums](https://github.com/townlight/townlight/releases/tag/townlight-windows-v1.8.0.1) ·
[Suite manual](https://townlight.github.io/manuals/suite.html) ·
[Public beta announcement](https://townlight.github.io/announcement.html)

## Installation and recovery

Use a fresh installation/profile. This MSI does not upgrade an existing legacy
profile. Follow the [first-run instructions](https://townlight.github.io/manuals/suite.html#first-run)
and [backup, recovery and maintenance guidance](https://townlight.github.io/manuals/suite.html#backup-recovery-and-maintenance).
Preserve existing data and backups. Do not rename or delete the compatibility
profile directory `%LOCALAPPDATA%\CivicSuite` to work around a setup problem.

Verify the downloaded MSI against the [release checksums](https://github.com/townlight/townlight/releases/download/townlight-windows-v1.8.0.1/SHA256SUMS-Windows-1.8.0.1.txt) and check
its Authenticode signature is `Valid`, with signer Scott Converse. Use the exact
release link here; GitHub's Latest download now resolves to this public beta. The [acceptance summary](https://github.com/townlight/townlight/releases/download/townlight-windows-v1.8.0.1/ACCEPTANCE-Windows-1.8.0.1.md) describes the installed checks
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

- Installed version (**1.8.0.1**) and Windows version.
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
