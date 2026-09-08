import { invoke } from "@tauri-apps/api/core";
import "./styles.css";

const LOCKED_FOUNDATION_MODULE_ID = "civiccore";
const RECORDS_BETA_PRODUCT_MODULE_IDS = ["civicrecords-ai", "civicnotice", "civicaccess"];
const CITY_CORE_PRODUCT_MODULE_IDS = ["civicrecords-ai", "civicclerk", "civiccode", "civicnotice", "civicaccess"];
const PRODUCT_MODULE_IDS_BY_PROFILE = {
  "records-beta": RECORDS_BETA_PRODUCT_MODULE_IDS,
  "city-core": CITY_CORE_PRODUCT_MODULE_IDS
};
const MODULE_AREA_BY_ID = {
  meetings: "civicclerk",
  records: "civicrecords-ai",
  code: "civiccode",
  notice: "civicnotice",
  access: "civicaccess"
};

const fallbackState = {
  product_name: "Townlight",
  status_label: "Windows Local 1.0 desktop",
  local_only: true,
  navigation: [
    ["home", "Home", "Work that needs attention"],
    ["meetings", "Meetings & Notices", "Agendas, notices, minutes, votes"],
    ["records", "Records Requests", "Intake, review, response, exports"],
    ["code", "Code & Ordinances", "Search, imports, guidance, handoffs"],
    ["notice", "Public Notices", "Deadlines, proof, archive packets"],
    ["access", "Accessibility", "WCAG review, plain language, multilingual, exports"],
    ["search", "Search City Knowledge", "Cross-module search with citations"],
    ["health", "System Health", "Local services, model, backup, repair"],
    ["settings", "Settings", "City profile, users, modules"]
  ].map(([id, label, description]) => ({ id, label, description })),
  modules: [
    {
      id: "civiccore",
      display_name: "Townlight Core",
      role: "shared platform",
      version: "1.2.1",
      required: true,
      selectable: false,
      installed: true,
      enabled: true,
      contract_ready: true,
      blocked_reason: null,
      backup_restore_hooks: ["config", "Data", "audit-log", "model-registry"],
      lifecycle_install: "always-installed-with-profile",
      lifecycle_update: "manifest-versioned",
      lifecycle_disable: "not-allowed-required-foundation",
      lifecycle_uninstall: "backup-first-profile-removal"
    },
    {
      id: "civicrecords-ai",
      display_name: "Townlight Records",
      role: "records workflow",
      version: "1.7.3",
      civiccore_requirement: "1.2.1",
      required: false,
      selectable: true,
      installed: true,
      enabled: true,
      contract_ready: true,
      blocked_reason: null,
      dependencies: ["civiccore"],
      route_count: 2,
      service_count: 2,
      task_count: 4,
      backup_restore_hooks: ["Data/workflows/records", "Data/exports/records", "Data/files/records"],
      model_required: true,
      lifecycle_install: "profile-selected",
      lifecycle_update: "manifest-versioned",
      lifecycle_disable: "allowed-after-backup",
      lifecycle_uninstall: "backup-first-module-data-removal"
    },
    {
      id: "civicclerk",
      display_name: "Townlight Meetings",
      role: "meetings workflow",
      version: "1.0.4",
      civiccore_requirement: "1.2.0",
      required: false,
      selectable: true,
      installed: true,
      enabled: true,
      contract_ready: true,
      blocked_reason: null,
      dependencies: ["civiccore"],
      route_count: 2,
      service_count: 2,
      task_count: 5,
      backup_restore_hooks: ["Data/workflows/meetings", "Data/exports/meetings", "Data/files/meetings"],
      // Registry truth: civicclerk's model_needs entry is required:false
      // (minutes drafting is AI-assisted, not AI-required) -- this mirror
      // previously drifted to true with no parity test guarding the field.
      model_required: false,
      lifecycle_install: "profile-selected",
      lifecycle_update: "manifest-versioned",
      lifecycle_disable: "allowed-after-backup",
      lifecycle_uninstall: "backup-first-module-data-removal"
    },
    {
      id: "civiccode",
      display_name: "Townlight Code",
      role: "municipal code",
      version: "1.0.8",
      civiccore_requirement: "1.2.0",
      required: false,
      selectable: true,
      installed: true,
      enabled: true,
      contract_ready: true,
      blocked_reason: null,
      dependencies: ["civiccore"],
      route_count: 2,
      service_count: 2,
      task_count: 4,
      backup_restore_hooks: ["Data/workflows/code", "Data/exports/code", "Data/files/code"],
      model_required: true,
      lifecycle_install: "profile-selected",
      lifecycle_update: "manifest-versioned",
      lifecycle_disable: "allowed-after-backup",
      lifecycle_uninstall: "backup-first-module-data-removal"
    },
    {
      id: "civicnotice",
      display_name: "Townlight Notice",
      role: "public notice workflow",
      version: "0.2.0",
      civiccore_requirement: "1.2.1",
      required: false,
      selectable: true,
      installed: true,
      enabled: true,
      contract_ready: true,
      blocked_reason: null,
      dependencies: ["civiccore"],
      route_count: 2,
      service_count: 2,
      task_count: 4,
      backup_restore_hooks: ["Data/workflows/notice", "Data/exports/notice", "Data/files/notice"],
      model_required: false,
      lifecycle_install: "profile-selected",
      lifecycle_update: "manifest-versioned",
      lifecycle_disable: "allowed-after-backup",
      lifecycle_uninstall: "backup-first-module-data-removal"
    },
    {
      id: "civicaccess",
      display_name: "Townlight Access",
      role: "accessibility + records-ready export",
      version: "0.4.0",
      civiccore_requirement: "1.2.1",
      required: false,
      selectable: true,
      installed: true,
      enabled: true,
      contract_ready: true,
      blocked_reason: null,
      dependencies: ["civiccore"],
      route_count: 2,
      service_count: 2,
      task_count: 2,
      backup_restore_hooks: ["Data/workflows/access", "Data/exports/access", "Data/files/access"],
      model_required: true,
      lifecycle_install: "profile-selected",
      lifecycle_update: "manifest-versioned",
      lifecycle_disable: "allowed-after-backup",
      lifecycle_uninstall: "backup-first-module-data-removal"
    },
    {
      id: "civiczone",
      display_name: "CivicZone",
      role: "zoning workflow",
      version: "0.2.2",
      required: false,
      selectable: true,
      installed: false,
      enabled: false,
      contract_ready: false,
      blocked_reason: "Module civiczone must target Townlight Core 1.2.0 for Windows Local 1.0",
      route_count: 0,
      service_count: 0,
      task_count: 0,
      model_required: true
    }
  ],
  module_profiles: [
    {
      id: "minimal",
      label: "Minimal",
      description: "Townlight Core only",
      selected: false,
      disabled: false,
      module_count: 1
    },
    {
      id: "records-beta",
      label: "Townlight Records",
      description: "Townlight Core, Townlight Records, Townlight Notice, and Townlight Access",
      selected: false,
      disabled: false,
      module_count: 4
    },
    {
      id: "city-core",
      label: "City Core",
      description: "Townlight Core, Townlight Records, Townlight Meetings, Townlight Code, Townlight Notice, and Townlight Access",
      selected: true,
      disabled: false,
      module_count: 6
    },
    {
      id: "full-suite",
      label: "Full Suite",
      description: "All tracked Townlight modules after Townlight Core",
      selected: false,
      disabled: true,
      disabled_reason: "Held until all module packages pass proof.",
      module_count: 28
    }
  ],
  module_selection: {
    profile_id: "city-core",
    profile_label: "City Core",
    installed_module_ids: ["civiccore", "civicrecords-ai", "civicclerk", "civiccode", "civicnotice", "civicaccess"],
    enabled_module_ids: ["civiccore", "civicrecords-ai", "civicclerk", "civiccode", "civicnotice", "civicaccess"],
    disabled_module_ids: [],
    last_updated_unix_seconds: 0
  },
  installer_steps: [],
  first_run: {
    profile: "windows-local-1.0",
    profile_label: "City Core",
    local_only: true,
    finished: false,
    status: "Needs setup",
    current_step_id: "locations",
    locations: {
      install_root: "%LOCALAPPDATA%\\Townlight",
      data_root: "%LOCALAPPDATA%\\Townlight\\Data",
      backup_root: "%USERPROFILE%\\Documents\\Townlight Backups"
    },
    available_actions: ["choose-location", "select-modules", "create-city-profile", "create-admin", "choose-backup", "download-model", "verify-health", "open-app", "repair", "backup", "uninstall"],
    steps: [
      {
        id: "locations",
        label: "Install and local data locations",
        surface: "Installer",
        required: true,
        completed: false,
        current: true,
        status: "Current",
        summary: "Choose where the app and city data live on this machine.",
        detail: "Defaults stay under your current Windows user account.",
        next_action: "Choose install, data, and backup folders.",
        action: "choose-location"
      },
      {
        id: "modules",
        label: "Module selection",
        surface: "Installer",
        required: true,
        completed: false,
        current: false,
        status: "Needs setup",
        summary: "City Core is selected in the browser preview and Townlight Core is locked on.",
        detail: "Other modules become available only after they finish testing for this version.",
        next_action: "Review the City Core module set.",
        action: "select-modules"
      },
      {
        id: "city-profile",
        label: "City profile",
        surface: "First run",
        required: true,
        completed: false,
        current: false,
        status: "Needs setup",
        summary: "Enter city profile and contact details.",
        detail: "The city profile personalizes notices, records responses, code guidance, and audit context.",
        next_action: "Create the city profile.",
        action: "create-city-profile"
      },
      {
        id: "first-admin",
        label: "First admin user",
        surface: "First run",
        required: true,
        completed: false,
        current: false,
        status: "Needs setup",
        summary: "Create the first Townlight admin before staff work begins.",
        detail: "The first admin owns setup, model download, users, roles, backups, and recovery contact information.",
        next_action: "Create the first admin user, then sign in with that local passcode before continuing setup.",
        action: "create-admin"
      },
      {
        id: "backup",
        label: "Backup default",
        surface: "First run",
        required: true,
        completed: false,
        current: false,
        status: "Needs setup",
        summary: "Choose the default local backup folder.",
        detail: "Backup is configured before city work begins.",
        next_action: "Choose the default backup folder.",
        action: "choose-backup"
      },
      {
        id: "model",
        label: "Local AI model download",
        surface: "First run",
        required: true,
        completed: false,
        current: false,
        status: "Needs setup",
        summary: "Download the local AI model files this app needs.",
        detail: "A signed-in Townlight admin verifies pinned metadata and checksums.",
        next_action: "Sign in as the Townlight admin, then download and verify the pinned local model weights.",
        action: "download-model"
      },
      {
        id: "health",
        label: "Health verification",
        surface: "First run",
        required: true,
        completed: false,
        current: false,
        status: "Needs setup",
        summary: "Verify local services, storage, backup, and the local model.",
        detail: "Health checks cover the desktop shell, local data store, workflow services, task queue, local AI model, and document storage.",
        next_action: "Run local health verification.",
        action: "verify-health"
      },
      {
        id: "finish",
        label: "Finish and lifecycle entry points",
        surface: "First run",
        required: true,
        completed: false,
        current: false,
        status: "Needs setup",
        summary: "Open Townlight and keep repair, backup, and uninstall reachable.",
        detail: "The same product surface owns lifecycle actions.",
        next_action: "Open Townlight after all setup checks pass.",
        action: "open-app"
      }
    ]
  },
  model: {
    profile: "windows-local-1.0",
    local_only: true,
    ready: false,
    status: "Needs download",
    display_name: "Gemma 4 12B QAT Q4_0",
    model_id: "gemma-4-12b-it-qat-q4_0",
    provider: "Google",
    source_repo: "google/gemma-4-12B-it-qat-q4_0-gguf",
    source_url: "https://huggingface.co/google/gemma-4-12B-it-qat-q4_0-gguf",
    resolve_url: "https://huggingface.co/google/gemma-4-12B-it-qat-q4_0-gguf/resolve/29d097773436b69ff9feafd636ab4cf873786537/gemma-4-12b-it-qat-q4_0.gguf",
    documentation_url: "https://ai.google.dev/gemma/docs/core",
    license: "Apache-2.0",
    runtime: "ollama",
    ollama_model: "hf.co/google/gemma-4-12B-it-qat-q4_0-gguf:Q4_0",
    runtime_model: "civicsuite-gemma4-12b-qat:q4_0",
    format: "GGUF",
    quantization: "QAT Q4_0",
    parameters: "12B",
    context_window_tokens: 256000,
    approximate_weight_memory_gb: 6.7,
    download_size_bytes: 6975879296,
    download_resumable: true,
    download_requires_consent: true,
    download_policy: "Explicit model setup only",
    minimum_free_disk_bytes: 15000000000,
    download_state: {
      schema_version: 1,
      model_id: "gemma-4-12b-it-qat-q4_0",
      status: "Not downloaded",
      message: "No verified or partial Gemma model download is saved on this machine.",
      local_path: "%LOCALAPPDATA%\\Townlight\\Data\\models\\gemma-4-12b-it-qat-q4_0.gguf",
      partial_path: "%LOCALAPPDATA%\\Townlight\\Data\\models\\gemma-4-12b-it-qat-q4_0.gguf.part",
      expected_size_bytes: 6975879296,
      local_bytes: 0,
      partial_bytes: 0,
      progress_percent: 0,
      last_error: null,
      updated_at_unix_seconds: 0
    },
    artifact: {
      file_name: "gemma-4-12b-it-qat-q4_0.gguf",
      local_path: "%LOCALAPPDATA%\\Townlight\\Data\\models\\gemma-4-12b-it-qat-q4_0.gguf",
      expected_size_bytes: 6975879296,
      expected_sha256: "93567e57a8fe10b23569b9d9ec38cd005deedf71e29477c421a4b83f418a538b",
      checksum_required: true,
      checksum_source: "https://huggingface.co/api/models/google/gemma-4-12B-it-qat-q4_0-gguf?blobs=true",
      etag_blob_id: "66249953aa5def165c094b17c26e19a77b008346"
    },
    checks: [
      {
        id: "metadata",
        label: "Pinned model metadata",
        ok: true,
        status: "OK",
        message: "Gemma 4 12B QAT Q4_0 is pinned with official source metadata and checksum requirements.",
        next_action: "Keep this pinned model contract with the Windows Local 1.0 installer."
      },
      {
        id: "artifact-file",
        label: "Local model file",
        ok: false,
        status: "Needs download",
        message: "The pinned GGUF file is not present with the expected size on this machine yet.",
        next_action: "Download the pinned GGUF file during first-run setup."
      },
      {
        id: "checksum",
        label: "Checksum verification",
        ok: false,
        status: "Needs verification",
        message: "The model must match the pinned SHA-256 before AI workflows can run.",
        next_action: "Verify the local file against the pinned SHA-256 before enabling AI workflows."
      },
      {
        id: "runtime",
        label: "Local model runtime",
        ok: false,
        status: "Needs start",
        message: "The bundled local model runtime is not responding yet.",
        next_action: "Start the bundled Ollama runtime after the portable runtime is installed."
      },
      {
        id: "runtime-model",
        label: "Gemma model loaded in Ollama",
        ok: false,
        status: "Needs load",
        message: "The local Ollama runtime does not list civicsuite-gemma4-12b-qat:q4_0 yet.",
        next_action: "Load the verified Gemma model into the local Ollama runtime before staff workflows use AI."
      },
      {
        id: "registered-model",
        label: "Local model registry",
        ok: false,
        status: "Needs setup",
        message: "No local registry entry exists for this verified model yet.",
        next_action: "Register the verified model in the local model registry before staff workflows use it."
      }
    ],
    next_action: "Use first-run setup to download, resume, and verify the pinned local model."
  },
  health: [
    {
      id: "desktop-shell",
      label: "Desktop shell",
      ok: true,
      status: "OK",
      message: "Tauri/WebView2 shell is running locally.",
      next_action: "Continue the Windows local setup.",
      admin_detail: "Browser preview fallback; Tauri provides live state in the desktop app.",
      actionable: false
    },
    {
      id: "local-data-folder",
      label: "City data folder",
      ok: false,
      status: "Needs setup",
      message: "City data folder has not been created yet.",
      next_action: "Use First Run or Repair to create the city data folder.",
      admin_detail: "%LOCALAPPDATA%\\Townlight\\Data",
      actionable: false
    },
    {
      id: "backup-folder",
      label: "Backup folder",
      ok: false,
      status: "Needs setup",
      message: "Backup folder has not been created yet.",
      next_action: "Use First Run or Backup Now to create the backup folder.",
      admin_detail: "%USERPROFILE%\\Documents\\Townlight Backups",
      actionable: false
    },
    {
      id: "task-queue-schema",
      label: "Task queue schema",
      ok: false,
      status: "Needs services",
      message: "City workflow services are not running yet, so Townlight cannot verify the PostgreSQL task queue schema.",
      next_action: "Start or repair City workflow services after the local data store is installed.",
      admin_detail: "PostgreSQL-backed Townlight Core task queue schema",
      actionable: false
    },
    {
      id: "postgres",
      label: "Local data store",
      ok: false,
      status: "Needs setup",
      message: "Local data store is defined for the Windows local runtime but has not been installed yet.",
      next_action: "Install the portable local data store during first run.",
      admin_detail: "Portable PostgreSQL 17 + pgvector"
    },
    {
      id: "python-services",
      label: "City workflow services",
      ok: false,
      status: "Needs setup",
      message: "City workflow services are defined for the Windows local runtime but have not been installed yet.",
      next_action: "Install Townlight Core and the selected city-core module services.",
      admin_detail: "Bundled CPython module services"
    },
    {
      id: "task-queue",
      label: "Background work queue",
      ok: false,
      status: "Needs setup",
      message: "Background work queue is defined for the Windows local runtime but has not been installed yet.",
      next_action: "Create the local task queue after the local data store is ready.",
      admin_detail: "PostgreSQL-backed Townlight Core task queue"
    },
    {
      id: "model-runtime",
      label: "Local AI model",
      ok: false,
      status: "Needs setup",
      message: "Local AI model is defined for the Windows local runtime but has not been installed yet.",
      next_action: "Download and verify the pinned local model weights.",
      admin_detail: "Ollama runtime with Gemma 4 12B quantization-aware weights"
    },
    {
      id: "file-storage",
      label: "Local document storage",
      ok: false,
      status: "Needs setup",
      message: "Local document storage is defined for the Windows local runtime but has not been installed yet.",
      next_action: "Create the local document storage folders during first run.",
      admin_detail: "Townlight local file storage"
    }
  ],
  city_work: {
    meeting_bodies: [],
    meeting_members: [],
    agenda_intakes: [],
    meetings: [],
    records_requests: [],
    code_sources: [],
    code_handoffs: [],
    adopted_legislation: [],
    audit_entries: [],
    publication_events: [],
    notification_events: []
  },
  city_profile: null,
  users: [],
  access: {
    configured: false,
    signed_in: false,
    operator_name: null,
    operator_email: null,
    role: null,
    status: "Setup needed",
    next_action: "Create the first Townlight admin."
  }
};

const state = {
  activeArea: "home",
  activeSurface: "Staff",
  auditOpen: false,
  actionResult: null,
  modelActionResult: null,
  supervisorActionResult: null,
  workActionResult: null,
  // GauntletGate round-7 (W-3): upgraded from a single scalar to a Set so N
  // simultaneously in-flight civicaccess actions can each be independently
  // tracked -- a completing action's tag no longer clobbers a different,
  // still-pending action's busy indicator no matter how many are in flight at
  // once. `has()`/`add()`/`delete()` on a Set are the whole implementation;
  // unlike the scalar this replaces, `delete()` is naturally idempotent so no
  // equality guard is needed in the caller.
  workActionInFlightTags: new Set(),
  accessReviewsShowAll: false,
  authActionResult: null,
  searchResults: [],
  publicRecordsLookup: {
    trackingNumber: "",
    requesterContact: "",
    found: false
  },
  pendingSupervisorReviewAction: null,
  pendingSupervisorReviewServiceId: null,
  pendingModuleReviewAction: null,
  pendingModuleReviewId: null,
  pendingWorkReviewAction: null,
  workSelection: {
    meetingId: "",
    agendaIntakeId: "",
    publicCommentId: "",
    recordsRequestId: "",
    codeSourceId: "",
    codeHandoffId: "",
    notificationId: "",
    accessDeleteReviewId: ""
  },
  setupDraft: {
    installRoot: "",
    dataRoot: "",
    backupRoot: "",
    cityName: "",
    state: "",
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "",
    recordsContact: "",
    clerkContact: "",
    adminName: "",
    adminEmail: "",
    adminPasscode: ""
  },
  moduleDraft: {
    profileId: "city-core",
    selectedModuleIds: [...CITY_CORE_PRODUCT_MODULE_IDS]
  },
  accessDraft: {
    email: "",
    passcode: "",
    userName: "",
    userEmail: "",
    userRole: "city-staff",
    userPasscode: "",
    lastStaffEmail: ""
  },
  workDraft: {
    meetingBodyId: "",
    meetingBodyName: "",
    meetingBodyType: "legislative",
    meetingBodyStatutoryBasis: "",
    meetingBodyCadence: "as scheduled",
    meetingBodyDefaultNoticeDays: "3",
    meetingBodyQuorumRule: "majority of seated members",
    memberName: "",
    memberRole: "",
    memberTermStart: "",
    memberTermEnd: "",
    memberEmail: "",
    meetingTitle: "",
    meetingDate: "",
    meetingSummary: "",
    agendaTitle: "",
    agendaIntakeTitle: "",
    agendaIntakeSubmitter: "",
    agendaIntakeDepartment: "",
    agendaIntakeSummary: "",
    agendaIntakeSourceReference: "",
    agendaIntakeMeetingDate: "",
    agendaIntakeDecision: "ready for agenda",
    agendaIntakeReviewNote: "",
    staffReportAgendaItemId: "",
    staffReportRecommendation: "",
    staffReportBackground: "",
    staffReportAnalysis: "",
    staffReportFiscalImpact: "",
    staffReportAlternatives: "",
    staffReportPriorActions: "",
    staffReportPreparedBy: "",
    staffReportRevisionNote: "",
    noticeMeetingType: "",
    noticeStatutoryBasis: "",
    noticeLeadDays: "3",
    noticeDayType: "calendar days",
    noticeDeadline: "",
    noticeTimeZone: "America/Denver",
    noticeHumanApproval: false,
    noticeLocation: "",
    noticeMethod: "",
    noticeConfirmation: "",
    noticePostingDate: "",
    minutes: "",
    meetingAttachmentTitle: "",
    meetingAttachmentSourcePath: "",
    meetingAttachmentCitation: "",
    meetingAttachmentSection: "agenda packet",
    meetingAttachmentAccess: "public packet",
    packetTitle: "",
    packetPreparedBy: "",
    packetReviewNote: "",
    closedSessionBasis: "",
    closedSessionTopics: "",
    closedSessionAttendees: "",
    closedSessionEnteredAt: "",
    closedSessionExitedAt: "",
    closedSessionReconvene: "",
    closedSessionNotesReference: "",
    minutesCitationSentence: "",
    minutesCitationSourceType: "packet item",
    minutesCitationSourceRef: "",
    minutesCitationNote: "",
    minutesCitationAccess: "public record",
    minutesSignedBy: "",
    minutesSignatureAttestation: "",
    adoptedLegislationType: "ordinance",
    adoptedLegislationTitle: "",
    adoptedLegislationText: "",
    adoptedLegislationEffectiveDate: "",
    adoptedLegislationCodificationHint: "",
    motionText: "",
    motionMover: "",
    motionSeconder: "",
    motionDisposition: "pending vote",
    motionVoteReference: "",
    memberVoteMotionId: "",
    memberVoteMemberId: "",
    memberVoteMemberName: "",
    memberVoteValue: "aye",
    attendanceMemberId: "",
    attendanceMemberName: "",
    attendanceStatus: "present",
    attendanceRecordedBy: "",
    attendanceNote: "",
    quorumRequiredCount: "",
    quorumReviewNote: "",
    vote: "",
    actionItem: "",
    actionItemOwner: "",
    actionItemDueDate: "",
    actionItemStatus: "open",
    actionItemSourceReference: "",
    residentComment: "",
    publicCommentMeetingId: "",
    publicCommentName: "",
    publicCommentContact: "",
    publicCommentMode: "written",
    publicCommentTopic: "",
    publicCommentBody: "",
    publicCommentRedactedBody: "",
    publicCommentRedactionBasis: "",
    requester: "",
    publicRequester: "",
    publicRequesterContact: "",
    publicRecordsSummary: "",
    publicRequestLookup: "",
    publicRequestContact: "",
    publicRequestMessage: "",
    recordsSummary: "",
    deadline: "",
    recordsDeadlineBasis: "",
    deadlineReceivedDate: "",
    deadlineRuleName: "Colorado CORA three working days",
    deadlineDayCount: "3",
    deadlineDayType: "business days",
    assignedTo: "",
    clarificationNote: "",
    requestMessageBody: "",
    documentTitle: "",
    documentSourcePath: "",
    documentCitation: "",
    sourceNote: "",
    recordsSearchQuery: "",
    searchLocations: "",
    searchResultTitle: "",
    searchResultCitation: "",
    searchResultSummary: "",
    searchResultStatus: "responsive",
    searchReviewer: "",
    exemptionNote: "",
    exemptionSource: "",
    exemptionKind: "",
    exemptionFinding: "",
    exemptionDecision: "redact",
    exemptionBasis: "",
    exemptionReviewer: "",
    feeEstimate: "",
    feeLineDescription: "",
    feeScheduleBasis: "",
    feeLineAmount: "",
    feeWaiverReason: "",
    responseDraft: "",
    citation: "",
    approvalNote: "",
    releaseDocumentId: "",
    releaseCopyPath: "",
    releaseCopyStatus: "redacted copy",
    releaseCopyNote: "",
    releaseCopyAddedBy: "",
    codeTitle: "",
    codeCitation: "",
    codeBody: "",
    codeSourcePath: "",
    codeImportedBy: "",
    codifierName: "",
    authoritativeUrl: "",
    versionLabel: "",
    syncError: "",
    amendmentNote: "",
    guidanceDraft: "",
    summaryDraft: "",
    handoffSummary: "",
    codeQuestion: "",
    searchQuery: "",
    accessTitle: "",
    accessBody: "",
    accessHasAltText: false,
    accessLanguage: "en",
    accessPlainText: "",
    accessVariantText: "",
    accessVariantLanguage: "es",
    accessFormName: "",
    accessFormFields: "name, contact, request",
    accessPublishingTitle: "",
    accessPublishingHasReview: false,
    accessPublishingHasPlainLanguage: false,
    accessPublishingHasTranslationReview: false,
    accessAdaServiceArea: "",
    accessAdaHasCoordinatorReview: false,
    accessTaggedPdfHeadings: "1, 2, 3"
  },
  app: fallbackState,
  appLoadError: null
};

// First-run wizard focus management.
// Reassigned (hence `let`). Tracks the current step we last auto-advanced to, so
// scroll/focus fire ONLY when the backend advances current_step_id — never on
// per-keystroke or unrelated re-renders (nav, audit toggle, surface switch).
let lastFocusedFirstRunStepId = null;

// Step ids that render text inputs ([data-setup-field]). EXCLUDES "modules"
// (checkbox UI) and the installer-notice steps (no form).
const FIRST_RUN_FORM_STEP_IDS = new Set(["locations", "city-profile", "first-admin", "backup"]);

function announce(message) {
  const region = byId("sr-announce");
  if (!region) return;
  // Clear then set on next frame so repeated identical text still re-announces.
  region.textContent = "";
  window.requestAnimationFrame(() => { region.textContent = message; });
}

function byId(id) {
  return document.getElementById(id);
}

function scrollGuidedReviewIntoView(kind) {
  window.requestAnimationFrame(() => {
    document.querySelector(`[data-guided-review="${kind}"]`)?.scrollIntoView({ block: "start" });
  });
}

function maybeAdvanceFirstRunFocus() {
  const firstRun = state.app && state.app.first_run;

  // Guard D: never hijack the Resident/Public surface (wizard can render there today).
  // Do NOT reset the tracker here — only a genuine finish resets it (see D3 fix).
  if (isPublicSurface()) return;

  // Guard E: wizard must exist; reset ONLY when setup is genuinely finished.
  if (!firstRun) return;
  if (firstRun.finished) { lastFocusedFirstRunStepId = null; return; }

  // Guard F: scope strictly to the wizard's mounted current step (never a global
  // [data-setup-field] query → no collision with the Settings duplicate).
  // If the wizard is simply not mounted on this area (e.g. Settings), do NOT reset
  // the tracker, or returning to Home would re-fire scroll/focus on a non-advance.
  const currentStepEl = document.querySelector(
    '[data-setup-context="first-run"] .first-run-step.current'
  );
  if (!currentStepEl) return;

  const stepId = currentStepEl.dataset.stepId || null;

  // Guard B: fire ONLY when the current step CHANGED. Suppresses scroll-jank on
  // audit-toggle/nav/surface re-renders, Home<->Settings round-trips, and the
  // re-scroll loop on a failed Save (which re-renders without advancing the step).
  if (!stepId || stepId === lastFocusedFirstRunStepId) return;
  lastFocusedFirstRunStepId = stepId;

  // Announce the step change via the persistent region (Guard D already excluded public).
  const heading = currentStepEl.querySelector("h3");
  announce(`Action needed: ${heading ? heading.textContent : "complete this setup step"}.`);

  const reduceMotion =
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  window.requestAnimationFrame(() => {
    const el = document.querySelector(
      '[data-setup-context="first-run"] .first-run-step.current'
    );
    if (!el) return;

    el.scrollIntoView({
      block: "nearest",                          // avoids topbar overlap
      behavior: reduceMotion ? "auto" : "smooth" // no animation under reduced-motion
    });

    // Guard C: auto-FOCUS only for steps that render text fields.
    if (!FIRST_RUN_FORM_STEP_IDS.has(stepId)) return;

    // Guard (D4): skip auto-focus if the step's primary action is admin-locked/disabled —
    // focusing an inert form is a new dead-end; the lock message already explains why.
    const actionBtn = el.querySelector("[data-first-run-action]");
    if (actionBtn && actionBtn.disabled) return;

    // Guard A: never steal focus if the user is already in THIS step.
    const active = document.activeElement;
    if (active && el.contains(active) &&
        active.matches("input, textarea, select, button")) return;

    // First EMPTY focusable field within the current step; else the first field.
    const fields = el.querySelectorAll(
      'input[data-setup-field]:not([readonly]):not([disabled])'
    );
    const target = Array.from(fields).find((f) => !f.value) || fields[0] || null;
    target && target.focus({ preventScroll: true }); // we already scrolled
  });
}

let appStateLoaded = false;

async function loadAppState() {
  if (!("__TAURI_INTERNALS__" in window)) {
    return; // pure browser preview: fallback is intentional, not an error
  }
  try {
    state.app = await invoke("get_app_state");
    state.appLoadError = null;
    appStateLoaded = true;
    hydrateSetupDraftFromApp();
    hydrateModuleDraftFromApp();
  } catch (error) {
    // Saved data may exist but be unreadable (torn write, corrupt JSON, locked
    // file). Do NOT keep the pristine fallback — that looks like total data
    // loss. Surface an explicit, retryable error and refuse the first-run wizard.
    appStateLoaded = false;
    state.appLoadError = String(error && error.message ? error.message : error);
    console.error("Townlight could not load saved state", error);
  }
}

function hydrateSetupDraftFromApp() {
  const locations = state.app.first_run?.locations || fallbackState.first_run.locations;
  state.setupDraft.installRoot = locations.install_root || "";
  state.setupDraft.dataRoot = locations.data_root || "";
  state.setupDraft.backupRoot = locations.backup_root || "";
  const profile = state.app.city_profile;
  if (profile) {
    state.setupDraft.cityName = profile.city_name || "";
    state.setupDraft.state = profile.state || "";
    state.setupDraft.timeZone = profile.time_zone || "";
    state.setupDraft.recordsContact = profile.records_contact || "";
    state.setupDraft.clerkContact = profile.clerk_contact || "";
  }
  const admin = (state.app.users || [])[0];
  if (admin) {
    state.setupDraft.adminName = admin.display_name || "";
    state.setupDraft.adminEmail = admin.email || "";
  }
  const access = accessState();
  if (access.operator_email) {
    state.accessDraft.email = access.operator_email;
  } else if (state.accessDraft.lastStaffEmail) {
    state.accessDraft.email = state.accessDraft.lastStaffEmail;
  } else if (admin?.email) {
    state.accessDraft.email = admin.email;
  }
}

function productModuleIdsFromSelection(selection) {
  return (selection?.installed_module_ids || [])
    .filter((moduleId) => moduleId !== LOCKED_FOUNDATION_MODULE_ID);
}

function hydrateModuleDraftFromApp() {
  const selection = state.app.module_selection || fallbackState.module_selection;
  const productModuleIds = productModuleIdsFromSelection(selection);
  const knownProfile = Object.hasOwn(PRODUCT_MODULE_IDS_BY_PROFILE, selection.profile_id);
  state.moduleDraft.profileId = selection.profile_id === "custom" || !knownProfile
    ? "custom"
    : selection.profile_id;
  state.moduleDraft.selectedModuleIds =
    productModuleIds.length > 0
      ? productModuleIds
      : [...(PRODUCT_MODULE_IDS_BY_PROFILE[state.moduleDraft.profileId] || RECORDS_BETA_PRODUCT_MODULE_IDS)];
}

function isWindowsLocalReadyProductModule(module) {
  return Boolean(
    module &&
    !module.required &&
    module.selectable &&
    module.contract_ready
  );
}

function customSelectedModuleIds() {
  const readyIds = new Set(
    state.app.modules
      .filter(isWindowsLocalReadyProductModule)
      .map((module) => module.id)
  );
  return state.moduleDraft.selectedModuleIds.filter((moduleId) => readyIds.has(moduleId));
}

function moduleSelectionPayload() {
  if (state.moduleDraft.profileId === "custom") {
    return {
      profileId: "custom",
      selectedModuleIds: customSelectedModuleIds()
    };
  }
  return { profileId: state.moduleDraft.profileId };
}

function hasTauriBridge() {
  return "__TAURI_INTERNALS__" in window;
}

function desktopAppRequiredNextAction(purpose) {
  return `To ${purpose}, switch to the Townlight desktop app if it's already running, or open it from the Start menu. (You are viewing the browser preview, which cannot save local data.)`;
}

function accessState() {
  return state.app.access || fallbackState.access;
}

function moduleById(moduleId) {
  return (state.app.modules || []).find((module) => module.id === moduleId) || null;
}

function moduleIsEnabled(moduleId) {
  const module = moduleById(moduleId);
  return Boolean(module && (module.installed || module.required) && module.enabled !== false);
}

function areaIsEnabled(areaId) {
  if (["home", "health", "settings"].includes(areaId)) return true;
  if (areaId === "search") {
    return [...CITY_CORE_PRODUCT_MODULE_IDS, "civicnotice"].some((moduleId) => moduleIsEnabled(moduleId));
  }
  const moduleId = MODULE_AREA_BY_ID[areaId];
  return moduleId ? moduleIsEnabled(moduleId) : true;
}

function visibleNavigationItems() {
  return (state.app.navigation || fallbackState.navigation).filter((item) => areaIsEnabled(item.id));
}

function moduleStatusLabel(module) {
  if (module.required) return "Required";
  if (module.installed && module.enabled === false) return "Disabled";
  if (module.installed) return "Enabled";
  if (module.selectable && module.contract_ready) return "Available";
  if (module.selectable) return "Package waiting";
  return "Locked";
}

function moduleStatusClass(module) {
  if (module.required) return "status-ok";
  if (module.installed && module.enabled === false) return "status-muted";
  if (module.installed) return "status-ok";
  if (module.selectable) return "status-muted";
  return "status-muted";
}

function profileStatusLabel(profile) {
  if (profile.selected) return "Installed";
  if (profile.disabled) return "Queued";
  return "Profile option";
}

function profileStatusClass(profile) {
  if (profile.selected) return "status-ok";
  if (profile.disabled) return "status-muted";
  return "status-warn";
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return "Unknown size";
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

function formatFeeCents(amountCents) {
  const cents = Number.isFinite(Number(amountCents)) ? Number(amountCents) : 0;
  const dollars = Math.trunc(cents / 100);
  const remainder = Math.abs(cents % 100);
  return `$${dollars}.${String(remainder).padStart(2, "0")}`;
}

function renderTopbar() {
  const access = accessState();
  return `
    <header class="topbar">
      <div>
        <p class="eyebrow">Windows Local 1.0</p>
        <h1>Townlight</h1>
      </div>
      <div class="topbar-actions" aria-label="Application actions">
        <div class="surface-switch" role="tablist" aria-label="Surface">
          ${["Staff", "Resident/Public", "IT/Admin"].map((surface) => `
            <button
              type="button"
              class="${state.activeSurface === surface ? "active" : ""}"
              data-surface="${surface}"
              role="tab"
              aria-selected="${state.activeSurface === surface}"
            >${surface}</button>
          `).join("")}
        </div>
        <button type="button" class="icon-text" id="audit-toggle" aria-expanded="${state.auditOpen}">
          Audit Trail
        </button>
        ${access.signed_in ? `<button type="button" class="icon-text" data-auth-action="sign-out">Sign Out</button>` : ""}
      </div>
    </header>
  `;
}

function renderNav() {
  return `
    <nav class="sidebar" aria-label="Primary">
      ${visibleNavigationItems().map((item) => `
        <button
          type="button"
          class="nav-item ${state.activeArea === item.id ? "active" : ""}"
          data-area="${item.id}"${state.activeArea === item.id ? ' aria-current="page"' : ""}
        >
          <span>${escapeHtml(item.label)}</span>
          <small>${escapeHtml(item.description)}</small>
        </button>
      `).join("")}
    </nav>
  `;
}

function renderHome() {
  const installed = state.app.modules.filter((module) => module.installed || module.required);
  const primaryTasks = visibleNavigationItems()
    .filter((item) => item.id !== "home" && item.id !== "settings")
    .slice(0, 5);
  return `
    <section class="page-heading">
      <p class="eyebrow">${state.activeSurface} surface</p>
      <h2>Work that needs attention</h2>
      <p>Start with the task, not the module. City-core workflows stay local on this machine.</p>
    </section>
    ${renderFirstRunWizard()}
    ${renderAccessPanel()}
    ${showStandaloneModelReadiness() ? renderModelReadiness({ compact: true }) : ""}
    <section class="task-grid" aria-label="Primary work areas">
      ${primaryTasks.map((item) => `
        <article class="task-card">
          <div>
            <p class="eyebrow">${item.id === "health" ? "Local system" : "City work"}</p>
            <h3>${escapeHtml(item.label)}</h3>
            <p>${escapeHtml(item.description)}</p>
          </div>
          <button type="button" data-area="${item.id}">Open</button>
        </article>
      `).join("")}
    </section>
    <section class="section-band">
      <div class="section-title">
        <h3>Installed foundation</h3>
        <p>${installed.length} local components are part of this Windows profile.</p>
      </div>
      <div class="module-list compact">
        ${installed.map(renderModuleRow).join("")}
      </div>
    </section>
  `;
}

function firstRunStatusClass(step) {
  if (step.completed) return "status-ok";
  if (step.current) return "status-warn";
  return "status-muted";
}

function setupActionLabel(step) {
  const labels = {
    "choose-location": "Create local folders",
    "select-modules": state.moduleDraft.profileId === "custom" ? "Save Module Selection" : "Use Selected Profile",
    "download-model": "Download / Resume Model",
    "create-city-profile": "Save city profile",
    "create-admin": "Save first admin",
    "choose-backup": "Create backup folder",
    "verify-health": "Run Health Check",
    "open-app": "Finish setup"
  };
  return labels[step.action] || "Continue setup";
}

function adminOnlyControlLocked() {
  const access = accessState();
  return access.configured && access.role !== "local-admin";
}

function modelSetupControlLocked() {
  const access = accessState();
  return !access.signed_in || access.role !== "local-admin";
}

function adminOnlyLockMessage(fallback) {
  const access = accessState();
  if (!adminOnlyControlLocked()) return "";
  if (!access.signed_in) return fallback;
  return "Use a Townlight admin account before changing setup, model, backup, restore, repair, module, user, or background services.";
}

function modelSetupLockMessage() {
  const access = accessState();
  if (!modelSetupControlLocked()) return "";
  if (!access.configured) {
    return "Create the first Townlight admin and sign in before changing local model setup.";
  }
  if (!access.signed_in) {
    return "Sign in as Townlight admin to change local model setup.";
  }
  return "Use a Townlight admin account before changing local model setup.";
}

function showStandaloneModelReadiness() {
  const firstRun = state.app.first_run;
  return !firstRun || firstRun.finished || !modelSetupControlLocked();
}

function renderModuleSelectionControls() {
  const modules = state.app.modules || [];
  const foundation = modules.find((module) => module.id === LOCKED_FOUNDATION_MODULE_ID);
  const productModules = modules.filter((module) => !module.required);
  const selectedIds = new Set(state.moduleDraft.selectedModuleIds);
  const customMode = state.moduleDraft.profileId === "custom";
  const readySelectedCount = customSelectedModuleIds().length;
  const profileChoices = [
    {
      id: "records-beta",
      label: "Townlight Records",
      description: "Installs Townlight Records, Townlight Notice, and Townlight Access with Townlight Core."
    },
    {
      id: "city-core",
      label: "City Core",
      description: "Installs Townlight Records, Townlight Meetings, Townlight Code, Townlight Notice, and Townlight Access with Townlight Core."
    },
    {
      id: "custom",
      label: "Custom",
      description: "Choose ready product modules. Townlight Core is always included."
    }
  ];
  return `
    <div class="module-selection-panel" aria-label="Module selection">
      <div class="profile-choice-grid" role="radiogroup" aria-label="Module profile">
        ${profileChoices.map((profile) => `
          <label class="profile-choice ${state.moduleDraft.profileId === profile.id ? "selected" : ""}">
            <input
              type="radio"
              name="module-profile"
              value="${profile.id}"
              data-module-profile-id="${escapeHtml(profile.id)}"
              ${state.moduleDraft.profileId === profile.id ? "checked" : ""}
            />
            <span>
              <strong>${escapeHtml(profile.label)}</strong>
              <small>${escapeHtml(profile.description)}</small>
            </span>
          </label>
        `).join("")}
      </div>
      <div class="module-choice-list" aria-label="Choose product modules">
        ${foundation ? `
          <label class="module-choice locked">
            <input type="checkbox" checked disabled />
            <span>
              <strong>${escapeHtml(foundation.display_name)}</strong>
              <small>Required foundation. Townlight Core cannot be removed.</small>
            </span>
          </label>
        ` : ""}
        ${productModules.map((module) => {
          const ready = isWindowsLocalReadyProductModule(module);
          const profileModuleIds = PRODUCT_MODULE_IDS_BY_PROFILE[state.moduleDraft.profileId] || [];
          const checked = customMode ? selectedIds.has(module.id) : profileModuleIds.includes(module.id);
          const disabled = !customMode || !ready;
          const status = ready ? "Ready for Windows Local 1.0" : "Not ready for Windows Local 1.0";
          // Clerk-facing plain reason; the raw technical contract string (e.g.
          // "must target Townlight Core 1.2.0") is kept only as a hover tooltip for support.
          const plainReason = !ready ? " - not available in this release yet; check back after your next Townlight update" : "";
          const rawTitle = !ready && module.blocked_reason ? ` title="${escapeHtml(module.blocked_reason)}"` : "";
          return `
            <label class="module-choice ${checked ? "selected" : ""} ${disabled ? "disabled" : ""}">
              <input
                type="checkbox"
                data-module-toggle="${escapeHtml(module.id)}"
                ${checked ? "checked" : ""}
                ${disabled ? "disabled" : ""}
              />
              <span>
                <strong>${escapeHtml(module.display_name)}</strong>
                <small${rawTitle}>${escapeHtml(module.role)} - ${status}${escapeHtml(plainReason)}</small>
              </span>
            </label>
          `;
        }).join("")}
      </div>
      <p class="empty-note">
        ${customMode
          ? `Custom selection will install Townlight Core plus ${readySelectedCount} selected product module${readySelectedCount === 1 ? "" : "s"}.`
          : "City Core installs the complete current 1.0 package: Townlight Records, Townlight Meetings, Townlight Code, Townlight Notice, and Townlight Access."}
      </p>
    </div>
  `;
}

function renderSetupFields(step, actionLocked = false) {
  if (!step.current) return "";
  if (step.id === "modules") {
    return renderModuleSelectionControls();
  }
  if (step.id === "locations") {
    return `
      <div class="setup-form" aria-label="Local folders">
        <label>App install folder <input type="text" data-setup-field="installRoot" value="${escapeHtml(state.setupDraft.installRoot)}" autocomplete="off" readonly /></label>
        ${renderFolderPathField("City data folder", "dataRoot", state.setupDraft.dataRoot, "C:/Townlight/Data", actionLocked)}
        ${renderFolderPathField("Backup folder", "backupRoot", state.setupDraft.backupRoot, "D:/Townlight/Backups", actionLocked)}
        <small>The Windows installer owns the app folder. This screen controls local city data and backups.</small>
      </div>
    `;
  }
  if (step.id === "city-profile") {
    return `
      <div class="setup-form" aria-label="City profile">
        <label>City name <input type="text" data-setup-field="cityName" value="${escapeHtml(state.setupDraft.cityName)}" autocomplete="organization" /></label>
        <label>State <input type="text" data-setup-field="state" value="${escapeHtml(state.setupDraft.state)}" autocomplete="address-level1" /></label>
        <label>Time zone <input type="text" data-setup-field="timeZone" value="${escapeHtml(state.setupDraft.timeZone)}" /></label>
        <label>Records contact <input type="email" data-setup-field="recordsContact" value="${escapeHtml(state.setupDraft.recordsContact)}" autocomplete="email" /></label>
        <label>Clerk contact <input type="email" data-setup-field="clerkContact" value="${escapeHtml(state.setupDraft.clerkContact)}" autocomplete="email" /></label>
      </div>
    `;
  }
  if (step.id === "first-admin") {
    const passcodeFailed =
      state.actionResult &&
      state.actionResult.accepted === false &&
      state.actionResult.forStepId === "first-admin" &&
      /passcode/i.test(state.actionResult.message || "");
    return `
      <div class="setup-form two-column" aria-label="First admin">
        <label>Admin name <input type="text" data-setup-field="adminName" value="${escapeHtml(state.setupDraft.adminName)}" autocomplete="name" /></label>
        <label>Admin email <input type="email" data-setup-field="adminEmail" value="${escapeHtml(state.setupDraft.adminEmail)}" autocomplete="email" /></label>
        <label>Townlight passcode <input type="password" data-setup-field="adminPasscode" value="${escapeHtml(state.setupDraft.adminPasscode)}" placeholder="10 characters or more" autocomplete="new-password" /></label>
        <small class="${passcodeFailed ? "field-hint field-hint-error" : "field-hint"}">10 characters or more.</small>
      </div>
    `;
  }
  if (step.id === "backup") {
    return `
      <div class="setup-form" aria-label="Backup folder">
        ${renderFolderPathField("Backup folder", "backupRoot", state.setupDraft.backupRoot, "D:/Townlight/Backups", actionLocked)}
      </div>
    `;
  }
  if (step.id === "model") {
    const model = state.app.model;
    const size = model ? formatBytes(model.download_size_bytes) : "about 7 GB";
    return `
      <div class="setup-note" aria-label="Model download expectation">
        <p>The local AI weights are a one-time ${escapeHtml(size)} download (about 15-60+ minutes depending on your internet connection).</p>
        <p>You can keep using setup while it runs, and the download resumes from where it left off if it is interrupted.</p>
      </div>
    `;
  }
  return "";
}

function setupActionLockedByAdmin() {
  return adminOnlyControlLocked();
}

function renderFirstRunStep(step, index) {
  const adminLocked = step.current && setupActionLockedByAdmin();
  const adminLockMessage = adminOnlyLockMessage("Sign in with the Townlight admin passcode before continuing setup.");
  const moduleSelectionLocked =
    step.current &&
    step.id === "modules" &&
    state.moduleDraft.profileId === "custom" &&
    customSelectedModuleIds().length === 0;
  const actionLocked = adminLocked || moduleSelectionLocked;
  return `
    <article class="first-run-step ${step.current ? "current" : ""}" data-step-id="${step.id}"${step.current ? ' aria-current="step"' : ""}>
      <strong>${index + 1}</strong>
      <div>
        <div class="step-header">
          <h3>${escapeHtml(step.label)}</h3>
          <span class="${firstRunStatusClass(step)}">${escapeHtml(step.status)}</span>
        </div>
        <p>${escapeHtml(step.summary)}</p>
        <small>${escapeHtml(step.detail)}</small>
        ${step.current && !isPublicSurface() ? (() => {
          const isFailure = Boolean(
            state.actionResult && state.actionResult.accepted === false && state.actionResult.forStepId === step.id
          );
          return `
          <div class="first-run-action-needed action-result blocked${isFailure ? " failed" : ""}">
            <strong>Action needed</strong>
            <span>${escapeHtml(isFailure ? state.actionResult.next_action : step.next_action)}</span>
          </div>`;
        })() : ""}
        ${renderSetupFields(step, actionLocked)}
        ${step.current ? `
          <div class="setup-actions">
            <button type="button" class="primary-action" data-first-run-action="${step.action}" data-step-id="${step.id}" ${actionLocked ? "disabled" : ""}>
              ${setupActionLabel(step)}
            </button>
            ${adminLockMessage ? `<small>${adminLockMessage}</small>` : ""}
            ${moduleSelectionLocked ? `<small>Select at least one ready product module for a custom profile.</small>` : ""}
          </div>
        ` : ""}
      </div>
    </article>
  `;
}

function renderActionResult() {
  if (!state.actionResult) return "";
  const result = state.actionResult;
  return `
    <div class="action-result ${result.accepted ? "saved" : "blocked"}" role="status">
      <strong>${escapeHtml(result.status)}</strong>
      <span>${escapeHtml(result.message)}</span>
      <small>${escapeHtml(result.next_action)}</small>
    </div>
  `;
}

function renderModelActionResult() {
  if (!state.modelActionResult) return "";
  const result = state.modelActionResult;
  return `
    <div class="action-result ${result.working ? "working" : result.accepted ? "saved" : "blocked"}" role="status">
      <strong>${escapeHtml(result.status)}</strong>
      <span>${escapeHtml(result.message)}</span>
      <small>${escapeHtml(result.next_action)}</small>
    </div>
  `;
}

function renderSupervisorActionResult() {
  if (!state.supervisorActionResult) return "";
  const result = state.supervisorActionResult;
  const adminDisabled = adminOnlyControlLocked() ? "disabled" : "";
  const uninstallFollowUp = result.accepted && result.action === "uninstall"
    ? `<button type="button" class="secondary-action" data-supervisor-action="open-windows-uninstall" ${adminDisabled}>Open Windows Uninstall</button>`
    : "";
  return `
    <div class="action-result ${result.accepted ? "saved" : "blocked"}" role="status">
      <strong>${escapeHtml(result.status)}</strong>
      <span>${escapeHtml(result.message)}</span>
      <small>${escapeHtml(result.next_action)}</small>
      ${uninstallFollowUp}
    </div>
  `;
}

function renderFilePathField(label, field, value, placeholder) {
  return `
    <div class="file-path-control">
      <label>${escapeHtml(label)}
        <input type="text" data-work-field="${escapeHtml(field)}" value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}" />
      </label>
      <button type="button" class="secondary-action" data-file-path-field="${escapeHtml(field)}">Choose File</button>
    </div>
  `;
}

function renderFolderPathField(label, field, value, placeholder, locked = false) {
  return `
    <div class="file-path-control">
      <label>${escapeHtml(label)}
        <input type="text" data-setup-field="${escapeHtml(field)}" value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}" autocomplete="off" ${locked ? "disabled" : ""} />
      </label>
      <button type="button" class="secondary-action" data-folder-path-field="${escapeHtml(field)}" ${locked ? "disabled" : ""}>Choose Folder</button>
    </div>
  `;
}

function renderWorkActionResult() {
  if (!state.workActionResult) return "";
  const result = state.workActionResult;
  return `
    <div class="action-result ${result.accepted ? "saved" : "blocked"}" role="status">
      <strong>${escapeHtml(result.status)}</strong>
      <span>${escapeHtml(result.message)}</span>
      <small>${escapeHtml(result.next_action)}</small>
    </div>
  `;
}

function renderAuthActionResult() {
  if (!state.authActionResult) return "";
  const result = state.authActionResult;
  return `
    <div class="action-result ${result.accepted ? "saved" : "blocked"}" role="status">
      <strong>${escapeHtml(result.status)}</strong>
      <span>${escapeHtml(result.message)}</span>
      <small>${escapeHtml(result.next_action)}</small>
    </div>
  `;
}

function renderAccessPanel() {
  const access = accessState();
  if (!access.configured) return "";
  if (access.signed_in) {
    return `
      <section class="section-band access-panel" aria-label="Local access">
        <div class="section-title">
          <p class="eyebrow">Local access</p>
          <h3>Signed in as ${escapeHtml(access.operator_name || "Townlight admin")}</h3>
          <p>${escapeHtml(localRoleLabel(access.role))}</p>
          ${access.role !== "local-admin" ? `<p>Sign out and use a Townlight admin account before changing setup, users, modules, backups, restore, repair, or background services.</p>` : ""}
        </div>
        <div class="health-actions">
          <button type="button" class="secondary-action" data-auth-action="sign-out">Sign Out</button>
        </div>
      </section>
    `;
  }
  return `
    <section class="section-band access-panel" aria-label="Local user sign in">
      <div class="section-title">
        <p class="eyebrow">Local access</p>
        <h3>Sign In</h3>
        <p>Use a staff or Townlight admin passcode for city work. Use a Townlight admin account for setup, users, modules, backups, restore, repair, model setup, or background services.</p>
      </div>
      <div class="workflow-form compact-form">
        <label>Email <input type="email" data-access-field="email" value="${escapeHtml(state.accessDraft.email)}" autocomplete="email" /></label>
        <label>Townlight passcode <input type="password" data-access-field="passcode" value="${escapeHtml(state.accessDraft.passcode)}" autocomplete="current-password" /></label>
        <button type="button" class="primary-action" data-auth-action="sign-in">Sign In</button>
      </div>
      ${renderAuthActionResult()}
    </section>
  `;
}

function renderFirstRunWizard({ compact = false } = {}) {
  if (!appStateLoaded) return ""; // never render the wizard from fallback state
  const firstRun = state.app.first_run;
  if (!firstRun || firstRun.finished) return "";
  const steps = compact ? firstRun.steps.slice(0, 5) : firstRun.steps;
  return `
    <section class="section-band first-run-panel" aria-label="First-run setup">
      <div class="section-title">
        <p class="eyebrow">First-run setup</p>
        <h3>${escapeHtml(firstRun.profile_label)} setup checklist</h3>
        <p>Install stays local to this Windows machine. No Docker, WSL, terminal, or developer tooling is part of the clerk path.</p>
        <p class="text-link-line">Made a mistake on an earlier step? <button type="button" class="text-link" data-area="settings">Fix it anytime from Settings.</button></p>
      </div>
      <div class="location-grid" aria-label="Default local locations">
        <div>
          <span>Install</span>
          <strong>${escapeHtml(firstRun.locations.install_root)}</strong>
        </div>
        <div>
          <span>City data</span>
          <strong>${escapeHtml(firstRun.locations.data_root)}</strong>
        </div>
        <div>
          <span>Backups</span>
          <strong>${escapeHtml(firstRun.locations.backup_root)}</strong>
        </div>
      </div>
      <div class="first-run-list" data-setup-context="first-run">
        ${steps.map(renderFirstRunStep).join("")}
      </div>
      ${renderActionResult()}
      ${compact && firstRun.steps.length > steps.length ? `
        <button type="button" class="text-link" data-area="health">View all setup and health steps</button>
      ` : ""}
    </section>
  `;
}

function renderModelActions(model) {
  const adminLocked = modelSetupControlLocked();
  const inFlight = Boolean(state.modelActionInFlight);
  // Lock every model button while one action runs so the long synchronous
  // download can't be re-triggered or interleaved with verify/load/retry.
  const disabled = adminLocked || inFlight ? "disabled" : "";
  const lockMessage = modelSetupLockMessage();
  const downloading =
    state.modelActionInFlight === "download" || state.modelActionInFlight === "resume-download";
  const primaryLabel = downloading
    ? "Downloading…"
    : model.download_resumable
      ? "Download / Resume"
      : "Download Model";
  return `
    <div class="model-actions" aria-label="Local model setup actions">
      <small class="model-actions-order">Do these in order: Step 1 Download, Step 2 Verify, Step 3 Start.</small>
      <button type="button" class="secondary-action" data-model-action="open-model-folder" ${disabled}>
        Open Model Folder
      </button>
      <button type="button" class="primary-action" data-model-action="${model.download_resumable ? "resume-download" : "download"}" ${disabled}>
        ${primaryLabel}
      </button>
      <button type="button" class="secondary-action" data-model-action="verify-checksum" ${disabled}>
        Verify Checksum
      </button>
      <button type="button" class="secondary-action" data-model-action="load-runtime-model" ${disabled}>
        Start Local AI Engine
      </button>
      <button type="button" class="secondary-action" data-model-action="retry" ${disabled}>
        Retry Setup
      </button>
      ${lockMessage ? `<small>${lockMessage}</small>` : ""}
    </div>
  `;
}

function renderModelDownloadStatus(model) {
  const downloadState = model.download_state;
  if (!downloadState) return "";
  const downloadedBytes = Math.max(downloadState.local_bytes || 0, downloadState.partial_bytes || 0);
  return `
    <div class="model-download-status" aria-label="Model download progress">
      <div>
        <span>Download progress</span>
        <strong>${escapeHtml(downloadState.status)}</strong>
        <small>${escapeHtml(downloadState.message)}</small>
      </div>
      <div>
        <span>Saved locally</span>
        <strong>${formatBytes(downloadedBytes)} of ${formatBytes(downloadState.expected_size_bytes || model.download_size_bytes)}</strong>
        <small>${Number(downloadState.progress_percent || 0).toFixed(2)}% complete</small>
      </div>
      ${downloadState.last_error ? `
        <div class="download-error">
          <span>Last error</span>
          <strong>${escapeHtml(downloadState.last_error)}</strong>
        </div>
      ` : ""}
    </div>
  `;
}

function renderModelReadiness({ compact = false } = {}) {
  const model = state.app.model;
  if (!model) return "";
  const checks = compact ? model.checks.slice(0, 3) : model.checks;
  return `
    <section class="section-band model-panel" aria-label="Local AI model readiness">
      <div class="section-title">
        <p class="eyebrow">Local AI model</p>
        <h3>${escapeHtml(model.display_name)}</h3>
        <p>Official Google weights are pinned for local-only use. No silent download starts from this screen.</p>
      </div>
      <div class="model-meta-grid">
        <div>
          <span>Status</span>
          <strong class="${model.ready ? "status-ok" : "status-warn"}">${escapeHtml(model.status)}</strong>
        </div>
        <div>
          <span>Download</span>
          <strong>${formatBytes(model.download_size_bytes)} resumable</strong>
        </div>
        <div>
          <span>Official source</span>
          <strong>${escapeHtml(model.ollama_model)}</strong>
        </div>
        <div>
          <span>Runtime name</span>
          <strong>${escapeHtml(model.runtime_model || model.ollama_model)}</strong>
        </div>
        <div>
          <span>Checksum required</span>
          <strong>${escapeHtml(model.artifact.expected_sha256)}</strong>
        </div>
      </div>
      <div class="model-source">
        <span>${escapeHtml(model.provider)} source</span>
        <strong>${escapeHtml(model.source_repo)}</strong>
        <small>${escapeHtml(model.download_policy)}; explicit setup consent required.</small>
        <small>Checksum source: ${escapeHtml(model.artifact.checksum_source)}</small>
        <small>Local path: ${escapeHtml(model.artifact.local_path)}</small>
      </div>
      ${renderModelDownloadStatus(model)}
      ${renderModelActions(model)}
      ${renderModelActionResult()}
      <div class="readiness-list">
        ${checks.map((check) => `
          <article class="readiness-item">
            <span class="${check.ok ? "status-ok" : "status-warn"}">${escapeHtml(check.status)}</span>
            <div>
              <h4>${escapeHtml(check.label)}</h4>
              <p>${escapeHtml(check.message)}</p>
              ${check.next_action ? `<small>${escapeHtml(check.next_action)}</small>` : ""}
            </div>
          </article>
        `).join("")}
      </div>
      ${compact && model.checks.length > checks.length ? `
        <button type="button" class="text-link" data-area="health">View full model readiness</button>
      ` : ""}
    </section>
  `;
}

function renderWorkflow(title, body, actions) {
  return `
    <section class="page-heading">
      <p class="eyebrow">${state.activeSurface}</p>
      <h2>${title}</h2>
      <p>${body}</p>
    </section>
    <section class="workflow-panel">
      ${actions.map((action, index) => `
        <article class="workflow-step">
          <strong>${index + 1}</strong>
          <div>
            <h3>${action.title}</h3>
            <p>${action.body}</p>
          </div>
          <span class="${action.ready ? "status-ok" : "status-muted"}">${action.ready ? "Ready" : "Queued"}</span>
        </article>
      `).join("")}
    </section>
  `;
}

function cityWork() {
  return state.app.city_work || fallbackState.city_work;
}

function exportFolderForActiveArea() {
  if (state.activeArea === "meetings") return "meetings";
  if (state.activeArea === "records") return "records";
  if (state.activeArea === "code") return "code";
  if (state.activeArea === "notice") return "notice";
  if (state.activeArea === "access") return "access";
  return "all";
}

function workflowEmpty(label) {
  return `<p class="empty-note">${label}</p>`;
}

const GUIDED_WORK_ACTIONS = new Set([
  "create-meeting-body",
  "add-meeting-member",
  "review-agenda-intake",
  "promote-agenda-intake",
  "record-staff-report",
  "add-code-handoff-agenda",
  "add-meeting-attachment",
  "finalize-meeting-packet",
  "record-closed-session",
  "calculate-notice-deadline",
  "complete-notice-checklist",
  "post-notice",
  "export-meeting-packet",
  "civicnotice-calculate-deadline",
  "civicnotice-complete-checklist",
  "civicnotice-post-notice",
  "civicnotice-export-archive-packet",
  "add-minute-citation",
  "review-public-comment",
  "redact-public-comment",
  "suggest-minutes-draft",
  "adopt-minutes",
  "sign-minutes",
  "record-member-vote",
  "record-meeting-attendance",
  "record-quorum-check",
  "record-adopted-legislation",
  "archive-meeting",
  "set-records-deadline",
  "calculate-records-deadline",
  "record-records-search-session",
  "approve-records-response",
  "suggest-records-response",
  "export-records-response",
  "fulfill-records-request",
  "close-records-request",
  "build-records-release-package",
  "mark-notification-sent",
  "add-records-message",
  "add-records-release-copy",
  "add-records-exemption-decision",
  "add-records-fee-line",
  "waive-records-fee",
  "approve-code-guidance",
  "suggest-code-guidance",
  "import-code-source",
  "publish-code-source",
  "unpublish-code-source",
  "create-code-handoff",
  "civicaccess-delete-review",
  // Local-AI dual-path actions: when the model is ready, each of these can
  // hold the global city-work write lock for the full generation call, so a
  // human confirm before taking that lock matches the suggest-* precedent.
  "accessibility-review",
  "civicaccess-plain-language",
  "civicaccess-language-variant"
]);

const GUIDED_SUPERVISOR_ACTIONS = new Set([
  "backup",
  "restore",
  "uninstall",
  "support-bundle",
  "repair",
  "stop"
]);

function selectedFrom(collection, selectedId) {
  return collection.find((record) => record.id === selectedId) || newestRecord(collection) || null;
}

function meetingBodies(work = cityWork()) {
  return work.meeting_bodies || [];
}

function meetingMembers(work = cityWork()) {
  return work.meeting_members || [];
}

function agendaIntakes(work = cityWork()) {
  return work.agenda_intakes || [];
}

function currentMeeting(work = cityWork()) {
  return selectedFrom(work.meetings || [], state.workSelection.meetingId);
}

function currentAgendaIntake(work = cityWork()) {
  const intakes = agendaIntakes(work);
  return intakes.find((intake) => intake.id === state.workSelection.agendaIntakeId) ||
    intakes.find((intake) => intake.status !== "promoted to agenda") ||
    intakes[0] ||
    null;
}

function currentPublicComment(work = cityWork()) {
  const meeting = currentMeeting(work);
  return selectedFrom(meeting?.public_comments || [], state.workSelection.publicCommentId);
}

function currentRecordsRequest(work = cityWork()) {
  return selectedFrom(work.records_requests || [], state.workSelection.recordsRequestId);
}

function currentRecordsDocument(work = cityWork()) {
  const request = currentRecordsRequest(work);
  return selectedFrom(request?.documents || [], state.workDraft.releaseDocumentId);
}

function currentCodeSource(work = cityWork()) {
  return selectedFrom(work.code_sources || [], state.workSelection.codeSourceId);
}

function currentCodeHandoff(work = cityWork()) {
  const handoffs = work.code_handoffs || [];
  return handoffs.find((handoff) => handoff.id === state.workSelection.codeHandoffId) ||
    handoffs.find((handoff) => handoff.status !== "sent to clerk agenda") ||
    handoffs[0] ||
    null;
}

function currentNotification(work = cityWork()) {
  const notifications = work.notification_events || [];
  return notifications.find((event) => event.id === state.workSelection.notificationId) ||
    notifications.find((event) => event.status === "ready to send") ||
    notifications[0] ||
    null;
}

function detailOrFallback(value, fallback) {
  return value ? value : fallback;
}

// Whether the local AI engine is ready right now, per the six Rust-side
// readiness checks already carried in app state. Absent model state (browser
// preview fallback) reads as not ready, matching the desktop-required posture.
function aiEngineReady() {
  return Boolean(state.app.model && state.app.model.ready);
}

function escapedDraft(field) {
  return escapeHtml(state.workDraft[field]);
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  })[character]);
}

function guidedReviewForAction(action) {
  const work = cityWork();
  const meeting = currentMeeting(work);
  const publicComment = currentPublicComment(work);
  const agendaIntake = currentAgendaIntake(work);
  const request = currentRecordsRequest(work);
  const recordsDocument = currentRecordsDocument(work);
  const source = currentCodeSource(work);
  const handoff = currentCodeHandoff(work);
  const notification = currentNotification(work);
  const meetingSubject = meeting ? `${meeting.title} (${meeting.meeting_date})` : "Current meeting";
  const bodySubject = meetingBodies(work).find((body) => body.id === state.workDraft.meetingBodyId) || meetingBodies(work)[0] || null;
  const agendaIntakeSubject = agendaIntake ? `${agendaIntake.title} (${agendaIntake.department})` : "Current agenda intake item";
  const staffReportAgendaItem = meeting?.agenda_items?.find((item) => item.id === state.workDraft.staffReportAgendaItemId) || meeting?.agenda_items?.[0] || null;
  const staffReportSubject = staffReportAgendaItem ? staffReportAgendaItem.title : "Current agenda item";
  const rosterMembers = meetingMembers(work).filter((member) => !meeting || !meeting.body_id || member.body_id === meeting.body_id);
  const selectedMemberVoteMember = rosterMembers.find((member) => member.id === state.workDraft.memberVoteMemberId || member.name === state.workDraft.memberVoteMemberName) || rosterMembers[0] || null;
  const selectedAttendanceMember = rosterMembers.find((member) => member.id === state.workDraft.attendanceMemberId || member.name === state.workDraft.attendanceMemberName) || rosterMembers[0] || null;
  const meetingMotionsForVote = meeting?.motions || [];
  const selectedMemberVoteMotion = meetingMotionsForVote.find((motion) => motion.id === state.workDraft.memberVoteMotionId) || meetingMotionsForVote[meetingMotionsForVote.length - 1] || null;
  const publicCommentSubject = publicComment ? `${publicComment.commenter_name}: ${publicComment.topic || "Public comment"}` : "Current public comment";
  const requestSubject = request ? `${request.requester}: ${request.summary}` : "Current records request";
  const sourceSubject = source ? `${source.title} (${source.citation})` : "Current code source";
  const handoffSubject = handoff ? handoff.title : "Current code handoff";
  const notificationSubject = notification ? notification.subject : "Current local notification";
  const targetDeleteReview = (work.access?.reviews || []).find(
    (review) => review.review_id === state.workSelection.accessDeleteReviewId
  );
  const reviews = {
    "create-meeting-body": {
      title: "Review Before Saving Meeting Body",
      confirmLabel: "Save Meeting Body",
      module: "Townlight Meetings",
      subject: detailOrFallback(state.workDraft.meetingBodyName, "New meeting body"),
      status: "Local setup record",
      changes: "Stores the council, board, commission, or authority that holds meetings, including legal basis, cadence, default notice days, and quorum rule.",
      visibility: "Staff setup data. Meeting records can show the body name and statutory basis in packets, archives, and search.",
      sources: [
        detailOrFallback(state.workDraft.meetingBodyName, "Meeting body name is required."),
        detailOrFallback(state.workDraft.meetingBodyStatutoryBasis, "Statutory basis is required."),
        detailOrFallback(state.workDraft.meetingBodyCadence, "Meeting cadence will default to as scheduled if left blank."),
        detailOrFallback(state.workDraft.meetingBodyDefaultNoticeDays, "Default notice days will default to 3 if left blank."),
        detailOrFallback(state.workDraft.meetingBodyQuorumRule, "Quorum rule will default to majority of seated members if left blank.")
      ],
      audit: "Creates a Townlight Meetings audit entry for the meeting body setup record.",
      retry: "If the name, statutory basis, notice days, or duplicate check fails, the desktop app leaves local records unchanged."
    },
    "add-meeting-member": {
      title: "Review Before Saving Member",
      confirmLabel: "Save Member",
      module: "Townlight Meetings",
      subject: detailOrFallback(state.workDraft.memberName, "New meeting body member"),
      status: "Roster record",
      changes: "Adds this elected or appointed member to the selected meeting body roster for quorum and roll-call vote work.",
      visibility: "Meeting body roster data. Member names and roles can appear in staff workflows, meeting records, archives, and search.",
      sources: [
        bodySubject ? `Body: ${bodySubject.name}` : "A meeting body is required.",
        detailOrFallback(state.workDraft.memberName, "Member name is required."),
        detailOrFallback(state.workDraft.memberRole, "Member role is required."),
        detailOrFallback(state.workDraft.memberTermStart, "Term start is optional."),
        detailOrFallback(state.workDraft.memberTermEnd, "Term end is optional.")
      ],
      audit: "Creates a Townlight Meetings audit entry for the roster change.",
      retry: "If the body is missing, dates are invalid, required fields are blank, or the active member already exists, the roster stays unchanged."
    },
    "review-agenda-intake": {
      title: "Review Before Updating Agenda Intake",
      confirmLabel: "Review Agenda Intake",
      module: "Townlight Meetings",
      subject: agendaIntakeSubject,
      status: agendaIntake ? agendaIntake.status : "No agenda intake item selected yet.",
      changes: "Records the clerk readiness decision for a submitted agenda item before it can be promoted to a meeting agenda.",
      visibility: "Staff queue only. Resident/Public meeting materials do not show intake queue records.",
      sources: [
        agendaIntake ? detailOrFallback(agendaIntake.summary, "No intake summary is recorded.") : "The desktop app will require an intake item before saving.",
        agendaIntake ? detailOrFallback(agendaIntake.source_reference, "No source or citation is recorded.") : "The desktop app will require source evidence before saving.",
        detailOrFallback(state.workDraft.agendaIntakeDecision, "A readiness decision is required."),
        detailOrFallback(state.workDraft.agendaIntakeReviewNote, "A clerk review note is required.")
      ],
      audit: "Creates a Townlight Meetings audit entry for the agenda intake readiness decision.",
      retry: "If no intake item is selected, the decision is invalid, or the review note is missing, the desktop app leaves the queue unchanged."
    },
    "promote-agenda-intake": {
      title: "Review Before Promoting To Agenda",
      confirmLabel: "Promote To Agenda",
      module: "Townlight Meetings",
      subject: agendaIntakeSubject,
      status: agendaIntake ? agendaIntake.status : "No agenda intake item selected yet.",
      changes: "Adds the reviewed-ready intake item to the selected meeting agenda with department and source metadata.",
      visibility: "Meeting agenda draft. Public visibility follows the agenda item's visibility and public meeting/archive rules.",
      sources: [
        meeting ? `Target meeting: ${meetingSubject}` : "The desktop app will require a meeting before saving.",
        agendaIntake ? detailOrFallback(agendaIntake.source_reference, "No source or citation is recorded.") : "The desktop app will require an intake item before saving.",
        agendaIntake?.status === "ready for agenda" ? "Agenda intake is marked ready." : "Agenda intake must be reviewed as ready before promotion."
      ],
      audit: "Creates a Townlight Meetings audit entry linking the intake item to the selected meeting agenda.",
      retry: "If the intake item is not ready, no meeting exists, or the meeting is archived, the desktop app leaves both records unchanged."
    },
    "record-staff-report": {
      title: "Review Before Saving Staff Report",
      confirmLabel: "Save Staff Report",
      module: "Townlight Meetings",
      subject: staffReportSubject,
      status: meeting ? meeting.status : "No meeting selected yet.",
      changes: "Stores a structured staff report for the selected agenda item with recommendation, background, analysis, fiscal impact, alternatives, prior actions, preparer, and revision note.",
      visibility: "Staff packet material. It becomes part of the public archive only after the meeting is archived as a public record.",
      sources: [
        meeting ? `Target meeting: ${meetingSubject}` : "The desktop app will require a meeting before saving.",
        staffReportAgendaItem ? `Agenda item: ${staffReportAgendaItem.title}` : "An agenda item is required.",
        detailOrFallback(state.workDraft.staffReportRecommendation, "Recommendation is required."),
        detailOrFallback(state.workDraft.staffReportBackground, "Background is required."),
        detailOrFallback(state.workDraft.staffReportAnalysis, "Analysis is required."),
        detailOrFallback(state.workDraft.staffReportFiscalImpact, "Fiscal impact is required."),
        detailOrFallback(state.workDraft.staffReportPreparedBy, "Prepared-by name is required.")
      ],
      audit: "Creates a Townlight Meetings audit entry linking the staff report to the agenda item.",
      retry: "If required sections are missing, no agenda item exists, or the meeting is archived, the desktop app leaves the meeting unchanged."
    },
    "add-code-handoff-agenda": {
      title: "Review Before Adding Code Handoff",
      confirmLabel: "Add Code Handoff",
      module: "Townlight Meetings + Townlight Code",
      subject: handoffSubject,
      status: handoff ? handoff.status : "No pending code handoff selected yet.",
      changes: "Adds the pending Townlight Code ordinance or resolution handoff to the current meeting agenda.",
      visibility: "Staff agenda draft only until notice, packet, or archive steps make meeting material public.",
      sources: [
        detailOrFallback(handoff?.summary, "No handoff summary is available yet."),
        meeting ? `Target meeting: ${meetingSubject}` : "The desktop app will require a meeting before saving."
      ],
      audit: "Creates a Townlight Meetings audit entry for adding the code handoff to the agenda.",
      retry: "If no handoff or meeting exists, the desktop app stops before changing local records."
    },
    "add-meeting-attachment": {
      title: "Review Before Attaching Packet File",
      confirmLabel: "Attach Packet File",
      module: "Townlight Meetings",
      subject: meetingSubject,
      status: meeting ? meeting.status : "No meeting selected yet.",
      changes: "Copies the selected local file into the city profile, records its SHA-256 hash, and adds it to the meeting packet evidence list.",
      visibility: state.workDraft.meetingAttachmentAccess === "closed-session addendum"
        ? "Staff-only closed-session addendum. It will not appear in resident/public meeting materials."
        : "Public packet attachment. Local Windows file paths remain hidden from resident/public materials.",
      sources: [
        meeting ? `Target meeting: ${meetingSubject}` : "The desktop app will require a meeting before saving.",
        detailOrFallback(state.workDraft.meetingAttachmentTitle, "Attachment title is required."),
        detailOrFallback(state.workDraft.meetingAttachmentSourcePath, "Attachment source file path is required."),
        detailOrFallback(state.workDraft.meetingAttachmentCitation, "No citation has been recorded yet."),
        detailOrFallback(state.workDraft.meetingAttachmentSection, "Packet section is required.")
      ],
      audit: "Creates a Townlight Meetings audit entry with the attachment title, access level, byte count, and SHA-256 hash.",
      retry: "If the file is missing, unreadable, or the meeting is archived, the desktop app leaves the meeting record unchanged."
    },
    "finalize-meeting-packet": {
      title: "Review Before Finalizing Packet",
      confirmLabel: "Finalize Packet",
      module: "Townlight Meetings",
      subject: detailOrFallback(state.workDraft.packetTitle, meeting ? `${meeting.title} agenda packet` : "Current meeting packet"),
      status: meeting ? meeting.status : "No meeting selected yet.",
      changes: "Stores a durable packet-finalization record with the clerk review note, agenda item count, public attachment count, and closed-session addendum count.",
      visibility: "Staff packet milestone now. It becomes part of the public meeting archive only after the meeting is archived as a public record.",
      sources: [
        meeting ? `Target meeting: ${meetingSubject}` : "The desktop app will require a meeting before saving.",
        meeting ? `${(meeting.agenda_items || []).length} agenda items ready for packet review.` : "At least one agenda item is required.",
        meeting ? `${(meeting.attachments || []).filter((attachment) => attachment.access_level === "public packet").length} public packet attachments.` : "Attachment counts will be recorded from the selected meeting.",
        meeting ? `${(meeting.attachments || []).filter((attachment) => attachment.access_level === "closed-session addendum").length} closed-session addenda.` : "Closed-session addendum counts will be recorded from the selected meeting.",
        detailOrFallback(state.workDraft.packetPreparedBy, "Prepared-by or reviewer name is required."),
        detailOrFallback(state.workDraft.packetReviewNote, "Packet review note is required.")
      ],
      audit: "Creates a Townlight Meetings audit entry for the packet finalization milestone and counts.",
      retry: "If no meeting exists, no agenda item exists, review fields are blank, or the meeting is archived, the desktop app leaves the packet unchanged."
    },
    "record-closed-session": {
      title: "Review Before Recording Closed Session",
      confirmLabel: "Record Closed Session",
      module: "Townlight Meetings",
      subject: meetingSubject,
      status: meeting ? meeting.status : "No meeting selected yet.",
      changes: "Stores the statutory basis, general topics, timing, reconvene statement, and optional staff-only notes reference for a closed-session block.",
      visibility: "Staff packets include the staff-only notes reference. Public archives keep only basis, topics, timing, and reconvene statement.",
      sources: [
        detailOrFallback(state.workDraft.closedSessionBasis, "Statutory basis is required."),
        detailOrFallback(state.workDraft.closedSessionTopics, "At least one general topic is required."),
        detailOrFallback(state.workDraft.closedSessionEnteredAt, "Entered time is required."),
        detailOrFallback(state.workDraft.closedSessionExitedAt, "Exited time is required."),
        detailOrFallback(state.workDraft.closedSessionReconvene, "Reconvene statement is required.")
      ],
      audit: "Creates a Townlight Meetings audit entry for the closed-session boundary and staff-only notes reference.",
      retry: "If required basis, topic, timing, or reconvene evidence is missing, the desktop app leaves the meeting unchanged."
    },
    "calculate-notice-deadline": {
      title: "Review Before Calculating Notice Deadline",
      confirmLabel: "Calculate Notice Deadline",
      module: "Townlight Meetings",
      subject: meetingSubject,
      status: meeting ? `${meeting.status}; ${meeting.notice_status}` : "No meeting selected yet.",
      changes: "Calculates and stores the notice posting deadline from the selected meeting date, lead-day rule, day type, statutory basis, time zone, and clerk approval.",
      visibility: "Internal checklist until the notice is posted or the meeting is archived. The saved calculation keeps the city/state holiday caveat with the source evidence.",
      sources: [
        meeting ? `Target meeting: ${meetingSubject}` : "The desktop app will require a meeting before saving.",
        meeting ? `${(meeting.agenda_items || []).length} agenda item(s)` : "At least one agenda item is required.",
        detailOrFallback(state.workDraft.noticeMeetingType, "Meeting type is required."),
        detailOrFallback(state.workDraft.noticeStatutoryBasis, "Statutory notice basis is required."),
        detailOrFallback(state.workDraft.noticeLeadDays, "Notice lead days are required."),
        detailOrFallback(state.workDraft.noticeDayType, "Notice day type is required."),
        detailOrFallback(state.workDraft.noticeTimeZone, "Notice time zone is required."),
        state.workDraft.noticeHumanApproval ? "Clerk approval checked." : "Clerk approval is required."
      ],
      audit: "Creates a Townlight Meetings audit entry for the calculated notice deadline without claiming legal sufficiency.",
      retry: "If required notice details are missing, the day count or time zone is invalid, approval is unchecked, or the meeting is archived, the desktop app leaves the notice unchanged."
    },
    "complete-notice-checklist": {
      title: "Review Before Approving Notice Checklist",
      confirmLabel: "Approve Notice Checklist",
      module: "Townlight Meetings",
      subject: meetingSubject,
      status: meeting ? `${meeting.status}; ${meeting.notice_status}` : "No meeting selected yet.",
      changes: "Records the meeting type, statutory notice basis, deadline, time zone, and clerk approval needed before posting proof can mark the notice ready.",
      visibility: "Internal checklist until the notice is posted or the meeting is archived.",
      sources: [
        meeting ? `${(meeting.agenda_items || []).length} agenda item(s)` : "The desktop app will require a meeting before saving.",
        detailOrFallback(state.workDraft.noticeMeetingType, "Meeting type is required."),
        detailOrFallback(state.workDraft.noticeStatutoryBasis, "Statutory notice basis is required."),
        detailOrFallback(state.workDraft.noticeDeadline, "Notice deadline is required."),
        detailOrFallback(state.workDraft.noticeTimeZone, "Notice time zone is required."),
        state.workDraft.noticeHumanApproval ? "Clerk approval checked." : "Clerk approval is required."
      ],
      audit: "Creates a Townlight Meetings audit entry for checklist approval without claiming legal sufficiency.",
      retry: "If required checklist details are missing, the time zone is invalid, or approval is not checked, the desktop app leaves the notice unchanged."
    },
    "post-notice": {
      title: "Review Before Posting Notice",
      confirmLabel: "Mark Notice Ready",
      module: "Townlight Meetings",
      subject: meetingSubject,
      status: meeting ? `${meeting.status}; ${meeting.notice_status}` : "No meeting selected yet.",
      changes: "Records final posting proof and marks the current meeting notice as ready for public posting after the approved checklist passes.",
      visibility: "Resident/Public meeting materials can show posted notice information.",
      sources: [
        meeting ? `${(meeting.agenda_items || []).length} agenda item(s)` : "The desktop app will require a meeting before saving.",
        meeting && (meeting.notice_checklists || []).length > 0 ? "Notice checklist approved." : "Approved notice checklist is required.",
        detailOrFallback(state.workDraft.noticePostingDate, "Actual posting date is required."),
        detailOrFallback(meeting?.summary, "No meeting summary has been recorded yet."),
        detailOrFallback(state.workDraft.noticeLocation, "Posting location is required."),
        detailOrFallback(state.workDraft.noticeConfirmation, "Posting confirmation evidence is required.")
      ],
      audit: "Creates a Townlight Meetings audit entry for posting the notice with location, method, and confirmation evidence.",
      retry: "If required meeting details are missing, the desktop app shows the issue and leaves the notice unchanged."
    },
    "export-meeting-packet": {
      title: "Review Before Exporting Records Bundle",
      confirmLabel: "Export Records Bundle",
      module: "Townlight Meetings",
      subject: meetingSubject,
      status: meeting ? meeting.status : "No meeting selected yet.",
      changes: "Writes a local records-ready packet and notice bundle with a checksum manifest, source references, public/staff classification, and export counts.",
      visibility: "Staff bundles remain local staff work unless later posted or archived. Public archive bundles hide local paths and staff-only material.",
      sources: [
        meeting ? `${(meeting.agenda_items || []).length} agenda item(s); ${(meeting.attachments || []).length} packet attachment(s); ${(meeting.motions || []).length} motion(s); ${(meeting.member_votes || []).length} roll-call vote(s); ${(meeting.votes || []).length} recorded outcome(s)` : "The desktop app will require a meeting before saving.",
        detailOrFallback(meeting?.minutes, "No minutes draft has been saved yet.")
      ],
      audit: "Creates a Townlight Meetings audit entry for the packet export and durable records-ready bundle manifest.",
      retry: "If the packet, checksum sidecar, or bundle manifest cannot be written, the desktop app reports the failure and preserves the meeting record."
    },
    "civicnotice-calculate-deadline": {
      title: "Review Before Calculating Notice Deadline",
      confirmLabel: "Calculate Deadline",
      module: "Townlight Notice",
      subject: meetingSubject,
      status: meeting ? `${meeting.status}; ${meeting.notice_status}` : "No meeting selected yet.",
      changes: "Calculates and stores the notice posting deadline from the selected meeting date, lead-day rule, day type, statutory basis, time zone, and clerk approval.",
      visibility: "Internal Townlight Notice workpaper until posting proof is recorded. The saved calculation keeps the city/state holiday caveat with the source evidence.",
      sources: [
        meeting ? `Target meeting: ${meetingSubject}` : "The desktop app will require a meeting before saving.",
        meeting ? `${(meeting.agenda_items || []).length} agenda item(s)` : "At least one agenda item is required.",
        detailOrFallback(state.workDraft.noticeMeetingType, "Meeting type is required."),
        detailOrFallback(state.workDraft.noticeStatutoryBasis, "Statutory notice basis is required."),
        detailOrFallback(state.workDraft.noticeLeadDays, "Notice lead days are required."),
        detailOrFallback(state.workDraft.noticeDayType, "Notice day type is required."),
        detailOrFallback(state.workDraft.noticeTimeZone, "Notice time zone is required."),
        state.workDraft.noticeHumanApproval ? "Clerk approval checked." : "Clerk approval is required."
      ],
      audit: "Creates a Townlight Notice audit entry for the calculated notice deadline without claiming legal sufficiency.",
      retry: "If required notice details are missing, the day count or time zone is invalid, approval is unchecked, or the meeting is archived, the desktop app leaves the notice unchanged."
    },
    "civicnotice-complete-checklist": {
      title: "Review Before Saving Notice Checklist",
      confirmLabel: "Save Checklist",
      module: "Townlight Notice",
      subject: meetingSubject,
      status: meeting ? `${meeting.status}; ${meeting.notice_status}` : "No meeting selected yet.",
      changes: "Records the meeting type, statutory notice basis, deadline, time zone, and clerk approval needed before posting proof can mark the notice ready.",
      visibility: "Internal Townlight Notice checklist until posting proof is recorded or the meeting is archived.",
      sources: [
        meeting ? `${(meeting.agenda_items || []).length} agenda item(s)` : "The desktop app will require a meeting before saving.",
        detailOrFallback(state.workDraft.noticeMeetingType, "Meeting type is required."),
        detailOrFallback(state.workDraft.noticeStatutoryBasis, "Statutory notice basis is required."),
        detailOrFallback(state.workDraft.noticeDeadline, "Notice deadline is required."),
        detailOrFallback(state.workDraft.noticeTimeZone, "Notice time zone is required."),
        state.workDraft.noticeHumanApproval ? "Clerk approval checked." : "Clerk approval is required."
      ],
      audit: "Creates a Townlight Notice audit entry for checklist approval without claiming legal sufficiency.",
      retry: "If required checklist details are missing, the time zone is invalid, or approval is not checked, the desktop app leaves the notice unchanged."
    },
    "civicnotice-post-notice": {
      title: "Review Before Recording Posting Proof",
      confirmLabel: "Record Posting Proof",
      module: "Townlight Notice",
      subject: meetingSubject,
      status: meeting ? `${meeting.status}; ${meeting.notice_status}` : "No meeting selected yet.",
      changes: "Records final posting proof and marks the current meeting notice as ready for public posting after the approved checklist passes.",
      visibility: "Resident/Public meeting materials can show posted notice information.",
      sources: [
        meeting ? `${(meeting.agenda_items || []).length} agenda item(s)` : "The desktop app will require a meeting before saving.",
        meeting && (meeting.notice_checklists || []).length > 0 ? "Notice checklist approved." : "Approved notice checklist is required.",
        detailOrFallback(state.workDraft.noticePostingDate, "Actual posting date is required."),
        detailOrFallback(meeting?.summary, "No meeting summary has been recorded yet."),
        detailOrFallback(state.workDraft.noticeLocation, "Posting location is required."),
        detailOrFallback(state.workDraft.noticeConfirmation, "Posting confirmation evidence is required.")
      ],
      audit: "Creates a Townlight Notice audit entry for posting proof with location, method, and confirmation evidence.",
      retry: "If required meeting details are missing, the desktop app shows the issue and leaves the notice unchanged."
    },
    "civicnotice-export-archive-packet": {
      title: "Review Before Building Notice Archive Packet",
      confirmLabel: "Build Archive Packet",
      module: "Townlight Notice",
      subject: meetingSubject,
      status: meeting ? `${meeting.status}; ${meeting.notice_status}` : "No meeting selected yet.",
      changes: "Writes a public notice archive packet under the Townlight Notice exports folder with checksum and records-ready bundle manifests.",
      visibility: "The notice archive packet uses the public notice projection and omits staff-only paths and closed-session material.",
      sources: [
        meeting ? `Target meeting: ${meetingSubject}` : "The desktop app will require a meeting before saving.",
        meeting && (meeting.notice_checklists || []).length > 0 ? "Notice checklist saved." : "Saved notice checklist is required.",
        meeting && (meeting.notice_postings || []).length > 0 ? "Posting proof recorded." : "Posting proof is required.",
        meeting?.notice_status === "public notice ready" ? "Notice is public notice ready." : "Notice must be public notice ready."
      ],
      audit: "Creates a Townlight Notice audit entry for the notice archive packet and durable bundle manifest.",
      retry: "If the notice packet, checksum sidecar, or bundle manifest cannot be written, the desktop app reports the failure and preserves the meeting record."
    },
    "suggest-minutes-draft": {
      title: "Review Before Generating Minutes Draft",
      confirmLabel: "Generate Minutes Draft",
      module: "Townlight Meetings",
      subject: meetingSubject,
      status: meeting ? meeting.status : "No meeting selected yet.",
      changes: "Uses the verified local AI model to draft internal meeting minutes from the meeting summary, agenda, packet attachments, motions, roll-call votes, outcomes, action items, and comments. It does not adopt or archive the minutes.",
      visibility: "Internal staff draft only. A clerk must review, edit, and adopt minutes before the public archive step.",
      sources: [
        meeting ? `${(meeting.agenda_items || []).length} agenda item(s); ${(meeting.attachments || []).length} packet attachment(s); ${(meeting.motions || []).length} motion(s); ${(meeting.member_votes || []).length} roll-call vote(s); ${(meeting.votes || []).length} outcome(s); ${((meeting.action_records || []).length || (meeting.action_items || []).length)} action item(s)` : "The desktop app will require a meeting before generating.",
        detailOrFallback(meeting?.summary, "No meeting summary has been recorded yet.")
      ],
      audit: "Creates a Townlight Meetings audit entry naming the local model used for the minutes draft.",
      retry: "If the local AI model is not ready, the minutes are already adopted, or no meeting evidence exists, the desktop app stops before changing the draft."
    },
    "add-minute-citation": {
      title: "Review Before Adding Minute Citation",
      confirmLabel: "Add Minute Citation",
      module: "Townlight Meetings",
      subject: meetingSubject,
      status: meeting ? meeting.status : "No meeting selected yet.",
      changes: "Adds source evidence for a specific sentence or excerpt in the current minutes draft.",
      visibility: state.workDraft.minutesCitationAccess === "staff-only"
        ? "Staff-only citation evidence. It will not appear in resident/public archive material."
        : "Public record citation evidence can appear with archived minutes.",
      sources: [
        detailOrFallback(state.workDraft.minutesCitationSentence, "Minutes sentence or excerpt is required."),
        detailOrFallback(state.workDraft.minutesCitationSourceType, "Source type is required."),
        detailOrFallback(state.workDraft.minutesCitationSourceRef, "Source reference is required."),
        detailOrFallback(meeting?.minutes, "No minutes draft has been saved yet.")
      ],
      audit: "Creates a Townlight Meetings audit entry for the minute citation source reference.",
      retry: "If the sentence is not in the current draft, the source reference is missing, or the meeting is archived, the desktop app leaves the minutes unchanged."
    },
    "adopt-minutes": {
      title: "Review Before Adopting Minutes",
      confirmLabel: "Adopt Minutes",
      module: "Townlight Meetings",
      subject: meetingSubject,
      status: meeting ? meeting.status : "No meeting selected yet.",
      changes: "Marks the current minutes as adopted and unlocks the public archive step.",
      visibility: "Adopted minutes remain local staff records until archive/publication.",
      sources: [
        detailOrFallback(meeting?.minutes, "No minutes draft has been saved yet."),
        meeting && (meeting.minute_citations || []).length > 0 ? `${(meeting.minute_citations || []).length} minute citation(s) recorded.` : "At least one minute citation is required.",
        meeting ? `${(meeting.motions || []).length} motion(s); ${(meeting.member_votes || []).length} roll-call vote(s); ${(meeting.votes || []).length} vote/outcome record(s)` : "The desktop app will require a meeting before saving."
      ],
      audit: "Creates a Townlight Meetings audit entry for adopting minutes.",
      retry: "If no minutes draft or citation evidence exists, the desktop app blocks adoption and asks staff to save minutes and add citations first."
    },
    "sign-minutes": {
      title: "Review Before Signing Minutes",
      confirmLabel: "Sign Minutes",
      module: "Townlight Meetings",
      subject: meetingSubject,
      status: meeting ? meeting.status : "No meeting selected yet.",
      changes: "Records the clerk or authorized signer attestation for the adopted minutes before they can become an archived public record.",
      visibility: "Signed minutes remain local staff records until archive/publication. The signer and attestation appear in the public archive after publication.",
      sources: [
        meeting?.minutes_adopted_at_unix_seconds ? "Minutes have been adopted." : "Minutes must be adopted before signing.",
        detailOrFallback(state.workDraft.minutesSignedBy, "Signer name is required."),
        detailOrFallback(state.workDraft.minutesSignatureAttestation, "Signature attestation is required.")
      ],
      audit: "Creates a Townlight Meetings audit entry for signing the adopted minutes.",
      retry: "If minutes are not adopted, already signed, or signer evidence is missing, the desktop app blocks signing and leaves the meeting unchanged."
    },
    "record-member-vote": {
      title: "Review Before Recording Roll Call Vote",
      confirmLabel: "Record Roll Call Vote",
      module: "Townlight Meetings",
      subject: selectedMemberVoteMotion ? selectedMemberVoteMotion.text : "Current motion",
      status: meeting ? meeting.status : "No meeting selected yet.",
      changes: "Records one member's individual roll-call vote against the selected motion.",
      visibility: "Staff meeting record. Roll-call votes appear in the public archive after minutes signing and meeting archive.",
      sources: [
        meeting ? `Target meeting: ${meetingSubject}` : "The desktop app will require a meeting before saving.",
        selectedMemberVoteMotion ? `Motion: ${selectedMemberVoteMotion.text}` : "A motion is required before recording roll-call votes.",
        selectedMemberVoteMember ? `Member: ${selectedMemberVoteMember.name}` : "A member roster entry is required.",
        detailOrFallback(state.workDraft.memberVoteValue, "Vote value is required.")
      ],
      audit: "Creates a Townlight Meetings audit entry for the individual roll-call vote.",
      retry: "If no motion, member, valid vote value, or editable meeting exists, the desktop app leaves the meeting unchanged."
    },
    "record-meeting-attendance": {
      title: "Review Before Recording Attendance",
      confirmLabel: "Record Attendance",
      module: "Townlight Meetings",
      subject: selectedAttendanceMember ? selectedAttendanceMember.name : "Current roster member",
      status: meeting ? meeting.status : "No meeting selected yet.",
      changes: "Records one active roster member's attendance status for the selected meeting before quorum review.",
      visibility: "Staff meeting record now. Attendance appears in public archive material only after minutes signing and meeting archive.",
      sources: [
        meeting ? `Target meeting: ${meetingSubject}` : "The desktop app will require a meeting before saving.",
        selectedAttendanceMember ? `Member: ${selectedAttendanceMember.name}` : "A member roster entry is required.",
        detailOrFallback(state.workDraft.attendanceStatus, "Attendance status is required."),
        detailOrFallback(state.workDraft.attendanceRecordedBy, "Recorded-by name is required."),
        detailOrFallback(state.workDraft.attendanceNote, "Attendance note is optional.")
      ],
      audit: "Creates a Townlight Meetings audit entry for the individual attendance record.",
      retry: "If no member, valid status, recorded-by evidence, or editable meeting exists, the desktop app leaves the meeting unchanged."
    },
    "record-quorum-check": {
      title: "Review Before Saving Quorum Check",
      confirmLabel: "Save Quorum Check",
      module: "Townlight Meetings",
      subject: meetingSubject,
      status: meeting ? meeting.status : "No meeting selected yet.",
      changes: "Calculates and saves a quorum finding from the active roster and recorded attendance evidence.",
      visibility: "Staff meeting record now. Quorum findings appear in public archive material only after minutes signing and meeting archive.",
      sources: [
        meeting ? `Target meeting: ${meetingSubject}` : "The desktop app will require a meeting before saving.",
        `${rosterMembers.length} active roster member(s).`,
        meeting ? `${(meeting.attendance_records || []).length} attendance record(s) saved.` : "Attendance must be recorded first.",
        detailOrFallback(state.workDraft.quorumRequiredCount, "Required count will default to majority of the active roster if left blank."),
        detailOrFallback(state.workDraft.quorumReviewNote, "Quorum review note is required.")
      ],
      audit: "Creates a Townlight Meetings audit entry with roster count, present/remote count, required count, and quorum result.",
      retry: "If attendance is missing, the required count is invalid, the review note is blank, or the meeting is archived, the desktop app leaves quorum records unchanged."
    },
    "record-adopted-legislation": {
      title: "Review Before Recording Adopted Legislation",
      confirmLabel: "Record Adoption",
      module: "Townlight Meetings + Townlight Code",
      subject: meetingSubject,
      status: meeting ? meeting.status : "No meeting selected yet.",
      changes: "Creates a durable adopted ordinance or resolution record, links it to the meeting's passed motion, and queues a Townlight Code draft source for codifier sync.",
      visibility: "Staff workflow until the meeting archive and code publication gates are completed. Townlight Code source publication remains a separate staff action.",
      sources: [
        meeting?.minutes_signed_at_unix_seconds ? "Minutes have been signed." : "Minutes must be signed before recording adopted legislation.",
        meeting && (meeting.motions || []).some((motion) => motion.disposition === "passed") ? "Passed motion is available for traceability." : "A passed motion is required.",
        detailOrFallback(state.workDraft.adoptedLegislationTitle, "Adopted title is required."),
        detailOrFallback(state.workDraft.adoptedLegislationText, "Adopted text is required.")
      ],
      audit: "Creates Townlight Meetings and Townlight Code audit entries linking the adoption event to the local code source queue.",
      retry: "If minutes are not signed, no passed motion exists, or required adoption text is missing, the desktop app leaves Clerk and Code records unchanged."
    },
    "archive-meeting": {
      title: "Review Before Archiving Public Record",
      confirmLabel: "Archive Public Record",
      module: "Townlight Meetings",
      subject: meetingSubject,
      status: meeting ? meeting.status : "No meeting selected yet.",
      changes: "Writes the public archive export, locks later meeting edits, and records a publication event hash.",
      visibility: "Resident/Public meeting materials can show this archived public record.",
      sources: [
        meeting?.minutes_adopted_at_unix_seconds ? "Minutes have been adopted." : "Minutes are not marked adopted yet.",
        meeting?.minutes_signed_at_unix_seconds ? `Signed by ${meeting.minutes_signed_by || "authorized signer"}.` : "Minutes are not signed yet.",
        meeting ? `${(meeting.exports || []).length} existing export(s)` : "The desktop app will require a meeting before saving."
      ],
      audit: "Creates Townlight Meetings audit and Townlight Core publication-gate entries.",
      retry: "If minutes are not adopted or signed, the desktop app blocks archive and leaves the meeting editable."
    },
    "review-public-comment": {
      title: "Review Before Marking Public Comment Reviewed",
      confirmLabel: "Mark Reviewed",
      module: "Townlight Meetings",
      subject: publicCommentSubject,
      status: publicComment ? publicComment.status : "No public comment selected yet.",
      changes: "Marks the selected submitted public comment as reviewed for the public record.",
      visibility: "Reviewed comments can be included in packet/archive material and public search for public meetings.",
      sources: [
        publicComment ? detailOrFallback(publicComment.body, "No comment body is recorded.") : "The desktop app will require a submitted comment before saving.",
        meeting ? `Meeting: ${meetingSubject}` : "The desktop app will require a meeting before saving."
      ],
      audit: "Creates a Townlight Meetings audit entry for public comment review.",
      retry: "If the selected meeting is archived or the comment is missing, the desktop app blocks the review."
    },
    "redact-public-comment": {
      title: "Review Before Redacting Public Comment",
      confirmLabel: "Redact Comment",
      module: "Townlight Meetings",
      subject: publicCommentSubject,
      status: publicComment ? publicComment.status : "No public comment selected yet.",
      changes: "Stores redacted public text while preserving the original comment internally.",
      visibility: "Public packet/archive material and public search use the redacted text, not the original.",
      sources: [
        detailOrFallback(state.workDraft.publicCommentRedactedBody, "No redacted public text has been typed yet."),
        detailOrFallback(state.workDraft.publicCommentRedactionBasis, "No statutory redaction basis has been typed yet.")
      ],
      audit: "Creates a Townlight Meetings audit entry with the redaction basis.",
      retry: "If redacted text or statutory basis is missing, the desktop app blocks the redaction."
    },
    "set-records-deadline": {
      title: "Review Before Setting Records Deadline",
      confirmLabel: "Set Deadline",
      module: "Townlight Records",
      subject: requestSubject,
      status: request ? request.status : "No records request selected yet.",
      changes: "Stores the reviewed response deadline and statutory or policy basis for the selected records request.",
      visibility: "Requester status can show the reviewed deadline. Internal search, exemptions, drafts, and approvals remain staff-only.",
      sources: [
        request ? detailOrFallback(request.summary, "No request summary is recorded.") : "The desktop app will require a request before saving.",
        detailOrFallback(state.workDraft.deadline, "Response deadline is required."),
        detailOrFallback(state.workDraft.recordsDeadlineBasis, "Deadline basis is required.")
      ],
      audit: "Creates a Townlight Records audit entry for deadline review.",
      retry: "If the deadline date or basis is missing or invalid, the desktop app leaves the request unchanged."
    },
    "calculate-records-deadline": {
      title: "Review Before Calculating Records Deadline",
      confirmLabel: "Calculate Deadline",
      module: "Townlight Records",
      subject: requestSubject,
      status: request ? request.status : "No records request selected yet.",
      changes: "Calculates and stores the response deadline for the selected records request from the received date, rule, day count, and day type.",
      visibility: "Requester status can show the calculated deadline and basis. Staff-only notes, searches, and exemption work remain hidden.",
      sources: [
        request ? detailOrFallback(request.summary, "No request summary is recorded.") : "The desktop app will require a request before saving.",
        detailOrFallback(state.workDraft.deadlineReceivedDate, "Received date is required."),
        detailOrFallback(state.workDraft.deadlineRuleName, "Deadline rule name is required."),
        detailOrFallback(state.workDraft.deadlineDayCount, "Deadline day count is required."),
        detailOrFallback(state.workDraft.deadlineDayType, "Deadline day type is required."),
        detailOrFallback(state.workDraft.recordsDeadlineBasis, "Deadline basis is required.")
      ],
      audit: "Creates Townlight Records audit, timeline, notification, and public status evidence for the calculated deadline.",
      retry: "If the received date, day count, day type, basis, or active request is invalid, the desktop app leaves the request unchanged."
    },
    "add-records-message": {
      title: "Review Before Adding Request Message",
      confirmLabel: "Add Request Message",
      module: "Townlight Records",
      subject: requestSubject,
      status: request ? request.status : "No records request selected yet.",
      changes: "Adds a requester-visible message to the selected request thread and queues a local notification log entry.",
      visibility: "Visible to staff and to the requester after a matching request-number/contact lookup. It is not exposed in general public search.",
      sources: [
        request ? detailOrFallback(request.public_tracking_number, "No public tracking number is recorded.") : "The desktop app will require a request before saving.",
        detailOrFallback(state.workDraft.requestMessageBody, "Request message is required.")
      ],
      audit: "Creates a Townlight Records audit entry and timeline entry for the request message.",
      retry: "If no message or active request exists, the desktop app leaves the request thread unchanged."
    },
    "add-records-exemption-decision": {
      title: "Review Before Saving Exemption Decision",
      confirmLabel: "Save Exemption Decision",
      module: "Townlight Records",
      subject: requestSubject,
      status: request ? request.status : "No records request selected yet.",
      changes: "Saves a structured release, redact, or exempt decision for one source segment.",
      visibility: "Staff-only exemption evidence remains local and is included in the exported response package after approval.",
      sources: [
        detailOrFallback(state.workDraft.exemptionSource, "Source record, page, file, timestamp, or segment is required."),
        detailOrFallback(state.workDraft.exemptionDecision, "Decision must be release, redact, or exempt."),
        detailOrFallback(state.workDraft.exemptionBasis, "Statute, ordinance, or city policy basis is required.")
      ],
      audit: "Creates a Townlight Records audit entry and request timeline entry for the decision.",
      retry: "If the source, finding, decision, or basis is missing, the desktop app leaves exemption evidence unchanged."
    },
    "add-records-release-copy": {
      title: "Review Before Attaching Release Copy",
      confirmLabel: "Attach Release Copy",
      module: "Townlight Records",
      subject: recordsDocument ? recordsDocument.title : "Current request document",
      status: recordsDocument ? recordsDocument.status : "No request document selected yet.",
      changes: "Preserves release-ready or redacted evidence in the Townlight local profile. Readable files are copied and hashed; unreadable typed references are saved as local marker files with their own SHA-256 hash.",
      visibility: "Staff can see local release evidence. Requester/public status never exposes local workstation paths.",
      sources: [
        recordsDocument ? `Original document hash: ${recordsDocument.sha256 || "not recorded"}` : "The desktop app will require an attached request document before saving.",
        detailOrFallback(state.workDraft.releaseCopyPath, "Release copy file path or typed reference is required."),
        detailOrFallback(state.workDraft.releaseCopyStatus, "Release copy status is required."),
        detailOrFallback(state.workDraft.releaseCopyNote, "Release note is optional but recommended.")
      ],
      audit: "Creates a Townlight Records audit and request timeline entries for the release/redaction artifact.",
      retry: "If no document is selected or the release status is invalid, the desktop app stops before changing the request. A typed but unreadable release file reference is preserved as a hashed local marker."
    },
    "record-records-search-session": {
      title: "Review Before Saving Search Session",
      confirmLabel: "Save Search Session",
      module: "Townlight Records",
      subject: requestSubject,
      status: request ? request.status : "No records request selected yet.",
      changes: "Saves a durable query, searched locations, and source-result evidence for the selected records request.",
      visibility: "Staff-only search evidence remains local and is included in the exported response package after approval.",
      sources: [
        detailOrFallback(state.workDraft.recordsSearchQuery, "Records search query or scope is required."),
        detailOrFallback(state.workDraft.searchLocations, "Searched systems, folders, or source locations are required."),
        detailOrFallback(state.workDraft.searchResultCitation, "Result citation or source reference is required.")
      ],
      audit: "Creates a Townlight Records audit entry and request timeline entry for the search session.",
      retry: "If query, locations, result title, citation, or summary are missing, the desktop app leaves search evidence unchanged."
    },
    "add-records-fee-line": {
      title: "Review Before Adding Records Fee Line",
      confirmLabel: "Add Fee Line",
      module: "Townlight Records",
      subject: requestSubject,
      status: request ? request.status : "No records request selected yet.",
      changes: "Adds a structured fee line item and updates the request fee estimate.",
      visibility: "Staff-only fee evidence remains local and is included in the exported response package.",
      sources: [
        detailOrFallback(state.workDraft.feeLineDescription, "Fee line description is required."),
        detailOrFallback(state.workDraft.feeScheduleBasis, "Fee schedule or policy basis is required."),
        detailOrFallback(state.workDraft.feeLineAmount, "Fee line amount is required.")
      ],
      audit: "Creates a Townlight Records audit entry for the fee line.",
      retry: "If the amount is missing, zero, negative, or not dollars/cents, the desktop app leaves the request unchanged."
    },
    "waive-records-fee": {
      title: "Review Before Waiving Records Fee",
      confirmLabel: "Waive Fee",
      module: "Townlight Records",
      subject: requestSubject,
      status: request ? request.status : "No records request selected yet.",
      changes: "Records a fee waiver reason and updates the request fee estimate to waived.",
      visibility: "Staff-only waiver evidence remains local and is included in the exported response package.",
      sources: [
        detailOrFallback(state.workDraft.feeWaiverReason, "Fee waiver reason is required."),
        request ? `${(request.fee_line_items || []).length} fee line item(s) currently recorded.` : "The desktop app will require a request before saving."
      ],
      audit: "Creates a Townlight Records audit entry for the fee waiver.",
      retry: "If no waiver reason is entered, the desktop app leaves the request fee state unchanged."
    },
    "approve-records-response": {
      title: "Review Before Approving Records Response",
      confirmLabel: "Approve Response",
      module: "Townlight Records",
      subject: requestSubject,
      status: request ? request.status : "No records request selected yet.",
      changes: "Records human approval for the drafted records response.",
      visibility: "Internal staff status changes to human-approved; nothing is public until export and fulfillment.",
      sources: [
        detailOrFallback(request?.response_draft, "No response draft has been saved yet."),
        request ? `${(request.exemption_reviews || []).length} exemption review note(s); ${(request.exemption_decisions || []).length} exemption decision(s); ${(request.citations || []).length} citation(s)` : "The desktop app will require a request before saving."
      ],
      audit: "Creates a Townlight Records audit entry for human approval.",
      retry: "If the response draft is missing, the desktop app blocks approval before release steps."
    },
    "suggest-records-response": {
      title: "Review Before Generating Records Draft",
      confirmLabel: "Generate Draft",
      module: "Townlight Records",
      subject: requestSubject,
      status: request ? request.status : "No records request selected yet.",
      changes: "Uses the verified local AI model to draft an internal response for staff review. It does not approve, export, or fulfill the request.",
      visibility: "Internal staff draft only. A human must review, edit, cite, and approve before any release step.",
      sources: [
        detailOrFallback(request?.summary, "No request summary has been saved yet."),
        request ? `${(request.search_notes || []).length} search note(s); ${(request.citations || []).length} citation(s)` : "The desktop app will require a request before generating."
      ],
      audit: "Creates a Townlight Records audit entry naming the local model used for the draft.",
      retry: "If the local AI model is not ready or no search/citation evidence exists, the desktop app stops before changing the draft."
    },
    "export-records-response": {
      title: "Review Before Exporting Records Response",
      confirmLabel: "Export Response",
      module: "Townlight Records",
      subject: requestSubject,
      status: request ? request.status : "No records request selected yet.",
      changes: "Writes the approved records response package to the local export folder.",
      visibility: "The export remains local until the request is marked fulfilled.",
      sources: [
        request?.approved_at_unix_seconds ? "Response has human approval." : "Response is not approved yet.",
        request ? `${(request.search_notes || []).length} search note(s); ${(request.approval_notes || []).length} approval note(s)` : "The desktop app will require a request before saving."
      ],
      audit: "Creates a Townlight Records audit entry for exporting the response package.",
      retry: "If approval is missing, the desktop app blocks export and keeps the draft internal."
    },
    "build-records-release-package": {
      title: "Review Before Building Release Package",
      confirmLabel: "Build Release Package",
      module: "Townlight Records",
      subject: requestSubject,
      status: request ? request.status : "No records request selected yet.",
      changes: "Writes a checksummed release package manifest with search, document, and exemption decision evidence.",
      visibility: "The manifest stays local staff evidence until the request is fulfilled; public status does not expose local file paths.",
      sources: [
        request ? `${(request.search_sessions || []).length} search session(s); ${(request.documents || []).length} attached document(s)` : "The desktop app will require a request before building.",
        request ? `${(request.exemption_decisions || []).length} exemption decision(s)` : "The desktop app will require release/redact/exempt decisions."
      ],
      audit: "Creates a Townlight Records audit entry and request timeline entry with the package hash.",
      retry: "If source evidence or exemption decisions are missing, the desktop app leaves release package state unchanged."
    },
    "fulfill-records-request": {
      title: "Review Before Marking Records Fulfilled",
      confirmLabel: "Mark Fulfilled",
      module: "Townlight Records",
      subject: requestSubject,
      status: request ? request.status : "No records request selected yet.",
      changes: "Marks the request fulfilled and records a publication event hash for the released response.",
      visibility: "Resident/Public records status can show the released response metadata.",
      sources: [
        request?.approved_at_unix_seconds ? "Response has human approval." : "Response is not approved yet.",
        request ? `${(request.exports || []).length} export package(s); ${(request.release_packages || []).length} release package manifest(s)` : "The desktop app will require a request before saving."
      ],
      audit: "Creates Townlight Records audit and Townlight Core publication-gate entries.",
      retry: "If approval, export, or release package evidence is missing, the desktop app blocks fulfillment."
    },
    "close-records-request": {
      title: "Review Before Closing Records Request",
      confirmLabel: "Close Request",
      module: "Townlight Records",
      subject: requestSubject,
      status: request ? request.status : "No records request selected yet.",
      changes: "Closes the request after fulfillment and preserves the request history.",
      visibility: "Closed fulfilled requests remain visible in public records status.",
      sources: [
        request?.fulfilled_at_unix_seconds ? "Request has been fulfilled." : "Request is not fulfilled yet.",
        request ? `Due date: ${request.deadline}` : "The desktop app will require a request before saving."
      ],
      audit: "Creates a Townlight Records audit entry for closing the request.",
      retry: "If the request has not been fulfilled, the desktop app blocks closure."
    },
    "mark-notification-sent": {
      title: "Review Before Logging Notification Sent",
      confirmLabel: "Log Notification Sent",
      module: "Townlight Core + Townlight Records",
      subject: notificationSubject,
      status: notification ? notification.status : "No local notification selected yet.",
      changes: "Marks the selected local notification outbox item as sent or otherwise handled by staff.",
      visibility: "Staff-only notification evidence stays in the local city profile and never appears on the Resident/Public surface.",
      sources: [
        notification ? `Audience: ${notification.audience}` : "The desktop app will require a notification before saving.",
        detailOrFallback(notification?.body, "No notification body is recorded yet.")
      ],
      audit: "Creates an audit entry for the module that produced the notification.",
      retry: "If the notification is already logged as sent or no ready notification exists, the desktop app leaves the outbox unchanged."
    },
    "import-code-source": {
      title: "Review Before Importing Code Source",
      confirmLabel: "Import Source",
      module: "Townlight Code",
      subject: detailOrFallback(state.workDraft.codeTitle, "New municipal code source"),
      status: "Not saved yet.",
      changes: "Creates a durable local code source with citation text. If the typed source path is readable, Townlight copies and hashes it; if it is not readable, Townlight saves a local reference marker file with its own SHA-256 hash.",
      visibility: "Staff can see local source evidence. Resident/Public views only see published code sources and never see clerk workstation paths.",
      sources: [
        detailOrFallback(state.workDraft.codeCitation, "Citation is required."),
        detailOrFallback(state.workDraft.codeBody, "Source text is required for search, questions, and publication."),
        detailOrFallback(state.workDraft.codeSourcePath, "Optional source file path or typed reference has not been entered.")
      ],
      audit: "Creates a Townlight Code audit entry recording the local import and any preserved source-file evidence.",
      retry: "If title, citation, or source text is missing, the desktop app stops before saving. A typed but unreadable file reference is preserved as a hashed local marker."
    },
    "approve-code-guidance": {
      title: "Review Before Approving Code Guidance",
      confirmLabel: "Approve Guidance",
      module: "Townlight Code",
      subject: sourceSubject,
      status: source ? source.status : "No code source selected yet.",
      changes: "Approves staff guidance and any plain-English summary for public-facing code context.",
      visibility: "Approved summaries can appear with published code sources as non-authoritative guidance.",
      sources: [
        detailOrFallback(source?.staff_guidance, "No guidance draft has been saved yet."),
        detailOrFallback(source?.plain_language_summary, "No plain-English summary has been saved yet.")
      ],
      audit: "Creates a Townlight Code audit entry for approving guidance.",
      retry: "If guidance is missing, the desktop app blocks approval and keeps the source internal."
    },
    "suggest-code-guidance": {
      title: "Review Before Generating Code Guidance",
      confirmLabel: "Generate Guidance",
      module: "Townlight Code",
      subject: sourceSubject,
      status: source ? source.status : "No code source selected yet.",
      changes: "Uses the verified local AI model to draft internal staff guidance from the selected source text.",
      visibility: "Internal staff draft only. A human must review and approve before it can support public summaries.",
      sources: [
        source ? `Citation: ${source.citation}` : "The desktop app will require a code source before generating.",
        detailOrFallback(source?.body, "No source text has been imported yet.")
      ],
      audit: "Creates a Townlight Code audit entry naming the local model used for the draft.",
      retry: "If the local AI model is not ready or no source exists, the desktop app stops before changing guidance."
    },
    "publish-code-source": {
      title: "Review Before Publishing Code Source",
      confirmLabel: "Publish Source",
      module: "Townlight Code",
      subject: sourceSubject,
      status: source ? `${source.public_status || "internal draft"}; ${source.codifier_sync_status || "not synced"}` : "No code source selected yet.",
      changes: "Writes a public code export and records a publication event hash.",
      visibility: "Resident/Public municipal code search can show the published source and approved non-authoritative summary.",
      sources: [
        source ? `Citation: ${source.citation}` : "The desktop app will require a code source before saving.",
        source?.guidance_approved_at_unix_seconds ? "Guidance has human approval." : "Guidance is not approved; only source text and required disclaimers will publish."
      ],
      audit: "Creates Townlight Code audit and Townlight Core publication-gate entries.",
      retry: "If required source text is missing, the desktop app blocks publication."
    },
    "unpublish-code-source": {
      title: "Review Before Unpublishing Code Source",
      confirmLabel: "Unpublish Source",
      module: "Townlight Code",
      subject: sourceSubject,
      status: source ? source.public_status || "internal draft" : "No code source selected yet.",
      changes: "Returns the source to internal draft status and retracts the latest live publication event.",
      visibility: "Resident/Public municipal code search stops showing this source.",
      sources: [
        source ? `${(source.public_exports || []).length} public export(s) remain in local history.` : "The desktop app will require a code source before saving.",
        "Retraction keeps publication history instead of deleting the prior event."
      ],
      audit: "Creates Townlight Code audit and Townlight Core retraction metadata.",
      retry: "If no source exists, the desktop app stops before changing local records."
    },
    "create-code-handoff": {
      title: "Review Before Creating Clerk Handoff",
      confirmLabel: "Create Clerk Handoff",
      module: "Townlight Code",
      subject: sourceSubject,
      status: source ? source.status : "No code source selected yet.",
      changes: "Creates an internal clerk handoff for ordinance or resolution agenda work.",
      visibility: "Staff-only handoff until the clerk adds it to a meeting agenda and later posts materials.",
      sources: [
        source ? `Citation: ${source.citation}` : "The desktop app will require a code source before saving.",
        detailOrFallback(state.workDraft.handoffSummary, "No handoff summary has been typed yet.")
      ],
      audit: "Creates a Townlight Code audit entry for the clerk handoff.",
      retry: "If no source exists, the desktop app blocks handoff creation."
    },
    "civicaccess-delete-review": {
      title: "Review Before Deleting Accessibility Review",
      confirmLabel: "Delete Review",
      module: "Townlight Access",
      subject: targetDeleteReview ? (targetDeleteReview.title || "(no title)") : "Selected accessibility review",
      status: targetDeleteReview ? targetDeleteReview.status : "Review no longer found.",
      changes: "Removes this review from the saved-review list. The review's audit-trail entry remains in the hash-chained audit log.",
      visibility: "Staff-only saved-review list. The audit-trail entry stays visible to anyone who can read the audit log.",
      sources: [
        targetDeleteReview ? `Review ID: ${targetDeleteReview.review_id}` : "This review may have already been deleted.",
        "This cannot be undone from the saved-review list."
      ],
      audit: "Creates a Townlight Access audit entry recording the deletion.",
      retry: "If the review was already deleted, the desktop app reports it is no longer in the local store."
    },
    "accessibility-review": {
      title: "Review Before Running Accessibility Review",
      confirmLabel: "Run Review & Save",
      module: "Townlight Access",
      subject: detailOrFallback(state.workDraft.accessTitle, "(no title)"),
      status: aiEngineReady()
        ? "Local AI engine ready — deterministic checks plus an advisory AI analysis."
        : "AI engine not ready — deterministic checks only.",
      changes: "Runs the five deterministic WCAG sample checks and saves the review. When the local AI engine is ready, an advisory remediation analysis is generated and stored with the review; the AI never adds, removes, or reclassifies a finding.",
      visibility: "Staff-only saved-review list plus the audit trail. Advisory support, not a certified accessibility audit.",
      sources: [
        detailOrFallback(state.workDraft.accessBody, "No public text entered yet."),
        aiEngineReady()
          ? "AI analysis runs on the local model; nothing leaves this machine."
          : "The five WCAG checks run normally without the AI engine."
      ],
      audit: "Creates a Townlight Access audit entry naming the engine used (local model or deterministic only).",
      retry: "If the AI engine is not ready, the review still saves with deterministic findings only and says so — nothing is generated by AI in that case."
    },
    "civicaccess-plain-language": {
      title: "Review Before Drafting Plain-Language Rewrite",
      confirmLabel: "Draft Rewrite",
      module: "Townlight Access",
      subject: "Plain-language rewrite",
      status: aiEngineReady()
        ? "Local AI engine ready — drafts a real plain-language rewrite."
        : "AI engine not ready — deterministic sample pass only.",
      changes: aiEngineReady()
        ? "Uses the verified local AI model to draft a plain-language rewrite of the entered text for staff review. Facts, dates, deadlines, and obligations must be preserved; a human reviews before publication."
        : "Runs the deterministic jargon-map sample pass on the entered text and labels the output \"AI engine not ready\" — no AI draft is generated. A human reviews before publication.",
      visibility: "Internal staff draft only. Nothing is published or persisted beyond the audit trail.",
      sources: [
        detailOrFallback(state.workDraft.accessPlainText, "No text entered yet."),
        aiEngineReady()
          ? "Runs on the local model; nothing leaves this machine."
          : "Falls back to the deterministic jargon-map sample pass."
      ],
      audit: "Creates a Townlight Access audit entry naming the engine used for the rewrite.",
      retry: "If the local AI engine is not ready, the tool falls back to the deterministic sample and says so — nothing is generated by AI in that case."
    },
    "civicaccess-language-variant": {
      title: "Review Before Drafting Translation Variant",
      confirmLabel: "Draft Variant",
      module: "Townlight Access",
      subject: `Variant language: ${detailOrFallback(state.workDraft.accessVariantLanguage, "(not set)")}`,
      status: aiEngineReady()
        ? "Local AI engine ready — drafts a real translation of your text."
        : "AI engine not ready — canned sample or placeholder only.",
      changes: aiEngineReady()
        ? "Uses the verified local AI model to draft a translation of the entered text into the requested language. Every draft requires a qualified human translator's review before publication."
        : "Returns the canned es/vi sample or an explicit placeholder, labeled \"AI engine not ready\" — no AI translation is drafted. Every variant requires a qualified human translator's review before publication.",
      visibility: "Internal staff draft only. Nothing is published or persisted beyond the audit trail.",
      sources: [
        detailOrFallback(state.workDraft.accessVariantText, "No text entered yet."),
        aiEngineReady()
          ? "Runs on the local model; nothing leaves this machine."
          : "Falls back to the canned es/vi sample or a placeholder."
      ],
      audit: "Creates a Townlight Access audit entry naming the engine used and the qualified-translator requirement.",
      retry: "If the local AI engine is not ready, the tool falls back to the deterministic sample and says so — nothing is generated by AI in that case."
    }
  };
  return reviews[action] || null;
}

function requiresGuidedWorkReview(action) {
  return GUIDED_WORK_ACTIONS.has(action);
}

function renderGuidedWorkReview() {
  const review = guidedReviewForAction(state.pendingWorkReviewAction);
  if (!review) return "";
  return `
    <section class="guided-review" data-guided-review="work" aria-labelledby="guided-review-title">
      <div>
        <p class="eyebrow">${escapeHtml(review.module)}</p>
        <h3 id="guided-review-title">${escapeHtml(review.title)}</h3>
        <p>${escapeHtml(review.subject)}</p>
      </div>
      <div class="review-grid">
        <div>
          <strong>Current status</strong>
          <p>${escapeHtml(review.status)}</p>
        </div>
        <div>
          <strong>What will change</strong>
          <p>${escapeHtml(review.changes)}</p>
        </div>
        <div>
          <strong>Who can see it</strong>
          <p>${escapeHtml(review.visibility)}</p>
        </div>
        <div>
          <strong>Audit trail</strong>
          <p>${escapeHtml(review.audit)}</p>
        </div>
      </div>
      <div>
        <strong>Sources and evidence</strong>
        <ul class="review-evidence">
          ${review.sources.map((source) => `<li>${escapeHtml(source)}</li>`).join("")}
        </ul>
      </div>
      <p class="next-action">${escapeHtml(review.retry)}</p>
      <div class="review-actions">
        <button type="button" class="primary-action" data-review-confirm="${state.pendingWorkReviewAction}">Confirm ${escapeHtml(review.confirmLabel)}</button>
        <button type="button" class="secondary-action" data-review-cancel>Cancel Review</button>
      </div>
    </section>
  `;
}

function isPublicSurface() {
  return state.activeSurface === "Resident/Public";
}

function isPublicReadableArea() {
  return isPublicSurface() && ["home", "meetings", "records", "code", "search"].includes(state.activeArea);
}

function publicCommentView(comment) {
  if (!["reviewed for public record", "redacted for public record"].includes(comment.status)) return null;
  const publicComment = { ...comment, commenter_contact: "" };
  if (publicComment.status === "redacted for public record" && publicComment.redacted_body) {
    publicComment.body = publicComment.redacted_body;
  }
  return publicComment;
}

function publicMeetingView(meeting) {
  const publicArchive = meeting.status === "archived public record" || Boolean(meeting.archived_at_unix_seconds);
  const publicNotice = meeting.notice_status === "public notice ready";
  if (!publicArchive && !publicNotice) return null;
  const publicMeeting = {
    ...meeting,
    exports: [],
    public_comments: (meeting.public_comments || []).map(publicCommentView).filter(Boolean),
    attachments: (meeting.attachments || [])
      .filter((attachment) => attachment.access_level === "public packet")
      .map((attachment) => ({
        ...attachment,
        original_path: "",
        stored_path: "",
        added_by: ""
    })),
    staff_reports: meeting.staff_reports || [],
    packet_assemblies: meeting.packet_assemblies || [],
    export_bundles: (meeting.export_bundles || [])
      .filter((bundle) => bundle.public_record)
      .map((bundle) => ({
        ...bundle,
        export_path: "",
        manifest_path: "",
        integrity_manifest_path: ""
      })),
    member_votes: meeting.member_votes || [],
    minute_citations: (meeting.minute_citations || [])
      .filter((citation) => citation.access_level === "public record"),
    closed_sessions: (meeting.closed_sessions || []).map((session) => ({
      ...session,
      attendees: [],
      staff_notes_reference: ""
    }))
  };
  if (!publicArchive) {
    publicMeeting.minutes = "";
    publicMeeting.minute_citations = [];
    publicMeeting.minutes_signed_by = "";
    publicMeeting.minutes_signature_attestation = "";
    publicMeeting.minutes_signed_at_unix_seconds = null;
    publicMeeting.motions = [];
    publicMeeting.member_votes = [];
    publicMeeting.attendance_records = [];
    publicMeeting.quorum_checks = [];
    publicMeeting.votes = [];
    publicMeeting.staff_reports = [];
    publicMeeting.action_items = [];
    publicMeeting.action_records = [];
    publicMeeting.adopted_legislation = [];
    publicMeeting.closed_sessions = [];
    publicMeeting.packet_assemblies = [];
    publicMeeting.export_bundles = [];
    publicMeeting.resident_comments = [];
  }
  return publicMeeting;
}

function publicMeetings(work) {
  return work.meetings.map(publicMeetingView).filter(Boolean);
}

function publicCommentMeetings(work) {
  return publicMeetings(work).filter((meeting) => (
    !meeting.archived_at_unix_seconds &&
    meeting.status !== "archived public record" &&
    (
      meeting.notice_status === "public notice ready" ||
      meeting.status === "public comments received"
    )
  ));
}

function publicReadyCommentCount(meeting) {
  return (meeting.public_comments || []).filter((comment) => (
    comment.status === "reviewed for public record" ||
    comment.status === "redacted for public record"
  )).length;
}

function renderPublicMeetingsWorkflow() {
  const work = cityWork();
  const meetings = publicMeetings(work);
  const commentMeetings = publicCommentMeetings(work);
  const selectedCommentMeetingId = state.workDraft.publicCommentMeetingId || commentMeetings[0]?.id || "";
  return `
    <section class="page-heading">
      <p class="eyebrow">Resident/Public</p>
      <h2>Public Meeting Materials</h2>
      <p>Posted agendas, notices, packets, and approved public outcomes appear here without staff drafting controls.</p>
    </section>
    <section class="workflow-editor">
      <div class="workflow-form">
        <h3>Submit Public Comment</h3>
        <p class="form-help">Written and remote comments become part of the meeting record and are reviewed by the clerk under the city's public comment rules.</p>
        ${commentMeetings.length === 0 ? `<p class="form-help">No posted public meeting is open for comment.</p>` : ""}
        <label>Meeting
          <select data-work-field="publicCommentMeetingId" ${commentMeetings.length === 0 ? "disabled" : ""}>
            ${commentMeetings.length === 0 ? `<option>No meeting available</option>` : commentMeetings.map((meeting) => `
              <option value="${escapeHtml(meeting.id)}" ${meeting.id === selectedCommentMeetingId ? "selected" : ""}>${escapeHtml(meeting.meeting_date)} - ${escapeHtml(meeting.title)}</option>
            `).join("")}
          </select>
        </label>
        <label>Your name <input type="text" data-work-field="publicCommentName" value="${escapeHtml(state.workDraft.publicCommentName)}" autocomplete="name" /></label>
        <label>Email or phone <input type="text" data-work-field="publicCommentContact" value="${escapeHtml(state.workDraft.publicCommentContact)}" autocomplete="email" /></label>
        <label>Comment type
          <select data-work-field="publicCommentMode">
            ${["written", "remote", "in-person sign-up"].map((mode) => `<option value="${mode}" ${state.workDraft.publicCommentMode === mode ? "selected" : ""}>${mode}</option>`).join("")}
          </select>
        </label>
        <label>Agenda item or topic <input type="text" data-work-field="publicCommentTopic" value="${escapeHtml(state.workDraft.publicCommentTopic)}" /></label>
        <label>Comment <textarea data-work-field="publicCommentBody">${escapeHtml(state.workDraft.publicCommentBody)}</textarea></label>
        ${commentMeetings.length === 0 ? `<button type="button" class="primary-action" disabled>Submit Public Comment</button>` : `<button type="button" class="primary-action" data-work-action="submit-public-comment">Submit Public Comment</button>`}
      </div>
    </section>
    ${renderWorkActionResult()}
    <section class="workflow-list">
      ${meetings.length === 0 ? workflowEmpty("No public meeting materials have been posted yet.") : meetings.map((meeting) => `
        <article class="workflow-record">
          <span class="status-ok">${meeting.status === "archived public record" ? "archived public record" : escapeHtml(meeting.notice_status)}</span>
          <h3>${escapeHtml(meeting.title)}</h3>
          <p><strong>Body:</strong> ${escapeHtml(meeting.body_name || "City Council")}</p>
          <p>${escapeHtml(meeting.summary || "No public summary recorded.")}</p>
          ${(meeting.staff_reports || []).length > 0 ? `<p><strong>Staff reports:</strong> ${(meeting.staff_reports || []).map((report) => `${escapeHtml(report.agenda_item_title)} - ${escapeHtml(report.recommendation)}`).join("; ")}</p>` : ""}
          ${(meeting.attachments || []).length > 0 ? `<p><strong>Public packet attachments:</strong> ${(meeting.attachments || []).map((attachment) => `${escapeHtml(attachment.title)} (${escapeHtml(attachment.packet_section)})`).join("; ")}</p>` : ""}
          ${(meeting.packet_assemblies || []).length > 0 ? `<p><strong>Packet finalization:</strong> ${(meeting.packet_assemblies || []).map((packet) => `${escapeHtml(packet.packet_title)} (${escapeHtml(packet.status)}; reviewed by ${escapeHtml(packet.prepared_by)})`).join("; ")}</p>` : ""}
          ${(meeting.export_bundles || []).length > 0 ? `<p><strong>Records-ready bundles:</strong> ${(meeting.export_bundles || []).map((bundle) => `public archive bundle sha256 ${escapeHtml(String(bundle.export_hash || "").slice(0, 12))}; manifest ${escapeHtml(String(bundle.manifest_hash || "").slice(0, 12))}; ${bundle.agenda_item_count || 0} agenda items; ${bundle.notice_posting_count || 0} notice postings`).join("; ")}</p>` : ""}
          ${(meeting.attendance_records || []).length > 0 ? `<p><strong>Attendance:</strong> ${(meeting.attendance_records || []).map((record) => `${escapeHtml(record.member_name)} ${escapeHtml(record.status)}`).join("; ")}</p>` : ""}
          ${(meeting.quorum_checks || []).length > 0 ? `<p><strong>Quorum:</strong> ${(meeting.quorum_checks || []).map((record) => `${escapeHtml(record.status)} - ${Number(record.present_count || 0) + Number(record.remote_count || 0)} of ${escapeHtml(record.required_count || 0)} required`).join("; ")}</p>` : ""}
          ${(meeting.member_votes || []).length > 0 ? `<p><strong>Roll-call votes:</strong> ${(meeting.member_votes || []).map((vote) => `${escapeHtml(vote.member_name)} ${escapeHtml(vote.vote)} on ${escapeHtml(vote.motion_text)}`).join("; ")}</p>` : ""}
          ${(meeting.minute_citations || []).length > 0 ? `<p><strong>Public minute citations:</strong> ${(meeting.minute_citations || []).map((citation) => `${escapeHtml(citation.source_type)} ${escapeHtml(citation.source_reference)}`).join("; ")}</p>` : ""}
          <small>${escapeHtml(meeting.meeting_date)} - ${escapeHtml(meeting.body_name || "City Council")} - ${(meeting.agenda_items || []).length} agenda items - ${(meeting.staff_reports || []).length} staff reports - ${(meeting.attachments || []).length} packet attachments - ${(meeting.packet_assemblies || []).length} packet finalizations - ${(meeting.export_bundles || []).length} records-ready bundles - ${(meeting.attendance_records || []).length} attendance records - ${(meeting.quorum_checks || []).length} quorum checks - ${(meeting.minute_citations || []).length} minute citations - ${(meeting.motions || []).length} motions - ${(meeting.member_votes || []).length} roll-call votes - ${(meeting.votes || []).length} outcomes - ${publicReadyCommentCount(meeting)} reviewed public comments - ${(meeting.exports || []).length} public exports</small>
        </article>
      `).join("")}
    </section>
  `;
}

function renderMeetingsWorkflow() {
  if (isPublicSurface()) return renderPublicMeetingsWorkflow();
  const work = cityWork();
  const bodies = meetingBodies(work);
  const selectedBodyId = state.workDraft.meetingBodyId || bodies[0]?.id || "";
  const selectedMeeting = currentMeeting(work);
  const selectedMeetingAgendaItems = selectedMeeting?.agenda_items || [];
  const selectedStaffReportAgendaItemId = state.workDraft.staffReportAgendaItemId || selectedMeetingAgendaItems[0]?.id || "";
  const rosterMembers = meetingMembers(work).filter((member) => !selectedMeeting || !selectedMeeting.body_id || member.body_id === selectedMeeting.body_id);
  const selectedMeetingMotions = selectedMeeting?.motions || [];
  const selectedMemberVoteMotionId = selectedMeetingMotions.some((motion) => motion.id === state.workDraft.memberVoteMotionId)
    ? state.workDraft.memberVoteMotionId
    : selectedMeetingMotions[selectedMeetingMotions.length - 1]?.id || "";
  const selectedMemberVoteMemberId = rosterMembers.some((member) => member.id === state.workDraft.memberVoteMemberId)
    ? state.workDraft.memberVoteMemberId
    : rosterMembers[0]?.id || "";
  const selectedAttendanceMemberId = rosterMembers.some((member) => member.id === state.workDraft.attendanceMemberId)
    ? state.workDraft.attendanceMemberId
    : rosterMembers[0]?.id || "";
  const selectedAgendaIntake = currentAgendaIntake(work);
  const selectedAgendaIntakeCanReview = selectedAgendaIntake && selectedAgendaIntake.status !== "promoted to agenda";
  const selectedAgendaIntakeCanPromote = selectedAgendaIntake && selectedMeeting && selectedAgendaIntake.status === "ready for agenda";
  const selectedPublicComment = currentPublicComment(work);
  const pendingCodeHandoffs = work.code_handoffs.filter((handoff) => handoff.status !== "sent to clerk agenda");
  return `
    <section class="page-heading">
      <p class="eyebrow">${state.activeSurface}</p>
      <h2>Meetings & Notices</h2>
      <p>Create meetings, agenda items, notices, minutes, votes, and action records in the local city profile.</p>
    </section>
    ${renderGuidedWorkReview()}
    <section class="workflow-editor">
      <div class="workflow-form">
        <h3>Meeting Bodies</h3>
        <p class="form-help">Set up the council, board, commission, or authority that holds meetings before scheduling recurring work.</p>
        <label>Meeting body name <input type="text" data-work-field="meetingBodyName" value="${escapeHtml(state.workDraft.meetingBodyName)}" placeholder="City Council" /></label>
        <label>Body type <input type="text" data-work-field="meetingBodyType" value="${escapeHtml(state.workDraft.meetingBodyType)}" placeholder="legislative, advisory, authority" /></label>
        <label>Body statutory basis <input type="text" data-work-field="meetingBodyStatutoryBasis" value="${escapeHtml(state.workDraft.meetingBodyStatutoryBasis)}" placeholder="Municipal charter or ordinance section" /></label>
        <label>Meeting cadence <input type="text" data-work-field="meetingBodyCadence" value="${escapeHtml(state.workDraft.meetingBodyCadence)}" placeholder="First and third Tuesday" /></label>
        <label>Default notice days <input type="number" min="0" max="365" data-work-field="meetingBodyDefaultNoticeDays" value="${escapeHtml(state.workDraft.meetingBodyDefaultNoticeDays)}" /></label>
        <label>Quorum rule <input type="text" data-work-field="meetingBodyQuorumRule" value="${escapeHtml(state.workDraft.meetingBodyQuorumRule)}" placeholder="majority of seated members" /></label>
        <div class="workflow-actions">
          <button type="button" class="secondary-action" data-work-action="create-meeting-body">Save Meeting Body</button>
        </div>
        <p class="form-help">${bodies.length === 0 ? "No meeting bodies saved yet." : `Saved bodies: ${bodies.map((body) => escapeHtml(body.name)).join(", ")}`}</p>
      </div>
      <div class="workflow-form">
        <h3>Member Roster</h3>
        <p class="form-help">Save council, board, commission, or authority members before recording roll-call votes.</p>
        <label>Roster body
          ${bodies.length > 0 ? `<select data-work-field="meetingBodyId">
            ${bodies.map((body) => `<option value="${escapeHtml(body.id)}" ${body.id === selectedBodyId ? "selected" : ""}>${escapeHtml(body.name)} - ${escapeHtml(body.statutory_basis)}</option>`).join("")}
          </select>` : `<input type="text" data-work-field="meetingBodyName" value="${escapeHtml(state.workDraft.meetingBodyName)}" placeholder="City Council" />`}
        </label>
        <label>Member name <input type="text" data-work-field="memberName" value="${escapeHtml(state.workDraft.memberName)}" /></label>
        <label>Member role <input type="text" data-work-field="memberRole" value="${escapeHtml(state.workDraft.memberRole)}" placeholder="Mayor, Councilmember, Chair" /></label>
        <label>Term start <input type="date" data-work-field="memberTermStart" value="${escapeHtml(state.workDraft.memberTermStart)}" /></label>
        <label>Term end <input type="date" data-work-field="memberTermEnd" value="${escapeHtml(state.workDraft.memberTermEnd)}" /></label>
        <label>Member email <input type="email" data-work-field="memberEmail" value="${escapeHtml(state.workDraft.memberEmail)}" /></label>
        <div class="workflow-actions">
          ${bodies.length === 0 ? `<button type="button" class="secondary-action" disabled>Save Member</button>` : `<button type="button" class="secondary-action" data-work-action="add-meeting-member">Save Member</button>`}
        </div>
        <p class="form-help">${meetingMembers(work).length === 0 ? "No roster members saved yet." : `Roster members: ${meetingMembers(work).map((member) => `${escapeHtml(member.name)} (${escapeHtml(member.role)})`).join(", ")}`}</p>
      </div>
      <div class="workflow-form">
        <h3>Agenda Intake Queue</h3>
        <p class="form-help">Capture department requests and source material before the clerk promotes an item to a meeting agenda.</p>
        <label>Intake title <input type="text" data-work-field="agendaIntakeTitle" value="${escapeHtml(state.workDraft.agendaIntakeTitle)}" /></label>
        <label>Submitted by <input type="text" data-work-field="agendaIntakeSubmitter" value="${escapeHtml(state.workDraft.agendaIntakeSubmitter)}" /></label>
        <label>Department <input type="text" data-work-field="agendaIntakeDepartment" value="${escapeHtml(state.workDraft.agendaIntakeDepartment)}" /></label>
        <label>Requested meeting date <input type="date" data-work-field="agendaIntakeMeetingDate" value="${escapeHtml(state.workDraft.agendaIntakeMeetingDate)}" /></label>
        <label>Intake summary <textarea data-work-field="agendaIntakeSummary">${escapeHtml(state.workDraft.agendaIntakeSummary)}</textarea></label>
        <label>Source or citation <input type="text" data-work-field="agendaIntakeSourceReference" value="${escapeHtml(state.workDraft.agendaIntakeSourceReference)}" placeholder="Department memo, staff report, code section, or file reference" /></label>
        <div class="workflow-actions">
          <button type="button" class="secondary-action" data-work-action="submit-agenda-intake">Submit Agenda Intake</button>
        </div>
      </div>
      <div class="workflow-form">
        <h3>Review Agenda Intake</h3>
        <p class="form-help">${selectedAgendaIntake ? `${selectedAgendaIntake.title} - ${selectedAgendaIntake.status}` : "No agenda intake item is selected for review."}</p>
        <label>Readiness decision
          <select data-work-field="agendaIntakeDecision">
            ${["ready for agenda", "needs more information"].map((decision) => `<option value="${decision}" ${state.workDraft.agendaIntakeDecision === decision ? "selected" : ""}>${decision}</option>`).join("")}
          </select>
        </label>
        <label>Clerk review note <textarea data-work-field="agendaIntakeReviewNote">${escapeHtml(state.workDraft.agendaIntakeReviewNote)}</textarea></label>
        <div class="workflow-actions">
          ${selectedAgendaIntakeCanReview ? `<button type="button" class="secondary-action" data-work-action="review-agenda-intake">Review Agenda Intake</button>` : `<button type="button" class="secondary-action" disabled>Review Agenda Intake</button>`}
          ${selectedAgendaIntakeCanPromote ? `<button type="button" class="secondary-action" data-work-action="promote-agenda-intake">Promote To Agenda</button>` : `<button type="button" class="secondary-action" disabled>Promote To Agenda</button>`}
        </div>
      </div>
      <div class="workflow-form">
        <h3>Prepare Meeting</h3>
        <label>Meeting body
          ${bodies.length > 0 ? `<select data-work-field="meetingBodyId">
            ${bodies.map((body) => `<option value="${escapeHtml(body.id)}" ${body.id === selectedBodyId ? "selected" : ""}>${escapeHtml(body.name)} - ${escapeHtml(body.statutory_basis)}</option>`).join("")}
          </select>` : `<input type="text" data-work-field="meetingBodyName" value="${escapeHtml(state.workDraft.meetingBodyName)}" placeholder="City Council" />`}
        </label>
        ${bodies.length === 0 ? `<p class="form-help">Save a meeting body with statutory basis before creating a meeting.</p>` : ""}
        <label>Meeting title <input type="text" data-work-field="meetingTitle" value="${escapeHtml(state.workDraft.meetingTitle)}" /></label>
        <label>Date <input type="date" data-work-field="meetingDate" value="${escapeHtml(state.workDraft.meetingDate)}" /></label>
        <label>Summary <textarea data-work-field="meetingSummary">${escapeHtml(state.workDraft.meetingSummary)}</textarea></label>
        <label>First agenda item <input type="text" data-work-field="agendaTitle" value="${escapeHtml(state.workDraft.agendaTitle)}" /></label>
        <label>Notice meeting type <input type="text" data-work-field="noticeMeetingType" value="${escapedDraft("noticeMeetingType")}" placeholder="Regular council meeting" /></label>
        <label>Statutory notice basis <input type="text" data-work-field="noticeStatutoryBasis" value="${escapedDraft("noticeStatutoryBasis")}" placeholder="Municipal open meetings notice" /></label>
        <label>Notice lead days <input type="number" min="1" max="365" step="1" data-work-field="noticeLeadDays" value="${escapedDraft("noticeLeadDays")}" /></label>
        <label>Notice day type
          <select data-work-field="noticeDayType">
            <option value="calendar days" ${state.workDraft.noticeDayType === "calendar days" ? "selected" : ""}>Calendar days</option>
            <option value="business days" ${state.workDraft.noticeDayType === "business days" ? "selected" : ""}>Business days</option>
          </select>
        </label>
        <p class="form-help">Business-day notice calculations skip weekends. Staff must still check city/state holidays before posting.</p>
        <label>Notice deadline <input type="date" data-work-field="noticeDeadline" value="${escapedDraft("noticeDeadline")}" /></label>
        <label>Notice time zone <input type="text" data-work-field="noticeTimeZone" value="${escapedDraft("noticeTimeZone")}" placeholder="America/Denver" /></label>
        <label class="checkbox-row"><input type="checkbox" data-work-field="noticeHumanApproval" ${state.workDraft.noticeHumanApproval ? "checked" : ""} /> Clerk has reviewed and approved the notice checklist</label>
        <label>Actual posting date <input type="date" data-work-field="noticePostingDate" value="${escapeHtml(state.workDraft.noticePostingDate)}" /></label>
        <label>Notice posting location <input type="text" data-work-field="noticeLocation" value="${escapeHtml(state.workDraft.noticeLocation)}" placeholder="City Hall bulletin board and city website" /></label>
        <label>Notice posting method <input type="text" data-work-field="noticeMethod" value="${escapeHtml(state.workDraft.noticeMethod)}" placeholder="Posted PDF and clerk attestation" /></label>
        <label>Posting confirmation <textarea data-work-field="noticeConfirmation">${escapeHtml(state.workDraft.noticeConfirmation)}</textarea></label>
        <div class="workflow-actions">
          ${bodies.length === 0 ? `<button type="button" class="primary-action" disabled>Create Meeting</button>` : `<button type="button" class="primary-action" data-work-action="create-meeting">Create Meeting</button>`}
          <button type="button" class="secondary-action" data-work-action="add-agenda-item">Add Agenda Item</button>
          <button type="button" class="secondary-action" data-work-action="add-code-handoff-agenda">Add Code Handoff</button>
          <button type="button" class="secondary-action" data-work-action="calculate-notice-deadline">Calculate Notice Deadline</button>
          <button type="button" class="secondary-action" data-work-action="complete-notice-checklist">Approve Notice Checklist</button>
          <button type="button" class="secondary-action" data-work-action="post-notice">Mark Notice Ready</button>
          <button type="button" class="secondary-action" data-work-action="export-meeting-packet">Export Records Bundle</button>
          <button type="button" class="secondary-action" data-work-action="open-exports-folder">Open Exports Folder</button>
        </div>
      </div>
      <div class="workflow-form">
        <h3>Staff Reports</h3>
        <p class="form-help">Save structured staff analysis for an agenda item. Each save creates a new report record so prior versions remain in the local audit trail.</p>
        <label>Agenda item
          <select data-work-field="staffReportAgendaItemId" ${selectedMeetingAgendaItems.length === 0 ? "disabled" : ""}>
            ${selectedMeetingAgendaItems.length === 0 ? `<option>No agenda item available</option>` : selectedMeetingAgendaItems.map((item) => `<option value="${escapeHtml(item.id)}" ${item.id === selectedStaffReportAgendaItemId ? "selected" : ""}>${escapeHtml(item.title)}</option>`).join("")}
          </select>
        </label>
        <label>Recommendation <textarea data-work-field="staffReportRecommendation">${escapeHtml(state.workDraft.staffReportRecommendation)}</textarea></label>
        <label>Background <textarea data-work-field="staffReportBackground">${escapeHtml(state.workDraft.staffReportBackground)}</textarea></label>
        <label>Analysis <textarea data-work-field="staffReportAnalysis">${escapeHtml(state.workDraft.staffReportAnalysis)}</textarea></label>
        <label>Fiscal impact <textarea data-work-field="staffReportFiscalImpact">${escapeHtml(state.workDraft.staffReportFiscalImpact)}</textarea></label>
        <label>Alternatives considered <textarea data-work-field="staffReportAlternatives">${escapeHtml(state.workDraft.staffReportAlternatives)}</textarea></label>
        <label>Prior actions <textarea data-work-field="staffReportPriorActions">${escapeHtml(state.workDraft.staffReportPriorActions)}</textarea></label>
        <label>Staff report prepared by <input type="text" data-work-field="staffReportPreparedBy" value="${escapeHtml(state.workDraft.staffReportPreparedBy)}" /></label>
        <label>Revision note <input type="text" data-work-field="staffReportRevisionNote" value="${escapeHtml(state.workDraft.staffReportRevisionNote)}" /></label>
        <div class="workflow-actions">
          ${selectedMeetingAgendaItems.length === 0 ? `<button type="button" class="secondary-action" disabled>Save Staff Report</button>` : `<button type="button" class="secondary-action" data-work-action="record-staff-report">Save Staff Report</button>`}
        </div>
      </div>
      <div class="workflow-form">
        <h3>Packet Attachments</h3>
        <p class="form-help">Attach source files for the agenda packet. The desktop app copies each file into the city profile and records a SHA-256 hash.</p>
        <label>Attachment title <input type="text" data-work-field="meetingAttachmentTitle" value="${escapeHtml(state.workDraft.meetingAttachmentTitle)}" /></label>
        ${renderFilePathField("Attachment source file path", "meetingAttachmentSourcePath", state.workDraft.meetingAttachmentSourcePath, "C:/City/Clerk/fiscal-note.pdf")}
        <label>Attachment citation <input type="text" data-work-field="meetingAttachmentCitation" value="${escapeHtml(state.workDraft.meetingAttachmentCitation)}" /></label>
        <label>Packet section <input type="text" data-work-field="meetingAttachmentSection" value="${escapeHtml(state.workDraft.meetingAttachmentSection)}" placeholder="Item 6 fiscal note" /></label>
        <label>Attachment access
          <select data-work-field="meetingAttachmentAccess">
            ${["public packet", "closed-session addendum"].map((access) => `<option value="${access}" ${state.workDraft.meetingAttachmentAccess === access ? "selected" : ""}>${access}</option>`).join("")}
          </select>
        </label>
        <label>Packet title <input type="text" data-work-field="packetTitle" value="${escapeHtml(state.workDraft.packetTitle)}" placeholder="Council agenda packet" /></label>
        <label>Packet prepared by <input type="text" data-work-field="packetPreparedBy" value="${escapeHtml(state.workDraft.packetPreparedBy)}" placeholder="Deputy Clerk" /></label>
        <label>Packet review note <textarea data-work-field="packetReviewNote">${escapeHtml(state.workDraft.packetReviewNote)}</textarea></label>
        <div class="workflow-actions">
          <button type="button" class="secondary-action" data-work-action="add-meeting-attachment">Attach Packet File</button>
          ${!selectedMeeting || selectedMeetingAgendaItems.length === 0 ? `<button type="button" class="secondary-action" disabled>Finalize Packet</button>` : `<button type="button" class="secondary-action" data-work-action="finalize-meeting-packet">Finalize Packet</button>`}
        </div>
      </div>
      <div class="workflow-form">
        <h3>Closed Sessions</h3>
        <label>Closed-session statutory basis <input type="text" data-work-field="closedSessionBasis" value="${escapeHtml(state.workDraft.closedSessionBasis)}" placeholder="Open meetings statute or ordinance section" /></label>
        <label>Closed-session topics <textarea data-work-field="closedSessionTopics">${escapeHtml(state.workDraft.closedSessionTopics)}</textarea></label>
        <label>Closed-session attendees <textarea data-work-field="closedSessionAttendees">${escapeHtml(state.workDraft.closedSessionAttendees)}</textarea></label>
        <label>Entered closed session <input type="text" data-work-field="closedSessionEnteredAt" value="${escapeHtml(state.workDraft.closedSessionEnteredAt)}" placeholder="6:42 PM" /></label>
        <label>Exited closed session <input type="text" data-work-field="closedSessionExitedAt" value="${escapeHtml(state.workDraft.closedSessionExitedAt)}" placeholder="7:05 PM" /></label>
        <label>Reconvene statement <textarea data-work-field="closedSessionReconvene">${escapeHtml(state.workDraft.closedSessionReconvene)}</textarea></label>
        <label>Staff-only notes reference <input type="text" data-work-field="closedSessionNotesReference" value="${escapeHtml(state.workDraft.closedSessionNotesReference)}" placeholder="Closed-session memo file, legal note, or clerk note id" /></label>
        <div class="workflow-actions">
          <button type="button" class="secondary-action" data-work-action="record-closed-session">Record Closed Session</button>
        </div>
      </div>
      <div class="workflow-form">
        <h3>Capture Outcomes</h3>
        <label>Minutes draft <textarea data-work-field="minutes">${escapeHtml(state.workDraft.minutes)}</textarea></label>
        <label>Motion text <textarea data-work-field="motionText">${escapeHtml(state.workDraft.motionText)}</textarea></label>
        <label>Moved by <input type="text" data-work-field="motionMover" value="${escapeHtml(state.workDraft.motionMover)}" /></label>
        <label>Seconded by <input type="text" data-work-field="motionSeconder" value="${escapeHtml(state.workDraft.motionSeconder)}" /></label>
        <label>Motion disposition
          <select data-work-field="motionDisposition">
            ${["pending vote", "passed", "failed", "withdrawn", "tabled"].map((disposition) => `<option value="${disposition}" ${state.workDraft.motionDisposition === disposition ? "selected" : ""}>${disposition}</option>`).join("")}
          </select>
        </label>
        <label>Linked vote reference <input type="text" data-work-field="motionVoteReference" value="${escapeHtml(state.workDraft.motionVoteReference)}" placeholder="Optional vote or roll-call note" /></label>
        <label>Roll-call motion
          <select data-work-field="memberVoteMotionId" ${selectedMeetingMotions.length === 0 ? "disabled" : ""}>
            ${selectedMeetingMotions.length === 0 ? `<option>No motion recorded</option>` : selectedMeetingMotions.map((motion) => `<option value="${escapeHtml(motion.id)}" ${motion.id === selectedMemberVoteMotionId ? "selected" : ""}>${escapeHtml(motion.text)} (${escapeHtml(motion.disposition)})</option>`).join("")}
          </select>
        </label>
        <label>Roll-call member
          <select data-work-field="memberVoteMemberId" ${rosterMembers.length === 0 ? "disabled" : ""}>
            ${rosterMembers.length === 0 ? `<option>No roster member available</option>` : rosterMembers.map((member) => `<option value="${escapeHtml(member.id)}" ${member.id === selectedMemberVoteMemberId ? "selected" : ""}>${escapeHtml(member.name)} - ${escapeHtml(member.role)}</option>`).join("")}
          </select>
        </label>
        <label>Roll-call vote
          <select data-work-field="memberVoteValue">
            ${["aye", "nay", "abstain", "absent", "recused"].map((voteValue) => `<option value="${voteValue}" ${state.workDraft.memberVoteValue === voteValue ? "selected" : ""}>${voteValue}</option>`).join("")}
          </select>
        </label>
        <label>Attendance member
          <select data-work-field="attendanceMemberId" ${rosterMembers.length === 0 ? "disabled" : ""}>
            ${rosterMembers.length === 0 ? `<option>No roster member available</option>` : rosterMembers.map((member) => `<option value="${escapeHtml(member.id)}" ${member.id === selectedAttendanceMemberId ? "selected" : ""}>${escapeHtml(member.name)} - ${escapeHtml(member.role)}</option>`).join("")}
          </select>
        </label>
        <label>Attendance status
          <select data-work-field="attendanceStatus">
            ${["present", "remote", "late", "absent", "recused"].map((status) => `<option value="${status}" ${state.workDraft.attendanceStatus === status ? "selected" : ""}>${status}</option>`).join("")}
          </select>
        </label>
        <label>Attendance recorded by <input type="text" data-work-field="attendanceRecordedBy" value="${escapeHtml(state.workDraft.attendanceRecordedBy)}" placeholder="City Clerk or deputy clerk" /></label>
        <label>Attendance note <input type="text" data-work-field="attendanceNote" value="${escapeHtml(state.workDraft.attendanceNote)}" placeholder="Optional roll-call or remote participation note" /></label>
        <label>Quorum required count <input type="number" min="1" data-work-field="quorumRequiredCount" value="${escapeHtml(state.workDraft.quorumRequiredCount)}" placeholder="Defaults to majority of active roster" /></label>
        <label>Quorum review note <textarea data-work-field="quorumReviewNote">${escapeHtml(state.workDraft.quorumReviewNote)}</textarea></label>
        <label>Vote or outcome <input type="text" data-work-field="vote" value="${escapeHtml(state.workDraft.vote)}" /></label>
        <label>Action item <input type="text" data-work-field="actionItem" value="${escapeHtml(state.workDraft.actionItem)}" /></label>
        <label>Action owner <input type="text" data-work-field="actionItemOwner" value="${escapeHtml(state.workDraft.actionItemOwner)}" /></label>
        <label>Action due date <input type="date" data-work-field="actionItemDueDate" value="${escapeHtml(state.workDraft.actionItemDueDate)}" /></label>
        <label>Action status
          <select data-work-field="actionItemStatus">
            ${["open", "in progress", "completed", "blocked"].map((status) => `<option value="${status}" ${state.workDraft.actionItemStatus === status ? "selected" : ""}>${status}</option>`).join("")}
          </select>
        </label>
        <label>Action source <input type="text" data-work-field="actionItemSourceReference" value="${escapeHtml(state.workDraft.actionItemSourceReference)}" placeholder="Motion, vote, agenda item, or clerk note" /></label>
        <label>Resident comment <textarea data-work-field="residentComment">${escapeHtml(state.workDraft.residentComment)}</textarea></label>
        <label>Minutes signed by <input type="text" data-work-field="minutesSignedBy" value="${escapeHtml(state.workDraft.minutesSignedBy)}" placeholder="City Clerk or authorized signer" /></label>
        <label>Signature attestation <textarea data-work-field="minutesSignatureAttestation">${escapeHtml(state.workDraft.minutesSignatureAttestation)}</textarea></label>
        <label>Adopted item type
          <select data-work-field="adoptedLegislationType">
            ${["ordinance", "resolution"].map((kind) => `<option value="${kind}" ${state.workDraft.adoptedLegislationType === kind ? "selected" : ""}>${kind}</option>`).join("")}
          </select>
        </label>
        <label>Adopted title <input type="text" data-work-field="adoptedLegislationTitle" value="${escapeHtml(state.workDraft.adoptedLegislationTitle)}" /></label>
        <label>Adopted text <textarea data-work-field="adoptedLegislationText">${escapeHtml(state.workDraft.adoptedLegislationText)}</textarea></label>
        <label>Effective date <input type="date" data-work-field="adoptedLegislationEffectiveDate" value="${escapeHtml(state.workDraft.adoptedLegislationEffectiveDate)}" /></label>
        <label>Codification section hint <input type="text" data-work-field="adoptedLegislationCodificationHint" value="${escapeHtml(state.workDraft.adoptedLegislationCodificationHint)}" placeholder="Title 2, Chapter 4, or uncodified" /></label>
        <div class="workflow-actions">
          <button type="button" class="secondary-action" data-work-action="suggest-minutes-draft">Generate Local AI Minutes</button>
          <button type="button" class="secondary-action" data-work-action="record-minutes">Save Minutes Draft</button>
          <button type="button" class="secondary-action" data-work-action="record-motion">Record Motion</button>
          ${selectedMeetingMotions.length === 0 || rosterMembers.length === 0 ? `<button type="button" class="secondary-action" disabled>Record Roll Call Vote</button>` : `<button type="button" class="secondary-action" data-work-action="record-member-vote">Record Roll Call Vote</button>`}
          ${rosterMembers.length === 0 ? `<button type="button" class="secondary-action" disabled>Record Attendance</button>` : `<button type="button" class="secondary-action" data-work-action="record-meeting-attendance">Record Attendance</button>`}
          ${!selectedMeeting || (selectedMeeting.attendance_records || []).length === 0 ? `<button type="button" class="secondary-action" disabled>Save Quorum Check</button>` : `<button type="button" class="secondary-action" data-work-action="record-quorum-check">Save Quorum Check</button>`}
          <button type="button" class="secondary-action" data-work-action="record-vote">Record Outcome</button>
          <button type="button" class="secondary-action" data-work-action="add-action-item">Add Action Item</button>
          <button type="button" class="secondary-action" data-work-action="record-resident-comment">Record Resident Comment</button>
          <button type="button" class="secondary-action" data-work-action="adopt-minutes">Adopt Minutes</button>
          <button type="button" class="secondary-action" data-work-action="sign-minutes">Sign Minutes</button>
          <button type="button" class="secondary-action" data-work-action="record-adopted-legislation">Record Adopted Ordinance/Resolution</button>
          <button type="button" class="secondary-action" data-work-action="archive-meeting">Archive Public Record</button>
        </div>
      </div>
      <div class="workflow-form">
        <h3>Minute Citations</h3>
        <p class="form-help">Tie each important minutes sentence to a packet item, clerk note, transcript segment, or vote record before adoption.</p>
        <label>Minutes sentence or excerpt <textarea data-work-field="minutesCitationSentence">${escapeHtml(state.workDraft.minutesCitationSentence)}</textarea></label>
        <label>Citation source type <input type="text" data-work-field="minutesCitationSourceType" value="${escapeHtml(state.workDraft.minutesCitationSourceType)}" placeholder="packet item, clerk note, transcript segment" /></label>
        <label>Citation source reference <input type="text" data-work-field="minutesCitationSourceRef" value="${escapeHtml(state.workDraft.minutesCitationSourceRef)}" placeholder="Item 4 fiscal note, clerk note 2, transcript 00:14:03" /></label>
        <label>Citation note <input type="text" data-work-field="minutesCitationNote" value="${escapeHtml(state.workDraft.minutesCitationNote)}" /></label>
        <label>Citation access
          <select data-work-field="minutesCitationAccess">
            ${["public record", "staff-only"].map((access) => `<option value="${access}" ${state.workDraft.minutesCitationAccess === access ? "selected" : ""}>${access}</option>`).join("")}
          </select>
        </label>
        <div class="workflow-actions">
          <button type="button" class="secondary-action" data-work-action="add-minute-citation">Add Minute Citation</button>
        </div>
      </div>
      <div class="workflow-form">
        <h3>Public Comment Review</h3>
        <p class="form-help">${selectedPublicComment ? `${escapeHtml(selectedPublicComment.commenter_name)} - ${escapeHtml(selectedPublicComment.status)}` : "No submitted public comment is selected for review."}</p>
        <label>Redacted public text <textarea data-work-field="publicCommentRedactedBody">${escapeHtml(state.workDraft.publicCommentRedactedBody)}</textarea></label>
        <label>Statutory redaction basis <input type="text" data-work-field="publicCommentRedactionBasis" value="${escapeHtml(state.workDraft.publicCommentRedactionBasis)}" /></label>
        <div class="workflow-actions">
          ${selectedPublicComment ? `<button type="button" class="secondary-action" data-work-action="review-public-comment">Mark Reviewed</button>` : `<button type="button" class="secondary-action" disabled>Mark Reviewed</button>`}
          ${selectedPublicComment ? `<button type="button" class="secondary-action" data-work-action="redact-public-comment">Redact Comment</button>` : `<button type="button" class="secondary-action" disabled>Redact Comment</button>`}
        </div>
      </div>
    </section>
    ${renderWorkActionResult()}
    <section class="workflow-list">
      ${work.meetings.length === 0 ? workflowEmpty("No local meetings have been created yet.") : work.meetings.map((meeting) => `
        <article class="workflow-record">
          <span class="status-warn">${escapeHtml(meeting.status)}</span>
          <h3>${escapeHtml(meeting.title)}</h3>
          <p><strong>Body:</strong> ${escapeHtml(meeting.body_name || "City Council")}</p>
          <p>${escapeHtml(meeting.summary || "No summary yet.")}</p>
          ${(meeting.agenda_items || []).length > 0 ? `<p><strong>Agenda:</strong> ${(meeting.agenda_items || []).map((item) => `${escapeHtml(item.title)}${item.source_reference ? ` (${escapeHtml(item.source_reference)})` : ""}`).join("; ")}</p>` : ""}
          ${(meeting.staff_reports || []).length > 0 ? `<p><strong>Staff reports:</strong> ${(meeting.staff_reports || []).map((report) => `${escapeHtml(report.agenda_item_title)} - ${escapeHtml(report.recommendation)} (${escapeHtml(report.prepared_by)})`).join("; ")}</p>` : ""}
          ${meeting.minutes_adopted_at_unix_seconds ? "<p><strong>Minutes:</strong> adopted</p>" : ""}
          ${meeting.minutes_signed_at_unix_seconds ? `<p><strong>Minutes signature:</strong> signed by ${escapeHtml(meeting.minutes_signed_by || "authorized signer")}</p>` : ""}
          ${(meeting.minute_citations || []).length > 0 ? `<p><strong>Minute citations:</strong> ${(meeting.minute_citations || []).map((citation) => `${escapeHtml(citation.source_type)} ${escapeHtml(citation.source_reference)} (${escapeHtml(citation.access_level)})`).join("; ")}</p>` : ""}
          ${(meeting.notice_checklists || []).length > 0 ? `<p><strong>Notice checklist:</strong> ${(meeting.notice_checklists || []).map((entry) => `${escapeHtml(entry.meeting_type)}; ${escapeHtml(entry.statutory_basis)}; due ${escapeHtml(entry.posting_deadline)} ${escapeHtml(entry.time_zone)}`).join("; ")}</p>` : ""}
          ${(meeting.notice_postings || []).length > 0 ? `<p><strong>Notice evidence:</strong> ${(meeting.notice_postings || []).map((entry) => `${escapeHtml(entry.location)} via ${escapeHtml(entry.method)}`).join("; ")}</p>` : ""}
          ${(meeting.attachments || []).length > 0 ? `<p><strong>Packet attachments:</strong> ${(meeting.attachments || []).map((attachment) => `${escapeHtml(attachment.title)} (${escapeHtml(attachment.packet_section)}; ${escapeHtml(attachment.access_level)}; sha256 ${escapeHtml(String(attachment.sha256 || "")).slice(0, 12)})`).join("; ")}</p>` : ""}
          ${(meeting.packet_assemblies || []).length > 0 ? `<p><strong>Packet finalization:</strong> ${(meeting.packet_assemblies || []).map((packet) => `${escapeHtml(packet.packet_title)} (${escapeHtml(packet.status)}; reviewed by ${escapeHtml(packet.prepared_by)}; ${packet.agenda_item_count} agenda items; ${packet.public_attachment_count} public attachments; ${packet.closed_session_attachment_count} closed-session addenda)`).join("; ")}</p>` : ""}
          ${(meeting.export_bundles || []).length > 0 ? `<p><strong>Records-ready bundles:</strong> ${(meeting.export_bundles || []).map((bundle) => `${bundle.public_record ? "public archive" : "staff packet"} sha256 ${escapeHtml(String(bundle.export_hash || "").slice(0, 12))}; manifest ${escapeHtml(String(bundle.manifest_hash || "").slice(0, 12))}; ${bundle.agenda_item_count || 0} agenda items; ${bundle.public_attachment_count || 0} public attachments; ${bundle.closed_session_attachment_count || 0} closed-session addenda`).join("; ")}</p>` : ""}
          ${(meeting.closed_sessions || []).length > 0 ? `<p><strong>Closed sessions:</strong> ${(meeting.closed_sessions || []).map((session) => `${escapeHtml(session.statutory_basis)} (${escapeHtml((session.topics || []).join("; "))}; ${escapeHtml(session.entered_at)}-${escapeHtml(session.exited_at)})`).join("; ")}</p>` : ""}
          ${(meeting.attendance_records || []).length > 0 ? `<p><strong>Attendance:</strong> ${(meeting.attendance_records || []).map((record) => `${escapeHtml(record.member_name)} ${escapeHtml(record.status)}${record.note ? ` (${escapeHtml(record.note)})` : ""}`).join("; ")}</p>` : ""}
          ${(meeting.quorum_checks || []).length > 0 ? `<p><strong>Quorum checks:</strong> ${(meeting.quorum_checks || []).map((record) => `${escapeHtml(record.status)} - ${Number(record.present_count || 0) + Number(record.remote_count || 0)} of ${escapeHtml(record.required_count || 0)} required (${escapeHtml(record.quorum_rule || "majority of seated members")})`).join("; ")}</p>` : ""}
          ${(meeting.motions || []).length > 0 ? `<p><strong>Motions:</strong> ${(meeting.motions || []).map((motion) => `${escapeHtml(motion.text)} (${escapeHtml(motion.disposition)}; moved by ${escapeHtml(motion.mover)}${motion.seconder ? `; seconded by ${escapeHtml(motion.seconder)}` : ""})`).join("; ")}</p>` : ""}
          ${(meeting.member_votes || []).length > 0 ? `<p><strong>Roll-call votes:</strong> ${(meeting.member_votes || []).map((vote) => `${escapeHtml(vote.member_name)} ${escapeHtml(vote.vote)} on ${escapeHtml(vote.motion_text)}`).join("; ")}</p>` : ""}
          ${(meeting.adopted_legislation || []).length > 0 ? `<p><strong>Adopted legislation:</strong> ${(meeting.adopted_legislation || []).map((item) => `${escapeHtml(item.legislation_type)} ${escapeHtml(item.title)} (${escapeHtml(item.handoff_status)})`).join("; ")}</p>` : ""}
          ${(meeting.action_items || []).length > 0 ? `<p><strong>Action items:</strong> ${(meeting.action_items || []).join("; ")}</p>` : ""}
          ${(meeting.action_records || []).length > 0 ? `<p><strong>Action details:</strong> ${(meeting.action_records || []).map((action) => `${escapeHtml(action.description)} (${escapeHtml(action.status)}${action.owner ? `; owner ${escapeHtml(action.owner)}` : ""}${action.due_date ? `; due ${escapeHtml(action.due_date)}` : ""}${action.source_reference ? `; source ${escapeHtml(action.source_reference)}` : ""})`).join("; ")}</p>` : ""}
          ${(meeting.resident_comments || []).length > 0 ? `<p><strong>Resident comments:</strong> ${(meeting.resident_comments || []).length} logged</p>` : ""}
          ${(meeting.public_comments || []).length > 0 ? `<p><strong>Public comments:</strong> ${(meeting.public_comments || []).length} received for clerk review</p>` : ""}
          ${(meeting.public_comments || []).map((comment) => `
            <div class="comment-review-item">
              <strong>${escapeHtml(comment.commenter_name)}</strong>
              <span>${escapeHtml(comment.status)}</span>
              <p>${comment.status === "redacted for public record" && comment.redacted_body ? escapeHtml(comment.redacted_body) : escapeHtml(comment.body)}</p>
              <div class="record-actions">
                ${selectedPublicComment?.id === comment.id ? `<span class="status-ok">Selected for review</span>` : `<button type="button" class="secondary-action" data-select-work-record="publicComment" data-record-id="${escapeHtml(comment.id)}" data-parent-meeting-id="${escapeHtml(meeting.id)}">Review This</button>`}
              </div>
            </div>
          `).join("")}
          <div class="record-actions">
            ${selectedMeeting?.id === meeting.id ? `<span class="status-ok">Selected for actions</span>` : `<button type="button" class="secondary-action" data-select-work-record="meeting" data-record-id="${escapeHtml(meeting.id)}">Work On This</button>`}
          </div>
          <small>${escapeHtml(meeting.meeting_date)} - ${escapeHtml(meeting.body_name || "City Council")} - ${escapeHtml(meeting.notice_status)} - ${(meeting.agenda_items || []).length} agenda items - ${(meeting.staff_reports || []).length} staff reports - ${(meeting.attachments || []).length} attachments - ${(meeting.packet_assemblies || []).length} packet finalizations - ${(meeting.export_bundles || []).length} records-ready bundles - ${(meeting.attendance_records || []).length} attendance records - ${(meeting.quorum_checks || []).length} quorum checks - ${(meeting.minute_citations || []).length} minute citations - ${(meeting.motions || []).length} motions - ${(meeting.member_votes || []).length} roll-call votes - ${(meeting.votes || []).length} outcomes - ${((meeting.action_records || []).length || (meeting.action_items || []).length)} action items - ${(meeting.exports || []).length} exports</small>
        </article>
      `).join("")}
    </section>
    <section class="workflow-list" aria-label="Agenda intake queue">
      ${agendaIntakes(work).length === 0 ? workflowEmpty("No agenda intake items are waiting for clerk review.") : agendaIntakes(work).map((intake) => `
        <article class="workflow-record">
          <span class="status-warn">${escapeHtml(intake.status)}</span>
          <h3>${escapeHtml(intake.title)}</h3>
          <p>${escapeHtml(intake.summary)}</p>
          <p><strong>Source:</strong> ${escapeHtml(intake.source_reference)}</p>
          <small>${escapeHtml(intake.department)} - submitted by ${escapeHtml(intake.submitter)}${intake.requested_meeting_date ? ` - requested ${escapeHtml(intake.requested_meeting_date)}` : ""}</small>
          ${intake.review_note ? `<p><strong>Review note:</strong> ${escapeHtml(intake.review_note)}</p>` : ""}
          <div class="record-actions">
            ${selectedAgendaIntake?.id === intake.id ? `<span class="status-ok">Selected for review</span>` : `<button type="button" class="secondary-action" data-select-work-record="agendaIntake" data-record-id="${escapeHtml(intake.id)}">Review This</button>`}
          </div>
        </article>
      `).join("")}
    </section>
    <section class="workflow-list" aria-label="Townlight Code handoffs">
      ${pendingCodeHandoffs.length === 0 ? workflowEmpty("No Townlight Code handoffs are waiting for the clerk.") : pendingCodeHandoffs.map((handoff) => `
        <article class="workflow-record handoff">
          <span class="status-warn">${escapeHtml(handoff.status)}</span>
          <h3>${escapeHtml(handoff.title)}</h3>
          <p>${escapeHtml(handoff.summary)}</p>
          <small>Townlight Code handoff for agenda review</small>
        </article>
      `).join("")}
    </section>
  `;
}

function recordsRequestIsReleased(request) {
  return request.status === "fulfilled" ||
    request.status === "closed" ||
    Boolean(request.fulfilled_at_unix_seconds);
}

function publicRecordsLookupVerifiedFor(request) {
  const lookup = state.workDraft.publicRequestLookup.trim().toLowerCase();
  const requesterContact = state.workDraft.publicRequestContact.trim().toLowerCase();
  return Boolean(
    lookup &&
      requesterContact &&
      state.publicRecordsLookup.found &&
      state.publicRecordsLookup.trackingNumber === lookup &&
      state.publicRecordsLookup.requesterContact === requesterContact &&
      String(request.public_tracking_number || "").toLowerCase() === lookup
  );
}

function publicRecordsRequestView(request) {
  const lookupVerified = publicRecordsLookupVerifiedFor(request);
  if (!recordsRequestIsReleased(request) && !lookupVerified) return null;
  return {
    ...request,
    requester_contact: "",
    assigned_to: "",
    clarification_notes: [],
    search_notes: [],
    search_sessions: [],
    exemption_reviews: [],
    exemption_decisions: [],
    fee_estimate: "",
    fee_line_items: [],
    fee_waiver_reason: "",
    response_draft: "",
    approval_notes: [],
    release_packages: [],
    timeline: [],
    public_status_events: request.public_status_events || [],
    messages: lookupVerified ? (request.messages || []) : [],
    documents: []
  };
}

function publicRecordsRequests(work) {
  return work.records_requests.map(publicRecordsRequestView).filter(Boolean);
}

function publicCodeSourceView(source) {
  if (source.public_status !== "published") return null;
  const publicSource = {
    ...source,
    staff_guidance: "",
    codifier_sync_errors: [],
    amendment_notes: [],
    source_original_path: "",
    source_stored_path: "",
    imported_by: "",
    version_history: (source.version_history || []).map((entry) => ({ ...entry, note: "" }))
  };
  if (!publicSource.guidance_approved_at_unix_seconds) publicSource.plain_language_summary = "";
  return publicSource;
}

function publicCodeSources(work) {
  return work.code_sources.map(publicCodeSourceView).filter(Boolean);
}

function codeVersionHistorySummary(source) {
  const entries = source.version_history || [];
  if (!entries.length) return "";
  return entries
    .slice(0, 3)
    .map((entry) => [entry.label, entry.source, entry.status].filter(Boolean).join(" / "))
    .join("; ");
}

function codeSourceEvidenceSummary(source, { staff = true } = {}) {
  if (!source) return "";
  const parts = [];
  if (source.source_file_name) parts.push(`file ${source.source_file_name}`);
  if (source.source_sha256) parts.push(`sha256 ${String(source.source_sha256).slice(0, 12)}`);
  if (source.source_size_bytes) parts.push(`${source.source_size_bytes} bytes`);
  if (staff && source.source_stored_path) parts.push("stored in local profile");
  if (staff && source.imported_by) parts.push(`imported by ${source.imported_by}`);
  return parts.join("; ");
}

function codeVersionHistorySearchText(source, { publicOnly = false } = {}) {
  return (source.version_history || [])
    .map((entry) => {
      const fields = publicOnly
        ? [entry.label, entry.source, entry.status, entry.authoritative_url]
        : [entry.label, entry.source, entry.status, entry.note, entry.authoritative_url];
      return fields.join(" ");
    })
    .join(" ");
}

function codeQuestionSearchFields(source, { publicOnly = false } = {}) {
  const fields = [
    source.title,
    source.citation,
    source.body,
    source.plain_language_summary
  ];
  if (!publicOnly) fields.push(source.staff_guidance);
  return fields;
}

function codeSourceSearchFields(source, { publicOnly = false } = {}) {
  const publicFields = [
    source.title,
    source.citation,
    source.body,
    source.status,
    source.source_file_name,
    source.source_sha256,
    source.source_size_bytes ? String(source.source_size_bytes) : "",
    source.public_status,
    source.codifier_name,
    source.authoritative_url,
    source.version_label,
    source.codifier_sync_status,
    source.plain_language_summary,
    codeVersionHistorySearchText(source, { publicOnly })
  ];
  if (publicOnly) return publicFields;
  return [
    ...publicFields,
    source.source_original_path,
    source.source_stored_path,
    source.imported_by,
    source.staff_guidance,
    ...(source.amendment_notes || []),
    ...(source.codifier_sync_errors || [])
  ];
}

function localCodeQuestionResults(query, { publicOnly = false } = {}) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return [];
  const terms = normalized.split(/[^a-z0-9]+/).filter((term) => term.length > 2);
  const matchesQuestion = (value) => {
    const haystack = String(value || "").toLowerCase();
    return haystack.includes(normalized) || terms.some((term) => haystack.includes(term));
  };
  const sources = publicOnly ? publicCodeSources(cityWork()) : cityWork().code_sources;
  return sources
    .filter((source) => !source.stale_since_unix_seconds)
    .filter((source) => codeQuestionSearchFields(source, { publicOnly }).some(matchesQuestion))
    .slice(0, 3)
    .map((source) => {
      const publicSummaryAllowed = source.guidance_approved_at_unix_seconds && source.plain_language_summary;
      const staffDetailAllowed = !publicOnly && source.staff_guidance;
      const answer = publicSummaryAllowed
        ? source.plain_language_summary
        : staffDetailAllowed
          ? source.staff_guidance
          : String(source.body || "").split(".")[0] || source.body;
      return {
        module_id: "civiccode",
        title: `Code answer: ${source.title}`,
        snippet: `${publicOnly ? "Non-authoritative public summary" : "Staff code guidance"}: ${answer}. This is not legal advice; confirm interpretation with city staff or counsel.`,
        citation: source.citation,
        status: source.public_status || source.status
      };
    });
}

function renderNoticeWorkflow() {
  if (isPublicSurface()) return renderPublicMeetingsWorkflow();
  const work = cityWork();
  const selectedMeeting = currentMeeting(work);
  const noticeMeetings = (work.meetings || []).filter((meeting) => (
    (meeting.notice_checklists || []).length > 0 ||
    (meeting.notice_postings || []).length > 0 ||
    (meeting.export_bundles || []).length > 0 ||
    meeting.notice_status
  ));
  return `
    <section class="page-heading">
      <p class="eyebrow">${state.activeSurface}</p>
      <h2>Public Notices</h2>
      <p>Manage statutory deadline workpapers, clerk approval, posting proof, and records-ready notice archive packets.</p>
    </section>
    ${renderGuidedWorkReview()}
    <section class="workflow-editor">
      <div class="workflow-form">
        <h3>Notice Workpaper</h3>
        <p class="form-help">${selectedMeeting ? `Working on ${escapeHtml(selectedMeeting.title)}.` : "Create a meeting in Meetings & Notices before preparing notice proof."}</p>
        <label>Notice meeting type <input type="text" data-work-field="noticeMeetingType" value="${escapeHtml(state.workDraft.noticeMeetingType)}" placeholder="Regular council meeting" /></label>
        <label>Statutory notice basis <input type="text" data-work-field="noticeStatutoryBasis" value="${escapeHtml(state.workDraft.noticeStatutoryBasis)}" placeholder="Municipal open meetings notice" /></label>
        <label>Notice lead days <input type="number" min="1" max="365" step="1" data-work-field="noticeLeadDays" value="${escapeHtml(state.workDraft.noticeLeadDays)}" /></label>
        <label>Lead day type
          <select aria-label="Lead day type" data-work-field="noticeDayType">
            <option value="calendar days" ${state.workDraft.noticeDayType === "calendar days" ? "selected" : ""}>Calendar days</option>
            <option value="business days" ${state.workDraft.noticeDayType === "business days" ? "selected" : ""}>Business days</option>
          </select>
        </label>
        <label>Notice deadline <input type="date" data-work-field="noticeDeadline" value="${escapeHtml(state.workDraft.noticeDeadline)}" /></label>
        <label>Notice time zone <input type="text" data-work-field="noticeTimeZone" value="${escapeHtml(state.workDraft.noticeTimeZone)}" placeholder="America/Denver" /></label>
        <label class="checkbox-row"><input type="checkbox" data-work-field="noticeHumanApproval" ${state.workDraft.noticeHumanApproval ? "checked" : ""} /> Clerk has reviewed and approved the notice checklist</label>
        <div class="workflow-actions">
          <button type="button" class="secondary-action" data-work-action="civicnotice-calculate-deadline">Calculate Deadline</button>
          <button type="button" class="secondary-action" data-work-action="civicnotice-complete-checklist">Save Checklist</button>
        </div>
      </div>
      <div class="workflow-form">
        <h3>Posting Proof</h3>
        <label>Actual posting date <input type="date" data-work-field="noticePostingDate" value="${escapedDraft("noticePostingDate")}" /></label>
        <label>Posting location <input type="text" data-work-field="noticeLocation" value="${escapedDraft("noticeLocation")}" placeholder="City Hall bulletin board and city website" /></label>
        <label>Posting method <input type="text" data-work-field="noticeMethod" value="${escapedDraft("noticeMethod")}" placeholder="Posted PDF and clerk attestation" /></label>
        <label>Posting confirmation <textarea data-work-field="noticeConfirmation">${escapedDraft("noticeConfirmation")}</textarea></label>
        <div class="workflow-actions">
          <button type="button" class="secondary-action" data-work-action="civicnotice-post-notice">Record Posting Proof</button>
          <button type="button" class="secondary-action" data-work-action="civicnotice-export-archive-packet">Build Archive Packet</button>
          <button type="button" class="secondary-action" data-work-action="open-exports-folder">Open Exports Folder</button>
        </div>
      </div>
    </section>
    ${renderWorkActionResult()}
    <section class="workflow-list" aria-label="Notice workpapers">
      ${noticeMeetings.length === 0 ? workflowEmpty("No notice workpapers have been saved yet.") : noticeMeetings.map((meeting) => `
        <article class="workflow-record">
          <span class="${meeting.notice_status === "public notice ready" ? "status-ok" : "status-warn"}">${escapeHtml(meeting.notice_status || meeting.status)}</span>
          <h3>${escapeHtml(meeting.title)}</h3>
          <p>${escapeHtml(meeting.summary || "No meeting summary recorded.")}</p>
          <p><strong>Checklists:</strong> ${(meeting.notice_checklists || []).length} <strong>Posting proofs:</strong> ${(meeting.notice_postings || []).length} <strong>Archive packets:</strong> ${(meeting.export_bundles || []).length}</p>
          <div class="record-actions">
            ${state.workSelection.meetingId === meeting.id ? `<span class="status-ok">Selected for notice work</span>` : `<button type="button" class="secondary-action" data-select-work-record="meeting" data-record-id="${escapeHtml(meeting.id)}">Work On This</button>`}
          </div>
          <small>${escapeHtml(meeting.meeting_date || "No meeting date")} - Townlight Notice preserves proof; staff still verify legal sufficiency.</small>
        </article>
      `).join("")}
    </section>
  `;
}

const CIVICACCESS_DISCLAIMER_TEXT = "Persisted reviews are advisory clerk support, not a certified accessibility audit.";

const CIVICACCESS_STATUS_LABELS = {
  "passes-sample-checks": "No findings (advisory)",
  "needs-fixes": "Findings to address"
};

function jsonAttr(value) {
  return escapeHtml(JSON.stringify(value));
}

function civicaccessActionInFlight(action) {
  for (const tag of state.workActionInFlightTags) {
    if (tag === action || tag.startsWith(`${action}:`)) return true;
  }
  return false;
}

function civicaccessActionBusy(action, reviewId) {
  if (state.workActionInFlightTags.has(reviewId ? `${action}:${reviewId}` : action)) return true;
  // A guided-review confirmation pending for this exact row also counts as busy
  // (handleCityWorkAction returns before adding to workActionInFlightTags while
  // the confirm panel is showing, so that state alone wouldn't otherwise
  // disable it).
  if (action === "civicaccess-delete-review" && state.pendingWorkReviewAction === "civicaccess-delete-review") {
    return state.workSelection.accessDeleteReviewId === reviewId;
  }
  return false;
}

function renderAccessibilityWorkflow() {
  if (isPublicSurface()) return renderPublicMeetingsWorkflow();
  const reviews = (cityWork().access && cityWork().access.reviews) || [];
  const sortedReviews = reviews.slice().sort((a, b) => b.created_at_unix_seconds - a.created_at_unix_seconds);
  const civicaccessBusy = [
    "accessibility-review",
    "civicaccess-plain-language",
    "civicaccess-language-variant",
    "civicaccess-form-plan",
    "civicaccess-publishing-workflow",
    "civicaccess-ada-title-ii",
    "civicaccess-tagged-pdf",
    "civicaccess-records-export",
    "civicaccess-delete-review"
  ].some((action) => civicaccessActionInFlight(action));
  return `
    <section class="page-heading">
      <p class="eyebrow">${state.activeSurface}</p>
      <h2>Accessibility</h2>
      <p>Run WCAG sample reviews, draft plain-language rewrites, request multilingual variants, and prepare records-ready export checklists. All work is local.</p>
      <div class="workflow-actions">
        <button type="button" class="secondary-action" data-work-action="open-exports-folder" data-action-payload='{"folder":"access"}'>Open Access Exports Folder</button>
      </div>
    </section>
    ${renderGuidedWorkReview()}
    ${state.app.model && !aiEngineReady() ? `
    <aside class="section-band" role="status" aria-label="Local AI engine status">
      <strong>AI engine not ready — ${escapeHtml(state.app.model.status)}.</strong>
      Plain-Language Rewrite, Multilingual Variant, and the review's AI analysis run in
      deterministic sample mode until the local model is ready. The five WCAG checks and
      all checklist tools work normally.
      <button type="button" class="text-link" data-area="health">Open model setup</button>
    </aside>` : ""}
    <section class="workflow-editor"${civicaccessBusy ? ' aria-busy="true"' : ""}>
      <aside class="section-band" role="note">${escapeHtml(CIVICACCESS_DISCLAIMER_TEXT)} Final compliance review must come from a qualified human reviewer.</aside>
      <p class="form-help">Fields marked * are required. Most show a finding or blocker if left empty instead of an error; the others must have a value before the tool can run.</p>
      <div class="workflow-form">
        <h3>Accessibility Review (WCAG sample)</h3>
        <p class="form-help">Runs five deterministic WCAG checks and saves the review to the same local audit chain Meetings, Records, and Notice use. Empty title or body becomes a finding, not an error. ${aiEngineReady() ? `An advisory AI remediation analysis (${escapeHtml(state.app.model.runtime_model || "local model")}) is stored with the review; human review still decides.` : "AI engine not ready — reviews save with deterministic findings only."}</p>
        <label for="access-title">Document title *</label>
        <input type="text" id="access-title" aria-required="true" data-work-field="accessTitle" value="${escapeHtml(state.workDraft.accessTitle)}" placeholder="Water main repair notice" />
        <label for="access-body">Public text *</label>
        <textarea id="access-body" aria-required="true" data-work-field="accessBody" placeholder="Paste the resident-facing text here.">${escapeHtml(state.workDraft.accessBody)}</textarea>
        <label class="checkbox-row"><input type="checkbox" data-work-field="accessHasAltText" ${state.workDraft.accessHasAltText ? "checked" : ""} /> All images / visuals have alternative text (or are marked decorative)</label>
        <label for="access-language">Language tag</label>
        <input type="text" id="access-language" data-work-field="accessLanguage" value="${escapeHtml(state.workDraft.accessLanguage)}" placeholder="en" />
        <div class="workflow-actions">
          <button type="button" class="primary-action" data-work-action="accessibility-review" ${civicaccessActionBusy("accessibility-review") ? "disabled" : ""}>Run Review &amp; Save</button>
        </div>
      </div>
      <div class="workflow-form">
        <h3>Plain-Language Rewrite</h3>
        <p class="form-help">${aiEngineReady() ? `Drafts a plain-language rewrite on the local AI engine (${escapeHtml(state.app.model.runtime_model || "local model")}). Output is a draft; human review required before publication.` : `AI engine not ready — runs in deterministic sample mode (jargon swap, e.g. "remit payment" -> "pay"). Output requires human review before publication.`}</p>
        <label for="access-plain-text">Text to rewrite *</label>
        <textarea id="access-plain-text" aria-required="true" data-work-field="accessPlainText" placeholder="Residents must remit payment prior to the deadline.">${escapeHtml(state.workDraft.accessPlainText)}</textarea>
        <div class="workflow-actions">
          <button type="button" class="secondary-action" data-work-action="civicaccess-plain-language" ${civicaccessActionBusy("civicaccess-plain-language") ? "disabled" : ""}>Draft Plain-Language Rewrite</button>
        </div>
      </div>
      <div class="workflow-form">
        <h3>Multilingual Variant</h3>
        <p class="form-help">${aiEngineReady() ? `Drafts a translation of your text into any target language on the local AI engine (${escapeHtml(state.app.model.runtime_model || "local model")}). Every draft requires a qualified human translator's review before publication.` : "AI engine not ready — returns a canned sample for es / vi and an explicit placeholder for everything else. A qualified human translator must review before publication."}</p>
        <label for="access-variant-text">Source text *</label>
        <textarea id="access-variant-text" aria-required="true" data-work-field="accessVariantText" placeholder="Residents may request an accommodation.">${escapeHtml(state.workDraft.accessVariantText)}</textarea>
        <label for="access-variant-language">Target language *</label>
        <input type="text" id="access-variant-language" aria-required="true" data-work-field="accessVariantLanguage" value="${escapeHtml(state.workDraft.accessVariantLanguage)}" placeholder="es" />
        <div class="workflow-actions">
          <button type="button" class="secondary-action" data-work-action="civicaccess-language-variant" ${civicaccessActionBusy("civicaccess-language-variant") ? "disabled" : ""}>Draft Translation Variant</button>
        </div>
      </div>
      <div class="workflow-form">
        <h3>Accessible Form Plan</h3>
        <p class="form-help">Checks for required fields (name, contact, request) and returns a publication checklist.</p>
        <label for="access-form-name">Form name *</label>
        <input type="text" id="access-form-name" aria-required="true" data-work-field="accessFormName" value="${escapeHtml(state.workDraft.accessFormName)}" placeholder="Records Request" />
        <label for="access-form-fields">Fields (comma or newline separated) *</label>
        <textarea id="access-form-fields" aria-required="true" data-work-field="accessFormFields" placeholder="name, contact, request">${escapeHtml(state.workDraft.accessFormFields)}</textarea>
        <div class="workflow-actions">
          <button type="button" class="secondary-action" data-work-action="civicaccess-form-plan" ${civicaccessActionBusy("civicaccess-form-plan") ? "disabled" : ""}>Plan Accessible Form</button>
        </div>
      </div>
      <div class="workflow-form">
        <h3>Publishing Workflow Checklist</h3>
        <p class="form-help">Returns blockers when review, plain-language summary, or translation review are missing.</p>
        <label for="access-publishing-title">Publication title *</label>
        <input type="text" id="access-publishing-title" aria-required="true" data-work-field="accessPublishingTitle" value="${escapeHtml(state.workDraft.accessPublishingTitle)}" />
        <label class="checkbox-row"><input type="checkbox" data-work-field="accessPublishingHasReview" ${state.workDraft.accessPublishingHasReview ? "checked" : ""} /> Accessibility review complete</label>
        <label class="checkbox-row"><input type="checkbox" data-work-field="accessPublishingHasPlainLanguage" ${state.workDraft.accessPublishingHasPlainLanguage ? "checked" : ""} /> Plain-language summary attached</label>
        <label class="checkbox-row"><input type="checkbox" data-work-field="accessPublishingHasTranslationReview" ${state.workDraft.accessPublishingHasTranslationReview ? "checked" : ""} /> Translation review on file</label>
        <div class="workflow-actions">
          <button type="button" class="secondary-action" data-work-action="civicaccess-publishing-workflow" ${civicaccessActionBusy("civicaccess-publishing-workflow") ? "disabled" : ""}>Build Publishing Plan</button>
        </div>
      </div>
      <div class="workflow-form">
        <h3>ADA Title II Review-Support Plan</h3>
        <label for="access-ada-service-area">Service area *</label>
        <input type="text" id="access-ada-service-area" aria-required="true" data-work-field="accessAdaServiceArea" value="${escapeHtml(state.workDraft.accessAdaServiceArea)}" placeholder="Records intake" />
        <label class="checkbox-row"><input type="checkbox" data-work-field="accessAdaHasCoordinatorReview" ${state.workDraft.accessAdaHasCoordinatorReview ? "checked" : ""} /> ADA coordinator or qualified reviewer has reviewed</label>
        <div class="workflow-actions">
          <button type="button" class="secondary-action" data-work-action="civicaccess-ada-title-ii" ${civicaccessActionBusy("civicaccess-ada-title-ii") ? "disabled" : ""}>Build ADA Review Plan</button>
        </div>
      </div>
      <div class="workflow-form">
        <h3>Tagged-PDF Expectation Plan</h3>
        <p class="form-help">Heading sequence must start with 1 and never skip a level. Example: 1, 2, 3 (clean); 1, 3 (skipped H2).</p>
        <label for="access-tagged-pdf-headings">Heading levels (comma separated) *</label>
        <input type="text" id="access-tagged-pdf-headings" aria-required="true" data-work-field="accessTaggedPdfHeadings" value="${escapeHtml(state.workDraft.accessTaggedPdfHeadings)}" placeholder="1, 2, 3" />
        <div class="workflow-actions">
          <button type="button" class="secondary-action" data-work-action="civicaccess-tagged-pdf" ${civicaccessActionBusy("civicaccess-tagged-pdf") ? "disabled" : ""}>Plan Tagged-PDF Expectations</button>
        </div>
      </div>
    </section>
    ${renderWorkActionResult()}
    <section class="workflow-list" aria-label="Saved accessibility reviews">
      ${sortedReviews.length === 0 ? workflowEmpty(`No accessibility reviews saved yet. Start with "Run Review & Save" above. ${CIVICACCESS_DISCLAIMER_TEXT}`) : (state.accessReviewsShowAll ? sortedReviews : sortedReviews.slice(0, 20)).map((review) => `
        <article class="workflow-record">
          <span class="${review.status === "passes-sample-checks" ? "status-ok" : "status-warn"}">${escapeHtml(CIVICACCESS_STATUS_LABELS[review.status] || review.status)}</span>
          <h3>${escapeHtml(review.title || "(no title)")}</h3>
          <p>${(review.findings || []).length} ${(review.findings || []).length === 1 ? "finding" : "findings"} &middot; language ${escapeHtml((review.language || "en").toUpperCase())} &middot; alt text ${review.has_alt_text ? "present" : "missing"}</p>
          ${(review.findings || []).length === 0 ? "" : `<ul class="finding-list">${(review.findings || []).map((finding) => `<li><strong>${escapeHtml(finding.severity)}</strong> ${escapeHtml(finding.message)} <em>${escapeHtml(finding.fix)}</em> <small>${escapeHtml(finding.wcag_reference)}</small></li>`).join("")}</ul>`}
          ${review.ai_analysis ? `<div class="comment-review-item"><p><strong>Local AI analysis (${escapeHtml(review.ai_analysis_model || "local model")}) — advisory</strong></p><p>${escapeHtml(review.ai_analysis)}</p></div>` : ""}
          <div class="record-actions">
            <button type="button" class="secondary-action" data-work-action="civicaccess-records-export" data-action-payload='${jsonAttr({reviewId: review.review_id})}' aria-label="${escapeHtml(`Generate Records-Ready Export for ${review.title || "(no title)"} (${review.review_id})`)}" ${civicaccessActionBusy("civicaccess-records-export", review.review_id) ? "disabled" : ""}>Generate Records-Ready Export</button>
            <button type="button" class="destructive-action" data-work-action="civicaccess-delete-review" data-action-payload='${jsonAttr({reviewId: review.review_id})}' aria-label="${escapeHtml(`Delete review: ${review.title || "(no title)"} (${review.review_id})`)}" ${civicaccessActionBusy("civicaccess-delete-review", review.review_id) ? "disabled" : ""}>Delete Review</button>
          </div>
          <small>${escapeHtml(review.review_id)} &mdash; ${escapeHtml(CIVICACCESS_DISCLAIMER_TEXT)}</small>
        </article>
      `).join("")}
      ${sortedReviews.length > 20 ? `
        <button type="button" class="secondary-action" data-access-reviews-show-all="${state.accessReviewsShowAll ? "0" : "1"}">
          ${state.accessReviewsShowAll ? "Show fewer reviews" : `Show all ${sortedReviews.length} reviews`}
        </button>
      ` : ""}
    </section>
  `;
}

function renderDemoTownBanner(work) {
  const fixture = work?.demo_fixture;
  if (!fixture) return "";
  return `
    <section class="workflow-record" aria-label="Synthetic demonstration data warning">
      <span class="status-warn">Fictional demo town</span>
      <h3>${escapeHtml(fixture.municipality_name)}</h3>
      <p><strong>${escapeHtml(fixture.watermark)}</strong></p>
      <small>Fixture ${escapeHtml(fixture.fixture_id)} v${escapeHtml(fixture.fixture_version)} &middot; SHA-256 ${escapeHtml(fixture.fixture_sha256)}</small>
    </section>
  `;
}

function renderPublicRecordsWorkflow() {
  const work = cityWork();
  const requests = publicRecordsRequests(work);
  return `
    <section class="page-heading">
      <p class="eyebrow">Resident/Public</p>
      <h2>Public Records Requests</h2>
      <p>Submit a records request or check local public status without staff review drafts or internal citations.</p>
    </section>
    ${renderDemoTownBanner(work)}
    <section class="workflow-editor">
      <div class="workflow-form">
        <h3>Submit Public Records Request</h3>
        <p class="form-help">Describe the records clearly. Staff will review the request, set any statutory deadline, and work it in the Records staff queue.</p>
        <label>Your name <input type="text" data-work-field="publicRequester" value="${escapeHtml(state.workDraft.publicRequester)}" autocomplete="name" /></label>
        <label>Email or phone <input type="text" data-work-field="publicRequesterContact" value="${escapeHtml(state.workDraft.publicRequesterContact)}" autocomplete="email" /></label>
        <label>Records requested <textarea data-work-field="publicRecordsSummary">${escapeHtml(state.workDraft.publicRecordsSummary)}</textarea></label>
        <button type="button" class="primary-action" data-work-action="submit-public-records-request">Submit Records Request</button>
      </div>
      <div class="workflow-form">
        <h3>Check Status</h3>
        <p class="form-help">Use the request number returned after submission and the same email or phone you gave staff.</p>
        <label>Request number <input type="text" data-work-field="publicRequestLookup" value="${escapeHtml(state.workDraft.publicRequestLookup)}" placeholder="REQ-0001" /></label>
        <label>Submitted contact <input type="text" data-work-field="publicRequestContact" value="${escapeHtml(state.workDraft.publicRequestContact)}" autocomplete="email" /></label>
        <label>Message to records staff <textarea data-work-field="publicRequestMessage">${escapeHtml(state.workDraft.publicRequestMessage)}</textarea></label>
        <button type="button" class="secondary-action" data-work-action="lookup-public-records-request">Check Request Status</button>
        <button type="button" class="secondary-action" data-work-action="add-public-records-message">Send Request Message</button>
        <small>Released responses appear below after staff approval, export, and fulfillment. Pending public intake appears only after the request number and submitted contact match.</small>
      </div>
    </section>
    ${renderWorkActionResult()}
    <section class="workflow-list">
      ${requests.length === 0 ? workflowEmpty("No released records responses or matching request number are available yet.") : requests.map((request) => `
        <article class="workflow-record">
          <span class="${request.fulfilled_at_unix_seconds || request.status === "fulfilled" || request.status === "closed" ? "status-ok" : "status-warn"}">${escapeHtml(request.status)}</span>
          <h3>${escapeHtml(request.public_tracking_number || "Tracking pending")}</h3>
          <p><strong>Requester:</strong> ${escapeHtml(request.requester)}</p>
          <p>${escapeHtml(request.summary)}</p>
          ${request.deadline_basis ? `<p><strong>Deadline basis:</strong> ${escapeHtml(request.deadline_basis)}</p>` : ""}
          ${renderRecordsPublicStatusEvents(request)}
          ${renderRecordsMessages(request)}
          <small>${escapeHtml(request.submitted_via || "Staff intake")} - ${escapeHtml(request.deadline)} - Released exports: ${(request.exports || []).length}</small>
        </article>
      `).join("")}
    </section>
  `;
}

function renderRecordsNotificationOutbox(work) {
  const selectedNotification = currentNotification(work);
  const notifications = (work.notification_events || [])
    .filter((event) => event.module_id === "civicrecords-ai");
  return `
    <section class="workflow-list" aria-label="Records notification outbox">
      <div class="section-title">
        <h3>Notification Outbox</h3>
        <p>Local notification log for requester and staff messages generated by Records workflows.</p>
      </div>
      ${notifications.length === 0 ? workflowEmpty("No local records notifications have been created yet.") : notifications.map((event) => `
        <article class="workflow-record">
          <span class="${event.status === "sent / logged" ? "status-ok" : "status-warn"}">${escapeHtml(event.status)}</span>
          <h3>${escapeHtml(event.subject)}</h3>
          <p>${escapeHtml(event.body)}</p>
          <p><strong>Audience:</strong> ${escapeHtml(event.audience)} <strong>Channel:</strong> ${escapeHtml(event.channel)}</p>
          ${event.sent_at_unix_seconds ? `<p><strong>Sent/logged:</strong> ${new Date(event.sent_at_unix_seconds * 1000).toLocaleString()}</p>` : ""}
          <div class="record-actions">
            ${selectedNotification?.id === event.id ? `<span class="status-ok">Selected notification</span>` : `<button type="button" class="secondary-action" data-select-work-record="notification" data-record-id="${escapeHtml(event.id)}">Work On This</button>`}
            ${event.status === "sent / logged" ? "" : `<button type="button" class="secondary-action" data-select-work-record="notification" data-record-id="${escapeHtml(event.id)}" data-work-action="mark-notification-sent">Log Notification Sent</button>`}
          </div>
          <small>${escapeHtml(event.record_id)} - ${new Date(event.created_at_unix_seconds * 1000).toLocaleString()}</small>
        </article>
      `).join("")}
    </section>
  `;
}

function renderRecordsTimeline(request) {
  const timeline = request.timeline || [];
  if (timeline.length === 0) return "";
  return `
    <details class="record-details">
      <summary>Request Timeline</summary>
      <ul>
        ${timeline.map((entry) => `
          <li>
            <strong>${escapeHtml(entry.action)}</strong> by ${escapeHtml(entry.actor)}:
            ${escapeHtml(entry.note)}
            <small>${new Date(entry.created_at_unix_seconds * 1000).toLocaleString()}</small>
          </li>
        `).join("")}
      </ul>
    </details>
  `;
}

function renderRecordsPublicStatusEvents(request) {
  const events = request.public_status_events || [];
  if (events.length === 0) return "";
  return `
    <details class="record-details" open>
      <summary>Status Updates</summary>
      <ul>
        ${events.map((event) => `
          <li>
            <strong>${escapeHtml(event.label)}</strong>
            <span>${escapeHtml(event.status)}</span>
            ${escapeHtml(event.summary)}
            <small>${new Date(event.created_at_unix_seconds * 1000).toLocaleString()}</small>
          </li>
        `).join("")}
      </ul>
    </details>
  `;
}

function renderRecordsMessages(request) {
  const messages = request.messages || [];
  if (messages.length === 0) return "";
  return `
    <details class="record-details" open>
      <summary>Request Messages</summary>
      <ul>
        ${messages.map((message) => `
          <li>
            <strong>${escapeHtml(message.author || message.author_role)}</strong>
            <span>${escapeHtml(message.author_role)}</span>
            ${escapeHtml(message.body)}
            <small>${new Date(message.created_at_unix_seconds * 1000).toLocaleString()}</small>
          </li>
        `).join("")}
      </ul>
    </details>
  `;
}

function renderRecordsDocuments(request) {
  const documents = request.documents || [];
  if (documents.length === 0) return "";
  return `
    <details class="record-details" open>
      <summary>Request Documents</summary>
      <ul>
        ${documents.map((document) => `
          <li>
            <strong>${escapeHtml(document.title)}</strong>
            ${document.citation ? `<span>${escapeHtml(document.citation)}</span>` : ""}
            <span>${escapeHtml(document.status)}</span>
            <small>SHA-256 ${escapeHtml(document.sha256)}</small>
            ${document.release_sha256 ? `<small>Release artifact: ${escapeHtml(document.release_status || "release copy")} ${escapeHtml(document.release_file_name || "")}; SHA-256 ${escapeHtml(document.release_sha256)}; ${escapeHtml(String(document.release_size_bytes || 0))} bytes</small>` : ""}
            ${document.release_note ? `<small>Release note: ${escapeHtml(document.release_note)}</small>` : ""}
          </li>
        `).join("")}
      </ul>
    </details>
  `;
}

function renderRecordsSearchSessions(request) {
  const sessions = request.search_sessions || [];
  if (sessions.length === 0) return "";
  return `
    <details class="record-details" open>
      <summary>Search Sessions</summary>
      <ul>
        ${sessions.map((session) => `
          <li>
            <strong>${escapeHtml(session.query)}</strong>
            <span>${escapeHtml(session.locations)}</span>
            ${(session.results || []).map((result) => `${escapeHtml(result.title)} (${escapeHtml(result.citation)})`).join("; ")}
            <small>${escapeHtml(session.reviewer || "records staff")}</small>
          </li>
        `).join("")}
      </ul>
    </details>
  `;
}

function renderRecordsReleasePackages(request) {
  const packages = request.release_packages || [];
  if (packages.length === 0) return "";
  return `
    <details class="record-details" open>
      <summary>Release Packages</summary>
      <ul>
        ${packages.map((pkg) => `
          <li>
            <strong>${escapeHtml(pkg.export_path)}</strong>
            <span>SHA-256 ${escapeHtml(pkg.package_hash)}</span>
            <small>${pkg.document_count} document(s), ${pkg.search_session_count} search session(s), ${pkg.release_count} release, ${pkg.redacted_count} redact, ${pkg.exempt_count} exempt</small>
          </li>
        `).join("")}
      </ul>
    </details>
  `;
}

function renderRecordsExemptionDecisions(request) {
  const decisions = request.exemption_decisions || [];
  if (decisions.length === 0) return "";
  return `
    <details class="record-details" open>
      <summary>Exemption Decisions</summary>
      <ul>
        ${decisions.map((decision) => `
          <li>
            <strong>${escapeHtml(decision.source)}</strong>
            <span>${escapeHtml(decision.decision)}</span>
            <span>${escapeHtml(decision.kind)}</span>
            ${escapeHtml(decision.finding)}
            <small>${escapeHtml(decision.basis)} - ${escapeHtml(decision.reviewer || "records staff")}</small>
          </li>
        `).join("")}
      </ul>
    </details>
  `;
}

function renderRecordsWorkflow() {
  if (isPublicSurface()) return renderPublicRecordsWorkflow();
  const work = cityWork();
  const selectedRequest = currentRecordsRequest(work);
  const selectedReleaseDocumentId = selectedRequest?.documents?.some((document) => document.id === state.workDraft.releaseDocumentId)
    ? state.workDraft.releaseDocumentId
    : selectedRequest?.documents?.[0]?.id || "";
  const demoLoadBlockedByData = [
    "meeting_bodies",
    "meeting_members",
    "agenda_intakes",
    "meetings",
    "records_requests",
    "code_sources",
    "code_handoffs",
    "adopted_legislation",
    "audit_entries",
    "publication_events",
    "notification_events"
  ].some((key) => (work[key] || []).length > 0)
    || (work.access?.reviews || []).length > 0
    || (work.access?.audit_events || []).length > 0;
  const canLoadDemo = accessState().role === "local-admin" && !work.demo_fixture && !demoLoadBlockedByData;
  return `
    <section class="page-heading">
      <p class="eyebrow">${state.activeSurface}</p>
      <h2>Records Requests</h2>
      <p>Track intake, deadline, review draft, citations, exports, and audit evidence locally.</p>
    </section>
    ${renderDemoTownBanner(work)}
    ${accessState().role === "local-admin" && !work.demo_fixture ? `
      <section class="workflow-form" aria-label="Load fictional demonstration town">
        <h3>Fictional demo town</h3>
        <p>Load Core's canonical Redstone Valley fixture to exercise the complete Records workflow. Loading is never automatic, requires an empty local profile, and creates a verified backup before replacing state.</p>
        <button type="button" class="secondary-action" data-work-action="load-demo-town" ${canLoadDemo ? "" : "disabled"}>Load demo town</button>
        ${demoLoadBlockedByData ? "<p class=\"form-help\">This profile already contains city work. Existing data will not be overwritten; use an empty profile to load the demo.</p>" : "<p class=\"form-help\">All demo records are fictional, independently authored, versioned, hashed, and visibly watermarked.</p>"}
      </section>
    ` : ""}
    ${renderGuidedWorkReview()}
    <section class="workflow-editor">
      <div class="workflow-form">
        <h3>Request Intake</h3>
        <label>Requester <input type="text" data-work-field="requester" value="${escapeHtml(state.workDraft.requester)}" /></label>
        <label>Deadline <input type="date" data-work-field="deadline" value="${escapeHtml(state.workDraft.deadline)}" /></label>
        <label>Deadline basis <input type="text" data-work-field="recordsDeadlineBasis" value="${escapeHtml(state.workDraft.recordsDeadlineBasis)}" placeholder="State records law or city policy basis" /></label>
        <label>Received date <input type="date" data-work-field="deadlineReceivedDate" value="${escapeHtml(state.workDraft.deadlineReceivedDate)}" /></label>
        <label>Deadline rule <input type="text" data-work-field="deadlineRuleName" value="${escapeHtml(state.workDraft.deadlineRuleName)}" placeholder="Colorado CORA three working days" /></label>
        <label>Deadline day count <input type="number" min="1" max="365" step="1" data-work-field="deadlineDayCount" value="${escapeHtml(state.workDraft.deadlineDayCount)}" /></label>
        <label>Deadline day type
          <select aria-label="Deadline day type" data-work-field="deadlineDayType">
            <option value="business days" ${state.workDraft.deadlineDayType === "business days" ? "selected" : ""}>Business days</option>
            <option value="calendar days" ${state.workDraft.deadlineDayType === "calendar days" ? "selected" : ""}>Calendar days</option>
          </select>
        </label>
        <p class="form-help">Business-day calculations skip weekends. Staff must still check city/state holidays before saving.</p>
        <label>Request summary <textarea data-work-field="recordsSummary">${escapeHtml(state.workDraft.recordsSummary)}</textarea></label>
        <button type="button" class="primary-action" data-work-action="create-records-request">Create Request</button>
      </div>
      <div class="workflow-form">
        <h3>Scope & Search</h3>
        <label>Assign to <input type="text" data-work-field="assignedTo" value="${escapeHtml(state.workDraft.assignedTo)}" /></label>
        <label>Clarification note <textarea data-work-field="clarificationNote">${escapeHtml(state.workDraft.clarificationNote)}</textarea></label>
        <label>Search source note <textarea data-work-field="sourceNote">${escapeHtml(state.workDraft.sourceNote)}</textarea></label>
        <label>Records search query <input type="text" data-work-field="recordsSearchQuery" value="${escapeHtml(state.workDraft.recordsSearchQuery)}" placeholder="Subject, date range, requester scope" /></label>
        <label>Searched locations <textarea data-work-field="searchLocations">${escapeHtml(state.workDraft.searchLocations)}</textarea></label>
        <label>Search result title <input type="text" data-work-field="searchResultTitle" value="${escapeHtml(state.workDraft.searchResultTitle)}" /></label>
        <label>Search result citation <input type="text" data-work-field="searchResultCitation" value="${escapeHtml(state.workDraft.searchResultCitation)}" /></label>
        <label>Search result summary <textarea data-work-field="searchResultSummary">${escapeHtml(state.workDraft.searchResultSummary)}</textarea></label>
        <label>Search result status <input type="text" data-work-field="searchResultStatus" value="${escapeHtml(state.workDraft.searchResultStatus)}" /></label>
        <label>Search reviewer <input type="text" data-work-field="searchReviewer" value="${escapeHtml(state.workDraft.searchReviewer)}" placeholder="Records Officer" /></label>
        <label>Citation or source note <input type="text" data-work-field="citation" value="${escapeHtml(state.workDraft.citation)}" /></label>
        <label>Exemption review <textarea data-work-field="exemptionNote">${escapeHtml(state.workDraft.exemptionNote)}</textarea></label>
        <label>Exemption source <input type="text" data-work-field="exemptionSource" value="${escapeHtml(state.workDraft.exemptionSource)}" placeholder="File, page, timestamp, or segment" /></label>
        <label>Exemption category <input type="text" data-work-field="exemptionKind" value="${escapeHtml(state.workDraft.exemptionKind)}" placeholder="PII, attorney-client, personnel, other" /></label>
        <label>Staff finding <textarea data-work-field="exemptionFinding">${escapeHtml(state.workDraft.exemptionFinding)}</textarea></label>
        <label>Decision
          <select aria-label="Decision" data-work-field="exemptionDecision">
            <option value="release" ${state.workDraft.exemptionDecision === "release" ? "selected" : ""}>Release</option>
            <option value="redact" ${state.workDraft.exemptionDecision === "redact" ? "selected" : ""}>Redact</option>
            <option value="exempt" ${state.workDraft.exemptionDecision === "exempt" ? "selected" : ""}>Exempt</option>
          </select>
        </label>
        <label>Decision basis <input type="text" data-work-field="exemptionBasis" value="${escapeHtml(state.workDraft.exemptionBasis)}" placeholder="Statute, ordinance, or policy basis" /></label>
        <label>Exemption reviewer <input type="text" data-work-field="exemptionReviewer" value="${escapeHtml(state.workDraft.exemptionReviewer)}" placeholder="Records Officer" /></label>
        <label>Fee estimate <input type="text" data-work-field="feeEstimate" value="${escapeHtml(state.workDraft.feeEstimate)}" /></label>
        <label>Fee line description <input type="text" data-work-field="feeLineDescription" value="${escapeHtml(state.workDraft.feeLineDescription)}" placeholder="Search time, copies, media, or waived charge basis" /></label>
        <label>Fee schedule or policy basis <input type="text" data-work-field="feeScheduleBasis" value="${escapeHtml(state.workDraft.feeScheduleBasis)}" placeholder="Adopted records fee schedule or waiver policy" /></label>
        <label>Fee line amount <input type="text" inputmode="decimal" data-work-field="feeLineAmount" value="${escapeHtml(state.workDraft.feeLineAmount)}" placeholder="12.50" /></label>
        <label>Fee waiver reason <textarea data-work-field="feeWaiverReason">${escapeHtml(state.workDraft.feeWaiverReason)}</textarea></label>
        <div class="workflow-actions">
          <button type="button" class="secondary-action" data-work-action="set-records-deadline">Set Deadline</button>
          <button type="button" class="secondary-action" data-work-action="calculate-records-deadline">Calculate Deadline</button>
          <button type="button" class="secondary-action" data-work-action="assign-records-request">Assign</button>
          <button type="button" class="secondary-action" data-work-action="request-records-clarification">Request Clarification</button>
          <button type="button" class="secondary-action" data-work-action="record-records-search">Record Search</button>
          <button type="button" class="secondary-action" data-work-action="record-records-search-session">Save Search Session</button>
          <button type="button" class="secondary-action" data-work-action="add-records-exemption-review">Add Exemption Review</button>
          <button type="button" class="secondary-action" data-work-action="add-records-exemption-decision">Save Exemption Decision</button>
          <button type="button" class="secondary-action" data-work-action="estimate-records-fee">Estimate Fee</button>
          <button type="button" class="secondary-action" data-work-action="add-records-fee-line">Add Fee Line</button>
          <button type="button" class="secondary-action" data-work-action="waive-records-fee">Waive Fee</button>
        </div>
      </div>
      <div class="workflow-form">
        <h3>Request Messages</h3>
        <p class="form-help">Add requester-visible communication to the request thread. Staff-only notes stay in clarification, search, exemption, and approval fields.</p>
        <label>Message to requester <textarea data-work-field="requestMessageBody">${escapeHtml(state.workDraft.requestMessageBody)}</textarea></label>
        <button type="button" class="secondary-action" data-work-action="add-records-message">Add Request Message</button>
      </div>
      <div class="workflow-form">
        <h3>Request Documents</h3>
        <p class="form-help">Attach a local source file or typed records reference. Readable files are copied and hashed; unreadable typed references are preserved as hashed local marker files.</p>
        <label>Document title <input type="text" data-work-field="documentTitle" value="${escapeHtml(state.workDraft.documentTitle)}" /></label>
        ${renderFilePathField("Source file path or reference", "documentSourcePath", state.workDraft.documentSourcePath, "C:/City/Records/responsive-email.pdf")}
        <label>Document citation <input type="text" data-work-field="documentCitation" value="${escapeHtml(state.workDraft.documentCitation)}" /></label>
        <button type="button" class="secondary-action" data-work-action="add-records-document">Attach Document</button>
        <label>Release document
          ${selectedRequest?.documents?.length ? `<select aria-label="Release document" data-work-field="releaseDocumentId">
            ${(selectedRequest.documents || []).map((document) => `<option value="${escapeHtml(document.id)}" ${selectedReleaseDocumentId === document.id ? "selected" : ""}>${escapeHtml(document.title)}</option>`).join("")}
          </select>` : `<input type="text" aria-label="Release document" value="Attach an original document first" disabled />`}
        </label>
        ${renderFilePathField("Release copy file path or reference", "releaseCopyPath", state.workDraft.releaseCopyPath, "C:/City/Records/release/redacted-email.pdf")}
        <label>Release copy status
          <select aria-label="Release copy status" data-work-field="releaseCopyStatus">
            ${["redacted copy", "release-ready copy"].map((status) => `<option value="${status}" ${state.workDraft.releaseCopyStatus === status ? "selected" : ""}>${status}</option>`).join("")}
          </select>
        </label>
        <label>Release copy note <textarea data-work-field="releaseCopyNote">${escapeHtml(state.workDraft.releaseCopyNote)}</textarea></label>
        <label>Release copy reviewed by <input type="text" data-work-field="releaseCopyAddedBy" value="${escapeHtml(state.workDraft.releaseCopyAddedBy)}" placeholder="Records Officer" /></label>
        <button type="button" class="secondary-action" data-work-action="add-records-release-copy">Attach Release Copy</button>
      </div>
      <div class="workflow-form">
        <h3>Response & Release</h3>
        <label>Response draft <textarea data-work-field="responseDraft">${escapeHtml(state.workDraft.responseDraft)}</textarea></label>
        <label>Approval note <input type="text" data-work-field="approvalNote" value="${escapeHtml(state.workDraft.approvalNote)}" /></label>
        <div class="workflow-actions">
          <button type="button" class="secondary-action" data-work-action="suggest-records-response">Generate Local AI Draft</button>
          <button type="button" class="secondary-action" data-work-action="draft-records-response">Save Draft</button>
          <button type="button" class="secondary-action" data-work-action="approve-records-response">Approve Response</button>
          <button type="button" class="secondary-action" data-work-action="build-records-release-package">Build Release Package</button>
          <button type="button" class="secondary-action" data-work-action="export-records-response">Export Response</button>
          <button type="button" class="secondary-action" data-work-action="fulfill-records-request">Mark Fulfilled</button>
          <button type="button" class="secondary-action" data-work-action="close-records-request">Close Request</button>
          <button type="button" class="secondary-action" data-work-action="open-exports-folder">Open Exports Folder</button>
        </div>
      </div>
    </section>
    ${renderWorkActionResult()}
    ${renderRecordsNotificationOutbox(work)}
    <section class="workflow-list">
      ${work.records_requests.length === 0 ? workflowEmpty("No local records requests have been created yet.") : work.records_requests.map((request) => `
        <article class="workflow-record">
          <span class="status-warn">${escapeHtml(request.status)}</span>
          <h3>${escapeHtml(request.requester)}</h3>
          <p>${escapeHtml(request.summary)}</p>
          ${request.public_tracking_number ? `<p><strong>Tracking:</strong> ${escapeHtml(request.public_tracking_number)}</p>` : ""}
          ${request.requester_contact ? `<p><strong>Contact:</strong> ${escapeHtml(request.requester_contact)}</p>` : ""}
          ${request.submitted_via ? `<p><strong>Submitted via:</strong> ${escapeHtml(request.submitted_via)}</p>` : ""}
          ${request.deadline_basis ? `<p><strong>Deadline basis:</strong> ${escapeHtml(request.deadline_basis)}</p>` : ""}
          ${request.assigned_to ? `<p><strong>Assigned:</strong> ${escapeHtml(request.assigned_to)}</p>` : ""}
          ${request.fee_estimate ? `<p><strong>Fee estimate:</strong> ${escapeHtml(request.fee_estimate)}</p>` : ""}
          ${(request.fee_line_items || []).length > 0 ? `<p><strong>Fee lines:</strong> ${(request.fee_line_items || []).map((item) => `${escapeHtml(item.description)} ${escapeHtml(formatFeeCents(item.amount_cents))}${item.schedule_basis ? ` (${escapeHtml(item.schedule_basis)})` : ""}`).join("; ")}</p>` : ""}
          ${request.fee_waiver_reason ? `<p><strong>Fee waiver:</strong> ${escapeHtml(request.fee_waiver_reason)}</p>` : ""}
          ${request.approved_at_unix_seconds ? "<p><strong>Approval:</strong> human-approved</p>" : ""}
          ${request.fulfilled_at_unix_seconds ? "<p><strong>Fulfillment:</strong> released to requester</p>" : ""}
          ${renderRecordsMessages(request)}
          ${renderRecordsDocuments(request)}
          ${renderRecordsSearchSessions(request)}
          ${renderRecordsExemptionDecisions(request)}
          ${renderRecordsReleasePackages(request)}
          ${renderRecordsTimeline(request)}
          ${renderRecordsPublicStatusEvents(request)}
          <div class="record-actions">
            ${selectedRequest?.id === request.id ? `<span class="status-ok">Selected for actions</span>` : `<button type="button" class="secondary-action" data-select-work-record="recordsRequest" data-record-id="${escapeHtml(request.id)}">Work On This</button>`}
          </div>
          <small>Due ${escapeHtml(request.deadline)} - ${(request.citations || []).length} citations - ${(request.exemption_reviews || []).length} exemption notes - ${(request.release_packages || []).length} release packages - ${(request.exports || []).length} exports</small>
        </article>
      `).join("")}
    </section>
  `;
}

function renderPublicCodeWorkflow() {
  const sources = publicCodeSources(cityWork());
  const answers = localCodeQuestionResults(state.workDraft.codeQuestion, { publicOnly: true });
  return `
    <section class="page-heading">
      <p class="eyebrow">Resident/Public</p>
      <h2>Municipal Code Search</h2>
      <p>Published code sources appear with citations. Staff handoffs and draft guidance stay in the Staff surface.</p>
    </section>
    <section class="workflow-editor single">
      <div class="workflow-form">
        <h3>Ask the Code</h3>
        <p class="form-help">Answers use published local code sources and citations only. They are plain-language help, not legal advice.</p>
        <label>Question <input type="search" data-work-field="codeQuestion" value="${escapeHtml(state.workDraft.codeQuestion)}" placeholder="Can I have chickens?" /></label>
        <button type="button" class="primary-action" data-work-action="answer-code-question">Answer Code Question</button>
      </div>
    </section>
    ${renderWorkActionResult()}
    <section class="workflow-list">
      ${answers.length === 0 ? workflowEmpty("Ask a question to see cited public code answers.") : answers.map((answer) => `
        <article class="workflow-record">
          <span class="status-ok">${escapeHtml(answer.module_id)}</span>
          <h3>${escapeHtml(answer.title)}</h3>
          <p>${escapeHtml(answer.snippet)}</p>
          <small>${escapeHtml(answer.citation)} - ${escapeHtml(answer.status)}</small>
        </article>
      `).join("")}
    </section>
    <section class="workflow-list">
      ${sources.length === 0 ? workflowEmpty("No published municipal code sources are available yet.") : sources.map((source) => `
        <article class="workflow-record">
          <span class="status-ok">${escapeHtml(source.public_status)}</span>
          <h3>${escapeHtml(source.title)}</h3>
          <p>${escapeHtml(source.body)}</p>
          ${source.guidance_approved_at_unix_seconds && source.plain_language_summary ? `<p><strong>Plain-English summary:</strong> ${escapeHtml(source.plain_language_summary)}</p>` : ""}
          ${codeSourceEvidenceSummary(source, { staff: false }) ? `<p><strong>Source evidence:</strong> ${escapeHtml(codeSourceEvidenceSummary(source, { staff: false }))}</p>` : ""}
          ${codeVersionHistorySummary(source) ? `<p><strong>Source history:</strong> ${escapeHtml(codeVersionHistorySummary(source))}</p>` : ""}
          ${source.stale_since_unix_seconds ? "<p><strong>Update status:</strong> codifier update pending</p>" : ""}
          <small>${escapeHtml(source.citation)} - ${escapeHtml(source.codifier_sync_status || "not synced")} - ${(source.public_exports || []).length} public exports - contact city staff for legal interpretation</small>
        </article>
      `).join("")}
    </section>
  `;
}

function renderCodeWorkflow() {
  if (isPublicSurface()) return renderPublicCodeWorkflow();
  const work = cityWork();
  const selectedSource = currentCodeSource(work);
  const selectedHandoff = currentCodeHandoff(work);
  const codeAnswers = localCodeQuestionResults(state.workDraft.codeQuestion, { publicOnly: false });
  const selectedSourceContext = selectedSource
    ? `${escapeHtml(selectedSource.title)} (${escapeHtml(selectedSource.citation)})`
    : "No code source selected yet. Import a source or choose Work On This before publishing, syncing, or handing off.";
  return `
    <section class="page-heading">
      <p class="eyebrow">${state.activeSurface}</p>
      <h2>Code & Ordinances</h2>
      <p>Import local code sources with citation text and create clerk handoffs for ordinance or resolution work.</p>
      <p class="form-help"><strong>Selected code source for actions:</strong> ${selectedSourceContext}</p>
    </section>
    ${renderGuidedWorkReview()}
    <section class="workflow-editor">
      <div class="workflow-form">
        <h3>Import Code Source</h3>
        <label>Source title <input type="text" data-work-field="codeTitle" value="${escapeHtml(state.workDraft.codeTitle)}" /></label>
        <label>Citation <input type="text" data-work-field="codeCitation" value="${escapeHtml(state.workDraft.codeCitation)}" /></label>
        ${renderFilePathField("Source file path or reference", "codeSourcePath", state.workDraft.codeSourcePath, "C:/City/Code/noise-ordinance.pdf")}
        <label>Imported by <input type="text" data-work-field="codeImportedBy" value="${escapeHtml(state.workDraft.codeImportedBy)}" placeholder="City Clerk or deputy clerk" /></label>
        <label>Source text <textarea data-work-field="codeBody">${escapeHtml(state.workDraft.codeBody)}</textarea></label>
        <div class="workflow-actions">
          <button type="button" class="primary-action" data-work-action="import-code-source">Import Source</button>
          <button type="button" class="secondary-action" data-work-action="publish-code-source">Publish Source</button>
          <button type="button" class="secondary-action" data-work-action="unpublish-code-source">Unpublish Source</button>
          <button type="button" class="secondary-action" data-work-action="open-exports-folder">Open Exports Folder</button>
        </div>
      </div>
      <div class="workflow-form">
        <h3>Codifier Sync</h3>
        <label>Codifier <input type="text" data-work-field="codifierName" value="${escapeHtml(state.workDraft.codifierName)}" /></label>
        <label>Authoritative URL <input type="url" data-work-field="authoritativeUrl" value="${escapeHtml(state.workDraft.authoritativeUrl)}" /></label>
        <label>Version label <input type="text" data-work-field="versionLabel" value="${escapeHtml(state.workDraft.versionLabel)}" /></label>
        <label>Sync error <input type="text" data-work-field="syncError" value="${escapeHtml(state.workDraft.syncError)}" /></label>
        <label>Amendment or stale note <textarea data-work-field="amendmentNote">${escapeHtml(state.workDraft.amendmentNote)}</textarea></label>
        <div class="workflow-actions">
          <button type="button" class="secondary-action" data-work-action="record-codifier-sync">Record Sync</button>
          <button type="button" class="secondary-action" data-work-action="record-codifier-sync-failure">Record Sync Failure</button>
          <button type="button" class="secondary-action" data-work-action="retry-codifier-sync">Retry Sync</button>
          <button type="button" class="secondary-action" data-work-action="mark-code-stale">Mark Stale</button>
        </div>
      </div>
      <div class="workflow-form">
        <h3>Guidance & Summary</h3>
        <label>Staff guidance <textarea data-work-field="guidanceDraft">${escapeHtml(state.workDraft.guidanceDraft)}</textarea></label>
        <label>Plain-English summary <textarea data-work-field="summaryDraft">${escapeHtml(state.workDraft.summaryDraft)}</textarea></label>
        <div class="workflow-actions">
          <button type="button" class="secondary-action" data-work-action="suggest-code-guidance">Generate Local AI Guidance</button>
          <button type="button" class="secondary-action" data-work-action="draft-code-guidance">Save Guidance Draft</button>
          <button type="button" class="secondary-action" data-work-action="approve-code-guidance">Approve Guidance</button>
        </div>
      </div>
      <div class="workflow-form">
        <h3>Clerk Handoff</h3>
        <label>Handoff summary <textarea data-work-field="handoffSummary">${escapeHtml(state.workDraft.handoffSummary)}</textarea></label>
        <button type="button" class="secondary-action" data-work-action="create-code-handoff">Create Clerk Handoff</button>
      </div>
      <div class="workflow-form">
        <h3>Ask Code Question</h3>
        <p class="form-help">Staff answers can use internal guidance and citations, but still stay non-authoritative.</p>
        <label>Question <input type="search" data-work-field="codeQuestion" value="${escapeHtml(state.workDraft.codeQuestion)}" placeholder="What does the code say about noise?" /></label>
        <button type="button" class="secondary-action" data-work-action="answer-code-question">Answer Code Question</button>
      </div>
    </section>
    ${renderWorkActionResult()}
    <section class="workflow-list">
      ${codeAnswers.length === 0 ? workflowEmpty("Ask a code question to see cited staff answers.") : codeAnswers.map((answer) => `
        <article class="workflow-record">
          <span class="status-ok">${escapeHtml(answer.module_id)}</span>
          <h3>${escapeHtml(answer.title)}</h3>
          <p>${escapeHtml(answer.snippet)}</p>
          <small>${escapeHtml(answer.citation)} - ${escapeHtml(answer.status)}</small>
        </article>
      `).join("")}
    </section>
    <section class="workflow-list">
      ${work.code_sources.length === 0 ? workflowEmpty("No local code sources have been imported yet.") : work.code_sources.map((source) => `
        <article class="workflow-record">
          <span class="status-ok">${escapeHtml(source.status)}</span>
          <h3>${escapeHtml(source.title)}</h3>
          <p>${escapeHtml(source.body)}</p>
          ${codeSourceEvidenceSummary(source) ? `<p><strong>Source evidence:</strong> ${escapeHtml(codeSourceEvidenceSummary(source))}</p>` : ""}
          ${source.codifier_name ? `<p><strong>Codifier:</strong> ${escapeHtml(source.codifier_name)}</p>` : ""}
          ${codeVersionHistorySummary(source) ? `<p><strong>Source history:</strong> ${escapeHtml(codeVersionHistorySummary(source))}</p>` : ""}
          ${source.stale_since_unix_seconds ? "<p><strong>Stale:</strong> codifier update pending</p>" : ""}
          ${source.staff_guidance ? `<p><strong>Staff guidance:</strong> ${escapeHtml(source.staff_guidance)}</p>` : ""}
          <div class="record-actions">
            ${selectedSource?.id === source.id ? `<span class="status-ok">Selected for actions</span>` : `<button type="button" class="secondary-action" data-select-work-record="codeSource" data-record-id="${escapeHtml(source.id)}">Work On This</button>`}
          </div>
          <small>${escapeHtml(source.citation)} - ${escapeHtml(source.public_status || "internal draft")} - ${escapeHtml(source.codifier_sync_status || "not synced")} - ${(source.public_exports || []).length} public exports</small>
        </article>
      `).join("")}
      ${work.code_handoffs.map((handoff) => `
        <article class="workflow-record handoff">
          <span class="status-warn">${escapeHtml(handoff.status)}</span>
          <h3>${escapeHtml(handoff.title)}</h3>
          <p>${escapeHtml(handoff.summary)}</p>
          <div class="record-actions">
            ${selectedHandoff?.id === handoff.id ? `<span class="status-ok">Selected for agenda action</span>` : `<button type="button" class="secondary-action" data-select-work-record="codeHandoff" data-record-id="${escapeHtml(handoff.id)}">Work On This</button>`}
          </div>
        </article>
      `).join("")}
      ${(work.adopted_legislation || []).map((item) => `
        <article class="workflow-record handoff">
          <span class="status-warn">${escapeHtml(item.handoff_status)}</span>
          <h3>${escapeHtml(item.title)}</h3>
          <p>${escapeHtml(item.legislation_type)} adopted from ${escapeHtml(item.meeting_title)}.</p>
          <small>${escapeHtml(item.effective_date || "No effective date")} - ${escapeHtml(item.codification_section_hint || "No codification hint")} - Townlight Meetings adoption event</small>
        </article>
      `).join("")}
    </section>
  `;
}

function localSearchResults(query, { publicOnly = false } = {}) {
  const normalized = query.trim().toLowerCase();
  const work = cityWork();
  if (!normalized) return [];
  const results = [];
  meetingBodies(work).forEach((body) => {
    const bodySearchText = [body.name, body.body_type, body.statutory_basis, body.meeting_cadence, body.quorum_rule, body.status];
    if (bodySearchText.some((value) => String(value || "").toLowerCase().includes(normalized))) {
      results.push({
        module_id: "civicclerk",
        title: `Meeting body: ${body.name}`,
        snippet: `${body.body_type}; ${body.meeting_cadence}; quorum ${body.quorum_rule}`,
        citation: body.statutory_basis,
        status: body.status
      });
    }
  });
  meetingMembers(work).forEach((member) => {
    const memberSearchText = publicOnly
      ? [member.name, member.role, member.body_name, member.term_start, member.term_end, member.status]
      : [member.name, member.role, member.body_name, member.term_start, member.term_end, member.email, member.status];
    if (memberSearchText.some((value) => String(value || "").toLowerCase().includes(normalized))) {
      results.push({
        module_id: "civicclerk",
        title: `Meeting member: ${member.name}`,
        snippet: `${member.role}; ${member.body_name}`,
        citation: member.body_name,
        status: member.status
      });
    }
  });
  const meetings = publicOnly ? publicMeetings(work) : work.meetings;
  meetings.forEach((meeting) => {
    const agendaTitles = (meeting.agenda_items || [])
      .map((item) => [item.title, item.status, item.visibility, item.source_reference, item.source_module, item.department].join(" "))
      .join(" ");
    const motions = (meeting.motions || [])
      .map((motion) => [motion.text, motion.mover, motion.seconder, motion.disposition, motion.vote_reference].join(" "))
      .join(" ");
    const memberVotes = (meeting.member_votes || [])
      .map((vote) => [vote.member_name, vote.vote, vote.motion_text, vote.motion_id].join(" "))
      .join(" ");
    const attendanceRecords = (meeting.attendance_records || [])
      .map((record) => [record.member_name, record.status, record.note, record.recorded_by].join(" "))
      .join(" ");
    const quorumChecks = (meeting.quorum_checks || [])
      .map((record) => [
        record.status,
        record.quorum_rule,
        record.required_count,
        record.roster_count,
        record.present_count,
        record.remote_count,
        record.recused_count,
        record.review_note
      ].join(" "))
      .join(" ");
    const staffReports = (meeting.staff_reports || [])
      .map((report) => [report.agenda_item_title, report.recommendation, report.background, report.analysis, report.fiscal_impact, report.alternatives, report.prior_actions, report.prepared_by, report.revision_note].join(" "))
      .join(" ");
    const outcomes = (meeting.votes || []).join(" ");
    const actionItems = (meeting.action_items || []).join(" ");
    const actionRecords = (meeting.action_records || [])
      .map((action) => [action.description, action.owner, action.due_date, action.status, action.source_reference].join(" "))
      .join(" ");
    const adoptedLegislation = (meeting.adopted_legislation || [])
      .map((item) => [item.legislation_type, item.title, item.text, item.effective_date, item.codification_section_hint, item.source_motion_text, item.source_agenda_item_title, item.handoff_status].join(" "))
      .join(" ");
    const closedSessions = (meeting.closed_sessions || [])
      .map((session) => [session.statutory_basis, (session.topics || []).join(" "), (session.attendees || []).join(" "), session.entered_at, session.exited_at, session.reconvene_statement, session.staff_notes_reference].join(" "))
      .join(" ");
    const residentComments = (meeting.resident_comments || []).join(" ");
    const noticeChecklists = (meeting.notice_checklists || [])
      .map((entry) => [entry.meeting_type, entry.statutory_basis, entry.posting_deadline, entry.time_zone, entry.status].join(" "))
      .join(" ");
    const noticePostings = (meeting.notice_postings || [])
      .map((entry) => [entry.location, entry.method, entry.confirmation, entry.posted_on, entry.time_zone].join(" "))
      .join(" ");
    const packetAttachments = (meeting.attachments || [])
      .map((attachment) => {
        const publicFields = [attachment.title, attachment.citation, attachment.packet_section, attachment.access_level, attachment.sha256];
        if (publicOnly) return publicFields.join(" ");
        return [...publicFields, attachment.original_path, attachment.stored_path, attachment.added_by].join(" ");
      })
      .join(" ");
    const packetAssemblies = (meeting.packet_assemblies || [])
      .map((packet) => [
        packet.packet_title,
        packet.prepared_by,
        packet.review_note,
        packet.status,
        packet.agenda_item_count,
        packet.public_attachment_count,
        packet.closed_session_attachment_count
      ].join(" "))
      .join(" ");
    const exportBundles = (meeting.export_bundles || [])
      .map((bundle) => {
        const publicFields = [
          bundle.export_hash,
          bundle.manifest_hash,
          bundle.public_record ? "public archive bundle" : "staff packet bundle",
          bundle.agenda_item_count,
          bundle.notice_posting_count,
          bundle.public_attachment_count,
          bundle.closed_session_attachment_count,
          bundle.attendance_record_count,
          bundle.quorum_check_count
        ];
        if (publicOnly) return publicFields.join(" ");
        return [
          ...publicFields,
          bundle.export_path,
          bundle.manifest_path,
          bundle.integrity_manifest_path
        ].join(" ");
      })
      .join(" ");
    const minuteCitations = (meeting.minute_citations || [])
      .map((citation) => [citation.sentence, citation.source_type, citation.source_reference, citation.note, citation.access_level].join(" "))
      .join(" ");
    const publicComments = (meeting.public_comments || [])
      .filter((comment) => !publicOnly || ["reviewed for public record", "redacted for public record"].includes(comment.status))
      .map((comment) => {
        const publicBody = comment.status === "redacted for public record" && comment.redacted_body
          ? comment.redacted_body
          : comment.body;
        const fields = publicOnly
          ? [comment.mode, comment.topic, publicBody]
          : [
              comment.commenter_name,
              comment.commenter_contact,
              comment.mode,
              comment.topic,
              comment.body,
              comment.redacted_body,
              comment.redaction_basis
        ];
        return fields.join(" ");
      }).join(" ");
    const publicArchive = publicOnly && (meeting.status === "archived public record" || meeting.archived_at_unix_seconds);
    const publicMeetingFields = [
      meeting.title,
      meeting.body_name,
      meeting.summary,
      meeting.status,
      meeting.notice_status,
      noticeChecklists,
      noticePostings,
      agendaTitles,
      packetAttachments,
      packetAssemblies,
      exportBundles,
      attendanceRecords,
      quorumChecks,
      minuteCitations,
      publicComments
    ];
    const meetingSearchText = publicOnly
      ? publicArchive
        ? [...publicMeetingFields, meeting.minutes, meeting.minutes_signed_by, meeting.minutes_signature_attestation, motions, memberVotes, staffReports, outcomes, actionItems, actionRecords, adoptedLegislation, closedSessions, residentComments]
        : publicMeetingFields
      : [meeting.title, meeting.body_name, meeting.summary, meeting.status, meeting.minutes, meeting.minutes_signed_by, meeting.minutes_signature_attestation, noticeChecklists, noticePostings, agendaTitles, staffReports, packetAttachments, packetAssemblies, exportBundles, attendanceRecords, quorumChecks, minuteCitations, motions, memberVotes, outcomes, actionItems, actionRecords, adoptedLegislation, closedSessions, residentComments, publicComments];
    if (meetingSearchText.some((value) => String(value || "").toLowerCase().includes(normalized))) {
      results.push({ module_id: "civicclerk", title: meeting.title, snippet: meeting.summary, citation: `Meeting ${meeting.meeting_date}`, status: meeting.status });
    }
    if ([noticeChecklists, noticePostings, exportBundles].some((value) => String(value || "").toLowerCase().includes(normalized))) {
      results.push({
        module_id: "civicnotice",
        title: `Notice workpaper: ${meeting.title}`,
        snippet: meeting.notice_status || "Notice workpaper",
        citation: `Meeting ${meeting.meeting_date}`,
        status: meeting.notice_status || meeting.status
      });
    }
  });
  if (!publicOnly) {
    agendaIntakes(work).forEach((intake) => {
      const intakeSearchText = [
        intake.title,
        intake.submitter,
        intake.department,
        intake.summary,
        intake.source_reference,
        intake.requested_meeting_date,
        intake.status,
        intake.review_note
      ];
      if (intakeSearchText.some((value) => String(value || "").toLowerCase().includes(normalized))) {
        results.push({
          module_id: "civicclerk",
          title: `Agenda intake: ${intake.title}`,
          snippet: `${intake.department}; ${intake.summary}`,
          citation: intake.source_reference,
          status: intake.status
        });
      }
    });
  }
  const recordsRequests = publicOnly ? publicRecordsRequests(work) : work.records_requests;
  recordsRequests.forEach((request) => {
    const requestMessageSearchText = (request.messages || [])
      .map((message) => [message.author, message.author_role, message.body].join(" "));
    const requestDocumentSearchText = (request.documents || [])
      .map((document) => [
        document.title,
        document.citation,
        document.status,
        document.sha256,
        document.release_file_name,
        document.release_sha256,
        document.release_status,
        document.release_note,
        document.release_added_by
      ].join(" "));
    const searchSessionSearchText = (request.search_sessions || [])
      .map((session) => [
        session.query,
        session.locations,
        session.reviewer,
        ...(session.results || []).map((result) => [result.title, result.citation, result.summary, result.status].join(" "))
      ].join(" "));
    const exemptionDecisionSearchText = (request.exemption_decisions || [])
      .map((decision) => [decision.source, decision.kind, decision.finding, decision.decision, decision.basis, decision.reviewer].join(" "));
    const releasePackageSearchText = (request.release_packages || [])
      .map((pkg) => [pkg.export_path, pkg.package_hash, pkg.document_count, pkg.release_artifact_count, pkg.search_session_count, pkg.release_count, pkg.redacted_count, pkg.exempt_count].join(" "));
    const feeLineSearchText = (request.fee_line_items || [])
      .map((item) => [item.description, item.schedule_basis, formatFeeCents(item.amount_cents)].join(" "));
    const publicStatusEventSearchText = (request.public_status_events || [])
      .map((event) => [event.label, event.summary, event.status].join(" "));
    const publicRecordFields = [
      request.public_tracking_number,
      request.requester,
      request.submitted_via,
      request.summary,
      request.status,
      request.deadline,
      request.deadline_basis,
      ...publicStatusEventSearchText,
      ...(request.citations || [])
    ];
    const recordsSearchText = publicOnly ? publicRecordFields : [
      ...publicRecordFields,
      request.requester_contact,
      request.assigned_to,
      request.fee_estimate,
      request.fee_waiver_reason,
      ...feeLineSearchText,
      ...requestMessageSearchText,
      ...requestDocumentSearchText,
      ...searchSessionSearchText,
      ...exemptionDecisionSearchText,
      ...releasePackageSearchText,
      request.response_draft,
      ...(request.clarification_notes || []),
      ...(request.search_notes || []),
      ...(request.exemption_reviews || []),
      ...(request.approval_notes || []),
      ...(request.timeline || []).map((entry) => [entry.action, entry.actor, entry.note].join(" "))
    ];
    if (recordsSearchText.some((value) => String(value || "").toLowerCase().includes(normalized))) {
      results.push({ module_id: "civicrecords-ai", title: `Records request: ${request.requester}`, snippet: request.summary, citation: request.citations[0] || "Local records request", status: request.status });
    }
  });
  const codeSources = publicOnly ? publicCodeSources(work) : work.code_sources;
  codeSources.forEach((source) => {
    const codeSearchText = codeSourceSearchFields(source, { publicOnly });
    if (codeSearchText.some((value) => String(value || "").toLowerCase().includes(normalized))) {
      results.push({ module_id: "civiccode", title: source.title, snippet: source.body, citation: source.citation, status: source.status });
    }
  });
  if (!publicOnly) {
    (work.notification_events || []).forEach((event) => {
      const notificationSearchText = [
        event.module_id,
        event.record_id,
        event.audience,
        event.channel,
        event.subject,
        event.body,
        event.status
      ];
      if (notificationSearchText.some((value) => String(value || "").toLowerCase().includes(normalized))) {
        results.push({
          module_id: "civiccore",
          title: `Notification: ${event.subject}`,
          snippet: event.body,
          citation: event.channel,
          status: event.status
        });
      }
    });
  }
  const reviews = (work.access && work.access.reviews) || [];
  reviews.forEach((review) => {
    const findingSummary = (review.findings || [])
      .map((f) => `${f.code}: ${f.message}`)
      .join("; ");
    const reviewSearchText = [review.title, review.body, review.language, review.status, findingSummary];
    if (reviewSearchText.some((value) => String(value || "").toLowerCase().includes(normalized))) {
      results.push({
        module_id: "civicaccess",
        title: `Accessibility review: ${review.title || "(no title)"}`,
        snippet: `${review.status} (${(review.findings || []).length} finding(s); language: ${review.language}; alt text: ${review.has_alt_text ? "yes" : "no"})`,
        citation: `Accessibility advisory review ${review.review_id}`,
        status: review.status
      });
    }
  });
  return results.filter((result) => moduleIsEnabled(result.module_id));
}

function renderSearchWorkflow() {
  const publicOnly = isPublicSurface();
  const results = state.searchResults.length > 0 && !publicOnly ? state.searchResults : localSearchResults(state.workDraft.searchQuery, { publicOnly });
  return `
    <section class="page-heading">
      <p class="eyebrow">${state.activeSurface}</p>
      <h2>Search City Knowledge</h2>
      <p>${publicOnly ? "Search public meeting materials, released records, and published code sources." : "Search local meetings, notice workpapers, records requests, imported code sources, and accessibility reviews with citations and owning module labels."}</p>
    </section>
    ${publicOnly ? "" : `<section class="workflow-editor single">
      <div class="workflow-form">
        <h3>Local Search</h3>
        <label>Search terms <input type="search" data-work-field="searchQuery" value="${escapeHtml(state.workDraft.searchQuery)}" /></label>
        <button type="button" class="primary-action" data-work-action="search-city-knowledge">Search Local Data</button>
      </div>
    </section>`}
    ${publicOnly ? `<section class="workflow-editor single">
      <div class="workflow-form">
        <h3>Public Search</h3>
        <label>Search terms <input type="search" data-work-field="searchQuery" value="${escapeHtml(state.workDraft.searchQuery)}" /></label>
      </div>
    </section>` : ""}
    ${renderWorkActionResult()}
    <section class="workflow-list">
      ${results.length === 0 ? workflowEmpty(publicOnly ? "No public search results yet." : "No local search results yet.") : results.map((result) => `
        <article class="workflow-record">
          <span class="status-ok">${escapeHtml(result.module_id)}</span>
          <h3>${escapeHtml(result.title)}</h3>
          <p>${escapeHtml(result.snippet || "No snippet available.")}</p>
          <small>${escapeHtml(result.citation)} - ${escapeHtml(result.status)}</small>
        </article>
      `).join("")}
    </section>
  `;
}

function lifecycleStatusText(value) {
  const labels = {
    "always-installed-with-profile": "Always installed with Townlight Core",
    "profile-selected": "Installed by selected package profile",
    "manifest-versioned": "Updated through the versioned module manifest",
    "not-allowed-required-foundation": "Cannot be disabled because it is the required foundation",
    "allowed-after-backup": "Allowed after a backup is created",
    "backup-first-profile-removal": "Removed only through backup-first profile removal",
    "backup-first-module-data-removal": "Removed only after module data backup"
  };
  return labels[value] || String(value || "").replace(/-/g, " ");
}

function moduleLifecycleItems(module) {
  return [
    ["Install", module.lifecycle_install],
    ["Update", module.lifecycle_update],
    ["Disable", module.lifecycle_disable],
    ["Remove", module.lifecycle_uninstall]
  ]
    .filter(([, value]) => Boolean(value))
    .map(([label, value]) => ({ label, value: lifecycleStatusText(value) }));
}

const MODULE_EXPORTS_AVAILABLE = new Set(["civicrecords-ai", "civicclerk", "civiccode", "civicnotice"]);

function backupHookLabel(hook) {
  const labels = {
    "config": "city setup",
    "Data": "city data",
    "audit-log": "audit log",
    "model-registry": "local model registry",
    "Data/workflows/records": "records workflow history",
    "Data/exports/records": "records exports",
    "Data/files/records": "records files",
    "Data/workflows/meetings": "meeting workflow history",
    "Data/exports/meetings": "meeting exports",
    "Data/files/meetings": "meeting files",
    "Data/workflows/code": "code workflow history",
    "Data/exports/code": "code exports",
    "Data/files/code": "code files",
    "Data/workflows/notice": "notice workflow history",
    "Data/exports/notice": "notice exports",
    "Data/files/notice": "notice proof files"
  };
  return labels[hook] || String(hook || "").replace(/^Data\//, "").replaceAll("/", " ");
}

function renderModuleRow(module, { actions = false } = {}) {
  const proofCount = module.proof_required?.length || 0;
  const lifecycle = moduleLifecycleItems(module);
  const backupHooks = module.backup_restore_hooks || [];
  const disabled = module.installed && module.enabled === false;
  const canToggle = actions && module.installed && !module.required;
  const canInstall = actions && !module.installed && module.selectable && module.contract_ready;
  const canOpenExports = actions && module.installed && MODULE_EXPORTS_AVAILABLE.has(module.id);
  const canUpdate = actions && module.installed;
  const canRemove = actions && module.installed && !module.required;
  const toggleAction = disabled ? "enable-module" : "disable-module";
  const toggleLabel = disabled ? "Enable" : "Disable";
  const actionButtons = [
    canInstall ? ["install-module", "Install"] : null,
    canToggle ? [toggleAction, toggleLabel] : null,
    canOpenExports ? ["open-module-exports", "Open Exports"] : null,
    canUpdate ? ["update-module", "Check Update"] : null,
    canRemove ? ["remove-module", "Remove From Profile"] : null
  ].filter(Boolean);
  const contractParts = [
    module.route_count ? `${module.route_count} route${module.route_count === 1 ? "" : "s"}` : "",
    module.service_count ? `${module.service_count} service${module.service_count === 1 ? "" : "s"}` : "",
    module.task_count ? `${module.task_count} task${module.task_count === 1 ? "" : "s"}` : "",
    module.model_required ? "local AI required" : ""
  ].filter(Boolean);
  return `
    <article class="module-row ${disabled ? "module-disabled" : ""}">
      <div>
        <h3>${escapeHtml(module.display_name)}</h3>
        <p>${escapeHtml(module.role)}</p>
        ${contractParts.length ? `<small>${contractParts.join(" - ")}</small>` : ""}
      </div>
      <div class="module-meta">
        <span class="${moduleStatusClass(module)}">${moduleStatusLabel(module)}</span>
        <small>${escapeHtml(module.version || "No release yet")}${proofCount ? ` - ${proofCount} proof checks` : ""}</small>
        ${backupHooks.length ? `<small><strong>Backup includes:</strong> ${backupHooks.map((hook) => escapeHtml(backupHookLabel(hook))).join(", ")}</small>` : ""}
        ${disabled ? `<small>Data remains installed. Re-enable this module to show its work area.</small>` : ""}
        ${lifecycle.map((item) => `<small><strong>${item.label}:</strong> ${escapeHtml(item.value)}</small>`).join("")}
        ${actionButtons.length ? `
          <div class="module-actions">
            ${actionButtons.map(([action, label]) => `
              <button
                type="button"
                class="secondary-action"
                data-module-action="${action}"
                data-module-id="${escapeHtml(module.id)}"
                aria-label="${label} ${escapeHtml(module.display_name)}"
              >${label}</button>
            `).join("")}
          </div>
        ` : ""}
      </div>
    </article>
  `;
}

function localRoleLabel(role) {
  const labels = {
    "local-admin": "Townlight admin",
    "city-staff": "City staff",
    "clerk": "Clerk staff",
    "records-staff": "Records staff",
    "code-staff": "Code staff"
  };
  return labels[role] || String(role || "").replace(/-/g, " ");
}

function renderLocalUsersCard() {
  const users = state.app.users || [];
  return `
    <div class="workflow-form">
      <h3>Local Users</h3>
      <div class="mini-list">
        ${users.length === 0 ? `<p class="empty-note">Create the first admin before adding staff users.</p>` : users.map((user) => `
          <article class="mini-record">
            <div>
              <strong>${escapeHtml(user.display_name || user.email)}</strong>
              <small>${escapeHtml(user.email)} - ${escapeHtml(localRoleLabel(user.role))}</small>
            </div>
            <div class="module-meta">
              <span class="${user.status === "Active" ? "status-ok" : "status-warn"}">${escapeHtml(user.status || "Active")}</span>
              ${user.role !== "local-admin" ? `
                ${user.status === "Active" ? `
                  <button
                    type="button"
                    class="secondary-action"
                    data-auth-action="deactivate-user"
                    data-user-email="${escapeHtml(user.email)}"
                    aria-label="Disable ${escapeHtml(user.display_name || user.email)}"
                  >Disable</button>
                ` : `
                  <button
                    type="button"
                    class="secondary-action"
                    data-auth-action="reactivate-user"
                    data-user-email="${escapeHtml(user.email)}"
                    aria-label="Enable ${escapeHtml(user.display_name || user.email)}"
                  >Enable</button>
                `}
                <button
                  type="button"
                  class="secondary-action"
                  data-auth-action="reset-user-passcode"
                  data-user-email="${escapeHtml(user.email)}"
                  aria-label="Reset passcode for ${escapeHtml(user.display_name || user.email)}"
                >Reset Passcode</button>
              ` : ""}
            </div>
          </article>
        `).join("")}
      </div>
      <label>Staff name <input type="text" data-user-field="userName" value="${escapeHtml(state.accessDraft.userName)}" autocomplete="name" /></label>
      <label>Staff email <input type="email" data-user-field="userEmail" value="${escapeHtml(state.accessDraft.userEmail)}" autocomplete="email" /></label>
      <label>Role
        <select data-user-field="userRole">
          ${["city-staff", "clerk", "records-staff", "code-staff"].map((role) => `
            <option value="${role}" ${state.accessDraft.userRole === role ? "selected" : ""}>${localRoleLabel(role)}</option>
          `).join("")}
        </select>
      </label>
      <label>Temporary local passcode <input type="password" data-user-field="userPasscode" value="${escapeHtml(state.accessDraft.userPasscode)}" autocomplete="new-password" /></label>
      <small>Staff users can sign in on this Windows profile. Enter a temporary passcode, then use Reset Passcode on a staff row if someone is locked out. Townlight admins keep setup, runtime, backup, module, and user-management control.</small>
      <button type="button" class="secondary-action" data-auth-action="create-user">Create Staff User</button>
      ${renderAuthActionResult()}
    </div>
  `;
}

const GUIDED_MODULE_ACTIONS = new Set([
  "install-module",
  "enable-module",
  "disable-module",
  "update-module",
  "remove-module"
]);

function moduleForReview(moduleId) {
  return state.app.modules.find((module) => module.id === moduleId) || null;
}

function guidedModuleReviewForAction(action, moduleId) {
  const module = moduleForReview(moduleId);
  if (!module) return null;
  const moduleName = module.display_name || module.id;
  const version = module.version || "No release version";
  const common = {
    module: "Module Manager",
    subject: moduleName,
    sources: [
      `Module id: ${module.id}`,
      `Pinned version: ${version}`,
      `Townlight Core requirement: ${module.civiccore_requirement || "Townlight Core foundation"}`
    ]
  };
  const reviews = {
    "install-module": {
      title: `Review Before Installing ${moduleName}`,
      confirmLabel: "Install Module",
      status: "Profile install requested",
      changes: "Adds this ready module to the active local profile and enables its work area when dependencies are enabled.",
      visibility: "Townlight admin only. Staff will see the module work area after the profile is saved.",
      audit: "Updates the local module-selection record and keeps the action in the profile history.",
      retry: "If dependencies or proof gates are missing, the module is not installed and the current profile remains unchanged."
    },
    "enable-module": {
      title: `Review Before Enabling ${moduleName}`,
      confirmLabel: "Enable Module",
      status: "Module enable requested",
      changes: "Shows this installed module's work area again and allows its city-work actions.",
      visibility: "Townlight admin only. Staff with access will see the module after it is enabled.",
      audit: "Updates the local enabled-module list without changing existing module data.",
      retry: "If a dependency is disabled, Townlight reports the dependency and leaves the module disabled."
    },
    "disable-module": {
      title: `Review Before Disabling ${moduleName}`,
      confirmLabel: "Disable Module",
      status: "Module disable requested",
      changes: "Hides this module's work area and blocks its city-work actions. Existing module data remains installed.",
      visibility: "Townlight admin only. Staff will no longer see this module while it is disabled.",
      audit: "Updates the local enabled-module list without deleting records, exports, or settings.",
      retry: "If another enabled module depends on it, Townlight reports that dependency before changing the profile."
    },
    "update-module": {
      title: `Review Before Checking ${moduleName} Updates`,
      confirmLabel: "Check Update",
      status: "Manifest update check requested",
      changes: "Checks this module against the pinned versioned manifest. This does not download unverified code.",
      visibility: "Townlight admin only. Staff workflows remain available while the check runs.",
      audit: "Returns the current module version state from the local module manifest.",
      retry: "If the module is not installed, Townlight asks you to install it before update checks."
    },
    "remove-module": {
      title: `Review Before Removing ${moduleName} From Profile`,
      confirmLabel: "Remove From Profile",
      status: "Profile removal requested",
      changes: "Creates a verified local profile backup, removes this module from the active profile, and hides its work area. Existing module data is not deleted.",
      visibility: "Townlight admin only. Staff will not see this module until it is installed again.",
      audit: "Writes a backup manifest before updating the local module-selection record; preserved module data remains covered by profile backup and restore.",
      retry: "If backup creation fails or another installed module depends on it, Townlight reports the issue before changing the profile."
    }
  };
  const review = reviews[action];
  return review ? { ...common, ...review } : null;
}

function requiresGuidedModuleReview(action) {
  return GUIDED_MODULE_ACTIONS.has(action);
}

function renderGuidedModuleReview() {
  const review = guidedModuleReviewForAction(state.pendingModuleReviewAction, state.pendingModuleReviewId);
  if (!review) return "";
  return `
    <section class="guided-review" data-guided-review="module" aria-labelledby="module-review-title">
      <div>
        <p class="eyebrow">${escapeHtml(review.module)}</p>
        <h3 id="module-review-title">${escapeHtml(review.title)}</h3>
        <dl class="review-grid">
          <div>
            <dt>Subject</dt>
            <dd>${escapeHtml(review.subject)}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>${escapeHtml(review.status)}</dd>
          </div>
          <div>
            <dt>What will change</dt>
            <dd>${escapeHtml(review.changes)}</dd>
          </div>
          <div>
            <dt>Who can see it</dt>
            <dd>${escapeHtml(review.visibility)}</dd>
          </div>
          <div>
            <dt>Sources and evidence</dt>
            <dd>${review.sources.map((source) => `<span>${escapeHtml(source)}</span>`).join("")}</dd>
          </div>
          <div>
            <dt>Audit trail</dt>
            <dd>${escapeHtml(review.audit)}</dd>
          </div>
          <div>
            <dt>Failure and retry</dt>
            <dd>${escapeHtml(review.retry)}</dd>
          </div>
        </dl>
        <button
          type="button"
          class="primary-action"
          data-module-review-confirm="${state.pendingModuleReviewAction}"
          data-module-id="${escapeHtml(state.pendingModuleReviewId)}"
        >Confirm ${escapeHtml(review.confirmLabel)}</button>
        <button type="button" class="secondary-action" data-module-review-cancel>Cancel Review</button>
      </div>
    </section>
  `;
}

function runtimeServiceForReview(serviceId) {
  return (state.app.health || []).find((item) => item.id === serviceId) || null;
}

function guidedSupervisorReviewForAction(action, serviceId) {
  const service = runtimeServiceForReview(serviceId);
  const serviceLabel = service?.label || "selected local service";
  const serviceStatus = service ? `${service.status}: ${service.message}` : "Whole local profile action";
  const reviews = {
    "backup": {
      title: "Review Before Backing Up Local Profile",
      confirmLabel: "Backup Now",
      module: "Townlight Core local runtime",
      subject: "Townlight city profile",
      status: "Manual backup requested",
      changes: "Copies local city data and configuration to the configured backup folder with a backup manifest.",
      visibility: "Townlight admin only. This does not publish or change public civic records.",
      sources: [
        "Source: local Townlight Data and config folders.",
        "Destination: configured Townlight backup folder."
      ],
      audit: "Creates a local backup manifest with file hashes for restore/reinstall recovery.",
      retry: "If the backup folder cannot be written, the desktop app reports the error and leaves city data unchanged."
    },
    "restore": {
      title: "Review Before Restoring Latest Backup",
      confirmLabel: "Restore Latest Backup",
      module: "Townlight Core local runtime",
      subject: "Latest local Townlight backup",
      status: "Restore requested",
      changes: "Creates a pre-restore safety backup, stops local services, and replaces local data/config from the latest backup manifest.",
      visibility: "Townlight admin only. Restored records affect what staff see after restart.",
      sources: [
        "Source: latest backup-manifest.json in the Townlight backup folder.",
        "Safety: a pre-restore backup is created before replacement."
      ],
      audit: "Creates a pre-restore backup manifest and returns a restore action result.",
      retry: "If no valid backup exists, restore stops before changing the local profile."
    },
    "uninstall": {
      title: "Review Before Preparing Uninstall",
      confirmLabel: "Prepare Uninstall",
      module: "Townlight Core local runtime",
      subject: "Local Townlight city profile",
      status: "Profile removal requested",
      changes: "Stops local services, creates a final uninstall backup, and removes local data and setup/config state.",
      visibility: "Townlight admin only. Program files remain for the Windows uninstall entry to remove.",
      sources: [
        "Source: local Townlight Data and config folders.",
        "Safety: final-uninstall backup is written before profile removal."
      ],
      audit: "Creates a final uninstall backup manifest and returns an uninstall action result.",
      retry: "If the final backup fails, uninstall stops before removing the profile. After preparation succeeds, use Open Windows Uninstall to remove program files from Installed apps."
    },
    "support-bundle": {
      title: "Review Before Creating Support Bundle",
      confirmLabel: "Create Support Bundle",
      module: "Townlight Core local runtime",
      subject: service ? serviceLabel : "Selected local runtime services",
      status: serviceStatus,
      changes: "Creates a local support bundle with health, runtime-state, and selected service logs.",
      visibility: "Townlight admin only. The bundle does not copy city records, uploaded documents, backups, or local secrets.",
      sources: [
        service ? `Service id: ${service.id}` : "All local runtime services.",
        "Source: System Health checks, runtime service state, and local service log files."
      ],
      audit: "Creates a support-manifest.json with SHA-256 hashes for the bundle files.",
      retry: "If the support bundle folder cannot be written, the desktop app reports the error and leaves city data unchanged."
    },
    "repair": {
      title: `Review Before Repairing ${serviceLabel}`,
      confirmLabel: "Repair",
      module: "Townlight Core local runtime",
      subject: serviceLabel,
      status: serviceStatus,
      changes: "Rechecks portable runtime files and repairs the selected local service setup where possible.",
      visibility: "Townlight admin only. This may change local service files but does not publish civic records.",
      sources: [
        service ? `Service id: ${service.id}` : "No service selected yet.",
        service?.next_action || "System Health will report the next repair step."
      ],
      audit: "Returns a repair action result and updates local runtime service state.",
      retry: "If required bundled files are missing, repair reports the missing payload and leaves the service state clear."
    },
    "stop": {
      title: `Review Before Stopping ${serviceLabel}`,
      confirmLabel: "Stop",
      module: "Townlight Core local runtime",
      subject: serviceLabel,
      status: serviceStatus,
      changes: "Stops the selected local service state so it can be restarted or repaired.",
      visibility: "Townlight admin only. Staff workflows may be unavailable until services restart.",
      sources: [
        service ? `Service id: ${service.id}` : "No service selected yet.",
        "System Health remains available after the stop action."
      ],
      audit: "Returns a stop action result and updates local runtime service state.",
      retry: "If the service is already stopped, the desktop app keeps the profile available for health checks."
    }
  };
  return reviews[action] || null;
}

function requiresGuidedSupervisorReview(action) {
  return GUIDED_SUPERVISOR_ACTIONS.has(action);
}

function renderGuidedSupervisorReview() {
  const review = guidedSupervisorReviewForAction(
    state.pendingSupervisorReviewAction,
    state.pendingSupervisorReviewServiceId
  );
  if (!review) return "";
  const serviceAttr = state.pendingSupervisorReviewServiceId ? ` data-service-id="${escapeHtml(state.pendingSupervisorReviewServiceId)}"` : "";
  const adminLocked = adminOnlyControlLocked();
  const adminDisabled = adminLocked ? "disabled" : "";
  const lockMessage = adminOnlyLockMessage("Sign in as Townlight admin to use local lifecycle actions.");
  return `
    <section class="guided-review" data-guided-review="supervisor" aria-labelledby="supervisor-review-title">
      <div>
        <p class="eyebrow">${escapeHtml(review.module)}</p>
        <h3 id="supervisor-review-title">${escapeHtml(review.title)}</h3>
        <p>${escapeHtml(review.subject)}</p>
      </div>
      <div class="review-grid">
        <div>
          <strong>Current status</strong>
          <p>${escapeHtml(review.status)}</p>
        </div>
        <div>
          <strong>What will change</strong>
          <p>${escapeHtml(review.changes)}</p>
        </div>
        <div>
          <strong>Who can see it</strong>
          <p>${escapeHtml(review.visibility)}</p>
        </div>
        <div>
          <strong>Audit trail</strong>
          <p>${escapeHtml(review.audit)}</p>
        </div>
      </div>
      <div>
        <strong>Sources and evidence</strong>
        <ul class="review-evidence">
          ${review.sources.map((source) => `<li>${escapeHtml(source)}</li>`).join("")}
        </ul>
      </div>
      <p class="next-action">${escapeHtml(review.retry)}</p>
      <div class="review-actions">
        <button type="button" class="primary-action" data-supervisor-review-confirm="${state.pendingSupervisorReviewAction}"${serviceAttr} ${adminDisabled}>Confirm ${escapeHtml(review.confirmLabel)}</button>
        <button type="button" class="secondary-action" data-supervisor-review-cancel>Cancel Review</button>
        ${lockMessage ? `<small>${lockMessage}</small>` : ""}
      </div>
    </section>
  `;
}

function renderProfileRow(profile) {
  return `
    <article class="module-row">
      <div>
        <h3>${escapeHtml(profile.label)}</h3>
        <p>${escapeHtml(profile.description)}</p>
        <small>${profile.module_count} module${profile.module_count === 1 ? "" : "s"}</small>
      </div>
      <div class="module-meta">
        <span class="${profileStatusClass(profile)}">${profileStatusLabel(profile)}</span>
        ${profile.disabled ? `<small>${escapeHtml(profile.disabled_reason || "Held until package proof is available.")}</small>` : ""}
      </div>
    </article>
  `;
}

function renderModules() {
  const installed = state.app.modules.filter((module) => module.installed || module.required);
  const catalog = state.app.modules.filter((module) => !module.installed && !module.required);
  const profiles = state.app.module_profiles || [];
  const selection = state.app.module_selection || fallbackState.module_selection;
  const enabledCount = (selection.enabled_module_ids || installed.filter((module) => module.enabled !== false).map((module) => module.id)).length;
  const admin = (state.app.users || [])[0];
  const moduleSelectionLocked =
    state.moduleDraft.profileId === "custom" && customSelectedModuleIds().length === 0;
  return `
    <section class="page-heading">
      <p class="eyebrow">Settings</p>
      <h2>Settings</h2>
      <p>The module manager shares this screen with the local city profile, first admin, and installed Townlight product profile on this Windows machine.</p>
    </section>
    <section class="workflow-editor" data-setup-context="settings">
      <div class="workflow-form">
        <h3>City Profile</h3>
        <label>City name <input type="text" data-setup-field="cityName" value="${escapeHtml(state.setupDraft.cityName)}" autocomplete="organization" /></label>
        <label>State <input type="text" data-setup-field="state" value="${escapeHtml(state.setupDraft.state)}" autocomplete="address-level1" /></label>
        <label>Time zone <input type="text" data-setup-field="timeZone" value="${escapeHtml(state.setupDraft.timeZone)}" /></label>
        <label>Records contact <input type="email" data-setup-field="recordsContact" value="${escapeHtml(state.setupDraft.recordsContact)}" autocomplete="email" /></label>
        <label>Clerk contact <input type="email" data-setup-field="clerkContact" value="${escapeHtml(state.setupDraft.clerkContact)}" autocomplete="email" /></label>
        <button type="button" class="primary-action" data-first-run-action="create-city-profile" data-step-id="city-profile">Save City Profile</button>
      </div>
      <div class="workflow-form">
        <h3>First Admin</h3>
        <label>Admin name <input type="text" data-setup-field="adminName" value="${escapeHtml(state.setupDraft.adminName)}" autocomplete="name" /></label>
        <label>Admin email <input type="email" data-setup-field="adminEmail" value="${escapeHtml(state.setupDraft.adminEmail)}" autocomplete="email" /></label>
        <label>Townlight passcode <input type="password" data-setup-field="adminPasscode" value="${escapeHtml(state.setupDraft.adminPasscode)}" autocomplete="new-password" /></label>
        <div class="module-meta">
          <span class="${admin ? "status-ok" : "status-warn"}">${admin ? escapeHtml(admin.role) : "Needed"}</span>
        </div>
        <button type="button" class="secondary-action" data-first-run-action="create-admin" data-step-id="first-admin">Save First Admin</button>
      </div>
      ${renderLocalUsersCard()}
      <div class="workflow-form">
        <h3>Local Folders</h3>
        <label>App install folder <input type="text" data-setup-field="installRoot" value="${escapeHtml(state.setupDraft.installRoot)}" autocomplete="off" readonly /></label>
        ${renderFolderPathField("City data folder", "dataRoot", state.setupDraft.dataRoot, "C:/Townlight/Data")}
        ${renderFolderPathField("Backup folder", "backupRoot", state.setupDraft.backupRoot, "D:/Townlight/Backups")}
        <small>The Windows installer owns the app folder. This screen controls local city data and backups.</small>
        <button type="button" class="secondary-action" data-first-run-action="choose-location" data-step-id="locations">Save Local Folders</button>
      </div>
    </section>
    ${renderActionResult()}
    ${renderGuidedModuleReview()}
    <section class="page-heading compact-heading">
      <p class="eyebrow">Module Manager</p>
      <h2>Townlight Modules</h2>
      <p>Townlight Core stays installed. Product modules can be installed, updated, enabled, disabled, or removed from this profile without silently deleting their local data.</p>
    </section>
    <section class="section-band">
      <div class="section-title">
        <h3>Choose Product Modules</h3>
        <p>Townlight Records is the public-beta profile. City Core and custom selections remain available and always keep Townlight Core installed.</p>
      </div>
      ${renderModuleSelectionControls()}
      <div class="setup-actions">
        <button type="button" class="primary-action" data-first-run-action="select-modules" data-step-id="modules" ${moduleSelectionLocked ? "disabled" : ""}>
          Apply Module Selection
        </button>
        ${moduleSelectionLocked ? `<small>Select at least one ready product module for a custom profile.</small>` : ""}
      </div>
    </section>
    <section class="module-columns">
      <div>
        <div class="section-title">
          <h3>Installed Product Profile</h3>
          <p>Installed for the ${escapeHtml(selection.profile_label)} local profile. Disabled modules stay installed and can be re-enabled here.</p>
        </div>
        <div class="empty-note">
          Selected profile: ${escapeHtml(selection.profile_label)}. Installed modules: ${selection.installed_module_ids.length}. Enabled modules: ${enabledCount}.
        </div>
        <div class="module-list">${installed.map((module) => renderModuleRow(module, { actions: true })).join("")}</div>
      </div>
      <div>
        <div class="section-title">
          <h3>Package Profiles</h3>
          <p>Profiles come from the same module manifest the installer uses.</p>
        </div>
        <div class="module-list">${profiles.map(renderProfileRow).join("")}</div>
      </div>
      <div>
        <div class="section-title">
          <h3>Module Catalog</h3>
          <p>Future modules keep their dependency, lifecycle, backup, service, and proof contract here before they can join an install profile.</p>
        </div>
        <div class="module-list">${catalog.map((module) => renderModuleRow(module, { actions: true })).join("")}</div>
      </div>
    </section>
  `;
}

function renderHealth() {
  const adminLocked = adminOnlyControlLocked();
  const adminDisabled = adminLocked ? "disabled" : "";
  const lockMessage = adminOnlyLockMessage("Sign in as Townlight admin to use local lifecycle actions.");
  return `
    <section class="page-heading">
      <p class="eyebrow">IT/Admin</p>
      <h2>System Health</h2>
      <p>Plain-English local health first. Technical logs stay behind repair detail screens.</p>
    </section>
    ${renderGuidedSupervisorReview()}
    ${renderModelReadiness()}
    <section class="section-band lifecycle-panel" aria-label="Local lifecycle actions">
      <div class="section-title">
        <p class="eyebrow">Local profile lifecycle</p>
        <h3>Backup, Restore, Uninstall</h3>
        <p>These actions work on the local Townlight city profile. Uninstall creates a final backup before removing local data and setup state.</p>
      </div>
      <div class="health-actions lifecycle-actions">
        <button type="button" class="secondary-action" data-supervisor-action="backup" ${adminDisabled}>Backup Now</button>
        <button type="button" class="secondary-action" data-supervisor-action="open-backup-folder" ${adminDisabled}>Open Backup Folder</button>
        <button type="button" class="secondary-action" data-supervisor-action="support-bundle" ${adminDisabled}>Create Support Bundle</button>
        <button type="button" class="secondary-action" data-supervisor-action="restore" ${adminDisabled}>Restore Latest Backup</button>
        <button type="button" class="secondary-action" data-supervisor-action="uninstall" ${adminDisabled}>Prepare Uninstall</button>
        <button type="button" class="secondary-action" data-supervisor-action="open-windows-uninstall" ${adminDisabled}>Open Windows Uninstall</button>
        ${lockMessage ? `<small>${lockMessage}</small>` : ""}
      </div>
    </section>
    <section class="health-grid">
      ${state.app.health.map((item) => `
        <article class="health-card">
          <span class="${item.ok ? "status-ok" : "status-warn"}">${escapeHtml(item.status || (item.ok ? "OK" : "Needs setup"))}</span>
          <h3>${escapeHtml(item.label)}</h3>
          <p>${escapeHtml(item.message)}</p>
          ${item.next_action ? `<p class="next-action"><strong>Next:</strong> ${escapeHtml(item.next_action)}</p>` : ""}
          ${item.admin_detail ? `<small>${escapeHtml(item.admin_detail)}</small>` : ""}
          ${item.actionable !== false && item.id !== "desktop-shell" ? `
            <div class="health-actions" aria-label="${escapeHtml(item.label)} actions">
              <button type="button" class="secondary-action" data-supervisor-action="health" data-service-id="${escapeHtml(item.id)}" ${adminDisabled}>Check</button>
              <button type="button" class="secondary-action" data-supervisor-action="install" data-service-id="${escapeHtml(item.id)}" ${adminDisabled}>Install</button>
              <button type="button" class="secondary-action" data-supervisor-action="start" data-service-id="${escapeHtml(item.id)}" ${adminDisabled}>Start</button>
              <button type="button" class="secondary-action" data-supervisor-action="repair" data-service-id="${escapeHtml(item.id)}" ${adminDisabled}>Repair</button>
              <button type="button" class="secondary-action" data-supervisor-action="logs" data-service-id="${escapeHtml(item.id)}" ${adminDisabled}>Logs</button>
              <button type="button" class="secondary-action" data-supervisor-action="support-bundle" data-service-id="${escapeHtml(item.id)}" ${adminDisabled}>Support Bundle</button>
              <button type="button" class="secondary-action" data-supervisor-action="stop" data-service-id="${escapeHtml(item.id)}" ${adminDisabled}>Stop</button>
            </div>
          ` : ""}
        </article>
      `).join("")}
    </section>
    ${renderSupervisorActionResult()}
    ${renderFirstRunWizard()}
  `;
}

function renderActiveArea() {
  const access = accessState();
  if (state.activeArea !== "home" && access.configured && !access.signed_in && !isPublicReadableArea()) {
    return renderAccessPanel();
  }
  if (state.activeArea === "settings" && access.configured && access.role !== "local-admin") {
    return renderAccessPanel();
  }
  switch (state.activeArea) {
    case "meetings":
      return renderMeetingsWorkflow();
    case "records":
      return renderRecordsWorkflow();
    case "code":
      return renderCodeWorkflow();
    case "notice":
      return renderNoticeWorkflow();
    case "access":
      return renderAccessibilityWorkflow();
    case "search":
      return renderSearchWorkflow();
    case "health":
      return renderHealth();
    case "settings":
      return renderModules();
    default:
      return renderHome();
  }
}

function renderAuditDrawer() {
  const entries = cityWork().audit_entries || [];
  const publications = cityWork().publication_events || [];
  return `
    <aside class="audit-drawer ${state.auditOpen ? "open" : ""}" aria-hidden="${!state.auditOpen}">
      <div class="section-title">
        <h2>Audit Trail</h2>
        <p>Local workflow actions and public publication gates record module, action, hash, time, and summary in the Windows data profile.</p>
      </div>
      <h3>Publication Gates</h3>
      ${publications.length === 0 ? `
        <div class="audit-entry">
          <span class="status-muted">No publications</span>
          <p>No human-approved public records have been published yet.</p>
        </div>
      ` : publications.slice(0, 8).map((event) => `
        <div class="audit-entry">
          <span class="${event.retracted_at_unix_seconds ? "status-warn" : "status-ok"}">${escapeHtml(event.source_module)}</span>
          <p><strong>${escapeHtml(event.record_type)}</strong></p>
          <p>${event.retracted_at_unix_seconds ? "Retracted" : "Published"} record ${escapeHtml(event.source_record_id)}</p>
          <small>Payload hash ${(event.payload_hash || "pending").slice(0, 12)}</small>
          <small>${new Date(event.published_at_unix_seconds * 1000).toLocaleString()}</small>
        </div>
      `).join("")}
      <h3>Workflow Actions</h3>
      ${entries.length === 0 ? `
        <div class="audit-entry">
          <span class="status-muted">No entries</span>
          <p>No local workflow actions have been recorded yet.</p>
        </div>
      ` : entries.slice(0, 12).map((entry) => `
        <div class="audit-entry">
          <span class="status-ok">${escapeHtml(entry.module_id)}</span>
          <p><strong>${escapeHtml(entry.action)}</strong></p>
          <p>${escapeHtml(entry.summary)}</p>
          <small>${new Date(entry.created_at_unix_seconds * 1000).toLocaleString()}</small>
          ${entry.entry_hash ? `<small>Audit hash ${entry.entry_hash.slice(0, 12)}${entry.previous_hash ? `; previous ${entry.previous_hash.slice(0, 12)}` : ""}</small>` : ""}
        </div>
      `).join("")}
    </aside>
  `;
}

function renderStateLoadError(message) {
  return `
    <section class="section-band error-band" role="alert" aria-live="assertive">
      <h2>Townlight could not open your saved city data</h2>
      <p>Your data may exist on this machine but could not be read. This can
         happen after an interrupted save or if Townlight is already open in
         another window. Your records were <strong>not</strong> deleted.</p>
      <pre class="error-detail">${escapeHtml(message)}</pre>
      <button type="button" data-action="retry-load-state">Retry</button>
      <p class="muted">If this repeats, close any other Townlight window, then
         use Repair / Restore from a backup in System Health. Do not complete
         first-run setup — that is only for a brand-new install.</p>
    </section>`;
}

function render() {
  if (state.appLoadError) {
    byId("app").innerHTML = renderStateLoadError(state.appLoadError);
    byId("app").querySelector("[data-action='retry-load-state']")
      ?.addEventListener("click", async () => {
        await loadAppState();
        render();
      });
  } else {
    if (!areaIsEnabled(state.activeArea)) {
      state.activeArea = "settings";
    }
    byId("app").innerHTML = `
      ${renderTopbar()}
      <div class="layout">
        ${renderNav()}
        <main id="main-content" tabindex="-1">${renderActiveArea()}</main>
        ${renderAuditDrawer()}
      </div>
    `;
    bindEvents();
    maybeAdvanceFirstRunFocus();
  }
  // GauntletGate round-7 (W-1, extended per W7-4): every render() call
  // replaces #app's entire subtree, which drops focus to <body> as a side
  // effect of the DOM swap itself -- app-wide, at all ~36 call sites,
  // including the appLoadError branch above, not just civicaccess. One
  // shared tail check covers both branches instead of patching each one.
  // maybeAdvanceFirstRunFocus() above defers its own focus-move via
  // requestAnimationFrame, so this synchronous check still runs first; its
  // RAF callback checks `el.contains(active)` where el is a descendant of
  // #main-content, so focusing #main-content here doesn't block it from
  // correctly stealing focus to the real wizard field one frame later.
  if (document.activeElement === document.body) {
    (byId("main-content") ?? byId("app").querySelector("[data-action='retry-load-state']"))
      ?.focus({ preventScroll: true });
  }
}

function bindEvents() {
  document.querySelectorAll("[data-area]").forEach((button) => {
    button.addEventListener("click", () => {
      if (!areaIsEnabled(button.dataset.area)) return;
      state.activeArea = button.dataset.area;
      state.pendingWorkReviewAction = null;
      state.pendingSupervisorReviewAction = null;
      state.pendingSupervisorReviewServiceId = null;
      state.pendingModuleReviewAction = null;
      state.pendingModuleReviewId = null;
      render();
    });
  });
  document.querySelectorAll("[data-surface]").forEach((button) => {
    button.addEventListener("click", () => {
      state.activeSurface = button.dataset.surface;
      state.pendingWorkReviewAction = null;
      state.pendingSupervisorReviewAction = null;
      state.pendingSupervisorReviewServiceId = null;
      state.pendingModuleReviewAction = null;
      state.pendingModuleReviewId = null;
      render();
    });
  });
  byId("audit-toggle")?.addEventListener("click", () => {
    state.auditOpen = !state.auditOpen;
    render();
  });
  document.querySelectorAll("[data-setup-field]").forEach((input) => {
    input.addEventListener("input", () => {
      state.setupDraft[input.dataset.setupField] = input.value;
    });
  });
  document.querySelectorAll("[data-module-profile-id]").forEach((input) => {
    input.addEventListener("change", () => {
      state.moduleDraft.profileId = input.dataset.moduleProfileId;
      state.pendingModuleReviewAction = null;
      state.pendingModuleReviewId = null;
      if (Object.hasOwn(PRODUCT_MODULE_IDS_BY_PROFILE, state.moduleDraft.profileId)) {
        state.moduleDraft.selectedModuleIds = [...PRODUCT_MODULE_IDS_BY_PROFILE[state.moduleDraft.profileId]];
      }
      render();
    });
  });
  document.querySelectorAll("[data-module-toggle]").forEach((input) => {
    input.addEventListener("change", () => {
      const moduleId = input.dataset.moduleToggle;
      const selectedIds = new Set(state.moduleDraft.selectedModuleIds);
      if (input.checked) {
        selectedIds.add(moduleId);
      } else {
        selectedIds.delete(moduleId);
      }
      state.moduleDraft.profileId = "custom";
      state.moduleDraft.selectedModuleIds = Array.from(selectedIds);
      state.pendingModuleReviewAction = null;
      state.pendingModuleReviewId = null;
      render();
    });
  });
  document.querySelectorAll("[data-module-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      await handleModuleAction(button.dataset.moduleAction, button.dataset.moduleId);
    });
  });
  document.querySelectorAll("[data-module-review-confirm]").forEach((button) => {
    button.addEventListener("click", async () => {
      await handleModuleAction(button.dataset.moduleReviewConfirm, button.dataset.moduleId, { confirmed: true });
    });
  });
  document.querySelectorAll("[data-module-review-cancel]").forEach((button) => {
    button.addEventListener("click", () => {
      state.pendingModuleReviewAction = null;
      state.pendingModuleReviewId = null;
      render();
    });
  });
  document.querySelectorAll("[data-first-run-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      await handleFirstRunAction(button.dataset.firstRunAction, button.dataset.stepId);
    });
  });
  document.querySelectorAll("[data-access-field]").forEach((input) => {
    input.addEventListener("input", () => {
      state.accessDraft[input.dataset.accessField] = input.value;
    });
  });
  document.querySelectorAll("[data-user-field]").forEach((input) => {
    const syncUserField = () => {
      state.accessDraft[input.dataset.userField] = input.value;
    };
    input.addEventListener("input", syncUserField);
    input.addEventListener("change", syncUserField);
  });
  document.querySelectorAll("[data-auth-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      await handleAuthAction(button.dataset.authAction, button.dataset.userEmail ? { userEmail: button.dataset.userEmail } : null);
    });
  });
  document.querySelectorAll("[data-model-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      await handleModelAction(button.dataset.modelAction);
    });
  });
  document.querySelectorAll("[data-supervisor-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      await handleSupervisorAction(button.dataset.supervisorAction, button.dataset.serviceId);
    });
  });
  document.querySelectorAll("[data-file-path-field]").forEach((button) => {
    button.addEventListener("click", async () => {
      await handleChooseFilePath(button.dataset.filePathField);
    });
  });
  document.querySelectorAll("[data-folder-path-field]").forEach((button) => {
    button.addEventListener("click", async () => {
      await handleChooseFolderPath(button.dataset.folderPathField);
    });
  });
  document.querySelectorAll("[data-supervisor-review-confirm]").forEach((button) => {
    button.addEventListener("click", async () => {
      await handleSupervisorAction(button.dataset.supervisorReviewConfirm, button.dataset.serviceId, { confirmed: true });
    });
  });
  document.querySelectorAll("[data-supervisor-review-cancel]").forEach((button) => {
    button.addEventListener("click", () => {
      state.pendingSupervisorReviewAction = null;
      state.pendingSupervisorReviewServiceId = null;
      render();
    });
  });
  document.querySelectorAll("[data-work-field]").forEach((input) => {
    const syncWorkField = () => {
      state.workDraft[input.dataset.workField] = input.type === "checkbox" ? input.checked : input.value;
      if (["searchQuery", "codeQuestion"].includes(input.dataset.workField)) {
        state.searchResults = [];
      }
    };
    input.addEventListener("input", syncWorkField);
    input.addEventListener("change", syncWorkField);
  });
  document.querySelectorAll("[data-select-work-record]").forEach((button) => {
    button.addEventListener("click", () => {
      const key = `${button.dataset.selectWorkRecord}Id`;
      state.workSelection[key] = button.dataset.recordId;
      if (button.dataset.parentMeetingId) {
        state.workSelection.meetingId = button.dataset.parentMeetingId;
      }
      state.pendingWorkReviewAction = null;
      render();
    });
  });
  document.querySelectorAll("[data-work-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      const overridePayloadJson = button.dataset.actionPayload;
      let overridePayload = null;
      if (overridePayloadJson) {
        try {
          overridePayload = JSON.parse(overridePayloadJson);
        } catch (parseError) {
          console.warn("Ignoring malformed data-action-payload", {
            action: button.dataset.workAction,
            payload: overridePayloadJson,
            error: parseError && parseError.message
          });
          overridePayload = null;
        }
      }
      if (button.dataset.workAction === "civicaccess-delete-review" && overridePayload) {
        // Row-scoped action with no form binding: remember which review is
        // targeted so it survives into the guided-review confirm step, which
        // (like every other GUIDED_WORK_ACTIONS entry) re-derives its payload
        // from state rather than from this click's overridePayload.
        state.workSelection.accessDeleteReviewId = overridePayload.reviewId || "";
      }
      await handleCityWorkAction(button.dataset.workAction, { overridePayload });
    });
  });
  document.querySelectorAll("[data-review-confirm]").forEach((button) => {
    button.addEventListener("click", async () => {
      await handleCityWorkAction(button.dataset.reviewConfirm, { confirmed: true });
    });
  });
  document.querySelectorAll("[data-review-cancel]").forEach((button) => {
    button.addEventListener("click", () => {
      state.pendingWorkReviewAction = null;
      state.workSelection.accessDeleteReviewId = "";
      render();
    });
  });
  document.querySelectorAll("[data-access-reviews-show-all]").forEach((button) => {
    button.addEventListener("click", () => {
      state.accessReviewsShowAll = button.dataset.accessReviewsShowAll === "1";
      render();
    });
  });
}

function setupPayloadForStep(stepId) {
  if (stepId === "locations") {
    return {
      installRoot: state.setupDraft.installRoot,
      dataRoot: state.setupDraft.dataRoot,
      backupRoot: state.setupDraft.backupRoot
    };
  }
  if (stepId === "city-profile") {
    return {
      cityName: state.setupDraft.cityName,
      state: state.setupDraft.state,
      timeZone: state.setupDraft.timeZone,
      recordsContact: state.setupDraft.recordsContact,
      clerkContact: state.setupDraft.clerkContact
    };
  }
  if (stepId === "first-admin") {
    return {
      adminName: state.setupDraft.adminName,
      adminEmail: state.setupDraft.adminEmail,
      adminPasscode: state.setupDraft.adminPasscode
    };
  }
  if (stepId === "modules") {
    return moduleSelectionPayload();
  }
  if (stepId === "backup") {
    return {
      installRoot: state.setupDraft.installRoot,
      dataRoot: state.setupDraft.dataRoot,
      backupRoot: state.setupDraft.backupRoot
    };
  }
  return {};
}

// Maps first-run field keys (as they appear in server error strings) to the
// label the clerk actually sees on screen, so a save failure names the real field.
const FIRST_RUN_FIELD_LABELS = {
  cityName: "City name",
  state: "State",
  timeZone: "Time zone",
  recordsContact: "Records contact",
  clerkContact: "Clerk contact",
  adminName: "Admin name",
  adminEmail: "Admin email",
  adminPasscode: "Townlight passcode",
  installRoot: "App install folder",
  dataRoot: "City data folder",
  backupRoot: "Backup folder"
};

function friendlyFirstRunError(error) {
  const raw = String(error);
  const missing = raw.match(/Missing required setup field:\s*(\w+)/i);
  if (missing) {
    const label = FIRST_RUN_FIELD_LABELS[missing[1]] || missing[1];
    return {
      message: `${label} is required.`,
      next_action: `Enter a value for ${label}, then save.`
    };
  }
  return { message: raw, next_action: "Correct the setup information and try again." };
}

async function handleFirstRunAction(action, stepId) {
  if (!hasTauriBridge()) {
    state.actionResult = {
      accepted: false,
      status: "Desktop app required",
      message: "Setup changes are saved by the Windows desktop app, not the browser preview.",
      next_action: desktopAppRequiredNextAction("continue setup")
    };
    render();
    return;
  }
  if (stepId === "first-admin" && state.setupDraft.adminPasscode.length < 10) {
    state.actionResult = {
      accepted: false,
      forStepId: stepId,
      status: "Needs attention",
      message: "The Townlight admin passcode must be at least 10 characters.",
      next_action: "Enter a 10-character or longer Townlight admin passcode, then continue setup."
    };
    render();
    return;
  }
  try {
    state.actionResult = await invoke("first_run_action", {
      action,
      stepId,
      payload: setupPayloadForStep(stepId)
    });
    await loadAppState();
  } catch (error) {
    const friendly = friendlyFirstRunError(error);
    state.actionResult = {
      accepted: false,
      forStepId: stepId,
      status: "Needs attention",
      message: friendly.message,
      next_action: friendly.next_action
    };
  }
  render();
}

async function handleModuleAction(action, moduleId, { confirmed = false } = {}) {
  if (requiresGuidedModuleReview(action) && !confirmed) {
    state.pendingModuleReviewAction = action;
    state.pendingModuleReviewId = moduleId;
    state.actionResult = null;
    render();
    scrollGuidedReviewIntoView("module");
    return;
  }
  state.pendingModuleReviewAction = null;
  state.pendingModuleReviewId = null;
  if (!hasTauriBridge()) {
    state.actionResult = {
      accepted: false,
      status: "Desktop app required",
      message: "Module actions are handled by the Windows desktop app, not the browser preview.",
      next_action: desktopAppRequiredNextAction("install, update, enable, disable, remove modules, or open local module exports")
    };
    render();
    return;
  }
  try {
    state.actionResult = await invoke("module_action", {
      action,
      moduleId
    });
    state.app.module_selection = state.actionResult.selection;
    state.app.modules = state.actionResult.modules;
    await loadAppState();
    if (!areaIsEnabled(state.activeArea)) {
      state.activeArea = "settings";
    }
  } catch (error) {
    state.actionResult = {
      accepted: false,
      status: "Needs attention",
      message: String(error),
      next_action: "Sign in as the Townlight admin and try the module action again."
    };
  }
  render();
}

async function handleModelAction(action) {
  if (modelSetupControlLocked()) {
    state.modelActionResult = {
      accepted: false,
      action,
      status: "Sign in required",
      message: modelSetupLockMessage(),
      next_action: "Sign in as the Townlight admin before changing local model setup."
    };
    render();
    return;
  }
  if (!hasTauriBridge()) {
    state.modelActionResult = {
      accepted: false,
      status: "Desktop app required",
      message: "Model setup changes are saved by the Windows desktop app, not the browser preview.",
      next_action: desktopAppRequiredNextAction("continue local model setup")
    };
    render();
    return;
  }
  // Show a working state and lock the buttons BEFORE awaiting, so a multi-GB
  // download can't be re-clicked into a second concurrent download and doesn't
  // read as "frozen/broken". The backend download is synchronous, so the app
  // genuinely does freeze during it — the copy sets that expectation up front.
  const isDownload = action === "download" || action === "resume-download";
  state.modelActionInFlight = action;
  try {
    // Inside the try so the finally below always clears the in-flight flag even
    // if this working-state render throws — otherwise the buttons would stay
    // disabled for the rest of the session with no recovery.
    state.modelActionResult = {
      working: true,
      action,
      status: "Working",
      message: isDownload
        ? "Downloading the local AI model. This is a one-time download that can take up to an hour."
        : "Running local model setup from the desktop app.",
      next_action: isDownload
        ? "Townlight may look frozen while it downloads — please do not close the app. It resumes where it left off if interrupted."
        : "Keep Townlight open while this finishes."
    };
    render();
    state.modelActionResult = await invoke("model_action", { action });
    await loadAppState();
  } catch (error) {
    state.modelActionResult = {
      accepted: false,
      status: "Needs attention",
      message: String(error),
      next_action: "Check the local model file, network connection, and available disk space, then retry."
    };
  } finally {
    state.modelActionInFlight = null;
  }
  render();
}

async function handleSupervisorAction(action, serviceId, { confirmed = false } = {}) {
  if (requiresGuidedSupervisorReview(action) && !confirmed) {
    state.pendingSupervisorReviewAction = action;
    state.pendingSupervisorReviewServiceId = serviceId || null;
    state.supervisorActionResult = null;
    render();
    scrollGuidedReviewIntoView("supervisor");
    return;
  }
  const normalizedServiceId = serviceId || null;
  state.pendingSupervisorReviewAction = null;
  state.pendingSupervisorReviewServiceId = null;
  state.supervisorActionResult = {
    accepted: true,
    status: "Working",
    message: `Running ${supervisorActionLabel(action)} from the desktop app.`,
    next_action: "Keep Townlight open while the local action completes."
  };
  render();
  if (!hasTauriBridge()) {
    state.supervisorActionResult = {
      accepted: false,
      status: "Desktop app required",
      message: "Runtime service changes are saved by the Windows desktop app, not the browser preview.",
      next_action: desktopAppRequiredNextAction("manage local runtime services")
    };
    render();
    return;
  }
  try {
    state.supervisorActionResult = await invoke("supervisor_action", {
      action,
      serviceId: normalizedServiceId
    });
    render();
    await loadAppState();
  } catch (error) {
    state.supervisorActionResult = {
      accepted: false,
      status: "Needs attention",
      message: String(error),
      next_action: "Review System Health and try the action again."
    };
  }
  render();
}

function supervisorActionLabel(action) {
  const labels = {
    backup: "Backup Now",
    "support-bundle": "Create Support Bundle",
    restore: "Restore Latest Backup",
    uninstall: "Prepare Uninstall",
    repair: "Repair",
    stop: "Stop",
    health: "Check",
    install: "Install",
    logs: "Logs",
    "open-backup-folder": "Open Backup Folder",
    "open-windows-uninstall": "Open Windows Uninstall"
  };
  return labels[action] || action;
}

async function handleChooseFilePath(field) {
  if (!Object.prototype.hasOwnProperty.call(state.workDraft, field)) {
    return;
  }
  if (!hasTauriBridge()) {
    state.workActionResult = {
      accepted: false,
      status: "Desktop app required",
      message: "Native file selection is available in the Windows desktop app, not the browser preview.",
      next_action: desktopAppRequiredNextAction("choose the source file from the file picker")
    };
    render();
    return;
  }
  try {
    const pickedPath = await invoke("choose_file_path");
    if (pickedPath) {
      state.workDraft[field] = pickedPath;
      state.workActionResult = {
        accepted: true,
        status: "File selected",
        message: "The selected local file path was added to the current workflow field.",
        next_action: "Review the citation and access level before saving."
      };
    } else {
      state.workActionResult = {
        accepted: false,
        status: "No file selected",
        message: "No local file was selected.",
        next_action: "Choose File again or type the path if staff already know it."
      };
    }
  } catch (error) {
    state.workActionResult = {
      accepted: false,
      status: "Needs attention",
      message: String(error),
      next_action: "Sign in with a local staff account and choose the source file again."
    };
  }
  render();
}

// The current first-run wizard step id, or undefined outside an active wizard.
// The folder pickers live ON the current step (locations/backup), so tagging a
// folder-pick result with this id lets renderFirstRunStep show a same-step
// failure inline while a foreign result (no/other forStepId) stays out.
function currentFirstRunStepId() {
  const firstRun = state.app && state.app.first_run;
  if (!firstRun || firstRun.finished) return undefined;
  const current = (firstRun.steps || []).find((step) => step.current);
  return current ? current.id : firstRun.current_step_id;
}

async function handleChooseFolderPath(field) {
  if (!Object.prototype.hasOwnProperty.call(state.setupDraft, field)) {
    return;
  }
  const forStepId = currentFirstRunStepId();
  if (!hasTauriBridge()) {
    state.actionResult = {
      accepted: false,
      forStepId,
      status: "Desktop app required",
      message: "Native folder selection is available in the Windows desktop app, not the browser preview.",
      next_action: desktopAppRequiredNextAction("choose the city data or backup folder from the folder picker")
    };
    render();
    return;
  }
  try {
    const pickedPath = await invoke("choose_folder_path");
    if (pickedPath) {
      state.setupDraft[field] = pickedPath;
      state.actionResult = {
        accepted: true,
        forStepId,
        status: "Folder selected",
        message: "The selected local folder path was added to the setup field.",
        next_action: "Review the folder path, then save local folders or continue setup."
      };
    } else {
      state.actionResult = {
        accepted: false,
        forStepId,
        status: "No folder selected",
        message: "No local folder was selected.",
        next_action: "Choose Folder again, or type the folder path directly if you already know it."
      };
    }
  } catch (error) {
    const raw = String(error);
    const isAdminGate = /sign in as the civicsuite admin/i.test(raw);
    state.actionResult = {
      accepted: false,
      forStepId,
      status: isAdminGate ? "Sign in required" : "Needs attention",
      message: raw,
      next_action: isAdminGate
        ? "Sign in as the Townlight admin, then choose the folder again."
        : "Try Choose Folder again, or type the folder path directly."
    };
  }
  render();
}

function authPayloadForAction(action, overridePayload = null) {
  if (overridePayload) {
    if (action === "reset-user-passcode") {
      return {
        ...overridePayload,
        userPasscode: state.accessDraft.userPasscode
      };
    }
    return overridePayload;
  }
  if (action === "sign-in") {
    return {
      email: state.accessDraft.email,
      passcode: state.accessDraft.passcode
    };
  }
  if (action === "create-user") {
    return {
      userName: state.accessDraft.userName,
      userEmail: state.accessDraft.userEmail,
      userRole: state.accessDraft.userRole,
      userPasscode: state.accessDraft.userPasscode
    };
  }
  return {};
}

async function handleAuthAction(action, payloadOverride = null) {
  if (!hasTauriBridge()) {
    state.authActionResult = {
      accepted: false,
      status: "Desktop app required",
      message: "Local access is managed by the Windows desktop app, not the browser preview.",
      next_action: desktopAppRequiredNextAction("sign in or manage local users")
    };
    render();
    return;
  }
  if (action === "create-user" && state.accessDraft.userPasscode.length < 10) {
    state.authActionResult = {
      accepted: false,
      status: "Needs attention",
      message: "Temporary local passcode must be at least 10 characters.",
      next_action: "Enter a 10-character or longer temporary passcode, then create the staff user."
    };
    render();
    return;
  }
  const createdStaffEmail = action === "create-user" ? state.accessDraft.userEmail.trim() : "";
  try {
    state.authActionResult = await invoke("auth_action", {
      action,
      payload: authPayloadForAction(action, payloadOverride)
    });
    state.accessDraft.passcode = "";
    if (action === "create-user") {
      state.accessDraft.userName = "";
      state.accessDraft.userEmail = "";
      state.accessDraft.userPasscode = "";
    }
    if (action === "reset-user-passcode") {
      state.accessDraft.userPasscode = "";
    }
    await loadAppState();
    if (action === "create-user" && state.authActionResult.accepted && createdStaffEmail) {
      state.accessDraft.lastStaffEmail = createdStaffEmail;
      state.accessDraft.email = createdStaffEmail;
    }
  } catch (error) {
    const raw = String(error);
    const lockedOut = /too many failed sign-in attempts/i.test(raw);
    const disabledUser = /this local staff user is disabled/i.test(raw);
    state.authActionResult = {
      accepted: false,
      status: lockedOut ? "Please wait" : disabledUser ? "Account disabled" : "Needs attention",
      message: raw,
      next_action: lockedOut
        ? "Wait the number of seconds shown above, then try again — repeated attempts restart the wait."
        : disabledUser
          ? "Ask a Townlight admin to re-enable this user — retrying the passcode will not help."
          : "Check the email and local passcode, then try again."
    };
  }
  render();
  // Sign-in from the buried access panel unblocks the wizard above it —
  // bring the current step back into view instead of leaving the clerk
  // looking at the sign-in box that just succeeded.
  if (action === "sign-in" && state.authActionResult && state.authActionResult.accepted) {
    window.requestAnimationFrame(() => {
      document.querySelector('[data-setup-context="first-run"] .first-run-step.current')?.scrollIntoView({ block: "start", behavior: "smooth" });
    });
  }
}

function workPayloadForAction(action) {
  const draft = state.workDraft;
  const work = cityWork();
  const meeting = currentMeeting(work);
  const rosterMembers = meetingMembers(work).filter((member) => !meeting || !meeting.body_id || member.body_id === meeting.body_id);
  const selectedVoteMember = rosterMembers.find((member) => member.id === draft.memberVoteMemberId) || rosterMembers[0] || null;
  const selectedAttendanceMember = rosterMembers.find((member) => member.id === draft.attendanceMemberId) || rosterMembers[0] || null;
  const meetingMotions = meeting?.motions || [];
  const selectedVoteMotion = meetingMotions.find((motion) => motion.id === draft.memberVoteMotionId) || meetingMotions[meetingMotions.length - 1] || null;
  const selected = {
    meetingId: meeting?.id || "",
    agendaIntakeId: currentAgendaIntake()?.id || "",
    publicCommentId: currentPublicComment()?.id || "",
    recordsRequestId: currentRecordsRequest()?.id || "",
    codeSourceId: currentCodeSource()?.id || "",
    codeHandoffId: currentCodeHandoff()?.id || "",
    notificationId: currentNotification()?.id || ""
  };
  const payloads = {
    "create-meeting-body": {
      meetingBodyName: draft.meetingBodyName,
      meetingBodyType: draft.meetingBodyType,
      meetingBodyStatutoryBasis: draft.meetingBodyStatutoryBasis,
      meetingBodyCadence: draft.meetingBodyCadence,
      meetingBodyDefaultNoticeDays: draft.meetingBodyDefaultNoticeDays,
      meetingBodyQuorumRule: draft.meetingBodyQuorumRule
    },
    "add-meeting-member": {
      meetingBodyId: draft.meetingBodyId || meetingBodies(work)[0]?.id || "",
      meetingBodyName: draft.meetingBodyName,
      memberName: draft.memberName,
      memberRole: draft.memberRole,
      memberTermStart: draft.memberTermStart,
      memberTermEnd: draft.memberTermEnd,
      memberEmail: draft.memberEmail
    },
    "create-meeting": {
      title: draft.meetingTitle,
      meetingBodyId: draft.meetingBodyId || meetingBodies(work)[0]?.id || "",
      meetingBodyName: draft.meetingBodyName,
      meetingDate: draft.meetingDate,
      summary: draft.meetingSummary,
      agendaTitle: draft.agendaTitle
    },
    "add-agenda-item": { ...selected, agendaTitle: draft.agendaTitle },
    "submit-agenda-intake": {
      agendaIntakeTitle: draft.agendaIntakeTitle,
      agendaIntakeSubmitter: draft.agendaIntakeSubmitter,
      agendaIntakeDepartment: draft.agendaIntakeDepartment,
      agendaIntakeSummary: draft.agendaIntakeSummary,
      agendaIntakeSourceReference: draft.agendaIntakeSourceReference,
      agendaIntakeMeetingDate: draft.agendaIntakeMeetingDate
    },
    "review-agenda-intake": {
      ...selected,
      agendaIntakeDecision: draft.agendaIntakeDecision,
      agendaIntakeReviewNote: draft.agendaIntakeReviewNote
    },
    "promote-agenda-intake": selected,
    "record-staff-report": {
      ...selected,
      staffReportAgendaItemId: draft.staffReportAgendaItemId,
      staffReportRecommendation: draft.staffReportRecommendation,
      staffReportBackground: draft.staffReportBackground,
      staffReportAnalysis: draft.staffReportAnalysis,
      staffReportFiscalImpact: draft.staffReportFiscalImpact,
      staffReportAlternatives: draft.staffReportAlternatives,
      staffReportPriorActions: draft.staffReportPriorActions,
      staffReportPreparedBy: draft.staffReportPreparedBy,
      staffReportRevisionNote: draft.staffReportRevisionNote
    },
    "add-meeting-attachment": {
      ...selected,
      meetingAttachmentTitle: draft.meetingAttachmentTitle,
      meetingAttachmentSourcePath: draft.meetingAttachmentSourcePath,
      meetingAttachmentCitation: draft.meetingAttachmentCitation,
      meetingAttachmentSection: draft.meetingAttachmentSection,
      meetingAttachmentAccess: draft.meetingAttachmentAccess
    },
    "finalize-meeting-packet": {
      ...selected,
      packetTitle: draft.packetTitle,
      packetPreparedBy: draft.packetPreparedBy,
      packetReviewNote: draft.packetReviewNote
    },
    "record-closed-session": {
      ...selected,
      closedSessionBasis: draft.closedSessionBasis,
      closedSessionTopics: draft.closedSessionTopics,
      closedSessionAttendees: draft.closedSessionAttendees,
      closedSessionEnteredAt: draft.closedSessionEnteredAt,
      closedSessionExitedAt: draft.closedSessionExitedAt,
      closedSessionReconvene: draft.closedSessionReconvene,
      closedSessionNotesReference: draft.closedSessionNotesReference
    },
    "add-code-handoff-agenda": selected,
    "calculate-notice-deadline": {
      ...selected,
      noticeMeetingType: draft.noticeMeetingType,
      noticeStatutoryBasis: draft.noticeStatutoryBasis,
      noticeLeadDays: draft.noticeLeadDays,
      noticeDayType: draft.noticeDayType,
      noticeTimeZone: draft.noticeTimeZone,
      noticeHumanApproval: draft.noticeHumanApproval
    },
    "complete-notice-checklist": {
      ...selected,
      noticeMeetingType: draft.noticeMeetingType,
      noticeStatutoryBasis: draft.noticeStatutoryBasis,
      noticeDeadline: draft.noticeDeadline,
      noticeTimeZone: draft.noticeTimeZone,
      noticeHumanApproval: draft.noticeHumanApproval
    },
    "post-notice": {
      ...selected,
      postingLocation: draft.noticeLocation,
      postingMethod: draft.noticeMethod,
      postingConfirmation: draft.noticeConfirmation,
      postingDate: draft.noticePostingDate
    },
    "civicnotice-calculate-deadline": {
      ...selected,
      noticeMeetingType: draft.noticeMeetingType,
      noticeStatutoryBasis: draft.noticeStatutoryBasis,
      noticeLeadDays: draft.noticeLeadDays,
      noticeDayType: draft.noticeDayType,
      noticeTimeZone: draft.noticeTimeZone,
      noticeHumanApproval: draft.noticeHumanApproval
    },
    "civicnotice-complete-checklist": {
      ...selected,
      noticeMeetingType: draft.noticeMeetingType,
      noticeStatutoryBasis: draft.noticeStatutoryBasis,
      noticeDeadline: draft.noticeDeadline,
      noticeTimeZone: draft.noticeTimeZone,
      noticeHumanApproval: draft.noticeHumanApproval
    },
    "civicnotice-post-notice": {
      ...selected,
      postingLocation: draft.noticeLocation,
      postingMethod: draft.noticeMethod,
      postingConfirmation: draft.noticeConfirmation,
      postingDate: draft.noticePostingDate
    },
    "civicnotice-export-archive-packet": selected,
    "export-meeting-packet": selected,
    "suggest-minutes-draft": selected,
    "record-minutes": { ...selected, minutes: draft.minutes },
    "record-motion": {
      ...selected,
      motionText: draft.motionText,
      motionMover: draft.motionMover,
      motionSeconder: draft.motionSeconder,
      motionDisposition: draft.motionDisposition,
      motionVoteReference: draft.motionVoteReference
    },
    "add-minute-citation": {
      ...selected,
      minutesCitationSentence: draft.minutesCitationSentence,
      minutesCitationSourceType: draft.minutesCitationSourceType,
      minutesCitationSourceRef: draft.minutesCitationSourceRef,
      minutesCitationNote: draft.minutesCitationNote,
      minutesCitationAccess: draft.minutesCitationAccess
    },
    "record-vote": { ...selected, vote: draft.vote },
    "record-member-vote": {
      ...selected,
      memberVoteMotionId: selectedVoteMotion?.id || draft.memberVoteMotionId,
      memberVoteMemberId: selectedVoteMember?.id || draft.memberVoteMemberId,
      memberVoteMemberName: selectedVoteMember?.name || draft.memberVoteMemberName,
      memberVoteValue: draft.memberVoteValue
    },
    "record-meeting-attendance": {
      ...selected,
      attendanceMemberId: selectedAttendanceMember?.id || draft.attendanceMemberId,
      attendanceMemberName: selectedAttendanceMember?.name || draft.attendanceMemberName,
      attendanceStatus: draft.attendanceStatus,
      attendanceRecordedBy: draft.attendanceRecordedBy,
      attendanceNote: draft.attendanceNote
    },
    "record-quorum-check": {
      ...selected,
      quorumRequiredCount: draft.quorumRequiredCount,
      quorumReviewNote: draft.quorumReviewNote
    },
    "add-action-item": {
      ...selected,
      actionItem: draft.actionItem,
      actionItemOwner: draft.actionItemOwner,
      actionItemDueDate: draft.actionItemDueDate,
      actionItemStatus: draft.actionItemStatus,
      actionItemSourceReference: draft.actionItemSourceReference
    },
    "sign-minutes": {
      ...selected,
      minutesSignedBy: draft.minutesSignedBy,
      minutesSignatureAttestation: draft.minutesSignatureAttestation
    },
    "record-adopted-legislation": {
      ...selected,
      adoptedLegislationType: draft.adoptedLegislationType,
      adoptedLegislationTitle: draft.adoptedLegislationTitle,
      adoptedLegislationText: draft.adoptedLegislationText,
      adoptedLegislationEffectiveDate: draft.adoptedLegislationEffectiveDate,
      adoptedLegislationCodificationHint: draft.adoptedLegislationCodificationHint
    },
    "record-resident-comment": { ...selected, residentComment: draft.residentComment },
    "submit-public-comment": {
      meetingId: draft.publicCommentMeetingId || publicCommentMeetings(cityWork())[0]?.id || "",
      commenterName: draft.publicCommentName,
      commenterContact: draft.publicCommentContact,
      commentMode: draft.publicCommentMode,
      commentTopic: draft.publicCommentTopic,
      commentBody: draft.publicCommentBody
    },
    "review-public-comment": {
      ...selected,
      publicCommentId: currentPublicComment()?.id || ""
    },
    "redact-public-comment": {
      ...selected,
      publicCommentId: currentPublicComment()?.id || "",
      redactedBody: draft.publicCommentRedactedBody,
      redactionBasis: draft.publicCommentRedactionBasis
    },
    "adopt-minutes": selected,
    "archive-meeting": selected,
    "create-records-request": {
      requester: draft.requester,
      summary: draft.recordsSummary,
      deadline: draft.deadline,
      deadlineBasis: draft.recordsDeadlineBasis
    },
    "submit-public-records-request": {
      requester: draft.publicRequester,
      requesterContact: draft.publicRequesterContact,
      summary: draft.publicRecordsSummary
    },
    "lookup-public-records-request": {
      trackingNumber: draft.publicRequestLookup,
      requesterContact: draft.publicRequestContact
    },
    "add-public-records-message": {
      trackingNumber: draft.publicRequestLookup,
      requesterContact: draft.publicRequestContact,
      publicRequestMessage: draft.publicRequestMessage
    },
    "set-records-deadline": {
      ...selected,
      deadline: draft.deadline,
      deadlineBasis: draft.recordsDeadlineBasis
    },
    "calculate-records-deadline": {
      ...selected,
      deadlineReceivedDate: draft.deadlineReceivedDate,
      deadlineRuleName: draft.deadlineRuleName,
      deadlineDayCount: draft.deadlineDayCount,
      deadlineDayType: draft.deadlineDayType,
      deadlineBasis: draft.recordsDeadlineBasis
    },
    "request-records-clarification": { ...selected, clarificationNote: draft.clarificationNote },
    "add-records-message": { ...selected, requestMessageBody: draft.requestMessageBody },
    "assign-records-request": { ...selected, assignedTo: draft.assignedTo },
    "record-records-search": {
      ...selected,
      sourceNote: draft.sourceNote,
      citation: draft.citation
    },
    "record-records-search-session": {
      ...selected,
      searchQuery: draft.recordsSearchQuery,
      searchLocations: draft.searchLocations,
      searchResultTitle: draft.searchResultTitle,
      searchResultCitation: draft.searchResultCitation,
      searchResultSummary: draft.searchResultSummary,
      searchResultStatus: draft.searchResultStatus,
      searchReviewer: draft.searchReviewer
    },
    "add-records-document": {
      ...selected,
      documentTitle: draft.documentTitle,
      documentSourcePath: draft.documentSourcePath,
      documentCitation: draft.documentCitation
    },
    "add-records-release-copy": {
      ...selected,
      releaseDocumentId: draft.releaseDocumentId,
      releaseCopyPath: draft.releaseCopyPath,
      releaseCopyStatus: draft.releaseCopyStatus,
      releaseCopyNote: draft.releaseCopyNote,
      releaseCopyAddedBy: draft.releaseCopyAddedBy
    },
    "add-records-exemption-review": { ...selected, exemptionNote: draft.exemptionNote },
    "add-records-exemption-decision": {
      ...selected,
      exemptionSource: draft.exemptionSource,
      exemptionKind: draft.exemptionKind,
      exemptionFinding: draft.exemptionFinding,
      exemptionDecision: draft.exemptionDecision,
      exemptionBasis: draft.exemptionBasis,
      exemptionReviewer: draft.exemptionReviewer
    },
    "estimate-records-fee": { ...selected, feeEstimate: draft.feeEstimate },
    "add-records-fee-line": {
      ...selected,
      feeLineDescription: draft.feeLineDescription,
      feeScheduleBasis: draft.feeScheduleBasis,
      feeLineAmount: draft.feeLineAmount
    },
    "waive-records-fee": {
      ...selected,
      feeWaiverReason: draft.feeWaiverReason
    },
    "suggest-records-response": selected,
    "draft-records-response": {
      ...selected,
      responseDraft: draft.responseDraft,
      citation: draft.citation
    },
    "approve-records-response": { ...selected, approvalNote: draft.approvalNote },
    "build-records-release-package": selected,
    "export-records-response": selected,
    "fulfill-records-request": selected,
    "close-records-request": selected,
    "mark-notification-sent": selected,
    "open-exports-folder": { folder: exportFolderForActiveArea() },
    "import-code-source": {
      title: draft.codeTitle,
      citation: draft.codeCitation,
      body: draft.codeBody,
      codeSourcePath: draft.codeSourcePath,
      importedBy: draft.codeImportedBy
    },
    "record-codifier-sync": {
      ...selected,
      codifierName: draft.codifierName,
      authoritativeUrl: draft.authoritativeUrl,
      versionLabel: draft.versionLabel
    },
    "record-codifier-sync-failure": { ...selected, syncError: draft.syncError },
    "retry-codifier-sync": selected,
    "mark-code-stale": { ...selected, amendmentNote: draft.amendmentNote },
    "suggest-code-guidance": selected,
    "draft-code-guidance": {
      ...selected,
      guidanceDraft: draft.guidanceDraft,
      summaryDraft: draft.summaryDraft
    },
    "approve-code-guidance": selected,
    "publish-code-source": selected,
    "unpublish-code-source": selected,
    "create-code-handoff": { ...selected, summary: draft.handoffSummary },
    "answer-code-question": {
      query: draft.codeQuestion,
      publicOnly: isPublicSurface()
    },
    "search-city-knowledge": { query: draft.searchQuery },
    "accessibility-review": {
      title: draft.accessTitle,
      body: draft.accessBody,
      hasAltText: draft.accessHasAltText,
      language: draft.accessLanguage
    },
    // records-export gets its reviewId from the per-row button's data-action-payload
    // override. No draft binding intentionally — the action is row-scoped, not form-scoped.
    "civicaccess-records-export": {},
    // delete-review goes through the guided-review confirm step (GUIDED_WORK_ACTIONS),
    // which re-derives its payload here rather than from the original click's
    // overridePayload -- workSelection.accessDeleteReviewId is set by the click
    // handler before the guided-review panel renders, and survives into Confirm.
    "civicaccess-delete-review": { reviewId: state.workSelection.accessDeleteReviewId },
    "civicaccess-plain-language": { text: draft.accessPlainText },
    "civicaccess-language-variant": {
      text: draft.accessVariantText,
      language: draft.accessVariantLanguage
    },
    "civicaccess-form-plan": {
      formName: draft.accessFormName,
      fields: draft.accessFormFields
    },
    "civicaccess-publishing-workflow": {
      title: draft.accessPublishingTitle,
      hasReview: draft.accessPublishingHasReview,
      hasPlainLanguage: draft.accessPublishingHasPlainLanguage,
      hasTranslationReview: draft.accessPublishingHasTranslationReview
    },
    "civicaccess-ada-title-ii": {
      serviceArea: draft.accessAdaServiceArea,
      hasCoordinatorReview: draft.accessAdaHasCoordinatorReview
    },
    "civicaccess-tagged-pdf": { headingLevels: draft.accessTaggedPdfHeadings }
  };
  return payloads[action] || {};
}

function recordFreshnessValue(record) {
  const idSequence = String(record?.id || "").match(/(\d+)(?!.*\d)/);
  const sequenceValue = idSequence ? Number(idSequence[1]) : 0;
  const timestampFields = [
    "created_at_unix_seconds",
    "updated_at_unix_seconds",
    "finalized_at_unix_seconds",
    "recorded_at_unix_seconds",
    "published_at_unix_seconds",
    "archived_at_unix_seconds",
    "sent_at_unix_seconds"
  ];
  for (const field of timestampFields) {
    const value = Number(record?.[field]);
    if (Number.isFinite(value) && value > 0) return (value * 1000000) + sequenceValue;
  }
  return sequenceValue;
}

function newestRecord(records) {
  if (!Array.isArray(records) || records.length === 0) return null;
  return records.reduce((newest, record) => (
    recordFreshnessValue(record) >= recordFreshnessValue(newest) ? record : newest
  ), records[0]);
}

function newlyAddedRecord(records, previousRecords) {
  if (!Array.isArray(records) || records.length === 0) return null;
  const previousIds = new Set((previousRecords || []).map((record) => record.id));
  return records.find((record) => !previousIds.has(record.id)) || newestRecord(records);
}

function recordById(records, id) {
  if (!id || !Array.isArray(records)) return null;
  return records.find((record) => record.id === id) || null;
}

function ensureSelectedRecord(selectionKey, records) {
  if (recordById(records, state.workSelection[selectionKey])) return;
  state.workSelection[selectionKey] = newestRecord(records)?.id || "";
}

function syncMeetingDependentSelections(work) {
  const meetings = work.meetings || [];
  const meeting = recordById(meetings, state.workSelection.meetingId) || newestRecord(meetings);
  const agendaItems = meeting?.agenda_items || [];
  const rosterMembers = (work.meeting_members || []).filter((member) => (
    !meeting || !meeting.body_id || member.body_id === meeting.body_id
  ));
  const motions = meeting?.motions || [];

  if (!recordById(agendaItems, state.workDraft.staffReportAgendaItemId)) {
    state.workDraft.staffReportAgendaItemId = agendaItems[0]?.id || "";
  }
  if (!recordById(rosterMembers, state.workDraft.memberVoteMemberId)) {
    state.workDraft.memberVoteMemberId = rosterMembers[0]?.id || "";
  }
  if (!recordById(rosterMembers, state.workDraft.attendanceMemberId)) {
    state.workDraft.attendanceMemberId = rosterMembers[0]?.id || "";
  }
  if (!recordById(motions, state.workDraft.memberVoteMotionId)) {
    state.workDraft.memberVoteMotionId = newestRecord(motions)?.id || "";
  }
}

function reconcileWorkSelection(work) {
  const bodies = work.meeting_bodies || [];
  const requests = work.records_requests || [];
  const selectedRequest = recordById(requests, state.workSelection.recordsRequestId) || newestRecord(requests);
  const requestDocuments = selectedRequest?.documents || [];

  if (!recordById(bodies, state.workDraft.meetingBodyId)) {
    state.workDraft.meetingBodyId = newestRecord(bodies)?.id || "";
  }
  ensureSelectedRecord("meetingId", work.meetings || []);
  ensureSelectedRecord("agendaIntakeId", work.agenda_intakes || []);
  ensureSelectedRecord("recordsRequestId", requests);
  ensureSelectedRecord("codeSourceId", work.code_sources || []);
  ensureSelectedRecord("codeHandoffId", work.code_handoffs || []);
  ensureSelectedRecord("notificationId", work.notification_events || []);
  if (!recordById(requestDocuments, state.workDraft.releaseDocumentId)) {
    state.workDraft.releaseDocumentId = requestDocuments[0]?.id || "";
  }
  syncMeetingDependentSelections(work);
}

function syncWorkSelectionAfterAction(action, work, previousWork = {}) {
  const latestMeeting = newlyAddedRecord(work.meetings || [], previousWork.meetings || []);
  const latestBody = newlyAddedRecord(work.meeting_bodies || [], previousWork.meeting_bodies || []);
  const latestMember = newlyAddedRecord(work.meeting_members || [], previousWork.meeting_members || []);
  const latestIntake = newlyAddedRecord(work.agenda_intakes || [], previousWork.agenda_intakes || []);
  const latestRequest = newlyAddedRecord(work.records_requests || [], previousWork.records_requests || []);
  const latestSource = newlyAddedRecord(work.code_sources || [], previousWork.code_sources || []);
  const latestHandoff = newlyAddedRecord(work.code_handoffs || [], previousWork.code_handoffs || []);
  const selectedRequest = recordById(work.records_requests || [], state.workSelection.recordsRequestId) || latestRequest;
  const previousSelectedRequest = recordById(previousWork.records_requests || [], selectedRequest?.id);
  const latestDocument = newlyAddedRecord(
    selectedRequest?.documents || [],
    previousSelectedRequest?.documents || []
  );
  const selectedMeeting = recordById(work.meetings || [], state.workSelection.meetingId) || latestMeeting;
  const previousSelectedMeeting = recordById(previousWork.meetings || [], selectedMeeting?.id);
  const latestAgendaItem = newlyAddedRecord(
    selectedMeeting?.agenda_items || [],
    previousSelectedMeeting?.agenda_items || []
  );
  const latestMotion = newlyAddedRecord(
    selectedMeeting?.motions || [],
    previousSelectedMeeting?.motions || []
  );
  const latestPublicComment = newlyAddedRecord(
    selectedMeeting?.public_comments || [],
    previousSelectedMeeting?.public_comments || []
  );

  if (action === "create-meeting-body" && latestBody) {
    state.workDraft.meetingBodyId = latestBody.id;
  }
  if (action === "add-meeting-member" && latestMember) {
    state.workDraft.meetingBodyId = latestMember.body_id || state.workDraft.meetingBodyId;
    state.workDraft.memberVoteMemberId = latestMember.id;
    state.workDraft.attendanceMemberId = latestMember.id;
  }
  if (action === "create-meeting" && latestMeeting) {
    state.workSelection.meetingId = latestMeeting.id;
    state.workDraft.meetingBodyId = latestMeeting.body_id || state.workDraft.meetingBodyId;
    state.workDraft.staffReportAgendaItemId = latestMeeting.agenda_items?.[0]?.id || "";
  }
  if (action === "submit-agenda-intake" && latestIntake) {
    state.workSelection.agendaIntakeId = latestIntake.id;
  }
  if (["add-agenda-item", "promote-agenda-intake", "add-code-handoff-agenda"].includes(action) && latestAgendaItem) {
    state.workDraft.staffReportAgendaItemId = latestAgendaItem.id;
  }
  if (action === "record-motion" && latestMotion) {
    state.workDraft.memberVoteMotionId = latestMotion.id;
  }
  if (action === "submit-public-comment" && latestPublicComment) {
    state.workSelection.publicCommentId = latestPublicComment.id;
  }
  if (["create-records-request", "submit-public-records-request"].includes(action) && latestRequest) {
    state.workSelection.recordsRequestId = latestRequest.id;
    if (latestRequest.public_tracking_number) {
      state.workDraft.publicRequestLookup = latestRequest.public_tracking_number;
      state.workDraft.publicRequestContact =
        latestRequest.requester_contact || state.workDraft.publicRequesterContact || state.workDraft.publicRequestContact;
    }
  }
  if (action === "add-records-document" && latestDocument) {
    state.workDraft.releaseDocumentId = latestDocument.id;
  }
  if (action === "import-code-source" && latestSource) {
    state.workSelection.codeSourceId = latestSource.id;
  }
  if (action === "create-code-handoff" && latestHandoff) {
    state.workSelection.codeHandoffId = latestHandoff.id;
  }
  reconcileWorkSelection(work);
}

async function handleCityWorkAction(action, { confirmed = false, overridePayload = null } = {}) {
  if (requiresGuidedWorkReview(action) && !confirmed) {
    state.pendingWorkReviewAction = action;
    state.workActionResult = null;
    render();
    scrollGuidedReviewIntoView("work");
    return;
  }
  state.pendingWorkReviewAction = null;
  if (action === "search-city-knowledge" && !hasTauriBridge()) {
    state.searchResults = localSearchResults(state.workDraft.searchQuery);
    state.workActionResult = {
      accepted: true,
      status: "Search complete",
      message: "Browser preview searched the local preview state. The desktop app records search audit events.",
      next_action: "Open a result or refine the search terms."
    };
    render();
    return;
  }
  if (action === "answer-code-question" && !hasTauriBridge()) {
    state.searchResults = localCodeQuestionResults(state.workDraft.codeQuestion, { publicOnly: isPublicSurface() });
    state.workActionResult = {
      accepted: true,
      status: state.searchResults.length > 0 ? "Answer ready" : "No cited answer",
      message: state.searchResults.length > 0
        ? "Browser preview answered from local code source text. The desktop app records a Townlight Code audit entry."
        : "No current cited code source matched the question.",
      next_action: "Review the cited source or refine the question."
    };
    render();
    return;
  }
  if (!hasTauriBridge()) {
    state.workActionResult = {
      accepted: false,
      status: "Desktop app required",
      message: "City workflow changes are saved by the Windows desktop app, not the browser preview.",
      next_action: desktopAppRequiredNextAction("save local city work")
    };
    render();
    return;
  }
  // delete-review's confirm step carries no overridePayload (it goes through the
  // guided-review re-derivation in workPayloadForAction instead), so fall back to
  // workSelection for the row-scoped busy key on that one action.
  const inFlightReviewId = overridePayload?.reviewId
    || (action === "civicaccess-delete-review" ? state.workSelection.accessDeleteReviewId : null);
  const myWorkTag = inFlightReviewId ? `${action}:${inFlightReviewId}` : action;
  state.workActionInFlightTags.add(myWorkTag);
  render();
  try {
    const previousWork = cityWork();
    const builtPayload = workPayloadForAction(action);
    const payload = overridePayload ? { ...builtPayload, ...overridePayload } : builtPayload;
    const result = await invoke("city_work_action", {
      action,
      payload
    });
    state.workActionResult = result;
    state.app.city_work = result.state;
    syncWorkSelectionAfterAction(action, result.state, previousWork);
    state.searchResults = result.search_results || [];
    if (action === "submit-public-records-request") {
      const trackingNumber = String(result.message || "").match(/\bREQ-\d+\b/)?.[0] || "";
      if (trackingNumber) {
        state.workDraft.publicRequestLookup = trackingNumber;
        state.workDraft.publicRequestContact = state.workDraft.publicRequesterContact;
      }
      state.publicRecordsLookup = { trackingNumber: "", requesterContact: "", found: false };
    }
    if (action === "lookup-public-records-request" || action === "add-public-records-message") {
      const trackingNumber = state.workDraft.publicRequestLookup.trim().toLowerCase();
      const requesterContact = state.workDraft.publicRequestContact.trim().toLowerCase();
      const found = Boolean((result.state.records_requests || []).some((request) => (
        String(request.public_tracking_number || "").toLowerCase() === trackingNumber
      )));
      state.publicRecordsLookup = { trackingNumber, requesterContact, found };
      if (action === "add-public-records-message" && result.accepted) {
        state.workDraft.publicRequestMessage = "";
      }
    }
  } catch (error) {
    state.workActionResult = {
      accepted: false,
      status: "Needs attention",
      message: String(error),
      next_action: "Review the required fields and try again."
    };
  } finally {
    // Set.delete is naturally idempotent and per-tag -- no equality guard
    // needed here, unlike the scalar this replaced. A different row's own tag
    // is a different Set entry, so it's untouched regardless of how many
    // actions are in flight at once.
    state.workActionInFlightTags.delete(myWorkTag);
    // accessDeleteReviewId is a different kind of value (which review the
    // single app-wide guided-review confirm panel currently targets, not a
    // busy/in-flight tracker) so it keeps its own equality guard: only clear
    // it if it still points at the review THIS call was processing.
    if (action === "civicaccess-delete-review" && state.workSelection.accessDeleteReviewId === inFlightReviewId) {
      state.workSelection.accessDeleteReviewId = "";
    }
  }
  render();
}

await loadAppState();
render();
