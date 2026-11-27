import assert from 'node:assert/strict';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function str(value, name, allowEmpty = false) {
  assert.equal(typeof value, 'string', `${name} must be a string`);
  if (!allowEmpty) assert.ok(value.trim(), `${name} is required`);
  return value;
}
function uuid(value) {
  str(value, 'requestId');
  assert.match(value, UUID_RE, 'requestId must be a UUID');
  return value;
}
function versionNumber(value) {
  const n = Number(value);
  assert.ok(Number.isInteger(n) && n > 0, 'policyVersion must be a positive integer');
  return n;
}
function questionShown(text, id) {
  const rest = text.replaceAll(id, '').replace(/Request:\s*/gi, '').replace(/Status:\s*\S+/gi, '').replace(/[|\s]/g, '');
  return rest.length > 0;
}
async function ensureView(page) {
  const view = page.locator('[data-utilities-view]');
  if (await view.isVisible().catch(() => false)) return;
  const nav = page.locator('.sidebar [data-area="utilities"]');
  await nav.waitFor({ state: 'visible' });
  await nav.click();
  await view.waitFor({ state: 'visible' });
}
async function waitBusySettled(page) {
  const open = page.locator('[data-action="open"]');
  for (let i = 0; i < 120; i += 1) {
    if (await open.isEnabled().catch(() => false)) return;
    await sleep(50);
  }
  throw new Error('utilities UI remained busy');
}
async function assertEnabled(locator, label) {
  assert.ok(await locator.isEnabled().catch(() => false), `${label} is not enabled`);
}
async function settleClick(page, locator) {
  await locator.click();
  await waitBusySettled(page);
  return (await page.locator('[data-role="status"]').innerText()).trim();
}
async function outcome(page) {
  const state = (await page.locator('[data-role="state"]').innerText()).trim();
  const receipt = (await page.locator('[data-role="receipt"]').innerText()).trim();
  const first = state.split('\n').map((s) => s.trim()).find(Boolean) || '';
  return { delivered: first === 'Delivered', pending: first.includes('delivery pending') || receipt.includes('Delivery pending'), state, receipt };
}
function assertReceipt(receipt) {
  const match = receipt.match(/Receipt comment ID:\s*(\S+)/);
  assert.ok(match && match[1], 'receipt comment ID is missing');
  assert.ok(!/^n\/a$/i.test(match[1]), 'receipt comment ID must not be n/a');
  return match[1];
}

async function ensureOpen(page, id) {
  await ensureView(page);
  const caseEl = page.locator('[data-role="case"]');
  const input = page.locator('[data-role="request-id"]');
  const summary = page.locator('[data-role="request-summary"]');
  if (await caseEl.isVisible().catch(() => false) && await input.inputValue().catch(() => '') === id && (await summary.innerText().catch(() => '')).includes(id)) return;
  await openUtilityRequest(page, { requestId: id });
}

export async function openUtilityRequest(page, { requestId } = {}) {
  const id = uuid(requestId);
  await ensureView(page);
  const input = page.locator('[data-role="request-id"]');
  await input.fill(id);
  const open = page.locator('[data-action="open"]');
  await assertEnabled(open, 'Open request');
  const status = await settleClick(page, open);
  assert.ok(!/^Could not open request/.test(status), status);
  await page.locator('[data-role="case"]').waitFor({ state: 'visible' });
  const summary = page.locator('[data-role="request-summary"]');
  await summary.waitFor({ state: 'visible' });
  const text = (await summary.innerText()).trim();
  assert.ok(text.includes(id), 'request summary does not show the same UUID');
  assert.ok(questionShown(text, id), 'original question is not displayed');
  assert.equal(await input.inputValue(), id, 'request UUID input changed');
  return { requestId: id, summary: text };
}

export async function saveUtilityDraft(page, { requestId, policyId, policyVersion, body, privateNotes } = {}) {
  const id = uuid(requestId);
  const pid = str(policyId, 'policyId');
  const pver = versionNumber(policyVersion);
  const publicBody = str(body, 'body', true);
  const notes = str(privateNotes, 'privateNotes', true);
  await ensureOpen(page, id);
  await page.locator('[data-role="policy-select"]').selectOption(`${pid}::${pver}`);
  const bodyLoc = page.locator('[data-role="body"]');
  const notesLoc = page.locator('[data-role="private-notes"]');
  await bodyLoc.fill(publicBody);
  await notesLoc.fill(notes);
  const save = page.locator('[data-action="save"]');
  await assertEnabled(save, 'Save draft');
  const status = await settleClick(page, save);
  assert.match(status, /^Private draft saved\.?$/, `save failed: ${status}`);
  assert.equal(await bodyLoc.inputValue(), publicBody, 'saved body changed');
  assert.equal(await notesLoc.inputValue(), notes, 'saved private notes changed');
  return { saved: true, status };
}

