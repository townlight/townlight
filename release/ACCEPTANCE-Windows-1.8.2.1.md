# Townlight Windows 1.8.2.1 installed acceptance

- Application source `993d47567799cd8f676fb514daea7edb3636eb0b`
- Signed Windows x64 MSI SHA-256 `b14b8dff9164f216fa4785a55df38c8a47e829837c0619220807602946d58f4b`
- Product registration **Townlight**, version **1.8.2.1**.
- Corresponding source SHA-256 `bac6706de89549c9016c8c6e581538a629adbb28bc71e8659ea1e23e1209bc99`; includes the exact Suite commit and fourteen pinned component sources.
- Timestamped Azure Trusted Signing publisher **Scott Converse**. Both the MSI and embedded desktop executable were independently signature-verified by the signing and release jobs.
- [Signed build and MSI lifecycle](https://github.com/townlight/townlight/actions/runs/44681169076) · [Upgrade acceptance](https://github.com/townlight/townlight/actions/runs/44690151304) · [Fresh recovery acceptance](https://github.com/townlight/townlight/actions/runs/44689480672). The exact signed bytes are promoted without rebuilding or re-signing.

## New evidence for this release

| Check | Result |
|---|---|
| Fresh Windows install | Exact signed MSI installed on a disposable hosted Windows runner; version/registration, first-run city/admin setup and installed WebView/services passed. |
| Staff workflows | Anonymous authorization checks, board roster/attendance, procurement solicitation/proposals/award, Contracts handoff, signed document and renewal workflows passed against the installed runtime. |
| Upgrade from 1.8.1.1 | Installed the hash-verified previous public MSI, saved staff records, upgraded to these exact signed bytes, and read back the same records and completed setup. City profile, administrator configuration and document marker hashes were retained. |
| Fresh-install backup and restore | Backup, restore and saved record readback passed. |
| Uninstall | Application and Windows registration removed; city configuration and PostgreSQL database retained in both fresh and upgrade checks. |
| Required Suite CI | [PR #318](https://github.com/townlight/townlight/pull/318) passed all four required checks before merge: verify, Windows MSI build, real-runtime Core integration and MSI lifecycle. |
| Windows component suites | Core 475 passed; Records 725 passed; Meetings 675 passed/3 skipped; Code 223 passed/3 skipped; Zoning 91 passed; Boards 43 passed; Contracts 43 passed. These are source/CI results, distinct from installed acceptance. |

The Records Windows result includes later test-fixture corrections. Its packaged
production files are byte-identical to the frozen Records source pin; the
installed-evidence ZIP includes `records-production-reuse.json` documenting that
comparison. Those test-only changes did not trigger another MSI rebuild.

The initial fresh/upgrade harness stopped at the Meetings form because it had
omitted the documented **Finish Records Migration** operator action. First-run
setup had completed. The corrected harness performs that action before canonical
Meetings work and reuses the exact MSI from the successful signing/build job.
The original failed attempts are retained; their overall workflow status is not
represented as a fully passing installed run.
The first corrected fresh run passed staff work, then the harness incorrectly
expected restore to restart services automatically. The final fresh check follows
the documented Start action and verifies saved records before reporting recovery.
The upgrade harness also waited for CDP before the app had rendered during its
automatic runtime refresh, causing an overlapping native-state request to hit the
profile maintenance guard. The final upgrade check waits for the rendered app.
Each correction retried only its affected installed mode, retaining passed evidence.

## Changes and unchanged evidence

This maintenance build packages the corrected component pins, staff authorization,
explicit database credential configuration, license documentation and displayed
runtime/component versions. Records is 1.8.0.dev3; Boards and Contracts are 0.2.1;
Procurement is 0.3.1; Runtime is 0.3.2. Station remains the same pinned Python
beta-1 service. Separate Rust CI does not add its kernel to this installer.

The [1.8.1.1 acceptance](https://github.com/townlight/townlight/releases/download/townlight-windows-v1.8.1.1/ACCEPTANCE-Windows-1.8.1.1.md)
retains the original 31-source/34-format import and cross-module evidence. Those
unchanged workflows were not exhaustively repeated for this maintenance MSI.
Fixtures and captured public responses do not establish every live provider.
Earlier release evidence remains attributable to its original build.

## Install and upgrade

Fresh installations use the signed MSI and normal first-run setup. For an upgrade
from **1.8.1.1**, back up city data and settings, close Townlight, run the MSI and
reopen under the same Windows account with the existing
`%LOCALAPPDATA%\CivicSuite` profile. Keep the prior installer and restore path.
Other upgrade paths are unverified. Station uses its separately configured service.
No Mac, Linux or signing-authentication migration is part of this release.

[Suite manual](https://townlight.github.io/manuals/suite.html) ·
[Import sources and formats](https://townlight.github.io/manuals/meeting-imports.html) ·
[Support](https://townlight.github.io/support.html)
