# Townlight desktop

Status: local, unsigned Records convergence candidate; not a new published release.

This working branch builds on the Records beta.2 rc.3 baseline. Its local
convergence installer retains the numeric build version below for testing; do
not mistake that version for a signed release or for completed acceptance.

The public candidate label is `1.1.0-beta.2`, using replacement tag
`townlight-records-v1.1.0-beta.2-rc.3`. Its synchronized desktop build
manifests use the MSI-compatible SemVer prerelease `1.1.0-2`, which Tauri maps
to WiX ProductVersion `1.1.0.2`. The numeric form is installer metadata; it does
not rename or promote the public beta candidate.

This directory contains the Tauri/WebView2 desktop application used by the
Townlight Windows installer. The first public product profile is **Townlight
Records**, comprising:

- Townlight Core — local platform, audit, storage, runtime, and lifecycle
- Townlight Records — intake, search, review, approval, export, fulfillment,
  and public status
- Townlight Notice — deterministic notice and deadline workpapers
- Townlight Access — accessibility review and records-ready exports

Fresh installations select the dependency-closed `records-beta` profile.
Existing saved module selections are preserved. Meetings and Code remain in
the catalog but are not installed by the Records beta profile.

## Product behavior

The operator path is local-first and requires no Docker, WSL, terminal, or
developer tooling. It provides Staff, Resident/Public, and IT/Admin surfaces;
human approval before a response can be released; local audit history; backup,
restore, repair, and uninstall entry points; and an explicit fictional
demo-town loader.

Successfully replacing response text, manually or through local AI, requires
fresh human approval before export. Failed generation, identical-text saves,
and unrelated request changes preserve approval. Historical notes and exports
are retained. Earlier beta.2 drafts are preserved but not accepted for publication.

The demo loader is local-admin-only, never automatic, accepts only an empty
profile, creates and verifies a backup before mutation, and imports the pinned
Redstone Valley fixture with its hashes and synthetic-data watermark.

## Current architecture boundary

The historical beta's user-facing workflows executed in Rust. This local
convergence candidate explicitly activates Python/PostgreSQL for Records and
its integrated Access/notification behavior. Typed native transport carries the
authenticated operations; Rust retains OS/file integration and supervision.
After activation, current reads and writes do not fall back to the preserved
JSON snapshot. An unavailable service produces an unavailable state, not an
empty or competing Records database.

Meetings, Code and meeting-notice operations are not integrated in this Records
candidate. Their preserved source is not evidence of a shipped connected
system. Duplicate domain-code retirement remains evidence-gated; this branch
does not claim that all legacy Rust implementations have been removed.

For this local convergence candidate, upgrading the MSI does not by itself
activate the new domain authority. In **System Health**, use **Repair** on
**Townlight Records services** to refresh the existing per-user runtime, then
use **Finish Records Migration** as the local administrator. The application
preserves and validates the old evidence before activation. After migration,
the old JSON is not a rollback source for newer SQL work; use the supported
database/files backup and restore controls.

Convergence to one Python/PostgreSQL domain execution path is a blocking gate
before Townlight Meetings. New domain behavior should not be added to the Rust
shell as a permanent second implementation.

## Local checks

From this directory:

```powershell
npm ci
npm test
npm run build
npm run test:browser
npm audit --audit-level=moderate
```

From `desktop/src-tauri`:

```powershell
cargo fmt --check
cargo test -- --test-threads=1
```

The MSI lifecycle is verified by
`.github/workflows/desktop-windows-msi.yml`. Pull requests produce a visibly
named unsigned internal-QA artifact. Only a manual run on `main` can use Azure
Artifact Signing and produce a publication-eligible MSI signed as
`CN=Scott Converse`.

## Compatibility identities

Public product and publisher strings use Townlight. Existing technical
identities remain intentionally stable during this beta, including the Rust
crate/npm package names, `civic*` module IDs/imports, `CIVIC*` environment
variables, database/schema names, the Tauri identifier
`org.civicsuite.desktop`, the MSI UpgradeCode, and legacy local-data discovery
under `%LOCALAPPDATA%\CivicSuite`.
