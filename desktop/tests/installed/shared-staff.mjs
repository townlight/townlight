// Run on the disposable Windows host after provisioning the exact installer and
// fixture HTTPS front ends. Use the host fixture CLI and guest mailbox for a
// headless run, or tunnel the second installed WebView's CDP for UI acceptance.
import assert from 'node:assert/strict';
import {execFile, spawn} from 'node:child_process';
import {createHash, randomUUID} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {mkdtemp, mkdir, readFile, writeFile, rename, unlink, rmdir} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createInterface} from 'node:readline';
import {setTimeout as delay} from 'node:timers/promises';
import {promisify} from 'node:util';
import {chromium} from '@playwright/test';
import {stationRecorder} from './station-recorder.mjs';

assert.equal(process.platform, 'win32');
assert(process.env.GITHUB_ACTIONS === 'true' || process.env.TOWNLIGHT_DISPOSABLE_INSTALLED_TEST === '1',
  'Use a disposable Windows acceptance environment.');
const [fixtureFile, output] = process.argv.slice(2);
assert(fixtureFile && output, 'Pass the fixture JSON and the acceptance output directory.');
const fixture = JSON.parse(await readFile(fixtureFile, 'utf8'));
assert.equal(fixture.disposable, true);
assert(fixture.host.machine && fixture.guest.machine && fixture.host.machine !== fixture.guest.machine);
assert.match(fixture.candidate_sha256, /^[0-9a-f]{64}$/);
for (const machine of [fixture.host, fixture.guest]) {
  assert.equal([machine.cdp, machine.mailbox, machine.executable].filter(Boolean).length, 1, 'Provide one transport per fixture PC.');
  if (machine.cdp) assert.match(machine.cdp, /^http:\/\/127\.0\.0\.1:[1-9][0-9]*$/);
  if (machine.mailbox) assert(path.isAbsolute(machine.mailbox));
  if (machine.executable) {
    assert.equal(machine, fixture.host, 'A separate remote workstation uses the guest mailbox or a tunneled CDP endpoint.');
    for (const absolute of [machine.executable, machine.profile, machine.runtime_payload]) assert(path.isAbsolute(absolute));
  }
  assert.equal(machine.installer_sha256, fixture.candidate_sha256, `Incorrect signed installer for ${machine.machine}`);
}
if (fixture.host.cdp && fixture.guest.cdp) assert.notEqual(fixture.host.cdp, fixture.guest.cdp);
if (fixture.host.mailbox && fixture.guest.mailbox) assert.notEqual(fixture.host.mailbox, fixture.guest.mailbox);
assert.equal(new URL(fixture.portal.origin).protocol, 'https:');
assert(path.isAbsolute(fixture.portal.executable) && path.isAbsolute(fixture.portal.working_directory));
assert.equal(fixture.host.machine.toUpperCase(), os.hostname().toUpperCase(), 'Run from the Windows host listed in the fixture.');
assert(fixture.host.clerk.email !== fixture.guest.clerk.email, 'Use distinct named clerk accounts.');
await mkdir(output, {recursive: true});

const checks = [];
const verify = (name, details = {}) => checks.push({name, ...details});
const save = (name, value) => writeFile(path.join(output, `${name}.json`), JSON.stringify(value, null, 2));
const sha256 = async (filename) => {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filename)) hash.update(chunk);
  return hash.digest('hex');
};
const until = async (description, task, timeout = 90000) => {
  const deadline = Date.now() + timeout;
  let observed;
  do {
    try {
      observed = await task();
      if (observed) return observed;
    } catch (error) {
      observed = error.message;
    }
    await delay(750);
  } while (Date.now() < deadline);
  throw Error(`${description} timed out. Last result: ${observed ?? 'none'}`);
};

