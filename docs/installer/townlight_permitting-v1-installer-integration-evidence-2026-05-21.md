# Townlight Permitting v1.0.0 Installer Integration Evidence - 2026-05-21

## Scope

This evidence reconciles the published Townlight Permitting v1.0.0 source release into the Townlight installer/module-selection truth surface.

It promotes only Townlight Permitting. It does not promote Townlight Inspections, CivicGrants, CivicProcure, queued modules, the full suite, procurement readiness, production hosting certification, airgap readiness, live cross-module records exchange, or macOS lifecycle certification.

## Source Release Truth

- Repo: `Townlight/townlight_permitting`
- Source PR: `#12`
- Main merge SHA: `da4ee8e3194eedc15361cf1baf9bab1e5bce5d6f`
- Main verify run: `26233364327`
- Release workflow run: `26233455321`
- Tag verify run: `26233454863`
- Tag: `v1.0.0`
- Tag peels to: `da4ee8e3194eedc15361cf1baf9bab1e5bce5d6f`
- Release URL: `https://github.com/Townlight/townlight_permitting/releases/tag/v1.0.0`

## Release Assets

- `townlight_permitting-1.0.0-py3-none-any.whl`: `sha256:8b8e7f206b334cd513458e6829b287b3a01e81bf5ba92fefb51035caff8c6cd7`
- `townlight_permitting-1.0.0.tar.gz`: `sha256:db41d1080aeda5c1aebe6467bd27817962ffe990180086f11af53cfcd8ee7c02`
- `SHA256SUMS.txt`: `sha256:49dfde33f2b92e27b6db236738dfbb093722743841ee065cd88b2a43f5cf8c08`

## Installer Metadata

`installer/modules.json` records:

- `id`: `townlight_permitting`
- `current_version`: `1.0.0`
- `townlight_core_requirement`: `1.1.0`
- `installer_status`: `v1_0_0_public_use_module_released`
- required proof: module selection, install plan, artifact resolution, health check, restart, release artifacts, browser QA, and release-gate audit

The `land-use` and `full-suite` profiles already include Townlight Permitting after Townlight Planning and before Townlight Inspections.

## Local Suite Verification Required By This PR

Run from the Townlight repo:

```powershell
python scripts\verify-suite-state.py --remote-only
bash scripts/verify-docs.sh
python scripts\verify-installer-plan.py
python scripts\verify-release-lockstep.py
git diff --check
```

Acceptance requires `[townlight_permitting] PASS 1.0.0`, `[townlight_records] PASS 1.6.1`, green docs/installer/lockstep checks, and no macOS lifecycle certification claim.
