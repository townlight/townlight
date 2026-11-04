# Townlight Installer Checkpoint - 2026-05-09

Status: historical checkpoint. Current work is Linux/container-first with
Windows and macOS wrappers around that core. The clerk-core archive generator
now has explicit archive hygiene checks; full macOS runtime proof still
requires a macOS host or VM.

Superseded note, 2026-05-14: the v1.0.0 module-selector claims below are
historical release-recovery evidence, not current product-readiness claims.
Townlight Inspections, CivicGrants, and CivicProcure are demoted recovery-label modules
at v0.2.0, and Townlight Core is currently v1.1.0.

Update: module v1.0.0 release gates now require installer/module-selection
integration. Townlight Inspections was retroactively added to the land-use profile and
verified as a selectable/custom module with Townlight Core 1.0.0, Townlight Code, and
Townlight Permitting dependency resolution through the planner. macOS remains beta/YELLOW
until real macOS lifecycle certification exists.

Update: CivicGrants v1.0.0 was added to the installer/module-selection proof
path after its module repo release. Custom CivicGrants selection now resolves
`townlight_core`, `townlight_records`, and `civicgrants`; CivicGrants requires
Townlight Core 1.0.0 and uses the v1 proof list: module selection, install plan,
artifact resolution, health check, and restart. The CivicGrants artifact proof
resolves `dist\civicgrants-1.0.0-py3-none-any.whl`,
`dist\civicgrants-1.0.0.tar.gz`, `dist\SHA256SUMS.txt`, and tag `v1.0.0`.

Update: CivicProcure v1.0.0 was added to the installer/module-selection proof
path after its module repo release. Custom CivicProcure selection now resolves
`townlight_core` and `civicprocure`; CivicProcure requires Townlight Core 1.0.0 and uses
the v1 proof list: module selection, install plan, artifact resolution, health
check, and restart. CivicContracts remains a context relationship, not an
installer dependency, until CivicContracts has its own v1.0.0 release. The
CivicProcure artifact proof resolves
`dist\civicprocure-1.0.0-py3-none-any.whl`,
`dist\civicprocure-1.0.0.tar.gz`, `dist\SHA256SUMS.txt`, and tag `v1.0.0`.

## Scope Completed

This checkpoint records the first safe installer slice for Townlight. The work
created an umbrella-level installer contract, dry-run planner, and a first real
`clerk-core` beta lifecycle. It does not change module runtime code and does
not claim signed native installer binaries.

Completed surfaces:

- `.github/workflows/installer-cleanroom.yml` now runs the package cleanroom
  checks on demand, on a daily schedule, and when installer paths change. It
  proves extracted archive readiness/plan on Windows, macOS, and Linux runners,
  and proves the full Linux archive install, repair, verify, and uninstall
  lifecycle on Ubuntu with uploaded evidence.
- `installer/modules.json` covers all 26 tracked Townlight repos.
- `scripts/plan-installer.py` resolves profiles, dependencies, menu styles,
  readiness states, artifact/version inputs, service/profile config,
  health-check plans, executor preflight, and the execution gate.
- `scripts/plan-installer.py --profile minimal --generate-install-kit` writes
  the first minimal Townlight Core install kit under `installer/generated/minimal`.
- `installer/generated/minimal/install-townlight_core.ps1` has been executed once
  and installed Townlight Core 1.0.0 into the kit-local `.venv`.
- `installer/generated/minimal/verify-townlight_core.ps1` has been executed once and
  verified `import townlight_core` reports `1.0.0`.
- `installer/reports/manual-minimal-townlight_core-install/proof.json` records the
  execution proof and the generator bug found during the first proof run.
- `installer/generated/minimal/reset-townlight_core.ps1` and
  `installer/generated/minimal/reset-townlight_core.sh` reset only the kit-local
  `.venv`.
- The generated Windows reset script removed the kit-local `.venv`, the install
  script reinstalled Townlight Core 1.0.0, and the verify script again reported
  `1.0.0`.
- `scripts/run-minimal-cleanroom.py` runs the generated minimal kit in a
  disposable Linux container with copied kit inputs and copied Townlight Core wheel.
- `installer/reports/manual-minimal-linux-cleanroom-2/cleanroom-proof.json`
  records a passing cleanroom proof in `python:3.12-slim`.
- `scripts/run-townlight_records-cleanroom.py` copies Townlight Records into an
  evidence workspace, starts an isolated Docker Compose project, verifies API
  and frontend health, runs live Playwright desktop/mobile checks, saves
  screenshots, and tears the stack down with volumes removed.
