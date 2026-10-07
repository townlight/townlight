import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const main = readFileSync(join(root, "src", "main.js"), "utf8");
const css = readFileSync(join(root, "src", "styles.css"), "utf8");
const tauriConfig = readFileSync(join(root, "src-tauri", "tauri.conf.json"), "utf8");
const tauriConfigJson = JSON.parse(tauriConfig);
const desktopPackageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const desktopPackageLockJson = JSON.parse(readFileSync(join(root, "package-lock.json"), "utf8"));
const cargoToml = readFileSync(join(root, "src-tauri", "Cargo.toml"), "utf8");
const cargoLock = readFileSync(join(root, "src-tauri", "Cargo.lock"), "utf8");
const desktopMsiWorkflow = readFileSync(join(root, "..", ".github", "workflows", "desktop-windows-msi.yml"), "utf8");
const cargoConfig = readFileSync(join(root, ".cargo", "config.toml"), "utf8");
if (!cargoConfig.includes('[target.x86_64-pc-windows-msvc]') || !cargoConfig.includes('target-feature=+crt-static')) {
  throw new Error('Windows desktop must statically link the CRT for clean-machine startup');
}
if (!desktopMsiWorkflow.includes('verify-desktop-runtime.ps1')) {
  throw new Error('Packaging must inspect actual desktop imports before signing');
}
const rustMain = readFileSync(join(root, "src-tauri", "src", "main.rs"), "utf8");
const authRust = readFileSync(join(root, "src-tauri", "src", "auth.rs"), "utf8");
const moduleRegistryRust = readFileSync(join(root, "src-tauri", "src", "module_registry.rs"), "utf8");
const workflowRust = readFileSync(join(root, "src-tauri", "src", "workflows.rs"), "utf8");
const modelRust = readFileSync(join(root, "src-tauri", "src", "model.rs"), "utf8");
const supervisorRust = readFileSync(join(root, "src-tauri", "src", "supervisor.rs"), "utf8");
const firstRunRust = readFileSync(join(root, "src-tauri", "src", "first_run.rs"), "utf8");
const runtimeManifest = JSON.parse(readFileSync(join(root, "runtime", "windows-local-runtime.json"), "utf8"));
const runtimePayloadManifest = JSON.parse(readFileSync(join(root, "runtime", "windows-runtime-payloads.json"), "utf8"));
const runtimeSourcesManifest = JSON.parse(readFileSync(join(root, "runtime", "windows-runtime-sources.json"), "utf8"));
const firstRunManifest = JSON.parse(readFileSync(join(root, "runtime", "windows-first-run.json"), "utf8"));
const modelManifest = JSON.parse(readFileSync(join(root, "runtime", "gemma4-model.json"), "utf8"));
const runtimePayloadScript = readFileSync(join(root, "scripts", "prepare-runtime-payload.ps1"), "utf8");
const repoReadme = readFileSync(join(root, "..", "README.md"), "utf8");
const repoStatus = readFileSync(join(root, "..", "STATUS.md"), "utf8");
const userManual = readFileSync(join(root, "..", "USER-MANUAL.md"), "utf8");

const requiredUiPhrases = [
  "Meetings & Notices",
  "Records Requests",
  "Code & Ordinances",
  "Search City Knowledge",
  "System Health",
  "Audit Trail",
  "module manager",
  "First admin user",
  "Local Users",
  "Create Staff User",
  "Reset Passcode",
  "Enable",
  "Temporary local passcode",
  "Enter a temporary passcode, then use Reset Passcode",
  "Open Windows Uninstall",
  "Installed apps",
  "Records staff",
  "Clerk staff",
  "Code staff",
  "repair, backup, and uninstall",
  "Gemma 4 12B QAT Q4_0",
  "Checksum required",
  "No silent download",
  "Download progress",
  "Official Google weights",
  "Download / Resume Model",
  "Notice meeting type",
  "Statutory notice basis",
  "Notice lead days",
  "Notice day type",
  "Calculate Notice Deadline",
  "Notice deadline",
  "Notice time zone",
  "Clerk has reviewed and approved the notice checklist",
  "Actual posting date",
  "Approve Notice Checklist",
  "Notice posting location",
  "Posting confirmation",
  "Generate Local AI Minutes",
  "Generate Local AI Draft",
  "Generate Local AI Guidance",
  "Deadline basis",
  "Received date",
  "Deadline rule",
  "Deadline day count",
  "Deadline day type",
  "Calculate Deadline",
  "city/state holidays",
  "Set Deadline",
  "Fee line description",
  "Fee schedule or policy basis",
  "Fee line amount",
  "Fee waiver reason",
  "Add Fee Line",
  "Waive Fee",
  "Fee lines:",
  "Fee waiver:",
  "Notification Outbox",
  "Local notification log",
  "Log Notification Sent",
  "Request Timeline",
  "Status Updates",
  "Request Messages",
  "Message to requester",
  "Add Request Message",
  "Message to records staff",
  "Send Request Message",
  "Search Sessions",
  "Records search query",
  "Searched locations",
  "Search result title",
  "Search result citation",
  "Search result summary",
  "Search result status",
  "Search reviewer",
  "Save Search Session",
  "Request Documents",
  "Document title",
  "Source file path",
  "Choose File",
  "Native file selection is available in the Windows desktop app",
  "Choose Folder",
  "Native folder selection is available in the Windows desktop app",
  "Document citation",
  "Attach Document",
  "Exemption source",
  "Exemption category",
  "Staff finding",
  "Decision basis",
  "Exemption reviewer",
  "Save Exemption Decision",
  "Exemption Decisions",
  "Build Release Package",
  "Release Packages",
  "Run Health Check",
  "Package Profiles",
  "Module Catalog",
  "Choose Product Modules",
  "Custom selection will install Townlight Core plus",
  "Not ready for Windows Local 1.0",
  "Apply Module Selection",
  "Save Local Folders",
  "City data folder",
  "Backup folder",
  "Task queue schema",
  "City workflow services",
  "Background work queue",
  "Local document storage",
  "Create the first Townlight admin and sign in before changing local model setup.",
  "The Windows installer owns the app folder.",
  "Enabled modules:",
  "Data remains installed. Re-enable this module to show its work area.",
  "Backup includes:",
  "code workflow history",
  "Selected code source for actions:",
  "Module actions are handled by the Windows desktop app",
  "Source history:",
  "Sign in as Townlight admin to change local model setup.",
  "Sign in as Townlight admin to use local lifecycle actions.",
  "Sign in with the Townlight admin passcode before continuing setup.",
  "Use a Townlight admin account before changing setup, model, backup, restore, repair, module, user, or background services.",
  "Use a staff or Townlight admin passcode for city work.",
  "Use a Townlight admin account for setup, users, modules, backups, restore, repair, model setup, or background services.",
  "Check the email and local passcode, then try again."
];

