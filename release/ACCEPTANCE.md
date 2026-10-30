# Townlight Beta 1 acceptance

This release distributes the previously verified Windows fresh-install candidate.
Publishing its source and documentation does not create a new installer build.

| Artifact | Bytes | SHA-256 |
|---|---:|---|
| Windows x64 MSI, product version 1.6.0.1 | 2,092,122,112 | `98bcdef11ebdf5c767f620c904ff49f85115fde3b5c23f62703b111e645aaf86` |
| Exact owned source/build companion | 15,612,591 | `84a23e1297e42d17b16cfc9e51b2dd78bc46414c0de8ad7ebd2466c1a409d06b` |
| Audited documentation companion | 5,973,722 | `a928bb1c40fec7ef6f223c7b77bc9fe7837e4cfffcebf35bb3309cc5549284e6` |

The MSI has a valid Scott Converse Authenticode publisher signature and Microsoft
timestamp. Signing workflow: [40954983813](https://github.com/townlight/townlight/actions/runs/40954983813).
The fresh Sandbox installation returned exit 0 and all 23,713 installed files
matched their recorded input hashes. The native executable, MSI and bundled
transcription signatures were checked.

Normal first-run used an empty profile: Setup created the profile and named
administrator; staff accounts and sign-in were created through the application;
the full desktop composition and canonical runtime were explicitly activated.
No accounts, sessions or business records were seeded. Tests used synthetic data,
installed IPC/HTTP, PostgreSQL/PostGIS and selected headless UI controls.

| Product | Selected installed outcome |
|---|---|
| Core | Setup, activation, staff access and permission refusal; coherent backup/restore with retained/absent record readback after Start/Check. |
| Records | Intake, original attachment and separate release copy, explicit decisions, exact-text approval, exports and fulfillment/readback. |
| Meetings | Meeting/agenda, packet, motion/vote, supplied transcript, reviewed/adopted minutes and restricted archive/proceedings. |
| Code | Retained source import and citations; proposal, Meetings decision, adoption and explicit codification closeout. |
| Zoning | Local source and geometry evidence, cited jurisdiction process, saved review and private Records handoff. |
| Planning | Retained policy sources, municipal initiatives/amendments, review and private Records handoff. |
| Permitting | Saved intake/review, source-grounded guidance, hash-checked separate private Records copy. |
| Inspections | Original evidence/hash, supplied observations and voice summary, saved/reviewed case and separate private Records copy. Earlier unchanged real vision/Whistle execution evidence was reused. |
| Station | Real native staff/meeting authority, headless capture start/stop, decoded generated audio/video, served hash, locked/private original and idempotent Records handoff. |

The detailed [workflow matrix](../docs/beta-1/reference/workflow-matrix.json) and
[receipt hash index](../docs/beta-1/reference/sandbox-evidence-index.json) identify
the retained evidence. Raw receipts containing session/profile material remain
private. Earlier failed test-driver attempts and the intended refusal for a
missing release decision were retained and resolved in the accepted paths.
Guest uninstall passed, owned acceptance processes terminated and the owned
Sandbox stopped. Existing host applications and standalone CivicCast were unchanged.

## Limits and city commissioning

- This is selected workflow acceptance, not certification of every field, role,
  vendor, jurisdiction or historical in-place upgrade. Use a fresh Windows test
  installation for this beta.
- Station is explicitly configured through its separate CLI/database/storage
  boundary and paired Townlight HTTP process. Automatic wizard provisioning and
  Windows SCM commissioning were not established. Actual city encoder/network,
  remote hosting and long-duration field quality remain site-specific.
- Model execution receipts do not establish recognition accuracy on field images
  or audio. Staff review remains required.
- No city credentials or real city data were used. A beta site still configures
  folders/backups, named local staff, authorized source bundles and any selected
  Station feed, then has staff confirm applicability and run their workflows.
- The expanded Station manual setup recipe was source/schema/parser checked; it
  was not rerun verbatim end to end. The installed paired runtime workflow itself
  passed as described above.
- Universal vendors, a new portal framework, live Meetings transcription,
  authoritative fee calculation, a stack rewrite and full CivicCast parity are
  outside this beta. Resident live-model assistance remains conditional, not a
  mandatory completed feature.

Required source-repository checks and actual public download/Pages verification
are separate publication evidence and must be recorded in the final release.
