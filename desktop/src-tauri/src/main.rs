mod atomic_io;
mod auth;
mod demo_fixture;
mod first_run;
mod local_paths;
mod local_shell;
mod model;
mod module_registry;
#[cfg(test)]
mod records_golden_contract;
mod supervisor;
mod workflows;

use auth::{AccessState, AuthActionResult, LocalUserSummary};
use first_run::{FirstRunActionResult, FirstRunState, SavedCityProfile};
use model::{ModelActionResult, ModelState};
use module_registry::{ModuleProfileSummary, ModuleSelectionState, ModuleSummary};
use serde::Serialize;
use serde_json::Value;
use std::panic::{catch_unwind, AssertUnwindSafe};
use supervisor::{RuntimeHealthItem, SupervisorActionResult};
use workflows::{CityWorkActionResult, CityWorkState};

const MODULES_JSON: &str = include_str!("../../../installer/modules.json");

#[derive(Serialize)]
struct NavigationItem {
    id: &'static str,
    label: &'static str,
    description: &'static str,
}

#[derive(Serialize)]
struct AppState {
    product_name: &'static str,
    status_label: &'static str,
    local_only: bool,
    navigation: Vec<NavigationItem>,
    modules: Vec<ModuleSummary>,
    module_profiles: Vec<ModuleProfileSummary>,
    module_selection: ModuleSelectionState,
    installer_steps: Vec<&'static str>,
    first_run: FirstRunState,
    city_profile: Option<SavedCityProfile>,
    users: Vec<LocalUserSummary>,
    access: AccessState,
    model: ModelState,
    health: Vec<RuntimeHealthItem>,
    city_work: CityWorkState,
}

#[derive(Serialize)]
struct ModuleActionResult {
    accepted: bool,
    action: String,
    status: &'static str,
    message: String,
    next_action: &'static str,
    selection: ModuleSelectionState,
    modules: Vec<ModuleSummary>,
}

fn navigation() -> Vec<NavigationItem> {
    vec![
        NavigationItem {
            id: "home",
            label: "Home",
            description: "Work that needs attention",
        },
        NavigationItem {
            id: "meetings",
            label: "Meetings & Notices",
            description: "Agendas, notices, minutes, votes",
        },
        NavigationItem {
            id: "records",
            label: "Records Requests",
            description: "Intake, review, response, exports",
        },
        NavigationItem {
            id: "code",
            label: "Code & Ordinances",
            description: "Search, imports, guidance, handoffs",
        },
        NavigationItem {
            id: "notice",
            label: "Public Notices",
            description: "Deadlines, proof, archive packets",
        },
        NavigationItem {
            id: "access",
            label: "Accessibility",
            description: "WCAG review, plain language, multilingual, exports",
        },
        NavigationItem {
            id: "search",
            label: "Search City Knowledge",
            description: "Cross-module local search with citations",
        },
        NavigationItem {
            id: "health",
            label: "System Health",
            description: "Local services, model, backup, repair",
        },
        NavigationItem {
            id: "settings",
            label: "Settings",
            description: "City profile, users, modules",
        },
    ]
}

fn installer_steps() -> Vec<&'static str> {
    vec![
        "Choose install and local data locations.",
        "Install Townlight Core and the selected Townlight product profile.",
        "Create city profile and first admin user.",
        "Download and verify Gemma 4 12B quantization-aware weights.",
        "Verify local health, backup, repair, and uninstall entry points.",
    ]
}

fn module_summaries() -> Result<Vec<ModuleSummary>, String> {
    let _registry_source = MODULES_JSON;
    module_registry::module_summaries()
}

fn access_is_local_admin(access: &AccessState) -> bool {
    access.signed_in && access.role.as_deref() == Some("local-admin")
}

fn access_is_signed_in(access: &AccessState) -> bool {
    access.signed_in
}

fn require_role_for_city_work(
    access: &AccessState,
    action: &str,
    payload: Option<&Value>,
) -> Result<(), String> {
    let Some(role) = access.role.as_deref() else {
        return Err(
            "Sign in with a staff or Townlight admin account before changing city work."
                .to_string(),
        );
    };
    let Some((module_ids, allow_any)) = city_work_action_module_requirement(action, payload) else {
        return Ok(());
    };
    if auth::role_allows_modules(role, &module_ids, allow_any) {
        return Ok(());
    }
    Err(format!(
        "Your local role ({role}) is not allowed to use this module workflow. Ask a Townlight admin to adjust your account."
    ))
}

fn public_model_state(mut model: ModelState) -> ModelState {
    model.artifact.local_path =
        "Sign in as Townlight admin to view the model file path.".to_string();
    model
}

fn public_runtime_health(mut health: Vec<RuntimeHealthItem>) -> Vec<RuntimeHealthItem> {
    for item in &mut health {
        item.admin_detail.clear();
    }
    health
}

fn city_work_action_module_requirement(
    action: &str,
    payload: Option<&Value>,
) -> Option<(Vec<&'static str>, bool)> {
    match action {
        "create-meeting-body"
        | "add-meeting-member"
        | "create-meeting"
        | "add-agenda-item"
        | "submit-agenda-intake"
        | "review-agenda-intake"
        | "promote-agenda-intake"
        | "record-staff-report"
        | "add-meeting-attachment"
        | "finalize-meeting-packet"
        | "add-code-handoff-agenda"
        | "calculate-notice-deadline"
        | "complete-notice-checklist"
        | "post-notice"
        | "record-minutes"
        | "record-motion"
        | "add-minute-citation"
        | "suggest-minutes-draft"
        | "record-vote"
        | "record-member-vote"
        | "record-meeting-attendance"
        | "record-quorum-check"
        | "add-action-item"
        | "record-resident-comment"
        | "submit-public-comment"
        | "review-public-comment"
        | "redact-public-comment"
        | "adopt-minutes"
        | "sign-minutes"
        | "record-closed-session"
        | "export-meeting-packet"
        | "archive-meeting" => Some((vec!["civicclerk"], false)),
        "civicnotice-calculate-deadline"
        | "civicnotice-complete-checklist"
        | "civicnotice-post-notice"
        | "civicnotice-export-archive-packet" => Some((vec!["civicclerk", "civicnotice"], false)),
        "record-adopted-legislation" => Some((vec!["civicclerk", "civiccode"], false)),
        "create-records-request"
        | "load-demo-town"
        | "submit-public-records-request"
        | "lookup-public-records-request"
        | "add-public-records-message"
        | "set-records-deadline"
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
        | "approve-records-response"
        | "build-records-release-package"
        | "export-records-response"
        | "fulfill-records-request"
        | "close-records-request"
        | "mark-notification-sent" => Some((vec!["civicrecords-ai"], false)),
        "import-code-source"
        | "record-codifier-sync"
        | "record-codifier-sync-failure"
        | "retry-codifier-sync"
        | "mark-code-stale"
        | "suggest-code-guidance"
        | "draft-code-guidance"
        | "approve-code-guidance"
        | "publish-code-source"
        | "unpublish-code-source"
        | "create-code-handoff"
        | "answer-code-question" => Some((vec!["civiccode"], false)),
        "search-city-knowledge" => Some((
            vec![
                "civicclerk",
                "civicrecords-ai",
                "civiccode",
                "civicnotice",
                "civicaccess",
            ],
            true,
        )),
        "open-exports-folder" => match payload
            .and_then(|value| value.get("folder"))
            .and_then(Value::as_str)
        {
            Some("meetings") => Some((vec!["civicclerk"], false)),
            Some("records") => Some((vec!["civicrecords-ai"], false)),
            Some("code") => Some((vec!["civiccode"], false)),
            Some("notice") => Some((vec!["civicnotice"], false)),
            Some("access") => Some((vec!["civicaccess"], false)),
            _ => Some((
                vec!["civicclerk", "civicrecords-ai", "civiccode", "civicnotice"],
                true,
            )),
        },
        "accessibility-review"
        | "civicaccess-records-export"
        | "civicaccess-delete-review"
        | "civicaccess-plain-language"
        | "civicaccess-language-variant"
        | "civicaccess-form-plan"
        | "civicaccess-publishing-workflow"
        | "civicaccess-ada-title-ii"
        | "civicaccess-tagged-pdf" => Some((vec!["civicaccess"], false)),
        _ => None,
    }
}

