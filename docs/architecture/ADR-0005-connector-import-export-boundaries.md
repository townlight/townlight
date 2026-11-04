# ADR-0005: Connector import/export boundaries before vendor write-back

Status: Accepted

Date: 2026-04-28

## Context

The unified spec requires connectors to be transparent, inspectable, and safe for
small municipalities. It also orders connector work by risk:

1. File drop, CSV, and export/import paths.
2. Common local filesystems and document repositories.
3. Open APIs where available.
4. Vendor-specific integrations where high-value.
5. Write-back connectors only after read/import paths are stable and audited.

Most Townlight modules now have v0.1.0 runtime foundations. The next risk is
every module inventing its own connector shape. That would make imports harder
to test, exports harder to archive, and write-back boundaries easier to blur.

## Decision

Townlight will standardize connector work around a three-phase boundary:

1. **Read/import first.** Modules may ingest local files, CSV files, GeoJSON,
   ZIP bundles, or vendor exports. These paths must be repeatable, auditable,
   and runnable without outbound network access.
2. **Export bundle second.** Modules may emit records-ready export bundles with
   a manifest, checksums, source references, and operator-readable notes.
3. **Write-back last.** No module may write to an external vendor system until
   the corresponding read/import path and export bundle format are stable,
   tested, documented, and separately approved by a later ADR.

The first suite-level template lives at
`docs/connectors/import-export-template.md`. Module repos may specialize it, but
must not weaken the safety boundary.

## Consequences

- Small cities can start with files they already know how to produce.
- Air-gapped and low-connectivity deployments remain first-class.
- Import failures stay explainable because input formats are visible and
  inspectable.
- Exports become public-records-friendly artifacts instead of ad hoc downloads.
- Vendor write-back stays deliberately out of scope until the safer paths prove
  themselves in real workflows.

## Non-Goals

- This ADR does not define a Townlight Core connector runtime API.
- This ADR does not approve live vendor write-back.
- This ADR does not require every v0.1.0 module to implement imports now.
- This ADR does not make Townlight a system of record for ERP, permitting,
  courts, utilities, elections, public safety, or finance systems.

## Verification Expectations

Any module implementing an import/export connector must verify:

- The sample import can run from local disk with outbound network blocked.
- Malformed inputs return actionable errors with a fix path.
- Re-running the same import is idempotent or safely deduplicated.
- Export bundles contain a manifest and checksums.
- Export bundles can be validated without the module server running.
- Current-facing docs clearly say whether a connector is shipped, planned, or
  intentionally excluded.
