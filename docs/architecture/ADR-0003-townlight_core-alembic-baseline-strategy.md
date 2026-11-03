# ADR-0003: Townlight Core Alembic baseline and the records-side idempotent guard pass

## Status

Accepted — 2026-04-23.

**Supersedes the earlier draft of this ADR** ("baseline = revision after `787207afc66a`, exact rev TBD when Phase 1 PR opens"), which was rejected by audit review on the same day for being underspecified. The earlier text named neither the actual head revision nor which records migrations needed idempotent guards. This revision replaces it.

## Context

The full records migration graph at the time of this ADR (linear chain, root → head):

```
001_initial
  → 002_documents
  → 003_model_registry
  → 004_search
  → 005_requests
  → 006_exemptions
  → 787207afc66a_phase2_extensions_12_new_tables_and_
  → 008_extend_request_status_enum
  → 009_fee_waivers
  → 010_remove_sent_status
  → 011_fix_schema_drift
  → 012_add_liaison_public_roles
  → 013_add_connector_types
  → 014_p6a_idempotency
  → 015_p6b_scheduler
  → 016_p7_sync_failures
  → 017_rename_connector_enum_values
  → 018_city_profile_state_nullable
  → 019_encrypt_connection_config        ← HEAD as of 2026-04-23
```

The `787207afc66a` migration is in the middle of the chain, not at the head. There are nine subsequent records migrations (008–019), several of which add columns to or alter shared tables. "Baseline at the revision after `787207afc66a`" — as the earlier ADR draft proposed — is therefore wrong: it would leave the shared-schema state captured by 011, 013, 014, 015, 016, 017, 018, and 019 outside townlight_core's history.

### Shared vs records-owned schema (per spec `02_Townlight Core.md` §10.1)

**Shared (Townlight Core-owned) tables:**

| Created in | Tables |
|---|---|
| 001 | `users`, `service_accounts`, `audit_log` |
| 002 | `data_sources`, `documents`, `document_chunks` |
| 003 | `model_registry` |
| 006 | `exemption_rules` (only — `exemption_flags` and `disclosure_templates` from this migration stay records-side) |
| 787207afc66a | `connector_templates`, `departments`, `system_catalog`, `city_profile`, `notification_templates`, `prompt_templates` (6 of the 12 created in this migration) |
| 016 | `sync_run_log`, `sync_failures` (connector sync state) |

Plus: every `op.add_column` and `op.alter_column` operation that targets one of these tables, anywhere in the migration chain.

**Records-only tables (stay):**

| Created in | Tables |
|---|---|
| 004 | `search_sessions`, `search_queries`, `search_results` |
| 005 | `records_requests`, `request_documents`, `document_cache` |
| 006 | `exemption_flags`, `disclosure_templates` |
| 009 | `fee_waivers` |
| 787207afc66a | `fee_schedules`, `fee_line_items`, `notification_log`, `request_messages`, `request_timeline`, `response_letters` (6 of the 12) |

## Decision

### 1. Civiccore baseline revision

**`townlight_core_0001_baseline_v1.py`** — a single synthetic migration in townlight_core's own Alembic version chain (separate version table: `alembic_version_townlight_core`). Its `upgrade()` declares the **union** of shared-table schema as-of records HEAD `019_encrypt_connection_config`. Its `downgrade()` is a no-op (the baseline is unrolled by uninstalling townlight_core, not by reverting the migration).

Every operation in the baseline is idempotent:
- Each `op.create_table('shared_name', ...)` is wrapped in `if not inspect(conn).has_table('shared_name')`.
- Each `op.add_column('shared_name', ...)` is wrapped in `if not _has_column(conn, 'shared_name', 'col_name')`.
- Each `op.alter_column(...)` checks the current column state before applying.

The baseline is therefore a **no-op against any database that has already run records migrations 001 through 019**. It only does work against a fresh empty Postgres.

### 2. Records-side idempotent guard pass (Phase 1 PR, ships as records v1.3.0)

Fourteen of the nineteen existing records migrations gain guard wrappers around shared-table operations. The records-only operations in each migration are unchanged.

| Migration | What gets guarded |
|---|---|
| **001** | creates of `users`, `service_accounts`, `audit_log` |
| **002** | creates of `data_sources`, `documents`, `document_chunks` |
| **003** | create of `model_registry` |
| **006** | create of `exemption_rules` only (creates of `exemption_flags` and `disclosure_templates` stay unguarded — records-only) |
| **787207afc66a** | the 6 shared `op.create_table` calls (`connector_templates`, `departments`, `system_catalog`, `city_profile`, `notification_templates`, `prompt_templates`); the shared-table `op.add_column` calls — 8 on `data_sources`, 5 on `documents`, 3 on `model_registry`, 1 on `users` (`department_id`). The 6 records-only creates and the records-only column additions on `records_requests`, `exemption_flags`, `search_results` stay unguarded. |
| **011_fix_schema_drift** | every `add_column` whose target is a shared table |
| **012_liaison_public_roles** | the role inserts (RBAC roles are shared) |
| **013_add_connector_types** | enum/column changes targeting `data_sources` |
| **014_p6a_idempotency** | connector-related schema changes |
| **015_p6b_scheduler** | `data_sources` column adds (schedule, last_sync_at, last_sync_status, health_status, schema_hash, etc.) |
| **016_p7_sync_failures** | creates of `sync_run_log` and `sync_failures` |
| **017_rename_connector_enum_values** | the enum-rename data migration |
| **018_city_profile_state_nullable** | `alter_column` on `city_profile.state` |
| **019_encrypt_connection_config** | the `data_sources` column-encryption pass |

