import { test, expect } from '@playwright/test';

test('reset ignores stale async list response', async ({ page }) => {
  await page.route('**/library-fixture', route => route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: '<!doctype html><html><body></body></html>',
  }));
  await page.goto('/library-fixture');
  await page.evaluate(async () => {
    const { createLibraryView } = await import('/src/library/view.ts');
    let resolveList;
    const fakeInvoke = (command, envelope) => {
      const operation = envelope.request.operation;
      if (command === 'library_request' && operation === 'list') return new Promise(resolve => { resolveList = resolve; });
      throw new Error('unexpected operation: ' + operation);
    };
    const view = createLibraryView(fakeInvoke);
    document.body.innerHTML = view.render();
    const pending = view.bind(document);
    view.reset();
    resolveList({ result: [{ id: 'SECRET-OLD', title: 'SECRET-OLD' }] });
    await pending;
  });
  await expect(page.locator('body')).not.toContainText('SECRET-OLD');
  await expect(page.locator('[data-townlight-library]')).toBeEmpty();
});