//! Fresh-install identity fence. Existing unmarked profiles are never adopted.
use std::{fs, io::Write, path::Path};

const IDENTITY: &[u8] = b"{\"schema_version\":1,\"identity\":\"townlight-naming-2026-11\"}\n";

pub fn prepare() -> Result<(), String> {
    prepare_at(&crate::local_paths::townlight_root())
}

fn prepare_at(root: &Path) -> Result<(), String> {
    let marker = root.join("townlight-profile.json");
    if marker.exists() {
        let bytes = fs::read(&marker).map_err(|_| "Profile identity could not be read.")?;
        let value: serde_json::Value = serde_json::from_slice(&bytes)
            .map_err(|_| "Profile identity is invalid; no profile work was started.")?;
        if value["schema_version"] == 1 && value["identity"] == "townlight-naming-2026-11" {
            return Ok(());
        }
        return Err("Unsupported profile identity; no profile work was started.".into());
    }
    if root.join("config").exists() || root.join("Data").exists() {
        return Err("This release supports a fresh Townlight profile only. An existing unmarked profile was detected and left unchanged. Keep its matching previous release; an in-place upgrade is not supported.".into());
    }
    fs::create_dir_all(root).map_err(|_| "Could not create the new profile folder.")?;
    let mut file = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&marker)
        .map_err(|_| "Could not establish a new profile identity. No city data was initialized.")?;
    file.write_all(IDENTITY)
        .and_then(|_| file.sync_all())
        .map_err(|_| "Could not persist profile identity. No city data was initialized.".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn refuses_existing_profile_without_mutation_and_accepts_new_identity() {
        let root =
            std::env::temp_dir().join(format!("townlight-identity-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(root.join("config")).unwrap();
        let evidence = root.join("config/city.json");
        fs::write(&evidence, b"preserve existing profile").unwrap();
        assert!(prepare_at(&root).is_err());
        assert_eq!(fs::read(&evidence).unwrap(), b"preserve existing profile");
        assert!(!root.join("townlight-profile.json").exists());
        let fresh = root.join("fresh");
        prepare_at(&fresh).unwrap();
        prepare_at(&fresh).unwrap();
        fs::write(fresh.join("townlight-profile.json"), b"invalid").unwrap();
        assert!(prepare_at(&fresh).is_err());
        fs::remove_dir_all(root).unwrap();
    }
}
