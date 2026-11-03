## Summary

What does this PR change, and why? One or two sentences.

## Modules affected

- [ ] Umbrella docs / governance only (this repo)
- [ ] Compatibility matrix (`docs/compatibility/index.md`)
- [ ] Roadmap (`docs/roadmap/`)
- [ ] Architecture / ADRs (`docs/architecture/`)
- [ ] User-facing docs (`README.md`, `USER-MANUAL.md`, `docs/index.html`)
- [ ] Community files (`SECURITY.md`, `CODE_OF_CONDUCT.md`, `SUPPORT.md`, `CONTRIBUTING.md`)
- [ ] Touches multiple modules' contracts (call out which: ___ )

> If your change touches **runtime code**, you're in the wrong repo — open the PR against the module repo instead.

## Truth-source updates

If this PR changes a number, version, date, or named fact, confirm:

- [ ] `CONSISTENCY.md` is updated in the same PR
- [ ] `docs/compatibility/index.md` is updated if a module version or pin changed
- [ ] `CHANGELOG.md` has an entry under `[Unreleased]`
- [ ] All six required documentation artifacts (README, CHANGELOG, CONTRIBUTING, LICENSE, .gitignore, docs/index.html) still exist

## Verification

- [ ] `bash scripts/verify-docs.sh` passes locally (paste output if relevant)
- [ ] No stale current-facing strings (Phase 0 scaffold for townlight_core, townlight_core 0.1.0, records-ai v1.3.0 pending, or old `scottconverse/townlight_records` current-facing URLs)
- [ ] Links verified (no broken references)

## Related issues / discussions

Closes #___ ; relates to #___

## Reviewer notes

Anything specific reviewers should look for, double-check, or sanity-test.
