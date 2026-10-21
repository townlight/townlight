# New Module Checklist

Use this checklist before creating or promoting any new Townlight module repo. The goal is boring consistency: a new module should enter the org with the same release truth, docs, installer, and verification surfaces as the existing suite.

## 1. Authority Read

- Read `docs/CivicSuiteUnifiedSpec.md` and the module's spec section.
- Confirm the module tier in `ARCHITECTURE.md` and `CONSISTENCY.md`.
- Confirm whether the work is a new module, a planned spec-only module becoming real, or a replacement for an existing repo.
- Do not use old chat, old release labels, or stale queue files as authority when they conflict with the spec or release-recovery docs.

## 2. Repository Skeleton

Create the repo under the `CivicSuite` GitHub org with these baseline paths:

- `pyproject.toml`
- `README.md`
- `README.txt`
- `CHANGELOG.md`
- `CONTRIBUTING.md`
- `SECURITY.md`
- `SUPPORT.md`
- `LICENSE`
- `LICENSE-CODE`
- `LICENSE-DOCS`
- `.gitignore`
- `AGENTS.md`
- `src/<module_name>/`
- `tests/`
- `docs/index.html`
- `.github/workflows/verify.yml`
- `.github/workflows/release.yml`
- `.github/PULL_REQUEST_TEMPLATE.md`
- `.github/ISSUE_TEMPLATE/`

Use `docs/templates/module-scaffold/` as the starting shape, then replace placeholders before the first commit.

<a id="3-civiccore-dependency"></a>

## 3. Townlight Core Dependency

- Pin Townlight Core through the current released wheel URL and sha256 when the module is part of a release train.
- Do not use unreleased archive URLs except as explicitly documented audit evidence.
- Do not duplicate Townlight Core-owned document ingestion, embeddings, or shared vector storage. Modules may keep domain-specific ranking, structuring, and query logic on top of `civiccore.ingest`.

## 4. Release Truth

- Start below `v1.0.0` unless the module has already passed the full public-use Definition of Done and independent audit.
- Every version surface must agree: `pyproject.toml`, README, CHANGELOG, user manual, docs landing page, GitHub release, `installer/modules.json`, compatibility matrix, and suite verifier.
- Never tag a pre-release implementation commit. Use a fresh release commit that only updates release truth surfaces, then tag that commit.
- Publish the same trust surface as comparable modules: wheel, sdist, SHA256SUMS, and attestation/provenance assets when the repo convention includes them.
- Keep `.github/workflows/release.yml` release-blocking: tag releases must create a draft release, run `cleanroom-rehearsal` against the uploaded draft wheel, and publish only after the cleanroom job passes.
- Release notes must include the cleanroom annotation with real values, not blank substitutions: `Cleanroom rehearsal: PASSED in workflow run <run-id>` and `Verified clean install of <wheel-url> from cold caches at <timestamp>`.
- Before the first public release, run a synthetic `v0.0.1` workflow rehearsal and confirm the release notes show the real repository, tag, wheel URL, workflow run id, and timestamp.

## 5. Installer Registration

Update the umbrella repo in the same release train or a dedicated suite-truth PR:

- `installer/modules.json`
- `docs/compatibility/index.md`
- `docs/release-lockstep/downstream-pins.md`
- `STATUS.md`
- `CHANGELOG.md`
- `CONSISTENCY.md`
- `ARCHITECTURE.md`
- `docs/CivicSuiteUnifiedSpec.md` shipped-state notes, if any

The module is not `v1.0.0` if it is not installable or selectable through the appropriate Townlight installer path.

## 6. Documentation

Docs are part of the product, not ceremony. Before push, update:

- README and plain-text README
- CHANGELOG
- user manual
- security and support docs
- docs landing page
- GitHub discussion seed, if the repo has one
- operator install and troubleshooting notes

User-facing warnings and errors must say what happened and what the operator should do next.

## 7. Verification

Minimum checks before a module PR:

- Unit and integration tests
- Lint/static checks
- `scripts/verify-release.sh`, if present
- `cleanroom-rehearsal` workflow_dispatch against the current published wheel, or a synthetic `v0.0.1` draft release for new modules before publication.
- Browser QA for every user-facing surface at desktop and mobile widths
- Loading, success, empty, error, and partial/degraded states
- Browser console check
- Keyboard/focus/accessibility check
- Adversarial probes for bad input, missing/stale data, spoofed roles, unavailable dependencies, and public/staff boundary failures

Release workflow checks:

- Use runner-temp caches such as `${RUNNER_TEMP}/.npm` or `${RUNNER_TEMP}/.cache/pip`; do not wipe user-home caches on shared runners.
- Use label-scoped Docker cleanup only: `civicsuite-cleanroom=1`. Never use unscoped Docker prune commands on shared hosts.
- Include an always-run cleanup step that tears down the run-specific compose project and removes only labeled cleanroom containers/networks.
- Add a per-repo cleanroom concurrency mutex: `scott-desktop-cleanroom-${{ github.repository }}`.
- Frontend modules must add cold `npm ci --prefer-online --no-cache --no-audit --no-fund` plus build/typecheck steps to the cleanroom job.
- If your module has a frontend, add `--cache "${RUNNER_TEMP}/.npm"` to the `npm ci` step in the cleanroom-rehearsal job in `release.yml`. The backend-only scaffold template ships without it; frontend modules must add it or risk cache leakage across runs on shared hosts.
- Modules that publish Docker images must build with `--no-cache --pull` and label cleanroom artifacts for scoped cleanup.

Minimum checks before a suite-truth PR:

- `python scripts/verify-suite-state.py --remote-only`
- `python scripts/verify-installer-plan.py`
- `bash scripts/verify-docs.sh`
- `git diff --check`

## 8. Independent Audit

A module earns `v1.0.0` only after an independent audit of the actual code and installed behavior returns zero Blocker, zero Critical, and every Major is fixed or explicitly owner-accepted in writing.

Passing CI, passing release scripts, screenshots, and self-authored audit packets are claims. They help, but they do not replace independent audit.
