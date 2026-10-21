<a id="civicclerk-production-depth-workflow-sprint"></a>

# Townlight Meetings Production-Depth Workflow Sprint

Status: planned next production-depth lane

Governing ADR: `docs/architecture/ADR-0007-first-production-depth-workflow.md`

Primary repo: `townlight/meetings`

Supporting repos: `townlight/core`, `townlight/sunshine`,
`townlight/ordinances`, `townlight/zone`, `townlight/townlight`

## Purpose

This sprint turns Townlight Meetings from a strong v0.1.0 foundation into the first
operator-usable production-depth Townlight workflow.

The workflow is deliberately narrow:

1. Department submits or imports agenda item source material.
2. Clerk reviews agenda item readiness.
3. Clerk assembles the packet.
4. Clerk checks statutory notice readiness.
5. Clerk publishes or records posting proof after human approval.
6. Clerk exports a records-ready packet/notice bundle.

AI may summarize, check, draft, or explain. A human clerk decides, approves, and
publishes.

## Current Starting Point

Townlight Meetings v0.1.0 already ships:

- Schema and Alembic foundation.
- Agenda item lifecycle enforcement.
- Meeting lifecycle enforcement.
- Packet snapshot versioning.
- Notice compliance checks.
- Immutable motion/vote/action capture.
- Citation-gated minutes draft capture.
- Public archive endpoints.
- Prompt eval gates.
- Local-first connector imports.
- Browser QA gates.
- A `/staff` workflow UI foundation.

Still planned:

- Full workflow screens.
- Database-backed staff queues.
- End-to-end packet builder UI.
- End-to-end notice/posting proof UI.
- Production export-bundle flow.
- Cross-module source/provenance alignment.

## Sprint Sequence

<a id="phase-1---civiccore-v030-primitives"></a>

### Phase 1 - Townlight Core v0.3.0 Primitives

Repo: `townlight/core`

Deliver:

- Audit primitives.
- Source/provenance metadata contracts.
- Connector/export manifest schema.
- City profile configuration.
- Export-bundle utilities.
- v0.3.0 release artifacts and checksums.

Acceptance:

- `scripts/verify-release.sh` passes.
- Wheel install smoke test imports every new public API.
- Tamper-detection tests prove audit hash chains fail when modified.
- Manifest tests prove checksums and file counts are validated.
- Docs clearly say what v0.3.0 ships and what remains planned.

<a id="phase-2---civicclerk-data-and-service-depth"></a>

### Phase 2 - Townlight Meetings Data And Service Depth

Repo: `townlight/meetings`

Deliver:

- Database-backed agenda intake queue.
- Staff-review state for agenda item readiness.
- Packet assembly records tied to source files and citations.
- Notice checklist records tied to meeting type, statutory basis, deadlines, and
  posting proof.
- Export bundle generation using Townlight Core v0.3.0 manifest utilities.
- Audit events for every consequential clerk action.

Acceptance:

- Agenda item lifecycle still rejects invalid transitions.
- Packet assembly cannot include closed-session source files in public bundles.
- Notice checks return actionable errors for missing statutory basis, late
  posting, missing human approval, or timezone-invalid inputs.
- Export bundle validates without the server running.
- Re-running the same import/export path is idempotent or safely deduplicated.

### Phase 3 - Staff Workflow UI

Repo: `townlight/meetings`

Deliver:

- Staff dashboard queue for agenda items needing review.
- Agenda item detail/readiness screen.
- Packet builder screen.
- Notice checklist and posting proof screen.
- Export bundle review/download screen.
- Empty, loading, error, partial, and success states for each screen.

Acceptance:

- Browser QA captures desktop and mobile screenshots for every rendered state.
- Keyboard navigation reaches every action.
- Focus states are visible.
- Error and warning copy explains what happened and how to fix it.
- No console errors.
- Public-facing copy does not imply legal determinations or auto-publication.

### Phase 4 - Cross-Module Source Context

Repos: `townlight/sunshine`, `townlight/ordinances`,
`townlight/zone`, `townlight/meetings`

Deliver:

- Read-only source reference adapters or export fixtures for:
  - records request/source files from Townlight Records,
  - code sections and ordinance references from Townlight Code,
  - parcel/zoning context from Townlight Zoning.
- Townlight Meetings consumes these as source/provenance references, not system-of-record
  writes.

Acceptance:

- Default local demo profile still runs without outbound calls.
- Missing supporting module returns an actionable degraded-state message.
- Every cross-module reference records source module, version, source locator,
  and checksum where available.

### Phase 5 - Demo Profile And Operator Docs

Repos: `townlight/townlight`, `townlight/meetings`, supporting modules

Deliver:

- Updated local demo deployment profile.
- Operator walkthrough for clerk/staff evaluation.
- Updated landing pages and manuals.
- Compatibility matrix updates for every released package.

Acceptance:

- A first-time evaluator can run the bounded demo stack and follow the packet
  and notice workflow without reading source code.
- Current-facing docs separate shipped behavior from planned behavior.
- All affected repos pass release/docs gates.

## UX Requirements

The staff workflow must follow `docs/ux/shared-shell-inventory.md`:

- Consistent page title hierarchy.
- Status cards for readiness, notice, packet completeness, and export readiness.
- Empty states that tell staff exactly what to add next.
- Error states with fix paths.
- Citation/source panels for every AI-assisted or imported claim.
- Export affordances that preview manifest, checksums, and limitations.

## Explicit Non-Goals

- No vendor write-back.
- No cloud LLM requirement.
- No autonomous posting or publishing.
- No legal sufficiency decision.
- No public-comment production behavior.
- No transcription production behavior.
- No replacement of agenda, records, GIS, codification, or document management
  systems of record.

## Done Definition

This production-depth lane is complete when:

- Townlight Core v0.3.0 is released if its primitives are used.
- Townlight Meetings ships a new release with database-backed packet/notice workflow
  depth.
- Supporting module references are read-only and degraded-state safe.
- The local demo profile can exercise the workflow without outbound calls.
- Browser QA covers every staff workflow state at desktop and mobile widths.
- Docs, changelogs, manuals, landing pages, and compatibility matrix entries are
  updated in every affected repo.
