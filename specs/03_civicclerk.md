**CivicClerk**

**Module Spec v0.1**

*Meetings, agendas, packets, minutes, voting, and public-notice
workflows --- clerk-first, sunshine-law compliant, citation-grounded*

Modeled on the v3.0 CivicRecords AI unified spec • Built on CivicCore

Version 0.1 --- Draft for review --- April 23, 2026

Open source · AGPL-3.0 · Gemma 4 default · Whisper-local
transcription · airgappable

**Document Metadata**

  -------------------------- -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  **Module**                 CivicClerk --- Tier 1 Clerk Core
  **Document status**        v0.1 spec draft. Module itself is PLANNED (no code written). This doc is the buildable spec.
  **Purpose**                Agenda intake, packet assembly, staff report normalization, ordinance and resolution extraction, motion and vote capture, minute drafting, searchable meeting archive, statutory notice compliance, and public meeting portal --- all with citations back to source material.
  **Primary owner**          City Clerk / Council Support / City Manager's Office
  **Depends on**             CivicCore (auth, RBAC, audit, LLM, ingest, search, notifications). Optional: CivicCode (ordinance handoff on adoption), CivicAccess (public-facing accessibility review), CivicRecords (search integration for prior-meeting FOIA responses).
  **Note on dependencies**   The original CivicSuiteAI catalog listed "depends on CivicCore, CivicRecords." That dependency was an artifact of shared document/search infrastructure living inside the CivicRecords AI repo. Once CivicCore v0.1 ships, that shared infra moves to CivicCore and CivicClerk depends only on CivicCore.
  **Default model**          Gemma 4 via Ollama for drafting and extraction. Whisper (local) for meeting transcription. Embeddings via nomic-embed-text.
  **License**                AGPL-3.0-only (code), with the TownLight Public Institution Exception for qualifying deployments. CC BY 4.0 (docs). CC BY-SA 4.0 (prompt library, optional separate repo).
  **Supersedes**             Nothing. First CivicClerk spec. Implements the Tier 1 Clerk Core module defined in CivicSuiteAI\_Module\_Catalog\_v1.
  **Grounded in**            CivicRecordsAI-UnifiedSpec-v3.0 (stylistic and structural template). CivicSuiteAI\_Module\_Catalog\_v1 (module card and tier placement). CivicCore v0.1 Extraction Spec (platform dependency).
  **Completion bar**         Every statutory notice requirement surfaced with deadline enforcement. Every AI-drafted minute sentence cites source. Every closed-session boundary enforced at the API layer. Every public-portal surface meets WCAG 2.2 AA.
  -------------------------- -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

**Table of Contents**

**Part I. Purpose & Strategic Context**

**1. Why CivicClerk**

Meetings are how a city makes decisions. Every ordinance, every budget,
every land-use approval, every appointment, every policy change starts
as an agenda item in some body and ends as a line in minutes that
someone later has to find. A city's meeting workflow is not a
convenience feature --- it is the legal record of how public decisions
were made, and in most U.S. jurisdictions, failing to maintain it
properly can void the decisions themselves.

The incumbents --- Granicus, Legistar, PrimeGov, NovusAGENDA --- are
some of the most expensive and most universally disliked products in
municipal software. They are cloud-hosted, per-seat-priced, and
fundamentally organized around the vendor's convenience rather than the
clerk's. Cities are actively replacing them: PrimeGov → Granicus
OneMeeting migrations are common, and in 2026 Boulder, Colorado replaced
NovusAGENDA in a notable public RFP. The replacement cycle is real, and
the incumbent products are vulnerable on sovereignty, cost, and
usability at the same time.

CivicClerk is the module that replaces them. It is clerk-first, locally
deployed, grounded in citations to source material, and built around the
reality that the clerk's workflow --- not the vendor's feature list ---
is what matters. It inherits the suite's sovereignty stance: no outbound
calls at runtime, no telemetry, all LLM and transcription inference
local.

**2. The scope decision**

CivicClerk does nine things and explicitly refuses to do several others.
It covers:

-   Agenda item intake from every department, with item-type templates.

-   Packet assembly with deadline enforcement.

-   Staff report normalization to the city's standard structure.

-   Meeting notice and posting compliance (sunshine law).

-   Motion, vote, and action-item capture.

-   Minute drafting from packet, transcript, and clerk notes --- with
    sentence-level citations.

-   Ordinance and resolution extraction, diffing, and handoff to
    CivicCode.

-   Meeting archive search across years of packets, minutes, and
    transcripts.

-   Public meeting portal with accessible posting of all required
    materials.

It refuses to be voting software (records votes, does not conduct them),
a livestream platform (integrates with existing livestreams, does not
replace them), or a decision-maker (every AI output is human-approved
before it lands).

**3. Where it fits in the suite**

-   Depends on CivicCore: auth, RBAC, audit chain, LLM abstraction,
    document ingestion, hybrid search, connector framework,
    notifications, admin shell.

-   Optional handoff to CivicCode: when an ordinance or resolution is
    adopted, CivicClerk emits a structured event that CivicCode consumes
    to update the authoritative code. Without CivicCode, CivicClerk
    records the adoption and exports it for any downstream codifier.

-   Optional integration with CivicAccess: public-facing materials
    (agendas, minutes, plain-English summaries) are reviewed for
    accessibility before publishing.

-   Optional integration with CivicRecords AI: meeting materials are
    discoverable through the records search index. A records request for
    "all communications about the 12th Street project" will surface
    relevant meeting packets alongside emails and files.

-   Optional integration with CivicBoards (future): when CivicBoards
    lands, CivicClerk's meeting infrastructure is reused for Planning
    Commission, Board of Adjustment, Historic Preservation, etc.
    CivicBoards adds roster, term, and vacancy management on top.

**4. Tiering and compliance posture**

CivicClerk sits in Tier 1 --- Clerk Core, alongside CivicRecords AI,
CivicCode, and CivicAccess. It is one of the first two or three modules
a city should install. Its compliance posture is the heaviest of any
Clerk Core module: Open Meetings Act / sunshine law violations are the
most common reason a municipal decision is legally challenged, and the
statutes vary significantly by state. CivicClerk treats the
notice-and-posting workflow as a first-class compliance surface, not a
bolt-on.

**Part II. User Experience & Workflows**

**5. Primary personas**

  ------------------------------- ----------------------------------------------------------------------------------------------------------- -------------------------------------
  **Persona**                     **Primary use case**                                                                                        **Access level**
  Department staff (submitter)    Draft and submit agenda items with staff reports, attachments, recommendation.                              Authenticated --- submitter
  Department head / director      Review and approve items from their department before they land on the clerk's desk.                        Authenticated --- department head
  City clerk                      Primary owner. Packet assembly, notice posting, minute drafting, adoption workflow, archive maintenance.    Authenticated --- clerk
  Deputy clerk                    Assist clerk with item intake, packet assembly, minute drafting.                                            Authenticated --- deputy clerk
  City attorney                   Review items for legal form; handle closed-session / executive-session materials; sign off on ordinances.   Authenticated --- legal reviewer
  Mayor / presiding officer       Finalize agenda, view packets, preside over meeting, approve minutes for adoption.                          Authenticated --- presiding officer
  Council member / body member    View packets, propose items, review minutes, view voting record.                                            Authenticated --- member
  Public --- resident             View posted agendas, packets, minutes, transcripts, voting records, submit public comment.                  Public
  Public --- press / researcher   High-volume search across years of meeting archive.                                                         Public (rate-limited)
  Admin                           Meeting body configuration, statutory-rule tuning, prompt library, connector management.                    Authenticated --- admin
  ------------------------------- ----------------------------------------------------------------------------------------------------------- -------------------------------------

