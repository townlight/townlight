# Stage 1 - Live Gate And Policy Harness

## Scope

Stage 1 rebuilds the durable harness that prevents city-core release work from living only on local disk.

Branch:

- `stage-1-live-gate-policy-harness-2026-05-30`

Base:

- `Townlight/townlight` `main` at `b1193a6d400d4c9245ccb6a65faa0cd8a56c26a4`

Local worktree:

- `C:\dev\Claude\Townlight-live-install-fix-2026-05-29`

## Planned Slices

1. Stage process and ledger.
2. Pre-push enforcement for stage/audit evidence.
3. Policy and CI checks for durable stage evidence.

## Slice Ledger

### Slice 1 - Stage process and ledger

Status: In progress

Changed files:

- `C:\dev\Claude\Townlight-live-install-fix-2026-05-29\docs\process\city-core-stage-execution-process.md`
- `C:\dev\Claude\Townlight-live-install-fix-2026-05-29\docs\process\stages\stage-1-live-gate-policy-harness-2026-05-30.md`

Audit-lite report:

- `C:\dev\Claude\Townlight-live-install-fix-2026-05-29\docs\process\audits\audit-lite-stage-1-slice-1-stage-process-2026-05-30.md`

Local checks:

- `git diff --check`

Pushed commit:

- `1107879d55217f5876c31b087786149bfb9afd24`

### Slice 2 - Pre-push enforcement

Status: In progress

Changed files:

- `C:\dev\Claude\Townlight-live-install-fix-2026-05-29\scripts\hooks\pre-push.ps1`
- `C:\dev\Claude\Townlight-live-install-fix-2026-05-29\docs\process\stages\stage-1-live-gate-policy-harness-2026-05-30.md`

Audit-lite report:

- `C:\dev\Claude\Townlight-live-install-fix-2026-05-29\docs\process\audits\audit-lite-stage-1-slice-2-pre-push-enforcement-2026-05-30.md`

Local checks:

- `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\hooks\pre-push.ps1`
- `git diff --check`

Pushed commit:

- `ed954f43fa503cca14a31ced390319e990077448`

### Slice 3 - Policy and CI evidence checks

Status: In progress

Changed files:

- `C:\dev\Claude\Townlight-live-install-fix-2026-05-29\scripts\policy\check_stage_evidence.py`
- `C:\dev\Claude\Townlight-live-install-fix-2026-05-29\scripts\policy\test_check_stage_evidence_contract.py`
- `C:\dev\Claude\Townlight-live-install-fix-2026-05-29\scripts\policy\run_all.py`
- `C:\dev\Claude\Townlight-live-install-fix-2026-05-29\.github\workflows\verify.yml`
- `C:\dev\Claude\Townlight-live-install-fix-2026-05-29\.agent-runs\2026-05-30-stage-1-live-gate-policy-harness\workflow-cost-ledger.md`
- `C:\dev\Claude\Townlight-live-install-fix-2026-05-29\docs\process\stages\stage-1-live-gate-policy-harness-2026-05-30.md`

Audit-lite report:

- `C:\dev\Claude\Townlight-live-install-fix-2026-05-29\docs\process\audits\audit-lite-stage-1-slice-3-ci-policy-evidence-2026-05-30.md`

Local checks:

- `python scripts\policy\check_stage_evidence.py --branch stage-1-live-gate-policy-harness-2026-05-30`
- `python -m pytest scripts\policy\test_check_stage_evidence_contract.py`
- `python scripts\policy\check_actions_budget.py --run 2026-05-30-stage-1-live-gate-policy-harness --base-ref origin/main`
- `python scripts\policy\check_workflow_cost_ledger.py --run 2026-05-30-stage-1-live-gate-policy-harness`
- YAML parse check for `.github\workflows\verify.yml`
- `git diff --check`

Pushed commit:

- `4e8017b167ef10a5cf4b178bed5925bf90349762`

### Slice 4 - Hook and CI stage-evidence parity

Status: In progress

Changed files:

- `C:\dev\Claude\Townlight-live-install-fix-2026-05-29\scripts\hooks\pre-push.ps1`
- `C:\dev\Claude\Townlight-live-install-fix-2026-05-29\docs\process\stages\stage-1-live-gate-policy-harness-2026-05-30.md`

Audit-lite report:

- `C:\dev\Claude\Townlight-live-install-fix-2026-05-29\docs\process\audits\audit-lite-stage-1-slice-4-hook-ci-parity-2026-05-30.md`

Local checks:

- `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\hooks\pre-push.ps1`
- `python scripts\policy\check_stage_evidence.py --branch stage-1-live-gate-policy-harness-2026-05-30`
- `git diff --check`

Pushed commit:

- `75d08336856f722eb1272acda45f6c2dc4eb0e62`

### Slice 5 - Stage ledger closeout bookkeeping

Status: In progress

Changed files:

- `C:\dev\Claude\Townlight-live-install-fix-2026-05-29\docs\process\stages\stage-1-live-gate-policy-harness-2026-05-30.md`

Audit-lite report:

- `C:\dev\Claude\Townlight-live-install-fix-2026-05-29\docs\process\audits\audit-lite-stage-1-slice-5-ledger-closeout-2026-05-30.md`

Local checks:

- `git diff --check`

Pushed commit:

- `9d1b00633fafda168ed035473d2eeb19ed998fad`

## Stage Closeout

Audit-full package:

- `C:\dev\Claude\Townlight-live-install-fix-2026-05-29\docs\process\audits\audit-full-stage-1-live-gate-policy-harness-2026-05-30\00-executive-audit.md`

PR:

- Pending

Merge commit:

- Pending

Tag:

- Pending
