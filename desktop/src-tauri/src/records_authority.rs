//! Profile authority journal. Any journal fences the old writer, including an
//! incomplete or corrupt one. It never authorizes a JSON fallback.
use serde::{Deserialize, Serialize};
use std::{fs, path::PathBuf};

#[derive(Deserialize, Serialize)]
pub struct Journal {
    pub schema_version: u8,
    pub phase: String,
    pub source_sha256: String,
    pub backup_path: String,
}

pub fn path() -> PathBuf {
    crate::local_paths::config_dir().join("records-authority.json")
}

pub fn read() -> Result<Option<Journal>, String> {
    if !path().exists() {
        return Ok(None);
    }
    let journal: Journal = serde_json::from_slice(
        &fs::read(path()).map_err(|_| "Records authority could not be read.")?,
    )
    .map_err(|_| "Records authority is invalid; legacy writes remain blocked.")?;
    if journal.schema_version != 1
        || !matches!(journal.phase.as_str(), "importing" | "active")
        || journal.source_sha256.len() != 64
        || !journal.source_sha256.bytes().all(|c| c.is_ascii_hexdigit())
    {
        return Err("Records authority is unsupported; legacy writes remain blocked.".to_string());
    }
    Ok(Some(journal))
}

pub fn legacy_allowed() -> Result<(), String> {
    if path().exists() {
        Err("Records has entered Python migration. Legacy workflow access is disabled; use the canonical Records path or finish migration from System Health.".to_string())
    } else {
        Ok(())
    }
}

pub fn write(journal: &Journal) -> Result<(), String> {
    crate::atomic_io::atomic_write_json(&path(), journal)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn importing_active_and_corrupt_journals_never_allow_legacy_access() {
        let _lock = crate::first_run::test_env_lock().lock().unwrap();
        let root =
            std::env::temp_dir().join(format!("townlight-authority-test-{}", std::process::id()));
        fs::create_dir_all(root.join("config")).unwrap();
        std::env::set_var("CIVICSUITE_DESKTOP_STATE_DIR", &root);
        assert!(legacy_allowed().is_ok());
        for phase in ["importing", "active"] {
            write(&Journal {
                schema_version: 1,
                phase: phase.to_string(),
                source_sha256: "a".repeat(64),
                backup_path: "preserved-source".to_string(),
            })
            .unwrap();
            assert!(legacy_allowed().is_err());
            assert!(crate::workflows::city_work_state().is_err());
            assert!(crate::workflows::city_work_action("create-records-request", None).is_err());
            assert_eq!(read().unwrap().unwrap().phase, phase);
        }
        fs::write(path(), "corrupt").unwrap();
        assert!(read().is_err());
        assert!(crate::workflows::city_work_state().is_err());
        std::env::remove_var("CIVICSUITE_DESKTOP_STATE_DIR");
        fs::remove_dir_all(root).unwrap();
    }
}
