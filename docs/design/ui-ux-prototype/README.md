<a id="civicsuite-uiux-prototype"></a>

# Townlight UI/UX prototype

This directory holds the **canonical UI/UX specification for Townlight**, built by Claude Design at Scott's request.

It is a runnable React + Babel single-page prototype — no build step required. Open `CivicSuite.html` in a browser to interact with the design.

## Why it lives here

The unified product spec at `docs/CivicSuiteUnifiedSpec.md` describes architectural intent — module catalog, tier structure, data models, principles. It does not describe the **visual** product: what each screen looks like, how density and color work, what the staff/resident/admin surface split feels like, what the audit drawer reveals, how the ⌘K palette behaves.

This prototype is that visual spec. Any pull request that touches user-visible code or copy must respect what's here unless the PR explicitly proposes a design change with rationale.

## What's in it

| File | Purpose |
|---|---|
| `CivicSuite.html` | Entry point. Open in browser. |
| `app.jsx` | App-level routing + state. |
| `shell.jsx` | App shell: topbar, ⌘K search palette, audit drawer, density toggle, surface switch (Staff / Resident / IT-Admin). |
| `staff-dashboard.jsx` | Default staff landing surface. |
| `clerk.jsx` | Townlight Meetings module screens (meetings, agendas, minutes). |
| `records.jsx` | Townlight Records module screens (request lifecycle). |
| `resident.jsx` | Resident-facing surface. |
| `admin.jsx` | IT/Admin surface. Includes the canonical first-run setup checklist: a three-state step list (done / current / upcoming) where the current step is the single, unmistakable action point — gold accent + `aria-current="step"` + an "Action needed" banner + auto-focused first empty field. The same pattern appears in the desktop app via `.first-run-action-needed` (amber) and a persistent `aria-live` region; the two surfaces express one pattern in each codebase's class vocabulary. |
| `modules-stub.jsx` | Placeholder shape for unbuilt modules (used as the canonical "module not yet implemented" pattern). |
| `data.jsx` | Mock data + role/permission model used by the prototype. |
| `icons.jsx` | Icon set + naming conventions. |
| `tweaks-panel.jsx` | Live density/spacing/color tweaks panel — also the source of truth for the design tokens. |
| `styles.css` | Design tokens (typography, spacing, color, rules), component styles. Includes the canonical `.setup-step` first-run checklist block. |

## Three architectural commitments in the prototype

1. **Three surfaces, not nested nav.** Staff / Resident / IT-Admin. The surface switch is a first-class affordance in the topbar, not buried under settings.
2. **Audit drawer is always one click away.** The button is in the topbar. Every staff action surfaces an audit entry visible from the drawer.
3. **⌘K search palette is the primary navigation.** Hierarchical sidebars are secondary; the palette is how staff actually get anywhere.

## How the pipeline uses this

`CLAUDE.md` at the repo root names this directory in its "Pipeline drafter notes" section. The manifest-drafter pulls in any file under here when planning UI-touching work. The critic role's UX lens verifies that PR diffs respect the visual hierarchy, copy voice, state coverage, and accessibility patterns shown here.

If the prototype and a PR conflict, **the prototype is authoritative** unless the PR is explicitly a design-change PR that updates the prototype too.

## How to view it

```bash
cd docs/design/ui-ux-prototype
python3 -m http.server 8000
# open http://localhost:8000/CivicSuite.html
```

Or any static-file server. No Node, no build step, no npm install.

## How to update it

This is the design spec, not application code. Updates are a real design decision:

1. Open an issue describing the proposed change and why.
2. Build the change in the prototype.
3. PR the prototype change AND any application-code change together; they ship as a pair.
4. Update this README if the change touches one of the three architectural commitments.
