use serde::{Deserialize, Serialize};
use std::env;
use std::fs;
use std::path::{Component, Path, PathBuf};

#[derive(Deserialize, Serialize, Clone, Debug, Eq, PartialEq)]
pub struct LocalLocations {
    pub install_root: String,
    pub data_root: String,
    pub backup_root: String,
}

fn windows_path_string(path: PathBuf) -> String {
    path.to_string_lossy().replace('/', "\\")
}

pub fn townlight_root() -> PathBuf {
    env::var("TOWNLIGHT_DESKTOP_STATE_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|_| {
            env::var("LOCALAPPDATA")
                .map(PathBuf::from)
                .unwrap_or_else(|_| PathBuf::from("{local_app_data}"))
                .join("CivicSuite")
        })
}

pub fn config_dir() -> PathBuf {
    townlight_root().join("config")
}

fn locations_path() -> PathBuf {
    config_dir().join("locations.json")
}

pub fn default_locations() -> LocalLocations {
    let root = townlight_root();
    let backup_root = env::var("TOWNLIGHT_BACKUP_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|_| {
            if env::var("TOWNLIGHT_DESKTOP_STATE_DIR").is_ok() {
                root.join("Backups")
            } else {
                env::var("USERPROFILE")
                    .map(PathBuf::from)
                    .unwrap_or_else(|_| PathBuf::from("{documents}"))
                    .join("Documents")
                    .join("Townlight Backups")
            }
        });
    LocalLocations {
        install_root: windows_path_string(root.clone()),
        data_root: windows_path_string(root.join("Data")),
        backup_root: windows_path_string(backup_root),
    }
}

fn read_saved_locations() -> Result<Option<LocalLocations>, String> {
    let path = locations_path();
    if !path.is_file() {
        return Ok(None);
    }
    let contents = fs::read_to_string(&path)
        .map_err(|error| format!("Could not read local location settings: {error}"))?;
    serde_json::from_str(&contents)
        .map(Some)
        .map_err(|error| format!("Could not parse local location settings: {error}"))
}

pub fn effective_locations() -> Result<LocalLocations, String> {
    Ok(read_saved_locations()?.unwrap_or_else(default_locations))
}

fn looks_like_absolute_windows_path(value: &str) -> bool {
    let bytes = value.as_bytes();
    bytes.len() >= 3
        && bytes[1] == b':'
        && (bytes[2] == b'\\' || bytes[2] == b'/')
        && bytes[0].is_ascii_alphabetic()
}

fn validate_location_path(label: &str, value: &str) -> Result<String, String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err(format!("{label} is required."));
    }
    let path = Path::new(trimmed);
    if !path.is_absolute() && !looks_like_absolute_windows_path(trimmed) {
        return Err(format!("{label} must be an absolute local path."));
    }
    if path
        .components()
        .any(|component| matches!(component, Component::ParentDir))
    {
        return Err(format!("{label} cannot contain parent-folder traversal."));
    }
    if looks_like_absolute_windows_path(trimmed) {
        Ok(trimmed.replace('/', "\\"))
    } else {
        Ok(trimmed.to_string())
    }
}

pub fn save_locations(locations: &LocalLocations) -> Result<LocalLocations, String> {
    let normalized = LocalLocations {
        install_root: validate_location_path("Install folder", &locations.install_root)?,
        data_root: validate_location_path("City data folder", &locations.data_root)?,
        backup_root: validate_location_path("Backup folder", &locations.backup_root)?,
    };
    fs::create_dir_all(config_dir())
        .map_err(|error| format!("Could not create local config folder: {error}"))?;
    crate::atomic_io::atomic_write_json(&locations_path(), &normalized)?;
    Ok(normalized)
}

pub fn data_root() -> PathBuf {
    effective_locations()
        .map(|locations| PathBuf::from(locations.data_root))
        .unwrap_or_else(|_| townlight_root().join("Data"))
}

pub fn backup_root() -> PathBuf {
    effective_locations()
        .map(|locations| PathBuf::from(locations.backup_root))
        .unwrap_or_else(|_| default_locations().backup_root.into())
}
