const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// Only dedicated, public-filtered native requests. Never reuse a staff result.
export function createPublishedView(invoke, product) {
  let generation=0;
  function reset(){generation++;}
  function render(){
    if(product==='meetings') return `<section data-published="meetings"><h2>Published Meetings archive</h2><p>Only explicitly public archived records appear here. Sign in and choose Staff for meeting administration.</p><form data-published-action="meetings-search"><label>Search public meetings <input name="query"></label><button>Search archive</button></form><div data-published-records></div><div data-published-output role="status" aria-live="polite"></div></section>`;
    return `<section data-published="code"><h2>Public Code lookup</h2><p>Read adopted Code with an active official public source and citation. Explanations are not legal advice. Sign in and choose Staff for imports and proposals.</p>
      <form data-published-action="code-search"><label>Search public Code <input name="query" required></label><button>Search</button></form>
      ${[['code-lookup','Lookup'],['code-citation','Citation'],['code-export','Export section']].map(([action,label])=>`<form data-published-action="${action}"><label>Section number <input name="section_number" required></label><label>Date (optional) <input name="as_of" type="date"></label><button>${label}</button></form>`).join('')}
      <form data-published-action="code-answer"><label>Question <input name="query" required></label><label>Section number (optional) <input name="section_number"></label><button>Read cited answer</button></form><div data-published-output role="status" aria-live="polite"></div></section>`;
  }
  function bind(){
    const root=document.querySelector(`[data-published="${product}"]`);if(!root)return;
    const output=root.querySelector('[data-published-output]');
    async function request(values){
      const expected=generation;output.textContent='Loading published records…';
      try{
        const result=await invoke('published_domain_request',{request:values});
        if(expected!==generation||!root.isConnected)return;
        output.replaceChildren();
        if(values.operation==='meetings-search'){
          const list=root.querySelector('[data-published-records]');
          list.innerHTML=(result.records||[]).map(record=>`<article><h3>${esc(record.title)}</h3><button data-published-id="${esc(record.id)}">Read public record</button></article>`).join('')||'<p>No published meeting matched.</p>';
          list.querySelectorAll('[data-published-id]').forEach(button=>button.onclick=()=>request({operation:'meetings-record',id:button.dataset.publishedId}));
          output.textContent='Public archive loaded.';
        }else if(values.operation==='meetings-record'){
          const heading=document.createElement('h3');heading.textContent=result.title;output.append(heading);
          const summary=document.createElement('p');summary.textContent=result.plain_language_summary||'';output.append(summary);
          for(const [key,label] of [['posted_agenda','Agenda'],['posted_packet','Packet'],['approved_minutes','Minutes']]){
            const title=document.createElement('h4');title.textContent=label;
            const text=document.createElement('pre');text.textContent=result[key]||'';output.append(title,text);
          }
        }else{
          const text=document.createElement('pre');text.textContent=JSON.stringify(result,null,2);output.append(text);
        }
      }catch(error){if(expected===generation&&root.isConnected)output.textContent=`Published records unavailable. ${error?.message||error}`;}
    }
    root.querySelectorAll('form[data-published-action]').forEach(form=>form.onsubmit=event=>{
      event.preventDefault();const values=Object.fromEntries(new FormData(form));
      for(const key of ['as_of','section_number'])if(!values[key])delete values[key];
      request({operation:form.dataset.publishedAction,...values});
    });
  }
  return {render,bind,reset};
}
