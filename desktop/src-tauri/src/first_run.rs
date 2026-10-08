use argon2::{
    password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Algorithm, Argon2, Params, Version,
};
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::env;
use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::local_paths;
use crate::{model, module_registry, supervisor};

const FIRST_RUN_MANIFEST_JSON: &str = include_str!("../../runtime/windows-first-run.json");
const REQUIRED_STEP_IDS: [&str; 8] = [
    "locations",
    "modules",
    "city-profile",
    "first-admin",
    "backup",
    "model",
    "health",
    "finish",
];
const REQUIRED_ACTIONS: [&str; 12] = [
    "choose-location",
    "select-modules",
    "create-city-profile",
    "create-admin",
    "choose-backup",
    "download-model",
    "defer-model",
    "verify-health",
    "open-app",
    "repair",
    "backup",
    "uninstall",
];
const PASSCODE_ALGORITHM_ARGON2ID: &str = "argon2id-v1";
const PASSCODE_ALGORITHM_LEGACY_SHA256: &str = "sha256-100000";

#[derive(Deserialize)]
struct OperatorPath {
    requires_docker: bool,
    requires_wsl: bool,
    requires_terminal: bool,
}

#[derive(Deserialize)]
struct DefaultLocations {
    install_root: String,
    data_root: String,
    backup_root: String,
}

#[derive(Deserialize)]
struct FirstRunManifest {
    schema_version: u16,
    profile: String,
    profile_label: String,
    local_only: bool,
    operator_path: OperatorPath,
    default_locations: DefaultLocations,
    actions: Vec<String>,
    steps: Vec<FirstRunStepDefinition>,
}

#[derive(Deserialize)]
struct FirstRunStepDefinition {
    id: String,
    label: String,
    surface: String,
    required: bool,
    summary: String,
    detail: String,
    next_action: String,
    action: String,
}

#[derive(Deserialize, Serialize, Clone)]
pub struct FirstRunLocations {
    pub install_root: String,
    pub data_root: String,
    pub backup_root: String,
}

impl From<local_paths::LocalLocations> for FirstRunLocations {
    fn from(locations: local_paths::LocalLocations) -> Self {
        Self {
            install_root: locations.install_root,
            data_root: locations.data_root,
            backup_root: locations.backup_root,
        }
    }
}

#[derive(Serialize)]
pub struct FirstRunStep {
    pub id: String,
    pub label: String,
    pub surface: String,
    pub required: bool,
    pub completed: bool,
    pub current: bool,
    pub status: &'static str,
    pub summary: String,
    pub detail: String,
    pub next_action: String,
    pub action: String,
}

#[derive(Serialize)]
pub struct FirstRunState {
    pub profile: String,
    pub profile_label: String,
    pub local_only: bool,
    pub finished: bool,
    pub status: &'static str,
    pub current_step_id: Option<String>,
    pub locations: FirstRunLocations,
    pub available_actions: Vec<String>,
    pub steps: Vec<FirstRunStep>,
}

#[derive(Serialize)]
pub struct FirstRunActionResult {
    pub accepted: bool,
    pub action: String,
    pub step_id: Option<String>,
    pub status: &'static str,
    pub message: String,
    pub next_action: String,
}

#[derive(Deserialize, Serialize, Default)]
struct FirstRunProgress {
    #[serde(default)]
    local_ai_deferred: bool,
    completed_step_ids: Vec<String>,
    last_action: Option<String>,
    last_updated_unix_seconds: u64,
}

#[derive(Deserialize, Serialize, Clone)]
pub struct SavedCityProfile {
    pub city_name: String,
    pub state: String,
    pub time_zone: String,
    pub records_contact: String,
    pub clerk_contact: String,
}

#[derive(Deserialize, Serialize, Clone)]
pub struct SavedFirstAdmin {
    pub display_name: String,
    pub email: String,
    pub role: String,
}

#[derive(Deserialize, Serialize, Clone)]
pub(crate) struct SavedFirstAdminRecord {
    pub display_name: String,
    pub email: String,
    pub role: String,
    #[serde(default = "default_passcode_algorithm")]
    pub passcode_algorithm: String,
    pub passcode_salt: String,
    pub passcode_hash: String,
}

fn default_passcode_algorithm() -> String {
    PASSCODE_ALGORITHM_LEGACY_SHA256.to_string()
}

fn parse_manifest() -> Result<FirstRunManifest, String> {
    serde_json::from_str(FIRST_RUN_MANIFEST_JSON)
        .map_err(|error| format!("Could not parse Windows first-run manifest: {error}"))
}

fn validate_manifest(manifest: &FirstRunManifest) -> Result<(), String> {
    if manifest.schema_version != 1 {
        return Err(format!(
            "Unsupported Windows first-run manifest schema {}",
            manifest.schema_version
        ));
    }
    if manifest.profile != "windows-local-1.0" {
        return Err("Windows first-run manifest profile must be windows-local-1.0".to_string());
    }
    if !manifest.local_only {
        return Err("Windows first-run manifest must be local-only".to_string());
    }
    if manifest.operator_path.requires_docker
        || manifest.operator_path.requires_wsl
        || manifest.operator_path.requires_terminal
    {
        return Err("Windows first-run operator path cannot require developer tooling".to_string());
    }
    for action in REQUIRED_ACTIONS {
        if !manifest.actions.iter().any(|candidate| candidate == action) {
            return Err(format!(
                "Windows first-run manifest is missing action {action}"
            ));
        }
    }
    for step_id in REQUIRED_STEP_IDS {
        if !manifest.steps.iter().any(|step| step.id == step_id) {
            return Err(format!(
                "Windows first-run manifest is missing step {step_id}"
            ));
        }
    }
    for step in &manifest.steps {
        if !manifest
            .actions
            .iter()
            .any(|candidate| candidate == &step.action)
        {
            return Err(format!(
                "Windows first-run step {} references unknown action {}",
                step.id, step.action
            ));
        }
    }
    Ok(())
}

