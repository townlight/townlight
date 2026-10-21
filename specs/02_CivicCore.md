**CivicCore v0.1**

**Extraction Spec**

*A non-breaking refactor of the CivicRecords AI repo into a shared
platform package*

Companion artifact: CivicSuite meta-repo definition

Version 0.1 --- Draft for review --- April 23, 2026

Open source · AGPL-3.0 · Gemma 4 default · model-pluggable

**Document Metadata**

  ---------------------- ---------------------------------------------------------------------------------------------------------------------------------------------------------------------
  **Document status**    v0.1 --- draft for review. Ships as a non-breaking refactor; no user-visible change to CivicRecords AI.
  **Supersedes**         Nothing. This is the first CivicCore spec. Complements CivicSuiteAI\_Module\_Catalog\_v1 and CivicRecordsAI-UnifiedSpec-v3.0.
  **Grounded in**        CivicRecordsAI-UnifiedSpec-v3.0 (April 13, 2026) --- the canonical Module 1 spec, whose shared plumbing is the source of the extraction.
  **Scope**              Identify what moves from the CivicRecords AI repo into a shared CivicCore package; define the new CivicSuite umbrella repo; specify a phased, non-breaking rollout.
  **Out of scope**       New CivicCore features. Product decisions about future modules. Changes to CivicRecords AI product behavior.
  **License**            Code: AGPL-3.0-only, with the TownLight Public Institution Exception for qualifying deployments. Docs: CC BY 4.0.
  **Default model**      Gemma 4 via Ollama. Model registry + context\_window\_size driving per-module token budgets.
  **Primary audience**   CivicRecords AI maintainers; future CivicClerk, CivicCode, CivicZone contributors; city IT evaluators.
  **Completion bar**     No regressions in CivicRecords AI. Import paths migrated with shim fallback. Every extracted subsystem has its own unit-test suite living in CivicCore.
  ---------------------- ---------------------------------------------------------------------------------------------------------------------------------------------------------------------

**Table of Contents**

**Part I. Purpose & Positioning**

**1. Why this spec exists**

The CivicRecords AI v3.0 spec is an excellent Module 1 specification.
Read as a suite spec, it is thin: it treats municipal code, zoning,
comprehensive plans, boards, notices, contracts, legal research, HR, and
elections as either connector domains or generic documents. The
CivicSuite module catalog fills those gaps at the product layer. This
spec fills them at the architecture layer.

The repo that shipped CivicRecords AI already contains most of the
infrastructure a second module would need: auth, RBAC, audit, LLM
abstraction, document ingestion, connector framework, notification
service, onboarding wizard, the 50-state exemption engine, and the
sovereignty verification scripts. Building CivicClerk or CivicCode means
either forking that code (fatal long-term) or extracting it into a
package (the right move).

CivicCore is that package. This spec defines what it is, what moves into
it, what stays out, how the move is staged without breaking the existing
product, and what the resulting repository topology looks like ---
including a new CivicSuite umbrella repo for suite-wide coordination.

**2. Non-goals**

-   No new CivicCore features. Every capability that appears in
    CivicCore v0.1 already exists in CivicRecords AI today. This is
    packaging, not engineering.

-   No changes to CivicRecords AI product behavior. The web UI, the API
    contracts, the database schema as visible to the records module, and
    the user-visible wording all stay exactly the same.

-   No simultaneous rewrite. We do not rewrite auth, audit, LLM
    abstraction, or anything else in the extraction. We move files,
    adjust imports, and write backward-compat shims. That is all.

-   No new language. CivicCore stays Python/FastAPI/SQLAlchemy.
    CivicCore's React primitives (if any are extracted) stay React + the
    same design tokens.

-   No cloud anything. CivicCore inherits CivicRecords AI's sovereignty
    stance unmodified: no outbound calls at runtime, no telemetry, all
    LLM inference local.

**3. What CivicCore is (one sentence per role)**

-   For a new module author: the package you pip-install to get auth,
    RBAC, audit, LLM access, document ingestion, hybrid search,
    connectors, notifications, and an admin shell --- all already
    hardened in production.

-   For a city IT evaluator: the foundation installed once, upgraded
    once, and reused by every module the city adopts.

