import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const target = `file://${path.join(root, "docs", "index.html").replaceAll("\\", "/")}`;
const outputDir = path.join(root, "docs", "audit-browser-qa");

const viewports = [
  { name: "desktop", width: 1440, height: 1000 },
  { name: "mobile", width: 390, height: 844 },
];

const browser = await chromium.launch({ channel: process.env.TOWNLIGHT_BROWSER_CHANNEL || undefined });
const results = [];

async function captureScreenshot(page, screenshot) {
  const attempts = [
    { path: screenshot, fullPage: true },
    { path: screenshot, fullPage: false },
  ];
  let lastError = null;
  for (const options of attempts) {
    try {
      await page.screenshot(options);
      return { screenshot, screenshotCaptured: true, screenshotError: null };
    } catch (error) {
      lastError = error;
      await page.waitForTimeout(250);
    }
  }
  return {
    screenshot,
    screenshotCaptured: false,
    screenshotError: lastError?.message ?? "Unknown screenshot failure",
  };
}

try {
  for (const viewport of viewports) {
    const page = await browser.newPage({ viewport });
    const consoleMessages = [];
    page.on("console", (message) => {
      if (["error", "warning"].includes(message.type())) {
        consoleMessages.push(`${message.type()}: ${message.text()}`);
      }
    });

    const response = await page.goto(target, { waitUntil: "load" });
    const title = await page.title();
    const recordsHeadingVisible = await page
      .getByRole("heading", { name: "Public-records work that stays accountable and stays local." })
      .isVisible();
    const candidateStatusVisible = await page
      .getByText("1.1.0-beta.2 rc.3 · not published", { exact: true })
      .isVisible();
    const productModulesVisible = await Promise.all(
      ["Townlight Core", "Townlight Records", "Townlight Notice", "Townlight Access"].map((name) =>
        page.locator(".m-name a", { hasText: name }).first().isVisible(),
      ),
    );
    const horizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    await page.keyboard.press("Tab");
    const focusedText = await page.evaluate(() => document.activeElement?.textContent?.trim() ?? "");
    const screenshot = path.join(outputDir, `townlight-records-beta-${viewport.name}.png`);
    const screenshotResult = await captureScreenshot(page, screenshot);

    results.push({
      viewport: viewport.name,
      status: response?.status() ?? null,
      title,
      recordsHeadingVisible,
      candidateStatusVisible,
      productModulesVisible,
      horizontalOverflow,
      focusedText,
      consoleMessages,
      ...screenshotResult,
    });

    await page.close();
  }
} finally {
  await browser.close();
}

const failed = results.some(
  (result) =>
    result.status !== 200 ||
    result.title !== "Townlight Records | local-first municipal public records" ||
    !result.recordsHeadingVisible ||
    !result.candidateStatusVisible ||
    result.productModulesVisible.some((visible) => !visible) ||
    result.horizontalOverflow ||
    result.focusedText !== "Skip to main content" ||
    result.consoleMessages.length > 0,
);

console.log(JSON.stringify({ target, results }, null, 2));
if (failed) {
  process.exit(1);
}
