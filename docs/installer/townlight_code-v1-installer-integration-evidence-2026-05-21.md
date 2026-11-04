# Townlight Code v1.0.0 Installer Integration Evidence

Date: 2026-05-21

Scope: Townlight Code public-use module release truth in the Townlight umbrella
installer/module-selection path. This evidence promotes Townlight Code only. It does
not promote queued modules, the full suite, procurement readiness, production
hosting certification, airgap readiness, live cross-module records exchange, or
macOS lifecycle certification.

## Source Release Evidence

- Repo: `Townlight/townlight_code`
- Release: `https://github.com/Townlight/townlight_code/releases/tag/v1.0.0`
- Release name: `townlight_code v1.0.0`
- Main source head after release-workflow fix: `cb5f23eb437863b602df2ba2825bb72fd26e1154`
- Main verify run: `26219229208`
- Release workflow run: `26219395141`
- Tag object: `d2bff271cd2268452f293a201accfc056fdaed5c`
- Peeled tag commit: `cb5f23eb437863b602df2ba2825bb72fd26e1154`

Published assets:

- `townlight_code-1.0.0-py3-none-any.whl`
- `townlight_code-1.0.0.tar.gz`
- `SHA256SUMS.txt`
- `release-attestation.json`
- `release-attestation.json.bundle`

## Suite Installer Truth

`installer/modules.json` records:

- `id`: `townlight_code`
- `current_version`: `1.0.0`
- `townlight_core_requirement`: `1.1.0`
- `installer_status`: `v1_0_0_public_use_module_released`
- proof requirements: `module_selection`, `install_plan`,
  `artifact_resolution`, `health_check`, `restart`, `release_artifacts`, and
  `release_attestation`

The `land-use` profile includes Townlight Code in dependency order:

1. `townlight_core`
2. `townlight_code`
3. `townlight_zoning`
4. `townlight_planning`
5. `townlight_permitting`
6. `townlight_inspections`

The installer planner resolves the `land-use` scenario as:

1. `townlight_core`
2. `townlight_meetings`
3. `townlight_code`
4. `townlight_zoning`
5. `townlight_planning`
6. `townlight_permitting`
7. `townlight_inspections`

The additional `townlight_meetings` dependency is expected because Townlight Code receives
adopted-ordinance handoff intake from Townlight Meetings.

## Verification Commands

Run from the `Townlight/townlight` umbrella checkout after this change.

```powershell
python scripts\verify-suite-state.py --remote-only
bash scripts/verify-docs.sh
python scripts\verify-installer-plan.py
git diff --check
```

Observed proof in this suite truth pass:

- `[townlight_code] PASS 1.0.0`
- `[townlight_records] PASS 1.6.1`
- `VERIFY-SUITE-STATE: PASSED`
- `VERIFY-INSTALLER-PLAN: PASSED`
- `RELEASE-LOCKSTEP-GATE: PASSED`
- `bash scripts/verify-docs.sh`: `PASS`
- `git diff --check`: no whitespace errors
- no current-facing Townlight Code `0.5.0` demotion claim
- no macOS lifecycle certification claim

Additional non-mutating planner checks:

- `python scripts\plan-installer.py --profile land-use --menu-style guided --dry-run`
  resolves `townlight_core`, `townlight_meetings`, `townlight_code`, `townlight_zoning`,
  `townlight_planning`, `townlight_permitting`, and `townlight_inspections`.
- `python scripts\plan-installer.py --profile custom --module townlight_code --menu-style guided --dry-run`
  resolves `townlight_core`, `townlight_meetings`, and `townlight_code`.
- `python scripts\plan-installer.py --profile custom --module townlight_code --menu-style guided --show-artifacts --dry-run`
  resolves Townlight Code `1.0.0` local artifacts and `dist\SHA256SUMS.txt`.
- `python scripts\plan-installer.py --profile custom --module townlight_code --menu-style guided --show-health-checks --dry-run`
  plans Townlight Code health at `http://localhost:8020/health` with actionable
  failure copy.

`verify-installer-plan.py` regenerates the tracked Clerk-Core source archives
under `installer/dist` after `modules.json` changes. Those regenerated source
artifacts are included so the repository's package metadata and SHA256 manifest
match the new Townlight Code `1.0.0` installer truth. This does not alter the
already-published `installer-clerk-core-v0.1.0` GitHub release.