-   For a maintainer: the shared codebase that stops each new module
    from reimplementing the same 20 files badly.

-   For a skeptic: not a framework. CivicCore is a library of
    deliberately small, documented subsystems with stable interfaces.
    Modules depend on its public API. They do not subclass its
    internals.

**4. Strategic rationale**

The risk of not doing this is concrete and predictable. If CivicClerk
starts as a fork of CivicRecords AI, every subsequent module forks the
fork. Audit-log fixes happen in three places. Exemption-engine rules
drift between modules. A security patch touches ten repos. We have seen
this movie in municipal software before --- it is why CivicPlus owns
eleven disconnected products behind one logo.

The value of doing it now is equally concrete. CivicRecords AI is the
only module today. Every file we extract now is a file we don't have to
retrofit across five modules later. Every import path we shim now is a
migration we don't have to negotiate with five teams. CivicCore v0.1 is
cheapest at v0.1.

**Part II. Repository Topology**

**5. The CivicSuite umbrella repo**

A deliberate choice: CivicSuite is not an AI product. It is the
meta-repo that makes the suite coherent. It ships no code. It owns
shared narrative: the module catalog, the roadmap, the suite-wide design
principles, cross-module architecture decision records, the suite-wide
changelog, and the governance that every contributing module agrees to.

The name drops the AI suffix on purpose. CivicRecords AI keeps its
suffix for continuity with the existing repo and v3.0 spec. Future
modules drop it (CivicClerk, CivicCode, CivicZone) because suite
identity carries it. And the umbrella --- CivicSuite --- drops it
hardest, because the suite's value is not "it uses AI." The suite's
value is "it runs locally, on your hardware, across every civic
surface." The name should reflect that.

**5.1 CivicSuite repo contents**

-   README.md --- the one-page pitch, links to every module, the
    60-second answer to "what is this."

-   docs/catalog/ --- the current Module Catalog (rendered from the
    source .docx for GitHub viewers).

-   docs/principles/ --- the non-negotiable suite-wide principles
    (clerk-first, calm UI, human-in-the-loop, local LLM, no telemetry).

-   docs/architecture/ --- ADRs spanning modules. Decisions like
    "CivicCore owns the audit chain" or "modules are independently
    versioned" live here.

-   docs/roadmap/ --- phased rollout, module dependency graph, release
    train cadence.

-   docs/governance/ --- contribution model, maintainer roles, licensing
    posture, security disclosure.

-   docs/compatibility/ --- the CivicCore compatibility matrix: which
    CivicCore version each module supports.

-   CHANGELOG.md --- suite-wide milestones ("CivicClerk v0.1 released",
    "CivicCore v0.2 compatible with all modules"). Not a substitute for
    per-module changelogs.

-   LICENSE --- CC BY 4.0 for docs. A second LICENSE-CODE file with AGPL-3.0
    for any example snippets.

**5.2 Why a dedicated umbrella repo (not a monorepo)**

Three reasons. First, cities install modules selectively; a monorepo
forces the whole suite on anyone who wants to read the code. Second,
modules ship on independent cadences --- CivicRecords AI is at v3.x
while CivicZone might be pre-v0.1 for a year. A monorepo either ties
them together artificially or ends up with awkward internal versioning.
Third, contributors work on one module at a time; the cognitive and CI
overhead of a monorepo is not worth paying for independent modules with
stable interfaces.

A shared umbrella repo gives us the monorepo's one real benefit --- a
single place to talk about the whole suite --- without any of its costs.

