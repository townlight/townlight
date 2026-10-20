use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::local_paths;

pub const MODULES_JSON: &str = include_str!("../../../installer/modules.json");
const SUITE_STATE_JSON: &str = include_str!("../../../config/suite-state.json");
// New installations launch the first public product: Townlight Records with
// its dependency-closed Core + Notice + Access capability set. Existing saved
// selections are preserved verbatim by `module_selection_state`, so upgrades
// from the broader historical city-core profile do not silently remove modules.
const DEFAULT_PROFILE_ID: &str = "records-beta";

#[derive(Deserialize)]
struct CanonicalSuiteState {
    modules: HashMap<String, CanonicalModuleIdentity>,
}

#[derive(Deserialize)]
struct CanonicalModuleIdentity {
    public_name: String,
    legacy: CanonicalLegacyIdentity,
}

#[derive(Deserialize)]
struct CanonicalLegacyIdentity {
    technical_id: String,
}

#[derive(Deserialize)]
struct ModuleRegistry {
    schema_version: u16,
    module_contract_version: u16,
    profiles: Vec<ModuleProfileDefinition>,
    modules: Vec<ModuleDefinition>,
}

#[derive(Deserialize, Clone)]
struct ModuleProfileDefinition {
    id: String,
    label: String,
    description: String,
    modules: Vec<String>,
    #[serde(default)]
    disabled: bool,
    #[serde(default)]
    disabled_reason: Option<String>,
}

#[derive(Deserialize, Clone)]
struct ModuleDefinition {
    id: String,
    display_name: String,
    role: String,
    #[serde(default)]
    current_version: Option<String>,
    #[serde(default)]
    required: bool,
    #[serde(default)]
    selectable: bool,
    #[serde(default)]
    civiccore_requirement: Option<String>,
    #[serde(default)]
    installer_status: Option<String>,
    #[serde(default)]
    dependencies: Vec<String>,
    #[serde(default)]
    proof_required: Vec<String>,
    routes: Option<Vec<ContractRoute>>,
    permissions: Option<Vec<String>>,
    services: Option<Vec<ContractService>>,
    migrations: Option<Vec<String>>,
    tasks: Option<Vec<String>>,
    backup_restore_hooks: Option<Vec<String>>,
    model_needs: Option<Vec<ContractModelNeed>>,
    lifecycle: Option<ContractLifecycle>,
}

#[derive(Deserialize, Clone)]
struct ContractRoute {
    id: String,
    label: String,
    path: String,
    surface: String,
}

#[derive(Deserialize, Clone)]
struct ContractService {
    id: String,
    kind: String,
    health_check: String,
}

#[derive(Deserialize, Clone)]
struct ContractModelNeed {
    id: String,
    required: bool,
    purpose: String,
}

#[derive(Deserialize, Clone)]
struct ContractLifecycle {
    install: String,
    update: String,
    disable: String,
    uninstall: String,
}

#[derive(Serialize, Clone)]
pub struct ModuleSummary {
    pub id: String,
    pub display_name: String,
    pub role: String,
    pub version: Option<String>,
    pub installer_status: Option<String>,
    pub civiccore_requirement: Option<String>,
    pub required: bool,
    pub selectable: bool,
    pub installed: bool,
    pub enabled: bool,
    pub contract_ready: bool,
    pub blocked_reason: Option<String>,
    pub dependencies: Vec<String>,
    pub proof_required: Vec<String>,
    pub backup_restore_hooks: Vec<String>,
    pub route_count: usize,
    pub service_count: usize,
    pub permission_count: usize,
    pub task_count: usize,
    pub lifecycle_install: Option<String>,
    pub lifecycle_update: Option<String>,
    pub lifecycle_disable: Option<String>,
    pub lifecycle_uninstall: Option<String>,
    pub model_required: bool,
}

#[derive(Serialize, Clone)]
pub struct ModuleProfileSummary {
    pub id: String,
    pub label: String,
    pub description: String,
    pub selected: bool,
    pub disabled: bool,
    pub disabled_reason: Option<String>,
    pub module_count: usize,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct ModuleSelectionState {
    pub profile_id: String,
    pub profile_label: String,
    pub installed_module_ids: Vec<String>,
    pub disabled_module_ids: Vec<String>,
    #[serde(default)]
    pub enabled_module_ids: Vec<String>,
    pub last_updated_unix_seconds: u64,
}

fn now_unix_seconds() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or(0)
}

fn config_dir() -> PathBuf {
    local_paths::config_dir()
}

fn module_selection_path() -> PathBuf {
    config_dir().join("module-selection.json")
}

fn parse_registry(registry_json: &str) -> Result<ModuleRegistry, String> {
    serde_json::from_str(registry_json)
        .map_err(|error| format!("Could not parse module registry: {error}"))
}

fn module_index(registry: &ModuleRegistry) -> HashMap<&str, &ModuleDefinition> {
    registry
        .modules
        .iter()
        .map(|module| (module.id.as_str(), module))
        .collect()
}

fn profile_by_id<'a>(
    registry: &'a ModuleRegistry,
    profile_id: &str,
) -> Result<&'a ModuleProfileDefinition, String> {
    registry
        .profiles
        .iter()
        .find(|profile| profile.id == profile_id)
        .ok_or_else(|| format!("Module profile {profile_id} is missing from the registry"))
}

fn require_contract_list(
    module_id: &str,
    field_name: &str,
    length: Option<usize>,
) -> Result<(), String> {
    match length {
        Some(0) | None => Err(format!(
            "Module {module_id} must define non-empty {field_name} for the Windows local contract"
        )),
        Some(_) => Ok(()),
    }
}