for (const phrase of requiredUiPhrases) {
  if (!main.includes(phrase)) {
    throw new Error(`missing desktop UI phrase: ${phrase}`);
  }
}

for (const phrase of [
  "data-guided-review=\"work\"",
  "data-guided-review=\"supervisor\"",
  "data-guided-review=\"module\"",
  "scrollGuidedReviewIntoView(\"work\")",
  "const previousWork = cityWork();",
  "syncWorkSelectionAfterAction(action, result.state, previousWork)",
  "function recordFreshnessValue",
  "return collection.find((record) => record.id === selectedId) || newestRecord(collection) || null;",
  "lastStaffEmail",
  "Temporary local passcode must be at least 10 characters."
]) {
  if (!main.includes(phrase)) {
    throw new Error(`desktop guided workflow resilience phrase missing: ${phrase}`);
  }
}

for (const phrase of [
  "function publicMeetingView",
  "function publicRecordsRequestView",
  "function renderRecordsPublicStatusEvents",
  "function publicCodeSourceView",
  "function codeQuestionSearchFields",
  "function codeSourceSearchFields",
  "if (!publicOnly) fields.push(source.staff_guidance);",
  "? [entry.label, entry.source, entry.status, entry.authoritative_url]"
]) {
  if (!main.includes(phrase)) {
    throw new Error(`desktop public/staff boundary guard missing phrase: ${phrase}`);
  }
}

for (const phrase of [
  "function adminOnlyControlLocked",
  "return access.configured && access.role !== \"local-admin\";",
  "function modelSetupControlLocked",
  "return !access.signed_in || access.role !== \"local-admin\";",
  "function showStandaloneModelReadiness",
  "showStandaloneModelReadiness() ? renderModelReadiness({ compact: true })",
  "status: \"Sign in required\"",
  "const lockMessage = adminOnlyLockMessage(\"Sign in as Townlight admin to use local lifecycle actions.\");",
  "const lockMessage = modelSetupLockMessage();",
  "data-supervisor-action=\"backup\" ${adminDisabled}",
  "data-supervisor-action=\"install\" data-service-id=\"${escapeHtml(item.id)}\" ${adminDisabled}",
  "data-supervisor-review-confirm=\"${state.pendingSupervisorReviewAction}\"${serviceAttr} ${adminDisabled}"
]) {
  if (!main.includes(phrase)) {
    throw new Error(`desktop admin-only UI guard missing phrase: ${phrase}`);
  }
}

// Wave 1 first-run UX guards (audit 2026-07-12): folder picker locks with the
// primary action, the step's Action-needed box survives a failure, save errors
// name the real field, and folder errors only blame sign-in when it's the gate.
for (const phrase of [
  "function friendlyFirstRunError",
  "Missing required setup field:",
  "Enter a value for ${label}, then save.",
  "renderSetupFields(step, actionLocked)",
  'data-folder-path-field="${escapeHtml(field)}" ${locked ? "disabled" : ""}',
  "forStepId: stepId,",
  "function currentFirstRunStepId",
  "const forStepId = currentFirstRunStepId();",
  "state.actionResult && state.actionResult.accepted === false && state.actionResult.forStepId === step.id",
  "escapeHtml(isFailure ? state.actionResult.next_action : step.next_action)",
  "Try Choose Folder again, or type the folder path directly."
]) {
  if (!main.includes(phrase)) {
    throw new Error(`desktop first-run UX guard missing phrase: ${phrase}`);
  }
}

// Wave 2 first-run Criticals (audit 2026-07-12): model download shows a working
// state + locks its buttons (C1), the sign-in lockout stops contradicting itself
// (C5), and a blocked module shows a plain reason not the raw contract string (C6).
for (const phrase of [
  "state.modelActionInFlight = action;",
  "Downloading…",
  "Townlight may look frozen while it downloads",
  "too many failed sign-in attempts",
  "not available in this release yet",
  'result.working ? "working"',
  "this local staff user is disabled"
]) {
  if (!main.includes(phrase)) {
    throw new Error(`desktop first-run Wave-2 guard missing phrase: ${phrase}`);
  }
}
// C7: the Health block names the exact control to click, not a vague "finish setup".
if (!firstRunRust.includes("Open the Local AI model step, click Verify Checksum")) {
  throw new Error("desktop shell: verify-health block must name the Verify Checksum control (C7)");
}

