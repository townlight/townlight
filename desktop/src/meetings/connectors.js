/** Shared SDK workflow, without provider logic, credentials or implicit writes. */
export function renderConnectors() {
  return `<section data-connectors><h3>External meeting evidence</h3>
    <p>Discover and search with QuorumRelay 0.1.0.dev6. Captured evidence and provider coverage are separate from canonical Townlight records and publication. Missing text or media does not complete transcription or a writing workflow.</p>
    <form data-connector-config>
      <label>Provider and saved format <select name="format" required></select></label>
      <label>Original source URL <input name="url" type="url" required maxlength="2048"></label>
      <label><input name="native" type="checkbox" checked> Use supported live discovery (uncheck for a saved-format source)</label>
      <label>Body (optional) <input name="body" maxlength="255"></label>
      <label><input name="new_source" type="checkbox"> I confirm this is a new source, not a transition of existing imported records</label>
      <details><summary>Documented source options and identity transition</summary>
        <p>No passwords or tokens here. Existing-source transitions need administrator-approved original URL, namespace and explicit ID mappings with evidence.</p>
        <label>Exact source namespace (optional) <input name="namespace" maxlength="1000"></label>
        <label>Provider options (JSON object) <textarea name="options">{}</textarea></label>
        <label>Verified identity mappings (JSON array, local administrator only) <textarea name="identity_mappings">[]</textarea></label>
      </details>
      <button type="submit">Save validated source</button>
      <button type="button" data-identify>Identify URL</button>
      <button type="button" data-capabilities>Inspect provider capabilities</button>
    </form>
    <form data-connector-work>
      <label>Configured source <select name="source_id" required></select></label>
      <label>From date (inclusive) <input name="date_from" type="date"></label>
      <label>Through date (inclusive) <input name="date_to" type="date"></label>
      <label>Saved response (optional, up to 16 MiB) <input name="capture" type="file" accept=".json,.html,.htm,.pdf,.ics,.zip,.jsonl"></label>
      <button name="action" value="discover">Discover / read saved response</button>
      <details><summary>Authorized account fetch</summary>
        <p>Account reads require separately configured, namespace-bound server credentials. Ordinary date and body filters do not apply; use the provider's documented request fields. Do not enter credentials here.</p>
        <label>Provider fetch fields (JSON object) <textarea name="fetch_options">{}</textarea></label>
        <button name="action" value="fetch">Fetch authorized account record</button>
      </details>
      <label>Captured result <select name="result_id"></select></label>
      <button name="action" value="inspect">Reopen result</button>
      <button name="action" value="save_evidence">Save searchable evidence</button>
      <label>Exact terms (one per line) <textarea name="terms"></textarea></label>
      <label>Exact phrases (one per line) <textarea name="phrases"></textarea></label>
      <button name="action" value="search">Search selected evidence</button>
      <button name="action" value="preview">Preview canonical import</button>
      <label>Meeting to save <select name="selection"></select></label>
      <button name="action" value="save_meeting" disabled>Save selected canonical meeting</button>
      <label>Export format <select name="export_format"><option>zip</option><option>json</option><option>jsonl</option><option>csv-meetings</option><option>csv-items</option><option>ics</option></select></label>
      <button name="action" value="export">Export evidence</button>
      <button name="action" value="next">Next result page</button>
    </form>
    <form data-connector-write>
      <h4>Explicit provider action</h4>
      <p>Disabled without an explicit server-owned source grant and local administrator role. Provider credentials are required where the provider requires them. Ingestion, search, import and export never perform these actions. Review the exact returned plan before approving it. No live provider acceptance is claimed.</p>
      <label>Documented changes (JSON array) <textarea name="changes">[]</textarea></label>
      <button name="action" value="plan_write" disabled>Create change plan</button>
      <label>Exact saved plan ID <input name="plan_id" readonly></label>
      <label>Exact saved plan hash <input name="plan_hash" readonly></label>
      <label><input name="approve" type="checkbox"> I authorize only the exact displayed plan</label>
      <button name="action" value="commit_write" disabled>Commit exact authorized plan</button>
      <button name="action" value="receipt" disabled>Read saved receipt</button>
    </form>
    <form data-connector-progress><label>Operation ID <input name="operation_id" required></label>
      <button name="action" value="status">Read progress</button><button name="action" value="cancel">Cancel bounded operation</button></form>
    <p data-connector-status role="status" aria-live="polite">Loading providers and saved sources…</p>
    <pre data-connector-output tabindex="0" aria-label="Connector results and coverage"></pre>
  </section>`;
}

