import { test, expect } from '@playwright/test';

type Call = { op: string; extra: any };

async function mountRecords(page: any) {
  await page.route('**/parks-fixture', (route: any) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><html><body></body></html>',
    }),
  );
  await page.goto('/parks-fixture');

  await page.evaluate(async () => {
    const w = window as any;
    w.calls = [];
    w.runs = 0;
    w.openedRecords = null;

    const previewHash = 'c'.repeat(64);

    const invoke = async (op: string, extra: any = null) => {
      w.calls.push({ op, extra: extra ?? null });

      if (op === 'archive-preview') {
        return {
          kind: 'resource',
          entity_id: 'res-1',
          name: 'Fall Program Records',
          current_revision: 7,
          sha256: previewHash,
          size: 1234,
        };
      }

      if (op === 'archive-records') {
        return {
          records_request_id: 'rr-1',
          attachment_id: 'att-rec-1',
          sha256: previewHash,
        };
      }

      throw new Error(`Unknown native op ${op}`);
    };

    const statusEl = document.createElement('div');
    statusEl.id = 'test-status';
    document.body.append(statusEl);

    const ctx = {
      call: invoke,
      run: async (label: string, task: () => Promise<unknown> | unknown) => {
        w.runs += 1;
        try {
          return await task();
        } catch (error) {
          statusEl.textContent = `${label}: ${error instanceof Error ? error.message : String(error)}`;
          throw error;
        }
      },
      status: (message: string) => {
        statusEl.textContent = message;
      },
    };

    const { renderRecordsHandoff, bindRecordsHandoff } = await import(
      '/src/parks/records-handoff.ts'
    );

    document.body.insertAdjacentHTML('beforeend', renderRecordsHandoff());
    const root = document.querySelector('[data-handoff]') as HTMLElement;

    bindRecordsHandoff(root, ctx as any, {
      openRecords: (id: string) => {
        w.openedRecords = id;
      },
    });

    root.dispatchEvent(
      new CustomEvent('parks-archive-source-selected', {
        detail: { kind: 'resource', id: 'res-1' },
        bubbles: true,
        composed: true,
      }),
    );
  });
}

async function mountAttachmentsWithRecords(page: any) {
  await page.route('**/parks-fixture', (route: any) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><html><body></body></html>',
    }),
  );
  await page.goto('/parks-fixture');

  await page.evaluate(async () => {
    const w = window as any;
    w.calls = [];
    w.runs = 0;
    w.openedRecords = null;

    const previewHash = 'c'.repeat(64);
    const attachmentHash = 'd'.repeat(64);

    const attachment = {
      id: 'att-1',
      entity_kind: 'resource',
      entity_id: 'res-1',
      name: 'note.txt',
      media_type: 'text/plain',
      sha256: attachmentHash,
      size: 5,
      actor: 'user-1',
      created_at: '2025-06-01T00:00:00Z',
    };

    let uploaded = false;

    const invoke = async (op: string, extra: any = null) => {
      w.calls.push({ op, extra: extra ?? null });

      if (op === 'archive-preview') {
        return {
          kind: 'resource',
          entity_id: 'res-1',
          name: 'Fall Program Records',
          current_revision: 7,
          sha256: previewHash,
          size: 1234,
        };
      }

      if (op === 'attachment-list') {
        return {
          items: uploaded ? [attachment] : [],
          overflow: false,
        };
      }

      if (op === 'attachment-create') {
        uploaded = true;
        return attachment;
      }

      if (op === 'download-attachment') {
        return {
          path: '/tmp/exports/note.txt',
          sha256: attachmentHash,
          size_bytes: 5,
        };
      }

      throw new Error(`Unknown native op ${op}`);
    };

    const statusEl = document.createElement('div');
    statusEl.id = 'test-status';
    document.body.append(statusEl);

    const ctx = {
      call: invoke,
      run: async (label: string, task: () => Promise<unknown> | unknown) => {
        w.runs += 1;
        try {
          return await task();
        } catch (error) {
          statusEl.textContent = `${label}: ${error instanceof Error ? error.message : String(error)}`;
          return undefined;
        }
      },
      status: (message: string) => {
        statusEl.textContent = message;
      },
    };

    const { renderRecordsHandoff, bindRecordsHandoff } = await import(
      '/src/parks/records-handoff.ts'
    );
    const { renderAttachments, bindAttachments } = await import(
      '/src/parks/attachments.ts'
    );

    const wrapper = document.createElement('div');
    wrapper.dataset.testParksRoot = 'true';
    wrapper.innerHTML = `${renderRecordsHandoff()}${renderAttachments()}`;
    document.body.append(wrapper);

    const recordsRoot = wrapper.querySelector('[data-handoff]') as HTMLElement;

    bindRecordsHandoff(wrapper, ctx as any, {
      openRecords: (id: string) => {
        w.openedRecords = id;
      },
    });
    bindAttachments(wrapper, ctx as any);

    recordsRoot.dispatchEvent(
      new CustomEvent('parks-archive-source-selected', {
        detail: { kind: 'resource', id: 'res-1' },
        bubbles: true,
        composed: true,
      }),
    );
  });
}

