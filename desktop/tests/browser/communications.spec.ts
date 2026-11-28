import { test, expect } from '@playwright/test';
import { Buffer } from 'node:buffer';

const ID = '22222222-2222-4222-8222-222222222222';
const HOSTILE = '<img src=x onerror=window.pwned=true>';
const H1 = 'a'.repeat(64);
const H2 = 'b'.repeat(64);
const H3 = 'c'.repeat(64);
const ATTACHMENT = 'Townlight attachment bytes\nline 2';

async function mount(page) {
  await page.route('**/311-fixture', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html><body></body>' })
  );
  await page.goto('/311-fixture');
  await page.evaluate(async ({ ID, HOSTILE, H1, H2, H3, ATTACHMENT }) => {
    const w = window as any;
    w.calls = [];
    w.openedRecords = undefined;
    w.pwned = false;
    w.article = {
      id: ID,
      kind: 'announcement',
      current_revision: 5,
      state: 'draft',
      revision: {
        title: HOSTILE,
        body: HOSTILE,
        sha256: H1,
        language: 'en',
        access_review: { reviewed: true },
        source_refs: [{ kind: 'notice', id: HOSTILE, title: HOSTILE, eligible: true }],
        attachment_refs: [],
      },
    };
    const invoke = async (name: string, input: any) => {
      w.calls.push({ name, input });
      if (name !== 'communications_request') throw new Error(`unexpected native ${name}`);
      const request = input.request;
      const op = request.operation;
      if (op === 'articles') {
        if (w.holdList) {
          w.holdList = false;
          return new Promise(resolve => { w.releaseList = resolve; });
        }
        return [{ id: ID, title: HOSTILE, state: 'draft', current_revision: 5, revision: { title: HOSTILE, sha256: H1 } }];
      }
      if (op === 'article') {
        if (request.id !== ID) throw new Error('article id');
        return w.article;
      }
      if (op === 'source') {
        return { reference: { kind: request.payload.kind, id: request.payload.id, title: 'Approved source', eligible: w.eligible !== false } };
      }
      if (op === 'access-review') {
        if (request.payload?.title !== 'Water notice' || request.payload?.access_reviewed !== false) throw new Error('access-review payload');
        return { report: { pass: true, findings: [] } };
      }
      if (op === 'create') {
        const payload = request.payload;
        if (payload.title !== 'Water notice' || payload.body !== 'Body text' || payload.kind !== 'announcement') throw new Error('create payload');
        w.article = { ...w.article, current_revision: 7, revision: { ...w.article.revision, title: payload.title, body: payload.body, sha256: H1 } };
        return { id: ID };
      }
      if (op === 'review') {
        if (request.id !== ID || request.payload.expected_revision !== 7 || request.payload.note !== 'Ready for review') throw new Error('review payload');
        return { ok: true };
      }
      if (op === 'approve') {
        if (request.id !== ID || request.payload.expected_revision !== 7 || request.payload.expected_sha256 !== H1 || request.payload.confirm !== true) throw new Error('approve payload');
        return { ok: true };
      }
      if (op === 'schedule') {
        const payload = request.payload;
        if (request.id !== ID || payload.expected_revision !== 7 || payload.expected_sha256 !== H1) throw new Error('schedule revision payload');
        if (payload.channels.join(',') !== 'website,email' || payload.action !== 'publish' || payload.confirm !== true) throw new Error('schedule action payload');
        return { ok: true };
      }
      if (op === 'attach') {
        const payload = request.payload;
        if (request.id !== ID || payload.expected_revision !== 5) throw new Error('attach revision payload');
        if (payload.name !== 'minutes.txt' || payload.media_type !== 'text/plain' || payload.public !== false) throw new Error('attach metadata payload');
        if (payload.content_base64 !== btoa(ATTACHMENT)) throw new Error('attach content payload');
        w.article = { ...w.article, current_revision: 9, revision: { ...w.article.revision, sha256: H2, attachment_refs: [{ attachment_id: 'att-1', name: payload.name, media_type: payload.media_type, public: payload.public }] } };
        return { ok: true };
      }
      if (op === 'archive-records') {
        if (request.id !== ID || request.payload.expected_revision !== 9 || request.payload.expected_sha256 !== H2 || request.payload.confirm !== true) throw new Error('archive payload');
        return { records_request_id: 'rec-42', tracking: 'TL-REC-9', sha256: H3 };
      }
      throw new Error(`unexpected operation ${op}`);
    };
    const mod = await import('/src/communications/view.ts');
    const view = mod.createCommunicationsView(invoke, { openRecords: (id: string) => { w.openedRecords = id; } });
    w.view = view;
    document.body.innerHTML = view.render();
    view.bind();
  }, { ID, HOSTILE, H1, H2, H3, ATTACHMENT });
  await expect(page.locator('[data-comms-view] [data-article-id]').first()).toBeVisible();
}

  test('account reset discards pending list and restores controls', async ({ page }) => {
    await mount(page);
    await page.evaluate(() => { (window as any).holdList = true; });
    await page.locator('[data-refresh]').click();
    await expect.poll(() => page.evaluate(() => typeof (window as any).releaseList)).toBe('function');
    await page.evaluate(({ ID, H1 }) => {
      const w = window as any;
      w.view.reset();
      document.body.innerHTML = w.view.render();
      w.view.bind();
      w.releaseList([{ id: ID, title: 'STALE_ACCOUNT_RESPONSE', state: 'draft', current_revision: 5, revision: { title: 'STALE_ACCOUNT_RESPONSE', sha256: H1 } }]);
    }, { ID, H1 });
    await expect.poll(() => page.locator('[data-comms-view]').getAttribute('data-busy')).not.toBe('true');
    const root = page.locator('[data-comms-view]');
    await expect(root.locator('[name="title"]')).toHaveValue('');
    await expect(root.locator('[name="body"]')).toHaveValue('');
    await expect(root.locator('[data-sources]')).toBeEmpty();
    await expect(root).not.toContainText('STALE_ACCOUNT_RESPONSE');
    const currentId = await root.getAttribute('data-current-id');
    expect(currentId === null || currentId === '').toBe(true);
    await expect(page.locator('[data-refresh]')).toBeEnabled();
  });

  test('approved source seed', async ({ page }) => {
    await mount(page);
    await page.evaluate(async ({ ID, HOSTILE }) => {
      await (window as any).view.prepareSource({ kind: 'elections', id: '11111111-1111-4111-8111-111111111111', title: HOSTILE, body: HOSTILE, article_id: ID });
    }, { ID, HOSTILE });
    const root = page.locator('[data-comms-view]');
    await expect(root).toHaveAttribute('data-current-id', ID);
    await expect(root).toHaveAttribute('data-current-revision', '5');
    await expect(root.locator("[name=title]")).toHaveValue(HOSTILE);
    await expect(root.locator("[name=body]")).toHaveValue(HOSTILE);
    await expect(root.locator('[data-sources]')).toContainText('elections');
    await expect(root.locator('[data-sources]')).toContainText('11111111-1111-4111-8111-111111111111');
    await expect(root.locator('[name=access_reviewed]')).not.toBeChecked();
    const ops = await page.evaluate(() => (window as any).calls.map((c: any) => c.input.request.operation));
    const sourceAt = ops.indexOf('source');
    expect(sourceAt).toBeGreaterThanOrEqual(0);
    expect(sourceAt).toBeLessThan(ops.indexOf('article'));
    for (const op of ['create', 'edit', 'review', 'approve', 'schedule']) expect(ops).not.toContain(op);
    const error = await page.evaluate(async ({ ID, HOSTILE }) => {
      (window as any).eligible = false;
      try {
        await (window as any).view.prepareSource({ kind: 'elections', id: '11111111-1111-4111-8111-111111111111', title: HOSTILE, body: HOSTILE, article_id: ID });
        return '';
      } catch (e: any) {
        return String(e && e.message || e);
      }
    }, { ID, HOSTILE });
    expect(error).toContain('could not be verified');
  });