fn require_lifecycle(module: &ModuleDefinition) -> Result<(), String> {
    let lifecycle = module.lifecycle.as_ref().ok_or_else(|| {
        format!(
            "Module {} must define lifecycle behavior for install/update/disable/uninstall",
            module.id
        )
    })?;
    for (field_name, value) in [
        ("install", &lifecycle.install),
        ("update", &lifecycle.update),
        ("disable", &lifecycle.disable),
        ("uninstall", &lifecycle.uninstall),
    ] {
        if value.trim().is_empty() {
            return Err(format!(
                "Module {} lifecycle field {field_name} cannot be empty",
                module.id
            ));
        }
    }
    Ok(())
}

fn require_nonempty_value(module_id: &str, field_name: &str, value: &str) -> Result<(), String> {
    if value.trim().is_empty() {
        return Err(format!(
            "Module {module_id} contract field {field_name} cannot be empty"
        ));
    }
    Ok(())
}

fn validate_route_contract(module: &ModuleDefinition) -> Result<(), String> {
    for route in module.routes.as_ref().into_iter().flatten() {
        require_nonempty_value(&module.id, "routes.id", &route.id)?;
        require_nonempty_value(&module.id, "routes.label", &route.label)?;
        require_nonempty_value(&module.id, "routes.path", &route.path)?;
        require_nonempty_value(&module.id, "routes.surface", &route.surface)?;
    }
    Ok(())
}

fn validate_service_contract(module: &ModuleDefinition) -> Result<(), String> {
    for service in module.services.as_ref().into_iter().flatten() {
        require_nonempty_value(&module.id, "services.id", &service.id)?;
        require_nonempty_value(&module.id, "services.kind", &service.kind)?;
        require_nonempty_value(&module.id, "services.health_check", &service.health_check)?;
    }
    Ok(())
}

fn validate_model_contract(module: &ModuleDefinition) -> Result<(), String> {
    for need in module.model_needs.as_ref().into_iter().flatten() {
        require_nonempty_value(&module.id, "model_needs.id", &need.id)?;
        require_nonempty_value(&module.id, "model_needs.purpose", &need.purpose)?;
        if need.required && need.id != "gemma-4-12b-it-qat-q4_0" {
            return Err(format!(
                "Module {} requires unsupported local model {}",
                module.id, need.id
            ));
        }
    }
    Ok(())
}

fn registry_core_version(registry: &ModuleRegistry) -> Result<&str, String> {
    registry
        .modules
        .iter()
        .find(|module| module.id == "civiccore")
        .and_then(|module| module.current_version.as_deref())
        .ok_or_else(|| "Townlight Core must define current_version".to_string())
}

fn core_version_satisfies(installed: &str, required: &str) -> bool {
    fn parse_triplet(value: &str) -> Option<(u64, u64, u64)> {
        let mut parts = value.split('.').map(str::parse::<u64>);
        let parsed = (
            parts.next()?.ok()?,
            parts.next()?.ok()?,
            parts.next()?.ok()?,
        );
        if parts.next().is_some() {
            return None;
        }
        Some(parsed)
    }

    match (parse_triplet(installed), parse_triplet(required)) {
        (
            Some((installed_major, installed_minor, installed_patch)),
            Some((required_major, required_minor, required_patch)),
        ) => {
            installed_major == required_major
                && installed_minor == required_minor
                && installed_patch >= required_patch
        }
        _ => false,
    }
}

fn validate_installable_module_contract(
    module: &ModuleDefinition,
    core_version: &str,
) -> Result<(), String> {
    if module.display_name.trim().is_empty() || module.role.trim().is_empty() {
        return Err(format!(
            "Module {} must define display name and role",
            module.id
        ));
    }
    if module.current_version.is_none() {
        return Err(format!("Module {} must define current_version", module.id));
    }
    if module.id != "civiccore"
        && !module
            .civiccore_requirement
            .as_deref()
            .is_some_and(|required| core_version_satisfies(core_version, required))
    {
        return Err(format!(
            "Module {} requires a Townlight Core version compatible with {core_version} for Windows Local 1.0",
            module.id,
        ));
    }
    require_contract_list(&module.id, "routes", module.routes.as_ref().map(Vec::len))?;
    require_contract_list(
        &module.id,
        "permissions",
        module.permissions.as_ref().map(Vec::len),
    )?;
    require_contract_list(
        &module.id,
        "services",
        module.services.as_ref().map(Vec::len),
    )?;
    require_contract_list(
        &module.id,
        "migrations",
        module.migrations.as_ref().map(Vec::len),
    )?;
    require_contract_list(&module.id, "tasks", module.tasks.as_ref().map(Vec::len))?;
    require_contract_list(
        &module.id,
        "backup_restore_hooks",
        module.backup_restore_hooks.as_ref().map(Vec::len),
    )?;
    require_contract_list(
        &module.id,
        "proof_required",
        Some(module.proof_required.len()),
    )?;
    if module.model_needs.is_none() {
        return Err(format!(
            "Module {} must declare model_needs, even when none are required",
            module.id
        ));
    }
    validate_route_contract(module)?;
    validate_service_contract(module)?;
    validate_model_contract(module)?;
    require_lifecycle(module)
}

fn validate_profile(registry: &ModuleRegistry, profile_id: &str) -> Result<(), String> {
    if registry.schema_version != 1 {
        return Err(format!(
            "Unsupported module registry schema {}",
            registry.schema_version
        ));
    }
    if registry.module_contract_version != 1 {
        return Err(format!(
            "Unsupported module contract version {}",
            registry.module_contract_version
        ));
    }

    let profile = profile_by_id(registry, profile_id)?;
    if profile.disabled {
        return Err(format!("Module profile {profile_id} is disabled"));
    }
    if !profile
        .modules
        .iter()
        .any(|module_id| module_id == "civiccore")
    {
        return Err(format!(
            "Module profile {profile_id} must include Townlight Core"
        ));
    }
    validate_module_selection(registry, profile_id, &profile.modules)
}

