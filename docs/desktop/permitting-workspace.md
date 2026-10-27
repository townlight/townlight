# Connected Permitting workspace — signed 1.6.0-beta.1

The explicit permitting-preview composition is publicly delivered as signed [1.6.0-beta.1](https://github.com/townlight/townlight/releases/tag/townlight-records-meetings-code-zoning-planning-permitting-v1.6.0-beta.1). The former unsigned/private-only restriction was removed before publication. Its separate installed identity remains **Townlight Permitting Candidate**, org.townlight.permitting.candidate, desktop 1.6.0-1 / MSI 1.6.0.1. That retained product name is not a publication prohibition.

See the [full product manual](https://github.com/townlight/permit/blob/main/USER-MANUAL.md), [overall guide](../../USER-MANUAL.md) and [assessment](../assessment/feature-and-integration-review.md). Original installers, signed Planning, history, profiles and default downloads remain preserved.

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
