**Townlight AI**

A Clerk-First, Airgappable, Local-LLM Municipal Operations Suite

*Comprehensive Module Catalog, Architecture, and Roadmap*

Version 1.0 --- April 23, 2026

Open source · Apache License 2.0 · 100% local inference · Gemma 4 first,
model-pluggable

Architecture pattern: Townlight Records

Document Metadata

  ---------------------------- ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  **Status**                   Strategic product catalog --- v1.0 initial draft
  **Supersedes**               Open\_Source\_AI\_for\_Municipalities.docx (internal strategy draft), Townlight Records-AI\_Suite.docx (market framing draft)
  **Grounded in**              CivicRecordsAI-UnifiedSpec-v3.0 (April 13, 2026) --- the canonical Module 1 specification
  **Purpose**                  Define the full suite of modules that a small or mid-sized city can install, one at a time, all inheriting the Townlight Records architecture
  **License**                  Apache License 2.0 for code. Suite documentation under CC BY 4.0 (recommended; configurable).
  **License note**             Code license is Apache License 2.0 (SPDX: Apache-2.0). Documentation is CC BY 4.0. Earlier drafts referenced MIT; the project standardized on Apache 2.0 on 2026-04-23 to align with civicrecords-ai.
  **Architecture authority**   Townlight Records is the architectural template. Every module inherits Townlight Core (auth, RBAC, audit, LLM abstraction, connectors, search, notifications).
  **Default model**            Gemma 4 via Ollama (local). Model registry + context\_window\_size enables drop-in replacement.
  **Deployment profiles**      single-workstation · small on-prem server · segmented/air-gapped for sensitive modules
  ---------------------------- ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

Table of Contents

Part I. Strategic Framing

1\. Executive Summary

Townlight AI is an open-source, Apache-2.0-licensed, airgappable, local-LLM
municipal operations suite for small and mid-sized cities. It is
clerk-first: it starts where the records live, where the meetings
happen, and where the code gets adopted --- then expands outward to
every function a city actually runs day-to-day.

Module 1 --- Townlight Records --- is already shipping and serves as the
architectural template for every subsequent module. Every module
inherits the same foundation: FastAPI, PostgreSQL with pgvector, Redis,
Celery, Ollama with Gemma 4, hash-chained audit logging, connector
framework, onboarding wizard, role-based access control, and sovereignty
guarantees. Cities install Townlight Core once and add modules as needs
demand.

The suite is positioned against an incumbent landscape dominated by
CivicPlus, OpenGov, Tyler, Granicus, and Accela --- proprietary SaaS
suites that hold municipal data in the cloud and charge per-seat pricing
that small cities cannot sustain. Townlight AI offers a sovereign
alternative: local data, local inference, and modular adoption. It does
not attempt to replace ERP, utility billing, permitting systems of
record, CAD/RMS, or courts on day one. It wins where municipal AI is
genuinely novel: clerk workflows, records, ordinances, zoning, planning,
grants, procurement authoring, contracts, boards, HR policy, and
accessibility.

This document defines the full module catalog. The April 23 catalog plus the
2026-04-30 Townlight Regulatory Watch and Townlight API addendum establish Townlight Core plus 27
product modules across 7 tiers. The current suite therefore has 27 product
modules plus the Townlight Core shared platform. It
assesses where the current v3.0 spec is thin, establishes the
shared design principles and architecture pattern, and proposes a
four-phase rollout sequence. It is intended as a working strategic
reference --- an actionable artifact, not a pitch deck.

2\. Assessment of the Current Unified Spec

The CivicRecordsAI-UnifiedSpec-v3.0 (April 13, 2026) is a strong
single-module specification. As a records-module document it is
thorough: lifecycle, RBAC, exemption engine, fee tracking,
notifications, discovery architecture, 50-state compliance, and an
honest repo-alignment pass that separates capability truth from
release-label truth. The design stance --- calm, accessible,
human-in-the-loop --- is the right starting point.

But you are right that it is thin when treated as a suite spec. It\'s
not thin inside its scope; it\'s thin outside it. Several essential
civic surfaces are either absent or treated as generic documents to be
indexed rather than first-class product surfaces:

2.1 Critical gaps

  --------------------------------------- -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- --------------------------
  **Missing surface**                     **Why it matters**                                                                                                                                                                                                                                                                           **Module that fills it**
  Municipal code / ordinance Q&A          The single highest-volume civic question after \'when is trash pickup.\' Chickens, short-term rentals, noise, parking, signs, fences, setbacks, business licenses, food trucks, garage sales, snow removal --- every clerk and front-desk staffer answers these same questions constantly.   Townlight Code
  Zoning code / parcel-aware lookups      The current spec mentions \'Land Use & Permitting\' only as a connector domain in the Municipal Knowledge Graph. But zoning Q&A (\'what zone is my property, what can I build, what are setbacks\') consumes planner time at every city in America.                                          Townlight Zoning
  Comprehensive plan / long-range plans   Not addressed. Comp plans are 150-300 page documents that nobody reads and that should inform every land-use decision. RAG over them is genuinely high-value.                                                                                                                                Townlight Planning
  Boards & commissions beyond Council     The spec assumes \'Council meetings\' but most cities have 5-20 boards: Planning Commission, Board of Adjustment, Historic Preservation, Parks, Library, Housing Authority. Each has its own meetings, members, terms, vacancies, attendance.                                                Townlight Boards
  Public & statutory notice publication   Missing a hearing notice deadline can void an ordinance. Most cities track this in a clerk\'s notebook. This is a compliance workflow, not a content type.                                                                                                                                   Townlight Notice
  Contracts repository with Q&A           Contracts live as PDFs in shared drives. Staff hunt for specific clauses constantly. Local-LLM Q&A over the contract library is obvious, and contracts contain commercially sensitive pricing.                                                                                               Townlight Contracts
  Internal legal research                 City attorneys ask \'when did we last consider this?\' or \'what did the prior Council decide?\' --- currently an email to the clerk. Local-LLM over the city\'s own legal record with access-controlled privileged tiers is a natural fit.                                                  Townlight Legal
  HR policy Q&A                           One of the highest-volume internal queries. Personnel policy, handbook, job descriptions, FMLA, ADA questions. Cloud AI is non-viable (HIPAA, background checks, comp data).                                                                                                                 Townlight HR
  Elections administration                Many home-rule and charter cities run their own elections. Voter info, candidate filing, ballot questions, election worker training. Extremely sensitive --- cloud AI is a non-starter.                                                                                                      Townlight Elections
  --------------------------------------- -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- --------------------------

2.2 Structural observations about the current spec

-   The v3.0 spec treats the Municipal Systems Catalog as a connector
    directory only, when it could also be a map of which modules a given
    city needs. The 12 functional domains in §13.3 of the v3.0 spec
    correspond roughly to the module tiers in this catalog.

-   The \'public portal\' is scoped as a future add-on to Townlight Records.
    But the public-facing use cases are so varied (request a record,
    look up code, check zoning, find a meeting, submit a 311 request,
    read the comp plan) that each module needs its own public surface,
    unified by a shared resident portal shell.

-   The v3.0 spec\'s Universal Discovery & Connection Architecture is
    genuinely novel and should be surfaced as a first-class selling
    point of the suite, not buried in §13. It is the story of how cities
    actually onboard.

-   The v3.0 spec\'s 50-state exemption compliance effort is re-usable
    across every module that handles public records. It should be
    promoted to Townlight Core so every module inherits it.

2.3 What the current spec gets right

-   Repo-aligned status tagging (IMPLEMENTED / PARTIAL / UI SHELL /
    PLANNED) is exactly the discipline every module needs. This document
    adopts the same tagging approach.

