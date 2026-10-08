# CivicSuite Installer Contract

## Current Townlight Records candidate

Townlight Records 1.1.0-beta.2 (rc.3) uses the signed Windows MSI/EXE release
path described in [RELEASING.md](../RELEASING.md) and
[USER-MANUAL.md](../USER-MANUAL.md). Fresh setup installs Core, Records,
Notice, and Access. MSI metadata is `1.1.0-2` / ProductVersion `1.1.0.2`.
The older contract below is historical, not the current installation guide.
Use only the exact installer with completed signed acceptance evidence after
Scott authorizes publication; earlier beta.2 drafts are not accepted releases.

Status: Legacy Docker/browser planner and beta package history. The Windows
Local 1.0 clerk path now lives in `desktop/` as the Tauri/WebView2 app and
portable-native runtime contract.

This directory keeps the older suite-level installer target, planner, evidence,
and historical clerk-core beta package work. It remains useful as a design
contract, not implementation for the Windows Local 1.0 installer. It does not
define the non-technical city clerk install path, and it must not be read as a
Docker or WSL requirement for the Windows desktop app.

For the current Windows Local 1.0 path, use `desktop/`: it owns the unsigned
beta installer notice, SmartScreen explanation, first-run wizard, module
manager, local runtime payload contract, Gemma model readiness, health, backup,
restore, repair, and uninstall surfaces. That path is explicitly no Docker, no
WSL, and no terminal for normal city staff use.

The original installer work began as a design contract, not implementation. The
historical beta includes a `clerk-core` lifecycle runner that can be packaged,
extracted, installed, verified, repaired, and uninstalled from a clean bundle
using Docker. That legacy runner is not the Windows Local 1.0 end-user path.

## Required Outcome

The legacy suite installer planner records the older Docker/browser target:

- Linux, with Ubuntu LTS as the first proof target.
- Windows 10/11 through a wrapper around Docker Desktop and the same containerized services. Lifecycle certification requires a matching Windows host or VM with Docker Desktop running.
- macOS 13 or newer through a wrapper around Docker Desktop; full matching-host lifecycle evidence is still pending and requires a real Darwin/macOS host or VM.

From a zero-baseline machine, the installer must:

1. Detect the host operating system and hardware capacity.
2. Detect, install, or guide the setup of baseline software.
3. Install and configure CivicCore as the shared foundation.
4. Present a menu-style module selector.
5. Install and configure selected modules.
6. Bring the selected profile to a working local state.
7. Record repeatable proof for each supported operating system.

Per-module installers do not satisfy this contract.

## Baseline Dependencies

The installer must treat these as explicit baseline checks:

- Docker Engine on Linux, or Docker Desktop on Windows/macOS wrapper platforms.
- WSL 2 and Virtual Machine Platform on Windows when Docker Desktop requires it.
- Sufficient RAM and disk space for the chosen profile.
- Local container runtime availability.
- Optional Ollama availability for local LLM profiles.
- Network access only when fetching release artifacts or optional models.

The installer may guide the user to install privileged dependencies when silent
installation would be unsafe, unsupported, or outside the operator's control.

## CivicCore First

Every install profile starts with CivicCore. The installer must verify the
selected module's CivicCore compatibility before installing that module.

No module may depend on planned CivicCore behavior unless the behavior is
released and recorded in the compatibility matrix.

## Module Selection

The module selector must be driven by `modules.json`, not hard-coded UI labels.
Each module entry records:

- repository name
- display name
- tier
- current installer status
- CivicCore requirement
- selectable flag
- dependencies
- default port, when relevant
- proof obligations

The dry-run menu model exposes the same source data as JSON:

```powershell
python scripts\plan-installer.py --profile clerk-core --menu-style guided --show-menu --dry-run
```

The menu model must include profile choices, selectable modules, and the
selected menu style without changing host state.

## Suite Launcher Runtime

The first city-core static launcher lives at
`installer/runtime/suite-launcher`. It is a static, self-contained runtime with
Staff, Resident, and IT-Admin surfaces, local tiles for CivicRecords AI,
CivicClerk, and CivicCode, a one-click audit drawer, and a Ctrl-K/Cmd-K command
palette. It uses the prototype paper/navy/gold tokens and local font fallback
stack only; it does not fetch network fonts or mutate host state.

