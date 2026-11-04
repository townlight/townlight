# Starter-set candidate source contract

Status: prepared naming, Access and Notice candidate, 2 November 2026. This current contract replaces the earlier component pairing for new candidate builds. Earlier releases and their historical evidence retain their original identities.

Townlight Core installs first. Townlight Records and Townlight Meetings are selectable in the `custom` profile and included in `clerk-core` in that order.

| Component | Distribution | Candidate version |
|---|---|---|
| Core | townlight-core | 1.3.0.dev2 |
| Records | townlight-records | 1.8.0.dev2 |
| Meetings | townlight-meetings | 1.0.5 |

Townlight Meetings reports version 1.0.5 with Townlight Core 1.3.0.dev2 through `/health`. Install the matching exact local Core wheel first; these renamed packages are not yet published on an index. Principal imports are `townlight_core`, `townlight_records` and `townlight_meetings`. Use the coordinated source pins, not moving branch heads or renamed historical release URLs.

The exact signed Windows installed acceptance remains pending. The intended MSI is 1.7.0.1 with native source1.7.0-1 and runtime0.2.0. Package workflow proof and source-only checks do not certify an installer. The suite candidate checker binds the actual MSI, corresponding source, component wheels and acceptance to hashes; the old starter-set archive helper is not a substitute for that check.

The Windows candidate supports a new empty database and fresh profile. It refuses legacy initialization, preserves existing city data and uses the approved `%LOCALAPPDATA%\CivicSuite` path. No in-place upgrade or import shim is supported. Keep the previous release with its original existing profile.

The installed acceptance must exercise the agreed Meetings workflow, Code proposal/adoption integration and Meetings → Station → Records handoff, with actual saved records/readback and the stated external-service boundaries. Access and Notice have their separate complete bounded acceptance in the combined goal. No source gate authorizes an official publication, disclosure, model/provider change or release publication.

## Authorization and evidence handling

Installed acceptance includes first-admin authentication, bearer-protected staff
actions, anonymous/unauthorized-write refusal, saved workflow readback after
restart, and backup/restore evidence. Reports must not persist passwords or
bearer tokens. Access exports must include the complete reviewed source and
saved advice/model/actor/audit provenance. Notice requires durable draft, review,
exact-content approval, actual proof attachments, verified archive bytes and a
permission-bound Records handoff. Source or archive generation is not installed
acceptance. Record new versus reused evidence for the exact candidate.

The [original starter-set release contract](../history/pre-naming-2026-11/docs/installer/starter-set-release-contract.md)
preserves the earlier package pairings, platform claims and cleanroom commands
byte for byte. The generating prototype/package checks continue to exercise
their contracts; they do not certify the coordinated MSI or rename old artifacts.