export async function approveUtilityReply(page, { requestId, body, privateNotes, policyCitation, approverName } = {}) {
  const id = uuid(requestId);
  const publicBody = str(body, 'body', true);
  const notes = str(privateNotes, 'privateNotes', true);
  const citation = str(policyCitation, 'policyCitation');
  const approver = str(approverName, 'approverName');
  await ensureOpen(page, id);
  assert.equal(await page.locator('[data-role="body"]').inputValue(), publicBody, 'body does not match saved draft');
  assert.equal(await page.locator('[data-role="private-notes"]').inputValue(), notes, 'private notes do not match saved draft');
  const before = await outcome(page);
  assert.ok(before.state.includes(citation), 'policy citation is not displayed');
  const confirm = page.locator('[data-role="confirm"]');
  if (!(await confirm.isChecked())) await confirm.check();
  const approve = page.locator('[data-action="approve"]');
  await assertEnabled(approve, 'Approve reply');
  const status = await settleClick(page, approve);
  assert.ok(!/^Could not approve reply/.test(status), status);
  const result = await outcome(page);
  assert.ok(result.delivered || result.pending, `approval did not reach delivered or pending: ${status}`);
  if (result.delivered) {
    assertReceipt(result.receipt);
    assert.ok(result.receipt.includes(approver), 'receipt actor does not match');
    assert.ok(result.state.includes(citation), 'delivered workpaper does not show the citation');
  } else {
    assert.match(result.receipt, /Delivery pending/, 'pending workpaper has no pending receipt');
    assert.match(status, /Not delivered yet/, 'pending approval reported success');
  }
  return { delivered: result.delivered, pending: result.pending, status: result.state, receipt: result.receipt };
}

export async function retryUtilityReply(page, { requestId } = {}) {
  const id = uuid(requestId);
  await ensureOpen(page, id);
  const retry = page.locator('[data-action="retry"]');
  await assertEnabled(retry, 'Retry reply');
  const status = await settleClick(page, retry);
  assert.ok(!/^Could not retry reply/.test(status), status);
  const result = await outcome(page);
  assert.ok(result.delivered || result.pending, `retry did not reach delivered or pending: ${status}`);
  if (result.delivered) assertReceipt(result.receipt);
  else assert.match(result.receipt, /Delivery pending/, 'pending retry has no pending receipt');
  return { delivered: result.delivered, pending: result.pending, status: result.state, receipt: result.receipt };
}

export async function readUtilityWorkpaper(page, { requestId, body, privateNotes, policyCitation, approverName, delivered } = {}) {
  const id = uuid(requestId);
  const publicBody = str(body, 'body', true);
  const notes = str(privateNotes, 'privateNotes', true);
  const citation = str(policyCitation, 'policyCitation');
  const approver = str(approverName, 'approverName');
  assert.equal(typeof delivered, 'boolean', 'delivered must be a boolean');
  await openUtilityRequest(page, { requestId: id });
  const bodyValue = await page.locator('[data-role="body"]').inputValue();
  const notesValue = await page.locator('[data-role="private-notes"]').inputValue();
  assert.equal(bodyValue, publicBody, 'body is not exact on reopen');
  assert.equal(notesValue, notes, 'private notes are not exact on reopen');
  const result = await outcome(page);
  if (delivered) {
    assert.ok(result.delivered, 'workpaper is not delivered');
    assertReceipt(result.receipt);
    assert.ok(result.receipt.includes(approver), 'receipt actor does not match');
    assert.ok(result.state.includes(citation), 'delivered workpaper does not show the citation');
    assert.ok(!/Delivery pending/.test(result.receipt), 'delivered workpaper still shows pending receipt');
  } else {
    assert.ok(!result.delivered, 'workpaper is unexpectedly delivered');
    assert.ok(!/Receipt comment ID:/.test(result.receipt), 'undelivered workpaper has a receipt');
  }
  return { requestId: id, body: bodyValue, privateNotes: notesValue, delivered: result.delivered, pending: result.pending, status: result.state, receipt: result.receipt };
}
