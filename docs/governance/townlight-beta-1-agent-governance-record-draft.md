# Townlight Beta 1 — Shared-platform Agent Governance Record

**DRAFT — PREPARED FOR DEPLOYING AGENCY REVIEW**

Prepared 2 November 2026. This is a technical contribution to an agency-owned record, not municipal approval, certification, a legal opinion, or a new beta release gate. No city has been selected or commissioned for this record. Longmont, Colorado is a possible first beta city only. The record is city-independent; all retained acceptance discussed here used synthetic data.

## Published beta versus corrected source candidate

The published Townlight Beta 1 installer remains the unchanged artifact identified below and **does not contain this correction**. Its historical acceptance remains bounded evidence for that published candidate.

Records defect C1 was reproduced on the released source baseline on 2 November 2026: after exporting approved response A, editing/approving B and requesting fulfillment, the authenticated API returned HTTP 200 instead of refusing the stale exports. The corrected Records source commit is `d10cafb913bc51e2edccc4272020d094f6064085` (tree `7a77409d1a8252372cc898644623de7c87b10f16`), based on `24a919c2bfcb8b720598ac94de2982f6171f452d`. It now requires both completed response and release-package artifacts to carry the current approved response hash; fulfillment receipts use only matching response paths. Older exports are preserved.

**Executed validation:** 13 affected backend tests passed against an isolated synthetic PostgreSQL database, including three stale/current-export combinations and successful fulfillment after both current exports exist. Changed Python files passed Ruff and the diff passed whitespace checks. Test clusters stopped cleanly. See [E19 correction evidence](evidence/records-export-freshness-2026-11-02.json).

