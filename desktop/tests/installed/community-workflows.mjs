import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync} from 'node:fs';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {readFile, readdir, writeFile} from 'node:fs/promises';

import {installedServiceRequests} from './service-requests-workflow.mjs';
import {installedResident311} from './resident-311.mjs';
import {createApprovedCommunication} from './communications-draft.mjs';
import {preparePublicMeetingSource} from './communications-source.mjs';
import {installedResidentParks} from './parks-resident-browser.mjs';
import {installedCommunicationsDelivery} from './communications-delivery.mjs';
import {installedParksReservations} from './parks-reservations.mjs';
import {installedParksEnrollment} from './parks-enrollment.mjs';
import {installedParksFinanceRecords} from './parks-finance-records.mjs';
import {installedParksMaintenanceData} from './parks-maintenance-data.mjs';
import {ensureResidentSubscriber} from './resident-communications.mjs';

const LOCAL_PORT = process.env.TOWNLIGHT_LOCAL_PORT || '15480';

async function readSessionHash() {
  const file = join(process.env.LOCALAPPDATA, "CivicSuite", "config", "local-session.json");
  const parsed = JSON.parse(await readFile(file, 'utf8'));
  if (typeof parsed.session_hash === 'string' && parsed.session_hash) return parsed.session_hash;
  throw new Error('local-session.json with session_hash not found');
}

async function configureEmail(native, fixtureRoot) {
  const state = JSON.parse(await readFile(join(fixtureRoot, 'fixture-state.json'), 'utf8'));
  assert.ok(Number.isInteger(state?.ports?.smtp), 'fixture smtp port');
  assert.ok(state?.paths?.cert, 'fixture cert path');
  await native('service_requests_request', {
    request: {
      operation: 'save-email-settings',
      payload: {
        enabled: true,
        host: '127.0.0.1',
        port: state.ports.smtp,
        sender: 'fixture@example.test',
        username: '',
        password: '',
        clear_password: true,
      },
    },
  });
}

async function nav(page, target) {
  await page.evaluate(async (target) => {
    await window.audit.click('[data-surface="Staff"]', {confirm: false});
    await window.audit.nav(target);
  }, target);
}