for (const phrase of ["Docker", "WSL"]) {
  if (main.includes(`Start ${phrase}`) || main.includes(`Install ${phrase}`)) {
    throw new Error(`desktop shell should not direct clerks to start/install ${phrase}`);
  }
}

const currentFacingDocs = [
  ["README.md", repoReadme],
  ["STATUS.md", repoStatus],
  ["USER-MANUAL.md", userManual]
];

for (const [docName, doc] of currentFacingDocs) {
  for (const stalePhrase of [
    "Windows uses Docker Desktop plus WSL 2",
    "Docker Desktop on Windows",
    "Choose Guided Setup if Docker",
    "Docker Desktop/WSL2",
    "Open <http://localhost:8080>",
    "Windows is supported through a wrapper around the same containerized services",
    "Townlight's core runtime path is Linux/container-first"
  ]) {
    if (doc.includes(stalePhrase)) {
      throw new Error(`${docName} still describes the old container-wrapper clerk path: ${stalePhrase}`);
    }
  }
}

for (const [docName, doc] of currentFacingDocs) {
  for (const requiredPhrase of [
    "Windows Local",
    "Tauri/WebView2",
    "Gemma 4 12B QAT"
  ]) {
    if (!doc.includes(requiredPhrase)) {
      throw new Error(`${docName} missing current Windows Local phrase: ${requiredPhrase}`);
    }
  }
}

for (const [label, character] of [
  ["mojibake capital A with circumflex", String.fromCharCode(0x00c2)],
  ["middle dot separator", String.fromCharCode(0x00b7)]
]) {
  if (main.includes(character)) {
    throw new Error(`desktop shell contains non-ASCII or mojibake separator: ${label}`);
  }
}

if (!tauriConfig.includes('"identifier": "org.civicsuite.desktop"')) {
  throw new Error("Tauri identifier is missing");
}

if (!tauriConfig.includes('"icon": ["icons/icon.ico"]')) {
  throw new Error("Tauri bundle must declare the Windows .ico icon");
}

if (!tauriConfig.includes('"targets": ["msi"]')) {
  throw new Error("Tauri bundle must default to the MSI target for the full Windows runtime payload");
}

if (tauriConfig.includes('"installerHooks"') || tauriConfig.includes('"nsis"')) {
  throw new Error("Tauri MSI packaging must not rely on NSIS installer hooks");
}

if (!tauriConfig.includes('"resources": ["../runtime/payload/"]')) {
  throw new Error("Tauri bundle must include the Windows runtime payload resource folder");
}

// WiX accepts only numeric MSI versions. Tauri maps a numeric SemVer
// prerelease such as 1.1.0-1 to ProductVersion 1.1.0.1. A label such as
// 1.1.0-beta.1 compiles the application but fails only at the expensive final
// bundling step, so reject it here before CI prepares the portable runtime.
{
  const version = tauriConfigJson.version;
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-(\d+))?$/.exec(version);
  if (!match) {
    throw new Error(`Tauri MSI version must be numeric with an optional numeric prerelease; received ${version}`);
  }

  const [, majorText, minorText, patchText, prereleaseText] = match;
  const major = Number(majorText);
  const minor = Number(minorText);
  const patch = Number(patchText);
  const prerelease = prereleaseText === undefined ? 0 : Number(prereleaseText);
  if (major > 255 || minor > 255 || patch > 65535 || prerelease > 65535) {
    throw new Error(`Tauri MSI version exceeds WiX numeric limits: ${version}`);
  }

  const cargoVersion = /^version\s*=\s*"([^"]+)"/m.exec(cargoToml)?.[1];
  const cargoLockVersion = /\[\[package\]\]\r?\nname = "civicsuite-desktop"\r?\nversion = "([^"]+)"/m.exec(cargoLock)?.[1];
  const manifestVersions = {
    "package.json": desktopPackageJson.version,
    "package-lock.json": desktopPackageLockJson.version,
    "package-lock.json root package": desktopPackageLockJson.packages?.[""]?.version,
    "Cargo.toml": cargoVersion,
    "Cargo.lock": cargoLockVersion
  };
  for (const [source, manifestVersion] of Object.entries(manifestVersions)) {
    if (manifestVersion !== version) {
      throw new Error(`Desktop version drift: tauri.conf.json=${version}, ${source}=${manifestVersion}`);
    }
  }
}

for (const phrase of [
  '"wix": {',
  '"allowDowngrades": false',
  '"upgradeCode": "a63fc1d3-5437-5f55-89a2-fef93fb1f930"',
  '"language": "en-US"',
  '"enableElevatedUpdateTask": false'
]) {
  if (!tauriConfig.includes(phrase)) {
    throw new Error(`Tauri MSI WiX config missing phrase: ${phrase}`);
  }
}

for (const phrase of [
  "name: desktop-windows-msi",
  "runs-on: windows-latest",
  "path: civicsuite",
  "path: civiccore",
  "ref: b4d0156bdc6883c1c3ef167abe0379f9ca32b258",
  "path: civicrecords-ai",
  "ref: ff99d8c7e692ba1f75e1781f517bb54f5c618b48",
  "path: civicnotice",
  "ref: 79b8d07199ee77cd425b31c0e0a44f3a0832b810",
  "path: civicaccess",
  "ref: b9100edc80ca496d6061f1cdb3eb39a60ff5f31a",
  "npm run prepare-runtime-payload",
  "npm run tauri -- build",
  "desktop/src-tauri/target/release/bundle/msi/*.msi",
  "UpgradeCode=a63fc1d3-5437-5f55-89a2-fef93fb1f930",
  "SameVersionMajorUpgrade=true",
  "InstallerBundle=msi",
  "NoDockerPrerequisite=true",
  "NoWslPrerequisite=true"
]) {
  if (!desktopMsiWorkflow.includes(phrase)) {
    throw new Error(`desktop MSI workflow missing phrase: ${phrase}`);
  }
}

