# Shared Shell UX Inventory

Status: active convention inventory
Applies to: staff and resident/public pages across Townlight modules
Decision anchor: `docs/architecture/ADR-0004-shared-shell-boundaries.md`

## Purpose

This inventory records the first shared shell conventions for Townlight without creating a shared frontend package yet. It is intentionally practical: it describes what users should see and what QA should verify.

## Boundary

| Layer | Owns |
|---|---|
| Module repo | Runtime pages, module-specific workflows, API-backed state, module-specific empty/error messages, browser QA evidence |
| Umbrella repo | Suite-wide orientation, compatibility, deployment docs, shared UX conventions, documentation landing page |
| Townlight Core future extraction | Only repeated, proven shell primitives accepted by ADR |

## Navigation

Required conventions:

- Every runtime page names the module plainly.
- Staff pages should identify whether the user is in staff, public, or evaluation mode.
- Public pages should expose a clear path back to the module home surface.
- Cross-module links must be honest. If integration is not wired, label it as a handoff or future integration, not a live workflow.

QA checks:

- Keyboard can reach every navigation control.
- Focus is visible.
- Link text is meaningful out of context.
- Public pages do not expose staff-only routes as if they were public features.

## Page Title Hierarchy

Required conventions:

- One visible page title per page.
- Section headings describe user tasks, not internal implementation.
- Current-state labels distinguish shipped foundation behavior from roadmap aspiration.

QA checks:

- Heading order is logical.
- Page title matches the route intent.
- Version/status text matches repo version surfaces and compatibility matrix rows.

## Status Cards

Required conventions:

- Status cards must use text plus shape/label; never color alone.
- Cards should identify owner, current state, next action, and source/evidence where relevant.
- Compliance-related cards must tell the user what to do next.

QA checks:

- Color is not the only signal.
- Empty status values have actionable fallback copy.
- Status wording does not imply legal/official determination unless the module actually provides one.

## Empty States

Required conventions:

- Empty states explain why nothing is shown.
- Empty states provide the next action.
- Empty states should avoid blame language.

Good pattern:

`No packet snapshots are available yet. Create a packet snapshot from a posted meeting packet, then return here to review immutable versions.`

Bad pattern:

`No data.`

QA checks:

- Every empty state names the missing thing.
- Every empty state gives a fix path.

## Error States

Required conventions:

- Error messages must say what happened and how to fix it.
- Validation errors must identify the field and expected shape.
- Compliance errors must include source/statutory context when applicable.
- No user-facing error should say only `Something failed`.

QA checks:

- Every error state has fix instructions.
- Errors are reachable by keyboard/screen reader.
- Form focus moves to the relevant error summary or field.

## Evidence And Citation Panels

Required conventions:

- Any AI-like answer or draft that relies on source material must show source references.
- Citation panels should distinguish official source, local file, staff note, and sample/demo source.
- If source material is missing, the UI must refuse or degrade clearly.

QA checks:

- Citations are visible without relying on hover-only affordances.
- Source labels are understandable to non-technical municipal staff.
- Demo/sample citations are labeled as sample material.

## Export And Download Affordances

Required conventions:

- Export actions must name the output format.
- Export actions must disclose whether the result is records-ready, draft, or sample.
- Download buttons must not imply system-of-record write-back.

QA checks:

- Export format is visible before click.
- Download copy distinguishes public-record export from internal draft.
- Export failure states include a retry/fix path.

## Browser QA Requirements

Every frontend or docs landing-page change must capture:

- Desktop screenshot.
- Mobile screenshot.
- Console-error check.
- Keyboard/focus check when controls are interactive.
- Copy review for current-state honesty.
- Explicit check of loading, success, empty, error, and partial states when those states exist.

## First Extraction Gate

Do not create a shared shell package until all are true:

- At least two production-depth modules repeat the same shell primitive.
- Browser QA evidence shows the primitive behaves correctly on desktop and mobile.
- The primitive has no module-specific policy dependency.
- A new ADR defines package ownership, versioning, compatibility, and fallback behavior.
