import { createCodeClient } from "./client.ts";
import { createMeetingsClient } from "../meetings/client.ts";
import { bindCodeConnectionPickers } from "./connection-pickers.js";

export function createCodeView(invoke, navigate = () => {}) {
  const client = createCodeClient(invoke);
  const meetings = createMeetingsClient(invoke);
  let openConnection = async () => {};

  function render() {
    return `<section class="code-view">
<p><strong>State:</strong> local Code integration candidate. Authoritative source versus non-authoritative explanation. Not legal advice.</p>
<form data-code-action="importBundle" aria-label="Import JSON bundle"><label>JSON bundle <input type="file" name="bundle" accept="application/json,.json" required></label> <button type="submit">Import</button></form>
<form data-code-action="workspace" aria-label="Workspace"><button type="submit">Workspace</button></form>
<form data-code-action="sources" aria-label="Sources"><button type="submit">Sources</button></form>
<form data-code-action="lookup" aria-label="Lookup section"><label>Section number <input name="section" required></label> <label>Date (optional) <input name="date" type="date"></label> <button type="submit">Lookup</button></form>
<form data-code-action="citation" aria-label="Citation"><label>Section number <input name="section" required></label> <label>Date (optional) <input name="date" type="date"></label> <button type="submit">Citation</button></form>
<form data-code-action="history" aria-label="Section history"><label>Section ID <input name="sectionId" required></label> <button type="submit">History</button></form>
<form data-code-action="search" aria-label="Search"><label>Query <input name="query" required></label> <button type="submit">Search</button></form>
<form data-code-action="exportSection" aria-label="Export section">
  <label>Section <input type="text" name="section" required></label>
  <label>Date <input type="date" name="date"></label>
  <button type="submit">Export section</button>
</form>
<form data-code-action="question" aria-label="Ask question">
  <label>Question <textarea name="question" required></textarea></label>
  <label>Section <input type="text" name="section"></label>
  <label>Date <input type="date" name="date"></label>
  <button type="submit">Ask question</button>
</form>
<form data-code-action="importTree" aria-label="Import tree">
  <label>Job ID <input type="text" name="jobId" required></label>
  <button type="submit">Import tree</button>
</form>
<form data-code-action="importProvenance" aria-label="Import provenance">
  <label>Job ID <input type="text" name="jobId" required></label>
  <button type="submit">Import provenance</button>
</form>
<details data-code-connection-panel><summary>Ordinance proposals and meeting decisions</summary>
<p>Send a proposal to a saved meeting. After the clerk records a decision, staff can record codification separately.</p>
<p data-code-picker-status role="status" aria-live="polite"></p>
<form data-code-action="connections"><button type="submit">List Code connections</button></form>
<form data-code-action="connection"><label>Saved proposal <select name="id" required></select></label><button type="submit">Read proposal and decisions</button></form>
<form data-code-meeting-search><label>Search meetings <input name="query" type="search" maxlength="255"></label><button type="submit">Find meetings</button></form>
<form data-code-action="sendProposal">
  <label>Current code section <select name="version_id" required></select></label>
  <label>Meeting <select name="meeting_id" required></select></label>
  <label>Title <input name="title" required></label>
  <label>Ordinance number <input name="ordinance_number" required></label>
  <label>Proposed text <textarea name="proposed_text" required></textarea></label>
  <label>Replace a saved proposal (optional) <select name="supersedes_id"></select></label>
  <label>Reconciliation note <textarea name="reconciliation_note"></textarea></label>
  <button type="submit">Send proposal to Meetings</button>
</form>
<form data-code-action="closeConnection">
  <label>Proposal to codify <select name="id" required></select></label>
  <label>Recorded adoption <select name="decision_id" required></select></label>
  <label>Codification source <select name="source_id" required></select></label>
  <label>Version label <input name="version_label" required></label>
  <label>Codified body <textarea name="body" required></textarea></label>
  <label>Effective start <input type="date" name="effective_start" required></label>
  <label>Effective end (optional) <input type="date" name="effective_end"></label>
  <label>Mark this version current <input type="checkbox" name="is_current"></label>
  <label>Reconciliation note <textarea name="reconciliation_note"></textarea></label>
  <button type="submit">Record codification closeout</button>
</form>
</details>
<div data-code-links></div>
<div data-code-output role="status" aria-live="polite"></div>
<details><summary>Technical result</summary><pre data-code-detail></pre></details>
</section>`;
  }

  function bind(root = document) {
    const output = root.querySelector("[data-code-output]");
    if (!output) {
      openConnection = async () => {};
      return;
    }
    const detail = root.querySelector("[data-code-detail]");
    const pickerStatus = root.querySelector("[data-code-picker-status]");
    const panel = root.querySelector("[data-code-connection-panel]");
    const pickers = bindCodeConnectionPickers(root, client, meetings, (message) => {
      pickerStatus.textContent = message;
    });
    let loading;
    const load = () => loading ||= pickers?.refresh();
    panel.addEventListener("toggle", () => { if (panel.open) void load(); });
    const show = (action, result) => {
      output.textContent = format(action, result);
      detail.textContent = JSON.stringify(result, null, 2);
      const links = root.querySelector('[data-code-links]');
      links.replaceChildren();
      if (!result?.id || !result.proposal) return;
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = 'Open this proposal in Meetings';
      button.addEventListener('click', () => navigate('meetings', result.id));
      links.appendChild(button);
    };
    openConnection = async id => {
      try {
        panel.open = true;
        await load();
        pickers?.showConnection(id);
        show('connection', await client.connection(id));
        output.setAttribute('tabindex', '-1');
        output.focus();
      } catch (error) {
        output.textContent = error?.message || String(error);
      }
    };

    for (const form of root.querySelectorAll("form[data-code-action]")) {
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const button = form.querySelector('button[type="submit"]') || form.querySelector("button");
        if (button?.disabled) return;
        if (button) button.disabled = true;
        const data = new FormData(form);
        const action = form.dataset.codeAction;
        try {
          let result;
          switch (action) {
            case 'connections': result = await client.connections(); break;
            case 'connection': result = await client.connection(data.get('id')); break;
            case 'sendProposal': {
              const payload = Object.fromEntries(data);
              payload.id = form.dataset.draftKey ||= crypto.randomUUID();
              if (!payload.supersedes_id) payload.supersedes_id = null;
              if (!payload.reconciliation_note) payload.reconciliation_note = null;
              result = await client.sendProposal(payload);
              delete form.dataset.draftKey;
              form.reset();
              await pickers?.refresh();
              pickers?.showConnection(result.id);
              break;
            }
            case 'closeConnection':
              result = await client.closeConnection(data.get('id'), {
                decision_id: data.get('decision_id'), version_id: form.dataset.draftKey ||= crypto.randomUUID(),
                source_id: data.get('source_id'), version_label: data.get('version_label'),
                body: data.get('body'), effective_start: data.get('effective_start'),
                effective_end: data.get('effective_end') || null, is_current: data.has('is_current'),
                reconciliation_note: data.get('reconciliation_note') || null,
              });
              delete form.dataset.draftKey;
              await pickers?.refresh();
              break;
            case "importBundle": result = await client.importBundle(JSON.parse(await data.get("bundle").text())); break;
            case "workspace": result = await client.workspace(); break;
            case "sources": result = await client.sources(); break;
            case "lookup": result = await client.lookup(data.get("section"), data.get("date") || undefined); break;
            case "citation":
              result = await client.citation(data.get("section"), data.get("date") || undefined);
              break;
            case "exportSection":
              result = await client.exportSection(data.get("section"), data.get("date") || undefined);
              break;
            case "question":
              result = await client.question(data.get("question"), data.get("section") || undefined, data.get("date") || undefined);
              break;
            case "importTree":
              result = await client.importTree(data.get("jobId"));
              break;
            case "importProvenance":
              result = await client.importProvenance(data.get("jobId"));
              break;
            case "history": result = await client.history(data.get("sectionId")); break;
            case "search": result = await client.search(data.get("query")); break;
            default: throw new Error(`Unknown action: ${action}`);
          }
          show(action, result);
        } catch (error) {
          output.textContent = "Result not confirmed. Read saved work before repeating writes. " +
            (error && error.message ? error.message : String(error));
        } finally {
          if (button) button.disabled = false;
        }
      });
    }
  }

  function format(action, r) {
    if (r === undefined || r === null) return "No result returned.";
    if (Array.isArray(r)) return r.length ? r.map(row => row.proposal.title).join(" · ") : "No Code proposals saved.";
    if (r.proposal) {
      const decision = r.decisions?.find(item => item.input?.id === r.current_decision_id)?.input;
      return `${r.proposal.title} · ${r.closeout ? "Codification recorded"
        : decision ? `Decision: ${decision.outcome.replaceAll("_", " ")}. ${decision.decision_text}` : "Awaiting a recorded decision."}`;
    }
    const L = [], put = (k, v) => { if (v != null && v !== "") L.push(`${k}: ${v}`); };
    put("answer", r.answer); put("classification", r.classification); put("job_id", r.job_id);
    put("status", r.status); put("reason", r.reason); put("fix", r.fix);
    if (r.failure) { put("failure.message", r.failure.message); put("failure.fix", r.failure.fix); }
    const recs = [
      r.section,
      r.version,
      r.citation,
      ...(Array.isArray(r.sources) ? r.sources : []),
      ...(Array.isArray(r.sections) ? r.sections : []),
      ...(Array.isArray(r.versions) ? r.versions : []),
      ...(Array.isArray(r.results) ? r.results : []),
    ].filter((v) => v != null);
    const fields = ["name", "section_number", "section_id", "version_label", "effective_start", "effective_end", "status", "body"];
    for (const rec of recs) {
      for (const f of fields) put(f, f === "name" ? (rec.name ?? rec.section_heading) : rec[f]);
      if (rec.current_version != null || rec.workspace_section) {
        put("current_version", typeof rec.current_version === "object" ? JSON.stringify(rec.current_version) : rec.current_version);
      }
      put("citation_text", rec.citation_text); put("source_id", rec.source_id);
    }
    return L.length ? L.join("\n") : "Local Code service returned a result. See technical result for details.";
  }

  return {render, bind, openConnection: id => openConnection(id)};
}