if (!rustMain.includes('include_str!("../../../installer/modules.json")')) {
  throw new Error("desktop shell must read the suite module registry at compile time");
}

if (!rustMain.includes('mod model;') || !rustMain.includes('get_model_state')) {
  throw new Error("desktop shell must expose model readiness state");
}

if (!rustMain.includes("before changing local model setup")) {
  throw new Error("desktop shell must require local admin access before model setup mutations");
}

if (!rustMain.includes("fn module_action") || !main.includes('invoke("module_action"')) {
  throw new Error("desktop shell must expose and call module enable/disable actions");
}

if (!rustMain.includes("fn choose_folder_path") || !main.includes('invoke("choose_folder_path"')) {
  throw new Error("desktop shell must expose and call the native folder picker");
}

if (!main.includes("const normalizedServiceId = serviceId || null")) {
  throw new Error("desktop supervisor confirms must normalize missing service ids before invoking Tauri");
}

if (!main.includes("serviceId: normalizedServiceId")) {
  throw new Error("desktop supervisor actions must pass an explicit nullable serviceId to Tauri");
}

if (!main.includes('status: "Working"') || !main.includes("Keep Townlight open while the local action completes.")) {
  throw new Error("desktop supervisor confirms must leave guided review state before long-running native actions");
}

if (!rustMain.includes("before changing setup, profile, model, backup, or runtime settings")) {
  throw new Error("desktop shell must require local admin access before first-run setup/profile/model/runtime mutations");
}

for (const phrase of [
  'model::model_action("resume-download")',
  'model::model_action("load-runtime-model")'
]) {
  if (!firstRunRust.includes(phrase)) {
    throw new Error(`Windows first-run setup must call the real model action: ${phrase}`);
  }
}

if (runtimeManifest.local_only !== true) {
  throw new Error("Windows runtime manifest must default to local-only");
}

if (runtimePayloadManifest.profile !== "windows-local-1.0" || runtimePayloadManifest.local_only !== true) {
  throw new Error("Windows runtime payload manifest must target the local-only Windows profile");
}

if (runtimeSourcesManifest.profile !== "windows-local-1.0") {
  throw new Error("Windows runtime sources manifest must target the Windows profile");
}

for (const sourceKey of ["postgres", "pgvector", "python", "ollama"]) {
  if (!runtimeSourcesManifest.sources[sourceKey]) {
    throw new Error(`Windows runtime sources manifest missing source: ${sourceKey}`);
  }
}

if (
  !runtimeSourcesManifest.sources.postgres.download_url?.includes(
    "releases/download/windows-runtime-postgres-17.10-2/postgresql-17.10-2-windows-x64-binaries.zip"
  )
) {
  throw new Error("Windows runtime sources manifest must pin the mirrored PostgreSQL 17 Windows binary ZIP URL");
}

if (
  runtimeSourcesManifest.sources.postgres.download_sha256 !==
  "ef9b1e5e23d2e8a83914ba13d9dc536a72210fba53fd1808ff1f7e06bb22b106"
) {
  throw new Error("Windows runtime sources manifest must checksum the mirrored PostgreSQL 17 Windows binary ZIP");
}

if (
  !runtimeSourcesManifest.sources.postgres.mirror_of?.includes(
    "get.enterprisedb.com/postgresql/postgresql-17.10-2-windows-x64-binaries.zip"
  )
) {
  throw new Error("Windows runtime sources manifest must retain the original PostgreSQL binary source URL");
}

for (const phrase of [
  "Install-PostgresPayload",
  "Install-PythonPayload",
  "Install-OllamaPayload",
  "Install-PgvectorPayload",
  "Get-PostgresSourceUrl",
  "falling back to PostgreSQL download-page discovery",
  "Test-CivicDownloadHash",
  "Downloaded payload hash mismatch",
  "Get-Command curl.exe",
  '"--continue-at", "-"',
  '"--speed-time", "60"',
  "MSVC cl.exe and nmake.exe are required",
  "System.Security.Cryptography.SHA256",
  "PayloadManifestPath",
  '[string]$ProductProfile = "records-beta"',
  'if ($ProductProfile -eq "city-core")',
  "TOWNLIGHT_PRODUCT_PROFILE",
  "New-RuntimePayloadLock",
  "required_files",
  "size_bytes",
  "runtime-payload-lock.json"
]) {
  if (!runtimePayloadScript.includes(phrase)) {
    throw new Error(`Windows runtime payload script missing phrase: ${phrase}`);
  }
}

if (runtimePayloadScript.includes("Get-FileHash")) {
  throw new Error("Windows runtime payload hashing must not depend on Get-FileHash availability");
}

const pythonInstallSection = runtimePayloadScript.slice(
  runtimePayloadScript.indexOf("function Install-PythonServicePackages")
);
const buildBackendBootstrapIndex = pythonInstallSection.indexOf(
  "Invoke-PythonPayloadCommand -PythonRoot $PythonRoot -Arguments $ServiceInstallArguments"
);
const civicCoreInstallIndex = pythonInstallSection.indexOf("        $CivicCore,");
if (
  buildBackendBootstrapIndex < 0 ||
  civicCoreInstallIndex < 0 ||
  buildBackendBootstrapIndex > civicCoreInstallIndex
) {
  throw new Error("embedded Python build backends must be installed before local service packages");
}

