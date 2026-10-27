> **Status reconciliation — 2026-10-26:** This specification retains intended requirements and historical version/status paragraphs. Use the [feature and integration review](assessment/feature-and-integration-review.md) for source-proven implementation, explicit deferral, confirmed gaps and unresolved proof across all eight products. Planning, Permitting and Inspections now have accepted signed desktop compositions; older “queued”/demotion labels below are historical package context. This note does not remove broader requirements.

<a id="civicsuite-unified-specification"></a>

# Townlight Unified Specification

## Planning staff beta preparation — October 22, 2026

The opt-in staff Planning composition has P5 native integration and P6 unsigned
installed evidence. Release preparation assigns Planning 0.3.0 / Records 1.7.4
with Core 1.2.1. It retains the existing Planning preview selection and interface;
Permitting/Inspections remain disabled. This is not a publication, broad public
usability claim or final signed-byte certification. Public desktop truth remains
signed 1.4; historical entries below are retained. See [the preparation contract](installer/planning-staff-beta-preparation.md).


**Canonical suite specification for Townlight, Townlight Core, Townlight Records, Townlight Meetings, Townlight Zoning, Townlight Regulatory Watch, Townlight API, and future modules**

Spec revision: 1.1
Status: Canonical planning specification (architectural intent only; STATUS.md is current-shipped truth)
Last revised: 2026-06-13
License: Apache License 2.0 for code; CC BY 4.0 for documentation unless a repository-specific LICENSE says otherwise.
Supersedes: `CivicSuiteAI_Module_Catalog_v1`, `Open Source AI for Municipalities`, and module-specific draft specs where they conflict with this document.
Preserves: Feature, workflow, schema, prompt, testing, and product requirements from the source documents unless explicitly marked superseded, deferred, or corrected here.

---

> **Release recovery banner (updated 2026-06-13).** This spec describes the architectural intent of Townlight: the suite structure, dependency rules, principles, and module roadmap. It does not by itself describe what is shipped today. Current shipped/recovery truth lives in [STATUS.md](../STATUS.md), [docs/release-recovery-status.md](release-recovery-status.md), the compatibility matrix, and `scripts/verify-suite-state.py`. The city-core release-train cars are Townlight Core v1.2.0, Townlight Records v1.7.3, Townlight Meetings v1.0.4, Townlight Code v1.0.8, Townlight Notice v0.2.0, and Townlight Access v0.4.0. Townlight Zoning, Townlight Planning, Townlight Permitting, and Townlight Inspections are on v0.2.2 no-functional-upgrade demotion labels until their Tier 2 release turns.

---

## 1. Purpose

This document is the working source of truth for the Townlight product family.

It consolidates the useful content from:

- `CivicSuiteAI_Module_Catalog_v1`
- `CivicRecordsAI-UnifiedSpec-v3.0`
- `CivicCore_v0_1_Extraction_Spec`
- `CivicClerk_Module_Spec_v0_1`
- `CivicZone_Module_Spec_v0_1`
- `Open Source AI for Municipalities`
- Current repository truth in `townlight/townlight`, `townlight/core`, `townlight/sunshine`, and `townlight/meetings`
- Townlight Regulatory Watch and Townlight API product requirements from `C:/Users/scott/Downloads/CivicAPI and CivicRegWatch modules.docx`

The goal is not to reduce the suite to a pitch. The goal is to preserve the full product surface while removing drift, stale licensing language, stale module counts, ambiguous dependency claims, and inconsistent shipped/planned labels.

## 2. Governing Corrections

These corrections override older source documents.

### 2.1 License

All Townlight code repositories use **Apache License 2.0**.

Documentation uses **CC BY 4.0** unless a repository-specific LICENSE says otherwise. Code snippets inside documentation are governed by Apache License 2.0.

Older drafts referenced MIT. That language is superseded. Apache 2.0 is the civic/municipal default because it remains permissive while giving public-sector legal/procurement reviewers clearer patent and contribution language.

### 2.2 Module Count And Tiers

The suite catalog now contains **27 product modules plus Townlight Core as the Tier 0 shared platform across 7 tiers**:

- Tier 0: Foundation
- Tier 1: Clerk Core
- Tier 2: Land Use & Development
- Tier 3: Administrative Expansion
- Tier 4: Operations
- Tier 5: Internal Business
- Tier 6: Specialized

Older drafts said "26 modules across 6 tiers." That was an arithmetic/category drift. This document standardizes on 7 tiers, counting Tier 0 through Tier 6, and adds Townlight Regulatory Watch plus Townlight API as planned product modules in the operations/transparency lane. The reconciled catalog enumerates 27 product modules after Townlight Core; live GitHub org state and installer metadata match that count.

### 2.3 Repository Placement

All Townlight module repositories live under the `CivicSuite` GitHub organization. Personal-account repositories are transitional only and should not be used for canonical project links.

Current canonical repositories:

- `townlight/townlight` - umbrella documentation, governance, compatibility, roadmap.
- `townlight/core` - shared platform library.
- `townlight/sunshine` - public records / FOIA product.
- `townlight/meetings` - meeting/agendas/minutes product.
- `townlight/ordinances` - municipal code and ordinance access product.
- `townlight/access` - accessibility, plain-language, multilingual, and ADA support product.
- `townlight/zone` - parcel-aware zoning and land-use support product.
- `townlight/plan` - comprehensive-plan policy lookup and planning analysis support product.
- `townlight/permit` - permit pre-application and intake-readiness support product.
- `townlight/inspect` - inspection support product.
- `townlight/grants` - grant opportunity and compliance support product.
- `townlight/procure` - procurement drafting and award-packet support product.
- `townlight/contracts` - contract repository and renewal visibility support product.
- `townlight/boards` - board and commission administration support product.
- `townlight/notice` - public notice compliance support product.

Future module repositories should be created under `CivicSuite/` from the start.

<a id="24-civiccore-capability-truth"></a>

### 2.4 Townlight Core Capability Truth

The long-term Townlight Core responsibility set includes auth, RBAC, audit, LLM abstraction, document ingestion, hybrid search, connectors, notifications, onboarding, city profile, catalog, exemption rules, sovereignty controls, and shared module shell conventions.

Current shipped Townlight Core v1.2.0 is narrower than the long-term platform vision, but broader than the v0.2.0 LLM-only extraction. The v1.2.0 release adds the shared document-ingestion pipeline used by the city-core release cars and retains the v1.1.0 timing-safe staff-key gate plus the v1.0.1 security hardening for auth error payloads:

