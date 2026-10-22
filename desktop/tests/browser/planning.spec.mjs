import {expect, test} from '@playwright/test';

async function mount(page, publicMode = false) {
  await page.route('http://127.0.0.1:5174/', route => route.fulfill({contentType:'text/html',body:'<!doctype html><html><body></body></html>'}));
  await page.goto('/');
  await page.evaluate(async publicMode => {
    const {createPlanningView} = await import('/src/planning/view.js');
    window.__calls = []; window.__saved = null;
    const ref = {plan_id:'fictional',revision_id:'11111111-1111-4111-8111-111111111111',policy_id:'H1'};
    const policy = {...ref,document_id:'original',citation:'<img src=x onerror=alert(1)>',anchor:'paragraph 1',adopted_on:'2026-01-01',effective_on:'2026-01-01',excerpt:'Fictional housing policy',source_sha256:'a'.repeat(64)};
    const invoke = async(command, args) => {
      window.__calls.push({command,request:args?.request});
      if(command === 'planning_pick_bundle') return {title:'Fictional import'};
      const r = args.request;
      if(r.operation === 'search-policies') return {status:'answered',sources:[policy]};
      if(r.operation === 'sources' || r.operation === 'analyses' || r.operation === 'snapshots') return {items:[],next_offset:null};
      if(r.operation === 'preview-import') return {title:'Fictional import',policies:[policy]};
      if(r.operation === 'import-bundle') return {revision_id:ref.revision_id};
      if(r.operation === 'create-analysis' || r.operation === 'revise-analysis') {
        if(window.__conflict) throw {code:'conflict'};
        window.__saved = {analysis_id:'22222222-2222-4222-8222-222222222222',revision_id:'33333333-3333-4333-8333-333333333333',payload:{...r.payload,policy_context:[policy],reviewer_label:'server-account'}};
        return window.__saved;
      }
      if(r.operation === 'analysis') return window.__saved;
      if(r.operation === 'preview-snapshot') return {text:JSON.stringify({analysis_text:window.__saved.payload.public_summary}),sha256:'b'.repeat(64),visibility:r.payload.visibility};
      if(r.operation === 'create-snapshot') return {version:'snapshot-id',sha256:'b'.repeat(64),visibility:r.payload.visibility};
      if(r.operation === 'original') return {path:'managed/planning/original.txt',sha256:'a'.repeat(64)};
      throw new Error('Unexpected operation '+r.operation);
    };
    const view = createPlanningView(invoke, publicMode); document.body.innerHTML = view.render(); view.bind();
  },publicMode);
  await expect(page.locator('[data-planning-status]')).toHaveText('Saved work loaded.');
}

test('Planning staff source preview, cited draft, explicit review and snapshot preview', async ({page}) => {
  await mount(page);
  await page.getByRole('button',{name:'Choose and preview local source bundle'}).click();
  await expect(page.locator('[data-planning-import]')).toContainText('Fictional import');
  expect(await page.evaluate(() => window.__calls.some(c => c.request?.operation === 'import-bundle'))).toBe(false);
  await page.getByRole('button',{name:'Import this verified source bundle'}).click();
  await expect(page.locator('[data-planning-status]')).toContainText('Imported immutable source revision');
  await page.getByLabel('Policy search',{exact:true}).fill('housing');
  await page.getByRole('button',{name:'Search adopted policies'}).click();
  await expect(page.locator('[data-planning-results]')).toContainText('<img src=x onerror=alert(1)>');
  await expect(page.locator('[data-planning-results] img')).toHaveCount(0);
  await page.getByRole('button',{name:'Select policy for analysis'}).click();
  await page.getByLabel('Project name',{exact:true}).fill('Fictional project');
  await page.getByLabel('Proposal',{exact:true}).fill('Private proposal');
  await page.getByLabel('Staff analysis',{exact:true}).fill('Reviewed staff text');
  await page.getByLabel('Private staff notes',{exact:true}).fill('PRIVATE INTERNAL NOTE');
  await page.getByLabel('Separately edited public summary').fill('Public explanation');
  await page.locator('select[name="audience"]').selectOption('public');
  await page.getByLabel('Review evidence and applicability notes').fill('Sources checked.');
  await page.getByLabel('I reviewed the cited sources', {exact:false}).check();
  await page.getByRole('button',{name:'Save analysis revision'}).click();
  await expect(page.locator('[data-planning-status]')).toContainText('Saved reviewed revision');
  const saved = await page.evaluate(() => window.__calls.find(c=>c.request?.operation === 'create-analysis').request.payload);
  expect(saved.selected_policies).toHaveLength(1);
  expect(saved.review_state).toBe('reviewed');
  expect(saved.reviewer_label).toBeUndefined();
  expect(saved.actor_id).toBeUndefined();
  await page.getByLabel('Snapshot audience').selectOption('public');
  await page.getByRole('button',{name:'Preview saved reviewed revision'}).click();
  await expect(page.locator('[data-planning-preview-output]')).toContainText('Public explanation');
  await expect(page.locator('[data-planning-preview-output]')).not.toContainText('PRIVATE INTERNAL NOTE');
  expect(await page.evaluate(() => window.__calls.some(c=>c.request?.operation==='create-snapshot'))).toBe(false);
  await page.getByRole('button',{name:'Create this immutable snapshot'}).click();
  await expect(page.locator('[data-planning-status]')).toContainText('No Records response was released.');
});