async function waitMailJson(fixtureRoot, recipient, expectedBody) {
  const dir = join(fixtureRoot, 'mail');
  const deadline = Date.now() + 60_000;
  let count = 0;
  while (Date.now() < deadline) {
    let names = [];
    try { names = await readdir(dir); } catch {}
    count = names.length;
    for (const name of names) {
      if (!name.endsWith('.json')) continue;
      try {
        const parsed = JSON.parse(await readFile(join(dir, name), 'utf8'));
        const recipients = Array.isArray(parsed.recipients) ? parsed.recipients : [];
        if (!recipients.some(r => typeof r === 'string' && r.toLowerCase().includes(recipient.toLowerCase()))) continue;
        const emlName = parsed?.eml;
        if (typeof emlName !== 'string' || !emlName) continue;
        const base = emlName.split(/[\\/]/).pop();
        if (!base || base !== emlName || base === '.' || base === '..') continue;
        const raw = await readFile(join(dir, base), 'latin1');
        const decoded = Buffer.from(raw.replace(/=\r?\n/g, '').replace(/=([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16))), 'latin1').toString('utf8');
        if (expectedBody && !decoded.includes(expectedBody)) continue;
        return parsed;
      } catch {}
    }
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error(`no captured mail JSON for ${recipient}; ${count} files in ${dir}`);
}

async function downloadRecordsAttachment({requestId, attachmentId, expectedSha256, expectedSize}) {
  const sessionHash = await readSessionHash();
  const url = `http://127.0.0.1:${LOCAL_PORT}/desktop/v1/requests/${requestId}/documents/${attachmentId}/content`;
  const response = await fetch(url, {headers: {'X-Townlight-Session': sessionHash}});
  assert.equal(response.status, 200, `records download HTTP ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  assert.equal(buffer.length, expectedSize, 'records download size');
  assert.equal(createHash('sha256').update(buffer).digest('hex'), expectedSha256, 'records download sha256');
  return buffer;
}

export async function communityWorkflows({page, native, save, meetingId, output, fixtureRoot, portalBaseUrl}) {
  assert.ok(page && native, 'page and native required');
  assert.ok(meetingId, 'meetingId required');
  assert.ok(fixtureRoot, 'fixtureRoot required');
  assert.ok(portalBaseUrl, 'portalBaseUrl required');

  await configureEmail(native, fixtureRoot);

  await nav(page, 'service-requests');
  const staff = await installedServiceRequests({
    page,
    native,
    save,
    portalBaseUrl,
    downloadRecordsAttachment,
    captureMessage: (recipient, expectedBody) => waitMailJson(fixtureRoot, recipient, expectedBody),
  });

  const resident = await installedResident311({native, portalBaseUrl, save, categoryCode: staff.ids.category});

  await nav(page, 'communications');
  const publicSource = await preparePublicMeetingSource({native, meetingId, save});
  const article = await createApprovedCommunication({page, native, meetingId: publicSource.publicRecordId});
  const subscriber = await ensureResidentSubscriber({portalBaseUrl, fixtureRoot, save});
  assert.ok(subscriber?.email, 'resident subscriber email');

  const delivery = await installedCommunicationsDelivery({
    page, native, save, article, portalBaseUrl,
    subscriberEmail: subscriber.email,
    captureMessage: () => waitMailJson(fixtureRoot, subscriber.email, article.body),
    downloadRecordsAttachment,
  });
  assert.ok(delivery?.email?.summary, 'delivery email summary required');

  await nav(page, 'parks');
  const reservations = await installedParksReservations({page, native, save});

  await nav(page, 'parks');
  const enrollment = await installedParksEnrollment({page, native, save, householdId: reservations.household_id});

  await nav(page, 'parks');
  const finance = await installedParksFinanceRecords({
    page, native, save,
    bookingId: reservations.original_booking_id,
    obligationId: reservations.original_obligation_id,
    downloadRecordsAttachment,
  });

  await nav(page, 'parks');
  const startsAt = new Date();
  startsAt.setUTCDate(startsAt.getUTCDate() + 8);
  startsAt.setUTCHours(15, 0, 0, 0);
  const endsAt = new Date(startsAt.getTime() + 60 * 60 * 1000);
  const residentSessionResponse = await native('parks_request', {
    request: {
      operation: 'sessions-create',
      payload: {
        program_id: enrollment.programId,
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
        capacity: 2,
        fee_cents: 0,
        currency: 'USD',
      },
    },
  });
  const residentSession = residentSessionResponse?.result ?? residentSessionResponse;
  const residentParks = await installedResidentParks({
    native, save,
    portalBaseUrl,
    resourceId: reservations.resource_id,
    sessionId: residentSession.session_id ?? residentSession.id,
  });
  assert.equal(residentParks?.passed, true, 'resident parks browser passed');
  const maintenance = await installedParksMaintenanceData({
    page, native, save,
    resourceId: reservations.resource_id,
    portalBaseUrl,
  });

  const summary = {
    ids: {
      serviceRequest: staff?.ids?.main_request ?? null,
      residentRequest: resident?.evidence?.requestId ?? null,
      communication: article?.id ?? null,
      parksResource: reservations?.resource_id ?? null,
      parksHousehold: reservations?.household_id ?? null,
      parksBooking: reservations?.original_booking_id ?? null,
      parksObligation: reservations?.original_obligation_id ?? null,
      parksProgram: enrollment?.programId ?? null,
      parksResidentBooking: residentParks?.actualIds?.bookingId ?? null,
      parksResidentRegistration: residentParks?.actualIds?.registrationId ?? null,
      parksSession: enrollment?.sessionId ?? null,
      parksFinanceRecords: finance?.ids?.records_request ?? null,
      parksFinanceAttachment: finance?.ids?.records_attachment ?? null,
      parksMaintenanceRequest: maintenance?.requestId ?? null,
    },
    messageCounts: {
      residentUpdates: resident?.evidence?.addInfo?.message ? 1 : 0,
      residentPhotos: resident?.evidence?.photo ? 1 : 0,
      communicationsEmails: Number(delivery?.email?.summary?.sent ?? 0),
      publicComments: staff?.milestones?.public_comment ? 1 : 0,
      internalComments: staff?.milestones?.internal_comment ? 1 : 0,
    },
    capturedMail: Boolean(delivery?.email),
  };
  assert.ok(summary.ids.serviceRequest && summary.ids.communication && summary.ids.parksBooking && summary.ids.parksMaintenanceRequest, 'community workflow ids required');
  assert.ok((summary.messageCounts?.communicationsEmails || 0) > 0, 'communications emails required');
  assert.equal(summary.capturedMail, true, 'captured mail required');
  summary.passed = true;
  if (typeof save === 'function') await save('community-workflows', summary);
  return summary;
}

export async function communityReadback({native, ids, save}) {
  assert.equal(typeof native, 'function', 'native required');
  assert.ok(ids && typeof ids === 'object', 'ids required');
  const call = async (command, request) => {
    const response = await native(command, {request});
    return response?.result ?? response;
  };
  const findings = {};
  const run = async (key, expectedId, fn) => {
    if (!expectedId) throw new Error(`${key} id is required`);
    const result = await fn();
    if (result?.id !== expectedId) throw new Error(`${key} readback id mismatch`);
    findings[key] = result;
  };

  await run('serviceRequest', ids.serviceRequest, async () => {
    const r = await call('service_requests_request', {operation: 'request', id: ids.serviceRequest});
    const req = r?.request ?? r;
    return {id: req.id, state: req.state, revision: req.revision};
  });

  await run('residentRequest', ids.residentRequest, async () => {
    const r = await call('service_requests_request', {operation: 'request', id: ids.residentRequest});
    const req = r?.request ?? r;
    return {id: req.id, state: req.state, revision: req.revision};
  });

  await run('communication', ids.communication, async () => {
    const r = await call('communications_request', {operation: 'article', id: ids.communication});
    const a = r?.article ?? r;
    return {id: a.id, state: a.state, revision: a.current_revision, sha256: a.revision?.sha256};
  });

  await run('booking', ids.parksBooking, async () => {
    const b = await call('parks_request', {operation: 'bookings-get', booking_id: ids.parksBooking});
    const bk = b?.booking ?? b;
    return {id: bk.id, state: bk.state ?? bk.status, revision: bk.revision};
  });

  await run('residentBooking', ids.parksResidentBooking, async () => {
    const b = await call('parks_request', {operation: 'bookings-get', booking_id: ids.parksResidentBooking});
    const bk = b?.booking ?? b;
    return {id: bk.id, state: bk.state ?? bk.status, revision: bk.revision};
  });

  await run('residentRegistration', ids.parksResidentRegistration, async () => {
    const r = await call('parks_request', {operation: 'registrations-get', registration_id: ids.parksResidentRegistration});
    const reg = r?.registration ?? r;
    return {id: reg.id, state: reg.state ?? reg.status, revision: reg.revision};
  });

  await run('obligation', ids.parksObligation, async () => {
    const r = await call('parks_request', {operation: 'obligation-get', id: ids.parksObligation});
    const obligation = r?.obligation ?? r;
    if (obligation?.id !== ids.parksObligation) throw new Error(`obligation-get returned ${obligation?.id}, expected ${ids.parksObligation}`);
    return {id: obligation.id, totals: obligation?.totals ?? null};
  });

  await run('resource', ids.parksResource, async () => {
    const r = await call('parks_request', {operation: 'catalog-get', kind: 'resource', id: ids.parksResource});
    const res = r?.resource ?? r?.entry ?? r;
    return {id: res.id, revision: res.revision};
  });

  await run('session', ids.parksSession, async () => {
    const r = await call('parks_request', {operation: 'sessions-get', session_id: ids.parksSession});
    const s = r?.session ?? r;
    return {id: s.id, revision: s.revision, capacity: s.capacity};
  });

  await run('maintenance', ids.parksMaintenanceRequest, async () => {
    const r = await call('service_requests_request', {operation: 'request', id: ids.parksMaintenanceRequest});
    const req = r?.request ?? r;
    return {id: req.id, state: req.state, revision: req.revision};
  });

  if (typeof save === 'function') await save('community-readback', findings);
  return findings;
}