if (
  !pythonInstallSection.includes("$ServicePackageInstallArguments = @(") ||
  !pythonInstallSection.includes(") + $ServicePackages") ||
  !pythonInstallSection.includes(
    "Invoke-PythonPayloadCommand -PythonRoot $PythonRoot -Arguments $ServicePackageInstallArguments"
  )
) {
  throw new Error("local service package arguments must be composed before PowerShell parameter binding");
}

if (pythonInstallSection.includes("-Arguments (@(")) {
  throw new Error("embedded Python command arrays must use Windows PowerShell 5.1-compatible syntax");
}

for (const phrase of [
  "runtime-payload-lock.json",
  "Runtime payload file failed integrity check",
  "source payload integrity check failed",
  "copied payload integrity check failed"
]) {
  if (!supervisorRust.includes(phrase)) {
    throw new Error(`Windows supervisor missing payload integrity phrase: ${phrase}`);
  }
}

for (const phrase of [
  "ModelDownloadState",
  "model-download-status.json",
  "Partial download",
  "Download failed",
  "fn model_overall_status",
  "\"Needs verification\"",
  "\"Needs runtime\"",
  "\"Needs load\"",
  "\"Needs registration\""
]) {
  if (!readFileSync(join(root, "src-tauri", "src", "model.rs"), "utf8").includes(phrase)) {
    throw new Error(`Windows model setup missing durable download state phrase: ${phrase}`);
  }
}

for (const phrase of [
  "Townlight cannot continue this setup step until these required steps are complete",
  "Townlight setup is complete on this Windows profile.",
  "System Health keeps backup, repair, logs, restore, and uninstall available.",
  "Start city work from Records Requests, Public Notices, Accessibility, or Search City Knowledge."
]) {
  if (!firstRunRust.includes(phrase)) {
    throw new Error(`Windows first-run finish contract missing phrase: ${phrase}`);
  }
}

for (const phrase of [
  "city_work_action_module_requirement",
  "Install or enable {} in Settings before using this workflow.",
  "Local search completed across enabled modules with {} result(s)."
]) {
  if (!rustMain.includes(phrase)) {
    throw new Error(`desktop command boundary missing disabled-module guard phrase: ${phrase}`);
  }
}

for (const phrase of [
  "install-module",
  "remove-module",
  "update-module",
  "open-module-exports",
  "backup_restore_hooks",
  "Module exports opened",
  "Existing module data was not deleted"
]) {
  if (!rustMain.includes(phrase) && !moduleRegistryRust.includes(phrase)) {
    throw new Error(`desktop command boundary missing module lifecycle phrase: ${phrase}`);
  }
}

for (const phrase of [
  "renderGuidedModuleReview",
  "Review Before Removing",
  "Creates a verified local profile backup",
  "Writes a backup manifest before updating the local module-selection record",
  "Existing module data is not deleted.",
  "data-module-review-confirm",
  "Open Exports",
  "open local module exports"
]) {
  if (!main.includes(phrase)) {
    throw new Error(`desktop module manager missing guided review phrase: ${phrase}`);
  }
}

for (const phrase of [
  "Notice Checklist",
  "calculate-notice-deadline",
  "complete-notice-checklist",
  "noticeStatutoryBasis",
  "noticeLeadDays",
  "noticeDayType",
  "noticeTimeZone",
  "Notice Posting Evidence",
  "postingLocation",
  "postingConfirmation",
  "postingDate",
  "suggest-minutes-draft",
  "suggest-records-response",
  "suggest-code-guidance",
  "set-records-deadline",
  "calculate-records-deadline",
  "deadlineBasis",
  "Generated local AI minutes draft",
  "Generated local AI records response draft",
  "Generated local AI code guidance draft",
  "Local AI plain-language draft",
  "ai-draft-translation",
  "local AI analysis added",
  "AI engine not ready",
  "Rewrite the following public-facing city text in plain language",
  "Translate the following public-facing city text into"
]) {
  if (!workflowRust.includes(phrase)) {
    throw new Error(`desktop workflow missing local AI action phrase: ${phrase}`);
  }
}

// Townlight Access dual-path UI state: the not-ready banner and the guided-review
// copy for the three AI-touched actions must stay in main.js so the Playwright
// asserts and the Rust result strings cannot silently drift apart.
for (const phrase of [
  "AI engine not ready",
  "Open model setup",
  "civicaccess-plain-language",
  "civicaccess-language-variant",
  "Review Before Running Accessibility Review",
  "Review Before Drafting Plain-Language Rewrite",
  "Review Before Drafting Translation Variant"
]) {
  if (!main.includes(phrase)) {
    throw new Error(`desktop civicaccess AI state missing phrase: ${phrase}`);
  }
}

for (const phrase of [
  "generate_local_text",
  // /api/chat (not raw /api/generate): the pinned gemma4 model requires its
  // own template+parser; raw:true bypassed it and produced garbage output
  // (found in Phase D). Pin the corrected endpoint so it can't silently revert.
  "/api/chat",
  "num_predict",
  "LOCAL_GENERATION_NUM_CTX",
  "Local AI model is not ready"
]) {
  if (!modelRust.includes(phrase)) {
    throw new Error(`desktop model runtime missing local generation phrase: ${phrase}`);
  }
}

for (const key of ["requires_docker", "requires_wsl", "requires_terminal"]) {
  if (runtimeManifest.operator_path[key] !== false) {
    throw new Error(`Windows runtime operator path cannot require ${key}`);
  }
  if (firstRunManifest.operator_path[key] !== false) {
    throw new Error(`Windows first-run operator path cannot require ${key}`);
  }
  if (modelManifest.operator_path[key] !== false) {
    throw new Error(`Windows model operator path cannot require ${key}`);
  }
}

