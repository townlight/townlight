# Clerk-Core Public-Use Release-Gate Audit - 2026-05-21

Audit mode: release-gate.

Scope: Townlight Clerk-Core starter release only: Townlight Core, Townlight Records,
Townlight Meetings, and the `clerk-core` installer profile. Queued product modules are
out of scope and remain unpromoted.

Audited live baseline: Townlight main merge SHA
`eaf71ea83e5022a06cf28cf18937e010ee6b88b6`.

Verdict: PASS FOR CLERK-CORE PUBLIC-USE STARTER RELEASE.

No unresolved Blocker or Critical findings remain for the starter release scope.
This audit does not certify procurement use, production hosting, airgap use,
the full Townlight module catalog, live cross-module records exchange, or
macOS matching-host lifecycle behavior.

## 1. Executive Audit

Static audit confidence: high for suite release truth, installer metadata,
verifier bindings, and current public-facing documentation.

Runtime sign-off confidence: high for Linux matching-host lifecycle through CI,
high for Windows matching-host lifecycle from local package evidence, and medium
for macOS beta support because macOS has archive/readiness evidence only.

Release posture: Clerk-Core starter is ready to publish as
`installer-clerk-core-v0.1.0`.

## 2. Audit Coverage Ledger

| Lane | Status | Evidence |
|---|---|---|
| Remote parity | Checked | Main SHA `eaf71ea83e5022a06cf28cf18937e010ee6b88b6` verified after PR #161 merge. |
| CI/workflow presence | Checked | Main verify run `26210542980`; installer-cleanroom run `26210542979`. |
| Linux install path | Checked | Linux matching-host lifecycle passed install, repair, verify, workflow proof, backup, restore, and uninstall. |
| Windows install path | Checked | Local Windows matching-host lifecycle evidence passed all lifecycle modes. |
| macOS install path | Partially checked | macOS archive/readiness passed; matching-host lifecycle is not certified. |
| First boot and health | Checked | Lifecycle proof includes install and verify modes. |
| Backup and restore | Checked | Linux and Windows lifecycle evidence include PostgreSQL dump and `pg_restore` probe evidence. |
| Runtime workflows | Checked | Installed proof covers Townlight Records request/search/review/response and Townlight Meetings agenda/packet/minutes/vote/notice/archive. |
| Auth and role boundaries | Checked | Townlight Meetings source fix gates protected staff API loading behind staff-session success; matrix records missing/spoofed staff-role probes. |
| Browser verification | Checked | Matrix records 20 desktop/mobile browser checks and 154 deduplicated installed routes. |
| UI states | Checked | Loading, success, empty, error, and partial states are recorded where supported. |
| Docs truthfulness | Checked | Current-facing docs distinguish starter public-use release from full-suite/city/procurement/macOS lifecycle claims. |
| Version and release consistency | Checked | Suite verifier expects Townlight Records `1.6.1`, Townlight Meetings `1.0.1`, and final installer tag `installer-clerk-core-v0.1.0`. |
| Test realism | Checked | Townlight Records and Townlight Meetings release verifier scripts passed locally; suite verifier binds JSON evidence, not prose alone. |

## 3. Claim Verification Matrix

| Claim | Verdict | Evidence |
|---|---|---|
| Townlight Records current release truth is `1.6.1` | True | Main verify run `26210542980` logs `[townlight_records] PASS 1.6.1`. |
| Clerk-Core workflow proof exists | True | Main verify logs `[clerk-core-workflow-proof] PASS`; lifecycle logs include starter workflow proof. |
| Linux full lifecycle is proven | True | Installer-cleanroom run `26210542979`, job `linux archive full lifecycle`, passed on rerun. |
| Windows full lifecycle is proven | True | `docs/installer/clerk-core-final-package-evidence-2026-05-21.md` records matching-host Windows lifecycle pass. |
| macOS lifecycle is certified | False | macOS is explicitly bounded to beta-level archive/readiness only. |
| Full Townlight municipal-completion claim | False | Only the Clerk-Core starter profile is promoted. |
| Live cross-module records exchange is proven | False | Evidence covers installed starter workflows, not live cross-module records exchange. |

## 4. What The Dev Team Needs To Do Now

Publish the final release-tag truth package, attach the regenerated Windows,
macOS, Linux archives and SHA256SUMS, and keep release notes bounded to the
Clerk-Core starter profile.

## 5. Next-Sprint Watchlist

After this release, generate the next-module order from
`docs/TownlightUnifiedSpec.md` and the current repository maturity map. Do not
start queued module implementation until the Clerk-Core release tag and CI are
green.

## 6. Engineering Deep Dive

The verifier now binds the public-use gate to structured matrix JSON, route
count, deduplication, UI state coverage, adversarial probe statuses, and final
release-gate phrasing. The release does not depend on prose-only PASS strings.

## 7. Security And Authorization Deep Dive

Townlight Meetings protected staff APIs no longer load before staff-session success.
The installed matrix records public/staff boundary checks, missing staff-role
checks, and protected-state copy. AI output remains staff-reviewed and
non-authoritative.

## 8. UI/UX Deep Dive

The installed matrix captures public and staff browser paths at desktop and
mobile widths. It records console/focus/copy observations and distinguishes
rendered evidence from readiness verdicts.

## 9. Product/PM Deep Dive

The release scope is intentionally narrow: first usable city starter profile
for records and clerk operations. The remaining product modules are not
promoted and are not described as complete.

## 10. Documentation Deep Dive

Docs now use three distinct terms: Clerk-Core public-use starter release,
queued module work, and unsupported certifications. Current-facing docs do not
claim macOS lifecycle certification, procurement readiness, production hosting,
airgap readiness, full-suite release, or live cross-module records exchange.

## 11. Install / Bootstrap / Seeding Deep Dive

The installer supports archive extraction, readiness, plan, install, repair,
verify, backup, restore, and uninstall for the Clerk-Core package path on the
proved platforms. macOS is beta-level archive/readiness until a Darwin host
runs the matching lifecycle.

## 12. Version And Release Consistency Deep Dive

The final tag is `installer-clerk-core-v0.1.0`. Starter module versions remain
Townlight Core `1.1.0`, Townlight Records `1.6.1`, and Townlight Meetings `1.0.1`; no
downstream package pin moves in this promotion.

## 13. Test Engineering Deep Dive

Suite verification, docs verification, installer-plan verification, release
lockstep, local module release verifiers, and installer-cleanroom lifecycle
proofs cover the release surfaces. The public-use matrix verifier rejects
duplicate routes, missing states, stale missing-record probes, and failed
browser checks.

## 14. Runtime QA Deep Dive

Linux lifecycle proof is CI-backed at the final merged main SHA. Windows
lifecycle proof is local matching-host evidence against the regenerated package.
macOS runtime QA is intentionally limited to archive/readiness.

## 15. Cross-Cutting Synthesis

The starter release has enough evidence to publish as a public-use Clerk-Core
starter profile. The release remains bounded, honest, unsigned, and explicitly
separate from full-suite/city/procurement/airgap/macOS-lifecycle claims.

## 16. Verification Gaps And Sign-Off Limits

The audit does not sign off external municipal validation, procurement
certification, airgap deployment, production hosting hardening, native installer
signing, or macOS matching-host lifecycle. Those are not claimed by this
release.
