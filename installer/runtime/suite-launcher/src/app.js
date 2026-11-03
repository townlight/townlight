const DEFAULT_CONFIG = {
  cityName: "City of Brookfield",
  operator: "City-core beta profile",
  modules: [
    {
      id: "records",
      name: "TownlightRecords",
      port: 18080,
      href: "http://127.0.0.1:18080/",
      staffAction: "Review requests",
      residentAction: "Submit or track records requests",
      adminAction: "Check index and queue health"
    },
    {
      id: "clerk",
      name: "TownlightMeetings",
      port: 18081,
      href: "http://127.0.0.1:18081/",
      staffAction: "Prepare agendas and minutes",
      residentAction: "View meetings and notices",
      adminAction: "Check meeting service health"
    },
    {
      id: "code",
      name: "TownlightCode",
      port: 18820,
      href: "http://127.0.0.1:18820/",
      staffAction: "Codify adopted ordinances",
      residentAction: "Search municipal code",
      adminAction: "Check code search service health"
    }
  ]
};

const config = Object.assign({}, DEFAULT_CONFIG, window.TOWNLIGHT_LAUNCHER_CONFIG || {});
if (window.TOWNLIGHT_LAUNCHER_CONFIG?.modules) {
  config.modules = window.TOWNLIGHT_LAUNCHER_CONFIG.modules;
}

const states = {
  loading: {
    label: "Checking services",
    badge: "loading",
    summary: "Launcher is checking local module endpoints. Links unlock when health is known.",
    next: "Wait a moment, then refresh. If this repeats, run the installer verify command for the city-core package.",
    statuses: { records: "checking", clerk: "checking", code: "checking" },
    audit: []
  },
  success: {
    label: "City-core ready",
    badge: "ok",
    summary: "Records, Clerk, and Code surfaces are listed for the local city-core profile.",
    next: "Open the Staff surface or use Ctrl-K to jump directly to a module.",
    statuses: { records: "ready", clerk: "ready", code: "ready" },
    audit: [
      { time: "09:44", action: "Records request viewed by staff", source: "townlight_records" },
      { time: "09:43", action: "Meeting packet updated", source: "townlight_meetings" },
      { time: "09:42", action: "Ordinance citation indexed", source: "townlight_code" },
      { time: "09:41", action: "City-core shared session validated", source: "townlight_core" },
      { time: "09:40", action: "Operator selected city-core profile", source: "suite-launcher" }
    ]
  },
  empty: {
    label: "No audit events yet",
    badge: "empty",
    summary: "The launcher is available, but this runtime has not recorded module events in the current browser session.",
    next: "Open a module tile or run a package verify action; new events will appear in the audit drawer.",
    statuses: { records: "ready", clerk: "ready", code: "ready" },
    audit: []
  },
  error: {
    label: "Records service unavailable",
    badge: "error",
    summary: "TownlightRecords did not report ready. Clerk and Code remain listed so staff can keep orienting.",
    next: "Run the city-core local runtime verify action, confirm required services are healthy, then refresh this launcher.",
    statuses: { records: "error", clerk: "ready", code: "ready" },
    audit: [
      { time: "09:44", action: "TownlightRecords health check failed", source: "http://127.0.0.1:18080/" },
      { time: "09:43", action: "Launcher kept Clerk and Code links visible", source: "suite-launcher" }
    ]
  },
  partial: {
    label: "Partial profile health",
    badge: "warn",
    summary: "TownlightRecords and TownlightMeetings are ready. TownlightCode is degraded, so codification work should wait.",
    next: "Open IT-Admin, inspect TownlightCode service logs, then rerun verify before staff codification.",
    statuses: { records: "ready", clerk: "ready", code: "degraded" },
    audit: [
      { time: "09:46", action: "TownlightCode returned degraded health", source: "http://127.0.0.1:18820/" },
      { time: "09:45", action: "Records and Clerk checks passed", source: "suite-launcher" }
    ]
  }
};

const surfaceCopy = {
  staff: {
    label: "Staff",
    heading: "Today in city-core",
    subhead: "A single staff entry point for records, meetings, and municipal code work.",
    action: "Primary work"
  },
  resident: {
    label: "Resident",
    heading: "Resident services",
    subhead: "Plain-language entry points for requests, meetings, notices, and code lookup.",
    action: "Resident path"
  },
  admin: {
    label: "IT-Admin",
    heading: "Operations console",
    subhead: "Local endpoint map, service state, and recovery guidance for the city-core runtime.",
    action: "Admin check"
  }
};

