# City-Core Linux 0.1.1 Cleanroom Result

Date: 2026-05-25

Scope: rebuilt Linux city-core installer archive from the post-Track-C module sources and ran the matching-host lifecycle through WSL/Linux.

## Artifact

- Archive: `installer/dist/Townlight-city-core-linux-0.1.1.tar.gz`
- SHA256: `09f7b0868230da205da1bdd6408501dfbda2fd8453e95df81b16a1adcde73e21`
- Release manifest: `installer/dist/Townlight-city-core-0.1.1-release-manifest.json`
- Evidence report: `installer/reports/track-b-city-core-0-1-1-linux-lifecycle/installer-package-cleanroom.json`

## Module Sources

- Townlight Core: `f39f1af`
- Townlight Records: `efc8a61`
- Townlight Meetings: `3bf5293`
- Townlight Code: `d2eaf13`

The Records and Clerk SHAs include the Track B ignore-hygiene merges after the cleanroom-gate backfill. They do not change runtime behavior.

## Command

```bash
python3 scripts/run-installer-package-cleanroom.py \
  --archive installer/dist/Townlight-city-core-linux-0.1.1.tar.gz \
  --platform linux \
  --staff-mode bearer \
  --workflow-proof \
  --run-id track-b-city-core-0-1-1-linux-lifecycle
```

## Result

```json
{
  "certification_scope": "Matching-host install, repair, verify, backup, restore, and uninstall lifecycle evidence.",
  "evidence_classification": "matching_host_lifecycle",
  "host_platform": "linux",
  "host_platform_matches_target": true,
  "run_id": "track-b-city-core-0-1-1-linux-lifecycle",
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
