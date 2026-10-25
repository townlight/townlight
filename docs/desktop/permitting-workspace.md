# Connected Permitting candidate

The explicit `permitting-preview` composition is an unsigned development candidate,
not a public release. It extends the accepted Planning runtime with configured
municipal intake requirements and the actual `civicpermit` migrated repository.
Default product profiles, download links, prior installers and frozen Planning
contracts are unchanged. The separate MSI product is **Townlight Permitting
Candidate**, identifier `org.townlight.permitting.candidate`, version `1.6.0-1`
(Windows `1.6.0.1`). Signing/publication is rejected by its build resolver.

Use Settings to select the Permitting staff candidate, then activate the canonical
runtime using the existing backed-up migration controls. Only city staff or local
administrators can use the workspace. Native session proof maps to the persisted
SQL account; browser-provided actor names, roles, arbitrary URLs and output paths
are not accepted. Optional AI is not needed for this workflow.

1. Open **Permitting → Requirement library**. Choose a JSON requirement bundle,
   inspect its title, jurisdiction, effective date, original hash, citations and
   material checklist, then explicitly import it. The bundle schema is
   `civicpermit.workflow_models.RequirementBundle`. Fictional sources stay labelled.
   A later import under the same ID requires the current revision and retains history.
2. Create an intake case using a selected requirement revision. Enter the project,
   property/location, applicant contact and assigned staff. Assess each required
   material and retain private notes. The checklist is staff work, not an official
   completeness decision.
3. Search **Code** and **Zoning** for permitted source documents and select cited
   versions. Search/save/export recheck the actual provider, public visibility and
   exact source SHA256; unavailable sources never fall back to sample or cached text.
4. **Save intake draft**, reopen it, reconcile any concurrent-edit conflict and
   explicitly **Record staff review** with review notes. Changes create new drafts;
   reviewer identity and review date come from the authenticated backend.
5. Create a private staff packet or **Preview Records copy**. Write and review a
   separate public summary first. The Records copy excludes applicant contact,
   location, full proposal, material notes and private staff notes. Its public
   Code/Zoning source context and requirement citation remain included.
6. Inspect and save the exact hash-checked packet, or attach the reviewed copy to an
   existing Records request. Attachment does not approve, fulfill or release that
   request. Records rechecks the selected evidence on later release operations.

Schemas are added only during explicit migration. Requirement originals, case
revisions, packets and audit events are retained; no destructive downgrade exists.
Existing coherent backup/restore behavior is reused. Unsaved edits require Save.
The candidate does not issue permits, calculate fees, schedule inspections, make
entitlement determinations, expose a public applicant portal or write into a permit
system of record.

Validation is limited to affected persistence/native/UI/Records behavior and
repository-required CI, followed by one actual installed native journey using
fresh fictional data. Source/browser checks do not by themselves establish
installed acceptance. Existing unaffected product and recovery evidence is reused.
