# Records convergence: accepted desktop contract and migration mapping

Status: local implementation contract; not a release or feature-completion claim.
Scope authority: bounded plan revision 2.0, local Records implementation resumed with Scott's approval on 2026-10-15. No outward writes authorized.

Working repositories:

- `C:\Users\scott\Documents\Codex\Townlight-Records-Convergence-2026-10-12\townlight`
- `C:\Users\scott\Documents\Codex\Townlight-Records-Convergence-2026-10-12\sunshine`

Baseline: Townlight `a563843eee07c168f0cecbc54efda64a579209a8`; Sunshine `ff99d8c7e692ba1f75e1781f517bb54f5c618b48`.

## 1. Current callers and ownership

The first implementation milestone is `records-beta`: Core, Records, Notice, Access. The target first connected system is `city-core`: those modules plus Meetings and Code. There are no deployed customers; preserving Scott's work and state does not require an indefinite second municipal backend.

Resolved planning boundary: deliver Records, then connected Meetings, then Code. No partial action-by-action authority switch. Shared handlers remain until their last consumer is replaced and proven; intermediate candidates cannot expose a stale competing Records copy through another profile. Full city-core delivery is later, not a prerequisite to finishing Records. No profile or real data has been activated by this transport slice.

`main.rs` gates commands by authenticated native role and enabled module. Before migration, the legacy profile reads JSON. Once a migration journal exists, legacy reads and writes are fenced, including interrupted or corrupt-journal cases. Active profiles refresh the canonical SQL projection through the typed client; service failure never selects the old JSON. `main.js` retains shell navigation while Records rendering and its typed controller live under `desktop/src/records/`.

The following is the finite Records operation inventory. Every operation writes state unless identified otherwise; action names are not read/write guarantees.

| Existing action | Required existing behavior / side effect |
|---|---|
| create-records-request | Staff intake, reviewed date/basis, tracking, timeline, public status, outbox, audit |
| submit-public-records-request | Public intake/contact, pending staff deadline review, filtered response |
| lookup-public-records-request | Contact-matched public status lookup; read-only, no staff fields |
| add-public-records-message | Contact-matched requester message, timeline, status, outbox, audit |
| set-records-deadline | Validated deadline and recorded basis |
| calculate-records-deadline | Existing staff-specified calendar/business-day calculation; no new legal rule |
| request-records-clarification | Staff note and existing public-status/outbox behavior |
| add-records-message | Existing staff/requester visibility semantics |
| assign-records-request | Existing free-text officer assignment; not necessarily a login account |
| record-records-search | Search note, optional citation, status, timeline and audit; not read-only |
| record-records-search-session | Query/location/reviewer/result receipt and citations |
| add-records-document | Secure native copy/hash plus canonical attachment metadata |
| add-records-release-copy | Reviewed release copy and hashes, retaining original evidence |
| add-records-exemption-review | Existing human review note |
| add-records-exemption-decision | Source/kind/finding/decision/basis/reviewer evidence |
| estimate-records-fee | Existing free-text estimate; do not invent a fee policy |
| add-records-fee-line | Exact cents, description and staff-entered schedule basis |
| waive-records-fee | Existing recorded human waiver reason |
| suggest-records-response | Real pinned local generation; failure preserves current text/approval |
| draft-records-response | Save text; clear current approval only when text changes |
| approve-records-response | Existing human approval and append-only historical notes |
| build-records-release-package | Existing reviewed-release selection and package evidence |
| export-records-response | Approval prerequisite, canonical metadata, native file/hash integrity |
| fulfill-records-request | Existing approval/package prerequisites and fulfillment evidence |
| close-records-request | Existing fulfillment prerequisite and terminal closure |

Shared operations/consumers required by this profile:

