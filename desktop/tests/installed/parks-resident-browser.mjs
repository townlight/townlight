import { chromium } from 'playwright';

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const purposeText = 'Resident browser verification';
const participantName = 'Browser Resident';

function must(value, message) {
  if (!value) throw new Error(message);
  return value;
}

function canonical(text, label) {
  const match = String(text || '').match(UUID);
  return must(match, label + ' canonical ID missing')[0].toLowerCase();
}

function utcSlot(days) {
  const start = new Date();
  start.setUTCDate(start.getUTCDate() + days);
  start.setUTCHours(10, 0, 0, 0);
  const end = new Date(start);
  end.setUTCHours(11, 0, 0, 0);
  const iso = (value) => value.toISOString().replace(/\.000Z$/, '+00:00');
  return { start: iso(start), end: iso(end) };
}

async function nativeRead(native, kind, id) {
  must(typeof native === 'function', 'Missing native function precondition');
  const response = await native('parks_request', {
    request: {
      operation: kind === 'booking' ? 'bookings-get' : 'registrations-get',
      [kind === 'booking' ? 'booking_id' : 'registration_id']: id,
    },
  });
  return response && response.result !== undefined ? response.result : response;
}

export async function installedResidentParks({
  portalBaseUrl,
  native,
  save,
  resourceId,
  sessionId,
}) {
  must(portalBaseUrl, 'Missing portalBaseUrl precondition');
  must(typeof native === 'function', 'Missing native function precondition');
  must(typeof save === 'function', 'Missing save precondition');
  must(resourceId, 'Missing resourceId precondition');
  must(sessionId, 'Missing sessionId precondition');

  const root = new URL(portalBaseUrl);
  const browser = await chromium.launch({
    headless: true,
    channel:
      process.env.TOWNLIGHT_BROWSER_CHANNEL ||
      (process.platform === 'win32' ? 'msedge' : undefined),
  });

  try {
    const context = await browser.newContext({ baseURL: root.origin });
    const page = await context.newPage();

    async function nav(path) {
      await page.goto(new URL(path, root).href);
      await page.waitForLoadState('domcontentloaded');
    }

    async function settle() {
      for (let index = 0; index < 80; index += 1) {
        const status = page.locator('a[href*="/parks/commands/"]').first();
        if ((await status.count()) === 0) return;
        const href = must(await status.getAttribute('href'), 'Host status link missing');
        await page.waitForTimeout(500);
        await page.goto(new URL(href, root).href);
        await page.waitForLoadState('domcontentloaded');
      }
      throw new Error('Host command did not complete');
    }

    async function openHousehold() {
      await nav('/parks/household/');
      await settle();
    }

    await nav('/parks/household/new/');
    const createForm = page.locator('form').filter({
      has: page.locator('input[name="contact_name"]'),
    }).first();
    must(await createForm.count(), 'Household creation form missing');
    await createForm.locator('input[name="contact_name"]').fill(participantName);
    await createForm.locator('input[name="email"]').fill('browser-resident@example.invalid');
    await createForm.locator('input[name="phone"]').fill('+10000000000');
    await createForm.locator('textarea[name="address"]').fill('Browser verification address');
    await createForm.locator('input[name="language"]').fill('en');
    await createForm.locator('button[type="submit"]').click();
    await page.waitForLoadState('domcontentloaded');
    await settle();

    const captureLink = page.getByRole('link', {name: /^\/parks\/household\/[A-Za-z0-9_-]{43}\/$/}).first();
    must(await captureLink.count(), 'Household capture link missing');
    const privateUrl = new URL(must(await captureLink.getAttribute('href'), 'Capture href missing'), root).href;
    await page.goto(privateUrl);
    await page.waitForLoadState('domcontentloaded');
    await settle();
    await openHousehold();

    const addForm = page.locator('form').filter({
      has: page.locator('button[name="action"][value="add_participant"]'),
    }).first();
    must(await addForm.count(), 'Add participant form missing');
    await addForm.locator('input[name="name"]').fill(participantName);
    await addForm.locator('input[name="birth_date"]').fill('1990-01-01');
    await addForm.locator('textarea[name="accommodations"]').fill('');
    await addForm.locator('button[name="action"][value="add_participant"]').click();
    await page.waitForLoadState('domcontentloaded');
    await settle();
    await openHousehold();

    const participantArticle = page.locator('article').filter({ hasText: participantName }).first();
    must(await participantArticle.count(), 'Participant household record missing');
    const participantId = canonical(
      await participantArticle.locator('dt:has-text("Participant ID") + dd').first().innerText(),
      'participant',
    );

    const resourcePath = '/parks/resources/' + encodeURIComponent(resourceId) + '/';
    let chosen = null;
    for (let days = 1; days <= 7; days += 1) {
      await nav(resourcePath);
      const availabilityForm = page.locator('form').filter({
        has: page.locator('input[name="action"][value="availability"]'),
      }).first();
      must(await availabilityForm.count(), 'Availability form missing');
      const slot = utcSlot(days);
      await availabilityForm.locator('input[name="starts_at"]').fill(slot.start);
      await availabilityForm.locator('input[name="ends_at"]').fill(slot.end);
      await availabilityForm.locator('button[type="submit"]').click();
      await page.waitForLoadState('domcontentloaded');
      await settle();
      const result = await page.locator('main').innerText();
      if (/\bAvailable\b/.test(result) && !/\bUnavailable\b/.test(result)) {
        chosen = slot;
        break;
      }
    }
    must(chosen, 'No available UTC staff resource slot in future 7 days');

    await nav(resourcePath);
    const bookingForm = page.locator('form').filter({
      has: page.locator('input[name="action"][value="booking"]'),
    }).first();
    must(await bookingForm.count(), 'Booking form missing');
    await bookingForm.locator('input[name="starts_at"]').fill(chosen.start);
    await bookingForm.locator('input[name="ends_at"]').fill(chosen.end);
    await bookingForm.locator('textarea[name="purpose"]').fill(purposeText);
    await bookingForm.locator('input[name="repeat_weeks"]').fill('1');
    await bookingForm.locator('button[type="submit"]').click();
    await page.waitForLoadState('domcontentloaded');
    await settle();
    await openHousehold();

    let bookingArticle = page.locator('article').filter({ hasText: purposeText }).first();
    must(await bookingArticle.count(), 'Booking household record missing');
    const bookingId = canonical(await bookingArticle.locator('h3').first().innerText(), 'booking');
    const nativeBooking = await nativeRead(native, 'booking', bookingId);
    must(nativeBooking, 'Native booking read returned no record');

    const rescheduleForm = bookingArticle.locator('form').filter({
      has: page.locator('button[name="action"][value="reschedule_booking"]'),
    }).first();
    must(await rescheduleForm.count(), 'Reschedule form missing');
    must(await rescheduleForm.locator('input[name="expected_revision"]').getAttribute('value'), 'Reschedule expected revision missing');
    const moved = utcSlot(8);
    await rescheduleForm.locator('input[name="starts_at"]').fill(moved.start);
    await rescheduleForm.locator('input[name="ends_at"]').fill(moved.end);
    await rescheduleForm.locator('textarea[name="reason"]').fill('Resident browser reschedule verification');
    await rescheduleForm.locator('button[name="action"][value="reschedule_booking"]').click();
    await page.waitForLoadState('domcontentloaded');
    await settle();
    await openHousehold();

    bookingArticle = page.locator('article').filter({ hasText: purposeText }).first();
    must(await bookingArticle.count(), 'Rescheduled booking record missing');
    const cancelForm = bookingArticle.locator('form').filter({
      has: page.locator('button[name="action"][value="cancel_booking"]'),
    }).first();
    must(await cancelForm.count(), 'Cancel form missing');
    must(await cancelForm.locator('input[name="expected_revision"]').getAttribute('value'), 'Cancel expected revision missing');
    await cancelForm.locator('textarea[name="reason"]').fill('Resident browser cancellation verification');
    await cancelForm.locator('button[name="action"][value="cancel_booking"]').click();
    await page.waitForLoadState('domcontentloaded');
    await settle();
    await openHousehold();

    const finalArticle = page.locator('article').filter({ hasText: purposeText }).first();
    must(await finalArticle.count(), 'Cancelled booking record missing');
    const state = (await finalArticle.locator('dt:has-text("State") + dd').first().innerText()).trim().toLowerCase();
    must(state.includes('cancel'), 'Booking household record was not cancelled');

    let registrationId;
      await nav('/parks/household/?session=' + encodeURIComponent(sessionId));
      await settle();
      const registerForm = page.locator('form').filter({
        has: page.locator('button[name="action"][value="register"]'),
      }).first();
      must(await registerForm.count(), 'Session registration form missing');
      await registerForm.locator('select[name="participant_id"]').selectOption(participantId);
      await registerForm.locator('button[name="action"][value="register"]').click();
      await page.waitForLoadState('domcontentloaded');
      await settle();
      await openHousehold();

      const registrationArticle = page.locator('article').filter({
        has: page.locator('h3', { hasText: 'Registration' }),
      }).first();
      must(await registrationArticle.count(), 'Registration household record missing');
      registrationId = canonical(await registrationArticle.locator('h3').first().innerText(), 'registration');
      const nativeRegistration = await nativeRead(native, 'registration', registrationId);
      must(nativeRegistration, 'Native registration read returned no record');

    const evidence = {
      passed: true,
      actualIds: {
        resourceId,
        participantId,
        bookingId,
        registrationId,
      },
    };
    await save('resident-parks', evidence);
    return evidence;
  } finally {
    await browser.close();
  }
}
