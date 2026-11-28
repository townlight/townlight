import { test, expect } from '@playwright/test';
import { saveUtilityDraft, approveUtilityReply, retryUtilityReply, readUtilityWorkpaper } from '../installed/ule-utilities.mjs';

test('utilities reply flow uses actual view and exact envelopes', async ({ page }) => {
  await page.route('**/utilities-fixture', route => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html><body></body></html>' }));
  await page.goto('/utilities-fixture');
  await page.evaluate(async () => {
    const { createUtilitiesView } = await import('/src/utilities/view.ts');
    const calls = [];
    window.__calls = calls;
    let workpaper = null;
    const fakeInvoke = async (command, payload) => {
      calls.push({ command, payload });
      if (command !== 'utilities_request') throw new Error('unexpected command ' + command);
      if (!payload || typeof payload !== 'object' || !payload.request || typeof payload.request.operation !== 'string') throw new Error('bad request envelope');
      const op = payload.request.operation;
      if (op === 'policies') return { result: [{ policy_id: 'payment-options', version: 3, title: '<img src=x onerror=alert(1)>Payment options', text: 'Pay plan text', citation: '7.3' }] };
      if (op === 'open-request') {
        const id = payload.request.request_id;
        if (id === '22222222-2222-4222-8222-222222222222') throw new Error('request not found');
        return { result: { request: { request_id: id, description: 'Question: Can I pay in installments?' }, workpaper: workpaper ? { ...workpaper } : null } };
      }
      if (op === 'save-draft') {
        const p = payload.request.payload;
        workpaper = { ...(workpaper || {}), body: p.body, private_notes: p.private_notes, policy_id: p.policy_id, policy_version: p.policy_version, status: 'draft', revision: (workpaper?.revision ?? 0) + 1, delivered: false };
        return { result: { workpaper: { ...workpaper }, revision: workpaper.revision } };
      }
      if (op === 'approve-reply') {
        workpaper = { ...(workpaper || {}), status: 'approved', delivered: false, error: 'response lost', revision: (workpaper?.revision ?? 0) + 1 };
        return { result: { status: 'approved', delivered: false, error: 'response lost', workpaper: { ...workpaper } } };
      }
      if (op === 'retry-reply') {
        workpaper = { ...(workpaper || {}), status: 'delivered', delivered: true, comment_id: 'receipt-123', approved_by_display_name: 'Avery Clerk', revision: workpaper?.revision ?? 0 };
        return { result: { delivered: true, workpaper: { ...workpaper } } };
      }
      throw new Error('unexpected operation ' + op);
    };
    window.__admin = false;
    const view = createUtilitiesView(fakeInvoke, { get isAdmin() { return window.__admin === true; } });
    document.body.innerHTML = view.render();
    view.bind(document);
    window.__view = view;
  });

  const status = page.locator('[data-role="status"]');
  const body = page.locator('[data-role="body"]');
  const notes = page.locator('[data-role="private-notes"]');
  const approve = page.locator('[data-action="approve"]');
  const retry = page.locator('[data-action="retry"]');
  const caseSection = page.locator('[data-role="case"]');
  const receipt = page.locator('[data-role="receipt"]');
  const state = page.locator('[data-role="state"]');

  await expect(page.locator('[data-role="policy-title"]')).toHaveText('<img src=x onerror=alert(1)>Payment options');
  await expect(page.locator('[data-role="policy-preview"] img')).toHaveCount(0);
  await expect(page.locator('[data-role="policy-citation"]')).toContainText('7.3');
  await expect(page.locator('[data-role="admin-details"]')).toBeHidden();

  await page.locator('[data-role="request-id"]').fill('11111111-1111-4111-8111-111111111111');
  await page.locator('[data-action="open"]').click();
  await expect(status).toContainText('Request opened.');
  await expect(caseSection).toBeVisible();
  await expect(page.locator('[data-role="request-summary"]')).toContainText('Question: Can I pay in installments?');

  await saveUtilityDraft(page, {
    requestId: '11111111-1111-4111-8111-111111111111',
    policyId: 'payment-options',
    policyVersion: 3,
    body: 'Public reply body',
    privateNotes: 'Private note',
  });

  let calls = await page.evaluate(() => window.__calls);
  expect(calls.every(c => c.command === 'utilities_request' && c.payload.request && typeof c.payload.request.operation === 'string')).toBe(true);
  const firstSave = calls.filter(c => c.payload.request.operation === 'save-draft')[0];
  expect(firstSave.payload.request.request_id).toBe('11111111-1111-4111-8111-111111111111');
  expect(firstSave.payload.request.payload).toEqual({ policy_id: 'payment-options', policy_version: 3, body: 'Public reply body', private_notes: 'Private note', expected_revision: null });

  await page.locator('[data-role="confirm"]').check();
  await expect(approve).toBeEnabled();
  await body.fill('Edited body');
  await expect(approve).toBeDisabled();
  await page.locator('[data-action="save"]').click();
  await expect(status).toContainText('Private draft saved.');
  await expect(approve).toBeEnabled();

  const pendingResult = await approveUtilityReply(page, {
    requestId: '11111111-1111-4111-8111-111111111111',
    body: 'Edited body',
    privateNotes: 'Private note',
    policyCitation: '7.3',
    approverName: 'Avery Clerk',
  });
  expect(pendingResult.pending).toBe(true);
  expect(pendingResult.delivered).toBe(false);
  await expect(status).toContainText('Not delivered yet');
  await expect(state).toContainText('Approved — delivery pending');
  await expect(receipt).toContainText('Delivery pending');
  await expect(receipt).not.toContainText('receipt-123');

  calls = await page.evaluate(() => window.__calls);
  const approval = calls.find(c => c.payload.request.operation === 'approve-reply');
  expect(approval.payload.request.request_id).toBe('11111111-1111-4111-8111-111111111111');
  expect(approval.payload.request.payload).toEqual({ expected_revision: 2, confirm: true });

  await expect(retry).toBeEnabled();
  const retryResult = await retryUtilityReply(page, {
    requestId: '11111111-1111-4111-8111-111111111111',
  });
  expect(retryResult.delivered).toBe(true);
  await expect(status).toContainText('Reply delivered.');
  await expect(state).toContainText('Delivered');
  await expect(receipt).toContainText('receipt-123');
  await expect(receipt).toContainText('Avery Clerk');

  calls = await page.evaluate(() => window.__calls);
  const retryCall = calls.find(c => c.payload.request.operation === 'retry-reply');
  expect(retryCall.payload.request.request_id).toBe('11111111-1111-4111-8111-111111111111');
  expect(retryCall.payload.request.payload).toEqual({ expected_revision: 3 });

  await readUtilityWorkpaper(page, {
    requestId: '11111111-1111-4111-8111-111111111111',
    body: 'Edited body',
    privateNotes: 'Private note',
    policyCitation: '7.3',
    approverName: 'Avery Clerk',
    delivered: true,
  });
  await expect(body).toHaveValue('Edited body');
  await expect(notes).toHaveValue('Private note');
  await expect(page.locator('[data-role="policy-select"]')).toHaveValue('payment-options::3');
  await expect(state).toContainText('Delivered');

  await page.evaluate(() => { window.__admin = true; window.__view.reset(); });
  await page.evaluate(() => { window.__view.bind(document); window.__view.bind(document); });
  await expect(page.locator('[data-role="admin-details"]')).toBeVisible();
  await expect(page.locator('[data-role="request-id"]')).toHaveValue('');
  await expect(body).toHaveValue('');
  await expect(notes).toHaveValue('');
  await expect(caseSection).toBeHidden();
  await expect(approve).toBeDisabled();
  await expect(receipt).toBeEmpty();

  await page.evaluate(() => { window.__admin = false; window.__view.reset(); });
  await page.evaluate(() => { document.body.innerHTML = window.__view.render(); });
  await page.evaluate(() => { window.__view.bind(document); });
  await expect(page.locator('[data-role="admin-details"]')).toBeHidden();
  await expect(caseSection).toBeHidden();

  await page.locator('[data-role="request-id"]').fill('22222222-2222-4222-8222-222222222222');
  await page.locator('[data-action="open"]').click();
  await expect(status).toContainText('Could not open request: request not found');
  await expect(caseSection).toBeHidden();
  await expect(approve).toBeDisabled();
});

test('utilities stale async open ignored after reset', async ({ page }) => {
  await page.route('**/utilities-fixture', route => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html><body></body></html>' }));
  await page.goto('/utilities-fixture');
  await page.evaluate(async () => {
    const { createUtilitiesView } = await import('/src/utilities/view.ts');
    const fakeInvoke = async (command, payload) => {
      if (command !== 'utilities_request') throw new Error('unexpected command ' + command);
      const op = payload.request.operation;
      if (op === 'policies') return { result: [] };
      if (op === 'open-request') {
        return await new Promise(resolve => { window.__resolveOpen = resolve; });
      }
      throw new Error('unexpected operation ' + op);
    };
    const view = createUtilitiesView(fakeInvoke, { isAdmin: false });
    document.body.innerHTML = view.render();
    view.bind(document);
    window.__view = view;
  });

  const caseSection = page.locator('[data-role="case"]');
  const body = page.locator('[data-role="body"]');
  const notes = page.locator('[data-role="private-notes"]');
  const summary = page.locator('[data-role="request-summary"]');
  const receipt = page.locator('[data-role="receipt"]');
  const open = page.locator('[data-action="open"]');

  await page.locator('[data-role="request-id"]').fill('11111111-1111-4111-8111-111111111111');
  await open.click();
  await page.evaluate(() => { window.__view.reset(); });
  await page.evaluate(() => {
    window.__resolveOpen({ result: { request: { request_id: '11111111-1111-4111-8111-111111111111', description: 'Stale summary' }, workpaper: { body: 'Stale body', private_notes: 'Stale notes' } } });
  });
  await page.evaluate(async () => { await Promise.resolve(); await Promise.resolve(); });

  await expect(body).toHaveValue('');
  await expect(notes).toHaveValue('');
  await expect(summary).toBeEmpty();
  await expect(receipt).toBeEmpty();
  await expect(caseSection).toBeHidden();
  await expect(open).toBeEnabled();
});
