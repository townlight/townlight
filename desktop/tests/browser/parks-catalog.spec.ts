import { test, expect } from '@playwright/test';

const HOSTILE = '<img src=x onerror="window.pwned=true">';

const EXPECTED_RESOURCE_HOURS = {
  mon: [['08:00', '12:00'], ['13:00', '24:00']],
  tue: [],
  wed: [],
  thu: [],
  fri: [],
  sat: [],
  sun: [],
};

async function mount(page, options: { rejectProgramCreate?: boolean } = {}) {
  await page.route('**/parks-fixture', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><html><body></body></html>',
    }),
  );
  await page.goto('/parks-fixture');

  await page.evaluate(
    async ({ HOSTILE, rejectProgramCreate }) => {
      const w = window as any;
      w.calls = [];
      w.resourceUpdates = 0;
      w.runs = 0;
      w.pwned = false;
      w.rejectProgramCreate = rejectProgramCreate;

      const resourceSnapshot = {
        id: 'res-1',
        revision: 1,
        name: HOSTILE,
        address: '123 Park Avenue',
        timezone: 'America/Denver',
        description: 'Original description',
        amenities: ['restrooms', 'picnic tables'],
        accessibility: 'Step-free access',
        public: true,
        approval_required: false,
        buffer_before_minutes: 15,
        buffer_after_minutes: 30,
        fee_cents: 5000,
        deposit_cents: 1000,
        currency: 'USD',
        hours: {
          mon: [
            ['08:00', '12:00'],
            ['13:00', '24:00'],
          ],
        },
      };

      const resourceRows = [
        {
          id: 'res-1',
          revision: 1,
          snapshot: resourceSnapshot,
        },
      ];

      const programRows = [
        {
          id: 'prog-existing',
          revision: 3,
          snapshot: {
            id: 'prog-existing',
            revision: 3,
            title: 'Existing program',
            description: 'Existing description',
            timezone: 'America/Denver',
            public: false,
            min_age: 8,
            max_age: 12,
            eligibility_text: 'Open to ages 8-12',
            accessibility: 'Indoor space',
          },
        },
      ];

      const has = (obj: any, key: string) => Object.prototype.hasOwnProperty.call(obj, key);

      const invoke = async (op: string, extra: any = {}) => {
        w.calls.push({ op, extra });

        if (op === 'catalog-list') {
          if (extra.kind === 'resource') return resourceRows;
          if (extra.kind === 'program') return programRows;
          throw new Error(`Unexpected catalog-list kind: ${extra.kind}`);
        }

        if (op === 'catalog-update') {
          if (extra.kind === 'resource') {
            const inner = extra.payload.payload;
            const expectedRevision = extra.payload.expected_revision;
            w.resourceUpdates += 1;

            if (w.resourceUpdates === 1) {
              if (expectedRevision !== 1) {
                throw new Error(`Expected resource revision 1, received ${expectedRevision}`);
              }
              if (JSON.stringify(inner.hours) !== JSON.stringify({ mon: [['08:00', '12:00'], ['13:00', '24:00']], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] })) {
                throw new Error(`Resource hours mismatch: ${JSON.stringify(inner.hours)}`);
              }
            } else if (expectedRevision !== 2) {
              throw new Error(`Expected resource revision 2, received ${expectedRevision}`);
            }

            if (has(inner, 'id') || has(inner, 'revision')) {
              throw new Error('Resource payload leaked id/revision metadata.');
            }

            const nextRevision = expectedRevision + 1;
            resourceRows[0].revision = nextRevision;
            resourceRows[0].snapshot.revision = nextRevision;
            resourceRows[0].snapshot.description = inner.description;
            return { ok: true };
          }

          throw new Error(`Unexpected catalog-update kind: ${extra.kind}`);
        }

        if (op === 'catalog-create') {
          if (extra.kind === 'program') {
            if (w.rejectProgramCreate) {
              throw new Error('Native program create rejected');
            }

            const inner = extra.payload.payload;
            if (has(inner, 'id') || has(inner, 'revision')) {
              throw new Error('Program payload leaked id/revision metadata.');
            }

            const expected = {
              title: 'Youth volunteer day',
              description: 'Open to teens',
              timezone: 'America/Denver',
              public: true,
              min_age: null,
              max_age: null,
              eligibility_text: '',
              accessibility: '',
            };

            if (JSON.stringify(inner) !== JSON.stringify(expected)) {
              throw new Error(`Program create payload mismatch: ${JSON.stringify(inner)}`);
            }

            const row = {
              id: 'prog-created',
              revision: 1,
              snapshot: { id: 'prog-created', revision: 1, ...inner },
            };
            programRows.push(row);
            return { id: 'prog-created' };
          }

          throw new Error(`Unexpected catalog-create kind: ${extra.kind}`);
        }

        throw new Error(`Unexpected native call: ${op}`);
      };

      const mod = await import('/src/parks/catalog.ts');
      document.body.innerHTML = mod.renderCatalog();
      const root = document.querySelector('[data-parks-catalog]') as HTMLElement;
      const statusEl = root.querySelector('[data-status]') as HTMLElement;

      const ctx = {
        call: invoke,
        run: async (asyncfn: () => Promise<void>) => {
          w.runs += 1;
          await asyncfn();
        },
        status: (message: string) => {
          if (statusEl) statusEl.textContent = message;
        },
      };

      const binding = mod.bindCatalog(root, ctx);
      await binding.refresh();
    },
    { HOSTILE, rejectProgramCreate: Boolean(options.rejectProgramCreate) },
  );

  await expect(page.locator('[data-parks-catalog]')).toBeVisible();
}

