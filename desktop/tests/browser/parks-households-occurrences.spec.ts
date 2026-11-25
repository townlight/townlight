import { test, expect } from '@playwright/test';

const HOUSEHOLD_A = '3f1a9c2e-7b4d-4e8a-9f2b-6c1d5a8e0b11';
const HOUSEHOLD_B = 'a2d6e8f0-4c3b-4f5a-8e7d-1b9c0a2f3e44';
const PARTICIPANT_A = '7c9e2b4a-1d3f-4a6b-9c8e-2f0d5b7a1e33';
const PARTICIPANT_EDIT_REVISION = 4;
const HOUSEHOLD_SECRET = 'staff-only-secret-4f9c7b1e';

test('creates and selects households, creates and edits participants with exact nested payloads, and clears participant state on household change', async ({ page }) => {
  await page.route('**/parks-fixture', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><html><body></body></html>',
    }),
  );
  await page.goto('/parks-fixture');

  await page.evaluate(
    async ({
      householdA,
      householdB,
      participantA,
      participantEditRevision,
      householdSecret,
    }) => {
      const w = window as any;
      w.calls = [];
      w.runErrors = [];
      w.participantEvents = [];
      w.householdEvents = [];
      w.participantsByHousehold = {
        [householdA]: [],
        [householdB]: [],
      };

      const render = await import('/src/parks/households-render.ts');
      const households = await import('/src/parks/households.ts');
      const participants = await import('/src/parks/participants.ts');

      document.body.innerHTML = render.renderHouseholds();
      localStorage.clear();

      const root = document.querySelector('#parks-households') as HTMLElement;
      const statusEl = document.createElement('div');
      statusEl.setAttribute('data-test-status', '');
      root.appendChild(statusEl);

      root.addEventListener('parks-participant-selected', (event) => {
        w.participantEvents.push((event as CustomEvent).detail);
      });
      root.addEventListener('parks-household-selected', (event) => {
        w.householdEvents.push((event as CustomEvent).detail);
      });

      const invoke = async (op: string, extra: any = {}) => {
        w.calls.push({ op, extra });

        if (op === 'households-create') {
          const fields = extra.payload.payload;

          if (fields.contact_name === 'Jordan Alvarez') {
            return {
              id: householdA,
              snapshot: {
                contact_name: 'Jordan Alvarez',
                email: 'jordan.alvarez@example.org',
                internal_notes: householdSecret,
                access_pin: `${householdSecret}-pin`,
              },
            };
          }

          if (fields.contact_name === 'Riley Chen') {
            return {
              id: householdB,
              snapshot: {
                contact_name: 'Riley Chen',
                email: 'riley.chen@example.org',
              },
            };
          }

          throw new Error('Unexpected household create payload');
        }

        if (op === 'list-participants') {
          return w.participantsByHousehold[extra.household_id] || [];
        }

        if (op === 'create-participant') {
          const householdId = extra.payload.household_id;
          const row = {
            id: participantA,
            revision: participantEditRevision,
            snapshot: extra.payload.payload,
          };
          w.participantsByHousehold[householdId] = [row];
          return { id: participantA };
        }

        if (op === 'edit-participant') {
          const rows = w.participantsByHousehold[householdA] || [];
          const index = rows.findIndex((row: any) => row.id === extra.id);

          if (index === -1) {
            throw new Error('Unknown participant');
          }

          rows[index] = {
            id: extra.id,
            revision: Number(extra.payload.expected_revision) + 1,
            snapshot: extra.payload.payload,
          };
          return { ok: true };
        }

        if (op === 'households-search') {
          return [];
        }

        throw new Error(`Unexpected native call: ${op}`);
      };

      const ctx = {
        call: invoke,
        run: async (fn: () => Promise<void>) => {
          try {
            await fn();
          } catch (error) {
            w.runErrors.push(error instanceof Error ? error.message : String(error));
          }
        },
        status: (message: string) => {
          statusEl.textContent = message;
        },
      };

      households.bindHouseholds(root, ctx);
      participants.bindParticipants(root, ctx);
    },
    {
      householdA: HOUSEHOLD_A,
      householdB: HOUSEHOLD_B,
      participantA: PARTICIPANT_A,
      participantEditRevision: PARTICIPANT_EDIT_REVISION,
      householdSecret: HOUSEHOLD_SECRET,
    },
  );

  const status = page.locator('[data-test-status]');
  const createHousehold = page.locator('form[data-household-create]');
  const participantForm = page.locator('form[data-participant]');
  const participantList = page.locator('[data-participant-list]');

  await createHousehold.locator('[name="contact_name"]').fill('Jordan Alvarez');
  await createHousehold.locator('[name="email"]').fill('jordan.alvarez@example.org');
  await createHousehold.locator('[name="phone"]').fill('555-0100');
  await createHousehold.locator('[name="address"]').fill('42 Cedar Lane');
  await createHousehold.locator('[name="language"]').selectOption('en');
  await createHousehold.getByRole('button', { name: 'Create household' }).click();

  await expect(status).toContainText(`Household ${HOUSEHOLD_A} created.`);

  await expect
    .poll(() =>
      page.evaluate(
        (householdId) =>
          (window as any).calls.some(
            (entry: any) =>
              entry.op === 'list-participants' && entry.extra.household_id === householdId,
          ),
        HOUSEHOLD_A,
      ),
    )
    .toBe(true);

  const householdCreateCall = await page.evaluate(() =>
    (window as any).calls.find(
      (entry: any) =>
        entry.op === 'households-create' &&
        entry.extra.payload.payload.contact_name === 'Jordan Alvarez',
    )?.extra,
  );

  expect(householdCreateCall).toEqual({
    payload: {
      payload: {
        contact_name: 'Jordan Alvarez',
        email: 'jordan.alvarez@example.org',
        phone: '555-0100',
        address: '42 Cedar Lane',
        language: 'en',
      },
    },
  });

  const leak = await page.evaluate((secret) => {
    const storageValues = Object.keys(localStorage).map((key) => localStorage.getItem(key) || '');
    return {
      inDom: document.documentElement.outerHTML.includes(secret),
      inStorage: storageValues.some((value) => value.includes(secret)),
    };
  }, HOUSEHOLD_SECRET);

  expect(leak).toEqual({ inDom: false, inStorage: false });
  expect(await page.evaluate((id) => (window as any).householdEvents.some((event: any) => event.id === id), HOUSEHOLD_A)).toBe(true);

  await participantForm.locator('[name="name"]').fill('Maya Alvarez');
  await participantForm.locator('[name="birth_date"]').fill('2014-06-15');
  await participantForm.locator('[name="accommodations"]').fill('Wheelchair access; quiet room');
  await participantForm.getByRole('button', { name: 'Save participant' }).click();

  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as any).calls.some((entry: any) => entry.op === 'create-participant'),
      ),
    )
    .toBe(true);

  const participantCreateCall = await page.evaluate(() =>
    (window as any).calls.find((entry: any) => entry.op === 'create-participant')?.extra,
  );

  expect(participantCreateCall).toEqual({
    payload: {
      household_id: HOUSEHOLD_A,
      payload: {
        name: 'Maya Alvarez',
        birth_date: '2014-06-15',
        accommodations: 'Wheelchair access; quiet room',
      },
    },
  });

  await expect(participantList.locator(`option[value="${PARTICIPANT_A}"]`)).toHaveCount(1);
  await participantList.selectOption(PARTICIPANT_A);

  await expect(participantForm.locator('[name="name"]')).toHaveValue('Maya Alvarez');
  await expect(participantForm.locator('[name="birth_date"]')).toHaveValue('2014-06-15');
  await expect(participantForm.locator('[name="accommodations"]')).toHaveValue(
    'Wheelchair access; quiet room',
  );

  await participantForm.locator('[name="accommodations"]').fill('Step-free entrance');
  await participantForm.getByRole('button', { name: 'Save participant' }).click();

  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as any).calls.some((entry: any) => entry.op === 'edit-participant'),
      ),
    )
    .toBe(true);

  const participantEditCall = await page.evaluate(() =>
    (window as any).calls.find((entry: any) => entry.op === 'edit-participant')?.extra,
  );

  expect(participantEditCall).toEqual({
    id: PARTICIPANT_A,
    payload: {
      expected_revision: PARTICIPANT_EDIT_REVISION,
      payload: {
        name: 'Maya Alvarez',
        birth_date: '2014-06-15',
        accommodations: 'Step-free entrance',
      },
    },
  });

  await createHousehold.locator('[name="contact_name"]').fill('Riley Chen');
  await createHousehold.locator('[name="email"]').fill('riley.chen@example.org');
  await createHousehold.getByRole('button', { name: 'Create household' }).click();

  await expect(status).toContainText(`Household ${HOUSEHOLD_B} created.`);

  await expect
    .poll(() =>
      page.evaluate(
        (householdId) =>
          (window as any).participantEvents.some(
            (event: any) => event.id === '' && event.household_id === householdId,
          ),
        HOUSEHOLD_B,
      ),
    )
    .toBe(true);

  await expect(participantList).toHaveValue('');
  await expect(participantForm.locator('[name="name"]')).toHaveValue('');
  await expect(participantForm.locator('[name="birth_date"]')).toHaveValue('');
  await expect(participantForm.locator('[name="accommodations"]')).toHaveValue('');
});

