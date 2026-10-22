# Planning P6 unsigned installer candidate

This is a private engineering candidate, not a public release or a certification
of the existing signed Townlight 1.4 installer. The interface remains unchanged
and retains known density, overflow and visual hierarchy limitations. Public
readiness, signing, tags, publication and distribution are outside this work.

## Candidate contract

`config/planning-msi-candidate.json` freezes desktop `1.5.0-1` / Windows MSI
ProductVersion `1.5.0.1`, Planning `0.3.0+dev.1`, Core `1.2.1` and the opt-in
eight-module `planning-preview` composition. Source commits are the explicit
`config/planning-preview-sources.json` pins; payload preparation builds clean
Planning/Records wheels and verifies source, package and payload provenance.
Package and wheel hashes are recorded in the prepared artifact's provenance and
runtime lock; the final MSI/embedded EXE hashes are recorded in MSI evidence.
Do not substitute an earlier development payload or rebuild a delivered MSI for
its acceptance pass.

The separate `desktop/src-tauri/tauri.planning-candidate.conf.json` overlay changes
only the candidate version. Base release version, application identifier
`org.civicsuite.desktop`, MSI upgrade code, compatibility/data paths, historical
source pins and public download pointers stay unchanged. Permitting/Inspections
and the wider land-use profile remain disabled.

The Windows workflow selects Planning automatically only on the contract's named
candidate branch. An explicit manual `product_profile=planning-preview` selects
the same composition; other branches/ordinary automatic builds retain Zoning.
Both executable build and MSI bundling use the same overlay. The resolver rejects
Planning with publication signing. Candidate signing must not be enabled merely
to obtain an installable artifact. Routine CI artifacts are visibly `UNSIGNED`
and forbid publication.

## Upgrade and recovery boundaries

Candidate acceptance covers a fresh isolated Windows install and a disposable
populated copy from the signed 1.4 release. Preserve the signed MSI and original
profile/evidence; never test on an owner's working installation. The candidate
payload supports existing profiles and requires explicit backed-up opt-in before
Planning migrations. There is no automatic downgrade or schema deletion. Recovery
means reinstalling the known prior installer with its corresponding pre-upgrade
backup, never opening a newly migrated database with an older implementation.

Restore deliberately stages replacement directories and retains the former local
folders as additional recovery copies. Its `old folder cleanup is pending` note
does not mean restore failed: copied data/config, manifest verification, preserved
secrets/model cache and a pre-restore safety backup are separate steps. P5 verified
the recovered work and restart. Retain these folders/backups until recovery has
been accepted; this candidate adds no automatic deletion or cleanup procedure.
Unexpected restore verification/rename/secret errors still block the operation.

The Records candidate repairs the ancillary long-route HTTP audit failure without
a schema change. Short action representations remain compatible; long routes use
a bounded action/key and retain full context in hashed details. Canonical domain
audits and permission/release controls remain required.

## Acceptance and delivery

Required CI and one exact-MSI installed journey remain required before candidate
certification. The journey combines fresh install, populated 1.4 upgrade and data
retention, explicit Planning activation, cited review/snapshot/export/Records
handoff, role/privacy/revocation checks, restart, backup/restore and retained-data
uninstall/recovery. Reuse unaffected P5 feature evidence. CI source-level lifecycle
tests and an installed launch alone do not establish this installed journey.

The execution record and artifact-specific acceptance report must distinguish
prepared, executed and verified outcomes. This document does not predeclare those
results. Stop after the unsigned candidate and its evidence are reviewable.
Later authorized signing changes bytes and requires final signed-byte verification
before any separately authorized publication.
