import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const root = process.cwd();
const evidenceRoot = path.join(root, "docs", "installer", "browser-qa");
const screenshotRoot = path.join(evidenceRoot, "screenshots", "2026-05-19-clerk-core-installed-workflows");
const jsonPath = path.join(evidenceRoot, "2026-05-19-clerk-core-installed-workflows.json");
const summaryPath = path.join(evidenceRoot, "2026-05-19-clerk-core-installed-workflows.md");

const recordsWeb = process.env.TOWNLIGHT_RECORDS_WEB_URL ?? "http://127.0.0.1:18080";
const recordsApi = process.env.TOWNLIGHT_RECORDS_API_URL ?? "http://127.0.0.1:18000";
const clerkWeb = process.env.TOWNLIGHT_CLERK_WEB_URL ?? "http://127.0.0.1:18081";
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
  const secretPath = path.join(
    root,
    "installer",
    "runtime",
    "clerk-core",
    "sources",
    "townlight_records",
    "data",
    "secrets",
    "first_admin_password",
  );
  const env = parseEnv(await fs.readFile(envPath, "utf8"));
  return {
    email: env.FIRST_ADMIN_EMAIL,
    password: (await fs.readFile(secretPath, "utf8")).trim(),
  };
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
  return {
    id: check.id,
    product: check.product,
    path: new URL(check.url).pathname || "/",
    viewport: check.viewport,
    screenshot: path.relative(root, screenshot).replaceAll("\\", "/"),
    body_sample: bodyText.slice(0, 800),
    expected_copy_found: check.expectedCopy.every((copy) => bodyText.toLowerCase().includes(copy.toLowerCase())),
    expected_copy: check.expectedCopy,
    headings,
    controls: { buttons, links },
    active_element_after_tabs: activeElement,
    horizontal_overflow: horizontalOverflow,
    console_messages: normalizeMessages(consoleMessages),
    page_errors: pageErrors,
    failed_responses: failedResponses.map((entry) => ({ status: entry.status, path: new URL(entry.url).pathname })),
    status: check.allowFailures
      ? pageErrors.length === 0 && check.expectedCopy.every((copy) => bodyText.toLowerCase().includes(copy.toLowerCase()))
        ? "passed_with_expected_protected_state"
        : "failed"
      : consoleMessages.length === 0 &&
          pageErrors.length === 0 &&
          failedResponses.length === 0 &&
          !horizontalOverflow &&
          check.expectedCopy.every((copy) => bodyText.toLowerCase().includes(copy.toLowerCase()))
        ? "passed"
        : "failed",
  };
}

async function main() {
  await fs.mkdir(screenshotRoot, { recursive: true });
  const recordsCredentials = await readRecordsCredentials();
  const desktop = { width: 1440, height: 1000 };
  const mobile = { width: 390, height: 844 };
  const browser = await chromium.launch();
  const checks = [
    {
      id: "records-login-desktop",
      product: "TownlightRecords",
      url: `${recordsWeb}/`,
      viewport: desktop,
      expectedCopy: ["TownlightRecords", "Sign in"],
    },
    {
      id: "records-login-mobile",
      product: "TownlightRecords",
      url: `${recordsWeb}/`,
      viewport: mobile,
      expectedCopy: ["TownlightRecords", "Sign in"],
    },
    {
      id: "records-admin-desktop",
      product: "TownlightRecords",
      url: `${recordsWeb}/`,
      viewport: desktop,
      login: recordsCredentials,
      expectedCopy: ["TownlightRecords"],
      afterLoad: async (page) => {
        await page.waitForTimeout(1500);
      },
    },
    {
      id: "clerk-staff-desktop",
      product: "TownlightMeetings",
      url: `${clerkWeb}/staff`,
      viewport: desktop,
      headers: { Authorization: `Bearer ${clerkToken}` },
      expectedCopy: ["TownlightMeetings", "Agenda", "Packet", "Notice", "Minutes"],
    },
    {
      id: "clerk-staff-mobile",
      product: "TownlightMeetings",
      url: `${clerkWeb}/staff`,
      viewport: mobile,
      headers: { Authorization: `Bearer ${clerkToken}` },
      expectedCopy: ["TownlightMeetings", "Agenda", "Packet", "Notice", "Minutes"],
    },
    {
      id: "clerk-public-desktop",
      product: "TownlightMeetings",
      url: `${clerkWeb}/public`,
      viewport: desktop,
      expectedCopy: ["Public", "Meeting"],
    },
    {
      id: "clerk-public-mobile",
      product: "TownlightMeetings",
      url: `${clerkWeb}/public`,
      viewport: mobile,
      expectedCopy: ["Public", "Meeting"],
    },
    {
      id: "clerk-protected-error-desktop",
      product: "TownlightMeetings",
      url: `${clerkWeb}/staff`,
      viewport: desktop,
      allowFailures: true,
      expectedCopy: ["Confirm the backend is running", "verify staff auth mode", "retry"],
    },
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
  const report = {
    name: "clerk-core-installed-browser-qa",
    captured_at: new Date().toISOString(),
    baseline: "origin/main 681dda494c6c3109ddbc00e6f1170b54c0f0057b plus local TownlightMeetings docker nginx proxy fix",
    urls: { recordsWeb, recordsApi, clerkWeb },
    health,
    checks: results,
    status: results.every((result) => result.status === "passed" || result.status === "passed_with_expected_protected_state")
      ? "passed"
      : "failed",
  };
  await fs.writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  const summary = [
    "# Clerk-Core Installed Browser QA - 2026-05-19",
    "",
    `Status: ${report.status.toUpperCase()}`,
    "",
    "Scope: local Docker/browser install of TownlightRecords 1.6.1 and TownlightMeetings 1.0.1 for the Clerk-Core starter product. This is browser/user-facing QA evidence, not a claim of city production deployment or macOS lifecycle certification.",
    "",
    "## Runtime",
    "",
    `- TownlightRecords health: ${health.townlight_records.status} ${health.townlight_records.version}`,
    `- TownlightMeetings health through nginx /api proxy: ${health.townlight_meetings.status} ${health.townlight_meetings.version}`,
    "",
    "## Browser Checks",
    "",
    "| Check | Product | Viewport | Status | Screenshot |",
    "| --- | --- | --- | --- | --- |",
    ...results.map(
      (result) =>
        `| ${result.id} | ${result.product} | ${result.viewport.width}x${result.viewport.height} | ${result.status} | ${result.screenshot} |`,
    ),
    "",
    "## UX / QA Notes",
    "",
    "- Desktop and mobile widths were checked for TownlightRecords sign-in, TownlightMeetings staff workflow, and TownlightMeetings public portal.",
    "- TownlightMeetings staff was checked with bearer staff auth through the installed nginx path, proving React `/api/...` calls reach FastAPI through the Docker/browser product path.",
    "- The unauthenticated TownlightMeetings staff path intentionally renders an actionable protected-state message with fix guidance.",
    "- Keyboard focus was advanced with Tab in every checked page and recorded in the JSON evidence.",
    "- Console warnings/errors, page errors, failed responses, and horizontal overflow are recorded per check in the JSON evidence.",
    "",
  ].join("\n");
  await fs.writeFile(summaryPath, summary, "utf8");
  console.log(JSON.stringify({ status: report.status, jsonPath, summaryPath }, null, 2));
  if (report.status !== "passed") {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