const searchParams = new URLSearchParams(window.location.search);
const qaMode = searchParams.get("qa") === "1";
const stateParam = qaMode ? searchParams.get("state") || "success" : "success";
let activeStateKey = states[stateParam] ? stateParam : "success";
let activeSurface = "staff";
let paletteOpen = false;
let drawerOpen = false;
let paletteQuery = "";
let previousFocus = null;

const app = document.querySelector("#app");

function statusText(status) {
  return {
    ready: "Ready",
    checking: "Checking",
    error: "Action needed",
    degraded: "Degraded"
  }[status] || "Unknown";
}

function moduleAction(module) {
  if (activeSurface === "resident") return module.residentAction;
  if (activeSurface === "admin") return module.adminAction;
  return module.staffAction;
}

function moduleMeta(module) {
  if (activeSurface === "resident") return module.id === "records" ? "Request intake" : module.id === "clerk" ? "Meetings and notices" : "Code search";
  if (activeSurface === "admin") return new URL(module.href).host;
  return module.id === "records" ? "FOIA and public records" : module.id === "clerk" ? "Agendas, packets, minutes" : "Municipal code";
}

function icon(name) {
  const icons = {
    records: "M4 7h16v12H4z M7 7V5h10v2 M8 11h8 M8 15h5",
    clerk: "M6 5h12v14H6z M8 9h8 M8 13h8 M8 17h5 M9 3v4 M15 3v4",
    code: "M5 5h10a4 4 0 0 1 4 4v10H9a4 4 0 0 1-4-4z M9 5v14 M12 9h4 M12 13h4",
    audit: "M12 4v8l5 3 M4 12a8 8 0 1 0 2.3-5.7",
    search: "M10 5a5 5 0 1 0 0 10a5 5 0 0 0 0-10z M14 14l5 5",
    close: "M6 6l12 12M18 6L6 18",
    arrow: "M5 12h14M13 6l6 6-6 6",
    shield: "M12 4l7 3v5c0 5-3 8-7 9c-4-1-7-4-7-9V7z",
    alert: "M12 4l9 16H3z M12 9v5 M12 17h.01"
  };
  return `<svg aria-hidden="true" class="icon" viewBox="0 0 24 24"><path d="${icons[name] || icons.arrow}"></path></svg>`;
}

function render() {
  const state = states[activeStateKey];
  const surface = surfaceCopy[activeSurface];
  document.body.dataset.state = activeStateKey;
  document.body.dataset.surface = activeSurface;
  app.innerHTML = `
    <div class="launcher-shell">
      <aside class="side-panel">
        <div class="brand-block">
          <div class="seal" aria-hidden="true">CS</div>
          <div>
            <div class="brand-name">Townlight</div>
            <div class="brand-city">${config.cityName}</div>
          </div>
        </div>

        <nav class="surface-tabs" aria-label="Launcher surfaces">
          ${Object.entries(surfaceCopy).map(([key, item]) => `
            <button type="button" class="${activeSurface === key ? "active" : ""}" data-surface="${key}">
              <span>${item.label}</span>
            </button>
          `).join("")}
        </nav>

        <div class="state-panel ${state.badge}">
          <span class="state-dot" aria-hidden="true"></span>
          <div>
            <strong>${state.label}</strong>
            <span>${state.summary}</span>
          </div>
        </div>

        <button type="button" class="nav-command" data-open-palette>
          ${icon("search")}
          <span>Command palette</span>
          <kbd>Ctrl K</kbd>
        </button>
      </aside>

      <main class="main-panel">
        <header class="topbar">
          <div>
            <p class="eyebrow">${config.operator}</p>
            <h1>${surface.heading}</h1>
            <p>${surface.subhead}</p>
          </div>
          <div class="topbar-actions">
            ${qaMode ? `<select aria-label="QA state" data-state-select>
              ${Object.keys(states).map((key) => `<option value="${key}" ${key === activeStateKey ? "selected" : ""}>${states[key].label}</option>`).join("")}
            </select>` : ""}
            <button type="button" class="icon-button" aria-label="Open audit drawer" data-open-audit title="Open audit drawer">
              ${icon("audit")}
            </button>
          </div>
        </header>

        <section class="notice-strip ${state.badge}" aria-live="polite">
          ${icon(state.badge === "error" ? "alert" : "shield")}
          <div>
            <strong>${state.label}</strong>
            <span>${state.next}</span>
          </div>
        </section>

        <section class="module-grid" aria-label="City-core modules">
          ${config.modules.map((module) => moduleTile(module, state.statuses[module.id])).join("")}
        </section>

        <section class="work-panel">
          <div class="panel-heading">
            <div>
              <p class="eyebrow">${surface.action}</p>
              <h2>${activeSurface === "admin" ? "Service checklist" : activeSurface === "resident" ? "Available resident paths" : "Staff queue"}</h2>
            </div>
            <span class="mono">state=${activeStateKey}</span>
          </div>
          ${surfaceWork(state)}
        </section>
      </main>
    </div>
    ${drawerOpen ? auditDrawer(state) : ""}
    ${paletteOpen ? commandPalette(state) : ""}
  `;
  wireEvents();
}

