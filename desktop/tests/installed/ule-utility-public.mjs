import assert from 'node:assert/strict';
import { readUtilityResident } from './resident-311.mjs';

export async function verifyUtilityPublic({
  context,
  portalBaseUrl,
  residentPage,
  captureMessage,
}) {
  const { requestId, body, privateNotes, resident } = context;
  const { evidence, private: residentPrivate } = resident;

  const verified = await readUtilityResident({
    portalBaseUrl,
    page: residentPage,
    tracking: evidence.tracking,
    trackingToken: residentPrivate.trackingToken,
    expectedBody: `${body}\n\nCitations:\n- ${context.policy.citation}`,
    privateNotes,
  });

  assert.equal(verified.requestId, requestId);
  assert.equal(verified.expectedBodyVisible, true);
  assert.equal(verified.privateNotesAbsent, true);

  const denied = await readUtilityResident({
    portalBaseUrl,
    page: residentPage,
    tracking: evidence.tracking,
    trackingToken: residentPrivate.trackingToken,
    expectedBody: body,
    privateNotes,
    wrongToken: 'incorrect-fixture-token-0000000000000000',
  });

  assert.equal(denied.accessDenied, true);

  const mail = await captureMessage(residentPrivate.contactEmail, body);
  assert.ok(mail);

  return {
    requestId,
    trackerVerified: true,
    wrongTokenDenied: true,
    capturedMail: true,
  };
}