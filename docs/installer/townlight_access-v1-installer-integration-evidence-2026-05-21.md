# Townlight Access v1 Installer Integration Evidence

Date: 2026-05-21

## Source Release

- Repo: `Townlight/townlight_access`
- PR: #6
- Release: `v1.0.0`
- Tag target: `e29e701d96817a1aaca053ae8979851d9fb9dc51`
- Main verify run: `26222780265`
- Assets:
  - `townlight_access-1.0.0-py3-none-any.whl`
  - `townlight_access-1.0.0.tar.gz`
  - `SHA256SUMS.txt`

## Suite Truth Change

- `installer/modules.json` records Townlight Access `current_version: 1.0.0`.
- `installer/modules.json` records Townlight Access `townlight_core_requirement: 1.1.0`.
- `scripts/verify-suite-state.py` expects Townlight Access `1.0.0` and Townlight Core `1.1.0`.
- Compatibility, recovery, status, manual, FAQ, changelog, and unified spec docs record Townlight Access as a recovered public-use module release.

## Boundary

This promotes Townlight Access only. It does not promote queued modules, the full suite, procurement readiness, production hosting certification, airgap readiness, live cross-module records exchange, or macOS lifecycle certification.