- `civiccore.migrations`
- `civiccore.db.Base`
- `civiccore.llm` providers, templates, registry, context utilities, and structured output helpers
- Hash-chained audit primitives
- Source/provenance metadata contracts
- Offline import/export manifest schemas
- Export-bundle helpers and checksum manifest utilities
- Local city profile configuration
- Storage-neutral onboarding profile interview helpers
- Bearer-role and trusted-header auth helpers for downstream FastAPI services
- Connector import normalization, delta planning, retry/circuit-breaker primitives, and source-list status projection
- Shared ingest discovery/fetch contracts and cited-source validation
- Search normalization, deterministic matching, permission-aware access helpers, and reciprocal-rank fusion
- Notice deadline and compliance helpers
- Cron schedule validation and next-run helpers
- Connector host validation, startup config validation, encrypted JSON envelope helpers, and release-provenance verification
- Live-sync retry/circuit primitives
- Reusable vendor-delta planning
- Reusable mock-city vendor, municipal IdP, and backup-retention contracts

Placeholder packages are not implementation. Any public-facing document must say this clearly.

## 3. Strategic Thesis

Townlight is an open-source, local-first municipal operations suite for small and mid-sized cities.

It is designed around four realities:

1. Municipal data is sensitive, fragmented, and often legally constrained.
2. Small cities cannot afford enterprise SaaS pricing, per-seat traps, or cloud-only AI posture.
3. Clerks, planners, attorneys, finance staff, and department leads need practical workflow tools, not novelty chatbots.
4. AI output must be cited, reviewable, locally governed, and subordinate to human decision-making.

Townlight is **not** an ERP replacement, utility billing system, CAD/RMS, court case-management system, or permitting system of record on day one. It is designed to add value in the layer around municipal knowledge work: records, meetings, ordinances, zoning, notices, contracts, grants, procurement writing, public communication, accessibility, and internal policy Q&A.

## 4. Suite-Wide Non-Negotiables

Every module inherits these rules.

### 4.1 Product Principles

- Staff workflows come before flashy resident features.
- Resident-facing features ship when they improve trust, transparency, and self-service without creating legal ambiguity.
- Each module degrades gracefully when the LLM is unavailable.
- Modules are installable independently; Townlight Core is the only required foundation.
- Interfaces must be calm, accessible, government-appropriate, and actionable.
- Every error, empty state, warning, and compliance flag must tell the user what happened and what to do next.

### 4.2 AI Principles

- AI drafts; humans decide.
- No auto-release, auto-denial, auto-redaction, auto-enforcement, or auto-determination.
- Every material answer cites source material.
- Prompt libraries are versioned, auditable, and configurable.
- Model, prompt, data-source, and output provenance are recorded.
- Local inference is the default. No outbound telemetry.
- External/cloud LLM providers may be supported as optional adapters only when explicitly configured by the city.

### 4.3 Sovereignty Principles

- Cities own their data.
- The system must support air-gapped and segmented deployments.
- Runtime operation must not require vendor telemetry.
- Connectors must be transparent and inspectable.
- Exports must be possible in open, documented formats.

### 4.4 Documentation And QA Principles

- Documentation ships with code.
- Every module must have README, README.txt, user manual, professional landing page, architecture docs, discussion seeds, issue templates, PR template, support/security/contributing docs, and license files.
- Version numbers must be consistent across code, tests, docs, landing pages, release notes, installer metadata, and generated binaries.
- Browser-visible UI must be QA-verified at desktop and mobile widths before release.
- Current-state truth must be separated from roadmap aspiration.

## 5. Standard Module Architecture

Every runtime module follows the Townlight Records pattern unless an ADR explicitly overrides it.

### 5.1 Backend

- FastAPI application
- PostgreSQL 17 with pgvector where vector search is needed
- Redis 7.2
- Celery and Celery Beat for background work
- Alembic migrations
- Townlight Core dependency pinned to a compatible released version
- Per-module schema or clearly bounded table namespace
- Foreign keys into Townlight Core shared tables where needed
- Hash-chained audit logging once Townlight Core audit extraction lands

### 5.2 Frontend

- React staff shell
- Module-specific staff pages
- Module-specific resident/public pages where appropriate
- Shared accessibility, navigation, and public-trust conventions
- No color-only status indicators
- Visible focus states
- Keyboard-complete workflows
- Actionable empty/error states

### 5.3 AI And Prompting

- Module-specific YAML prompt library, never hardcoded prompt strings for policy-bearing workflows
- Townlight Core LLM provider abstraction
- Townlight Core template resolver with civiccore defaults, code overrides, and module/city overrides
- Citation requirements enforced in prompt contracts and output validation
- Evaluation harness for prompt behavior before release

### 5.4 Data And Search

- Documents and chunks eventually belong in Townlight Core shared infrastructure.
- Module-specific tables belong in the module schema/namespace.
- Search must be permission-aware.
- Public search must never leak staff-only or closed-session content.
- Every answer that looks like advice must distinguish information from determination.

### 5.5 Connectors

Connector support should follow this priority:

1. File drop / CSV / export import for small cities.
2. Common local filesystems and document repositories.
3. Open APIs where available.
4. Vendor-specific integrations only where high-value.
5. Write-back connectors only after read/import paths are stable and auditable.

<a id="6-civiccore-roadmap"></a>

## 6. Townlight Core Roadmap

Townlight Core is the shared platform, not a user-facing product.

### 6.1 Shipped

Current shipped Townlight Core v1.1.0 includes:

- Migration runner and baseline migration strategy
- Shared SQLAlchemy `Base`
- LLM provider interface and provider registry
- Ollama, OpenAI, and Anthropic provider adapters
- Provider config objects and provider factory
- Prompt template model, resolver, and override registry
- Model registry model/service/router
- Context budgeting and token utilities
- Structured output retry helper
- Hash-chained audit primitives
- Source/provenance metadata contracts
- Offline import/export manifest schemas
- Export-bundle helpers and checksum manifest utilities
- Local city profile configuration
- Storage-neutral onboarding profile interview helpers
- Bearer-role and trusted-header auth helpers for downstream FastAPI services
- Timing-safe staff-key gate helper for downstream FastAPI services
- Connector import normalization, delta planning, retry/circuit-breaker primitives, and source-list status projection
- Shared ingest discovery/fetch contracts and cited-source validation
- Search normalization, deterministic matching, permission-aware access helpers, and reciprocal-rank fusion
- Notice deadline and compliance helpers
- Cron schedule validation and next-run helpers
- Connector host validation, startup config validation, encrypted JSON envelope helpers, and release-provenance verification
- Live-sync retry/circuit primitives shared by Townlight Records and Townlight Meetings
- Reusable vendor-delta planning and mock-city vendor, municipal IdP, and backup-retention contracts shared by Townlight Records, Townlight Meetings, and future modules

### 6.2 Planned Extractions

Future Townlight Core phases must extract shared capabilities from module implementations in disciplined increments:

- Full auth/RBAC, user administration, department administration, and service-account administration
- Web onboarding wizard
- Document ingestion and document/chunk storage
- Full search engine, index storage, and database-backed retrieval orchestration
- Credential storage, vendor write-back, and connector runtime
- Notification templates and delivery logs
- Exemption/public-records rules
- Sovereignty verification and human-in-the-loop enforcement
- Shared resident portal shell conventions
- Shared staff app-shell conventions
- Module registry / installed-module catalog