fn module_display_name(module_id: &str) -> String {
    module_summaries()
        .ok()
        .and_then(|modules| {
            modules
                .into_iter()
                .find(|module| module.id == module_id)
                .map(|module| module.display_name)
        })
        .unwrap_or_else(|| module_id.to_string())
}

fn module_exports_folder(module_id: &str) -> Option<(&'static str, &'static str)> {
    match module_id {
        "civicclerk" => Some(("meetings", "meeting exports")),
        "civicrecords-ai" => Some(("records", "records exports")),
        "civiccode" => Some(("code", "code exports")),
        "civicnotice" => Some(("notice", "notice exports")),
        "civicaccess" => Some(("access", "accessibility/records exports")),
        _ => None,
    }
}

fn require_enabled_city_modules(action: &str, payload: Option<&Value>) -> Result<(), String> {
    let Some((module_ids, allow_any)) = city_work_action_module_requirement(action, payload) else {
        return Ok(());
    };
    let selection = module_registry::module_selection_state()?;
    let enabled = module_ids
        .iter()
        .filter(|module_id| {
            selection
                .enabled_module_ids
                .iter()
                .any(|enabled_id| enabled_id == **module_id)
        })
        .copied()
        .collect::<Vec<_>>();
    if (allow_any && !enabled.is_empty()) || (!allow_any && enabled.len() == module_ids.len()) {
        return Ok(());
    }
    let missing = module_ids
        .iter()
        .filter(|module_id| !enabled.iter().any(|enabled_id| enabled_id == *module_id))
        .map(|module_id| module_display_name(module_id))
        .collect::<Vec<_>>();
    Err(format!(
        "{} {} not enabled in this local profile. Install or enable {} in Settings before using this workflow.",
        missing.join(", "),
        if missing.len() == 1 { "is" } else { "are" },
        if missing.len() == 1 { "it" } else { "them" }
    ))
}

fn filter_search_results_for_enabled_modules(
    result: &mut CityWorkActionResult,
) -> Result<(), String> {
    let selection = module_registry::module_selection_state()?;
    result.search_results.retain(|search_result| {
        selection
            .enabled_module_ids
            .iter()
            .any(|module_id| module_id == &search_result.module_id)
    });
    Ok(())
}

fn filter_search_results_for_access(result: &mut CityWorkActionResult, access: &AccessState) {
    let Some(role) = access.role.as_deref() else {
        return;
    };
    result
        .search_results
        .retain(|search_result| auth::role_allows_module(role, &search_result.module_id));
}

fn first_run_action_requires_admin_after_setup(action: &str) -> bool {
    matches!(
        action,
        "choose-location"
            | "select-modules"
            | "download-model"
            | "create-city-profile"
            | "create-admin"
            | "choose-backup"
            | "verify-health"
            | "open-app"
            | "repair"
            | "backup"
            | "uninstall"
    )
}

fn app_state() -> Result<AppState, String> {
    let access = auth::access_state()?;
    let admin_signed_in = access_is_local_admin(&access);
    let signed_in = access_is_signed_in(&access);
    let city_work = if signed_in {
        workflows::city_work_state()?
    } else {
        workflows::public_city_work_state()?
    };
    let users = if admin_signed_in {
        auth::saved_users()?
    } else {
        Vec::new()
    };
    let model = if admin_signed_in {
        model::model_state()?
    } else {
        public_model_state(model::model_state()?)
    };
    let health = if admin_signed_in {
        supervisor::runtime_health()?
    } else {
        public_runtime_health(supervisor::runtime_health()?)
    };
    Ok(AppState {
        product_name: "Townlight",
        status_label: "Windows Local 1.0 desktop",
        local_only: true,
        navigation: navigation(),
        modules: module_summaries()?,
        module_profiles: module_registry::module_profiles()?,
        module_selection: module_registry::module_selection_state()?,
        installer_steps: installer_steps(),
        first_run: first_run::first_run_state(&[])?,
        city_profile: first_run::saved_city_profile()?,
        users,
        access,
        model,
        health,
        city_work,
    })
}

#[tauri::command]
async fn get_app_state() -> Result<AppState, String> {
    tauri::async_runtime::spawn_blocking(move || {
        catch_unwind(AssertUnwindSafe(app_state)).map_err(|_| {
            "App state stopped unexpectedly. Restart Townlight and retry; if this repeats, use Repair from System Health."
                .to_string()
        })?
    })
    .await
    .map_err(|error| format!("App state could not load: {error}"))?
}

#[tauri::command]
fn get_model_state() -> Result<ModelState, String> {
    let access = auth::access_state()?;
    let model = model::model_state()?;
    if access_is_local_admin(&access) {
        Ok(model)
    } else {
        Ok(public_model_state(model))
    }
}

fn model_action_authorized(action: String) -> Result<ModelActionResult, String> {
    let access = auth::access_state()?;
    if !access_is_local_admin(&access) {
        if !access.configured {
            return Err(
                "Create the first Townlight admin and sign in before changing local model setup."
                    .to_string(),
            );
        }
        return Err(
            "Sign in as the Townlight admin before changing local model setup.".to_string(),
        );
    }
    model::model_action(&action)
}

#[tauri::command]
async fn model_action(action: String) -> Result<ModelActionResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        catch_unwind(AssertUnwindSafe(|| model_action_authorized(action)))
            .map_err(|_| "Model setup action stopped unexpectedly. Restart Townlight and retry; if this repeats, use Repair from System Health.".to_string())?
    })
    .await
    .map_err(|error| format!("Model setup action could not complete: {error}"))?
}

#[tauri::command]
fn preview_first_run_state(completed_step_ids: Vec<String>) -> Result<FirstRunState, String> {
    first_run::first_run_state(&completed_step_ids)
}

fn first_run_action_authorized(
    action: String,
    step_id: Option<String>,
    payload: Option<Value>,
) -> Result<FirstRunActionResult, String> {
    let access = auth::access_state()?;
    if access.configured
        && !access_is_local_admin(&access)
        && first_run_action_requires_admin_after_setup(&action)
    {
        return Err(
            "Sign in as the Townlight admin before changing setup, profile, model, backup, or runtime settings."
                .to_string(),
        );
    }
    first_run::first_run_action(&action, step_id.as_deref(), payload.as_ref())
}