- `installer/reports/manual-townlight_records-service-cleanroom-4/service-ui-proof.json`
  records a passing service/UI cleanroom proof.
- `scripts/plan-installer.py --profile clerk-core --run-cleanroom-proof` now
  calls the passing TownlightRecords service/UI cleanroom runner through the suite
  installer command surface.
- `scripts/plan-installer.py --profile clerk-core --run-cleanroom-gate` now
  runs the same Docker proof and returns concise pass/fail gate output for API
  health, frontend health, and Playwright desktop/mobile UI verification.
- `scripts/plan-installer.py --profile clerk-core --generate-profile-package`
  writes the first cross-platform operator package under
  `installer/generated/packages/clerk-core`.
- `scripts/plan-installer.py --profile clerk-core --generate-release-artifacts`
  writes platform archives, SHA256 checksums, a release manifest, and native
  wrapper manifests for Windows, macOS, and Linux.
- Generated packages and release manifests now identify the artifacts as
  unsigned OSS beta builds, explain expected Windows/macOS/Linux trust warnings,
  and direct operators to verify SHA256 checksums before continuing.
- Release archives are now self-contained bundles with the selected platform
  package, planner, lifecycle runner, manifest, and bundled Townlight Records plus
  Townlight Meetings source trees.
- `scripts/run-clerk-core-installer.py` provides the real `clerk-core`
  lifecycle: readiness, install, verify, repair, and uninstall.
- Package install builds and starts Townlight Records plus Townlight Meetings from the
  bundled source trees on high ports.
- Package verify checks TownlightRecords API, TownlightRecords web, Townlight Meetings API, and
  Townlight Meetings web.
- Package repair preserves generated `.env` files, rebuilds/restarts services,
  and verifies health.
- Package uninstall removes the profile Docker containers and volumes.
- `scripts/run-installer-package-cleanroom.py` extracts the Linux release
  archive and runs readiness, plan, install, repair, verify, and uninstall from
  the extracted bundle.
- `scripts/run-installer-package-cleanroom.py` now also supports Windows,
  macOS, and Linux release archives through the platform-specific package
  launchers.
- Windows zip packaging now preserves the Dockerfile-required
  `backend/tests` path inside the bundled Townlight Records source by writing a
  `.bundle-placeholder` file before archive creation.
- `installer/reports/installer-package-cleanroom-20260509T184534Z-72a08df7/installer-package-cleanroom.json`
  records a passing package lifecycle proof.
- `installer/reports/installer-package-cleanroom-20260509T193309Z-b90bb614/installer-package-cleanroom.json`
  records a passing Windows extracted-package lifecycle proof.
- `installer/reports/installer-package-cleanroom-20260509T193433Z-4582af7c/installer-package-cleanroom.json`
  records a passing Linux extracted-package lifecycle proof after the Windows
  zip preservation fix.
- `installer/reports/installer-package-cleanroom-20260509T193159Z-9945e706/installer-package-cleanroom.json`
  records macOS archive extraction plus readiness/plan proof. It was executed
  from this Windows/WSL host, so it is not a full macOS runtime proof.
- The planner rejects `--dry-run` when it is combined with a cleanroom proof or
  gate because those modes build/start/teardown Docker resources and write
  evidence.
- `installer/windows/plan-installer.ps1` wraps the planner for Windows.
- `installer/macos/plan-installer.sh` wraps the planner for macOS.
- `installer/linux/plan-installer.sh` wraps the planner for Linux.
- `scripts/verify-installer-plan.py` verifies the manifest, planner, launcher
  wrappers, selector model, readiness states, artifact/version resolver,
  service/profile config, health-check plan, executor preflight, and execution
  gate.
- `scripts/plan-installer.py --write-report` writes validated dry-run plan,
  readiness, approval-gate, artifact/version, service-config, and health-check
  reports under `installer/reports/{run_id}`.

## Current Safety Boundary

The dry-run planner surfaces remain non-mutating. The generated package
lifecycle is intentionally mutating when install, repair, uninstall, or gate is
selected.

Allowed now:

- print a dry-run install plan
- show the profile and module selector model
- show readiness/error states with fix steps
- inspect dependencies in read-only dry-run mode
- request execution and receive a blocked/non-mutating gate response
- render the future executor state machine in dry-run mode
- render the future evidence/report schema in dry-run mode
- resolve local artifact/version metadata in read-only dry-run mode
- render planned compose/profile service configuration
- render planned health-check obligations
- render blocked executor preflight output
- write non-mutating dry-run evidence reports for plan, readiness, approval
  gate, artifact/version, service-config, and health-check output
