# Architecture Decision Records

Cross-module architectural decisions are recorded here as ADRs. Each ADR is a
single markdown file named `ADR-NNNN-short-title.md`.

ADRs scoped to a single module live in that module's repo, not here. Use this
folder for decisions that affect two or more modules, the platform contract, or
the suite as a whole.

## Index

- [ADR-0001: Extract Townlight Core first](ADR-0001-extract-civiccore-first.md)
- [ADR-0002: SQLAlchemy declarative Base lives in civiccore.models.base](ADR-0002-base-declarative-class-ownership.md)
- [ADR-0003: Townlight Core Alembic baselines after the Phase-2 extensions migration](ADR-0003-civiccore-alembic-baseline-strategy.md)
- [ADR-0004: Shared shell boundaries before frontend package extraction](ADR-0004-shared-shell-boundaries.md)
- [ADR-0005: Connector import/export boundaries before vendor write-back](ADR-0005-connector-import-export-boundaries.md)
- [ADR-0006: Townlight Core v0.3.0 extraction scope favors audit, provenance, manifests, and city profile](ADR-0006-civiccore-v0-3-extraction-scope.md)
- [ADR-0007: First production-depth workflow is Townlight Meetings agenda packet and notice](ADR-0007-first-production-depth-workflow.md)
- [ADR-0008: Windows deployment profile is portable-native, not Docker](ADR-0008-portable-native-windows-runtime.md)
- [ADR-0009: Background work runs on a Postgres-backed queue in the Windows profile](ADR-0009-postgres-backed-queue-windows-profile.md)
- [ADR-0010: Future modules install through a strict module package contract](ADR-0010-module-package-contract.md)
