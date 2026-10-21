use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashSet;
use std::fs;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};

use crate::local_paths;

/// Serializes historical-source initialization and migration. Municipal action
/// handlers have retired; this lock protects the preserved import boundary.
fn city_work_write_lock() -> &'static Mutex<()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(()))
}

#[derive(Deserialize, Serialize, Clone)]
pub struct MeetingBody {
    pub id: String,
    pub name: String,
    pub body_type: String,
    pub statutory_basis: String,
    pub meeting_cadence: String,
    pub default_notice_days: u32,
    pub quorum_rule: String,
    pub status: String,
    pub created_at_unix_seconds: u64,
}

#[derive(Deserialize, Serialize, Clone)]
pub struct MeetingMember {
    pub id: String,
    pub body_id: String,
    pub body_name: String,
    pub name: String,
    pub role: String,
    #[serde(default)]
    pub term_start: String,
    #[serde(default)]
    pub term_end: String,
    #[serde(default)]
    pub email: String,
    pub status: String,
    pub created_at_unix_seconds: u64,
}

#[derive(Deserialize, Serialize, Clone)]
pub struct AgendaItem {
    pub id: String,
    pub title: String,
    pub status: String,
    pub visibility: String,
    #[serde(default)]
    pub source_module: String,
    #[serde(default)]
    pub source_record_id: String,
    #[serde(default)]
    pub source_reference: String,
    #[serde(default)]
    pub department: String,
}

#[derive(Deserialize, Serialize, Clone)]
pub struct AgendaIntake {
    pub id: String,
    pub title: String,
    pub submitter: String,
    pub department: String,
    pub summary: String,
    pub source_reference: String,
    #[serde(default)]
    pub requested_meeting_date: String,
    pub status: String,
    #[serde(default)]
    pub review_note: String,
    #[serde(default)]
    pub meeting_id: String,
    #[serde(default)]
    pub agenda_item_id: String,
    pub created_at_unix_seconds: u64,
    #[serde(default)]
    pub reviewed_at_unix_seconds: Option<u64>,
    #[serde(default)]
    pub promoted_at_unix_seconds: Option<u64>,
}

#[derive(Deserialize, Serialize, Clone)]
pub struct StaffReportRecord {
    pub id: String,
    pub agenda_item_id: String,
    pub agenda_item_title: String,
    pub recommendation: String,
    pub background: String,
    pub analysis: String,
    pub fiscal_impact: String,
    pub alternatives: String,
    pub prior_actions: String,
    pub prepared_by: String,
    #[serde(default)]
    pub revision_note: String,
    pub created_at_unix_seconds: u64,
}

#[derive(Deserialize, Serialize, Clone)]
pub struct PublicComment {
    pub id: String,
    pub commenter_name: String,
    #[serde(default)]
    pub commenter_contact: String,
    #[serde(default)]
    pub mode: String,
    #[serde(default)]
    pub topic: String,
    pub body: String,
    pub status: String,
    #[serde(default)]
    pub redacted_body: String,
    #[serde(default)]
    pub redaction_basis: String,
    #[serde(default)]
    pub reviewed_at_unix_seconds: Option<u64>,
    #[serde(default)]
    pub redacted_at_unix_seconds: Option<u64>,
    pub submitted_at_unix_seconds: u64,
}

#[derive(Deserialize, Serialize, Clone)]
pub struct NoticePosting {
    pub id: String,
    pub location: String,
    pub method: String,
    pub confirmation: String,
    #[serde(default)]
    pub posted_on: String,
    #[serde(default)]
    pub time_zone: String,
    #[serde(default)]
    pub checklist_id: String,
    pub posted_at_unix_seconds: u64,
}

#[derive(Deserialize, Serialize, Clone)]
pub struct NoticeChecklist {
    pub id: String,
    pub meeting_type: String,
    pub statutory_basis: String,
    pub posting_deadline: String,
    pub time_zone: String,
    pub human_approval: bool,
    pub status: String,
    pub checked_at_unix_seconds: u64,
}

#[derive(Deserialize, Serialize, Clone)]
pub struct MeetingAttachment {
    pub id: String,
    pub title: String,
    pub original_path: String,
    pub stored_path: String,
    pub citation: String,
    pub sha256: String,
    pub size_bytes: u64,
    pub packet_section: String,
    pub access_level: String,
    pub added_by: String,
    pub created_at_unix_seconds: u64,
}

#[derive(Deserialize, Serialize, Clone)]
pub struct PacketAssemblyRecord {
    pub id: String,
    pub packet_title: String,
    pub prepared_by: String,
    pub review_note: String,
    pub agenda_item_count: usize,
    pub public_attachment_count: usize,
    pub closed_session_attachment_count: usize,
    pub status: String,
    pub created_at_unix_seconds: u64,
    pub finalized_at_unix_seconds: u64,
}

