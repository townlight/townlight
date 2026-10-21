<a id="civicregwatch-module-specification"></a>

# Townlight Regulatory Watch Module Specification

Status: future implementation specification
Source: `C:/Users/scott/Downloads/CivicAPI and CivicRegWatch modules.docx`

## Purpose

Townlight Regulatory Watch is the Townlight module that monitors federal regulatory
activity and surfaces the subset of rules, proposed rules, guidance documents,
and congressional actions that may carry operational, legal, or financial
consequences for the city running Townlight.

It is an intelligence layer, not a compliance system. It tells staff something
changed and someone should look at it. It does not make compliance
determinations, interpret legal obligations, or take action for the city.

## Product Promise

City staff should be able to open Townlight Regulatory Watch and know, within five minutes,
whether federal regulatory activity from the last 24 to 72 hours requires
attention. Every alert must explain what changed, which city department or
operation it may touch, whether a deadline exists, and what follow-up action is
appropriate. Staff remain responsible for legal interpretation and compliance
decisions.

## Non-Goals

- No legal compliance determinations.
- No city-specific legal interpretation.
- No automatic action in other Townlight modules.
- No replacement for the city attorney, compliance officer, or municipal league legal advisory.
- No completeness guarantee across all federal regulatory activity.
- No live LLM calls in v0.1.x.
- No authenticated agency-system integrations in v0.1.x.
- No state regulatory monitoring in v0.1.x.

## Primary Sources

All v0.1.x data access is read-only from public, documented federal APIs. No
scraping is allowed. Every source call records timestamp, endpoint, and response
hash.

Tier 1 target sources:

- Federal Register API: proposed rules, final rules, notices, executive orders.
- Regulations.gov API: public-comment dockets for proposed rules.
- Congress.gov API: bills, enacted laws, and committee actions.
- USASPENDING API: federal grant-program and appropriations notices.

Tier 2 planned sources:

- EPA AQS / ECHO / SDWIS.
- HUD APIs.
- FEMA NFIP.
- DOL / FLSA / OSHA updates.
- FCC broadband and E-Rate updates.

Tier 3 planned supplemental sources:

- NHTSA.
- FTC.
- ADA.gov / DOJ.
- Treasury ARPA/IRA.

## Domain Taxonomy

Every incoming document is classified against a fixed municipal domain taxonomy.
Classification is deterministic in v0.1.x using keyword and CFR-title matching.
LLM-assisted classification is planned for v0.2.x and remains staff-reviewable.

| Domain ID | Label | Example CFR Titles | Primary Townlight Module |
|---|---|---|---|
| ENV_WATER | Water and wastewater | 40 CFR 122-147 | Townlight Permitting, Townlight 311 |
| ENV_AIR | Air quality | 40 CFR 50-99 | Townlight Permitting |
| ENV_FLOOD | Floodplain / NFIP | 44 CFR 59-78 | Townlight Zoning, Townlight Permitting |
| LAND_USE | Land use and development | HUD 24 CFR, SBA regs | Townlight Zoning, Townlight Planning |
| HOUSING | Housing programs | 24 CFR 5, 91, 570 | Townlight Grants |
| LABOR | Employment and labor | 29 CFR | Townlight HR |
| FINANCE | Grants and fiscal | 2 CFR 200 | Townlight Grants, Townlight Budget |
| SAFETY | Public safety | DHS, FEMA | Townlight Safety |
| TRANSPORT | Transportation | 23 CFR, 49 CFR | Townlight 311 |
| ELECTIONS | Elections | 52 USC, EAC guidance | Townlight Elections |
| TELECOM | Broadband / telecom | 47 CFR | Future integration |
| COURTS | Municipal courts | DOJ guidance | Townlight Courts |
| ADA | Accessibility / ADA | 28 CFR 35 | Townlight Access |
| PROCUREMENT | Procurement | FAR supplements | Townlight Procurement |
| ENVIRONMENT | General environmental | Mixed | Townlight Permitting |

## Alert Architecture

Alerts are structured records generated when a new source document is classified
into at least one municipal domain above the configured threshold.

Alert fields:

- `alert_id`
- `source`
- `document_id`
- `document_type`
- `title`
- `publication_date`
- `effective_date`
- `comment_deadline`
- `domain_tags`
- `agency`
- `cfr_parts_affected`
- `summary_draft`
- `relevance_note`
- `source_url`
- `retrieved_at`
- `content_hash`
- `review_status`
- `reviewed_by`
- `reviewed_at`
- `escalation_target`

