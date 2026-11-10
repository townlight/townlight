const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function createNoticeView(invoke) {
  let root = null, active = null, history = [], notices = [], busy = false, dirty = false, generation = 0, status = '';
  let document = {title:'', body:'', notice_type:'public hearing', statutory_basis:'', event_date:'', lead_days:10};
  const request = async (operation, values = {}) => {
    const current = generation;
    const result = await invoke('notice_domain_request', {request:{operation, ...values}});
    if (current !== generation) throw new Error('Account changed. Reload Notice.');
    return result;
  };
  function reset() {generation++; root=null; active=null; history=[]; notices=[]; busy=dirty=false; status=''; document={title:'',body:'',notice_type:'public hearing',statutory_basis:'',event_date:'',lead_days:10};}
  const canLeave = () => !busy && (!dirty || window.confirm('Leave unsaved notice edits?'));
  function render() {return `<section data-notice><h2>Public Notices</h2><p>Staff prepare, review and approve notices, retain actual posting proof, and archive evidence for Records. Staff verify legal authority and perform official publication outside Townlight.</p><p role="status" aria-live="polite" data-notice-status>${esc(status)}</p><div data-notice-content></div></section>`;}
  const report = message => {status=message; if(root?.isConnected)root.querySelector('[data-notice-status]').textContent=message;};
  async function run(action) {
    if(busy)return;
    const current=generation, actionRoot=root; busy=true;
    actionRoot?.setAttribute('inert',''); actionRoot?.setAttribute('aria-busy','true');
    try {await action();} catch(error) {if(current===generation)report(`Action not confirmed; refresh saved work before retrying. ${error?.detail || error?.message || 'Check System Health and permissions.'}`);}
    finally {actionRoot?.removeAttribute('inert'); actionRoot?.removeAttribute('aria-busy'); if(current===generation)busy=false;}
  }
  async function load() {notices=(await request('inventory')).notices; paint();}
  async function open(id) {const result=await request('read',{id});active=result.notice;history=result.history;document=structuredClone(active.document);dirty=false;paint();}
  const mutation = (operation, extra={}) => request(operation,{id:active.notice_id,payload:{sequence:active.sequence,...extra}});
  const input = (name,label,type='text') => `<label>${label}<input name="${name}" type="${type}" value="${esc(document[name])}" required /></label>`;
  function paint() {
    if(!root?.isConnected)return;
    const container=root.querySelector('[data-notice-content]');
    container.innerHTML=`<div class="workflow-actions"><button type="button" data-notice-new>New notice</button><button type="button" data-notice-refresh>Refresh saved work</button></div>
      <label>Saved notices<select data-notice-select><option value="">Select a notice</option>${notices.map(n=>`<option value="${esc(n.notice_id)}" ${active?.notice_id===n.notice_id?'selected':''}>${esc(n.document.title)} — ${esc(n.state)}</option>`).join('')}</select></label>
      <form data-notice-document class="workflow-form"><h3>${active?'Edit saved notice':'New draft'}</h3>
        ${input('title','Title')}${input('notice_type','Notice type')}
        <label>Notice text<textarea name="body" maxlength="100000" required>${esc(document.body)}</textarea></label>
        <label>Staff-verified statutory basis<textarea name="statutory_basis" maxlength="5000" required>${esc(document.statutory_basis)}</textarea></label>
        ${input('event_date','Event date','date')}${input('lead_days','Staff-selected lead days','number')}
        <button type="submit">Save draft${active?' revision':''}</button></form>
      ${active?`<section class="workflow-record"><p>Saved state: <strong>${esc(active.state)}</strong> · Revision ${active.sequence}</p>
        <p>Saving changes clears the previous review, approval and current proof selection; historical evidence remains retained.</p>
        <section><h3>Deadline workpaper</h3><p>${esc(active.deadline_workpaper.basis)}</p><ul>${active.deadline_workpaper.reminders.map(item=>`<li>${esc(item)}</li>`).join('')}</ul><p>Staff review is required. These reminders do not establish legal sufficiency.</p></section>
        <label>Review notes<textarea data-notice-review-note maxlength="5000"></textarea></label>
        <button type="button" data-notice-review ${dirty||!['draft','reviewed'].includes(active.state)?'disabled':''}>Record review of saved revision</button>
        <button type="button" data-notice-approve ${dirty||active.state!=='reviewed'?'disabled':''}>Approve reviewed notice</button>
        <form data-notice-proof class="workflow-form"><h3>Retain externally performed posting proof</h3>
          <label>Proof file (up to 5 MB)<input type="file" name="proof" required /></label>
          <label>Posting location<input name="location" required maxlength="2000" /></label>
          <label>Posting date/time with time zone<input name="published_at" required placeholder="2026-11-02T12:00:00-07:00" /></label>
          <button type="submit" ${dirty||!['approved','proof-recorded'].includes(active.state)?'disabled':''}>Retain actual proof</button></form>
        <p>${active.proofs.length} proof files retained for this approved content.</p>
        <button type="button" data-notice-archive ${dirty||active.state!=='proof-recorded'?'disabled':''}>Create verified archive</button>
        ${active.archive_id?`<button type="button" data-notice-export>Write and verify ZIP export</button>
          <form data-notice-records><label>Records request UUID<input name="request_id" required /></label><button type="submit">Attach archive to Records</button></form>`:''}
        <details><summary>Saved review and approval history</summary><pre>${esc(JSON.stringify(history,null,2))}</pre></details></section>`:''}`;
    container.querySelector('[data-notice-new]').onclick=()=>{if(canLeave()){active=null;history=[];document={title:'',body:'',notice_type:'public hearing',statutory_basis:'',event_date:'',lead_days:10};dirty=false;paint();}};
    container.querySelector('[data-notice-refresh]').onclick=()=>{if(canLeave())run(async()=>{await load();if(active)await open(active.notice_id);report('Saved Notice work refreshed.');});};
    container.querySelector('[data-notice-select]').onchange=event=>{if(event.target.value&&canLeave())run(()=>open(event.target.value));};
    const form=container.querySelector('[data-notice-document]');
    form.oninput=()=>{const data=new FormData(form);for(const key of Object.keys(document))document[key]=key==='lead_days'?Number(data.get(key)):String(data.get(key)||'');dirty=true;for(const button of container.querySelectorAll('[data-notice-review],[data-notice-approve],[data-notice-archive],[data-notice-proof] button'))button.disabled=true;};
    form.onsubmit=event=>{event.preventDefault();run(async()=>{const saved=active?await mutation('edit',{document}):await request('create',{payload:document});await load();await open(saved.notice_id);report('Draft saved. Review this saved revision before approval.');});};
    container.querySelector('[data-notice-review]')?.addEventListener('click',()=>run(async()=>{const note=container.querySelector('[data-notice-review-note]').value;await mutation('review',{note});await load();await open(active.notice_id);report('Staff review recorded.');}));
    container.querySelector('[data-notice-approve]')?.addEventListener('click',()=>run(async()=>{await mutation('approve');await load();await open(active.notice_id);report('Staff approval recorded for the saved content. Nothing was published.');}));
    container.querySelector('[data-notice-proof]')?.addEventListener('submit',event=>{event.preventDefault();run(async()=>{const fields=new FormData(event.target),file=fields.get('proof');if(!file||!file.size||file.size>5000000)throw new Error('Choose actual proof up to 5 MB.');const bytes=new Uint8Array(await file.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));await mutation('proof',{filename:file.name,content_base64:btoa(binary),location:String(fields.get('location')),published_at:String(fields.get('published_at'))});await load();await open(active.notice_id);report('Actual posting proof retained with its hash.');});});
    container.querySelector('[data-notice-archive]')?.addEventListener('click',()=>run(async()=>{await mutation('archive');await load();await open(active.notice_id);report('Notice and proof archived with a verified manifest.');}));
    container.querySelector('[data-notice-export]')?.addEventListener('click',()=>run(async()=>{const result=await request('export',{id:active.archive_id});report(`Archive written and verified: ${result.path}; SHA256 ${result.sha256}`);}));
    container.querySelector('[data-notice-records]')?.addEventListener('submit',event=>{event.preventDefault();const request_id=String(new FormData(event.target).get('request_id'));run(async()=>{const result=await request('records',{id:active.archive_id,payload:{request_id}});report(`Records attachment confirmed for request ${result.request_id}; archive SHA256 ${result.sha256}. Open Records to read back the attached evidence.`);});});
  }
  function bind() {const next=window.document.querySelector('[data-notice]');if(!next||next===root)return;root=next;paint();run(async()=>{await load();if(active)await open(active.notice_id);});}
  function prepareImportDraft({title, text, date, citation}) {
    active = null;
    history = [];
    document = {title, body: `${text}\n\n${citation}`, notice_type: 'public hearing',
      statutory_basis: '', event_date: date, lead_days: 10};
    dirty = true;
    status = 'Imported source loaded into an unsaved draft. Verify the notice type, date and legal basis before saving.';
  }
  return {render,bind,reset,canLeave,prepareImportDraft};
}