The launcher includes QA fixtures for loading, success, empty, error, and
partial states through `?state=loading|success|empty|error|partial`. Runtime
module URLs can be overridden by defining `window.CIVICSUITE_LAUNCHER_CONFIG`
before `src/app.js` loads.

## Menu Styles

Initial menu styles:

- `guided`: step-by-step setup with recommended defaults.
- `department`: module choices grouped by municipal workflow area.
- `advanced`: compact controls for technical operators.

## Profiles

Initial profiles:

- `minimal`: CivicCore only.
- `clerk-core`: CivicCore, CivicRecords AI, CivicClerk.
- `land-use`: CivicCore, CivicCode, CivicZone, CivicPlan, CivicPermit.
- `full-suite`: every tracked CivicSuite repo after CivicCore dependency ordering.
- `custom`: operator-selected modules with dependency validation.

## Dry-Run Launchers

The first platform entrypoints are non-mutating launcher wrappers around the
shared planner:

- Windows: `installer/windows/plan-installer.ps1`
- macOS: `installer/macos/plan-installer.sh`
- Linux: `installer/linux/plan-installer.sh`

Each launcher forces `--dry-run`, prints the selected profile, and delegates to
`scripts/plan-installer.py`. These launchers are not allowed to install
dependencies, start services, or change host state.

Each launcher also supports the dry-run selector surface:

- Windows: `installer/windows/plan-installer.ps1 -ShowMenu -MenuStyle guided`
- macOS: `bash installer/macos/plan-installer.sh --show-menu --menu-style guided`
- Linux: `bash installer/linux/plan-installer.sh --show-menu --menu-style guided`

## Readiness And Error States

The dry-run planner must render readiness states before any real install
behavior exists:

```powershell
python scripts\plan-installer.py --profile clerk-core --show-readiness --readiness-scenario missing-docker --dry-run
```

It can also inspect the host in read-only mode:

```powershell
python scripts\plan-installer.py --profile clerk-core --show-readiness --detect-host --dry-run
```

Host detection may check executable presence, disk space, memory, Docker daemon
status, WSL status, and optional Ollama presence. It must not install packages,
start services, start containers, or change host configuration.

Initial readiness scenarios:

- `nominal`: all dry-run checks pass.
- `missing-docker`: container runtime is unavailable.
- `windows-missing-wsl`: Windows WSL 2 prerequisites are unavailable.
- `low-resources`: the selected profile may not have enough disk or memory.
- `ollama-missing`: local LLM features may be unavailable.
- `civiccore-mismatch`: selected modules require a different CivicCore version.

Every failed readiness check must include a clear message, concrete fix steps,
and a next action. "Something failed" is not an acceptable installer state.

## Execution Gate

Install execution is blocked by default. The current planner can render the
execution gate, but it cannot install software or mutate the host:

```powershell
python scripts\plan-installer.py --profile minimal --execute --dry-run
```

The gate returns `gate_status: blocked`, `execution_status: not_implemented`,
and `mutates_host: false`. Even with the explicit future approval token
`I_UNDERSTAND_THIS_MUTATES_HOST`, this slice must still report that no mutating
executor exists.

Future install execution may only be added in a separate reviewed slice after
the dry-run plan, readiness state, and approval boundary are verified.

## Executor State Machine

The future executor is currently a design-only state machine:

```powershell
python scripts\plan-installer.py --profile minimal --show-executor-design --dry-run
```

Required phases:

- `preflight`: validate plan, readiness, and evidence paths.
- `approval`: require explicit operator approval before mutation.
- `execute`: future mutating install phase for CivicCore and selected modules.
- `verify`: health, restart, and failure-copy verification.
- `repair`: future mutating repair phase.
- `rollback`: future mutating rollback or uninstall phase.

Only `execute`, `repair`, and `rollback` may ever mutate host state, and they
remain design-only until a separate reviewed implementation slice exists.

## Evidence Reports

The executor evidence schema is dry-run only:

```powershell
python scripts\plan-installer.py --profile minimal --show-evidence-schema --dry-run
```

