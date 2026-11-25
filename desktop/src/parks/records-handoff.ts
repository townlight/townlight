export function renderRecordsHandoff(): string {
  return [
    '<section class="parks-records-handoff" data-handoff>',
    '  <p class="parks-records-handoff__status" data-handoff-status role="status" aria-live="polite"></p>',
    '  <div class="parks-records-handoff__source" data-handoff-source hidden>',
    '    <span>Source: </span><code data-handoff-source-label></code>',
    '  </div>',
    '  <div class="parks-records-handoff__preview" data-handoff-preview-panel hidden>',
    '    <button type="button" data-handoff-preview-button>Preview archive</button>',
    '    <div data-handoff-preview-result hidden>',
    '      <h3>Archive preview</h3>',
    '      <dl>',
    '        <dt>Name</dt><dd data-handoff-name></dd>',
    '        <dt>Current revision</dt><dd data-handoff-revision></dd>',
    '        <dt>Size</dt><dd data-handoff-size></dd>',
    '        <dt>SHA-256</dt><dd><code data-handoff-sha256></code></dd>',
    '      </dl>',
    '      <label data-handoff-review>',
    '        <input type="checkbox" data-handoff-review-checkbox>',
    '        I reviewed the exact name, current revision, byte size, and SHA-256 above.',
    '      </label>',
    '      <button type="button" data-handoff-archive-button disabled>Archive records</button>',
    '    </div>',
    '  </div>',
    '  <div class="parks-records-handoff__receipt" data-handoff-receipt hidden>',
    '    <h3>Records request</h3>',
    '    <p>Records request ID: <code data-handoff-records-request-id></code></p>',
    '    <p>Attachment ID: <code data-handoff-attachment-id></code></p>',
    '    <p>SHA-256: <code data-handoff-receipt-sha256></code></p>',
    '    <button type="button" data-handoff-open-records>Open records</button>',
    '  </div>',
    '</section>'
  ].join("\n");
}

type RecordsHandoffContext = {
  call?: (...args: any[]) => any;
  run?: (...args: any[]) => any;
  status?: (...args: any[]) => any;
  [key: string]: unknown;
};

type RecordsHandoffOptions = {
  openRecords?: (recordsRequestId: string) => void;
};

type Source = {
  kind: string;
  id: string;
};

type ArchivePreview = {
  kind: string;
  entityId: string;
  name: string;
  currentRevision: number;
  sha256: string;
  size: number;
};

type RecordsReceipt = {
  recordsRequestId: string;
  attachmentId: string;
  sha256: string;
};