// Validate a concrete set of module ids (dependencies present + each contract valid + required
// modules included). Used by validate_profile and by the custom-selection path
// (resolve_custom_module_order / validate_custom_selection) to enforce dependency + contract rules.
fn validate_module_selection(
    registry: &ModuleRegistry,
    label: &str,
    module_ids: &[String],
) -> Result<(), String> {
    let module_map = module_index(registry);
    let core_version = registry_core_version(registry)?;
    let selected_ids: HashSet<&str> = module_ids.iter().map(String::as_str).collect();
    for module_id in module_ids {
        let module = module_map
            .get(module_id.as_str())
            .ok_or_else(|| format!("Profile {label} references unknown module {module_id}"))?;
        for dependency in &module.dependencies {
            if !selected_ids.contains(dependency.as_str()) {
                return Err(format!(
                    "Module {module_id} dependency {dependency} is not selected in profile {label}"
                ));
            }
        }
        validate_installable_module_contract(module, core_version)?;
    }
    for module in &registry.modules {
        if module.required && !selected_ids.contains(module.id.as_str()) {
            return Err(format!(
                "Required module {} is not selected in profile {label}",
                module.id
            ));
        }
    }
    Ok(())
}

fn resolve_custom_module_order(
    registry: &ModuleRegistry,
    selected_modules: &[String],
) -> Result<Vec<String>, String> {
    let module_map = module_index(registry);
    let core_version = registry_core_version(registry)?;
    let selected_product_modules: Vec<&str> = selected_modules
        .iter()
        .map(String::as_str)
        .filter(|module_id| *module_id != "civiccore")
        .collect();
    if selected_product_modules.is_empty() {
        return Err("Custom module selection requires at least one product module.".to_string());
    }

    let mut ordered = Vec::new();
    let mut visiting = HashSet::new();
    let mut visited = HashSet::new();

    fn visit(
        module_id: &str,
        module_map: &HashMap<&str, &ModuleDefinition>,
        core_version: &str,
        visiting: &mut HashSet<String>,
        visited: &mut HashSet<String>,
        ordered: &mut Vec<String>,
    ) -> Result<(), String> {
        if visited.contains(module_id) {
            return Ok(());
        }
        if !visiting.insert(module_id.to_string()) {
            return Err(format!("Module dependency cycle includes {module_id}"));
        }
        let module = module_map
            .get(module_id)
            .ok_or_else(|| format!("Custom selection references unknown module {module_id}"))?;
        if module.id != "civiccore" && !module.selectable {
            return Err(format!(
                "Module {} cannot be selected in a custom Windows Local profile.",
                module.id
            ));
        }
        validate_installable_module_contract(module, core_version)?;
        for dependency in &module.dependencies {
            visit(
                dependency,
                module_map,
                core_version,
                visiting,
                visited,
                ordered,
            )?;
        }
        visiting.remove(module_id);
        visited.insert(module_id.to_string());
        ordered.push(module_id.to_string());
        Ok(())
    }

    visit(
        "civiccore",
        &module_map,
        core_version,
        &mut visiting,
        &mut visited,
        &mut ordered,
    )?;
    for module_id in selected_product_modules {
        visit(
            module_id,
            &module_map,
            core_version,
            &mut visiting,
            &mut visited,
            &mut ordered,
        )?;
    }
    Ok(ordered)
}

fn validate_custom_selection(
    registry: &ModuleRegistry,
    installed_module_ids: &[String],
) -> Result<(), String> {
    let selected_product_modules: Vec<String> = installed_module_ids
        .iter()
        .filter(|module_id| module_id.as_str() != "civiccore")
        .cloned()
        .collect();
    let expected = resolve_custom_module_order(registry, &selected_product_modules)?;
    if expected != installed_module_ids {
        return Err("Saved custom module selection does not match dependency order.".to_string());
    }
    Ok(())
}

fn selection_from_installed_and_enabled(
    registry: &ModuleRegistry,
    installed_module_ids: Vec<String>,
    enabled_module_ids: Vec<String>,
) -> Result<ModuleSelectionState, String> {
    let module_map = module_index(registry);
    if !installed_module_ids
        .iter()
        .any(|module_id| module_id == "civiccore")
    {
        return Err("Townlight Core must stay installed as the local foundation.".to_string());
    }
    for module_id in &installed_module_ids {
        module_map
            .get(module_id.as_str())
            .ok_or_else(|| format!("Installed module {module_id} is missing from the registry"))?;
    }

    let mut ordered_module_ids = if installed_module_ids
        .iter()
        .any(|module_id| module_id != "civiccore")
    {
        let product_modules = installed_module_ids
            .iter()
            .filter(|module_id| module_id.as_str() != "civiccore")
            .cloned()
            .collect::<Vec<_>>();
        resolve_custom_module_order(registry, &product_modules)?
    } else {
        vec!["civiccore".to_string()]
    };
    if let Some(profile) = registry.profiles.iter().find(|profile| {
        !profile.disabled
            && profile.id != "meetings-beta"
            && profile.modules.len() == ordered_module_ids.len()
            && profile.modules.iter().all(|module_id| {
                ordered_module_ids
                    .iter()
                    .any(|ordered| ordered == module_id)
            })
    }) {
        ordered_module_ids = profile.modules.clone();
    }
    let installed: HashSet<&str> = ordered_module_ids.iter().map(String::as_str).collect();
    let mut enabled_module_ids = enabled_module_ids
        .into_iter()
        .filter(|module_id| installed.contains(module_id.as_str()))
        .collect::<Vec<_>>();
    if !enabled_module_ids
        .iter()
        .any(|module_id| module_id == "civiccore")
    {
        enabled_module_ids.insert(0, "civiccore".to_string());
    }
    let mut seen_enabled = HashSet::new();
    enabled_module_ids.retain(|module_id| seen_enabled.insert(module_id.clone()));

    let (profile_id, profile_label) = registry
        .profiles
        .iter()
        // A matching module set must not silently activate the Python Meetings
        // candidate when an operator merely removes Code from city-core.
        .find(|profile| {
            !profile.disabled
                && profile.id != "meetings-beta"
                && profile.modules == ordered_module_ids
        })
        .map(|profile| (profile.id.clone(), profile.label.clone()))
        .unwrap_or_else(|| ("custom".to_string(), "Custom".to_string()));
    let disabled_module_ids = registry
        .modules
        .iter()
        .filter(|module| !installed.contains(module.id.as_str()))
        .map(|module| module.id.clone())
        .collect();
    let selection = ModuleSelectionState {
        profile_id,
        profile_label,
        installed_module_ids: ordered_module_ids,
        disabled_module_ids,
        enabled_module_ids,
        last_updated_unix_seconds: now_unix_seconds(),
    };
    validate_enabled_modules(registry, &selection)?;
    if selection.profile_id == "custom" {
        validate_custom_selection(registry, &selection.installed_module_ids)?;
    } else {
        validate_profile(registry, &selection.profile_id)?;
    }
    Ok(selection)
}

