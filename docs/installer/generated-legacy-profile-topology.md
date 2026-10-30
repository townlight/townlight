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
| Townlight Core | 1.2.1 | shared platform | none | `b4d0156bdc68` | `v1_2_1_records_beta_platform` |
| Townlight Records | 1.7.3 | records workflow | `civiccore` | `45042345b5ca` | `v1_7_3_records_beta_candidate` |
| Townlight Notice | 0.2.0 | public notice workflow | `civiccore` | `79b8d07199ee` | `v0_2_0_records_beta_candidate` |
| Townlight Access | 0.4.0 | accessibility + records-ready export | `civiccore` | `b9100edc80ca` | `v0_4_0_records_beta_candidate` |

Disabled profiles:
- `land-use` (Land Use): queued - depends on Tier 2 module work after city-core ships
- `full-suite` (Full Suite): 14 modules remain pre-1.0 scaffolds pinned to older CivicCore lines; not installable as a coherent suite

<!-- END GENERATED SUITE TOPOLOGY -->
