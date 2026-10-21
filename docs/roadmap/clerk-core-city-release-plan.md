<a id="civicsuite-clerk-core-city-release-plan"></a>

# Townlight Clerk-Core City Release Plan

This is the canonical rung plan for the first installable Townlight starter product beta. `docs/CivicSuiteUnifiedSpec.md` is the product authority: the reconciled suite contains 27 product modules plus Townlight Core, and the first release target is Townlight Core plus the Tier 1 clerk-core products Townlight Records and Townlight Meetings.

## Rung 1 - Clerk-Core City Release

This rung proves Townlight Core, Townlight Records, and Townlight Meetings can be installed, started, operated, repaired, backed up, restored, and uninstalled as one Linux-first Docker/browser beta with Windows and macOS wrappers that launch the same Docker/browser workflow. It promotes only the starter clerk-core beta artifacts and keeps every later module outside the write scope until this rung passes its release gate.

Required modules: Townlight Core, Townlight Records, Townlight Meetings.

Scope bullets:

- Reconcile suite truth to the Townlight Unified Specification before product edits.
- Repair active queue authority so Townlight Contracts and later modules remain paused.
- Generate the canonical 27-product-module inventory and compare it with installer metadata, status files, recovery docs, repo state, and active queues.
- Audit Townlight Core, Townlight Records, Townlight Meetings, and the Townlight installer against the specification.
- Finish the clerk-core installer lifecycle for install, start, health, repair, backup, restore, and uninstall.
- Prove Townlight Records request, search, review, and response workflows inside the installed stack.
- Prove Townlight Meetings agenda, packet, minutes, vote, notice, and archive workflows inside the installed stack.
- Prove Townlight Meetings optional Townlight Records visibility where supported.
- Keep AI output cited, staff-reviewed, and non-authoritative.
- Browser-QA public and staff paths at desktop and mobile widths.
- Publish only supported clerk-core starter artifacts and lock release truth through the suite verifier, docs verifier, installer verifier, and release-lockstep gate.

Exit criteria:

- The active queue and project control plane name the clerk-core city release as the only active target.
- Spec inventory records the 27-product-module authority and any discovered metadata drift.
- Townlight Core, Townlight Records, Townlight Meetings, and installer gaps are converted into tracked slices with acceptance checks.
- The starter release artifacts and docs avoid full-suite, procurement, airgap, and macOS lifecycle certification claims.
- Suite checks, runtime checks, installer checks, UX checks, and security checks are recorded with proof.

## Rung 2 - Remaining Spec-Ordered Modules

This rung starts only after Rung 1 passes. It builds the remaining 25 product modules one at a time using the dependency graph and current implementation state from `docs/CivicSuiteUnifiedSpec.md`, with module-specific docs, tests, browser QA, installer integration, release audit, CI, and release-truth gates before each advancement.