No module may depend on planned Townlight Core behavior unless that behavior is released in a versioned Townlight Core artifact.

## 7. Canonical Module Catalog

### Tier 0 - Foundation

<a id="civiccore"></a>

#### Townlight Core

Owner: IT / platform team
Depends on: none
Status: v1.2.0 shipped with the shared document-ingestion pipeline; v1.1.0 `staff_key_gate` and v1.0.1 auth-error-payload hardening remain included. Architectural target: shared-platform release with many planned extractions.
Purpose: shared infrastructure layer for every module. Townlight Core owns the common libraries, migrations, LLM abstraction, shared schema conventions, audit/provenance/manifest/export primitives, city profile configuration, auth helpers, search/access helpers, connector primitives, ingest contracts, scheduling helpers, verification helpers, and future full document/search/catalog/exemption/scaffold primitives.

### Tier 1 - Clerk Core

<a id="civicrecords"></a>

#### Townlight Records

Owner: City Clerk / Records Officer / Legal reviewer
Depends on: Townlight Core
Status: v1.7.3 developer-preview release car shipped on Townlight Core v1.2.0 with shared-ingestion consumption and release-asset convention bring-up. B2 Docker secret extraction shipped in v1.6.0 and the ingestion worker event-loop patch shipped in v1.6.1.
Purpose: open-records intake, workflow, search, exemption review, response drafting, fee tracking, audit trail, and planned public request portal.

<a id="civicclerk"></a>

#### Townlight Meetings

Owner: City Clerk / Council Support / City Manager's Office
Depends on: Townlight Core. Optional integration with Townlight Records for records-search visibility.
Status: v1.0.4 city-core release car shipped on Townlight Core v1.2.0; anonymous staff writes are denied by default.
Purpose: agenda intake, packet assembly, staff report normalization, notice compliance, motion/vote capture, minute drafting, ordinance/resolution extraction, searchable meeting archive, and public meeting portal.

Dependency note: older catalog text listed Townlight Records because shared document/search infrastructure was still inside Townlight Records. The corrected dependency is Townlight Core once that infrastructure is extracted; Townlight Records integration remains optional.

<a id="civiccode"></a>

#### Townlight Code

Owner: City Clerk / Legal / Codification Department
Depends on: Townlight Core, Townlight Meetings
Status: v1.0.8 city-core release car on Townlight Core v1.2.0; supersedes the earlier v1.0.0 posture.
Purpose: municipal code as a first-class product. Residents and staff ask what the code says about a topic and receive cited answers tied to authoritative code sections. Townlight Meetings feeds adopted ordinance/resolution events into Townlight Code.

<a id="civicaccess"></a>

#### Townlight Access

Owner: Clerk / Communications / IT / ADA Coordinator
Depends on: Townlight Core
Status: v0.4.0 city-core release car on Townlight Core v1.2.0; sixth city-core module (re-probe reversed the 2026-05-23 NEEDS-WORK demotion).
Purpose: accessible forms, accessible publishing workflows, multilingual and plain-language rewrites, ADA Title II review, records-ready exports, and accessibility support reused by every module.

### Tier 2 - Land Use & Development

<a id="civiczone"></a>

#### Townlight Zoning

Owner: Planning & Development / Community Development
Depends on: Townlight Core, Townlight Code
Status: v0.2.2 no-functional-upgrade demotion label; queued for Tier 2 real work.
Purpose: parcel-aware zoning and land-use Q&A. Residents ask what zone a property is in, what uses are allowed, what setbacks apply, and when planner review is required. Townlight Zoning never makes a zoning determination.

<a id="civicplan"></a>

#### Townlight Planning

Owner: Planning & Development / City Manager's Office
Depends on: Townlight Core, Townlight Zoning, Townlight Meetings
Status: v0.2.2 no-functional-upgrade demotion label; queued for Tier 2 real work.
Purpose: comprehensive plans, small-area plans, transportation plans, parks plans, and sustainability plans become searchable, cited, and usable in staff analysis.

<a id="civicpermit"></a>

#### Townlight Permitting

Owner: Planning / Building / Community Development
Depends on: Townlight Core, Townlight Code, Townlight Zoning
Status: v0.2.2 no-functional-upgrade demotion label; queued for Tier 2 real work.
Purpose: pre-application and intake copilot for permits and development review. Not a permitting system of record.

<a id="civicinspect"></a>

#### Townlight Inspections

Owner: Code Enforcement / Building / Fire Prevention
Depends on: Townlight Core, Townlight Code
Status: v0.2.2 no-functional-upgrade demotion label; queued for Tier 2 real work.
Purpose: inspection assistant for photo/voice-to-report drafting, repeat-case lookup, and notice generation. Inspectors own every decision.

### Tier 3 - Administrative Expansion

<a id="civicgrants"></a>

#### Townlight Grants

Owner: City Manager / Finance / Administration / Economic Development
Depends on: Townlight Core, Townlight Records
Status: demoted recovery label v0.2.0; false v1.0.0 tag created against the recovery halt.
Purpose: opportunity triage, eligibility matching, application drafting, compliance calendars, and audit-ready grant files.

<a id="civicprocure"></a>

#### Townlight Procurement

Owner: Finance / Purchasing / Clerk / Legal
Depends on: Townlight Core, Townlight Meetings, Townlight Contracts
Status: demoted recovery label v0.2.0; false v1.0.0 tag created against the recovery halt.
Purpose: RFP drafting, proposal comparison, exception extraction, scoring summaries, board memos, and award packets.

<a id="civiccontracts"></a>

#### Townlight Contracts

Owner: Clerk / Legal / Finance / Department contract managers
Depends on: Townlight Core, Townlight Procurement, Townlight Records
Status: foundation surface; not v1.0 product-ready.
Purpose: central contract repository with clause Q&A, expiration tracking, renewal visibility, and public-records-aware exports.

<a id="civicboards"></a>

#### Townlight Boards

Owner: City Clerk / Board liaisons
Depends on: Townlight Core, Townlight Meetings
Status: foundation surface; not v1.0 product-ready.
Purpose: non-Council boards and commissions: members, terms, vacancies, attendance, agendas, packets, minutes, and public notices.

<a id="civicnotice"></a>

#### Townlight Notice

Owner: City Clerk / Communications
Depends on: Townlight Core, Townlight Access, Townlight Meetings, Townlight Procurement, Townlight Boards
Status: foundation surface; not v1.0 product-ready.
Purpose: compliance workflow for public hearings, legal notices, bid notices, vacancies, and statutory publication deadlines.

### Tier 4 - Operations

<a id="civic311"></a>

#### Townlight 311

