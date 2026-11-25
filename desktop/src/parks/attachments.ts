import { encodeFile } from "../communications/file-bytes.ts";

const MIN_BYTES = 1;
const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPT_ATTR = "image/png,image/jpeg,application/pdf,text/plain";
const ALLOWED_TYPES = new Set<string>([
  "image/png",
  "image/jpeg",
  "application/pdf",
  "text/plain",
]);
const EXT_TYPES: Readonly<Record<string, string>> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  pdf: "application/pdf",
  txt: "text/plain",
};

export type SourceKind = "resource" | "program" | "booking" | "registration";

interface SourceSelection {
  kind: SourceKind;
  id: string;
}

interface AttachmentRecord {
  id: string;
  entity_kind: string;
  entity_id: string;
  name: string;
  media_type: string;
  sha256: string;
  size: number;
  actor: string;
  created_at: string;
}

interface ListReply {
  items: AttachmentRecord[];
  overflow: boolean;
}

interface DownloadReceipt {
  path: string;
  sha256: string;
  size_bytes: number;
}

export interface AttachmentBindContext {
  call<T = unknown>(method: string, params?: unknown): Promise<T>;
  run(label: string, task: () => Promise<void>): Promise<void>;
  status(message: string, kind?: "info" | "error" | "success"): void;
}

const bound = new WeakSet<HTMLElement>();

export function renderAttachments(): string {
  return `
<section class="parks-attachments" data-attachments>
  <header class="parks-attachments__header">
    <h3 class="parks-attachments__title">Attachments</h3>
    <label class="parks-attachments__upload">
      <span>Add file</span>
      <input
        type="file"
        accept="${ACCEPT_ATTR}"
        data-attachments-file
        aria-label="Add attachment"
      >
    </label>
  </header>
  <p class="parks-attachments__hint">PNG, JPEG, PDF, or plain text &middot; 1 byte to 10 MiB.</p>
  <div
    class="parks-attachments__status"
    role="status"
    aria-live="polite"
    data-attachments-status
  ></div>
  <ul class="parks-attachments__list" data-attachments-list></ul>
  <div class="parks-attachments__receipt" data-attachments-receipt hidden></div>
</section>
`.trim();
}

function isSourceKind(value: unknown): value is SourceKind {
  return (
    value === "resource" ||
    value === "program" ||
    value === "booking" ||
    value === "registration"
  );
}