test('surfaces malformed household search responses as errors rather than no-results messages', async ({ page }) => {
  await page.route('**/parks-fixture', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><html><body></body></html>',
    }),
  );
  await page.goto('/parks-fixture');

  await page.evaluate(async () => {
    const w = window as any;
    w.calls = [];
    w.runErrors = [];
    w.statusMessages = [];

    const render = await import('/src/parks/households-render.ts');
    const households = await import('/src/parks/households.ts');

    document.body.innerHTML = render.renderHouseholds();
    const root = document.querySelector('#parks-households') as HTMLElement;
    const statusEl = document.createElement('div');
    statusEl.setAttribute('data-test-status', '');
    root.appendChild(statusEl);

    const ctx = {
      call: async (op: string, extra: any = {}) => {
        w.calls.push({ op, extra });
        if (op === 'households-search') {
          return { malformed: true, rows: [] };
        }
        throw new Error(`Unexpected native call: ${op}`);
      },
      run: async (fn: () => Promise<void>) => {
        try {
          await fn();
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          w.runErrors.push(message);
          w.statusMessages.push(message);
          statusEl.textContent = message;
        }
      },
      status: (message: string) => {
        w.statusMessages.push(message);
        statusEl.textContent = message;
      },
    };

    households.bindHouseholds(root, ctx);
  });

  await page.locator('form[data-household-search] [name="search"]').fill('smith');
  await page.locator('form[data-household-search]').getByRole('button', { name: 'Search' }).click();

  await expect
    .poll(() => page.evaluate(() => (window as any).runErrors.length))
    .toBeGreaterThan(0);

  await expect(page.locator('[data-test-status]')).toContainText(
    'Unexpected households-search response: expected an array.',
  );
  await expect(page.locator('[data-test-status]')).not.toContainText('No households found.');

  const searchCall = await page.evaluate(() =>
    (window as any).calls.find((entry: any) => entry.op === 'households-search')?.extra,
  );

  expect(searchCall).toEqual({ search: 'smith' });
});

