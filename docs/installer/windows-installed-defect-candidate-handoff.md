# Windows installed-defect candidate handoff

The published Windows 1.7.0.1 MSI remains unchanged. Its fresh installed audit
found nine confirmed defects. The separate 1.7.1.1 candidate fixes D1-D7/D9/D10
and completed bounded installed acceptance. Tagging, release publication and
replacement of public MSI assets require Scott's approval. Windows only.

## Identities and recovery

| Item | Exact identity |
| --- | --- |
| Public release | [townlight-beta-1-windows-1.7.0.1](https://github.com/townlight/townlight/releases/tag/townlight-beta-1-windows-1.7.0.1) |
| Released source | `706028abab771d0b4c8458e52c759a8bbd9ce3ba` |
| Released MSI | 2,082,697,216 bytes; SHA-256 `8cebaea95fa62f582326a1a0c1af3cb54233c40dbb41d88324170eb1b3f25ade` |
| Candidate binary source | `919f2492cf43a83e693db71fe1371001e529cf40` |
| Candidate versions | Desktop 1.7.1-1; MSI 1.7.1.1; runtime 0.2.1 |
| Candidate product | Townlight Windows Fix Candidate |
| ProductCode | `{980400D4-336D-49F2-A9A0-4B69F9D4FAE5}` |
| UpgradeCode | `{0B97EFAE-2A2E-4E88-A81C-3AAD1A52C2CC}` |
| Signed MSI | 2,081,316,864 bytes; SHA-256 `7553bb3ca457360a99878953f86d54211d77a250129a6744d9d637a2fb4be9e3` |
| Signed EXE | SHA-256 `76d341e69b2db05184715338b065e93a64dd5f19ad1e498706895279a5c92d0e` |

The exact MSI is preserved locally at
`C:/Users/scott/Documents/Codex/tl-01a19d93/windows-fixes/cargo-target/release/bundle/msi/Townlight Windows Fix Candidate_1.7.1-1_x64_en-US.msi`.
Signing results are [EXE run 41956803118](https://github.com/townlight/townlight/actions/runs/41956803118)
and [MSI run 41958130765](https://github.com/townlight/townlight/actions/runs/41958130765).
The MSI run's `signed-native-payload` artifact contains the signed result;
artifact retention is finite. Verify exact size/hash, Scott Converse Valid
Authenticode and Microsoft timestamp after retrieval. This is not a published
candidate download. No MSI is stored in Git or LFS.

Source and evidence delivery use branch `fix/windows-installed-defects-2026-11-04`.
The containing PR and its required checks record integration status. Preserve
the binary source ancestor through normal merge; a later documentation or merge
commit is not the signed build identity. Required checks remain `verify`,
`build Windows Local MSI`, `Windows MSI install/first-run/backup-restore/uninstall lifecycle`,
and `desktop<->TownlightCore real-runtime integration test`, with strict mode.
Do not substitute unsigned routine CI output for the accepted signed MSI.

## What was verified

The [evidence index](evidence/windows-installed-defect-candidate/README.md)
links the report, observation ledger, acceptance identities and ordinary Git ZIP.
The original released audit preserves 477 distinct observed IDs and nine defects;
56 independent exported-file checks passed. These counts are not coverage percentages.

Installed 806efe1 passed D1-D6/D10, Meetings/Code workflows and proposal/adoption,
actual hashed Records links, separately provisioned finite Station recording and
handoff, restore success and failure rollback, and five persisted restart outcomes.
It exposed a real missing smaller-profile provenance fault. Revised 919f249 fixes
that packaging fault and catalog copy; a new installation passed 34 control
checks and three independent provenance checks, including three removals, three
supported-profile reinstalls and retained Records data. All module source pins
are unchanged. Reuse is explicitly bounded by the archived source patch and
`evidence-reuse-boundary.json`; whole workflows were not all rerun on 919f249.

Known limits remain: no automatic photo/audio interpretation adapter; legacy
Meetings governance controls absent from the canonical UI; Station requires
separate setup and its capture UI was not established by API/CLI success;
no continuous/physical/external broadcast acceptance, real SMTP, Internet model
download, broad Windows environment matrix or power-loss testing. Full per-module
limits and unimplemented functions are in the archived original report. Current
candidate model setup was deferred; unchanged real-generation evidence is reused.

## Cleanup and continuation boundary

Both owned guest installs passed Prepare Uninstall and MSI uninstall exit 0.
The final guest had no remaining installation-directory files or product
processes. Both workers stopped; both owned Sandbox guests and clients are absent.
An unrelated saved VM template was untouched. No owned background build/test job
remains. Exact cleanup receipts and final backup manifests are archived.

Earlier 806 MSI SHA-256 is
`bf2126b311170b14fb2b58f40418f61ffec80144eea272c087b7403fde55fcb4`.
It was preserved in sibling directory `msi-806efe1-preserved` before rebundling;
old receipts referring to the reused `msi` output path must be resolved by hash
and `prior-msi-preservation.json`, not path alone. Raw failures remain unchanged.

Do not replay archived worker commands blindly: they are historical execution
evidence with disposed guest IDs and fixtures. Reuse unaffected proof. Additional
retests or rebuilds need a changed input, named defect or required check. The only
remaining release action is Scott's decision about publishing this exact candidate;
source delivery itself is tracked by the containing PR and post-merge checks.
