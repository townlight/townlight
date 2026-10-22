//! Native byte handling only. Python owns attachment/release eligibility.
use crate::local_paths;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs::{self, File, OpenOptions};
use std::io::{Read, Write};
use std::path::Path;
use uuid::Uuid;

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum ExportFolder {
    All,
    Records,
    Access,
    Meetings,
    Planning,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct OpenExports {
    pub folder: ExportFolder,
}

impl ExportFolder {
    pub fn name(&self) -> &'static str {
        match self {
            Self::All => "all",
            Self::Records => "records",
            Self::Access => "access",
            Self::Meetings => "meetings",
            Self::Planning => "planning",
        }
    }
}

pub fn open_exports(folder: ExportFolder) -> Result<String, String> {
    let mut root =
        std::path::PathBuf::from(local_paths::effective_locations()?.data_root).join("exports");
    if !matches!(folder, ExportFolder::All) {
        root = root.join(folder.name());
    }
    crate::local_shell::open_local_folder(&root)?;
    Ok(format!(
        "Opened local {} exports: {}",
        folder.name(),
        root.display()
    ))
}

#[derive(Serialize)]
pub struct ManagedFileReceipt {
    original_path: String,
    stored_path: String,
    file_name: String,
    sha256: String,
    size_bytes: u64,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ArtifactPlan {
    pub artifact_id: Uuid,
    file_name: String,
    content: String,
    sha256: String,
    created_at_unix_seconds: u64,
}

pub fn write_export(plan: ArtifactPlan) -> Result<String, String> {
    let root = std::path::PathBuf::from(local_paths::effective_locations()?.data_root)
        .join("exports")
        .join("records");
    write_export_at(plan, &root)
}

pub fn write_access_export(plan: ArtifactPlan) -> Result<String, String> {
    let root = std::path::PathBuf::from(local_paths::effective_locations()?.data_root)
        .join("exports")
        .join("access");
    write_export_at(plan, &root)
}

pub fn write_planning_file(name: &str, bytes: &[u8], digest: &str) -> Result<String, String> {
    let root = std::path::PathBuf::from(local_paths::effective_locations()?.data_root)
        .join("exports")
        .join("planning");
    write_planning_file_at(&root, name, bytes, digest)
}

fn write_planning_file_at(
    root: &Path,
    name: &str,
    bytes: &[u8],
    digest: &str,
) -> Result<String, String> {
    if name.is_empty()
        || name.len() > 300
        || name.contains(['/', '\\', ':'])
        || ![".json", ".txt", ".md", ".pdf", ".docx"]
            .iter()
            .any(|suffix| name.to_lowercase().ends_with(suffix))
        || Path::new(name).file_name().and_then(|p| p.to_str()) != Some(name)
        || bytes.len() > 16 * 1024 * 1024
        || format!("{:x}", Sha256::digest(bytes)) != digest
    {
        return Err("Invalid Planning file or source digest.".into());
    }
    fs::create_dir_all(root).map_err(|_| "Could not create Planning export folder.")?;
    let path = root.join(name);
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&path)
        .map_err(|_| "Could not create a new Planning export.")?;
    file.write_all(bytes)
        .and_then(|_| file.sync_all())
        .map_err(|_| "Could not finish Planning export.")?;
    let stored = fs::read(&path).map_err(|_| "Could not verify Planning export.")?;
    if format!("{:x}", Sha256::digest(&stored)) != digest {
        return Err("Planning export verification failed.".into());
    }
    Ok(path.to_string_lossy().into_owned())
}