- `load-demo-town`: admin-only explicitly fictional fixture, existing overwrite protection and source provenance. Reuse the Core fixture; no real-town scrape or new fixture program.
- `mark-notification-sent`: existing manually recorded outbox status, not a promise of SMTP delivery.
- `search-city-knowledge`: filtered to enabled modules and native role; it writes an audit event. Preserve accepted local search behavior before considering new indexing.
- `open-exports-folder`: native OS integration only, with existing module/path restrictions.
- Access actions: `accessibility-review`, `civicaccess-records-export`, `civicaccess-delete-review`, `civicaccess-plain-language`, `civicaccess-language-variant`, `civicaccess-form-plan`, `civicaccess-publishing-workflow`, `civicaccess-ada-title-ii`, `civicaccess-tagged-pdf`. Reuse Python Access implementations; retain existing human/advisory boundaries and native file handling.
- Notice publication/archive actions currently require both Meetings and Notice in the native gate. They are not newly enabled in Records. Records notification/outbox consumers remain in scope; dormant Meetings-dependent actions stay unchanged.
- Startup, refresh, public projection, search, audit display, export references, demo loading, backup/restore, repair and upgrade must agree on authority. No loader may replace SQL-backed Records with an old JSON snapshot.

## 2. Identity and authorization

The native role boundary is not the Python web role hierarchy:

| Native role | Existing allowed modules | SQL identity / boundary |
|---|---|---|
| local-admin | All enabled modules; demo administration | Existing native administrator identity, mapped to SQL admin; native module/operation gates still apply |
| city-staff | All enabled module workflows, not native administration | SQL staff identity plus explicit native module capability check; never SQL admin |
| records-staff | Records only | SQL staff identity limited to Records operations; no implicit Access permission |
| clerk | Meetings, Notice, Access | Access/Notice only when enabled; no Records write permission |
| code-staff | Code only | No Records/Access mutation capability |
| Signed out | Existing configured public actions only | Public projection/contact checks, never an administrative bearer |

Use actual signed-in identity, never payload `actor`, `reviewer`, or role text as authorization. Preserve user-entered reviewer/assignment labels as evidence, separately from the authenticated audit actor.

Native authentication already uses `local-session.json` with an HMAC-SHA256 over lowercased email, role, expiry and the current credential verifier; the per-install key is outside `config`. Sign-out removes the session, account disablement/role or passcode changes invalidate it. Reuse and validate this existing authenticated boundary rather than creating an unauthenticated localhost endpoint or trusting caller-supplied roles. Python suite-session validation remains available for existing web/Core callers; a native session must not be mistaken for an interchangeable JWT.

The local domain boundary must require explicit possession of a valid native session proof, validate the current on-disk session/account state, and resolve the mapped SQL user. Reading a valid shared session file on behalf of any unauthenticated HTTP caller would create ambient authentication and is prohibited. Session proofs and credential verifiers never enter JS, logs, receipts, exports or source.

Identity import is explicit and idempotent. Existing SQL users must be matched and validated, not overwritten or silently promoted. Native users with module-specific capabilities cannot gain broader API rights merely because SQL has fewer role names. First-run/disabled-user/expiry/sign-out and existing password-rotation requirements remain intact. Unresolvable or conflicting identity is a migration error, not permission to use a universal admin.

Legacy object IDs map deterministically to UUIDs with a documented namespace and entity kind; retain the original ID in the link metadata. Free-text assignees/reviewers do not become invented accounts. Existing explicit SQL identities are retained. IDs returned to the old view can remain stable legacy IDs through the adapter.

## 3. Field and storage mapping

Use the existing Records models and shared services as the primary domain implementation. Add narrowly typed columns/relations where accepted desktop information has no existing representation. Do not store `CityWorkState` as one authoritative JSONB value or implement a second Python-only desktop product.

