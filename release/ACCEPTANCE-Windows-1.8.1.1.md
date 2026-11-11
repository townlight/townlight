# Townlight Windows 1.8.1.1 installed acceptance

- Application source `0afd59de52cb7ecb317188a89bcd1fec8c578a24`
- Signed Windows x64 MSI SHA-256 `9e9363ec5119a2ee4c0d69b4dd40b21a535571a11eb3750d57b8a24d4472a5da`
- Product registration **Townlight**, version **1.8.1.1**, 2081554432 bytes.
- Corresponding source SHA-256 `8a52c5560b9b632b45892a06f17a7fe83f49f330a55b4d64ab3a19ce29d1a633`
- Timestamped Azure Trusted Signing publisher **Scott Converse**; Authenticode and SignTool independently verified. [Desktop signing run](https://github.com/townlight/townlight/actions/runs/42893062263) · [MSI signing run](https://github.com/townlight/townlight/actions/runs/42896708442).

The release promotes the exact signed, fresh-installed candidate, without rebuilding or re-signing. The tag and corresponding-source ZIP preserve the exact build and fourteen component pins. Later merged source corrects Runtime/Meetings version display metadata, Rust formatting, workflow checkout pins and tests; those changes are not represented as bytes inside this MSI.

## New installed evidence for this MSI

| Path | Observed result |
|---|---|
| Fresh Windows Sandbox | Installed exact signed bytes; one Townlight Windows registration; nine first-run checkpoints; local services and Records activation. Installed desktop and Access launcher hashes/signatures matched. |
| All 31 source families | All 34 supported source/format pairs previewed, saved and durably read back from the installed local runtime. Inputs were captured public responses and fixtures. The [complete source and format matrix](https://townlight.github.io/manuals/meeting-imports.html) identifies what each reader accepts. This is not an automatic live-portal crawl for all sources. |
| Meetings and Core | Normalized canonical meetings, source URL/format/hash and agenda items where supplied. Existing Core vendor formats share the same path. Duplicate/revised capture handling and staff authorization have source-level transactional and role tests. |
| Records | Downloaded the public Utah agenda PDF, attached it to a selected Records request, reopened the citation and matched bytes/hash. |
| Notice and Access | Imported text opened a Notice draft and a saved Access review with the source citation. |
| Boards, Contracts, Procurement, Zoning, Planning, Permitting, Inspections | Each destination saved imported-meeting evidence against an existing staff record and reopened that same meeting. Existing staff roles apply. |
| Code | Existing proposal/adoption workflow with imported canonical meeting/agenda identifiers read back the saved integration. |
| Station → Records | Configured installed Station worker processed a public Wistia MP4 through its private capture path and attached the output to the same Records request; readback SHA-256 `86ca87ee794ffc17cb20ca274da1d56491be5679f183b7a186bc9dd2dd8ec32e`. Station remains separately configured. |

The disposable guest's initial cold certificate cache caused the first public PDF and MP4 downloads to fail. Normal Windows Schannel validation populated the public chain and the unchanged downloader retry succeeded; no trust or validation settings were weakened. Access's stale Records refresh was resolved using its normal Retry Records control. Interim automation retries are not reported as first-pass success. The guest was stopped after acceptance and Sandbox inventory was empty.

## Source/client and hosted evidence

Suite PR [#308](https://github.com/townlight/townlight/pull/308), Meetings [#195](https://github.com/townlight/meetings/pull/195), Station [#13](https://github.com/townlight/station/pull/13), CivicCast [#315](https://github.com/scottconverse/civiccast/pull/315) and CivicCast Brief [#12](https://github.com/scottconverse/civiccast-brief/pull/12) are merged. Suite final-head [verify](https://github.com/townlight/townlight/actions/runs/42905252911) and [Windows build, real-runtime integration and installer lifecycle](https://github.com/townlight/townlight/actions/runs/42905252919) passed. Hosted builds produce different MSI bytes; installed evidence above belongs to this release asset.

Affected local checks: 54 Suite/Meetings contracts, 18 Station tests, 99 CivicCast tests (one optional JavaScript check skipped), and 87 CivicCast Brief tests. CivicCast saved the normalized 14-item CHAMP agenda through its existing AgendaStore. Brief opt-in coverage applies to its existing PrimeGov/Granicus discovery paths, not a new 31-source menu. Those client checks are source/client evidence, not separate newly installed CivicCast desktop acceptance.

## Limits and reused evidence

This MSI was fresh-installed. An in-place upgrade to 1.8.1.1 was not exercised. The [previous 1.8.0.1 acceptance](https://github.com/townlight/townlight/releases/download/townlight-windows-v1.8.0.1/ACCEPTANCE-Windows-1.8.0.1.md) tested upgrade from 1.7.2.1 and selected staff workflows on that earlier MSI. Earlier full-module workflow evidence remains attributable to its original releases. This run did not retest every unrelated button or establish city field commissioning, all live vendor instances, hardware broadcast or every upgrade path.

Some portals require saved public responses or session/POST exports. Listing-only responses yield metadata and source links. Structured agendas, PDFs and direct MP4 availability depend on the source. Tyler's sampled item URL returned 404; the saved calendar still yielded its available metadata/titles. BoardDocs support here is an unencrypted printed numbered agenda PDF, not universal authenticated BoardDocs access.

The installed package metadata identifies **Townlight Runtime 0.3.1** and **Meetings 1.0.6**. Their health endpoint strings still show **0.3.0** and **1.0.5** in these accepted bytes. Default-branch source fixes that display discrepancy. The signed MSI identity and corresponding source remain exact.

[Suite manual](https://townlight.github.io/manuals/suite.html) · [All import sources, formats and handoffs](https://townlight.github.io/manuals/meeting-imports.html) · [Support](https://townlight.github.io/support.html)
