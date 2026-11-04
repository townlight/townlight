import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const outputDir = resolve(
  process.argv[2] ||
    ".agent-runs/2026-05-28-city-core-real-non-technical-release/evidence/accessibility",
);

const targets = [
  { name: "suite-launcher", url: "http://127.0.0.1:4179/" },
  { name: "records-ai", url: "http://127.0.0.1:4173/" },
  { name: "townlight_meetings", url: "http://127.0.0.1:4180/" },
  { name: "townlight_code", url: "http://127.0.0.1:5174/townlight_code/app/" },
];

function loadPlaywright() {
  const candidates = [
    "../townlight_records/frontend/package.json",
    "../townlight_meetings/frontend/package.json",
  ];
  for (const candidate of candidates) {
    try {
      const require = createRequire(pathToFileURL(resolve(candidate)).href);
      return require("playwright");
    } catch {
      // Try the next module tree.
    }
  }
  throw new Error("Could not load playwright from Records AI or TownlightMeetings node_modules.");
}

const { chromium } = loadPlaywright();

function describeElement(element) {
  if (!element) return "none";
  return [
    element.tagName.toLowerCase(),
    element.id ? `#${element.id}` : "",
    element.getAttribute("role") ? `[role=${element.getAttribute("role")}]` : "",
    element.getAttribute("aria-label") ? `[aria-label=${element.getAttribute("aria-label")}]` : "",
    element.name ? `[name=${element.name}]` : "",
    element.type ? `[type=${element.type}]` : "",
    element.textContent?.trim() ? `text="${element.textContent.trim().replace(/\s+/g, " ").slice(0, 90)}"` : "",
  ]
    .filter(Boolean)
    .join("");
}

async function summarizeMotion(page) {
  return page.evaluate(() => {
    const elements = Array.from(document.querySelectorAll("*"));
    const moving = elements
      .map((element) => {
        const style = window.getComputedStyle(element);
        return {
          element:
            element.tagName.toLowerCase() +
            (element.id ? `#${element.id}` : "") +
            (element.className && typeof element.className === "string"
              ? `.${element.className.trim().split(/\s+/).slice(0, 3).join(".")}`
              : ""),
          animationDuration: style.animationDuration,
          animationName: style.animationName,
          transitionDuration: style.transitionDuration,
        };
      })
      .filter((item) => {
        const hasNamedAnimation = item.animationName !== "none";
        const hasTransition = !["0s", "0ms"].includes(item.transitionDuration);
        return hasNamedAnimation || hasTransition;
      })
      .slice(0, 20);

    return {
      prefersReducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      sampledAnimatedOrTransitionedElements: moving,
    };
  });
}

async function probeTarget(browser, target) {
  const context = await browser.newContext({
    viewport: { width: 1366, height: 900 },
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  const consoleMessages = [];
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) {
      consoleMessages.push({ type: message.type(), text: message.text() });
    }
  });

  try {
    const response = await page.goto(target.url, { waitUntil: "domcontentloaded", timeout: 15000 });
    await page.waitForTimeout(1000);
    const traversal = [];
    for (let index = 0; index < 18; index += 1) {
      await page.keyboard.press("Tab");
      traversal.push(
        await page.evaluate((step) => {
          const element = document.activeElement;
          const rect = element?.getBoundingClientRect();
          return {
            step,
            descriptor: describeElementForPage(element),
            visible:
              !!rect &&
              rect.width > 0 &&
              rect.height > 0 &&
              rect.bottom >= 0 &&
              rect.right >= 0 &&
              rect.top <= window.innerHeight &&
              rect.left <= window.innerWidth,
          };

          function describeElementForPage(activeElement) {
            if (!activeElement) return "none";
            return [
              activeElement.tagName.toLowerCase(),
              activeElement.id ? `#${activeElement.id}` : "",
              activeElement.getAttribute("role")
                ? `[role=${activeElement.getAttribute("role")}]`
                : "",
              activeElement.getAttribute("aria-label")
                ? `[aria-label=${activeElement.getAttribute("aria-label")}]`
                : "",
              activeElement.name ? `[name=${activeElement.name}]` : "",
              activeElement.type ? `[type=${activeElement.type}]` : "",
              activeElement.textContent?.trim()
                ? `text="${activeElement.textContent.trim().replace(/\s+/g, " ").slice(0, 90)}"`
                : "",
            ]
              .filter(Boolean)
              .join("");
          }
        }, index + 1),
      );
    }
    const motion = await summarizeMotion(page);
    await context.close();
    return {
      ...target,
      status: "probed",
      httpStatus: response?.status() ?? null,
      traversal,
      motion,
      consoleMessages,
    };
  } catch (error) {
    await context.close();
    return {
      ...target,
      status: "unavailable",
      error: error.message,
      traversal: [],
      motion: null,
      consoleMessages,
    };
  }
}

