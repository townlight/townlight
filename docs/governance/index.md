# Governance

## Continuity

Continuity is now an explicit suite gate, not a deferred governance aspiration.

- Continuity plan: [`../../SUCCESSION.md`](../../SUCCESSION.md)
- Charter: [`../../CHARTER.md`](../../CHARTER.md)
- Roadmap: [`../roadmap/index.md`](../roadmap/index.md)

As of 2026-04-29, the `CivicSuite` GitHub org has two active owners: `scottconverse` and `APirateMonk`. The continuity gate is therefore no longer blocked on single-owner concentration; the current on-repo continuity baseline is documented in [`../../SUCCESSION.md`](../../SUCCESSION.md).

## Maintainership

Scott Converse is the founding maintainer of the `civicsuite` umbrella, `civiccore`, and `civicrecords-ai` repositories. `APirateMonk` is now the documented continuity backup owner at the organization level while the suite is still in its early governance posture.

Community contributions are welcomed via pull request to any repository. See [`../../CONTRIBUTING.md`](../../CONTRIBUTING.md) for the bug-routing decision tree and contribution process.

## Licensing Posture

The full license matrix is documented in [`../../CONSISTENCY.md`](../../CONSISTENCY.md) section 6. Summary:

- Code: AGPL-3.0-only
- Documentation: CC BY 4.0
- Prompt libraries, if separated: CC BY-SA 4.0
- Third-party dependencies: permissive or weak-copyleft only; AGPL and GPL-3.0 are blocked
- Redis: pinned `<8.0` (BSD); never the SSPL releases

## Security Disclosure

Report security vulnerabilities by opening a private GitHub Security Advisory on the affected repository. Do not file public issues for suspected vulnerabilities. The maintainer will acknowledge within 72 hours and coordinate a fix and disclosure timeline with the reporter.