#[derive(Deserialize, Serialize, Clone)]
pub struct MeetingExportBundle {
    pub id: String,
    pub export_path: String,
    pub manifest_path: String,
    pub integrity_manifest_path: String,
    pub export_hash: String,
    pub manifest_hash: String,
    pub public_record: bool,
    pub agenda_item_count: usize,
    pub notice_checklist_count: usize,
    pub notice_posting_count: usize,
    pub public_attachment_count: usize,
    pub closed_session_attachment_count: usize,
    pub packet_finalization_count: usize,
    pub attendance_record_count: usize,
    pub quorum_check_count: usize,
    pub minute_citation_count: usize,
    pub motion_count: usize,
    pub roll_call_vote_count: usize,
    pub outcome_count: usize,
    pub action_item_count: usize,
    pub public_comment_count: usize,
    pub generated_at_unix_seconds: u64,
}

#[derive(Deserialize, Serialize, Clone)]
pub struct MinuteCitation {
    pub id: String,
    pub sentence: String,
    pub source_type: String,
    pub source_reference: String,
    pub note: String,
    pub access_level: String,
    pub created_at_unix_seconds: u64,
}

#[derive(Deserialize, Serialize, Clone)]
pub struct MotionRecord {
    pub id: String,
    pub text: String,
    pub mover: String,
    #[serde(default)]
    pub seconder: String,
    pub disposition: String,
    #[serde(default)]
    pub vote_reference: String,
    pub created_at_unix_seconds: u64,
}

#[derive(Deserialize, Serialize, Clone)]
pub struct MemberVoteRecord {
    pub id: String,
    pub motion_id: String,
    pub motion_text: String,
    pub member_id: String,
    pub member_name: String,
    pub vote: String,
    pub created_at_unix_seconds: u64,
}

#[derive(Deserialize, Serialize, Clone)]
pub struct MeetingAttendanceRecord {
    pub id: String,
    pub member_id: String,
    pub member_name: String,
    pub status: String,
    #[serde(default)]
    pub note: String,
    #[serde(default)]
    pub recorded_by: String,
    pub created_at_unix_seconds: u64,
}

#[derive(Deserialize, Serialize, Clone)]
pub struct QuorumCheckRecord {
    pub id: String,
    pub quorum_rule: String,
    pub required_count: usize,
    pub roster_count: usize,
    pub present_count: usize,
    pub remote_count: usize,
    pub absent_count: usize,
    pub recused_count: usize,
    pub status: String,
    pub review_note: String,
    pub created_at_unix_seconds: u64,
}

#[derive(Deserialize, Serialize, Clone)]
pub struct MeetingActionRecord {
    pub id: String,
    pub description: String,
    #[serde(default)]
    pub owner: String,
    #[serde(default)]
    pub due_date: String,
    pub status: String,
    #[serde(default)]
    pub source_reference: String,
    pub created_at_unix_seconds: u64,
}

#[derive(Deserialize, Serialize, Clone)]
pub struct AdoptedLegislationRecord {
    pub id: String,
    #[serde(default)]
    pub code_source_id: String,
    pub meeting_id: String,
    pub meeting_title: String,
    pub legislation_type: String,
    pub title: String,
    pub text: String,
    #[serde(default)]
    pub effective_date: String,
    #[serde(default)]
    pub codification_section_hint: String,
    #[serde(default)]
    pub source_motion_id: String,
    #[serde(default)]
    pub source_motion_text: String,
    #[serde(default)]
    pub source_agenda_item_id: String,
    #[serde(default)]
    pub source_agenda_item_title: String,
    pub handoff_status: String,
    pub created_at_unix_seconds: u64,
}

#[derive(Deserialize, Serialize, Clone)]
pub struct ClosedSessionRecord {
    pub id: String,
    pub statutory_basis: String,
    #[serde(default)]
    pub topics: Vec<String>,
    #[serde(default)]
    pub attendees: Vec<String>,
    pub entered_at: String,
    pub exited_at: String,
    pub reconvene_statement: String,
    #[serde(default)]
    pub staff_notes_reference: String,
    pub created_at_unix_seconds: u64,
}

#[derive(Deserialize, Serialize, Clone)]
pub struct Meeting {
    pub id: String,
    #[serde(default)]
    pub body_id: String,
    #[serde(default)]
    pub body_name: String,
    pub title: String,
    pub meeting_date: String,
    pub status: String,
    pub notice_status: String,
    #[serde(default)]
    pub notice_checklists: Vec<NoticeChecklist>,
    #[serde(default)]
    pub notice_postings: Vec<NoticePosting>,
    pub summary: String,
    pub agenda_items: Vec<AgendaItem>,
    #[serde(default)]
    pub staff_reports: Vec<StaffReportRecord>,
    #[serde(default)]
    pub attachments: Vec<MeetingAttachment>,
    #[serde(default)]
    pub packet_assemblies: Vec<PacketAssemblyRecord>,
    pub minutes: String,
    #[serde(default)]
    pub minute_citations: Vec<MinuteCitation>,
    #[serde(default)]
    pub motions: Vec<MotionRecord>,
    #[serde(default)]
    pub member_votes: Vec<MemberVoteRecord>,
    #[serde(default)]
    pub attendance_records: Vec<MeetingAttendanceRecord>,
    #[serde(default)]
    pub quorum_checks: Vec<QuorumCheckRecord>,
    #[serde(default)]
    pub votes: Vec<String>,
    #[serde(default)]
    pub action_items: Vec<String>,
    #[serde(default)]
    pub action_records: Vec<MeetingActionRecord>,
    #[serde(default)]
    pub adopted_legislation: Vec<AdoptedLegislationRecord>,
    #[serde(default)]
    pub closed_sessions: Vec<ClosedSessionRecord>,
    #[serde(default)]
    pub resident_comments: Vec<String>,
    #[serde(default)]
    pub public_comments: Vec<PublicComment>,
    #[serde(default)]
    pub exports: Vec<String>,
    #[serde(default)]
    pub export_bundles: Vec<MeetingExportBundle>,
    #[serde(default)]
    pub minutes_adopted_at_unix_seconds: Option<u64>,
    #[serde(default)]
    pub minutes_signed_by: String,
    #[serde(default)]
    pub minutes_signature_attestation: String,
    #[serde(default)]
    pub minutes_signed_at_unix_seconds: Option<u64>,
    #[serde(default)]
    pub archived_at_unix_seconds: Option<u64>,
    pub created_at_unix_seconds: u64,
}