**6. Full topology**

  ------------------------------- -------------------------------------------------------------------------------------------------------------------------------------------------- ------------------------------------------ --------------------------------------------------------------------------------------
  **Repo**                        **Contains**                                                                                                                                       **License**                                **Published as**
  CivicSuite (new)                Umbrella docs: catalog, roadmap, strategy, design principles, cross-module ADRs, suite-wide changelog, governance.                                 CC BY 4.0 (docs) + AGPL-3.0 (example configs)     GitHub org landing repo; not installable
  CivicCore (new)                 Shared platform: auth, RBAC, audit chain, LLM abstraction, connector framework, ingestion, search, notifications, admin shell, exemption engine.   AGPL-3.0-only                                     pip wheel: civiccore ; container base image: civiccore-base
  CivicRecords AI (existing)      Records-module code only: request lifecycle, letter generation, fee schedules, public portal (planned), exemption dashboard.                       AGPL-3.0-only                                     pip wheel: civicrecords ; docker-compose: existing stack, now pulling civiccore-base
  CivicClerk (future)             Meeting, agenda, minutes, voting module. Depends on civiccore.                                                                                     AGPL-3.0-only                                     pip wheel: civicclerk
  CivicCode (future)              Municipal code / ordinance Q&A. Depends on civiccore, civicclerk.                                                                                  AGPL-3.0-only                                     pip wheel: civiccode
  CivicZone (future)              Zoning Q&A, parcel-aware lookups, overlay districts. Depends on civiccore, civiccode.                                                              AGPL-3.0-only                                     pip wheel: civiczone
  CivicSuite-prompts (optional)   Prompt libraries for every module. Versioned YAML. Separate repo so cities can fork prompts without forking code.                                  CC BY-SA 4.0                               pip wheel: civicsuite-prompts (reference copy)
  ------------------------------- -------------------------------------------------------------------------------------------------------------------------------------------------- ------------------------------------------ --------------------------------------------------------------------------------------

Every module has its own repository, its own changelog, its own release
cadence, and its own version. Every module depends on a CivicCore
version. Every module is installable on its own --- a city running only
CivicRecords AI does not accidentally install CivicClerk.

**7. CivicSuite GitHub organization layout**

github.com/civicsuite/

├── civicsuite (this umbrella repo)

├── civiccore (shared platform package)

├── civicrecords-ai (existing records module)

├── civicclerk (future --- Clerk Core)

├── civiccode (future --- Clerk Core)

├── civiczone (future --- Land Use)

├── civicsuite-prompts (optional --- prompt library)

└── civicsuite-deploy (optional --- reference Compose/K3s manifests)

civicsuite-deploy is an optional seventh repo holding reference
deployment manifests --- docker-compose for each profile, K3s Helm
charts for on-prem server profile, air-gap installer scripts. Operations
teams work here; developers don't touch it. If it proves unused, it
collapses into civiccore.

**Part III. What Moves, What Stays**

**8. The extraction inventory**

