# Clerk-Core Final Package Evidence - 2026-05-21

Status: package evidence for the Clerk-Core public-use starter release.

Scope: regenerated unsigned public-use starter archives for the Clerk-Core starter profile
after Townlight Meetings main `45eaccfcc69dd1ae7e2e45d7badd5d188b49397d` merged the
staff-session-gated protected API loading fix. This evidence covers Townlight Core,
Townlight Records, Townlight Meetings, and the Townlight installer package path only.

This document supports the Clerk-Core public-use starter release. It does not
claim city-ready status for the full suite, production hosting certification,
procurement readiness, airgap readiness, full-suite readiness, live cross-module
records exchange, native installer signing, or macOS lifecycle certification.

## Generated Artifacts

Command:

```powershell
python scripts\plan-installer.py --profile clerk-core --generate-release-artifacts --installer-version 0.1.0
```

Release manifest: `installer/dist/Townlight-clerk-core-0.1.0-release-manifest.json`

Archive hygiene: passed. The manifest rejects `.agent-runs`, runtime proof
folders, virtualenvs, caches, node modules, Playwright reports, test results,
and installer reports from release archives.

SHA256 checksums:

```text
93ea78ce038f7bae28f146497ab0b2567df0f8c08b546a0e1aa526b53edac4c7  Townlight-clerk-core-windows-0.1.0.zip
c7023a4105f58ac8f066678bb8d2bbfcce29c19121e39a867b416e0525ac67c2  Townlight-clerk-core-macos-0.1.0.tar.gz
7a07e148efc6f5d69cbfd397823779072df28d715527a3421f7fbb08101e9db4  Townlight-clerk-core-linux-0.1.0.tar.gz
```

Signing status: unsigned public-use starter. Operators must verify SHA256 checksums and
the official Townlight release source before running package commands.

Native installer status: wrapper manifests generated; signed native installers
were not built.

## Windows Matching-Host Lifecycle

Run id: `local-windows-package-lifecycle-public-use-v010-final3`

Command:

```powershell
python scripts\run-installer-package-cleanroom.py --archive installer\dist\Townlight-clerk-core-windows-0.1.0.zip --platform windows --run-id local-windows-package-lifecycle-public-use-v010-final3 --staff-mode bearer --workflow-proof
```

Result: passed.

Evidence classification: `matching_host_lifecycle`.

Certification scope: matching-host install, repair, verify, backup, restore,
and uninstall lifecycle evidence.

Host/target match: `win32` host normalized to `windows`; package target
`windows`; `host_platform_matches_target=true`.

Lifecycle modes:

| Mode | Status |
|---|---|
| install | passed |
| repair | passed |
| verify | passed |
| backup | passed |
| restore | passed |
| uninstall | passed |

Workflow proof: requested and passed during the installed lifecycle. The proof
covered Townlight Records request/search/review/response and Townlight Meetings
agenda/packet/minutes/vote/notice/archive paths.

Backup proof: both Townlight Records and Townlight Meetings emitted
`postgres_backup_dump` steps.

Restore proof: both Townlight Records and Townlight Meetings emitted
`restore_probe_pg_restore` steps.

## macOS Beta-Level Package Check

Run id: `local-macos-package-skipinstall-public-use-v010-final3`

Command:

```powershell
python scripts\run-installer-package-cleanroom.py --archive installer\dist\Townlight-clerk-core-macos-0.1.0.tar.gz --platform macos --run-id local-macos-package-skipinstall-public-use-v010-final3 --skip-install
```

Result: passed.

Evidence classification: `archive_readiness_only`.

Certification scope: archive extraction, readiness, and dry-run plan only; not
lifecycle certification.

Host/target match: false. This was run from a Windows/WSL environment and must
not be cited as macOS lifecycle certification.

## Linux Local Package Sanity

Run id: `local-linux-package-skipinstall-public-use-v010-final3`

Command:

```powershell
python scripts\run-installer-package-cleanroom.py --archive installer\dist\Townlight-clerk-core-linux-0.1.0.tar.gz --platform linux --run-id local-linux-package-skipinstall-public-use-v010-final3 --skip-install
```

Result: passed.

Evidence classification: `archive_readiness_only`.

Certification scope: archive extraction, readiness, and dry-run plan only; not
lifecycle certification from this Windows host. Linux matching-host lifecycle
must come from the Linux installer-cleanroom CI/self-hosted runner path for the
final promotion SHA.

## Starter Repo Release Verifiers

### Townlight Meetings

Source PR: Townlight/townlight_meetings#161.

Merged source SHA: `45eaccfcc69dd1ae7e2e45d7badd5d188b49397d`.

Local command:

```powershell
bash scripts/verify-release.sh
```

Result: passed before merge on the source-fix branch. Townlight Meetings main CI then
passed after the squash merge.

Proof summary:

- 591 Python tests passed.
- Docs, recovery gates, secret scan, placeholder import check, browser QA, and
  prompt evals passed.
- Frontend audit found 0 vulnerabilities.
- Frontend production build passed.
- 33 Vitest tests passed.
- 4 Playwright desktop/mobile user-flow tests passed.
- Package build, SHA256 generation, runtime install proof, and release contract
  passed.

### Townlight Records

Checked branch: `master` at `5fa6b9843e32b6bbe6cc885ffdd4339310f139f2`.

Local command:

```powershell
bash scripts/verify-release.sh
```

Result: passed after cleaning a stale local Compose stack that had occupied
port 8000 during an earlier attempt.

Proof summary:

- Recovery gates passed.
- Tracked-file secret scan passed across 517 tracked files.
- Compose runtime provisioned and hid `JWT_SECRET` and `FIRST_ADMIN_PASSWORD`
  from the API container environment.
- Data sovereignty check passed with warnings already reported by the checker.
- Version lockstep passed for backend, frontend, changelog, and unified spec at
  `1.6.1`.
- Required docs were present.
- Ruff passed through the API container.
- 643 backend tests collected and passed.
- Frontend `npm ci` and `npm audit --audit-level=moderate` passed.
- 36 Vitest tests passed.
- Frontend production build passed.
- 4 Playwright desktop/mobile user-flow tests passed.
- Runtime install proof passed and `/health` returned version `1.6.1`.

## Final Gate Result

The public-use gate can move to GREEN after final suite CI and release-lockstep
prove:

- main suite verify passes for the final SHA;
- main installer-cleanroom proves Linux matching-host workflow, backup, and
  restore for the final SHA;
- Windows matching-host lifecycle proof remains cited against the regenerated
  package or is rerun if package artifacts change again;
- release-lockstep passes if a release tag or GitHub release is moved;
- public-facing docs contain no city-ready full-suite, production hosting,
  procurement, airgap, live cross-module exchange, or macOS lifecycle
  certification overclaim;
- release-gate audit returns no unresolved Blocker or Critical findings.

Current evidence state:

- main suite verify run `26210542980` passed for
  `eaf71ea83e5022a06cf28cf18937e010ee6b88b6`;
- main installer-cleanroom run `26210542979` passed after rerunning a transient
  Linux npm-network failure and records Linux matching-host lifecycle evidence;
- final release-gate audit is recorded at
  `docs/installer/clerk-core-public-use-release-gate-audit-2026-05-21.md`.