fn selection_for_profile(
    registry: &ModuleRegistry,
    profile_id: &str,
) -> Result<ModuleSelectionState, String> {
    validate_profile(registry, profile_id)?;
    let profile = profile_by_id(registry, profile_id)?;
    let installed_module_ids = profile.modules.clone();
    let installed: HashSet<&str> = installed_module_ids.iter().map(String::as_str).collect();
    let disabled_module_ids = registry
        .modules
        .iter()
        .filter(|module| !installed.contains(module.id.as_str()))
        .map(|module| module.id.clone())
        .collect();
    Ok(ModuleSelectionState {
        profile_id: profile.id.clone(),
        profile_label: profile.label.clone(),
        enabled_module_ids: installed_module_ids.clone(),
        installed_module_ids,
        disabled_module_ids,
        last_updated_unix_seconds: now_unix_seconds(),
    })
}

fn validate_enabled_modules(
    registry: &ModuleRegistry,
    selection: &ModuleSelectionState,
) -> Result<(), String> {
    let module_map = module_index(registry);
    let installed: HashSet<&str> = selection
        .installed_module_ids
        .iter()
        .map(String::as_str)
        .collect();
    let enabled: HashSet<&str> = selection
        .enabled_module_ids
        .iter()
        .map(String::as_str)
        .collect();
    if !enabled.contains("civiccore") {
        return Err("Townlight Core must stay enabled as the local foundation.".to_string());
    }
    for module_id in &selection.enabled_module_ids {
        if !installed.contains(module_id.as_str()) {
            return Err(format!(
                "Enabled module {module_id} is not installed in the selected profile"
            ));
        }
        let module = module_map
            .get(module_id.as_str())
            .ok_or_else(|| format!("Enabled module {module_id} is missing from the registry"))?;
        for dependency in &module.dependencies {
            if !enabled.contains(dependency.as_str()) {
                return Err(format!(
                    "Enabled module {module_id} requires enabled dependency {dependency}"
                ));
            }
        }
    }
    for module in &registry.modules {
        if module.required
            && installed.contains(module.id.as_str())
            && !enabled.contains(module.id.as_str())
        {
            return Err(format!("Required module {} cannot be disabled", module.id));
        }
    }
    Ok(())
}

fn normalize_enabled_modules(
    registry: &ModuleRegistry,
    selection: &mut ModuleSelectionState,
) -> Result<(), String> {
    if selection.enabled_module_ids.is_empty() {
        selection.enabled_module_ids = selection.installed_module_ids.clone();
    }
    validate_enabled_modules(registry, selection)
}

fn read_saved_selection() -> Result<Option<ModuleSelectionState>, String> {
    let path = module_selection_path();
    if !path.is_file() {
        return Ok(None);
    }
    let contents = fs::read_to_string(&path)
        .map_err(|error| format!("Could not read module selection: {error}"))?;
    serde_json::from_str(&contents)
        .map(Some)
        .map_err(|error| format!("Could not parse module selection: {error}"))
}

fn write_selection(selection: &ModuleSelectionState) -> Result<(), String> {
    let path = module_selection_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Could not create {}: {error}", parent.display()))?;
    }
    crate::atomic_io::atomic_write_json(&path, selection)
}

#[cfg(test)]
pub fn validate_default_registry() -> Result<(), String> {
    let registry = parse_registry(MODULES_JSON)?;
    validate_profile(&registry, DEFAULT_PROFILE_ID)
}

pub fn persist_profile_selection(profile_id: &str) -> Result<ModuleSelectionState, String> {
    let registry = parse_registry(MODULES_JSON)?;
    let selection = selection_for_profile(&registry, profile_id)?;
    write_selection(&selection)?;
    Ok(selection)
}

pub fn persist_custom_selection(
    selected_modules: &[String],
) -> Result<ModuleSelectionState, String> {
    let registry = parse_registry(MODULES_JSON)?;
    let installed_module_ids = resolve_custom_module_order(&registry, selected_modules)?;
    let installed: HashSet<&str> = installed_module_ids.iter().map(String::as_str).collect();
    let disabled_module_ids = registry
        .modules
        .iter()
        .filter(|module| !installed.contains(module.id.as_str()))
        .map(|module| module.id.clone())
        .collect();
    let selection = ModuleSelectionState {
        profile_id: "custom".to_string(),
        profile_label: "Custom".to_string(),
        enabled_module_ids: installed_module_ids.clone(),
        installed_module_ids,
        disabled_module_ids,
        last_updated_unix_seconds: now_unix_seconds(),
    };
    write_selection(&selection)?;
    Ok(selection)
}