- generate a minimal Townlight Core install kit inside the repo
- generate cross-platform profile packages inside the repo
- generate distributable release archives and native wrapper manifests
- run the `clerk-core` package lifecycle from a self-contained archive
- run the generated minimal Windows kit after explicit approval
- run a disposable Linux cleanroom proof for the generated minimal kit
- run a disposable TownlightRecords service/UI cleanroom proof with Playwright
- run the clerk-core cleanroom gate for concise pass/fail installer evidence

Not allowed yet:

- install dependencies
- silently install privileged dependencies
- package native installers
- change module product code
- run additional generated install scripts without explicit operator approval

## Verified Commands

Focused examples:

```powershell
python scripts\plan-installer.py --profile clerk-core --dry-run
python scripts\plan-installer.py --profile full-suite --dry-run
python scripts\plan-installer.py --profile clerk-core --menu-style guided --show-menu --dry-run
python scripts\plan-installer.py --profile clerk-core --show-readiness --readiness-scenario missing-docker --dry-run
python scripts\plan-installer.py --profile clerk-core --show-readiness --detect-host --dry-run
python scripts\plan-installer.py --profile minimal --execute --dry-run
python scripts\plan-installer.py --profile minimal --show-executor-design --dry-run
python scripts\plan-installer.py --profile minimal --show-evidence-schema --dry-run
python scripts\plan-installer.py --profile clerk-core --dry-run --write-report
python scripts\plan-installer.py --profile clerk-core --show-readiness --readiness-scenario missing-docker --dry-run --write-report
python scripts\plan-installer.py --profile minimal --execute --dry-run --write-report
python scripts\plan-installer.py --profile clerk-core --show-artifacts --dry-run --write-report
python scripts\plan-installer.py --profile clerk-core --show-profile-config --dry-run --write-report
python scripts\plan-installer.py --profile clerk-core --show-health-checks --dry-run --write-report
python scripts\plan-installer.py --profile clerk-core --show-preflight --dry-run
python scripts\plan-installer.py --profile minimal --generate-install-kit
python scripts\plan-installer.py --profile clerk-core --generate-profile-package
python scripts\plan-installer.py --profile clerk-core --generate-release-artifacts --installer-version 0.1.0
powershell -NoProfile -ExecutionPolicy Bypass -File installer\generated\minimal\install-townlight_core.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File installer\generated\minimal\verify-townlight_core.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File installer\generated\minimal\reset-townlight_core.ps1
python scripts\run-minimal-cleanroom.py --run-id manual-minimal-linux-cleanroom-2
python scripts\run-townlight_records-cleanroom.py --run-id manual-townlight_records-service-cleanroom-4
python scripts\plan-installer.py --profile clerk-core --run-cleanroom-proof --run-id manual-clerk-core-integrated-proof
python scripts\plan-installer.py --profile clerk-core --run-cleanroom-gate --run-id verify-clerk-core-gate
python scripts\run-installer-package-cleanroom.py
```

Platform launcher examples:

```powershell
installer\windows\plan-installer.ps1 -Profile clerk-core
installer\windows\plan-installer.ps1 -ShowMenu -MenuStyle guided
installer\windows\plan-installer.ps1 -ShowReadiness -ReadinessScenario missing-docker
installer\windows\plan-installer.ps1 -ShowReadiness -DetectHost
installer\windows\plan-installer.ps1 -Execute
installer\windows\plan-installer.ps1 -ShowExecutorDesign
installer\windows\plan-installer.ps1 -ShowEvidenceSchema
installer\windows\plan-installer.ps1 -Profile minimal -WriteReport
installer\windows\plan-installer.ps1 -Profile clerk-core -ShowArtifacts -WriteReport
installer\windows\plan-installer.ps1 -Profile clerk-core -ShowProfileConfig -WriteReport
installer\windows\plan-installer.ps1 -Profile clerk-core -ShowHealthChecks -WriteReport
installer\windows\plan-installer.ps1 -Profile clerk-core -ShowPreflight
installer\windows\plan-installer.ps1 -Profile minimal -GenerateInstallKit
installer\windows\plan-installer.ps1 -Profile clerk-core -GenerateProfilePackage
installer\windows\plan-installer.ps1 -Profile clerk-core -GenerateReleaseArtifacts
```

