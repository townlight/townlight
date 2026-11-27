import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { inspectArchive } from './communications-postexit.mjs';

export async function readRecoveryRecords({ native, records, downloadRecordsAttachment, article, source }) {
  const response = await native('records_domain_request', {
    request: { operation: 'view', request_id: records.requestId },
  });
  assert.notEqual(response?.ok, false, 'records_domain_request failed');
  const result = response?.result ?? response;
  const documents = Array.isArray(result) ? result : result.documents;
  assert.ok(Array.isArray(documents), 'records result documents required');
  const document = documents.find(
    (candidate) => String(candidate.attachment_id || candidate.id) === String(records.attachmentId),
  );
  assert.ok(document, 'recovery attachment document not found');
  assert.equal(document.sha256, records.sha256);
  assert.equal(document.size_bytes, records.sizeBytes);

  const bytes = await downloadRecordsAttachment({
    requestId: records.requestId,
    attachmentId: records.attachmentId,
    expectedSha256: records.sha256,
    expectedSize: records.sizeBytes,
  });
  assert.ok(Buffer.isBuffer(bytes), 'attachment must be a Buffer');
  assert.equal(bytes.length, records.sizeBytes);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), records.sha256);

  if (!article) return { records, document, archived: null };

  assert.equal(
    document.original_path,
    `townlight-comms-archive:${article.id}:${article.revision}:${records.sha256}`,
  );
  const archived = inspectArchive(bytes);
  assert.equal(archived.article.article_id, article.id);
  assert.equal(archived.article.revision, article.revision);
  assert.equal(archived.article.sha256, article.sha256);
  assert.equal(archived.article.title, article.title);
  assert.equal(archived.article.body, article.body);
  assert.deepEqual(archived.article.source_refs, [article.source_ref]);
  assert.equal(archived.article.source_snapshots.length, 1);
  assert.deepEqual(archived.article.source_snapshots[0].reference, article.source_ref);
  assert.deepEqual(archived.source_digests, [article.source_ref.sha256]);
  if (source) assert.deepEqual(source.content, archived.article.source_snapshots[0].content);
  assert.equal(archived.receipts.article_id, article.id);
  assert.equal(archived.receipts.revision, article.revision);
  assert.equal(archived.receipts.content_sha256, article.sha256);
  return { records, document, archived };
}