pub fn module_selection_state() -> Result<ModuleSelectionState, String> {
    let registry = parse_registry(MODULES_JSON)?;
    let mut selection = match read_saved_selection()? {
        Some(selection) => selection,
        None => selection_for_profile(&registry, DEFAULT_PROFILE_ID)?,
    };
    normalize_enabled_modules(&registry, &mut selection)?;
    if selection.profile_id == "custom" {
        validate_custom_selection(&registry, &selection.installed_module_ids)?;
        return Ok(selection);
    }
    validate_profile(&registry, &selection.profile_id)?;
    let profile = profile_by_id(&registry, &selection.profile_id)?;
    let expected: HashSet<&str> = profile.modules.iter().map(String::as_str).collect();
    let actual: HashSet<&str> = selection
        .installed_module_ids
        .iter()
        .map(String::as_str)
        .collect();
    if expected != actual {
        return Err(
            "Saved module selection does not match the selected profile contract".to_string(),
        );
    }
    Ok(selection)
}

pub fn set_module_enabled(module_id: &str, enabled: bool) -> Result<ModuleSelectionState, String> {
    let registry = parse_registry(MODULES_JSON)?;
    let module_map = module_index(&registry);
    let module = module_map
        .get(module_id)
        .ok_or_else(|| format!("Module {module_id} is missing from the registry"))?;
    let mut selection = module_selection_state()?;
    if !selection
        .installed_module_ids
        .iter()
        .any(|installed| installed == module_id)
    {
        return Err(format!(
            "Module {module_id} is not installed in the selected local profile"
        ));
    }
    if module.required && !enabled {
        return Err(format!("Required module {module_id} cannot be disabled"));
    }
    let mut enabled_ids: HashSet<String> = selection.enabled_module_ids.iter().cloned().collect();
    if enabled {
        for dependency in &module.dependencies {
            if !enabled_ids.contains(dependency) {
                return Err(format!(
                    "Enable dependency {dependency} before enabling module {module_id}"
                ));
            }
        }
        enabled_ids.insert(module_id.to_string());
    } else {
        for candidate in &registry.modules {
            if candidate.id == module_id {
                continue;
            }
            if enabled_ids.contains(&candidate.id)
                && candidate
                    .dependencies
                    .iter()
                    .any(|dependency| dependency == module_id)
            {
                return Err(format!(
                    "Disable dependent module {} before disabling {module_id}",
                    candidate.id
                ));
            }
        }
        enabled_ids.remove(module_id);
    }
    selection.enabled_module_ids = selection
        .installed_module_ids
        .iter()
        .filter(|module_id| enabled_ids.contains(*module_id))
        .cloned()
        .collect();
    selection.last_updated_unix_seconds = now_unix_seconds();
    validate_enabled_modules(&registry, &selection)?;
    write_selection(&selection)?;
    Ok(selection)
}

pub fn set_module_installed(
    module_id: &str,
    installed: bool,
) -> Result<ModuleSelectionState, String> {
    let registry = parse_registry(MODULES_JSON)?;
    let module_map = module_index(&registry);
    let module = module_map
        .get(module_id)
        .ok_or_else(|| format!("Module {module_id} is missing from the registry"))?;
    let selection = module_selection_state()?;
    let currently_installed = selection
        .installed_module_ids
        .iter()
        .any(|installed_id| installed_id == module_id);

    if installed {
        if currently_installed {
            return Ok(selection);
        }
        if module.required || !module.selectable {
            return Err(format!(
                "Module {} is not available for Windows Local install yet.",
                module.id
            ));
        }
        validate_installable_module_contract(module, registry_core_version(&registry)?)?;
        let mut installed_module_ids = selection.installed_module_ids.clone();
        installed_module_ids.push(module_id.to_string());
        let mut enabled_module_ids = selection.enabled_module_ids.clone();
        let product_modules = installed_module_ids
            .iter()
            .filter(|installed_id| installed_id.as_str() != "civiccore")
            .cloned()
            .collect::<Vec<_>>();
        let ordered_module_ids = resolve_custom_module_order(&registry, &product_modules)?;
        for installed_id in &ordered_module_ids {
            if !selection
                .installed_module_ids
                .iter()
                .any(|previous_id| previous_id == installed_id)
            {
                enabled_module_ids.push(installed_id.clone());
            }
        }
        let next_selection = selection_from_installed_and_enabled(
            &registry,
            ordered_module_ids,
            enabled_module_ids,
        )?;
        write_selection(&next_selection)?;
        return Ok(next_selection);
    }

    if !currently_installed {
        return Ok(selection);
    }
    if module.required {
        return Err(format!("Required module {module_id} cannot be removed"));
    }
    for candidate in &registry.modules {
        if candidate.id == module_id {
            continue;
        }
        if selection
            .installed_module_ids
            .iter()
            .any(|installed_id| installed_id == &candidate.id)
            && candidate
                .dependencies
                .iter()
                .any(|dependency| dependency == module_id)
        {
            return Err(format!(
                "Remove dependent module {} before removing {module_id}",
                candidate.id
            ));
        }
    }
    let installed_module_ids = selection
        .installed_module_ids
        .iter()
        .filter(|installed_id| installed_id.as_str() != module_id)
        .cloned()
        .collect::<Vec<_>>();
    let enabled_module_ids = selection
        .enabled_module_ids
        .iter()
        .filter(|enabled_id| enabled_id.as_str() != module_id)
        .cloned()
        .collect::<Vec<_>>();
    let next_selection =
        selection_from_installed_and_enabled(&registry, installed_module_ids, enabled_module_ids)?;
    write_selection(&next_selection)?;
    Ok(next_selection)
}

