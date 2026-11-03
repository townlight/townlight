# Starter-Set Release Gate - 2026-05-19

Status: beta.4 published unsigned OSS beta, not a public-use release.

Promotion beyond outside-test beta is controlled by
[`starter-set-public-use-readiness-gate.md`](starter-set-public-use-readiness-gate.md).

## Decision

The current public GitHub release is
`installer-clerk-core-v0.1.0-beta.4`; beta.3 is superseded without rewriting
the public beta.3 tag.
The supported artifact decision is:

- Tag: `installer-clerk-core-v0.1.0-beta.4`
- Distribution status: unsigned OSS beta
- Supported publish scope: clerk-core starter archives for outside testing
- Starter profile: Townlight Core, Townlight Records 1.6.1, and Townlight Meetings 1.0.1
- Runtime truth: Linux/container-first Docker/browser path
- Windows truth: wrapper/readiness path plus prior matching-host Docker Desktop
  lifecycle evidence on Windows 11 with WSL 2
- macOS truth: archive/readiness only until a Darwin/macOS Docker Desktop host
  runs matching-host lifecycle evidence

Beta.4 supersedes beta.3 after PR #157 with the `release-tag` label passed
release-lockstep, main verify, and main installer-cleanroom. Beta.3 remains
available as a superseded prerelease because its public git tag was not
rewritten.

## Evidence Baseline

Published release baseline:

- Main SHA: `4aee5355e4a9bdb56850a16d3a10693e706f9278`
- Verify run: `26134412418`
- Installer-cleanroom run: `26134412420`
- Release-lockstep PR run: `26134059097`
- Suite truth: `[townlight_records] PASS 1.6.1`
- Workflow proof: `[clerk-core-workflow-proof] PASS`
- Installer plan: `VERIFY-INSTALLER-PLAN: PASSED`
- Suite verifier: `VERIFY-SUITE-STATE: PASSED`
- Linux lifecycle: matching-host install, repair, verify, backup, restore,
  workflow proof, and uninstall
- Backup evidence: `postgres_backup_dump`
- Restore evidence: `restore_probe_pg_restore`

Published beta.4 archive checksums:

- `Townlight-clerk-core-windows-0.1.0.zip`: `632bf24487df5a9e156a68389819dbb5914bc0f910a99621e5b8f9711b7abfa5`
- `Townlight-clerk-core-macos-0.1.0.tar.gz`: `82c5baa841bd7f15485036e09380e1c4b209107121ab0d99d62b5820ab7fb86a`
- `Townlight-clerk-core-linux-0.1.0.tar.gz`: `f7d72bfed585e3134249213e137c15f9d2c96f33a9f0919789d8cbfb2187cbaf`

## Release-Tag Lockstep Path

The beta.4 release-truth PR included the `release-tag` label and updated or preserved
these lockstep truth artifacts together:

- `docs/TownlightUnifiedSpec.md`
- `docs/release-recovery-status.md`
- `scripts/verify-suite-state.py`
- `installer/modules.json`
- `CHANGELOG.md`
- `docs/release-lockstep/downstream-pins.md`

Required commands before push:

```powershell
python scripts\verify-suite-state.py --remote-only
bash scripts/verify-docs.sh
python scripts\verify-installer-plan.py
python scripts\verify-release-lockstep.py
git diff --check
```

Required CI after merge:

- main `verify` passes
- main `installer-cleanroom` passes
- logs show `[townlight_records] PASS 1.6.1`
- logs show `[clerk-core-workflow-proof] PASS`
- logs show Linux matching-host workflow proof, backup, and restore evidence

## Forbidden Claims

The required limitations are:

- not public-use ready
- not city-ready
- not procurement-ready
- not production-ready
- not a live cross-module TownlightRecords/Townlight Meetings records exchange
- not macOS lifecycle certified
- not a full-suite release

## Out Of Scope

External municipal validation, procurement certification, air-gap tests, native
app rewrites, and remaining module productization are outside this release gate.
