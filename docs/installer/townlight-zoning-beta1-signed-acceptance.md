# Townlight Records + Meetings + Code + Zoning 1.4.0-beta.1

Four connected municipal products on one local Python/PostgreSQL domain path,
with Core, Notice and Access as shared supporting capabilities. This is a
bounded Windows public beta, not general availability or completion of the full
suite specification.

## What changes

- Explicit `zoning-beta` selection adds Zoning to Records, Meetings and Code.
  Records-only remains the default; existing saved selections are preserved.
- Bundled PostgreSQL 17.10/PostGIS 3.6.2 supports local parcel/overlay imports
  from an EPSG:4326 GeoJSON bundle, with preserved source provenance.
- Structured zoning rules cite authoritative Code sections and versions.
  Answers are informational, not zoning determinations, approvals or legal advice.
- Authorized humans can record corrections and interpretations without invented
  approval prerequisites. History is retained rather than rewritten.
- Permitted public Meetings history can be linked to a Zoning question.
- Explicitly public immutable Zoning snapshots attach to Records with content
  hashes, citations and history. Private notes and restricted material are excluded.
- Existing Records human response approval and final file export remain distinct
  from attaching a source. No automatic public publication is introduced.

## Upgrade from 1.3

Back up your work, close Townlight and install the new MSI. Existing city-core
selection remains intact. To enable Zoning, explicitly select `zoning-beta` in
Settings and apply. In System Health, stop City workflow services and Task queue,
then PostgreSQL before running City workflow services → Repair. This refreshes
the changed PostgreSQL/PostGIS and Python runtime and starts dependencies.
Repair while the old database process is running can report locked `icudt67.dll`;
stop those services and retry. Do not delete the database/profile. This is not
an unattended runtime upgrade.

## Deliberate limits

No live ArcGIS/assessor/CKAN ingestion, GIS editor, AI zoning interpretation,
binding determination, Planning, Permitting or Inspections is delivered here.
The fictional acceptance dataset does not establish production-scale spatial
performance. Existing optional model setup is unchanged; no new model download
is required for deterministic Zoning lookup and the connected source workflow.

## Verification

Verified October 21, 2026 against the exact signed release candidate:

- Required signing and Windows install/first-run/backup/restore/uninstall CI passed:
  https://github.com/townlight/townlight/actions/runs/39612266458
- Independent local MSI and installed EXE hash, Authenticode, signer certificate
  and timestamp checks passed against the preserved signing receipt.
- Fresh signed installation passed explicit zoning-beta setup, Python/PostgreSQL
  activation, connected Code/Meetings/Zoning sources, preserved history and immutable
  snapshot hashes, human-approved Records response/export and independent file/manifest checks.
- Populated upgrade from published signed 1.3 passed preservation of existing
  Records/Meetings/Code work and city-core selection, explicit Zoning opt-in,
  documented service-stop/runtime repair, and the connected workflow and export checks.
  Wait for repaired services to finish warming up before opening work.
- Both installations passed backup, an identifiable post-backup mutation, restore,
  removal of that later mutation, and connected work/history readback.
- Both MSI uninstalls returned exit code 0, removed the product, preserved all
  1,850 recorded data-file hashes in each guest, and left zero product service processes.
  Both disposable Windows guests were then closed.

Source commit: `5b22235f88a45da6e33fe7075654f724609a3921`

MSI SHA-256: `04f393d230106236619ace0cb97fa9bb6163af06407e46b634c8ce12d1101717`

Installed EXE SHA-256: `95f04d661e83fb8c92fd6a29827de0bfd2a442477164a1256c98c74a08b0d147`

The MSI, SHA-256 evidence and signing receipt are attached. Both MSI and embedded
EXE verify as CN=Scott Converse with Microsoft timestamps. These results concern
this exact signed candidate; the earlier unsigned Z4 results remain separate supporting evidence.


## Publication and evidence identity

Published October 21, 2026 at 12:12:53 MDT. Public delivery was verified after
publication. [Release assets and original signing receipt](https://github.com/townlight/townlight/releases/tag/townlight-records-meetings-code-zoning-v1.4.0-beta.1).
The source commit, release tag, signed assets and receipts remain unchanged by
the later naming/documentation cleanup. Earlier unsigned acceptance is preserved
separately in [the Z4 record](townlight-zoning-beta1-acceptance.md).