pub fn module_profiles() -> Result<Vec<ModuleProfileSummary>, String> {
    let registry = parse_registry(MODULES_JSON)?;
    let selection = module_selection_state()?;
    Ok(registry
        .profiles
        .iter()
        .map(|profile| {
            let selected = profile.id == selection.profile_id;
            ModuleProfileSummary {
                id: profile.id.clone(),
                label: profile.label.clone(),
                description: profile.description.clone(),
                selected,
                disabled: profile.disabled,
                disabled_reason: profile.disabled_reason.clone(),
                module_count: if selected && profile.id == "custom" {
                    selection.installed_module_ids.len()
                } else {
                    profile.modules.len()
                },
            }
        })
        .collect())
}

pub fn module_summaries() -> Result<Vec<ModuleSummary>, String> {
    let registry = parse_registry(MODULES_JSON)?;
    validate_profile(&registry, DEFAULT_PROFILE_ID)?;
    let core_version = registry_core_version(&registry)?;
    let canonical_state: CanonicalSuiteState = serde_json::from_str(SUITE_STATE_JSON)
        .map_err(|error| format!("Could not parse canonical Townlight suite state: {error}"))?;
    let mut public_names = HashMap::new();
    for identity in canonical_state.modules.values() {
        if identity.public_name.trim().is_empty() || identity.legacy.technical_id.trim().is_empty()
        {
            return Err("Canonical Townlight module identities must not be blank.".to_string());
        }
        if public_names
            .insert(
                identity.legacy.technical_id.clone(),
                identity.public_name.clone(),
            )
            .is_some()
        {
            return Err(format!(
                "Canonical Townlight suite state repeats technical id {}.",
                identity.legacy.technical_id
            ));
        }
    }
    let selection = module_selection_state()?;
    let installed_ids: HashSet<&str> = selection
        .installed_module_ids
        .iter()
        .map(String::as_str)
        .collect();
    let enabled_ids: HashSet<&str> = selection
        .enabled_module_ids
        .iter()
        .map(String::as_str)
        .collect();

    Ok(registry
        .modules
        .iter()
        .map(|module| {
            let contract_result = validate_installable_module_contract(module, core_version);
            let (contract_ready, blocked_reason) = match contract_result {
                Ok(()) => (true, None),
                Err(error) => (false, Some(error)),
            };
            let display_name = public_names.get(&module.id).cloned().ok_or_else(|| {
                format!(
                    "Module {} is missing from canonical Townlight suite state.",
                    module.id
                )
            })?;
            Ok(ModuleSummary {
                installed: installed_ids.contains(module.id.as_str()),
                id: module.id.clone(),
                display_name,
                role: module.role.clone(),
                version: module.current_version.clone(),
                installer_status: module.installer_status.clone(),
                civiccore_requirement: module.civiccore_requirement.clone(),
                required: module.required,
                selectable: module.selectable,
                contract_ready,
                blocked_reason,
                dependencies: module.dependencies.clone(),
                proof_required: module.proof_required.clone(),
                backup_restore_hooks: module.backup_restore_hooks.clone().unwrap_or_default(),
                route_count: module.routes.as_ref().map_or(0, Vec::len),
                service_count: module.services.as_ref().map_or(0, Vec::len),
                permission_count: module.permissions.as_ref().map_or(0, Vec::len),
                task_count: module.tasks.as_ref().map_or(0, Vec::len),
                lifecycle_install: module
                    .lifecycle
                    .as_ref()
                    .map(|lifecycle| lifecycle.install.clone()),
                lifecycle_update: module
                    .lifecycle
                    .as_ref()
                    .map(|lifecycle| lifecycle.update.clone()),
                lifecycle_disable: module
                    .lifecycle
                    .as_ref()
                    .map(|lifecycle| lifecycle.disable.clone()),
                lifecycle_uninstall: module
                    .lifecycle
                    .as_ref()
                    .map(|lifecycle| lifecycle.uninstall.clone()),
                model_required: module
                    .model_needs
                    .as_ref()
                    .map(|needs| needs.iter().any(|need| need.required))
                    .unwrap_or(false),
                enabled: enabled_ids.contains(module.id.as_str()),
            })
        })
        .collect::<Result<Vec<_>, String>>()?)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::first_run;
    use std::env;

    fn with_temp_state_dir<T>(test: impl FnOnce(PathBuf) -> T) -> T {
        let _guard = first_run::test_env_lock().lock().expect("test env lock");
        let root = env::temp_dir().join(format!(
            "civicsuite-desktop-module-registry-test-{}",
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
    fn records_beta_registry_contract_covers_default_installable_modules() {
        validate_default_registry().expect("records-beta registry validates");
    }

    #[test]
    fn module_summaries_project_canonical_townlight_public_names() {
        with_temp_state_dir(|_| {
            let modules = module_summaries().expect("canonical summaries build");
            for (technical_id, expected_public_name) in [
                ("civiccore", "Townlight Core"),
                ("civicrecords-ai", "Townlight Records"),
                ("civicclerk", "Townlight Meetings"),
                ("civiccode", "Townlight Code"),
                ("civicnotice", "Townlight Notice"),
                ("civicaccess", "Townlight Access"),
            ] {
                let module = modules
                    .iter()
                    .find(|module| module.id == technical_id)
                    .expect("legacy technical id remains present");
                assert_eq!(module.display_name, expected_public_name);
            }
        });
    }

    #[test]
    fn module_selection_defaults_to_records_beta_profile() {
        with_temp_state_dir(|_| {
            let selection = module_selection_state().expect("selection state builds");
            assert_eq!(selection.profile_id, "records-beta");
            assert_eq!(
                selection.installed_module_ids,
                vec![
                    "civiccore".to_string(),
                    "civicrecords-ai".to_string(),
                    "civicnotice".to_string(),
                    "civicaccess".to_string()
                ]
            );
            assert_eq!(selection.enabled_module_ids, selection.installed_module_ids);
        });
    }

    #[test]
    fn persisting_profile_selection_writes_local_registry_state() {
        with_temp_state_dir(|root| {
            let selection =
                persist_profile_selection("city-core").expect("profile selection persists");
            assert_eq!(selection.profile_label, "City Core");
            assert!(root.join("config").join("module-selection.json").is_file());
        });
    }

    #[test]
    fn records_beta_profile_selects_the_dependency_closed_records_system() {
        with_temp_state_dir(|root| {
            let selection = persist_profile_selection("records-beta")
                .expect("records-beta profile selection persists");
            assert_eq!(selection.profile_label, "Townlight Records");
            assert_eq!(
                selection.installed_module_ids,
                vec![
                    "civiccore".to_string(),
                    "civicrecords-ai".to_string(),
                    "civicnotice".to_string(),
                    "civicaccess".to_string(),
                ]
            );
            assert_eq!(selection.enabled_module_ids, selection.installed_module_ids);
            assert!(root.join("config").join("module-selection.json").is_file());
        });
    }

    #[test]
    fn meetings_candidate_requires_explicit_profile_selection() {
        with_temp_state_dir(|_| {
            let selected = persist_profile_selection("meetings-beta").unwrap();
            assert_eq!(selected.profile_id, "meetings-beta");
            assert!(selected
                .installed_module_ids
                .iter()
                .any(|id| id == "civicclerk"));
            assert!(!selected
                .installed_module_ids
                .iter()
                .any(|id| id == "civiccode"));
            assert_eq!(
                module_selection_state().unwrap().profile_id,
                "meetings-beta"
            );
            assert_eq!(
                set_module_enabled("civicclerk", false).unwrap().profile_id,
                "meetings-beta"
            );
        });
    }

    #[test]
    fn custom_selection_locks_civiccore_and_resolves_ready_modules() {
        with_temp_state_dir(|root| {
            let selection =
                persist_custom_selection(&["civicclerk".to_string(), "civiccode".to_string()])
                    .expect("custom selection persists");

            assert_eq!(selection.profile_id, "custom");
            assert_eq!(
                selection.installed_module_ids,
                vec![
                    "civiccore".to_string(),
                    "civicclerk".to_string(),
                    "civiccode".to_string()
                ]
            );
            assert_eq!(selection.enabled_module_ids, selection.installed_module_ids);
            assert!(root.join("config").join("module-selection.json").is_file());
            let reloaded = module_selection_state().expect("custom selection reloads");
            assert_eq!(
                reloaded.installed_module_ids,
                selection.installed_module_ids
            );
            let profiles = module_profiles().expect("profiles build");
            assert!(profiles.iter().any(|profile| {
                profile.id == "custom" && profile.selected && profile.module_count == 3
            }));
            let modules = module_summaries().expect("summaries build");
            assert!(modules
                .iter()
                .any(|module| module.id == "civiccore" && module.installed));
            assert!(modules
                .iter()
                .any(|module| module.id == "civicclerk" && module.installed));
            assert!(modules
                .iter()
                .any(|module| module.id == "civicrecords-ai" && !module.installed));
        });
    }

    #[test]
    fn installed_product_modules_can_be_disabled_without_uninstalling() {
        with_temp_state_dir(|_| {
            persist_profile_selection("city-core").expect("profile selection persists");
            let disabled =
                set_module_enabled("civiccode", false).expect("civiccode can be disabled");
            assert!(disabled
                .installed_module_ids
                .iter()
                .any(|module_id| module_id == "civiccode"));
            assert!(!disabled
                .enabled_module_ids
                .iter()
                .any(|module_id| module_id == "civiccode"));
            let modules = module_summaries().expect("summaries build");
            let civiccode = modules
                .iter()
                .find(|module| module.id == "civiccode")
                .expect("civiccode module");
            assert!(civiccode.installed);
            assert!(!civiccode.enabled);

            let enabled =
                set_module_enabled("civiccode", true).expect("civiccode can be re-enabled");
            assert!(enabled
                .enabled_module_ids
                .iter()
                .any(|module_id| module_id == "civiccode"));
            let core_error =
                set_module_enabled("civiccore", false).expect_err("civiccore cannot be disabled");
            assert!(core_error.contains("Required module civiccore cannot be disabled"));
        });
    }

    #[test]
    fn product_modules_can_be_removed_and_reinstalled_without_data_deletion() {
        with_temp_state_dir(|_| {
            persist_profile_selection("city-core").expect("profile selection persists");
            let removed =
                set_module_installed("civiccode", false).expect("civiccode can be removed");
            assert_eq!(removed.profile_id, "custom");
            assert!(!removed
                .installed_module_ids
                .iter()
                .any(|module_id| module_id == "civiccode"));
            assert!(removed
                .installed_module_ids
                .iter()
                .any(|module_id| module_id == "civicnotice"));
            assert!(!removed
                .enabled_module_ids
                .iter()
                .any(|module_id| module_id == "civiccode"));
            assert!(removed
                .disabled_module_ids
                .iter()
                .any(|module_id| module_id == "civiccode"));
            let removed_modules = module_summaries().expect("summaries build");
            assert!(removed_modules
                .iter()
                .any(|module| module.id == "civiccode" && !module.installed && !module.enabled));

            let installed =
                set_module_installed("civiccode", true).expect("civiccode can be reinstalled");
            assert_eq!(installed.profile_id, "city-core");
            assert!(installed
                .installed_module_ids
                .iter()
                .any(|module_id| module_id == "civiccode"));
            assert!(installed
                .enabled_module_ids
                .iter()
                .any(|module_id| module_id == "civiccode"));
        });
    }

    #[test]
    fn module_install_remove_respects_contract_boundaries() {
        with_temp_state_dir(|_| {
            persist_profile_selection("minimal").expect("minimal profile persists");
            let planned = set_module_installed("civicregwatch", true)
                .expect_err("planned module cannot be installed");
            assert!(planned.contains("not available for Windows Local install"));

            let required =
                set_module_installed("civiccore", false).expect_err("civiccore cannot be removed");
            assert!(required.contains("Required module civiccore cannot be removed"));

            let installed =
                set_module_installed("civicrecords-ai", true).expect("records can install");
            assert_eq!(installed.profile_id, "custom");
            assert!(installed
                .installed_module_ids
                .iter()
                .any(|module_id| module_id == "civicrecords-ai"));
        });
    }

    #[test]
    fn civicnotice_installs_with_core_dependency_from_custom_profile() {
        with_temp_state_dir(|_| {
            persist_profile_selection("minimal").expect("minimal profile persists");
            let installed =
                set_module_installed("civicnotice", true).expect("civicnotice can install");
            assert_eq!(installed.profile_id, "custom");
            assert_eq!(
                installed.installed_module_ids,
                vec!["civiccore".to_string(), "civicnotice".to_string()]
            );
            assert_eq!(installed.enabled_module_ids, installed.installed_module_ids);

            let modules = module_summaries().expect("summaries build");
            let civicnotice = modules
                .iter()
                .find(|module| module.id == "civicnotice")
                .expect("civicnotice module");
            assert!(civicnotice.installed);
            assert!(civicnotice.enabled);
            assert!(civicnotice.contract_ready);
            assert_eq!(civicnotice.version.as_deref(), Some("0.2.0"));
            assert_eq!(civicnotice.civiccore_requirement.as_deref(), Some("1.2.1"));
            assert!(civicnotice
                .backup_restore_hooks
                .iter()
                .any(|hook| hook == "Data/workflows/notice"));
            assert_eq!(civicnotice.model_required, false);
            assert!(civicnotice.blocked_reason.is_none());
        });
    }

    #[test]
    fn custom_selection_rejects_empty_or_not_ready_modules() {
        with_temp_state_dir(|_| {
            let empty = persist_custom_selection(&[]);
            assert!(empty
                .expect_err("empty custom selection fails")
                .contains("at least one product module"));

            let planned = persist_custom_selection(&["civicregwatch".to_string()]);
            assert!(planned
                .expect_err("planned module selection fails")
                .contains("cannot be selected"));

            let not_ready = persist_custom_selection(&["civiczone".to_string()]);
            assert!(not_ready
                .expect_err("not-ready module selection fails")
                .contains("compatible with 1.2.1"));
        });
    }

    #[test]
    fn profile_summaries_mark_active_profile() {
        with_temp_state_dir(|_| {
            persist_profile_selection("city-core").expect("profile selection persists");
            let profiles = module_profiles().expect("profiles build");
            assert!(profiles
                .iter()
                .any(|profile| profile.id == "city-core" && profile.selected));
            assert!(profiles.iter().any(|profile| {
                profile.id == "full-suite"
                    && profile.disabled
                    && profile
                        .disabled_reason
                        .as_deref()
                        .unwrap_or_default()
                        .contains("not installable")
            }));
        });
    }

    #[test]
    fn module_summaries_expose_contract_status_for_future_manager() {
        with_temp_state_dir(|_| {
            persist_profile_selection("city-core").expect("city-core profile persists");
            let modules = module_summaries().expect("module summaries build");
            let civiccode = modules
                .iter()
                .find(|module| module.id == "civiccode")
                .expect("civiccode module");
            assert!(civiccode.installed);
            assert_eq!(civiccode.civiccore_requirement.as_deref(), Some("1.2.0"));
            assert_eq!(
                civiccode.lifecycle_uninstall.as_deref(),
                Some("backup-first-module-data-removal")
            );
            assert_eq!(
                civiccode.lifecycle_update.as_deref(),
                Some("manifest-versioned")
            );
            assert!(civiccode
                .backup_restore_hooks
                .iter()
                .any(|hook| hook == "Data/workflows/code"));
            assert!(civiccode
                .backup_restore_hooks
                .iter()
                .any(|hook| hook == "Data/exports/code"));
            assert!(civiccode.route_count > 0);
            assert!(civiccode.service_count > 0);
            assert!(civiccode.permission_count > 0);
            assert!(civiccode.task_count > 0);
            assert!(civiccode.model_required);
            assert!(civiccode.contract_ready);
            assert!(civiccode.blocked_reason.is_none());

            let civicaccess = modules
                .iter()
                .find(|module| module.id == "civicaccess")
                .expect("civicaccess module");
            assert!(
                civicaccess.model_required,
                "civicaccess AI features (plain-language, variants, review analysis) require the pinned local model"
            );
            assert!(civicaccess.contract_ready);
            assert!(civicaccess.blocked_reason.is_none());

            let civiczone = modules
                .iter()
                .find(|module| module.id == "civiczone")
                .expect("future module");
            assert!(!civiczone.installed);
            assert_eq!(
                civiczone.installer_status.as_deref(),
                Some("demoted_v0_2_2_truth_repair_no_functional_upgrade")
            );
            assert!(!civiczone.contract_ready);
            assert!(civiczone
                .blocked_reason
                .as_deref()
                .unwrap_or_default()
                .contains("compatible with 1.2.1"));
        });
    }
}
