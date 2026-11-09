# Windows staff workflows

This guide applies to the unpublished Windows 1.8.0.1 candidate. The current
public installer and its documentation remain the reference for released behavior.

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
remain city processes. The candidate records staff work and decisions.

## Candidate handoff

The suite's pinned source list is in `config/inspections-preview-sources.json`.
The Windows workflow builds the application and payload from those sources.
Record the exact signed MSI hash, signing receipt, Windows CI, fresh-install
workflow and role evidence, and upgrade from public Windows 1.7.2.1 before
promoting the candidate. This guide does not constitute installed acceptance.
