# Townlight Windows beta status

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
- **Candidate — installed acceptance pending:** Prepared software; completion and publication require the recorded exact-candidate acceptance.
- **Published beta capability:** Available in a published bounded Townlight desktop beta or recorded standalone release; select the documented profile and read its limits.

## Module Status (14 kept modules)

| Module | Version | Status | Released | Note |
|---|---|---|---|---|
| Townlight Core | 1.3.0.dev2 | Shared platform | 2026-11-09 | Available in the Windows 1.8.1.1 beta. See release acceptance and scope. |
| Townlight Records | 1.8.0.dev2 | Published beta capability | 2026-11-09 | Available in the Windows 1.8.1.1 beta. See release acceptance and scope. |
| Townlight Meetings | 1.0.5 | Published beta capability | 2026-11-09 | Available in the Windows 1.8.1.1 beta. See release acceptance and scope. |
| Townlight Code | 1.0.9 | Published beta capability | 2026-11-09 | Available in the Windows 1.8.1.1 beta. See release acceptance and scope. |
| Townlight Access | 0.5.0 | Published beta capability | 2026-11-09 | Available in the Windows 1.8.1.1 beta. See release acceptance and scope. |
| Townlight Zoning | 0.2.3 | Published beta capability | 2026-11-09 | Available in the Windows 1.8.1.1 beta. See release acceptance and scope. |
| Townlight Planning | 0.4.0.dev2 | Published beta capability | 2026-11-09 | Available in the Windows 1.8.1.1 beta. See release acceptance and scope. |
| Townlight Permitting | 0.3.0+dev.2 | Published beta capability | 2026-11-09 | Available in the Windows 1.8.1.1 beta. See release acceptance and scope. |
| Townlight Inspections | 0.3.0+dev.2 | Published beta capability | 2026-11-09 | Available in the Windows 1.8.1.1 beta. See release acceptance and scope. |
| Townlight Notice | 0.3.0 | Published beta capability | 2026-11-09 | Available in the Windows 1.8.1.1 beta. See release acceptance and scope. |
| Townlight Station | 0.3.0 | Published beta capability | 2026-11-09 | Available in the Windows 1.8.1.1 beta. See release acceptance and scope. |
| Townlight Boards & Commissions | 0.2.0 | Published beta capability | 2026-11-09 | Available in the Windows 1.8.1.1 beta. See release acceptance and scope. |
| Townlight Contracts | 0.2.0 | Published beta capability | 2026-11-09 | Available in the Windows 1.8.1.1 beta. See release acceptance and scope. |
| Townlight Procurement | 0.3.0 | Published beta capability | 2026-11-09 | Available in the Windows 1.8.1.1 beta. See release acceptance and scope. |

<!-- END GENERATED MODULE STATUS -->

## Resident portal

The [published portal prerelease](https://github.com/townlight/townlight/releases/tag/townlight-beta-1-resident-portal) is deployed separately. The [portal guide](docs/beta-1/manuals/portal.html) and [synthetic acceptance](docs/portal/acceptance.md) describe the Meetings, Station and Records publication workflow and its limits.