The schema defines the report files future installer phases must produce under
`installer/reports/{run_id}`. It covers dry-run plans, readiness reports,
approval records, install logs, artifact versions, service config, health
checks, restart checks, failure-copy checks, repair logs, post-repair checks,
rollback logs, and remaining-state reports.

The current non-mutating report writer can write dry-run plan, readiness,
approval-gate, artifact/version, service-config, and health-check evidence:

```powershell
python scripts\plan-installer.py --profile clerk-core --dry-run --write-report
python scripts\plan-installer.py --profile clerk-core --show-readiness --readiness-scenario missing-docker --dry-run --write-report
python scripts\plan-installer.py --profile minimal --execute --dry-run --write-report
python scripts\plan-installer.py --profile clerk-core --show-artifacts --dry-run --write-report
python scripts\plan-installer.py --profile clerk-core --show-profile-config --dry-run --write-report
python scripts\plan-installer.py --profile clerk-core --show-health-checks --dry-run --write-report
```

The report writer validates required fields, writes under
`installer/reports/{run_id}`, records `mutates_host: false`, and rejects
secret-shaped or environment-dump-shaped fields. It does not write install logs,
repair logs, rollback logs, remaining-state reports, or any host-mutating
executor evidence.

## Profile Packages

The installer can now generate the first operator-facing profile package:

```powershell
python scripts\plan-installer.py --profile clerk-core --generate-profile-package
```

The generated `clerk-core` package entrypoints support:

- `readiness`: detect Docker, host resources, optional Ollama, and compatibility
  without mutating host state.
- `plan`: print the selected profile and module order without mutating host
  state.
- `install`: build and start the selected bundled module sources. The default
  `clerk-core` selection starts CivicRecords AI and CivicClerk.
- `verify`: check CivicRecords API, CivicRecords web, CivicClerk API, and
  CivicClerk web endpoints.
- `verify --workflow-proof`: run mutating starter-set workflow proof checks
  against the selected live modules. Use with `--staff-mode bearer` during
  install or repair so CivicClerk staff writes stay protected.
- `repair`: preserve generated `.env` secrets, rebuild/restart the services,
  and verify health again.
- `backup`: write per-module PostgreSQL custom dumps and a backup manifest
  under the installer runtime directory.
- `restore`: verify the latest backup by restoring each module dump into a
  temporary PostgreSQL restore-probe database, then remove the probe database.
- `uninstall`: remove the profile's Docker containers and volumes.
- `gate`: run the existing isolated cleanroom service/UI gate.

Lifecycle runs derive Docker Compose project names and host ports from the
package run id by default. Operators can override that isolation with
`--run-id`, `--port-offset`, explicit `--records-api-port`,
`--records-web-port`, `--clerk-api-port`, `--clerk-web-port`, or
`--compose-project-suffix` when invoking `scripts/run-clerk-core-installer.py`
directly. Reports record the resolved ports and Compose project names used for
health checks.
For CivicRecords AI, the installer writes the resolved API and web ports into
the copied `.env` as `CIVICRECORDS_API_PORT` and `CIVICRECORDS_WEB_PORT` before
Docker Compose starts, so the base Compose file and suite override both bind to
the isolated runtime ports instead of the module defaults.

The package cleanroom runner proves the distributable archive from an extracted
copy:

```powershell
python scripts\run-installer-package-cleanroom.py
python scripts\run-installer-package-cleanroom.py --archive installer\dist\CivicSuite-clerk-core-windows-0.1.0.zip
python scripts\run-installer-package-cleanroom.py --archive installer\dist\CivicSuite-clerk-core-windows-0.1.0.zip --staff-mode bearer --workflow-proof
python scripts\run-installer-package-cleanroom.py --archive installer\dist\CivicSuite-clerk-core-macos-0.1.0.tar.gz --skip-install
```

Those commands extract the release archive, run the platform launcher from the
extracted bundle, remove the extracted payload, and write evidence under
`installer/reports/{run_id}`. Each package report records an
`evidence_classification`: `archive_readiness_only`,
`matching_host_lifecycle`, `matching_host_lifecycle_failed`,
`dependency_gate_blocked`, `host_platform_mismatch`, or `unsupported_lifecycle`. Full
install/repair/verify/backup/restore/uninstall proof is certification evidence
only when the archive is run on a matching host or VM. Windows lifecycle
evidence now exists from a Windows 11 + WSL 2 Docker Desktop host; macOS
lifecycle evidence must come from a Darwin/macOS Docker Desktop host. macOS
package runs from Linux or Windows hosts are archive/readiness evidence only.