Owner: Public Works / Utilities / Neighborhood Services / Code Enforcement
Depends on: Townlight Core, Townlight Access, Townlight Code
Status: foundation surface; not v1.0 product-ready.
Purpose: resident service request intake with AI triage, deduplication, routing, and Open311-compatible export.

<a id="civiccomms"></a>

#### Townlight Communications

Owner: Clerk / Communications / Administration / Mayor & Manager's Office
Depends on: Townlight Core, Townlight Meetings, Townlight Code, Townlight Access
Status: foundation surface; not v1.0 product-ready.
Purpose: source-backed public explainers, meeting summaries, ordinance summaries, newsletters, FAQ generation, and multilingual public notices.

<a id="civicdata"></a>

#### Townlight Data

Owner: IT / Clerk / Administration / Analysts
Depends on: Townlight Core
Status: foundation surface; not v1.0 product-ready.
Purpose: municipal system normalization, open-data-ready packages, searchable archive bundles, CKAN integration, and records retention exports. v0.1.1 ships dataset normalization, data-dictionary drafts, CKAN metadata drafts, PII/exemption preflight, archive-bundle checklists, publication planning, an accessible public sample UI, and civiccore==0.3.0 alignment. Live CKAN publishing, BI dashboards, data warehouse storage, autonomous redaction, and external connector runtime are not shipped.

<a id="civicregwatch"></a>

#### Townlight Regulatory Watch

Owner: City Manager / City Attorney / Department heads
Depends on: Townlight Core. Optional escalation targets: Townlight Legal and Townlight Meetings.
Status: planned foundation module; detailed implementation spec in `specs/05_civicregwatch.md`
Purpose: federal regulatory intelligence for municipal operators. Townlight Regulatory Watch monitors documented public federal APIs, narrows new regulatory activity to city-relevant domains, and creates human-reviewable alerts with deadlines, domains, source hashes, and escalation paths. It is not a compliance system and never emits legal opinions or automatic actions.

<a id="civicapi"></a>

#### Townlight API

Owner: IT / Clerk / Open data administrator
Depends on: Townlight Core and module-owned publication contracts; optional Townlight Data relationship for dataset packages.
Status: planned foundation module; detailed implementation spec in `specs/06_civicapi.md`
Purpose: the city's public read-only data gateway over structured, human-approved, published Townlight records. Townlight API exposes versioned, rate-limited, provenance-stamped API responses for records explicitly published by originating modules. It is not a write API, scraper, vendor aggregator, or replacement for Townlight Data bulk publication.

### Tier 5 - Internal Business

<a id="civichr"></a>

#### Townlight HR

Owner: Human Resources
Depends on: Townlight Core
Status: foundation surface; not v1.0 product-ready.
Purpose: personnel policy Q&A, job description drafting, onboarding packet generation, and internal HR knowledge support. Not an HRIS. v0.1.1 ships policy lookup outlines, handbook summaries, job-description drafts, classification references, onboarding/training checklists, intake templates, source review, sensitive-topic preflight, an accessible public sample UI, and civiccore==0.3.0 alignment. HRIS, payroll, benefits administration, personnel records management, employment-law advice, personnel-file ingestion, live LLM calls, and external HR/payroll connector runtime are not shipped.

<a id="civicbudget"></a>

#### Townlight Budget

Owner: Finance / City Manager / Department budget leads
Depends on: Townlight Core, Townlight Meetings, Townlight Data
Status: foundation surface; not v1.0 product-ready.
Purpose: budget memo drafting, departmental budget narratives, line-item analysis, and hearing packet prep. Not a budgeting system.

<a id="civiclegal"></a>

#### Townlight Legal

Owner: City Attorney / Paralegal / Clerk
Depends on: Townlight Core, Townlight Code, Townlight Meetings, Townlight Contracts
Status: foundation surface; not v1.0 product-ready.
Purpose: Q&A over the city's own legal corpus, including ordinances, resolutions, contracts, legal opinions, litigation history, statutes, and prior Council actions.

<a id="civicelections"></a>

#### Townlight Elections

Owner: City Clerk / Election Official
Depends on: Townlight Core, Townlight Code, Townlight Access
Status: foundation surface; not v1.0 product-ready.
Purpose: support for cities running their own elections: candidate filing guidance, voter information Q&A, ballot question drafting support, election worker training, and accessible materials.

### Tier 6 - Specialized

<a id="civicutility"></a>

#### Townlight Utilities

Owner: Utilities / Customer Service
Depends on: Townlight Core, Townlight 311
Status: foundation surface; not v1.0 product-ready.
Purpose: utility customer-service copilot for account lookup, billing Q&A, payment arrangement drafting, and service request intake. Not a billing system.

<a id="civiccourt"></a>

#### Townlight Courts

Owner: Court Clerk / Municipal Court
Depends on: Townlight Core in isolated profile
Status: foundation surface; not v1.0 product-ready.
Purpose: document preparation and search support for municipal court clerks. Sensitive deployment; tight scoping required.

<a id="civicsafety"></a>

#### Townlight Safety

Owner: Public Safety administration
Depends on: Townlight Core in isolated CJIS-aware profile
Status: foundation surface; not v1.0 product-ready.
Purpose: policy/procedure Q&A, non-CJIS administrative workflows, and public-information-officer support. Explicitly excludes operational dispatch and CJIS-bound data unless a future CJIS compliance program exists.

<a id="civiclibrary"></a>

#### Townlight Library

Owner: Library Director / Reference Librarians
Depends on: Townlight Core
Status: foundation surface; not v1.0 product-ready.
Purpose: library policy Q&A, program and event Q&A, collection-metadata reference assistance, collection-development guidance, and accessibility support. Explicitly excludes patron records, ILS integration, circulation actions, professional-reference replacement, legal advice, live LLM calls, and connector runtime.

<a id="civicparks"></a>

#### Townlight Parks

Owner: Parks & Recreation Director
Depends on: Townlight Core, Townlight 311
Status: foundation surface; not v1.0 product-ready.
Purpose: parks/facility/program Q&A, registration-link assistance, policy lookup, maintenance request triage, and resident-facing parks information. Explicitly excludes payment processing, registration writes, participant records, reservation writes, crew dispatch, live LLM calls, and connector runtime.

<a id="8-civicrecords-canonical-scope"></a>

## 8. Townlight Records Canonical Scope

Townlight Records is Module 1 and the architectural template.

### 8.1 Product Promise

Any resident should be able to search for public records, request what is missing, and understand the status of the request without insider knowledge of government structure.

Any records clerk should be able to triage, search, review, redact, and respond from one calm interface instead of email, spreadsheets, and paper.

### 8.2 Current Capability Themes

- Request workflow management
- Search sessions, queries, and results
- Records request intake and tracking
- Request documents and request timeline
- Request messages
- Response letter drafting
- Fee schedules, fee line items, fee waivers
- Notification templates and notification log
- Exemption rules and exemption flags
- Data sources and connector templates
- Document cache
- Public landing/register/submit surfaces where implemented
- Admin/settings/user-management surfaces