async function mountDataPublication(page: any) {
  await page.route('**/parks-fixture', (route: any) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><html><body></body></html>',
    }),
  );
  await page.goto('/parks-fixture');

  await page.evaluate(async () => {
    const w = window as any;
    w.calls = [];
    w.runs = 0;

    const previewHash = 'a'.repeat(64);
    const savedHash = 'b'.repeat(64);

    const previewRows = [
      {
        metric: 'visits',
        state: 'published',
        count: 3,
        amount_cents: 500,
        minutes: 60,
      },
    ];

    const savedRows = [
      {
        metric: 'visits',
        state: 'archived',
        count: 1,
        amount_cents: 0,
        minutes: 0,
      },
    ];

    const invoke = async (op: string, extra: any = null) => {
      w.calls.push({ op, extra: extra ?? null });

      if (op === 'data-status') {
        return {
          configured: true,
          publications: [],
          revisions: [
            {
              id: 'rev-saved-1',
              sha256: savedHash,
              created_at: '2025-01-01T00:00:00Z',
              approved_at: null,
            },
          ],
        };
      }

      if (op === 'data-preview') {
        return {
          id: 'rev-preview-1',
          sha256: previewHash,
          rows: previewRows,
        };
      }

      if (op === 'data-revision') {
        return {
          id: 'rev-saved-1',
          sha256: savedHash,
          rows: savedRows,
          content_base64: 'UEsDBAo=',
          size: 8,
          approved_at: null,
        };
      }

      if (op === 'data-publish') {
        return { id: 'job-1', state: 'queued' };
      }

      throw new Error(`Unknown native op ${op}`);
    };

    const statusEl = document.createElement('div');
    statusEl.id = 'test-status';
    document.body.append(statusEl);

    const ctx = {
      call: invoke,
      run: async (label: string, task: () => Promise<unknown> | unknown) => {
        w.runs += 1;
        try {
          return await task();
        } catch (error) {
          statusEl.textContent = `${label}: ${error instanceof Error ? error.message : String(error)}`;
          throw error;
        }
      },
      status: (message: string) => {
        statusEl.textContent = message;
      },
    };

    const { renderParksData, bindParksData } = await import(
      '/src/parks/data-publication.ts'
    );

    document.body.insertAdjacentHTML('beforeend', renderParksData(true));
    const root = document.querySelector('[data-parks-data-publication]') as HTMLElement;
    bindParksData(root, ctx as any);
  });
}