function formatBytes(size: number): string {
  if (!Number.isFinite(size) || size < 0) return String(size);
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KiB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MiB`;
}

function inferMediaType(file: File): string {
  const declared = (file.type || "").toLowerCase().trim();
  if (ALLOWED_TYPES.has(declared)) return declared;
  const match = file.name.toLowerCase().match(/\.([a-z0-9]+)$/);
  if (match && match[1] in EXT_TYPES) return EXT_TYPES[match[1]];
  throw new Error(`Unsupported file type: ${file.type || file.name}`);
}

function buildRow(item: AttachmentRecord): HTMLLIElement {
  const li = document.createElement("li");
  li.className = "parks-attachments__item";
  li.dataset.attachmentId = item.id;

  const name = document.createElement("span");
  name.className = "parks-attachments__name";
  name.textContent = item.name;
  name.title = item.name;

  const meta = document.createElement("span");
  meta.className = "parks-attachments__meta";
  meta.textContent = `${formatBytes(item.size)} · ${item.media_type} · sha256 ${item.sha256.slice(0, 12)}…`;
  meta.title = `${item.sha256} (${item.size} bytes)`;

  const download = document.createElement("button");
  download.type = "button";
  download.className = "parks-attachments__download";
  download.textContent = "Download";
  download.dataset.attachmentDownload = "true";

  li.append(name, meta, download);
  return li;
}

export function bindAttachments(root: HTMLElement, ctx: AttachmentBindContext): void {
  if (bound.has(root)) return;
  bound.add(root);

  const fileInput = root.querySelector<HTMLInputElement>("[data-attachments-file]");
  const listEl = root.querySelector<HTMLUListElement>("[data-attachments-list]");
  const statusEl = root.querySelector<HTMLElement>("[data-attachments-status]");
  const receiptEl = root.querySelector<HTMLElement>("[data-attachments-receipt]");
  if (!fileInput || !listEl || !statusEl || !receiptEl) {
    throw new Error("attachments: required elements missing");
  }

  let current: SourceSelection | null = null;
  let loadSeq = 0;
  const currentItems = new Map<string, AttachmentRecord>();

  const setStatus = (
    message: string,
    kind: "info" | "error" | "success" = "info",
  ): void => {
    statusEl.textContent = message;
    statusEl.dataset.kind = kind;
  };

  const clearReceipt = (): void => {
    receiptEl.replaceChildren();
    receiptEl.hidden = true;
  };

  const clearList = (): void => {
    currentItems.clear();
    listEl.replaceChildren();
    clearReceipt();
  };

  const renderList = (reply: ListReply): void => {
    currentItems.clear();
    listEl.replaceChildren();
    if (reply.items.length === 0) {
      const empty = document.createElement("li");
      empty.className = "parks-attachments__empty";
      empty.textContent = "No attachments yet.";
      listEl.append(empty);
      return;
    }
    for (const item of reply.items) {
      currentItems.set(item.id, item);
      listEl.append(buildRow(item));
    }
    if (reply.overflow) {
      const more = document.createElement("li");
      more.className = "parks-attachments__overflow";
      more.textContent = "Additional attachments are available on the server.";
      listEl.append(more);
    }
  };

  const refreshList = async (source: SourceSelection): Promise<void> => {
    const seq = ++loadSeq;
    const reply = await ctx.call<ListReply>("attachment-list", {
      kind: source.kind,
      entity_id: source.id,
    });
    if (seq !== loadSeq) return;
    if (!current || current.kind !== source.kind || current.id !== source.id) {
      return;
    }
    if (!reply || !Array.isArray(reply.items)) {
      setStatus("Attachment list response was invalid.", "error");
      return;
    }
    renderList(reply);
  };

  const renderReceipt = (
    item: AttachmentRecord,
    receipt: DownloadReceipt,
  ): void => {
    if (
      typeof receipt?.path !== "string" ||
      typeof receipt?.sha256 !== "string" ||
      typeof receipt?.size_bytes !== "number"
    ) {
      throw new Error("Download receipt was invalid.");
    }
    if (receipt.sha256 !== item.sha256 || receipt.size_bytes !== item.size) {
      throw new Error("Downloaded file failed integrity verification.");
    }
    receiptEl.replaceChildren();
    const heading = document.createElement("p");
    heading.className = "parks-attachments__receipt-heading";
    heading.textContent = `Saved ${item.name} to the export folder.`;
    const pathLine = document.createElement("p");
    pathLine.className = "parks-attachments__receipt-path";
    pathLine.textContent = `Path: ${receipt.path}`;
    const hashLine = document.createElement("p");
    hashLine.className = "parks-attachments__receipt-hash";
    hashLine.textContent = `SHA-256: ${receipt.sha256}`;
    const sizeLine = document.createElement("p");
    sizeLine.className = "parks-attachments__receipt-size";
    sizeLine.textContent = `Size: ${receipt.size_bytes} bytes`;
    receiptEl.append(heading, pathLine, hashLine, sizeLine);
    receiptEl.hidden = false;
  };

  const handleDownload = async (item: AttachmentRecord): Promise<void> => {
    setStatus(`Downloading ${item.name}…`);
    const receipt = await ctx.call<DownloadReceipt>("download-attachment", {
      attachment_id: item.id,
    });
    renderReceipt(item, receipt);
    setStatus(`Downloaded ${item.name}.`, "success");
  };

  const handleUpload = async (file: File): Promise<void> => {
    if (!current) {
      setStatus("Select a park record before uploading.", "error");
      return;
    }
    if (file.size < MIN_BYTES || file.size > MAX_BYTES) {
      setStatus("Attachment must be between 1 byte and 10 MiB.", "error");
      return;
    }
    let mediaType: string;
    try {
      mediaType = inferMediaType(file);
    } catch (err) {
      setStatus(
        err instanceof Error ? err.message : "Unsupported file type.",
        "error",
      );
      return;
    }
    const source: SourceSelection = { kind: current.kind, id: current.id };
    root.dispatchEvent(
      new CustomEvent("parks-archive-invalidated", {
        detail: { kind: source.kind, id: source.id },
        bubbles: true,
        composed: true,
      }),
    );
    const content_base64 = await encodeFile(file);
    await ctx.call("attachment-create", {
      kind: source.kind,
      entity_id: source.id,
      payload: {
        name: file.name,
        media_type: mediaType,
        content_base64,
      },
    });
    if (current && current.kind === source.kind && current.id === source.id) {
      await refreshList(source);
    }
    setStatus(`Uploaded ${file.name}.`, "success");
  };

  const onSelectEvent = (ev: Event): void => {
    const detail = (ev as CustomEvent<{ kind?: unknown; id?: unknown }>).detail;
    if (!detail || !isSourceKind(detail.kind) || typeof detail.id !== "string") {
      return;
    }
    const source: SourceSelection = { kind: detail.kind, id: detail.id };
    current = source;
    clearList();
    setStatus("Loading attachments…");
    void ctx.run("Load attachments", async () => {
      try {
        await refreshList(source);
        setStatus("Attachments loaded.");
      } catch (err) {
        setStatus(
          err instanceof Error ? err.message : "Failed to load attachments.",
          "error",
        );
      }
    });
  };

  const onFileChange = (): void => {
    const file = fileInput.files?.[0];
    fileInput.value = "";
    if (!file) return;
    void ctx.run("Upload attachment", async () => {
      try {
        await handleUpload(file);
      } catch (err) {
        setStatus(err instanceof Error ? err.message : "Upload failed.", "error");
      }
    });
  };

  const onListClick = (ev: MouseEvent): void => {
    const target = ev.target as HTMLElement | null;
    if (!target) return;
    const button = target.closest<HTMLButtonElement>("[data-attachment-download]");
    if (!button) return;
    const li = button.closest<HTMLLIElement>("[data-attachment-id]");
    if (!li) return;
    const id = li.dataset.attachmentId;
    if (!id) return;
    const item = currentItems.get(id);
    if (!item) return;
    ev.preventDefault();
    void ctx.run("Download attachment", async () => {
      try {
        await handleDownload(item);
      } catch (err) {
        setStatus(
          err instanceof Error ? err.message : "Download failed.",
          "error",
        );
      }
    });
  };

  fileInput.addEventListener("change", onFileChange);
  listEl.addEventListener("click", onListClick);
  const doc = root.ownerDocument ?? document;
  doc.addEventListener("parks-archive-source-selected", onSelectEvent);
}
