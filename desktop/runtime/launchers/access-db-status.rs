// SPDX-License-Identifier: AGPL-3.0-only
use std::{
    env, io,
    process::{self, Command},
};

fn run() -> io::Result<i32> {
    let executable = env::current_exe()?;
    let python_root = executable
        .parent()
        .and_then(|scripts| scripts.parent())
        .ok_or_else(|| {
            io::Error::other("Access launcher must be in the bundled Python Scripts directory")
        })?;
    let status = Command::new(python_root.join("python.exe"))
        .args(["-I", "-B", "-m", "townlight_access.db_admin"])
        .args(env::args_os().skip(1))
        .status()?;
    Ok(status.code().unwrap_or(1))
}

fn main() {
    match run() {
        Ok(code) => process::exit(code),
        Err(error) => {
            eprintln!("Could not start the Townlight Access database status command: {error}");
            process::exit(1);
        }
    }
}
