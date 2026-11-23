(async()=>{
 const a=window.audit, rows=[]; const get=()=>a.native('get_app_state');
 const step=async(id,action,fields={})=>{
   const row=await a.test('setup/'+action,async()=>{
     const before=await get();if(before.first_run.current_step_id!==id)throw Error('Expected '+id+' got '+before.first_run.current_step_id);
     for(const[k,v]of Object.entries(fields))a.fill('[data-setup-field="'+k+'"]',v);
     await a.click('[data-first-run-action="'+action+'"][data-step-id="'+id+'"]',{timeout:300000});
     await a.until(async()=>{const after=await get();return after.first_run.current_step_id!==id||after.first_run.finished;},300000);
   },async()=>{const after=await get();return after.first_run.current_step_id!==id||after.first_run.finished;});
   rows.push(row);if(!row.pass)throw Error(id+' did not pass: '+row.error);
 };
 await a.nav('home');
 if((await get()).first_run.current_step_id==='locations')await step('locations','choose-location',window.__auditDataRoot?{dataRoot:window.__auditDataRoot}:undefined);
 await a.click('[data-module-profile-id="inspections-preview"]',{confirm:false});
 await step('modules','select-modules');
 await step('city-profile','create-city-profile',{cityName:'Installed Audit Fictional City',state:'CO',timeZone:'America/Denver',recordsContact:'records@example.invalid',clerkContact:'clerk@example.invalid'});
 window.__auditAccount={email:'audit-admin@example.invalid',passcode:'Audit-fixture-2026-11-04!'};
 await step('first-admin','create-admin',{adminName:'Fictional Audit Administrator',adminEmail:window.__auditAccount.email,adminPasscode:window.__auditAccount.passcode});
 const auth=await a.test('setup/admin-sign-in',async()=>{a.fill('[data-access-field="email"]',window.__auditAccount.email);a.fill('[data-access-field="passcode"]',window.__auditAccount.passcode);await a.click('[data-auth-action="sign-in"]');},async()=>{await a.until(async()=>(await get()).access?.signed_in===true);return (await get()).access?.signed_in===true;}); rows.push(auth);
 await step('backup','choose-backup');
 await step('model','defer-model');
 await step('health','verify-health');
 await step('finish','open-app');
 return {rows,final:await get(),controls:a.inventory()};
})()
