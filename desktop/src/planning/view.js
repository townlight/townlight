import { createPlanningClient } from './client.ts';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let fieldId = 0;
const textField = (name, label, value = '', max = 10000) => {
  const id = `planning-field-${++fieldId}`;
  return `<div class="planning-field"><label for="${id}">${label}</label><textarea id="${id}" name="${name}" maxlength="${max}">${esc(value)}</textarea></div>`;
};
const fields = ['project_name','proposal','analysis_text','staff_notes','public_summary','audience','review_notes'];
const badge = state => `<span class="planning-badge ${state === 'reviewed' ? 'is-reviewed' : 'is-draft'}">${state === 'reviewed' ? 'Reviewed' : 'Draft'}</span>`;

export function createPlanningView(invoke, publicMode = false) {
  const transport = createPlanningClient(invoke, publicMode);
  let session = 0;
  async function current(action) {
    const expected = session, result = await action();
    if (expected !== session) throw new Error('Planning session changed');
    return result;
  }
  // A response requested under an earlier account must never repopulate a reset workspace.
  const client = {request:(...args) => current(() => transport.request(...args)),pickBundle:() => current(() => transport.pickBundle())};
  let root, status, selected = [], links = [], draftConsiderations = [], active = null, pendingBundle = null, importPreview = null, snapshotPreview = null;
  let sourceOffset = 0, analysisOffset = 0, snapshotOffset = 0;
  let draft = {}, dirty = false, editing = false, busy = false, connected = [];
  let screen = publicMode ? 'library' : 'analyses', part = 'analysis', analysisItems = [], listQuery = '', analysisNext = null;
  const locked = () => active?.payload.review_state === 'reviewed' && !editing;
  globalThis.window?.addEventListener('beforeunload', event => { if (dirty || busy) { event.preventDefault(); event.returnValue = ''; } });
  const report = message => { if (status?.isConnected) status.textContent = message; };
  const button = (label, handler, primary = false) => {
    const node = document.createElement('button'); node.type = 'button'; node.textContent = label;
    if (primary) node.className = 'planning-primary';
    node.addEventListener('click', () => run(node, handler)); return node;
  };
  async function run(control, handler) {
    if (busy) return;
    const expected = session;
    busy = true;
    root.querySelectorAll('[data-planning-panel]').forEach(panel => panel.setAttribute('inert',''));
    control.disabled = true; report('Working…');
    try { await handler(); }
    catch (error) {
      if (expected !== session) return;
      const code = error?.status ?? error?.status_code;
      report(code === 409 || error?.code === 'conflict' ? 'Saved work changed. Reopen the saved analysis, reconcile your edits, and save again.' :
        'Planning could not complete this action. Your edits are retained. Check your account and System Health before retrying.');
    } finally {
      if (expected === session) { busy = false; root.querySelectorAll('[data-planning-panel], [data-planning-analysis]').forEach(panel => panel.removeAttribute('inert')); if (control.isConnected) control.disabled = false; updateState(); }
    }
  }
  function show(target, value) {
    const output = root.querySelector(target); output.replaceChildren();
    const pre = document.createElement('pre'); pre.textContent = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
    if (typeof value === 'string') output.append(pre);
    else {
      const title = document.createElement('p'); title.textContent = value.title || value.message || 'Source information';
      const details = document.createElement('details'); details.innerHTML = '<summary>Provenance and technical details</summary>'; details.append(pre); output.append(title, details);
    }
  }
  function pageRows(target, items, makeRow, nextOffset, load) {
    const output = root.querySelector(target); output.replaceChildren();
    if (!items.length) output.textContent = 'No saved items on this page.';
    for (const item of items) output.append(makeRow(item));
    if (nextOffset != null) output.append(button('Next page', () => load(nextOffset)));
    output.append(button('Refresh from first page', () => load(0)));
  }
  async function sources(offset = 0) {
    sourceOffset = offset;
    const result = await client.request('sources', {offset});
    pageRows('[data-planning-sources]', result.items, item => {
      const row = document.createElement('article'); row.className = 'planning-card';
      const label = document.createElement('p'); label.textContent = `${item.title} · ${item.status} · ${item.visibility} · ${item.effective_on || 'effective date pending'}`;
      row.append(label, button('Inspect source and history', async () => {
        const revision = await client.request('revision', {id: item.revision_id});
        show('[data-planning-source-detail]', revision);
        for (const doc of revision.documents) root.querySelector('[data-planning-source-detail]').append(button(`Save original ${doc.filename}`, async () => {
          const saved = await client.request('original', {id: item.revision_id, document_id: doc.document_id}); report(`Original saved: ${saved.path} · SHA256 ${saved.sha256}`);
        }));
        await history('source-history', {plan_id: item.plan_id});
        report('Source metadata, exact excerpts and immutable history loaded.');
      })); return row;
    }, result.next_offset, sources);
  }
  async function analyses(offset = 0) {
    analysisOffset = offset;
    const result = await client.request('analyses', {offset});
    analysisItems = result.items; analysisNext = result.next_offset; drawAnalyses();
  }
  function drawAnalyses() {
    const output = root.querySelector('[data-planning-analyses]');
    const items = analysisItems.filter(item => item.project_name.toLocaleLowerCase().includes(listQuery.toLocaleLowerCase()));
    output.innerHTML = '<table class="planning-table"><caption class="sr-only">Saved analyses on this page</caption><thead><tr><th scope="col">Project</th><th scope="col">Saved state</th><th scope="col">Action</th></tr></thead><tbody></tbody></table>';
    for (const item of items) {
      const row = document.createElement('tr'); row.innerHTML = `<th scope="row">${esc(item.project_name)}</th><td>${badge(item.review_state)}</td><td></td>`;
      row.lastChild.append(button(item.review_state === 'reviewed' ? 'Open analysis' : 'Continue analysis', async () => {
        if (!confirmDiscard()) return;
        const saved = await client.request('analysis', {id: item.analysis_id});
        if (!saved) throw new Error('Analysis unavailable');
        open(saved); report('Saved analysis opened. Saving creates a new immutable revision.');
      })); output.querySelector('tbody').append(row);
    }
    if (!items.length) { const p = document.createElement('p'); p.textContent = listQuery ? 'No projects match on this page.' : 'No saved analyses on this page. Start a new analysis to begin.'; output.append(p); }
    if (analysisNext != null) output.append(button('Next page', () => analyses(analysisNext)));
    output.append(button('Refresh', () => analyses(0)));
  }
  function confirmDiscard() { return !dirty || window.confirm('Discard unsaved changes to this analysis? Saved revisions will be kept.'); }
  function collect() {
    const form = root.querySelector('[data-planning-analysis]'); if (!form) return;
    // Disabled reviewed controls must be captured too; FormData excludes them.
    draft = Object.fromEntries(fields.map(k => [k, form.elements.namedItem(k).value])); collectConsiderations();
  }
  function invalidate() { snapshotPreview = null; root.querySelector('[data-planning-preview-output]')?.replaceChildren(); }
  function changed() { collect(); dirty = true; root.querySelector('input[name="reviewed"]').checked = false; invalidate(); updateState(); }
  function updateState() {
    if (!root?.isConnected || publicMode) return;
    const state = root.querySelector('[data-planning-save-state]'); if (state) state.textContent = dirty ? 'Unsaved changes' : active ? 'Saved revision' : 'Not yet saved';
    const title = root.querySelector('[data-planning-title]'); if (title) title.textContent = draft.project_name || 'New analysis';
    const save = root.querySelector('[data-planning-save]'); if (save) save.disabled = busy || locked();
    const review = root.querySelector('[data-planning-review]'); if (review) review.disabled = busy || dirty || !active || locked();
    const preview = root.querySelector('[data-planning-preview] button'); if (preview) preview.disabled = busy || dirty || !active || active.payload.review_state !== 'reviewed';
    const nav = root.querySelector('[data-planning-nav="workspace"]'); if (nav) nav.hidden = !(active || dirty || screen === 'workspace');
  }
  function open(saved = null) {
    active = saved; selected = [...(saved?.payload.policy_context || [])]; links = [...(saved?.payload.linked_sources || [])]; connected = saved?.connected_sources || [];
    dirty = false; editing = !saved || saved.payload.review_state !== 'reviewed'; invalidate(); part = 'analysis';
    editor(saved?.payload || {}); navigate('workspace'); root.querySelector('[data-planning-title]').focus();
  }
  function navigate(next) {
    collect(); screen = next;
    root.querySelectorAll('[data-planning-panel]').forEach(el => { el.hidden = el.dataset.planningPanel !== next; });
    root.querySelectorAll('[data-planning-nav]').forEach(el => { if (el.dataset.planningNav === next) el.setAttribute('aria-current','page'); else el.removeAttribute('aria-current'); }); updateState();
  }
  function setPart(next) {
    collect(); part = next;
    root.querySelectorAll('[data-planning-part]').forEach(el => { el.hidden = el.dataset.planningPart !== next; });
    root.querySelectorAll('[data-planning-tab]').forEach(el => { if (el.dataset.planningTab === next) el.setAttribute('aria-current','page'); else el.removeAttribute('aria-current'); });
    root.querySelector('[data-planning-connections]').hidden = next !== 'context';
    root.querySelector('[data-planning-connection-results]').hidden = next !== 'context';
  }
  async function history(operation, values, offset = 0) {
    const page = await client.request(operation, {...values, offset});
    const target = operation === 'source-history' ? '[data-planning-source-history]' : '[data-planning-history]';
    const output = root.querySelector(target); output.replaceChildren();
    for (const item of page.items) {
      const row = document.createElement('article'); row.className = 'planning-card';
      const p = document.createElement('p'); p.textContent = [item.title,item.created_at,item.actor_id,item.status].filter(Boolean).join(' · ') || 'Immutable revision';
      const details = document.createElement('details'); details.innerHTML = '<summary>Revision provenance</summary>'; const pre = document.createElement('pre'); pre.textContent = JSON.stringify(item,null,2); details.append(pre); row.append(p,details); output.append(row);
    }
    if (!page.items.length) output.textContent = 'No history on this page.';
    if (page.next_offset != null) output.append(button('Next history page', () => history(operation, values, page.next_offset)));
  }
  async function snapshots(offset = 0) {
    snapshotOffset = offset;
    const result = await client.request('snapshots', {offset});
    pageRows('[data-planning-snapshots]', result.items, item => {
      const row = document.createElement('article'); row.className = 'planning-card';
      const label = document.createElement('p'); label.textContent = `${item.title} · ${item.visibility} · ${item.citation}`;
      row.append(label, button('Read reviewed snapshot', async () => {
        const saved = await client.request('snapshot', {id: item.version});
        if (!saved) throw new Error('Snapshot unavailable');
        documentPreview('[data-planning-snapshot-detail]', saved.text); report('Reviewed snapshot rechecked and loaded.');
      }), button('Export exact snapshot', async () => {
        const result = await client.request('export-snapshot', {id: item.version, expected_sha256: item.sha256});
        report(`Exact snapshot saved: ${result.path} · SHA256 ${result.sha256}`);
      }));
      if (!publicMode) row.append(button('Request Access advice', async () => { show('[data-planning-snapshot-detail]', await client.request('access-advice', {id: item.version})); report('Advice requires review; the original snapshot is retained.'); }));
      return row;
    }, result.next_offset, snapshots);
  }
  function selectionControls() {
    const target = root.querySelector('[data-planning-selected]'); if (!target) return;
    target.replaceChildren();
    for (const policy of selected) {
      const row = document.createElement('article'); row.className = 'planning-reference';
      row.innerHTML = `<h4>${esc(policy.citation)}</h4><p>${esc(policy.anchor)}</p><blockquote>${esc(policy.excerpt || '')}</blockquote><details><summary>Source provenance</summary><p>Revision ${esc(policy.revision_id)} · SHA256 ${esc(policy.source_sha256)}</p></details>`;
      if (!locked()) row.append(button('Remove selected policy', async () => { collect(); selected = selected.filter(p => p !== policy); dirty = true; invalidate(); selectionControls(); updateState(); report('Policy removed from this draft.'); })); target.append(row);
    }
    const considerations = root.querySelector('[data-planning-considerations]');
    const old = draftConsiderations;
    considerations.innerHTML = selected.map((p, i) => {
      const found = old.find(c => c.policy.revision_id === p.revision_id && c.policy.policy_id === p.policy_id);
      return `<fieldset data-consideration="${i}" ${locked() ? 'disabled' : ''}><legend>${esc(p.citation)}: proposal-specific consideration</legend><label class="planning-field">Relationship <select name="stance"><option value="uncertain">Uncertain</option><option value="supporting" ${found?.stance === 'supporting' ? 'selected' : ''}>Supporting</option><option value="conflicting" ${found?.stance === 'conflicting' ? 'selected' : ''}>Conflicting</option></select></label>${textField('note','Staff consideration (optional)',found?.note || '',5000)}</fieldset>`;
    }).join('');
    root.querySelector('[data-planning-links]').innerHTML = links.length ? links.map(l => {
      const source = connected.find(c => (c.source?.source_id || c.source_id) === l.source_id)?.source;
      return `<article class="planning-reference"><h4>${esc(source?.title || `${l.provider === 'meetings' ? 'Meetings' : 'Zoning'} evidence`)}</h4><p>${esc(l.relation)}${source?.citation ? ` · ${esc(source.citation)}` : ''}</p><details><summary>Evidence provenance</summary><p>${esc(l.source_id)} · SHA256 ${esc(l.expected_sha256)}</p></details></article>`;
    }).join('') : 'No connected evidence selected.';
  }
  const refs = () => selected.map(p => ({plan_id:p.plan_id, revision_id:p.revision_id, policy_id:p.policy_id}));
  function collectConsiderations() {
    const values = [...root.querySelectorAll('[data-consideration]')].map(row => ({policy:refs()[Number(row.dataset.consideration)], stance:row.querySelector('select').value, note:row.querySelector('textarea').value}));
    draftConsiderations = values;
    return values;
  }
  function editor(data = {}) {
    draft = {...data};
    draftConsiderations = data.considerations || [];
    const target = root.querySelector('[data-planning-editor]');
    target.innerHTML = `<div class="planning-heading"><div><button type="button" class="planning-text-button" data-planning-back>← Analyses</button><h2 data-planning-title tabindex="-1">${esc(data.project_name || 'New analysis')}</h2><div class="planning-actions">${badge(active?.payload.review_state)}<span data-planning-save-state></span></div></div>${locked() ? '<button type="button" data-planning-edit>Edit analysis</button>' : '<button type="submit" form="planning-analysis-form" class="planning-primary" data-planning-save>Save draft</button>'}</div>
      ${locked() ? `<div class="planning-receipt"><strong>Reviewed saved revision</strong><p>${esc(active.payload.reviewer_label || 'Review recorded by server')}${active.payload.reviewed_on ? ` · ${esc(active.payload.reviewed_on)}` : ''}</p><p>Editing creates a draft that needs a new review. Earlier revisions are retained.</p></div>` : ''}
      <nav class="planning-tabs" aria-label="Analysis sections"><button type="button" data-planning-tab="analysis">Analysis</button><button type="button" data-planning-tab="context">Policies &amp; evidence</button><button type="button" data-planning-tab="review">Review &amp; export</button></nav>
      <form id="planning-analysis-form" data-planning-analysis novalidate><div class="planning-work" data-planning-part="analysis"><div class="planning-writing"><fieldset class="planning-fields" ${locked() ? 'disabled' : ''}><label class="planning-field">Project name <input name="project_name" required maxlength="500" value="${esc(data.project_name || '')}"></label>
      ${textField('proposal','Proposal',data.proposal)}${textField('analysis_text','Staff analysis',data.analysis_text,50000)}
      <div class="planning-private">${textField('staff_notes','Private staff notes',data.staff_notes)}<p class="planning-help">Excluded from public snapshots. Staff-only snapshots include these notes.</p></div></fieldset></div>
      <aside class="planning-context" aria-label="Cited context"><div class="planning-heading"><h3>Selected policies</h3><button type="button" data-planning-add-policy>Add policy</button></div><div data-planning-selected></div><div class="planning-heading"><h3>Connected evidence</h3><button type="button" data-planning-evidence>Find evidence</button></div><div data-planning-links></div><p class="planning-help">Cited context supports staff judgment. It is not a zoning, legal, land-use or entitlement determination.</p></aside></div>
      <section data-planning-part="context"><h3>Policies &amp; evidence</h3><p>Review proposal-specific relationships below. Selected context stays alongside your writing.</p><button type="button" data-planning-library>Search policy library</button><div data-planning-considerations></div></section>
      <section data-planning-part="review"><h3>Review &amp; export</h3><p>Save the draft, inspect its sources and intended audience, then explicitly record review.</p><fieldset class="planning-fields" ${locked() ? 'disabled' : ''}>
      <label class="planning-field">Intended analysis audience <select name="audience"><option value="staff">Staff</option><option value="public" ${data.audience === 'public' ? 'selected' : ''}>Public</option></select></label><p class="planning-help">This does not publish the analysis or select the snapshot audience.</p>
      ${textField('public_summary','Separately edited public summary',data.public_summary)}<p class="planning-help">Public snapshots use this summary instead of the full staff analysis.</p>
      ${textField('review_notes','Review evidence and applicability notes',data.review_notes,5000)}
      </fieldset><label class="planning-check"><input name="reviewed" type="checkbox" ${locked() ? 'disabled' : ''}>I reviewed the cited sources, analysis and intended audience. Record my current account as reviewer.</label><button type="button" data-planning-review>Record review of saved draft</button><p class="planning-help">Save any changes before recording review. The server supplies your account and review date.</p></section></form>
      <section data-planning-part="review"><form class="planning-preview-form" data-planning-preview><label class="planning-field">Snapshot audience <select name="visibility"><option value="staff_only">Staff only</option><option value="public">Public summary and permitted citations</option></select></label><button class="planning-primary">Preview saved reviewed revision</button></form><p class="planning-help">A preview creates nothing. Creating a snapshot does not publish it or release a Records response. Export is separate in Reviewed snapshots.</p><div data-planning-preview-output></div></section>
      <details><summary>Saved revision and analysis history</summary><p>${active ? `Revision ${esc(active.revision_id)} · SHA256 ${esc(active.sha256)}` : 'Not yet saved'}</p><button type="button" data-planning-load-history ${active ? '' : 'disabled'}>Load analysis history</button><div data-planning-history></div></details>`;
    selectionControls();
    if (busy) target.querySelector('[data-planning-analysis]').setAttribute('inert','');
    target.querySelectorAll('[data-planning-tab]').forEach(el => el.addEventListener('click', () => setPart(el.dataset.planningTab)));
    target.querySelector('[data-planning-back]').addEventListener('click', () => navigate('analyses'));
    target.querySelector('[data-planning-edit]')?.addEventListener('click', () => { collect(); editing = true; editor({...draft,considerations:draftConsiderations}); report('Editing a new draft. Earlier reviewed revisions are retained.'); });
    for (const selector of ['[data-planning-add-policy]','[data-planning-library]']) target.querySelector(selector).addEventListener('click', event => run(event.currentTarget, async () => { navigate('library'); await sources(sourceOffset); }));
    target.querySelector('[data-planning-evidence]').addEventListener('click', () => { setPart('context'); root.querySelector('[data-planning-connections] input').focus(); });
    target.querySelector('[data-planning-load-history]').addEventListener('click', event => run(event.currentTarget, () => history('analysis-history', {id:active.analysis_id})));
    const form = target.querySelector('[data-planning-analysis]');
    for (const type of ['input','change']) form.addEventListener(type, event => { if (event.target.name !== 'reviewed') changed(); });
    async function save(reviewed) {
      collect();
      if (!draft.project_name.trim()) { setPart('analysis'); form.elements.project_name.reportValidity(); report('Enter a project name before saving.'); return; }
      const payload = {...draft,selected_policies:refs(),considerations:draftConsiderations.filter(c => c.note.trim()),linked_sources:links,
        review_state:reviewed ? 'reviewed' : 'draft',expected_previous_revision:active?.revision_id || null};
      const receipt = await client.request(active ? 'revise-analysis' : 'create-analysis', active ? {id:active.analysis_id,payload} : {payload});
      const saved = await client.request('analysis', {id:receipt.analysis_id}); if (!saved) throw new Error('Saved analysis unavailable');
      const priorPart = part; open(saved); setPart(priorPart); await analyses(analysisOffset); report(`Saved ${reviewed ? 'reviewed' : 'draft'} revision.`);
    }
    target.querySelector('[data-planning-analysis]').addEventListener('submit', event => {
      event.preventDefault(); if (!locked()) run(target.querySelector('[data-planning-save]'), () => save(false));
    });
    target.querySelector('[data-planning-review]').addEventListener('click', event => run(event.currentTarget, async () => {
      if (dirty || !active || !form.elements.reviewed.checked) { report('Save the draft, then confirm that you reviewed the cited sources, analysis and intended audience.'); return; }
      await save(true);
    }));
    target.querySelector('[data-planning-preview]').addEventListener('change', () => { invalidate(); updateState(); });
    target.querySelector('[data-planning-preview]').addEventListener('submit', event => {
      event.preventDefault(); const form = event.currentTarget;
      run(form.querySelector('button'), async () => {
        if (!active || dirty || active.payload.review_state !== 'reviewed') { report('Save and explicitly review this revision before previewing a snapshot.'); return; }
        const payload = {expected_revision:active.revision_id,visibility:String(new FormData(form).get('visibility'))};
        snapshotPreview = await client.request('preview-snapshot', {id:active.analysis_id,payload});
        documentPreview('[data-planning-preview-output]', snapshotPreview.text);
        const banner = document.createElement('p'); banner.className = 'planning-preview-bar'; banner.textContent = `${payload.visibility === 'public' ? 'PUBLIC' : 'STAFF ONLY'} · Preview only · Nothing created or exported`;
        root.querySelector('[data-planning-preview-output]').prepend(banner);
        const preview = snapshotPreview;
        root.querySelector('[data-planning-preview-output]').append(button('Create reviewed snapshot', async () => {
          if (dirty || snapshotPreview !== preview || active.revision_id !== payload.expected_revision) { report('Preview this saved reviewed revision again before creating a snapshot.'); return; }
          const created = await client.request('create-snapshot', {id:active.analysis_id,payload});
          if (created.sha256 !== preview.sha256) throw new Error('Preview changed');
          invalidate(); await snapshots(snapshotOffset); report(`Created ${created.visibility} snapshot ${created.version} · SHA256 ${created.sha256}. No Records response was released. Open Reviewed snapshots for exact export.`);
        }, true)); report(`Preview only · ${preview.visibility} · SHA256 ${preview.sha256}.`);
      });
    });
    setPart(part); updateState();
  }
  function documentPreview(target, text) {
    let data; try { data = JSON.parse(text); } catch { show(target,text); return; }
    if (!data || typeof data !== 'object' || Array.isArray(data)) { show(target,text); return; }
    const output = root.querySelector(target); output.innerHTML = '<article class="planning-paper"></article>';
    const paper = output.firstChild;
    const title = document.createElement('h3'); title.textContent = data.title || 'Reviewed snapshot'; paper.append(title);
    const meta = document.createElement('p'); meta.textContent = [data.review_state,data.reviewer_label,data.reviewed_on].filter(Boolean).join(' · '); paper.append(meta);
    const metadata = new Set(['title','review_state','reviewer_label','reviewed_on','analysis_id','analysis_revision_id']);
    for (const [key,value] of Object.entries(data)) {
      if (metadata.has(key)) continue;
      const section = document.createElement('section'), heading = document.createElement('h4'); heading.textContent = key.replaceAll('_',' ');
      const body = document.createElement('div'); body.className = 'planning-document-value';
      if (Array.isArray(value)) {
        for (const item of value) {
          const row = document.createElement('div');
          if (item && typeof item === 'object') { const source = item.source || item; row.textContent = [source.title,source.citation,source.anchor,source.excerpt,item.link?.relation || item.relation,item.note].filter(Boolean).join(' · ') || 'Cited source'; const details = document.createElement('details'); details.innerHTML = '<summary>Source details</summary>'; const pre = document.createElement('pre'); pre.textContent = JSON.stringify(item,null,2); details.append(pre); row.append(details); }
          else row.textContent = String(item ?? ''); body.append(row);
        }
        if (!value.length) body.textContent = 'None';
      } else body.textContent = typeof value === 'object' ? JSON.stringify(value,null,2) : String(value ?? '');
      section.append(heading,body); paper.append(section);
    }
    const details = document.createElement('details'); details.innerHTML = '<summary>Exact snapshot text</summary>'; const pre = document.createElement('pre'); pre.textContent = text; details.append(pre); paper.append(details);
  }
  return {
    canLeave() {
      if (busy) { report('Wait for the current Planning action to finish.'); return false; }
      return !dirty || window.confirm('Leave Planning with unsaved changes? Return to Planning to continue this draft. Signing out discards unsaved changes.');
    },
    reset() {
      session += 1; busy = false; analysisItems = []; analysisNext = null; listQuery = ''; sourceOffset = 0; analysisOffset = 0; snapshotOffset = 0; pendingBundle = null; importPreview = null;
      active = null; draft = {}; selected = []; links = []; connected = []; draftConsiderations = []; dirty = false; editing = false; snapshotPreview = null;
      screen = publicMode ? 'library' : 'analyses'; part = 'analysis';
    },
    render() {
      return `<section class="planning" data-planning-workspace><p class="planning-eyebrow">Townlight Planning${publicMode ? '' : ' · Staff beta'}</p>
        <nav class="planning-tabs" aria-label="Planning">${publicMode ? '' : '<button type="button" data-planning-nav="analyses">Analyses</button>'}<button type="button" data-planning-nav="library">Policy library</button><button type="button" data-planning-nav="snapshots">Reviewed snapshots</button>${publicMode ? '' : '<button type="button" data-planning-nav="workspace" hidden>Open analysis</button>'}</nav>
        <p data-planning-status role="status" aria-live="polite">Load saved work or search adopted policy sources.</p>
        ${publicMode ? '' : `<section data-planning-panel="analyses"><div class="planning-heading"><div><h2 tabindex="-1">Analyses</h2><p>Continue staff work or open a saved reviewed analysis.</p></div><button type="button" class="planning-primary" data-planning-new>New analysis</button></div><label class="planning-field planning-list-search">Find a project on this page<input type="search" data-planning-list-query value="${esc(listQuery)}"></label><div data-planning-analyses></div><p class="planning-help">Drafts stay with staff. Public snapshots require a separately edited summary and explicit review.</p></section>`}
        <section data-planning-panel="library" hidden><div class="planning-heading"><div><h2 tabindex="-1">Policy library</h2><p>Find adopted policy sources and inspect their cited context.</p></div>${publicMode ? '' : '<button type="button" data-planning-return>Return to open analysis</button>'}</div><form class="planning-search" data-planning-search><label class="planning-field">Policy search <input name="query" required maxlength="2000"></label><button>Search adopted policies</button></form><div data-planning-results></div>
        ${publicMode ? '' : `<h3>Imported plans</h3><div data-planning-sources></div><div data-planning-source-detail></div><details class="planning-card"><summary>Source administration</summary><p>Preview metadata, exact excerpts, anchors and original hashes before importing.</p><button type="button" data-planning-pick>Choose and preview local source bundle</button><div data-planning-import></div>
          <button type="button" data-planning-open-exports>Open saved originals and snapshots folder</button>
          </details><details><summary>Source history</summary><div data-planning-source-history></div></details>`}</section>
        ${publicMode ? '' : `<section data-planning-panel="workspace" hidden><div data-planning-editor></div><form class="planning-search planning-card" data-planning-connections><h3>Find permitted evidence</h3><label class="planning-field">Evidence provider <select name="provider"><option value="meetings">Meetings</option><option value="zoning">Zoning</option></select></label><label class="planning-field">Evidence search <input name="query" required maxlength="500"></label><label class="planning-field">Relationship <select name="relation"><option value="context">Context</option><option value="hearing">Hearing</option><option value="adoption-evidence">Adoption evidence</option><option value="precedent">Precedent</option></select></label><button>Find permitted evidence</button></form><div data-planning-connection-results></div></section>`}
        <section data-planning-panel="snapshots" hidden><h2 tabindex="-1">Reviewed snapshots</h2><p>Read saved versions or export their exact bytes. Exporting does not release a Records response.</p><div data-planning-snapshots></div><div data-planning-snapshot-detail></div></section><p class="planning-help">Cited policy context for human review. This is not a zoning, legal, land-use or entitlement determination.</p></section>`;
    },
    bind() {
      root = document.querySelector('[data-planning-workspace]'); if (!root) return;
      status = root.querySelector('[data-planning-status]');
      root.querySelectorAll('[data-planning-nav]').forEach(el => el.addEventListener('click', () => run(el, async () => {
        navigate(el.dataset.planningNav);
        if (screen === 'analyses') await analyses(analysisOffset);
        if (screen === 'library' && !publicMode) { await sources(sourceOffset); report('Policy library loaded.'); }
        if (screen === 'snapshots') await snapshots(snapshotOffset);
        root.querySelector(`[data-planning-panel="${screen}"] h2`)?.focus();
      })));
      root.querySelector('[data-planning-search]').addEventListener('submit', event => {
        event.preventDefault(); const form = event.currentTarget;
        run(form.querySelector('button'), async () => {
          const result = await client.request('search-policies', {payload:{query:String(new FormData(form).get('query'))}});
          const output = root.querySelector('[data-planning-results]'); output.replaceChildren();
          for (const policy of result.sources) {
            const article = document.createElement('article'); article.className = 'planning-card';
            const text = document.createElement('p'); text.textContent = `${policy.citation} · ${policy.anchor} · adopted ${policy.adopted_on} · effective ${policy.effective_on}\n${policy.excerpt}`;
            article.append(text, button('Save original source', async () => { const result = await client.request('original', {id:policy.revision_id,document_id:policy.document_id}); report(`Original saved: ${result.path} · SHA256 ${result.sha256}`); }));
            const provenance = document.createElement('details'); provenance.innerHTML = '<summary>Source provenance</summary>'; const metadata = document.createElement('pre'); metadata.textContent = JSON.stringify(policy,null,2); provenance.append(metadata); article.append(provenance);
            if (!publicMode) article.append(button('Select policy for analysis', async () => {
              if (locked()) { report('Choose Edit analysis before changing a reviewed revision.'); return; }
              collect(); if (!selected.some(p => p.revision_id === policy.revision_id && p.policy_id === policy.policy_id)) { selected.push(policy); dirty = true; }
              invalidate(); editor({...draft,considerations:draftConsiderations}); navigate('workspace'); report('Versioned policy selected for the current draft.');
            })); output.append(article);
          }
          report(result.status === 'no_supported_policy' ? 'No adopted source supports this search. Refine the search or import verified sources.' : result.status === 'needs_review' ? 'Multiple source excerpts may overlap or conflict. Staff must reconcile applicability.' : 'Cited policy context loaded; staff review is required.');
        });
      });
      if (publicMode) { navigate(screen); run(status, async () => { await snapshots(); report('Saved work loaded.'); }); return; }
      root.querySelector('[data-planning-open-exports]').addEventListener('click', event => run(event.currentTarget, async () => {
        const result = await invoke('open_domain_exports', {request:{folder:'planning'}}); report(result.message);
      }));
      editor({...draft,considerations:draftConsiderations}); navigate(screen);
      root.querySelector('[data-planning-list-query]').addEventListener('input', event => { listQuery = event.target.value; drawAnalyses(); });
      root.querySelector('[data-planning-return]').addEventListener('click', () => navigate('workspace'));
      root.querySelector('[data-planning-new]').addEventListener('click', () => { if (!busy && confirmDiscard()) { open(); report('New unsaved staff draft.'); } });
      root.querySelector('[data-planning-pick]').addEventListener('click', event => run(event.currentTarget, async () => {
        pendingBundle = await client.pickBundle(); if (!pendingBundle) { report('Source selection cancelled.'); return; }
        importPreview = await client.request('preview-import', {payload:{bundle:pendingBundle}}); show('[data-planning-import]', importPreview);
        const container = root.querySelector('[data-planning-import]');
        for (const policy of importPreview.policies || []) { const p = document.createElement('p'); p.textContent = `${policy.citation || policy.policy_id} · ${policy.anchor || ''}\n${policy.excerpt || ''}`; container.append(p); }
        const label = document.createElement('label'); label.className = 'planning-field'; label.textContent = 'Previous revision for an amendment (copy from current source history; leave empty for a new plan)';
        const previous = document.createElement('input'); previous.maxLength = 36; label.append(previous); container.append(label);
        const bundle = pendingBundle;
        container.append(button('Import this verified source bundle', async () => {
          const receipt = await client.request('import-bundle', {payload:{bundle,expected_previous_revision:previous.value.trim() || null}});
          container.replaceChildren(); await sources(sourceOffset); report(`Imported immutable source revision ${receipt.revision_id}.`);
        })); report('Preview metadata, exact excerpts, anchors and original hashes. Import requires explicit confirmation.');
      }));
      root.querySelector('[data-planning-connections]').addEventListener('submit', event => {
        event.preventDefault(); const form = event.currentTarget;
        run(form.querySelector('button'), async () => {
          const fields = new FormData(form), provider = String(fields.get('provider')), relation = String(fields.get('relation'));
          const response = await client.request('search-connections', {payload:{provider,query:String(fields.get('query'))}});
          const output = root.querySelector('[data-planning-connection-results]'); output.replaceChildren();
          for (const item of response.results) output.append(button(`Select ${item.title} · ${item.citation}`, async () => {
            if (locked()) { report('Choose Edit analysis before changing a reviewed revision.'); return; }
            collect(); if (!links.some(l => l.provider === provider && l.source_id === item.source_id)) { links.push({provider,relation,source_id:item.source_id,expected_sha256:item.sha256}); connected.push({source:item}); dirty = true; }
            invalidate(); selectionControls(); updateState(); report('Evidence selected with its expected hash. Saving rechecks permission.');
          }));
          report(response.results.length ? 'Choose evidence explicitly for this draft.' : 'No permitted connected evidence matched.');
        });
      });
      run(status, async () => { await analyses(analysisOffset); if (screen === 'library') await sources(sourceOffset); if (screen === 'snapshots') await snapshots(snapshotOffset); report('Saved work loaded.'); });
    }
  };
}