test('Planning public controls cannot read staff work or import', async ({page}) => {
  await mount(page,true);
  await expect(page.locator('[data-planning-analysis]')).toHaveCount(0);
  await expect(page.locator('[data-planning-pick]')).toHaveCount(0);
  await page.getByLabel('Policy search',{exact:true}).fill('housing');
  await page.getByRole('button',{name:'Search adopted policies'}).click();
  await page.getByRole('button',{name:'Save original source'}).click();
  const calls = await page.evaluate(() => window.__calls);
  expect(calls.every(c=>c.command==='planning_public_request')).toBe(true);
  expect(calls.map(c=>c.request.operation)).toEqual(['snapshots','search-policies','original']);
  await expect(page.getByRole('button',{name:'Select policy for analysis'})).toHaveCount(0);
});

test('Planning stale save retains edits and gives reconciliation instructions', async ({page}) => {
  await mount(page);
  await page.getByLabel('Project name',{exact:true}).fill('Keep my edit');
  await page.getByLabel('Proposal',{exact:true}).fill('Proposal');
  await page.evaluate(() => { window.__conflict = true; });
  await page.getByRole('button',{name:'Save analysis revision'}).click();
  await expect(page.locator('[data-planning-status]')).toContainText('reconcile your edits');
  await expect(page.getByLabel('Project name',{exact:true})).toHaveValue('Keep my edit');
});

test('Records Planning selector escapes sources and attaches selected hash once', async ({page}) => {
  await page.route('http://127.0.0.1:5174/',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html><body></body></html>'})); await page.goto('/');
  await page.evaluate(async()=>{
    const mod = await import('/src/records/planning-sources.ts');
    document.body.innerHTML = mod.renderPlanningSources('request-1'); window.__calls=[];
    mod.bindPlanningSources(async(command,args)=>{
      window.__calls.push({command,request:args.request});
      if(args.request.operation==='search-planning') return {results:[{source_id:'source-1',title:'<img src=x>',excerpt:'Public reviewed snapshot',citation:'Fictional citation',sha256:'a'.repeat(64)}],truncated:false};
      return {};
    },async()=>{});
  });
  await page.getByLabel('Planning document search').fill('housing');
  await page.getByRole('button',{name:'Search Planning'}).click();
  await expect(page.locator('[data-source-results] h4')).toHaveText('<img src=x>');
  await expect(page.locator('[data-source-results] img')).toHaveCount(0);
  await page.getByRole('button',{name:'Attach to selected Records request'}).click();
  const calls = await page.evaluate(()=>window.__calls);
  expect(calls[1].request).toEqual({operation:'attach-planning-source',request_id:'request-1',source_id:'source-1',expected_sha256:'a'.repeat(64)});
  expect(calls).toHaveLength(2);
});
