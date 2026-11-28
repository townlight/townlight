import assert from 'node:assert/strict';
import { readRecoveryRecords } from './ule-recovery-records.mjs';

export async function readRecoverySource({ native, kind, entry, downloadRecordsAttachment, recordsPathsRedacted }) {
  const response = await native(`${kind}_request`, {
    request: { operation: 'get', id: entry.id, revision: entry.revision },
  });
  assert.notEqual(response?.ok, false, `${kind} request failed`);
  const source = response?.result ?? response;

  assert.equal(source.id, entry.id);
  assert.equal(source.revision, entry.revision);
  assert.equal(source.sha256, entry.sha256);
  assert.equal(source.private_notes, entry.privateNotes);
  assert.ok(source.approval, 'approval is required');
  assert.equal(source.approval.revision, source.revision);
  assert.equal(source.approval.sha256, source.sha256);
  assert.ok(source.approval.actor_id, 'approval actor is required');

  if (kind === 'elections') {
    assert.ok(source.author?.actor_id, 'election author is required');
    assert.notEqual(source.author.actor_id, source.approval.actor_id);
  }

  assert.ok(Array.isArray(source.links), 'source links are required');
  const links = source.links.filter((link) =>
    link.source_revision === entry.revision &&
    link.article_id === entry.article.id &&
    link.article_revision === entry.article.revision
  );
  assert.equal(links.length, 1, 'expected exactly one recovery link');
  const receipt = links[0].records_receipt;
  assert.ok(receipt, 'records receipt is required');
  assert.equal(receipt.article_id, entry.article.id);
  assert.equal(receipt.revision, entry.article.revision);
  assert.equal(receipt.archive_sha256, entry.records.sha256);
  assert.equal(receipt.records_id, entry.records.requestId);
  assert.equal(receipt.file_id, entry.records.attachmentId);

  const records = await readRecoveryRecords({
    native,
    records: entry.records,
    downloadRecordsAttachment,
    recordsPathsRedacted,
    article: entry.article,
    source,
  });
  return { kind, source, records };
}
