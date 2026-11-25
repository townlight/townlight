import { createDataPublication } from "./data-publication.ts";
import { createRecordLinks } from "./record-links.ts";
import { createEmailSettings } from "./email-settings.ts";
import { createInterchangeView } from "./interchange.ts";
import { createRecordsHandoff } from "./records-handoff.ts";
import { fillSelect, renderAttachmentsInto, renderDeliveryInto, renderDetailForms, renderEventsInto, renderQueueInto, renderServiceRequests, renderTrackingInto } from "./render.ts";
type Invoke = (command: string, args: { request: Record<string, unknown> }) => Promise<unknown>;
type ViewOptions = { isAdmin?: boolean; openRecords?: (id: string) => void | Promise<void> };
export function createServiceRequestsView(invoke: Invoke, options: ViewOptions = { isAdmin: false }) {
  const bound = new WeakSet<object>();
  const emailSettings = createEmailSettings(call);
  const interchange = createInterchangeView(call);
  let scope: ParentNode = document, currentId: string | null = null, currentDetail: any = null;
  let offset = 0, lastQueueCount = 0, pending = 0, assigneeItems: any[] = [];
  let createKey: string | null = null, createToken: string | null = null, latestTracking = "", latestToken = "";
  const recordsHandoff = createRecordsHandoff(call, () => currentId && Number.isInteger(currentDetail?.revision) ? { id: currentId, revision: currentDetail.revision } : null, options.openRecords);
  const recordLinks = createRecordLinks(call, () => currentId && Number.isInteger(currentDetail?.revision) ? { id: currentId, revision: currentDetail.revision } : null, refreshAfter);
  const dataPublication = createDataPublication(call, () => Boolean(options.isAdmin));
  const q = <T extends Element = HTMLElement>(selector: string): T | null => scope.querySelector<T>(selector);
  const asArray = (value: any): any[] => Array.isArray(value) ? value : [];
  function setStatus(message: string, isError = false): void {
    const status = q("[data-status]"); if (!status) return;
    status.textContent = message; status.setAttribute("data-error", String(isError));
  }
  const errorText = (error: unknown): string => String((error as any)?.error?.message ?? (error as any)?.message ?? (error as any)?.code ?? error ?? "Request failed");
  const staleError = (error: unknown): boolean => /stale|revision|conflict|precondition|409/i.test(errorText(error));
  function handleFailure(error: unknown): void {
    setStatus(staleError(error) ? "This request changed or the revision is stale. Refresh the detail and review the current request before retrying. Your form has been preserved." : errorText(error), true);
  }
  function syncPrevNext(): void {
    const prev = q<HTMLButtonElement>("[data-prev]"), next = q<HTMLButtonElement>("[data-next]");
    if (prev) prev.disabled = offset === 0; if (next) next.disabled = lastQueueCount < 50;
  }
  function setBusy(busy: boolean): void {
    pending = Math.max(0, pending + (busy ? 1 : -1));
    scope.querySelectorAll<HTMLButtonElement>("button").forEach((button) => { button.disabled = pending > 0; });
    if (pending === 0) syncPrevNext();
  }
  async function run<T>(action: () => Promise<T>): Promise<T> { setBusy(true); try { return await action(); } finally { setBusy(false); } }
  const attempt = async (action: () => Promise<unknown>): Promise<void> => {
    try { await run(action); } catch (error) { handleFailure(error); }
  };
  async function call(operation: string, extra: Record<string, unknown> = {}): Promise<any> {
    const response: any = await invoke("service_requests_request", { request: { operation, ...extra } });
    return response && typeof response === "object" && "result" in response ? response.result : response;
  }
  function fillAssignees(): void {
    fillSelect(q<HTMLSelectElement>('[data-transition] select[name="assignee"]'), assigneeItems, (item) => String(item?.id ?? ""), (item) => String(item?.full_name ?? item?.id ?? ""), "Select assignee");
  }
  async function loadCategories(): Promise<void> {
    try {
      const response: any = await call("categories");
      const categories = asArray(response?.categories ?? response);
      const departments = Array.from(new Set(categories.map((item) => String(item?.department ?? "")).filter(Boolean))).map((department) => ({ department }));
      fillSelect(q<HTMLSelectElement>('[data-create] select[name="category"]'), categories.filter((item) => item?.active !== false), (item) => String(item?.code ?? ""), (item) => `${String(item?.name ?? item?.code ?? "")} (${String(item?.code ?? "")})`, "Select category");
      fillSelect(q<HTMLSelectElement>('[data-filter] select[name="department"]'), departments, (item) => item.department, (item) => item.department, "All departments");
    } catch (error) { setStatus(`Could not load categories: ${errorText(error)}`, true); }
  }
  async function loadAssignees(): Promise<void> {
    try {
      const response: any = await call("assignees");
      assigneeItems = asArray(response?.assignees ?? response); fillAssignees();
    } catch (error) { setStatus(`Could not load assignees: ${errorText(error)}`, true); }
  }
  async function loadQueue(): Promise<void> {
    const filters: Record<string, unknown> = { limit: 50, offset };
    const department = q<HTMLSelectElement>('[data-filter] select[name="department"]')?.value ?? "";
    const state = q<HTMLSelectElement>('[data-filter] select[name="state"]')?.value ?? "";
    if (department) filters.department = department; if (state) filters.state = state;
    const response: any = await call("requests", { filters });
    const items = asArray(response?.requests ?? response?.queue ?? response);
    lastQueueCount = items.length; renderQueueInto(q<HTMLTableSectionElement>("[data-requests]"), items);
    const page = q("[data-page]");
    if (page) page.textContent = items.length ? `Page ${Math.floor(offset / 50) + 1}, showing ${offset + 1}-${offset + items.length}` : "No requests";
    syncPrevNext();
  }
  async function loadDetail(id: string): Promise<void> {
    const response: any = await call("request", { id });
    const detail = response?.request ?? response;
    if (!detail || typeof detail !== "object") throw new Error("Request detail is unavailable.");
    const nextId = String(detail.id ?? id), changed = currentId !== nextId;
    currentId = nextId; currentDetail = detail;
    const section = q("[data-detail]"); if (!section) return;
    if (changed || !section.querySelector("[data-transition]")) section.innerHTML = renderDetailForms();
    fillAssignees();
    const title = q("[data-detail-title]"), meta = q("[data-detail-meta]");
    if (title) title.textContent = String(detail.title ?? detail.tracking ?? detail.description ?? `Request ${currentId}`);
    if (meta) meta.textContent = `State: ${String(detail.state ?? "unknown")} · Revision: ${String(detail.revision ?? "unknown")}`;
    renderEventsInto(q<HTMLOListElement>("[data-events]"), asArray(detail.events));
    renderAttachmentsInto(q<HTMLUListElement>("[data-attachments]"), asArray(detail.attachments));
    renderDeliveryInto(q<HTMLUListElement>("[data-delivery]"), asArray(detail.notifications));
  }
  async function refreshAfter(): Promise<void> { await Promise.all([loadQueue(), currentId ? loadDetail(currentId) : Promise.resolve()]); }
  async function refreshQuietly(): Promise<void> {
    try { await refreshAfter(); } catch (error) { setStatus(`Saved, but refresh failed: ${errorText(error)}. Refresh and review the request.`, true); }
  }
  function revision(): unknown {
    if (!currentDetail || currentDetail.revision === undefined || currentDetail.revision === null) throw new Error("Request revision is unavailable. Refresh the detail before continuing.");
    return currentDetail.revision;
  }
  function base64url(bytes: Uint8Array): string {
    let binary = ""; for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]);
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function makeToken(): string { const bytes = new Uint8Array(32); crypto.getRandomValues(bytes); return base64url(bytes); }
  function arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer); let encoded = "";
    for (let start = 0; start < bytes.length; start += 0x6000) {
      const end = Math.min(start + 0x6000, bytes.length); let binary = "";
      for (let index = start; index < end; index += 1) binary += String.fromCharCode(bytes[index]);
      encoded += btoa(binary);
    }
    return encoded;
  }
  function mediaType(file: File): string {
    const type = (file.type || "").toLowerCase();
    if (["image/png", "image/jpeg", "application/pdf", "text/plain"].includes(type)) return type;
    const extension = file.name.toLowerCase().split(".").pop() ?? "";
    return ({ png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", pdf: "application/pdf", txt: "text/plain", text: "text/plain" } as Record<string, string>)[extension] ?? "";
  }
  function field(data: FormData, name: string): string { const value = data.get(name); return typeof value === "string" ? value.trim() : ""; }
  function showReceipt(label: string, response: any): void {
    const receipt = response?.receipt ?? response;
    if (receipt && typeof receipt === "object" && ("path" in receipt || "sha256" in receipt || "size_bytes" in receipt)) {
      setStatus(`${label} receipt: path=${String(receipt.path ?? "")}, sha256=${String(receipt.sha256 ?? "")}, size_bytes=${String(receipt.size_bytes ?? "")}`);
    } else setStatus(`${label} completed.`);
  }
  async function copyTracking(): Promise<void> {
    try {
      if (!latestTracking) throw new Error("No tracking value is available.");
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard access is unavailable.");
      const privateText = `Tracking: ${latestTracking}\nResident token (shown once): ${latestToken || "Unavailable"}`;
      await navigator.clipboard.writeText(privateText); setStatus("Private tracking and resident token copied to the clipboard. Keep them private.");
    } catch (error) { setStatus(`Could not copy tracking: ${errorText(error)}`, true); }
  }
  async function createRequest(form: HTMLFormElement): Promise<void> {
    const data = new FormData(form);
    const category = field(data, "category"), description = field(data, "description"), location = field(data, "location");
    if (!category || !description || !location) throw new Error("Category, description, and location are required.");
    createKey ??= crypto.randomUUID(); createToken ??= makeToken();
    const response: any = await call("create-request", { payload: {
      category, description, location,
      contact: { name: field(data, "contact_name"), email: field(data, "contact_email"), phone: field(data, "contact_phone") },
      resident_token: createToken, idempotency_key: createKey,
    } });
    const created = response?.request ?? response, id = created?.id ?? response?.id;
    const tracking = String(response?.tracking ?? created?.tracking ?? "");
    const token = String(response?.resident_token ?? response?.token ?? createToken);
    latestTracking = tracking; latestToken = token; renderTrackingInto(q("[data-tracking]"), tracking, token);
    form.reset(); createKey = null; createToken = null;
    if (id !== undefined && id !== null) currentId = String(id);
    setStatus("Service request created. Private tracking and token are shown once."); await refreshQuietly();
  }
  async function saveCategory(form: HTMLFormElement): Promise<void> {
    const data = new FormData(form);
    const code = field(data, "code"), name = field(data, "name"), department = field(data, "department");
    if (!code || !name || !department) throw new Error("Category code, name, and department are required.");
    await call("save-category", { payload: { code, name, department, active: data.get("active") === "on" } });
    form.reset(); await loadCategories(); setStatus("Category saved.");
  }
  async function transition(form: HTMLFormElement): Promise<void> {
    const data = new FormData(form), target = field(data, "target"), reason = field(data, "reason");
    if (!target || !reason) throw new Error("Target state and reason are required.");
    const payload: Record<string, unknown> = { target, reason, expected_revision: revision() };
    for (const name of ["department", "assignee", "priority", "duplicate_of"]) { const value = field(data, name); if (value) payload[name] = value; }
    const dueAt = field(data, "due_at");
    if (dueAt) { const due = new Date(dueAt); if (Number.isNaN(due.getTime())) throw new Error("Due date is invalid."); payload.due_at = due.toISOString(); }
    await call("transition", { id: currentId, payload }); form.reset(); setStatus("Request transitioned."); await refreshQuietly();
  }
  async function comment(form: HTMLFormElement): Promise<void> {
    const data = new FormData(form), message = field(data, "message");
    if (!message) throw new Error("Comment message is required.");
    await call("comment", { id: currentId, payload: { message, public: data.get("public") === "on", expected_revision: revision() } });
    form.reset(); setStatus("Comment added."); await refreshQuietly();
  }
  async function attach(form: HTMLFormElement): Promise<void> {
    const input = form.querySelector<HTMLInputElement>('input[type="file"]'), file = input?.files?.[0];
    if (!file) throw new Error("Select a file to attach.");
    if (file.size > 10 * 1024 * 1024) throw new Error("File must be 10 MiB or smaller.");
    const media = mediaType(file); if (!media) throw new Error("Only PNG, JPEG, PDF, and plain text files are allowed.");
    const data = new FormData(form), contentBase64 = arrayBufferToBase64(await file.arrayBuffer());
    await call("attach", { id: currentId, payload: { expected_revision: revision(), name: file.name, media_type: media, content_base64: contentBase64, public: data.get("public") === "on" } });
    form.reset(); setStatus("Attachment uploaded."); await refreshQuietly();
  }
  async function archive(): Promise<void> {
    if (!currentId) throw new Error("Select a request before archiving.");
    const response = await call("archive", { id: currentId }); showReceipt("Archive", response); await refreshQuietly();
  }
  async function download(button: HTMLElement): Promise<void> {
    if (!currentId) throw new Error("Select a request before downloading an attachment.");
    const attachmentId = button.dataset.download; if (!attachmentId) throw new Error("Attachment identifier is unavailable.");
    showReceipt("Attachment download", await call("download-attachment", { id: currentId, payload: { attachment_id: attachmentId } }));
  }
  async function onSubmit(event: Event): Promise<void> {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || !form.matches("[data-filter],[data-create],[data-category],[data-transition],[data-comment],[data-attach]")) return;
    event.preventDefault();
    if (form.matches("[data-filter]")) await attempt(async () => { offset = 0; await loadQueue(); });
    else if (form.matches("[data-create]")) await attempt(() => createRequest(form));
    else if (form.matches("[data-category]")) await attempt(() => saveCategory(form));
    else if (form.matches("[data-transition]")) await attempt(() => transition(form));
    else if (form.matches("[data-comment]")) await attempt(() => comment(form));
    else await attempt(() => attach(form));
  }
  async function onClick(event: MouseEvent): Promise<void> {
    const target = event.target; if (!(target instanceof Element)) return;
    if (target.closest("[data-copy-tracking]")) { await copyTracking(); return; }
    const open = target.closest<HTMLElement>("[data-open]");
    if (open) { await attempt(async () => { await loadDetail(String(open.dataset.open ?? "")); setStatus("Request detail loaded."); }); return; }
    if (target.closest("[data-prev]")) { if (offset > 0) offset -= 50; await attempt(loadQueue); return; }
    if (target.closest("[data-next]")) { if (lastQueueCount === 50) offset += 50; await attempt(loadQueue); return; }
    if (target.closest("[data-refresh-detail]")) { await attempt(async () => { await loadDetail(currentId ?? ""); setStatus("Request detail refreshed."); }); return; }
    if (target.closest("[data-archive]")) { await attempt(archive); return; }
    const downloadButton = target.closest<HTMLElement>("[data-download]"); if (downloadButton) await attempt(() => download(downloadButton));
  }
  function render(): string {
    const markup = renderServiceRequests(Boolean(options.isAdmin));
    return markup.replace("</main>", `${interchange.render()}${recordsHandoff.render()}${recordLinks.render()}${options.isAdmin ? emailSettings.render() : ""}</main>`);
  }
  function bind(target: ParentNode = document): void {
    const root = target instanceof Element
      ? target.matches("[data-service-requests-view]") ? target : target.querySelector<HTMLElement>("[data-service-requests-view]")
      : target.querySelector<HTMLElement>("[data-service-requests-view]");
    if (!root || bound.has(root)) return;
    bound.add(root); scope = root;
    interchange.bind(root);
    recordsHandoff.bind(root);
    recordLinks.bind(root);
    if (Boolean(options.isAdmin)) emailSettings.bind(root);
    root.appendChild(dataPublication.render());
    const events = root as unknown as EventTarget;
    events.addEventListener("submit", onSubmit as EventListener); events.addEventListener("click", onClick as EventListener);
    void run(loadCategories); void run(loadAssignees); void run(loadQueue).catch(handleFailure);
  }
  return {
    render,
    bind,
    open: async (id: string) => {
      try {
        await run(() => loadDetail(id));
      } catch (error) {
        handleFailure(error);
      }
    }
  };
}
