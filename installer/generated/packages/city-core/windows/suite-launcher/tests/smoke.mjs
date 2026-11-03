import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const files = {
  html: readFileSync(join(root, "index.html"), "utf8"),
  js: readFileSync(join(root, "src", "app.js"), "utf8"),
  css: readFileSync(join(root, "src", "styles.css"), "utf8"),
  readme: readFileSync(join(root, "README.md"), "utf8")
};

const requiredSnippets = [
  ["html", "Townlight Launcher"],
  ["js", "Staff"],
  ["js", "Resident"],
  ["js", "IT-Admin"],
  ["js", "TownlightRecords"],
  ["js", "TownlightMeetings"],
  ["js", "TownlightCode"],
  ["js", "command-palette"],
  ["js", "audit-drawer"],
  ["js", "townlight_records"],
  ["js", "townlight_meetings"],
  ["js", "townlight_code"],
  ["js", "townlight_core"],
  ["js", "City-core audit drawer"],
  ["js", "Export cross-module audit log"],
  ["js", "qa=1&state=loading|success|empty|error|partial"],
  ["js", "http://127.0.0.1:18080/"],
  ["js", "http://127.0.0.1:18081/"],
  ["js", "http://127.0.0.1:18820/"],
  ["css", "--paper"],
  ["css", "--navy"],
  ["css", "--gold"],
  ["css", "Source Serif"],
  ["css", "JetBrains Mono"],
  ["readme", "?qa=1&state=partial"]
];

const missing = requiredSnippets.filter(([file, snippet]) => !files[file].includes(snippet));
if (missing.length) {
  for (const [file, snippet] of missing) {
    console.error(`missing required launcher text in ${file}: ${snippet}`);
  }
  process.exit(1);
}

console.log("suite-launcher smoke: PASS");
