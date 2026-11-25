import { test, expect } from '@playwright/test';

async function mount(page) {
  await page.route('**/311-fixture', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html><body></body>' })
  );
  await page.goto('/311-fixture');
  await page.evaluate(async () => {
    const w = window as any;
    w.calls = [];
    w.rev = 4;
    w.fail = false;
    const id = '11111111-1111-4111-8111-111111111111';
    const description = '<img src=x onerror=window.pwned=true>';
    const invoke = async (command: string, args: any) => {
      w.calls.push({ command, args });
      const request = args.request;
      const op = request.operation;
      if (op === 'categories') return { categories: [{ code: 'roads', name: 'Roads', department: 'Works', active: true }] };
      if (op === 'assignees') return { assignees: [] };
      if (op === 'requests') return { requests: [{ id, tracking: 'TL311-test', description, state: 'submitted', department: 'Works', revision: w.rev }] };
      if (op === 'request') return { request: { id, tracking: 'TL311-test', description, state: 'submitted', department: 'Works', revision: w.rev, events: [], attachments: [] } };
      if (op === 'comment') {
        if (w.fail) throw new Error('409 stale revision');
        w.rev += 1;
        return { ok: true };
      }
      if (op === 'archive') return { receipt: { path: 'C:\\exports\\request.zip', sha256: 'a'.repeat(64), size_bytes: 100 } };
      return {};
    };
    const mod = await import('/src/service-requests/view.ts');
    const view = mod.createServiceRequestsView(invoke, { isAdmin: true });
    document.body.innerHTML = view.render();
    view.bind();
  });
  await expect(page.locator('[data-service-requests-view] [data-open]').first()).toBeVisible();
}

const commentRevisions = (page) =>
  page.evaluate(() => (window as any).calls
    .filter((call: any) => call.args.request.operation === 'comment')
    .map((call: any) => call.args.request.payload.expected_revision));

test('comment revision, stale draft, refresh, archive', async ({ page }) => {
  await mount(page);
  await page.locator('[data-open]').first().click();
  const form = page.locator('[data-comment]').first();
  await expect(form).toBeVisible();
  const textarea = form.locator('textarea').first();
  await textarea.fill('resident note');
  await page.evaluate(() => { (window as any).fail = true; });
  await form.locator('button').first().click();
  await expect(page.locator('[data-status]').first()).toContainText(/changed|stale/i);
  expect(await textarea.inputValue()).toBe('resident note');
  expect((await commentRevisions(page)).slice(-1)[0]).toBe(4);

  await page.evaluate(() => { (window as any).rev = 5; (window as any).fail = false; });
  await page.locator('[data-refresh-detail]').first().click();
  await expect(page.locator('[data-status]').first()).toContainText('Request detail refreshed.');
  await form.locator('button').first().click();
  await expect(page.locator('[data-status]').first()).toContainText('Comment added.');
  expect((await commentRevisions(page)).slice(-1)[0]).toBe(5);

  await page.locator('[data-archive]').first().click();
  await expect(page.locator('[data-status]').first()).toContainText('C:\\exports\\request.zip');
});

test('hostile description stays literal and no document listener leak', async ({ page }) => {
  await mount(page);
  const view = page.locator('[data-service-requests-view]').first();
  await expect(view).toContainText('<img src=x onerror=window.pwned=true>');
  await expect(page.locator('img')).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).pwned)).toBeFalsy();

  await page.waitForTimeout(100);
  await page.evaluate(() => document.querySelector('[data-service-requests-view]')?.remove());
  await page.evaluate(() => {
    const form = document.createElement('form');
    form.setAttribute('data-comment', '');
    form.innerHTML = '<textarea name="message">unrelated</textarea><button type="submit">Send</button>';
    form.addEventListener('submit', (event) => event.preventDefault());
    document.body.appendChild(form);
  });
  const before = await page.evaluate(() => (window as any).calls.length);
  await page.locator('body > form[data-comment] button').click();
  await page.waitForTimeout(100);
  expect(await page.evaluate(() => (window as any).calls.length)).toBe(before);
});