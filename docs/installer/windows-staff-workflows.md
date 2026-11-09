# Windows staff workflows

This guide applies to Windows x64 1.8.0.1. Existing 1.7.2.1 installations keep the same data folders and staff accounts. Townlight refreshes the local runtime on the first launch after upgrade.

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

[Download Windows 1.8.0.1](https://github.com/townlight/townlight/releases/tag/townlight-windows-v1.8.0.1) and read its [acceptance summary](https://github.com/townlight/townlight/releases/download/townlight-windows-v1.8.0.1/ACCEPTANCE-Windows-1.8.0.1.md). The same release includes the corresponding source, hashes, signing receipt, and installed evidence.
