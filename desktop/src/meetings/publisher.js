export function publisherMarkup() {
  return `<section data-meeting-publisher aria-labelledby="website-publication-heading">
    <h3 id="website-publication-heading">City website publication</h3>
    <p data-publisher-status role="status">Choose a saved meeting to see website publication status.</p>
    <button type="button" data-publication-refresh disabled>Refresh website status and approved packets</button>
    <fieldset data-publisher-controls disabled>
      <legend>Send an approved public copy</legend>
      <label>Reviewed public packet <select data-publisher-packet></select></label>
      <button type="button" data-publisher-action="packet">Send approved packet to website</button>
      <button type="button" data-publisher-requests>Find fulfilled Records requests</button>
      <label>Fulfilled Records request <select data-publisher-request></select></label>
      <label>Eligible recording copy <select data-publisher-recording></select></label>
      <button type="button" data-publisher-action="recording">Send approved recording to website</button>
      <p>Sending a newer reviewed copy replaces that item. Withdrawal affects only the item selected below.</p>
      <label>Withdraw item <select data-publisher-kind><option value="packet">Packet</option><option value="recording">Recording</option></select></label>
      <button type="button" data-publisher-action="withdraw">Withdraw from website</button>
    </fieldset>
  </section>`;
}

export function bindPublisher(root, invoke, client) {
  const panel = root.querySelector("[data-meeting-publisher]");
  const clerk = root.querySelector("[data-clerk-workspace]");
  if (!panel || !clerk) return;
  const $ = selector => panel.querySelector(selector);
  const status = $("[data-publisher-status]");
  const controls = $("[data-publisher-controls]");
  const refresh = $("[data-publication-refresh]");
  const packets = $("[data-publisher-packet]");
  const requests = $("[data-publisher-request]");
  const recordings = $("[data-publisher-recording]");
  const native = request => invoke("meetings_domain_request", {request});
  let meetingId = "";
  let choices = [];
  let options = [];
  let ready = false;
  let busy = false;
  let generation = 0;
  const states = {
    queued: "queued on the shared host",
    retrying: "waiting to retry",
    delivered: "confirmed by the website",
    rejected: "needs staff attention",
  };

  function clear(select, label) {
    select.replaceChildren(new Option(label, ""));
  }

  async function run(task) {
    if (busy || !meetingId) return;
    const expected = generation;
    const id = meetingId;
    const current = () => expected === generation && panel.isConnected;
    busy = true;
    controls.disabled = refresh.disabled = true;
    try {
      await task(id, current);
    } catch (error) {
      if (current()) status.textContent = String(error?.message || error);
    } finally {
      if (current()) {
        busy = false;
        controls.disabled = !ready;
        refresh.disabled = false;
      }
    }
  }

  async function read(id, current) {
    const view = await native({operation: "publisher-status", id});
    if (!current()) return;
    ready = view.configured;
    if (!ready) {
      status.textContent = "Website publishing is configured on the shared Windows host.";
      return;
    }
    const descriptions = view.publications.map(item =>
      `${item.kind === "packet" ? "Packet" : "Recording"} ${item.action === "withdraw" ? "withdrawal" : `revision ${item.sequence}`}: ${states[item.state] || item.state}${item.last_error ? ` (${item.last_error})` : ""}`);
    status.textContent = descriptions.join(" · ") || "No website publications queued for this meeting.";
    const selected = packets.value;
    clear(packets, "Choose an approved public packet");
    const saved = await client.read("proceedings", id);
    if (!current()) return;
    options = saved.packets.flatMap(packet => (packet.delivery_history || [])
      .filter(item => item.kind === "council-packet-approval" && item.audience === "public")
      .map(item => ({...item, packet_id: packet.id, version: packet.packet_version}))).reverse();
    for (const item of options) {
      packets.add(new Option(`Version ${item.version} · approved ${new Date(item.approved_at).toLocaleString()} · ${item.manifest_sha256.slice(0, 12)}`,
        item.approval_id));
    }
    if (options.some(item => item.approval_id === selected)) packets.value = selected;
  }

  clerk.addEventListener("clerk-meeting-change", event => {
    generation += 1;
    meetingId = event.detail || "";
    ready = busy = false;
    options = choices = [];
    controls.disabled = true;
    refresh.disabled = !meetingId;
    clear(packets, "Choose an approved public packet");
    clear(requests, "Choose a fulfilled request");
    clear(recordings, "Choose an eligible recording");
    status.textContent = meetingId ? "Reading website publication status…" : "Choose a saved meeting to see website publication status.";
    if (meetingId) void run(read);
  });
  refresh.addEventListener("click", () => run(read));
  $("[data-publisher-requests]").addEventListener("click", () => run(async (_id, current) => {
    const view = await invoke("records_domain_request", {request: {operation: "state"}});
    if (!current()) return;
    clear(requests, "Choose a fulfilled request");
    clear(recordings, "Choose an eligible recording");
    choices = [];
    const fulfilled = (view.records_requests || []).filter(record => record.request_id && record.fulfilled_at_unix_seconds);
    for (const record of fulfilled) {
      requests.add(new Option(record.public_tracking_number || record.id, record.request_id));
    }
    if (!fulfilled.length) status.textContent = "No fulfilled Records requests are available.";
  }));
  requests.addEventListener("change", () => run(async (id, current) => {
    clear(recordings, "Choose an eligible recording");
    choices = [];
    if (!requests.value) return;
    const result = await native({operation: "publisher-recording-choices", request_id: requests.value});
    if (!current()) return;
    choices = result.selections.filter(item => item.selection.meeting_id === id);
    choices.forEach(({title, selection}, index) => {
      recordings.add(new Option(`${title} · SHA-256 ${selection.expected_release_sha256.slice(0, 12)}…`, String(index)));
    });
    if (!choices.length) status.textContent = "That request has no approved publishable recording for this meeting.";
  }));
  $("[data-publisher-action=packet]").addEventListener("click", () => run(async (id, current) => {
    const item = options.find(option => option.approval_id === packets.value);
    if (!item) throw new Error("Choose an approved public packet.");
    if (!window.confirm(`Publish reviewed packet version ${item.version} to the city website?`)) return;
    await native({operation: "publisher-packet", payload: {
      packet_id: item.packet_id, approval_id: item.approval_id, expected_manifest_sha256: item.manifest_sha256,
    }});
    await read(id, current);
  }));
  $("[data-publisher-action=recording]").addEventListener("click", () => run(async (id, current) => {
    const choice = recordings.value === "" ? null : choices[Number(recordings.value)];
    if (!choice) throw new Error("Choose an eligible recording release copy.");
    if (!window.confirm(`Publish the approved recording for ${choice.title} to the city website?`)) return;
    await native({operation: "publisher-recording", payload: {...choice.selection, approve_publication: true}});
    await read(id, current);
  }));
  $("[data-publisher-action=withdraw]").addEventListener("click", () => run(async (id, current) => {
    const kind = $("[data-publisher-kind]").value;
    if (!window.confirm(`Withdraw the ${kind} from the city website?`)) return;
    await native({operation: "publisher-withdrawal", id, kind});
    await read(id, current);
  }));
}
