use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::env;
use std::fs::{self, OpenOptions};
use std::io::{Read, Write};
use std::net::{TcpStream, ToSocketAddrs};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use crate::local_paths;

const RUNTIME_MANIFEST_JSON: &str = include_str!("../../runtime/windows-local-runtime.json");
const RUNTIME_PAYLOADS_JSON: &str = include_str!("../../runtime/windows-runtime-payloads.json");
const REQUIRED_ACTIONS: [&str; 12] = [
    "install",
    "start",
    "stop",
    "health",
    "repair",
    "logs",
    "support-bundle",
    "backup",
    "open-backup-folder",
    "restore",
    "uninstall",
    "open-windows-uninstall",
];
const LOCAL_DB_NAME: &str = "civicsuite";
const LOCAL_DB_USER: &str = "civicsuite";
const LOCAL_DB_PORT: u16 = 15432;
const PROFILE_REPLACE_ATTEMPTS: usize = 12;
const PROFILE_REPLACE_RETRY_DELAY: Duration = Duration::from_millis(750);
const SERVICE_COMMAND_TIMEOUT: Duration = Duration::from_secs(60);

// Resolve a Windows system binary to its absolute path under %SystemRoot% instead of
// relying on PATH lookup. CreateProcess searches the app dir and CWD before System32,
// so spawning system binaries by bare name is a PATH/CWD-hijack vector.
#[cfg(windows)]
fn system32_exe(relative: &str) -> PathBuf {
    let system_root = env::var("SystemRoot").unwrap_or_else(|_| "C:\\Windows".to_string());
    let mut path = PathBuf::from(system_root);
    path.push("System32");
    for part in relative.split('\\') {
        path.push(part);
    }
    path
}

// Non-Windows builds keep the bare name so Linux/macOS behavior is unchanged.
#[cfg(not(windows))]
fn system32_exe(relative: &str) -> PathBuf {
    PathBuf::from(relative.rsplit('\\').next().unwrap_or(relative))
}

#[derive(Deserialize)]
struct OperatorPath {
    requires_docker: bool,
    requires_wsl: bool,
    requires_terminal: bool,
}

#[derive(Deserialize)]
struct RuntimeManifest {
    schema_version: u16,
    profile: String,
    local_only: bool,
    operator_path: OperatorPath,
    lifecycle_actions: Vec<String>,
    services: Vec<ServiceDefinition>,
}

#[derive(Deserialize)]
struct RuntimePayloadManifest {
    schema_version: u16,
    profile: String,
    local_only: bool,
    payload_root: String,
    install_root: String,
    payloads: Vec<RuntimePayloadDefinition>,
}

#[derive(Deserialize)]
struct RuntimePayloadDefinition {
    id: String,
    label: String,
    services: Vec<String>,
    source_dir: String,
    destination_dir: String,
    required_files: Vec<String>,
}

#[derive(Deserialize)]
struct RuntimePayloadLock {
    schema_version: u16,
    profile: String,
    payloads: Vec<RuntimePayloadLockEntry>,
}

#[derive(Deserialize)]
struct RuntimePayloadLockEntry {
    id: String,
    source_dir: String,
    required_files: Vec<RuntimePayloadLockFile>,
}

#[derive(Deserialize)]
struct RuntimePayloadLockFile {
    path: String,
    size_bytes: u64,
    sha256: String,
}

#[derive(Deserialize)]
struct ServiceDefinition {
    id: String,
    label: String,
    admin_label: String,
    kind: String,
    required: bool,
    binary: String,
    args: Vec<String>,
    health: HealthDefinition,
    log_path: String,
    next_action: String,
}

#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "kebab-case")]
enum HealthDefinition {
    Tcp { host: String, port: u16 },
    Http { endpoint: String },
    Supervisor { service: String },
    Filesystem { path: String },
}

#[derive(Serialize)]
pub struct RuntimeHealthItem {
    pub id: String,
    pub label: String,
    pub ok: bool,
    pub status: &'static str,
    pub message: String,
    pub next_action: String,
    pub admin_detail: String,
    pub actionable: bool,
}

#[derive(Serialize)]
pub struct SupervisorActionResult {
    pub accepted: bool,
    pub action: String,
    pub service_id: Option<String>,
    pub status: &'static str,
    pub message: String,
    pub next_action: String,
}

#[derive(Deserialize, Serialize, Default)]
struct RuntimeState {
    services: Vec<ServiceRuntimeState>,
    last_action: Option<String>,
    last_updated_unix_seconds: u64,
}

#[derive(Deserialize, Serialize, Clone)]
struct ServiceRuntimeState {
    id: String,
    installed: bool,
    pid: Option<u32>,
    last_action: Option<String>,
    last_updated_unix_seconds: u64,
}

#[derive(Deserialize, Serialize, Clone, Debug, Eq, PartialEq)]
struct BackupFileEntry {
    path: String,
    size_bytes: u64,
    sha256: String,
}

#[derive(Deserialize, Serialize, Clone, Debug, Eq, PartialEq)]
struct SkippedBackupFileEntry {
    path: String,
    reason: String,
}

#[derive(Deserialize, Serialize)]
struct BackupManifest {
    schema_version: u16,
    kind: String,
    created_unix_seconds: u64,
    source_root: String,
    data_source: String,
    config_source: String,
    backup_root: String,
    contains_data: bool,
    contains_config: bool,
    file_count: usize,
    files: Vec<BackupFileEntry>,
    #[serde(default)]
    skipped_files: Vec<SkippedBackupFileEntry>,
    #[serde(default)]
    database_consistency: Option<String>,
}

#[derive(Clone, Copy)]
struct BackupOptions {
    include_model_cache: bool,
}

impl Default for BackupOptions {
    fn default() -> Self {
        Self {
            include_model_cache: true,
        }
    }
}

#[derive(Clone, Copy, Default)]
struct RestoreProfileOptions {
    skip_source_model_cache: bool,
    preserve_destination_model_cache: bool,
    /// Never copy a legacy backup's secrets folder over the live install.
    skip_source_secrets: bool,
    /// Keep the live (per-install) secrets folder when swapping the config dir
    /// from a backup, so the local database password survives a restore.
    preserve_destination_secrets: bool,
}

#[derive(Serialize)]
struct SupportBundleManifest {
    schema_version: u16,
    kind: String,
    created_unix_seconds: u64,
    source_root: String,
    data_source: String,
    backup_root: String,
    selected_services: Vec<String>,
    file_count: usize,
    files: Vec<BackupFileEntry>,
    skipped_files: Vec<SkippedBackupFileEntry>,
}

fn parse_manifest() -> Result<RuntimeManifest, String> {
    serde_json::from_str(RUNTIME_MANIFEST_JSON)
        .map_err(|error| format!("Could not parse Windows runtime manifest: {error}"))
}

fn parse_payload_manifest() -> Result<RuntimePayloadManifest, String> {
    serde_json::from_str(RUNTIME_PAYLOADS_JSON)
        .map_err(|error| format!("Could not parse Windows runtime payload manifest: {error}"))
}

fn validate_manifest(manifest: &RuntimeManifest) -> Result<(), String> {
    if manifest.schema_version != 1 {
        return Err(format!(
            "Unsupported Windows runtime manifest schema {}",
            manifest.schema_version
        ));
    }
    if manifest.profile != "windows-local-1.0" {
        return Err("Windows runtime manifest profile must be windows-local-1.0".to_string());
    }
    if !manifest.local_only {
        return Err("Windows runtime manifest must be local-only".to_string());
    }
    if manifest.operator_path.requires_docker
        || manifest.operator_path.requires_wsl
        || manifest.operator_path.requires_terminal
    {
        return Err("Windows operator path cannot require developer tooling".to_string());
    }
    for action in REQUIRED_ACTIONS {
        if !manifest
            .lifecycle_actions
            .iter()
            .any(|candidate| candidate == action)
        {
            return Err(format!("Windows runtime manifest is missing {action}"));
        }
    }
    if manifest.services.is_empty() {
        return Err("Windows runtime manifest must define at least one service".to_string());
    }
    Ok(())
}

fn validate_payload_manifest(
    manifest: &RuntimeManifest,
    payload_manifest: &RuntimePayloadManifest,
) -> Result<(), String> {
    if payload_manifest.schema_version != 1 {
        return Err(format!(
            "Unsupported Windows runtime payload manifest schema {}",
            payload_manifest.schema_version
        ));
    }
    if payload_manifest.profile != manifest.profile {
        return Err(
            "Windows runtime payload manifest profile does not match runtime profile".to_string(),
        );
    }
    if !payload_manifest.local_only {
        return Err("Windows runtime payload manifest must be local-only".to_string());
    }
    if payload_manifest.payload_root != "runtime/payload" {
        return Err("Windows runtime payload root must be runtime/payload".to_string());
    }
    if payload_manifest.install_root != "runtime" {
        return Err("Windows runtime payload install root must be runtime".to_string());
    }
    for service in &manifest.services {
        if !payload_manifest
            .payloads
            .iter()
            .any(|payload| payload.services.iter().any(|id| id == &service.id))
        {
            return Err(format!(
                "Windows runtime payload manifest is missing service {}",
                service.id
            ));
        }
    }
    Ok(())
}

fn civic_suite_root() -> PathBuf {
    local_paths::civic_suite_root()
}

fn data_root() -> PathBuf {
    local_paths::data_root()
}

fn config_dir() -> PathBuf {
    local_paths::config_dir()
}

fn secrets_dir() -> PathBuf {
    config_dir().join("secrets")
}

fn backup_root() -> PathBuf {
    local_paths::backup_root()
}

fn support_bundle_root() -> PathBuf {
    backup_root().join("support-bundles")
}

fn runtime_root() -> PathBuf {
    env::var("CIVICSUITE_RUNTIME_ROOT")
        .map(PathBuf::from)
        .unwrap_or_else(|_| {
            local_paths::effective_locations()
                .map(|locations| PathBuf::from(locations.install_root))
                .unwrap_or_else(|_| civic_suite_root())
        })
}

fn random_hex_secret(byte_count: usize) -> Result<String, String> {
    let mut bytes = vec![0_u8; byte_count];
    getrandom::getrandom(&mut bytes)
        .map_err(|error| format!("Could not generate local runtime secret: {error}"))?;
    Ok(bytes.iter().map(|byte| format!("{byte:02x}")).collect())
}

fn read_or_create_secret(file_name: &str, byte_count: usize) -> Result<String, String> {
    let path = secrets_dir().join(file_name);
    if path.is_file() {
        return fs::read_to_string(&path)
            .map(|value| value.trim().to_string())
            .map_err(|error| format!("Could not read {}: {error}", path.display()));
    }
    fs::create_dir_all(secrets_dir())
        .map_err(|error| format!("Could not create local secret folder: {error}"))?;
    let value = random_hex_secret(byte_count)?;
    crate::atomic_io::atomic_write_bytes(&path, format!("{value}\n").as_bytes())?;
    Ok(value)
}

fn postgres_password() -> Result<String, String> {
    read_or_create_secret("postgres-password.txt", 32)
}

fn civicaccess_trusted_write_token() -> Result<String, String> {
    read_or_create_secret("civicaccess-trusted-write-token.txt", 32)
}

fn local_database_url(driver: &str) -> Result<String, String> {
    Ok(format!(
        "{driver}://{LOCAL_DB_USER}:{}@127.0.0.1:{LOCAL_DB_PORT}/{LOCAL_DB_NAME}",
        postgres_password()?
    ))
}

fn append_executable_payload_roots(candidates: &mut Vec<PathBuf>, executable_parent: &Path) {
    candidates.push(executable_parent.join("runtime").join("payload"));
    candidates.push(
        executable_parent
            .join("_up_")
            .join("runtime")
            .join("payload"),
    );
    candidates.push(
        executable_parent
            .join("resources")
            .join("runtime")
            .join("payload"),
    );
    candidates.push(executable_parent.join("resources").join("runtime-payload"));
    candidates.push(
        executable_parent
            .join("_up_")
            .join("resources")
            .join("runtime")
            .join("payload"),
    );
    candidates.push(
        executable_parent
            .join("_up_")
            .join("resources")
            .join("runtime-payload"),
    );
}

fn runtime_payload_roots() -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    if let Ok(root) = env::var("CIVICSUITE_RUNTIME_PAYLOAD_DIR") {
        candidates.push(PathBuf::from(root));
    }
    if let Ok(exe) = env::current_exe() {
        if let Some(parent) = exe.parent() {
            append_executable_payload_roots(&mut candidates, parent);
        }
    }
    candidates.push(runtime_root().join("runtime").join("payload"));
    candidates
}

fn state_path() -> PathBuf {
    config_dir().join("runtime-state.json")
}

fn now_unix_seconds() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or(0)
}

fn ensure_profile_child_for_delete(path: &Path) -> Result<(), String> {
    if !path.exists() {
        return Ok(());
    }
    let root = civic_suite_root();
    fs::create_dir_all(&root)
        .map_err(|error| format!("Could not create Townlight profile root: {error}"))?;
    let canonical_root = fs::canonicalize(&root)
        .map_err(|error| format!("Could not resolve {}: {error}", root.display()))?;
    let canonical_path = fs::canonicalize(path)
        .map_err(|error| format!("Could not resolve {}: {error}", path.display()))?;
    if canonical_path == canonical_root || !canonical_path.starts_with(&canonical_root) {
        return Err(format!(
            "Refusing to remove {} because it is outside the Townlight profile.",
            path.display()
        ));
    }
    Ok(())
}

fn copy_path_recursive(source: &Path, destination: &Path) -> Result<(), String> {
    if !source.exists() {
        return Ok(());
    }
    let metadata = fs::symlink_metadata(source)
        .map_err(|error| format!("Could not inspect {}: {error}", source.display()))?;
    if metadata.file_type().is_symlink() {
        return Err(format!(
            "Refusing to follow symbolic link during backup: {}",
            source.display()
        ));
    }
    if metadata.is_dir() {
        fs::create_dir_all(destination)
            .map_err(|error| format!("Could not create {}: {error}", destination.display()))?;
        for entry in fs::read_dir(source)
            .map_err(|error| format!("Could not read {}: {error}", source.display()))?
        {
            let entry = entry.map_err(|error| format!("Could not read backup entry: {error}"))?;
            let child_source = entry.path();
            let child_destination = destination.join(entry.file_name());
            copy_path_recursive(&child_source, &child_destination)?;
        }
    } else if metadata.is_file() {
        if let Some(parent) = destination.parent() {
            fs::create_dir_all(parent)
                .map_err(|error| format!("Could not create {}: {error}", parent.display()))?;
        }
        fs::copy(source, destination).map_err(|error| {
            format!(
                "Could not copy {} to {}: {error}",
                source.display(),
                destination.display()
            )
        })?;
    }
    Ok(())
}

fn relative_path_is_model_cache(source_root: &Path, current: &Path) -> bool {
    relative_path_first_component_is(source_root, current, "models")
}

fn relative_path_is_secrets(source_root: &Path, current: &Path) -> bool {
    relative_path_first_component_is(source_root, current, "secrets")
}

fn relative_path_first_component_is(source_root: &Path, current: &Path, name: &str) -> bool {
    let Ok(relative) = current.strip_prefix(source_root) else {
        return false;
    };
    relative
        .components()
        .next()
        .map(|component| {
            component
                .as_os_str()
                .to_string_lossy()
                .eq_ignore_ascii_case(name)
        })
        .unwrap_or(false)
}

fn copy_path_recursive_for_restore(
    source: &Path,
    destination: &Path,
    options: RestoreProfileOptions,
) -> Result<(), String> {
    fn copy(
        source_root: &Path,
        current: &Path,
        destination: &Path,
        options: RestoreProfileOptions,
    ) -> Result<(), String> {
        if !current.exists() {
            return Ok(());
        }
        if options.skip_source_model_cache && relative_path_is_model_cache(source_root, current) {
            return Ok(());
        }
        if options.skip_source_secrets && relative_path_is_secrets(source_root, current) {
            return Ok(());
        }
        let metadata = fs::symlink_metadata(current)
            .map_err(|error| format!("Could not inspect {}: {error}", current.display()))?;
        if metadata.file_type().is_symlink() {
            return Err(format!(
                "Refusing to follow symbolic link during restore: {}",
                current.display()
            ));
        }
        if metadata.is_dir() {
            fs::create_dir_all(destination)
                .map_err(|error| format!("Could not create {}: {error}", destination.display()))?;
            for entry in fs::read_dir(current)
                .map_err(|error| format!("Could not read {}: {error}", current.display()))?
            {
                let entry =
                    entry.map_err(|error| format!("Could not read restore entry: {error}"))?;
                copy(
                    source_root,
                    &entry.path(),
                    &destination.join(entry.file_name()),
                    options,
                )?;
            }
        } else if metadata.is_file() {
            if let Some(parent) = destination.parent() {
                fs::create_dir_all(parent)
                    .map_err(|error| format!("Could not create {}: {error}", parent.display()))?;
            }
            fs::copy(current, destination).map_err(|error| {
                format!(
                    "Could not copy {} to {}: {error}",
                    current.display(),
                    destination.display()
                )
            })?;
        }
        Ok(())
    }

    copy(source, source, destination, options)
}

fn backup_relative_copy_path(prefix: &str, source_root: &Path, current: &Path) -> String {
    let path = current
        .strip_prefix(source_root)
        .ok()
        .filter(|relative| !relative.as_os_str().is_empty())
        .map(|relative| PathBuf::from(prefix).join(relative))
        .unwrap_or_else(|| PathBuf::from(prefix));
    path.components()
        .map(|component| component.as_os_str().to_string_lossy())
        .collect::<Vec<_>>()
        .join("/")
}

fn backup_relative_path_is_model_cache(prefix: &str, source_root: &Path, current: &Path) -> bool {
    let relative_path = backup_relative_copy_path(prefix, source_root, current);
    relative_path == "Data/models" || relative_path.starts_with("Data/models/")
}

/// The per-install secrets folder (e.g. the local Postgres password) must never
/// be written into a backup artifact. Backups land in the user's Documents
/// folder, so copying the plaintext database password there would expose it.
/// The secret is per-install and stays with the install; restore preserves the
/// live secrets folder rather than relying on the backup to carry it.
fn backup_relative_path_is_secret(prefix: &str, source_root: &Path, current: &Path) -> bool {
    let relative_path = backup_relative_copy_path(prefix, source_root, current);
    relative_path == "config/secrets" || relative_path.starts_with("config/secrets/")
}

fn push_backup_copy_skip(
    skipped: &mut Vec<SkippedBackupFileEntry>,
    prefix: &str,
    source_root: &Path,
    current: &Path,
    reason: impl Into<String>,
) {
    skipped.push(SkippedBackupFileEntry {
        path: backup_relative_copy_path(prefix, source_root, current),
        reason: reason.into(),
    });
}

fn copy_path_recursive_for_backup(
    source: &Path,
    destination: &Path,
    backup_path_prefix: &str,
    skipped: &mut Vec<SkippedBackupFileEntry>,
) {
    copy_path_recursive_for_backup_with_options(
        source,
        destination,
        backup_path_prefix,
        skipped,
        BackupOptions::default(),
    );
}

fn copy_path_recursive_for_backup_with_options(
    source: &Path,
    destination: &Path,
    backup_path_prefix: &str,
    skipped: &mut Vec<SkippedBackupFileEntry>,
    options: BackupOptions,
) {
    fn copy(
        source_root: &Path,
        current: &Path,
        destination: &Path,
        backup_path_prefix: &str,
        skipped: &mut Vec<SkippedBackupFileEntry>,
        options: BackupOptions,
    ) {
        if !current.exists() {
            return;
        }
        if backup_relative_path_is_secret(backup_path_prefix, source_root, current) {
            push_backup_copy_skip(
                skipped,
                backup_path_prefix,
                source_root,
                current,
                "per-install local secret excluded from backups; it stays with the install and is preserved across restore",
            );
            return;
        }
        if !options.include_model_cache
            && backup_relative_path_is_model_cache(backup_path_prefix, source_root, current)
        {
            push_backup_copy_skip(
                skipped,
                backup_path_prefix,
                source_root,
                current,
                "local model cache skipped for restore safety backup; Townlight verifies or redownloads model files after restore",
            );
            return;
        }
        let metadata = match fs::symlink_metadata(current) {
            Ok(metadata) => metadata,
            Err(error) => {
                push_backup_copy_skip(
                    skipped,
                    backup_path_prefix,
                    source_root,
                    current,
                    format!("inspect failed before copy: {error}"),
                );
                return;
            }
        };
        if metadata.file_type().is_symlink() {
            push_backup_copy_skip(
                skipped,
                backup_path_prefix,
                source_root,
                current,
                "symbolic link skipped during backup copy",
            );
            return;
        }
        if metadata.is_dir() {
            if let Err(error) = fs::create_dir_all(destination) {
                push_backup_copy_skip(
                    skipped,
                    backup_path_prefix,
                    source_root,
                    current,
                    format!("backup folder create failed: {error}"),
                );
                return;
            }
            let children = match fs::read_dir(current) {
                Ok(children) => children,
                Err(error) => {
                    push_backup_copy_skip(
                        skipped,
                        backup_path_prefix,
                        source_root,
                        current,
                        format!("folder read failed during backup copy: {error}"),
                    );
                    return;
                }
            };
            for entry in children {
                let entry = match entry {
                    Ok(entry) => entry,
                    Err(error) => {
                        push_backup_copy_skip(
                            skipped,
                            backup_path_prefix,
                            source_root,
                            current,
                            format!("folder entry read failed during backup copy: {error}"),
                        );
                        continue;
                    }
                };
                copy(
                    source_root,
                    &entry.path(),
                    &destination.join(entry.file_name()),
                    backup_path_prefix,
                    skipped,
                    options,
                );
            }
            return;
        }
        if metadata.is_file() {
            if let Some(parent) = destination.parent() {
                if let Err(error) = fs::create_dir_all(parent) {
                    push_backup_copy_skip(
                        skipped,
                        backup_path_prefix,
                        source_root,
                        current,
                        format!("backup parent folder create failed: {error}"),
                    );
                    return;
                }
            }
            if let Err(error) = fs::copy(current, destination) {
                push_backup_copy_skip(
                    skipped,
                    backup_path_prefix,
                    source_root,
                    current,
                    format!("backup file copy failed: {error}"),
                );
            }
        }
    }

    copy(
        source,
        source,
        destination,
        backup_path_prefix,
        skipped,
        options,
    );
}

