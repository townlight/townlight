use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

// Resolve explorer.exe to its absolute path under %SystemRoot% instead of relying
// on PATH lookup (defense-in-depth against PATH hijacking). explorer.exe lives
// directly under the Windows root, not under System32.
#[cfg(windows)]
fn explorer_path() -> PathBuf {
    let system_root = env::var("SystemRoot").unwrap_or_else(|_| "C:\\Windows".to_string());
    PathBuf::from(system_root).join("explorer.exe")
}

#[cfg(not(windows))]
fn explorer_path() -> PathBuf {
    PathBuf::from("explorer.exe")
}

pub(crate) fn open_local_folder(path: &Path) -> Result<(), String> {
    fs::create_dir_all(path)
        .map_err(|error| format!("Could not create folder {}: {error}", path.display()))?;
    if cfg!(test) || env::var("TOWNLIGHT_SUPPRESS_OPEN_FOLDER").ok().as_deref() == Some("1") {
        return Ok(());
    }

    let mut command = if cfg!(target_os = "windows") {
        Command::new(explorer_path())
    } else if cfg!(target_os = "macos") {
        Command::new("open")
    } else {
        Command::new("xdg-open")
    };
    command.arg(path).spawn().map_err(|error| {
        format!(
            "Could not open folder {} from the desktop app: {error}",
            path.display()
        )
    })?;
    Ok(())
}

pub(crate) fn open_windows_uninstall_settings() -> Result<(), String> {
    if cfg!(test) || env::var("TOWNLIGHT_SUPPRESS_OPEN_FOLDER").ok().as_deref() == Some("1") {
        return Ok(());
    }

    if !cfg!(target_os = "windows") {
        return Err(
            "Windows uninstall settings can only be opened from the Windows desktop app."
                .to_string(),
        );
    }

    Command::new(explorer_path())
        .arg("ms-settings:appsfeatures")
        .spawn()
        .map_err(|error| {
            format!("Could not open Windows Installed apps settings from the desktop app: {error}")
        })?;
    Ok(())
}

#[cfg(all(test, windows))]
mod tests {
    use super::*;

    #[test]
    fn explorer_path_is_absolute_under_system_root() {
        env::set_var("SystemRoot", "C:\\Windows");
        let path = explorer_path();
        env::remove_var("SystemRoot");
        assert!(path.is_absolute());
        assert!(path.starts_with("C:\\Windows"));
        assert!(path.ends_with("explorer.exe"));
    }
}
