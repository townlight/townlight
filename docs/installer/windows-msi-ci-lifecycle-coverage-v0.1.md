# Windows MSI CI lifecycle coverage and gaps (v0.1)

**Scope:** what the `windows-msi-lifecycle` job in
`.github/workflows/desktop-windows-msi.yml` verifies against the **exact MSI
this workflow builds** (consumed via `needs: windows-local-msi` +
`download-artifact`), and what it cannot verify on a GitHub-hosted Windows
runner. This closes the verifiable subset of audit finding **T-C2** ("Windows CI
never installs the MSI; full lifecycle is Linux-only against the legacy 0.1.x
archive").

## Artifact and publication boundary

Routine pull-request and `main` CI deliberately builds and tests an **unsigned**
installer. The Actions artifact is named
`townlight-windows-local-msi-UNSIGNED`, the MSI filename ends in
`-UNSIGNED.msi`, and the accompanying evidence records
`SignatureState=UNSIGNED` and `PublicationAllowed=false`. This keeps normal
engineering validation independent of Azure credentials while making the
artifact's non-release status visible at every handoff.

Publication signing is a separate, explicit manual gate. A `main` dispatch with
`sign_for_publication=true` signs through Azure Trusted Signing, requires a
valid Authenticode signature from `CN=Scott Converse` with a timestamp, and
runs this same lifecycle job against the signed bytes. Only that path emits
`townlight-windows-local-msi-SIGNED` with `PublicationAllowed=true` evidence.
The release workflow accepts only that exact artifact from a successful manual
`main` run whose head SHA equals the release tag, then recomputes its hash and
re-verifies Authenticode before upload. An unsigned artifact cannot satisfy the
release contract.

## What the Windows MSI lifecycle job verifies (runs in CI)

| Lifecycle stage | How it is exercised | Pass signal |
|---|---|---|
| **Install** | `msiexec /i <built.msi> /quiet /norestart /l*v` (runner is elevated, so no interactive UAC) | msiexec exit code `0` |
| **Install integrity** | Read ARP/uninstall registry keys; resolve the install dir (`InstallLocation`, else the ARP `DisplayIcon` path) and confirm a non-uninstaller application exe is present | ARP entry present, install dir resolved, main binary (`townlight-desktop.exe`, the Cargo binary name) discovered by scan present |
| **First-run / backup / restore (logic)** | `cargo test first_run`, `cargo test backup`, `cargo test restore` against the desktop crate with an isolated `TOWNLIGHT_DESKTOP_STATE_DIR` | the first-run, backup, and restore unit/integration tests pass (includes `first_run_uninstall_action_uses_real_supervisor_final_backup`, `restore_replaces_profile_from_latest_backup`, backup manifest/tamper guards) |
| **Uninstall** | `msiexec /x <built.msi> /quiet /norestart /l*v` | msiexec exit code `0` |
| **Uninstall integrity** | Re-read ARP keys and the install dir | ARP entry gone, the application exe removed |

The main binary is **discovered by scan** (first non-`unins*` exe under the
resolved install dir), not matched against a hardcoded name: Tauri/WiX names the
exe from the Cargo binary (`townlight-desktop.exe`), which can differ from the
product display name, so this job does not hardcode `Townlight.exe`.

This install-integrity step does **not** check for the bundled
`runtime-payload-lock.json` (the portable Postgres/Python/Ollama payload). On
real machines the runtime payload is downloaded at first run, and CI MSI builds
do not stage it under the install dir, so checking for it here would be a false
signal. The data-plane half of the lifecycle (bundled PostgreSQL 17 + pgvector
bring-up, embedded CPython city services, and the PostgreSQL-backed task-queue
worker) is proven separately and against the real prepared payload by the
`desktop-townlight_core-integration` job (audit finding T-C1), which is the only job
that references `runtime-payload-lock.json`.

## Validated end-to-end on a pristine Windows Sandbox (QA-B1 clean-VM)

The interactive, model-heavy walkthrough that cannot run on a hosted CI runner
has now been exercised by hand on a **pristine Windows Sandbox** under QA-B1.
A clean-VM run on a real desktop session is stronger evidence than mocked CI
Playwright would be: it is the shipped Tauri/WebView2 GUI, the real MSI, and the
real ~6.97 GB model — not a stubbed DOM or a faked download. What was observed
end-to-end on the clean VM:

- **First-run GUI wizard.** The full click-through (notice → SmartScreen →
  locations → modules → city profile → first admin → model setup → health →
  finish) completed in the installed app, ending in a finished first-run profile.
- **~6.97 GB Gemma model download + load + real completion.** The model was
  pulled from Hugging Face, checksum-verified against the pinned SHA-256, loaded
  into the local Ollama runtime, and reported ready — a real local AI completion
  ran against it (not a mock).
- **Clerk records-intake workflow.** A records request was created and worked
  through intake in the installed GUI against the live local data store.
- **Backup/restore from inside the running app.** The in-app Backup Now / Restore
  Latest Backup buttons were exercised on the clean VM and round-tripped the
  local profile.

**Validated artifact:** `Townlight_1.0.1_x64_en-US.msi` — SHA-256
`5a1e5e2e4d2f3d7f77c52f108c4445c85db10ff3edc2c151d6bbae1cd97ce3ea`
(1,645,479,777 bytes) — the exact MSI attached to the `townlight-windows-local-v1.0.1`
release. The end-to-end run above was performed against this artifact.

This is hand-run clean-VM validation captured in the CHANGELOG, not an automated
per-PR gate; it is recorded here as the evidence that closes the GUI/model parts
of the gaps below. Re-run it on each RC before shipping.

## Partial / empty / error render states (now unit-covered in `npm test`)

The failure and empty surfaces a first user hits are now unit-covered by the
headless fake-DOM test `desktop/tests/xss-and-state.mjs`, which runs in CI via
the build job's `npm test`. It imports the **real** `src/main.js` render tree and
drives it with crafted app states:

- **Load error** (T4) — corrupt/unreadable saved state renders the retryable
  error banner, not the first-run checklist.
- **Model-not-ready** (T10) — a finished profile whose model is not yet
  downloaded/verified renders the Health model surface with the "Needs download"
  status and a Download/Resume cue (no crash, no blank).
- **Service-unhealthy** (T11) — a failing service renders its failing status and
  a Repair cue in the Health grid rather than crashing.
- **Empty records surface** (T12) — a clerk opening Records with no requests yet
  gets the empty-state note, not a crash on an empty list.

These are render-state guards, not a substitute for the QA-B1 walkthrough; they
catch a blank/crash regression in the partial states cheaply on every PR.

## Documented gaps (NOT verifiable on hosted runners)

1. **GUI-driven interactive first-run wizard.** The shipped product is a
   Tauri/WebView2 desktop GUI with no headless entry point (`main()` just calls
   `run()`), so the click-through wizard (notice → SmartScreen → locations →
   modules → city profile → first admin → model setup → finish) cannot be driven
   on a hosted runner without a real interactive desktop UI-automation session.
   The first-run **logic** is covered by `cargo test first_run`; the **GUI
   walkthrough on the installed RC** is performed under **QA-B1** on a clean
   machine (Beelink/Windows Sandbox), not on a hosted CI runner. The install /
   verify / uninstall portion of QA-B1 has been run on a fresh Windows Sandbox
   (msiexec install and uninstall exit 0, ARP entry registered then removed,
   binary at `C:\Program Files\Townlight\townlight-desktop.exe`), and the
   interactive click-through wizard has now also been completed end-to-end on a
   pristine Windows Sandbox (see "Validated end-to-end" above). It still cannot
   run on a hosted runner, so it stays a hand-run clean-VM step to repeat per RC.

2. **GUI-driven backup/restore from inside the running app.** Same reason: the
   backup/restore **logic** runs under `cargo test backup` / `cargo test
   restore`, and the in-app buttons have now been exercised on the clean VM under
   QA-B1 (see "Validated end-to-end" above). Still a clean-VM/UI step, not a
   hosted-CI one.

3. **~6.97 GB Gemma model download + local AI load.** First-run pulls the model
   from Hugging Face; this is too heavy and too slow for a routine CI job and is
   intentionally **not** performed here. The model artifact integrity (SHA-256 +
   exact size pin) is enforced in product code (`model.rs`), and the live URL was
   probed (HTTP 200, exact size, ungated) by the GauntletGate audit. The actual
   download + checksum verify + Ollama load + a real local AI completion have now
   been run on a pristine Windows Sandbox under QA-B1 (see "Validated end-to-end"
   above). This belongs in the clean-VM walkthrough, not per-PR CI.

4. **Repair (`msiexec /f`) and in-product uninstall-elevation UX.** Not yet in
   this job. Standard MSI repair could be added cheaply; the in-product uninstall
   path needing admin (1603/1730) is tracked as **QA-M2** and is a UX concern
   above the MSI lifecycle.

## Why this is the maximal verifiable subset

Everything that does **not** require pixels on a screen is exercised here against
the real installed MSI and the real runtime crate: silent install, file/registry
integrity, the first-run/backup/restore logic, and silent uninstall. The
remaining gap is exactly the interactive, model-heavy walkthrough that the audit
isolates as the QA-B1 clean-VM work; it cannot be honestly claimed from a hosted
runner, so it is named here rather than faked. That walkthrough — first-run
wizard, the ~6.97 GB model download + load + a real local AI completion, a clerk
records-intake workflow, and in-app backup/restore — has now been validated
end-to-end on a pristine Windows Sandbox under QA-B1 (see "Validated end-to-end"
above and the CHANGELOG, "Validated (QA-B1, clean machine)"). Because it needs a
real desktop session it stays a hand-run clean-VM step per RC, not an automated
hosted-CI gate; the cheap partial/empty/error render-state regressions are caught
per-PR by `tests/xss-and-state.mjs` in `npm test`. This is beta software: these
runs show the lifecycle works on a clean machine, not that it is production- or
city-ready.
