type MaintenanceLink = { id: string; request_id: string };
type MaintenanceEntry = { link: MaintenanceLink; request: Record<string, unknown> };

type MaintenanceContext = {
  call: (op: string, extra?: Record<string, unknown>) => Promise<unknown>;
  run: <T>(label: string, task: () => Promise<T>) => Promise<T>;
  status: (message: string) => void;
};

type MaintenanceOptions = {
  requestCall: (op: string, extra?: Record<string, unknown>) => Promise<unknown>;
  openServiceRequest: (id: string) => void;
};

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs?: Record<string, string>,
  children?: (string | Node)[],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (attrs) for (const key in attrs) node.setAttribute(key, attrs[key]);
  if (children) {
    for (const child of children) {
      node.append(typeof child === "string" ? document.createTextNode(child) : child);
    }
  }
  return node;
}

function newCommandId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  const wrapped = (value as { categories?: unknown } | null | undefined)?.categories;
  return Array.isArray(wrapped) ? wrapped : [];
}

export function renderMaintenance(): string {
  return [
    '<section class="parks-maintenance" data-parks-maintenance>',
    '<header class="maintenance-header">',
    "<h2>Maintenance</h2>",
    '<button type="button" data-maintenance-refresh>Refresh</button>',
    "</header>",
    '<p class="maintenance-hint" data-maintenance-hint>Select a resource to view maintenance requests.</p>',
    '<form class="maintenance-create" data-maintenance-create hidden>',
    '<label>Category<select name="category" data-maintenance-category required></select></label>',
    '<label>Description<textarea name="description" data-maintenance-description required></textarea></label>',
    '<label>Contact email (optional)<input name="email" type="email" data-maintenance-email /></label>',
    '<button type="submit" data-maintenance-submit>Create request</button>',
    "</form>",
    '<ul class="maintenance-list" data-maintenance-list></ul>',
    '<div class="maintenance-detail" data-maintenance-detail hidden></div>',
    "</section>",
  ].join("");
}