**6. The agenda-item lifecycle**

Every agenda item moves through a state machine. CivicClerk enforces the
transitions at the API layer. Nothing short-circuits the workflow.

DRAFTED → SUBMITTED → DEPT\_APPROVED → LEGAL\_REVIEWED → CLERK\_ACCEPTED

→ ON\_AGENDA → IN\_PACKET → POSTED → HEARD → DISPOSED → ARCHIVED

-   DRAFTED: department staff is working on the item. Not visible to the
    clerk.

-   SUBMITTED: submitted to department head for approval.

-   DEPT\_APPROVED: department head has approved; item visible to the
    clerk.

-   LEGAL\_REVIEWED: city attorney has signed off where required
    (ordinances, contracts over threshold, settlements).

-   CLERK\_ACCEPTED: clerk has accepted the item for a specific meeting
    date.

-   ON\_AGENDA: item is on the draft agenda for the target meeting.

-   IN\_PACKET: packet assembly has built the item into the consolidated
    packet.

-   POSTED: notice has been published and legal deadlines satisfied.

-   HEARD: the item was called at the meeting.

-   DISPOSED: the body acted on the item --- adopted, denied, continued,
    withdrawn, tabled.

-   ARCHIVED: the item and its disposition are in the searchable
    archive.

**7. Meeting lifecycle**

SCHEDULED → NOTICED → PACKET\_POSTED → IN\_PROGRESS → RECESSED →

ADJOURNED → TRANSCRIPT\_READY → MINUTES\_DRAFTED → MINUTES\_POSTED →

MINUTES\_ADOPTED → MINUTES\_SIGNED → ARCHIVED

-   Cancellation path: SCHEDULED → CANCELLED (with reason and re-notice
    requirements per state law).

-   Emergency meeting path: SCHEDULED → EMERGENCY\_NOTICED (compressed
    notice window; statutory basis required and recorded).

-   Executive / closed session path: any meeting may include one or more
    closed-session blocks. Those blocks have their own notice and
    minutes workflow (see §23).

**8. Clerk-facing workflows**

**8.1 Packet assembly**

-   Clerk opens the packet builder for an upcoming meeting and sees
    every item in CLERK\_ACCEPTED or later status.

-   Items are ordered by agenda section (call to order, consent, public
    hearings, action items, discussion, reports, adjournment) with
    drag-reorder within sections.

-   Each item shows its attachments, staff report, recommendation, and
    fiscal impact at a glance.

-   The clerk clicks "assemble packet" and CivicClerk generates a single
    PDF (with tagged headings for accessibility), a public HTML version,
    and a per-item JSON feed.

-   Packet assembly re-runs idempotently until posting; every re-run
    preserves the prior version in the audit log.

**8.2 Notice and posting**

-   The notice builder knows the jurisdiction's statutory rules:
    required posting locations (city hall bulletin board, city website,
    local paper of record, etc.), minimum lead time, and required
    content.

-   For each posting location, the notice workflow tracks the timestamp,
    the method (physical post, URL, email, paper), and the confirmation
    (photo, URL, affidavit).

-   Deadline countdown is displayed prominently. Missing a notice
    deadline is flagged before it happens, not after.

-   Emergency and special-meeting notices follow a separate workflow
    with statutory-basis capture.

**8.3 Minute drafting**

-   Post-meeting, the clerk opens the minute drafter for the completed
    meeting.

-   CivicClerk composes a first draft from: the packet (authoritative
    agenda), the transcript (from Whisper or uploaded), the clerk's
    notes, and the motion/vote capture.

-   Every sentence in the draft has a citation: transcript segment,
    packet item, or clerk note. The clerk can click any sentence to see
    its source.

-   The clerk edits inline. The edit diff is preserved. Nothing is lost
    silently.

-   When complete, the draft moves to MINUTES\_DRAFTED, is posted for
    public review, and is scheduled for adoption at the next meeting of
    the same body.

**8.4 Minute adoption and signing**

-   At the adoption meeting, the minutes are an agenda item. The body
    adopts them (with or without amendments).

-   CivicClerk records the adoption reference (meeting date, motion id)
    and moves the minutes to MINUTES\_ADOPTED.

-   The clerk adds their signature (image or digital) and the minutes
    move to MINUTES\_SIGNED.

-   Signed minutes are exported to the city's records retention system
    and become part of the permanent legal record.

**9. Staff-facing workflows**

**9.1 Agenda item submission**

-   Staff chooses an item type (ordinance, resolution, contract,
    presentation, discussion, consent, appointment, report).

-   The form presents the template for that type: required fields, staff
    report sections, attachment categories, legal-review flag.

-   CivicClerk's staff-report normalizer reviews the draft and suggests
    missing sections, fiscal-impact omissions, or
    recommendation-phrasing issues. Nothing is auto-changed; the staff
    accepts or rejects each suggestion.

-   On submit, the item routes to the department head automatically.

**9.2 Department head review**

-   Queue of items from the department awaiting approval.

-   Compare against prior submissions; see history of staff revisions.

-   Approve, return with comments, or reject.

**9.3 Legal review**

-   City attorney's queue of items flagged for legal review (ordinances
    always; contracts above threshold; settlements; personnel items).

-   Redline suggestions against city's standard ordinance structure.

-   Sign-off workflow with audit record.

**10. Member-facing workflows**

-   Member dashboard: upcoming meetings, packet availability,
    outstanding action items assigned to the member, voting history.

-   Packet reader optimized for tablets and laptops --- not a PDF, a
    structured view with item navigation and linked attachments.

-   Propose-an-item flow (subject to the city's rules for
    member-initiated items).

-   Meeting-day mode: agenda at glance, one-tap motion/second/vote
    capture if the city uses the in-chamber voting capture.

**11. Public-facing workflows**

**11.1 Meeting list and detail**

-   Calendar of upcoming meetings across every body.

-   Meeting detail page: agenda, packet, notices-posted log, livestream
    link, how to comment.

-   Post-meeting: minutes (draft → adopted → signed), transcript,
    video/audio link, voting record, action items.

**11.2 Public comment**

-   Residents submit written comment attached to a specific agenda item
    (text or document upload).

