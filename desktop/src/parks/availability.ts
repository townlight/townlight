interface ResourceSelectedDetail {
  id: string;
  revision: number;
  snapshot: unknown;
}

interface ResourceRow {
  id: string;
  revision: number;
  [key: string]: unknown;
}

interface ClosureRow {
  id: string;
  starts_at: string;
  ends_at: string;
  reason?: string;
  [key: string]: unknown;
}

interface AvailabilityResult {
  available: boolean;
  reason: string;
  starts_at: string;
  ends_at: string;
}

export interface AvailabilityContext {
  call<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T>;
  run(label: string, task: () => Promise<void> | void): Promise<void> | void;
  status(message: string): void;
}

function formValue(form: HTMLFormElement | null, name: string): string {
  const control = form?.elements.namedItem(name);
  if (
    control instanceof HTMLInputElement ||
    control instanceof HTMLTextAreaElement ||
    control instanceof HTMLSelectElement
  ) {
    return control.value.trim();
  }
  return "";
}

function labelForControl(root: HTMLElement, control: HTMLElement | null): string {
  if (!control?.id) return "";
  const label = root.querySelector<HTMLLabelElement>(`label[for="${control.id}"]`);
  return label?.textContent?.trim() ?? "";
}

function labelForField(root: HTMLElement, form: HTMLFormElement | null, name: string): string {
  const control = form?.elements.namedItem(name);
  return control instanceof HTMLElement ? labelForControl(root, control) : name;
}

function legendFor(form: HTMLFormElement | null): string {
  return form?.querySelector<HTMLLegendElement>("legend")?.textContent?.trim() ?? "";
}

