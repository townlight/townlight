import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const HASH_PATTERN = /^[0-9a-f]{64}$/i;

function fail(message) {
  throw new Error(message);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function must(value, name) {
  if (value === undefined || value === null || value === '') fail(`missing ${name}`);
  return value;
}

function assertHash(value, name) {
  assert(typeof value === 'string' && HASH_PATTERN.test(value), `${name} is not a sha256`);
}

function assertSize(value, name) {
  assert(Number.isSafeInteger(value) && value > 0, `${name} is not a positive safe integer`);
}

function assertCount(value, name) {
  assert(Number.isSafeInteger(value) && value >= 0, `${name} is not a non-negative safe integer`);
}

function sha256Hex(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function unwrap(value) {
  return value && typeof value === 'object' && value.result !== undefined ? value.result : value;
}

export function recoveryEvidence({ resident, staff, delivery, enrollment, finance } = {}) {
  const photo = must(resident && resident.evidence && resident.evidence.photo, 'resident.evidence.photo');
  const staffIds = must(staff && staff.ids, 'staff.ids');
  const milestones = must(staff && staff.milestones, 'staff.milestones');
  const records = must(delivery && delivery.records, 'delivery.records');
  const registrations = must(enrollment && enrollment.registrations, 'enrollment.registrations');
  const financeIds = must(finance && finance.ids, 'finance.ids');
  const archive = must(finance && finance.archive, 'finance.archive');
  const financeState = must(finance && finance.finance, 'finance.finance');
  const correction = must(delivery && delivery.correction, 'delivery.correction');

  const result = {
    resident: {
      attachmentId: must(photo.attachmentId, 'resident attachmentId'),
      sha256: must(photo.sha256, 'resident sha256'),
      sizeBytes: must(photo.sizeBytes, 'resident sizeBytes')
    },
    staff: {
      requestId: must(staffIds.records_request, 'staff records_request'),
      attachmentId: must(staffIds.records_attachment, 'staff records_attachment'),
      sha256: must(milestones.records_result_sha256, 'staff records_result_sha256')
    },
    delivery: {
      requestId: must(records.requestId, 'delivery requestId'),
      attachmentId: must(records.attachmentId, 'delivery attachmentId'),
      sha256: must(records.sha256, 'delivery sha256'),
      sizeBytes: must(records.sizeBytes, 'delivery sizeBytes')
    },
    parks: {
      requestId: must(financeIds.records_request, 'finance records_request'),
      attachmentId: must(financeIds.records_attachment, 'finance records_attachment'),
      sha256: must(archive.sha256, 'finance archive sha256'),
      sizeBytes: must(archive.size_bytes, 'finance archive size_bytes')
    },
    enrollment: {
      promoted: must(registrations.promoted, 'enrollment promoted')
    },
    finance: {
      balanceAfter: must(financeState.balance_after, 'finance balance_after'),
      refundedAfter: must(financeState.refunded_after, 'finance refunded_after')
    },
    correction: {
      sha256: must(correction.sha256, 'delivery correction sha256')
    }
  };

  assertHash(result.resident.sha256, 'resident sha256');
  assertSize(result.resident.sizeBytes, 'resident sizeBytes');
  assertHash(result.staff.sha256, 'staff records_result_sha256');
  assertHash(result.delivery.sha256, 'delivery sha256');
  assertSize(result.delivery.sizeBytes, 'delivery sizeBytes');
  assertHash(result.parks.sha256, 'parks sha256');
  assertSize(result.parks.sizeBytes, 'parks sizeBytes');
  assertHash(result.correction.sha256, 'correction sha256');
  assertCount(result.finance.balanceAfter, 'finance balance_after');
  assertCount(result.finance.refundedAfter, 'finance refunded_after');

  return result;
}

export async function verifyRecoveryEvidence({ native, ids, expected, downloadRecordsAttachment } = {}) {
  assert(typeof native === 'function', 'native is required');
  assert(ids && typeof ids === 'object', 'ids is required');
  assert(expected && typeof expected === 'object', 'expected is required');
  assert(typeof downloadRecordsAttachment === 'function', 'downloadRecordsAttachment is required');

  const resident = must(expected.resident, 'expected.resident');
  const residentRequest = must(ids.residentRequest, 'ids.residentRequest');
  const residentAttachment = must(resident.attachmentId, 'expected.resident.attachmentId');

  assertHash(resident.sha256, 'expected.resident.sha256');
  assertSize(resident.sizeBytes, 'expected.resident.sizeBytes');

  const photoRaw = await native('service_requests_request', {
    request: {
      operation: 'download-attachment',
      id: residentRequest,
      payload: { attachment_id: residentAttachment }
    }
  });
  const photoResult = unwrap(photoRaw);
  assert(photoResult && typeof photoResult.path === 'string', 'resident photo readback path missing');

  const photoBytes = await readFile(photoResult.path);
  const photoSha = sha256Hex(photoBytes);
  assert(photoSha === resident.sha256, 'resident photo sha256 mismatch');
  assert(photoBytes.length === resident.sizeBytes, 'resident photo size mismatch');

  async function verifyArchive(entry, label) {
    const requestId = must(entry.requestId, `${label}.requestId`);
    const attachmentId = must(entry.attachmentId, `${label}.attachmentId`);
    const expectedSha = must(entry.sha256, `${label}.sha256`);
    assertHash(expectedSha, `${label}.sha256`);

    const viewRaw = await native('records_domain_request', {
      request: { operation: 'view', request_id: requestId }
    });
    const view = unwrap(viewRaw);
    const documents = view && view.documents;
    assert(Array.isArray(documents), `records view ${label} has no documents`);

    const document = documents.find((item) => item && item.attachment_id === attachmentId);
    assert(document, `records view ${label} missing attachment`);
    assert(document.sha256 === expectedSha, `records view ${label} sha256 mismatch`);

    const documentSize = document.size_bytes;
    assertSize(documentSize, `records view ${label} size`);

    let expectedSize = entry.sizeBytes;
    if (expectedSize !== undefined) {
      assertSize(expectedSize, `${label}.sizeBytes`);
      assert(documentSize === expectedSize, `records view ${label} size mismatch`);
    } else {
      expectedSize = documentSize;
    }

    const downloaded = await downloadRecordsAttachment({
      requestId,
      attachmentId,
      expectedSha256: expectedSha,
      expectedSize
    });
    assert(Buffer.isBuffer(downloaded), `download ${label} did not return a Buffer`);
    assert(sha256Hex(downloaded) === expectedSha, `download ${label} sha256 mismatch`);
    assert(downloaded.length === expectedSize, `download ${label} size mismatch`);

    return { sha256: expectedSha, sizeBytes: expectedSize };
  }

  const staffFinding = await verifyArchive(must(expected.staff, 'expected.staff'), 'staff');
  const deliveryFinding = await verifyArchive(must(expected.delivery, 'expected.delivery'), 'delivery');
  const parksFinding = await verifyArchive(must(expected.parks, 'expected.parks'), 'parks');

  const parksSession = must(ids.parksSession, 'ids.parksSession');
  const rosterRaw = await native('parks_request', {
    request: { operation: 'sessions-roster', session_id: parksSession }
  });
  const rosterResult = unwrap(rosterRaw);
  const rows = Array.isArray(rosterResult)
    ? rosterResult
    : rosterResult && Array.isArray(rosterResult.rows)
      ? rosterResult.rows
      : null;
  assert(rows, 'sessions-roster rows missing');

  const roster = rows
    .map((row) => ({
      registration_id: row.registration_id,
      state: row.state,
      revision: row.revision,
      checked_in_at: row.checked_in_at === undefined ? null : row.checked_in_at
    }))
    .sort((left, right) => {
      const a = String(left.registration_id);
      const b = String(right.registration_id);
      return a < b ? -1 : a > b ? 1 : 0;
    });

  const promoted = must(
    expected.enrollment && expected.enrollment.promoted,
    'expected.enrollment.promoted'
  );
  const promotedRow = roster.find((row) => row.registration_id === promoted);
  assert(promotedRow, 'promoted registration missing from roster');
  assert(promotedRow.state === 'confirmed', 'promoted registration is not confirmed');
  assert(
    promotedRow.checked_in_at !== null &&
      promotedRow.checked_in_at !== undefined &&
      promotedRow.checked_in_at !== '',
    'promoted registration is not checked in'
  );

  const parksObligation = must(ids.parksObligation, 'ids.parksObligation');
  const obligationRaw = await native('parks_request', {
    request: { operation: 'obligation-get', id: parksObligation }
  });
  const obligation = unwrap(obligationRaw);
  assert(obligation && typeof obligation === 'object', 'obligation result missing');
  assert(obligation.id === parksObligation, 'obligation id mismatch');
  assertCount(obligation.paid_cents, 'obligation paid_cents');
  assertCount(obligation.refunded_cents, 'obligation refunded_cents');
  assertCount(obligation.balance_cents, 'obligation balance_cents');

  const expectedFinance = must(expected.finance, 'expected.finance');
  assertCount(expectedFinance.refundedAfter, 'expected.finance.refundedAfter');
  assertCount(expectedFinance.balanceAfter, 'expected.finance.balanceAfter');
  assert(
    obligation.refunded_cents === expectedFinance.refundedAfter,
    'obligation refunded_cents mismatch'
  );
  assert(
    obligation.balance_cents === expectedFinance.balanceAfter,
    'obligation balance_cents mismatch'
  );

  const communication = must(ids.communication, 'ids.communication');
  const articleRaw = await native('communications_request', {
    request: { operation: 'article', id: communication }
  });
  const articleResult = unwrap(articleRaw);
  const article =
    articleResult && articleResult.article !== undefined ? articleResult.article : articleResult;
  const correctionSha = article && article.revision && article.revision.sha256;
  const expectedCorrection = must(
    expected.correction && expected.correction.sha256,
    'expected.correction.sha256'
  );
  assertHash(expectedCorrection, 'expected.correction.sha256');
  assert(correctionSha === expectedCorrection, 'correction sha256 mismatch');

  return {
    resident: { sha256: photoSha, sizeBytes: photoBytes.length },
    staff: staffFinding,
    delivery: deliveryFinding,
    parks: parksFinding,
    roster,
    totals: {
      paidCents: obligation.paid_cents,
      refundedCents: obligation.refunded_cents,
      balanceCents: obligation.balance_cents
    },
    correction: { sha256: correctionSha }
  };
}
