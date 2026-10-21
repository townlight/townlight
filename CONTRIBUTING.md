<a id="contributing-to-civicsuite"></a>

# Contributing to Townlight

The civicsuite umbrella repo holds suite-wide documentation, design principles,
cross-module ADRs, the roadmap, governance, and the Townlight Core <-> module
compatibility matrix. It does not hold code.

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
  repo. If the module repo doesn't exist yet, file in this umbrella with the
  `module:<name>` label.
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

Documentation in this repo is licensed under CC BY 4.0. If you adapt or
republish any of it, attribute "CivicSuite contributors" and link back to
this repository.

## Code of conduct

Be kind. Critique ideas, not people. Assume good faith. Maintainers may
remove abusive content without warning.
