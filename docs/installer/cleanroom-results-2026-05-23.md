# City-Core Installer Cleanroom Results - 2026-05-23

## Scope

Profile: `city-core`

Modules:
- Townlight Core `1.2.0`
- Townlight Records `1.7.2`
- Townlight Meetings `1.0.3`
- Townlight Code `1.0.8`

Townlight Access is intentionally out of this city-core package until its depth probe closes.

## Artifact Outputs

Generated release bundle artifacts:
- `installer/dist/Townlight-city-core-linux-0.1.0.tar.gz`
- `installer/dist/Townlight-city-core-macos-0.1.0.tar.gz`
- `installer/dist/Townlight-city-core-windows-0.1.0.zip`
- `installer/dist/Townlight-city-core-0.1.0-SHA256SUMS.txt`
- `installer/dist/Townlight-city-core-0.1.0-release-manifest.json`

The macOS artifact is labeled `beta` in the release manifest and cleanroom output. This is archive/readiness evidence only, not macOS matching-host lifecycle certification.

## Local Cleanroom Evidence

Windows matching-host lifecycle:
- Run id: `local-city-core-windows-lifecycle-2`
- Report: `installer/reports/local-city-core-windows-lifecycle-2/installer-package-cleanroom.json`
- Classification: `matching_host_lifecycle`
- Result: passed
- Modes proven: install, repair, verify, backup, restore, uninstall
- Workflow proof: Townlight Records, Townlight Meetings, and Townlight Code all passed
- Backup proof: `postgres_backup_dump` passed for Townlight Records, Townlight Meetings, and Townlight Code
- Restore proof: `restore_probe_pg_restore` passed for Townlight Records, Townlight Meetings, and Townlight Code

Archive/readiness checks from this Windows host:
- Windows package readiness: `installer/reports/local-city-core-windows-readiness/installer-package-cleanroom.json`
- Linux package readiness: `installer/reports/local-city-core-linux-readiness/installer-package-cleanroom.json`
- macOS package readiness: `installer/reports/local-city-core-macos-readiness/installer-package-cleanroom.json`

Linux full lifecycle remains assigned to the GitHub installer-cleanroom matrix after this PR lands because this local host is Windows. macOS remains beta/archive-readiness only.

## Upgrade And Idempotency Evidence

Durable snapshots are committed under `docs/installer/evidence/2026-05-23-city-core/`.

The upgrade rehearsal used a dedicated install root, first installing the clerk-core set, then rerunning the installer with Townlight Code added:
- `upgrade-01-clerk-core-install.json`: clerk-core install passed for Townlight Records + Townlight Meetings
- `upgrade-02-city-core-install.json`: rerun passed with Townlight Records + Townlight Meetings + Townlight Code selected
- `upgrade-03-backup.json`: backup passed for all three city-core product modules
- `upgrade-04-restore.json`: restore probe passed for all three city-core product modules
- `upgrade-05-uninstall.json`: uninstall passed and removed the dedicated install root

An earlier rehearsal against the shared default local runtime root exposed stale port configuration from a previous local run. The committed operator path and package cleanroom use isolated install roots; the dedicated-root upgrade proof above is the evidence for this PR.

## Environment Detection Evidence

Synthetic readiness reports are committed under `docs/installer/evidence/2026-05-23-city-core/`:
- `readiness-missing-docker.json`
- `readiness-windows-missing-wsl.json`
- `readiness-low-resources.json`
- `readiness-ollama-missing.json`
- `readiness-townlight_core-mismatch.json`
- `readiness-nominal.json`

Each failure-state report includes operator-facing fix guidance instead of a raw stack trace.

## Browser QA Evidence

Browser QA summary:
- `docs/installer/browser-qa/2026-05-23-city-core-installer-matrix.json`
- `docs/installer/browser-qa/2026-05-23-city-core-installer-matrix.md`

Screenshots:
- `docs/installer/browser-qa/screenshots/2026-05-23-city-core-installer/records-admin-desktop.png`
- `docs/installer/browser-qa/screenshots/2026-05-23-city-core-installer/records-admin-mobile.png`
- `docs/installer/browser-qa/screenshots/2026-05-23-city-core-installer/clerk-public-desktop.png`
- `docs/installer/browser-qa/screenshots/2026-05-23-city-core-installer/clerk-public-mobile.png`
- `docs/installer/browser-qa/screenshots/2026-05-23-city-core-installer/code-public-search-desktop.png`
- `docs/installer/browser-qa/screenshots/2026-05-23-city-core-installer/code-public-search-mobile.png`

All browser QA captures passed with HTTP 200, expected text present, and no browser console events.
