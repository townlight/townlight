export type ServiceRequestCall = (
  operation: string,
  extra?: Record<string, unknown>,
) => Promise<any>;

type InterchangeFormat = "csv" | "json";

interface InterchangeImportPayload {
  format: InterchangeFormat;
  content: string;
  source_key: string;
}

interface InterchangePreviewSnapshot {
  payload: InterchangeImportPayload;
  sha256: string;
}

const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;

const boundRoots = new WeakSet<HTMLElement>();

const INTERCHANGE_MARKUP = `
<section class="interchange-view">
  <details>
    <summary>Import and export service requests</summary>
    <form data-interchange-import novalidate>
      <fieldset>
        <legend>Import service requests</legend>
        <label>
          File (CSV or JSON, maximum 2 MiB)
          <input type="file" accept=".csv,.json" data-import-file />
        </label>
        <label>
          Format
          <select data-import-format>
            <option value="csv">CSV</option>
            <option value="json">JSON</option>
          </select>
        </label>
        <label>
          Source key (required)
          <input type="text" required maxlength="128" autocomplete="off" data-import-source-key />
        </label>
        <button type="button" data-import-preview>Preview import</button>
        <div data-import-preview-output role="status" aria-live="polite"></div>
        <label>
          <input type="checkbox" data-import-confirm />
          I confirm this import
        </label>
        <button type="button" data-import-commit>Commit import</button>
        <p data-import-status role="alert" aria-live="assertive"></p>
      </fieldset>
    </form>
    <form data-interchange-export novalidate>
      <fieldset>
        <legend>Export service requests</legend>
        <label>
          Format
          <select data-export-format>
            <option value="json">JSON</option>
            <option value="csv">CSV</option>
          </select>
        </label>
        <label>
          <input type="checkbox" data-export-contact />
          Include contact details
        </label>
        <button type="button" data-export-run>Export</button>
        <p data-export-status role="alert" aria-live="assertive"></p>
      </fieldset>
    </form>
  </details>
</section>
`;

