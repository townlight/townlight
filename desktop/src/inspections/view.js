const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const boundary = 'Inspector-owned workpapers. No official finding, citation, fine, notice issuance or scheduling.';
const field = (name, label, value = '', max = 10000) => `<label for="inspections-${name}">${label}</label><textarea id="inspections-${name}" name="${name}" maxlength="${max}">${esc(value)}</textarea>`;

export function createInspectionsView(invoke) {
  let root, generation = 0, busy = false, dirty = false, active = null, draft = null, packet = null;
  let cases = [], next = null, connections = [], status = '';
  const request = async (operation, values = {}) => {
    const expected = generation;
    const result = await invoke('inspections_domain_request', {request:{operation,...values}});
    if (expected !== generation) throw new Error('Account changed');
    return result;
  };
  const report = value => {status=value; if(root?.isConnected)root.querySelector('[data-inspections-status]').textContent=value;};
  const canLeave = () => !busy && (!dirty || window.confirm('Leave unsaved inspection edits?'));
  function capture() {
    const form=root?.querySelector('[data-inspections-case]');if(!form||!draft)return;
    const data=new FormData(form);
    for(const name of ['title','property_reference','inspection_reference','dataset_kind','inspector_notes','voice_notes','assigned_to','staff_notes','notice_draft','review_notes','public_summary'])draft[name]=String(data.get(name)||'');
    draft.photo_observations=String(data.get('photo_observations')||'').split('\n').map(s=>s.trim()).filter(Boolean);
  }
  function changed(){dirty=true;packet=null;if(draft)draft.review_state='draft';root?.querySelector('[data-inspections-packet]')?.replaceChildren();}
  async function run(action){
    if(busy)return;const expected=generation, actionRoot=root;busy=true;
    actionRoot?.setAttribute('inert','');actionRoot?.setAttribute('aria-busy','true');report('Working…');
    try{await action();}catch(error){if(expected===generation)report(`Action not confirmed; edits retained. ${error?.detail||error?.message||'Check System Health, current permissions and saved work before continuing.'}`);}
    finally{actionRoot?.removeAttribute('inert');actionRoot?.removeAttribute('aria-busy');if(expected===generation)busy=false;}
  }
  function reset(){generation++;root=null;busy=dirty=false;active=draft=packet=null;cases=[];connections=[];next=null;status='';}
  function render(){return `<section data-inspections><h2>Inspections</h2><p>${boundary}</p><p>Photo descriptions and voice transcripts are supplied by staff. No live image analysis or transcription.</p><p role="status" aria-live="polite" data-inspections-status>${esc(status)}</p><div data-inspections-content></div></section>`;}
  function show(target,value){const output=root.querySelector(target);output.replaceChildren();const pre=document.createElement('pre');pre.textContent=typeof value==='string'?value:JSON.stringify(value,null,2);output.append(pre);}
  async function load(offset=0){const found=await request('cases',{offset});cases=found.items;next=found.next_offset;paint();report(cases.length?'Saved inspection work loaded.':'No saved inspections. Create a case to begin.');}
  async function open(id){active=await request('case',{id});draft=structuredClone(active.payload);for(const key of ['boundary','reviewer_id','reviewed_on','report_draft'])delete draft[key];draft.expected_revision=active.revision_id;dirty=false;packet=null;paint();report('Saved inspection reopened. New edits require explicit review.');}
  async function save(review=false){
    capture();if(review&&!window.confirm('Record your inspector review of this workpaper? No official action will be issued.'))return;
    draft.review_state=review?'reviewed':'draft';
    const result=await request(active?'revise-case':'create-case',{...(active?{id:active.entity_id}:{}),payload:draft});
    await open(result.entity_id);report(review?'Inspector review recorded under your signed-in identity.':'Inspection draft saved.');
  }
  async function createPacket(visibility){
    if(dirty){report('Save and explicitly review the case before preparing a packet.');return;}
    packet=await request('create-packet',{id:active.entity_id,payload:{expected_revision:active.revision_id,visibility}});
    const output=root.querySelector('[data-inspections-packet]');
    output.innerHTML=`<h4>${visibility==='records_copy'?'Records copy preview':'Staff report preview — private'}</h4><p>SHA256 ${esc(packet.sha256)}</p><pre>${esc(packet.text)}</pre><button data-inspections-action="export">Save exact packet to disk</button>${visibility==='records_copy'?'<form data-inspections-attach><label>Existing Records request ID<input name="request_id" required></label><p>Attach this reviewed copy for separate Records review. Approval and release are separate actions.</p><button>Attach reviewed inspection copy</button></form>':''}`;
    bindContent();report('Exact packet prepared; review it before exporting or sharing.');
  }
  function paint(){
    if(!root?.isConnected)return;const output=root.querySelector('[data-inspections-content]');
    if(!draft){
      output.innerHTML=`<h3>Inspection cases</h3><button data-inspections-action="new">New inspection case</button><ul>${cases.map((item,index)=>`<li>${esc(item.title)} · ${esc(item.review_state)} · ${esc(item.dataset_kind)} <button data-inspections-open="${index}">Open inspection case</button></li>`).join('')}</ul>${next!==null?'<button data-inspections-action="next">Next page</button>':''}`;
    }else{
      output.innerHTML=`<button data-inspections-action="cases">Back to inspection cases</button><h3>${active?'Saved inspection':'New inspection'}</h3><p>${esc(draft.review_state)}${active?.payload.reviewer_id?` · reviewed by ${esc(active.payload.reviewer_id)} on ${esc(active.payload.reviewed_on)}`:''}</p>${active?.connection_error?`<p role="alert">${esc(active.connection_error)}</p>`:''}
        <form data-inspections-case>${field('title','Inspection title',draft.title,500)}${field('property_reference','Property reference — private',draft.property_reference,1000)}${field('inspection_reference','Inspector case reference',draft.inspection_reference,160)}
        <label>Dataset<select name="dataset_kind"><option value="municipal" ${draft.dataset_kind==='municipal'?'selected':''}>Municipal</option><option value="fictional" ${draft.dataset_kind==='fictional'?'selected':''}>Fictional demonstration</option></select></label>
        ${field('inspector_notes','Inspector-entered notes — private',draft.inspector_notes)}${field('photo_observations','Inspector-entered photo observations — one per line',draft.photo_observations.join('\n'))}${field('voice_notes','Staff-supplied voice transcript — private',draft.voice_notes)}${field('assigned_to','Assigned staff',draft.assigned_to,255)}${field('staff_notes','Private staff notes',draft.staff_notes)}${field('notice_draft','Notice workpaper — draft only, never issued',draft.notice_draft)}<button type="button" data-inspections-action="notice">Draft notice from observations</button>${field('review_notes','Inspector review notes',draft.review_notes,4000)}${field('public_summary','Separately edited public summary for Records',draft.public_summary)}
        <p>Only the separate summary, review identity and public Code citations enter the Records copy. Original evidence, address, observations, transcript, report/notice drafts and private notes stay in the staff packet. Check your summary before sharing.</p><button type="submit">Save inspection draft</button><button type="button" data-inspections-action="review">Record inspector review</button></form>
        <h4>Original evidence</h4><label>Original file — up to 10MB total<input data-inspections-file type="file" accept=".txt,.jpg,.jpeg,.png,.pdf"></label><ul>${draft.evidence.map((item,index)=>`<li>${esc(item.filename)} · ${esc(item.sha256)} <button data-inspections-remove-evidence="${index}">Remove original from this revision</button></li>`).join('')}</ul>
        <h4>Real Code citations</h4><form data-inspections-search><label>Search adopted Code<input name="query" required maxlength="500"></label><button>Find cited Code</button></form><div data-inspections-connections></div><ul>${draft.linked_sources.map((item,index)=>`<li>${esc(item.source_id)} <button data-inspections-remove="${index}">Remove citation</button></li>`).join('')}</ul>
        <button data-inspections-action="repeat">Find saved cases at this property</button><div data-inspections-repeat></div>
        ${active?`<button data-inspections-action="history">Revision history</button><button data-inspections-action="report">Read generated report draft</button><button data-inspections-action="staff-packet">Create staff report packet</button><button data-inspections-action="records-packet">Preview Records copy</button>`:''}<div data-inspections-history></div><div data-inspections-packet></div>`;
    }bindContent();
  }
  function bindContent(){
    root.querySelectorAll('[data-inspections-action]').forEach(button=>button.onclick=()=>run(async()=>{
      const action=button.dataset.inspectionsAction;
      if(action==='cases'){if(dirty&&!window.confirm('Leave unsaved inspection edits?'))return;active=draft=packet=null;dirty=false;await load();}
      if(action==='new'){active=packet=null;draft={title:'',property_reference:'',inspection_reference:'',dataset_kind:'municipal',inspector_notes:'',photo_observations:[],voice_notes:'',evidence:[],linked_sources:[],assigned_to:'',staff_notes:'',notice_draft:'',review_state:'draft',review_notes:'',public_summary:''};changed();paint();report('Enter inspector-supplied observations and select real Code context.');}
      if(action==='next')await load(next);
      if(action==='review')await save(true);
      if(action==='history')show('[data-inspections-history]',await request('history',{id:active.entity_id}));
      if(action==='report')show('[data-inspections-history]',active.payload.report_draft);
      if(action==='repeat'){capture();show('[data-inspections-repeat]',await request('repeat-cases',{payload:{property_reference:draft.property_reference}}));report('Only actual saved cases at this exact property are listed.');}
      if(action==='notice'){capture();const result=await request('draft-notice',{payload:draft});draft.notice_draft=result.draft;changed();paint();report('Draft notice prepared for editing and inspector review; nothing issued.');}
      if(action==='staff-packet'||action==='records-packet')await createPacket(action==='staff-packet'?'staff_only':'records_copy');
      if(action==='export'){const result=await request('export-packet',{id:packet.packet_id,expected_sha256:packet.sha256});report(`Exact packet saved: ${result.path} · SHA256 ${result.sha256}`);}
    }));
    root.querySelectorAll('[data-inspections-open]').forEach(button=>button.onclick=()=>run(()=>open(cases[Number(button.dataset.inspectionsOpen)].entity_id)));
    const form=root.querySelector('[data-inspections-case]');if(form){form.onsubmit=event=>{event.preventDefault();run(()=>save());};form.oninput=()=>{capture();changed();};}
    const picker=root.querySelector('[data-inspections-file]');if(picker)picker.onchange=()=>run(async()=>{
      capture();const expected=generation,file=picker.files?.[0];if(!file)return;
      if(!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,150}$/.test(file.name)||!file.size||file.size>10000000)throw new Error('Use a safe filename and an original file up to 10MB.');
      const types={txt:'text/plain',jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',pdf:'application/pdf'},media=types[file.name.split('.').pop().toLowerCase()];if(!media)throw new Error('Choose a supported evidence type.');
      const bytes=new Uint8Array(await file.arrayBuffer());const digest=await crypto.subtle.digest('SHA-256',bytes);if(expected!==generation)return;
      if(draft.evidence.some(e=>e.filename.toLowerCase()===file.name.toLowerCase())||draft.evidence.reduce((n,e)=>n+e.content_base64.length,0)+Math.ceil(bytes.length/3)*4>14000000)throw new Error('Use unique evidence filenames and at most 10MB total.');
      let binary='';for(let start=0;start<bytes.length;start+=32768)binary+=String.fromCharCode(...bytes.subarray(start,start+32768));
      draft.evidence.push({filename:file.name,description:file.name,media_type:media,content_base64:btoa(binary),sha256:Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('')});changed();paint();report('Original bytes and SHA256 selected. Save the case to retain them.');
    });
    root.querySelectorAll('[data-inspections-remove-evidence]').forEach(button=>button.onclick=()=>run(()=>{capture();draft.evidence.splice(Number(button.dataset.inspectionsRemoveEvidence),1);changed();paint();report('Removed from draft only; previous saved originals remain.');}));
    root.querySelectorAll('[data-inspections-remove]').forEach(button=>button.onclick=()=>run(()=>{capture();draft.linked_sources.splice(Number(button.dataset.inspectionsRemove),1);changed();paint();}));
    const search=root.querySelector('[data-inspections-search]');if(search)search.onsubmit=event=>{event.preventDefault();run(async()=>{
      capture();const result=await request('search-connections',{payload:{provider:'code',query:String(new FormData(search).get('query'))}});connections=result.results;
      const output=root.querySelector('[data-inspections-connections]');output.innerHTML=connections.map((item,index)=>`<article><h5>${esc(item.title)}</h5><p>${esc(item.citation)}</p><p>${esc(item.excerpt)}</p><button data-inspections-select="${index}">Select cited Code</button></article>`).join('');
      output.querySelectorAll('[data-inspections-select]').forEach(button=>button.onclick=()=>run(()=>{capture();const item=connections[Number(button.dataset.inspectionsSelect)];if(!draft.linked_sources.some(s=>s.source_id===item.source_id))draft.linked_sources.push({provider:'code',source_id:item.source_id,expected_sha256:item.sha256});changed();paint();report('Code citation selected; save to retain this version.');}));report(connections.length?'Permitted Code sources loaded.':'No permitted Code matched.');
    });};
    const attach=root.querySelector('[data-inspections-attach]');if(attach)attach.onsubmit=event=>{event.preventDefault();run(async()=>{await request('attach-records',{request_id:String(new FormData(attach).get('request_id')),payload:{source_id:packet.source_id,expected_sha256:packet.sha256}});report('Reviewed inspection copy attached. Records approval and release remain separate.');});};
  }
  function bind(){root=document.querySelector('[data-inspections]');if(!root)return;paint();if(!draft&&!cases.length)run(()=>load());}
  globalThis.window?.addEventListener('beforeunload',event=>{if(dirty||busy){event.preventDefault();event.returnValue='';}});
  return {render,bind,reset,canLeave};
}
