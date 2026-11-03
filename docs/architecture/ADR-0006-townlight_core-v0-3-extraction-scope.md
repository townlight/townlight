# ADR-0006: Townlight Core v0.3.0 extraction scope favors audit, provenance, manifests, and city profile

Status: Accepted

Date: 2026-04-28

## Context

Townlight Core v0.2.0 ships migrations, shared SQLAlchemy `Base`, and the LLM
abstraction. The unified spec lists many future extractions: auth/RBAC, audit,
document ingestion, search, connectors, notifications, onboarding, city profile,
exemption rules, verification, provenance, and shell conventions.

After all 26 catalog modules shipped v0.1.0 foundations, the active
post-foundation lanes exposed common needs that are lower-risk than auth/RBAC
and more immediately useful:

- Every module needs audit metadata for operator-visible actions.
- Every cited answer and export needs source/provenance metadata.
- Connector import/export work needs manifest and checksum conventions.
- Local deployment needs a city/profile configuration model.

Auth and RBAC remain important, but they quickly become policy-heavy and must
not be invented ahead of real workflow depth.

## Decision

Townlight Core v0.3.0 should target a bounded shared-primitives release with this
candidate scope:

1. Hash-chained audit log primitives.
2. Shared source/document metadata contracts.
3. Connector/export manifest schema.
4. City profile and onboarding configuration model.
5. Export-bundle manifest utilities.

The implementation plan is documented in
`docs/townlight_core/v0.3-extraction-proposal.md`.

Auth/RBAC, full document ingestion, hybrid search, notification delivery, live
connector runtime, shared shell package extraction, and exemption-rule engines
are explicitly out of scope for v0.3.0 unless a later ADR changes the release
boundary.

## Consequences

- Townlight Core grows by extracting proven cross-module primitives, not speculative
  abstractions.
- Modules can share audit/provenance/export shape without waiting for full auth.
- The first production-depth workflow can rely on consistent evidence and export
  metadata.
- Townlight Core avoids owning municipal policy decisions before there is enough
  module evidence.

## Verification Expectations

Townlight Core v0.3.0 planning must include:

- Tests that prove audit hash chains detect tampering.
- Tests that prove source metadata can represent records, code sections,
  meeting packets, zoning parcels, and generic local files.
- Tests that prove export manifests validate checksums and file counts.
- Tests that prove city profile config can load without outbound network calls.
- Docs that clearly separate shipped v0.3.0 primitives from still-planned
  platform features.