fn normalized_backup_path(root: &Path, path: &Path) -> Result<String, String> {
    let relative = path.strip_prefix(root).map_err(|error| {
        format!(
            "Could not calculate backup-relative path for {}: {error}",
            path.display()
        )
    })?;
    Ok(relative
        .components()
        .map(|component| component.as_os_str().to_string_lossy())
        .collect::<Vec<_>>()
        .join("/"))
}

fn sha256_file(path: &Path) -> Result<(u64, String), String> {
    let mut file = fs::File::open(path)
        .map_err(|error| format!("Could not open {}: {error}", path.display()))?;
    let mut hasher = Sha256::new();
    let mut size = 0_u64;
    let mut buffer = [0_u8; 8192];
    loop {
        let read = file
            .read(&mut buffer)
            .map_err(|error| format!("Could not read {}: {error}", path.display()))?;
        if read == 0 {
            break;
        }
        size += read as u64;
        hasher.update(&buffer[..read]);
    }
    Ok((
        size,
        hasher
            .finalize()
            .iter()
            .map(|byte| format!("{byte:02x}"))
            .collect(),
    ))
}

fn collect_backup_files_with_skips(
    root: &Path,
) -> Result<(Vec<BackupFileEntry>, Vec<SkippedBackupFileEntry>), String> {
    fn collect(
        root: &Path,
        current: &Path,
        entries: &mut Vec<BackupFileEntry>,
        skipped: &mut Vec<SkippedBackupFileEntry>,
    ) -> Result<(), String> {
        let skipped_path =
            normalized_backup_path(root, current).unwrap_or_else(|_| current.display().to_string());
        if !current.exists() {
            return Ok(());
        }
        let metadata = match fs::symlink_metadata(current) {
            Ok(metadata) => metadata,
            Err(error) => {
                skipped.push(SkippedBackupFileEntry {
                    path: skipped_path,
                    reason: format!("inspect failed: {error}"),
                });
                return Ok(());
            }
        };
        if metadata.file_type().is_symlink() {
            skipped.push(SkippedBackupFileEntry {
                path: skipped_path,
                reason: "symbolic link skipped".to_string(),
            });
            return Ok(());
        }
        if metadata.is_dir() {
            let mut children = match fs::read_dir(current) {
                Ok(children) => match children.collect::<Result<Vec<_>, _>>() {
                    Ok(children) => children,
                    Err(error) => {
                        skipped.push(SkippedBackupFileEntry {
                            path: skipped_path,
                            reason: format!("folder entry read failed: {error}"),
                        });
                        return Ok(());
                    }
                },
                Err(error) => {
                    skipped.push(SkippedBackupFileEntry {
                        path: skipped_path,
                        reason: format!("folder read failed: {error}"),
                    });
                    return Ok(());
                }
            };
            children.sort_by_key(|entry| entry.path());
            for child in children {
                collect(root, &child.path(), entries, skipped)?;
            }
            return Ok(());
        }
        if metadata.is_file()
            && current != root.join("backup-manifest.json")
            && current != root.join("support-manifest.json")
        {
            match sha256_file(current) {
                Ok((size_bytes, sha256)) => entries.push(BackupFileEntry {
                    path: normalized_backup_path(root, current)?,
                    size_bytes,
                    sha256,
                }),
                Err(error) => skipped.push(SkippedBackupFileEntry {
                    path: skipped_path,
                    reason: error,
                }),
            }
        }
        Ok(())
    }

    let mut entries = Vec::new();
    let mut skipped = Vec::new();
    collect(root, root, &mut entries, &mut skipped)?;
    entries.sort_by(|left, right| left.path.cmp(&right.path));
    skipped.sort_by(|left, right| left.path.cmp(&right.path));
    Ok((entries, skipped))
}

fn payloads_for_services<'a>(
    payload_manifest: &'a RuntimePayloadManifest,
    services: &[&ServiceDefinition],
) -> Vec<&'a RuntimePayloadDefinition> {
    payload_manifest
        .payloads
        .iter()
        .filter(|payload| {
            services.iter().any(|service| {
                payload
                    .services
                    .iter()
                    .any(|payload_service| payload_service == &service.id)
            })
        })
        .collect()
}

fn payload_destination(payload: &RuntimePayloadDefinition) -> PathBuf {
    let destination = PathBuf::from(payload.destination_dir.replace('/', "\\"));
    if destination.is_absolute() {
        destination
    } else {
        runtime_root().join(destination)
    }
}

fn payload_required_files_present(payload: &RuntimePayloadDefinition) -> bool {
    let destination = payload_destination(payload);
    payload
        .required_files
        .iter()
        .all(|file| destination.join(file.replace('/', "\\")).exists())
}

fn normalized_payload_file_path(path: &str) -> String {
    path.replace('\\', "/")
}

fn parse_payload_lock(payload_root: &Path) -> Result<RuntimePayloadLock, String> {
    let lock_path = payload_root.join("runtime-payload-lock.json");
    let contents = fs::read_to_string(&lock_path)
        .map_err(|error| format!("Could not read {}: {error}", lock_path.display()))?;
    serde_json::from_str(contents.trim_start_matches('\u{feff}'))
        .map_err(|error| format!("Could not parse {}: {error}", lock_path.display()))
}

fn verify_payload_files_against_lock(
    payload: &RuntimePayloadDefinition,
    payload_root: &Path,
    base_dir: &Path,
) -> Result<(), String> {
    let lock = parse_payload_lock(payload_root)?;
    if lock.schema_version != 1 {
        return Err(format!(
            "Unsupported runtime payload lock schema {}",
            lock.schema_version
        ));
    }
    if lock.profile != "windows-local-1.0" {
        return Err("Runtime payload lock profile must be windows-local-1.0".to_string());
    }
    let entry = lock
        .payloads
        .iter()
        .find(|entry| entry.id == payload.id)
        .ok_or_else(|| format!("Runtime payload lock is missing {}", payload.id))?;
    if normalized_payload_file_path(&entry.source_dir)
        != normalized_payload_file_path(&payload.source_dir)
    {
        return Err(format!(
            "Runtime payload lock source for {} does not match the payload manifest",
            payload.id
        ));
    }
    for required_file in &payload.required_files {
        let normalized_required_file = normalized_payload_file_path(required_file);
        let locked_file = entry
            .required_files
            .iter()
            .find(|file| normalized_payload_file_path(&file.path) == normalized_required_file)
            .ok_or_else(|| {
                format!(
                    "Runtime payload lock missing required file {} for {}",
                    required_file, payload.id
                )
            })?;
        if locked_file.sha256.len() != 64
            || !locked_file
                .sha256
                .chars()
                .all(|character| character.is_ascii_hexdigit())
        {
            return Err(format!(
                "Runtime payload lock has an invalid SHA-256 for {} in {}",
                required_file, payload.id
            ));
        }
        let path = base_dir.join(required_file.replace('/', "\\"));
        if !path.is_file() {
            return Err(format!(
                "Runtime payload file is missing: {}",
                path.display()
            ));
        }
        let (size_bytes, sha256) = sha256_file(&path)?;
        if size_bytes != locked_file.size_bytes || sha256 != locked_file.sha256.to_lowercase() {
            return Err(format!(
                "Runtime payload file failed integrity check: {}",
                required_file
            ));
        }
    }
    Ok(())
}

fn first_payload_source(payload: &RuntimePayloadDefinition) -> Option<(PathBuf, PathBuf)> {
    runtime_payload_roots()
        .into_iter()
        .filter_map(|root| {
            let source = root.join(payload.source_dir.replace('/', "\\"));
            source.is_dir().then_some((root, source))
        })
        .next()
}

fn install_runtime_payloads(payloads: &[&RuntimePayloadDefinition]) -> Result<Vec<String>, String> {
    let mut missing = Vec::new();
    for payload in payloads {
        let destination = payload_destination(payload);
        if payload_required_files_present(payload) {
            if let Some((payload_root, _)) = first_payload_source(payload) {
                if verify_payload_files_against_lock(payload, &payload_root, &destination).is_ok() {
                    continue;
                }
            } else {
                continue;
            }
        }
        let Some((payload_root, source)) = first_payload_source(payload) else {
            missing.push(format!("{} ({})", payload.label, payload.id));
            continue;
        };
        if let Err(error) = verify_payload_files_against_lock(payload, &payload_root, &source) {
            missing.push(format!(
                "{} ({}) source payload integrity check failed: {}",
                payload.label, payload.id, error
            ));
            continue;
        }
        copy_path_recursive(&source, &destination)?;
        if !payload_required_files_present(payload) {
            missing.push(format!("{} ({})", payload.label, payload.id));
            continue;
        }
        if let Err(error) = verify_payload_files_against_lock(payload, &payload_root, &destination)
        {
            missing.push(format!(
                "{} ({}) copied payload integrity check failed: {}",
                payload.label, payload.id, error
            ));
        }
    }
    Ok(missing)
}

fn remove_profile_dir_once(path: &Path) -> Result<bool, String> {
    if !path.exists() {
        return Ok(false);
    }
    ensure_profile_child_for_delete(path)?;
    fs::remove_dir_all(path)
        .map_err(|error| format!("Could not remove {}: {error}", path.display()))?;
    Ok(true)
}

fn remove_profile_dir(path: &Path) -> Result<bool, String> {
    let mut last_error = None;
    for attempt in 1..=PROFILE_REPLACE_ATTEMPTS {
        match remove_profile_dir_once(path) {
            Ok(removed) => return Ok(removed),
            Err(error) => {
                last_error = Some(error);
                if attempt < PROFILE_REPLACE_ATTEMPTS {
                    thread::sleep(PROFILE_REPLACE_RETRY_DELAY);
                }
            }
        }
    }
    Err(last_error.unwrap_or_else(|| format!("Could not remove {}.", path.display())))
}

fn restore_swap_path(destination: &Path, suffix: &str) -> Result<PathBuf, String> {
    let parent = destination.parent().ok_or_else(|| {
        format!(
            "Could not resolve parent folder for restore target {}.",
            destination.display()
        )
    })?;
    let name = destination
        .file_name()
        .map(|name| name.to_string_lossy().to_string())
        .ok_or_else(|| {
            format!(
                "Could not resolve restore target name: {}",
                destination.display()
            )
        })?;
    Ok(parent.join(format!(
        ".civicsuite-restore-{suffix}-{name}-{}-{}",
        now_unix_seconds(),
        std::process::id()
    )))
}

fn rename_path_with_retries(source: &Path, destination: &Path) -> Result<(), String> {
    let mut last_error = None;
    for attempt in 1..=PROFILE_REPLACE_ATTEMPTS {
        match fs::rename(source, destination) {
            Ok(()) => return Ok(()),
            Err(error) => {
                last_error = Some(error);
                if attempt < PROFILE_REPLACE_ATTEMPTS {
                    thread::sleep(PROFILE_REPLACE_RETRY_DELAY);
                }
            }
        }
    }
    Err(format!(
        "Could not move {} to {}: {}",
        source.display(),
        destination.display(),
        last_error
            .map(|error| error.to_string())
            .unwrap_or_else(|| "unknown error".to_string())
    ))
}

fn move_children_except(
    source_dir: &Path,
    destination_dir: &Path,
    excluded_names: &[&str],
) -> Result<Vec<String>, String> {
    if !source_dir.exists() {
        return Ok(Vec::new());
    }
    fs::create_dir_all(destination_dir).map_err(|error| {
        format!(
            "Could not create restore swap folder {}: {error}",
            destination_dir.display()
        )
    })?;
    let mut moved = Vec::new();
    for entry in fs::read_dir(source_dir)
        .map_err(|error| format!("Could not inspect {}: {error}", source_dir.display()))?
    {
        let entry = entry.map_err(|error| format!("Could not inspect restore entry: {error}"))?;
        let file_name = entry.file_name();
        let name = file_name.to_string_lossy();
        if excluded_names
            .iter()
            .any(|excluded| name.eq_ignore_ascii_case(excluded))
        {
            continue;
        }
        let source = entry.path();
        let destination = destination_dir.join(&file_name);
        if destination.exists() {
            ensure_profile_child_for_delete(&destination)?;
            remove_profile_dir(&destination)?;
        }
        rename_path_with_retries(&source, &destination)?;
        moved.push(name.to_string());
    }
    Ok(moved)
}

fn replace_profile_dir_from_backup_with_options(
    source: &Path,
    destination: &Path,
    label: &str,
    options: RestoreProfileOptions,
) -> Result<Vec<String>, String> {
    if let Some(parent) = destination.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Could not create {}: {error}", parent.display()))?;
    }

    if !source.exists() {
        remove_profile_dir(destination)?;
        return Ok(Vec::new());
    }

    let stage = restore_swap_path(destination, "stage")?;
    if stage.exists() {
        remove_profile_dir(&stage)?;
    }
    copy_path_recursive_for_restore(source, &stage, options).map_err(|error| {
        let _ = remove_profile_dir(&stage);
        error
    })?;

    if options.preserve_destination_model_cache {
        let old = restore_swap_path(destination, "old")?;
        if old.exists() {
            remove_profile_dir(&old)?;
        }
        fs::create_dir_all(destination)
            .map_err(|error| format!("Could not create {}: {error}", destination.display()))?;
        ensure_profile_child_for_delete(destination)?;
        let moved_old = move_children_except(destination, &old, &["models"])?;
        if let Err(error) = move_children_except(&stage, destination, &["models"]) {
            let _ = move_children_except(&old, destination, &[]);
            let _ = remove_profile_dir(&stage);
            return Err(error);
        }
        let mut notes = Vec::new();
        if destination.join("models").exists() {
            notes.push(format!(
                "{label} restored; existing local model cache was preserved at {}.",
                destination.join("models").display()
            ));
        }
        if stage.join("models").exists() && !destination.join("models").exists() {
            notes.push(format!(
                "{label} restored; backup model cache remains pending at {} because the local model cache was preserved.",
                stage.join("models").display()
            ));
        }
        let _ = remove_profile_dir(&stage);
        if !moved_old.is_empty() || old.exists() {
            notes.push(format!(
                "{label} restored; old folder cleanup is pending at {}.",
                old.display()
            ));
        }
        return Ok(notes);
    }

    let old = restore_swap_path(destination, "old")?;
    if destination.exists() {
        ensure_profile_child_for_delete(destination)?;
        rename_path_with_retries(destination, &old)?;
    }
    if let Err(error) = rename_path_with_retries(&stage, destination) {
        if old.exists() && !destination.exists() {
            let _ = rename_path_with_retries(&old, destination);
        }
        let _ = remove_profile_dir(&stage);
        return Err(error);
    }

    let mut notes = Vec::new();
    if old.exists() {
        if options.preserve_destination_model_cache {
            let old_models = old.join("models");
            let restored_models = destination.join("models");
            if old_models.exists() && !restored_models.exists() {
                match rename_path_with_retries(&old_models, &restored_models) {
                    Ok(()) => notes.push(format!(
                        "{label} restored; existing local model cache was preserved at {}.",
                        restored_models.display()
                    )),
                    Err(error) => notes.push(format!(
                        "{label} restored; local model cache preservation is pending at {} because {error}.",
                        old_models.display()
                    )),
                }
            }
        }
        if options.preserve_destination_secrets {
            let old_secrets = old.join("secrets");
            let restored_secrets = destination.join("secrets");
            if old_secrets.exists() {
                if restored_secrets.exists() {
                    let _ = remove_profile_dir(&restored_secrets);
                }
                match rename_path_with_retries(&old_secrets, &restored_secrets) {
                    Ok(()) => notes.push(format!(
                        "{label} restored; the per-install local secret was preserved at {}.",
                        restored_secrets.display()
                    )),
                    Err(error) => notes.push(format!(
                        "{label} restored; local secret preservation is pending at {} because {error}.",
                        old_secrets.display()
                    )),
                }
            }
        }
        notes.push(format!(
            "{label} restored; old folder cleanup is pending at {}.",
            old.display()
        ));
    }

    Ok(notes)
}

fn create_backup(kind: &str) -> Result<PathBuf, String> {
    create_backup_with_options(kind, BackupOptions::default())
}

fn stop_data_writers_for_snapshot() -> Result<(), String> {
    let manifest = parse_manifest()?;
    // Do not unload the model. Stop only this install's domain/queue writers,
    // then PostgreSQL. The native profile gate excludes concurrent commands.
    let services = ["python-services", "task-queue", "postgres"].iter()
        .map(|id| service_by_id(&manifest, id)).collect::<Result<Vec<_>, _>>()?;
    stop_services(&services)?;
    wait_for_services_to_release_profile(&services);
    let state = read_state()?;
    if services.iter().any(|service| service_process_health_ok(service, &state)) {
        return Err("Data services did not stop; no consistent backup can be made.".to_string());
    }
    Ok(())
}

fn verify_cold_database() -> Result<Option<String>, String> {
    let data = postgres_data_dir();
    if !data.join("PG_VERSION").is_file() { return Ok(None); }
    if postgres_tcp_ready() || data.join("postmaster.pid").exists() {
        return Err("PostgreSQL is not stopped; refusing a live-directory backup.".to_string());
    }
    let manifest = parse_manifest()?;
    let binary = postgres_binary(service_by_id(&manifest, "postgres")?, "pg_controldata.exe")?;
    let control = command_output(Command::new(binary).arg(&data).env("LC_ALL", "C"), "Database snapshot readiness")?;
    let clean = control.lines().any(|line| line.split_once(':')
        .is_some_and(|(name, value)| name.trim() == "Database cluster state" && value.trim() == "shut down"));
    if !clean { return Err("PostgreSQL has not completed a clean shutdown; no backup certified.".to_string()); }
    Ok(Some("postgres-clean-shutdown-v1".to_string()))
}

fn create_backup_with_options(kind: &str, options: BackupOptions) -> Result<PathBuf, String> {
    // A PostgreSQL directory is a valid snapshot only after verified clean shutdown.
    // Never certify a live or crash-stopped directory just because its files copied.
    let database_consistency = verify_cold_database()?;
    let created = now_unix_seconds();
    let root = backup_root();
    fs::create_dir_all(&root)
        .map_err(|error| format!("Could not create backup folder {}: {error}", root.display()))?;
    let destination = root.join(format!(
        "civicsuite-{kind}-backup-{created}-{}",
        std::process::id()
    ));
    fs::create_dir_all(&destination).map_err(|error| {
        format!(
            "Could not create backup destination {}: {error}",
            destination.display()
        )
    })?;

    let data = data_root();
    let config = config_dir();
    let contains_data = data.exists();
    let contains_config = config.exists();
    let mut skipped_files = Vec::new();
    copy_path_recursive_for_backup_with_options(
        &data,
        &destination.join("Data"),
        "Data",
        &mut skipped_files,
        options,
    );
    copy_path_recursive_for_backup(
        &config,
        &destination.join("config"),
        "config",
        &mut skipped_files,
    );
    fs::write(
        destination.join("README.txt"),
        format!(
            "Townlight Backup\n\nThis folder is a local Townlight backup created before a lifecycle action or by Backup Now.\nRestore verification starts from backup-manifest.json in this folder.\n\nBackup folder:\n{}\nCreated at unix seconds: {created}\n",
            destination.display()
        ),
    )
    .map_err(|error| format!("Could not write backup README: {error}"))?;
    let (files, mut hash_skipped_files) = collect_backup_files_with_skips(&destination)?;
    skipped_files.append(&mut hash_skipped_files);
    skipped_files.sort_by(|left, right| {
        left.path
            .cmp(&right.path)
            .then_with(|| left.reason.cmp(&right.reason))
    });
    skipped_files.dedup();
    if database_consistency.is_some() && skipped_files.iter().any(|entry| {
        let path = entry.path.replace('\\', "/");
        !(path == "config/secrets" || path.starts_with("config/secrets/")
            || (!options.include_model_cache && (path == "Data/models" || path.starts_with("Data/models/"))))
    }) {
        return Err("Database backup is incomplete; no restore-ready manifest was written.".to_string());
    }

    let manifest = BackupManifest {
        schema_version: 1,
        kind: kind.to_string(),
        created_unix_seconds: created,
        source_root: civic_suite_root().display().to_string(),
        data_source: data.display().to_string(),
        config_source: config.display().to_string(),
        backup_root: root.display().to_string(),
        contains_data,
        contains_config,
        file_count: files.len(),
        files,
        skipped_files,
        database_consistency,
    };
    let contents = serde_json::to_string_pretty(&manifest)
        .map_err(|error| format!("Could not serialize backup manifest: {error}"))?;
    fs::write(
        destination.join("backup-manifest.json"),
        format!("{contents}\n"),
    )
    .map_err(|error| format!("Could not write backup manifest: {error}"))?;
    Ok(destination)
}

