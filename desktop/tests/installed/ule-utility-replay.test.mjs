import test from 'node:test';
import assert from 'node:assert/strict';
import { loseUtilityApprovalAck } from './ule-lost-ack.mjs';

test('loseUtilityApprovalAck simulates acknowledgement loss after commit', async () => {
  let committed = false;

  const native = async () => {
    committed = true;
    return {
      result: {
        delivered: true,
        receipt: { request_id: 'case', comment_id: 'comment' },
        workpaper: { idempotency_key: 'key' }
      }
    };
  };

  await assert.rejects(
    () => loseUtilityApprovalAck(native, { requestId: 'case', expectedRevision: 1 }),
    (e) => e.simulatedAcknowledgementLoss === true
  );

  assert.equal(committed, true);
});