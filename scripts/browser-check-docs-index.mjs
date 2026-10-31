import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync } from "node:fs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const target = `file://${path.join(root, "docs", "index.html").replaceAll("\\", "/")}`;
const outputDir = path.join(root, "docs", "audit-browser-qa");
mkdirSync(outputDir, { recursive: true });

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
      .getByRole("heading", { name: "Municipal work with a clear record." })
      .isVisible();
    const candidateStatusVisible = await page
      .locator('a[href="https://github.com/townlight/townlight/releases/tag/townlight-beta-1-station-delivery"]').first()
      .isVisible();
    const productModulesVisible = await Promise.all(
      ["Core", "Records", "Meetings", "Code", "Zoning", "Planning", "Permitting", "Inspections", "Station"].map((name) =>
        page.locator(".product h3").getByRole("link", { name, exact: true }).isVisible(),
      ),
    );
    const productLinks = await page.locator(".product h3 a").evaluateAll((nodes) => nodes.map((node) => node.href));
    const expectedProductLinks = ["core", "records", "meetings", "code", "zoning", "planning", "permitting", "inspections", "station"]
      .map((slug) => `/products/${slug}/index.html`);
    const productLinksCorrect = productLinks.length === expectedProductLinks.length &&
      expectedProductLinks.every((link, index) => productLinks[index].endsWith(link));
    const currentDownloadLinked = await page.locator('a[href="https://github.com/townlight/townlight/releases/tag/townlight-beta-1-station-delivery"]').first()
      .getAttribute("href") === "https://github.com/townlight/townlight/releases/tag/townlight-beta-1-station-delivery";
    const overallManualVisible = await page.locator('a[href$="manuals/suite.html"]').first().isVisible();
    const horizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    await page.keyboard.press("Tab");
    const focusedText = await page.evaluate(() => document.activeElement?.textContent?.trim() ?? "");
    const screenshot = path.join(outputDir, `townlight-beta-1-${viewport.name}.png`);
    const screenshotResult = await captureScreenshot(page, screenshot);

    results.push({
      viewport: viewport.name,
      status: response?.status() ?? null,
      title,
      recordsHeadingVisible,
      candidateStatusVisible,
      productModulesVisible,
      productLinksCorrect,
      currentDownloadLinked,
      overallManualVisible,
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
    result.title !== "Townlight | Townlight Beta 1" ||
    !result.recordsHeadingVisible ||
    !result.candidateStatusVisible ||
    result.productModulesVisible.some((visible) => !visible) ||
    !result.productLinksCorrect ||
    !result.currentDownloadLinked ||
    !result.overallManualVisible ||
    result.horizontalOverflow ||
    result.focusedText !== "Skip to content" ||
    result.consoleMessages.length > 0,
);

console.log(JSON.stringify({ target, results }, null, 2));
if (failed) {
  process.exit(1);
}
