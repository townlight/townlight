import { createMeetingsClient } from "../meetings/client.ts";

export async function bindBudgetAdoption(
  root: HTMLElement,
  invoke: (method: string, args?: unknown) => Promise<unknown>,
  getRevision: () => unknown,
  action: (name: string, payload: unknown) => Promise<unknown>,
  reload: (id: string) => Promise<void>,
) {
  const host = root.querySelector<HTMLElement>("[data-budget-adoption]");
  if (!host) return;

  host.innerHTML = `
    <label>Meeting <select data-meeting></select></label>
    <label>Packet approval <select data-packet></select></label>
    <label>Motion <select data-motion></select></label>
    <label>Plain-language summary <textarea data-summary rows="4"></textarea></label>
    <label><input type="checkbox" data-confirm> I confirm this adoption</label>
    <button type="button" data-submit disabled>Adopt budget</button>
    <p data-status role="status" aria-live="polite"></p>
  `;

  const meetingSel = host.querySelector<HTMLSelectElement>("[data-meeting]")!;
  const packetSel = host.querySelector<HTMLSelectElement>("[data-packet]")!;
  const motionSel = host.querySelector<HTMLSelectElement>("[data-motion]")!;
  const summary = host.querySelector<HTMLTextAreaElement>("[data-summary]")!;
  const confirm = host.querySelector<HTMLInputElement>("[data-confirm]")!;
  const submit = host.querySelector<HTMLButtonElement>("[data-submit]")!;
  const status = host.querySelector<HTMLElement>("[data-status]")!;

  const client = createMeetingsClient(invoke as any);
  const setStatus = (text: string) => { status.textContent = text; };

  let meetingToken = 0;
  let busy = false;
  let meetings: any[] = [];
  let proceedings: any = null;
  let packetChoices: Array<{ packet: any; approval: any }> = [];
  let motions: any[] = [];

  const selectedMeeting = () =>
    meetings.find((m) => String(m?.id ?? "") === meetingSel.value);

  const selectedPacket = () => {
    if (packetSel.value === "") return undefined;
    const i = Number(packetSel.value);
    if (!Number.isInteger(i)) return undefined;
    return packetChoices[i];
  };

  const selectedMotion = () => {
    if (motionSel.value === "") return undefined;
    const i = Number(motionSel.value);
    if (!Number.isInteger(i)) return undefined;
    return motions[i];
  };

  function canSubmit(): boolean {
    if (busy) return false;
    const rev: any = getRevision();
    if (!rev) return false;
    if (!rev.finance_reviewed_at || rev.adopted_at) return false;
    if (!selectedMeeting()) return false;
    if (!proceedings) return false;
    if (!selectedPacket()) return false;
    const motion = selectedMotion();
    if (!motion || motion.agenda_item_id == null) return false;
    if (!confirm.checked) return false;
    if (!summary.value.trim()) return false;
    return true;
  }

  function updateEnabled() {
    submit.disabled = !canSubmit();
  }

  function renderPackets() {
    packetChoices = [];
    packetSel.innerHTML = "";
    packetSel.add(new Option("Select a public packet approval", ""));
    const packets = Array.isArray(proceedings?.packets) ? proceedings.packets : [];
    for (const packet of packets) {
      const history = Array.isArray(packet?.delivery_history) ? packet.delivery_history : [];
      for (const h of history) {
        if (!h) continue;
        if (h.kind !== "council-packet-approval") continue;
        if (h.audience !== "public") continue;
        if (!h.approval_id || !h.manifest_sha256) continue;
        const shortId = String(h.approval_id).slice(0, 8);
        const ts = h.at ?? h.created_at ?? h.timestamp;
        let agePart = "";
        if (ts) {
          const t = Date.parse(String(ts));
          if (!Number.isNaN(t)) {
            const days = Math.max(0, Math.floor((Date.now() - t) / 86400000));
            agePart = ` · ${days}d`;
          }
        }
        const versionPart = packet.packet_version
          ? `Packet ${String(packet.packet_version)}`
          : `Packet ${String(packet.id ?? "")}`;
        const label = `${versionPart} · ${shortId}${agePart}`;
        packetChoices.push({ packet, approval: h });
        packetSel.add(new Option(label, String(packetChoices.length - 1)));
      }
    }
    packetSel.disabled = packetChoices.length === 0;
  }

  function renderMotions() {
    motions = [];
    motionSel.innerHTML = "";
    motionSel.add(new Option("Select a motion", ""));
    const list = Array.isArray(proceedings?.motions) ? proceedings.motions : [];
    const supersededIds = new Set<string>();
    for (const m of list) {
      if (m && m.correction_of_id != null) {
        supersededIds.add(String(m.correction_of_id));
      }
    }
    for (const motion of list) {
      if (!motion) continue;
      if (supersededIds.has(String(motion.id))) continue;
      if (motion.agenda_item_id == null) continue;
      motions.push(motion);
      const text = typeof motion.text === "string" && motion.text.trim()
        ? motion.text.trim().slice(0, 80)
        : String(motion.id ?? "");
      motionSel.add(new Option(text, String(motions.length - 1)));
    }
    motionSel.disabled = motions.length === 0;
  }

  async function loadMeetings() {
    let cat: any;
    try {
      cat = await client.catalog("", null);
    } catch (err: any) {
      meetings = [];
      setStatus(err?.message ? String(err.message) : "Unable to load meetings catalog.");
      throw err;
    }
    meetings = Array.isArray(cat?.meetings) ? cat.meetings : [];
    meetingSel.innerHTML = "";
    meetingSel.add(new Option("Select a meeting", ""));
    for (const m of meetings) {
      const label = typeof m?.title === "string" ? m.title : String(m?.id ?? "");
      meetingSel.add(new Option(label, String(m?.id ?? "")));
    }
  }

  meetingSel.addEventListener("change", async () => {
    const my = ++meetingToken;
    proceedings = null;
    renderPackets();
    renderMotions();
    updateEnabled();
    const meetingId = meetingSel.value;
    if (!meetingId) return;
    packetSel.disabled = true;
    motionSel.disabled = true;
    setStatus("Loading proceedings…");
    try {
      const p: any = await client.read("proceedings", meetingId);
      if (my !== meetingToken) return;
      proceedings = p;
      renderPackets();
      renderMotions();
      setStatus("");
    } catch {
      if (my !== meetingToken) return;
      proceedings = null;
      setStatus("Unable to load proceedings.");
    }
    updateEnabled();
  });

  for (const el of [packetSel, motionSel, confirm, summary]) {
    el.addEventListener("input", updateEnabled);
    el.addEventListener("change", updateEnabled);
  }

  root.addEventListener("budget-adoption-change", () => updateEnabled());

  submit.addEventListener("click", async () => {
    const rev: any = getRevision();
    if (!rev) {
      updateEnabled();
      setStatus("Revision unavailable.");
      return;
    }
    if (!rev.finance_reviewed_at) {
      updateEnabled();
      setStatus("Finance review is required before adoption.");
      return;
    }
    if (rev.adopted_at) {
      updateEnabled();
      setStatus("This revision is already adopted.");
      return;
    }
    if (!canSubmit()) {
      setStatus("Complete all required fields.");
      return;
    }

    const meeting = selectedMeeting()!;
    const pc = selectedPacket()!;
    const motion = selectedMotion()!;
    busy = true;
    updateEnabled();
    setStatus("Submitting adoption…");
    try {
      await action("adopt-budget", {
        id: rev.id,
        payload: {
          content_sha256: rev.content_sha256,
          meeting_id: String(meeting.id),
          agenda_id: motion.agenda_item_id,
          packet_id: pc.packet.id,
          packet_approval_id: pc.approval.approval_id,
          packet_manifest_sha256: pc.approval.manifest_sha256,
          motion_id: motion.id,
          carried: true,
          public_summary: summary.value.trim(),
        },
      });
      await reload(rev.id);
      setStatus("Budget adoption recorded.");
    } catch (err: any) {
      setStatus(err?.message ? String(err.message) : "Budget adoption failed.");
    } finally {
      busy = false;
      updateEnabled();
    }
  });

  renderPackets();
  renderMotions();
  await loadMeetings();
  updateEnabled();
}
