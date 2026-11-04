# Clerk-Core Installed Browser QA - 2026-05-19

Status: PASSED

Scope: local Docker/browser install of Townlight Records 1.6.1 and Townlight Meetings 1.0.1 for the Clerk-Core starter product. This evidence was captured before the suite PR #150 port-isolation fix and remains valid for the installed browser surfaces; PR #153/main CI separately proves the current package cleanroom baseline after the TownlightRecords port-isolation and Windows cleanup-evidence fixes. This is browser/user-facing QA evidence, not a claim of city production deployment or macOS lifecycle certification.

## Runtime

- Townlight Records health: ok 1.6.1
- Townlight Meetings health through nginx /api proxy: ok 1.0.1

## Browser Checks

| Check | Product | Viewport | Status | Screenshot |
| --- | --- | --- | --- | --- |
| records-login-desktop | Townlight Records | 1440x1000 | passed | docs/installer/browser-qa/screenshots/2026-05-19-clerk-core-installed-workflows/records-login-desktop.png |
| records-login-mobile | Townlight Records | 390x844 | passed | docs/installer/browser-qa/screenshots/2026-05-19-clerk-core-installed-workflows/records-login-mobile.png |
| records-admin-desktop | Townlight Records | 1440x1000 | passed | docs/installer/browser-qa/screenshots/2026-05-19-clerk-core-installed-workflows/records-admin-desktop.png |
| clerk-staff-desktop | Townlight Meetings | 1440x1000 | passed | docs/installer/browser-qa/screenshots/2026-05-19-clerk-core-installed-workflows/clerk-staff-desktop.png |
| clerk-staff-mobile | Townlight Meetings | 390x844 | passed | docs/installer/browser-qa/screenshots/2026-05-19-clerk-core-installed-workflows/clerk-staff-mobile.png |
| clerk-public-desktop | Townlight Meetings | 1440x1000 | passed | docs/installer/browser-qa/screenshots/2026-05-19-clerk-core-installed-workflows/clerk-public-desktop.png |
| clerk-public-mobile | Townlight Meetings | 390x844 | passed | docs/installer/browser-qa/screenshots/2026-05-19-clerk-core-installed-workflows/clerk-public-mobile.png |
| clerk-protected-error-desktop | Townlight Meetings | 1440x1000 | passed_with_expected_protected_state | docs/installer/browser-qa/screenshots/2026-05-19-clerk-core-installed-workflows/clerk-protected-error-desktop.png |

## UX / QA Notes

- Desktop and mobile widths were checked for Townlight Records sign-in, Townlight Meetings staff workflow, and Townlight Meetings public portal.
- Townlight Meetings staff was checked with bearer staff auth through the installed nginx path, proving React `/api/...` calls reach FastAPI through the Docker/browser product path.
- The unauthenticated Townlight Meetings staff path intentionally renders an actionable protected-state message with fix guidance.
- Keyboard focus was advanced with Tab in every checked page and recorded in the JSON evidence.
- Console warnings/errors, page errors, failed responses, and horizontal overflow are recorded per check in the JSON evidence.