Every line in the table below is an auditable move. A contributor
executing this spec should be able to open the CivicRecords AI repo,
open a CivicCore branch, and translate each row into a concrete git mv +
import rewrite.

  ----------------------------- ------------------------------------------------------------------------------------------------------------- ----------------------------------------------------------------------- ------------------------------------------------------------------------------------------
  **Subsystem**                 **Current path in CivicRecords AI repo**                                                                      **Target path in CivicCore**                                            **Public API surface**
  Auth / RBAC                   backend/app/auth/\*, backend/app/models/user.py, backend/app/models/role.py                                   civiccore/auth/\*, civiccore/models/user.py, civiccore/models/role.py   civiccore.auth.require\_role, civiccore.auth.current\_user, civiccore.models.User
  Audit chain                   backend/app/audit/\*, backend/app/models/audit\_log.py                                                        civiccore/audit/\*, civiccore/models/audit\_log.py                      civiccore.audit.record(), civiccore.audit.export\_csv(), civiccore.audit.verify\_chain()
  LLM abstraction               backend/app/llm/client.py, backend/app/llm/context\_manager.py (ModelRegistry currently lives in backend/app/models/document.py --- moved out by F.6 precursor PR)     civiccore/llm/\*                                                        civiccore.llm.chat(), civiccore.llm.embed(), civiccore.llm.budget\_for(model)
  Document ingestion            backend/app/ingest/\*, backend/app/tasks/ingest\_\*.py                                                        civiccore/ingest/\*                                                     civiccore.ingest.register\_handler(), civiccore.ingest.ingest\_file()
  Hybrid search                 backend/app/search/\*, backend/app/models/document\_chunk.py                                                  civiccore/search/\*, civiccore/models/document\*.py                     civiccore.search.hybrid\_query(), civiccore.search.rank()
  Connector framework           backend/app/connectors/base.py, backend/app/connectors/protocol.py                                            civiccore/connectors/\*                                                 civiccore.connectors.Connector (ABC), civiccore.connectors.register()
  Notifications                 backend/app/notifications/\*, backend/app/models/notification\_template.py                                    civiccore/notifications/\*                                              civiccore.notifications.send(event, ctx), civiccore.notifications.register\_template()
  Onboarding + city profile     backend/app/onboarding/\*, frontend/src/pages/Onboarding/\*                                                   civiccore/onboarding/\*, civiccore-ui/onboarding/\*                     civiccore.onboarding.wizard\_steps, civiccore.onboarding.save\_profile()
  Municipal systems catalog     backend/app/catalog/\*, data/seeds/systems\_catalog.yaml                                                      civiccore/catalog/\*                                                    civiccore.catalog.domains(), civiccore.catalog.connectors\_for(domain)
  Exemption engine (50-state)   backend/app/exemptions/\*, data/seeds/exemption\_rules/\*.yaml                                                civiccore/exemptions/\*                                                 civiccore.exemptions.evaluate(text, jurisdiction), civiccore.exemptions.suggest\_llm()
  Sovereignty verification      scripts/verify-sovereignty.sh, scripts/verify-sovereignty.ps1, backend/tests/sovereignty/\* (combined script, both shells)                         civiccore/verification/\*, scripts/verify/\*                            civiccore.verification.run\_all()
  Admin shell (UI)              frontend/src/components/app-shell.tsx, frontend/src/components/StatusBadge.tsx (no separate frontend/src/design-tokens/ directory yet per F.4 --- tokens stay inline in shadcn primitives for civiccore-ui v0.1)   civiccore-ui/shell/\*, civiccore-ui/tokens/\*                           import { AdminShell, StatusBadge, tokens } from \'\@civicsuite/core-ui\'
  Shared tables (users, docs)   alembic/versions/\*\_users.py, alembic/versions/\*\_docs.py, alembic/versions/\*\_audit.py                    civiccore/migrations/\*                                                 civiccore.migrations.run() called by each module's migration runner
  ----------------------------- ------------------------------------------------------------------------------------------------------------- ----------------------------------------------------------------------- ------------------------------------------------------------------------------------------

**Spec-vs-reality alignment (2026-04-23):** Day-3 extraction inventory (`civicrecords-ai/docs/civiccore-extraction-inventory.md` commit `5304a47`) found that the original spec text named a few CivicRecords AI paths that did not match the shipping repo. The "Current path" column above has been updated to reflect actual filenames (LLM client/context_manager, combined sovereignty verification script, app-shell.tsx instead of AdminShell.tsx, no top-level design-tokens directory). Section 9 likewise was updated where it named directories that don't yet exist as their own modules — see Day-3 inventory Section F.5 for the records-side restructuring decision (deferred to a separate refactor PR; not bundled with extraction).

**9. What stays in CivicRecords AI**

Equally important: the things that do not move. These are
records-specific concerns that would be wrong to generalize before a
second module demands it. CivicCore v0.1 extracts only what is already
proven to be shared --- not what might be shared one day.

  ---------------------------------------------------------------------------------- -----------------------------------------------------------------------------------------------------------------------
  **Stays in CivicRecords AI**                                                       **Why**
  backend/app/requests/\*, backend/app/models/request\_workflow.py (request lifecycle, state machine, queue)                  Records-module-specific workflow. No other module has a "request" of the same shape.
  backend/app/models/request\_workflow.py (letter rendering embedded in workflow module; no top-level backend/app/letters/ or backend/app/templates/letters/ directory exists yet)                     Records-specific output format. CivicCode will have its own answer rendering; the two are not one abstraction.
  backend/app/models/fees.py, backend/app/schemas/fee\_schedule.py, backend/app/admin/router.py (fee endpoints) (no top-level backend/app/fees/ directory)                           Records-request fee rules are ORR/FOIA-specific. CivicPermit will need fees; that is a different fee schema.
  backend/app/exemptions/dashboard.py (exemption accuracy metrics for this module)   Uses CivicCore's exemption engine but renders module-specific dashboards. Stays module-side.
  Public request portal (planned)                                                    Records-specific UX. Shared resident portal shell lives in CivicCore; the portal content is module-specific.
  frontend/src/pages/Requests/\*, Exemptions/\*, Sources/\*, etc.                    Records-specific UI. Shares the AdminShell from core-ui but the pages themselves are module code.
  alembic/versions/\*\_records\_\*.py                                                Records-schema migrations stay module-side; only shared-table migrations move to core.
  Module-specific prompts (data/prompts/\*.yaml)                                     Records-specific prompt library. CivicCode, CivicZone, CivicClerk each ship their own.
  Records-specific connectors (Laserfiche records adapter, etc.)                     Any connector that only makes sense for records stays module-side. General connectors (SMB, IMAP, ODBC) move to core.
  36 test modules covering records behavior                                          Module behavior tests stay. Core tests get duplicated into CivicCore and trimmed from the records repo.
  ---------------------------------------------------------------------------------- -----------------------------------------------------------------------------------------------------------------------

