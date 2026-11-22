> Historical prepublication candidate handoff. Windows 1.9.2.1 was published on 2026-11-22 UTC; current release identity and accepted limits are in the [signed release](https://github.com/townlight/townlight/releases/tag/townlight-windows-v1.9.2.1) and [acceptance summary](https://github.com/townlight/townlight/releases/download/townlight-windows-v1.9.2.1/ACCEPTANCE-Windows-1.9.2.1.md). The candidate notes below preserve the prepublication state and are not the current public release record.

# Townlight Windows 1.9.2.1 candidate handoff and acceptance limits

## Candidate identity

The signed MSI is `Townlight-Windows-x64-1.9.2.1.msi`, SHA-256 `3242792ad6c825a5057d96c5e1d9d45fb5726ccbfba7ab24a2b428a54e63b0bf` (1,865,629,696 bytes). Its product source is Suite commit `1bc45be5a14aa969e53b87b1cef1f278dadc79a4` with the Records source pinned at `3d1291a9bdc382b2fc09666a25ce82de6939c55d`.

The signed product source and documentation/test changes are merged through [Suite PR #339](https://github.com/townlight/townlight/pull/339), merge `f558c1abda4b0f0bcf375e0169e1c4c1444460dd`, and [Records PR #154](https://github.com/townlight/sunshine/pull/154), merge `d41a38dd43df0c1bbacb0ad5dd3325d90c0d5fbb`. Both PRs passed their four required checks. The signed product source is `1bc45be5`; the final Suite documentation/test head is `a35afc2b`. The Records pin is reachable from its merged default branch.

## Verified workflows

The exact signed MSI and installed executable hashes and signatures were checked on the Windows host and clean Windows Sandbox guest. Synthetic acceptance exercised named existing staff roles across shared Meetings and Records workspaces; packet transfer and hashes; Station recording handoff to Records; current-draft review and rejection of stale approval; and the public/staff content boundary. The portal workflow used a synthetic portal and covered explicitly approved packet and recording publication, queued delivery after sign-out, retry after outage or restart, packet correction, independent withdrawal, and status readback. Cold recovery restored a verified city backup into a fresh profile at the same paths and checked the restored Station recording and Records derivative.

The test receipts are retained separately from this source note; they contain fixture and host-specific details and are not public documentation artifacts. No production city data, portal credentials, or production portal were used.

## Limits and release boundary

- The shared workflow test used one physical Windows PC as host plus a clean Windows Sandbox guest on that same PC. It did not exercise two physically separate PCs or a city-managed production network.
- Cold recovery used a fresh profile on the same physical Windows host and Windows account. It did not test a physically separate replacement computer or a city recovery environment.
- Portal publishing and outage tests used a synthetic portal. They do not establish production portal commissioning, real city network behavior, or operation with real city content and credentials.
- This candidate does not add new acceptance for a city's recording equipment, live-stream service, or physical broadcast chain.
- Windows 1.9.2.1 has no public Git tag or release. GitHub Latest and the available installer remain Windows 1.9.1.1. The public 1.9.1.1 installer predates the shared-host and unattended publisher workflows described here.

The detailed operator steps remain in the [Windows shared staff guide](../docs/installer/windows-shared-staff.md) and [Portal guide](../docs/portal/guide.md). This handoff records candidate source and installed-test scope; it does not publish or offer the candidate software.
