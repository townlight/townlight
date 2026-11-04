# CivicProcure v1.0.0 Installer Integration Evidence

Superseded note, 2026-05-14: this is historical recovery evidence for a false
v1.0.0 release path. CivicProcure is currently a demoted v0.2.0 recovery-label
module and is not product-ready.

Date: 2026-05-09

Status: installer/module-selection proof added after the CivicProcure v1.0.0
module release.

## Scope

Controlled shared-infrastructure exception for the active CivicProcure v1.0.0
release. This evidence covers only Townlight installer/module-selection
metadata and verifier assertions. No queued module product code was changed.

## Installer Contract

- `installer/modules.json` marks `civicprocure` selectable.
- `civicprocure` requires Townlight Core `1.0.0`.
- `civicprocure` depends on `townlight_core`.
- `civicprocure` remains included in `full-suite`.
- `civicprocure` proof requirements now include module selection, install plan,
  artifact resolution, health check, and restart.
- `civicprocure` installer status is
  `v1_0_0_released_installer_plan_verified`.
- CivicContracts remains a context relationship, not an installer dependency,
  until CivicContracts has its own v1.0.0 release.

## Verifier Assertions

`scripts/verify-installer-plan.py` now asserts:

- the menu model exposes CivicProcure as selectable,
- the CivicProcure selector requires Townlight Core `1.0.0`,
- a custom CivicProcure plan includes `civicprocure`,
- a custom CivicProcure plan includes `townlight_core`,
- the CivicProcure install action requires Townlight Core `1.0.0`,
- the CivicProcure install action includes all v1 proof requirements.

## Verification Commands

```powershell
python scripts\verify-installer-plan.py
git -C ..\civicprocure fetch --tags
python scripts\plan-installer.py --profile custom --module civicprocure --show-artifacts --dry-run --write-report --run-id civicprocure-v1-installer-integration-20260509-rerun
bash scripts/verify-docs.sh
python scripts\verify-deployment-profile.py --static-only
python scripts\verify-suite-state.py
```

## Artifact Proof Expectations

The custom CivicProcure plan must resolve:

- `modules`: `townlight_core`, `civicprocure`
- CivicProcure version: `1.0.0`
- CivicProcure latest local tag after tag fetch: `v1.0.0`
- CivicProcure artifacts:
  - `dist\civicprocure-1.0.0-py3-none-any.whl`
  - `dist\civicprocure-1.0.0.tar.gz`
  - `dist\SHA256SUMS.txt`
- Evidence report:
  `installer\reports\civicprocure-v1-installer-integration-20260509-rerun\artifact-versions.json`

## Verification Result

The custom plan reports one inherited local artifact warning for Townlight Core
checksum metadata:

```text
townlight_core: no local SHA256SUMS.txt found in standard artifact paths
```

That warning is not a CivicProcure blocker. CivicProcure v1.0.0 artifact
resolution is successful and the planner reports no blockers.

## Boundary

This closes the installer/module-selection planning gate for CivicProcure. It
does not claim full host lifecycle installation of CivicProcure because the
suite installer remains in beta/YELLOW pending broader profile lifecycle work
and unresolved macOS lifecycle certification.
