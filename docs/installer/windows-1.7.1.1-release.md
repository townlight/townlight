# Windows 1.7.1.1 exact-artifact acceptance

Source/tag: `919f2492cf43a83e693db71fe1371001e529cf40` / `townlight-v1.7.1-beta.1`. Desktop 1.7.1-1, MSI1.7.1.1,
runtime 0.2.1. MSI 2,081,316,864 bytes, SHA-256 `7553bb3ca457360a99878953f86d54211d77a250129a6744d9d637a2fb4be9e3`.
ProductName: Townlight Windows Fix Candidate. ProductCode:
`{980400D4-336D-49F2-A9A0-4B69F9D4FAE5}`; UpgradeCode:
`{0B97EFAE-2A2E-4E88-A81C-3AAD1A52C2CC}`.

The exact MSI and embedded desktop executable independently verified Valid
Scott Converse Authenticode with Microsoft timestamps. EXE SHA-256:
`76d341e69b2db05184715338b065e93a64dd5f19ad1e498706895279a5c92d0e`.
Signing runs: 41956803118 (EXE),41958130765 (MSI). The artifact was not rebuilt
or re-signed for publication. Its installer still uses its tested candidate name.

## New installed evidence

Fresh Windows Sandbox installation of these exact signed bytes passed 34 control
checks and 3 independent installed provenance checks, including full setup/navigation,
three preview removals, three matching-profile reinstalls, retained Records data
and corrected catalog/Station guidance. Final installed desktop hash/signature
matched; Prepare Uninstall and MSI removal passed; the guest was disposed.

## Reused evidence

Installed source 806efe1 proved unchanged D1-D6/D10 fixes, Meetings and Code
proposal/adoption/codification, actual hashed Records links, separately configured
finite Station recording/handoff, restore success and deliberate-failure rollback,
and five persisted restart outcomes. Its real missing smaller-profile provenance
failure is retained; revised 919f249 fixes it and was installed fresh for that path.
All component pins between those revisions are unchanged. The evidence archive
contains the source delta and explicit reuse boundary. Unchanged real local-model
generation evidence comes from the original released-MSI audit, not a new model
download/generation run on 919. No claim that every workflow was rerun on 919.

Source integration: PR302 merged normally at f049be6aa880495be55e3c3584265acd3333a629.
Required PR checks passed (41964595871,41964595923); post-merge Windows build,
real-runtime integration and complete MSI lifecycle passed 41969783865.
Those routine unsigned CI artifacts do not replace the signed released MSI.

## Installation and limits

Windows x64, fresh installation/profile. This is not an upgrade of an existing
legacy profile or a claim of tested upgrade from 1.7.0.1. Preserve existing data
and backups; retain compatibility profile `%LOCALAPPDATA%\CivicSuite`.
Station requires separate provisioning and separate database/media backup.
No automatic photo/audio interpretation adapter; legacy Meetings governance
controls absent from canonical UI. No continuous/physical/external broadcast,
real SMTP, Internet model download, broad Windows matrix, power-loss recovery,
or professional legal/accessibility/translation certification is established.
The original audit's 477 observed IDs are not exhaustive product-surface coverage.

Full per-module results, raw failures and corrections, hashes, fixture boundaries,
signatures, recovery and cleanup receipts are in Installed-Windows-Evidence-1.7.1.1.zip
and the GitHub handoff. The archive has 1,315 evidence files plus its member manifest.
The previous Windows 1.7.0.1 release, tag, assets and historical evidence stay intact.

## Publication

[Public release](https://github.com/townlight/townlight/releases/tag/townlight-v1.7.1-beta.1) · [MSI](https://github.com/townlight/townlight/releases/download/townlight-v1.7.1-beta.1/Townlight-Windows-x64-1.7.1.1.msi) · [Checksums](https://github.com/townlight/townlight/releases/download/townlight-v1.7.1-beta.1/SHA256SUMS-Windows-1.7.1.1.txt).

The anonymous public-download verification is recorded in [publication receipt](windows-1.7.1.1-publication.json). The [previous Windows release](https://github.com/townlight/townlight/releases/tag/townlight-beta-1-windows-1.7.0.1) remains intact.