**Five records migrations need no edits** because they touch only records-owned tables: **004**, **005**, **008**, **009**, **010**.

The guard helpers live in a new townlight_core module:

```python
# townlight_core/migrations/guards.py
def idempotent_create_table(name, *args, **kwargs):
    """op.create_table that no-ops if the table already exists."""
def idempotent_add_column(table, column):
    """op.add_column that no-ops if the column already exists."""
def idempotent_alter_column(table, column, **kwargs):
    """op.alter_column that introspects current state before applying."""
```

Each guarded migration imports from `townlight_core.migrations.guards` and substitutes the wrapper for the bare `op.create_table` / `op.add_column` / `op.alter_column` call on shared-table operations. The diff per migration is mechanical and reviewable.

### 3. Records env.py wiring

`backend/alembic/env.py` gains six lines that invoke townlight_core's runner before records' own chain:

```python
# Phase-1 addition: townlight_core migrations run first, then records' own
from townlight_core.migrations.runner import upgrade_to_head as _townlight_core_upgrade
_townlight_core_upgrade(connection)
# ... existing records env.py logic continues
```

This ordering guarantees that shared tables exist (or are confirmed-already-existing) before records' guarded migrations check `has_table`.

### 4. Three deployment scenarios — exact behavior

**Scenario A — existing v1.2.x → v1.3.0 upgrade:**

1. Operator pulls records v1.3.0 (which depends on townlight_core 0.1.0).
2. `pip install townlight_core==0.1.0 townlight_records==1.3.0`.
3. Operator runs `alembic upgrade head` against records.
4. Records' new env.py invokes `townlight_core.migrations.runner.upgrade_to_head(connection)`.
5. Civiccore baseline runs; `inspect(conn).has_table('users')` returns True (records 001 created it long ago); baseline skips the shared `create_table` calls; marks `alembic_version_townlight_core` at HEAD.
6. Records' env.py continues with records' own chain. Already at 019, nothing to do.
7. Net: zero downtime, zero data change, townlight_core now tracking shared tables.

**Scenario B — fresh install of records v1.3.0:**

1. Operator runs `alembic upgrade head` against an empty Postgres.
2. Records' (Phase-1-patched) `env.py` invokes `townlight_core.migrations.runner.upgrade_to_head(connection)` before processing records' own chain.
3. Civiccore baseline `townlight_core_0001_baseline_v1` runs. On an empty DB every `inspect(conn).has_table(...)` returns False, so the baseline creates all 16 shared tables with their full final column set (capturing every shared-column addition made across records migrations 003, 011, 012, 013, 015, 016, 017, 018, 019, and the shared portions of 787207afc66a). `alembic_version_townlight_core` is stamped at `townlight_core_0001_baseline_v1`.
4. Records' own chain now runs in **Alembic revision order** through the linear graph `001 → 002 → 003 → 004 → 005 → 006 → 787207afc66a → 008 → 009 → 010 → 011 → 012 → 013 → 014 → 015 → 016 → 017 → 018 → 019`. Per-migration behavior:
   - **001** — guarded `create_table` of `users`, `service_accounts`, `audit_log` all hit `has_table == True`; full no-op.
   - **002** — guarded creates of `data_sources`, `documents`, `document_chunks` all no-op.
   - **003** — guarded create of `model_registry` no-ops.
   - **004** — records-only (`search_sessions`, `search_queries`, `search_results`); unguarded; all three tables created normally.
   - **005** — records-only (`records_requests`, `request_documents`, `document_cache`); unguarded; all three tables created normally.
   - **006** — `exemption_rules` create guarded (no-op); `exemption_flags` and `disclosure_templates` creates unguarded (both created).
   - **787207afc66a** — the 6 shared creates (`connector_templates`, `departments`, `system_catalog`, `city_profile`, `notification_templates`, `prompt_templates`) each no-op via guards. The 6 records-only creates (`fee_schedules`, `fee_line_items`, `notification_log`, `request_messages`, `request_timeline`, `response_letters`) run normally. Shared `add_column`s on `data_sources`, `documents`, `model_registry`, `users` each no-op via guards (columns already present from baseline). Records-only `add_column`s on `records_requests`, `exemption_flags`, `search_results` run normally.
   - **008, 009, 010** — records-only (status enum extension, `fee_waivers` create, sent-status removal); unguarded; apply normally.
   - **011** — `fix_schema_drift` shared-column adds each hit `has_column == True`; no-op.
   - **012** — RBAC role upserts guarded; no-op if liaison + public roles already seeded by baseline.
   - **013** — connector enum additions on shared `data_sources` guarded; no-op.
   - **014** — connector-idempotency shared-schema changes guarded; no-op.
   - **015** — `data_sources` scheduler column adds guarded; no-op.
   - **016** — shared `sync_run_log` and `sync_failures` creates guarded; no-op.
   - **017** — connector enum rename guarded at the data-migration layer; no-op if values already match.
   - **018** — `city_profile.state` nullable alter guarded; no-op if already nullable.
   - **019** — shared `data_sources` connection-config encryption pass guarded; no-op if values already encrypted.
