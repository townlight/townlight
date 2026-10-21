# Branch Protection Development Mode

Status: active during pre-public Townlight development
Date: 2026-04-28

The Townlight organization is still in private, pre-announcement development. During this phase, default-branch protection is intentionally lighter so the implementation agent can move through setup, rehearsal, documentation, and release-alignment work without an unnecessary human-review bottleneck on every internal PR.

Operational update on 2026-04-28: the Townlight GitHub organization was set to this development-mode posture across current repos. Required status checks remain in place, admin enforcement remains enabled, and force pushes / branch deletion remain disabled. The only intentionally relaxed setting is the required approving-review gate.

## Current Development Setting

- Keep required status checks enabled.
- Keep force pushes disabled.
- Keep branch deletion disabled.
- Do not require an approving PR review for routine internal development PRs.

## Restore Before Public Announcement

Before Townlight is treated as a final product or publicly announced, restore professional-grade branch protection across public-facing repos. Treat this as a release-readiness checklist item, not an optional cleanup:

- Require at least one approving review from a maintainer with write access.
- Dismiss stale reviews when new commits are pushed.
- Require all status checks to pass.
- Require branches to be up to date before merge where practical.
- Keep force pushes and branch deletion disabled.

This note exists so the temporary relaxation does not become accidental permanent policy.
