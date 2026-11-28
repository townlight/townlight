import { test, expect } from '@playwright/test';

test('Elections view preserves exact approved text, correction target, settings, and account reset', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/elections-publication-fixture', route => route.fulfill({
    contentType: 'text/html', body: '<!doctype html><html><body></body></html>',
  }));
  await page.goto('/elections-publication-fixture');
  await page.evaluate(async () => {
    const { createElectionsView } = await import('/src/elections/view.ts');
    const id = '11111111-1111-4111-8111-111111111111';
    const articleId = '22222222-2222-4222-8222-222222222222';
    const officialId = '33333333-3333-4333-8333-333333333333';
    window.calls = [];
    window.seeds = [];
    window.admin = false;
    window.missingLink = false;
    window.hold = false;
    const fixture = { id, revision: 2, sha256: 'a'.repeat(64), private_notes: 'SECRET-NOTE',
      content: { id, revision: 2, title: '<img src=x onerror=alert(1)> Fictional checklist',
        jurisdiction: 'Example City', election: 'Fictional Election', description: 'Safe public text',
        official_source: 'https://example.gov/checklist', source_version: '2' },
      approval: { actor_id: officialId }, links: [] };
    window.fixture = fixture;
    const invoke = async (command, envelope) => {
      if (command !== 'elections_request') throw new Error('wrong native command');
      const request = envelope.request;
      window.calls.push(request);
      if (request.operation === 'list') return { result: [fixture] };
      if (request.operation === 'get') {
        if (window.hold) return await new Promise(resolve => { window.releaseOld = () => resolve({ result: fixture }); });
        return { result: request.revision === 1 ? { ...fixture, revision: 1,
          links: window.missingLink ? [] : [{ article_id: articleId }] } : fixture };
      }
      if (request.operation === 'source') return { result: fixture };
      if (request.operation === 'settings') return { result: { revision: 1,
        elections_official_ids: [], candidates: [{ id: officialId, name: 'Separate official',
          email: 'official@example.org', native_role: 'clerk' }] } };
      if (request.operation === 'save-settings') return { result: {} };
      if (['approve', 'edit', 'create', 'receipts'].includes(request.operation)) return { result: fixture };
      throw new Error('unexpected operation ' + request.operation);
    };
    window.view = createElectionsView(invoke, {
      get isAdmin() { return window.admin; }, openCommunications(seed) { window.seeds.push(seed); },
    });
    document.body.innerHTML = window.view.render();
    await window.view.bind(document);
  });
  await expect(page.locator('[name=private_notes]')).toHaveValue('SECRET-NOTE');
  await expect(page.locator('[data-elections-public-preview]')).not.toContainText('SECRET-NOTE');
  await expect(page.locator('img')).toHaveCount(0);
  await expect(page.locator('[data-elections-settings]')).toBeHidden();
  expect(await page.evaluate(() => window.calls.some(call => call.operation === 'settings'))).toBe(false);
  await page.locator('[data-elections-comms]').click();
  await expect.poll(() => page.evaluate(() => window.seeds.length)).toBe(1);
  const seed = await page.evaluate(() => window.seeds[0]);
  expect(seed.article_id).toBe('22222222-2222-4222-8222-222222222222');
  expect(seed.body).toBe('Jurisdiction: Example City\nElection: Fictional Election\n\nSafe public text\n\nOfficial source: https://example.gov/checklist\nSource version: 2');
  expect(JSON.stringify(seed)).not.toContain('SECRET-NOTE');
  await page.evaluate(() => { window.missingLink = true; });
  await page.locator('[data-elections-comms]').click();
  await expect(page.locator('[data-elections-status]')).toContainText('Link the existing published article');
  expect(await page.evaluate(() => window.seeds.length)).toBe(1);
  await page.locator('[data-elections-history]').selectOption('1');
  await expect(page.locator('[data-elections-form] button[type=submit]')).toBeDisabled();
  await expect(page.locator('[data-elections-comms]')).toBeDisabled();
  await page.locator('[data-elections-history]').selectOption('2');
  await expect(page.locator('[data-elections-comms]')).toBeEnabled();
  await page.locator('[data-elections-confirm]').check();
  await page.locator('[data-elections-approve]').click();
  await expect(page.locator('[data-elections-status]')).toHaveText('Approved');
  await expect(page.locator('[data-elections-confirm]')).not.toBeChecked();
  const approval = await page.evaluate(() => window.calls.find(call => call.operation === 'approve'));
  expect(approval.payload).toEqual({ expected_revision: 2, expected_sha256: 'a'.repeat(64), confirm: true });
  await page.evaluate(async () => {
    window.admin = true;
    document.body.innerHTML = window.view.render();
    await window.view.bind(document);
  });
  await expect(page.locator('[data-elections-settings]')).toBeVisible();
  await page.locator('[data-elections-candidates] input').check();
  await page.locator('[data-elections-save-settings]').click();
  await expect(page.locator('[data-elections-status]')).toContainText('settings saved');
  const setting = await page.evaluate(() => window.calls.find(call => call.operation === 'save-settings'));
  expect(setting.payload).toEqual({ expected_revision: 1,
    elections_official_ids: ['33333333-3333-4333-8333-333333333333'] });
  await page.evaluate(() => { window.hold = true; });
  await page.locator('[data-elections-refresh]').click();
  await expect.poll(() => page.evaluate(() => typeof window.releaseOld)).toBe('function');
  await page.evaluate(() => { window.view.reset(); window.releaseOld(); });
  await expect(page.locator('body')).not.toContainText('SECRET-NOTE');
  await expect(page.locator('[data-townlight-elections]')).toBeEmpty();
  expect(errors).toEqual([]);
});
