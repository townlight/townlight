<a id="civicsuite-ui-patterns--the-guarded-set"></a>

# Townlight UI patterns — the guarded set

This documents the cross-module interaction patterns the Tauri/WebView2 desktop
app (`desktop/src/` + `desktop/src-tauri/src/`) has already converged on, and,
for each one, the test that pins it. It is a map to enforced reality, not a
proposed redesign — it extends [windows-desktop-design-control.md](windows-desktop-design-control.md).
Every future user-visible surface must match these. Anchors are
function/const/class names, never line numbers (those rot). Each pattern lists:
**what it is**, **where it lives** (anchor), and **what guards it** (the test
that fails if it silently reverts).

---

## 1. AI output is a labeled draft; a human decides

The suite's defining trust rule. No AI output is ever treated as a decision, a
record status, or a certification. It is a **draft**, visibly labeled, that a
person reviews and accepts or discards.

- **Where — result surface:** `renderWorkActionResult()` in `desktop/src/main.js`
  is the single surface that renders any work-action outcome, including the
  AI-outcome disclosure. Route all AI results through it; do not render model
  output inline elsewhere.
- **Where — record integrity:** in `desktop/src-tauri/src/workflows.rs`, review
  status is **never AI-derived**. Deterministic rule checks set status; the model
  may attach an advisory analysis alongside, but it never adds, removes, or
  reclassifies a finding.
- **Copy rule:** label every AI draft as a draft; translations carry the
  "route to a qualified human translator before public use" note; a saved
  Accessibility Review is "advisory clerk support, not a certified audit."
- **Guarded by:** the Playwright suite asserts the stored-analysis render
  (including XSS/wrap behavior); the static-smoke npm test phrase-pins the
  prompt strings so they cannot silently change.

## 2. Human-confirm-before-lock (guided work actions)

Any action that locks, publishes, or destroys a record requires an explicit
human confirmation step first — the AI never triggers a lock on its own.

- **Where:** `GUIDED_WORK_ACTIONS` in `desktop/src/main.js` (the ~50-action
  registry). Each guided action carries the confirm-before-lock contract.
- **Rust side:** the confirm step precedes the state transition in the matching
  handler in `desktop/src-tauri/src/workflows.rs`.
- **Rule:** new lock/publish/finalize actions register in `GUIDED_WORK_ACTIONS`
  rather than firing directly from a button handler.

## 3. "AI engine not ready" — the labeled deterministic fallback

Every AI feature is dual-path. When the local model isn't available, the feature
degrades to a clearly-labeled deterministic result and points the user at model
setup — it never fails silently or blocks the workflow.

- **Where — gate:** `aiEngineReady()` in `desktop/src/main.js` gates AI paths;
  when false it renders the **"AI engine not ready"** banner, which routes to
  model setup via `data-area="health"`.
- **Where — engine:** `local_generation_available()` and `generate_local_text()`
  in `desktop/src-tauri/src/model.rs`, with the pinned generation constants
  (temperature, `num_predict`, `num_ctx`, timeout) defined there — one config,
  shared by every AI feature.
- **Rule:** a new AI feature must implement both paths and surface the not-ready
  state; never ship an AI-only path.
- **Guarded by:** the static-smoke npm test phrase-pins the "AI engine not ready"
  markers and the `/api/chat` endpoint (guarding against a silent revert to the
  broken `/api/generate` raw-prompt path); Playwright asserts the not-ready
  banner appears and that it navigates to model setup.

## 4. The audit trail — hash-chained, always available

Every consequential action writes an audit event. The trail is visible in a
shared drawer and is tamper-evident.

- **Where — UI:** the audit drawer in `desktop/src/main.js` (styles in
  `desktop/src/styles.css`), a timeline of events with per-event hashes.
- **Where — integrity:** `desktop/src-tauri/src/workflows.rs` maintains a
  per-module `audit_events` FIFO and a hash-chained global `audit_entries`.
- **Rule:** actions that change records emit an audit event; the drawer is the
  single canonical view of that history across modules.

## 5. Destructive actions are visually distinct

Delete/remove actions carry a distinct treatment so they are never mistaken for
a routine control, and they still pass through confirm-before-lock (pattern 2).

- **Where:** `.destructive-action` in `desktop/src/styles.css` (e.g. applied to
  Delete Review).
- **Token:** destructive styling derives from the `--err` family in
  `civiccore-ui/tokens/tokens.css` (`--err` on `--err-soft` = 6.40:1, AA).

## 6. Focus is always restored

Keyboard focus never gets stranded. After any render that removes the focused
element, focus returns to a sensible anchor.

- **Where:** the generic focus-restore fallback at the end of `render()` in
  `desktop/src/main.js`.
- **Rule:** interactive flows rely on this fallback rather than leaving focus on
  a detached node; this is part of the suite's WCAG 2.2 AA posture (see the
  Token Authority section's accessibility floor in
  [windows-desktop-design-control.md](windows-desktop-design-control.md)).

---

## How these stay true

The patterns are not just implemented — they are pinned:

- **static-smoke (npm test):** phrase-pins the "AI engine not ready" markers, the
  prompt strings, and the `/api/chat` endpoint.
- **Playwright suite:** asserts the not-ready banner, model-setup navigation, and
  stored-analysis render/XSS/wrap behavior.

When you add a surface, add or extend the guard in the same change. A pattern
that isn't pinned is a pattern that will drift.
