# Full-Suite Program: Finishing All 27 Modules

Adopted: 2026-06-10. Owner: Scott Converse. This document supersedes the
city-core-only execution focus and defines the program that runs until every
catalog module is finished. The canonical spec
([CivicSuiteUnifiedSpec.md](../CivicSuiteUnifiedSpec.md)) still defines what
each module is; this document defines the order, the gate, and the resource
rules for finishing them.

## Goal

All 27 product modules plus Townlight Core finished as genuine products — not
specs, not scaffolds, not labels — installable end to end by a non-technical
municipal operator via a double-click installer, with every claim backed by
replayable evidence. There is no pilot city; the program generates its own
proof.

## Definition of Done (per module — no exceptions, no substitutes)

A module is done only when all of the following hold, in one recorded run:

1. A clean test VM is restored to its pristine snapshot (a machine that has
   never seen the code).
2. The suite installer is double-clicked and the module installs and starts
   with no terminal use and no documentation outside the installer's own
   screens.
3. Every workflow in the module's canonical spec section is exercised end to
   end through the browser, with evidence captured (screenshots or
   recordings plus the persisted database).
4. The VM is rebooted and the data and workflows survive.
5. The evidence kit is committed with the release tag.

A green CI run, a passing test suite, a version label, or an agent's
assertion is not done. Only the kit is done. This rule exists because this
org shipped false v1.0.0 labels in May 2026; the gate is designed so that
claim-without-proof is structurally impossible.

## Execution order (approved 2026-06-10)

One module in flight at a time. Per module: build to real product depth →
wire into Townlight Core and sibling modules → installer integration → clean-VM
evidence run → honest release tag → next module.

1. **Core hardening:** Townlight Meetings persistence (motions, votes, minutes,
   archive to its migrated schema, database as default), Townlight Code
   persistence-by-default plus a real frontend, Townlight Core exemptions engine
   (first statutory seed: Colorado CORA) consumed by Townlight Records,
   Townlight Records notification wiring.
2. **Installer rebuild** per [ADR-0008](../architecture/ADR-0008-portable-native-windows-runtime.md)
   and [ADR-0009](../architecture/ADR-0009-postgres-backed-queue-windows-profile.md):
   portable-native Windows runtime, unsigned-beta trust screens, lifecycle
   (install/start/health/repair/backup/restore/uninstall).
3. **First clean-VM gate:** the core four pass the Definition of Done as one
   package. This is the program's first honest "beta" claim.
4. **Starter Set:** Townlight Notice, Townlight Budget, Townlight Legal, Townlight Data, Townlight HR
   — with the Townlight Access re-probe and gap closure folded in during this
   block.
5. **Land use:** Townlight Zoning, Townlight Planning, Townlight Permitting, Townlight Inspections.
6. **Administrative:** Townlight Grants, Townlight Procurement, Townlight Contracts,
   Townlight Boards.
7. **Operations:** Townlight 311, Townlight Communications, Townlight Regulatory Watch (repo to be created
   from `specs/05_civicregwatch.md`), Townlight API (repo to be created from
   `specs/06_civicapi.md`).
8. **Internal business:** Townlight Elections.
9. **Specialized:** Townlight Utilities, Townlight Courts, Townlight Safety, Townlight Library,
   Townlight Parks.

Module labels are never promoted ahead of their evidence kit. Demotion-truth
labels stay until the gate passes.

## Resource rules

- The GitHub account is on the Free plan. Hosted Actions minutes and LFS are
  budgeted: routine CI runs on the self-hosted runner
  (`civicsuite-wsl-linux-2`, labels `self-hosted, linux, x64`); hosted
  runners are reserved for release-tag verification.
- Fork pull requests require explicit approval before any workflow runs
  (repository Actions policy `all_external_contributors`) because
  self-hosted runners execute workflow code.
- Evidence kits ship as release assets, not LFS objects. Screenshots are
  compressed. LFS stays reserved for cases with no alternative.
- Development happens on local hardware; spending money is a last resort
  that requires Scott's explicit approval.

## Local workspace truth

Suite development and evidence live under `C:\CivicSuiteDev\` (repos, tools,
plans) and `D:\CivicSuiteDev\` (test VM, models, artifacts) on the
development machine. The suite's local PostgreSQL test instance runs on port
54330. Older documents referencing `C:\dev\Claude\...` paths describe
historical runs; new evidence paths follow this layout. Durable truth always
lives in pushed branches, tags, and release assets — never only on local
disk.
