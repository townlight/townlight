import assert from 'node:assert/strict';
import { installedServiceRequests } from './service-requests-workflow.mjs';
import { configureEmail, waitMailJson } from './community-workflows.mjs';
import { preparePublicMeetingSource } from './communications-source.mjs';
import { createApprovedCommunication } from './communications-draft.mjs';
import { readRecoveryRecords } from './ule-recovery-records.mjs';

const unwrap = (response) => {
  assert.notEqual(response?.ok, false, response?.error ?? 'ULE request failed');
  const value = response?.result ?? response;
  assert.notEqual(value?.ok, false, value?.error ?? 'ULE request failed');
  return value;
};

export async function seedUleUpgrade({
  page,
  native,
  save,
  meetingId,
  fixtureRoot,
  portalBaseUrl,
  downloadRecordsAttachment,
}) {
  assert.ok(meetingId, 'meetingId is required');
  assert.ok(fixtureRoot, 'fixtureRoot is required');
  assert.ok(portalBaseUrl, 'portalBaseUrl is required');

  await configureEmail(native, fixtureRoot);

  await page.locator('[data-surface="Staff"]').click();
  await page.locator('.sidebar [data-area="service-requests"]').click();

  const staff = await installedServiceRequests({
    page,
    native,
    save,
    portalBaseUrl,
    downloadRecordsAttachment,
    recordsSeedOnly: true,
    captureMessage: (recipient, body) => waitMailJson(fixtureRoot, recipient, body),
  });

  await page.locator('[data-surface="Staff"]').click();
  await page.locator('.sidebar [data-area="communications"]').click();

  const publicSource = await preparePublicMeetingSource({ native, meetingId, save });
  const article = await createApprovedCommunication({
    page,
    native,
    meetingId: publicSource.publicRecordId,
  });

  const recordsView = unwrap(await native('records_domain_request', {
    request: { operation: 'view', request_id: staff.ids.records_request },
  }));
  const documents = recordsView.documents ?? [];
  const document = documents.find(
    (item) => (item.attachment_id ?? item.id) === staff.ids.records_attachment,
  );
  assert.ok(document, 'records attachment was not returned');

  const ids = {
    serviceRequestId: staff.ids.main_request,
    communicationId: article.id,
    records: {
      requestId: staff.ids.records_request,
      attachmentId: staff.ids.records_attachment,
      sha256: staff.milestones.records_result_sha256,
      sizeBytes: document.size_bytes,
    },
  };

  const expected = await readUleUpgrade({
    native,
    ids,
    downloadRecordsAttachment,
    stage: 'seed',
  });

  if (save) await save('ule-upgrade-seed', { ids, expected });
  return { ids, expected };
}

export async function readUleUpgrade({
  native,
  ids,
  expected,
  downloadRecordsAttachment,
  save,
  stage = 'readback',
}) {
  const serviceRequest = unwrap(await native('service_requests_request', {
    request: { operation: 'request', id: ids.serviceRequestId },
  }));
  const serviceRequestDetail = serviceRequest.request ?? serviceRequest;
  assert.equal(serviceRequestDetail.id, ids.serviceRequestId);

  const communication = unwrap(await native('communications_request', {
    request: { operation: 'article', id: ids.communicationId },
  }));
  const communicationDetail = communication.article ?? communication;
  assert.equal(communicationDetail.id, ids.communicationId);

  const records = await readRecoveryRecords({
    native,
    records: ids.records,
    downloadRecordsAttachment,
  });

  const result = { serviceRequest, communication, records };
  if (expected) assert.deepEqual(result, expected);
  if (save) await save(`ule-upgrade-${stage}`, result);
  return result;
}