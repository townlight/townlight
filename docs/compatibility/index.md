# Townlight current component compatibility

These versions are bundled with [Windows x64 beta 1.8.0.1](https://github.com/townlight/townlight/releases/tag/townlight-windows-v1.8.0.1). The [installed acceptance](https://github.com/townlight/townlight/releases/download/townlight-windows-v1.8.0.1/ACCEPTANCE-Windows-1.8.0.1.md) identifies the tested MSI and workflows. The [source pins](https://townlight.github.io/reference/windows-1.8.0.1-source-pins.json) and [installed package metadata](https://townlight.github.io/reference/component-metadata.json) record the matching build inputs and dependency requirements.

| Distribution | Repository | Bundled version |
| --- | --- | --- |
| `townlight-core` | [townlight/core](https://github.com/townlight/core) | 1.3.0.dev2 |
| `townlight-records` | [townlight/sunshine](https://github.com/townlight/sunshine) | 1.8.0.dev2 |
| `townlight-meetings` | [townlight/meetings](https://github.com/townlight/meetings) | 1.0.5 |
| `townlight-code` | [townlight/ordinances](https://github.com/townlight/ordinances) | 1.0.9 |
| `townlight-zoning` | [townlight/zone](https://github.com/townlight/zone) | 0.2.3 |
| `townlight-planning` | [townlight/plan](https://github.com/townlight/plan) | 0.4.0.dev2 |
| `townlight-permitting` | [townlight/permit](https://github.com/townlight/permit) | 0.3.0+dev.2 |
| `townlight-inspections` | [townlight/inspect](https://github.com/townlight/inspect) | 0.3.0+dev.2 |
| `townlight-access` | [townlight/access](https://github.com/townlight/access) | 0.5.0 |
| `townlight-notice` | [townlight/notice](https://github.com/townlight/notice) | 0.3.0 |
| `townlight-station` | [townlight/station](https://github.com/townlight/station) | 0.3.0 |
| `townlight-boards` | [townlight/boards](https://github.com/townlight/boards) | 0.2.0 |
| `townlight-contracts` | [townlight/contracts](https://github.com/townlight/contracts) | 0.2.0 |
| `townlight-procurement` | [townlight/procure](https://github.com/townlight/procure) | 0.3.0 |
| `townlight-runtime` | [townlight/townlight](https://github.com/townlight/townlight) | 0.3.0 |

Station uses its separate service and database. The Windows profile directory is `%LOCALAPPDATA%\CivicSuite`. The tested upgrade starts from public Windows 1.7.2.1 and preserves that profile and data.

[Original compatibility and release-pairing evidence](../history/pre-naming-2026-11/compatibility.md) retains its original package names and release identities. It is historical evidence, not the active module catalog.
