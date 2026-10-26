import {expect,test} from '@playwright/test';

test('Inspections return to Records refreshes the canonical attached copy',async({page})=>{
 const sha='d'.repeat(64);
 await page.addInitScript(({sha})=>{
  const ids=['civiccore','civicrecords-ai','civicclerk','civiccode','civicnotice','civicaccess','civiczone','civicplan','civicpermit','civicinspect'];
  const record={id:'records-1',request_id:'22222222-2222-4222-8222-222222222222',requester:'Fictional inspection requester',summary:'Reviewed inspection copy',status:'received',deadline:'2026-11-04',documents:[],release_packages:[],exports:[],approved_at_unix_seconds:null,fulfilled_at_unix_seconds:null};
  const work=()=>({records_requests:[structuredClone(record)]});
  window.__attachCalls=0;
  window.__TAURI_INTERNALS__={invoke:async(cmd,args={})=>{
   if(cmd==='get_app_state')return {
    product_name:'Townlight',local_only:true,domain_authority:'python-records',
    modules:ids.map(id=>({id,display_name:id,required:id==='civiccore',selectable:id!=='civiccore',installed:true,enabled:true,contract_ready:true})),
    module_selection:{profile_id:'inspections-preview',installed_module_ids:ids,enabled_module_ids:ids},
    first_run:{finished:true,steps:[],locations:{}},
    access:{configured:true,signed_in:true,role:'local-admin',operator_email:'inspector@example.invalid'},health:[]
   };
   if(cmd==='suite_domain_request'&&args.request.operation==='state')return work();
   if(cmd==='inspections_domain_request'&&args.request.operation==='cases')return {items:[],next_offset:null};
   if(cmd==='inspections_domain_request'&&args.request.operation==='attach-records'){
    window.__attachCalls++;
    record.documents=[{id:'attachment-1',attachment_id:'33333333-3333-4333-8333-333333333333',title:'Reviewed inspection copy',sha256:sha,size_bytes:100,status:'attached for response review'}];
    return {};
   }
   throw Error(`Unexpected native fixture command: ${cmd}/${args.request?.operation}`);
  }};
 },{sha});
 await page.goto('/');
 const nav=page.getByRole('navigation',{name:'Primary'});
 await expect(nav).toBeVisible();
 await nav.getByRole('button',{name:/Records Requests/}).click();
 await expect(page.getByRole('heading',{name:'Fictional inspection requester',exact:true})).toBeVisible();
 await expect(page.locator('.workflow-record')).not.toContainText(sha);
 await nav.getByRole('button',{name:/Inspections/}).click();
 await expect(page.locator('[data-inspections-status]')).toContainText('No saved inspections.');
 // The attachment route updates canonical Records outside the main view cache.
 // The separate Inspections view tests cover the explicit attach form itself.
 await page.evaluate(()=>window.__TAURI_INTERNALS__.invoke('inspections_domain_request',{request:{operation:'attach-records',request_id:'22222222-2222-4222-8222-222222222222',payload:{source_id:'inspections:fixture',expected_sha256:'d'.repeat(64)}}}));
 await nav.getByRole('button',{name:/Records Requests/}).click();
 const ui=page.locator('.workflow-record').filter({has:page.getByRole('heading',{name:'Fictional inspection requester',exact:true})});
 await expect(ui).toContainText(sha);
 await expect(ui).not.toContainText('human-approved');
 await expect(ui).not.toContainText('released to requester');
 expect(await page.evaluate(()=>window.__attachCalls)).toBe(1);
});