### 8.3 Request Lifecycle

Canonical lifecycle:

`received -> clarification_needed -> assigned -> searching -> in_review -> ready_for_release -> drafted -> approved -> fulfilled -> closed`

### 8.4 Non-Negotiable Records Rules

- No automatic release.
- No automatic denial.
- No automatic redaction.
- AI outputs are drafts and require staff review.
- Exemptions must cite rule/category/source.
- Public-facing request language must be plain and actionable.
- Search and document visibility must respect permissions and staff-only boundaries.

### 8.5 Planned Records Work

- Public request portal completeness
- Public request tracking
- Redaction ledger
- Stronger discovery/connection engine
- SMTP delivery completion where not fully implemented
- Federation workflows where appropriate
- Accessibility fixes from the v3.0 audit: touch targets, focus visibility, skip navigation, non-color-only badges, keyboard completion, form-error focus, screen-reader validation

<a id="9-civicclerk-canonical-scope"></a>

## 9. Townlight Meetings Canonical Scope

Townlight Meetings is Module 2. Current release truth is Townlight Meetings v1.0.4 with the protected-default staff-auth recovery line retained; current shipped Townlight Core compatibility remains recorded in the compatibility matrix and installer metadata. The canonical scope below describes the product target that must be proven before any city-deployable clerk-core claim.

### 9.1 Product Promise

Townlight Meetings replaces brittle meeting-management workflows with a clerk-first, locally deployed system for agendas, packets, minutes, voting, notices, and public meeting records. It is citation-grounded and sunshine-law aware.

<a id="92-the-nine-civicclerk-functions"></a>

### 9.2 The Nine Townlight Meetings Functions

Townlight Meetings covers:

1. Agenda item intake
2. Packet assembly
3. Staff report normalization
4. Meeting notice and posting compliance
5. Motion, vote, and action-item capture
6. Minute drafting from packet/transcript/notes with sentence citations
7. Ordinance/resolution extraction, diffing, and handoff to Townlight Code
8. Meeting archive search across packets/minutes/transcripts
9. Public meeting portal with accessible posting

<a id="93-civicclerk-does-not"></a>

### 9.3 Townlight Meetings Does Not

- Replace the clerk.
- Make legal compliance determinations without human review.
- Publish notices without clerk confirmation.
- Open closed-session content to public queries.
- Replace livestream platforms.
- Replace codification systems on day one.

### 9.4 Agenda Item Lifecycle

Canonical agenda item lifecycle:

`DRAFTED -> SUBMITTED -> DEPT_APPROVED -> LEGAL_REVIEWED -> CLERK_ACCEPTED -> ON_AGENDA -> IN_PACKET -> POSTED -> HEARD -> DISPOSED -> ARCHIVED`

Invalid transitions are rejected at the API layer and audit logged.

### 9.5 Meeting Lifecycle

Canonical meeting lifecycle:

`SCHEDULED -> NOTICED -> PACKET_POSTED -> IN_PROGRESS -> RECESSED -> ADJOURNED -> TRANSCRIPT_READY -> MINUTES_DRAFTED -> MINUTES_POSTED -> MINUTES_ADOPTED -> MINUTES_SIGNED -> ARCHIVED`

Additional paths:

- Cancelled meeting path
- Emergency/special meeting path with statutory-basis capture
- Closed/executive session blocks with separate notice/minutes controls

### 9.6 Clerk-Facing Workflows

- Create and maintain meeting bodies.
- Schedule regular, special, emergency, and cancelled meetings.
- Manage agenda item intake and departmental approvals.
- Assemble packets in correct order.
- Track posting deadlines and posting proof.
- Capture motions, seconds, votes, abstentions, recusals, and absences.
- Draft minutes from packet, transcript, and clerk notes.
- Produce signed/adopted minutes archive.
- Preserve correction history for motions/votes/minutes.

### 9.7 Staff-Facing Workflows

- Draft agenda items.
- Attach staff reports and supporting documents.
- Submit reports for department/legal/clerk review.
- Normalize staff reports into standard format.
- Route revisions without losing history.
- Sign off with audit record.

### 9.8 Member-Facing Workflows

- View packets.
- Review item history.
- View staff reports, attachments, and prior versions according to role.
- Record votes and conflicts where appropriate.

### 9.9 Public-Facing Workflows

- Public meeting calendar.
- Meeting detail page.
- Agenda and packet download.
- Public comment intake where enabled.
- Adopted minutes archive.
- Searchable meeting archive.
- Accessible posting and plain-language summaries where approved.

<a id="910-civicclerk-data-model"></a>

### 9.10 Townlight Meetings Data Model

Townlight Meetings introduces module-specific tables in the `civicclerk` schema. The runtime implementation should use this list as the starting point and must document any ADR-approved deviation.

Canonical tables:

- `civicclerk.meeting_bodies`
- `civicclerk.meetings`
- `civicclerk.agenda_items`
- `civicclerk.staff_reports`
- `civicclerk.motions`
- `civicclerk.votes`
- `civicclerk.public_comments`
- `civicclerk.notices`
- `civicclerk.minutes`
- `civicclerk.transcripts`
- `civicclerk.action_items`
- `civicclerk.packet_versions`
- `civicclerk.ordinances_adopted`
- `civicclerk.closed_sessions`

Required cross-cutting properties:

- Versioned packet snapshots.
- Immutable motion/vote records after capture; corrections reference originals.
- Staff-only ACL for closed-session material.
- Document references into Townlight Core document tables once those tables are fully extracted.
- Permission-aware archive search.

<a id="911-civicclerk-prompt-library"></a>

### 9.11 Townlight Meetings Prompt Library

Townlight Meetings prompts ship as versioned YAML. Minimum prompt set:

- Agenda item summary
- Staff report normalizer
- Packet completeness reviewer
- Notice compliance reviewer
- Motion/vote summary
- Minute drafter
- Ordinance/resolution extractor
- Closed-session safe summarizer/refuser
- Public plain-language meeting explainer

Public-facing output prompts require clerk and attorney approval before deployment.

<a id="912-civicclerk-restapi-scope"></a>

### 9.12 Townlight Meetings REST/API Scope

The Townlight Meetings module spec designs approximately 25 endpoints. Implementation should cover:

- Meeting bodies
- Meetings
- Agenda items
- Staff reports
- Packets
- Notices/postings
- Motions
- Votes
- Minutes
- Transcripts
- Public comments
- Action items
- Ordinance/resolution handoff
- Archive search
- Admin prompt/config surfaces

<a id="913-civicclerk-frontend-scope"></a>

### 9.13 Townlight Meetings Frontend Scope

The Townlight Meetings module spec designs approximately 20 pages. Runtime planning should include:

