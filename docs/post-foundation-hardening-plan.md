# Post-Foundation Hardening Plan

Status: active planning document  
Applies after: all 26 catalog modules have runtime-foundation releases and the v0.1.1 CivicCore alignment lane is complete  
License: AGPL-3.0-only

## Purpose

The foundation and v0.1.1 alignment lanes proved that every CivicSuite catalog module can live in the CivicSuite organization, depend on released CivicCore, ship documentation and browser-visible UI, and pass an auditable release gate.

The next phase is not "build another module." The next phase is making the suite easier to deploy, operate, integrate, and deepen into real municipal workflows without weakening the boundaries that made the foundation lane safe.

## Governing Rules

This plan follows the canonical rules in `docs/CivicSuiteUnifiedSpec.md`:

- Staff workflows come before flashy resident features.
- AI drafts; humans decide.
- Every material answer cites source material.
- Local inference and no outbound telemetry remain the default.
- No module may require outbound runtime calls in the default local deployment profile.
- Connectors start with file drop, CSV, and export/import paths before vendor write-back.
- Current-state truth must stay separate from roadmap aspiration.
- CivicCore extracts shared capabilities only when active module work proves the need.

## Lane 1 - Suite Integrity And Release Reliability

Goal: make the current 26-module foundation set easier to verify, transfer, install, and audit.

Deliverables:

1. A suite-wide release inventory that checks every repo for:
   - AGPL-3.0-only license files.
   - README, README.txt, CHANGELOG, user manual, landing page, support/security/contributing docs, issue template, PR template, and discussion seed posts.
   - Current version surfaces.
   - Branch protection.
   - Release assets and checksums.
   - Current CivicCore compatibility where applicable, with `civiccore==0.3.0` as the active foundation pin except for historical releases recorded in the compatibility matrix.
2. A suite-wide verification script in the umbrella repo that calls each module's docs/release gate without hiding failures.
3. A stale-state scanner that catches planned-vs-shipped drift across README files, landing pages, manuals, compatibility matrix rows, and the unified spec.
4. A single post-foundation status report that replaces per-module sprint fragments as the operator-facing summary.

Recommended first task:

Create `scripts/verify-suite-state.py` in the umbrella repo. It should read a declarative module inventory and verify local clone paths, default branches, tags, release versions, CivicCore pins, docs artifacts, and compatibility-matrix rows.

Initial status:

`scripts/verify-suite-state.py` now exists as the first Lane 1 artifact. The default run verifies local clone paths, version truth, docs artifacts, CivicCore pins, and compatibility-matrix rows. Passing `--remote` also verifies GitHub release tags and uploaded assets through `gh release view`.

Why first:

The suite now has many repos. Before adding production depth, we need one reliable way to prove the repo set is coherent.

## Lane 2 - Deployment Profile

Goal: make the suite installable as a real local municipal stack without pretending every module is production-complete.

Deliverables:

1. A documented local deployment profile covering:
   - CivicCore.
   - CivicRecords AI.
   - One or more runtime modules.
   - PostgreSQL 17 with pgvector where needed.
   - Redis and Celery where needed.
   - Ollama as the default local LLM provider.
2. A sample `docker-compose` profile that starts a bounded demo stack.
3. A no-network runtime test proving default local operation does not require outbound calls.
4. Operator docs that distinguish:
   - Developer install.
   - Clerk/staff evaluation install.
   - Production pilot install.

Recommended first deployment target:

CivicRecords AI + CivicClerk + CivicCode + CivicZone.

Why:

Those modules form the most obvious clerk/planning records workflow: records intake and search, meeting/agenda workflows, municipal code lookup, and zoning/parcel explanations.

Initial status:

`deploy/post-foundation-demo.compose.yml`, `docs/deployment/local-demo-profile.md`, and `scripts/verify-deployment-profile.py` define the first bounded local demo profile for CivicRecords AI, CivicClerk, CivicCode, and CivicZone. The verifier checks compose shape, local-first LLM defaults, version-pinned module wheels, deployment docs, and no-network in-process health smoke checks for CivicClerk, CivicCode, and CivicZone.

## Lane 3 - Shared Staff And Resident Shell Boundaries

Goal: define the first reusable UX shell without collapsing modules into a monorepo.

Deliverables:

1. A shell-boundary ADR describing what belongs in:
   - Each module.
   - A shared CivicCore or CivicSuite shell package.
   - The umbrella documentation site.
