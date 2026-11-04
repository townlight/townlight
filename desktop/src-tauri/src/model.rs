use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::env;
use std::fs;
use std::io::{Read, Write};
use std::net::{TcpStream, ToSocketAddrs};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use crate::local_paths;

const MODEL_MANIFEST_JSON: &str = include_str!("../../runtime/gemma4-model.json");
const DEFAULT_OLLAMA_BASE_URL: &str = "http://127.0.0.1:15434";
const MODEL_RUNTIME_READY_ATTEMPTS: usize = 80;
const MODEL_RUNTIME_READY_INTERVAL: Duration = Duration::from_millis(500);
const LOCAL_GENERATION_TIMEOUT_MILLIS: u64 = 180_000;
const LOCAL_GENERATION_NUM_PREDICT: u16 = 512;
const LOCAL_GENERATION_NUM_CTX: u16 = 8192;
const REQUIRED_ACTIONS: [&str; 6] = [
    "download",
    "resume-download",
    "load-runtime-model",
    "verify-checksum",
    "open-model-folder",
    "retry",
];
const REQUIRED_READINESS_CHECKS: [&str; 6] = [
    "metadata",
    "artifact-file",
    "checksum",
    "runtime",
    "runtime-model",
    "registered-model",
];

#[derive(Deserialize)]
struct OperatorPath {
    requires_docker: bool,
    requires_wsl: bool,
    requires_terminal: bool,
}

#[derive(Deserialize)]
struct ModelManifest {
    schema_version: u16,
    profile: String,
    local_only: bool,
    operator_path: OperatorPath,
    model: ModelDefinition,
    download: DownloadDefinition,
    actions: Vec<String>,
    readiness_checks: Vec<ReadinessDefinition>,
}

#[derive(Deserialize)]
struct ModelDefinition {
    id: String,
    display_name: String,
    provider: String,
    source_repo: String,
    source_url: String,
    resolve_url: String,
    documentation_url: String,
    license: String,
    runtime: String,
    ollama_model: String,
    runtime_model: String,
    format: String,
    quantization: String,
    parameters: String,
    context_window_tokens: u32,
    approximate_weight_memory_gb: f32,
    artifact: ArtifactDefinition,
}

#[derive(Deserialize)]
struct ArtifactDefinition {
    file_name: String,
    relative_path: String,
    size_bytes: u64,
    sha256: String,
    checksum_required: bool,
    checksum_source: String,
    etag_blob_id: String,
}

#[derive(Deserialize)]
struct DownloadDefinition {
    automatic: bool,
    resumable: bool,
    requires_user_consent: bool,
    network_policy: String,
    minimum_free_disk_bytes: u64,
}

#[derive(Deserialize)]
struct ReadinessDefinition {
    id: String,
    label: String,
    required: bool,
    next_action: String,
}

#[derive(Deserialize, Default)]
struct OllamaTagsResponse {
    #[serde(default)]
    models: Vec<OllamaTag>,
}

#[derive(Deserialize, Default)]
struct OllamaTag {
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    model: Option<String>,
}

#[derive(Deserialize, Default)]
struct OllamaGenerateResponse {
    #[serde(default)]
    response: String,
    #[serde(default)]
    message: Option<OllamaGenerateMessage>,
    #[serde(default)]
    done: bool,
}

#[derive(Deserialize, Default)]
struct OllamaGenerateMessage {
    #[serde(default)]
    content: String,
}

#[derive(Debug, Default)]
struct ModelRuntimeProbe {
    reachable: bool,
    model_available: bool,
    message: String,
}

#[derive(Serialize)]
pub struct ModelArtifact {
    pub file_name: String,
    pub local_path: String,
    pub expected_size_bytes: u64,
    pub expected_sha256: String,
    pub checksum_required: bool,
    pub checksum_source: String,
    pub etag_blob_id: String,
}

#[derive(Serialize)]
pub struct ModelReadinessItem {
    pub id: String,
    pub label: String,
    pub ok: bool,
    pub status: &'static str,
    pub message: String,
    pub next_action: String,
}

#[derive(Serialize)]
pub struct ModelState {
    pub profile: String,
    pub local_only: bool,
    pub ready: bool,
    pub status: &'static str,
    pub display_name: String,
    pub model_id: String,
    pub provider: String,
    pub source_repo: String,
    pub source_url: String,
    pub resolve_url: String,
    pub documentation_url: String,
    pub license: String,
    pub runtime: String,
    pub ollama_model: String,
    pub runtime_model: String,
    pub format: String,
    pub quantization: String,
    pub parameters: String,
    pub context_window_tokens: u32,
    pub approximate_weight_memory_gb: f32,
    pub download_size_bytes: u64,
    pub download_resumable: bool,
    pub download_requires_consent: bool,
    pub download_policy: String,
    pub minimum_free_disk_bytes: u64,
    pub artifact: ModelArtifact,
    pub download_state: ModelDownloadState,
    pub checks: Vec<ModelReadinessItem>,
    pub next_action: String,
}

#[derive(Serialize)]
pub struct ModelActionResult {
    pub accepted: bool,
    pub action: String,
    pub status: &'static str,
    pub message: String,
    pub next_action: String,
}

#[derive(Deserialize, Serialize, Clone, Default)]
pub struct ModelDownloadState {
    pub schema_version: u16,
    pub model_id: String,
    pub status: String,
    pub message: String,
    pub local_path: String,
    pub partial_path: String,
    pub expected_size_bytes: u64,
    pub local_bytes: u64,
    pub partial_bytes: u64,
    pub progress_percent: f64,
    pub last_error: Option<String>,
    pub updated_at_unix_seconds: u64,
}

#[derive(Deserialize, Serialize, Default)]
struct LocalModelRegistry {
    models: Vec<RegisteredModel>,
}

#[derive(Deserialize, Serialize, Clone)]
struct RegisteredModel {
    model_id: String,
    display_name: String,
    provider: String,
    runtime: String,
    ollama_model: String,
    #[serde(default)]
    runtime_model: String,
    artifact_path: String,
    sha256: String,
    registered_at_unix_seconds: u64,
}

fn parse_manifest() -> Result<ModelManifest, String> {
    serde_json::from_str(MODEL_MANIFEST_JSON)
        .map_err(|error| format!("Could not parse Gemma model manifest: {error}"))
}

fn now_unix_seconds() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or(0)
}

fn is_sha256(value: &str) -> bool {
    value.len() == 64 && value.chars().all(|character| character.is_ascii_hexdigit())
}

fn validate_manifest(manifest: &ModelManifest) -> Result<(), String> {
    if manifest.schema_version != 1 {
        return Err(format!(
            "Unsupported Gemma model manifest schema {}",
            manifest.schema_version
        ));
    }
    if manifest.profile != "windows-local-1.0" {
        return Err("Gemma model manifest profile must be windows-local-1.0".to_string());
    }
    if !manifest.local_only {
        return Err("Gemma model manifest must be local-only".to_string());
    }
    if manifest.operator_path.requires_docker
        || manifest.operator_path.requires_wsl
        || manifest.operator_path.requires_terminal
    {
        return Err("Gemma model operator path cannot require developer tooling".to_string());
    }
    if manifest.download.automatic || !manifest.download.requires_user_consent {
        return Err(
            "Gemma model download must require explicit user consent and never be silent"
                .to_string(),
        );
    }
    if !manifest.download.resumable {
        return Err("Gemma model download must be resumable".to_string());
    }
    if !manifest.model.id.contains("gemma-4-12b") {
        return Err("Gemma model manifest must pin the 12B model".to_string());
    }
    if manifest.model.parameters != "12B" {
        return Err("Gemma model manifest parameters must be 12B".to_string());
    }
    if manifest.model.format != "GGUF" {
        return Err("Gemma model artifact format must be GGUF".to_string());
    }
    if !manifest.model.quantization.contains("QAT") || !manifest.model.quantization.contains("Q4_0")
    {
        return Err("Gemma model quantization must be QAT Q4_0".to_string());
    }
    if !manifest.model.ollama_model.starts_with("hf.co/google/") {
        return Err("Gemma model must use the official Google Hugging Face Ollama id".to_string());
    }
    if manifest.model.runtime_model.trim().is_empty()
        || manifest.model.runtime_model == manifest.model.ollama_model
    {
        return Err(
            "Gemma model manifest must define a local Ollama runtime model name".to_string(),
        );
    }
    if manifest.model.artifact.file_name != "gemma-4-12b-it-qat-q4_0.gguf" {
        return Err("Gemma model manifest must pin the expected GGUF file name".to_string());
    }
    if !manifest.model.artifact.checksum_required || !is_sha256(&manifest.model.artifact.sha256) {
        return Err("Gemma model manifest must require a pinned SHA-256 checksum".to_string());
    }
    for action in REQUIRED_ACTIONS {
        if !manifest.actions.iter().any(|candidate| candidate == action) {
            return Err(format!("Gemma model manifest is missing action {action}"));
        }
    }
    for check_id in REQUIRED_READINESS_CHECKS {
        if !manifest
            .readiness_checks
            .iter()
            .any(|check| check.id == check_id && check.required)
        {
            return Err(format!(
                "Gemma model manifest is missing required readiness check {check_id}"
            ));
        }
    }
    Ok(())
}

fn windows_data_root() -> PathBuf {
    local_paths::data_root()
}

fn windows_config_root() -> PathBuf {
    local_paths::config_dir()
}

fn windows_runtime_root() -> PathBuf {
    if let Ok(root) = env::var("TOWNLIGHT_RUNTIME_ROOT") {
        return PathBuf::from(root);
    }
    local_paths::effective_locations()
        .map(|locations| PathBuf::from(locations.install_root))
        .unwrap_or_else(|_| {
            env::var("TOWNLIGHT_DESKTOP_STATE_DIR")
                .map(PathBuf::from)
                .unwrap_or_else(|_| {
                    env::var("LOCALAPPDATA")
                        .map(PathBuf::from)
                        .unwrap_or_else(|_| PathBuf::from("{local_app_data}"))
                        .join("CivicSuite")
                })
        })
}

fn model_path(artifact: &ArtifactDefinition) -> PathBuf {
    let mut path = windows_data_root();
    for part in artifact.relative_path.split('/') {
        path.push(part);
    }
    path
}

fn model_registry_path() -> PathBuf {
    windows_config_root().join("model-registry.json")
}

fn model_download_status_path() -> PathBuf {
    windows_config_root().join("model-download-status.json")
}

fn checksum_marker_path(local_path: &Path) -> PathBuf {
    let marker_name = format!(
        "{}.sha256.verified",
        local_path
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("model.gguf")
    );
    local_path.with_file_name(marker_name)
}

fn partial_download_path(local_path: &Path) -> PathBuf {
    local_path.with_extension("gguf.part")
}

fn runtime_modelfile_path(local_path: &Path) -> PathBuf {
    local_path.with_file_name("gemma-4-12b-it-qat-q4_0.Modelfile")
}

