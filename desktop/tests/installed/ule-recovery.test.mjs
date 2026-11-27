import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { captureUleRecovery, verifyUleRecovery } from './ule-recovery.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
function fixture() {
  const sources = new Map(), documents = new Map(), archives = new Map(), articles = new Map();
  function entry(kind, revision) {
    const id = `${kind}-source`;
    const content = { description: `Fictional ${kind} description ${revision}`, title: `Fictional ${kind}` };
    const sha256 = hash(JSON.stringify(content));
    const reference = { kind, id, revision: sha256, sha256, title: content.title,
      url: `/desktop/v1/${kind}/items/${id}/source`, eligible: true };
    const article = { id: `${kind}-article`, revision, sha256: hash(`article-${kind}-${revision}`),
      title: content.title, body: content.description, source_ref: reference };
    const archiveArticle = { article_id: article.id, revision, sha256: article.sha256,
      title: article.title, body: article.body, source_refs: [reference],
      source_snapshots: [{ reference, content }] };
    const receipts = { article_id: article.id, revision, content_sha256: article.sha256 };
    const bytes = execFileSync(process.env.TOWNLIGHT_TEST_PYTHON || 'python', ['-c',
      'import io,json,sys,zipfile\nx=json.load(sys.stdin)\ni=io.BytesIO()\nwith zipfile.ZipFile(i,"w") as z:z.writestr("article.json",json.dumps(x["article"]))\no=io.BytesIO()\nwith zipfile.ZipFile(o,"w") as z:\n z.writestr("publication-receipts.json",json.dumps(x["receipts"]))\n z.writestr("published-content.zip",i.getvalue())\nsys.stdout.buffer.write(o.getvalue())'],
    { input: JSON.stringify({ article: archiveArticle, receipts }) });
    const records = { requestId: `${kind}-records-${revision}`, attachmentId: `${kind}-file-${revision}`,
      sha256: hash(bytes), sizeBytes: bytes.length };
    documents.set(records.requestId, { attachment_id: records.attachmentId, sha256: records.sha256,
      size_bytes: records.sizeBytes,
      original_path: `townlight-comms-archive:${article.id}:${revision}:${records.sha256}` });
    archives.set(records.attachmentId, bytes);
    const privateNotes = `PRIVATE ${kind} ${revision}`;
    sources.set(`${id}:${revision}`, { id, revision, sha256, content, private_notes: privateNotes,
      author: { actor_id: 'clerk' }, approval: { actor_id: 'official', revision, sha256 }, links: [{
        source_revision: revision, article_id: article.id, article_revision: revision,
        records_receipt: { article_id: article.id, revision, archive_sha256: records.sha256,
          records_id: records.requestId, file_id: records.attachmentId },
      }] });
    articles.set(article.id, { id: article.id, current_revision: revision, state: 'published',
      revision: { sha256: article.sha256, title: article.title, body: article.body, source_refs: [reference] },
      history: Array.from({ length: revision }, (_, index) => ({ revision: index + 1, state: 'published' })) });
    return { id, revision, sha256, privateNotes, article, records };
  }
  const publications = { library: entry('library', 1), elections: [entry('elections', 1), entry('elections', 2)] };
  const workpapers = new Map(['primary', 'pending', 'ackloss'].map(id => [id, {
    request: { id, state: 'open' }, workpaper: { request_id: id, body: `Reply ${id}`,
      private_notes: `PRIVATE utility ${id}`, revision: 2, receipt_comment_id: `comment-${id}` },
  }]));
  const native = async (command, { request }) => {
    let result;
    if (command === 'utilities_request') {
      assert.equal(request.operation, 'open-request'); result = workpapers.get(request.request_id);
    } else if (command === 'library_request' || command === 'elections_request') {
      assert.equal(request.operation, 'get'); result = sources.get(`${request.id}:${request.revision}`);
    } else if (command === 'communications_request') {
      assert.equal(request.operation, 'article'); result = articles.get(request.id);
    } else {
      assert.equal(command, 'records_domain_request'); assert.equal(request.operation, 'view');
      result = { documents: [documents.get(request.request_id)] };
    }
    assert.ok(result);
    return { result: structuredClone(result) };
  };
  const config = { native, utilityRequestIds: ['primary', 'pending', 'ackloss'], publications,
    downloadRecordsAttachment: async ({ attachmentId }) => archives.get(attachmentId) };
  return { config, sources, workpapers, documents, archives, articles };
}

test('captures all three workpapers and separately verifies both immutable Elections archives and links', async () => {
  const { config } = fixture();
  const expected = await captureUleRecovery(config);
  assert.equal(expected.utilities.length, 3);
  assert.equal(expected.sources.length, 3);
  assert.equal(expected.communications.length, 2);
  const [first, second] = expected.sources.filter(value => value.kind === 'elections');
  assert.equal(first.source.revision, 1); assert.equal(second.source.revision, 2);
  assert.notEqual(first.records.records.attachmentId, second.records.records.attachmentId);
  const saved = [];
  await verifyUleRecovery({ ...config, expected, save: async name => saved.push(name), stage: 'restored' });
  assert.deepEqual(saved, ['ule-restored-readback']);
});

for (const defect of ['utility-private-note', 'source-private-note', 'historical-link', 'self-approval',
  'archive-bytes', 'records-revision', 'current-article']) {
  test(`recovery rejects ${defect}`, async () => {
    const fixtureData = fixture();
    const { config, sources, workpapers, documents, archives, articles } = fixtureData;
    const expected = await captureUleRecovery(config);
    const first = config.publications.elections[0];
    const source = sources.get(`${first.id}:1`);
    if (defect === 'utility-private-note') workpapers.get('ackloss').workpaper.private_notes = 'Lost note';
    if (defect === 'source-private-note') source.private_notes = 'Lost note';
    if (defect === 'historical-link') source.links[0].records_receipt.file_id = 'wrong-file';
    if (defect === 'self-approval') source.approval.actor_id = source.author.actor_id;
    if (defect === 'archive-bytes') archives.set(first.records.attachmentId, Buffer.alloc(first.records.sizeBytes));
    if (defect === 'records-revision') documents.get(first.records.requestId).original_path = 'townlight-comms-archive:wrong:2:wrong';
    if (defect === 'current-article') articles.get(first.article.id).revision.body = 'Unapproved changed checklist';
    await assert.rejects(verifyUleRecovery({ ...config, expected }));
  });
}
