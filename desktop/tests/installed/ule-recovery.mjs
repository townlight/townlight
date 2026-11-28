import assert from 'node:assert/strict';
import { readRecoverySource } from './ule-recovery-sources.mjs';

async function call(native, command, request) {
  const response = await native(command, { request });
  assert.notEqual(response?.ok, false, `${command} failed`);
  return response?.result ?? response;
}

/** Authenticated reads only; caller owns stopping, restarting, backup and restore. */
export async function captureUleRecovery({
  native, utilityRequestId, utilityRequestIds = [], publications, downloadRecordsAttachment, recordsPathsRedacted = false,
}) {
  assert.equal(typeof native, 'function');
  assert.equal(typeof downloadRecordsAttachment, 'function');
  assert.ok(publications?.library);
  assert.equal(publications.elections?.length, 2);
  const [first, second] = publications.elections;
  assert.equal(first.id, second.id);
  assert.equal(first.article.id, second.article.id);
  assert.ok(first.revision > 0 && second.revision > first.revision);
  assert.notEqual(first.sha256, second.sha256);
  assert.ok(second.article.revision > first.article.revision);
  assert.notEqual(first.article.sha256, second.article.sha256);
  assert.notEqual(first.records.sha256, second.records.sha256);
  assert.notEqual(first.records.attachmentId, second.records.attachmentId);
  const ids = [...new Set([...utilityRequestIds, ...(utilityRequestId ? [utilityRequestId] : [])])];
  assert.ok(ids.length && ids.every(id => typeof id === 'string' && id), 'utility request IDs required');
  const utilities = [];
  for (const id of ids) {
    const result = await call(native, 'utilities_request', { operation: 'open-request', request_id: id });
    assert.ok(result.workpaper, 'saved utility workpaper required');
    utilities.push(result);
  }
  const entries = [publications.library, first, second];
  const sources = [];
  for (let index = 0; index < entries.length; index += 1) {
    sources.push(await readRecoverySource({ native, kind: index === 0 ? 'library' : 'elections',
      entry: entries[index], downloadRecordsAttachment, recordsPathsRedacted }));
  }
  const communications = [];
  for (const id of new Set(entries.map(entry => entry.article.id))) {
    const result = await call(native, 'communications_request', { operation: 'article', id });
    const article = result.article ?? result;
    const latest = entries.filter(entry => entry.article.id === id)
      .reduce((previous, entry) => entry.article.revision > previous.revision ? entry.article : previous,
        entries.find(entry => entry.article.id === id).article);
    assert.equal(article.id, id);
    assert.equal(article.current_revision, latest.revision);
    for (const field of ['sha256', 'title', 'body']) assert.equal(article.revision[field], latest[field]);
    assert.deepEqual(article.revision.source_refs, [latest.source_ref]);
    communications.push(article);
  }
  const inputs = { utilityRequestIds: ids, publications, ...(recordsPathsRedacted ? { recordsPathsRedacted } : {}) };
  return { inputs, utilities, sources, communications };
}

export async function verifyUleRecovery({ native, expected, downloadRecordsAttachment, save, stage = 'readback' }) {
  const actual = await captureUleRecovery({ native, ...expected.inputs, downloadRecordsAttachment });
  assert.deepEqual(actual, expected, 'saved ULE cases, approvals, links and archive bytes changed');
  if (save) await save(`ule-${stage}-readback`, actual);
  return actual;
}
