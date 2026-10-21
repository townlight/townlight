<a id="civicsuite-connector-importexport-template"></a>

# Townlight Connector Import/Export Template

Status: active suite template

Applies to: all Townlight module repos

Governing ADR: `docs/architecture/ADR-0005-connector-import-export-boundaries.md`

## Purpose

This template gives each module a safe starting point for municipal data paths.
It favors the workflows small cities can use immediately: file drops, CSV
imports, static vendor exports, and records-ready export bundles.

It is intentionally not a live vendor write-back framework.

## Boundary

| Phase | Allowed now? | Examples | Rule |
|---|---:|---|---|
| File drop / CSV import | Yes | CSV, JSON, GeoJSON, PDF folder, ZIP bundle | Must run from local disk and be re-runnable. |
| Static vendor export import | Yes | Granicus agenda export, ArcGIS GeoJSON, Open311 CSV | Treat as read-only source material. |
| Export bundle | Yes | Records archive ZIP, meeting packet export, code-section export | Must include manifest and checksums. |
| Open API read | Later, module-specific | ArcGIS REST read, CKAN package read | Must be optional and disabled by default. |
| Vendor write-back | No | ERP write, permit-system update, agenda-system publish | Requires later ADR and audited read path first. |

## Standard Import Folder Shape

```text
imports/
  <module>/
    README.md
    incoming/
      sample.csv
      sample.geojson
      source-files/
    processed/
    rejected/
    manifests/
      import-2026-04-28T120000Z.json
```

Rules:

- `incoming/` contains operator-provided files.
- `processed/` contains files accepted by an import run.
- `rejected/` contains files that failed validation, plus actionable error
  notes.
- `manifests/` records what was read, when, by whom or by what service account,
  and what module records were created or updated.
- Modules must never silently delete source files.

## Standard CSV Expectations

CSV imports should document:

- Required columns.
- Optional columns.
- Date/time format and timezone requirements.
- Accepted enumerations.
- Maximum row count for a single import.
- Deduplication key.
- How rejected rows are reported.
- Whether partial success is allowed.

Minimum CSV validation tests:

- Valid file imports successfully.
- Missing required column fails with the missing column name.
- Invalid enum fails with allowed values.
- Naive or malformed timestamp fails with the required format.
- Duplicate rows are deduplicated or rejected according to the module contract.

## Standard Export Bundle Shape

```text
exports/
  <module>-<purpose>-<timestamp>.zip
    manifest.json
    SHA256SUMS.txt
    README.txt
    data/
      records.csv
      records.json
    source/
      original-file.pdf
    evidence/
      citations.json
      audit-events.json
```

`manifest.json` must include:

- `module`
- `module_version`
- `civiccore_version`
- `export_purpose`
- `created_at`
- `created_by`
- `source_record_count`
- `generated_file_count`
- `hash_algorithm`
- `files[]` with path, byte size, and sha256
- `limitations`

`README.txt` must explain what the export contains and what it does not contain
in plain language suitable for a clerk, records officer, or IT reviewer.

## Initial Module Patterns

| Module | First import/export pattern | Notes |
|---|---|---|
| Townlight Records | Records export bundle import/export | Preserve request IDs, exemption notes, search evidence, and response package checksums. |
| Townlight Meetings | Agenda packet source import | Start with agenda item CSV, staff report folder, packet PDF folder, and prior system export ZIPs. |
| Townlight Code | Code-section CSV/JSON import | Preserve adopted date, effective date, section path, ordinance source, and version context. |
| Townlight Zoning | GeoJSON and parcel CSV import | GeoJSON file drop is the offline fallback before any live GIS connector. |

## Operator Error Requirements

Every import/export error must say:

- What failed.
- Which file or row failed.
- Why it failed.
- How the operator can fix it.
- Whether any data was accepted before the failure.

Bad:

```text
Import failed.
```

Good:

```text
Import rejected: parcels.csv row 42 has invalid zone_code "R-999".
Allowed values: R-1, R-2, R-3, C-1, MX.
Fix the row and re-run the import. No rows were committed.
```

## Test Requirements

Each module import/export implementation must include:

- Unit tests for parser validation.
- Integration tests for the full local import path.
- Idempotency tests for repeat imports.
- Export-manifest validation tests.
- Checksum verification tests.
- No-network tests for the default local path.
- Documentation tests or grep gates that prevent planned connectors from being
  described as shipped.

<a id="civiccore-extraction-candidate"></a>

## Townlight Core Extraction Candidate

After at least two modules implement this template, Townlight Core v0.3.0 may extract
shared utilities for:

- Manifest schema validation.
- SHA256 bundle generation.
- Rejected-row report formatting.
- Import run audit metadata.
- Common file-drop directory conventions.

Do not extract these utilities before module work proves the common shape.
