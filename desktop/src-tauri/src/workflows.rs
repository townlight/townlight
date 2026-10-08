use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::local_paths;

/// Serializes the read-modify-write of the city-work system of record so two
/// concurrent `city_work_action` invocations (same process, different
/// spawn_blocking worker threads) cannot lose-update each other. Single-instance
/// stops a SECOND process; this stops concurrent tasks WITHIN the one process.
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
    // Legacy requests deserialize at revision zero. Historical artifacts remain
    // available, but cannot fulfill a subsequently changed response revision.
    #[serde(default)]
    pub release_revision: u64,
    #[serde(default)]
    pub exported_revision: u64,
    #[serde(default)]
    pub packaged_revision: u64,
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

fn exports_dir() -> PathBuf {
    local_paths::data_root().join("exports")
}

fn now_unix_seconds() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or(0)
}

fn new_id(prefix: &str, count: usize) -> String {
    format!("{prefix}-{}-{}", now_unix_seconds(), count + 1)
}

fn records_tracking_number(count: usize) -> String {
    format!("REQ-{:04}", count + 1)
}

fn default_code_public_status() -> String {
    "internal draft".to_string()
}

fn default_code_sync_status() -> String {
    "not synced".to_string()
}

fn read_state() -> Result<CityWorkState, String> {
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
    let path = workflows_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Could not create {}: {error}", parent.display()))?;
    }
    crate::atomic_io::atomic_write_json(&path, state)
}

fn city_work_state_is_empty(state: &CityWorkState) -> bool {
    state.demo_fixture.is_none()
        && state.meeting_bodies.is_empty()
        && state.meeting_members.is_empty()
        && state.agenda_intakes.is_empty()
        && state.meetings.is_empty()
        && state.records_requests.is_empty()
        && state.code_sources.is_empty()
        && state.code_handoffs.is_empty()
        && state.adopted_legislation.is_empty()
        && state.audit_entries.is_empty()
        && state.publication_events.is_empty()
        && state.notification_events.is_empty()
        && state.access.reviews.is_empty()
        && state.access.audit_events.is_empty()
}

fn current_demo_fixture_is_loaded(state: &CityWorkState) -> bool {
    state.demo_fixture.as_ref().is_some_and(|marker| {
        marker.fixture_id == crate::demo_fixture::FIXTURE_ID
            && marker.fixture_version == crate::demo_fixture::FIXTURE_VERSION
            && marker.fixture_sha256 == crate::demo_fixture::FIXTURE_SHA256
            && marker.municipality_name == crate::demo_fixture::FIXTURE_NAME
            && marker.watermark == crate::demo_fixture::WATERMARK
            && state
                .records_requests
                .iter()
                .any(|request| request.id == crate::demo_fixture::FIXTURE_REQUEST_ID)
    })
}

fn demo_fixture_export_banner(state: &CityWorkState) -> String {
    state
        .demo_fixture
        .as_ref()
        .map(|marker| {
            format!(
                "## Demo Fixture Identity\nMunicipality: {}\nFixture: {} v{}\nFixture SHA-256: {}\nWatermark: {}\n\n",
                marker.municipality_name,
                marker.fixture_id,
                marker.fixture_version,
                marker.fixture_sha256,
                marker.watermark
            )
        })
        .unwrap_or_default()
}

fn load_demo_town(state: &mut CityWorkState) -> Result<String, String> {
    let fixture = crate::demo_fixture::embedded_fixture()?;
    if current_demo_fixture_is_loaded(state) {
        return Ok(format!(
            "{} v{} is already loaded. No data was duplicated or changed. {}",
            crate::demo_fixture::FIXTURE_NAME,
            crate::demo_fixture::FIXTURE_VERSION,
            crate::demo_fixture::WATERMARK
        ));
    }
    if !city_work_state_is_empty(state) {
        return Err(
            "Demo data can only be loaded into an empty local profile. Existing city work was not changed. Create or restore an empty profile, then try again."
                .to_string(),
        );
    }
    let backup = crate::supervisor::supervisor_action("backup", None).map_err(|error| {
        format!("The verified pre-load backup failed, so no demo data was loaded: {error}")
    })?;
    if !backup.accepted {
        return Err(format!(
            "The pre-load backup was not accepted, so no demo data was loaded: {}",
            backup.message
        ));
    }

    let loaded_at = now_unix_seconds();
    let request = fixture
        .requests
        .first()
        .ok_or_else(|| "The canonical demo fixture has no Records request.".to_string())?;
    let search_sessions = fixture
        .expected
        .search
        .iter()
        .enumerate()
        .map(|(index, expected_search)| {
            let results = expected_search
                .record_ids
                .iter()
                .map(|record_id| {
                    let record = fixture
                        .records
                        .iter()
                        .find(|record| &record.record_id == record_id)
                        .ok_or_else(|| {
                            format!("The demo search references unknown record {record_id}.")
                        })?;
                    Ok(RecordsSearchResult {
                        id: record.record_id.clone(),
                        title: format!("{} — {}", record.title, crate::demo_fixture::WATERMARK),
                        citation: format!(
                            "fixture://{}/{}",
                            crate::demo_fixture::FIXTURE_ID,
                            record.record_id
                        ),
                        summary: format!(
                            "{}\n\n{}",
                            record.content,
                            crate::demo_fixture::WATERMARK
                        ),
                        status: "synthetic responsive record".to_string(),
                    })
                })
                .collect::<Result<Vec<_>, String>>()?;
            Ok(RecordsSearchSession {
                id: format!("rv-search-session-{:04}", index + 1),
                query: expected_search.query.clone(),
                locations: format!(
                    "Embedded Core fixture {} v{}",
                    crate::demo_fixture::FIXTURE_ID,
                    crate::demo_fixture::FIXTURE_VERSION
                ),
                reviewer: "Synthetic fixture ground truth".to_string(),
                results,
                created_at_unix_seconds: loaded_at,
            })
        })
        .collect::<Result<Vec<_>, String>>()?;
    let target_titles = fixture
        .records
        .iter()
        .filter(|record| request.target_record_ids.contains(&record.record_id))
        .map(|record| record.title.clone())
        .collect::<Vec<_>>();
    let demo_request = RecordsRequest {
        id: request.request_id.clone(),
        public_tracking_number: "DEMO-REQ-0001".to_string(),
        requester: "Synthetic public requester".to_string(),
        requester_contact: String::new(),
        submitted_via: format!(
            "Townlight canonical demo fixture {} v{}",
            crate::demo_fixture::FIXTURE_ID,
            crate::demo_fixture::FIXTURE_VERSION
        ),
        summary: format!("{} {}", request.description, crate::demo_fixture::WATERMARK),
        deadline: "Pending staff deadline review".to_string(),
        deadline_basis: format!(
            "{} — fictional demonstration policy; not legal guidance",
            request.policy_basis
        ),
        status: "received".to_string(),
        assigned_to: String::new(),
        clarification_notes: Vec::new(),
        search_notes: vec![format!(
            "Canonical fixture targets: {}. {}",
            target_titles.join("; "),
            crate::demo_fixture::WATERMARK
        )],
        search_sessions,
        exemption_reviews: Vec::new(),
        exemption_decisions: Vec::new(),
        fee_estimate: "$0.00 synthetic demonstration".to_string(),
        fee_line_items: Vec::new(),
        fee_waiver_reason: String::new(),
        citations: vec![format!(
            "Core fixture SHA-256 {}",
            crate::demo_fixture::FIXTURE_SHA256
        )],
        response_draft: String::new(),
        approval_notes: Vec::new(),
        exports: Vec::new(),
        release_packages: Vec::new(),
        timeline: vec![RecordsTimelineEntry {
            id: "rv-timeline-received-0001".to_string(),
            action: "received".to_string(),
            actor: "Townlight demo loader".to_string(),
            note: format!(
                "Loaded canonical synthetic request received at {}. {}",
                request.received_at,
                crate::demo_fixture::WATERMARK
            ),
            created_at_unix_seconds: loaded_at,
        }],
        public_status_events: vec![RecordsPublicStatusEvent {
            id: "rv-public-status-received-0001".to_string(),
            label: "Request received".to_string(),
            summary: format!(
                "Synthetic demonstration request only. {}",
                crate::demo_fixture::WATERMARK
            ),
            status: "received".to_string(),
            created_at_unix_seconds: loaded_at,
        }],
        messages: Vec::new(),
        documents: Vec::new(),
        deadline_reviewed_at_unix_seconds: None,
        approved_at_unix_seconds: None,
        release_revision: 0,
        exported_revision: 0,
        packaged_revision: 0,
        fulfilled_at_unix_seconds: None,
        closed_at_unix_seconds: None,
        created_at_unix_seconds: loaded_at,
    };

    state.demo_fixture = Some(crate::demo_fixture::DemoFixtureMarker {
        fixture_id: crate::demo_fixture::FIXTURE_ID.to_string(),
        fixture_version: crate::demo_fixture::FIXTURE_VERSION.to_string(),
        fixture_sha256: crate::demo_fixture::FIXTURE_SHA256.to_string(),
        municipality_name: crate::demo_fixture::FIXTURE_NAME.to_string(),
        watermark: crate::demo_fixture::WATERMARK.to_string(),
        loaded_at_unix_seconds: loaded_at,
    });
    state.records_requests.push(demo_request);
    push_audit(
        state,
        "civicrecords-ai",
        "load-demo-town",
        format!(
            "Loaded {} v{} after verified backup. Fixture SHA-256 {}. {}",
            crate::demo_fixture::FIXTURE_NAME,
            crate::demo_fixture::FIXTURE_VERSION,
            crate::demo_fixture::FIXTURE_SHA256,
            crate::demo_fixture::WATERMARK
        ),
    );
    Ok(format!(
        "Loaded {} v{} from Core's pinned fixture after a verified backup. {}",
        crate::demo_fixture::FIXTURE_NAME,
        crate::demo_fixture::FIXTURE_VERSION,
        crate::demo_fixture::WATERMARK
    ))
}

fn verify_or_restore_demo_state(previous: &CityWorkState) -> Result<CityWorkState, String> {
    let verification = read_state().and_then(|persisted| {
        if !current_demo_fixture_is_loaded(&persisted) {
            return Err("The persisted demo state failed read-back verification.".to_string());
        }
        Ok(persisted)
    });
    match verification {
        Ok(persisted) => Ok(persisted),
        Err(error) => {
            write_state(previous).map_err(|rollback_error| {
                format!(
                    "Demo load verification failed ({error}) and restoring the prior state also failed ({rollback_error}). Use the verified pre-load backup before continuing."
                )
            })?;
            Err(format!(
                "Demo load verification failed and the prior state was restored: {error}"
            ))
        }
    }
}

fn safe_file_stem(value: &str) -> String {
    let stem: String = value
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() {
                character.to_ascii_lowercase()
            } else {
                '-'
            }
        })
        .collect();
    stem.split('-')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("-")
}

fn export_manifest_path(export_path: &Path) -> PathBuf {
    let export_file = export_path
        .file_name()
        .map(|value| value.to_string_lossy().to_string())
        .unwrap_or_else(|| "export.md".to_string());
    export_path.with_file_name(format!("{export_file}.sha256.json"))
}

fn export_bundle_manifest_path(export_path: &Path) -> PathBuf {
    let export_file = export_path
        .file_name()
        .map(|value| value.to_string_lossy().to_string())
        .unwrap_or_else(|| "export.md".to_string());
    export_path.with_file_name(format!("{export_file}.records-ready-bundle.json"))
}

fn path_file_name(path: &Path, fallback: &str) -> String {
    path.file_name()
        .map(|value| value.to_string_lossy().to_string())
        .unwrap_or_else(|| fallback.to_string())
}

fn remove_export_artifacts(export_path: &Path) {
    let _ = fs::remove_file(export_path);
    let _ = fs::remove_file(export_manifest_path(export_path));
    let _ = fs::remove_file(export_bundle_manifest_path(export_path));
}

fn write_export_integrity_manifest(
    export_path: &Path,
    contents: &str,
    created_at_unix_seconds: u64,
) -> Result<(), String> {
    let export_file = export_path
        .file_name()
        .map(|value| value.to_string_lossy().to_string())
        .unwrap_or_else(|| "export.md".to_string());
    let manifest = ExportIntegrityManifest {
        schema_version: 1,
        export_file,
        export_path: export_path.to_string_lossy().to_string(),
        format: "markdown".to_string(),
        size_bytes: contents.len() as u64,
        sha256: hash_public_payload(contents),
        created_at_unix_seconds,
        generated_by: "Townlight Windows Local".to_string(),
    };
    let manifest_path = export_manifest_path(export_path);
    let manifest_contents = serde_json::to_string_pretty(&manifest)
        .map_err(|error| format!("Could not serialize export integrity manifest: {error}"))?;
    fs::write(&manifest_path, format!("{manifest_contents}\n")).map_err(|error| {
        format!(
            "Could not write export integrity manifest {}: {error}",
            manifest_path.display()
        )
    })
}

fn write_export_file(folder: &str, stem: &str, contents: &str) -> Result<String, String> {
    let directory = exports_dir().join(folder);
    fs::create_dir_all(&directory)
        .map_err(|error| format!("Could not create export folder: {error}"))?;
    let safe_stem = safe_file_stem(stem);
    let timestamp = now_unix_seconds();
    let mut path = directory.join(format!("{safe_stem}-{timestamp}.md"));
    let mut suffix = 2;
    while path.exists() {
        path = directory.join(format!("{safe_stem}-{timestamp}-{suffix}.md"));
        suffix += 1;
    }
    fs::write(&path, contents)
        .map_err(|error| format!("Could not write export {}: {error}", path.display()))?;
    if let Err(error) = write_export_integrity_manifest(&path, contents, timestamp) {
        let _ = fs::remove_file(&path);
        return Err(error);
    }
    Ok(path.to_string_lossy().to_string())
}

fn push_export_source_reference(references: &mut Vec<String>, value: &str) {
    let trimmed = value.trim();
    if trimmed.is_empty() || references.iter().any(|reference| reference == trimmed) {
        return;
    }
    references.push(trimmed.to_string());
}

fn meeting_public_comment_count(meeting: &Meeting) -> usize {
    meeting
        .public_comments
        .iter()
        .filter(|comment| {
            comment.status == "reviewed for public record"
                || comment.status == "redacted for public record"
        })
        .count()
}

fn meeting_export_bundle_counts(meeting: &Meeting) -> MeetingExportBundleCounts {
    MeetingExportBundleCounts {
        agenda_items: meeting.agenda_items.len(),
        notice_checklists: meeting.notice_checklists.len(),
        notice_postings: meeting.notice_postings.len(),
        public_attachments: meeting
            .attachments
            .iter()
            .filter(|attachment| attachment.access_level == "public packet")
            .count(),
        closed_session_attachments: meeting
            .attachments
            .iter()
            .filter(|attachment| attachment.access_level == "closed-session addendum")
            .count(),
        packet_finalizations: meeting.packet_assemblies.len(),
        attendance_records: meeting.attendance_records.len(),
        quorum_checks: meeting.quorum_checks.len(),
        minute_citations: meeting.minute_citations.len(),
        motions: meeting.motions.len(),
        roll_call_votes: meeting.member_votes.len(),
        outcomes: meeting.votes.len(),
        action_items: meeting.action_records.len().max(meeting.action_items.len()),
        public_comments: meeting_public_comment_count(meeting),
    }
}

fn meeting_export_source_references(meeting: &Meeting) -> Vec<String> {
    let mut references = Vec::new();
    for item in &meeting.agenda_items {
        push_export_source_reference(&mut references, &item.source_reference);
        push_export_source_reference(&mut references, &item.source_module);
        push_export_source_reference(&mut references, &item.department);
    }
    for checklist in &meeting.notice_checklists {
        push_export_source_reference(&mut references, &checklist.statutory_basis);
        push_export_source_reference(&mut references, &checklist.posting_deadline);
    }
    for posting in &meeting.notice_postings {
        push_export_source_reference(&mut references, &posting.location);
        push_export_source_reference(&mut references, &posting.method);
        push_export_source_reference(&mut references, &posting.confirmation);
    }
    for attachment in &meeting.attachments {
        push_export_source_reference(&mut references, &attachment.title);
        push_export_source_reference(&mut references, &attachment.citation);
        push_export_source_reference(&mut references, &attachment.sha256);
    }
    for packet in &meeting.packet_assemblies {
        push_export_source_reference(&mut references, &packet.packet_title);
        push_export_source_reference(&mut references, &packet.prepared_by);
        push_export_source_reference(&mut references, &packet.review_note);
    }
    for record in &meeting.attendance_records {
        push_export_source_reference(&mut references, &record.member_name);
        push_export_source_reference(&mut references, &record.status);
        push_export_source_reference(&mut references, &record.note);
        push_export_source_reference(&mut references, &record.recorded_by);
    }
    for record in &meeting.quorum_checks {
        push_export_source_reference(&mut references, &record.quorum_rule);
        push_export_source_reference(&mut references, &record.status);
        push_export_source_reference(&mut references, &record.review_note);
    }
    for citation in &meeting.minute_citations {
        push_export_source_reference(&mut references, &citation.source_type);
        push_export_source_reference(&mut references, &citation.source_reference);
        push_export_source_reference(&mut references, &citation.note);
    }
    for motion in &meeting.motions {
        push_export_source_reference(&mut references, &motion.text);
        push_export_source_reference(&mut references, &motion.vote_reference);
    }
    for action in &meeting.action_records {
        push_export_source_reference(&mut references, &action.description);
        push_export_source_reference(&mut references, &action.source_reference);
    }
    for item in &meeting.adopted_legislation {
        push_export_source_reference(&mut references, &item.title);
        push_export_source_reference(&mut references, &item.codification_section_hint);
        push_export_source_reference(&mut references, &item.handoff_status);
    }
    references
}

fn meeting_export_limitations(public_record: bool) -> Vec<String> {
    if public_record {
        vec![
            "Public archive projection omits local file paths, staff-only minute citations, and closed-session addendum files.".to_string(),
            "City staff remain responsible for legal review before publication or external release.".to_string(),
        ]
    } else {
        vec![
            "Staff packet export may include closed-session addendum metadata and local evidence paths.".to_string(),
            "Review the bundle before releasing it outside authorized city staff.".to_string(),
        ]
    }
}

fn write_meeting_export_bundle(
    meeting: &Meeting,
    export_path: &Path,
    contents: &str,
    public_record: bool,
    bundle_sequence: usize,
    bundle_type: &str,
) -> Result<MeetingExportBundle, String> {
    let integrity_manifest_path = export_manifest_path(export_path);
    if !integrity_manifest_path.is_file() {
        return Err(format!(
            "Export integrity manifest is missing: {}",
            integrity_manifest_path.display()
        ));
    }
    let generated_at_unix_seconds = now_unix_seconds();
    let export_hash = hash_public_payload(contents);
    let integrity_manifest_hash = hash_file(&integrity_manifest_path)?;
    let counts = meeting_export_bundle_counts(meeting);
    let manifest = MeetingExportBundleManifest {
        schema_version: 1,
        bundle_type: bundle_type.to_string(),
        meeting_id: meeting.id.clone(),
        meeting_title: meeting.title.clone(),
        meeting_date: meeting.meeting_date.clone(),
        body_name: meeting.body_name.clone(),
        public_record,
        packet_file: path_file_name(export_path, "meeting-packet.md"),
        packet_path: if public_record {
            path_file_name(export_path, "meeting-packet.md")
        } else {
            export_path.to_string_lossy().to_string()
        },
        packet_sha256: export_hash.clone(),
        packet_size_bytes: contents.len() as u64,
        integrity_manifest_file: path_file_name(&integrity_manifest_path, "packet.sha256.json"),
        integrity_manifest_path: if public_record {
            path_file_name(&integrity_manifest_path, "packet.sha256.json")
        } else {
            integrity_manifest_path.to_string_lossy().to_string()
        },
        integrity_manifest_sha256: integrity_manifest_hash,
        counts: counts.clone(),
        source_references: meeting_export_source_references(meeting),
        limitations: meeting_export_limitations(public_record),
        generated_by: "Townlight Windows Local".to_string(),
        generated_at_unix_seconds,
    };
    let manifest_path = export_bundle_manifest_path(export_path);
    let manifest_contents = serde_json::to_string_pretty(&manifest)
        .map_err(|error| format!("Could not serialize meeting export bundle: {error}"))?;
    fs::write(&manifest_path, format!("{manifest_contents}\n")).map_err(|error| {
        format!(
            "Could not write meeting export bundle {}: {error}",
            manifest_path.display()
        )
    })?;
    let manifest_hash = hash_file(&manifest_path)?;
    Ok(MeetingExportBundle {
        id: format!(
            "meeting-export-bundle-{}-{}",
            generated_at_unix_seconds, bundle_sequence
        ),
        export_path: export_path.to_string_lossy().to_string(),
        manifest_path: manifest_path.to_string_lossy().to_string(),
        integrity_manifest_path: integrity_manifest_path.to_string_lossy().to_string(),
        export_hash,
        manifest_hash,
        public_record,
        agenda_item_count: counts.agenda_items,
        notice_checklist_count: counts.notice_checklists,
        notice_posting_count: counts.notice_postings,
        public_attachment_count: counts.public_attachments,
        closed_session_attachment_count: counts.closed_session_attachments,
        packet_finalization_count: counts.packet_finalizations,
        attendance_record_count: counts.attendance_records,
        quorum_check_count: counts.quorum_checks,
        minute_citation_count: counts.minute_citations,
        motion_count: counts.motions,
        roll_call_vote_count: counts.roll_call_votes,
        outcome_count: counts.outcomes,
        action_item_count: counts.action_items,
        public_comment_count: counts.public_comments,
        generated_at_unix_seconds,
    })
}

fn payload_string(payload: Option<&Value>, key: &str) -> Result<String, String> {
    payload
        .and_then(|value| value.get(key))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .ok_or_else(|| format!("Missing required workflow field: {key}"))
}

fn payload_optional_string(payload: Option<&Value>, key: &str) -> String {
    payload
        .and_then(|value| value.get(key))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .unwrap_or_default()
}

fn payload_text_list(payload: Option<&Value>, key: &str) -> Vec<String> {
    payload_optional_string(payload, key)
        .split(|character| character == '\n' || character == ';' || character == ',')
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .collect()
}

fn payload_string_with_cap(
    payload: Option<&Value>,
    key: &str,
    max_len: usize,
) -> Result<String, String> {
    let value = payload_string(payload, key)?;
    if value.chars().count() > max_len {
        return Err(format!("{key} exceeds the {max_len}-character limit."));
    }
    Ok(value)
}

// Replaces the generic "Missing required workflow field" error with a
// friendlier message, while preserving cap-exceeded errors (which are
// already actionable) so they don't get silently swallowed.
fn friendly_required(
    result: Result<String, String>,
    missing_message: &str,
) -> Result<String, String> {
    // Recognize every cap-helper error shape (payload_string_with_cap /
    // payload_optional_string_with_cap / payload_text_list_with_cap) so a
    // cap-exceeded message is never silently swallowed back into the generic
    // missing-field message, even if a future caller wraps a list-cap result.
    result.map_err(|error| {
        if error.contains("exceeds the")
            || error.contains("too many entries")
            || error.contains("characters or fewer")
        {
            error
        } else {
            missing_message.to_string()
        }
    })
}

fn payload_optional_string_with_cap(
    payload: Option<&Value>,
    key: &str,
    max_len: usize,
) -> Result<String, String> {
    let value = payload_optional_string(payload, key);
    if value.chars().count() > max_len {
        return Err(format!("{key} exceeds the {max_len}-character limit."));
    }
    Ok(value)
}

fn payload_text_list_with_cap(
    payload: Option<&Value>,
    key: &str,
    max_item_len: usize,
    max_items: usize,
) -> Result<Vec<String>, String> {
    let items = payload_text_list(payload, key);
    if items.len() > max_items {
        return Err(format!("{key} has too many entries (limit {max_items})."));
    }
    for item in &items {
        if item.chars().count() > max_item_len {
            return Err(format!(
                "{key} entries must be {max_item_len} characters or fewer."
            ));
        }
    }
    Ok(items)
}

fn payload_bool(payload: Option<&Value>, key: &str) -> bool {
    payload
        .and_then(|value| value.get(key))
        .and_then(Value::as_bool)
        .unwrap_or(false)
}

fn parse_money_cents(value: &str) -> Result<i64, String> {
    let value = value.trim().trim_start_matches('$').replace(',', "");
    if value.is_empty() {
        return Err("Enter a fee amount.".to_string());
    }
    if value.starts_with('-') {
        return Err("Fee amounts must be zero or greater.".to_string());
    }
    let parts = value.split('.').collect::<Vec<_>>();
    if parts.len() > 2
        || parts[0].is_empty()
        || !parts[0].chars().all(|character| character.is_ascii_digit())
    {
        return Err("Enter the fee amount as dollars and cents, such as 12.50.".to_string());
    }
    let dollars = parts[0]
        .parse::<i64>()
        .map_err(|_| "Enter the fee amount as dollars and cents, such as 12.50.".to_string())?;
    let cents = if parts.len() == 2 {
        let cents = parts[1];
        if cents.is_empty()
            || cents.len() > 2
            || !cents.chars().all(|character| character.is_ascii_digit())
        {
            return Err("Enter the fee amount as dollars and cents, such as 12.50.".to_string());
        }
        format!("{cents:0<2}")
            .parse::<i64>()
            .map_err(|_| "Enter the fee amount as dollars and cents, such as 12.50.".to_string())?
    } else {
        0
    };
    Ok(dollars * 100 + cents)
}

fn format_money_cents(amount_cents: i64) -> String {
    format!("${}.{:02}", amount_cents / 100, (amount_cents % 100).abs())
}

fn days_in_month(year: u32, month: u32) -> u32 {
    match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 if (year % 4 == 0 && year % 100 != 0) || year % 400 == 0 => 29,
        2 => 28,
        _ => 0,
    }
}

fn parse_iso_date(value: &str, label: &str) -> Result<(u32, u32, u32), String> {
    let parts = value.split('-').collect::<Vec<_>>();
    if parts.len() != 3
        || parts[0].len() != 4
        || parts[1].len() != 2
        || parts[2].len() != 2
        || parts
            .iter()
            .any(|part| !part.chars().all(|character| character.is_ascii_digit()))
    {
        return Err(format!("Enter {label} as YYYY-MM-DD."));
    }
    let year = parts[0]
        .parse::<u32>()
        .map_err(|_| format!("Enter {label} as YYYY-MM-DD."))?;
    let month = parts[1]
        .parse::<u32>()
        .map_err(|_| format!("Enter {label} as YYYY-MM-DD."))?;
    let day = parts[2]
        .parse::<u32>()
        .map_err(|_| format!("Enter {label} as YYYY-MM-DD."))?;
    let max_day = days_in_month(year, month);
    if !(1900..=9999).contains(&year) || max_day == 0 || day == 0 || day > max_day {
        return Err(format!("Enter {label} as a real calendar date."));
    }
    Ok((year, month, day))
}

fn iso_date_string(year: u32, month: u32, day: u32) -> String {
    format!("{year:04}-{month:02}-{day:02}")
}

fn next_iso_date(year: u32, month: u32, day: u32) -> (u32, u32, u32) {
    let max_day = days_in_month(year, month);
    if day < max_day {
        return (year, month, day + 1);
    }
    if month < 12 {
        return (year, month + 1, 1);
    }
    (year + 1, 1, 1)
}

fn previous_iso_date(year: u32, month: u32, day: u32) -> (u32, u32, u32) {
    if day > 1 {
        return (year, month, day - 1);
    }
    if month > 1 {
        let previous_month = month - 1;
        return (year, previous_month, days_in_month(year, previous_month));
    }
    (year - 1, 12, 31)
}

fn iso_weekday_sunday_zero(year: u32, month: u32, day: u32) -> u32 {
    const OFFSETS: [i32; 12] = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4];
    let mut year = year as i32;
    let month = month as usize;
    if month < 3 {
        year -= 1;
    }
    ((year + year / 4 - year / 100 + year / 400 + OFFSETS[month - 1] + day as i32) % 7) as u32
}

fn iso_date_is_weekend(year: u32, month: u32, day: u32) -> bool {
    matches!(iso_weekday_sunday_zero(year, month, day), 0 | 6)
}

fn add_records_deadline_days(
    received_date: &str,
    day_count: u32,
    day_type: &str,
) -> Result<String, String> {
    let (mut year, mut month, mut day) =
        parse_iso_date(received_date, "records request received date")?;
    if day_count == 0 || day_count > 365 {
        return Err("Deadline day count must be between 1 and 365.".to_string());
    }
    let day_type = day_type.trim().to_lowercase();
    let business_days = match day_type.as_str() {
        "business" | "business day" | "business days" | "working" | "working days" => true,
        "calendar" | "calendar day" | "calendar days" => false,
        _ => return Err("Deadline day type must be business days or calendar days.".to_string()),
    };
    let mut added = 0;
    while added < day_count {
        (year, month, day) = next_iso_date(year, month, day);
        if business_days && iso_date_is_weekend(year, month, day) {
            continue;
        }
        added += 1;
    }
    Ok(iso_date_string(year, month, day))
}

fn subtract_notice_deadline_days(
    meeting_date: &str,
    day_count: u32,
    day_type: &str,
) -> Result<String, String> {
    let (mut year, mut month, mut day) = parse_iso_date(meeting_date, "meeting date")?;
    if day_count == 0 || day_count > 365 {
        return Err("Notice lead day count must be between 1 and 365.".to_string());
    }
    let day_type = day_type.trim().to_lowercase();
    let business_days = match day_type.as_str() {
        "business" | "business day" | "business days" | "working" | "working days" => true,
        "calendar" | "calendar day" | "calendar days" => false,
        _ => return Err("Notice day type must be business days or calendar days.".to_string()),
    };
    let mut subtracted = 0;
    while subtracted < day_count {
        (year, month, day) = previous_iso_date(year, month, day);
        if business_days && iso_date_is_weekend(year, month, day) {
            continue;
        }
        subtracted += 1;
    }
    Ok(iso_date_string(year, month, day))
}

fn iso_date_after(
    left: &str,
    right: &str,
    left_label: &str,
    right_label: &str,
) -> Result<bool, String> {
    Ok(parse_iso_date(left, left_label)? > parse_iso_date(right, right_label)?)
}

fn ensure_notice_time_zone(time_zone: &str) -> Result<(), String> {
    const SUPPORTED_TIME_ZONES: &[&str] = &[
        "America/New_York",
        "America/Chicago",
        "America/Denver",
        "America/Phoenix",
        "America/Los_Angeles",
        "America/Anchorage",
        "Pacific/Honolulu",
        "America/Puerto_Rico",
        "UTC",
    ];
    if SUPPORTED_TIME_ZONES.contains(&time_zone) {
        return Ok(());
    }
    Err("Choose a valid IANA time zone, such as America/Denver.".to_string())
}

fn latest_notice_checklist(meeting: &Meeting) -> Option<&NoticeChecklist> {
    meeting.notice_checklists.last()
}

fn bytes_to_hex(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn audit_entry_hash(
    previous_hash: &str,
    id: &str,
    module_id: &str,
    action: &str,
    summary: &str,
    created_at_unix_seconds: u64,
) -> String {
    let mut hasher = Sha256::new();
    hasher.update(previous_hash.as_bytes());
    hasher.update(b"\n");
    hasher.update(id.as_bytes());
    hasher.update(b"\n");
    hasher.update(module_id.as_bytes());
    hasher.update(b"\n");
    hasher.update(action.as_bytes());
    hasher.update(b"\n");
    hasher.update(summary.as_bytes());
    hasher.update(b"\n");
    hasher.update(created_at_unix_seconds.to_string().as_bytes());
    bytes_to_hex(&hasher.finalize())
}

fn push_audit(state: &mut CityWorkState, module_id: &str, action: &str, summary: String) {
    // Strip newlines/carriage-returns so no caller-supplied free text (a title,
    // a service area, anything echoed into a summary) can forge what looks like
    // additional audit-log lines to a tool that line-parses an exported dump.
    // Sanitizing here, once, covers every module and every future caller --
    // round-1's TEST-10 fix patched only one caller; this is the root cause.
    let summary = summary.replace(['\n', '\r'], " ");
    let id = new_id("audit", state.audit_entries.len());
    let created_at_unix_seconds = now_unix_seconds();
    let previous_hash = state
        .audit_entries
        .last()
        .map(|entry| entry.entry_hash.clone())
        .filter(|hash| !hash.is_empty())
        .unwrap_or_else(|| "GENESIS".to_string());
    let entry_hash = audit_entry_hash(
        &previous_hash,
        &id,
        module_id,
        action,
        &summary,
        created_at_unix_seconds,
    );
    state.audit_entries.push(AuditEntry {
        id,
        module_id: module_id.to_string(),
        action: action.to_string(),
        summary,
        created_at_unix_seconds,
        previous_hash,
        entry_hash,
    });
}

fn hash_public_payload(payload: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(payload.as_bytes());
    bytes_to_hex(&hasher.finalize())
}

fn hash_file(path: &Path) -> Result<String, String> {
    let bytes =
        fs::read(path).map_err(|error| format!("Could not read {}: {error}", path.display()))?;
    let mut hasher = Sha256::new();
    hasher.update(&bytes);
    Ok(bytes_to_hex(&hasher.finalize()))
}

fn preserve_file_reference(
    source_path_text: &str,
    destination_dir: &Path,
    title: &str,
    default_name: &str,
    reference_kind: &str,
    citation_or_note: &str,
) -> Result<(String, String, String, String, u64), String> {
    let source_path_text = source_path_text.trim();
    if source_path_text.is_empty() {
        return Err(format!(
            "Enter a local {reference_kind} path or reference before saving."
        ));
    }
    fs::create_dir_all(destination_dir)
        .map_err(|error| format!("Could not create {}: {error}", destination_dir.display()))?;
    let source_path = PathBuf::from(source_path_text);
    let source_file_name = source_path
        .file_name()
        .map(|value| value.to_string_lossy().to_string())
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| default_name.to_string());
    let (stored_path, copied_existing_file) = if source_path.is_file() {
        let extension = source_path
            .extension()
            .map(|value| format!(".{}", value.to_string_lossy()))
            .unwrap_or_default();
        let stored_file_name = format!(
            "{}-{}{}",
            safe_file_stem(title),
            now_unix_seconds(),
            extension
        );
        let stored_path = destination_dir.join(stored_file_name);
        fs::copy(&source_path, &stored_path).map_err(|error| {
            format!(
                "Could not copy {} into the local {reference_kind} evidence store: {error}",
                source_path.display()
            )
        })?;
        (stored_path, true)
    } else {
        let stored_file_name = format!(
            "{}-{}-reference.txt",
            safe_file_stem(title),
            now_unix_seconds()
        );
        let stored_path = destination_dir.join(stored_file_name);
        let reference_contents = format!(
            "Townlight local file reference\n\nKind: {reference_kind}\nTitle: {title}\nTyped path or reference: {source_path_text}\nCitation or note: {citation_or_note}\nRecorded at unix seconds: {}\n\nThe typed path was not readable when this workflow was saved, so Townlight preserved this local reference marker instead of discarding the workflow evidence.\n",
            now_unix_seconds()
        );
        fs::write(&stored_path, reference_contents).map_err(|error| {
            format!(
                "Could not write local {reference_kind} reference marker {}: {error}",
                stored_path.display()
            )
        })?;
        (stored_path, false)
    };
    let metadata = fs::metadata(&stored_path)
        .map_err(|error| format!("Could not inspect {}: {error}", stored_path.display()))?;
    let sha256 = hash_file(&stored_path)?;
    let stored_path_text = stored_path.to_string_lossy().to_string();
    let source_file_name = if copied_existing_file {
        source_file_name
    } else {
        format!("{source_file_name} (typed reference marker)")
    };
    Ok((
        source_path_text.to_string(),
        stored_path_text,
        source_file_name,
        sha256,
        metadata.len(),
    ))
}

fn push_publication_event(
    state: &mut CityWorkState,
    source_module: &str,
    source_record_id: String,
    record_type: &str,
    public_payload: String,
) {
    let id = new_id("publication", state.publication_events.len());
    let payload_hash = hash_public_payload(&public_payload);
    state.publication_events.push(PublicationEvent {
        id,
        source_module: source_module.to_string(),
        source_record_id,
        record_type: record_type.to_string(),
        public_payload,
        payload_hash,
        published_at_unix_seconds: now_unix_seconds(),
        retracted_at_unix_seconds: None,
        retracted_by: String::new(),
    });
}

fn push_notification_event(
    state: &mut CityWorkState,
    module_id: &str,
    record_id: String,
    audience: &str,
    subject: String,
    body: String,
) {
    let id = new_id("notification", state.notification_events.len());
    state.notification_events.insert(
        0,
        NotificationEvent {
            id,
            module_id: module_id.to_string(),
            record_id,
            audience: audience.to_string(),
            channel: "local notification outbox".to_string(),
            subject,
            body,
            status: "ready to send".to_string(),
            created_at_unix_seconds: now_unix_seconds(),
            sent_at_unix_seconds: None,
        },
    );
}

fn retract_publication_event(
    state: &mut CityWorkState,
    source_module: &str,
    source_record_id: &str,
    retracted_by: &str,
) {
    if let Some(event) = state.publication_events.iter_mut().rev().find(|event| {
        event.source_module == source_module
            && event.source_record_id == source_record_id
            && event.retracted_at_unix_seconds.is_none()
    }) {
        event.retracted_at_unix_seconds = Some(now_unix_seconds());
        event.retracted_by = retracted_by.to_string();
    }
}

fn selected_meeting_index(state: &CityWorkState, payload: Option<&Value>) -> Result<usize, String> {
    let meeting_id = payload_optional_string(payload, "meetingId");
    if meeting_id.is_empty() {
        if state.meetings.is_empty() {
            return Err("Create a meeting before recording this clerk action.".to_string());
        }
        return Ok(0);
    }
    state
        .meetings
        .iter()
        .position(|meeting| meeting.id == meeting_id)
        .ok_or_else(|| "The selected meeting was not found in the local city profile.".to_string())
}

fn selected_meeting_mut<'a>(
    state: &'a mut CityWorkState,
    payload: Option<&Value>,
) -> Result<&'a mut Meeting, String> {
    let index = selected_meeting_index(state, payload)?;
    Ok(&mut state.meetings[index])
}

fn ensure_meeting_can_change(meeting: &Meeting) -> Result<(), String> {
    if meeting.archived_at_unix_seconds.is_some() || meeting.status == "archived public record" {
        return Err(
            "This meeting is archived as a public record. Create a new meeting for new clerk work."
                .to_string(),
        );
    }
    Ok(())
}

fn parse_default_notice_days(value: &str) -> Result<u32, String> {
    if value.trim().is_empty() {
        return Ok(3);
    }
    let days = value
        .trim()
        .parse::<u32>()
        .map_err(|_| "Enter default notice days as a whole number.".to_string())?;
    if days > 365 {
        return Err("Default notice days must be 365 or less.".to_string());
    }
    Ok(days)
}

fn selected_meeting_body_for_payload(
    state: &CityWorkState,
    payload: Option<&Value>,
) -> Result<(String, String), String> {
    let body_id = payload_optional_string(payload, "meetingBodyId");
    if !body_id.is_empty() {
        let body = state
            .meeting_bodies
            .iter()
            .find(|body| body.id == body_id)
            .ok_or_else(|| "The selected meeting body was not found.".to_string())?;
        return Ok((body.id.clone(), body.name.clone()));
    }
    let body_name = payload_optional_string(payload, "meetingBodyName");
    if !body_name.is_empty() {
        if let Some(body) = state
            .meeting_bodies
            .iter()
            .find(|body| body.name.eq_ignore_ascii_case(&body_name))
        {
            return Ok((body.id.clone(), body.name.clone()));
        }
        return Err(
            "Save this meeting body with statutory basis before creating a meeting.".to_string(),
        );
    }
    if let Some(body) = state.meeting_bodies.first() {
        return Ok((body.id.clone(), body.name.clone()));
    }
    Err("Create a meeting body with statutory basis before creating a meeting.".to_string())
}

fn selected_record_index(state: &CityWorkState, payload: Option<&Value>) -> Result<usize, String> {
    let request_id = payload_optional_string(payload, "recordsRequestId");
    if request_id.is_empty() {
        if state.records_requests.is_empty() {
            return Err(
                "Create a records request before drafting or exporting a response.".to_string(),
            );
        }
        return Ok(0);
    }
    state
        .records_requests
        .iter()
        .position(|request| request.id == request_id)
        .ok_or_else(|| {
            "The selected records request was not found in the local city profile.".to_string()
        })
}

fn selected_record_mut<'a>(
    state: &'a mut CityWorkState,
    payload: Option<&Value>,
) -> Result<&'a mut RecordsRequest, String> {
    let index = selected_record_index(state, payload)?;
    Ok(&mut state.records_requests[index])
}

fn public_records_request_index(
    state: &CityWorkState,
    tracking_number: &str,
    requester_contact: &str,
) -> Option<usize> {
    let normalized_tracking = tracking_number.trim().to_ascii_lowercase();
    let normalized_contact = requester_contact.trim().to_ascii_lowercase();
    state.records_requests.iter().position(|request| {
        request.public_tracking_number.to_ascii_lowercase() == normalized_tracking
            && request.requester_contact.to_ascii_lowercase() == normalized_contact
    })
}

fn selected_notification_mut<'a>(
    state: &'a mut CityWorkState,
    payload: Option<&Value>,
) -> Result<&'a mut NotificationEvent, String> {
    let notification_id = payload_optional_string(payload, "notificationId");
    if notification_id.is_empty() {
        return state
            .notification_events
            .iter_mut()
            .find(|event| event.status == "ready to send")
            .ok_or_else(|| {
                "No ready local notification exists yet. Create or select a notification first."
                    .to_string()
            });
    }
    state
        .notification_events
        .iter_mut()
        .find(|event| event.id == notification_id)
        .ok_or_else(|| "The selected local notification could not be found.".to_string())
}

fn ensure_records_request_active(request: &RecordsRequest) -> Result<(), String> {
    if request.closed_at_unix_seconds.is_some() || request.status == "closed" {
        return Err(
            "This records request is closed. Create a new request for new records work."
                .to_string(),
        );
    }
    if request.fulfilled_at_unix_seconds.is_some() || request.status == "fulfilled" {
        return Err(
            "This records request has already been fulfilled. Close it or create a new request."
                .to_string(),
        );
    }
    Ok(())
}

fn invalidate_records_release(request: &mut RecordsRequest) -> Result<(), String> {
    request.release_revision = request
        .release_revision
        .checked_add(1)
        .ok_or_else(|| "Records response revision limit reached.".to_string())?;
    request.approved_at_unix_seconds = None;
    if matches!(
        request.status.as_str(),
        "approved" | "response package exported" | "release package built"
    ) {
        request.status = "needs renewed human approval".to_string();
    }
    Ok(())
}

fn first_pending_code_handoff_index(state: &CityWorkState) -> Result<usize, String> {
    state
        .code_handoffs
        .iter()
        .position(|handoff| handoff.status != "sent to clerk agenda")
        .ok_or_else(|| "Create a code handoff before adding it to a clerk agenda.".to_string())
}

fn selected_pending_code_handoff_index(
    state: &CityWorkState,
    payload: Option<&Value>,
) -> Result<usize, String> {
    let handoff_id = payload_optional_string(payload, "codeHandoffId");
    if handoff_id.is_empty() {
        return first_pending_code_handoff_index(state);
    }
    let index = state
        .code_handoffs
        .iter()
        .position(|handoff| handoff.id == handoff_id)
        .ok_or_else(|| {
            "The selected code handoff was not found in the local city profile.".to_string()
        })?;
    if state.code_handoffs[index].status == "sent to clerk agenda" {
        return Err("The selected code handoff has already been sent to an agenda.".to_string());
    }
    Ok(index)
}

fn selected_agenda_intake_index(
    state: &CityWorkState,
    payload: Option<&Value>,
) -> Result<usize, String> {
    if state.agenda_intakes.is_empty() {
        return Err("Submit an agenda intake item before reviewing the agenda queue.".to_string());
    }
    let intake_id = payload_optional_string(payload, "agendaIntakeId");
    if intake_id.is_empty() {
        return Ok(state
            .agenda_intakes
            .iter()
            .position(|intake| intake.status != "promoted to agenda")
            .unwrap_or(0));
    }
    state
        .agenda_intakes
        .iter()
        .position(|intake| intake.id == intake_id)
        .ok_or_else(|| "The selected agenda intake item was not found.".to_string())
}

fn create_meeting_body(
    state: &mut CityWorkState,
    payload: Option<&Value>,
) -> Result<String, String> {
    let name = payload_string(payload, "meetingBodyName")
        .map_err(|_| "Enter the meeting body name.".to_string())?;
    let statutory_basis = payload_string(payload, "meetingBodyStatutoryBasis")
        .map_err(|_| "Enter the statutory basis for this meeting body.".to_string())?;
    if state
        .meeting_bodies
        .iter()
        .any(|body| body.name.eq_ignore_ascii_case(&name))
    {
        return Err("A meeting body with this name already exists.".to_string());
    }
    let body_type = {
        let value = payload_optional_string(payload, "meetingBodyType");
        if value.is_empty() {
            "legislative".to_string()
        } else {
            value
        }
    };
    let meeting_cadence = {
        let value = payload_optional_string(payload, "meetingBodyCadence");
        if value.is_empty() {
            "as scheduled".to_string()
        } else {
            value
        }
    };
    let quorum_rule = {
        let value = payload_optional_string(payload, "meetingBodyQuorumRule");
        if value.is_empty() {
            "majority of seated members".to_string()
        } else {
            value
        }
    };
    let default_notice_days = parse_default_notice_days(&payload_optional_string(
        payload,
        "meetingBodyDefaultNoticeDays",
    ))?;
    let id = new_id("meeting-body", state.meeting_bodies.len());
    state.meeting_bodies.insert(
        0,
        MeetingBody {
            id: id.clone(),
            name: name.clone(),
            body_type: body_type.clone(),
            statutory_basis: statutory_basis.clone(),
            meeting_cadence: meeting_cadence.clone(),
            default_notice_days,
            quorum_rule: quorum_rule.clone(),
            status: "active".to_string(),
            created_at_unix_seconds: now_unix_seconds(),
        },
    );
    push_audit(
        state,
        "civicclerk",
        "create-meeting-body",
        format!(
            "Created meeting body {name}; type: {body_type}; basis: {statutory_basis}; cadence: {meeting_cadence}; default notice days: {default_notice_days}; quorum: {quorum_rule}."
        ),
    );
    Ok(format!("Meeting body saved locally: {name}."))
}

fn add_meeting_member(
    state: &mut CityWorkState,
    payload: Option<&Value>,
) -> Result<String, String> {
    let name =
        payload_string(payload, "memberName").map_err(|_| "Enter the member name.".to_string())?;
    let role =
        payload_string(payload, "memberRole").map_err(|_| "Enter the member role.".to_string())?;
    let term_start = payload_optional_string(payload, "memberTermStart");
    if !term_start.is_empty() {
        parse_iso_date(&term_start, "member term start")?;
    }
    let term_end = payload_optional_string(payload, "memberTermEnd");
    if !term_end.is_empty() {
        parse_iso_date(&term_end, "member term end")?;
    }
    let email = payload_optional_string(payload, "memberEmail");
    let status = {
        let value = payload_optional_string(payload, "memberStatus").to_lowercase();
        if value.is_empty() {
            "active".to_string()
        } else {
            value
        }
    };
    let (body_id, body_name) = selected_meeting_body_for_payload(state, payload)?;
    if status == "active"
        && state.meeting_members.iter().any(|member| {
            member.body_id == body_id
                && member.status == "active"
                && member.name.eq_ignore_ascii_case(&name)
        })
    {
        return Err("That active member is already on this meeting body roster.".to_string());
    }
    let id = new_id("meeting-member", state.meeting_members.len());
    state.meeting_members.insert(
        0,
        MeetingMember {
            id,
            body_id,
            body_name: body_name.clone(),
            name: name.clone(),
            role: role.clone(),
            term_start,
            term_end,
            email,
            status: status.clone(),
            created_at_unix_seconds: now_unix_seconds(),
        },
    );
    push_audit(
        state,
        "civicclerk",
        "add-meeting-member",
        format!("Added {name} ({role}) to {body_name}; status {status}."),
    );
    Ok("Meeting member saved to the body roster.".to_string())
}

fn create_meeting(state: &mut CityWorkState, payload: Option<&Value>) -> Result<String, String> {
    let title = payload_string(payload, "title")?;
    let meeting_date = payload_string(payload, "meetingDate")?;
    let summary = payload_optional_string(payload, "summary");
    let agenda_title = payload_optional_string(payload, "agendaTitle");
    let (body_id, body_name) = selected_meeting_body_for_payload(state, payload)?;
    let id = new_id("meeting", state.meetings.len());
    let mut meeting = Meeting {
        id: id.clone(),
        body_id,
        body_name: body_name.clone(),
        title: title.clone(),
        meeting_date,
        status: "draft".to_string(),
        notice_status: "not posted".to_string(),
        notice_checklists: Vec::new(),
        notice_postings: Vec::new(),
        summary,
        agenda_items: Vec::new(),
        staff_reports: Vec::new(),
        attachments: Vec::new(),
        packet_assemblies: Vec::new(),
        minutes: String::new(),
        minute_citations: Vec::new(),
        motions: Vec::new(),
        member_votes: Vec::new(),
        attendance_records: Vec::new(),
        quorum_checks: Vec::new(),
        votes: Vec::new(),
        action_items: Vec::new(),
        action_records: Vec::new(),
        adopted_legislation: Vec::new(),
        closed_sessions: Vec::new(),
        resident_comments: Vec::new(),
        public_comments: Vec::new(),
        exports: Vec::new(),
        export_bundles: Vec::new(),
        minutes_adopted_at_unix_seconds: None,
        minutes_signed_by: String::new(),
        minutes_signature_attestation: String::new(),
        minutes_signed_at_unix_seconds: None,
        archived_at_unix_seconds: None,
        created_at_unix_seconds: now_unix_seconds(),
    };
    if !agenda_title.is_empty() {
        meeting.agenda_items.push(AgendaItem {
            id: new_id("agenda", 0),
            title: agenda_title,
            status: "draft".to_string(),
            visibility: "public draft".to_string(),
            source_module: "civicclerk".to_string(),
            source_record_id: String::new(),
            source_reference: "manual meeting draft".to_string(),
            department: String::new(),
        });
    }
    state.meetings.insert(0, meeting);
    push_audit(
        state,
        "civicclerk",
        "create-meeting",
        format!("Created meeting draft for {body_name}: {title}"),
    );
    Ok("Meeting draft saved locally with agenda and notice status.".to_string())
}

fn add_agenda_item(state: &mut CityWorkState, payload: Option<&Value>) -> Result<String, String> {
    let title = payload_string(payload, "agendaTitle")?;
    let meeting_index = selected_meeting_index(state, payload)?;
    let agenda_count = {
        let meeting = &state.meetings[meeting_index];
        ensure_meeting_can_change(meeting)?;
        meeting.agenda_items.len()
    };
    let meeting = &mut state.meetings[meeting_index];
    meeting.agenda_items.push(AgendaItem {
        id: new_id("agenda", agenda_count),
        title: title.clone(),
        status: "draft".to_string(),
        visibility: "public draft".to_string(),
        source_module: "civicclerk".to_string(),
        source_record_id: String::new(),
        source_reference: "manual clerk entry".to_string(),
        department: String::new(),
    });
    meeting.status = "agenda drafting".to_string();
    push_audit(
        state,
        "civicclerk",
        "add-agenda-item",
        format!("Added agenda item: {title}"),
    );
    Ok("Agenda item added to the current meeting draft.".to_string())
}

fn submit_agenda_intake(
    state: &mut CityWorkState,
    payload: Option<&Value>,
) -> Result<String, String> {
    let title = payload_string(payload, "agendaIntakeTitle")
        .map_err(|_| "Enter the agenda intake title.".to_string())?;
    let submitter = payload_string(payload, "agendaIntakeSubmitter")
        .map_err(|_| "Enter the person submitting this agenda item.".to_string())?;
    let department = payload_string(payload, "agendaIntakeDepartment")
        .map_err(|_| "Enter the submitting department.".to_string())?;
    let summary = payload_string(payload, "agendaIntakeSummary")
        .map_err(|_| "Enter the agenda intake summary.".to_string())?;
    let source_reference = payload_string(payload, "agendaIntakeSourceReference")
        .map_err(|_| "Enter a source or citation for this agenda item.".to_string())?;
    let requested_meeting_date = payload_optional_string(payload, "agendaIntakeMeetingDate");
    if !requested_meeting_date.is_empty() {
        parse_iso_date(&requested_meeting_date, "requested meeting date")?;
    }
    let id = new_id("agenda-intake", state.agenda_intakes.len());
    state.agenda_intakes.insert(
        0,
        AgendaIntake {
            id: id.clone(),
            title: title.clone(),
            submitter: submitter.clone(),
            department: department.clone(),
            summary: summary.clone(),
            source_reference: source_reference.clone(),
            requested_meeting_date: requested_meeting_date.clone(),
            status: "submitted".to_string(),
            review_note: String::new(),
            meeting_id: String::new(),
            agenda_item_id: String::new(),
            created_at_unix_seconds: now_unix_seconds(),
            reviewed_at_unix_seconds: None,
            promoted_at_unix_seconds: None,
        },
    );
    push_audit(
        state,
        "civicclerk",
        "submit-agenda-intake",
        format!(
            "Submitted agenda intake {title} from {department}; source {source_reference}; requested meeting date {requested_meeting_date}."
        ),
    );
    Ok(format!("Agenda intake saved for clerk review: {title}."))
}

fn review_agenda_intake(
    state: &mut CityWorkState,
    payload: Option<&Value>,
) -> Result<String, String> {
    let index = selected_agenda_intake_index(state, payload)?;
    let decision = payload_string(payload, "agendaIntakeDecision")
        .map_err(|_| "Choose ready for agenda or needs more information.".to_string())?
        .to_lowercase();
    let status = match decision.as_str() {
        "ready for agenda" => "ready for agenda",
        "needs more information" => "needs more information",
        _ => return Err("Choose ready for agenda or needs more information.".to_string()),
    };
    let review_note = payload_string(payload, "agendaIntakeReviewNote")
        .map_err(|_| "Enter the clerk review note.".to_string())?;
    let title = {
        let intake = &mut state.agenda_intakes[index];
        if intake.status == "promoted to agenda" {
            return Err("This agenda intake item has already been promoted.".to_string());
        }
        intake.status = status.to_string();
        intake.review_note = review_note.clone();
        intake.reviewed_at_unix_seconds = Some(now_unix_seconds());
        intake.title.clone()
    };
    push_audit(
        state,
        "civicclerk",
        "review-agenda-intake",
        format!("Reviewed agenda intake {title}: {status}; {review_note}"),
    );
    Ok(format!("Agenda intake reviewed: {title} is {status}."))
}

fn promote_agenda_intake(
    state: &mut CityWorkState,
    payload: Option<&Value>,
) -> Result<String, String> {
    if state.meetings.is_empty() {
        return Err("Create a meeting before promoting an agenda intake item.".to_string());
    }
    let intake_index = selected_agenda_intake_index(state, payload)?;
    if state.agenda_intakes[intake_index].status != "ready for agenda" {
        return Err(
            "Review the agenda intake item as ready for agenda before promoting it.".to_string(),
        );
    }
    let meeting_index = selected_meeting_index(state, payload)?;
    let agenda_count = {
        let meeting = &state.meetings[meeting_index];
        ensure_meeting_can_change(meeting)?;
        meeting.agenda_items.len()
    };
    let intake_id = state.agenda_intakes[intake_index].id.clone();
    let title = state.agenda_intakes[intake_index].title.clone();
    let source_reference = state.agenda_intakes[intake_index].source_reference.clone();
    let department = state.agenda_intakes[intake_index].department.clone();
    let agenda_item_id = new_id("agenda", agenda_count);
    let meeting_id = {
        let meeting = &mut state.meetings[meeting_index];
        meeting.agenda_items.push(AgendaItem {
            id: agenda_item_id.clone(),
            title: title.clone(),
            status: "ready".to_string(),
            visibility: "public draft".to_string(),
            source_module: "civicclerk".to_string(),
            source_record_id: intake_id.clone(),
            source_reference: source_reference.clone(),
            department: department.clone(),
        });
        meeting.status = "agenda drafting".to_string();
        meeting.id.clone()
    };
    {
        let intake = &mut state.agenda_intakes[intake_index];
        intake.status = "promoted to agenda".to_string();
        intake.meeting_id = meeting_id.clone();
        intake.agenda_item_id = agenda_item_id.clone();
        intake.promoted_at_unix_seconds = Some(now_unix_seconds());
    }
    push_audit(
        state,
        "civicclerk",
        "promote-agenda-intake",
        format!(
            "Promoted agenda intake {title} to meeting {meeting_id}; source {source_reference}; department {department}."
        ),
    );
    Ok(format!(
        "Agenda intake promoted to the selected meeting agenda: {title}."
    ))
}

fn selected_agenda_item_for_report(
    meeting: &Meeting,
    payload: Option<&Value>,
) -> Result<(String, String), String> {
    if meeting.agenda_items.is_empty() {
        return Err("Add an agenda item before recording a staff report.".to_string());
    }
    let requested_id = payload_optional_string(payload, "staffReportAgendaItemId");
    let agenda_item = if requested_id.is_empty() {
        meeting
            .agenda_items
            .first()
            .expect("agenda item exists after empty check")
    } else {
        meeting
            .agenda_items
            .iter()
            .find(|item| item.id == requested_id)
            .ok_or_else(|| "Choose an agenda item from the selected meeting.".to_string())?
    };
    Ok((agenda_item.id.clone(), agenda_item.title.clone()))
}

fn record_staff_report(
    state: &mut CityWorkState,
    payload: Option<&Value>,
) -> Result<String, String> {
    let recommendation = payload_string(payload, "staffReportRecommendation")
        .map_err(|_| "Enter the staff recommendation.".to_string())?;
    let background = payload_string(payload, "staffReportBackground")
        .map_err(|_| "Enter the staff report background.".to_string())?;
    let analysis = payload_string(payload, "staffReportAnalysis")
        .map_err(|_| "Enter the staff analysis.".to_string())?;
    let fiscal_impact = payload_string(payload, "staffReportFiscalImpact")
        .map_err(|_| "Enter the fiscal impact or type none.".to_string())?;
    let alternatives = payload_string(payload, "staffReportAlternatives")
        .map_err(|_| "Enter alternatives considered or type none.".to_string())?;
    let prior_actions = payload_string(payload, "staffReportPriorActions")
        .map_err(|_| "Enter prior actions or type none.".to_string())?;
    let prepared_by = payload_string(payload, "staffReportPreparedBy")
        .map_err(|_| "Enter who prepared the staff report.".to_string())?;
    let revision_note = payload_optional_string(payload, "staffReportRevisionNote");
    let meeting = selected_meeting_mut(state, payload)?;
    ensure_meeting_can_change(meeting)?;
    let (agenda_item_id, agenda_item_title) = selected_agenda_item_for_report(meeting, payload)?;
    let report_id = new_id("staff-report", meeting.staff_reports.len());
    meeting.staff_reports.push(StaffReportRecord {
        id: report_id.clone(),
        agenda_item_id: agenda_item_id.clone(),
        agenda_item_title: agenda_item_title.clone(),
        recommendation: recommendation.clone(),
        background,
        analysis,
        fiscal_impact,
        alternatives,
        prior_actions,
        prepared_by: prepared_by.clone(),
        revision_note: revision_note.clone(),
        created_at_unix_seconds: now_unix_seconds(),
    });
    meeting.status = "staff report recorded".to_string();
    push_audit(
        state,
        "civicclerk",
        "record-staff-report",
        format!(
            "Recorded staff report {report_id} for agenda item {agenda_item_title}; recommendation {recommendation}; prepared by {prepared_by}; revision note {}.",
            if revision_note.is_empty() {
                "not recorded"
            } else {
                &revision_note
            }
        ),
    );
    Ok("Staff report saved and linked to the selected agenda item.".to_string())
}

fn add_meeting_attachment(
    state: &mut CityWorkState,
    payload: Option<&Value>,
) -> Result<String, String> {
    let title = payload_string(payload, "meetingAttachmentTitle")?;
    let source_path = payload_string(payload, "meetingAttachmentSourcePath")?;
    let citation = payload_optional_string(payload, "meetingAttachmentCitation");
    let packet_section = {
        let value = payload_optional_string(payload, "meetingAttachmentSection");
        if value.is_empty() {
            "agenda packet".to_string()
        } else {
            value
        }
    };
    let access_level = {
        let value = payload_optional_string(payload, "meetingAttachmentAccess").to_lowercase();
        if value.is_empty() {
            "public packet".to_string()
        } else if value == "public packet" || value == "closed-session addendum" {
            value
        } else {
            return Err(
                "Attachment access must be public packet or closed-session addendum.".to_string(),
            );
        }
    };
    let source_path = PathBuf::from(source_path);
    if !source_path.is_file() {
        return Err("Choose an existing local file to attach to the meeting packet.".to_string());
    }
    let original_path = source_path.to_string_lossy().to_string();
    let source_file_name = source_path
        .file_name()
        .map(|value| value.to_string_lossy().to_string())
        .unwrap_or_else(|| "meeting-attachment".to_string());
    let extension = source_path
        .extension()
        .map(|value| format!(".{}", value.to_string_lossy()))
        .unwrap_or_default();
    let (stored_path, sha256, size_bytes) = {
        let meeting = selected_meeting_mut(state, payload)?;
        ensure_meeting_can_change(meeting)?;
        let meeting_dir = local_paths::data_root()
            .join("files")
            .join("meetings")
            .join(format!("{}-{}", meeting.id, safe_file_stem(&meeting.title)));
        fs::create_dir_all(&meeting_dir)
            .map_err(|error| format!("Could not create {}: {error}", meeting_dir.display()))?;
        let stored_file_name = format!(
            "{}-{}{}",
            safe_file_stem(&title),
            now_unix_seconds(),
            extension
        );
        let stored_path = meeting_dir.join(stored_file_name);
        fs::copy(&source_path, &stored_path).map_err(|error| {
            format!(
                "Could not copy {} into the local meeting packet file store: {error}",
                source_path.display()
            )
        })?;
        let metadata = fs::metadata(&stored_path)
            .map_err(|error| format!("Could not inspect {}: {error}", stored_path.display()))?;
        let sha256 = hash_file(&stored_path)?;
        let attachment = MeetingAttachment {
            id: format!(
                "meeting-attachment-{}-{}",
                now_unix_seconds(),
                meeting.attachments.len() + 1
            ),
            title: title.clone(),
            original_path: original_path.clone(),
            stored_path: stored_path.to_string_lossy().to_string(),
            citation: citation.clone(),
            sha256: sha256.clone(),
            size_bytes: metadata.len(),
            packet_section: packet_section.clone(),
            access_level: access_level.clone(),
            added_by: "clerk staff".to_string(),
            created_at_unix_seconds: now_unix_seconds(),
        };
        meeting.attachments.push(attachment);
        meeting.status = "packet attachments recorded".to_string();
        (
            stored_path.to_string_lossy().to_string(),
            sha256,
            metadata.len(),
        )
    };
    push_audit(
        state,
        "civicclerk",
        "add-meeting-attachment",
        format!(
            "Attached meeting packet file {title} from {source_file_name}; {access_level}; sha256 {sha256}; {size_bytes} bytes."
        ),
    );
    Ok(format!(
        "Meeting packet attachment copied into local profile: {stored_path}."
    ))
}

fn finalize_meeting_packet(
    state: &mut CityWorkState,
    payload: Option<&Value>,
) -> Result<String, String> {
    let prepared_by = payload_string(payload, "packetPreparedBy")
        .map_err(|_| "Enter who prepared or reviewed the packet.".to_string())?;
    let review_note = payload_string(payload, "packetReviewNote")
        .map_err(|_| "Enter the packet review note.".to_string())?;
    let requested_title = payload_optional_string(payload, "packetTitle");
    let (meeting_title, packet_title, agenda_item_count, public_attachment_count, closed_count) = {
        let meeting = selected_meeting_mut(state, payload)?;
        ensure_meeting_can_change(meeting)?;
        if meeting.agenda_items.is_empty() {
            return Err("Add at least one agenda item before finalizing the packet.".to_string());
        }
        let packet_title = if requested_title.is_empty() {
            format!("{} agenda packet", meeting.title)
        } else {
            requested_title.clone()
        };
        let public_attachment_count = meeting
            .attachments
            .iter()
            .filter(|attachment| attachment.access_level == "public packet")
            .count();
        let closed_count = meeting
            .attachments
            .iter()
            .filter(|attachment| attachment.access_level == "closed-session addendum")
            .count();
        let now = now_unix_seconds();
        let record = PacketAssemblyRecord {
            id: new_id("packet-assembly", meeting.packet_assemblies.len()),
            packet_title: packet_title.clone(),
            prepared_by: prepared_by.clone(),
            review_note: review_note.clone(),
            agenda_item_count: meeting.agenda_items.len(),
            public_attachment_count,
            closed_session_attachment_count: closed_count,
            status: "finalized".to_string(),
            created_at_unix_seconds: now,
            finalized_at_unix_seconds: now,
        };
        meeting.packet_assemblies.push(record);
        meeting.status = "packet finalized".to_string();
        (
            meeting.title.clone(),
            packet_title,
            meeting.agenda_items.len(),
            public_attachment_count,
            closed_count,
        )
    };
    push_audit(
        state,
        "civicclerk",
        "finalize-meeting-packet",
        format!(
            "Finalized packet {packet_title} for {meeting_title}: {agenda_item_count} agenda items, {public_attachment_count} public attachments, {closed_count} closed-session addenda; reviewed by {prepared_by}."
        ),
    );
    Ok("Packet finalization saved for clerk review and export.".to_string())
}

fn add_code_handoff_agenda(
    state: &mut CityWorkState,
    payload: Option<&Value>,
) -> Result<String, String> {
    if state.meetings.is_empty() {
        return Err("Create a meeting before adding a code handoff to the agenda.".to_string());
    }
    let meeting_index = selected_meeting_index(state, payload)?;
    let handoff_index = selected_pending_code_handoff_index(state, payload)?;
    let handoff_id = state.code_handoffs[handoff_index].id.clone();
    let handoff_title = state.code_handoffs[handoff_index].title.clone();
    let handoff_summary = state.code_handoffs[handoff_index].summary.clone();
    let agenda_count = state.meetings[meeting_index].agenda_items.len();
    let agenda_title = format!("Code review: {handoff_title}");
    let meeting = &mut state.meetings[meeting_index];
    ensure_meeting_can_change(meeting)?;
    meeting.agenda_items.push(AgendaItem {
        id: new_id("agenda", agenda_count),
        title: agenda_title,
        status: "draft".to_string(),
        visibility: "staff draft".to_string(),
        source_module: "civiccode".to_string(),
        source_record_id: handoff_id,
        source_reference: handoff_title.clone(),
        department: "CivicCode".to_string(),
    });
    meeting.status = "agenda drafting".to_string();
    state.code_handoffs[handoff_index].status = "sent to clerk agenda".to_string();
    push_audit(
        state,
        "civicclerk",
        "add-code-handoff-agenda",
        format!("Code handoff added to agenda: {handoff_title}. {handoff_summary}"),
    );
    Ok(format!(
        "Code handoff added to the current meeting agenda: {handoff_title}."
    ))
}

fn complete_notice_checklist(
    state: &mut CityWorkState,
    payload: Option<&Value>,
) -> Result<String, String> {
    let meeting_type = payload_string(payload, "noticeMeetingType")
        .map_err(|_| "Enter the meeting type for the notice checklist.".to_string())?;
    let statutory_basis = payload_string(payload, "noticeStatutoryBasis")
        .map_err(|_| "Enter the statutory notice basis before posting notice.".to_string())?;
    let posting_deadline = payload_string(payload, "noticeDeadline")
        .map_err(|_| "Enter the notice posting deadline as YYYY-MM-DD.".to_string())?;
    let time_zone = payload_string(payload, "noticeTimeZone")
        .map_err(|_| "Enter the notice time zone, such as America/Denver.".to_string())?;
    ensure_notice_time_zone(&time_zone)?;
    parse_iso_date(&posting_deadline, "notice posting deadline")?;
    let human_approval = payload_bool(payload, "noticeHumanApproval");
    if !human_approval {
        return Err("A clerk must approve the notice checklist before posting notice.".to_string());
    }

    let meeting = selected_meeting_mut(state, payload)?;
    ensure_meeting_can_change(meeting)?;
    parse_iso_date(&meeting.meeting_date, "meeting date")?;
    if meeting.agenda_items.is_empty() {
        return Err(
            "Add at least one agenda item before approving the notice checklist.".to_string(),
        );
    }
    if iso_date_after(
        &posting_deadline,
        &meeting.meeting_date,
        "notice posting deadline",
        "meeting date",
    )? {
        return Err("Notice deadline must be on or before the meeting date.".to_string());
    }

    let checklist_id = new_id("notice-checklist", meeting.notice_checklists.len());
    meeting.notice_checklists.push(NoticeChecklist {
        id: checklist_id,
        meeting_type: meeting_type.clone(),
        statutory_basis: statutory_basis.clone(),
        posting_deadline: posting_deadline.clone(),
        time_zone: time_zone.clone(),
        human_approval,
        status: "ready for posting".to_string(),
        checked_at_unix_seconds: now_unix_seconds(),
    });
    let title = meeting.title.clone();
    meeting.notice_status = "notice checklist ready".to_string();
    meeting.status = "notice checklist ready".to_string();
    push_audit(
        state,
        "civicclerk",
        "complete-notice-checklist",
        format!(
            "Notice checklist approved for {title}; type: {meeting_type}; basis: {statutory_basis}; deadline: {posting_deadline}; time zone: {time_zone}"
        ),
    );
    Ok("Notice checklist approved locally. Posting proof can now be recorded.".to_string())
}

fn calculate_notice_deadline(
    state: &mut CityWorkState,
    payload: Option<&Value>,
) -> Result<String, String> {
    let meeting_type = payload_string(payload, "noticeMeetingType")
        .map_err(|_| "Enter the meeting type for the notice calculator.".to_string())?;
    let statutory_basis = payload_string(payload, "noticeStatutoryBasis")
        .map_err(|_| "Enter the statutory notice basis before calculating notice.".to_string())?;
    let lead_days_text = payload_optional_string(payload, "noticeLeadDays");
    let day_type = payload_string(payload, "noticeDayType")
        .map_err(|_| "Choose business days or calendar days.".to_string())?;
    let time_zone = payload_string(payload, "noticeTimeZone")
        .map_err(|_| "Enter the notice time zone, such as America/Denver.".to_string())?;
    ensure_notice_time_zone(&time_zone)?;
    let human_approval = payload_bool(payload, "noticeHumanApproval");
    if !human_approval {
        return Err(
            "A clerk must approve the calculated notice checklist before saving it.".to_string(),
        );
    }

    let meeting_index = selected_meeting_index(state, payload)?;
    let default_notice_days = state
        .meetings
        .get(meeting_index)
        .and_then(|meeting| {
            state
                .meeting_bodies
                .iter()
                .find(|body| body.id == meeting.body_id)
                .map(|body| body.default_notice_days)
        })
        .unwrap_or(3);
    let meeting = &mut state.meetings[meeting_index];
    ensure_meeting_can_change(meeting)?;
    parse_iso_date(&meeting.meeting_date, "meeting date")?;
    if meeting.agenda_items.is_empty() {
        return Err(
            "Add at least one agenda item before calculating the notice deadline.".to_string(),
        );
    }
    let lead_days = if lead_days_text.trim().is_empty() {
        default_notice_days
    } else {
        lead_days_text
            .parse::<u32>()
            .map_err(|_| "Notice lead day count must be a whole number.".to_string())?
    };
    let posting_deadline =
        subtract_notice_deadline_days(&meeting.meeting_date, lead_days, &day_type)?;
    let normalized_day_type = if day_type.to_lowercase().contains("business")
        || day_type.to_lowercase().contains("working")
    {
        "business days"
    } else {
        "calendar days"
    };
    let calculation_note = format!(
        "{} Rule: {}; meeting date {}; calculated as {} {} before meeting; weekends {} automatically skipped; city/state holidays must be checked by staff.",
        statutory_basis,
        meeting_type,
        meeting.meeting_date,
        lead_days,
        normalized_day_type,
        if normalized_day_type == "business days" {
            "are"
        } else {
            "are not"
        }
    );
    let checklist_id = new_id("notice-checklist", meeting.notice_checklists.len());
    meeting.notice_checklists.push(NoticeChecklist {
        id: checklist_id,
        meeting_type: meeting_type.clone(),
        statutory_basis: calculation_note.clone(),
        posting_deadline: posting_deadline.clone(),
        time_zone: time_zone.clone(),
        human_approval,
        status: "ready for posting".to_string(),
        checked_at_unix_seconds: now_unix_seconds(),
    });
    let title = meeting.title.clone();
    meeting.notice_status = "notice checklist ready".to_string();
    meeting.status = "notice checklist ready".to_string();
    push_audit(
        state,
        "civicclerk",
        "calculate-notice-deadline",
        format!(
            "Notice deadline calculated for {title}; type: {meeting_type}; deadline: {posting_deadline}; {calculation_note}; time zone: {time_zone}"
        ),
    );
    Ok(format!(
        "Notice deadline calculated as {posting_deadline}. Posting proof can now be recorded."
    ))
}

fn post_notice(state: &mut CityWorkState, payload: Option<&Value>) -> Result<String, String> {
    let posting_location = payload_string(payload, "postingLocation").map_err(|_| {
        "Enter the notice posting location before marking notice ready.".to_string()
    })?;
    let posting_method = payload_string(payload, "postingMethod")
        .map_err(|_| "Enter the notice posting method before marking notice ready.".to_string())?;
    let posting_confirmation = payload_string(payload, "postingConfirmation").map_err(|_| {
        "Enter the notice posting confirmation before marking notice ready.".to_string()
    })?;
    let posting_date = payload_string(payload, "postingDate")
        .map_err(|_| "Enter the actual notice posting date as YYYY-MM-DD.".to_string())?;
    parse_iso_date(&posting_date, "actual notice posting date")?;
    let meeting = selected_meeting_mut(state, payload)?;
    ensure_meeting_can_change(meeting)?;
    if meeting.agenda_items.is_empty() {
        return Err("Add at least one agenda item before posting notice.".to_string());
    }
    let checklist = latest_notice_checklist(meeting)
        .cloned()
        .ok_or_else(|| "Complete the notice checklist before marking notice ready.".to_string())?;
    if checklist.status != "ready for posting" || !checklist.human_approval {
        return Err("A clerk must approve the notice checklist before posting notice.".to_string());
    }
    if iso_date_after(
        &posting_date,
        &checklist.posting_deadline,
        "actual notice posting date",
        "notice posting deadline",
    )? {
        return Err(
            "The posting date is after the notice checklist deadline; update the checklist before marking notice ready."
                .to_string(),
        );
    }
    let notice_id = new_id("notice", meeting.notice_postings.len());
    meeting.notice_postings.push(NoticePosting {
        id: notice_id,
        location: posting_location.clone(),
        method: posting_method.clone(),
        confirmation: posting_confirmation.clone(),
        posted_on: posting_date.clone(),
        time_zone: checklist.time_zone.clone(),
        checklist_id: checklist.id.clone(),
        posted_at_unix_seconds: now_unix_seconds(),
    });
    let title = meeting.title.clone();
    meeting.notice_status = "public notice ready".to_string();
    meeting.status = "notice ready".to_string();
    push_audit(
        state,
        "civicclerk",
        "post-notice",
        format!(
            "Prepared public notice for {title}; posted at {posting_location} by {posting_method} on {posting_date} {}; confirmation: {posting_confirmation}",
            checklist.time_zone
        ),
    );
    Ok("Notice marked ready with posting evidence preserved locally.".to_string())
}

fn agenda_item_line(item: &AgendaItem) -> String {
    let mut line = format!("- {} [{} / {}]", item.title, item.status, item.visibility);
    if !item.department.is_empty() {
        line.push_str(&format!("; department: {}", item.department));
    }
    if !item.source_reference.is_empty() {
        line.push_str(&format!("; source: {}", item.source_reference));
    }
    line
}

fn staff_reports_or_default(reports: &[StaffReportRecord]) -> String {
    if reports.is_empty() {
        return "No staff reports recorded.".to_string();
    }
    reports
        .iter()
        .map(|report| {
            format!(
                "- {} ({})\n  Prepared by: {}\n  Recommendation: {}\n  Background: {}\n  Analysis: {}\n  Fiscal impact: {}\n  Alternatives: {}\n  Prior actions: {}\n  Revision note: {}",
                report.agenda_item_title,
                report.agenda_item_id,
                report.prepared_by,
                report.recommendation,
                report.background,
                report.analysis,
                report.fiscal_impact,
                report.alternatives,
                report.prior_actions,
                if report.revision_note.is_empty() {
                    "No revision note recorded."
                } else {
                    &report.revision_note
                }
            )
        })
        .collect::<Vec<_>>()
        .join("\n")
}

fn record_minutes(state: &mut CityWorkState, payload: Option<&Value>) -> Result<String, String> {
    let minutes = payload_string(payload, "minutes")?;
    let meeting = selected_meeting_mut(state, payload)?;
    ensure_meeting_can_change(meeting)?;
    if meeting.minutes_adopted_at_unix_seconds.is_some()
        || meeting.minutes_signed_at_unix_seconds.is_some()
    {
        return Err(
            "Minutes are already adopted. Create a correction record before replacing them."
                .to_string(),
        );
    }
    let title = meeting.title.clone();
    meeting.minutes = minutes;
    meeting.minute_citations.clear();
    meeting.status = "minutes drafted".to_string();
    push_audit(
        state,
        "civicclerk",
        "record-minutes",
        format!("Drafted minutes for: {title}; minute citations reset for the new draft."),
    );
    Ok("Minutes draft saved locally and tied to the meeting audit trail.".to_string())
}

fn add_minute_citation(
    state: &mut CityWorkState,
    payload: Option<&Value>,
) -> Result<String, String> {
    let sentence = payload_string(payload, "minutesCitationSentence")
        .map_err(|_| "Enter the minutes sentence or excerpt being cited.".to_string())?;
    let source_type = payload_string(payload, "minutesCitationSourceType").map_err(|_| {
        "Enter the citation source type, such as packet item or clerk note.".to_string()
    })?;
    let source_reference = payload_string(payload, "minutesCitationSourceRef").map_err(|_| {
        "Enter the packet item, transcript segment, or clerk note reference.".to_string()
    })?;
    let note = payload_optional_string(payload, "minutesCitationNote");
    let access_level = {
        let value = payload_optional_string(payload, "minutesCitationAccess").to_lowercase();
        if value.is_empty() {
            "public record".to_string()
        } else if value == "public record" || value == "staff-only" {
            value
        } else {
            return Err("Minute citation access must be public record or staff-only.".to_string());
        }
    };
    let meeting = selected_meeting_mut(state, payload)?;
    ensure_meeting_can_change(meeting)?;
    if meeting.minutes.trim().is_empty() {
        return Err("Save or generate a minutes draft before adding minute citations.".to_string());
    }
    if !meeting.minutes.contains(&sentence) {
        return Err(
            "The cited sentence or excerpt must appear in the current minutes draft.".to_string(),
        );
    }
    let citation = MinuteCitation {
        id: format!(
            "minute-citation-{}-{}",
            now_unix_seconds(),
            meeting.minute_citations.len() + 1
        ),
        sentence: sentence.clone(),
        source_type: source_type.clone(),
        source_reference: source_reference.clone(),
        note: note.clone(),
        access_level: access_level.clone(),
        created_at_unix_seconds: now_unix_seconds(),
    };
    meeting.minute_citations.push(citation);
    meeting.status = "minutes citations recorded".to_string();
    push_audit(
        state,
        "civicclerk",
        "add-minute-citation",
        format!("Added minute citation for {source_type} {source_reference}; {access_level}."),
    );
    Ok("Minute citation saved for clerk review and archive evidence.".to_string())
}

fn suggest_minutes_draft(
    state: &mut CityWorkState,
    payload: Option<&Value>,
) -> Result<String, String> {
    let meeting = selected_meeting_mut(state, payload)?;
    ensure_meeting_can_change(meeting)?;
    if meeting.minutes_adopted_at_unix_seconds.is_some() {
        return Err(
            "Minutes are already adopted. Create a correction record before drafting new minutes."
                .to_string(),
        );
    }
    let public_comments = if meeting.public_comments.is_empty() {
        "No public comments submitted.".to_string()
    } else {
        meeting
            .public_comments
            .iter()
            .map(|comment| {
                let body = if comment.status == "redacted for public record"
                    && !comment.redacted_body.is_empty()
                {
                    format!(
                        "{} (Redaction basis: {})",
                        comment.redacted_body, comment.redaction_basis
                    )
                } else {
                    comment.body.clone()
                };
                format!(
                    "- {} [{} / {}]: {}",
                    comment.commenter_name, comment.mode, comment.status, body
                )
            })
            .collect::<Vec<_>>()
            .join("\n")
    };
    let agenda = if meeting.agenda_items.is_empty() {
        "No agenda items recorded.".to_string()
    } else {
        meeting
            .agenda_items
            .iter()
            .map(agenda_item_line)
            .collect::<Vec<_>>()
            .join("\n")
    };
    let has_meeting_evidence = !meeting.summary.trim().is_empty()
        || !meeting.agenda_items.is_empty()
        || !meeting.staff_reports.is_empty()
        || !meeting.motions.is_empty()
        || !meeting.member_votes.is_empty()
        || !meeting.attendance_records.is_empty()
        || !meeting.quorum_checks.is_empty()
        || !meeting.votes.is_empty()
        || !meeting.action_items.is_empty()
        || !meeting.resident_comments.is_empty()
        || !meeting.public_comments.is_empty()
        || !meeting.attachments.is_empty()
        || !meeting.packet_assemblies.is_empty();
    if !has_meeting_evidence {
        return Err("Add a summary, agenda item, attachment, motion, roll-call vote, outcome, action item, or comment before generating a local AI minutes draft.".to_string());
    }
    let prompt = format!(
        "Draft internal city meeting minutes for clerk review. Use only the facts below. Do not mark the minutes adopted, official, or publicly archived. Do not invent motions, roll-call votes, attendance, quorum, speakers, attendees, or actions. Include clear sections for agenda, notice checklist, notice evidence, staff reports, packet attachments, packet finalization, attendance, quorum checks, motions, roll-call votes, outcomes, action items, and comments when present.\n\nMeeting title: {}\nDate: {}\nStatus: {}\nNotice status: {}\nNotice checklist:\n{}\nNotice posting evidence:\n{}\nSummary: {}\nAgenda:\n{}\nStaff reports:\n{}\nPacket attachments:\n{}\nPacket finalization:\n{}\nExisting minutes draft: {}\nAttendance:\n{}\nQuorum checks:\n{}\nRecorded motions:\n{}\nRoll-call votes:\n{}\nRecorded outcomes:\n{}\nAction items:\n{}\nDetailed action records:\n{}\nStaff-entered resident comments:\n{}\nPublic comments:\n{}\n",
        meeting.title,
        meeting.meeting_date,
        meeting.status,
        meeting.notice_status,
        notice_checklists_or_default(&meeting.notice_checklists),
        notice_postings_or_default(&meeting.notice_postings),
        if meeting.summary.is_empty() {
            "No summary recorded."
        } else {
            &meeting.summary
        },
        agenda,
        staff_reports_or_default(&meeting.staff_reports),
        meeting_attachments_or_default(&meeting.attachments),
        packet_assemblies_or_default(&meeting.packet_assemblies),
        if meeting.minutes.is_empty() {
            "No existing minutes draft recorded."
        } else {
            &meeting.minutes
        },
        meeting_attendance_or_default(&meeting.attendance_records),
        quorum_checks_or_default(&meeting.quorum_checks),
        motion_records_or_default(&meeting.motions),
        member_vote_records_or_default(&meeting.member_votes),
        list_or_default(&meeting.votes, "No outcomes recorded."),
        list_or_default(&meeting.action_items, "No action items recorded."),
        meeting_action_records_or_default(&meeting.action_records),
        list_or_default(&meeting.resident_comments, "No resident comments recorded."),
        public_comments
    );
    let title = meeting.title.clone();
    let (runtime_model, generated) = crate::model::generate_local_text(&prompt)?;
    meeting.minutes = generated;
    meeting.minute_citations.clear();
    meeting.status = "local AI minutes draft ready for review".to_string();
    push_audit(
        state,
        "civicclerk",
        "suggest-minutes-draft",
        format!("Generated local AI minutes draft for {title} with {runtime_model}; adoption still requires human review."),
    );
    Ok(
        "Local AI minutes draft generated. Review, edit, and adopt minutes before archive."
            .to_string(),
    )
}

fn record_motion(state: &mut CityWorkState, payload: Option<&Value>) -> Result<String, String> {
    let motion_text =
        payload_string(payload, "motionText").map_err(|_| "Enter the motion text.".to_string())?;
    let mover = payload_string(payload, "motionMover")
        .map_err(|_| "Enter who moved the motion.".to_string())?;
    let seconder = payload_optional_string(payload, "motionSeconder");
    let disposition = payload_string(payload, "motionDisposition")
        .map_err(|_| "Choose the motion disposition.".to_string())?
        .to_lowercase();
    let disposition = match disposition.as_str() {
        "pending vote" => "pending vote",
        "passed" => "passed",
        "failed" => "failed",
        "withdrawn" => "withdrawn",
        "tabled" => "tabled",
        _ => return Err("Choose pending vote, passed, failed, withdrawn, or tabled.".to_string()),
    };
    let meeting = selected_meeting_mut(state, payload)?;
    ensure_meeting_can_change(meeting)?;
    let motion_id = new_id("motion", meeting.motions.len());
    meeting.motions.push(MotionRecord {
        id: motion_id,
        text: motion_text.clone(),
        mover: mover.clone(),
        seconder: seconder.clone(),
        disposition: disposition.to_string(),
        vote_reference: payload_optional_string(payload, "motionVoteReference"),
        created_at_unix_seconds: now_unix_seconds(),
    });
    meeting.status = "motions recorded".to_string();
    push_audit(
        state,
        "civicclerk",
        "record-motion",
        format!("Recorded motion by {mover}: {motion_text}; disposition {disposition}."),
    );
    Ok("Motion saved to the meeting record.".to_string())
}

fn record_vote(state: &mut CityWorkState, payload: Option<&Value>) -> Result<String, String> {
    let vote = payload_string(payload, "vote")?;
    let meeting = selected_meeting_mut(state, payload)?;
    ensure_meeting_can_change(meeting)?;
    meeting.votes.push(vote.clone());
    meeting.status = "outcomes recorded".to_string();
    push_audit(
        state,
        "civicclerk",
        "record-vote",
        format!("Recorded vote/outcome: {vote}"),
    );
    Ok("Vote or action outcome saved locally.".to_string())
}

fn record_member_vote(
    state: &mut CityWorkState,
    payload: Option<&Value>,
) -> Result<String, String> {
    let vote = payload_string(payload, "memberVoteValue")
        .map_err(|_| "Choose the roll-call vote value.".to_string())?
        .to_lowercase();
    let vote = match vote.as_str() {
        "aye" => "aye",
        "nay" => "nay",
        "abstain" => "abstain",
        "absent" => "absent",
        "recused" => "recused",
        _ => return Err("Vote must be aye, nay, abstain, absent, or recused.".to_string()),
    };
    let meeting_index = selected_meeting_index(state, payload)?;
    let (body_id, meeting_title, motion_id, motion_text, vote_count) = {
        let meeting = &state.meetings[meeting_index];
        ensure_meeting_can_change(meeting)?;
        if meeting.motions.is_empty() {
            return Err("Record a motion before recording roll-call votes.".to_string());
        }
        let requested_motion_id = payload_optional_string(payload, "memberVoteMotionId");
        let motion = if requested_motion_id.is_empty() {
            meeting
                .motions
                .last()
                .expect("meeting motions are checked above")
        } else {
            meeting
                .motions
                .iter()
                .find(|motion| motion.id == requested_motion_id)
                .ok_or_else(|| "The selected motion was not found for this meeting.".to_string())?
        };
        (
            meeting.body_id.clone(),
            meeting.title.clone(),
            motion.id.clone(),
            motion.text.clone(),
            meeting.member_votes.len(),
        )
    };
    let requested_member_id = payload_optional_string(payload, "memberVoteMemberId");
    let requested_member_name = payload_optional_string(payload, "memberVoteMemberName");
    let member = if requested_member_id.is_empty() {
        state.meeting_members.iter().find(|member| {
            member.body_id == body_id && member.name.eq_ignore_ascii_case(&requested_member_name)
        })
    } else {
        state
            .meeting_members
            .iter()
            .find(|member| member.body_id == body_id && member.id == requested_member_id)
    }
    .cloned()
    .ok_or_else(|| "Choose a member from the meeting body roster.".to_string())?;
    if state.meetings[meeting_index]
        .member_votes
        .iter()
        .any(|record| record.motion_id == motion_id && record.member_id == member.id)
    {
        return Err(
            "This member already has a roll-call vote recorded for that motion.".to_string(),
        );
    }
    let meeting = &mut state.meetings[meeting_index];
    meeting.member_votes.push(MemberVoteRecord {
        id: new_id("member-vote", vote_count),
        motion_id: motion_id.clone(),
        motion_text: motion_text.clone(),
        member_id: member.id.clone(),
        member_name: member.name.clone(),
        vote: vote.to_string(),
        created_at_unix_seconds: now_unix_seconds(),
    });
    meeting.status = "roll-call vote recorded".to_string();
    push_audit(
        state,
        "civicclerk",
        "record-member-vote",
        format!(
            "Recorded roll-call vote for {meeting_title}: {} voted {vote} on {motion_text}.",
            member.name
        ),
    );
    Ok("Roll-call vote saved to the meeting record.".to_string())
}

fn normalize_attendance_status(value: &str) -> Result<&'static str, String> {
    match value.trim().to_lowercase().as_str() {
        "present" => Ok("present"),
        "remote" => Ok("remote"),
        "late" => Ok("late"),
        "absent" => Ok("absent"),
        "recused" => Ok("recused"),
        _ => {
            Err("Attendance status must be present, remote, late, absent, or recused.".to_string())
        }
    }
}

fn default_quorum_required_count(roster_count: usize) -> usize {
    (roster_count / 2) + 1
}

fn parse_quorum_required_count(
    payload: Option<&Value>,
    roster_count: usize,
) -> Result<usize, String> {
    let raw = payload_optional_string(payload, "quorumRequiredCount");
    if raw.is_empty() {
        return Ok(default_quorum_required_count(roster_count));
    }
    let required = raw
        .parse::<usize>()
        .map_err(|_| "Enter quorum required count as a whole number.".to_string())?;
    if required == 0 {
        return Err("Quorum required count must be at least 1.".to_string());
    }
    if required > roster_count {
        return Err("Quorum required count cannot exceed the active roster count.".to_string());
    }
    Ok(required)
}

fn record_meeting_attendance(
    state: &mut CityWorkState,
    payload: Option<&Value>,
) -> Result<String, String> {
    let status = normalize_attendance_status(
        &payload_string(payload, "attendanceStatus")
            .map_err(|_| "Choose the attendance status.".to_string())?,
    )?;
    let note = payload_optional_string(payload, "attendanceNote");
    let recorded_by = payload_string(payload, "attendanceRecordedBy")
        .map_err(|_| "Enter who recorded attendance.".to_string())?;
    let meeting_index = selected_meeting_index(state, payload)?;
    let (body_id, meeting_title, attendance_count) = {
        let meeting = &state.meetings[meeting_index];
        ensure_meeting_can_change(meeting)?;
        if meeting.body_id.is_empty() {
            return Err("Choose a meeting with a saved meeting body roster.".to_string());
        }
        (
            meeting.body_id.clone(),
            meeting.title.clone(),
            meeting.attendance_records.len(),
        )
    };
    let requested_member_id = payload_optional_string(payload, "attendanceMemberId");
    let requested_member_name = payload_optional_string(payload, "attendanceMemberName");
    let member = if requested_member_id.is_empty() {
        state.meeting_members.iter().find(|member| {
            member.body_id == body_id
                && member.status == "active"
                && member.name.eq_ignore_ascii_case(&requested_member_name)
        })
    } else {
        state.meeting_members.iter().find(|member| {
            member.body_id == body_id
                && member.status == "active"
                && member.id == requested_member_id
        })
    }
    .cloned()
    .ok_or_else(|| "Choose an active member from the meeting body roster.".to_string())?;
    if state.meetings[meeting_index]
        .attendance_records
        .iter()
        .any(|record| record.member_id == member.id)
    {
        return Err("This member already has attendance recorded for this meeting.".to_string());
    }
    let meeting = &mut state.meetings[meeting_index];
    meeting.attendance_records.push(MeetingAttendanceRecord {
        id: new_id("meeting-attendance", attendance_count),
        member_id: member.id.clone(),
        member_name: member.name.clone(),
        status: status.to_string(),
        note: note.clone(),
        recorded_by: recorded_by.clone(),
        created_at_unix_seconds: now_unix_seconds(),
    });
    meeting.status = "attendance recorded".to_string();
    push_audit(
        state,
        "civicclerk",
        "record-meeting-attendance",
        format!(
            "Recorded attendance for {meeting_title}: {} marked {status} by {recorded_by}.",
            member.name
        ),
    );
    Ok("Attendance saved to the meeting record.".to_string())
}

fn record_quorum_check(
    state: &mut CityWorkState,
    payload: Option<&Value>,
) -> Result<String, String> {
    let review_note = payload_string(payload, "quorumReviewNote")
        .map_err(|_| "Enter a quorum review note.".to_string())?;
    let meeting_index = selected_meeting_index(state, payload)?;
    let (body_id, meeting_title, attendance_records, quorum_count) = {
        let meeting = &state.meetings[meeting_index];
        ensure_meeting_can_change(meeting)?;
        if meeting.body_id.is_empty() {
            return Err("Choose a meeting with a saved meeting body roster.".to_string());
        }
        if meeting.attendance_records.is_empty() {
            return Err("Record attendance before checking quorum.".to_string());
        }
        (
            meeting.body_id.clone(),
            meeting.title.clone(),
            meeting.attendance_records.clone(),
            meeting.quorum_checks.len(),
        )
    };
    let roster_count = state
        .meeting_members
        .iter()
        .filter(|member| member.body_id == body_id && member.status == "active")
        .count();
    if roster_count == 0 {
        return Err("Save active meeting body members before checking quorum.".to_string());
    }
    let quorum_rule = state
        .meeting_bodies
        .iter()
        .find(|body| body.id == body_id)
        .map(|body| body.quorum_rule.clone())
        .unwrap_or_else(|| "majority of seated members".to_string());
    let required_count = parse_quorum_required_count(payload, roster_count)?;
    let present_count = attendance_records
        .iter()
        .filter(|record| record.status == "present" || record.status == "late")
        .count();
    let remote_count = attendance_records
        .iter()
        .filter(|record| record.status == "remote")
        .count();
    let absent_count = attendance_records
        .iter()
        .filter(|record| record.status == "absent")
        .count();
    let recused_count = attendance_records
        .iter()
        .filter(|record| record.status == "recused")
        .count();
    let quorum_present_count = present_count + remote_count;
    let status = if attendance_records.len() < roster_count {
        "attendance incomplete"
    } else if quorum_present_count >= required_count {
        "quorum met"
    } else {
        "quorum not met"
    };
    let meeting = &mut state.meetings[meeting_index];
    meeting.quorum_checks.push(QuorumCheckRecord {
        id: new_id("quorum-check", quorum_count),
        quorum_rule: quorum_rule.clone(),
        required_count,
        roster_count,
        present_count,
        remote_count,
        absent_count,
        recused_count,
        status: status.to_string(),
        review_note: review_note.clone(),
        created_at_unix_seconds: now_unix_seconds(),
    });
    meeting.status = "quorum checked".to_string();
    push_audit(
        state,
        "civicclerk",
        "record-quorum-check",
        format!(
            "Recorded quorum check for {meeting_title}: {status}; present/remote {quorum_present_count} of required {required_count}; rule {quorum_rule}."
        ),
    );
    Ok(format!("Quorum check saved: {status}."))
}

fn add_action_item(state: &mut CityWorkState, payload: Option<&Value>) -> Result<String, String> {
    let action_item = payload_string(payload, "actionItem")?;
    let owner = payload_optional_string(payload, "actionItemOwner");
    let due_date = payload_optional_string(payload, "actionItemDueDate");
    if !due_date.is_empty() {
        parse_iso_date(&due_date, "action item due date")?;
    }
    let status = payload_optional_string(payload, "actionItemStatus").to_lowercase();
    let status = if status.is_empty() {
        "open"
    } else {
        match status.as_str() {
            "open" => "open",
            "in progress" => "in progress",
            "completed" => "completed",
            "blocked" => "blocked",
            _ => return Err("Choose open, in progress, completed, or blocked.".to_string()),
        }
    };
    let source_reference = payload_optional_string(payload, "actionItemSourceReference");
    let meeting = selected_meeting_mut(state, payload)?;
    ensure_meeting_can_change(meeting)?;
    meeting.action_items.push(action_item.clone());
    let action_id = new_id("meeting-action", meeting.action_records.len());
    meeting.action_records.push(MeetingActionRecord {
        id: action_id,
        description: action_item.clone(),
        owner: owner.clone(),
        due_date: due_date.clone(),
        status: status.to_string(),
        source_reference: source_reference.clone(),
        created_at_unix_seconds: now_unix_seconds(),
    });
    meeting.status = "action items recorded".to_string();
    push_audit(
        state,
        "civicclerk",
        "add-action-item",
        format!(
            "Recorded action item: {action_item}; owner {owner}; due {due_date}; status {status}; source {source_reference}."
        ),
    );
    Ok("Action item added to the meeting record.".to_string())
}

fn record_resident_comment(
    state: &mut CityWorkState,
    payload: Option<&Value>,
) -> Result<String, String> {
    let resident_comment = payload_string(payload, "residentComment")?;
    let meeting = selected_meeting_mut(state, payload)?;
    ensure_meeting_can_change(meeting)?;
    meeting.resident_comments.push(resident_comment.clone());
    meeting.status = "resident comments recorded".to_string();
    push_audit(
        state,
        "civicclerk",
        "record-resident-comment",
        "Logged resident comment for meeting record.".to_string(),
    );
    Ok("Resident comment saved to the meeting record.".to_string())
}

fn submit_public_comment(
    state: &mut CityWorkState,
    payload: Option<&Value>,
) -> Result<String, String> {
    let meeting_id = payload_string(payload, "meetingId")?;
    let commenter_name = payload_string(payload, "commenterName")?;
    let commenter_contact = payload_optional_string(payload, "commenterContact");
    let mode = payload_optional_string(payload, "commentMode");
    let topic = payload_optional_string(payload, "commentTopic");
    let body = payload_string(payload, "commentBody")?;
    let meeting = state
        .meetings
        .iter_mut()
        .find(|meeting| meeting.id == meeting_id)
        .ok_or_else(|| "Select a posted public meeting before submitting comment.".to_string())?;
    if meeting.archived_at_unix_seconds.is_some() || meeting.status == "archived public record" {
        return Err("This meeting is archived. Public comments are closed.".to_string());
    }
    if meeting.notice_status != "public notice ready" {
        return Err("Public comments open only after the meeting notice is posted.".to_string());
    }
    let comment_id = new_id("comment", meeting.public_comments.len());
    meeting.public_comments.push(PublicComment {
        id: comment_id.clone(),
        commenter_name: commenter_name.clone(),
        commenter_contact,
        mode: if mode.is_empty() {
            "written".to_string()
        } else {
            mode
        },
        topic: if topic.is_empty() {
            "General public comment".to_string()
        } else {
            topic
        },
        body,
        status: "received for clerk review".to_string(),
        redacted_body: String::new(),
        redaction_basis: String::new(),
        reviewed_at_unix_seconds: None,
        redacted_at_unix_seconds: None,
        submitted_at_unix_seconds: now_unix_seconds(),
    });
    meeting.status = "public comments received".to_string();
    push_audit(
        state,
        "civicclerk",
        "submit-public-comment",
        format!("Received public comment {comment_id} from: {commenter_name}"),
    );
    Ok(format!(
        "Public comment {comment_id} saved for clerk review and packet/archive preservation."
    ))
}

fn selected_public_comment_indexes(
    state: &CityWorkState,
    payload: Option<&Value>,
) -> Result<(usize, usize), String> {
    let meeting_index = selected_meeting_index(state, payload)?;
    let comment_id = payload_optional_string(payload, "publicCommentId");
    let meeting = &state.meetings[meeting_index];
    if meeting.public_comments.is_empty() {
        return Err("Select a submitted public comment before review.".to_string());
    }
    let comment_index = if comment_id.is_empty() {
        meeting
            .public_comments
            .iter()
            .position(|comment| comment.status == "received for clerk review")
            .unwrap_or(0)
    } else {
        meeting
            .public_comments
            .iter()
            .position(|comment| comment.id == comment_id)
            .ok_or_else(|| "Selected public comment was not found for this meeting.".to_string())?
    };
    Ok((meeting_index, comment_index))
}

fn review_public_comment(
    state: &mut CityWorkState,
    payload: Option<&Value>,
) -> Result<String, String> {
    let (meeting_index, comment_index) = selected_public_comment_indexes(state, payload)?;
    let meeting = &mut state.meetings[meeting_index];
    ensure_meeting_can_change(meeting)?;
    let comment = &mut meeting.public_comments[comment_index];
    comment.status = "reviewed for public record".to_string();
    comment.reviewed_at_unix_seconds = Some(now_unix_seconds());
    let comment_id = comment.id.clone();
    let commenter_name = comment.commenter_name.clone();
    push_audit(
        state,
        "civicclerk",
        "review-public-comment",
        format!("Reviewed public comment {comment_id} from: {commenter_name}"),
    );
    Ok(format!(
        "Public comment {comment_id} marked reviewed for the public record."
    ))
}

fn redact_public_comment(
    state: &mut CityWorkState,
    payload: Option<&Value>,
) -> Result<String, String> {
    let redacted_body = payload_string(payload, "redactedBody")?;
    let redaction_basis = payload_string(payload, "redactionBasis")?;
    let (meeting_index, comment_index) = selected_public_comment_indexes(state, payload)?;
    let meeting = &mut state.meetings[meeting_index];
    ensure_meeting_can_change(meeting)?;
    let comment = &mut meeting.public_comments[comment_index];
    comment.status = "redacted for public record".to_string();
    comment.redacted_body = redacted_body;
    comment.redaction_basis = redaction_basis.clone();
    comment.reviewed_at_unix_seconds = Some(now_unix_seconds());
    comment.redacted_at_unix_seconds = Some(now_unix_seconds());
    let comment_id = comment.id.clone();
    let commenter_name = comment.commenter_name.clone();
    push_audit(
        state,
        "civicclerk",
        "redact-public-comment",
        format!(
            "Redacted public comment {comment_id} from {commenter_name}; basis: {redaction_basis}"
        ),
    );
    Ok(format!(
        "Public comment {comment_id} redacted with statutory basis recorded."
    ))
}

fn adopt_minutes(state: &mut CityWorkState, payload: Option<&Value>) -> Result<String, String> {
    let meeting = selected_meeting_mut(state, payload)?;
    ensure_meeting_can_change(meeting)?;
    if meeting.minutes.trim().is_empty() {
        return Err("Save a minutes draft before adopting minutes.".to_string());
    }
    if meeting.minute_citations.is_empty() {
        return Err("Add at least one minute citation before adopting minutes.".to_string());
    }
    if meeting.minutes_adopted_at_unix_seconds.is_some() {
        return Err(
            "Minutes are already adopted. Sign the adopted minutes before archive.".to_string(),
        );
    }
    let title = meeting.title.clone();
    meeting.minutes_adopted_at_unix_seconds = Some(now_unix_seconds());
    meeting.status = "minutes adopted".to_string();
    push_audit(
        state,
        "civicclerk",
        "adopt-minutes",
        format!("Adopted minutes for: {title}"),
    );
    Ok("Minutes marked adopted with audit evidence.".to_string())
}

fn sign_minutes(state: &mut CityWorkState, payload: Option<&Value>) -> Result<String, String> {
    let signer = payload_string(payload, "minutesSignedBy")
        .map_err(|_| "Enter the clerk or authorized signer name.".to_string())?;
    let attestation = payload_string(payload, "minutesSignatureAttestation")
        .map_err(|_| "Enter the signature attestation.".to_string())?;
    let meeting = selected_meeting_mut(state, payload)?;
    ensure_meeting_can_change(meeting)?;
    if meeting.minutes_adopted_at_unix_seconds.is_none() {
        return Err("Adopt the minutes before signing them.".to_string());
    }
    if meeting.minutes_signed_at_unix_seconds.is_some() {
        return Err("Minutes are already signed and ready for archive.".to_string());
    }
    let title = meeting.title.clone();
    meeting.minutes_signed_by = signer.clone();
    meeting.minutes_signature_attestation = attestation.clone();
    meeting.minutes_signed_at_unix_seconds = Some(now_unix_seconds());
    meeting.status = "minutes signed".to_string();
    push_audit(
        state,
        "civicclerk",
        "sign-minutes",
        format!("Signed adopted minutes for {title}; signer {signer}; attestation: {attestation}"),
    );
    Ok("Adopted minutes signed and ready for public archive.".to_string())
}

fn record_adopted_legislation(
    state: &mut CityWorkState,
    payload: Option<&Value>,
) -> Result<String, String> {
    let legislation_type = payload_string(payload, "adoptedLegislationType")
        .map_err(|_| "Choose ordinance or resolution.".to_string())?
        .to_lowercase();
    let legislation_type = match legislation_type.as_str() {
        "ordinance" => "ordinance",
        "resolution" => "resolution",
        _ => return Err("Choose ordinance or resolution.".to_string()),
    };
    let title = payload_string(payload, "adoptedLegislationTitle")
        .map_err(|_| "Enter the adopted ordinance or resolution title.".to_string())?;
    let text = payload_string(payload, "adoptedLegislationText")
        .map_err(|_| "Enter the adopted ordinance or resolution text.".to_string())?;
    let effective_date = payload_optional_string(payload, "adoptedLegislationEffectiveDate");
    if !effective_date.is_empty() {
        parse_iso_date(&effective_date, "adopted legislation effective date")?;
    }
    let codification_section_hint =
        payload_optional_string(payload, "adoptedLegislationCodificationHint");
    let (
        meeting_id,
        meeting_title,
        meeting_date,
        source_motion_id,
        source_motion_text,
        source_agenda_item_id,
        source_agenda_item_title,
    ) = {
        let meeting = selected_meeting_mut(state, payload)?;
        ensure_meeting_can_change(meeting)?;
        if meeting.minutes_signed_at_unix_seconds.is_none() {
            return Err(
                "Sign the adopted minutes before recording adopted legislation.".to_string(),
            );
        }
        let (source_motion_id, source_motion_text) = meeting
            .motions
            .iter()
            .rev()
            .find(|motion| motion.disposition == "passed")
            .map(|motion| (motion.id.clone(), motion.text.clone()))
            .ok_or_else(|| {
                "Record a passed motion before recording adopted legislation.".to_string()
            })?;
        let (source_agenda_item_id, source_agenda_item_title) = meeting
            .agenda_items
            .last()
            .map(|item| (item.id.clone(), item.title.clone()))
            .unwrap_or_default();
        meeting.status = "adopted legislation recorded".to_string();
        (
            meeting.id.clone(),
            meeting.title.clone(),
            meeting.meeting_date.clone(),
            source_motion_id,
            source_motion_text,
            source_agenda_item_id,
            source_agenda_item_title,
        )
    };
    let record_id = new_id("adopted-legislation", state.adopted_legislation.len());
    let code_source_id = new_id("code-source", state.code_sources.len());
    let created_at = now_unix_seconds();
    let citation = format!(
        "Adopted {} from {} on {}",
        legislation_type, meeting_title, meeting_date
    );
    let record = AdoptedLegislationRecord {
        id: record_id.clone(),
        code_source_id: code_source_id.clone(),
        meeting_id: meeting_id.clone(),
        meeting_title: meeting_title.clone(),
        legislation_type: legislation_type.to_string(),
        title: title.clone(),
        text: text.clone(),
        effective_date: effective_date.clone(),
        codification_section_hint: codification_section_hint.clone(),
        source_motion_id: source_motion_id.clone(),
        source_motion_text: source_motion_text.clone(),
        source_agenda_item_id: source_agenda_item_id.clone(),
        source_agenda_item_title: source_agenda_item_title.clone(),
        handoff_status: "pending CivicCode sync".to_string(),
        created_at_unix_seconds: created_at,
    };
    if let Some(meeting) = state
        .meetings
        .iter_mut()
        .find(|meeting| meeting.id == meeting_id)
    {
        meeting.adopted_legislation.push(record.clone());
    }
    state.adopted_legislation.insert(0, record);
    state.code_sources.insert(
        0,
        CodeSource {
            id: code_source_id.clone(),
            title: title.clone(),
            citation: citation.clone(),
            body: text,
            status: "adopted pending codifier sync".to_string(),
            source_original_path: String::new(),
            source_stored_path: String::new(),
            source_file_name: "CivicClerk adoption event".to_string(),
            source_sha256: String::new(),
            source_size_bytes: 0,
            imported_by: "CivicClerk".to_string(),
            codifier_name: String::new(),
            authoritative_url: String::new(),
            version_label: effective_date.clone(),
            codifier_sync_status: "pending codifier sync".to_string(),
            codifier_sync_errors: Vec::new(),
            last_codifier_sync_at_unix_seconds: None,
            stale_since_unix_seconds: None,
            amendment_notes: vec![format!(
                "Created from CivicClerk adoption event {record_id}; motion: {source_motion_text}; agenda item: {}",
                if source_agenda_item_title.is_empty() {
                    "not linked"
                } else {
                    &source_agenda_item_title
                }
            )],
            version_history: vec![CodeVersionEntry {
                id: new_id("code-version", 0),
                label: format!("Adopted {}", legislation_type),
                source: format!("CivicClerk adoption event {record_id}"),
                authoritative_url: String::new(),
                note: format!(
                    "Motion: {}; codification hint: {}",
                    source_motion_text,
                    if codification_section_hint.is_empty() {
                        "not recorded"
                    } else {
                        &codification_section_hint
                    }
                ),
                status: "pending codifier sync".to_string(),
                recorded_at_unix_seconds: created_at,
            }],
            staff_guidance: String::new(),
            plain_language_summary: String::new(),
            guidance_approved_at_unix_seconds: None,
            public_status: default_code_public_status(),
            public_exports: Vec::new(),
            published_at_unix_seconds: None,
            created_at_unix_seconds: created_at,
        },
    );
    push_audit(
        state,
        "civicclerk",
        "record-adopted-legislation",
        format!(
            "Recorded adopted {legislation_type} {title} from meeting {meeting_title}; handoff {record_id} created for CivicCode."
        ),
    );
    push_audit(
        state,
        "civiccode",
        "receive-adopted-legislation",
        format!("Received adopted {legislation_type} {title} as code source {code_source_id}."),
    );
    Ok(format!(
        "Adopted {legislation_type} recorded and queued for CivicCode codifier sync."
    ))
}

fn record_closed_session(
    state: &mut CityWorkState,
    payload: Option<&Value>,
) -> Result<String, String> {
    let statutory_basis = payload_string(payload, "closedSessionBasis")
        .map_err(|_| "Enter the statutory basis for the closed session.".to_string())?;
    let topics = payload_text_list(payload, "closedSessionTopics");
    if topics.is_empty() {
        return Err("Enter at least one closed-session topic.".to_string());
    }
    let attendees = payload_text_list(payload, "closedSessionAttendees");
    let entered_at = payload_string(payload, "closedSessionEnteredAt")
        .map_err(|_| "Enter when the body entered closed session.".to_string())?;
    let exited_at = payload_string(payload, "closedSessionExitedAt")
        .map_err(|_| "Enter when the body exited closed session.".to_string())?;
    let reconvene_statement = payload_string(payload, "closedSessionReconvene")
        .map_err(|_| "Enter the open-session reconvene statement.".to_string())?;
    let staff_notes_reference = payload_optional_string(payload, "closedSessionNotesReference");
    let meeting = selected_meeting_mut(state, payload)?;
    ensure_meeting_can_change(meeting)?;
    let record_id = new_id("closed-session", meeting.closed_sessions.len());
    meeting.closed_sessions.push(ClosedSessionRecord {
        id: record_id.clone(),
        statutory_basis: statutory_basis.clone(),
        topics: topics.clone(),
        attendees: attendees.clone(),
        entered_at: entered_at.clone(),
        exited_at: exited_at.clone(),
        reconvene_statement: reconvene_statement.clone(),
        staff_notes_reference: staff_notes_reference.clone(),
        created_at_unix_seconds: now_unix_seconds(),
    });
    meeting.status = "closed session recorded".to_string();
    push_audit(
        state,
        "civicclerk",
        "record-closed-session",
        format!(
            "Recorded closed session {record_id}; basis {statutory_basis}; topics {}; entered {entered_at}; exited {exited_at}; staff notes reference {}.",
            topics.join("; "),
            if staff_notes_reference.is_empty() {
                "not recorded"
            } else {
                &staff_notes_reference
            }
        ),
    );
    Ok(
        "Closed-session boundary saved with staff-only notes separated from the public record."
            .to_string(),
    )
}

fn list_or_default(values: &[String], empty: &str) -> String {
    if values.is_empty() {
        empty.to_string()
    } else {
        values
            .iter()
            .map(|value| format!("- {value}"))
            .collect::<Vec<_>>()
            .join("\n")
    }
}

fn motion_records_or_default(motions: &[MotionRecord]) -> String {
    if motions.is_empty() {
        return "No motions recorded.".to_string();
    }
    motions
        .iter()
        .map(|motion| {
            let second = if motion.seconder.is_empty() {
                "no seconder recorded".to_string()
            } else {
                format!("seconded by {}", motion.seconder)
            };
            let vote_reference = if motion.vote_reference.is_empty() {
                "no vote reference recorded".to_string()
            } else {
                format!("vote reference: {}", motion.vote_reference)
            };
            format!(
                "- {} (moved by {}; {}; {}; {})",
                motion.text, motion.mover, second, motion.disposition, vote_reference
            )
        })
        .collect::<Vec<_>>()
        .join("\n")
}

fn member_vote_records_or_default(votes: &[MemberVoteRecord]) -> String {
    if votes.is_empty() {
        return "No roll-call votes recorded.".to_string();
    }
    votes
        .iter()
        .map(|vote| {
            format!(
                "- {}: {} on \"{}\"",
                vote.member_name, vote.vote, vote.motion_text
            )
        })
        .collect::<Vec<_>>()
        .join("\n")
}

fn meeting_attendance_or_default(records: &[MeetingAttendanceRecord]) -> String {
    if records.is_empty() {
        return "No attendance records recorded.".to_string();
    }
    records
        .iter()
        .map(|record| {
            let note = if record.note.is_empty() {
                "no note recorded".to_string()
            } else {
                format!("note: {}", record.note)
            };
            format!(
                "- {}: {} (recorded by {}; {})",
                record.member_name, record.status, record.recorded_by, note
            )
        })
        .collect::<Vec<_>>()
        .join("\n")
}

fn quorum_checks_or_default(records: &[QuorumCheckRecord]) -> String {
    if records.is_empty() {
        return "No quorum checks recorded.".to_string();
    }
    records
        .iter()
        .map(|record| {
            format!(
                "- {}: present/remote {} of required {}; roster {}; absent {}; recused {}; rule: {}; note: {}",
                record.status,
                record.present_count + record.remote_count,
                record.required_count,
                record.roster_count,
                record.absent_count,
                record.recused_count,
                record.quorum_rule,
                record.review_note
            )
        })
        .collect::<Vec<_>>()
        .join("\n")
}

fn meeting_action_records_or_default(actions: &[MeetingActionRecord]) -> String {
    if actions.is_empty() {
        return "No detailed action item records.".to_string();
    }
    actions
        .iter()
        .map(|action| {
            let owner = if action.owner.is_empty() {
                "unassigned".to_string()
            } else {
                action.owner.clone()
            };
            let due_date = if action.due_date.is_empty() {
                "no due date".to_string()
            } else {
                format!("due {}", action.due_date)
            };
            let source = if action.source_reference.is_empty() {
                "no source reference".to_string()
            } else {
                format!("source: {}", action.source_reference)
            };
            format!(
                "- {} (owner: {}; {}; status: {}; {})",
                action.description, owner, due_date, action.status, source
            )
        })
        .collect::<Vec<_>>()
        .join("\n")
}

fn minutes_signature_or_default(meeting: &Meeting) -> String {
    meeting
        .minutes_signed_at_unix_seconds
        .map(|timestamp| {
            format!(
                "Signed by {} at Unix timestamp {}. Attestation: {}",
                meeting.minutes_signed_by, timestamp, meeting.minutes_signature_attestation
            )
        })
        .unwrap_or_else(|| "Minutes have not been signed.".to_string())
}

fn adopted_legislation_or_default(records: &[AdoptedLegislationRecord]) -> String {
    if records.is_empty() {
        return "No adopted ordinances or resolutions recorded.".to_string();
    }
    records
        .iter()
        .map(|record| {
            format!(
                "- {}: {} (effective {}; codification hint: {}; motion: {}; handoff: {})",
                record.legislation_type,
                record.title,
                if record.effective_date.is_empty() {
                    "not recorded"
                } else {
                    &record.effective_date
                },
                if record.codification_section_hint.is_empty() {
                    "not recorded"
                } else {
                    &record.codification_section_hint
                },
                record.source_motion_text,
                record.handoff_status
            )
        })
        .collect::<Vec<_>>()
        .join("\n")
}

fn closed_sessions_or_default(records: &[ClosedSessionRecord]) -> String {
    if records.is_empty() {
        return "No closed sessions recorded.".to_string();
    }
    records
        .iter()
        .map(|record| {
            format!(
                "- Basis: {}; topics: {}; entered: {}; exited: {}; attendees: {}; reconvene: {}; staff notes: {}",
                record.statutory_basis,
                if record.topics.is_empty() {
                    "not recorded".to_string()
                } else {
                    record.topics.join("; ")
                },
                record.entered_at,
                record.exited_at,
                if record.attendees.is_empty() {
                    "hidden or not recorded".to_string()
                } else {
                    record.attendees.join("; ")
                },
                record.reconvene_statement,
                if record.staff_notes_reference.is_empty() {
                    "hidden or not recorded".to_string()
                } else {
                    record.staff_notes_reference.clone()
                }
            )
        })
        .collect::<Vec<_>>()
        .join("\n")
}

fn push_records_timeline(request: &mut RecordsRequest, action: &str, actor: &str, note: String) {
    let id = format!(
        "records-timeline-{}-{}",
        now_unix_seconds(),
        request.timeline.len() + 1
    );
    request.timeline.push(RecordsTimelineEntry {
        id,
        action: action.to_string(),
        actor: actor.to_string(),
        note,
        created_at_unix_seconds: now_unix_seconds(),
    });
}

fn push_records_public_status(
    request: &mut RecordsRequest,
    label: &str,
    status: &str,
    summary: String,
) {
    let id = format!(
        "records-public-status-{}-{}",
        now_unix_seconds(),
        request.public_status_events.len() + 1
    );
    request.public_status_events.push(RecordsPublicStatusEvent {
        id,
        label: label.to_string(),
        summary,
        status: status.to_string(),
        created_at_unix_seconds: now_unix_seconds(),
    });
}

fn records_timeline_or_default(entries: &[RecordsTimelineEntry]) -> String {
    if entries.is_empty() {
        return "No request timeline entries recorded.".to_string();
    }
    entries
        .iter()
        .map(|entry| format!("- {} by {}: {}", entry.action, entry.actor, entry.note))
        .collect::<Vec<_>>()
        .join("\n")
}

fn records_messages_or_default(messages: &[RecordsMessage]) -> String {
    if messages.is_empty() {
        return "No request messages recorded.".to_string();
    }
    messages
        .iter()
        .map(|message| {
            format!(
                "- {} ({}): {}",
                message.author, message.author_role, message.body
            )
        })
        .collect::<Vec<_>>()
        .join("\n")
}

fn records_documents_or_default(documents: &[RecordsDocument]) -> String {
    if documents.is_empty() {
        return "No request documents attached.".to_string();
    }
    documents
        .iter()
        .map(|document| {
            let release_copy = if document.release_sha256.is_empty() {
                "No release-ready or redacted copy attached.".to_string()
            } else {
                format!(
                    "{}: {} (sha256 {}, {} bytes, stored in the local release file store; note: {})",
                    if document.release_status.is_empty() {
                        "release copy"
                    } else {
                        &document.release_status
                    },
                    if document.release_file_name.is_empty() {
                        "records-release-copy"
                    } else {
                        &document.release_file_name
                    },
                    document.release_sha256,
                    document.release_size_bytes,
                    if document.release_note.is_empty() {
                        "No release note recorded."
                    } else {
                        &document.release_note
                    }
                )
            };
            format!(
                "- {} [{}]: {} (sha256 {}, stored at {})\n  Release artifact: {}",
                document.title,
                document.status,
                if document.citation.is_empty() {
                    "No citation recorded."
                } else {
                    &document.citation
                },
                document.sha256,
                document.stored_path,
                release_copy
            )
        })
        .collect::<Vec<_>>()
        .join("\n")
}

fn records_search_sessions_or_default(sessions: &[RecordsSearchSession]) -> String {
    if sessions.is_empty() {
        return "No structured search sessions recorded.".to_string();
    }
    sessions
        .iter()
        .map(|session| {
            let results = if session.results.is_empty() {
                "  - No search results recorded.".to_string()
            } else {
                session
                    .results
                    .iter()
                    .map(|result| {
                        format!(
                            "  - {} [{}] {}: {}",
                            result.title, result.status, result.citation, result.summary
                        )
                    })
                    .collect::<Vec<_>>()
                    .join("\n")
            };
            format!(
                "- Query: {}\n  Locations: {}\n  Reviewer: {}\n{}",
                session.query, session.locations, session.reviewer, results
            )
        })
        .collect::<Vec<_>>()
        .join("\n")
}

fn records_exemption_decisions_or_default(decisions: &[RecordsExemptionDecision]) -> String {
    if decisions.is_empty() {
        return "No structured exemption decisions recorded.".to_string();
    }
    decisions
        .iter()
        .map(|decision| {
            format!(
                "- {} [{}] {}: {} under {} (reviewed by {})",
                decision.source,
                decision.kind,
                decision.decision,
                decision.finding,
                decision.basis,
                decision.reviewer
            )
        })
        .collect::<Vec<_>>()
        .join("\n")
}

fn records_release_packages_or_default(packages: &[RecordsReleasePackage]) -> String {
    if packages.is_empty() {
        return "No release package manifest built.".to_string();
    }
    packages
        .iter()
        .map(|package| {
            format!(
                "- {} (sha256 {}, documents {}, release artifacts {}, search sessions {}, release {}, redact {}, exempt {})",
                package.export_path,
                package.package_hash,
                package.document_count,
                package.release_artifact_count,
                package.search_session_count,
                package.release_count,
                package.redacted_count,
                package.exempt_count
            )
        })
        .collect::<Vec<_>>()
        .join("\n")
}

fn records_fee_total_cents(items: &[RecordsFeeLineItem]) -> i64 {
    items.iter().map(|item| item.amount_cents).sum()
}

fn records_fee_lines_or_default(items: &[RecordsFeeLineItem]) -> String {
    if items.is_empty() {
        return "No fee line items recorded.".to_string();
    }
    items
        .iter()
        .map(|item| {
            let basis = if item.schedule_basis.is_empty() {
                "No fee schedule basis recorded.".to_string()
            } else {
                format!("Schedule/basis: {}", item.schedule_basis)
            };
            format!(
                "- {}: {} ({})",
                item.description,
                format_money_cents(item.amount_cents),
                basis
            )
        })
        .collect::<Vec<_>>()
        .join("\n")
}

fn code_version_history_or_default(entries: &[CodeVersionEntry]) -> String {
    if entries.is_empty() {
        return "No version or codifier history recorded.".to_string();
    }
    entries
        .iter()
        .map(|entry| {
            let url = if entry.authoritative_url.is_empty() {
                "No authoritative URL recorded."
            } else {
                &entry.authoritative_url
            };
            format!(
                "- {}: {} from {} at {}\n  URL: {}",
                entry.status, entry.label, entry.source, entry.recorded_at_unix_seconds, url
            )
        })
        .collect::<Vec<_>>()
        .join("\n")
}

fn notice_checklists_or_default(entries: &[NoticeChecklist]) -> String {
    if entries.is_empty() {
        return "No notice checklist has been approved.".to_string();
    }
    entries
        .iter()
        .map(|entry| {
            format!(
                "- {} notice; basis: {}; deadline: {}; time zone: {}; status: {}",
                entry.meeting_type,
                entry.statutory_basis,
                entry.posting_deadline,
                entry.time_zone,
                entry.status
            )
        })
        .collect::<Vec<_>>()
        .join("\n")
}

fn notice_postings_or_default(entries: &[NoticePosting]) -> String {
    if entries.is_empty() {
        return "No notice posting evidence recorded.".to_string();
    }
    entries
        .iter()
        .map(|entry| {
            let posted_on = if entry.posted_on.is_empty() {
                format!("Unix timestamp {}", entry.posted_at_unix_seconds)
            } else {
                format!("{} {}", entry.posted_on, entry.time_zone)
            };
            format!(
                "- {} via {} on {}; confirmation: {}",
                entry.location, entry.method, posted_on, entry.confirmation
            )
        })
        .collect::<Vec<_>>()
        .join("\n")
}

fn meeting_attachments_or_default(attachments: &[MeetingAttachment]) -> String {
    if attachments.is_empty() {
        return "No packet attachments recorded.".to_string();
    }
    attachments
        .iter()
        .map(|attachment| {
            let stored_location = if attachment.stored_path.is_empty() {
                "local path hidden"
            } else {
                &attachment.stored_path
            };
            format!(
                "- {} [{} / {}]: {} (sha256 {}, stored at {})",
                attachment.title,
                attachment.packet_section,
                attachment.access_level,
                if attachment.citation.is_empty() {
                    "No citation recorded."
                } else {
                    &attachment.citation
                },
                attachment.sha256,
                stored_location
            )
        })
        .collect::<Vec<_>>()
        .join("\n")
}

fn packet_assemblies_or_default(records: &[PacketAssemblyRecord]) -> String {
    if records.is_empty() {
        return "No packet finalization recorded.".to_string();
    }
    records
        .iter()
        .map(|record| {
            format!(
                "- {} [{}]: reviewed by {}; agenda items {}; public attachments {}; closed-session addenda {}; note: {}",
                record.packet_title,
                record.status,
                record.prepared_by,
                record.agenda_item_count,
                record.public_attachment_count,
                record.closed_session_attachment_count,
                record.review_note
            )
        })
        .collect::<Vec<_>>()
        .join("\n")
}

fn minute_citations_or_default(citations: &[MinuteCitation]) -> String {
    if citations.is_empty() {
        return "No minute citations recorded.".to_string();
    }
    citations
        .iter()
        .map(|citation| {
            let note = if citation.note.is_empty() {
                "No note recorded."
            } else {
                &citation.note
            };
            format!(
                "- \"{}\" -> {}: {} [{}]. {}",
                citation.sentence,
                citation.source_type,
                citation.source_reference,
                citation.access_level,
                note
            )
        })
        .collect::<Vec<_>>()
        .join("\n")
}

fn code_version_history_search_text(entries: &[CodeVersionEntry]) -> String {
    entries
        .iter()
        .map(|entry| {
            format!(
                "{} {} {} {} {}",
                entry.status, entry.label, entry.source, entry.authoritative_url, entry.note
            )
        })
        .collect::<Vec<_>>()
        .join(" ")
}

fn meeting_packet_contents(meeting: &Meeting) -> String {
    let agenda = if meeting.agenda_items.is_empty() {
        "No agenda items recorded.".to_string()
    } else {
        meeting
            .agenda_items
            .iter()
            .map(agenda_item_line)
            .collect::<Vec<_>>()
            .join("\n")
    };
    let votes = list_or_default(&meeting.votes, "No outcomes recorded.");
    let motions = motion_records_or_default(&meeting.motions);
    let member_votes = member_vote_records_or_default(&meeting.member_votes);
    let attendance = meeting_attendance_or_default(&meeting.attendance_records);
    let quorum_checks = quorum_checks_or_default(&meeting.quorum_checks);
    let action_items = list_or_default(&meeting.action_items, "No action items recorded.");
    let action_records = meeting_action_records_or_default(&meeting.action_records);
    let staff_reports = staff_reports_or_default(&meeting.staff_reports);
    let adopted_legislation = adopted_legislation_or_default(&meeting.adopted_legislation);
    let closed_sessions = closed_sessions_or_default(&meeting.closed_sessions);
    let resident_comments =
        list_or_default(&meeting.resident_comments, "No resident comments recorded.");
    let public_comments = if meeting.public_comments.is_empty() {
        "No public comments submitted.".to_string()
    } else {
        meeting
            .public_comments
            .iter()
            .map(|comment| {
                let body = if comment.status == "redacted for public record"
                    && !comment.redacted_body.is_empty()
                {
                    format!(
                        "{} (Redaction basis: {})",
                        comment.redacted_body, comment.redaction_basis
                    )
                } else {
                    comment.body.clone()
                };
                format!(
                    "- {} [{} / {}]: {}",
                    comment.commenter_name, comment.mode, comment.status, body
                )
            })
            .collect::<Vec<_>>()
            .join("\n")
    };
    let minutes_adoption = meeting
        .minutes_adopted_at_unix_seconds
        .map(|timestamp| format!("Adopted at Unix timestamp {timestamp}."))
        .unwrap_or_else(|| "Minutes have not been adopted.".to_string());
    let minutes_signature = minutes_signature_or_default(meeting);
    let notice_checklists = notice_checklists_or_default(&meeting.notice_checklists);
    let notice_postings = notice_postings_or_default(&meeting.notice_postings);
    let attachments = meeting_attachments_or_default(&meeting.attachments);
    let packet_assemblies = packet_assemblies_or_default(&meeting.packet_assemblies);
    let minute_citations = minute_citations_or_default(&meeting.minute_citations);
    let body_name = if meeting.body_name.is_empty() {
        "No meeting body recorded."
    } else {
        &meeting.body_name
    };
    format!(
        "# {}\n\nBody: {}\nDate: {}\nStatus: {}\nNotice: {}\n\n## Notice Checklist\n{}\n\n## Notice Posting Evidence\n{}\n\n## Summary\n{}\n\n## Agenda\n{}\n\n## Staff Reports\n{}\n\n## Packet Attachments\n{}\n\n## Packet Finalization\n{}\n\n## Closed Sessions\n{}\n\n## Minutes\n{}\n\n## Minute Citations\n{}\n\n## Minutes Adoption\n{}\n\n## Minutes Signature\n{}\n\n## Adopted Ordinances And Resolutions\n{}\n\n## Attendance\n{}\n\n## Quorum Checks\n{}\n\n## Motions\n{}\n\n## Roll Call Votes\n{}\n\n## Outcomes\n{}\n\n## Action Items\n{}\n\n## Action Item Details\n{}\n\n## Staff-Entered Resident Comments\n{}\n\n## Public Comments\n{}\n",
        meeting.title,
        body_name,
        meeting.meeting_date,
        meeting.status,
        meeting.notice_status,
        notice_checklists,
        notice_postings,
        if meeting.summary.is_empty() {
            "No summary recorded."
        } else {
            &meeting.summary
        },
        agenda,
        staff_reports,
        attachments,
        packet_assemblies,
        closed_sessions,
        if meeting.minutes.is_empty() {
            "No minutes draft recorded."
        } else {
            &meeting.minutes
        },
        minute_citations,
        minutes_adoption,
        minutes_signature,
        adopted_legislation,
        attendance,
        quorum_checks,
        motions,
        member_votes,
        votes,
        action_items,
        action_records,
        resident_comments,
        public_comments
    )
}

fn export_meeting_packet(
    state: &mut CityWorkState,
    payload: Option<&Value>,
) -> Result<String, String> {
    let meeting = selected_meeting_mut(state, payload)?;
    let public_record =
        meeting.archived_at_unix_seconds.is_some() || meeting.status == "archived public record";
    let export_meeting = if public_record {
        public_meeting_projection(meeting).unwrap_or_else(|| meeting.clone())
    } else {
        meeting.clone()
    };
    let contents = meeting_packet_contents(&export_meeting);
    let export_path = write_export_file("meetings", &meeting.title, &contents)?;
    let export_path_buf = PathBuf::from(&export_path);
    let bundle_sequence = meeting.export_bundles.len() + 1;
    let bundle = match write_meeting_export_bundle(
        &export_meeting,
        &export_path_buf,
        &contents,
        public_record,
        bundle_sequence,
        "civicclerk-meeting-packet-notice",
    ) {
        Ok(bundle) => bundle,
        Err(error) => {
            remove_export_artifacts(&export_path_buf);
            return Err(error);
        }
    };
    meeting.exports.push(export_path.clone());
    meeting.export_bundles.push(bundle);
    if meeting.archived_at_unix_seconds.is_none() {
        meeting.status = "packet exported".to_string();
    }
    push_audit(
        state,
        "civicclerk",
        "export-meeting-packet",
        format!("Exported records-ready meeting packet bundle: {export_path}"),
    );
    Ok(format!(
        "Records-ready meeting packet bundle written to {export_path}."
    ))
}

fn export_notice_archive_packet(
    state: &mut CityWorkState,
    payload: Option<&Value>,
) -> Result<String, String> {
    let meeting = selected_meeting_mut(state, payload)?;
    if meeting.notice_checklists.is_empty() {
        return Err(
            "Save the notice checklist before building a notice archive packet.".to_string(),
        );
    }
    if meeting.notice_postings.is_empty() || meeting.notice_status != "public notice ready" {
        return Err("Record posting proof before building a notice archive packet.".to_string());
    }
    let public_notice = public_meeting_projection(meeting).ok_or_else(|| {
        "Complete the public notice workflow before building a notice archive packet.".to_string()
    })?;
    let contents = meeting_packet_contents(&public_notice);
    let export_path = write_export_file("notice", &meeting.title, &contents)?;
    let export_path_buf = PathBuf::from(&export_path);
    let bundle_sequence = meeting.export_bundles.len() + 1;
    let bundle = match write_meeting_export_bundle(
        &public_notice,
        &export_path_buf,
        &contents,
        true,
        bundle_sequence,
        "civicnotice-notice-archive-packet",
    ) {
        Ok(bundle) => bundle,
        Err(error) => {
            remove_export_artifacts(&export_path_buf);
            return Err(error);
        }
    };
    meeting.exports.push(export_path.clone());
    meeting.export_bundles.push(bundle);
    push_audit(
        state,
        "civicnotice",
        "export-notice-archive-packet",
        format!("Exported public notice archive packet bundle: {export_path}"),
    );
    Ok(format!(
        "Notice archive packet bundle written to {export_path}."
    ))
}

fn archive_meeting(state: &mut CityWorkState, payload: Option<&Value>) -> Result<String, String> {
    let (meeting_id, title, export_path, public_payload, manifest_path) = {
        let meeting = selected_meeting_mut(state, payload)?;
        if meeting.minutes_adopted_at_unix_seconds.is_none() {
            return Err(
                "Adopt the minutes before archiving the public meeting record.".to_string(),
            );
        }
        if meeting.minutes_signed_at_unix_seconds.is_none() {
            return Err(
                "Sign the adopted minutes before archiving the public meeting record.".to_string(),
            );
        }
        meeting.status = "archived public record".to_string();
        meeting.archived_at_unix_seconds = Some(now_unix_seconds());
        let public_meeting = public_meeting_projection(meeting).unwrap_or_else(|| meeting.clone());
        let contents = meeting_packet_contents(&public_meeting);
        let export_path = write_export_file("meetings", &meeting.title, &contents)?;
        let export_path_buf = PathBuf::from(&export_path);
        let bundle_sequence = meeting.export_bundles.len() + 1;
        let bundle = match write_meeting_export_bundle(
            &public_meeting,
            &export_path_buf,
            &contents,
            true,
            bundle_sequence,
            "civicclerk-meeting-packet-notice",
        ) {
            Ok(bundle) => bundle,
            Err(error) => {
                remove_export_artifacts(&export_path_buf);
                return Err(error);
            }
        };
        let manifest_path = bundle.manifest_path.clone();
        meeting.exports.push(export_path.clone());
        meeting.export_bundles.push(bundle);
        (
            meeting.id.clone(),
            meeting.title.clone(),
            export_path,
            contents,
            manifest_path,
        )
    };
    push_publication_event(
        state,
        "civicclerk",
        meeting_id,
        "meeting-archive",
        public_payload,
    );
    push_audit(
        state,
        "civicclerk",
        "archive-meeting",
        format!("Archived public meeting record for {title}: {export_path}; bundle manifest {manifest_path}"),
    );
    Ok(format!(
        "Public meeting archive and records-ready bundle written to {export_path}."
    ))
}

fn create_records_request(
    state: &mut CityWorkState,
    payload: Option<&Value>,
) -> Result<String, String> {
    let requester = payload_string(payload, "requester")?;
    let summary = payload_string(payload, "summary")?;
    let deadline = payload_string(payload, "deadline")?;
    parse_iso_date(&deadline, "records response deadline")?;
    let deadline_basis = payload_optional_string(payload, "deadlineBasis");
    let deadline_basis = if deadline_basis.is_empty() {
        "Staff-entered deadline at intake.".to_string()
    } else {
        deadline_basis
    };
    let id = new_id("records", state.records_requests.len());
    let tracking_number = records_tracking_number(state.records_requests.len());
    state.records_requests.insert(
        0,
        RecordsRequest {
            id,
            public_tracking_number: tracking_number.clone(),
            requester: requester.clone(),
            requester_contact: String::new(),
            submitted_via: "Staff intake".to_string(),
            summary,
            deadline: deadline.clone(),
            deadline_basis,
            status: "received".to_string(),
            assigned_to: String::new(),
            clarification_notes: Vec::new(),
            search_notes: Vec::new(),
            search_sessions: Vec::new(),
            exemption_reviews: Vec::new(),
            exemption_decisions: Vec::new(),
            fee_estimate: String::new(),
            fee_line_items: Vec::new(),
            fee_waiver_reason: String::new(),
            citations: Vec::new(),
            response_draft: String::new(),
            approval_notes: Vec::new(),
            exports: Vec::new(),
            release_packages: Vec::new(),
            timeline: Vec::new(),
            public_status_events: Vec::new(),
            messages: Vec::new(),
            documents: Vec::new(),
            deadline_reviewed_at_unix_seconds: Some(now_unix_seconds()),
            approved_at_unix_seconds: None,
            release_revision: 0,
            exported_revision: 0,
            packaged_revision: 0,
            fulfilled_at_unix_seconds: None,
            closed_at_unix_seconds: None,
            created_at_unix_seconds: now_unix_seconds(),
        },
    );
    push_records_timeline(
        &mut state.records_requests[0],
        "intake",
        "records staff",
        format!("Staff created request {tracking_number} with deadline {deadline}."),
    );
    push_records_public_status(
        &mut state.records_requests[0],
        "Request received",
        "received",
        format!("Request {tracking_number} was created by staff and is being tracked locally."),
    );
    let request_id = state.records_requests[0].id.clone();
    push_notification_event(
        state,
        "civicrecords-ai",
        request_id,
        "records staff",
        format!("Records request {tracking_number} created"),
        format!("Staff-created request for {requester} is saved locally with deadline {deadline}."),
    );
    push_audit(
        state,
        "civicrecords-ai",
        "create-records-request",
        format!("Created records request {tracking_number} for: {requester}"),
    );
    Ok(format!(
        "Records request {tracking_number} saved locally with deadline tracking."
    ))
}

fn submit_public_records_request(
    state: &mut CityWorkState,
    payload: Option<&Value>,
) -> Result<String, String> {
    let requester = payload_string(payload, "requester")?;
    let requester_contact = payload_string(payload, "requesterContact")?;
    let summary = payload_string(payload, "summary")?;
    let deadline = payload_optional_string(payload, "deadline");
    let deadline = if deadline.is_empty() {
        "Pending clerk deadline review".to_string()
    } else {
        deadline
    };
    let id = new_id("records", state.records_requests.len());
    let tracking_number = records_tracking_number(state.records_requests.len());
    state.records_requests.insert(
        0,
        RecordsRequest {
            id,
            public_tracking_number: tracking_number.clone(),
            requester: requester.clone(),
            requester_contact: requester_contact.clone(),
            submitted_via: "Resident/Public local intake".to_string(),
            summary,
            deadline,
            deadline_basis: String::new(),
            status: "public intake received".to_string(),
            assigned_to: String::new(),
            clarification_notes: Vec::new(),
            search_notes: Vec::new(),
            search_sessions: Vec::new(),
            exemption_reviews: Vec::new(),
            exemption_decisions: Vec::new(),
            fee_estimate: String::new(),
            fee_line_items: Vec::new(),
            fee_waiver_reason: String::new(),
            citations: Vec::new(),
            response_draft: String::new(),
            approval_notes: Vec::new(),
            exports: Vec::new(),
            release_packages: Vec::new(),
            timeline: Vec::new(),
            public_status_events: Vec::new(),
            messages: Vec::new(),
            documents: Vec::new(),
            deadline_reviewed_at_unix_seconds: None,
            approved_at_unix_seconds: None,
            release_revision: 0,
            exported_revision: 0,
            packaged_revision: 0,
            fulfilled_at_unix_seconds: None,
            closed_at_unix_seconds: None,
            created_at_unix_seconds: now_unix_seconds(),
        },
    );
    push_records_timeline(
        &mut state.records_requests[0],
        "public intake",
        "resident/public",
        format!("Public request {tracking_number} received for staff review."),
    );
    push_records_public_status(
        &mut state.records_requests[0],
        "Request received",
        "public intake received",
        format!(
            "Request {tracking_number} was received locally and is waiting for staff deadline review."
        ),
    );
    let request_id = state.records_requests[0].id.clone();
    push_notification_event(
        state,
        "civicrecords-ai",
        request_id.clone(),
        "records staff",
        format!("New public records request {tracking_number}"),
        format!(
            "{requester} submitted request {tracking_number}. Review the deadline, scope, assignment, and contact path in the local Records workflow."
        ),
    );
    push_notification_event(
        state,
        "civicrecords-ai",
        request_id,
        "requester",
        format!("Records request {tracking_number} received"),
        format!(
            "Request {tracking_number} was received locally. Staff will review the deadline and response path. Contact on file: {requester_contact}."
        ),
    );
    push_audit(
        state,
        "civicrecords-ai",
        "submit-public-records-request",
        format!("Received public records request {tracking_number} from: {requester}"),
    );
    Ok(format!(
        "Public records request {tracking_number} received. Staff can now review, assign, and track it locally."
    ))
}

fn set_records_deadline(
    state: &mut CityWorkState,
    payload: Option<&Value>,
) -> Result<String, String> {
    let deadline = payload_string(payload, "deadline")
        .map_err(|_| "Enter the records response deadline as YYYY-MM-DD.".to_string())?;
    let deadline_basis = payload_string(payload, "deadlineBasis")
        .map_err(|_| "Enter the statutory or policy basis for the records deadline.".to_string())?;
    parse_iso_date(&deadline, "records response deadline")?;
    let (request_id, tracking_number, requester) = {
        let request = selected_record_mut(state, payload)?;
        ensure_records_request_active(request)?;
        request.deadline = deadline.clone();
        request.deadline_basis = deadline_basis.clone();
        request.deadline_reviewed_at_unix_seconds = Some(now_unix_seconds());
        request.status = "deadline reviewed".to_string();
        push_records_timeline(
            request,
            "deadline reviewed",
            "records staff",
            format!("Response deadline set to {deadline}; basis: {deadline_basis}."),
        );
        push_records_public_status(
            request,
            "Deadline reviewed",
            "deadline reviewed",
            format!("Staff reviewed the response deadline: {deadline}. Basis: {deadline_basis}."),
        );
        (
            request.id.clone(),
            request.public_tracking_number.clone(),
            request.requester.clone(),
        )
    };
    push_notification_event(
        state,
        "civicrecords-ai",
        request_id,
        "requester",
        format!("Records request {tracking_number} deadline reviewed"),
        format!(
            "Staff reviewed the response deadline for {requester}: {deadline}. Basis: {deadline_basis}."
        ),
    );
    push_audit(
        state,
        "civicrecords-ai",
        "set-records-deadline",
        format!(
            "Records request {tracking_number} deadline set to {deadline}; basis: {deadline_basis}"
        ),
    );
    Ok("Records deadline reviewed and saved locally with basis evidence.".to_string())
}

fn calculate_records_deadline(
    state: &mut CityWorkState,
    payload: Option<&Value>,
) -> Result<String, String> {
    let received_date = payload_string(payload, "deadlineReceivedDate")
        .map_err(|_| "Enter the records request received date as YYYY-MM-DD.".to_string())?;
    let rule_name = payload_string(payload, "deadlineRuleName")
        .map_err(|_| "Enter the deadline rule name.".to_string())?;
    let day_count_text = payload_string(payload, "deadlineDayCount")
        .map_err(|_| "Enter the deadline day count.".to_string())?;
    let day_count = day_count_text
        .parse::<u32>()
        .map_err(|_| "Deadline day count must be a whole number.".to_string())?;
    let day_type = payload_string(payload, "deadlineDayType")
        .map_err(|_| "Choose business days or calendar days.".to_string())?;
    let deadline_basis = payload_string(payload, "deadlineBasis")
        .map_err(|_| "Enter the statutory or policy basis for the records deadline.".to_string())?;
    let deadline = add_records_deadline_days(&received_date, day_count, &day_type)?;
    let normalized_day_type = if day_type.to_lowercase().contains("business")
        || day_type.to_lowercase().contains("working")
    {
        "business days"
    } else {
        "calendar days"
    };
    let calculation_basis = format!(
        "{} Rule: {}; received {}; calculated as {} {} from receipt; weekends {} automatically skipped; city/state holidays must be checked by staff.",
        deadline_basis,
        rule_name,
        received_date,
        day_count,
        normalized_day_type,
        if normalized_day_type == "business days" {
            "are"
        } else {
            "are not"
        }
    );
    let (request_id, tracking_number, requester) = {
        let request = selected_record_mut(state, payload)?;
        ensure_records_request_active(request)?;
        request.deadline = deadline.clone();
        request.deadline_basis = calculation_basis.clone();
        request.deadline_reviewed_at_unix_seconds = Some(now_unix_seconds());
        request.status = "deadline calculated".to_string();
        push_records_timeline(
            request,
            "deadline calculated",
            "records staff",
            format!("{rule_name}: received {received_date}; due {deadline}. {calculation_basis}"),
        );
        push_records_public_status(
            request,
            "Deadline calculated",
            "deadline calculated",
            format!("Staff calculated the response deadline as {deadline}."),
        );
        (
            request.id.clone(),
            request.public_tracking_number.clone(),
            request.requester.clone(),
        )
    };
    push_notification_event(
        state,
        "civicrecords-ai",
        request_id,
        "requester",
        format!("Records request {tracking_number} deadline calculated"),
        format!(
            "Staff calculated the response deadline for {requester}: {deadline}. Basis: {calculation_basis}"
        ),
    );
    push_audit(
        state,
        "civicrecords-ai",
        "calculate-records-deadline",
        format!("Records request {tracking_number} deadline calculated as {deadline}: {calculation_basis}"),
    );
    Ok(format!(
        "Records deadline calculated as {deadline} and saved locally with basis evidence."
    ))
}

fn request_records_clarification(
    state: &mut CityWorkState,
    payload: Option<&Value>,
) -> Result<String, String> {
    let note = payload_string(payload, "clarificationNote")?;
    let (request_id, tracking_number) = {
        let request = selected_record_mut(state, payload)?;
        ensure_records_request_active(request)?;
        request.clarification_notes.push(note.clone());
        request.status = "clarification".to_string();
        push_records_timeline(
            request,
            "clarification requested",
            "records staff",
            note.clone(),
        );
        push_records_public_status(
            request,
            "Clarification requested",
            "clarification",
            "Staff requested clarification before completing the records review.".to_string(),
        );
        (request.id.clone(), request.public_tracking_number.clone())
    };
    push_notification_event(
        state,
        "civicrecords-ai",
        request_id,
        "requester",
        format!("Records request {tracking_number} needs clarification"),
        format!("Staff requested clarification before completing the records search: {note}"),
    );
    push_audit(
        state,
        "civicrecords-ai",
        "request-records-clarification",
        "Saved clarification note for records request.".to_string(),
    );
    Ok("Clarification note saved; no denial or release occurred.".to_string())
}

fn add_records_message(
    state: &mut CityWorkState,
    payload: Option<&Value>,
) -> Result<String, String> {
    let body = payload_string(payload, "requestMessageBody")?;
    let (request_id, tracking_number) = {
        let request = selected_record_mut(state, payload)?;
        ensure_records_request_active(request)?;
        let message = RecordsMessage {
            id: format!(
                "records-message-{}-{}",
                now_unix_seconds(),
                request.messages.len() + 1
            ),
            author: "Records staff".to_string(),
            author_role: "staff".to_string(),
            body: body.clone(),
            visibility: "requester thread".to_string(),
            created_at_unix_seconds: now_unix_seconds(),
        };
        request.messages.push(message);
        request.status = "message sent".to_string();
        push_records_timeline(request, "message sent", "records staff", body.clone());
        push_records_public_status(
            request,
            "Message added",
            "message sent",
            "Records staff added a requester-visible message to this request.".to_string(),
        );
        (request.id.clone(), request.public_tracking_number.clone())
    };
    push_notification_event(
        state,
        "civicrecords-ai",
        request_id,
        "requester",
        format!("Records request {tracking_number} message"),
        body,
    );
    push_audit(
        state,
        "civicrecords-ai",
        "add-records-message",
        format!("Added requester-visible message for records request {tracking_number}."),
    );
    Ok(
        "Requester-visible records message saved and queued in the local notification log."
            .to_string(),
    )
}

fn add_public_records_message(
    state: &mut CityWorkState,
    payload: Option<&Value>,
) -> Result<CityWorkActionResult, String> {
    let tracking_number = payload_string(payload, "trackingNumber")?;
    let requester_contact = payload_string(payload, "requesterContact")?;
    let body = payload_string(payload, "publicRequestMessage")?;
    let Some(index) = public_records_request_index(state, &tracking_number, &requester_contact)
    else {
        return Ok(CityWorkActionResult {
            accepted: false,
            action: "add-public-records-message".to_string(),
            status: "No match",
            message: "No local request matched that request number and submitted contact."
                .to_string(),
            next_action:
                "Check the request number and contact before sending a message to records staff."
                    .to_string(),
            state: city_work_public_projection(state),
            search_results: Vec::new(),
            next_steps: Vec::new(),
            disclaimer: String::new(),
        });
    };
    let (request_id, requester) = {
        let request = &mut state.records_requests[index];
        ensure_records_request_active(request)?;
        let message = RecordsMessage {
            id: format!(
                "records-message-{}-{}",
                now_unix_seconds(),
                request.messages.len() + 1
            ),
            author: request.requester.clone(),
            author_role: "requester".to_string(),
            body: body.clone(),
            visibility: "requester thread".to_string(),
            created_at_unix_seconds: now_unix_seconds(),
        };
        request.messages.push(message);
        request.status = "requester message received".to_string();
        invalidate_records_release(request)?;
        push_records_timeline(
            request,
            "requester message received",
            "resident/public",
            body.clone(),
        );
        push_records_public_status(
            request,
            "Requester message received",
            "requester message received",
            "A requester message was added to the local request thread.".to_string(),
        );
        (request.id.clone(), request.requester.clone())
    };
    push_notification_event(
        state,
        "civicrecords-ai",
        request_id,
        "records staff",
        format!("Records request {tracking_number} requester message"),
        format!("{requester} sent a message on request {tracking_number}: {body}"),
    );
    push_audit(
        state,
        "civicrecords-ai",
        "add-public-records-message",
        format!("Received requester message for records request {tracking_number}."),
    );
    write_state(state)?;
    let mut public_state = city_work_public_projection(state);
    let projected_request =
        public_records_request_lookup_projection(&state.records_requests[index]);
    if !public_state
        .records_requests
        .iter()
        .any(|public_request| public_request.id == projected_request.id)
    {
        public_state.records_requests.insert(0, projected_request);
    }
    Ok(CityWorkActionResult {
        accepted: true,
        action: "add-public-records-message".to_string(),
        status: "Message saved",
        message: format!("Message added to request {tracking_number} for records staff."),
        next_action: "Staff can review the message in the local Records workflow.".to_string(),
        state: public_state,
        search_results: Vec::new(),
        next_steps: Vec::new(),
        disclaimer: String::new(),
    })
}

fn assign_records_request(
    state: &mut CityWorkState,
    payload: Option<&Value>,
) -> Result<String, String> {
    let assigned_to = payload_string(payload, "assignedTo")?;
    let request = selected_record_mut(state, payload)?;
    ensure_records_request_active(request)?;
    request.assigned_to = assigned_to.clone();
    request.status = "assigned".to_string();
    push_records_timeline(
        request,
        "assigned",
        "records staff",
        format!("Assigned to {assigned_to}."),
    );
    push_records_public_status(
        request,
        "Staff review assigned",
        "assigned",
        "The request was assigned for staff review.".to_string(),
    );
    push_audit(
        state,
        "civicrecords-ai",
        "assign-records-request",
        format!("Assigned records request to: {assigned_to}"),
    );
    Ok("Records request assigned for staff search and review.".to_string())
}

fn record_records_search(
    state: &mut CityWorkState,
    payload: Option<&Value>,
) -> Result<String, String> {
    let source_note = payload_string(payload, "sourceNote")?;
    let citation = payload_optional_string(payload, "citation");
    let request = selected_record_mut(state, payload)?;
    ensure_records_request_active(request)?;
    request.search_notes.push(source_note.clone());
    if !citation.is_empty() {
        request.citations.push(citation.clone());
    }
    request.status = "searching".to_string();
    push_records_timeline(
        request,
        "search recorded",
        "records staff",
        format!(
            "{}{}",
            source_note,
            if citation.is_empty() {
                String::new()
            } else {
                format!(" Citation: {citation}.")
            }
        ),
    );
    push_records_public_status(
        request,
        "Records search in progress",
        "searching",
        "Staff recorded progress on the records search.".to_string(),
    );
    push_audit(
        state,
        "civicrecords-ai",
        "record-records-search",
        "Recorded records search source note.".to_string(),
    );
    Ok("Search source note saved with citation evidence.".to_string())
}

fn record_records_search_session(
    state: &mut CityWorkState,
    payload: Option<&Value>,
) -> Result<String, String> {
    let query = payload_string(payload, "searchQuery")
        .map_err(|_| "Enter the records search query or scope.".to_string())?;
    let locations = payload_string(payload, "searchLocations")
        .map_err(|_| "Enter the systems, folders, or source locations searched.".to_string())?;
    let result_title = payload_string(payload, "searchResultTitle")
        .map_err(|_| "Enter a title for at least one search result.".to_string())?;
    let result_citation = payload_string(payload, "searchResultCitation").map_err(|_| {
        "Enter the citation, file id, or source reference for this result.".to_string()
    })?;
    let result_summary = payload_string(payload, "searchResultSummary")
        .map_err(|_| "Enter a short summary of the search result.".to_string())?;
    let result_status = payload_optional_string(payload, "searchResultStatus");
    let reviewer = payload_optional_string(payload, "searchReviewer");
    let request = selected_record_mut(state, payload)?;
    ensure_records_request_active(request)?;
    let result = RecordsSearchResult {
        id: format!("records-search-result-{}", now_unix_seconds()),
        title: result_title.clone(),
        citation: result_citation.clone(),
        summary: result_summary.clone(),
        status: if result_status.is_empty() {
            "responsive".to_string()
        } else {
            result_status
        },
    };
    let session = RecordsSearchSession {
        id: format!(
            "records-search-session-{}-{}",
            now_unix_seconds(),
            request.search_sessions.len() + 1
        ),
        query: query.clone(),
        locations: locations.clone(),
        reviewer: if reviewer.is_empty() {
            "records staff".to_string()
        } else {
            reviewer
        },
        results: vec![result],
        created_at_unix_seconds: now_unix_seconds(),
    };
    request.search_sessions.push(session);
    if !request
        .citations
        .iter()
        .any(|citation| citation == &result_citation)
    {
        request.citations.push(result_citation.clone());
    }
    request.status = "search session recorded".to_string();
    push_records_timeline(
        request,
        "search session recorded",
        "records staff",
        format!("{query} across {locations}; result {result_title}."),
    );
    push_records_public_status(
        request,
        "Records search updated",
        "search session recorded",
        "Staff saved structured search progress for this request.".to_string(),
    );
    push_audit(
        state,
        "civicrecords-ai",
        "record-records-search-session",
        format!("Recorded records search session {query} with result {result_citation}."),
    );
    Ok("Records search session saved with source-result evidence.".to_string())
}

fn add_records_document(
    state: &mut CityWorkState,
    payload: Option<&Value>,
) -> Result<String, String> {
    let title = payload_string(payload, "documentTitle")?;
    let source_path = payload_string(payload, "documentSourcePath")?;
    let citation = payload_optional_string(payload, "documentCitation");
    let (stored_path, sha256, size_bytes) = {
        let request = selected_record_mut(state, payload)?;
        ensure_records_request_active(request)?;
        let tracking_or_id = if request.public_tracking_number.is_empty() {
            request.id.clone()
        } else {
            request.public_tracking_number.clone()
        };
        let documents_dir = local_paths::data_root()
            .join("files")
            .join("records")
            .join(safe_file_stem(&tracking_or_id));
        let (original_path, stored_path, source_file_name, sha256, size_bytes) =
            preserve_file_reference(
                &source_path,
                &documents_dir,
                &title,
                "records-document",
                "records document",
                &citation,
            )?;
        let document = RecordsDocument {
            id: format!(
                "records-document-{}-{}",
                now_unix_seconds(),
                request.documents.len() + 1
            ),
            title: title.clone(),
            original_path: original_path.clone(),
            stored_path: stored_path.clone(),
            citation: citation.clone(),
            sha256: sha256.clone(),
            size_bytes,
            release_original_path: String::new(),
            release_stored_path: String::new(),
            release_file_name: String::new(),
            release_sha256: String::new(),
            release_size_bytes: 0,
            release_status: String::new(),
            release_note: String::new(),
            release_added_by: String::new(),
            release_added_at_unix_seconds: None,
            status: "attached for response review".to_string(),
            added_by: "records staff".to_string(),
            created_at_unix_seconds: now_unix_seconds(),
        };
        request.documents.push(document);
        if !citation.is_empty() {
            request.citations.push(citation.clone());
        }
        request.status = "document attached".to_string();
        push_records_timeline(
            request,
            "document attached",
            "records staff",
            format!("Attached {title} from {source_file_name}; sha256 {sha256}."),
        );
        push_records_public_status(
            request,
            "Responsive records under review",
            "document attached",
            "Potentially responsive records were added for staff review.".to_string(),
        );
        (stored_path, sha256, size_bytes)
    };
    push_audit(
        state,
        "civicrecords-ai",
        "add-records-document",
        format!("Attached records document {title}; sha256 {sha256}; {size_bytes} bytes."),
    );
    Ok(format!(
        "Records document evidence saved into local profile: {stored_path}."
    ))
}

fn add_records_release_copy(
    state: &mut CityWorkState,
    payload: Option<&Value>,
) -> Result<String, String> {
    let release_path = payload_string(payload, "releaseCopyPath")?;
    let release_status = payload_string(payload, "releaseCopyStatus")?;
    if release_status != "release-ready copy" && release_status != "redacted copy" {
        return Err("Release copy status must be release-ready copy or redacted copy.".to_string());
    }
    let release_note = payload_optional_string(payload, "releaseCopyNote");
    let release_added_by = payload_optional_string(payload, "releaseCopyAddedBy");
    let document_id = payload_optional_string(payload, "releaseDocumentId");
    let (document_title, stored_path, sha256, size_bytes, added_by, release_note_for_audit) = {
        let request = selected_record_mut(state, payload)?;
        ensure_records_request_active(request)?;
        if request.documents.is_empty() {
            return Err(
                "Attach an original request document before adding a release copy.".to_string(),
            );
        }
        let document_index = if document_id.is_empty() {
            0
        } else {
            request
                .documents
                .iter()
                .position(|document| document.id == document_id)
                .ok_or_else(|| {
                    "The selected records document was not found in the local request.".to_string()
                })?
        };
        let tracking_or_id = if request.public_tracking_number.is_empty() {
            request.id.clone()
        } else {
            request.public_tracking_number.clone()
        };
        let document_title = request.documents[document_index].title.clone();
        let release_dir = local_paths::data_root()
            .join("files")
            .join("records")
            .join(safe_file_stem(&tracking_or_id))
            .join("release");
        let (original_path, stored_path, release_file_name, sha256, size_bytes) =
            preserve_file_reference(
                &release_path,
                &release_dir,
                &document_title,
                "records-release-copy",
                "records release copy",
                &release_note,
            )?;
        let added_by = if release_added_by.is_empty() {
            "records staff".to_string()
        } else {
            release_added_by.clone()
        };
        let document = &mut request.documents[document_index];
        document.release_original_path = original_path.clone();
        document.release_stored_path = stored_path.clone();
        document.release_file_name = release_file_name.clone();
        document.release_sha256 = sha256.clone();
        document.release_size_bytes = size_bytes;
        document.release_status = release_status.clone();
        document.release_note = release_note.clone();
        document.release_added_by = added_by.clone();
        document.release_added_at_unix_seconds = Some(now_unix_seconds());
        document.status = format!("{release_status} attached");
        request.status = "release copy attached".to_string();
        push_records_timeline(
            request,
            "release copy attached",
            "records staff",
            format!(
                "{} attached for {}; sha256 {}. {}",
                release_status,
                document_title,
                sha256,
                if release_note.is_empty() {
                    "No release note recorded.".to_string()
                } else {
                    release_note.clone()
                }
            ),
        );
        push_records_public_status(
            request,
            "Release copy prepared",
            "release copy attached",
            "A release-ready or redacted copy was prepared for this request.".to_string(),
        );
        (
            document_title,
            stored_path,
            sha256,
            size_bytes,
            added_by,
            release_note,
        )
    };
    push_audit(
        state,
        "civicrecords-ai",
        "add-records-release-copy",
        format!(
            "Attached {release_status} for {document_title}; sha256 {sha256}; {size_bytes} bytes; by {added_by}. {release_note_for_audit}"
        ),
    );
    Ok(format!(
        "Records {release_status} evidence saved into local profile: {stored_path}."
    ))
}

fn add_records_exemption_review(
    state: &mut CityWorkState,
    payload: Option<&Value>,
) -> Result<String, String> {
    let exemption_note = payload_string(payload, "exemptionNote")?;
    let request = selected_record_mut(state, payload)?;
    ensure_records_request_active(request)?;
    request.exemption_reviews.push(exemption_note.clone());
    request.status = "in review".to_string();
    push_records_timeline(
        request,
        "exemption review recorded",
        "records staff",
        exemption_note,
    );
    push_records_public_status(
        request,
        "Review in progress",
        "in review",
        "Staff recorded review progress before final response approval.".to_string(),
    );
    push_audit(
        state,
        "civicrecords-ai",
        "add-records-exemption-review",
        "Recorded human exemption review note.".to_string(),
    );
    Ok("Exemption review note saved for human approval.".to_string())
}

fn add_records_exemption_decision(
    state: &mut CityWorkState,
    payload: Option<&Value>,
) -> Result<String, String> {
    let source = payload_string(payload, "exemptionSource").map_err(|_| {
        "Enter the source record, page, file, timestamp, or segment being reviewed.".to_string()
    })?;
    let kind = payload_string(payload, "exemptionKind")
        .map_err(|_| "Enter the exemption category or flag type.".to_string())?;
    let finding = payload_string(payload, "exemptionFinding")
        .map_err(|_| "Enter the staff finding for this source segment.".to_string())?;
    let decision = payload_string(payload, "exemptionDecision")
        .map_err(|_| "Choose release, redact, or exempt for this source segment.".to_string())?
        .to_lowercase();
    if !matches!(decision.as_str(), "release" | "redact" | "exempt") {
        return Err("Exemption decision must be release, redact, or exempt.".to_string());
    }
    let basis = payload_string(payload, "exemptionBasis").map_err(|_| {
        "Enter the statute, ordinance, or city policy basis for the decision.".to_string()
    })?;
    let reviewer = payload_optional_string(payload, "exemptionReviewer");
    let request = selected_record_mut(state, payload)?;
    ensure_records_request_active(request)?;
    let decision_record = RecordsExemptionDecision {
        id: format!(
            "records-exemption-decision-{}-{}",
            now_unix_seconds(),
            request.exemption_decisions.len() + 1
        ),
        source: source.clone(),
        kind: kind.clone(),
        finding: finding.clone(),
        decision: decision.clone(),
        basis: basis.clone(),
        reviewer: if reviewer.is_empty() {
            "records staff".to_string()
        } else {
            reviewer
        },
        created_at_unix_seconds: now_unix_seconds(),
    };
    request.exemption_decisions.push(decision_record);
    if !request.citations.iter().any(|citation| citation == &basis) {
        request.citations.push(basis.clone());
    }
    request.status = "exemption decision recorded".to_string();
    push_records_timeline(
        request,
        "exemption decision recorded",
        "records staff",
        format!("{decision} decision for {source}: {finding} under {basis}."),
    );
    push_records_public_status(
        request,
        "Release review updated",
        "exemption decision recorded",
        "Staff recorded release, redaction, or exemption review progress.".to_string(),
    );
    push_audit(
        state,
        "civicrecords-ai",
        "add-records-exemption-decision",
        format!("Recorded {decision} exemption decision for {source} under {basis}."),
    );
    Ok("Structured exemption decision saved with source evidence.".to_string())
}

fn estimate_records_fee(
    state: &mut CityWorkState,
    payload: Option<&Value>,
) -> Result<String, String> {
    let fee_estimate = payload_string(payload, "feeEstimate")?;
    let request = selected_record_mut(state, payload)?;
    ensure_records_request_active(request)?;
    request.fee_estimate = fee_estimate.clone();
    request.status = "ready".to_string();
    push_records_timeline(
        request,
        "fee estimate saved",
        "records staff",
        fee_estimate.clone(),
    );
    push_records_public_status(
        request,
        "Fee review updated",
        "ready",
        "Staff updated the request fee review.".to_string(),
    );
    push_audit(
        state,
        "civicrecords-ai",
        "estimate-records-fee",
        format!("Saved records fee estimate: {fee_estimate}"),
    );
    Ok("Fee estimate saved before approval or fulfillment.".to_string())
}

fn add_records_fee_line(
    state: &mut CityWorkState,
    payload: Option<&Value>,
) -> Result<String, String> {
    let description = payload_string(payload, "feeLineDescription")?;
    let schedule_basis = payload_string(payload, "feeScheduleBasis")
        .map_err(|_| "Enter the fee schedule or policy basis for this line item.".to_string())?;
    let amount = payload_string(payload, "feeLineAmount")
        .map_err(|_| "Enter the fee line amount.".to_string())?;
    let amount_cents = parse_money_cents(&amount)?;
    if amount_cents <= 0 {
        return Err("Fee line amount must be greater than zero.".to_string());
    }
    let request = selected_record_mut(state, payload)?;
    ensure_records_request_active(request)?;
    let item = RecordsFeeLineItem {
        id: format!(
            "records-fee-line-{}-{}",
            now_unix_seconds(),
            request.fee_line_items.len() + 1
        ),
        description: description.clone(),
        schedule_basis: schedule_basis.clone(),
        amount_cents,
        created_at_unix_seconds: now_unix_seconds(),
    };
    request.fee_line_items.push(item);
    let total = records_fee_total_cents(&request.fee_line_items);
    request.fee_estimate = if request.fee_waiver_reason.is_empty() {
        format!(
            "{} estimated from {} fee line item(s).",
            format_money_cents(total),
            request.fee_line_items.len()
        )
    } else {
        format!("$0.00 waived: {}", request.fee_waiver_reason)
    };
    request.status = "fee review".to_string();
    push_records_timeline(
        request,
        "fee line added",
        "records staff",
        format!(
            "{}: {} under {}",
            description,
            format_money_cents(amount_cents),
            schedule_basis
        ),
    );
    push_records_public_status(
        request,
        "Fee review updated",
        "fee review",
        "Staff updated the request fee review.".to_string(),
    );
    push_audit(
        state,
        "civicrecords-ai",
        "add-records-fee-line",
        format!(
            "Added records fee line: {} {} under {}",
            description,
            format_money_cents(amount_cents),
            schedule_basis
        ),
    );
    Ok("Records fee line item saved with local evidence.".to_string())
}

fn waive_records_fee(state: &mut CityWorkState, payload: Option<&Value>) -> Result<String, String> {
    let reason = payload_string(payload, "feeWaiverReason")?;
    let request = selected_record_mut(state, payload)?;
    ensure_records_request_active(request)?;
    request.fee_waiver_reason = reason.clone();
    request.fee_estimate = format!("$0.00 waived: {reason}");
    request.status = "fee waived".to_string();
    push_records_timeline(request, "fee waived", "records staff", reason.clone());
    push_records_public_status(
        request,
        "Fee waived",
        "fee waived",
        "Staff marked the records fee as waived.".to_string(),
    );
    push_audit(
        state,
        "civicrecords-ai",
        "waive-records-fee",
        format!("Recorded records fee waiver: {reason}"),
    );
    Ok("Records fee waiver saved with local evidence.".to_string())
}

fn draft_records_response(
    state: &mut CityWorkState,
    payload: Option<&Value>,
) -> Result<String, String> {
    let draft = payload_string(payload, "responseDraft")?;
    let citation = payload_optional_string(payload, "citation");
    let request = selected_record_mut(state, payload)?;
    ensure_records_request_active(request)?;
    request.response_draft = draft;
    request.status = "drafted".to_string();
    if !citation.is_empty() {
        request.citations.push(citation.clone());
    }
    push_records_timeline(
        request,
        "response drafted",
        "records staff",
        if citation.is_empty() {
            "Draft response saved.".to_string()
        } else {
            format!("Draft response saved with citation {citation}.")
        },
    );
    push_records_public_status(
        request,
        "Response drafting",
        "drafted",
        "Staff saved a response draft for review.".to_string(),
    );
    push_audit(
        state,
        "civicrecords-ai",
        "draft-records-response",
        "Drafted records response with local citation evidence.".to_string(),
    );
    Ok("Records response draft saved with citation evidence.".to_string())
}

fn suggest_records_response(
    state: &mut CityWorkState,
    payload: Option<&Value>,
) -> Result<String, String> {
    let request = selected_record_mut(state, payload)?;
    ensure_records_request_active(request)?;
    if request.search_notes.is_empty() && request.citations.is_empty() {
        return Err(
            "Record at least one search note or citation before generating a local AI records draft."
                .to_string(),
        );
    }
    let prompt = format!(
        "Draft an internal public records response for staff review. Use only the facts below. Do not claim legal authority beyond the cited notes. Keep the response concise and leave placeholders for attachments if needed.\n\nRequester: {}\nDeadline: {}\nRequest summary: {}\nRequest messages: {}\nAttached documents: {}\nClarification notes: {}\nSearch notes: {}\nSearch sessions: {}\nExemption review notes: {}\nExemption decisions: {}\nFee estimate: {}\nCitations/source notes: {}\n",
        request.requester,
        request.deadline,
        request.summary,
        records_messages_or_default(&request.messages),
        records_documents_or_default(&request.documents),
        list_or_default(&request.clarification_notes, "No clarification notes recorded."),
        list_or_default(&request.search_notes, "No search notes recorded."),
        records_search_sessions_or_default(&request.search_sessions),
        list_or_default(&request.exemption_reviews, "No exemption review notes recorded."),
        records_exemption_decisions_or_default(&request.exemption_decisions),
        if request.fee_estimate.is_empty() {
            "No fee estimate recorded."
        } else {
            &request.fee_estimate
        },
        list_or_default(&request.citations, "No citations recorded.")
    );
    let (runtime_model, generated) = crate::model::generate_local_text(&prompt)?;
    request.response_draft = generated;
    request.status = "local AI draft ready for review".to_string();
    push_records_timeline(
        request,
        "local AI draft generated",
        "local model",
        format!("Draft generated with {runtime_model}; human approval still required."),
    );
    push_records_public_status(
        request,
        "Response drafting",
        "local AI draft ready for review",
        "A response draft is ready for human staff review.".to_string(),
    );
    push_audit(
        state,
        "civicrecords-ai",
        "suggest-records-response",
        format!("Generated local AI records response draft with {runtime_model}; human approval still required."),
    );
    Ok(
        "Local AI records draft generated. Review, edit, and approve with citations before export."
            .to_string(),
    )
}

fn approve_records_response(
    state: &mut CityWorkState,
    payload: Option<&Value>,
) -> Result<String, String> {
    let approval_note = payload_optional_string(payload, "approvalNote");
    let request = selected_record_mut(state, payload)?;
    ensure_records_request_active(request)?;
    if request.response_draft.trim().is_empty() {
        return Err("Draft a records response before approval.".to_string());
    }
    if request.citations.is_empty() {
        return Err("Add at least one citation or source note before approval.".to_string());
    }
    if !approval_note.is_empty() {
        request.approval_notes.push(approval_note.clone());
    }
    request.approved_at_unix_seconds = Some(now_unix_seconds());
    request.status = "approved".to_string();
    push_records_timeline(
        request,
        "response approved",
        "records staff",
        if approval_note.is_empty() {
            "Response approved by a human reviewer.".to_string()
        } else {
            approval_note
        },
    );
    push_records_public_status(
        request,
        "Response approved",
        "approved",
        "A human reviewer approved the response for export.".to_string(),
    );
    push_audit(
        state,
        "civicrecords-ai",
        "approve-records-response",
        "Approved records response for export by a human reviewer.".to_string(),
    );
    Ok("Records response approved by staff; export is now available.".to_string())
}

fn build_records_release_package(
    state: &mut CityWorkState,
    payload: Option<&Value>,
) -> Result<String, String> {
    let demo_banner = demo_fixture_export_banner(state);
    let request = selected_record_mut(state, payload)?;
    ensure_records_request_active(request)?;
    if request.documents.is_empty() && request.search_sessions.is_empty() {
        return Err(
            "Attach request documents or save a structured search session before building a release package."
                .to_string(),
        );
    }
    if request.exemption_decisions.is_empty() {
        return Err(
            "Save release, redact, or exempt decisions before building a release package."
                .to_string(),
        );
    }
    let release_count = request
        .exemption_decisions
        .iter()
        .filter(|decision| decision.decision == "release")
        .count();
    let redacted_count = request
        .exemption_decisions
        .iter()
        .filter(|decision| decision.decision == "redact")
        .count();
    let exempt_count = request
        .exemption_decisions
        .iter()
        .filter(|decision| decision.decision == "exempt")
        .count();
    let release_artifact_count = request
        .documents
        .iter()
        .filter(|document| !document.release_sha256.is_empty())
        .count();
    if !request.documents.is_empty() && (release_count > 0 || redacted_count > 0) {
        if release_artifact_count == 0 {
            return Err(
                "Attach at least one release-ready or redacted copy before building this release package."
                    .to_string(),
            );
        }
        if redacted_count > 0
            && !request
                .documents
                .iter()
                .any(|document| document.release_status == "redacted copy")
        {
            return Err("Attach a redacted copy before packaging redaction decisions.".to_string());
        }
        if release_count > 0
            && !request
                .documents
                .iter()
                .any(|document| document.release_status == "release-ready copy")
        {
            return Err(
                "Attach a release-ready copy before packaging release decisions.".to_string(),
            );
        }
    }
    let contents = format!(
        "# Records Release Package Manifest\n\n{}Tracking number: {}\nRequester: {}\nRequest: {}\nStatus before package: {}\n\n## Package Counts\nDocuments: {}\nRelease artifacts: {}\nSearch sessions: {}\nRelease decisions: {}\nRedact decisions: {}\nExempt decisions: {}\n\n## Search Sessions\n{}\n\n## Request Documents\n{}\n\n## Exemption Decisions\n{}\n\n## Response Draft Snapshot\n{}\n",
        demo_banner,
        if request.public_tracking_number.is_empty() {
            "Not assigned"
        } else {
            &request.public_tracking_number
        },
        request.requester,
        request.summary,
        request.status,
        request.documents.len(),
        release_artifact_count,
        request.search_sessions.len(),
        release_count,
        redacted_count,
        exempt_count,
        records_search_sessions_or_default(&request.search_sessions),
        records_documents_or_default(&request.documents),
        records_exemption_decisions_or_default(&request.exemption_decisions),
        if request.response_draft.is_empty() {
            "No response draft saved at package build time."
        } else {
            &request.response_draft
        }
    );
    let package_hash = hash_public_payload(&contents);
    let export_path = write_export_file(
        "records",
        &format!("{} release package", request.requester),
        &contents,
    )?;
    let package = RecordsReleasePackage {
        id: format!(
            "records-release-package-{}-{}",
            now_unix_seconds(),
            request.release_packages.len() + 1
        ),
        export_path: export_path.clone(),
        package_hash: package_hash.clone(),
        document_count: request.documents.len(),
        release_artifact_count,
        search_session_count: request.search_sessions.len(),
        release_count,
        redacted_count,
        exempt_count,
        created_at_unix_seconds: now_unix_seconds(),
    };
    request.release_packages.push(package);
    request.packaged_revision = request.release_revision;
    request.status = "release package built".to_string();
    push_records_timeline(
        request,
        "release package built",
        "records staff",
        format!("Release package manifest written to {export_path}; sha256 {package_hash}."),
    );
    push_records_public_status(
        request,
        "Release package prepared",
        "release package built",
        "Staff prepared the release package for fulfillment.".to_string(),
    );
    push_audit(
        state,
        "civicrecords-ai",
        "build-records-release-package",
        format!("Built records release package {export_path}; sha256 {package_hash}."),
    );
    Ok(format!(
        "Records release package manifest written to {export_path}."
    ))
}

fn export_records_response(
    state: &mut CityWorkState,
    payload: Option<&Value>,
) -> Result<String, String> {
    let demo_banner = demo_fixture_export_banner(state);
    let request = selected_record_mut(state, payload)?;
    ensure_records_request_active(request)?;
    if request.response_draft.trim().is_empty() {
        return Err("Draft a records response before exporting.".to_string());
    }
    if request.approved_at_unix_seconds.is_none() {
        return Err(
            "Approve the records response before exporting the response package.".to_string(),
        );
    }
    let citations = list_or_default(&request.citations, "No citations recorded.");
    let search_notes = list_or_default(&request.search_notes, "No search notes recorded.");
    let search_sessions = records_search_sessions_or_default(&request.search_sessions);
    let exemption_reviews = list_or_default(
        &request.exemption_reviews,
        "No exemption review notes recorded.",
    );
    let exemption_decisions = records_exemption_decisions_or_default(&request.exemption_decisions);
    let clarification_notes = list_or_default(
        &request.clarification_notes,
        "No clarification notes recorded.",
    );
    let approval_notes = list_or_default(&request.approval_notes, "No approval note recorded.");
    let request_timeline = records_timeline_or_default(&request.timeline);
    let request_messages = records_messages_or_default(&request.messages);
    let request_documents = records_documents_or_default(&request.documents);
    let release_packages = records_release_packages_or_default(&request.release_packages);
    let fee_lines = records_fee_lines_or_default(&request.fee_line_items);
    let fee_total = format_money_cents(records_fee_total_cents(&request.fee_line_items));
    let contents = format!(
        "# Records Response\n\n{}Tracking number: {}\nRequester: {}\nContact: {}\nSubmitted via: {}\nDeadline: {}\nDeadline basis: {}\nAssigned to: {}\nStatus: {}\nFee estimate: {}\n\n## Request\n{}\n\n## Request Timeline\n{}\n\n## Request Messages\n{}\n\n## Request Documents\n{}\n\n## Release Packages\n{}\n\n## Fee Review\nFee total: {}\nFee waiver: {}\n\n{}\n\n## Clarification Notes\n{}\n\n## Search Notes\n{}\n\n## Search Sessions\n{}\n\n## Exemption Review Notes\n{}\n\n## Exemption Decisions\n{}\n\n## Approved Response\n{}\n\n## Citations\n{}\n\n## Approval Notes\n{}\n",
        demo_banner,
        if request.public_tracking_number.is_empty() {
            "Not assigned"
        } else {
            &request.public_tracking_number
        },
        request.requester,
        if request.requester_contact.is_empty() {
            "No contact recorded."
        } else {
            &request.requester_contact
        },
        if request.submitted_via.is_empty() {
            "Staff intake"
        } else {
            &request.submitted_via
        },
        request.deadline,
        if request.deadline_basis.is_empty() {
            "No deadline basis recorded."
        } else {
            &request.deadline_basis
        },
        if request.assigned_to.is_empty() {
            "Unassigned"
        } else {
            &request.assigned_to
        },
        request.status,
        if request.fee_estimate.is_empty() {
            "No fee estimate recorded."
        } else {
            &request.fee_estimate
        },
        request.summary,
        request_timeline,
        request_messages,
        request_documents,
        release_packages,
        fee_total,
        if request.fee_waiver_reason.is_empty() {
            "No fee waiver recorded."
        } else {
            &request.fee_waiver_reason
        },
        fee_lines,
        clarification_notes,
        search_notes,
        search_sessions,
        exemption_reviews,
        exemption_decisions,
        request.response_draft,
        citations,
        approval_notes
    );
    let export_path = write_export_file("records", &request.requester, &contents)?;
    request.exports.push(export_path.clone());
    request.exported_revision = request.release_revision;
    request.status = "response package exported".to_string();
    push_records_timeline(
        request,
        "response package exported",
        "records staff",
        format!("Approved response package exported to {export_path}."),
    );
    push_records_public_status(
        request,
        "Response package exported",
        "response package exported",
        "The approved response package was exported for release.".to_string(),
    );
    push_audit(
        state,
        "civicrecords-ai",
        "export-records-response",
        format!("Exported records response package: {export_path}"),
    );
    Ok(format!("Records response export written to {export_path}."))
}

fn open_exports_folder(payload: Option<&Value>) -> Result<String, String> {
    let folder = payload_optional_string(payload, "folder");
    let (path, label) = match folder.as_str() {
        "" | "all" => (exports_dir(), "all exports"),
        "meetings" => (exports_dir().join("meetings"), "meeting exports"),
        "records" => (exports_dir().join("records"), "records exports"),
        "code" => (exports_dir().join("code"), "code exports"),
        _ => {
            return Err(
                "Choose a valid export folder: all, meetings, records, or code.".to_string(),
            )
        }
    };
    crate::local_shell::open_local_folder(&path)?;
    Ok(format!(
        "Opened the local {label} folder: {}",
        path.to_string_lossy()
    ))
}

fn fulfill_records_request(
    state: &mut CityWorkState,
    payload: Option<&Value>,
) -> Result<String, String> {
    let (request_id, tracking_number, requester, deadline, exports, public_payload) = {
        let request = selected_record_mut(state, payload)?;
        ensure_records_request_active(request)?;
        if request.approved_at_unix_seconds.is_none() {
            return Err("Approve the records response before fulfillment.".to_string());
        }
        if request.exports.is_empty() {
            return Err(
                "Export the approved records response package before fulfillment.".to_string(),
            );
        }
        if request.release_packages.is_empty() {
            return Err("Build the records release package before fulfillment.".to_string());
        }
        if request.exported_revision != request.release_revision {
            return Err(
                "Export the newly approved response revision before fulfillment.".to_string(),
            );
        }
        if request.packaged_revision != request.release_revision {
            return Err(
                "Rebuild the release package for the current response revision before fulfillment."
                    .to_string(),
            );
        }
        request.fulfilled_at_unix_seconds = Some(now_unix_seconds());
        request.status = "fulfilled".to_string();
        push_records_timeline(
            request,
            "fulfilled",
            "records staff",
            "Approved response package marked fulfilled.".to_string(),
        );
        push_records_public_status(
            request,
            "Response ready",
            "fulfilled",
            "The approved records response has been marked fulfilled.".to_string(),
        );
        (
            request.id.clone(),
            request.public_tracking_number.clone(),
            request.requester.clone(),
            request.deadline.clone(),
            request.exports.join("; "),
            format!(
                "Records request {} fulfilled for {}. Deadline: {}. Exports: {}.",
                if request.public_tracking_number.is_empty() {
                    "without tracking number"
                } else {
                    &request.public_tracking_number
                },
                request.requester,
                request.deadline,
                request.exports.join("; ")
            ),
        )
    };
    push_publication_event(
        state,
        "civicrecords-ai",
        request_id.clone(),
        "records-response",
        public_payload,
    );
    push_notification_event(
        state,
        "civicrecords-ai",
        request_id,
        "requester",
        format!("Records request {tracking_number} response ready"),
        format!(
            "The approved response for {requester} has been marked fulfilled. Deadline: {deadline}. Export package: {exports}."
        ),
    );
    push_audit(
        state,
        "civicrecords-ai",
        "fulfill-records-request",
        "Marked records request fulfilled after human approval and export.".to_string(),
    );
    Ok("Records request fulfilled and eligible for public status display.".to_string())
}

fn close_records_request(
    state: &mut CityWorkState,
    payload: Option<&Value>,
) -> Result<String, String> {
    let (request_id, tracking_number) = {
        let request = selected_record_mut(state, payload)?;
        if request.closed_at_unix_seconds.is_some() || request.status == "closed" {
            return Err("This records request is already closed.".to_string());
        }
        if request.fulfilled_at_unix_seconds.is_none() {
            return Err("Fulfill the records request before closing it.".to_string());
        }
        request.closed_at_unix_seconds = Some(now_unix_seconds());
        request.status = "closed".to_string();
        push_records_timeline(
            request,
            "closed",
            "records staff",
            "Fulfilled request closed with audit, export, and notification evidence preserved."
                .to_string(),
        );
        push_records_public_status(
            request,
            "Request closed",
            "closed",
            "The fulfilled records request was closed locally.".to_string(),
        );
        (request.id.clone(), request.public_tracking_number.clone())
    };
    push_notification_event(
        state,
        "civicrecords-ai",
        request_id,
        "records staff",
        format!("Records request {tracking_number} closed"),
        "The fulfilled records request is closed. Audit, export, publication, and notification evidence remain in the local profile.".to_string(),
    );
    push_audit(
        state,
        "civicrecords-ai",
        "close-records-request",
        "Closed fulfilled records request.".to_string(),
    );
    Ok("Records request closed with audit evidence preserved.".to_string())
}

fn mark_notification_sent(
    state: &mut CityWorkState,
    payload: Option<&Value>,
) -> Result<String, String> {
    let (module_id, subject) = {
        let notification = selected_notification_mut(state, payload)?;
        if notification.status == "sent / logged" || notification.sent_at_unix_seconds.is_some() {
            return Err("This local notification is already marked sent.".to_string());
        }
        notification.status = "sent / logged".to_string();
        notification.sent_at_unix_seconds = Some(now_unix_seconds());
        (notification.module_id.clone(), notification.subject.clone())
    };
    push_audit(
        state,
        &module_id,
        "mark-notification-sent",
        format!("Marked local notification sent: {subject}"),
    );
    Ok("Notification marked sent in the local notification outbox.".to_string())
}

fn append_code_version_history(
    source: &mut CodeSource,
    status: &str,
    label: String,
    source_name: String,
    authoritative_url: String,
    note: String,
) {
    let id = new_id("code-version", source.version_history.len());
    source.version_history.push(CodeVersionEntry {
        id,
        label,
        source: source_name,
        authoritative_url,
        note,
        status: status.to_string(),
        recorded_at_unix_seconds: now_unix_seconds(),
    });
}

fn import_code_source(
    state: &mut CityWorkState,
    payload: Option<&Value>,
) -> Result<String, String> {
    let title = payload_string(payload, "title")?;
    let citation = payload_string(payload, "citation")?;
    let body = payload_string(payload, "body")?;
    let source_path = payload_optional_string(payload, "codeSourcePath");
    let imported_by = payload_optional_string(payload, "importedBy");
    let id = new_id("code", state.code_sources.len());
    let (
        source_original_path,
        source_stored_path,
        source_file_name,
        source_sha256,
        source_size_bytes,
    ) = if source_path.is_empty() {
        (
            String::new(),
            String::new(),
            String::new(),
            String::new(),
            0,
        )
    } else {
        let code_dir = local_paths::data_root()
            .join("files")
            .join("code")
            .join(safe_file_stem(&citation));
        preserve_file_reference(
            &source_path,
            &code_dir,
            &title,
            "code-source",
            "code source",
            &citation,
        )?
    };
    let mut source = CodeSource {
        id,
        title: title.clone(),
        citation: citation.clone(),
        body,
        status: "imported".to_string(),
        source_original_path: source_original_path.clone(),
        source_stored_path: source_stored_path.clone(),
        source_file_name: source_file_name.clone(),
        source_sha256: source_sha256.clone(),
        source_size_bytes,
        imported_by: imported_by.clone(),
        codifier_name: String::new(),
        authoritative_url: String::new(),
        version_label: String::new(),
        codifier_sync_status: default_code_sync_status(),
        codifier_sync_errors: Vec::new(),
        last_codifier_sync_at_unix_seconds: None,
        stale_since_unix_seconds: None,
        amendment_notes: Vec::new(),
        version_history: Vec::new(),
        staff_guidance: String::new(),
        plain_language_summary: String::new(),
        guidance_approved_at_unix_seconds: None,
        public_status: default_code_public_status(),
        public_exports: Vec::new(),
        published_at_unix_seconds: None,
        created_at_unix_seconds: now_unix_seconds(),
    };
    append_code_version_history(
        &mut source,
        "local import",
        "Local import".to_string(),
        "Townlight local source".to_string(),
        String::new(),
        if source_sha256.is_empty() {
            format!("Imported with citation {citation}.")
        } else {
            format!(
                "Imported with citation {citation}; source file {source_file_name}; sha256 {source_sha256}."
            )
        },
    );
    state.code_sources.insert(0, source);
    push_audit(
        state,
        "civiccode",
        "import-code-source",
        if source_sha256.is_empty() {
            format!("Imported code source: {title}")
        } else {
            format!(
                "Imported code source {title}; source evidence copied to {source_stored_path}; sha256 {source_sha256}; {source_size_bytes} bytes."
            )
        },
    );
    if source_sha256.is_empty() {
        Ok("Municipal code source imported locally with citation.".to_string())
    } else {
        Ok(format!(
            "Municipal code source imported with local source evidence: {source_stored_path}."
        ))
    }
}

fn selected_code_source_index(
    state: &CityWorkState,
    payload: Option<&Value>,
) -> Result<usize, String> {
    let source_id = payload_optional_string(payload, "codeSourceId");
    if source_id.is_empty() {
        if state.code_sources.is_empty() {
            return Err("Import a code source before changing its public status.".to_string());
        }
        return Ok(0);
    }
    state
        .code_sources
        .iter()
        .position(|source| source.id == source_id)
        .ok_or_else(|| {
            "The selected code source was not found in the local city profile.".to_string()
        })
}

fn selected_code_source_mut<'a>(
    state: &'a mut CityWorkState,
    payload: Option<&Value>,
) -> Result<&'a mut CodeSource, String> {
    let index = selected_code_source_index(state, payload)?;
    Ok(&mut state.code_sources[index])
}

fn record_codifier_sync(
    state: &mut CityWorkState,
    payload: Option<&Value>,
) -> Result<String, String> {
    let codifier_name = payload_string(payload, "codifierName")?;
    let authoritative_url = payload_optional_string(payload, "authoritativeUrl");
    let version_label = payload_optional_string(payload, "versionLabel");
    let source = selected_code_source_mut(state, payload)?;
    source.codifier_name = codifier_name.clone();
    source.authoritative_url = authoritative_url.clone();
    source.version_label = version_label.clone();
    source.codifier_sync_status = "synced".to_string();
    source.codifier_sync_errors.clear();
    source.last_codifier_sync_at_unix_seconds = Some(now_unix_seconds());
    source.stale_since_unix_seconds = None;
    source.status = "codifier synced".to_string();
    let history_label = if version_label.is_empty() {
        "Codifier sync without version label".to_string()
    } else {
        version_label
    };
    append_code_version_history(
        source,
        "codifier synced",
        history_label,
        codifier_name.clone(),
        authoritative_url,
        "Codifier sync recorded locally.".to_string(),
    );
    push_audit(
        state,
        "civiccode",
        "record-codifier-sync",
        format!("Recorded codifier sync from: {codifier_name}"),
    );
    Ok("Codifier sync recorded and stale flag cleared.".to_string())
}

fn record_codifier_sync_failure(
    state: &mut CityWorkState,
    payload: Option<&Value>,
) -> Result<String, String> {
    let sync_error = payload_string(payload, "syncError")?;
    let source = selected_code_source_mut(state, payload)?;
    source.codifier_sync_status = "sync failed".to_string();
    source.codifier_sync_errors.push(sync_error.clone());
    source.status = "codifier sync failed".to_string();
    push_audit(
        state,
        "civiccode",
        "record-codifier-sync-failure",
        "Recorded codifier sync failure.".to_string(),
    );
    Ok("Codifier sync failure recorded for retry.".to_string())
}

fn retry_codifier_sync(
    state: &mut CityWorkState,
    payload: Option<&Value>,
) -> Result<String, String> {
    let source = selected_code_source_mut(state, payload)?;
    if source.codifier_sync_errors.is_empty() && source.codifier_sync_status != "sync failed" {
        return Err("Record a codifier sync failure before retrying.".to_string());
    }
    source.codifier_sync_status = "retry queued".to_string();
    source.status = "codifier retry queued".to_string();
    push_audit(
        state,
        "civiccode",
        "retry-codifier-sync",
        "Queued codifier sync retry.".to_string(),
    );
    Ok("Codifier sync retry queued locally.".to_string())
}

fn mark_code_stale(state: &mut CityWorkState, payload: Option<&Value>) -> Result<String, String> {
    let amendment_note = payload_string(payload, "amendmentNote")?;
    let source = selected_code_source_mut(state, payload)?;
    source.amendment_notes.push(amendment_note.clone());
    source.stale_since_unix_seconds = Some(now_unix_seconds());
    source.codifier_sync_status = "stale - codifier update pending".to_string();
    source.status = "codifier update pending".to_string();
    let history_label = if source.version_label.is_empty() {
        "Current local version".to_string()
    } else {
        source.version_label.clone()
    };
    let history_source = if source.codifier_name.is_empty() {
        "Local code source".to_string()
    } else {
        source.codifier_name.clone()
    };
    let history_url = source.authoritative_url.clone();
    append_code_version_history(
        source,
        "stale pending update",
        history_label,
        history_source,
        history_url,
        amendment_note.clone(),
    );
    push_audit(
        state,
        "civiccode",
        "mark-code-stale",
        "Marked code source stale pending codifier update.".to_string(),
    );
    Ok("Code source marked stale until the codifier update is ingested.".to_string())
}

fn draft_code_guidance(
    state: &mut CityWorkState,
    payload: Option<&Value>,
) -> Result<String, String> {
    let guidance = payload_string(payload, "guidanceDraft")?;
    let summary = payload_optional_string(payload, "summaryDraft");
    let source = selected_code_source_mut(state, payload)?;
    source.staff_guidance = guidance;
    if !summary.is_empty() {
        source.plain_language_summary = summary;
    }
    source.guidance_approved_at_unix_seconds = None;
    source.status = "guidance drafted".to_string();
    push_audit(
        state,
        "civiccode",
        "draft-code-guidance",
        "Drafted staff guidance and plain-language summary.".to_string(),
    );
    Ok("Code guidance draft saved for human approval.".to_string())
}

fn suggest_code_guidance(
    state: &mut CityWorkState,
    payload: Option<&Value>,
) -> Result<String, String> {
    let source = selected_code_source_mut(state, payload)?;
    let prompt = format!(
        "Draft internal municipal code staff guidance for human review. Use only the cited source text below. Do not provide legal advice. Include practical staff considerations and keep public-facing language non-authoritative.\n\nTitle: {}\nCitation: {}\nAuthoritative URL: {}\nCodifier sync status: {}\nCurrent public status: {}\nSource text:\n{}\n",
        source.title,
        source.citation,
        if source.authoritative_url.is_empty() {
            "No authoritative URL recorded."
        } else {
            &source.authoritative_url
        },
        source.codifier_sync_status,
        source.public_status,
        source.body
    );
    let (runtime_model, generated) = crate::model::generate_local_text(&prompt)?;
    source.staff_guidance = generated;
    source.guidance_approved_at_unix_seconds = None;
    source.status = "local AI guidance draft ready for review".to_string();
    push_audit(
        state,
        "civiccode",
        "suggest-code-guidance",
        format!("Generated local AI code guidance draft with {runtime_model}; human approval still required."),
    );
    Ok("Local AI code guidance draft generated. Review and approve before publication or staff reliance.".to_string())
}

fn approve_code_guidance(
    state: &mut CityWorkState,
    payload: Option<&Value>,
) -> Result<String, String> {
    let source = selected_code_source_mut(state, payload)?;
    if source.staff_guidance.trim().is_empty() && source.plain_language_summary.trim().is_empty() {
        return Err(
            "Draft staff guidance or a plain-language summary before approval.".to_string(),
        );
    }
    source.guidance_approved_at_unix_seconds = Some(now_unix_seconds());
    source.status = "guidance approved".to_string();
    push_audit(
        state,
        "civiccode",
        "approve-code-guidance",
        "Approved code guidance by human reviewer.".to_string(),
    );
    Ok("Code guidance approved; public summaries remain labeled non-authoritative.".to_string())
}

fn publish_code_source(
    state: &mut CityWorkState,
    payload: Option<&Value>,
) -> Result<String, String> {
    let (source_id, title, citation, export_path, public_payload) = {
        let source = selected_code_source_mut(state, payload)?;
        let codifier = if source.codifier_name.is_empty() {
            "No codifier sync recorded.".to_string()
        } else {
            format!(
                "{}{}{}",
                source.codifier_name,
                if source.version_label.is_empty() {
                    ""
                } else {
                    " / "
                },
                source.version_label
            )
        };
        let summary = if source.guidance_approved_at_unix_seconds.is_some()
            && !source.plain_language_summary.trim().is_empty()
        {
            source.plain_language_summary.clone()
        } else {
            "No approved non-authoritative summary.".to_string()
        };
        let public_update_status = if source.stale_since_unix_seconds.is_some() {
            "Codifier update pending; staff amendment notes stay in the Staff surface."
        } else {
            "No public stale-code warning recorded."
        };
        let version_history = code_version_history_or_default(&source.version_history);
        let source_evidence = if source.source_sha256.is_empty() {
            "No preserved source file evidence recorded.".to_string()
        } else {
            format!(
                "Source file: {}\nSHA-256: {}\nSize: {} bytes",
                if source.source_file_name.is_empty() {
                    "Recorded source file"
                } else {
                    &source.source_file_name
                },
                source.source_sha256,
                source.source_size_bytes
            )
        };
        let contents = format!(
            "# Municipal Code Source\n\nTitle: {}\nCitation: {}\nStatus: {}\nPublic status: published\nCodifier sync: {}\nAuthoritative URL: {}\n\n## Source Evidence\n{}\n\n## Authoritative Text\n{}\n\n## Non-Authoritative Plain-English Summary\n{}\n\n## Public Update Status\n{}\n\n## Version / Codifier History\n{}\n\n## Staff Boundary\nInternal staff guidance, operational sync errors, staff amendment notes, and clerk workstation file paths stay in the Staff surface and are not included in this public export.\n\nFor legal interpretation, contact city staff and rely on the authoritative codified ordinance text.\n",
            source.title,
            source.citation,
            source.status,
            codifier,
            if source.authoritative_url.is_empty() {
                "No authoritative URL recorded."
            } else {
                &source.authoritative_url
            },
            source_evidence,
            source.body,
            summary,
            public_update_status,
            version_history
        );
        let export_path = write_export_file("code", &source.title, &contents)?;
        source.public_status = "published".to_string();
        source.public_exports.push(export_path.clone());
        source.published_at_unix_seconds = Some(now_unix_seconds());
        (
            source.id.clone(),
            source.title.clone(),
            source.citation.clone(),
            export_path,
            contents,
        )
    };
    push_publication_event(state, "civiccode", source_id, "code-source", public_payload);
    push_audit(
        state,
        "civiccode",
        "publish-code-source",
        format!("Published code source {citation}: {export_path}"),
    );
    Ok(format!("{title} is published for Resident/Public search."))
}

fn unpublish_code_source(
    state: &mut CityWorkState,
    payload: Option<&Value>,
) -> Result<String, String> {
    let (source_id, title, citation) = {
        let source = selected_code_source_mut(state, payload)?;
        source.public_status = default_code_public_status();
        source.published_at_unix_seconds = None;
        (
            source.id.clone(),
            source.title.clone(),
            source.citation.clone(),
        )
    };
    retract_publication_event(state, "civiccode", &source_id, "civiccode");
    push_audit(
        state,
        "civiccode",
        "unpublish-code-source",
        format!("Returned code source {citation} to internal draft."),
    );
    Ok(format!(
        "{title} is no longer visible in Resident/Public search."
    ))
}

fn create_code_handoff(
    state: &mut CityWorkState,
    payload: Option<&Value>,
) -> Result<String, String> {
    let source_index = selected_code_source_index(state, payload)?;
    let source = &state.code_sources[source_index];
    let summary = payload_optional_string(payload, "summary");
    let id = new_id("handoff", state.code_handoffs.len());
    state.code_handoffs.insert(
        0,
        CodeHandoff {
            id,
            source_id: source.id.clone(),
            title: format!("Clerk handoff: {}", source.title),
            summary: if summary.is_empty() {
                format!(
                    "Review {} for ordinance or resolution workflow.",
                    source.citation
                )
            } else {
                summary
            },
            status: "ready for clerk review".to_string(),
            created_at_unix_seconds: now_unix_seconds(),
        },
    );
    push_audit(
        state,
        "civiccode",
        "create-code-handoff",
        format!("Created code-to-clerk handoff from {}", source.citation),
    );
    Ok("Code handoff created for CivicClerk review.".to_string())
}

fn contains_query(values: &[&str], query: &str) -> bool {
    let query = query.to_lowercase();
    values
        .iter()
        .any(|value| value.to_lowercase().contains(&query))
}

fn contains_question_terms(values: &[&str], query: &str) -> bool {
    if contains_query(values, query) {
        return true;
    }
    let terms = query
        .split(|character: char| !character.is_ascii_alphanumeric())
        .map(str::to_lowercase)
        .filter(|term| term.len() > 2)
        .collect::<Vec<_>>();
    values.iter().any(|value| {
        let value = value.to_lowercase();
        terms.iter().any(|term| value.contains(term))
    })
}

fn answer_code_question(
    state: &CityWorkState,
    query: &str,
    public_only: bool,
) -> Vec<SearchResult> {
    let query = query.trim();
    if query.is_empty() {
        return Vec::new();
    }
    state
        .code_sources
        .iter()
        .filter(|source| !public_only || source.public_status == "published")
        .filter(|source| source.stale_since_unix_seconds.is_none())
        .filter(|source| {
            let mut fields: Vec<&str> = vec![
                source.title.as_str(),
                source.citation.as_str(),
                source.body.as_str(),
                source.plain_language_summary.as_str(),
            ];
            if !public_only {
                fields.push(source.staff_guidance.as_str());
            }
            contains_question_terms(&fields, query)
        })
        .take(3)
        .map(|source| {
            let public_summary_allowed = source.guidance_approved_at_unix_seconds.is_some()
                && !source.plain_language_summary.trim().is_empty();
            let staff_detail_allowed = !public_only && !source.staff_guidance.trim().is_empty();
            let answer = if public_summary_allowed {
                source.plain_language_summary.clone()
            } else if staff_detail_allowed {
                source.staff_guidance.clone()
            } else {
                source.body
                    .split('.')
                    .next()
                    .map(str::trim)
                    .filter(|value| !value.is_empty())
                    .map(|value| format!("{value}."))
                    .unwrap_or_else(|| source.body.clone())
            };
            let label = if public_only {
                "Non-authoritative public summary"
            } else {
                "Staff code guidance"
            };
            SearchResult {
                module_id: "civiccode".to_string(),
                record_id: source.id.clone(),
                title: format!("Code answer: {}", source.title),
                snippet: format!(
                    "{label}: {answer} This is not legal advice; confirm interpretation with city staff or counsel."
                ),
                citation: source.citation.clone(),
                status: source.public_status.clone(),
            }
        })
        .collect()
}

pub fn search_city_work(state: &CityWorkState, query: &str) -> Vec<SearchResult> {
    let query = query.trim();
    if query.is_empty() {
        return Vec::new();
    }
    let mut results = Vec::new();
    for body in &state.meeting_bodies {
        if contains_query(
            &[
                &body.name,
                &body.body_type,
                &body.statutory_basis,
                &body.meeting_cadence,
                &body.quorum_rule,
                &body.status,
            ],
            query,
        ) {
            results.push(SearchResult {
                module_id: "civicclerk".to_string(),
                record_id: body.id.clone(),
                title: format!("Meeting body: {}", body.name),
                snippet: format!(
                    "{}; cadence {}; quorum {}",
                    body.body_type, body.meeting_cadence, body.quorum_rule
                ),
                citation: body.statutory_basis.clone(),
                status: body.status.clone(),
            });
        }
    }
    for member in &state.meeting_members {
        if contains_query(
            &[
                &member.name,
                &member.role,
                &member.body_name,
                &member.term_start,
                &member.term_end,
                &member.email,
                &member.status,
            ],
            query,
        ) {
            results.push(SearchResult {
                module_id: "civicclerk".to_string(),
                record_id: member.id.clone(),
                title: format!("Meeting member: {}", member.name),
                snippet: format!(
                    "{} on {}; term {} to {}",
                    member.role,
                    member.body_name,
                    if member.term_start.is_empty() {
                        "not recorded"
                    } else {
                        &member.term_start
                    },
                    if member.term_end.is_empty() {
                        "not recorded"
                    } else {
                        &member.term_end
                    }
                ),
                citation: member.body_name.clone(),
                status: member.status.clone(),
            });
        }
    }
    for intake in &state.agenda_intakes {
        if contains_query(
            &[
                &intake.title,
                &intake.department,
                &intake.submitter,
                &intake.summary,
                &intake.source_reference,
                &intake.requested_meeting_date,
                &intake.status,
                &intake.review_note,
            ],
            query,
        ) {
            results.push(SearchResult {
                module_id: "civicclerk".to_string(),
                record_id: intake.id.clone(),
                title: format!("Agenda intake: {}", intake.title),
                snippet: format!(
                    "{}; {}; {}",
                    intake.department, intake.status, intake.summary
                ),
                citation: intake.source_reference.clone(),
                status: intake.status.clone(),
            });
        }
    }
    for meeting in &state.meetings {
        let agenda_titles = meeting
            .agenda_items
            .iter()
            .map(|item| {
                format!(
                    "{} {} {} {} {}",
                    item.title,
                    item.source_reference,
                    item.department,
                    item.source_module,
                    item.status
                )
            })
            .collect::<Vec<_>>()
            .join(" ");
        let motions = meeting
            .motions
            .iter()
            .map(|motion| {
                format!(
                    "{} {} {} {} {}",
                    motion.text,
                    motion.mover,
                    motion.seconder,
                    motion.disposition,
                    motion.vote_reference
                )
            })
            .collect::<Vec<_>>()
            .join(" ");
        let staff_reports = meeting
            .staff_reports
            .iter()
            .map(|report| {
                format!(
                    "{} {} {} {} {} {} {} {} {} {}",
                    report.agenda_item_title,
                    report.recommendation,
                    report.background,
                    report.analysis,
                    report.fiscal_impact,
                    report.alternatives,
                    report.prior_actions,
                    report.prepared_by,
                    report.revision_note,
                    report.agenda_item_id
                )
            })
            .collect::<Vec<_>>()
            .join(" ");
        let votes = meeting.votes.join(" ");
        let member_votes = meeting
            .member_votes
            .iter()
            .map(|vote| {
                format!(
                    "{} {} {} {}",
                    vote.member_name, vote.vote, vote.motion_text, vote.motion_id
                )
            })
            .collect::<Vec<_>>()
            .join(" ");
        let attendance_records = meeting
            .attendance_records
            .iter()
            .map(|record| {
                format!(
                    "{} {} {} {}",
                    record.member_name, record.status, record.note, record.recorded_by
                )
            })
            .collect::<Vec<_>>()
            .join(" ");
        let quorum_checks = meeting
            .quorum_checks
            .iter()
            .map(|record| {
                format!(
                    "{} {} {} {} {} {} {} {}",
                    record.status,
                    record.quorum_rule,
                    record.required_count,
                    record.roster_count,
                    record.present_count,
                    record.remote_count,
                    record.recused_count,
                    record.review_note
                )
            })
            .collect::<Vec<_>>()
            .join(" ");
        let action_items = meeting.action_items.join(" ");
        let action_records = meeting
            .action_records
            .iter()
            .map(|action| {
                format!(
                    "{} {} {} {} {}",
                    action.description,
                    action.owner,
                    action.due_date,
                    action.status,
                    action.source_reference
                )
            })
            .collect::<Vec<_>>()
            .join(" ");
        let adopted_legislation = meeting
            .adopted_legislation
            .iter()
            .map(|record| {
                format!(
                    "{} {} {} {} {} {} {} {}",
                    record.legislation_type,
                    record.title,
                    record.text,
                    record.effective_date,
                    record.codification_section_hint,
                    record.source_motion_text,
                    record.source_agenda_item_title,
                    record.handoff_status
                )
            })
            .collect::<Vec<_>>()
            .join(" ");
        let closed_sessions = meeting
            .closed_sessions
            .iter()
            .map(|record| {
                format!(
                    "{} {} {} {} {} {}",
                    record.statutory_basis,
                    record.topics.join(" "),
                    record.attendees.join(" "),
                    record.entered_at,
                    record.exited_at,
                    record.reconvene_statement
                )
            })
            .collect::<Vec<_>>()
            .join(" ");
        let resident_comments = meeting.resident_comments.join(" ");
        let notice_checklists = meeting
            .notice_checklists
            .iter()
            .map(|checklist| {
                format!(
                    "{} {} {} {} {}",
                    checklist.meeting_type,
                    checklist.statutory_basis,
                    checklist.posting_deadline,
                    checklist.time_zone,
                    checklist.status
                )
            })
            .collect::<Vec<_>>()
            .join(" ");
        let notice_postings = meeting
            .notice_postings
            .iter()
            .map(|posting| {
                format!(
                    "{} {} {} {} {}",
                    posting.location,
                    posting.method,
                    posting.confirmation,
                    posting.posted_on,
                    posting.time_zone
                )
            })
            .collect::<Vec<_>>()
            .join(" ");
        let attachments = meeting
            .attachments
            .iter()
            .map(|attachment| {
                format!(
                    "{} {} {} {} {} {}",
                    attachment.title,
                    attachment.citation,
                    attachment.sha256,
                    attachment.packet_section,
                    attachment.access_level,
                    attachment.stored_path
                )
            })
            .collect::<Vec<_>>()
            .join(" ");
        let packet_assemblies = meeting
            .packet_assemblies
            .iter()
            .map(|record| {
                format!(
                    "{} {} {} {} {} {} {}",
                    record.packet_title,
                    record.prepared_by,
                    record.review_note,
                    record.status,
                    record.agenda_item_count,
                    record.public_attachment_count,
                    record.closed_session_attachment_count
                )
            })
            .collect::<Vec<_>>()
            .join(" ");
        let export_bundles = meeting
            .export_bundles
            .iter()
            .map(|bundle| {
                format!(
                    "{} {} {} {} {} {} {} {} {} {}",
                    bundle.export_path,
                    bundle.manifest_path,
                    bundle.integrity_manifest_path,
                    bundle.export_hash,
                    bundle.manifest_hash,
                    if bundle.public_record {
                        "public record"
                    } else {
                        "staff packet"
                    },
                    bundle.agenda_item_count,
                    bundle.notice_posting_count,
                    bundle.attendance_record_count,
                    bundle.quorum_check_count
                )
            })
            .collect::<Vec<_>>()
            .join(" ");
        let minute_citations = meeting
            .minute_citations
            .iter()
            .map(|citation| {
                format!(
                    "{} {} {} {} {}",
                    citation.sentence,
                    citation.source_type,
                    citation.source_reference,
                    citation.note,
                    citation.access_level
                )
            })
            .collect::<Vec<_>>()
            .join(" ");
        let public_comments = meeting
            .public_comments
            .iter()
            .map(|comment| {
                format!(
                    "{} {} {} {} {}",
                    comment.commenter_name,
                    comment.commenter_contact,
                    comment.mode,
                    comment.topic,
                    comment.body
                )
            })
            .collect::<Vec<_>>()
            .join(" ");
        if contains_query(
            &[
                &meeting.title,
                &meeting.body_name,
                &meeting.summary,
                &meeting.status,
                &meeting.minutes,
                &meeting.minutes_signed_by,
                &meeting.minutes_signature_attestation,
                &agenda_titles,
                &staff_reports,
                &attachments,
                &packet_assemblies,
                &export_bundles,
                &minute_citations,
                &motions,
                &member_votes,
                &attendance_records,
                &quorum_checks,
                &votes,
                &action_items,
                &action_records,
                &adopted_legislation,
                &closed_sessions,
                &resident_comments,
                &notice_checklists,
                &notice_postings,
                &public_comments,
            ],
            query,
        ) {
            results.push(SearchResult {
                module_id: "civicclerk".to_string(),
                record_id: meeting.id.clone(),
                title: meeting.title.clone(),
                snippet: meeting.summary.clone(),
                citation: format!("Meeting {}", meeting.meeting_date),
                status: meeting.status.clone(),
            });
        }
        if contains_query(
            &[&notice_checklists, &notice_postings, &export_bundles],
            query,
        ) {
            results.push(SearchResult {
                module_id: "civicnotice".to_string(),
                record_id: meeting.id.clone(),
                title: format!("Notice workpaper: {}", meeting.title),
                snippet: if meeting.notice_status.is_empty() {
                    "Notice workpaper".to_string()
                } else {
                    meeting.notice_status.clone()
                },
                citation: format!("Meeting {}", meeting.meeting_date),
                status: if meeting.notice_status.is_empty() {
                    meeting.status.clone()
                } else {
                    meeting.notice_status.clone()
                },
            });
        }
    }
    for request in &state.records_requests {
        let citations = request.citations.join(" ");
        let clarification_notes = request.clarification_notes.join(" ");
        let search_notes = request.search_notes.join(" ");
        let search_sessions = request
            .search_sessions
            .iter()
            .map(|session| {
                let results = session
                    .results
                    .iter()
                    .map(|result| {
                        format!(
                            "{} {} {} {}",
                            result.title, result.citation, result.summary, result.status
                        )
                    })
                    .collect::<Vec<_>>()
                    .join(" ");
                format!(
                    "{} {} {} {}",
                    session.query, session.locations, session.reviewer, results
                )
            })
            .collect::<Vec<_>>()
            .join(" ");
        let exemption_reviews = request.exemption_reviews.join(" ");
        let exemption_decisions = request
            .exemption_decisions
            .iter()
            .map(|decision| {
                format!(
                    "{} {} {} {} {} {}",
                    decision.source,
                    decision.kind,
                    decision.finding,
                    decision.decision,
                    decision.basis,
                    decision.reviewer
                )
            })
            .collect::<Vec<_>>()
            .join(" ");
        let approval_notes = request.approval_notes.join(" ");
        let request_messages = request
            .messages
            .iter()
            .map(|message| {
                format!(
                    "{} {} {}",
                    message.author, message.author_role, message.body
                )
            })
            .collect::<Vec<_>>()
            .join(" ");
        let request_documents = request
            .documents
            .iter()
            .map(|document| {
                format!(
                    "{} {} {} {} {} {} {} {} {} {} {} {} {} {}",
                    document.title,
                    document.citation,
                    document.status,
                    document.sha256,
                    document.stored_path,
                    document.release_original_path,
                    document.release_stored_path,
                    document.release_file_name,
                    document.release_sha256,
                    document.release_size_bytes,
                    document.release_status,
                    document.release_note,
                    document.release_added_by,
                    document.release_added_at_unix_seconds.unwrap_or_default()
                )
            })
            .collect::<Vec<_>>()
            .join(" ");
        let release_packages = request
            .release_packages
            .iter()
            .map(|package| {
                format!(
                    "{} {} {} {} {} {} {} {}",
                    package.export_path,
                    package.package_hash,
                    package.document_count,
                    package.release_artifact_count,
                    package.search_session_count,
                    package.release_count,
                    package.redacted_count,
                    package.exempt_count
                )
            })
            .collect::<Vec<_>>()
            .join(" ");
        let fee_lines = request
            .fee_line_items
            .iter()
            .map(|item| {
                format!(
                    "{} {} {}",
                    item.description,
                    item.schedule_basis,
                    format_money_cents(item.amount_cents)
                )
            })
            .collect::<Vec<_>>()
            .join(" ");
        let timeline = request
            .timeline
            .iter()
            .map(|entry| format!("{} {} {}", entry.action, entry.actor, entry.note))
            .collect::<Vec<_>>()
            .join(" ");
        let public_status_events = request
            .public_status_events
            .iter()
            .map(|entry| format!("{} {} {}", entry.label, entry.status, entry.summary))
            .collect::<Vec<_>>()
            .join(" ");
        if contains_query(
            &[
                &request.requester,
                &request.summary,
                &request.status,
                &request.assigned_to,
                &request.deadline,
                &request.deadline_basis,
                &request.fee_estimate,
                &request.fee_waiver_reason,
                &fee_lines,
                &request.response_draft,
                &citations,
                &request_messages,
                &request_documents,
                &release_packages,
                &clarification_notes,
                &search_notes,
                &search_sessions,
                &exemption_reviews,
                &exemption_decisions,
                &approval_notes,
                &timeline,
                &public_status_events,
            ],
            query,
        ) {
            results.push(SearchResult {
                module_id: "civicrecords-ai".to_string(),
                record_id: request.id.clone(),
                title: format!("Records request: {}", request.requester),
                snippet: request.summary.clone(),
                citation: request
                    .citations
                    .first()
                    .cloned()
                    .unwrap_or_else(|| "Local records request".to_string()),
                status: request.status.clone(),
            });
        }
    }
    for source in &state.code_sources {
        let amendment_notes = source.amendment_notes.join(" ");
        let sync_errors = source.codifier_sync_errors.join(" ");
        let version_history = code_version_history_search_text(&source.version_history);
        let source_size = if source.source_size_bytes == 0 {
            String::new()
        } else {
            source.source_size_bytes.to_string()
        };
        if contains_query(
            &[
                &source.title,
                &source.citation,
                &source.body,
                &source.status,
                &source.source_original_path,
                &source.source_stored_path,
                &source.source_file_name,
                &source.source_sha256,
                &source_size,
                &source.imported_by,
                &source.public_status,
                &source.codifier_name,
                &source.authoritative_url,
                &source.version_label,
                &source.codifier_sync_status,
                &source.staff_guidance,
                &source.plain_language_summary,
                &amendment_notes,
                &sync_errors,
                &version_history,
            ],
            query,
        ) {
            results.push(SearchResult {
                module_id: "civiccode".to_string(),
                record_id: source.id.clone(),
                title: source.title.clone(),
                snippet: source.body.clone(),
                citation: source.citation.clone(),
                status: source.status.clone(),
            });
        }
    }
    for event in &state.notification_events {
        if contains_query(
            &[
                &event.module_id,
                &event.record_id,
                &event.audience,
                &event.channel,
                &event.subject,
                &event.body,
                &event.status,
            ],
            query,
        ) {
            results.push(SearchResult {
                module_id: "civiccore".to_string(),
                record_id: event.id.clone(),
                title: format!("Notification: {}", event.subject),
                snippet: event.body.clone(),
                citation: event.channel.clone(),
                status: event.status.clone(),
            });
        }
    }
    for review in &state.access.reviews {
        // Each persisted accessibility review is searchable across title, body, language, status,
        // and finding messages so clerks can locate prior advisory reviews from the Search tab.
        let finding_summary = review
            .findings
            .iter()
            .map(|f| format!("{}: {}", f.code, f.message))
            .collect::<Vec<_>>()
            .join("; ");
        if contains_query(
            &[
                &review.title,
                &review.body,
                &review.language,
                &review.status,
                &finding_summary,
            ],
            query,
        ) {
            results.push(SearchResult {
                module_id: "civicaccess".to_string(),
                record_id: review.review_id.clone(),
                title: format!(
                    "Accessibility review: {}",
                    if review.title.is_empty() {
                        "(no title)".to_string()
                    } else {
                        review.title.clone()
                    }
                ),
                snippet: format!(
                    "{} ({} finding(s); language: {}; alt text: {})",
                    review.status,
                    review.findings.len(),
                    review.language,
                    if review.has_alt_text { "yes" } else { "no" }
                ),
                citation: format!("Accessibility advisory review {}", review.review_id),
                status: review.status.clone(),
            });
        }
    }
    results
}

pub fn city_work_state() -> Result<CityWorkState, String> {
    read_state()
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

fn public_records_request_lookup_projection(request: &RecordsRequest) -> RecordsRequest {
    let mut public_request = public_records_request_status_projection(request);
    public_request.messages = request
        .messages
        .iter()
        .filter(|message| message.visibility == "requester thread")
        .cloned()
        .collect();
    public_request
}

fn public_records_status_lookup(
    state: &CityWorkState,
    payload: Option<&Value>,
) -> Result<CityWorkActionResult, String> {
    let tracking_number = payload_string(payload, "trackingNumber")?;
    let requester_contact = payload_string(payload, "requesterContact")?;
    let mut public_state = city_work_public_projection(state);
    let found_request = public_records_request_index(state, &tracking_number, &requester_contact)
        .map(|index| &state.records_requests[index]);
    if let Some(request) = found_request {
        let projected_request = public_records_request_lookup_projection(request);
        if !public_state
            .records_requests
            .iter()
            .any(|public_request| public_request.id == projected_request.id)
        {
            public_state.records_requests.insert(0, projected_request);
        }
        return Ok(CityWorkActionResult {
            accepted: true,
            action: "lookup-public-records-request".to_string(),
            status: "Status found",
            message: format!(
                "Request {tracking_number} matched the submitted contact and is ready to review."
            ),
            next_action:
                "Review the current status below or contact staff with the request number."
                    .to_string(),
            state: public_state,
            search_results: Vec::new(),
            next_steps: Vec::new(),
            disclaimer: String::new(),
        });
    }
    Ok(CityWorkActionResult {
        accepted: false,
        action: "lookup-public-records-request".to_string(),
        status: "No match",
        message: "No local request matched that request number and submitted contact.".to_string(),
        next_action: "Check the request number and contact, or contact the clerk if you need help."
            .to_string(),
        state: public_state,
        search_results: Vec::new(),
        next_steps: Vec::new(),
        disclaimer: String::new(),
    })
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

// ===== CivicAccess (module 6) =====
//
// Native Rust port of civicaccess v0.4.0 helpers (access_review.py,
// plain_language.py, multilingual.py, workflows.py), extended with local-AI
// dual paths: plain-language rewrite, multilingual variant, and the review's
// advisory analysis call the suite's local model (generate_local_text, same
// engine as CivicClerk/CivicRecords/CivicCode) when it is ready, and fall back
// to the original deterministic behavior -- explicitly labeled "AI engine not
// ready" -- when it is not. The review's five deterministic WCAG rule checks
// are the records-bearing floor: AI never adds, removes, or reclassifies a
// finding, and a dead engine never blocks saving a review. The four
// checklist-shaped tools (form plan, publishing workflow, ADA Title II,
// tagged-PDF) stay deterministic on purpose.
// State persists on CityWorkState.access via the same city-work.json file the
// other modules use; audit events ride the existing audit_entries hash chain
// AND a per-module audit_events vec that mirrors civicaccess's Postgres
// audit_events table so the persistence shape matches the standalone module.

// Must stay byte-identical to main.js's CIVICACCESS_DISCLAIMER_TEXT -- this value
// is persisted into every saved review and every action result's disclaimer
// field. Not yet rendered by the UI (it reads its own hardcoded copy instead),
// but matching wording now means whoever eventually wires it up doesn't
// introduce a third disclaimer sentence.
const CIVICACCESS_DISCLAIMER: &str =
    "Persisted reviews are advisory clerk support, not a certified accessibility audit.";

// Per-module mirror of civicaccess's standalone audit_events table; capped FIFO
// because the authoritative tamper-evident record is the global hash-chained
// audit_entries (push_audit), which this mirror does not replace.
const CIVICACCESS_MAX_AUDIT_EVENTS: usize = 5000;

fn civicaccess_record_audit(
    state: &mut CityWorkState,
    action: &str,
    subject_id: Option<&str>,
    actor: &str,
) -> String {
    // UUIDv4, not new_id's timestamp+count scheme: once the FIFO cap below
    // stabilizes the vec at a fixed length, a count-derived id would mint the
    // exact same string for every event from that point on.
    let event_id = format!("access-audit-{}", uuid::Uuid::new_v4());
    state.access.audit_events.push(CivicAccessAuditEvent {
        event_id: event_id.clone(),
        action: action.to_string(),
        subject_id: subject_id.map(str::to_string),
        actor: actor.to_string(),
        created_at_unix_seconds: now_unix_seconds(),
    });
    if state.access.audit_events.len() > CIVICACCESS_MAX_AUDIT_EVENTS {
        let overflow = state.access.audit_events.len() - CIVICACCESS_MAX_AUDIT_EVENTS;
        state.access.audit_events.drain(0..overflow);
    }
    event_id
}

fn build_accessibility_findings(
    title: &str,
    body: &str,
    has_alt_text: bool,
    language: &str,
) -> Vec<AccessibilityFinding> {
    let mut findings: Vec<AccessibilityFinding> = Vec::new();
    if body.trim().is_empty() {
        findings.push(AccessibilityFinding {
            code: "missing-body".to_string(),
            severity: "high".to_string(),
            message: "The public text is empty.".to_string(),
            fix: "Add the resident-facing text before running an accessibility review.".to_string(),
            wcag_reference: "WCAG 3.1.5 Reading Level".to_string(),
        });
    }
    if title.trim().is_empty() {
        findings.push(AccessibilityFinding {
            code: "missing-title".to_string(),
            severity: "high".to_string(),
            message: "The document needs a descriptive title.".to_string(),
            fix: "Add a short title that names the service, deadline, or public action."
                .to_string(),
            wcag_reference: "WCAG 2.4.2 Page Titled".to_string(),
        });
    }
    if !has_alt_text {
        findings.push(AccessibilityFinding {
            code: "missing-alt-text".to_string(),
            severity: "high".to_string(),
            message: "At least one image or visual element is missing alternative text.".to_string(),
            fix: "Add concise alt text that explains the purpose of the visual, or mark decorative images as decorative.".to_string(),
            wcag_reference: "WCAG 1.1.1 Non-text Content".to_string(),
        });
    }
    if body.split_whitespace().count() > 80 {
        findings.push(AccessibilityFinding {
            code: "long-copy".to_string(),
            severity: "medium".to_string(),
            message: "The sample text is long enough to need headings or a plain-language summary.".to_string(),
            fix: "Break the content into sections and add a plain-language summary before the detailed text.".to_string(),
            wcag_reference: "WCAG 3.1.5 Reading Level".to_string(),
        });
    }
    let lang_normalized = language.trim().to_lowercase();
    if lang_normalized != "en" && lang_normalized != "english" {
        findings.push(AccessibilityFinding {
            code: "language-confirmation".to_string(),
            severity: "medium".to_string(),
            message: "The document language should be declared and checked by a qualified reviewer.".to_string(),
            fix: "Set the document language metadata and confirm the translation with a human reviewer.".to_string(),
            wcag_reference: "WCAG 3.1.1 Language of Page".to_string(),
        });
    }
    findings
}

fn accessibility_review(
    state: &mut CityWorkState,
    payload: Option<&Value>,
) -> Result<(String, Vec<String>, String), String> {
    // Match civicaccess Python semantics: empty title or body becomes a finding,
    // not a rejected request. The deterministic finding rules below catch them.
    let title = payload_optional_string_with_cap(payload, "title", 500)?;
    let body = payload_optional_string_with_cap(payload, "body", 5000)?;
    let has_alt_text = payload_bool(payload, "hasAltText");
    let language = {
        let provided = payload_optional_string_with_cap(payload, "language", 80)?;
        if provided.is_empty() {
            "en".to_string()
        } else {
            provided
        }
    };

    let findings = build_accessibility_findings(&title, &body, has_alt_text, &language);
    // Deterministic floor: the saved status derives ONLY from the rule checks.
    // The AI analysis below is advisory prose layered on top -- it never adds,
    // removes, or reclassifies a finding, and a dead AI engine never blocks
    // saving a review (reviews are records-bearing).
    let status = if findings.is_empty() {
        "passes-sample-checks".to_string()
    } else {
        "needs-fixes".to_string()
    };
    // Each arm carries (stored analysis, stored model, audit-chain note,
    // user-visible result note) -- the result box must disclose the AI outcome
    // in every arm, not just success (design 2c; gate round-1 P2).
    let (ai_analysis, ai_analysis_model, ai_note, ai_result_note) =
        // ponytail: unwrap_or(false) deliberately reads a readiness-computation
        // error as "engine unavailable" -- the review is records-bearing and a
        // broken readiness probe must degrade to deterministic-only, never
        // block the save (asymmetric with rewrite/variant, where the AI output
        // IS the product and errors fail fast).
        if crate::model::local_generation_available().unwrap_or(false) {
            let findings_lines = if findings.is_empty() {
                "none".to_string()
            } else {
                findings
                    .iter()
                    .map(|f| format!("{} ({}): {}", f.code, f.severity, f.message))
                    .collect::<Vec<_>>()
                    .join("\n")
            };
            let prompt = format!(
                "You are helping city staff review a public document for accessibility. Deterministic checks already produced these findings (do not add or remove findings):\n{findings_lines}\n\nDocument title: {title}\nLanguage: {language}\nAlt text present: {}\nDocument text:\n{}\n\nWrite a short, prioritized remediation analysis for staff: which finding to fix first and why, plus any plain-language or structure concerns a human reviewer should double-check. Advisory only; a qualified human reviewer makes the final call.",
                if has_alt_text { "yes" } else { "no" },
                body.trim()
            );
            match crate::model::generate_local_text(&prompt) {
                Ok((runtime_model, generated)) => (
                    Some(generated.clone()),
                    Some(runtime_model.clone()),
                    format!("; local AI analysis added with {runtime_model} (advisory, human review required)"),
                    format!("\nLocal AI analysis ({runtime_model}) — advisory, human review required:\n{generated}"),
                ),
                Err(error) => (
                    None,
                    None,
                    format!("; local AI analysis skipped (generation failed: {error})"),
                    format!("\nLocal AI analysis was skipped ({error}) — the review saved with its deterministic findings; human review still applies."),
                ),
            }
        } else {
            (
                None,
                None,
                "; AI engine not ready — deterministic findings only".to_string(),
                "\nAI engine not ready — the review saved with deterministic findings only."
                    .to_string(),
            )
        };
    let review_id = format!("access-review-{}", uuid::Uuid::new_v4());
    let created_at_unix_seconds = now_unix_seconds();
    let high_severity_count = findings.iter().filter(|f| f.severity == "high").count();
    let total_count = findings.len();
    state.access.reviews.push(StoredAccessibilityReview {
        review_id: review_id.clone(),
        title: title.clone(),
        body: body.clone(),
        has_alt_text,
        language: language.clone(),
        status: status.clone(),
        findings,
        disclaimer: CIVICACCESS_DISCLAIMER.to_string(),
        created_at_unix_seconds,
        ai_analysis,
        ai_analysis_model,
    });
    civicaccess_record_audit(state, "review.create", Some(&review_id), "staff");
    // push_audit() strips newlines from summary itself, so no per-caller sanitization needed here.
    push_audit(
        state,
        "civicaccess",
        "accessibility-review",
        format!(
            "Accessibility review {review_id} for \"{title}\" ({language}): {status} ({total_count} finding(s), {high_severity_count} high){ai_note}."
        ),
    );
    let next_steps = vec![
        "Resolve each high-severity finding before publication.".to_string(),
        "Have staff or an ADA coordinator review findings that require human judgment.".to_string(),
        "Preserve the review record with the publication's audit trail.".to_string(),
    ];
    Ok((
        format!(
            "Accessibility review saved as {review_id}: {status} ({total_count} finding(s), {high_severity_count} high-severity). Resolve high-severity findings before publication; this is advisory support, not a certified audit.{ai_result_note}"
        ),
        next_steps,
        CIVICACCESS_DISCLAIMER.to_string(),
    ))
}

fn civicaccess_records_export(
    state: &mut CityWorkState,
    payload: Option<&Value>,
) -> Result<(String, Vec<String>, String), String> {
    let review_id = payload_string(payload, "reviewId")
        .map_err(|_| "Select a saved review to export.".to_string())?;
    let review = state
        .access
        .reviews
        .iter()
        .find(|review| review.review_id == review_id)
        .ok_or_else(|| {
            format!(
                "Saved accessibility review {review_id} is not in the local store; save a review before exporting."
            )
        })?
        .clone();

    let findings = if review.findings.is_empty() {
        "- none recorded\n".to_string()
    } else {
        review
            .findings
            .iter()
            .map(|finding| {
                format!(
                    "- **{}** {} — fix: {} ({})\n",
                    finding.severity, finding.message, finding.fix, finding.wcag_reference
                )
            })
            .collect::<String>()
    };
    let contents = format!(
        "# Records-ready accessibility export\n\n\
         Review id: {}\n\
         Title: {}\n\
         Status: {}\n\
         Language: {}\n\
         Alt text: {}\n\n\
         ## Findings\n\n{}\n\
         ## Advisory notice\n\n{}\n",
        review.review_id,
        if review.title.is_empty() {
            "(untitled)"
        } else {
            &review.title
        },
        review.status,
        review.language,
        if review.has_alt_text {
            "present"
        } else {
            "missing"
        },
        findings,
        CIVICACCESS_DISCLAIMER
    );
    let export_path = write_export_file("access", &review.review_id, &contents)?;

    civicaccess_record_audit(state, "review.records_export", Some(&review_id), "staff");
    push_audit(
        state,
        "civicaccess",
        "civicaccess-records-export",
        format!(
            "Records-ready export written for accessibility review {review_id} to {export_path}. Advisory checklist only; not a certified tagged PDF."
        ),
    );
    Ok((
        format!(
            "Records-ready export written for {review_id} to {export_path}. The export is an advisory checklist, not a certified tagged PDF."
        ),
        vec![format!("Open {export_path} to review the exported checklist.")],
        CIVICACCESS_DISCLAIMER.to_string(),
    ))
}

fn civicaccess_delete_review(
    state: &mut CityWorkState,
    payload: Option<&Value>,
) -> Result<(String, Vec<String>, String), String> {
    let review_id = payload_string(payload, "reviewId")
        .map_err(|_| "Select a saved review to delete.".to_string())?;
    let before = state.access.reviews.len();
    state
        .access
        .reviews
        .retain(|review| review.review_id != review_id);
    if state.access.reviews.len() == before {
        return Err(format!(
            "Saved accessibility review {review_id} is not in the local store."
        ));
    }
    civicaccess_record_audit(state, "review.delete", Some(&review_id), "staff");
    push_audit(
        state,
        "civicaccess",
        "civicaccess-delete-review",
        format!("Accessibility review {review_id} deleted from the local store."),
    );
    Ok((
        format!("Accessibility review {review_id} deleted from the saved-review list."),
        vec![
            "The review's audit-trail entry remains in the hash-chained audit log even though it no longer appears in the saved-review list."
                .to_string(),
        ],
        CIVICACCESS_DISCLAIMER.to_string(),
    ))
}

fn civicaccess_jargon_rewrite(text: &str) -> String {
    let mut rewritten = text.trim().to_string();
    for (jargon, replacement) in CIVICACCESS_JARGON_MAP {
        rewritten = rewritten.replace(jargon, replacement);
        // ponytail: ASCII-only assumption (jargon map is hand-authored lowercase
        // ASCII). If non-ASCII jargon is ever added, switch to a caseless crate.
        let title_jargon = title_case_word(&jargon.to_lowercase());
        let title_replacement = title_case_word(&replacement.to_lowercase());
        rewritten = rewritten.replace(&title_jargon, &title_replacement);
    }
    if rewritten.is_empty() {
        rewritten = "Add the public-facing text that should be rewritten.".to_string();
    }
    rewritten
}

fn civicaccess_plain_language(
    state: &mut CityWorkState,
    payload: Option<&Value>,
) -> Result<(String, Vec<String>, String), String> {
    let text = friendly_required(
        payload_string_with_cap(payload, "text", 5000),
        "Enter the public-facing text that should be rewritten.",
    )?;
    if crate::model::local_generation_available()? {
        // AI path: the rewrite itself is the product, so a mid-flight
        // generation failure fails fast with state untouched (records
        // precedent) rather than silently downgrading to the sample pass.
        let prompt = format!(
            "Rewrite the following public-facing city text in plain language for residents. Keep every fact, date, deadline, dollar amount, name, and legal obligation exactly as written. Do not add information that is not in the original. Do not shorten it into a summary.\n\nText:\n{}",
            text.trim()
        );
        let (runtime_model, generated) = crate::model::generate_local_text(&prompt)?;
        civicaccess_record_audit(state, "plain_language.rewrite", None, "staff");
        push_audit(
            state,
            "civicaccess",
            "civicaccess-plain-language",
            format!(
                "Local AI plain-language draft generated with {runtime_model} ({} -> {} characters); human review required before publication.",
                text.len(),
                generated.len()
            ),
        );
        return Ok((
            format!(
                "Local AI plain-language draft ({runtime_model}) — human review required before publication:\n{generated}"
            ),
            vec!["Have staff review the rewrite for accuracy before publication.".to_string()],
            CIVICACCESS_DISCLAIMER.to_string(),
        ));
    }
    let rewritten = civicaccess_jargon_rewrite(&text);
    civicaccess_record_audit(state, "plain_language.rewrite", None, "staff");
    push_audit(
        state,
        "civicaccess",
        "civicaccess-plain-language",
        format!(
            "AI engine not ready; deterministic jargon-map rewrite returned ({} -> {} characters); human review required before publication.",
            text.len(),
            rewritten.len()
        ),
    );
    Ok((
        format!(
            "AI engine not ready — deterministic sample rewrite returned (jargon-map pass; human review required before publication):\n{rewritten}"
        ),
        vec![
            "Have staff review the rewrite for accuracy before publication.".to_string(),
            "Open System Health to download, verify, and load the local AI model for real plain-language drafts.".to_string(),
        ],
        CIVICACCESS_DISCLAIMER.to_string(),
    ))
}

const CIVICACCESS_JARGON_MAP: &[(&str, &str)] = &[
    ("pursuant to", "under"),
    ("commence", "start"),
    ("terminate", "end"),
    ("remit payment", "pay"),
    ("prior to", "before"),
    ("subsequent to", "after"),
];

fn title_case_word(input: &str) -> String {
    let mut result = String::with_capacity(input.len());
    let mut at_word_start = true;
    for character in input.chars() {
        if character.is_whitespace() {
            at_word_start = true;
            result.push(character);
        } else if at_word_start {
            for upper in character.to_uppercase() {
                result.push(upper);
            }
            at_word_start = false;
        } else {
            result.push(character);
        }
    }
    result
}

fn civicaccess_language_variant(
    state: &mut CityWorkState,
    payload: Option<&Value>,
) -> Result<(String, Vec<String>, String), String> {
    let text = friendly_required(
        payload_string_with_cap(payload, "text", 5000),
        "Enter the public text that should be translated.",
    )?;
    let language = friendly_required(
        payload_string_with_cap(payload, "language", 80),
        "Enter the target language (e.g. es, vi).",
    )?;
    if crate::model::local_generation_available()? {
        // AI path: real draft translation of the actual input text, any target
        // language. The translation is the product, so mid-flight generation
        // failures fail fast with state untouched (records precedent).
        let prompt = format!(
            "Translate the following public-facing city text into {}. Keep the meaning exact; keep dates, amounts, addresses, and names unchanged. Use plain, resident-friendly wording. Return only the translation, no commentary.\n\nText:\n{}",
            language.trim(),
            text.trim()
        );
        let (runtime_model, generated) = crate::model::generate_local_text(&prompt)?;
        civicaccess_record_audit(state, "multilingual.variant", None, "staff");
        push_audit(
            state,
            "civicaccess",
            "civicaccess-language-variant",
            format!(
                "Multilingual variant for {language}: ai-draft-translation via {runtime_model}; qualified human translator review required."
            ),
        );
        return Ok((
            format!(
                "ai-draft-translation ({runtime_model}): {generated}\nHuman review required before publication."
            ),
            vec![
                "Route the variant to a qualified human translator/reviewer before publication."
                    .to_string(),
            ],
            CIVICACCESS_DISCLAIMER.to_string(),
        ));
    }
    // ponytail: ASCII-only assumption (only "es"/"vi" are matched today). If a
    // non-ASCII language key is ever added, to_lowercase() diverges from
    // Python's .casefold() for some scripts -- switch to a caseless crate then.
    let normalized = language.trim().to_lowercase();
    let (variant, status) = match normalized.as_str() {
        "es" => (
            "Muestra: comuniquese con la ciudad para recibir ayuda con este aviso.".to_string(),
            "sample-created".to_string(),
        ),
        "vi" => (
            "Mau: lien he voi thanh pho de duoc tro giup ve thong bao nay.".to_string(),
            "sample-created".to_string(),
        ),
        _ => (
            format!("Sample variant placeholder for {language}: {}", text.trim()),
            "unsupported-language-placeholder".to_string(),
        ),
    };
    civicaccess_record_audit(state, "multilingual.variant", None, "staff");
    push_audit(
        state,
        "civicaccess",
        "civicaccess-language-variant",
        format!(
            "Multilingual variant for {language}: {status} via deterministic sample (AI engine not ready); qualified human translator review required."
        ),
    );
    Ok((
        format!(
            "AI engine not ready — sample variant returned. {status}: {variant}\nHuman review required before publication."
        ),
        vec![
            "Route the variant to a qualified human translator/reviewer before publication."
                .to_string(),
            "Open System Health to download, verify, and load the local AI model for real draft translations.".to_string(),
        ],
        CIVICACCESS_DISCLAIMER.to_string(),
    ))
}

fn civicaccess_form_plan(
    state: &mut CityWorkState,
    payload: Option<&Value>,
) -> Result<(String, Vec<String>, String), String> {
    let form_name = payload_optional_string_with_cap(payload, "formName", 500)?;
    let fields: Vec<String> = payload_text_list_with_cap(payload, "fields", 100, 50)?
        .into_iter()
        .map(|field| field.trim().to_lowercase())
        .collect();
    let required = ["name", "contact", "request"];
    let mut missing: Vec<&str> = required
        .iter()
        .filter(|needed| !fields.iter().any(|f| f == *needed))
        .copied()
        .collect();
    if form_name.trim().is_empty() {
        missing.insert(0, "form-name");
    }
    let status = if missing.is_empty() {
        "form-plan-created"
    } else {
        "needs-fixes"
    };
    let display_name = if form_name.trim().is_empty() {
        "(untitled form)".to_string()
    } else {
        form_name.clone()
    };
    civicaccess_record_audit(state, "form.plan", None, "staff");
    push_audit(
        state,
        "civicaccess",
        "civicaccess-form-plan",
        format!(
            "Accessible form plan for {display_name}: {status} (missing required fields: {}).",
            if missing.is_empty() {
                "none".to_string()
            } else {
                missing.join(", ")
            }
        ),
    );
    if missing.is_empty() {
        Ok((
            format!(
                "Form plan for {display_name}: form-plan-created. Use visible labels for every input; keep keyboard focus order aligned with reading order; show actionable validation errors beside each field; preserve submissions with the publication record."
            ),
            vec!["Keep validation errors next to the fields they describe.".to_string()],
            CIVICACCESS_DISCLAIMER.to_string(),
        ))
    } else {
        Ok((
            format!(
                "Form plan for {display_name}: needs-fixes. Missing required fields: {}. Give the form a descriptive title; label every required field in text; provide help text for contact and request fields; keep validation errors next to the fields they describe.",
                missing.join(", ")
            ),
            vec![format!("Resolve missing fields: {}.", missing.join(", "))],
            CIVICACCESS_DISCLAIMER.to_string(),
        ))
    }
}

fn civicaccess_publishing_workflow(
    state: &mut CityWorkState,
    payload: Option<&Value>,
) -> Result<(String, Vec<String>, String), String> {
    let title = payload_optional_string_with_cap(payload, "title", 500)?;
    let has_review = payload_bool(payload, "hasReview");
    let has_plain_language = payload_bool(payload, "hasPlainLanguage");
    let has_translation_review = payload_bool(payload, "hasTranslationReview");
    let mut blockers: Vec<&str> = Vec::new();
    if title.trim().is_empty() {
        blockers.push("missing-publication-title");
    }
    if !has_review {
        blockers.push("missing-accessibility-review");
    }
    if !has_plain_language {
        blockers.push("missing-plain-language-summary");
    }
    if !has_translation_review {
        blockers.push("missing-translation-review");
    }
    let status = if blockers.is_empty() {
        "publication-workflow-created"
    } else {
        "blocked"
    };
    let display_title = if title.trim().is_empty() {
        "(untitled publication)".to_string()
    } else {
        title.clone()
    };
    civicaccess_record_audit(state, "publishing.plan", None, "staff");
    push_audit(
        state,
        "civicaccess",
        "civicaccess-publishing-workflow",
        format!(
            "Publishing workflow for {display_title}: {status} ({} blocker(s)).",
            blockers.len()
        ),
    );
    if blockers.is_empty() {
        Ok((
            format!(
                "Publishing workflow for {display_title}: publication-workflow-created. Steps: run accessibility review and resolve high-severity findings; attach plain-language summary; route multilingual variants to a qualified human reviewer; package the accessible export and retention record; record staff approval before publication."
            ),
            vec!["Record staff approval before publication.".to_string()],
            CIVICACCESS_DISCLAIMER.to_string(),
        ))
    } else {
        Ok((
            format!(
                "Publishing workflow for {display_title}: blocked. Complete each blocker before publication: {}.",
                blockers.join(", ")
            ),
            vec![format!("Complete each blocker before publication: {}.", blockers.join(", "))],
            CIVICACCESS_DISCLAIMER.to_string(),
        ))
    }
}

fn civicaccess_ada_title_ii(
    state: &mut CityWorkState,
    payload: Option<&Value>,
) -> Result<(String, Vec<String>, String), String> {
    let service_area = friendly_required(
        payload_string_with_cap(payload, "serviceArea", 500),
        "Name the public service, program, or activity being reviewed.",
    )?;
    let has_coordinator_review = payload_bool(payload, "hasCoordinatorReview");
    let status = if has_coordinator_review {
        "review-support-package-created"
    } else {
        "needs-staff-review"
    };
    civicaccess_record_audit(state, "ada_title_ii.plan", None, "staff");
    push_audit(
        state,
        "civicaccess",
        "civicaccess-ada-title-ii",
        format!("ADA Title II review-support plan for {service_area}: {status}."),
    );
    if has_coordinator_review {
        Ok((
            format!(
                "ADA Title II review-support package created for {service_area}. Service area named; access needs and alternate formats checked; coordinator or qualified staff review recorded; remediation notes preserved."
            ),
            vec!["Preserve remediation notes with the publication record.".to_string()],
            CIVICACCESS_DISCLAIMER.to_string(),
        ))
    } else {
        Ok((
            format!(
                "ADA Title II review for {service_area}: needs-staff-review. Confirm communication access needs and alternate formats; record ADA coordinator or qualified staff review; preserve remediation notes with the publication record."
            ),
            vec!["Record ADA coordinator or qualified staff review.".to_string()],
            CIVICACCESS_DISCLAIMER.to_string(),
        ))
    }
}

fn civicaccess_tagged_pdf(
    state: &mut CityWorkState,
    payload: Option<&Value>,
) -> Result<(String, Vec<String>, String), String> {
    let raw_levels = payload_text_list_with_cap(payload, "headingLevels", 200, 50)?;
    if raw_levels.is_empty() {
        let status = "needs-headings";
        civicaccess_record_audit(state, "tagged_pdf.plan", None, "staff");
        push_audit(
            state,
            "civicaccess",
            "civicaccess-tagged-pdf",
            format!("Tagged-PDF expectation plan: {status} (no heading levels provided)."),
        );
        return Ok((
            "Tagged-PDF plan: needs-headings. Add one H1 for the document title; use H2 and H3 headings in reading order; confirm PDF tags preserve the same heading order.".to_string(),
            vec!["Add one H1 for the document title before planning the tagged-PDF export.".to_string()],
            CIVICACCESS_DISCLAIMER.to_string(),
        ));
    }
    let mut levels: Vec<u32> = Vec::with_capacity(raw_levels.len());
    for raw in &raw_levels {
        let parsed = raw
            .parse::<u32>()
            .map_err(|_| format!("Heading level \"{raw}\" must be a whole number."))?;
        levels.push(parsed);
    }
    let starts_at_one = levels.first().copied() == Some(1);
    let skipped = levels
        .windows(2)
        .any(|window| window[1] > window[0] && window[1] - window[0] > 1);
    let status = if starts_at_one && !skipped {
        "tagged-pdf-plan-created"
    } else {
        "needs-fixes"
    };
    civicaccess_record_audit(state, "tagged_pdf.plan", None, "staff");
    push_audit(
        state,
        "civicaccess",
        "civicaccess-tagged-pdf",
        format!(
            "Tagged-PDF expectation plan: {status} (heading sequence: {}).",
            levels
                .iter()
                .map(u32::to_string)
                .collect::<Vec<_>>()
                .join(", ")
        ),
    );
    if status == "tagged-pdf-plan-created" {
        Ok((
            "Tagged-PDF plan created. Heading order starts at H1; no heading levels are skipped; PDF tags and reading order must be verified before publication.".to_string(),
            vec!["Verify tag order in the exported PDF before publication.".to_string()],
            CIVICACCESS_DISCLAIMER.to_string(),
        ))
    } else {
        Ok((
            "Tagged-PDF plan: needs-fixes. Start with one H1; do not skip heading levels; verify tag order in the exported PDF before publication.".to_string(),
            vec!["Start with one H1 and do not skip heading levels.".to_string()],
            CIVICACCESS_DISCLAIMER.to_string(),
        ))
    }
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
    action: &str,
    payload: Option<&Value>,
) -> Result<CityWorkActionResult, String> {
    let _rmw_guard = city_work_write_lock()
        .lock()
        .map_err(|_| "City workflow lock was poisoned; restart Townlight.".to_string())?;
    let mut state = read_state()?;
    let pre_demo_state = (action == "load-demo-town").then(|| state.clone());
    let mut search_results = Vec::new();
    let mut next_steps: Vec<String> = Vec::new();
    let mut disclaimer = String::new();
    let message = match action {
        "create-meeting-body" => create_meeting_body(&mut state, payload)?,
        "add-meeting-member" => add_meeting_member(&mut state, payload)?,
        "create-meeting" => create_meeting(&mut state, payload)?,
        "add-agenda-item" => add_agenda_item(&mut state, payload)?,
        "submit-agenda-intake" => submit_agenda_intake(&mut state, payload)?,
        "review-agenda-intake" => review_agenda_intake(&mut state, payload)?,
        "promote-agenda-intake" => promote_agenda_intake(&mut state, payload)?,
        "record-staff-report" => record_staff_report(&mut state, payload)?,
        "add-meeting-attachment" => add_meeting_attachment(&mut state, payload)?,
        "finalize-meeting-packet" => finalize_meeting_packet(&mut state, payload)?,
        "add-code-handoff-agenda" => add_code_handoff_agenda(&mut state, payload)?,
        "calculate-notice-deadline" => calculate_notice_deadline(&mut state, payload)?,
        "complete-notice-checklist" => complete_notice_checklist(&mut state, payload)?,
        "post-notice" => post_notice(&mut state, payload)?,
        "civicnotice-calculate-deadline" => calculate_notice_deadline(&mut state, payload)?,
        "civicnotice-complete-checklist" => complete_notice_checklist(&mut state, payload)?,
        "civicnotice-post-notice" => post_notice(&mut state, payload)?,
        "civicnotice-export-archive-packet" => export_notice_archive_packet(&mut state, payload)?,
        "accessibility-review" => {
            let (text, steps, disc) = accessibility_review(&mut state, payload)?;
            next_steps = steps;
            disclaimer = disc;
            text
        }
        "civicaccess-records-export" => {
            let (text, steps, disc) = civicaccess_records_export(&mut state, payload)?;
            next_steps = steps;
            disclaimer = disc;
            text
        }
        "civicaccess-delete-review" => {
            let (text, steps, disc) = civicaccess_delete_review(&mut state, payload)?;
            next_steps = steps;
            disclaimer = disc;
            text
        }
        "civicaccess-plain-language" => {
            let (text, steps, disc) = civicaccess_plain_language(&mut state, payload)?;
            next_steps = steps;
            disclaimer = disc;
            text
        }
        "civicaccess-language-variant" => {
            let (text, steps, disc) = civicaccess_language_variant(&mut state, payload)?;
            next_steps = steps;
            disclaimer = disc;
            text
        }
        "civicaccess-form-plan" => {
            let (text, steps, disc) = civicaccess_form_plan(&mut state, payload)?;
            next_steps = steps;
            disclaimer = disc;
            text
        }
        "civicaccess-publishing-workflow" => {
            let (text, steps, disc) = civicaccess_publishing_workflow(&mut state, payload)?;
            next_steps = steps;
            disclaimer = disc;
            text
        }
        "civicaccess-ada-title-ii" => {
            let (text, steps, disc) = civicaccess_ada_title_ii(&mut state, payload)?;
            next_steps = steps;
            disclaimer = disc;
            text
        }
        "civicaccess-tagged-pdf" => {
            let (text, steps, disc) = civicaccess_tagged_pdf(&mut state, payload)?;
            next_steps = steps;
            disclaimer = disc;
            text
        }
        "record-minutes" => record_minutes(&mut state, payload)?,
        "record-motion" => record_motion(&mut state, payload)?,
        "add-minute-citation" => add_minute_citation(&mut state, payload)?,
        "suggest-minutes-draft" => suggest_minutes_draft(&mut state, payload)?,
        "record-vote" => record_vote(&mut state, payload)?,
        "record-member-vote" => record_member_vote(&mut state, payload)?,
        "record-meeting-attendance" => record_meeting_attendance(&mut state, payload)?,
        "record-quorum-check" => record_quorum_check(&mut state, payload)?,
        "add-action-item" => add_action_item(&mut state, payload)?,
        "record-resident-comment" => record_resident_comment(&mut state, payload)?,
        "submit-public-comment" => submit_public_comment(&mut state, payload)?,
        "review-public-comment" => review_public_comment(&mut state, payload)?,
        "redact-public-comment" => redact_public_comment(&mut state, payload)?,
        "adopt-minutes" => adopt_minutes(&mut state, payload)?,
        "sign-minutes" => sign_minutes(&mut state, payload)?,
        "record-adopted-legislation" => record_adopted_legislation(&mut state, payload)?,
        "record-closed-session" => record_closed_session(&mut state, payload)?,
        "export-meeting-packet" => export_meeting_packet(&mut state, payload)?,
        "archive-meeting" => archive_meeting(&mut state, payload)?,
        "load-demo-town" => load_demo_town(&mut state)?,
        "create-records-request" => create_records_request(&mut state, payload)?,
        "submit-public-records-request" => submit_public_records_request(&mut state, payload)?,
        "lookup-public-records-request" => return public_records_status_lookup(&state, payload),
        "add-public-records-message" => return add_public_records_message(&mut state, payload),
        "set-records-deadline" => set_records_deadline(&mut state, payload)?,
        "calculate-records-deadline" => calculate_records_deadline(&mut state, payload)?,
        "request-records-clarification" => request_records_clarification(&mut state, payload)?,
        "add-records-message" => add_records_message(&mut state, payload)?,
        "assign-records-request" => assign_records_request(&mut state, payload)?,
        "record-records-search" => record_records_search(&mut state, payload)?,
        "record-records-search-session" => record_records_search_session(&mut state, payload)?,
        "add-records-document" => add_records_document(&mut state, payload)?,
        "add-records-release-copy" => add_records_release_copy(&mut state, payload)?,
        "add-records-exemption-review" => add_records_exemption_review(&mut state, payload)?,
        "add-records-exemption-decision" => add_records_exemption_decision(&mut state, payload)?,
        "estimate-records-fee" => estimate_records_fee(&mut state, payload)?,
        "add-records-fee-line" => add_records_fee_line(&mut state, payload)?,
        "waive-records-fee" => waive_records_fee(&mut state, payload)?,
        "suggest-records-response" => suggest_records_response(&mut state, payload)?,
        "draft-records-response" => draft_records_response(&mut state, payload)?,
        "approve-records-response" => approve_records_response(&mut state, payload)?,
        "build-records-release-package" => build_records_release_package(&mut state, payload)?,
        "export-records-response" => export_records_response(&mut state, payload)?,
        "fulfill-records-request" => fulfill_records_request(&mut state, payload)?,
        "close-records-request" => close_records_request(&mut state, payload)?,
        "mark-notification-sent" => mark_notification_sent(&mut state, payload)?,
        "open-exports-folder" => open_exports_folder(payload)?,
        "import-code-source" => import_code_source(&mut state, payload)?,
        "record-codifier-sync" => record_codifier_sync(&mut state, payload)?,
        "record-codifier-sync-failure" => record_codifier_sync_failure(&mut state, payload)?,
        "retry-codifier-sync" => retry_codifier_sync(&mut state, payload)?,
        "mark-code-stale" => mark_code_stale(&mut state, payload)?,
        "suggest-code-guidance" => suggest_code_guidance(&mut state, payload)?,
        "draft-code-guidance" => draft_code_guidance(&mut state, payload)?,
        "approve-code-guidance" => approve_code_guidance(&mut state, payload)?,
        "publish-code-source" => publish_code_source(&mut state, payload)?,
        "unpublish-code-source" => unpublish_code_source(&mut state, payload)?,
        "create-code-handoff" => create_code_handoff(&mut state, payload)?,
        "answer-code-question" => {
            let query = payload_string(payload, "query")?;
            let public_only = payload_bool(payload, "publicOnly");
            search_results = answer_code_question(&state, &query, public_only);
            push_audit(
                &mut state,
                "civiccode",
                "answer-code-question",
                format!(
                    "Answered {}code question with {} cited result(s): {query}",
                    if public_only { "public " } else { "staff " },
                    search_results.len()
                ),
            );
            if search_results.is_empty() {
                "No current cited code source matched the question. Import, sync, publish, or refine source text before answering.".to_string()
            } else {
                "CivicCode answer generated from local cited source text.".to_string()
            }
        }
        "search-city-knowledge" => {
            let query = payload_string(payload, "query")?;
            search_results = search_city_work(&state, &query);
            push_audit(
                &mut state,
                "civiccore",
                "search-city-knowledge",
                format!("Searched local city knowledge for: {query}"),
            );
            "Local search completed across meetings, records, and code.".to_string()
        }
        _ => return Err(format!("Unsupported city workflow action: {action}")),
    };
    // Approval covers the reviewed content, not the request forever. Only
    // successful edits reach this point; failed generation leaves approval and
    // artifact references untouched. Historical exports are never deleted.
    if matches!(
        action,
        "set-records-deadline"
            | "calculate-records-deadline"
            | "request-records-clarification"
            | "add-records-message"
            | "assign-records-request"
            | "record-records-search"
            | "record-records-search-session"
            | "add-records-document"
            | "add-records-release-copy"
            | "add-records-exemption-review"
            | "add-records-exemption-decision"
            | "estimate-records-fee"
            | "add-records-fee-line"
            | "waive-records-fee"
            | "suggest-records-response"
            | "draft-records-response"
    ) {
        let request = selected_record_mut(&mut state, payload)?;
        invalidate_records_release(request)?;
    }
    write_state(&state)?;
    if action == "load-demo-town" {
        state = verify_or_restore_demo_state(
            pre_demo_state
                .as_ref()
                .ok_or_else(|| "The pre-load demo state is unavailable.".to_string())?,
        )?;
    }
    Ok(CityWorkActionResult {
        accepted: true,
        action: action.to_string(),
        status: "Saved",
        message,
        next_action: "Continue the workflow or review the audit trail.".to_string(),
        state,
        search_results,
        next_steps,
        disclaimer,
    })
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

    // --- T1: torn/corrupt config surfaces an error, never a pristine reset ---
    // CityWorkState does not derive Debug, so we cannot format!("{state:?}") it.
    // The load-bearing assertion is that a corrupt-but-present file is an Err
    // (parse error), NOT an Ok(default) — that silent-default behavior IS the
    // data-loss bug C2 fixes.
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
    fn demo_town_loads_only_after_verified_backup_and_is_visibly_marked() {
        with_temp_state_dir(|_root| {
            let result = city_work_action("load-demo-town", None).expect("demo fixture loads");
            let marker = result
                .state
                .demo_fixture
                .as_ref()
                .expect("demo marker persists");
            assert_eq!(marker.fixture_id, crate::demo_fixture::FIXTURE_ID);
            assert_eq!(marker.fixture_sha256, crate::demo_fixture::FIXTURE_SHA256);
            assert_eq!(result.state.records_requests.len(), 1);
            assert_eq!(result.state.records_requests[0].search_sessions.len(), 2);
            assert_eq!(
                result.state.records_requests[0].search_sessions[0].query,
                "trail maintenance schedule"
            );
            assert_eq!(
                result.state.records_requests[0].search_sessions[0]
                    .results
                    .iter()
                    .map(|result| result.id.as_str())
                    .collect::<Vec<_>>(),
                ["rv-record-council-0001", "rv-record-trails-0001"]
            );
            assert_eq!(
                result.state.records_requests[0].search_sessions[1].query,
                "utility sampling"
            );
            assert!(result.state.records_requests[0]
                .summary
                .contains(crate::demo_fixture::WATERMARK));
            assert!(result.state.audit_entries.iter().any(|entry| {
                entry.action == "load-demo-town"
                    && entry.summary.contains(crate::demo_fixture::FIXTURE_SHA256)
            }));
            let backups = fs::read_dir(crate::local_paths::backup_root())
                .expect("backup root exists")
                .filter_map(Result::ok)
                .collect::<Vec<_>>();
            assert!(!backups.is_empty(), "a verified pre-load backup must exist");
        });
    }

    #[test]
    fn demo_town_import_is_idempotent() {
        with_temp_state_dir(|_root| {
            let first = city_work_action("load-demo-town", None).expect("first load succeeds");
            let first_marker = first
                .state
                .demo_fixture
                .as_ref()
                .expect("first marker persists")
                .clone();
            let first_audit_count = first.state.audit_entries.len();
            let first_backup_count = fs::read_dir(crate::local_paths::backup_root())
                .expect("backup root exists")
                .filter_map(Result::ok)
                .count();

            let second = city_work_action("load-demo-town", None).expect("repeat load is safe");
            assert!(second.message.contains("already loaded"));
            assert_eq!(second.state.records_requests.len(), 1);
            let second_marker = second
                .state
                .demo_fixture
                .as_ref()
                .expect("repeat marker persists");
            assert_eq!(
                second_marker.loaded_at_unix_seconds,
                first_marker.loaded_at_unix_seconds
            );
            assert_eq!(second.state.audit_entries.len(), first_audit_count);
            let second_backup_count = fs::read_dir(crate::local_paths::backup_root())
                .expect("backup root still exists")
                .filter_map(Result::ok)
                .count();
            assert_eq!(second_backup_count, first_backup_count);
        });
    }

    #[test]
    fn demo_town_verification_failure_restores_prior_state() {
        with_temp_state_dir(|_root| {
            let mut previous = CityWorkState::default();
            submit_public_records_request(
                &mut previous,
                Some(&records_payload(
                    "Existing requester",
                    "Existing real city work",
                )),
            )
            .expect("prior request is created");
            let previous_request_id = previous.records_requests[0].id.clone();
            write_state(&previous).expect("prior state writes");

            let mut invalid_demo_state = CityWorkState::default();
            invalid_demo_state.demo_fixture = Some(crate::demo_fixture::DemoFixtureMarker {
                fixture_id: crate::demo_fixture::FIXTURE_ID.to_string(),
                fixture_version: crate::demo_fixture::FIXTURE_VERSION.to_string(),
                fixture_sha256: "invalid-hash".to_string(),
                municipality_name: crate::demo_fixture::FIXTURE_NAME.to_string(),
                watermark: crate::demo_fixture::WATERMARK.to_string(),
                loaded_at_unix_seconds: now_unix_seconds(),
            });
            write_state(&invalid_demo_state).expect("invalid persisted state writes");

            let error = match verify_or_restore_demo_state(&previous) {
                Ok(_) => panic!("invalid demo state must fail verification"),
                Err(error) => error,
            };
            assert!(error.contains("prior state was restored"));
            let restored = read_state().expect("restored state reads");
            assert!(restored.demo_fixture.is_none());
            assert_eq!(restored.records_requests.len(), 1);
            assert_eq!(restored.records_requests[0].id, previous_request_id);
        });
    }

    #[test]
    fn demo_town_records_exports_have_explicit_fixture_identity() {
        with_temp_state_dir(|_root| {
            let mut state = city_work_action("load-demo-town", None)
                .expect("demo fixture loads")
                .state;
            let request = state
                .records_requests
                .first_mut()
                .expect("demo request exists");
            request.response_draft = "Synthetic response approved for demo export.".to_string();
            request.approved_at_unix_seconds = Some(now_unix_seconds());
            request.exemption_decisions.push(RecordsExemptionDecision {
                id: "rv-exemption-decision-0001".to_string(),
                source: "rv-record-council-0001".to_string(),
                kind: "synthetic ground truth".to_string(),
                finding: "Independently authored fictional record is releasable.".to_string(),
                decision: "release".to_string(),
                basis: "Fictional demonstration policy only".to_string(),
                reviewer: "Synthetic human-review fixture".to_string(),
                created_at_unix_seconds: now_unix_seconds(),
            });

            build_records_release_package(&mut state, None).expect("demo package builds");
            export_records_response(&mut state, None).expect("demo response exports");

            let request = state
                .records_requests
                .first()
                .expect("demo request remains");
            let package = fs::read_to_string(&request.release_packages[0].export_path)
                .expect("demo package reads");
            let response =
                fs::read_to_string(&request.exports[0]).expect("demo response export reads");
            for exported in [&package, &response] {
                assert!(exported.contains("## Demo Fixture Identity"));
                assert!(exported.contains(crate::demo_fixture::FIXTURE_NAME));
                assert!(exported.contains(crate::demo_fixture::FIXTURE_SHA256));
                assert!(exported.contains(crate::demo_fixture::WATERMARK));
            }
        });
    }

    #[test]
    fn demo_town_refuses_to_overwrite_existing_city_work() {
        with_temp_state_dir(|_root| {
            city_work_action(
                "submit-public-records-request",
                Some(&records_payload("existing", "Existing real city work")),
            )
            .expect("existing request saves");
            let error = city_work_action("load-demo-town", None)
                .err()
                .expect("non-empty state must be rejected");
            assert!(error.contains("only be loaded into an empty local profile"));
            let state = city_work_state().expect("existing state remains readable");
            assert!(state.demo_fixture.is_none());
            assert_eq!(state.records_requests.len(), 1);
            assert_eq!(state.records_requests[0].requester, "existing");
        });
    }

    // --- T3: GENUINELY CONCURRENT no-lost-update (proves the C3.3 in-process
    // write lock). A sequential test would NOT prove this; without
    // city_work_write_lock these two RMW cycles race and len() == 1. ---
    fn records_payload(requester: &str, summary: &str) -> Value {
        serde_json::json!({
            "requester": requester,
            "requesterContact": format!("{requester}@example.test"),
            "summary": summary,
        })
    }

    #[test]
    fn concurrent_city_work_actions_do_not_lose_updates() {
        with_temp_state_dir(|_root| {
            use std::thread;
            let a = thread::spawn(|| {
                city_work_action(
                    "submit-public-records-request",
                    Some(&records_payload("alice", "Budget records for FY26")),
                )
                .unwrap()
            });
            let b = thread::spawn(|| {
                city_work_action(
                    "submit-public-records-request",
                    Some(&records_payload("bob", "Council emails for March")),
                )
                .unwrap()
            });
            a.join().unwrap();
            b.join().unwrap();
            let state = read_state().unwrap();
            assert_eq!(
                state.records_requests.len(),
                2,
                "both concurrent writers' records must survive (single-writer-within-process invariant)"
            );
        });
    }

    fn create_city_council_body() -> String {
        let body = serde_json::json!({
            "meetingBodyName": "City Council",
            "meetingBodyType": "legislative",
            "meetingBodyStatutoryBasis": "City Charter Section 2.1",
            "meetingBodyCadence": "First and third Wednesday",
            "meetingBodyDefaultNoticeDays": "3",
            "meetingBodyQuorumRule": "majority of seated members"
        });
        city_work_action("create-meeting-body", Some(&body)).expect("meeting body saved");
        city_work_state()
            .expect("state reads after meeting body")
            .meeting_bodies
            .first()
            .expect("meeting body exists")
            .id
            .clone()
    }

    #[test]
    fn city_work_state_backfills_adopted_legislation_index_from_meetings() {
        with_temp_state_dir(|_| {
            let record = AdoptedLegislationRecord {
                id: "adopted-legislation-test-1".to_string(),
                code_source_id: "code-source-test-1".to_string(),
                meeting_id: "meeting-test-1".to_string(),
                meeting_title: "Council adoption".to_string(),
                legislation_type: "ordinance".to_string(),
                title: "Noise ordinance".to_string(),
                text: "Adopted ordinance text.".to_string(),
                effective_date: "2026-07-15".to_string(),
                codification_section_hint: "Title 8".to_string(),
                source_motion_id: "motion-test-1".to_string(),
                source_motion_text: "Move to adopt the noise ordinance.".to_string(),
                source_agenda_item_id: "agenda-test-1".to_string(),
                source_agenda_item_title: "Noise ordinance adoption".to_string(),
                handoff_status: "pending CivicCode sync".to_string(),
                created_at_unix_seconds: 100,
            };
            let state = CityWorkState {
                meetings: vec![Meeting {
                    id: "meeting-test-1".to_string(),
                    body_id: "body-test-1".to_string(),
                    body_name: "City Council".to_string(),
                    title: "Council adoption".to_string(),
                    meeting_date: "2026-07-01".to_string(),
                    status: "adopted legislation recorded".to_string(),
                    notice_status: "public notice ready".to_string(),
                    notice_checklists: Vec::new(),
                    notice_postings: Vec::new(),
                    summary: "Adoption meeting".to_string(),
                    agenda_items: Vec::new(),
                    staff_reports: Vec::new(),
                    attachments: Vec::new(),
                    packet_assemblies: Vec::new(),
                    minutes: "Minutes adopted and signed.".to_string(),
                    minute_citations: Vec::new(),
                    motions: Vec::new(),
                    member_votes: Vec::new(),
                    attendance_records: Vec::new(),
                    quorum_checks: Vec::new(),
                    votes: Vec::new(),
                    action_items: Vec::new(),
                    action_records: Vec::new(),
                    adopted_legislation: vec![record.clone()],
                    closed_sessions: Vec::new(),
                    resident_comments: Vec::new(),
                    public_comments: Vec::new(),
                    exports: Vec::new(),
                    export_bundles: Vec::new(),
                    minutes_adopted_at_unix_seconds: Some(90),
                    minutes_signed_by: "City Clerk".to_string(),
                    minutes_signature_attestation: "Signed".to_string(),
                    minutes_signed_at_unix_seconds: Some(95),
                    archived_at_unix_seconds: None,
                    created_at_unix_seconds: 80,
                }],
                ..CityWorkState::default()
            };
            write_state(&state).expect("state writes with nested adopted legislation");

            let reloaded = city_work_state().expect("state reads with normalized index");
            assert_eq!(reloaded.adopted_legislation.len(), 1);
            assert_eq!(reloaded.adopted_legislation[0].id, record.id);
            assert_eq!(reloaded.adopted_legislation[0].title, "Noise ordinance");
            let persisted: Value = serde_json::from_str(
                &fs::read_to_string(workflows_path()).expect("normalized state persisted"),
            )
            .expect("persisted state remains json");
            assert_eq!(
                persisted["adopted_legislation"]
                    .as_array()
                    .expect("top-level adopted legislation remains an array")
                    .len(),
                1
            );
        });
    }

    fn assert_valid_audit_chain(entries: &[AuditEntry]) {
        assert!(!entries.is_empty());
        for (index, entry) in entries.iter().enumerate() {
            let expected_previous = if index == 0 {
                "GENESIS".to_string()
            } else {
                entries[index - 1].entry_hash.clone()
            };
            assert_eq!(entry.previous_hash, expected_previous);
            assert_eq!(entry.entry_hash.len(), 64);
            assert_eq!(
                entry.entry_hash,
                audit_entry_hash(
                    &entry.previous_hash,
                    &entry.id,
                    &entry.module_id,
                    &entry.action,
                    &entry.summary,
                    entry.created_at_unix_seconds
                )
            );
        }
    }

    fn assert_export_integrity_manifest(export_path: &str, contents: &str) {
        let export_path = PathBuf::from(export_path);
        let manifest_path = export_manifest_path(&export_path);
        assert!(manifest_path.is_file());
        let manifest: serde_json::Value =
            serde_json::from_str(&fs::read_to_string(manifest_path).expect("manifest reads"))
                .expect("manifest parses");
        let expected_export_path = export_path.to_string_lossy().to_string();
        let expected_hash = hash_public_payload(contents);
        assert_eq!(manifest["schema_version"].as_u64(), Some(1));
        assert_eq!(
            manifest["export_path"].as_str(),
            Some(expected_export_path.as_str())
        );
        assert_eq!(manifest["format"].as_str(), Some("markdown"));
        assert_eq!(manifest["size_bytes"].as_u64(), Some(contents.len() as u64));
        assert_eq!(manifest["sha256"].as_str(), Some(expected_hash.as_str()));
        assert_eq!(
            manifest["generated_by"].as_str(),
            Some("Townlight Windows Local")
        );
    }

    #[test]
    fn civicnotice_actions_save_notice_workpaper_and_search_result() {
        with_temp_state_dir(|_| {
            city_work_action(
                "create-meeting-body",
                Some(&serde_json::json!({
                    "meetingBodyName": "City Council",
                    "meetingBodyType": "legislative",
                    "meetingBodyStatutoryBasis": "Charter Section 2",
                    "meetingBodyCadence": "first Tuesday",
                    "meetingBodyDefaultNoticeDays": "3",
                    "meetingBodyQuorumRule": "majority of seated members"
                })),
            )
            .expect("body created");
            city_work_action(
                "create-meeting",
                Some(&serde_json::json!({
                    "title": "CivicNotice public hearing",
                    "meetingDate": "2026-08-04",
                    "summary": "Notice module integration hearing",
                    "agendaTitle": "Public hearing notice"
                })),
            )
            .expect("meeting created");
            let state = city_work_state().expect("state reads");
            let meeting_id = state.meetings[0].id.clone();
            city_work_action(
                "civicnotice-complete-checklist",
                Some(&serde_json::json!({
                    "meetingId": meeting_id,
                    "noticeMeetingType": "Regular council meeting",
                    "noticeStatutoryBasis": "Municipal open meetings notice",
                    "noticeDeadline": "2026-08-01",
                    "noticeTimeZone": "America/Denver",
                    "noticeHumanApproval": true
                })),
            )
            .expect("notice checklist saved");
            let state = city_work_state().expect("state reads after checklist");
            city_work_action(
                "civicnotice-post-notice",
                Some(&serde_json::json!({
                    "meetingId": state.meetings[0].id,
                    "postingLocation": "City Hall bulletin board and city website",
                    "postingMethod": "Posted PDF and clerk attestation",
                    "postingConfirmation": "Screenshot hash DIR-NOTICE-001",
                    "postingDate": "2026-08-01"
                })),
            )
            .expect("posting proof saved");
            city_work_action(
                "civicnotice-export-archive-packet",
                Some(&serde_json::json!({
                    "meetingId": state.meetings[0].id
                })),
            )
            .expect("notice archive packet exported");
            let state = city_work_state().expect("state reads after notice");
            let meeting = &state.meetings[0];
            assert_eq!(meeting.notice_checklists.len(), 1);
            assert_eq!(meeting.notice_postings.len(), 1);
            assert_eq!(meeting.exports.len(), 1);
            assert_eq!(meeting.export_bundles.len(), 1);
            assert_eq!(meeting.notice_status, "public notice ready");
            let export_path = PathBuf::from(&meeting.exports[0]);
            assert!(export_path.is_file());
            assert_eq!(
                export_path.parent().and_then(|path| path.file_name()),
                Some(std::ffi::OsStr::new("notice"))
            );
            let packet = fs::read_to_string(&meeting.exports[0]).expect("notice packet reads");
            assert!(packet.contains("## Notice Checklist"));
            assert!(packet.contains("Municipal open meetings notice"));
            assert!(packet.contains("## Notice Posting Evidence"));
            assert!(packet.contains("Screenshot hash DIR-NOTICE-001"));
            assert!(!packet.contains("closed-session"));
            let bundle = &meeting.export_bundles[0];
            assert!(bundle.public_record);
            assert_eq!(bundle.notice_checklist_count, 1);
            assert_eq!(bundle.notice_posting_count, 1);
            let manifest: serde_json::Value = serde_json::from_str(
                &fs::read_to_string(&bundle.manifest_path).expect("notice manifest reads"),
            )
            .expect("notice manifest parses");
            assert_eq!(
                manifest["bundle_type"].as_str(),
                Some("civicnotice-notice-archive-packet")
            );
            assert_eq!(manifest["counts"]["notice_postings"].as_u64(), Some(1));
            let results = search_city_work(&state, "DIR-NOTICE-001");
            assert!(results.iter().any(|result| {
                result.module_id == "civicnotice"
                    && result.title.contains("CivicNotice public hearing")
            }));
        });
    }

    #[test]
    fn civicaccess_audit_events_fifo_cap_holds_at_boundary_and_ids_stay_unique() {
        // QA-2 (round 2): the FIFO cap on state.access.audit_events had no
        // permanent regression test. Push well past the cap directly against
        // an in-memory state (no file I/O -- this isn't exercising city-work.json
        // persistence, just the cap/eviction/id-generation logic in isolation).
        let mut state = CityWorkState::default();
        for _ in 0..(CIVICACCESS_MAX_AUDIT_EVENTS + 50) {
            civicaccess_record_audit(&mut state, "test.push", None, "staff");
        }
        assert_eq!(
            state.access.audit_events.len(),
            CIVICACCESS_MAX_AUDIT_EVENTS
        );
        let unique_ids: std::collections::HashSet<&str> = state
            .access
            .audit_events
            .iter()
            .map(|event| event.event_id.as_str())
            .collect();
        assert_eq!(
            unique_ids.len(),
            CIVICACCESS_MAX_AUDIT_EVENTS,
            "every retained event_id must be unique even after the cap stabilizes the vec length"
        );
    }

    #[test]
    fn civicaccess_actions_save_review_export_and_emit_deterministic_findings() {
        with_temp_state_dir(|_| {
            // Empty title + body + no alt + non-English → 4 deterministic findings.
            let message_a = city_work_action(
                "accessibility-review",
                Some(&serde_json::json!({
                    "title": "",
                    "body": "",
                    "hasAltText": false,
                    "language": "es"
                })),
            )
            .expect("accessibility review saved");
            assert!(message_a.message.contains("needs-fixes"));

            // A clean publication: passes-sample-checks, zero findings.
            let message_b = city_work_action(
                "accessibility-review",
                Some(&serde_json::json!({
                    "title": "Water main repair notice",
                    "body": "The city water department will repair a main on Tuesday morning.",
                    "hasAltText": true,
                    "language": "en"
                })),
            )
            .expect("clean accessibility review saved");
            assert!(message_b.message.contains("passes-sample-checks"));

            let state = city_work_state().expect("state reads after reviews");
            assert_eq!(state.access.reviews.len(), 2);
            let needs_fixes = state
                .access
                .reviews
                .iter()
                .find(|review| review.status == "needs-fixes")
                .expect("needs-fixes review persists");
            // Empty-body + empty-title + no-alt + non-English → exactly 4 findings (long-copy is body-length based).
            assert_eq!(needs_fixes.findings.len(), 4);
            let codes: Vec<&str> = needs_fixes
                .findings
                .iter()
                .map(|f| f.code.as_str())
                .collect();
            assert!(codes.contains(&"missing-title"));
            assert!(codes.contains(&"missing-body"));
            assert!(codes.contains(&"missing-alt-text"));
            assert!(codes.contains(&"language-confirmation"));

            let passes = state
                .access
                .reviews
                .iter()
                .find(|review| review.status == "passes-sample-checks")
                .expect("passes-sample-checks review persists");
            assert!(passes.findings.is_empty());
            assert!(!passes.disclaimer.is_empty(), "disclaimer always present");

            // Records-export against the passes-sample-checks review ID.
            // v1.0.2 shipped an export that only *said* it prepared an artifact:
            // this test asserted the message and nothing else, so the missing
            // write went unnoticed. Assert the file on disk, not the sentence.
            let review_id = passes.review_id.clone();
            let export_message = city_work_action(
                "civicaccess-records-export",
                Some(&serde_json::json!({"reviewId": review_id})),
            )
            .expect("records-export written");
            assert!(export_message.message.contains("Records-ready export"));
            assert!(export_message.message.contains("advisory"));
            assert!(!export_message.next_steps.is_empty());
            assert!(!export_message.disclaimer.is_empty());

            let exported: Vec<PathBuf> = fs::read_dir(exports_dir().join("access"))
                .expect("access exports folder exists after export")
                .filter_map(Result::ok)
                .map(|entry| entry.path())
                .collect();
            let artifacts: Vec<&PathBuf> = exported
                .iter()
                .filter(|path| path.extension().and_then(|ext| ext.to_str()) == Some("md"))
                .collect();
            assert_eq!(artifacts.len(), 1, "exactly one export artifact written");
            assert!(
                exported
                    .iter()
                    .any(|path| path.to_string_lossy().ends_with(".sha256.json")),
                "export artifact ships its checksum sidecar"
            );
            let body = fs::read_to_string(artifacts[0]).expect("export artifact readable");
            assert!(
                body.contains(&review_id),
                "artifact names the review it exported"
            );
            assert!(
                body.contains("passes-sample-checks"),
                "artifact carries the review status"
            );
            assert!(
                body.contains("advisory") || body.contains("not a certified"),
                "artifact carries the advisory disclaimer"
            );

            // Plain language: deterministic jargon-map replacement, all six entries
            // plus the title-cased variant of one of them.
            let plain = city_work_action(
                "civicaccess-plain-language",
                Some(&serde_json::json!({
                    "text": "Residents must remit payment prior to the deadline. Pursuant To this notice, work will commence subsequent to approval and terminate at year end."
                })),
            )
            .expect("plain-language rewrite ran");
            assert!(plain.message.contains("pay"));
            assert!(plain.message.contains("before"));
            assert!(
                plain.message.contains("Under"),
                "title-cased jargon mapping"
            );
            assert!(plain.message.contains("start"));
            assert!(plain.message.contains("after"));
            assert!(plain.message.contains("end"));

            // Multilingual variants: es / vi sample, unsupported → placeholder.
            let es = city_work_action(
                "civicaccess-language-variant",
                Some(&serde_json::json!({"text": "Hello", "language": "es"})),
            )
            .expect("es variant ran");
            assert!(es.message.contains("sample-created"));
            let vi = city_work_action(
                "civicaccess-language-variant",
                Some(&serde_json::json!({"text": "Hello", "language": "vi"})),
            )
            .expect("vi variant ran");
            assert!(vi.message.contains("Mau:"));
            let unsupported = city_work_action(
                "civicaccess-language-variant",
                Some(&serde_json::json!({"text": "Hello", "language": "xx"})),
            )
            .expect("unsupported variant ran");
            assert!(unsupported
                .message
                .contains("unsupported-language-placeholder"));

            // Form plan: missing required fields list.
            let bad_form = city_work_action(
                "civicaccess-form-plan",
                Some(&serde_json::json!({
                    "formName": "Records Request",
                    "fields": "name, email"
                })),
            )
            .expect("form plan ran");
            assert!(bad_form.message.contains("needs-fixes"));
            assert!(bad_form.message.contains("contact"));
            assert!(bad_form.message.contains("request"));

            let good_form = city_work_action(
                "civicaccess-form-plan",
                Some(&serde_json::json!({
                    "formName": "Records Request",
                    "fields": "name, contact, request"
                })),
            )
            .expect("good form plan ran");
            assert!(good_form.message.contains("form-plan-created"));

            // Form plan: empty formName is now a structured needs-fixes, not a hard reject.
            let no_name_form = city_work_action(
                "civicaccess-form-plan",
                Some(&serde_json::json!({"fields": "name, contact, request"})),
            )
            .expect("form plan with empty name still runs");
            assert!(no_name_form.message.contains("needs-fixes"));
            assert!(no_name_form.message.contains("form-name"));

            // Publishing workflow blockers when nothing is approved.
            let blocked = city_work_action(
                "civicaccess-publishing-workflow",
                Some(&serde_json::json!({
                    "title": "Meeting notice",
                    "hasReview": false,
                    "hasPlainLanguage": false,
                    "hasTranslationReview": false
                })),
            )
            .expect("publishing workflow ran");
            assert!(blocked.message.contains("blocked"));
            assert!(blocked.message.contains("missing-accessibility-review"));

            // Publishing workflow: empty title is now a structured blocker, not a hard reject.
            let no_title_pub = city_work_action(
                "civicaccess-publishing-workflow",
                Some(&serde_json::json!({
                    "hasReview": false,
                    "hasPlainLanguage": false,
                    "hasTranslationReview": false
                })),
            )
            .expect("publishing workflow with empty title still runs");
            assert!(no_title_pub.message.contains("missing-publication-title"));

            // Publishing workflow happy path: every blocker cleared.
            let pub_created = city_work_action(
                "civicaccess-publishing-workflow",
                Some(&serde_json::json!({
                    "title": "Meeting notice",
                    "hasReview": true,
                    "hasPlainLanguage": true,
                    "hasTranslationReview": true
                })),
            )
            .expect("publishing workflow happy path ran");
            assert!(pub_created.message.contains("publication-workflow-created"));

            // ADA Title II review: missing coordinator → needs-staff-review.
            let ada = city_work_action(
                "civicaccess-ada-title-ii",
                Some(&serde_json::json!({
                    "serviceArea": "Records",
                    "hasCoordinatorReview": false
                })),
            )
            .expect("ada ran");
            assert!(ada.message.contains("needs-staff-review"));

            // ADA Title II review happy path: coordinator review recorded.
            let ada_created = city_work_action(
                "civicaccess-ada-title-ii",
                Some(&serde_json::json!({
                    "serviceArea": "Records",
                    "hasCoordinatorReview": true
                })),
            )
            .expect("ada happy path ran");
            assert!(ada_created
                .message
                .contains("review-support package created"));

            // Tagged PDF: no heading levels at all → needs-headings early-return branch.
            let tagged_empty =
                city_work_action("civicaccess-tagged-pdf", Some(&serde_json::json!({})))
                    .expect("tagged-pdf with empty payload ran");
            assert!(tagged_empty.message.contains("needs-headings"));

            // Tagged PDF: skipped headings → needs-fixes.
            let tagged_bad = city_work_action(
                "civicaccess-tagged-pdf",
                Some(&serde_json::json!({"headingLevels": "1, 3"})),
            )
            .expect("tagged-pdf ran");
            assert!(tagged_bad.message.contains("needs-fixes"));

            // Tagged PDF: out-of-range heading levels (0, 7) no longer hard-reject;
            // they fold into needs-fixes since neither starts the sequence at H1.
            let tagged_zero = city_work_action(
                "civicaccess-tagged-pdf",
                Some(&serde_json::json!({"headingLevels": "0"})),
            )
            .expect("tagged-pdf with level 0 still runs");
            assert!(tagged_zero.message.contains("needs-fixes"));
            let tagged_seven = city_work_action(
                "civicaccess-tagged-pdf",
                Some(&serde_json::json!({"headingLevels": "7"})),
            )
            .expect("tagged-pdf with level 7 still runs");
            assert!(tagged_seven.message.contains("needs-fixes"));

            // Tagged PDF: clean sequence → plan created.
            let tagged_good = city_work_action(
                "civicaccess-tagged-pdf",
                Some(&serde_json::json!({"headingLevels": "1, 2, 3"})),
            )
            .expect("tagged-pdf clean ran");
            assert!(tagged_good.message.contains("Tagged-PDF plan created"));

            // Accessibility review with long copy (>80 words) → long-copy finding.
            let long_body = (0..90).map(|_| "word").collect::<Vec<_>>().join(" ");
            city_work_action(
                "accessibility-review",
                Some(&serde_json::json!({
                    "title": "Long notice",
                    "body": long_body,
                    "hasAltText": true,
                    "language": "en"
                })),
            )
            .expect("long-copy review saved");
            let state_after_long = city_work_state().expect("state reads after long-copy review");
            let long_copy_review = state_after_long
                .access
                .reviews
                .last()
                .expect("long-copy review persists");
            assert!(long_copy_review
                .findings
                .iter()
                .any(|f| f.code == "long-copy"));

            // Delete a saved review: it disappears from the list, and a second
            // delete of the same id now errors (the review is genuinely gone).
            // Uses a dedicated throwaway review, not `passes`, so the
            // search-city-knowledge assertions below still have "Water main" to find.
            city_work_action(
                "accessibility-review",
                Some(&serde_json::json!({
                    "title": "Disposable test review",
                    "body": "Temporary content for the delete-review test.",
                    "hasAltText": true,
                    "language": "en"
                })),
            )
            .expect("disposable review saved");
            let disposable_state = city_work_state().expect("state reads after disposable review");
            let delete_target = disposable_state
                .access
                .reviews
                .last()
                .expect("disposable review persists")
                .review_id
                .clone();
            let deleted = city_work_action(
                "civicaccess-delete-review",
                Some(&serde_json::json!({"reviewId": delete_target})),
            )
            .expect("delete-review ran");
            assert!(deleted.message.contains("deleted"));
            let state_after_delete = city_work_state().expect("state reads after delete-review");
            assert!(!state_after_delete
                .access
                .reviews
                .iter()
                .any(|review| review.review_id == delete_target));
            let delete_again = city_work_action(
                "civicaccess-delete-review",
                Some(&serde_json::json!({"reviewId": delete_target})),
            );
            assert!(delete_again.is_err());
            assert!(delete_again
                .err()
                .unwrap()
                .contains("not in the local store"));

            // R3-WALK-04: explicit id-keyed survivor assertion (not just implicit,
            // via the later search-still-finds-Water-main check) — create three
            // reviews, delete the middle one by id, assert the exact remaining set.
            for title in ["Survivor One", "Delete Me", "Survivor Two"] {
                city_work_action(
                    "accessibility-review",
                    Some(&serde_json::json!({
                        "title": title,
                        "body": "Body text for the survivor-set delete test.",
                        "hasAltText": true,
                        "language": "en"
                    })),
                )
                .expect("survivor-set review saved");
            }
            let before_survivor_delete =
                city_work_state().expect("state reads before survivor-set delete");
            let survivor_reviews: Vec<&StoredAccessibilityReview> = before_survivor_delete
                .access
                .reviews
                .iter()
                .filter(|review| {
                    ["Survivor One", "Delete Me", "Survivor Two"].contains(&review.title.as_str())
                })
                .collect();
            assert_eq!(survivor_reviews.len(), 3);
            let middle_id = survivor_reviews
                .iter()
                .find(|review| review.title == "Delete Me")
                .expect("middle review present")
                .review_id
                .clone();
            city_work_action(
                "civicaccess-delete-review",
                Some(&serde_json::json!({"reviewId": middle_id})),
            )
            .expect("middle review deleted");
            let after_survivor_delete =
                city_work_state().expect("state reads after survivor-set delete");
            let remaining_titles: Vec<&str> = after_survivor_delete
                .access
                .reviews
                .iter()
                .filter(|review| {
                    ["Survivor One", "Delete Me", "Survivor Two"].contains(&review.title.as_str())
                })
                .map(|review| review.title.as_str())
                .collect();
            assert_eq!(remaining_titles, vec!["Survivor One", "Survivor Two"]);

            // Civicaccess audit events accumulated (one per action above + per-review event).
            let state = city_work_state().expect("state reads after civicaccess flow");
            assert!(state.access.audit_events.len() >= 11);
            // And every civicaccess audit event surfaces in the global audit chain too.
            let civicaccess_chain_entries = state
                .audit_entries
                .iter()
                .filter(|entry| entry.module_id == "civicaccess")
                .count();
            assert!(civicaccess_chain_entries >= 11);

            // Validate the persisted accessibility findings carry the documented severity
            // (block-before-publication logic depends on severity, not just code).
            let needs_fixes_2 = state
                .access
                .reviews
                .iter()
                .find(|review| review.status == "needs-fixes")
                .expect("needs-fixes review still present");
            let high_codes: Vec<&str> = needs_fixes_2
                .findings
                .iter()
                .filter(|f| f.severity == "high")
                .map(|f| f.code.as_str())
                .collect();
            assert!(high_codes.contains(&"missing-title"));
            assert!(high_codes.contains(&"missing-body"));
            assert!(high_codes.contains(&"missing-alt-text"));
            let medium_codes: Vec<&str> = needs_fixes_2
                .findings
                .iter()
                .filter(|f| f.severity == "medium")
                .map(|f| f.code.as_str())
                .collect();
            assert!(medium_codes.contains(&"language-confirmation"));

            // Civicaccess reviews surface in the cross-module Search City Knowledge results,
            // matching the civicnotice parity: every persisted record is findable.
            let title_hits = search_city_work(&state, "Water main");
            assert!(title_hits
                .iter()
                .any(|r| r.module_id == "civicaccess" && r.title.contains("Water main")));
            let status_hits = search_city_work(&state, "passes-sample-checks");
            assert!(status_hits.iter().any(|r| r.module_id == "civicaccess"));
            // Body text search hits too (the finding's "missing-body" message).
            let body_hits = search_city_work(&state, "public text is empty");
            assert!(body_hits.iter().any(|r| r.module_id == "civicaccess"));
        });
    }

    // ===== CivicAccess local-AI dual-path coverage =====
    //
    // Each AI-touched feature gets three tests: the AI path (fake model seam
    // set), the not-ready fallback (seam unset; a temp state dir is never
    // model-ready), and the determinism floor. The not-ready class is new
    // suite-wide -- no prior test exercised any AI action with the model
    // absent (the three existing AI features hard-stop there instead of
    // falling back, so they had nothing to assert).

    #[test]
    fn civicaccess_plain_language_uses_local_ai_when_available() {
        with_temp_state_dir(|_| {
            env::set_var(
                "CIVICSUITE_FAKE_MODEL_RESPONSE",
                "Pay before the deadline. Work starts after approval and ends at year end.",
            );
            let plain = city_work_action(
                "civicaccess-plain-language",
                Some(&serde_json::json!({
                    "text": "Residents must remit payment prior to the deadline."
                })),
            );
            env::remove_var("CIVICSUITE_FAKE_MODEL_RESPONSE");
            let plain = plain.expect("AI plain-language draft generated");
            assert!(plain.message.contains("Local AI plain-language draft"));
            assert!(
                plain.message.contains("civicsuite-gemma4-12b-qat:q4_0"),
                "result names the runtime model"
            );
            assert!(plain
                .message
                .contains("human review required before publication"));
            assert!(plain.message.contains("Pay before the deadline."));
            let state = city_work_state().expect("state reads after AI rewrite");
            let audit = state
                .audit_entries
                .last()
                .expect("audit entry written for AI rewrite");
            assert!(audit.summary.contains("Local AI plain-language draft"));
            assert!(audit.summary.contains("civicsuite-gemma4-12b-qat:q4_0"));
            assert!(audit.summary.contains("human review required"));
        });
    }

    #[test]
    fn civicaccess_plain_language_falls_back_when_model_not_ready() {
        with_temp_state_dir(|_| {
            env::remove_var("CIVICSUITE_FAKE_MODEL_RESPONSE");
            let plain = city_work_action(
                "civicaccess-plain-language",
                Some(&serde_json::json!({
                    "text": "Residents must remit payment prior to the deadline."
                })),
            )
            .expect("fallback rewrite still succeeds with no model");
            assert!(
                plain.message.contains("AI engine not ready"),
                "fallback result is explicitly marked"
            );
            assert!(
                plain.message.contains("pay") && plain.message.contains("before"),
                "deterministic jargon-map pass still applied"
            );
            assert!(plain
                .next_steps
                .iter()
                .any(|step| step.contains("System Health")));
            let state = city_work_state().expect("state reads after fallback rewrite");
            let audit = state
                .audit_entries
                .last()
                .expect("audit entry written for fallback rewrite");
            assert!(audit.summary.contains("AI engine not ready"));
            assert!(audit.summary.contains("deterministic jargon-map rewrite"));
        });
    }

    #[test]
    fn civicaccess_language_variant_uses_local_ai_for_any_language() {
        with_temp_state_dir(|_| {
            env::set_var(
                "CIVICSUITE_FAKE_MODEL_RESPONSE",
                "La ciudad reparara una tuberia principal el martes por la manana.",
            );
            let es = city_work_action(
                "civicaccess-language-variant",
                Some(&serde_json::json!({
                    "text": "The city will repair a water main on Tuesday morning.",
                    "language": "es"
                })),
            );
            // AI path serves ANY target language, not just the canned es/vi pair.
            let de = city_work_action(
                "civicaccess-language-variant",
                Some(&serde_json::json!({
                    "text": "The city will repair a water main on Tuesday morning.",
                    "language": "de"
                })),
            );
            env::remove_var("CIVICSUITE_FAKE_MODEL_RESPONSE");
            let es = es.expect("es AI translation drafted");
            let de = de.expect("de AI translation drafted");
            for result in [&es, &de] {
                assert!(result.message.contains("ai-draft-translation"));
                assert!(result.message.contains("civicsuite-gemma4-12b-qat:q4_0"));
                assert!(result.message.contains("Human review required"));
                assert!(result
                    .next_steps
                    .iter()
                    .any(|step| step.contains("qualified human translator")));
            }
            let state = city_work_state().expect("state reads after AI variants");
            let audit = state
                .audit_entries
                .last()
                .expect("audit entry written for AI variant");
            assert!(audit.summary.contains("ai-draft-translation"));
            assert!(audit.summary.contains("qualified human translator"));
        });
    }

    #[test]
    fn civicaccess_language_variant_falls_back_when_model_not_ready() {
        with_temp_state_dir(|_| {
            env::remove_var("CIVICSUITE_FAKE_MODEL_RESPONSE");
            let es = city_work_action(
                "civicaccess-language-variant",
                Some(&serde_json::json!({"text": "Hello", "language": "es"})),
            )
            .expect("es fallback variant still runs");
            assert!(es.message.contains("AI engine not ready"));
            assert!(es.message.contains("sample-created"));
            assert!(es.message.contains("Muestra:"));
            let unsupported = city_work_action(
                "civicaccess-language-variant",
                Some(&serde_json::json!({"text": "Hello", "language": "xx"})),
            )
            .expect("unsupported fallback variant still runs");
            assert!(unsupported.message.contains("AI engine not ready"));
            assert!(unsupported
                .message
                .contains("unsupported-language-placeholder"));
            let state = city_work_state().expect("state reads after fallback variants");
            let audit = state
                .audit_entries
                .last()
                .expect("audit entry written for fallback variant");
            assert!(audit.summary.contains("AI engine not ready"));
        });
    }

    #[test]
    fn accessibility_review_attaches_ai_analysis_when_available() {
        with_temp_state_dir(|_| {
            env::set_var(
                "CIVICSUITE_FAKE_MODEL_RESPONSE",
                "Fix the missing alt text first; it blocks screen-reader users entirely.",
            );
            let saved = city_work_action(
                "accessibility-review",
                Some(&serde_json::json!({
                    "title": "Water main repair notice",
                    "body": "The city water department will repair a main on Tuesday morning.",
                    "hasAltText": false,
                    "language": "en"
                })),
            );
            env::remove_var("CIVICSUITE_FAKE_MODEL_RESPONSE");
            let saved = saved.expect("review with AI analysis saved");
            assert!(saved.message.contains("Local AI analysis"));
            assert!(saved.message.contains("advisory, human review required"));
            let state = city_work_state().expect("state reads after AI review");
            let review = state.access.reviews.last().expect("review persists");
            assert_eq!(
                review.ai_analysis.as_deref(),
                Some("Fix the missing alt text first; it blocks screen-reader users entirely.")
            );
            assert_eq!(
                review.ai_analysis_model.as_deref(),
                Some("civicsuite-gemma4-12b-qat:q4_0")
            );
            // Determinism floor: status and findings come only from the rules.
            assert_eq!(review.status, "needs-fixes");
            assert_eq!(review.findings.len(), 1);
            assert_eq!(review.findings[0].code, "missing-alt-text");
            let audit = state
                .audit_entries
                .last()
                .expect("audit entry written for AI review");
            assert!(audit.summary.contains("local AI analysis added"));
        });
    }

    #[test]
    fn accessibility_review_saves_without_ai_when_model_not_ready() {
        with_temp_state_dir(|_| {
            env::remove_var("CIVICSUITE_FAKE_MODEL_RESPONSE");
            let saved = city_work_action(
                "accessibility-review",
                Some(&serde_json::json!({
                    "title": "Water main repair notice",
                    "body": "The city water department will repair a main on Tuesday morning.",
                    "hasAltText": true,
                    "language": "en"
                })),
            )
            .expect("review saves with no model -- AI never blocks reviews");
            assert!(saved.message.contains("passes-sample-checks"));
            assert!(
                !saved.message.contains("Local AI analysis ("),
                "no AI block claimed when none ran"
            );
            assert!(
                saved.message.contains(
                    "AI engine not ready — the review saved with deterministic findings only"
                ),
                "the visible result discloses the AI outcome, not just the audit chain"
            );
            let state = city_work_state().expect("state reads after deterministic review");
            let review = state.access.reviews.last().expect("review persists");
            assert!(review.ai_analysis.is_none());
            assert!(review.ai_analysis_model.is_none());
            assert_eq!(review.status, "passes-sample-checks");
            let audit = state
                .audit_entries
                .last()
                .expect("audit entry written for deterministic review");
            assert!(audit
                .summary
                .contains("AI engine not ready — deterministic findings only"));
        });
    }

    // ===== Mid-flight generation-failure arms (gate round-1 P1) =====
    //
    // CIVICSUITE_FAKE_MODEL_ERROR makes local_generation_available() report
    // true and then generate_local_text() fail -- the only way to reach the
    // ready-then-fails branches (a genuinely not-ready state is caught by the
    // availability probe before generation is attempted).

    #[test]
    fn accessibility_review_degrades_and_saves_when_generation_fails_mid_flight() {
        with_temp_state_dir(|_| {
            env::remove_var("CIVICSUITE_FAKE_MODEL_RESPONSE");
            env::set_var("CIVICSUITE_FAKE_MODEL_ERROR", "Ollama died mid-request.");
            let saved = city_work_action(
                "accessibility-review",
                Some(&serde_json::json!({
                    "title": "Water main repair notice",
                    "body": "The city water department will repair a main on Tuesday morning.",
                    "hasAltText": false,
                    "language": "en"
                })),
            );
            env::remove_var("CIVICSUITE_FAKE_MODEL_ERROR");
            let saved =
                saved.expect("a dead engine mid-flight never blocks the records-bearing save");
            // Visible result discloses the skip (design 2c) -- not audit-only.
            assert!(saved.message.contains("Local AI analysis was skipped"));
            assert!(saved.message.contains("Ollama died mid-request."));
            assert!(saved.message.contains("needs-fixes"));
            let state = city_work_state().expect("state reads after degraded review");
            let review = state.access.reviews.last().expect("review persists");
            assert!(review.ai_analysis.is_none());
            assert!(review.ai_analysis_model.is_none());
            // Determinism floor holds through the failure arm.
            assert_eq!(review.status, "needs-fixes");
            assert_eq!(review.findings.len(), 1);
            let audit = state
                .audit_entries
                .last()
                .expect("audit entry written for degraded review");
            assert!(audit.summary.contains("local AI analysis skipped"));
        });
    }

    #[test]
    fn plain_language_fails_fast_with_state_untouched_when_generation_fails() {
        with_temp_state_dir(|_| {
            env::remove_var("CIVICSUITE_FAKE_MODEL_RESPONSE");
            env::set_var("CIVICSUITE_FAKE_MODEL_ERROR", "Ollama died mid-request.");
            let result = city_work_action(
                "civicaccess-plain-language",
                Some(&serde_json::json!({
                    "text": "Residents must remit payment prior to the deadline."
                })),
            );
            env::remove_var("CIVICSUITE_FAKE_MODEL_ERROR");
            // The rewrite IS the product: mid-flight failure fails fast...
            let error = match result {
                Ok(_) => panic!("mid-flight generation failure must surface as an error"),
                Err(error) => error,
            };
            assert!(error.contains("Ollama died mid-request."));
            // ...with state untouched: no audit entry, no module audit event.
            let state = city_work_state().expect("state reads after failed rewrite");
            assert!(
                state.audit_entries.is_empty(),
                "failed generation must not write audit entries"
            );
            assert!(
                state.access.audit_events.is_empty(),
                "failed generation must not write module audit events"
            );
        });
    }

    #[test]
    fn language_variant_fails_fast_with_state_untouched_when_generation_fails() {
        with_temp_state_dir(|_| {
            env::remove_var("CIVICSUITE_FAKE_MODEL_RESPONSE");
            env::set_var("CIVICSUITE_FAKE_MODEL_ERROR", "Ollama died mid-request.");
            let result = city_work_action(
                "civicaccess-language-variant",
                Some(&serde_json::json!({"text": "Hello", "language": "es"})),
            );
            env::remove_var("CIVICSUITE_FAKE_MODEL_ERROR");
            let error = match result {
                Ok(_) => panic!("mid-flight generation failure must surface as an error"),
                Err(error) => error,
            };
            assert!(error.contains("Ollama died mid-request."));
            let state = city_work_state().expect("state reads after failed variant");
            assert!(state.audit_entries.is_empty());
            assert!(state.access.audit_events.is_empty());
        });
    }

    #[test]
    fn stored_review_without_ai_fields_still_deserializes() {
        // Older city-work.json states predate ai_analysis/ai_analysis_model;
        // serde(default) must keep them loading.
        let legacy = serde_json::json!({
            "review_id": "access-review-legacy",
            "title": "Legacy review",
            "body": "Saved before the AI fields existed.",
            "has_alt_text": true,
            "language": "en",
            "status": "passes-sample-checks",
            "findings": [],
            "disclaimer": "Advisory only.",
            "created_at_unix_seconds": 1700000000
        });
        let review: StoredAccessibilityReview =
            serde_json::from_value(legacy).expect("legacy review deserializes");
        assert!(review.ai_analysis.is_none());
        assert!(review.ai_analysis_model.is_none());
        assert_eq!(review.review_id, "access-review-legacy");
    }

    // Err-path coverage for the civicaccess dispatcher arms (review #216 critical fix).
    // Validates the trust-boundary behavior — required-field rejection and invalid-id paths.
    #[test]
    fn civicaccess_actions_reject_invalid_inputs() {
        with_temp_state_dir(|_| {
            // records-export with no reviewId payload
            let missing_id = city_work_action("civicaccess-records-export", None);
            assert!(missing_id.is_err());
            assert!(missing_id.err().unwrap().contains("Select a saved review"));

            // records-export with an unknown reviewId
            let fake_id = city_work_action(
                "civicaccess-records-export",
                Some(&serde_json::json!({"reviewId": "fake-id-does-not-exist"})),
            );
            assert!(fake_id.is_err());
            assert!(fake_id.err().unwrap().contains("not in the local store"));

            // delete-review with an unknown reviewId
            let fake_delete = city_work_action(
                "civicaccess-delete-review",
                Some(&serde_json::json!({"reviewId": "fake-id-does-not-exist"})),
            );
            assert!(fake_delete.is_err());
            assert!(fake_delete
                .err()
                .unwrap()
                .contains("not in the local store"));

            // plain-language with no text payload
            let no_text =
                city_work_action("civicaccess-plain-language", Some(&serde_json::json!({})));
            assert!(no_text.is_err());
            assert!(no_text
                .err()
                .unwrap()
                .contains("Enter the public-facing text"));

            // language-variant with missing text
            let no_variant_text = city_work_action(
                "civicaccess-language-variant",
                Some(&serde_json::json!({"language": "es"})),
            );
            assert!(no_variant_text.is_err());
            assert!(no_variant_text.err().unwrap().contains("public text"));

            // language-variant with missing language
            let no_lang = city_work_action(
                "civicaccess-language-variant",
                Some(&serde_json::json!({"text": "Hello"})),
            );
            assert!(no_lang.is_err());
            assert!(no_lang.err().unwrap().contains("target language"));

            // ada-title-ii with missing serviceArea
            let no_area = city_work_action(
                "civicaccess-ada-title-ii",
                Some(&serde_json::json!({"hasCoordinatorReview": true})),
            );
            assert!(no_area.is_err());
            assert!(no_area.err().unwrap().contains("public service"));

            // tagged-pdf with non-numeric heading level
            let bad_heading = city_work_action(
                "civicaccess-tagged-pdf",
                Some(&serde_json::json!({"headingLevels": "abc"})),
            );
            assert!(bad_heading.is_err());
            assert!(bad_heading.err().unwrap().contains("whole number"));

            // --- QA-1 / TEST-4: input-length caps mirroring upstream Pydantic models ---

            let over_title = "A".repeat(501);
            let title_capped = city_work_action(
                "accessibility-review",
                Some(&serde_json::json!({"title": over_title, "body": "ok", "language": "en"})),
            );
            assert!(title_capped.is_err());
            assert!(title_capped.err().unwrap().contains("500-character limit"));

            let over_body = "A".repeat(5001);
            let body_capped = city_work_action(
                "accessibility-review",
                Some(&serde_json::json!({"title": "ok", "body": over_body, "language": "en"})),
            );
            assert!(body_capped.is_err());
            assert!(body_capped.err().unwrap().contains("5000-character limit"));

            let over_language = "a".repeat(81);
            let language_capped = city_work_action(
                "accessibility-review",
                Some(&serde_json::json!({"title": "ok", "body": "ok", "language": over_language})),
            );
            assert!(language_capped.is_err());
            assert!(language_capped
                .err()
                .unwrap()
                .contains("80-character limit"));

            let over_plain_text = "A".repeat(5001);
            let plain_text_capped = city_work_action(
                "civicaccess-plain-language",
                Some(&serde_json::json!({"text": over_plain_text})),
            );
            assert!(plain_text_capped.is_err());
            assert!(plain_text_capped
                .err()
                .unwrap()
                .contains("5000-character limit"));

            let over_variant_text = "A".repeat(5001);
            let variant_text_capped = city_work_action(
                "civicaccess-language-variant",
                Some(&serde_json::json!({"text": over_variant_text, "language": "es"})),
            );
            assert!(variant_text_capped.is_err());
            assert!(variant_text_capped
                .err()
                .unwrap()
                .contains("5000-character limit"));

            let over_variant_language = "a".repeat(81);
            let variant_language_capped = city_work_action(
                "civicaccess-language-variant",
                Some(&serde_json::json!({"text": "Hello", "language": over_variant_language})),
            );
            assert!(variant_language_capped.is_err());
            assert!(variant_language_capped
                .err()
                .unwrap()
                .contains("80-character limit"));

            let over_form_name = "A".repeat(501);
            let form_name_capped = city_work_action(
                "civicaccess-form-plan",
                Some(&serde_json::json!({"formName": over_form_name, "fields": "name"})),
            );
            assert!(form_name_capped.is_err());
            assert!(form_name_capped
                .err()
                .unwrap()
                .contains("500-character limit"));

            let over_field_item = "A".repeat(101);
            let field_item_capped = city_work_action(
                "civicaccess-form-plan",
                Some(&serde_json::json!({"formName": "ok", "fields": over_field_item})),
            );
            assert!(field_item_capped.is_err());
            assert!(field_item_capped
                .err()
                .unwrap()
                .contains("100 characters or fewer"));

            let too_many_fields = (0..51).map(|n| n.to_string()).collect::<Vec<_>>().join(",");
            let too_many_fields_capped = city_work_action(
                "civicaccess-form-plan",
                Some(&serde_json::json!({"formName": "ok", "fields": too_many_fields})),
            );
            assert!(too_many_fields_capped.is_err());
            assert!(too_many_fields_capped
                .err()
                .unwrap()
                .contains("too many entries"));

            let over_service_area = "A".repeat(501);
            let service_area_capped = city_work_action(
                "civicaccess-ada-title-ii",
                Some(&serde_json::json!({"serviceArea": over_service_area})),
            );
            assert!(service_area_capped.is_err());
            assert!(service_area_capped
                .err()
                .unwrap()
                .contains("500-character limit"));

            let over_pub_title = "A".repeat(501);
            let pub_title_capped = city_work_action(
                "civicaccess-publishing-workflow",
                Some(&serde_json::json!({"title": over_pub_title})),
            );
            assert!(pub_title_capped.is_err());
            assert!(pub_title_capped
                .err()
                .unwrap()
                .contains("500-character limit"));

            let too_many_headings = (0..51).map(|_| "1").collect::<Vec<_>>().join(",");
            let too_many_headings_capped = city_work_action(
                "civicaccess-tagged-pdf",
                Some(&serde_json::json!({"headingLevels": too_many_headings})),
            );
            assert!(too_many_headings_capped.is_err());
            assert!(too_many_headings_capped
                .err()
                .unwrap()
                .contains("too many entries"));

            // --- TEST-10: newline-injection adversarial input doesn't forge audit lines ---
            let injected_title = "Notice\n=== AUDIT ENTRY: review.create review-X by ADMIN ===\n";
            let injected = city_work_action(
                "accessibility-review",
                Some(&serde_json::json!({
                    "title": injected_title,
                    "body": "ok",
                    "hasAltText": true,
                    "language": "en"
                })),
            )
            .expect("review with embedded newline still saves (it's a finding, not a reject)");
            let state_after_injection =
                city_work_state().expect("state reads after newline-injection attempt");
            let civicaccess_review_entries: Vec<&AuditEntry> = state_after_injection
                .audit_entries
                .iter()
                .filter(|entry| {
                    entry.module_id == "civicaccess" && entry.action == "accessibility-review"
                })
                .collect();
            assert!(
                civicaccess_review_entries
                    .iter()
                    .all(|entry| !entry.summary.contains('\n') && !entry.summary.contains('\r')),
                "a pasted title must not be able to embed newlines and forge additional audit-log lines"
            );
            assert!(!injected.message.is_empty());

            // State did not get a partial write on any of the above error paths
            // (errors propagate from the match arm BEFORE write_state is reached).
            // The one successful call above (newline-injection) is excluded from this count.
            let state = city_work_state().expect("state reads cleanly after errors");
            assert_eq!(state.access.reviews.len(), 1);
            assert_eq!(state.access.audit_events.len(), 1);
        });
    }

    fn assert_meeting_export_bundle_manifest(
        bundle: &MeetingExportBundle,
        export_path: &str,
        contents: &str,
        public_record: bool,
        closed_session_attachment_count: usize,
    ) {
        let expected_hash = hash_public_payload(contents);
        assert_eq!(bundle.export_path, export_path);
        assert_eq!(bundle.export_hash, expected_hash);
        assert_eq!(bundle.public_record, public_record);
        assert_eq!(
            bundle.closed_session_attachment_count,
            closed_session_attachment_count
        );
        assert_eq!(bundle.manifest_hash.len(), 64);
        assert!(PathBuf::from(&bundle.manifest_path).is_file());
        assert!(PathBuf::from(&bundle.integrity_manifest_path).is_file());
        assert_eq!(
            bundle.manifest_hash,
            hash_file(&PathBuf::from(&bundle.manifest_path)).expect("manifest hashes")
        );
        let manifest: serde_json::Value = serde_json::from_str(
            &fs::read_to_string(&bundle.manifest_path).expect("manifest reads"),
        )
        .expect("manifest parses");
        assert_eq!(manifest["schema_version"].as_u64(), Some(1));
        assert_eq!(
            manifest["bundle_type"].as_str(),
            Some("civicclerk-meeting-packet-notice")
        );
        let export_path_buf = PathBuf::from(export_path);
        let expected_packet_path = if public_record {
            path_file_name(&export_path_buf, "meeting-packet.md")
        } else {
            export_path.to_string()
        };
        assert_eq!(
            manifest["packet_path"].as_str(),
            Some(expected_packet_path.as_str())
        );
        assert_eq!(
            manifest["packet_sha256"].as_str(),
            Some(expected_hash.as_str())
        );
        assert_eq!(manifest["public_record"].as_bool(), Some(public_record));
        if public_record {
            assert!(!manifest["packet_path"]
                .as_str()
                .unwrap_or_default()
                .contains("\\"));
            assert!(!manifest["integrity_manifest_path"]
                .as_str()
                .unwrap_or_default()
                .contains("\\"));
        }
        assert_eq!(
            manifest["counts"]["closed_session_attachments"].as_u64(),
            Some(closed_session_attachment_count as u64)
        );
        assert_eq!(
            manifest["counts"]["notice_postings"].as_u64(),
            Some(bundle.notice_posting_count as u64)
        );
        assert_eq!(
            manifest["counts"]["attendance_records"].as_u64(),
            Some(bundle.attendance_record_count as u64)
        );
        assert_eq!(
            manifest["counts"]["quorum_checks"].as_u64(),
            Some(bundle.quorum_check_count as u64)
        );
        assert!(manifest["source_references"]
            .as_array()
            .expect("source references array")
            .iter()
            .any(|value| value.as_str() == Some("Municipal open meetings notice")));
        assert!(manifest["limitations"]
            .as_array()
            .expect("limitations array")
            .iter()
            .any(|value| value
                .as_str()
                .unwrap_or_default()
                .contains(if public_record {
                    "Public archive projection"
                } else {
                    "Staff packet export"
                })));
    }

    #[test]
    fn export_folder_action_opens_only_allowlisted_local_export_folders() {
        with_temp_state_dir(|root| {
            let records_folder = serde_json::json!({ "folder": "records" });
            let result = city_work_action("open-exports-folder", Some(&records_folder))
                .expect("exports folder opens");
            assert!(result.accepted);
            assert!(result.message.contains("records exports"));
            assert!(root.join("Data").join("exports").join("records").is_dir());

            let blocked_folder = serde_json::json!({ "folder": "..\\Windows" });
            let error = match city_work_action("open-exports-folder", Some(&blocked_folder)) {
                Ok(_) => panic!("unexpectedly opened a non-allowlisted export folder"),
                Err(error) => error,
            };
            assert!(error.contains("Choose a valid export folder"));
        });
    }

    #[test]
    fn clerk_notice_deadline_calculator_skips_weekends_and_records_review_evidence() {
        with_temp_state_dir(|_| {
            let meeting_body = serde_json::json!({
                "meetingBodyName": "City Council",
                "meetingBodyType": "legislative",
                "meetingBodyStatutoryBasis": "City Charter Section 2.1",
                "meetingBodyCadence": "Third Wednesday",
                "meetingBodyDefaultNoticeDays": "3",
                "meetingBodyQuorumRule": "majority of seated members"
            });
            city_work_action("create-meeting-body", Some(&meeting_body))
                .expect("meeting body saved");
            let meeting_body_id = city_work_state()
                .expect("state reads after meeting body")
                .meeting_bodies
                .first()
                .expect("meeting body exists")
                .id
                .clone();
            let meeting = serde_json::json!({
                "meetingBodyId": meeting_body_id,
                "title": "Council Regular Meeting",
                "meetingDate": "2026-07-15",
                "summary": "Budget hearing",
                "agendaTitle": "Adopt budget ordinance"
            });
            city_work_action("create-meeting", Some(&meeting)).expect("meeting created");

            let zero_count = serde_json::json!({
                "noticeMeetingType": "Regular council meeting",
                "noticeStatutoryBasis": "Municipal open meetings notice",
                "noticeLeadDays": "0",
                "noticeDayType": "business days",
                "noticeTimeZone": "America/Denver",
                "noticeHumanApproval": true
            });
            let error = match city_work_action("calculate-notice-deadline", Some(&zero_count)) {
                Ok(_) => panic!("zero notice lead day count cannot calculate"),
                Err(error) => error,
            };
            assert!(error.contains("between 1 and 365"));

            let calculation = serde_json::json!({
                "noticeMeetingType": "Regular council meeting",
                "noticeStatutoryBasis": "Municipal open meetings notice",
                "noticeLeadDays": "3",
                "noticeDayType": "business days",
                "noticeTimeZone": "America/Denver",
                "noticeHumanApproval": true
            });
            city_work_action("calculate-notice-deadline", Some(&calculation))
                .expect("notice deadline calculated");
            let state = city_work_state().expect("state reads after notice calculation");
            let meeting = state.meetings.first().expect("meeting exists");
            let checklist = meeting
                .notice_checklists
                .first()
                .expect("notice checklist was recorded");
            assert_eq!(checklist.posting_deadline, "2026-07-10");
            assert_eq!(checklist.status, "ready for posting");
            assert!(checklist
                .statutory_basis
                .contains("weekends are automatically skipped"));
            assert!(checklist
                .statutory_basis
                .contains("city/state holidays must be checked by staff"));
            assert_eq!(meeting.notice_status, "notice checklist ready");
            assert!(state.audit_entries.iter().any(|entry| {
                entry.action == "calculate-notice-deadline"
                    && entry.summary.contains("deadline: 2026-07-10")
                    && entry.summary.contains("Regular council meeting")
            }));

            assert_eq!(
                subtract_notice_deadline_days("2026-07-15", 3, "calendar days")
                    .expect("calendar notice deadline"),
                "2026-07-12"
            );
        });
    }

    #[test]
    fn meeting_workflow_persists_agenda_notice_minutes_votes_comments_actions_and_archive() {
        with_temp_state_dir(|root| {
            let missing_body_meeting = serde_json::json!({
                "title": "Council Regular Meeting",
                "meetingDate": "2026-07-01",
                "summary": "Budget hearing",
                "agendaTitle": "Adopt budget ordinance"
            });
            let error = match city_work_action("create-meeting", Some(&missing_body_meeting)) {
                Ok(_) => panic!("meeting cannot be created before meeting body setup"),
                Err(error) => error,
            };
            assert!(error.contains("Create a meeting body"));
            let incomplete_body = serde_json::json!({ "meetingBodyName": "City Council" });
            let error = match city_work_action("create-meeting-body", Some(&incomplete_body)) {
                Ok(_) => panic!("meeting body cannot be created without statutory basis"),
                Err(error) => error,
            };
            assert!(error.contains("statutory basis"));
            let meeting_body = serde_json::json!({
                "meetingBodyName": "City Council",
                "meetingBodyType": "legislative",
                "meetingBodyStatutoryBasis": "City Charter Section 2.1",
                "meetingBodyCadence": "First and third Wednesday",
                "meetingBodyDefaultNoticeDays": "3",
                "meetingBodyQuorumRule": "majority of seated members"
            });
            city_work_action("create-meeting-body", Some(&meeting_body))
                .expect("meeting body saved");
            let body_state = city_work_state().expect("state reads after meeting body");
            let meeting_body_id = body_state
                .meeting_bodies
                .first()
                .expect("meeting body exists")
                .id
                .clone();
            let duplicate_body_error =
                match city_work_action("create-meeting-body", Some(&meeting_body)) {
                    Ok(_) => panic!("duplicate meeting body cannot be created"),
                    Err(error) => error,
                };
            assert!(duplicate_body_error.contains("already exists"));
            let incomplete_member = serde_json::json!({
                "meetingBodyId": meeting_body_id,
                "memberName": "Councilmember Lee"
            });
            let error = match city_work_action("add-meeting-member", Some(&incomplete_member)) {
                Ok(_) => panic!("member cannot save without a role"),
                Err(error) => error,
            };
            assert!(error.contains("member role"));
            let member_lee = serde_json::json!({
                "meetingBodyId": meeting_body_id,
                "memberName": "Councilmember Lee",
                "memberRole": "Mayor Pro Tem",
                "memberTermStart": "2025-01-01",
                "memberTermEnd": "2028-12-31",
                "memberEmail": "lee@example.gov"
            });
            city_work_action("add-meeting-member", Some(&member_lee)).expect("member saved");
            let member_ortiz = serde_json::json!({
                "meetingBodyId": meeting_body_id,
                "memberName": "Councilmember Ortiz",
                "memberRole": "Councilmember",
                "memberTermStart": "2023-01-01",
                "memberTermEnd": "2026-12-31",
                "memberEmail": "ortiz@example.gov"
            });
            city_work_action("add-meeting-member", Some(&member_ortiz)).expect("member saved");
            let duplicate_member_error =
                match city_work_action("add-meeting-member", Some(&member_lee)) {
                    Ok(_) => panic!("duplicate active member cannot be created"),
                    Err(error) => error,
                };
            assert!(duplicate_member_error.contains("already on this meeting body roster"));
            let payload = serde_json::json!({
                "meetingBodyId": meeting_body_id,
                "title": "Council Regular Meeting",
                "meetingDate": "2026-07-01",
                "summary": "Budget hearing",
                "agendaTitle": "Adopt budget ordinance"
            });
            city_work_action("create-meeting", Some(&payload)).expect("meeting created");
            let missing_staff_report = serde_json::json!({
                "staffReportRecommendation": "Approve the budget ordinance"
            });
            let error = match city_work_action("record-staff-report", Some(&missing_staff_report)) {
                Ok(_) => panic!("staff report cannot save without required sections"),
                Err(error) => error,
            };
            assert!(error.contains("staff report background"));
            let staff_report_agenda_item_id = city_work_state()
                .expect("state reads for staff report agenda item")
                .meetings
                .first()
                .expect("meeting exists")
                .agenda_items
                .first()
                .expect("agenda item exists")
                .id
                .clone();
            let staff_report = serde_json::json!({
                "staffReportAgendaItemId": staff_report_agenda_item_id,
                "staffReportRecommendation": "Approve the budget ordinance",
                "staffReportBackground": "The finance department prepared the annual budget package.",
                "staffReportAnalysis": "Enterprise fund reserve targets remain above policy minimums.",
                "staffReportFiscalImpact": "Appropriates the annual operating budget.",
                "staffReportAlternatives": "Continue the hearing or adopt a reduced appropriation.",
                "staffReportPriorActions": "Budget workshop held on 2026-06-15.",
                "staffReportPreparedBy": "Finance Director Rivera",
                "staffReportRevisionNote": "Initial packet version"
            });
            city_work_action("record-staff-report", Some(&staff_report))
                .expect("staff report saved");
            let public_attachment_path = root.join("public-fiscal-note.txt");
            fs::write(
                &public_attachment_path,
                "Fiscal note for the budget ordinance packet.",
            )
            .expect("public attachment written");
            let public_attachment = serde_json::json!({
                "meetingAttachmentTitle": "Fiscal note",
                "meetingAttachmentSourcePath": public_attachment_path.to_string_lossy(),
                "meetingAttachmentCitation": "Packet item 4 fiscal note",
                "meetingAttachmentSection": "Item 4",
                "meetingAttachmentAccess": "public packet"
            });
            city_work_action("add-meeting-attachment", Some(&public_attachment))
                .expect("public packet attachment saved");
            let closed_attachment_path = root.join("closed-session-memo.txt");
            fs::write(
                &closed_attachment_path,
                "Closed-session attorney memo for internal addendum only.",
            )
            .expect("closed attachment written");
            let closed_attachment = serde_json::json!({
                "meetingAttachmentTitle": "Closed-session attorney memo",
                "meetingAttachmentSourcePath": closed_attachment_path.to_string_lossy(),
                "meetingAttachmentCitation": "Executive session memo",
                "meetingAttachmentSection": "Closed-session addendum",
                "meetingAttachmentAccess": "closed-session addendum"
            });
            city_work_action("add-meeting-attachment", Some(&closed_attachment))
                .expect("closed-session attachment saved");
            let incomplete_packet = serde_json::json!({
                "packetTitle": "Council budget packet"
            });
            let error = match city_work_action("finalize-meeting-packet", Some(&incomplete_packet))
            {
                Ok(_) => panic!("packet cannot finalize without clerk reviewer"),
                Err(error) => error,
            };
            assert!(error.contains("prepared or reviewed"));
            let packet_finalization = serde_json::json!({
                "packetTitle": "Council budget packet",
                "packetPreparedBy": "Deputy Clerk Avery",
                "packetReviewNote": "Packet reviewed against agenda, public fiscal note, and closed-session addendum boundaries."
            });
            city_work_action("finalize-meeting-packet", Some(&packet_finalization))
                .expect("packet finalization saved");
            let closed_session = serde_json::json!({
                "closedSessionBasis": "State open meetings law Section 24-6-402(4)(b)",
                "closedSessionTopics": "Attorney advice on budget litigation",
                "closedSessionAttendees": "City Council; City Attorney; City Manager",
                "closedSessionEnteredAt": "6:42 PM",
                "closedSessionExitedAt": "7:05 PM",
                "closedSessionReconvene": "Council reconvened in open session at 7:05 PM and no action was taken in closed session.",
                "closedSessionNotesReference": "closed-session-memo.txt"
            });
            city_work_action("record-closed-session", Some(&closed_session))
                .expect("closed session recorded");
            let missing_checklist = match city_work_action("complete-notice-checklist", None) {
                Ok(_) => panic!("notice checklist cannot pass without evidence"),
                Err(error) => error,
            };
            assert!(missing_checklist.contains("Enter the meeting type"));
            let missing_basis = serde_json::json!({
                "noticeMeetingType": "Regular council meeting",
                "noticeDeadline": "2026-06-30",
                "noticeTimeZone": "America/Denver",
                "noticeHumanApproval": true
            });
            let error = match city_work_action("complete-notice-checklist", Some(&missing_basis)) {
                Ok(_) => panic!("notice checklist cannot pass without statutory basis"),
                Err(error) => error,
            };
            assert!(error.contains("statutory notice basis"));
            let bad_time_zone = serde_json::json!({
                "noticeMeetingType": "Regular council meeting",
                "noticeStatutoryBasis": "Municipal open meetings notice",
                "noticeDeadline": "2026-06-30",
                "noticeTimeZone": "Denver",
                "noticeHumanApproval": true
            });
            let error = match city_work_action("complete-notice-checklist", Some(&bad_time_zone)) {
                Ok(_) => panic!("notice checklist cannot pass with invalid timezone"),
                Err(error) => error,
            };
            assert!(error.contains("valid IANA time zone"));
            let missing_approval = serde_json::json!({
                "noticeMeetingType": "Regular council meeting",
                "noticeStatutoryBasis": "Municipal open meetings notice",
                "noticeDeadline": "2026-06-30",
                "noticeTimeZone": "America/Denver",
                "noticeHumanApproval": false
            });
            let error = match city_work_action("complete-notice-checklist", Some(&missing_approval))
            {
                Ok(_) => panic!("notice checklist cannot pass without clerk approval"),
                Err(error) => error,
            };
            assert!(error.contains("clerk must approve"));
            let checklist = serde_json::json!({
                "noticeMeetingType": "Regular council meeting",
                "noticeStatutoryBasis": "Municipal open meetings notice",
                "noticeDeadline": "2026-06-30",
                "noticeTimeZone": "America/Denver",
                "noticeHumanApproval": true
            });
            city_work_action("complete-notice-checklist", Some(&checklist))
                .expect("notice checklist approved");
            let late_notice = serde_json::json!({
                "postingLocation": "City Hall bulletin board and city website",
                "postingMethod": "Posted PDF and clerk attestation",
                "postingConfirmation": "Clerk confirmed posting after the statutory deadline.",
                "postingDate": "2026-07-01"
            });
            let error = match city_work_action("post-notice", Some(&late_notice)) {
                Ok(_) => panic!("late notice posting cannot mark notice ready"),
                Err(error) => error,
            };
            assert!(error.contains("after the notice checklist deadline"));
            let notice = serde_json::json!({
                "postingLocation": "City Hall bulletin board and city website",
                "postingMethod": "Posted PDF and clerk attestation",
                "postingConfirmation": "Clerk confirmed posting before the statutory deadline.",
                "postingDate": "2026-06-30"
            });
            city_work_action("post-notice", Some(&notice)).expect("notice prepared");
            let minutes = serde_json::json!({ "minutes": "Meeting called to order at 6:00 PM." });
            city_work_action("record-minutes", Some(&minutes)).expect("minutes saved");
            let bad_motion = serde_json::json!({
                "motionText": "Approve the budget ordinance.",
                "motionMover": "Councilmember Lee",
                "motionDisposition": "maybe"
            });
            let error = match city_work_action("record-motion", Some(&bad_motion)) {
                Ok(_) => panic!("motion cannot save with invalid disposition"),
                Err(error) => error,
            };
            assert!(error.contains("pending vote, passed, failed, withdrawn, or tabled"));
            let motion = serde_json::json!({
                "motionText": "Approve the budget ordinance.",
                "motionMover": "Councilmember Lee",
                "motionSeconder": "Councilmember Patel",
                "motionDisposition": "passed",
                "motionVoteReference": "Budget ordinance passed 4-1."
            });
            city_work_action("record-motion", Some(&motion)).expect("motion saved");
            let roster_state = city_work_state().expect("state reads for member votes");
            let lee_id = roster_state
                .meeting_members
                .iter()
                .find(|member| member.name == "Councilmember Lee")
                .expect("Lee member exists")
                .id
                .clone();
            let ortiz_id = roster_state
                .meeting_members
                .iter()
                .find(|member| member.name == "Councilmember Ortiz")
                .expect("Ortiz member exists")
                .id
                .clone();
            let invalid_attendance = serde_json::json!({
                "attendanceMemberId": lee_id.clone(),
                "attendanceStatus": "here",
                "attendanceRecordedBy": "City Clerk Morgan"
            });
            let error =
                match city_work_action("record-meeting-attendance", Some(&invalid_attendance)) {
                    Ok(_) => panic!("invalid attendance status cannot save"),
                    Err(error) => error,
                };
            assert!(error.contains("Attendance status"));
            let lee_attendance = serde_json::json!({
                "attendanceMemberId": lee_id.clone(),
                "attendanceStatus": "present",
                "attendanceRecordedBy": "City Clerk Morgan",
                "attendanceNote": "Present at call to order."
            });
            city_work_action("record-meeting-attendance", Some(&lee_attendance))
                .expect("Lee attendance saved");
            let duplicate_lee_attendance =
                match city_work_action("record-meeting-attendance", Some(&lee_attendance)) {
                    Ok(_) => panic!("duplicate attendance cannot save"),
                    Err(error) => error,
                };
            assert!(duplicate_lee_attendance.contains("already has attendance recorded"));
            let ortiz_attendance = serde_json::json!({
                "attendanceMemberId": ortiz_id.clone(),
                "attendanceStatus": "remote",
                "attendanceRecordedBy": "City Clerk Morgan",
                "attendanceNote": "Attended remotely under city remote participation policy."
            });
            city_work_action("record-meeting-attendance", Some(&ortiz_attendance))
                .expect("Ortiz attendance saved");
            let missing_quorum_note = match city_work_action("record-quorum-check", None) {
                Ok(_) => panic!("quorum check cannot save without review note"),
                Err(error) => error,
            };
            assert!(missing_quorum_note.contains("quorum review note"));
            let quorum = serde_json::json!({
                "quorumReviewNote": "Two active members present or remote; quorum met under majority rule."
            });
            city_work_action("record-quorum-check", Some(&quorum)).expect("quorum check saved");
            let invalid_member_vote = serde_json::json!({
                "memberVoteMemberId": lee_id.clone(),
                "memberVoteValue": "yes"
            });
            let error = match city_work_action("record-member-vote", Some(&invalid_member_vote)) {
                Ok(_) => panic!("invalid member vote cannot save"),
                Err(error) => error,
            };
            assert!(error.contains("aye, nay, abstain, absent, or recused"));
            let missing_member_vote = serde_json::json!({
                "memberVoteMemberName": "Councilmember Unknown",
                "memberVoteValue": "aye"
            });
            let error = match city_work_action("record-member-vote", Some(&missing_member_vote)) {
                Ok(_) => panic!("unknown member vote cannot save"),
                Err(error) => error,
            };
            assert!(error.contains("meeting body roster"));
            let lee_vote = serde_json::json!({
                "memberVoteMemberId": lee_id.clone(),
                "memberVoteValue": "aye"
            });
            city_work_action("record-member-vote", Some(&lee_vote))
                .expect("Lee roll-call vote saved");
            let duplicate_lee_vote = match city_work_action("record-member-vote", Some(&lee_vote)) {
                Ok(_) => panic!("duplicate member vote cannot save"),
                Err(error) => error,
            };
            assert!(duplicate_lee_vote.contains("already has a roll-call vote"));
            let ortiz_vote = serde_json::json!({
                "memberVoteMemberId": ortiz_id.clone(),
                "memberVoteValue": "nay"
            });
            city_work_action("record-member-vote", Some(&ortiz_vote))
                .expect("Ortiz roll-call vote saved");
            let vote = serde_json::json!({ "vote": "Budget ordinance passed 4-1." });
            city_work_action("record-vote", Some(&vote)).expect("vote saved");
            let bad_action_item = serde_json::json!({
                "actionItem": "Finance staff to publish the adopted budget.",
                "actionItemDueDate": "2026-02-31"
            });
            let error = match city_work_action("add-action-item", Some(&bad_action_item)) {
                Ok(_) => panic!("action item cannot save with invalid due date"),
                Err(error) => error,
            };
            assert!(error.contains("real calendar date"));
            let action_item = serde_json::json!({
                "actionItem": "Finance staff to publish the adopted budget.",
                "actionItemOwner": "Finance Director",
                "actionItemDueDate": "2026-07-08",
                "actionItemStatus": "open",
                "actionItemSourceReference": "Budget ordinance motion"
            });
            city_work_action("add-action-item", Some(&action_item)).expect("action item saved");
            let resident_comment =
                serde_json::json!({ "residentComment": "Resident asked for sidewalk funding." });
            city_work_action("record-resident-comment", Some(&resident_comment))
                .expect("resident comment saved");
            env::set_var(
                "CIVICSUITE_FAKE_MODEL_RESPONSE",
                "Local AI minutes draft: budget ordinance passed 4-1 with finance publication action.",
            );
            let suggested =
                city_work_action("suggest-minutes-draft", None).expect("AI minutes generated");
            env::remove_var("CIVICSUITE_FAKE_MODEL_RESPONSE");
            assert!(suggested.message.contains("Local AI minutes draft"));
            let suggested_state = city_work_state().expect("state reads after AI minutes");
            assert!(suggested_state.meetings[0]
                .minutes
                .contains("Local AI minutes draft"));
            let adoption_without_citation = match city_work_action("adopt-minutes", None) {
                Ok(_) => panic!("minutes cannot be adopted without citation evidence"),
                Err(error) => error,
            };
            assert!(adoption_without_citation.contains("minute citation"));
            let citation = serde_json::json!({
                "minutesCitationSentence": "Local AI minutes draft: budget ordinance passed 4-1 with finance publication action.",
                "minutesCitationSourceType": "packet item",
                "minutesCitationSourceRef": "Packet item 4 fiscal note",
                "minutesCitationNote": "Supports budget action and publication task.",
                "minutesCitationAccess": "public record"
            });
            city_work_action("add-minute-citation", Some(&citation))
                .expect("public minute citation saved");
            let staff_only_citation = serde_json::json!({
                "minutesCitationSentence": "Local AI minutes draft: budget ordinance passed 4-1 with finance publication action.",
                "minutesCitationSourceType": "closed-session note",
                "minutesCitationSourceRef": "Executive session memo",
                "minutesCitationNote": "Staff-only attorney review source.",
                "minutesCitationAccess": "staff-only"
            });
            city_work_action("add-minute-citation", Some(&staff_only_citation))
                .expect("staff-only minute citation saved");
            city_work_action("adopt-minutes", None).expect("minutes adopted");
            let archive_before_signature = match city_work_action("archive-meeting", None) {
                Ok(_) => panic!("meeting cannot archive before signed minutes"),
                Err(error) => error,
            };
            assert!(archive_before_signature.contains("Sign the adopted minutes"));
            let replacement_minutes =
                serde_json::json!({ "minutes": "Replacement after adoption." });
            let error = match city_work_action("record-minutes", Some(&replacement_minutes)) {
                Ok(_) => panic!("adopted minutes cannot be overwritten"),
                Err(error) => error,
            };
            assert!(error.contains("already adopted"));
            let adopted_ordinance = serde_json::json!({
                "adoptedLegislationType": "ordinance",
                "adoptedLegislationTitle": "Budget Publication Ordinance",
                "adoptedLegislationText": "An ordinance directing publication of the adopted budget.",
                "adoptedLegislationEffectiveDate": "2026-07-15",
                "adoptedLegislationCodificationHint": "Title 2, Chapter 4"
            });
            let error =
                match city_work_action("record-adopted-legislation", Some(&adopted_ordinance)) {
                    Ok(_) => panic!("adopted legislation cannot be recorded before signed minutes"),
                    Err(error) => error,
                };
            assert!(error.contains("Sign the adopted minutes"));
            let signature = serde_json::json!({
                "minutesSignedBy": "City Clerk Morgan",
                "minutesSignatureAttestation": "I attest these adopted minutes are ready for the official public record."
            });
            city_work_action("sign-minutes", Some(&signature)).expect("minutes signed");
            city_work_action("record-adopted-legislation", Some(&adopted_ordinance))
                .expect("adopted legislation recorded");
            city_work_action("export-meeting-packet", None).expect("packet exported");
            city_work_action("archive-meeting", None).expect("meeting archived");
            let state = city_work_state().expect("state reads");
            assert_eq!(state.meeting_bodies.len(), 1);
            let body = state.meeting_bodies.first().expect("meeting body exists");
            assert_eq!(body.name, "City Council");
            assert_eq!(body.body_type, "legislative");
            assert_eq!(body.statutory_basis, "City Charter Section 2.1");
            assert_eq!(body.meeting_cadence, "First and third Wednesday");
            assert_eq!(body.default_notice_days, 3);
            assert_eq!(body.quorum_rule, "majority of seated members");
            assert_eq!(body.status, "active");
            assert_eq!(state.meeting_members.len(), 2);
            let lee_member = state
                .meeting_members
                .iter()
                .find(|member| member.name == "Councilmember Lee")
                .expect("Lee member persisted");
            assert_eq!(lee_member.body_id, body.id);
            assert_eq!(lee_member.role, "Mayor Pro Tem");
            assert_eq!(lee_member.term_start, "2025-01-01");
            assert_eq!(lee_member.term_end, "2028-12-31");
            assert_eq!(lee_member.email, "lee@example.gov");
            let ortiz_member = state
                .meeting_members
                .iter()
                .find(|member| member.name == "Councilmember Ortiz")
                .expect("Ortiz member persisted");
            assert_eq!(ortiz_member.body_id, body.id);
            assert_eq!(ortiz_member.role, "Councilmember");
            let meeting = state.meetings.first().expect("meeting exists");
            assert_eq!(meeting.body_id, body.id);
            assert_eq!(meeting.body_name, "City Council");
            assert_eq!(meeting.notice_status, "public notice ready");
            assert_eq!(meeting.notice_checklists.len(), 1);
            assert_eq!(
                meeting.notice_checklists[0].statutory_basis,
                "Municipal open meetings notice"
            );
            assert_eq!(meeting.notice_postings.len(), 1);
            assert_eq!(
                meeting.notice_postings[0].location,
                "City Hall bulletin board and city website"
            );
            assert_eq!(meeting.notice_postings[0].posted_on, "2026-06-30");
            assert_eq!(meeting.status, "archived public record");
            assert_eq!(meeting.staff_reports.len(), 1);
            assert_eq!(
                meeting.staff_reports[0].recommendation,
                "Approve the budget ordinance"
            );
            assert_eq!(
                meeting.staff_reports[0].analysis,
                "Enterprise fund reserve targets remain above policy minimums."
            );
            assert_eq!(
                meeting.staff_reports[0].prepared_by,
                "Finance Director Rivera"
            );
            assert_eq!(
                meeting.staff_reports[0].revision_note,
                "Initial packet version"
            );
            assert_eq!(meeting.motions.len(), 1);
            assert_eq!(meeting.motions[0].text, "Approve the budget ordinance.");
            assert_eq!(meeting.motions[0].mover, "Councilmember Lee");
            assert_eq!(meeting.motions[0].seconder, "Councilmember Patel");
            assert_eq!(meeting.motions[0].disposition, "passed");
            assert_eq!(
                meeting.motions[0].vote_reference,
                "Budget ordinance passed 4-1."
            );
            assert_eq!(meeting.member_votes.len(), 2);
            assert_eq!(meeting.member_votes[0].member_name, "Councilmember Lee");
            assert_eq!(meeting.member_votes[0].vote, "aye");
            assert_eq!(
                meeting.member_votes[0].motion_text,
                "Approve the budget ordinance."
            );
            assert_eq!(meeting.member_votes[1].member_name, "Councilmember Ortiz");
            assert_eq!(meeting.member_votes[1].vote, "nay");
            assert_eq!(meeting.attendance_records.len(), 2);
            assert_eq!(
                meeting.attendance_records[0].member_name,
                "Councilmember Lee"
            );
            assert_eq!(meeting.attendance_records[0].status, "present");
            assert_eq!(
                meeting.attendance_records[0].recorded_by,
                "City Clerk Morgan"
            );
            assert_eq!(
                meeting.attendance_records[1].member_name,
                "Councilmember Ortiz"
            );
            assert_eq!(meeting.attendance_records[1].status, "remote");
            assert!(meeting.attendance_records[1]
                .note
                .contains("remote participation"));
            assert_eq!(meeting.quorum_checks.len(), 1);
            assert_eq!(meeting.quorum_checks[0].status, "quorum met");
            assert_eq!(meeting.quorum_checks[0].required_count, 2);
            assert_eq!(meeting.quorum_checks[0].roster_count, 2);
            assert_eq!(meeting.quorum_checks[0].present_count, 1);
            assert_eq!(meeting.quorum_checks[0].remote_count, 1);
            assert!(meeting.quorum_checks[0]
                .review_note
                .contains("quorum met under majority rule"));
            assert_eq!(meeting.votes.len(), 1);
            assert_eq!(meeting.action_items.len(), 1);
            assert_eq!(meeting.action_records.len(), 1);
            assert_eq!(
                meeting.action_records[0].description,
                "Finance staff to publish the adopted budget."
            );
            assert_eq!(meeting.action_records[0].owner, "Finance Director");
            assert_eq!(meeting.action_records[0].due_date, "2026-07-08");
            assert_eq!(meeting.action_records[0].status, "open");
            assert_eq!(
                meeting.action_records[0].source_reference,
                "Budget ordinance motion"
            );
            assert_eq!(meeting.adopted_legislation.len(), 1);
            assert_eq!(
                meeting.adopted_legislation[0].title,
                "Budget Publication Ordinance"
            );
            assert_eq!(meeting.adopted_legislation[0].legislation_type, "ordinance");
            assert_eq!(
                meeting.adopted_legislation[0].source_motion_text,
                "Approve the budget ordinance."
            );
            assert_eq!(
                meeting.adopted_legislation[0].codification_section_hint,
                "Title 2, Chapter 4"
            );
            assert_eq!(
                meeting.adopted_legislation[0].handoff_status,
                "pending CivicCode sync"
            );
            assert_eq!(meeting.resident_comments.len(), 1);
            assert_eq!(meeting.minute_citations.len(), 2);
            assert_eq!(
                meeting.minute_citations[0].source_reference,
                "Packet item 4 fiscal note"
            );
            assert_eq!(meeting.minute_citations[1].access_level, "staff-only");
            assert_eq!(meeting.attachments.len(), 2);
            assert_eq!(meeting.attachments[0].title, "Fiscal note");
            assert_eq!(meeting.attachments[0].citation, "Packet item 4 fiscal note");
            assert_eq!(meeting.attachments[0].sha256.len(), 64);
            assert!(PathBuf::from(&meeting.attachments[0].stored_path).is_file());
            assert_eq!(
                meeting.attachments[1].access_level,
                "closed-session addendum"
            );
            assert_eq!(meeting.packet_assemblies.len(), 1);
            assert_eq!(
                meeting.packet_assemblies[0].packet_title,
                "Council budget packet"
            );
            assert_eq!(
                meeting.packet_assemblies[0].prepared_by,
                "Deputy Clerk Avery"
            );
            assert_eq!(meeting.packet_assemblies[0].agenda_item_count, 1);
            assert_eq!(meeting.packet_assemblies[0].public_attachment_count, 1);
            assert_eq!(
                meeting.packet_assemblies[0].closed_session_attachment_count,
                1
            );
            assert_eq!(meeting.packet_assemblies[0].status, "finalized");
            assert!(meeting.packet_assemblies[0]
                .review_note
                .contains("closed-session addendum boundaries"));
            assert!(meeting.packet_assemblies[0].finalized_at_unix_seconds > 0);
            assert_eq!(meeting.closed_sessions.len(), 1);
            assert_eq!(
                meeting.closed_sessions[0].statutory_basis,
                "State open meetings law Section 24-6-402(4)(b)"
            );
            assert_eq!(
                meeting.closed_sessions[0].topics,
                vec!["Attorney advice on budget litigation".to_string()]
            );
            assert_eq!(meeting.closed_sessions[0].attendees.len(), 3);
            assert_eq!(
                meeting.closed_sessions[0].staff_notes_reference,
                "closed-session-memo.txt"
            );
            assert!(meeting.minutes_adopted_at_unix_seconds.is_some());
            assert_eq!(meeting.minutes_signed_by, "City Clerk Morgan");
            assert_eq!(
                meeting.minutes_signature_attestation,
                "I attest these adopted minutes are ready for the official public record."
            );
            assert!(meeting.minutes_signed_at_unix_seconds.is_some());
            assert!(meeting.archived_at_unix_seconds.is_some());
            assert_eq!(meeting.exports.len(), 2);
            assert_ne!(meeting.exports[0], meeting.exports[1]);
            assert!(PathBuf::from(&meeting.exports[0]).is_file());
            assert!(PathBuf::from(&meeting.exports[1]).is_file());
            assert_eq!(meeting.export_bundles.len(), 2);
            assert!(!meeting.export_bundles[0].public_record);
            assert!(meeting.export_bundles[1].public_record);
            assert_eq!(meeting.export_bundles[0].agenda_item_count, 1);
            assert_eq!(meeting.export_bundles[0].notice_checklist_count, 1);
            assert_eq!(meeting.export_bundles[0].notice_posting_count, 1);
            assert_eq!(meeting.export_bundles[0].public_attachment_count, 1);
            assert_eq!(meeting.export_bundles[0].closed_session_attachment_count, 1);
            assert_eq!(meeting.export_bundles[0].packet_finalization_count, 1);
            assert_eq!(meeting.export_bundles[0].attendance_record_count, 2);
            assert_eq!(meeting.export_bundles[0].quorum_check_count, 1);
            assert_eq!(meeting.export_bundles[1].attendance_record_count, 2);
            assert_eq!(meeting.export_bundles[1].quorum_check_count, 1);
            assert_eq!(meeting.export_bundles[1].closed_session_attachment_count, 0);
            let packet = fs::read_to_string(&meeting.exports[0]).expect("packet reads");
            assert_export_integrity_manifest(&meeting.exports[0], &packet);
            assert_meeting_export_bundle_manifest(
                &meeting.export_bundles[0],
                &meeting.exports[0],
                &packet,
                false,
                1,
            );
            assert!(packet.contains("Body: City Council"));
            assert!(packet.contains("## Staff Reports"));
            assert!(packet.contains("Finance Director Rivera"));
            assert!(packet.contains("Enterprise fund reserve targets"));
            assert!(packet.contains("## Packet Attachments"));
            assert!(packet.contains("Fiscal note"));
            assert!(packet.contains("Packet item 4 fiscal note"));
            assert!(packet.contains("Closed-session attorney memo"));
            assert!(packet.contains("## Packet Finalization"));
            assert!(packet.contains("Council budget packet"));
            assert!(packet.contains("Deputy Clerk Avery"));
            assert!(packet.contains("closed-session addendum boundaries"));
            assert!(packet.contains("## Closed Sessions"));
            assert!(packet.contains("City Attorney"));
            assert!(packet.contains("closed-session-memo.txt"));
            assert!(packet.contains("## Motions"));
            assert!(packet.contains("Approve the budget ordinance."));
            assert!(packet.contains("Councilmember Lee"));
            assert!(packet.contains("## Roll Call Votes"));
            assert!(packet.contains("Councilmember Lee: aye"));
            assert!(packet.contains("Councilmember Ortiz: nay"));
            assert!(packet.contains("## Minute Citations"));
            assert!(packet.contains("Executive session memo"));
            assert!(packet.contains("## Minutes Signature"));
            assert!(packet.contains("City Clerk Morgan"));
            assert!(packet.contains("## Adopted Ordinances And Resolutions"));
            assert!(packet.contains("Budget Publication Ordinance"));
            assert!(packet.contains("## Attendance"));
            assert!(packet.contains("Councilmember Lee: present"));
            assert!(packet.contains("Councilmember Ortiz: remote"));
            assert!(packet.contains("remote participation policy"));
            assert!(packet.contains("## Quorum Checks"));
            assert!(packet.contains("quorum met"));
            assert!(packet.contains("present/remote 2 of required 2"));
            let archive = fs::read_to_string(&meeting.exports[1]).expect("archive reads");
            assert_export_integrity_manifest(&meeting.exports[1], &archive);
            assert_meeting_export_bundle_manifest(
                &meeting.export_bundles[1],
                &meeting.exports[1],
                &archive,
                true,
                0,
            );
            assert!(archive.contains("Body: City Council"));
            assert!(archive.contains("## Notice Checklist"));
            assert!(archive.contains("Municipal open meetings notice"));
            assert!(archive.contains("## Notice Posting Evidence"));
            assert!(archive.contains("City Hall bulletin board and city website"));
            assert!(archive.contains("Local AI minutes draft"));
            assert!(archive.contains("## Motions"));
            assert!(archive.contains("Approve the budget ordinance."));
            assert!(archive.contains("Councilmember Patel"));
            assert!(archive.contains("## Roll Call Votes"));
            assert!(archive.contains("Councilmember Lee: aye"));
            assert!(archive.contains("Councilmember Ortiz: nay"));
            assert!(archive.contains("## Action Items"));
            assert!(archive.contains("## Action Item Details"));
            assert!(archive.contains("Finance staff to publish the adopted budget."));
            assert!(archive.contains("Finance Director"));
            assert!(archive.contains("2026-07-08"));
            assert!(archive.contains("Budget ordinance motion"));
            assert!(archive.contains("## Minutes Signature"));
            assert!(archive.contains("City Clerk Morgan"));
            assert!(archive.contains("official public record"));
            assert!(archive.contains("## Adopted Ordinances And Resolutions"));
            assert!(archive.contains("Budget Publication Ordinance"));
            assert!(archive.contains("Title 2, Chapter 4"));
            assert!(archive.contains("## Attendance"));
            assert!(archive.contains("Councilmember Lee: present"));
            assert!(archive.contains("Councilmember Ortiz: remote"));
            assert!(archive.contains("## Quorum Checks"));
            assert!(archive.contains("quorum met"));
            assert!(archive.contains("present/remote 2 of required 2"));
            assert!(archive.contains("## Staff Reports"));
            assert!(archive.contains("Finance Director Rivera"));
            assert!(archive.contains("Enterprise fund reserve targets"));
            assert!(archive.contains("## Staff-Entered Resident Comments"));
            assert!(archive.contains("Resident asked for sidewalk funding."));
            assert!(archive.contains("## Packet Attachments"));
            assert!(archive.contains("Fiscal note"));
            assert!(archive.contains("local path hidden"));
            assert!(archive.contains("## Packet Finalization"));
            assert!(archive.contains("Council budget packet"));
            assert!(archive.contains("Deputy Clerk Avery"));
            assert!(archive.contains("closed-session addendum boundaries"));
            assert!(archive.contains("## Closed Sessions"));
            assert!(archive.contains("Attorney advice on budget litigation"));
            assert!(archive.contains("Council reconvened in open session"));
            assert!(!archive.contains("City Attorney"));
            assert!(!archive.contains("closed-session-memo.txt"));
            assert!(!archive.contains("Closed-session attorney memo"));
            assert!(!archive.contains("closed-session-memo"));
            assert!(archive.contains("## Minute Citations"));
            assert!(archive.contains("Packet item 4 fiscal note"));
            assert!(!archive.contains("Executive session memo"));
            let attachment_results = search_city_work(&state, "Packet item 4 fiscal note");
            assert_eq!(attachment_results.len(), 1);
            let citation_results = search_city_work(&state, "Supports budget action");
            assert_eq!(citation_results.len(), 1);
            let body_results = search_city_work(&state, "City Charter Section 2.1");
            assert!(body_results
                .iter()
                .any(|result| result.title == "Meeting body: City Council"));
            let member_role_results = search_city_work(&state, "Mayor Pro Tem");
            assert!(member_role_results
                .iter()
                .any(|result| result.title == "Meeting member: Councilmember Lee"));
            let motion_results = search_city_work(&state, "Councilmember Patel");
            assert_eq!(motion_results.len(), 1);
            let member_vote_results = search_city_work(&state, "Councilmember Ortiz");
            assert!(member_vote_results
                .iter()
                .any(|result| result.title == "Meeting member: Councilmember Ortiz"));
            assert!(member_vote_results
                .iter()
                .any(|result| result.title == "Council Regular Meeting"));
            let attendance_results = search_city_work(&state, "remote participation policy");
            assert_eq!(attendance_results.len(), 1);
            let quorum_results = search_city_work(&state, "quorum met under majority rule");
            assert_eq!(quorum_results.len(), 1);
            let action_owner_results = search_city_work(&state, "Finance Director");
            assert_eq!(action_owner_results.len(), 1);
            let action_source_results = search_city_work(&state, "Budget ordinance motion");
            assert_eq!(action_source_results.len(), 1);
            let staff_report_results = search_city_work(&state, "Enterprise fund reserve targets");
            assert_eq!(staff_report_results.len(), 1);
            let packet_review_results = search_city_work(&state, "Deputy Clerk Avery");
            assert_eq!(packet_review_results.len(), 1);
            let signature_results = search_city_work(&state, "City Clerk Morgan");
            assert_eq!(signature_results.len(), 1);
            let closed_session_results = search_city_work(&state, "budget litigation");
            assert_eq!(closed_session_results.len(), 1);
            let adopted_legislation_results =
                search_city_work(&state, "Budget Publication Ordinance");
            assert_eq!(adopted_legislation_results.len(), 2);
            assert_eq!(state.adopted_legislation.len(), 1);
            assert_eq!(
                state.adopted_legislation[0].title,
                "Budget Publication Ordinance"
            );
            assert_eq!(state.code_sources.len(), 1);
            assert_eq!(state.code_sources[0].title, "Budget Publication Ordinance");
            assert_eq!(
                state.code_sources[0].codifier_sync_status,
                "pending codifier sync"
            );
            assert!(state.code_sources[0].citation.contains("Adopted ordinance"));
            let public_state = public_city_work_state().expect("public state reads");
            assert_eq!(public_state.meeting_bodies.len(), 1);
            assert_eq!(public_state.meeting_members.len(), 2);
            assert_eq!(
                public_state.meeting_bodies[0].statutory_basis,
                "City Charter Section 2.1"
            );
            let public_meeting = public_state
                .meetings
                .first()
                .expect("public meeting exists");
            assert_eq!(public_meeting.body_id, body.id);
            assert_eq!(public_meeting.body_name, "City Council");
            assert!(public_meeting.exports.is_empty());
            assert_eq!(public_meeting.motions.len(), 1);
            assert_eq!(public_meeting.member_votes.len(), 2);
            assert_eq!(
                public_meeting.member_votes[0].member_name,
                "Councilmember Lee"
            );
            assert_eq!(public_meeting.member_votes[0].vote, "aye");
            assert_eq!(public_meeting.attendance_records.len(), 2);
            assert_eq!(public_meeting.attendance_records[0].status, "present");
            assert_eq!(public_meeting.quorum_checks.len(), 1);
            assert_eq!(public_meeting.quorum_checks[0].status, "quorum met");
            assert_eq!(public_meeting.staff_reports.len(), 1);
            assert_eq!(
                public_meeting.staff_reports[0].recommendation,
                "Approve the budget ordinance"
            );
            assert_eq!(public_meeting.action_records.len(), 1);
            assert_eq!(public_meeting.adopted_legislation.len(), 1);
            assert_eq!(
                public_meeting.adopted_legislation[0].title,
                "Budget Publication Ordinance"
            );
            assert_eq!(public_meeting.closed_sessions.len(), 1);
            assert_eq!(
                public_meeting.closed_sessions[0].topics,
                vec!["Attorney advice on budget litigation".to_string()]
            );
            assert!(public_meeting.closed_sessions[0].attendees.is_empty());
            assert!(public_meeting.closed_sessions[0]
                .staff_notes_reference
                .is_empty());
            assert_eq!(public_meeting.minutes_signed_by, "City Clerk Morgan");
            assert!(public_meeting
                .minutes_signature_attestation
                .contains("official public record"));
            assert!(public_meeting.minutes_signed_at_unix_seconds.is_some());
            assert_eq!(public_meeting.attachments.len(), 1);
            assert_eq!(public_meeting.attachments[0].title, "Fiscal note");
            assert!(public_meeting.attachments[0].original_path.is_empty());
            assert!(public_meeting.attachments[0].stored_path.is_empty());
            assert_eq!(public_meeting.packet_assemblies.len(), 1);
            assert_eq!(
                public_meeting.packet_assemblies[0].packet_title,
                "Council budget packet"
            );
            assert_eq!(
                public_meeting.packet_assemblies[0].prepared_by,
                "Deputy Clerk Avery"
            );
            assert_eq!(public_meeting.export_bundles.len(), 1);
            assert!(public_meeting.export_bundles[0].public_record);
            assert!(public_meeting.export_bundles[0].export_path.is_empty());
            assert!(public_meeting.export_bundles[0].manifest_path.is_empty());
            assert!(public_meeting.export_bundles[0]
                .integrity_manifest_path
                .is_empty());
            assert_eq!(
                public_meeting.export_bundles[0].closed_session_attachment_count,
                0
            );
            assert_eq!(public_meeting.minute_citations.len(), 1);
            assert_eq!(
                public_meeting.minute_citations[0].source_reference,
                "Packet item 4 fiscal note"
            );
            assert!(state
                .audit_entries
                .iter()
                .any(|entry| entry.action == "archive-meeting"));
            let publication = state
                .publication_events
                .iter()
                .find(|event| event.record_type == "meeting-archive")
                .expect("meeting archive publication event exists");
            assert_eq!(publication.source_module, "civicclerk");
            assert_eq!(publication.source_record_id, meeting.id);
            assert_eq!(publication.payload_hash.len(), 64);
            assert!(publication.retracted_at_unix_seconds.is_none());
            assert!(state.audit_entries.len() >= 10);
            assert_valid_audit_chain(&state.audit_entries);

            let late_vote = serde_json::json!({ "vote": "Late amendment after archive." });
            let error = match city_work_action("record-vote", Some(&late_vote)) {
                Ok(_) => panic!("archived meeting cannot be mutated"),
                Err(error) => error,
            };
            assert!(error.contains("archived as a public record"));
            let late_member_vote = serde_json::json!({
                "memberVoteMemberId": lee_member.id.clone(),
                "memberVoteValue": "abstain"
            });
            let error = match city_work_action("record-member-vote", Some(&late_member_vote)) {
                Ok(_) => panic!("archived meeting cannot record roll-call votes"),
                Err(error) => error,
            };
            assert!(error.contains("archived as a public record"));
            let late_attendance = serde_json::json!({
                "attendanceMemberId": lee_member.id.clone(),
                "attendanceStatus": "absent",
                "attendanceRecordedBy": "City Clerk Morgan"
            });
            let error = match city_work_action("record-meeting-attendance", Some(&late_attendance))
            {
                Ok(_) => panic!("archived meeting cannot record attendance"),
                Err(error) => error,
            };
            assert!(error.contains("archived as a public record"));
            let late_quorum = serde_json::json!({
                "quorumReviewNote": "Late quorum check after archive."
            });
            let error = match city_work_action("record-quorum-check", Some(&late_quorum)) {
                Ok(_) => panic!("archived meeting cannot record quorum checks"),
                Err(error) => error,
            };
            assert!(error.contains("archived as a public record"));
            let late_motion = serde_json::json!({
                "motionText": "Late motion after archive.",
                "motionMover": "Councilmember Lee",
                "motionDisposition": "passed"
            });
            let error = match city_work_action("record-motion", Some(&late_motion)) {
                Ok(_) => panic!("archived meeting cannot record new motions"),
                Err(error) => error,
            };
            assert!(error.contains("archived as a public record"));
            let late_action = serde_json::json!({
                "actionItem": "Late action after archive.",
                "actionItemOwner": "Finance Director"
            });
            let error = match city_work_action("add-action-item", Some(&late_action)) {
                Ok(_) => panic!("archived meeting cannot record new action items"),
                Err(error) => error,
            };
            assert!(error.contains("archived as a public record"));
            let late_staff_report = serde_json::json!({
                "staffReportRecommendation": "Late recommendation",
                "staffReportBackground": "Late background",
                "staffReportAnalysis": "Late analysis",
                "staffReportFiscalImpact": "Late fiscal impact",
                "staffReportAlternatives": "Late alternatives",
                "staffReportPriorActions": "Late prior action",
                "staffReportPreparedBy": "Late preparer"
            });
            let error = match city_work_action("record-staff-report", Some(&late_staff_report)) {
                Ok(_) => panic!("archived meeting cannot record staff reports"),
                Err(error) => error,
            };
            assert!(error.contains("archived as a public record"));
            let late_closed_session = serde_json::json!({
                "closedSessionBasis": "Late basis",
                "closedSessionTopics": "Late topic",
                "closedSessionEnteredAt": "8:00 PM",
                "closedSessionExitedAt": "8:10 PM",
                "closedSessionReconvene": "Late reconvene statement."
            });
            let error = match city_work_action("record-closed-session", Some(&late_closed_session))
            {
                Ok(_) => panic!("archived meeting cannot record closed sessions"),
                Err(error) => error,
            };
            assert!(error.contains("archived as a public record"));
            let late_packet_finalization = serde_json::json!({
                "packetPreparedBy": "Late Clerk",
                "packetReviewNote": "Late review after archive."
            });
            let error = match city_work_action(
                "finalize-meeting-packet",
                Some(&late_packet_finalization),
            ) {
                Ok(_) => panic!("archived meeting cannot finalize a new packet record"),
                Err(error) => error,
            };
            assert!(error.contains("archived as a public record"));

            city_work_action("export-meeting-packet", None).expect("archived packet can re-export");
            let reloaded = city_work_state().expect("state reads after re-export");
            let reloaded_meeting = reloaded.meetings.first().expect("meeting exists");
            assert_eq!(reloaded_meeting.status, "archived public record");
            assert_eq!(reloaded_meeting.exports.len(), 3);
            assert_eq!(reloaded_meeting.export_bundles.len(), 3);
            let public_reexport = fs::read_to_string(
                reloaded_meeting
                    .exports
                    .last()
                    .expect("re-export path exists"),
            )
            .expect("public re-export reads");
            assert_meeting_export_bundle_manifest(
                reloaded_meeting
                    .export_bundles
                    .last()
                    .expect("re-export bundle exists"),
                reloaded_meeting
                    .exports
                    .last()
                    .expect("re-export path exists"),
                &public_reexport,
                true,
                0,
            );
            assert!(public_reexport.contains("Body: City Council"));
            assert!(public_reexport.contains("Fiscal note"));
            assert!(public_reexport.contains("## Packet Finalization"));
            assert!(public_reexport.contains("Deputy Clerk Avery"));
            assert!(public_reexport.contains("## Roll Call Votes"));
            assert!(public_reexport.contains("Councilmember Lee: aye"));
            assert!(public_reexport.contains("## Attendance"));
            assert!(public_reexport.contains("Councilmember Ortiz: remote"));
            assert!(public_reexport.contains("## Quorum Checks"));
            assert!(public_reexport.contains("quorum met"));
            assert!(!public_reexport.contains("Closed-session attorney memo"));
            assert!(public_reexport.contains("Packet item 4 fiscal note"));
            assert!(!public_reexport.contains("Executive session memo"));
        });
    }

    #[test]
    fn agenda_intake_requires_review_before_promotion_and_preserves_source() {
        with_temp_state_dir(|_| {
            let meeting_body_id = create_city_council_body();
            let meeting = serde_json::json!({
                "meetingBodyId": meeting_body_id,
                "title": "Council Regular Meeting",
                "meetingDate": "2026-07-01",
                "summary": "Review infrastructure requests"
            });
            city_work_action("create-meeting", Some(&meeting)).expect("meeting created");

            let incomplete_intake = serde_json::json!({
                "agendaIntakeTitle": "Bridge repair contract",
                "agendaIntakeSubmitter": "Public Works Director",
                "agendaIntakeDepartment": "Public Works",
                "agendaIntakeSummary": "Request council review of the bridge repair contract."
            });
            let error = match city_work_action("submit-agenda-intake", Some(&incomplete_intake)) {
                Ok(_) => panic!("agenda intake cannot save without source evidence"),
                Err(error) => error,
            };
            assert!(error.contains("source or citation"));

            let intake = serde_json::json!({
                "agendaIntakeTitle": "Bridge repair contract",
                "agendaIntakeSubmitter": "Public Works Director",
                "agendaIntakeDepartment": "Public Works",
                "agendaIntakeSummary": "Request council review of the bridge repair contract.",
                "agendaIntakeSourceReference": "Public Works memo PW-2026-14",
                "agendaIntakeMeetingDate": "2026-07-01"
            });
            city_work_action("submit-agenda-intake", Some(&intake)).expect("intake submitted");

            let initial_state = city_work_state().expect("state reads after intake");
            let meeting_id = initial_state
                .meetings
                .first()
                .expect("meeting exists")
                .id
                .clone();
            let intake_id = initial_state
                .agenda_intakes
                .first()
                .expect("agenda intake exists")
                .id
                .clone();

            let premature_promotion = serde_json::json!({
                "meetingId": meeting_id,
                "agendaIntakeId": intake_id
            });
            let error = match city_work_action("promote-agenda-intake", Some(&premature_promotion))
            {
                Ok(_) => panic!("agenda intake cannot promote before ready review"),
                Err(error) => error,
            };
            assert!(error.contains("Review the agenda intake item as ready"));

            let missing_note = serde_json::json!({
                "agendaIntakeId": intake_id,
                "agendaIntakeDecision": "ready for agenda"
            });
            let error = match city_work_action("review-agenda-intake", Some(&missing_note)) {
                Ok(_) => panic!("agenda intake review requires a note"),
                Err(error) => error,
            };
            assert!(error.contains("review note"));

            let review = serde_json::json!({
                "agendaIntakeId": intake_id,
                "agendaIntakeDecision": "ready for agenda",
                "agendaIntakeReviewNote": "Clerk verified the source memo and meeting fit."
            });
            city_work_action("review-agenda-intake", Some(&review)).expect("intake reviewed");

            let state_after_review = city_work_state().expect("state reads after review");
            let intake_after_review = state_after_review
                .agenda_intakes
                .first()
                .expect("agenda intake exists");
            assert_eq!(intake_after_review.status, "ready for agenda");
            assert!(intake_after_review.reviewed_at_unix_seconds.is_some());
            let meeting_id = state_after_review
                .meetings
                .first()
                .expect("meeting exists")
                .id
                .clone();
            let intake_id = intake_after_review.id.clone();

            city_work_action(
                "promote-agenda-intake",
                Some(&serde_json::json!({
                    "meetingId": meeting_id,
                    "agendaIntakeId": intake_id
                })),
            )
            .expect("intake promoted");

            let state = city_work_state().expect("state reads after promotion");
            let intake = state.agenda_intakes.first().expect("agenda intake exists");
            assert_eq!(intake.status, "promoted to agenda");
            assert_eq!(intake.department, "Public Works");
            assert_eq!(intake.source_reference, "Public Works memo PW-2026-14");
            assert_eq!(intake.requested_meeting_date, "2026-07-01");
            assert!(intake.promoted_at_unix_seconds.is_some());
            assert!(!intake.meeting_id.is_empty());
            assert!(!intake.agenda_item_id.is_empty());

            let meeting = state.meetings.first().expect("meeting exists");
            assert_eq!(meeting.agenda_items.len(), 1);
            let agenda_item = meeting.agenda_items.first().expect("agenda item exists");
            assert_eq!(agenda_item.title, "Bridge repair contract");
            assert_eq!(agenda_item.status, "ready");
            assert_eq!(agenda_item.visibility, "public draft");
            assert_eq!(agenda_item.source_module, "civicclerk");
            assert_eq!(agenda_item.source_record_id, intake.id);
            assert_eq!(agenda_item.source_reference, "Public Works memo PW-2026-14");
            assert_eq!(agenda_item.department, "Public Works");

            let source_results = search_city_work(&state, "PW-2026-14");
            assert!(source_results
                .iter()
                .any(|result| result.title == "Agenda intake: Bridge repair contract"));
            assert!(source_results
                .iter()
                .any(|result| result.title == "Council Regular Meeting"));
            let department_results = search_city_work(&state, "Public Works");
            assert!(department_results
                .iter()
                .any(|result| result.title == "Agenda intake: Bridge repair contract"));
            assert!(department_results
                .iter()
                .any(|result| result.title == "Council Regular Meeting"));

            let public_state = city_work_public_projection(&state);
            assert!(public_state.agenda_intakes.is_empty());
            assert!(state
                .audit_entries
                .iter()
                .any(|entry| entry.action == "submit-agenda-intake"));
            assert!(state
                .audit_entries
                .iter()
                .any(|entry| entry.action == "review-agenda-intake"));
            assert!(state
                .audit_entries
                .iter()
                .any(|entry| entry.action == "promote-agenda-intake"));
            assert_valid_audit_chain(&state.audit_entries);
        });
    }

    #[test]
    fn public_comment_intake_requires_posted_meeting_and_is_preserved() {
        with_temp_state_dir(|_| {
            let meeting_body_id = create_city_council_body();
            let payload = serde_json::json!({
                "meetingBodyId": meeting_body_id,
                "title": "Council Hearing",
                "meetingDate": "2026-07-15",
                "summary": "Sidewalk tree ordinance hearing",
                "agendaTitle": "Discuss sidewalk tree ordinance"
            });
            city_work_action("create-meeting", Some(&payload)).expect("meeting created");
            let state = city_work_state().expect("state reads");
            let meeting_id = state.meetings.first().expect("meeting exists").id.clone();
            let public_comment = serde_json::json!({
                "meetingId": meeting_id.clone(),
                "commenterName": "Jordan Smith",
                "commenterContact": "jordan@example.gov",
                "commentMode": "remote",
                "commentTopic": "Agenda item: sidewalk trees",
                "commentBody": "Please preserve the mature trees on Maple Avenue."
            });
            let error = match city_work_action("submit-public-comment", Some(&public_comment)) {
                Ok(_) => panic!("comment cannot be submitted before public posting"),
                Err(error) => error,
            };
            assert!(error.contains("Public comments open only after"));

            city_work_action(
                "complete-notice-checklist",
                Some(&serde_json::json!({
                    "meetingId": meeting_id.clone(),
                    "noticeMeetingType": "Public hearing",
                    "noticeStatutoryBasis": "Municipal hearing notice",
                    "noticeDeadline": "2026-07-14",
                    "noticeTimeZone": "America/Denver",
                    "noticeHumanApproval": true
                })),
            )
            .expect("notice checklist approved");
            city_work_action(
                "post-notice",
                Some(&serde_json::json!({
                    "meetingId": meeting_id.clone(),
                    "postingLocation": "City website",
                    "postingMethod": "Meeting notice web posting",
                    "postingConfirmation": "Clerk confirmed website posting.",
                    "postingDate": "2026-07-14"
                })),
            )
            .expect("notice posted");
            city_work_action("submit-public-comment", Some(&public_comment))
                .expect("public comment saved");
            let state = city_work_state().expect("state reads after comment");
            let comment_id = state
                .meetings
                .first()
                .expect("meeting exists")
                .public_comments
                .first()
                .expect("comment exists")
                .id
                .clone();
            let review = serde_json::json!({
                "meetingId": meeting_id.clone(),
                "publicCommentId": comment_id.clone()
            });
            city_work_action("review-public-comment", Some(&review)).expect("comment reviewed");
            let redaction = serde_json::json!({
                "meetingId": meeting_id.clone(),
                "publicCommentId": comment_id,
                "redactedBody": "Please preserve the mature street trees.",
                "redactionBasis": "Personally identifying information"
            });
            city_work_action("redact-public-comment", Some(&redaction)).expect("comment redacted");
            city_work_action(
                "export-meeting-packet",
                Some(&serde_json::json!({ "meetingId": meeting_id })),
            )
            .expect("packet exported");

            let state = city_work_state().expect("state reads");
            let meeting = state.meetings.first().expect("meeting exists");
            assert_eq!(meeting.public_comments.len(), 1);
            let comment = meeting.public_comments.first().expect("comment exists");
            assert_eq!(comment.commenter_name, "Jordan Smith");
            assert_eq!(comment.commenter_contact, "jordan@example.gov");
            assert_eq!(comment.mode, "remote");
            assert_eq!(comment.status, "redacted for public record");
            assert_eq!(
                comment.redacted_body,
                "Please preserve the mature street trees."
            );
            assert_eq!(
                comment.redaction_basis,
                "Personally identifying information"
            );
            assert!(comment.reviewed_at_unix_seconds.is_some());
            assert!(comment.redacted_at_unix_seconds.is_some());
            let exported = fs::read_to_string(meeting.exports.first().expect("export exists"))
                .expect("export reads");
            assert!(exported.contains("## Public Comments"));
            assert!(exported.contains("Please preserve the mature street trees."));
            assert!(exported.contains("Redaction basis: Personally identifying information"));
            assert!(!exported.contains("Maple Avenue"));
            let results = search_city_work(&state, "Maple Avenue");
            assert_eq!(results.len(), 1);
            assert!(state.audit_entries.iter().any(|entry| {
                entry.module_id == "civicclerk" && entry.action == "submit-public-comment"
            }));
            assert!(state
                .audit_entries
                .iter()
                .any(|entry| entry.action == "review-public-comment"));
            assert!(state.audit_entries.iter().any(|entry| {
                entry.action == "redact-public-comment"
                    && entry.summary.contains("Personally identifying information")
            }));
            assert_valid_audit_chain(&state.audit_entries);
        });
    }

    #[test]
    fn records_revisions_require_fresh_approval_exports_and_packages() {
        with_temp_state_dir(|_| {
            city_work_action(
                "create-records-request",
                Some(&serde_json::json!({
                    "requester": "Synthetic revision test", "summary": "Fictional park records",
                    "deadline": "2026-10-16"
                })),
            )
            .expect("create");
            city_work_action("record-records-search-session", Some(&serde_json::json!({
                "searchQuery": "fictional park", "searchLocations": "synthetic archive",
                "searchResultTitle": "Synthetic list", "searchResultCitation": "TEST-001",
                "searchResultSummary": "Fictional responsive list", "searchResultStatus": "responsive",
                "searchReviewer": "Synthetic reviewer"
            }))).expect("search");
            city_work_action("add-records-exemption-decision", Some(&serde_json::json!({
                "exemptionSource": "TEST-001", "exemptionKind": "none",
                "exemptionFinding": "Fictional list is releasable", "exemptionDecision": "release",
                "exemptionBasis": "Synthetic policy", "exemptionReviewer": "Synthetic reviewer"
            }))).expect("decision");
            city_work_action(
                "draft-records-response",
                Some(&serde_json::json!({
                    "responseDraft": "Original human-reviewed response", "citation": "TEST-001"
                })),
            )
            .expect("draft");
            city_work_action("approve-records-response", None).expect("approve");
            city_work_action("build-records-release-package", None).expect("package");
            city_work_action("export-records-response", None).expect("export");
            let baseline = city_work_state().expect("baseline");
            let historical_path = baseline.records_requests[0].exports[0].clone();
            let historical_bytes = fs::read(&historical_path).expect("historical export");
            for (action, payload) in [
                (
                    "draft-records-response",
                    Some(serde_json::json!({"responseDraft": "Changed human draft"})),
                ),
                ("suggest-records-response", None),
                (
                    "record-records-search",
                    Some(serde_json::json!({"sourceNote": "New evidence", "citation": "TEST-002"})),
                ),
                (
                    "estimate-records-fee",
                    Some(serde_json::json!({"feeEstimate": "$20 synthetic estimate"})),
                ),
            ] {
                write_state(&baseline).expect("reset saved baseline");
                env::set_var(
                    "CIVICSUITE_FAKE_MODEL_RESPONSE",
                    "Changed AI draft for human review",
                );
                let result = city_work_action(action, payload.as_ref());
                env::remove_var("CIVICSUITE_FAKE_MODEL_RESPONSE");
                result.expect("successful content change");
                let changed = city_work_state().expect("changed state");
                assert!(
                    changed.records_requests[0]
                        .approved_at_unix_seconds
                        .is_none(),
                    "{action}"
                );
                assert_eq!(
                    changed.records_requests[0].release_revision,
                    baseline.records_requests[0].release_revision + 1
                );
                assert!(city_work_action("export-records-response", None).is_err());
                assert!(city_work_action("fulfill-records-request", None).is_err());
                assert_eq!(
                    fs::read(&historical_path).expect("historical retained"),
                    historical_bytes
                );
                city_work_action("approve-records-response", None).expect("fresh human approval");
                let error = city_work_action("fulfill-records-request", None)
                    .err()
                    .expect("stale export rejected");
                assert!(error.contains("newly approved response revision"));
                city_work_action("export-records-response", None).expect("fresh export");
                let error = city_work_action("fulfill-records-request", None)
                    .err()
                    .expect("stale package rejected");
                assert!(error.contains("current response revision"));
                city_work_action("build-records-release-package", None).expect("fresh package");
                city_work_action("fulfill-records-request", None)
                    .expect("fresh release can fulfill");
            }
            // Legacy on-disk requests retain historical approvals/artifact
            // references at revision zero until a successful content edit.
            let mut legacy =
                serde_json::to_value(&baseline.records_requests[0]).expect("serialize");
            for field in ["release_revision", "exported_revision", "packaged_revision"] {
                legacy
                    .as_object_mut()
                    .expect("request object")
                    .remove(field);
            }
            let restored: RecordsRequest = serde_json::from_value(legacy).expect("legacy request");
            assert_eq!(restored.release_revision, 0);
            assert_eq!(restored.exported_revision, 0);
            assert_eq!(restored.packaged_revision, 0);
            assert_eq!(restored.exports, baseline.records_requests[0].exports);
            assert!(restored.approved_at_unix_seconds.is_some());
        });
    }

    #[test]
    fn records_failed_generation_preserves_prior_approval_and_revision() {
        with_temp_state_dir(|_| {
            city_work_action("create-records-request", Some(&serde_json::json!({
                "requester": "Synthetic unavailable AI", "summary": "Fictional records", "deadline": "2026-10-16"
            }))).expect("create");
            city_work_action(
                "draft-records-response",
                Some(&serde_json::json!({
                    "responseDraft": "Previously approved human response", "citation": "TEST-001"
                })),
            )
            .expect("draft");
            city_work_action("approve-records-response", None).expect("approve");
            let before =
                serde_json::to_value(city_work_state().expect("before")).expect("serialize before");
            env::set_var(
                "CIVICSUITE_FAKE_MODEL_ERROR",
                "Synthetic model failure after readiness",
            );
            let result = city_work_action("suggest-records-response", None);
            env::remove_var("CIVICSUITE_FAKE_MODEL_ERROR");
            assert!(result.is_err());
            let after =
                serde_json::to_value(city_work_state().expect("after")).expect("serialize after");
            assert_eq!(before, after);
        });
    }

    #[test]
    fn records_workflow_requires_human_approval_before_release() {
        with_temp_state_dir(|root| {
            let payload = serde_json::json!({
                "requester": "Alex Rivera",
                "summary": "Emails about park contract",
                "deadline": "2026-07-10"
            });
            city_work_action("create-records-request", Some(&payload)).expect("request created");
            let clarification = serde_json::json!({
                "clarificationNote": "Asked requester to narrow the date range."
            });
            city_work_action("request-records-clarification", Some(&clarification))
                .expect("clarification saved");
            let staff_message = serde_json::json!({
                "requestMessageBody": "We received the narrowed date range and are searching responsive records."
            });
            city_work_action("add-records-message", Some(&staff_message))
                .expect("request message saved");
            let assignment = serde_json::json!({ "assignedTo": "Records Officer" });
            city_work_action("assign-records-request", Some(&assignment)).expect("assigned");
            let search = serde_json::json!({
                "sourceNote": "Searched parks shared drive and clerk email journal.",
                "citation": "PRA-2026-001"
            });
            city_work_action("record-records-search", Some(&search)).expect("search saved");
            let search_session = serde_json::json!({
                "searchQuery": "park contract emails June 2026",
                "searchLocations": "Parks shared drive; clerk email journal",
                "searchResultTitle": "Park contract approval email",
                "searchResultCitation": "PRA-2026-004",
                "searchResultSummary": "Responsive approval email located in clerk journal.",
                "searchResultStatus": "responsive",
                "searchReviewer": "Records Officer"
            });
            city_work_action("record-records-search-session", Some(&search_session))
                .expect("search session saved");
            let source_document = root.join("responsive-park-contract-email.txt");
            fs::write(
                &source_document,
                "Responsive park contract email attachment for review.",
            )
            .expect("source document writes");
            let document = serde_json::json!({
                "documentTitle": "Park contract email attachment",
                "documentSourcePath": source_document.to_string_lossy(),
                "documentCitation": "PRA-2026-003"
            });
            city_work_action("add-records-document", Some(&document)).expect("document attached");
            env::set_var(
                "CIVICSUITE_FAKE_MODEL_RESPONSE",
                "Local AI draft response for responsive park contract records.",
            );
            let suggested =
                city_work_action("suggest-records-response", None).expect("AI draft generated");
            env::remove_var("CIVICSUITE_FAKE_MODEL_RESPONSE");
            assert!(suggested.message.contains("Local AI records draft"));
            let suggested_state = city_work_state().expect("state reads after AI draft");
            assert!(suggested_state.records_requests[0]
                .response_draft
                .contains("Local AI draft response"));
            let exemption = serde_json::json!({
                "exemptionNote": "Reviewed attorney-client content; no auto-redaction applied."
            });
            city_work_action("add-records-exemption-review", Some(&exemption))
                .expect("exemption saved");
            let bad_exemption_decision = serde_json::json!({
                "exemptionSource": "Email attachment page 2",
                "exemptionKind": "Attorney-client",
                "exemptionFinding": "One paragraph contains privileged legal advice.",
                "exemptionDecision": "maybe",
                "exemptionBasis": "CORA attorney-client privilege"
            });
            let error = match city_work_action(
                "add-records-exemption-decision",
                Some(&bad_exemption_decision),
            ) {
                Ok(_) => panic!("exemption decision cannot save ambiguous value"),
                Err(error) => error,
            };
            assert!(error.contains("release, redact, or exempt"));
            let exemption_decision = serde_json::json!({
                "exemptionSource": "Email attachment page 2",
                "exemptionKind": "Attorney-client",
                "exemptionFinding": "One paragraph contains privileged legal advice.",
                "exemptionDecision": "redact",
                "exemptionBasis": "CORA attorney-client privilege",
                "exemptionReviewer": "Records Officer"
            });
            city_work_action("add-records-exemption-decision", Some(&exemption_decision))
                .expect("exemption decision saved");
            let bad_fee = serde_json::json!({
                "feeLineDescription": "Search time",
                "feeScheduleBasis": "Adopted records fee schedule",
                "feeLineAmount": "free"
            });
            let error = match city_work_action("add-records-fee-line", Some(&bad_fee)) {
                Ok(_) => panic!("fee line cannot save without dollars and cents"),
                Err(error) => error,
            };
            assert!(error.contains("dollars and cents"));
            let fee_line = serde_json::json!({
                "feeLineDescription": "Search time and copies",
                "feeScheduleBasis": "Adopted records fee schedule",
                "feeLineAmount": "12.50"
            });
            city_work_action("add-records-fee-line", Some(&fee_line)).expect("fee line saved");
            let fee_waiver = serde_json::json!({
                "feeWaiverReason": "Public interest waiver approved by clerk."
            });
            city_work_action("waive-records-fee", Some(&fee_waiver)).expect("fee waiver saved");
            let draft = serde_json::json!({
                "responseDraft": "Responsive records are attached for review.",
                "citation": "PRA-2026-002"
            });
            city_work_action("draft-records-response", Some(&draft)).expect("draft saved");
            let error = match city_work_action("export-records-response", None) {
                Ok(_) => panic!("records response cannot export before human approval"),
                Err(error) => error,
            };
            assert!(error.contains("Approve the records response"));
            let approval = serde_json::json!({ "approvalNote": "Reviewed and approved by clerk." });
            let package_without_release_copy =
                match city_work_action("build-records-release-package", None) {
                    Ok(_) => panic!("release package cannot build without redacted release copy"),
                    Err(error) => error,
                };
            assert!(package_without_release_copy.contains("Attach at least one release-ready"));
            let redacted_document = root.join("redacted-park-contract-email.txt");
            fs::write(
                &redacted_document,
                "Responsive park contract email attachment with privileged paragraph redacted.",
            )
            .expect("redacted release copy writes");
            let release_copy = serde_json::json!({
                "releaseCopyPath": redacted_document.to_string_lossy(),
                "releaseCopyStatus": "redacted copy",
                "releaseCopyNote": "Privileged paragraph removed under CORA attorney-client privilege.",
                "releaseCopyAddedBy": "Records Officer"
            });
            city_work_action("add-records-release-copy", Some(&release_copy))
                .expect("redacted copy attached");
            city_work_action("approve-records-response", Some(&approval))
                .expect("approve after reviewing the newly attached release copy");
            city_work_action("build-records-release-package", None).expect("release package built");
            city_work_action("export-records-response", None).expect("export saved");
            city_work_action("fulfill-records-request", None).expect("fulfilled");
            city_work_action("close-records-request", None).expect("closed");
            let state = city_work_state().expect("state reads");
            let request = state.records_requests.first().expect("request exists");
            assert_eq!(request.status, "closed");
            assert_eq!(request.deadline_basis, "Staff-entered deadline at intake.");
            assert_eq!(request.assigned_to, "Records Officer");
            assert_eq!(request.clarification_notes.len(), 1);
            assert_eq!(request.messages.len(), 1);
            assert_eq!(request.messages[0].author_role, "staff");
            assert!(request.messages[0].body.contains("narrowed date range"));
            assert_eq!(request.documents.len(), 1);
            assert_eq!(request.documents[0].title, "Park contract email attachment");
            assert_eq!(request.documents[0].citation, "PRA-2026-003");
            assert_eq!(request.documents[0].sha256.len(), 64);
            assert!(PathBuf::from(&request.documents[0].stored_path).is_file());
            assert_eq!(request.documents[0].release_status, "redacted copy");
            assert_eq!(
                request.documents[0].release_file_name,
                "redacted-park-contract-email.txt"
            );
            assert_eq!(request.documents[0].release_sha256.len(), 64);
            assert!(request.documents[0].release_size_bytes > 0);
            assert_eq!(
                request.documents[0].release_note,
                "Privileged paragraph removed under CORA attorney-client privilege."
            );
            assert_eq!(request.documents[0].release_added_by, "Records Officer");
            assert!(request.documents[0].release_added_at_unix_seconds.is_some());
            assert!(PathBuf::from(&request.documents[0].release_stored_path).is_file());
            assert_eq!(request.search_notes.len(), 1);
            assert_eq!(request.search_sessions.len(), 1);
            assert_eq!(
                request.search_sessions[0].query,
                "park contract emails June 2026"
            );
            assert_eq!(request.search_sessions[0].results.len(), 1);
            assert_eq!(
                request.search_sessions[0].results[0].citation,
                "PRA-2026-004"
            );
            assert_eq!(request.exemption_reviews.len(), 1);
            assert_eq!(request.exemption_decisions.len(), 1);
            assert_eq!(
                request.exemption_decisions[0].source,
                "Email attachment page 2"
            );
            assert_eq!(request.exemption_decisions[0].decision, "redact");
            assert_eq!(
                request.exemption_decisions[0].basis,
                "CORA attorney-client privilege"
            );
            assert_eq!(request.fee_line_items.len(), 1);
            assert_eq!(
                request.fee_line_items[0].description,
                "Search time and copies"
            );
            assert_eq!(
                request.fee_line_items[0].schedule_basis,
                "Adopted records fee schedule"
            );
            assert_eq!(request.fee_line_items[0].amount_cents, 1250);
            assert_eq!(
                request.fee_waiver_reason,
                "Public interest waiver approved by clerk."
            );
            assert_eq!(
                request.fee_estimate,
                "$0.00 waived: Public interest waiver approved by clerk."
            );
            assert!(request.approved_at_unix_seconds.is_some());
            assert!(request.fulfilled_at_unix_seconds.is_some());
            assert!(request.closed_at_unix_seconds.is_some());
            assert_eq!(request.release_packages.len(), 1);
            assert_eq!(request.release_packages[0].document_count, 1);
            assert_eq!(request.release_packages[0].release_artifact_count, 1);
            assert_eq!(request.release_packages[0].search_session_count, 1);
            assert_eq!(request.release_packages[0].redacted_count, 1);
            assert_eq!(request.release_packages[0].package_hash.len(), 64);
            assert!(PathBuf::from(&request.release_packages[0].export_path).is_file());
            assert_eq!(request.exports.len(), 1);
            assert!(request
                .timeline
                .iter()
                .any(|entry| entry.action == "clarification requested"));
            assert!(request
                .timeline
                .iter()
                .any(|entry| entry.action == "message sent"));
            assert!(request
                .timeline
                .iter()
                .any(|entry| entry.action == "search session recorded"));
            assert!(request
                .timeline
                .iter()
                .any(|entry| entry.action == "document attached"));
            assert!(request
                .timeline
                .iter()
                .any(|entry| entry.action == "release copy attached"));
            assert!(request
                .timeline
                .iter()
                .any(|entry| entry.action == "exemption decision recorded"));
            assert!(request
                .timeline
                .iter()
                .any(|entry| entry.action == "release package built"));
            assert!(request
                .timeline
                .iter()
                .any(|entry| entry.action == "fee line added"));
            assert!(request
                .timeline
                .iter()
                .any(|entry| entry.action == "fee waived"));
            assert!(request
                .timeline
                .iter()
                .any(|entry| entry.action == "response approved"));
            assert!(request
                .timeline
                .iter()
                .any(|entry| entry.action == "fulfilled"));
            assert!(request
                .timeline
                .iter()
                .any(|entry| entry.action == "closed"));
            assert!(PathBuf::from(&request.exports[0]).is_file());
            let exported = fs::read_to_string(&request.exports[0]).expect("export reads");
            assert_export_integrity_manifest(&request.exports[0], &exported);
            assert!(exported.contains("Deadline basis: Staff-entered deadline at intake."));
            assert!(exported.contains("## Request Timeline"));
            assert!(exported.contains("## Request Messages"));
            assert!(exported.contains("narrowed date range"));
            assert!(exported.contains("## Request Documents"));
            assert!(exported.contains("Park contract email attachment"));
            assert!(exported.contains("PRA-2026-003"));
            assert!(exported.contains("redacted-park-contract-email.txt"));
            assert!(exported.contains(&request.documents[0].release_sha256));
            assert!(!exported.contains(&request.documents[0].release_stored_path));
            assert!(exported.contains("Privileged paragraph removed"));
            assert!(exported.contains("release copy attached"));
            assert!(exported.contains("## Release Packages"));
            assert!(exported.contains(&request.release_packages[0].package_hash));
            assert!(exported.contains("clarification requested"));
            assert!(exported.contains("fee line added"));
            assert!(exported.contains("fee waived"));
            assert!(exported.contains("## Fee Review"));
            assert!(exported.contains("Fee total: $12.50"));
            assert!(exported.contains("Fee waiver: Public interest waiver approved by clerk."));
            assert!(exported.contains("Search time and copies: $12.50"));
            assert!(exported.contains("Schedule/basis: Adopted records fee schedule"));
            assert!(exported.contains("response approved"));
            assert!(exported.contains("## Search Sessions"));
            assert!(exported.contains("park contract emails June 2026"));
            assert!(exported.contains("Park contract approval email"));
            assert!(exported.contains("PRA-2026-004"));
            assert!(exported.contains("## Exemption Review Notes"));
            assert!(exported.contains("Reviewed attorney-client content"));
            assert!(exported.contains("## Exemption Decisions"));
            assert!(exported.contains("Email attachment page 2"));
            assert!(exported.contains("CORA attorney-client privilege"));
            assert!(exported.contains("redact"));
            assert!(exported.contains("## Approval Notes"));
            let publication = state
                .publication_events
                .iter()
                .find(|event| event.record_type == "records-response")
                .expect("records response publication event exists");
            assert_eq!(publication.source_module, "civicrecords-ai");
            assert_eq!(publication.source_record_id, request.id);
            assert_eq!(publication.payload_hash.len(), 64);
            assert!(publication.retracted_at_unix_seconds.is_none());
            assert!(state.notification_events.iter().any(|event| {
                event.audience == "requester"
                    && event.subject.contains("response ready")
                    && event.body.contains("Export package")
            }));
            assert!(state.notification_events.iter().any(|event| {
                event.audience == "records staff"
                    && event.subject.contains("closed")
                    && event.status == "ready to send"
            }));
            let results = search_city_work(&state, "attorney-client");
            assert_eq!(results.len(), 1);
            let timeline_results = search_city_work(&state, "clarification requested");
            assert_eq!(timeline_results.len(), 1);
            let fee_results = search_city_work(&state, "Public interest waiver");
            assert_eq!(fee_results.len(), 1);
            let fee_line_results = search_city_work(&state, "Search time and copies");
            assert_eq!(fee_line_results.len(), 1);
            let fee_schedule_results = search_city_work(&state, "Adopted records fee schedule");
            assert_eq!(fee_schedule_results.len(), 1);
            let search_session_results = search_city_work(&state, "clerk email journal");
            assert_eq!(search_session_results.len(), 1);
            let search_result_title_results =
                search_city_work(&state, "Park contract approval email");
            assert_eq!(search_result_title_results.len(), 1);
            let package_results =
                search_city_work(&state, &request.release_packages[0].package_hash);
            assert_eq!(package_results.len(), 1);
            let decision_results = search_city_work(&state, "CORA attorney-client privilege");
            assert_eq!(decision_results.len(), 1);
            let message_results = search_city_work(&state, "narrowed date range");
            assert!(message_results
                .iter()
                .any(|result| result.module_id == "civicrecords-ai"));
            assert!(message_results
                .iter()
                .any(|result| result.module_id == "civiccore"));
            let document_results = search_city_work(&state, "Park contract email attachment");
            assert_eq!(document_results.len(), 1);
            let notification_results = search_city_work(&state, "response ready");
            assert!(notification_results
                .iter()
                .any(|result| result.module_id == "civiccore"));
            assert!(notification_results
                .iter()
                .any(|result| result.module_id == "civicrecords-ai"));
        });
    }

    #[test]
    fn records_release_lifecycle_accepts_typed_file_references() {
        with_temp_state_dir(|root| {
            let payload = serde_json::json!({
                "requester": "Taylor Morgan",
                "summary": "Building inspection correspondence",
                "deadline": "2026-07-15"
            });
            city_work_action("create-records-request", Some(&payload)).expect("request created");
            let search_session = serde_json::json!({
                "searchQuery": "building inspection correspondence",
                "searchLocations": "Permits drive; clerk email journal",
                "searchResultTitle": "Inspection correction email",
                "searchResultCitation": "PRA-2026-071",
                "searchResultSummary": "Responsive correction email found by records officer.",
                "searchResultStatus": "responsive",
                "searchReviewer": "Records Officer"
            });
            city_work_action("record-records-search-session", Some(&search_session))
                .expect("search session saved");
            let missing_source = root.join("operator-typed-responsive-email.pdf");
            let document = serde_json::json!({
                "documentTitle": "Inspection correction email",
                "documentSourcePath": missing_source.to_string_lossy(),
                "documentCitation": "PRA-2026-071"
            });
            city_work_action("add-records-document", Some(&document))
                .expect("typed source reference saved");
            let exemption_decision = serde_json::json!({
                "exemptionSource": "Inspection correction email",
                "exemptionKind": "PII",
                "exemptionFinding": "Requester phone number can be released.",
                "exemptionDecision": "release",
                "exemptionBasis": "No redaction required after staff review.",
                "exemptionReviewer": "Records Officer"
            });
            city_work_action("add-records-exemption-decision", Some(&exemption_decision))
                .expect("exemption decision saved");
            let missing_release = root.join("operator-typed-release-copy.pdf");
            let release_copy = serde_json::json!({
                "releaseCopyPath": missing_release.to_string_lossy(),
                "releaseCopyStatus": "release-ready copy",
                "releaseCopyNote": "Typed reference preserved after staff confirmed release-ready copy.",
                "releaseCopyAddedBy": "Records Officer"
            });
            city_work_action("add-records-release-copy", Some(&release_copy))
                .expect("typed release reference saved");
            let draft = serde_json::json!({
                "responseDraft": "Responsive inspection correspondence is ready for release.",
                "citation": "PRA-2026-071"
            });
            city_work_action("draft-records-response", Some(&draft)).expect("draft saved");
            let approval = serde_json::json!({ "approvalNote": "Approved by records officer." });
            city_work_action("approve-records-response", Some(&approval)).expect("approved");
            city_work_action("build-records-release-package", None).expect("package built");
            city_work_action("export-records-response", None).expect("exported");
            city_work_action("fulfill-records-request", None).expect("fulfilled");
            city_work_action("close-records-request", None).expect("closed");

            let state = city_work_state().expect("state reads");
            let request = state.records_requests.first().expect("request exists");
            assert_eq!(request.status, "closed");
            assert_eq!(request.documents.len(), 1);
            let document = &request.documents[0];
            assert_eq!(
                document.original_path,
                missing_source.to_string_lossy().to_string()
            );
            assert!(document.stored_path.contains("-reference.txt"));
            assert_eq!(document.sha256.len(), 64);
            assert!(document.size_bytes > 0);
            assert!(PathBuf::from(&document.stored_path).is_file());
            assert_eq!(
                document.release_original_path,
                missing_release.to_string_lossy().to_string()
            );
            assert!(document
                .release_file_name
                .contains("typed reference marker"));
            assert_eq!(document.release_sha256.len(), 64);
            assert!(document.release_size_bytes > 0);
            assert!(PathBuf::from(&document.release_stored_path).is_file());
            assert_eq!(request.release_packages.len(), 1);
            assert_eq!(request.release_packages[0].release_artifact_count, 1);
            assert_eq!(request.exports.len(), 1);
            assert!(PathBuf::from(&request.exports[0]).is_file());
            assert!(state
                .publication_events
                .iter()
                .any(|event| event.record_type == "records-response"));
            assert_valid_audit_chain(&state.audit_entries);
        });
    }

    #[test]
    fn public_records_intake_creates_trackable_durable_request() {
        with_temp_state_dir(|_| {
            let payload = serde_json::json!({
                "requester": "Morgan Lee",
                "requesterContact": "morgan@example.gov",
                "summary": "Emails and invoices about the river trail grant"
            });
            let result = city_work_action("submit-public-records-request", Some(&payload))
                .expect("public request submitted");
            assert!(result.message.contains("REQ-0001"));

            let state = city_work_state().expect("state reads");
            let request = state.records_requests.first().expect("request exists");
            assert_eq!(request.public_tracking_number, "REQ-0001");
            assert_eq!(request.requester, "Morgan Lee");
            assert_eq!(request.requester_contact, "morgan@example.gov");
            assert_eq!(request.submitted_via, "Resident/Public local intake");
            assert_eq!(request.status, "public intake received");
            assert_eq!(request.deadline, "Pending clerk deadline review");
            assert!(request.deadline_basis.is_empty());
            assert!(request.deadline_reviewed_at_unix_seconds.is_none());
            assert!(request.approved_at_unix_seconds.is_none());
            assert!(request.fulfilled_at_unix_seconds.is_none());
            assert_eq!(request.timeline.len(), 1);
            assert_eq!(request.timeline[0].action, "public intake");
            assert_eq!(request.public_status_events.len(), 1);
            assert_eq!(request.public_status_events[0].label, "Request received");
            assert!(request.public_status_events[0]
                .summary
                .contains("waiting for staff deadline review"));
            assert_eq!(state.notification_events.len(), 2);
            assert!(state.notification_events.iter().any(|event| {
                event.audience == "records staff"
                    && event
                        .subject
                        .contains("New public records request REQ-0001")
                    && event.status == "ready to send"
            }));
            assert!(state.notification_events.iter().any(|event| {
                event.audience == "requester"
                    && event.subject.contains("Records request REQ-0001 received")
                    && event.body.contains("morgan@example.gov")
            }));

            let missing_basis = serde_json::json!({
                "recordsRequestId": request.id.clone(),
                "deadline": "2026-07-20"
            });
            let error = match city_work_action("set-records-deadline", Some(&missing_basis)) {
                Ok(_) => panic!("deadline cannot be reviewed without basis"),
                Err(error) => error,
            };
            assert!(error.contains("statutory or policy basis"));
            let bad_deadline = serde_json::json!({
                "recordsRequestId": request.id.clone(),
                "deadline": "2026-02-31",
                "deadlineBasis": "Colorado CORA response deadline reviewed by clerk."
            });
            let error = match city_work_action("set-records-deadline", Some(&bad_deadline)) {
                Ok(_) => panic!("deadline cannot be invalid calendar date"),
                Err(error) => error,
            };
            assert!(error.contains("real calendar date"));
            let deadline_review = serde_json::json!({
                "recordsRequestId": request.id.clone(),
                "deadline": "2026-07-20",
                "deadlineBasis": "Colorado CORA response deadline reviewed by clerk."
            });
            city_work_action("set-records-deadline", Some(&deadline_review))
                .expect("deadline reviewed");
            let state = city_work_state().expect("state reads after deadline review");
            let request = state.records_requests.first().expect("request exists");
            assert_eq!(request.status, "deadline reviewed");
            assert_eq!(request.deadline, "2026-07-20");
            assert_eq!(
                request.deadline_basis,
                "Colorado CORA response deadline reviewed by clerk."
            );
            assert!(request.deadline_reviewed_at_unix_seconds.is_some());
            assert_eq!(request.timeline.len(), 2);
            assert!(request
                .timeline
                .iter()
                .any(|entry| entry.action == "deadline reviewed"));
            assert_eq!(request.public_status_events.len(), 2);
            assert!(request.public_status_events.iter().any(|entry| {
                entry.label == "Deadline reviewed"
                    && entry.summary.contains("2026-07-20")
                    && entry
                        .summary
                        .contains("Colorado CORA response deadline reviewed")
            }));
            assert_eq!(state.notification_events.len(), 3);
            let deadline_notification = state
                .notification_events
                .iter()
                .find(|event| event.subject.contains("deadline reviewed"))
                .expect("deadline notification exists");
            assert_eq!(deadline_notification.audience, "requester");
            assert_eq!(deadline_notification.status, "ready to send");
            let deadline_notification_id = deadline_notification.id.clone();
            let public_state = public_city_work_state().expect("public state reads");
            assert!(public_state.records_requests.is_empty());
            assert!(public_state.notification_events.is_empty());

            city_work_action(
                "mark-notification-sent",
                Some(&serde_json::json!({
                    "notificationId": deadline_notification_id
                })),
            )
            .expect("notification marked sent");
            let state = city_work_state().expect("state reads after notification log");
            let deadline_notification = state
                .notification_events
                .iter()
                .find(|event| event.subject.contains("deadline reviewed"))
                .expect("deadline notification exists");
            assert_eq!(deadline_notification.status, "sent / logged");
            assert!(deadline_notification.sent_at_unix_seconds.is_some());

            let lookup = serde_json::json!({
                "trackingNumber": "REQ-0001",
                "requesterContact": "MORGAN@example.gov"
            });
            let lookup_result = city_work_action("lookup-public-records-request", Some(&lookup))
                .expect("public lookup completes");
            assert_eq!(lookup_result.status, "Status found");
            assert_eq!(lookup_result.state.records_requests.len(), 1);
            let public_request = &lookup_result.state.records_requests[0];
            assert_eq!(public_request.public_tracking_number, "REQ-0001");
            assert_eq!(public_request.status, "deadline reviewed");
            assert_eq!(public_request.deadline, "2026-07-20");
            assert_eq!(
                public_request.deadline_basis,
                "Colorado CORA response deadline reviewed by clerk."
            );
            assert_eq!(public_request.requester_contact, "");
            assert_eq!(public_request.assigned_to, "");
            assert!(public_request.clarification_notes.is_empty());
            assert!(public_request.search_notes.is_empty());
            assert!(public_request.search_sessions.is_empty());
            assert!(public_request.exemption_reviews.is_empty());
            assert!(public_request.exemption_decisions.is_empty());
            assert_eq!(public_request.fee_estimate, "");
            assert!(public_request.fee_line_items.is_empty());
            assert_eq!(public_request.fee_waiver_reason, "");
            assert_eq!(public_request.response_draft, "");
            assert!(public_request.approval_notes.is_empty());
            assert!(public_request.release_packages.is_empty());
            assert!(public_request.timeline.is_empty());
            assert_eq!(public_request.public_status_events.len(), 2);
            assert!(public_request.public_status_events.iter().any(|entry| {
                entry.label == "Request received"
                    && entry.summary.contains("waiting for staff deadline review")
            }));
            assert!(public_request.public_status_events.iter().any(|entry| {
                entry.label == "Deadline reviewed" && entry.summary.contains("2026-07-20")
            }));
            assert!(public_request.messages.is_empty());
            assert!(public_request.documents.is_empty());

            let public_message = serde_json::json!({
                "trackingNumber": "REQ-0001",
                "requesterContact": "morgan@example.gov",
                "publicRequestMessage": "I can narrow the request to invoices from May."
            });
            let message_result =
                city_work_action("add-public-records-message", Some(&public_message))
                    .expect("public message saved");
            assert!(message_result.accepted);
            assert_eq!(message_result.status, "Message saved");
            assert_eq!(message_result.state.records_requests.len(), 1);
            let public_message_request = &message_result.state.records_requests[0];
            assert_eq!(public_message_request.requester_contact, "");
            assert_eq!(public_message_request.messages.len(), 1);
            assert_eq!(public_message_request.messages[0].author_role, "requester");
            assert!(public_message_request.messages[0]
                .body
                .contains("invoices from May"));
            assert_eq!(public_message_request.public_status_events.len(), 3);
            assert!(public_message_request
                .public_status_events
                .iter()
                .any(|entry| {
                    entry.label == "Requester message received"
                        && !entry.summary.contains("invoices from May")
                }));
            let public_state = public_city_work_state().expect("public state stays redacted");
            assert!(public_state.records_requests.is_empty());

            let state = city_work_state().expect("state reads after public message");
            let request = state.records_requests.first().expect("request exists");
            assert_eq!(request.messages.len(), 1);
            assert_eq!(request.messages[0].author_role, "requester");
            assert!(state.notification_events.iter().any(|event| {
                event.audience == "records staff"
                    && event.subject.contains("requester message")
                    && event.body.contains("invoices from May")
            }));

            let staff_reply = serde_json::json!({
                "requestMessageBody": "Thanks. Staff will search May invoices first."
            });
            city_work_action("add-records-message", Some(&staff_reply)).expect("staff reply saved");
            let lookup_result = city_work_action("lookup-public-records-request", Some(&lookup))
                .expect("public lookup includes message thread");
            let public_request = &lookup_result.state.records_requests[0];
            assert_eq!(public_request.messages.len(), 2);
            assert_eq!(public_request.public_status_events.len(), 4);
            assert!(public_request
                .messages
                .iter()
                .any(|message| message.author_role == "staff"
                    && message.body.contains("May invoices first")));
            assert!(public_request.public_status_events.iter().any(|entry| {
                entry.label == "Message added" && !entry.summary.contains("May invoices first")
            }));

            let wrong_contact = serde_json::json!({
                "trackingNumber": "REQ-0001",
                "requesterContact": "wrong@example.gov"
            });
            let wrong_lookup =
                city_work_action("lookup-public-records-request", Some(&wrong_contact))
                    .expect("public lookup handles mismatch");
            assert!(!wrong_lookup.accepted);
            assert_eq!(wrong_lookup.status, "No match");
            assert!(wrong_lookup.state.records_requests.is_empty());
            let state = city_work_state().expect("state reads for audit");
            assert!(state.audit_entries.iter().any(|entry| {
                entry.module_id == "civicrecords-ai"
                    && entry.action == "submit-public-records-request"
                    && entry.summary.contains("REQ-0001")
            }));
            assert!(state
                .audit_entries
                .iter()
                .any(|entry| entry.action == "set-records-deadline"));
            assert!(state.audit_entries.iter().any(|entry| {
                entry.action == "mark-notification-sent"
                    && entry.summary.contains("deadline reviewed")
            }));
            assert_valid_audit_chain(&state.audit_entries);
        });
    }

    #[test]
    fn records_deadline_calculator_skips_weekends_and_preserves_public_boundary() {
        with_temp_state_dir(|_| {
            assert_eq!(
                add_records_deadline_days("2026-07-02", 3, "business days")
                    .expect("business deadline computes"),
                "2026-07-07"
            );
            assert_eq!(
                add_records_deadline_days("2026-07-02", 3, "calendar days")
                    .expect("calendar deadline computes"),
                "2026-07-05"
            );
            let payload = serde_json::json!({
                "requester": "Casey Green",
                "requesterContact": "casey@example.gov",
                "summary": "Building permit records for 100 Main Street"
            });
            city_work_action("submit-public-records-request", Some(&payload))
                .expect("public request submitted");
            let request_id = city_work_state()
                .expect("state reads")
                .records_requests
                .first()
                .expect("request exists")
                .id
                .clone();

            let zero_count = serde_json::json!({
                "recordsRequestId": request_id,
                "deadlineReceivedDate": "2026-07-02",
                "deadlineRuleName": "Colorado CORA three working days",
                "deadlineDayCount": "0",
                "deadlineDayType": "business days",
                "deadlineBasis": "Colorado CORA initial response deadline."
            });
            let error = match city_work_action("calculate-records-deadline", Some(&zero_count)) {
                Ok(_) => panic!("zero-day deadline cannot be saved"),
                Err(error) => error,
            };
            assert!(error.contains("between 1 and 365"));

            let calculation = serde_json::json!({
                "recordsRequestId": request_id,
                "deadlineReceivedDate": "2026-07-02",
                "deadlineRuleName": "Colorado CORA three working days",
                "deadlineDayCount": "3",
                "deadlineDayType": "business days",
                "deadlineBasis": "Colorado CORA initial response deadline."
            });
            city_work_action("calculate-records-deadline", Some(&calculation))
                .expect("deadline calculated");
            let state = city_work_state().expect("state reads after calculation");
            let request = state.records_requests.first().expect("request exists");
            assert_eq!(request.status, "deadline calculated");
            assert_eq!(request.deadline, "2026-07-07");
            assert!(request
                .deadline_basis
                .contains("Colorado CORA three working days"));
            assert!(request
                .deadline_basis
                .contains("weekends are automatically skipped"));
            assert!(request
                .deadline_basis
                .contains("city/state holidays must be checked by staff"));
            assert!(request
                .timeline
                .iter()
                .any(|entry| entry.action == "deadline calculated"));
            assert!(request.public_status_events.iter().any(|entry| {
                entry.label == "Deadline calculated"
                    && entry.summary.contains("2026-07-07")
                    && !entry.summary.contains("100 Main Street")
            }));
            assert!(state.notification_events.iter().any(|event| {
                event.audience == "requester"
                    && event.subject.contains("deadline calculated")
                    && event.body.contains("2026-07-07")
            }));

            let lookup = serde_json::json!({
                "trackingNumber": "REQ-0001",
                "requesterContact": "casey@example.gov"
            });
            let lookup_result = city_work_action("lookup-public-records-request", Some(&lookup))
                .expect("public lookup completes");
            let public_request = &lookup_result.state.records_requests[0];
            assert_eq!(public_request.deadline, "2026-07-07");
            assert!(public_request.timeline.is_empty());
            assert!(public_request.search_notes.is_empty());
            assert!(public_request.exemption_reviews.is_empty());
            assert!(public_request.public_status_events.iter().any(|entry| {
                entry.label == "Deadline calculated"
                    && entry.summary == "Staff calculated the response deadline as 2026-07-07."
            }));
            assert!(state.audit_entries.iter().any(|entry| {
                entry.module_id == "civicrecords-ai"
                    && entry.action == "calculate-records-deadline"
                    && entry.summary.contains("2026-07-07")
            }));
            assert_valid_audit_chain(&state.audit_entries);
        });
    }

    #[test]
    fn code_workflow_persists_source_handoff_and_search() {
        with_temp_state_dir(|root| {
            fs::create_dir_all(&root).expect("temp workflow root exists");
            let source_path = root.join("noise-ordinance-source.txt");
            fs::write(
                &source_path,
                "Official source file for the adopted quiet-hours ordinance.",
            )
            .expect("source file writes");
            let source_path_text = source_path.to_string_lossy().to_string();
            let payload = serde_json::json!({
                "title": "Noise Ordinance",
                "citation": "CMC 8.12",
                "body": "Quiet hours begin at 10 PM.",
                "codeSourcePath": source_path_text,
                "importedBy": "Deputy Clerk"
            });
            city_work_action("import-code-source", Some(&payload)).expect("source imported");
            let failure = serde_json::json!({ "syncError": "Codifier export unavailable." });
            city_work_action("record-codifier-sync-failure", Some(&failure))
                .expect("sync failure recorded");
            city_work_action("retry-codifier-sync", None).expect("sync retry queued");
            let sync = serde_json::json!({
                "codifierName": "Municode",
                "authoritativeUrl": "https://example.gov/code/noise",
                "versionLabel": "2026-07 codifier export"
            });
            city_work_action("record-codifier-sync", Some(&sync)).expect("sync recorded");
            let stale = serde_json::json!({
                "amendmentNote": "Ordinance 2026-14 amended quiet hours; codifier update pending."
            });
            city_work_action("mark-code-stale", Some(&stale)).expect("stale marked");
            env::set_var(
                "CIVICSUITE_FAKE_MODEL_RESPONSE",
                "Local AI guidance draft about quiet hours and permit checks.",
            );
            let suggested =
                city_work_action("suggest-code-guidance", None).expect("AI guidance generated");
            env::remove_var("CIVICSUITE_FAKE_MODEL_RESPONSE");
            assert!(suggested.message.contains("Local AI code guidance"));
            let suggested_state = city_work_state().expect("state reads after AI guidance");
            assert!(suggested_state.code_sources[0]
                .staff_guidance
                .contains("Local AI guidance draft"));
            let guidance = serde_json::json!({
                "guidanceDraft": "Staff should confirm event permits before interpreting quiet hours.",
                "summaryDraft": "Quiet hours generally begin at 10 PM, but special event permits may change enforcement."
            });
            city_work_action("draft-code-guidance", Some(&guidance)).expect("guidance drafted");
            city_work_action("approve-code-guidance", None).expect("guidance approved");
            city_work_action("publish-code-source", None).expect("source published");
            city_work_action("create-code-handoff", None).expect("handoff created");
            let state = city_work_state().expect("state reads");
            let source = state.code_sources.first().expect("source exists");
            assert_eq!(source.public_status, "published");
            assert_eq!(source.source_original_path, source_path_text);
            assert_eq!(source.source_file_name, "noise-ordinance-source.txt");
            assert_eq!(source.imported_by, "Deputy Clerk");
            assert_eq!(source.source_sha256.len(), 64);
            assert!(source.source_size_bytes > 0);
            assert!(PathBuf::from(&source.source_stored_path).is_file());
            assert_eq!(
                source.source_sha256,
                hash_file(&PathBuf::from(&source.source_stored_path))
                    .expect("stored source hashes")
            );
            assert_eq!(source.codifier_name, "Municode");
            assert_eq!(
                source.codifier_sync_status,
                "stale - codifier update pending"
            );
            assert_eq!(source.codifier_sync_errors.len(), 0);
            assert_eq!(source.amendment_notes.len(), 1);
            assert!(source.last_codifier_sync_at_unix_seconds.is_some());
            assert!(source.stale_since_unix_seconds.is_some());
            assert_eq!(source.version_history.len(), 3);
            assert_eq!(source.version_history[0].status, "local import");
            assert_eq!(source.version_history[1].label, "2026-07 codifier export");
            assert_eq!(source.version_history[2].status, "stale pending update");
            assert!(source.guidance_approved_at_unix_seconds.is_some());
            assert_eq!(source.public_exports.len(), 1);
            assert!(source.published_at_unix_seconds.is_some());
            assert!(PathBuf::from(&source.public_exports[0]).is_file());
            let public_export =
                fs::read_to_string(&source.public_exports[0]).expect("public code export reads");
            assert_export_integrity_manifest(&source.public_exports[0], &public_export);
            assert!(public_export.contains("Source Evidence"));
            assert!(public_export.contains("noise-ordinance-source.txt"));
            assert!(public_export.contains(&source.source_sha256));
            assert!(!public_export.contains(&source.source_original_path));
            assert!(!public_export.contains(&source.source_stored_path));
            assert!(!public_export.contains("Deputy Clerk"));
            assert!(public_export.contains("Non-Authoritative Plain-English Summary"));
            assert!(public_export.contains("Version / Codifier History"));
            assert!(public_export.contains("2026-07 codifier export"));
            assert!(public_export.contains("stale pending update"));
            assert!(public_export.contains("contact city staff"));
            assert!(!public_export.contains("Staff should confirm event permits"));
            assert!(!public_export.contains("Ordinance 2026-14"));
            let publication = state
                .publication_events
                .iter()
                .find(|event| event.record_type == "code-source")
                .expect("code source publication event exists");
            assert_eq!(publication.source_module, "civiccode");
            assert_eq!(publication.source_record_id, source.id);
            assert_eq!(publication.payload_hash.len(), 64);
            assert!(publication.retracted_at_unix_seconds.is_none());
            assert_eq!(state.code_handoffs.len(), 1);
            let results = search_city_work(&state, "event permits");
            assert_eq!(results.len(), 1);
            assert_eq!(results[0].citation, "CMC 8.12");
            let version_results = search_city_work(&state, "2026-07 codifier export");
            assert_eq!(version_results.len(), 1);
            assert_eq!(version_results[0].citation, "CMC 8.12");
            let evidence_results = search_city_work(&state, "Deputy Clerk");
            assert_eq!(evidence_results.len(), 1);
            assert_eq!(evidence_results[0].citation, "CMC 8.12");
            let public_state = city_work_public_projection(&state);
            let public_source = public_state
                .code_sources
                .first()
                .expect("public source exists");
            assert!(public_source.source_original_path.is_empty());
            assert!(public_source.source_stored_path.is_empty());
            assert!(public_source.imported_by.is_empty());
            assert_eq!(public_source.source_file_name, "noise-ordinance-source.txt");
            assert_eq!(public_source.source_sha256, source.source_sha256);
            assert_eq!(search_city_work(&public_state, "Deputy Clerk").len(), 0);
            assert_eq!(
                search_city_work(&public_state, &source.source_sha256).len(),
                1
            );
        });
    }

    #[test]
    fn code_source_import_preserves_unreadable_typed_reference() {
        with_temp_state_dir(|root| {
            let missing_source = root.join("operator-typed-noise-ordinance.pdf");
            let missing_source_text = missing_source.to_string_lossy().to_string();
            let payload = serde_json::json!({
                "title": "Noise Ordinance Typed Reference",
                "citation": "CMC 8.12.010",
                "body": "Quiet hours begin at 10 PM and end at 7 AM.",
                "codeSourcePath": missing_source_text,
                "importedBy": "Deputy Clerk"
            });
            city_work_action("import-code-source", Some(&payload))
                .expect("typed code source reference imports");
            city_work_action("publish-code-source", None).expect("source published");
            city_work_action("create-code-handoff", None).expect("handoff created");

            let state = city_work_state().expect("state reads");
            assert_eq!(state.code_sources.len(), 1);
            assert_eq!(state.code_handoffs.len(), 1);
            let source = state.code_sources.first().expect("source exists");
            assert_eq!(
                source.source_original_path,
                missing_source.to_string_lossy().to_string()
            );
            assert!(source.source_file_name.contains("typed reference marker"));
            assert_eq!(source.source_sha256.len(), 64);
            assert!(source.source_size_bytes > 0);
            assert!(source.source_stored_path.contains("-reference.txt"));
            assert!(PathBuf::from(&source.source_stored_path).is_file());
            assert_eq!(
                source.source_sha256,
                hash_file(&PathBuf::from(&source.source_stored_path))
                    .expect("stored reference hashes")
            );
            assert_eq!(source.public_status, "published");
            assert_eq!(source.public_exports.len(), 1);
            assert!(state
                .publication_events
                .iter()
                .any(|event| event.record_type == "code-source"));
            assert_valid_audit_chain(&state.audit_entries);
        });
    }

    #[test]
    fn code_publication_can_be_retracted() {
        with_temp_state_dir(|_| {
            let payload = serde_json::json!({
                "title": "Noise Ordinance",
                "citation": "CMC 8.12",
                "body": "Quiet hours begin at 10 PM."
            });
            city_work_action("import-code-source", Some(&payload)).expect("source imported");
            city_work_action("publish-code-source", None).expect("source published");
            city_work_action("unpublish-code-source", None).expect("source unpublished");

            let state = city_work_state().expect("state reads");
            let source = state.code_sources.first().expect("source exists");
            assert_eq!(source.public_status, "internal draft");
            assert!(source.published_at_unix_seconds.is_none());
            assert_eq!(source.public_exports.len(), 1);
            let publication = state
                .publication_events
                .iter()
                .find(|event| event.record_type == "code-source")
                .expect("code source publication event exists");
            assert_eq!(publication.source_module, "civiccode");
            assert_eq!(publication.source_record_id, source.id);
            assert_eq!(publication.payload_hash.len(), 64);
            assert!(publication.retracted_at_unix_seconds.is_some());
            assert_eq!(publication.retracted_by, "civiccode");
            assert!(state
                .audit_entries
                .iter()
                .any(|entry| entry.action == "unpublish-code-source"));
            assert_valid_audit_chain(&state.audit_entries);
        });
    }

    #[test]
    fn code_publication_targets_selected_source_when_multiple_sources_exist() {
        with_temp_state_dir(|_| {
            let noise_source = serde_json::json!({
                "title": "Noise Ordinance",
                "citation": "CMC 8.12",
                "body": "Quiet hours begin at 10 PM."
            });
            let sign_source = serde_json::json!({
                "title": "Temporary Sign Code",
                "citation": "CMC 17.48",
                "body": "Temporary signs require planning review."
            });
            city_work_action("import-code-source", Some(&noise_source))
                .expect("noise source imported");
            city_work_action("import-code-source", Some(&sign_source))
                .expect("sign source imported");
            let state = city_work_state().expect("state reads after imports");
            let noise_id = state
                .code_sources
                .iter()
                .find(|source| source.title == "Noise Ordinance")
                .expect("noise source exists")
                .id
                .clone();
            let publish_noise = serde_json::json!({ "codeSourceId": noise_id.clone() });
            city_work_action("publish-code-source", Some(&publish_noise))
                .expect("selected source published");

            let state = city_work_state().expect("state reads after selected publish");
            let noise = state
                .code_sources
                .iter()
                .find(|source| source.title == "Noise Ordinance")
                .expect("noise source exists");
            let signs = state
                .code_sources
                .iter()
                .find(|source| source.title == "Temporary Sign Code")
                .expect("sign source exists");
            assert_eq!(noise.public_status, "published");
            assert_eq!(signs.public_status, "internal draft");
            assert_eq!(noise.public_exports.len(), 1);
            assert!(signs.public_exports.is_empty());
            let public_state = city_work_public_projection(&state);
            assert_eq!(public_state.code_sources.len(), 1);
            assert_eq!(public_state.code_sources[0].title, "Noise Ordinance");

            let unpublish_noise = serde_json::json!({ "codeSourceId": noise_id });
            city_work_action("unpublish-code-source", Some(&unpublish_noise))
                .expect("selected source unpublished");
            let state = city_work_state().expect("state reads after selected unpublish");
            let noise = state
                .code_sources
                .iter()
                .find(|source| source.title == "Noise Ordinance")
                .expect("noise source exists");
            let signs = state
                .code_sources
                .iter()
                .find(|source| source.title == "Temporary Sign Code")
                .expect("sign source exists");
            assert_eq!(noise.public_status, "internal draft");
            assert_eq!(signs.public_status, "internal draft");
            assert!(state.publication_events.iter().any(|event| {
                event.source_record_id == noise.id && event.retracted_at_unix_seconds.is_some()
            }));
            assert!(!state
                .publication_events
                .iter()
                .any(|event| event.source_record_id == signs.id));
            assert_valid_audit_chain(&state.audit_entries);
        });
    }

    #[test]
    fn code_question_answers_use_published_current_citations() {
        with_temp_state_dir(|_| {
            let payload = serde_json::json!({
                "title": "Backyard Chicken Rules",
                "citation": "CMC 6.16.040",
                "body": "Backyard chickens are allowed with a coop permit and no roosters."
            });
            city_work_action("import-code-source", Some(&payload)).expect("source imported");
            let draft = serde_json::json!({
                "guidanceDraft": "Staff should verify parcel-specific nuisance complaints before answering.",
                "summaryDraft": "Backyard chickens are generally allowed with a coop permit, but roosters are not allowed."
            });
            city_work_action("draft-code-guidance", Some(&draft)).expect("guidance drafted");
            city_work_action("approve-code-guidance", None).expect("guidance approved");
            city_work_action("publish-code-source", None).expect("source published");

            let question = serde_json::json!({
                "query": "Can I have chickens?",
                "publicOnly": true
            });
            let result = city_work_action("answer-code-question", Some(&question))
                .expect("question answered");
            assert_eq!(result.search_results.len(), 1);
            assert_eq!(result.search_results[0].citation, "CMC 6.16.040");
            assert!(result.search_results[0]
                .snippet
                .contains("Non-authoritative public summary"));
            assert!(result.search_results[0]
                .snippet
                .contains("not legal advice"));
            assert!(result
                .state
                .audit_entries
                .iter()
                .any(|entry| entry.action == "answer-code-question"));

            let public_internal_question = serde_json::json!({
                "query": "parcel-specific nuisance complaints",
                "publicOnly": true
            });
            let public_internal_result =
                city_work_action("answer-code-question", Some(&public_internal_question))
                    .expect("public internal question handled");
            assert!(public_internal_result.search_results.is_empty());

            let staff_internal_question = serde_json::json!({
                "query": "parcel-specific nuisance complaints",
                "publicOnly": false
            });
            let staff_internal_result =
                city_work_action("answer-code-question", Some(&staff_internal_question))
                    .expect("staff internal question answered");
            assert_eq!(staff_internal_result.search_results.len(), 1);

            let stale = serde_json::json!({
                "amendmentNote": "Ordinance 2026-22 amended backyard animal rules."
            });
            city_work_action("mark-code-stale", Some(&stale)).expect("stale marked");
            let stale_result = city_work_action("answer-code-question", Some(&question))
                .expect("stale answer returns no cited result");
            assert!(stale_result.search_results.is_empty());
            assert!(stale_result
                .message
                .contains("No current cited code source matched"));
        });
    }

    #[test]
    fn workflow_actions_target_selected_records_when_ids_are_supplied() {
        with_temp_state_dir(|_| {
            let meeting_body_id = create_city_council_body();
            let budget_meeting = serde_json::json!({
                "meetingBodyId": meeting_body_id,
                "title": "Budget Meeting",
                "meetingDate": "2026-07-01",
                "summary": "Budget agenda",
                "agendaTitle": "Open budget hearing"
            });
            let planning_meeting = serde_json::json!({
                "meetingBodyName": "City Council",
                "title": "Planning Meeting",
                "meetingDate": "2026-07-02",
                "summary": "Planning agenda",
                "agendaTitle": "Open planning hearing"
            });
            city_work_action("create-meeting", Some(&budget_meeting))
                .expect("budget meeting created");
            city_work_action("create-meeting", Some(&planning_meeting))
                .expect("planning meeting created");
            let state = city_work_state().expect("state reads");
            let budget_meeting_id = state
                .meetings
                .iter()
                .find(|meeting| meeting.title == "Budget Meeting")
                .expect("budget meeting exists")
                .id
                .clone();
            let planning_meeting_id = state
                .meetings
                .iter()
                .find(|meeting| meeting.title == "Planning Meeting")
                .expect("planning meeting exists")
                .id
                .clone();
            let selected_agenda = serde_json::json!({
                "meetingId": budget_meeting_id,
                "agendaTitle": "Adopt selected budget item"
            });
            city_work_action("add-agenda-item", Some(&selected_agenda))
                .expect("selected meeting receives agenda item");
            let state = city_work_state().expect("state reads");
            let budget_meeting = state
                .meetings
                .iter()
                .find(|meeting| meeting.title == "Budget Meeting")
                .expect("budget meeting exists");
            let planning_meeting = state
                .meetings
                .iter()
                .find(|meeting| meeting.title == "Planning Meeting")
                .expect("planning meeting exists");
            assert_eq!(budget_meeting.agenda_items.len(), 2);
            assert_eq!(planning_meeting.agenda_items.len(), 1);
            assert!(budget_meeting
                .agenda_items
                .iter()
                .any(|item| item.title == "Adopt selected budget item"));
            assert_eq!(planning_meeting.id, planning_meeting_id);

            let alex_request = serde_json::json!({
                "requester": "Alex Rivera",
                "summary": "Park contract emails",
                "deadline": "2026-07-10"
            });
            let blake_request = serde_json::json!({
                "requester": "Blake Chen",
                "summary": "Permit files",
                "deadline": "2026-07-11"
            });
            city_work_action("create-records-request", Some(&alex_request))
                .expect("alex request created");
            city_work_action("create-records-request", Some(&blake_request))
                .expect("blake request created");
            let state = city_work_state().expect("state reads");
            let alex_request_id = state
                .records_requests
                .iter()
                .find(|request| request.requester == "Alex Rivera")
                .expect("alex request exists")
                .id
                .clone();
            let assign_alex = serde_json::json!({
                "recordsRequestId": alex_request_id,
                "assignedTo": "Records Officer A"
            });
            city_work_action("assign-records-request", Some(&assign_alex))
                .expect("selected request assigned");
            let state = city_work_state().expect("state reads");
            let alex = state
                .records_requests
                .iter()
                .find(|request| request.requester == "Alex Rivera")
                .expect("alex request exists");
            let blake = state
                .records_requests
                .iter()
                .find(|request| request.requester == "Blake Chen")
                .expect("blake request exists");
            assert_eq!(alex.assigned_to, "Records Officer A");
            assert!(blake.assigned_to.is_empty());

            let noise_source = serde_json::json!({
                "title": "Noise Ordinance",
                "citation": "CMC 8.12",
                "body": "Quiet hours begin at 10 PM."
            });
            let signs_source = serde_json::json!({
                "title": "Sign Code",
                "citation": "CMC 17.48",
                "body": "Temporary signs require review."
            });
            city_work_action("import-code-source", Some(&noise_source))
                .expect("noise source imported");
            city_work_action("import-code-source", Some(&signs_source))
                .expect("sign source imported");
            let state = city_work_state().expect("state reads");
            let noise_source_id = state
                .code_sources
                .iter()
                .find(|source| source.title == "Noise Ordinance")
                .expect("noise source exists")
                .id
                .clone();
            let noise_guidance = serde_json::json!({
                "codeSourceId": noise_source_id.clone(),
                "guidanceDraft": "Confirm special event permits before enforcement.",
                "summaryDraft": "Quiet hours may vary for permitted events."
            });
            city_work_action("draft-code-guidance", Some(&noise_guidance))
                .expect("selected source receives guidance");
            let handoff_payload = serde_json::json!({
                "codeSourceId": noise_source_id,
                "summary": "Bring selected noise ordinance to council."
            });
            city_work_action("create-code-handoff", Some(&handoff_payload))
                .expect("handoff created from selected source");
            let state = city_work_state().expect("state reads");
            let noise = state
                .code_sources
                .iter()
                .find(|source| source.title == "Noise Ordinance")
                .expect("noise source exists");
            let signs = state
                .code_sources
                .iter()
                .find(|source| source.title == "Sign Code")
                .expect("sign source exists");
            assert_eq!(
                noise.staff_guidance,
                "Confirm special event permits before enforcement."
            );
            assert!(signs.staff_guidance.is_empty());
            let handoff = state.code_handoffs.first().expect("handoff exists");
            assert_eq!(handoff.source_id, noise.id);
            let handoff_id = handoff.id.clone();

            let selected_handoff = serde_json::json!({
                "meetingId": budget_meeting.id.clone(),
                "codeHandoffId": handoff_id
            });
            city_work_action("add-code-handoff-agenda", Some(&selected_handoff))
                .expect("selected handoff added to selected meeting");
            let state = city_work_state().expect("state reads");
            let budget_meeting = state
                .meetings
                .iter()
                .find(|meeting| meeting.title == "Budget Meeting")
                .expect("budget meeting exists");
            let planning_meeting = state
                .meetings
                .iter()
                .find(|meeting| meeting.title == "Planning Meeting")
                .expect("planning meeting exists");
            assert!(budget_meeting
                .agenda_items
                .iter()
                .any(|item| item.title.contains("Noise Ordinance")));
            assert!(!planning_meeting
                .agenda_items
                .iter()
                .any(|item| item.title.contains("Noise Ordinance")));
            assert_eq!(
                state.code_handoffs[0].status,
                "sent to clerk agenda".to_string()
            );
            assert_valid_audit_chain(&state.audit_entries);
        });
    }

    #[test]
    fn code_handoff_can_be_added_to_clerk_agenda() {
        with_temp_state_dir(|_| {
            let meeting_body_id = create_city_council_body();
            let meeting = serde_json::json!({
                "meetingBodyId": meeting_body_id,
                "title": "Council Regular Meeting",
                "meetingDate": "2026-07-01",
                "summary": "Ordinance review"
            });
            city_work_action("create-meeting", Some(&meeting)).expect("meeting created");
            let source = serde_json::json!({
                "title": "Noise Ordinance",
                "citation": "CMC 8.12",
                "body": "Quiet hours begin at 10 PM."
            });
            city_work_action("import-code-source", Some(&source)).expect("source imported");
            city_work_action("create-code-handoff", None).expect("handoff created");
            city_work_action("add-code-handoff-agenda", None).expect("handoff added");

            let state = city_work_state().expect("state reads");
            let meeting = state.meetings.first().expect("meeting exists");
            assert_eq!(meeting.agenda_items.len(), 1);
            assert_eq!(meeting.agenda_items[0].visibility, "staff draft");
            assert!(meeting.agenda_items[0]
                .title
                .contains("Code review: Clerk handoff: Noise Ordinance"));
            assert_eq!(
                state.code_handoffs[0].status,
                "sent to clerk agenda".to_string()
            );
            assert!(state
                .audit_entries
                .iter()
                .any(|entry| entry.action == "add-code-handoff-agenda"));
            assert_valid_audit_chain(&state.audit_entries);
        });
    }
}
