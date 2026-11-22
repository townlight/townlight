//! Local transport only: no municipal rules, retries, JSON-state fallback,
//! caller-selected URL, or session proof exposed to the webview.
use reqwest::{Client, Method, StatusCode};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::sync::{LazyLock, Mutex};
use std::time::Duration;
use uuid::Uuid;

#[path = "council_packet_client.rs"]
mod council_packet_client;

const DOMAIN_ORIGIN: &str = "http://127.0.0.1:15480";
const MAX_RESPONSE_BYTES: usize = 16 * 1024 * 1024;
static SHARED_WRITES_PENDING: LazyLock<Mutex<HashMap<String, Uuid>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

fn allocation_route(path: &str) -> bool {
    let parts: Vec<_> = path.split('/').collect();
    matches!(
        parts.as_slice(),
        ["", "desktop", "v1", "meetings", "meetings" | "agenda-items"]
            | [
                "",
                "desktop",
                "v1",
                "meetings",
                "meetings",
                _,
                "packet-snapshots" | "council-source"
            ]
            | [
                "",
                "desktop",
                "v1",
                "meetings",
                "agenda-items",
                _,
                "reviews"
            ]
            | [
                "",
                "desktop",
                "v1",
                "meetings",
                "packets",
                _,
                "council-preview" | "council-approval"
            ]
            | ["", "desktop", "v1", "requests"]
            | ["", "desktop", "v1", "requests", _, "actions"]
    )
}

fn shared_operation(path: &str, body: Option<&Value>) -> Result<(String, Uuid), DomainError> {
    use sha2::{Digest, Sha256};

    let mut hash = Sha256::new();
    hash.update(path.as_bytes());
    hash.update([0]);
    if let Some(body) = body {
        hash.update(serde_json::to_vec(body).map_err(|_| DomainError::transport(false))?);
    }
    let fingerprint = format!("{:x}", hash.finalize());
    let mut pending = SHARED_WRITES_PENDING
        .lock()
        .map_err(|_| DomainError::transport(false))?;
    if !pending.contains_key(&fingerprint) && pending.len() >= 256 {
        return Err(DomainError::new(
            "operation-outcome-unknown",
            "Resolve the previous city-host writes before submitting more.",
            false,
        ));
    }
    let id = *pending
        .entry(fingerprint.clone())
        .or_insert_with(Uuid::new_v4);
    Ok((fingerprint, id))
}

fn clear_shared_operation(operation: Option<&(String, Uuid)>) {
    if let (Some((fingerprint, id)), Ok(mut pending)) = (operation, SHARED_WRITES_PENDING.lock()) {
        if pending.get(fingerprint) == Some(id) {
            pending.remove(fingerprint);
        }
    }
}

#[derive(Deserialize)]
#[serde(tag = "operation", rename_all = "kebab-case", deny_unknown_fields)]
pub enum MeetingsRequest {
    CodeConnections {},
    CodeConnection {
        id: String,
    },
    RecordCodeDecision {
        id: String,
        payload: Value,
    },
    RecordMeetingStage {
        id: Uuid,
        payload: MeetingStage,
    },
    ClerkCatalog {
        payload: MeetingCatalogInput,
    },
    CapturePacket {
        id: Uuid,
        payload: PacketInput,
    },
    DeliverPacket {
        id: Uuid,
    },
    PreviewCouncilPacket {
        id: Uuid,
        payload: CouncilPreview,
    },
    ApproveCouncilPacket {
        id: Uuid,
        payload: CouncilApproval,
    },
    SaveCouncilFiles {
        id: Uuid,
        payload: council_packet_client::CouncilDownload,
    },
    GetNoticeTemplate {
        id: Uuid,
    },
    DeliverNotice {
        id: Uuid,
        payload: NoticeDocument,
    },
    CaptureTranscript {
        id: Uuid,
        payload: TranscriptInput,
    },
    CaptureActionItem {
        id: Uuid,
        payload: ActionItemInput,
    },
    ArchiveMeeting {
        id: Uuid,
        payload: ArchiveInput,
    },
    PublisherStatus {
        id: Uuid,
    },
    PublisherRecordingChoices {
        request_id: Uuid,
    },
    PublisherPacket {
        payload: Value,
    },
    PublisherRecording {
        payload: Value,
    },
    PublisherWithdrawal {
        id: Uuid,
        kind: PublicationKind,
    },
    CheckNotice {
        id: Uuid,
        payload: NoticeInput,
    },
    RecordNoticeProof {
        id: Uuid,
        payload: NoticeProof,
    },
    RecordMinutesDecision {
        id: Uuid,
        payload: MinutesDecision,
    },
    RecordAgendaReview {
        id: Uuid,
        payload: AgendaReview,
    },
    AssignAgendaMeeting {
        id: Uuid,
        payload: AgendaAssignment,
    },
    ImportSources {},
    FetchImport {
        payload: MeetingImportSource,
    },
    PreviewImport {
        payload: MeetingImportPreview,
    },
    CommitImport {
        payload: MeetingImportCommit,
    },
    GetImport {
        id: Uuid,
    },
    ImportLinkChoices {
        destination: ImportDestination,
        payload: ImportLinkSearch,
    },
    ImportLinks {
        destination: ImportDestination,
        target_id: Uuid,
    },
    LinkImport {
        destination: ImportDestination,
        target_id: Uuid,
        payload: ImportLink,
    },
    AttachImportDocument {
        id: Uuid,
        payload: MeetingImportRecords,
    },
    CreateMeeting {
        payload: MeetingIntake,
    },
    GetMeeting {
        id: Uuid,
    },
    CreateAgendaItem {
        payload: AgendaIntake,
    },
    GetAgendaItem {
        id: Uuid,
    },
    CaptureMotion {
        id: Uuid,
        payload: MotionInput,
    },
    CorrectMotion {
        id: Uuid,
        payload: MotionCorrection,
    },
    CaptureVote {
        id: Uuid,
        payload: VoteInput,
    },
    CorrectVote {
        id: Uuid,
        payload: VoteCorrection,
    },
    CreateMinutesDraft {
        id: Uuid,
        payload: MinutesInput,
    },
    GetProceedings {
        id: Uuid,
    },
}

