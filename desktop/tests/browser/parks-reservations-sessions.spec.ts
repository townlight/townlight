import { test, expect } from '@playwright/test';

type Call = { op: string; extra: any };

async function mountReservations(page: any) {
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

    const resourceRow = {
      id: 'res-1',
      revision: 1,
      snapshot: { id: 'res-1', title: 'Picnic Shelter', timezone: 'America/Denver' },
    };

    const bookings = [
      {
        id: 'bk-1',
        revision: 1,
        resource_id: 'res-1',
        household_id: 'hh-42',
        status: 'pending',
        starts_at: '2025-06-01T09:00:00-04:00',
        ends_at: '2025-06-01T10:30:00-04:00',
      },
    ];

    let bookingRevision = 1;
    let resourceRevision = 1;
    let closures: any[] = [
      {
        id: 'cl-1',
        starts_at: '2025-07-04T00:00:00-04:00',
        ends_at: '2025-07-04T23:59:59-04:00',
        reason: 'Holiday',
      },
    ];

    const invoke = async (op: string, extra: any = {}) => {
      w.calls.push({ op, extra });

      if (op === 'catalog-list') {
        if (extra.kind === 'resource') return [resourceRow];
        throw new Error(`unexpected catalog-list kind ${extra.kind}`);
      }

      if (op === 'bookings-list') {
        return bookings;
      }

      if (op === 'bookings-get') {
        const row = bookings.find((item) => item.id === extra.booking_id);
        if (!row) throw new Error(`unknown booking ${extra.booking_id}`);
        return { ...row, revision: bookingRevision };
      }

      if (op === 'bookings-create') {
        return { id: 'bk-2' };
      }

      if (op === 'bookings-transition') {
        bookingRevision = 2;
        if (bookings[0]) bookings[0].status = 'confirmed';
        return { ok: true };
      }

      if (op === 'bookings-reschedule') {
        return { ok: true };
      }

      if (op === 'availability-query') {
        return {
          available: true,
          reason: 'open',
          starts_at: extra.start,
          ends_at: extra.end,
        };
      }

      if (op === 'closures-list') {
        return closures;
      }

      if (op === 'closures-create') {
        resourceRevision = 2;
        closures = [...closures, { id: 'cl-2', ...extra.payload }];
        return { id: 'cl-2' };
      }

      if (op === 'closures-delete') {
        resourceRevision = 3;
        closures = closures.filter((item) => item.id !== extra.closure_id);
        return { ok: true };
      }

      if (op === 'catalog-get') {
        if (extra.kind === 'resource' && extra.id === 'res-1') {
          return {
            id: 'res-1',
            revision: resourceRevision,
            snapshot: { id: 'res-1', title: 'Picnic Shelter' },
          };
        }
        throw new Error(`unexpected catalog-get ${extra.kind}/${extra.id}`);
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

    const { renderReservations } = await import('/src/parks/reservations-render.ts');
    const { bindReservations } = await import('/src/parks/reservations.ts');
    const { bindAvailability } = await import('/src/parks/availability.ts');

    document.body.insertAdjacentHTML('beforeend', renderReservations());
    const root = document.querySelector('[aria-labelledby="parks-reservation-title"]') as HTMLElement;

    const reservations = bindReservations(root, ctx);
    bindAvailability(root, ctx);
    await reservations.refresh();
  });
}

