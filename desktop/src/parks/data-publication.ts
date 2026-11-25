export type ParksDataContext = {
  call: (operation: string, args?: Record<string, unknown>) => Promise<unknown>;
  run: <T>(label: string, task: () => Promise<T> | T) => Promise<T>;
  status?: (message: string) => void;
};

type ParksRow = {
  metric: string;
  state: string;
  count: number;
  amount_cents: number;
  minutes: number;
};

type ParksPreview = {
  id: string;
  sha256: string;
  rows: ParksRow[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value !== "") return value;
  }
  return null;
}

function safeText(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value === null) return "null";
  if (value === undefined) return "";
  try {
    return JSON.stringify(value);
  } catch {
    return "Unreadable value";
  }
}

function describeError(error: unknown): string {
  if (error instanceof Error && error.message.trim() !== "") return error.message;
  if (typeof error === "string" && error.trim() !== "") return error;
  if (isRecord(error) && typeof error.message === "string" && error.message.trim() !== "") {
    return error.message;
  }
  return "The parks data request could not be completed.";
}

function readRows(value: unknown): ParksRow[] {
  if (!Array.isArray(value)) {
    throw new Error("The response did not include actual aggregate rows.");
  }
  return value.map((entry): ParksRow => {
    if (!isRecord(entry)) {
      throw new Error("The aggregate rows were not valid.");
    }
    const { metric, state, count, amount_cents, minutes } = entry;
    if (typeof metric !== "string" || typeof state !== "string") {
      throw new Error("The aggregate rows were not valid.");
    }
    if (typeof count !== "number" || !Number.isSafeInteger(count) || count < 0) {
      throw new Error("The aggregate rows were not valid.");
    }
    if (
      typeof amount_cents !== "number" ||
      !Number.isSafeInteger(amount_cents) ||
      amount_cents < 0
    ) {
      throw new Error("The aggregate rows were not valid.");
    }
    if (typeof minutes !== "number" || !Number.isSafeInteger(minutes) || minutes < 0) {
      throw new Error("The aggregate rows were not valid.");
    }
    return { metric, state, count, amount_cents, minutes };
  });
}

function parsePreview(value: unknown): ParksPreview {
  if (!isRecord(value)) {
    throw new Error("The preview response was not valid.");
  }
  if (typeof value.id !== "string" || value.id === "") {
    throw new Error("The preview response did not include a revision id.");
  }
  if (typeof value.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(value.sha256)) {
    throw new Error("The preview response did not include a valid SHA-256.");
  }
  return { id: value.id, sha256: value.sha256, rows: readRows(value.rows) };
}

function publicationLabel(value: unknown): string {
  if (!isRecord(value)) return safeText(value);
  const id = firstString(value.id, value.queue_id, value.job_id, value.receipt_id);
  const state = firstString(value.state, value.status);
  const parts: string[] = [];
  if (id !== null) parts.push(`Queue id: ${id}`);
  if (state !== null) parts.push(`State: ${state}`);
  if (parts.length > 0) return parts.join(" — ");
  return safeText(value);
}

export function renderParksData(isAdmin: boolean): string {
  if (!isAdmin) return "";
  return `
    <section class="parks-data-publication" data-parks-data-publication>
      <h2>Parks public data</h2>
      <p>Review the aggregate preview before requesting public approval.</p>

      <div>
        <button type="button" data-parks-action="preview">Preview aggregate</button>
        <button type="button" data-parks-action="status">Refresh status</button>
      </div>

      <p data-parks-message role="status" aria-live="polite"></p>
      <div data-parks-config></div>

      <section data-parks-preview hidden>
        <h3>Reviewed preview</h3>
        <dl>
          <dt>Revision id</dt>
          <dd data-parks-preview-id></dd>
          <dt>SHA-256</dt>
          <dd><code data-parks-preview-hash></code></dd>
        </dl>
        <table>
          <thead>
            <tr>
              <th scope="col">Metric</th>
              <th scope="col">State</th>
              <th scope="col">Count</th>
              <th scope="col">Amount (cents)</th>
              <th scope="col">Minutes</th>
            </tr>
          </thead>
          <tbody data-parks-preview-rows></tbody>
        </table>
        <p data-parks-preview-empty hidden>No aggregate rows were returned.</p>
      </section>

      <section>
        <h3>Saved revisions</h3>
        <label>
          Saved revision
          <select data-parks-revision-select>
            <option value="">Refresh status to load saved revisions</option>
          </select>
        </label>
        <button type="button" data-parks-action="load-revision">Load selected revision</button>
      </section>

      <section>
        <h3>Publication queue</h3>
        <ul data-parks-publications></ul>
        <p data-parks-receipt role="status" aria-live="polite"></p>
      </section>

      <label>
        <input type="checkbox" data-parks-confirm>
        I reviewed this aggregate for public approval.
      </label>
      <button type="button" data-parks-action="publish" disabled>Request publication</button>
    </section>
  `;
}