#[tauri::command]
async fn first_run_action(
    action: String,
    step_id: Option<String>,
    payload: Option<Value>,
) -> Result<FirstRunActionResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        catch_unwind(AssertUnwindSafe(|| {
            first_run_action_authorized(action, step_id, payload)
        }))
        .map_err(|_| {
            "First-run action stopped unexpectedly. Restart Townlight and retry; if this repeats, use Repair from System Health."
                .to_string()
        })?
    })
    .await
    .map_err(|error| format!("First-run action could not complete: {error}"))?
}

#[tauri::command]
fn auth_action(action: String, payload: Option<Value>) -> Result<AuthActionResult, String> {
    auth::auth_action(&action, payload.as_ref())
}

fn supervisor_action_authorized(
    action: String,
    service_id: Option<String>,
) -> Result<SupervisorActionResult, String> {
    if action != "health" {
        auth::require_admin_session()?;
    }
    supervisor::supervisor_action(&action, service_id.as_deref())
}

#[tauri::command]
async fn supervisor_action(
    action: String,
    service_id: Option<String>,
) -> Result<SupervisorActionResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        catch_unwind(AssertUnwindSafe(|| {
            supervisor_action_authorized(action, service_id)
        }))
        .map_err(|_| {
            "System Health action stopped unexpectedly. Restart Townlight and retry; if this repeats, use Repair from System Health."
                .to_string()
        })?
    })
    .await
    .map_err(|error| format!("System Health action could not complete: {error}"))?
}

fn picked_file_path_for_desktop() -> Result<Option<String>, String> {
    if let Ok(path) = std::env::var("CIVICSUITE_TEST_FILE_PICKER_PATH") {
        let trimmed = path.trim();
        return Ok(if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        });
    }

    #[cfg(target_os = "windows")]
    {
        Ok(rfd::FileDialog::new()
            .set_title("Choose Townlight evidence file")
            .pick_file()
            .map(|path| path.display().to_string()))
    }

    #[cfg(not(target_os = "windows"))]
    {
        Err("Native file selection is only available in the Windows desktop app.".to_string())
    }
}

fn picked_folder_path_for_desktop() -> Result<Option<String>, String> {
    if let Ok(path) = std::env::var("CIVICSUITE_TEST_FOLDER_PICKER_PATH") {
        let trimmed = path.trim();
        return Ok(if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        });
    }

    #[cfg(target_os = "windows")]
    {
        Ok(rfd::FileDialog::new()
            .set_title("Choose Townlight folder")
            .pick_folder()
            .map(|path| path.display().to_string()))
    }

    #[cfg(not(target_os = "windows"))]
    {
        Err("Native folder selection is only available in the Windows desktop app.".to_string())
    }
}

#[tauri::command]
fn choose_file_path() -> Result<Option<String>, String> {
    auth::require_signed_in_session()?;
    picked_file_path_for_desktop()
}

#[tauri::command]
fn choose_folder_path() -> Result<Option<String>, String> {
    let access = auth::access_state()?;
    if access.configured && !access_is_local_admin(&access) {
        return Err("Sign in as the Townlight admin before choosing folders.".to_string());
    }
    picked_folder_path_for_desktop()
}

#[tauri::command]
fn module_action(action: String, module_id: String) -> Result<ModuleActionResult, String> {
    let access = auth::access_state()?;
    if access.configured && !access_is_local_admin(&access) {
        return Err(
            "Sign in as the Townlight admin before changing installed modules.".to_string(),
        );
    }
    let previous_selection = module_registry::module_selection_state()?;
    let was_installed = previous_selection
        .installed_module_ids
        .iter()
        .any(|installed_id| installed_id == &module_id);
    let display_name = module_display_name(&module_id);
    let mut removal_backup_message = None;
    let selection = match action.as_str() {
        "enable-module" => module_registry::set_module_enabled(&module_id, true)?,
        "disable-module" => module_registry::set_module_enabled(&module_id, false)?,
        "install-module" => module_registry::set_module_installed(&module_id, true)?,
        "remove-module" => {
            if was_installed {
                let backup = supervisor::supervisor_action("backup", None)?;
                removal_backup_message = Some(backup.message);
                module_registry::set_module_installed(&module_id, false)?
            } else {
                previous_selection
            }
        }
        "update-module" => previous_selection,
        "open-module-exports" => {
            if !was_installed {
                return Err(format!(
                    "{display_name} is not installed in this local profile. Install it before opening its exports folder."
                ));
            }
            let Some((folder, _label)) = module_exports_folder(&module_id) else {
                return Err(format!(
                    "{display_name} does not have a module exports folder."
                ));
            };
            let path = local_paths::data_root().join("exports").join(folder);
            local_shell::open_local_folder(&path)?;
            previous_selection
        }
        _ => return Err(format!("Unsupported module action: {action}")),
    };
    let modules = module_summaries()?;
    let is_installed = selection
        .installed_module_ids
        .iter()
        .any(|installed_id| installed_id == &module_id);
    let is_enabled = selection
        .enabled_module_ids
        .iter()
        .any(|enabled_id| enabled_id == &module_id);
    let (status, message, next_action) = match action.as_str() {
        "enable-module" => (
            "Module enabled",
            format!("{display_name} is enabled in the local Townlight shell."),
            "Review the module list or continue city work.",
        ),
        "disable-module" => (
            "Module disabled",
            format!("{display_name} is disabled in the local Townlight shell. Its data remains installed and can be re-enabled."),
            "Review the module list or continue city work.",
        ),
        "install-module" if was_installed => (
            "Module already installed",
            format!("{display_name} is already installed in this local profile."),
            "Enable the module if it is disabled, or continue city work.",
        ),
        "install-module" => (
            "Module installed",
            format!("{display_name} is installed and enabled in this local profile."),
            "Review the module list or open the module work area.",
        ),
        "remove-module" if !was_installed => (
            "Module not installed",
            format!("{display_name} is not installed in this local profile."),
            "Choose an available module to install.",
        ),
        "remove-module" => (
            "Module removed",
            format!(
                "{display_name} is removed from the active local profile after a verified profile backup. Existing module data was not deleted and remains covered by profile backup/restore. {}",
                removal_backup_message
                    .as_deref()
                    .unwrap_or("The profile backup completed before removal.")
            ),
            "Install the module again if staff need this work area.",
        ),
        "update-module" => (
            "Module current",
            if is_installed {
                format!("{display_name} is already on the pinned version for this module manifest.")
            } else {
                format!("{display_name} is not installed; install it before checking updates.")
            },
            "Review module versions in Settings.",
        ),
        "open-module-exports" => {
            let (folder, label) =
                module_exports_folder(&module_id).expect("module export folder already checked");
            let path = local_paths::data_root().join("exports").join(folder);
            (
                "Module exports opened",
                format!(
                    "Opened the local {label} folder for {display_name}: {}",
                    path.display()
                ),
                "Use generated export files for clerk review, public records response, or local backup evidence.",
            )
        }
        _ => unreachable!("unsupported module action already returned"),
    };
    Ok(ModuleActionResult {
        accepted: true,
        action,
        status,
        message,
        next_action: if is_enabled || !matches!(status, "Module installed") {
            next_action
        } else {
            "Enable required dependencies before opening this module."
        },
        selection,
        modules,
    })
}

#[tauri::command]
fn get_city_work_state() -> Result<CityWorkState, String> {
    let access = auth::access_state()?;
    if access_is_signed_in(&access) {
        workflows::city_work_state()
    } else {
        workflows::public_city_work_state()
    }
}