async function mountSessions(page: any) {
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

    const programs = [
      { id: 'prog-1', revision: 1, snapshot: { id: 'prog-1', title: 'Nature Club' } },
    ];

    let sessions: any[] = [
      {
        id: 'sess-1',
        program_id: 'prog-1',
        revision: 1,
        title: 'Morning',
        capacity: 10,
        state: 'open',
        starts_at: '2025-06-01T09:00:00-04:00',
        ends_at: '2025-06-01T10:30:00-04:00',
        fee_cents: 0,
        currency: 'USD',
      },
    ];

    let sessionRevision = 1;
    let roster: any[] = [];

    const invoke = async (op: string, extra: any = {}) => {
      w.calls.push({ op, extra });

      if (op === 'catalog-list') {
        if (extra.kind === 'program') return programs;
        throw new Error(`unexpected catalog-list kind ${extra.kind}`);
      }

      if (op === 'sessions-list') {
        return sessions.map((row) => ({
          id: row.id,
          title: row.title,
          starts_at: row.starts_at,
          revision: row.revision,
        }));
      }

      if (op === 'sessions-get') {
        const row = sessions.find((item) => item.id === extra.session_id);
        if (!row) throw new Error(`unknown session ${extra.session_id}`);
        return { ...row, revision: sessionRevision };
      }

      if (op === 'sessions-create') {
        sessions.push({
          id: 'sess-2',
          program_id: extra.payload.program_id,
          title: 'New session',
          capacity: extra.payload.capacity,
          state: 'open',
          starts_at: extra.payload.starts_at,
          ends_at: extra.payload.ends_at,
          fee_cents: extra.payload.fee_cents,
          currency: extra.payload.currency,
          revision: 1,
        });
        return { id: 'sess-2' };
      }

      if (op === 'sessions-update') {
        sessionRevision += 1;
        const row = sessions.find((item) => item.id === extra.session_id);
        if (row) {
          row.revision = sessionRevision;
          if (extra.payload.capacity !== undefined) row.capacity = extra.payload.capacity;
          if (extra.payload.state !== undefined) row.state = extra.payload.state;
        }
        return { ok: true };
      }

      if (op === 'sessions-roster') {
        return roster;
      }

      if (op === 'registrations-create') {
        roster = [
          {
            id: 'reg-1',
            obligation_id: 'obl-1',
            revision: 1,
            state: 'waitlisted',
            name: 'Alex',
            contact: { contact_name: 'Alex' },
            checked_in_at: null,
          },
        ];
        return { ...roster[0] };
      }

      if (op === 'registrations-get') {
        const row = roster.find((item) => item.id === extra.registration_id);
        if (!row) throw new Error(`unknown registration ${extra.registration_id}`);
        return { ...row };
      }

      if (op === 'registrations-cancel') {
        const row = roster.find((item) => item.id === extra.registration_id);
        if (!row) throw new Error(`unknown registration ${extra.registration_id}`);
        row.revision = 2;
        row.state = 'cancelled';
        roster = [
          ...roster,
          {
            id: 'reg-2',
            obligation_id: 'obl-2',
            revision: 2,
            state: 'confirmed',
            name: 'Alex',
            contact: { contact_name: 'Alex' },
            checked_in_at: null,
          },
        ];
        return { ...row };
      }

      if (op === 'registrations-check-in') {
        const row = roster.find((item) => item.id === extra.registration_id);
        if (!row) throw new Error(`unknown registration ${extra.registration_id}`);
        if (row.state !== 'confirmed') {
          throw new Error(`registration ${extra.registration_id} is ${row.state}`);
        }
        row.checked_in_at = '2025-06-01T09:15:00-04:00';
        row.revision += 1;
        return { ...row };
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

    const { renderSessions } = await import('/src/parks/sessions-render.ts');
    const { bindSessions } = await import('/src/parks/sessions.ts');
    const { bindEnrollment } = await import('/src/parks/enrollment.ts');

    document.body.insertAdjacentHTML('beforeend', renderSessions());
    const root = document.querySelector('section.parks-sessions') as HTMLElement;

    bindEnrollment(root, ctx);
    const sessionBinding = bindSessions(root, ctx);
    await sessionBinding();
  });
}

