(async()=>{
await (async()=>{
 if(window.audit)return {alreadyInitialized:true};
 const audit=window.audit={calls:[],records:[],pending:0,seq:0};
 const original=window.__TAURI_INTERNALS__.invoke.bind(window.__TAURI_INTERNALS__);
 audit.native=original;
 audit.sleep=ms=>new Promise(r=>setTimeout(r,ms));
 audit.wait=async(ms=120000)=>{let quiet=0;const end=Date.now()+ms;while(Date.now()<end){await audit.sleep(150);if(audit.pending===0){if(++quiet>=3)return;}else quiet=0;}throw Error('UI operation did not settle in '+ms+'ms');};
 audit.fill=(selector,value)=>{const e=document.querySelector(selector);if(!e)throw Error('Missing field '+selector);if(e.type==='checkbox'||e.type==='radio')e.checked=!!value;else e.value=String(value);e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));};
 audit.file=(selector,name,text,type='application/json')=>{const e=document.querySelector(selector);if(!e)throw Error('Missing file '+selector);const d=new DataTransfer();d.items.add(new File([text],name,{type}));e.files=d.files;e.dispatchEvent(new Event('change',{bubbles:true}));};
 audit.click=async(selector,{confirm=true,timeout=120000}={})=>{const e=typeof selector==='string'?document.querySelector(selector):selector;if(!e)throw Error('Missing control '+selector);if(e.disabled)throw Error('Disabled control '+selector);e.click();await audit.wait(timeout);if(confirm){const c=document.querySelector('[data-work-review-confirm],[data-supervisor-review-confirm],[data-module-review-confirm]');if(c&&!c.disabled){c.click();await audit.wait(timeout);}}};
 audit.nav=async area=>{await audit.click('.sidebar [data-area="'+area+'"]',{confirm:false});};
 audit.form=async(selector,values={},files={})=>{const form=document.querySelector(selector);if(!form)throw Error('Missing form '+selector);for(const [name,value]of Object.entries(values))audit.fill(selector+' [name="'+name+'"]',value);for(const[name,v]of Object.entries(files))audit.file(selector+' [name="'+name+'"]',v.name,v.text,v.type);const invalid=[...form.elements].filter(e=>e.willValidate&&!e.checkValidity()).map(e=>({name:e.name,message:e.validationMessage}));if(invalid.length)throw Error('Invalid fixture '+JSON.stringify(invalid));await audit.click(form.querySelector('button[type="submit"]')||form.querySelector('button'));};
 audit.test=async(id,action,check)=>{const begin=audit.calls.length;const row={id,started:new Date().toISOString(),method:'installed WebView DOM control event'};try{await action();row.calls=audit.calls.slice(begin);row.text=document.body.innerText;row.pass=check?!!await check(row):false;row.verdict=check?(row.pass?'PASS':'FAIL'):'OBSERVED';}catch(e){row.calls=audit.calls.slice(begin);row.error=String(e);row.text=document.body.innerText;row.pass=false;row.verdict='FAIL';}row.finished=new Date().toISOString();audit.records.push(row);return row;};
 audit.inventory=()=>[...document.querySelectorAll('button,input,textarea,select,a,summary')].filter(e=>e.getClientRects().length).map(e=>({tag:e.tagName,type:e.type,name:e.name,id:e.id,text:e.innerText,label:e.closest('label')?.innerText,value:e.type==='password'?'[redacted]':e.value,disabled:e.disabled,data:{...e.dataset},form:e.closest('form')?.outerHTML.slice(0,250),options:e.tagName==='SELECT'?[...e.options].map(o=>({value:o.value,text:o.text})):undefined}));
 return {initialized:true,text:document.body.innerText,controls:audit.inventory()};
})();
await (async()=>{
 const a=window.audit;a.priorHarnessRecords=a.records;a.records=[];a.version=2;
 // The released native bridge is intentionally immutable. Do not alter it.
 // Observe real controls, rendered results and independent persisted readback.
 a.wait=async(ms=120000)=>{const end=Date.now()+ms;await a.sleep(350);while(Date.now()<end){const busy=document.querySelector('[aria-busy="true"],[data-notice][inert],[data-inspections][inert],[data-permitting][inert],[data-planning-panel][inert]');if(!busy){await a.sleep(300);return;}await a.sleep(200);}throw Error('UI remained busy');};
 a.click=async(selector,{confirm=true,timeout=120000}={})=>{
  const e=typeof selector==='string'?document.querySelector(selector):selector;
  if(!e)throw Error('Missing control '+selector);if(e.disabled)throw Error('Disabled control '+selector);
  const end=Date.now()+timeout;e.click();await a.sleep(350);
  while(e.isConnected&&e.disabled&&Date.now()<end)await a.sleep(150);
  if(e.isConnected&&e.disabled)throw Error('Control stayed busy');
  await a.wait(timeout);
  if(confirm){const c=document.querySelector('[data-review-confirm],[data-supervisor-review-confirm],[data-module-review-confirm]');if(c&&!c.disabled){c.click();await a.wait(timeout);}}
 };
 a.until=async(predicate,timeout=120000)=>{const end=Date.now()+timeout;while(Date.now()<end){if(await predicate())return;await a.sleep(500);}throw Error('Expected persisted/rendered state did not arrive');};
 a.test=async(id,action,check)=>{const row={id,started:new Date().toISOString(),method:'installed WebView DOM control event plus rendered/persisted outcome',calls:[]};try{await action();row.text=document.body.innerText;row.pass=check?!!await check(row):false;row.verdict=check?(row.pass?'PASS':'FAIL'):'OBSERVED';}catch(e){row.error=String(e);row.text=document.body.innerText;row.pass=false;row.verdict='FAIL';}row.finished=new Date().toISOString();a.records.push(row);return row;};
 return {version:2,reason:'Native bridge is non-writable and non-configurable; assertions now use actual visible result and independent database readback.',step:(await a.native('get_app_state')).first_run.current_step_id};
})();
await (async()=>{
 const a=window.audit;
 a.click=async(selector,{confirm=true,timeout=180000}={})=>{
  const e=typeof selector==='string'?document.querySelector(selector):selector;if(!e)throw Error('Missing control '+selector);if(e.disabled)throw Error('Disabled control '+selector);
  const action=e.dataset.workAction||e.dataset.reviewConfirm;
  const committing=['firstRunAction','authAction','supervisorAction','supervisorReviewConfirm','moduleAction','moduleReviewConfirm'].some(k=>k in e.dataset);
  e.click();
  const review=document.querySelector('[data-review-confirm],[data-supervisor-review-confirm],[data-module-review-confirm]');
  if(review&&!confirm)return;
  if(review&&confirm&&!review.disabled){await a.click(review,{confirm:false,timeout});return;}
  // main.js renders once when a work action starts and again after its promise
  // settles. Wait for that second render, not merely the first loading render.
  const inFlight=action?document.querySelector('[data-work-action="'+action+'"]'):e;
  const end=Date.now()+timeout;await a.sleep(200);
  while(inFlight?.isConnected&&(!!action||inFlight.disabled||committing)&&Date.now()<end)await a.sleep(150);
  if(inFlight?.isConnected&&(!!action||inFlight.disabled||committing))throw Error('Control did not finish: '+e.textContent);
  await a.wait(timeout);
 };
 return {version:4,reason:'Wait for completion render after in-flight render; profile maintenance now independently confirmed complete.'};
})()
;
(()=>{const a=window.audit,prior=a.click;a.click=async(...args)=>{await prior(...args);const end=Date.now()+600000;while([...document.querySelectorAll('.action-result strong')].some(e=>e.textContent.trim()==='Working')&&Date.now()<end)await a.sleep(250);if([...document.querySelectorAll('.action-result strong')].some(e=>e.textContent.trim()==='Working'))throw Error('Supervisor operation not terminal');await a.wait();};return{observer:'Await terminal supervisor result after initial Working render',at:new Date().toISOString()};})();
window.audit.fixture={}; return {initialized:true,method:"Actual installed controls and persisted readback; native bridge unchanged"};
})()
