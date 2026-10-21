<a id="civicsuite-suite-installer-plan"></a>

# Townlight Suite Installer Plan

Status: design contract plus first working clerk-core lifecycle; city-core profile is beta-ready truth-reconciled with current Linux/Windows matching-host lifecycle evidence, first-run browser QA, green PR CI, and audit-full evidence in the active run record.

This document defines the first suite-level installer target. The current
umbrella repo has deployment documentation and a bounded demo compose profile.
The installer work began as a design contract, not implementation; the current
beta now adds a real `clerk-core` package lifecycle for the first distributable
profile. The current city-core work extends that surface to Townlight Core,
Townlight Records, Townlight Meetings, and Townlight Code without changing published module
release artifacts.

## Why This Exists

Module-specific installers and scripts are useful, but they do not answer the
operator question: "How do I install Townlight from nothing, choose the modules
I want, and end with a working local deployment?"

The suite installer is therefore its own delivery surface.

## Non-Goals For This Slice

- No native installer binary is built in this slice.
- No module runtime code changes are included.
- No dependency installation is performed by this slice.
- No service, container, or browser is started by this slice.
- No module release status is promoted by this slice.
- No generated install script is executed by this slice.

## Required User Experience

The installer must guide an operator through:

1. Welcome and license posture.
2. Operating system and hardware checks.
3. Baseline dependency checks.
4. Townlight Core foundation setup.
5. Profile selection.
6. Menu style selection.
7. Module selector flow for custom installs.
8. Configuration summary.
9. Install or repair.
10. Health check results.
11. Clear next steps.

The module selector is the installer UI/control step that turns the manifest
into an operator-facing menu. The dry-run selector model must expose the profile
choices, selectable modules, and selected menu style before any install behavior
exists.

Module v1.0.0 release gates now depend on this selector. A Townlight module is
not a complete v1.0.0 product unless it is represented in the
installer/module-selection path and the planner verifies that the selected
module can be resolved with its dependencies, Townlight Core requirement, and proof
requirements. If macOS remains beta/YELLOW, Windows/Linux installer integration
evidence plus an explicit macOS limitation note is acceptable until the macOS
installer lifecycle gate is solved on a real Darwin host.

Every warning or failure must say what happened and what the operator should do
next. Dry-run readiness output must include concrete fix steps before any real
install behavior is allowed.

Read-only dependency detection may feed readiness output. It may inspect Docker,
WSL 2, disk, memory, platform, and optional Ollama, but it must not install,
start, repair, or configure anything.

Install execution must be protected by an explicit execution gate. The current
gate is dry-run only: it may acknowledge a request to execute, but it must return
`mutates_host: false` and `execution_status: not_implemented`.

The executor state machine must be designed and verified before implementation.
The dry-run design surface must include preflight, approval, execute, verify,
repair, and rollback/uninstall phases, with evidence requirements and blockers
for each phase.

The installer must also define an evidence schema and a report writer before
host mutation exists. The dry-run schema must identify report paths, required
fields, redaction rules, and validation rules for each executor phase. The
initial report writer may write only non-mutating dry-run plan, readiness,
approval-gate, artifact/version, service-config, and health-check reports.

Before a mutating executor exists, the installer must also expose the executor's
planned inputs as dry-run surfaces: artifact/version resolver output, profile config,
service configuration, health-check planning, and executor preflight.
These surfaces are inputs to future install work, not permission to install,
start, repair, or configure anything.

The first generated install kit is intentionally narrower than the full suite:
`python scripts/plan-installer.py --profile minimal --generate-install-kit`
writes a Townlight Core-only kit under `installer/generated/minimal`. The generator
itself does not mutate host state. The generated scripts are real install
artifacts, but they mutate only when an operator explicitly runs them.

The first profile package generator is:
`python scripts/plan-installer.py --profile clerk-core --generate-profile-package`.
It writes Windows, macOS, and Linux package directories under
`installer/generated/packages/{profile}` with a platform README, resolved
`install-plan.json`, and a `start-civicsuite-installer` entrypoint. Readiness
and plan modes are non-mutating. Gate mode is intentionally mutating and runs
the current cleanroom gate. These profile packages are the operator UX package
that future native installers should wrap; they are not native OS installers
yet.

