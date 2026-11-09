# Townlight Windows 1.8.0.1 release handoff

[GitHub release](https://github.com/townlight/townlight/releases/tag/townlight-windows-v1.8.0.1) · [Signed Windows x64 MSI](https://github.com/townlight/townlight/releases/download/townlight-windows-v1.8.0.1/Townlight-Windows-x64-1.8.0.1.msi) · [SHA-256 checksums](https://github.com/townlight/townlight/releases/download/townlight-windows-v1.8.0.1/SHA256SUMS-Windows-1.8.0.1.txt) · [Installed acceptance](https://github.com/townlight/townlight/releases/download/townlight-windows-v1.8.0.1/ACCEPTANCE-Windows-1.8.0.1.md)

## Install and support

For a new city installation, launch Townlight under the intended Windows account and choose the full **Townlight Inspections candidate** profile. Create the city profile and named local administrator, choose backup storage and finish the health and Records steps. See the [Suite manual](https://townlight.github.io/manuals/suite.html) and [Windows staff guide](https://townlight.github.io/manuals/windows-staff-workflows.html).

For an existing 1.7.2.1 installation, back up the city profile and data, exit the desktop normally, install the new MSI and open Townlight under the same Windows account. Keep `%LOCALAPPDATA%\CivicSuite`. The app refreshes its per-user runtime on launch and retains city data and settings. The [older Windows release](https://github.com/townlight/townlight/releases/tag/townlight-windows-v1.7.2.1) remains available.

## Maintainer reference

- Tag `townlight-windows-v1.8.0.1` identifies the exact build source `9a2027ab81af6b8a36b8f0fe426a27fcea1fd41c`.
- Signed MSI SHA-256 `3085817377cf813debe558d280278e2b9d11311388aa41eb184c9ba80cfbb35a`.
- [Corresponding source archive](https://github.com/townlight/townlight/releases/download/townlight-windows-v1.8.0.1/Townlight-Windows-1.8.0.1-Corresponding-Source.zip) and [component pins](https://townlight.github.io/reference/windows-1.8.0.1-source-pins.json).
- [Desktop signing run](https://github.com/townlight/townlight/actions/runs/42677667469) and [MSI signing run](https://github.com/townlight/townlight/actions/runs/42681693472).
- [API and runtime reference](https://townlight.github.io/reference/), including the bundled schema and exact package and payload manifests.
- [Release feedback and support](https://townlight.github.io/support.html).
