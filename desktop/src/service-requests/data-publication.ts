export function createDataPublication(
  call: (op: string, extra?: Record<string, unknown>) => Promise<any>,
  isAdmin: () => boolean
) {
  let preview: any = null;
  let busy = false;
  const bound = new WeakSet<HTMLElement>();

  function render(): HTMLElement {
    const details = document.createElement("details");

    const summary = document.createElement("summary");
    summary.textContent = "Public request statistics";
    details.appendChild(summary);

    const previewButton = document.createElement("button");
    previewButton.type = "button";
    previewButton.textContent = "Preview";
    previewButton.dataset.dpPreview = "";
    details.appendChild(previewButton);

    const publishButton = document.createElement("button");
    publishButton.type = "button";
    publishButton.textContent = "Publish";
    publishButton.dataset.dpPublish = "";
    publishButton.hidden = !isAdmin();
    details.appendChild(publishButton);

    const statusButton = document.createElement("button");
    statusButton.type = "button";
    statusButton.textContent = "Status";
    statusButton.dataset.dpStatus = "";
    details.appendChild(statusButton);

    const revisionSelect = document.createElement("select");
    revisionSelect.dataset.dpRevision = "";
    revisionSelect.setAttribute("aria-label", "Saved revision");
    details.appendChild(revisionSelect);

    const retrieveButton = document.createElement("button");
    retrieveButton.type = "button";
    retrieveButton.textContent = "Retrieve";
    retrieveButton.dataset.dpRetrieve = "";
    details.appendChild(retrieveButton);

    const confirmLabel = document.createElement("label");
    const confirm = document.createElement("input");
    confirm.type = "checkbox";
    confirm.dataset.dpConfirm = "";
    confirmLabel.appendChild(confirm);
    confirmLabel.append(" Confirm");
    details.appendChild(confirmLabel);

    const result = document.createElement("pre");
    result.dataset.dpResult = "";
    result.setAttribute("role", "status");
    details.appendChild(result);

    bind(details);
    return details;
  }

  function bind(root: HTMLElement) {
    if (bound.has(root)) return;
    bound.add(root);

    const previewButton = root.querySelector<HTMLButtonElement>("[data-dp-preview]");
    const publishButton = root.querySelector<HTMLButtonElement>("[data-dp-publish]");
    const statusButton = root.querySelector<HTMLButtonElement>("[data-dp-status]");
    const revisionSelect = root.querySelector<HTMLSelectElement>("[data-dp-revision]");
    const retrieveButton = root.querySelector<HTMLButtonElement>("[data-dp-retrieve]");
    const confirm = root.querySelector<HTMLInputElement>("[data-dp-confirm]");
    const result = root.querySelector<HTMLElement>("[data-dp-result]");

    if (!previewButton || !publishButton || !statusButton || !revisionSelect || !retrieveButton || !confirm || !result) {
      return;
    }

    publishButton.hidden = !isAdmin();

    const errorMessage = (error: unknown): string => {
      if (error && typeof error === "object" && "message" in error) {
        const message = (error as { message?: unknown }).message;
        if (typeof message === "string" && message.trim() !== "") return message;
      }
      if (typeof error === "string" && error.trim() !== "") return error;
      return "The data request could not be completed.";
    };

    const decodeBase64 = (value: string): Uint8Array => {
      const binary = atob(value);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
      }
      return bytes;
    };

    const sha256Hex = async (bytes: Uint8Array): Promise<string> => {
      if (!globalThis.crypto || !globalThis.crypto.subtle) {
        throw new Error("SHA-256 verification is unavailable in this environment.");
      }
      const buffer = await globalThis.crypto.subtle.digest("SHA-256", bytes.buffer as ArrayBuffer);
      const view = new Uint8Array(buffer);
      let hex = "";
      for (let index = 0; index < view.length; index += 1) {
        hex += view[index].toString(16).padStart(2, "0");
      }
      return hex;
    };

    const downloadZip = (bytes: Uint8Array, id: string): void => {
      const blob = new Blob([bytes.buffer as ArrayBuffer], { type: "application/zip" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `townlight-data-${id}.zip`;
      anchor.rel = "noopener";
      anchor.style.display = "none";
      document.body.appendChild(anchor);
      try {
        anchor.click();
      } finally {
        anchor.remove();
        URL.revokeObjectURL(url);
      }
    };

    const populateRevisions = (response: any): void => {
      revisionSelect.replaceChildren();
      const raw = response?.revisions;
      const list = Array.isArray(raw) ? raw : raw && typeof raw === "object" ? Object.values(raw) : [];
      for (const item of list) {
        const id = typeof item === "string" ? item : typeof item?.id === "string" ? item.id : "";
        if (id === "") continue;
        const option = document.createElement("option");
        option.value = id;
        option.textContent = typeof item?.sha256 === "string" ? `${id} (${item.sha256.slice(0, 12)}…)` : id;
        revisionSelect.appendChild(option);
      }
    };

    const buttons = [previewButton, publishButton, statusButton, retrieveButton];

    const setBusy = (value: boolean) => {
      busy = value;
      for (const button of buttons) {
        button.disabled = value;
      }
    };

    previewButton.addEventListener("click", async () => {
      if (busy) return;
      setBusy(true);
      confirm.checked = false;
      try {
        const response = await call("data-preview");
        if (
          typeof response?.id !== "string" ||
          typeof response?.sha256 !== "string" ||
          !/^[0-9a-f]{64}$/.test(response.sha256)
        ) {
          throw new Error("Invalid preview response");
        }
        preview = response;
        if (!Array.from(revisionSelect.options).some((option) => option.value === response.id)) {
          const option = document.createElement("option");
          option.value = response.id;
          option.textContent = response.id;
          revisionSelect.appendChild(option);
        }
        revisionSelect.value = response.id;
        result.textContent = JSON.stringify({ id: response.id, sha256: response.sha256, rows: response.rows });
      } catch (error) {
        result.textContent = errorMessage(error);
      } finally {
        setBusy(false);
      }
    });

    retrieveButton.addEventListener("click", async () => {
      if (busy) return;
      setBusy(true);
      confirm.checked = false;
      try {
        const id = revisionSelect.value;
        if (!id) throw new Error("Select a saved revision first");
        const response = await call("data-revision", { id });
        if (typeof response?.id !== "string" || response.id !== id) {
          throw new Error("The revision response id did not match the selection.");
        }
        if (typeof response?.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(response.sha256)) {
          throw new Error("The revision response did not include a valid checksum.");
        }
        if (typeof response?.content_base64 !== "string") {
          throw new Error("The revision response did not include content.");
        }
        if (typeof response?.size !== "number" || !Number.isSafeInteger(response.size)) {
          throw new Error("The revision response did not include a valid size.");
        }
        const bytes = decodeBase64(response.content_base64);
        if (bytes.byteLength !== response.size) {
          throw new Error("The revision content did not match the reported size.");
        }
        const digest = await sha256Hex(bytes);
        if (digest !== response.sha256) {
          throw new Error("The revision checksum verification failed.");
        }
        preview = { id: response.id, sha256: response.sha256, rows: response.rows };
        result.textContent = JSON.stringify({ id: response.id, sha256: response.sha256, rows: response.rows });
        downloadZip(bytes, response.id);
      } catch (error) {
        result.textContent = errorMessage(error);
      } finally {
        setBusy(false);
      }
    });

    publishButton.addEventListener("click", async () => {
      if (busy) return;
      setBusy(true);
      try {
        if (!isAdmin()) throw new Error("Not authorized");
        if (!preview) throw new Error("Preview required");
        if (!confirm.checked) throw new Error("Confirm required");

        const receipt = await call("data-publish", {
          payload: {
            id: preview.id,
            expected_sha256: preview.sha256,
            confirm: true,
          },
        });

        result.textContent = `Queued: ${JSON.stringify(receipt)}`;
      } catch (error) {
        result.textContent = String(error);
      } finally {
        setBusy(false);
      }
    });

    statusButton.addEventListener("click", async () => {
      if (busy) return;
      setBusy(true);
      try {
        const response = await call("data-status");
        populateRevisions(response);
        result.textContent = JSON.stringify(response) ?? "";
      } catch (error) {
        result.textContent = errorMessage(error);
      } finally {
        setBusy(false);
      }
    });
  }

  return { render, bind };
}