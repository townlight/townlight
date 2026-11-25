import assert from 'node:assert/strict';
import {createHash, randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';

const FINANCE = '.finance-render';
const SELECTED = `${FINANCE} [data-finance-selected]`;
const RECORDS = '[data-handoff]';
const PREVIEW = `${RECORDS} [data-handoff-preview-result]`;
const RECEIPT = `${RECORDS} [data-handoff-receipt]`;

export async function installedParksFinanceRecords({page, native, save, bookingId, obligationId, downloadRecordsAttachment}) {
  assert.equal(typeof native, 'function', 'native typed-operation bridge is required');
  assert.ok(bookingId, 'bookingId is required');
  assert.ok(obligationId, 'obligationId is required');

  const unwrap = response =>
    response && typeof response === 'object' && Object.prototype.hasOwnProperty.call(response, 'result')
      ? response.result
      : response;
  const call = async (operation, extra = {}) =>
    unwrap(await native('parks_request', {request: {operation, ...extra}}));
  const recordsCall = async (operation, extra = {}) =>
    unwrap(await native('records_request', {request: {operation, ...extra}}));
  const text = async locator => (await locator.textContent()) ?? '';
  const ledger = receipt => (Array.isArray(receipt?.ledger) ? receipt.ledger : []);
  const countLedger = (receipt, operation, reference, amount) =>
    ledger(receipt).filter(entry =>
      entry?.operation === operation &&
      entry?.reference === reference &&
      Number(entry?.amount_cents) === amount).length;
  const findLedger = (receipt, operation, reference, amount) =>
    ledger(receipt).find(entry =>
      entry?.operation === operation &&
      entry?.reference === reference &&
      Number(entry?.amount_cents) === amount);
  async function waitText(locator, pattern, label) {
    const deadline = Date.now() + 30_000;
    let last = '';
    while (Date.now() < deadline) {
      if (await locator.count()) {
        last = await text(locator);
        if (pattern.test(last)) return last;
      }
      await delay(100);
    }
    throw new Error(`${label} timed out; last text: ${last}`);
  }

  try {
    const finance = page.locator(FINANCE);
    if (!(await finance.isVisible().catch(() => false))) {
      await page.evaluate(async () => {
        await window.audit.click('[data-surface="Staff"]', {confirm: false});
        await window.audit.nav('parks');
      });
    }
    await finance.waitFor({state: 'visible', timeout: 15_000});
    await page.locator(SELECTED).waitFor({state: 'attached'});

    const booking = await call('bookings-get', {booking_id: bookingId});
    assert.equal(String(booking?.id ?? ''), String(bookingId), 'booking readback id');

    assert.ok(booking?.resource_id, 'booking resource id required');
    const resourceSelect = page.locator('[data-booking-resource]');
    await resourceSelect.waitFor({state: 'visible'});
    const resourceOption = resourceSelect.locator(`option[value="${booking.resource_id}"]`);
    await resourceOption.waitFor({state: 'attached', timeout: 15_000});
    await resourceSelect.selectOption(String(booking.resource_id));
    const bookingList = page.locator('[data-booking-list]');
    await bookingList.locator(`option[value="${bookingId}"]`).waitFor({state: 'attached', timeout: 15_000});
    await bookingList.selectOption(String(bookingId));
    await waitText(page.locator(SELECTED), new RegExp(String(obligationId).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), 'Select booking in finance UI');

    const before = await call('obligation-receipt', {id: obligationId});
    assert.ok(before && typeof before === 'object', 'receipt before payment');
    const balanceBefore = Number(before?.totals?.balance_cents);
    assert.ok(Number.isSafeInteger(balanceBefore) && balanceBefore > 0, 'positive backend balance required');
    const paymentCents = Math.min(balanceBefore, 1000);
    if (paymentCents < 2) {
      throw new Error('unsupported: backend balance is too small to record a payment and partial refund.');
    }
    const paidBefore = Number(before?.totals?.paid_cents ?? 0);
    const refundedBefore = Number(before?.totals?.refunded_cents ?? 0);

    const runId = `${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
    const paymentReference = `acceptance-cash-${runId}`;
    const paymentKey = randomUUID();
    const paymentPayload = {
      amount_cents: paymentCents,
      reference: paymentReference,
      idempotency_key: paymentKey,
    };
    await call('offline-payment', {id: obligationId, payload: paymentPayload});
    const paidReceipt = await call('obligation-receipt', {id: obligationId});
    assert.equal(Number(paidReceipt?.totals?.paid_cents), paidBefore + paymentCents, 'durable paid amount');
    const paymentEntry = findLedger(paidReceipt, 'payment', paymentReference, paymentCents);
    assert.ok(paymentEntry?.id, 'durable payment ledger entry');
    assert.equal(countLedger(paidReceipt, 'payment', paymentReference, paymentCents), 1, 'single payment ledger row');

    await call('offline-payment', {id: obligationId, payload: paymentPayload});
    const retryReceipt = await call('obligation-receipt', {id: obligationId});
    assert.equal(countLedger(retryReceipt, 'payment', paymentReference, paymentCents), 1, 'idempotent payment retry must not duplicate');
    assert.equal(Number(retryReceipt?.totals?.paid_cents), paidBefore + paymentCents, 'idempotent payment retry must not change paid total');

    const refundCents = Math.max(1, Math.floor(paymentCents / 2));
    assert.ok(refundCents < paymentCents, 'refund must be partial');
    const refundReference = `acceptance-partial-refund-${runId}`;
    const refundKey = randomUUID();
    await call('offline-refund', {
      id: obligationId,
      payload: {
        amount_cents: refundCents,
        reference: refundReference,
        idempotency_key: refundKey,
      },
    });
    const refundedReceipt = await call('obligation-receipt', {id: obligationId});
    assert.equal(Number(refundedReceipt?.totals?.refunded_cents), refundedBefore + refundCents, 'durable refunded amount');
    assert.equal(Number(refundedReceipt?.totals?.net_paid_cents), paidBefore + paymentCents - refundedBefore - refundCents, 'durable net paid amount');
    const refundEntry = findLedger(refundedReceipt, 'refund', refundReference, refundCents);
    assert.ok(refundEntry?.id, 'durable refund ledger entry');
    assert.equal(countLedger(refundedReceipt, 'refund', refundReference, refundCents), 1, 'single refund ledger row');

    const reconciliation = await call('reconciliation', {limit: 100, offset: 0});
    const rows = Array.isArray(reconciliation) ? reconciliation : (reconciliation?.rows ?? []);
    const reconRow = rows.find(row => String(row?.obligation_id ?? '') === String(obligationId));
    assert.ok(reconRow, 'reconciliation row for obligation');
    assert.equal(Number(reconRow.refunded_cents), Number(refundedReceipt?.totals?.refunded_cents), 'reconciliation refunded total');
    assert.equal(Number(reconRow.balance_cents), Number(refundedReceipt?.totals?.balance_cents), 'reconciliation balance total');

    const kindSelect = page.locator('[data-archive-kind]');
    if ((await kindSelect.count()) === 0) {
      throw new Error('unsupported: Records archive source selection UI is not available.');
    }
    await kindSelect.selectOption('booking');
    const entityOption = page.locator(`[data-archive-entity] option[value="${bookingId}"]`);
    await entityOption.waitFor({state: 'attached', timeout: 15_000});
    await page.locator('[data-archive-entity]').selectOption(bookingId);

    const records = page.locator(RECORDS);
    await records.waitFor({state: 'visible', timeout: 15_000});
    await waitText(records.locator('[data-handoff-source-label]'), new RegExp(String(bookingId)), 'Records booking source');
    await records.locator('[data-handoff-preview-button]').click();
    await records.locator(PREVIEW).waitFor({state: 'visible', timeout: 15_000});
    const archiveSha = (await text(records.locator('[data-handoff-sha256]'))).trim();
    assert.match(archiveSha, /^[0-9a-f]{64}$/i, 'archive bundle SHA-256 preview');
    const archiveSize = Number(await text(records.locator('[data-handoff-size]')));
    assert.ok(Number.isSafeInteger(archiveSize) && archiveSize > 0, 'archive bundle size preview');

    await records.locator('[data-handoff-review-checkbox]').check();
    const archiveButton = records.locator('[data-handoff-archive-button]');
    assert.equal(await archiveButton.isEnabled(), true, 'archive button enabled after review');
    await archiveButton.click();
    await records.locator(RECEIPT).waitFor({state: 'visible', timeout: 15_000});
    const recordsRequestId = (await text(records.locator('[data-handoff-records-request-id]'))).trim();
    const attachmentId = (await text(records.locator('[data-handoff-attachment-id]'))).trim();
    const returnedSha = (await text(records.locator('[data-handoff-receipt-sha256]'))).trim();
    assert.ok(recordsRequestId, 'returned Records request id');
    assert.ok(attachmentId, 'returned Records attachment id');
    assert.equal(returnedSha, archiveSha, 'returned archive bundle hash');

    if (typeof downloadRecordsAttachment !== 'function') {
      throw new Error('downloadRecordsAttachment callback is required');
    }
    const viewed = unwrap(await native('records_domain_request', {request: {operation: 'view', request_id: recordsRequestId}}));
    const documents = viewed && Array.isArray(viewed.documents) ? viewed.documents : [];
    const document = documents.find(item =>
      item &&
      String(item.attachment_id ?? '') === String(attachmentId) &&
      String(item.sha256 ?? '').toLowerCase() === archiveSha.toLowerCase());
    assert.ok(document, 'Records view document matching archive attachment and hash');
    const expectedSha256 = String(document.sha256).toLowerCase();
    assert.match(expectedSha256, /^[0-9a-f]{64}$/i, 'Records attachment metadata hash');
    const expectedSize = Number(document.size_bytes);
    assert.ok(Number.isSafeInteger(expectedSize) && expectedSize > 0, 'Records attachment metadata size');
    assert.equal(expectedSha256, archiveSha.toLowerCase(), 'Records attachment metadata hash is archive bundle hash');
    assert.equal(expectedSize, archiveSize, 'Records attachment metadata size');
    const actualBuffer = await downloadRecordsAttachment({
      requestId: recordsRequestId,
      attachmentId: String(attachmentId),
      expectedSha256,
      expectedSize,
    });
    assert.ok(Buffer.isBuffer(actualBuffer), 'downloadRecordsAttachment must return a Buffer');
    assert.equal(actualBuffer.length, expectedSize, 'downloaded archive bundle size');
    const downloadedSha = createHash('sha256').update(actualBuffer).digest('hex');
    assert.equal(downloadedSha, expectedSha256, 'downloaded bytes hash equals archive bundle hash, not booking revision hash');

    const result = {
      passed: true,
      ids: {
        booking: String(bookingId),
        obligation: String(obligationId),
        payment_ledger: String(paymentEntry.id),
        refund_ledger: String(refundEntry.id),
        records_request: recordsRequestId,
        records_attachment: attachmentId,
      },
      finance: {
        payment_cents: paymentCents,
        refund_cents: refundCents,
        balance_after: Number(refundedReceipt?.totals?.balance_cents),
        refunded_after: Number(refundedReceipt?.totals?.refunded_cents),
      },
      idempotency: {
        payment_key: paymentKey,
        retry_duplicate_count: countLedger(retryReceipt, 'payment', paymentReference, paymentCents),
      },
      reconciliation: {
        refunded_cents: Number(reconRow.refunded_cents),
        balance_cents: Number(reconRow.balance_cents),
      },
      archive: {
        sha256: downloadedSha,
        size_bytes: archiveSize,
      },
    };
    if (typeof save === 'function') await save('installed-parks-finance-records', result);
    return result;
  } finally {
    // no automatic retries or external checkout actions are performed here
  }
}
