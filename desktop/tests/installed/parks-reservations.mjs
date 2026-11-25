import assert from 'node:assert/strict';

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const HOUR = 60 * 60 * 1000;
const WEEK = 7 * 24 * HOUR;
const OVERLAP_MS = 30 * 60 * 1000;

function iso(ms) {
  return new Date(ms).toISOString();
}

function assertNoOverlap(occurrences) {
  const sorted = [...occurrences].sort(
    (a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at),
  );
  for (let i = 1; i < sorted.length; i += 1) {
    assert.ok(
      Date.parse(sorted[i].starts_at) >= Date.parse(sorted[i - 1].ends_at),
      'weekly recurrence instances must not overlap',
    );
  }
}

async function expectRejected(task, label) {
  try {
    await task;
  } catch (error) {
    return error;
  }
  throw new Error(`${label} must be rejected`);
}

export async function installedParksReservations({ page, native, save }) {
  assert.ok(page, 'page is required');
  assert.ok(native, 'native parks_request is required');

  let invoke;
  if (typeof native === 'function') {
    invoke = (request) => native('parks_request', { request });
  } else if (typeof native.parks_request === 'function') {
    invoke = (request) => native.parks_request({ request });
  } else if (typeof native.invoke === 'function') {
    invoke = (request) => native.invoke('parks_request', { request });
  } else {
    throw new Error('native parks_request is unavailable');
  }

  const call = async (request) => {
    const response = await invoke(request);
    const result = response?.result ?? response;
    assert.ok(result !== undefined, `empty parks_request result: ${request.operation}`);
    return result;
  };

  const unique = `installed-parks-${Date.now().toString(36)}`;
  const allDayHours = [['00:00', '24:00']];
  const hours = Object.fromEntries(DAYS.map((day) => [day, allDayHours]));

  const futureStartMs = Date.now() + 10 * 24 * HOUR;
  const futureStart = new Date(futureStartMs);
  futureStart.setUTCHours(12, 0, 0, 0);
  const startsAt = futureStart.toISOString();
  const endsAt = iso(futureStart.getTime() + HOUR);

  await page.evaluate(async () => {
    await window.audit.click('[data-surface="Staff"]', { confirm: false });
    await window.audit.nav('parks');
  });
  await page.locator('[data-resource]').waitFor({ state: 'visible', timeout: 15_000 });
  await page.locator('[data-booking-create]').waitFor({ state: 'visible', timeout: 15_000 });
  await page.locator('[data-booking-resource]').waitFor({ state: 'visible' });

  const resource = await call({
    operation: 'catalog-create',
    kind: 'resource',
    payload: {
      payload: {
        name: `Installed Reservation ${unique}`,
        address: '1 Installed Test Way',
        timezone: 'UTC',
        description: 'Installed parks reservation test resource',
        amenities: [],
        accessibility: '',
        public: true,
        approval_required: false,
        buffer_before_minutes: 30,
        buffer_after_minutes: 30,
        fee_cents: 1000,
        deposit_cents: 200,
        currency: 'USD',
        hours,
      },
    },
  });
  assert.ok(resource?.id, 'resource id missing');
  assert.ok(resource.revision !== undefined, 'resource revision missing');

  const household = await call({
    operation: 'households-create',
    payload: {
      payload: {
        contact_name: `Installed Household ${unique}`,
        email: `${unique}@example.test`,
        phone: '555-0100',
        address: '1 Installed Test Way',
      },
    },
  });
  assert.ok(household?.id, 'household id missing');

  await page.locator('[data-booking-refresh]').click();
  await page.locator('[data-booking-resource]').selectOption(resource.id);
  await page.locator('[data-booking-household]').evaluate((element, householdId) => {
    element.dispatchEvent(
      new CustomEvent('parks-household-selected', {
        detail: { id: householdId },
        bubbles: true,
      }),
    );
  }, household.id);

  const createForm = page.locator('[data-booking-create]');
  await createForm.locator('[name="starts_at"]').fill(startsAt);
  await createForm.locator('[name="ends_at"]').fill(endsAt);
  await createForm.locator('[name="purpose"]').fill(`Installed booking ${unique}`);
  await createForm.locator('[name="repeats"]').fill('1');
  await page.locator('[data-preview-occurrences]').click();
  await page.locator('[data-occurrences]').waitFor({ state: 'visible', timeout: 15_000 });
  await createForm.locator('button[type="submit"]').click();

  await page.waitForFunction(
    () => {
      const list = document.querySelector('[data-booking-list]');
      return list instanceof HTMLSelectElement && list.options.length > 1;
    },
    null,
    { timeout: 15_000 },
  );

  const listBookings = async () => {
    const rows = await call({ operation: 'bookings-list', resource_id: resource.id });
    assert.ok(Array.isArray(rows), 'bookings-list must return an array');
    return rows;
  };

  const rows = await listBookings();
  const primaryRow = rows.find(
    (row) => row && Date.parse(row.starts_at) === Date.parse(startsAt),
  );
  assert.ok(primaryRow, 'native persisted booking missing');
  const primaryId = primaryRow.id ?? primaryRow.booking_id;
  assert.ok(primaryId, 'persisted booking id missing');

  const primary = await call({ operation: 'bookings-get', booking_id: primaryId });
  assert.ok(primary?.obligation_id, 'booking obligation id missing');
  assert.equal(primary.resource_id, resource.id);
  assert.equal(primary.household_id, household.id);
  assert.ok(['confirmed', 'pending', 'approved'].includes(primary.state ?? primary.status));

  const currentResource = await call({
    operation: 'catalog-get',
    kind: 'resource',
    id: resource.id,
  });
  assert.ok(currentResource?.revision !== undefined, 'current resource revision missing');

  const overlapStart = iso(Date.parse(startsAt) + OVERLAP_MS);
  const overlapEnd = iso(Date.parse(endsAt) + HOUR);
  const countBeforeOverlap = (await listBookings()).length;
  await expectRejected(
    call({
      operation: 'bookings-create',
      payload: {
        resource_id: resource.id,
        household_id: household.id,
        expected_resource_revision: currentResource.revision,
        occurrences: [{ starts_at: overlapStart, ends_at: overlapEnd }],
        purpose: `Installed overlap ${unique}`,
      },
    }),
    'competing overlap booking',
  );
  assert.equal(
    (await listBookings()).length,
    countBeforeOverlap,
    'rejected overlap must not allocate a booking',
  );

  const weeklyStart = iso(Date.parse(startsAt) + WEEK);
  const weeklyEnd = iso(Date.parse(endsAt) + WEEK);
  const weeklyOccurrences = [0, 1, 2].map((index) => ({
    starts_at: iso(Date.parse(weeklyStart) + index * WEEK),
    ends_at: iso(Date.parse(weeklyEnd) + index * WEEK),
  }));
  assertNoOverlap(weeklyOccurrences);

  const weeklyResponse = await call({
    operation: 'bookings-create',
    payload: {
      resource_id: resource.id,
      household_id: household.id,
      expected_resource_revision: currentResource.revision,
      occurrences: weeklyOccurrences,
      purpose: `Installed weekly ${unique}`,
    },
  });
  const weeklyBookings = weeklyResponse.bookings ?? weeklyResponse;
  assert.ok(Array.isArray(weeklyBookings), 'weekly booking response must include bookings');
  assert.equal(weeklyBookings.length, 3, 'weekly recurrence must create three instances');
  assertNoOverlap(
    weeklyBookings.map((booking) => ({
      starts_at: booking.starts_at,
      ends_at: booking.ends_at,
    })),
  );

  const mutationStart = iso(Date.parse(startsAt) + 8 * 24 * HOUR);
  const mutationEnd = iso(Date.parse(mutationStart) + HOUR);
  const mutationResponse = await call({
    operation: 'bookings-create',
    payload: {
      resource_id: resource.id,
      household_id: household.id,
      expected_resource_revision: currentResource.revision,
      occurrences: [{ starts_at: mutationStart, ends_at: mutationEnd }],
      purpose: `Installed mutation ${unique}`,
    },
  });
  const mutationRow = (mutationResponse.bookings ?? [])[0];
  assert.ok(mutationRow, 'mutation booking missing');
  const mutationId = mutationRow.id ?? mutationRow.booking_id;
  const mutationRevision = mutationRow.revision;
  assert.ok(mutationId, 'mutation booking id missing');
  assert.ok(mutationRevision !== undefined, 'mutation booking revision missing');

  await page.locator('[data-booking-refresh]').click();
  await page.locator('[data-booking-list]').selectOption(mutationId);
  await page.waitForFunction(
    (id) => {
      const field = document.querySelector('[data-booking-field="booking"]');
      return field?.textContent?.trim() === id;
    },
    mutationId,
    { timeout: 15_000 },
  );

  const rescheduledStarts = iso(Date.parse(mutationStart) + 2 * HOUR);
  const rescheduledEnds = iso(Date.parse(mutationEnd) + 2 * HOUR);
  const rescheduleForm = page.locator('[data-booking-reschedule]');
  await rescheduleForm.locator('[name="starts_at"]').fill(rescheduledStarts);
  await rescheduleForm.locator('[name="ends_at"]').fill(rescheduledEnds);
  await rescheduleForm.locator('[name="reason"]').fill('Installed reschedule check');
  await rescheduleForm.locator('button[type="submit"]').click();
  await page.waitForFunction(
    (ms) => {
      const field = document.querySelector('[data-booking-field="starts_at"]');
      return typeof field?.textContent === 'string' && Date.parse(field.textContent) === ms;
    },
    Date.parse(rescheduledStarts),
    { timeout: 15_000 },
  );

  const rescheduled = await call({ operation: 'bookings-get', booking_id: mutationId });
  assert.equal(Date.parse(rescheduled.starts_at), Date.parse(rescheduledStarts));
  assert.ok(rescheduled.revision > mutationRevision, 'reschedule must revise booking');

  const transitionForm = page.locator('[data-booking-transition]');
  await transitionForm.locator('[name="state"]').selectOption('cancelled');
  await transitionForm.locator('[name="reason"]').fill('Installed cancel check');
  await transitionForm.locator('button[type="submit"]').click();
  await page.waitForFunction(
    () => document.querySelector('[data-booking-field="status"]')?.textContent === 'cancelled',
    null,
    { timeout: 15_000 },
  );

  const cancelled = await call({ operation: 'bookings-get', booking_id: mutationId });
  assert.equal(String(cancelled.id ?? cancelled.booking_id), mutationId);
  assert.equal(cancelled.status ?? cancelled.state, 'cancelled');
  assert.ok(
    cancelled.revision > rescheduled.revision,
    'cancel must revise booking after reschedule',
  );

  const artifact = {
    unique,
    resource_id: resource.id,
    household_id: household.id,
    original_booking_id: primaryId,
    original_obligation_id: primary.obligation_id,
    recurring_booking_ids: weeklyBookings
      .map((booking) => booking.id ?? booking.booking_id)
      .filter(Boolean),
    mutation_booking_id: mutationId,
  };
  const mutationObligationId = cancelled.obligation_id ?? mutationRow.obligation_id;
  if (mutationObligationId) artifact.mutation_obligation_id = mutationObligationId;

  if (typeof save === 'function') await save('installed-parks-reservations', artifact);
  return artifact;
}
