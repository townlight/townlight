/** Records-side transport and controls for permitted Planning archive snapshots. */
function esc(value:string) {
  return String(value).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
type Invoke = <T>(command:string,args:{request:object})=>Promise<T>;
interface Source {source_id:string;title:string;sha256:string;excerpt:string;citation:string}
export function renderPlanningSources(requestId:string) {
  return `<section data-planning-sources data-request-id="${esc(requestId)}"><h3>Find Planning documents</h3>
    <p>Search explicitly permitted, staff-selected immutable Planning snapshots. Restricted records and private notes are excluded. Attaching preserves source history for review; it does not approve or release a response.</p>
    <form><label>Planning document search <input name="query" required maxlength="500"></label><button>Search Planning</button></form>
    <div data-source-results></div><p data-source-status role="status" aria-live="polite"></p></section>`;
}
export function bindPlanningSources(invoke:Invoke,refresh:()=>Promise<void>) {
  const root=document.querySelector<HTMLElement>('[data-planning-sources]');
  if (!root) return;
  const form=root.querySelector('form')!;
  const output=root.querySelector<HTMLElement>('[data-source-results]')!;
  const status=root.querySelector<HTMLElement>('[data-source-status]')!;
  form.addEventListener('submit',async event=>{
    event.preventDefault(); const button=form.querySelector('button')!; button.disabled=true;
    output.replaceChildren(); status.textContent='Searching Planning…';
    try {
      const query=String(new FormData(form).get('query') || '');
      const response=await invoke<{results:Source[];truncated:boolean}>('records_domain_request',{request:{operation:'search-planning',query}});
      for(const source of response.results) {
        const row=document.createElement('article');
        const title=document.createElement('h4'); title.textContent=source.title;
        const text=document.createElement('p'); text.textContent=source.excerpt;
        const citation=document.createElement('p'); citation.textContent=source.citation;
        const attach=document.createElement('button'); attach.type='button'; attach.textContent='Attach to selected Records request';
        attach.disabled=!root.dataset.requestId;
        attach.addEventListener('click',async()=>{
          attach.disabled=true; status.textContent='Attaching source snapshot…';
          try {
            await invoke('records_domain_request',{request:{operation:'attach-planning-source',
              request_id:root.dataset.requestId,source_id:source.source_id,expected_sha256:source.sha256}});
            await refresh();
          } catch {status.textContent='Attachment not confirmed. Refresh saved Records work before retrying.';attach.disabled=false;}
        });
        row.append(title,text,citation,attach); output.append(row);
      }
      status.textContent=response.results.length ? `${response.results.length} permitted documents${response.truncated?' (first 50; refine the query)':''}.` : 'No permitted documents matched.';
    } catch {status.textContent='Planning search unavailable. No cached or restricted results substituted.';}
    finally {button.disabled=false;}
  });
}
