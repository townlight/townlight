# Townlight Inspections v1.0.0 Installer Integration Evidence - 2026-05-21

## Scope

This evidence reconciles the published Townlight Inspections v1.0.0 source release into the Townlight installer/module-selection truth surface.

It promotes only Townlight Inspections. It does not promote CivicGrants, CivicProcure, queued modules, the full suite, procurement readiness, production hosting certification, airgap readiness, live cross-module records exchange, or macOS lifecycle certification.

## Source Release Truth

- Repo: `Townlight/townlight_inspections`
- Source PR: `#10`
- Main merge SHA: `a018241d801feb89e9ff5bf29666edbeda6a2c9a`
- Main verify run: `26236492518`
- Release workflow run: `26236555671`
- Tag verify run: `26236555694`
- Tag: `v1.0.0`
- Tag peels to: `a018241d801feb89e9ff5bf29666edbeda6a2c9a`
- Release URL: `https://github.com/Townlight/townlight_inspections/releases/tag/v1.0.0`

## Release Assets

- `townlight_inspections-1.0.0-py3-none-any.whl`: `sha256:b03c5345eee8c2266af8e2135c959ab33e06b7e881bcad10ed63b5d2b18c0ffe`
- `townlight_inspections-1.0.0.tar.gz`: `sha256:910fe253cd878fa7211e6a374972e69f24355c20ba1018627e98ecb0d6ce9811`
- `SHA256SUMS.txt`: `sha256:cf97455ff0bbdfe2834a8771c6089bb57e93c1bfe9b59159b1b9b44e88263d87`

## Installer Metadata

`installer/modules.json` records:

- `id`: `townlight_inspections`
- `current_version`: `1.0.0`
- `townlight_core_requirement`: `1.1.0`
- `installer_status`: `v1_0_0_public_use_module_released`
- required proof: module selection, install plan, artifact resolution, health check, restart, release artifacts, browser QA, and release-gate audit

The `land-use` and `full-suite` profiles already include Townlight Inspections after Townlight Permitting.

## Local Suite Verification Required By This PR

Run from the Townlight repo:

```powershell
python scripts\verify-suite-state.py --remote-only
bash scripts/verify-docs.sh
python scripts\verify-installer-plan.py
python scripts\verify-release-lockstep.py
git diff --check
```

Acceptance requires `[townlight_inspections] PASS 1.0.0`, `[townlight_records] PASS 1.6.1`, green docs/installer/lockstep checks, and no macOS lifecycle certification claim.
