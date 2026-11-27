import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { inspectMail } from './communications-postexit.mjs';

export async function verifyUtilityMail({ fixtureRoot, context, captureMessage }) {
  const mail = await captureMessage(context.resident.private.contactEmail, context.body);

  assert.equal(mail.eml, basename(mail.eml));
  assert.deepEqual(mail.recipients, [context.resident.private.contactEmail]);

  const parts = inspectMail(await readFile(join(fixtureRoot, 'mail', mail.eml)));

  assert.ok(
    parts.some(
      (part) =>
        part.includes(context.body) && part.includes(context.policy.citation),
    ),
  );

  if (context.privateNotes) {
    for (const part of parts) {
      assert.ok(!part.includes(context.privateNotes));
    }
  }

  const mailDir = join(fixtureRoot, 'mail');
  const metadataNames = (await readdir(mailDir)).filter((name) => name.endsWith('.json'));
  let matches = 0;

  for (const metadataName of metadataNames) {
    const metadata = JSON.parse(await readFile(join(mailDir, metadataName), 'utf8'));
    const recipients = Array.isArray(metadata.recipients)
      ? metadata.recipients
      : [metadata.recipients].filter(Boolean);

    if (
      recipients.length !== 1 ||
      recipients[0] !== context.resident.private.contactEmail
    ) {
      continue;
    }

    const emlName = metadata.eml ?? basename(metadataName, '.json') + '.eml';
    assert.equal(emlName, basename(emlName));

    const decoded = inspectMail(await readFile(join(mailDir, emlName)));
    if (
      decoded.some(
        (part) =>
          part.includes(context.body) && part.includes(context.policy.citation),
      )
    ) {
      matches += 1;
    }
  }

  assert.equal(matches, 1);

  return {
    matchedMessage: mail.eml,
    matchingMessages: matches,
    bodyAndCitationVerified: true,
    privateNotesAbsent: true,
  };
}