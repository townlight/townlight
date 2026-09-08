# City-Core Windows Local Operator Walkthrough

This walkthrough is for a city clerk, city employee, or local IT helper installing the Windows Local city-core package on one Windows workstation.

The clerk path does not require Docker, WSL, a terminal, or a developer account. Legacy archive runners and Docker-based lifecycle scripts remain CI/developer proof tools, not the end-user installation path.

## What This Installs

The Windows Local city-core package installs:

- CivicCore `1.2.0`
- CivicRecords AI `1.7.3`
- CivicClerk `1.0.4`
- CivicCode `1.0.8`
- CivicNotice `0.2.0`
- CivicAccess `0.4.0`
- CivicSuite desktop shell using Tauri/WebView2
- Portable local runtime payload for storage, services, file exports, backup/restore, and the local AI model runtime

CivicCore is always installed. CivicRecords AI, CivicClerk, CivicCode, CivicNotice, and CivicAccess are selected as the City Core profile. Future modules remain visible only through the module manager contract until their package and proof gates pass.

## Before You Start

Have these ready:

- A 64-bit Windows 10 or Windows 11 workstation with the WebView2 runtime (already present on current Windows; the installer can provision it if missing).
- RAM: 32 GB recommended (16 GB is a workable minimum). The local Gemma 4 model needs about 6.7 GB resident at runtime on top of Windows, PostgreSQL, and the city services; 32 GB leaves comfortable headroom for the local database and the generation context.
- Free disk: at least 15 GB. That covers the ~1.65 GB MSI, the ~6.97 GB model file, and data/backup headroom. First-run setup enforces a 15 GB free-disk floor before it will download the model.
- Permission to install normal Windows desktop software.
- A stable internet connection for first install/model download unless the model file has already been staged by IT (see "Offline / Air-Gapped Model Pre-Staging").
- A city name, records contact, clerk contact, first local administrator name/email, and a backup folder location.

