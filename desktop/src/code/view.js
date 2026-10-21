import { createCodeClient } from "./client.ts";

export function createCodeView(invoke, navigate = () => {}) {
  const client = createCodeClient(invoke);

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
<h3>Code–Meetings connection</h3>
<p>A proposal is not adopted law. Recording adoption does not codify it or determine its effective date. These actions do not publish externally. Keep the same stable key when retrying; use a new key and explain corrections.</p>
<form data-code-action="connections"><button type="submit">List Code connections</button></form>
<form data-code-action="connection"><label>Connection stable key <input name="id" required></label><button type="submit">Read connection</button></form>
<form data-code-action="sendProposal">
  <label>Stable key <input name="id" required></label>
  <label>Source version ID <input name="version_id" required></label>
  <label>Meeting ID <input name="meeting_id" required></label>
  <label>Title <input name="title" required></label>
  <label>Ordinance number <input name="ordinance_number" required></label>
  <label>Proposed text <textarea name="proposed_text" required></textarea></label>
  <label>Supersedes connection ID (optional) <input name="supersedes_id"></label>
  <label>Reconciliation note <textarea name="reconciliation_note"></textarea></label>
  <button type="submit">Send proposal to Meetings</button>
</form>
<form data-code-action="closeConnection">
  <label>Connection stable key <input name="id" required></label>
  <label>Recorded decision ID <input name="decision_id" required></label>
  <label>New version ID <input name="version_id" required></label>
  <label>Codification source ID <input name="source_id" required></label>
  <label>Version label <input name="version_label" required></label>
  <label>Codified body <textarea name="body" required></textarea></label>
  <label>Effective start <input type="date" name="effective_start" required></label>
  <label>Effective end (optional) <input type="date" name="effective_end"></label>
  <label>Mark this version current <input type="checkbox" name="is_current"></label>
  <label>Reconciliation note <textarea name="reconciliation_note"></textarea></label>
  <button type="submit">Record codification closeout</button>
</form>
<div data-code-links></div>
<pre data-code-output role="status" aria-live="polite"></pre>
</section>`;
  }

  function bind(root = document) {
    const output = root.querySelector("[data-code-output]");
    if (!output) return;

    for (const form of root.querySelectorAll("form[data-code-action]")) {
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const button = form.querySelector('button[type="submit"]') || form.querySelector("button");
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
              if (!payload.supersedes_id) payload.supersedes_id = null;
              if (!payload.reconciliation_note) payload.reconciliation_note = null;
              result = await client.sendProposal(payload);
              break;
            }
            case 'closeConnection':
              result = await client.closeConnection(data.get('id'), {
                decision_id: data.get('decision_id'), version_id: data.get('version_id'),
                source_id: data.get('source_id'), version_label: data.get('version_label'),
                body: data.get('body'), effective_start: data.get('effective_start'),
                effective_end: data.get('effective_end') || null, is_current: data.has('is_current'),
                reconciliation_note: data.get('reconciliation_note') || null,
              });
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
          output.textContent = format(action, result);
          const links = root.querySelector('[data-code-links]');
          links?.replaceChildren();
          if (links && result && result.id && result.proposal) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.textContent = 'Open this connection in Meetings';
            btn.addEventListener('click', () => navigate('meetings', result.id));
            links.appendChild(btn);
          }
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
    return L.join("\n") + "\n\n" + JSON.stringify(r, null, 2);
  }

  return {render, bind};
}
