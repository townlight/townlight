<a id="civicaccess---city-core-integration-refined-plan-a-d"></a>

# Townlight Access -> city-core integration (refined plan, A-D)

**Created:** 2026-06-28. **Status:** DRAFT plan-of-record, awaiting per-phase approval gates.
**Supersedes:** `.agent-runs/2026-06-25-civicaccess-city-core-phase1/manifest.yaml` (single registry-first Phase 1 — see why below).

Goal: make **Townlight Access the sixth city-core module** (Townlight Core + Townlight Records + Townlight Meetings + Townlight Code + Townlight Notice + **Townlight Access**), installable end-to-end per the full-suite program Definition of Done. ~~Townlight Access is deterministic / **no live AI** -> it follows the shipped **Townlight Notice** no-AI pattern.~~

> **AMENDED 2026-07-02 (project owner directive, supersedes the no-AI rule below).**
> Townlight Access's desktop port now uses the suite's local AI engine (the pinned
> Gemma model via `model.rs::generate_local_text`, same engine as
> CivicClerk/CivicRecords/CivicCode) for plain-language rewrite drafts,
> multilingual variant drafts, and an advisory accessibility-review analysis —
> each with a deterministic fallback and an explicit "AI engine not ready" UI
> state when the model is absent. The five deterministic WCAG rule checks remain
> the records-bearing floor (AI never adds/removes/reclassifies a finding), and
> the four checklist tools stay deterministic. `model_needs` now declares the
> pinned Gemma model `required: true`. The upstream Python module stays
> deterministic v0.4.0; the AI lives in the desktop Rust port, matching how the
> other three AI-capable modules ship. The UnifiedSpec never excluded AI from
> Townlight Access (§12) and its non-negotiables ("AI drafts; humans decide", "local
> inference is the default", "degrades gracefully when the LLM is unavailable")
> are exactly the shape of this integration.

## Why the original Phase-1-first plan was scrapped

An adversarial refinement pass (5-agent, 2026-06-28) found the drafted "add Townlight Access to the city-core profile first" approach would **break the shipped 5-module city-core and could not merge**:

1. **Adding a module to a profile is not inert.** `desktop/src-tauri/src/module_registry.rs::validate_profile` validates the *full installable contract of every module in the profile*. An incomplete/mis-named Townlight Access record makes **all five shipped modules fail to load** in the desktop.
2. **Wrong contract field names.** The old manifest told the executor to write `health_checks / backup_hooks / restore_hooks / model_requirements / audit_events / surface_placement`. The desktop deserializer (and every real record, incl. Townlight Notice) uses **`routes / permissions / services[].health_check / migrations / tasks / backup_restore_hooks / model_needs / lifecycle`**. The old names appear 0 times in `installer/modules.json` -> serde silently drops them -> empty module card.
3. **Won't merge.** The required `verify` gate runs `verify-suite-state.py` + `verify-installer-plan.py`, which **hard-code city-core = exactly the 5 current modules** and that Townlight Access **must stay excluded**. Several scripts needing edits were outside the old manifest's `allowed_paths`.
4. **The demoting gaps were unowned.** v0.3.0 still has **no staff-auth boundary, no audit log, no proven backup/restore**, and defaults to **local SQLite** (violates the Postgres baseline). "Mirror Townlight Notice" = real module code, not a registry edit. (Probe gap #1, clean install, **is** closed in v0.3.0.)
5. **No accessibility acceptance** — the one thing the module sells (a11y + records-export fidelity) wasn't tested.
6. **Pin trap.** v0.3.0 (`a94daec...`) is correct; the newer **v1.0.0 tag regressed** to bare `civiccore==1.1.0` (a known false release) and must never be the pin.

## The refined order: harden + wire first, flip the profile last

| Phase | Repo | What | Lands on |
|---|---|---|---|
| **A** | `townlight/access` | Postgres-default + authz + audit + backup hardening; close probe gaps #2/#3/#4; **cut v0.4.0** | civicaccess `main` (new release) |
| **B** | `townlight/townlight` | Desktop runtime wiring + author the runtime-valid module RECORD (NOT yet in the profile) | umbrella `main` (shipped 5-module profile unchanged) |
| **C** | `townlight/townlight` | **Flip** city-core to 6 in one lockstep changeset, after a fresh re-probe PASS | umbrella `main` |
| **D** | clean VM + `townlight/townlight` | Clean-VM **full accessibility DoD**; commit evidence kit; flip release truth | evidence kit + release tag |

The profile only becomes 6 modules in Phase C, **after** the runtime exists (Phase B) and the module is hardened + re-probed (Phase A) — so the desktop never has a city-core profile that fails validation, and the "in-profile-but-not-usable" half-state is structurally impossible.

## Cross-cutting rules (apply to every phase)

- **Field-name rule:** module records use the `module_registry.rs` shape only. The `installer/module-manifest-contract.json` `future_desktop_contract_fields` names are doc-only and MUST NOT appear in a record.
- **Binding gate:** the umbrella Python contract verifier does NOT validate desktop contract fields. The authoritative gate is **`cargo test` in `desktop/src-tauri`** (`validate_profile`). Add it to required gates.
- **Pin guard:** pin Townlight Access to the **v0.4.0** commit. Explicit non-goal in every phase: never pin v1.0.0.
- **DoD honesty:** a green CI run / passing tests / a label is NOT done. Only the **clean-VM evidence kit committed with the release tag** is done (program DoD).
- ~~**`model_needs: []`** (empty) everywhere — deterministic, no Ollama/model dependency.~~ **Superseded 2026-07-02** by the owner directive above: `model_needs` declares the pinned `gemma-4-12b-it-qat-q4_0` with `required: true` for the AI-backed features (deterministic fallback preserved).