export function bindParksData(root: HTMLElement, ctx: ParksDataContext): void {
  const section = root.matches("[data-parks-data-publication]")
    ? root
    : root.querySelector<HTMLElement>("[data-parks-data-publication]");

  if (!section || section.dataset.parksBound === "true") return;

  const previewButton = section.querySelector<HTMLButtonElement>('[data-parks-action="preview"]');
  const statusButton = section.querySelector<HTMLButtonElement>('[data-parks-action="status"]');
  const loadRevisionButton = section.querySelector<HTMLButtonElement>(
    '[data-parks-action="load-revision"]',
  );
  const publishButton = section.querySelector<HTMLButtonElement>('[data-parks-action="publish"]');
  const revisionSelect = section.querySelector<HTMLSelectElement>("[data-parks-revision-select]");
  const confirmCheckbox = section.querySelector<HTMLInputElement>("[data-parks-confirm]");
  const messageElement = section.querySelector<HTMLElement>("[data-parks-message]");
  const configElement = section.querySelector<HTMLElement>("[data-parks-config]");
  const previewPanel = section.querySelector<HTMLElement>("[data-parks-preview]");
  const previewIdElement = section.querySelector<HTMLElement>("[data-parks-preview-id]");
  const previewHashElement = section.querySelector<HTMLElement>("[data-parks-preview-hash]");
  const previewRowsElement = section.querySelector<HTMLTableSectionElement>(
    "[data-parks-preview-rows]",
  );
  const previewEmptyElement = section.querySelector<HTMLElement>("[data-parks-preview-empty]");
  const publicationsElement = section.querySelector<HTMLUListElement>("[data-parks-publications]");
  const receiptElement = section.querySelector<HTMLElement>("[data-parks-receipt]");

  if (
    !previewButton ||
    !statusButton ||
    !loadRevisionButton ||
    !publishButton ||
    !revisionSelect ||
    !confirmCheckbox ||
    !messageElement ||
    !configElement ||
    !previewPanel ||
    !previewIdElement ||
    !previewHashElement ||
    !previewRowsElement ||
    !previewEmptyElement ||
    !publicationsElement ||
    !receiptElement
  ) {
    return;
  }

  section.dataset.parksBound = "true";

  let preview: ParksPreview | null = null;
  let configured: boolean | null = null;
  let busy = false;

  const actionButtons = [previewButton, statusButton, loadRevisionButton, publishButton];

  function report(message: string): void {
    messageElement.textContent = message;
    try {
      ctx.status?.(message);
    } catch {
      // Status reporting must not break data review.
    }
  }

  function reportError(error: unknown): void {
    report(`Error: ${describeError(error)}`);
  }

  function updateConfigured(): void {
    if (configured === true) {
      configElement.textContent = "The existing public data queue is configured.";
    } else if (configured === false) {
      configElement.textContent =
        "The public data queue is not configured. A publication cannot be queued until portal configuration is complete.";
    } else {
      configElement.textContent =
        "Refresh status to check whether the public data queue is configured.";
    }
    updatePublishState();
  }

  function updateLoadRevisionState(): void {
    loadRevisionButton.disabled = busy || revisionSelect.value === "";
  }

  function updatePublishState(): void {
    const hasPreview = preview !== null;
    const ready =
      !busy && configured === true && hasPreview && confirmCheckbox.checked;

    publishButton.disabled = !ready;

    if (configured === false) {
      publishButton.title =
        "Portal configuration is required before a publication can be queued.";
    } else if (configured === null) {
      publishButton.title = "Refresh status before requesting publication.";
    } else if (!hasPreview) {
      publishButton.title = "Preview the aggregate or load a saved revision first.";
    } else if (!confirmCheckbox.checked) {
      publishButton.title = "Confirm that you reviewed the aggregate.";
    } else {
      publishButton.title = "";
    }
  }

  function setBusy(value: boolean): void {
    busy = value;
    for (const button of actionButtons) {
      button.disabled = value;
    }
    revisionSelect.disabled = value;
    confirmCheckbox.disabled = value;
    if (!value) {
      updateLoadRevisionState();
      updatePublishState();
    }
  }

  function renderPreview(value: ParksPreview | null): void {
    previewRowsElement.replaceChildren();

    if (value === null) {
      previewPanel.hidden = true;
      previewIdElement.textContent = "";
      previewHashElement.textContent = "";
      previewEmptyElement.hidden = true;
      return;
    }

    previewPanel.hidden = false;
    previewIdElement.textContent = value.id;
    previewHashElement.textContent = value.sha256;

    if (value.rows.length === 0) {
      previewEmptyElement.hidden = false;
      return;
    }

    previewEmptyElement.hidden = true;

    for (const row of value.rows) {
      const tableRow = document.createElement("tr");
      const values = [
        row.metric,
        row.state,
        String(row.count),
        String(row.amount_cents),
        String(row.minutes),
      ];
      for (const valueText of values) {
        const cell = document.createElement("td");
        cell.textContent = valueText;
        tableRow.appendChild(cell);
      }
      previewRowsElement.appendChild(tableRow);
    }
  }

  function populateRevisions(value: unknown): void {
    revisionSelect.replaceChildren();

    const list = Array.isArray(value) ? value : [];
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent =
      list.length === 0 ? "No saved revisions." : "Select a saved revision";
    revisionSelect.appendChild(placeholder);

    for (const item of list) {
      if (!isRecord(item) || typeof item.id !== "string" || item.id === "") continue;

      const option = document.createElement("option");
      option.value = item.id;

      const sha = typeof item.sha256 === "string" ? item.sha256 : "";
      const approved =
        typeof item.approved_at === "string" && item.approved_at !== "";
      const shaSuffix = sha !== "" ? ` — ${sha.slice(0, 12)}…` : "";
      option.textContent = `${item.id}${shaSuffix} (${approved ? "approved" : "not approved"})`;
      revisionSelect.appendChild(option);
    }

    revisionSelect.value = "";
    updateLoadRevisionState();
  }

  function renderPublications(value: unknown): void {
    publicationsElement.replaceChildren();

    const list = Array.isArray(value) ? value : value === undefined || value === null ? [] : [value];

    if (list.length === 0) {
      const item = document.createElement("li");
      item.textContent =
        configured === false
          ? "No publication jobs can be queued until portal configuration is complete."
          : "No publication jobs are currently listed.";
      publicationsElement.appendChild(item);
      return;
    }

    for (const entry of list) {
      const item = document.createElement("li");
      item.textContent = publicationLabel(entry);
      publicationsElement.appendChild(item);
    }
  }

  function renderReceipt(value: unknown): void {
    receiptElement.replaceChildren();

    if (isRecord(value)) {
      const id = firstString(value.id, value.queue_id, value.job_id, value.receipt_id);
      const state = firstString(value.state, value.status);
      if (id !== null || state !== null) {
        const idText = id !== null ? `Queue id: ${id}` : "Queue id unavailable";
        const stateText = state !== null ? `State: ${state}` : "State unavailable";
        receiptElement.textContent = `Publication receipt — ${idText}; ${stateText}`;
        return;
      }
    }

    receiptElement.textContent = `Publication receipt: ${publicationLabel(value)}`;
  }

  async function handlePreview(): Promise<void> {
    if (busy) return;
    setBusy(true);

    try {
      const response = await ctx.run("Preview parks public data", () =>
        ctx.call("data-preview"),
      );
      const parsed = parsePreview(response);
      preview = parsed;
      confirmCheckbox.checked = false;
      renderPreview(parsed);
      updatePublishState();
      report("Preview loaded. Review the id, SHA-256 and aggregate rows before requesting publication.");
    } catch (error) {
      preview = null;
      confirmCheckbox.checked = false;
      renderPreview(null);
      updatePublishState();
      reportError(error);
    } finally {
      setBusy(false);
    }
  }

  async function handleStatus(): Promise<void> {
    if (busy) return;
    setBusy(true);

    try {
      const response = await ctx.run("Refresh parks public data status", () =>
        ctx.call("data-status"),
      );

      if (!isRecord(response)) {
        throw new Error("The status response was not valid.");
      }
      if (typeof response.configured !== "boolean") {
        throw new Error("The status response did not include portal configuration.");
      }

      configured = response.configured;
      updateConfigured();
      renderPublications(response.publications);
      populateRevisions(response.revisions);
      updatePublishState();

      report(
        configured
          ? "Publication status refreshed."
          : "Portal configuration is required before a publication can be queued.",
      );
    } catch (error) {
      configured = null;
      updateConfigured();
      reportError(error);
    } finally {
      setBusy(false);
    }
  }

  async function loadSelectedRevision(): Promise<void> {
    if (busy) return;

    const revisionId = revisionSelect.value;
    if (revisionId === "") {
      reportError(new Error("Select a saved revision first."));
      return;
    }

    setBusy(true);

    try {
      const response = await ctx.run("Load saved parks data revision", () =>
        ctx.call("data-revision", { revision_id: revisionId }),
      );
      const parsed = parsePreview(response);

      if (parsed.id !== revisionId) {
        throw new Error("The revision response did not match the selected revision.");
      }

      preview = parsed;
      confirmCheckbox.checked = false;
      renderPreview(parsed);
      updatePublishState();
      report("Saved revision loaded. Review the aggregate rows and SHA-256 before requesting publication.");
    } catch (error) {
      preview = null;
      confirmCheckbox.checked = false;
      renderPreview(null);
      updatePublishState();
      reportError(error);
    } finally {
      setBusy(false);
    }
  }

  async function handlePublish(): Promise<void> {
    if (busy) return;

    if (configured !== true) {
      report("Portal configuration is required before a publication can be queued.");
      return;
    }

    const current = preview;
    if (current === null) {
      reportError(new Error("Preview the aggregate or load a saved revision first."));
      return;
    }

    if (!confirmCheckbox.checked) {
      reportError(new Error("Confirm that you reviewed the aggregate before requesting publication."));
      return;
    }

    setBusy(true);

    try {
      const receipt = await ctx.run("Request parks public data publication", () =>
        ctx.call("data-publish", {
          payload: {
            id: current.id,
            expected_sha256: current.sha256,
            confirm: true,
          },
        }),
      );

      renderReceipt(receipt);
      confirmCheckbox.checked = false;
      report("Publication request queued. Review the receipt below.");
    } catch (error) {
      reportError(error);
    } finally {
      setBusy(false);
    }
  }

  previewButton.addEventListener("click", () => {
    void handlePreview();
  });

  statusButton.addEventListener("click", () => {
    void handleStatus();
  });

  loadRevisionButton.addEventListener("click", () => {
    void loadSelectedRevision();
  });

  revisionSelect.addEventListener("change", () => {
    updateLoadRevisionState();
    if (revisionSelect.value !== "") {
      void loadSelectedRevision();
    }
  });

  confirmCheckbox.addEventListener("change", () => {
    updatePublishState();
  });

  publishButton.addEventListener("click", () => {
    void handlePublish();
  });

  renderPreview(null);
  updateConfigured();
  updateLoadRevisionState();
  updatePublishState();
}