export function bindAvailability(root: HTMLElement, ctx: AvailabilityContext): void {
  const resourceSelect = root.querySelector<HTMLSelectElement>("[data-booking-resource]");
  const availabilityButton = root.querySelector<HTMLButtonElement>("[data-booking-availability]");
  const availabilityStatus = root.querySelector<HTMLElement>("[data-availability]");
  const createForm = root.querySelector<HTMLFormElement>("[data-booking-create]");

  const closureList = root.querySelector<HTMLSelectElement>("[data-closure-list]");
  const closureAddForm = root.querySelector<HTMLFormElement>("[data-closure-add]");
  const closureRemoveButton = root.querySelector<HTMLButtonElement>("[data-closure-remove]");
  const closureReasonInput = root.querySelector<HTMLInputElement>("[data-closure-reason]");

  const closurePlaceholder = closureList?.options[0]?.textContent?.trim() ?? "";

  let resource: ResourceRow | null = null;
  let closures: ClosureRow[] = [];
  let canonicalEvent: Event | null = null;

  function setAvailability(message: string): void {
    if (availabilityStatus) availabilityStatus.textContent = message;
  }

  function closureLabel(closure: ClosureRow): string {
    const reason = closure.reason ? ` — ${closure.reason}` : "";
    return `${closure.starts_at} – ${closure.ends_at}${reason}`;
  }

  function fillClosureOptions(): void {
    if (!closureList) return;

    const previous = closureList.value;
    closureList.replaceChildren();

    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = closurePlaceholder;
    closureList.append(placeholder);

    for (const closure of closures) {
      const option = document.createElement("option");
      option.value = closure.id;
      option.textContent = closureLabel(closure);
      closureList.append(option);
    }

    const keep = Array.from(closureList.options).find((option) => option.value === previous);
    if (keep) closureList.value = previous;
  }

  async function loadClosures(resourceId: string): Promise<void> {
    closures = await ctx.call<ClosureRow[]>("closures-list", { resource_id: resourceId });
    fillClosureOptions();
  }

  function handleResourceSelected(event: Event): void {
    const detail = (event as CustomEvent<ResourceSelectedDetail>).detail;
    if (!detail || !detail.id || typeof detail.revision !== "number") return;

    const snapshot = detail.snapshot as ResourceRow;
    resource = { ...snapshot, id: detail.id, revision: detail.revision };

    if (event === canonicalEvent) return;

    void ctx.run("Load closures", async () => {
      await loadClosures(detail.id);
    });
  }

  async function checkAvailability(): Promise<void> {
    if (!resource) {
      throw new Error(`${labelForControl(root, resourceSelect)} is required.`);
    }

    const startsAt = formValue(createForm, "starts_at");
    const endsAt = formValue(createForm, "ends_at");

    if (!startsAt) {
      throw new Error(`${labelForField(root, createForm, "starts_at")} is required.`);
    }
    if (!endsAt) {
      throw new Error(`${labelForField(root, createForm, "ends_at")} is required.`);
    }

    const result = await ctx.call<AvailabilityResult>("availability-query", {
      resource_id: resource.id,
      start: startsAt,
      end: endsAt,
    });

    if (result.available) {
      setAvailability(`Available from ${result.starts_at} to ${result.ends_at}.`);
    } else {
      setAvailability(
        `Unavailable: ${result.reason}. Bounds: ${result.starts_at} to ${result.ends_at}.`,
      );
    }
  }

  async function refreshResource(): Promise<void> {
    if (!resource) {
      throw new Error(`${labelForControl(root, resourceSelect)} is required.`);
    }

    const row = await ctx.call<ResourceRow>("catalog-get", {
      kind: "resource",
      id: resource.id,
    });

    resource = row;

    const event = new CustomEvent<ResourceSelectedDetail>("parks-resource-selected", {
      detail: {
        id: row.id,
        revision: row.revision,
        snapshot: row.snapshot,
      },
    });

    canonicalEvent = event;
    try {
      root.dispatchEvent(event);
    } finally {
      canonicalEvent = null;
    }

    await loadClosures(row.id);
  }

  async function addClosure(): Promise<void> {
    if (!resource) {
      throw new Error(`${labelForControl(root, resourceSelect)} is required.`);
    }

    const startsAt = formValue(closureAddForm, "starts_at");
    const endsAt = formValue(closureAddForm, "ends_at");
    const reason = formValue(closureAddForm, "reason");

    if (!startsAt) {
      throw new Error(`${labelForField(root, closureAddForm, "starts_at")} is required.`);
    }
    if (!endsAt) {
      throw new Error(`${labelForField(root, closureAddForm, "ends_at")} is required.`);
    }
    if (!reason) {
      throw new Error(`${labelForField(root, closureAddForm, "reason")} is required.`);
    }

    await ctx.call("closures-create", {
      resource_id: resource.id,
      payload: {
        expected_revision: resource.revision,
        starts_at: startsAt,
        ends_at: endsAt,
        reason,
      },
    });

    await refreshResource();
    ctx.status(legendFor(closureAddForm));
  }

  async function removeClosure(): Promise<void> {
    if (!resource) {
      throw new Error(`${labelForControl(root, resourceSelect)} is required.`);
    }

    const closureId = closureList?.value ?? "";
    if (!closureId) {
      throw new Error(`${labelForControl(root, closureList)} is required.`);
    }

    const reason = closureReasonInput?.value.trim() ?? "";
    if (!reason) {
      throw new Error(`${labelForControl(root, closureReasonInput)} is required.`);
    }

    await ctx.call("closures-delete", {
      resource_id: resource.id,
      closure_id: closureId,
      payload: {
        expected_revision: resource.revision,
        reason,
      },
    });

    await refreshResource();
    ctx.status(labelForControl(root, closureReasonInput));
  }

  root.addEventListener("parks-resource-selected", handleResourceSelected);

  availabilityButton?.addEventListener("click", () => {
    void ctx.run("Check availability", checkAvailability);
  });

  closureAddForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    void ctx.run("Add closure", addClosure);
  });

  closureRemoveButton?.addEventListener("click", () => {
    void ctx.run("Remove closure", removeClosure);
  });
}
