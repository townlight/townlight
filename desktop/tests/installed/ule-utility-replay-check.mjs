import assert from 'node:assert';
import { readUtilityReplyEvidence } from './ule-utility-replay.mjs';

export async function verifyUtilityReplay(native, requestId) {
  const before = await readUtilityReplyEvidence(native, requestId);

  const raw = await native('utilities_request', {
    request: {
      operation: 'retry-reply',
      request_id: requestId,
      payload: {
        expected_revision: before.workpaper.revision,
      },
    },
  });
  const result = raw?.result ?? raw;

  assert.strictEqual(result.delivered, true);

  const after = await readUtilityReplyEvidence(native, requestId);

  assert.strictEqual(
    after.workpaper.idempotency_key,
    before.workpaper.idempotency_key,
  );
  assert.strictEqual(after.comment.id, before.comment.id);
  assert.strictEqual(after.workpaper.comment_id, before.workpaper.comment_id);
  assert.strictEqual(after.events.length, before.events.length);
  assert.strictEqual(after.notifications.length, before.notifications.length);

  return after;
}