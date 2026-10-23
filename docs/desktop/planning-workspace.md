# Planning staff workspace layout (1.5.1-beta.1 preparation)

These layouts are merged into desktop source and are being prepared for the
opt-in staff beta **1.5.1-beta.1**. The published **1.5.0-beta.1** installer has the
earlier interface. No 1.5.1 installer is signed or released by this preparation;
existing signed installers and historical acceptance evidence remain unchanged.
See the [release preparation](../installer/planning-layouts-beta-preparation.md)
for version identity, reused evidence and remaining acceptance gaps. Planning
remains opt-in; existing native permissions and backend validation apply to every
operation.

Planning opens on **Analyses**. Continue a draft or open a reviewed analysis by
project name. The project filter covers the loaded page only; use Next page for
more saved analyses. Policy library, source administration and Reviewed snapshots
are separate local sections.

In an analysis, use **Analysis** for proposal, staff analysis and private notes.
Selected versioned policies and permitted connected evidence remain alongside
the writing. **Policies & evidence** holds proposal-specific relationships,
applicability notes and Meetings/Zoning evidence search. Adding or removing a
policy retains the rest of the draft. Evidence selection still carries the
expected hash; saving rechecks permissions and integrity.

Use **Save draft** to create an immutable revision. **Review & export** separates
the intended analysis audience, the explicitly edited public summary and review
notes. Save changes first, then confirm review and choose **Record review of
saved draft**. The backend records the signed-in account and date. A reviewed
revision opens read-only; **Edit analysis** starts editing a subsequent draft.
The saved revision state and unsaved-changes indicator are separate. Editing
invalidates any preview and requires saving and review again.

Choose the snapshot audience and preview the saved reviewed revision. The public
preview uses the backend's permitted public summary and citations. Private notes
and full staff analysis are excluded by the existing public snapshot contract;
staff-only snapshots include private notes. The readable document is a
presentation of the exact returned text, available in an expandable disclosure.
**Create reviewed snapshot** creates the immutable version after preview; it does
not publish a document or release a Records response. Read and export saved
snapshots from **Reviewed snapshots**. Exports still verify the expected SHA256.

Local section browsing and shell rerenders retain the in-memory draft. Replacing
it with another analysis or a new analysis asks before discarding edits. Leaving
Planning warns about unsaved work; return to continue it. Drafts are not
autosaved to disk, and session loss/sign-out clears them. Save before closing or
signing out. A failed/conflicting save retains edits for manual reconciliation;
it never retries against a new revision automatically.

Original downloads, source import preview/confirmation, amendment revision IDs,
source and analysis history, Access advice and exact snapshot export remain
available. Provenance identifiers and hashes are secondary disclosures. The
Resident/Public surface retains only its existing permitted search, originals
and public reviewed snapshots; it has no staff editor or source administration.