#[derive(Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum PublicationKind {
    Packet,
    Recording,
}

impl PublicationKind {
    fn path(&self) -> &'static str {
        match self {
            Self::Packet => "packet",
            Self::Recording => "recording",
        }
    }
}

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct MinutesDecision {
    action: String,
    note: String,
}

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct PacketInput {
    agenda_item_ids: Vec<Uuid>,
    #[serde(default)]
    public_agenda_ids: Vec<Uuid>,
    #[serde(default)]
    prior_packet_id: Option<Uuid>,
    #[serde(default)]
    retained_source_indexes: Vec<usize>,
    #[serde(default)]
    source_paths: Vec<String>,
    #[serde(default)]
    council_sources: Vec<council_packet_client::SelectedSource>,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum PacketAudience {
    Staff,
    Public,
}

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct CouncilPreview {
    audience: PacketAudience,
    agenda_item_ids: Vec<Uuid>,
    source_indexes: Vec<usize>,
}

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct CouncilApproval {
    preview_id: Uuid,
    manifest_sha256: String,
    public_confirmed: bool,
}

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct MeetingStage {
    to_status: String,
    statutory_basis: Option<String>,
}

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct NoticeInput {
    notice_type: String,
    posted_at: String,
    minimum_notice_hours: u32,
    statutory_basis: Option<String>,
    approved_by: Option<String>,
}
#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct NoticeProof {
    location: String,
    note: String,
    document_delivery_id: Option<String>,
}

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct NoticeDocument {
    text: String,
}

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct AgendaReview {
    to_status: String,
}
#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct AgendaAssignment {
    meeting_id: Uuid,
}

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct MotionInput {
    text: String,
    seconded_by: Option<String>,
}
#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct MotionCorrection {
    text: String,
    reason: String,
}
#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct VoteInput {
    voter_name: String,
    vote: String,
}
#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct VoteCorrection {
    vote: String,
    reason: String,
}
#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct MinutesSource {
    source_id: String,
    label: String,
    text: String,
}
#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct MinutesSentence {
    text: String,
    citations: Vec<String>,
}
#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct MinutesInput {
    source_materials: Vec<MinutesSource>,
    sentences: Vec<MinutesSentence>,
}

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct MeetingIntake {
    title: String,
    scheduled_start: String,
    location: String,
    #[serde(default = "regular_meeting_type")]
    meeting_type: String,
}

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct MeetingImportSource {
    connector: String,
    source_url: String,
    input_format: String,
}

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct MeetingImportRecords {
    request_id: Uuid,
    document_index: u32,
}

#[derive(Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ImportDestination {
    Boards,
    Contracts,
    Procurement,
    Zoning,
    Planning,
    Permitting,
    Inspections,
}

impl ImportDestination {
    fn path(&self) -> String {
        let name = match self {
            Self::Boards => "boards",
            Self::Contracts => "contracts",
            Self::Procurement => "procurement",
            Self::Zoning => "zoning",
            Self::Planning => "planning",
            Self::Permitting => "permitting",
            Self::Inspections => "inspections",
        };
        format!("/desktop/v1/meetings/imports/links/{name}")
    }
}

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct ImportLink {
    meeting_id: Uuid,
}

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct ImportLinkSearch {
    target_query: String,
    meeting_query: String,
}

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct MeetingImportPreview {
    connector: String,
    source_url: String,
    input_format: String,
    content_base64: String,
}

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct MeetingImportCommit {
    connector: String,
    source_url: String,
    input_format: String,
    content_base64: String,
    external_id: String,
    expected_sha256: String,
}
fn regular_meeting_type() -> String {
    "regular".into()
}

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct TranscriptInput {
    source_label: String,
    transcript_text: String,
    correction_of_id: Option<Uuid>,
}
#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct ActionItemInput {
    description: String,
    assigned_to: Option<String>,
    source_motion_id: Option<Uuid>,
}
#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct ArchiveInput {
    visibility: String,
    packet_id: Option<Uuid>,
    minutes_id: Option<Uuid>,
    plain_language_summary: String,
}

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct AgendaIntake {
    title: String,
    department_name: String,
}

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct MeetingCatalogInput {
    #[serde(default)]
    query: String,
    meeting_id: Option<Uuid>,
}