**10. Database schema ownership**

The extraction splits the database into two ownership zones. Each has a
single source-of-truth migrations directory.

**10.1 CivicCore-owned tables**

-   users --- user identity, hashed passwords, MFA state, last login.

-   roles, user\_roles --- RBAC mapping. Scope strings namespace module
    claims (e.g. records.request.read).

-   departments --- org tree.

-   service\_accounts --- inter-module service identity for future
    federation.

-   audit\_log --- hash-chained append-only. Every module writes; only
    CivicCore controls schema.

-   documents, document\_chunks --- shared ingestion store. Every module
    reads. Module-specific metadata lives in a JSONB column, not a new
    table.

-   model\_registry --- model name, provider, context\_window\_size,
    embeddings dim, enabled flag.

-   connectors --- connector instances, encrypted credentials, health
    state.

-   notification\_templates, notification\_deliveries --- template CRUD,
    delivery log.

-   city\_profile --- the onboarding wizard's output. One row per
    installation.

-   exemption\_rules --- the 50-state seed data plus city overrides.

**10.2 Module-owned tables**

-   records\_requests, records\_request\_events, response\_letters,
    fee\_schedules, fee\_line\_items, waivers --- CivicRecords only.

-   Future module tables live in their own module's migrations.
    CivicClerk owns meetings, agendas, votes, etc. Modules never touch
    each other's tables directly; they use each other's APIs.

Migration ordering: CivicCore's migrations run first, then each module's
migrations. alembic's depends\_on metadata makes the dependency explicit
so a fresh install can't race.

**Part IV. Migration Strategy**

**11. The non-breaking principle**

Every phase below leaves CivicRecords AI shippable. At no point is the
records repo half-migrated or blocked on CivicCore work. Each phase is
either done and released, or not started. Partial states do not exist in
production.

