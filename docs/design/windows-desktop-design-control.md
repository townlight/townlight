<a id="civicsuite-windows-desktop-design-control"></a>

# Townlight Windows Desktop Design Control

Status: active design control for Windows Local 1.0
Applies to: Townlight desktop shell, installer, first-run, city-core modules, and future module manager
Source anchors:

- `docs/CivicSuiteUnifiedSpec.md`
- `docs/design/ui-ux-prototype/README.md`
- `docs/design/ui-ux-prototype/*.jsx`
- `docs/design/ui-ux-prototype/styles.css`
- `docs/ux/shared-shell-inventory.md`
- `docs/architecture/ADR-0008-portable-native-windows-runtime.md`
- `docs/architecture/ADR-0009-postgres-backed-queue-windows-profile.md`
- `docs/installer/suite-installer-plan.md`
- `specs/01_catalog.md`
- `specs/02_CivicCore.md`
- `specs/03_civicclerk.md`

## Product Promise

Townlight Windows Local 1.0 is a real Windows desktop application for
non-technical municipal staff. A city clerk should be able to install it, create
the first city profile, use the city-core workflows, verify system health, back
up and restore local data, and uninstall without Docker, WSL, a terminal, or
developer vocabulary.

The UX rule is simple: a clerk should never have to understand the architecture
to do the work.

## Audience

Primary users:

- City clerks and deputy clerks
- Records staff
- City employees handling public records, meetings, notices, minutes, code, and
  source documents

Secondary users:

- Small-city managers who share clerk/admin work
- Light IT staff or managed-service providers

Non-goals for the primary path:

- Requiring terminal commands
- Requiring Docker Desktop, WSL, Linux knowledge, or service orchestration
- Exposing ports, processes, migrations, model internals, or logs before the
  plain-English health summary

## Application Shape

The Windows app is a Tauri/WebView2 desktop shell over a fully local runtime.
The shell owns these top-level areas:

| Area | User framing | Owner |
|---|---|---|
| Home | Work that needs attention | Townlight shell |
| Meetings & Notices | agendas, packets, notices, minutes, votes, archive | Townlight Meetings |
| Records Requests | intake, search, review, response, exports | Townlight Records |
| Code & Ordinances | code search, source imports, guidance, handoffs | Townlight Code |
| Search City Knowledge | cross-module local search with citations | Townlight Core + modules |
| System Health | local services, model, storage, backup, support bundle, repair | Townlight Core |
| Settings | city profile, users, modules, data location, updates | Townlight Core |

The module names remain visible for trust and support, but primary navigation is
task-first. A clerk sees "Meetings & Notices" before "Townlight Meetings".

## Surfaces

The app keeps the prototype's three-surface commitment:

| Surface | Audience | Rule |
|---|---|---|
| Staff | clerks and city employees | Default authenticated work surface |
| Resident/Public | public-facing preview and local publication surfaces | Never exposes staff-only actions |
| IT/Admin | health, repair, model, logs/support bundle, modules, backups | Plain-English summary first; technical detail behind disclosure |

Switching surfaces is always visible in the shell. A route must identify which
surface the user is in.

Local administrators manage staff users in Settings, including add, disable,
re-enable, and temporary-passcode reset actions. Staff roles are plain municipal
roles, not technical groups: City staff can work across the installed city-core
modules; Clerk staff are limited to Meetings & Notices; Records staff to Records
Requests; Code staff to Code & Ordinances. Staff users do not receive setup,
runtime, backup, module-manager, or user-management authority unless they are
the local administrator.

## First-Run And Installer UX

The installer and first-run wizard are product surfaces, not setup scripts. They
must use the same voice and design discipline as the app.

Required installer steps:

1. Welcome screen.
2. Local install location and data location.
3. Module selection: City Core by default, Custom available, Townlight Core locked.
4. City profile: city name, state, time zone, records contact, clerk contact.
5. First admin user. The first admin signs in before model, backup, health,
   module-manager, repair, restore, or runtime changes continue.
6. Backup default.
7. Model download: Gemma 4 12B quantization-aware weights, pinned metadata,
   resumable download, checksum verification, and local-only default.
8. Health verification.
9. Finish screen with open app, repair, backup, support bundle, and uninstall
   entry points.

The installer must not ask clerks to open a terminal, edit environment files, or
start Docker/WSL. If a technical failure happens, the installer gives a plain
next step and records the technical detail in the health/log area.

## Workflow UX Rules

Every primary workflow screen answers three questions:

- What am I working on?
- What needs my attention?
- What is the next safe action?

