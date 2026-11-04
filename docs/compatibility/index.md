# Townlight current component compatibility

Prepared November 2, 2026. These are the renamed source candidate identities; this table does not claim package-index publication, a signed installer or installed acceptance. Use the source-pinned [suite state](../../config/suite-state.json) and final candidate ACCEPTANCE.md for exact evidence.

| Module | Repository | Current version | Core requirement | Evidence status |
|---|---|---|---|---|
| townlight_core | townlight/core | 1.3.0.dev2 | n/a | Prepared; installed acceptance pending |
| townlight_records | townlight/sunshine | 1.8.0.dev2 | 1.3.0.dev2 | Prepared; installed acceptance pending |
| townlight_meetings | townlight/meetings | 1.0.5 | 1.3.0.dev2 | Prepared; installed acceptance pending |
| townlight_code | townlight/ordinances | 1.0.9 | 1.3.0.dev2 | Prepared; installed acceptance pending |
| townlight_access | townlight/access | 0.5.0 | 1.3.0.dev2 | Prepared; installed acceptance pending |
| townlight_zoning | townlight/zone | 0.2.3 | 1.3.0.dev2 | Prepared; installed acceptance pending |
| townlight_planning | townlight/plan | 0.4.0.dev2 | 1.3.0.dev2 | Prepared; installed acceptance pending |
| townlight_permitting | townlight/permit | 0.3.0+dev.2 | 1.3.0.dev2 | Prepared; installed acceptance pending |
| townlight_inspections | townlight/inspect | 0.3.0+dev.2 | 1.3.0.dev2 | Prepared; installed acceptance pending |
| townlight_notice | townlight/notice | 0.3.0 | 1.3.0.dev2 | Prepared; installed acceptance pending |
| townlight-station | townlight/station | 0.3.0 | 1.3.0.dev2 | Prepared; installed acceptance pending |

The runtime package is townlight-runtime 0.2.0. Station keeps its separate service/database boundary and unchanged accepted media implementation. The candidate uses fresh branded databases and refuses unmarked legacy profiles; it does not provide an in-place naming upgrade. The compatibility profile directory remains `%LOCALAPPDATA%\CivicSuite`.

[Original compatibility and release-pairing evidence](../history/pre-naming-2026-11/compatibility.md) retains its original package names and release identities. It is historical evidence, not the active module catalog.