fn runtime_modelfile_contents(file_name: &str) -> String {
    format!(
        r#"FROM ./{file_name}
TEMPLATE """{{{{ if .System }}}}<start_of_turn>system
{{{{ .System }}}}<end_of_turn>
{{{{ end }}}}<start_of_turn>user
{{{{ .Prompt }}}}<end_of_turn>
<start_of_turn>model
{{{{ .Response }}}}"""
PARAMETER temperature 0.1
PARAMETER stop "<end_of_turn>"
PARAMETER stop "<start_of_turn>"
"#
    )
}

fn ollama_base_url() -> String {
    env::var("OLLAMA_BASE_URL")
        .unwrap_or_else(|_| DEFAULT_OLLAMA_BASE_URL.to_string())
        .trim_end_matches('/')
        .to_string()
}

fn ollama_tags_endpoint() -> String {
    format!("{}/api/tags", ollama_base_url())
}

fn ollama_host_env() -> String {
    ollama_base_url()
        .strip_prefix("http://")
        .unwrap_or(DEFAULT_OLLAMA_BASE_URL.trim_start_matches("http://"))
        .to_string()
}

fn bundled_ollama_path() -> PathBuf {
    windows_runtime_root()
        .join("runtime")
        .join("ollama")
        .join("ollama.exe")
}

// Resolve a known Windows system binary to its absolute path under %SystemRoot%
// instead of relying on PATH lookup (defense-in-depth against PATH hijacking).
#[cfg(windows)]
fn win_system_exe(relative: &str) -> PathBuf {
    let system_root = env::var("SystemRoot").unwrap_or_else(|_| "C:\\Windows".to_string());
    let mut path = PathBuf::from(system_root);
    for part in relative.split('\\') {
        path.push(part);
    }
    path
}

#[cfg(windows)]
fn powershell_exe() -> PathBuf {
    win_system_exe("System32\\WindowsPowerShell\\v1.0\\powershell.exe")
}

#[cfg(not(windows))]
fn powershell_exe() -> PathBuf {
    PathBuf::from("powershell.exe")
}

fn ollama_models_dir() -> PathBuf {
    windows_data_root().join("models").join("ollama")
}

fn ollama_executable() -> PathBuf {
    env::var("TOWNLIGHT_OLLAMA_PATH")
        .map(PathBuf::from)
        .unwrap_or_else(|_| {
            let bundled = bundled_ollama_path();
            if bundled.is_file() || cfg!(target_os = "windows") {
                bundled
            } else {
                // ponytail: last-resort PATH fallback; bundled ollama.exe is always preferred above.
                PathBuf::from("ollama")
            }
        })
}

fn parse_available_disk_override() -> Option<Result<u64, String>> {
    env::var("TOWNLIGHT_AVAILABLE_DISK_BYTES_OVERRIDE")
        .ok()
        .map(|value| {
            value.parse::<u64>().map_err(|error| {
                format!("Invalid TOWNLIGHT_AVAILABLE_DISK_BYTES_OVERRIDE value: {error}")
            })
        })
}