test('records handoff: preview, reviewed archive payload, open records callback', async ({ page }) => {
  await mountRecords(page);

  await expect(page.locator('[data-handoff-preview-button]')).toBeEnabled();
  await page.locator('[data-handoff-preview-button]').click();

  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as any).calls.find((entry: Call) => entry.op === 'archive-preview')?.extra,
      ),
    )
    .toEqual({ kind: 'resource', entity_id: 'res-1' });

  await expect(page.locator('[data-handoff-name]')).toHaveText('Fall Program Records');
  await expect(page.locator('[data-handoff-revision]')).toHaveText('7');
  await expect(page.locator('[data-handoff-size]')).toHaveText('1234 bytes');
  await expect(page.locator('[data-handoff-sha256]')).toHaveText('c'.repeat(64));

  await expect(page.locator('[data-handoff-archive-button]')).toBeDisabled();
  await page.locator('[data-handoff-review-checkbox]').check();
  await expect(page.locator('[data-handoff-archive-button]')).toBeEnabled();

  await page.locator('[data-handoff-archive-button]').click();

  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as any).calls.find((entry: Call) => entry.op === 'archive-records')?.extra,
      ),
    )
    .toEqual({
      kind: 'resource',
      entity_id: 'res-1',
      payload: {
        confirm: true,
        expected_revision: 7,
        expected_sha256: 'c'.repeat(64),
      },
    });

  await expect(page.locator('[data-handoff-receipt]')).toBeVisible();
  await expect(page.locator('[data-handoff-records-request-id]')).toHaveText('rr-1');
  await expect(page.locator('[data-handoff-attachment-id]')).toHaveText('att-rec-1');
  await expect(page.locator('[data-handoff-receipt-sha256]')).toHaveText('c'.repeat(64));

  await page.locator('[data-handoff-open-records]').click();
  await expect.poll(() => page.evaluate(() => (window as any).openedRecords)).toBe('rr-1');
});

test('records handoff: rejects non-numeric archive revision', async ({ page }) => {
  await page.route('**/parks-fixture', (route: any) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><html><body></body></html>',
    }),
  );
  await page.goto('/parks-fixture');

  await page.evaluate(async () => {
    const w = window as any;
    w.calls = [];

    const invoke = async (op: string, extra: any = null) => {
      w.calls.push({ op, extra: extra ?? null });
      if (op === 'archive-preview') {
        return {
          kind: 'resource',
          entity_id: 'res-1',
          name: 'Fall Program Records',
          current_revision: '7',
          sha256: 'c'.repeat(64),
          size: 1234,
        };
      }
      throw new Error(`Unknown native op ${op}`);
    };

    const statusEl = document.createElement('div');
    statusEl.id = 'test-status';
    document.body.append(statusEl);

    const ctx = {
      call: invoke,
      status: (message: string) => {
        statusEl.textContent = message;
      },
    };

    const { renderRecordsHandoff, bindRecordsHandoff } = await import(
      '/src/parks/records-handoff.ts'
    );

    document.body.insertAdjacentHTML('beforeend', renderRecordsHandoff());
    const root = document.querySelector('[data-handoff]') as HTMLElement;
    bindRecordsHandoff(root, ctx as any);

    root.dispatchEvent(
      new CustomEvent('parks-archive-source-selected', {
        detail: { kind: 'resource', id: 'res-1' },
        bubbles: true,
        composed: true,
      }),
    );
  });

  await page.locator('[data-handoff-preview-button]').click();

  await expect(page.locator('[data-handoff-preview-result]')).toBeHidden();
  await expect(page.locator('#test-status')).toContainText(
    'Archive preview data was invalid. No archive action was taken.',
  );
  await expect(page.locator('[data-handoff-archive-button]')).toBeDisabled();
});