#[derive(Deserialize, Serialize, Clone)]
pub struct RecordsTimelineEntry {
    pub id: String,
    pub action: String,
    pub actor: String,
    pub note: String,
    pub created_at_unix_seconds: u64,
}

#[derive(Deserialize, Serialize, Clone)]
pub struct RecordsPublicStatusEvent {
    pub id: String,
    pub label: String,
    pub summary: String,
    pub status: String,
    pub created_at_unix_seconds: u64,
}

#[derive(Deserialize, Serialize, Clone)]
pub struct RecordsMessage {
    pub id: String,
    pub author: String,
    pub author_role: String,
    pub body: String,
    pub visibility: String,
    pub created_at_unix_seconds: u64,
}

#[derive(Deserialize, Serialize, Clone)]
pub struct RecordsDocument {
    pub id: String,
    pub title: String,
    pub original_path: String,
    pub stored_path: String,
    pub citation: String,
    pub sha256: String,
    pub size_bytes: u64,
    #[serde(default)]
    pub release_original_path: String,
    #[serde(default)]
    pub release_stored_path: String,
    #[serde(default)]
    pub release_file_name: String,
    #[serde(default)]
    pub release_sha256: String,
    #[serde(default)]
    pub release_size_bytes: u64,
    #[serde(default)]
    pub release_status: String,
    #[serde(default)]
    pub release_note: String,
    #[serde(default)]
    pub release_added_by: String,
    #[serde(default)]
    pub release_added_at_unix_seconds: Option<u64>,
    pub status: String,
    pub added_by: String,
    pub created_at_unix_seconds: u64,
}

#[derive(Deserialize, Serialize, Clone)]
pub struct RecordsFeeLineItem {
    pub id: String,
    pub description: String,
    #[serde(default)]
    pub schedule_basis: String,
    pub amount_cents: i64,
    pub created_at_unix_seconds: u64,
}

#[derive(Deserialize, Serialize, Clone)]
pub struct RecordsExemptionDecision {
    pub id: String,
    pub source: String,
    pub kind: String,
    pub finding: String,
    pub decision: String,
    pub basis: String,
    pub reviewer: String,
    pub created_at_unix_seconds: u64,
}

#[derive(Deserialize, Serialize, Clone)]
pub struct RecordsSearchResult {
    pub id: String,
    pub title: String,
    pub citation: String,
    pub summary: String,
    pub status: String,
}

#[derive(Deserialize, Serialize, Clone)]
pub struct RecordsSearchSession {
    pub id: String,
    pub query: String,
    pub locations: String,
    pub reviewer: String,
    pub results: Vec<RecordsSearchResult>,
    pub created_at_unix_seconds: u64,
}

#[derive(Deserialize, Serialize, Clone)]
pub struct RecordsReleasePackage {
    pub id: String,
    pub export_path: String,
    pub package_hash: String,
    pub document_count: usize,
    #[serde(default)]
    pub release_artifact_count: usize,
    pub search_session_count: usize,
    pub release_count: usize,
    pub redacted_count: usize,
    pub exempt_count: usize,
    pub created_at_unix_seconds: u64,
}

