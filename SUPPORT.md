# Getting Support

## Records + Meetings + Code + Zoning 1.4.0-beta.1 public beta

Published October 21, 2026. Four connected Townlight products run locally through
bundled Python services and PostgreSQL, with Core, Notice and Access supporting
them. This is a bounded Windows public beta, not general availability or completion
of the full municipal suite.

[Download the signed Windows installer](https://github.com/townlight/townlight/releases/tag/townlight-records-meetings-code-zoning-v1.4.0-beta.1) ·
[Signed acceptance and limits](docs/installer/townlight-zoning-beta1-signed-acceptance.md) · [User manual](USER-MANUAL.md)

Records-only remains the installation default. Explicitly select **zoning-beta**
for Records, Meetings, Code and Zoning. Existing saved selections are preserved;
**city-core** continues to select Records, Meetings and Code without Zoning.
Planning, Permitting and Inspections are not enabled by zoning-beta.

Zoning imports staff-supplied EPSG:4326 GeoJSON bundles using PostgreSQL
17.10/PostGIS 3.6.2. Cited rules, human corrections, permitted Meetings history and
explicitly public immutable Zoning snapshots connect to Records with source
history and hashes preserved. Private notes remain protected. Answers are
informational, not zoning determinations, permit approvals or legal advice.

The exact signed MSI and embedded EXE passed independent signature/hash checks,
fresh installed workflows, populated signed 1.3 upgrade, backup/restore and
retained-data uninstall. Optional local AI is not required for these deterministic
workflows. Human response approval and final export remain separate from attaching
a source; no automatic public publication is introduced.

## Current issue routes

- Records: [townlight/sunshine](https://github.com/townlight/sunshine/issues).
- Meetings: [townlight/meetings](https://github.com/townlight/meetings/issues).
- Code: [townlight/ordinances](https://github.com/townlight/ordinances/issues).
- Zoning: [townlight/zone](https://github.com/townlight/zone/issues).
- Installer or cross-product work: [townlight/townlight](https://github.com/townlight/townlight/issues).

Include installed version, selected profile, reproduction steps and redacted error
evidence. Never attach resident data, passwords, tokens or unredacted backups.
For vulnerabilities, follow [SECURITY.md](SECURITY.md), not a public issue.

## Historical suite support routing

The `civicsuite` umbrella repo is for **suite-wide** orientation, governance, roadmap, ADRs, and the compatibility matrix. Most support questions belong on a specific module's repo. Please use the table below to route your question to the right place.

## Where to ask

| Audience | What you're asking about | Where to go |
|---|---|---|
| **Municipal evaluators** | "Is Townlight right for my city?" "What does it actually do today?" "How is it licensed?" | Start with the [README](README.md) and the [USER-MANUAL](USER-MANUAL.md). Open a Discussion under **Announcements** or **Roadmap** if you have follow-up questions. |
| **Municipal evaluators** | "Can I see a working module?" "Can I try the beta?" | The current beta is the **Windows Local city-core** desktop package (Townlight Core + Townlight Records + Townlight Meetings + Townlight Code + Townlight Notice + Townlight Access). Follow [docs/installer/operator-walkthrough.md](docs/installer/operator-walkthrough.md) and get the MSI from the [civicsuite-windows-local-v1.0.2 release](https://github.com/townlight/townlight/releases/tag/civicsuite-windows-local-v1.0.2). To browse one module's source, `civicrecords-ai` lives at <https://github.com/townlight/sunshine>. |
| **Module developers** | "How do I integrate civiccore?" "How do auth/RBAC/audit work?" | File at `townlight/core`. The civiccore repo's `README.md`, `USER-MANUAL.md`, and `docs/` are the canonical reference. |
| **Module developers** | "Bug in records-ai" | File at `townlight/sunshine` (now transferred). |
| **Module developers** | "Cross-module question — how should two modules interact?" | Open a Discussion here under **Architecture**. |
| **Contributors** | "How do I contribute documentation here?" | See [CONTRIBUTING.md](CONTRIBUTING.md). |
| **Contributors** | "Is there a module-suggestion process?" | Open a Discussion under **Roadmap** with module name, problem it solves, and rough scope. |
| **Anyone** | "Security vulnerability" | See [SECURITY.md](SECURITY.md). Route to the affected module's repo, or to this repo if it is suite-wide. |

## Decision tree (TL;DR)

1. **Is this a bug in running code?** → File on the module repo whose code is broken.
2. **Is this a question about how a module works?** → Read that module's docs, then open a Discussion on that module's repo.
3. **Is this a cross-module / suite-wide / governance / roadmap question?** → Open a Discussion here.
4. **Is this a security issue?** → Private GitHub Security Advisory on the affected repo (see [SECURITY.md](SECURITY.md)).

## Response expectations

This is an open-source, volunteer-maintained project. We aim to triage Discussions within a week and issues within two weeks. Security reports get faster acknowledgment (see [SECURITY.md](SECURITY.md)). There is no paid support contract today.