| Native source | Canonical destination / preservation rule |
|---|---|
| id | RecordsRequest UUID plus immutable legacy identity link |
| public_tracking_number | Unique typed tracking field; preserve existing REQ numbers, never regenerate during import |
| requester, requester_contact, submitted_via, summary | Existing requester_name/description and typed contact/intake-origin fields; contact may not be an email |
| created_at_unix_seconds | Existing created_at/date_received with exact UTC epoch preservation |
| deadline, deadline_basis, deadline_reviewed_at_unix_seconds | Existing statutory_deadline when valid; typed original label/basis/review time preserves pending public intake |
| status | Existing RequestStatus for canonical lifecycle plus explicit legacy presentation label where needed; do not invent legal transitions |
| assigned_to | Existing assigned_to UUID only for a verified account reference; preserve free-text assignment separately |
| clarification_notes, search_notes, exemption_reviews, citations | Typed note/citation relations or bounded typed metadata; preserve order and text |
| search_sessions / nested results | Existing search/domain tables with typed compatibility evidence for locations, reviewer, result IDs and original citations |
| exemption_decisions | Existing exemption/domain decision relations, preserving original source/finding/basis/human labels |
| fee_estimate, fee_waiver_reason | Existing fee fields/waiver relation plus original text where no numeric conversion is lossless |
| fee_line_items | Existing FeeLineItem relation with exact amount_cents preservation and schedule basis; never float-round imported money |
| response_draft | Existing RecordsRequest.response_draft and shared response service |
| approval_notes, approved_at_unix_seconds | Historical notes retained; explicit current approval timestamp/content association; no new unrelated invalidation rule |
| exports, release_packages | Typed immutable artifact/package records including original paths, hashes, counts and creation times |
| timeline | Existing RequestTimeline with original action/note/time/legacy ID and historical actor label; actual new actor is a mapped User |
| public_status_events | Typed public-safe status history, not a projection of private timeline notes |
| messages | Existing RequestMessage with exact body, visibility and original sender evidence; unknown visibility rejects |
| documents / release-copy fields | Existing Document/RequestDocument plus typed native source/copy/release metadata, paths, SHA-256, sizes and reviewer evidence |
| fulfilled_at_unix_seconds, closed_at_unix_seconds | Explicit lifecycle timestamps; do not conflate fulfillment with closure |
| audit_entries | Preserve original chain IDs/hashes/order verbatim as imported evidence; link its head to the canonical audit chain, never silently recompute history |
| notification_events | Existing outbox capabilities plus required recipient labels, channel, manual status and timestamps; no new automatic delivery |
| publication_events | Preserve supported Notice publication/hash/retraction evidence; no newly enabled Meetings feature |
| access.reviews, access.audit_events | Existing Access storage with preserved IDs/content/findings/advisory AI metadata and historical actor evidence |
| demo_fixture | Existing fixture marker/version/provenance, imported as typed profile metadata |
| schema_version | Validate supported legacy schema 1, including the existing missing-version upgrade; future/unknown schema rejects |
| Meetings/Code and other unmigrated namespaces | Preserve original verified snapshot and references as non-authoritative historical material; do not drop, mutate, newly expose or claim migrated |

Known native labels include received/public intake received, deadline reviewed/calculated, clarification, assigned, searching, search session recorded, message sent/requester message received, document/release copy attached, in review, exemption decision recorded, ready, fee review/waived, drafted/local AI draft ready for review, approved, release package built, response package exported, fulfilled, closed. The mapping must preserve the original label while using the existing Python enum consistently. Approval is not inferred from a presentation status.

For staff create, preserve the desktop's initially unassigned officer even though the existing web create handler assigns its creator. Make this an explicit shared-service input, not two implementations. No native text length may be silently truncated to fit SQL; validate or widen a necessary field with evidence.

## 4. Typed transport and readiness

Current implementation: `records_domain_request` is a native-only authenticated transport to fixed loopback service routes, with a closed operation/action enum, UUID route identifiers, no proxies/redirects, bounded responses, timeout/unknown-outcome errors, and no automatic retry or JSON fallback. The typed controller is selected only after explicit migration activation. Runtime activation requires an active local journal matching a committed SQL import receipt. Native-to-Python/database tests passed on disposable profiles; installed acceptance remains outstanding.

`GET /desktop/v1/records-state` supplies the canonical Records projection for authenticated refresh, including file/package metadata and permitted shared Access/outbox/audit evidence. Each request carries both its stable presentation `id` and canonical `request_id` for subsequent API calls; these must not be confused. Meetings and Code are not supplied by this Records projection and remain later milestones.

