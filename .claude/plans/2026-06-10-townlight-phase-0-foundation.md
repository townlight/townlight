# Townlight Phase 0: Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the complete local development, testing, and clean-VM verification infrastructure for the Townlight takeover program, ratify the two architecture decisions (portable-native Windows runtime; Postgres-backed queue on Windows), and produce the Phase 1 (Townlight Meetings persistence) plan.

**Architecture:** Everything local-first and Docker-free on Windows: portable PostgreSQL 17 + pgvector and per-repo Python venvs under `C:\TownlightDev\tools\`, a Hyper-V clean-test VM on `D:\TownlightDev\vm\` restored from a pristine snapshot before every install proof, and a self-hosted GitHub Actions runner to conserve the 2,000 hosted minutes/month. Suite-level decisions land as ADRs in the `townlight` umbrella repo via PR under its existing stage/audit discipline.

**Tech Stack:** PowerShell 5.1, Hyper-V, PostgreSQL 17.5 (EDB binaries) + pgvector v0.8.x (MSVC build), Python 3.12, Node 24, GitHub Actions self-hosted runner, gh CLI (authenticated as `scottconverse`, org admin).

**Authorizations on record (2026-06-10, project owner):** full merge authority (stage PRs self-merged when gates green; the owner approves module "done" tags and public installer artifacts); implementation-change approval with UI/UX and full wiring as priorities; local development hardware approved for build, test, runner, and VM duty; hosted Actions minutes and LFS are budgeted — prefer the self-hosted runner; spending money is a last resort requiring explicit approval.

**Isolation contract:** Townlight uses only `C:\TownlightDev\` and `D:\TownlightDev\`, PostgreSQL port **54330**, and app port range **8900–8999**, plus its own dedicated test VM. Other projects' workspaces, ports, and VMs on the same hardware are never touched.

---

### Task 1: Portable PostgreSQL 17 + pgvector (the keystone — also the future installer's core ingredient)

**Files:**
- Create: `C:\TownlightDev\tools\pgsql-17\` (extracted binaries)
- Create: `C:\TownlightDev\tools\pgdata-suite\` (initdb data dir, port 54330)
- Create: `C:\TownlightDev\tools\dev-env.ps1` (PATH/env helper for the portable toolchain)
- Create: `C:\TownlightDev\tools\build-pgvector.ps1` (repeatable build script — this becomes installer tooling later)

- [ ] **Step 1: Download EDB PostgreSQL 17.5 Windows x64 binaries zip**

```powershell
$url = "https://get.enterprisedb.com/postgresql/postgresql-17.5-1-windows-x64-binaries.zip"
Invoke-WebRequest -Uri $url -OutFile D:\TownlightDev\artifacts\pgsql-17.5-win-x64.zip
Expand-Archive D:\TownlightDev\artifacts\pgsql-17.5-win-x64.zip -DestinationPath C:\TownlightDev\tools\pgsql-17
```
Expected: `C:\TownlightDev\tools\pgsql-17\pgsql\bin\pg_ctl.exe` exists. If the exact 17.5-1 URL 404s, list available versions at https://www.enterprisedb.com/download-postgresql-binaries and take the newest 17.x; record the chosen version in this plan file.

- [ ] **Step 2: Build pgvector with MSVC (needs VS Build Tools; install via winget if absent)**

```powershell
winget list --id Microsoft.VisualStudio.2022.BuildTools  # if absent:
winget install --id Microsoft.VisualStudio.2022.BuildTools --silent --override "--wait --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
git clone --branch v0.8.0 https://github.com/pgvector/pgvector.git C:\TownlightDev\tools\pgvector-src
```
Then from a `x64 Native Tools` environment (script it in `build-pgvector.ps1` by calling `vcvars64.bat`):
```bat
set "PGROOT=C:\TownlightDev\tools\pgsql-17\pgsql"
cd C:\TownlightDev\tools\pgvector-src
nmake /F Makefile.win
nmake /F Makefile.win install
```
Expected: `vector.dll` in `pgsql\lib`, `vector.control` in `pgsql\share\extension`.

- [ ] **Step 3: initdb on port 54330 and start**

```powershell
& C:\TownlightDev\tools\pgsql-17\pgsql\bin\initdb.exe -D C:\TownlightDev\tools\pgdata-suite -U postgres -E UTF8 -A trust
Add-Content C:\TownlightDev\tools\pgdata-suite\postgresql.conf "port = 54330"
& C:\TownlightDev\tools\pgsql-17\pgsql\bin\pg_ctl.exe -D C:\TownlightDev\tools\pgdata-suite -l C:\TownlightDev\tools\pgdata-suite\pg.log start
```

- [ ] **Step 4: Verify pgvector loads (this is the acceptance test for the whole task)**

```powershell
& C:\TownlightDev\tools\pgsql-17\pgsql\bin\psql.exe -p 54330 -U postgres -c "CREATE EXTENSION vector; SELECT '[1,2,3]'::vector;"
```
Expected: `[1,2,3]` returned. FAIL here = stop; pgvector-on-Windows is load-bearing for the entire de-Docker decision (ADR-0008). Fallback if MSVC build fails: pre-built pgvector from the EDB StackBuilder distribution, or as last resort document that ADR-0008 needs amendment.

- [ ] **Step 5: Write `dev-env.ps1`** (sets `PATH` += pgsql\bin and node; sets `TOWNLIGHT_POSTGRES_TEST_URL=postgresql+psycopg://postgres@127.0.0.1:54330/postgres`). Commit nothing yet — tools dir is not a git repo.