`--workflow-proof` is intentionally mutating. Use it with
`--staff-mode bearer` when the extracted package should create real
CivicRecords AI request/search/review/response proof records and CivicClerk
agenda/packet/minutes/vote/notice/archive proof records during install,
repair, and verify. The proof keeps AI-generated or AI-assisted output in
draft/human-review states and does not claim autonomous release, denial,
redaction, legal determination, or live cross-module workflow-record exchange.

This writes Windows, macOS, and Linux package directories under
`installer/generated/packages/{profile}`. Each package contains:

- `README.md`: first-run operator instructions for readiness, plan review, and
  the cleanroom gate.
- `install-plan.json`: the resolved profile plan from `modules.json`.
- `start-civicsuite-installer.ps1` or `start-civicsuite-installer.sh`: the
  platform entrypoint.

Readiness and plan modes remain non-mutating. Gate mode is explicitly mutating:
it may build/start/teardown Docker resources and write evidence under
`installer/reports`. These profile packages are not native `.exe`, `.pkg`,
`.deb`, or `.rpm` installers yet; they are the reviewed operator UX package that
native packaging should wrap next.

## Release Artifacts

The installer can generate the full distributable artifact set for a profile:

```powershell
python scripts\plan-installer.py --profile clerk-core --generate-release-artifacts --installer-version 0.1.0
```

This writes operator packages under `installer/generated/packages`, native
wrapper manifests under `installer/generated/native`, platform archives under
`installer/dist`, a `SHA256SUMS.txt` file, and a release manifest describing the
profile, modules, platforms, archive paths, and checksums.

The generated native wrapper manifests are:

- Windows: Inno Setup `.iss`
- macOS: `pkgbuild` / `productbuild` distribution files
- Linux: Debian package metadata

The generator does not build or sign native OS installers by itself. It produces
verified payloads and wrapper manifests that can be built by the platform
packaging tools in release infrastructure.

## unsigned OSS beta Distribution

Current CivicSuite installer artifacts are distributable but unsigned.
CivicSuite is an open-source beta project, and signing certificates are not
available yet. This means operating systems may show trust warnings even when
the artifact is legitimate.

Expected warnings:

- Windows: SmartScreen or Unknown Publisher.
- macOS: unidentified developer or package cannot be checked.
- Linux: local package/archive is unsigned or not from a configured repository.

Current trust path:

1. Download the installer artifact from the project release source.
2. Verify the SHA256 checksum against `installer/dist/*SHA256SUMS.txt`.
3. Confirm the checksum matches before running anything.
4. Proceed through the OS warning only after the checksum matches.

Windows users should choose **More info** and then **Run anyway** only after the
checksum matches the published SHA256 value and the artifact came from the
official CivicSuite release source. This warning is expected for the public
free/open-source beta. There is no committed signed-installer path for the
public beta; SHA256 plus official-source verification is the trust path.

## Artifact, Profile, And Health Planning

Before host mutation exists, the installer can render the next executor inputs
as dry-run JSON:

```powershell
python scripts\plan-installer.py --profile clerk-core --show-artifacts --dry-run
python scripts\plan-installer.py --profile clerk-core --show-profile-config --dry-run
python scripts\plan-installer.py --profile clerk-core --show-health-checks --dry-run
python scripts\plan-installer.py --profile clerk-core --show-preflight --dry-run
```

These commands expose the artifact/version resolver, planned local artifact
metadata, compose/profile service configuration, health-check obligations, and
executor preflight blockers without installing dependencies, starting
containers, or changing host state.

The current preflight surface is intentionally blocked with
`executor_not_implemented`. It exists to show what must be true before a future
mutating executor can be trusted.

## Minimal CivicCore Install Kit

The first real generated installer artifact is the minimal CivicCore install
kit:

```powershell
python scripts\plan-installer.py --profile minimal --generate-install-kit
```

