import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";

const outputRoot = path.resolve(
  "docs",
  "installer",
  "browser-qa",
  "screenshots",
  "2026-05-23-city-core-installer"
);
const summaryPath = path.resolve(
  "docs",
  "installer",
  "browser-qa",
  "2026-05-23-city-core-installer-matrix.json"
);

const targets = [
  {
    id: "records-admin",
    url: process.env.CITY_CORE_RECORDS_URL || "http://127.0.0.1:19000/",
    expected: "TownlightRecords",
  },
  {
    id: "clerk-public",
    url: process.env.CITY_CORE_CLERK_URL || "http://127.0.0.1:19001/public",
    expected: "RESIDENT PUBLIC PORTAL",
  },
  {
    id: "code-public-search",
    url:
      process.env.CITY_CORE_CODE_URL ||
      "http://127.0.0.1:19740/townlight_code/search?q=13.40.020",
    expected: "Backyard Livestock",
  },
];

const viewports = [
  { id: "desktop", width: 1440, height: 1000 },
  { id: "mobile", width: 390, height: 900 },
];

await fs.mkdir(outputRoot, { recursive: true });
const browser = await chromium.launch();
const results = [];

try {
  for (const target of targets) {
    for (const viewport of viewports) {
      const page = await browser.newPage({ viewport });
      const consoleEvents = [];
      page.on("console", (message) => {
        if (["error", "warning"].includes(message.type())) {
          consoleEvents.push({ type: message.type(), text: message.text() });
        }
      });
      const response = await page.goto(target.url, {
        waitUntil: "networkidle",
        timeout: 30000,
      });
      const bodyText = await page.locator("body").innerText({ timeout: 10000 });
      const screenshot = path.join(outputRoot, `${target.id}-${viewport.id}.png`);
      await page.screenshot({ path: screenshot, fullPage: true });
      results.push({
        id: target.id,
        viewport: viewport.id,
        url: target.url,
        status: response?.status() ?? null,
        expected_text_present: bodyText.includes(target.expected),
        console_events: consoleEvents,
        screenshot: path.relative(process.cwd(), screenshot).replaceAll("\\", "/"),
      });
      await page.close();
    }
  }
} finally {
  await browser.close();
}

const failed = results.filter(
  (result) =>
    result.status !== 200 ||
    !result.expected_text_present ||
    result.console_events.some((event) => event.type === "error")
);

const payload = {
  run_id: "local-city-core-browser-qa",
  captured_at: new Date().toISOString(),
  status: failed.length === 0 ? "passed" : "failed",
  viewports,
  results,
};

await fs.writeFile(summaryPath, `${JSON.stringify(payload, null, 2)}\n`);
console.log(JSON.stringify(payload, null, 2));
process.exit(failed.length === 0 ? 0 : 1);
