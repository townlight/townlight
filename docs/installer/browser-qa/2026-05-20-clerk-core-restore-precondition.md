# Clerk-Core Restore Precondition Evidence - 2026-05-20

Scope: local installed Clerk-Core stack using run id `local-public-use-matrix`. This is adversarial local precondition evidence only.

Command:

```powershell
python scripts\run-clerk-core-installer.py restore --run-id local-public-use-matrix --port-offset 1234 --backup-dir installer\runtime\clerk-core\backups\does-not-exist
```

Result: expected failure, exit code `1`.

Key payload:

```json
{
  "mode": "restore",
  "status": "failed",
  "error": "Backup manifest missing: C:\\dev\\Claude\\Townlight-clerk-core-city-release\\installer\\runtime\\clerk-core\\backups\\does-not-exist\\backup-manifest.json",
  "fix_steps": [
    "Confirm Docker is installed, open, and reports a running engine.",
    "Confirm the resolved ports in the report are free, or rerun with --port-offset / explicit port flags.",
    "Run uninstall, then rerun install if a previous partial stack is present."
  ]
}
```

Notes:

- This proves the restore path fails closed when the requested backup manifest is missing.
- The current generic `fix_steps` are actionable for runtime setup, but not specific enough for the missing-backup case. Auditor should decide whether this is a public-use copy finding before promotion.
