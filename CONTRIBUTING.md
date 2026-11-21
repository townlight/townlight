<a id="contributing-to-townlight"></a>

# Contributing to Townlight

This repository contains the Windows desktop app, installer, local runtime integration,
and suite-wide documentation. Component repositories are listed in the
[product source directory](https://github.com/townlight#townlight).

## Where to file your bug

Use this decision tree before opening an issue. Filing in the wrong repo is
the most common contributor friction.

- **Shared platform bug** (auth, RBAC, audit chain, LLM abstraction, document
  ingestion, hybrid search, connector framework, notifications, onboarding,
  city profile, exemption engine, sovereignty verification) -> file at
  `townlight/core`.
- **Records-module bug** (request lifecycle, response letters, fee schedules,
  exemption dashboard, public request portal) -> file at
  `townlight/sunshine` (the records repo now lives in the Townlight org; the canonical home is `townlight/sunshine`).
- **Townlight Meetings / Townlight Code / Townlight Zoning bug** -> file at the matching module
  repo: [Meetings](https://github.com/townlight/meetings), [Code](https://github.com/townlight/ordinances), or [Zoning](https://github.com/townlight/zone).
- **Cross-module strategy or roadmap question, docs typo, ADR proposal, suite
  governance question** -> file here.
- **Security vulnerability in any repo** -> open a private GitHub Security
  Advisory on that repo. Do not file as a public issue.

## How to propose a documentation change

1. Fork this repo or create a topic branch.
2. Edit the markdown in `docs/` or one of the canonical files at the top
   level (CHARTER.md, CONSISTENCY.md, the spec files in `specs/`).
3. Open a pull request. CONSISTENCY.md is the audit table for every count
   and cross-reference in the docs; if your change touches a count, version,
   or named fact, update CONSISTENCY.md in the same PR.
4. Sign off your commits.

## Discussions vs issues

- **Issues:** concrete bugs, doc errors, broken links, missing required
  artifacts.
- **Discussions:** roadmap questions, "should we build X", spec critiques,
  module-suggestion conversations.

## Attribution

Current first-party documentation is licensed under [AGPL-3.0-only](LICENSE-DOCS). Historical grants and third-party notices continue to apply to their respective materials.

## Code of conduct

Be kind. Critique ideas, not people. Assume good faith. Maintainers may
remove abusive content without warning.
