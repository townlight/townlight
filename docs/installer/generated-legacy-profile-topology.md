# Legacy installer build-profile topology

This generated reference describes the retained older build profiles in installer/modules.json. For the released Townlight Beta 1 candidate, use the current suite manual, release provenance and exact source/runtime lock. It does not describe a rebuild of the accepted signed MSI.

<!-- BEGIN GENERATED SUITE TOPOLOGY -->

<!-- Maintainers: re-run `python scripts/docs/render_topology.py --check` before publishing docs. -->
Generated from `installer/modules.json`.

- Root installer truth label: `townlight_records_meetings_code_beta_candidate`.
- Primary product profile: `records-beta` (Townlight Records).
- Townlight Records profile status: `stabilizing`.
- Only the Townlight Records modules are represented in this candidate table.
- Disabled profiles and excluded modules remain documented as out of scope until their own gates clear.

| Module | Version | Role | Dependencies | Source commit | Installer status |
|---|---:|---|---|---|---|
| Townlight Core | 1.3.0.dev2 | shared platform | none | `3021821bf9a9` | `naming_candidate_acceptance_pending` |
| Townlight Records | 1.8.0.dev2 | records workflow | `townlight_core` | `ad5559709bce` | `naming_candidate_acceptance_pending` |
| Townlight Notice | 0.3.0 | public notice workflow | `townlight_core` | `4edf01296b0a` | `naming_candidate_acceptance_pending` |
| Townlight Access | 0.5.0 | accessibility + records-ready export | `townlight_core` | `f377a9a6e2a1` | `naming_candidate_acceptance_pending` |

Disabled profiles:
- `land-use` (Land Use): queued - depends on Tier 2 module work after city-core ships
- `full-suite` (Full Suite): Use the documented candidate profile; this historical profile remains disabled.

<!-- END GENERATED SUITE TOPOLOGY -->
