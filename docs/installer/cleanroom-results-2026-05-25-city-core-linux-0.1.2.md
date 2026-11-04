# City-Core Linux 0.1.2 Cleanroom Result

Date: 2026-05-25

Scope: rebuilt Linux city-core installer archive with Townlight Records public portal mode enabled for the city-core profile and ran the matching-host lifecycle through WSL/Linux.

## Artifact

- Archive: `installer/dist/Townlight-city-core-linux-0.1.2.tar.gz`
- SHA256: `6afbaa3791b5699b220b8046d6901e01d62b485ea75008db4087af3628d14648`
- Release manifest: `installer/dist/Townlight-city-core-0.1.2-release-manifest.json`
- Evidence report: `installer/reports/track-b-city-core-0-1-2-linux-lifecycle/installer-package-cleanroom.json`
- Local lifecycle run ID: `track-b-city-core-0-1-2-linux-lifecycle`
- GitHub Actions lifecycle run: `26416891904`, job `77763184960`

## Module Sources

- Townlight Core: `f39f1af`
- Townlight Records: `efc8a61`
- Townlight Meetings: `3bf5293`
- Townlight Code: `d2eaf13`

The Records and Clerk SHAs include the Track B ignore-hygiene merges after the cleanroom-gate backfill. They do not change runtime behavior.

## Command

```bash
python3 scripts/run-installer-package-cleanroom.py \
  --archive installer/dist/Townlight-city-core-linux-0.1.2.tar.gz \
  --platform linux \
  --staff-mode bearer \
  --workflow-proof \
  --run-id track-b-city-core-0-1-2-linux-lifecycle
```

## Result

```json
{
  "certification_scope": "Matching-host install, repair, verify, backup, restore, and uninstall lifecycle evidence.",
  "evidence_classification": "matching_host_lifecycle",
  "host_platform": "linux",
  "host_platform_matches_target": true,
  "run_id": "track-b-city-core-0-1-2-linux-lifecycle",
  "status": "passed",
  "workflow_proof_requested": true,
  "resolved_modes": [
    {"mode": "install", "status": "passed"},
    {"mode": "repair", "status": "passed"},
    {"mode": "verify", "status": "passed"},
    {"mode": "backup", "status": "passed"},
    {"mode": "restore", "status": "passed"},
    {"mode": "uninstall", "status": "passed"}
  ]
}
```

The verify phase included the starter runtime workflows for Townlight Records, Townlight Meetings, Townlight Code, and the Clerk-to-Code handoff proof path.

## Public Portal Evidence

The lifecycle report includes the Townlight Records public portal verification in install, repair, and verify phases:

```json
{
  "checks": [
    {
      "name": "portal_mode_config",
      "payload": {
        "mode": "public"
      },
      "status_code": 200
    },
    {
      "name": "public_route_mounts",
      "public_request_path_mounted": true,
      "register_path_mounted": true,
      "status_code": 200
    }
  ],
  "expected_mode": "public",
  "name": "townlight_records_portal_mode",
  "status": "passed"
}
```

This proves the city-core installed stack starts Townlight Records in public mode and mounts resident-facing public request routes without operator configuration.