fn windows_path_from_template(template: &str) -> String {
    if let Ok(root) = env::var("CIVICSUITE_DESKTOP_STATE_DIR") {
        return template
            .replace("{local_app_data}/CivicSuite", &root)
            .replace(
                "{documents}/CivicSuite Backups",
                &format!("{root}\\Backups"),
            )
            .replace('/', "\\");
    }
    let local_app_data =
        env::var("LOCALAPPDATA").unwrap_or_else(|_| "{local_app_data}".to_string());
    let documents = env::var("USERPROFILE")
        .map(|profile| PathBuf::from(profile).join("Documents"))
        .map(|path| path.to_string_lossy().to_string())
        .unwrap_or_else(|_| "{documents}".to_string());
    template
        .replace("{local_app_data}", &local_app_data)
        .replace("{documents}", &documents)
        .replace('/', "\\")
}

pub(crate) fn config_dir() -> PathBuf {
    local_paths::config_dir()
}

fn progress_path() -> PathBuf {
    config_dir().join("first-run-progress.json")
}

fn read_progress() -> Result<FirstRunProgress, String> {
    let path = progress_path();
    if !path.is_file() {
        return Ok(FirstRunProgress::default());
    }
    let contents = fs::read_to_string(&path)
        .map_err(|error| format!("Could not read first-run progress: {error}"))?;
    serde_json::from_str(&contents)
        .map_err(|error| format!("Could not parse first-run progress: {error}"))
}

fn write_json_file<T: Serialize>(path: PathBuf, value: &T) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Could not create {}: {error}", parent.display()))?;
    }
    crate::atomic_io::atomic_write_json(&path, value)
}

fn read_optional_json_file<T: DeserializeOwned>(path: PathBuf) -> Result<Option<T>, String> {
    if !path.is_file() {
        return Ok(None);
    }
    let contents = fs::read_to_string(&path)
        .map_err(|error| format!("Could not read {}: {error}", path.display()))?;
    serde_json::from_str(&contents)
        .map(Some)
        .map_err(|error| format!("Could not parse {}: {error}", path.display()))
}

fn write_progress(progress: &FirstRunProgress) -> Result<(), String> {
    write_json_file(progress_path(), progress)
}

pub fn saved_city_profile() -> Result<Option<SavedCityProfile>, String> {
    read_optional_json_file(config_dir().join("city-profile.json"))
}

pub(crate) fn saved_admin_record() -> Result<Option<SavedFirstAdminRecord>, String> {
    read_optional_json_file(config_dir().join("first-admin.json"))
}

fn write_admin_record(record: &SavedFirstAdminRecord) -> Result<(), String> {
    write_json_file(config_dir().join("first-admin.json"), record)
}

fn now_unix_seconds() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or(0)
}

#[cfg(test)]
pub(crate) fn test_env_lock() -> &'static std::sync::Mutex<()> {
    static LOCK: std::sync::OnceLock<std::sync::Mutex<()>> = std::sync::OnceLock::new();
    LOCK.get_or_init(|| std::sync::Mutex::new(()))
}

fn resolve_locations(defaults: &DefaultLocations) -> FirstRunLocations {
    local_paths::effective_locations()
        .map(FirstRunLocations::from)
        .unwrap_or_else(|_| FirstRunLocations {
            install_root: windows_path_from_template(&defaults.install_root),
            data_root: windows_path_from_template(&defaults.data_root),
            backup_root: windows_path_from_template(&defaults.backup_root),
        })
}

fn first_run_state_from_completed(completed_step_ids: &[String]) -> Result<FirstRunState, String> {
    let manifest = parse_manifest()?;
    validate_manifest(&manifest)?;
    let completed: HashSet<&str> = completed_step_ids.iter().map(String::as_str).collect();
    let current_step_id = manifest
        .steps
        .iter()
        .find(|step| !completed.contains(step.id.as_str()))
        .map(|step| step.id.clone());
    let finished = current_step_id.is_none();

    let steps = manifest
        .steps
        .iter()
        .map(|step| {
            let is_completed = completed.contains(step.id.as_str());
            let current = current_step_id.as_deref() == Some(step.id.as_str());
            FirstRunStep {
                id: step.id.clone(),
                label: step.label.clone(),
                surface: step.surface.clone(),
                required: step.required,
                completed: is_completed,
                current,
                status: if is_completed {
                    "Finished"
                } else if current {
                    "Current"
                } else {
                    "Needs setup"
                },
                summary: step.summary.clone(),
                detail: step.detail.clone(),
                next_action: step.next_action.clone(),
                action: step.action.clone(),
            }
        })
        .collect();

    Ok(FirstRunState {
        profile: manifest.profile,
        profile_label: manifest.profile_label,
        local_only: manifest.local_only,
        finished,
        status: if finished { "Finished" } else { "Needs setup" },
        current_step_id,
        locations: resolve_locations(&manifest.default_locations),
        available_actions: manifest.actions,
        steps,
    })
}

pub fn first_run_state(completed_step_ids: &[String]) -> Result<FirstRunState, String> {
    if completed_step_ids.is_empty() {
        let progress = read_progress()?;
        return first_run_state_from_completed(&progress.completed_step_ids);
    }
    first_run_state_from_completed(completed_step_ids)
}

fn next_step_id(progress: &FirstRunProgress, manifest: &FirstRunManifest) -> Option<String> {
    let completed: HashSet<&str> = progress
        .completed_step_ids
        .iter()
        .map(String::as_str)
        .collect();
    manifest
        .steps
        .iter()
        .find(|step| !completed.contains(step.id.as_str()))
        .map(|step| step.id.clone())
}

fn missing_prior_required_steps(
    progress: &FirstRunProgress,
    manifest: &FirstRunManifest,
    target_step_id: &str,
) -> Vec<String> {
    let completed: HashSet<&str> = progress
        .completed_step_ids
        .iter()
        .map(String::as_str)
        .collect();
    manifest
        .steps
        .iter()
        .take_while(|step| step.id != target_step_id)
        .filter(|step| step.required && !completed.contains(step.id.as_str()))
        .map(|step| step.label.clone())
        .collect()
}

