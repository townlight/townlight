import {expect, test} from '@playwright/test';

// View-only transport fixture; it does not claim native or installed acceptance.
async function mount(page) {
  await page.route('http://127.0.0.1:5174/', route => route.fulfill({contentType:'text/html',body:'<!doctype html><html><body></body></html>'}));
  await page.goto('/');
  await page.evaluate(async () => {
    const {createInspectionsView} = await import('/src/inspections/view.js');
    window.__calls=[];window.__saved=null;window.__conflict=false;
    const revision='11111111-1111-4111-8111-111111111111';
    const invoke=async(command,{request:r})=>{
      window.__calls.push({command,r});
      if(command!=='inspections_domain_request')throw new Error('Unexpected command');
      if(r.operation==='cases')return {items:window.__saved?[{...window.__saved,...window.__saved.payload}]:[],next_offset:null};
      if(['create-case','revise-case'].includes(r.operation)){
        if(window.__conflict)throw new Error('Saved work changed; reload and reconcile before saving.');
        window.__saved={entity_id:revision,revision_id:revision,payload:{...r.payload,reviewer_id:r.payload.review_state==='reviewed'?'server-inspector':null,reviewed_on:'2026-10-26',report_draft:{summary:'Staff workpaper'}}};return window.__saved;
      }
      if(r.operation==='case')return window.__saved;
      if(r.operation==='search-connections')return {results:[{source_id:'code:fixture',sha256:'b'.repeat(64),title:'Fictional Code',citation:'<img src=x onerror=alert(1)>',excerpt:'Staff context'}]};
      if(r.operation==='create-packet')return {packet_id:revision,source_id:'inspections:'+revision,sha256:'c'.repeat(64),text:JSON.stringify({public_summary:window.__saved.payload.public_summary})};
      if(r.operation==='repeat-cases')return {items:[],next_offset:null};
      if(r.operation==='attach-records')return {};
      throw new Error('Unexpected operation '+r.operation);
    };
    const view=window.__view=createInspectionsView(invoke);document.body.innerHTML=view.render();view.bind();
  });
  await expect(page.locator('[data-inspections-status]')).toContainText('No saved inspections.');
}

test('inspector originals, explicit review and separate Records copy remain usable after repaint',async({page})=>{
  await mount(page);
  page.on('dialog',dialog=>dialog.accept());
  await page.getByRole('button',{name:'New inspection case',exact:true}).click();
  await page.getByLabel('Inspection title',{exact:true}).fill('Fictional inspection');
  await page.getByLabel('Property reference — private',{exact:true}).fill('PRIVATE ADDRESS');
  await page.getByLabel('Inspector-entered notes — private',{exact:true}).fill('PRIVATE FIELD NOTES');
  await page.getByLabel('Original file (photo, document, or voice memo) — up to 10MB total',{exact:true}).setInputFiles({name:'field-note.txt',mimeType:'text/plain',buffer:Buffer.from('original evidence')});
  await expect(page.locator('[data-inspections-status]')).toContainText('Original bytes and SHA256 selected');
  await page.getByLabel('Search adopted Code',{exact:true}).fill('fictional');
  await page.getByRole('button',{name:'Find cited Code',exact:true}).click();
  await expect(page.locator('[data-inspections-connections]')).toContainText('<img src=x onerror=alert(1)>');
  await expect(page.locator('[data-inspections-connections] img')).toHaveCount(0);
  await page.getByRole('button',{name:'Select cited Code',exact:true}).click();
  await page.getByLabel('Inspector review notes',{exact:true}).fill('Reviewed original and Code.');
  await page.getByLabel('Separately edited public summary for Records',{exact:true}).fill('Reviewed fictional summary.');
  await page.getByRole('button',{name:'Record inspector review',exact:true}).click();
  await expect(page.locator('[data-inspections-status]')).toContainText('Inspector review recorded');
  await expect(page.locator('[data-inspections]')).not.toHaveAttribute('inert','');
  expect(await page.evaluate(()=>window.__saved.payload.evidence[0].content_base64)).toBe(Buffer.from('original evidence').toString('base64'));
  expect(await page.evaluate(()=>window.__calls.find(c=>c.r.operation==='create-case').r.payload.reviewer_id)).toBeUndefined();
  await page.getByRole('button',{name:'Preview Records copy',exact:true}).click();
  await expect(page.locator('[data-inspections-packet]')).toContainText('Reviewed fictional summary.');
  await expect(page.locator('[data-inspections-packet]')).not.toContainText('PRIVATE FIELD NOTES');
  await page.getByLabel('Existing Records request ID',{exact:true}).fill('22222222-2222-4222-8222-222222222222');
  await page.getByRole('button',{name:'Attach reviewed inspection copy',exact:true}).click();
  await expect(page.locator('[data-inspections-status]')).toContainText('approval and release remain separate');
});

test('conflict retains inspector edits and account reset discards private work',async({page})=>{
  await mount(page);
  await page.getByRole('button',{name:'New inspection case',exact:true}).click();
  await page.getByLabel('Inspection title',{exact:true}).fill('Retain me');
  await page.evaluate(()=>window.__conflict=true);
  await page.getByRole('button',{name:'Save inspection draft',exact:true}).click();
  await expect(page.locator('[data-inspections-status]')).toContainText('reload and reconcile');
  await expect(page.getByLabel('Inspection title',{exact:true})).toHaveValue('Retain me');
  await page.evaluate(()=>{window.__view.reset();document.body.innerHTML=window.__view.render();window.__view.bind();});
  await expect(page.locator('[data-inspections-case]')).toHaveCount(0);
  await expect(page.locator('[data-inspections-status]')).toContainText('No saved inspections.');
});
