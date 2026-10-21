# Clerk-Core Public-Use Readiness Gate

Status: GREEN - Clerk-Core starter public-use release approved.

Last verified: 2026-05-21.

This gate records the promotion of the Clerk-Core starter product beyond the
outside-test beta line. It covers only the starter profile: Townlight Core,
Townlight Records, Townlight Meetings, and the Townlight installer.

This document does not promote the full suite, does not promote queued modules,
does not certify procurement use, does not prove live CivicRecords/CivicClerk
business-record exchange, and does not certify macOS lifecycle behavior.

## Current Evidence Baseline

`installer-clerk-core-v0.1.0` is the current public-use starter release. The
2026-05-21 final package evidence regenerated the unsigned `0.1.0` Clerk-Core
archives after Townlight Meetings main
`45eaccfcc69dd1ae7e2e45d7badd5d188b49397d` merged the staff-session-gated
protected API loading fix.

Evidence already recorded:

- Suite verifier passes with `[civicrecords-ai] PASS 1.6.1`.
- Suite verifier passes with `[clerk-core-workflow-proof] PASS`.
- Docs verifier passes.
- Installer-plan verifier passes.
- Release-lockstep gate passed for the beta.4 truth move.
- Linux matching-host package lifecycle proves install, repair, verify,
  backup, restore, workflow proof, and uninstall.
- Backup proof includes PostgreSQL custom dump evidence.
- Restore proof includes restore-probe `pg_restore` evidence.
- Windows matching-host lifecycle evidence exists for the regenerated
  package: install, repair, verify, workflow proof, backup, restore, and
  uninstall passed on a Windows host.
- macOS remains beta-level archive/readiness only until a Darwin/macOS Docker
  Desktop host runs matching-host lifecycle evidence.
- Installed browser QA evidence exists for Townlight Records login/admin paths
  and Townlight Meetings staff/public/protected-state paths at desktop and mobile
  widths.
- The 2026-05-20 installed route/state matrix records 20 browser checks and
  154 deduplicated installed routes across Townlight Records and Townlight Meetings.
- The 2026-05-21 package evidence records regenerated Windows, macOS, and Linux
  archive checksums, Windows matching-host lifecycle proof, and macOS beta-level
  archive/readiness proof.
- Restore-precondition evidence records the missing backup manifest failure
  path for a non-existent backup directory.

## Public-Use Promotion Checklist

| Gate | Status | Evidence or blocker |
|---|---|---|
| Spec scope checked for Townlight Core, Townlight Records, and Townlight Meetings | GREEN | Unified spec sections 6, 8, 9, 13, and 16-19 are the scope source. This release covers the starter operational workflows only and does not promote queued modules. |
| Required starter workflows implemented | GREEN | Installed-stack workflow proof exists for records request/search-surface/review/response and clerk agenda/packet/minutes/vote/notice/archive. No required starter workflow is deferred to move this gate. |
| Desktop and mobile browser UX checked for every public and staff path | GREEN | The 2026-05-20 installed route/state matrix records desktop/mobile coverage and 154 deduplicated installed routes. |
| Loading, success, empty, error, and partial states checked | GREEN | The 2026-05-20 installed route/state matrix records loading, success, empty, error, and partial state evidence where supported. |
| Console, keyboard/focus, accessibility, and copy review recorded | GREEN | Browser QA records console/focus observations and copy notes for the covered installed paths. |
| Adversarial mock validation completed for integration behavior | GREEN | The 2026-05-20 matrix records adversarial local integration probes for bad inputs, missing/stale records, spoofed or missing staff roles, unavailable dependencies, failed restore preconditions, and public/staff boundaries. |
| Full local tests and lint/static checks pass for touched repos | GREEN | Suite checks pass. Townlight Meetings `scripts/verify-release.sh` passed locally on the source fix branch and Townlight Meetings main CI passed after merge. Townlight Records `scripts/verify-release.sh` passed locally on current `master`. |
| Module release scripts pass where present | GREEN | Townlight Meetings `scripts/verify-release.sh` and Townlight Records `scripts/verify-release.sh` passed locally. |
| Required documentation updated | GREEN | README, changelog, status, release-recovery, user-facing installer docs, docs index, installer metadata, and verifier truth are updated as one release-truth set. |
| Release-gate audit has no unresolved Blocker or Critical findings | GREEN | `docs/installer/clerk-core-public-use-release-gate-audit-2026-05-21.md` records the final gate audit with no unresolved Blocker or Critical findings. |
| Installer/module-selection integration proven | GREEN | The `clerk-core` profile selects Townlight Core, Townlight Records, and Townlight Meetings and has Linux and Windows package lifecycle proof, with macOS bounded to beta-level archive/readiness proof. |
| CI is green after push, merge, and release-truth move | GREEN | Main verify run `26210542980` passed. Main installer-cleanroom run `26210542979` passed after rerunning a Linux npm-network failure and records Linux matching-host lifecycle proof for merge SHA `eaf71ea83e5022a06cf28cf18937e010ee6b88b6`. |

## Public-Use Release Scope

Allowed current claim:

> `installer-clerk-core-v0.1.0` is the public-use starter release for the
> Townlight Core + Townlight Records + Townlight Meetings Clerk-Core profile.

This is still not a full-suite release, procurement certification, production
hosting certification, live cross-module records exchange claim, airgap claim,
or macOS lifecycle certification.

## Halt Triggers

Stop promotion work if any of these occur:

- The suite verifier prints Townlight Records `1.6.0` as current.
- `[clerk-core-workflow-proof] PASS` disappears from suite verifier output.
- Linux matching-host lifecycle evidence no longer proves backup and restore.
- Any current-facing doc claims city-ready status for the full suite,
  production hosting certification, procurement readiness, full-suite release
  status, live cross-module records exchange, airgap readiness, or macOS
  lifecycle certification.
- Any queued module repo needs implementation work before this starter-product
  gate passes.

Anything outside the release scope above belongs to the next active module or
to a separately authorized platform-certification track.
