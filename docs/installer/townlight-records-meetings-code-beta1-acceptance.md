# Townlight Records + Meetings + Code 1.3.0-beta.1 — acceptance

Status: published public beta. Exact signed fresh and populated predecessor
upgrade acceptance and public asset delivery verification passed.

## Scope

Explicit city-core selection: Core, Records, Meetings, Code, Notice and Access.
Python/PostgreSQL is the domain authority. Rust retains native integration,
supervision and historical migration/recovery support, not a JSON domain writer.
Human adoption, posting, codification and response approval remain separate.
Restricted material and source history remain protected.

## Supporting evidence

Corrected unsigned C4 MSI SHA-256:
`117d031797cc98ec46d9e28ea56004464a3694a797eea8302e55ada17f580912`.
Fresh connected workflow, populated signed predecessor upgrade, recovery,
offline use, retained-data uninstall and synthetic response/export passed.
Owner accepted this evidence for bounded source retirement. It is not final
release proof and its hash/signature must not be assigned to the new candidate.

After retirement: native suite 169 passed, 0 failed, 3 ignored; 36 suite-state,
manifest and MSI workflow checks passed, plus existing desktop checks.
Seventeen retained historical/schema/privacy/migration functions were unchanged.

## Final source, required checks and signatures

Townlight [PR #265](https://github.com/townlight/townlight/pull/265) merged as
`0c0e098dd3db8bb3f0b55af8f3095bfa3bd3520c`. Required
[verification](https://github.com/townlight/townlight/actions/runs/39515341234),
[archive lifecycle](https://github.com/townlight/townlight/actions/runs/39515341019)
and [desktop/runtime/lifecycle](https://github.com/townlight/townlight/actions/runs/39515341134)
passed. Sunshine [PR #114](https://github.com/townlight/sunshine/pull/114) merged;
its [required CI](https://github.com/townlight/sunshine/actions/runs/39511702544)
passed all 713 collected backend tests.

Bundled exact sources: Records `0218fa51bb0707e0ac63f58475308a77eb8e45ee`,
Meetings `3dd73d0619943beb8ce2965abe7a41dfe596e9be`,
Code `868891bd990588a8337832915e4d91af39ea22cd`.

[Main-only signing run 39520756994](https://github.com/townlight/townlight/actions/runs/39520756994)
passed build, real runtime integration and signed Windows lifecycle. The exact
MSI and actual installed EXE were independently hashed and verified with both
Authenticode and signtool, including timestamps. Receipt source/run matched.

| File | SHA-256 |
| --- | --- |
| `Townlight_1.3.0-1_x64_en-US.msi` (1,632,534,528 bytes) | `c73bc688923297395eac77fd1addcbc542c3b137df8f07ee1f11dea72fdec59e` |
| Installed `civicsuite-desktop.exe` | `0936c70c0acf241a30c86f8914a90c5c88e4329ab73194e5c266f33907fcf6b7` |

Signer: `CN=Scott Converse, O=Scott Converse, L=Longmont, S=co, C=US`.
Certificate thumbprint: `211610DD3231B149519CA51093049E0F4BD50B6C`.
Evidence records `SignatureState=Valid`, `InnerExecutableSignatureState=Valid`,
`PublicationAllowed=true`, `ProductProfile=city-core`.

## Exact signed fresh acceptance — passed

Disposable Windows Sandbox, synthetic data, existing installed WebView scripts:

- Actual MSI install, explicit city-core setup, local admin, optional AI deferral,
  Python/PostgreSQL activation and real runtime health.
- Meetings agendas, proceedings, motion/vote corrections, cited drafts,
  explicit public draft posting before adoption, packet delivery, notice proof
  and completed exact readback. Restricted archive public fetch returned 404.
- Code import/current/historical versions, proposal linked to a real meeting,
  explicit adoption without mandatory motion/minutes, separate codification,
  two permitted managed sources attached to an unapproved Records draft.
- Canonical backup/restore removed an identifiable later mutation and retained
  original Records and Meetings work; repair retained exact connected state.
- Cold restart with no guest default WAN route, exact connected readback and
  a new Records intake while offline.
- Synthetic human response approval and package/export; guest manifest and
  independently hashed exported files matched.
- Normal close stopped app/Python/Postgres. Ordinary uninstall returned 0,
  removed the product, preserved the database and all 23 managed/export hashes.

Response export SHA-256:
`866c59561f50a70c56254a3e0f96db2657af0c02e5074a8a6601dc5417123d42` (7,514 bytes).
Package export SHA-256:
`2c951e2d21d07691eab9f0e756376c2956d21387f34f93287272da544d5497d3` (6,603 bytes).

Environment limits and failed observations are retained, not counted as passes:
the Sandbox required the existing Microsoft-signed per-user WebView prerequisite
and guest-only prerequisite baseline. No workstation security policy changed.
Host administrative extraction to an overlong path failed; actual guest install
and independent verification of its installed EXE passed instead. The recovery
driver's immediate read raced service warmup; later exact state readback and
mutation-absence proof passed without repeating the restore. A first offline
script invocation did not execute; process-scoped execution and actual route,
cold-launch and offline-write proof subsequently passed. No default Smart App
Control compatibility claim is made from this guest baseline.

## Populated signed upgrade — passed

The published signed Records–Meetings 1.2 MSI has SHA-256
`046832e0075e9d7ad1402b949d61b224d13e6ea8133390e1bb833f52dce7f926`.
Installed the actual predecessor, completed setup/activation, created a request
and a meeting with agenda, motion, votes, append-only corrections, manual minutes,
decisions and packet delivery. Captured final file hashes after normal close.
The exact signed 1.3 MSI upgrade returned 0, installed the receipt-matching valid
Scott Converse EXE and left exactly one product registration. The historical
JSON hash remained `42a2e52cb2e0677430f52f78c7813d5b7e2b16e5a39119165e8fe66fa618570b`.

The saved `meetings-beta` selection was preserved. An operator explicitly chose
city-core in the installed Settings UI and repaired the per-user Python runtime.
Exact predecessor Records projection and Meetings proceedings readback passed;
all nine managed source/packet hashes matched. The upgraded app then passed the
Code proposal → actual meeting adoption → separate codification → permitted
Records source attachment workflow and exact subsequent readback. Normal close
left zero app/Python/Postgres processes; the disposable guest was stopped.

Fresh signed evidence supports unchanged recovery/offline/export/uninstall
behavior; it was not pointlessly repeated on the populated-upgrade guest.

## Public delivery — verified

[Public release](https://github.com/townlight/townlight/releases/tag/townlight-records-meetings-code-v1.3.0-beta.1)
published October 20, 2026 at **20:13:28 MDT** (October 21 at 02:13:28 UTC).
Annotated tag resolves to the exact signed source above.
[Draft attachment run 39531182132](https://github.com/townlight/townlight/actions/runs/39531182132)
passed independent MSI/inner-EXE/signature/timestamp/receipt checks and attached
the existing signed artifact, without rebuilding.

GitHub's computed public MSI asset digest matches the accepted SHA-256 and
size above. Anonymous download response followed the release redirect to 200,
with the exact MSI filename and 1,632,534,528-byte Content-Length. An anonymous
download of the public signing receipt was byte-identical to the independently
verified local receipt. No second full 1.6 GB download is claimed or required for
this delivery check. Release is public, `prerelease=true`, not a draft.

The [landing page](https://townlight.github.io/townlight/) and release/manual/
diagram updates are delivered by the documentation-only follow-up; that commit
does not move the signed tag or replace the accepted installer bytes.

No failed candidate is counted as a pass. No optional AI minutes/transcription,
future product completion or real municipal approval is claimed.