test('reservations: resource/household, availability, recurring create, fresh revision transition/reschedule, closure revision refresh', async ({ page }) => {
  await mountReservations(page);

  await page.getByLabel('Resource', { exact: true }).selectOption('res-1');
  await expect(page.locator('[data-booking-list] option[value="bk-1"]')).toHaveCount(1);
  await expect(page.locator('[data-closure-list] option[value="cl-1"]')).toHaveCount(1);

  await page.locator('[data-booking-create] [name="starts_at"]').fill('2025-06-01T09:00:00-04:00');
  await page.locator('[data-booking-create] [name="ends_at"]').fill('2025-06-01T10:30:00-04:00');
  await page.locator('[data-booking-availability]').click();

  await expect
    .poll(() => page.evaluate(() => (window as any).calls.find((entry: Call) => entry.op === 'availability-query')?.extra))
    .toEqual({
      resource_id: 'res-1',
      start: '2025-06-01T09:00:00-04:00',
      end: '2025-06-01T10:30:00-04:00',
    });

  await page.evaluate(() => {
    const root = document.querySelector('[aria-labelledby="parks-reservation-title"]') as HTMLElement;
    root.dispatchEvent(
      new CustomEvent('parks-household-selected', { detail: { id: 'hh-42' } }),
    );
  });
  await expect(page.locator('[data-booking-household]')).toHaveValue('hh-42');

  await page.locator('[data-booking-create] [name="purpose"]').fill('Family reunion');
  await page.locator('[data-booking-create] [name="repeats"]').fill('1');
  await page.locator('[data-preview-occurrences]').click();
  await page.locator('[data-booking-create] button[type="submit"]').click();

  await expect
    .poll(() => page.evaluate(() => (window as any).calls.find((entry: Call) => entry.op === 'bookings-create')?.extra))
    .toEqual({
      payload: {
        resource_id: 'res-1',
        household_id: 'hh-42',
        expected_resource_revision: 1,
        occurrences: [
          {
            starts_at: '2025-06-01T09:00:00.000-04:00',
            ends_at: '2025-06-01T10:30:00.000-04:00',
          },
        ],
        purpose: 'Family reunion',
      },
    });

  await page.locator('[data-booking-list]').selectOption('bk-1');
  await expect
    .poll(() => page.evaluate(() => (window as any).calls.find((entry: Call) => entry.op === 'bookings-get')?.extra))
    .toEqual({ booking_id: 'bk-1' });

  await page.locator('[data-booking-transition] [name="state"]').selectOption('confirmed');
  await page.locator('[data-booking-transition] [name="reason"]').fill('Approved by staff');
  await page.locator('[data-booking-transition] button[type="submit"]').click();

  await expect
    .poll(() => page.evaluate(() => (window as any).calls.find((entry: Call) => entry.op === 'bookings-transition')?.extra))
    .toEqual({
      booking_id: 'bk-1',
      payload: {
        expected_revision: 1,
        state: 'confirmed',
        reason: 'Approved by staff',
      },
    });

  await expect
    .poll(() => page.evaluate(() => (window as any).calls.filter((entry: Call) => entry.op === 'bookings-get').length))
    .toBeGreaterThan(1);

  await page.locator('[data-booking-reschedule] [name="starts_at"]').fill('2025-06-02T09:00:00-04:00');
  await page.locator('[data-booking-reschedule] [name="ends_at"]').fill('2025-06-02T10:30:00-04:00');
  await page.locator('[data-booking-reschedule] [name="reason"]').fill('Weather delay');
  await page.locator('[data-booking-reschedule] button[type="submit"]').click();

  await expect
    .poll(() => page.evaluate(() => (window as any).calls.find((entry: Call) => entry.op === 'bookings-reschedule')?.extra))
    .toEqual({
      booking_id: 'bk-1',
      payload: {
        expected_revision: 2,
        starts_at: '2025-06-02T09:00:00-04:00',
        ends_at: '2025-06-02T10:30:00-04:00',
        reason: 'Weather delay',
      },
    });

  await page.locator('[data-closure-add] [name="starts_at"]').fill('2025-08-01T00:00:00-04:00');
  await page.locator('[data-closure-add] [name="ends_at"]').fill('2025-08-01T23:59:59-04:00');
  await page.locator('[data-closure-add] [name="reason"]').fill('Maintenance');
  await page.locator('[data-closure-add] button[type="submit"]').click();

  await expect
    .poll(() => page.evaluate(() => (window as any).calls.find((entry: Call) => entry.op === 'closures-create')?.extra))
    .toEqual({
      resource_id: 'res-1',
      payload: {
        expected_revision: 1,
        starts_at: '2025-08-01T00:00:00-04:00',
        ends_at: '2025-08-01T23:59:59-04:00',
        reason: 'Maintenance',
      },
    });

  await expect
    .poll(() => page.evaluate(() => (window as any).calls.filter((entry: Call) => entry.op === 'catalog-get').length))
    .toBeGreaterThan(0);

  await page.locator('[data-closure-list]').selectOption('cl-1');
  await page.locator('[data-closure-reason]').fill('Closure lifted');
  await page.locator('[data-closure-remove]').click();

  await expect
    .poll(() => page.evaluate(() => (window as any).calls.find((entry: Call) => entry.op === 'closures-delete')?.extra))
    .toEqual({
      resource_id: 'res-1',
      closure_id: 'cl-1',
      payload: {
        expected_revision: 2,
        reason: 'Closure lifted',
      },
    });

  await expect
    .poll(() => page.evaluate(() => (window as any).calls.filter((entry: Call) => entry.op === 'catalog-get').length))
    .toBeGreaterThan(1);

  const unknown = await page.evaluate(() =>
    (window as any).calls.filter((entry: Call) => entry.op === 'Unknown native op'),
  );
  expect(unknown).toEqual([]);
});

