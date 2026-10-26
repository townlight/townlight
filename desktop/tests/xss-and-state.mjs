// T4 + T7 — frontend state-load + XSS behavioral guards.
//
// main.js is an ES module that (a) imports `invoke` from @tauri-apps/api/core,
// (b) imports ./styles.css, and (c) auto-runs `await loadAppState(); render();`
// at the bottom against the real DOM. To exercise it under Node we:
//   - stub a minimal DOM + window (with controllable __TAURI_INTERNALS__),
//   - replace the @tauri-apps import with an injectable invoke,
//   - drop the css import,
//   - append a tiny export so the test can reach the module internals
//     (state, appStateLoaded, loadAppState, render, renderFirstRunWizard),
// then import the rewritten module from a data: URL (preserves ESM + top-level
// await semantics). Mirrors tests/static-smoke.mjs conventions (throw on fail).

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const mainSrc = readFileSync(join(root, "src", "main.js"), "utf8");

function fail(message) {
  throw new Error(`xss-and-state: ${message}`);
}

// ---------------------------------------------------------------------------
// Minimal DOM stub. Only what main.js touches: getElementById("app"),
// element.innerHTML, querySelector / querySelectorAll, addEventListener,
// classList, dataset, textContent, scrollIntoView, requestAnimationFrame,
// matchMedia, activeElement.
// ---------------------------------------------------------------------------
function makeElement(id = "") {
  const el = {
    id,
    _html: "",
    children: [],
    classList: { add() {}, remove() {}, contains: () => false, toggle() {} },
    dataset: {},
    style: {},
    textContent: "",
    setAttribute() {},
    getAttribute: () => null,
    focus() {},
    scrollIntoView() {},
    addEventListener() {},
    removeEventListener() {},
    appendChild() {},
    closest: () => null,
    get innerHTML() {
      return this._html;
    },
    set innerHTML(value) {
      this._html = String(value);
    },
    querySelector() {
      return makeElement();
    },
    querySelectorAll() {
      return [];
    }
  };
  return el;
}

const appEl = makeElement("app");
const elements = { app: appEl };

const documentStub = {
  title: "Townlight",
  activeElement: null,
  getElementById(id) {
    if (!elements[id]) elements[id] = makeElement(id);
    return elements[id];
  },
  querySelector() {
    return null;
  },
  querySelectorAll() {
    return [];
  },
  addEventListener() {},
  createElement() {
    return makeElement();
  },
  body: makeElement("body")
};

const windowStub = {
  document: documentStub,
  requestAnimationFrame(cb) {
    // run synchronously so render side effects settle within the test
    cb();
    return 0;
  },
  matchMedia() {
    return { matches: false, addEventListener() {}, removeEventListener() {} };
  },
  addEventListener() {},
  location: { reload() {} }
};

// Controllable Tauri bridge. The test flips these to simulate load outcomes.
let invokeImpl = async () => {
  throw new Error("invoke not configured");
};
windowStub.__TAURI_INTERNALS__ = {};

globalThis.window = windowStub;
globalThis.document = documentStub;
globalThis.requestAnimationFrame = windowStub.requestAnimationFrame;
globalThis.matchMedia = windowStub.matchMedia;