const openDesktop = async settings => {
  let browser;
  let page;
  let native;
  let close;
  if (settings.executable) {
    const env = {...process.env, TOWNLIGHT_SHARED_STAFF_HOST: '1', TOWNLIGHT_DISPOSABLE_INSTALLED_TEST: '1',
      TOWNLIGHT_SUPPRESS_OPEN_BROWSER: '1', TOWNLIGHT_SUPPRESS_OPEN_FOLDER: '1', TOWNLIGHT_DESKTOP_STATE_DIR: settings.profile};
    delete env.TOWNLIGHT_SHARED_ORIGIN;
    delete env.TOWNLIGHT_BACKUP_DIR;
    delete env.TOWNLIGHT_RUNTIME_PAYLOAD_DIR;
    const processHandle = spawn(settings.executable, ['--townlight-staff-host-fixture'], {
      windowsHide: true, env, stdio: ['pipe', 'pipe', 'pipe'],
    });
    await new Promise((resolve, reject) => { processHandle.once('spawn', resolve); processHandle.once('error', reject); });
    const lines = createInterface({input: processHandle.stdout, crlfDelay: Infinity});
    const replies = lines[Symbol.asyncIterator]();
    let diagnostics = '';
    processHandle.stderr.on('data', chunk => { diagnostics = (diagnostics + chunk).slice(-2000); });
    native = async (command, args = {}) => {
      const fields = {...args};
      for (const [camel, binding] of Object.entries({stepId: 'step_id', serviceId: 'service_id', selectedDirectory: 'selected_directory', meetingId: 'meeting_id'})) {
        if (Object.hasOwn(fields, camel)) {
          fields[binding] = fields[camel];
          delete fields[camel];
        }
      }
      await new Promise((resolve, reject) => processHandle.stdin.write(JSON.stringify({command, ...fields}) + '\n', 'utf8', error => error ? reject(error) : resolve()));
      let reply;
      const timeout = new AbortController();
      try {
        reply = await Promise.race([replies.next(), delay(600000, null, {signal: timeout.signal, ref: false})]);
      } finally {
        timeout.abort();
      }
      if (!reply) {
        processHandle.kill();
        throw Error(`Host fixture timed out completing ${command}.`);
      }
      if (reply.done) throw Error(`Host fixture exited before completing ${command}. ${diagnostics.trim()}`);
      const response = JSON.parse(reply.value);
      if (!response.ok) throw Error(response.error?.message || response.error || 'Host fixture command failed');
      return response.result;
    };
    close = async () => {
      lines.close();
      if (processHandle.exitCode !== null || processHandle.signalCode !== null) return;
      const exit = new Promise(resolve => processHandle.once('close', resolve));
      processHandle.stdin.end();
      await Promise.race([exit, delay(5000, null, {ref: false})]);
      if (processHandle.exitCode === null && processHandle.signalCode === null) processHandle.kill();
      await exit;
    };
  } else if (settings.cdp) {
    browser = await chromium.connectOverCDP(settings.cdp, {timeout: 60000});
    page = browser.contexts().flatMap(context => context.pages()).find(candidate => !candidate.url().startsWith('devtools:'));
    assert(page, `No installed Townlight WebView is available on ${settings.machine}.`);
    native = (command, args = {}) => page.evaluate(({command, args}) => window.__TAURI_INTERNALS__.invoke(command, args), {command, args});
    close = () => browser.close();
  } else {
    const mount = async (name, content) => {
      const temporary = path.join(settings.mailbox, `${name}.tmp`);
      await writeFile(temporary, JSON.stringify(content), {encoding: 'utf8', flag: 'wx'});
      await rename(temporary, path.join(settings.mailbox, name));
    };
    const ready = await until(`${settings.machine} installed bridge becoming ready`, async () =>
      JSON.parse(await readFile(path.join(settings.mailbox, 'ready.json'), 'utf8')));
    assert.equal(ready.machine.toUpperCase(), settings.machine.toUpperCase());
    assert.equal(ready.host, settings === fixture.host);
    native = async (command, args = {}) => {
      const id = randomUUID();
      const receipt = path.join(settings.mailbox, `response-${id}.json`);
      try {
        await mount(`request-${id}.json`, {command, ...args});
        const response = await until(`${settings.machine} ${command}`, async () =>
          JSON.parse(await readFile(receipt, 'utf8')));
        if (!response.ok) throw Error(response.error?.message || response.error || 'Native command failed');
        return response.result;
      } finally {
        await unlink(path.join(settings.mailbox, `request-${id}.json`)).catch(() => {});
        await unlink(receipt).catch(() => {});
      }
    };
    close = () => mount('stop.json', {}).catch(() => {});
  }
  const signOut = () => native('auth_action', {action: 'sign-out', payload: null});
  async function signIn(account) {
    await signOut();
    const result = await native('auth_action', {action: 'sign-in', payload: account});
    assert.equal(result?.accepted, true, `Sign-in failed for fixture account ${account.email}`);
  }
  return {page, native, signIn, signOut, close,
    meetings: request => native('meetings_domain_request', {request}),
    records: request => native('records_domain_request', {request})};
};