The generated package lifecycle now includes a real `clerk-core` installer
runner:
`python scripts/run-clerk-core-installer.py install|verify|repair|uninstall`.
The platform package launchers call that runner for lifecycle modes. Install
builds and starts Townlight Records plus Townlight Meetings from bundled source trees,
verify checks four live endpoints, repair preserves generated `.env` secrets
and rebuilds/restarts services, and uninstall tears down the profile containers
and volumes. The runner derives Docker Compose project names and host ports from
the run id, with CLI overrides for explicit ports and project suffixes, and
records those resolved isolation values in lifecycle reports.

The release artifacts generator is:
`python scripts/plan-installer.py --profile clerk-core --generate-release-artifacts --installer-version 0.1.0`.
It writes self-contained platform archives under `installer/dist`, native
wrapper manifests under `installer/generated/native`, `SHA256SUMS.txt`, and a
release manifest.
The generated native manifests cover Windows Inno Setup, macOS pkgbuild /
productbuild, and Linux Debian metadata. Building native wrappers remains a
release-infrastructure step, not a hidden host mutation; public Townlight
installer artifacts remain intentionally unsigned.

Installer artifacts are distributable as unsigned OSS beta builds. Every
generated package and release manifest must state that Townlight is an
open-source public-use starter release with intentionally unsigned public
installers, that Windows/macOS/Linux trust warnings are expected, and that
SHA256 verification plus official-source verification is the current trust path
before proceeding through any OS warning.

The first cleanroom proof uses
`python scripts/run-minimal-cleanroom.py --run-id manual-minimal-linux-cleanroom-2`
to run the generated kit inside a disposable Linux container. That proof is not
a replacement for full Windows/macOS/Linux VM lifecycle evidence, but it is the
fastest repeatable clean baseline for the Townlight Core-only package layer.

The first service cleanroom proof uses
`python scripts/run-civicrecords-cleanroom.py --run-id manual-civicrecords-service-cleanroom-4`
to copy Townlight Records into an evidence workspace, start an isolated Docker
Compose project on high ports, verify API and frontend health, run live
Playwright desktop/mobile smoke checks, save screenshots, and tear the stack
down with volumes removed.

The suite installer owns that same proof through
`python scripts/plan-installer.py --profile clerk-core --run-cleanroom-proof`.
That command is intentionally mutating because it starts Docker services inside
an isolated Compose project and writes evidence.

The operator-facing command is the named cleanroom gate:
`python scripts/plan-installer.py --profile clerk-core --run-cleanroom-gate`.
It runs the same Docker proof and prints concise pass/fail output for API
health, frontend health, and Playwright desktop/mobile UI verification. The
planner rejects `--dry-run` with either cleanroom command because those paths
build/start/teardown Docker resources and write proof evidence.

The package-level cleanroom proof is:
`python scripts/run-installer-package-cleanroom.py`.
It extracts a release archive for the duration of the run, removes the extracted
bundle before evidence upload, runs readiness, plan, install, repair, verify,
and uninstall from the extracted bundle, and records pass/fail evidence. The
runner supports Windows, macOS, and Linux archives through the platform
launchers. Townlight's core runtime path is Linux/container-first; Windows and
macOS are wrapper platforms around that core. Each package report classifies the
evidence as archive/readiness, matching-host lifecycle, host-platform mismatch,
or unsupported lifecycle. Linux and Windows matching-host lifecycle proof are
the zero-baseline machine proof requirements for the Clerk-Core public-use gate.
Full macOS runtime proof still requires a macOS host or VM before any macOS
lifecycle certification claim.

The hosted package cleanroom workflow is:
`.github/workflows/installer-cleanroom.yml`.
It runs on demand and when installer paths change; the daily cron is
intentionally absent unless a future approved run adds it back. The workflow
uses concurrency and short artifact retention as cost controls. It proves
extracted archive readiness/plan for Windows, Linux, and macOS package
artifacts, then runs the full Linux package install/repair/verify/uninstall
lifecycle and uploads JSON installer evidence without the extracted bundle
payload. Windows matching-host lifecycle proof is recorded separately when a
Windows 11 + WSL 2 Docker Desktop run is executed and cited. macOS full
matching-host lifecycle evidence still requires a real operator-like macOS VM
because hosted CI does not provide the same Docker Desktop baseline.

## Supported Profiles

The initial profile set is defined in `installer/modules.json`:

