# Townlight Windows 1.11.0.1 unpublished candidate

Candidate signing and installed acceptance are pending. The signed public baseline is 1.10.0.1. No download links are provided.

## Access

Staff modules use existing profile/module permissions. Configure the resident portal and SMTP separately.

## Utilities

An admin registers the approved policy/version. A clerk opens an existing 311 request, reads the question, selects the policy, saves the reply and private notes, then confirms approval. The original tracker receives the body, citation, and matching notification.

For a pending approved reply, retry with the stable key and reopen the same ID after restart; do not create another case. No billing or payments.

## Library

Save program, title, time, location, public description, and private notes. A local admin approves the exact revision. The approved snapshot prepares an unsaved Comms draft; existing review/approve/schedule delivers it after desktop exit.

Attach the durable article ID/revision to the source revision through the verified link form; the server derives the Records receipt. Retry existing delivery rather than creating a new article. No patron or circulation data.

## Elections

Draft title, jurisdiction, election, public description, official URL, source version, and private notes. An admin designates eligible other staff through Elections settings and cannot self-designate; the designated official differs from the author and approves the exact revision/hash.

The public exact formatted checklist/citation binding blocks independent Comms edits. A v2 invalidates approval while published v1 stays; approve v2 separately and use correction with the verified prior article ID and same URL. If the link is missing, attach the prior revision first. Both immutable Records versions/receipts persist. No voting operations.

## Privacy and recovery

Private notes remain staff workpapers and are excluded from public, mail, and archive. An account change clears private UI and late responses. Host authoritative `utilities.sqlite3`, `library.sqlite3`, and `elections.sqlite3` under an explicit `TOWNLIGHT_DATA_DIR` or profile/Data; officials config stays under profile/config.

With existing stopped writers, back up and restore full Data plus config, preserving 311/Comms/Records data. Do not copy live partial DBs. Reopen original IDs, revisions, and receipts after restart.

Candidate source checks do not establish signed installed, upgrade, recovery, or two-PC acceptance; those remain pending.

## Hosted signed candidate acceptance

Prepared instructions only; no installed pass is claimed here.

Use `.github/workflows/installed-community-existing-candidate.yml` (display: **Installed ULE signed candidate**), dispatched from the candidate branch with required inputs: `signing_run_id`, `build_run_id`, `source_commit`, `intake_sha256`, `unsigned_msi_sha256`, `msi_sha256`, `exe_sha256`, and `mode` (`ule` or `ule-upgrade`).

- `ule`: fresh signed install of Utilities/Library/Elections.
- `ule-upgrade`: seed real 311/Comms/Records on signed 1.10.0.1, then upgrade.

Acceptance verifies exact build source; MSI and embedded EXE signatures/hashes; Library publication after GUI exit; same-URL Elections correction/archives; real Utilities reply/replay; restart; authoritative backup/restore; then uninstall profile retention.

The test caller suppresses acknowledgement only after real typed approval commits. Treat ordinary rendered-UI reopen and typed retry on the same durable key as separate evidence; do not describe this as network loss.

Require `source_commit` to be an ancestor of the harness with unchanged compiled inputs: `desktop/src`, `desktop/src-tauri`, `desktop/runtime`, `config`, `installer`, `portal`. Test-only harness changes do not require rebuilding an identical product.

Keep a count for each installed outcome across failures. After two same-cause failures diagnose and change the approach. After three failures on one installed outcome, obtain Astra diagnostic and allow at most three further attempts. No automatic reruns. Main, tags, releases, and Pages publication remain held.
