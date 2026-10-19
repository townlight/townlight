# Townlight Records 1.1.0-beta.3 — signed installed acceptance

**Result: PASS.** Final installed acceptance completed **2026-10-19 at
02:31:39 MDT / 08:31:39 UTC**. This certifies the bounded Records update below,
not all historical suite requirements or delivery of Meetings and Code.

## Exact release identity

- Tag: `townlight-records-v1.1.0-beta.3`.
- Signed source: `7129b079a9c77b3f21b384c6e5beeb9fc4f45979`.
- [Main signing run 39211809039](https://github.com/townlight/townlight/actions/runs/39211809039): all jobs passed, including installed lifecycle.
- Records source: `62cee04abaec7f908f222e21c5a09b4b7977a575`, retained by the merge of [Sunshine #111](https://github.com/townlight/sunshine/pull/111).
- Desktop integration: [Townlight #260](https://github.com/townlight/townlight/pull/260), all four required checks passed before merge.
- MSI: `Townlight_1.1.0-3_x64_en-US.msi`, 1,631,694,848 bytes.
- MSI SHA-256: `07f4ebe97bccd32db2a10fc5a5df106fd1bb7b499593e07277e712b815ccaff1`.
- Installed `civicsuite-desktop.exe` SHA-256: `350ea134ff8360d9a34f948984fa7e0938e66a93440f49dfd88bcbc10372d166`.
- Independent Authenticode status: **Valid** for both files; timestamps present.
- Signer: `CN=Scott Converse, O=Scott Converse, L=Longmont, S=co, C=US`.
- Signer thumbprint: `A0A2F8534834EDEAB65DCDD929637CA24A9B8636`.
- MSI version: `1.1.0-3` / Windows ProductVersion `1.1.0.3`.

The signing receipt records unsigned and signed hashes, certificate identity,
timestamps, source and workflow run. It was cross-checked against independently
hashed and signature-verified MSI and installed executable. No installed runtime
source was patched during final acceptance. Documentation-only follow-up commits
do not change these bytes or move the tag.

## Fresh installation — PASS

The exact signed MSI installed into a fresh Windows Sandbox and launched the
actual WebView through the normally registered Microsoft WebView2 runtime.
First-run setup created a fictional municipality and local admin, selected the
Records profile and backup location, explicitly deferred optional AI, and passed
real local-service health checks. Explicit activation selected Python/PostgreSQL.

The actual installed controls passed:

- Explicit fictional demo load; deadline/basis and assignment.
- Cited search, human exemption decision, deterministic Access review.
- Human response approval, exact release package/export, fulfillment and closure.
- Public/staff separation, private-contact protection, and wrong-contact rejection.
- Unavailable AI leaves the existing response unchanged.
- Actual CPU local-AI generation using cached weights independently checked
  against pinned SHA-256 `93567e57a8fe10b23569b9d9ec38cd005deedf71e29477c421a4b83f418a538b`.
- Changed manual and AI response text cannot export under the previous approval;
  renewed human approval permits export.
- Adapter-disabled restart, retained closed work, and new offline municipal work.
- Cold backup, real post-backup mutation, restore reversing that mutation while
  preserving earlier work, and runtime repair retaining canonical Records.
- Normal window close stops supervised processes; ordinary MSI uninstall returns
  0 and retains the database/exports; reinstall of the same MSI returns 0 and
  the retained approved/closed work is readable through the UI.
- Reviewed **Prepare Uninstall** removes data/config only with a final backup.
  All **1,572 backup files** independently match manifest sizes and hashes;
  database consistency is `postgres-clean-shutdown-v1`.
- Final MSI uninstall returns 0 and removes the executable/product registration.

## Direct published rc.3 upgrade — PASS

Predecessor MSI SHA-256:
`0edf2b48e56b6f3cb3e01c2e69125afbb18e77bf9246f0fce85277f14e6282a1`.
The real published rc.3 controls created two synthetic requests, completed work,
private contact data, Access evidence, exports and 13 historical audit rows.

Direct upgrade to the final signed beta.3 MSI returned 0, left one product
registration, installed the exact signed EXE and left predecessor JSON unchanged.
The existing **Repair** control refreshed Python services; **Finish Records
Migration** activated the validated import. Comparison found **zero differences**
in existing request fields/nested evidence, notifications/publications, audit
hashes, demo marker and Access evidence.

Independent checks confirmed two imported requests, two historical files,
13 historical audit rows, one Access review, zero unmigrated objects, matching
source/backup/SQL receipt, read-only old JSON, preserved export hashes, valid
canonical audit chain and new work attributed to a real local actor. All six
critical installed and active runtime files match source-derived Windows checkout
hashes from the exact signed commit.

Stopping Python made Records unavailable, without a legacy JSON fallback. New
canonical work and actual backup/mutation/restore passed. Final uninstall returned
0 at **08:06:44 UTC**, removed the app/product entry, and retained database,
authority journal and exports. Synthetic exports and the verified cold backup
were preserved outside the disposable guest.

## Environment and diagnostic limits

- One 16-GiB, GPU-disabled Sandbox at a time. No host model startup, unrelated
  process termination, or workstation security-policy change. Both guests were
  shut down after acceptance.
- The Sandbox image's machine WebView runtime was projected read-only. The
  Microsoft-signed WebView2 155.0.4283.62 installer registered a per-user runtime
  after preserving the stale guest registration. No private executable-folder
  override was used. This verifies a valid supported prerequisite, not that the
  unmodified Sandbox image repairs its own broken runtime registration.
- Guest Smart App Control blocked bundled PostgreSQL. It was disabled only in
  the disposable guest. These results **do not establish operation under enforced
  Smart App Control or an organization's application allowlisting policy**.
  Do not disable workstation protections based on this report; validate your
  organization's permitted runtime configuration before deployment.
- Initial file-hash comparison used local LF rather than Windows CI CRLF bytes.
  Expectations were recomputed from the exact merged Git blobs, not copied from
  installed files; all six exact-byte comparisons then passed. No code changed.
- The copied fresh driver retained an old textarea selector; the existing stable
  selector from the upgrade driver was reused, and recovery resumed from its
  successful backup. An intermediate selector typo also failed before correction.
  These driver failures remain recorded; no product gate was weakened.
- A rapid auxiliary stop sequence hit the application's concurrent-operation
  guard. Independent inspection showed all runtime processes already stopped;
  normal window-close later proved clean shutdown. No refusal was treated as a
  successful service action, and no guard was removed.
- All municipal/person data is synthetic. No owner production profile was migrated.
  The old JSON is historical evidence, not lossless rollback after new work.

## Existing automated evidence

Sunshine CI: **709 backend tests**, **42 frontend unit tests**, **14 browser
cases**, lint/bootstrap/recovery checks, and **zero npm audit vulnerabilities**.
The owner approved the narrow Tailwind/Vitest dependency migration; existing UI
and gates were preserved. Townlight's local existing Rust suite: **206 passed,
2 ignored**; all required remote checks passed. Test-only stale fixtures were
corrected without changing installed product behavior.

Prior unsigned candidate evidence is historical support, not substituted for
these final signed fresh/upgrade journeys. Broader shared-handler retirement,
Meetings, Code and the rest of the suite remain outside this release.