fn verified_backup_manifest(source: &Path) -> Result<BackupManifest, String> {
    let manifest_path = source.join("backup-manifest.json");
    let contents = fs::read_to_string(&manifest_path)
        .map_err(|error| format!("Could not read {}: {error}", manifest_path.display()))?;
    let manifest: BackupManifest = serde_json::from_str(&contents)
        .map_err(|error| format!("Could not parse backup manifest: {error}"))?;
    if manifest.schema_version != 1 {
        return Err(format!(
            "unsupported backup manifest schema {}",
            manifest.schema_version
        ));
    }
    if source.join("Data/postgres/PG_VERSION").is_file()
        && manifest.database_consistency.as_deref() != Some("postgres-clean-shutdown-v1") {
        return Err("This backup has no verified consistent PostgreSQL snapshot; preserve it, but do not restore it over current Records.".to_string());
    }
    let (actual_files, actual_skipped_files) = collect_backup_files_with_skips(source)?;
    if manifest.file_count != manifest.files.len() {
        return Err("backup manifest file count does not match its file list".to_string());
    }
    if manifest.file_count != actual_files.len() || manifest.files != actual_files {
        return Err("backup files do not match the recorded SHA-256 manifest".to_string());
    }
    if !actual_skipped_files
        .iter()
        .all(|entry| manifest.skipped_files.contains(entry))
    {
        return Err(
            "backup skipped-file evidence does not match the current backup folder".to_string(),
        );
    }
    Ok(manifest)
}

fn latest_backup_dir() -> Result<Option<PathBuf>, String> {
    let root = backup_root();
    if !root.is_dir() {
        return Ok(None);
    }
    let mut candidates = Vec::new();
    for entry in fs::read_dir(&root)
        .map_err(|error| format!("Could not read backup folder {}: {error}", root.display()))?
    {
        let entry = entry.map_err(|error| format!("Could not inspect backup folder: {error}"))?;
        let path = entry.path();
        if path.is_dir()
            && path.join("backup-manifest.json").is_file()
            && entry
                .file_name()
                .to_string_lossy()
                .starts_with("civicsuite-")
        {
            let manifest_path = path.join("backup-manifest.json");
            let manifest_sort_key = fs::read_to_string(&manifest_path)
                .ok()
                .and_then(|contents| serde_json::from_str::<BackupManifest>(&contents).ok())
                .and_then(|manifest| {
                    if manifest.kind == "pre-restore" {
                        None
                    } else {
                        Some(manifest.created_unix_seconds)
                    }
                });
            if let Some(created_unix_seconds) = manifest_sort_key {
                candidates.push((created_unix_seconds, entry.file_name().to_os_string(), path));
            }
        }
    }
    candidates.sort_by(|left, right| left.0.cmp(&right.0).then_with(|| left.1.cmp(&right.1)));
    Ok(candidates.pop().map(|candidate| candidate.2))
}

fn read_state() -> Result<RuntimeState, String> {
    let path = state_path();
    if !path.is_file() {
        return Ok(RuntimeState::default());
    }
    let contents = fs::read_to_string(&path)
        .map_err(|error| format!("Could not read runtime state: {error}"))?;
    serde_json::from_str(&contents)
        .map_err(|error| format!("Could not parse runtime state: {error}"))
}

fn write_state(state: &RuntimeState) -> Result<(), String> {
    fs::create_dir_all(config_dir())
        .map_err(|error| format!("Could not create runtime config folder: {error}"))?;
    crate::atomic_io::atomic_write_json(&state_path(), state)
}

fn update_service_state(
    state: &mut RuntimeState,
    service_id: &str,
    installed: bool,
    pid: Option<u32>,
    action: &str,
) {
    let now = now_unix_seconds();
    if let Some(service) = state
        .services
        .iter_mut()
        .find(|candidate| candidate.id == service_id)
    {
        service.installed = installed;
        service.pid = pid;
        service.last_action = Some(action.to_string());
        service.last_updated_unix_seconds = now;
    } else {
        state.services.push(ServiceRuntimeState {
            id: service_id.to_string(),
            installed,
            pid,
            last_action: Some(action.to_string()),
            last_updated_unix_seconds: now,
        });
    }
    state.last_action = Some(action.to_string());
    state.last_updated_unix_seconds = now;
}

fn service_state<'a>(
    state: &'a RuntimeState,
    service: &ServiceDefinition,
) -> Option<&'a ServiceRuntimeState> {
    state
        .services
        .iter()
        .find(|candidate| candidate.id == service.id)
}

fn expand_runtime_template(template: &str) -> String {
    template
        .replace("{data_dir}", &data_root().to_string_lossy())
        .replace('/', "\\")
}

fn service_binary_path(service: &ServiceDefinition) -> PathBuf {
    let binary = PathBuf::from(expand_runtime_template(&service.binary));
    if binary.is_absolute() {
        binary
    } else {
        runtime_root().join(binary)
    }
}

fn service_log_path(service: &ServiceDefinition) -> PathBuf {
    PathBuf::from(expand_runtime_template(&service.log_path))
}

fn service_arg_values(service: &ServiceDefinition) -> Vec<String> {
    service
        .args
        .iter()
        .map(|arg| expand_runtime_template(arg))
        .collect()
}

fn postgres_data_dir() -> PathBuf {
    data_root().join("postgres")
}

fn postgres_binary(service: &ServiceDefinition, file_name: &str) -> Result<PathBuf, String> {
    let Some(bin_dir) = service_binary_path(service).parent().map(Path::to_path_buf) else {
        return Err(format!(
            "Could not resolve local data store binary folder for {}.",
            service.label
        ));
    };
    Ok(bin_dir.join(file_name))
}

fn command_output(command: &mut Command, label: &str) -> Result<String, String> {
    command_output_with_timeout(command, label, SERVICE_COMMAND_TIMEOUT)
}

fn command_output_with_timeout(
    command: &mut Command,
    label: &str,
    timeout: Duration,
) -> Result<String, String> {
    let capture_id = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or(0);
    let stdout_path = env::temp_dir().join(format!(
        "civicsuite-command-{}-{capture_id}-stdout.log",
        std::process::id()
    ));
    let stderr_path = env::temp_dir().join(format!(
        "civicsuite-command-{}-{capture_id}-stderr.log",
        std::process::id()
    ));
    let stdout_file = fs::File::create(&stdout_path)
        .map_err(|error| format!("{label} stdout capture could not start: {error}"))?;
    let stderr_file = fs::File::create(&stderr_path)
        .map_err(|error| format!("{label} stderr capture could not start: {error}"))?;
    let mut child = command
        .stdout(Stdio::from(stdout_file))
        .stderr(Stdio::from(stderr_file))
        .spawn()
        .map_err(|error| {
            let _ = fs::remove_file(&stdout_path);
            let _ = fs::remove_file(&stderr_path);
            format!("{label} could not start: {error}")
        })?;
    let started = Instant::now();
    let status = loop {
        if let Some(status) = child
            .try_wait()
            .map_err(|error| format!("{label} status check failed: {error}"))?
        {
            break status;
        }
        if started.elapsed() >= timeout {
            let _ = child.kill();
            let _ = child.wait();
            let stdout = fs::read_to_string(&stdout_path).unwrap_or_default();
            let stderr = fs::read_to_string(&stderr_path).unwrap_or_default();
            let _ = fs::remove_file(&stdout_path);
            let _ = fs::remove_file(&stderr_path);
            let detail = [stdout.trim(), stderr.trim()]
                .into_iter()
                .filter(|part| !part.is_empty())
                .collect::<Vec<_>>()
                .join("; ");
            return Err(format!(
                "{label} timed out after {} seconds{}",
                timeout.as_secs(),
                if detail.is_empty() {
                    ".".to_string()
                } else {
                    format!(": {detail}")
                }
            ));
        }
        thread::sleep(Duration::from_millis(250));
    };
    let stdout = fs::read_to_string(&stdout_path).unwrap_or_default();
    let stderr = fs::read_to_string(&stderr_path).unwrap_or_default();
    let _ = fs::remove_file(&stdout_path);
    let _ = fs::remove_file(&stderr_path);
    let stdout = stdout.trim().to_string();
    let stderr = stderr.trim().to_string();
    if status.success() {
        return Ok(stdout);
    }
    let detail = [stdout.as_str(), stderr.as_str()]
        .into_iter()
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("; ");
    Err(if detail.is_empty() {
        format!("{label} failed with status {status}.")
    } else {
        format!("{label} failed with status {status}: {detail}")
    })
}

fn command_status_with_timeout(
    command: &mut Command,
    label: &str,
    timeout: Duration,
) -> Result<(), String> {
    let mut child = command
        .spawn()
        .map_err(|error| format!("{label} could not start: {error}"))?;
    let started = Instant::now();
    loop {
        if let Some(status) = child
            .try_wait()
            .map_err(|error| format!("{label} status check failed: {error}"))?
        {
            return if status.success() {
                Ok(())
            } else {
                Err(format!("{label} failed with status {status}."))
            };
        }
        if started.elapsed() >= timeout {
            let _ = child.kill();
            let _ = child.wait();
            return Err(format!(
                "{label} timed out after {} seconds.",
                timeout.as_secs()
            ));
        }
        thread::sleep(Duration::from_millis(250));
    }
}

fn ensure_postgres_initialized(
    service: &ServiceDefinition,
    allow_repair_reset: bool,
) -> Result<Option<String>, String> {
    let data_dir = postgres_data_dir();
    if data_dir.join("PG_VERSION").is_file() {
        return Ok(None);
    }
    let mut repair_note = None;
    if data_dir.exists() {
        let mut entries = fs::read_dir(&data_dir)
            .map_err(|error| format!("Could not inspect local data store folder: {error}"))?;
        if entries.next().is_some() {
            if !allow_repair_reset {
                return Err(format!(
                    "The local data store folder {} exists but is not initialized. Use Repair after backing up this profile.",
                    data_dir.display()
                ));
            }
            let old = restore_swap_path(&data_dir, "postgres-repair-old")?;
            rename_path_with_retries(&data_dir, &old)?;
            repair_note = Some(format!(
                "Moved incomplete local data store initialization to {} before repair.",
                old.display()
            ));
        }
    }
    fs::create_dir_all(&data_dir)
        .map_err(|error| format!("Could not create local data store folder: {error}"))?;
    ensure_postgres_data_dir_uncompressed(&data_dir)?;

    let _ = postgres_password()?;
    let password_file = secrets_dir().join("postgres-password.txt");

    let initdb = postgres_binary(service, "initdb.exe")?;
    if !initdb.is_file() {
        return Err(format!(
            "Local data store initializer is missing: {}",
            initdb.display()
        ));
    }
    let mut command = Command::new(&initdb);
    command
        .arg("-D")
        .arg(&data_dir)
        .arg("--username")
        .arg(LOCAL_DB_USER)
        .arg("--pwfile")
        .arg(&password_file)
        .arg("--auth-host")
        .arg("scram-sha-256")
        .arg("--auth-local")
        .arg("trust")
        .arg("--encoding")
        .arg("UTF8");
    if let Some(parent) = initdb.parent() {
        command.current_dir(parent);
    }
    command_output(&mut command, "Local data store initialization")?;

    fs::write(
        data_dir.join("postgresql.auto.conf"),
        format!(
            "# Townlight Windows local runtime\nlisten_addresses = '127.0.0.1'\nport = {LOCAL_DB_PORT}\n"
        ),
    )
    .map_err(|error| format!("Could not write local data store configuration: {error}"))?;
    Ok(repair_note)
}

fn postgres_tcp_ready() -> bool {
    tcp_health_ok("127.0.0.1", LOCAL_DB_PORT)
}

fn postgres_pid_file() -> PathBuf {
    postgres_data_dir().join("postmaster.pid")
}

fn clear_stale_postgres_pid_file() -> Result<Option<String>, String> {
    let pid_file = postgres_pid_file();
    if !pid_file.is_file() || postgres_tcp_ready() {
        return Ok(None);
    }
    let contents = fs::read_to_string(&pid_file)
        .map_err(|error| format!("Could not read {}: {error}", pid_file.display()))?;
    let pid = contents
        .lines()
        .next()
        .and_then(|line| line.trim().parse::<u32>().ok());
    if pid.map(process_running).unwrap_or(false) {
        return Ok(None);
    }
    fs::remove_file(&pid_file)
        .map_err(|error| format!("Could not remove stale {}: {error}", pid_file.display()))?;
    Ok(Some(format!(
        "Removed stale local data store PID file {} before start.",
        pid_file.display()
    )))
}

fn ensure_postgres_data_dir_uncompressed(data_dir: &Path) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        if !data_dir.exists() {
            return Ok(());
        }
        for arg in [
            data_dir.to_string_lossy().to_string(),
            format!("/S:{}", data_dir.display()),
        ] {
            let status = Command::new(system32_exe("compact.exe"))
                .arg("/U")
                .arg("/I")
                .arg("/Q")
                .arg(&arg)
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .status()
                .map_err(|error| {
                    format!(
                        "Could not clear NTFS compression from local data store {}: {error}",
                        data_dir.display()
                    )
                })?;
            if !status.success() {
                return Err(format!(
                    "Could not clear NTFS compression from local data store {}: compact exited with {status}.",
                    data_dir.display()
                ));
            }
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = data_dir;
    }
    Ok(())
}

fn recent_log_excerpt(path: &Path, max_bytes: usize) -> Option<String> {
    let bytes = fs::read(path).ok()?;
    let start = bytes.len().saturating_sub(max_bytes);
    let excerpt = String::from_utf8_lossy(&bytes[start..]).trim().to_string();
    (!excerpt.is_empty()).then_some(excerpt.replace("\r\n", " ").replace('\n', " "))
}

fn run_postgres_with_password(
    service: &ServiceDefinition,
    binary_name: &str,
    args: &[&str],
    label: &str,
) -> Result<String, String> {
    let password = postgres_password()?;
    let binary = postgres_binary(service, binary_name)?;
    if !binary.is_file() {
        return Err(format!(
            "Local data store tool is missing: {}",
            binary.display()
        ));
    }
    let mut command = Command::new(&binary);
    command.env("PGPASSWORD", password);
    for arg in args {
        command.arg(arg);
    }
    if let Some(parent) = binary.parent() {
        command.current_dir(parent);
    }
    command_output(&mut command, label)
}

fn ensure_postgres_database(service: &ServiceDefinition) -> Result<(), String> {
    let port = LOCAL_DB_PORT.to_string();
    let existing = run_postgres_with_password(
        service,
        "psql.exe",
        &[
            "-h",
            "127.0.0.1",
            "-p",
            port.as_str(),
            "-U",
            LOCAL_DB_USER,
            "-d",
            "postgres",
            "-At",
            "-c",
            "SELECT 1 FROM pg_database WHERE datname = 'civicsuite';",
        ],
        "Local data store database check",
    )?;
    if existing.trim() != "1" {
        run_postgres_with_password(
            service,
            "createdb.exe",
            &[
                "-h",
                "127.0.0.1",
                "-p",
                port.as_str(),
                "-U",
                LOCAL_DB_USER,
                LOCAL_DB_NAME,
            ],
            "Local data store database creation",
        )?;
    }
    run_postgres_with_password(
        service,
        "psql.exe",
        &[
            "-h",
            "127.0.0.1",
            "-p",
            port.as_str(),
            "-U",
            LOCAL_DB_USER,
            "-d",
            LOCAL_DB_NAME,
            "-v",
            "ON_ERROR_STOP=1",
            "-c",
            "CREATE EXTENSION IF NOT EXISTS vector;",
        ],
        "Local data store extension setup",
    )?;
    Ok(())
}

fn run_python_migrations() -> Result<(), String> {
    let python = runtime_root()
        .join("runtime")
        .join("python")
        .join("python.exe");
    if !python.is_file() {
        return Ok(());
    }
    let mut command = Command::new(python);
    for (name, value) in service_environment(&ServiceDefinition {
        id: "python-services".to_string(),
        label: "City workflow services".to_string(),
        admin_label: "Bundled CPython module services".to_string(),
        kind: "python-services".to_string(),
        required: true,
        binary: "runtime/python/python.exe".to_string(),
        args: Vec::new(),
        health: HealthDefinition::Supervisor {
            service: "python-services".to_string(),
        },
        log_path: "{data_dir}/logs/python-services.log".to_string(),
        next_action: String::new(),
    })? {
        command.env(name, value);
    }
    command.arg("-m").arg("civicsuite_runtime.migrate");
    command_output(&mut command, "City-core database migrations")?;
    Ok(())
}

fn start_postgres_service(
    service: &ServiceDefinition,
    allow_repair_reset: bool,
) -> Result<Option<String>, String> {
    let repair_note = ensure_postgres_initialized(service, allow_repair_reset)?;
    ensure_postgres_data_dir_uncompressed(&postgres_data_dir())?;
    if !postgres_tcp_ready() {
        let stale_pid_note = clear_stale_postgres_pid_file()?;
        let binary = service_binary_path(service);
        let log_path = service_log_path(service);
        if let Some(parent) = log_path.parent() {
            fs::create_dir_all(parent)
                .map_err(|error| format!("Could not create {}: {error}", parent.display()))?;
        }
        let mut command = Command::new(binary);
        command
            .args(service_arg_values(service))
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        if let Some(parent) = service_binary_path(service).parent() {
            command.current_dir(parent);
        }
        if let Err(error) = command_status_with_timeout(
            &mut command,
            "Local data store start",
            SERVICE_COMMAND_TIMEOUT,
        ) {
            let mut details = Vec::new();
            if let Some(note) = stale_pid_note {
                details.push(note);
            }
            if let Some(log) = recent_log_excerpt(&log_path, 4096) {
                details.push(format!("Recent local data store log: {log}"));
            }
            if details.is_empty() {
                return Err(error);
            }
            return Err(format!("{} {}", error, details.join(" ")));
        }
        for _ in 0..40 {
            if postgres_tcp_ready() {
                break;
            }
            thread::sleep(Duration::from_millis(500));
        }
        if !postgres_tcp_ready() {
            if let Some(log) = recent_log_excerpt(&log_path, 4096) {
                return Err(format!(
                    "Local data store did not become ready on localhost. Recent local data store log: {log}"
                ));
            }
            return Err("Local data store did not become ready on localhost.".to_string());
        }
    }
    ensure_postgres_database(service)?;
    run_python_migrations()?;
    Ok(repair_note)
}

fn service_environment(service: &ServiceDefinition) -> Result<Vec<(String, String)>, String> {
    let data = data_root();
    let db_url = local_database_url("postgresql+asyncpg")?;
    let mut env = vec![
        ("TOWNLIGHT_PROFILE_ROOT".to_string(), civic_suite_root().display().to_string()),
        (
            "CIVICSUITE_DATA_DIR".to_string(),
            data.to_string_lossy().to_string(),
        ),
        (
            "CIVICSUITE_FILE_STORAGE_DIR".to_string(),
            data.join("files").to_string_lossy().to_string(),
        ),
        ("DATABASE_URL".to_string(), db_url.to_string()),
        ("PORTAL_MODE".to_string(), "private".to_string()),
        (
            "TOWNLIGHT_PRODUCT_PROFILE".to_string(),
            "records-beta".to_string(),
        ),
        (
            "OLLAMA_BASE_URL".to_string(),
            "http://127.0.0.1:15434".to_string(),
        ),
        (
            "CIVICCLERK_OLLAMA_BASE_URL".to_string(),
            "http://127.0.0.1:15434".to_string(),
        ),
        ("CIVICCODE_AI_MODE".to_string(), "ollama".to_string()),
        (
            "CIVICCODE_OLLAMA_URL".to_string(),
            "http://127.0.0.1:15434".to_string(),
        ),
        (
            "CIVICCODE_OLLAMA_MODEL".to_string(),
            crate::model::pinned_runtime_model()?,
        ),
        (
            "LLM_MODEL".to_string(),
            crate::model::pinned_runtime_model()?,
        ),
        ("CIVICCORE_LLM_PROVIDER".to_string(), "ollama".to_string()),
    ];
    if service.kind.contains("python") || service.binary.ends_with("python.exe") {
        env.push(("PYTHONNOUSERSITE".to_string(), "1".to_string()));
        // Configure CivicAccess's durable-write guard so its persistence-write routes accept the
        // staff surface's token (pairs with the module's server-side X-CivicAccess-Write-Token).
        env.push((
            "CIVICACCESS_TRUSTED_WRITE_TOKEN".to_string(),
            civicaccess_trusted_write_token()?,
        ));
    }
    if service.id == "model-runtime" {
        env.push(("OLLAMA_HOST".to_string(), "127.0.0.1:15434".to_string()));
        env.push((
            "OLLAMA_MODELS".to_string(),
            data.join("models")
                .join("ollama")
                .to_string_lossy()
                .to_string(),
        ));
    }
    Ok(env)
}

