# City-Core Recovery Baseline - 2026-05-30

## Purpose

This file records the recovery baseline after `C:\dev\Claude` was accidentally deleted during the city-core live-install fix cycle. It is intentionally tracked in Git so the recovery state is available from GitHub and not only from local disk.

## Recovered Workspace State

Recovered workspace documents and gates came from:

- `D:\To REview\cloud-sync\Desktop\Claude`

The active workspace path is:

- `C:\dev\Claude`

The Townlight gate was restored at:

- `C:\dev\Claude\TOWNLIGHT_AUDIT_GATE.md`

The reboot memory was restored at:

- `C:\dev\Claude\.codex-memory\townlight-live-install-fix-reboot-2026-05-29.md`

The surviving live-assembled temp bundle was copied to:

- `C:\Users\scott\Documents\RECOVERY_townlight-live-assembled-np9lgjwm_2026-05-30`

## Recreated Repositories

The following repositories were recloned or recreated after recovery:

- `C:\dev\Claude\Townlight-live-install-fix-2026-05-29`
- `C:\dev\Claude\townlight_core`
- `C:\dev\Claude\townlight_records`
- `C:\dev\Claude\townlight_meetings`
- `C:\dev\Claude\townlight_code`

Observed recovery heads:

- Townlight/townlight: `b07a03214e3e1c4e8f69fd74db45c9213cc9c18f`
- Townlight/townlight_core: `9f7e3a5a0156fca779b48076d49c13181d15151c`
- Townlight/townlight_records: `ae34a499c1e0794d3322146369f798f19bd0a146`
- Townlight/townlight_meetings: `f39d0eeccc6804b86c542b4cdffe4fab0665d503`
- Townlight/townlight_code: `a960bba0a2249d118b593dd61bee3a65a69a9d77`

## Lost State

The deleted worktree contained uncommitted local changes under:

- `C:\dev\Claude\Townlight-live-install-fix-2026-05-29`

The actual edited patch files were not recoverable from `D:\To REview`, Recycle Bin, or the preserved temp bundle. The work remains reconstructable from the recovered reboot memory and surviving live-assembled evidence, but it is not a direct dirty-worktree restore.

Known lost uncommitted changes included:

- `scripts\plan-installer.py`
- `scripts\run-clerk-core-installer.py`
- `scripts\run-city-core-live-assembled-gate.py`
- `scripts\policy\check_evidence_altitude.py`
- `scripts\policy\check_test_naming_honesty.py`
- `docs\process\5-lens-self-audit.md`
- `tests\test_live_install_fix_cycle_contract.py`
- generated installer artifacts under `installer\dist\`
- live gate evidence under `.agent-runs\2026-05-28-city-core-real-non-technical-release\`

## Surviving Evidence

The preserved temp bundle contains runtime output from the latest live-assembled attempt:

- `C:\Users\scott\Documents\RECOVERY_townlight-live-assembled-np9lgjwm_2026-05-30\bundle\Townlight-city-core-linux\installer\reports\post-fix-live-assembled-0.1.2-r2\clerk-core-installer-lifecycle.json`

Recovered memory says the r2 attempt had:

- install return code `0`
- launcher HTTP status `200`
- Records workflow passed in install output
- Townlight Meetings bearer workflow passed in install output
- Townlight Code workflow passed in install output
- Clerk-to-Code handoff passed in install output
- verify return code `1`
- overall evidence status `failed`

The next technical task after recovery is to reconstruct the live-install patch in small pushed slices, then inspect why the r2 verify phase still failed.

## Restored Lockstep Pin

Stage 0 also restored the Townlight Code city-core source pin that was lost with the deleted dirty worktree. `python scripts\verify-suite-state.py --remote-only` initially failed because `C:\dev\Claude\Townlight-live-install-fix-2026-05-29\installer\modules.json` still pinned Townlight Code to post-PR-#75 head `9284fd1a0704541b3422e5dd0ba47bea3713825a` while `C:\dev\Claude\townlight_code` and `Townlight/townlight_code` were at post-PR-#76 head `a960bba0a2249d118b593dd61bee3a65a69a9d77`.

The Stage 0 recovery branch restores the post-PR-#76 pin across the lockstep truth files without mutating already-published module release objects.

## New Durability Rule

The city-core suite work now proceeds as nine stage branches. Each stage is split into small slices.

Each fresh or recovered checkout must install the local pre-push gate before pushing:

- `C:\dev\Claude\Townlight-live-install-fix-2026-05-29\scripts\install-git-hooks.ps1`

The tracked hook source is:

- `C:\dev\Claude\Townlight-live-install-fix-2026-05-29\scripts\hooks\pre-push.ps1`

Per slice:

1. Run `audit-lite`.
2. Fix every finding.
3. Re-run `audit-lite`.
4. Repeat until the slice is clean or has a genuine human-required blocker.
5. Run local tests and policy checks.
6. Commit and push before starting the next slice.

At the end of each stage:

1. Push the final slice.
2. Run `audit-full` on the pushed branch.
3. Fix every finding.
4. Re-run `audit-full`.
5. Repeat until zero Blocker, Critical, Major, Minor, and Nit findings, or a genuine human-required blocker.
6. Merge to the default branch.
7. Tag the stage.
8. Stop and report only after the merge and tag land.

## Stage Plan

1. Recovery and baseline.
2. Live gate and policy harness reconstruction.
3. First-run readiness and disk sizing.
4. Launcher boot and isolated ports.
5. Shared session secret injection.
6. Townlight Code model and Ollama wiring.
7. Structured harness errors and timeout fixes.
8. Full live-assembled proof.
9. Docs, status, lockstep truth, audit, merge, and tag.

## Stage 0 Exit Criteria

Stage 0 closes only when:

- this recovery baseline is committed and pushed;
- the stage branch has an `audit-lite` report with zero findings or all findings fixed;
- `audit-full` has zero Blocker, Critical, Major, Minor, and Nit findings for the Stage 0 scope;
- the Stage 0 branch is merged to the default branch;
- a Stage 0 tag exists on the merge commit.
