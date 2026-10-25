const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const boundary = 'Pre-application support only. Staff retain all official completeness, fee, permit and entitlement decisions.';
const field = (name, label, value = '', max = 10000) => `<label for="permitting-${esc(name)}">${label}</label><textarea id="permitting-${esc(name)}" name="${esc(name)}" maxlength="${max}">${esc(value)}</textarea>`;

export function createPermittingView(invoke) {
  let root, generation = 0, busy = false, dirty = false, tab = 'cases', active = null;
  let requirements = [], cases = [], next = null, draft = null, requirement = null, packet = null, connections = [];
  let statusText = '', picked = null;
  const request = async (operation, values = {}) => {
    const expected = generation;
    const result = await invoke('permitting_domain_request', {request: {operation, ...values}});
    if (expected !== generation) throw new Error('Account changed');
    return result;
  };
  const report = value => { statusText = value; if (root?.isConnected) root.querySelector('[data-permitting-status]').textContent = value; };
  const canLeave = () => !busy && (!dirty || window.confirm('Leave unsaved Permitting edits?'));
  function capture() {
    const form = root?.querySelector('[data-permitting-case]');
    if (!form || !draft) return;
    const data = new FormData(form);
    for (const name of ['project_name','project_description','location','applicant_contact','staff_notes','assigned_to','review_notes','public_summary']) draft[name] = String(data.get(name) || '');
    draft.materials = (requirement?.materials || []).map(material => ({material_id:material.material_id,
      status:String(data.get(`status:${material.material_id}`) || 'not_reviewed'), note:String(data.get(`note:${material.material_id}`) || '')}));
  }
  async function run(action) {
    if (busy) return;
    const expected = generation;
    const actionRoot = root;
    actionRoot?.setAttribute('inert', '');
    actionRoot?.setAttribute('aria-busy', 'true');
    busy = true; root?.querySelectorAll('button').forEach(b => {b.disabled = true;});
    report('Working…');
    try { await action(); }
    catch (error) {
      if (expected !== generation) return;
      const detail = error?.detail || error?.message;
      report(`Action not confirmed. Your edits are retained. ${typeof detail === 'string' ? detail : 'Check System Health, your account and current source permissions; reopen saved work after a conflict.'}`);
    } finally {
      actionRoot?.removeAttribute('inert');
      actionRoot?.removeAttribute('aria-busy');
      if (expected === generation) { busy = false; root?.querySelectorAll('button').forEach(b => {b.disabled = false;}); }
    }
  }
  async function load(offset = 0) {
    const result = await request(tab === 'requirements' ? 'requirements' : 'cases', {offset});
    if (tab === 'requirements') requirements = result.items; else cases = result.items;
    next = result.next_offset; paint(); report(result.items.length ? 'Saved work loaded.' : 'No saved work yet. Import your municipal intake requirements to begin.');
  }
  function reset() {
    generation++; root = null; busy = dirty = false; active = draft = requirement = packet = picked = null;
    requirements = []; cases = []; connections = []; next = null; tab = 'cases'; statusText = '';
  }
  function render() {
    return `<section data-permitting><h2>Permitting</h2><p>${boundary}</p>
      <nav aria-label="Permitting workspace"><button data-permitting-action="cases">Intake cases</button><button data-permitting-action="requirements">Requirement library</button></nav>
      <p data-permitting-status role="status" aria-live="polite">${esc(statusText)}</p><div data-permitting-content></div></section>`;
  }
  function paint() {
    if (!root?.isConnected) return;
    const output = root.querySelector('[data-permitting-content]');
    if (tab === 'requirements') {
      output.innerHTML = `<h3>Municipal requirement library</h3><p>Import a reviewed JSON bundle containing your source original, date, citation and material checklist. Fictional datasets remain labelled.</p>
        <button data-permitting-action="pick">Choose requirement bundle</button><div data-permitting-import></div>
        <ul>${requirements.map((item, index) => `<li>${esc(item.title)} · ${esc(item.jurisdiction)} · ${esc(item.dataset_kind)} <button data-permitting-requirement="${index}">Inspect requirements</button></li>`).join('')}</ul>
        <div data-permitting-source></div>`;
    } else if (draft) {
      const materials = (requirement?.materials || []).map(material => {
        const item = draft.materials.find(m => m.material_id === material.material_id) || {};
        return `<fieldset><legend>${esc(material.description)}</legend><p>${esc(material.citation)}</p><label>Staff material assessment<select name="status:${esc(material.material_id)}">${['not_reviewed','provided','missing','unclear'].map(value => `<option value="${value}" ${value === item.status ? 'selected' : ''}>${value.replaceAll('_',' ')}</option>`).join('')}</select></label>${field(`note:${material.material_id}`, 'Material note', item.note, 2000)}</fieldset>`;
      }).join('');
      output.innerHTML = `<h3>${active ? 'Saved intake case' : 'New intake case'}</h3><p>${esc(draft.review_state)}${active?.payload.reviewer_id ? ` · reviewed by ${esc(active.payload.reviewer_id)} on ${esc(active.payload.reviewed_on)}` : ''}</p>
        ${active?.connection_error ? `<p role="alert">${esc(active.connection_error)} Remove the unavailable selection or select its current version.</p>` : ''}
        <p>Requirements: ${esc(requirement?.title)} · ${esc(requirement?.source_reference)} · effective ${esc(requirement?.effective_on)} · ${esc(requirement?.dataset_kind)}</p>
        <form data-permitting-case>${field('project_name','Project name',draft.project_name,500)}${field('project_description','Project description',draft.project_description)}${field('location','Property address or parcel identifier',draft.location,1000)}${field('applicant_contact','Applicant contact — private',draft.applicant_contact,2000)}
        ${field('assigned_to','Assigned staff',draft.assigned_to,255)}<h4>Intake materials — staff assessment</h4>${materials}
        ${field('staff_notes','Private staff notes',draft.staff_notes)}${field('review_notes','Staff review and follow-up notes',draft.review_notes,4000)}
        ${field('public_summary','Separately edited public summary for Records',draft.public_summary)}<p>Applicant contact, location, full proposal, material notes and private staff notes are excluded from the Records copy. Check the summary yourself before sharing.</p>
        <button type="submit">Save intake draft</button><button type="button" data-permitting-action="review">Record staff review</button></form>
        <h4>Cited Code and Zoning context</h4><form data-permitting-search><label>Source module<select name="provider"><option value="code">Code</option><option value="zoning">Zoning</option></select></label><label>Search sources<input name="query" required maxlength="500"></label><button>Find cited context</button></form>
        <div data-permitting-connections></div><ul>${draft.linked_sources.map((link,index) => `<li>${esc(link.provider)} · ${esc(link.source_id)} <button data-permitting-remove="${index}">Remove source</button></li>`).join('')}</ul>
        ${active ? `<button data-permitting-action="history">Revision history</button><button data-permitting-action="staff-packet">Create staff packet</button><button data-permitting-action="records-packet">Preview Records copy</button>` : ''}<div data-permitting-packet></div><div data-permitting-history></div>`;
    } else {
      output.innerHTML = `<h3>Intake cases</h3><button data-permitting-action="new">New intake case</button>
        <ul>${cases.map((item,index) => `<li>${esc(item.project_name)} · ${esc(item.review_state)} · ${esc(item.assigned_to || 'Unassigned')} <button data-permitting-open="${index}">Open intake case</button></li>`).join('')}</ul>`;
    }
    if (next !== null && !draft) output.insertAdjacentHTML('beforeend', '<button data-permitting-action="next">Next page</button>');
    bindContent();
  }
  function summary(target, value) {
    const output = root.querySelector(target); output.replaceChildren();
    const text = document.createElement('pre'); text.textContent = typeof value === 'string' ? value : JSON.stringify(value, null, 2); output.append(text);
  }
  async function openCase(id) {
    active = await request('case', {id}); draft = structuredClone(active.payload);
    delete draft.boundary; delete draft.reviewer_id; delete draft.reviewed_on;
    draft.expected_revision = active.revision_id; requirement = active.requirement; dirty = false; packet = null; tab = 'cases'; paint();
    report('Saved case reopened. Edits require a new explicit review.');
  }
  async function save(review = false) {
    capture();
    if (review && !window.confirm('Record your staff review of this intake workpaper? This does not determine official completeness or approve a permit.')) return;
    draft.review_state = review ? 'reviewed' : 'draft';
    const result = await request(active ? 'revise-case' : 'create-case', {...(active ? {id:active.entity_id} : {}), payload:draft});
    await openCase(result.entity_id); report(review ? 'Staff review recorded under your signed-in identity.' : 'Intake draft saved.');
  }
  async function newCase() {
    const result = await request('requirements', {offset:0}); requirements = result.items;
    if (!requirements.length) {tab = 'requirements'; paint(); report('Import a reviewed municipal requirement bundle first.'); return;}
    const output = root.querySelector('[data-permitting-content]');
    output.innerHTML = `<h3>Choose intake requirements</h3><ul>${requirements.map((item,index) => `<li>${esc(item.title)} · ${esc(item.dataset_kind)} <button data-permitting-use="${index}">Use these requirements</button></li>`).join('')}</ul>`;
    output.querySelectorAll('[data-permitting-use]').forEach(button => button.onclick = () => run(async () => {
      const revision = await request('requirement', {id:requirements[Number(button.dataset.permittingUse)].revision_id});
      requirement = revision.payload; active = null; packet = null;
      draft = {project_name:'',project_description:'',location:'',applicant_contact:'',assigned_to:'',staff_notes:'',review_notes:'',public_summary:'',review_state:'draft',requirement_revision:revision.revision_id,
        linked_sources:[],materials:requirement.materials.map(m => ({material_id:m.material_id,status:'not_reviewed',note:''}))}; dirty = true; paint(); report('Enter the intake details and assess each required material.');
    }));
  }
  async function createPacket(visibility) {
    if (dirty) {report('Save and record staff review before creating a packet.');return;}
    packet = await request('create-packet', {id:active.entity_id,payload:{expected_revision:active.revision_id,visibility}});
    const data = JSON.parse(packet.text), output = root.querySelector('[data-permitting-packet]');
    output.innerHTML = `<h4>${visibility === 'records_copy' ? 'Records copy preview' : 'Staff packet preview — private'}</h4><p>${esc(data.boundary)}</p><p>${esc(data.public_summary || 'Includes private intake work for staff use.')}</p><p>SHA256: ${esc(packet.sha256)}</p>
      <details><summary>Exact packet and source provenance</summary><pre>${esc(packet.text)}</pre></details><button data-permitting-action="export">Save exact packet to disk</button>
      ${visibility === 'records_copy' ? `<form data-permitting-attach><label>Existing Records request ID<input name="request_id" required></label><p>Attaches this reviewed copy for a separate Records review. Does not approve or release a response.</p><button>Attach reviewed copy to Records</button></form>` : ''}`;
    bindContent(); report('Exact packet prepared. Review the preview before exporting or attaching.');
  }
  function bindContent() {
    root.querySelectorAll('[data-permitting-action]').forEach(button => button.onclick = () => run(async () => {
      const action = button.dataset.permittingAction;
      if (action === 'cases' || action === 'requirements') { if (dirty && !window.confirm('Leave unsaved intake edits?')) return; tab=action; draft=active=packet=null; dirty=false; await load(); }
      if (action === 'new') await newCase();
      if (action === 'next') await load(next);
      if (action === 'review') await save(true);
      if (action === 'history') summary('[data-permitting-history]',await request('history',{id:active.entity_id}));
      if (action === 'staff-packet' || action === 'records-packet') await createPacket(action === 'staff-packet' ? 'staff_only' : 'records_copy');
      if (action === 'export') {const result=await request('export-packet',{id:packet.packet_id,expected_sha256:packet.sha256});report(`Packet saved: ${result.path} · SHA256 ${result.sha256}`);}
      if (action === 'pick') {
        const expected=generation; const result=await invoke('permitting_pick_bundle');if(expected!==generation)return;
        picked=result;if(!picked){report('No bundle selected.');return;}
        summary('[data-permitting-import]',{title:picked.title,jurisdiction:picked.jurisdiction,dataset_kind:picked.dataset_kind,source_reference:picked.source_reference,effective_on:picked.effective_on,materials:picked.materials});
        const existing = requirements.find(item => item.entity_id === `requirement:${picked.requirement_id}`);
        const confirm=document.createElement('button');confirm.textContent=existing ? 'Save reviewed requirement revision' : 'Import reviewed requirement source';confirm.onclick=()=>run(async()=>{await request('import-requirements',{payload:{bundle:picked,expected_revision:existing?.revision_id || null}});picked=null;await load();report('Requirement original, citations and checklist saved. Previous revisions are retained.');});root.querySelector('[data-permitting-import]').append(confirm);
      }
    }));
    root.querySelectorAll('[data-permitting-open]').forEach(button=>button.onclick=()=>run(()=>openCase(cases[Number(button.dataset.permittingOpen)].entity_id)));
    root.querySelectorAll('[data-permitting-requirement]').forEach(button=>button.onclick=()=>run(async()=>{const result=await request('requirement',{id:requirements[Number(button.dataset.permittingRequirement)].revision_id});const {content_base64,...metadata}=result.payload;summary('[data-permitting-source]',{...metadata,sha256:result.sha256,revision_id:result.revision_id});}));
    const caseForm=root.querySelector('[data-permitting-case]');
    if(caseForm)caseForm.onsubmit=event=>{event.preventDefault();run(()=>save());};
    if(caseForm)caseForm.oninput=()=>{capture();dirty=true;draft.review_state='draft';packet=null;root.querySelector('[data-permitting-packet]')?.replaceChildren();};
    root.querySelectorAll('[data-permitting-remove]').forEach(button=>button.onclick=()=>run(()=>{capture();draft.linked_sources.splice(Number(button.dataset.permittingRemove),1);draft.review_state='draft';dirty=true;packet=null;paint();report('Source removed. Save and review the revised case.');}));
    const searchForm=root.querySelector('[data-permitting-search]');
    if(searchForm) searchForm.onsubmit=event=>{event.preventDefault();run(async()=>{capture();const data=new FormData(searchForm),provider=String(data.get('provider'));const found=await request('search-connections',{payload:{provider,query:String(data.get('query'))}});connections=found.results;const output=root.querySelector('[data-permitting-connections]');output.innerHTML=connections.map((item,index)=>`<article><h5>${esc(item.title)}</h5><p>${esc(item.citation)}</p><p>${esc(item.excerpt)}</p><button data-permitting-select="${index}">Select cited source</button></article>`).join('');output.querySelectorAll('[data-permitting-select]').forEach(button=>button.onclick=()=>run(()=>{const item=connections[Number(button.dataset.permittingSelect)];if(!draft.linked_sources.some(s=>s.provider===provider&&s.source_id===item.source_id))draft.linked_sources.push({provider,source_id:item.source_id,expected_sha256:item.sha256});dirty=true;draft.review_state='draft';packet=null;paint();report('Cited source selected. Save the case to retain this version.');}));report(connections.length ? 'Permitted sources loaded.' : 'No permitted sources matched.');});};
    const attach=root.querySelector('[data-permitting-attach]');
    if(attach)attach.onsubmit=event=>{event.preventDefault();run(async()=>{await request('attach-records',{request_id:String(new FormData(attach).get('request_id')),payload:{source_id:packet.source_id,expected_sha256:packet.sha256}});report('Reviewed copy attached to Records. Separate Records review and release approval remain required.');});};
  }
  function bind() {root=document.querySelector('[data-permitting]');if(!root)return;paint();if(!draft&&!cases.length&&!requirements.length)run(()=>load());}
  globalThis.window?.addEventListener('beforeunload',event=>{if(dirty||busy){event.preventDefault();event.returnValue='';}});
  return {render,bind,reset,canLeave};
}
