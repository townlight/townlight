import {expect, test} from '@playwright/test';

// UI-only transport fixture. The separate installed journey uses the native backend.
async function mount(page) {
  await page.route('http://127.0.0.1:5174/', route => route.fulfill({contentType:'text/html',body:'<!doctype html><html><body></body></html>'}));
  await page.goto('/');
  await page.evaluate(async () => {
    const {createPermittingView} = await import('/src/permitting/view.js');
    const revision = '11111111-1111-4111-8111-111111111111';
    const requirement = {requirement_id:'fixture',title:'Fictional intake manual',jurisdiction:'Fictional',dataset_kind:'fictional',
      effective_on:'2026-01-01',source_reference:'Manual section 2',materials:[{material_id:'site',description:'Site plan',citation:'Section 2'}]};
    window.__calls = []; window.__saved = null; window.__conflict = false;
    const invoke = async (command,args) => {
      const r = args?.request; window.__calls.push({command,r});
      if(command === 'permitting_pick_bundle') return requirement;
      if(r.operation === 'requirements') return {items:[{entity_id:'requirement:fixture',revision_id:revision,...requirement}],next_offset:null};
      if(r.operation === 'requirement') return {payload:requirement,revision_id:revision,sha256:'a'.repeat(64)};
      if(r.operation === 'cases') return {items:window.__saved ? [{...window.__saved,...window.__saved.payload}] : [],next_offset:null};
      if(r.operation === 'create-case' || r.operation === 'revise-case') {
        if(window.__conflict) throw new Error('Saved work changed; reload and reconcile before saving.');
        window.__saved = {entity_id:'22222222-2222-4222-8222-222222222222',revision_id:revision,requirement,payload:{...r.payload,
          reviewer_id:r.payload.review_state === 'reviewed' ? 'server-staff' : null,reviewed_on:'2026-10-25'}};
        return window.__saved;
      }
      if(r.operation === 'case') return window.__saved;
      if(r.operation === 'search-connections') return {results:[{source_id:'code:fixture',sha256:'b'.repeat(64),title:'Fictional code',citation:'<img src=x onerror=alert(1)>',excerpt:'ADU context'}]};
      if(r.operation === 'create-packet') return {packet_id:revision,source_id:'permitting:'+revision,sha256:'c'.repeat(64),text:JSON.stringify({boundary:'Pre-application support',public_summary:window.__saved.payload.public_summary})};
      if(r.operation === 'attach-records') return {};
      throw new Error('Unexpected operation '+r.operation);
    };
    const view = window.__view = createPermittingView(invoke); document.body.innerHTML=view.render(); view.bind();
  });
  await expect(page.locator('[data-permitting-status]')).toContainText('No saved work yet.');
}

async function draft(page) {
  await page.getByRole('button',{name:'New intake case',exact:true}).click();
  await page.getByRole('button',{name:'Use these requirements'}).click();
  await page.getByLabel('Project name',{exact:true}).fill('Fictional ADU');
  await page.getByLabel('Project description',{exact:true}).fill('PRIVATE proposal');
  await page.getByLabel('Property address or parcel identifier').fill('PRIVATE address');
  await page.getByLabel('Applicant contact — private').fill('PRIVATE contact');
  await page.getByLabel('Staff material assessment').selectOption('missing');
  await page.getByLabel('Private staff notes').fill('PRIVATE note');
  await page.getByLabel('Staff review and follow-up notes').fill('Site plan still required.');
  await page.getByLabel('Separately edited public summary for Records').fill('Reviewed pre-application inquiry.');
}

test('Permitting saves, reopens, records explicit review and attaches a separately edited copy', async ({page}) => {
  page.on('dialog', dialog => dialog.accept());
  await mount(page); await draft(page);
  await page.getByLabel('Search sources').fill('ADU');
  await page.getByRole('button',{name:'Find cited context'}).click();
  await expect(page.locator('[data-permitting-connections]')).toContainText('<img src=x onerror=alert(1)>');
  await expect(page.locator('[data-permitting-connections] img')).toHaveCount(0);
  await page.getByRole('button',{name:'Select cited source'}).click();
  await page.getByRole('button',{name:'Save intake draft',exact:true}).click();
  await expect(page.locator('[data-permitting-status]')).toHaveText('Intake draft saved.');
  await expect(page.getByLabel('Project name',{exact:true})).toBeEditable();
  await expect(page.locator('[data-permitting][inert]')).toHaveCount(0);
  await page.getByRole('button',{name:'Record staff review',exact:true}).click();
  await expect(page.locator('[data-permitting-status]')).toContainText('signed-in identity');
  expect(await page.evaluate(() => window.__calls.find(c=>c.r?.operation==='revise-case').r.payload.reviewer_id)).toBeUndefined();
  await page.getByRole('button',{name:'Preview Records copy'}).click();
  await expect(page.locator('[data-permitting-packet]')).toContainText('Reviewed pre-application inquiry.');
  await expect(page.locator('[data-permitting-packet]')).not.toContainText('PRIVATE');
  await page.getByLabel('Existing Records request ID').fill('33333333-3333-4333-8333-333333333333');
  await page.getByRole('button',{name:'Attach reviewed copy to Records'}).click();
  await expect(page.locator('[data-permitting-status]')).toContainText('Separate Records review');
  await page.getByRole('button',{name:'Intake cases',exact:true}).click();
  await page.getByRole('button',{name:'Open intake case'}).click();
  await expect(page.getByLabel('Project name',{exact:true})).toHaveValue('Fictional ADU');
});

test('Permitting conflict retains edits and releases the busy form', async ({page}) => {
  await mount(page); await draft(page);
  await page.evaluate(()=>{window.__conflict=true;});
  await page.getByRole('button',{name:'Save intake draft',exact:true}).click();
  await expect(page.locator('[data-permitting-status]')).toContainText('reload and reconcile');
  await expect(page.getByLabel('Project name',{exact:true})).toHaveValue('Fictional ADU');
  await expect(page.getByLabel('Project name',{exact:true})).toBeEditable();
  await expect(page.getByRole('button',{name:'Save intake draft',exact:true})).toBeEnabled();
  await expect(page.locator('[data-permitting][inert]')).toHaveCount(0);
});
