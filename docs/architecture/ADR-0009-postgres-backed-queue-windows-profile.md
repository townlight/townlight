# ADR-0009: Background work runs on a Postgres-backed queue in the Windows profile

Status: Accepted

Date: 2026-06-10

## Context

ADR-0008 removes Docker from the Windows operator path. The suite's
background-work layer is specified as Redis plus Celery, and Redis has no
supported native Windows build. The candidate substitutes are unattractive
for a clerk-grade machine: Memurai is commercial, Garnet is young, and any
Redis stand-in adds a second stateful service to install, monitor, back up,
and repair.

Every module already requires PostgreSQL. PostgreSQL's `SELECT ... FOR UPDATE
SKIP LOCKED` pattern supports reliable task queues at municipal scale, and
mature Python implementations exist (for example Procrastinate).

## Decision

- Townlight Core gains a `townlight_core.tasks` abstraction for enqueueing, scheduling,
  and worker execution.
- The abstraction has two backends: `celery-redis` (Linux/server profile,
  spec unchanged) and `postgres` (Windows profile, SKIP LOCKED queue).
- Module code enqueues and schedules only through `townlight_core.tasks`. Direct
  Celery imports in module code are a lint violation once the abstraction
  ships.
- Scheduled (beat-style) jobs use the queue's scheduler on the Windows
  profile.

## Boundaries

In scope:

- The `townlight_core.tasks` subsystem with backend-parity contract tests.
- Migration of existing module task definitions (Townlight Records's Celery
  tasks first) onto the abstraction, with identical behavior on the Linux
  profile.

Out of scope:

- Removing Redis/Celery from the Linux/server profile.
- Any cross-machine or distributed-worker topology.

## Consequences

- The Windows profile needs zero services beyond PostgreSQL, Ollama, and the
  suite's own processes.
- Townlight Core carries parity tests proving a task behaves identically on both
  backends.
- Townlight Records's worker layer is the first consumer to migrate; its Linux
  compose deployment keeps Celery and must show no behavior change.
- Queue throughput on Windows is bounded by PostgreSQL; this is acceptable
  for single-city scale and is revisited only with evidence.
