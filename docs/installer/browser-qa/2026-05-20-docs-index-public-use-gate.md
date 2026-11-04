# Docs Index Browser QA - Public-Use Gate Link

Status: PASSED

Date: 2026-05-20

Scope: `docs/index.html` after adding the Clerk-Core public-use readiness gate
link and refreshing the current status table.

## Checks

| Check | Viewport | Status | Evidence |
|---|---:|---|---|
| docs-index-desktop | 1440x1000 | passed | screenshots/2026-05-20-docs-index-public-use-gate/docs-index-desktop.png |
| docs-index-mobile | 390x844 | passed | screenshots/2026-05-20-docs-index-public-use-gate/docs-index-mobile.png |

## Results

- The page rendered the expected H1:
  `An open-source municipal product suite that runs on the city's own hardware.`
- The Clerk-Core public-use readiness gate link appeared twice, in quick links
  and in the "Where to go next" section.
- The status table renders the starter profile as 2 product modules plus
  Townlight Core.
- Console messages: none.
- Page errors: none.
- Horizontal overflow: false at desktop and mobile widths.
- Keyboard focus: first Tab reached the skip link as expected.

This QA evidence covers only the static docs landing page update in this slice.
