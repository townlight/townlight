import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const outputPath = process.argv[2];

if (!outputPath) {
  console.error("Usage: node scripts/contrast-calc.mjs <output-markdown-path>");
  process.exit(2);
}

const tokens = {
  "--paper": "#faf8f3",
  "--paper-2": "#f3efe5",
  "--paper-3": "#ebe5d6",
  "--card": "#ffffff",
  "--rule": "#8d8064",
  "--rule-strong": "#70654e",
  "--ink": "#1a2330",
  "--ink-2": "#3a4554",
  "--ink-3": "#6b7280",
  "--ink-4": "#667085",
  "--navy": "#1a3a52",
  "--navy-2": "#122a3d",
  "--navy-soft": "#e6edf3",
  "--gold": "#7a5a17",
  "--gold-2": "#6f4f10",
  "--gold-soft": "#f5edd6",
  "--ok": "#2f6b3a",
  "--ok-soft": "#e0ecdf",
  "--warn": "#8a5a14",
  "--warn-soft": "#f5e6c5",
  "--err": "#8a2a2a",
  "--err-soft": "#f1d9d9",
  "--info": "#1f4a6b",
  "--info-soft": "#dde7ee",
  "--white": "#ffffff",
};

const samples = [
  ["Primary body", "--ink", "--paper", "normal text"],
  ["Body on alternate surface", "--ink", "--paper-2", "normal text"],
  ["Body on card", "--ink", "--card", "normal text"],
  ["Secondary text", "--ink-2", "--paper", "normal text"],
  ["Tertiary metadata", "--ink-3", "--paper", "normal text"],
  ["Muted metadata", "--ink-4", "--paper", "normal text"],
  ["Navy action text", "--navy", "--paper", "normal text"],
  ["Navy on white", "--navy", "--card", "normal text"],
  ["White on navy", "--white", "--navy", "normal text"],
  ["Gold-soft seal text on navy", "--gold-soft", "--navy", "normal text"],
  ["Navy on navy-soft badge", "--navy", "--navy-soft", "normal text"],
  ["Gold-2 on gold-soft badge", "--gold-2", "--gold-soft", "normal text"],
  ["Gold accent on paper", "--gold", "--paper", "normal text"],
  ["White on gold", "--white", "--gold", "normal text"],
  ["OK status", "--ok", "--ok-soft", "normal text"],
  ["Warning status", "--warn", "--warn-soft", "normal text"],
  ["Error status", "--err", "--err-soft", "normal text"],
  ["Info status", "--info", "--info-soft", "normal text"],
  ["Rule against paper", "--rule", "--paper", "non-text boundary"],
  ["Strong rule against paper", "--rule-strong", "--paper", "non-text boundary"],
];

function channelToLinear(channel) {
  const value = channel / 255;
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function rgb(hex) {
  const normalized = hex.replace("#", "");
  return [
    Number.parseInt(normalized.slice(0, 2), 16),
    Number.parseInt(normalized.slice(2, 4), 16),
    Number.parseInt(normalized.slice(4, 6), 16),
  ];
}

function luminance(hex) {
  const [r, g, b] = rgb(hex).map(channelToLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(foreground, background) {
  const light = Math.max(luminance(foreground), luminance(background));
  const dark = Math.min(luminance(foreground), luminance(background));
  return (light + 0.05) / (dark + 0.05);
}

function verdict(ratio, use) {
  const threshold = use === "non-text boundary" ? 3 : 4.5;
  return ratio >= threshold ? "Meets sampled threshold" : "Below sampled threshold";
}

const rows = samples.map(([label, fgName, bgName, use]) => {
  const ratio = contrast(tokens[fgName], tokens[bgName]);
  return {
    label,
    fgName,
    fg: tokens[fgName],
    bgName,
    bg: tokens[bgName],
    use,
    ratio,
    verdict: verdict(ratio, use),
  };
});

const lines = [
  "# M3 Static Contrast Table",
  "",
  `Generated: ${new Date().toISOString()}`,
  "",
  "Scope: static WCAG 2.x contrast-ratio samples for the prototype token combinations named in the run research/plan: `--paper`, `--paper-2`, `--rule`, `--navy`, `--gold`, `--ink-*`, and related status/soft tokens used by the current launcher prototype. This is token math only; it is not a live rendered WCAG pass.",
  "",
  "Thresholds used: 4.5:1 for sampled normal text and 3:1 for sampled non-text boundaries. Large-text-only acceptability is not claimed here.",
  "",
  "| Sample | Foreground | Background | Use | Ratio | Result |",
  "| --- | --- | --- | --- | ---: | --- |",
  ...rows.map(
    (row) =>
      `| ${row.label} | \`${row.fgName}\` ${row.fg} | \`${row.bgName}\` ${row.bg} | ${row.use} | ${row.ratio.toFixed(2)}:1 | ${row.verdict} |`,
  ),
  "",
  "## Notes",
  "",
  "- All sampled prototype token combinations meet the sampled thresholds after darkening gold, muted-text, and rule tokens.",
  "- This is still a static token calculation; rendered component states require the separate axe/browser evidence captured for this run.",
  "- This table does not certify Records AI, TownlightMeetings, TownlightCode, or launcher WCAG conformance; axe/browser evidence is tracked separately.",
  "",
];

const resolvedOutput = resolve(outputPath);
mkdirSync(dirname(resolvedOutput), { recursive: true });
writeFileSync(resolvedOutput, `${lines.join("\n")}\n`, "utf8");
console.log(resolvedOutput);