fn available_disk_bytes(path: &Path) -> Result<u64, String> {
    if let Some(override_value) = parse_available_disk_override() {
        return override_value;
    }
    if cfg!(target_os = "windows") {
        let literal_path = path.to_string_lossy().replace('\'', "''");
        let script = format!(
            "$item = Get-Item -LiteralPath '{}'; [int64]$item.PSDrive.Free",
            literal_path
        );
        let output = Command::new(powershell_exe())
            .arg("-NoProfile")
            .arg("-NonInteractive")
            .arg("-Command")
            .arg(script)
            .output()
            .map_err(|error| format!("Could not check available disk space: {error}"))?;
        if !output.status.success() {
            return Err(format!(
                "Could not check available disk space: {}",
                String::from_utf8_lossy(&output.stderr).trim()
            ));
        }
        return String::from_utf8_lossy(&output.stdout)
            .trim()
            .parse::<u64>()
            .map_err(|error| format!("Could not parse available disk space: {error}"));
    }
    let output = Command::new("df")
        .arg("-Pk")
        .arg(path)
        .output()
        .map_err(|error| format!("Could not check available disk space: {error}"))?;
    if !output.status.success() {
        return Err(format!(
            "Could not check available disk space: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        ));
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    let available_kb = stdout
        .lines()
        .nth(1)
        .and_then(|line| line.split_whitespace().nth(3))
        .ok_or_else(|| "Could not parse available disk space output".to_string())?
        .parse::<u64>()
        .map_err(|error| format!("Could not parse available disk space: {error}"))?;
    Ok(available_kb * 1024)
}

fn ensure_minimum_free_disk(path: &Path, minimum_free_disk_bytes: u64) -> Result<(), String> {
    let available = available_disk_bytes(path)?;
    if available < minimum_free_disk_bytes {
        return Err(format!(
            "The model download needs at least {minimum_free_disk_bytes} free bytes, but only {available} bytes are available."
        ));
    }
    Ok(())
}

fn parse_available_memory_override() -> Option<Result<u64, String>> {
    env::var("TOWNLIGHT_AVAILABLE_MEMORY_BYTES_OVERRIDE")
        .ok()
        .map(|value| {
            value.parse::<u64>().map_err(|error| {
                format!("Invalid TOWNLIGHT_AVAILABLE_MEMORY_BYTES_OVERRIDE value: {error}")
            })
        })
}

fn available_memory_bytes() -> Result<u64, String> {
    if let Some(override_value) = parse_available_memory_override() {
        return override_value;
    }
    if cfg!(target_os = "windows") {
        let script = "[int64]((Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory) * 1024";
        let output = Command::new(powershell_exe())
            .arg("-NoProfile")
            .arg("-NonInteractive")
            .arg("-Command")
            .arg(script)
            .output()
            .map_err(|error| format!("Could not check available memory: {error}"))?;
        if !output.status.success() {
            return Err(format!(
                "Could not check available memory: {}",
                String::from_utf8_lossy(&output.stderr).trim()
            ));
        }
        return String::from_utf8_lossy(&output.stdout)
            .trim()
            .parse::<u64>()
            .map_err(|error| format!("Could not parse available memory: {error}"));
    }
    // ponytail: only Windows is a shipping target; non-Windows reads /proc/meminfo MemAvailable.
    let meminfo = fs::read_to_string("/proc/meminfo")
        .map_err(|error| format!("Could not check available memory: {error}"))?;
    let available_kb = meminfo
        .lines()
        .find_map(|line| line.strip_prefix("MemAvailable:"))
        .and_then(|rest| rest.trim().split_whitespace().next())
        .ok_or_else(|| "Could not parse available memory output".to_string())?
        .parse::<u64>()
        .map_err(|error| format!("Could not parse available memory: {error}"))?;
    Ok(available_kb * 1024)
}

// Non-fatal RAM preflight: returns Some(warning) when available physical memory is
// below the model's approximate weight plus headroom. A probe failure is swallowed
// (returns None) so a flaky check never blocks the install.
fn ensure_minimum_free_memory(approximate_weight_memory_gb: f32) -> Option<String> {
    const MEMORY_HEADROOM_BYTES: u64 = 2 * 1024 * 1024 * 1024;
    let required =
        (approximate_weight_memory_gb as f64 * 1_073_741_824.0) as u64 + MEMORY_HEADROOM_BYTES;
    let available = available_memory_bytes().ok()?;
    if available < required {
        return Some(format!(
            "Low memory warning: the model needs roughly {required} bytes of free memory, but only {available} bytes are available. AI workflows may run slowly or fail to load."
        ));
    }
    None
}

fn ensure_parent_dir(path: &Path) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| format!("Could not resolve parent folder for {}", path.display()))?;
    fs::create_dir_all(parent)
        .map_err(|error| format!("Could not create {}: {error}", parent.display()))
}

fn checksum_marker_matches(local_path: &Path, expected_sha256: &str) -> bool {
    local_path.is_file()
        && std::fs::read_to_string(checksum_marker_path(local_path))
            .map(|value| value.trim().eq_ignore_ascii_case(expected_sha256))
            .unwrap_or(false)
}

fn http_get_text(endpoint: &str) -> Result<String, String> {
    let rest = endpoint.strip_prefix("http://").ok_or_else(|| {
        format!("Only local http endpoints are supported for model readiness: {endpoint}")
    })?;
    let (host_port, path) = rest.split_once('/').unwrap_or((rest, ""));
    let address = host_port
        .to_socket_addrs()
        .map_err(|error| format!("Could not resolve Ollama endpoint {host_port}: {error}"))?
        .next()
        .ok_or_else(|| format!("Could not resolve Ollama endpoint {host_port}"))?;
    let mut stream = TcpStream::connect_timeout(&address, Duration::from_millis(800))
        .map_err(|error| format!("Ollama is not responding at {endpoint}: {error}"))?;
    let _ = stream.set_read_timeout(Some(Duration::from_millis(800)));
    let request = format!("GET /{path} HTTP/1.1\r\nHost: {host_port}\r\nConnection: close\r\n\r\n");
    stream
        .write_all(request.as_bytes())
        .map_err(|error| format!("Could not query Ollama readiness: {error}"))?;
    let mut response = String::new();
    stream
        .read_to_string(&mut response)
        .map_err(|error| format!("Could not read Ollama readiness response: {error}"))?;
    let status_line = response.lines().next().unwrap_or_default();
    if !(status_line.starts_with("HTTP/1.1 2") || status_line.starts_with("HTTP/1.0 2")) {
        return Err(format!("Ollama readiness endpoint returned {status_line}"));
    }
    Ok(response
        .split_once("\r\n\r\n")
        .map(|(_, body)| body.to_string())
        .unwrap_or_default())
}

fn http_post_json_text(endpoint: &str, body: &str, timeout_millis: u64) -> Result<String, String> {
    let rest = endpoint.strip_prefix("http://").ok_or_else(|| {
        format!("Only local http endpoints are supported for model generation: {endpoint}")
    })?;
    let (host_port, path) = rest.split_once('/').unwrap_or((rest, ""));
    let address = host_port
        .to_socket_addrs()
        .map_err(|error| format!("Could not resolve Ollama endpoint {host_port}: {error}"))?
        .next()
        .ok_or_else(|| format!("Could not resolve Ollama endpoint {host_port}"))?;
    let timeout = Duration::from_millis(timeout_millis);
    let mut stream = TcpStream::connect_timeout(&address, timeout)
        .map_err(|error| format!("Ollama is not responding at {endpoint}: {error}"))?;
    let _ = stream.set_read_timeout(Some(timeout));
    let request = format!(
        "POST /{path} HTTP/1.1\r\nHost: {host_port}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.as_bytes().len()
    );
    stream
        .write_all(request.as_bytes())
        .map_err(|error| format!("Could not send local AI request: {error}"))?;
    let mut response = String::new();
    stream
        .read_to_string(&mut response)
        .map_err(|error| format!("Could not read local AI response: {error}"))?;
    let status_line = response.lines().next().unwrap_or_default();
    if !(status_line.starts_with("HTTP/1.1 2") || status_line.starts_with("HTTP/1.0 2")) {
        return Err(format!("Ollama generation endpoint returned {status_line}"));
    }
    decode_http_response_body(&response)
}

fn decode_http_response_body(response: &str) -> Result<String, String> {
    let (headers, body) = response
        .split_once("\r\n\r\n")
        .ok_or_else(|| "Could not find local AI response body.".to_string())?;
    let is_chunked = headers.lines().any(|line| {
        let lower = line.to_ascii_lowercase();
        lower.starts_with("transfer-encoding:") && lower.contains("chunked")
    });
    if !is_chunked {
        return Ok(body.to_string());
    }
    decode_chunked_http_body(body)
}

fn decode_chunked_http_body(body: &str) -> Result<String, String> {
    let bytes = body.as_bytes();
    let mut position = 0usize;
    let mut decoded = Vec::new();

    loop {
        let line_end = find_crlf(bytes, position)
            .ok_or_else(|| "Could not read local AI chunk size.".to_string())?;
        let size_text = std::str::from_utf8(&bytes[position..line_end])
            .map_err(|error| format!("Could not decode local AI chunk size: {error}"))?;
        let size_hex = size_text.split(';').next().unwrap_or_default().trim();
        let size = usize::from_str_radix(size_hex, 16)
            .map_err(|error| format!("Could not parse local AI chunk size {size_hex}: {error}"))?;
        position = line_end + 2;
        if size == 0 {
            break;
        }
        let chunk_end = position
            .checked_add(size)
            .ok_or_else(|| "Local AI response chunk size overflowed.".to_string())?;
        if chunk_end > bytes.len() {
            return Err("Local AI response ended before the chunk was complete.".to_string());
        }
        decoded.extend_from_slice(&bytes[position..chunk_end]);
        position = chunk_end;
        if bytes.get(position..position + 2) == Some(b"\r\n") {
            position += 2;
        } else {
            return Err("Local AI response chunk was missing its line ending.".to_string());
        }
    }

    String::from_utf8(decoded)
        .map_err(|error| format!("Could not decode local AI chunked response: {error}"))
}

fn find_crlf(bytes: &[u8], start: usize) -> Option<usize> {
    bytes
        .get(start..)?
        .windows(2)
        .position(|window| window == b"\r\n")
        .map(|offset| start + offset)
}

fn json_object_slice(body: &str) -> &str {
    match (body.find('{'), body.rfind('}')) {
        (Some(start), Some(end)) if start <= end => &body[start..=end],
        _ => body,
    }
}

fn parse_ollama_generate_text(body: &str) -> Result<String, String> {
    let mut generated = String::new();
    let mut parsed_any = false;

    for line in body.lines().map(str::trim).filter(|line| !line.is_empty()) {
        let json_text = if line.starts_with('{') {
            line
        } else {
            json_object_slice(line)
        };
        let payload: OllamaGenerateResponse = serde_json::from_str(json_text)
            .map_err(|error| format!("Could not parse local AI response: {error}"))?;
        parsed_any = true;
        if !payload.response.trim().is_empty() {
            generated.push_str(&payload.response);
        }
        if let Some(message) = payload.message {
            if !message.content.trim().is_empty() {
                generated.push_str(&message.content);
            }
        }
        if payload.done && !generated.trim().is_empty() {
            break;
        }
    }

    if parsed_any {
        return Ok(generated.trim().to_string());
    }

    let payload: OllamaGenerateResponse = serde_json::from_str(json_object_slice(body))
        .map_err(|error| format!("Could not parse local AI response: {error}"))?;
    if !payload.response.trim().is_empty() {
        return Ok(payload.response.trim().to_string());
    }
    Ok(payload
        .message
        .map(|message| message.content.trim().to_string())
        .unwrap_or_default())
}

fn parse_ollama_model_names(body: &str) -> Vec<String> {
    serde_json::from_str::<OllamaTagsResponse>(body)
        .map(|payload| {
            payload
                .models
                .into_iter()
                .flat_map(|tag| [tag.name, tag.model])
                .flatten()
                .filter(|name| !name.trim().is_empty())
                .collect()
        })
        .unwrap_or_default()
}

fn ollama_model_list_contains(body: &str, model_name: &str) -> bool {
    parse_ollama_model_names(body)
        .iter()
        .any(|candidate| candidate.eq_ignore_ascii_case(model_name))
}

fn probe_model_runtime(manifest: &ModelManifest) -> ModelRuntimeProbe {
    let endpoint = ollama_tags_endpoint();
    match http_get_text(&endpoint) {
        Ok(body) => {
            let model_available = ollama_model_list_contains(&body, &manifest.model.runtime_model);
            ModelRuntimeProbe {
                reachable: true,
                model_available,
                message: if model_available {
                    format!(
                        "Ollama is responding at {endpoint} and lists {}.",
                        manifest.model.runtime_model
                    )
                } else {
                    format!(
                        "Ollama is responding at {endpoint}, but {} is not loaded yet.",
                        manifest.model.runtime_model
                    )
                },
            }
        }
        Err(message) => ModelRuntimeProbe {
            reachable: false,
            model_available: false,
            message,
        },
    }
}

#[cfg(test)]
fn test_runtime_probe_from_env() -> Option<ModelRuntimeProbe> {
    match env::var("TOWNLIGHT_TEST_MODEL_RUNTIME_AFTER_START")
        .ok()
        .as_deref()
    {
        Some("reachable-empty") => Some(ModelRuntimeProbe {
            reachable: true,
            model_available: false,
            message: "test Ollama runtime is reachable without the pinned model".to_string(),
        }),
        Some("reachable-loaded") => Some(ModelRuntimeProbe {
            reachable: true,
            model_available: true,
            message: "test Ollama runtime is reachable with the pinned model".to_string(),
        }),
        Some("unreachable") => Some(ModelRuntimeProbe {
            reachable: false,
            model_available: false,
            message: "test Ollama runtime is not reachable".to_string(),
        }),
        _ => None,
    }
}

fn start_model_runtime_service() -> Result<String, String> {
    #[cfg(test)]
    if let Ok(value) = env::var("TOWNLIGHT_TEST_MODEL_RUNTIME_START") {
        return if value == "ok" {
            Ok("test model runtime start accepted".to_string())
        } else {
            Err(value)
        };
    }

    let install = crate::supervisor::supervisor_action("install", Some("model-runtime"))?;
    if !install.accepted {
        return Err(format!("{} {}", install.message, install.next_action));
    }
    let result = crate::supervisor::supervisor_action("start", Some("model-runtime"))?;
    if result.accepted {
        Ok(format!("{} {}", install.message, result.message))
    } else {
        Err(format!("{} {}", result.message, result.next_action))
    }
}

fn wait_for_model_runtime(manifest: &ModelManifest) -> ModelRuntimeProbe {
    #[cfg(test)]
    if let Some(probe) = test_runtime_probe_from_env() {
        return probe;
    }

    let mut latest = probe_model_runtime(manifest);
    for _ in 0..MODEL_RUNTIME_READY_ATTEMPTS {
        if latest.reachable {
            return latest;
        }
        thread::sleep(MODEL_RUNTIME_READY_INTERVAL);
        latest = probe_model_runtime(manifest);
    }
    latest
}

fn ensure_model_runtime_reachable(manifest: &ModelManifest) -> Result<ModelRuntimeProbe, String> {
    let runtime = probe_model_runtime(manifest);
    if runtime.reachable {
        return Ok(runtime);
    }

    let start_message = start_model_runtime_service().map_err(|error| {
        format!("Townlight could not start the bundled Ollama runtime. {error}")
    })?;
    let runtime = wait_for_model_runtime(manifest);
    if runtime.reachable {
        return Ok(runtime);
    }

    Err(format!(
        "The local Ollama runtime did not become ready after Townlight started it. Last health check: {} Start result: {}",
        runtime.message, start_message
    ))
}

fn sha256_file(local_path: &Path) -> Result<String, String> {
    let mut file = fs::File::open(local_path)
        .map_err(|error| format!("Could not open {}: {error}", local_path.display()))?;
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 1024 * 1024];
    loop {
        let read = file
            .read(&mut buffer)
            .map_err(|error| format!("Could not read {}: {error}", local_path.display()))?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

fn verify_file_checksum(
    local_path: &Path,
    expected_size_bytes: u64,
    expected_sha256: &str,
) -> Result<(), String> {
    let metadata = fs::metadata(local_path)
        .map_err(|error| format!("Could not inspect {}: {error}", local_path.display()))?;
    if !metadata.is_file() {
        return Err(format!("{} is not a model file", local_path.display()));
    }
    if metadata.len() != expected_size_bytes {
        return Err(format!(
            "Model file size is {}, expected {} bytes",
            metadata.len(),
            expected_size_bytes
        ));
    }
    let actual_sha256 = sha256_file(local_path)?;
    if !actual_sha256.eq_ignore_ascii_case(expected_sha256) {
        return Err(format!(
            "Model checksum mismatch: expected {expected_sha256}, got {actual_sha256}"
        ));
    }
    crate::atomic_io::atomic_write_bytes(
        &checksum_marker_path(local_path),
        format!("{expected_sha256}\n").as_bytes(),
    )
    .map_err(|error| format!("Could not record checksum marker: {error}"))
}

fn file_size_matches(local_path: &Path, expected_size_bytes: u64) -> bool {
    std::fs::metadata(local_path)
        .map(|metadata| metadata.is_file() && metadata.len() == expected_size_bytes)
        .unwrap_or(false)
}

fn verify_model_artifact(local_path: &Path, artifact: &ArtifactDefinition) -> Result<(), String> {
    verify_file_checksum(local_path, artifact.size_bytes, &artifact.sha256)
}

fn read_model_registry() -> Result<LocalModelRegistry, String> {
    let path = model_registry_path();
    if !path.is_file() {
        return Ok(LocalModelRegistry::default());
    }
    let contents = fs::read_to_string(&path)
        .map_err(|error| format!("Could not read model registry: {error}"))?;
    serde_json::from_str(&contents)
        .map_err(|error| format!("Could not parse model registry: {error}"))
}

fn write_model_registry(registry: &LocalModelRegistry) -> Result<(), String> {
    let path = model_registry_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Could not create model registry folder: {error}"))?;
    }
    crate::atomic_io::atomic_write_json(&path, registry)
}

fn file_size_or_zero(path: &Path) -> u64 {
    fs::metadata(path)
        .map(|metadata| {
            if metadata.is_file() {
                metadata.len()
            } else {
                0
            }
        })
        .unwrap_or(0)
}

fn read_model_download_state() -> Option<ModelDownloadState> {
    let path = model_download_status_path();
    if !path.is_file() {
        return None;
    }
    fs::read_to_string(path)
        .ok()
        .and_then(|contents| serde_json::from_str::<ModelDownloadState>(&contents).ok())
}

fn progress_percent(progress_bytes: u64, expected_size_bytes: u64) -> f64 {
    if expected_size_bytes == 0 {
        return 0.0;
    }
    let percent = (progress_bytes as f64 / expected_size_bytes as f64) * 100.0;
    let rounded = ((percent * 100.0).round() / 100.0).min(100.0);
    if progress_bytes > 0 && rounded == 0.0 {
        0.01
    } else {
        rounded
    }
}

fn current_model_download_state(manifest: &ModelManifest, local_path: &Path) -> ModelDownloadState {
    let partial_path = partial_download_path(local_path);
    let expected_size_bytes = manifest.model.artifact.size_bytes;
    let local_bytes = file_size_or_zero(local_path);
    let partial_bytes = file_size_or_zero(&partial_path);
    let persisted = read_model_download_state();
    let verified = model_artifact_verified(local_path, &manifest.model.artifact);
    let progress_bytes = if verified {
        expected_size_bytes
    } else if local_bytes > 0 {
        local_bytes
    } else {
        partial_bytes
    };

    let (status, message, last_error, updated_at_unix_seconds) = if verified {
        (
            "Verified".to_string(),
            "The pinned Gemma model file has passed checksum verification.".to_string(),
            None,
            persisted
                .as_ref()
                .map(|state| state.updated_at_unix_seconds)
                .unwrap_or(0),
        )
    } else if local_bytes == expected_size_bytes {
        (
            "Needs verification".to_string(),
            "The pinned Gemma model file is present and needs checksum verification.".to_string(),
            persisted
                .as_ref()
                .and_then(|state| state.last_error.clone()),
            persisted
                .as_ref()
                .map(|state| state.updated_at_unix_seconds)
                .unwrap_or(0),
        )
    } else if partial_bytes > 0 {
        (
            "Partial download".to_string(),
            "A partial Gemma model download is saved locally and can be resumed.".to_string(),
            persisted
                .as_ref()
                .and_then(|state| state.last_error.clone()),
            persisted
                .as_ref()
                .map(|state| state.updated_at_unix_seconds)
                .unwrap_or(0),
        )
    } else if let Some(state) = persisted
        .as_ref()
        .filter(|state| state.status == "Download failed")
    {
        (
            state.status.clone(),
            state.message.clone(),
            state.last_error.clone(),
            state.updated_at_unix_seconds,
        )
    } else {
        (
            "Not downloaded".to_string(),
            "No verified or partial Gemma model download is saved on this machine.".to_string(),
            None,
            persisted
                .as_ref()
                .map(|state| state.updated_at_unix_seconds)
                .unwrap_or(0),
        )
    };

    ModelDownloadState {
        schema_version: 1,
        model_id: manifest.model.id.clone(),
        status,
        message,
        local_path: local_path.to_string_lossy().to_string(),
        partial_path: partial_path.to_string_lossy().to_string(),
        expected_size_bytes,
        local_bytes,
        partial_bytes,
        progress_percent: progress_percent(progress_bytes, expected_size_bytes),
        last_error,
        updated_at_unix_seconds,
    }
}

fn write_model_download_state(
    manifest: &ModelManifest,
    local_path: &Path,
    status: &str,
    message: String,
    last_error: Option<String>,
) -> Result<(), String> {
    let mut state = current_model_download_state(manifest, local_path);
    state.status = status.to_string();
    state.message = message;
    state.last_error = last_error;
    state.updated_at_unix_seconds = now_unix_seconds();
    let path = model_download_status_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Could not create model download status folder: {error}"))?;
    }
    crate::atomic_io::atomic_write_json(&path, &state)
}

