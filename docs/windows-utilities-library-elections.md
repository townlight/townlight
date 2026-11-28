# Townlight Windows 1.11.0.1 department workflows

Townlight Windows 1.11.0.1 is a signed public beta, desktop build 1.11.0-1, with Townlight Utilities, Townlight Library, and Townlight Elections for staff-led public workflows.

[Signed Windows installer](https://github.com/townlight/townlight/releases/download/townlight-windows-v1.11.0.1/Townlight-Windows-x64-1.11.0.1.msi) · [Release and checksums](https://github.com/townlight/townlight/releases/tag/townlight-windows-v1.11.0.1) · [Installed acceptance](https://github.com/townlight/townlight/releases/download/townlight-windows-v1.11.0.1/ACCEPTANCE-Windows-1.11.0.1.md)

## Access and setup

Named staff permissions, a configured HTTPS portal, SMTP, Records, and host services are required. Configure city-specific settings using the [shared staff guide](installer/windows-shared-staff.md) and [Portal guide](portal/guide.md). The host keeps the authoritative data and runs scheduled delivery while the staff desktop is closed.

## Utilities

An administrator registers the approved billing guidance policy and its version. A clerk opens the original 311 case, selects the cited policy, drafts the reply with protected notes, and explicitly approves the reply. The resident tracker shows the reply and citation, and the resident receives a matching email. Retry the same approved reply using its durable key. The workspace covers guidance and replies.

## Library

Staff save the program title, time, location, public description, and private notes, then a local administrator approves that version. A separate Communications review, approval, and scheduling step publishes the approved snapshot to the portal and sends it to opted-in subscribers. Link the published article revision to the program revision and verify its Records archive. Use this workflow for program announcements. If a delivery returns an uncertain result, reopen the saved article and reconcile its delivery and archive receipts before retrying it.

## Elections

A clerk drafts the checklist with jurisdiction, election, official source URL, and source version. An administrator designates an eligible official who differs from the author, who approves the exact revision. Separate Communications approval publishes it, and a correction is independently approved, uses the same URL, and retains separate immutable Records archives. Use this workflow for staff-approved checklists and corrections. If the link is missing, attach the earlier article revision before scheduling a correction. Leave the previous revision live until the correction publishes.

## Privacy and recovery

Private notes remain staff workpapers and are excluded from public, mail, and archive. An account change clears private UI and late responses. Host authoritative `utilities.sqlite3`, `library.sqlite3`, and `elections.sqlite3` under an explicit `TOWNLIGHT_DATA_DIR` or profile/Data; officials config stays under profile/config.

With existing stopped writers, back up and restore full Data plus config, preserving 311/Comms/Records data. Do not copy live partial DBs. Reopen original IDs, revisions, and receipts after restart.

For recovery, verify the same case IDs, exact article and source revisions, and Records attachments after restart or restore. Shared staff generates receipt and attachment identifiers without disclosing server storage paths.

## Installed verification

A hosted fresh exercise observed all three products plus backup and restore. A two-PC check confirmed Townlight Utilities and Townlight Library’s scheduled portal publication, test email, and a verified Records attachment after desktop exit. That check stopped before reopened-desktop checks and Townlight Elections. An upgrade from 1.10.0.1 reached retained data and Townlight Library, but Elections upgrade and final uninstall preservation remain unverified.

See the [public acceptance summary](https://github.com/townlight/townlight/releases/download/townlight-windows-v1.11.0.1/ACCEPTANCE-Windows-1.11.0.1.md) for installer identity, exact hashes, and the verification boundary. The hosted check uses controlled portal and email fixtures. For a city rollout, validate the configured portal, SMTP, and local recovery process before relying on them.
