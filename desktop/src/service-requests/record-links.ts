type RecordLinkFields = {
  kind: string;
  identifier: string;
  jurisdiction: string | undefined;
};

type RecordLinkPreview = {
  fields: RecordLinkFields;
  selected: { id: string; revision: number } | null;
  target_id: string;
};

function validKind(value: string): value is "parcel" | "permit" | "inspection" {
  return value === "parcel" || value === "permit" || value === "inspection";
}

function sameFields(a: RecordLinkFields, b: RecordLinkFields): boolean {
  return (
    a.kind === b.kind &&
    a.identifier === b.identifier &&
    a.jurisdiction === b.jurisdiction
  );
}

function errorMessage(err: unknown): string {
  if (
    err &&
    typeof err === "object" &&
    "message" in err &&
    typeof (err as { message: unknown }).message === "string"
  ) {
    return (err as { message: string }).message;
  }
  return String(err);
}

export function createRecordLinks(
  call: (op: string, extra?: Record<string, unknown>) => Promise<any>,
  getSelection: () => { id: string; revision: number } | null,
  onSaved: () => Promise<void>
): { render: () => string; bind: (root: ParentNode) => void } {
  const bound = new WeakSet<object>();

  return {
    render(): string {
      return `
<details class="record-links">
  <summary>Link record</summary>
  <form data-rl-form>
    <label>
      Kind
      <select data-rl-kind>
        <option value="parcel">Parcel</option>
        <option value="permit">Permit</option>
        <option value="inspection">Inspection</option>
      </select>
    </label>
    <label>
      Identifier
      <input data-rl-identifier type="text" autocomplete="off">
    </label>
    <label>
      Jurisdiction
      <input data-rl-jurisdiction type="text" autocomplete="off">
    </label>
    <button type="button" data-rl-lookup>Lookup</button>
    <label>
      <input data-rl-confirm type="checkbox">
      Confirm link
    </label>
    <button type="button" data-rl-link disabled>Link selected request</button>
    <pre data-rl-status role="status"></pre>
  </form>
</details>`;
    },

    bind(root: ParentNode): void {
      if (bound.has(root as object)) return;
      bound.add(root as object);

      const form = root.querySelector<HTMLFormElement>("[data-rl-form]");
      const kindEl = root.querySelector<HTMLSelectElement>("[data-rl-kind]");
      const identifierEl = root.querySelector<HTMLInputElement>("[data-rl-identifier]");
      const jurisdictionEl = root.querySelector<HTMLInputElement>("[data-rl-jurisdiction]");
      const lookupBtn = root.querySelector<HTMLButtonElement>("[data-rl-lookup]");
      const confirmEl = root.querySelector<HTMLInputElement>("[data-rl-confirm]");
      const linkBtn = root.querySelector<HTMLButtonElement>("[data-rl-link]");
      const status = root.querySelector<HTMLElement>("[data-rl-status]");

      if (
        !form ||
        !kindEl ||
        !identifierEl ||
        !jurisdictionEl ||
        !lookupBtn ||
        !confirmEl ||
        !linkBtn ||
        !status
      ) {
        return;
      }

      let busy = false;
      let preview: RecordLinkPreview | null = null;

      function updateControls(): void {
        lookupBtn.disabled = busy;
        linkBtn.disabled = busy || !preview;
      }

      function setBusy(next: boolean): void {
        busy = next;
        updateControls();
      }

      function showError(message: string): void {
        status.textContent = `Error: ${message}`;
      }

      function clearPreview(): void {
        preview = null;
        status.textContent = "";
        updateControls();
      }

      function readFields(): RecordLinkFields {
        return {
          kind: kindEl.value,
          identifier: identifierEl.value.trim(),
          jurisdiction: jurisdictionEl.value.trim() || undefined,
        };
      }

      async function handleLookup(): Promise<void> {
        if (busy) return;

        const fields = readFields();
        if (!validKind(fields.kind)) {
          showError("Choose a valid kind.");
          return;
        }
        if (!fields.identifier) {
          showError("Identifier is required.");
          return;
        }

        const selection = getSelection();
        const selected = selection
          ? { id: selection.id, revision: selection.revision }
          : null;

        setBusy(true);
        status.textContent = "Looking up...";

        try {
          const result = await call("record-lookup", {
            payload: {
              kind: fields.kind,
              identifier: fields.identifier,
              jurisdiction: fields.jurisdiction,
            },
          });

          const targetId =
            result && typeof result.target_id === "string" ? result.target_id : "";
          if (!targetId) {
            throw new Error("Lookup did not return a target_id.");
          }

          preview = {
            fields,
            selected,
            target_id: targetId,
          };

          status.textContent = JSON.stringify(
            {
              kind: fields.kind,
              identifier: fields.identifier,
              jurisdiction: fields.jurisdiction ?? null,
              target_id: targetId,
              selected_id: selected ? selected.id : null,
              selected_revision: selected ? selected.revision : null,
            },
            null,
            2
          );
        } catch (err) {
          preview = null;
          showError(errorMessage(err));
        } finally {
          setBusy(false);
        }
      }

      async function handleLink(): Promise<void> {
        if (busy) return;

        if (!confirmEl.checked) {
          showError("Confirm the link first.");
          return;
        }
        if (!preview) {
          showError("Look up a record first.");
          return;
        }

        const selection = getSelection();
        if (!selection) {
          showError("Select a request first.");
          return;
        }

        const selected = preview.selected;
        if (
          !selected ||
          selected.id !== selection.id ||
          selected.revision !== selection.revision
        ) {
          showError("The selected request changed. Look up again.");
          return;
        }

        const fields = readFields();
        if (!sameFields(fields, preview.fields)) {
          showError("The form changed. Look up again.");
          return;
        }

        setBusy(true);

        try {
          await call("link-record", {
            id: selection.id,
            payload: {
              ...fields,
              expected_revision: selection.revision,
              confirm: true,
            },
          });
          await onSaved();
          clearPreview();
          status.textContent = "Linked.";
        } catch (err) {
          showError(errorMessage(err));
        } finally {
          setBusy(false);
        }
      }

      form.addEventListener("submit", (event) => {
        event.preventDefault();
      });

      lookupBtn.addEventListener("click", () => {
        void handleLookup();
      });

      linkBtn.addEventListener("click", () => {
        void handleLink();
      });

      updateControls();
    },
  };
}