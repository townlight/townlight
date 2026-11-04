// atomic_io.rs
use serde::Serialize;
use std::fs::{self, File, OpenOptions};
use std::io::Write;
use std::path::Path;
use std::time::Duration;

const RENAME_ATTEMPTS: u32 = 5;
const RENAME_RETRY_DELAY: Duration = Duration::from_millis(40);

/// Serialize `value` as pretty JSON (+ trailing newline) and publish it to
/// `path` atomically: write to a sibling temp file, fsync it, then rename over
/// the destination. A torn or interrupted write can only ever damage the temp
/// file, never the live system-of-record.
pub fn atomic_write_json<T: Serialize>(path: &Path, value: &T) -> Result<(), String> {
    let contents = serde_json::to_string_pretty(value)
        .map_err(|error| format!("Could not serialize {}: {error}", path.display()))?;
    atomic_write_bytes(path, format!("{contents}\n").as_bytes())
}

/// Same atomic publish for raw bytes/text (secrets, checksum markers).
pub fn atomic_write_bytes(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| format!("Could not resolve parent folder for {}", path.display()))?;
    fs::create_dir_all(parent)
        .map_err(|error| format!("Could not create {}: {error}", parent.display()))?;

    let file_name = path
        .file_name()
        .map(|name| name.to_string_lossy().to_string())
        .unwrap_or_else(|| "state".to_string());
    let tmp = parent.join(format!(
        ".{file_name}.{}.{}.tmp",
        std::process::id(),
        now_nanos()
    ));

    {
        let mut file = OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(true)
            .open(&tmp)
            .map_err(|error| format!("Could not open temp file {}: {error}", tmp.display()))?;
        file.write_all(bytes)
            .map_err(|error| format!("Could not write temp file {}: {error}", tmp.display()))?;
        file.sync_all()
            .map_err(|error| format!("Could not flush temp file {}: {error}", tmp.display()))?;
    }

    if let Err(error) = rename_with_retries(&tmp, path) {
        let _ = fs::remove_file(&tmp);
        return Err(error);
    }

    // Best-effort directory durability. On Windows a directory-handle sync_all
    // is a no-op / AccessDenied; swallow it. The file-level sync_all + atomic
    // rename above are the real guarantee.
    if let Ok(dir) = File::open(parent) {
        let _ = dir.sync_all();
    }
    Ok(())
}

fn rename_with_retries(source: &Path, destination: &Path) -> Result<(), String> {
    let mut last = None;
    for attempt in 1..=RENAME_ATTEMPTS {
        match fs::rename(source, destination) {
            Ok(()) => return Ok(()),
            Err(error) => {
                last = Some(error);
                if attempt < RENAME_ATTEMPTS {
                    std::thread::sleep(RENAME_RETRY_DELAY);
                }
            }
        }
    }
    Err(format!(
        "Could not move {} to {}: {}",
        source.display(),
        destination.display(),
        last.map(|e| e.to_string())
            .unwrap_or_else(|| "unknown error".into())
    ))
}

fn now_nanos() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde::{Deserialize, Serialize};
    use std::fs;

    #[derive(Serialize, Deserialize, PartialEq, Debug)]
    struct Sample {
        name: String,
        value: u64,
    }

    fn tmp_path(name: &str) -> std::path::PathBuf {
        std::env::temp_dir().join(format!("townlight-atomic-{}-{}", std::process::id(), name))
    }

    #[test]
    fn leaves_no_temp_sibling_and_roundtrips() {
        let path = tmp_path("roundtrip.json");
        let _ = fs::remove_file(&path);
        let value = Sample {
            name: "city".into(),
            value: 7,
        };
        atomic_write_json(&path, &value).unwrap();

        let parent = path.parent().unwrap();
        let leftover = fs::read_dir(parent)
            .unwrap()
            .filter_map(|e| e.ok())
            .any(|e| {
                let n = e.file_name().to_string_lossy().to_string();
                n.contains(".tmp") && n.contains("roundtrip.json")
            });
        assert!(
            !leftover,
            "no .tmp sibling may remain after a successful write"
        );

        let back: Sample = serde_json::from_str(&fs::read_to_string(&path).unwrap()).unwrap();
        assert_eq!(back, value);
        let _ = fs::remove_file(&path);
    }

    #[test]
    fn replaces_existing_with_full_value() {
        let path = tmp_path("replace.json");
        atomic_write_json(
            &path,
            &Sample {
                name: "old".into(),
                value: 1,
            },
        )
        .unwrap();
        atomic_write_json(
            &path,
            &Sample {
                name: "newnewnew".into(),
                value: 99,
            },
        )
        .unwrap();
        let back: Sample = serde_json::from_str(&fs::read_to_string(&path).unwrap()).unwrap();
        assert_eq!(
            back,
            Sample {
                name: "newnewnew".into(),
                value: 99
            },
            "rename must publish the complete new value, never a truncated prefix"
        );
        let _ = fs::remove_file(&path);
    }
}
