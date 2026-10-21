**Townlight Zoning**

**Module Spec v0.1**

*Zoning code, parcel-aware lookups, overlay districts, and planner
workflows --- as a first-class civic product*

Modeled on the v3.0 Townlight Records unified spec • Built on Townlight Core

Version 0.1 --- Draft for review --- April 23, 2026

Open source · Apache License 2.0 · Gemma 4 default · airgappable

**Document Metadata**

  --------------------- -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  **Module**            Townlight Zoning --- Tier 2 Land Use & Development
  **Document status**   v0.1 spec draft. Module itself is PLANNED (no code written). This doc is the buildable spec.
  **Purpose**           Zoning and land-use code as a first-class product with parcel-level awareness. Answers "what zone is my property, what can I build there, what are the setbacks" --- with citations, parcel-scoped answers, and optional GIS integration.
  **Primary owner**     Planning & Development / Community Development
  **Depends on**        Townlight Core (auth, RBAC, audit, LLM, ingest, search, notifications), Townlight Code (shares ordinance infrastructure and version tracking). Optional: Townlight Planning (comp plan cross-references), Townlight Meetings (variance hearing minutes).
  **Default model**     Gemma 4 via Ollama. Local inference only. Embeddings via nomic-embed-text.
  **License**           Apache License 2.0 (code). CC BY 4.0 (docs). CC BY-SA 4.0 (prompt library, optional separate repo).
  **Supersedes**        Nothing. First Townlight Zoning spec. Fills the Land Use gap identified in the CivicSuiteAI Module Catalog.
  **Grounded in**       CivicRecordsAI-UnifiedSpec-v3.0 (stylistic and structural template). CivicSuiteAI\_Module\_Catalog\_v1 (module card and tier placement). Townlight Core v0.1 Extraction Spec (platform dependency).
  **Completion bar**    Every user-facing state designed and tested. Every AI output cites source. Every parcel lookup discloses data freshness. Every answer declines to opine on approval outcomes and routes to a planner for determinations.
  --------------------- -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

**Table of Contents**

**Part I. Purpose & Strategic Context**

**1. Why Townlight Zoning**

Zoning counter questions consume an absurd share of planner time at
every city in America. A resident walks in, calls, or emails with a
question of the form: "can I put an ADU on my lot," "how tall can I
build," "what's the setback on my property," "am I in the floodplain,"
"can I run a home occupation," "what are the parking requirements for my
use." Each of these is answerable by reading the zoning code against the
specific parcel --- but the planner still reads the code, still pulls
the map, still writes the email, still answers the phone. Multiplied
across a year, this is a career's worth of time spent on the same 50
questions.

The v3.0 Townlight Records spec treats Land Use & Permitting as a
connector domain. That is the correct framing inside a records module.
It is the wrong framing for the suite. Zoning is its own product surface
with its own users, its own compliance boundaries, and its own data
shape. Townlight Zoning is that product.

**2. The 80/20 bet**

Townlight Zoning is explicitly scoped around the 80% case: residents and staff
asking routine questions about specific parcels. The 20% --- variance
interpretation, conditional use outcomes, nonconforming-use arguments,
novel interpretations of overlay intent --- always routes to a planner.
Townlight Zoning does not attempt to make determinations. It makes information
accessible. The planner's judgment stays where it belongs: in the
office, with a record.

That scoping is not a limitation; it is the whole design. The moment an
automated system appears to make a zoning determination, a city has a
liability problem, a due-process problem, and a public-trust problem.
Townlight Zoning sidesteps all three by never crossing that line, and by making
the line visible to users at every turn.

**3. Where it fits in the suite**

-   Depends on Townlight Core: auth, RBAC, audit chain, LLM abstraction,
    document ingestion, hybrid search, connector framework,
    notifications, admin shell.

-   Depends on Townlight Code: the zoning code is an ordinance. The
    authoritative text lives in Townlight Code's store. Townlight Zoning reads,
    structures, and parcel-scopes; Townlight Code owns the source of truth.

-   Optional integration with Townlight Planning: shows comprehensive plan policy
    context next to zoning answers. "The code allows this; the comp plan
    says it's a compatible infill use."

-   Optional integration with Townlight Meetings: ingests variance and
    conditional-use hearing minutes as precedent context for staff Q&A
    (never resident-facing).

-   Optional integration with Townlight Permitting (Tier 2):
    pre-application pre-check --- given a described project, what
    permits and approvals does this parcel trigger.

**4. Tiering and compliance posture**

Townlight Zoning sits in Tier 2 --- Land Use & Development. It is safe for any
city to install once the Clerk Core (Townlight Core + Townlight Records +
Townlight Meetings + Townlight Code + Townlight Access) is running. It inherits
Townlight Core's sovereignty stance: no outbound network calls at runtime, no
telemetry, all LLM inference local. The planning department owns the
configuration.

**Part II. User Experience & Workflows**

**5. Primary personas**

  ------------------------------------- ------------------------------------------------------------------------------------------------------------------------------ ----------------------------------------------------
  **Persona**                           **Primary use case**                                                                                                           **Access level**
  Resident / homeowner                  Ask about a specific parcel: zone, overlays, permitted uses, setbacks, height, parking, ADU rules.                             Public --- anonymous or authenticated
  Small-business applicant              Ask whether a proposed use is allowed at a given address; dimensional pre-check; parking ratio lookup.                         Public --- anonymous or authenticated
  Counter staff / planning technician   Same questions as residents but with additional context: prior variance history, related code cross-references, staff notes.   Staff --- authenticated
  Planner                               Complex lookups: overlay interaction, nonconforming-use questions, precedent review, staff report drafting support.            Staff --- authenticated
  Planning director                     High-volume question dashboards, suspected code ambiguities, topic trends to inform future code updates.                       Staff --- authenticated
  Developer / engineer / architect      Dimensional pre-check at volume; batch parcel lookups during site selection.                                                   Public --- authenticated preferred for rate limits
  City attorney                         Read-only access to variance precedent and code amendment history.                                                             Staff --- authenticated
  ------------------------------------- ------------------------------------------------------------------------------------------------------------------------------ ----------------------------------------------------