#[derive(Deserialize, Serialize, Clone)]
pub struct RecordsRequest {
    pub id: String,
    #[serde(default)]
    pub public_tracking_number: String,
    pub requester: String,
    #[serde(default)]
    pub requester_contact: String,
    #[serde(default)]
    pub submitted_via: String,
    pub summary: String,
    pub deadline: String,
    #[serde(default)]
    pub deadline_basis: String,
    pub status: String,
    #[serde(default)]
    pub assigned_to: String,
    #[serde(default)]
    pub clarification_notes: Vec<String>,
    #[serde(default)]
    pub search_notes: Vec<String>,
    #[serde(default)]
    pub search_sessions: Vec<RecordsSearchSession>,
    #[serde(default)]
    pub exemption_reviews: Vec<String>,
    #[serde(default)]
    pub exemption_decisions: Vec<RecordsExemptionDecision>,
    #[serde(default)]
    pub fee_estimate: String,
    #[serde(default)]
    pub fee_line_items: Vec<RecordsFeeLineItem>,
    #[serde(default)]
    pub fee_waiver_reason: String,
    #[serde(default)]
    pub citations: Vec<String>,
    #[serde(default)]
    pub response_draft: String,
    #[serde(default)]
    pub approval_notes: Vec<String>,
    #[serde(default)]
    pub exports: Vec<String>,
    #[serde(default)]
    pub release_packages: Vec<RecordsReleasePackage>,
    #[serde(default)]
    pub timeline: Vec<RecordsTimelineEntry>,
    #[serde(default)]
    pub public_status_events: Vec<RecordsPublicStatusEvent>,
    #[serde(default)]
    pub messages: Vec<RecordsMessage>,
    #[serde(default)]
    pub documents: Vec<RecordsDocument>,
    #[serde(default)]
    pub deadline_reviewed_at_unix_seconds: Option<u64>,
    #[serde(default)]
    pub approved_at_unix_seconds: Option<u64>,
    #[serde(default)]
    pub fulfilled_at_unix_seconds: Option<u64>,
    #[serde(default)]
    pub closed_at_unix_seconds: Option<u64>,
    pub created_at_unix_seconds: u64,
}

#[derive(Deserialize, Serialize, Clone)]
pub struct CodeVersionEntry {
    pub id: String,
    pub label: String,
    pub source: String,
    pub authoritative_url: String,
    pub note: String,
    pub status: String,
    pub recorded_at_unix_seconds: u64,
}

#[derive(Deserialize, Serialize, Clone)]
pub struct CodeSource {
    pub id: String,
    pub title: String,
    pub citation: String,
    pub body: String,
    pub status: String,
    #[serde(default)]
    pub source_original_path: String,
    #[serde(default)]
    pub source_stored_path: String,
    #[serde(default)]
    pub source_file_name: String,
    #[serde(default)]
    pub source_sha256: String,
    #[serde(default)]
    pub source_size_bytes: u64,
    #[serde(default)]
    pub imported_by: String,
    #[serde(default)]
    pub codifier_name: String,
    #[serde(default)]
    pub authoritative_url: String,
    #[serde(default)]
    pub version_label: String,
    #[serde(default = "default_code_sync_status")]
    pub codifier_sync_status: String,
    #[serde(default)]
    pub codifier_sync_errors: Vec<String>,
    #[serde(default)]
    pub last_codifier_sync_at_unix_seconds: Option<u64>,
    #[serde(default)]
    pub stale_since_unix_seconds: Option<u64>,
    #[serde(default)]
    pub amendment_notes: Vec<String>,
    #[serde(default)]
    pub version_history: Vec<CodeVersionEntry>,
    #[serde(default)]
    pub staff_guidance: String,
    #[serde(default)]
    pub plain_language_summary: String,
    #[serde(default)]
    pub guidance_approved_at_unix_seconds: Option<u64>,
    #[serde(default = "default_code_public_status")]
    pub public_status: String,
    #[serde(default)]
    pub public_exports: Vec<String>,
    #[serde(default)]
    pub published_at_unix_seconds: Option<u64>,
    pub created_at_unix_seconds: u64,
}

#[derive(Deserialize, Serialize, Clone)]
pub struct CodeHandoff {
    pub id: String,
    pub source_id: String,
    pub title: String,
    pub summary: String,
    pub status: String,
    pub created_at_unix_seconds: u64,
}

#[derive(Deserialize, Serialize, Clone)]
pub struct AuditEntry {
    pub id: String,
    pub module_id: String,
    pub action: String,
    pub summary: String,
    pub created_at_unix_seconds: u64,
    #[serde(default)]
    pub previous_hash: String,
    #[serde(default)]
    pub entry_hash: String,
}

#[derive(Deserialize, Serialize, Clone)]
pub struct PublicationEvent {
    pub id: String,
    pub source_module: String,
    pub source_record_id: String,
    pub record_type: String,
    pub public_payload: String,
    pub payload_hash: String,
    pub published_at_unix_seconds: u64,
    #[serde(default)]
    pub retracted_at_unix_seconds: Option<u64>,
    #[serde(default)]
    pub retracted_by: String,
}

#[derive(Deserialize, Serialize, Clone)]
pub struct NotificationEvent {
    pub id: String,
    pub module_id: String,
    pub record_id: String,
    pub audience: String,
    pub channel: String,
    pub subject: String,
    pub body: String,
    pub status: String,
    pub created_at_unix_seconds: u64,
    #[serde(default)]
    pub sent_at_unix_seconds: Option<u64>,
}

#[derive(Deserialize, Serialize)]
struct ExportIntegrityManifest {
    schema_version: u16,
    export_file: String,
    export_path: String,
    format: String,
    size_bytes: u64,
    sha256: String,
    created_at_unix_seconds: u64,
    generated_by: String,
}

