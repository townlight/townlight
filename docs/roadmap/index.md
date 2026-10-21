<a id="civicsuite-roadmap"></a>

# Townlight Roadmap

This roadmap starts from a hard truth: **"all repos have releases" is not the same thing as "a city can run on this suite."** The destination is a deployable, operable, supportable municipal product suite with shared security, identity, upgrade, governance, and integration patterns. The path has to be staged, with hard exit criteria and explicit ownership of the seams where suite projects usually fail.

## Current Status

- Developer preview: `civicrecords-ai`
- Productizing: `civicclerk`
- Foundation / planned: 26 additional product modules, including newly specified `CivicRegWatch` and `CivicAPI`
- Shared platform: `civiccore v1.1.0`

Current phase: **`Phase 1: Platform And Security Extraction` is underway.** `Phase 0: Continuity` is complete, the auth extraction pattern has already been proven across multiple consumers, and the shared notice-compliance helper is now proven in both `civicnotice` and `civicclerk`.

New module scope added on 2026-04-30:

- `CivicRegWatch`: planned federal regulatory intelligence module. Detailed implementation contract: [`../../specs/05_civicregwatch.md`](../../specs/05_civicregwatch.md).
- `CivicAPI`: planned public read-only data gateway over human-approved Townlight publication records. Detailed implementation contract: [`../../specs/06_civicapi.md`](../../specs/06_civicapi.md).

## Phase 0: Continuity

Goal: make the project survivable before deeper platform and product expansion.

Deliverables:

- add a second GitHub org owner by a committed date
- add `SUCCESSION.md` or equivalent charter section by a committed date
- document release-signing custody, credential custody, and emergency access procedures
- document maintainer recovery and handoff procedures for all release-critical repos
- assign named owners for continuity artifacts, not just intent

Exit criteria:

- second org owner is in place
- `SUCCESSION.md` exists and is reviewed
- release and credential custody are documented well enough that a second maintainer can continue operations
- continuity is no longer dependent on one person's implicit knowledge
- `Phase 1` cannot begin until `Phase 0` exit criteria are met

## Phase 1: Platform And Security Extraction

Goal: turn `civiccore` into the real shared substrate for the suite, including the security posture required for municipal review.

Sequencing rule:

- `auth` lands first as the proven extraction pattern, then the remaining extractions follow the same rollout playbook

Shared platform work:

- complete `auth` into a stable RBAC contract
- ship minimal `search`
- ship `verification`
- ship `notifications`
- ship `onboarding`
- ship `ingest`
- extract the highest-value reusable `civicrecords-ai` platform capabilities, including exemptions and secure connector primitives

Shared security work:

- extract SSRF defense patterns into reusable platform utilities
- extract encrypted configuration and credential-handling patterns
- define shared secret-handling and key-rotation expectations
- create a suite-level security baseline that modules inherit by default
- draft a documented suite threat model suitable for city security review

Proof model:

- each extracted capability must land in `civiccore`
- each must be proven in `2-3` consumer modules
- each must have a documented rollout playbook
- rollout is not considered complete until another module can adopt the pattern without bespoke work

Exit criteria:

- extracted subsystems are shipped and versioned in `civiccore`
- `2-3` consumer modules pass release gates with each major shared pattern
- rollout playbooks exist for the remaining modules
- the threat model and platform security baseline are documented
- platform growth is reducing per-module invention rather than increasing it

## Phase 2: Two Deployable Products

Goal: prove the suite can produce more than one credible municipal product.

Products:

- keep `civicrecords-ai` hardening as the flagship
- drive `civicclerk` to the second true product

Required work for `civicclerk`:

- full auth/RBAC on real workflows
- real operator UX, not just workflow scaffolding
- public/staff separation
- installer and deployment docs
- backup/restore and upgrade path
- seeded demo environment
- admin and operator docs
- fresh-machine install rehearsal
- browser-verified UX and release evidence

Identity and security requirements:

- treat the shipped Townlight Meetings OIDC browser-session foundation as the baseline, not as unbuilt work
- prove a real municipal IdP configuration story before production pilot use
- ensure both products satisfy the shared security baseline from Phase 1

Integration ownership during this phase:

- assign an interim owner for cross-module integration decisions during joint product deployment
- `Phase 4` will formalize whether that ownership lives in `civiccore`, an umbrella deployment repo, or a formal suite integration contract

Exit criteria:

- two products can be installed by a municipal IT team
- two products can be installed together without conflicts in identity, ports, audit, or upgrade order
- both have documented backup, restore, upgrade, rollback, and admin flows
- both can pass a realistic internal deployment rehearsal

## Phase 3: Shared Productization Pattern

Goal: make module productization repeatable, upgradeable, and contributable.

Shared module pattern:

- auth/RBAC pattern
- persistence pattern
- public/staff UI pattern
- search/retrieval pattern
- audit/provenance/export pattern
- install/seed/smoke-test pattern
- browser QA and docs verification pattern

Upgrade-path pattern:

- define how `civiccore` upgrades flow into module upgrades
- formalize the two-layer migration story: shared platform migration expectations plus per-module Alembic expectations
- document a mechanical adoption sequence for future `civiccore` minor releases
- require that a foundation module can absorb a new `civiccore` release in a known number of repeatable steps

Contributor path:

- treat the shared module pattern as the outside-contributor pattern too
- define how a second maintainer or city partner contributes a connector, adapter, or module improvement without inventing process
- update suite contribution docs to reflect the real platform/module workflow
- prove the contributor path by landing at least one real or deliberately scoped synthetic external-style contribution through it

