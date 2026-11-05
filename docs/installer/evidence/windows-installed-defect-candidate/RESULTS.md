# Windows defect candidate acceptance

**Installed acceptance: PASS for the bounded nine-defect fix set. The tested installations and owned Sandboxes have been cleaned up. Source delivery is finishing.** This candidate is unpublished. The released Windows 1.7.0.1 MSI, tag, assets and historical acceptance remain unchanged. This work covers Windows only.

## Scope and exact identities

The [released-MSI audit](../../../outputs/townlight-windows-installed-audit-2026-11-04/REPORT.md) contains the original function-by-function results. It observed 477 distinct case IDs: 409 passes, 10 failure observations representing nine confirmed defects, 38 superseded harness cases, eight cascades, eight expected refusals, two precondition refusals, one unavailable fixture and one unverified observation. These are observed cases, not a percentage of every possible product function.

The authorized fix set is D1–D7, D9 and D10. The unconfirmed D8 readiness observation, absent automatic media interpretation adapter, legacy Meetings controls and external broadcast outputs were not added to this fix set. Their original limitations remain explicit.

| Identity | Value |
|---|---|
| Released source | `706028abab771d0b4c8458e52c759a8bbd9ce3ba` |
| Released MSI SHA-256 | `8cebaea95fa62f582326a1a0c1af3cb54233c40dbb41d88324170eb1b3f25ade` |
| First candidate source | `806efe12df08fa2f9e542d9c8d3c9244ce9889cc` |
| First candidate signed MSI SHA-256 | `bf2126b311170b14fb2b58f40418f61ffec80144eea272c087b7403fde55fcb4` |
| Revised candidate source | `919f2492cf43a83e693db71fe1371001e529cf40` |
| Candidate versions | Desktop 1.7.1-1; Windows MSI 1.7.1.1; runtime 0.2.1 |
| Separate installer product | Townlight Windows Fix Candidate |
| Revised signed EXE SHA-256 | `76d341e69b2db05184715338b065e93a64dd5f19ad1e498706895279a5c92d0e` |
| Revised signed MSI | 2,081,316,864 bytes; SHA-256 `7553bb3ca457360a99878953f86d54211d77a250129a6744d9d637a2fb4be9e3`; ProductCode `{980400D4-336D-49F2-A9A0-4B69F9D4FAE5}` |

The first candidate was installed fresh with exact signatures and hashes verified in `sandbox-evidence/candidate-installed.json`. Its testing found an additional D7 packaging fault and D9 wording issue. It is preserved as evidence, not presented as the final candidate. Revised source 919f249 corrects those findings. EXE signing run 41956803118 and MSI signing run 41958130765 succeeded. The returned MSI independently passed receipt, hash, Scott Converse signature and Microsoft timestamp verification. A new Sandbox installed those exact bytes and verified installed registration, desktop/Access hashes, signatures and the Access CLI.

## Installed results and reuse boundary

| Finding | Actual result on 806efe1 | Primary evidence in `sandbox-evidence` |
|---|---|---|
| D1: Code-only authorization | PASS. Code-only staff use the real Code lookup. Private Records and Access remain denied or absent. | `021-role-public.json` |
| D2: state after sign-out | PASS. Staff export result/path and draft clear on sign-out. A confirmed in-flight operation cannot populate the anonymous session. | `013-inflight-corrected.json`; complete observations retained in `040-before-restart-readback.json` |
| D3: public Meetings and Code | PASS. Anonymous archive/detail/agenda/packet/minutes and public Code reads work. Staff operations remain denied. | `021-role-public.json` |
| D4: stale Inspection analysis | PASS. Removing a citation clears analysis; save and reopen work. Independent database reads verify all three immutable revision hashes, retained original bytes, previous analysis/citations and parent chain. | `025-inspections-readback.json`; `inspection-revision-verification.json` |
| D5: Records source pickers | PASS. Meetings and Code links save real hashed attachments. Disabling their modules hides the pickers; re-enabling returns them. | `023-code-picker-corrected.json`; `033-disabled-pickers.json` |
| D6: refused removal side effects | PASS. A refused dependency removal leaves service health, PIDs, selection and backup inventory unchanged. | `removal-preflight-ui.json`; `removal-preflight-backup-inventory.json` |
| D7: preview lifecycle | Ordered removals PASS. Supported Planning-profile reinstallation FAILS because its provenance file is absent from the payload lock. This real806 failure is retained. Fresh919 passes all three supported-profile reinstalls and retains the saved Records fixture. | `040-before-restart-readback.json`; `031-reinstall-profiles.stderr.txt` |
| D9: catalog and Station guidance | Full-profile and Station guidance PASS. Smaller-profile blocked copy incorrectly blames absent/unsigned payload. Fresh919 passes smaller-profile blocked status/reasons, absence of inaccurate unsigned wording, full-profile copy and Station guidance. | `028-catalog.json`; lifecycle observations in `040-before-restart-readback.json` |
| D10: restore and rollback | PASS. Actual Restore with Explorer open and a directory handle that denies deletion restores changed bytes while preserving the current synthetic cache marker. A real locked-file failure rolls completed moves back and preserves database links. | `recovery-directory-verification.json`; `recovery-rollback-verification.json`; `recovery-after-rollback-links.json` |

