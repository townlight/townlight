import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { verifyUtilityMail } from './ule-utility-mail.mjs';

const MIME_HEADERS = [
  'From: resident@example.test',
  'To: resident@example.test',
  'Subject: Utility mail verification',
  'MIME-Version: 1.0',
  'Content-Type: text/plain; charset=utf-8',
  ''
].join('\r\n');

function plainMime(body) {
  return `${MIME_HEADERS}\r\n${body}`;
}

test('verifyUtilityMail verifies matching mail, rejects duplicates and private canary leaks', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'utility-mail-verify-'));
  const mailDir = path.join(root, 'mail');
  const oneJson = path.join(mailDir, 'one.json');
  const oneEml = path.join(mailDir, 'one.eml');
  const twoJson = path.join(mailDir, 'two.json');
  const twoEml = path.join(mailDir, 'two.eml');

  const metadata = {
    recipients: ['resident@example.test'],
    eml: 'one.eml'
  };

  const context = {
    body: 'Approved answer',
    policy: { citation: 'Policy 1' },
    privateNotes: 'PRIVATE CANARY',
    resident: {
      private: { contactEmail: 'resident@example.test' }
    }
  };

  async function capture(email, body) {
    assert.equal(email, context.resident.private.contactEmail);
    assert.equal(body, context.body);
    return JSON.parse(await readFile(oneJson, 'utf8'));
  }

  try {
    await mkdir(mailDir, { recursive: true });
    await writeFile(oneJson, JSON.stringify(metadata), 'utf8');
    await writeFile(oneEml, plainMime('Approved answer\nPolicy 1'), 'utf8');

    const matching = await verifyUtilityMail({
      fixtureRoot: root,
      context,
      captureMessage: capture
    });

    assert.equal(matching.matchingMessages, 1);

    await writeFile(twoJson, JSON.stringify({ ...metadata, eml: 'two.eml' }), 'utf8');
    await writeFile(twoEml, plainMime('Approved answer\nPolicy 1'), 'utf8');

    await assert.rejects(
      () =>
        verifyUtilityMail({
          fixtureRoot: root,
          context,
          captureMessage: capture
        }),
      (error) => {
        assert.equal(error?.code, 'ERR_ASSERTION');
        assert.equal(error?.actual, 2);
        assert.equal(error?.expected, 1);
        return true;
      }
    );

    await rm(twoJson, { force: true });
    await rm(twoEml, { force: true });

    await writeFile(
      oneEml,
      plainMime('Approved answer\nPolicy 1\nPRIVATE CANARY'),
      'utf8'
    );

    await assert.rejects(
      () =>
        verifyUtilityMail({
          fixtureRoot: root,
          context,
          captureMessage: capture
        }),
      (error) => {
        assert.equal(error?.code, 'ERR_ASSERTION');
        assert.equal(error?.actual, false);
        assert.equal(error?.expected, true);
        return true;
      }
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});