fn write_current_model_download_state(
    manifest: &ModelManifest,
    local_path: &Path,
) -> Result<(), String> {
    let mut state = current_model_download_state(manifest, local_path);
    state.updated_at_unix_seconds = now_unix_seconds();
    let path = model_download_status_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Could not create model download status folder: {error}"))?;
    }
    crate::atomic_io::atomic_write_json(&path, &state)
}

fn register_verified_model(manifest: &ModelManifest, local_path: &Path) -> Result<(), String> {
    let mut registry = read_model_registry()?;
    let entry = RegisteredModel {
        model_id: manifest.model.id.clone(),
        display_name: manifest.model.display_name.clone(),
        provider: manifest.model.provider.clone(),
        runtime: manifest.model.runtime.clone(),
        ollama_model: manifest.model.ollama_model.clone(),
        runtime_model: manifest.model.runtime_model.clone(),
        artifact_path: local_path.to_string_lossy().to_string(),
        sha256: manifest.model.artifact.sha256.clone(),
        registered_at_unix_seconds: now_unix_seconds(),
    };
    if let Some(existing) = registry
        .models
        .iter_mut()
        .find(|candidate| candidate.model_id == entry.model_id)
    {
        *existing = entry;
    } else {
        registry.models.push(entry);
    }
    write_model_registry(&registry)
}

fn verify_and_register_model_artifact(
    manifest: &ModelManifest,
    local_path: &Path,
) -> Result<(), String> {
    verify_model_artifact(local_path, &manifest.model.artifact)?;
    register_verified_model(manifest, local_path)?;
    write_model_download_state(
        manifest,
        local_path,
        "Verified",
        "The pinned Gemma model file passed checksum verification and is registered in the local model registry."
            .to_string(),
        None,
    )
}

fn load_model_into_runtime(manifest: &ModelManifest, local_path: &Path) -> Result<(), String> {
    if !model_artifact_verified(local_path, &manifest.model.artifact) {
        return Err(
            "The pinned Gemma model file must pass checksum verification before it can be loaded into Ollama."
                .to_string(),
        );
    }
    let runtime = ensure_model_runtime_reachable(manifest)?;
    if runtime.model_available {
        return Ok(());
    }
    let parent = local_path.parent().ok_or_else(|| {
        format!(
            "Could not resolve model folder for {}",
            local_path.display()
        )
    })?;
    let file_name = local_path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| {
            format!(
                "Could not resolve model file name for {}",
                local_path.display()
            )
        })?;
    let modelfile_path = runtime_modelfile_path(local_path);
    fs::write(&modelfile_path, runtime_modelfile_contents(file_name))
        .map_err(|error| format!("Could not write {}: {error}", modelfile_path.display()))?;
    let executable = ollama_executable();
    let status = Command::new(&executable)
        .arg("create")
        .arg(&manifest.model.runtime_model)
        .arg("-f")
        .arg(&modelfile_path)
        .env("OLLAMA_HOST", ollama_host_env())
        .env("OLLAMA_MODELS", ollama_models_dir())
        .current_dir(parent)
        .status()
        .map_err(|error| {
            format!(
                "Could not load {} with {}: {error}",
                manifest.model.runtime_model,
                executable.display()
            )
        })?;
    if !status.success() {
        return Err(format!(
            "Ollama could not load {} and exited with code {}.",
            manifest.model.runtime_model,
            status
                .code()
                .map(|code| code.to_string())
                .unwrap_or_else(|| "unknown".to_string())
        ));
    }
    let updated_runtime = probe_model_runtime(manifest);
    if !updated_runtime.model_available {
        return Err(format!(
            "Ollama finished the load command, but {} is still not listed by the local runtime.",
            manifest.model.runtime_model
        ));
    }
    Ok(())
}

fn model_registry_matches(manifest: &ModelManifest, local_path: &Path) -> bool {
    read_model_registry()
        .map(|registry| {
            registry.models.iter().any(|entry| {
                entry.model_id == manifest.model.id
                    && entry
                        .sha256
                        .eq_ignore_ascii_case(&manifest.model.artifact.sha256)
                    && entry.runtime_model == manifest.model.runtime_model
                    && entry.artifact_path == local_path.to_string_lossy().as_ref()
            })
        })
        .unwrap_or(false)
}

fn model_artifact_verified(local_path: &Path, artifact: &ArtifactDefinition) -> bool {
    file_size_matches(local_path, artifact.size_bytes)
        && checksum_marker_matches(local_path, &artifact.sha256)
}

pub(crate) fn local_model_artifact_verified() -> Result<bool, String> {
    #[cfg(test)]
    if env::var("TOWNLIGHT_TEST_MODEL_VERIFIED").ok().as_deref() == Some("1") {
        return Ok(true);
    }
    let manifest = parse_manifest()?;
    validate_manifest(&manifest)?;
    let local_path = model_path(&manifest.model.artifact);
    Ok(model_artifact_verified(
        &local_path,
        &manifest.model.artifact,
    ))
}

fn curl_executable() -> String {
    env::var("TOWNLIGHT_CURL_PATH").unwrap_or_else(|_| {
        #[cfg(windows)]
        {
            win_system_exe("System32\\curl.exe")
                .to_string_lossy()
                .into_owned()
        }
        #[cfg(not(windows))]
        {
            "curl".to_string()
        }
    })
}

fn run_model_download_curl(
    manifest: &ModelManifest,
    partial_path: &Path,
    resume: bool,
) -> Result<(), String> {
    #[cfg(test)]
    if let Ok(sequence) = env::var("TOWNLIGHT_TEST_MODEL_DOWNLOAD_SEQUENCE") {
        let attempt_path = partial_path.with_extension("attempt");
        if sequence == "corrupt-always" {
            fs::write(partial_path, b"zzz")
                .map_err(|error| format!("Could not write test corrupt model download: {error}"))?;
        } else if sequence == "corrupt-then-valid" && attempt_path.exists() {
            fs::write(partial_path, b"abc")
                .map_err(|error| format!("Could not write test model download: {error}"))?;
        } else if sequence == "corrupt-then-valid" {
            if let Some(parent) = attempt_path.parent() {
                fs::create_dir_all(parent)
                    .map_err(|error| format!("Could not create test model folder: {error}"))?;
            }
            fs::write(&attempt_path, b"1")
                .map_err(|error| format!("Could not write test model attempt: {error}"))?;
            fs::write(partial_path, b"zzz")
                .map_err(|error| format!("Could not write test corrupt model download: {error}"))?;
        } else {
            return Err(format!(
                "Unsupported test model download sequence: {sequence}"
            ));
        }
        return Ok(());
    }

    let mut command = Command::new(curl_executable());
    command
        .arg("-L")
        .arg("--fail")
        .arg("--retry")
        .arg("3")
        .arg("--retry-all-errors");
    if resume {
        command.arg("--continue-at").arg("-");
    }
    let status = command
        .arg("--output")
        .arg(partial_path)
        .arg(&manifest.model.resolve_url)
        .status()
        .map_err(|error| format!("Could not start the model download: {error}"))?;
    if !status.success() {
        return Err(format!(
            "Model download failed with exit code {}",
            status
                .code()
                .map(|code| code.to_string())
                .unwrap_or_else(|| "unknown".to_string())
        ));
    }
    Ok(())
}

fn remove_invalid_partial(partial_path: &Path, reason: &str) -> Result<(), String> {
    match fs::remove_file(partial_path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(format!(
            "Could not remove invalid partial model download after {reason}: {error}"
        )),
    }
}

fn finalize_partial_download(
    manifest: &ModelManifest,
    local_path: &Path,
    partial_path: &Path,
) -> Result<bool, String> {
    let metadata = match fs::metadata(partial_path) {
        Ok(metadata) if metadata.is_file() => metadata,
        _ => return Ok(false),
    };
    let expected_size = manifest.model.artifact.size_bytes;
    let partial_size = metadata.len();
    if partial_size < expected_size {
        return Ok(false);
    }

    if partial_size > expected_size {
        let file = fs::OpenOptions::new()
            .write(true)
            .open(partial_path)
            .map_err(|error| {
                format!("Could not open oversized partial model download for repair: {error}")
            })?;
        file.set_len(expected_size).map_err(|error| {
            format!("Could not trim oversized partial model download for repair: {error}")
        })?;
    }

    let actual_sha256 = sha256_file(partial_path)?;
    if !actual_sha256.eq_ignore_ascii_case(&manifest.model.artifact.sha256) {
        remove_invalid_partial(
            partial_path,
            "its checksum did not match the pinned Gemma model",
        )?;
        return Ok(false);
    }

    if local_path.exists() {
        fs::remove_file(local_path)
            .map_err(|error| format!("Could not replace old model file: {error}"))?;
    }
    fs::rename(partial_path, local_path)
        .map_err(|error| format!("Could not move verified model into place: {error}"))?;
    verify_and_register_model_artifact(manifest, local_path)?;
    Ok(true)
}