The successful directory-preserving restore reported old cleanup paths pending while the handle was held. The raw receipt retains those paths. The rollback test deliberately failed Restore by locking its final file: unchanged current file hashes and later Records readback establish rollback. A small synthetic cache marker was used; this does not establish restoration of a multi-gigabyte model cache. Station's separate database/media are outside the native profile snapshot.

All component module source pins are unchanged between 806efe1 and 919f249. `revision-2/evidence-reuse-boundary.json` and the saved source patch identify the changed packaging/copy paths and the unaffected evidence being reused. Reuse does not mean those entire workflows were rerun on 919f249.

## Workflows, links and persistence

On the fresh 806efe1 installation, nine setup steps, 13 navigation areas, 35 Meetings checks and 20 Code checks passed, including proposal, adoption and codification. The Code workspace rendered and read back persisted data. Meetings and Code each saved a hashed attachment to the same Records request.

Station was explicitly provisioned from the installed payload with its own database role, database and storage. One finite three-second synthetic recording completed. Its downloaded 458,532 bytes had SHA-256 `70a109b3dd801e7b3a0c5cb27c2b2ce37323ec4c4ce400d866c1b28b03bbaede`. Records accepted it, and independent desktop Records readback showed three hashed attachments from Meetings, Code and Station. See `candidate-station-handoff.json` and `040-before-restart-readback.json`. This proves the installed API/CLI worker and handoff, not continuous capture, physical output or a successful UI capture button.

After a normal window close and relaunch of the identical signed executable, all five checked outcomes persisted: three Records links, Meetings proceedings/archive, adopted Code, the saved Access review, and the Inspection original with cleared derived analysis. Services were explicitly started after relaunch. See `045-finish-restart-readback.json`. No new model weights were downloaded; real-generation evidence from unchanged product code remains identified in the original audit.

## Harness failures retained and corrected

`CONTROL-RESULTS.csv` preserves 137 observations across 120 distinct IDs from the first candidate/restart, followed by 34 passing control checks from the fresh919 installation. Seven raw failed observations remain visible: six harness problems and the real smaller-profile packaging failure. Corrected proof is recorded separately.

Corrections covered the review confirmation before an in-flight test; the actual Code picker selector; human text preceding workspace JSON; the Inspection original being a sibling of the case form; revision metadata versus database payloads; and preview installation through a supported profile rather than an absent individual Install control. Additional transport attempts retained their failures: PowerShell 5.1 unsigned-handle conversion, null Process.ExitCode despite a completed Station recording, required same-origin Station headers, services initially stopped after relaunch, and a cases list already open. A null worker exit code is never treated as a pass without actual outcome evidence.

## Cleanup and remaining work

For 806efe1, Prepare Uninstall made its final backup and removed setup/data. MSI removal returned 0, removed its registration and desktop executable, and left no product processes. Ten backup manifests and the final guest inventory were preserved. Eight fixture/residue files were enumerated before disposal. The worker stopped and the owned Sandbox was closed; the CLI inventory and Sandbox clients were empty afterward. `guest-cleanup-verification.json` records this. An unrelated saved VM template was untouched.

Fresh919 also passed all three independent installed provenance hash/identity checks, nine setup controls, Records migration, 13 navigation controls, three ordered removals, three supported-profile reinstalls, data retention, two subset catalog assertions and two full-profile/Station guidance assertions. See `revision-2/sandbox-evidence/070-final-installed-proof.json` and `installed-profile-provenance.json`. The final installed executable was unchanged before Prepare Uninstall. Independent disk checks confirm a final backup manifest and removed Data/config. Fresh919 MSI removal returned 0, removed registration/executable, and left zero product processes or installation-directory files. Its worker stopped; the owned Sandbox and clients are absent. Backup manifests and exact receipts were preserved. The evidence archive and complete member manifest are verified. Source integration is recorded by the containing PR and its required checks. No new tag, public release or released-asset replacement is authorized.
