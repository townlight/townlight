# Local Demo Deployment Profile

Status: evaluation profile, not production packaging
Stack target: Townlight Records + Townlight Meetings + Townlight Code + Townlight Zoning
Default network posture: local-first, no cloud LLM requirement

## What This Profile Is

This profile gives a city evaluator or developer one bounded way to run the first post-foundation stack:

- Townlight Records for records intake/search workflows.
- Townlight Meetings for agenda, meeting, packet, notice, vote, minutes, archive, and staff workflow foundations.
- Townlight Code for municipal-code lookup, citations, plain-language summaries, and clerk handoff foundations.
- Townlight Zoning for parcel/zoning lookup, rule prechecks, cited sample Q&A, and planner escalation foundations.
- PostgreSQL 17 with pgvector for Townlight Records.
- Redis 7.2 for Townlight Records background-work dependencies.
- Optional Ollama for local LLM experiments.

It intentionally does not claim production deployment readiness. Production pilot packaging still needs environment hardening, secrets handling, backup/restore guidance, reverse proxy guidance, TLS, auth/RBAC policy, and operator runbooks.

## Files

- Compose profile: `deploy/post-foundation-demo.compose.yml`
- Verifier: `scripts/verify-deployment-profile.py`
- This operator guide: `docs/deployment/local-demo-profile.md`

## Ports

| Service | URL | Purpose |
|---|---|---|
| Townlight Records frontend | `http://localhost:8080` | Records AI browser UI |
| Townlight Records API | `http://localhost:8000/health` | Records AI API health |
| Townlight Meetings | `http://localhost:8010/health` | Townlight Meetings module API health |
| Townlight Code | `http://localhost:8020/health` | Townlight Code module API health |
| Townlight Zoning | `http://localhost:8030/health` | Townlight Zoning module API health |

## Prerequisites

- Docker Desktop with Compose v2.
- Local sibling clones at `../sunshine`, `../core`, `../meetings`,
  `../ordinances` and `../zone`, using the candidate's exact source pins.
- Townlight Records `.env` file in `../sunshine/.env`, configured for this
  isolated evaluation database and Redis service. Preserve existing city data.
- Python 3.11 or newer with `build`, `packaging` and `pyyaml` for wheel preparation.
- Internet access during source, build-dependency, third-party package and image download.
- Optional: Ollama model already pulled if testing LLM-backed behavior.

## Start The Demo Stack

From the umbrella repo:

```bash
python -m pip install "build>=1.2,<2" "packaging>=24,<27" pyyaml
python scripts/demo_wheels.py
python scripts/verify-deployment-profile.py --static-only
docker compose -f deploy/post-foundation-demo.compose.yml up --build
```

The builder fetches the four exact commits in `config/suite-state.json`, checks
their distribution/version metadata and builds local Core, Meetings, Code and
Zoning wheels. It records each wheel's SHA256 and source identity in
`.candidate-wheels/demo-wheels.json`. Compose mounts that directory read-only;
it never constructs renamed URLs for old release artifacts. Records builds from
its owning sibling checkout and its own pinned Core bootstrap.

To build from existing clean sibling clones instead of fetching sources, use
`python scripts/demo_wheels.py --workspace ..`. The clones must match the
canonical pins. During implementation only, `--allow-working-tree` on both the
builder and verifier permits explicitly identified preparation artifacts; that
mode is not clean-pin, release or installed acceptance evidence. The default
verifier rejects those artifacts. Final source pins and publication are pending
for this coordinated candidate.

If moving the staged wheels, pass `--wheel-dir /absolute/path` to the verifier
and set `TOWNLIGHT_DEMO_WHEELS` to that same absolute directory for Compose.

To include the Ollama container:

```bash
docker compose -f deploy/post-foundation-demo.compose.yml --profile llm up --build
```

## Verify The Profile

Static/profile verification:

```bash
python scripts/verify-deployment-profile.py
```

CI/static-only verification:

```bash
python scripts/verify-deployment-profile.py --static-only
```

This checks that:

- The compose file exists and parses through Docker Compose in full local mode.
- The expected services are present.
- Actual local wheel bytes match their provenance receipt and the canonical clean source pins.
- Module wheel metadata requires the exact same Townlight Core version installed by Compose.
- The distributions, versions and principal imports in those wheels match the candidate manifest.
- Local in-process smoke checks use the owning sibling repositories (`core`, `meetings`, `ordinances`, `zone`) and verify source import compatibility separately from wheel metadata.
- Module services set `TOWNLIGHT_CORE_LLM_PROVIDER=ollama`.
- No cloud LLM provider is configured by default.
- Local no-network smoke checks can import Townlight Meetings, Townlight Code, and Townlight Zoning and call their `/health` endpoints in process.

The `--static-only` mode is for CI and skips Docker Compose execution and local
sibling-clone `/health` imports. It still inspects the staged wheel metadata,
hashes and source receipt, compose shape, local-first LLM defaults and this guide.
Missing or mismatched artifacts fail verification. Neither static verification
nor an in-process health response establishes installed Windows behavior.

## No-Network Meaning

The default local deployment profile must not require outbound runtime calls for core behavior. In this profile:

- Townlight Meetings, Townlight Code, and Townlight Zoning expose deterministic foundation APIs that can be smoke-tested in process without network calls.
- Townlight Records uses local PostgreSQL, Redis, and optional Ollama.
- Cloud LLM providers are not configured by default.
- Preparation may need internet access to fetch exact source commits, build dependencies,
  third-party packages and images before the stack is cached locally.

## Operator Modes

### Developer Install

Use this when changing code or validating compatibility. Run local repo test gates and the suite verifier:

```bash
python scripts/verify-suite-state.py
python scripts/verify-deployment-profile.py
```

### Clerk/Staff Evaluation Install

Use this when a city staff evaluator wants to click through the current foundation surfaces:

```bash
docker compose -f deploy/post-foundation-demo.compose.yml up --build
```

Then open:

- `http://localhost:8080`
- `http://localhost:8010/staff`
- `http://localhost:8020/townlight_code`
- `http://localhost:8030/townlight_zoning`

### Production Pilot Install

Do not treat this compose file as production pilot packaging. A production pilot needs:

- Managed secrets.
- TLS/reverse proxy.
- Backup/restore.
- Role and user administration.
- Monitoring/log retention.
- Module-specific records retention rules.
- Written city approval for any external provider integration.