- Minimal: Townlight Core only.
- Clerk Core: Townlight Core, Townlight Records, Townlight Meetings.
- City Core: Townlight Core, Townlight Records, Townlight Meetings, Townlight Code.
- Land Use: queued and disabled until Townlight Zoning, Townlight Planning, Townlight Permitting, and Townlight Inspections complete their own release turns.
- Full Suite: all 26 tracked Townlight repos, ordered by dependencies.
- Custom: operator-selected modules with dependency validation.

Demoted recovery-label selector integrations:

- Townlight Inspections: queued Tier 2 module; custom selection remains disabled until its release turn.
- Townlight Grants: custom selection resolves Townlight Core, Townlight Records, and
  Townlight Grants with Townlight Core 1.1.0 and recovery proof requirements.
- Townlight Procurement: custom selection resolves Townlight Core and Townlight Procurement with
  Townlight Core 1.1.0 and recovery proof requirements. Townlight Contracts remains a
  context relationship, not an installer dependency, until Townlight Contracts has
  its own productized release path.

Initial menu styles:

- Guided: recommended step-by-step setup.
- Department: municipal workflow grouping.
- Advanced: compact technical controls.

## Platform Strategy

The first implementation should favor one shared planning engine plus thin
platform launchers:

- Windows launcher: PowerShell first, native packaging later.
- macOS launcher: shell script first, signed app/pkg later.
- Linux launcher: shell script first, deb/rpm/AppImage later only if needed.

The shared planner should read `installer/modules.json`, resolve dependencies,
check host prerequisites, and produce a dry-run action plan before any install
step mutates the machine.

## Proof Gates

Before the installer can be called usable, each supported OS needs evidence for:

- fresh machine or clean VM baseline
- prerequisite detection
- Townlight Core install
- each profile's module resolution
- selected module install
- health checks
- restart
- repair
- uninstall or cleanup path
- actionable failure copy

## Relationship To Existing Assets

Existing useful inputs:

- `deploy/post-foundation-demo.compose.yml`
- `scripts/verify-deployment-profile.py`
- `scripts/verify-suite-state.py`
- `civicrecords-ai/installer/windows`

Those are inputs, not the suite installer. The suite installer must remain
umbrella-level and profile-driven.

## Next Implementation Slice

Extend the dry-run planner toward launchers:

- input: `installer/modules.json`
- command: `python scripts/plan-installer.py --profile clerk-core --dry-run`
- output: ordered actions, dependency graph, platform prerequisites, ports, and
  proof checklist
- mutation: none

The planner now covers the starter profiles and the full 26-repo suite profile.
The first platform launchers exist as dry-run wrappers only:

