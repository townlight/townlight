# ADR-0007: First production-depth workflow is Townlight Meetings agenda packet and notice

Status: Accepted

Date: 2026-04-28

## Context

All 26 catalog modules now have v0.1.0 runtime foundations. The next suite
phase must prove integrated municipal workflow depth, not just scaffold breadth.

The strongest first candidate is Townlight Meetings's agenda packet and notice workflow
because it is:

- High-value for clerks, council staff, city managers, and the public.
- Naturally citation-heavy and records-sensitive.
- Already backed by the deepest module foundation.
- Dependent on the cross-module capabilities the suite needs next: audit,
  provenance, exports, local deployment, shared shell conventions, and safe
  import paths.

## Decision

The first production-depth sprint will center on Townlight Meetings agenda packet and
notice workflow, integrated with:

- Townlight Records for source-record visibility and export/provenance alignment.
- Townlight Code for cited code and ordinance references.
- Townlight Zoning for parcel/zoning context where agenda items involve land use.
- Townlight Core v0.3.0 candidate primitives for audit, provenance, manifests, city
  profile, and export-bundle utilities once released.

The implementation plan lives at
`docs/roadmap/townlight_meetings-production-depth-workflow.md`.

## Boundaries

In scope:

- Staff workflow screens for agenda intake, packet assembly, notice checklist,
  meeting preparation, and records-ready export.
- Local-first imports and export bundles.
- Source citations and provenance.
- Browser-verified UX states.
- No-network default local operation.

Out of scope:

- Automatic legal determinations.
- Public-comment production behavior unless a later ADR accepts it.
- Transcription unless a later ADR accepts it.
- Vendor write-back.
- Cloud LLM requirement.
- Replacing agenda, codification, permitting, GIS, or records systems of
  record.

## Consequences

- Townlight Meetings becomes the first module to move from foundation breadth to
  operator-usable depth.
- Townlight Core v0.3.0 gets pulled by real workflow needs instead of speculation.
- Townlight Records, Townlight Code, and Townlight Zoning integrations are exercised through
  read/import/export and citation paths before any write-back connector work.
- UX work stays visible and testable because staff screens are part of the
  sprint, not deferred.