Risky civic actions use guided review:

- Posting a meeting notice
- Publishing or archiving a record
- Adopting or posting minutes
- Generating a response letter
- Importing code/source material
- Creating an ordinance or resolution handoff
- Running backup, restore, support bundle, repair, disable, or uninstall

Guided review must show:

- Draft/internal/public/official status
- Sources and citations
- What will change
- Who will be able to see the result
- Audit trail entry that will be created
- Failure path and safe retry path

The UI must block official/public language when the underlying workflow is
sample-only, in-memory, disconnected, missing citations, or not yet wired.

## Module Manager UX

The module manager is present in the Windows Local 1.0 architecture even when
only the city-core set is enabled.

It shows:

- Installed modules
- Available modules
- Disabled or not-ready modules when useful for roadmap transparency
- Dependencies in clerk-readable language
- Required disk/model/runtime resources
- Install, disable, repair, update, backup, export, and uninstall states

Townlight Core is always installed and cannot be deselected. Product modules can be
installed one at a time when their manifest and proof gates pass.

Future modules plug into the same shell by declaring their manifest contract.
No future module may require rewriting the desktop shell or installer to become
visible.

## Copy And State Honesty

User-visible text must avoid developer framing. Preferred wording:

- "Local data store" instead of "PostgreSQL cluster" on clerk surfaces
- "Local AI model" instead of "Ollama runtime" on clerk surfaces
- "Needs setup" instead of "missing environment variable"
- "Draft" or "internal" instead of implied official status
- "Sample data" only when data is actually sample

Forbidden release-facing behavior:

- Calling a workflow live when it is a handoff stub
- Calling an answer official when citations are missing
- Calling a module installed when its health check is not passing
- Calling the suite city-ready, procurement-ready, production-ready, or
  full-suite ready without the matching release gate

## Token Authority

**Token authority.** The suite's design **tokens** — color, ink ramp, status
palette, type families, density metrics, radii — live in
`civiccore-ui/tokens/tokens.css` (in the `civiccore` repo). That file is the
single source of truth for token *values*. This prototype's
`docs/design/ui-ux-prototype/styles.css` remains canonical for the **component
layer** (the classes and layout that consume those tokens), but it no longer
owns token values: it consumes a vendored copy of `tokens.css` and must not
redefine a `:root` custom property that `tokens.css` already defines.

**Consumption rule (offline binaries cannot `@import` at runtime).** Every
consumer — the Tauri/WebView2 desktop app (`desktop/src/styles.css`) and this
prototype's `styles.css` — vendors a **generated copy** of `tokens.css` pinned
to a `civiccore` version. A CI `--check` gate fails the build if a vendored copy
drifts from the pinned source, in the same idiom as the `source_commit` pins and
the generated topology block. Any JS/JSON token mirror is **generated** from
`tokens.css`, never hand-maintained.

**Accessibility floor.** Token values ship WCAG-AA-validated. Three rules are
load-bearing and encoded in the token comments:

- `--gold` is **accent / border / large-text only** (white-on-`--gold` is
  3.22:1 — a fail for body text). Text-bearing gold is `--gold-2`.
- Gold text on pale gold surfaces uses `--gold-strong` (`--gold-2` on
  `--gold-soft` is only 4.31:1).
- `--ink-4` is **decorative only** (2.48:1 on `--paper`) — never body copy,
  labels, or metadata.

Changing a token value requires re-verifying its contrast pairings against the
ledger in `civiccore-ui/tokens/tokens-reference.html`. The shipped desktop
interaction patterns that consume these tokens are documented in
[civicsuite-ui-patterns.md](civicsuite-ui-patterns.md).

## Accessibility And Density

The desktop shell follows the canonical prototype tokens and shared shell
inventory:

- One visible page title per page
- Keyboard access to every navigation and action control
- Visible focus
- Error states with fix paths
- Empty states with next action
- Status never conveyed by color alone
- Citations visible without hover-only affordances
- Desktop-first layout that still degrades cleanly to narrow windows

## Acceptance

The Windows desktop UX is acceptable only when a non-technical clerk can:

- Install from a clean Windows machine
- Create a city profile and first admin user
- Download and verify the model
- Create a meeting, notice, minutes draft, vote/action record, and archive item
- Intake, search, review, and export a records request
- Import/search code and create a clerk handoff
- Use cross-module search with citations
- Read system health without technical vocabulary
- Back up, restore, repair, close, reboot, reopen, and uninstall

If any step requires architecture knowledge, the UX has failed.
