# Townlight Windows 1.8.1.1 handoff

[Published release](https://github.com/townlight/townlight/releases/tag/townlight-windows-v1.8.1.1) · [Signed MSI](https://github.com/townlight/townlight/releases/download/townlight-windows-v1.8.1.1/Townlight-Windows-x64-1.8.1.1.msi) · [Acceptance](https://github.com/townlight/townlight/releases/download/townlight-windows-v1.8.1.1/ACCEPTANCE-Windows-1.8.1.1.md) · [Checksums](https://github.com/townlight/townlight/releases/download/townlight-windows-v1.8.1.1/SHA256SUMS-Windows-1.8.1.1.txt)

Exact signed build `0afd59de52cb7ecb317188a89bcd1fec8c578a24`; MSI SHA-256 `9e9363ec5119a2ee4c0d69b4dd40b21a535571a11eb3750d57b8a24d4472a5da`. The corresponding-source ZIP preserves all fifteen repository commits. See [source pins](https://townlight.github.io/reference/windows-1.8.1.1-source-pins.json). Publication and documentation commits are separate from the signed build identity.

For a new installation use the signed MSI under the intended Windows account, select the full Townlight Inspections candidate profile, create the city profile/named administrator, finish backup, health and Records steps. Read the [Suite manual](https://townlight.github.io/manuals/suite.html) and [import guide](https://townlight.github.io/manuals/meeting-imports.html). Station requires its existing separate service configuration.

For an existing city, back up data/settings and retain the prior installer and restore path. An upgrade to 1.8.1.1 was not exercised. Preserve `%LOCALAPPDATA%\CivicSuite` and the same Windows account. The previous 1.8.0.1 acceptance separately covers the 1.7.2.1 upgrade.

## Maintainer pickup

All implementation PRs are merged: Suite #308, Meetings #195, Station #13, CivicCast #315, Brief #12. All 31 source families and 34 format pairs are listed in `docs/meeting-imports.md`, the public import guide and downloadable manuals. The engine lives in `desktop/runtime/python-services/townlight_runtime/meeting_imports.py`; durable integration is in `meetings_bridge.py` and native workspaces. CLI/Python/native authenticated HTTP contracts are documented. There is no separate importer MCP server or standalone library.

CivicCast opt-in uses its existing AgendaStore and shared reader subprocess. Brief opt-in applies to existing PrimeGov/Granicus discovery. TownReporter, Describer Workbench and Textflowkit have no new adapter; their existing APIs are not represented as this integration. Standalone packaging is future work requiring its own scope.

Known release limitation: distribution versions Runtime0.3.1/Meetings1.0.6 have stale health display strings0.3.0/1.0.5 in the accepted bytes. Later merged source corrects these strings. Preserve exact candidate provenance when making any future build.

The acceptance ZIP contains safe installed receipts. The Sandbox was stopped and inventory verified empty. No test VM needs to be resumed for this release. Prior releases, receipts and source archives remain intact. Do not use LFS for release assets. Source/client checks, installed acceptance and hosted CI are distinguished in the acceptance summary. No Linux or macOS work is part of this delivery.

Current documentation work is tracked in the merged release-documentation PRs; the final delivery receipt records their merge and live verification. Support feedback belongs in the normal GitHub issues workflow, with secrets and city information redacted.