This is a **source correction**, tracked in [Records PR #124](https://github.com/townlight/sunshine/pull/124), not an updated signed installer or new installed acceptance. The PR carries the integration status and required GitHub CI results; the local validation above is separate evidence. No package versions changed. The source links E1–E18 continue to describe the published baseline unless expressly qualified by E19. Agency decisions remain open. This record received an author source/evidence review; no independent review is claimed.

The canonical working record is now `townlight/townlight:docs/governance/townlight-beta-1-agent-governance-record-draft.md`. Distribution copies are mirrors. Organization-site publication is a separate authorization.

## Record boundary and evidence standard

The coordinated release is **Townlight Beta 1**, public prerelease `townlight-beta-1-station-delivery`. Existing component versions remain unchanged. The nine products are Core, Records, Meetings, Code, Zoning, Planning, Permitting, Inspections and Station. Supporting Access functions appear in the released suite composition; listing them below does not designate a tenth product. Standalone CivicCast remains a separate repository, installation and data boundary. Station reuses a pinned CivicCast-derived media implementation; the PEG operator controls cable take-to-air.

This parent record covers common infrastructure and available uses, with short context addenda below. It does not assert that nine products are nine autonomous agents. A deploying agency must select the actual uses and confirm whether each meets the framework's scope test. Deterministic retrieval, ordinary database writes and media workers are not automatically AI agents.

The four field statuses are the framework's **answered**, **unknown**, **not applicable**, and **not in place**. “Answered” means this draft supplies a bounded answer; it is not a pass or certification. “Unknown” identifies a missing deployment fact or determination. “Not in place” means no established mechanism or completed record was evidenced in the reviewed materials, not a claim about every possible future agency. Each qualification is part of the answer.

Source files were read, and the ten baseline source checkouts were checked on 2 November: HEAD/tree identities matched the retained inspection map and worktrees were clean. The correction and this record were made in separate worktrees; E19 identifies the changed Records candidate. Immutable commit links and path/symbol references appear in the evidence register. The eight baseline accepted PR trees match the public merge trees according to the retained comparison; this task rechecked local identity, not the remote comparison. Suite publication/documentation identity is distinct from the earlier integration commit and from installer build identity. The exact source archive and installer are identified separately:

| Candidate | SHA-256 |
|---|---|
| Accepted signed MSI, product version 1.6.0.1 | `173c032b874e2cf4091cd79213f53c0663d272070fc11712701892d490e09883` |
| Exact corresponding source ZIP | `18d94a23b1a5d9f4ee6ecddb0e581f194c90ac8306b01b06d6534d86c2e2220d` |

These identities and prior installed results come from retained publication receipts, not a new installation or rehash of the large MSI in this documentation task. Station provenance explicitly permits only CRLF/LF normalization between listed archive files and publication blobs. The original all-nine acceptance used an earlier MSI; eight unchanged products retain that bounded evidence, while the Station update has its own 13 affected installed checks. See E15–E17.

Method: source tracing of mounted runtime/desktop calls, provider configuration, draft persistence, human decisions, export/handoff and Station delivery; reading retained acceptance and the complete 47-field framework capture. This is not an exhaustive endpoint/security audit. No runtime configuration from a city, field outcomes or new model jobs were used. The later authorized C1 correction adds only the affected backend tests recorded in E19. The official framework could not be refreshed in this session (web reader inaccessible; headless HTTP DNS returned “No such host is known”); the same-day full HTML/text capture retained with the prior assessment is the schema basis. Links were checked against local source/receipt paths; remote availability was not freshly verified.

## Actual AI-function inventory

**Availability legend:** N = reachable native composition, conditional on model/configuration readiness; W = bundled Records web/API route, requiring its own authentication/configuration and not established as a selected native acceptance workflow; O = optional product implementation not mounted as that AI function by the reviewed native composition; D = deterministic/non-AI behavior. None of these letters establishes a commissioned deployment.

### AI inputs, models and results

| ID / product and function | Actual AI and released availability | Trigger / input and sensitivity | Model selection and provenance | Output and persistence |
|---|---|---|---|---|
| A1 Records: native response drafting | N; real local inference when ready | Authorized staff clicks suggest; current request summary, requester, deadline, fee estimate, messages, document metadata and evidence/search/exemption/citation notes. May contain personal/protected information. At least one search note or citation is required. | Native pinned Gemma model through Ollama; returned model name is recorded. Prompt built by `native_draft_context`; not a complete archived inference trace. E1/E2. | Generated text is automatically saved as the request's draft after the staff request; changed text clears approval. Prior-response hash guards concurrent response edits. No second click before draft save. E2/E3. |
| A2 Inspections: photo observations | N, optional configured vision adapter; no configured provider yields unavailable | Inspector explicitly requests analysis of selected original image bytes, descriptions, supplied text and resolved Code excerpts. Images may identify people, homes or sensitive conditions. | `configured_vision_provider`: Ollama/OpenAI/Anthropic configuration; model/base URL selected per deployment. Result records adapters that ran and model information. Support is not evidence that any remote provider is enabled. E8. | Draft observations/citations/unavailable items returned; analysis record can be saved with an attributed case revision. Source hashes rechecked for reviewed staff packet; separate Records copy contains reviewed public summary, not the AI workpaper. E8/E9. |
| A3 Inspections: voice memo transcription | N; bundled Whistle path selected when its bundle exists, otherwise configured/absent | Inspector requests analysis of retained audio; voices, names and location/case facts may be personal or protected. | `TextFlowKitTranscriptionProvider` runs owned Whistle driver/native assets; adapter runtime metadata retained. Exact operating asset versions/hashes remain agency inventory entries; do not substitute a chat-model name. E8. | Draft transcript observations; case save/review separate. Conversion/transcription errors report unavailable; no invented transcript. Local temporary conversion files are cleaned by adapter. E8/E9. |
| A4 Shared suite Access support: plain-language rewrite and language variant | N supporting route/client, conditional on local model readiness; not one of the nine product acceptance rows | Authorized staff supplies text and target language. “Public-facing text” in the prompt does not prevent staff pasting personal information. | Same native Gemma/Ollama path as A1. Generated response carries model label; audit records action/outcome, not a full durable copy of every generated rewrite. E1/E10. | Advisory draft returned for human review. Unready engine returns expressly labeled deterministic sample; generation failure does not masquerade as successful AI. Publication is a separate human action. |
| A5 Shared suite Access support: accessibility review advice | N supporting route/client | Staff requests review of title/body/language/alt-text indicators. May include internal or personal text. | Native Gemma/Ollama supplies advisory prioritization alongside deterministic findings. E1/E10. | Review, deterministic findings, AI outcome/text/model and audit event saved after request. Failed/unavailable inference retains deterministic review with explicit outcome. Does not establish accessibility compliance. |
| A6 Code: optional cited question answering | N conditional staff question path; native public answer page explicitly D | Staff question and one resolved adopted section. Question may include a person's facts. Determination/ambiguous/no-source paths refuse. | `code_bridge.questions` → `answer_question` → `build_grounded_answer`; optional Ollama config, default model string `gemma4:e4b`. No configuration or failed generation yields cited deterministic extract and error detail. Native public page sets `use_local_llm=False`. E6. | Informational answer with citation, provider/model when generated, review label; answer generation itself does not adopt law or save a case decision. No full durable inference log established here. |
| A7 Records: semantic retrieval and optional answer synthesis | W; API mounted, operating corpus/model and use not established by native acceptance | Authenticated search with department-scoped web filters; query and retrieved document chunks may be protected. Synthesis is optional. | Core Ollama embedding helper defaults to `nomic-embed-text`; synthesis uses Records configured chat model/Ollama client and context handling. These are separate from the native pinned model. E11. | Query/results/ranks and optional answer stored in search session with staff audit. Synthesis unavailable message can still have `ai_generated=True`; that flag alone does not prove model success. Document vectors depend on separately configured ingestion, not mere source presence. |
| A8 Records: optional exemption suggestions | W; `use_llm=False` by default | Staff explicitly requests secondary LLM scan of attached document chunks, alongside deterministic rules. Personal/legal/privileged text possible. | `llm_suggest_exemptions` defaults to `gemma4:e4b` through Records Ollama client. E11. | Saves FLAGGED suggestions, not release/withhold decisions; capped confidence is a heuristic, not measured probability. Model failure returns no suggestions, which is not evidence of no exemptions. Staff must review. |
| A9 Records: web response-letter draft | W; distinct from native response field | Staff requests letter using request/document/exemption context. Personal/protected data possible. | Tries configured Ollama; falls back to template on failure. E11. | Separate `ResponseLetter` draft persists; audit's `ai_generated=True` also covers fallback. Native exact-text approval cannot be assumed to govern this separate object. No accepted native release claim is transferred to this path. |
| A10 Records/Core setup support: guided interview wording | W; admin route, distinct from accepted native setup | Admin supplies city-profile answers; jurisdiction and operational/contact details may be internal. | Records LLM client rephrases the next deterministic question; on failure default question remains. E11. | Deterministically parsed human answer updates profile; model-generated question returned. Model is not choosing which arbitrary settings to write. |
| A11 Meetings: optional cited minutes AI assist | O; product app has route; native runtime mounts manual `meetings_bridge` routes instead | Product staff workflow supplies source material/model/prompt version/approver metadata. Meeting text may include personal or restricted content. | Product `create_minutes_ai_assist` calls configured Ollama, persists model/prompt/source metadata; unavailability returns 503. E5. | Citation-gated draft; automatic posting endpoint refuses. This is available source capability, not proof of an enabled native beta AI workflow. Accepted native transcript/minutes entry is supplied/manual. |
| A12 Records/Core: ingestion OCR and document embeddings | W/O supporting pipeline; worker/configuration required, not established as active in the native accepted workflow | Staff-authorized upload/source ingestion or separately configured scheduled sync; original images/scanned PDFs/document text can contain protected data. | Core image extraction tries Ollama `gemma4:e4b`, falls back to Tesseract OCR; chunk embeddings default to `nomic-embed-text`. Backend/asset versions and actual model success are not uniformly retained in each ingestion record. E11. | Extracted chunks/vectors and document ingestion state persist automatically. File hash/source identity retained; failure state records error. Original evidence custody does not prove extraction accuracy. |

The supported native text model manifest identifies Google **Gemma 4 12B QAT Q4_0**, runtime name `civicsuite-gemma4-12b-qat:q4_0`, source revision `29d097773436b69ff9feafd636ab4cf873786537`, artifact SHA-256 `93567e57a8fe10b23569b9d9ec38cd005deedf71e29477c421a4b83f418a538b`. This is a repository manifest fact, not proof that a city downloaded or runs those weights. Model setup permits deferral. The manifest declares Apache-2.0; the agency still records the actual acquired model grant and all ancillary asset terms. Core registry allows nullable version/license fields. Codex development models are not Townlight runtime models. E1/E12.

### Resources, automatic steps, external effects and stop boundaries

| Uses | Reach and automatic execution after request | Human authority, reversibility and stop/override | Evidence limits |
|---|---|---|---|
| A1 | Native IPC → authenticated loopback Records context → Ollama chat → authenticated draft save; local database/audit. Model receives text, not an arbitrary tool list. | Staff can edit/reject; current-text approval and export/fulfillment are separate. No per-call cancellation control established by this trace; sign-out/disablement invalidates subsequent authenticated requests, not completed effects. | Response concurrency hash does not hash every prompt input. No blanket injection defense or complete inference replay claim. E1–E4. |
| A2/A3 | Bridge validates original bytes/hash; resolves Code sources; configured vision HTTP or local transcription subprocess; caller separately saves case. Local bytes reach external model provider only if such provider is configured. | Inspector reviews output and chooses current revision/packet. No automatic enforcement. Stop initiating analysis; reject/edit draft; operator-level interruption requires an agency procedure. Transcription has bounded subprocess timeout; no tested universal AI stop switch established. | Original byte validation is not a guarantee of persistent storage by the analysis endpoint alone. Saved case/evidence workflow is separate. Existing real adapter execution receipts are retained acceptance, not field accuracy. E8/E9/E15. |
| A4/A5 | Native local text generation and Access bridge DB/audit; A5 saves review automatically after request. | Human reviews before reuse/publication; A5 explicit deletion retains audit. No technical universal publication gate is proved by an advisory label. | Text may be wrong or mistranslated despite prompt constraints. No measured accessibility/language performance. E10. |
| A6 | Active Code registry/citations and configured Ollama endpoint; deterministic public route avoids inference. | Human interprets/adopts law. Returned answer can be disregarded; resident reliance after staff reuse may be hard to reverse. | Source-selection gates do not validate every semantic claim in model text. E6. |
| A7–A10 | Mounted authenticated web APIs, DB/chunks/vectors, configured Ollama; explicit search/scan/draft/interview triggers. Background ingestion configuration is not established for this record. | Staff review search/suggestions/letters; admin owns profile answers. Stop further requests; deployment owner controls services. Final disclosure/legal decisions remain human. | Web credentials/department controls differ from native identity. Do not assume the native export gate or source acceptance applies to all web workflows. E4/E11. |
| A11 | Separate product-app Ollama route and minutes repository if commissioned; no native AI-assist mount identified. | Human review/adoption; posting refusal; source/prompt validation. | Product route presence is not native installed acceptance or a commissioned service. E5. |
| A12 | Configured worker reads authorized source/files, runs OCR/embedding, writes chunks/vectors in DB. A task may receive initiating user ID; it can also be absent. | Stop initiating ingestion or pause the configured worker/schedule through an agency procedure; originals support reprocessing, but rebuilt indexes can change retrieval. Automatic recurring ingestion would need its own autonomy/red-line determination. | Worker/schedule activation and permissions are not proved by the source inventory. This task did not run the pipeline or certify OCR/model portability. E11. |

### Non-AI and excluded capability boundary

| Product / workflow | Released behavior relevant to governance |
|---|---|
| Core | Shared identity, configuration, audit, database, provider/embedding plumbing and backup/restore; not an independent autonomous agent. Supported provider interfaces do not establish enabled providers. |
| Records | Intake, evidence custody, release decisions/copies, exact-text approval, verified export and fulfillment are conventional staff workflows; AI drafting is A1, with distinct conditional web functions A7–A10. |
| Meetings | Native supplied transcript and human-authored cited minutes (`model="manual"`, `human_authored=True`), review/adoption and archive; no accepted live Meetings transcription. A11 is separate optional product functionality. |
| Code | Import, adopted/pending lifecycle, deterministic citation extraction and public answer route; optional staff-model answer A6. Pending language is not current law. |
| Zoning | `discretionary.explain` classifies the question and quotes a resolved active official process source; numeric comparisons flag review. No LLM call in this traced process. No source/unsupported process yields unavailable. |
| Planning | `PolicyService.answer` matches query terms to effective adopted policy excerpts; versioned analysis/snapshots are staff-controlled. This is deterministic retrieval, not generated municipal policy. |
| Permitting | Native `pathway` expressly omits model-assistance input and returns `model_call_made=False`; cites configured requirements/Code/Zoning sources. Optional provider protocol in product code is not enabled resident AI. No official fees, permit issuance, completeness decision or scheduling inferred. |
| Inspections | Supplied notes, repeat-case lookup, report assembly and case revisions are deterministic; photo/voice AI is A2/A3 only when adapters actually run. No autonomous citation, fine, notice or enforcement. |
| Station | Staff-directed capture/media processing, stop, private evidence handoff, explicit completed-recording YouTube jobs and optional encrypted SRT to separate CivicCast. These are non-AI workers. Supplied captions/media processing do not establish live AI transcription or AI PEG control. |

## Action-and-approval table (fields 9.1 and 9.2)

Modes use the framework's `autonomous`, `confirm_first`, `human_only`. Here `confirm_first` means an explicit staff action authorizes the listed bounded operation; it does **not** imply a second confirmation dialog or a different reviewer. No model-driven autonomous external action was identified in the traced native paths. Automatic execution inside a requested operation is named separately.

| Action / mode | What authorizes it; automatic part | Changed input, unavailable source or uncertain outcome | Evidence |
|---|---|---|---|
| A1 generate and save draft — confirm_first | Staff suggest request authorizes inference **and draft persistence**. Model output is saved without a second review click; human approval of content remains separate. | Changed previous response hash rejects save with 409. Failed model leaves existing draft/approval unchanged. Other changed context is not covered by that hash. | E1/E2 |
| Edit/save response — confirm_first; approve response — human_only | Staff edits; changed response clears approval. Approval requires nonblank response and citation/source note, records current text hash and actor. | Same text preserves its approval; unrelated evidence edits do not universally clear it. Citation presence is not legal-validity proof. | E3 |
| Release/redact/exempt decisions and separate release copies — human_only | Staff records decision/basis/reviewer and supplies copies. No LLM decides release or overwrites original. | Package requires decisions; where applicable, corresponding copy category/hash presence. Do not describe this as exhaustive per-document decision completeness certification. | E3 |
| Export response — confirm_first | Staff export request; server checks current approval, prepares bytes; native writer writes file/manifest; completion verifies ownership/path/hash and current response hash. | Response change after preparation rejects completion; unverified intent is not exported evidence. Connected Planning sources revalidated. | E3 |
| Build release package — confirm_first | Staff request after release decisions/copies; manifest is prepared/written/verified. | Package can contain a draft-response snapshot; it does not use the same current-response approval prerequisite as response export. | E3 |
| Fulfill request — human_only | Staff request; requires current-text approval and at least one completed response and release-package artifact; creates status/publication record and notification intent. | **Published beta C1:** completed artifacts are not matched to current response hash at fulfillment. **Corrected source E19:** both artifact kinds must match the current approved hash; historical rows remain intact. External email receipt/delivery is not proved by a notification intent. | E3 |
| A2/A3 analyze; save/review case — confirm_first / human_only | Inspector requests analysis; adapters run automatically; inspector saves and marks review separately. | Missing adapter/source returns unavailable; changed case revision conflicts; no invented observation/transcript. Human-supplied observations must remain distinguished from inference. | E8/E9 |
| A4 rewrite or A5 save review — confirm_first; publish derived text — human_only | Request authorizes generation and A5 review save. Publication requires an operator's separate workflow. | A4 unready engine labels samples, failures do not claim generation; A5 preserves deterministic findings with failed/unavailable outcome. No general stale-approval gate claimed for reuse outside these routes. | E10 |
| A6 Code answer — confirm_first; legal interpretation/adoption — human_only | Staff question authorizes conditional inference. Source selection occurs deterministically. | No source/ambiguity/determination refusal; model failure returns source extract. Adoption/codification remains separate from answer. | E6 |
| A7 search/synthesis; A8 exemption scan; A9 draft; A10 interview — confirm_first | Explicit authenticated request; resulting search/flags/letter or human profile answer may persist automatically. | Synthesis/letter AI flags are not reliable success counters; fallback or no suggestions requires reading outcome/content. Native approval claims do not transfer to separate letter objects. | E11 |
| A12 OCR/embedding ingestion — confirm_first for explicit ingest; autonomous for a separately commissioned recurring schedule | Pipeline automatically extracts/indexes after authorized source/task selection. No per-chunk approval. Scheduled operation is a conditional configuration, not asserted enabled here. | Failed ingestion records failure; OCR can fall back. Actual schedule, worker stop/retry and human sponsor must be recorded if selected; do not inherit native highest-autonomy answer without reassessment. | E11 |
| Native Meetings draft/review/adopt/archive — human_only decisions, confirm_first writes | Human-supplied sources/sentences; repository records review/adoption; archive uses cited minutes and attribution. | Invalid citations/prompt version rejected; native manual drafting is not AI inference. Optional product automatic posting is explicitly refused. | E5 |
| Code adoption/codification — human_only | Explicit staff lifecycle/adoption operation using Meetings decision evidence where applicable. | Draft/pending cannot be marked current adopted law; conflicting/missing source state must be resolved by staff. | E6 |
| Planning/Permitting/Inspections reviewed snapshot/packet — confirm_first after human review | Staff selects audience/current revision; service constructs hash-identified output. Public/Records copies require separately reviewed summary conditions. | Stale revision, unavailable/revoked source or integrity failure refuses relevant snapshot/packet. Review flags can be set by authorized staff; separation of duties is not universally enforced. | E7/E9 |
| Meetings → Station capture and stop — confirm_first | Authorized meeting-capable staff chooses capture/source; non-AI worker executes. Explicit stop records actor/time. | Only valid live queued/running capture accepts stop. Feed interruption does not establish capture failure; retained synthetic checks show recording can continue. | E13/E16 |
| Station → Records evidence handoff — confirm_first | Records-capable staff selects completed private recording/hash; service copies/validates bytes and records provenance separately. | Complete state, identity, size and hash checked. Canonical idempotent identity prevents duplicate handoff; changed/corrupt source is refused; existing evidence preserved. Private copy is not disclosure approval. | E14/E16 |
| Station completed-recording YouTube upload — confirm_first | Staff approves title, privacy (private default), note and idempotency key; durable queue executes later under Station OAuth. | Source hash checked at queue and worker. Different body under same key refused; second upload for recording refused. Preparation failure retry allowed; uncertain external attempt/restart becomes `needs-reconciliation`, requiring YouTube inspection rather than blind retry. Acknowledgement is not finished playback/processing proof. | E13/E16 |
| Optional live encrypted SRT — confirm_first; PEG take-to-air — human_only | Staff selects preconfigured feed with live capture; sender automatically streams to paired separate CivicCast. PEG operator chooses cable output. | Stop live capture via Station; receiver loss does not recall sent bytes. No verified general upload-cancel UI or universal AI kill switch. | E13/E16 |

**Approval summary:** Human-only decisions include response approval, release/withhold/redact judgment, fulfillment, minutes review/adoption, legal adoption/codification, official permitting/inspection decisions and PEG take-to-air. Explicit staff requests authorize draft saves, analysis, packets, handoff and delivery; approval of a job is not AI choosing the job. Agency approval of a deployment is a separate, currently uncompleted decision.

## All 47 framework fields

Public-layer fields are marked ▲. Values below describe this draft's stated boundary. Agency-specific blanks are intentional.

### 1.1 Name ▲
**Status: answered.** Townlight Beta 1 — shared municipal staff-assistance platform, Station delivery cohort. Individual commissioned AI uses must retain inventory IDs and agency context. E15/E17.

### 1.2 Plain-language description ▲
**Status: answered.** Townlight helps municipal staff organize records, meetings, code, land-use work and inspection evidence, with selected AI drafting and analysis assistance. Staff retain decisions and review outputs; Station records and transfers approved media through a separate operational boundary. A beta release and synthetic acceptance do not establish a city deployment. E1–E17.

### 1.3 Purpose ▲
**Status: answered.** Prepare reviewable information and drafts, preserve sources and decisions, and support staff-directed evidence/export workflows. Uses A1–A12 identify AI separately from the deterministic product work. No authority to issue permits, make legal determinations or take PEG to air is delegated to a model. E2/E5–E14.

### 1.4 Agent type ▲
**Status: answered.** `assistant_copilot` for the inventoried AI assistance. The parent platform is not asserted to be an autonomous single agent, agent service or orchestrator/subagent system. Ordinary workers do not change this classification. Agency confirms selected integrations. E1/E8/E10–E13.

### 1.5 Location ▲
**Status: unknown.** Agency installation/service/public URL is not assigned. Technical reference: Windows desktop and local runtime, default loopback host `127.0.0.1:15480`; database and inference endpoints are configured separately; Station requires explicit pairing. Public [source organization](https://github.com/townlight) and [release](https://github.com/townlight/townlight/releases/tag/townlight-beta-1-station-delivery) are distribution locations, not municipal service endpoints. E1/E13/E17.

### 2.1 Capabilities
**Status: answered.** `information_drafting` and `data_analysis` apply to the AI functions. `business_transaction` also describes their bounded database effects, such as saving a generated draft/review/flag after request. Official communication can result when staff reuse outputs, but autonomous AI sending is not established. Station media transfer is not model `physical_actuation`; no AI arbitrary computer-use or code-execution capability was identified. Confirm categories per selected use. E1–E3/E8/E10/E11/E13.

### 2.2 Capability specifics
**Status: answered.** Inventory and action table specify inputs, outputs and writes: response drafts, image observations, transcripts, accessibility advice, rewrites, conditional cited answers, search synthesis and flags. Conventional export, evidence handoff and delivery are separately attributed. No model is shown deciding to publish or enforce. E1–E14.

### 2.3 Models and versions
**Status: unknown.** No agency active-model inventory exists. Available pinned native model identity is recorded above; conditional Records/Code/Meetings and vision/transcription paths have separate selections. Registry/provider support is not deployment selection. Record exact model revision/hash, endpoint, runtime version, asset terms and configured permissions for each enabled use; nullable registry version is insufficient by itself. E1/E6/E8/E11/E12.

### 2.4 Hosting and platform
**Status: unknown.** `on_premises` is a supported Windows/local-runtime arrangement; `hybrid` may describe an agency that enables remote inference or external media delivery. No hosting category is assigned to an unselected city. Native shell, Python domain services/PostgreSQL and separate Station configuration are documented; local defaults are not an enforced universal no-egress guarantee. E1/E8/E13/E15.

### 2.5 High-impact determination
**Status: unknown.** Value `not_yet_determined`. No agency determination of principal-basis reliance exists. If AI materially forms the principal basis for a consequential records, land-use or enforcement decision, human sign-off does not remove the framework's High-impact classification. This applies the card's question, not a conclusion that a federal memorandum legally governs every municipality.

### 2.6 Determination record
**Status: not in place.** No official role, date, rationale or signed determination was inspected. Agency must supply it for selected use and actual reliance; the policy template is not an adopted determination. E18.

### 3.1 Data sensitivity
**Status: unknown.** Actual most-sensitive operating input is unclassified. Synthetic test data is not a production classification. Requester text, exemption material, images, voices and staff-pasted content may be `personal_pii` or `sensitive`, to be selected from actual data. Public source documents do not make personal user prompts public. E2/E8/E10/E11.

### 3.2 Datasets and source of truth
**Status: unknown.** Agency must name adopted code/plan/requirements versions, jurisdiction/effective dates, records corpus, meeting material and inspection evidence. Software supports source identity, hashes, citations and availability checks; hashes prove byte identity, not legal authority or relevance. No Longmont dataset is nominated. E2/E5–E9/E14.

### 3.3 Reachable tools, systems and APIs
**Status: unknown.** Reviewed reach is tabulated above: local domain DB/files, configured model endpoints, native bridges, optional authenticated web routes, Station origins, Google OAuth/upload and paired SRT. These are application resources, not an LLM-selected tool belt. Agency must enumerate effective network destinations, database/filesystem privileges, service/OAuth accounts, scopes and any extra integrations. No complete deployment IAM/egress inventory was inspected. E1/E4/E8/E11/E13/E14.

### 4.1 Highest autonomy ▲
**Status: answered.** `acts_with_approval` describes traced native AI workflows when a staff request authorizes automatic draft/review persistence. It would be inaccurate to call all of them “informs only” because they write records. A2/A3/A6 can return information without immediately saving a decision. No autonomous model-selected release/enforcement/delivery was identified. Agency must check the highest level across its actual selected routes, including any unattended ingestion it enables. E1–E3/E8–E11.

### 4.2 Reversibility
**Status: answered.** Conservative shared downstream boundary: `hard_to_reverse` once released material is seen or relied upon, uploaded video is accessed, or live bytes are broadcast. Draft text is editable, and internal data can be restored within accepted scope; those controls do not recall disclosures or erase consequences. Do not attribute non-AI Station effects to AI autonomy; a selected draft-only addendum may justify a narrower value. E3/E13–E16.

### 4.3 Maximum consequence severity
**Status: unknown.** Population/record count, reliance and permitted uses are not defined. Wrong guidance people act on may meet `serious`; loss of a right or physical harm could meet `severe`. Internal limited drafts do not establish either outcome. No numerical scale or low consequence is invented from beta status.

### 4.4 Safety red-line
**Status: unknown.** A1/A2/A7/A8 can encounter untrusted content and protected data; bounded saves can follow a requested operation without further content review. No model tool-selection loop was found, but a universal “no” requires mapping the exact selected workflow and what human approval covers. No deployment-wide trifecta/compensating-control analysis exists. Explicit review, scope/source gates and process boundaries are evidenced; their existence does not establish complete injection resistance. E2–E4/E8/E11–E14.

### 4.5 Stop and override
**Status: answered.** Staff can reject/edit drafts and withhold approval/export; authenticated requests depend on current account/session validity. Station exposes live stop and upload outcomes requiring reconciliation; transcription/process timeouts bound relevant jobs. No universal AI cancellation mechanism or performed agency incident stop drill is established. Signing out does not revoke a previously approved queued upload, and a stop cannot recall disclosed bytes. Agency supplies who stops each enabled service and how work resumes safely. E3/E4/E8/E13/E16.

### 5.1 Base risks
**Status: answered.** `confabulation_inaccurate_output`, `harmful_bias`, `data_privacy`, `information_security` apply to selected AI assistance; include mistranslation, omitted evidence, incorrect visual/transcript observations and staff over-reliance. These are plausible use risks, not measured failure rates or a completed agency risk register. E2/E8/E10–E12/E18.

### 5.2 Agentic hazards
**Status: answered.** Prompt injection through source/request text; overbroad access (native installation-wide Records); harmful downstream disclosure if staff approve unsuitable material; persisted misleading drafts/flags; uncertain external delivery. No dynamic AI delegation was identified, so multi-agent cascading privilege is not claimed. Context sanitization exists in shared/Records client paths, but native A1 does not automatically inherit every shared sanitizer. E1–E4/E11–E14.

### 5.3 Evaluation performed
**Status: answered.** Yes: retained selected functional and installed synthetic evaluations, including original all-nine workflow/recovery acceptance and 13 Station update checks, linked in E15/E16. The original documentation pass ran no new evaluation; the subsequent authorized correction adds the narrow synthetic backend regression evidence E19. No field accuracy/fairness study, comprehensive adversarial evaluation, new real YouTube upload or physical PEG test is established. “Yes” is limited to the evaluations described, not completion of all High-impact practices.

### 5.4 Public summary ▲
**Status: answered.** Product summaries/manuals were publicly delivered at [Townlight manuals](https://townlight.github.io/manuals/suite.html), with retained publication verification E17. This technical draft is not an agency-approved card. Agency-owned public summary and contact remain unestablished; current website availability was not freshly checked.

### 5.5 Disclosure ▲
**Status: unknown.** Selected staff routes label local AI, samples, unavailable output and review-required drafts. No universal public interaction disclosure was verified. If an agency confirms a staff-only use with no direct public AI interaction, the framework allows `not applicable` for that addendum; downstream affected people still belong in 11.2. Resident delivery/reuse and language/accessibility disclosure need agency confirmation. E2/E6/E8/E10/E11.

### 6.1 Accountable operational role ▲
**Status: unknown.** No deploying agency has assigned an accountable role. Software maintainer, signing publisher and local system administrator are not automatically that public official. E18.

### 6.2 Deploying agency/unit and contact ▲
**Status: unknown.** No commissioned agency/unit, operating address or public contact exists in reviewed evidence. Do not substitute Longmont, a GitHub issue tracker or a private developer contact.

### 6.3 Supplier and exit basics
**Status: answered.** Townlight is maintained in the public Townlight source repositories; owned source/documentation use AGPL-3.0-only. No city supplier contract/support undertaking is established. Source/local data/provider interfaces support switching, but a replacement model needs rights/configuration and use evaluation; platform migration and vendor support continuity are untested as a complete exit. Third-party grants remain separate. E12/E15/E17 and 12.3.

### 7.1 Government function ▲
**Status: answered.** Parent reference category `administrative_functions` for shared staff records/meeting/document workflows. Agency should choose the single best category for each commissioned context, potentially `service_delivery` for applicant guidance. This draft does not assign actual law-enforcement use simply because Inspections exists.

### 7.2 Lifecycle ▲
**Status: answered.** `pre_deployment` for the agency context represented by this draft. Software is a publicly released beta; synthetic acceptance is not a limited live municipal pilot. No agency is represented as deployed. E15–E17.

### 8.1 Acting identity
**Status: unknown.** Actual deployment accounts are not inventoried. Native staff proof maps to an active DB actor with current role/module checks; model HTTP calls execute in application processes. Station workers use separately configured storage/database and Station-only OAuth for Google, while job creator records the initiating human. Neither a model label nor a service account alone identifies the principal. E1/E4/E13/E14.

### 8.2 Human principal
**Status: unknown.** Traced actions record initiating staff/approver identities where noted; agency must assign sponsor and authorized operators for each use. No named human or organizational delegation has been invented. E2–E5/E9/E13/E14.

### 8.3 Authorized task/resource scope
**Status: answered.** Source supports module/capability/authentication gates and explicit configured integration origins. Native city-staff has broad enabled-module access; native Records access is installation-wide. Web department guards are a different boundary. No claim of per-department native least privilege or an agency authorization exists; agency must decide whether these scopes fit its proposed dataset. E4/E13/E14.

### 8.4 Subagents
**Status: answered.** No dynamic creation of AI subagents was identified in the inventoried native generation/analysis paths. Ollama, transcription subprocesses, job workers and CivicCast media transfer are not automatically AI delegation. A complete deployment answer must revisit any extra tools/integrations; this source finding does not certify future configurations. E1/E8/E13.

### 8.5 Human traceability
**Status: answered.** Yes, in reviewed request/approval/revision/handoff/delivery actions through authenticated actor IDs, reviewer fields and job creator/approval metadata. This is not uniform per-inference provenance or proof that a typed reviewer label is independently authenticated. Supporting AI outputs and separate web paths have varying metadata completeness. E2–E5/E9–E14.

### 9.1 Automation boundary
**Status: answered.** The action-and-approval table is this field's answer. Explicit requests can initiate automatic inference, persistence or queued non-AI delivery; neither those automatic steps nor a background process imply the model independently selected the action.

### 9.2 Mandatory human decisions
**Status: answered.** See the table's approval summary and route-specific qualifications. Native current-text approval is concrete enforcement; staff-review disclaimers in other paths are not equivalent technical gates. C1 limits fulfillment evidence freshness in the published beta; E19 verifies the narrow correction in the corrected source candidate. Agency must define who is authorized to approve; two-person separation is not universally enforced.

### 10.1 Logs and reconstruction
**Status: answered.** Records has hash-linked actor/action events; relevant revisions and media copies retain hashes; Meetings retains source/model/prompt/approver metadata and decision history; Station retains approved job/source/receipt details. Uniform prompts, responses, model revisions, token usage and autonomous-versus-directed labels across all inference paths are not established. Hash-linked databases do not prevent a privileged party rewriting a whole chain. AI flags in A7/A9 can include unavailable/template outcomes. Agency retention, access and reconstruction procedure are unknown. E2/E5/E9–E14.

### 10.2 Live monitoring and alerts
**Status: not in place.** No agency AI-risk alert routing, thresholds, named recipient or response evidence was inspected. Runtime health, errors and durable delivery status provide operational signals but are not proof of AI quality/privacy monitoring that reaches a responder. E1/E13/E18.

### 10.3 Oversight cadence
**Status: not in place.** No performed operational review or adopted `event_triggered`, `periodic_interval` or `continuous` schedule was evidenced. Agency records owner, frequency and review evidence proportionate to selected use; no schedule is fabricated from the template. E18.

### 10.4 Independent review
**Status: not in place.** No assigned reviewer outside the build team or signed independent review was inspected. This technical draft and prior development acceptance do not constitute independent agency review.

### 10.5 Reassessment triggers
**Status: not in place.** No agency-adopted trigger rule is evidenced. Proposed commissioning rule: reassess material changes to model/version/provider or hosting, sources/sensitivity, effective access/tools, public audience, reliance/decision purpose, autonomy, export/delivery behavior, or a serious incident/evaluation failure. Routine unchanged documentation edits do not automatically invalidate signed artifacts. Agency must adopt or amend this rule.

### 11.1 Appeal route ▲
**Status: not in place.** No deployment-specific route was supplied or inspected. Agency identifies existing records, permit, inspection or other lawful complaint/appeal route, contact, human review process and next step for affected people. Staff edits and GitHub issues do not substitute for resident redress. A new portal is not assumed.

### 11.2 Affected people ▲
**Status: answered.** Depending on enabled context: municipal staff; requesters and records subjects; meeting speakers/attendees and viewers; residents relying on published explanations/translations; applicants, property owners/occupants and inspected persons; officials relying on minutes or case workpapers. Indirect recipients can be affected without interacting with a model. Actual populations, languages and scale remain agency inputs.

### 11.3 Fully automated consequential decisions
**Status: not applicable.** Within the traced native use boundary, final legal/release/permit/enforcement decisions are not delegated to AI without human review. This answer does not make materially influential advice low impact and does not excuse errors in automatic draft saves. If the selected deployment authorizes unreviewed consequential decisions, this answer ceases to apply and the agency must identify additional safeguards; none are claimed here. E2–E9.

### 12.1 Procurement and data-access terms
**Status: unknown.** No agency procurement route, contracted supplier, data-processing agreement or approved model/service terms were inspected. Public AGPL distribution is not an agency contract. Agency records external provider/Google terms, data access/retention/training conditions and support responsibilities for selected services.

### 12.2 Expected value
**Status: unknown.** Intended benefits are less repetitive drafting/retrieval and more traceable staff work. No measured baseline, time saved, error reduction or cost comparison is established. Selected pilot should compare against its existing human process, including review/correction time and model/operating costs. Functional success is not a savings result. E15/E16.

### 12.3 Exit checklist
**Status: unknown.** Item-by-item technical starting point and unresolved agency/contract answer:

| Framework exit item | Evidence-backed answer and limit |
|---|---|
| Knowledge transfer | Public source/manuals/build companions exist (E15/E17); deployment runbook, trained successor and support handover not established. |
| Data + model portability, including prompts/traces/fine-tunes/vector stores | Local DB/files, originals and tested bounded backup/restore help. Full export/reimport of every prompt/trace/vector store and external provider state not demonstrated. No fine-tuning deployment was identified; agency confirms whether fine-tunes exist before marking that subitem not applicable. E12/E15. |
| Licensing/pricing transparency | Owned-source AGPL and retained third-party notices; no complete selected model/service license and price schedule or operating-cost inventory. Native manifest license label is not a substitute for acquired terms. |
| Code/model rights | Owned code available under AGPL-3.0-only; third-party models/media/transcription assets have separate grants. Rights to any commissioned derivatives or fine-tunes remain unknown. |
| Vendor-change notice | No agency contract or notice commitment inspected; repository history is not a supplier notice obligation. |
| Rollback and closeout | Selected local recovery acceptance exists, not a complete vendor exit. Agency must cover credentials, supplier copies/retention, preserved records and continuity; public disclosure/broadcast effects cannot be rolled back by database restore. E13/E15/E16. |

## Provisional impact reasoning — no final suite-wide tier

No derivation engine was installed or run. The six inputs remain bounded as follows: 2.5 not yet determined; 3.1 unknown; 4.1 acts with approval for traced native writes; 4.2 hard to reverse at downstream disclosure boundary; 4.3 unknown; 4.4 unknown. Under the captured framework's written rules, an unknown operational input prevents Low and floors a provisional assessment at Moderate; personal/sensitive input and approved actions independently support Moderate. A High-impact determination, unresolved red-line, or relevant unapproved high-consequence action could raise it to High. This is manual provisional reasoning, **not an engine-derived or final deployment result**.

Agency must settle actual data, scope, reliance, scale, autonomy and red-line analysis per selected context. If it adopts the framework's High-impact recommendations, the listed minimum practices must be evidenced for that use; this draft does not claim them fulfilled or turn them into retrospective software release gates. Refer to the attributed framework below.

## Short use/deployment addenda

These addenda share the technical evidence above. Each is **pre-deployment, uncommissioned**; accountable role/contact, active model/hosting, authorized data, impact determination, reviewer and incident/appeal procedure remain unknown/not in place as in the parent. They are contexts, not nine manufactured agents.

| Addendum | Distinct purpose/data/consequence | Boundary and agency completion |
|---|---|---|
| U1 Records assistance (A1 and only selected A7–A10/A12) | Potential personal/privileged corpus; legal release/withhold consequences; drafting can influence rights to records. Setup interview can be recorded as a separate low-consequence sub-use if selected. | Name native versus web/worker route, corpus/access scope and active models separately. Confirm review/release procedure and C1 exposure. Do not infer that all web routes/workers are operational or share native gates; commissioned scheduled indexing needs its own autonomy answer. Function normally administrative_functions. |
| U2 Inspection evidence assistance (A2/A3) | Images/voices/property conditions; errors may influence enforcement or safety decisions even with inspector signature. | Name vision/transcription assets, authorized image/audio classes and provider destinations. Inspector owns findings; analyzed workpaper stays distinct from reviewed Records summary. Determine actual reliance and relevant visual/speech conditions. |
| U3 Staff document language/accessibility assistance (A4/A5) | Public communications, translation meaning and access to services; staff may paste internal data. | Select staff-only use and publication review by qualified staff. Deterministic checks and AI advice remain separate. No accessibility certification or universal disclosure inferred. Function normally administrative_functions. |
| U4 Optional model-assisted Code or Meetings (A6/A11, only if enabled) | Code interpretation can influence land-use behavior; minutes can influence official records and later actions. Different authorities/data justify separate selected-use entries when commissioned. | A6 native public page is deterministic; A11 is not native AI minutes. Agency documents actual surface, sources, adoption/review responsibility and model. Deterministic Planning/Zoning/Permitting remain outside model-use classification unless actual configuration changes. |
| M1 Media delivery dependency (non-AI Station) | Meeting recordings may expose personal/restricted speech; YouTube visibility and SRT/broadcast have hard-to-reverse effects. | Record Station OAuth account/scopes, receiver, feed approval and PEG operating authority. This is a delivery/control addendum, not an AI-subagent card. No real city, real upload or physical broadcast validation claimed. |

## City commissioning worksheet

No city credentials or data are needed to finish this draft. For a future agency, record the following in this same record or its existing governance register before treating the draft as the agency's answer. Existing procedures can satisfy these needs; no new application subsystem is prescribed.

| Agency-owned entry | Current state / completion evidence |
|---|---|
| Accountable role; operating owner; public contact | Unknown. Provide role titles, unit and reachable published contact; distinguish system accountability from action principals. |
| Selected pilot/use and audience | Unknown. Select inventory IDs/addendum, staff/public interface, decision purpose and population. Longmont remains only a possibility. |
| Enabled models, hosting and endpoints | Unknown. Record actual model/version/hash/runtime/license, enabled routes, local/remote destinations and service boundary; do not list every supported provider as active. |
| Authorized data and effective access | Unknown. Name sources, jurisdiction/effective revisions, sensitivity/retention and permitted roles/resources. Decide whether installation-wide native access is acceptable for the selected data. |
| Impact determination | Not in place. Official role/date/rationale; actual principal-basis reliance, scale, reversibility and red-line inputs; retain manual/engine method honestly. |
| Reviewer and oversight | Not in place. Assign appropriate reviewer, review frequency and records; identify incident responder and observable alert/escalation route. |
| Complaint/appeal route | Not in place for this record. Attach existing procedure/contact, human reconsideration step and public feedback route where applicable. |
| Operator training and stop/escalation | Not in place. Document review obligations, unavailable/fallback handling, C1 awareness, service/job-specific stop and safe recovery, including uncertain external delivery. No universal stop guarantee. |
| Reassessment | Not adopted. Confirm triggers proposed in 10.5 and record changes to uses/configuration; preserve unchanged acceptance evidence where appropriate. |
| Procurement/exit and agency verification | Unknown. Complete 12.1/12.3 and verify/finalize the agency card; this draft supplies no approval signature. |

## Remaining evidence, proportionate to a selected pilot

**Already evidenced, within limits:** retained selected first-run/authentication/permission refusal, all-nine staff workflows and bounded backup/restore; Station update's 13 installed checks, exact media integrity/private idempotent handoff, live received synthetic SRT bytes and actual donor upload client against mocked Google acknowledgements. E15/E16. No broad rerun is proposed.

No pilot is selected, so the following is a conditional evidence menu, not newly required beta work. Apply only the rows relevant to the agency's selected use and impact determination; no work here has been executed or authorized as implementation.

| Unresolved evidence | Narrow scope if selected; decision/evidence to retain |
|---|---|
| Accuracy and source fidelity | A1: compare drafts to supplied request/source facts; A2/A3: compare observations/transcripts to known synthetic image/audio truth under representative conditions; A4: preserve dates/amounts/meaning in selected languages; A6/A11: citation and source faithfulness. Record reviewer corrections and unacceptable error criteria. No universal benchmark required. |
| Fairness/accessibility | Identify actually affected populations/languages/conditions first; evaluate only relevant error disparities or accessibility/language barriers. No claim that synthetic workflow success establishes fairness. |
| Adversarial input | Selected route with synthetic untrusted text/image/transcript and sensitive placeholders: observe whether it alters instructions, drafts or data exposure. Distinguish native A1 from shared sanitizer paths. Agree acceptable behavior and evidence; no comprehensive red-team claim. |
| Operational review/alerts | Identify signals an operator will inspect, escalation threshold, recipient and response record for selected use. Existing agency channels may suffice; a software alert subsystem is not prescribed. |
| Stop/recovery | Selected-use procedure and bounded evidence for interruption, refusing further action and recovery; retain uncertainty for externally delivered content. Reuse existing unchanged recovery/Station receipts. |
| Control issue C1 | Reproduction and the narrow source correction are complete under E19. If deploying an installer, do not assume the published MSI includes the fix; delivery and installed acceptance of a corrected installer remain separate future work, not performed here. |
| Value/exit | Compare selected pilot with existing human process, including correction effort/cost; exercise only exit elements actually needed for that use rather than claim complete portability from backup alone. |

### C1 disposition: reproduced and corrected in source; published beta unchanged

The published implementation's `artifacts.fulfill` checks current response approval but then accepts any completed response artifact and release package. The regression reproduced the exact stale-export sequence through the real authenticated API on the unchanged baseline: export A, edit/approve B, then fulfill without exporting B. HTTP 200 was observed where refusal was expected.

Corrected commit `d10cafb913bc51e2edccc4272020d094f6064085` adds a response-hash predicate to the completed-artifact selection. Both artifact kinds must match `req.approved_response_sha256`, which is first checked against the actual response text by `require_current_approval`. The same filtered response list forms the fulfillment receipt. No historical artifact/file is deleted, and no schema or package-version change is required.

E19 records 13 passing affected tests, including both-stale and each mixed-current/stale combination, successful fulfillment after both current exports, preserved historical bytes/rows and exclusion of historical paths from the fulfillment receipt. This is backend source/API evidence, not installed-machine evidence. The published MSI and its historical acceptance are unchanged; no replacement build/signing/release occurred.

The narrower existing design limit remains: approval hashes response text, not all supporting context. This correction does not expand that policy. Native installation-wide access, uneven inference provenance and missing agency governance are separate documented limits, not defects claimed fixed here.

## Evidence register and exact source versions

Each E-reference below names the inspected implementation and relevant symbols. Public links use immutable source commits from the retained source map. Local source roots and full tree identities follow. Receipt links are evidence of prior execution, not tests executed in this task.

### E1 — Native composition and local text inference

- [townlight/desktop/runtime/python-services/civicsuite_runtime/services.py](https://github.com/townlight/townlight/blob/45bb73df5f78443299bcba9af61da3380199720b/desktop/runtime/python-services/civicsuite_runtime/services.py) — `_set_local_defaults, create_runtime_app`.
- [townlight/desktop/src-tauri/src/domain_client.rs](https://github.com/townlight/townlight/blob/45bb73df5f78443299bcba9af61da3380199720b/desktop/src-tauri/src/domain_client.rs) — `execute RecordsRequest::Suggest; execute_access Rewrite/Review branches`.
- [townlight/desktop/src-tauri/src/model.rs](https://github.com/townlight/townlight/blob/45bb73df5f78443299bcba9af61da3380199720b/desktop/src-tauri/src/model.rs) — `generate_local_text, local_generation_request_body, local_model_ready`.
- [townlight/desktop/runtime/gemma4-model.json](https://github.com/townlight/townlight/blob/45bb73df5f78443299bcba9af61da3380199720b/desktop/runtime/gemma4-model.json) — `pinned source/model/artifact metadata`.
- [townlight/desktop/src-tauri/src/first_run.rs](https://github.com/townlight/townlight/blob/45bb73df5f78443299bcba9af61da3380199720b/desktop/src-tauri/src/first_run.rs) — `defer-model and health/readiness branches`.

### E2 — Native Records draft context, save and attribution

- [sunshine/backend/app/desktop_bridge/router.py](https://github.com/townlight/sunshine/blob/dddb86c4bf1b8aaa365ab475a1ffffd67c13ee3e/backend/app/desktop_bridge/router.py) — `native_draft_context, native_generated_draft; native installation-wide scope`.

### E3 — Records approval, decisions and export/fulfillment

- [sunshine/backend/app/requests/workflow.py](https://github.com/townlight/sunshine/blob/dddb86c4bf1b8aaa365ab475a1ffffd67c13ee3e/backend/app/requests/workflow.py) — `replace_response_text, stamp_response_approval, approve_response, record_exemption_decision`.
- [sunshine/backend/app/requests/artifacts.py](https://github.com/townlight/sunshine/blob/dddb86c4bf1b8aaa365ab475a1ffffd67c13ee3e/backend/app/requests/artifacts.py) — `require_current_approval, prepare_artifact, complete_artifact, verify_export, fulfill`.

### E4 — Identity and audit boundaries

- [sunshine/backend/app/auth/desktop_session.py](https://github.com/townlight/sunshine/blob/dddb86c4bf1b8aaa365ab475a1ffffd67c13ee3e/backend/app/auth/desktop_session.py) — `_ROLE_MODULES, validate_native_session`.
- [sunshine/backend/app/auth/native_identity.py](https://github.com/townlight/sunshine/blob/dddb86c4bf1b8aaa365ab475a1ffffd67c13ee3e/backend/app/auth/native_identity.py) — `mapped_native_actor`.
- [sunshine/backend/app/audit/logger.py](https://github.com/townlight/sunshine/blob/dddb86c4bf1b8aaa365ab475a1ffffd67c13ee3e/backend/app/audit/logger.py) — `write_audit_log, verify_chain`.

### E5 — Meetings native manual route and optional product assist

- [townlight/desktop/runtime/python-services/civicsuite_runtime/meetings_bridge.py](https://github.com/townlight/townlight/blob/45bb73df5f78443299bcba9af61da3380199720b/desktop/runtime/python-services/civicsuite_runtime/meetings_bridge.py) — `create_minutes, decide_minutes, capture_transcript, archive paths`.
- [meetings/civicclerk/main.py](https://github.com/townlight/meetings/blob/581ca739e03e7a4d1161cd8c5edf1d36115f9ee6/civicclerk/main.py) — `create_minutes_ai_assist, _request_ollama_minutes_text, reject_automatic_minutes_posting`.
- [meetings/civicclerk/minutes.py](https://github.com/townlight/meetings/blob/581ca739e03e7a4d1161cd8c5edf1d36115f9ee6/civicclerk/minutes.py) — `MinutesDraftRepository.create_draft, human_decision and citation/prompt validation`.

### E6 — Code citation answers and legal lifecycle

- [townlight/desktop/runtime/python-services/civicsuite_runtime/code_bridge.py](https://github.com/townlight/townlight/blob/45bb73df5f78443299bcba9af61da3380199720b/desktop/runtime/python-services/civicsuite_runtime/code_bridge.py) — `questions`.
- [townlight/desktop/runtime/python-services/civicsuite_runtime/code_public.py](https://github.com/townlight/townlight/blob/45bb73df5f78443299bcba9af61da3380199720b/desktop/runtime/python-services/civicsuite_runtime/code_public.py) — `answer: use_local_llm=False`.
- [ordinances/civiccode/main.py](https://github.com/townlight/ordinances/blob/04c383be7798c51dcb14ec8bea47d9c81436127d/civiccode/main.py) — `answer_question`.
- [ordinances/civiccode/qa_harness.py](https://github.com/townlight/ordinances/blob/04c383be7798c51dcb14ec8bea47d9c81436127d/civiccode/qa_harness.py) — `build_grounded_answer`.
- [ordinances/civiccode/ai_answer.py](https://github.com/townlight/ordinances/blob/04c383be7798c51dcb14ec8bea47d9c81436127d/civiccode/ai_answer.py) — `load_local_llm_config, generate_local_llm_answer`.
- [ordinances/civiccode/section_lifecycle.py](https://github.com/townlight/ordinances/blob/04c383be7798c51dcb14ec8bea47d9c81436127d/civiccode/section_lifecycle.py) — `create_version, lookup_section`.

### E7 — Deterministic land-use context and reviewed Planning snapshots

- [zone/civiczone/discretionary.py](https://github.com/townlight/zone/blob/fbebd695a67b2f5cbec088f12f443311b6dd0b9f/civiczone/discretionary.py) — `explain, flag_nonconformity`.
- [plan/civicplan/policy_service.py](https://github.com/townlight/plan/blob/d463bd6b8e7acd1fe553ba433ee12736c3d55625/civicplan/policy_service.py) — `PolicyService.answer, resolve`.
- [plan/civicplan/workflow_store.py](https://github.com/townlight/plan/blob/d463bd6b8e7acd1fe553ba433ee12736c3d55625/civicplan/workflow_store.py) — `preview_snapshot, snapshot, document`.
- [townlight/desktop/runtime/python-services/civicsuite_runtime/permitting_bridge.py](https://github.com/townlight/townlight/blob/45bb73df5f78443299bcba9af61da3380199720b/desktop/runtime/python-services/civicsuite_runtime/permitting_bridge.py) — `pathway`.
- [permit/civicpermit/pathway.py](https://github.com/townlight/permit/blob/3d1bc2549da40f7a73954a2d10cc6bf8f5f680a9/civicpermit/pathway.py) — `explain_pathway; optional provider contract`.

### E8 — Inspection media analysis and configuration

- [townlight/desktop/runtime/python-services/civicsuite_runtime/inspections_bridge.py](https://github.com/townlight/townlight/blob/45bb73df5f78443299bcba9af61da3380199720b/desktop/runtime/python-services/civicsuite_runtime/inspections_bridge.py) — `media_analyse, retain`.
- [inspect/civicinspect/adapters.py](https://github.com/townlight/inspect/blob/b7a28525828306513c21a07efe4b892e6249846f/civicinspect/adapters.py) — `configured_vision_provider, configured_transcription_provider`.
- [inspect/civicinspect/media_analysis.py](https://github.com/townlight/inspect/blob/b7a28525828306513c21a07efe4b892e6249846f/civicinspect/media_analysis.py) — `retain_evidence, analyse_evidence, SYSTEM_PROMPT`.
- [inspect/civicinspect/transcription.py](https://github.com/townlight/inspect/blob/b7a28525828306513c21a07efe4b892e6249846f/civicinspect/transcription.py) — `TextFlowKitTranscriptionProvider.transcribe_sync, transcribe`.

### E9 — Reviewed case revisions and packets

- [inspect/civicinspect/workflow_store.py](https://github.com/townlight/inspect/blob/b7a28525828306513c21a07efe4b892e6249846f/civicinspect/workflow_store.py) — `save_case, get_case, packet, _verified_analysis`.
- [permit/civicpermit/workflow_store.py](https://github.com/townlight/permit/blob/3d1bc2549da40f7a73954a2d10cc6bf8f5f680a9/civicpermit/workflow_store.py) — `save_case, packet`.

### E10 — Supporting Access functions in the native suite

- [townlight/desktop/runtime/python-services/civicsuite_runtime/access_bridge.py](https://github.com/townlight/townlight/blob/45bb73df5f78443299bcba9af61da3380199720b/desktop/runtime/python-services/civicsuite_runtime/access_bridge.py) — `review_context, save_review, rewrite_context, rewrite_result, delete_review`.

### E11 — Conditional Records web/API model functions

- [sunshine/backend/app/main.py](https://github.com/townlight/sunshine/blob/dddb86c4bf1b8aaa365ab475a1ffffd67c13ee3e/backend/app/main.py) — `create_app router mounts; separate lifespan`.
- [sunshine/backend/app/search/router.py](https://github.com/townlight/sunshine/blob/dddb86c4bf1b8aaa365ab475a1ffffd67c13ee3e/backend/app/search/router.py) — `execute_search`.
- [sunshine/backend/app/search/engine.py](https://github.com/townlight/sunshine/blob/dddb86c4bf1b8aaa365ab475a1ffffd67c13ee3e/backend/app/search/engine.py) — `hybrid_search`.
- [sunshine/backend/app/search/synthesizer.py](https://github.com/townlight/sunshine/blob/dddb86c4bf1b8aaa365ab475a1ffffd67c13ee3e/backend/app/search/synthesizer.py) — `synthesize_answer`.
- [sunshine/backend/app/exemptions/router.py](https://github.com/townlight/sunshine/blob/dddb86c4bf1b8aaa365ab475a1ffffd67c13ee3e/backend/app/exemptions/router.py) — `scan_for_exemptions`.
- [sunshine/backend/app/exemptions/llm_reviewer.py](https://github.com/townlight/sunshine/blob/dddb86c4bf1b8aaa365ab475a1ffffd67c13ee3e/backend/app/exemptions/llm_reviewer.py) — `llm_suggest_exemptions`.
- [sunshine/backend/app/requests/router.py](https://github.com/townlight/sunshine/blob/dddb86c4bf1b8aaa365ab475a1ffffd67c13ee3e/backend/app/requests/router.py) — `generate_response_letter, _try_llm_generation`.
- [sunshine/backend/app/onboarding/router.py](https://github.com/townlight/sunshine/blob/dddb86c4bf1b8aaa365ab475a1ffffd67c13ee3e/backend/app/onboarding/router.py) — `get_next_question`.
- [sunshine/backend/app/llm/client.py](https://github.com/townlight/sunshine/blob/dddb86c4bf1b8aaa365ab475a1ffffd67c13ee3e/backend/app/llm/client.py) — `_get_provider, generate`.
- [sunshine/backend/app/ingestion/tasks.py](https://github.com/townlight/sunshine/blob/dddb86c4bf1b8aaa365ab475a1ffffd67c13ee3e/backend/app/ingestion/tasks.py) — `task_ingest_file`.
- [core/civiccore/ingest/embedder.py](https://github.com/townlight/core/blob/f643c26b3429b1ab9202d0663e1e700b83fc4ed4/civiccore/ingest/embedder.py) — `embed_text, embed_batch`.
- [core/civiccore/ingest/pipeline.py](https://github.com/townlight/core/blob/f643c26b3429b1ab9202d0663e1e700b83fc4ed4/civiccore/ingest/pipeline.py) — `ingest_file, ingest_structured_record`.
- [core/civiccore/ingest/llm_extractor.py](https://github.com/townlight/core/blob/f643c26b3429b1ab9202d0663e1e700b83fc4ed4/civiccore/ingest/llm_extractor.py) — `extract_text_from_image, extract_text_multimodal, extract_text_from_scanned_pdf`.

### E12 — Shared provider, registry and context limits

- [core/civiccore/llm/factory.py](https://github.com/townlight/core/blob/f643c26b3429b1ab9202d0663e1e700b83fc4ed4/civiccore/llm/factory.py) — `build_provider`.
- [core/civiccore/llm/registry/models.py](https://github.com/townlight/core/blob/f643c26b3429b1ab9202d0663e1e700b83fc4ed4/civiccore/llm/registry/models.py) — `ModelRegistry nullable version/license`.
- [core/civiccore/llm/context.py](https://github.com/townlight/core/blob/f643c26b3429b1ab9202d0663e1e700b83fc4ed4/civiccore/llm/context.py) — `TokenBudget, context/sanitization helpers; no monetary budget enforcement`.

### E13 — Station media and approved delivery

- [station/beta-1/townlight_station/api.py](https://github.com/townlight/station/blob/4b5afac07dda1c7f725993d06860a820959d7e06/beta-1/townlight_station/api.py) — `create_app capture routes, stop_live`.
- [station/beta-1/townlight_station/delivery.py](https://github.com/townlight/station/blob/4b5afac07dda1c7f725993d06860a820959d7e06/beta-1/townlight_station/delivery.py) — `install_delivery, process_upload, run_uploads, GoogleTransport`.
- [station/beta-1/townlight_station/boundary.py](https://github.com/townlight/station/blob/4b5afac07dda1c7f725993d06860a820959d7e06/beta-1/townlight_station/boundary.py) — `private_path, Settings.worker_environment, verify_media`.

### E14 — Private Station-to-Records handoff

- [sunshine/backend/app/desktop_bridge/station.py](https://github.com/townlight/sunshine/blob/dddb86c4bf1b8aaa365ab475a1ffffd67c13ee3e/backend/app/desktop_bridge/station.py) — `context, station_url, attach`.

### E18 — Unadopted policy template

- [sunshine/backend/compliance_templates/ai-governance-policy.md](https://github.com/townlight/sunshine/blob/dddb86c4bf1b8aaa365ab475a1ffffd67c13ee3e/backend/compliance_templates/ai-governance-policy.md) — `CITY_NAME, EFFECTIVE_DATE, APPROVING_AUTHORITY placeholders`.

### E15–E17 — Retained execution/publication evidence

- **E15:** [Original selected all-nine workflow/recovery acceptance](https://github.com/townlight/townlight/blob/townlight-beta-1/release/ACCEPTANCE.md).
- **E15:** [Workflow matrix (earlier MSI identity retained)](../beta-1/reference/workflow-matrix.json).
- **E16:** [Station delivery acceptance](../../release/ACCEPTANCE.md).
- **E16:** [13 installed checks; zero external YouTube requests](../../release/STATION-DELIVERY-INSTALLED-CHECKS.json).
- **E16:** [Station delivery artifact/source provenance](../../release/STATION-DELIVERY-PROVENANCE.json).
- **E17:** [Publication source identities](https://github.com/townlight/townlight/releases/download/townlight-beta-1-station-delivery/SOURCE-REFS.json).
- **E17:** [Retained public release response](https://github.com/townlight/townlight/releases/tag/townlight-beta-1-station-delivery).
- **E17:** Retained public Pages verification — retained privately by the maintainer; not included in this repository edition.
- **E17:** Earlier evidence assessment — retained privately by the maintainer; not included in this repository edition.
- **E17:** Retained source-tree comparison — retained privately by the maintainer; not included in this repository edition.

### Source identity table

These are the baseline trees checked clean on 2 November 2026; the corrected Records source is separately identified in E19. Source links above use the publication merge identity, not a claimed installer build commit.

| Repository | Local inspected HEAD | Git tree | Publication merge reference |
|---|---|---|---|
| townlight/core | `6c3f340c530cd1972f3016924111f3f32a59012b` | `0a23538131cdb18e19ffc6e73cd229860ba87b34` | `f643c26b3429b1ab9202d0663e1e700b83fc4ed4` |
| townlight/sunshine | `24a919c2bfcb8b720598ac94de2982f6171f452d` | `bec5bbcd4950fad2086c87a13100d8d38edbfdcf` | `dddb86c4bf1b8aaa365ab475a1ffffd67c13ee3e` |
| townlight/meetings | `e02710c182e237bbc9379185bb4028dd76ea5b4e` | `80a108b356383290f18810846dddfa555e6abf80` | `581ca739e03e7a4d1161cd8c5edf1d36115f9ee6` |
| townlight/ordinances | `3ae4bff40ecc7603b125bcd66ce78184381838a7` | `8123797474130209661e02eab0e72df8f09b08dc` | `04c383be7798c51dcb14ec8bea47d9c81436127d` |
| townlight/zone | `df8d5aa974428baf9d4e728457f9a1e3963538cf` | `054752b434bbf4fb1d50bffe48bbbf2eef53f16a` | `fbebd695a67b2f5cbec088f12f443311b6dd0b9f` |
| townlight/plan | `bf393e19015feaf6fbd060130e5e50b013460f56` | `bca1e334580fa4611eaac62132fbb19903e03ff6` | `d463bd6b8e7acd1fe553ba433ee12736c3d55625` |
| townlight/permit | `e84a3661eb147d295cebbc044528f6d9dd9ef826` | `fc2f63438be5ba907694c28e35d2adff6e39822d` | `3d1bc2549da40f7a73954a2d10cc6bf8f5f680a9` |
| townlight/inspect | `c01c37978cb5e351ea58acbf9ed78c250eac8352` | `e13abe4da4498921729d8127a8cf72033184b20a` | `b7a28525828306513c21a07efe4b892e6249846f` |
| townlight/townlight | `99ef787bfc1da2a4290f80638f43c9ffd9647959` | `cafd0643132e6e458598d9b0e0c3adee1595f85f` | `45bb73df5f78443299bcba9af61da3380199720b` |
| townlight/station | `75017a75610fd8d803e53393a8093759f954d295` | `0d327713d482dc22dfd1fec10e2d5f2423c0ef6d` | `4b5afac07dda1c7f725993d06860a820959d7e06` |

Baseline repository mappings: core → Core; sunshine → Records; meetings → Meetings; ordinances → Code; zone → Zoning; plan → Planning; permit → Permitting; inspect → Inspections. Suite and Station source identities appear above. Private local checkout paths are omitted from this repository edition.


## Framework attribution and document validation

Adapted from the **Agent Governance Card**, developed by **The Agentic State with Center for Civic Futures**, [official framework](https://center-for-civic-futures.github.io/agent-governance-card/#intro), [source](https://github.com/Center-for-Civic-Futures/agent-governance-card), licensed **[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)**. Changes: completed technical draft answers, use inventory, approval table, context addenda and agency commissioning/evidence sections for Townlight. The framework's field labels, vocabulary and rule adaptation retain that attribution/license; they are not relabeled AGPL. Townlight-owned contributions follow AGPL-3.0-only, with third-party notices preserved. No CCF endorsement or certification is asserted.

Schema basis: full same-day framework HTML/text retained with the original assessment; the attributed [47-field list](evidence/agent-governance-card-fields-2026-11-02.json) is included for coverage verification. This document addresses all 47 unique IDs and all six exit-checklist items. Every field has an official answer status and a bounded answer; unknown deployment facts remain open. Public-layer markings cover 14 fields. The impact discussion is manual and provisional.

Validation performed for this draft: exact field-ID set/status count against retained schema; referenced source/receipt file existence; local checkout identities/clean state; citation path mapping; manual review of source-supported control wording, current-text/export distinctions, synthetic acceptance limits and uncommissioned agency facts. Immutable public source links were constructed from retained publication commits; live remote retrieval was not verified. No independent review is claimed.

The original documentation pass changed no applications. The subsequent authorized work changed only the Records fulfillment predicate/messages, its regression test and changelog, plus this suite governance documentation. No installed application/configuration changes, package renumbering, build/signing/release, website publication, standalone CivicCast changes, model inference, city data/credentials, real upload or physical broadcast occurred. The corrected source is not represented as delivered in the existing installer.

### E19 — Corrected Records source and affected validation

[Sanitized correction receipt](evidence/records-export-freshness-2026-11-02.json): Records correction commit `d10cafb913bc51e2edccc4272020d094f6064085`; `backend/app/requests/artifacts.py::fulfill`; `backend/tests/test_desktop_records_artifacts.py::test_fulfillment_requires_exports_for_current_approved_response`. The receipt contains exact source hashes, red/green outcomes, test scope and limitations. Raw local test logs are not published. See [the exact correction commit](https://github.com/townlight/sunshine/commit/d10cafb913bc51e2edccc4272020d094f6064085) and [integration PR #124 with required CI](https://github.com/townlight/sunshine/pull/124).