#[derive(Deserialize, Serialize)]
struct MeetingExportBundleManifest {
    schema_version: u16,
    bundle_type: String,
    meeting_id: String,
    meeting_title: String,
    meeting_date: String,
    body_name: String,
    public_record: bool,
    packet_file: String,
    packet_path: String,
    packet_sha256: String,
    packet_size_bytes: u64,
    integrity_manifest_file: String,
    integrity_manifest_path: String,
    integrity_manifest_sha256: String,
    counts: MeetingExportBundleCounts,
    source_references: Vec<String>,
    limitations: Vec<String>,
    generated_by: String,
    generated_at_unix_seconds: u64,
}

#[derive(Deserialize, Serialize, Clone)]
struct MeetingExportBundleCounts {
    agenda_items: usize,
    notice_checklists: usize,
    notice_postings: usize,
    public_attachments: usize,
    closed_session_attachments: usize,
    packet_finalizations: usize,
    attendance_records: usize,
    quorum_checks: usize,
    minute_citations: usize,
    motions: usize,
    roll_call_votes: usize,
    outcomes: usize,
    action_items: usize,
    public_comments: usize,
}

#[derive(Serialize, Clone)]
pub struct SearchResult {
    pub module_id: String,
    pub record_id: String,
    pub title: String,
    pub snippet: String,
    pub citation: String,
    pub status: String,
}

const CITY_WORK_SCHEMA_VERSION: u32 = 1;

fn current_city_work_schema_version() -> u32 {
    CITY_WORK_SCHEMA_VERSION
}

#[derive(Deserialize, Serialize, Clone)]
pub struct CityWorkState {
    #[serde(default = "current_city_work_schema_version")]
    pub schema_version: u32,
    #[serde(default)]
    pub demo_fixture: Option<crate::demo_fixture::DemoFixtureMarker>,
    #[serde(default)]
    pub meeting_bodies: Vec<MeetingBody>,
    #[serde(default)]
    pub meeting_members: Vec<MeetingMember>,
    #[serde(default)]
    pub agenda_intakes: Vec<AgendaIntake>,
    pub meetings: Vec<Meeting>,
    pub records_requests: Vec<RecordsRequest>,
    pub code_sources: Vec<CodeSource>,
    pub code_handoffs: Vec<CodeHandoff>,
    #[serde(default)]
    pub adopted_legislation: Vec<AdoptedLegislationRecord>,
    pub audit_entries: Vec<AuditEntry>,
    #[serde(default)]
    pub publication_events: Vec<PublicationEvent>,
    #[serde(default)]
    pub notification_events: Vec<NotificationEvent>,
    #[serde(default)]
    pub access: CivicAccessState,
}

impl Default for CityWorkState {
    fn default() -> Self {
        Self {
            schema_version: CITY_WORK_SCHEMA_VERSION,
            demo_fixture: None,
            meeting_bodies: Vec::new(),
            meeting_members: Vec::new(),
            agenda_intakes: Vec::new(),
            meetings: Vec::new(),
            records_requests: Vec::new(),
            code_sources: Vec::new(),
            code_handoffs: Vec::new(),
            adopted_legislation: Vec::new(),
            audit_entries: Vec::new(),
            publication_events: Vec::new(),
            notification_events: Vec::new(),
            access: CivicAccessState::default(),
        }
    }
}

#[derive(Deserialize, Serialize, Clone, Default)]
pub struct CivicAccessState {
    #[serde(default)]
    pub reviews: Vec<StoredAccessibilityReview>,
    #[serde(default)]
    pub audit_events: Vec<CivicAccessAuditEvent>,
}

#[derive(Deserialize, Serialize, Clone)]
pub struct AccessibilityFinding {
    pub code: String,
    pub severity: String,
    pub message: String,
    pub fix: String,
    pub wcag_reference: String,
}

#[derive(Deserialize, Serialize, Clone)]
pub struct StoredAccessibilityReview {
    pub review_id: String,
    pub title: String,
    pub body: String,
    #[serde(default)]
    pub has_alt_text: bool,
    #[serde(default)]
    pub language: String,
    #[serde(default)]
    pub status: String,
    #[serde(default)]
    pub findings: Vec<AccessibilityFinding>,
    #[serde(default)]
    pub disclaimer: String,
    #[serde(default)]
    pub created_at_unix_seconds: u64,
    // Advisory local-AI remediation analysis layered on top of the
    // deterministic findings; never affects status. None when the AI engine
    // was not ready (or failed) at review time. serde(default) keeps older
    // saved city-work.json states loading.
    #[serde(default)]
    pub ai_analysis: Option<String>,
    #[serde(default)]
    pub ai_analysis_model: Option<String>,
}

#[derive(Deserialize, Serialize, Clone)]
pub struct CivicAccessAuditEvent {
    pub event_id: String,
    pub action: String,
    pub subject_id: Option<String>,
    pub actor: String,
    pub created_at_unix_seconds: u64,
}

#[derive(Serialize)]
pub struct CityWorkActionResult {
    pub accepted: bool,
    pub action: String,
    pub status: &'static str,
    pub message: String,
    pub next_action: String,
    pub state: CityWorkState,
    pub search_results: Vec<SearchResult>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub next_steps: Vec<String>,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub disclaimer: String,
}