-   The design stance (\'calm, accessible, government-appropriate; trust
    through clarity, not visual excitement\') is the right aesthetic for
    the entire suite.

-   The human-in-the-loop enforcement at the API layer is the right
    architectural choice. It should be a Townlight Core primitive, not a
    per-module reimplementation.

-   The onboarding/city-profile/catalog work in v3.0 is genuinely
    advanced and should be the onboarding path for the whole suite.

3\. Design Principles (Suite-Wide Non-Negotiables)

Every module in Townlight AI inherits these rules. They are not
negotiable at the module level; they are enforced at Townlight Core.

3.1 Product principles

-   Clerk-first, staff-first before flashy resident features. Resident
    features land after staff workflows are stable.

-   Modular install, no forced monolith. Cities pick what they need.
    Townlight Core is the only prerequisite.

-   Calm government UI, not startup UI. Aesthetic target: trust through
    clarity.

-   Public-facing features only where they clearly help trust and
    transparency.

-   Every workflow must degrade gracefully without AI. Core functions
    work when the LLM is down.

3.2 AI principles

-   AI drafts, humans decide. No auto-actions on anything consequential.

-   Every material answer cites source. No hallucination-tolerant
    workflows.

-   Policy prompts are module-specific and auditable.

-   No hidden autonomous actions. No background model calls that affect
    state without a human trigger.

-   Context budgeting is explicit and model-aware. Budgets read from the
    model registry and auto-adjust when models change.

3.3 Governance & compliance principles

-   Hash-chained, append-only audit logs for every state-changing
    action.

-   Role-based approvals with configurable tiers per module.

-   Records retention and export support baked into every module.

-   Local data ownership. No outbound telemetry. No external API calls
    at runtime.

-   Configuration transparency: cities can see every prompt, model
    version, connector, and rule.

-   Documented model and version provenance --- which model, which
    prompt, which data, which version, signed in the audit log.

3.4 Technical principles

-   Shared auth, search, connectors, notifications, exports across all
    modules.

-   Common schema patterns --- modules that extend one another
    (Townlight Code → Townlight Legal → Townlight Meetings) share conventions.

-   API-first. Every module exposes a stable, documented API.

-   Import/export-friendly --- every module can export its state for
    records responses, migration, and transparency.

-   Model-provider abstraction. Ollama first, pluggable.

-   Air-gap-ready deployment profile for every module. Sensitive modules
    (Safety, Court) support isolated deployment.

3.5 Licensing & open-source principles

-   Code: Apache License 2.0. One license file, unchanged, in every module repository.

-   Documentation: CC BY 4.0 recommended so cities and vendors can fork
    and adapt their own materials.

-   Prompt libraries: published as a separate repository under CC BY-SA
    4.0 if desired (same pattern as PatentForge).

-   Third-party dependencies: permissive or weak-copyleft only. AGPL and
    GPL-3.0 are blocked at the dependency manager level. (Redis stays
    pinned \<8.0 for BSD per v3.0 spec.)

Part II. Architecture Pattern

Every module inherits the CivicRecords AI architectural template. This
section describes the pattern so that a team building CivicClerk,
CivicCode, or any other module has a clear reference.

4\. Shared Stack

  ------------------- -------------------------------------------------------- -------------------------------------------------------------------------
  **Layer**           **Technology**                                           **Responsibility**
  Container runtime   Docker Compose (single-host) or K3s/Nomad (multi-host)   Reproducible deployment; 7-service stack from v3.0 as baseline
  Database            PostgreSQL 17 + pgvector                                 OLTP data, vectors, audit chain, per-module schemas
  Cache / queue       Redis 7.2 (BSD, pinned \<8.0)                            Celery broker, session cache, rate limiting
  Worker              Celery workers + Celery Beat                             Async ingestion, embedding, notification dispatch, scheduled jobs
  API                 FastAPI on Uvicorn                                       Per-module routers under a unified CivicCore auth/audit/RBAC middleware
  Frontend            React + nginx (single-page per module, unified shell)    Module-specific pages; shared layout/navigation/design tokens
  LLM runtime         Ollama (Gemma 4 default; pluggable)                      Local model hosting; no cloud inference ever
  Embeddings          nomic-embed-text via Ollama                              Document and query vectorization
  Search              pgvector + PostgreSQL tsvector (hybrid)                  Semantic + keyword search with source attribution
  Auth                fastapi-users with JWT + service accounts                User/RBAC; service-to-service authentication for future federation
  Secrets             AES-256 at rest, module-isolated key material            Connector credentials, model API keys if any, encryption keys
  ------------------- -------------------------------------------------------- -------------------------------------------------------------------------

5\. Module Anatomy

Every module follows the same shape, so teams can move between modules
without relearning the architecture.

-   Backend router under /api/v1/{module} with standard CRUD +
    module-specific endpoints.

-   Per-module schema in PostgreSQL with foreign keys into CivicCore
    tables (users, departments, documents, audit\_log).

-   Module-specific prompt library stored as versioned YAML in the
    repository --- never hardcoded.

-   Celery task definitions for async work (ingestion, embedding,
    notifications, scheduled jobs).

-   Frontend pages mounted under /{module} in the shared React shell,
    using the shared design tokens.

-   Module-specific tests alongside shared test utilities. CivicRecords
    AI\'s repo-aligned test discipline (36 test modules) is the
    template.

-   CHANGELOG and versioning per module. Modules can ship independently.

6\. CivicCore --- The Shared Platform

CivicCore is not a user-facing product. It is the foundation every
module depends on. Cities install CivicCore when they install their
first module and never think about it again unless they are adding
another module.

This is the only change to the v3.0 spec that affects the existing
CivicRecords AI codebase: gradually factor shared infrastructure out of
CivicRecords AI into a CivicCore package so subsequent modules inherit
it cleanly. This can be done without breaking the CivicRecords AI
product.

6.1 CivicCore responsibilities

-   Authentication, user management, RBAC --- the fastapi-users + JWT +
    service-account pattern from the v3.0 spec.

-   Hash-chained audit log --- the existing CivicRecords implementation,
    promoted to core.

-   LLM abstraction layer --- the existing Ollama wrapper, promoted to
    core, with the model registry and context\_window\_size driving
    per-module budgets.

-   Document ingestion pipeline --- PDF, DOCX, XLSX, CSV, email, HTML,
    text, with Gemma 4 + Tesseract OCR fallback.

-   Hybrid search infrastructure --- pgvector + tsvector with normalized
    relevance scoring.

-   Universal connector framework --- the
    authenticate/discover/fetch/health\_check protocol from §13.6 of the
    v3.0 spec.

-   Notification service --- templates per event, Celery dispatch,
    SMTP + in-app channels.

-   Onboarding wizard, city profile, municipal systems catalog --- all
    from the v3.0 spec, promoted to core.

-   Exemption rules engine with 50-state seed data --- from the v3.0
    spec, promoted to core so CivicCode, CivicLegal, CivicContracts
    inherit it.

-   Sovereignty verification scripts --- prove no outbound calls, no
    telemetry, no external dependencies.

6.2 What lives in the module vs. what lives in CivicCore

  ---------------------------------------------------------------------------------- ----------------------------------------------------------------------------------------------------------------
  **Lives in module**                                                                **Lives in CivicCore**
  Module-specific data model (e.g., records\_requests for CivicRecords)              Shared tables: users, departments, documents, document\_chunks, audit\_log, service\_accounts, model\_registry
  Module-specific prompts and policies                                               LLM abstraction, Ollama gateway, context budgeting
  Module-specific UI pages and components                                            Shared design tokens, layout shell, navigation, status badges
  Module-specific compliance rules (e.g., records retention for request documents)   General exemption engine, general audit chain, general RBAC
  Module-specific connectors (e.g., Laserfiche for CivicRecords)                     Connector framework and the four-method protocol
  Module-specific notification templates                                             Notification service, SMTP infrastructure, delivery log
  ---------------------------------------------------------------------------------- ----------------------------------------------------------------------------------------------------------------

Part III. Module Catalog

Current catalog: 27 product modules plus CivicCore across 7 tiers (Tier 0 Foundation through Tier 6 Specialized). Each card uses a consistent shape: purpose,
owner, capabilities, source materials, AI workflows, compliance
considerations, and scope boundaries (what this is NOT). Tier 0 is the
foundation; every other module can be installed independently, subject
to the dependencies listed on each card.

Modules marked \'GAP IN CURRENT SPEC\' in their tier line are the ones
that fill the critical surfaces identified in §2.1 above. These are the
modules that turn the existing spec from a records-module specification
into a genuine suite.

7\. Tier 0 --- Foundation

CivicCore --- Shared Platform

  ------------------------ -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  **Module**               CivicCore
  **Primary owner**        IT / Platform team (installed once, used by every module)
  **Purpose**              The shared infrastructure layer every module inherits: auth, RBAC, audit, LLM abstraction, document ingestion, search, notifications, admin. Not sold as a separate product --- it is the platform.
  **Tier**                 Tier 0 --- Foundation (prerequisite for every other module)
  **Depends on**           Nothing. CivicCore is the foundation.
  **Why local LLM fits**   CivicCore is what makes local-LLM possible. It owns the Ollama gateway, model registry, embedding pipeline, and context budgeter that every module uses. No module talks to models directly.
  ------------------------ -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

**Key capabilities**

-   fastapi-users auth with JWT, RBAC, and service-account federation
    groundwork (inherited from CivicRecords AI)

-   Hash-chained append-only audit log with CSV/JSON export (same
    pattern as CivicRecords AI)

-   Universal connector framework with four standard operations:
    authenticate(), discover(), fetch(), health\_check()

-   LLM abstraction layer --- Ollama first, model-agnostic interface,
    pluggable for future models

-   Model registry table with context\_window\_size driving per-module
    token budgets automatically

-   Shared document ingestion pipeline --- PDF, DOCX, XLSX, CSV, email,
    HTML, text, with OCR fallback

-   Hybrid search across all ingested content --- pgvector semantic +
    PostgreSQL tsvector keyword

-   Notification service with Celery, SMTP, and in-app channels;
    template CRUD per event type

-   Admin panel: users, departments, models, connectors, audit export,
    city profile, onboarding wizard

-   Encrypted credential vault (AES-256) for connector secrets; never
    logged, never exported

-   Sovereignty verification scripts --- prove no outbound calls, no
    telemetry, no external dependencies

**Source materials ingested**

-   All modules ingest through the same pipeline; CivicCore doesn\'t
    ingest anything itself

**AI workflows (all human-approved)**

-   Onboarding interview (inherited from CivicRecords AI): city profile,
    system identification, gap map

-   Context assembly with token budgeting --- auto-adjusts when admin
    switches models

-   Source-linked answer generation --- every module\'s AI outputs cite
    their source chunks

**Compliance & legal considerations**

-   Hash-chained audit log enforced at the API layer for every module

-   Configurable retention policies per resource type

-   No outbound network calls --- verification scripts block external
    egress

-   AES-256 at rest for credentials, signed CJIS Security Addendum
    enforcement gate for sensitive modules

**Scope boundaries (what this is NOT)**

-   CivicCore is not a user-facing product. Cities install CivicCore
    when they install their first module and never think about it again.

-   It is not a model trainer --- it runs inference against pre-trained
    models (Gemma 4 default).

-   It is not a records management system --- modules own their own
    schemas, CivicCore provides the plumbing.

8\. Tier 1 --- Clerk Core

CivicRecords AI --- Public Records Requests

  ------------------------ --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  **Module**               CivicRecords
  **Primary owner**        City Clerk / Records Officer / Legal reviewer
  **Purpose**              Open-records intake, workflow, search, exemption review, response drafting, fee tracking, audit, and (planned) public request portal. Module 1. Already shipping.
  **Tier**                 Tier 1 --- Clerk Core
  **Depends on**           CivicCore
  **Why local LLM fits**   Records requests routinely touch SSNs, juvenile data, medical info, CJIS-flagged material, and attorney-client content. Cloud AI is a non-starter. Local Gemma 4 with RAG over the city\'s own documents is exactly the right shape.
  ------------------------ --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

**Key capabilities**

-   Staff workbench: dashboard, hybrid search, request queue, request
    detail, exemptions, sources, ingestion, users, onboarding, city
    profile, settings, audit log

-   Request lifecycle: Received → Clarification → Assigned → Searching →
    In Review → Ready → Drafted → Approved → Fulfilled → Closed

-   Exemption engine: rules (regex, keyword, statutory) + LLM
    suggestions; all 50 states + DC seeded

-   Response letter generation with templates, LLM assist, edit, submit
    for approval, send

-   Fee estimation, fee schedules, fee line items, waiver management

-   Notification templates per event (SMTP pipeline completion is a
    repo-tracked priority)

-   Hash-chained audit log, CSV/JSON export for FOIA/ORR audits

-   Universal Discovery & Connection Architecture --- catalog of 12
    functional domains, onboarding interview

-   Public request portal with guided intake, tracking, fees, help
    (planned)

**Source materials ingested**

-   File shares, shared drives, document repositories (SMB/file system
    connector)

-   Email archives (IMAP journal connector --- often the \#1 source for
    requests)

-   Manual export/drop for systems without APIs

-   Future: Laserfiche, OnBase, SharePoint, Tyler, Accela REST APIs;
    ODBC/JDBC for legacy DBs; GIS REST APIs; Axon vendor SDKs

**AI workflows (all human-approved)**

-   Scope assessment of incoming requests (narrow/moderate/broad)

-   Exemption flagging with confidence scores and statutory basis
    citation

-   Response letter drafting from template + request context + retrieved
    chunks

-   Clarification message drafting when a request is ambiguous

**Compliance & legal considerations**

-   Human-in-the-loop enforced at the API layer: no auto-redaction, no
    auto-denial, no auto-release

-   Every AI output labeled \'AI-generated draft requiring human
    review\'

-   Statutory deadline tracking with 50-state configuration

-   CJIS gate blocks public-safety connector activation until admin
    confirms requirements

**Scope boundaries (what this is NOT)**

-   Not a records management system --- indexes and searches what
    already exists

-   Not a legal advisor --- surfaces suggestions; staff make all
    decisions

-   Not cloud --- every deployment is a sovereign instance owned by the
    city

CivicClerk --- Meetings, Agendas, Minutes

  ------------------------ -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  **Module**               CivicClerk
  **Primary owner**        City Clerk / Council Support / City Manager\'s Office
  **Purpose**              Agenda intake, packet assembly, staff report normalization, ordinance/resolution extraction, motion and vote capture, minute drafting, searchable meeting archive, and a public meeting portal --- all with citations back to source material.
  **Tier**                 Tier 1 --- Clerk Core
  **Depends on**           CivicCore, CivicRecords (shared document/search infrastructure)
  **Why local LLM fits**   Packets contain pre-decisional deliberations, legal memos, personnel discussions, and real-estate negotiation material. Staff draft minutes from packets plus notes and transcripts. This is exactly the drafting-with-citations workflow local LLMs do well --- and cities are already replacing legacy meeting platforms (PrimeGov → Granicus OneMeeting, Boulder replaced NovusAGENDA in 2026). The replacement cycle is real.
  ------------------------ -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

**Key capabilities**

-   Agenda item intake from staff with pre-defined templates per item
    type

-   Automatic packet assembly: combines agenda, staff reports,
    attachments, ordinance drafts, resolutions, supporting documents

-   Staff report normalization --- LLM enforces structure
    (recommendation, background, analysis, fiscal impact)

-   Motion, vote, and action-item extraction from meeting transcripts or
    clerk notes

-   Minute drafting from packet + transcript + clerk notes, with each
    sentence cited to source

-   Ordinance/resolution extraction and diffing against prior versions

-   Searchable meeting archive --- full text search across years of
    packets, minutes, recordings (with transcripts)

-   Public meeting portal: packet posting, minutes, attachments,
    recordings/transcripts, plain-English explainers

-   Open Meetings / sunshine law compliance: notice posting, deadlines,
    public comment handling

-   Plain-English agenda summaries auto-generated for each public
    meeting (clerk approves before publish)

-   Cross-links: ordinances point to the meeting that adopted them;
    meetings point to resulting ordinances

**Source materials ingested**

-   Staff reports (DOCX/PDF) uploaded by departments

-   Agenda item submission forms

-   Existing packet archives (migration from
    Granicus/Legistar/NovusAGENDA exports)

-   Meeting video/audio transcripts (local speech-to-text; optional)

-   Council member motion/vote notes

-   Prior ordinances and resolutions (codifies the legislative record)

**AI workflows (all human-approved)**

-   Draft minutes from packet + transcript with sentence-level citations

-   Normalize staff reports to the city\'s required template

-   Extract motions, seconds, votes, and action items from transcripts

-   Generate plain-English agenda summaries for residents

-   Ordinance diffing and redline generation between drafts

**Compliance & legal considerations**

-   Open Meetings Act / sunshine law --- notice, posting deadlines,
    public comment workflows

-   Records retention schedules for official minutes, agendas, packets,
    and recordings

-   ADA accessibility of posted materials (integrates with CivicAccess)

-   Signed-minutes workflow with clerk signature and adoption-meeting
    reference

**Scope boundaries (what this is NOT)**

-   Not voting software --- records votes but does not conduct them

-   Not a livestream platform --- integrates with existing livestream;
    does not replace it

-   Agenda AI never adds items, changes order, or modifies motions
    autonomously

CivicCode --- Municipal Code & Ordinance Access

  ------------------------ ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  **Module**               CivicCode
  **Primary owner**        City Clerk / Legal / Codification Department
  **Purpose**              The municipal code as a first-class product. Residents and staff ask \'what does the code say about X?\' --- this module answers, with citations to the exact ordinance section, and offers plain-English explanations alongside the authoritative legal text.
  **Tier**                 Tier 1 --- Clerk Core (CRITICAL GAP IN CURRENT SPEC)
  **Depends on**           CivicCore, CivicClerk (ordinance adoption feeds the code)
  **Why local LLM fits**   Municipal code Q&A is the single highest-volume civic question after \'when is trash pickup.\' Every clerk and front-desk staffer answers the same 50 questions over and over: chickens, short-term rentals, noise, parking, signs, fences, setbacks, business licenses, food trucks, garage sales, snow removal. Local LLM + RAG over the code handles this without the liability of a cloud service offering legal-sounding advice.
  ------------------------ ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

**Key capabilities**

-   Structured import of the municipal code (typically from the city\'s
    codifier --- Municode, American Legal, Code Publishing, General
    Code)

-   Full-text and semantic search across titles, chapters, sections, and
    subsections

-   Resident-facing Q&A: \'can I have chickens\' → plain-English
    answer + pinned citations to §6.16.040 + link to authoritative text

-   Staff-facing Q&A: same engine, more detail, cross-references to
    related sections and prior interpretations

-   Section-level permalink with version history --- what did the code
    say about X on this date?

-   Amendment tracking: ordinance adopted on date Y amended section Z
    from text A to text B

-   Topic-based \'popular questions\' gallery seeded by the clerk
    (chickens, noise, parking, etc.)

-   Multilingual and plain-language rewrites of common sections
    (integrates with CivicAccess)

-   Search over administrative regulations, resolutions, and policies
    alongside the code itself

-   Integration with CivicClerk: when an ordinance is adopted, code is
    marked stale until the codifier update is ingested

**Source materials ingested**

-   Municipal code export from codifier (XML, DOCX, or web scrape of
    published code site)

-   Administrative regulations and department policies

-   Resolutions with ongoing legal effect

-   Historical code versions for amendment tracking

-   Staff-curated interpretation notes (internal; not published to
    residents)

**AI workflows (all human-approved)**

-   Answer natural-language questions over the code with pinned section
    citations

-   Generate plain-English summaries of specific sections (clerk
    approves before publishing)

-   Translate common sections into the city\'s secondary languages

-   Suggest related sections when a user reads one (\'people viewing
    this also asked about\')

-   Detect probable code conflicts when new ordinances are proposed
    (CivicClerk integration)

**Compliance & legal considerations**

-   Authoritative text is always the codified ordinance --- the
    plain-English summary is labeled non-authoritative

-   Every AI answer carries a disclaimer linking to the full section and
    recommending staff contact for legal interpretation

-   Change log preserved for every section; nothing is silently edited

**Scope boundaries (what this is NOT)**

-   Not a codifier --- does not publish the code; ingests from the
    city\'s existing codifier

-   Not legal advice --- every answer includes a staff-contact prompt
    for interpretation questions

-   Not a replacement for the codifier contract --- works alongside
    Municode/American Legal/etc.

CivicAccess --- Accessible Forms, Publishing, ADA Review

  ------------------------ --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  **Module**               CivicAccess
  **Primary owner**        Clerk / Communications / IT / ADA Coordinator
  **Purpose**              The horizontal compliance layer. Accessible forms, accessible publishing workflows, multilingual and plain-language rewrites, ADA Title II review, and records-ready exports --- available to every other module so they all publish compliant content.
  **Tier**                 Tier 1 --- Clerk Core
  **Depends on**           CivicCore
  **Why local LLM fits**   DOJ Title II web/mobile accessibility rule applies to all state and local governments with compliance dates of April 24, 2026 (\>50K pop) and April 26, 2027 (\<50K and special districts). Smaller cities have no budget for dedicated accessibility consultants. A local-AI reviewer that flags WCAG 2.2 AA issues before publish is high-leverage and low-risk.
  ------------------------ --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

**Key capabilities**

-   Accessible form builder with WCAG 2.2 AA enforcement built in
    (labels, error recovery, keyboard-only, focus management)

-   Multilingual form rendering driven by a translation memory; local
    LLM for first-draft translations; human approval

-   Plain-language rewriter for public-facing content, tuned to the
    city\'s reading-level target

-   ADA review pass over any content authored in any module --- flags
    contrast, alt-text, heading order, table structure, PDF tagging

-   PDF accessibility remediation assistance: detects untagged PDFs,
    suggests structure, flags inaccessible forms

-   Records-ready exports --- every published form includes a
    machine-readable archive of its state at publish time

-   Content linting --- blocks publish when severe accessibility issues
    are detected; warns on moderate issues

-   Title II compliance dashboard --- a running inventory of content and
    its accessibility state

**Source materials ingested**

-   Content authored in other modules (CivicClerk packets, CivicCode
    summaries, CivicComms releases, Civic311 notices)

-   City translation memory / previously-translated content

-   Uploaded PDFs for retroactive remediation review

**AI workflows (all human-approved)**

-   Plain-language rewrite (targets 8th-grade reading level by default;
    configurable)

-   Translation drafting into the city\'s secondary languages

-   Alt-text generation for images (staff approves before publish)

-   Accessibility issue detection and remediation suggestions

**Compliance & legal considerations**

-   WCAG 2.2 AA as baseline; Section 508 alignment

-   DOJ Title II web/mobile accessibility rule compliance deadlines
    (April 24, 2026 for entities of 50,000+; April 26, 2027 for smaller
    entities and special districts)

-   Language access obligations under Title VI for covered cities

**Scope boundaries (what this is NOT)**

-   Not a replacement for human accessibility review --- it catches
    common issues, not all issues

-   Not a CMS --- it\'s a pre-publish layer that works alongside the
    city\'s existing website

-   Not a translation service for legally binding documents --- flags
    those for human translator review

9\. Tier 2 --- Land Use & Development

CivicZone --- Zoning Code, Planning, Parcel-Aware Lookups

  ------------------------ --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  **Module**               CivicZone
  **Primary owner**        Planning & Development / Community Development
  **Purpose**              Zoning and land-use code as a first-class product with parcel-level awareness. \'What zone is my property?\' \'What can I build?\' \'What are the setbacks?\' --- answered with citations, with an optional GIS integration that personalizes answers to the specific parcel.
  **Tier**                 Tier 2 --- Land Use & Development (CRITICAL GAP IN CURRENT SPEC)
  **Depends on**           CivicCore, CivicCode (shares ordinance infrastructure)
  **Why local LLM fits**   Zoning counter questions consume huge planner time. A resident asking \'can I put an ADU on my lot?\' requires reading the zoning code against their specific parcel\'s zone, overlay districts, and nonconformities. With a local LLM + RAG over the zoning code + GIS parcel lookup, residents self-serve the 80% case and planners get their time back for the 20% that needs judgment.
  ------------------------ --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

**Key capabilities**

-   Full ingestion of the zoning code, including tables (use matrices,
    dimensional tables, parking ratios)

-   Parcel-aware Q&A: enter an address or click a parcel → answer is
    scoped to that parcel\'s base zone and overlays

-   Use matrix lookups: \'is X permitted in Y zone?\' with
    permitted/conditional/prohibited distinctions

-   Dimensional requirement lookups: setbacks, height, lot coverage,
    density, parking, open space

-   Overlay district awareness: floodplain, historic, downtown, transit,
    hillside

-   Nonconformity detection: flags when a parcel appears to be legally
    nonconforming

-   Comprehensive plan integration (via CivicPlan): shows policy context
    alongside zoning rules

-   Development application pre-check: \'given my zone and my proposal,
    what permits and approvals do I need?\'

-   Variance and conditional-use interpretation --- explains the
    standards but never opines on whether a specific request will be
    approved

-   Planner dashboard: high-volume questions, topic trends, likely code
    ambiguities

**Source materials ingested**

-   Zoning code / land development code / subdivision regulations

-   Zoning map and overlay map exports (GIS)

-   Parcel layer from county assessor or city GIS

-   Comprehensive plan and small-area plans (via CivicPlan)

-   Historic variance and conditional-use decisions for precedent
    context (staff-only, not public)

**AI workflows (all human-approved)**

-   Parcel-scoped zoning Q&A with citations to code section and
    applicable overlays

-   Use matrix interpretation against a specific proposed use

-   Dimensional compliance pre-check from a described project

-   Plain-English explainers of dense zoning sections (staff approves
    before publish)

**Compliance & legal considerations**

-   Every answer includes a \'this is not a determination\' disclaimer
    and a staff-contact path

-   Variance and conditional-use interpretations are explicitly flagged
    as requiring planner review

-   GIS data freshness is surfaced --- residents see when the parcel
    layer was last updated

**Scope boundaries (what this is NOT)**

-   Not a permitting system --- does not intake, track, or issue permits
    (that\'s CivicPermit Assist)

-   Not a zoning verification letter generator without planner approval
    --- drafts are flagged as unofficial

-   Does not approve or deny anything --- all answers are informational

CivicPlan --- Comprehensive Plan & Long-Range Planning Access

  ------------------------ ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  **Module**               CivicPlan
  **Primary owner**        Planning & Development / City Manager\'s Office
  **Purpose**              Comprehensive plans are 150-300 page documents nobody reads. Small-area plans, transportation master plans, parks plans, and sustainability plans sit on shelves. CivicPlan makes them queryable, cross-references them to zoning (CivicZone), and surfaces policy guidance for staff reports and Council decisions.
  **Tier**                 Tier 2 --- Land Use & Development (GAP IN CURRENT SPEC)
  **Depends on**           CivicCore, CivicZone, CivicClerk
  **Why local LLM fits**   Comp plans are exactly what RAG is for: large, structured documents with rich policy language. Cities spend tens of thousands updating them and then can\'t find the policy that applies to a specific Council decision. A local LLM that answers \'what does the comp plan say about infill in established neighborhoods?\' with citations is genuinely useful.
  ------------------------ ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

**Key capabilities**

-   Ingestion of comprehensive plans, small-area plans, neighborhood
    plans, corridor plans, master plans

-   Policy-level Q&A with citation to goal, objective, and policy
    numbers

-   Goal/objective/policy navigator --- browse the plan\'s structure

-   Cross-references: when a zoning decision is under review, surface
    relevant comp plan policies

-   Staff report integration (CivicClerk): when drafting a staff report,
    surface comp plan policies that apply

-   Progress tracking: policies with measurable targets can be tagged
    with status and evidence

-   Public portal view: residents can explore the plan by topic,
    neighborhood, or goal

-   Plan amendment workflow: tracks proposed amendments and their
    adoption status

-   Historical plan versions preserved for legal and planning-context
    reference

**Source materials ingested**

-   Adopted comprehensive plan and all amendments

-   Small-area, corridor, neighborhood, and topic-specific master plans

-   Transportation plans, parks and open space plans, sustainability
    plans

-   Capital Improvement Plan / CIP (optional --- often paired with
    CivicBudget Assist)

-   Planning Commission meeting archives (via CivicBoards)

**AI workflows (all human-approved)**

-   Natural-language Q&A over plans with citations to
    goal/objective/policy

-   Cross-plan synthesis: \'what do our plans say about housing
    affordability?\'

-   Staff report assistance: given a proposed action, surface relevant
    comp plan policies

-   Plan amendment draft assistance (staff reviews)

**Compliance & legal considerations**

-   Adopted plan text is authoritative; AI summaries are labeled
    non-authoritative

-   Amendment history preserved and visible

-   State-specific comp plan content requirements respected (varies
    significantly by state)

**Scope boundaries (what this is NOT)**

-   Not a plan-writing tool --- assists with lookup and synthesis, not
    authoring new plans

-   Not a consultant substitute --- major plan updates still require
    professional planning work

-   Does not make land-use recommendations for specific projects

CivicPermit Assist --- Permit Intake & Pre-Application Copilot

  ------------------------ -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  **Module**               CivicPermit
  **Primary owner**        Planning / Building / Community Development
  **Purpose**              A pre-application and intake copilot for permits and development review. Not a full permitting system (don\'t pick a fight with Tyler/Accela on day one), but a layer that helps applicants prepare complete submissions and helps reviewers work through code.
  **Tier**                 Tier 2 --- Land Use & Development
  **Depends on**           CivicCore, CivicCode, CivicZone
  **Why local LLM fits**   Incomplete applications clog every planning counter in America. A local-AI pre-screener that tells applicants what they\'re missing before they submit is high-leverage --- and does not require replacing the city\'s permitting system.
  ------------------------ -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

**Key capabilities**

-   Pre-application guidance: \'describe your project\' → list of likely
    permits, fees, required attachments, timeline

-   Zoning/code pre-check against a described project (uses CivicZone
    and CivicCode)

-   Application completeness checking against checklist templates

-   Reviewer workspace: assembles packet for staff review with code
    citations highlighted

-   Hearing notice drafting (public notice via CivicNotice)

-   Plain-language explanations of common permit types for residents

-   Integration with the city\'s permitting system of record (read-only
    mirror; writes happen in Tyler/Accela/etc.)

-   Status lookup for applicants --- mirrors data from the system of
    record

**Source materials ingested**

-   Zoning code (via CivicZone), building code, municipal code (via
    CivicCode)

-   Permit application forms and their checklists

-   Prior permit decisions for precedent context (staff-only)

-   Read-only data from Tyler EnerGov / Accela / CityWorks / in-house
    permitting systems

**AI workflows (all human-approved)**

-   Project description → permit pathway recommendation

-   Completeness check against required checklist items

-   Plain-English permit explainers for residents

-   Reviewer packet assembly with pre-cited code sections

**Compliance & legal considerations**

-   All recommendations are informational, not determinations

-   Hearing notices meet statutory notice periods (coordinated with
    CivicNotice)

-   Reviewer decisions live in the system of record, not in CivicPermit
    Assist

**Scope boundaries (what this is NOT)**

-   NOT a permitting system of record --- does not issue permits,
    collect fees, schedule inspections

-   Does not replace Tyler, Accela, CityWorks, EnerGov --- integrates
    with them

-   Does not make approval decisions

CivicInspect --- Inspections Field Copilot

  ------------------------ -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  **Module**               CivicInspect
  **Primary owner**        Code Enforcement / Building / Fire Prevention
  **Purpose**              Assistant for inspectors. Photo-and-voice-to-report drafting, repeat-case lookup, notice generation. Not autonomous enforcement --- inspectors own every decision.
  **Tier**                 Tier 2 --- Land Use & Development
  **Depends on**           CivicCore, CivicCode
  **Why local LLM fits**   Inspectors take photos, dictate notes, and write the same kinds of notices over and over. A local-LLM that drafts notices from photos + dictation + the relevant code section saves hours per inspector per week.
  ------------------------ -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

**Key capabilities**

-   Field note capture: photo + voice memo + location + parcel

-   Auto-draft of notice/citation from field notes with code citations

-   Repeat-case lookup: has this property been cited before? What was
    the outcome?

-   Inspection summary generation for reviewer and case files

-   Photo tagging and evidence packet assembly

-   Code-section lookup in the field (via CivicCode)

-   Integration with enforcement system of record (read/write via the
    city\'s existing system, not CivicInspect)

**Source materials ingested**

-   Municipal code (via CivicCode)

-   Prior case records (read-only from enforcement system)

-   Field photo/voice capture

-   GIS parcel data

**AI workflows (all human-approved)**

-   Field photo + dictation → draft notice with code citation

-   Case history summary from prior records

-   Evidence packet assembly for hearings or court

**Compliance & legal considerations**

-   Inspector signs every notice --- AI drafts only

-   Photo metadata chain of custody preserved

-   Evidence packets are records-ready (integrates with CivicRecords)

**Scope boundaries (what this is NOT)**

-   Not autonomous enforcement --- no AI-initiated notices

-   Not a replacement for the enforcement case management system

-   Not a legal determination of violation

10\. Tier 3 --- Administrative Expansion

CivicGrants --- Grants Intelligence & Compliance

  ------------------------ ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  **Module**               CivicGrants
  **Primary owner**        City Manager / Finance / Administration / Economic Development
  **Purpose**              Opportunity triage, eligibility matching, application drafting, compliance calendars, and audit-ready grant files. Small teams (often 1-3 people) carry a massive paperwork burden; local-LLM drafting with citations to grant guidance is exactly the right tool.
  **Tier**                 Tier 3 --- Administrative Expansion
  **Depends on**           CivicCore, CivicRecords (for audit/records integration)
  **Why local LLM fits**   Federal grant award pass-throughs to SLTT were \$1.2T in FY2024. Small grants offices (often 1-3 people) struggle most with compliance tracking and opportunity research. Nothing in that workflow needs the cloud, and the data (budgets, subrecipients, personnel costs) is sensitive.
  ------------------------ ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

**Key capabilities**

-   CivicGrant Scout: opportunity ingestion from Grants.gov, state
    portals, and foundation sources; eligibility filtering against city
    profile

-   CivicGrant Build: application workspace with checklist generation,
    narrative drafting from city documents, attachment tracking

-   CivicGrant Comply: compliance calendar, subrecipient monitoring
    folders, reporting package assembly, audit-ready grant files

-   Cross-grant matching: detects when a city project aligns with
    multiple grant opportunities

-   Budget narrative drafting from line-item budgets with grant-specific
    requirements

-   Reporting-period automation: drafts quarterly/annual reports from
    the city\'s activity data

-   Federal and state grant-specific prompt libraries (CDBG, EDA, FEMA
    BRIC, EPA, DOT, etc.)

**Source materials ingested**

-   Grants.gov feeds, state grant portals, foundation databases

-   City strategic plans, comp plan, CIP (for eligibility matching)

-   Prior grant applications (for template reuse and learning what
    works)

-   Grant award agreements and compliance requirements

-   Financial data for budget narratives and match documentation

**AI workflows (all human-approved)**

-   Opportunity triage: match incoming opportunities against city
    priorities and eligibility

-   Narrative drafting from city planning documents with source
    citations

-   Checklist generation per grant requirements

-   Reporting package assembly for compliance periods

**Compliance & legal considerations**

-   2 CFR 200 (Uniform Guidance) alignment in application and reporting
    workflows

-   Subrecipient monitoring records retained in audit-ready format

-   Grant-specific compliance requirements surfaced per opportunity

**Scope boundaries (what this is NOT)**

-   Not a grant management system of record (for cities using
    Euna/Submittable/etc.)

-   Not a financial system --- integrates with the city\'s finance
    system for budget and draw data

-   Does not submit applications autonomously

CivicProcure Assist --- Procurement Copilot

  ------------------------ ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  **Module**               CivicProcure
  **Primary owner**        Finance / Purchasing / Clerk / Legal
  **Purpose**              Draft RFPs, compare proposals, extract exceptions, generate scoring summaries, build board memos, assemble award packets. Not a full sourcing platform --- a copilot around the documents and decisions.
  **Tier**                 Tier 3 --- Administrative Expansion
  **Depends on**           CivicCore, CivicClerk (for Council award memos), CivicContracts (post-award)
  **Why local LLM fits**   Procurement workloads are up; staffing is not. Proposals contain sensitive pricing and proprietary information --- exactly where cloud AI is a problem. Local-LLM comparison and scoring support is the right wedge.
  ------------------------ ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

**Key capabilities**

-   RFP/IFB/RFQ drafting from approved templates

-   Proposal comparison against scored criteria with source-cited
    extractions

-   Exception and deviation extraction from vendor responses

-   Vendor question tracking and response drafting

-   Scoring summary generation (human scorers; AI synthesizes)

-   Board/Council memo drafting for award recommendations

-   Award packet assembly: memo + staff recommendation + score sheets +
    contract draft (CivicContracts)

-   Procurement file audit bundle: records-ready package for each
    solicitation

**Source materials ingested**

-   RFP/IFB/RFQ templates

-   Vendor proposals (DOCX, PDF)

-   Scoring rubrics and evaluator scores

-   Past award records and vendor performance history

**AI workflows (all human-approved)**

-   RFP drafting from templates and scope description

-   Proposal exception extraction

-   Score synthesis and narrative generation (scores are human)

-   Award memo drafting with Council-ready framing

**Compliance & legal considerations**

-   State/local procurement code alignment (thresholds, methods,
    notices)

-   Vendor neutrality enforced --- no AI scoring of proposals

-   Protest-ready records preserved for every solicitation

**Scope boundaries (what this is NOT)**

-   NOT a full e-procurement platform (OpenGov/Bonfire/Periscope own
    that space)

-   AI does not score proposals --- humans score; AI synthesizes

-   Does not select vendors

CivicContracts --- Contract Repository & Q&A

  ------------------------ --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  **Module**               CivicContracts
  **Primary owner**        Clerk / Legal / Finance / Department contract managers
  **Purpose**              Central repository for every active contract with AI-assisted lookup: \'what does our janitorial contract say about holidays?\' \'When does the IT services contract expire?\' \'What are our indemnification obligations to Vendor X?\'
  **Tier**                 Tier 3 --- Administrative Expansion (GAP IN CURRENT SPEC)
  **Depends on**           CivicCore, CivicProcure Assist (for new contracts), CivicRecords (for public access)
  **Why local LLM fits**   Contracts are typically filed as PDFs in a shared drive, if anyone can find them at all. Staff spend hours hunting for specific clauses. Local-LLM Q&A over the contract library is exactly the right use case, and contracts contain commercially sensitive pricing that can\'t go to cloud AI.
  ------------------------ --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

**Key capabilities**

-   Central repository with structured metadata: vendor, department,
    effective date, expiration, value, status

-   Full-text search across all contracts

-   Contract-specific Q&A with citation to section and page

-   Clause comparison: \'show me indemnification language across all our
    contracts\'

-   Expiration and renewal calendar with configurable alerts
    (60/90/120-day warnings)

-   Amendment tracking with version history

-   Obligation extraction: \'what are we required to deliver under this
    contract?\'

-   Integration with CivicProcure Assist (new contracts flow in on
    award) and CivicRecords (public access requests)

**Source materials ingested**

-   Contract documents (PDF/DOCX) --- typically migrated from shared
    drives

-   Amendments, change orders, extensions

-   Award memos and Council resolutions (from CivicClerk)

-   Insurance certificates and bonds

**AI workflows (all human-approved)**

-   Contract Q&A with pinned citations

-   Clause-type extraction across contracts

-   Obligation and deliverable extraction

-   Expiration and renewal summary generation

**Compliance & legal considerations**

-   Records retention schedules for contracts (often 7+ years
    post-termination)

-   Public records accessibility (integrates with CivicRecords)

-   Insurance certificate expiration tracking

**Scope boundaries (what this is NOT)**

-   Not a contract lifecycle management (CLM) platform --- no
    e-signature, no workflow approvals

-   Not a legal drafting tool for new contracts

-   Does not execute contracts

CivicBoards --- Boards & Commissions Management

  ------------------------ ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  **Module**               CivicBoards
  **Primary owner**        City Clerk / Board liaisons
  **Purpose**              Non-Council boards and commissions --- Planning Commission, Board of Adjustment, Historic Preservation, Parks Board, Library Board, Housing Authority, etc. Each has meetings, agendas, minutes, members, terms, and decisions that cities currently manage in spreadsheets and email.
  **Tier**                 Tier 3 --- Administrative Expansion (GAP IN CURRENT SPEC)
  **Depends on**           CivicCore, CivicClerk
  **Why local LLM fits**   Every city has 5-20 boards, each with its own meetings, packets, and minutes. The current spec assumes \'Council meetings\' but most cities have Planning Commission doing \~24 meetings a year plus 3-10 other bodies. CivicClerk gives them the meeting infrastructure; CivicBoards gives them member management, terms, attendance, vacancies, and applications.
  ------------------------ ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

**Key capabilities**

-   Board/commission registry with enabling authority, size, term
    length, meeting frequency

-   Member management: appointments, terms, reappointments,
    resignations, vacancies

-   Term expiration tracking with automatic vacancy-posting workflow

-   Application portal for open seats (integrates with CivicAccess for
    accessible forms)

-   Attendance tracking per meeting (integrates with CivicClerk)

-   Annual reporting and evaluation workflows

-   Public roster with member bios and term information

-   Ethics and disclosure tracking (if required by the city)

-   Meeting workflows inherited from CivicClerk per-board

**Source materials ingested**

-   City charter / ordinance establishing each board

-   Appointment records

-   Meeting records (from CivicClerk)

-   Applications for board seats

**AI workflows (all human-approved)**

-   Vacancy announcement drafting

-   Annual board-evaluation report synthesis

-   Applicant comparison against required qualifications (informational
    only --- appointments are by Council)

**Compliance & legal considerations**

-   Open Meetings Act / sunshine law per-board

-   Term-limit and residency-requirement enforcement

-   Ethics and conflict-of-interest tracking where required

**Scope boundaries (what this is NOT)**

-   Does not make appointments --- appointments are by Council (or per
    charter)

-   Does not disqualify applicants --- surfaces qualification status as
    information

-   Not a volunteer management system (for parks programs etc.)

CivicNotice --- Public & Statutory Notice Publication

  ------------------------ ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  **Module**               CivicNotice
  **Primary owner**        City Clerk / Communications
  **Purpose**              Public hearings, legal notices, bid notices, vacancy notices, and statutory publications all have deadlines, format requirements, and publication channels. CivicNotice is the compliance-aware workflow that ensures every notice is posted correctly, on time, through the right channels.
  **Tier**                 Tier 3 --- Administrative Expansion (GAP IN CURRENT SPEC)
  **Depends on**           CivicCore, CivicAccess (for accessible posting), CivicClerk (hearing notices), CivicProcure (bid notices), CivicBoards (vacancy notices)
  **Why local LLM fits**   Missing a statutory notice deadline can void an ordinance, delay a project for months, or trigger litigation. Most cities track this in a clerk\'s notebook. A compliance-aware workflow with AI-drafted notices and verified publication timing prevents expensive mistakes.
  ------------------------ ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

**Key capabilities**

-   Notice registry: every notice the city is legally required to
    publish, by type

-   Deadline engine: statutory timing enforced from notice type (e.g.,
    \'planning hearing: 15 days prior, two publications\')

-   Multi-channel publishing: newspaper (tracked via affidavit), city
    website, posted physical locations, email subscriber lists

-   Notice drafting templates per notice type (hearing, bid, vacancy,
    adoption, etc.)

-   Affidavit of publication management from legal newspapers

-   Accessibility pass on every public notice (via CivicAccess)

-   Subscriber list management for notice delivery

-   Notice archive with proof-of-publication records

**Source materials ingested**

-   Statutory notice requirements (state-specific)

-   Notice templates

-   Publication affidavits from newspapers

-   Notice subscriber lists

**AI workflows (all human-approved)**

-   Notice drafting from event context (hearing topic, date, location,
    case number)

-   Plain-language summaries of technical notices

-   Translation of notices into required secondary languages (via
    CivicAccess)

**Compliance & legal considerations**

-   State-specific statutory notice periods and publication requirements

-   Newspaper publication requirements where legally mandated

-   Accessibility of posted notices (DOJ Title II)

-   Retention of proof-of-publication for records-request responses

**Scope boundaries (what this is NOT)**

-   Does not publish in legal newspapers directly --- coordinates and
    records; newspaper contract is separate

-   Does not make determinations about what notices are required ---
    encodes the requirements

-   Does not substitute for legal counsel on novel notice questions

11\. Tier 4 --- Operations & Resident Services

Civic311 --- Resident Service Requests

  ------------------------ ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  **Module**               Civic311
  **Primary owner**        Public Works / Utilities / Neighborhood Services / Code Enforcement
  **Purpose**              Resident-facing service request intake with AI triage, dedupe, routing, and status updates. Open311-compatible for export and integration.
  **Tier**                 Tier 4 --- Operations
  **Depends on**           CivicCore, CivicAccess (accessible forms), CivicCode (for code-related requests)
  **Why local LLM fits**   Resident requests are high-volume, low-sensitivity individually, but contain addresses, complaints about neighbors, and occasional allegations against city staff --- exactly the content that should not leave the city\'s control. Local-AI triage handles it and is cheaper than SaaS 311 at small-city volumes.
  ------------------------ ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

**Key capabilities**

-   Resident intake: web form, phone (via CSR), mobile app, email

-   AI triage: categorizes, suggests department routing, flags
    duplicates

-   Duplicate detection across location and description

-   Department routing rules with auto-assignment

-   Resident updates: status changes trigger configurable notifications

-   Work order bridge: hands off to public works / utility / code
    enforcement systems of record

-   Open311 API compatibility for third-party apps and transparency
    exports

-   Public status map (optional) with resolution times

-   Service-level reporting per category and per department

**Source materials ingested**

-   Resident submissions

-   Geocoding and parcel lookup

-   Service request history for duplicate detection

**AI workflows (all human-approved)**

-   Category classification and department routing suggestion

-   Duplicate detection and merging suggestions

-   Resident message drafting for status updates

**Compliance & legal considerations**

-   Resident data retention per the city\'s schedule

-   Complaint anonymity where policy requires

-   Public records obligations (requests become records; integrate with
    CivicRecords)

**Scope boundaries (what this is NOT)**

-   Not a work order system --- hands off to Cityworks, Lucity,
    Cartegraph, or in-house

-   Not a CSR phone system --- integrates with whatever the city uses

-   AI does not autonomously dispatch crews

CivicComms --- Public Explainers & Communications Copilot

  ------------------------ --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  **Module**               CivicComms
  **Primary owner**        Clerk / Communications / Administration / Mayor & Manager\'s Office
  **Purpose**              Source-backed public explainers. Meeting summary drafts. Ordinance plain-English summaries. Newsletter drafting. FAQ generation from source documents. Multilingual public notice variants.
  **Tier**                 Tier 4 --- Operations
  **Depends on**           CivicCore, CivicClerk, CivicCode, CivicAccess
  **Why local LLM fits**   Every city struggles to translate government into human language. CivicComms drafts from the city\'s own source material with citations --- never invents facts, always human-approved before publish.
  ------------------------ --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

**Key capabilities**

-   Meeting summary drafts for public distribution (pulls from
    CivicClerk minutes and packets)

-   Ordinance and resolution plain-English summaries (pulls from
    CivicCode)

-   Newsletter drafting from the week\'s Council actions, announcements,
    and events

-   News release drafting with citations to source documents

-   FAQ generation by topic from the city\'s own records

-   Social media draft generation (subject to human approval)

-   Multilingual variants (via CivicAccess)

-   Stakeholder-specific drafts (e.g., business community, HOAs,
    neighborhood groups)

**Source materials ingested**

-   Meeting minutes and packets (CivicClerk)

-   Ordinances and resolutions (CivicCode)

-   Public announcements and event calendars

-   Press releases and prior communications

**AI workflows (all human-approved)**

-   Meeting-to-newsletter summarization

-   Ordinance-to-plain-English rewriting

-   Topic-to-FAQ generation

-   Multi-audience variant drafting

**Compliance & legal considerations**

-   Fair and factual communications --- never partisan or advocacy

-   Pre-election blackout rules where applicable

-   Accessibility of all public communications (CivicAccess)

**Scope boundaries (what this is NOT)**

-   Every communication is human-approved before publish

-   No autonomous social media posting

-   No campaign or advocacy content

CivicData Bridge --- Open Data & Transparency Publishing

  ------------------------ ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  **Module**               CivicData
  **Primary owner**        IT / Clerk / Administration / Analysts
  **Purpose**              Connect municipal systems into the suite, normalize exports, generate open-data-ready packages, searchable archive bundles, CKAN integration, records retention exports.
  **Tier**                 Tier 4 --- Operations
  **Depends on**           CivicCore (connector framework)
  **Why local LLM fits**   CKAN is already the open standard. CivicData Bridge builds on the CivicCore connector framework to move data into open-data portals, transparency dashboards, and records-retention archives --- all without cloud dependencies.
  ------------------------ ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

**Key capabilities**

-   CKAN integration for open data publishing

-   Dataset normalization (date formats, geocoding, field naming)

-   Scheduled publication of operational data (budget, permits, 311,
    etc.)

-   Data-dictionary generation from source schemas

-   Archive bundle creation for records retention

-   Transparency dashboard templates (budget transparency, procurement
    transparency, etc.)

-   PII redaction pass before publication (integrates with CivicRecords
    exemption engine)

**Source materials ingested**

-   Every other module\'s data through controlled export interfaces

-   External systems via CivicCore connector framework

**AI workflows (all human-approved)**

-   Data-dictionary drafting from schemas

-   PII detection and pre-publication redaction review

**Compliance & legal considerations**

-   PII and exempt data must pass redaction before publication

-   Records retention schedules honored in archive bundles

-   Open data license clearly marked on every dataset

**Scope boundaries (what this is NOT)**

-   Not a BI/analytics platform --- publishes to CKAN and provides
    bundles; dashboards live elsewhere

-   Not a data warehouse --- streams and exports, not long-term storage
    beyond archives

CivicRegWatch --- Federal Regulatory Intelligence

  ----------------------- --------------------------------------------------------------------------------------------------------------------------------
  **Module**              CivicRegWatch
  **Primary owner**       City Manager / Legal / Clerk
  **Purpose**             Monitor public federal regulatory activity and surface human-reviewable alerts for rules, proposed rules, guidance, deadlines, and funding changes that may affect city operations.
  **Tier**                Tier 4 --- Operations
  **Depends on**          CivicCore; optional CivicLegal and CivicClerk escalation contracts
  **Status**              Planned. Detailed implementation contract: `specs/05_civicregwatch.md`.
  **Boundary**            Intelligence layer only. It does not make compliance determinations, replace legal review, scrape websites, or auto-act on behalf of the city.
  ----------------------- --------------------------------------------------------------------------------------------------------------------------------

CivicAPI --- Public Read-Only Data Gateway

  ----------------------- --------------------------------------------------------------------------------------------------------------------------------
  **Module**              CivicAPI
  **Primary owner**       IT / Clerk
  **Purpose**             Provide a public read-only API over structured, human-approved, published CivicSuite records with citations, schema metadata, rate limits, and retraction support.
  **Tier**                Tier 4 --- Operations
  **Depends on**          CivicCore and publication contracts from originating modules; optional CivicData relationship for bulk datasets.
  **Status**              Planned. Detailed implementation contract: `specs/06_civicapi.md`.
  **Boundary**            Publication gateway only. It does not scrape, write back into modules, expose unapproved records, or produce LLM-generated API responses.
  ----------------------- --------------------------------------------------------------------------------------------------------------------------------

12\. Tier 5 --- Internal Business Functions

CivicHR Assist --- HR Policy Q&A & Drafting

  ------------------------ ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  **Module**               CivicHR
  **Primary owner**        Human Resources
  **Purpose**              Policy Q&A, job description drafting, onboarding packet generation, personnel-policy lookup. Not an HRIS --- a copilot over the city\'s own personnel policies and job description library.
  **Tier**                 Tier 5 --- Internal Business
  **Depends on**           CivicCore
  **Why local LLM fits**   HR policy questions are one of the highest-volume internal queries. Personnel files contain HIPAA, FMLA, background checks, and comp data --- an absolute non-starter for cloud AI. Local-LLM Q&A over personnel policies is an obvious fit.
  ------------------------ ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

**Key capabilities**

-   Policy Q&A: staff ask \'how does FMLA work for part-time
    employees?\' --- answered with citations

-   Job description drafting from templates and role context

-   Onboarding packet generation per role and department

-   Training record tracking and policy-acknowledgment workflows

-   Employee handbook versioning and plain-language summaries

-   Salary schedule lookup and position classification

-   Grievance and complaint intake templates (not tracking --- that\'s
    HRIS)

**Source materials ingested**

-   Personnel policies and employee handbook

-   Job description library

-   Classification and compensation plans

-   Training requirements and records

-   Union agreements (for cities with unions)

**AI workflows (all human-approved)**

-   Policy Q&A with citation to policy section

-   Job description drafting

-   Onboarding checklist generation

-   Plain-English handbook summaries

**Compliance & legal considerations**

-   HIPAA, FMLA, ADA, and other employment-law content reviewed by
    HR/counsel before publication

-   Union agreement provisions respected in AI answers

-   Equal opportunity language in job descriptions

**Scope boundaries (what this is NOT)**

-   NOT an HRIS --- no payroll, benefits administration, or personnel
    records management

-   Integrates with NEOGOV/Workday/ADP/Paylocity as read-only where
    appropriate

-   Personnel file content never ingested without HR approval and access
    controls

CivicBudget Assist --- Budget Narratives & Transparency

  ------------------------ ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  **Module**               CivicBudget
  **Primary owner**        Finance / City Manager / Department budget leads
  **Purpose**              Budget memo drafting, departmental budget narrative generation, line-item analysis, hearing packet prep. Not a budgeting tool --- a drafting copilot alongside the city\'s ERP.
  **Tier**                 Tier 5 --- Internal Business
  **Depends on**           CivicCore, CivicClerk (for Council packets), CivicData (for transparency publishing)
  **Why local LLM fits**   Budget documents are long, structured, and repetitive year-over-year. A local-LLM that drafts narratives from prior-year documents and current-year line items is a huge time-saver and keeps sensitive comp and position data local.
  ------------------------ ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

**Key capabilities**

-   Budget narrative drafting from line items and prior-year narratives

-   Department budget memo assembly

-   Revenue and expenditure explanation drafting

-   Capital Improvement Plan (CIP) integration with CivicPlan

-   Budget hearing packet prep (via CivicClerk)

-   Budget transparency publishing (via CivicData)

-   GFOA budget presentation award criteria alignment (optional)

-   CAFR/ACFR supporting narrative drafting

**Source materials ingested**

-   Current and prior-year budget line items (from the ERP)

-   Prior budget narratives

-   Departmental work plans and strategic priorities

-   CIP and long-range financial forecasts

**AI workflows (all human-approved)**

-   Narrative drafting from line-item data

-   Memo drafting for budget hearings

-   Variance explanation drafting (when prior-year and current-year
    differ)

-   Plain-English budget summaries for residents

**Compliance & legal considerations**

-   Public hearing requirements (via CivicNotice)

-   GFOA budget presentation standards (where pursued)

-   Single audit / Uniform Guidance compliance for grant-funded line
    items

**Scope boundaries (what this is NOT)**

-   NOT a budgeting tool --- Tyler Munis, OpenGov, Caselle, Workday own
    that space

-   Does not execute transactions or journal entries

-   Does not forecast revenues without explicit model inputs

CivicLegal Research --- Internal Legal Q&A Over City Documents

  ------------------------ -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  **Module**               CivicLegal
  **Primary owner**        City Attorney / Paralegal / Clerk
  **Purpose**              Q&A over the city\'s own legal corpus: ordinances, resolutions, contracts, past legal opinions, litigation history, statutory references, prior Council actions. Not a replacement for Westlaw/Lexis --- a copilot for the city\'s own record.
  **Tier**                 Tier 5 --- Internal Business (GAP IN CURRENT SPEC)
  **Depends on**           CivicCore, CivicCode, CivicClerk, CivicContracts
  **Why local LLM fits**   City attorneys ask \'when did we last consider this?\' or \'what did the prior Council decide?\' or \'do we have a policy on this?\' --- and currently it\'s an email to the clerk. Local-LLM over the city\'s own record with citations is exactly the right shape. Cloud AI sees confidential legal strategy, which is a non-starter.
  ------------------------ -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

**Key capabilities**

-   Cross-corpus search: code + ordinances + resolutions + minutes +
    contracts + legal opinions

-   Legal opinion drafting assistance (the attorney reviews and signs;
    AI drafts)

-   Precedent lookup: \'have we dealt with this before?\' with citations
    to prior Council actions

-   Litigation hold support: when a matter is in litigation, flag
    relevant records

-   Ordinance drafting assistance with prior-ordinance comparison

-   State statute and appellate case citation tracking (attorney
    maintains the corpus; AI retrieves)

-   Confidentiality tier: staff-only corpus, attorney-only corpus,
    privileged/work-product corpus

**Source materials ingested**

-   Municipal code, ordinances, resolutions (from CivicCode)

-   Council minutes and packets (from CivicClerk)

-   Contracts (from CivicContracts)

-   Past legal opinions, memos, and litigation records (curated by city
    attorney)

-   State statutes and controlling appellate decisions
    (attorney-maintained)

**AI workflows (all human-approved)**

-   Cross-corpus Q&A with tier-aware access control

-   Legal memo drafting assistance

-   Ordinance drafting with prior-version comparison

-   Litigation hold detection across records

**Compliance & legal considerations**

-   Attorney-client privilege tier respected at the access-control layer

-   Work-product doctrine respected --- privileged records isolated

-   Retention and destruction per records schedule and litigation holds

**Scope boundaries (what this is NOT)**

-   NOT Westlaw/Lexis --- does not replace commercial legal research for
    state/federal law

-   Does not generate legal advice --- drafts for attorney review

-   Privileged material is isolated and access-controlled

CivicElections Assist --- Election Administration Support

  ------------------------ ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  **Module**               CivicElections
  **Primary owner**        City Clerk / Election Official
  **Purpose**              Election administration support for cities that run their own elections (many home-rule cities and charter cities). Voter information Q&A, candidate filing guidance, election worker training Q&A, ballot drafting assistance, post-election canvass support.
  **Tier**                 Tier 5 --- Internal Business (GAP IN CURRENT SPEC)
  **Depends on**           CivicCore, CivicCode (election code), CivicAccess (accessible materials)
  **Why local LLM fits**   Elections are one of the most sensitive surfaces a city has. Nothing in the election administration workflow should touch cloud AI. A local-LLM over the city\'s election code, past election records, and candidate-filing guidance is exactly the right scope.
  ------------------------ ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

**Key capabilities**

-   Voter information Q&A: \'where do I vote?\' \'what\'s on my
    ballot?\' \'am I registered?\' (integrates with state voter
    registration systems)

-   Candidate filing guidance: deadlines, petition requirements,
    campaign finance filings, disclosures

-   Campaign finance filing review and publication (plain-English
    summaries)

-   Election worker training Q&A over the city\'s procedures manual

-   Ballot question drafting assistance with plain-language summaries
    (clerk approves)

-   Canvass support and election results publication

-   Accessible polling place information (CivicAccess)

-   Multilingual election materials

**Source materials ingested**

-   Election code (local and state)

-   Candidate filing forms and guidance

-   Campaign finance filings

-   Election worker procedures manual

-   Past election records and canvass reports

-   Polling place and precinct data

**AI workflows (all human-approved)**

-   Voter information Q&A with source citations

-   Ballot question plain-language summary drafting

-   Election worker procedures Q&A

-   Campaign finance filing plain-English summaries

**Compliance & legal considerations**

-   HAVA, VRA, state election code --- all hard compliance requirements

-   Election record retention and security

-   Accessibility of all election materials (DOJ Title II + HAVA
    Section 301)

-   Confidentiality of ballot and voter information

**Scope boundaries (what this is NOT)**

-   NOT a voter registration system, ballot marking device, or tabulator

-   NOT a campaign finance filing system of record --- provides guidance
    and publication, not filing

-   Does not conduct the election --- supports the clerk in
    administering it

13\. Tier 6 --- Specialized (Deploy Late, with Care)

CivicUtility Assist --- Utility Customer Service Copilot

  ------------------------ ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  **Module**               CivicUtility
  **Primary owner**        Utilities / Customer Service
  **Purpose**              Copilot for utility customer service staff. Account lookup, billing Q&A, payment arrangement drafting, service request intake. Not a utility billing system --- a layer on top.
  **Tier**                 Tier 6 --- Specialized
  **Depends on**           CivicCore, Civic311
  **Why local LLM fits**   Utility billing systems are deep; replacing them is not the fight. But CSRs spend hours answering the same billing and service questions. Local-LLM over the utility policy manual + read-only access to the billing system is high-value and low-risk.
  ------------------------ ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

**Key capabilities**

-   CSR-facing Q&A over billing policies and service rules

-   Resident-facing Q&A: billing, service rates, payment options,
    conservation

-   Payment arrangement drafting

-   Service request intake (integrates with Civic311)

-   Rate schedule lookup and explanation

-   Conservation program eligibility guidance

**Source materials ingested**

-   Utility rate schedules and policy manual

-   Customer service procedures

-   Conservation program documentation

-   Read-only account data from the billing system

**AI workflows (all human-approved)**

-   CSR Q&A with citation to policy

-   Payment arrangement drafting from CSR input

-   Plain-English rate explanations

**Compliance & legal considerations**

-   Account data access controls (PII, payment data)

-   Rate and billing policy compliance

-   Low-income and shutoff policy compliance (state-specific)

**Scope boundaries (what this is NOT)**

-   NOT a utility billing system --- integrates with CIS Infinity,
    Cartegraph, Lucity, Munis, etc.

-   Does not process payments

-   Does not modify accounts

CivicCourt Assist --- Court & Clerk Document Support

  ------------------------ -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  **Module**               CivicCourt
  **Primary owner**        Court Clerk / Municipal Court
  **Purpose**              Document preparation and search support for municipal court clerks. Highly sensitive; deploy late, separately, with tight scoping.
  **Tier**                 Tier 6 --- Specialized (deploy late, with care)
  **Depends on**           CivicCore deployed in isolated profile
  **Why local LLM fits**   Municipal court records include sealed records, juvenile cases, and ongoing proceedings. Cloud AI is a non-starter. But local-AI over forms, procedures, and the court\'s own code is valuable for clerks preparing hearings.
  ------------------------ -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

**Key capabilities**

-   Forms generation (citations, summonses, warrants per court
    procedure)

-   Procedure Q&A over court rules and municipal code

-   Scheduling support and hearing preparation

-   Defendant self-help Q&A (non-legal-advice) --- forms, deadlines,
    procedures

**Source materials ingested**

-   Municipal court procedures and local rules

-   Municipal code (via CivicCode)

-   Court forms

**AI workflows (all human-approved)**

-   Form generation from case data

-   Procedural Q&A with citations

-   Resident self-help guidance (explicitly non-advice)

**Compliance & legal considerations**

-   Sealed and juvenile record isolation

-   Due process --- no AI decisions of any kind

-   State court administrative office rules (varies)

**Scope boundaries (what this is NOT)**

-   NOT a court case management system --- integrates with Tyler
    Odyssey, Journal Technologies, etc.

-   NO AI in any adjudicative workflow

-   Deployed in isolated profile with tightest access controls

CivicSafety Assist --- Non-CJIS Admin Functions

  ------------------------ -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  **Module**               CivicSafety
  **Primary owner**        Public Safety administration (NOT operations or dispatch)
  **Purpose**              Policy and procedure Q&A, non-CJIS administrative workflows, public information officer support. Explicitly excludes any CJIS-bound data.
  **Tier**                 Tier 6 --- Specialized (deploy last, isolated)
  **Depends on**           CivicCore in an isolated deployment profile with CJIS gate enforced
  **Why local LLM fits**   Public safety data is CJIS-regulated. The CivicRecords architecture already has a CJIS gate. CivicSafety Assist stays strictly on the non-CJIS side: SOPs, policies, public communications, training records that don\'t touch CJI.
  ------------------------ -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

**Key capabilities**

-   Policy and SOP Q&A for officers and staff

-   Training record tracking (non-CJI)

-   Public information officer drafting support

-   Non-CJI records-request assistance (via CivicRecords)

-   Body-worn camera retention metadata (no video AI)

-   Crime statistics public publishing (aggregated, non-CJI)

**Source materials ingested**

-   Department SOPs and policies

-   Training materials (non-CJI)

-   Public crime statistics

-   Public information releases

**AI workflows (all human-approved)**

-   Policy Q&A with citations

-   Press release drafting

-   Public information Q&A

**Compliance & legal considerations**

-   CJIS gate strictly enforced --- no CJI ingestion or processing

-   Signed CJIS Security Addendum for any personnel with access

-   Body-worn camera content and evidence are isolated per CJIS policy

**Scope boundaries (what this is NOT)**

-   NO CAD/RMS integration

-   NO CJI ingestion, ever

-   NO AI in investigative, dispatch, or enforcement workflows

CivicLibrary --- Library Policy & Reference Support

  ------------------------ ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  **Module**               CivicLibrary
  **Primary owner**        Library Director / Reference Librarians
  **Purpose**              For cities with a library. Policy Q&A, reference support for librarians, patron-facing Q&A over library programs and collections.
  **Tier**                 Tier 6 --- Specialized (optional, city-dependent)
  **Depends on**           CivicCore
  **Why local LLM fits**   Libraries are deeply privacy-protective --- patron records are legally shielded in most states. Cloud AI is a non-starter. Local-AI over collection metadata, program info, and library policy is appropriate.
  ------------------------ ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

**Key capabilities**

-   Library policy Q&A

-   Program and event Q&A for patrons

-   Reference assistance for librarians (over collection metadata, NOT
    patron records)

-   Collection development guidance

-   Accessibility of library materials

**Source materials ingested**

-   Library policies

-   Program and event calendars

-   Collection metadata

-   Reference materials

**AI workflows (all human-approved)**

-   Policy and program Q&A

-   Reference assistance with source citations

**Compliance & legal considerations**

-   State library privacy laws (patron records legally shielded)

-   Intellectual freedom policy

-   ADA accessibility

**Scope boundaries (what this is NOT)**

-   NO patron record access

-   NOT an ILS (integrated library system)

-   NOT a replacement for professional reference service

CivicParks --- Parks & Recreation Copilot

  ------------------------ ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  **Module**               CivicParks
  **Primary owner**        Parks & Recreation Director
  **Purpose**              For cities with parks and recreation departments. Facility and program Q&A, registration assistance, policy lookups, maintenance coordination.
  **Tier**                 Tier 6 --- Specialized (optional, city-dependent)
  **Depends on**           CivicCore, Civic311 (maintenance requests)
  **Why local LLM fits**   Parks program registration includes minor participants, accommodations, and payment data. Local-AI over program catalogs, facility rules, and policies is the right fit; registration happens in existing systems like RecTrac or CivicRec.
  ------------------------ ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

**Key capabilities**

-   Program and facility Q&A

-   Registration assistance (links to existing reg system)

-   Policy Q&A (facility rules, rental terms, league rules)

-   Maintenance request triage (via Civic311)

-   Plain-English program descriptions

**Source materials ingested**

-   Program catalogs

-   Facility rental policies and fee schedules

-   Park rules and regulations

-   League and sports program rules

**AI workflows (all human-approved)**

-   Program and facility Q&A

-   Policy lookup with citations

-   Plain-English program descriptions

**Compliance & legal considerations**

-   Minor participant privacy (program registration records)

-   ADA accommodation tracking

-   Liability waiver retention

**Scope boundaries (what this is NOT)**

-   NOT a registration system --- RecTrac, CivicRec, ActiveNet own that
    space

-   Does not process payments

-   Does not schedule maintenance autonomously

Part IV. Roadmap & Sequencing

14\. Four-Phase Rollout

The goal is to ship a coherent \'city operating stack\' that cities can
adopt module-by-module, without forcing them into a monolith or asking
them to replace systems of record.

Phase 1 --- Establish the sovereign municipal platform (Clerk Core)

1.  CivicCore --- factor out from CivicRecords AI codebase; no
    user-visible product.

2.  CivicRecords AI --- continue current trajectory per v3.0 spec;
    finish notifications SMTP, reconcile version drift, finish public
    portal.

3.  CivicClerk --- agendas, packets, minutes, meeting archive. Strongest
    adjacency to CivicRecords.

4.  CivicCode --- municipal code Q&A. Fills the biggest gap in the
    current spec. Shares ordinance data with CivicClerk.

5.  CivicAccess --- accessibility review, plain language, multilingual.
    Feeds every subsequent module.

Outcome: a city can handle records requests, run Council meetings,
publish an accessible code lookup, and meet Title II accessibility
commitments --- all on local AI, all open source.

Phase 2 --- Land use and development

6.  CivicZone --- zoning code and parcel-aware lookups. The
    second-highest-volume civic question after the municipal code.

7.  CivicPlan --- comprehensive plan and long-range plan access. Pairs
    naturally with CivicZone.

8.  CivicPermit Assist --- pre-application copilot; integrates with
    existing permitting systems rather than replacing them.

9.  CivicInspect --- inspector field copilot.

Outcome: a resident or developer can self-serve zoning, comp plan, and
permit-pathway questions. Planners get their counter time back for
judgment calls.

Phase 3 --- Administrative and resident services

10. CivicGrants --- highest-leverage expansion; tiny teams with massive
    paperwork burden.

11. CivicProcure Assist --- procurement copilot, not a sourcing
    platform.

12. CivicContracts --- contract repository with Q&A.

13. CivicBoards --- non-Council boards and commissions.

14. CivicNotice --- compliance-aware notice publication.

15. Civic311 --- resident service requests with Open311 compatibility.

16. CivicComms --- public explainers and communications.

17. CivicData Bridge --- open data and transparency publishing with
    CKAN.

18. CivicRegWatch --- federal regulatory intelligence alerts for rules,
    guidance, deadlines, and funding changes that may affect city
    operations.

19. CivicAPI --- public read-only API over human-approved published
    CivicSuite records.

Outcome: a coherent \'administrative suite\' alongside the clerk core.
Grants-funded small cities can justify the full stack on the strength of
CivicGrants alone.

Phase 4 --- Internal business and specialized

20. CivicHR Assist --- policy Q&A, job descriptions, onboarding.

21. CivicBudget Assist --- budget narratives and transparency.

22. CivicLegal Research --- internal legal corpus Q&A with privilege
    tiers.

23. CivicElections Assist --- for cities that run their own elections.

24. CivicUtility Assist --- utility customer service copilot.

25. CivicCourt Assist --- court clerk copilot, isolated deployment.

26. CivicSafety Assist --- non-CJIS administrative functions only.

27. CivicLibrary --- library support, optional and city-dependent.

28. CivicParks --- parks and recreation support, optional and
    city-dependent.

15\. Suite Tiers (Packaging)

  ---------------------- ---------------------------------------------------------------------------------------------------------------- -----------------------------------------------------------
  **Tier**               **Modules**                                                                                                      **Target city**
  Clerk Core             CivicCore + CivicRecords + CivicClerk + CivicCode + CivicAccess                                                  Any city. The strongest initial \'city operating stack.\'
  Land Use Add-on        \+ CivicZone + CivicPlan + CivicPermit Assist + CivicInspect                                                     Cities with meaningful development activity.
  Administrative Suite   \+ CivicGrants + CivicProcure + CivicContracts + CivicBoards + CivicNotice + Civic311 + CivicComms + CivicData + CivicRegWatch + CivicAPI   Cities growing beyond the clerk core.
  Internal Business      \+ CivicHR + CivicBudget + CivicLegal + CivicElections                                                           Cities with internal staff capacity for these tools.
  Specialized            \+ CivicUtility + CivicCourt + CivicSafety + CivicLibrary + CivicParks                                           City-dependent. Some modules require isolated deployment.
  ---------------------- ---------------------------------------------------------------------------------------------------------------- -----------------------------------------------------------

Part V. What NOT to Build (and Why)

The suite\'s coherence depends partly on what it declines to do. These
categories are real markets with real pain, but they are the wrong
fights for an open-source, local-LLM project.

16\. Not a First-Wave ERP Replacement

Tyler Munis, OpenGov, Caselle, and Workday own municipal ERP. Budgeting,
general ledger, accounts payable, accounts receivable, fixed assets,
payroll --- these are deep integration markets with payment processing,
bank reconciliation, and state reporting. CivicBudget Assist is a
copilot on top, not a replacement.

17\. Not a First-Wave Utility Billing Replacement

CIS Infinity, Cartegraph, Lucity, and Munis own utility billing.
Payments, meter reads, cutoff workflows, and rate engines are complex
and high-risk. CivicUtility Assist is a CSR copilot on top, not a
billing system.

18\. Not a First-Wave Permitting System of Record

Tyler EnerGov, Accela, CityWorks own permitting. Plan review,
inspections, fee processing, and certificate of occupancy workflows are
deep. CivicPermit Assist is a pre-application layer and reviewer copilot
--- not a system of record.

19\. Not a CAD/RMS or Courts System

Mark43, Spillman, Axon, Genetec own CAD/RMS. Tyler Odyssey and Journal
Technologies own courts. CJIS and due process raise the stakes.
CivicSafety Assist is explicitly non-CJIS. CivicCourt Assist is form
preparation and procedures, not a case management system.

20\. Not a Cloud Service

The suite\'s entire value proposition is local inference and local data.
Running it as a SaaS would invert the positioning. Support and services
can be sold (implementation, training, custom connectors, 50-state code
adapters) --- but the software itself stays on the city\'s hardware.

Part VI. Cross-Cutting Concerns

21\. Accessibility

WCAG 2.2 AA is the baseline for every module\'s UI. CivicAccess provides
the content-review layer that every other module uses for public-facing
publishing. Title II compliance dates (April 24, 2026 for cities \>50K; April 26,
2027 for smaller) are firm. The suite\'s value here is genuinely differentiated
--- incumbents typically don\'t ship accessibility review out of the
box.

22\. Security

-   AES-256 at rest for credentials, never logged or exported.

-   JWT tokens with configurable expiration; service accounts for
    inter-module calls.

-   CJIS Security Policy compliance gate for public-safety connectors.

-   HIPAA-aware handling in HR and Safety modules; never store PHI
    unnecessarily.

-   Network discovery disabled by default; explicit IT opt-in required.

-   MS-ISAC alignment --- the suite supports, rather than replaces, the
    city\'s existing SLTT cybersecurity posture.

23\. Data Sovereignty

-   No outbound network connections at runtime (verification scripts
    enforce).

-   No telemetry, analytics beacons, or external API calls.

-   All LLM inference local via Ollama.

-   All dependencies permissive or weak-copyleft; AGPL and GPL-3.0
    blocked.

-   City owns its deployment. Uninstall means \'delete the containers
    and volumes\' --- there is no account to close.

24\. Integration Landscape

The suite does not replace systems of record. It reads from them (via
the connector framework) and supplements them. The following
integrations are expected over time, in priority order:

  --------------------- --------------------------------------------------------- -----------------------------------------------------------------------
  **Category**          **Incumbent systems**                                     **Integration mode**
  Document management   Laserfiche, OnBase, SharePoint, Google Drive              Read (via REST or SMB); primary ingest source
  Email                 Microsoft 365, Google Workspace                           IMAP journal read; primary source for records requests
  Meeting platforms     Granicus, Legistar, PrimeGov (legacy)                     Import for historical packets; Townlight Meetings replaces ongoing
  Codifier              Municode, American Legal, Code Publishing, General Code   Read (XML or web); Townlight Code stays alongside
  GIS                   Esri ArcGIS, open-source GIS                              Read (REST or GeoJSON); critical for Townlight Zoning and Townlight 311
  Permitting            Tyler EnerGov, Accela, CityWorks                          Read (mirror status); Townlight Permitting sits on top
  ERP / Finance         Tyler Munis, OpenGov, Caselle, Workday                    Read (line-item data for Townlight Budget and Townlight Grants)
  HR / Payroll          NEOGOV, Workday, ADP, Paylocity                           Read (non-PII metadata); Townlight HR policy stays separate
  Utility billing       CIS Infinity, Cartegraph, Lucity, Munis                   Read (CSR copilot context)
  CAD / RMS             Mark43, Spillman, Axon, Genetec                           No integration (CJIS gated out of scope)
  Court CMS             Tyler Odyssey, Journal Technologies                       No integration first wave; Townlight Courts is separate and isolated
  Open data             CKAN                                                      Write (publication target); Townlight Data
  --------------------- --------------------------------------------------------- -----------------------------------------------------------------------

Appendix A. Naming & Identity

Umbrella: Townlight AI. Alternative umbrellas considered: CivicOS,
CivicStack. Townlight AI is preferred because \'suite\' signals
modularity without committing the reader to an operating-system
metaphor, and \'AI\' distinguishes the product from generic municipal
SaaS in every search result and procurement document.

Module naming convention: \'Civic\' + capability. Keep one word where
possible (Townlight Meetings, Townlight Code, Townlight Zoning, Townlight Grants). Two-word names
only where disambiguation requires (Townlight 311, Townlight Courts,
Townlight Data). Never more than two words.

Townlight Records retains its current name (no hyphen removal, \'AI\'
suffix kept) to preserve continuity with the v3.0 spec and the existing
repository. Subsequent modules drop the \'AI\' suffix because it is
redundant once the suite identity is established --- \'Townlight AI\'
carries it.

Appendix B. Mapping Current Spec Features → Modules

Where does each feature in the current Townlight Records repo belong in
the suite model? This mapping is not a rewrite plan --- it is a guide
for factoring shared infrastructure into Townlight Core incrementally over
time.

  ------------------------------------------------------------------------- -------------------------------------------------------------------------------
  **Current repo feature (v3.0)**                                           **Destination in suite model**
  fastapi-users auth, JWT, RBAC, service accounts                           Townlight Core
  Hash-chained audit log                                                    Townlight Core
  LLM abstraction (Ollama wrapper, model registry, context\_window\_size)   Townlight Core
  Hybrid search (pgvector + tsvector, source attribution)                   Townlight Core
  Document ingestion (PDF/DOCX/XLSX/CSV/email/HTML/text + OCR fallback)     Townlight Core
  Notification service and templates                                        Townlight Core
  Connector framework (authenticate/discover/fetch/health\_check)           Townlight Core
  Onboarding wizard, city profile, municipal systems catalog                Townlight Core
  50-state exemption rules engine                                           Townlight Core (so Townlight Legal, Townlight Contracts, Townlight Records all inherit)
  Request lifecycle, queue, detail, workflow transitions                    Townlight Records (module-specific)
  Response letter generation with templates                                 Townlight Records (module-specific)
  Fee tracking, fee schedules, fee line items, waivers                      Townlight Records (module-specific)
  Exemption dashboard (accuracy, export)                                    Townlight Records (module-specific, using Townlight Core engine)
  Tiered redaction engine (when built)                                      Townlight Core (shared across Townlight Records, Townlight Legal, Townlight Data)
  Public request portal (when built)                                        Townlight Records (module-specific) + shared resident portal shell in Townlight Core
  ------------------------------------------------------------------------- -------------------------------------------------------------------------------

Appendix C. Prompt Library Governance

Every module ships a versioned prompt library as YAML files in the
module repository. Prompts are code artifacts under the Apache License 2.0 (or CC BY-SA 4.0 if shipped as a separate prompt repository per the suite's prompt-licensing pattern); a
city can fork them. The governance model borrows from PatentForge\'s
prompt-licensing pattern:

-   Each prompt has a version number, effective date, author, and review
    date.

-   Changes to prompts are tracked in the CHANGELOG like any other code
    change.

-   Cities can override any prompt locally via the admin panel; the
    override is audit-logged and never silently synced.

-   Sensitive module prompts (Townlight Legal, Townlight Safety, Townlight Elections)
    require attorney or department head review before any change lands.

Appendix D. Deployment Profiles

Every module supports three deployment profiles. Cities choose per
module, not per suite.

-   Single-workstation: suitable for very small cities, one or two
    clerks. Docker Compose on a modern desktop; runs Gemma 4 on CPU or
    consumer GPU.

-   Small on-prem server: the expected default for most cities.
    Dedicated server with 32-128GB RAM and either a consumer GPU or
    sufficient CPU headroom.

-   Segmented / air-gapped: for sensitive modules (Townlight Courts,
    Townlight Safety non-CJIS administrative, Townlight Legal privileged tiers).
    Isolated host, no network egress whatsoever, physical access
    controls.

Appendix E. Bottom-Line Recommendation

Build Townlight AI as an open-source, Apache-2.0-licensed, airgappable,
local-LLM municipal suite with Townlight Records as Module 1 and the
following four modules as the Clerk Core: Townlight Meetings, Townlight Code,
Townlight Access, and Townlight Core as the shared platform underneath. Then
expand into Townlight Zoning, Townlight Planning, Townlight Grants, and Townlight Procurement. That
gives you a coherent \'day-to-day city operations\' platform without the
ERP, utilities, courts, or CAD/RMS fights that would sink an open-source
project.

The v3.0 spec is a strong Module 1 specification. It is not a suite
specification. Promoting its shared infrastructure into Townlight Core,
filling the Townlight Code and Townlight Zoning gaps with purpose-built modules, and
adopting the consistent module anatomy described here converts
\'Townlight Records\' into \'Townlight AI, with Townlight Records as Module
1\' --- with almost no changes to the existing code, just a packaging
and architecture refactor that can happen incrementally.

The strongest near-term move: author a short Townlight Core v0.1 spec that
identifies which files move out of the Townlight Records repo and into a
shared package, ship it as a non-breaking refactor, and begin Townlight Meetings
and Townlight Code on top of it in parallel.
