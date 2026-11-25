import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

test.setTimeout(20_000);

test('record link lookup, stale edit, confirm, expected revision, refresh', async ({ page }) => {
  await page.route('**/record-links-fixture', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html><body></body>' })
  );
  await page.goto('/record-links-fixture');

  await page.evaluate(async () => {
    const w = window as any;
    w.calls = [];
    w.refreshCount = 0;
    w.selection = { id: 'request-311', revision: 7 };

    const invoke = async (op: string, extra?: any) => {
      w.calls.push({ op, extra });
      if (op === 'record-lookup') return { target_id: 'actual-target-311' };
      if (op === 'link-record') return { ok: true };
      throw new Error(`unexpected operation ${op}`);
    };

    const mod = await import('/src/service-requests/record-links.ts');
    const component = mod.createRecordLinks(
      invoke,
      () => w.selection,
      async () => { w.refreshCount += 1; }
    );
    document.body.innerHTML = component.render();
    component.bind(document.body);
  });

  await page.locator('.record-links > summary').click();

  const form = page.locator('[data-rl-form]');
  const status = form.locator('[data-rl-status]');
  await form.locator('[data-rl-kind]').selectOption('permit');
  await form.locator('[data-rl-identifier]').fill('P-42');
  await form.locator('[data-rl-jurisdiction]').fill('City');

  await form.locator('[data-rl-lookup]').click();
  await expect(status).toContainText('actual-target-311');
  await expect(status).toContainText('"selected_id": "request-311"');
  await expect(status).toContainText('"selected_revision": 7');

  const lookupCall = await page.evaluate(() =>
    (window as any).calls.find((call: any) => call.op === 'record-lookup')
  );
  expect(lookupCall.extra.payload).toEqual({
    kind: 'permit',
    identifier: 'P-42',
    jurisdiction: 'City',
  });

  await form.locator('[data-rl-link]').click();
  await expect(status).toContainText('Confirm the link first.');
  expect(await page.evaluate(() =>
    (window as any).calls.filter((call: any) => call.op === 'link-record').length
  )).toBe(0);

  await form.locator('[data-rl-confirm]').check();
  await form.locator('[data-rl-identifier]').fill('P-43');
  await form.locator('[data-rl-link]').click();
  await expect(status).toContainText('The form changed. Look up again.');
  expect(await page.evaluate(() =>
    (window as any).calls.filter((call: any) => call.op === 'link-record').length
  )).toBe(0);

  await form.locator('[data-rl-lookup]').click();
  await expect(status).toContainText('P-43');
  await form.locator('[data-rl-link]').click();
  await expect(status).toContainText('Linked.');

  const result = await page.evaluate(() => ({
    calls: (window as any).calls,
    refreshCount: (window as any).refreshCount,
  }));
  const linkCall = result.calls.find((call: any) => call.op === 'link-record');
  expect(linkCall.extra).toMatchObject({
    id: 'request-311',
    payload: {
      kind: 'permit',
      identifier: 'P-43',
      jurisdiction: 'City',
      expected_revision: 7,
      confirm: true,
    },
  });
  expect(result.refreshCount).toBe(1);
});

test('data publication preview, confirm, publish, verified download, bad hash', async ({ page }) => {
  const content = Buffer.from('tiny-311-bytes');
  const contentBase64 = content.toString('base64');
  const sha = createHash('sha256').update(content).digest('hex');
  const id = 'revision-311';

  await page.route('**/data-publication-fixture', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html><body></body>' })
  );
  await page.goto('/data-publication-fixture');

  await page.evaluate(async ({ contentBase64, sha, id }) => {
    const w = window as any;
    w.calls = [];
    w.badHash = false;
    const contentSize = atob(contentBase64).length;

    const invoke = async (op: string, extra?: any) => {
      w.calls.push({ op, extra });
      if (op === 'data-preview') return { id, sha256: sha, rows: 3 };
      if (op === 'data-status') return { revisions: [{ id, sha256: sha, size: contentSize }] };
      if (op === 'data-revision') {
        if (!extra || extra.id !== id) throw new Error('wrong revision');
        return {
          id,
          sha256: w.badHash ? '0'.repeat(64) : sha,
          content_base64: contentBase64,
          size: contentSize,
          rows: 3,
        };
      }
      if (op === 'data-publish') return { queued: true };
      throw new Error(`unexpected operation ${op}`);
    };

    const mod = await import('/src/service-requests/data-publication.ts');
    const component = mod.createDataPublication(invoke, () => true);
    document.body.replaceChildren(component.render());
  }, { contentBase64, sha, id });

  await page.locator('details > summary').click();

  const result = page.locator('[data-dp-result]');
  await page.locator('[data-dp-preview]').click();
  await expect(result).toContainText(id);
  await expect(result).toContainText(sha);

  await page.locator('[data-dp-publish]').click();
  await expect(result).toContainText('Confirm required');
  expect(await page.evaluate(() =>
    (window as any).calls.filter((call: any) => call.op === 'data-publish').length
  )).toBe(0);

  await page.locator('[data-dp-confirm]').check();
  await page.locator('[data-dp-publish]').click();
  await expect(result).toContainText('Queued:');
  const publishCall = await page.evaluate(() =>
    (window as any).calls.find((call: any) => call.op === 'data-publish')
  );
  expect(publishCall.extra.payload).toMatchObject({
    id,
    expected_sha256: sha,
    confirm: true,
  });

  await page.locator('[data-dp-status]').click();
  await expect(page.locator('[data-dp-revision]')).toHaveValue(id);

  const downloadPromise = page.waitForEvent('download');
  await page.locator('[data-dp-retrieve]').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe(`townlight-data-${id}.zip`);
  const path = await download.path();
  expect(path).not.toBeNull();
  expect((await readFile(path!)).equals(content)).toBe(true);
  await expect(result).toContainText(sha);

  await page.evaluate(() => { (window as any).badHash = true; });
  let downloads = 0;
  page.on('download', () => { downloads += 1; });
  await page.locator('[data-dp-retrieve]').click();
  await expect(result).toContainText(/checksum verification failed/i);
  await page.waitForTimeout(100);
  expect(downloads).toBe(0);
});