const requestFor = (page, operation: string) => page.evaluate((operation) => {
  const call = (window as any).calls.find((entry: any) => entry.input.request.operation === operation);
  return call?.input.request;
}, operation);

test('create, review, approve and schedule send revision guards and channels', async ({ page }) => {
  await mount(page);
  await page.locator('[data-new]').click();
  await page.locator('#comms-title').fill('Water notice');
  await page.locator('#comms-body').fill('Body text');
  await page.locator('#comms-kind').selectOption('announcement');
  await expect(page.locator('label[for="comms-access-reviewed"]')).toContainText('I reviewed accessibility findings');
  await page.locator('[data-access-review]').click();
  await expect(page.locator('[data-status]')).toContainText('Accessibility report loaded');
  await page.locator('#comms-access-reviewed').check();
  await page.locator('form[data-draft] button[type=submit]').click();
  await expect(page.locator('[data-status]')).toContainText('Article saved');
  await expect(page.locator('[data-comms-view]')).toHaveAttribute('data-current-revision', '7');
  await expect(page.locator('[data-current]')).toContainText(`Revision: ${H1}`);
  await page.locator('#comms-review-note').fill('Ready for review');
  await page.locator('form[data-review] button[type=submit]').click();
  await expect(page.locator('[data-status]')).toContainText('Article sent for review');
  await page.locator('#comms-approve-confirm').check();
  await page.locator('[data-approve]').click();
  await expect(page.locator('[data-status]')).toContainText('Revision approved');
  await page.locator('#comms-due-at').fill('2026-01-15T10:00');
  await page.locator('#comms-email').check();
  await page.locator('#comms-action').selectOption('publish');
  await page.locator('#comms-schedule-confirm').check();
  await page.locator('form[data-schedule] button[type=submit]').click();
  await expect(page.locator('[data-status]')).toContainText('Article scheduled');

  const review = await requestFor(page, 'review');
  expect(review).toMatchObject({ id: ID, payload: { expected_revision: 7, note: 'Ready for review' } });
  const approve = await requestFor(page, 'approve');
  expect(approve).toMatchObject({ id: ID, payload: { expected_revision: 7, expected_sha256: H1, confirm: true } });
  const schedule = await requestFor(page, 'schedule');
  expect(schedule.payload).toMatchObject({ expected_revision: 7, expected_sha256: H1, action: 'publish', confirm: true });
  expect(schedule.payload.channels).toEqual(['website', 'email']);
  expect(schedule.payload.due_at).toBe(new Date('2026-01-15T10:00').toISOString());
});