```bash
bash installer/macos/plan-installer.sh --profile clerk-core
bash installer/macos/plan-installer.sh --show-menu --menu-style guided
bash installer/macos/plan-installer.sh --show-readiness --readiness-scenario missing-docker
bash installer/macos/plan-installer.sh --show-readiness --detect-host
bash installer/macos/plan-installer.sh --execute
bash installer/macos/plan-installer.sh --show-executor-design
bash installer/macos/plan-installer.sh --show-evidence-schema
bash installer/macos/plan-installer.sh --profile minimal --write-report
bash installer/macos/plan-installer.sh --profile clerk-core --show-artifacts --write-report
bash installer/macos/plan-installer.sh --profile clerk-core --show-profile-config --write-report
bash installer/macos/plan-installer.sh --profile clerk-core --show-health-checks --write-report
bash installer/macos/plan-installer.sh --profile clerk-core --show-preflight
bash installer/macos/plan-installer.sh --profile minimal --generate-install-kit
bash installer/macos/plan-installer.sh --profile clerk-core --generate-profile-package
bash installer/macos/plan-installer.sh --profile clerk-core --generate-release-artifacts
bash installer/linux/plan-installer.sh --profile clerk-core
bash installer/linux/plan-installer.sh --show-menu --menu-style guided
bash installer/linux/plan-installer.sh --show-readiness --readiness-scenario missing-docker
bash installer/linux/plan-installer.sh --show-readiness --detect-host
bash installer/linux/plan-installer.sh --execute
bash installer/linux/plan-installer.sh --show-executor-design
bash installer/linux/plan-installer.sh --show-evidence-schema
bash installer/linux/plan-installer.sh --profile minimal --write-report
bash installer/linux/plan-installer.sh --profile clerk-core --show-artifacts --write-report
bash installer/linux/plan-installer.sh --profile clerk-core --show-profile-config --write-report
bash installer/linux/plan-installer.sh --profile clerk-core --show-health-checks --write-report
bash installer/linux/plan-installer.sh --profile clerk-core --show-preflight
bash installer/linux/plan-installer.sh --profile minimal --generate-install-kit
bash installer/linux/plan-installer.sh --profile clerk-core --generate-profile-package
bash installer/linux/plan-installer.sh --profile clerk-core --generate-release-artifacts
```

Verification stack passed:

```powershell
python scripts\verify-installer-plan.py
bash scripts/verify-docs.sh
python scripts\verify-deployment-profile.py --static-only
python scripts\verify-suite-state.py
```

Package cleanroom lifecycle passed:

```powershell
python scripts\run-installer-package-cleanroom.py
python scripts\run-installer-package-cleanroom.py --archive installer\dist\Townlight-clerk-core-windows-0.1.0.zip
python scripts\run-installer-package-cleanroom.py --archive installer\dist\Townlight-clerk-core-linux-0.1.0.tar.gz
python scripts\run-installer-package-cleanroom.py --archive installer\dist\Townlight-clerk-core-macos-0.1.0.tar.gz --skip-install
```

Evidence:

- Windows run id: `installer-package-cleanroom-20260509T193309Z-b90bb614`
- Linux run id: `installer-package-cleanroom-20260509T193433Z-4582af7c`
- macOS archive/readiness/plan run id:
  `installer-package-cleanroom-20260509T193159Z-9945e706`
- Windows and Linux lifecycle: readiness, plan, install, repair, verify,
  uninstall
- Live endpoints verified:
  `http://127.0.0.1:18000/health`,
  `http://127.0.0.1:18080/`,
  `http://127.0.0.1:18776/health`,
  `http://127.0.0.1:18081/`
- Remaining caveat: full macOS install/repair/verify/uninstall still requires
  a macOS host or VM. This Windows host does not provide a macOS runtime.

Control-plane eval stack passed:

```powershell
python .agent-workflows\evals\run_all.py
```

Hosted cleanroom workflow:

```text
.github/workflows/installer-cleanroom.yml
```

The hosted workflow runs:

- Windows archive extraction/readiness/plan.
- macOS archive extraction/readiness/plan through the macOS package launcher
  on hosted Linux, not macOS runtime.
- Linux archive extraction/readiness/plan.
- Linux archive install/repair/verify/uninstall.

It does not replace real Windows and macOS VM lifecycle certification because
the GitHub-hosted Windows and macOS runners do not provide the same local Docker
Desktop baseline as an operator machine.

## Next Recommended Slice

Recommended next slice: add real Windows and macOS VM lifecycle certification
for the distributable package archives, then record those evidence paths beside
the existing Linux hosted lifecycle evidence.

Why: hosted Linux lifecycle automation is now covered by CI, but Windows and
macOS still need operator-like VM proof before the installer target can move
from YELLOW to GREEN.

Stop before:

- adding a mutating executor implementation
- installing baseline dependencies
- starting Docker containers
- changing Townlight Core or module code
- packaging native installer binaries
