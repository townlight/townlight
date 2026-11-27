import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readUleUpgrade } from './ule-upgrade-seed.mjs';

test('ULE upgrade seed verifies exact readback and denies material corruption', async () => {
  const bytes = Buffer.from('synthetic311archive');
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const ids = {
    serviceRequestId: 'request1',
    communicationId: 'article1',
    records: { requestId: 'records1', attachmentId: 'file1', sha256, sizeBytes: bytes.length }
  };
  const service = { id: 'request1', internal_notes: 'PRIVATE311', revision: 2 };
  const communication = { id: 'article1', current_revision: 1, revision: { body: 'Synthetic approved text' } };
  const document = { attachment_id: 'file1', sha256, size_bytes: bytes.length };
  const native = (command, { request }) => {
    if (command === 'service_requests_request') {
      assert.deepEqual(request, { operation: 'request', id: 'request1' });
      return structuredClone(service);
    }
    if (command === 'communications_request') {
      assert.deepEqual(request, { operation: 'article', id: 'article1' });
      return structuredClone(communication);
    }
    if (command === 'records_domain_request') {
      assert.deepEqual(request, { operation: 'view', request_id: 'records1' });
      return structuredClone({ documents: [document] });
    }
    throw new Error(`unexpected native command: ${command}`);
  };
  const downloadRecordsAttachment = () => bytes;
  const expected = await readUleUpgrade({ native, ids, downloadRecordsAttachment });
  await readUleUpgrade({ native, ids, downloadRecordsAttachment, expected });
  service.internal_notes = 'lost';
  await assert.rejects(readUleUpgrade({ native, ids, downloadRecordsAttachment, expected }));
  service.internal_notes = 'PRIVATE311';
  communication.revision.body = 'lost';
  await assert.rejects(readUleUpgrade({ native, ids, downloadRecordsAttachment, expected }));
});