- Keep the current operation/result semantics, including `accepted`, `action`, status/message/next_action, complete canonical `state`, search results and Access advisories.
- Define validated payloads per operation; do not pass arbitrary dicts directly into SQL or native file APIs.
- Serve the real FastAPI domain app through the existing loopback runtime. Do not add a second sidecar port or independent database authority.
- `/ready` checks the actual domain schema/services and activation state. `/health` compatibility is retained. A fresh empty synthetic profile can be explicitly initialized; an unimported existing JSON profile is not automatically ready for mutations.
- Preserve the existing packaged migration runner. The web lifespan assumes Docker `/app` and runs Alembic itself; the Windows host must use the existing explicit migration environment instead of assuming that lifespan is portable.
- Non-idempotent call timeout is unknown outcome: read canonical state before retry. No silent fallback to Rust/JSON on service failure.

## 5. Migration, transactions, files and recovery

Back up and fingerprint the original source and managed files, stop legacy writers, map/import into proper module storage, and validate counts/content/references/approval/artifact hashes. Store completion in the import transaction. Activate through a small crash-safe local receipt reconciled against that database record; ambiguous state refuses writes.

The existing Python create/audit functions currently commit internally. Shared domain operations used by the bridge must support caller-owned transactions so a request, timeline, outbox and audit entry cannot leave a partial accepted command. Reuse/extract existing business code; do not call a commit-owning HTTP handler from an enclosing migration transaction.

Bounded reviewer finding R1-01: the shared audit logger's latest-row `FOR UPDATE` does not serialize an empty chain or a waiter that selected an old head. All canonical audit writers must acquire the same PostgreSQL transaction-scoped chain lock before selecting the current head and appending. Preserve imported hashes unchanged. Prove concurrent appends and caller rollback with the existing database test framework; this is a prerequisite of canonical audit preservation, not a new audit product.

Keep native file access and secure copying in Rust. Python decides release eligibility and stores authoritative metadata. A file operation and a database transaction are not one transaction: record/verify the staged artifact and resolve failed finalization explicitly rather than claiming atomic export. Never delete prior exports as a failed-call cleanup.

The old JSON is read-only historical evidence after activation, not a lossless rollback after new SQL work. Post-cutover recovery requires a consistent SQL backup plus managed files, metadata and required configuration. Preserve secrets according to the established backup contract. No live database directory copy is a consistency proof.

## 6. First implementation batch and evidence limits

First batch: establish the authenticated packaged-runtime boundary, one staff create through shared Python code, canonical readback, correct audit actor, service restart durability, and denied-call/no-partial-write cases. Disposable synthetic data only. No real profile activation, Rust domain deletion or packaged installer is justified solely by this slice.

Extend the existing golden contract in a new version only where needed; retain its pinned v1 input. Map the remaining lifecycle assertions to the existing accepted rc.3 journey. No new testing framework or speculative acceptance gate is authorized.

The versioned extension is records-desktop-lifecycle-v2.json, present in the native fixture directory and Sunshine backend/tests/fixtures. It anchors the unchanged v1 semantic hash and enumerates the accepted lifecycle, narrow approval preservation, public boundary, shared capabilities and persistence expectations. It is test data, not a new general workflow language. Executed adapters/assertions are still required; file presence alone is not migration proof.

Two public-projection details must be preserved rather than silently tightened during this job: rc.3 clears response text, private review/search/fee/document fields but retains export-path strings; it does not distribute those files. For an already released request, matching-contact lookup reuses the existing status-only projection, whereas an unreleased matching request can expose its requester-visible thread. These are source-observed compatibility details, not new features or approval-policy changes. Changing them requires a separate owner decision and is not admitted as an incidental fix.

This file describes the intended implementation and inventory. Unimplemented items are not evidence of completed behavior. Installed acceptance and final retirement remain later plan phases.

## Historical October 16 local integration checkpoint (not activated)