fn health_detail(health: &HealthDefinition) -> String {
    match health {
        HealthDefinition::Tcp { host, port } => format!("tcp {host}:{port}"),
        HealthDefinition::Http { endpoint } => endpoint.to_owned(),
        HealthDefinition::Supervisor { service } => format!("supervisor service {service}"),
        HealthDefinition::Filesystem { path } => expand_runtime_template(path),
    }
}

fn tcp_health_ok(host: &str, port: u16) -> bool {
    let address = format!("{host}:{port}");
    address
        .to_socket_addrs()
        .ok()
        .and_then(|mut addresses| addresses.next())
        .and_then(|address| TcpStream::connect_timeout(&address, Duration::from_millis(500)).ok())
        .is_some()
}

fn http_health_ok(endpoint: &str) -> bool {
    http_get_response(endpoint)
        .map(|(status_code, _)| (200..300).contains(&status_code))
        .unwrap_or(false)
}

fn http_get_response(endpoint: &str) -> Option<(u16, String)> {
    let Some(rest) = endpoint.strip_prefix("http://") else {
        return None;
    };
    let (host_port, path) = rest.split_once('/').unwrap_or((rest, ""));
    let path = format!("/{path}");
    let mut stream = match TcpStream::connect_timeout(
        &host_port
            .to_socket_addrs()
            .ok()
            .and_then(|mut addresses| addresses.next())
            .unwrap_or_else(|| "127.0.0.1:0".parse().expect("fallback socket")),
        Duration::from_millis(500),
    ) {
        Ok(stream) => stream,
        Err(_) => return None,
    };
    let _ = stream.set_read_timeout(Some(Duration::from_millis(500)));
    let request = format!("GET {path} HTTP/1.1\r\nHost: {host_port}\r\nConnection: close\r\n\r\n");
    if stream.write_all(request.as_bytes()).is_err() {
        return None;
    }
    let mut response = String::new();
    if stream.read_to_string(&mut response).is_err() {
        return None;
    }
    let status_code = response
        .lines()
        .next()
        .and_then(|line| line.split_whitespace().nth(1))
        .and_then(|code| code.parse::<u16>().ok())?;
    let body = response
        .split_once("\r\n\r\n")
        .map(|(_, body)| body.to_string())
        .unwrap_or_default();
    Some((status_code, body))
}

fn process_running(pid: u32) -> bool {
    if cfg!(target_os = "windows") {
        Command::new(system32_exe("tasklist.exe"))
            .arg("/FI")
            .arg(format!("PID eq {pid}"))
            .arg("/FO")
            .arg("CSV")
            .arg("/NH")
            .output()
            .map(|output| {
                output.status.success()
                    && String::from_utf8_lossy(&output.stdout).contains(&pid.to_string())
            })
            .unwrap_or(false)
    } else {
        Command::new("kill")
            .arg("-0")
            .arg(pid.to_string())
            .status()
            .map(|status| status.success())
            .unwrap_or(false)
    }
}

fn process_ids_for_executable(_executable: &Path) -> Vec<u32> {
    #[cfg(target_os = "windows")]
    {
        let script = r#"
$target = [System.IO.Path]::GetFullPath($env:CIVICSUITE_PROCESS_LOOKUP_TARGET)
Get-CimInstance Win32_Process |
  Where-Object { $_.ExecutablePath -and ([System.IO.Path]::GetFullPath($_.ExecutablePath) -ieq $target) } |
  Select-Object -ExpandProperty ProcessId
"#;
        let mut command = Command::new(system32_exe("WindowsPowerShell\\v1.0\\powershell.exe"));
        command
            .arg("-NoProfile")
            .arg("-NonInteractive")
            .arg("-ExecutionPolicy")
            .arg("Bypass")
            .arg("-Command")
            .arg(script)
            .env("CIVICSUITE_PROCESS_LOOKUP_TARGET", _executable);
        return command_output_with_timeout(
            &mut command,
            "Windows process lookup",
            Duration::from_secs(10),
        )
        .map(|stdout| {
            stdout
                .lines()
                .filter_map(|line| line.trim().parse::<u32>().ok())
                .collect()
        })
        .unwrap_or_default();
    }
    #[cfg(not(target_os = "windows"))]
    {
        Vec::new()
    }
}

fn stop_processes_for_executable(executable: &Path) -> usize {
    let current_pid = std::process::id();
    let mut stopped = 0;
    for pid in process_ids_for_executable(executable) {
        if pid != current_pid && stop_pid(pid) {
            stopped += 1;
        }
    }
    stopped
}

fn settled_service_pid(binary: &Path, spawned_pid: u32, existing_pids: &[u32]) -> u32 {
    for _ in 0..20 {
        if process_running(spawned_pid) {
            return spawned_pid;
        }
        let mut candidates: Vec<u32> = process_ids_for_executable(binary)
            .into_iter()
            .filter(|pid| *pid != std::process::id() && !existing_pids.contains(pid))
            .collect();
        candidates.sort_unstable();
        if let Some(pid) = candidates.pop() {
            return pid;
        }
        thread::sleep(Duration::from_millis(250));
    }
    spawned_pid
}

fn probe_service_health(service: &ServiceDefinition, state: &RuntimeState) -> bool {
    match &service.health {
        HealthDefinition::Tcp { host, port } => tcp_health_ok(host, *port),
        HealthDefinition::Http { endpoint } => http_health_ok(endpoint),
        HealthDefinition::Filesystem { path } => {
            PathBuf::from(expand_runtime_template(path)).is_dir()
        }
        HealthDefinition::Supervisor {
            service: service_id,
        } => state
            .services
            .iter()
            .find(|candidate| &candidate.id == service_id)
            .and_then(|candidate| candidate.pid)
            .map(process_running)
            .unwrap_or(false),
    }
}

fn service_needs_binary(service: &ServiceDefinition) -> bool {
    service.kind != "file-storage"
}

fn service_health(service: &ServiceDefinition, state: &RuntimeState) -> RuntimeHealthItem {
    let state_entry = service_state(state, service);
    let installed = state_entry.map(|entry| entry.installed).unwrap_or(false);
    let binary_path = service_binary_path(service);
    let binary_exists = !service_needs_binary(service) || binary_path.is_file();
    let ok = probe_service_health(service, state);
    let requirement = if service.required {
        "required"
    } else {
        "optional"
    };

    let (status, message, next_action) = if ok {
        (
            "OK",
            format!("{} is ready on this Windows profile.", service.label),
            "Continue local setup.".to_string(),
        )
    } else if !binary_exists {
        (
            "Needs install",
            format!(
                "{} is missing its bundled runtime executable.",
                service.label
            ),
            "Install or repair the bundled Windows runtime.".to_string(),
        )
    } else if installed {
        (
            "Needs start",
            format!(
                "{} is installed but is not responding to its health check.",
                service.label
            ),
            "Start or repair the local service from System Health.".to_string(),
        )
    } else {
        (
            "Needs setup",
            format!(
                "{} is defined for the Windows local runtime but has not been installed yet.",
                service.label
            ),
            service.next_action.clone(),
        )
    };

    RuntimeHealthItem {
        id: service.id.clone(),
        label: service.label.clone(),
        ok,
        status,
        message,
        next_action,
        admin_detail: format!(
            "{}; {}; kind {}; binary {}; binary_present {}; args {}; health {}; log {}; pid {}",
            service.admin_label,
            requirement,
            service.kind,
            binary_path.display(),
            binary_exists,
            service_arg_values(service).join(" "),
            health_detail(&service.health),
            service_log_path(service).display(),
            state_entry
                .and_then(|entry| entry.pid)
                .map(|pid| pid.to_string())
                .unwrap_or_else(|| "none".to_string())
        ),
        actionable: true,
    }
}

fn local_folder_health(
    id: &str,
    label: &str,
    path: PathBuf,
    missing_action: &str,
    permission_action: &str,
) -> RuntimeHealthItem {
    let exists = path.is_dir();
    let write_probe = if exists {
        folder_write_probe(&path)
    } else {
        Err("folder is missing".to_string())
    };
    let ok = exists && write_probe.is_ok();
    let (status, message, next_action) = if ok {
        (
            "OK",
            format!("{label} is available and writable on this Windows profile."),
            "Continue local setup.".to_string(),
        )
    } else if exists {
        (
            "Needs access",
            format!("{label} exists, but Townlight cannot save files there."),
            permission_action.to_string(),
        )
    } else {
        (
            "Needs setup",
            format!("{label} has not been created yet."),
            missing_action.to_string(),
        )
    };
    let write_check = match &write_probe {
        Ok(()) => "ok".to_string(),
        Err(error) => error.clone(),
    };

    RuntimeHealthItem {
        id: id.to_string(),
        label: label.to_string(),
        ok,
        status,
        message,
        next_action,
        admin_detail: format!(
            "kind local-folder; path {}; exists {}; writable {}; write_check {}",
            path.display(),
            exists,
            write_probe.is_ok(),
            write_check
        ),
        actionable: false,
    }
}

fn task_queue_schema_unreachable_health(endpoint: &str) -> RuntimeHealthItem {
    RuntimeHealthItem {
        id: "task-queue-schema".to_string(),
        label: "Task queue schema".to_string(),
        ok: false,
        status: "Needs services",
        message: "City workflow services are not running yet, so Townlight cannot verify the PostgreSQL task queue schema.".to_string(),
        next_action: "Start or repair City workflow services after the local data store is installed.".to_string(),
        admin_detail: format!("kind postgres-task-queue-schema; endpoint {endpoint}; http_status none"),
        actionable: false,
    }
}

fn task_queue_schema_health_from_response(
    endpoint: &str,
    http_status: u16,
    body: &str,
) -> RuntimeHealthItem {
    let parsed = serde_json::from_str::<serde_json::Value>(body).ok();
    let database = parsed.as_ref().and_then(|value| value.get("database"));
    let ok = database
        .and_then(|value| value.get("ok"))
        .and_then(|value| value.as_bool())
        .unwrap_or(false);
    let database_status = database
        .and_then(|value| value.get("status"))
        .and_then(|value| value.as_str())
        .unwrap_or("unknown");
    let detail_message = database
        .and_then(|value| value.get("message"))
        .and_then(|value| value.as_str())
        .unwrap_or("City workflow services did not report database queue schema detail.");
    let (status, next_action) = if ok {
        ("OK", "Continue local setup.")
    } else {
        match database_status {
            "migrations-needed" => (
                "Needs migrations",
                "Run Install or Repair for City workflow services after the local data store is ready.",
            ),
            "missing" => (
                "Needs configuration",
                "Repair City workflow services so they receive the local database connection.",
            ),
            "unavailable" => (
                "Needs data store",
                "Start or repair the Local data store, then check City workflow services again.",
            ),
            _ => (
                "Needs attention",
                "Check City workflow services and repair the local runtime if the status does not clear.",
            ),
        }
    };

    RuntimeHealthItem {
        id: "task-queue-schema".to_string(),
        label: "Task queue schema".to_string(),
        ok,
        status,
        message: detail_message.to_string(),
        next_action: next_action.to_string(),
        admin_detail: format!(
            "kind postgres-task-queue-schema; endpoint {endpoint}; http_status {http_status}; database_status {database_status}"
        ),
        actionable: false,
    }
}

fn task_queue_schema_health(manifest: &RuntimeManifest) -> Option<RuntimeHealthItem> {
    let endpoint = manifest.services.iter().find_map(|service| {
        if service.id == "python-services" {
            if let HealthDefinition::Http { endpoint } = &service.health {
                return Some(endpoint.as_str());
            }
        }
        None
    })?;
    Some(
        http_get_response(endpoint)
            .map(|(status_code, body)| {
                task_queue_schema_health_from_response(endpoint, status_code, &body)
            })
            .unwrap_or_else(|| task_queue_schema_unreachable_health(endpoint)),
    )
}

fn folder_write_probe(path: &Path) -> Result<(), String> {
    let check_path = path.join(format!(
        ".civicsuite-health-check-{}-{}.tmp",
        std::process::id(),
        now_unix_seconds()
    ));
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&check_path)
        .map_err(|error| format!("could not create temporary write check: {error}"))?;
    if let Err(error) = file.write_all(b"Townlight local folder health check\n") {
        let _ = fs::remove_file(&check_path);
        return Err(format!("could not write temporary check file: {error}"));
    }
    drop(file);
    fs::remove_file(&check_path)
        .map_err(|error| format!("could not remove temporary write check: {error}"))?;
    Ok(())
}

pub fn runtime_health() -> Result<Vec<RuntimeHealthItem>, String> {
    let manifest = parse_manifest()?;
    validate_manifest(&manifest)?;
    let state = read_state()?;
    let mut health = vec![RuntimeHealthItem {
        id: "desktop-shell".to_string(),
        label: "Desktop shell".to_string(),
        ok: true,
        status: "OK",
        message: "Tauri/WebView2 shell is running locally.".to_string(),
        next_action: "Continue the Windows local setup.".to_string(),
        admin_detail: "The desktop process is active.".to_string(),
        actionable: false,
    }];
    health.push(local_folder_health(
        "local-data-folder",
        "City data folder",
        data_root(),
        "Use First Run or Repair to create the city data folder.",
        "Choose another city data folder in Settings or ask IT to grant write access.",
    ));
    health.push(local_folder_health(
        "backup-folder",
        "Backup folder",
        backup_root(),
        "Use First Run or Backup Now to create the backup folder.",
        "Choose another backup folder in Settings or ask IT to grant write access.",
    ));
    if let Some(queue_health) = task_queue_schema_health(&manifest) {
        health.push(queue_health);
    }
    health.extend(
        manifest
            .services
            .iter()
            .map(|service| service_health(service, &state)),
    );
    Ok(health)
}

fn target_services<'a>(
    manifest: &'a RuntimeManifest,
    service_id: Option<&str>,
) -> Result<Vec<&'a ServiceDefinition>, String> {
    if let Some(id) = service_id {
        return manifest
            .services
            .iter()
            .find(|service| service.id == id)
            .map(|service| vec![service])
            .ok_or_else(|| format!("Unknown supervisor service: {id}"));
    }
    Ok(manifest.services.iter().collect())
}

fn service_by_id<'a>(
    manifest: &'a RuntimeManifest,
    service_id: &str,
) -> Result<&'a ServiceDefinition, String> {
    manifest
        .services
        .iter()
        .find(|service| service.id == service_id)
        .ok_or_else(|| format!("Unknown supervisor service: {service_id}"))
}

fn target_services_with_start_dependencies<'a>(
    manifest: &'a RuntimeManifest,
    service_id: Option<&str>,
) -> Result<Vec<&'a ServiceDefinition>, String> {
    let Some(id) = service_id else {
        return Ok(manifest.services.iter().collect());
    };
    let mut services = Vec::new();
    if matches!(id, "python-services" | "task-queue") {
        services.push(service_by_id(manifest, "postgres")?);
    }
    if id == "task-queue" {
        services.push(service_by_id(manifest, "python-services")?);
    }
    services.push(service_by_id(manifest, id)?);
    services.dedup_by(|left, right| left.id == right.id);
    Ok(services)
}

fn ensure_runtime_dirs(service: &ServiceDefinition) -> Result<(), String> {
    fs::create_dir_all(data_root().join("logs"))
        .map_err(|error| format!("Could not create runtime log folder: {error}"))?;
    fs::create_dir_all(data_root().join("files"))
        .map_err(|error| format!("Could not create local document storage: {error}"))?;
    fs::create_dir_all(backup_root())
        .map_err(|error| format!("Could not create local backup folder: {error}"))?;
    if service.id == "postgres" {
        fs::create_dir_all(data_root().join("postgres"))
            .map_err(|error| format!("Could not create local database folder: {error}"))?;
    }
    if service.id == "model-runtime" {
        fs::create_dir_all(data_root().join("models").join("ollama"))
            .map_err(|error| format!("Could not create local model runtime folder: {error}"))?;
    }
    if let Some(parent) = service_log_path(service).parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Could not create {}: {error}", parent.display()))?;
    }
    Ok(())
}

fn install_or_repair(
    action: &str,
    manifest: &RuntimeManifest,
    services: &[&ServiceDefinition],
) -> Result<SupervisorActionResult, String> {
    let payload_manifest = parse_payload_manifest()?;
    validate_payload_manifest(manifest, &payload_manifest)?;
    let payloads = payloads_for_services(&payload_manifest, services);
    let missing_payloads = install_runtime_payloads(&payloads)?;
    let mut state = read_state()?;
    let mut missing_required = Vec::new();
    for service in services {
        ensure_runtime_dirs(service)?;
        let binary_exists =
            !service_needs_binary(service) || service_binary_path(service).is_file();
        if service.required && !binary_exists {
            missing_required.push(service.label.clone());
        }
        update_service_state(&mut state, &service.id, binary_exists, None, action);
    }
    write_state(&state)?;

    if missing_required.is_empty() && missing_payloads.is_empty() {
        Ok(SupervisorActionResult {
            accepted: true,
            action: action.to_string(),
            service_id: None,
            status: "Installed",
            message:
                "The bundled local runtime payloads, folders, and service state were prepared."
                    .to_string(),
            next_action: "Start the local services and run health verification.".to_string(),
        })
    } else {
        let mut details = Vec::new();
        if !missing_payloads.is_empty() {
            details.push(format!("missing payloads: {}", missing_payloads.join(", ")));
        }
        if !missing_required.is_empty() {
            details.push(format!(
                "missing service executables: {}",
                missing_required.join(", ")
            ));
        }
        Ok(SupervisorActionResult {
            accepted: false,
            action: action.to_string(),
            service_id: None,
            status: "Needs runtime files",
            message: format!(
                "Local folders were prepared, but required Windows runtime files are incomplete: {}.",
                details.join("; ")
            ),
            next_action: "Repair or install the bundled Windows runtime files, then retry."
                .to_string(),
        })
    }
}

fn repair_services(
    manifest: &RuntimeManifest,
    services: &[&ServiceDefinition],
) -> Result<SupervisorActionResult, String> {
    let install_result = install_or_repair("repair", manifest, services)?;
    if !install_result.accepted {
        return Ok(install_result);
    }
    let start_result = start_services(services, true)?;
    Ok(SupervisorActionResult {
        accepted: start_result.accepted,
        action: "repair".to_string(),
        service_id: start_result.service_id,
        status: if start_result.accepted {
            "Repaired"
        } else {
            start_result.status
        },
        message: format!(
            "{} {}",
            install_result.message.trim_end_matches('.'),
            start_result.message
        ),
        next_action: "Run Check from System Health after services finish warming up.".to_string(),
    })
}

fn start_services(
    services: &[&ServiceDefinition],
    allow_repair_reset: bool,
) -> Result<SupervisorActionResult, String> {
    let mut state = read_state()?;
    let mut started = Vec::new();
    let mut notes = Vec::new();
    for service in services {
        ensure_runtime_dirs(service)?;
        if service.id == "postgres" {
            let binary = service_binary_path(service);
            if !binary.is_file() {
                return Ok(SupervisorActionResult {
                    accepted: false,
                    action: "start".to_string(),
                    service_id: Some(service.id.clone()),
                    status: "Needs install",
                    message: format!(
                        "{} cannot start because {} is missing.",
                        service.label,
                        binary.display()
                    ),
                    next_action: "Install or repair the bundled Windows runtime files, then retry."
                        .to_string(),
                });
            }
            if let Some(note) = start_postgres_service(service, allow_repair_reset)? {
                notes.push(note);
            }
            update_service_state(&mut state, &service.id, true, None, "start");
            started.push(service.label.clone());
            continue;
        }
        if probe_service_health(service, &state) {
            let existing_pid = service_state(&state, service).and_then(|entry| entry.pid);
            update_service_state(&mut state, &service.id, true, existing_pid, "start");
            started.push(service.label.clone());
            continue;
        }
        if !service_needs_binary(service) {
            update_service_state(&mut state, &service.id, true, None, "start");
            started.push(service.label.clone());
            continue;
        }
        let binary = service_binary_path(service);
        let existing_pids = process_ids_for_executable(&binary);
        if !binary.is_file() {
            return Ok(SupervisorActionResult {
                accepted: false,
                action: "start".to_string(),
                service_id: Some(service.id.clone()),
                status: "Needs install",
                message: format!(
                    "{} cannot start because {} is missing.",
                    service.label,
                    binary.display()
                ),
                next_action: "Install or repair the bundled Windows runtime files, then retry."
                    .to_string(),
            });
        }
        let log_path = service_log_path(service);
        let log = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&log_path)
            .map_err(|error| format!("Could not open {}: {error}", log_path.display()))?;
        let mut command = Command::new(&binary);
        command
            .args(service_arg_values(service))
            .envs(service_environment(service)?)
            .stdout(Stdio::from(log.try_clone().map_err(|error| {
                format!("Could not prepare service log: {error}")
            })?))
            .stderr(Stdio::from(log));
        if let Some(parent) = binary.parent() {
            command.current_dir(parent);
        }
        let child = command
            .spawn()
            .map_err(|error| format!("Could not start {}: {error}", service.label))?;
        let pid = settled_service_pid(&binary, child.id(), &existing_pids);
        update_service_state(&mut state, &service.id, true, Some(pid), "start");
        started.push(service.label.clone());
    }
    write_state(&state)?;

    Ok(SupervisorActionResult {
        accepted: true,
        action: "start".to_string(),
        service_id: None,
        status: "Started",
        message: if notes.is_empty() {
            format!(
                "Started or verified local runtime service state for {}.",
                started.join(", ")
            )
        } else {
            format!(
                "Started or verified local runtime service state for {}. {}",
                started.join(", "),
                notes.join(" ")
            )
        },
        next_action: "Run health verification after services finish warming up.".to_string(),
    })
}