test('selects a resource with seeded hours and updates it with revision guards', async ({ page }) => {
  await mount(page);

  const resourceForm = page.locator('form[data-resource]');

  await page.getByLabel('Selected resource').selectOption('res-1');

  await expect(page.locator('[data-resource-list] option[value="res-1"]')).toHaveText(HOSTILE);
  await expect(resourceForm.getByLabel('Name')).toHaveValue(HOSTILE);
  await expect(resourceForm.locator('[data-hours-day="mon"] [data-hour-row]')).toHaveCount(2);
  await expect(resourceForm.locator('[data-hours-day="mon"] [data-hour-row]').nth(0).locator('input[name="starts"]')).toHaveValue('08:00');
  await expect(resourceForm.locator('[data-hours-day="mon"] [data-hour-row]').nth(1).locator('input[name="starts"]')).toHaveValue('13:00');
  await expect(resourceForm.locator('[data-hours-day="mon"] [data-hour-row]').nth(1).locator('input[name="ends"]')).toHaveValue('24:00');
  await expect(page.locator('img')).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).pwned)).toBeFalsy();

  await resourceForm.getByLabel('Description').fill('Updated accessible description');
  await resourceForm.getByRole('button', { name: 'Save resource' }).click();
  await expect(page.locator('[data-status]')).toContainText('Resource saved.');
  await expect.poll(() => page.evaluate(() => (window as any).resourceUpdates)).toBe(1);

  await resourceForm.getByLabel('Description').fill('Second accessible description');
  await resourceForm.getByRole('button', { name: 'Save resource' }).click();
  await expect.poll(() => page.evaluate(() => (window as any).resourceUpdates)).toBe(2);
  await expect(page.locator('[data-status]')).toContainText('Resource saved.');

  const updates = await page.evaluate(() =>
    (window as any).calls
      .filter((entry: any) => entry.op === 'catalog-update')
      .map((entry: any) => entry.extra),
  );

  expect(updates).toHaveLength(2);
  expect(updates[0].payload.expected_revision).toBe(1);
  expect(updates[1].payload.expected_revision).toBe(2);
  expect(updates[0].payload.payload.hours).toEqual(EXPECTED_RESOURCE_HOURS);

  for (const update of updates) {
    expect(update.payload.payload).not.toHaveProperty('id');
    expect(update.payload.payload).not.toHaveProperty('revision');
  }
});

test('creates a program with exact payload and surfaces native rejection through ctx.run', async ({ page }) => {
  await mount(page);

  const programForm = page.locator('form[data-program]');

  await page.getByRole('button', { name: 'New program' }).click();
  await programForm.getByLabel('Title').fill('Youth volunteer day');
  await programForm.getByLabel('Description').fill('Open to teens');
  await programForm.getByLabel('Time zone').fill('America/Denver');
  await programForm.getByLabel('Publicly listed').check();

  await expect(programForm.getByLabel('Minimum age (optional)')).toHaveValue('');
  await expect(programForm.getByLabel('Maximum age (optional)')).toHaveValue('');

  await programForm.getByRole('button', { name: 'Save program' }).click();
  await expect(page.locator('[data-status]')).toContainText('Program saved.');
  await expect.poll(() => page.evaluate(() => (window as any).runs)).toBeGreaterThanOrEqual(1);

  const createCall = await page.evaluate(() =>
    (window as any).calls.find(
      (entry: any) => entry.op === 'catalog-create' && entry.extra.kind === 'program',
    )?.extra,
  );

  expect(createCall).toEqual({
    kind: 'program',
    payload: {
      payload: {
        title: 'Youth volunteer day',
        description: 'Open to teens',
        timezone: 'America/Denver',
        public: true,
        min_age: null,
        max_age: null,
        eligibility_text: '',
        accessibility: '',
      },
    },
  });

  await page.evaluate(() => {
    (window as any).rejectProgramCreate = true;
  });

  await page.getByRole('button', { name: 'New program' }).click();
  await programForm.getByLabel('Title').fill('Rejected program');
  await programForm.getByLabel('Time zone').fill('America/Denver');
  await programForm.getByRole('button', { name: 'Save program' }).click();

  await expect(page.locator('[data-status]')).toContainText('Native program create rejected');
  await expect.poll(() => page.evaluate(() => (window as any).runs)).toBeGreaterThanOrEqual(2);
});
