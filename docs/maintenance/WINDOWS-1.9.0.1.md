# Townlight Windows 1.9.0.1 release handoff

[Release](https://github.com/townlight/townlight/releases/tag/townlight-windows-v1.9.0.1) · [Suite manual](https://townlight.github.io/manuals/suite.html) · [Station manual](https://townlight.github.io/manuals/station.html)

The tag identifies source 5c386c6eb95df980d0b117c9a49aacf65b23b23d. The accepted signed MSI SHA-256 is fde5cfd9d167571792e2384f7a5066b1dbea3fdc8b2085cf43f670440210ff0c. Promote these bytes without a rebuild or another signing pass. The corresponding source bundle preserves the application source and the fourteen pinned component sources. The prior Windows 1.8.2.1 release remains available.

# Townlight Windows 1.9.0.1 installed acceptance

- Application source `5c386c6eb95df980d0b117c9a49aacf65b23b23d`
- Signed Windows x64 MSI SHA-256 fde5cfd9d167571792e2384f7a5066b1dbea3fdc8b2085cf43f670440210ff0c
- Corresponding source SHA-256 41725a4e2e2f844ed27474d8348563b03456a30166507f46e228c963a2ff7b5c. The archive includes the exact Suite source and fourteen component pins.
- Windows installer and its embedded desktop executable carry verified timestamped **Scott Converse** signatures.
- [Signing and build](https://github.com/townlight/townlight/actions/runs/44851746939) · [Exact signed recorder acceptance](https://github.com/townlight/townlight/actions/runs/44856462026)

The signed package was built from the same source tree and component pins as the [passing unsigned candidate](https://github.com/townlight/townlight/actions/runs/44843312939). The evidence here identifies the signed MSI tested on clean hosted Windows and published after testing.

| Installed check | Result |
|---|---|
| Fresh setup | Windows registered Townlight 1.9.0.1. Normal first run provisioned the bundled Station service, and the test activated the canonical Records runtime. |
| Recording and staff session | A synthetic UDP audio/video source recorded through Station. Renewal, independent recording lifetime, reconnect, stop and sign-out revocation passed. |
| Records handoff | The signed installer transferred a real short recording and a synthetic storage-boundary file of 2148886812 bytes. Independent hashes matched their managed Records copies. |
| Storage and recovery | The eight-hour and 64 GiB configuration and storage admission checks passed. Station survived a Suite backup and restore with recording readback. |
| Uninstall | Windows removed application files and registration and retained city configuration and database data. |

The hosted runner exercised device discovery without physical cameras. Test your camera and microphone before a meeting. The storage-boundary test used synthetic data and did not run an eight-hour recording. Earlier installed feature and import evidence stays associated with the builds that produced it.

Station 0.4.0 is included with Records 1.8.0.dev4. Select the full Windows profile or a custom profile with Meetings and Records to set up Station during first run. On an existing installation, open Settings → Modules → Townlight Station → **Set up meeting recording**. Read the [Station operating guide](https://townlight.github.io/manuals/station.html).

The standard signed Windows installer lifecycle also passed install, first run, backup and restore, repair, and uninstall. The separate broad fresh-maintenance job stopped at Station storage admission on its runner. The dedicated signed recorder run met the storage requirement and passed the recorder and Records workflow listed above.

## Upgrade from 1.8.2.1

The signed upgrade from Windows 1.8.2.1 to 1.9.0.1 preserved the existing profile, administrator sign-in, a saved meeting and a Records request and attachment. Backup and restore recovered the saved meeting and the verified Records attachment. [Signed upgrade and recovery run](https://github.com/townlight/townlight/actions/runs/44863028775).

Back up your city data and settings in Townlight, close the app, run the signed 1.9.0.1 MSI, and reopen it under the same Windows account with the existing profile. On the tested profile, Station required **Set up meeting recording** in Settings → Modules → Townlight Station before it reported ready. After restoring a backup, select **Start** before checking your records.
