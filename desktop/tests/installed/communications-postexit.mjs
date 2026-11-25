import assert from 'node:assert/strict';
import {isDeepStrictEqual} from 'node:util';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readFile, readdir, writeFile} from 'node:fs/promises';
import {join, basename} from 'node:path';

const hash = value => createHash('sha256').update(value).digest('hex');
const python = process.env.TOWNLIGHT_TEST_PYTHON || 'python';
function runPython(script, bytes) {
  return JSON.parse(execFileSync(python, ['-c', script], {input: bytes, timeout: 10000, maxBuffer: 48 * 1024 * 1024}));
}
export function inspectArchive(bytes) {
  return runPython(`import io,json,sys,zipfile,hashlib
with zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read())) as outer:
 receipts=json.loads(outer.read('publication-receipts.json'))
 with zipfile.ZipFile(io.BytesIO(outer.read('published-content.zip'))) as inner:
  article=json.loads(inner.read('article.json'))
snapshots=article['source_snapshots']
digests=[hashlib.sha256(json.dumps(s['content'],sort_keys=True,separators=(',',':'),ensure_ascii=False,allow_nan=False).encode()).hexdigest() for s in snapshots]
print(json.dumps(dict(article=article,receipts=receipts,source_digests=digests)))`, bytes);
}
function delivered(row) {
  return row.state === 'published' && row.website_receipt?.status === 'delivered' &&
    row.email_summary?.sent > 0 && ['remaining','failed','uncertain'].every(key => row.email_summary[key] === 0);
}
export function assertPublished(article, pending) {
  assert.equal(article.id, pending.id, 'same article ID');
  assert.equal(article.current_revision, pending.revision, 'scheduled revision');
  assert.equal(article.revision.sha256, pending.sha256, 'content hash');
  assert.equal(article.revision.body, pending.body, 'final content');
  assert.deepEqual(article.revision.source_refs, [pending.source_ref], 'captured source reference');
  for (const previous of pending.prior_history) {
    assert.ok(article.history.some(row => row.id === previous.id && row.revision === previous.revision && row.action === previous.action && row.state === 'published'), 'prior publication retained');
  }
  const rows = article.history.filter(row => row.id === pending.publication_id);
  assert.equal(rows.length, 1, 'one exact scheduled publication');
  const row = rows[0];
  assert.equal(row.article_id, pending.id);
  assert.equal(row.revision, pending.revision);
  assert.equal(row.action, 'publish');
  assert.equal(Date.parse(row.due_at), Date.parse(pending.due_at));
  assert.deepEqual([...row.channels].sort(), ['email','website']);
  return row;
}
export function assertArchive(bytes, archive, pending, publication) {
  assert.equal(bytes.length, archive.size, 'Records byte size');
  assert.equal(hash(bytes), archive.sha256, 'Records byte digest');
  const extracted = inspectArchive(bytes);
  const {article, receipts} = extracted;
  assert.equal(article.article_id, pending.id);
  assert.equal(article.revision, pending.revision);
  assert.equal(article.sha256, pending.sha256);
  assert.equal(article.body, pending.body);
  assert.deepEqual(article.source_refs, [pending.source_ref]);
  assert.equal(article.source_snapshots.length, 1);
  assert.deepEqual(article.source_snapshots[0].reference, pending.source_ref);
  assert.equal(extracted.source_digests[0], pending.source_ref.sha256, 'source snapshot bytes');
  assert.equal(receipts.article_id, pending.id);
  assert.equal(receipts.revision, pending.revision);
  assert.equal(receipts.content_sha256, pending.sha256);
  assert.ok(receipts.publication_receipts.some(row => delivered(row) && row.action === 'publish' && Date.parse(row.due_at) === Date.parse(pending.due_at) && isDeepStrictEqual(row.email_summary, publication.email_summary) && isDeepStrictEqual(row.website_receipt, publication.website_receipt)), 'both delivered channel receipts retained');
  return extracted;
}
export function inspectMail(bytes) {
  return runPython(`import sys,json,email.policy
from email.parser import BytesParser
m=BytesParser(policy=email.policy.default).parsebytes(sys.stdin.buffer.read())
print(json.dumps([p.get_content() for p in m.walk() if p.get_content_type()=='text/plain']))`, bytes);
}
export function assertMail(record, decodedParts, pending, stopped, articleUrl) {
  assert.ok(Array.isArray(record.recipients) && record.recipients.length === 1, 'one exact synthetic envelope recipient');
  assert.equal(hash(record.recipients[0].trim().toLowerCase()), pending.recipient_sha256, 'confirmed recipient digest');
  assert.ok(Date.parse(record.received_at) >= Date.parse(pending.due_at), 'mail after scheduled time');
  assert.ok(Date.parse(record.received_at) >= Date.parse(stopped.at), 'mail after close');
  assert.ok(decodedParts.some(text => text.includes(pending.body) && text.includes(articleUrl)), 'decoded mail final body and article URL');
  assert.ok(record.headers?.['message-id']?.[0], 'actual SMTP Message-ID');
}
export async function verifyUnattended({output, portalBaseUrl, fixtureRoot, staffBaseUrl = `http://127.0.0.1:${process.env.TOWNLIGHT_LOCAL_PORT || '15480'}`, fetchImpl = fetch, timeoutMs = 120000}) {
  const pending = JSON.parse(await readFile(join(output, 'communications-unattended-pending.json'), 'utf8'));
  const stopped = JSON.parse(await readFile(join(output, 'communications-app-stopped.json'), 'utf8'));
  assert.equal(stopped.exited, true, 'owned staff app exited');
  assert.ok(Number.isInteger(stopped.pid) && stopped.pid > 0);
  assert.ok(Date.parse(stopped.at) < Date.parse(pending.due_at), 'app stopped before due time');
  assert.match(pending.recipient_sha256, /^[0-9a-f]{64}$/);
  const articleUrl = `${portalBaseUrl.replace(/\/+$/, '')}/communications/${encodeURIComponent(pending.id)}/`;
  const base = staffBaseUrl.replace(/\/+$/, '');
  let proof;
  let receipt;
  const request = async (path, body, method = body ? 'POST' : 'GET') => {
    const response = await fetchImpl(`${base}${path}`, {method, headers: {'Content-Type': 'application/json', ...(proof ? {'X-Townlight-Session': proof} : {})}, ...(body ? {body: JSON.stringify(body)} : {}), signal: AbortSignal.timeout(30000)});
    assert.equal(response.status, 200, `staff ${method} ${path}`);
    return response;
  };
  try {
    ({proof} = await (await request('/staff/v1/session', {email: 'audit-admin@example.invalid', passcode: 'Audit-fixture-2026-11-04!'})).json());
    assert.ok(typeof proof === 'string' && proof);
    const api = '/staff/v1/api/desktop/v1';
    const deadline = Date.now() + timeoutMs;
    let publication;
    while (true) {
      const article = await (await request(`${api}/communications/articles/${pending.id}`)).json();
      publication = assertPublished(article, pending);
      if (delivered(publication)) break;
      assert.ok(Date.now() < deadline, 'scheduled publication did not finish');
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    assert.equal(publication.website_receipt.url, articleUrl, 'website receipt same article URL');
    const publicRead = await fetchImpl(articleUrl, {signal: AbortSignal.timeout(15000)});
    assert.equal(publicRead.status, 200);
    const html = await publicRead.text();
    const escaped = value => value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#x27;');
    assert.ok(pending.body.split(/\n{2,}/).every(paragraph => html.includes(escaped(paragraph).replaceAll('\n', '<br>'))), 'public final body');
    const sourceUrl = `${articleUrl}sources/0/`;
    const sourceRead = await fetchImpl(sourceUrl, {signal: AbortSignal.timeout(15000)});
    assert.equal(sourceRead.status, 200, 'published captured source');
    const sourceHtml = await sourceRead.text();
    let capturedMail;
    while (!capturedMail) {
      for (const name of await readdir(join(fixtureRoot, 'mail'))) {
        if (!name.endsWith('.json')) continue;
        const record = JSON.parse(await readFile(join(fixtureRoot, 'mail', name), 'utf8'));
        if (typeof record.eml !== 'string' || basename(record.eml) !== record.eml) continue;
        const parts = inspectMail(await readFile(join(fixtureRoot, 'mail', record.eml)));
        if (!parts.some(text => text.includes(pending.body))) continue;
        assertMail(record, parts, pending, stopped, articleUrl);
        capturedMail = {file: name, recipient_sha256: pending.recipient_sha256, received_at: record.received_at, message_id: record.headers['message-id'][0], meaning: 'SMTP acceptance only'};
        break;
      }
      if (capturedMail) break;
      assert.ok(Date.now() < deadline, 'no exact final SMTP capture');
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    // Re-read both earlier archives after staff exit, preserving their byte evidence.
    const checkDocument = async archive => {
      const viewed = await (await request(`${api}/requests/${archive.requestId}/view`)).json();
      const document = viewed.documents.find(row => (row.attachment_id || row.id) === archive.attachmentId);
      assert.ok(document, 'actual Records document');
      assert.equal(document.sha256, archive.sha256);
      assert.equal(Number(document.size_bytes), archive.sizeBytes);
      assert.equal(document.original_path, `townlight-comms-archive:${pending.id}:${archive.revision}:${archive.sha256}`);
      const bytes = Buffer.from(await (await request(`${api}/requests/${archive.requestId}/documents/${archive.attachmentId}/content`)).arrayBuffer());
      assert.equal(bytes.length, archive.sizeBytes);
      assert.equal(hash(bytes), archive.sha256);
      return bytes;
    };
    for (const archive of Object.values(pending.archives)) await checkDocument(archive);
    const archive = await (await request(`${api}/communications/articles/${pending.id}/records`, {expected_revision: pending.revision, expected_sha256: pending.sha256, confirm: true})).json();
    const finalArchive = {requestId: archive.records_request_id, attachmentId: archive.attachment_id, sha256: archive.sha256, sizeBytes: archive.size, revision: pending.revision};
    const bytes = await checkDocument(finalArchive);
    const extracted = assertArchive(bytes, archive, pending, publication);
    // Django displays captured source content as escaped plain text.
    const content = extracted.article.source_snapshots[0].content;
    const display = typeof content === 'string' ? content : pythonDisplay(content);
    assert.ok(sourceHtml.includes(escaped(display)), 'public source matches archived snapshot content');
    receipt = {passed: true, synthetic: true, id: pending.id, revision: pending.revision, content_sha256: pending.sha256, source_ref: pending.source_ref, publication_id: pending.publication_id, stopped, publish: {url: articleUrl, source_url: sourceUrl}, captured_mail: capturedMail, records: finalArchive, prior_archives: pending.archives, checked_at: new Date().toISOString()};
  } finally {
    if (proof) await request('/staff/v1/session', undefined, 'DELETE');
  }
  await writeFile(join(output, 'communications-unattended.json'), `${JSON.stringify(receipt, null, 2)}\n`);
  return receipt;
}
function pythonDisplay(content) {
  return runPython('import json,sys; print(json.dumps(str(json.load(sys.stdin))))', Buffer.from(JSON.stringify(content)));
}