for (const action of ["install", "start", "stop", "health", "repair", "logs", "support-bundle", "backup", "open-backup-folder", "restore", "uninstall", "open-windows-uninstall"]) {
  if (!runtimeManifest.lifecycle_actions.includes(action)) {
    throw new Error(`Windows runtime manifest missing lifecycle action: ${action}`);
  }
}

for (const serviceId of ["postgres", "python-services", "task-queue", "model-runtime", "file-storage"]) {
  if (!runtimeManifest.services.some((service) => service.id === serviceId)) {
    throw new Error(`Windows runtime manifest missing service: ${serviceId}`);
  }
  if (!runtimePayloadManifest.payloads.some((payload) => payload.services.includes(serviceId))) {
    throw new Error(`Windows runtime payload manifest missing service payload: ${serviceId}`);
  }
}

for (const phrase of [
  "City data folder has not been created yet.",
  "Backup folder has not been created yet.",
  "item.actionable !== false"
]) {
  if (!main.includes(phrase)) {
    throw new Error(`Desktop health UI missing local folder health phrase: ${phrase}`);
  }
}

for (const phrase of [
  "is available and writable on this Windows profile.",
  "Townlight cannot save files there.",
  "Choose another city data folder in Settings or ask IT to grant write access.",
  "Choose another backup folder in Settings or ask IT to grant write access.",
  "writable {}; write_check {}",
  "Task queue schema",
  "City workflow services are not running yet",
  "Run Install or Repair for City workflow services"
]) {
  if (!supervisorRust.includes(phrase)) {
    throw new Error(`Windows supervisor missing folder write-health phrase: ${phrase}`);
  }
}

for (const phrase of [
  "create-user",
  "deactivate-user",
  "reactivate-user",
  "reset-user-passcode",
  "records-staff",
  "code-staff",
  "Sign in with a staff or Townlight admin account before changing city work.",
]) {
  if (!rustMain.includes(phrase) && !authRust.includes(phrase) && !supervisorRust.includes(phrase) && !firstRunRust.includes(phrase)) {
    throw new Error(`Desktop access/RBAC static guard missing phrase: ${phrase}`);
  }
}

for (const phrase of [
  "Townlight Local Logs",
  "Use these files when IT or Townlight support asks for local runtime evidence.",
  "Prepared and opened the Townlight logs folder under the selected city data folder",
  "Share README.txt and the relevant service log with IT or Townlight support.",
  "Townlight Support Bundle",
  "health, runtime-state, and selected service logs",
  "support-manifest.json",
  "does not copy city records, uploaded documents, backup contents, or local secrets"
]) {
  if (!supervisorRust.includes(phrase)) {
    throw new Error(`Windows supervisor missing local logs support phrase: ${phrase}`);
  }
}

for (const requiredPayload of [
  ["postgres-17-pgvector", "bin/pg_ctl.exe", "share/extension/vector.control"],
  [
    "cpython-services",
    "python.exe",
    "Lib/site-packages/civiccore/__init__.py",
    "Lib/site-packages/civiccore/migrations/alembic.ini",
    "Lib/site-packages/civiccore/migrations/versions/civiccore_0003_local_task_queue.py",
    "Lib/site-packages/app/main.py",
    "Lib/site-packages/civicnotice/main.py",
    "Lib/site-packages/civicaccess/main.py",
    "Lib/site-packages/civicsuite_runtime/__init__.py",
    "Lib/site-packages/civicsuite_runtime/migrate.py",
    "Lib/site-packages/civicsuite_runtime/civicrecords_alembic/alembic.ini",
    "Lib/site-packages/civicsuite_runtime/civicrecords_alembic/alembic/env.py"
  ],
  ["ollama-runtime", "ollama.exe"]
]) {
  const [payloadId, ...requiredFiles] = requiredPayload;
  const payload = runtimePayloadManifest.payloads.find((candidate) => candidate.id === payloadId);
  if (!payload) {
    throw new Error(`Windows runtime payload manifest missing payload: ${payloadId}`);
  }
  for (const requiredFile of requiredFiles) {
    if (!payload.required_files.includes(requiredFile)) {
      throw new Error(`Windows runtime payload ${payloadId} missing required file: ${requiredFile}`);
    }
  }
}

for (const stepId of ["locations", "modules", "model", "city-profile", "first-admin", "backup", "health", "finish"]) {
  if (!firstRunManifest.steps.some((step) => step.id === stepId)) {
    throw new Error(`Windows first-run manifest missing step: ${stepId}`);
  }
}

const firstRunStepIds = firstRunManifest.steps.map((step) => step.id);
if (firstRunStepIds.indexOf("city-profile") > firstRunStepIds.indexOf("first-admin")) {
  throw new Error("Windows first-run setup must collect the city profile before the first local admin");
}
if (firstRunStepIds.indexOf("first-admin") > firstRunStepIds.indexOf("model")) {
  throw new Error("Windows first-run setup must create the first local admin before model setup");
}

for (const action of ["choose-location", "select-modules", "download-model", "defer-model", "create-city-profile", "create-admin", "choose-backup", "verify-health", "open-app", "repair", "backup", "uninstall"]) {
  if (!firstRunManifest.actions.includes(action)) {
    throw new Error(`Windows first-run manifest missing action: ${action}`);
  }
}
if (!main.includes('data-first-run-action="defer-model"') || !main.includes('Continue without local AI')) {
  throw new Error("First-run must expose the explicit optional-AI choice");
}
if (!desktopMsiWorkflow.includes('/json/list') || !desktopMsiWorkflow.includes("$_.title -eq 'Townlight'")) {
  throw new Error("Installed launch proof must require the actual Townlight WebView page");
}