fn download_model_artifact_inner(
    manifest: &ModelManifest,
    local_path: &Path,
) -> Result<(), String> {
    if checksum_marker_matches(local_path, &manifest.model.artifact.sha256) {
        register_verified_model(manifest, local_path)?;
        write_model_download_state(
            manifest,
            local_path,
            "Verified",
            "The pinned Gemma model file has already passed checksum verification and is registered in the local model registry.".to_string(),
            None,
        )?;
        return Ok(());
    }
    ensure_parent_dir(local_path)?;
    let parent = local_path.parent().ok_or_else(|| {
        format!(
            "Could not resolve parent folder for {}",
            local_path.display()
        )
    })?;
    ensure_minimum_free_disk(parent, manifest.download.minimum_free_disk_bytes)?;
    if let Some(warning) = ensure_minimum_free_memory(manifest.model.approximate_weight_memory_gb) {
        // Non-fatal: record the low-memory warning but keep installing.
        let _ = write_model_download_state(manifest, local_path, "Downloading", warning, None);
    }
    let partial_path = partial_download_path(local_path);
    if finalize_partial_download(manifest, local_path, &partial_path)? {
        return Ok(());
    }
    write_model_download_state(
        manifest,
        local_path,
        "Downloading",
        "Townlight is downloading the pinned Gemma model file. Closing the app keeps the partial file for resume."
            .to_string(),
        None,
    )?;
    let resume = matches!(
        fs::metadata(&partial_path).map(|metadata| metadata.len()),
        Ok(size) if size > 0 && size < manifest.model.artifact.size_bytes
    );
    run_model_download_curl(manifest, &partial_path, resume)?;
    if finalize_partial_download(manifest, local_path, &partial_path)? {
        return Ok(());
    }
    if !partial_path.exists() {
        write_model_download_state(
            manifest,
            local_path,
            "Downloading",
            "Townlight is retrying the pinned Gemma model download from the beginning after discarding an invalid full-size file."
                .to_string(),
            None,
        )?;
        run_model_download_curl(manifest, &partial_path, false)?;
        if finalize_partial_download(manifest, local_path, &partial_path)? {
            return Ok(());
        }
        if !partial_path.exists() {
            return Err(
                "Model download reached the pinned size, but checksum verification did not pass. The invalid file was discarded; retry will start a clean download."
                    .to_string(),
            );
        }
    }
    let downloaded_size = fs::metadata(&partial_path)
        .map_err(|error| format!("Could not inspect downloaded model: {error}"))?
        .len();
    if downloaded_size > manifest.model.artifact.size_bytes {
        remove_invalid_partial(&partial_path, "it was larger than the pinned model size")?;
        write_model_download_state(
            manifest,
            local_path,
            "Downloading",
            "Townlight is retrying the pinned Gemma model download from the beginning after discarding an invalid partial file."
                .to_string(),
            None,
        )?;
        run_model_download_curl(manifest, &partial_path, false)?;
        if finalize_partial_download(manifest, local_path, &partial_path)? {
            return Ok(());
        }
    } else if downloaded_size == manifest.model.artifact.size_bytes {
        return Err(
            "Model download finished at the pinned size, but checksum verification did not pass."
                .to_string(),
        );
    }
    let final_size = file_size_or_zero(&partial_path);
    Err(format!(
        "Model download is incomplete: got {final_size}, expected {} bytes",
        manifest.model.artifact.size_bytes
    ))
}

fn download_model_artifact(manifest: &ModelManifest, local_path: &Path) -> Result<(), String> {
    let result = download_model_artifact_inner(manifest, local_path);
    if let Err(message) = &result {
        let _ = write_model_download_state(
            manifest,
            local_path,
            "Download failed",
            "The Gemma model download did not complete. The saved partial file can be resumed."
                .to_string(),
            Some(message.clone()),
        );
    }
    result
}

fn readiness_items(
    manifest: &ModelManifest,
    local_path: &Path,
    runtime: &ModelRuntimeProbe,
) -> Vec<ModelReadinessItem> {
    manifest
        .readiness_checks
        .iter()
        .map(|check| {
            let (ok, status, message) = match check.id.as_str() {
                "metadata" => (
                    true,
                    "OK",
                    format!(
                        "{} is pinned with official source metadata and checksum requirements.",
                        manifest.model.display_name
                    ),
                ),
                "artifact-file" => {
                    if file_size_matches(local_path, manifest.model.artifact.size_bytes) {
                        (
                            true,
                            "Found",
                            "The pinned GGUF file exists with the expected size in the local Townlight data folder."
                                .to_string(),
                        )
                    } else {
                        (
                            false,
                            "Needs download",
                            "The pinned GGUF file is not present with the expected size on this machine yet.".to_string(),
                        )
                    }
                }
                "checksum" => {
                    if checksum_marker_matches(local_path, &manifest.model.artifact.sha256) {
                        (
                            true,
                            "Verified",
                            "Checksum verification has been recorded for the pinned file."
                                .to_string(),
                        )
                    } else {
                        (
                            false,
                            "Needs verification",
                            format!(
                                "The model must match SHA-256 {} before AI workflows can run.",
                                manifest.model.artifact.sha256
                            ),
                        )
                    }
                }
                "runtime" => {
                    if runtime.reachable {
                        (true, "OK", runtime.message.clone())
                    } else {
                        (false, "Needs start", runtime.message.clone())
                    }
                }
                "runtime-model" => {
                    if runtime.model_available {
                        (
                            true,
                            "Loaded",
                            format!(
                                "{} is available to the local Ollama runtime.",
                                manifest.model.runtime_model
                            ),
                        )
                    } else if runtime.reachable {
                        (false, "Needs load", runtime.message.clone())
                    } else {
                        (
                            false,
                            "Needs runtime",
                            "Start the bundled Ollama runtime before loading the Gemma model."
                                .to_string(),
                        )
                    }
                }
                "registered-model" => {
                    if model_artifact_verified(local_path, &manifest.model.artifact)
                        && model_registry_matches(manifest, local_path)
                    {
                        (
                            true,
                            "Registered",
                            "A local registry entry exists for this verified model."
                                .to_string(),
                        )
                    } else {
                        (
                            false,
                            "Needs registration",
                            "No local registry entry exists for this verified model yet."
                                .to_string(),
                        )
                    }
                }
                _ => (
                    false,
                    "Unknown",
                    "This readiness check is not recognized by the desktop shell.".to_string(),
                ),
            };

            ModelReadinessItem {
                id: check.id.clone(),
                label: check.label.clone(),
                ok,
                status,
                message,
                next_action: check.next_action.clone(),
            }
        })
        .collect()
}

fn readiness_check_ok(checks: &[ModelReadinessItem], check_id: &str) -> bool {
    checks
        .iter()
        .find(|check| check.id == check_id)
        .map(|check| check.ok)
        .unwrap_or(false)
}

fn model_overall_status(
    checks: &[ModelReadinessItem],
    download_state: &ModelDownloadState,
) -> &'static str {
    if checks.iter().all(|check| check.ok) {
        return "Ready";
    }
    match download_state.status.as_str() {
        "Download failed" => return "Download failed",
        "Partial download" => return "Partial download",
        _ => {}
    }
    if !readiness_check_ok(checks, "artifact-file") {
        return "Needs download";
    }
    if !readiness_check_ok(checks, "checksum") {
        return "Needs verification";
    }
    if !readiness_check_ok(checks, "runtime") {
        return "Needs runtime";
    }
    if !readiness_check_ok(checks, "runtime-model") {
        return "Needs load";
    }
    if !readiness_check_ok(checks, "registered-model") {
        return "Needs registration";
    }
    "Needs attention"
}

pub fn model_state() -> Result<ModelState, String> {
    let manifest = parse_manifest()?;
    validate_manifest(&manifest)?;
    let local_path = model_path(&manifest.model.artifact);
    let runtime = probe_model_runtime(&manifest);
    let checks = readiness_items(&manifest, &local_path, &runtime);
    let download_state = current_model_download_state(&manifest, &local_path);
    let ready = checks.iter().all(|check| check.ok);
    let status = model_overall_status(&checks, &download_state);

    Ok(ModelState {
        profile: manifest.profile,
        local_only: manifest.local_only,
        ready,
        status,
        display_name: manifest.model.display_name,
        model_id: manifest.model.id,
        provider: manifest.model.provider,
        source_repo: manifest.model.source_repo,
        source_url: manifest.model.source_url,
        resolve_url: manifest.model.resolve_url,
        documentation_url: manifest.model.documentation_url,
        license: manifest.model.license,
        runtime: manifest.model.runtime,
        ollama_model: manifest.model.ollama_model,
        runtime_model: manifest.model.runtime_model,
        format: manifest.model.format,
        quantization: manifest.model.quantization,
        parameters: manifest.model.parameters,
        context_window_tokens: manifest.model.context_window_tokens,
        approximate_weight_memory_gb: manifest.model.approximate_weight_memory_gb,
        download_size_bytes: manifest.model.artifact.size_bytes,
        download_resumable: manifest.download.resumable,
        download_requires_consent: manifest.download.requires_user_consent,
        download_policy: manifest.download.network_policy,
        minimum_free_disk_bytes: manifest.download.minimum_free_disk_bytes,
        artifact: ModelArtifact {
            file_name: manifest.model.artifact.file_name,
            local_path: local_path.to_string_lossy().to_string(),
            expected_size_bytes: manifest.model.artifact.size_bytes,
            expected_sha256: manifest.model.artifact.sha256,
            checksum_required: manifest.model.artifact.checksum_required,
            checksum_source: manifest.model.artifact.checksum_source,
            etag_blob_id: manifest.model.artifact.etag_blob_id,
        },
        download_state,
        checks,
        next_action: "Use first-run setup to download, resume, and verify the pinned local model."
            .to_string(),
    })
}

pub(crate) fn local_model_ready() -> Result<bool, String> {
    Ok(model_state()?.ready)
}

/// Whether an AI-generation call would succeed right now. Handlers that branch
/// AI-vs-deterministic-fallback must use this instead of local_model_ready()
/// directly: the TOWNLIGHT_FAKE_MODEL_RESPONSE test seam fires inside
/// generate_local_text() before its readiness check, so a fallback branch keyed
/// on raw readiness alone could never reach the AI path under cargo test (a
/// temp state dir is never model-ready).
pub(crate) fn local_generation_available() -> Result<bool, String> {
    if cfg!(test) {
        if let Ok(fake_response) = env::var("TOWNLIGHT_FAKE_MODEL_RESPONSE") {
            if !fake_response.trim().is_empty() {
                return Ok(true);
            }
        }
        if let Ok(fake_error) = env::var("TOWNLIGHT_FAKE_MODEL_ERROR") {
            if !fake_error.trim().is_empty() {
                return Ok(true);
            }
        }
    }
    local_model_ready()
}

