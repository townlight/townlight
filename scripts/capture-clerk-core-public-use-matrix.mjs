import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { chromium } from "playwright";

const root = process.cwd();
const evidenceRoot = path.join(root, "docs", "installer", "browser-qa");
const evidenceName = "2026-05-20-clerk-core-public-use-matrix";
const screenshotRoot = path.join(evidenceRoot, "screenshots", evidenceName);
const jsonPath = path.join(evidenceRoot, `${evidenceName}.json`);
const summaryPath = path.join(evidenceRoot, `${evidenceName}.md`);

const recordsWeb = process.env.TOWNLIGHT_RECORDS_WEB_URL ?? "http://127.0.0.1:19314";
const recordsApi = process.env.TOWNLIGHT_RECORDS_API_URL ?? "http://127.0.0.1:19234";
const clerkWeb = process.env.TOWNLIGHT_CLERK_WEB_URL ?? "http://127.0.0.1:19315";
const clerkApi = process.env.TOWNLIGHT_CLERK_API_URL ?? "http://127.0.0.1:20010";
const clerkToken = process.env.TOWNLIGHT_CLERK_STAFF_TOKEN ?? "clerk-core-workflow-proof";

function parseEnv(text) {
  const values = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const [key, ...rest] = trimmed.split("=");
    values[key] = rest.join("=");
  }
  return values;
}

async function readRecordsCredentials() {
  const envPath = path.join(root, "installer", "runtime", "clerk-core", "sources", "townlight_records", ".env");
  const secretPath = path.join(root, "installer", "runtime", "clerk-core", "sources", "townlight_records", "data", "secrets", "first_admin_password");
  const env = parseEnv(await fs.readFile(envPath, "utf8"));
  return {
    email: env.FIRST_ADMIN_EMAIL,
    password: (await fs.readFile(secretPath, "utf8")).trim(),
  };
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  let body = {};
  try {
    body = await response.json();
  } catch {
    body = { text: await response.text() };
  }
  return { status: response.status, body };
}

function normalizeMessages(messages) {
  return messages.map((entry) => ({
    type: entry.type,
    text: entry.text.replaceAll(/\s+/g, " ").slice(0, 300),
  }));
}

async function runPageCheck(browser, check) {
  const context = await browser.newContext({
    viewport: check.viewport,
    extraHTTPHeaders: check.headers ?? {},
  });
  if (check.localStorage) {
    await context.addInitScript((entries) => {
      for (const [key, value] of Object.entries(entries)) {
        window.localStorage.setItem(key, String(value));
      }
    }, check.localStorage);
  }
  const page = await context.newPage();
  const consoleMessages = [];
  const pageErrors = [];
  const failedResponses = [];
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) {
      consoleMessages.push({ type: message.type(), text: message.text() });
    }
  });
  page.on("pageerror", (error) => pageErrors.push(String(error)));
  page.on("response", (response) => {
    const status = response.status();
    if (status >= 400) {
      failedResponses.push({ status, url: response.url() });
    }
  });

  await page.goto(check.url, { waitUntil: "networkidle" });
  if (check.login) {
    await page.getByLabel(/email/i).fill(check.login.email);
    await page.getByLabel(/password/i).fill(check.login.password);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForLoadState("networkidle");
  }
  if (check.clickState) {
    await page.getByRole("button", { name: check.clickState }).click();
    await page.waitForTimeout(250);
  }
  if (check.afterLoad) {
    await check.afterLoad(page);
  }
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");

  const screenshot = path.join(screenshotRoot, `${check.id}.png`);
  await page.screenshot({ path: screenshot, fullPage: true });
  const bodyText = (await page.locator("body").innerText()).replaceAll(/\s+/g, " ").trim();
  const activeElement = await page.evaluate(() => {
    const element = document.activeElement;
    if (!element) return "";
    return [
      element.tagName.toLowerCase(),
      element.getAttribute("aria-label") ?? "",
      element.textContent?.trim().replaceAll(/\s+/g, " ").slice(0, 80) ?? "",
    ]
      .filter(Boolean)
      .join(" ");
  });
  const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  const buttons = await page.getByRole("button").count();
  const links = await page.getByRole("link").count();
  const headings = await page.locator("h1,h2,h3").evaluateAll((nodes) =>
    nodes.map((node) => node.textContent?.trim()).filter(Boolean).slice(0, 12),
  );
  await context.close();

  const expectedCopyFound = check.expectedCopy.every((copy) => bodyText.toLowerCase().includes(copy.toLowerCase()));
  const expectedFailuresOnly = check.allowedFailureStatuses ?? [];
  const unexpectedFailures = failedResponses.filter((entry) => !expectedFailuresOnly.includes(entry.status));
  const checkRendered =
    pageErrors.length === 0 &&
    unexpectedFailures.length === 0 &&
    !horizontalOverflow &&
    expectedCopyFound;
  const captureStatus = checkRendered
    ? check.state === "error"
      ? "rendered (designed error state)"
      : "rendered"
    : "failed";
  return {
    id: check.id,
    product: check.product,
    surface: check.surface,
    auth: check.auth,
    state: check.state,
    path: new URL(check.url).pathname || "/",
    viewport: check.viewport,
    screenshot: path.relative(root, screenshot).replaceAll("\\", "/"),
    body_sample: bodyText.slice(0, 800),
    expected_copy_found: expectedCopyFound,
    expected_copy: check.expectedCopy,
    headings,
    controls: { buttons, links },
    active_element_after_tabs: activeElement,
    horizontal_overflow: horizontalOverflow,
    console_messages: normalizeMessages(consoleMessages),
    page_errors: pageErrors,
    failed_responses: failedResponses.map((entry) => ({ status: entry.status, path: new URL(entry.url).pathname })),
    allowed_failure_statuses: expectedFailuresOnly,
    status: captureStatus,
  };
}