pub async fn execute_meetings(
    request: MeetingsRequest,
    proof: String,
) -> Result<Value, DomainError> {
    let (method, path, body) = match request {
        MeetingsRequest::CodeConnections {} => (
            Method::GET,
            "/desktop/v1/meetings/code-connections".to_string(),
            None,
        ),
        MeetingsRequest::CodeConnection { id } => (
            Method::GET,
            format!(
                "/desktop/v1/meetings/code-connections/{}",
                crate::code_client::encode_segment(&id)?
            ),
            None,
        ),
        MeetingsRequest::ClerkCatalog { payload } => (
            Method::POST,
            "/desktop/v1/meetings/clerk/catalog".to_string(),
            Some(serde_json::json!({"query": payload.query, "meeting_id": payload.meeting_id})),
        ),
        MeetingsRequest::RecordCodeDecision { id, payload } => (
            Method::POST,
            format!(
                "/desktop/v1/meetings/code-connections/{}/decisions",
                crate::code_client::encode_segment(&id)?
            ),
            Some(serde_json::json!(payload)),
        ),
        MeetingsRequest::GetNoticeTemplate { id } => (
            Method::GET,
            format!("/desktop/v1/meetings/notices/{id}/template"),
            None,
        ),
        MeetingsRequest::DeliverNotice { id, payload } => (
            Method::POST,
            format!("/desktop/v1/meetings/notices/{id}/document"),
            Some(serde_json::json!(payload)),
        ),
        MeetingsRequest::CaptureTranscript { id, payload } => (
            Method::POST,
            format!("/desktop/v1/meetings/meetings/{id}/transcripts"),
            Some(serde_json::json!(payload)),
        ),
        MeetingsRequest::CaptureActionItem { id, payload } => (
            Method::POST,
            format!("/desktop/v1/meetings/meetings/{id}/action-items"),
            Some(serde_json::json!(payload)),
        ),
        MeetingsRequest::ArchiveMeeting { id, payload } => (
            Method::POST,
            format!("/desktop/v1/meetings/meetings/{id}/archive"),
            Some(serde_json::json!(payload)),
        ),
        MeetingsRequest::PublisherStatus { id } => (
            Method::GET,
            format!("/desktop/v1/portal/publications/{id}"),
            None,
        ),
        MeetingsRequest::PublisherRecordingChoices { request_id } => (
            Method::GET,
            format!("/desktop/v1/portal/selections?request_id={request_id}"),
            None,
        ),
        MeetingsRequest::PublisherPacket { payload } => (
            Method::POST,
            "/desktop/v1/portal/publications/packet".to_string(),
            Some(payload),
        ),
        MeetingsRequest::PublisherRecording { payload } => (
            Method::POST,
            "/desktop/v1/portal/publications/recording".to_string(),
            Some(payload),
        ),
        MeetingsRequest::PublisherWithdrawal { id, kind } => (
            Method::POST,
            format!(
                "/desktop/v1/portal/publications/{id}/{}/withdraw",
                kind.path()
            ),
            Some(serde_json::json!({"confirm": true})),
        ),
        MeetingsRequest::CheckNotice { id, payload } => (
            Method::POST,
            format!("/desktop/v1/meetings/meetings/{id}/notice-checks"),
            Some(serde_json::json!(payload)),
        ),
        MeetingsRequest::RecordNoticeProof { id, payload } => (
            Method::POST,
            format!("/desktop/v1/meetings/notices/{id}/proof"),
            Some(serde_json::json!(payload)),
        ),
        MeetingsRequest::RecordMeetingStage { id, payload } => (
            Method::POST,
            format!("/desktop/v1/meetings/meetings/{id}/stages"),
            Some(serde_json::json!(payload)),
        ),
        MeetingsRequest::CapturePacket { id, payload } => {
            let body = council_packet_client::snapshot_payload(id, payload, &proof).await?;
            (
                Method::POST,
                format!("/desktop/v1/meetings/meetings/{id}/packet-snapshots"),
                Some(body),
            )
        }
        MeetingsRequest::DeliverPacket { id } => (
            Method::POST,
            format!("/desktop/v1/meetings/packets/{id}/deliver"),
            None,
        ),
        MeetingsRequest::PreviewCouncilPacket { id, payload } => (
            Method::POST,
            format!("/desktop/v1/meetings/packets/{id}/council-preview"),
            Some(serde_json::json!(payload)),
        ),
        MeetingsRequest::ApproveCouncilPacket { id, payload } => (
            Method::POST,
            format!("/desktop/v1/meetings/packets/{id}/council-approval"),
            Some(serde_json::json!(payload)),
        ),
        MeetingsRequest::SaveCouncilFiles { id, payload } => {
            return council_packet_client::save_files(id, payload, &proof).await;
        }
        MeetingsRequest::RecordMinutesDecision { id, payload } => (
            Method::POST,
            format!("/desktop/v1/meetings/minutes/{id}/decisions"),
            Some(serde_json::json!(payload)),
        ),
        MeetingsRequest::RecordAgendaReview { id, payload } => (
            Method::POST,
            format!("/desktop/v1/meetings/agenda-items/{id}/reviews"),
            Some(serde_json::json!(payload)),
        ),
        MeetingsRequest::AssignAgendaMeeting { id, payload } => (
            Method::POST,
            format!("/desktop/v1/meetings/agenda-items/{id}/meeting"),
            Some(serde_json::json!(payload)),
        ),
        MeetingsRequest::CaptureMotion { id, payload } => (
            Method::POST,
            format!("/desktop/v1/meetings/meetings/{id}/motions"),
            Some(serde_json::json!(payload)),
        ),
        MeetingsRequest::CorrectMotion { id, payload } => (
            Method::POST,
            format!("/desktop/v1/meetings/motions/{id}/corrections"),
            Some(serde_json::json!(payload)),
        ),
        MeetingsRequest::CaptureVote { id, payload } => (
            Method::POST,
            format!("/desktop/v1/meetings/motions/{id}/votes"),
            Some(serde_json::json!(payload)),
        ),
        MeetingsRequest::CorrectVote { id, payload } => (
            Method::POST,
            format!("/desktop/v1/meetings/votes/{id}/corrections"),
            Some(serde_json::json!(payload)),
        ),
        MeetingsRequest::CreateMinutesDraft { id, payload } => (
            Method::POST,
            format!("/desktop/v1/meetings/meetings/{id}/minutes/drafts"),
            Some(serde_json::json!(payload)),
        ),
        MeetingsRequest::GetProceedings { id } => (
            Method::GET,
            format!("/desktop/v1/meetings/meetings/{id}/proceedings"),
            None,
        ),
        MeetingsRequest::ImportSources {} => (
            Method::GET,
            "/desktop/v1/meetings/imports/sources".into(),
            None,
        ),
        MeetingsRequest::PreviewImport { payload } => (
            Method::POST,
            "/desktop/v1/meetings/imports/preview".into(),
            Some(serde_json::json!(payload)),
        ),
        MeetingsRequest::FetchImport { payload } => (
            Method::POST,
            "/desktop/v1/meetings/imports/fetch".into(),
            Some(serde_json::json!(payload)),
        ),
        MeetingsRequest::CommitImport { payload } => (
            Method::POST,
            "/desktop/v1/meetings/imports/commit".into(),
            Some(serde_json::json!(payload)),
        ),
        MeetingsRequest::GetImport { id } => (
            Method::GET,
            format!("/desktop/v1/meetings/imports/{id}"),
            None,
        ),
        MeetingsRequest::ImportLinkChoices {
            destination,
            payload,
        } => (
            Method::POST,
            destination.path(),
            Some(serde_json::json!(payload)),
        ),
        MeetingsRequest::ImportLinks {
            destination,
            target_id,
        } => (
            Method::GET,
            format!("{}/{target_id}", destination.path()),
            None,
        ),
        MeetingsRequest::LinkImport {
            destination,
            target_id,
            payload,
        } => (
            Method::POST,
            format!("{}/{target_id}", destination.path()),
            Some(serde_json::json!(payload)),
        ),
        MeetingsRequest::AttachImportDocument { id, payload } => (
            Method::POST,
            format!("/desktop/v1/meetings/imports/{id}/records"),
            Some(serde_json::json!(payload)),
        ),
        MeetingsRequest::CreateMeeting { payload } => (
            Method::POST,
            "/desktop/v1/meetings/meetings".into(),
            Some(serde_json::json!(payload)),
        ),
        MeetingsRequest::GetMeeting { id } => (
            Method::GET,
            format!("/desktop/v1/meetings/meetings/{id}"),
            None,
        ),
        MeetingsRequest::CreateAgendaItem { payload } => (
            Method::POST,
            "/desktop/v1/meetings/agenda-items".into(),
            Some(serde_json::json!(payload)),
        ),
        MeetingsRequest::GetAgendaItem { id } => (
            Method::GET,
            format!("/desktop/v1/meetings/agenda-items/{id}"),
            None,
        ),
    };
    send(method, path, body, &proof).await
}

