# Townlight for Windows 1.9.3.2 release notes

**Published 2026-11-24. The signed MSI passed direct-upgrade, lifecycle, and fresh exact-artifact acceptance checks.**

This release adds authenticated downloads of private managed Records attachments for authorized staff workstations. The client verifies the expected byte count and SHA-256 before publishing a saved copy. It also fixes a Station operator-control race during session renewal and polling.

Candidate component checks used synthetic test data. R7 downloaded the same private R9 Records attachment: 2,174,280,536 bytes, SHA-256 `d7285a6c7d5fdc647ce8aada943e6a668ca63a1e5137db07b673250fa8bff775`. The saved workstation copy matched the expected size and digest, and FFmpeg decoded audio and video near the end of that copy. In a separate short physical Station candidate run, four operator polls succeeded while a renewal response was delayed; Stop returned HTTP 202 and the same recording completed normally.

These physical results are candidate component evidence. The signed MSI passed direct-upgrade and lifecycle checks plus fresh exact-artifact acceptance run 45328280431. Preserve the Windows 1.9.3.1 release and its acceptance as historical records.

The signed 1.9.3.2 installer passed setup, backup and restore, uninstall, and upgrade from Windows 1.9.3.1. The clerk test first timed out; after its wait was corrected and it was rerun against the same signed installer, it passed. A fresh installation captured 2,151,683,876 bytes of synthetic audio and video, Stop returned HTTP 202, and the private Records copy matched and played audio/video near its end. It still matched after restoring the city profile.

## Published release links

- Release tag: `townlight-windows-v1.9.3.2`
- MSI: `Townlight-Windows-x64-1.9.3.2.msi`
- Release catalog: <https://github.com/townlight/townlight/releases/tag/townlight-windows-v1.9.3.2>
- Checksums: <https://github.com/townlight/townlight/releases/download/townlight-windows-v1.9.3.2/SHA256SUMS-Windows-1.9.3.2.txt>
- Acceptance: <https://github.com/townlight/townlight/releases/download/townlight-windows-v1.9.3.2/ACCEPTANCE-Windows-1.9.3.2.md>
- Maintainer handoff: <https://github.com/townlight/townlight/releases/download/townlight-windows-v1.9.3.2/HANDOFF-Windows-1.9.3.2.md>
- Signing evidence: <https://github.com/townlight/townlight/releases/download/townlight-windows-v1.9.3.2/Signing-Evidence-Windows-1.9.3.2.txt>
- Corresponding source: <https://github.com/townlight/townlight/releases/download/townlight-windows-v1.9.3.2/Townlight-Windows-1.9.3.2-Corresponding-Source.zip>
- Installed evidence: <https://github.com/townlight/townlight/releases/download/townlight-windows-v1.9.3.2/Townlight-Windows-1.9.3.2-Installed-Evidence.zip>
- Signing receipt: <https://github.com/townlight/townlight/releases/download/townlight-windows-v1.9.3.2/Townlight-Windows-1.9.3.2-signing-receipt.json>

## Verified signed artifact metadata

The legacy installer planner reads `config/suite-state.json` and its `installer/modules.json` projection, retaining source pins used by archived cleanroom tests. Windows 1.9.3.2 release source pins come from its published corresponding-source archive and listed release pin manifest.

- Suite source: `67d56f24c12be4f2a409d1940ca4199a226adcfc`
- Records 1.8.0.dev4 source: `3d1291a9bdc382b2fc09666a25ce82de6939c55d`
- Station 0.4.4 source: `f1b946b10ed72f2ffd93e0609d913c73566debe4`
- [Released component source pins](https://townlight.github.io/reference/windows-1.9.3.2-source-pins.json)
- Signing run: [45321294952](https://github.com/townlight/townlight/actions/runs/45321294952)
- MSI SHA-256: `b00510e0649552b5efd9744513bf9fcaf59cbee5755fd864eb922a5151c96b77`
- MSI size: 1,866,072,064 bytes
- Fresh exact-artifact acceptance run: [45328280431](https://github.com/townlight/townlight/actions/runs/45328280431), passed
- Publication timestamp: `2026-11-24T05:50:39Z`
