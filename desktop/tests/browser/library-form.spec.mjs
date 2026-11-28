import { test, expect } from '@playwright/test';
test('create form keeps private notes out of public payload preview', async ({ page }) => {
  await page.route('**/library-form-fixture', async route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><body></body>' }));
  await page.goto('/library-form-fixture');
  await page.evaluate(async () => {
    const { createLibraryView } = await import('/src/library/view.ts');
    window.calls = [];
    let saved = null;
    const fake = { invoke: async (command, { request }) => {
      if (command !== 'library_request') throw new Error('unexpected command');
      window.calls.push(request);
      if (request.operation === 'list') return { result: saved ? [saved] : [] };
      if (request.operation === 'create') {
        const content = { ...request.payload };
        delete content.private_notes;
        saved = { id: '11111111-1111-4111-8111-111111111111', revision: 1, sha256: 'a'.repeat(64), content, private_notes: request.payload.private_notes, links: [], approval: null };
        window.saved = saved;
        return { result: saved };
      }
      if (request.operation === 'get') return { result: saved };
      throw new Error('unexpected action');
    } };
    window.view = createLibraryView(fake.invoke, { isAdmin: true });
    document.body.innerHTML = window.view.render();
    await window.view.bind(document);
  });
  await page.fill('input[name="title"]', 'Fictional Program');
  await page.fill('input[name="starts_at"]', '2026-12-01T10:00');
  await page.fill('input[name="location"]', 'Main Hall');
  await page.fill('textarea[name="description"]', 'Public text');
  await page.fill('textarea[name="private_notes"]', 'SECRET');
  await page.click('[data-library-form] button[type="submit"]');
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  const state = await page.evaluate(() => ({
    create: window.calls.find(call => call.operation === 'create'),
    savedPrivateNotes: window.saved?.private_notes ?? '',
    preview: document.querySelector('[data-library-public-preview]')?.textContent ?? ''
  }));
  expect(state.create).not.toHaveProperty('title');
  expect(state.create.payload.title).toBe('Fictional Program');
  expect(state.create.payload.starts_at.endsWith('Z')).toBe(true);
  expect(new Date(state.create.payload.starts_at).toISOString()).toBe(state.create.payload.starts_at);
  expect(state.create.payload.location).toBe('Main Hall');
  expect(state.create.payload.description).toBe('Public text');
  expect(state.create.payload.private_notes).toBe('SECRET');
  expect(state.savedPrivateNotes).toBe('SECRET');
  expect(state.preview).toContain('Fictional Program');
  expect(state.preview).not.toContain('SECRET');
  await page.evaluate(() => window.view.reset());
  await expect(page.locator('section')).toHaveText('');
});