import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';

const VIEW = '[data-service-requests-view]';
const STATUS = `${VIEW} [data-status]`;
const RECORDS = `${VIEW} [data-records-handoff]`;
const RECORDS_STATUS = `${RECORDS} [data-role="status"]`;
const RECORDS_ERROR = `${RECORDS} [data-role="error"]`;
const RECORDS_RECEIPT = `${RECORDS} [data-role="receipt"]`;
const RECORDS_RESULT = `${RECORDS} [data-role="result"]`;
const DATA_RESULT = '[data-dp-result]';

export async function installedServiceRequests({page, native, save, portalBaseUrl, captureMessage, downloadRecordsAttachment}) {
  assert.equal(typeof native, 'function', 'native typed-operation bridge is required');
  assert.ok(portalBaseUrl, 'portalBaseUrl callback is required');
  assert.equal(typeof downloadRecordsAttachment, 'function', 'downloadRecordsAttachment callback is required');
  assert.equal(typeof captureMessage, 'function', 'captureMessage callback is required');
  const call = async (operation, extra = {}) => {
    const response = await native('service_requests_request', {request: {operation, ...extra}});
    return response && typeof response === 'object' && 'result' in response ? response.result : response;
  };
  const text = async locator => (await locator.textContent()) ?? '';
  const array = (value, ...keys) => {
    if (Array.isArray(value)) return value;
    for (const key of keys) if (Array.isArray(value?.[key])) return value[key];
    return [];
  };
  const parseJson = (value, label) => {
    try {
      return JSON.parse(value);
    } catch (error) {
      throw new Error(`${label} did not return valid JSON: ${value}`);
    }
  };
  const snapshotStatus = async () => {
    const status = page.locator(STATUS);
    return {
      text: (await status.count()) ? await text(status) : '',
      error: (await status.count()) ? (await status.getAttribute('data-error')) === 'true' : false,
    };
  };
  async function waitMainStatus(previousText, pattern, label) {
    const deadline = Date.now() + 30_000;
    let last = '';
    while (Date.now() < deadline) {
      const status = page.locator(STATUS);
      if (await status.count()) {
        last = await text(status);
        const isError = (await status.getAttribute('data-error')) === 'true';
        if (last !== previousText) {
          if (isError && last.trim()) throw new Error(`${label} failed: ${last}`);
          if (pattern.test(last)) return last;
        }
      }
      await delay(100);
    }
    throw new Error(`${label} timed out; last status: ${last}`);
  }
  async function waitChangedText(selector, previousText, label) {
    const deadline = Date.now() + 30_000;
    let last = '';
    while (Date.now() < deadline) {
      const locator = page.locator(selector);
      if (await locator.count()) {
        last = await text(locator);
        if (last !== previousText && last.trim()) return last;
      }
      await delay(100);
    }
    throw new Error(`${label} timed out; last text: ${last}`);
  }
  async function waitRecordsOutcome(previousStatus, previousError, pattern, label) {
    const deadline = Date.now() + 30_000;
    let lastStatus = '';
    let lastError = '';
    while (Date.now() < deadline) {
      lastStatus = await text(page.locator(RECORDS_STATUS));
      lastError = await text(page.locator(RECORDS_ERROR));
      if (lastError && lastError !== previousError) throw new Error(`${label} failed: ${lastError}`);
      if (lastStatus !== previousStatus && pattern.test(lastStatus)) return lastStatus;
      await delay(100);
    }
    throw new Error(`${label} timed out; last status: ${lastStatus}; last error: ${lastError}`);
  }
  const parseLabeled = value => {
    const fields = {};
    for (const line of value.split(/\r?\n/)) {
      const index = line.indexOf(': ');
      if (index > 0) fields[line.slice(0, index).trim()] = line.slice(index + 2).trim();
    }
    return fields;
  };
  const parsePreparedReceipt = value => {
    const sha256 = /^SHA-256:\s*([0-9a-f]{64})\s*$/im.exec(value)?.[1];
    const path = /^Path:\s*(.+?)\s*$/m.exec(value)?.[1];
    const size = /^Size:\s*(\d+)\s+bytes\s*$/im.exec(value)?.[1];
    assert.ok(sha256, `prepared archive receipt sha256: ${value}`);
    assert.ok(path, `prepared archive receipt path: ${value}`);
    assert.ok(size !== undefined, `prepared archive receipt size: ${value}`);
    const sizeBytes = Number(size);
    assert.ok(Number.isSafeInteger(sizeBytes) && sizeBytes > 0, 'prepared archive receipt size must be positive');
    return {sha256, path, sizeBytes};
  };
  async function verifyReceipt(receipt, label) {
    assert.match(String(receipt?.sha256 ?? ''), /^[0-9a-f]{64}$/, `${label} sha256`);
    assert.ok(String(receipt?.path ?? '').trim(), `${label} path`);
    const sizeBytes = Number(receipt.size_bytes ?? receipt.sizeBytes);
    assert.ok(Number.isSafeInteger(sizeBytes) && sizeBytes > 0, `${label} size`);
    const bytes = await readFile(String(receipt.path)).catch(error => {
      throw new Error(`${label} path is not readable for durable readback: ${error?.message ?? error}`);
    });
    assert.equal(bytes.length, sizeBytes, `${label} size readback`);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), receipt.sha256, `${label} bytes hash readback`);
    return receipt;
  }
  async function openRecordsDetails() {
    const details = page.locator(`${RECORDS} details`).first();
    await details.waitFor({state: 'visible'});
    if (!(await details.evaluate(element => element.open))) await details.locator('summary').click();
    await page.locator(`${RECORDS} [data-role="prepare"]`).waitFor({state: 'visible'});
  }
  async function openDataDetails() {
    const details = page.locator('details:has([data-dp-preview])').first();
    await details.waitFor({state: 'visible'});
    if (!(await details.evaluate(element => element.open))) await details.locator('summary').click();
    await page.locator('[data-dp-preview]').waitFor({state: 'visible'});
  }
  function validateSanitizedPreview(preview) {
    assert.ok(preview && typeof preview === 'object', 'data preview response');
    assert.ok(String(preview.id ?? '').trim(), 'data preview revision id');
    assert.match(String(preview.sha256 ?? ''), /^[0-9a-f]{64}$/, 'data preview source hash');
    assert.ok(Array.isArray(preview.rows), 'data preview rows');
    const expectedColumns = ['category', 'count', 'department', 'state'];
    for (const row of preview.rows) {
      assert.ok(row && typeof row === 'object' && !Array.isArray(row), 'sanitized preview row');
      assert.deepEqual(Object.keys(row).sort(), expectedColumns, 'sanitized preview columns');
      assert.equal(typeof row.category, 'string', 'preview category type');
      assert.equal(typeof row.department, 'string', 'preview department type');
      assert.equal(typeof row.state, 'string', 'preview state type');
      assert.ok(Number.isSafeInteger(row.count) && row.count >= 0, 'preview count type');
      for (const key of Object.keys(row)) {
        assert.doesNotMatch(key, /contact|resident|email|phone|description|location|token|name/i, `resident/contact column: ${key}`);
      }
      for (const value of Object.values(row)) {
        if (typeof value === 'string') assert.doesNotMatch(value, /[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/, 'resident contact value in preview');
      }
    }
  }

  try {
    await page.evaluate(async () => {
      await window.audit.click('[data-surface="Staff"]', {confirm: false});
      await window.audit.nav('service-requests');
    });
  } catch (error) {
    throw new Error(`unsupported: signed-app staff navigation for service requests is unavailable: ${error?.message ?? error}`);
  }
  await page.locator(VIEW).waitFor({state: 'visible', timeout: 15_000});
  await page.locator(`${VIEW} [data-requests]`).waitFor({state: 'attached'});
  await page.locator(`${VIEW} [data-status]`).waitFor({state: 'attached'});
  await page.locator(`${VIEW} [data-filter]`).waitFor({state: 'visible'});
  await page.locator(`${VIEW} [data-create]`).waitFor({state: 'visible'});
  await page.locator(`${RECORDS}`).waitFor({state: 'attached'});
  await page.locator('[data-dp-preview]').waitFor({state: 'attached'});

  const categoryForm = page.locator(`${VIEW} [data-category]`);
  if ((await categoryForm.count()) === 0) {
    throw new Error('unsupported: the signed app does not expose the administrator category form required for a unique category fixture.');
  }
  await categoryForm.waitFor({state: 'visible'});

  const runId = `${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
  const categoryCode = `acc-${runId}`.slice(0, 64);
  await categoryForm.locator('[name="code"]').fill(categoryCode);
  await categoryForm.locator('[name="name"]').fill(`Acceptance ${runId}`);
  await categoryForm.locator('[name="department"]').fill('Acceptance Services');
  await categoryForm.locator('[name="active"]').check();
  const categoryStatusBefore = await snapshotStatus();
  await categoryForm.locator('button[type="submit"]').click();
  await waitMainStatus(categoryStatusBefore.text, /Category saved\./, 'Save unique category');

  async function listRequests() {
    const response = await call('requests', {filters: {limit: 200, offset: 0}});
    return array(response, 'requests', 'queue');
  }
  async function findRequest(description) {
    const deadline = Date.now() + 30_000;
    let last = [];
    while (Date.now() < deadline) {
      last = await listRequests();
      const match = last.find(item => String(item?.description ?? '') === description);
      if (match?.id) return match;
      await delay(200);
    }
    throw new Error(`Created service request not found by unique description; visible count ${last.length}.`);
  }
  async function createRequest(description) {
    const form = page.locator(`${VIEW} [data-create]`);
    await form.locator('[name="category"]').selectOption(categoryCode);
    await form.locator('[name="description"]').fill(description);
    await form.locator('[name="location"]').fill(`Acceptance ${runId} Test Location`);
    await form.locator('[name="contact_name"]').fill('Acceptance Resident');
    await form.locator('[name="contact_email"]').fill(`acceptance+${runId}@example.test`);
    await form.locator('[name="contact_phone"]').fill('555-0100');
    const before = await snapshotStatus();
    await form.locator('button[type="submit"]').click();
    await waitMainStatus(before.text, /Service request created\./, 'Create service request');
    return findRequest(description);
  }
  async function detail(id) {
    const response = await call('request', {id});
    const request = response?.request ?? response;
    assert.equal(String(request?.id), String(id), 'native service-request readback id mismatch');
    return request;
  }
  async function openRequest(id) {
    const before = await snapshotStatus();
    const open = page.locator(`${VIEW} [data-open="${id}"]`);
    await open.waitFor({state: 'visible', timeout: 15_000});
    await open.click();
    await waitMainStatus(before.text, /Request detail loaded\./, 'Open service request');
    await page.locator(`${VIEW} [data-detail] [data-transition]`).waitFor({state: 'visible'});
    return detail(id);
  }
  async function refreshDetailUi() {
    const before = await snapshotStatus();
    await page.locator(`${VIEW} [data-refresh-detail]`).click();
    await waitMainStatus(before.text, /Request detail refreshed\./, 'Refresh service request');
  }
  async function waitForState(id, state, minRevision) {
    const deadline = Date.now() + 30_000;
    let current;
    while (Date.now() < deadline) {
      current = await detail(id);
      if (current.state === state && Number(current.revision) > Number(minRevision)) return current;
      await delay(150);
    }
    throw new Error(`Request ${id} did not reach ${state} above revision ${minRevision}: ${JSON.stringify(current)}`);
  }
  async function transition(id, target, reason, extra = {}) {
    await openRequest(id);
    await refreshDetailUi();
    const before = await detail(id);
    assert.notEqual(before.state, target, `Request already in ${target}`);
    const meta = await text(page.locator(`${VIEW} [data-detail-meta]`));
    assert.match(meta, new RegExp(`Revision:\\s*${before.revision}\\b`), 'UI must show the actual revision');
    const form = page.locator(`${VIEW} [data-detail] [data-transition]`);
    await form.locator('[name="target"]').selectOption(target);
    await form.locator('[name="reason"]').fill(reason);
    if (extra.assignee) await form.locator('[name="assignee"]').selectOption(String(extra.assignee));
    if (extra.duplicate_of) await form.locator('[name="duplicate_of"]').fill(String(extra.duplicate_of));
    const statusBefore = await snapshotStatus();
    await form.locator('button[type="submit"]').click();
    await waitMainStatus(statusBefore.text, /Request transitioned\./, `Transition to ${target}`);
    return {before, after: await waitForState(id, target, before.revision)};
  }
  async function waitForAttachment(id, name, sha256) {
    const deadline = Date.now() + 30_000;
    let current;
    while (Date.now() < deadline) {
      current = await detail(id);
      const found = array(current.attachments, 'attachments').find(item => item?.name === name);
      if (found) {
        assert.equal(found.sha256, sha256, 'attachment hash readback');
        assert.equal(found.public, false, 'photograph attachment must remain private');
        return found;
      }
      await delay(150);
    }
    throw new Error(`Uploaded attachment ${name} was not durably visible: ${JSON.stringify(current?.attachments)}`);
  }
  async function addComment(id, message, isPublic) {
    await openRequest(id);
    await refreshDetailUi();
    const form = page.locator(`${VIEW} [data-comment]`);
    await form.locator('[name="message"]').fill(message);
    if (isPublic) await form.locator('[name="public"]').check();
    else await form.locator('[name="public"]').uncheck();
    const before = await snapshotStatus();
    await form.locator('button[type="submit"]').click();
    await waitMainStatus(before.text, /Comment added\./, 'Add service-request comment');
    const deadline = Date.now() + 30_000;
    let current;
    while (Date.now() < deadline) {
      current = await detail(id);
      const found = array(current.events, 'events').find(item => item?.message === message);
      if (found) {
        assert.equal(found.public, isPublic, `comment visibility must be ${isPublic ? 'public' : 'internal'}`);
        return found;
      }
      await delay(150);
    }
    throw new Error(`Comment privacy readback failed for ${message}: ${JSON.stringify(current?.events)}`);
  }

  const mainDescription = `Acceptance main ${runId}`;
  const main = await createRequest(mainDescription);
  await openRequest(main.id);

  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
    'base64',
  );
  const photoName = `acceptance-${runId}.png`;
  const photoSha = createHash('sha256').update(png).digest('hex');
  const attachForm = page.locator(`${VIEW} [data-attach]`);
  await attachForm.locator('input[type="file"]').setInputFiles({name: photoName, mimeType: 'image/png', buffer: png});
  if (await attachForm.locator('[name="public"]').isChecked()) await attachForm.locator('[name="public"]').uncheck();
  const attachStatusBefore = await snapshotStatus();
  await attachForm.locator('button[type="submit"]').click();
  await waitMainStatus(attachStatusBefore.text, /Attachment uploaded\./, 'Upload private photograph');
  const attachment = await waitForAttachment(main.id, photoName, photoSha);
  await page.locator(`${VIEW} [data-download="${attachment.id}"]`).waitFor({state: 'visible'});

  const downloadStatusBefore = await snapshotStatus();
  await page.locator(`${VIEW} [data-download="${attachment.id}"]`).click();
  const downloadStatus = await waitMainStatus(downloadStatusBefore.text, /Attachment download receipt:/, 'Download private photograph');
  const downloadReceipt = /path=(.+), sha256=([0-9a-f]{64}), size_bytes=(\d+)/.exec(downloadStatus);
  assert.ok(downloadReceipt, `download receipt shape: ${downloadStatus}`);
  assert.equal(downloadReceipt[2], photoSha, 'download receipt hash');
  assert.equal(Number(downloadReceipt[3]), png.length, 'download receipt size');
  const downloaded = await readFile(downloadReceipt[1]).catch(error => {
    throw new Error(`Private binary download receipt path is not readable for durable readback: ${error?.message ?? error}`);
  });
  assert.equal(createHash('sha256').update(downloaded).digest('hex'), photoSha, 'downloaded private bytes hash');

  const assigneesRaw = await call('assignees');
  const assignees = array(assigneesRaw, 'assignees');
  if (assignees.length === 0) {
    throw new Error('unsupported: no active native staff assignee is available for the assignment acceptance step.');
  }
  const assignee = assignees[0];
  assert.ok(assignee?.id, 'assignee readback id');

  const lifecycle = [];
  lifecycle.push(await transition(main.id, 'triaged', 'Acceptance triage.'));
  lifecycle.push(await transition(main.id, 'assigned', 'Acceptance assignment.', {assignee: assignee.id}));
  assert.equal(String(lifecycle.at(-1).after.assignee), String(assignee.id), 'durable assignment readback');
  lifecycle.push(await transition(main.id, 'in_progress', 'Acceptance work started.'));
  lifecycle.push(await transition(main.id, 'resolved', 'Acceptance work completed.'));
  lifecycle.push(await transition(main.id, 'closed', 'Acceptance closure.'));
  lifecycle.push(await transition(main.id, 'reopened', 'Acceptance resident follow-up.'));

  const publicComment = await addComment(main.id, `Public acceptance ${runId}`, true);
  const internalComment = await addComment(main.id, `Internal acceptance ${runId}`, false);
  assert.equal(publicComment.public, true);
  assert.equal(internalComment.public, false);

  const duplicate = await createRequest(`Acceptance duplicate ${runId}`);
  const duplicateAfter = await transition(duplicate.id, 'duplicate', 'Acceptance duplicate request.', {duplicate_of: main.id});
  assert.equal(duplicateAfter.after.state, 'duplicate');

  const rejected = await createRequest(`Acceptance rejected ${runId}`);
  const rejectedAfter = await transition(rejected.id, 'rejected', 'Acceptance rejected request.');
  assert.equal(rejectedAfter.after.state, 'rejected');

  await openRequest(main.id);
  await refreshDetailUi();
  const selected = await detail(main.id);
  assert.ok(Number.isInteger(selected.revision), 'records handoff source revision');

  await openRecordsDetails();
  const recordsStatusBefore = await text(page.locator(RECORDS_STATUS));
  const recordsErrorBefore = await text(page.locator(RECORDS_ERROR));
  await page.locator(`${RECORDS} [data-role="prepare"]`).click();
  await waitRecordsOutcome(recordsStatusBefore, recordsErrorBefore, /Archive prepared\./, 'Prepare Records archive');
  const prepared = parsePreparedReceipt(await text(page.locator(RECORDS_RECEIPT)));
  await verifyReceipt(prepared, 'Prepared archive');

  await page.locator(`${RECORDS} [data-role="approve"]`).check();
  const archiveStatusBefore = await text(page.locator(RECORDS_STATUS));
  const archiveErrorBefore = await text(page.locator(RECORDS_ERROR));
  await page.locator(`${RECORDS} [data-role="archive"]`).click();
  await waitRecordsOutcome(archiveStatusBefore, archiveErrorBefore, /Archive handed off to Records\./, 'Archive service request to Records');
  const handoffReceiptText = await page.locator(RECORDS_RESULT).evaluate((element) => {
    const clone = element.cloneNode(true);
    clone.querySelectorAll('button').forEach((button) => button.remove());
    return clone.textContent ?? '';
  });
  const handoff = parseLabeled(handoffReceiptText);
  assert.ok(handoff.Tracking, 'returned Records tracking');
  assert.ok(handoff['Records request ID'], 'returned Records request ID');
  assert.ok(handoff['Attachment ID'], 'returned Records attachment ID');
  assert.equal(handoff['SHA-256'], prepared.sha256, 'returned Records source hash');

  const recordsDownload = await downloadRecordsAttachment({
    requestId: handoff['Records request ID'],
    attachmentId: handoff['Attachment ID'],
    expectedSha256: prepared.sha256,
    expectedSize: Number(prepared.sizeBytes),
  });
  assert.ok(Buffer.isBuffer(recordsDownload), 'Records handoff archive buffer');
  assert.equal(recordsDownload.length, prepared.sizeBytes, 'Records handoff archive size');
  assert.equal(createHash('sha256').update(recordsDownload).digest('hex'), prepared.sha256, 'Records handoff archive hash');

  await openDataDetails();
  const dataResult = page.locator(DATA_RESULT);
  const dataStatusBefore = parseJson(
    await waitChangedTextAfterClick(page, dataResult, '[data-dp-status]', 'Data status'),
    'Data status',
  );
  assert.equal(typeof dataStatusBefore.configured, 'boolean', 'data publication configured flag');
  if (dataStatusBefore.configured !== true) {
    throw new Error('unsupported: the data publication portal is not configured; configure it before running the publication acceptance step.');
  }
  assert.ok(Array.isArray(dataStatusBefore.revisions), 'data status revisions');

  const previewBefore = await text(dataResult);
  await page.locator('[data-dp-preview]').click();
  const preview = parseJson(await waitChangedText(DATA_RESULT, previewBefore, 'Data preview'), 'Data preview');
  validateSanitizedPreview(preview);
  const revisionRaw = await call('data-revision', {id: preview.id});
  const revision = revisionRaw?.revision ?? revisionRaw;
  assert.equal(String(revision?.id ?? ''), String(preview.id), 'data revision readback id');
  assert.equal(revision?.sha256, preview.sha256, 'data revision source hash readback');

  const publishButton = page.locator('[data-dp-publish]');
  await publishButton.waitFor({state: 'visible'});
  await page.locator('[data-dp-confirm]').check();
  const publishBefore = await text(dataResult);
  await publishButton.click();
  const publishResult = await waitChangedText(DATA_RESULT, publishBefore, 'Data publish');
  assert.match(publishResult, /^Queued:/, `data publish confirmation: ${publishResult}`);
  const queued = parseJson(publishResult.slice('Queued:'.length).trim(), 'Data publish receipt');
  assert.ok(queued && typeof queued === 'object', 'data publish receipt');

  assert.ok(portalBaseUrl, 'portalBaseUrl is required to verify the delivered public dataset');
  const api = page.request;
  assert.ok(api, 'page.request is required for portal verification');
  assert.ok(Number.isSafeInteger(queued?.sequence), 'data publish receipt must include a delivery sequence');
  let dataStatusAfter;
  let job;
  const deliveryDeadline = Date.now() + 30_000;
  while (Date.now() < deliveryDeadline) {
    dataStatusAfter = await call('data-status');
    const publications = array(dataStatusAfter.publications, 'publications');
    job = publications.find(item => item?.sequence === queued.sequence && item?.state === 'delivered');
    if (job) break;
    if (publications.some(item => item?.sequence === queued.sequence && item?.state === 'rejected')) {
      throw new Error('Data publication was rejected');
    }
    await delay(200);
  }
  assert.ok(job, 'Data publication was not delivered');
  const datasetId = job.meeting_id ?? queued.meeting_id;
  assert.ok(datasetId, 'Delivered publication did not include a dataset id');
  const datasetUrl = new URL(`/datasets/${datasetId}/dataset.json`, portalBaseUrl).href;
  let datasetBytes;
  const datasetDeadline = Date.now() + 15_000;
  while (Date.now() < datasetDeadline) {
    const response = await api.get(datasetUrl, {failOnStatusCode: false});
    if (response.status() === 200) {
      datasetBytes = await response.body();
      break;
    }
    await delay(500);
  }
  assert.ok(datasetBytes, 'Delivered dataset did not appear on the public portal');
  assert.equal(createHash('sha256').update(datasetBytes).digest('hex'), preview.sha256, 'delivered dataset bytes hash');
  const publishedRevision = array(dataStatusAfter.revisions, 'revisions')
    .find(item => String(item?.id ?? '') === String(preview.id));
  assert.ok(publishedRevision, 'published revision is visible in data status');
  assert.equal(publishedRevision.sha256, preview.sha256, 'published source hash readback');
  assert.ok(publishedRevision.approved_at, 'published revision approval confirmation');

  let finalDetail;
  let notifications = [];
  const notificationDeadline = Date.now() + 30_000;
  while (Date.now() < notificationDeadline) {
    finalDetail = await detail(main.id);
    notifications = array(finalDetail.notifications, 'notifications');
    if (notifications.length > 0 && notifications.every(item => item?.state === 'sent')) break;
    await delay(200);
  }
  assert.ok(notifications.length > 0, 'no notification delivery evidence was returned');
  assert.ok(notifications.every(item => item?.state === 'sent'), `not all notifications reached sent: ${JSON.stringify(notifications)}`);
  const captured = await captureMessage(`acceptance+${runId}@example.test`, String(main.tracking ?? main.id));
  const result = {
    passed: true,
    ids: {
      category: categoryCode,
      main_request: String(main.id),
      attachment: String(attachment.id),
      assignee: String(assignee.id),
      duplicate_request: String(duplicate.id),
      rejected_request: String(rejected.id),
      records_request: handoff['Records request ID'],
      records_attachment: handoff['Attachment ID'],
      data_revision: String(preview.id),
    },
    milestones: {
      created: String(main.id),
      photograph_sha256: photoSha,
      download_receipt: downloadReceipt[1],
      lifecycle: lifecycle.map(item => ({state: item.after.state, revision: item.after.revision})),
      public_comment: publicComment.id ?? null,
      internal_comment: internalComment.id ?? null,
      duplicate: duplicateAfter.after.state,
      rejected: rejectedAfter.after.state,
      records_source_sha256: prepared.sha256,
      records_tracking: handoff.Tracking,
      records_result_sha256: handoff['SHA-256'],
      data_preview_revision: String(preview.id),
      data_preview_sha256: preview.sha256,
      data_status_before: dataStatusBefore,
      data_status_after: dataStatusAfter,
      data_publish_receipt: queued,
      notifications: notifications.map(item => ({id: item?.id ?? null, state: item?.state ?? null})),
      notification_capture: captured ?? null,
    },
  };
  if (typeof save === 'function') await save('installed-311-workflow', result);
  return result;
}

async function waitChangedTextAfterClick(page, locator, buttonSelector, label) {
  const previous = (await locator.textContent()) ?? '';
  await page.locator(buttonSelector).click();
  const deadline = Date.now() + 30_000;
  let last = '';
  while (Date.now() < deadline) {
    last = (await locator.textContent()) ?? '';
    if (last !== previous && last.trim()) return last;
    await delay(100);
  }
  throw new Error(`${label} timed out; last text: ${last}`);
}
