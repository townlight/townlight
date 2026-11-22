# Windows shared staff for Meetings and Records

Shared staff uses one Windows host as the system of record. It runs the same signed Townlight desktop and bundled runtime as the workstations. The host owns the PostgreSQL database, managed files, recording hardware and Station. The staff workstations open the existing Townlight desktop in shared mode. Their edits go to the city host, and downloaded files are copies. The normal stand-alone install does not enable this mode.

## Prepare the city host

1. Install the Windows MSI on the host. Before first run, select a Windows account owned by the city for this host. Use one protected absolute Windows profile and data path that IT can reproduce on a replacement host. You can set `TOWNLIGHT_DESKTOP_STATE_DIR` to choose the profile path before setup. Keep the managed folders on a local Windows volume and grant access only to the host account and authorized IT administrators.
2. Run Townlight under that Windows account, finish setup with Meetings and Records available, and prepare the Records runtime. Set up Station with the host's camera and microphone if you will record meetings. Create separate named Townlight Clerk and Records Staff accounts under Settings. Existing City Staff and Local Admin can perform the work those roles already allow. The Code Staff role grants no shared Meetings or Records authority. Account management stays on the host. An older local admin still using the legacy passcode format must first sign in on the host to migrate to the current format.
3. Set `TOWNLIGHT_SHARED_STAFF_HOST=1` for the host Windows account. Leave `TOWNLIGHT_SHARED_ORIGIN` unset on the host. Restart the runtime after changing the configuration. The installed executable supports `--townlight-staff-host start`, `--townlight-staff-host health` and `--townlight-staff-host stop`. Use the executable path shown by the installed shortcut. Run these commands under the same Windows account and from a newly started process that has the environment. In PowerShell use `Start-Process -Wait -PassThru -WindowStyle Hidden` and check `ExitCode` for scripted startup.
4. For routine Windows startup, create an IT-owned Task Scheduler task that runs the installed executable with `--townlight-staff-host start` under that same Windows account. Choose boot startup if the city's account policy allows it, or startup at that account's login. Verify runtime health after a Windows reboot and use the matching `stop` command for maintenance. Station has its own Windows login task for access to capture devices. Log that account into Windows before recording and keep it signed into Windows during recording. Signing out of a Townlight work session does not stop a host service.
5. Configure your private HTTPS reverse proxy on the city network or VPN. Use a certificate trusted by workstation Windows, with the city hostname in the certificate. Route `/staff/v1/*` to `127.0.0.1:15480` on the host, preserving the whole path and query. Deny every other path on this hostname. Keep database, runtime and Station ports on loopback. Do not log the request bodies or session header. Allow bounded request bodies up to 24 MiB and sufficient timeout for a host-side recording copy. A private Caddy configuration, with the city's own certificate and key, is one way to provide this:

   ```caddyfile
   staff.city.example {
       bind 10.0.0.20
       tls C:\CityTLS\staff.crt C:\CityTLS\staff.key
       @staff path /staff/v1/*
       handle @staff {
           reverse_proxy 127.0.0.1:15480
       }
       handle {
           respond 404
       }
   }
   ```

## Connect a workstation

Install the same Windows MSI and set `TOWNLIGHT_SHARED_ORIGIN=https://staff.city.example` for the workstation account. Close Townlight fully and reopen it after setting the variable. Keep `TOWNLIGHT_SHARED_STAFF_HOST` unset on the workstation. Sign in with your named city account. Passwords and short-lived staff proof travel over validated TLS and the proof stays in the native client. Signing out revokes that workstation's session when the host is reachable. Disabling an account or resetting its passcode on the host invalidates its active sessions. A host restart clears staff sessions.

Clerks prepare council packets in Meetings. Source files selected on a workstation are copied and verified by the host. Downloaded council packet files are workstation copies. Records staff can work on a request, attach a completed private Station recording by its ID and verified SHA-256, prepare original and release copies, and draft and approve the reviewed Records response. The host records the real operator. A changed draft requires refreshing and reviewing the current version before approval. Records release export finalization and Station capture or administration stay on the host. The staff host endpoint is separate from any city website or public publishing endpoint.

An installed headless staff client can also use `--townlight-staff-client` under that workstation environment. Provide UTF-8 JSON lines over redirected standard input, one action per line. It replies with one JSON result envelope per action. It accepts the same `auth_action`, `get_app_state`, `meetings_domain_request`, and `records_domain_request` commands as the Windows UI. Use an isolated fixture account for troubleshooting. Never persist sign-in input to logs or shell history.

If the workstation loses its connection while saving, retry the same action with the same inputs from the open Townlight window. If Townlight reports that it cannot determine the outcome, or if the workstation was restarted, refresh from the host and check whether the change already exists before submitting it again.

## Recover onto a replacement host

Use the normal Townlight backup and verify that it includes the city database and managed file store. If Station is configured, the same backup also contains a separate verified Station schema dump and its recordings. Keep the completed backup in city-controlled storage outside the host. City IT should protect the backup and its escrow separately.

The ordinary backup omits the secrets needed to read the copied PostgreSQL cluster and encrypted connector data. While the original host is available, create an encrypted escrow from the verified backup with `desktop/scripts/Protect-TownlightRecovery.ps1`. Use a city recovery document-encryption public certificate. Keep its private key separately in the city's recovery system so the replacement host's authorized operator can use it. The script never puts plaintext secrets into the ordinary backup.

```powershell
.\Protect-TownlightRecovery.ps1 -Action Export `
  -ProfileRoot C:\TownlightCity -BackupDirectory D:\CityBackup\townlight-manual-backup-EXAMPLE `
  -EscrowFile E:\Recovery\townlight-EXAMPLE.cms -Recipient C:\CityTLS\recovery-public.cer
```

On the replacement, reproduce the same absolute profile and data paths so stored references remain valid. Install the matching MSI, initialize Townlight under the replacement Windows host account, and set up the same locations. System Health selects the newest eligible backup. Preserve automatically created setup backups separately and place only the verified city backup in the configured backup folder before selecting Restore. Keep the local Suite database stopped after restore. Import the escrow before starting Suite services, using the imported city recovery certificate in the recovery account. The script compares the backed-up PostgreSQL control file, the exact original backup manifest, and the control file already restored on the target. A mismatch stops the operation.

```powershell
.\Protect-TownlightRecovery.ps1 -Action Import `
  -ProfileRoot C:\TownlightCity -BackupDirectory D:\CityBackup\townlight-manual-backup-EXAMPLE `
  -EscrowFile E:\Recovery\townlight-EXAMPLE.cms
```

The replacement Station service provisions new Windows-protected credentials and restores the logical Station backup. Recheck the camera and microphone on the replacement host. Reprovision any separately managed feed or website credentials. Start the shared runtime, then verify one named staff sign-in, a packet file hash, the private Station recording ID and hash, and the corresponding attached Records files before returning the host to service. Never start the old and replacement city hosts as concurrent writers.
