# CivicSuite Installer Package - macos

Profile: `city-core`
Menu style: `guided`

## Unsigned City-Core Beta Notice

This package is unsigned. CivicSuite city-core is an open-source beta installer package pending Linux and Windows matching-host lifecycle proof. Signing certificates are not used for this beta installer path. Windows may show SmartScreen or Unknown Publisher
warnings. macOS may show unidentified developer warnings. Linux package tools
may show an unsigned/local package warning.

This is expected for this beta distribution. Verify the SHA256 checksum from
`installer/dist` and confirm the artifact came from the official CivicSuite
GitHub release source or your IT team's verified source build before running
the package. If the checksum does not match, stop and download the artifact
again from the project release source.

## Platform Warning Guidance

- Windows: choose More info, confirm the app name/path, then choose Run anyway
  only after the checksum matches and the artifact source is verified.
- macOS: use System Settings > Privacy & Security to allow the package only
  after the checksum matches.
- Linux: install from the local archive/package only after verifying the
  checksum file.
- Docker Desktop or Docker Engine is running. If it is not running, the installer
  says how to start Docker before retrying.
- Required ports are free. If a port is occupied, rerun after closing the
  conflicting service or use the documented port-offset flags from the lifecycle
  runner.
- The host has at least 8 GB RAM and 60 GB free disk for the full city-core
  stack.
- Windows hosts need WSL2 and Docker Desktop. macOS hosts need Docker Desktop
  or a compatible Docker Engine and permission to run an unsigned local archive.

This package is the operator-facing installer entrypoint for the selected
platform. First-run mode offers Guided Setup for missing Docker/WSL
prerequisites where this run supports it, or Manual Prerequisite mode for
IT-managed machines. After prerequisites are present, it checks readiness,
renders the selected install plan, installs the city-core runtime from the
bundled module sources, verifies live service health, repairs by
rebuilding/restarting the stack, backs up/restores data, and uninstalls Docker
resources for the profile.

## First Run

1. For the non-technical operator path, run first-run:

   ```text
   bash ./start-civicsuite-installer.sh first-run
   ```

   The wizard asks for setup path, operator name, organization name, admin
   email, time zone, license acceptance, and then performs the smoke/readiness
    check before installing. After install, it prints staff dashboard URLs and
    the local credential-file path for the generated first administrator login.
    Open that file once, sign in, rotate the credential immediately, then store
    the rotated value in the municipal vault.

    City-core packages include the suite launcher runtime under
    `suite-launcher` and plan it for
    `http://127.0.0.1:18082/`. The installer runtime also
    creates `CIVICCORE_SUITE_SESSION_SECRET` on first install if it is missing, then shares
    that value with the selected staff services for the local session boundary.
    To serve the launcher after install or during QA, run:

    ```text
    bash ./start-civicsuite-installer.sh launcher
    ```

2. For IT/admin checks, run readiness:

   ```text
   bash ./start-civicsuite-installer.sh readiness
   ```

3. Review the dry-run plan:

   ```text
   bash ./start-civicsuite-installer.sh plan
   ```

4. Install the selected profile manually:

   ```text
   bash ./start-civicsuite-installer.sh install
   ```

   Available lifecycle modes: readiness, plan, install, verify, repair,
   backup, restore, and uninstall. Install, repair, backup, restore, and
   uninstall are mutating: they create or remove Docker resources and write
   installer reports.

## Selected Modules

- civiccore
- civicrecords-ai
- civicclerk
- civiccode
- civicnotice
- civicaccess

The default package selection installs this package profile on top of the
CivicCore base contract. Operators can choose one module or the whole profile:

```text
bash ./start-civicsuite-installer.sh plan --module civicrecords-ai
bash ./start-civicsuite-installer.sh plan --module civicclerk
bash ./start-civicsuite-installer.sh plan --module civiccode
bash ./start-civicsuite-installer.sh plan --module civicnotice
bash ./start-civicsuite-installer.sh install --module civicrecords-ai --module civicclerk --module civiccode --module civicnotice --module civicaccess
```

When a module is selected explicitly, plan/readiness use the same selection
and install/verify/repair/backup/restore/uninstall pass it through to the
lifecycle runner.

For a mutating workflow proof, use bearer staff mode so CivicClerk writes are
protected while the proof creates real starter-set test records:

```text
bash ./start-civicsuite-installer.sh install --staff-mode bearer --workflow-proof
```

## Boundary

- Readiness and plan modes are non-mutating.
- Install/repair mode is mutating: it builds and starts the selected modules
  from the bundled source tree.
- Verify mode checks live service endpoints. `--workflow-proof` /
  `-WorkflowProof` also creates live CivicRecords AI request/search/review/
  response proof records, CivicClerk agenda/packet/minutes/vote/notice/
  archive proof records, and CivicCode health/public lookup proof when
  CivicCode is selected.
- Backup mode writes per-module PostgreSQL custom dumps plus a manifest under
  the installer runtime backup directory.
- Restore mode verifies the latest backup by restoring each dump into a
  temporary PostgreSQL restore-probe database and removing that probe after the
  check completes.
- Uninstall mode removes the selected module Docker containers and volumes.
- Re-running install or repair over an existing install is expected to be
  idempotent: the installer keeps existing source trees and refreshes runtime
  configuration without deleting data. Use backup before any destructive reset.
- Rollback path: run backup, then uninstall; if you need a clean reset, remove
  the runtime directory only after confirming the backup manifest and dumps
  exist.
- Native host installer wrappers are generated but unsigned for this distribution.

The repo/source checkout cleanroom gate remains available outside this
distributable archive:

```text
python scripts/plan-installer.py --profile city-core --run-cleanroom-gate
```

That source gate uses repo-local Playwright dependencies and is not packaged
inside the distributable archive.
