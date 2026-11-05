# Historical handoff snapshot before Windows 1.7.1.1 publication

This is an earlier checkpoint, not current release instructions.

# Townlight Windows Beta 1 release and closeout handoff

Updated 2026-11-04 after the 18:16:58Z merge. Windows documentation, required PR CI and Suite source integration are delivered. The released signed MSI remains unchanged.

## Released Windows artifact — preserve

The [public Windows x64 1.7.0.1 prerelease](https://github.com/townlight/townlight/releases/tag/townlight-beta-1-windows-1.7.0.1) points to `706028abab771d0b4c8458e52c759a8bbd9ce3ba`.

| File | SHA-256 |
| --- | --- |
| Townlight-Candidate-Windows-x64.msi | 8cebaea95fa62f582326a1a0c1af3cb54233c40dbb41d88324170eb1b3f25ade |
| Townlight-Candidate-706028a-Corresponding-Source.zip | a83be287bd91129292f9cf505b956141466636c9cf7a391f1097b723863ef6d5 |

The exact signed MSI passed fresh Windows Sandbox acceptance. Coverage: Meetings lifecycle/proceedings; Code proposal/adoption; paired-loopback recorded-file Station→Records exact private-original handoff; Access review/export and actual local-model rewrite/Spanish drafts, persistence/restart/export and Records attachments; Notice content-bound review/approval, proof, archive and Records readback; selected Zoning/Planning/Permitting/Inspections paths; auth refusal; backup/restore; legacy-profile refusal; uninstall preserving data. Model acceptance used 16 GiB; the 8 GiB timeout saved no draft. See [attached acceptance and limits](https://github.com/townlight/townlight/releases/download/townlight-beta-1-windows-1.7.0.1/ACCEPTANCE-Windows-1.7.0.1.md). [Scott Converse signing receipt](https://github.com/townlight/townlight/actions/runs/41591822423). No new MSI was signed or published during this closeout. The separately authorized unsigned CI build is for testing only. Public asset digests remain unchanged.

## Documentation — delivered

[Site #5](https://github.com/townlight/townlight.github.io/pull/5), [profile #9](https://github.com/townlight/.github/pull/9) and [site #6](https://github.com/townlight/townlight.github.io/pull/6) are merged. Pages reports exact commit `f6e3744106709e99d7f51de112659605d3cf1d37` built; 41 live pages/manual downloads matched the published source. All twelve owner documentation PRs merged:

| Repository | PR | Merge commit |
| --- | --- | --- |
| access | [#19](https://github.com/townlight/access/pull/19) | `5c702ecbdc70a234b2a5d0c92dd93635f5cd9a18` |
| core | [#80](https://github.com/townlight/core/pull/80) | `042b53d68a18ac43e85705494e67d02ae14f8259` |
| inspect | [#21](https://github.com/townlight/inspect/pull/21) | `ea4f72193a4781defc8b6ba7578c3c3684b31cb0` |
| meetings | [#190](https://github.com/townlight/meetings/pull/190) | `0755751a77cae551f33526b25e2102a075f05e70` |
| notice | [#15](https://github.com/townlight/notice/pull/15) | `b15c77cc42af6c4db2ed1d0f5b7fb33cee88301d` |
| ordinances | [#90](https://github.com/townlight/ordinances/pull/90) | `d31769ffda4fbfbc02ad9479bf4621b29ba04bce` |
| permit | [#24](https://github.com/townlight/permit/pull/24) | `77fccc844daf6619bf4b7ced76a335b5203ce729` |
| plan | [#25](https://github.com/townlight/plan/pull/25) | `0374aa88b87e5ca90dc310ba7399678e94bae6bf` |
| station | [#8](https://github.com/townlight/station/pull/8) | `857ec888b130cab708442d0d90685789a5f639d6` |
| sunshine | [#127](https://github.com/townlight/sunshine/pull/127) | `8ae0ec88cc79be5d3692fb23c57c98dc923f6f6d` |
| townlight | [#299](https://github.com/townlight/townlight/pull/299) | `aa4ea889fc107215d5fcb257dbbef9db0c30d3be` |
| zone | [#29](https://github.com/townlight/zone/pull/29) | `64b116b81cc910282d58e52e2da8b444387c01f9` |

Current guides describe the released Windows MSI and bounded acceptance. Twelve DOCX/PDF manuals were regenerated; all 12 expected diagrams across ten illustrated manuals embedded and rendered. Access/Notice manuals are text-only. Source API contracts and immutable receipts/release-time snapshots were preserved. Installed documentation and the corresponding-source ZIP were not replaced. No blanket certification, real city deployment, every Word-client rendering, live-vendor or physical broadcast claim is made.

## Source integration and CI — delivered

Scott explicitly approved the required Windows CI-only build and installer lifecycle checks, normal merge of Suite PR #297 when they pass, and the exact required integration-check name correction. The published MSI must remain unchanged. Linux and macOS work remain excluded.

[Suite PR #297](https://github.com/townlight/townlight/pull/297) merged normally at `7f5c28a7de11d129569c07573bd137df0374c179` on 2026-11-04T18:16:58Z, from exact head `3a610a435f2b8479589ec4fdf6f9184a59285ece`. All required checks passed before merge: [Windows build/integration/lifecycle 41875346661](https://github.com/townlight/townlight/actions/runs/41875346661), [verify 41875347618](https://github.com/townlight/townlight/actions/runs/41875347618), and [Windows archive plans 41875346895](https://github.com/townlight/townlight/actions/runs/41875346895). The merged main tree is exactly the passing head's tree, `b5424181344f14329d7abc85142f76fd7cf70649`.

New Windows CI evidence covers real-runtime integration, desktop browser and Rust checks, executable build/startup, unsigned MSI packaging/classification, installation and installed executable verification, launch, repair, isolated first-run/backup/restore tests, uninstall and removal verification. CI artifact `townlight-windows-local-msi-UNSIGNED` (artifact ID 13348564677) is test-only, with publication forbidden. This is not a replacement for the released signed MSI or new signed Sandbox acceptance. The original signed product-workflow acceptance remains bound to `706028a`.

Corrections completed: current published documentation merged into the source; stale profile expectations and Records import names fixed; Rust formatting corrected; installer verifier explicitly scoped to Windows, including PowerShell launcher arguments; token authority corrected to the exact candidate Core source3021821, with unchanged vendored CSS. All20 affected Permitting/Inspections native fixture checks passed locally under the same synthetic TESTING environment as CI. The final scoped installer verifier passed and changed zero of123 observed Linux/Mac files. Remaining suite-state, public-status and token-authority checks passed locally; hosted verify also passed on the final head.

An earlier local verifier invocation accidentally generated cross-platform test archives. It was stopped. Generated output was inventoried and preserved, and exactlynine tracked output files were restored after byte/backup verification. No released artifact was touched. This scope error was corrected in the verifier and CI invocation. Receipts are in the local ci-reconciliation directory identified below.

The two later Linux repair commits remain reachable from the original PR history and are reversed in the Windows source. Linux lifecycle jobs are disabled and automatic archive matrices contain Windows only. No Linux/Mac release or lifecycle work is authorized.

After all required CI passed, the explicitly approved integration-context correction was applied. Main retains four strict required GitHub Actions checks bound to app 15368: `verify`, `build Windows Local MSI`, `desktop<->TownlightCore real-runtime integration test`, and `Windows MSI install/first-run/backup-restore/uninstall lifecycle`. Before/after comparison confirmed that only the context name changed (GitHub reordered the list); admin enforcement and every other protection remained unchanged. No admin merge override was used.

Post-merge verification confirmed PR MERGED, main at `7f5c28a`, an identical passing/merged tree, unchanged branch protection, and the unchanged public release tag plus MSI/source ZIP digests above. GitHub automatically started an additional main-push Windows run [41885591864](https://github.com/townlight/townlight/actions/runs/41885591864), created 2026-11-04T18:17:01Z. Live verification on 2026-11-04 confirmed that this run completed successfully, including the Windows build, real-runtime integration and installer lifecycle. It is owned by this closeout's merge and expected to finish build/integration/lifecycle successfully. Its terminal success is recorded; it does not replace the original signed installed acceptance. Cancellation, if Scott stops owned work, is `gh run cancel 41885591864 -R townlight/townlight` after verifying its head. No new workflow was manually dispatched. Post-merge [Pages deployment 41885591441](https://github.com/townlight/townlight/actions/runs/41885591441) and [Portal verification 41885591616](https://github.com/townlight/townlight/actions/runs/41885591616) both passed. No local CI observer, Sandbox/VM or computer-use session remains active.

## Open Hall and public announcement — delivered 2026-11-04

The selected Open Hall brand package is saved in `docs/brand/` and published at https://townlight.github.io/brand/. Suite #300, site #7 and profile #10 merged. Package hashes, published download bytes, light/dark favicon and desktop/mobile rendering passed. Application and installer branding is reserved for the next software update.

Suite #301, site #8 and profile #11 corrected stale announcement/support instructions and published the current Windows 1.7.0.1 beta announcement, exact MSI download, fresh-profile boundary, separate Portal deployment and all kept-product feedback routes. The homepage now has a direct Windows beta download. Public pages: https://townlight.github.io/announcement.html and https://townlight.github.io/support.html. GitHub's generic Latest endpoint remains the older stable release; current links use the explicit beta tag and asset. The profile repository overview now agrees with the organization profile.

Merged commits: Suite `314ac1e5db6a16dcd9bff3eb9c0cdc3e88a36f4a`, site `580abd91e8c751ff3ef408a2c8be63e083817735`, profile `d0ac1959239301114f35c90861da70ee55083e01`. Required verify run 41902736634 passed. The existing docs-only desktop detector 41902736261 passed with unchanged software jobs skipped. Site deployment 41902903954 succeeded. Suite postmerge workflow 41903155856 and Pages deployment 41903155363 also succeeded, with software jobs skipped as designed.

Chrome checks passed on seven representative pages at 1440/390 pixels, with no missing images, horizontal overflow or console errors. The direct published MSI URL returned HTTP 200 with expected size 2,082,697,216 bytes. Live announcement, support, homepage download and documentation navigation were verified. The brand package, released MSI/source, tag, checksums, acceptance and historical evidence were preserved. No external social or email announcement was sent.


## Core follow-up

[Core PR #79](https://github.com/townlight/core/pull/79) remains open and absent from the MSI. Its diff sorts catalog rows before hashing, preserving canonical digests while eliminating database-collation ordering differences. The issue was reproduced during Linux repair. Windows applicability remains unproven; successful signed-MSI startup/restart acceptance is bounded evidence, not proof for every Windows database collation. It is not a confirmed Windows release defect or a basis for an unsolicited rebuild. No Linux/macOS validation or Core merge was performed for this closeout.

## Pickup boundaries

Read this issue and the linked released acceptance first. Inspect live #297, #79, branch protection and `handoff/windows-closeout-prepared` before acting. Preserve all original artifacts, signatures, source identities, historical names, standalone CivicCast, Station Rust, user data and rollback assets. The approved legacy profile exception is `%LOCALAPPDATA%\CivicSuite` only; other retained old active identifiers need Scott's approval and the exception registry. No Git LFS was used.

The requested Windows documentation and Suite merge are delivered. There is no pending #297 merge or CI-approval decision. The earlier main-push Windows run passed. Core #79 remains a separate open follow-up; preserve the distinction between signed installed acceptance and later source CI. A new signed binary, tag, release or replacement of the released MSI is not authorized by this closeout. Linux/macOS work is excluded. Do not turn the unproven Core follow-up or a duplicate main-push run into an invented release requirement.

Local state and audit: `outputs/townlight-naming-migration/STATE.md` and `WINDOWS-DOCUMENTATION-AUDIT.md` in Scott's `C:/Users/scott/Documents/Codex/2026-11-02/rea` workspace. Prepared source is on GitHub, so recovery does not depend on those local files. No active Sandbox/VM or computer-use session belongs to this closeout. The earlier verified cleanup reclaimed about 51.5 GB while preserving release/rollback/source/evidence; do not delete shared storage or unrelated work.