fn stop_pid(pid: u32) -> bool {
    if cfg!(target_os = "windows") {
        Command::new(system32_exe("taskkill.exe"))
            .arg("/PID")
            .arg(pid.to_string())
            .arg("/T")
            .arg("/F")
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .map(|status| status.success())
            .unwrap_or(false)
    } else {
        Command::new("kill")
            .arg(pid.to_string())
            .status()
            .map(|status| status.success())
            .unwrap_or(false)
    }
}

fn stop_services(services: &[&ServiceDefinition]) -> Result<SupervisorActionResult, String> {
    let mut state = read_state()?;
    let mut stopped = Vec::new();
    for service in services {
        if service.id == "postgres" {
            if postgres_tcp_ready() {
                let binary = service_binary_path(service);
                if binary.is_file() {
                    let _ = command_status_with_timeout(
                        Command::new(binary)
                            .arg("stop")
                            .arg("-D")
                            .arg(postgres_data_dir())
                            .arg("-m")
                            .arg("fast")
                            .arg("-w")
                            .stdout(Stdio::null())
                            .stderr(Stdio::null()),
                        "Local data store stop",
                        PROFILE_REPLACE_RETRY_DELAY * PROFILE_REPLACE_ATTEMPTS as u32,
                    );
                }
            }
            if let Ok(postgres) = postgres_binary(service, "postgres.exe") {
                let _ = stop_processes_for_executable(&postgres);
            }
            update_service_state(&mut state, &service.id, true, None, "stop");
            stopped.push(service.label.clone());
            continue;
        }
        if let Some(pid) = service_state(&state, service).and_then(|entry| entry.pid) {
            let _ = stop_pid(pid);
        }
        if service_needs_binary(service) {
            let _ = stop_processes_for_executable(&service_binary_path(service));
        }
        update_service_state(&mut state, &service.id, true, None, "stop");
        stopped.push(service.label.clone());
    }
    write_state(&state)?;
    Ok(SupervisorActionResult {
        accepted: true,
        action: "stop".to_string(),
        service_id: None,
        status: "Stopped",
        message: format!(
            "Stopped local runtime service state for {}.",
            stopped.join(", ")
        ),
        next_action: "Start services again from System Health when needed.".to_string(),
    })
}

fn service_process_health_ok(service: &ServiceDefinition, state: &RuntimeState) -> bool {
    match &service.health {
        HealthDefinition::Tcp { host, port } => tcp_health_ok(host, *port),
        HealthDefinition::Http { endpoint } => http_health_ok(endpoint),
        HealthDefinition::Supervisor { .. } => service_state(state, service)
            .and_then(|entry| entry.pid)
            .map(process_running)
            .unwrap_or(false),
        HealthDefinition::Filesystem { .. } => false,
    }
}

fn wait_for_services_to_release_profile(services: &[&ServiceDefinition]) {
    for _ in 0..PROFILE_REPLACE_ATTEMPTS {
        let state = read_state().unwrap_or_default();
        if services
            .iter()
            .all(|service| !service_process_health_ok(service, &state))
        {
            return;
        }
        thread::sleep(PROFILE_REPLACE_RETRY_DELAY);
    }
}

fn prepare_log_artifacts(services: &[&ServiceDefinition]) -> Result<PathBuf, String> {
    let logs_dir = data_root().join("logs");
    fs::create_dir_all(&logs_dir).map_err(|error| {
        format!(
            "Could not create logs folder {}: {error}",
            logs_dir.display()
        )
    })?;
    let mut service_lines = Vec::new();
    for service in services {
        ensure_runtime_dirs(service)?;
        let log_path = service_log_path(service);
        if let Some(parent) = log_path.parent() {
            fs::create_dir_all(parent)
                .map_err(|error| format!("Could not create {}: {error}", parent.display()))?;
        }
        if !log_path.is_file() {
            fs::write(
                &log_path,
                format!(
                    "{} log file prepared by Townlight System Health.\nService id: {}\n",
                    service.label, service.id
                ),
            )
            .map_err(|error| format!("Could not prepare {}: {error}", log_path.display()))?;
        }
        service_lines.push(format!(
            "- {} (`{}`): {}",
            service.label,
            service.id,
            log_path
                .file_name()
                .map(|name| name.to_string_lossy().to_string())
                .unwrap_or_else(|| log_path.display().to_string())
        ));
    }
    let readme = format!(
        "Townlight Local Logs\n\nThis folder is stored inside the selected city data folder.\nUse these files when IT or Townlight support asks for local runtime evidence.\n\nSelected service logs:\n{}\n\nCity data folder:\n{}\n",
        service_lines.join("\n"),
        data_root().display()
    );
    fs::write(logs_dir.join("README.txt"), readme)
        .map_err(|error| format!("Could not write logs README: {error}"))?;
    Ok(logs_dir)
}

fn log_action(services: &[&ServiceDefinition]) -> Result<SupervisorActionResult, String> {
    let logs_dir = prepare_log_artifacts(services)?;
    crate::local_shell::open_local_folder(&logs_dir)?;
    Ok(SupervisorActionResult {
        accepted: true,
        action: "logs".to_string(),
        service_id: services.first().map(|service| service.id.clone()),
        status: "Logs folder open",
        message: format!(
            "Prepared and opened the Townlight logs folder under the selected city data folder: {}.",
            logs_dir.display()
        ),
        next_action: "Share README.txt and the relevant service log with IT or Townlight support."
            .to_string(),
    })
}

fn create_support_bundle(services: &[&ServiceDefinition]) -> Result<PathBuf, String> {
    let created = now_unix_seconds();
    let bundle_root = support_bundle_root();
    fs::create_dir_all(&bundle_root).map_err(|error| {
        format!(
            "Could not create support bundle folder {}: {error}",
            bundle_root.display()
        )
    })?;
    let destination = bundle_root.join(format!(
        "civicsuite-support-bundle-{created}-{}",
        std::process::id()
    ));
    fs::create_dir_all(&destination).map_err(|error| {
        format!(
            "Could not create support bundle {}: {error}",
            destination.display()
        )
    })?;

    let mut bundle_notes = Vec::new();
    if let Err(error) = prepare_log_artifacts(services) {
        bundle_notes.push(format!("Could not prepare live log artifacts: {error}"));
    }
    let bundle_logs = destination.join("logs");
    fs::create_dir_all(&bundle_logs).map_err(|error| {
        format!(
            "Could not create support bundle logs folder {}: {error}",
            bundle_logs.display()
        )
    })?;
    for service in services {
        let source = service_log_path(service);
        if source.is_file() {
            match source.file_name() {
                Some(file_name) => {
                    if let Err(error) = fs::copy(&source, bundle_logs.join(file_name)) {
                        bundle_notes.push(format!(
                            "Could not copy service log {} into support bundle: {error}",
                            source.display()
                        ));
                    }
                }
                None => {
                    bundle_notes.push(format!("Could not name service log {}", source.display()))
                }
            }
        }
    }

    let health = match runtime_health() {
        Ok(health) => serde_json::to_value(health)
            .map_err(|error| format!("Could not serialize health summary: {error}"))?,
        Err(error) => {
            bundle_notes.push(format!("Could not collect runtime health: {error}"));
            serde_json::json!({ "error": error })
        }
    };
    fs::write(
        destination.join("health-summary.json"),
        format!(
            "{}\n",
            serde_json::to_string_pretty(&health)
                .map_err(|error| format!("Could not serialize health summary: {error}"))?
        ),
    )
    .map_err(|error| format!("Could not write support bundle health summary: {error}"))?;

    let runtime_state = match read_state() {
        Ok(state) => serde_json::to_value(state)
            .map_err(|error| format!("Could not serialize runtime state: {error}"))?,
        Err(error) => {
            bundle_notes.push(format!("Could not collect runtime state: {error}"));
            serde_json::json!({ "error": error })
        }
    };
    fs::write(
        destination.join("runtime-state.json"),
        format!(
            "{}\n",
            serde_json::to_string_pretty(&runtime_state)
                .map_err(|error| format!("Could not serialize runtime state: {error}"))?
        ),
    )
    .map_err(|error| format!("Could not write support bundle runtime state: {error}"))?;

    let selected_services = services
        .iter()
        .map(|service| format!("{} ({})", service.label, service.id))
        .collect::<Vec<_>>();
    let readme = format!(
        "Townlight Support Bundle\n\nThis local package contains health, runtime-state, and selected service logs for Townlight support or local IT.\nIt does not copy city records, uploaded documents, backup contents, or local secrets.\n\nSelected services:\n{}\n\nCity data folder:\n{}\nBackup folder:\n{}\n\nShare this support bundle folder only with trusted Townlight support or city IT.\n",
        selected_services.join("\n"),
        data_root().display(),
        backup_root().display()
    );
    fs::write(destination.join("README.txt"), readme)
        .map_err(|error| format!("Could not write support bundle README: {error}"))?;
    if !bundle_notes.is_empty() {
        fs::write(
            destination.join("collection-notes.txt"),
            format!("{}\n", bundle_notes.join("\n")),
        )
        .map_err(|error| format!("Could not write support bundle collection notes: {error}"))?;
    }

    let (files, skipped_files) = collect_backup_files_with_skips(&destination)?;
    let manifest = SupportBundleManifest {
        schema_version: 1,
        kind: "support-bundle".to_string(),
        created_unix_seconds: created,
        source_root: civic_suite_root().display().to_string(),
        data_source: data_root().display().to_string(),
        backup_root: backup_root().display().to_string(),
        selected_services: services.iter().map(|service| service.id.clone()).collect(),
        file_count: files.len(),
        files,
        skipped_files,
    };
    fs::write(
        destination.join("support-manifest.json"),
        format!(
            "{}\n",
            serde_json::to_string_pretty(&manifest)
                .map_err(|error| format!("Could not serialize support manifest: {error}"))?
        ),
    )
    .map_err(|error| format!("Could not write support bundle manifest: {error}"))?;

    Ok(destination)
}

fn support_bundle_action(
    services: &[&ServiceDefinition],
) -> Result<SupervisorActionResult, String> {
    let bundle = create_support_bundle(services)?;
    let open_result = crate::local_shell::open_local_folder(&bundle);
    let open_note = open_result
        .err()
        .map(|error| format!(" Folder open was skipped or blocked: {error}"))
        .unwrap_or_default();
    Ok(SupervisorActionResult {
        accepted: true,
        action: "support-bundle".to_string(),
        service_id: if services.len() == 1 {
            services.first().map(|service| service.id.clone())
        } else {
            None
        },
        status: "Support bundle ready",
        message: format!(
            "Created a Townlight support bundle with health, runtime-state, selected service logs, and support-manifest.json at {}.{}",
            bundle.display(),
            open_note
        ),
        next_action: format!(
            "Verify {} exists, then share README.txt and support-manifest.json only with trusted Townlight support or city IT.",
            bundle.join("support-manifest.json").display()
        )
            .to_string(),
    })
}

fn health_action(service_id: Option<&str>) -> Result<SupervisorActionResult, String> {
    let health = runtime_health()?;
    let relevant: Vec<&RuntimeHealthItem> = health
        .iter()
        .filter(|item| item.id != "desktop-shell")
        .filter(|item| service_id.map(|id| item.id == id).unwrap_or(true))
        .collect();
    let ok = relevant.iter().all(|item| item.ok);
    Ok(SupervisorActionResult {
        accepted: ok,
        action: "health".to_string(),
        service_id: service_id.map(str::to_string),
        status: if ok { "Ready" } else { "Needs attention" },
        message: if ok {
            "Selected local runtime services passed health checks.".to_string()
        } else {
            "One or more selected local runtime services are not healthy yet.".to_string()
        },
        next_action: if ok {
            "Continue first-run health verification.".to_string()
        } else {
            "Install, start, or repair the local runtime services, then run health again."
                .to_string()
        },
    })
}

fn wait_for_services_health(services: &[&ServiceDefinition]) -> Result<(), String> {
    for _ in 0..40 {
        let state = read_state()?;
        if services
            .iter()
            .filter(|service| service.required)
            .all(|service| probe_service_health(service, &state))
        {
            return Ok(());
        }
        thread::sleep(Duration::from_millis(500));
    }
    Ok(())
}

fn services_have_startable_runtime(services: &[&ServiceDefinition]) -> bool {
    services
        .iter()
        .all(|service| !service_needs_binary(service) || service_binary_path(service).is_file())
}

fn rewrite_service_state_after_restore(services: &[&ServiceDefinition]) -> Result<(), String> {
    let mut state = read_state().unwrap_or_default();
    for service in services {
        let installed = !service_needs_binary(service) || service_binary_path(service).is_file();
        update_service_state(&mut state, &service.id, installed, None, "restore");
    }
    write_state(&state)
}

pub(crate) fn bootstrap_required_runtime() -> Result<SupervisorActionResult, String> {
    let manifest = parse_manifest()?;
    validate_manifest(&manifest)?;
    let services = target_services(&manifest, None)?;

    let install = install_or_repair("install", &manifest, &services)?;
    if !install.accepted {
        return Ok(SupervisorActionResult {
            accepted: false,
            action: "bootstrap".to_string(),
            service_id: None,
            status: install.status,
            message: format!(
                "Townlight could not prepare the required local runtime files. {}",
                install.message
            ),
            next_action: install.next_action,
        });
    }

    let start = start_services(&services, true)?;
    if !start.accepted {
        return Ok(SupervisorActionResult {
            accepted: false,
            action: "bootstrap".to_string(),
            service_id: start.service_id,
            status: start.status,
            message: format!(
                "Townlight prepared the runtime files, but a required service did not start. {}",
                start.message
            ),
            next_action: start.next_action,
        });
    }

    wait_for_services_health(&services)?;
    let health = health_action(None)?;
    if !health.accepted {
        return Ok(SupervisorActionResult {
            accepted: false,
            action: "bootstrap".to_string(),
            service_id: None,
            status: health.status,
            message: format!(
                "Townlight started local services, but health verification is not complete. {}",
                health.message
            ),
            next_action: health.next_action,
        });
    }

    Ok(SupervisorActionResult {
        accepted: true,
        action: "bootstrap".to_string(),
        service_id: None,
        status: "Ready",
        message: "Townlight prepared, started, and verified the required local runtime services."
            .to_string(),
        next_action: "Finish first-run setup and begin local city work.".to_string(),
    })
}

fn backup_action() -> Result<SupervisorActionResult, String> {
    stop_data_writers_for_snapshot()?;
    let destination = create_backup("manual")?;
    Ok(SupervisorActionResult {
        accepted: true,
        action: "backup".to_string(),
        service_id: None,
        status: "Backup complete",
        message: format!(
            "Townlight local data and configuration were backed up to {}; manifest: {}.",
            destination.display(),
            destination.join("backup-manifest.json").display()
        ),
        next_action: format!(
            "Local data services remain stopped. Use Start to resume; keep {} for recovery.",
            destination.join("backup-manifest.json").display()
        )
            .to_string(),
    })
}

fn activate_records_action() -> Result<SupervisorActionResult, String> {
    crate::auth::require_admin_session()?;
    let _writer = crate::workflows::migration_write_fence()?;
    let manifest = parse_manifest()?;
    stop_data_writers_for_snapshot()?;
    let mut journal = if let Some(journal) = crate::records_authority::read()? {
        journal
    } else {
        crate::workflows::initialize_empty_migration_source()?;
        let (_, hash) = sha256_file(&data_root().join("workflows/city-work.json"))?;
        let journal = crate::records_authority::Journal {
            schema_version: 1, phase: "importing".to_string(), source_sha256: hash, backup_path: String::new(),
        };
        crate::records_authority::write(&journal)?;
        journal
    };
    if journal.backup_path.is_empty() {
        let backup = create_backup("pre-records-migration")?;
        verified_backup_manifest(&backup)?;
        journal.backup_path = backup.join("Data/workflows/city-work.json").display().to_string();
        crate::records_authority::write(&journal)?;
    }
    start_postgres_service(service_by_id(&manifest, "postgres")?, false)?;
    let python = service_by_id(&manifest, "python-services")?;
    let mut command = Command::new(service_binary_path(python));
    command.args(["-m", "civicsuite_runtime.records_cutover"]);
    for (name, value) in service_environment(python)? { command.env(name, value); }
    command.env("TOWNLIGHT_MIGRATION_PROOF", crate::auth::domain_session_proof()?);
    command_output(&mut command, "Records migration")?;
    if crate::records_authority::read()?.is_none_or(|receipt| receipt.phase != "active") {
        return Err("Records migration has no active receipt; no legacy fallback is permitted.".to_string());
    }
    start_services(&target_services_with_start_dependencies(&manifest, Some("python-services"))?, false)?;
    Ok(SupervisorActionResult { accepted:true, action:"activate-records".to_string(), service_id:None,
        status:"Records migration complete", message:"Records now uses Python and PostgreSQL. Historical JSON and its verified backup are retained, not used as a fallback.".to_string(),
        next_action:"Refresh Records and verify the saved work. Meetings and Code remain unavailable in this candidate.".to_string() })
}

fn load_records_demo_action() -> Result<SupervisorActionResult, String> {
    crate::auth::require_admin_session()?;
    if crate::records_authority::read()?.is_none_or(|journal| journal.phase != "active") {
        return Err("Finish Records migration before loading its demonstration.".to_string());
    }
    stop_data_writers_for_snapshot()?;
    let backup = create_backup("pre-demo")?;
    verified_backup_manifest(&backup)?;
    let manifest = parse_manifest()?;
    start_postgres_service(service_by_id(&manifest, "postgres")?, false)?;
    let python = service_by_id(&manifest, "python-services")?;
    let mut command = Command::new(service_binary_path(python));
    command.args(["-m", "civicsuite_runtime.records_demo"]);
    for (name, value) in service_environment(python)? { command.env(name, value); }
    command.env("TOWNLIGHT_MIGRATION_PROOF", crate::auth::domain_session_proof()?);
    let loaded = command_output(&mut command, "Canonical Records demo");
    // A rejected load must not strand an otherwise valid profile with no service.
    start_services(&target_services_with_start_dependencies(&manifest, Some("python-services"))?, false)?;
    loaded?;
    Ok(SupervisorActionResult { accepted:true, action:"load-records-demo".to_string(), service_id:None,
        status:"Demo ready", message:"The canonical synthetic demo is loaded; repeat loading does not duplicate or overwrite work.".to_string(),
        next_action:"Review the visibly marked Records demonstration.".to_string() })
}

fn open_backup_folder_action() -> Result<SupervisorActionResult, String> {
    let path = backup_root();
    crate::local_shell::open_local_folder(&path)?;
    Ok(SupervisorActionResult {
        accepted: true,
        action: "open-backup-folder".to_string(),
        service_id: None,
        status: "Backup folder open",
        message: format!("Opened the Townlight backup folder: {}.", path.display()),
        next_action: "Use Backup Now before restore, reinstall, or uninstall work.".to_string(),
    })
}

