# ADR-0001: Extract Townlight Core as a non-breaking refactor before any second module starts

## Status

Accepted.

## Context

Townlight Records is the only shipping module today. Its repository already
contains every shared subsystem the rest of the Townlight catalog will
need: authentication and RBAC, the hash-chained audit log, the LLM
abstraction layer, the document ingestion pipeline, hybrid search, the
connector framework, notifications, the onboarding wizard, the 50-state
exemption engine, and the sovereignty verification scripts.

If Townlight Meetings, Townlight Code, or Townlight Zoning start as a fork of the records
repo, every subsequent module forks the fork. Audit-log fixes happen in
three places. Exemption-engine rules drift between modules. A security
patch touches ten repos. We have seen this movie in municipal software
before — it is why CivicPlus owns eleven disconnected products behind
one logo.

## Decision

Extract the shared subsystems into a standalone townlight_core package via a
phased non-breaking refactor (Phases 0 through 5 per `specs/02_Townlight Core.md`
section 12). Phase 1 — moving the User, Role, Department, and audit_log
models with import shims — is the critical proof point. Until Phase 1
ships and Townlight Records continues to pass its full test suite on top of
Townlight Core, no second module work begins.

## Consequences

- Townlight Meetings Phase 1 (meeting CRUD, agenda-item CRUD, basic staff workbench)
  cannot begin before Townlight Core Phase 1 ships.
- The fork-the-fork failure mode is structurally avoided.
- Every future module pays a small dependency cost (one pip install) in
  exchange for getting hardened shared infrastructure for free.
- Phase 5 of the extraction (shim removal) is a single reviewable codemod
  run; the records repo never lives in a half-migrated state.
