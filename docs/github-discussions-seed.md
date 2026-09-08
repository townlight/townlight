# GitHub Discussions — Seed Posts

This file contains the seed content for enabling GitHub Discussions on the `civicsuite` umbrella repo. Each section corresponds to one discussion category. Posts should be created (manually or via `gh api`) by a maintainer with their own voice; the text below is a starting point.

> **Note:** GitHub Discussions must be enabled at the repo level (Settings → General → Features → Discussions) before any of these posts can be created. The umbrella does NOT use a `.github/DISCUSSIONS_SEEDED` marker file.

---

## Categories to enable

- **Announcements** (announcement type) — release notes, milestones, status updates
- **Roadmap** (open-ended) — module sequencing, prioritization, suggestions
- **Architecture** (open-ended) — civiccore design questions, dependency policy, ADR discussion
- **Governance** (open-ended) — contribution policy, repo standards, transfer plans
- **Compatibility** (open-ended) — matrix updates, paired-release coordination

(Q&A and Show-and-Tell are reserved for module repos, where they fit better — most "I tried this and..." posts will be about a specific module, not the umbrella.)

---

## Announcements — Welcome and current suite status (PIN this)

**Title:** CivicSuite — current status (May 2026)

**Body:**

Welcome to the CivicSuite community space. This post is a snapshot of where the suite stands right now. We'll update it (or pin a new one) when major status changes.

**Shipping today:**

- `civiccore` v1.2.0 - the shared platform package for the active city-core profile. Repo: <https://github.com/townlight/core>.
- `civicrecords-ai` v1.7.3 - open-source FOIA / public records management. Repo: <https://github.com/townlight/sunshine>.
- `civicclerk` v1.0.4 - meetings, agendas, packets, minutes, notices, votes, and public meeting records. Repo: <https://github.com/townlight/meetings>.
- `civiccode` v1.0.8 - municipal code search, cited Q&A, and Clerk ordinance handoff support. Repo: <https://github.com/townlight/ordinances>.

**Planned or queued:**

- The city-core profile is active but still beta-ready pending Linux/Windows one-click lifecycle and integration proof. CivicAccess v0.4.0 is now the sixth city-core module (ships in the next MSI build); Tier 2 modules remain queued.

**What's this umbrella for?**

This `civicsuite` repo is documentation-only. It holds the charter, the spec library, ADRs, the roadmap, governance, and the [civiccore↔module compatibility matrix](../docs/compatibility/index.md). No runtime code. Every module lives in its own repo.

**Where to get help / ask questions:** see [SUPPORT.md](../SUPPORT.md).

**How to contribute docs:** see [CONTRIBUTING.md](../CONTRIBUTING.md).

We're glad you're here.

---

## Roadmap — What gets built next, and why

**Title:** Module sequence - what happens after city-core installability?

**Body:**

The reconciled catalog lists 27 product modules across 7 tiers, plus CivicCore as the shared platform. We are not going to build them in order, and we are not going to build them all at once. The active city-core target focuses on CivicCore, CivicRecords AI, CivicClerk, CivicCode, and the suite installer; later modules stay queued until that package closes with real evidence.

**Two leading candidates:**

1. **civicclerk** (Tier 1) — meetings, agendas, packets, minutes, voting, sunshine-law compliance. The spec is drafted. This is the highest-leverage second module because most municipal staff time outside the records office is spent on the meeting cycle.
2. **civiczone** (Tier 2) — zoning code and parcel-aware planner workflows. Spec drafted. The technical case for this module is that it's a clean test of the "downstream module inherits civiccore" pattern with a different shape than records-ai.

**Question for the community:**

Which of these would matter most to your city if it shipped in the next 6–12 months? Are there other Tier 1 modules from the catalog you'd rank above them?

We'll use this thread to gather signal before locking the next-module decision.

---

## Architecture — How is civiccore designed, and why is it not a monorepo?

**Title:** Why CivicSuite is a multi-repo, not a monorepo

**Body:**

This question comes up often enough that we want a single canonical thread for it.

**Short version:** Cities install one module at a time. A monorepo would imply a single release artifact, which would break the "install only what you need" promise. Each module having its own repo lets module maintainers ship on their own cadence and lets cities pin a specific module version without dragging unrelated changes along.

The full reasoning is in the [civiccore extraction spec](../specs/02_CivicCore.md) section 5.2.

**The dependency rule:** Modules depend on civiccore. Civiccore never depends on a module. This is the core architectural constraint and is enforced in CI in the civiccore repo.

If you're considering contributing a new module or are evaluating the architecture for your own civic-tech project, this is the design tradeoff to understand first. Comments and pushback welcome.

---

## Governance — Open-source posture and the records-ai org transfer

**Title:** Plan to transfer civicrecords-ai to the CivicSuite GitHub org

**Body:**

A status note on a piece of governance some readers may have noticed:

`civicrecords-ai` currently lives at `github.com/townlight/sunshine`. The intent is to transfer the repo to the `CivicSuite` org so all modules live under the same umbrella. This is intentionally not yet done — we want the suite-wide documentation, governance, and contribution standards to settle first so the transfer is a clean handoff rather than a scramble.

Until the transfer happens, every link to records-ai in our docs uses `CivicSuite/civicrecords-ai`. After the transfer, links will be updated and old links will redirect via GitHub's automatic forwarding.

**No action needed from contributors.** Existing forks and PRs continue to work normally during and after the transfer. We'll announce the transfer with a heads-up post here when the date is set.

---

## Compatibility — How the matrix works and how to read it

**Title:** Reading the civiccore↔module compatibility matrix

**Body:**

The compatibility matrix lives at [docs/compatibility/index.md](../docs/compatibility/index.md). It is the suite's release-pairing truth-source.

**How to read a row:**

```
| civicrecords-ai | 1.6.1 | see matrix | see matrix | Records workflow compatibility ... |
```

Translation: civicrecords-ai version 1.6.1, released after the records 1.6 line, requires the pinned civiccore version recorded in the compatibility matrix. If you install records-ai with a different civiccore version than the matrix permits, behavior is undefined.

**When does the matrix get updated?**

- Every time a module ships a new version that changes its civiccore pin.
- Every time civiccore ships a new MINOR or MAJOR (PATCH releases of civiccore are pin-compatible by definition).

**When does the matrix get audited?**

Before every umbrella push. The verify-docs script checks that the matrix has no stale current-facing strings.

If you spot a mismatch between the matrix and a module's actual `pyproject.toml` pin, that's a real bug — please file a documentation issue here.
