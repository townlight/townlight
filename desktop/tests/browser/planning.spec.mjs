import {expect, test} from '@playwright/test';

async function mount(page, publicMode = false) {
  await page.route('http://127.0.0.1:5174/', route => route.fulfill({contentType:'text/html',body:'<!doctype html><html><body style="font-family:Segoe UI,sans-serif;background:#f3f6f6;margin:30px"></body></html>'}));
  await page.goto('/');
  await page.evaluate(async publicMode => {
    await import('/src/planning/planning.css');
    const {createPlanningView} = await import('/src/planning/view.js');
    const {bindPlanningSources} = await import('/src/records/planning-sources.ts');
    window.__calls = []; window.__saved = null;
    const ref = {plan_id:'fictional',revision_id:'11111111-1111-4111-8111-111111111111',policy_id:'H1'};
    const policy = {...ref,document_id:'original',citation:'<img src=x onerror=alert(1)>',anchor:'paragraph 1',adopted_on:'2026-01-01',effective_on:'2026-01-01',excerpt:'Fictional housing policy',source_sha256:'a'.repeat(64)};
    window.__saved = {analysis_id:'22222222-2222-4222-8222-222222222222',revision_id:'33333333-3333-4333-8333-333333333333',payload:{project_name:'Willow Court housing review',proposal:'Fictional housing proposal for staff review.',analysis_text:'Consider access, housing policy and cited context.',staff_notes:'Private working notes.',public_summary:'Public explanation',audience:'public',review_notes:'Sources checked.',review_state:'draft',policy_context:[policy],linked_sources:[],considerations:[]}};
    const invoke = async(command, args) => {
      window.__calls.push({command,request:args?.request});
      if(command === 'planning_pick_bundle') return {title:'Fictional import'};
      const r = args.request;
      if(r.operation === 'search-policies') return {status:'answered',sources:[policy]};
      if(r.operation === 'analyses') return {items:[{...window.__saved,...window.__saved.payload}],next_offset:null};
      if(r.operation === 'sources' || r.operation === 'snapshots') return {items:[],next_offset:null};
      if(r.operation === 'preview-import') return {title:'Fictional import',policies:[policy]};
      if(r.operation === 'import-bundle') return {revision_id:ref.revision_id};
      if(r.operation === 'create-analysis' || r.operation === 'revise-analysis') {
        if(window.__conflict) throw {code:'conflict'};
        window.__saved = {analysis_id:'22222222-2222-4222-8222-222222222222',revision_id:'33333333-3333-4333-8333-333333333333',payload:{...r.payload,policy_context:[policy],reviewer_label:r.payload.review_state === 'reviewed' ? 'server-account' : '',reviewed_on:r.payload.review_state === 'reviewed' ? '2026-10-22' : null}};
        return window.__saved;
      }
      if(r.operation === 'analysis') return window.__saved;
      if(r.operation === 'preview-snapshot') return {text:JSON.stringify({title:window.__saved.payload.project_name,review_state:'reviewed',reviewer_label:'server-account',reviewed_on:'2026-10-22',analysis_text:r.payload.visibility === 'public' ? window.__saved.payload.public_summary : window.__saved.payload.analysis_text,policy_sources:[policy],disclaimer:'Cited policy context for human review.'}),sha256:'b'.repeat(64),visibility:r.payload.visibility};
      if(r.operation === 'create-snapshot') return {version:'snapshot-id',sha256:'b'.repeat(64),visibility:r.payload.visibility};
      if(r.operation === 'original') return {path:'managed/planning/original.txt',sha256:'a'.repeat(64)};
      throw new Error('Unexpected operation '+r.operation);
    };
    const view = window.__view = createPlanningView(invoke, publicMode); document.body.innerHTML = view.render();
    // Match the shell's binding order; the Records handler must ignore this inventory.
    bindPlanningSources(invoke, async () => {});
    view.bind();
  },publicMode);
  await expect(page.locator('[data-planning-status]')).toHaveText('Saved work loaded.');
}