Do not install Docker Desktop or WSL for this product path. If the app asks for Docker, WSL, a terminal, or manual environment edits, this is a bug — please report it on the CivicSuite GitHub issue tracker (<https://github.com/CivicSuite/civicsuite/issues>).

## Install

1. Open the CivicSuite Windows installer file.

2. Follow the installer screens. The installer places the app and portable runtime on the local machine and adds normal Windows uninstall support.

3. Open CivicSuite after install.

4. Complete first-run setup:
   - Confirm local install/data/backup folders.
   - Keep the City Core module profile selected.
   - Create the city profile.
   - Create the first local administrator.
   - Sign in as the first local administrator.
   - Choose the backup folder.
   - Download or resume the pinned Gemma 4 12B QAT Q4_0 model.
   - Verify the model checksum before enabling AI workflows.
   - Add clerk, records, code, or city-staff local users from Settings when staff
     need separate sign-in.
   - Run local health verification.

Use **Choose Folder** for the city data and backup locations. Staff may still
type a folder path when IT has supplied one, but normal setup should not require
manual Windows path copying.

The app should explain failures in plain English and keep repair, backup, restore, logs, support bundle, and uninstall reachable from System Health.

## Offline / Air-Gapped Model Pre-Staging

If the workstation cannot reach the internet during first run, IT can stage the
pinned Gemma model file ahead of time so first-run setup verifies it locally
instead of downloading it. The app never downloads the model silently; staging
just supplies the same file the download step would have fetched.

Pinned model file (from `desktop/runtime/gemma4-model.json`):

- File name: `gemma-4-12b-it-qat-q4_0.gguf`
- Size: 6,975,879,296 bytes (about 6.97 GB)
- SHA-256: `93567e57a8fe10b23569b9d9ec38cd005deedf71e29477c421a4b83f418a538b`
- Source: <https://huggingface.co/google/gemma-4-12B-it-qat-q4_0-gguf> at revision `29d097773436b69ff9feafd636ab4cf873786537` (content-addressed; the `resolve/main` pointer is mutable and drifted on 2026-07-17)

Procedure:

1. On a connected machine, download `gemma-4-12b-it-qat-q4_0.gguf` from the source
   above and confirm its SHA-256 matches the value listed here.
2. Run the installer and complete first-run setup up to the model step, confirming
   the city data folder so the data root exists.
3. At the model step, choose **Open Model Folder**. The app opens the `models`
   folder under the configured city data root (by default
   `%LOCALAPPDATA%\CivicSuite\Data\models`). Use this folder rather than typing a
   path; the app reads the model only from this exact location.
4. Copy the staged `gemma-4-12b-it-qat-q4_0.gguf` into that `models` folder. Keep
   the file name exactly as listed; a renamed file will not be found.
5. Back in first-run setup, choose **Verify Checksum**. The app checks the local
   file against the pinned size and SHA-256, records the verification, and
   registers the model. No download runs.
6. Continue with **Load Runtime Model** and local health verification as normal.

If verification fails, the file is the wrong build or was corrupted in transit;
re-stage from the source and confirm the SHA-256 before copying again.

## Verify The Install

After first-run setup, open System Health. Verify:

- Desktop shell is running locally.
- Local data store is installed and healthy.
- Task queue schema explains whether the PostgreSQL-backed CivicCore queue is
  ready, needs migrations, or cannot be checked because workflow services are
  not running.
- Local AI model file is present, checksum-verified, loaded, and registered.
- Backup folder is configured.
- Local Users shows the first administrator and lets a signed-in local
  administrator add, disable, re-enable, and reset passcodes for staff accounts.
- Repair, backup, restore, logs, support bundle, and uninstall controls are visible behind local-admin access.

Use the module manager in Settings to confirm:

- City Core profile is selected.
- CivicCore, CivicRecords AI, CivicClerk, CivicCode, CivicNotice, and CivicAccess are installed.
- Each installed module shows install, update, disable, remove, backup coverage, and export access state.
- Future modules are not presented as installed.

Use Local Users in Settings to confirm:

- The first local administrator cannot be disabled from the staff-user list.
- A staff passcode can be reset without hand-editing local files.
- A disabled staff account can be re-enabled by the local administrator.
- Clerk staff can work in Meetings & Notices.
- Clerk staff can work in Public Notices.
- Records staff can work in Records Requests.
- Code staff can work in Code & Ordinances.
- City staff can work across the city-core module set without receiving setup,
  runtime, backup, module-manager, or user-management authority.

## Clerk Smoke Test

Use the app screens, not a terminal:

When a workflow needs a local source document, packet attachment, release copy,
or code source file, use **Choose File** from the desktop app. Staff may still
type a path when IT has supplied one, but clerks should not have to browse
Windows folders manually for normal file evidence work.

- Meetings & Notices: create a meeting body with statutory basis/cadence/notice/quorum details, save meeting body roster members with roles/terms/contact details, submit an agenda intake item with department/source evidence, review it as ready for agenda, promote it into a meeting agenda, create a meeting for that body, add a manual agenda item when needed, record a structured staff report with recommendation/background/analysis/fiscal impact/alternatives/prior actions/preparer details, attach public packet files and closed-session addenda with citations and SHA-256 evidence, finalize the packet with prepared-by and review-note evidence before export, record closed-session basis/topics/timing/reconvene evidence with staff-only notes separated, calculate the notice deadline from meeting date/lead days/day type with the city/state holiday review warning, complete or confirm the notice checklist with meeting type/statutory basis/deadline/time zone/clerk approval, record notice posting date/location/method/confirmation, mark notice ready, export a records-ready packet/notice bundle with checksums, source references, public/staff classification, and export counts, generate or type minutes, add minute citation evidence for the current draft, record attendance from the saved member roster, save a quorum check from the attendance evidence, record a motion, record individual roll-call votes from the saved member roster, record vote/outcome summaries, record action items with owner/due/status/source details, adopt minutes, sign the adopted minutes with attestation evidence, record adopted ordinances/resolutions for CivicCode sync, and archive the public record without exposing closed-session files, staff-only minute citations, staff-only closed-session notes, intake queue records, or local paths.
- Public Notices: open the Public Notices screen, enter the meeting date and legal basis, calculate the posting deadline, complete the notice checklist with clerk approval, record posting proof with date/location/method/confirmation, export the notice archive packet, and confirm the exported bundle appears in module exports and Search City Knowledge with the public-notice module label. CivicNotice helps staff preserve checklist, posting, and archive evidence; it does not replace the city attorney or clerk's statutory judgment.
- Records Requests: create or submit a request, calculate the response deadline from received date/rule/day-count/day-type with staff review, manually override the response deadline and basis when needed, review the Request Timeline, public-safe Status Updates, Request Messages, Search Sessions, Request Documents, Exemption Decisions, Release Packages, and Notification Outbox, log generated notifications as sent after staff sends them, record search/citation notes, save durable search sessions with query/location/result evidence, attach local source documents with hash/citation evidence, attach release-ready or redacted copies with their own hash/reviewer/note evidence before package build, save release/redact/exempt decisions with source and basis evidence, build a checksummed release package manifest, add fee line items with the fee schedule or policy basis, record a fee waiver reason, generate or type a response draft, approve, export, mark fulfilled, and close.
- Resident/Public Records Requests: submit a public request, keep the returned request number, check status with the same submitted contact, and confirm Status Updates show safe progress without staff notes, search details, exemption reasoning, local paths, or internal audit details.
- Code & Ordinances: import a code source with title/citation/searchable text, preserve the source file as local evidence when available, verify the saved source shows filename/hash evidence without publishing local workstation paths, record sync state, generate or type guidance, approve guidance, publish source, answer a code question with citations, and create a clerk handoff.
- Accessibility: open the Accessibility tab, run a WCAG sample review, save it, confirm the saved review appears in the review list with its export button, and confirm it appears in Search City Knowledge.
- Search City Knowledge: search across local meeting, records, and code data with citations and module labels.

Risky civic actions should open a review panel before saving. Backup, restore, support bundle, repair, service stop, and uninstall should also open a review panel before running.

## Backup And Restore

Use System Health before major changes:

- **Backup Now** writes local data/config copies and a backup manifest.
- **Restore Latest Backup** creates a pre-restore safety backup before replacing local data/config from the latest backup.
- Restore should stop safely if no backup manifest exists.

Backups are local files. Keep backup folders somewhere the city can retain and protect according to its records and IT policy.

## Support Bundle

Use **Create Support Bundle** in System Health when city IT or CivicSuite
support asks for local runtime evidence. The app creates a timestamped folder
under the configured backup location with a README, support-manifest.json,
health-summary.json, runtime-state.json, and selected service logs. It does not
copy city records, uploaded documents, backup contents, or local secrets.

## Uninstall

Use **Prepare Uninstall** in System Health before removing CivicSuite:

- The app creates a final uninstall backup.
- The app stops local services.
- The app removes local data and setup/config state.
- After preparation succeeds, choose **Open Windows Uninstall** or use Windows
  Settings > Installed apps, find CivicSuite, and choose Uninstall.
- The Windows uninstall entry removes program files.

Reinstall should be able to restore from the final backup when the backup folder is available.

## Troubleshooting

If model download is interrupted, use **Download / Resume** in first-run setup.

If checksum verification fails, do not continue AI setup; download the pinned model again or ask IT for the correct file.

If a local service is unhealthy, use System Health **Check**, then **Repair** after reviewing the repair panel.

If disk space is low, free space and run health verification again.

If the app cannot write backups, choose a folder the local user can write and run backup again.

If the app asks for Docker, WSL, terminal commands, or manual config-file edits, this is a bug — please report it on the CivicSuite GitHub issue tracker (<https://github.com/CivicSuite/civicsuite/issues>).