fn write_export_at(plan: ArtifactPlan, root: &Path) -> Result<String, String> {
    if Path::new(&plan.file_name)
        .file_name()
        .and_then(|part| part.to_str())
        != Some(plan.file_name.as_str())
        || plan.file_name.contains(['/', '\\', ':'])
        || !plan.file_name.ends_with(".md")
        || format!("{:x}", Sha256::digest(plan.content.as_bytes())) != plan.sha256
    {
        return Err("Invalid Records export plan.".into());
    }
    fs::create_dir_all(root).map_err(|_| "Could not create the Records export folder.")?;
    let path = root.join(&plan.file_name);
    // Exclusive creation protects existing artifacts; no overwrite or cleanup
    // of historical output on any failure, including unknown finalization.
    let mut output = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&path)
        .map_err(|_| "Could not create a new Records export.")?;
    output
        .write_all(plan.content.as_bytes())
        .and_then(|_| output.sync_all())
        .map_err(|_| "Could not finish writing the Records export.")?;
    let manifest_path = path.with_file_name(format!("{}.manifest.json", plan.file_name));
    let manifest = serde_json::json!({"schema_version":1, "export_file":plan.file_name,
        "export_path":path.to_string_lossy(), "format":"markdown", "size_bytes":plan.content.len(),
        "sha256":plan.sha256, "created_at_unix_seconds":plan.created_at_unix_seconds,
        "generated_by":"Townlight Windows Local"});
    let mut manifest_file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(manifest_path)
        .map_err(|_| "Could not create the Records integrity manifest.")?;
    manifest_file
        .write_all(
            serde_json::to_string_pretty(&manifest)
                .map_err(|_| "Invalid manifest.")?
                .as_bytes(),
        )
        .and_then(|_| manifest_file.sync_all())
        .map_err(|_| "Could not finish the Records integrity manifest.")?;
    Ok(path.to_string_lossy().into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn planning_export_checks_exact_bytes_paths_and_exclusive_creation() {
        let root = std::env::temp_dir().join(format!("planning-export-{}", Uuid::new_v4()));
        let content = b"{\"reviewed\":true}";
        let digest = format!("{:x}", Sha256::digest(content));
        assert!(write_planning_file_at(&root, "../outside.json", content, &digest).is_err());
        assert!(write_planning_file_at(&root, "source.exe", content, &digest).is_err());
        assert!(write_planning_file_at(&root, "source.json", b"changed", &digest).is_err());
        let path = write_planning_file_at(&root, "source.json", content, &digest).unwrap();
        assert_eq!(fs::read(path).unwrap(), content);
        assert!(write_planning_file_at(&root, "source.json", content, &digest).is_err());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn export_verifies_hash_confines_path_and_never_overwrites() {
        let root = std::env::temp_dir().join(format!("townlight-export-test-{}", Uuid::new_v4()));
        let make_plan = |name: &str| ArtifactPlan {
            artifact_id: Uuid::new_v4(),
            file_name: name.into(),
            content: "Synthetic approved response".into(),
            sha256: format!("{:x}", Sha256::digest(b"Synthetic approved response")),
            created_at_unix_seconds: 1000,
        };
        assert!(write_export_at(make_plan("../outside.md"), &root).is_err());
        let mut bad = make_plan("bad.md");
        bad.sha256 = "0".repeat(64);
        assert!(write_export_at(bad, &root).is_err());
        let path = write_export_at(make_plan("response.md"), &root).unwrap();
        assert_eq!(
            fs::read_to_string(&path).unwrap(),
            "Synthetic approved response"
        );
        assert!(write_export_at(make_plan("response.md"), &root).is_err());
        let manifest: serde_json::Value = serde_json::from_str(
            &fs::read_to_string(root.join("response.md.manifest.json")).unwrap(),
        )
        .unwrap();
        assert_eq!(manifest["size_bytes"], 27);
        assert_eq!(manifest["sha256"], make_plan("response.md").sha256);
        fs::remove_file(root.join("response.md.manifest.json")).unwrap();
        fs::remove_file(path).unwrap();
        fs::remove_dir(root).unwrap();
    }
}

pub fn stage(source: &str, title: &str, note: &str) -> Result<ManagedFileReceipt, String> {
    stage_module(source, title, note, "records")
}

pub fn stage_meetings(source: &str) -> Result<ManagedFileReceipt, String> {
    if !Path::new(source.trim()).is_file() {
        return Err("Select an existing Meetings source file; no placeholder was created.".into());
    }
    stage_module(source, "Meetings packet source", "", "meetings")
}

fn stage_module(
    source: &str,
    title: &str,
    note: &str,
    module: &str,
) -> Result<ManagedFileReceipt, String> {
    let source = source.trim();
    if source.is_empty() {
        return Err("Enter a local file path or reference before saving.".into());
    }
    let root = local_paths::effective_locations()
        .map(|locations| std::path::PathBuf::from(locations.data_root))?
        .join("files")
        .join(module)
        .join("staged");
    fs::create_dir_all(&root).map_err(|_| "Could not create the Records evidence folder.")?;
    let original = Path::new(source);
    let file_name = original
        .file_name()
        .map(|name| name.to_string_lossy().to_string())
        .unwrap_or_else(|| "records-reference".into());
    let extension = original
        .extension()
        .and_then(|value| value.to_str())
        .filter(|value| value.len() <= 16 && value.chars().all(|c| c.is_ascii_alphanumeric()))
        .unwrap_or("bin");
    let exists = original.is_file();
    let destination = root.join(format!(
        "{}.{}",
        Uuid::new_v4(),
        if exists { extension } else { "txt" }
    ));
    let mut output = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&destination)
        .map_err(|_| "Could not create the staged Records file.")?;
    let mut hash = Sha256::new();
    let mut size = 0u64;
    if exists {
        let mut input =
            File::open(original).map_err(|_| "Could not open the selected Records file.")?;
        let mut buffer = [0u8; 64 * 1024];
        loop {
            let count = input
                .read(&mut buffer)
                .map_err(|_| "Could not read the selected Records file.")?;
            if count == 0 {
                break;
            }
            size += count as u64;
            if size > i32::MAX as u64 {
                return Err("The selected file exceeds supported document storage size.".into());
            }
            output
                .write_all(&buffer[..count])
                .map_err(|_| "Could not preserve the selected Records file.")?;
            hash.update(&buffer[..count]);
        }
    } else {
        // Preserve the accepted typed-reference behavior; do not pretend the
        // marker is the contents of the unreadable original file.
        let marker = format!("Townlight local file reference\n\nTitle: {title}\nTyped path or reference: {source}\nCitation or note: {note}\n\nThe typed path was not readable when this workflow was saved, so Townlight preserved this local reference marker instead of discarding the workflow evidence.\n");
        output
            .write_all(marker.as_bytes())
            .map_err(|_| "Could not preserve the Records reference.")?;
        hash.update(marker.as_bytes());
        size = marker.len() as u64;
    }
    output
        .sync_all()
        .map_err(|_| "Could not finish preserving the Records file.")?;
    // On a subsequent API failure retain the staged file for reconciliation;
    // never delete prior evidence or silently claim that metadata was accepted.
    Ok(ManagedFileReceipt {
        original_path: source.into(),
        stored_path: destination.to_string_lossy().into(),
        file_name: if exists {
            file_name
        } else {
            format!("{file_name} (typed reference marker)")
        },
        sha256: format!("{:x}", hash.finalize()),
        size_bytes: size,
    })
}
