# Townlight Windows beta status

## Windows 1.11.0.1 signed public beta

Townlight Windows 1.11.0.1 is a signed public beta, desktop build 1.11.0-1, with Townlight Utilities, Townlight Library, and Townlight Elections for staff-led public workflows.

A hosted fresh exercise observed all three products plus backup and restore. A two-PC check confirmed Townlight Utilities and Townlight Library’s scheduled portal publication, test email, and a verified Records attachment after desktop exit. That check stopped before reopened-desktop checks and Townlight Elections. An upgrade from 1.10.0.1 reached retained data and Townlight Library, but Elections upgrade and final uninstall preservation remain unverified.

[Signed Windows installer](https://github.com/townlight/townlight/releases/download/townlight-windows-v1.11.0.1/Townlight-Windows-x64-1.11.0.1.msi) · [Release and checksums](https://github.com/townlight/townlight/releases/tag/townlight-windows-v1.11.0.1) · [Installed acceptance](https://github.com/townlight/townlight/releases/download/townlight-windows-v1.11.0.1/ACCEPTANCE-Windows-1.11.0.1.md) · [Department workflow guide](docs/windows-utilities-library-elections.md)

## Windows 1.10.0.1 · Previous 311, Communications, and Parks release

See its [operator guide](docs/windows-311-communications-parks.md) and [release acceptance](https://github.com/townlight/townlight/releases/tag/townlight-windows-v1.10.0.1).

## Windows 1.9.2.1 · Shared staff and approved portal publication

The previous signed MSI adds shared Windows host/workstation workflows for Meetings and Records, reviewed council packet revisions, and queued delivery of separately approved packets and recording copies to the separately deployed portal. [Release and downloads](https://github.com/townlight/townlight/releases/tag/townlight-windows-v1.9.2.1) · [Acceptance and limits](https://github.com/townlight/townlight/releases/download/townlight-windows-v1.9.2.1/ACCEPTANCE-Windows-1.9.2.1.md).

Acceptance used synthetic data and a test portal on the physical Windows host with a clean Windows Sandbox guest on the same PC. It does not establish two physical PCs, recovery on another computer or account, production portal or city network operation, direct MSI upgrade from an earlier version, new hardware or broadcast acceptance, or PDF/UA and full assistive-technology review.

## Windows 1.9.1.1 · Historical Station preview release

The prior release included Open Hall branding, Records setup checks, Station 0.4.4 and its tested ten-second camera and microphone preview. Its C920 test and other release evidence apply to Windows 1.9.1.1 only. [Historical release](https://github.com/townlight/townlight/releases/tag/townlight-windows-v1.9.1.1) · [Historical acceptance](https://github.com/townlight/townlight/releases/download/townlight-windows-v1.9.1.1/ACCEPTANCE-Windows-1.9.1.1.md).

## Shared meeting imports · Windows 1.8.1.1

Windows 1.8.1.1 adds shared meeting imports for 31 source families, with 34 supported source/format pairs. Installed Windows Sandbox checks exercised preview, save and durable readback using public captures and fixtures, plus the documented Townlight handoffs. These checks do not establish automatic discovery on every live portal or a complete retest of every module.

[All 31 sources, formats and handoffs](https://townlight.github.io/manuals/meeting-imports.html) · [Installed acceptance](https://github.com/townlight/townlight/releases/download/townlight-windows-v1.8.1.1/ACCEPTANCE-Windows-1.8.1.1.md).

Windows 1.8.1.1 has fresh-install acceptance. An in-place upgrade to 1.8.1.1 was not exercised. The previous Windows 1.8.0.1 release tested upgrade from 1.7.2.1; that result applies to 1.8.0.1. Before an existing-city evaluation, back up city data and settings, close Townlight, keep the existing %LOCALAPPDATA%\CivicSuite profile, and use the same Windows account. Keep the prior installer and a restore path. Station continues to use its separately configured service.

The accepted MSI contains Townlight Runtime 0.3.1 and Meetings 1.0.6 distributions. Its health version strings still report Runtime 0.3.0 and Meetings 1.0.5. Default-branch source corrects those display strings; the signed MSI and its exact build source remain unchanged.


Windows 1.8.1.1 adds shared meeting imports for 31 source families, with 34 supported source/format pairs. Installed Windows Sandbox checks exercised preview, save and durable readback using public captures and fixtures, plus the documented Townlight handoffs. These checks do not establish automatic discovery on every live portal or a complete retest of every module.

The Windows desktop uses Tauri and Microsoft Edge WebView2 with packaged local services.

<!-- BEGIN GENERATED MODULE STATUS (scripts/docs/render_public_status.py) -->

## Status Legend

Status labels below are the suite's shared status set, generated from
[`installer/modules.public-status.json`](installer/modules.public-status.json) — the same source the [module explorer](docs/module-explorer.html) renders.

- **Shared platform:** The shared platform every module depends on; always installed.
- **Candidate â€” installed acceptance pending:** Prepared software; completion and publication require the recorded exact-candidate acceptance.
- **Published beta capability:** Available in a published bounded Townlight desktop beta or recorded standalone release; select the documented profile and read its limits.

## Module Status (23 kept modules)

| Module | Version | Status | Released | Note |
|---|---|---|---|---|
| Townlight Core | 1.3.0.dev2 | Shared platform | 2026-11-09 | Included in Windows 1.9.2.1. See the signed release for current installed checks and limits; this does not create a standalone release of the module. |
| Townlight Records | 1.8.0.dev5 | Published beta capability | 2026-11-27 | Included in Townlight for Windows 1.10.0.1. See the release for installed acceptance. |
| Townlight Meetings | 1.0.6 | Published beta capability | 2026-11-09 | Included in Windows 1.9.2.1. See the signed release for current installed checks and limits; this does not create a standalone release of the module. |
| Townlight Code | 1.0.9 | Published beta capability | 2026-11-09 | Included in Windows 1.9.2.1. See the signed release for current installed checks and limits; this does not create a standalone release of the module. |
| Townlight Access | 0.5.0 | Published beta capability | 2026-11-09 | Included in Windows 1.9.2.1. See the signed release for current installed checks and limits; this does not create a standalone release of the module. |
| Townlight Zoning | 0.2.3 | Published beta capability | 2026-11-09 | Included in Windows 1.9.2.1. See the signed release for current installed checks and limits; this does not create a standalone release of the module. |
| Townlight Planning | 0.4.0.dev2 | Published beta capability | 2026-11-09 | Included in Windows 1.9.2.1. See the signed release for current installed checks and limits; this does not create a standalone release of the module. |
| Townlight Permitting | 0.3.0+dev.2 | Published beta capability | 2026-11-09 | Included in Windows 1.9.2.1. See the signed release for current installed checks and limits; this does not create a standalone release of the module. |
| Townlight Inspections | 0.3.0+dev.2 | Published beta capability | 2026-11-09 | Included in Windows 1.9.2.1. See the signed release for current installed checks and limits; this does not create a standalone release of the module. |
| Townlight Notice | 0.3.0 | Published beta capability | 2026-11-09 | Included in Windows 1.9.2.1. See the signed release for current installed checks and limits; this does not create a standalone release of the module. |
| Townlight Station | 0.4.4 | Published beta capability | 2026-11-09 | Included in Windows 1.9.2.1. See the signed release for current installed checks and limits; this does not create a standalone release of the module. |
| Townlight Boards & Commissions | 0.2.1 | Published beta capability | 2026-11-09 | Included in Windows 1.9.2.1. See the signed release for current installed checks and limits; this does not create a standalone release of the module. |
| Townlight Contracts | 0.2.1 | Published beta capability | 2026-11-09 | Included in Windows 1.9.2.1. See the signed release for current installed checks and limits; this does not create a standalone release of the module. |
| Townlight Procurement | 0.3.1 | Published beta capability | 2026-11-09 | Included in Windows 1.9.2.1. See the signed release for current installed checks and limits; this does not create a standalone release of the module. |
| Townlight Data | 0.2.0 | Published beta capability | 2026-11-23 | Included in Windows beta with acceptance scope; no standalone artifact. |
| Townlight Budget | 0.2.0 | Published beta capability | 2026-11-23 | Included in Windows beta with acceptance scope; no standalone artifact. |
| Townlight Grants | 0.3.0 | Published beta capability | 2026-11-23 | Included in Windows beta with acceptance scope; no standalone artifact. |
| Townlight 311 | 0.2.0 | Published beta capability | 2026-11-27 | Included in Townlight for Windows 1.10.0.1. See the release for installed acceptance. |
| Townlight Communications | 0.2.0 | Published beta capability | 2026-11-27 | Included in Townlight for Windows 1.10.0.1. See the release for installed acceptance. |
| Townlight Parks | 0.2.0 | Published beta capability | 2026-11-27 | Included in Townlight for Windows 1.10.0.1. See the release for installed acceptance. |
| Townlight Utilities | — | Published beta capability | 2026-11-28 | Version 0.2.0 in the Windows 1.11.0.1 beta. Hosted and two-PC checks covered cited 311 replies and replay. |
| Townlight Library | — | Published beta capability | 2026-11-28 | Version 0.2.0 in the Windows 1.11.0.1 beta. Hosted workflows and two-PC post-exit portal, mail, and archive verified. |
| Townlight Elections | — | Published beta capability | 2026-11-28 | Version 0.2.0 in the Windows 1.11.0.1 beta. Hosted fresh publication and correction verified. |

<!-- END GENERATED MODULE STATUS -->

## Resident portal

The [published portal prerelease](https://github.com/townlight/townlight/releases/tag/townlight-beta-1-resident-portal) is deployed separately. The [portal guide](docs/beta-1/manuals/portal.html) and [synthetic acceptance](docs/portal/acceptance.md) describe the Meetings, Station and Records publication workflow and its limits.