test('attachment payload, archive records handoff and hostile text escaping', async ({ page }) => {
  await mount(page);
  await page.locator('[data-article-id]').first().click();
  await expect(page.locator('[data-status]')).toContainText('Article loaded');
  await expect(page.locator('#comms-title')).toHaveValue(HOSTILE);
  await expect(page.locator('#comms-body')).toHaveValue(HOSTILE);
  await expect(page.locator('[data-current]')).toContainText(`Title: ${HOSTILE}`);
  await expect(page.locator('[data-sources]')).toContainText(`notice/${HOSTILE}`);
  await expect(page.locator('img')).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).pwned)).toBeFalsy();

  await page.locator('form[data-attachment] input[type=file]').setInputFiles({
    name: 'minutes.txt', mimeType: 'text/plain', buffer: Buffer.from(ATTACHMENT),
  });
  await page.locator('form[data-attachment] button[type=submit]').click();
  await expect(page.locator('[data-status]')).toContainText('Attachment added');
  const attach = await requestFor(page, 'attach');
  expect(attach).toMatchObject({ id: ID, payload: { expected_revision: 5, name: 'minutes.txt', media_type: 'text/plain', public: false } });
  expect(Buffer.from(attach.payload.content_base64, 'base64').toString()).toBe(ATTACHMENT);
  await expect(page.locator('[data-comms-view]')).toHaveAttribute('data-current-revision', '9');
  await expect(page.locator('[data-current]')).toContainText(`Revision: ${H2}`);
  await expect(page.locator('[data-attachments]')).toContainText('minutes.txt (text/plain)');

  await page.locator('[data-archive-records]').click();
  await expect(page.locator('[data-status]')).toContainText('Records request created');
  const archive = await requestFor(page, 'archive-records');
  expect(archive).toEqual({ operation: 'archive-records', id: ID, payload: { expected_revision: 9, expected_sha256: H2, confirm: true } });
  await expect(page.locator('[data-records]')).toContainText('Tracking: TL-REC-9');
  await expect(page.locator('[data-records]')).toContainText(`Hash: ${H3}`);
  await page.locator('[data-records] button[data-open-records]').click();
  await expect.poll(() => page.evaluate(() => (window as any).openedRecords)).toBe('rec-42');
});

test('preview escapes hostile content and history shows actual publication delivery status', async ({ page }) => {
  await mount(page);
  const dueAt = '2026-02-01T12:00:00.000Z';
  const createdAt = '2026-02-01T12:01:00.000Z';
  const receipt = 'https://city.example/publication-receipts/pub-5';
  await page.evaluate(({ dueAt, createdAt, receipt, H1 }) => {
    const w = window as any;
    w.article = {
      ...w.article,
      history: [{
        state: 'failed',
        action: 'publish',
        revision: 5,
        due_at: dueAt,
        created_at: createdAt,
        last_error: 'publication failed',
        website_receipt: { url: receipt },
        email_summary: { sent: 1, remaining: 0, failed: 1, uncertain: 1, skipped: 0 },
      }],
      events: [{
        kind: 'edited',
        revision: 5,
        actor: 'clerk',
        created_at: createdAt,
      }],
    };
  }, { dueAt, createdAt, receipt, H1 });

  await page.locator('[data-article-id]').first().click();
  await expect(page.locator('[data-status]')).toContainText('Article loaded');

  await page.locator('[data-preview-draft]').click();
  await expect(page.locator('[data-preview]')).toContainText(`Title: ${HOSTILE}`);
  await expect(page.locator('[data-preview] > div')).toHaveText(HOSTILE);
  await expect(page.locator('[data-preview] img')).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).pwned)).toBeFalsy();

  const history = page.locator('[data-history]');
  await expect(history).toContainText(`state=failed action=publish revision=5 due=${dueAt} time=${createdAt}`);
  await expect(history).toContainText('last_error: publication failed');
  await expect(history).toContainText(`website_receipt: ${receipt}`);
  await expect(history).toContainText('email_summary: sent(SMTP accepted)=1 remaining=0 failed=1 uncertain=1 skipped=0');
  await expect(history).toContainText('kind=edited revision=5 actor=clerk');
});