fn workflows_path() -> PathBuf {
    local_paths::data_root()
        .join("workflows")
        .join("city-work.json")
}

fn default_code_public_status() -> String {
    "internal draft".to_string()
}

fn default_code_sync_status() -> String {
    "not synced".to_string()
}

fn read_state() -> Result<CityWorkState, String> {
    crate::records_authority::legacy_allowed()?;
    let path = workflows_path();
    if !path.is_file() {
        return Ok(CityWorkState::default());
    }
    let contents = fs::read_to_string(&path)
        .map_err(|error| format!("Could not read local workflow state: {error}"))?;
    let serialized_state: Value = serde_json::from_str(&contents)
        .map_err(|error| format!("Could not parse local workflow state: {error}"))?;
    let stored_schema_version = match serialized_state.get("schema_version") {
        None => None,
        Some(version) => {
            let version = version.as_u64().ok_or_else(|| {
                "Could not parse local workflow state: schema_version must be a positive integer"
                    .to_string()
            })?;
            Some(u32::try_from(version).map_err(|_| {
                "Could not parse local workflow state: schema_version is out of range".to_string()
            })?)
        }
    };
    if let Some(version) = stored_schema_version {
        if version != CITY_WORK_SCHEMA_VERSION {
            return Err(format!(
                "Unsupported city-work schema version {version}; this build supports version {CITY_WORK_SCHEMA_VERSION}. No data was changed."
            ));
        }
    }
    let mut state: CityWorkState = serde_json::from_value(serialized_state)
        .map_err(|error| format!("Could not parse local workflow state: {error}"))?;
    let normalized_adopted_legislation = normalize_adopted_legislation_index(&mut state);
    if stored_schema_version.is_none() {
        let backup = crate::supervisor::supervisor_action("backup", None).map_err(|error| {
            format!(
                "The legacy city-work state was not upgraded because its verified backup failed: {error}"
            )
        })?;
        if !backup.accepted {
            return Err(format!(
                "The legacy city-work state was not upgraded because its backup was not accepted: {}",
                backup.message
            ));
        }
        write_state(&state)?;
    } else if normalized_adopted_legislation {
        write_state(&state)?;
    }
    Ok(state)
}

fn normalize_adopted_legislation_index(state: &mut CityWorkState) -> bool {
    let previous_ids = state
        .adopted_legislation
        .iter()
        .map(|record| record.id.clone())
        .collect::<Vec<_>>();
    let mut seen = HashSet::new();
    let mut records = Vec::new();
    for record in state.adopted_legislation.iter().cloned().chain(
        state
            .meetings
            .iter()
            .flat_map(|meeting| meeting.adopted_legislation.iter().cloned()),
    ) {
        if seen.insert(record.id.clone()) {
            records.push(record);
        }
    }
    records.sort_by(|left, right| {
        right
            .created_at_unix_seconds
            .cmp(&left.created_at_unix_seconds)
            .then_with(|| left.id.cmp(&right.id))
    });
    let next_ids = records
        .iter()
        .map(|record| record.id.clone())
        .collect::<Vec<_>>();
    let changed = previous_ids != next_ids;
    state.adopted_legislation = records;
    changed
}

fn write_state(state: &CityWorkState) -> Result<(), String> {
    crate::records_authority::legacy_allowed()?;
    let path = workflows_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Could not create {}: {error}", parent.display()))?;
    }
    crate::atomic_io::atomic_write_json(&path, state)
}

pub fn city_work_state() -> Result<CityWorkState, String> {
    read_state()
}

pub(crate) fn migration_write_fence() -> Result<std::sync::MutexGuard<'static, ()>, String> {
    city_work_write_lock()
        .lock()
        .map_err(|_| "City workflow lock was poisoned; restart Townlight.".to_string())
}

pub(crate) fn initialize_empty_migration_source() -> Result<(), String> {
    // Caller holds migration_write_fence. Preserve existing bytes exactly.
    if !workflows_path().exists() {
        write_state(&CityWorkState::default())?;
    }
    Ok(())
}

fn public_comment_projection(comment: &PublicComment) -> Option<PublicComment> {
    if comment.status != "reviewed for public record"
        && comment.status != "redacted for public record"
    {
        return None;
    }
    let mut public_comment = comment.clone();
    public_comment.commenter_contact.clear();
    if public_comment.status == "redacted for public record"
        && !public_comment.redacted_body.is_empty()
    {
        public_comment.body = public_comment.redacted_body.clone();
    }
    Some(public_comment)
}

