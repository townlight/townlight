# CivicCode Next Module Plan

Status: v0.1.7 shipped; historical planning baseline retained
Date: 2026-05-03  
Applies to: `CivicSuite/civiccode` v0.1.7 and follow-on planning

## Why CivicCode Next

CivicCode is the next suite lane because the canonical spec names it as a
critical Tier 1 gap and says it should be planned before CivicZone runtime
work begins. CivicZone answers parcel-aware zoning questions, but zoning
answers still need authoritative code sections, version history, and
ordinance-adoption context. CivicCode provides that municipal-code layer.

This does not mean CivicZone is less important. It means CivicCode is the
dependency that lets CivicZone avoid becoming its own partial codifier.

## Product Promise

CivicCode helps residents, staff, clerks, planners, and attorneys ask what
the municipal code says about a topic and receive cited, date-aware answers
tied to authoritative code sections. Plain-language summaries are allowed,
but they are never authoritative legal advice.

## Current Truth

- `CivicSuite/civiccode` ships v0.1.7 as an active municipal-code productization release.
- CivicCode v0.1.7 includes source registry persistence, section/version lifecycle,
  search/permalinks, deterministic citations, citation-grounded Q&A, staff
  notes, plain-language summaries, CivicClerk handoff intake, resident public
  lookup pages, local import connectors, records-ready exports, reusable
  mock-city codifier contracts, and staff-controlled codifier live-sync readiness.
- CivicCode still does not ship legal advice, live LLM calls, bundled vendor
  credentials, CivicAccess runtime integration, or automatic ordinance codification.
- The authoritative requirements live in `docs/CivicSuiteUnifiedSpec.md`
  section 11 and `specs/01_catalog.md` under "CivicCode - Municipal Code &
  Ordinance Access."
- CivicClerk v0.1.0 already defines ordinance/resolution handoff concepts, and
  CivicCode v0.1.7 has a receiving intake foundation for those events.

## MVP Scope

The CivicCode v0.1.0 MVP is narrow, useful, and legally cautious:

1. Municipal code import registry with source URL/file metadata.
2. Code title/chapter/section/subsection model with version dates.
3. Section permalink and date-aware "what did the code say then" lookup.
4. Full-text search across code sections.
5. Citation-grounded Q&A over the code.
6. Plain-language section summaries with explicit non-authoritative labels.
7. Staff-only interpretation notes.
8. Ordinance/adoption-event intake contract from CivicClerk.
9. Public code lookup page with source citations and staff-contact routing.
10. Audit-log seams and visible audit events where the v0.1.0 in-memory
    foundation already exposes them.

## Non-Goals For MVP

- Not a codifier and not a replacement for Municode, American Legal, Code
  Publishing, General Code, or the city's official publisher.
- Not legal advice.
- Not automatic ordinance codification.
- Not automatic legal interpretation.
- Not CivicZone runtime work.
- Not a resident portal shell.

## UX-First Acceptance Criteria

- A resident can ask a routine code question and see the exact cited section.
- A staff member can search by topic, section number, and effective date.
- Every answer says whether it is authoritative text, plain-language
  explanation, or staff-only interpretation.
- Every warning tells the user how to reach the city for legal
  interpretation.
- The system refuses to answer when source text is missing, stale, or
  ambiguous instead of guessing.
- Browser evidence covers desktop, mobile, loading, success, empty, error,
  and ambiguous-source states before any frontend merge.

## Technical Starting Architecture

CivicCode should follow the same separate-module pattern as CivicClerk:

- Standalone repo under `CivicSuite/civiccode`.
- FastAPI backend.
- React staff/public surfaces behind nginx when frontend work begins.
- PostgreSQL 17 + pgvector.
- Redis/Celery only when asynchronous import or indexing work requires it.
- `civiccore==0.2.0` as the initial dependency target unless civiccore ships a
  new release before scaffold.
- Local LLM only through `civiccore.llm`; default provider is Ollama.
- No imports from planned CivicCore placeholder packages unless the capability
  is released in a versioned civiccore artifact.

## Initial Data Model Sketch

- `civiccode.code_sources`
- `civiccode.code_titles`
- `civiccode.code_chapters`
- `civiccode.code_sections`
- `civiccode.section_versions`
- `civiccode.section_citations`
- `civiccode.interpretation_notes`
- `civiccode.plain_language_summaries`
- `civiccode.code_questions`
- `civiccode.ordinance_events`

The implemented table list lives in the CivicCode repo's tested SQLAlchemy
metadata and migration chain.

## First Sprint Sequence

1. Keep `CivicSuite/civiccode` shipped truth current after v0.1.0.
2. Maintain professional repo docs, AGPL-3.0 code license, CC BY 4.0 docs
   license, issue templates, PR template, support/security/contributing docs,
   landing page, user manual, and seed discussion posts.
3. Add `AGENTS.md` operating contract for CivicCode with the same test-first,
   docs-first, browser-QA gate used by CivicClerk.
4. Preserve Milestone 0 reconciliation against `docs/CivicSuiteUnifiedSpec.md`,
   suite ADRs, and the catalog CivicCode spec.
5. Queue ADRs for official-source precedence, codifier integration strategy,
   public disclaimer wording, and CivicClerk handoff contract.
6. Build runtime foundation only after Milestone 0 is reviewed. (Complete as of
   v0.1.0.)

## ADRs Needed Before Runtime

- Official source precedence and what happens when sources disagree.
- Codifier import strategy: file upload, URL scrape, API, or all three.
- Section versioning model and historical effective-date semantics.
- CivicClerk ordinance/adoption-event handoff contract.
- Legal-disclaimer wording and resident-facing refusal policy.
- Staff-only interpretation-note visibility and retention policy.

## QA And Documentation Gate

Every CivicCode PR must update affected documentation and verification
scripts. Frontend PRs must include browser evidence for every rendered state.
Code-answer behavior must be tested with exact citations, stale-source
refusals, ambiguous-source refusals, and no-legal-advice language.
