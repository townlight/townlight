import assert from 'node:assert/strict';

export async function readUtilityReplyEvidence(native, requestId) {
  const utilitiesRaw = await native('utilities_request', {
    request: { operation: 'open-request', request_id: requestId },
  });
  const utilitiesResult = utilitiesRaw.result ?? utilitiesRaw;
  const workpaper = utilitiesResult.workpaper;

  const serviceRaw = await native('service_requests_request', {
    request: { operation: 'request', id: requestId },
  });
  const serviceResult = serviceRaw.result ?? serviceRaw;
  const serviceRequest = serviceResult.request ?? serviceResult;
  const events = serviceRequest.events;
  const notifications = serviceRequest.notifications;

  const matchingEvents = events.filter((event) => event.id === workpaper.comment_id);
  assert.strictEqual(matchingEvents.length, 1);
  const comment = matchingEvents[0];
  assert.strictEqual(comment.kind, 'comment');
  assert.strictEqual(comment.public, true);
  assert.strictEqual(
    comment.message,
    `${workpaper.body}\n\nCitations:\n- ${workpaper.policy_citation}`,
  );

  const matchingNotifications = notifications.filter(
    (notification) => notification.event_id === comment.id,
  );
  assert.strictEqual(matchingNotifications.length, 1);
  const notification = matchingNotifications[0];

  assert.ok(workpaper.delivered_at);
  assert.ok(workpaper.idempotency_key);

  return { requestId, workpaper, events, notifications, comment, notification };
}