fn restore_action(services: &[&ServiceDefinition]) -> Result<SupervisorActionResult, String> {
    let Some(source) = latest_backup_dir()? else {
        return Ok(SupervisorActionResult {
            accepted: false,
            action: "restore".to_string(),
            service_id: None,
            status: "No backup found",
            message: format!(
                "No Townlight backup manifest was found under {}.",
                backup_root().display()
            ),
            next_action: "Create a backup before using restore on this Windows profile."
                .to_string(),
        });
    };
    let manifest = match verified_backup_manifest(&source) {
        Ok(manifest) => manifest,
        Err(error) => {
            return Ok(SupervisorActionResult {
                accepted: false,
                action: "restore".to_string(),
                service_id: None,
                status: "Backup verification failed",
                message: format!(
                    "Townlight did not restore from {} because backup verification failed: {error}.",
                    source.display()
                ),
                next_action: "Use another backup or create a fresh verified backup before retrying restore."
                    .to_string(),
            });
        }
    };
    if !manifest.contains_data && !manifest.contains_config {
        return Ok(SupervisorActionResult {
            accepted: false,
            action: "restore".to_string(),
            service_id: None,
            status: "Backup has no data",
            message: format!(
                "Townlight did not restore from {} because that backup contains no local data or setup/config files.",
                source.display()
            ),
            next_action:
                "Choose a backup that contains city data or setup/config before retrying restore."
                    .to_string(),
        });
    }
    stop_data_writers_for_snapshot()?;
    let safety_backup = create_backup_with_options(
        "pre-restore",
        BackupOptions {
            include_model_cache: false,
        },
    )?;
    let _ = stop_services(services)?;
    wait_for_services_to_release_profile(services);
    let mut cleanup_notes = Vec::new();
    cleanup_notes.extend(replace_profile_dir_from_backup_with_options(
        &source.join("Data"),
        &data_root(),
        "City data",
        RestoreProfileOptions {
            skip_source_model_cache: true,
            preserve_destination_model_cache: true,
            ..RestoreProfileOptions::default()
        },
    )?);
    cleanup_notes.extend(replace_profile_dir_from_backup_with_options(
        &source.join("config"),
        &config_dir(),
        "Setup/config",
        RestoreProfileOptions {
            // The per-install secret (local DB password) is never carried in a
            // backup and is preserved from the live install across restore, so
            // the restored database keeps authenticating.
            skip_source_secrets: true,
            preserve_destination_secrets: true,
            ..RestoreProfileOptions::default()
        },
    )?);
    rewrite_service_state_after_restore(services)?;
    let cleanup_message = if cleanup_notes.is_empty() {
        String::new()
    } else {
        format!(" {}", cleanup_notes.join(" "))
    };
    let restored_message = format!(
        "Restored Townlight local data from {}. A pre-restore safety backup was saved to {}.{}",
        source.display(),
        safety_backup.display(),
        cleanup_message
    );
    if !services_have_startable_runtime(services) {
        return Ok(SupervisorActionResult {
            accepted: true,
            action: "restore".to_string(),
            service_id: None,
            status: "Restore complete",
            message: restored_message,
            next_action:
                "Repair or install the bundled Windows runtime files, then start local services."
                    .to_string(),
        });
    }
    Ok(SupervisorActionResult {
        accepted: false,
        action: "restore".to_string(),
        service_id: None,
        status: "Restore needs service start",
        message: format!(
            "{restored_message} Local services were left stopped so Start can verify database, migration, and service health against the restored profile."
        ),
        next_action:
            "Use Start, then Check from System Health. If services still do not respond, use Repair and Start again."
                .to_string(),
    })
}

fn uninstall_action(services: &[&ServiceDefinition]) -> Result<SupervisorActionResult, String> {
    stop_data_writers_for_snapshot()?;
    let final_backup = create_backup("final-uninstall")?;
    let _ = stop_services(services)?;
    let removed_data = remove_profile_dir(&data_root())?;
    let removed_config = remove_profile_dir(&config_dir())?;
    Ok(SupervisorActionResult {
        accepted: true,
        action: "uninstall".to_string(),
        service_id: None,
        status: "Local profile removed",
        message: format!(
            "Stopped local services, saved a final backup to {}, removed data: {}, removed setup/config: {}.",
            final_backup.display(),
            removed_data,
            removed_config
        ),
        next_action: "Choose Open Windows Uninstall, find Townlight in Installed apps, and uninstall it. Reinstall can restore from the final backup.".to_string(),
    })
}

fn open_windows_uninstall_action() -> Result<SupervisorActionResult, String> {
    crate::local_shell::open_windows_uninstall_settings()?;
    Ok(SupervisorActionResult {
        accepted: true,
        action: "open-windows-uninstall".to_string(),
        service_id: None,
        status: "Windows uninstall opened",
        message: "Opened Windows Installed apps so Townlight program files can be removed through the normal Windows uninstall entry.".to_string(),
        next_action: "Find Townlight in Installed apps and choose Uninstall. Keep the final-uninstall backup if staff may reinstall later.".to_string(),
    })
}