function messageFromError(error: unknown): string {
  if (error && typeof error === "object") {
    const record = error as { message?: unknown; detail?: unknown };
    if (typeof record.message === "string" && record.message.trim() !== "") {
      return record.message;
    }
    if (typeof record.detail === "string" && record.detail.trim() !== "") {
      return record.detail;
    }
  }
  if (typeof error === "string" && error.trim() !== "") {
    return error;
  }
  return "The service request could not be completed.";
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function hexFromBuffer(buffer: ArrayBuffer): string {
  const view = new Uint8Array(buffer);
  let hex = "";
  for (let index = 0; index < view.length; index += 1) {
    hex += view[index].toString(16).padStart(2, "0");
  }
  return hex;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  if (!globalThis.crypto || !globalThis.crypto.subtle) {
    throw new Error("SHA-256 verification is unavailable in this environment.");
  }
  const buffer = await globalThis.crypto.subtle.digest(
    "SHA-256",
    bytes.buffer as ArrayBuffer,
  );
  return hexFromBuffer(buffer);
}

function decodeUtf8Fatal(bytes: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

export function createInterchangeView(call: ServiceRequestCall) {
  return {
    render(): string {
      return INTERCHANGE_MARKUP;
    },

    bind(root: HTMLElement): void {
      if (!root || boundRoots.has(root)) {
        return;
      }

      const importForm = root.querySelector<HTMLFormElement>("[data-interchange-import]");
      const exportForm = root.querySelector<HTMLFormElement>("[data-interchange-export]");
      const fileInput = root.querySelector<HTMLInputElement>("[data-import-file]");
      const importFormat = root.querySelector<HTMLSelectElement>("[data-import-format]");
      const sourceKeyInput = root.querySelector<HTMLInputElement>("[data-import-source-key]");
      const previewButton = root.querySelector<HTMLButtonElement>("[data-import-preview]");
      const previewOutput = root.querySelector<HTMLElement>("[data-import-preview-output]");
      const confirmInput = root.querySelector<HTMLInputElement>("[data-import-confirm]");
      const commitButton = root.querySelector<HTMLButtonElement>("[data-import-commit]");
      const importStatus = root.querySelector<HTMLElement>("[data-import-status]");
      const exportFormat = root.querySelector<HTMLSelectElement>("[data-export-format]");
      const includeContactInput = root.querySelector<HTMLInputElement>("[data-export-contact]");
      const exportButton = root.querySelector<HTMLButtonElement>("[data-export-run]");
      const exportStatus = root.querySelector<HTMLElement>("[data-export-status]");

      if (
        !importForm ||
        !exportForm ||
        !fileInput ||
        !importFormat ||
        !sourceKeyInput ||
        !previewButton ||
        !previewOutput ||
        !confirmInput ||
        !commitButton ||
        !importStatus ||
        !exportFormat ||
        !includeContactInput ||
        !exportButton ||
        !exportStatus
      ) {
        return;
      }

      boundRoots.add(root);

      let snapshot: InterchangePreviewSnapshot | null = null;
      let importBusy = false;
      let exportBusy = false;

      const setImportStatus = (message: string): void => {
        importStatus.textContent = message;
      };

      const setExportStatus = (message: string): void => {
        exportStatus.textContent = message;
      };

      const setImportBusy = (busy: boolean): void => {
        importBusy = busy;
        previewButton.disabled = busy;
        commitButton.disabled = busy;
        previewButton.setAttribute("aria-busy", busy ? "true" : "false");
        commitButton.setAttribute("aria-busy", busy ? "true" : "false");
        importForm.setAttribute("aria-busy", busy ? "true" : "false");
      };

      const setExportBusy = (busy: boolean): void => {
        exportBusy = busy;
        exportButton.disabled = busy;
        exportButton.setAttribute("aria-busy", busy ? "true" : "false");
        exportForm.setAttribute("aria-busy", busy ? "true" : "false");
      };

      const readImportPayload = async (): Promise<InterchangeImportPayload | null> => {
        const file = fileInput.files && fileInput.files[0];
        if (!file) {
          setImportStatus("Choose a CSV or JSON file to import.");
          return null;
        }
        if (file.size > MAX_IMPORT_BYTES) {
          setImportStatus("The import file must be 2 MiB or smaller.");
          return null;
        }

        const sourceKey = sourceKeyInput.value.trim();
        if (sourceKey === "") {
          setImportStatus("A source key is required.");
          return null;
        }

        const format: InterchangeFormat = importFormat.value === "csv" ? "csv" : "json";

        let bytes: Uint8Array;
        try {
          bytes = new Uint8Array(await file.arrayBuffer());
        } catch {
          setImportStatus("The selected file could not be read.");
          return null;
        }

        if (bytes.byteLength > MAX_IMPORT_BYTES) {
          setImportStatus("The import file must be 2 MiB or smaller.");
          return null;
        }

        let content: string;
        try {
          content = decodeUtf8Fatal(bytes);
        } catch {
          setImportStatus("The selected file is not valid UTF-8 text.");
          return null;
        }

        return { format, content, source_key: sourceKey };
      };

      const handlePreview = async (): Promise<void> => {
        if (importBusy) {
          return;
        }

        snapshot = null;
        previewOutput.textContent = "";
        setImportStatus("");
        setImportBusy(true);

        try {
          const payload = await readImportPayload();
          if (!payload) {
            return;
          }

          const response = await call("import-preview", { payload });
          const responseSha =
            response && typeof response.sha256 === "string" ? response.sha256 : "";
          if (!SHA256_PATTERN.test(responseSha)) {
            throw new Error("The preview response did not include a valid checksum.");
          }

          const previewValue =
            response && Object.prototype.hasOwnProperty.call(response, "preview")
              ? response.preview
              : response;

          previewOutput.textContent =
            typeof previewValue === "string"
              ? previewValue
              : JSON.stringify(previewValue, null, 2);

          snapshot = { payload, sha256: responseSha };
          setImportStatus("Preview ready. Review it, confirm the checkbox, and commit.");
        } catch (error) {
          snapshot = null;
          previewOutput.textContent = "";
          setImportStatus(messageFromError(error));
        } finally {
          setImportBusy(false);
        }
      };

      const handleCommit = async (): Promise<void> => {
        if (importBusy) {
          return;
        }

        setImportStatus("");

        const activeSnapshot = snapshot;
        if (!activeSnapshot) {
          setImportStatus("Preview the import before committing it.");
          return;
        }

        if (!confirmInput.checked) {
          setImportStatus("Confirm the import before committing it.");
          return;
        }

        setImportBusy(true);

        try {
          const current = await readImportPayload();
          if (!current) {
            return;
          }

          if (
            current.format !== activeSnapshot.payload.format ||
            current.source_key !== activeSnapshot.payload.source_key ||
            current.content !== activeSnapshot.payload.content
          ) {
            setImportStatus(
              "The file or form fields changed since the preview. Preview the import again before committing.",
            );
            return;
          }

          await call("import", {
            payload: {
              format: activeSnapshot.payload.format,
              content: activeSnapshot.payload.content,
              source_key: activeSnapshot.payload.source_key,
              expected_sha256: activeSnapshot.sha256,
              confirm: true,
            },
          });

          snapshot = null;
          previewOutput.textContent = "";
          confirmInput.checked = false;
          setImportStatus("Import committed.");
        } catch (error) {
          setImportStatus(messageFromError(error));
        } finally {
          setImportBusy(false);
        }
      };

      const downloadExport = (bytes: Uint8Array, format: InterchangeFormat): void => {
        const mime = format === "json" ? "application/json" : "text/csv";
        const blob = new Blob([bytes.buffer as ArrayBuffer], {
          type: `${mime};charset=utf-8`,
        });
        const url = URL.createObjectURL(blob);
        const documentRef = root.ownerDocument;
        const anchor = documentRef.createElement("a");
        anchor.href = url;
        anchor.download = `townlight-311.${format}`;
        anchor.rel = "noopener";
        anchor.style.display = "none";
        root.appendChild(anchor);
        try {
          anchor.click();
        } finally {
          anchor.remove();
          URL.revokeObjectURL(url);
        }
      };

      const handleExport = async (): Promise<void> => {
        if (exportBusy) {
          return;
        }

        setExportStatus("");
        setExportBusy(true);

        try {
          const format: InterchangeFormat = exportFormat.value === "csv" ? "csv" : "json";
          const includeContact = includeContactInput.checked;

          const response = await call("export", {
            payload: { format, include_contact: includeContact },
          });

          if (!response || typeof response.content_base64 !== "string") {
            throw new Error("The export response did not include export content.");
          }
          if (typeof response.size !== "number" || !Number.isSafeInteger(response.size)) {
            throw new Error("The export response did not include a valid size.");
          }
          if (typeof response.sha256 !== "string" || !SHA256_PATTERN.test(response.sha256)) {
            throw new Error("The export response did not include a valid checksum.");
          }

          const bytes = decodeBase64(response.content_base64);
          if (bytes.byteLength !== response.size) {
            throw new Error("The export content did not match the reported size.");
          }

          const digest = await sha256Hex(bytes);
          if (digest !== response.sha256) {
            throw new Error("The export checksum verification failed.");
          }

          downloadExport(bytes, format);
          setExportStatus("Export downloaded.");
        } catch (error) {
          setExportStatus(messageFromError(error));
        } finally {
          setExportBusy(false);
        }
      };

      previewButton.addEventListener("click", () => {
        void handlePreview();
      });

      commitButton.addEventListener("click", () => {
        void handleCommit();
      });

      exportButton.addEventListener("click", () => {
        void handleExport();
      });

      importForm.addEventListener("submit", (event) => {
        event.preventDefault();
      });

      exportForm.addEventListener("submit", (event) => {
        event.preventDefault();
      });
    },
  };
}