**12. The six phases**

  --------------------------------------------------- ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- ----------------------------------------- ------------------------------------------------------------------------
  **Phase**                                           **Scope**                                                                                                                                                                                               **Non-breaking?**                         **Shippable as a CivicRecords release?**
  0\. Preparation                                     Create civiccore repo skeleton. Create civicsuite umbrella repo. Copy LICENSE, README, CI scaffolding. Agree on public API surface.                                                                     Yes --- no code changes                   No --- setup only
  1\. Shared models + audit chain                     Move user, role, department, audit\_log models and their migrations into CivicCore. Records imports via shim: from civiccore.models import User as \_U ; User = \_U.                                    Yes --- identical behavior                Yes --- patch release
  2\. LLM + ingestion + search                        Move LLM abstraction, document ingestion, search, and their tests. Records imports via shim. Verify end-to-end records workflow unchanged.                                                              Yes --- identical behavior                Yes --- minor release
  3\. Connectors + notifications + exemption engine   Move connector framework, notification service, exemption engine + seed data. Records-specific connectors stay module-side.                                                                             Yes --- identical behavior                Yes --- minor release
  4\. Onboarding + admin shell + verification         Move onboarding wizard, city profile, municipal systems catalog, admin shell UI components, sovereignty scripts.                                                                                        Yes --- identical behavior                Yes --- minor release
  5\. Shim removal                                    Records imports are rewritten from \`from civicrecords.models import User\` to \`from civiccore.models import User\`. Shims removed. This is the only phase that changes records code beyond imports.   Yes --- mechanical rewrite with codemod   Yes --- major release of civicrecords (import-path break for any fork)
  --------------------------------------------------- ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- ----------------------------------------- ------------------------------------------------------------------------

**13. Import shim pattern**

During phases 1--4, CivicRecords AI retains its original import paths so
any external caller --- a test, a script, a downstream integration ---
continues to work. Internally, those paths forward to CivicCore. The
shim is a 3-line file per moved symbol.

\# backend/app/models/user.py (shim file, remains during phases 1-4)

from civiccore.models.user import User, UserCreate, UserRead \# noqa:
F401

\# Re-export preserves \`from app.models.user import User\` for any
caller.

Shims carry a DeprecationWarning starting in phase 5, pointing callers
at the new import path. Removing the shims is the phase-5 work, executed
as a single codemod run (libcst or equivalent) that rewrites imports
across the records repo in one reviewable PR.

**14. Database migration strategy**

The shared tables (users, roles, audit\_log, documents,
document\_chunks, etc.) already exist in CivicRecords AI's Alembic
history. Phase 1 does not re-create them. Instead:

-   CivicCore ships its Alembic env.py but seeds its version history
    starting from the latest CivicRecords AI migration that touched a
    shared table. That migration is marked as the CivicCore baseline.

-   CivicRecords AI's Alembic env.py is modified to skip migrations that
    now live in CivicCore --- it asks CivicCore to bring shared tables
    up to date, then applies only records-specific migrations.

-   For a fresh install, the sequence is: (1) civiccore\_migrate upgrade
    head, (2) civicrecords\_migrate upgrade head. Order enforced by
    alembic's depends\_on.

-   Every module's migration runner is a thin wrapper around Alembic
    that calls CivicCore's runner first.

**15. Test strategy**

-   Phase 0: ratchet existing CivicRecords AI test suite to record the
    baseline. 36 test modules, known pass count, known coverage. This is
    the regression bar.

-   Phase 1--4: each extracted subsystem gets its own test module in
    CivicCore. Records-repo tests stay and continue to pass --- they
    become integration tests that verify the shim layer behaves
    identically.

-   Phase 5: shim-removal PR runs the codemod, then runs the full test
    suite. Any test that fails is a real bug, not a migration artifact,
    and must be fixed before merge.

-   CI gate: CivicRecords AI's CI pins a specific CivicCore version.
    Upgrading the pin is a separate PR with its own review. CivicCore
    never breaks CivicRecords AI in a background update.

**16. Versioning & compatibility**

CivicCore uses semantic versioning. Major versions are breaking; minor
and patch are not. Every module's README carries a compatibility block:

Compatibility: civiccore \>= 0.1, \< 0.2

The CivicSuite umbrella repo maintains a compatibility matrix document
--- which module versions work with which CivicCore versions --- and
runs a nightly CI job that builds every module against the current
CivicCore main to catch compatibility drift early.

**Part V. Success Criteria, Risks, and Completion Gate**

**17. Success criteria**

CivicCore v0.1 ships successfully when every one of the following is
verifiably true:

-   All 36 CivicRecords AI test modules pass on an installation using
    CivicCore under the hood, with zero regressions.

-   A fresh install from a clean database runs civiccore\_migrate
    upgrade head followed by civicrecords\_migrate upgrade head and
    produces a working records module with no errors.

-   Every public API listed in Appendix A is covered by a unit test in
    CivicCore.

-   Import shims exist for every moved symbol and are exercised by at
    least one test.

-   The sovereignty verification script, run against a
    CivicCore+CivicRecords install, reports zero outbound connections
    and zero telemetry calls.

-   A scaffold command --- civiccore scaffold-module civicclerk ---
    generates a working new-module skeleton that boots, authenticates,
    and appears in the admin shell.

-   The compatibility matrix in the CivicSuite umbrella repo is
    populated for CivicCore 0.1 and CivicRecords AI's current version.

-   The CHANGELOGs of both civiccore and civicrecords reflect the move.
    Any breaking change is explicitly flagged. No silent behavior
    changes.

**18. Risks and mitigations**

  ---------------------------------------------------------------- ---------------- ------------ ----------------------------------------------------------------------------------------------------------------------------------------------------------
  **Risk**                                                         **Likelihood**   **Impact**   **Mitigation**
  Import-path rewrite introduces a regression in CivicRecords AI   Medium           High         Phases 1--4 keep shims. Phase 5 uses a reviewable codemod + full test suite. No hand-edited import changes in the diff.
  Database migration ordering races on fresh install               Low              High         alembic depends\_on declared. CI runs a fresh-install test that mounts an empty Postgres and runs the full migration sequence.
  CivicCore API surface ossifies around records-only assumptions   Medium           Medium       v0.1 is deliberately lean. Any API change prompted by records-only needs requires a second module's maintainer review before merge.
  Circular imports between modules and CivicCore                   Medium           Medium       CivicCore never imports from modules. One-way dependency. Enforced by a CI lint rule that greps for module names inside CivicCore.
  Shared table schema change breaks an already-deployed module     Low              High         Shared-table changes are major CivicCore releases. Minor/patch releases never alter shared schema.
  License confusion (MIT vs. CC BY vs. CC BY-SA)                   Low              Low          LICENSE file in every repo: AGPL-3.0-only for code, CC BY 4.0 for docs (LICENSE-DOCS or LICENSE in docs-only repos).
  Contributor confusion about where to file a bug                  Medium           Low          Each repo's CONTRIBUTING.md has a "where does this bug go" decision tree. CivicSuite umbrella repo redirects issues to the right module.
  Shim layer leaks into long-term technical debt                   Medium           Low          Phase 5 is scheduled at the time phase 1 ships. Shims have a documented sunset date, not a vague "someday."
  ---------------------------------------------------------------- ---------------- ------------ ----------------------------------------------------------------------------------------------------------------------------------------------------------

**19. Completion gate**

Per the suite's shipping standard, CivicCore v0.1 is not done when the
code compiles and the tests pass. It is done when all four passes
complete and the verification log is written.

-   Pass 1 --- Engineering Review: every moved subsystem re-reviewed
    against its original implementation; no silent behavior changes.

-   Pass 2 --- Visual Walkthrough: the CivicRecords AI admin shell
    walked through every page, every state, desktop and mobile viewport.
    No regressions introduced. No new console errors or warnings.

-   Pass 3 --- Adversarial QA: shim layer tested with a deliberately
    malformed call path; fresh-install tested against an empty Postgres;
    two CivicCore point releases simulated to verify no regression
    creeps in.

-   Pass 4 --- Documentation & Handoff: CHANGELOGs written in both
    repos; compatibility matrix updated; breaking changes flagged (there
    are none at v0.1); CivicSuite README updated to reflect the new
    topology.

**Appendices**

**A. Public API surface (CivicCore v0.1)**

The lean starting surface. Everything listed here is stable for the v0.x
series. Additions require a minor release; removals or signature changes
require a major release.

\# Auth

from civiccore.auth import require\_role, current\_user, create\_user,
verify\_password

from civiccore.models import User, Role, Department, ServiceAccount

\# Audit

from civiccore.audit import record, export\_csv, export\_json,
verify\_chain

\# LLM

from civiccore.llm import chat, embed, budget\_for, ModelRegistry

\# Ingestion + search

from civiccore.ingest import register\_handler, ingest\_file,
ingest\_bytes

from civiccore.search import hybrid\_query, rank, reindex

\# Connectors

from civiccore.connectors import Connector, register,
connectors\_for\_domain

\# Notifications

from civiccore.notifications import send, register\_template,
templates\_for

\# Onboarding + catalog

from civiccore.onboarding import wizard\_steps, save\_profile,
load\_profile

from civiccore.catalog import domains, connectors\_for, system\_catalog

\# Exemptions

from civiccore.exemptions import evaluate, suggest\_llm, load\_rules

\# Verification

from civiccore.verification import run\_all, verify\_no\_egress,
verify\_no\_telemetry

**B. Directory layout (civiccore repo)**

civiccore/

├── civiccore/

│ ├── \_\_init\_\_.py

│ ├── auth/

│ ├── audit/

│ ├── llm/

│ ├── ingest/

│ ├── search/

│ ├── connectors/

│ ├── notifications/

│ ├── onboarding/

│ ├── catalog/

│ ├── exemptions/

│ ├── verification/

│ ├── models/

│ ├── migrations/ \# Alembic env + versions for shared tables

│ └── scaffold/ \# \`civiccore scaffold-module\` generator

├── civiccore-ui/ \# separate npm package; shell, tokens, status badge

│ ├── shell/

│ ├── tokens/

│ └── components/

├── tests/

├── scripts/verify/

├── pyproject.toml

├── CHANGELOG.md

├── CONTRIBUTING.md

├── LICENSE \# AGPL-3.0

└── README.md

**C. Directory layout (civicsuite umbrella repo)**

civicsuite/

├── README.md \# one-page pitch, module links

├── docs/

│ ├── catalog/ \# rendered module catalog

│ ├── principles/ \# suite-wide non-negotiables

│ ├── architecture/ \# cross-module ADRs

│ ├── roadmap/ \# phased rollout, dependency graph

│ ├── governance/ \# contribution, security, licensing

│ └── compatibility/ \# civiccore \<-\> module compatibility matrix

├── CHANGELOG.md \# suite-wide milestones

├── LICENSE \# CC BY 4.0 for docs

└── LICENSE-CODE \# AGPL-3.0, covers any example snippets in docs/

**D. Licensing clarifications**

-   Code (every civicsuite/\* repo): AGPL-3.0-only (SPDX: AGPL-3.0-only), with the TownLight Public Institution Exception for qualifying deployments. Use the official text from https://www.gnu.org/licenses/agpl-3.0.txt unmodified. Project standardized on Apache 2.0 on 2026-04-23 to align with civicrecords-ai, then moved to AGPL-3.0-only on 2026-10-20.

-   Documentation: CC BY 4.0 --- cities and vendors can fork, adapt,
    rebrand. Attribution required.

-   Prompts (optional separate repo, civicsuite-prompts): CC BY-SA 4.0
    so downstream forks stay open. Same pattern as PatentForge.

-   Third-party dependencies: permissive or weak-copyleft only. AGPL and
    GPL-3.0 blocked at the dependency manager level.

-   Redis: stays pinned \<8.0 (BSD) per the v3.0 spec. Do not upgrade
    into the SSPL-licensed releases.

**E. Verification log (to be completed when v0.1 ships)**

This is the template every CivicCore release fills out. v0.1 is not done
until the log is complete.

\#\# Verification Log --- CivicCore v0.1

\#\#\# What Was Changed

Extracted shared infrastructure from CivicRecords AI into a new
civiccore package.

Created civicsuite umbrella repo. No product behavior changes.

\#\#\# Data Provenance Check

\[ \] Shared tables (users, audit\_log, documents, etc.) confirmed
readable from

CivicCore. Records module reads unchanged. Audit chain verified.

\#\#\# States Verified

\[ \] Fresh install (empty Postgres)

\[ \] Upgrade install (existing records DB)

\[ \] Records workflow end-to-end, unchanged

\[ \] Admin shell loads, all pages render

\[ \] LLM chat + embed calls unchanged

\[ \] Sovereignty verification: zero outbound connections

\#\#\# Visual Check

\[ \] No UI regressions at desktop or mobile viewport

\[ \] Console: zero errors, zero unexpected warnings

\#\#\# Import-Path Check

\[ \] Every shim exercised by at least one test

\[ \] Phase-5 codemod dry-run produces expected diff

\#\#\# Regression Check

\[ \] Full CivicRecords AI test suite green (baseline pass count)

\[ \] Coverage not reduced

\#\#\# Documentation

\[ \] CHANGELOG in civiccore

\[ \] CHANGELOG in civicrecords-ai

\[ \] Compatibility matrix populated in civicsuite

\[ \] README updated in all three repos

\#\#\# Sign-off

All four passes complete. No known open issues.