async function prepareHost(host, settings) {
  if (!settings.executable) return;
  const initial = await host.native('get_app_state');
  if (!initial.first_run.finished) {
    const setup = async (action, stepId, payload = null) => {
      const outcome = await host.native('first_run_action', {action, stepId, payload});
      assert.equal(outcome.accepted, true, `Installed host setup failed at ${action}: ${outcome.message}`);
    };
    await setup('choose-location', 'locations');
    await setup('select-modules', 'modules', {profileId: 'inspections-preview'});
    await setup('create-city-profile', 'city-profile', {cityName: 'Fictional Shared Townlight City', state: 'CO',
      timeZone: 'America/Denver', recordsContact: 'records@example.invalid', clerkContact: 'clerk@example.invalid'});
    await setup('create-admin', 'first-admin', {adminName: 'Fictional Audit Administrator',
      adminEmail: settings.admin.email, adminPasscode: settings.admin.passcode});
    await host.signIn(settings.admin);
    await setup('choose-backup', 'backup');
    await setup('defer-model', 'model');
    await setup('verify-health', 'health');
    await setup('open-app', 'finish');
    const named = [[settings.clerk, 'clerk'], [fixture.guest.clerk, 'clerk'],
      [fixture.guest.records_only, 'records-staff'], [fixture.guest.publisher, 'city-staff']];
    for (const [account, role] of named) {
      assert(account.email.endsWith('@example.invalid'));
      const saved = await host.native('auth_action', {action: 'create-user', payload: {
        userName: account.email.split('@')[0], userEmail: account.email, userRole: role, userPasscode: account.passcode,
      }});
      assert.equal(saved.accepted, true, `Could not provision named fixture role ${role}.`);
    }
  }
  await host.signIn(settings.admin);
  if ((await host.native('get_app_state')).domain_authority !== 'python-records') {
    const activated = await host.native('supervisor_action', {action: 'activate-records', serviceId: null});
    assert.equal(activated.accepted, true, activated.message);
  }
}

let receiver;
const publicUrl = pathname => new URL(pathname, fixture.portal.origin);
const publicRead = pathname => fetch(publicUrl(pathname), {signal: AbortSignal.timeout(5000)});
async function stopWebsite() {
  if (!receiver || receiver.exitCode !== null || receiver.signalCode !== null) return;
  await new Promise((resolve, reject) => {
    receiver.once('exit', resolve);
    if (!receiver.kill()) reject(Error('Could not stop the owned fixture portal process.'));
  });
}
async function startWebsite() {
  receiver = spawn(fixture.portal.executable, fixture.portal.arguments, {
    cwd: fixture.portal.working_directory, windowsHide: true, stdio: 'ignore',
  });
  await new Promise((resolve, reject) => { receiver.once('spawn', resolve); receiver.once('error', reject); });
  await until('The fixture public portal becoming available', async () => (await publicRead('/meetings/')).ok);
}