#[derive(Deserialize)]
#[serde(tag = "operation", rename_all = "kebab-case", deny_unknown_fields)]
pub enum SuiteRequest {
    State {},
    Search { query: String },
}

pub async fn execute_suite(request: SuiteRequest, proof: String) -> Result<Value, DomainError> {
    let (method, path, body) = match request {
        SuiteRequest::State {} => (Method::GET, "/desktop/v1/suite/state", None),
        SuiteRequest::Search { query } => (
            Method::POST,
            "/desktop/v1/suite/search",
            Some(serde_json::json!({"query":query})),
        ),
    };
    send(method, path.into(), body, &proof).await
}

#[derive(Deserialize)]
#[serde(tag = "operation", rename_all = "kebab-case", deny_unknown_fields)]
pub enum AccessRequest {
    State {},
    Review { payload: AccessReview },
    DeleteReview { review_id: Uuid },
    ExportReview { review_id: Uuid },
    ExportDraft { draft_id: Uuid },
    Tool { payload: AccessTool },
    Rewrite { payload: AccessRewrite },
}

#[derive(Deserialize, Serialize)]
#[serde(
    tag = "action",
    rename_all = "kebab-case",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum AccessTool {
    FormPlan {
        form_name: String,
        fields: Vec<String>,
    },
    PublishingWorkflow {
        title: String,
        has_review: bool,
        has_plain_language: bool,
        has_translation_review: bool,
    },
    AdaTitleIi {
        service_area: String,
        has_coordinator_review: bool,
    },
    TaggedPdf {
        heading_levels: Vec<u32>,
    },
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum RewriteAction {
    PlainLanguage,
    LanguageVariant,
}

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct AccessRewrite {
    action: RewriteAction,
    text: String,
    #[serde(default)]
    language: String,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AccessReview {
    #[serde(default)]
    title: String,
    #[serde(default)]
    body: String,
    #[serde(default)]
    has_alt_text: bool,
    #[serde(default)]
    language: String,
}

pub async fn execute_access(request: AccessRequest, proof: String) -> Result<Value, DomainError> {
    let export_path = match &request {
        AccessRequest::ExportReview { review_id } => {
            Some(format!("/desktop/v1/access/reviews/{review_id}/export"))
        }
        AccessRequest::ExportDraft { draft_id } => {
            Some(format!("/desktop/v1/access/drafts/{draft_id}/export"))
        }
        _ => None,
    };
    if let Some(path) = export_path {
        return execute_access_export(path, proof).await;
    }
    match request {
        AccessRequest::ExportReview { .. } | AccessRequest::ExportDraft { .. } => {
            Err(DomainError::transport(false))
        }
        AccessRequest::Tool { payload } => {
            send(
                Method::POST,
                "/desktop/v1/access/tools".into(),
                Some(serde_json::json!(payload)),
                &proof,
            )
            .await
        }
        AccessRequest::Rewrite { payload } => {
            let context = send(
                Method::POST,
                "/desktop/v1/access/rewrite-context".into(),
                Some(serde_json::json!(&payload)),
                &proof,
            )
            .await?;
            let prompt = context
                .get("prompt")
                .and_then(Value::as_str)
                .ok_or_else(|| DomainError::transport(false))?
                .to_owned();
            let generated = tauri::async_runtime::spawn_blocking(move || {
                if crate::model::local_generation_available()? {
                    crate::model::generate_local_text(&prompt).map(Some)
                } else { Ok(None) }
            }).await.map_err(|_| DomainError::transport(false))?
                .map_err(|_| DomainError::new("model-unavailable", "Local AI generation failed. No rewrite was recorded; no sample was substituted.", false))?;
            let mut body = serde_json::json!(payload);
            if let Some((model, text)) = generated {
                body["outcome"] = "generated".into();
                body["generated"] = text.into();
                body["model"] = model.into();
            } else {
                body["outcome"] = "unavailable".into();
            }
            send(
                Method::POST,
                "/desktop/v1/access/rewrite-result".into(),
                Some(body),
                &proof,
            )
            .await
        }
        AccessRequest::State {} => {
            send(Method::GET, "/desktop/v1/access/state".into(), None, &proof).await
        }
        AccessRequest::DeleteReview { review_id } => {
            send(
                Method::POST,
                format!("/desktop/v1/access/reviews/{review_id}/delete"),
                None,
                &proof,
            )
            .await
        }
        AccessRequest::Review { payload } => {
            let context = send(
                Method::POST,
                "/desktop/v1/access/review-context".into(),
                Some(serde_json::json!(&payload)),
                &proof,
            )
            .await?;
            let prompt = context
                .get("prompt")
                .and_then(Value::as_str)
                .ok_or_else(|| DomainError::transport(false))?
                .to_owned();
            // Runtime availability and generation only; findings/prompt and
            // persistence belong to Access. Failed AI must not lose a review.
            let generated = tauri::async_runtime::spawn_blocking(move || {
                if crate::model::local_generation_available().unwrap_or(false) {
                    Some(crate::model::generate_local_text(&prompt))
                } else {
                    None
                }
            })
            .await;
            let mut body = serde_json::json!(&payload);
            match generated {
                Ok(Some(Ok((model, text)))) => {
                    body["ai_outcome"] = "generated".into();
                    body["ai_analysis"] = text.into();
                    body["ai_analysis_model"] = model.into();
                }
                Ok(None) => body["ai_outcome"] = "unavailable".into(),
                _ => body["ai_outcome"] = "failed".into(),
            }
            send(
                Method::POST,
                "/desktop/v1/access/reviews".into(),
                Some(body),
                &proof,
            )
            .await
        }
    }
}

async fn execute_access_export(path: String, proof: String) -> Result<Value, DomainError> {
    let plan = send(Method::POST, path, None, &proof).await?;
    let plan: crate::domain_files::ArtifactPlan =
        serde_json::from_value(plan).map_err(|_| DomainError::transport(true))?;
    let artifact_id = plan.artifact_id;
    let path = tauri::async_runtime::spawn_blocking(move || {
        crate::domain_files::write_access_export(plan)
    })
    .await
    .map_err(|_| DomainError::transport(true))?
    .map_err(|_| {
        DomainError::new(
            "export-incomplete",
            "Access export was not finalized. Prepared evidence is retained.",
            true,
        )
    })?;
    send(
        Method::POST,
        format!("/desktop/v1/access/exports/{artifact_id}/complete"),
        Some(serde_json::json!({"export_path":path})),
        &proof,
    )
    .await
}

#[derive(Deserialize)]
#[serde(tag = "operation", rename_all = "kebab-case", deny_unknown_fields)]
pub enum PublicRecordsRequest {
    State {},
    Submit { payload: PublicIntake },
    Lookup { payload: PublicLookup },
    Message { payload: PublicMessage },
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PublicIntake {
    requester: String,
    requester_contact: String,
    summary: String,
    #[serde(default)]
    deadline: String,
}
#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PublicLookup {
    tracking_number: String,
    requester_contact: String,
}
#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PublicMessage {
    tracking_number: String,
    requester_contact: String,
    public_request_message: String,
}

pub async fn execute_public(
    request: PublicRecordsRequest,
    proof: String,
) -> Result<Value, DomainError> {
    let (method, path, body) = match request {
        PublicRecordsRequest::State {} => (Method::GET, "records-state", None),
        PublicRecordsRequest::Submit { payload } => {
            (Method::POST, "requests", Some(serde_json::json!(payload)))
        }
        PublicRecordsRequest::Lookup { payload } => {
            (Method::POST, "lookup", Some(serde_json::json!(payload)))
        }
        PublicRecordsRequest::Message { payload } => {
            (Method::POST, "messages", Some(serde_json::json!(payload)))
        }
    };
    send_with_header(
        method,
        format!("/desktop/v1/public/{path}"),
        body,
        &proof,
        "X-Townlight-Public",
    )
    .await
}

#[derive(Deserialize)]
#[serde(tag = "operation", rename_all = "kebab-case", deny_unknown_fields)]
pub enum RecordsRequest {
    SearchPlanning {
        query: String,
    },
    AttachPlanningSource {
        request_id: Uuid,
        source_id: String,
        expected_sha256: String,
    },
    SearchZoning {
        query: String,
    },
    AttachZoningSource {
        request_id: Uuid,
        source_id: String,
        expected_sha256: String,
    },
    SearchCode {
        query: String,
        as_of: Option<String>,
    },
    AttachCodeSource {
        request_id: Uuid,
        source_id: String,
        expected_sha256: String,
        as_of: Option<String>,
    },
    SearchMeetings {
        query: String,
    },
    AttachMeetingsSource {
        request_id: Uuid,
        source_id: String,
        expected_sha256: String,
    },
    State {},
    MarkNotification {
        notification_id: Uuid,
    },
    Suggest {
        request_id: Uuid,
    },
    Export {
        request_id: Uuid,
        kind: ArtifactKind,
    },
    AttachDocument {
        request_id: Uuid,
        title: String,
        source_path: String,
        #[serde(default)]
        citation: String,
    },
    AttachReleaseCopy {
        request_id: Uuid,
        attachment_id: Uuid,
        source_path: String,
        status: ReleaseCopyStatus,
        #[serde(default)]
        note: String,
        #[serde(default)]
        added_by: String,
    },
    AttachStationRecording {
        request_id: Uuid,
        recording_id: Uuid,
        expected_sha256: String,
    },
    Create {
        payload: Intake,
    },
    View {
        request_id: Uuid,
    },
    Apply {
        request_id: Uuid,
        action: RecordsAction,
        payload: Value,
    },
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Intake {
    requester: String,
    summary: String,
    deadline: String,
    #[serde(default)]
    deadline_basis: String,
}

#[derive(Deserialize, Serialize)]
pub enum ReleaseCopyStatus {
    #[serde(rename = "release-ready copy")]
    Ready,
    #[serde(rename = "redacted copy")]
    Redacted,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum ArtifactKind {
    Response,
    ReleasePackage,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum RecordsAction {
    AssignRecordsRequest,
    SetRecordsDeadline,
    CalculateRecordsDeadline,
    RequestRecordsClarification,
    AddRecordsMessage,
    RecordRecordsSearch,
    RecordRecordsSearchSession,
    AddRecordsExemptionReview,
    AddRecordsExemptionDecision,
    EstimateRecordsFee,
    AddRecordsFeeLine,
    WaiveRecordsFee,
    DraftRecordsResponse,
    ApproveRecordsResponse,
    FulfillRecordsRequest,
    CloseRecordsRequest,
}

#[derive(Debug, Serialize)]
pub struct DomainError {
    pub code: &'static str,
    pub message: &'static str,
    pub outcome_unknown: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub current_revision: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub current_response_sha256: Option<String>,
}

impl DomainError {
    pub fn maintenance() -> Self {
        Self::new("profile-maintenance", "Profile maintenance is in progress. No Records operation was started; retry after maintenance finishes.", false)
    }
    fn new(code: &'static str, message: &'static str, outcome_unknown: bool) -> Self {
        Self {
            code,
            message,
            outcome_unknown,
            current_revision: None,
            current_response_sha256: None,
        }
    }

    pub fn denied() -> Self {
        Self::new(
            "access-denied",
            "Sign in with an authorized Records account and enable Records in this profile.",
            false,
        )
    }

    fn transport(writing: bool) -> Self {
        Self::new("service-unavailable", "Records could not confirm the result. Restore service availability and refresh before repeating a change.", writing)
    }
}

impl RecordsRequest {
    fn wire(self) -> Result<(Method, String, Option<Value>), DomainError> {
        let stage = |source: &str, title: &str, note: &str| {
            crate::domain_files::stage(source, title, note).map_err(|_| {
                DomainError::new(
                    "file-unavailable",
                    "The Records file could not be staged; no domain change was submitted.",
                    false,
                )
            })
        };
        Ok(match self {
            Self::SearchPlanning { query } => (
                Method::POST,
                "/desktop/v1/planning-sources/search".into(),
                Some(serde_json::json!({"query":query})),
            ),
            Self::AttachPlanningSource {
                request_id,
                source_id,
                expected_sha256,
            } => (
                Method::POST,
                format!("/desktop/v1/requests/{request_id}/planning-sources"),
                Some(serde_json::json!({"source_id":source_id,"expected_sha256":expected_sha256})),
            ),
            Self::SearchZoning { query } => (
                Method::POST,
                "/desktop/v1/zoning-sources/search".into(),
                Some(serde_json::json!({ "query": query })),
            ),
            Self::AttachZoningSource {
                request_id,
                source_id,
                expected_sha256,
            } => (
                Method::POST,
                format!("/desktop/v1/requests/{request_id}/zoning-sources"),
                Some(
                    serde_json::json!({ "source_id": source_id, "expected_sha256": expected_sha256 }),
                ),
            ),
            Self::SearchCode { query, as_of } => (
                Method::POST,
                "/desktop/v1/code-sources/search".into(),
                Some(serde_json::json!({"query":query,"as_of":as_of})),
            ),
            Self::AttachCodeSource {
                request_id,
                source_id,
                expected_sha256,
                as_of,
            } => (
                Method::POST,
                format!("/desktop/v1/requests/{request_id}/code-sources"),
                Some(
                    serde_json::json!({"source_id":source_id,"expected_sha256":expected_sha256,"as_of":as_of}),
                ),
            ),
            Self::SearchMeetings { query } => (
                Method::POST,
                "/desktop/v1/meetings-sources/search".into(),
                Some(serde_json::json!({"query":query})),
            ),
            Self::AttachMeetingsSource {
                request_id,
                source_id,
                expected_sha256,
            } => (
                Method::POST,
                format!("/desktop/v1/requests/{request_id}/meetings-sources"),
                Some(serde_json::json!({"source_id":source_id,"expected_sha256":expected_sha256})),
            ),
            Self::Export { .. } | Self::Suggest { .. } => {
                return Err(DomainError::transport(false))
            }
            Self::State {} => (Method::GET, "/desktop/v1/records-state".into(), None),
            Self::MarkNotification { notification_id } => (
                Method::POST,
                format!("/desktop/v1/notifications/{notification_id}/sent"),
                None,
            ),
            Self::AttachDocument {
                request_id,
                title,
                source_path,
                citation,
            } => {
                let body = if crate::shared_staff::configured() {
                    serde_json::json!({"title":title, "citation":citation, "upload":records_upload(&source_path)?})
                } else {
                    let file = stage(&source_path, &title, &citation)?;
                    serde_json::json!({"title":title, "citation":citation, "file":file})
                };
                (
                    Method::POST,
                    format!("/desktop/v1/requests/{request_id}/documents"),
                    Some(body),
                )
            }
            Self::AttachReleaseCopy {
                request_id,
                attachment_id,
                source_path,
                status,
                note,
                added_by,
            } => {
                let body = if crate::shared_staff::configured() {
                    serde_json::json!({"status":status, "note":note, "upload":records_upload(&source_path)?})
                } else {
                    let file = stage(&source_path, "Records release copy", &note)?;
                    serde_json::json!({"status":status, "note":note, "added_by":added_by, "file":file})
                };
                (
                    Method::POST,
                    format!(
                        "/desktop/v1/requests/{request_id}/documents/{attachment_id}/release-copy"
                    ),
                    Some(body),
                )
            }
            Self::View { request_id } => (
                Method::GET,
                format!("/desktop/v1/requests/{request_id}/view"),
                None,
            ),
            Self::AttachStationRecording {
                request_id,
                recording_id,
                expected_sha256,
            } => (
                Method::POST,
                format!("/desktop/v1/requests/{request_id}/station-recordings"),
                Some(
                    serde_json::json!({"recording_id":recording_id,"expected_sha256":expected_sha256}),
                ),
            ),
            Self::Create { payload } => (
                Method::POST,
                "/desktop/v1/requests".into(),
                Some(serde_json::json!(payload)),
            ),
            Self::Apply {
                request_id,
                action,
                payload,
            } => (
                Method::POST,
                format!("/desktop/v1/requests/{request_id}/actions"),
                Some(serde_json::json!({"action": action, "payload": payload})),
            ),
        })
    }
}

fn status_error(status: StatusCode, writing: bool) -> DomainError {
    match status.as_u16() {
        401 | 403 => DomainError::denied(),
        400 | 422 => DomainError::new("invalid-input", "Records rejected the input. Review the required fields; no change was accepted.", false),
        404 => DomainError::new("not-found", "The Records request or operation was not found. Refresh before continuing.", false),
        409 => DomainError::new("conflict", "Records reported a conflict. Refresh before continuing.", false),
        503 => DomainError::new("not-ready", "Records is not ready or migration is not activated. Refresh after service readiness is restored.", writing),
        _ => DomainError::transport(writing),
    }
}

fn records_upload(source: &str) -> Result<Value, DomainError> {
    use base64::Engine;
    use sha2::{Digest, Sha256};
    use std::io::Read;
    use std::path::Path;

    const MAX_FILE: u64 = 16 * 1024 * 1024;
    let unavailable = || {
        DomainError::new(
            "file-unavailable",
            "Choose a readable Records file up to 16 MiB.",
            false,
        )
    };
    let path = Path::new(source);
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(unavailable)?;
    let file = std::fs::File::open(path).map_err(|_| unavailable())?;
    let mut bytes = Vec::new();
    file.take(MAX_FILE + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| unavailable())?;
    if bytes.is_empty() || bytes.len() as u64 > MAX_FILE {
        return Err(unavailable());
    }
    Ok(
        serde_json::json!({"file_name":file_name,"sha256":format!("{:x}",Sha256::digest(&bytes)),
        "content_base64":base64::engine::general_purpose::STANDARD.encode(bytes)}),
    )
}

pub async fn execute(request: RecordsRequest, proof: String) -> Result<Value, DomainError> {
    if crate::shared_staff::configured()
        && matches!(
            request,
            RecordsRequest::Suggest { .. } | RecordsRequest::Export { .. }
        )
    {
        return Err(DomainError::new(
            "host-only",
            "Use the city host for this Records operation.",
            false,
        ));
    }
    let request = match request {
        RecordsRequest::Suggest { request_id } => {
            #[derive(Deserialize)]
            #[serde(deny_unknown_fields)]
            struct DraftContext {
                prompt: String,
                previous_response_sha256: String,
            }
            let context = send(
                Method::GET,
                format!("/desktop/v1/requests/{request_id}/draft-context"),
                None,
                &proof,
            )
            .await?;
            let context: DraftContext =
                serde_json::from_value(context).map_err(|_| DomainError::transport(false))?;
            let generated = tauri::async_runtime::spawn_blocking(move || crate::model::generate_local_text(&context.prompt))
                .await.map_err(|_| DomainError::transport(false))?
                .map_err(|_| DomainError::new("model-unavailable", "Local AI could not generate a draft. The existing text and approval were not changed.", false))?;
            return send(Method::POST, format!("/desktop/v1/requests/{request_id}/generated-draft"),
                        Some(serde_json::json!({"text":generated.1, "model":generated.0, "previous_response_sha256":context.previous_response_sha256})), &proof).await;
        }
        RecordsRequest::Export { request_id, kind } => {
            let plan = send(
                Method::POST,
                format!("/desktop/v1/requests/{request_id}/artifacts"),
                Some(serde_json::json!({"kind":kind})),
                &proof,
            )
            .await?;
            let plan: crate::domain_files::ArtifactPlan =
                serde_json::from_value(plan).map_err(|_| DomainError::transport(true))?;
            let artifact_id = plan.artifact_id;
            let path = tauri::async_runtime::spawn_blocking(move || crate::domain_files::write_export(plan))
                .await.map_err(|_| DomainError::transport(true))?
                .map_err(|_| DomainError::new("export-incomplete", "The Records export was not finalized. Prepared evidence is retained; refresh before retrying.", true))?;
            return send(
                Method::POST,
                format!("/desktop/v1/requests/{request_id}/artifacts/{artifact_id}/complete"),
                Some(serde_json::json!({"export_path":path})),
                &proof,
            )
            .await;
        }
        other => other,
    };
    let (method, path, body) = tauri::async_runtime::spawn_blocking(move || request.wire())
        .await
        .map_err(|_| DomainError::transport(false))??;
    send(method, path, body, &proof).await
}

pub(crate) async fn send(
    method: Method,
    path: String,
    body: Option<Value>,
    proof: &str,
) -> Result<Value, DomainError> {
    send_with_header(method, path, body, proof, "X-Townlight-Session").await
}

async fn send_with_header(
    method: Method,
    path: String,
    body: Option<Value>,
    proof: &str,
    proof_header: &'static str,
) -> Result<Value, DomainError> {
    let writing = method == Method::POST;
    // Import fetch includes the bounded 16 MiB source encoded as base64.
    let response_limit = if path == "/desktop/v1/meetings/imports/fetch" {
        32 * 1024 * 1024
    } else {
        MAX_RESPONSE_BYTES
    };
    let request_timeout = if path == "/desktop/v1/portal/publications/recording" {
        // The host verifies and seals the already-approved managed recording
        // before acknowledging that it is safe to retry after a restart.
        300
    } else {
        60
    };
    // Do not forward the proof through a system proxy or a server redirect.
    let client = Client::builder()
        .no_proxy()
        .redirect(reqwest::redirect::Policy::none())
        .retry(reqwest::retry::never())
        .connect_timeout(Duration::from_secs(3))
        .timeout(Duration::from_secs(request_timeout))
        .build()
        .map_err(|_| DomainError::transport(false))?;
    let shared = crate::shared_staff::configured();
    let operation = if shared && writing && allocation_route(&path) {
        Some(shared_operation(&path, body.as_ref())?)
    } else {
        None
    };
    let destination = if shared {
        if proof_header != "X-Townlight-Session" {
            return Err(DomainError::denied());
        }
        crate::shared_staff::url(&format!("/staff/v1/api{path}"))
            .map_err(|_| DomainError::transport(false))?
    } else {
        reqwest::Url::parse(&format!("{DOMAIN_ORIGIN}{path}"))
            .map_err(|_| DomainError::transport(false))?
    };
    let mut outgoing = client
        .request(method, destination)
        .header(proof_header, proof);
    if let Some((_, id)) = &operation {
        outgoing = outgoing.header("X-Townlight-Operation", id.to_string());
    }
    if let Some(body) = body {
        outgoing = outgoing.json(&body);
    }
    let mut response = outgoing
        .send()
        .await
        .map_err(|_| DomainError::transport(writing))?;
    if !response.status().is_success() {
        let status = response.status();
        let mut error = status_error(status, writing);
        if status == StatusCode::CONFLICT && shared {
            if let Ok(Some(bytes)) = response.chunk().await {
                if bytes.len() <= 4096 {
                    if let Ok(body) = serde_json::from_slice::<Value>(&bytes) {
                        if body.get("code").and_then(Value::as_str)
                            == Some("operation-outcome-unknown")
                        {
                            return Err(DomainError::new("operation-outcome-unknown", "The city host did not confirm the previous write. Check the authoritative records before submitting again.", true));
                        }
                        error.current_revision =
                            body.get("current_revision").and_then(Value::as_u64);
                        error.current_response_sha256 = body
                            .get("current_response_sha256")
                            .and_then(Value::as_str)
                            .map(str::to_string);
                    }
                }
            }
        }
        if status.is_client_error()
            && status != StatusCode::UNAUTHORIZED
            && status != StatusCode::TOO_MANY_REQUESTS
        {
            clear_shared_operation(operation.as_ref());
        }
        return Err(error);
    }
    // Error bodies are deliberately not echoed: framework errors can contain
    // internal details. Successful responses must be bounded JSON.
    let mut bytes = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| DomainError::transport(writing))?
    {
        if bytes.len().saturating_add(chunk.len()) > response_limit {
            return Err(DomainError::new("response-too-large", "Records returned more data than this client can safely load. No partial state was applied.", writing));
        }
        bytes.extend_from_slice(&chunk);
    }
    let result = serde_json::from_slice(&bytes).map_err(|_| {
        DomainError::new(
            "invalid-response",
            "Records returned an unreadable result. Refresh before repeating a change.",
            writing,
        )
    })?;
    clear_shared_operation(operation.as_ref());
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    #[ignore = "requires the paired disposable Python runtime on fixed loopback port 15480"]
    fn native_records_roundtrip_with_real_runtime() {
        let proof = std::env::var("TOWNLIGHT_TEST_SESSION_PROOF")
            .expect("synthetic proof supplied by paired test");
        let source = std::env::var("TOWNLIGHT_TEST_SOURCE_FILE")
            .expect("synthetic source supplied by paired test");
        tauri::async_runtime::block_on(async {
            let denied = execute(RecordsRequest::State {}, "0".repeat(64)).await;
            assert!(denied.is_err(), "invalid proof must fail");
            let create: RecordsRequest = serde_json::from_value(serde_json::json!({
                "operation":"create", "payload":{"requester":"Native transport fixture", "summary":"Synthetic transport acceptance", "deadline":"2026-10-15"}
            })).unwrap();
            let created = execute(create, proof.clone())
                .await
                .expect("real native create");
            let id = created["id"].as_str().expect("canonical id");
            let attach: RecordsRequest = serde_json::from_value(serde_json::json!({
                "operation":"attach-document", "request_id":id, "title":"Synthetic document", "source_path":source, "citation":"Synthetic transport citation"
            })).unwrap();
            let attached = execute(attach, proof.clone())
                .await
                .expect("native copy and SQL attachment");
            let stored = attached["request"]["documents"][0]["stored_path"]
                .as_str()
                .unwrap();
            assert_eq!(
                std::fs::read_to_string(stored).unwrap(),
                "Synthetic source bytes"
            );
            for (action, payload) in [
                (
                    "draft-records-response",
                    serde_json::json!({"responseDraft":"Synthetic native response", "citation":"Synthetic transport citation"}),
                ),
                (
                    "approve-records-response",
                    serde_json::json!({"approvalNote":"Synthetic human review"}),
                ),
            ] {
                let command = serde_json::from_value(serde_json::json!({"operation":"apply", "request_id":id, "action":action, "payload":payload})).unwrap();
                execute(command, proof.clone())
                    .await
                    .expect("native lifecycle action");
            }
            let export = serde_json::from_value(
                serde_json::json!({"operation":"export", "request_id":id, "kind":"response"}),
            )
            .unwrap();
            let exported = execute(export, proof.clone())
                .await
                .expect("prepare/native write/finalize");
            let path = exported["request"]["exports"][0].as_str().unwrap();
            assert!(std::fs::read_to_string(path)
                .unwrap()
                .contains("Synthetic native response"));
            assert!(std::path::Path::new(&format!("{path}.manifest.json")).is_file());
            let view = execute(
                RecordsRequest::View {
                    request_id: Uuid::parse_str(id).unwrap(),
                },
                proof,
            )
            .await
            .expect("canonical native readback");
            assert_eq!(view["exports"][0], path);
            assert_eq!(view["documents"][0]["stored_path"], stored);
        });
    }

    #[test]
    fn routes_are_fixed_and_ids_are_not_paths() {
        let request: RecordsRequest = serde_json::from_value(serde_json::json!({
            "operation": "view", "request_id": "a7abf8da-7c0b-47a5-b4ab-4fc1b33aab78"
        }))
        .unwrap();
        let (method, path, body) = request.wire().unwrap();
        assert_eq!(method, Method::GET);
        assert_eq!(
            path,
            "/desktop/v1/requests/a7abf8da-7c0b-47a5-b4ab-4fc1b33aab78/view"
        );
        assert!(body.is_none());
        for bad in [
            serde_json::json!({"operation":"view", "request_id":"../admin"}),
            serde_json::json!({"operation":"state", "url":"https://example.invalid"}),
            serde_json::json!({"operation":"create", "payload":{"requester":"x", "summary":"x", "deadline":"2026-10-15", "actor":"admin"}}),
            serde_json::json!({"operation":"apply", "request_id":"a7abf8da-7c0b-47a5-b4ab-4fc1b33aab78", "action":"create-meeting", "payload":{}}),
        ] {
            assert!(serde_json::from_value::<RecordsRequest>(bad).is_err());
        }
    }

    #[test]
    fn failures_do_not_encourage_duplicate_mutations() {
        assert!(DomainError::transport(true).outcome_unknown);
        assert!(!DomainError::transport(false).outcome_unknown);
        assert!(status_error(StatusCode::INTERNAL_SERVER_ERROR, true).outcome_unknown);
        assert!(!status_error(StatusCode::UNAUTHORIZED, true).outcome_unknown);
        assert!(!status_error(StatusCode::UNPROCESSABLE_ENTITY, true).outcome_unknown);
    }
}
