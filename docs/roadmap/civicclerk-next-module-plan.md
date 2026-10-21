<a id="civicclerk-next-module-plan"></a>

# Townlight Meetings Next Module Plan

Status: Active planning baseline  
Date: 2026-04-26  
Applies to: `townlight/meetings` initial scaffold and MVP sprint

<a id="why-civicclerk-next"></a>

## Why Townlight Meetings next

Townlight Meetings is the right next product after Townlight Records because it
stays inside the clerk-first operating surface while expanding from
records requests into public meeting administration. It reuses the same
sovereign local-LLM posture, the same civiccore dependency, the same
document/search/notification patterns, and the same public-trust design
language. It also creates source material future modules will need:
ordinance adoption events for Townlight Code, board meeting records for
Townlight Boards, statutory notice primitives for Townlight Notice, and public
accessibility workflows for Townlight Access.

## Product promise

Townlight Meetings helps a city clerk run the legal record of public meetings:
agenda intake, packet assembly, notice compliance, minutes, votes,
ordinances/resolutions, and searchable public meeting archives. AI may
draft or extract, but humans approve every consequential action.

## MVP scope

The first coded MVP must be small enough to ship and audit, but complete
enough to feel like a real clerk workflow:

1. Meeting bodies and meeting calendar
2. Agenda item intake with department submitter workflow
3. Agenda packet builder with attachment list and generated packet order
4. Notice deadline tracker with posting checklist
5. Meeting detail page with item statuses, motions, votes, and action log
6. Minutes draft workspace with explicit source citations
7. Public meeting page for posted agendas, packets, and approved minutes
8. Audit log entries for every state transition

## Explicit non-goals for MVP

- No livestream hosting.
- No electronic voting system.
- No automated legal decisions.
- No closed-session content leakage into public views.
- No Townlight Code handoff until Townlight Code exists; export structured
  adoption events instead.
- No cloud inference, telemetry, or external runtime API dependency.

## UX-first acceptance criteria

- A first-time clerk can create a meeting body and schedule a meeting
  without reading developer docs.
- A department submitter can submit an agenda item and understand what
  happens next.
- A clerk can assemble a packet and see exactly what is missing before
  posting.
- Notice warnings name the missing step and the fix path.
- Minutes drafting shows sentence-level citation/source affordances, not
  just generated text.
- Public pages clearly distinguish draft, posted, approved, and archived
  materials.
- Desktop and mobile browser evidence is captured before every frontend
  merge.

## Technical starting architecture

Initial scaffold should be a standalone module repo under
`townlight/meetings`, with the same professional documentation
baseline as the existing repos. Runtime implementation should follow
the Townlight Records pattern unless a written ADR says otherwise:

- FastAPI backend
- React frontend
- PostgreSQL 17 + pgvector
- Redis + Celery for async jobs
- Ollama/Gemma 4 through `civiccore.llm`
- `civiccore==0.2.0` as the first dependency target
- Hash-chained audit logging once civiccore exposes the shared primitive
  or a local equivalent until extraction

## Initial data model sketch

- `meeting_bodies`
- `meetings`
- `agenda_sections`
- `agenda_items`
- `agenda_item_attachments`
- `packet_versions`
- `notice_requirements`
- `notice_postings`
- `motions`
- `votes`
- `minutes_drafts`
- `minute_citations`
- `public_comments`
- `adoption_events`

The first migration must be idempotent and must include a documented
upgrade/fresh-install gate before release.

## First sprint sequence

1. Scaffold `townlight/meetings` with professional docs, CI, license,
   issue templates, PR template, docs landing page, user manual, and seed
   discussion posts.
2. Add a scope document and ADR-0001 for the Townlight Meetings MVP boundary.
3. Build the first vertical slice: meeting bodies + meeting calendar +
   empty/success/error UX states.
4. Add agenda item intake and clerk review queue.
5. Add packet assembly and notice checklist.
6. Add minutes draft workspace with citation model.
7. Add public meeting page.
8. Cut v0.1.0 only after docs, tests, browser QA, and install/upgrade
   verification are complete.

## QA and documentation gate

Every PR must update all affected documentation and include automated
verification. Any frontend PR must include browser evidence for desktop,
mobile, loading, success, empty, error, and partial states.

## Open questions for future ADRs

- Whether Townlight Meetings should reuse Townlight Records's full stack initially
  or start from a thinner dedicated scaffold.
- Whether statutory notice rules live in civiccore long-term or start
  local to Townlight Meetings.
- How public comment intake should authenticate residents.
- How transcript ingestion should handle Whisper-local model packaging.