const host = await openDesktop(fixture.host);
let guest;
let scratch;
let remuxed;
let hostPrepared = false;
try {
  await prepareHost(host, fixture.host);
  hostPrepared = true;
  guest = await openDesktop(fixture.guest);
  const [hostState, guestState] = await Promise.all([host.native('get_app_state'), guest.native('get_app_state')]);
  assert.equal(hostState.first_run.finished, true);
  assert.equal(hostState.domain_authority, 'python-records');
  assert.equal(guestState.shared_staff, true, 'The second Windows desktop must use staff HTTPS, not its local profile.');
  if (fixture.community_ids_file) {
    const { readFile } = await import('node:fs/promises');
    const { communityShared } = await import('./community-shared.mjs');
    const summary = JSON.parse(await readFile(fixture.community_ids_file, 'utf8'));
    const ids = summary.ids ?? summary;
    await host.signIn(fixture.host.admin);
    await guest.signIn(fixture.guest.clerk);
    await communityShared({
      hostNative: host.native,
      guestNative: guest.native,
      ids,
      save,
      hostMachine: fixture.host.machine,
      guestMachine: fixture.guest.machine,
      machineAcceptanceRef: fixtureFile,
    });
    await save('shared-windows-community-acceptance', {
      passed: true,
      candidate_sha256: fixture.candidate_sha256,
      host: fixture.host.machine,
      guest: fixture.guest.machine,
    });
  } else {
  await startWebsite();
  const key = randomUUID().slice(0, 8);
  const title = `Synthetic shared council ${key}`;
  const privateMarker = `RESTRICTED COUNCIL ITEM ${key}`;
  await host.signIn(fixture.host.clerk);
  const meeting = await host.meetings({operation: 'create-meeting', payload: {
    title, scheduled_start: '2026-11-20T18:00:00-07:00', location: 'Fixture chamber', meeting_type: 'regular',
  }});
  const items = [];
  for (const item of ['Public park improvements', privateMarker, 'Public budget summary']) {
    const saved = await host.meetings({operation: 'create-agenda-item', payload: {title: item, department_name: 'Clerk'}});
    await host.meetings({operation: 'assign-agenda-meeting', id: saved.id, payload: {meeting_id: meeting.id}});
    items.push(saved);
  }
  const initial = await host.meetings({operation: 'capture-packet', id: meeting.id, payload: {
    agenda_item_ids: items.map(item => item.id), public_agenda_ids: [items[0].id, items[2].id],
  }});
  await guest.signOut();
  await assert.rejects(guest.meetings({operation: 'get-proceedings', id: meeting.id}));
  await guest.signIn(fixture.guest.records_only);
  await assert.rejects(guest.meetings({operation: 'get-proceedings', id: meeting.id}));
  await guest.signIn(fixture.guest.clerk);
  const saved = await guest.meetings({operation: 'get-proceedings', id: meeting.id});
  assert.equal(saved.packets.at(-1).id, initial.packet_id);
  assert.notEqual(saved.packets.at(-1).actor, undefined);
  verify('A second Windows session read the same saved packet, after absent and wrong roles were denied.', {meeting_id: meeting.id});

  const page = guest.page;
  let council;
  if (page) {
    await page.reload();
    await page.locator('[data-surface="Staff"]').click();
    await page.locator('.sidebar [data-area="meetings"]').click();
    const clerk = page.locator('[data-clerk-workspace]');
    await clerk.getByLabel('Search meetings').fill(title);
    await clerk.getByRole('button', {name: 'Search', exact: true}).click();
    await clerk.getByLabel('Saved meeting').locator(`option[value="${meeting.id}"]`).waitFor({state: 'attached'});
    await clerk.getByLabel('Saved meeting').selectOption(meeting.id);
    const order = clerk.getByLabel('Packet order (top to bottom)');
    await order.selectOption(items[2].id);
    await clerk.getByRole('button', {name: 'Move up'}).press('Enter');
    await clerk.getByRole('button', {name: 'Move up'}).press('Enter');
    await clerk.getByRole('button', {name: 'Save packet', exact: true}).click();
    await clerk.locator('[data-status]').getByText('Saved packet with 3 agenda items.').waitFor();
    await clerk.getByText('Prepare a printable council packet', {exact: true}).click();
    council = clerk.locator('[data-council-packet]');
  } else {
    await guest.meetings({operation: 'capture-packet', id: meeting.id, payload: {
      agenda_item_ids: [items[2].id, items[0].id, items[1].id], public_agenda_ids: [items[0].id, items[2].id],
    }});
  }
  const revision = (await host.meetings({operation: 'get-proceedings', id: meeting.id})).packets.at(-1);
  assert.deepEqual(revision.agenda_item_ids, [items[2].id, items[0].id, items[1].id]);
  assert.notEqual(revision.actor, saved.packets.at(-1).actor);
  await assert.rejects(guest.meetings({operation: 'preview-council-packet', id: revision.id, payload: {
    audience: 'public', agenda_item_ids: [items[0].id, items[1].id], source_indexes: [],
  }}));
  if (council) {
    await council.getByLabel('Audience').selectOption('public');
    await council.locator('[data-public-agenda]').getByLabel(items[0].title, {exact: true}).check();
    await council.locator('[data-public-agenda]').getByLabel(items[2].title, {exact: true}).check();
    assert.equal(await council.getByLabel(privateMarker, {exact: true}).count(), 1, 'Private item should appear only in editable source list.');
    await council.getByRole('button', {name: 'Prepare review files'}).click();
    await council.locator('[data-council-status]').getByText(/Review packet\.pdf and agenda\.html/).waitFor();
    await council.getByLabel('I reviewed these exact files for the selected audience').check();
    await council.getByRole('button', {name: 'Approve reviewed files'}).click();
    await council.locator('[data-council-status]').getByText(/Council packet approved/).waitFor();
  } else {
    const preview = await guest.meetings({operation: 'preview-council-packet', id: revision.id, payload: {
      audience: 'public', agenda_item_ids: [items[0].id, items[2].id], source_indexes: [],
    }});
    await guest.meetings({operation: 'save-council-files', id: revision.id, payload: {
      artifact_id: preview.preview_id, manifest_sha256: preview.manifest_sha256, approved: false,
    }});
    await guest.meetings({operation: 'approve-council-packet', id: revision.id, payload: {
      preview_id: preview.preview_id, manifest_sha256: preview.manifest_sha256, public_confirmed: true,
    }});
  }
  const approved = (await host.meetings({operation: 'get-proceedings', id: meeting.id})).packets.at(-1).delivery_history.find(item => item.kind === 'council-packet-approval');
  assert.equal(approved.audience, 'public');
  assert.equal(approved.actor, revision.actor);
  assert.match(approved.manifest_sha256, /^[0-9a-f]{64}$/);
  const packetPayload = {packet_id: revision.id, approval_id: approved.approval_id,
    expected_manifest_sha256: approved.manifest_sha256};
  const approvedPdfSha = async (id, approval) => {
    const {folder} = await host.meetings({operation: 'save-council-files', id, payload: {
      artifact_id: approval.approval_id, manifest_sha256: approval.manifest_sha256, approved: true,
    }});
    return sha256(path.join(folder, 'packet.pdf'));
  };
  const initialPacketHash = await approvedPdfSha(revision.id, approved);
  verify('The second clerk reordered, previewed and approved the exact public revision. The restricted item was denied.', {packet: revision.id, approval: approved.approval_id});

  const admin = () => host.signIn(fixture.host.admin);
  await admin();
  await host.meetings({operation: 'archive-meeting', id: meeting.id, payload: {visibility: 'public', packet_id: revision.id,
    minutes_id: null, plain_language_summary: 'Approved fixture public summary'}});
  const recording = await stationRecorder({native: host.native, save, admin, meetingId: meeting.id,
    disposableFixture: true, profileRoot: fixture.host.profile, payloadRoot: fixture.host.runtime_payload});
  await guest.signIn(fixture.guest.records_only);
  const deadline = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const request = await guest.records({operation: 'create', payload: {requester: 'Private fixture requester',
    summary: `Shared Station ${key}`, deadline, deadlineBasis: 'Fixture staff review'}});
  const requestId = request.request_id || request.id;
  assert(requestId, 'The shared Records desk did not return the saved request identifier.');
  await guest.records({operation: 'attach-station-recording', request_id: requestId,
    recording_id: recording.recording_id, expected_sha256: recording.sha256});
  const detail = await host.records({operation: 'view', request_id: requestId});
  const document = detail.documents.find(item => item.sha256 === recording.sha256);
  assert(document?.stored_path && document.attachment_id, 'Central Records lacks the verified private Station reference.');
  assert.equal(await sha256(document.stored_path), recording.sha256);
  verify('The second PC linked Station’s central recording to the shared request, and the Windows host verified exact private bytes.', {recording: recording.recording_id, request: requestId});

  scratch = await mkdtemp(path.join(os.tmpdir(), 'townlight-published-fixture-'));
  remuxed = path.join(scratch, 'reviewed-recording.mp4');
  const ffmpeg = path.join(fixture.host.runtime_payload || path.join(process.env.ProgramFiles, 'Townlight', '_up_', 'runtime', 'payload'),
    'station', 'bin', 'ffmpeg.exe');
  await promisify(execFile)(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-i', document.stored_path,
    '-map', '0:v:0', '-map', '0:a:0?', '-c', 'copy', '-movflags', '+faststart', remuxed],
  {windowsHide: true, timeout: 90000});
  const mediaHash = await sha256(remuxed);
  await host.records({operation: 'attach-release-copy', request_id: requestId, attachment_id: document.attachment_id,
    source_path: remuxed, status: 'redacted copy', note: 'Staff explicitly reviewed fixture MP4.'});
  const recordAction = (desktop, action, payload) => desktop.records({operation: 'apply', request_id: requestId, action, payload});
  await recordAction(host, 'add-records-exemption-decision', {exemptionSource: 'Fixture recording', exemptionKind: 'review',
    exemptionFinding: 'Reviewed approved derivative', exemptionDecision: 'redact', exemptionBasis: 'Fixture staff review'});
  await recordAction(host, 'draft-records-response', {responseDraft: 'Fixture approved public response.'});
  const {response_draft_sha256: responseHash} = await guest.records({operation: 'view', request_id: requestId});
  assert.match(responseHash, /^[0-9a-f]{64}$/);
  await recordAction(guest, 'approve-records-response', {approvalNote: 'Second fixture staff approval.',
    expectedResponseSha256: responseHash});
  for (const kind of ['response', 'release-package']) await host.records({operation: 'export', request_id: requestId, kind});
  await recordAction(host, 'fulfill-records-request', {});
  await assert.rejects(guest.meetings({operation: 'publisher-recording-choices', request_id: requestId}));
  await guest.signIn(fixture.guest.publisher);
  const choices = await guest.meetings({operation: 'publisher-recording-choices', request_id: requestId});
  const choice = choices.selections.find(item => item.selection.meeting_id === meeting.id && item.selection.expected_release_sha256 === mediaHash);
  assert(choice, 'The publication selector could not find the exact reviewed derivative for the fulfilled request.');
  await assert.rejects(guest.meetings({operation: 'publisher-recording', payload: {...choice.selection, approve_publication: false}}));
  await assert.rejects(guest.meetings({operation: 'publisher-packet', payload: {...packetPayload, expected_manifest_sha256: '0'.repeat(64)}}));

  await stopWebsite();
  await until('Website outage becoming observable', async () => {
    try { return !(await publicRead('/meetings/')).ok; } catch { return true; }
  });
  const packetSent = await guest.meetings({operation: 'publisher-packet', payload: packetPayload});
  const mediaSent = await guest.meetings({operation: 'publisher-recording', payload: {...choice.selection, approve_publication: true}});
  await guest.signOut();
  await assert.rejects(guest.meetings({operation: 'publisher-status', id: meeting.id}));
  const restart = action => host.native('supervisor_action', {action, serviceId: null});
  assert.equal((await restart('stop')).accepted, true);
  assert.equal((await restart('start')).accepted, true);
  await host.signOut();
  await startWebsite();

  const meetingPath = await until('Public portal post-restart delivery', async () => {
    const listing = await publicRead(`/meetings/?period=all&q=${encodeURIComponent(title)}`);
    const html = await listing.text();
    const link = [...html.matchAll(/href="(\/meetings\/\d+\/)"[^>]*>([^<]*)/g)]
      .find(match => match[2].trim() === title)?.[1];
    if (!link) return null;
    if (!(await publicRead(`${link}packet.pdf`)).ok || !(await publicRead(`${link}release/`)).ok) return null;
    return link;
  }, 180000);
  const publicHtml = await (await publicRead(meetingPath)).text();
  assert(publicHtml.includes(items[0].title));
  for (const privateValue of [privateMarker, 'Private fixture requester', document.stored_path]) assert(!publicHtml.includes(privateValue));
  const receivedSha = async filename => {
    const response = await publicRead(meetingPath + filename);
    assert.equal(response.status, 200);
    const digest = createHash('sha256');
    for await (const chunk of response.body) digest.update(chunk);
    return digest.digest('hex');
  };
  assert.equal(await receivedSha('packet.pdf'), initialPacketHash);
  assert.equal(await receivedSha('release/'), mediaHash);
  verify('Both publications survived outage, host restart and complete staff sign-out. Residents read the approved copy.',
    {packet: packetSent, recording: mediaSent, public_path: meetingPath, packet_sha256: initialPacketHash, media_sha256: mediaHash});

  await guest.signIn(fixture.guest.publisher);
  const stale = await guest.meetings({operation: 'publisher-packet', payload: packetPayload});
  assert.equal(stale.sequence, packetSent.sequence, 'Retry should preserve the same publication sequence');
  const corrected = await guest.meetings({operation: 'capture-packet', id: meeting.id, payload: {
    agenda_item_ids: [items[0].id, items[2].id, items[1].id], public_agenda_ids: [items[0].id, items[2].id],
  }});
  const preview = await guest.meetings({operation: 'preview-council-packet', id: corrected.packet_id, payload: {
    audience: 'public', agenda_item_ids: [items[0].id, items[2].id], source_indexes: [],
  }});
  const replacement = await guest.meetings({operation: 'approve-council-packet', id: corrected.packet_id, payload: {
    public_confirmed: true, preview_id: preview.preview_id, manifest_sha256: preview.manifest_sha256,
  }});
  const amended = await guest.meetings({operation: 'publisher-packet', payload: {packet_id: corrected.packet_id,
    approval_id: replacement.approval_id, expected_manifest_sha256: replacement.manifest_sha256}});
  assert(amended.sequence > packetSent.sequence);
  const delivered = async sequence => (await guest.meetings({operation: 'publisher-status', id: meeting.id}))
    .publications.some(item => item.kind === 'packet' && item.sequence === sequence && item.state === 'delivered');
  await until('Corrected public packet delivery', () => delivered(amended.sequence));
  const replacementHtml = await (await publicRead(meetingPath)).text();
  assert(replacementHtml.indexOf(items[0].title) < replacementHtml.indexOf(items[2].title));
  await host.signIn(fixture.host.clerk);
  const correctedPacketHash = await approvedPdfSha(corrected.packet_id, replacement);
  assert.notEqual(correctedPacketHash, initialPacketHash);
  assert.equal(await receivedSha('packet.pdf'), correctedPacketHash);
  const withdrawal = await guest.meetings({operation: 'publisher-withdrawal', id: meeting.id, kind: 'packet'});
  await until('Packet withdrawal delivery', () => delivered(withdrawal.sequence));
  assert.equal((await publicRead(`${meetingPath}packet.pdf`)).status, 404);
  assert.equal((await publicRead(`${meetingPath}release/`)).status, 200);
  await guest.meetings({operation: 'publisher-withdrawal', id: meeting.id, kind: 'recording'});
  await until('Recording withdrawal delivery', async () => (await publicRead(`${meetingPath}release/`)).status === 404);
  verify('Publication retry was idempotent. The correction reused the meeting identity, and both withdrawals removed only their respective files.');
  await save('shared-windows-acceptance', {passed: true, candidate_sha256: fixture.candidate_sha256,
    host: fixture.host.machine, guest: fixture.guest.machine, checks});
  }
} catch (error) {
  await save('shared-windows-acceptance-failure', {passed: false, checks, error: String(error?.message || error), stack: error?.stack});
  throw error;
} finally {
  await guest?.signOut().catch(() => {});
  if (fixture.host.executable && hostPrepared) {
    await host.signIn(fixture.host.admin).then(async () => {
      await host.native('station_action', {action: 'stop'}).catch(() => {});
      await host.native('supervisor_action', {action: 'stop'});
    }).catch(error => console.error(`Could not stop the owned fixture host services: ${error.message}`));
  }
  await host.signOut().catch(() => {});
  await guest?.close();
  await host.close();
  await stopWebsite();
  if (remuxed) await unlink(remuxed).catch(error => { if (error.code !== 'ENOENT') throw error; });
  if (scratch) await rmdir(scratch);
}
