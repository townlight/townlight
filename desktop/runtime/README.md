<a id="civicsuite-windows-local-runtime"></a>

# Townlight Windows Local Runtime

This directory defines the desktop supervisor contract for the Windows Local
1.0 profile.

`windows-local-runtime.json` is not a generated installer output. It is the
source contract the Tauri shell reads while the installer and portable runtime
bundle are implemented.

`windows-first-run.json` is the structured installer and first-run checklist
for the same Windows Local 1.0 profile. It keeps local paths, module selection,
city profile, first admin, backup, model download, health, repair, and uninstall
steps testable before the native installer executor mutates host state.

`windows-runtime-payloads.json` defines the portable runtime payloads that the
desktop supervisor installs or repairs from the bundled Tauri resource folder:
portable PostgreSQL 17 with pgvector, bundled CPython city services, and the
native Ollama runtime.

`gemma4-model.json` is the pinned local model contract for the Windows Local
1.0 profile. It identifies the official Gemma 4 12B QAT Q4_0 GGUF source,
Ollama runtime id, expected file size, required SHA-256 checksum, resumable
consent-gated download policy, and readiness checks that must pass before AI
workflows are enabled.

Current state:

- In the local Records convergence candidate, the service host and native
  migration/demo CLI entrypoints initialize the per-install secret paths before
  importing backend settings. They use the same local profile; no Linux
  `/run/secrets` path or test-only credential override is required.
- Records activation is explicit and fenced. After activation, Python/PostgreSQL
  owns current Records data; the preserved JSON snapshot is historical, not a
  fallback writer. A cold backup/restore leaves data services stopped: use Start
  to verify the restored database and resume work.
- The owner/test rc.3 transition preserves native `.sha256.json` export receipts,
  public-intake status labels and prefixed Access audit IDs. Receipts still require
  matching content hashes and sizes. A native ID mapping preserves historical
  audit labels without widening or replacing the existing Access engine's keys.
  Import advances the existing public tracking-number sequence past imported
  `REQ-` numbers without resetting it, so subsequent intake cannot reuse them.

- The runtime manifest defines the local services the supervisor owns.
- The payload manifest defines the files install/repair can copy into the local
  runtime profile.
- First-run PostgreSQL initialization has a five-minute limit so `initdb` can
  finish syncing the new cluster to disk. Disk syncing remains enabled; short
  service commands keep their one-minute limit.
- The desktop shell reports required services as needing setup until their
  bundled runtime payloads are present and their health checks pass.
- Lifecycle actions now prepare folders, copy available payloads, start/stop
  declared service processes, probe health, collect logs, back up, restore, and
  prepare uninstall.
- First-run steps are declared now so the desktop shell renders setup from
  structured state instead of static copy.
- Model readiness is declared now so the desktop shell can show blocked,
  checksum-required local model state without silently starting a network
  download.