### Task 2: Prove townlight_records's full backend suite green on the native stack (the de-Docker feasibility gate)

**Files:**
- Create: `C:\TownlightDev\tools\venvs\records\` (Python 3.12 venv)
- Read: `C:\TownlightDev\repos\townlight_records\backend\` (conftest expects Postgres; CI uses docker compose — we substitute the native stack)

- [ ] **Step 1: Create venv and install** — `py -3.12 -m venv C:\TownlightDev\tools\venvs\records` then `pip install -e C:\TownlightDev\repos\townlight_records\backend[dev]` (adjust extras to match the repo's actual `pyproject.toml`; read it first).
- [ ] **Step 2: Run the suite against port 54330** with the repo's documented test env vars (read `backend/tests/conftest.py` for the exact variable names — do not guess). Expected: same pass count as the repo's CI baseline, or a recorded diff explaining every delta (e.g., tests that genuinely require compose services like Ollama get env-gated skips, counted and named).
- [ ] **Step 3: Record the result** in `C:\TownlightDev\plans\phase-0-evidence.md`: command, counts, skips with reasons. This file becomes part of the Phase 0 closeout evidence.

### Task 3: Self-hosted GitHub Actions runner (minute frugality)

**Files:**
- Create: `C:\TownlightDev\tools\actions-runner\` (org-level runner, label `townlight-windows-local`)

- [ ] **Step 1: Register an org runner** — `gh api orgs/townlight/actions/runners/registration-token --method POST` then download/configure `actions-runner-win-x64` per GitHub docs into the dir above, `--labels townlight-windows-local --runnergroup Default --unattended`, install as service.
- [ ] **Step 2: SECURITY GUARD (mandatory, public repos):** verify org settings restrict runner use — `gh api orgs/townlight/actions/permissions` — and that fork-PR workflows require approval (`default_workflow_permissions`, `require approval for all outside collaborators`). Self-hosted runners on public repos execute PR code; the org is effectively single-contributor, but set approval-required anyway and document it.
- [ ] **Step 3: Smoke test** — a `workflow_dispatch` workflow in the umbrella repo echoing `hostname` on `runs-on: [self-hosted, townlight-windows-local]`. Expected: green run, 0 hosted minutes consumed.
- [ ] **Step 4: Policy note in the control doc (Task 6):** hosted runners remain for release-tag verification (trust), local runner for routine CI; never store secrets in workflow files; runner service account is the logged-in user (document as accepted risk on a dev box).

### Task 4: Clean-test VM (the gate that makes "done" mean done)

**Files:**
- Create: `D:\TownlightDev\vm\Win11-CleanTest\` (VHDX + config)
- Create: `D:\TownlightDev\vm\autounattend\autounattend.xml` (automated OOBE: local user `clerk`, no MS account, en-US)

- [ ] **Step 1: Elevation.** Ask Scott to flip Settings → System → For developers → **Enable sudo** (preferred, one toggle), or be present for one UAC prompt. Then `sudo` wraps the Hyper-V cmdlets below. Also add `scott` to the `Hyper-V Administrators` group while elevated so future sessions need no elevation: `sudo net localgroup "Hyper-V Administrators" scott /add` (takes effect at next logon).
- [ ] **Step 2: Download Windows 11 Enterprise Evaluation ISO** (~6 GB) to `D:\TownlightDev\artifacts\` from Microsoft Evaluation Center. Record SHA-256.
- [ ] **Step 3: Build an autounattend ISO** so Windows installs hands-free (local account `clerk`, credentials kept in private VM notes off-repo, telemetry minimal). Use `oscdimg` (Windows ADK) or mount-and-copy approach; full XML checked into the umbrella repo later as installer-test tooling.
- [ ] **Step 4: Create the VM** — Gen 2, 4 vCPU, 8 GB RAM (dynamic), 80 GB VHDX on D:, Default Switch networking, Secure Boot on (Microsoft UEFI CA), TPM enabled (required by Win11; `Set-VMKeyProtector` + `Enable-VMTPM`). Boot from autounattend ISO; wait for OOBE completion.
- [ ] **Step 5: Snapshot `pristine-base`** — `sudo Checkpoint-VM -Name Win11-CleanTest -SnapshotName pristine-base`. Acceptance: restore the snapshot, boot, log in as `clerk`, confirm no Townlight artifacts exist. Every future install proof starts with `Restore-VMCheckpoint` to this snapshot.
- [ ] **Step 6: Evidence transfer path** — enable Enhanced Session / `Copy-VMFile` for pulling screenshots and DB dumps out of the VM after proof runs; verify a round-trip file copy works.

### Task 5: ADR-0008 and ADR-0009 (suite-level decisions, via umbrella PR)

**Files:**
- Create: `repos/townlight/docs/architecture/ADR-0008-portable-native-windows-runtime.md`
- Create: `repos/townlight/docs/architecture/ADR-0009-postgres-backed-queue-windows-profile.md`
- Modify: `repos/townlight/docs/architecture/index.md` (add both rows)
- Create: `repos/townlight/.claude/plans/2026-06-10-townlight-phase-0-foundation.md` (this plan, copied in — satisfies the plan gate)

- [ ] **Step 1: Write ADR-0008.** Content (full text to adapt to the repo's ADR house style after reading ADR-0007):

> **Status:** Accepted (Scott, 2026-06-10). **Context:** The spec's Windows install path (Docker Desktop + WSL2) cannot pass the program's governing acceptance test: a non-technical municipal clerk double-clicks one installer on a stock Windows machine and the suite runs. Docker Desktop demands admin rights, WSL2/virtualization prerequisites, ~8 GB overhead, and a license prompt. A sibling project on the same development hardware shipped a native Windows setup.exe with portable PostgreSQL and a clean-machine proof kit, proving the pattern. **Decision:** The Windows deployment profile becomes portable-native: the suite installer bundles portable PostgreSQL 17 + pgvector, a native Ollama runtime, per-module Python services on a bundled CPython, and frontends served by the services themselves, all managed by a single launcher process (start/stop/health/repair). Docker appears nowhere on the Windows operator path. The Linux/server profile keeps the container-first architecture unchanged. **Consequences:** installer work shifts from compose-orchestration to runtime bundling; Windows CI must exercise the native stack; the Redis/Celery layer needs a Windows answer (ADR-0009); spec §5 and ARCHITECTURE.md gain a per-profile runtime matrix; existing city-core Docker-based Windows evidence is superseded.

- [ ] **Step 2: Write ADR-0009.** Content:

> **Status:** Accepted (Scott, 2026-06-10). **Context:** ADR-0008 removes Docker from Windows; Redis has no supported native-Windows build, and bundling a clone (Memurai: commercial; Garnet: young) adds a moving part a clerk's machine doesn't need. Every module already requires PostgreSQL. **Decision:** On the Windows profile, background work runs on a Postgres-backed task queue (Procrastinate or an equivalent SKIP LOCKED implementation in townlight_core) behind a `townlight_core.tasks` abstraction with two backends: celery-redis (Linux/server profile, spec-unchanged) and postgres (Windows profile). Modules enqueue through the abstraction only; direct Celery imports in module code become lint-blocked. **Consequences:** townlight_core grows a `tasks` subsystem with backend parity tests; townlight_records's 8 Celery tasks migrate to the abstraction (behavior identical on Linux); the Windows profile drops Redis entirely; scheduled/beat jobs use the queue's scheduler on Windows.

- [ ] **Step 3: Branch `stage-2-adr-portable-native-2026-06-10` off main** (continuing the umbrella's stage numbering from stage-1), copy this plan into `.claude/plans/`, add both ADRs + index rows, commit with DCO sign-off (`git commit -s`) in the repo's conventional style: `docs(adr): adopt portable-native windows runtime and postgres queue`.
- [ ] **Step 4: Run the umbrella's own gates** — read `.claude/hooks/` and `docs/process/city-core-stage-execution-process.md` first and follow the slice loop: `audit-lite` on the diff, fix to zero findings, push, open PR, wait for `verify` / `release-lockstep-gate` checks, merge under the granted merge authority, tag per stage process.

### Task 6: Program control document + suite truth update (umbrella PR, same stage branch or next)

**Files:**
- Create: `repos/townlight/docs/roadmap/full-suite-program.md`
- Modify: `repos/townlight/STATUS.md` (new program note + evidence paths moving to `C:\TownlightDev\`)
- Modify: `repos/townlight/README.md` (Current Priorities section: point at the program doc)

- [ ] **Step 1: Write `full-suite-program.md`** containing: (a) the goal — all 27 modules finished, clerk-grade double-click installability, no pilot city, evidence-first; (b) the approved module order: core-4 hardening → installer rebuild (ADR-0008/0009) → clean-VM gate → Starter Set (townlight_notice, civicbudget, civiclegal, civicdata, civichr) with Townlight Access re-probe folded in → land use (townlight_zoning, townlight_planning, townlight_permitting, townlight_inspections) → admin (civicgrants, civicprocure, civiccontracts, civicboards) → ops (civic311, civiccomms, civicregwatch*, civicapi* — *repos to be created from specs) → internal business (civicelections) → specialized (civicutility, civiccourt, civicsafety, civiclibrary, civicparks); one module in flight at a time; (c) the **Definition of Done** verbatim: clean-VM snapshot restore → double-click install → browser-only execution of every spec'd workflow with captured evidence → reboot → data survives → evidence kit committed with the release tag; no green checkmark substitutes; (d) the resource policy (local runner first, LFS budget: evidence kits as release assets not LFS, screenshots compressed).
- [ ] **Step 2: STATUS.md / README edits** — replace stale `C:\dev\Claude\...` evidence-path references with the program doc pointer; do NOT change any module's honesty labels (no promotion without evidence — that is the whole point).
- [ ] **Step 3: Slice loop again** — audit-lite to zero, PR, gates, merge.

### Task 7: Write the Phase 1 plan (Townlight Meetings persistence) — the first code plan

**Files:**
- Read: `repos/townlight_meetings/app/main.py` (3,405 lines: locate `MotionVoteStore`, `MinutesDraftStore`, `PublicArchiveStore`), `repos/townlight_meetings/migrations/` (0001 defines `motions`, `votes`, `minutes`, `transcripts`, `closed_sessions` — currently written by nothing), `repos/townlight_meetings/app/models.py`, the existing env-gated repository pattern used by agenda intake
- Create: `repos/townlight_meetings/.claude/plans/2026-06-XX-clerk-persistence.md`

- [ ] **Step 1: Read the clerk code end to end** (the three in-memory stores, the existing `*Repository` pattern, the demo-seed path, test layout) and inventory every endpoint touching the in-memory stores.
- [ ] **Step 2: Write the persistence plan with the writing-plans skill**, full TDD granularity: one task per store (failing test proving data survives process restart → repository implementation against the existing schema → migration deltas if the schema drifted from the API shapes → wire endpoints → make DB the default, demote in-memory to an explicit `TOWNLIGHT_MEETINGS_EPHEMERAL=1` demo flag → restart-survival test green). Acceptance test for the whole phase, stated in the plan: kill the process mid-meeting, restart, the motion/vote/minutes record is intact via API and UI.
- [ ] **Step 3: Present the Phase 1 plan to Scott** with the Phase 0 closeout evidence. Phase 0 ends here.

---

## Self-Review (run after drafting — completed 2026-06-10)

1. **Spec coverage:** All seven Phase 0 commitments from the approved proposal (workspace ✓ T1, native-stack proof ✓ T2, CI frugality ✓ T3, VM ✓ T4, two ADRs ✓ T5, control doc + truth update ✓ T6, Phase 1 plan ✓ T7). Collision-avoidance and resource policies embedded.
2. **Placeholder scan:** Steps reference reading repo files before writing repo-convention-dependent content (ADR house style, conftest env names) — deliberate read-first steps, not placeholders. pgvector fallback path named. No TBDs.
3. **Consistency:** Port 54330, paths `C:\TownlightDev\` / `D:\TownlightDev\`, runner label, and stage-branch naming used consistently throughout.
