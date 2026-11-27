import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { savePublicationSource, approvePublicationSource, handoffPublicationSource,
  approvePublicationCommunication, linkPublicationReceipt, readPublicationHistory } from '../installed/ule-publication.mjs';

test('native error envelope survives actual evaluate serialization', async ({ page }) => {
  const source = await readFile(new URL('../installed/maintenance.mjs', import.meta.url), 'utf8');
  const start = source.indexOf('const native =');
  const end = source.indexOf('\nconst accepted =', start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  const snippet = source.slice(start, end);
  const native = new Function('page', snippet + ';return native;')(page);

  await page.evaluate(() => {
    window.__TAURI_INTERNALS__ ||= {};
    window.__TAURI_INTERNALS__.invoke = async () => {
      throw { code: 'service-unavailable', message: 'Synthetic unavailable', outcome_unknown: true, private_notes: 'DO-NOT-COPY' };
    };
  });

  let capturedError;
  try {
    await native('communications_request', {});
  } catch (error) {
    capturedError = error;
  }
  expect(capturedError).toBeTruthy();
  expect(capturedError.message).toBe('Synthetic unavailable');
  expect(capturedError.code).toBe('service-unavailable');
  expect(capturedError.outcome_unknown).toBe(true);
  expect(capturedError.private_notes).toBeUndefined();
});

test('Library handoff failure saves safe correlated diagnostics without retry', async ({ page }) => {
  const id = '11111111-1111-4111-8111-111111111111';
  const sha = 'a'.repeat(64);
  const source = { id, revision: 1, sha256: sha, content: { title: 'Fixture', starts_at: '2027-01-01T12:00:00Z', location: 'Room', description: 'Public', extra_private: 'SECRET' }, approval: { revision: 1, sha256: sha, actor_id: 'official', name: 'Official', approved_at: 'now', extra_private: 'SECRET' }, private_notes: 'SECRET', author: { secret: 'SECRET' } };
  const calls = [];
  const originalError = Object.assign(new Error('Synthetic unavailable'), { code: 'service-unavailable', outcome_unknown: true, private_notes: 'SECRET' });
  const native = async (command, { request }) => {
    calls.push([command, request.operation]);
    if (command === 'communications_request') throw originalError;
    if (command === 'library_request') return { result: source };
  };
  const saved = [];
  const save = async (name, payload) => { saved.push([name, payload]); };
  let caught;
  try { await handoffPublicationSource(page, { native, kind: 'library', id, save }); } catch (error) { caught = error; }
  expect(caught).toBe(originalError);
  expect(calls).toEqual([['library_request', 'get'], ['communications_request', 'source'], ['library_request', 'source']]);
  expect(saved).toHaveLength(1);
  const [name, payload] = saved[0];
  expect(name).toBe('ule-library-handoff-failure');
  expect(payload.lookup).toEqual({ command: 'communications_request', operation: 'source', payload: { kind: 'library', id } });
  expect(payload.lookup_error).toEqual({ code: 'service-unavailable', message: 'Synthetic unavailable', outcome_unknown: true });
  expect(payload.source_probe).toEqual({ id, revision: 1, sha256: sha, content: { title: 'Fixture', starts_at: '2027-01-01T12:00:00Z', location: 'Room', description: 'Public' }, approval: { revision: 1, sha256: sha, actor_id: 'official', name: 'Official', approved_at: 'now' } });
  const json = JSON.stringify(payload);
  expect(json).not.toContain('SECRET');
  expect(json).not.toContain('private_notes');
  expect(json).not.toContain('author');
  expect(json).not.toContain('extra_private');
});

// Helper contract check against actual rendered views. The in-memory transport is
// a fixture, not installed authorization, publication, or Records acceptance.
for (const kind of ['library', 'elections']) {
  test(`${kind} installed helpers drive actual source and Comms views`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/publication-helper-fixture', route => route.fulfill({
      contentType: 'text/html', body: '<!doctype html><body></body>',
    }));
    await page.goto('/publication-helper-fixture');
    await page.evaluate(async kind => {
      const module = await import(`/src/${kind}/view.ts`);
      const { createCommunicationsView } = await import('/src/communications/view.ts');
      const sourceId = '11111111-1111-4111-8111-111111111111';
      const articleId = '22222222-2222-4222-8222-222222222222';
      const history = [];
      let article = null;
      let comms;
      const copy = result => ({ result: structuredClone(result) });
      const current = () => history.at(-1);
      const ref = () => ({ kind, id: sourceId, revision: current().sha256,
        sha256: current().sha256, title: current().content.title,
        url: `/desktop/v1/${kind}/items/${sourceId}/source`, eligible: true });
      window.helperReads = [];
      window.native = async (command, { request }) => {
        if (command === `${kind}_request`) {
          const op = request.operation;
          if (op === 'list') return copy(history.length ? [current()] : []);
          if (op === 'get') return copy(history[(request.revision ?? history.length) - 1]);
          if (op === 'create' || op === 'edit') {
            const revision = history.length + 1;
            const content = { ...request.payload, id: sourceId, revision };
            delete content.expected_revision;
            delete content.private_notes;
            history.push({ id: sourceId, revision, sha256: String.fromCharCode(96 + revision).repeat(64),
              content, private_notes: request.payload.private_notes, approval: null,
              author: { actor_id: 'fictional-clerk' }, links: [] });
            return copy(current());
          }
          if (op === 'approve') {
            current().approval = { actor_id: 'fictional-separate-official', revision: current().revision,
              sha256: current().sha256 };
            return copy(current());
          }
          if (op === 'source') {
            if (!current().approval) throw new Error('unapproved source');
            return copy(current());
          }
          if (op === 'receipts') {
            const source = history[request.payload.source_revision - 1];
            const revision = request.payload.article_revision;
            if (!source.links.some(link => link.article_revision === revision)) {
              source.links.push({ source_revision: source.revision, article_id: articleId,
                article_revision: revision, records_receipt: { article_id: articleId, revision,
                  archive_sha256: String.fromCharCode(99 + revision).repeat(64),
                  records_id: `fictional-records-${revision}`, file_id: `fictional-file-${revision}` } });
            }
            return copy(source);
          }
          throw new Error(`unexpected source operation ${op}`);
        }
        if (command !== 'communications_request') throw new Error('unexpected command');
        const op = request.operation;
        if (op === 'articles') return copy(article ? [article] : []);
        if (op === 'article') return copy(article);
        if (op === 'source') return copy({ reference: ref(), content: current().content });
        if (op === 'create' || op === 'edit') {
          const revision = (article?.current_revision ?? 0) + 1;
          article = { id: articleId, current_revision: revision, state: 'draft', kind: 'announcement',
            revision: { ...request.payload, revision, sha256: String.fromCharCode(96 + revision).repeat(64),
              source_refs: [ref()], attachment_refs: [] }, history: [], events: [] };
          return copy(article);
        }
        if (op === 'review' || op === 'approve') {
          article.state = op === 'review' ? 'review' : 'approved';
          return copy(article);
        }
        throw new Error(`unexpected communications operation ${op}`);
      };
      const factory = kind === 'library' ? module.createLibraryView : module.createElectionsView;
      window.showSource = async () => {
        const view = factory(window.native, { isAdmin: kind === 'library', openCommunications: async seed => {
          comms = createCommunicationsView(window.native);
          document.body.innerHTML = comms.render();
          comms.bind(document);
          await comms.prepareSource(seed);
        } });
        document.body.innerHTML = view.render();
        await view.bind(document);
      };
      window.showComms = () => {
        comms = createCommunicationsView(window.native);
        document.body.innerHTML = comms.render();
        comms.bind(document);
      };
      await window.showSource();
    }, kind);
    const native = async (command, envelope) => {
      // The helper itself must never mutate through its trusted read callback.
      expect(['get', 'source', 'article']).toContain(envelope.request.operation);
      return page.evaluate(({ command, envelope }) => window.native(command, envelope), { command, envelope });
    };
    const fields = kind === 'library'
      ? { title: 'Fictional program', starts_at: '2026-12-01T10:00:00Z', location: 'Main Hall', description: 'Public program text' }
      : { title: 'Fictional checklist', jurisdiction: 'Example City', election: 'Fictional election',
        official_source: 'https://example.gov/checklist', source_version: '1', description: 'Public checklist text' };
    const privateNotes = 'DISTINCTIVE-PRIVATE-NOTE';
    const source = await savePublicationSource(page, { native, kind, fields, privateNotes });
    await approvePublicationSource(page, { native, kind, id: source.id });
    const first = await handoffPublicationSource(page, { native, kind, id: source.id });
    // Simulate a newly opened Comms view for a caller-controlled approval session.
    await page.evaluate(() => window.showComms());
    await approvePublicationCommunication(page, { native, article: first });
    await page.evaluate(() => window.showSource());
    const linked = await linkPublicationReceipt(page, { native, kind, id: source.id,
      sourceRevision: 1, articleId: first.id, articleRevision: first.revision });
    expect(linked.link.records_receipt.records_id).toBe('fictional-records-1');
    const retried = await linkPublicationReceipt(page, { native, kind, id: source.id,
      sourceRevision: 1, articleId: first.id, articleRevision: first.revision });
    expect(retried.source.links).toHaveLength(1);
    await readPublicationHistory(page, { native, kind, id: source.id, revision: 1, privateNotes });
    if (kind === 'elections') {
      const changed = { ...fields, source_version: '2', description: 'Corrected public checklist text' };
      await savePublicationSource(page, { native, kind, id: source.id, fields: changed, privateNotes });
      await expect(handoffPublicationSource(page, { native, kind, id: source.id, expectedArticleId: first.id }))
        .rejects.toThrow('source must be approved');
      await approvePublicationSource(page, { native, kind, id: source.id });
      const correction = await handoffPublicationSource(page, { native, kind, id: source.id, expectedArticleId: first.id });
      expect(correction.id).toBe(first.id);
      expect(correction.revision).toBe(2);
      expect(correction.sourceRevision).toBe(2);
      expect(correction.sha256).not.toBe(first.sha256);
      expect(correction.body).toContain('Source version: 2');
      await approvePublicationCommunication(page, { native, article: correction });
      await page.evaluate(() => window.showSource());
      const second = await linkPublicationReceipt(page, { native, kind, id: source.id,
        sourceRevision: 2, articleId: correction.id, articleRevision: 2 });
      const old = await readPublicationHistory(page, { native, kind, id: source.id, revision: 1, privateNotes });
      expect(old.content.source_version).toBe('1');
      expect(old.links[0].records_receipt.archive_sha256).not.toBe(second.link.records_receipt.archive_sha256);
    }
    expect(errors).toEqual([]);
  });
}
