# Townlight Records + Meetings 1.2.0-beta.1 — acceptance record

**Status: exact signed fresh workflow, upgrade, recovery and retained-data
uninstall acceptance passed on 2026-10-19. Public release assets and anonymous
downloads verified on 2026-10-20.**

The owner authorized conditional publication on October 19, 2026. The connected
profile contains Core, Records, Meetings, Notice and Access. Code and optional
native AI minutes/transcription are not part of this release claim.

## Supporting local installed evidence

The unsigned M4 candidate SHA-256 was
`83e82c087c116224b534a7fb060586e3c3378c43afab9a88ec412d216ae18d33`.
It passed setup and activation; Records workflow and privacy; Meetings agenda,
packet delivery, notices, proceedings, corrections, manual minutes and archives;
permitted Meetings evidence attachment to Records; restart with operator service
start; backup/restore; repair; and ordinary uninstall with retained database,
exports and independently hashed attachment bytes. Restricted archives remained
protected. This does not certify the final signed bytes or predecessor upgrade.

## Final release gates

- Required protected PR checks and coordinated source merges: **passed**.
  Meetings [PR182](https://github.com/townlight/meetings/pull/182), Records
  [PR112](https://github.com/townlight/sunshine/pull/112), and umbrella
  [PR262](https://github.com/townlight/townlight/pull/262) are merged.
- Exact main source: `8627868bd9d894be90b6ece1ce5ae4dc41e82f2f`.
  [Signing run39356961713](https://github.com/townlight/townlight/actions/runs/39356961713)
  completed successfully, including real-runtime integration and the installed
  MSI install/launch/repair/backup-restore/uninstall lifecycle.
- Downloaded MSI `Townlight_1.2.0-1_x64_en-US.msi`, 1,632,428,032 bytes:
  independently computed SHA-256
  `046832e0075e9d7ad1402b949d61b224d13e6ea8133390e1bb833f52dce7f926`.
  Local Authenticode verification is **Valid**, subject
  `CN=Scott Converse, O=Scott Converse, L=Longmont, S=co, C=US`, thumbprint
  `67C9FA4C4655ACA5D1FBE165CAC1C0C5DDE03402`, with a Microsoft timestamp.
- The matching signing receipt records inner executable SHA-256
  `f841dce5b0807e0126c38eda23e3443ce83cb510bf55ed0c4438b011ccf5f65a`.
  The signing pipeline independently verified packaged executable identity and
  signature; independent installed-workflow verification below also passed.
- Final signed installed connected workflow: **passed** in Windows Sandbox,
  Windows 11 Enterprise `10.0.26100`. The independently measured installed EXE
  hash and Valid Scott Converse signature match the signing receipt above.
- Fresh `meetings-beta` setup, Python/PostgreSQL activation, Records lifecycle
  and public/staff privacy: **passed**. No optional model weights were downloaded.
- Meetings agenda, motion/vote correction, draft posting before adoption,
  separate adoption/signing, packet delivery, editable notice/proof history,
  proceedings and public/restricted archives: **passed** through the installed UI.
  Restricted archive reads returned 404; public draft minutes retained their
  draft label. Permitted archive text attached to Records with citation, source
  identity, hash and audit attribution, without automatic response approval.
- Independent SQL/file inspection: **passed**, 71 Records audit entries,
  three validated Core export bundles and actual attached source SHA-256
  `bf2d8e2cb7d61181202216be8dd274376725fd503421dd64789a2b620b10ff20`.
- Records beta.3 upgrade with preserved existing work: **passed** against the
  genuine published predecessor MSI
  `07f4ebe97bccd32db2a10fc5a5df106fd1bb7b499593e07277e712b815ccaff1`.
  The before/after comparator found zero differences in the existing request,
  nested evidence, 12 historical audit entries, Access review, notifications
  and publication history. All four exported files retained their exact hashes.
  The upgraded profile also passed Records public/privacy and Meetings
  creation/readback. Its one product registration and installed EXE were verified.
- Backup/restore: **passed**. Restore removed a deliberate post-backup request;
  completed Records, Meetings proceedings and attached-source history matched
  after recovery. Normal native-window close stopped all application services.
- Ordinary uninstall with database/evidence retention: **passed**, exit code 0
  at `2026-10-20T04:21:20.0759833Z` (October 19, 22:21:20 MDT). The EXE and
  product registration were removed. After uninstall, the retained PostgreSQL
  database started normally and the existing SQL/file inspector reproduced the
  same 71-entry audit-chain result, three valid bundles and exact attached-source
  hash. PostgreSQL then stopped normally. The retained authority, PostgreSQL 17
  files and source-byte check passed. Both disposable guests were released;
  the final empty Sandbox list was verified at October 19, 22:24:16 MDT.
- Public release asset and download verification: **passed**. Published
  `2026-10-20T06:13:29Z` (October 20, 00:13:29 MDT) as a public prerelease:
  [Records + Meetings 1.2.0-beta.1](https://github.com/townlight/townlight/releases/tag/townlight-records-meetings-v1.2.0-beta.1).
  The annotated tag resolves to the exact signed source above. Existing draft
  staging [run39369994352](https://github.com/townlight/townlight/actions/runs/39369994352)
  independently verified both signatures and receipt before attaching assets.
  The public GitHub MSI digest equals the independently measured SHA-256 above;
  asset size is 1,632,428,032 bytes. Anonymous download HEAD returned HTTP 200
  and the same byte count. Anonymous public receipt and evidence downloads
  matched the signed source/run, MSI/EXE hashes, publisher and publication flag.
  This verifies delivery without unnecessarily downloading the large MSI again.
  Documentation follow-up [PR263](https://github.com/townlight/townlight/pull/263)
  does not change the signed source, tag or accepted installer bytes.

## Evidence and environment limits

Fresh signed evidence is retained in the release workspace's `connected-beta1`
folder; exact predecessor-upgrade evidence is in `connected-beta1-upgrade-final`.
The signing receipt binds both to source/run identity above. Reused journey
scripts retain some historical M1/M2/M3 fixture labels; the measured installed
identity and this record identify the actual final signed candidate tested.

The disposable image required guest-only WebView provisioning and Application
Control preparation for bundled PostgreSQL. The workstation security policy was
not changed. A guest-only test proxy allowed public/restricted HTTP read checks;
it is not a shipped network-listening configuration. No native Meetings AI or
transcription verification, new adapter-disabled test, same-MSI reinstall, Code
release or full-suite completion is claimed by these final-candidate results.
The existing Records fixture has no personal requester contact; its public/staff
separation check does not independently certify a new requester-contact privacy
scenario. Unchanged component privacy checks remain supporting CI evidence.

Preserve the accepted beta.3 predecessor and its release record. Do not move its
tag, overwrite its assets, discard newer data, or treat historical JSON as a
fallback for database-backed work. Populate this record from actual receipts;
supporting local tests are not substitutes for final signed acceptance.
