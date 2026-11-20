# Windows 1.8.2.1 maintenance candidate

This Windows-only maintenance candidate packages the current staff authorization,
explicit database-credential configuration, licensing corrections and pinned component sources.
The published 1.8.1.1 release and its historical evidence remain intact.

## Candidate identity

- Desktop 1.8.2-1; Windows MSI 1.8.2.1; Python bridge 0.3.2.
- Records 1.8.0.dev3, Boards 0.2.1, Contracts 0.2.1, Procurement 0.3.1.
- Exact component commits: `config/inspections-preview-sources.json`.
- Station remains the pinned Python beta-1 service. Its separate Rust CI does not
  add the Rust kernel to this MSI.

## Installed verification

The manual signing run of `desktop-windows-msi.yml` uses the existing Azure signing
configuration, verifies both EXE and MSI signatures, and sends that exact MSI to
fresh and upgrade jobs on disposable GitHub-hosted Windows runners. No operator
workstation profile or desktop is used by these jobs.

`desktop/scripts/test-installed-maintenance.ps1` verifies signatures, installation,
Windows registration, first-run setup, the installed WebView and actual services.
The existing municipal walkthrough exercises staff authorization, board rosters
and attendance, procurement proposals/award and the Contracts handoff. Saved IDs
are read back after a 1.8.1.1 upgrade. Fresh-install acceptance also exercises
backup/restore. Uninstall must remove the application and registration while
preserving city configuration and the PostgreSQL database.

The scripts guard against a pre-existing profile and preserve JSON receipts,
installer logs and failure screenshots as workflow artifacts. A prepared test is
not a passing receipt. Publication requires actual successful signed installed
results, plus existing required checks. No claim is made that every unchanged
module workflow has been newly retested.

## Delivery

The final release evidence and public manuals will identify the accepted source,
MSI hash, signatures, fresh-install result and exact verified upgrade path.
Until those receipts exist, the public download stays on the existing release.
There is no Mac, Linux or signing-authentication migration in this work.