**6. Resident-facing workflows**

**6.1 Parcel lookup**

The resident enters an address or clicks a parcel on a map. Townlight Zoning
returns:

-   Base zone (e.g., R-1, MU-3, I-2) with a plain-English one-sentence
    description.

-   All applicable overlays (floodplain, historic, downtown,
    transit-oriented, hillside, airport influence,
    neighborhood-specific).

-   Parcel metadata: assessor lot size, frontage, legal description ---
    clearly attributed to the GIS source layer with a last-updated date.

-   Suggested next questions scoped to this parcel ("what can I build
    here," "what are the setbacks," "can I have chickens").

-   A prominent "this is not a zoning determination" disclaimer and a
    one-click path to request a written verification from the planning
    counter.

**6.2 Use question ("can I X at this address")**

The resident types a free-form question like "can I run a bakery from my
house." The system:

-   Extracts the proposed use from the question.

-   Classifies it against the use matrix for the parcel's zone +
    overlays.

-   Returns one of: Permitted (with any conditions), Permitted with
    conditions / home-occupation rules, Conditional Use Permit required,
    Not Permitted. Each answer cites the specific code section.

-   Explains the next step ("file a home-occupation registration,"
    "apply for a CUP," "contact the planner").

-   Declines to guarantee an outcome; every answer carries the "not a
    determination" disclaimer.

**6.3 Dimensional question (setbacks, height, coverage)**

Three entry points:

-   "What are the setbacks at \[address\]?" --- returns front, side,
    rear, plus any overlay modifications, with code citations.

-   "How tall can I build at \[address\]?" --- returns base height, plus
    any modifications for hillside/historic/airport overlays, with
    citations.

-   Pre-check: "I'm planning a 2-story addition 8 feet from the side lot
    line --- is that OK?" --- returns compliance flag with the citation.
    Clearly labeled as informational.

**6.4 Variance / CUP explainer**

For 80% cases the answer is clear. For the 20% where a variance or CUP
is needed, Townlight Zoning:

-   Explains the standards the applicant would have to meet (hardship,
    compatibility, etc.) in plain English with citations.

-   Describes the process (application, fee, notice requirements,
    hearing body, likely timeline from historical data).

-   Never opines on whether a specific request will be approved.

-   Provides the planner contact and a "discuss this with a planner"
    link.

**7. Staff-facing workflows**

**7.1 Counter staff workbench**

-   Same Q&A engine as the public surface, augmented with prior
    variance/CUP decisions at this parcel or neighboring parcels.

-   Cross-references to related code sections the resident didn't ask
    about but should know (accessory structure rules when someone asks
    about ADUs; parking when someone asks about business use).

-   One-click draft of an email response, with citations pre-filled,
    that staff edits and sends.

-   One-click draft of a zoning verification letter, clearly flagged as
    draft/unofficial until planner approves.

**7.2 Planner deep-query workbench**

-   Full-text + semantic search across the zoning code, amendment
    history, and staff-only interpretation notes.

-   Precedent lookup: "when was the last variance granted for
    encroachment into a front setback in R-1? Show me the minutes."

-   Staff report drafting assistance: given an application, pull
    relevant code sections and comp plan policies into a structured
    staff-report outline.

-   Code-ambiguity detector: flags sections with a high rate of
    follow-up questions or staff overrides, surfacing candidate sections
    for a future code update.

**7.3 Director dashboard**

-   High-volume question report: what are residents asking about most
    this month?

-   Topic trend: ADUs up 40% over last quarter, short-term rentals flat,
    parking down.

-   Likely ambiguities: sections where AI confidence is low or where
    staff frequently override drafts.

-   Public-answer accuracy check: a sample of recent public answers,
    rated by a planner for correctness. Feeds a quality score.

**Part III. Data Model**

**8. Entity overview**

Townlight Zoning introduces eleven module-specific tables. All sit alongside
Townlight Core's shared tables (users, documents, document\_chunks,
audit\_log, connectors, etc.). Every Townlight Zoning table is stored in the
civiczone schema to keep the boundary visible in the database.

  ----------------------- ------------------------------------------------------------------------ ------------------------------------------------------------------------------------------------------------------------------------------------------------------- ----------------------------------------
  **Entity**              **Purpose**                                                              **Key fields**                                                                                                                                                      **Ownership**
  zones                   Base zones (R-1, MU-3, I-2, etc.)                                        code, name, plain\_english, description\_html, effective\_date, source\_section\_ref                                                                                Townlight Zoning
  overlays                Overlay districts (floodplain, historic, transit, hillside)              code, name, plain\_english, description\_html, effective\_date, source\_section\_ref, map\_layer\_ref                                                               Townlight Zoning
  parcels                 Parcel geometry + metadata from GIS                                      parcel\_id, assessor\_id, address, geom (geography), zone\_code, overlay\_codes\[\], lot\_size\_sqft, frontage\_ft, last\_synced\_at, source\_layer\_id             Townlight Zoning (mirrored from GIS)
  use\_rules              Allowed-use rules per zone/overlay                                       zone\_code, overlay\_code (nullable), use\_category, status (permitted / permitted\_with\_conditions / conditional / prohibited), conditions\_text, citation\_ref   Townlight Zoning
  use\_categories         Canonical use taxonomy with synonyms and embeddings for fuzzy matching   code, name, description, parent\_code, synonyms\[\], embedding                                                                                                      Townlight Zoning
  dimensional\_rules      Setback, height, coverage, density, parking                              zone\_code, overlay\_code (nullable), rule\_type, value, unit, conditions\_text, citation\_ref                                                                      Townlight Zoning
  code\_sections          Zoning code section text, ingested                                       ord\_section\_ref, title, text, effective\_date, superseded\_by, chunk\_ids\[\]                                                                                     Townlight Code (Townlight Zoning reads)
  citations               Atomic citation targets used by every AI answer                          id, code\_section\_ref, anchor\_text, url, excerpt, effective\_date                                                                                                 Townlight Zoning
  precedents              Variance / CUP decisions with context                                    id, parcel\_id, decision\_type, decision\_date, body, outcome, summary, minutes\_ref, staff\_only (bool)                                                            Townlight Zoning (optional, reads Townlight Meetings)
  interpretation\_notes   Staff-curated notes: "when residents ask X, we usually respond Y"        topic, note\_text, staff\_author, last\_reviewed\_at, resident\_visible (bool)                                                                                      Townlight Zoning
  zone\_questions         Question log for analytics, dashboard, accuracy review                   id, parcel\_id (nullable), question\_text, answer\_text, citation\_refs\[\], confidence, channel (public/staff), flagged\_for\_review (bool), reviewer\_notes       Townlight Zoning
  ----------------------- ------------------------------------------------------------------------ ------------------------------------------------------------------------------------------------------------------------------------------------------------------- ----------------------------------------