This command writes files under `installer/generated/minimal`. The generator
does not mutate host state, install dependencies, start services, or start
containers. The generated platform scripts are reviewed artifacts that will
mutate only when an operator explicitly runs them.

The generated install kit includes:

- `README.md`
- `requirements.txt`
- `civiccore-install-plan.json`
- `install-civiccore.ps1`
- `install-civiccore.sh`
- `verify-civiccore.ps1`
- `verify-civiccore.sh`
- `reset-civiccore.ps1`
- `reset-civiccore.sh`

The generated install scripts install CivicCore from the local wheel artifact
into a `.venv` inside the generated kit. They do not install Docker, WSL,
Python, or any baseline system dependency.

The generated reset scripts remove only the kit-local `.venv` so the minimal
install can be repeated without deleting source code, reports, or generated
plan files.

## Minimal Cleanroom Proof

The minimal CivicCore kit can be exercised in a disposable Linux cleanroom
container:

```powershell
python scripts\run-minimal-cleanroom.py --run-id manual-minimal-linux-cleanroom-2
```

The runner copies the generated kit and CivicCore wheel into
`installer/reports/{run_id}/cleanroom`, rewrites the Linux artifact path for the
container mount, runs reset/install/verify inside `python:3.12-slim`, and writes
`cleanroom-proof.json`.

This cleanroom proof mutates the disposable container and the evidence directory
only. It does not install host dependencies, start host services, or change
module source code.

## CivicRecords Service Cleanroom Proof

The first service-profile cleanroom runner exercises CivicRecords AI from a
copied source tree:

```powershell
python scripts\run-civicrecords-cleanroom.py --run-id manual-civicrecords-service-cleanroom-4
```

The runner copies `civicrecords-ai` into
`installer/reports/{run_id}/source`, writes a clean `.env`, adds isolated host
ports, builds the API and frontend images, starts Postgres, Redis, Ollama, API,
and frontend with a unique Compose project name, checks API/frontend health,
runs a live Playwright desktop/mobile smoke, saves screenshots, and tears the
stack down with volumes removed.

Passing evidence for the current run lives at:

- `installer/reports/manual-civicrecords-service-cleanroom-4/service-ui-proof.json`
- `installer/reports/manual-civicrecords-service-cleanroom-4/cleanroom-ui-desktop.png`
- `installer/reports/manual-civicrecords-service-cleanroom-4/cleanroom-ui-mobile.png`

The suite installer exposes this proof as the `clerk-core` cleanroom proof:

```powershell
python scripts\plan-installer.py --profile clerk-core --run-cleanroom-proof --run-id manual-clerk-core-integrated-proof
```

For operator use, prefer the named cleanroom gate:

```powershell
python scripts\plan-installer.py --profile clerk-core --run-cleanroom-gate --run-id verify-clerk-core-gate
```

The gate runs the same proof but returns concise pass/fail output for API
health, frontend health, and Playwright desktop/mobile UI verification. This
mode is intentionally mutating. It creates Docker images, containers, networks,
and volumes for the cleanroom run, writes evidence under
`installer/reports/{run_id}`, and tears the Compose stack down with volumes
removed before returning. The planner rejects `--dry-run` when combined with
`--run-cleanroom-proof` or `--run-cleanroom-gate` so the operator cannot mistake
the Docker proof for a read-only plan.

## Proof Requirements

Each operating system must eventually have evidence for:

- dependency detection
- CivicCore install
- module selection
- selected module installation
- service start
- health checks
- restart behavior
- uninstall or repair behavior
- failure recovery and actionable error copy
- readiness fix steps before real installation
- execution gate proof before host mutation
- dependency detection evidence without host mutation
- executor state machine evidence before implementation
- evidence schema before report writers
- report writer evidence before host mutation
- artifact/version evidence before host mutation
- service/profile config evidence before host mutation
- health-check plan evidence before host mutation
- executor preflight evidence before host mutation
- minimal CivicCore install kit evidence before module installers

## Implementation Boundary

This design slice does not implement a native installer binary. It creates the
contract that the implementation must satisfy.

The dry-run installer planner reads `modules.json`, resolves profile
dependencies, and prints the exact planned install actions without changing the
host.