if (modelManifest.local_only !== true) {
  throw new Error("Windows model manifest must default to local-only");
}

if (modelManifest.model.id !== "gemma-4-12b-it-qat-q4_0") {
  throw new Error("Windows model manifest must pin Gemma 4 12B QAT Q4_0");
}

if (modelManifest.model.format !== "GGUF" || !modelManifest.model.quantization.includes("QAT")) {
  throw new Error("Windows model manifest must pin QAT GGUF weights");
}

if (modelManifest.model.artifact.file_name !== "gemma-4-12b-it-qat-q4_0.gguf") {
  throw new Error("Windows model manifest must pin the expected GGUF file");
}

if (modelManifest.model.runtime_model !== "civicsuite-gemma4-12b-qat:q4_0") {
  throw new Error("Windows model manifest must define the local Ollama runtime model name");
}

if (!modelManifest.model.artifact.checksum_required || !/^[a-f0-9]{64}$/i.test(modelManifest.model.artifact.sha256)) {
  throw new Error("Windows model manifest must require a SHA-256 checksum");
}

if (modelManifest.download.automatic || !modelManifest.download.resumable || !modelManifest.download.requires_user_consent) {
  throw new Error("Windows model download must be explicit, resumable, and consent-gated");
}

for (const checkId of ["metadata", "artifact-file", "checksum", "runtime", "runtime-model", "registered-model"]) {
  if (!modelManifest.readiness_checks.some((check) => check.id === checkId && check.required)) {
    throw new Error(`Windows model manifest missing readiness check: ${checkId}`);
  }
}

if (css.includes("blur(") || css.includes("radial-gradient")) {
  throw new Error("desktop shell should avoid blurred/orb-like decorative styling");
}