export function bindMaintenance(
  root: HTMLElement,
  ctx: MaintenanceContext,
  options: MaintenanceOptions,
): () => void {
  const listEl = root.querySelector<HTMLUListElement>("[data-maintenance-list]");
  const formEl = root.querySelector<HTMLFormElement>("[data-maintenance-create]");
  const categoryEl = root.querySelector<HTMLSelectElement>("[data-maintenance-category]");
  const descriptionEl = root.querySelector<HTMLTextAreaElement>("[data-maintenance-description]");
  const emailEl = root.querySelector<HTMLInputElement>("[data-maintenance-email]");
  const hintEl = root.querySelector<HTMLElement>("[data-maintenance-hint]");
  const detailEl = root.querySelector<HTMLElement>("[data-maintenance-detail]");
  const refreshBtn = root.querySelector<HTMLButtonElement>("[data-maintenance-refresh]");
  const submitBtn = root.querySelector<HTMLButtonElement>("[data-maintenance-submit]");

  if (!listEl || !formEl || !categoryEl || !descriptionEl || !emailEl || !hintEl || !detailEl || !refreshBtn || !submitBtn) {
    return () => undefined;
  }

  let resourceId = "";
  let commandId = "";
  let lastSignature = "";
  let entries: MaintenanceEntry[] = [];
  let activeLinkId = "";

  function report(message: string) {
    hintEl!.textContent = message;
    try {
      ctx.status(message);
    } catch {
      /* status is optional */
    }
  }

  function resetCommand() {
    commandId = "";
    lastSignature = "";
  }

  function clearState() {
    entries = [];
    activeLinkId = "";
    listEl!.replaceChildren();
    detailEl!.replaceChildren();
    detailEl!.hidden = true;
  }

  async function loadCategories() {
    const response = await options.requestCall("categories");
    const rows = asArray(response);
    const seen = new Set<string>();
    categoryEl!.replaceChildren(el("option", { value: "" }, ["Select category"]));
    for (const row of rows) {
      if (!row || typeof row !== "object") continue;
      const record = row as Record<string, unknown>;
      if (record.active === false || record.is_active === false || record.disabled === true) continue;
      const code = String(record.code ?? record.id ?? record.value ?? "").trim();
      if (!code || seen.has(code)) continue;
      seen.add(code);
      const label = String(record.label ?? record.name ?? record.title ?? code);
      categoryEl!.append(el("option", { value: code }, [label]));
    }
  }

  function renderEntries() {
    listEl!.replaceChildren();
    for (const entry of entries) {
      const li = document.createElement("li");
      const button = el("button", { type: "button", "data-link-id": entry.link.id });
      const state = String((entry.request as { state?: unknown })?.state ?? "state");
      button.textContent = `${entry.link.id} · ${state}`;
      button.addEventListener("click", () => {
        void selectLink(entry.link.id);
      });
      li.append(button);
      listEl!.append(li);
    }
  }

  async function loadList(id: string) {
    const raw = await ctx.run("maintenance:list", () =>
      ctx.call("maintenance-list", { resource_id: id }),
    );
    if (!Array.isArray(raw)) {
      throw new Error("Malformed maintenance list response.");
    }
    entries = raw.map((row) => {
      if (!row || typeof row !== "object") {
        throw new Error("Malformed maintenance list entry.");
      }
      const candidate = row as { link?: { id?: unknown; request_id?: unknown }; request?: unknown };
      const link = (candidate.link ?? {}) as { id?: unknown; request_id?: unknown };
      const linkId = String(link.id ?? "").trim();
      const requestId = String(link.request_id ?? "").trim();
      if (!linkId || !requestId) {
        throw new Error("Malformed maintenance link entry.");
      }
      if (!candidate.request || typeof candidate.request !== "object") {
        throw new Error("Malformed maintenance request entry.");
      }
      return {
        link: { id: linkId, request_id: requestId },
        request: candidate.request as Record<string, unknown>,
      };
    });
    renderEntries();
  }

  async function selectLink(linkId: string) {
    activeLinkId = linkId;
    const raw = await ctx.run("maintenance:get", () =>
      ctx.call("maintenance-get", { link_id: linkId }),
    );
    renderDetail(raw);
  }

  function renderDetail(raw: unknown) {
    detailEl!.replaceChildren();
    detailEl!.hidden = false;
    if (!raw || typeof raw !== "object") return;

    const record = raw as { link?: { request_id?: unknown; id?: unknown }; request?: Record<string, unknown>; state?: unknown; revision?: unknown; request_id?: unknown };
    const request = record.request ?? {};
    const link = record.link ?? {};
    const state = String(request.state ?? record.state ?? "unknown");
    const revision = request.revision ?? record.revision;
    const requestId = String(link.request_id ?? request.id ?? record.request_id ?? "");

    const summary = el("p", { class: "maintenance-state" }, [`State: ${state}`]);
    if (request.assignee) summary.append(document.createTextNode(` · assignee ${String(request.assignee)}`));
    if (revision !== undefined && revision !== null && revision !== "") {
      summary.append(document.createTextNode(` · revision ${String(revision)}`));
    }
    detailEl!.append(summary);

    if (request.description) {
      detailEl!.append(el("p", { class: "maintenance-description" }, [String(request.description)]));
    }

    const events = Array.isArray(request.events) ? (request.events as unknown[]) : [];
    if (events.length) {
      const ul = el("ul", { class: "maintenance-events" });
      for (const item of events) {
        const entry = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
        const payload = entry.payload && typeof entry.payload === "object"
          ? (entry.payload as Record<string, unknown>)
          : {};
        let text = String(entry.message ?? entry.action ?? entry.state ?? "event");
        if (entry.type === "state_changed" || payload.to !== undefined) {
          text = `${String(payload.from ?? "?")} → ${String(payload.to ?? "?")}: ${text}`;
        }
        if (entry.actor) text += ` · ${String(entry.actor)}`;
        if (entry.created_at) text += ` · ${String(entry.created_at)}`;
        ul.append(el("li", {}, [text]));
      }
      detailEl!.append(ul);
    }

    const attachments = Array.isArray(request.attachments) ? (request.attachments as unknown[]) : [];
    if (attachments.length) {
      const ul = el("ul", { class: "maintenance-attachments" });
      for (const item of attachments) {
        const attachment = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
        const name = String(attachment.name ?? attachment.id ?? "attachment");
        const mediaType = attachment.media_type ? ` · ${String(attachment.media_type)}` : "";
        const size = attachment.size !== undefined ? ` · ${String(attachment.size)} bytes` : "";
        const sha256 = attachment.sha256 ? ` · sha256 ${String(attachment.sha256)}` : "";
        ul.append(el("li", {}, [`${name}${mediaType}${size}${sha256}`]));
      }
      detailEl!.append(ul);
    }

    if (requestId) {
      const open = el("button", { type: "button", class: "open-service-request" }, ["Open in 311"]);
      open.addEventListener("click", () => options.openServiceRequest(requestId));
      detailEl!.append(open);
    }
  }

  async function submitCreate(ev: Event) {
    ev.preventDefault();
    if (!resourceId) {
      report("Select a resource first.");
      return;
    }
    const category = categoryEl!.value;
    const description = descriptionEl!.value.trim();
    const email = emailEl!.value.trim();
    if (!category) {
      report("Select a category.");
      return;
    }
    if (!description) {
      report("Enter a description.");
      return;
    }

    const base = {
      category,
      description,
      contact: email ? { email } : {},
    };
    const signature = JSON.stringify(base);
    if (signature !== lastSignature) {
      lastSignature = signature;
      commandId = newCommandId();
    } else if (!commandId) {
      commandId = newCommandId();
    }

    const payload = { command_id: commandId, ...base };

    submitBtn!.disabled = true;
    report("Submitting maintenance request…");
    try {
      const result = await ctx.run("maintenance:create", () =>
        ctx.call("maintenance-create", { resource_id: resourceId, payload }),
      );
      resetCommand();
      formEl!.reset();
      report("Maintenance request created.");
      if (result) renderDetail(result);
      const createdLinkId = String(
        ((result as { link?: { id?: unknown } } | null)?.link?.id ?? "").toString(),
      );
      await loadList(resourceId);
      const target = createdLinkId || activeLinkId;
      if (target) {
        try {
          await selectLink(target);
        } catch {
          /* keep the list view */
        }
      }
    } catch (err) {
      report(`Create failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      submitBtn!.disabled = false;
    }
  }

  async function handleResourceSelected(ev: Event) {
    const detail = (ev as CustomEvent<{ id?: unknown }>).detail;
    const id = detail?.id;
    if (!id) {
      resourceId = "";
      resetCommand();
      clearState();
      formEl!.hidden = true;
      report("Select a resource to view maintenance requests.");
      return;
    }
    resourceId = String(id);
    resetCommand();
    clearState();
    formEl!.hidden = false;
    report("");
    try {
      await loadCategories();
      await loadList(resourceId);
    } catch (err) {
      report(`Load failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async function handleRefresh() {
    if (!resourceId) return;
    try {
      await loadList(resourceId);
      if (activeLinkId) await selectLink(activeLinkId);
      report("Refreshed.");
    } catch (err) {
      report(`Refresh failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const onRefresh = () => {
    void handleRefresh();
  };
  const onSelected = (ev: Event) => {
    void handleResourceSelected(ev);
  };

  formEl.addEventListener("submit", submitCreate);
  refreshBtn.addEventListener("click", onRefresh);
  root.addEventListener("parks-resource-selected", onSelected as EventListener);

  return () => {
    formEl!.removeEventListener("submit", submitCreate);
    refreshBtn!.removeEventListener("click", onRefresh);
    root.removeEventListener("parks-resource-selected", onSelected as EventListener);
  };
}
