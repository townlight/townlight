import assert from 'node:assert';
import { prepareUleUtility } from './ule-utility-workflows.mjs';
import { approveUleUtility } from './ule-utility-approval.mjs';
import { verifyUtilityReplay } from './ule-utility-replay-check.mjs';
import { verifyUtilityPublic } from './ule-utility-public.mjs';
import { verifyUtilityMail } from './ule-utility-mail.mjs';
import { installedUlePublications } from './ule-publication-scenarios.mjs';
import { captureUleRecovery } from './ule-recovery.mjs';

export async function uleWorkflows(config) {
  const { utility } = config;

  const first = await prepareUleUtility({ ...config, ...utility });
  await approveUleUtility({
    ...config,
    context: first,
    approverName: utility.approverName,
  });
  const evidence1 = await verifyUtilityReplay(config.native, first.requestId);
  assert.strictEqual(evidence1.events.length, first.resident.evidence.baseline.eventCount + 1);
  assert.strictEqual(evidence1.notifications.length, first.resident.evidence.baseline.notificationCount + 1);
  const primaryPublic = await verifyUtilityPublic({ ...config, context: first });
  const primaryMail = await verifyUtilityMail({ ...config, context: first });
  await config.save('ule-utility-primary-public', primaryPublic);
  await config.save('ule-utility-primary-mail', primaryMail);
  await config.save('ule-utility-primary-replay-evidence', {
    requestId: first.requestId,
    commentId: evidence1.comment.id,
    notificationId: evidence1.notification.id,
    notificationEventId: evidence1.notification.event_id,
    idempotencyKey: evidence1.workpaper.idempotency_key,
    eventCount: evidence1.events.length,
    notificationCount: evidence1.notifications.length,
    baseline: first.resident.evidence.baseline,
    fault_boundary: 'none',
  });

  const second = await prepareUleUtility({
    ...config,
    ...utility,
    categoryCode: `${utility.categoryCode}-retry`,
    description: `${utility.description} Simulated caller acknowledgement recovery.`,
    privateNotes: `${utility.privateNotes} Recovery case.`,
  });
  await approveUleUtility({
    ...config,
    context: second,
    approverName: utility.approverName,
    lostAcknowledgement: true,
  });
  const evidence2 = await verifyUtilityReplay(config.native, second.requestId);
  assert.strictEqual(evidence2.events.length, second.resident.evidence.baseline.eventCount + 1);
  assert.strictEqual(evidence2.notifications.length, second.resident.evidence.baseline.notificationCount + 1);
  const recoveryPublic = await verifyUtilityPublic({ ...config, context: second });
  const recoveryMail = await verifyUtilityMail({ ...config, context: second });
  await config.save('ule-utility-recovery-public', recoveryPublic);
  await config.save('ule-utility-recovery-mail', recoveryMail);
  await config.save('ule-utility-recovery-replay-evidence', {
    requestId: second.requestId,
    commentId: evidence2.comment.id,
    notificationId: evidence2.notification.id,
    notificationEventId: evidence2.notification.event_id,
    idempotencyKey: evidence2.workpaper.idempotency_key,
    eventCount: evidence2.events.length,
    notificationCount: evidence2.notifications.length,
    baseline: second.resident.evidence.baseline,
    fault_boundary: 'simulated test caller acknowledgement timeout after real durable native commit; ordinary rendered reopen, then typed replay',
  });

  const firstID = first.requestId;
  const secondID = second.requestId;

  await config.switchActor('unauthorized');
  await assert.rejects(
    async () => config.native('utilities_request', { request: { operation: 'open-request', request_id: firstID } }),
    (error) => {
      assert.strictEqual(error?.code, 'access-denied');
      assert.strictEqual(error?.outcome_unknown, false);
      return true;
    }
  );
  await config.save('ule-utility-unauthorized-denied', { requestId: firstID, code: 'access-denied', denied: true });
  await config.switchActor('administrator');

  const publications = await installedUlePublications(config);
  await config.switchActor('administrator');
  const recovery = await captureUleRecovery({
    native: config.native,
    utilityRequestIds: [firstID, secondID],
    publications: publications.recoveryExpected,
    downloadRecordsAttachment: config.downloadRecordsAttachment,
    recordsPathsRedacted: config.recordsPathsRedacted,
  });

  await config.save('ule-identities', { utilityRequestIds: [firstID, secondID] });
  await config.save('ule-recovery', recovery);

  return { utility: first, utilities: [first, second], publications, recovery };
}