Initial consumers for this pattern:

- `civicbudget`
- `civiccourt`
- `civicdata`
- `civicapi`
- `civicregwatch`
- `civiclegal`
- `civicelections`
- `civichr`
- `civiclibrary`
- `civicparks`
- `civicutility`

Exit criteria:

- the productization pattern is documented and reused
- the upgrade path is documented and repeatable
- a new `civiccore` minor-version bump can be absorbed by a foundation module without bespoke redesign
- outside contributors have a documented and proven contribution path that maps to the same pattern

## Phase 4: City Starter Set

Goal: define and prove the first deployable municipal bundle.

Starter set:

- `civicrecords-ai`
- `civicclerk`
- `civicbudget`
- `civiclegal`
- `civicnotice`
- `civicdata`
- `civichr`

This phase is about composition, not just product count. The suite needs an explicit owner for the cross-module integration surface. That ownership can live in `civiccore`, an umbrella deployment/integration repo, or a formal suite integration contract, but it must be named and maintained.

Cross-module integration scope:

- shared identity and role semantics
- shared audit and provenance expectations
- shared retention and export semantics
- Townlight API publication-gate contracts for public read-only records
- Townlight Regulatory Watch escalation contracts into Townlight Legal and Townlight Meetings
- shared deployment assumptions
- shared admin/operator conventions
- defined upgrade order and compatibility rules across modules

Exit criteria:

- the starter set deploys as one coherent bundle
- modules compose without identity or upgrade collisions
- shared retention, audit, and export behavior are aligned
- the install and operations docs describe one suite deployment, not seven adjacent products

## Phase 5: Operational Integrations

Goal: connect the suite safely to the systems cities already use.

Integration order:

- file drop and CSV import
- safe API connectors
- selective system-of-record sync
- GIS where module value depends on it
- mail/SMS/print integrations
- backup targets, observability, and operational hooks

This phase assumes Townlight Meetings's OIDC browser-session foundation is already present and that production work now means municipal IdP configuration proof, operator docs, and deployment hardening.

Exit criteria:

- integrations are bounded, documented, and supportable
- connector failures are visible and recoverable
- sovereignty guarantees remain consistent with product claims
- cities can connect the starter set to existing operational systems without custom archaeology

## Phase 6: Operational Readiness

Goal: make the suite something a municipal IT department can own over time.

Operational maturity work:

- Authenticode code-signing implementation and documented maintenance procedures
- monitoring and alerting
- patch and upgrade workflows
- backup and restore drills
- disaster recovery procedures
- support and troubleshooting playbooks
- admin onboarding
- threat model refresh and security review artifacts
- key rotation and secret management maturity
- procurement-readiness evidence set:
  - signed threat model
  - SBOM
  - documented incident response process
  - evidence of patch cadence

Exit criteria:

- a city IT team can install, operate, recover, patch, and upgrade the suite without maintainer improvisation
- the suite can survive procurement, IT, and security review with documented evidence
- supportability is demonstrated, not assumed

## Phase 7: Governance Maturity

Goal: make the project sustainable as a public product suite, not just survivable.

Governance maturity work:

- maintainer onboarding beyond the continuity minimum
- external contributor triage and review workflow
- upstream path for city-contributed adapters and connectors
- public roadmap/status hygiene
- discussion/community channels that map to actual contribution paths
- clearer suite-level editorial ownership for README, compatibility, and release claims

Exit criteria:

- project governance supports more than one active maintainer
- outside contribution is realistic and documented
- suite-level communication is honest, current, and maintainable

## Phase 8: City-Scale Proof

Goal: prove the suite in a realistic municipal scenario before claiming it can run a city.

Proof environment:

- a seeded demo-city harness, not a real municipal pilot
- cross-module workflows across the starter set and beyond
- staff/admin/public flows
- install from scratch
- upgrade from prior release
- failure injection and recovery
- documentation walk-throughs
- time-to-value measurement for a new deployment

Exit criteria:

- one coherent demo city runs across the suite bundle
- cross-module workflows can be demonstrated live
- every major README-level claim can be shown in a real environment
- the suite is credible as a municipal operating platform, not just as a code portfolio

## Immediate Sequence

1. Use the shared extraction consumer rollout playbook for the next `civiccore` fan-out work.
2. Keep extracting reusable `civicrecords-ai` and `civicclerk` capabilities into `civiccore` when they will serve more than one module.
3. Use `civicclerk v1.0.1` as the second-product reference for mock-city contracts, integration-depth contracts, unsigned-installer operator guidance, and site-specific deployment proof slots.
4. Define the shared upgrade-path pattern before broadening more platform dependency fan-out.
5. Stand up the explicit cross-module integration ownership model for the starter set.
6. Resolve the Townlight API and Townlight Regulatory Watch ADRs before scaffolding runtime repos.
7. Continue keeping umbrella status, taxonomy, and continuity docs current as the roadmap advances.

The current consumer rollout pattern is documented in [shared-extraction-consumer-rollout.md](shared-extraction-consumer-rollout.md).

## What "Done" Means

The suite is not "done" when all modules have releases. It is "done enough to claim city use" when:

- continuity no longer depends on one person
- the platform carries shared auth, security, verification, search, onboarding, and upgrade patterns
- at least two products are truly deployable
- the starter set works as one system
- municipal IT can install, operate, secure, and recover it
- governance maturity supports honest public communication and real upstream participation
- the public claims can be demonstrated live
