# Shared Extraction Consumer Rollout

This playbook documents the standard way to carry a newly shipped `civiccore` capability into downstream Townlight modules without bespoke work. It exists so a shared-platform extraction does not become a one-off migration every time a consumer adopts it.

## Use This Playbook When

Use this process when:

- `civiccore` ships a new shared capability that a module should consume
- a module is moving from local implementation to a shared platform helper
- the shared extraction touches release gates, docs, workflow surfaces, or browser QA evidence

## Standard Rollout Sequence

1. Confirm the shared package release exists.
   - Verify the GitHub release, wheel artifact, version number, and checksum surface if published.
   - Do not point a consumer at an unreleased `civiccore` branch.
2. Update the consumer dependency form.
   - Prefer the published package source used by the suite at that moment.
   - If the version is not yet on PyPI, use the GitHub release wheel consistently and enable direct references where required.
3. Update placeholder-import guards.
   - If the consumer has a gate that forbids reserved `civiccore` namespaces, allow the new namespace only after the capability is actually shipped.
4. Decide wrapper versus direct import.
   - Use a wrapper when the module must preserve an existing API contract or user-visible behavior.
   - Use a direct import when the shared helper already matches the module contract.
5. Update tests and release checks.
   - Cover version surfaces, dependency wiring, import allowances, module behavior, and failure modes.
   - Keep the module release gate honest about the newly shared capability.
6. Update current-facing docs and release surfaces.
   - README, user manual, docs landing pages, release evidence, and any browser-QA manifests must match the new state.
7. Run the narrow audit loop.
   - Develop, run `audit-lite`, fix findings, and re-run `audit-lite` once if needed.
8. Capture browser evidence for any changed HTML or UI.
   - Check desktop and mobile widths.
   - Verify focus states, keyboard navigation, user-visible copy, and browser console cleanliness.
9. Run the module verification gate.
   - Use `scripts/verify-release.sh` where present.
   - For umbrella-only documentation changes, use the repo's documentation verification script.
10. Push, open the PR, watch CI, merge, and perform post-merge verification on `main`.

## Required Outputs

Each consumer rollout should leave behind:

- a released or pinned `civiccore` dependency that resolves from a real artifact
- test coverage for the shared capability in the consumer
- updated release-gate behavior where applicable
- updated current-facing docs
- browser QA evidence when a rendered surface changed
- a post-merge verification record on `main`

## Anti-Patterns To Avoid

- pointing a module at a `civiccore` branch instead of a release artifact
- updating the dependency without updating placeholder-import guards
- landing a shared helper without matching docs or release evidence
- treating repeated adoption work as bespoke when it should become part of the standard rollout pattern
- pushing before verification because "it's only a docs or dependency change"

## Proven Examples

Current proven examples of this rollout pattern:

- `civicnotice` adopting the shared notice-compliance helper from `civiccore v0.9.0`
- `civicclerk` adopting the same shared helper while preserving its local packet notice API contract

As additional extractions land, this document should be updated so the fourth consumer does not have to rediscover what the second consumer already proved.