// ---------------------------------------------------------------------------
// Rewrite main.js so it is importable in Node:
//  - replace the @tauri-apps import with our injectable invoke,
//  - drop the styles.css import,
//  - strip the BOM,
//  - append an internals export for assertions.
// ---------------------------------------------------------------------------
let rewritten = mainSrc.replace(/^﻿/, "");
// A data: module has no hierarchical base URL. Resolve every static relative
// import against the original main.js, including newly connected product views.
const mainUrl = pathToFileURL(join(root, "src", "main.js"));
rewritten = rewritten.replace(
  /(\bfrom\s*)(["'])(\.{1,2}\/[^"']+)\2/g,
  (_match, prefix, _quote, specifier) => prefix + JSON.stringify(new URL(specifier, mainUrl).href)
);
rewritten = rewritten.replace(
  /import\s*\{\s*invoke\s*\}\s*from\s*["']@tauri-apps\/api\/core["'];?/,
  "const invoke = (...args) => globalThis.__TEST_INVOKE__(...args);"
);
rewritten = rewritten.replace(/import\s+["']\.\/styles\.css["'];?/, "");
rewritten +=
  "\nexport const __test__ = { get state() { return state; }, " +
  "get appStateLoaded() { return appStateLoaded; }, loadAppState, render, " +
  "renderFirstRunWizard, fallbackState };\n";

globalThis.__TEST_INVOKE__ = (...args) => invokeImpl(...args);

function loadModule() {
  const url = "data:text/javascript;base64," + Buffer.from(rewritten, "utf8").toString("base64");
  return import(url);
}

// ===========================================================================
// T4.1 — load error: invoke rejects -> appLoadError set, appStateLoaded false,
//         renderFirstRunWizard() === "".
// (The module auto-runs loadAppState()+render() on import with invoke
//  rejecting, so the error path is exercised at import time.)
// ===========================================================================
const XSS_PAYLOAD = '"><img src=x onerror=window.__xss=1>';

invokeImpl = async () => {
  throw new Error("Could not parse local workflow state: corrupt JSON at line 1");
};
const mod = await loadModule();
const t = mod.__test__;

if (t.appStateLoaded !== false) fail("T4.1: appStateLoaded must be false after a load error");
if (!t.state.appLoadError) fail("T4.1: state.appLoadError must be set after a load error");
if (t.renderFirstRunWizard() !== "") {
  fail("T4.1: renderFirstRunWizard() must return '' when state failed to load (no fallback wizard)");
}

// T4.2 — render() output shows the retryable error banner, NOT the first-run
//         checklist, and includes the retry action hook.
t.render();
const errorHtml = appEl.innerHTML;
if (!errorHtml.includes("could not open your saved city data")) {
  fail("T4.2: error render must contain the 'could not open your saved city data' banner");
}
if (!errorHtml.includes("data-action='retry-load-state'") &&
    !errorHtml.includes('data-action="retry-load-state"')) {
  fail("T4.2: error render must contain the retry-load-state action");
}
if (errorHtml.includes("setup checklist")) {
  fail("T4.2: error render must NOT contain the first-run checklist heading");
}

// T4.2b — the corrupt error message is escaped (defense in depth: appLoadError
//          may echo back text). Inject an XSS payload as the error message and
//          confirm it renders inert (no raw <img onerror>).
invokeImpl = async () => {
  throw new Error(XSS_PAYLOAD);
};
await t.loadAppState();
t.render();
const injectedHtml = appEl.innerHTML;
if (injectedHtml.includes("<img src=x onerror=")) {
  fail("T4.2b: an XSS payload in the load error must be escaped, not rendered raw");
}
if (!injectedHtml.includes("&lt;img")) {
  fail("T4.2b: the escaped payload should appear as &lt;img...");
}

// T4.3 — retry: invoke resolves on retry -> app renders normally, error cleared.
// Use the module's own complete fallbackState shape (a valid full app state) so
// render() exercises the real, full render tree rather than a partial stub.
const FINISHED_STATE = {
  ...t.fallbackState,
  first_run: { ...t.fallbackState.first_run, finished: true }
};
invokeImpl = async (cmd) => (cmd === "get_app_state" ? FINISHED_STATE : {});
await t.loadAppState();
if (t.appStateLoaded !== true) fail("T4.3: appStateLoaded must be true after a successful retry");
if (t.state.appLoadError !== null) fail("T4.3: state.appLoadError must be cleared after a successful retry");
t.render();
if (appEl.innerHTML.includes("could not open your saved city data")) {
  fail("T4.3: after a successful retry the error banner must be gone");
}

// ===========================================================================
// Canonical outage must not trap an operator outside System Health after backup.
const canonicalShell = {...FINISHED_STATE, domain_authority:"python-records"};
invokeImpl = async (cmd) => {
  if (cmd === "get_app_state") return canonicalShell;
  if (cmd === "suite_domain_request") throw new Error("Service stopped after backup");
  throw new Error(`Unexpected fallback command: ${cmd}`);
};
await t.loadAppState();
if (!t.appStateLoaded || t.state.appLoadError) fail("Canonical outage must preserve the loaded shell");
t.state.activeArea = "home";
t.render();
if (!appEl.innerHTML.includes("Records service is unavailable")) fail("Outage must not claim empty Records");
t.state.activeArea = "health";
t.render();
if (!appEl.innerHTML.includes("System Health") || appEl.innerHTML.includes("could not open your saved city data")) {
  fail("Canonical outage must leave System Health accessible");
}
invokeImpl = async (cmd) => cmd === "get_app_state" ? canonicalShell : {records_requests:[], access:{reviews:[],audit_events:[]}};
await t.loadAppState();
if (t.state.domainLoadError) fail("Successful canonical refresh must clear the outage");
t.state.activeArea = "home";

// T7 — PR#194 first-run cue regression + appStateLoaded gate.
//   genuine first-run: get_app_state resolves finished:false with a
//   profile_label + locations -> wizard renders the checklist + all three
//   locations; gated on appStateLoaded === true.
// ===========================================================================
const FIRST_RUN_APP = {
  ...t.fallbackState,
  first_run: {
    ...t.fallbackState.first_run,
    finished: false,
    profile_label: "City Clerk Core",
    steps: [
      { id: "locations", label: "Choose local folders", status: "current", detail: "", actions: [] }
    ],
    locations: {
      install_root: "C:/Townlight/App",
      data_root: "C:/Townlight/Data",
      backup_root: "C:/Townlight/Backups"
    }
  }
};

invokeImpl = async (cmd) => (cmd === "get_app_state" ? FIRST_RUN_APP : {});
await t.loadAppState();
if (t.appStateLoaded !== true) fail("T7: appStateLoaded must be true after a genuine first-run load");

const wizard = t.renderFirstRunWizard();
if (!wizard.includes("City Clerk Core setup checklist")) {
  fail("T7: wizard must render '${profile_label} setup checklist'");
}
for (const loc of ["C:/Townlight/App", "C:/Townlight/Data", "C:/Townlight/Backups"]) {
  if (!wizard.includes(loc)) fail(`T7: wizard must render location ${loc}`);
}

// T7 negative: finished === true -> wizard returns "".
const FINISHED_APP = { ...FIRST_RUN_APP, first_run: { ...FIRST_RUN_APP.first_run, finished: true } };
invokeImpl = async (cmd) => (cmd === "get_app_state" ? FINISHED_APP : {});
await t.loadAppState();
if (t.renderFirstRunWizard() !== "") fail("T7: a finished first-run must render no wizard");

// ===========================================================================
// T8 — #17 defense-in-depth: backend-origin first-run chrome (profile_label,
//   locations, step text) is escaped, not interpolated raw into innerHTML.
// ===========================================================================
const XSS_FIRST_RUN_APP = {
  ...t.fallbackState,
  first_run: {
    ...t.fallbackState.first_run,
    finished: false,
    profile_label: XSS_PAYLOAD,
    steps: [
      { id: "model", label: XSS_PAYLOAD, status: "current", summary: "", detail: "", current: true }
    ],
    locations: { install_root: XSS_PAYLOAD, data_root: "", backup_root: "" }
  }
};
invokeImpl = async (cmd) => (cmd === "get_app_state" ? XSS_FIRST_RUN_APP : {});
await t.loadAppState();
const xssWizard = t.renderFirstRunWizard();
if (xssWizard.includes("<img src=x onerror=")) {
  fail("T8: backend-origin first-run strings must be escaped, not rendered raw");
}
if (!xssWizard.includes("&lt;img")) {
  fail("T8: the escaped first-run payload should appear as &lt;img...");
}

// ===========================================================================
// T9 — #34 model download expectation: the current "model" first-run step
//   states the download size (from state.app.model.download_size_bytes) and
//   that it resumes if interrupted.
// ===========================================================================
const modelSize = `${(t.fallbackState.model.download_size_bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
if (!xssWizard.includes(modelSize)) {
  fail(`T9: model step must show the download size ${modelSize}`);
}
if (!/resume/i.test(xssWizard)) {
  fail("T9: model step must state the download resumes if interrupted");
}

// ===========================================================================
// GAP #14 — partial/empty/error UI states a real first user hits are rendered
//   (not crashed, not blank). Error state is already covered by T4. These add
//   the model-not-ready, service-unhealthy, and empty-data surfaces. Each drives
//   the REAL render() end-to-end at a chosen activeArea and asserts on the HTML
//   the app actually produces (substrings grounded in main.js, cited inline).
// ===========================================================================

// Finished, unconfigured-access base state so render() routes straight to the
// chosen area without the first-run wizard or the access panel (access.configured
// is false in fallbackState -> renderActiveArea() access gate at the top is skipped;
// records/health are enabled via areaIsEnabled with the city-core modules).
function finishedBase() {
  return {
    ...t.fallbackState,
    first_run: { ...t.fallbackState.first_run, finished: true }
  };
}

// ---------------------------------------------------------------------------
// T10 — MODEL-NOT-READY: model not yet downloaded/verified. The Health surface
//   (renderHealth -> renderModelReadiness, main.js ~1563) must show the status
//   "Needs download" (main.js:1577) and a download/setup cue button
//   "Download / Resume" (main.js:1521, model.download_resumable === true), and
//   the download progress line "Not downloaded" (renderModelDownloadStatus,
//   from download_state.status, main.js:1545). Not a crash, not a blank.
// ---------------------------------------------------------------------------
{
  const app = finishedBase();
  invokeImpl = async (cmd) => (cmd === "get_app_state" ? app : {});
  await t.loadAppState();
  if (t.appStateLoaded !== true) fail("T10: appStateLoaded must be true for the model-not-ready state");
  t.state.activeArea = "health";
  t.render();
  const html = appEl.innerHTML;
  if (!html || html.length < 100) fail("T10: health surface must not render blank for a not-ready model");
  if (!html.includes("Needs download")) {
    fail("T10: model readiness must show the not-ready status 'Needs download' (main.js:1577)");
  }
  if (!html.includes("Download / Resume")) {
    fail("T10: model readiness must show the download/setup cue 'Download / Resume' (main.js:1521)");
  }
  if (!html.includes("Not downloaded")) {
    fail("T10: model download status must show 'Not downloaded' (main.js:1545 from download_state.status)");
  }
}

// ---------------------------------------------------------------------------
// T11 — SERVICE-UNHEALTHY: a runtime/service health check is failing. The Health
//   grid (renderHealth, main.js ~4927) must render the unhealthy status and a
//   repair cue (data-supervisor-action="repair", main.js:4940) for an actionable
//   failing service, rather than crashing. We feed an actionable health item with
//   ok:false and a distinctive unhealthy status.
// ---------------------------------------------------------------------------
{
  const app = finishedBase();
  app.health = [
    {
      id: "python-services",
      label: "City workflow services",
      ok: false,
      status: "Service down",
      message: "City workflow services stopped responding on this machine.",
      next_action: "Repair the local City workflow services.",
      admin_detail: "Bundled CPython module services"
    }
  ];
  invokeImpl = async (cmd) => (cmd === "get_app_state" ? app : {});
  await t.loadAppState();
  t.state.activeArea = "health";
  t.render();
  const html = appEl.innerHTML;
  if (!html || html.length < 100) fail("T11: health surface must not render blank for an unhealthy service");
  if (!html.includes("Service down")) {
    fail("T11: unhealthy service must render its failing status 'Service down' (renderHealth, main.js:4930)");
  }
  if (!html.includes('data-supervisor-action="repair"')) {
    fail("T11: unhealthy actionable service must render the repair cue data-supervisor-action=\"repair\" (main.js:4940)");
  }
}

// ---------------------------------------------------------------------------
// T12 — EMPTY DATA SURFACE: a clerk opens Records with no requests yet. The
//   records workflow (renderRecordsWorkflow, main.js ~3672) must render the
//   empty-state note "No local records requests have been created yet."
//   (workflowEmpty, main.js:3797) rather than crashing on an empty list.
// ---------------------------------------------------------------------------
{
  const app = finishedBase();
  app.city_work = { ...t.fallbackState.city_work, records_requests: [] };
  invokeImpl = async (cmd) => (cmd === "get_app_state" ? app : {});
  await t.loadAppState();
  t.state.activeArea = "records";
  t.render();
  const html = appEl.innerHTML;
  if (!html || html.length < 100) fail("T12: records surface must not render blank when there are no requests");
  if (!html.includes("No local records requests have been created yet.")) {
    fail("T12: empty records surface must render the empty-state note (main.js:3797 via workflowEmpty)");
  }
}

// ===========================================================================
// T13 — first-run "Action needed" box scopes its failure text to the step that
//   produced it (state.actionResult.forStepId === step.id). Behavioral guard for
//   the 2026-07-12 Wave-1 C3 fix and its two follow-on regressions:
//     - a foreign result (a Settings module action, no forStepId) must NOT bleed
//       onto the wizard step it doesn't belong to (cross-context isolation), and
//     - a same-step failure (e.g. a Choose Folder error tagged with the current
//       step) MUST still show inline in that step's box.
//   Drives the REAL renderFirstRunWizard() with the backup step current.
// ===========================================================================
{
  const backupSteps = t.fallbackState.first_run.steps.map((step) => ({
    ...step,
    current: step.id === "backup",
    status: step.id === "backup" ? "Current" : "Needs setup",
    next_action: step.id === "backup" ? "ROUTINE_BACKUP_NEXT" : step.next_action
  }));
  const app = {
    ...t.fallbackState,
    first_run: {
      ...t.fallbackState.first_run,
      finished: false,
      current_step_id: "backup",
      steps: backupSteps
    }
  };
  invokeImpl = async (cmd) => (cmd === "get_app_state" ? app : {});
  await t.loadAppState();
  if (t.appStateLoaded !== true) fail("T13: appStateLoaded must be true for the backup-step first-run state");

  // Text inside the current step's "Action needed" <span> (not the bottom banner).
  function actionNeededText(html) {
    const box = html.indexOf("first-run-action-needed");
    if (box === -1) return null;
    const open = html.indexOf("<span>", box);
    const close = html.indexOf("</span>", open);
    return html.slice(open + "<span>".length, close);
  }

  // (a) no failure -> box shows the step's own routine next_action.
  t.state.actionResult = null;
  let box = actionNeededText(t.renderFirstRunWizard());
  if (box === null) fail("T13a: the current backup step must render an 'Action needed' box");
  if (!box.includes("ROUTINE_BACKUP_NEXT")) {
    fail("T13a: with no failure the box must show the step's own next_action");
  }

  // (b) same-step failure (forStepId === "backup") -> box shows the failure remedy.
  t.state.actionResult = { accepted: false, forStepId: "backup", status: "x", message: "m", next_action: "SAMESTEP_REMEDY" };
  box = actionNeededText(t.renderFirstRunWizard());
  if (!box.includes("SAMESTEP_REMEDY")) {
    fail("T13b: a same-step failure must show its remedy inline in the step box");
  }

  // (c) foreign failure (no forStepId, e.g. a module action) -> must NOT bleed onto
  //     the step; the box falls back to the step's own next_action.
  t.state.actionResult = { accepted: false, status: "x", message: "m", next_action: "FOREIGN_REMEDY" };
  box = actionNeededText(t.renderFirstRunWizard());
  if (box.includes("FOREIGN_REMEDY")) {
    fail("T13c: a foreign failure (no forStepId) must NOT show in the wizard step box");
  }
  if (!box.includes("ROUTINE_BACKUP_NEXT")) {
    fail("T13c: with a foreign failure the box must fall back to the step's own next_action");
  }

  // (d) failure tagged for another step (forStepId === "locations") -> must not bleed
  //     onto the backup step either.
  t.state.actionResult = { accepted: false, forStepId: "locations", status: "x", message: "m", next_action: "OTHERSTEP_REMEDY" };
  box = actionNeededText(t.renderFirstRunWizard());
  if (box.includes("OTHERSTEP_REMEDY")) {
    fail("T13d: a failure tagged for another step must NOT show on the backup step box");
  }
  t.state.actionResult = null;
}

// ===========================================================================
// T14 — model actions show a working "Downloading…" label while a download is in
//   flight (Wave-2 C1). Drives the REAL health surface (renderModelActions).
// ===========================================================================
{
  const app = finishedBase();
  invokeImpl = async (cmd) => (cmd === "get_app_state" ? app : {});
  await t.loadAppState();
  t.state.activeArea = "health";

  // idle: primary button shows the normal label, not the working one.
  t.state.modelActionInFlight = null;
  t.render();
  if (appEl.innerHTML.includes("Downloading…")) {
    fail("T14a: idle model actions must NOT show the Downloading… working label");
  }

  // in flight (download): label flips to the working state.
  t.state.modelActionInFlight = "resume-download";
  t.render();
  if (!appEl.innerHTML.includes("Downloading…")) {
    fail("T14b: an in-flight download must show the Downloading… working label");
  }

  // C1 review fix: the in-flight result box uses the neutral "working" class, NOT
  // the green "saved" success class (which would read as "done" mid-download).
  t.state.modelActionResult = {
    working: true,
    status: "Working",
    message: "Downloading…",
    next_action: "do not close the app"
  };
  t.render();
  if (!appEl.innerHTML.includes("action-result working")) {
    fail("T14c: an in-flight model result must use the neutral 'working' class, not the 'saved' success class");
  }
  t.state.modelActionInFlight = null;
  t.state.modelActionResult = null;
}

// ===========================================================================
// T15 — a blocked (not-ready) module shows a plain-English reason, and the raw
//   contract string is kept only as a hover tooltip, not visible text (C6).
//   Renders the first-run 'modules' step in custom mode where civiczone is blocked.
// ===========================================================================
{
  const modulesSteps = t.fallbackState.first_run.steps.map((step) => ({
    ...step,
    current: step.id === "modules"
  }));
  const app = {
    ...t.fallbackState,
    modules: t.fallbackState.modules.map(module => module.id === "civiczone" ? {...module, contract_ready:false, blocked_reason:"Module civiczone must target Townlight Core 1.2.0 for Windows Local 1.0"} : module),
    first_run: {
      ...t.fallbackState.first_run,
      finished: false,
      current_step_id: "modules",
      steps: modulesSteps
    }
  };
  invokeImpl = async (cmd) => (cmd === "get_app_state" ? app : {});
  await t.loadAppState();
  t.state.moduleDraft.profileId = "custom"; // show the full selectable list incl. blocked civiczone
  const wiz = t.renderFirstRunWizard();

  if (!wiz.includes("not available in this release yet")) {
    fail("T15a: a blocked module must show the plain-English 'not available in this release yet' reason");
  }
  // The raw contract string may appear ONLY inside a title="" tooltip, never as
  // the visible <small> body text.
  if (!wiz.includes('title="Module civiczone must target Townlight Core 1.2.0 for Windows Local 1.0"')) {
    fail("T15b: the raw contract reason must be preserved as a hover tooltip for support");
  }
  if (wiz.includes("- Not ready for Windows Local 1.0: Module civiczone")) {
    fail("T15c: the raw contract string must NOT be shown as visible module body text");
  }
}

// ===========================================================================
// T16 — canonical demo-town controls are explicit and unmistakable. An empty
// local-admin Records surface offers the opt-in loader; once the backend state
// carries a fixture marker, both the fictional-town name and watermark render.
// ===========================================================================
{
  const adminAccess = {
    ...t.fallbackState.access,
    configured: true,
    signed_in: true,
    role: "local-admin"
  };
  const emptyApp = {
    ...finishedBase(),
    access: adminAccess,
    city_work: { ...t.fallbackState.city_work, demo_fixture: null }
  };
  invokeImpl = async (cmd) => (cmd === "get_app_state" ? emptyApp : {});
  await t.loadAppState();
  t.state.activeArea = "records";
  t.render();
  if (!appEl.innerHTML.includes('data-work-action="load-demo-town"')) {
    fail("T16a: an empty local-admin Records surface must offer the explicit demo loader");
  }
  if (!appEl.innerHTML.includes("Loading is never automatic")) {
    fail("T16b: the demo loader must explain that loading is never automatic");
  }

  const demoApp = {
    ...emptyApp,
    city_work: {
      ...emptyApp.city_work,
      demo_fixture: {
        fixture_id: "redstone-valley-records-demo",
        fixture_version: "1.0.0",
        fixture_sha256: "a9c242a3f2618a69d7effb1d0d17d2df06f6744c8c351bba4065d315c94575b4",
        municipality_name: "Town of Redstone Valley (Fictional)",
        watermark: "SYNTHETIC DEMONSTRATION DATA - NOT A REAL MUNICIPAL RECORD",
        loaded_at_unix_seconds: 1786992000
      }
    }
  };
  invokeImpl = async (cmd) => (cmd === "get_app_state" ? demoApp : {});
  await t.loadAppState();
  t.state.activeArea = "records";
  t.render();
  if (!appEl.innerHTML.includes("Town of Redstone Valley (Fictional)")) {
    fail("T16c: loaded demo state must visibly name the fictional municipality");
  }
  if (!appEl.innerHTML.includes("SYNTHETIC DEMONSTRATION DATA - NOT A REAL MUNICIPAL RECORD")) {
    fail("T16d: loaded demo state must visibly carry the canonical watermark");
  }
}

console.log("PASS: xss-and-state (T4 + T7 + T8 + T9 + T10 + T11 + T12 + T13 + T14 + T15 + T16) checks passed");