pub fn supervisor_action(
    action: &str,
    service_id: Option<&str>,
) -> Result<SupervisorActionResult, String> {
    let _lifecycle = if matches!(action, "install" | "repair" | "start" | "stop" | "backup" | "restore" | "uninstall" | "activate-records" | "load-records-demo") {
        Some(crate::profile_gate::lifecycle()?)
    } else { None };
    let manifest = parse_manifest()?;
    validate_manifest(&manifest)?;
    if !manifest
        .lifecycle_actions
        .iter()
        .any(|candidate| candidate == action)
    {
        return Err(format!("Unsupported supervisor action: {action}"));
    }

    match action {
        "install" => {
            let services = target_services(&manifest, service_id)?;
            install_or_repair(action, &manifest, &services)
        }
        "repair" => {
            let services = target_services_with_start_dependencies(&manifest, service_id)?;
            repair_services(&manifest, &services)
        }
        "start" => {
            let services = target_services_with_start_dependencies(&manifest, service_id)?;
            start_services(&services, false)
        }
        "stop" => {
            let services = target_services(&manifest, service_id)?;
            stop_services(&services)
        }
        "health" => health_action(service_id),
        "logs" => {
            let services = target_services(&manifest, service_id)?;
            log_action(&services)
        }
        "support-bundle" => {
            let services = target_services(&manifest, service_id)?;
            support_bundle_action(&services)
        }
        "backup" => backup_action(),
        "activate-records" => activate_records_action(),
        "load-records-demo" => load_records_demo_action(),
        "open-backup-folder" => open_backup_folder_action(),
        "restore" => {
            let services = target_services(&manifest, service_id)?;
            restore_action(&services)
        }
        "uninstall" => {
            let services = target_services(&manifest, service_id)?;
            uninstall_action(&services)
        }
        "open-windows-uninstall" => open_windows_uninstall_action(),
        _ => Err(format!("Unsupported supervisor action: {action}")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    #[ignore = "Requires explicit disposable stopped database and cached PostgreSQL payload"]
    fn records_cold_backup_restores_real_database_and_files() {
        let source = PathBuf::from(env::var("TOWNLIGHT_TEST_COLD_DATABASE").expect("disposable database"));
        let payload = PathBuf::from(env::var("TOWNLIGHT_TEST_POSTGRES_PAYLOAD").expect("cached PostgreSQL"));
        assert!(!source.join("postmaster.pid").exists(), "source must be stopped");
        assert!(std::net::TcpListener::bind(("127.0.0.1", 25433)).is_ok(), "test port is occupied");
        with_temp_state_dir(|root| {
            copy_path_recursive(&source, &postgres_data_dir()).expect("copy disposable database");
            let installed = root.join("Runtime/runtime/postgres");
            copy_path_recursive(&payload, &installed).expect("copy cached runtime");
            let ctl = installed.join("bin/pg_ctl.exe");
            let psql = installed.join("bin/psql.exe");
            let database = postgres_data_dir();
            struct StopOnExit(PathBuf, PathBuf);
            impl Drop for StopOnExit {
                fn drop(&mut self) {
                    let _ = Command::new(&self.0).args(["stop", "-m", "fast", "-w", "-D"])
                        .arg(&self.1).stdout(Stdio::null()).stderr(Stdio::null()).status();
                }
            }
            let _cleanup = StopOnExit(ctl.clone(), database.clone());
            let start = || command_output(Command::new(&ctl).args(["start", "-w", "-D"])
                .arg(&database).arg("-l").arg(root.join("test-postgres.log"))
                .args(["-o", "-p 25433 -h 127.0.0.1 -c shared_buffers=128MB -c max_connections=20"]), "test database start").unwrap();
            let stop = || command_output(Command::new(&ctl).args(["stop", "-m", "fast", "-w", "-D"])
                .arg(&database), "test database stop").unwrap();
            let sql = |query: &str| command_output(Command::new(&psql)
                .args(["-h", "127.0.0.1", "-p", "25433", "-U", "townlight_convergence", "-d", "civicrecords", "-At", "-v", "ON_ERROR_STOP=1", "-c", query]), "test SQL").unwrap();
            start();
            sql("CREATE TABLE records_recovery_proof (content text NOT NULL); INSERT INTO records_recovery_proof VALUES ('before-backup')");
            assert!(create_backup("must-refuse-live").is_err());
            stop();
            let file = data_root().join("files/records/proof.txt");
            fs::create_dir_all(file.parent().unwrap()).unwrap();
            fs::write(&file, "before-backup").unwrap();
            let backup = create_backup("manual").expect("cold backup");
            assert_eq!(verified_backup_manifest(&backup).unwrap().database_consistency.as_deref(), Some("postgres-clean-shutdown-v1"));
            start();
            sql("UPDATE records_recovery_proof SET content='newer-work'");
            stop();
            fs::write(&file, "newer-work").unwrap();
            let restored = restore_action(&[]).expect("restore with safety backup");
            assert_eq!(restored.status, "Restore needs service start", "{}", restored.message);
            assert!(restored.message.starts_with("Restored Townlight local data"));
            assert_eq!(fs::read_to_string(&file).unwrap(), "before-backup");
            start();
            assert_eq!(sql("SELECT content FROM records_recovery_proof").trim(), "before-backup");
            stop();
            let safety = fs::read_dir(backup_root()).unwrap().flatten().map(|entry| entry.path())
                .find(|path| path.file_name().unwrap().to_string_lossy().contains("pre-restore")).unwrap();
            assert_eq!(fs::read_to_string(safety.join("Data/files/records/proof.txt")).unwrap(), "newer-work");
            verified_backup_manifest(&safety).expect("newer-work safety backup retained");
        });
    }

    #[cfg(windows)]
    #[test]
    fn system32_exe_resolves_absolute_path_under_system_root() {
        let resolved = system32_exe("tasklist.exe");
        assert!(
            resolved.is_absolute(),
            "expected absolute path: {resolved:?}"
        );
        let system_root = env::var("SystemRoot").unwrap_or_else(|_| "C:\\Windows".to_string());
        assert!(
            resolved.starts_with(&system_root),
            "expected {resolved:?} under {system_root}"
        );
        assert!(
            resolved.ends_with("System32\\tasklist.exe"),
            "got {resolved:?}"
        );
    }

    fn with_temp_state_dir<T>(test: impl FnOnce(PathBuf) -> T) -> T {
        let _guard = crate::first_run::test_env_lock()
            .lock()
            .expect("test env lock");
        let root = env::temp_dir().join(format!(
            "civicsuite-desktop-supervisor-test-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&root);
        env::set_var("CIVICSUITE_DESKTOP_STATE_DIR", &root);
        env::set_var("CIVICSUITE_RUNTIME_ROOT", root.join("Runtime"));
        env::set_var("CIVICSUITE_RUNTIME_PAYLOAD_DIR", root.join("Payload"));
        env::set_var("CIVICSUITE_BACKUP_DIR", root.join("Backups"));
        let result = test(root.clone());
        env::remove_var("CIVICSUITE_DESKTOP_STATE_DIR");
        env::remove_var("CIVICSUITE_RUNTIME_ROOT");
        env::remove_var("CIVICSUITE_RUNTIME_PAYLOAD_DIR");
        env::remove_var("CIVICSUITE_BACKUP_DIR");
        let _ = fs::remove_dir_all(root);
        result
    }

    fn write_test_payload_lock(
        payload_root: &Path,
        payload_id: &str,
        label: &str,
        source_dir: &str,
        required_files: &[&str],
    ) {
        let source_root = payload_root.join(source_dir);
        let files = required_files
            .iter()
            .map(|required_file| {
                let path = source_root.join(required_file.replace('/', "\\"));
                let (size_bytes, sha256) = sha256_file(&path).expect("test payload hash");
                serde_json::json!({
                    "path": required_file,
                    "size_bytes": size_bytes,
                    "sha256": sha256
                })
            })
            .collect::<Vec<_>>();
        let lock = serde_json::json!({
            "schema_version": 1,
            "profile": "windows-local-1.0",
            "generated_at": "test",
            "payload_root": payload_root.to_string_lossy(),
            "payloads": [
                {
                    "id": payload_id,
                    "label": label,
                    "source_dir": source_dir,
                    "status": "present",
                    "required_files": files
                }
            ]
        });
        fs::write(
            payload_root.join("runtime-payload-lock.json"),
            serde_json::to_string_pretty(&lock).expect("lock serializes"),
        )
        .expect("lock writes");
    }

    fn write_test_postgres_payload(payload_root: &Path) {
        for file in [
            "bin/pg_ctl.exe",
            "bin/initdb.exe",
            "bin/postgres.exe",
            "bin/zlib1.dll",
            "bin/vcruntime140.dll",
            "bin/vcruntime140_1.dll",
            "bin/msvcp140.dll",
            "share/extension/vector.control",
            "lib/vector.dll",
        ] {
            let path = payload_root.join("postgres").join(file.replace('/', "\\"));
            fs::create_dir_all(path.parent().expect("payload parent")).expect("payload dir");
            fs::write(path, "fake runtime file").expect("payload file");
        }
        write_test_payload_lock(
            payload_root,
            "postgres-17-pgvector",
            "Portable PostgreSQL 17 with pgvector",
            "postgres",
            &[
                "bin/pg_ctl.exe",
                "bin/initdb.exe",
                "bin/postgres.exe",
                "bin/zlib1.dll",
                "bin/vcruntime140.dll",
                "bin/vcruntime140_1.dll",
                "bin/msvcp140.dll",
                "share/extension/vector.control",
                "lib/vector.dll",
            ],
        );
    }

    fn with_temp_state_dir_and_payload<T>(
        payload_dir: PathBuf,
        test: impl FnOnce(PathBuf) -> T,
    ) -> T {
        let _guard = crate::first_run::test_env_lock()
            .lock()
            .expect("test env lock");
        let root = env::temp_dir().join(format!(
            "civicsuite-desktop-supervisor-real-test-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&root);
        // Restore each var's PRIOR value on exit instead of blindly removing:
        // CIVICSUITE_RUNTIME_PAYLOAD_DIR is supplied by the CI step env, and
        // the first gated test's cleanup used to delete it out from under the
        // second gated test in the same process (the helper predates running
        // more than one payload test per invocation).
        let prior: Vec<(&str, Option<std::ffi::OsString>)> = [
            "CIVICSUITE_DESKTOP_STATE_DIR",
            "CIVICSUITE_RUNTIME_ROOT",
            "CIVICSUITE_RUNTIME_PAYLOAD_DIR",
            "CIVICSUITE_BACKUP_DIR",
        ]
        .iter()
        .map(|name| (*name, env::var_os(name)))
        .collect();
        env::set_var("CIVICSUITE_DESKTOP_STATE_DIR", &root);
        env::set_var("CIVICSUITE_RUNTIME_ROOT", root.join("Runtime"));
        env::set_var("CIVICSUITE_RUNTIME_PAYLOAD_DIR", &payload_dir);
        env::set_var("CIVICSUITE_BACKUP_DIR", root.join("Backups"));
        let result = test(root.clone());
        for (name, value) in prior {
            match value {
                Some(value) => env::set_var(name, value),
                None => env::remove_var(name),
            }
        }
        remove_payload_runtime_links(&root);
        let _ = fs::remove_dir_all(root);
        result
    }

    #[cfg(windows)]
    fn link_payload_runtime(root: &Path, payload_dir: &Path) {
        link_payload_runtime_set(root, payload_dir, &["postgres", "python"]);
    }

    #[cfg(windows)]
    fn link_payload_runtime_set(root: &Path, payload_dir: &Path, payloads: &[&str]) {
        let runtime_dir = root.join("Runtime").join("runtime");
        fs::create_dir_all(&runtime_dir).expect("runtime dir");
        for payload in payloads {
            let source = payload_dir.join(payload);
            assert!(
                source.is_dir(),
                "payload source exists: {}",
                source.display()
            );
            let destination = runtime_dir.join(payload);
            let _ = fs::remove_dir(&destination);
            if let Err(symlink_error) = std::os::windows::fs::symlink_dir(&source, &destination) {
                let status = Command::new("cmd")
                    .arg("/C")
                    .arg("mklink")
                    .arg("/J")
                    .arg(&destination)
                    .arg(&source)
                    .status()
                    .expect("junction fallback starts");
                assert!(
                    status.success(),
                    "payload link failed for {}: symlink error {}; junction status {}",
                    payload,
                    symlink_error,
                    status
                );
            }
        }
    }

    fn remove_payload_runtime_links(root: &Path) {
        let runtime_dir = root.join("Runtime").join("runtime");
        for payload in ["postgres", "python", "ollama"] {
            let _ = fs::remove_dir(runtime_dir.join(payload));
        }
    }

    #[test]
    fn manifest_declares_no_developer_tooling_on_operator_path() {
        let manifest = parse_manifest().expect("manifest parses");
        validate_manifest(&manifest).expect("manifest validates");
        assert!(!manifest.operator_path.requires_docker);
        assert!(!manifest.operator_path.requires_wsl);
        assert!(!manifest.operator_path.requires_terminal);
    }

    #[test]
    fn manifest_actions_cover_required_lifecycle() {
        let manifest = parse_manifest().expect("manifest parses");
        for action in REQUIRED_ACTIONS {
            assert!(manifest
                .lifecycle_actions
                .iter()
                .any(|candidate| candidate == action));
        }
    }

    #[test]
    fn task_queue_schema_health_reports_runtime_database_detail() {
        let ready = task_queue_schema_health_from_response(
            "http://127.0.0.1:15480/health",
            200,
            r#"{"database":{"ok":true,"status":"ready","message":"Local database and task queue schema are ready."}}"#,
        );
        assert!(ready.ok);
        assert_eq!(ready.status, "OK");
        assert!(ready.message.contains("task queue schema are ready"));
        assert!(!ready.actionable);

        let needs_migrations = task_queue_schema_health_from_response(
            "http://127.0.0.1:15480/health",
            503,
            r#"{"database":{"ok":false,"status":"migrations-needed","message":"Local database is reachable but task queue migrations are not applied."}}"#,
        );
        assert!(!needs_migrations.ok);
        assert_eq!(needs_migrations.status, "Needs migrations");
        assert!(needs_migrations
            .next_action
            .contains("Run Install or Repair"));
    }

    #[test]
    fn command_output_times_out_instead_of_hanging() {
        // Use a lightweight hang that needs no managed runtime. powershell.exe
        // intermittently fails to load its CLR under heavy parallel CI load
        // (error 8009001d), unrelated to the timeout logic under test; ping waits
        // ~5s using only a native System32 binary. 1s timeout << the 5s hang.
        // Retry kept as belt-and-suspenders against any transient spawn error.
        let mut last_error = String::new();
        for _ in 0..5 {
            let mut command = if cfg!(target_os = "windows") {
                let mut command = Command::new("ping");
                command.arg("-n").arg("6").arg("127.0.0.1");
                command
            } else {
                let mut command = Command::new("sh");
                command.arg("-c").arg("sleep 5; echo late");
                command
            };

            match command_output_with_timeout(
                &mut command,
                "Hanging post-restore runtime command",
                Duration::from_secs(1),
            ) {
                Ok(output) => {
                    panic!("hanging command should time out, got Ok: {output}")
                }
                Err(error) if error.contains("Hanging post-restore runtime command timed out") => {
                    return;
                }
                Err(error) => {
                    last_error = error;
                    thread::sleep(Duration::from_millis(200));
                }
            }
        }
        panic!("command never hit the timeout path after retries; last error: {last_error}");
    }

    #[test]
    fn stale_postgres_pid_file_is_removed_before_start() {
        with_temp_state_dir(|root| {
            let postgres = root.join("Data").join("postgres");
            fs::create_dir_all(&postgres).expect("postgres data dir");
            fs::write(postgres.join("postmaster.pid"), "999999\n").expect("pid file");

            let note = clear_stale_postgres_pid_file().expect("clear stale pid");

            assert!(note
                .expect("stale pid note")
                .contains("Removed stale local data store PID file"));
            assert!(!postgres.join("postmaster.pid").exists());
        });
    }

    #[test]
    fn postgres_start_verifies_database_even_when_tcp_port_is_open() {
        let Ok(_listener) = std::net::TcpListener::bind(("127.0.0.1", LOCAL_DB_PORT)) else {
            return;
        };

        with_temp_state_dir(|root| {
            let bin_dir = root
                .join("Runtime")
                .join("runtime")
                .join("postgres")
                .join("bin");
            fs::create_dir_all(&bin_dir).expect("postgres bin dir");
            fs::write(bin_dir.join("pg_ctl.exe"), "fake pg_ctl").expect("fake pg_ctl");

            let error = match supervisor_action("start", Some("postgres")) {
                Ok(_) => panic!("postgres start should verify database setup"),
                Err(error) => error,
            };

            assert!(error.contains("Local data store initializer is missing"));
        });
    }

    #[test]
    fn service_start_targets_include_runtime_dependencies() {
        let manifest = parse_manifest().expect("manifest parses");

        let python_services =
            target_services_with_start_dependencies(&manifest, Some("python-services"))
                .expect("python services target expands");
        assert_eq!(
            python_services
                .iter()
                .map(|service| service.id.as_str())
                .collect::<Vec<_>>(),
            vec!["postgres", "python-services"]
        );

        let task_queue = target_services_with_start_dependencies(&manifest, Some("task-queue"))
            .expect("task queue target expands");
        assert_eq!(
            task_queue
                .iter()
                .map(|service| service.id.as_str())
                .collect::<Vec<_>>(),
            vec!["postgres", "python-services", "task-queue"]
        );
    }

    #[test]
    fn postgres_repair_moves_incomplete_data_store_before_reinitializing() {
        with_temp_state_dir(|root| {
            let manifest = parse_manifest().expect("manifest parses");
            let service = service_by_id(&manifest, "postgres").expect("postgres service exists");
            let postgres = root.join("Data").join("postgres");
            fs::create_dir_all(postgres.join("base")).expect("partial postgres folder");
            fs::write(postgres.join("partial-init.txt"), "failed init").expect("partial marker");

            let error = ensure_postgres_initialized(service, true)
                .expect_err("missing initdb still reports a bounded repair error");

            assert!(error.contains("Local data store initializer is missing"));
            assert!(postgres.is_dir());
            assert!(!postgres.join("partial-init.txt").exists());
            let old_partial = fs::read_dir(root.join("Data"))
                .expect("data dir readable")
                .filter_map(Result::ok)
                .map(|entry| entry.path())
                .find(|path| {
                    path.file_name()
                        .map(|name| {
                            name.to_string_lossy()
                                .starts_with(".civicsuite-restore-postgres-repair-old-postgres-")
                        })
                        .unwrap_or(false)
                })
                .expect("partial postgres folder moved aside");
            assert!(old_partial.join("partial-init.txt").is_file());
        });
    }

    #[test]
    fn payload_manifest_covers_runtime_services() {
        let manifest = parse_manifest().expect("manifest parses");
        validate_manifest(&manifest).expect("manifest validates");
        let payload_manifest = parse_payload_manifest().expect("payload manifest parses");
        validate_payload_manifest(&manifest, &payload_manifest)
            .expect("payload manifest covers services");
    }

    #[test]
    fn service_environment_pins_city_modules_to_local_gemma_runtime_model() {
        with_temp_state_dir(|_| {
            let manifest = parse_manifest().expect("manifest parses");
            let service = manifest
                .services
                .iter()
                .find(|candidate| candidate.id == "python-services")
                .expect("python services declared");
            let env = service_environment(service).expect("service environment builds");
            assert!(env.iter().any(|(name, value)| {
                name == "TOWNLIGHT_PRODUCT_PROFILE" && value == "records-beta"
            }));
            assert!(env
                .iter()
                .any(|(name, value)| name == "CIVICCODE_AI_MODE" && value == "ollama"));
            assert!(env.iter().any(|(name, value)| {
                name == "CIVICCODE_OLLAMA_MODEL" && value == "civicsuite-gemma4-12b-qat:q4_0"
            }));
            assert!(env.iter().any(|(name, value)| {
                name == "LLM_MODEL" && value == "civicsuite-gemma4-12b-qat:q4_0"
            }));
        });
    }

    #[test]
    fn runtime_root_uses_saved_install_location_without_env_override() {
        with_temp_state_dir(|root| {
            env::remove_var("CIVICSUITE_RUNTIME_ROOT");
            let install_root = root.join("selected-install-root");
            crate::local_paths::save_locations(&crate::local_paths::LocalLocations {
                install_root: install_root.to_string_lossy().to_string(),
                data_root: root.join("Data").to_string_lossy().to_string(),
                backup_root: root.join("Backups").to_string_lossy().to_string(),
            })
            .expect("locations saved");

            assert_eq!(runtime_root(), install_root);

            env::set_var("CIVICSUITE_RUNTIME_ROOT", root.join("Runtime"));
        });
    }

    #[test]
    fn executable_payload_roots_include_tauri_up_payload_dir() {
        let executable_parent = PathBuf::from(r"C:\Program Files\CivicSuite");
        let mut roots = Vec::new();

        append_executable_payload_roots(&mut roots, &executable_parent);

        assert!(roots.contains(
            &executable_parent
                .join("_up_")
                .join("runtime")
                .join("payload")
        ));
    }

    #[test]
    fn model_runtime_environment_uses_local_model_store() {
        with_temp_state_dir(|root| {
            let manifest = parse_manifest().expect("manifest parses");
            let service = manifest
                .services
                .iter()
                .find(|candidate| candidate.id == "model-runtime")
                .expect("model runtime declared");

            ensure_runtime_dirs(service).expect("runtime dirs created");
            let env = service_environment(service).expect("service environment builds");
            let expected_models = root
                .join("Data")
                .join("models")
                .join("ollama")
                .to_string_lossy()
                .to_string();

            assert!(root.join("Data").join("models").join("ollama").is_dir());
            assert!(env
                .iter()
                .any(|(name, value)| name == "OLLAMA_HOST" && value == "127.0.0.1:15434"));
            assert!(env
                .iter()
                .any(|(name, value)| name == "OLLAMA_MODELS" && value == &expected_models));
        });
    }

    #[test]
    fn runtime_health_is_plain_english_before_install() {
        with_temp_state_dir(|_| {
            let health = runtime_health().expect("health builds from manifest");
            assert!(health
                .iter()
                .any(|item| item.id == "desktop-shell" && item.ok));
            assert!(health
                .iter()
                .any(|item| item.label == "Local data store" && !item.ok));
            assert!(health
                .iter()
                .any(|item| item.label == "Local AI model" && item.status == "Needs install"));
            assert!(!health.iter().any(|item| item.label.contains("PostgreSQL")));
        });
    }

    #[test]
    fn supervisor_install_prepares_local_dirs_but_reports_missing_runtime_files() {
        with_temp_state_dir(|root| {
            let result = supervisor_action("install", None).expect("action response is structured");
            assert!(!result.accepted);
            assert_eq!(result.status, "Needs runtime files");
            assert!(root.join("Data").join("files").is_dir());
            assert!(root.join("Data").join("logs").is_dir());
            assert!(root.join("config").join("runtime-state.json").is_file());
        });
    }

    #[test]
    fn supervisor_start_refuses_missing_binary() {
        with_temp_state_dir(|_| {
            let result = supervisor_action("start", Some("postgres"))
                .expect("action response is structured");
            assert!(!result.accepted);
            assert_eq!(result.status, "Needs install");
            assert!(result.message.contains("cannot start"));
        });
    }

    #[test]
    fn supervisor_install_copies_bundled_runtime_payload() {
        with_temp_state_dir(|root| {
            write_test_postgres_payload(&root.join("Payload"));

            let result = supervisor_action("install", Some("postgres"))
                .expect("action response is structured");

            assert!(result.accepted);
            assert_eq!(result.status, "Installed");
            assert!(root
                .join("Runtime")
                .join("runtime")
                .join("postgres")
                .join("bin")
                .join("pg_ctl.exe")
                .is_file());
            assert!(root
                .join("Runtime")
                .join("runtime")
                .join("postgres")
                .join("bin")
                .join("zlib1.dll")
                .is_file());
        });
    }

    #[test]
    fn supervisor_install_repairs_stale_postgres_runtime_missing_zlib() {
        with_temp_state_dir(|root| {
            let payload_root = root.join("Payload");
            write_test_postgres_payload(&payload_root);
            let stale_runtime = root
                .join("Runtime")
                .join("runtime")
                .join("postgres")
                .join("bin");
            fs::create_dir_all(&stale_runtime).expect("stale runtime bin dir");
            for file in ["pg_ctl.exe", "initdb.exe", "postgres.exe"] {
                fs::write(stale_runtime.join(file), "fake runtime file")
                    .expect("stale runtime file");
            }

            let result = supervisor_action("install", Some("postgres"))
                .expect("action response is structured");

            assert!(result.accepted);
            assert_eq!(result.status, "Installed");
            assert!(stale_runtime.join("zlib1.dll").is_file());
        });
    }

    #[test]
    fn supervisor_install_accepts_utf8_bom_payload_lock() {
        with_temp_state_dir(|root| {
            let payload_root = root.join("Payload");
            write_test_postgres_payload(&payload_root);
            let lock_path = payload_root.join("runtime-payload-lock.json");
            let mut contents = vec![0xef, 0xbb, 0xbf];
            contents.extend(fs::read(&lock_path).expect("lock reads"));
            fs::write(&lock_path, contents).expect("bom lock writes");

            let result = supervisor_action("install", Some("postgres"))
                .expect("action response is structured");

            assert!(result.accepted);
            assert_eq!(result.status, "Installed");
            assert!(root
                .join("Runtime")
                .join("runtime")
                .join("postgres")
                .join("bin")
                .join("pg_ctl.exe")
                .is_file());
        });
    }

    #[test]
    fn supervisor_install_rejects_tampered_runtime_payload() {
        with_temp_state_dir(|root| {
            let payload_root = root.join("Payload");
            write_test_postgres_payload(&payload_root);
            fs::write(
                payload_root.join("postgres").join("bin").join("pg_ctl.exe"),
                "tampered runtime file",
            )
            .expect("tamper payload");

            let result = supervisor_action("install", Some("postgres"))
                .expect("action response is structured");

            assert!(!result.accepted);
            assert_eq!(result.status, "Needs runtime files");
            assert!(result.message.contains("integrity check"));
            assert!(result.message.contains("bin/pg_ctl.exe"));
            assert!(!root
                .join("Runtime")
                .join("runtime")
                .join("postgres")
                .join("bin")
                .join("pg_ctl.exe")
                .is_file());
        });
    }

    #[test]
    fn filesystem_service_becomes_healthy_after_install() {
        with_temp_state_dir(|_| {
            supervisor_action("install", Some("file-storage")).expect("install file storage");
            let health = runtime_health().expect("health builds");
            assert!(health
                .iter()
                .any(|item| item.id == "file-storage" && item.ok));
        });
    }

    #[test]
    fn runtime_health_reports_selected_local_folders() {
        with_temp_state_dir(|root| {
            let custom_data = root.join("custom-city-data");
            let custom_backups = root.join("custom-backups");
            crate::local_paths::save_locations(&crate::local_paths::LocalLocations {
                install_root: root.to_string_lossy().to_string(),
                data_root: custom_data.to_string_lossy().to_string(),
                backup_root: custom_backups.to_string_lossy().to_string(),
            })
            .expect("custom locations save");

            let initial = runtime_health().expect("health builds before folders exist");
            let data_item = initial
                .iter()
                .find(|item| item.id == "local-data-folder")
                .expect("data folder health exists");
            assert_eq!(data_item.label, "City data folder");
            assert!(!data_item.ok);
            assert!(!data_item.actionable);
            assert!(data_item.admin_detail.contains("custom-city-data"));
            assert!(data_item.admin_detail.contains("writable false"));

            supervisor_action("install", Some("file-storage")).expect("install file storage");

            let installed = runtime_health().expect("health builds after install");
            let installed_data = installed
                .iter()
                .find(|item| item.id == "local-data-folder")
                .expect("data folder health remains present");
            assert!(installed_data.ok);
            assert!(!installed_data.actionable);
            assert!(installed_data
                .admin_detail
                .contains("writable true; write_check "));
            assert!(installed.iter().any(|item| {
                item.id == "backup-folder"
                    && item.ok
                    && !item.actionable
                    && item.admin_detail.contains("custom-backups")
                    && item.admin_detail.contains("writable true")
            }));
            let leftover_checks = fs::read_dir(&custom_data)
                .expect("data dir readable")
                .filter_map(Result::ok)
                .filter(|entry| {
                    entry
                        .file_name()
                        .to_string_lossy()
                        .starts_with(".civicsuite-health-check-")
                })
                .count();
            assert_eq!(leftover_checks, 0);
        });
    }

    #[test]
    fn real_postgres_payload_initializes_and_migrates_when_enabled() {
        if env::var("CIVICSUITE_RUN_REAL_RUNTIME_TEST").ok().as_deref() != Some("1") {
            return;
        }
        let payload_dir = env::var("CIVICSUITE_RUNTIME_PAYLOAD_DIR")
            .map(PathBuf::from)
            .expect("CIVICSUITE_RUNTIME_PAYLOAD_DIR points at prepared desktop runtime payload");
        let linked_payload_dir = payload_dir.clone();
        with_temp_state_dir_and_payload(payload_dir, |root| {
            #[cfg(windows)]
            link_payload_runtime(&root, &linked_payload_dir);
            supervisor_action("install", Some("postgres")).expect("install postgres payload");
            supervisor_action("install", Some("python-services"))
                .expect("install python service payload");
            let start = supervisor_action("start", Some("postgres")).expect("start postgres");
            assert!(start.accepted);
            // Reverse-order drop guards: stop the services even if an assert
            // below panics (see ServiceStopGuard).
            let _postgres_guard = ServiceStopGuard {
                service_id: "postgres",
            };
            let python_start =
                supervisor_action("start", Some("python-services")).expect("start python services");
            assert!(python_start.accepted);
            let _python_guard = ServiceStopGuard {
                service_id: "python-services",
            };
            let worker_start =
                supervisor_action("start", Some("task-queue")).expect("start task queue");
            assert!(worker_start.accepted);
            let _worker_guard = ServiceStopGuard {
                service_id: "task-queue",
            };
            for _ in 0..40 {
                let health = runtime_health().expect("health builds");
                if health
                    .iter()
                    .any(|item| item.id == "python-services" && item.ok)
                    && health.iter().any(|item| item.id == "task-queue" && item.ok)
                {
                    break;
                }
                thread::sleep(Duration::from_millis(500));
            }
            let health = runtime_health().expect("health builds");
            assert!(health.iter().any(|item| item.id == "postgres" && item.ok));
            assert!(health
                .iter()
                .any(|item| item.id == "python-services" && item.ok));
            assert!(health.iter().any(|item| item.id == "task-queue" && item.ok));
            supervisor_action("stop", Some("task-queue")).expect("stop task queue");
            supervisor_action("stop", Some("python-services")).expect("stop python services");
            supervisor_action("stop", Some("postgres")).expect("stop postgres");
        });
    }

    // Proves the real "AI engine not ready" plumbing the CivicAccess dual-path
    // handlers depend on: a genuine Ollama server (from the prepared payload)
    // with ZERO models installed serves /api/tags health fine, model readiness
    // still reports not-ready (weights/checksum/registry absent), and a
    // CivicAccess AI-capable action returns the labeled deterministic fallback
    // through the real HTTP probe path -- not the compile-time test stub.
    #[test]
    fn real_ollama_runtime_with_no_model_serves_the_not_ready_contract_when_enabled() {
        if env::var("CIVICSUITE_RUN_REAL_RUNTIME_TEST").ok().as_deref() != Some("1") {
            return;
        }
        let payload_dir = env::var("CIVICSUITE_RUNTIME_PAYLOAD_DIR")
            .map(PathBuf::from)
            .expect("CIVICSUITE_RUNTIME_PAYLOAD_DIR points at prepared desktop runtime payload");
        let linked_payload_dir = payload_dir.clone();
        with_temp_state_dir_and_payload(payload_dir, |root| {
            env::remove_var("CIVICSUITE_FAKE_MODEL_RESPONSE");
            env::remove_var("CIVICSUITE_FAKE_MODEL_ERROR");
            #[cfg(windows)]
            link_payload_runtime_set(&root, &linked_payload_dir, &["ollama"]);
            supervisor_action("install", Some("model-runtime")).expect("install ollama payload");
            let start = supervisor_action("start", Some("model-runtime")).expect("start ollama");
            assert!(start.accepted);
            // Stop the spawned ollama even if an assert below panics -- an
            // orphaned server would leak into the runner and poison the shared
            // test lock for the sibling gated test.
            let _stop_guard = ServiceStopGuard {
                service_id: "model-runtime",
            };
            let mut runtime_ok = false;
            for _ in 0..60 {
                let health = runtime_health().expect("health builds");
                if health
                    .iter()
                    .any(|item| item.id == "model-runtime" && item.ok)
                {
                    runtime_ok = true;
                    break;
                }
                thread::sleep(Duration::from_millis(500));
            }
            assert!(runtime_ok, "ollama serves /api/tags with zero models");
            let state = crate::model::model_state().expect("model state builds");
            assert!(
                !state.ready,
                "runtime up + weights absent must stay not-ready"
            );
            assert!(state
                .checks
                .iter()
                .any(|check| check.id == "runtime" && check.ok));
            assert!(state
                .checks
                .iter()
                .any(|check| check.id == "artifact-file" && !check.ok));
            let fallback = crate::workflows::city_work_action(
                "civicaccess-plain-language",
                Some(&serde_json::json!({
                    "text": "Residents must remit payment prior to the deadline."
                })),
            )
            .expect("fallback rewrite succeeds against a model-less runtime");
            assert!(
                fallback.message.contains("AI engine not ready"),
                "fallback result carries the explicit marker through the real probe path"
            );
            // "must pay before" only exists if the jargon-map rewrite really
            // ran ("remit payment" -> "pay", "prior to" -> "before"); a bare
            // "pay" would be satisfied by the input's own "payment".
            assert!(fallback.message.contains("must pay before"));
        });
    }

    // Drop-guard: best-effort service stop that also runs on panic, so a
    // failing gated test cannot orphan its spawned process into the runner.
    struct ServiceStopGuard {
        service_id: &'static str,
    }

    impl Drop for ServiceStopGuard {
        fn drop(&mut self) {
            let _ = supervisor_action("stop", Some(self.service_id));
        }
    }

    #[test]
    fn real_copied_payload_repair_recovers_partial_postgres_when_enabled() {
        if env::var("CIVICSUITE_RUN_REAL_RUNTIME_COPY_TEST")
            .ok()
            .as_deref()
            != Some("1")
        {
            return;
        }
        let payload_dir = env::var("CIVICSUITE_RUNTIME_PAYLOAD_DIR")
            .map(PathBuf::from)
            .expect("CIVICSUITE_RUNTIME_PAYLOAD_DIR points at prepared desktop runtime payload");
        with_temp_state_dir_and_payload(payload_dir, |root| {
            let partial_postgres = root.join("Data").join("postgres");
            fs::create_dir_all(&partial_postgres).expect("partial postgres folder");
            fs::write(partial_postgres.join("partial-init.txt"), "failed init")
                .expect("partial marker");

            let repair =
                supervisor_action("repair", Some("postgres")).expect("repair postgres payload");

            assert!(repair.accepted);
            assert_eq!(repair.status, "Repaired");
            assert!(root
                .join("Runtime")
                .join("runtime")
                .join("postgres")
                .join("bin")
                .join("pg_ctl.exe")
                .is_file());
            assert!(root
                .join("Data")
                .join("postgres")
                .join("PG_VERSION")
                .is_file());
            assert!(runtime_health()
                .expect("health builds")
                .iter()
                .any(|item| item.id == "postgres" && item.ok));
            supervisor_action("stop", Some("postgres")).expect("stop postgres");
        });
    }

    #[test]
    fn backup_copies_local_data_and_config() {
        with_temp_state_dir(|root| {
            fs::create_dir_all(root.join("Data").join("files")).expect("data folder");
            fs::write(root.join("Data").join("files").join("record.txt"), "agenda")
                .expect("data file");
            fs::create_dir_all(root.join("Data").join("workflows")).expect("workflow folder");
            fs::write(
                root.join("Data").join("workflows").join("city-work.json"),
                r#"{"meetings":[{"id":"meeting-1","title":"Council"}]}"#,
            )
            .expect("workflow state");
            fs::create_dir_all(root.join("Data").join("exports").join("meetings"))
                .expect("exports folder");
            fs::write(
                root.join("Data")
                    .join("exports")
                    .join("meetings")
                    .join("packet.md"),
                "meeting packet",
            )
            .expect("export file");
            fs::create_dir_all(root.join("config")).expect("config folder");
            fs::write(root.join("config").join("city.json"), "{}").expect("config file");

            let result = supervisor_action("backup", None).expect("backup response");

            assert!(result.accepted);
            let backups = root.join("Backups");
            let backup = latest_backup_dir()
                .expect("latest backup lookup")
                .expect("backup exists");
            assert!(backup.starts_with(backups));
            assert!(backup
                .join("Data")
                .join("files")
                .join("record.txt")
                .is_file());
            assert!(backup
                .join("Data")
                .join("workflows")
                .join("city-work.json")
                .is_file());
            assert!(backup
                .join("Data")
                .join("exports")
                .join("meetings")
                .join("packet.md")
                .is_file());
            assert!(backup.join("config").join("city.json").is_file());
            assert!(backup.join("README.txt").is_file());
            assert!(backup.join("backup-manifest.json").is_file());
            let backup_readme = fs::read_to_string(backup.join("README.txt")).expect("readme");
            assert!(backup_readme.contains("backup-manifest.json"));
            let manifest =
                verified_backup_manifest(&backup).expect("backup hash manifest verifies");
            assert_eq!(manifest.file_count, manifest.files.len());
            assert!(manifest.files.iter().any(|file| file.path == "README.txt"));
            assert!(manifest.files.iter().any(|file| {
                file.path == "Data/files/record.txt"
                    && file.size_bytes == "agenda".len() as u64
                    && file.sha256.len() == 64
            }));
            assert!(manifest.files.iter().any(|file| {
                file.path == "Data/workflows/city-work.json" && file.sha256.len() == 64
            }));
            assert!(manifest.files.iter().any(|file| {
                file.path == "Data/exports/meetings/packet.md" && file.sha256.len() == 64
            }));
            assert!(manifest
                .files
                .iter()
                .any(|file| { file.path == "config/city.json" && file.sha256.len() == 64 }));
        });
    }

    #[test]
    fn backup_copy_records_skipped_destination_errors_without_aborting() {
        with_temp_state_dir(|root| {
            let source = root.join("source-data");
            fs::create_dir_all(source.join("files")).expect("source folder");
            fs::write(source.join("files").join("record.txt"), "agenda").expect("source file");
            let destination = root.join("blocked-destination");
            fs::write(&destination, "not a directory").expect("blocking destination file");
            let mut skipped = Vec::new();

            copy_path_recursive_for_backup(&source, &destination, "Data", &mut skipped);

            assert!(skipped.iter().any(|entry| {
                entry.path == "Data" && entry.reason.contains("backup folder create failed")
            }));
        });
    }

    #[test]
    fn open_backup_folder_creates_and_opens_backup_root() {
        with_temp_state_dir(|root| {
            let result = supervisor_action("open-backup-folder", None).expect("action response");

            assert!(result.accepted);
            assert_eq!(result.status, "Backup folder open");
            assert!(root.join("Backups").is_dir());
        });
    }

    #[test]
    fn logs_action_prepares_selected_logs_folder() {
        with_temp_state_dir(|root| {
            let custom_data = root.join("selected-city-data");
            let custom_backups = root.join("selected-backups");
            crate::local_paths::save_locations(&crate::local_paths::LocalLocations {
                install_root: root.to_string_lossy().to_string(),
                data_root: custom_data.to_string_lossy().to_string(),
                backup_root: custom_backups.to_string_lossy().to_string(),
            })
            .expect("custom locations save");

            let result = supervisor_action("logs", Some("postgres")).expect("logs action");

            assert!(result.accepted);
            assert_eq!(result.status, "Logs folder open");
            assert!(result.message.contains("selected-city-data"));
            assert!(result.next_action.contains("README.txt"));
            let logs = custom_data.join("logs");
            assert!(logs.join("README.txt").is_file());
            assert!(logs.join("postgres.log").is_file());
            let readme = fs::read_to_string(logs.join("README.txt")).expect("readme");
            assert!(readme.contains("Townlight Local Logs"));
            assert!(readme.contains("Local data store"));
            assert!(readme.contains("postgres.log"));
        });
    }

    #[test]
    fn support_bundle_action_packages_selected_runtime_evidence() {
        with_temp_state_dir(|root| {
            let custom_data = root.join("selected-city-data");
            let custom_backups = root.join("selected-backups");
            crate::local_paths::save_locations(&crate::local_paths::LocalLocations {
                install_root: root.to_string_lossy().to_string(),
                data_root: custom_data.to_string_lossy().to_string(),
                backup_root: custom_backups.to_string_lossy().to_string(),
            })
            .expect("custom locations save");

            let result =
                supervisor_action("support-bundle", Some("postgres")).expect("support bundle");

            assert!(result.accepted);
            assert_eq!(result.status, "Support bundle ready");
            assert_eq!(result.service_id.as_deref(), Some("postgres"));
            assert!(result.message.contains("support-bundles"));
            assert!(result.next_action.contains("support-manifest.json"));

            let bundle_root = custom_backups.join("support-bundles");
            let mut bundles = fs::read_dir(&bundle_root)
                .expect("support bundle folder")
                .collect::<Result<Vec<_>, _>>()
                .expect("support bundle entries");
            bundles.sort_by_key(|entry| entry.path());
            assert_eq!(bundles.len(), 1);
            let bundle = bundles[0].path();

            assert!(bundle.join("README.txt").is_file());
            assert!(bundle.join("health-summary.json").is_file());
            assert!(bundle.join("runtime-state.json").is_file());
            assert!(bundle.join("support-manifest.json").is_file());
            assert!(bundle.join("logs").join("postgres.log").is_file());
            assert!(!bundle.join("Data").exists());
            assert!(!bundle.join("config").exists());

            let readme = fs::read_to_string(bundle.join("README.txt")).expect("readme");
            assert!(readme.contains("Townlight Support Bundle"));
            assert!(readme.contains("does not copy city records"));
            assert!(readme.contains("Local data store (postgres)"));

            let manifest: serde_json::Value = serde_json::from_str(
                &fs::read_to_string(bundle.join("support-manifest.json")).expect("manifest"),
            )
            .expect("support manifest json");
            assert_eq!(manifest["kind"], "support-bundle");
            assert_eq!(manifest["selected_services"][0], "postgres");
            let files = manifest["files"].as_array().expect("manifest files");
            assert!(files.iter().any(|file| file["path"] == "README.txt"));
            assert!(files
                .iter()
                .any(|file| file["path"] == "health-summary.json"));
            assert!(files
                .iter()
                .any(|file| file["path"] == "runtime-state.json"));
            assert!(files.iter().any(|file| {
                file["path"] == "logs/postgres.log"
                    && file["sha256"].as_str().map(|value| value.len()) == Some(64)
            }));
        });
    }

    #[test]
    fn restore_replaces_profile_from_latest_backup() {
        with_temp_state_dir(|root| {
            fs::create_dir_all(root.join("Data").join("files")).expect("data folder");
            fs::write(root.join("Data").join("files").join("record.txt"), "before")
                .expect("data file");
            fs::create_dir_all(root.join("Data").join("workflows")).expect("workflow folder");
            fs::write(
                root.join("Data").join("workflows").join("city-work.json"),
                r#"{"records_requests":[{"id":"records-1","status":"released"}]}"#,
            )
            .expect("workflow state");
            fs::create_dir_all(root.join("Data").join("exports").join("records"))
                .expect("exports folder");
            fs::write(
                root.join("Data")
                    .join("exports")
                    .join("records")
                    .join("response.md"),
                "released response",
            )
            .expect("export file");
            fs::create_dir_all(root.join("Data").join("models").join("ollama"))
                .expect("model cache folder");
            fs::write(
                root.join("Data")
                    .join("models")
                    .join("ollama")
                    .join("model-cache.bin"),
                "backup-model-cache",
            )
            .expect("model cache file before backup");
            fs::create_dir_all(root.join("config")).expect("config folder");
            fs::write(root.join("config").join("city.json"), "before").expect("config file");
            fs::write(
                root.join("config").join("runtime-state.json"),
                r#"{"services":[{"id":"python-services","installed":true,"pid":424242,"last_action":"start","last_updated_unix_seconds":1}],"last_action":"start","last_updated_unix_seconds":1}"#,
            )
            .expect("stale runtime state");
            supervisor_action("backup", None).expect("backup response");

            fs::write(root.join("Data").join("files").join("record.txt"), "after")
                .expect("mutate data");
            fs::write(
                root.join("Data")
                    .join("files")
                    .join("post-backup-extra.txt"),
                "extra",
            )
            .expect("extra data file");
            fs::write(
                root.join("Data").join("workflows").join("city-work.json"),
                r#"{"records_requests":[]}"#,
            )
            .expect("mutate workflow state");
            fs::remove_file(
                root.join("Data")
                    .join("exports")
                    .join("records")
                    .join("response.md"),
            )
            .expect("remove export");
            fs::write(
                root.join("Data")
                    .join("models")
                    .join("ollama")
                    .join("model-cache.bin"),
                "current-model-cache",
            )
            .expect("current model cache file");
            let _locked_model_cache = OpenOptions::new()
                .read(true)
                .open(
                    root.join("Data")
                        .join("models")
                        .join("ollama")
                        .join("model-cache.bin"),
                )
                .expect("hold live model cache handle during restore");
            fs::write(root.join("config").join("city.json"), "after").expect("mutate config");

            let result = supervisor_action("restore", None).expect("restore response");

            assert!(result.accepted);
            assert_eq!(
                fs::read_to_string(root.join("Data").join("files").join("record.txt"))
                    .expect("restored data"),
                "before"
            );
            assert_eq!(
                fs::read_to_string(root.join("config").join("city.json")).expect("restored config"),
                "before"
            );
            assert!(
                fs::read_to_string(root.join("Data").join("workflows").join("city-work.json"))
                    .expect("restored workflow state")
                    .contains("released")
            );
            assert!(root
                .join("Data")
                .join("exports")
                .join("records")
                .join("response.md")
                .is_file());
            assert_eq!(
                fs::read_to_string(
                    root.join("Data")
                        .join("models")
                        .join("ollama")
                        .join("model-cache.bin")
                )
                .expect("current model cache preserved"),
                "current-model-cache"
            );
            let runtime_state: RuntimeState = serde_json::from_str(
                &fs::read_to_string(root.join("config").join("runtime-state.json"))
                    .expect("runtime state"),
            )
            .expect("runtime state json");
            assert_eq!(runtime_state.last_action.as_deref(), Some("restore"));
            assert!(runtime_state.services.iter().any(|service| {
                service.id == "python-services"
                    && service.pid.is_none()
                    && service.last_action.as_deref() == Some("restore")
            }));
            assert!(runtime_state
                .services
                .iter()
                .all(|service| service.pid.is_none()));
            assert!(!root
                .join("Data")
                .join("files")
                .join("post-backup-extra.txt")
                .exists());
            let restore_swap_entries: Vec<String> = root
                .read_dir()
                .expect("profile entries")
                .filter_map(Result::ok)
                .map(|entry| entry.file_name().to_string_lossy().to_string())
                .filter(|name| name.starts_with(".civicsuite-restore-"))
                .collect();
            assert!(!restore_swap_entries
                .iter()
                .any(|name| name.contains("-stage-")));
            assert!(restore_swap_entries
                .iter()
                .any(|name| name.contains("-old-Data-")));
            assert!(restore_swap_entries
                .iter()
                .any(|name| name.contains("-old-config-")));
            assert!(result.message.contains("old folder cleanup is pending"));
            assert!(result
                .message
                .contains("existing local model cache was preserved"));
            let pre_restore_backup = root
                .join("Backups")
                .read_dir()
                .expect("backups")
                .filter_map(Result::ok)
                .find(|entry| entry.file_name().to_string_lossy().contains("pre-restore"))
                .expect("pre-restore safety backup")
                .path();
            assert!(!pre_restore_backup.join("Data").join("models").exists());
            let manifest =
                verified_backup_manifest(&pre_restore_backup).expect("pre-restore verifies");
            assert!(manifest.skipped_files.iter().any(|entry| {
                entry.path == "Data/models"
                    && entry
                        .reason
                        .contains("model cache skipped for restore safety backup")
            }));
        });
    }

    #[test]
    fn backups_exclude_per_install_secret_and_restore_preserves_it() {
        with_temp_state_dir(|root| {
            fs::create_dir_all(root.join("Data").join("files")).expect("data folder");
            fs::write(root.join("Data").join("files").join("record.txt"), "before")
                .expect("data file");
            fs::create_dir_all(root.join("config")).expect("config folder");
            fs::write(root.join("config").join("city.json"), "before").expect("config file");
            let secrets = root.join("config").join("secrets");
            fs::create_dir_all(&secrets).expect("secrets folder");
            let secret_file = secrets.join("postgres-password.txt");
            fs::write(&secret_file, "ORIGINAL-LOCAL-DB-PASSWORD\n").expect("secret file");

            let backup_result = supervisor_action("backup", None).expect("backup response");
            assert!(backup_result.accepted);

            let manual_backup = root
                .join("Backups")
                .read_dir()
                .expect("backups")
                .filter_map(Result::ok)
                .find(|entry| entry.file_name().to_string_lossy().contains("manual"))
                .expect("manual backup folder")
                .path();

            // The plaintext secret must not be present anywhere in the backup.
            assert!(
                !manual_backup.join("config").join("secrets").exists(),
                "backup must not contain the per-install secrets folder"
            );
            let manifest =
                verified_backup_manifest(&manual_backup).expect("manual backup verifies");
            assert!(
                manifest
                    .files
                    .iter()
                    .all(|entry| !entry.path.contains("secrets")),
                "no backup manifest file entry may reference the secret"
            );
            assert!(
                manifest.skipped_files.iter().any(|entry| {
                    entry.path.starts_with("config/secrets")
                        && entry.reason.contains("per-install local secret excluded")
                }),
                "the secret must be recorded as an excluded file"
            );

            // Mutating then restoring must keep the live per-install secret.
            fs::write(root.join("config").join("city.json"), "after").expect("mutate config");
            fs::write(&secret_file, "ROTATED-LOCAL-DB-PASSWORD\n").expect("rotate secret");

            let restore_result = supervisor_action("restore", None).expect("restore response");
            assert!(restore_result.accepted);
            assert_eq!(
                fs::read_to_string(root.join("config").join("city.json")).expect("restored config"),
                "before"
            );
            assert!(
                secret_file.is_file(),
                "the live per-install secret must survive a restore"
            );
            assert_eq!(
                fs::read_to_string(&secret_file).expect("live secret"),
                "ROTATED-LOCAL-DB-PASSWORD\n",
                "restore preserves the live secret instead of wiping or reverting it"
            );

            // The pre-restore safety backup also excludes the secret.
            let pre_restore_backup = root
                .join("Backups")
                .read_dir()
                .expect("backups")
                .filter_map(Result::ok)
                .find(|entry| entry.file_name().to_string_lossy().contains("pre-restore"))
                .expect("pre-restore safety backup")
                .path();
            assert!(!pre_restore_backup.join("config").join("secrets").exists());
        });
    }

    #[test]
    fn restore_latest_ignores_stale_pre_restore_safety_backup() {
        with_temp_state_dir(|root| {
            fs::create_dir_all(root.join("Data").join("files")).expect("data folder");
            fs::write(root.join("Data").join("files").join("record.txt"), "stale")
                .expect("stale data file");
            fs::create_dir_all(root.join("config")).expect("config folder");
            fs::write(root.join("config").join("city.json"), "stale").expect("stale config");
            let stale_safety_backup = create_backup_with_options(
                "pre-restore",
                BackupOptions {
                    include_model_cache: false,
                },
            )
            .expect("stale pre-restore safety backup");

            fs::write(root.join("Data").join("files").join("record.txt"), "fresh")
                .expect("fresh data file");
            fs::write(root.join("config").join("city.json"), "fresh").expect("fresh config");
            let fresh_manual_backup = create_backup("manual").expect("fresh manual backup");

            let fresh_manifest_path = fresh_manual_backup.join("backup-manifest.json");
            let fresh_manifest: BackupManifest = serde_json::from_str(
                &fs::read_to_string(&fresh_manifest_path).expect("fresh manifest"),
            )
            .expect("fresh manifest json");
            let stale_manifest_path = stale_safety_backup.join("backup-manifest.json");
            let mut stale_manifest: BackupManifest = serde_json::from_str(
                &fs::read_to_string(&stale_manifest_path).expect("stale manifest"),
            )
            .expect("stale manifest json");
            stale_manifest.created_unix_seconds =
                fresh_manifest.created_unix_seconds.saturating_sub(300);
            fs::write(
                &stale_manifest_path,
                format!(
                    "{}\n",
                    serde_json::to_string_pretty(&stale_manifest)
                        .expect("serialize stale manifest")
                ),
            )
            .expect("rewrite stale manifest timestamp");

            assert!(
                stale_safety_backup
                    .file_name()
                    .expect("stale name")
                    .to_string_lossy()
                    > fresh_manual_backup
                        .file_name()
                        .expect("fresh name")
                        .to_string_lossy(),
                "pre-restore folder names sort after manual backup names"
            );
            assert_eq!(
                latest_backup_dir()
                    .expect("latest lookup")
                    .expect("latest backup"),
                fresh_manual_backup
            );

            fs::write(
                root.join("Data").join("files").join("record.txt"),
                "current",
            )
            .expect("current data file");
            fs::write(root.join("config").join("city.json"), "current").expect("current config");

            let result = supervisor_action("restore", None).expect("restore response");

            assert!(result
                .message
                .contains(&fresh_manual_backup.display().to_string()));
            assert_eq!(
                fs::read_to_string(root.join("Data").join("files").join("record.txt"))
                    .expect("restored data"),
                "fresh"
            );
            assert_eq!(
                fs::read_to_string(root.join("config").join("city.json")).expect("restored config"),
                "fresh"
            );
        });
    }

    #[test]
    fn restore_defers_service_restart_after_profile_swap() {
        with_temp_state_dir(|root| {
            fs::create_dir_all(root.join("Data").join("files")).expect("data folder");
            fs::write(root.join("Data").join("files").join("record.txt"), "before")
                .expect("data file");
            fs::create_dir_all(root.join("config")).expect("config folder");
            fs::write(root.join("config").join("city.json"), "before").expect("config file");
            supervisor_action("backup", None).expect("backup response");

            fs::write(root.join("Data").join("files").join("record.txt"), "after")
                .expect("mutate data");
            fs::write(root.join("config").join("city.json"), "after").expect("mutate config");

            for binary in [
                root.join("Runtime")
                    .join("runtime")
                    .join("postgres")
                    .join("bin")
                    .join("pg_ctl.exe"),
                root.join("Runtime")
                    .join("runtime")
                    .join("python")
                    .join("python.exe"),
                root.join("Runtime")
                    .join("runtime")
                    .join("ollama")
                    .join("ollama.exe"),
            ] {
                fs::create_dir_all(binary.parent().expect("binary parent")).expect("binary dir");
                fs::write(binary, "fake runtime binary").expect("fake binary");
            }

            let result = supervisor_action("restore", None).expect("restore response");

            assert!(!result.accepted);
            assert_eq!(result.status, "Restore needs service start");
            assert!(result.message.contains("Local services were left stopped"));
            assert!(result.message.contains("Start can verify database"));
            assert!(result.message.contains("old folder cleanup is pending"));
            assert_eq!(
                fs::read_to_string(root.join("Data").join("files").join("record.txt"))
                    .expect("restored data"),
                "before"
            );
            assert_eq!(
                fs::read_to_string(root.join("config").join("city.json")).expect("restored config"),
                "before"
            );
            let runtime_state: RuntimeState = serde_json::from_str(
                &fs::read_to_string(root.join("config").join("runtime-state.json"))
                    .expect("runtime state"),
            )
            .expect("runtime state json");
            assert_eq!(runtime_state.last_action.as_deref(), Some("restore"));
            assert!(runtime_state
                .services
                .iter()
                .all(|service| service.pid.is_none()));
        });
    }

    #[test]
    fn restore_refuses_tampered_backup_manifest() {
        with_temp_state_dir(|root| {
            fs::create_dir_all(root.join("Data").join("files")).expect("data folder");
            fs::write(root.join("Data").join("files").join("record.txt"), "before")
                .expect("data file");
            fs::create_dir_all(root.join("config")).expect("config folder");
            fs::write(root.join("config").join("city.json"), "before").expect("config file");
            supervisor_action("backup", None).expect("backup response");
            let backup = latest_backup_dir()
                .expect("latest backup lookup")
                .expect("backup exists");
            fs::write(
                backup.join("Data").join("files").join("record.txt"),
                "tampered",
            )
            .expect("tamper with backup data");
            fs::write(
                root.join("Data").join("files").join("record.txt"),
                "current",
            )
            .expect("current data");

            let result = supervisor_action("restore", None).expect("restore response");

            assert!(!result.accepted);
            assert_eq!(result.status, "Backup verification failed");
            assert_eq!(
                fs::read_to_string(root.join("Data").join("files").join("record.txt"))
                    .expect("current data kept"),
                "current"
            );
            assert!(!root
                .join("Backups")
                .read_dir()
                .expect("backups")
                .filter_map(Result::ok)
                .any(|entry| entry.file_name().to_string_lossy().contains("pre-restore")));
        });
    }

    #[test]
    fn restore_refuses_empty_backup() {
        with_temp_state_dir(|root| {
            supervisor_action("backup", None).expect("empty backup response");
            fs::create_dir_all(root.join("Data").join("files")).expect("data folder");
            fs::write(
                root.join("Data").join("files").join("record.txt"),
                "current",
            )
            .expect("current data");

            let result = supervisor_action("restore", None).expect("restore response");

            assert!(!result.accepted);
            assert_eq!(result.status, "Backup has no data");
            assert_eq!(
                fs::read_to_string(root.join("Data").join("files").join("record.txt"))
                    .expect("current data kept"),
                "current"
            );
        });
    }

    #[test]
    fn uninstall_removes_profile_after_final_backup() {
        with_temp_state_dir(|root| {
            fs::create_dir_all(root.join("Data").join("files")).expect("data folder");
            fs::write(
                root.join("Data").join("files").join("record.txt"),
                "official",
            )
            .expect("data file");
            fs::create_dir_all(root.join("config")).expect("config folder");
            fs::write(root.join("config").join("city.json"), "{}").expect("config file");

            let result = supervisor_action("uninstall", None).expect("uninstall response");

            assert!(result.accepted);
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

    #[test]
    fn open_windows_uninstall_settings_returns_user_handoff() {
        with_temp_state_dir(|_root| {
            let result = supervisor_action("open-windows-uninstall", None)
                .expect("open Windows uninstall response");

            assert!(result.accepted);
            assert_eq!(result.action, "open-windows-uninstall");
            assert_eq!(result.status, "Windows uninstall opened");
            assert!(result.message.contains("Installed apps"));
            assert!(result.next_action.contains("Find Townlight"));
        });
    }
}