// T5 — static XSS-regression guard (text-node + fn-call + double-escape).
// Fails the build if any raw data sink is reintroduced into main.js, or if a
// field is double-escaped (which renders &amp;lt; instead of <).
{
  const src = main;

  // (A) raw input/textarea draft sinks
  const rawInput = [
    /value="\$\{state\.workDraft\.[A-Za-z0-9_]+\}"/g,
    /value="\$\{state\.setupDraft\.[A-Za-z0-9_]+\}"/g,
    /value="\$\{state\.accessDraft\.[A-Za-z0-9_]+\}"/g,
    /<textarea[^>]*>\$\{state\.(workDraft|setupDraft|accessDraft)\.[A-Za-z0-9_]+\}<\/textarea>/g,
  ];
  // (B) raw text-node record sinks: >${VAR.field}< not wrapped in escapeHtml/escapedDraft
  const rawTextNode =
    />\s*\$\{(request|meeting|source|handoff|comment|entry|event|answer|result|member|citation)\.[A-Za-z0-9_.]+\}\s*</g;
  // (C) raw function-call text sink known to carry data
  const rawFnCall = />\s*\$\{codeVersionHistorySummary\([^)]*\)\}\s*</g;
  // (D) double-escape
  const doubleEscape = [/escapeHtml\(\s*escapeHtml\(/g, /escapeHtml\(\s*escapedDraft\(/g];

  for (const re of [...rawInput, rawTextNode, rawFnCall]) {
    const hits = src.match(re) || [];
    if (hits.length !== 0) {
      throw new Error(`Unescaped data interpolation reintroduced: ${hits[0] || re}`);
    }
  }
  for (const re of doubleEscape) {
    const hits = src.match(re) || [];
    if (hits.length !== 0) {
      throw new Error(`Double-escaping introduced (renders &amp;lt;): ${hits[0] || re}`);
    }
  }
}

// CSP guard — the shipped CSP must lock script-src to 'self' (no unsafe-inline/
// unsafe-eval), which is the load-bearing runtime backstop for C1.
{
  const config = JSON.parse(tauriConfig);
  const csp = config?.app?.security?.csp;
  if (!csp || typeof csp !== "object") {
    throw new Error("tauri.conf.json security.csp must be a strict object (not null) for the shipped build");
  }
  if (csp["script-src"] !== "'self'") {
    throw new Error("Production CSP script-src must be exactly 'self' (no unsafe-inline/unsafe-eval)");
  }
  if (!Array.isArray(config?.app?.security?.capabilities) ||
      !config.app.security.capabilities.includes("main-capability")) {
    throw new Error("tauri.conf.json security.capabilities must reference main-capability");
  }
}

// fallbackState module-card metadata parity with canonical installer/modules.json.
// Locks in route_count / service_count / task_count so fallback drift can't recur
// (this caught civicrecords-ai 6->4 and civicclerk 6->5 stale task_counts that
// shipped silently for months because fallbackState is only used in browser preview).
{
  const modulesJson = JSON.parse(readFileSync(
    join(root, "..", "installer", "modules.json"),
    "utf8"
  ));
  const canonical = new Map();
  for (const mod of modulesJson.modules || []) {
    canonical.set(mod.id, {
      route_count: Array.isArray(mod.routes) ? mod.routes.length : null,
      service_count: Array.isArray(mod.services) ? mod.services.length : null,
      task_count: Array.isArray(mod.tasks) ? mod.tasks.length : null,
    });
  }
  // Parse each fallbackState.modules entry from main.js.
  // Match `id: "X"` to find the start of an entry; then the next 18 lines hold
  // the metadata fields we care about — far enough to never overshoot into the
  // next entry's `id: "Y"`.
  const modulePattern = /id:\s*"([\w-]+)",[\s\S]{0,2000}?\{?\s*$/gm;
  const fallbackPattern = /\{\s*id:\s*"([\w-]+)",([\s\S]*?)(?=\},\s*\{|\},?\s*\],?\s*module_profiles)/g;
  const seen = new Map();
  let match;
  while ((match = fallbackPattern.exec(main)) !== null) {
    const id = match[1];
    const body = match[2];
    const r = /route_count:\s*(\d+)/.exec(body);
    const s = /service_count:\s*(\d+)/.exec(body);
    const t = /task_count:\s*(\d+)/.exec(body);
    if (!r && !s && !t) continue; // Skip entries without count fields (e.g. civiccore foundation)
    seen.set(id, {
      route_count: r ? Number(r[1]) : null,
      service_count: s ? Number(s[1]) : null,
      task_count: t ? Number(t[1]) : null,
    });
  }
  const driftErrors = [];
  for (const [id, fallback] of seen.entries()) {
    const canon = canonical.get(id);
    if (!canon) continue; // Fallback entry has no canonical match (e.g. civiczone preview-only) — skip.
    for (const field of ["route_count", "service_count", "task_count"]) {
      if (canon[field] === null) continue; // Canonical doesn't expose this field for this module.
      if (fallback[field] !== null && fallback[field] !== canon[field]) {
        driftErrors.push(
          `fallbackState.modules[${id}].${field}=${fallback[field]} but installer/modules.json says ${canon[field]}`
        );
      }
    }
  }
  // Reverse direction: a SHIPPED city-core module with no fallbackState entry at
  // all means browser-preview silently omits that module's card — the exact bug
  // class this guard exists to catch (fallbackState.modules was missing civicaccess
  // until commit 32e08da). Scoped to CITY_CORE_PRODUCT_MODULE_IDS (the actual
  // shipped profile), not every id in installer/modules.json — most canonical
  // entries are queued Tier 2+ modules that have never had a fallback card and
  // aren't expected to until they ship.
  const cityCoreIdsMatch = /CITY_CORE_PRODUCT_MODULE_IDS\s*=\s*\[([^\]]*)\]/.exec(main);
  const cityCoreIds = cityCoreIdsMatch
    ? [...cityCoreIdsMatch[1].matchAll(/"([\w-]+)"/g)].map((m) => m[1])
    : [];
  for (const id of cityCoreIds) {
    if (!seen.has(id)) {
      driftErrors.push(`fallbackState.modules is missing shipped city-core module ${id}`);
    }
  }
  if (driftErrors.length > 0) {
    throw new Error(
      "fallbackState module-card metadata is out of sync with installer/modules.json:\n  " +
      driftErrors.join("\n  ")
    );
  }
}

for (const demoTownContract of [
  'data-work-action="load-demo-town"',
  "fixture.watermark",
  "Loading is never automatic",
  "requires an empty local profile",
  "creates a verified backup",
  "renderDemoTownBanner(work)"
]) {
  if (!main.includes(demoTownContract)) {
    throw new Error(`Desktop demo-town UI contract missing phrase: ${demoTownContract}`);
  }
}

const pythonPayload = runtimePayloadManifest.payloads.find((payload) => payload.id === "cpython-services");
for (const excludedFromRecordsBeta of [
  "Lib/site-packages/civicclerk/main.py",
  "Lib/site-packages/civiccode/main.py"
]) {
  if (pythonPayload.required_files.includes(excludedFromRecordsBeta)) {
    throw new Error(`Records beta payload must not require ${excludedFromRecordsBeta}`);
  }
  if (!pythonPayload.profile_required_files?.["city-core"]?.includes(excludedFromRecordsBeta)) {
    throw new Error(`Legacy city-core payload must retain ${excludedFromRecordsBeta}`);
  }
}
if (desktopMsiWorkflow.includes("repository: townlight/meetings") || desktopMsiWorkflow.includes("repository: townlight/ordinances")) {
  throw new Error("Townlight Records MSI workflow must not check out Meetings or Code runtime sources");
}

if (tauriConfigJson.productName !== "Townlight" || tauriConfigJson.bundle.publisher !== "Townlight") {
  throw new Error("Desktop and MSI public display identity must be Townlight");
}
if (tauriConfigJson.app.windows[0]?.title !== "Townlight") {
  throw new Error("Desktop window title must use the Townlight public identity");
}
if (tauriConfigJson.identifier !== "org.civicsuite.desktop") {
  throw new Error("The stable Tauri application identifier must not change during the display-only rename");
}
if (tauriConfigJson.bundle.windows?.wix?.upgradeCode !== "a63fc1d3-5437-5f55-89a2-fef93fb1f930") {
  throw new Error("The stable MSI upgrade code must not change during the display-only rename");
}
if (!moduleRegistryRust.includes('const DEFAULT_PROFILE_ID: &str = "records-beta";')) {
  throw new Error("Fresh desktop installs must select the dependency-closed Records beta profile");
}
for (const recordsBetaUiContract of [
  'const RECORDS_BETA_PRODUCT_MODULE_IDS = ["civicrecords-ai", "civicnotice", "civicaccess"]',
  '"records-beta": RECORDS_BETA_PRODUCT_MODULE_IDS',
  'selection.profile_id === "custom" || !knownProfile',
  'return { profileId: state.moduleDraft.profileId }'
]) {
  if (!main.includes(recordsBetaUiContract)) {
    throw new Error(`Records beta UI profile contract missing phrase: ${recordsBetaUiContract}`);
  }
}
if (firstRunManifest.profile_label !== "Townlight Records") {
  throw new Error("Fresh-install first-run manifest must identify the Townlight Records product profile");
}
if (!firstRunRust.includes('join("CivicSuite")') || !modelRust.includes('join("CivicSuite")')) {
  throw new Error("Legacy app-data discovery paths must remain available during the display-only rename");
}

console.log("PASS: desktop static smoke checks passed");