**9. Versioning**

Zoning code changes. Ordinances amend sections. Overlays get added.
Parcels resubdivide. Townlight Zoning versions carefully:

-   zones, overlays, use\_rules, dimensional\_rules carry
    effective\_date and superseded\_by. A historical query ("what did
    the code say about chickens in 2024") returns the then-current rule,
    not the current one.

-   parcels are synced from GIS periodically (configurable; default
    24h). last\_synced\_at is surfaced on every parcel answer. Stale
    data is an answer-quality issue, not a silent correctness issue.

-   use\_categories is a stable taxonomy with additions allowed; renames
    are never destructive. Embeddings are regenerated when the model
    changes.

-   precedents and interpretation\_notes are append-only; edits create a
    new version with an audit record.

**10. Relationships**

-   parcels.zone\_code → zones.code (one base zone per parcel,
    enforced).

-   parcels.overlay\_codes → overlays.code (zero or more overlays per
    parcel; order matters only for display).

-   use\_rules.(zone\_code, overlay\_code) → (zones, overlays) ---
    overlay\_code NULL means base-zone rule.

-   dimensional\_rules.(zone\_code, overlay\_code) → (zones, overlays)
    --- same pattern.

-   Every rule references a citation in citations; every citation
    references a code\_section in Townlight Code.

-   precedents.parcel\_id is nullable (some precedents apply to a zone,
    not a parcel).

**11. Schema placement**

civiczone.zones

civiczone.overlays

civiczone.parcels \-- mirrored from GIS

civiczone.use\_categories

civiczone.use\_rules

civiczone.dimensional\_rules

civiczone.citations

civiczone.precedents

civiczone.interpretation\_notes

civiczone.zone\_questions \-- analytics log

\-- Inherited from Townlight Core (civiccore schema)

civiccore.users, .roles, .audit\_log, .documents,

civiccore.document\_chunks, .model\_registry, .connectors,

civiccore.notification\_templates, .city\_profile

**Part IV. AI Workflows & Prompt Design**

**12. Core principles**

-   Every material answer cites source. No uncited zoning answer is ever
    displayed.

-   Every answer is parcel-scoped when a parcel is in context. Un-scoped
    answers state that explicitly.

-   Every answer refuses to make a determination. The phrase "not a
    zoning determination" is enforced in the prompt contract and
    verified by the post-processor.

-   Every answer routes to a human when confidence is low, overlays
    conflict, or the question requires judgment.

-   Every prompt ships in the module's YAML library, versioned,
    auditable, and overridable per city via the admin panel.

**13. Prompt library**

  ---------------------------------------- -------------------------------------------------------------------------------------- --------------------------------------------------------------------------------------------------------------------- ----------------------------------------------------------------------------------------------------------------------
  **Prompt**                               **Purpose**                                                                            **Inputs**                                                                                                            **Outputs**
  parcel\_scoped\_qa.v1                    Answer a free-form question about a specific parcel                                    parcel\_id, user\_question, zone record, overlay records, top-k retrieved code chunks                                 answer\_markdown, citations\[\], confidence, flags\[\] (requires\_planner, ambiguous, outside\_scope)
  use\_matrix\_lookup.v1                   Determine permitted status for a proposed use at a zone                                zone\_code, overlay\_codes\[\], proposed\_use (free text), top-k use-category matches                                 status enum, conditions\_text, citation, confidence, next\_steps
  dimensional\_precheck.v1                 Given a described project, check dimensional compliance                                parcel record, project\_description (height, setback distances, coverage, etc.), dimensional\_rules subset            compliance\_flag per dimension, citation, overall verdict (compliant / noncompliant / ambiguous / requires\_planner)
  variance\_cup\_explainer.v1              Plain-English explanation of variance or CUP standards and process                     zone\_code, variance\_type (variance / CUP / minor mod), top-k retrieved standards, recent process data               plain\_english\_explanation, standards\_list, process\_steps, historical\_timeline\_summary, planner\_contact
  staff\_report\_outline.v1 (staff-only)   Draft a structured staff-report outline for a pending application                      application metadata, parcel, proposed use, top-k code chunks, top-k precedents, comp plan policies (via Townlight Planning)   section outlines, cited code + comp plan refs, unresolved\_flags\[\]
  plain\_english\_rewrite.v1               Plain-English summary of a specific code section (staff approves before publishing)    code\_section\_ref, section\_text, target reading level                                                               rewrite\_text, retained\_citations\[\], review\_required (bool)
  ambiguity\_detector.v1                   Identify sections with likely ambiguity based on question volume and staff overrides   question log sample, staff override log sample                                                                        ranked list of candidate sections with rationale
  ---------------------------------------- -------------------------------------------------------------------------------------- --------------------------------------------------------------------------------------------------------------------- ----------------------------------------------------------------------------------------------------------------------

**14. Citation contract**

Every answer surfaces citations as structured objects, not as free-text
mentions. The frontend renders each citation as a clickable chip that
expands to show the section excerpt, effective date, and a link to the
authoritative text in Townlight Code. The backend refuses to display an
answer whose citation array is empty.

{

\"answer\_markdown\": \"The front setback at 123 Main St (zoned R-1)\"

\+ \" is 20 feet, per §17.12.040 (A). Because your\"

\+ \" parcel is in the Hillside Overlay, an additional\"

\+ \" 5-foot step-back applies for any portion over\"

\+ \" 24 feet of height, per §17.68.080 (C).\",

\"citations\": \[

{\"ref\": \"§17.12.040(A)\", \"effective\": \"2019-03-14\", \"excerpt\":
\"...\"},

{\"ref\": \"§17.68.080(C)\", \"effective\": \"2022-09-20\", \"excerpt\":
\"...\"}

\],

\"confidence\": 0.86,

\"flags\": \[\"hillside\_overlay\_applies\"\],

\"disclaimer\": \"This is not a zoning determination.\",

\"next\_steps\": \[\"discuss with a planner for any project over
24ft\"\]

}

**15. Refusal and escalation rules**

-   If retrieval returns no chunks above similarity threshold, refuse:
    "I don't have enough of the code loaded to answer this confidently.
    Please contact a planner."

-   If the question implies an approval guarantee ("will my ADU be
    approved"), refuse: "I can't tell you whether a specific application
    will be approved. I can tell you the standards and process."

-   If overlays conflict (e.g., historic overlay + hillside overlay with
    different setback rules), escalate: surface the conflict to the user
    and flag to planner.

-   If the question references a parcel outside the city's jurisdiction,
    refuse: "That parcel is outside the city. Contact the county or
    appropriate jurisdiction."

-   If confidence \< threshold (configurable; default 0.6) OR the
    model's self-assessed flag is ambiguous, route to a planner with the
    draft answer pre-loaded for review.

**16. Prompt governance**

-   Prompts live in civiczone/prompts/\*.yaml. Every prompt has version,
    effective\_date, author, review\_date.

-   Changes flow through the standard code review process. The CHANGELOG
    notes prompt changes separately.

-   Cities override prompts via the admin panel; overrides are
    audit-logged and never silently synced upstream.

-   Planning director approval is required before any prompt change
    affecting public-facing answers lands.

**Part V. GIS Integration**

**17. Why GIS matters here**

Zoning without a parcel layer is a lookup table. Zoning with a parcel
layer is a useful product. The difference between "what does R-1 allow"
and "what can I do at 123 Main Street" is the difference between a PDF
and a tool.

**18. Parcel layer ingestion**

-   Primary connector: Esri ArcGIS REST Feature Service (read-only).
    Configurable; the city points CivicZone at their parcel service URL.

-   Fallback connector: GeoJSON file drop. For cities without ArcGIS or
    with restricted services, a scheduled GeoJSON export goes into a
    watched folder.

-   Sync cadence: default 24 hours, configurable. Every parcel row
    records last\_synced\_at and source\_layer\_id.

-   Conflict handling: if a parcel disappears from the source layer, it
    is marked archived, not deleted. A planner can resurface the
    archive.

-   Geometry storage: PostGIS geography type (WGS84). Indexed for
    nearest-neighbor and intersects queries.

**19. Overlay layer ingestion**

-   Each overlay is a separate Feature Service layer or GeoJSON export.

-   Parcels are reconciled against overlays nightly via a spatial
    intersect job. parcels.overlay\_codes is rebuilt each run.

-   Overlays with ambiguous boundaries (historic districts with a ragged
    edge, floodplains with FEMA updates) are flagged in the admin panel
    for a planner to confirm.

**20. Data freshness, disclosed**

Every parcel answer surfaces the freshness of the underlying layers.
Residents see a footer: "Parcel data last synced \[date\]. Zoning map
version \[v\]. Floodplain data last updated \[FEMA date\]." This is not
a disclaimer; it is honest labeling. Residents who need a definitive
answer have the information to know when to call a planner.

**21. Offline / air-gap handling**

Some deployments cannot reach Esri's cloud (strict air-gap, small cities
without ArcGIS). For these:

-   GeoJSON exports drop into a watched folder on the city's LAN.
    CivicZone picks them up on schedule.

-   The admin panel surfaces a banner when sync is overdue (configurable
    threshold).

-   The resident UI falls back to address-only lookup (no map) with a
    clear note that a map is unavailable.

-   No outbound calls at runtime. The GIS connector can be rate-limited
    and time-windowed to specific hours.

**22. Privacy considerations**

-   Parcel data is public record. No PII is inferred or stored.

-   Owner name is not ingested by default. Some cities publish
    ownership; others do not. The default is to leave it out and let the
    city opt in.

-   Addresses are stored but never logged alongside identifying user
    data in analytics. The zone\_questions table stores parcel\_id, not
    the user's address-as-search-string.

**Part VI. RBAC & Compliance**

**23. Role model**

CivicZone defines seven roles on top of CivicCore's RBAC primitives.
Every role is a collection of scope strings; scope strings are
module-prefixed so they compose cleanly with other modules.

  --------------------------------- ------------------------------------------------------------------------------------------------------------------------------------------------- ------------------------------------------------------------------------------------------------------------------
  **Role**                          **Capabilities**                                                                                                                                  **Scope strings**
  civiczone:public (anonymous)      Parcel lookup; use question; dimensional question; variance/CUP explainer; code section display                                                   civiczone.parcel.read, civiczone.query.public
  civiczone:authenticated\_public   Everything anonymous can do + save-favorite-parcel; lower rate limits                                                                             \+ civiczone.parcel.favorite
  civiczone:counter\_staff          Everything public + staff-side Q&A with prior precedent context; draft email responses; draft zoning verification letters (unofficial)            \+ civiczone.staff.query, civiczone.letter.draft
  civiczone:planner                 Everything counter staff + precedent lookup; interpretation note authoring; staff report outlines; prompt overrides within limits; review queue   \+ civiczone.precedent.read, civiczone.notes.write, civiczone.reports.draft, civiczone.prompts.override\_limited
  civiczone:planning\_director      Everything planner + director dashboard; ambiguity detector; prompt override approval; public-answer accuracy review                              \+ civiczone.dashboard.read, civiczone.prompts.override\_approve, civiczone.quality.review
  civiczone:city\_attorney          Read-only access to precedents, code amendment history, and the public-answer log                                                                 \+ civiczone.precedent.read, civiczone.amendments.read, civiczone.questions.read
  civiczone:admin                   Module administration; GIS connector configuration; overlay ingestion; prompt library management                                                  civiczone.admin.\*
  --------------------------------- ------------------------------------------------------------------------------------------------------------------------------------------------- ------------------------------------------------------------------------------------------------------------------

**24. Disclaimer enforcement**

The "not a zoning determination" disclaimer is enforced in three places:

-   Prompt contract: every prompt requires the model to emit the
    disclaimer in a known field.

-   Post-processor: the API layer verifies the disclaimer field is
    present on every response and injects it if the model omitted it.

-   Frontend: the disclaimer is rendered in a visually distinct block;
    it cannot be hidden, truncated, or collapsed in the default theme.

**25. Zoning verification letters**

Cities sometimes charge for a formal "zoning verification letter"
stating the zone and allowed uses for a parcel. CivicZone can draft
these, but:

-   A verification letter is not published until a planner reviews and
    approves.

-   The draft carries a large "DRAFT --- NOT OFFICIAL" watermark until
    approval.

-   The approved letter carries the planner's name, date, and
    (optionally) signature image.

-   The action of approving is logged in the audit chain with the citing
    code version.

**26. Audit**

Every state-changing action goes through CivicCore's hash-chained audit
log:

-   Parcel-layer sync runs (who triggered, layer id, rows changed,
    errors).

-   Prompt overrides (who changed what, before/after diff, timestamp).

-   Interpretation note authoring/editing.

-   Letter draft → approval → send.

-   Planner review of flagged answers (marked accurate, incorrect,
    needs-update).

**27. Records retention**

Public-facing Q&A logs are retained per the city's records retention
schedule (configurable; typical default 2 years). Staff-only internal
notes follow a longer retention. Precedent records are retained
indefinitely. CivicCore's retention engine handles the cron; CivicZone
declares the policy in its config.

**Part VII. API & Frontend Surface**

**28. REST API**

  ------------ ---------------------------------------------- ----------------------------------------------- -----------------------
  **Method**   **Path**                                       **Purpose**                                     **Access**
  GET          /api/v1/civiczone/parcels/{id}                 Parcel detail with zone, overlays, freshness    public
  GET          /api/v1/civiczone/parcels/search               Address or parcel-id search                     public
  POST         /api/v1/civiczone/questions                    Submit a question; returns answer + citations   public (rate-limited)
  GET          /api/v1/civiczone/questions/{id}               Retrieve a prior answer (shareable link)        public
  GET          /api/v1/civiczone/zones/{code}                 Zone definition with plain-English summary      public
  GET          /api/v1/civiczone/overlays/{code}              Overlay definition                              public
  POST         /api/v1/civiczone/dimensional-precheck         Structured dimensional pre-check                public
  POST         /api/v1/civiczone/use-lookup                   Structured use-matrix lookup                    public
  GET          /api/v1/civiczone/staff/precedents             Precedent search (parcel, zone, type)           staff
  POST         /api/v1/civiczone/staff/interpretation-notes   Author an interpretation note                   planner
  POST         /api/v1/civiczone/staff/letters/draft          Draft a zoning verification letter              counter\_staff
  POST         /api/v1/civiczone/staff/letters/{id}/approve   Planner approval                                planner
  GET          /api/v1/civiczone/staff/dashboard              Director dashboard                              planning\_director
  GET          /api/v1/civiczone/staff/quality-review         Queue of flagged public answers                 planning\_director
  POST         /api/v1/civiczone/admin/sync-gis               Trigger manual GIS sync                         admin
  GET          /api/v1/civiczone/admin/prompts                List prompts and current overrides              admin
  PUT          /api/v1/civiczone/admin/prompts/{id}           Update a prompt override                        admin
  ------------ ---------------------------------------------- ----------------------------------------------- -----------------------

All endpoints follow CivicCore's standard error envelope, authentication
headers, and audit middleware. OpenAPI spec is emitted automatically
from FastAPI route handlers; the CivicSuite docs site renders it
alongside every other module's spec.

**29. Frontend pages**

  ------------- -------------------------- -------------------------------------------------------------------- ------------
  **Surface**   **Route**                  **Purpose**                                                          **Status**
  Public        /zoning                    Landing: address search, map, popular questions                      PLANNED
  Public        /zoning/parcels/{id}       Parcel detail: zone, overlays, suggested questions, freshness        PLANNED
  Public        /zoning/ask                Free-form question interface; answer with citations and disclaimer   PLANNED
  Public        /zoning/zones/{code}       Zone page: plain-English, use matrix, dimensional summary            PLANNED
  Public        /zoning/variance           Variance & CUP explainer                                             PLANNED
  Staff         /staff/zoning/workbench    Counter staff Q&A + precedent + draft email/letter                   PLANNED
  Staff         /staff/zoning/precedents   Precedent lookup                                                     PLANNED
  Staff         /staff/zoning/notes        Interpretation notes authoring                                       PLANNED
  Staff         /staff/zoning/reports      Staff report outline builder                                         PLANNED
  Staff         /staff/zoning/quality      Flagged-answers review queue                                         PLANNED
  Staff         /staff/zoning/dashboard    Director dashboard: question volume, trends, ambiguity detector      PLANNED
  Admin         /admin/zoning/gis          GIS connector configuration, sync status                             PLANNED
  Admin         /admin/zoning/prompts      Prompt library management                                            PLANNED
  Admin         /admin/zoning/overlays     Overlay layer configuration                                          PLANNED
  ------------- -------------------------- -------------------------------------------------------------------- ------------

All pages inherit the CivicCore admin shell for staff/admin surfaces;
public surfaces inherit the CivicCore resident portal shell. Design
tokens are shared. No CivicZone page ships a bespoke color palette.

**30. States every page must handle**

-   Loading --- skeletons for parcel detail, map, answer streams.

-   Success with data --- the primary happy path.

-   Success with no data --- parcel not found, no overlays apply, no
    precedents exist, no amendments in range.

-   Partial data --- parcel found but overlay sync is stale, or code
    section found but plain-English rewrite missing.

-   Error --- GIS unreachable, LLM unreachable, invalid input. Every
    error message is human-readable and actionable.

-   Rate-limited --- clear explanation and retry guidance, never a
    raw 429.

-   Confidence-too-low --- the answer UI shows "I'm not confident enough
    to answer this; please contact a planner" with a direct link.

-   Determination-requested --- when the user phrasing implies an
    approval ask, a dedicated UI state declines and redirects.

**31. Accessibility**

-   WCAG 2.2 AA across every surface --- public and staff.

-   Keyboard-only navigation verified on every page.

-   Screen-reader labels for map interactions (parcel selection, overlay
    toggles).

-   Color contrast on map overlay fills meets AA against the base map
    tiles.

-   The map is never the only way to do something. Every map interaction
    has a text-input equivalent.

-   Plain-language rewrites are available on every code section
    (CivicAccess integration).

**Part VIII. Connectors**

**32. Integration landscape**

  ----------------------------------------- --------------- ---------------------------------------------------------------------- -------------------------------------
  **Connector**                             **Direction**   **Purpose**                                                            **Priority**
  Esri ArcGIS REST Feature Service          Read            Parcel layer + overlay layers                                          P0 --- required for parcel features
  GeoJSON file drop                         Read            Fallback parcel + overlay source for offline or non-Esri cities        P0 --- required
  CivicCode internal API                    Read            Authoritative ordinance text, amendment history, section resolution    P0 --- required
  CivicClerk internal API                   Read            Variance and CUP hearing minutes for precedent context (staff-only)    P1 --- recommended
  CivicPlan internal API                    Read            Comprehensive plan policy cross-references for staff report outlines   P2 --- optional
  CivicAccess internal API                  Read            Plain-language rewrites of code sections                               P2 --- optional
  County assessor data (CSV / ODBC)         Read            Non-geometry parcel metadata when GIS lacks it (lot size, frontage)    P2 --- optional
  CKAN publication (via CivicData Bridge)   Write           Publish anonymized zoning-question trends for transparency             P3 --- future
  ----------------------------------------- --------------- ---------------------------------------------------------------------- -------------------------------------

**33. Connector contract**

Every CivicZone connector implements CivicCore's four-method connector
protocol: authenticate(), discover(), fetch(), health\_check().
CivicZone does not define its own connector abstraction.

**34. Data ingestion flow**

-   Zoning code text: CivicCode ingests; CivicZone reads from
    CivicCode's search index. No duplicate ingestion.

-   GIS parcels: CivicZone's Esri or GeoJSON connector writes to
    civiczone.parcels. Spatial-intersect job joins against overlay
    layers.

-   Precedents: optional. Reads CivicClerk minutes, extracts
    variance/CUP decisions, requires planner confirmation before
    storing.

-   Comp plan policies: optional. Reads CivicPlan, cached per code
    section cross-reference.

**Part IX. Deployment**

**35. Profiles**

-   Single-workstation: small city. CivicZone runs alongside
    CivicRecords on a Docker Compose stack. GeoJSON parcel file drop
    works fine. Gemma 4 on CPU is slower but usable.

-   Small on-prem server: expected default. CivicZone + CivicCore +
    CivicCode + CivicClerk on a dedicated box. Consumer GPU recommended.
    ArcGIS REST sync scheduled nightly.

-   Segmented / air-gapped: no change required for CivicZone
    specifically; inherits CivicCore's air-gap stance. GIS sync via file
    drop.

**36. Resource expectations**

-   Database: \~10k--50k parcels for a small city adds \<500 MB to
    Postgres.

-   Embeddings index: the zoning code itself is small (\~1--5 MB
    chunked); the parcel layer is the bulk of the storage.

-   Inference: a typical resident question takes 1--3 seconds on a
    consumer GPU, 5--15 seconds on modern CPU. Response is streamed so
    perceived latency is lower.

**37. Scaling**

-   Horizontal scaling of API tier behind a standard reverse proxy.
    Celery workers scale independently for GIS sync jobs.

-   Caching: parcel detail responses cached with last\_synced\_at as the
    cache key. Use-matrix lookups cached per (zone, overlay,
    use\_category).

-   Rate limiting: public Q&A endpoint defaults to 30 queries per IP per
    hour, configurable. Authenticated users get higher limits.

**Part X. Test Matrix**

**38. Coverage expectations**

CivicZone targets the same 36-module baseline discipline CivicRecords AI
established. Every area below has at least one dedicated test module.

  -------------------------- --------------------------------------------------------------------------------------------------------- --------------------------------
  **Test area**              **What gets tested**                                                                                      **Type**
  Parcel lookup              Address → parcel resolution; parcel → zone + overlays correctness; stale data surfacing                   Integration + data-fixture
  Use-matrix lookup          Canonical uses across all zones; conditional status with conditions text; prohibited uses with citation   Unit + integration
  Dimensional pre-check      Setback, height, coverage checks; overlay modifications; ambiguous verdicts flagged                       Unit + integration
  Variance / CUP explainer   Plain-English correctness; standards extraction; process steps                                            Prompt eval + manual review
  Citation contract          Every answer has non-empty citations; citations resolve to valid code sections                            Contract tests
  Disclaimer enforcement     Every response contains the disclaimer; post-processor injects if missing                                 Integration
  Refusal rules              Determination asks refused; out-of-jurisdiction refused; low-confidence escalated                         Prompt eval
  RBAC                       Public, staff, planner, director scopes enforced on every endpoint                                        Integration
  GIS ingestion              Esri REST sync; GeoJSON fallback; overlay intersect correctness                                           Integration with fixtures
  Air-gap behavior           No outbound calls when air-gap mode enabled; GIS fallback works                                           End-to-end with egress monitor
  Accessibility              WCAG 2.2 AA on every page; keyboard-only flows; screen-reader map interactions                            Axe + manual
  Performance                Parcel lookup \< 500ms p95; Q&A streaming first token \< 2s p95; GIS sync \< 5 min for 20k parcels        Benchmark
  Regression vs. CivicCore   CivicCore version bump doesn't break CivicZone                                                            CI matrix build
  -------------------------- --------------------------------------------------------------------------------------------------------- --------------------------------

**39. Prompt evaluation**

Prompt-level accuracy is verified through a dedicated evaluation
harness: a set of \~300 labeled questions (with correct answers, correct
citations, and correct refusal/escalation flags). Before a prompt change
lands, the eval runs end-to-end. A prompt change that regresses accuracy
below threshold is blocked.

**40. Blind-spot audit**

Per the suite's shipping standard, every release explicitly lists what
the automated suite does not cover:

-   Does not validate that the ingested zoning code is actually the
    city's current code --- that is a human responsibility (city clerk
    verifies ingest).

-   Does not validate that the GIS parcel layer reflects ground truth
    --- that is the GIS department's responsibility.

-   Does not test against every zoning code in America --- evaluation
    harness uses a representative sample of small/mid-size city codes.

-   Manual planner review of flagged answers is the real quality signal;
    automated tests approximate it.

**Part XI. Scope Boundaries**

**41. What CivicZone is NOT**

-   Not a permitting system. It does not intake, track, issue, or
    inspect permits. That is CivicPermit Assist.

-   Not a zoning verification letter generator without planner approval.
    Drafts are clearly unofficial.

-   Not a determination engine. No answer approves or denies anything.

-   Not a legal advice service. Every answer carries a disclaimer and
    routes to a planner for any material question.

-   Not a GIS system. It consumes GIS data; it does not produce, edit,
    or serve it.

-   Not a codifier. CivicCode owns the authoritative code text.
    CivicZone reads, structures, and parcel-scopes.

-   Not a variance adjudicator. It explains standards and process. The
    Board of Adjustment decides.

-   Not a cloud service. All inference is local. No outbound calls.

**42. Explicitly deferred**

-   Automated mapping of proposed subdivisions --- large engineering
    surface, not needed for 80% case.

-   3D building envelope visualization --- nice-to-have, not essential.

-   Real-time plan-check API for engineering firms --- explicitly a
    developer product; revisit after v1.

-   Automatic ordinance-drafting suggestions --- belongs in CivicClerk /
    CivicCode, not here.

-   Cross-jurisdiction parcel lookups --- one city's deployment scopes
    to that city.

**Part XII. Repo-Aligned Status**

**43. Status legend**

-   DRAFTED --- the artifact described exists (this document).

-   DESIGNED --- the shape is specified in this document, no
    implementation.

-   SPECIFIED --- the data contract is fixed, no migrations or schemas
    authored.

-   PLANNED --- intent committed, no implementation, no dependencies
    resolved.

-   INHERITED --- provided by CivicCore; not implemented in CivicZone.

**44. Honest assessment**

CivicZone is entirely PLANNED at the code level. This spec is v0.1 of
the design document. Nothing ships until CivicCore v0.1 Phase 1 is
complete (shared models + audit chain live in CivicCore) and CivicCode
v0.1 exposes its section-resolution API. The CivicSuite umbrella repo's
compatibility matrix will reflect this explicitly.

  ---------------------------- -------------------------------------------------------- ----------------------------------------------------------
  **Area**                     **Repo-aligned status**                                  **Notes**
  Spec document                DRAFTED --- this document                                v0.1
  CivicCore dependency         PLANNED (CivicCore v0.1 itself is in extraction phase)   Cannot begin before CivicCore v0.1 Phase 1 ships
  CivicCode dependency         PLANNED (CivicCode v0.1 not yet built)                   Minimal viable: CivicCode ingestion + section resolution
  Data model                   SPECIFIED                                                No migrations written
  Prompt library               DESIGNED --- 7 prompts sketched                          No YAML committed
  REST API                     DESIGNED --- 17 endpoints specified                      No routers implemented
  Frontend pages               DESIGNED --- 14 pages specified                          No components implemented
  GIS connector (Esri)         PLANNED                                                  Fallback GeoJSON connector is also PLANNED
  Test matrix                  DESIGNED --- 13 areas specified                          No tests written
  Evaluation harness           PLANNED                                                  \~300-question labeled set to be curated
  Deployment                   INHERITED from CivicCore                                 No module-specific deploy surface
  Accessibility verification   PLANNED                                                  Will follow CivicAccess integration
  ---------------------------- -------------------------------------------------------- ----------------------------------------------------------

**Appendices**

**A. Example end-to-end resident query**

Illustrative walkthrough of a resident asking a question, from page load
to rendered answer.

-   1\. Resident visits /zoning and types "123 Main Street."

-   2\. Frontend calls GET /parcels/search?q=123+Main+Street. API
    returns one match.

-   3\. Frontend navigates to /zoning/parcels/{id}. API returns zone
    (R-1), overlays (Hillside), last\_synced 2026-04-22, suggested
    questions.

-   4\. Resident clicks "can I build an ADU here?"

-   5\. Frontend calls POST /questions with parcel\_id and question
    text. API invokes parcel\_scoped\_qa.v1 prompt with retrieved
    chunks.

-   6\. Model returns answer + citations. Post-processor validates
    citations and disclaimer. Audit record written.

-   7\. Frontend streams answer, renders citation chips, displays
    disclaimer block, shows "discuss with a planner" link.

-   8\. Resident clicks a citation. A modal opens with the exact
    code-section excerpt and effective date, sourced from CivicCode.

**B. Prompt skeleton (parcel\_scoped\_qa.v1)**

version: 1

effective\_date: 2026-05-01

author: planning-director

review\_date: 2026-11-01

system: \|

You are a zoning information assistant for the City of {city\_name}.

You never make zoning determinations. You explain what the code says.

Every factual claim must cite a specific code section.

If you are unsure, say so and route to a planner.

user\_template: \|

Parcel: {parcel\_address}, Zone: {zone\_code},

Overlays: {overlay\_codes\_list}

Data freshness: {parcel\_last\_synced}

Retrieved code sections:

{retrieved\_chunks}

Resident question: {user\_question}

Answer in plain English. Cite every claim. Include the required
disclaimer.

Flag any overlay interactions that materially affect the answer.

output\_contract:

required\_fields: \[answer\_markdown, citations, confidence,
disclaimer\]

optional\_fields: \[flags, next\_steps\]

refusal\_conditions:

\- no\_chunks\_above\_threshold

\- question\_requests\_approval\_guarantee

\- parcel\_out\_of\_jurisdiction

**C. Compliance notes**

-   ADA Title II public-facing compliance dates (April 24, 2026 for
    cities \>50k; April 26, 2027 for smaller) apply. Every public page meets WCAG 2.2 AA.

-   Fair Housing Act considerations: Townlight Zoning avoids any feature that
    could be used to screen parcels by protected class (e.g., "how many
    of these zones are majority-renter" is out of scope).

-   State-specific zoning-disclosure rules (California Government Code,
    Texas Local Government Code, etc.) are honored by the disclaimer
    contract. The disclaimer text is configurable per jurisdiction.

-   Records retention: Q&A logs follow the city's schedule. Director
    dashboards show aggregate counts only after retention expiry.

**D. Verification log (to be completed when v0.1 ships)**

\#\# Verification Log --- Townlight Zoning v0.1

\#\#\# What Was Changed

First release of Townlight Zoning. PLANNED → SHIPPED.

\#\#\# Data Provenance Check

\[ \] Every displayed zone, overlay, citation traces to Townlight Code
section

\[ \] Every parcel answer traces to civiczone.parcels synced from
declared

GIS source with visible last\_synced\_at

\#\#\# States Verified

\[ \] Loading, success-with-data, no-data, partial-data, error,
rate-limited,

confidence-too-low, determination-requested

\#\#\# Visual Check

\[ \] Desktop and mobile viewport

\[ \] Map interactions have text-input equivalent

\[ \] Disclaimer visually prominent on every answer

\[ \] Citation chips expand to section excerpt

\[ \] Browser console: zero errors, zero unexpected warnings

\#\#\# Copy & Content Check

\[ \] Disclaimer reviewed by city attorney

\[ \] Planner-contact copy reviewed by planning director

\[ \] Refusal messages are clear and not condescending

\#\#\# Security Check

\[ \] No PII in Q&A log

\[ \] RBAC enforced at API layer on every endpoint

\[ \] GIS credentials never logged

\[ \] No outbound calls at runtime (egress monitor green)

\#\#\# Performance Check

\[ \] Parcel lookup \< 500ms p95

\[ \] Q&A first token \< 2s p95 on consumer GPU

\[ \] GIS sync \< 5min for 20k parcels

\#\#\# Regression Check

\[ \] Townlight Core version compatibility matrix updated

\[ \] Townlight Code API compatibility verified

\[ \] Townlight Records unaffected

\#\#\# Test Suite Blind Spots

\[ \] Listed in release notes; manual verification performed for each

\#\#\# Documentation

\[ \] CHANGELOG in civiczone

\[ \] Compatibility matrix updated in civicsuite

\[ \] Module catalog entry updated in civicsuite

\[ \] Breaking changes flagged (none at v0.1)

\#\#\# Sign-off

All four passes complete. No known open issues.
