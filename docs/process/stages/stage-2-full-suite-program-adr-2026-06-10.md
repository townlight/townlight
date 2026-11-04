# Stage 2 - Full-Suite Program Adoption And Windows Runtime ADRs

## Scope

Stage 2 adopts the full-suite finishing program (all 27 modules, clean-VM
definition of done) and records the two architecture decisions it rests on:
the portable-native Windows runtime (ADR-0008) and the Postgres-backed queue
for the Windows profile (ADR-0009).

Branch:

- `stage-2-full-suite-program-adr-2026-06-10`

Base:

- `Townlight/townlight` `main` at `8cd37559d769d58c11f21c1ca8e76872cd39950f`

Local worktree:

- `C:\TownlightDev\repos\townlight`

## Planned Slices

1. ADR-0008 and ADR-0009 plus architecture index and plan gate file.
2. Full-suite program control document.
3. Suite truth sync: README, README.txt, and STATUS point at the program document.

## Slice Ledger

### Slice 1 - ADRs and plan gate

Status: Complete

Changed files:

- `C:\TownlightDev\repos\townlight\docs\architecture\ADR-0008-portable-native-windows-runtime.md`
- `C:\TownlightDev\repos\townlight\docs\architecture\ADR-0009-postgres-backed-queue-windows-profile.md`
- `C:\TownlightDev\repos\townlight\docs\architecture\index.md`
- `C:\TownlightDev\repos\townlight\.claude\plans\2026-06-10-townlight-phase-0-foundation.md`
- `C:\TownlightDev\repos\townlight\docs\process\stages\stage-2-full-suite-program-adr-2026-06-10.md`

Audit-lite report:

- `C:\TownlightDev\repos\townlight\docs\process\audits\audit-lite-stage-2-slice-1-adrs-2026-06-10.md`

Local checks:

- `git diff --check`
- `bash scripts/verify-docs.sh` (PASS in WSL Ubuntu, the CI-equivalent environment)
- `python scripts/verify-secret-scan.py` (PASS)

Pushed commit:

- Recorded in slice 2 per the ledger non-self-reference rule.

### Slice 2 - Program control document

Status: Complete

Slice 1 commit:

- `3b9021c` (`docs(adr): adopt portable-native windows runtime and postgres queue`)

Changed files:

- `C:\TownlightDev\repos\townlight\docs\roadmap\full-suite-program.md`
- `C:\TownlightDev\repos\townlight\docs\process\stages\stage-2-full-suite-program-adr-2026-06-10.md`

Audit-lite report:

- `C:\TownlightDev\repos\townlight\docs\process\audits\audit-lite-stage-2-slice-2-program-doc-2026-06-10.md`

Local checks:

- `git diff --check`
- `bash scripts/verify-docs.sh` (PASS in WSL Ubuntu)

Note: slices in this stage were committed sequentially and pushed together;
the pre-push gate requires a clean working tree, so per-slice pushes were not
possible with later slices already drafted locally.

### Slice 3 - Suite truth sync

Status: Complete

Slice 2 commit:

- `5a6e480` (`docs(roadmap): adopt the full-suite finishing program`)

Changed files:

- `C:\TownlightDev\repos\townlight\README.md`
- `C:\TownlightDev\repos\townlight\README.txt`
- `C:\TownlightDev\repos\townlight\STATUS.md`
- `C:\TownlightDev\repos\townlight\docs\process\stages\stage-2-full-suite-program-adr-2026-06-10.md`

Audit-lite report:

- `C:\TownlightDev\repos\townlight\docs\process\audits\audit-lite-stage-2-slice-3-truth-sync-2026-06-10.md`

Local checks:

- `git diff --check`
- `bash scripts/verify-docs.sh` (PASS in WSL Ubuntu)
- `python scripts/verify-secret-scan.py` (PASS)

### Slice 4 - Verify workflow runner compatibility

Status: Complete

Slice 3 commit:

- `cb64262` (`docs(truth): point suite priorities and status at the finishing program`)

Changed files:

- `C:\TownlightDev\repos\townlight\.github\workflows\verify.yml`
- `C:\TownlightDev\repos\townlight\docs\process\stages\stage-2-full-suite-program-adr-2026-06-10.md`

What and why:

- `npx playwright install --with-deps chromium` hangs on the self-hosted
  runner: `--with-deps` shells out to sudo, the `runner` account has no sudo
  (by design — it executes pull-request code), and the sudo prompt blocks the
  job forever. Chromium's OS dependencies are preinstalled root-side on the
  runner image instead, and the workflow now runs `npx playwright install
  chromium` only. A passwordless-sudo rule for the runner account was
  considered and rejected as an unauthorized privilege escalation.
- Runner image note: `townlight-wsl-linux-2` runs in WSL Ubuntu 24.04 (24.04,
  not 26.04 — actions/setup-python has no 3.12 build for 26.04) with
  Playwright Chromium OS dependencies preinstalled.

Audit-lite report:

- `C:\TownlightDev\repos\townlight\docs\process\audits\audit-lite-stage-2-slice-4-verify-runner-2026-06-10.md`

Local checks:

- `git diff --check`
- YAML parse: `python -c "import yaml; yaml.safe_load(open('.github/workflows/verify.yml'))"`

## Stage Closeout

- Audit-lite evidence:
  `docs/process/audits/audit-lite-stage-2-slice-1-adrs-2026-06-10.md`,
  `docs/process/audits/audit-lite-stage-2-slice-2-program-doc-2026-06-10.md`,
  `docs/process/audits/audit-lite-stage-2-slice-3-truth-sync-2026-06-10.md`
- Slice 3 commit: recorded in the PR; the ledger cannot reference its own
  commit hash.
- Process note for future stages: amend the stage process to permit
  commit-per-slice with a single push when later slices are already drafted,
  since the pre-push clean-tree gate forbids per-slice pushes in that state.
- PR, merge commit, tag, and CI run IDs: recorded on the PR
  (`verify` runs on self-hosted runner `townlight-wsl-linux-2`).