fn payload_string(payload: Option<&serde_json::Value>, key: &str) -> Result<String, String> {
    payload
        .and_then(|value| value.get(key))
        .and_then(serde_json::Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .ok_or_else(|| format!("Missing required setup field: {key}"))
}

fn payload_optional_string(payload: Option<&serde_json::Value>, key: &str) -> Option<String> {
    payload
        .and_then(|value| value.get(key))
        .and_then(serde_json::Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

fn payload_string_array(
    payload: Option<&serde_json::Value>,
    key: &str,
) -> Result<Vec<String>, String> {
    let values = payload
        .and_then(|value| value.get(key))
        .and_then(serde_json::Value::as_array)
        .ok_or_else(|| format!("Missing required setup field: {key}"))?;
    values
        .iter()
        .map(|value| {
            value
                .as_str()
                .map(str::trim)
                .filter(|module_id| !module_id.is_empty())
                .map(str::to_string)
                .ok_or_else(|| format!("Setup field {key} must contain module ids"))
        })
        .collect()
}

fn persist_city_profile(payload: Option<&serde_json::Value>) -> Result<(), String> {
    let profile = SavedCityProfile {
        city_name: payload_string(payload, "cityName")?,
        state: payload_string(payload, "state")?,
        time_zone: payload_string(payload, "timeZone")?,
        records_contact: payload_string(payload, "recordsContact")?,
        clerk_contact: payload_string(payload, "clerkContact")?,
    };
    write_json_file(config_dir().join("city-profile.json"), &profile)
}

/// Minimum length for the first Townlight admin passcode.
/// Mirrored client-side in desktop/src/main.js and matched by the staff
/// passcode rule in auth.rs.
pub(crate) const MINIMUM_ADMIN_PASSCODE_LENGTH: usize = 10;

fn persist_first_admin(payload: Option<&serde_json::Value>) -> Result<(), String> {
    let passcode = payload_string(payload, "adminPasscode")?;
    if passcode.chars().count() < MINIMUM_ADMIN_PASSCODE_LENGTH {
        return Err(format!(
            "The Townlight admin passcode must be at least {MINIMUM_ADMIN_PASSCODE_LENGTH} characters."
        ));
    }
    let (passcode_salt, passcode_hash) = hash_argon2id_local_passcode(&passcode)?;
    let admin = SavedFirstAdminRecord {
        display_name: payload_string(payload, "adminName")?,
        email: payload_string(payload, "adminEmail")?,
        role: "local-admin".to_string(),
        passcode_algorithm: PASSCODE_ALGORITHM_ARGON2ID.to_string(),
        passcode_hash,
        passcode_salt,
    };
    write_admin_record(&admin)
}

pub(crate) fn hash_admin_passcode(salt: &str, passcode: &str) -> String {
    use sha2::{Digest, Sha256};

    let mut digest = Vec::new();
    for round in 0..100_000u32 {
        let mut hasher = Sha256::new();
        hasher.update(salt.as_bytes());
        hasher.update(b"\n");
        hasher.update(passcode.as_bytes());
        hasher.update(b"\n");
        hasher.update(round.to_le_bytes());
        hasher.update(&digest);
        digest = hasher.finalize().to_vec();
    }
    digest.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn argon2id() -> Result<Argon2<'static>, String> {
    let params = Params::new(19 * 1024, 2, 1, Some(32))
        .map_err(|error| format!("Could not configure local admin passcode hashing: {error}"))?;
    Ok(Argon2::new(Algorithm::Argon2id, Version::V0x13, params))
}

fn random_salt() -> Result<SaltString, String> {
    let mut bytes = [0_u8; 16];
    getrandom::getrandom(&mut bytes)
        .map_err(|error| format!("Could not create local admin passcode salt: {error}"))?;
    SaltString::encode_b64(&bytes)
        .map_err(|error| format!("Could not encode local admin passcode salt: {error}"))
}

pub(crate) fn hash_argon2id_local_passcode(passcode: &str) -> Result<(String, String), String> {
    let salt = random_salt()?;
    let hash = argon2id()?
        .hash_password(passcode.as_bytes(), &salt)
        .map_err(|error| format!("Could not hash local admin passcode: {error}"))?
        .to_string();
    Ok((salt.to_string(), hash))
}

pub(crate) fn verify_argon2id_local_passcode(
    encoded_hash: &str,
    passcode: &str,
) -> Result<bool, String> {
    let parsed = PasswordHash::new(encoded_hash)
        .map_err(|error| format!("Could not read local admin passcode hash: {error}"))?;
    Ok(argon2id()?
        .verify_password(passcode.as_bytes(), &parsed)
        .is_ok())
}

fn upgrade_legacy_admin_passcode(
    record: &SavedFirstAdminRecord,
    passcode: &str,
) -> Result<(), String> {
    let (passcode_salt, passcode_hash) = hash_argon2id_local_passcode(passcode)?;
    write_admin_record(&SavedFirstAdminRecord {
        display_name: record.display_name.clone(),
        email: record.email.clone(),
        role: record.role.clone(),
        passcode_algorithm: PASSCODE_ALGORITHM_ARGON2ID.to_string(),
        passcode_salt,
        passcode_hash,
    })
}

pub(crate) fn verify_admin_passcode(
    email: &str,
    passcode: &str,
) -> Result<SavedFirstAdmin, String> {
    let record = saved_admin_record()?
        .ok_or_else(|| "Create the first Townlight admin before signing in.".to_string())?;
    if !record.email.eq_ignore_ascii_case(email.trim()) {
        return Err("The Townlight admin email does not match.".to_string());
    }
    let verified = match record.passcode_algorithm.as_str() {
        PASSCODE_ALGORITHM_ARGON2ID => {
            verify_argon2id_local_passcode(&record.passcode_hash, passcode)?
        }
        PASSCODE_ALGORITHM_LEGACY_SHA256 => {
            let candidate_hash = hash_admin_passcode(&record.passcode_salt, passcode);
            let verified = candidate_hash == record.passcode_hash;
            if verified {
                upgrade_legacy_admin_passcode(&record, passcode)?;
            }
            verified
        }
        _ => {
            return Err("The Townlight admin passcode hash uses an unsupported format.".to_string())
        }
    };
    if !verified {
        return Err("The Townlight admin passcode did not match.".to_string());
    }
    Ok(SavedFirstAdmin {
        display_name: record.display_name,
        email: record.email,
        role: record.role,
    })
}

fn create_local_locations(locations: &FirstRunLocations) -> Result<(), String> {
    for path in [
        &locations.install_root,
        &locations.data_root,
        &locations.backup_root,
    ] {
        fs::create_dir_all(path).map_err(|error| format!("Could not create {path}: {error}"))?;
    }
    for path in [
        PathBuf::from(&locations.data_root).join("files"),
        PathBuf::from(&locations.data_root).join("logs"),
        config_dir(),
    ] {
        fs::create_dir_all(&path)
            .map_err(|error| format!("Could not create {}: {error}", path.display()))?;
    }
    Ok(())
}

fn persist_locations(
    payload: Option<&serde_json::Value>,
    current: &FirstRunLocations,
) -> Result<FirstRunLocations, String> {
    let requested = local_paths::LocalLocations {
        install_root: payload_optional_string(payload, "installRoot")
            .unwrap_or_else(|| current.install_root.clone()),
        data_root: payload_optional_string(payload, "dataRoot")
            .unwrap_or_else(|| current.data_root.clone()),
        backup_root: payload_optional_string(payload, "backupRoot")
            .unwrap_or_else(|| current.backup_root.clone()),
    };
    let saved = local_paths::save_locations(&requested)?;
    let locations = FirstRunLocations::from(saved);
    create_local_locations(&locations)?;
    Ok(locations)
}

fn action_blocks_until_runtime(action: &str) -> Option<(&'static str, &'static str)> {
    match action {
        _ => None,
    }
}

fn setup_lifecycle_action(
    action: &str,
    step_id: Option<&str>,
) -> Result<Option<FirstRunActionResult>, String> {
    match action {
        "repair" | "backup" | "uninstall" => {
            let result = supervisor::supervisor_action(action, None)?;
            Ok(Some(FirstRunActionResult {
                accepted: result.accepted,
                action: action.to_string(),
                step_id: step_id.map(str::to_string),
                status: result.status,
                message: result.message,
                next_action: result.next_action,
            }))
        }
        _ => Ok(None),
    }
}

pub fn first_run_action(
    action: &str,
    step_id: Option<&str>,
    payload: Option<&serde_json::Value>,
) -> Result<FirstRunActionResult, String> {
    let manifest = parse_manifest()?;
    validate_manifest(&manifest)?;
    if !manifest.actions.iter().any(|candidate| candidate == action) {
        return Err(format!("Unsupported first-run action: {action}"));
    }
    if let Some(id) = step_id {
        if !manifest.steps.iter().any(|step| step.id == id) {
            return Err(format!("Unknown first-run step: {id}"));
        }
    }

    if let Some(result) = setup_lifecycle_action(action, step_id)? {
        return Ok(result);
    }

    if let Some((message, next_action)) = action_blocks_until_runtime(action) {
        return Ok(FirstRunActionResult {
            accepted: false,
            action: action.to_string(),
            step_id: step_id.map(str::to_string),
            status: "Blocked",
            message: message.to_string(),
            next_action: next_action.to_string(),
        });
    }

    let mut progress = read_progress()?;
    let target_step_id = step_id
        .map(str::to_string)
        .or_else(|| next_step_id(&progress, &manifest))
        .ok_or_else(|| "First-run setup is already finished.".to_string())?;
    let step = manifest
        .steps
        .iter()
        .find(|candidate| candidate.id == target_step_id)
        .ok_or_else(|| format!("Unknown first-run step: {target_step_id}"))?;
    if step.action != action && !(step.id == "model" && action == "defer-model") {
        return Err(format!(
            "Step {} expects action {}, not {action}",
            step.id, step.action
        ));
    }
    let missing_steps = missing_prior_required_steps(&progress, &manifest, &target_step_id);
    if !missing_steps.is_empty() {
        return Ok(FirstRunActionResult {
            accepted: false,
            action: action.to_string(),
            step_id: Some(target_step_id),
            status: "Setup incomplete",
            message: format!(
                "Townlight cannot continue this setup step until these required steps are complete: {}.",
                missing_steps.join(", ")
            ),
            next_action: "Complete the current setup step before continuing.".to_string(),
        });
    }

    let mut action_completion: Option<(&'static str, String, String)> = None;
    if action == "defer-model" {
        progress.local_ai_deferred = true;
        action_completion = Some((
            "Deferred",
            "Local AI is optional. Records workflows remain available without downloading or loading model weights.".to_string(),
            "Continue to health verification. Local AI can be configured later.".to_string(),
        ));
    }
    if action == "download-model" {
        progress.local_ai_deferred = false;
        if model::local_model_artifact_verified()? {
            action_completion = Some((
                "Verified",
                "The pinned Gemma model has already passed local checksum verification."
                    .to_string(),
                "Continue to health verification.".to_string(),
            ));
        } else {
            let model_result = model::model_action("resume-download")?;
            if !model_result.accepted {
                return Ok(FirstRunActionResult {
                    accepted: false,
                    action: action.to_string(),
                    step_id: Some(target_step_id),
                    status: model_result.status,
                    message: model_result.message,
                    next_action: model_result.next_action,
                });
            }
            action_completion = Some((
                model_result.status,
                model_result.message,
                "Continue to health verification.".to_string(),
            ));
        }
    }
    if action == "create-admin" {
        action_completion = Some((
            "Saved",
            "The first Townlight admin was saved for this Windows profile.".to_string(),
            "Sign in with that Townlight admin account, then continue backup and local model setup."
                .to_string(),
        ));
    }
    if action == "verify-health" {
        if !progress.local_ai_deferred && !model::local_model_artifact_verified()? {
            return Ok(FirstRunActionResult {
                accepted: false,
                action: action.to_string(),
                step_id: Some(target_step_id),
                status: "Needs attention",
                message: "The pinned Gemma model has not passed local checksum verification yet."
                    .to_string(),
                next_action:
                    "Open the Local AI model step, click Verify Checksum (or Download / Resume if it is not downloaded yet), then run health verification again."
                        .to_string(),
            });
        }
        let bootstrap = supervisor::bootstrap_required_runtime()?;
        if !bootstrap.accepted {
            return Ok(FirstRunActionResult {
                accepted: false,
                action: action.to_string(),
                step_id: Some(target_step_id),
                status: bootstrap.status,
                message: bootstrap.message,
                next_action: bootstrap.next_action,
            });
        }
        if progress.local_ai_deferred {
            action_completion = Some((
                "Ready",
                format!(
                    "{} Local AI remains deferred; no model weights were loaded.",
                    bootstrap.message
                ),
                "Continue to finish setup.".to_string(),
            ));
        } else {
            let model_load = model::model_action("load-runtime-model")?;
            if !model_load.accepted {
                return Ok(FirstRunActionResult {
                    accepted: false,
                    action: action.to_string(),
                    step_id: Some(target_step_id),
                    status: model_load.status,
                    message: model_load.message,
                    next_action: model_load.next_action,
                });
            }
            if !model::local_model_ready()? {
                return Ok(FirstRunActionResult {
                accepted: false,
                action: action.to_string(),
                step_id: Some(target_step_id),
                status: "Needs attention",
                message:
                    "The local Gemma model is not fully ready in the bundled Ollama runtime yet."
                        .to_string(),
                next_action:
                    "Use Local AI model setup to verify the file, start Ollama, and load the pinned model before final health verification."
                        .to_string(),
            });
            }
            action_completion = Some((
                "Ready",
                format!("{} {}", bootstrap.message, model_load.message),
                "Continue to finish setup.".to_string(),
            ));
        }
    }
    if action == "open-app" {
        action_completion = Some((
            "Finished",
            "Townlight setup is complete on this Windows profile. System Health keeps backup, repair, logs, restore, and uninstall available."
                .to_string(),
            "Start city work from Records Requests, Public Notices, Accessibility, or Search City Knowledge."
                .to_string(),
        ));
    }

    let locations = resolve_locations(&manifest.default_locations);
    match action {
        "choose-location" => {
            persist_locations(payload, &locations)?;
        }
        "choose-backup" => {
            persist_locations(payload, &locations)?;
        }
        "select-modules" => match payload_optional_string(payload, "profileId").as_deref() {
            None | Some("records-beta") => {
                module_registry::persist_profile_selection("records-beta")?;
            }
            Some("city-core") => {
                module_registry::persist_profile_selection("city-core")?;
            }
            Some("custom") => {
                let selected_modules = payload_string_array(payload, "selectedModuleIds")?;
                module_registry::persist_custom_selection(&selected_modules)?;
            }
            Some(profile_id) => {
                module_registry::persist_profile_selection(profile_id)?;
            }
        },
        "create-city-profile" => persist_city_profile(payload)?,
        "create-admin" => persist_first_admin(payload)?,
        "download-model" | "defer-model" | "verify-health" | "open-app" | "repair" | "backup"
        | "uninstall" => {}
        _ => {
            return Err(format!(
                "First-run action {action} has no desktop executor yet"
            ))
        }
    }

    if !progress
        .completed_step_ids
        .iter()
        .any(|completed| completed == &target_step_id)
    {
        progress.completed_step_ids.push(target_step_id.clone());
    }
    progress.last_action = Some(action.to_string());
    progress.last_updated_unix_seconds = now_unix_seconds();
    write_progress(&progress)?;

    let (status, message, next_action) = action_completion.unwrap_or((
        "Saved",
        "Setup progress was saved locally on this Windows profile.".to_string(),
        "Continue to the next setup step.".to_string(),
    ));

    Ok(FirstRunActionResult {
        accepted: true,
        action: action.to_string(),
        step_id: Some(target_step_id),
        status,
        message,
        next_action,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mark_setup_ready_for_first_admin_step() {
        write_progress(&FirstRunProgress {
            local_ai_deferred: false,
            completed_step_ids: vec![
                "locations".to_string(),
                "modules".to_string(),
                "city-profile".to_string(),
            ],
            last_action: Some("create-city-profile".to_string()),
            last_updated_unix_seconds: now_unix_seconds(),
        })
        .expect("progress writes");
    }

    fn mark_setup_ready_for_city_profile_step() {
        write_progress(&FirstRunProgress {
            local_ai_deferred: false,
            completed_step_ids: vec!["locations".to_string(), "modules".to_string()],
            last_action: Some("select-modules".to_string()),
            last_updated_unix_seconds: now_unix_seconds(),
        })
        .expect("progress writes");
    }

    fn mark_setup_ready_for_module_step() {
        write_progress(&FirstRunProgress {
            local_ai_deferred: false,
            completed_step_ids: vec!["locations".to_string()],
            last_action: Some("choose-location".to_string()),
            last_updated_unix_seconds: now_unix_seconds(),
        })
        .expect("progress writes");
    }

    fn mark_setup_ready_for_model_step() {
        write_progress(&FirstRunProgress {
            local_ai_deferred: false,
            completed_step_ids: vec![
                "locations".to_string(),
                "modules".to_string(),
                "city-profile".to_string(),
                "first-admin".to_string(),
                "backup".to_string(),
            ],
            last_action: Some("choose-backup".to_string()),
            last_updated_unix_seconds: now_unix_seconds(),
        })
        .expect("progress writes");
    }

    fn mark_setup_ready_for_health_step() {
        write_progress(&FirstRunProgress {
            local_ai_deferred: false,
            completed_step_ids: vec![
                "locations".to_string(),
                "modules".to_string(),
                "city-profile".to_string(),
                "first-admin".to_string(),
                "backup".to_string(),
                "model".to_string(),
            ],
            last_action: Some("download-model".to_string()),
            last_updated_unix_seconds: now_unix_seconds(),
        })
        .expect("progress writes");
    }

    #[test]
    fn manifest_declares_local_only_operator_path() {
        let manifest = parse_manifest().expect("manifest parses");
        validate_manifest(&manifest).expect("manifest validates");
        assert!(manifest.local_only);
        assert!(!manifest.operator_path.requires_docker);
        assert!(!manifest.operator_path.requires_wsl);
        assert!(!manifest.operator_path.requires_terminal);
    }

    #[test]
    fn manifest_includes_required_first_run_steps() {
        let manifest = parse_manifest().expect("manifest parses");
        let step_ids: Vec<&str> = manifest.steps.iter().map(|step| step.id.as_str()).collect();
        assert_eq!(step_ids.first(), Some(&"locations"));
        for step_id in REQUIRED_STEP_IDS {
            assert!(step_ids.contains(&step_id), "missing {step_id}");
        }
        let city_profile_index = step_ids
            .iter()
            .position(|step_id| step_id == &"city-profile")
            .expect("city profile step exists");
        let first_admin_index = step_ids
            .iter()
            .position(|step_id| step_id == &"first-admin")
            .expect("first admin step exists");
        let model_index = step_ids
            .iter()
            .position(|step_id| step_id == &"model")
            .expect("model step exists");
        assert!(city_profile_index < first_admin_index);
        assert!(first_admin_index < model_index);
    }

    #[test]
    fn first_run_state_advances_to_next_unfinished_step() {
        let state = first_run_state(&["locations".to_string()]).expect("state builds");
        assert_eq!(state.current_step_id.as_deref(), Some("modules"));
        assert!(state
            .steps
            .iter()
            .any(|step| step.id == "locations" && step.completed));
        assert!(state
            .steps
            .iter()
            .any(|step| step.id == "modules" && step.current));
    }

    #[test]
    fn first_run_finish_blocks_incomplete_required_steps() {
        with_temp_state_dir(|_| {
            let result =
                first_run_action("open-app", Some("finish"), None).expect("finish response");

            assert!(!result.accepted);
            assert_eq!(result.status, "Setup incomplete");
            assert!(result.message.contains("Install and local data locations"));
            let state = first_run_state(&[]).expect("state remains unfinished");
            assert_eq!(state.current_step_id.as_deref(), Some("locations"));
            assert!(!state.finished);
        });
    }

    #[test]
    fn first_run_finish_reports_completed_product_surface() {
        with_temp_state_dir(|_| {
            let manifest = parse_manifest().expect("manifest parses");
            let completed_step_ids = manifest
                .steps
                .iter()
                .filter(|step| step.id != "finish")
                .map(|step| step.id.clone())
                .collect::<Vec<_>>();
            write_progress(&FirstRunProgress {
                local_ai_deferred: false,
                completed_step_ids,
                last_action: Some("verify-health".to_string()),
                last_updated_unix_seconds: now_unix_seconds(),
            })
            .expect("progress writes");

            let result =
                first_run_action("open-app", Some("finish"), None).expect("finish response");

            assert!(result.accepted);
            assert_eq!(result.status, "Finished");
            assert!(result.message.contains("setup is complete"));
            assert!(result.next_action.contains("Records Requests"));
            let state = first_run_state(&[]).expect("state reads finished");
            assert!(state.finished);
            assert_eq!(state.status, "Finished");
        });
    }

    #[test]
    fn first_run_model_action_downloads_through_model_setup_and_blocks_low_disk() {
        with_temp_state_dir(|_| {
            mark_setup_ready_for_model_step();
            env::set_var("CIVICSUITE_AVAILABLE_DISK_BYTES_OVERRIDE", "1");
            let result = first_run_action("download-model", Some("model"), None)
                .expect("action response is structured");
            env::remove_var("CIVICSUITE_AVAILABLE_DISK_BYTES_OVERRIDE");
            assert!(!result.accepted);
            assert_eq!(result.status, "Needs attention");
            assert!(result.message.contains("needs at least 15000000000"));
        });
    }

    #[test]
    fn first_run_model_action_advances_when_model_is_verified() {
        with_temp_state_dir(|_| {
            mark_setup_ready_for_model_step();
            env::set_var("CIVICSUITE_TEST_MODEL_VERIFIED", "1");
            let result = first_run_action("download-model", Some("model"), None)
                .expect("action response is structured");
            env::remove_var("CIVICSUITE_TEST_MODEL_VERIFIED");

            assert!(result.accepted);
            assert_eq!(result.status, "Verified");
            assert!(result.message.contains("already passed local checksum"));
            assert!(result.next_action.contains("health verification"));
            let state = first_run_state(&[]).expect("state reads saved progress");
            assert!(state
                .steps
                .iter()
                .any(|step| step.id == "model" && step.completed));
        });
    }

    #[test]
    fn first_run_model_action_cannot_skip_prior_required_steps() {
        with_temp_state_dir(|_| {
            let result = first_run_action("download-model", Some("model"), None)
                .expect("action response is structured");

            assert!(!result.accepted);
            assert_eq!(result.status, "Setup incomplete");
            assert!(result.message.contains("First admin user"));
            assert!(result.next_action.contains("current setup step"));
            let state = first_run_state(&[]).expect("state remains at first step");
            assert_eq!(state.current_step_id.as_deref(), Some("locations"));
            assert!(!state
                .steps
                .iter()
                .any(|step| step.id == "model" && step.completed));
        });
    }

    #[test]
    fn legacy_progress_keeps_model_verification_required() {
        let progress: FirstRunProgress = serde_json::from_str(
            r#"{"completed_step_ids":[],"last_action":null,"last_updated_unix_seconds":0}"#,
        )
        .expect("legacy progress parses");
        assert!(!progress.local_ai_deferred);
    }

    #[test]
    fn first_run_can_defer_model_without_downloading_weights() {
        with_temp_state_dir(|root| {
            mark_setup_ready_for_model_step();
            let result = first_run_action("defer-model", Some("model"), None)
                .expect("model deferral succeeds");
            assert!(result.accepted);
            let progress = read_progress().expect("progress persists");
            assert!(progress.local_ai_deferred);
            assert!(progress.completed_step_ids.iter().any(|id| id == "model"));
            assert_eq!(
                first_run_state(&[]).unwrap().current_step_id.as_deref(),
                Some("health")
            );
            assert!(!root.join("config").join("model-state.json").exists());
            let health = first_run_action("verify-health", Some("health"), None)
                .expect("health still checks runtime");
            assert!(!health.accepted);
            assert_eq!(health.status, "Needs runtime files");
            assert!(!health.message.contains("checksum verification"));
        });
    }

    #[test]
    fn model_deferral_cannot_bypass_required_admin_setup() {
        with_temp_state_dir(|_| {
            let result = first_run_action("defer-model", Some("model"), None).unwrap();
            assert!(!result.accepted);
            assert_eq!(result.status, "Setup incomplete");
            assert!(!read_progress().unwrap().local_ai_deferred);
            assert!(first_run_action("defer-model", Some("health"), None).is_err());
        });
    }

    #[test]
    fn first_run_health_action_requires_verified_model() {
        with_temp_state_dir(|_| {
            mark_setup_ready_for_health_step();
            let result = first_run_action("verify-health", Some("health"), None)
                .expect("action response is structured");
            assert!(!result.accepted);
            assert_eq!(result.status, "Needs attention");
            assert!(result.message.contains("checksum verification"));
        });
    }

    #[test]
    fn first_run_health_action_bootstraps_runtime_before_completion() {
        with_temp_state_dir(|root| {
            mark_setup_ready_for_health_step();
            env::set_var("CIVICSUITE_TEST_MODEL_VERIFIED", "1");
            let result = first_run_action("verify-health", Some("health"), None)
                .expect("action response is structured");
            env::remove_var("CIVICSUITE_TEST_MODEL_VERIFIED");
            assert!(!result.accepted);
            assert_eq!(result.status, "Needs runtime files");
            assert!(result.message.contains("runtime files"));
            assert!(root.join("config").join("runtime-state.json").is_file());
        });
    }

    fn with_temp_state_dir<T>(test: impl FnOnce(PathBuf) -> T) -> T {
        let _guard = test_env_lock().lock().expect("test env lock");
        let root = env::temp_dir().join(format!(
            "civicsuite-desktop-first-run-test-{}",
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
    fn first_run_location_action_creates_local_folders() {
        with_temp_state_dir(|root| {
            let result = first_run_action("choose-location", Some("locations"), None)
                .expect("locations can be created");
            assert!(result.accepted);
            assert!(root.join("Data").join("files").is_dir());
            assert!(root.join("Data").join("logs").is_dir());
            assert!(root.join("config").is_dir());
        });
    }

    #[test]
    fn first_run_location_action_persists_custom_runtime_folders() {
        with_temp_state_dir(|root| {
            let install = root.join("Program Files").join("CivicSuite");
            let data = root.join("City Data");
            let backups = root.join("City Backups");
            let payload = serde_json::json!({
                "installRoot": install.to_string_lossy(),
                "dataRoot": data.to_string_lossy(),
                "backupRoot": backups.to_string_lossy()
            });

            let result = first_run_action("choose-location", Some("locations"), Some(&payload))
                .expect("custom locations can be saved");

            assert!(result.accepted);
            assert!(data.join("files").is_dir());
            assert!(data.join("logs").is_dir());
            assert!(backups.is_dir());
            assert!(root.join("config").join("locations.json").is_file());
            assert_eq!(crate::local_paths::data_root(), data);
            assert_eq!(crate::local_paths::backup_root(), backups);

            let state = first_run_state(&[]).expect("state reads saved locations");
            assert_eq!(PathBuf::from(state.locations.data_root), data);
            assert_eq!(PathBuf::from(state.locations.backup_root), backups);
        });
    }

    #[test]
    fn first_run_module_selection_persists_profile_state() {
        with_temp_state_dir(|root| {
            mark_setup_ready_for_module_step();
            let result = first_run_action("select-modules", Some("modules"), None)
                .expect("module selection can be saved");
            assert!(result.accepted);
            assert!(root.join("config").join("module-selection.json").is_file());
            let selection =
                module_registry::module_selection_state().expect("selection state reads");
            assert_eq!(selection.profile_id, "records-beta");
        });
    }

    #[test]
    fn first_run_module_selection_accepts_valid_custom_payload() {
        with_temp_state_dir(|_| {
            mark_setup_ready_for_module_step();
            let payload = serde_json::json!({
                "profileId": "custom",
                "selectedModuleIds": ["civicclerk", "civiccode"]
            });
            let result = first_run_action("select-modules", Some("modules"), Some(&payload))
                .expect("custom module selection can be saved");
            assert!(result.accepted);
            let selection =
                module_registry::module_selection_state().expect("selection state reads");
            assert_eq!(selection.profile_id, "custom");
            assert_eq!(
                selection.installed_module_ids,
                vec![
                    "civiccore".to_string(),
                    "civicclerk".to_string(),
                    "civiccode".to_string()
                ]
            );
        });
    }

    #[test]
    fn first_admin_passcode_verifies_local_admin() {
        with_temp_state_dir(|_| {
            mark_setup_ready_for_first_admin_step();
            let admin_payload = serde_json::json!({
                "adminName": "Alex Clerk",
                "adminEmail": "alex@example.gov",
                "adminPasscode": "correct horse battery staple"
            });
            let result =
                first_run_action("create-admin", Some("first-admin"), Some(&admin_payload))
                    .expect("admin saved");
            assert!(result.accepted);

            let record = saved_admin_record()
                .expect("admin record reads")
                .expect("admin record exists");
            assert_eq!(record.passcode_algorithm, PASSCODE_ALGORITHM_ARGON2ID);
            assert!(record.passcode_hash.starts_with("$argon2id$"));
            assert!(!record
                .passcode_hash
                .contains("correct horse battery staple"));

            let admin = verify_admin_passcode("alex@example.gov", "correct horse battery staple")
                .expect("passcode verifies");
            assert_eq!(admin.role, "local-admin");
            assert!(verify_admin_passcode("alex@example.gov", "wrong passcode").is_err());
        });
    }

    #[test]
    fn first_admin_passcode_must_meet_minimum_length() {
        with_temp_state_dir(|_| {
            mark_setup_ready_for_first_admin_step();
            let short_payload = serde_json::json!({
                "adminName": "Alex Clerk",
                "adminEmail": "alex@example.gov",
                "adminPasscode": "short9chr"
            });
            assert_eq!("short9chr".chars().count(), 9);
            let rejected =
                first_run_action("create-admin", Some("first-admin"), Some(&short_payload));
            assert!(rejected.is_err(), "a 9-character passcode must be rejected");
            assert!(rejected
                .err()
                .expect("error text")
                .contains("at least 10 characters"));
            assert!(
                saved_admin_record().expect("admin record reads").is_none(),
                "no admin record is written for a rejected short passcode"
            );

            let ok_payload = serde_json::json!({
                "adminName": "Alex Clerk",
                "adminEmail": "alex@example.gov",
                "adminPasscode": "tencharsok"
            });
            assert_eq!("tencharsok".chars().count(), 10);
            let accepted = first_run_action("create-admin", Some("first-admin"), Some(&ok_payload))
                .expect("a 10-character passcode is accepted");
            assert!(accepted.accepted);
            assert!(verify_admin_passcode("alex@example.gov", "tencharsok").is_ok());
        });
    }

    #[test]
    fn legacy_sha256_admin_passcode_upgrades_after_successful_verify() {
        with_temp_state_dir(|_| {
            fs::create_dir_all(config_dir()).expect("config folder");
            let legacy_salt = "legacy-admin-salt";
            let legacy_hash = hash_admin_passcode(legacy_salt, "legacy passcode");
            fs::write(
                config_dir().join("first-admin.json"),
                format!(
                    r#"{{
  "display_name": "Alex Clerk",
  "email": "alex@example.gov",
  "role": "local-admin",
  "passcode_salt": "{legacy_salt}",
  "passcode_hash": "{legacy_hash}"
}}
"#
                ),
            )
            .expect("legacy admin record");

            let admin = verify_admin_passcode("alex@example.gov", "legacy passcode")
                .expect("legacy passcode verifies");
            assert_eq!(admin.role, "local-admin");
            let upgraded = saved_admin_record()
                .expect("admin record reads")
                .expect("admin record exists");
            assert_eq!(upgraded.passcode_algorithm, PASSCODE_ALGORITHM_ARGON2ID);
            assert!(upgraded.passcode_hash.starts_with("$argon2id$"));
            assert_ne!(upgraded.passcode_salt, legacy_salt);
            assert!(verify_admin_passcode("alex@example.gov", "legacy passcode").is_ok());
        });
    }

    #[test]
    fn city_profile_requires_payload_before_completion() {
        with_temp_state_dir(|_| {
            mark_setup_ready_for_city_profile_step();
            let result = first_run_action("create-city-profile", Some("city-profile"), None);
            assert!(result.is_err());
            assert!(result.err().expect("error text").contains("cityName"));
        });
    }

    #[test]
    fn first_run_repair_action_uses_real_supervisor_without_advancing_setup() {
        with_temp_state_dir(|root| {
            let result =
                first_run_action("repair", None, None).expect("repair action is structured");

            assert!(!result.accepted);
            assert_eq!(result.status, "Needs runtime files");
            assert!(result.message.contains("runtime files"));
            assert!(root.join("config").join("runtime-state.json").is_file());
            let state = first_run_state(&[]).expect("first-run progress did not advance");
            assert_eq!(
                state.current_step_id.as_deref(),
                Some("locations"),
                "recovery actions must not complete setup steps"
            );
        });
    }

    #[test]
    fn first_run_backup_action_uses_real_supervisor_without_advancing_setup() {
        with_temp_state_dir(|root| {
            fs::create_dir_all(root.join("Data").join("files")).expect("data folder");
            fs::write(
                root.join("Data").join("files").join("record.txt"),
                "official",
            )
            .expect("data file");
            fs::create_dir_all(root.join("config")).expect("config folder");
            fs::write(root.join("config").join("city-profile.json"), "{}").expect("config file");

            let result =
                first_run_action("backup", None, None).expect("backup action is structured");

            assert!(result.accepted);
            assert_eq!(result.status, "Backup complete");
            assert!(root
                .join("Backups")
                .read_dir()
                .expect("backups")
                .filter_map(Result::ok)
                .any(|entry| entry.file_name().to_string_lossy().contains("manual")));
            let state = first_run_state(&[]).expect("first-run progress did not advance");
            assert_eq!(state.current_step_id.as_deref(), Some("locations"));
        });
    }

    #[test]
    fn first_run_uninstall_action_uses_real_supervisor_final_backup() {
        with_temp_state_dir(|root| {
            fs::create_dir_all(root.join("Data").join("files")).expect("data folder");
            fs::write(
                root.join("Data").join("files").join("record.txt"),
                "official",
            )
            .expect("data file");
            fs::create_dir_all(root.join("config")).expect("config folder");
            fs::write(root.join("config").join("city-profile.json"), "{}").expect("config file");

            let result =
                first_run_action("uninstall", None, None).expect("uninstall action is structured");

            assert!(result.accepted);
            assert_eq!(result.status, "Local profile removed");
            assert!(!root.join("Data").exists());
            assert!(!root.join("config").exists());
            assert!(root
                .join("Backups")
                .read_dir()
                .expect("backups")
                .filter_map(Result::ok)
                .any(|entry| entry
                    .file_name()
                    .to_string_lossy()
                    .contains("final-uninstall")));
        });
    }
}
