# CivicSuite Troubleshooting

**Last verified:** 2026-07-02

This guide covers the umbrella city-core documentation truth path and the Windows Local MSI desktop app. Module-specific bugs still belong in the relevant module repo.

The Windows Local clerk path is a Tauri/WebView2 desktop app installed from an MSI. It does not use Docker, WSL, a terminal, or developer tooling. The Docker/WSL lifecycle scripts are a legacy Linux/developer CI proof path only, never the MSI operator's path. For the full install flow, see [installer/operator-walkthrough.md](installer/operator-walkthrough.md).

## City-Core App Will Not Start

1. Confirm the workstation is 64-bit Windows 10/11 with WebView2 installed and has the recommended 32 GB RAM (16 GB is a workable minimum; the local model needs about 6.7 GB resident at runtime on top of Windows, Postgres, and services).
2. Download the MSI from the official CivicSuite release page and verify its SHA-256 checksum matches the published hash.
3. After install, open CivicSuite from the Start menu or desktop shortcut.
4. If the app opens but a local service is unhealthy, open System Health, run **Check**, then **Repair** after reviewing the repair panel.

If the app asks for Docker, WSL, a terminal, or manual config-file edits, this is a bug — please report it on the CivicSuite GitHub issue tracker (<https://github.com/townlight/townlight/issues>).

## Model Download, Resume, Or Checksum Fails

The Gemma 4 12B QAT model (about 6.97 GB) is downloaded at first run from Hugging Face and served by the bundled Ollama runtime. The installer enforces a 15 GB free-disk floor for the model download.

1. If the download is interrupted, use **Download / Resume** in first-run setup.
2. If checksum verification fails, do not continue AI setup. Download the pinned model again or ask IT for the correct file.
3. If disk is low, free space (at least 15 GB) and run the model setup and health verification again.
4. Until the model file is present, checksum-verified, loaded in Ollama, and registered in the local model registry, AI workflows stay disabled. Confirm all of those in System Health.

## A Local Service Is Unhealthy

1. Open System Health and run **Check** to see which service (desktop shell, local data store, task queue, AI model runtime) is failing and why, in plain English.
2. Review the repair panel, then use **Repair**.
3. If the task queue schema needs migrations, System Health explains that; complete the migration step it offers.
4. Use **Backup Now** before any major repair, and **Restore Latest Backup** if a repair leaves data in a bad state.

## Artifact Hash Or Attestation Does Not Match

Use the live trust path:

1. Verify the generated `SHA256SUMS` or release manifest that belongs to the package you are running.
2. Confirm the package came from the official CivicSuite source or the recorded active run evidence path.
3. Confirm `installer/modules.json` `source_commit` values match the vendored source commits for all six city-core modules (CivicCore, CivicRecords AI, CivicClerk, CivicCode, CivicNotice, and CivicAccess).
4. For CivicCode module release assets, compare the published SHA256 and attestation bundle recorded in module release evidence.

Do not reuse old installer artifacts; always download the current release from the official GitHub Releases page and verify its SHA-256.

## Verifying The MSI Is Authentic

The Windows MSI is Authenticode code-signed via Azure Trusted Signing. To verify a download came from an authorized source:

1. Compare the MSI's SHA-256 checksum with the hash published on the official CivicSuite releases page.
2. Right-click the MSI file, select **Properties**, open the **Digital Signatures** tab, and confirm it lists a **verified publisher** (not "Unknown Publisher").

## Windows SmartScreen When You Run The Installer

Because the signing certificate is new, Windows SmartScreen may still show **"Windows protected your PC"** the first time you run the installer. This does **not** mean the file is unsafe:

1. Click **More info**.
2. Confirm the **Publisher** shows a **verified publisher** — not "Unknown Publisher".
3. Click **Run anyway**.

This prompt is normal for a newly code-signed application and stops appearing on its own as the certificate builds download reputation over time.

## The App Cannot Write Backups

Backups are local files written under the configured backup folder.

1. Confirm the backup folder is set in System Health.
2. If writes fail, choose a folder the signed-in local user can write to and run **Backup Now** again.
3. Keep backup folders somewhere the city can retain and protect according to its records and IT policy.

## CivicAccess City-Core Status

CivicAccess v0.4.0 is the sixth city-core module. The current v1.0.2 MSI installs all six city-core modules, including CivicAccess with its on-screen Accessibility tab. If a doc or status surface says otherwise, check the current truth surfaces below.

## Where To Check Current Truth

- Plain-English status: [../STATUS.md](../STATUS.md)
- Operator FAQ: [../FAQ.md](../FAQ.md)
- User manual: [../USER-MANUAL.md](../USER-MANUAL.md)
- Recovery status: [release-recovery-status.md](release-recovery-status.md)
- Downstream pins and source commits: [release-lockstep/downstream-pins.md](release-lockstep/downstream-pins.md)