No alert is auto-escalated, auto-dismissed, or auto-acted-upon. Every status
transition requires a human action.

## Polling And Freshness

Polling runs via Celery Beat and is idempotent. Documents are deduplicated by
`document_id + source` before classification.

| Source | Default Cadence | Minimum Allowed |
|---|---:|---:|
| Federal Register | Every 6 hours | Every 1 hour |
| Regulations.gov | Every 12 hours | Every 6 hours |
| Congress.gov | Every 24 hours | Every 12 hours |
| USASPENDING | Every 24 hours | Every 12 hours |

Polling failures are logged with error category and retry count. A circuit
breaker pauses a source after five consecutive failures and notifies admins.

## Staff Workflows

- Alert review: acknowledge, escalate, dismiss with note, reopen, or archive.
- Comment deadline tracking: show deadlines and allow local notes/reminders.
- Escalation to Townlight Legal: create a linked attorney-review record.
- Escalation to Townlight Meetings: create an agenda item draft stub requiring review.
- Search and history: filter alerts by keyword, domain, agency, date, and status.

## Notifications

Townlight Regulatory Watch uses the Townlight Core notification surface when available.

- In-app alert badge: always.
- Email digest: configurable.
- Webhook delivery: planned v0.3.x.

Notifications link back to Townlight Regulatory Watch and do not include the full alert
record.

## Data Model

Canonical tables in the `civicregwatch` schema:

- `civicregwatch.alerts`
- `civicregwatch.alert_domain_tags`
- `civicregwatch.alert_cfr_refs`
- `civicregwatch.alert_reviews`
- `civicregwatch.alert_escalations`
- `civicregwatch.poll_runs`
- `civicregwatch.poll_failures`
- `civicregwatch.domain_taxonomy`
- `civicregwatch.user_subscriptions`

All consequential transitions carry a hash-chained audit trail.

## API Surface

- `GET /health`
- `GET /civicregwatch`
- `GET /api/v1/civicregwatch/alerts`
- `GET /api/v1/civicregwatch/alerts/{id}`
- `POST /api/v1/civicregwatch/alerts/{id}/review`
- `POST /api/v1/civicregwatch/alerts/{id}/escalate`
- `GET /api/v1/civicregwatch/domains`
- `GET /api/v1/civicregwatch/poll-status`
- `POST /api/v1/civicregwatch/poll/trigger`
- `GET /api/v1/civicregwatch/subscriptions/{user_id}`
- `PUT /api/v1/civicregwatch/subscriptions/{user_id}`

## Prompt Library

v0.1.x has no live LLM calls. v0.2.x prompt candidates:

- `alert-summary`
- `relevance-note`
- `domain-classifier`
- `ordinance-impact-flag`

Every prompt must state it is not a legal opinion, cite the upstream document,
avoid asserting that the city must act, and record prompt/model provenance.

## Dependencies

- Townlight Core: migrations, audit, LLM abstraction, notifications, provenance.
- Townlight Legal: optional escalation target.
- Townlight Meetings: optional ordinance-amendment agenda-item stub target.

## Test Matrix

- Poll execution and idempotent deduplication.
- Circuit breaker trigger and recovery.
- Domain classification against labeled source documents.
- Alert creation, field completeness, and content hash.
- Review workflow state machine.
- Escalation record creation.
- Notification delivery by subscription.
- Comment deadline display.
- Search and filter correctness.
- Admin-only poll trigger enforcement.
- Air-gap behavior with outbound calls disabled.
- Townlight Core compatibility matrix.

## Shipped Vs Planned

Planned v0.1.x foundation:

- Schema and Alembic migrations.
- Alert data model.
- Deterministic domain classifier.
- Federal Register polling without LLM.
- Poll-run logging and circuit breaker.
- Accessible public module overview.
- Health endpoint.
- Alert list/detail/review APIs.
- Documentation gates and Townlight Core alignment.

Not shipped in v0.1.x:

- LLM-assisted classification.
- LLM-generated summaries.
- Regulations.gov, Congress.gov, and USASPENDING polling.
- Comment reminders.
- Escalation to Townlight Legal or Townlight Meetings.
- Notification delivery.
- Webhooks.
- State regulatory monitoring.