function moduleTile(module, status) {
  const disabled = status === "checking";
  const linkLabel = disabled ? "Waiting for health" : status === "error" ? "Open recovery target" : "Open module";
  return `
    <article class="module-tile ${status}" data-module="${module.id}">
      <div class="tile-top">
        <span class="tile-icon">${icon(module.id)}</span>
        <span class="status-pill ${status}">${statusText(status)}</span>
      </div>
      <h2>${module.name}</h2>
      <p>${moduleAction(module)}</p>
      <div class="tile-meta">
        <span>${moduleMeta(module)}</span>
        <span class="mono">:${module.port}</span>
      </div>
      <a class="tile-link ${disabled ? "disabled" : ""}" href="${disabled ? "#" : module.href}" ${disabled ? "aria-disabled=\"true\"" : ""}>
        <span>${linkLabel}</span>${icon("arrow")}
      </a>
    </article>
  `;
}

function surfaceWork(state) {
  if (activeStateKey === "loading") {
    return `<div class="skeleton-list" aria-label="Loading module health">
      <span></span><span></span><span></span>
    </div>`;
  }

  if (activeSurface === "admin") {
    return `
      <div class="service-list">
        ${config.modules.map((module) => {
          const status = state.statuses[module.id];
          return `<div class="service-row">
            <span class="state-dot ${status}" aria-hidden="true"></span>
            <div>
              <strong>${module.name}</strong>
              <span>${status === "ready" ? "Endpoint listed for local runtime." : status === "degraded" ? "Investigate logs before staff work continues." : status === "error" ? "Run the local runtime verify action and confirm required services are healthy." : "Waiting for health check."}</span>
            </div>
            <code>${module.href}</code>
          </div>`;
        }).join("")}
      </div>`;
  }

  if (activeSurface === "resident") {
    return `
      <div class="resident-paths">
        <button type="button">Request public records</button>
        <button type="button">Find council meetings</button>
        <button type="button">Search municipal code</button>
      </div>
      <p class="panel-copy">Each path stays local to the city-core package. If a module is degraded, the tile above gives the fix path before residents are sent into a dead end.</p>
    `;
  }

  if (activeStateKey === "empty") {
    return `<div class="empty-state">
      <strong>No staff events in this browser session.</strong>
      <span>Open a module tile or run the city-core package verify action. The launcher will show new activity in the audit drawer.</span>
    </div>`;
  }

  return `
    <div class="task-list">
      <button type="button"><span>Review incoming records request</span><code>REQ-1184</code></button>
      <button type="button"><span>Prepare Council packet</span><code>CLK-241</code></button>
      <button type="button"><span>Codify adopted ordinance</span><code>CODE-17.20</code></button>
    </div>
  `;
}

function auditDrawer(state) {
  const rows = state.audit.length
    ? state.audit.map((event) => `<li><time>${event.time}</time><span>${event.action}</span><code>${event.source}</code></li>`).join("")
    : `<li class="empty-audit"><span>No audit events yet. Open a module or run package verify to generate local evidence.</span></li>`;

  return `
    <div class="drawer-backdrop" data-close-audit></div>
    <aside class="audit-drawer" role="dialog" aria-modal="true" aria-labelledby="audit-title" tabindex="-1">
      <div class="drawer-heading">
        <div>
          <p class="eyebrow">Cross-module event surface</p>
          <h2 id="audit-title">City-core audit drawer</h2>
        </div>
        <button type="button" class="icon-button" aria-label="Close audit drawer" data-close-audit>${icon("close")}</button>
      </div>
      <ol class="audit-list">${rows}</ol>
      <div class="drawer-footer">
        <button type="button">Export cross-module audit log</button>
        <button type="button">Open evidence folder</button>
      </div>
    </aside>
  `;
}

