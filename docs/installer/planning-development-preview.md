# Townlight Planning native development preview

P5 adds opt-in `planning-preview` for native development acceptance: Planning
`0.3.0+dev.1`, Core `1.2.1` and the merged Records Planning source contract.
Primary Records and other existing profiles retain their behavior; land-use stays
disabled. This unsigned development candidate does not change the signed 1.4
installer. P6 release certification, signing and distribution remain separate.

## Preparation and recovery

Use clean source commits from `config/planning-preview-sources.json`.
Run `desktop/scripts/prepare-runtime-payload.ps1` with `-ProductProfile
planning-preview`, explicit `-PlanningRoot` and `-RecordsBackendRoot`, and existing
Meetings/Code/Zoning root options. Core, Notice and Access use existing sibling
checkout locations. Reused dependencies are rejected for this candidate. Preparation
records source commits, wheel SHA256s, installed package versions and umbrella
commit in `python/planning-candidate-provenance.json`. Historical installer source
pins remain separate.

Select Planning preview in setup. Activation verifies the candidate payload,
fences operations, stops writers and creates a verified coherent backup before
changing a populated profile. The activation receipt records recovery information.
Start/Repair explicitly migrates through `civicplan_0002`. Missing packages,
schemas or providers keep Planning unavailable. No municipal content is seeded.

For recovery, retain the activation receipt and use System Health backup/restore
to restore the coherent profile and database together. Start services afterward
and verify retained work. Do not downgrade/drop Planning tables or reactivate old
JSON writers. Keep recovery information outside the active profile during testing.

## Staff workflow

Sign in as a local administrator or city staff member. In Planning, choose a
validated local source bundle. Preview metadata, exact excerpts, anchors and hashes
before explicitly importing. An amendment needs the previous revision UUID from
source history. Save originals through the native file action and inspect the file
at its displayed local path.

Search adopted/effective policies, select versioned citations and start or reopen
an analysis. Edit the proposal, considerations, analysis text, private notes and
separate public summary. Explicitly select permitted Meetings/Zoning evidence;
saving rechecks its hash and permissions. Confirm review only after inspecting the
analysis and intended audience. The server records the current account UUID and
date; earlier audit evidence remains intact.

Preview the saved reviewed revision for staff-only or public use, then explicitly
create the immutable snapshot. Exact export verifies its expected hash and never
overwrites an existing file. Access advice remains a suggestion alongside the
retained original. A concurrent-save conflict retains edits: reopen saved work and
reconcile before saving again.

In Records, select a request, search public Planning snapshots and explicitly attach
the chosen version/hash. Attachment is idempotent and never releases a response.
Existing exemption, review, approval and export controls apply. Revoked/changed
evidence blocks subsequent reads and exports; historical snapshot bytes remain.

## Access and evidence boundaries

Resident/Public mode exposes permitted policies/originals and reviewed public
snapshots only. Records-only staff can select public snapshots through Records
without receiving Planning staff access. Native commands reuse existing HMAC
sessions and mapped SQL accounts. No service key or caller-selected actor grants
native staff access. All conclusions require human planning judgment.

Source and browser checks establish their specific boundaries. Native development
acceptance separately covers packaged Python/PostgreSQL/PostGIS, populated
activation, exact export, Records controls, revocation, recovery and restart. No
signing, tagging or publication is part of P5.