- Staff dashboard
- Meeting calendar
- Meeting detail
- Agenda builder
- Agenda item intake
- Staff report editor
- Packet builder
- Notice checklist/posting proof
- Live meeting capture
- Minutes drafting/review
- Motions/votes/action-items page
- Transcript management
- Public comment review
- Closed-session staff-only workspace
- Archive search
- Public meeting calendar
- Public meeting detail
- Admin settings
- Prompt library admin
- Connector/import admin

<a id="914-civicclerk-integrations"></a>

### 9.14 Townlight Meetings Integrations

Priority integrations:

- Granicus / Legistar / PrimeGov / NovusAGENDA import readers
- Video/livestream link embedding
- Caption/transcript ingest
- City website CMS posting
- Townlight Code handoff API for adopted ordinances/resolutions
- Townlight Records search integration
- Codification-system export where Townlight Code is absent

<a id="915-civicclerk-test-matrix"></a>

### 9.15 Townlight Meetings Test Matrix

Required test areas:

- Agenda lifecycle
- Meeting lifecycle
- Packet assembly
- Notice compliance
- Motion/vote capture
- Minute drafting with citations
- Transcription and segment timestamps
- Closed-session boundary
- Public comment handling
- Migration/import fidelity
- RBAC and packet visibility
- Archive search permissions
- Accessibility
- Air-gap behavior
- Townlight Core compatibility matrix

<a id="10-civiczone-canonical-scope"></a>

## 10. Townlight Zoning Canonical Scope

Townlight Zoning is the first major Tier 2 product after Clerk Core.

### 10.1 Product Promise

Townlight Zoning answers routine parcel-aware zoning questions with citations while never making a zoning determination. It gives residents and planners the 80% answer and routes the 20% judgment cases to staff.

### 10.2 Resident Workflows

- Enter address or select parcel.
- See zone, overlays, mapped constraints, and source citations.
- Ask plain-language questions such as "Can I build an ADU?"
- Receive cited informational answer with explicit non-determination disclaimer.
- Learn when variance, CUP, or planner review may be needed.

### 10.3 Staff Workflows

- Planner Q&A with code cross-references.
- Ambiguity review queue.
- High-volume question analytics.
- Draft staff-report outline support.
- Review and improve flagged answers.

<a id="104-civiczone-data-model"></a>

### 10.4 Townlight Zoning Data Model

Canonical Townlight Zoning tables:

- `civiczone.zones`
- `civiczone.overlays`
- `civiczone.parcels`
- `civiczone.use_categories`
- `civiczone.use_rules`
- `civiczone.dimensional_rules`
- `civiczone.citations`
- `civiczone.precedents`
- `civiczone.interpretation_notes`
- `civiczone.zone_questions`

<a id="105-civiczone-prompt-and-safety-rules"></a>

### 10.5 Townlight Zoning Prompt And Safety Rules

- Every answer says it is not a zoning determination.
- Answers cite zoning code sections.
- Determination requests are refused or escalated.
- Out-of-jurisdiction questions are refused.
- Low-confidence results escalate to planner review.
- Staff-only precedent context is never exposed to residents.

<a id="106-civiczone-integrations"></a>

### 10.6 Townlight Zoning Integrations

Priority integrations:

- Esri ArcGIS REST Feature Service
- GeoJSON fallback for offline/non-Esri cities
- Townlight Code internal API for authoritative code text
- Townlight Meetings internal API for variance/CUP hearing minutes as staff-only precedent context
- Townlight Planning internal API for comprehensive-plan policy context
- Townlight Access internal API for plain-language rewrites
- County assessor data import
- CKAN publication for anonymized trends

<a id="107-civiczone-test-matrix"></a>

### 10.7 Townlight Zoning Test Matrix

Required test areas:

- Parcel lookup
- Use-matrix lookup
- Dimensional pre-check
- Variance/CUP explainer
- Citation contract
- Disclaimer enforcement
- Refusal rules
- RBAC
- GIS ingestion
- Air-gap behavior
- Accessibility
- Performance
- Townlight Core compatibility matrix

<a id="11-civiccode-canonical-scope"></a>

## 11. Townlight Code Canonical Scope

Townlight Code is a critical Tier 1 dependency for Townlight Zoning and shipped before Townlight Zoning runtime work began.

Purpose:

- Authoritative municipal code store.
- Cited code Q&A for staff and residents.
- Plain-language explanations alongside authoritative text.
- Ordinance adoption feed from Townlight Meetings.
- Amendment/version history.
- Section resolution service for Townlight Zoning, Townlight Legal, Townlight Access, and Townlight Communications.

Non-negotiables:

- It must not give legal advice.
- It must cite exact sections.
- It must distinguish adopted law from pending ordinance language.
- It must preserve code version/date context.

<a id="12-civicaccess-canonical-scope"></a>

## 12. Townlight Access Canonical Scope

Townlight Access is the suite-wide accessibility and plain-language layer.

Purpose:

- Accessible forms.
- Accessible publishing workflow.
- WCAG review support.
- Plain-language rewrites.
- Multilingual variants.
- ADA Title II review support.
- Tagged-heading PDF expectations.
- Records-ready accessible exports.

It should be treated as horizontal infrastructure that every public-facing module eventually uses.

## 13. Resident Portal Strategy

The old Townlight Records-only "public portal" concept is too narrow.

Each module needs its own public surface, unified by a shared resident portal shell:

- Request a record: Townlight Records
- Find a meeting: Townlight Meetings
- Read code: Townlight Code
- Ask zoning questions: Townlight Zoning
- Submit service request: Townlight 311
- Read notices: Townlight Notice
- View accessibility-friendly content: Townlight Access

The resident portal should not become a forced monolith. It is a shell and routing layer over module-owned public surfaces.

## 14. Universal Discovery And Municipal Systems Catalog

The Townlight Records discovery architecture is a suite-level asset, not merely a records feature.

The Municipal Systems Catalog should become:

- A connector directory.
- A map of the city's existing systems.
- A module recommendation engine.
- An onboarding checklist.
- A data-sensitivity map.
- A governance artifact showing what is connected, indexed, ignored, or deliberately air-gapped.

Connector domains include:

- Finance and budgeting
- Public safety
- Land use and permitting
- HR
- Document management
- Email and communication
- Utilities and public works
- Courts/legal
- Parks and recreation
- Asset/fleet management
- Legacy/custom systems

Protocols include:

- File system / SMB
- SMTP / IMAP journal
- REST API
- ODBC / JDBC
- GIS REST API
- Vendor SDK
- Manual/export drop

## 15. Governance And Compliance

### 15.1 Human In The Loop

Every consequential AI output remains a draft. Approval authority is role-based and auditable.

### 15.2 Auditability

Each module must record:

- Who acted
- What was changed
- Which source material was used
- Which model generated the draft
- Which prompt version was used
- Which human approved or rejected it

### 15.3 Public Records And Retention

Modules must assume their outputs may themselves become public records. Export, retention, and legal hold behavior must be considered in every module.

### 15.4 Accessibility

