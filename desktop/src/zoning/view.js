import { createZoningClient } from './client.ts';

function render(publicMode=false) {
  const staff = publicMode ? '' : `
<h3>Staff workspace</h3>
<form data-zone-action="registerRule">
<label>Jurisdiction <input name="jurisdiction" required></label>
<label>Applicable process Code section <input name="process_section" maxlength="255"></label>
<label>Zone code <input name="zone_code" required></label>
<label>Kind <select name="kind" required><option value="use">use</option><option value="dimension">dimension</option></select></label>
<label>Key <input name="key" required></label>
<label>Value <input name="value" required></label>
<label>Section number <input name="section_number" required></label>
<label>Overlay code (optional) <input name="overlay_code"></label>
<button type="submit">Register rule</button></form>
<form data-zone-action="importBundle">
<label>Bundle JSON <input name="bundle" type="file" accept=".json,application/json" required></label>
<button type="submit">Import parcel dataset</button></form>
<form data-zone-action="standards">
<label>Variance, conditional use or nonconformity question <textarea name="question" required maxlength="2000"></textarea></label>
<label>Applicable process Code section <input name="process_section" maxlength="255"></label>
<label>Zone code <input name="zone_code" maxlength="40"></label>
<label>Standard to cite (optional, comma separated) <input name="rule_types" maxlength="200"></label>
<label>Your observed condition for that standard (optional, e.g. front_setback=8 feet) <input name="observed" maxlength="300"></label>
<p>Explains the cited discretionary process and the cited standards it can verify. It raises review flags only, is never a determination, and reports standards the configured dataset cannot supply as unavailable.</p>
<button type="submit">Explain the cited process</button></form>
<form data-zone-action="workspace"><button type="submit">Workspace</button></form>
<form data-zone-action="review">
<label>ID <input name="id" required></label>
<label>Answer <textarea name="answer"></textarea></label>
<label>Notes <textarea name="notes"></textarea></label>
<label>Queue status <select name="queue_status" required><option value="open">open</option><option value="in_review">in_review</option><option value="resolved">resolved</option><option value="closed">closed</option></select></label>
<button type="submit">Review</button></form>
<form data-zone-action="outline">
<label>Title <input name="title" required></label>
<label>Question IDs (comma separated) <input name="question_ids" required></label>
<button type="submit">Outline</button></form>
<form data-zone-action="codeContext">
<label>Section number <input name="section_number" required></label>
<label>As of (optional) <input name="as_of" type="date"></label>
<button type="submit">Code context</button></form>
<form data-zone-action="searchMeetings">
<label>Query <input name="query" required></label>
<button type="submit">Search meetings</button></form>
<form data-zone-action="linkMeeting">
<label>Question ID <input name="id" required></label>
<label>Source ID <input name="source_id" required></label>
<label>Expected SHA-256 <input name="expected_sha256" required></label>
<label>Relation <select name="relation" required><option value="hearing">hearing</option><option value="context">context</option><option value="precedent">precedent</option></select></label>
<button type="submit">Link meeting</button></form>
<form data-zone-action="history">
<label>Question ID <input name="id" required></label>
<button type="submit">History</button></form>
<form data-zone-action="snapshot">
<label>Question ID <input name="id" required></label>
<label>Visibility <select name="visibility"><option value="staff_only" selected>staff_only</option><option value="public">public</option></select></label>
<label>Meeting event IDs (comma separated) <input name="meeting_event_ids"></label>
<button type="submit">Snapshot</button></form>
<p>Informational historical context only; not a legal amendment. Snapshot does not publish or approve records.</p>`;
  return `<section>
<h2>Townlight Zoning</h2>
<p><strong>Informational only; not a zoning determination, permit approval or legal advice.</strong></p>
<p>Structured cited lookup, not AI interpretation.</p>
<pre data-zone-output role="status" aria-live="polite">No parcel selected</pre>
<form data-zone-action="lookup">
<label>Jurisdiction <input name="jurisdiction" required></label>
<label>Query <input name="query" required></label>
<button type="submit">Lookup</button></form>
<form data-zone-action="question">
<label>Jurisdiction <input name="jurisdiction" required></label>
<label>Query <input name="query" required></label>
<label>Question <textarea name="question" required></textarea></label>
<label>Kind <select name="kind" required><option value="use">use</option><option value="dimension">dimension</option></select></label>
<label>Key <input name="key" required></label>
<p>Key must be an exact staff-configured topic such as ADU/front_setback, not freeform AI interpretation.</p>
<button type="submit">Ask question</button></form>${staff}</section>`;
}

