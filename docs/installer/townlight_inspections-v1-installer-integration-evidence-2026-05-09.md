# Townlight Inspections v1.0.0 Installer Integration Evidence

Superseded note, 2026-05-14: this is historical recovery evidence for a false
v1.0.0 release path. Townlight Inspections is currently a demoted v0.2.0 recovery-label
module and is not product-ready.

Date: 2026-05-09

## Purpose

Record the retroactive installer/module-selection evidence required by the new
Townlight rule: a module is not fully `v1.0.0` unless it is integrated into the
Townlight installer path.

## Manifest Result

- `installer/modules.json` marks `townlight_inspections` selectable.
- `townlight_inspections` now requires Townlight Core `1.0.0`.
- `townlight_inspections` depends on `townlight_core`, `townlight_code`, and `townlight_permitting`.
- `townlight_inspections` is included in the `land-use` profile after Townlight Permitting.
- `townlight_inspections` remains included in `full-suite`.
- `townlight_inspections` proof requirements now include module selection, install plan,
  artifact resolution, health check, and restart.

## Verification

Command:

```powershell
python scripts\verify-installer-plan.py
```

Result:

```text
VERIFY-INSTALLER-PLAN: PASSED
```

Specific proof command:

```powershell
python scripts\plan-installer.py --profile custom --module townlight_inspections --show-artifacts --dry-run --write-report --run-id townlight_inspections-v1-installer-integration-20260509
```

Result:

- `mutates_host`: `false`
- `profile`: `custom`
- `modules`: `townlight_core`, `townlight_meetings`, `townlight_code`, `townlight_zoning`, `townlight_permitting`, `townlight_inspections`
- `blockers`: none
- Townlight Inspections version: `1.0.0`
- Townlight Inspections latest local tag after tag fetch: `v1.0.0`
- Townlight Inspections artifacts resolved:
  - `dist\townlight_inspections-1.0.0-py3-none-any.whl`
  - `dist\townlight_inspections-1.0.0.tar.gz`
  - `dist\SHA256SUMS.txt`

## Limitation

This closes the installer/module-selection planning gate for Townlight Inspections. It
does not close the broader macOS installer lifecycle issue. macOS remains
beta/YELLOW until a real macOS host or VM lifecycle proof exists.