export function bindConnectors(root, client) {
  const area = root.querySelector("[data-connectors]");
  if (!area) return;
  const config = area.querySelector("[data-connector-config]");
  const work = area.querySelector("[data-connector-work]");
  const write = area.querySelector("[data-connector-write]");
  const status = area.querySelector("[data-connector-status]");
  const output = area.querySelector("[data-connector-output]");
  const field = (form, name) => form.elements.namedItem(name);
  let formats = [], selections = [], next = null, nextKind = "inspect", previewResult = null, revision = 0;
  const show = result => {
    output.textContent = JSON.stringify(result, null, 2);
    status.textContent = `${result.status}. ${result.status === "partial" ? "Coverage is incomplete; review failures and available text before proceeding." : result.status === "failed" ? "No successful completion is claimed. Review the errors and retry the same operation." : "Review results and coverage."}`;
    if (result.operation_id) field(area.querySelector("[data-connector-progress]"), "operation_id").value = result.operation_id;
  };
  const request = async (operation, payload) => {
    status.textContent = "Waiting for the local connector engine…";
    const result = await client.connector(operation, payload);
    show(result);
    return result;
  };
  const clearSelection = () => {
    revision++; selections = []; previewResult = null;
    field(work, "selection").replaceChildren();
    work.querySelector('[value="save_meeting"]').disabled = true;
  };
  const reload = async () => {
    const selectedSource = field(work, "source_id").value, selectedResult = field(work, "result_id").value;
    const result = await client.connector("sources");
    field(work, "source_id").replaceChildren(...(result.data?.sources || []).map(s => new Option(
      `${s.source.provider} · ${s.source.url}`, s.source_id,
    )));
    if ([...field(work, "source_id").options].some(o => o.value === selectedSource)) field(work, "source_id").value = selectedSource;
    field(work, "result_id").replaceChildren(...(result.data?.results || []).map(r => new Option(
      `${r.status} · ${r.record_count} records · ${r.result_id}`, r.result_id,
    )));
    if ([...field(work, "result_id").options].some(o => o.value === selectedResult)) field(work, "result_id").value = selectedResult;
    for (const button of write.querySelectorAll("button")) button.disabled = !result.data?.can_write;
  };
  const failed = error => { status.textContent = `Could not confirm connector work. Reopen saved results before retrying. ${error?.message || error?.code || ""}`; };
  Promise.all([client.connector("providers"), reload()]).then(([result]) => {
    formats = result.data.formats;
    field(config, "format").replaceChildren(...formats.map((f, i) => new Option(f.label, String(i))));
    status.textContent = `${result.data.providers.length} providers, ${formats.length} saved formats. Select a source to begin.`;
  }).catch(failed);
  for (const name of ["source_id", "result_id", "date_from", "date_to", "capture", "terms", "phrases"]) field(work, name).addEventListener("input", clearSelection);
  config.addEventListener("submit", async event => {
    event.preventDefault();
    const button = event.submitter; if (button.disabled) return; button.disabled = true;
    try {
      const f = formats[Number(field(config, "format").value)];
      const source = {provider: f.connector, url: field(config, "url").value, options: JSON.parse(field(config, "options").value)};
      if (field(config, "namespace").value.trim()) source.namespace = field(config, "namespace").value.trim();
      if (!field(config, "native").checked) source.input_format = f.input_format;
      if (field(config, "body").value) source.body = field(config, "body").value;
      const result = await request("configure_source", {source, new_source: field(config, "new_source").checked,
        identity_mappings: JSON.parse(field(config, "identity_mappings").value)});
      await reload();
      if (result.status === "completed") field(work, "source_id").value = result.data.source_id;
      clearSelection();
    } catch (error) { failed(error); } finally { button.disabled = false; }
  });
  for (const [selector, operation] of [["[data-identify]", "identify"], ["[data-capabilities]", "capabilities"]]) config.querySelector(selector).addEventListener("click", async () => {
    try { await request(operation, operation === "identify" ? {url: field(config, "url").value} : {provider: formats[Number(field(config, "format").value)].connector}); } catch (error) { failed(error); }
  });
  work.addEventListener("submit", async event => {
    event.preventDefault();
    const button = event.submitter; if (!button || button.disabled) return;
    let action = button.value;
    const token = revision;
    button.disabled = true;
    try {
      const source_id = field(work, "source_id").value, result_id = field(work, "result_id").value;
      let payload = {};
      if (action === "discover" || action === "fetch") {
        clearSelection();
        const bounds = {};
        for (const name of ["date_from", "date_to"]) if (field(work, name).value) bounds[name] = field(work, name).value;
        payload = {source_id, bounds, operation_id: crypto.randomUUID()};
        if (action === "fetch") {
          payload.bounds = {};
          payload.fetch_options = JSON.parse(field(work, "fetch_options").value);
        }
        field(area.querySelector("[data-connector-progress]"), "operation_id").value = payload.operation_id;
        const file = field(work, "capture").files[0];
        if (file) {
          if (!file.size || file.size > 16 * 1024 * 1024) throw new Error("Choose a response up to 16 MiB.");
          payload.content_base64 = await new Promise((resolve, reject) => {
            const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(",", 2)[1]);
            reader.onerror = () => reject(new Error("Could not read the selected capture.")); reader.readAsDataURL(file);
          });
        }
      } else if (action === "search") {
        clearSelection();
        payload = {source_id, result_id, query: {}};
        for (const name of ["terms", "phrases"]) payload.query[name] = field(work, name).value.split("\n").map(s => s.trim()).filter(Boolean);
        for (const name of ["date_from", "date_to"]) if (field(work, name).value) payload.query[name] = field(work, name).value;
      } else if (action === "save_meeting") {
        if (previewResult !== result_id) throw new Error("Preview the current captured result again.");
        payload = selections[Number(field(work, "selection").value)];
        payload = {selection_id: payload.selection_id, expected_sha256: payload.expected_sha256};
      } else {
        payload = {result_id};
        if (action === "export") payload.format = field(work, "export_format").value;
        if (action === "next") { if (next === null) throw new Error("No next page."); action = nextKind; payload.offset = next; }
      }
      const result = await request(action, payload);
      if (action === "preview" && token === revision) {
        selections = result.data?.selections || []; previewResult = result_id;
        field(work, "selection").replaceChildren(...selections.map((s, i) => new Option(s.title, String(i))));
        work.querySelector('[value="save_meeting"]').disabled = !selections.length;
      }
      next = result.data?.next_offset ?? null;
      nextKind = action === "preview" ? "preview" : "inspect";
      if (result.data?.result_id) {
        await reload();
        field(work, "result_id").value = result.data.result_id;
      }
    } catch (error) { failed(error); } finally {
      button.disabled = button.value === "save_meeting" ? !selections.length : false;
    }
  });
  write.addEventListener("input", event => {
    if (event.target.name === "changes") {
      field(write, "plan_id").value = ""; field(write, "plan_hash").value = ""; field(write, "approve").checked = false;
    }
  });
  field(work, "source_id").addEventListener("input", () => {
    field(write, "plan_id").value = ""; field(write, "plan_hash").value = ""; field(write, "approve").checked = false;
  });
  write.addEventListener("submit", async event => {
    event.preventDefault(); const button = event.submitter;
    if (!button || button.disabled) return; button.disabled = true;
    try {
      const action = button.value;
      let payload;
      if (action === "plan_write") {
        field(write, "plan_id").value = ""; field(write, "plan_hash").value = ""; field(write, "approve").checked = false;
        payload = {source_id: field(work, "source_id").value, changes: JSON.parse(field(write, "changes").value)};
      } else {
        payload = {plan_id: field(write, "plan_id").value};
        if (action === "commit_write") {
          if (!field(write, "approve").checked) throw new Error("Review and explicitly approve the exact displayed plan.");
          payload.plan_hash = field(write, "plan_hash").value;
        }
      }
      const result = await request(action, payload);
      if (action === "plan_write" && result.status === "completed") {
        field(write, "plan_id").value = result.data.plan_id; field(write, "plan_hash").value = result.data.plan_hash;
      }
      field(write, "approve").checked = false;
    } catch (error) { failed(error); } finally { button.disabled = false; }
  });
  area.querySelector("[data-connector-progress]").addEventListener("submit", async event => {
    event.preventDefault();
    try { await request(event.submitter.value, {operation_id: field(event.currentTarget, "operation_id").value}); } catch (error) { failed(error); }
  });
}
