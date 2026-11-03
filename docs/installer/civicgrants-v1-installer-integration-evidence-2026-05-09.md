# CivicGrants v1.0.0 Installer Integration Evidence

Superseded note, 2026-05-14: this is historical recovery evidence for a false
v1.0.0 release path. CivicGrants is currently a demoted v0.2.0 recovery-label
module and is not product-ready.

Date: 2026-05-09

## Scope

Controlled shared-infrastructure exception for the active CivicGrants v1.0.0 release. This evidence covers only Townlight installer/module-selection metadata and verifier assertions. No queued module product code was changed.

## Manifest Evidence

- `installer/modules.json` marks `civicgrants` selectable.
- `civicgrants` requires Townlight Core `1.0.0`.
- `civicgrants` depends on `townlight_core` and `townlight_records`.
- `civicgrants` remains included in `full-suite`.
- `civicgrants` proof requirements now include module selection, install plan, artifact resolution, health check, and restart.
- `civicgrants` installer status is `v1_0_0_released_installer_plan_verified`.

## Verifier Evidence

`scripts/verify-installer-plan.py` now asserts:

- the menu model exposes CivicGrants as selectable,
- the CivicGrants selector requires Townlight Core `1.0.0`,
- a custom CivicGrants plan includes `civicgrants`,
- a custom CivicGrants plan includes `townlight_core` and `townlight_records`,
- the CivicGrants install action requires Townlight Core `1.0.0`,
- the CivicGrants install action includes all v1 proof requirements.

## Commands

```powershell
python scripts\verify-installer-plan.py
git -C ..\civicgrants fetch --tags
python scripts\plan-installer.py --profile custom --module civicgrants --show-artifacts --dry-run --write-report --run-id civicgrants-v1-installer-integration-20260509-rerun
```

## Results

- `VERIFY-INSTALLER-PLAN: PASSED`
- `modules`: `townlight_core`, `townlight_records`, `civicgrants`
- `blockers`: none
- CivicGrants version: `1.0.0`
- CivicGrants latest local tag after tag fetch: `v1.0.0`
- CivicGrants artifacts resolved:
  - `dist\civicgrants-1.0.0-py3-none-any.whl`
  - `dist\civicgrants-1.0.0.tar.gz`
  - `dist\SHA256SUMS.txt`
- Evidence report: `installer\reports\civicgrants-v1-installer-integration-20260509-rerun\artifact-versions.json`

## Warnings

The custom plan reports inherited local artifact warnings for Townlight Core checksum metadata and Townlight Records local `dist` artifacts. These warnings are not CivicGrants blockers; CivicGrants v1.0.0 artifact resolution is successful and the planner reports no blockers.

## Conclusion

This closes the installer/module-selection planning gate for CivicGrants. It does not claim full host lifecycle installation of CivicGrants because the suite installer remains in beta/YELLOW pending broader profile lifecycle work and unresolved macOS lifecycle certification.