test('previews recurring occurrences with preserved offsets, reads edited individual pairs, invalidates stale previews, and rejects invalid occurrence input', async ({ page }) => {
  await page.route('**/parks-fixture', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><html><body></body></html>',
    }),
  );
  await page.goto('/parks-fixture');

  await page.evaluate(async () => {
    const render = await import('/src/parks/reservations-render.ts');
    const occurrences = await import('/src/parks/occurrences.ts');

    document.body.innerHTML = render.renderReservations();
    (window as any).occurrenceBinding = occurrences.bindOccurrences(document);
  });

  const createForm = page.locator('form[data-booking-create]');
  const startsAt = createForm.getByLabel('Starts at', { exact: true });
  const endsAt = createForm.getByLabel('Ends at', { exact: true });
  const repeats = createForm.getByLabel('Repeats', { exact: true });
  const preview = createForm.getByRole('button', { name: 'Preview occurrences' });
  const occurrenceContainer = page.locator('[data-occurrences]');
  const occurrenceRows = occurrenceContainer.locator('[data-occurrence-row]');

  await startsAt.fill('2025-03-02T09:00:00-05:00');
  await endsAt.fill('2025-03-02T11:00:00-05:00');
  await repeats.fill('3');
  await preview.click();

  await expect(occurrenceRows).toHaveCount(3);
  await expect(occurrenceContainer).toHaveAttribute('data-stale', 'false');

  await expect(occurrenceRows.nth(0).locator('[data-occurrence-start]')).toHaveValue(
    '2025-03-02T09:00:00.000-05:00',
  );
  await expect(occurrenceRows.nth(1).locator('[data-occurrence-start]')).toHaveValue(
    '2025-03-09T09:00:00.000-05:00',
  );
  await expect(occurrenceRows.nth(2).locator('[data-occurrence-start]')).toHaveValue(
    '2025-03-16T09:00:00.000-05:00',
  );
  await expect(occurrenceRows.nth(2).locator('[data-occurrence-end]')).toHaveValue(
    '2025-03-16T11:00:00.000-05:00',
  );

  const editedStart = '2025-03-09T10:15:00-05:00';
  const editedEnd = '2025-03-09T12:45:00-05:00';
  await occurrenceRows.nth(1).locator('[data-occurrence-start]').fill(editedStart);
  await occurrenceRows.nth(1).locator('[data-occurrence-end]').fill(editedEnd);

  const editedRead = await page.evaluate(() => (window as any).occurrenceBinding.read());
  expect(editedRead).toHaveLength(3);
  expect(editedRead[1]).toEqual({ starts_at: editedStart, ends_at: editedEnd });

  await startsAt.fill('2025-04-06T09:00:00-04:00');
  await endsAt.fill('2025-04-06T11:00:00-04:00');
  await repeats.fill('2');

  await expect(occurrenceContainer).toHaveAttribute('data-stale', 'true');
  await expect(occurrenceRows.nth(1)).toHaveAttribute('data-stale', 'true');

  const regeneratedRead = await page.evaluate(() => (window as any).occurrenceBinding.read());
  expect(regeneratedRead).toEqual([
    { starts_at: '2025-04-06T09:00:00.000-04:00', ends_at: '2025-04-06T11:00:00.000-04:00' },
    { starts_at: '2025-04-13T09:00:00.000-04:00', ends_at: '2025-04-13T11:00:00.000-04:00' },
  ]);

  async function expectPreviewError(start: string, end: string, count: string, message: string) {
    await startsAt.fill(start);
    await endsAt.fill(end);
    await repeats.fill(count);
    await preview.click();
    await expect(occurrenceContainer.getByRole('alert')).toHaveText(message);
  }

  await expectPreviewError(
    '2025-02-30T09:00:00-05:00',
    '2025-03-02T11:00:00-05:00',
    '1',
    'Invalid timestamp',
  );
  await expectPreviewError(
    '2025-03-02T11:00:00-05:00',
    '2025-03-02T09:00:00-05:00',
    '1',
    'end must be after start',
  );
  await expectPreviewError(
    '2025-03-02T09:00:00',
    '2025-03-02T11:00:00-05:00',
    '1',
    'Timestamp must be ISO with Z or numeric HH:mm offset',
  );
  await expectPreviewError(
    '2025-03-02T09:00:00-05:00',
    '2025-03-02T11:00:00-05:00',
    '53',
    'count must be an integer from 1 to 52',
  );
});