2. A design-system inventory covering:
   - Navigation.
   - Page title hierarchy.
   - Status cards.
   - Empty states.
   - Error states.
   - Evidence/citation panels.
   - Export/download affordances.
3. Browser QA requirements for shared shell changes.
4. A first shared-shell spike that does not require every module to adopt it immediately.

Recommendation:

Start with documentation and browser-visible conventions, not shared React package extraction.

Why:

The modules are independently installable. A premature shared frontend package would create coupling before the UX vocabulary is stable.

Initial status:

`docs/architecture/ADR-0004-shared-shell-boundaries.md` and `docs/ux/shared-shell-inventory.md` define the first shared shell boundary and UX inventory without extracting a shared frontend package.

## Lane 4 - Connector And Import Templates

Goal: create practical data paths for small municipalities before attempting vendor write-back.

Deliverables:

1. A connector-template ADR defining read/import/export phases.
2. File drop and CSV import patterns for:
   - CivicRecords AI records exports.
   - CivicClerk agenda/meeting packet source imports.
   - CivicCode code-section import.
   - CivicZone zoning/parcel sample import.
3. Export-bundle conventions with manifest files and checksums.
4. No write-back connector work until import/export paths are stable and audited.

Recommendation:

Start with file drop, CSV, and static export bundles.

Why:

Small cities can use those immediately. They are inspectable, air-gap friendly, and safer than direct vendor-system writes.

Initial status:

`docs/architecture/ADR-0005-connector-import-export-boundaries.md` and
`docs/connectors/import-export-template.md` define the first suite-wide
connector boundary. The accepted sequence is read/import first, export bundles
second, and vendor write-back only after a later ADR approves it.

## Lane 5 - CivicCore v0.3.0 Extraction Candidate

Goal: extract only shared capabilities that active hardening work actually needs.

Candidate scope:

1. Hash-chained audit log primitives.
2. Shared source/document metadata contracts.
3. Connector manifest schema.
4. City profile/onboarding configuration model.
5. Shared export-bundle manifest utilities.

Recommendation:

Do not start with auth/RBAC.

Why:

Auth/RBAC is important, but it hardens quickly into product policy. The first post-foundation lane benefits more from audit logging, source provenance, import/export manifests, and deployment configuration. Those are lower-risk shared primitives that every module needs.

Initial status:

`docs/architecture/ADR-0006-civiccore-v0-3-extraction-scope.md` and
`docs/civiccore/v0.3-extraction-proposal.md` define the recommended v0.3.0
scope: audit primitives, source/provenance contracts, connector/export manifest
schema, city profile configuration, and export-bundle utilities. Auth/RBAC,
full ingestion/search, live connector runtime, notifications, and shared shell
package extraction stay out of scope for v0.3.0 unless a later ADR changes the
boundary.

## Lane 6 - First Production-Depth Workflow

Recommended first workflow:

CivicClerk agenda packet and notice workflow, integrated with CivicRecords AI source records, CivicCode citations, and CivicZone references.

Why:

It is high municipal value, visible to staff and the public, naturally citation-heavy, and already has the deepest module foundation. It also forces the right shared capabilities: auditability, source provenance, exports, local deployment, and shell conventions.

Out of scope for the first depth pass:

- Automatic legal determinations.
- Public-comment production behavior unless an ADR accepts it.
- Transcription unless an ADR accepts it.
- Vendor write-back.
- Cloud LLM requirement.

Initial status:

`docs/architecture/ADR-0007-first-production-depth-workflow.md` and
`docs/roadmap/civicclerk-production-depth-workflow.md` define the first
production-depth sprint: CivicClerk agenda packet and notice workflow,
integrated through read-only source/provenance paths with CivicRecords AI,
CivicCode, and CivicZone, and dependent on CivicCore v0.3.0 primitives if those
primitives are used.

## Execution Order

1. Suite integrity script and report.
2. Deployment profile for CivicRecords AI + CivicClerk + CivicCode + CivicZone.
3. Shared shell boundary ADR and UX inventory.
4. Connector/import/export template ADR plus file-drop/CSV patterns.
5. CivicCore v0.3.0 extraction proposal.
6. CivicClerk-centered production-depth workflow sprint.

## Done Definition For This Plan

This plan is ready to move into execution when:

- It is linked from the roadmap.
- The compatibility matrix still passes verification.
- The unified spec still identifies post-foundation sequencing as the active open question.
- No current-facing docs claim unfinished hardening work is shipped.
