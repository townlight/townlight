import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

// Orchestration boundary only. Actual rendered source/Comms actions and delivery
// bytes are qualified separately by the two named Playwright helper fixtures.
async function fixture({ missingCandidate = false } = {}) {
  const calls = [], sources = new Map();
  let actor, selected, nextId = 0, articleRevision = 0, approved = false;
  const actors = Object.fromEntries(['administrator', 'clerk', 'official', 'communicationsApprover']
    .map(key => [key, { email: `${key}@example.invalid` }]));
  const clone = value => structuredClone(value);
  const sourceFor = (id, revision) => {
    const history = sources.get(id);
    return history[(revision ?? history.length) - 1];
  };
  const native = async (command, { request }) => {
    if (request.operation === 'settings') return { result: { revision: 1,
      candidates: missingCandidate ? [] : [{ id: 'host-official', email: actors.official.email }],
      elections_official_ids: ['host-official'] } };
    assert.equal(request.operation, 'get', 'scenario native callback remains read-only');
    return { result: clone(sourceFor(request.id, request.revision)) };
  };
  const locator = selector => ({
    async click() { calls.push(['click', actor, selector]); },
    async check() { calls.push(['check', actor, selector]); },
    async waitFor() {}, async isVisible() { return true; },
  });
  const page = { locator, async waitForFunction() {},
    request: { async get(url) {
      assert.equal(approved, false, 'unsigned v2 public read happens before official approval');
      calls.push(['pending-v1-read', url]);
      return { status: () => 200, text: async () => url.endsWith('sources/0/')
        ? JSON.stringify([...sources.values()].flat().find(source => source.id === 'elections-3' && source.revision === 1).content)
        : 'Published first checklist' };
    } }, async evaluate(fn, value) { return JSON.parse(value); } };
  const helpers = {
    async savePublicationSource(_, { kind, id, fields, privateNotes }) {
      assert.equal(actor, 'clerk');
      id ??= `${kind}-${++nextId}`;
      const history = sources.get(id) ?? [];
      const revision = history.length + 1;
      const source = { id, revision, content: fields, sha256: String(revision).repeat(64),
        private_notes: privateNotes, approval: null, links: [] };
      history.push(source); sources.set(id, history); selected = source;
      if (kind === 'elections' && revision === 2) approved = false;
      calls.push(['save', actor, kind, id, revision]);
      return clone(source);
    },
    async approvePublicationSource(_, { kind, id }) {
      assert.equal(actor, kind === 'library' ? 'administrator' : 'official');
      const source = sourceFor(id);
      source.approval = { actor_id: kind === 'library' ? 'host-admin' : 'host-official' };
      approved = true; calls.push(['approve', actor, id, source.revision]); return clone(source);
    },
    async handoffPublicationSource(_, { kind, id, expectedArticleId }) {
      assert.equal(actor, 'clerk');
      const source = sourceFor(id);
      assert.ok(source.approval);
      const article = { id: kind === 'library' ? 'library-article' : 'elections-article',
        revision: ++articleRevision, sha256: String(articleRevision).repeat(64), source_ref: { kind },
        sourceId: id, sourceRevision: source.revision };
      if (source.revision === 2) assert.equal(expectedArticleId, article.id);
      calls.push(['handoff', actor, article.id, source.revision]); return article;
    },
    async approvePublicationCommunication(_, { article }) {
      assert.equal(actor, 'communicationsApprover'); return article;
    },
    async linkPublicationReceipt(_, { id, sourceRevision, articleId, articleRevision, requireArchive = true }) {
      assert.equal(actor, 'clerk');
      const source = sourceFor(id, sourceRevision);
      const link = { source_revision: sourceRevision, article_id: articleId, article_revision: articleRevision };
      if (!source.links.length) source.links.push(link);
      calls.push(['link', id, sourceRevision, requireArchive]); return { source: clone(source), link };
    },
    async readPublicationHistory(_, { id, revision, privateNotes }) {
      selected = sourceFor(id, revision);
      if (privateNotes !== undefined) assert.equal(selected.private_notes, privateNotes);
      calls.push(['history', actor, id, revision]); return clone(selected);
    },
  };
  const delivery = { async readPublic(staffPage, url, publicPage) {
    const response = publicPage ? await publicPage.goto(url) : await staffPage.request.get(url);
    return { url, status: response.status(), text: await response.text() };
  }, async deliverApprovedCommunicationVersion(options) {
    assert.equal(actor, 'communicationsApprover');
    const article = options.article;
    const url = `https://portal.example.invalid/communications/${article.id}/`;
    if (options.afterSchedule) await options.afterSchedule({ id: article.id });
    if (options.action === 'correct') assert.equal(options.expectedPublicUrl, url);
    calls.push(['deliver', article.id, options.action ?? 'publish']);
    return { page, native, url, article, records: { sha256: article.sha256, attachmentId: `file-${article.revision}` } };
  } };
  const context = vm.createContext({ console });
  const source = await readFile(new URL('./ule-publication-scenarios.mjs', import.meta.url), 'utf8');
  const module = new vm.SourceTextModule(source, { context });
  await module.link(async specifier => {
    const values = specifier === 'node:assert/strict' ? { default: assert }
      : specifier === './ule-publication.mjs' ? helpers : delivery;
    const imported = new vm.SyntheticModule(Object.keys(values), function () {
      for (const [key, value] of Object.entries(values)) this.setExport(key, value);
    }, { context });
    return imported;
  });
  await module.evaluate();
  const fields = { title: 'Fictional checklist', jurisdiction: 'Fictional City', election: 'Fictional election',
    official_source: 'https://example.gov/fictional-v1', source_version: '1', description: 'First checklist' };
  const config = { page, native, actors,
    switchActor: async key => { actor = key; calls.push(['actor', key]); return { page, native }; },
    save: async (name, value) => { JSON.stringify(value); calls.push(['evidence', name]); },
    library: { fields: { title: 'Fictional program' }, privateNotes: 'PRIVATE LIBRARY' },
    elections: { v1: { fields, privateNotes: 'PRIVATE FIRST' }, v2: {
      fields: { ...fields, description: 'Corrected checklist', official_source: 'https://example.gov/fictional-v2',
        source_version: '2' }, privateNotes: 'PRIVATE SECOND' } },
    subscriberEmail: 'resident@example.invalid', portalBaseUrl: 'https://portal.example.invalid',
    afterLibrarySchedule: async () => { calls.push(['postexit']); },
  };
  return { run: module.namespace.installedUlePublications, config, calls };
}