5. At the end, `alembic_version` = `019_encrypt_connection_config`, `alembic_version_townlight_core` = `townlight_core_0001_baseline_v1`. DB contains all 16 shared tables and all 15 records-only tables.
6. Net: same end-state as Scenario A. No manual operator steps.

**Scenario C — townlight_core-only install (a future module installs before records):**

1. Operator installs the future module which depends on townlight_core.
2. Civiccore baseline creates the 16 shared tables.
3. Operator later installs records v1.3.0 and runs `alembic upgrade head`.
4. Civiccore baseline already at HEAD — runner is a no-op.
5. Records' guarded migrations see shared tables present; apply records-only operations and no-op shared.
6. Net: works.

### 5. CI verification (gates Phase 1 PR merge)

Three integration tests, all on ephemeral Postgres in CI:

- **fresh-install test:** empty DB → records env.py with townlight_core wiring → assert all 16 shared tables present, all 15 records-only tables present, no migration errors, `alembic_version` at `019_encrypt_connection_config`, `alembic_version_townlight_core` at `townlight_core_0001_baseline_v1`.
- **upgrade test:** seed Postgres with v1.2.x schema dump → upgrade to records v1.3.0 → assert no errors, all guarded operations no-op, schema unchanged.
- **reapplication test:** run env.py twice in succession on either of the above DBs → assert second run is a no-op (proves idempotency).

## Consequences

- **Phase 1 records-side PR scope:** 14 migration files edited (mechanical guard wrapping), `env.py` updated (6 lines), `pyproject.toml` updated (1 dependency line). No semantic schema change. Diff is large but obvious and reviewable.
- **No data loss.** Every guard is "skip if already exists" — never destructive. Records' downgrades work as before (guards apply only to upgrade direction).
- **No manual operator steps** for v1.2.x → v1.3.0 upgrade. The earlier ADR's "operator runs `townlight_core-migrate stamp head` once" requirement is gone — guards in the baseline migration handle the existing-tables case automatically.
- **Reversibility:** Civiccore baseline `downgrade()` is intentionally a no-op. To uninstall townlight_core from an existing deployment, the operator drops the `alembic_version_townlight_core` table; the actual shared tables remain (records still owns them in its own history through 019).
- **Future townlight_core migrations are clean:** townlight_core_0002 onward are normal Alembic migrations with no guards. The baseline absorbs all the historical records-vs-townlight_core ownership ambiguity into one synthetic revision.
- **The fork-the-fork pattern is structurally avoided.** Clerk, code, zone, etc. depend on `townlight_core >= 0.1` and never duplicate shared-table DDL.

## Implementation order

1. **Civiccore (Phase 1 PR Part A):**
   - Write `townlight_core/migrations/guards.py` (the three wrapper functions).
   - Write `townlight_core/migrations/runner.py` (the `upgrade_to_head(connection)` entry point).
   - Write `townlight_core/migrations/versions/townlight_core_0001_baseline_v1.py`.
   - Wire townlight_core's own `alembic.ini` and `alembic/env.py`.
   - CI: idempotency test (run baseline twice on empty DB; assert second run is no-op).

2. **Civicrecords-ai (Phase 1 PR Part B):**
   - Apply the 14-migration guard pass.
   - Wire `backend/alembic/env.py` to call townlight_core runner first.
   - Add `townlight_core = "==0.1.0"` (or `>=0.1,<0.2`) to `backend/pyproject.toml`.
   - Apply the three CI gates above.
   - Update records `CHANGELOG.md`: v1.3.0 release notes call out townlight_core dependency.

3. **Compatibility matrix** (in Townlight/townlight `docs/compatibility/index.md`): populated with townlight_records v1.3.0 ↔ townlight_core v0.1.0 row, "Last verified" dated.

4. **Records v1.3.0 ships** as a normal patch+minor release. No manual upgrade steps for operators; the env.py wiring handles everything.