pub(crate) fn pinned_runtime_model() -> Result<String, String> {
    let manifest = parse_manifest()?;
    validate_manifest(&manifest)?;
    Ok(manifest.model.runtime_model)
}

fn local_generation_prompt(prompt: &str) -> String {
    format!(
        "{prompt}\n\nReturn a concise staff-review draft in under 180 words. Use plain text only. Do not include hidden reasoning or analysis."
    )
}

fn local_generation_request_body(runtime_model: &str, prompt: &str) -> String {
    // Use Ollama's /api/chat so the model's OWN chat template AND its
    // architecture parser (this pinned model loads with RENDERER/PARSER
    // "gemma4") are applied. The previous /api/generate + raw:true +
    // hand-built <start_of_turn> turn format BYPASSED that parser, so the
    // model's internal control tokens (e.g. <|channel>) leaked into the
    // output and every draft came back as garbage or an echo -- verified
    // live against the real model in Phase D (chat -> clean rewrite/
    // translation/analysis; raw:true -> digit spam). No manual turn markers
    // and no stop tokens here: the chat template + parser own turn
    // boundaries. think:false keeps any reasoning channel out of content.
    serde_json::json!({
        "model": runtime_model,
        "messages": [
            { "role": "user", "content": local_generation_prompt(prompt) }
        ],
        "think": false,
        "stream": false,
        "options": {
            "temperature": 0.2,
            "num_predict": LOCAL_GENERATION_NUM_PREDICT,
            "num_ctx": LOCAL_GENERATION_NUM_CTX
        }
    })
    .to_string()
}

pub(crate) fn generate_local_text(prompt: &str) -> Result<(String, String), String> {
    let manifest = parse_manifest()?;
    validate_manifest(&manifest)?;
    let runtime_model = manifest.model.runtime_model.clone();
    if cfg!(test) {
        if let Ok(fake_response) = env::var("TOWNLIGHT_FAKE_MODEL_RESPONSE") {
            if !fake_response.trim().is_empty() {
                return Ok((runtime_model, fake_response.trim().to_string()));
            }
        }
        // Mirrors the success seam for the ready-then-fails arms: the engine
        // reports available (local_generation_available honors this var too),
        // then generation fails mid-flight -- the only way cargo tests can
        // reach the handlers' generation-failure branches (a real not-ready
        // state is caught by the availability probe before generate is called).
        if let Ok(fake_error) = env::var("TOWNLIGHT_FAKE_MODEL_ERROR") {
            if !fake_error.trim().is_empty() {
                return Err(fake_error.trim().to_string());
            }
        }
    }
    if !model_state()?.ready {
        return Err(
            "Local AI model is not ready. Download, verify, and load the pinned Gemma model before generating drafts."
                .to_string(),
        );
    }
    let body = local_generation_request_body(runtime_model.as_str(), prompt);
    let endpoint = format!("{}/api/chat", ollama_base_url());
    let response = http_post_json_text(&endpoint, &body, LOCAL_GENERATION_TIMEOUT_MILLIS)?;
    let generated = parse_ollama_generate_text(&response)?;
    if generated.is_empty() {
        return Err("Local AI returned an empty draft.".to_string());
    }
    Ok((runtime_model, generated))
}

