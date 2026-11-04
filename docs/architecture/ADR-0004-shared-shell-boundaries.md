# ADR-0004: Define shared shell conventions before extracting shared frontend packages

## Status

Accepted.

## Context

All 26 Townlight catalog modules now have v0.1.0 runtime-foundation releases. Many expose public or staff-facing pages, but each module remains independently installable and independently releasable. The unified spec requires shared accessibility, navigation, public-trust conventions, visible focus states, keyboard-complete workflows, and actionable empty/error states.

The temptation after the foundation lane is to extract a shared React package immediately. That would create coupling before the suite has enough evidence about which shell elements are truly shared, which belong to module-specific workflows, and which belong only in umbrella documentation.

## Decision

Townlight will define shared staff and resident shell conventions first, then extract shared implementation only after at least one production-depth workflow proves the stable surface.

The boundary is:

- Module repos own their runtime pages, workflow-specific forms, API-backed state, and module-specific error handling.
- The umbrella repo owns suite-wide documentation, public orientation, compatibility, deployment profile docs, and design/UX conventions.
- Townlight Core may eventually own shared shell primitives only after the conventions have been validated in active module work.
- No module must import a shared frontend shell package until an ADR accepts the extraction and defines versioning/compatibility rules.

## Consequences

- Shared UX rules are enforceable immediately through docs, browser QA, and release gates.
- Modules keep independent installability.
- The suite avoids premature frontend coupling.
- A future shared shell package remains possible, but it must be justified by repeated module usage and audited UX evidence.