test('Library post-exit and Elections separate-official same-article two-version sequence', async () => {
  const { run, config, calls } = await fixture();
  const result = await run(config);
  assert.equal(calls.filter(row => row[0] === 'postexit').length, 1);
  assert.deepEqual(calls.filter(row => row[0] === 'deliver').map(row => row.slice(1)), [
    ['library-article', 'publish'], ['elections-article', 'publish'], ['elections-article', 'correct'],
  ]);
  assert.equal(calls.filter(row => row[0] === 'pending-v1-read').length, 2);
  assert.equal(result.elections.v1.article.id, result.elections.v2.article.id);
  assert.equal(result.recoveryExpected.elections.length, 2);
  assert.equal(result.recoveryExpected.elections[0].privateNotes, 'PRIVATE FIRST');
  assert.notEqual(result.elections.v1.delivery.records.attachmentId, result.elections.v2.delivery.records.attachmentId);
  assert.ok(calls.some(row => row[0] === 'check' && row[1] === 'administrator' && row[2].includes('host-official')));
});

test('missing host official candidate stops before any Elections approval/publication', async () => {
  const { run, config, calls } = await fixture({ missingCandidate: true });
  await assert.rejects(run(config), /one active host-mapped official/);
  assert.equal(calls.filter(row => row[0] === 'deliver' && row[1] === 'elections-article').length, 0);
});