Public surfaces target WCAG 2.2 AA. Staff surfaces should also meet practical keyboard, focus, contrast, and screen-reader expectations.

### 15.5 Air-Gap And Network Behavior

No module may require outbound runtime calls in the default local deployment profile. External provider integrations must be explicit, configurable, and disabled by default.

## 16. Release And Versioning Rules

Every repo must keep version truth synchronized across:

- Code/package metadata
- README and README.txt
- User manuals
- Landing page
- CHANGELOG
- Installer metadata where applicable
- Tests that assert displayed version
- Generated docs/binaries
- GitHub release notes
- Compatibility matrix

Every release must have:

- Version bump
- CHANGELOG section
- Verification log
- Passing CI
- Release assets where applicable
- SHA/checksum where applicable
- GitHub release marked Latest when appropriate

## 17. Documentation Standard

Every repo must include:

- `README.md`
- `README.txt`
- `USER-MANUAL.md`
- `USER-MANUAL.txt`
- PDF and DOCX renderings are optional and produced by `scripts/build-docs.sh` where available. Markdown is canonical.
- `CHANGELOG.md`
- `CONTRIBUTING.md`
- `CODE_OF_CONDUCT.md`
- `SECURITY.md`
- `SUPPORT.md`
- `LICENSE`
- `LICENSE-CODE` when docs and code use different licenses
- `.github/ISSUE_TEMPLATE/`
- `.github/PULL_REQUEST_TEMPLATE.md`
- `docs/index.html`
- Architecture docs with actual diagrams where architecture is user-facing
- GitHub Discussions seed posts

For a shipping product, these docs must be honest about what ships today and what is planned.

## 18. Current Shipped State

As of 2026-05-10, current shipped/recovery truth lives in these single sources:

- [STATUS.md](../STATUS.md) at the umbrella root: module-by-module honest status.
- [docs/release-recovery-status.md](release-recovery-status.md): recovery-gate scoreboard and incident log.
- [docs/compatibility/index.md](compatibility/index.md): module/version/CivicCore pairings.
- `scripts/verify-suite-state.py`: executable consistency check.

This section previously enumerated per-module shipping prose. That prose drifted faster than the spec could be edited and conflicted with recovery framing. It is replaced by this compact recovery table. Any per-module shipping claim in section 6.1, section 7, or sections 11-12 must be cross-checked against STATUS.md before it is repeated externally.

As of 2026-05-21, the clerk-core installer evidence includes installed-stack workflow proof for Townlight Records request/search-surface/review/response handling and Townlight Meetings agenda/packet/minutes/vote/notice/archive handling. That proof is starter-profile lifecycle evidence only; it does not supersede queued per-module release gates and does not prove live cross-module records exchange. `installer-clerk-core-v0.1.0` is the current public-use starter release after release-lockstep, suite verification, installer verification, docs verification, release-gate audit, and main CI passed. The release is bounded to Townlight Core, Townlight Records, Townlight Meetings, and the `clerk-core` installer profile; it does not create a full-suite, procurement, production hosting, airgap, city-ready full-suite, or macOS lifecycle certification claim.