fn public_meeting_projection(meeting: &Meeting) -> Option<Meeting> {
    let is_public_notice = meeting.notice_status == "public notice ready";
    let is_public_archive =
        meeting.status == "archived public record" || meeting.archived_at_unix_seconds.is_some();
    if !is_public_notice && !is_public_archive {
        return None;
    }
    let mut public_meeting = meeting.clone();
    public_meeting.exports.clear();
    public_meeting.agenda_items = meeting
        .agenda_items
        .iter()
        .filter(|item| item.visibility != "staff draft")
        .cloned()
        .collect();
    public_meeting.public_comments = meeting
        .public_comments
        .iter()
        .filter_map(public_comment_projection)
        .collect();
    public_meeting.attachments = meeting
        .attachments
        .iter()
        .filter(|attachment| attachment.access_level == "public packet")
        .cloned()
        .map(|mut attachment| {
            attachment.original_path.clear();
            attachment.stored_path.clear();
            attachment.added_by.clear();
            attachment
        })
        .collect();
    public_meeting.export_bundles = meeting
        .export_bundles
        .iter()
        .filter(|bundle| bundle.public_record)
        .cloned()
        .map(|mut bundle| {
            bundle.export_path.clear();
            bundle.manifest_path.clear();
            bundle.integrity_manifest_path.clear();
            bundle
        })
        .collect();
    public_meeting.staff_reports = meeting.staff_reports.clone();
    public_meeting.minute_citations = meeting
        .minute_citations
        .iter()
        .filter(|citation| citation.access_level == "public record")
        .cloned()
        .collect();
    public_meeting.closed_sessions = meeting
        .closed_sessions
        .iter()
        .cloned()
        .map(|mut record| {
            record.attendees.clear();
            record.staff_notes_reference.clear();
            record
        })
        .collect();
    if !is_public_archive {
        public_meeting.minutes.clear();
        public_meeting.minute_citations.clear();
        public_meeting.minutes_signed_by.clear();
        public_meeting.minutes_signature_attestation.clear();
        public_meeting.minutes_signed_at_unix_seconds = None;
        public_meeting.motions.clear();
        public_meeting.member_votes.clear();
        public_meeting.attendance_records.clear();
        public_meeting.quorum_checks.clear();
        public_meeting.votes.clear();
        public_meeting.staff_reports.clear();
        public_meeting.action_items.clear();
        public_meeting.action_records.clear();
        public_meeting.adopted_legislation.clear();
        public_meeting.closed_sessions.clear();
        public_meeting.packet_assemblies.clear();
        public_meeting.resident_comments.clear();
        public_meeting.export_bundles.clear();
    }
    Some(public_meeting)
}

fn public_records_request_projection(request: &RecordsRequest) -> Option<RecordsRequest> {
    let is_released = request.status == "fulfilled"
        || request.status == "closed"
        || request.fulfilled_at_unix_seconds.is_some();
    if !is_released {
        return None;
    }
    Some(public_records_request_status_projection(request))
}

fn public_records_request_status_projection(request: &RecordsRequest) -> RecordsRequest {
    let mut public_request = request.clone();
    public_request.requester_contact.clear();
    public_request.assigned_to.clear();
    public_request.clarification_notes.clear();
    public_request.search_notes.clear();
    public_request.search_sessions.clear();
    public_request.exemption_reviews.clear();
    public_request.exemption_decisions.clear();
    public_request.fee_estimate.clear();
    public_request.fee_line_items.clear();
    public_request.fee_waiver_reason.clear();
    public_request.response_draft.clear();
    public_request.approval_notes.clear();
    public_request.release_packages.clear();
    public_request.timeline.clear();
    public_request.messages.clear();
    public_request.documents.clear();
    public_request
}

fn public_code_source_projection(source: &CodeSource) -> Option<CodeSource> {
    if source.public_status != "published" {
        return None;
    }
    let mut public_source = source.clone();
    public_source.staff_guidance.clear();
    public_source.codifier_sync_errors.clear();
    public_source.amendment_notes.clear();
    public_source.source_original_path.clear();
    public_source.source_stored_path.clear();
    public_source.imported_by.clear();
    for entry in &mut public_source.version_history {
        entry.note.clear();
    }
    if public_source.guidance_approved_at_unix_seconds.is_none() {
        public_source.plain_language_summary.clear();
    }
    Some(public_source)
}

pub(crate) fn city_work_public_projection(state: &CityWorkState) -> CityWorkState {
    CityWorkState {
        schema_version: state.schema_version,
        demo_fixture: state.demo_fixture.clone(),
        meeting_bodies: state.meeting_bodies.clone(),
        meeting_members: state.meeting_members.clone(),
        agenda_intakes: Vec::new(),
        meetings: state
            .meetings
            .iter()
            .filter_map(public_meeting_projection)
            .collect(),
        records_requests: state
            .records_requests
            .iter()
            .filter_map(public_records_request_projection)
            .collect(),
        code_sources: state
            .code_sources
            .iter()
            .filter_map(public_code_source_projection)
            .collect(),
        code_handoffs: Vec::new(),
        adopted_legislation: Vec::new(),
        audit_entries: Vec::new(),
        publication_events: state
            .publication_events
            .iter()
            .filter(|event| event.retracted_at_unix_seconds.is_none())
            .cloned()
            .collect(),
        notification_events: Vec::new(),
        access: CivicAccessState::default(),
    }
}

pub fn public_city_work_state() -> Result<CityWorkState, String> {
    read_state().map(|state| city_work_public_projection(&state))
}

pub(crate) fn city_work_action_allows_public(action: &str) -> bool {
    matches!(
        action,
        "submit-public-comment"
            | "submit-public-records-request"
            | "lookup-public-records-request"
            | "add-public-records-message"
            | "answer-code-question"
    )
}

