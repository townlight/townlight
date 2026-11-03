# ADR-0008: Windows deployment profile is portable-native, not Docker

Status: Accepted

Date: 2026-06-10

## Context

The program's governing acceptance test is now explicit: a non-technical
municipal operator (a city clerk in a small town) double-clicks one installer
on a stock Windows machine and the suite installs, starts, and survives a
reboot, with no terminal and no documentation outside the installer's own
screens.

The current Windows install path wraps Docker Desktop plus WSL 2. That path
cannot pass the acceptance test for structural reasons, not polish reasons:

- Docker Desktop requires administrator rights, WSL 2 enablement,
  virtualization enabled in firmware, and multiple gigabytes of overhead.
- Docker Desktop interposes its own license prompt and its own update and
  diagnostics surfaces between the operator and the suite.
- Every Docker Desktop failure mode (WSL servicing failures, virtualization
  disabled, corporate policy blocks) becomes a Townlight support incident
  that a small-town clerk cannot resolve.

A sibling project on the same development hardware (CivicCast) shipped a
native Windows `setup.exe` with a portable PostgreSQL runtime and a
clean-machine install proof kit, demonstrating that the portable-native
pattern works for this product class. Its development environment also runs a
full real-PostgreSQL test suite with no container layer.

## Decision

The Windows deployment profile becomes portable-native:

- The suite installer bundles portable PostgreSQL 17 with the pgvector
  extension, a native Ollama runtime, and per-module Python services on a
  bundled CPython, with module frontends served by the services themselves.
- One launcher process owns lifecycle: install, start, stop, health,
  repair, backup, restore, uninstall.
- Docker appears nowhere on the Windows operator path.
- The Linux/server deployment profile keeps the existing container-first
  architecture unchanged. Module code remains deployment-agnostic; only
  packaging differs per profile.
- Until a code-signing program exists, the installer's first screen explains
  in plain language that this is open-source beta software, why it is
  unsigned, how to verify the published SHA-256, and exactly what the
  Windows SmartScreen warning will look like.

## Boundaries

In scope:

- Suite installer rework for the Windows profile.
- A per-profile runtime matrix in the unified spec and ARCHITECTURE.md.
- Windows CI lanes that exercise the native stack.

Out of scope:

- Any change to module application architecture or APIs.
- Dropping the Linux container profile.
- macOS lifecycle claims (still beta/readiness only).

## Consequences

- Installer work shifts from compose orchestration to runtime bundling and
  process supervision.
- The Redis/Celery layer needs a Windows-profile answer; ADR-0009 records it.
- Existing Docker-based Windows install evidence is superseded; new
  clean-machine evidence is required before any Windows installability claim.
- The portable PostgreSQL + pgvector bundle becomes a maintained build
  artifact of the suite.