As of 2026-06-13, the city-core profile has implementation evidence for non-technical Windows and Linux installability with Townlight Core v1.2.0, Townlight Records v1.7.3, Townlight Meetings v1.0.4, and Townlight Code v1.0.8. The vendored-source installer artifacts remain installer version `0.1.2`; the evidence covers one-click wrapper smoke, the local suite launcher, Guided/Manual Docker prerequisite setup paths, Linux Docker signed-repository bootstrap where supported, first-run wizard smoke, first-run browser QA, 60 GB cleanroom hygiene, local Windows/Linux matching-host lifecycle runs, green PR CI, and audit-full with zero unresolved Blocker or Critical findings under `C:\dev\Claude\CivicSuite-city-core-caboose-item1\.agent-runs\2026-05-26-city-core-non-technical-installable\`. PR #183 has green verify, release-lockstep-gate, and installer-cleanroom checks; exact volatile run IDs are recorded in the PR body and run evidence. Townlight Meetings v1.0.4 supersedes v1.0.3 as the clerk package/source truth, but the honest suite state remains beta-ready truth-reconciled. This does not create public-use readiness, city-ready status, procurement readiness, production readiness, macOS lifecycle certification, or a full-suite release claim.

As of 2026-05-27, `installer/modules.json` is also the source-of-truth for city-core vendored-source commit pins. The installer generator must verify each local sibling checkout against that module's `source_commit` before packaging, and the lifecycle runner must verify bundled source through `SOURCE_COMMIT.txt` or a git HEAD match before use. This makes the vendored-source model reproducible without switching to published wheels. The operator trust path is live regenerated artifact evidence: generated `SHA256SUMS` or release-manifest hashes for the installer package, `source_commit` verification for vendored source, and published module hashes/attestations where applicable. Old committed `installer/dist` artifacts are not canonical unless Scott explicitly confirms restoration.

As of 2026-08-20, the active release lane is the Townlight Records beta candidate: Townlight Core 1.2.1 plus Records 1.7.3, Notice 0.2.0, and Access 0.4.0. The exact candidate sources below are pinned in `installer/modules.json`. This is an unsigned, non-publishable candidate until the separate main-only signing and signed clean-machine publication gates pass.

The suite launcher currently records local browser/runtime session state for installed services. That shared launcher session is an operator orientation and QA surface, not a completed municipal SSO, identity-federation, or managed cloud-session claim.

| Repo | Current recovery label | Townlight Core pin | Source commit pin | Status summary |
|---|---:|---:|---:|---|
| civiccore | 1.2.1 | n/a | b4d0156bdc6883c1c3ef167abe0379f9ca32b258 | Townlight Core platform pinned for the Records beta candidate, including the Windows-local contracts and PostgreSQL-backed local task queue/worker. |
| civicrecords-ai | 1.7.3 | 1.2.1 | edf1c8d8078c85baff691030a599b8eef670bca6 | Townlight Records beta source with deterministic demonstration fixtures and connector provenance; the published package release remains 1.7.3. |
| civicclerk | 1.0.4 | 1.2.0 | fa1874edfe977bfc36ddea2939df6464b5bc16be | Real meeting workflow release car with protected staff auth defaults retained, persistence refresh, and a workflow-only release-upload repair on the pinned default-branch source head. |
| civiccode | 1.0.8 | 1.2.0 | a960bba0a2249d118b593dd61bee3a65a69a9d77 | City-core municipal-code release car; v1.0.8 supersedes v1.0.0, consumes Townlight Core shared ingestion, and post-PR-#76 uses `gemma4:e4b` as the suite installer default local model. |
| civicaccess | 0.4.0 | 1.2.1 | b9100edc80ca496d6061f1cdb3eb39a60ff5f31a | Townlight Access accessibility and records-release review capability pinned for the Records beta candidate. |
| civicnotice | 0.2.0 | 1.2.1 | 79b8d07199ee77cd425b31c0e0a44f3a0832b810 | Townlight Notice deadline, publication-proof, and archive capability pinned for the Records beta candidate. |
| civiczone | 0.2.2 | 1.1.0 | n/a | No-functional-upgrade demotion label; queued for Tier 2 real work. |
| civicplan | 0.2.2 | 1.1.0 | n/a | No-functional-upgrade demotion label; queued for Tier 2 real work. |
| civicpermit | 0.2.2 | 1.1.0 | n/a | No-functional-upgrade demotion label; queued for Tier 2 real work. |
| civicinspect | 0.2.2 | 1.1.0 | n/a | No-functional-upgrade demotion label; queued for Tier 2 real work. |
| civicgrants | 0.2.0 | 1.1.0 | n/a | Demoted from false v1.0.0; consumes Townlight Core v1.1.0 shared `staff_key_gate`. |
| civicprocure | 0.2.0 | 1.1.0 | n/a | Demoted from false v1.0.0; consumes Townlight Core v1.1.0 shared `staff_key_gate`. |

The Townlight Records candidate now exercises an end-to-end Records workflow, but it is not a published municipal release until its exact signed MSI passes the publication gates. Broader suite productization continues one module at a time.
## 19. Post-Foundation Build Sequence

The v0.1.x foundation lane created real repository surfaces and release artifacts, but it did not create city-ready products. The next sequence is recovery first, then productization:

1. Complete Sprint A release-integrity demotion and lockstep gates.
2. Keep the installer profile and per-module version pin strategy aligned with released artifacts.
3. Resume productization one module at a time from the active queue; no lateral v1.0 sweeps.
4. Continue Townlight Core shared-extraction depth only where an active module needs the shared capability.
5. Add cross-module tests before advertising suite-level workflows.
6. Update the compatibility matrix, spec, verifier, installer metadata, downstream pins, changelog, tag, and release notes together whenever a release label changes.

Parallel Townlight Core work should extract only the shared capabilities needed by the active module and should not invent unused abstractions.
## 20. Open Questions Requiring ADRs

These are not blockers to this spec, but they require explicit ADRs before implementation choices harden:

- Exact Townlight Meetings MVP table list if reduced from the canonical table set.
- Whether Townlight Meetings v0.1 includes public comments.
- Whether transcription is v0.1 or v0.2.
- Post-foundation module depth and integration sequencing after the v0.1.1 civiccore alignment lane.
- Shared resident portal shell boundaries.
- Townlight Core auth/RBAC extraction order.
- Townlight Core document/search extraction order.
- Prompt-library repository strategy.
- Data-release strategy for state statutory rules.
- Townlight Regulatory Watch polling-source terms, rate-limit floors, and source disablement policy.
- Townlight Regulatory Watch escalation contract into Townlight Legal and Townlight Meetings.
- Townlight API inter-module read contract protocol: shared database, internal HTTP API, or event queue.
- Townlight API public payload storage strategy: originating module snapshot vs live fetch.
- Townlight API request-log visibility and default rate-limit tier policy.

<a id="21-civicregwatch-canonical-scope"></a>

## 21. Townlight Regulatory Watch Canonical Scope

Townlight Regulatory Watch is the planned federal regulatory intelligence module. It monitors public federal regulatory sources and creates staff-reviewable alerts for activity that may affect municipal operations, finances, grants, labor, land use, housing, courts, elections, accessibility, public safety, procurement, utilities, or environmental programs.

Detailed implementation specification: `specs/05_civicregwatch.md`.

### 21.1 Product Promise

City staff should be able to open Townlight Regulatory Watch and quickly understand whether federal regulatory activity from the last 24 to 72 hours deserves attention. Every alert must say what changed, which municipal domains may be touched, whether a deadline exists, and what follow-up is appropriate.

### 21.2 Non-Negotiables

- Townlight Regulatory Watch is not a compliance system.
- Townlight Regulatory Watch does not issue legal opinions or applicability determinations.
- Townlight Regulatory Watch does not take automatic action in any other module.
- All source access must use documented public APIs only; scraping and unofficial endpoints are prohibited.
- Source calls are logged with timestamp, endpoint, and response hash.
- Any status transition, dismissal, escalation, or archival action requires a human actor.
- v0.1.x must work without live LLM calls.

### 21.3 Planned v0.1.x Foundation

Planned v0.1.x scope is schema, migrations, deterministic domain classification, Federal Register polling, alert list/detail/review APIs, poll-run logging, circuit breaker behavior, accessible module overview, documentation gates, and Townlight Core alignment.

Not shipped in v0.1.x: LLM-assisted classification, LLM summaries, Regulations.gov/Congress.gov/USASPENDING polling, comment reminders, CivicLegal/CivicClerk escalation writes, notification delivery, webhooks, and state regulatory monitoring.

<a id="22-civicapi-canonical-scope"></a>

## 22. Townlight API Canonical Scope

Townlight API is the planned public read-only data gateway over structured, human-approved, published Townlight records. It exposes city-controlled, versioned, rate-limited API responses with provenance and citation metadata.

Detailed implementation specification: `specs/06_civicapi.md`.

### 22.1 Product Promise

Developers, journalists, researchers, oversight agencies, neighboring municipalities, and residents should be able to access a city's published operational records through a single documented REST API. No record appears in Townlight API unless a human explicitly approved its publication in the originating module.

### 22.2 Non-Negotiables

- Townlight API is read-only without exception.
- Townlight API only serves public-safe projections approved by originating modules.
- Townlight API never exposes staff-only, closed-session, privileged, exempt, or PII-containing data.
- Townlight API does not scrape or aggregate third-party government APIs.
- Every response includes a consistent envelope and citation/provenance block.
- Originating modules define publication gates; modules without a gate cannot contribute records.
- API keys are hashed at rest, rate-limited, and audit-logged.

### 22.3 Planned v0.1.x Foundation

Planned v0.1.x scope is schema, migrations, publication index, schema registry, module registry, API key model, Redis-backed rate-limit infrastructure, catalog endpoint, health endpoint, response envelope, citation block, documentation gates, accessible overview, and documented empty states for unwired publication contracts.

Not shipped in v0.1.x: live module publication contracts, key issuance UI, city-branded developer portal, webhooks, CSV exports, or full public internet deployment management.

## 23. Precedence Rules

When documents conflict:

1. Current repository source code and release artifacts define what ships.
2. This unified specification defines the intended suite architecture and product roadmap.
3. Module-specific specs define detailed module behavior unless superseded here.
4. Older DOCX drafts are historical inputs.
5. Marketing/landing pages must follow shipped truth and may not promote planned behavior as shipped.

## 24. Working Rule

No future Townlight implementation sprint should begin from memory or from an isolated module scaffold. It should begin by reading this document, the relevant module-specific spec, current repo state, and the current compatibility matrix.
