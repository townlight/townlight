# Security Policy

The `civicsuite` repository is the umbrella/orientation repo for the CivicSuite product family. It does not contain runtime code. Security vulnerabilities in **runtime code** belong on the affected module's repo, not here.

## Reporting a vulnerability

### Module-specific vulnerabilities

If you found a vulnerability in a specific module's code, deployment, or runtime behavior, please report it on that module's repo:

- **civicrecords-ai** (FOIA / public records management) — open a private GitHub Security Advisory at <https://github.com/townlight/sunshine/security/advisories/new>
- **civiccore** (shared platform package) — open a private GitHub Security Advisory at <https://github.com/townlight/core/security/advisories/new>

### Suite-wide vulnerabilities

This umbrella accepts reports for issues that affect the **suite as a whole** — for example:

- A flaw in the documented architecture that affects every module
- A governance, signing, or release-process flaw that could compromise multiple repos
- A documented protocol or contract between modules that has a security implication

For these, open a private GitHub Security Advisory on this repo at <https://github.com/townlight/townlight/security/advisories/new>.

## What to include

- Affected module(s) and version(s)
- Description of the vulnerability
- Reproduction steps
- Impact assessment (confidentiality, integrity, availability)
- Suggested remediation if you have one

## Response expectations

We aim to acknowledge security reports within 5 business days. Coordinated disclosure timelines are negotiated case-by-case based on severity and complexity. Reporters who follow responsible disclosure are credited in release notes unless they prefer to remain anonymous.

## Scope

In scope:

- Suite-wide architectural or governance flaws
- Module-specific issues (route to the module repo)

Out of scope:

- Issues in third-party dependencies (report upstream; we will pin/patch when fixes are available)
- Theoretical attacks without a demonstrated impact
- Issues in deployments or forks not maintained by CivicSuite contributors
