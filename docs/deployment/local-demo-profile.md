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
- Local sibling clones at:
  - `../civicrecords-ai`
  - `../civicclerk`
  - `../civiccode`
  - `../civiczone`
- Townlight Records `.env` file in `../civicrecords-ai/.env`.
- Internet access during first image/wheel download.
- Optional: Ollama model already pulled if testing LLM-backed behavior.

## Start The Demo Stack

From the umbrella repo:

```bash
docker compose -f deploy/post-foundation-demo.compose.yml up --build
```

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
- Published module wheel URLs are pinned to the compatibility matrix versions.
- Published module wheel metadata requires the same Townlight Core wheel pinned in the compose file.
- Local in-process smoke checks use the current sibling-clone `civiccore` checkout and therefore verify local import compatibility, not only the compose wheel pins.
- Module services set `CIVICCORE_LLM_PROVIDER=ollama`.
- No cloud LLM provider is configured by default.
- Local no-network smoke checks can import Townlight Meetings, Townlight Code, and Townlight Zoning and call their `/health` endpoints in process.

The `--static-only` mode is for CI and skips the Docker Compose config execution plus the local sibling-clone `/health` imports. It still verifies compose shape, wheel pins, local-first LLM defaults, and this guide.

## No-Network Meaning

The default local deployment profile must not require outbound runtime calls for core behavior. In this profile:

- Townlight Meetings, Townlight Code, and Townlight Zoning expose deterministic foundation APIs that can be smoke-tested in process without network calls.
- Townlight Records uses local PostgreSQL, Redis, and optional Ollama.
- Cloud LLM providers are not configured by default.
- The compose profile may need internet access to download images or release wheels before the stack is cached locally.

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
- `http://localhost:8020/civiccode`
- `http://localhost:8030/civiczone`

### Production Pilot Install

Do not treat this compose file as production pilot packaging. A production pilot needs:

- Managed secrets.
- TLS/reverse proxy.
- Backup/restore.
- Role and user administration.
- Monitoring/log retention.
- Module-specific records retention rules.
- Written city approval for any external provider integration.
