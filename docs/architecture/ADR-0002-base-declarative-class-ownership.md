# ADR-0002: SQLAlchemy declarative Base lives in townlight_core.models.base

## Status

Accepted — 2026-04-23.

## Context

Phase 1 of the Townlight Core extraction (per `specs/02_Townlight Core.md` section 12) moves the User, Role, Department, and audit_log SQLAlchemy models into the townlight_core package. Those models (and every model that subsequent modules will add) need a single shared declarative base so SQLAlchemy can manage one metadata graph for the suite.

In the current townlight_records codebase, `Base = declarative_base()` lives in `backend/app/models/user.py` and is imported by every other model file. That coupling — `Base` defined in the user model — is an accident of history, not a design choice. Carrying it forward into townlight_core would put the shared declarative base inside `townlight_core/models/user.py`, which makes no sense for a future module that doesn't import users (e.g. a future read-only public-data module).

Day-3 inventory (`townlight_records/docs/townlight_core-extraction-inventory.md` Section F.1, reviewed 2026-04-23 by audit agent) called this out as a one-way decision that needs to land before Phase 1 starts.

## Decision

Civiccore exposes `townlight_core.models.base.Base` as a dedicated module. Every model in townlight_core subclasses it. Every module that adds tables (records, clerk, code, zone, etc.) imports the same Base from townlight_core.

During Phases 1–4, townlight_records keeps `from app.models.user import Base` working via a re-export shim:

```python
# backend/app/models/user.py (shim for the duration of Phases 1–4)
from townlight_core.models.base import Base  # noqa: F401
```

Phase 5 removes the shim via the same codemod that removes all other shims.

## Consequences

- One declarative metadata for the whole suite. Cross-module foreign keys work natively without resorting to string references.
- Module-private tables (records-only, clerk-only) still register against the same Base — Alembic's `target_metadata` handles namespacing through schema-qualified table names per spec section 11.
- Risk: any module that wants its own isolated metadata (none planned) would need a separate Base. That is a deliberate constraint, not a defect.
- Phase 1 PR adds `townlight_core/models/base.py` (~5 lines) before any model file moves.