The native client now stages attachment/release-copy bytes and performs the
prepare/write/finalize export protocol against the existing Records domain.
Python independently verifies paths, hashes and manifests before recording
completed exports. Failed/unknown completion never erases historical files.
Public intake has a separate local-shell proof; anonymous work is not attributed
to a fabricated staff account. Draft generation uses the existing Rust model
runtime transport with a Python-owned prompt and stale-response guard.

The runtime Access adapter calls the existing `civicaccess` engine and qualified
Access tables. It adds typed advice/export evidence tables after the existing
Access bootstrap, not another copy of reviews in Records storage. Review AI
failure preserves deterministic findings; failed rewrite/translation generation
does not silently substitute a sample. Explicitly unavailable AI produces the
existing labelled sample behavior. Access exports retain verified files and
audit events after a review is deleted. Native capabilities remain distinct:
clerks may use Access without gaining Records privileges.

The Records milestone snapshot/search reads only canonical SQL, filtered by
native capabilities. Meetings, Code and meeting-dependent notices are explicitly
unavailable there; no old JSON is merged. Search records its audit event. Records
snapshots do not expose Access audit summaries. Existing Records presentation is
extracted into `desktop/src/records/view.js`; typed clients are in the same
directory. The old production UI dispatcher remains active until coherent
import, recovery and activation are implemented. Neither the local endpoints
nor passing focused checks constitute installed acceptance.

Pending: demo fixture/marker parity, full UI activation/error paths, lossless
owner/test import and account mapping, consistent SQL-plus-files backup/recovery,
packaged candidates, installed acceptance, and evidence-gated retirement.
No current changes authorize push, merge, signing or publication.

## October 17 local activation and recovery implementation

These changes are implemented and tested locally, not yet certified by an installed candidate.

- **Finish Records Migration**, in System Health, is an explicit local-administrator operation. It fences legacy writers, stops the profile's database writers, preserves a verified backup, provisions identities from current native accounts, and imports supported Records/Access evidence into normalized SQL tables. Historical audit hashes and original JSON bytes are retained. User labels are evidence, not authentication.
- Import verifies source and managed-file hashes, references, counts and reconstructed Records views. A transaction records completion with the imported data. Retrying identical input is idempotent; changed input or a conflicting nonempty destination is rejected. An interruption after database commit remains inactive until receipt reconciliation succeeds.
- Activation atomically updates the local journal after commit and marks the old JSON read-only. That file is historical evidence, not a rollback source for later SQL writes. Incomplete migration displays an explicit unavailable state instead of pretending that there are no requests.
- Native accounts reconcile through authenticated session validation. An unrelated existing SQL email is not overwritten or promoted; credential verifiers are never copied into SQL or exposed to JavaScript. Module-specific native permissions remain authoritative for desktop calls.
- **Load Demo Town** reuses the pinned fictional Redstone Valley fixture and preserves its watermark in public/export views. It backs up first and refuses to overwrite non-demo work. It does not scrape or impersonate a municipality.
- **Backup** stops this profile's Python/task/database writers and requires PostgreSQL to report a clean shutdown before copying database files. It leaves those services stopped; use **Start Services** afterward. It does not stop the local model or unrelated host processes.
- **Restore** first stops the same writers and creates a safety backup of current data/files. Database backups without the cold-consistency marker are refused. Restored services require an explicit start. Newer work remains in the safety backup; it is not claimed to be present in the older restored snapshot. Existing secret/model-cache exclusions remain unchanged.
- Lifecycle operations exclude in-flight canonical domain/file calls. The importer and activation path do not touch Scott's actual profile during development checks.

Evidence includes a real disposable PostgreSQL cold-backup/restore test, interruption/idempotency tests, full imported-view/file comparisons, fixture/watermark checks, native journal fencing and the recovered production frontend build. One bounded read-only source reviewer found no concrete blocker. These results do not replace the required exact installed Candidate A/B journeys, real model/offline/repair/uninstall proof, or evidence-gated retirement. No retired Rust handlers have been deleted by this batch.
