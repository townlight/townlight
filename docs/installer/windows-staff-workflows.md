# Windows staff workflows

## Windows 1.8.2.1 maintenance release

Windows 1.8.2.1 packages the staff authorization, explicit database configuration and component metadata corrections. Its exact signed installed checks cover setup, the 1.8.1.1 upgrade, saved staff records, procurement/Contracts handoffs, backup/restore and uninstall retention. Unchanged module and 31-source/34-format import evidence remains attributed to the earlier build that produced it; this is not a new exhaustive test of every module or live provider.

Windows 1.8.2.1 has signed installed acceptance for fresh setup and an in-place upgrade from Windows 1.8.1.1. Before upgrading, back up city data and settings, close Townlight, run the signed MSI, and reopen it under the same Windows account with the existing `%LOCALAPPDATA%\CivicSuite` profile. Keep the prior installer and a restore path. Other upgrade paths are unverified. Station uses its separately configured service. The acceptance summary distinguishes new maintenance checks from reused workflow evidence.

[Release and downloads](https://github.com/townlight/townlight/releases/tag/townlight-windows-v1.8.2.1) · [Acceptance and limits](https://github.com/townlight/townlight/releases/download/townlight-windows-v1.8.2.1/ACCEPTANCE-Windows-1.8.2.1.md).

This guide applies to Windows x64 1.8.2.1. The tested upgrade from 1.8.1.1 keeps existing data folders, staff accounts and saved records. Townlight refreshes the local runtime on the first launch after upgrade.

## Staff access

Select the full Windows profile, finish setup, then use **Finish Records
Migration** in System Health if the workspace still uses legacy data. The
migration enables the local Meetings records used by the Boards attendance
picker and link. Boards & Commissions is available to clerks,
city staff and Townlight administrators. Contracts and Procurement are available
to city staff and administrators. A Townlight administrator records a completed
award decision and can create the linked contract draft. Each save uses the
signed-in staff identity in the local audit trail.

## Boards & Commissions

Create the board and name its liaison. Record each seat with the staff-entered
member and term dates, or leave the member and dates blank to record a vacancy.
The roster distinguishes vacancies, expired terms, and terms ending within
90 days. To record attendance, choose the member and an existing Meetings record.
Open the meeting from the attendance history. The link reads Meetings without
changing its record.

## Contracts

Register the signed agreement with its vendor, staff owner, dates and a PDF
up to 8 MiB. Search the register and renewal queue by title, vendor, owner or status. The renewal
queue uses the deadline supplied by staff. Use Download signed PDF to retrieve
the stored document. A draft from Procurement has a link back to its source.
Record the signed agreement explicitly when it is available.

## Procurement

Save an RFP draft, then enter each proposal, its staff score and exceptions.
Use the comparison to review the entries and advisory flags. An administrator
records the decision the city already made, the awarded proposal, and its
supporting reference. Create draft contract produces one linked draft per
award and returns that draft on retry. Record the final PDF in Contracts.

Public applications, vendor submissions, signing, payments and award decisions
remain city processes. The Windows workspaces record staff work and decisions.

## Release and support

[Download Windows 1.8.2.1](https://github.com/townlight/townlight/releases/tag/townlight-windows-v1.8.2.1) and read its [acceptance summary](https://github.com/townlight/townlight/releases/download/townlight-windows-v1.8.2.1/ACCEPTANCE-Windows-1.8.2.1.md). The same release includes the corresponding source, hashes, signing receipt, and installed evidence.