fn city_work_action_authorized(
    action: String,
    payload: Option<Value>,
) -> Result<CityWorkActionResult, String> {
    let mut payload = payload;
    let access = auth::access_state()?;
    let signed_in = access_is_signed_in(&access);
    let public_action = workflows::city_work_action_allows_public(&action);
    if action == "load-demo-town" && !access_is_local_admin(&access) {
        return Err(
            "Sign in with a Townlight admin account before loading demonstration data.".to_string(),
        );
    }
    if !signed_in {
        if !access.configured {
            return Err(
                "Finish first-run setup before public city workflows are available.".to_string(),
            );
        }
        if !public_action {
            auth::require_signed_in_session()?;
        }
        if action == "answer-code-question" {
            let mut public_payload = payload.unwrap_or_else(|| serde_json::json!({}));
            let Some(fields) = public_payload.as_object_mut() else {
                return Err("Public code questions must use a JSON object payload.".to_string());
            };
            fields.insert("publicOnly".to_string(), Value::Bool(true));
            payload = Some(public_payload);
        }
    } else {
        require_role_for_city_work(&access, &action, payload.as_ref())?;
    }
    require_enabled_city_modules(&action, payload.as_ref())?;
    let mut result = workflows::city_work_action(&action, payload.as_ref())?;
    if action == "search-city-knowledge" {
        filter_search_results_for_enabled_modules(&mut result)?;
        filter_search_results_for_access(&mut result, &access);
        result.message = format!(
            "Local search completed across enabled modules with {} result(s).",
            result.search_results.len()
        );
    }
    if !signed_in
        && public_action
        && action != "lookup-public-records-request"
        && action != "add-public-records-message"
    {
        result.state = workflows::city_work_public_projection(&result.state);
    }
    Ok(result)
}