export function createZoningView(invoke, publicMode = false) {
  const client = createZoningClient(invoke, publicMode);
  const val = v => (v == null ? '' : String(v));
  function bind(root = document) {
    const output = root.querySelector('pre[data-zone-output]');
    root.querySelectorAll('form[data-zone-action]').forEach(form => {
      form.addEventListener('submit', async e => {
        e.preventDefault();
        const button = form.querySelector('button[type="submit"]') || form.querySelector('button');
        if (button) button.disabled = true;
        if (output) output.textContent = 'Loading…';
        try {
          const fd = new FormData(form);
          const action = form.dataset.zoneAction;
          let result;
          switch (action) {
            case 'lookup': result = await client.lookup({jurisdiction:fd.get('jurisdiction'),query:fd.get('query')}); break;
            case 'question': result = await client.question({jurisdiction:fd.get('jurisdiction'),query:fd.get('query'),question:fd.get('question'),kind:fd.get('kind'),key:fd.get('key')}); break;
            case 'registerRule': result = await client.registerRule({jurisdiction:fd.get('jurisdiction'),zone_code:fd.get('zone_code'),kind:fd.get('kind'),key:fd.get('key'),value:fd.get('value'),section_number:fd.get('section_number'),overlay_code:fd.get('overlay_code') || null}); break;
            case 'importBundle': {
              const bundle = fd.get('bundle');
              if (!(bundle instanceof File)) throw new Error('Bundle file required');
              if (bundle.size > 20 * 1024 * 1024) throw new Error('Bundle exceeds 20 MiB limit');
              let parsed;
              try { parsed = JSON.parse(await bundle.text()); }
              catch { throw new Error('Bundle must be valid JSON'); }
              if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
                throw new Error('Bundle payload must be a JSON object');
              }
              result = await client.importBundle(parsed);
              break;
            }
            case 'standards': {
              const observed = {};
              for (const pair of String(fd.get('observed') || '').split(',')) {
                const [key, ...rest] = pair.split('=');
                if (key?.trim() && rest.length) observed[key.trim()] = rest.join('=').trim();
              }
              result = await client.standards({process_section:fd.get('process_section') || '',question:fd.get('question'),zone_code:fd.get('zone_code') || '',rule_types:String(fd.get('rule_types') || '').split(',').map(s=>s.trim()).filter(Boolean),observed});
              break; }
            case 'workspace': result = await client.workspace(); break;
            case 'review': result = await client.review(fd.get('id'),{answer:fd.get('answer'),notes:fd.get('notes'),queue_status:fd.get('queue_status')}); break;
            case 'outline': result = await client.outline({title:fd.get('title'),question_ids:String(fd.get('question_ids') || '').split(',').map(s=>s.trim()).filter(Boolean)}); break;
            case 'codeContext': result = await client.codeContext({section_number:fd.get('section_number'),as_of:fd.get('as_of') || null}); break;
            case 'searchMeetings': result = await client.searchMeetings(fd.get('query')); break;
            case 'linkMeeting': result = await client.linkMeeting(fd.get('id'),{source_id:fd.get('source_id'),expected_sha256:fd.get('expected_sha256'),relation:fd.get('relation')}); break;
            case 'history': result = await client.history(fd.get('id')); break;
            case 'snapshot': result = await client.snapshot(fd.get('id'),{visibility:fd.get('visibility'),meeting_event_ids:String(fd.get('meeting_event_ids') || '').split(',').map(s=>s.trim()).filter(Boolean)}); break;
            default: throw new Error('Unknown action');
          }
          if (!output) return;
          if (!result || (typeof result === 'object' && Object.keys(result).length === 0)) {
            output.textContent = 'No result.'; return;
          }
          const lines = [];
          lines.push(`Status: ${val(result.status)}`,`Reason: ${val(result.reason)}`,`Answer: ${val(result.answer)}`,`ID: ${val(result.id)}`);
          const p = result.parcel || result;
          lines.push(`Parcel address: ${val(p.address)}`,`Parcel zone: ${val(p.zone?.code)}`,`Parcel source date: ${val(p.source?.source_date)}`,`Parcel version: ${val(p.source?.version)}`,`Parcel hash: ${val(p.source?.content_sha256)}`);
          const citations = Array.isArray(result.citations) ? result.citations : [];
          citations.forEach(c => {
            lines.push(`Citation: section=${val(c.section_number)} version=${val(c.version_id)} source=${val(c.source_id)} effective_from=${val(c.effective_start)} effective_to=${val(c.effective_end)} body=${val(c.body_text)}`);
          });
          const ws = result;
          lines.push(`Workspace questions: ${Array.isArray(ws.questions) ? ws.questions.length : 0}`,`Workspace queue: ${Array.isArray(ws.queue) ? ws.queue.length : 0}`,`Workspace reviews: ${Array.isArray(ws.reviews) ? ws.reviews.length : 0}`,`Workspace analytics: ${val(JSON.stringify(ws.analytics))}`);
          if (result.process || result.status === 'unavailable') {
            lines.push(`Process: ${val(result.process)} (${val(result.label)})`,
              `What happens: ${val(result.what)}`,`Needs: ${val((result.needs||[]).join('; '))}`,
              `Review: ${val((result.review||[]).join(' '))}`);
            for (const standard of result.standards || []) lines.push(`Cited standard: ${val(standard.rule_type)} = ${val(standard.value)} · ${val(standard.citation)}`);
            for (const flag of result.flags || []) lines.push(`Review flag (not a finding): ${val(flag.basis)} · observed ${val(flag.observed)} vs ${val(flag.standard)} · ${val(flag.citation)}`);
            if (result.status === 'unavailable') lines.push(`Unavailable: ${val(result.reason)}`,`Fix: ${val(result.fix)}`);
          }
          lines.push('Audit JSON:',JSON.stringify(result,null,2));
          output.textContent = lines.join('\n');
        } catch (e) {
          if (output) output.textContent = `Result not confirmed. Check saved work before repeating a write.\n${e && e.message ? e.message : 'Unknown error'}`;
        } finally {
          if (button) button.disabled = false;
        }
      });
    });
  }
  return {render:()=>render(publicMode),bind};
}
