# Windows staff workflows

## Windows 1.11.0.1

Townlight Windows 1.11.0.1 is a signed public beta, desktop build 1.11.0-1, with Townlight Utilities, Townlight Library, and Townlight Elections for staff-led public workflows. Read the [department workflow guide](../windows-utilities-library-elections.md) and [installed acceptance](https://github.com/townlight/townlight/releases/download/townlight-windows-v1.11.0.1/ACCEPTANCE-Windows-1.11.0.1.md).

For an existing city, make and verify a backup before testing an upgrade. The 1.10.0.1 upgrade exercise confirmed retained data and the Library workflow. Elections after upgrade and final uninstall preservation remain unverified. Use an isolated copy for evaluation.

## Staff access

Select the full Windows profile, finish setup, then use **Prepare Records** in System Health if the workspace still uses legacy data. The
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

## Private Records attachment downloads

Authorized Records staff signed into the shared Windows workstation should open Records Requests and an existing saved request. Beside the private managed document, choose **Download private attachment**, then choose a new destination file or cancel. Townlight compares the byte count and SHA-256 before saving and reports the destination, count, and hash; protect the workstation copy as private Records evidence, with review and publication kept separate.

## Release and support

[Download Windows 1.11.0.1](https://github.com/townlight/townlight/releases/tag/townlight-windows-v1.11.0.1) and read its [acceptance summary](https://github.com/townlight/townlight/releases/download/townlight-windows-v1.11.0.1/ACCEPTANCE-Windows-1.11.0.1.md). The same release includes the corresponding source, hashes, signing receipt, and installed evidence.