-   Residents sign up for in-person comment at the meeting (if the
    city's rules require advance sign-up).

-   Residents submit remote comment (text read into record or
    remote-video participation, depending on city rules).

-   All comments are public record unless the city's rules redact
    categorically (rare).

**11.3 Plain-English agenda summaries**

-   For each public meeting, CivicClerk generates a plain-English
    summary of the agenda (draft; clerk approves before publishing).

-   Each summary item links to the full packet item and to the relevant
    code sections (via CivicCode integration).

-   Summaries are reviewed by CivicAccess for readability where that
    integration is enabled.

**11.4 Archive search**

-   Full-text + semantic search across years of packets, minutes,
    transcripts, and ordinances.

-   Filter by body, date range, item type, member, outcome.

-   Every result carries a deep link to the specific agenda item, minute
    paragraph, or transcript segment.

**Part III. Data Model**

**12. Entity overview**

CivicClerk introduces fifteen module-specific tables in the civicclerk
schema. Every table sits alongside CivicCore's shared tables. Shared
references (users, departments, documents, audit\_log) point to
civiccore.\*.

  ---------------------- --------------------------------------------------------------- ---------------------------------------------------------------------------------------------------------------------------------------------------- ---------------
  **Entity**             **Purpose**                                                     **Key fields**                                                                                                                                       **Ownership**
  meeting\_bodies        Bodies that hold meetings: Council, Planning Commission, etc.   code, name, type (legislative/advisory), statutory\_basis, meeting\_cadence, default\_notice\_days, quorum\_rule                                     CivicClerk
  members                Current and historical members of bodies                        id, name, body\_code, role, term\_start, term\_end, email, photo                                                                                     CivicClerk
  meetings               Individual meeting instances                                    id, body\_code, meeting\_type (regular/special/emergency/work\_session), scheduled\_at, location, status, livestream\_url, recording\_url            CivicClerk
  agenda\_items          Individual items on a meeting agenda                            id, meeting\_id, section, order, item\_type, title, submitter\_id, department\_id, status, disposition, attachments\[\], staff\_report\_id           CivicClerk
  staff\_reports         Structured staff analysis                                       id, item\_id, recommendation, background, analysis, fiscal\_impact, alternatives, prior\_actions                                                     CivicClerk
  motions                Motions made during a meeting                                   id, meeting\_id, item\_id, text, moved\_by, seconded\_by, result (passed/failed/withdrawn/tabled), timestamp                                         CivicClerk
  votes                  Individual member votes on a motion                             id, motion\_id, member\_id, vote (aye/nay/abstain/absent/recused)                                                                                    CivicClerk
  public\_comments       Public comment on agenda items                                  id, item\_id, meeting\_id, commenter\_name, mode (in\_person/written/remote), text, position (for/against/neutral), redactions\[\]                   CivicClerk
  notices                Statutory notices for meetings                                  id, meeting\_id, notice\_type, published\_at, method, location, confirmation\_ref, statutory\_basis, compliance\_status                              CivicClerk
  minutes                Minutes for a meeting                                           id, meeting\_id, status (drafting/review/adopted/signed), content\_html, sentence\_citations\[\], adopted\_at\_meeting\_id, signed\_by, signed\_at   CivicClerk
  transcripts            Meeting transcripts                                             id, meeting\_id, source (whisper/manual/uploaded), segments\[\], language, confidence, duration\_seconds                                             CivicClerk
  action\_items          Follow-up assignments from a meeting                            id, meeting\_id, item\_id, description, owner, due\_date, status, closed\_at                                                                         CivicClerk
  ordinances\_adopted    Adopted ordinances awaiting handoff to CivicCode                id, item\_id, motion\_id, title, text, effective\_date, codification\_section\_hint, handoff\_status                                                 CivicClerk
  resolutions\_adopted   Adopted resolutions                                             id, item\_id, motion\_id, title, text, effective\_date, handoff\_status                                                                              CivicClerk
  closed\_sessions       Executive / closed session blocks with statutory basis          id, meeting\_id, statutory\_basis, topics\[\], attendees\[\], notes\_ref (staff-only), entered\_at, exited\_at, reconvene\_statement                 CivicClerk
  ---------------------- --------------------------------------------------------------- ---------------------------------------------------------------------------------------------------------------------------------------------------- ---------------

**13. Versioning**

-   agenda\_items, staff\_reports, and minutes carry an append-only
    revision history. Edits create a new version; prior versions remain.

-   meetings snapshots the applicable statutory rules at the time of
    scheduling, not at the time of review. A rule change after
    scheduling does not retroactively void a notice.

-   motions and votes are immutable once captured at the meeting.
    Corrections happen through a documented correction workflow that
    produces a new record referencing the original.

-   minutes status transitions are audit-logged. Adoption is a
    referenceable event in the audit chain.

**14. Relationships**

-   meetings.body\_code → meeting\_bodies.code (many-to-one).

-   agenda\_items.meeting\_id → meetings.id (many-to-one).

-   motions.meeting\_id + motions.item\_id → agenda\_items (item
    nullable for motions not tied to a specific item, e.g.,
    adjournment).

-   votes.motion\_id → motions.id, votes.member\_id → members.id.

-   public\_comments.item\_id + public\_comments.meeting\_id →
    agenda\_items (item\_id nullable for general comment).

-   minutes.adopted\_at\_meeting\_id → meetings.id (self-reference:
    minutes of meeting A adopted at meeting B).

-   ordinances\_adopted.motion\_id + .item\_id → motions +
    agenda\_items. ordinances\_adopted.handoff\_status tracks export to
    CivicCode.

-   closed\_sessions.meeting\_id → meetings.id.
    closed\_sessions.notes\_ref points to a staff-only document in
    civiccore.documents with restricted ACL.

**15. Schema placement**

civicclerk.meeting\_bodies

civicclerk.members

civicclerk.meetings

civicclerk.agenda\_items

civicclerk.staff\_reports

civicclerk.motions

civicclerk.votes

civicclerk.public\_comments

civicclerk.notices

civicclerk.minutes

civicclerk.transcripts

civicclerk.action\_items

civicclerk.ordinances\_adopted

civicclerk.resolutions\_adopted

civicclerk.closed\_sessions

\-- Inherited from CivicCore (civiccore schema)

civiccore.users, .roles, .audit\_log, .documents,

civiccore.document\_chunks, .model\_registry, .connectors,

civiccore.notification\_templates, .city\_profile, .departments

**Part IV. AI Workflows & Prompt Design**

**16. Core principles**

-   Every AI-drafted minute sentence carries a source citation ---
    transcript segment, packet item, or clerk note. The frontend renders
    each sentence as clickable-to-source.

-   No AI output auto-changes any state-bearing field. Staff-report
    suggestions are suggestions. Motion/vote extractions are drafts the
    clerk confirms.

-   Closed-session content stays closed. A prompt handling
    closed-session input is dispatched to an isolated worker with access
    controls; its output is marked staff-only at the database level.

-   Public comment summarization preserves anonymity unless the
    commenter explicitly consented to attribution.

-   Notice-compliance checks are advisory. The clerk is responsible for
    compliance; the model helps by surfacing issues early.

-   Every prompt ships in the module's YAML library, versioned,
    auditable, and overridable per city via the admin panel. Prompts
    affecting public-facing output require clerk + attorney approval
    before landing.

**17. Prompt library**

  ------------------------------------------------ ---------------------------------------------------------------------------------------------------------------------------------- ---------------------------------------------------------------------------------------- ----------------------------------------------------------------------------------------------------------------------------
  **Prompt**                                       **Purpose**                                                                                                                        **Inputs**                                                                               **Outputs**
  staff\_report\_normalize.v1                      Check a staff report against the city's required structure; suggest (never auto-apply) missing sections                            report\_draft, city\_template, item\_type                                                suggestions\[\], missing\_sections\[\], phrasing\_flags\[\]
  agenda\_plain\_english.v1                        Generate a plain-English summary of an agenda item for public posting                                                              item\_title, staff\_report, target\_reading\_level                                       summary\_text, key\_terms\[\], review\_required (bool)
  minutes\_draft.v1                                Draft meeting minutes with sentence-level citations                                                                                packet (agenda + staff reports), transcript segments, clerk notes, motion/vote records   minutes\_html, sentence\_citations\[\] (each sentence → source ref), flags\[\] (ambiguous speakers, unclear motions)
  motion\_vote\_extract.v1                         Extract motions, seconds, votes, and results from transcript or clerk notes                                                        transcript segments, meeting context, member roster                                      motions\[\] (with moved\_by, seconded\_by, text), vote\_tallies\[\] (per motion, per member), confidence, review\_required
  action\_item\_extract.v1                         Identify action items assigned during a meeting                                                                                    transcript, minutes draft, packet                                                        action\_items\[\] (description, owner\_hint, due\_date\_hint, confidence)
  ordinance\_diff.v1                               Produce a redline between two ordinance versions                                                                                   old\_text, new\_text, structural\_context                                                redline\_html, additions\[\], deletions\[\], moves\[\], summary
  public\_comment\_summarize.v1                    Summarize the volume and thematic distribution of public comment on an item (never reveals individual positions without consent)   comments\[\], item context                                                               summary\_text, theme\_counts, sentiment\_balance (for/against/neutral counts only)
  notice\_compliance\_check.v1                     Check a planned notice against the jurisdiction's statutory requirements                                                           notice\_draft, meeting\_type, jurisdiction\_rules                                        compliance\_flag, missing\_requirements\[\], deadline\_analysis, required\_venues\[\]
  executive\_session\_classifier.v1 (staff-only)   Classify a proposed closed-session topic against statutory bases for closure; flag out-of-scope requests                           topic\_description, jurisdiction\_rules, prior\_precedents                               classification, cited\_statute, confidence, requires\_attorney\_review
  ------------------------------------------------ ---------------------------------------------------------------------------------------------------------------------------------- ---------------------------------------------------------------------------------------- ----------------------------------------------------------------------------------------------------------------------------

**18. Citation contract (minutes)**

Every minute sentence emitted by the model is a structured object
referencing one or more sources. The API refuses to persist a minute
draft where any sentence has an empty source set.

{

\"sentence\": \"Councilmember Nguyen moved to approve the consent\"

\+ \" calendar; seconded by Councilmember Ortiz.\",

\"sources\": \[

{\"type\": \"transcript\", \"segment\_id\": \"mtg123-seg0417\",

\"timestamp\": \"00:14:22\", \"confidence\": 0.93},

{\"type\": \"clerk\_note\", \"note\_id\": \"cn-0024\"}

\],

\"confidence\": 0.91,

\"flags\": \[\]

}

**19. Whisper-local transcription**

-   Transcription runs on-device via Whisper (large-v3 default;
    configurable per city hardware).

-   Transcripts are chunked into timestamped segments. Speaker
    diarization is attempted when multiple microphones are present;
    otherwise segments are attributed by the clerk during minute
    drafting.

-   Language: default English; configurable for cities with
    multi-language meetings. The transcription profile records the model
    version in the audit log.

-   No transcript segment is published publicly until the clerk has
    reviewed the meeting's closed-session blocks (if any) and confirmed
    they are excluded.

-   Performance target: transcription completes within 1x real-time on a
    modern consumer GPU. A 3-hour meeting is transcribed in under 3
    hours.

**20. Refusal and escalation rules**

-   If transcript confidence for a sentence's source falls below
    threshold, the sentence is flagged for clerk review.

-   If the motion/vote extractor cannot confidently identify the mover
    or seconder, the motion is flagged; the clerk confirms from the
    transcript.

-   If a staff-report normalizer suggestion would change the
    recommendation itself, it is surfaced as advisory only --- never
    applied.

-   Closed-session prompts refuse to respond to any input lacking the
    appropriate staff-only scope. The refusal is audit-logged.

-   The notice-compliance prompt never says "this is compliant" with
    certainty; it says "no issues detected against the rules I know
    about" and surfaces the rules it checked.

**Part V. Open Meetings / Sunshine Law Compliance**

**21. The statutory landscape**

Every U.S. state has an open-meetings statute. Florida's §286.011
("Sunshine Law"), California's Ralph M. Brown Act, Texas's Chapter 551,
New York's Open Meetings Law, Colorado's §24-6-401 et seq. --- each has
its own rules for notice lead times, posting venues, allowable
closed-session topics, public comment procedures, and recordkeeping. The
rules are not uniform, and they evolve (e.g., post-COVID remote-meeting
amendments in most states).

CivicClerk treats these rules as data, not as code. The
civiccore.city\_profile captures the jurisdiction's rule set during
onboarding; the rule set drives notice workflows, closed-session
classification, public comment handling, and retention. A state-rules
update ships as a data release, not a CivicClerk code release.

**22. Notice workflow**

-   Every meeting creates one or more notice records. Regular meetings:
    typically 24--72 hours ahead, posted at city hall + website + paper
    of record (varies).

-   Special meetings: shorter window, specific-topics restriction in
    some states.

-   Emergency meetings: compressed window with statutory-basis capture
    required.

-   Posting record: for each required venue, the timestamp, method, and
    confirmation evidence (photo, URL, affidavit) are stored.

-   Deadline countdown is visible to the clerk throughout the week
    before a meeting. Missing a deadline is surfaced proactively, not
    after the fact.

-   Notice rescissions and amendments are tracked --- an amended agenda
    item requires an amended notice in most states.

**23. Closed-session handling**

-   A meeting may include one or more closed-session blocks. Each block
    is a closed\_sessions row with: the statutory basis for closure, the
    topics to be discussed, the attendees, entered\_at / exited\_at
    timestamps, and a reconvene statement read into the public record.

-   Closed-session notes are staff-only. The ACL on civiccore.documents
    enforces this at the database level.

-   CivicClerk's executive\_session\_classifier prompt evaluates each
    proposed closure against the jurisdiction's statutory bases and
    flags requests that appear out of scope for attorney review.

-   Closed-session transcripts are not generated by default. A city may
    opt in, in which case the transcript is marked staff-only and
    encrypted at rest with a key the clerk or attorney controls.

-   The public record of a closed session contains the statutory basis,
    general topics, duration, and the reconvene statement --- nothing
    more, unless state law requires additional disclosure.

**24. Public comment handling**

-   The city's public comment rules (duration per speaker, advance
    sign-up, topic restrictions to agenda items vs. general comment) are
    captured in the meeting-body configuration.

-   Written comments submitted ahead of a meeting are attached to the
    relevant agenda item, read into the record per city rules, and
    preserved in the archive.

-   Remote comments (if the city permits them) are captured the same way
    as in-person comments from a data perspective.

-   Comment redactions: the clerk can redact only what state law permits
    (obscenity, threats, certain personally identifying info). Every
    redaction is audit-logged with statutory basis.

**25. Records retention**

-   Agendas, packets, minutes, and recordings follow state and local
    retention schedules. Most states require indefinite retention of
    adopted minutes.

-   Adopted and signed minutes are exported to the city's permanent
    records system on a schedule.

-   Draft minutes, transcripts, and clerk notes follow shorter retention
    windows unless the city's schedule differs.

-   Closed-session notes and transcripts follow the longest retention
    required by statute for that session's basis.

**Part VI. RBAC & Access Controls**

**26. Role model**

CivicClerk defines nine roles on top of CivicCore's RBAC primitives.
Every role is a collection of scope strings; scope strings are
module-prefixed so they compose with records, code, zone, and future
modules.

  ------------------------------- ---------------------------------------------------------------------------------------------------------------------------------- ---------------------------------------------------------------------------------
  **Role**                        **Capabilities**                                                                                                                   **Scope strings**
  civicclerk:public               View posted agendas, packets, minutes, transcripts, voting records; submit public comment                                          civicclerk.meeting.read\_public, civicclerk.comment.submit
  civicclerk:submitter            Draft and submit agenda items with staff reports and attachments                                                                   civicclerk.item.draft, civicclerk.item.submit
  civicclerk:department\_head     Everything submitter + approve items from their department                                                                         \+ civicclerk.item.approve\_dept
  civicclerk:legal\_reviewer      Everything department\_head + legal review queue; redline suggestions; executive-session classifier; closed-session notes access   \+ civicclerk.item.legal\_review, civicclerk.closed\_session.access
  civicclerk:deputy\_clerk        Packet assembly, notice posting (with confirmation), minute drafting, archive maintenance (limited)                                \+ civicclerk.packet.build, civicclerk.notice.post, civicclerk.minutes.draft
  civicclerk:clerk                Everything deputy\_clerk + final packet approval; minute signing; adoption tracking; archive administration                        \+ civicclerk.packet.approve, civicclerk.minutes.sign, civicclerk.archive.admin
  civicclerk:presiding\_officer   Finalize agenda, view all packets, preside workflow, approve minutes for adoption                                                  \+ civicclerk.agenda.finalize, civicclerk.minutes.approve\_for\_adoption
  civicclerk:member               View packets (including restricted items per body rules), propose items, view voting history                                       \+ civicclerk.packet.read\_member, civicclerk.item.propose
  civicclerk:admin                Meeting body configuration, statutory-rule tuning, prompt library, connector management, retention-schedule administration         civicclerk.admin.\*
  ------------------------------- ---------------------------------------------------------------------------------------------------------------------------------- ---------------------------------------------------------------------------------

**27. Packet visibility enforcement**

Packet visibility is more nuanced than simple public/staff. CivicClerk
enforces five levels:

-   Public-published: visible to anyone, on the public portal, after
    posting.

-   Public-pending: visible to anyone, but not yet posted (e.g., draft
    agenda for a meeting whose notice window hasn't opened).

-   Member-only: attachments that contain deliberative material ---
    visible to body members and staff, not public until and unless
    adopted.

-   Staff-only: closed-session notes, confidential personnel items,
    attorney-client privileged material --- restricted by ACL, never
    auto-published.

-   Attorney-only: a subset of staff-only where only the city attorney
    and their delegates have access.

**28. Audit**

-   Every state transition on items, meetings, motions, minutes, and
    notices lands in civiccore.audit\_log.

-   Notice postings record who posted, when, where, and with what
    confirmation.

-   Packet assembly runs and re-runs are logged with version hashes.

-   Minute edits are recorded as a diff against the prior version.

-   Closed-session access is logged with user, timestamp, and
    reason-of-access string.

-   Prompt overrides are logged with before/after diff.

**Part VII. API & Frontend Surface**

**29. REST API**

  ------------ ------------------------------------------------------ ------------------------------------------- ------------------------------------
  **Method**   **Path**                                               **Purpose**                                 **Access**
  GET          /api/v1/civicclerk/meetings                            List meetings with filters                  public (filtered)
  GET          /api/v1/civicclerk/meetings/{id}                       Meeting detail                              public (filtered by status)
  GET          /api/v1/civicclerk/meetings/{id}/packet                Public packet for a meeting                 public after POSTED
  GET          /api/v1/civicclerk/meetings/{id}/minutes               Minutes (draft / adopted / signed)          public (filtered by status)
  GET          /api/v1/civicclerk/meetings/{id}/transcript            Public transcript                           public after transcript review
  POST         /api/v1/civicclerk/items                               Create an agenda item                       submitter
  PATCH        /api/v1/civicclerk/items/{id}                          Update a draft item                         submitter (own), dept\_head, clerk
  POST         /api/v1/civicclerk/items/{id}/submit                   Submit to department head                   submitter
  POST         /api/v1/civicclerk/items/{id}/approve                  Department head approval                    department\_head
  POST         /api/v1/civicclerk/items/{id}/legal-review             Legal review action                         legal\_reviewer
  POST         /api/v1/civicclerk/items/{id}/accept                   Clerk acceptance to a meeting               clerk
  POST         /api/v1/civicclerk/meetings/{id}/packet/assemble       Assemble packet                             clerk, deputy\_clerk
  POST         /api/v1/civicclerk/meetings/{id}/notices               Record a notice posting                     clerk, deputy\_clerk
  POST         /api/v1/civicclerk/meetings/{id}/motions               Record a motion (during or after meeting)   clerk, deputy\_clerk
  POST         /api/v1/civicclerk/motions/{id}/votes                  Record votes for a motion                   clerk, deputy\_clerk
  POST         /api/v1/civicclerk/meetings/{id}/transcript/generate   Run Whisper transcription                   clerk, deputy\_clerk
  POST         /api/v1/civicclerk/meetings/{id}/minutes/draft         Generate a minute draft                     clerk, deputy\_clerk
  PATCH        /api/v1/civicclerk/meetings/{id}/minutes               Edit minute draft                           clerk, deputy\_clerk
  POST         /api/v1/civicclerk/meetings/{id}/minutes/adopt         Mark minutes adopted at a meeting           clerk
  POST         /api/v1/civicclerk/meetings/{id}/minutes/sign          Sign adopted minutes                        clerk
  POST         /api/v1/civicclerk/public-comments                     Submit a public comment                     public
  POST         /api/v1/civicclerk/closed-sessions                     Create a closed-session block               clerk, legal\_reviewer
  GET          /api/v1/civicclerk/staff/archive/search                Archive search                              staff
  GET          /api/v1/civicclerk/admin/bodies                        Meeting body configuration                  admin
  PUT          /api/v1/civicclerk/admin/statutory-rules               Update jurisdiction rule set                admin
  ------------ ------------------------------------------------------ ------------------------------------------- ------------------------------------

All endpoints follow CivicCore's standard error envelope, authentication
headers, and audit middleware. OpenAPI spec is emitted automatically
from FastAPI route handlers.

**30. Frontend pages**

  ------------- ----------------------------- ---------------------------------------------------------- ------------
  **Surface**   **Route**                     **Purpose**                                                **Status**
  Public        /meetings                     Meeting calendar across all bodies                         PLANNED
  Public        /meetings/{id}                Meeting detail: agenda, packet, livestream, comment form   PLANNED
  Public        /meetings/{id}/minutes        Minutes (state-appropriate visibility)                     PLANNED
  Public        /meetings/{id}/transcript     Searchable transcript with segment deep-links              PLANNED
  Public        /meetings/archive             Archive search with filters                                PLANNED
  Public        /meetings/{id}/comment        Public comment submission form                             PLANNED
  Member        /member/packets               Member packet reader                                       PLANNED
  Member        /member/proposals             Propose-an-item flow                                       PLANNED
  Member        /member/history               Voting and attendance history                              PLANNED
  Staff         /staff/items/new              Agenda item submission form                                PLANNED
  Staff         /staff/items                  My-department item queue                                   PLANNED
  Staff         /staff/legal/queue            Legal review queue                                         PLANNED
  Staff         /staff/clerk/packet-builder   Packet assembly workspace                                  PLANNED
  Staff         /staff/clerk/notices          Notice posting workspace with deadline countdown           PLANNED
  Staff         /staff/clerk/minutes/{id}     Minute drafter with citation sidebar                       PLANNED
  Staff         /staff/clerk/adoption         Minute adoption queue                                      PLANNED
  Staff         /staff/clerk/archive          Staff archive (includes member-only and staff-only)        PLANNED
  Admin         /admin/clerk/bodies           Meeting body configuration                                 PLANNED
  Admin         /admin/clerk/rules            Statutory-rule editor                                      PLANNED
  Admin         /admin/clerk/prompts          Prompt library management                                  PLANNED
  ------------- ----------------------------- ---------------------------------------------------------- ------------

Public surfaces inherit the CivicCore resident portal shell. Staff
surfaces inherit the CivicCore admin shell. Design tokens are shared.
Member surfaces use a tablet-optimized layout for meeting-day use.

**31. States every page must handle**

-   Loading --- skeletons for meeting lists, packet rendering,
    transcript loading.

-   Success with data --- the primary happy path.

-   Success with no data --- no upcoming meetings, no prior meetings
    matching filter, no comments received yet, no adopted minutes yet.

-   Partial data --- meeting scheduled but packet not yet posted;
    minutes drafted but not yet adopted; transcript processed but one
    segment low-confidence.

-   Error --- transcription failed, notice posting confirmation upload
    failed, LLM unreachable. Every error message is actionable.

-   Deadline-near --- visual prominence when a notice deadline is within
    the warning threshold; accessible announcement.

-   Deadline-missed --- the system does not hide this. The clerk sees
    it, the admin sees it, and a notification is sent. Missing a
    deadline is a compliance event, not an error to be swallowed.

**32. Accessibility**

-   WCAG 2.2 AA across every public surface. CivicAccess reviews copy
    before publishing.

-   Tagged-heading PDF output for assembled packets (not just an
    image-rendered PDF).

-   Transcript player with keyboard shortcuts, speed control, and
    synchronized text highlighting.

-   Screen-reader support for live-meeting dashboards used by presiding
    officers and clerks.

-   Plain-English agenda summaries are reviewed for reading level.

**Part VIII. Connectors**

**33. Integration landscape**

  -------------------------------------------------------------------------------------- ----------------- ---------------------------------------------------------------------------------- ------------------------------------------------
  **Connector**                                                                          **Direction**     **Purpose**                                                                        **Priority**
  Local SMTP                                                                             Write             Meeting notifications, agenda-posted emails, adoption notifications                P0 --- inherited from CivicCore
  Local SMB / shared drive                                                               Read/Write        Department staff report drafting, attachment ingestion, permanent minute archive   P0 --- required
  Granicus / Legistar / PrimeGov / NovusAGENDA export                                    Read (one-time)   Historical packet and minute migration during install                              P0 --- required for cities replacing incumbent
  Whisper (local)                                                                        Local process     Meeting transcription on-device                                                    P0 --- required for transcription feature
  Livestream platforms (YouTube Live, Facebook Live, custom)                             Link-only         Embed livestream URL on meeting detail; no replacement                             P1 --- recommended
  Captioning / caption file ingest                                                       Read              Import pre-existing caption files alongside transcripts                            P1 --- recommended
  City website CMS                                                                       Write             Post meeting notices and packets to the city's primary site                        P1 --- per-city
  CivicCode handoff API                                                                  Write             Emit adopted ordinance/resolution events for CivicCode to consume                  P1 --- once CivicCode ships
  CivicRecords AI search integration                                                     Read              Include meeting archive in records-request search index                            P2 --- optional
  Codification system direct (Municode, American Legal, Code Publishing, General Code)   Write             Direct codification feed if city does not use CivicCode                            P2 --- optional
  CKAN (via CivicData Bridge)                                                            Write             Publish anonymized meeting metadata for transparency                               P3 --- future
  -------------------------------------------------------------------------------------- ----------------- ---------------------------------------------------------------------------------- ------------------------------------------------

**34. Migration from incumbent platforms**

Cities migrating to CivicClerk typically arrive with years of historical
meeting data in Granicus, Legistar, PrimeGov, or NovusAGENDA. The
migration connector handles:

-   Historical meeting metadata (dates, bodies, agenda items) from
    export formats.

-   Historical packet PDFs --- ingested into civiccore.documents with
    meeting association.

-   Historical minutes --- ingested and flagged as migrated (not
    AI-drafted; not subject to re-citation).

-   Historical video/audio --- linked by URL; transcription is optional
    and runs on a background queue.

-   Roster history --- member terms, votes, attendance where exportable.

Migration preserves original source references so a city always knows
which records came from where.

**35. Connector contract**

Every CivicClerk connector implements CivicCore's four-method connector
protocol: authenticate(), discover(), fetch(), health\_check().
CivicClerk does not define its own connector abstraction.

**Part IX. Deployment**

**36. Profiles**

-   Single-workstation: small city, one clerk, one to three bodies.
    CivicClerk + CivicCore on a Docker Compose stack. Whisper on CPU is
    slower but usable (overnight transcription for a 3-hour meeting is
    realistic).

-   Small on-prem server: expected default. CivicClerk + CivicCore +
    CivicCode + CivicRecords AI on a dedicated box with consumer GPU.
    Whisper transcription completes in roughly real-time.

-   Segmented / air-gapped: supported. All features work; migration
    connectors run on a staging host with controlled egress, results
    transferred into the air-gap environment.

**37. Resource expectations**

-   Database: a mid-size city with 10 bodies and 5 years of history adds
    roughly 5--15 GB to Postgres (including document\_chunks).

-   Embeddings index: packets and minutes are substantial; expect
    20--100 GB of vector storage for a well-used archive.

-   Transcription storage: raw audio is not stored by default (a link to
    the livestream is retained); transcript text is modest.

-   Inference: a minute-draft pass on a 3-hour meeting takes 10--30
    minutes on a consumer GPU, 1--3 hours on modern CPU.

**38. Scaling**

-   API tier scales horizontally behind a reverse proxy.

-   Transcription is the largest single workload; a dedicated Celery
    worker with GPU affinity is recommended.

-   Packet assembly, minute drafting, and archive search run on standard
    workers.

-   Rate limiting: public comment submission is rate-limited per IP and
    per email; archive search is rate-limited per authenticated session.

**Part X. Test Matrix**

**39. Coverage expectations**

CivicClerk targets the same 36-module baseline discipline CivicRecords
AI established. Every area below has at least one dedicated test module.

  ------------------------------- ------------------------------------------------------------------------------------------ ---------------------------------
  **Test area**                   **What gets tested**                                                                       **Type**
  Agenda lifecycle                Every state transition enforced; invalid transitions rejected; audit log accurate          Integration
  Meeting lifecycle               Scheduling, notice, posting, progression, adjournment, minute adoption, signing            Integration
  Packet assembly                 Correct ordering, attachments, version snapshots, idempotency                              Unit + integration
  Notice compliance               Deadline calculation, venue requirements, emergency-meeting rules, per-state variants      Unit (per rule set)
  Motion/vote capture             Correct tallies including abstain/recused/absent; correction workflow preserves history    Unit + integration
  Minute drafting                 Every sentence has sources; citation refs resolve; flagged sentences surface for review    Prompt eval + contract tests
  Transcription                   Whisper end-to-end; segment timestamps; language configuration; performance benchmarks     Integration (sample recordings)
  Closed-session boundary         Staff-only ACL enforced; public-session queries cannot return closed content               Security tests
  Public comment handling         Submission, attachment to items, redaction audit, retention                                Integration
  Migration (incumbent exports)   Granicus / Legistar / PrimeGov / NovusAGENDA import fidelity                               Integration with fixtures
  RBAC enforcement                All 9 roles; packet visibility levels; public/staff boundary                               Integration
  Archive search                  Hybrid search across packets, minutes, transcripts, ordinances; permission-aware results   Integration
  Accessibility                   WCAG 2.2 AA on every public and staff page; tagged-heading PDF output; transcript player   Axe + manual
  Air-gap behavior                No outbound calls with air-gap enabled; migration connector runs on staging only           End-to-end with egress monitor
  Regression vs. CivicCore        CivicCore version bump does not break CivicClerk                                           CI matrix build
  ------------------------------- ------------------------------------------------------------------------------------------ ---------------------------------

**40. Statutory-rule test suite**

The notice-compliance workflow is the module's most compliance-sensitive
surface. Every jurisdiction rule set ships with a set of golden test
cases: scenarios with known correct outcomes (compliant vs.
non-compliant). Before a rule set update lands, the test suite runs
end-to-end against the new rules. A rule change that breaks a
prior-verified scenario is blocked.

**41. Prompt evaluation**

Prompt-level accuracy is verified through a dedicated evaluation harness
covering minute drafting (sentence-level citation accuracy on a labeled
sample), motion/vote extraction (labeled transcripts with known
motions), and notice-compliance (labeled notice drafts with known
issues). Prompt changes that regress eval accuracy below threshold are
blocked.

**42. Blind-spot audit**

-   Does not validate that a packet is legally sufficient --- that is
    the city attorney's job.

-   Does not validate that transcribed words reflect what was actually
    said when transcription confidence is low --- the clerk is the final
    arbiter.

-   Does not test against every state's open-meetings statute --- the
    evaluation harness uses a representative sample; a city opting into
    CivicClerk provides their rule set during onboarding.

-   Manual clerk review of AI-drafted minutes is the real quality
    signal; automated tests approximate it.

**Part XI. Scope Boundaries**

**43. What CivicClerk is NOT**

-   Not voting software. It records votes; it does not conduct them.
    In-chamber hardware voting integrates as a data source, not as a
    decision system.

-   Not a livestream platform. It integrates with existing livestreams
    (YouTube Live, Facebook Live, city-operated platforms). It does not
    replace them.

-   Not a decision-maker. No AI output auto-lands. Clerk review is
    required on every material surface.

-   Not a public-comment moderation system. It captures comments and
    supports redaction with statutory basis; it does not decide what is
    allowed speech.

-   Not a codifier. CivicCode owns the authoritative code. CivicClerk
    emits adoption events; CivicCode picks them up.

-   Not a board-management system. CivicBoards (future) handles roster,
    term, vacancy, and attendance tracking for bodies beyond Council.
    CivicClerk handles the meetings themselves.

-   Not a campaign-finance or ethics-filing system. Those belong
    elsewhere.

-   Not a cloud service. All inference, transcription, and data storage
    are local.

**44. Explicitly deferred**

-   Automated redaction of personally identifying information in public
    comments --- risk of over-redaction is high; clerk performs
    redaction with audit trail.

-   Real-time in-meeting translation --- interesting, not essential for
    v0.1.

-   Predictive agenda-timing ("how long will this meeting run") ---
    nice-to-have.

-   In-chamber voting hardware integration beyond a simple data import
    --- city-specific; revisit.

-   Automatic cross-reference from minutes to ordinance code --- handoff
    goes to CivicCode; the reverse link comes from CivicCode.

**Part XII. Repo-Aligned Status**

**45. Status legend**

-   DRAFTED --- the artifact described exists (this document).

-   DESIGNED --- the shape is specified in this document, no
    implementation.

-   SPECIFIED --- the data contract is fixed, no migrations or schemas
    authored.

-   PLANNED --- intent committed, no implementation, no dependencies
    resolved.

-   INHERITED --- provided by CivicCore; not implemented in CivicClerk.

**46. Honest assessment**

CivicClerk is entirely PLANNED at the code level. This spec is v0.1 of
the design document. Nothing ships until CivicCore v0.1 Phase 1 is
complete (shared models + audit chain live in CivicCore). CivicCode
handoff ships in a later minor release once CivicCode v0.1 exposes its
acceptance API. The CivicSuite umbrella repo's compatibility matrix will
reflect this explicitly.

  ---------------------------- ---------------------------------------- --------------------------------------------------------
  **Area**                     **Repo-aligned status**                  **Notes**
  Spec document                DRAFTED --- this document                v0.1
  CivicCore dependency         PLANNED (CivicCore v0.1 in extraction)   Cannot begin before CivicCore v0.1 Phase 1 ships
  Data model                   SPECIFIED                                No migrations written
  Prompt library               DESIGNED --- 9 prompts sketched          No YAML committed
  REST API                     DESIGNED --- 25 endpoints specified      No routers implemented
  Frontend pages               DESIGNED --- 20 pages specified          No components implemented
  Whisper integration          PLANNED                                  Model choice: whisper large-v3 default
  Statutory rule sets          PLANNED --- seed data for \~10 states    Community contributions expected for additional states
  Migration connectors         PLANNED                                  Granicus/Legistar/PrimeGov/NovusAGENDA export readers
  CivicCode handoff            DESIGNED --- event contract specified    Depends on CivicCode v0.1
  Test matrix                  DESIGNED --- 15 areas specified          No tests written
  Evaluation harness           PLANNED                                  Sample recordings + labeled transcripts to be curated
  Deployment                   INHERITED from CivicCore                 No module-specific deploy surface
  Accessibility verification   PLANNED                                  Follows CivicAccess integration
  ---------------------------- ---------------------------------------- --------------------------------------------------------

**Appendices**

**A. Example end-to-end: an ordinance from intake to adoption**

Illustrative walkthrough of a department-proposed ordinance moving
through CivicClerk.

-   1\. Week T-4: Planning staff drafts a zoning text amendment in Word,
    uploads to /staff/items/new with item\_type=ordinance. Staff-report
    normalizer flags a missing fiscal-impact section; staff adds it.

-   2\. Week T-4: Item submitted to Planning Director, who approves.
    Item enters the city attorney's legal review queue.

-   3\. Week T-3: City attorney suggests two redline changes via
    ordinance\_diff.v1. Staff accepts one, edits one. Attorney signs
    off.

-   4\. Week T-2: Clerk accepts item for the upcoming Council meeting.

-   5\. Week T-1, Day 3: Clerk assembles packet. Notice builder surfaces
    the 10-day public-hearing notice requirement for a zoning ordinance;
    clerk posts notice at city hall (photo confirmation), city website
    (URL confirmation), and paper of record (published-date
    confirmation).

-   6\. Week T-1, Day 0: Packet is POSTED publicly. Public comments
    begin arriving.

-   7\. Meeting day: meeting proceeds. Transcript generation starts
    automatically at adjournment.

-   8\. Meeting day + 1: minute drafter runs against packet +
    transcript + clerk notes. Draft has sentence citations. Clerk
    reviews, edits, moves to public review.

-   9\. Next meeting: minutes adopted. Clerk signs. Ordinance is now in
    ordinances\_adopted with handoff\_status=pending.

-   10\. CivicCode (when available) consumes the adoption event, updates
    the authoritative code, and surfaces the new section to CivicZone
    via normal code-ingestion flow.

**B. Prompt skeleton (minutes\_draft.v1)**

version: 1

effective\_date: 2026-05-01

author: city-clerk

review\_date: 2026-11-01

system: \|

You draft meeting minutes for the City of {city\_name}.

Every sentence you emit must cite at least one source: a transcript

segment id, a packet item id, or a clerk note id.

Do not invent speakers, motions, or votes. If a source does not

support a sentence, do not write the sentence.

Flag any ambiguity for clerk review rather than guessing.

user\_template: \|

Meeting: {meeting\_body} on {meeting\_date}

Packet items (ordered):

{packet\_items}

Transcript segments:

{transcript\_segments}

Clerk notes:

{clerk\_notes}

Motion and vote records:

{motion\_vote\_records}

Draft the minutes in the city's standard format. Cite every sentence.

output\_contract:

required\_fields: \[minutes\_html, sentence\_citations, flags\]

refusal\_conditions:

\- sentence\_without\_source

\- ambiguous\_speaker\_without\_flag

\- motion\_without\_matching\_record

**C. Compliance notes**

-   Open Meetings Act / sunshine law: every state rule set is data;
    updates ship as data releases.

-   ADA Title II public-facing compliance dates (April 24, 2026 \>50k;
    April 26, 2027 smaller) apply. Tagged-heading PDFs, accessible transcripts,
    plain-English summaries.

-   Records retention: adopted minutes are typically retained
    permanently. CivicCore retention engine executes per the
    jurisdiction's schedule.

-   CJIS: no CJIS data passes through CivicClerk.
    Law-enforcement-related agenda items are handled under general
    rules; closed-session handling covers personnel-specific exceptions.

-   Privacy: public comment submitters' names are public unless the
    city's rules redact by category (uncommon). Contact info (email,
    phone) is collected for verification and not published by default.

**D. Verification log (to be completed when v0.1 ships)**

\#\# Verification Log --- CivicClerk v0.1

\#\#\# What Was Changed

First release of CivicClerk. PLANNED → SHIPPED.

\#\#\# Data Provenance Check

\[ \] Every minute sentence traces to a transcript segment, packet item,

or clerk note, verified end-to-end

\[ \] Every adoption event in ordinances\_adopted/resolutions\_adopted

traces to the motion and meeting that produced it

\#\#\# States Verified

\[ \] Agenda item: every transition across the 11 states

\[ \] Meeting: every transition, including cancellation and emergency
paths

\[ \] Notice: deadline calculation across regular/special/emergency

\[ \] Minutes: drafting, review, adoption, signing

\[ \] Closed session: entry, exit, reconvene-statement, staff-only ACL

\#\#\# Visual Check

\[ \] Desktop, mobile, tablet (member packet reader)

\[ \] Assembled packet PDF: tagged headings verified in screen reader

\[ \] Transcript player: keyboard navigation, speed control

\[ \] Deadline countdown: visual and announced

\[ \] Browser console: zero errors, zero unexpected warnings

\#\#\# Copy & Content Check

\[ \] Notice copy reviewed against jurisdiction's statutory requirements

\[ \] Public-facing language reviewed by CivicAccess

\[ \] Refusal and deadline-missed messages are clear and actionable

\#\#\# Security Check

\[ \] Closed-session ACL: public query cannot return closed content

\[ \] Member-only ACL: public query cannot return pre-adopted
deliberative material

\[ \] Public comment redaction: audit record with statutory basis

\[ \] No outbound calls at runtime (egress monitor green)

\#\#\# Performance Check

\[ \] Whisper transcription: within target for sample recordings

\[ \] Minute-draft generation: within target on consumer GPU

\[ \] Packet assembly: under 30 seconds for 200-page packet

\[ \] Archive search: under 1s p95 for typical queries

\#\#\# Regression Check

\[ \] CivicCore compatibility matrix updated

\[ \] CivicRecords AI search integration unchanged

\[ \] CivicCode handoff contract honored (if CivicCode present)

\#\#\# Test Suite Blind Spots

\[ \] Listed in release notes; manual verification performed for each

\#\#\# Documentation

\[ \] CHANGELOG in civicclerk

\[ \] Compatibility matrix updated in civicsuite

\[ \] Module catalog entry updated in civicsuite

\[ \] Migration guide for incumbent platforms published

\#\#\# Sign-off

All four passes complete. No known open issues.