const SHA256_RE = /^[a-f0-9]{64}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asIdentifier(value: unknown): string | null {
  if (typeof value === "string") {
    return value.trim().length > 0 ? value : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}

function validatePreview(value: unknown, source: Source): ArchivePreview | null {
  if (!isRecord(value)) {
    return null;
  }

  const name = typeof value.name === "string" && value.name.trim().length > 0
    ? value.name
    : null;
  const currentRevision =
    typeof value.current_revision === "number" &&
    Number.isSafeInteger(value.current_revision) &&
    value.current_revision > 0
      ? value.current_revision
      : null;
  const rawSha256 = typeof value.sha256 === "string" ? value.sha256.trim() : "";
  const sha256 = SHA256_RE.test(rawSha256) ? rawSha256 : null;
  const size = typeof value.size === "number" && Number.isSafeInteger(value.size) && value.size >= 0
    ? value.size
    : null;

  if (name === null || currentRevision === null || sha256 === null || size === null) {
    return null;
  }

  const actualKind = value.kind === undefined ? null : asIdentifier(value.kind);
  if (actualKind !== null && actualKind !== source.kind) {
    return null;
  }

  const actualEntityId = asIdentifier(value.entity_id ?? value.id);
  if (actualEntityId !== null && actualEntityId !== source.id) {
    return null;
  }

  return {
    kind: source.kind,
    entityId: source.id,
    name,
    currentRevision,
    sha256,
    size
  };
}

function validateReceipt(value: unknown, expectedSha256: string): RecordsReceipt | null {
  if (!isRecord(value)) {
    return null;
  }

  const recordsRequestId = asIdentifier(value.records_request_id);
  const attachmentId = asIdentifier(value.attachment_id);
  const rawSha256 = typeof value.sha256 === "string" ? value.sha256.trim() : "";
  const sha256 = SHA256_RE.test(rawSha256) ? rawSha256 : null;

  if (recordsRequestId === null || attachmentId === null || sha256 === null) {
    return null;
  }

  if (sha256.toLowerCase() !== expectedSha256.toLowerCase()) {
    return null;
  }

  return { recordsRequestId, attachmentId, sha256 };
}

function isConflict(error: unknown): boolean {
  if (isRecord(error)) {
    const statusCandidates: unknown[] = [error.status, error.statusCode, error.code];
    if (isRecord(error.response)) {
      statusCandidates.push(error.response.status);
    }
    if (statusCandidates.some((candidate) => Number(candidate) === 409)) {
      return true;
    }

    const text = [error.message, error.reason, error.error]
      .filter((part): part is string => typeof part === "string")
      .join(" ");
    return /\b409\b/.test(text) || /\bconflict\b/i.test(text) || /\bprecondition\b/i.test(text);
  }

  if (typeof error === "string") {
    return /\b409\b/.test(error) || /\bconflict\b/i.test(error) || /\bprecondition\b/i.test(error);
  }

  return false;
}

function setStatus(ctx: RecordsHandoffContext, message: string, tone: string): void {
  const status = ctx && typeof ctx.status === "function" ? ctx.status : null;
  if (!status) {
    return;
  }

  try {
    status.call(ctx, message, tone);
  } catch {
    try {
      status.call(ctx, message);
    } catch {
      // Status reporting is best effort.
    }
  }
}

function runTask<T>(
  ctx: RecordsHandoffContext,
  label: string,
  task: () => T | Promise<T>
): Promise<T> {
  const run = ctx && typeof ctx.run === "function" ? ctx.run : null;
  if (run) {
    try {
      return Promise.resolve(run.call(ctx, label, task));
    } catch (error) {
      return Promise.reject(error);
    }
  }
  return Promise.resolve().then(task);
}

async function callAction(
  ctx: RecordsHandoffContext,
  label: string,
  payload: unknown
): Promise<unknown> {
  const call = ctx && typeof ctx.call === "function" ? ctx.call : null;
  if (!call) {
    throw new Error(`${label} is unavailable.`);
  }
  return await call.call(ctx, label, payload);
}

export function bindRecordsHandoff(
  root: HTMLElement,
  ctx: RecordsHandoffContext,
  options: RecordsHandoffOptions = {}
): () => void {
  const statusElement = root.querySelector<HTMLElement>("[data-handoff-status]");
  const sourceElement = root.querySelector<HTMLElement>("[data-handoff-source]");
  const sourceLabelElement = root.querySelector<HTMLElement>("[data-handoff-source-label]");
  const previewPanel = root.querySelector<HTMLElement>("[data-handoff-preview-panel]");
  const previewButton = root.querySelector<HTMLButtonElement>("[data-handoff-preview-button]");
  const previewResult = root.querySelector<HTMLElement>("[data-handoff-preview-result]");
  const nameElement = root.querySelector<HTMLElement>("[data-handoff-name]");
  const revisionElement = root.querySelector<HTMLElement>("[data-handoff-revision]");
  const sizeElement = root.querySelector<HTMLElement>("[data-handoff-size]");
  const sha256Element = root.querySelector<HTMLElement>("[data-handoff-sha256]");
  const reviewRow = root.querySelector<HTMLElement>("[data-handoff-review]");
  const reviewCheckbox = root.querySelector<HTMLInputElement>("[data-handoff-review-checkbox]");
  const archiveButton = root.querySelector<HTMLButtonElement>("[data-handoff-archive-button]");
  const receiptElement = root.querySelector<HTMLElement>("[data-handoff-receipt]");
  const recordsRequestIdElement = root.querySelector<HTMLElement>("[data-handoff-records-request-id]");
  const attachmentIdElement = root.querySelector<HTMLElement>("[data-handoff-attachment-id]");
  const receiptSha256Element = root.querySelector<HTMLElement>("[data-handoff-receipt-sha256]");
  const openRecordsButton = root.querySelector<HTMLButtonElement>("[data-handoff-open-records]");

  let source: Source | null = null;
  let preview: ArchivePreview | null = null;
  let reviewAccepted = false;
  let receipt: RecordsReceipt | null = null;
  let busy = false;
  let disposed = false;
  let requestToken = 0;

  const sourceMatches = (candidate: Source): boolean =>
    source !== null && source.kind === candidate.kind && source.id === candidate.id;

  const updateUi = (): void => {
    if (statusElement) {
      statusElement.textContent = statusElement.textContent ?? "";
    }

    if (sourceElement) {
      sourceElement.hidden = source === null;
    }
    if (sourceLabelElement) {
      sourceLabelElement.textContent = source === null ? "" : `${source.kind} / ${source.id}`;
    }

    if (previewPanel) {
      previewPanel.hidden = source === null;
    }
    if (previewButton) {
      previewButton.disabled = source === null || busy;
    }

    if (previewResult) {
      previewResult.hidden = preview === null;
    }

    if (preview) {
      if (nameElement) {
        nameElement.textContent = preview.name;
      }
      if (revisionElement) {
        revisionElement.textContent = String(preview.currentRevision);
      }
      if (sizeElement) {
        sizeElement.textContent = `${preview.size} bytes`;
        sizeElement.setAttribute("data-handoff-bytes", String(preview.size));
      }
      if (sha256Element) {
        sha256Element.textContent = preview.sha256;
        sha256Element.setAttribute("data-handoff-sha256", preview.sha256);
      }
    } else {
      if (nameElement) {
        nameElement.textContent = "";
      }
      if (revisionElement) {
        revisionElement.textContent = "";
      }
      if (sizeElement) {
        sizeElement.textContent = "";
        sizeElement.removeAttribute("data-handoff-bytes");
      }
      if (sha256Element) {
        sha256Element.textContent = "";
        sha256Element.removeAttribute("data-handoff-sha256");
      }
    }

    if (reviewRow) {
      reviewRow.hidden = preview === null;
    }
    if (reviewCheckbox) {
      reviewCheckbox.checked = reviewAccepted;
      reviewCheckbox.disabled = preview === null || busy;
    }
    if (archiveButton) {
      archiveButton.disabled = preview === null || !reviewAccepted || busy;
    }

    if (receiptElement) {
      receiptElement.hidden = receipt === null;
    }
    if (receipt) {
      if (recordsRequestIdElement) {
        recordsRequestIdElement.textContent = receipt.recordsRequestId;
      }
      if (attachmentIdElement) {
        attachmentIdElement.textContent = receipt.attachmentId;
      }
      if (receiptSha256Element) {
        receiptSha256Element.textContent = receipt.sha256;
      }
    } else {
      if (recordsRequestIdElement) {
        recordsRequestIdElement.textContent = "";
      }
      if (attachmentIdElement) {
        attachmentIdElement.textContent = "";
      }
      if (receiptSha256Element) {
        receiptSha256Element.textContent = "";
      }
    }
    if (openRecordsButton) {
      openRecordsButton.disabled = receipt === null || typeof options.openRecords !== "function";
    }
  };

  const handlePreview = async (): Promise<void> => {
    if (disposed || busy || source === null) {
      return;
    }

    const capturedSource: Source = { kind: source.kind, id: source.id };
    const token = ++requestToken;
    busy = true;
    preview = null;
    reviewAccepted = false;
    receipt = null;
    updateUi();
    setStatus(ctx, "Loading archive preview…", "busy");

    try {
      const actual = await runTask(ctx, "Preview archive", () =>
        callAction(ctx, "archive-preview", {
          kind: capturedSource.kind,
          entity_id: capturedSource.id
        })
      );

      if (disposed || token !== requestToken || !sourceMatches(capturedSource)) {
        return;
      }

      const nextPreview = validatePreview(actual, capturedSource);
      if (!nextPreview) {
        preview = null;
        reviewAccepted = false;
        setStatus(ctx, "Archive preview data was invalid. No archive action was taken.", "error");
        return;
      }

      preview = nextPreview;
      reviewAccepted = false;
      setStatus(
        ctx,
        "Archive preview loaded. Review the exact bytes and SHA-256 before archiving.",
        "success"
      );
    } catch (error) {
      if (disposed || token !== requestToken || !sourceMatches(capturedSource)) {
        return;
      }

      preview = null;
      reviewAccepted = false;
      if (isConflict(error)) {
        setStatus(ctx, "Archive preview is stale (409). Request a fresh preview.", "error");
      } else {
        setStatus(ctx, "Unable to load the archive preview.", "error");
      }
    } finally {
      if (!disposed && token === requestToken) {
        busy = false;
        updateUi();
      }
    }
  };

  const handleArchive = async (): Promise<void> => {
    if (disposed || busy || source === null || preview === null || !reviewAccepted) {
      return;
    }

    const capturedSource: Source = { kind: source.kind, id: source.id };
    const capturedPreview: ArchivePreview = { ...preview };
    const token = ++requestToken;
    busy = true;
    updateUi();
    setStatus(ctx, "Archiving records…", "busy");

    try {
      const actual = await runTask(ctx, "Archive records", () =>
        callAction(ctx, "archive-records", {
          kind: capturedSource.kind,
          entity_id: capturedSource.id,
          payload: {
            confirm: true,
            expected_revision: capturedPreview.currentRevision,
            expected_sha256: capturedPreview.sha256
          }
        })
      );

      if (disposed || token !== requestToken || !sourceMatches(capturedSource)) {
        return;
      }

      const nextReceipt = validateReceipt(actual, capturedPreview.sha256);
      if (!nextReceipt) {
        receipt = null;
        reviewAccepted = false;
        setStatus(ctx, "Archive response was invalid. No records request was opened.", "error");
        return;
      }

      receipt = nextReceipt;
      preview = null;
      reviewAccepted = false;
      setStatus(ctx, "Records request created. Open the receipt to continue.", "success");
    } catch (error) {
      if (disposed || token !== requestToken || !sourceMatches(capturedSource)) {
        return;
      }

      if (isConflict(error)) {
        preview = null;
        reviewAccepted = false;
        receipt = null;
        setStatus(ctx, "Archive preview is stale (409). Preview again before archiving.", "error");
      } else {
        setStatus(ctx, "Unable to archive records.", "error");
      }
    } finally {
      if (!disposed && token === requestToken) {
        busy = false;
        updateUi();
      }
    }
  };

  const handleReviewChange = (): void => {
    reviewAccepted = Boolean(reviewCheckbox?.checked && preview !== null && !busy);
    updateUi();
  };

  const handleSourceSelected = (event: Event): void => {
    if (disposed) {
      return;
    }

    const detail = (event as CustomEvent<unknown>).detail;
    if (!isRecord(detail)) {
      setStatus(ctx, "Source selection was invalid.", "error");
      return;
    }

    const kind = asIdentifier(detail.kind);
    const id = asIdentifier(detail.id);
    if (kind === null || id === null) {
      setStatus(ctx, "Source selection must include a kind and id.", "error");
      return;
    }

    source = { kind, id };
    preview = null;
    reviewAccepted = false;
    receipt = null;
    busy = false;
    requestToken++;
    setStatus(ctx, "Source selected. Preview the archive before archiving.", "info");
    updateUi();
  };

  const handleInvalidated = (event: Event): void => {
    if (disposed) {
      return;
    }

    const detail = (event as CustomEvent<unknown>).detail;
    if (isRecord(detail)) {
      const kind = asIdentifier(detail.kind);
      const id = asIdentifier(detail.id ?? detail.entity_id);
      if (
        kind !== null &&
        id !== null &&
        source !== null &&
        (kind !== source.kind || id !== source.id)
      ) {
        return;
      }
    }

    preview = null;
    reviewAccepted = false;
    receipt = null;
    busy = false;
    requestToken++;
    setStatus(ctx, "Archive state was invalidated. Preview again before archiving.", "error");
    updateUi();
  };

  const handleOpenRecords = (): void => {
    if (receipt === null || typeof options.openRecords !== "function") {
      return;
    }

    try {
      options.openRecords(receipt.recordsRequestId);
    } catch {
      setStatus(ctx, "Unable to open the records request.", "error");
    }
  };

  const handlePreviewClick = (): void => {
    void handlePreview();
  };

  const handleArchiveClick = (): void => {
    void handleArchive();
  };

  updateUi();

  root.addEventListener("parks-archive-source-selected", handleSourceSelected);
  root.addEventListener("parks-archive-invalidated", handleInvalidated);
  previewButton?.addEventListener("click", handlePreviewClick);
  archiveButton?.addEventListener("click", handleArchiveClick);
  reviewCheckbox?.addEventListener("change", handleReviewChange);
  openRecordsButton?.addEventListener("click", handleOpenRecords);

  return () => {
    disposed = true;
    requestToken++;
    root.removeEventListener("parks-archive-source-selected", handleSourceSelected);
    root.removeEventListener("parks-archive-invalidated", handleInvalidated);
    previewButton?.removeEventListener("click", handlePreviewClick);
    archiveButton?.removeEventListener("click", handleArchiveClick);
    reviewCheckbox?.removeEventListener("change", handleReviewChange);
    openRecordsButton?.removeEventListener("click", handleOpenRecords);
  };
}