test('attachments: upload/list/download returned hash and invalidation clears archive approval', async ({ page }) => {
  await mountAttachmentsWithRecords(page);

  await expect(page.locator('[data-attachments-list]')).toContainText('No attachments yet.');

  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as any).calls.find((entry: Call) => entry.op === 'attachment-list')?.extra,
      ),
    )
    .toEqual({ kind: 'resource', entity_id: 'res-1' });

  await page.locator('[data-handoff-preview-button]').click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as any).calls.find((entry: Call) => entry.op === 'archive-preview')?.extra,
      ),
    )
    .toEqual({ kind: 'resource', entity_id: 'res-1' });

  await page.locator('[data-handoff-review-checkbox]').check();
  await expect(page.locator('[data-handoff-archive-button]')).toBeEnabled();

  await page.locator('[data-attachments-file]').setInputFiles({
    name: 'note.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('hello'),
  });

  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as any).calls.find((entry: Call) => entry.op === 'attachment-create')?.extra,
      ),
    )
    .toEqual({
      kind: 'resource',
      entity_id: 'res-1',
      payload: {
        name: 'note.txt',
        media_type: 'text/plain',
        content_base64: 'aGVsbG8=',
      },
    });

  await expect(page.locator('[data-handoff-preview-result]')).toBeHidden();
  await expect(page.locator('[data-handoff-review-checkbox]')).not.toBeChecked();
  await expect(page.locator('[data-handoff-archive-button]')).toBeDisabled();

  await expect
    .poll(() =>
      page.evaluate(
        () => (window as any).calls.filter((entry: Call) => entry.op === 'attachment-list').length,
      ),
    )
    .toBeGreaterThan(1);

  await expect(page.locator('[data-attachment-id="att-1"]')).toBeVisible();
  await expect(page.locator('[data-attachment-id="att-1"]')).toContainText('note.txt');

  await page.locator('[data-attachment-id="att-1"] [data-attachment-download]').click();

  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as any).calls.find((entry: Call) => entry.op === 'download-attachment')?.extra,
      ),
    )
    .toEqual({ attachment_id: 'att-1' });

  await expect(page.locator('[data-attachments-receipt]')).toBeVisible();
  await expect(page.locator('[data-attachments-receipt]')).toContainText('/tmp/exports/note.txt');
  await expect(page.locator('.parks-attachments__receipt-hash')).toHaveText(
    `SHA-256: ${'d'.repeat(64)}`,
  );
  await expect(page.locator('.parks-attachments__receipt-size')).toHaveText('Size: 5 bytes');
});

test('admin data publication: preview, saved revision review, exact publish contract', async ({ page }) => {
  await mountDataPublication(page);

  await page.locator('[data-parks-action="status"]').click();

  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as any).calls.find((entry: Call) => entry.op === 'data-status'),
      ),
    )
    .toEqual({ op: 'data-status', extra: null });

  await expect(page.locator('[data-parks-revision-select] option[value="rev-saved-1"]')).toHaveCount(1);
  await expect(page.locator('[data-parks-config]')).toContainText('configured');

  await page.locator('[data-parks-action="preview"]').click();

  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as any).calls.find((entry: Call) => entry.op === 'data-preview'),
      ),
    )
    .toEqual({ op: 'data-preview', extra: null });

  await expect(page.locator('[data-parks-preview]')).toBeVisible();
  await expect(page.locator('[data-parks-preview-id]')).toHaveText('rev-preview-1');
  await expect(page.locator('[data-parks-preview-hash]')).toHaveText('a'.repeat(64));
  await expect(page.locator('[data-parks-preview-rows] tr')).toHaveCount(1);
  await expect(page.locator('[data-parks-preview-rows]')).toContainText('visits');

  await page.locator('[data-parks-confirm]').check();
  await expect(page.locator('[data-parks-action="publish"]')).toBeEnabled();
  await page.locator('[data-parks-action="publish"]').click();

  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as any).calls.find((entry: Call) => entry.op === 'data-publish')?.extra,
      ),
    )
    .toEqual({
      payload: {
        id: 'rev-preview-1',
        expected_sha256: 'a'.repeat(64),
        confirm: true,
      },
    });

  await expect(page.locator('[data-parks-receipt]')).toContainText('job-1');

  await page.locator('[data-parks-revision-select]').selectOption('rev-saved-1');

  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as any).calls.find((entry: Call) => entry.op === 'data-revision')?.extra,
      ),
    )
    .toEqual({ revision_id: 'rev-saved-1' });

  await expect(page.locator('[data-parks-preview-id]')).toHaveText('rev-saved-1');
  await expect(page.locator('[data-parks-preview-hash]')).toHaveText('b'.repeat(64));

  await page.locator('[data-parks-confirm]').check();
  await page.locator('[data-parks-action="publish"]').click();

  await expect
    .poll(() =>
      page.evaluate(
        () => (window as any).calls.filter((entry: Call) => entry.op === 'data-publish').length,
      ),
    )
    .toBe(2);

  await expect
    .poll(() =>
      page.evaluate(
        () => (window as any).calls.filter((entry: Call) => entry.op === 'data-publish')[1]?.extra,
      ),
    )
    .toEqual({
      payload: {
        id: 'rev-saved-1',
        expected_sha256: 'b'.repeat(64),
        confirm: true,
      },
    });
});