#[tauri::command]
async fn city_work_action(
    action: String,
    payload: Option<Value>,
) -> Result<CityWorkActionResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        catch_unwind(AssertUnwindSafe(|| {
            city_work_action_authorized(action, payload)
        }))
        .map_err(|_| {
            "City workflow action stopped unexpectedly. Restart Townlight and retry; if this repeats, use Repair from System Health."
                .to_string()
        })?
    })
    .await
    .map_err(|error| format!("City workflow action could not complete: {error}"))?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            // A second launch was attempted. Do NOT start a second process that
            // would concurrently read-modify-write the system-of-record files.
            // Focus the already-running instance's window instead.
            use tauri::Manager;
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .on_window_event(|_window, event| {
            if matches!(event, tauri::WindowEvent::CloseRequested { .. }) {
                let _ = supervisor::supervisor_action("stop", None);
            }
        })
        .invoke_handler(tauri::generate_handler![
            get_app_state,
            get_model_state,
            model_action,
            preview_first_run_state,
            first_run_action,
            auth_action,
            supervisor_action,
            choose_file_path,
            choose_folder_path,
            module_action,
            get_city_work_state,
            city_work_action
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Townlight desktop");
}

fn main() {
    run();
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::env;
    use std::fs;
    use std::path::PathBuf;

    fn with_clean_first_run_state<T>(test: impl FnOnce(PathBuf) -> T) -> T {
        let _guard = first_run::test_env_lock().lock().expect("test env lock");
        let root = env::temp_dir().join(format!(
            "civicsuite-desktop-app-state-test-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&root);
        env::set_var("CIVICSUITE_DESKTOP_STATE_DIR", &root);
        let result = test(root.clone());
        env::remove_var("CIVICSUITE_DESKTOP_STATE_DIR");
        let _ = fs::remove_dir_all(root);
        result
    }

    fn create_first_admin() {
        first_run::first_run_action("choose-location", Some("locations"), None)
            .expect("locations saved");
        let module_payload = serde_json::json!({ "profileId": "city-core" });
        first_run::first_run_action("select-modules", Some("modules"), Some(&module_payload))
            .expect("modules saved");
        let city_payload = serde_json::json!({
            "cityName": "Brookfield",
            "state": "CO",
            "timeZone": "America/Denver",
            "recordsContact": "records@example.gov",
            "clerkContact": "clerk@example.gov"
        });
        first_run::first_run_action(
            "create-city-profile",
            Some("city-profile"),
            Some(&city_payload),
        )
        .expect("city profile saved");
        let admin_payload = serde_json::json!({
            "adminName": "Alex Clerk",
            "adminEmail": "alex@example.gov",
            "adminPasscode": "correct horse battery staple"
        });
        let result =
            first_run::first_run_action("create-admin", Some("first-admin"), Some(&admin_payload))
                .expect("admin saved");
        assert!(result.accepted);
    }

    fn sign_in_as_first_admin() {
        let sign_in_payload = serde_json::json!({
            "email": "alex@example.gov",
            "passcode": "correct horse battery staple"
        });
        auth::auth_action("sign-in", Some(&sign_in_payload)).expect("admin signed in");
    }

    fn create_staff_user(name: &str, email: &str, role: &str, passcode: &str) {
        let payload = serde_json::json!({
            "userName": name,
            "userEmail": email,
            "userRole": role,
            "userPasscode": passcode
        });
        auth::auth_action("create-user", Some(&payload)).expect("staff user saved");
    }

    fn sign_in_as_user(email: &str, passcode: &str) {
        let payload = serde_json::json!({
            "email": email,
            "passcode": passcode
        });
        auth::auth_action("sign-in", Some(&payload)).expect("user signed in");
    }

    #[test]
    fn records_beta_modules_are_reported_installed() {
        module_registry::validate_default_registry().expect("module registry contract validates");
        let modules = module_summaries().expect("module registry parses");
        for module_id in ["civiccore", "civicrecords-ai", "civicnotice", "civicaccess"] {
            let module = modules
                .iter()
                .find(|candidate| candidate.id == module_id)
                .expect("records-beta module exists");
            assert!(
                module.installed,
                "{module_id} should be installed in records-beta"
            );
        }
        for module_id in ["civicclerk", "civiccode"] {
            let module = modules
                .iter()
                .find(|candidate| candidate.id == module_id)
                .expect("queued module exists");
            assert!(
                !module.installed,
                "{module_id} should not be installed in records-beta"
            );
        }
    }

    #[test]
    fn navigation_is_task_first() {
        let labels: Vec<&str> = navigation().into_iter().map(|item| item.label).collect();
        assert!(labels.contains(&"Meetings & Notices"));
        assert!(labels.contains(&"Records Requests"));
        assert!(labels.contains(&"Code & Ordinances"));
        assert!(!labels.contains(&"Docker"));
        assert!(!labels.contains(&"WSL"));
    }

    #[test]
    fn navigation_matches_frontend_fallback_state() {
        // The live shell renders navigation() while main.js keeps a hardcoded
        // fallbackState list for the offline path. v1.0.2 shipped with `access`
        // present in the fallback but absent here, so the Accessibility tab was
        // unreachable on every install. Keep the two ids in lockstep.
        let main_js = include_str!("../../src/main.js");
        let start = main_js
            .find("navigation: [")
            .expect("fallbackState.navigation block");
        let end = main_js[start..]
            .find("].map(")
            .expect("end of fallbackState.navigation");
        let block = &main_js[start..start + end];

        for item in navigation() {
            let needle = format!("[\"{}\"", item.id);
            assert!(
                block.contains(&needle),
                "navigation() id `{}` is missing from main.js fallbackState.navigation",
                item.id
            );
        }
        let rust_ids: Vec<&str> = navigation().into_iter().map(|item| item.id).collect();
        for line in block.lines() {
            let trimmed = line.trim();
            if !trimmed.starts_with("[\"") {
                continue;
            }
            let id = trimmed
                .trim_start_matches("[\"")
                .split('"')
                .next()
                .expect("fallback nav id");
            assert!(
                rust_ids.contains(&id),
                "main.js fallbackState.navigation id `{id}` is missing from navigation()"
            );
        }
    }

    #[test]
    fn app_state_reports_runtime_health_from_manifest() {
        with_clean_first_run_state(|_| {
            let state = app_state().expect("app state builds");
            assert!(state.health.iter().any(|item| item.id == "desktop-shell"));
            assert!(state.health.iter().any(|item| item.id == "postgres"));
            assert!(state.health.iter().any(|item| item.id == "model-runtime"));
        });
    }

    #[test]
    fn app_state_reports_model_readiness_contract() {
        with_clean_first_run_state(|_| {
            let state = app_state().expect("app state builds");
            assert_eq!(state.model.display_name, "Gemma 4 12B QAT Q4_0");
            assert_eq!(state.model.status, "Needs download");
            assert!(state.model.artifact.checksum_required);
            assert!(state
                .model
                .checks
                .iter()
                .any(|check| check.id == "checksum" && !check.ok));
        });
    }

    #[test]
    fn model_state_hides_local_path_without_admin_session() {
        with_clean_first_run_state(|_| {
            create_first_admin();

            let public_model = get_model_state().expect("model state");
            assert_eq!(
                public_model.artifact.local_path,
                "Sign in as Townlight admin to view the model file path."
            );

            sign_in_as_first_admin();
            let staff_model = get_model_state().expect("staff model state");
            assert!(staff_model
                .artifact
                .local_path
                .contains("gemma-4-12b-it-qat-q4_0.gguf"));
        });
    }

    #[test]
    fn model_actions_require_local_admin_session() {
        with_clean_first_run_state(|_| {
            let pre_admin_result = model_action_authorized("open-model-folder".to_string());
            assert!(pre_admin_result.is_err());
            assert!(pre_admin_result
                .err()
                .expect("pre-admin model action auth error")
                .contains("Create the first Townlight admin and sign in"));

            create_first_admin();

            let signed_out_result = model_action_authorized("open-model-folder".to_string());

            assert!(signed_out_result.is_err());
            assert!(signed_out_result
                .err()
                .expect("model action auth error")
                .contains("Sign in as the Townlight admin"));

            sign_in_as_first_admin();
            let signed_in_result = model_action_authorized("open-model-folder".to_string())
                .expect("model action allowed");
            assert!(signed_in_result.accepted);
        });
    }

    #[test]
    fn supervisor_command_wrapper_completes_backup_action() {
        with_clean_first_run_state(|root| {
            create_first_admin();
            sign_in_as_first_admin();

            let result =
                tauri::async_runtime::block_on(supervisor_action("backup".to_string(), None))
                    .expect("backup command returns through async wrapper");

            assert!(result.accepted);
            assert_eq!(result.status, "Backup complete");
            assert!(result.message.contains("backup-manifest.json"));
            assert!(fs::read_dir(root.join("Backups"))
                .expect("backup root exists")
                .any(|entry| entry
                    .expect("backup entry")
                    .path()
                    .join("backup-manifest.json")
                    .is_file()));
        });
    }

    #[test]
    fn module_actions_require_admin_after_first_admin_exists() {
        with_clean_first_run_state(|root| {
            create_first_admin();

            let signed_out_result =
                module_action("disable-module".to_string(), "civiccode".to_string());

            assert!(signed_out_result.is_err());
            assert!(signed_out_result
                .err()
                .expect("module action auth error")
                .contains("Sign in as the Townlight admin"));

            sign_in_as_first_admin();
            let disabled = module_action("disable-module".to_string(), "civiccode".to_string())
                .expect("module disable allowed");
            assert!(disabled.accepted);
            assert_eq!(disabled.status, "Module disabled");
            assert!(disabled
                .selection
                .installed_module_ids
                .iter()
                .any(|module_id| module_id == "civiccode"));
            assert!(!disabled
                .selection
                .enabled_module_ids
                .iter()
                .any(|module_id| module_id == "civiccode"));
            assert!(disabled
                .modules
                .iter()
                .any(|module| module.id == "civiccode" && module.installed && !module.enabled));

            let enabled = module_action("enable-module".to_string(), "civiccode".to_string())
                .expect("module enable allowed");
            assert!(enabled
                .selection
                .enabled_module_ids
                .iter()
                .any(|module_id| module_id == "civiccode"));

            let current = module_action("update-module".to_string(), "civiccode".to_string())
                .expect("module update check allowed");
            assert_eq!(current.status, "Module current");
            assert!(current.message.contains("pinned version"));

            let opened_exports =
                module_action("open-module-exports".to_string(), "civiccode".to_string())
                    .expect("module exports open");
            assert_eq!(opened_exports.status, "Module exports opened");
            assert!(opened_exports.message.contains("code exports"));
            assert!(root.join("Data").join("exports").join("code").is_dir());

            let removed = module_action("remove-module".to_string(), "civiccode".to_string())
                .expect("module remove allowed");
            assert_eq!(removed.status, "Module removed");
            assert!(removed.message.contains("verified profile backup"));
            assert!(removed.message.contains("was not deleted"));
            assert!(!removed
                .selection
                .installed_module_ids
                .iter()
                .any(|module_id| module_id == "civiccode"));
            let backup_count = fs::read_dir(root.join("Backups"))
                .expect("backup root exists")
                .filter(|entry| {
                    entry
                        .as_ref()
                        .map(|entry| entry.path().join("backup-manifest.json").is_file())
                        .unwrap_or(false)
                })
                .count();
            assert_eq!(backup_count, 1);

            let removed_exports =
                module_action("open-module-exports".to_string(), "civiccode".to_string());
            assert!(removed_exports.is_err());
            assert!(removed_exports
                .err()
                .expect("removed module export error")
                .contains("is not installed in this local profile"));

            let installed = module_action("install-module".to_string(), "civiccode".to_string())
                .expect("module install allowed");
            assert_eq!(installed.status, "Module installed");
            assert!(installed
                .selection
                .enabled_module_ids
                .iter()
                .any(|module_id| module_id == "civiccode"));
        });
    }

    #[test]
    fn choose_file_path_requires_signed_in_staff_and_uses_native_picker_result() {
        with_clean_first_run_state(|_| {
            create_first_admin();
            env::set_var(
                "CIVICSUITE_TEST_FILE_PICKER_PATH",
                r"C:\City\Records\packet.pdf",
            );
            let signed_out = choose_file_path();
            env::remove_var("CIVICSUITE_TEST_FILE_PICKER_PATH");
            assert!(signed_out.is_err());

            sign_in_as_first_admin();
            env::set_var(
                "CIVICSUITE_TEST_FILE_PICKER_PATH",
                r"C:\City\Records\packet.pdf",
            );
            let picked = choose_file_path().expect("signed-in file picker");
            env::remove_var("CIVICSUITE_TEST_FILE_PICKER_PATH");

            assert_eq!(picked.as_deref(), Some(r"C:\City\Records\packet.pdf"));
        });
    }

    #[test]
    fn choose_folder_path_allows_first_run_then_requires_local_admin() {
        with_clean_first_run_state(|_| {
            env::set_var(
                "CIVICSUITE_TEST_FOLDER_PICKER_PATH",
                r"C:\City\TownlightData",
            );
            let first_run_folder = choose_folder_path().expect("pre-admin folder picker");
            env::remove_var("CIVICSUITE_TEST_FOLDER_PICKER_PATH");
            assert_eq!(first_run_folder.as_deref(), Some(r"C:\City\TownlightData"));

            create_first_admin();
            env::set_var(
                "CIVICSUITE_TEST_FOLDER_PICKER_PATH",
                r"C:\City\TownlightBackups",
            );
            let signed_out = choose_folder_path();
            env::remove_var("CIVICSUITE_TEST_FOLDER_PICKER_PATH");
            assert!(signed_out.is_err());

            sign_in_as_first_admin();
            env::set_var(
                "CIVICSUITE_TEST_FOLDER_PICKER_PATH",
                r"C:\City\TownlightBackups",
            );
            let picked = choose_folder_path().expect("admin folder picker");
            env::remove_var("CIVICSUITE_TEST_FOLDER_PICKER_PATH");

            assert_eq!(picked.as_deref(), Some(r"C:\City\TownlightBackups"));
        });
    }

    #[test]
    fn staff_user_roles_gate_city_work_modules() {
        with_clean_first_run_state(|_| {
            create_first_admin();
            sign_in_as_first_admin();
            create_staff_user(
                "Riley Records",
                "riley@example.gov",
                "records-staff",
                "records passcode 123",
            );
            create_staff_user(
                "Casey Clerk",
                "casey@example.gov",
                "clerk",
                "clerk passcode 123",
            );
            create_staff_user(
                "Jordan Code",
                "jordan@example.gov",
                "code-staff",
                "code passcode 123",
            );
            auth::auth_action("sign-out", None).expect("admin signed out");

            sign_in_as_user("riley@example.gov", "records passcode 123");
            let records_payload = serde_json::json!({
                "requester": "Alex Rivera",
                "summary": "Emails about park contract",
                "deadline": "2026-07-10"
            });
            city_work_action_authorized(
                "create-records-request".to_string(),
                Some(records_payload.clone()),
            )
            .expect("records staff can create records request");
            let meeting_body = serde_json::json!({
                "meetingBodyName": "City Council",
                "meetingBodyType": "legislative",
                "meetingBodyStatutoryBasis": "City Charter Section 2.1",
                "meetingBodyCadence": "Third Wednesday",
                "meetingBodyDefaultNoticeDays": "3",
                "meetingBodyQuorumRule": "majority of seated members"
            });
            let records_error = match city_work_action_authorized(
                "create-meeting-body".to_string(),
                Some(meeting_body.clone()),
            ) {
                Ok(_) => panic!("records staff cannot create meeting body"),
                Err(error) => error,
            };
            assert!(records_error.contains("not allowed"));
            auth::auth_action("sign-out", None).expect("records staff signed out");

            sign_in_as_user("casey@example.gov", "clerk passcode 123");
            city_work_action_authorized("create-meeting-body".to_string(), Some(meeting_body))
                .expect("clerk can create meeting body");
            let clerk_error = match city_work_action_authorized(
                "create-records-request".to_string(),
                Some(records_payload),
            ) {
                Ok(_) => panic!("clerk cannot create records request"),
                Err(error) => error,
            };
            assert!(clerk_error.contains("not allowed"));
            auth::auth_action("sign-out", None).expect("clerk signed out");

            sign_in_as_user("jordan@example.gov", "code passcode 123");
            let code_payload = serde_json::json!({
                "title": "Noise Ordinance",
                "citation": "CMC 8.12",
                "body": "Quiet hours begin at 10 PM.",
                "importedBy": "Deputy Clerk"
            });
            city_work_action_authorized("import-code-source".to_string(), Some(code_payload))
                .expect("code staff can import code source");
            let code_error = match city_work_action_authorized(
                "create-records-request".to_string(),
                Some(serde_json::json!({
                    "requester": "Blake Chen",
                    "summary": "Permit logs",
                    "deadline": "2026-07-12"
                })),
            ) {
                Ok(_) => panic!("code staff cannot create records request"),
                Err(error) => error,
            };
            assert!(code_error.contains("not allowed"));
        });
    }

    #[test]
    fn only_local_admin_can_load_demo_town() {
        with_clean_first_run_state(|_| {
            create_first_admin();
            sign_in_as_first_admin();
            create_staff_user(
                "Riley Records",
                "riley@example.gov",
                "records-staff",
                "records passcode 123",
            );
            auth::auth_action("sign-out", None).expect("admin signed out");
            sign_in_as_user("riley@example.gov", "records passcode 123");

            let error = city_work_action_authorized("load-demo-town".to_string(), None)
                .err()
                .expect("records staff must not load a demo town");
            assert!(error.contains("Townlight admin"));
            assert!(workflows::city_work_state()
                .expect("city state remains readable")
                .demo_fixture
                .is_none());
        });
    }

    #[test]
    fn disabled_modules_block_owned_city_work_actions() {
        with_clean_first_run_state(|_| {
            create_first_admin();
            sign_in_as_first_admin();
            module_action("disable-module".to_string(), "civiccode".to_string())
                .expect("civiccode disabled");

            let code_payload = serde_json::json!({
                "title": "Backyard Chicken Rules",
                "citation": "CMC 6.16.040",
                "body": "Backyard chickens are allowed with a coop permit."
            });
            let result =
                city_work_action_authorized("import-code-source".to_string(), Some(code_payload));

            assert!(result.is_err());
            assert!(result
                .err()
                .expect("disabled module error")
                .contains("Townlight Code is not enabled"));
        });
    }

    #[test]
    fn civicaccess_only_profile_can_still_reach_search_city_knowledge() {
        // TEST-3 (GauntletGate round 1, refuted) claimed civicaccess was missing
        // from the search-city-knowledge module allow-list; it was already
        // present, but no test proved a civicaccess-only profile could actually
        // reach search through the module-guard gate (the civicaccess-specific
        // search assertions elsewhere call search_city_work() directly,
        // bypassing require_enabled_city_modules entirely). This test closes
        // that gap by disabling every other allow_any module before searching.
        with_clean_first_run_state(|_| {
            create_first_admin();
            sign_in_as_first_admin();
            let review_payload = serde_json::json!({
                "title": "Water main repair notice",
                "body": "The city water department will repair a main on Tuesday morning.",
                "hasAltText": true,
                "language": "en"
            });
            city_work_action_authorized("accessibility-review".to_string(), Some(review_payload))
                .expect("accessibility review saved");

            // Disable dependents before their dependencies (civiccode and
            // civicnotice both depend on civicclerk; set_module_enabled refuses
            // to disable a module while an enabled module still depends on it).
            for module_id in ["civiccode", "civicnotice", "civicclerk", "civicrecords-ai"] {
                module_action("disable-module".to_string(), module_id.to_string())
                    .unwrap_or_else(|_| panic!("{module_id} disabled"));
            }

            let search_payload = serde_json::json!({ "query": "Water main" });
            let result = city_work_action_authorized(
                "search-city-knowledge".to_string(),
                Some(search_payload),
            )
            .expect("civicaccess-only profile can still reach search-city-knowledge");

            assert!(result
                .search_results
                .iter()
                .any(|hit| hit.module_id == "civicaccess" && hit.title.contains("Water main")));
        });
    }

    #[test]
    fn disabled_modules_are_filtered_from_cross_module_search() {
        with_clean_first_run_state(|_| {
            create_first_admin();
            sign_in_as_first_admin();
            let code_payload = serde_json::json!({
                "title": "Backyard Chicken Rules",
                "citation": "CMC 6.16.040",
                "body": "Backyard chickens are allowed with a coop permit."
            });
            city_work_action_authorized("import-code-source".to_string(), Some(code_payload))
                .expect("code source imported");
            module_action("disable-module".to_string(), "civiccode".to_string())
                .expect("civiccode disabled");

            let search_payload = serde_json::json!({ "query": "chickens" });
            let result = city_work_action_authorized(
                "search-city-knowledge".to_string(),
                Some(search_payload),
            )
            .expect("search remains available through enabled modules");

            assert!(result.search_results.is_empty());
            assert!(result.message.contains("enabled modules with 0 result"));
        });
    }

    #[test]
    fn first_run_setup_actions_require_admin_after_first_admin_exists() {
        with_clean_first_run_state(|_| {
            create_first_admin();

            let city_payload = serde_json::json!({
                "cityName": "Brookfield",
                "state": "CO",
                "timeZone": "America/Denver",
                "recordsContact": "records@example.gov",
                "clerkContact": "clerk@example.gov"
            });
            let signed_out_profile_result = first_run_action_authorized(
                "create-city-profile".to_string(),
                Some("city-profile".to_string()),
                Some(city_payload),
            );
            assert!(signed_out_profile_result.is_err());
            assert!(signed_out_profile_result
                .err()
                .expect("first-run profile auth error")
                .contains("Sign in as the Townlight admin"));

            let signed_out_model_result = first_run_action_authorized(
                "download-model".to_string(),
                Some("model".to_string()),
                None,
            );
            assert!(signed_out_model_result.is_err());
            assert!(signed_out_model_result
                .err()
                .expect("first-run model auth error")
                .contains("Sign in as the Townlight admin"));

            let signed_out_result = first_run_action_authorized("backup".to_string(), None, None);

            assert!(signed_out_result.is_err());
            assert!(signed_out_result
                .err()
                .expect("first-run lifecycle auth error")
                .contains("Sign in as the Townlight admin"));

            sign_in_as_first_admin();
            let signed_in_result = first_run_action_authorized("backup".to_string(), None, None)
                .expect("backup allowed");
            assert!(signed_in_result.accepted);
            assert_eq!(signed_in_result.action, "backup");
        });
    }

    #[test]
    fn first_run_setup_actions_can_bootstrap_before_admin_exists() {
        with_clean_first_run_state(|_| {
            first_run_action_authorized(
                "choose-location".to_string(),
                Some("locations".to_string()),
                None,
            )
            .expect("locations can bootstrap before admin exists");
            let module_payload = serde_json::json!({ "profileId": "city-core" });
            first_run_action_authorized(
                "select-modules".to_string(),
                Some("modules".to_string()),
                Some(module_payload),
            )
            .expect("module selection can bootstrap before admin exists");
            let city_payload = serde_json::json!({
                "cityName": "Brookfield",
                "state": "CO",
                "timeZone": "America/Denver",
                "recordsContact": "records@example.gov",
                "clerkContact": "clerk@example.gov"
            });
            let city_result = first_run_action_authorized(
                "create-city-profile".to_string(),
                Some("city-profile".to_string()),
                Some(city_payload),
            )
            .expect("city profile can bootstrap before admin exists");
            assert!(city_result.accepted);

            let admin_payload = serde_json::json!({
                "adminName": "Alex Clerk",
                "adminEmail": "alex@example.gov",
                "adminPasscode": "correct horse battery staple"
            });
            let admin_result = first_run_action_authorized(
                "create-admin".to_string(),
                Some("first-admin".to_string()),
                Some(admin_payload),
            )
            .expect("first admin can bootstrap local access");
            assert!(admin_result.accepted);
            assert!(admin_result.next_action.contains("Sign in"));
        });
    }

    #[test]
    fn app_state_reports_first_run_setup_contract() {
        with_clean_first_run_state(|_| {
            let state = app_state().expect("app state builds");
            assert_eq!(state.first_run.status, "Needs setup");
            assert_eq!(
                state.first_run.current_step_id.as_deref(),
                Some("locations")
            );
            assert!(state.first_run.local_only);
        });
    }

    #[test]
    fn app_state_reports_saved_city_profile_and_first_admin() {
        with_clean_first_run_state(|_| {
            create_first_admin();
            sign_in_as_first_admin();

            let state = app_state().expect("app state");

            let profile = state.city_profile.expect("city profile");
            assert_eq!(profile.city_name, "Brookfield");
            assert_eq!(profile.records_contact, "records@example.gov");
            assert_eq!(state.users.len(), 1);
            assert_eq!(state.users[0].email, "alex@example.gov");
            assert_eq!(state.users[0].role, "local-admin");
        });
    }

    #[test]
    fn app_state_reports_module_selection_profile() {
        with_clean_first_run_state(|_| {
            module_registry::persist_profile_selection("city-core")
                .expect("module selection persists");
            let state = app_state().expect("app state");
            assert_eq!(state.module_selection.profile_id, "city-core");
            assert_eq!(state.module_selection.installed_module_ids.len(), 6);
            assert!(state
                .module_profiles
                .iter()
                .any(|profile| profile.id == "city-core" && profile.selected));
            assert!(state
                .modules
                .iter()
                .filter(|module| module.installed)
                .all(|module| !module.proof_required.is_empty()));
        });
    }

    #[test]
    fn app_state_reports_local_city_work_state() {
        with_clean_first_run_state(|_| {
            let state = app_state().expect("app state builds");
            assert_eq!(state.city_work.meetings.len(), 0);
            assert_eq!(state.city_work.records_requests.len(), 0);
            assert_eq!(state.city_work.code_sources.len(), 0);
        });
    }

    #[test]
    fn unauthenticated_city_work_state_is_public_projection() {
        with_clean_first_run_state(|_| {
            create_first_admin();

            let body_payload = serde_json::json!({
                "meetingBodyName": "City Council",
                "meetingBodyType": "legislative",
                "meetingBodyStatutoryBasis": "City Charter Section 2.1",
                "meetingBodyCadence": "First and third Wednesday",
                "meetingBodyDefaultNoticeDays": "3",
                "meetingBodyQuorumRule": "majority of seated members"
            });
            let body_result =
                workflows::city_work_action("create-meeting-body", Some(&body_payload))
                    .expect("meeting body created");
            let body_id = body_result.state.meeting_bodies[0].id.clone();
            let meeting_payload = serde_json::json!({
                "meetingBodyId": body_id,
                "title": "Budget Work Session",
                "meetingDate": "2026-07-02",
                "summary": "Review draft budget priorities.",
                "agendaTitle": "Budget priorities"
            });
            let meeting_result =
                workflows::city_work_action("create-meeting", Some(&meeting_payload))
                    .expect("meeting created");
            let meeting_id = meeting_result.state.meetings[0].id.clone();
            let minutes_payload = serde_json::json!({
                "meetingId": meeting_id.clone(),
                "minutes": "Private draft minutes with staff notes."
            });
            workflows::city_work_action("record-minutes", Some(&minutes_payload))
                .expect("minutes saved");
            let notice_checklist = serde_json::json!({
                "meetingId": meeting_id.clone(),
                "noticeMeetingType": "Budget work session",
                "noticeStatutoryBasis": "Municipal open meetings notice",
                "noticeDeadline": "2026-07-01",
                "noticeTimeZone": "America/Denver",
                "noticeHumanApproval": true
            });
            workflows::city_work_action("complete-notice-checklist", Some(&notice_checklist))
                .expect("notice checklist ready");
            let selected_meeting = serde_json::json!({
                "meetingId": meeting_id.clone(),
                "postingLocation": "City website",
                "postingMethod": "Posted PDF notice",
                "postingConfirmation": "Clerk confirmed the notice was posted before the meeting.",
                "postingDate": "2026-07-01"
            });
            workflows::city_work_action("post-notice", Some(&selected_meeting))
                .expect("notice ready");
            let public_comment = serde_json::json!({
                "meetingId": meeting_id,
                "commenterName": "Riley Resident",
                "commenterContact": "riley@example.org",
                "commentMode": "written",
                "commentTopic": "Budget",
                "commentBody": "Please protect park funding."
            });
            workflows::city_work_action("submit-public-comment", Some(&public_comment))
                .expect("public comment saved");

            let records_payload = serde_json::json!({
                "requester": "Internal requester",
                "summary": "Private staff records request",
                "deadline": "2026-07-15"
            });
            workflows::city_work_action("create-records-request", Some(&records_payload))
                .expect("records request saved");
            let code_payload = serde_json::json!({
                "title": "Draft Noise Ordinance",
                "citation": "Draft 8.12",
                "body": "Private draft ordinance text."
            });
            workflows::city_work_action("import-code-source", Some(&code_payload))
                .expect("code source saved");
            let private_packet_meeting = serde_json::json!({
                "title": "Unposted Packet Draft",
                "meetingDate": "2026-07-09",
                "summary": "Packet export before public notice.",
                "agendaTitle": "Private packet"
            });
            let private_packet_result =
                workflows::city_work_action("create-meeting", Some(&private_packet_meeting))
                    .expect("private packet meeting created");
            let private_packet_id = private_packet_result.state.meetings[0].id.clone();
            let private_packet_minutes = serde_json::json!({
                "meetingId": private_packet_id,
                "minutes": "Packet-only private minutes."
            });
            workflows::city_work_action("record-minutes", Some(&private_packet_minutes))
                .expect("private packet minutes saved");
            let private_packet_selection = serde_json::json!({ "meetingId": private_packet_id });
            workflows::city_work_action("export-meeting-packet", Some(&private_packet_selection))
                .expect("private packet exported");

            let public_state = get_city_work_state().expect("public city work state");

            assert_eq!(public_state.meetings.len(), 1);
            assert_eq!(public_state.meetings[0].title, "Budget Work Session");
            assert_eq!(public_state.meetings[0].minutes, "");
            assert!(public_state.meetings[0].public_comments.is_empty());
            assert!(public_state.records_requests.is_empty());
            assert!(public_state.code_sources.is_empty());
            assert!(public_state.code_handoffs.is_empty());
            assert!(public_state.audit_entries.is_empty());
            assert!(public_state.notification_events.is_empty());
            let public_app_state = app_state().expect("public app state");
            assert!(public_app_state.users.is_empty());
            assert_eq!(
                public_app_state.model.artifact.local_path,
                "Sign in as Townlight admin to view the model file path."
            );
            assert!(public_app_state
                .health
                .iter()
                .all(|item| item.admin_detail.is_empty()));

            sign_in_as_first_admin();
            let staff_state = get_city_work_state().expect("staff city work state");

            assert_eq!(
                staff_state
                    .meetings
                    .iter()
                    .find(|meeting| meeting.title == "Budget Work Session")
                    .expect("budget meeting visible")
                    .minutes,
                "Private draft minutes with staff notes."
            );
            assert_eq!(
                staff_state
                    .meetings
                    .iter()
                    .find(|meeting| meeting.title == "Budget Work Session")
                    .expect("budget meeting visible")
                    .public_comments
                    .len(),
                1
            );
            assert!(staff_state
                .meetings
                .iter()
                .any(|meeting| meeting.title == "Unposted Packet Draft"));
            assert_eq!(staff_state.records_requests.len(), 1);
            assert_eq!(staff_state.code_sources.len(), 1);
            assert!(!staff_state.audit_entries.is_empty());
            assert!(!staff_state.notification_events.is_empty());
        });
    }

    #[test]
    fn public_city_work_actions_require_first_run_owner() {
        with_clean_first_run_state(|_| {
            let public_payload = serde_json::json!({
                "requester": "Riley Resident",
                "requesterContact": "riley@example.org",
                "summary": "Please provide the current council packet."
            });
            let result = city_work_action_authorized(
                "submit-public-records-request".to_string(),
                Some(public_payload),
            );

            assert!(result.is_err());
            assert!(result
                .err()
                .expect("setup error")
                .contains("Finish first-run setup"));
        });
    }

    #[test]
    fn public_city_work_actions_do_not_require_admin_session() {
        with_clean_first_run_state(|_| {
            create_first_admin();

            let public_payload = serde_json::json!({
                "requester": "Riley Resident",
                "requesterContact": "riley@example.org",
                "summary": "Please provide the current council packet."
            });
            let public_result = city_work_action_authorized(
                "submit-public-records-request".to_string(),
                Some(public_payload),
            )
            .expect("public request can be submitted without admin session");

            assert!(public_result.accepted);
            assert!(public_result.message.contains("Public records request"));
            assert!(public_result.state.records_requests.is_empty());

            let lookup_payload = serde_json::json!({
                "trackingNumber": "REQ-0001",
                "requesterContact": "riley@example.org"
            });
            let lookup_result = city_work_action_authorized(
                "lookup-public-records-request".to_string(),
                Some(lookup_payload),
            )
            .expect("public request status can be checked without admin session");
            assert!(lookup_result.accepted);
            assert_eq!(lookup_result.status, "Status found");
            assert_eq!(lookup_result.state.records_requests.len(), 1);
            assert_eq!(
                lookup_result.state.records_requests[0].requester_contact,
                ""
            );

            let wrong_lookup_payload = serde_json::json!({
                "trackingNumber": "REQ-0001",
                "requesterContact": "wrong@example.org"
            });
            let wrong_lookup_result = city_work_action_authorized(
                "lookup-public-records-request".to_string(),
                Some(wrong_lookup_payload),
            )
            .expect("public request status mismatch is safe");
            assert!(!wrong_lookup_result.accepted);
            assert_eq!(wrong_lookup_result.status, "No match");
            assert!(wrong_lookup_result.state.records_requests.is_empty());

            let staff_payload = serde_json::json!({
                "requester": "Staff-only",
                "summary": "Internal request",
                "deadline": "2026-07-01"
            });
            let staff_result = city_work_action_authorized(
                "create-records-request".to_string(),
                Some(staff_payload),
            );

            assert!(staff_result.is_err());
            assert!(staff_result
                .err()
                .expect("staff error")
                .contains("Sign in with a staff or Townlight admin account"));
        });
    }
}
