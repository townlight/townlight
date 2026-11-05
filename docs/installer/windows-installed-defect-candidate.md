# Windows installed-defect candidate

This unreleased work fixes findings from the November 4 installed audit of
Windows MSI 1.7.0.1. The published MSI, tag, receipts and acceptance history stay
unchanged. The candidate uses desktop version 1.7.1-1 / Windows MSI version
1.7.1.1, runtime 0.2.1 and a separate installer identity. Packaging, signing
and fresh-install acceptance are outstanding; these source changes are not an
installed release claim. The configured future release tag is an uncreated
identifier, not authorization to tag or publish.

| Finding | Candidate behavior | Required installed proof |
| --- | --- | --- |
| D1 | Shared shell state accepts Code-only capability without projecting Records/Access data. A Records outage does not replace unrelated product screens. | Code-only sign-in and actual Code lookup; Records/Access operations remain denied. |
| D2 | Account/public-surface changes clear work drafts, results, selections and searches. Stale async work responses cannot repopulate a later account. | Export with staff, sign out, inspect anonymous screens; repeat with an in-flight result. |
| D3 | Meetings archive and Code use dedicated public read controls and filtered backend projections. Staff writes retain their existing authorization. | Anonymous archive search/detail/agenda/packet/minutes and official public Code lookup/search/citation/export; staff write refusals. |
| D4 | Original evidence, inspector input and citation changes invalidate derived analysis. Review notes preserve valid analysis. Saved prior revisions retain their evidence. | Analyze, remove citation, save without reanalysis; reopen and verify retained prior revision. |
| D5 | Records pickers follow enabled Meetings/Code capabilities. | Both pickers visible and usable in full composition; absent when corresponding module is disabled. |
| D6 | Removal validates under maintenance exclusion before backup or service stops. Other module mutations cannot race maintenance. | Refused dependency removal leaves service health, selection and backup inventory unchanged. |
| D7 | Known remaining preview compositions are recognized before custom-profile restrictions. The full payload includes locked provenance for each supported smaller preview profile. | Remove Inspections, Permitting and Planning in order; verify remaining profiles and reinstall through their matching profiles, retaining data. |
| D9 | Profile copy describes included capabilities without false unsigned/unpublished assertions. Station is identified as a bundled separate service, with manual/setup guidance and separate database/media backup labels. | Check installed catalog, Station instructions and actual separately configured handoff. |
| D10 | Restore stages backup bytes, retains directory identities, journals file moves and rolls them back on failure. Existing model cache is preserved. | Keep exports open, mutate byte sentinel, restore, compare hashes and persisted database links; prove failure rollback too. |

Restore leaves services stopped until the operator starts them. A backup
verification failure or locked file must remain an explicit failure, never a
success inferred from unchanged settings. Retained safety/staging paths must be
reported if rollback cannot complete. Separate Station database/media are not
part of the native profile snapshot.

Installed testing of source `806efe1` reproduced a missing Planning provenance
entry on reinstallation after removal. The revised assembler writes and locks
the Planning, Permitting and Inspections provenance files, all bound to the
same full build inputs. It also corrects catalog wording that inferred an
absent payload from a blocked selection and removes an inaccurate unsigned
label. The revised packaging and copy require fresh installed verification;
the earlier candidate's unaffected evidence must be identified as reused.

The audit's unconfirmed readiness observation, missing media interpretation
adapter, legacy Meetings controls and external broadcast outputs are outside
this defect-fix scope. No Linux/macOS work or publication is authorized here.