test('sessions: create/edit/current revision, participant registration, waitlist state, cancel refresh, fresh check-in revision', async ({ page }) => {
  await mountSessions(page);

  await page.getByLabel('Program', { exact: true }).selectOption('prog-1');
  await expect(page.locator('[data-session-list] option[value="sess-1"]')).toHaveCount(1);

  await page.locator('[data-session-create] [name="starts_at"]').fill('2025-06-01T09:00:00-04:00');
  await page.locator('[data-session-create] [name="ends_at"]').fill('2025-06-01T10:30:00-04:00');
  await page.locator('[data-session-create] [name="capacity"]').fill('12');
  await page.locator('[data-session-create] [name="fee_cents"]').fill('500');
  await page.locator('[data-session-create] [name="currency"]').selectOption('USD');
  await page.locator('[data-session-create] button[type="submit"]').click();

  await expect
    .poll(() => page.evaluate(() => (window as any).calls.find((entry: Call) => entry.op === 'sessions-create')?.extra))
    .toEqual({
      payload: {
        program_id: 'prog-1',
        starts_at: '2025-06-01T09:00:00-04:00',
        ends_at: '2025-06-01T10:30:00-04:00',
        capacity: 12,
        fee_cents: 500,
        currency: 'USD',
      },
    });

  await page.getByLabel('Session', { exact: true }).selectOption('sess-1');
  await expect
    .poll(() => page.evaluate(() => (window as any).calls.find((entry: Call) => entry.op === 'sessions-get' && entry.extra.session_id === 'sess-1')?.extra))
    .toEqual({ session_id: 'sess-1' });

  await page.evaluate(() => {
    const root = document.querySelector('section.parks-sessions') as HTMLElement;
    root.dispatchEvent(
      new CustomEvent('parks-participant-selected', {
        detail: { id: 'part-1', name: 'Alex', household_id: 'hh-42' },
      }),
    );
  });
  await expect(page.locator('[data-registration-participant]')).toHaveValue('Alex');

  await page.locator('[data-registration-create] button[type="submit"]').click();

  await expect
    .poll(() => page.evaluate(() => (window as any).calls.find((entry: Call) => entry.op === 'registrations-create')?.extra))
    .toEqual({
      payload: {
        session_id: 'sess-1',
        participant_id: 'part-1',
        expected_session_revision: 1,
      },
    });

  await expect
    .poll(() => page.locator('[data-session-roster] tr').count())
    .toBeGreaterThan(0);
  await expect(page.locator('[data-session-roster]')).toContainText('waitlisted');
  await expect(page.locator('[data-session-roster]')).toContainText('Alex');

  await page.locator('[data-registration-list]').selectOption('reg-1');
  await expect
    .poll(() => page.evaluate(() => (window as any).calls.find((entry: Call) => entry.op === 'registrations-get')?.extra))
    .toEqual({ registration_id: 'reg-1' });
  await expect(page.locator('[data-registration-details]')).toContainText('Revision: 1');

  await page.locator('[data-session-edit] [name="capacity"]').fill('15');
  await page.locator('[data-session-edit] [name="state"]').selectOption('open');
  await page.locator('[data-session-edit] button[type="submit"]').click();

  await expect
    .poll(() => page.evaluate(() => (window as any).calls.find((entry: Call) => entry.op === 'sessions-update')?.extra))
    .toEqual({
      session_id: 'sess-1',
      payload: {
        expected_revision: 1,
        capacity: 15,
        state: 'open',
        starts_at: '2025-06-01T09:00:00-04:00',
        ends_at: '2025-06-01T10:30:00-04:00',
      },
    });

  await expect
    .poll(() => page.evaluate(() => (window as any).calls.filter((entry: Call) => entry.op === 'sessions-get').length))
    .toBeGreaterThan(1);

  await page.locator('[data-session-edit] [name="capacity"]').fill('20');
  await page.locator('[data-session-edit] [name="state"]').selectOption('open');
  await page.locator('[data-session-edit] button[type="submit"]').click();

  await expect
    .poll(() => page.evaluate(() => (window as any).calls.filter((entry: Call) => entry.op === 'sessions-update')[1]?.extra))
    .toEqual({
      session_id: 'sess-1',
      payload: {
        expected_revision: 2,
        capacity: 20,
        state: 'open',
        starts_at: '2025-06-01T09:00:00-04:00',
        ends_at: '2025-06-01T10:30:00-04:00',
      },
    });

  const beforeCancel = await page.evaluate(() => ({
    sessionsGet: (window as any).calls.filter((entry: Call) => entry.op === 'sessions-get').length,
    roster: (window as any).calls.filter((entry: Call) => entry.op === 'sessions-roster').length,
  }));

  await page.locator('[data-registration-cancel] [name="reason"]').fill('Family emergency');
  await page.locator('[data-registration-cancel] button[type="submit"]').click();

  await expect
    .poll(() => page.evaluate(() => (window as any).calls.find((entry: Call) => entry.op === 'registrations-cancel')?.extra))
    .toEqual({
      registration_id: 'reg-1',
      payload: {
        expected_revision: 1,
        reason: 'Family emergency',
      },
    });

  await expect
    .poll(() => page.evaluate(() => (window as any).calls.filter((entry: Call) => entry.op === 'sessions-get').length))
    .toBeGreaterThan(beforeCancel.sessionsGet);

  await expect
    .poll(() => page.evaluate(() => (window as any).calls.filter((entry: Call) => entry.op === 'sessions-roster').length))
    .toBeGreaterThan(beforeCancel.roster);

  await expect(page.locator('[data-registration-details]')).toContainText('Revision: 2');

  await page.locator('[data-registration-list]').selectOption('reg-2');
  await expect
    .poll(() => page.evaluate(() => (window as any).calls.find((entry: Call) => entry.op === 'registrations-get' && entry.extra.registration_id === 'reg-2')?.extra))
    .toEqual({ registration_id: 'reg-2' });
  await expect(page.locator('[data-registration-details]')).toContainText('Revision: 2');

  await page.locator('[data-registration-check-in] [name="reason"]').fill('Arrived on time');
  await page.locator('[data-registration-check-in] button[type="submit"]').click();

  await expect
    .poll(() => page.evaluate(() => (window as any).calls.find((entry: Call) => entry.op === 'registrations-check-in')?.extra))
    .toEqual({
      registration_id: 'reg-2',
      payload: {
        expected_revision: 2,
        reason: 'Arrived on time',
      },
    });

  const unknown = await page.evaluate(() =>
    (window as any).calls.filter((entry: Call) => entry.op === 'Unknown native op'),
  );
  expect(unknown).toEqual([]);
});