pub fn city_work_action(
    _action: &str,
    _payload: Option<&Value>,
) -> Result<CityWorkActionResult, String> {
    crate::records_authority::legacy_allowed()?;
    Err("Legacy municipal workflow actions are retired. Finish Records Migration in System Health, then use the Python product workflow.".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::env;

    fn with_temp_state_dir<T>(test: impl FnOnce(PathBuf) -> T) -> T {
        let _guard = crate::first_run::test_env_lock()
            .lock()
            .expect("test env lock");
        let root = env::temp_dir().join(format!(
            "civicsuite-desktop-workflows-test-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&root);
        env::set_var("CIVICSUITE_DESKTOP_STATE_DIR", &root);
        let result = test(root.clone());
        env::remove_var("CIVICSUITE_DESKTOP_STATE_DIR");
        let _ = fs::remove_dir_all(root);
        result
    }

    #[test]
    fn corrupt_city_work_json_is_error_not_default() {
        with_temp_state_dir(|_root| {
            std::fs::create_dir_all(workflows_path().parent().unwrap()).unwrap();
            std::fs::write(workflows_path(), b"{ this is : not valid json").unwrap();

            let result = read_state();
            assert!(
                result.is_err(),
                "corrupt city-work.json must surface an error, not a default"
            );
            let message = result.err().unwrap();
            assert!(
                message.contains("parse") || message.contains("Could not parse"),
                "corrupt state error must be a parse error, got: {message}"
            );
        });
    }

    #[test]
    fn new_city_work_state_uses_current_schema_version() {
        assert_eq!(
            CityWorkState::default().schema_version,
            CITY_WORK_SCHEMA_VERSION
        );
    }

    #[test]
    fn legacy_city_work_state_without_version_is_upgraded_on_read() {
        with_temp_state_dir(|_root| {
            std::fs::create_dir_all(workflows_path().parent().unwrap()).unwrap();
            let mut legacy_state = serde_json::to_value(CityWorkState::default()).unwrap();
            legacy_state
                .as_object_mut()
                .expect("workflow state serializes as an object")
                .remove("schema_version");
            std::fs::write(
                workflows_path(),
                serde_json::to_vec_pretty(&legacy_state).unwrap(),
            )
            .unwrap();

            let upgraded = read_state().expect("legacy state upgrades");
            assert_eq!(upgraded.schema_version, CITY_WORK_SCHEMA_VERSION);

            let backups = std::fs::read_dir(crate::local_paths::backup_root())
                .expect("schema upgrade backup root exists")
                .collect::<Result<Vec<_>, _>>()
                .expect("schema upgrade backups are readable");
            assert_eq!(
                backups.len(),
                1,
                "schema upgrade creates one verified backup"
            );

            let persisted: Value = serde_json::from_str(
                &std::fs::read_to_string(workflows_path()).expect("upgraded state persists"),
            )
            .unwrap();
            assert_eq!(
                persisted["schema_version"].as_u64(),
                Some(u64::from(CITY_WORK_SCHEMA_VERSION))
            );
        });
    }

    #[test]
    fn unsupported_future_city_work_schema_fails_without_rewriting_state() {
        with_temp_state_dir(|_root| {
            std::fs::create_dir_all(workflows_path().parent().unwrap()).unwrap();
            let mut future_state = serde_json::to_value(CityWorkState::default()).unwrap();
            future_state["schema_version"] = Value::from(u64::from(CITY_WORK_SCHEMA_VERSION + 1));
            let original = serde_json::to_vec_pretty(&future_state).unwrap();
            std::fs::write(workflows_path(), &original).unwrap();

            let error = read_state()
                .err()
                .expect("future schema version must fail closed");
            assert!(error.contains("Unsupported city-work schema version"));
            assert!(error.contains("No data was changed"));
            assert_eq!(
                std::fs::read(workflows_path()).expect("future state remains readable"),
                original
            );
        });
    }

    #[test]
    fn demo_town_is_never_loaded_automatically() {
        with_temp_state_dir(|_root| {
            let state = city_work_state().expect("empty state reads");
            assert!(state.demo_fixture.is_none());
            assert!(state.records_requests.is_empty());
        });
    }

    #[test]
    fn retired_actions_do_not_write_json() {
        with_temp_state_dir(|_dir| {
            let path = workflows_path();
            let actions = [
                "create-records-request",
                "create-meeting",
                "import-code-source",
                "accessibility-review",
                "post-notice",
                "load-demo-town",
                "search-city-knowledge",
            ];
            for action in actions {
                let err = city_work_action(action, None).err().unwrap();
                assert!(
                    err.contains("retired"),
                    "{action}: expected 'retired', got: {err}"
                );
                assert!(!path.exists(), "{action}: file should not exist");
            }
            write_state(&CityWorkState::default()).unwrap();
            let before = fs::read(&path).unwrap();
            for action in actions {
                let err = city_work_action(action, None).err().unwrap();
                assert!(err.contains("retired"), "{action}: expected 'retired'");
            }
            let after = fs::read(&path).unwrap();
            assert_eq!(before, after, "state file was modified by retired action");
        });
    }
}