function renderTraversal(results) {
  const lines = [
    "# M3 Tab Traversal Notes",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "Scope: Playwright desktop focus traversal with `prefers-reduced-motion: reduce` enabled. This is evidence of the sampled current local surfaces only, not a complete keyboard accessibility certification.",
    "",
  ];

  for (const result of results) {
    lines.push(`## ${result.name}`);
    lines.push("");
    lines.push(`- URL: ${result.url}`);
    lines.push(`- Status: ${result.status}${result.httpStatus ? ` (HTTP ${result.httpStatus})` : ""}`);
    if (result.error) lines.push(`- Error: ${compact(result.error)}`);
    if (result.consoleMessages.length) {
      lines.push(`- Console warnings/errors captured: ${result.consoleMessages.length}`);
    }
    if (result.traversal.length) {
      lines.push("");
      lines.push("| Step | Focused element | Visible in viewport |");
      lines.push("| ---: | --- | --- |");
      for (const item of result.traversal) {
        lines.push(`| ${item.step} | \`${item.descriptor || "none"}\` | ${item.visible ? "yes" : "no"} |`);
      }
    }
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

function compact(text) {
  return String(text || "")
    .replace(/\u001b\[[0-9;]*m/g, "")
    .replace(/\s+/g, " ")
    .replace(/\|/g, "\\|")
    .trim();
}

function renderMotion(results) {
  const lines = [
    "# M3 Reduced-Motion Notes",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "Scope: Playwright browser context with `reducedMotion: reduce`. The `prefers-reduced-motion` media query was checked and a small sample of elements with CSS animations or transitions was recorded. This does not prove every animation path is compliant.",
    "",
    "| Surface | URL | Target reachable | Media query matched | Sampled animated/transitioned elements | Notes |",
    "| --- | --- | --- | --- | ---: | --- |",
  ];

  for (const result of results) {
    if (!result.motion) {
      lines.push(
        `| ${result.name} | ${result.url} | no | n/a | 0 | ${compact(result.error) || "Target unavailable"} |`,
      );
      continue;
    }
    const count = result.motion.sampledAnimatedOrTransitionedElements.length;
    lines.push(
      `| ${result.name} | ${result.url} | yes | ${result.motion.prefersReducedMotion ? "yes" : "no"} | ${count} | ${count ? "Transitions/animations still exist in computed styles; manual review required for motion impact." : "No sampled animations/transitions reported."} |`,
    );
  }

  lines.push("");
  lines.push("## Sampled Motion Details");
  lines.push("");
  for (const result of results.filter((item) => item.motion)) {
    lines.push(`### ${result.name}`);
    lines.push("");
    if (!result.motion.sampledAnimatedOrTransitionedElements.length) {
      lines.push("- No sampled animated or transitioned elements.");
    } else {
      for (const item of result.motion.sampledAnimatedOrTransitionedElements) {
        lines.push(
          `- \`${item.element}\`: animation \`${item.animationName}\` / \`${item.animationDuration}\`; transition \`${item.transitionDuration}\``,
        );
      }
    }
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

mkdirSync(outputDir, { recursive: true });
const browser = await chromium.launch();
const results = [];
for (const target of targets) {
  results.push(await probeTarget(browser, target));
}
await browser.close();

writeFileSync(resolve(outputDir, "accessibility-probe.json"), JSON.stringify(results, null, 2), "utf8");
writeFileSync(resolve(outputDir, "tab-traversal.md"), renderTraversal(results), "utf8");
writeFileSync(resolve(outputDir, "reduced-motion.md"), renderMotion(results), "utf8");
console.log(resolve(outputDir, "tab-traversal.md"));
console.log(resolve(outputDir, "reduced-motion.md"));