function commandPalette(state) {
  const commands = [
    ["Open TownlightRecords", "records"],
    ["Open TownlightMeetings", "clerk"],
    ["Open TownlightCode", "code"],
    ["Switch to Staff", "staff"],
    ["Switch to Resident", "resident"],
    ["Switch to IT-Admin", "admin"],
    ["Open audit drawer", "audit"]
  ].filter(([label]) => label.toLowerCase().includes(paletteQuery.toLowerCase()));

  return `
    <div class="palette-backdrop" data-close-palette>
      <section class="command-palette" role="dialog" aria-modal="true" aria-labelledby="palette-title" data-command-palette>
        <h2 id="palette-title" class="palette-title">Command palette</h2>
        <label class="palette-label" for="palette-input">Search commands</label>
        <input id="palette-input" type="search" value="${paletteQuery}" placeholder="Search modules, surfaces, audit..." autocomplete="off">
        <div class="command-results">
          ${commands.length ? commands.map(([label, action], index) => `
            <button type="button" data-command="${action}" class="${index === 0 ? "active" : ""}">
              <span>${label}</span>
              <small>${state.label}</small>
            </button>
          `).join("") : `<div class="empty-state"><strong>No command found.</strong><span>Try records, clerk, code, staff, resident, admin, or audit.</span></div>`}
        </div>
      </section>
    </div>
  `;
}

function wireEvents() {
  app.querySelectorAll("[data-surface]").forEach((button) => {
    button.addEventListener("click", () => {
      activeSurface = button.dataset.surface;
      render();
    });
  });

  app.querySelector("[data-state-select]")?.addEventListener("change", (event) => {
    activeStateKey = event.target.value;
    render();
  });

  app.querySelectorAll("[data-open-audit]").forEach((button) => {
    button.addEventListener("click", () => {
      previousFocus = document.activeElement;
      drawerOpen = true;
      render();
      app.querySelector(".audit-drawer")?.focus();
    });
  });

  app.querySelectorAll("[data-close-audit]").forEach((button) => {
    button.addEventListener("click", closeDrawer);
  });

  app.querySelectorAll("[data-open-palette]").forEach((button) => {
    button.addEventListener("click", openPalette);
  });

  app.querySelectorAll("[data-close-palette]").forEach((element) => {
    element.addEventListener("click", (event) => {
      if (event.target === element) closePalette();
    });
  });

  const paletteInput = app.querySelector("#palette-input");
  if (paletteInput) {
    paletteInput.focus();
    paletteInput.setSelectionRange(paletteInput.value.length, paletteInput.value.length);
    paletteInput.addEventListener("input", (event) => {
      paletteQuery = event.target.value;
      render();
    });
    paletteInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        const command = app.querySelector("[data-command]");
        if (command) runCommand(command.dataset.command);
      }
    });
  }

  app.querySelectorAll("[data-command]").forEach((button) => {
    button.addEventListener("click", () => runCommand(button.dataset.command));
  });
}

function openPalette() {
  previousFocus = document.activeElement;
  paletteOpen = true;
  render();
}

function closePalette() {
  paletteOpen = false;
  paletteQuery = "";
  render();
  previousFocus?.focus?.();
}

function closeDrawer() {
  drawerOpen = false;
  render();
  previousFocus?.focus?.();
}

function runCommand(action) {
  if (["staff", "resident", "admin"].includes(action)) {
    activeSurface = action;
    closePalette();
    return;
  }

  if (action === "audit") {
    paletteOpen = false;
    drawerOpen = true;
    render();
    app.querySelector(".audit-drawer")?.focus();
    return;
  }

  const module = config.modules.find((item) => item.id === action);
  if (module) window.location.href = module.href;
}

function trapDialogFocus(event) {
  const dialog = app.querySelector(".command-palette, .audit-drawer");
  if (!dialog || event.key !== "Tab") return;

  const focusable = Array.from(dialog.querySelectorAll("button, input, select, textarea, a[href], [tabindex]"))
    .filter((element) => !element.disabled && element.getAttribute("aria-disabled") !== "true");
  if (!focusable.length) return;

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

document.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();
  if ((event.ctrlKey || event.metaKey) && key === "k") {
    event.preventDefault();
    openPalette();
  }
  trapDialogFocus(event);
  if (event.key === "Escape") {
    if (paletteOpen) closePalette();
    else if (drawerOpen) closeDrawer();
  }
});

render();

// QA fixture marker: qa=1&state=loading|success|empty|error|partial