pub fn model_action(action: &str) -> Result<ModelActionResult, String> {
    let manifest = parse_manifest()?;
    validate_manifest(&manifest)?;
    if !manifest.actions.iter().any(|candidate| candidate == action) {
        return Err(format!("Unsupported model action: {action}"));
    }
    let local_path = model_path(&manifest.model.artifact);

    let result = match action {
        "open-model-folder" => {
            let folder = local_path
                .parent()
                .ok_or_else(|| {
                    format!(
                        "Could not resolve model folder for {}",
                        local_path.display()
                    )
                })
                .and_then(crate::local_shell::open_local_folder);
            folder.map(|()| {
                (
                    "Ready",
                    "The local model folder is open.".to_string(),
                    "Place or download the pinned GGUF file there, then verify checksum."
                        .to_string(),
                )
            })
        }
        "verify-checksum" => verify_and_register_model_artifact(&manifest, &local_path).map(|()| {
            (
                "Verified",
                "The local Gemma model file matches the pinned size and SHA-256.".to_string(),
                "Start the bundled model runtime before staff workflows use local AI.".to_string(),
            )
        }),
        "load-runtime-model" => load_model_into_runtime(&manifest, &local_path).map(|()| {
            (
                "Loaded",
                "The pinned Gemma model is available through the local Ollama runtime.".to_string(),
                "Run final System Health verification before staff workflows use local AI."
                    .to_string(),
            )
        }),
        "download" | "resume-download" | "retry" => download_model_artifact(&manifest, &local_path)
            .map(|()| {
                (
                    "Verified",
                    "The pinned Gemma model downloaded and passed checksum verification."
                        .to_string(),
                    "Start the bundled model runtime before staff workflows use local AI."
                        .to_string(),
                )
            }),
        _ => Err(format!("Unsupported model action: {action}")),
    };

    match result {
        Ok((status, message, next_action)) => Ok(ModelActionResult {
            accepted: true,
            action: action.to_string(),
            status,
            message,
            next_action,
        }),
        Err(message) => Ok(ModelActionResult {
            accepted: false,
            action: action.to_string(),
            status: "Needs attention",
            message,
            next_action:
                "Check the model file, network connection, and available disk space, then retry."
                    .to_string(),
        }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn manifest_pins_gemma4_12b_qat_gguf() {
        let manifest = parse_manifest().expect("manifest parses");
        validate_manifest(&manifest).expect("manifest validates");
        assert_eq!(manifest.model.parameters, "12B");
        assert_eq!(manifest.model.format, "GGUF");
        assert!(manifest.model.quantization.contains("QAT"));
        assert!(manifest.model.quantization.contains("Q4_0"));
        assert_eq!(
            manifest.model.artifact.file_name,
            "gemma-4-12b-it-qat-q4_0.gguf"
        );
        assert!(manifest
            .model
            .ollama_model
            .contains("gemma-4-12B-it-qat-q4_0-gguf"));
        assert_eq!(
            manifest.model.runtime_model,
            "townlight-gemma4-12b-qat:q4_0"
        );
    }

    #[test]
    fn manifest_requires_checksum_and_explicit_download() {
        let manifest = parse_manifest().expect("manifest parses");
        assert!(!manifest.download.automatic);
        assert!(manifest.download.resumable);
        assert!(manifest.download.requires_user_consent);
        assert!(manifest.model.artifact.checksum_required);
        assert!(is_sha256(&manifest.model.artifact.sha256));
        assert!(manifest
            .actions
            .iter()
            .any(|action| action == "load-runtime-model"));
        assert!(manifest
            .readiness_checks
            .iter()
            .any(|check| check.id == "runtime-model" && check.required));
    }

    #[test]
    fn local_generation_request_uses_chat_api_through_model_parser() {
        let body = local_generation_request_body(
            "townlight-gemma4-12b-qat:q4_0",
            "Draft a staff response for marker D100-AI-MODEL-MARKER-20260620.",
        );
        let payload: serde_json::Value = serde_json::from_str(&body).expect("valid json");

        assert_eq!(payload["model"], "townlight-gemma4-12b-qat:q4_0");
        assert_eq!(payload["stream"], false);
        // /api/chat, NOT raw /api/generate: the model's own template + parser
        // must run, so no raw flag, no hand-built turn markers, no stop tokens.
        assert!(payload.get("raw").is_none());
        assert!(payload.get("prompt").is_none());
        assert!(payload["options"].get("stop").is_none());
        assert_eq!(payload["think"], false);
        assert_eq!(payload["options"]["temperature"], 0.2);
        assert_eq!(payload["options"]["num_predict"], 512);
        assert_eq!(payload["options"]["num_ctx"], 8192);
        let messages = payload["messages"].as_array().expect("messages array");
        assert_eq!(messages.len(), 1);
        assert_eq!(messages[0]["role"], "user");
        let content = messages[0]["content"].as_str().expect("content string");
        assert!(!content.contains("<start_of_turn>"));
        assert!(content.contains("under 180 words"));
        assert!(content.contains("D100-AI-MODEL-MARKER-20260620"));
    }

    #[test]
    fn runtime_modelfile_uses_gemma_instruction_template() {
        let contents = runtime_modelfile_contents("gemma-4-12b-it-qat-q4_0.gguf");

        assert!(contents.contains("FROM ./gemma-4-12b-it-qat-q4_0.gguf"));
        assert!(contents.contains("TEMPLATE"));
        assert!(contents.contains("<start_of_turn>user"));
        assert!(contents.contains("<start_of_turn>model"));
        assert!(contents.contains("PARAMETER stop \"<end_of_turn>\""));
    }

    #[test]
    fn ollama_generate_parser_accepts_non_streaming_response_text() {
        let body = r#"{"model":"townlight-gemma4-12b-qat:q4_0","response":"Draft ready for review.","done":true}"#;

        let parsed = parse_ollama_generate_text(body).expect("parse response");

        assert_eq!(parsed, "Draft ready for review.");
    }

    #[test]
    fn ollama_generate_parser_accepts_message_content_shape() {
        let body = r#"{"model":"townlight-gemma4-12b-qat:q4_0","message":{"role":"assistant","content":"Guidance draft ready."},"done":true}"#;

        let parsed = parse_ollama_generate_text(body).expect("parse response");

        assert_eq!(parsed, "Guidance draft ready.");
    }

    #[test]
    fn ollama_generate_parser_combines_streamed_json_lines() {
        let body = concat!(
            r#"{"response":"Minutes ","done":false}"#,
            "\n",
            r#"{"response":"draft ready.","done":true}"#
        );

        let parsed = parse_ollama_generate_text(body).expect("parse streamed response");

        assert_eq!(parsed, "Minutes draft ready.");
    }

    #[test]
    fn ollama_generate_parser_preserves_empty_output_detection() {
        let body = r#"{"model":"townlight-gemma4-12b-qat:q4_0","done":true}"#;

        let parsed = parse_ollama_generate_text(body).expect("parse empty response");

        assert_eq!(parsed, "");
    }

    #[test]
    fn http_response_body_decodes_chunked_ollama_json() {
        let body = r#"{"response":"Draft from chunked response.","done":true}"#;
        let response = format!(
            "HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n{:x}\r\n{}\r\n0\r\n\r\n",
            body.len(),
            body
        );

        let decoded = decode_http_response_body(&response).expect("decode chunked body");
        let parsed = parse_ollama_generate_text(&decoded).expect("parse decoded body");

        assert_eq!(parsed, "Draft from chunked response.");
    }

    #[test]
    fn http_response_body_preserves_plain_json_body() {
        let response =
            "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n\r\n{\"response\":\"Plain body.\"}";

        let decoded = decode_http_response_body(response).expect("decode plain body");

        assert_eq!(decoded, "{\"response\":\"Plain body.\"}");
    }

    #[test]
    fn model_state_blocks_missing_runtime_and_registry() {
        with_temp_state_dir(|_| {
            let state = model_state().expect("state builds from manifest");
            assert_eq!(state.display_name, "Gemma 4 12B QAT Q4_0");
            assert!(!state.ready);
            assert_eq!(state.status, "Needs download");
            assert!(state
                .checks
                .iter()
                .any(|check| check.id == "runtime" && !check.ok));
            assert!(state
                .checks
                .iter()
                .any(|check| check.id == "registered-model" && !check.ok));
            assert!(state
                .checks
                .iter()
                .any(|check| check.id == "runtime-model" && !check.ok));
        });
    }

    #[test]
    fn local_generation_available_honors_fake_seam_and_fresh_state() {
        with_temp_state_dir(|_| {
            env::remove_var("TOWNLIGHT_FAKE_MODEL_RESPONSE");
            assert!(!local_generation_available().expect("readiness computes"));
            env::set_var("TOWNLIGHT_FAKE_MODEL_RESPONSE", "Fake local draft.");
            assert!(local_generation_available().expect("fake seam counts as available"));
            env::remove_var("TOWNLIGHT_FAKE_MODEL_RESPONSE");
            assert!(!local_generation_available().expect("readiness computes again"));
        });
    }

    #[test]
    fn model_checksum_action_reports_missing_file_without_downloading() {
        with_temp_state_dir(|_| {
            let result = model_action("verify-checksum").expect("action response is structured");
            assert!(!result.accepted);
            assert_eq!(result.status, "Needs attention");
            assert!(result.message.contains("Could not inspect"));
        });
    }

    #[test]
    fn model_download_checks_free_disk_before_network() {
        with_temp_state_dir(|_| {
            env::set_var("TOWNLIGHT_AVAILABLE_DISK_BYTES_OVERRIDE", "1");
            let result = model_action("download").expect("action response is structured");
            env::remove_var("TOWNLIGHT_AVAILABLE_DISK_BYTES_OVERRIDE");
            assert!(!result.accepted);
            assert_eq!(result.status, "Needs attention");
            assert!(result.message.contains("needs at least 15000000000"));
        });
    }

    #[cfg(windows)]
    #[test]
    fn win_system_exe_builds_absolute_path_under_system_root() {
        env::set_var("SystemRoot", "C:\\Windows");
        let path = win_system_exe("System32\\curl.exe");
        env::remove_var("SystemRoot");
        assert!(path.is_absolute());
        assert!(path.starts_with("C:\\Windows"));
        assert!(path.ends_with("curl.exe"));
    }

    #[test]
    fn memory_preflight_warns_below_floor_and_passes_above() {
        // approximate_weight_memory_gb (6.7) + 2GB headroom ~= 9.3GB required.
        env::set_var("TOWNLIGHT_AVAILABLE_MEMORY_BYTES_OVERRIDE", "1000000000");
        let warning = ensure_minimum_free_memory(6.7);
        env::remove_var("TOWNLIGHT_AVAILABLE_MEMORY_BYTES_OVERRIDE");
        assert!(warning
            .as_deref()
            .unwrap_or_default()
            .contains("Low memory warning"));

        env::set_var("TOWNLIGHT_AVAILABLE_MEMORY_BYTES_OVERRIDE", "32000000000");
        let ok = ensure_minimum_free_memory(6.7);
        env::remove_var("TOWNLIGHT_AVAILABLE_MEMORY_BYTES_OVERRIDE");
        assert!(ok.is_none());
    }

    #[test]
    fn model_download_reports_missing_downloader() {
        with_temp_state_dir(|root| {
            env::set_var("TOWNLIGHT_AVAILABLE_DISK_BYTES_OVERRIDE", "99999999999");
            env::set_var(
                "TOWNLIGHT_CURL_PATH",
                root.join("missing-curl.exe").to_string_lossy().to_string(),
            );
            let result = model_action("download").expect("action response is structured");
            env::remove_var("TOWNLIGHT_AVAILABLE_DISK_BYTES_OVERRIDE");
            env::remove_var("TOWNLIGHT_CURL_PATH");
            assert!(!result.accepted);
            assert_eq!(result.status, "Needs attention");
            assert!(result
                .message
                .contains("Could not start the model download"));
        });
    }

    #[test]
    fn model_download_failure_persists_status_for_resume() {
        with_temp_state_dir(|root| {
            env::set_var("TOWNLIGHT_AVAILABLE_DISK_BYTES_OVERRIDE", "99999999999");
            env::set_var(
                "TOWNLIGHT_CURL_PATH",
                root.join("missing-curl.exe").to_string_lossy().to_string(),
            );

            let result = model_action("download").expect("action response is structured");

            env::remove_var("TOWNLIGHT_AVAILABLE_DISK_BYTES_OVERRIDE");
            env::remove_var("TOWNLIGHT_CURL_PATH");

            assert!(!result.accepted);
            assert!(root
                .join("config")
                .join("model-download-status.json")
                .is_file());

            let state = model_state().expect("model state");
            assert_eq!(state.status, "Download failed");
            assert_eq!(state.download_state.status, "Download failed");
            assert!(state
                .download_state
                .last_error
                .unwrap_or_default()
                .contains("Could not start the model download"));
        });
    }

    #[test]
    fn model_state_reports_partial_download_progress() {
        with_temp_state_dir(|root| {
            let manifest = parse_manifest().expect("manifest parses");
            let local_path = model_path(&manifest.model.artifact);
            let partial_path = partial_download_path(&local_path);
            fs::create_dir_all(partial_path.parent().expect("partial parent")).expect("mkdir");
            fs::write(&partial_path, vec![7_u8; 4096]).expect("partial write");

            let state = model_state().expect("model state");

            assert_eq!(state.download_state.status, "Partial download");
            assert_eq!(state.status, "Partial download");
            assert_eq!(state.download_state.partial_bytes, 4096);
            assert!(state.download_state.progress_percent > 0.0);
            assert!(state.download_state.message.contains("can be resumed"));
            assert_eq!(
                state.download_state.partial_path,
                root.join("Data")
                    .join("models")
                    .join("gemma-4-12b-it-qat-q4_0.gguf.part")
                    .to_string_lossy()
                    .to_string()
            );
        });
    }

    #[test]
    fn model_state_caps_oversized_partial_progress() {
        with_temp_state_dir(|_| {
            let manifest = parse_manifest().expect("manifest parses");
            let local_path = model_path(&manifest.model.artifact);
            let partial_path = partial_download_path(&local_path);
            fs::create_dir_all(partial_path.parent().expect("partial parent")).expect("mkdir");
            let file = fs::OpenOptions::new()
                .create(true)
                .write(true)
                .open(&partial_path)
                .expect("partial file");
            file.set_len(manifest.model.artifact.size_bytes + 1024)
                .expect("oversized sparse partial");

            let state = model_state().expect("model state");

            assert_eq!(state.download_state.status, "Partial download");
            assert_eq!(state.download_state.progress_percent, 100.0);
            assert_eq!(
                state.download_state.partial_bytes,
                manifest.model.artifact.size_bytes + 1024
            );
        });
    }

    #[test]
    fn oversized_valid_partial_is_repaired_and_registered() {
        with_temp_state_dir(|_| {
            let mut manifest = parse_manifest().expect("manifest parses");
            manifest.model.artifact.size_bytes = 3;
            manifest.model.artifact.sha256 = format!("{:x}", Sha256::digest(b"abc"));
            let local_path = model_path(&manifest.model.artifact);
            let partial_path = partial_download_path(&local_path);
            fs::create_dir_all(partial_path.parent().expect("partial parent")).expect("mkdir");
            fs::write(&partial_path, b"abcdef").expect("oversized partial");

            let finalized = finalize_partial_download(&manifest, &local_path, &partial_path)
                .expect("finalize succeeds");

            assert!(finalized);
            assert_eq!(fs::read(&local_path).expect("local model"), b"abc");
            assert!(!partial_path.exists());
            assert!(checksum_marker_matches(
                &local_path,
                &manifest.model.artifact.sha256
            ));
            let state = read_model_download_state().expect("download state");
            assert_eq!(state.status, "Verified");
        });
    }

    #[test]
    fn oversized_corrupt_partial_is_discarded_for_clean_retry() {
        with_temp_state_dir(|_| {
            let mut manifest = parse_manifest().expect("manifest parses");
            manifest.model.artifact.size_bytes = 3;
            manifest.model.artifact.sha256 = format!("{:x}", Sha256::digest(b"abc"));
            let local_path = model_path(&manifest.model.artifact);
            let partial_path = partial_download_path(&local_path);
            fs::create_dir_all(partial_path.parent().expect("partial parent")).expect("mkdir");
            fs::write(&partial_path, b"zzzzzz").expect("oversized corrupt partial");

            let finalized = finalize_partial_download(&manifest, &local_path, &partial_path)
                .expect("finalize handles corrupt partial");

            assert!(!finalized);
            assert!(!local_path.exists());
            assert!(!partial_path.exists());
        });
    }

    #[test]
    fn missing_invalid_partial_cleanup_is_not_user_visible_failure() {
        with_temp_state_dir(|root| {
            let partial_path = root.join("Data").join("models").join("missing.gguf.part");

            remove_invalid_partial(&partial_path, "it was already removed")
                .expect("missing invalid partial cleanup is idempotent");
        });
    }

    #[test]
    fn corrupt_full_size_download_retries_clean_file_before_failing() {
        with_temp_state_dir(|_| {
            let mut manifest = parse_manifest().expect("manifest parses");
            manifest.model.artifact.size_bytes = 3;
            manifest.model.artifact.sha256 = format!("{:x}", Sha256::digest(b"abc"));
            let local_path = model_path(&manifest.model.artifact);

            env::set_var("TOWNLIGHT_AVAILABLE_DISK_BYTES_OVERRIDE", "99999999999");
            env::set_var(
                "TOWNLIGHT_TEST_MODEL_DOWNLOAD_SEQUENCE",
                "corrupt-then-valid",
            );

            download_model_artifact(&manifest, &local_path)
                .expect("corrupt first download is retried once with a clean file");

            env::remove_var("TOWNLIGHT_AVAILABLE_DISK_BYTES_OVERRIDE");
            env::remove_var("TOWNLIGHT_TEST_MODEL_DOWNLOAD_SEQUENCE");

            assert_eq!(fs::read(&local_path).expect("local model"), b"abc");
            assert!(!partial_download_path(&local_path).exists());
            assert!(checksum_marker_matches(
                &local_path,
                &manifest.model.artifact.sha256
            ));
            let state = read_model_download_state().expect("download state");
            assert_eq!(state.status, "Verified");
        });
    }

    #[test]
    fn repeated_corrupt_full_size_download_reports_checksum_failure() {
        with_temp_state_dir(|_| {
            let mut manifest = parse_manifest().expect("manifest parses");
            manifest.model.artifact.size_bytes = 3;
            manifest.model.artifact.sha256 = format!("{:x}", Sha256::digest(b"abc"));
            let local_path = model_path(&manifest.model.artifact);

            env::set_var("TOWNLIGHT_AVAILABLE_DISK_BYTES_OVERRIDE", "99999999999");
            env::set_var("TOWNLIGHT_TEST_MODEL_DOWNLOAD_SEQUENCE", "corrupt-always");

            let error = download_model_artifact(&manifest, &local_path)
                .expect_err("repeated corrupt downloads fail with a checksum error");

            env::remove_var("TOWNLIGHT_AVAILABLE_DISK_BYTES_OVERRIDE");
            env::remove_var("TOWNLIGHT_TEST_MODEL_DOWNLOAD_SEQUENCE");

            assert!(error.contains("checksum verification did not pass"));
            assert!(!error.contains("Could not inspect downloaded model"));
            assert!(!local_path.exists());
            assert!(!partial_download_path(&local_path).exists());
            let state = read_model_download_state().expect("download state");
            assert_eq!(state.status, "Download failed");
            assert!(state
                .last_error
                .unwrap_or_default()
                .contains("checksum verification did not pass"));
        });
    }

    #[test]
    fn model_state_reports_present_file_needs_verification() {
        with_temp_state_dir(|_| {
            let manifest = parse_manifest().expect("manifest parses");
            let local_path = model_path(&manifest.model.artifact);
            fs::create_dir_all(local_path.parent().expect("model parent")).expect("mkdir");
            let file = fs::OpenOptions::new()
                .create(true)
                .write(true)
                .open(&local_path)
                .expect("model file");
            file.set_len(manifest.model.artifact.size_bytes)
                .expect("sparse model size");

            let state = model_state().expect("model state");

            assert_eq!(state.status, "Needs verification");
            assert_eq!(state.download_state.status, "Needs verification");
        });
    }

    #[test]
    fn model_download_state_persists_completed_file_before_checksum() {
        with_temp_state_dir(|_| {
            let manifest = parse_manifest().expect("manifest parses");
            let local_path = model_path(&manifest.model.artifact);
            fs::create_dir_all(local_path.parent().expect("model parent")).expect("mkdir");
            let file = fs::OpenOptions::new()
                .create(true)
                .write(true)
                .open(&local_path)
                .expect("model file");
            file.set_len(manifest.model.artifact.size_bytes)
                .expect("sparse model size");

            let status_path = model_download_status_path();
            fs::create_dir_all(status_path.parent().expect("status parent")).expect("mkdir");
            let stale_state = ModelDownloadState {
                schema_version: 1,
                model_id: manifest.model.id.clone(),
                status: "Downloading".to_string(),
                message: "Townlight is downloading the pinned Gemma model file.".to_string(),
                local_path: local_path.to_string_lossy().to_string(),
                partial_path: partial_download_path(&local_path)
                    .to_string_lossy()
                    .to_string(),
                expected_size_bytes: manifest.model.artifact.size_bytes,
                local_bytes: 0,
                partial_bytes: 0,
                progress_percent: 0.0,
                last_error: None,
                updated_at_unix_seconds: 1,
            };
            fs::write(
                &status_path,
                serde_json::to_string_pretty(&stale_state).expect("status json"),
            )
            .expect("write stale status");

            write_current_model_download_state(&manifest, &local_path).expect("status refresh");

            let refreshed = read_model_download_state().expect("status persisted");
            assert_eq!(refreshed.status, "Needs verification");
            assert_eq!(refreshed.local_bytes, manifest.model.artifact.size_bytes);
            assert_eq!(refreshed.partial_bytes, 0);
            assert_eq!(refreshed.progress_percent, 100.0);
            assert!(refreshed.message.contains("needs checksum verification"));
        });
    }

    #[test]
    fn model_state_reports_verified_file_needs_runtime() {
        with_temp_state_dir(|_| {
            env::set_var("OLLAMA_BASE_URL", "http://127.0.0.1:9");
            let manifest = parse_manifest().expect("manifest parses");
            let local_path = model_path(&manifest.model.artifact);
            fs::create_dir_all(local_path.parent().expect("model parent")).expect("mkdir");
            let file = fs::OpenOptions::new()
                .create(true)
                .write(true)
                .open(&local_path)
                .expect("model file");
            file.set_len(manifest.model.artifact.size_bytes)
                .expect("sparse model size");
            fs::write(
                checksum_marker_path(&local_path),
                format!("{}\n", manifest.model.artifact.sha256),
            )
            .expect("checksum marker");

            let state = model_state().expect("model state");

            env::remove_var("OLLAMA_BASE_URL");
            assert_eq!(state.status, "Needs runtime");
            assert_eq!(state.download_state.status, "Verified");
            assert!(state
                .checks
                .iter()
                .any(|check| check.id == "runtime" && !check.ok));
        });
    }

    #[test]
    fn model_runtime_start_waits_for_bundled_ollama_health() {
        with_temp_state_dir(|_| {
            env::set_var("OLLAMA_BASE_URL", "http://127.0.0.1:9");
            env::set_var("TOWNLIGHT_TEST_MODEL_RUNTIME_START", "ok");
            env::set_var(
                "TOWNLIGHT_TEST_MODEL_RUNTIME_AFTER_START",
                "reachable-empty",
            );
            let manifest = parse_manifest().expect("manifest parses");

            let runtime =
                ensure_model_runtime_reachable(&manifest).expect("runtime starts in test");

            env::remove_var("OLLAMA_BASE_URL");
            env::remove_var("TOWNLIGHT_TEST_MODEL_RUNTIME_START");
            env::remove_var("TOWNLIGHT_TEST_MODEL_RUNTIME_AFTER_START");
            assert!(runtime.reachable);
            assert!(!runtime.model_available);
            assert!(runtime.message.contains("reachable"));
        });
    }

    #[test]
    fn model_runtime_start_failure_returns_plain_error() {
        with_temp_state_dir(|_| {
            env::set_var("OLLAMA_BASE_URL", "http://127.0.0.1:9");
            env::set_var(
                "TOWNLIGHT_TEST_MODEL_RUNTIME_START",
                "test runtime start refused",
            );
            let manifest = parse_manifest().expect("manifest parses");

            let error = ensure_model_runtime_reachable(&manifest).expect_err("start fails");

            env::remove_var("OLLAMA_BASE_URL");
            env::remove_var("TOWNLIGHT_TEST_MODEL_RUNTIME_START");
            assert!(error.contains("could not start"));
            assert!(error.contains("test runtime start refused"));
        });
    }

    #[test]
    fn windows_ollama_executable_uses_bundled_runtime_path() {
        with_temp_state_dir(|root| {
            env::remove_var("TOWNLIGHT_OLLAMA_PATH");
            let executable = ollama_executable();

            if cfg!(target_os = "windows") {
                assert_eq!(
                    executable,
                    root.join("runtime").join("ollama").join("ollama.exe")
                );
            } else {
                assert_eq!(executable, PathBuf::from("ollama"));
            }
        });
    }

    #[test]
    fn ollama_models_dir_uses_local_data_store() {
        with_temp_state_dir(|root| {
            assert_eq!(
                ollama_models_dir(),
                root.join("Data").join("models").join("ollama")
            );
        });
    }

    #[test]
    fn checksum_marker_cannot_pass_without_model_file() {
        let missing_path = env::temp_dir().join(format!(
            "townlight-missing-model-{}.gguf",
            std::process::id()
        ));
        let _ = std::fs::remove_file(&missing_path);
        let marker_path = checksum_marker_path(&missing_path);
        std::fs::write(
            &marker_path,
            "faff1a63667fac17ac5e777f47114688fcefea96e220e211aaa8d62c2c4561f1",
        )
        .expect("marker can be written");
        assert!(!checksum_marker_matches(
            &missing_path,
            "faff1a63667fac17ac5e777f47114688fcefea96e220e211aaa8d62c2c4561f1"
        ));
        let _ = std::fs::remove_file(marker_path);
    }

    #[test]
    fn ollama_tags_match_pinned_model_name() {
        let body = r#"{"models":[{"name":"hf.co/google/gemma-4-12B-it-qat-q4_0-gguf:Q4_0","model":"hf.co/google/gemma-4-12B-it-qat-q4_0-gguf:Q4_0"}]}"#;
        assert!(ollama_model_list_contains(
            body,
            "hf.co/google/gemma-4-12B-it-qat-q4_0-gguf:Q4_0"
        ));
        assert!(!ollama_model_list_contains(body, "gemma2:4b"));
    }

    fn with_temp_state_dir<T>(test: impl FnOnce(PathBuf) -> T) -> T {
        let _guard = crate::first_run::test_env_lock()
            .lock()
            .expect("test env lock");
        let root = env::temp_dir().join(format!(
            "townlight-desktop-model-test-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&root);
        env::set_var("TOWNLIGHT_DESKTOP_STATE_DIR", &root);
        let result = test(root.clone());
        env::remove_var("TOWNLIGHT_DESKTOP_STATE_DIR");
        let _ = fs::remove_dir_all(root);
        result
    }

    #[test]
    fn model_open_folder_action_creates_and_opens_local_folder() {
        with_temp_state_dir(|root| {
            let result = model_action("open-model-folder").expect("action response");
            assert!(result.accepted);
            assert_eq!(result.message, "The local model folder is open.");
            assert!(root.join("Data").join("models").is_dir());
        });
    }

    #[test]
    fn model_load_runtime_action_requires_verified_artifact() {
        with_temp_state_dir(|_| {
            let result = model_action("load-runtime-model").expect("action response");
            assert!(!result.accepted);
            assert_eq!(result.status, "Needs attention");
            assert!(result.message.contains("checksum verification"));
        });
    }

    #[test]
    fn verify_file_checksum_writes_marker_for_matching_file() {
        with_temp_state_dir(|root| {
            let model_path = root.join("Data").join("models").join("tiny.gguf");
            fs::create_dir_all(model_path.parent().expect("parent")).expect("mkdir");
            fs::write(&model_path, b"townlight").expect("write model");
            let expected = sha256_file(&model_path).expect("hash");
            verify_file_checksum(&model_path, b"townlight".len() as u64, &expected)
                .expect("verify");
            assert!(checksum_marker_matches(&model_path, &expected));
        });
    }

    #[test]
    fn register_verified_model_writes_local_registry() {
        with_temp_state_dir(|root| {
            let manifest = parse_manifest().expect("manifest parses");
            let model_path = root
                .join("Data")
                .join("models")
                .join("gemma-4-12b-it-qat-q4_0.gguf");

            register_verified_model(&manifest, &model_path).expect("registry write");

            assert!(root.join("config").join("model-registry.json").is_file());
            assert!(model_registry_matches(&manifest, &model_path));
            let registry = read_model_registry().expect("registry reads");
            assert_eq!(registry.models.len(), 1);
            assert_eq!(registry.models[0].model_id, manifest.model.id);
            assert_eq!(registry.models[0].ollama_model, manifest.model.ollama_model);
            assert_eq!(
                registry.models[0].runtime_model,
                manifest.model.runtime_model
            );
        });
    }

    #[test]
    fn local_model_artifact_verified_is_false_without_artifact() {
        with_temp_state_dir(|_| {
            assert!(
                !local_model_artifact_verified().expect("verification state resolves"),
                "missing model artifact cannot satisfy the first-run gate"
            );
        });
    }
}