test('Planning staff source preview, cited draft, explicit review and snapshot preview', async ({page}, testInfo) => {
  await mount(page);
  await page.screenshot({path:testInfo.outputPath('analyses.png'),fullPage:true});
  await page.getByRole('button',{name:'Policy library',exact:true}).click();
  await page.getByText('Source administration',{exact:true}).click();
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
  await page.screenshot({path:testInfo.outputPath('draft.png'),fullPage:true});
  await page.getByRole('button',{name:'Review & export',exact:true}).click();
  await page.getByLabel('Separately edited public summary').fill('Public explanation');
  await page.locator('select[name="audience"]').selectOption('public');
  await page.getByLabel('Review evidence and applicability notes').fill('Sources checked.');
  await expect(page.getByRole('button',{name:'Record review of saved draft'})).toBeDisabled();
  await page.getByRole('button',{name:'Save draft',exact:true}).click();
  await expect(page.locator('[data-planning-status]')).toContainText('Saved draft revision');
  const saved = await page.evaluate(() => window.__calls.find(c=>c.request?.operation === 'create-analysis').request.payload);
  expect(saved.selected_policies).toHaveLength(1);
  expect(saved.review_state).toBe('draft');
  expect(saved.expected_previous_revision).toBeNull();
  expect(saved.reviewer_label).toBeUndefined();
  expect(saved.actor_id).toBeUndefined();
  await page.getByLabel('I reviewed the cited sources', {exact:false}).check();
  await page.getByRole('button',{name:'Record review of saved draft'}).click();
  await expect(page.locator('[data-planning-status]')).toContainText('Saved reviewed revision');
  const reviewed = await page.evaluate(() => window.__calls.find(c=>c.request?.operation === 'revise-analysis').request.payload);
  expect(reviewed.review_state).toBe('reviewed');
  expect(reviewed.expected_previous_revision).toBe('33333333-3333-4333-8333-333333333333');
  expect(reviewed.reviewer_label).toBeUndefined();
  await expect(page.getByLabel('Separately edited public summary')).toBeDisabled();
  await page.screenshot({path:testInfo.outputPath('reviewed.png'),fullPage:true});
  await page.getByLabel('Snapshot audience').selectOption('public');
  await page.getByRole('button',{name:'Preview saved reviewed revision'}).click();
  await expect(page.locator('[data-planning-preview-output]')).toContainText('Public explanation');
  await expect(page.locator('[data-planning-preview-output]')).not.toContainText('PRIVATE INTERNAL NOTE');
  expect(await page.evaluate(() => window.__calls.some(c=>c.request?.operation==='create-snapshot'))).toBe(false);
  await page.screenshot({path:testInfo.outputPath('public-preview.png'),fullPage:true});
  await page.getByRole('button',{name:'Create reviewed snapshot'}).click();
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
  await page.getByRole('button',{name:'New analysis',exact:true}).click();
  await page.getByLabel('Project name',{exact:true}).fill('Keep my edit');
  await page.getByLabel('Proposal',{exact:true}).fill('Proposal');
  await page.evaluate(() => { window.__conflict = true; });
  await page.getByRole('button',{name:'Save draft',exact:true}).click();
  await expect(page.locator('[data-planning-status]')).toContainText('reconcile your edits');
  await expect(page.getByLabel('Project name',{exact:true})).toHaveValue('Keep my edit');
});

test('Planning keeps a draft through browsing and shell renders; edits invalidate a reviewed preview', async ({page}) => {
  await mount(page);
  await page.getByRole('button',{name:'Continue analysis'}).click();
  await page.getByLabel('Staff analysis',{exact:true}).fill('Keep this unsaved staff analysis');
  await page.getByRole('button',{name:'Policies & evidence',exact:true}).click();
  await page.getByLabel('Staff consideration (optional)').fill('Keep this applicability note');
  await page.locator('[data-consideration] select').selectOption('supporting');
  await page.getByRole('button',{name:'Search policy library',exact:true}).click();
  await page.getByRole('button',{name:'Return to open analysis'}).click();
  await page.evaluate(() => { document.body.innerHTML = window.__view.render(); window.__view.bind(); });
  await expect(page.locator('[data-planning-status]')).toHaveText('Saved work loaded.');
  await expect(page.getByLabel('Staff consideration (optional)')).toHaveValue('Keep this applicability note');
  await expect(page.locator('[data-consideration] select')).toHaveValue('supporting');
  await page.getByRole('button',{name:'Analysis',exact:true}).click();
  await expect(page.getByLabel('Staff analysis',{exact:true})).toHaveValue('Keep this unsaved staff analysis');
  await page.getByRole('button',{name:'Analyses',exact:true}).click();
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('button',{name:'New analysis',exact:true}).click();
  await page.getByRole('button',{name:'Open analysis',exact:true}).click();
  await expect(page.getByLabel('Staff analysis',{exact:true})).toHaveValue('Keep this unsaved staff analysis');
  for (const width of [1280,600]) {
    await page.setViewportSize({width,height:1000});
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.getByRole('button',{name:'Review & export',exact:true}).click();
  await page.getByRole('button',{name:'Save draft',exact:true}).click();
  await page.getByLabel('I reviewed the cited sources',{exact:false}).check();
  await page.getByRole('button',{name:'Record review of saved draft'}).click();
  await page.getByRole('button',{name:'Preview saved reviewed revision'}).click();
  await expect(page.getByRole('button',{name:'Create reviewed snapshot'})).toBeVisible();
  await page.getByRole('button',{name:'Edit analysis',exact:true}).click();
  await page.getByRole('button',{name:'Analysis',exact:true}).click();
  await page.getByLabel('Staff analysis',{exact:true}).fill('This change needs another review');
  await page.getByRole('button',{name:'Review & export',exact:true}).click();
  await expect(page.getByRole('button',{name:'Preview saved reviewed revision'})).toBeDisabled();
  await expect(page.getByRole('button',{name:'Create reviewed snapshot'})).toHaveCount(0);
  expect(await page.evaluate(() => window.__calls.some(c=>c.request?.operation==='create-snapshot'))).toBe(false);
  await page.evaluate(() => { window.__view.reset(); document.body.innerHTML = window.__view.render(); window.__view.bind(); });
  await expect(page.locator('[data-planning-status]')).toHaveText('Saved work loaded.');
  await expect(page.getByLabel('Staff analysis',{exact:true})).toHaveValue('');
  await expect(page.getByRole('button',{name:'Open analysis',exact:true})).toHaveCount(1); // Saved inventory, no retained draft tab.
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