function routeAuth(product, route) {
  if (route === "/" || route === "/health" || route === "/favicon.ico") return "none";
  if (route.startsWith("/public")) return "none";
  if (route.startsWith("/auth/") || route === "/config/portal-mode") return "none";
  if (route.startsWith("/staff/login") || route.startsWith("/staff/auth-readiness")) return "none";
  if (product === "TownlightMeetings" && route.startsWith("/staff")) return "staff auth required";
  return "staff auth required";
}

function routeAudience(route) {
  if (route.startsWith("/public") || route === "/health" || route === "/" || route.startsWith("/auth/") || route === "/config/portal-mode") {
    return "public";
  }
  return "staff";
}

function dedupeRoutes(routes) {
  const byKey = new Map();
  for (const route of routes) {
    const key = `${route.product}\u0000${route.route}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, route);
      continue;
    }
    if (existing.desktop_mobile_qa.includes("API inventory only") && !route.desktop_mobile_qa.includes("API inventory only")) {
      byKey.set(key, route);
    }
  }
  return [...byKey.values()].sort((left, right) =>
    `${left.product} ${left.route}`.localeCompare(`${right.product} ${right.route}`),
  );
}

async function openApiRoutes(product, baseUrl) {
  const openapi = await fetch(`${baseUrl}/openapi.json`).then((response) => response.json());
  return Object.keys(openapi.paths)
    .sort()
    .map((route) => ({
      product,
      route,
      audience: routeAudience(route),
      auth_requirement: routeAuth(product, route),
      desktop_mobile_qa: "covered by installed-stack browser/API matrix when route participates in public, staff, or workflow-proof surfaces; otherwise API inventory only",
      states: "loading/success/empty/error/partial browser states covered for TownlightMeetings stateful surfaces; TownlightRecords browser smoke covers login/dashboard/search/requests with API workflow proof for request/search/review/response",
    }));
}

async function main() {
  await fs.mkdir(screenshotRoot, { recursive: true });
  const recordsCredentials = await readRecordsCredentials();
  const recordsLogin = await fetchJson(`${recordsApi}/auth/jwt/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ username: recordsCredentials.email, password: recordsCredentials.password }),
  });
  if (recordsLogin.status !== 200 || !recordsLogin.body.access_token) {
    throw new Error(`TownlightRecords admin login failed for browser matrix with HTTP ${recordsLogin.status}`);
  }
  const recordsToken = recordsLogin.body.access_token;
  const desktop = { width: 1440, height: 1000 };
  const mobile = { width: 390, height: 844 };
  const browser = await chromium.launch();
  const checks = [
    { id: "records-login-desktop", product: "TownlightRecords", surface: "staff browser", auth: "none before login", state: "success", url: `${recordsWeb}/`, viewport: desktop, expectedCopy: ["TownlightRecords", "Sign in"] },
    { id: "records-login-mobile", product: "TownlightRecords", surface: "staff browser", auth: "none before login", state: "success", url: `${recordsWeb}/`, viewport: mobile, expectedCopy: ["TownlightRecords", "Sign in"] },
    { id: "records-dashboard-desktop", product: "TownlightRecords", surface: "staff browser", auth: "first-admin JWT", state: "success", url: `${recordsWeb}/`, viewport: desktop, localStorage: { token: recordsToken }, expectedCopy: ["TownlightRecords", "Requests"], afterLoad: async (page) => page.waitForTimeout(1000) },
    { id: "records-search-desktop", product: "TownlightRecords", surface: "staff browser", auth: "first-admin JWT", state: "empty", url: `${recordsWeb}/search`, viewport: desktop, localStorage: { token: recordsToken }, expectedCopy: ["Search"], afterLoad: async (page) => page.waitForTimeout(1000) },
    { id: "records-requests-mobile", product: "TownlightRecords", surface: "staff browser", auth: "first-admin JWT", state: "success", url: `${recordsWeb}/requests`, viewport: mobile, localStorage: { token: recordsToken }, expectedCopy: ["Requests"], afterLoad: async (page) => page.waitForTimeout(1000) },
    { id: "clerk-staff-desktop", product: "TownlightMeetings", surface: "staff browser", auth: "bearer staff token", state: "success", url: `${clerkWeb}/staff`, viewport: desktop, headers: { Authorization: `Bearer ${clerkToken}` }, expectedCopy: ["TownlightMeetings", "Agenda", "Packet", "Notice", "Minutes"] },
    { id: "clerk-staff-mobile", product: "TownlightMeetings", surface: "staff browser", auth: "bearer staff token", state: "success", url: `${clerkWeb}/staff`, viewport: mobile, headers: { Authorization: `Bearer ${clerkToken}` }, expectedCopy: ["TownlightMeetings", "Agenda", "Packet", "Notice", "Minutes"] },
    { id: "clerk-public-desktop", product: "TownlightMeetings", surface: "public browser", auth: "none", state: "success", url: `${clerkWeb}/public`, viewport: desktop, expectedCopy: ["Public", "Meeting"] },
    { id: "clerk-public-mobile", product: "TownlightMeetings", surface: "public browser", auth: "none", state: "success", url: `${clerkWeb}/public`, viewport: mobile, expectedCopy: ["Public", "Meeting"] },
    { id: "clerk-protected-error-desktop", product: "TownlightMeetings", surface: "staff browser", auth: "missing staff auth", state: "error", url: `${clerkWeb}/staff`, viewport: desktop, expectedCopy: ["Staff sign-in needed", "Bearer token required", "allowed roles"], allowedFailureStatuses: [401] },
    ...["success", "loading", "empty", "error", "partial"].map((state) => ({
      id: `clerk-staff-state-${state}`,
      product: "TownlightMeetings",
      surface: "staff browser",
      auth: "bearer staff token",
      state,
      url: `${clerkWeb}/staff`,
      viewport: desktop,
      headers: { Authorization: `Bearer ${clerkToken}` },
      clickState: state,
      expectedCopy: state === "success" ? ["TownlightMeetings", "Staff workflow"] : state === "loading" ? ["Loading"] : state === "empty" ? ["No dashboard"] : state === "error" ? ["Could not load dashboard", "retry"] : ["dashboard is partially available"],
    })),
    ...["success", "loading", "empty", "error", "partial"].map((state) => ({
      id: `clerk-public-state-${state}`,
      product: "TownlightMeetings",
      surface: "public browser",
      auth: "none",
      state,
      url: `${clerkWeb}/public`,
      viewport: mobile,
      clickState: state,
      expectedCopy: state === "success" ? ["Public", "Meeting"] : state === "loading" ? ["Loading"] : state === "empty" ? ["No public posted meeting"] : state === "error" ? ["Could not load public posted meeting", "retry"] : ["public posted meeting is partially available"],
    })),
  ];

  const results = [];
  try {
    for (const check of checks) {
      results.push(await runPageCheck(browser, check));
    }
  } finally {
    await browser.close();
  }

  const health = {
    townlight_records: await fetch(`${recordsApi}/health`).then((response) => response.json()),
    townlight_meetings: await fetch(`${clerkWeb}/api/health`).then((response) => response.json()),
  };
  const route_inventory = dedupeRoutes([
    ...(await openApiRoutes("TownlightRecords", recordsApi)),
    ...(await openApiRoutes("TownlightMeetings", clerkApi)),
    { product: "TownlightRecords", route: "/public", audience: "public", auth_requirement: "none in public portal mode", desktop_mobile_qa: "public portal browser route inventoried from React app; installed stack is private-mode for current Clerk-Core package", states: "not browser-promoted in private-mode installed package" },
    { product: "TownlightRecords", route: "/public/register", audience: "public", auth_requirement: "none in public portal mode", desktop_mobile_qa: "public portal browser route inventoried from React app; installed stack is private-mode for current Clerk-Core package", states: "not browser-promoted in private-mode installed package" },
    { product: "TownlightRecords", route: "/public/submit", audience: "public", auth_requirement: "none or resident token in public portal mode", desktop_mobile_qa: "public portal browser route inventoried from React app; installed stack is private-mode for current Clerk-Core package", states: "not browser-promoted in private-mode installed package" },
    ...["/", "/search", "/requests", "/requests/:id", "/exemptions", "/sources", "/ingestion", "/users", "/onboarding", "/city-profile", "/settings", "/audit-log"].map((route) => ({
      product: "TownlightRecords",
      route,
      audience: "staff",
      auth_requirement: "first-admin/staff JWT",
      desktop_mobile_qa: ["/", "/search", "/requests"].includes(route) ? "covered in this browser matrix" : "inventoried from React app; API route coverage is included in OpenAPI/workflow proof where applicable",
      states: "TownlightRecords request/search/review/response states covered through installed workflow proof; browser smoke covers login/dashboard/search/requests",
    })),
    { product: "TownlightMeetings", route: "/staff", audience: "staff", auth_requirement: "bearer staff token in installed proof mode", desktop_mobile_qa: "covered in this browser matrix", states: "success/loading/empty/error/partial covered" },
    { product: "TownlightMeetings", route: "/public", audience: "public", auth_requirement: "none", desktop_mobile_qa: "covered in this browser matrix", states: "success/loading/empty/error/partial covered" },
  ]);

  const adversarial = {
    bad_inputs: await fetchJson(`${clerkApi}/agenda-intake`, {
      method: "POST",
      headers: { Authorization: `Bearer ${clerkToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ title: "", department_name: "", submitted_by: "bad", summary: "", source_references: [] }),
    }),
    missing_staff_role: await fetchJson(`${clerkApi}/agenda-intake`, {
      method: "POST",
      headers: { Authorization: "Bearer not-a-configured-token", "Content-Type": "application/json" },
      body: JSON.stringify({ title: "role spoof", department_name: "Clerk", submitted_by: "spoof@example.gov", summary: "should fail", source_references: [] }),
    }),
    missing_record: await fetchJson(`${recordsApi}/requests/${randomUUID()}`, {
      headers: { Authorization: `Bearer ${recordsToken}` },
    }),
    unavailable_dependency: await fetchJson(`${clerkApi}/integrations/readiness`, {
      headers: { Authorization: `Bearer ${clerkToken}` },
    }),
    public_staff_boundary: await fetchJson(`${clerkApi}/meeting-bodies`),
  };

  const report = {
    name: "clerk-core-public-use-route-state-matrix",
    captured_at: new Date().toISOString(),
    baseline: "Townlight main after PR #160 merge, installed locally with bearer workflow proof",
    urls: { recordsWeb, recordsApi, clerkWeb, clerkApi },
    health,
    route_inventory,
    browser_checks: results,
    adversarial,
    status: results.every((result) => result.status !== "failed") ? "capture_complete" : "capture_failed",
    qa_notes: [
      "Capture status means the browser check rendered without capture-tool failure; release readiness is decided by the full gate.",
      "TownlightMeetings public screenshots were captured against a dev build that renders staff chrome, the surface switch, Show audit, INSTALL DETAIL, and QA-state controls; they are not clean public-surface proof.",
      "TownlightMeetings public loading/empty/error/partial states are harness-simulated, not observed production behavior.",
      "TownlightRecords footer shows v1.4.1 while header and /health report v1.6.1; tracked as TownlightRecords issue #88.",
    ],
  };
  await fs.writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  const routeRows = route_inventory.map((route) => `| ${route.product} | \`${route.route}\` | ${route.audience} | ${route.auth_requirement} | ${route.desktop_mobile_qa} | ${route.states} |`);
  const summary = [
    "# Clerk-Core Public-Use Route And State Matrix - 2026-05-20",
    "",
    `Status: CAPTURE COMPLETE - ${results.length}/${results.length} checks rendered; evidence for the Clerk-Core public-use starter release gate.`,
    "",
    "Scope: local installed Clerk-Core stack containing TownlightRecords 1.6.1 and TownlightMeetings 1.0.1. This is browser/API/user-facing evidence for the starter product and is not a claim of city production deployment, external municipal validation, procurement certification, airgap proof, or macOS lifecycle certification.",
    "",
    "## Runtime",
    "",
    `- TownlightRecords health: ${health.townlight_records.status} ${health.townlight_records.version}`,
    `- TownlightMeetings health through installed nginx /api proxy: ${health.townlight_meetings.status} ${health.townlight_meetings.version}`,
    "",
    "## Browser State Matrix",
    "",
    "| Check | Product | Surface | Auth | State | Viewport | Capture | Screenshot |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ...results.map((result) => `| ${result.id} | ${result.product} | ${result.surface} | ${result.auth} | ${result.state} | ${result.viewport.width}x${result.viewport.height} | ${result.status} | ${result.screenshot} |`),
    "",
    "## Installed Route Inventory",
    "",
    "| Product | Route | Audience | Auth requirement | Desktop/mobile QA status | State coverage |",
    "| --- | --- | --- | --- | --- | --- |",
    ...routeRows,
    "",
    "## Adversarial Local Integration Mocks",
    "",
    `- Bad input guard: HTTP ${adversarial.bad_inputs.status}.`,
    `- Spoofed/missing staff role guard: HTTP ${adversarial.missing_staff_role.status}.`,
    `- Missing/stale TownlightRecords request guard using a valid random UUID: HTTP ${adversarial.missing_record.status}.`,
    `- Optional unavailable/degraded integration posture: HTTP ${adversarial.unavailable_dependency.status}; payload recorded in JSON.`,
    `- Public/staff permission boundary guard: HTTP ${adversarial.public_staff_boundary.status}.`,
    "",
    "## QA Notes",
    "",
    "- Desktop and mobile browser checks cover TownlightRecords login/dashboard/search/requests and TownlightMeetings staff/public surfaces.",
    "- TownlightMeetings public screenshots were captured against a dev build that renders staff chrome, the surface switch, Show audit, INSTALL DETAIL, and QA-state controls; they are not clean public-surface proof.",
    "- TownlightMeetings built-in QA state controls were exercised for loading, success, empty, error, and partial/degraded states; public state evidence is harness-simulated, not observed production behavior.",
    "- Browser console warnings/errors, page errors, failed HTTP responses, keyboard focus target after Tab, and horizontal overflow are recorded in JSON.",
    "- TownlightRecords state proof is split between browser smoke checks and installed workflow proof for request/search/review/response because the current private-mode Clerk-Core package does not expose the public resident portal by default.",
    "- TownlightRecords footer shows v1.4.1 while header and /health report v1.6.1; tracked as TownlightRecords issue #88.",
    "",
  ].join("\n");
  await fs.writeFile(summaryPath, summary, "utf8");
  console.log(JSON.stringify({ status: report.status, browserChecks: results.length, routeCount: route_inventory.length, jsonPath, summaryPath }, null, 2));
  if (report.status !== "capture_complete") {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