- `installer/windows/plan-installer.ps1 -Profile clerk-core`
- `installer/windows/plan-installer.ps1 -ShowMenu -MenuStyle guided`
- `installer/windows/plan-installer.ps1 -ShowReadiness -ReadinessScenario missing-docker`
- `installer/windows/plan-installer.ps1 -ShowReadiness -DetectHost`
- `installer/windows/plan-installer.ps1 -Execute`
- `installer/windows/plan-installer.ps1 -ShowExecutorDesign`
- `installer/windows/plan-installer.ps1 -ShowEvidenceSchema`
- `installer/windows/plan-installer.ps1 -ShowArtifacts`
- `installer/windows/plan-installer.ps1 -ShowProfileConfig`
- `installer/windows/plan-installer.ps1 -ShowHealthChecks`
- `installer/windows/plan-installer.ps1 -ShowPreflight`
- `installer/windows/plan-installer.ps1 -Profile minimal -GenerateInstallKit`
- `installer/windows/plan-installer.ps1 -Profile clerk-core -GenerateProfilePackage`
- `installer/windows/plan-installer.ps1 -Profile clerk-core -GenerateReleaseArtifacts`
- `bash installer/macos/plan-installer.sh --profile clerk-core`
- `bash installer/macos/plan-installer.sh --show-menu --menu-style guided`
- `bash installer/macos/plan-installer.sh --show-readiness --readiness-scenario missing-docker`
- `bash installer/macos/plan-installer.sh --show-readiness --detect-host`
- `bash installer/macos/plan-installer.sh --execute`
- `bash installer/macos/plan-installer.sh --show-executor-design`
- `bash installer/macos/plan-installer.sh --show-evidence-schema`
- `bash installer/macos/plan-installer.sh --show-artifacts`
- `bash installer/macos/plan-installer.sh --show-profile-config`
- `bash installer/macos/plan-installer.sh --show-health-checks`
- `bash installer/macos/plan-installer.sh --show-preflight`
- `bash installer/macos/plan-installer.sh --profile minimal --generate-install-kit`
- `bash installer/macos/plan-installer.sh --profile clerk-core --generate-profile-package`
- `bash installer/macos/plan-installer.sh --profile clerk-core --generate-release-artifacts`
- `bash installer/linux/plan-installer.sh --profile clerk-core`
- `bash installer/linux/plan-installer.sh --show-menu --menu-style guided`
- `bash installer/linux/plan-installer.sh --show-readiness --readiness-scenario missing-docker`
- `bash installer/linux/plan-installer.sh --show-readiness --detect-host`
- `bash installer/linux/plan-installer.sh --execute`
- `bash installer/linux/plan-installer.sh --show-executor-design`
- `bash installer/linux/plan-installer.sh --show-evidence-schema`
- `bash installer/linux/plan-installer.sh --show-artifacts`
- `bash installer/linux/plan-installer.sh --show-profile-config`
- `bash installer/linux/plan-installer.sh --show-health-checks`
- `bash installer/linux/plan-installer.sh --show-preflight`
- `bash installer/linux/plan-installer.sh --profile minimal --generate-install-kit`
- `bash installer/linux/plan-installer.sh --profile clerk-core --generate-profile-package`
- `bash installer/linux/plan-installer.sh --profile clerk-core --generate-release-artifacts`
- `python scripts/run-minimal-cleanroom.py --run-id manual-minimal-linux-cleanroom-2`
- `python scripts/run-civicrecords-cleanroom.py --run-id manual-civicrecords-service-cleanroom-4`
- `python scripts/plan-installer.py --profile clerk-core --run-cleanroom-proof --run-id manual-clerk-core-integrated-proof`
- `python scripts/plan-installer.py --profile clerk-core --run-cleanroom-gate --run-id verify-clerk-core-gate`

Only after these dry-run launchers remain verified should the workflow add real
install, repair, or packaging behavior.

The current launcher/report writer surface also supports:

- `python scripts\plan-installer.py --profile clerk-core --dry-run --write-report`
- `python scripts\plan-installer.py --profile clerk-core --show-readiness --readiness-scenario missing-docker --dry-run --write-report`
- `python scripts\plan-installer.py --profile minimal --execute --dry-run --write-report`
- `python scripts\plan-installer.py --profile clerk-core --show-artifacts --dry-run --write-report`
- `python scripts\plan-installer.py --profile clerk-core --show-profile-config --dry-run --write-report`
- `python scripts\plan-installer.py --profile clerk-core --show-health-checks --dry-run --write-report`
- `installer/windows/plan-installer.ps1 -Profile minimal -WriteReport`
- `installer/windows/plan-installer.ps1 -Profile clerk-core -ShowArtifacts -WriteReport`
- `installer/windows/plan-installer.ps1 -Profile clerk-core -ShowProfileConfig -WriteReport`
- `installer/windows/plan-installer.ps1 -Profile clerk-core -ShowHealthChecks -WriteReport`
- `bash installer/macos/plan-installer.sh --profile minimal --write-report`
- `bash installer/macos/plan-installer.sh --profile clerk-core --show-artifacts --write-report`
- `bash installer/macos/plan-installer.sh --profile clerk-core --show-profile-config --write-report`
- `bash installer/macos/plan-installer.sh --profile clerk-core --show-health-checks --write-report`
- `bash installer/linux/plan-installer.sh --profile minimal --write-report`
- `bash installer/linux/plan-installer.sh --profile clerk-core --show-artifacts --write-report`
- `bash installer/linux/plan-installer.sh --profile clerk-core --show-profile-config --write-report`
- `bash installer/linux/plan-installer.sh --profile clerk-core --show-health-checks --write-report`

Reports are written under `installer/reports/{run_id}` and validated before
write. The report writer rejects secret-shaped or environment-dump-shaped fields
and records `mutates_host: false`.

The first dry-run planner command is:

```powershell
python scripts\plan-installer.py --profile clerk-core --dry-run
```
