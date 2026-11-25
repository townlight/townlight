type RecordValue = Record<string, unknown>;

interface EnrollmentContext {
  call<T = unknown>(op: string, extra?: Record<string, unknown>): Promise<T>;
  run<T>(label: string, task: () => Promise<T> | T): Promise<T>;
  status?: unknown;
}

function isRecord(value: unknown): value is RecordValue {
  return typeof value === "object" && value !== null;
}

function asString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value);
  return text.length > 0 ? text : null;
}

function asNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function rowOf(value: unknown): RecordValue | null {
  if (!isRecord(value)) return null;
  const nested = value.session ?? value.registration;
  return isRecord(nested) ? nested : value;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error ?? "Unknown error");
}

export function bindEnrollment(root: HTMLElement | Document, ctx: EnrollmentContext): void {
  const doc = root instanceof Document ? root : root.ownerDocument;
  const q = <T extends Element = HTMLElement>(selector: string): T | null =>
    root.querySelector<T>(selector);

  let selectedSessionId: string | null = null;
  let selectedSessionRevision: number | null = null;
  let selectedParticipantId: string | null = null;
  let selectedHouseholdId: string | null = null;
  let selectedRegistrationId: string | null = null;
  let selectedRegistration: RecordValue | null = null;
  let roster: RecordValue[] = [];
  let rosterSeq = 0;
  let detailSeq = 0;

  function setStatus(message: string): void {
    const sink = ctx.status;
    if (typeof sink === "function") {
      (sink as (message: string) => void)(message);
      return;
    }
    if (typeof sink === "string") {
      try {
        (ctx as { status: string }).status = message;
      } catch {
        // Ignore read-only status sinks.
      }
      return;
    }
    if (isRecord(sink)) {
      if (typeof sink.set === "function") {
        (sink.set as (message: string) => void).call(sink, message);
        return;
      }
      if ("textContent" in sink) {
        (sink as { textContent: string }).textContent = message;
      }
    }
  }

  function registrationId(item: RecordValue): string | null {
    return asString(item.registration_id ?? item.registrationId ?? item.id);
  }

  function participantIdOf(item: RecordValue): string | null {
    return asString(item.participant_id ?? item.participantId);
  }

  function participantNameOf(item: RecordValue): string {
    return (
      asString(item.name ?? item.participant_name ?? item.participantName) ??
      participantIdOf(item) ??
      "Participant"
    );
  }

  function householdLabelOf(item: RecordValue): string {
    return isRecord(item.contact)
      ? asString(item.contact.contact_name) ?? ""
      : "";
  }

  function checkedInLabel(item: RecordValue): string {
    const value =
      item.checked_in_at ??
      item.checkedInAt ??
      item.checked_in ??
      item.checkedIn;
    return value === null || value === undefined || value === "" || value === false
      ? "No"
      : "Yes";
  }

  function renderRoster(): void {
    const target = q<HTMLElement>("[data-session-roster]");
    if (!target) return;
    target.replaceChildren();
    for (const item of roster) {
      const tr = doc.createElement("tr");
      const cells = [
        participantNameOf(item),
        householdLabelOf(item),
        asString(item.state) ?? "unknown",
        checkedInLabel(item),
      ];
      for (const value of cells) {
        const td = doc.createElement("td");
        td.textContent = value;
        tr.append(td);
      }
      target.append(tr);
    }
  }

  function renderRegistrationList(): void {
    const select = q<HTMLSelectElement>("[data-registration-list]");
    if (!select) return;
    const current = selectedRegistrationId;
    select.replaceChildren();
    const placeholder = doc.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Select a registration";
    select.append(placeholder);
    for (const item of roster) {
      const id = registrationId(item);
      if (!id) continue;
      const option = doc.createElement("option");
      option.value = id;
      option.textContent = `${participantNameOf(item)} — ${asString(item.state) ?? "unknown"}`;
      select.append(option);
    }
    select.value =
      current && roster.some((item) => registrationId(item) === current) ? current : "";
  }

  function renderDetails(registration: RecordValue | null): void {
    const target = q<HTMLElement>("[data-registration-details]");
    if (!target) return;
    target.replaceChildren();
    if (!registration) return;
    const entries: Array<[string, string]> = [
      ["State", asString(registration.state) ?? "unknown"],
      ["Revision", asString(registration.revision) ?? ""],
      ["Checked in", checkedInLabel(registration)],
    ];
    for (const [label, value] of entries) {
      const p = doc.createElement("p");
      const strong = doc.createElement("strong");
      strong.textContent = `${label}: `;
      p.append(strong, doc.createTextNode(value));
      target.append(p);
    }
  }

  function emitRegistrationSelected(detail: RecordValue | { id: string }): void {
    root.dispatchEvent(
      new CustomEvent("parks-registration-selected", { detail, bubbles: true }),
    );
  }

  function clearRegistrationSelection(): void {
    selectedRegistrationId = null;
    selectedRegistration = null;
    detailSeq += 1;
    const select = q<HTMLSelectElement>("[data-registration-list]");
    if (select) select.value = "";
    renderDetails(null);
    emitRegistrationSelected({ id: "" });
  }

  function selectedRegistrationRevision(): number | null {
    if (selectedRegistration) {
      const revision = asNumber(selectedRegistration.revision);
      if (revision !== null) return revision;
    }
    if (!selectedRegistrationId) return null;
    const item = roster.find((row) => registrationId(row) === selectedRegistrationId);
    return item ? asNumber(item.revision) : null;
  }

  async function loadRegistration(registrationIdValue: string): Promise<void> {
    const id = asString(registrationIdValue);
    if (!id) {
      clearRegistrationSelection();
      return;
    }
    const sessionAtStart = selectedSessionId;
    selectedRegistrationId = id;
    selectedRegistration = null;
    const token = ++detailSeq;
    const select = q<HTMLSelectElement>("[data-registration-list]");
    if (select) select.value = id;
    setStatus("Loading registration details…");
    try {
      const data = await ctx.run("Load registration details", () =>
        ctx.call("registrations-get", { registration_id: id }),
      );
      if (
        token !== detailSeq ||
        sessionAtStart !== selectedSessionId ||
        selectedRegistrationId !== id
      ) {
        return;
      }
      const registration = rowOf(data);
      selectedRegistration = registration;
      renderDetails(registration);
      if (registration) emitRegistrationSelected(registration);
      setStatus("Registration details loaded.");
    } catch (error) {
      if (
        token !== detailSeq ||
        sessionAtStart !== selectedSessionId ||
        selectedRegistrationId !== id
      ) {
        return;
      }
      selectedRegistration = null;
      renderDetails(null);
      setStatus(`Unable to load registration: ${errorText(error)}`);
    }
  }

  async function loadRoster(restoreRegistrationId?: string | null): Promise<void> {
    const sessionId = selectedSessionId;
    if (!sessionId) {
      roster = [];
      renderRoster();
      clearRegistrationSelection();
      renderRegistrationList();
      return;
    }

    const token = ++rosterSeq;
    setStatus("Loading session roster…");
    try {
      const data = await ctx.run("Load session roster", () =>
        ctx.call("sessions-roster", { session_id: sessionId }),
      );
      if (token !== rosterSeq || selectedSessionId !== sessionId) return;

      if (!Array.isArray(data)) {
        throw new Error("Session roster response must be an array.");
      }
      if (!data.every((item): item is RecordValue => isRecord(item))) {
        throw new Error("Session roster contains malformed rows.");
      }
      roster = data;
      renderRoster();
      renderRegistrationList();
      setStatus(`Roster loaded (${roster.length}).`);

      const candidate =
        selectedRegistrationId ?? asString(restoreRegistrationId);
      const present = candidate
        ? roster.find((item) => registrationId(item) === candidate)
        : undefined;

      if (candidate && present) {
        selectedRegistrationId = candidate;
        const select = q<HTMLSelectElement>("[data-registration-list]");
        if (select) select.value = candidate;
        await loadRegistration(candidate);
      } else {
        clearRegistrationSelection();
        renderRegistrationList();
      }
    } catch (error) {
      if (token !== rosterSeq || selectedSessionId !== sessionId) return;
      setStatus(`Unable to load session roster: ${errorText(error)}`);
    }
  }

  function requestSessionRefresh(): void {
    root.dispatchEvent(new CustomEvent("parks-session-refresh", { bubbles: true }));
  }

  async function handleSessionSelected(event: Event): Promise<void> {
    const detail = (event as CustomEvent<unknown>).detail;
    const row = rowOf(detail);
    const id = asString(row?.id ?? row?.session_id);
    if (!id) {
      selectedSessionId = null;
      selectedSessionRevision = null;
      rosterSeq += 1;
      detailSeq += 1;
      roster = [];
      clearRegistrationSelection();
      renderRoster();
      renderRegistrationList();
      return;
    }

    const revision = asNumber(row?.revision ?? row?.session_revision);
    const changed = selectedSessionId !== id;
    const previousRegistration = selectedRegistrationId;

    selectedSessionId = id;
    if (changed || revision !== null) selectedSessionRevision = revision;

    if (changed) {
      rosterSeq += 1;
      roster = [];
      renderRoster();
      clearRegistrationSelection();
      renderRegistrationList();
    }

    await loadRoster(changed ? previousRegistration : null);
  }

  function handleParticipantSelected(event: Event): void {
    const detail = (event as CustomEvent<unknown>).detail;
    const row =
      isRecord(detail) && isRecord(detail.participant)
        ? detail.participant
        : isRecord(detail)
          ? detail
          : null;
    if (!row) return;

    const id = asString(row.id ?? row.participant_id);
    const input = q<HTMLInputElement>("[data-registration-participant]");
    if (!id) {
      selectedParticipantId = null;
      if (input) input.value = "";
      return;
    }

    selectedParticipantId = id;
    selectedHouseholdId = asString(
      row.household_id ?? row.householdId ?? row.householdid,
    );

    if (input) {
      input.value = asString(row.name ?? row.participant_name) ?? id;
    }
    setStatus(`Selected participant ${id}.`);
  }

  function handleHouseholdSelected(event: Event): void {
    const detail = (event as CustomEvent<unknown>).detail;
    const row =
      isRecord(detail) && isRecord(detail.household)
        ? detail.household
        : isRecord(detail)
          ? detail
          : null;

    selectedParticipantId = null;
    const input = q<HTMLInputElement>("[data-registration-participant]");
    if (input) input.value = "";

    selectedHouseholdId = row
      ? asString(row.id ?? row.household_id ?? row.householdId ?? row.householdid)
      : null;
    setStatus("Household selected. Choose a participant.");
  }

  function bindActionForm(
    form: HTMLFormElement | null,
    op: string,
    label: string,
    success: string,
  ): void {
    if (!form) return;
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const id = selectedRegistrationId;
      const revision = selectedRegistrationRevision();
      const reasonField = form.querySelector<HTMLTextAreaElement>("[name='reason']");
      const reason = reasonField?.value.trim() ?? "";

      if (!id || revision === null) {
        setStatus("Select a registration first.");
        return;
      }
      if (!reason) {
        setStatus("Enter a reason.");
        return;
      }

      const reg = selectedRegistration;
      if (!reg) {
        setStatus("Select a registration first.");
        return;
      }
      if (op.includes("check") && reg.state !== "confirmed") {
        setStatus(`Cannot check in a ${reg.state} registration.`);
        return;
      }
      if (op.includes("cancel") && reg.state !== "confirmed" && reg.state !== "waitlisted") {
        setStatus(`Cannot cancel a ${reg.state} registration.`);
        return;
      }

      void ctx
        .run(label, async () => {
          setStatus(`${label}…`);
          await ctx.call(op, {
            registration_id: id,
            payload: { expected_revision: revision, reason },
          });
          if (reasonField) reasonField.value = "";
          setStatus(`${success} Refreshing session…`);
          requestSessionRefresh();
        })
        .catch((error: unknown) => {
          setStatus(`Unable to ${label.toLowerCase()}: ${errorText(error)}`);
        });
    });
  }

  root.addEventListener("parks-session-selected", (event) => {
    void handleSessionSelected(event);
  });
  root.addEventListener("parks-participant-selected", handleParticipantSelected);
  root.addEventListener("parks-household-selected", handleHouseholdSelected);

  const registrationList = q<HTMLSelectElement>("[data-registration-list]");
  registrationList?.addEventListener("change", () => {
    const id = asString(registrationList.value);
    if (!id) {
      clearRegistrationSelection();
      setStatus("");
      return;
    }
    void loadRegistration(id);
  });

  const registrationForm = q<HTMLFormElement>("[data-registration-create]");
  registrationForm?.addEventListener("submit", (event) => {
    event.preventDefault();

    const sessionId = selectedSessionId;
    const revision = selectedSessionRevision;
    const participantId = selectedParticipantId;

    if (!sessionId || revision === null || !participantId) {
      setStatus("Select a session and participant first.");
      return;
    }

    void ctx
      .run("Register participant", async () => {
        setStatus("Creating registration…");
        await ctx.call("registrations-create", {
          payload: {
            session_id: sessionId,
            participant_id: participantId,
            expected_session_revision: revision,
          },
        });
        setStatus("Registration created. Refreshing session…");
        requestSessionRefresh();
      })
      .catch((error: unknown) => {
        setStatus(`Unable to create registration: ${errorText(error)}`);
      });
  });

  bindActionForm(
    q<HTMLFormElement>("[data-registration-cancel]"),
    "registrations-cancel",
    "Cancel registration",
    "Registration cancelled.",
  );

  bindActionForm(
    q<HTMLFormElement>("[data-registration-check-in]"),
    "registrations-check-in",
    "Check in registration",
    "Registration checked in.",
  );
}
