import { test, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import http from 'node:http';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve, sep } from 'node:path';
import { deliverApprovedCommunicationVersion } from '../installed/communications-delivery.mjs';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const escape = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#x27;');

// These fixtures qualify the acceptance helper's checks, not an installed publisher.
for (const mode of ['publish', 'correct', 'missing-label', 'wrong-record', 'duplicate-mail', 'public-page']) {
  test(`single-version delivery helper ${mode}`, async ({ page }) => {
    const action = ['correct', 'missing-label'].includes(mode) ? 'correct' : 'publish';
    const id = '22222222-2222-4222-8222-222222222222';
    const content = { title: 'Fictional checklist', revision: action === 'correct' ? 2 : 1,
      id: '11111111-1111-4111-8111-111111111111', source_version: action === 'correct' ? '2' : '1' };
    const sourceSha = digest(JSON.stringify(content, Object.keys(content).sort()));
    const ref = { kind: 'elections', id: content.id, revision: sourceSha, sha256: sourceSha,
      title: content.title, url: `/desktop/v1/elections/items/${content.id}/source`, eligible: true };
    const article = { id, revision: content.revision, sha256: 'a'.repeat(64), title: content.title,
      body: `Corrected is a word in this body.\nSource version: ${content.source_version}`,
      sourceId: content.id, sourceRevision: content.revision, source_ref: ref };
    const fixtureRoot = await mkdtemp(join(tmpdir(), 'ule-version-'));
    await mkdir(join(fixtureRoot, 'mail'));
    let archiveBytes, recordDocument, archiveCalls = 0, publicPage;
    const publicNavigations = [];
    const server = http.createServer((request, response) => {
      response.setHeader('Content-Type', 'text/html');
      if (request.url === `/communications/${id}/sources/0/`) {
        response.end(`<pre class="source-content">${escape(JSON.stringify(content))}</pre>`);
      } else if (request.url === `/communications/${id}/`) {
        const label = mode === 'correct' ? '<p class="corrected-publication">Corrected</p>' : '';
        response.end(`${label}<div class="article-body"><p>${escape(article.body).replaceAll('\n', '<br>')}</p></div>`);
      } else { response.statusCode = 404; response.end(); }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const portalBaseUrl = `http://127.0.0.1:${server.address().port}`;
    const recipient = 'synthetic@example.invalid';
    const mail = { eml: 'message.eml', recipients: [recipient], received_at: new Date().toISOString(),
      headers: { 'message-id': ['<fixture@example.invalid>'] } };
    await writeFile(join(fixtureRoot, 'mail', mail.eml), `To: ${recipient}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${article.body}\r\n${portalBaseUrl}/communications/${id}/\r\n`);
    await writeFile(join(fixtureRoot, 'mail', 'message.json'), JSON.stringify(mail));
    if (mode === 'duplicate-mail') await writeFile(join(fixtureRoot, 'mail', 'duplicate.json'), JSON.stringify(mail));
    try {
      await page.route('**/version-helper-fixture', route => route.fulfill({
        contentType: 'text/html', body: '<!doctype html><body></body>',
      }));
      await page.goto('/version-helper-fixture');
      await page.exposeFunction('fixtureArchive', current => {
        archiveCalls += 1;
        const payload = { article_id: id, revision: article.revision, sha256: article.sha256,
          title: article.title, body: article.body, source_refs: [ref],
          source_snapshots: [{ reference: ref, content }] };
        const receipts = { article_id: id, revision: article.revision, content_sha256: article.sha256,
          publication_receipts: current.history.map(row => ({ ...row })) };
        const script = 'import sys,json,io,zipfile\np=json.load(sys.stdin)\ni=io.BytesIO()\nwith zipfile.ZipFile(i,"w") as z:z.writestr(zipfile.ZipInfo("article.json",(1980,1,1,0,0,0)),json.dumps(p["article"]))\no=io.BytesIO()\nwith zipfile.ZipFile(o,"w") as z:\n z.writestr(zipfile.ZipInfo("published-content.zip",(1980,1,1,0,0,0)),i.getvalue())\n z.writestr(zipfile.ZipInfo("publication-receipts.json",(1980,1,1,0,0,0)),json.dumps(p["receipts"]))\nsys.stdout.buffer.write(o.getvalue())';
        archiveBytes = execFileSync(process.env.TOWNLIGHT_TEST_PYTHON || 'python', ['-c', script], {
          input: JSON.stringify({ article: payload, receipts }),
        });
        const hash = digest(archiveBytes);
        const revision = mode === 'wrong-record' ? article.revision + 1 : article.revision;
        recordDocument = { id: '33333333-3333-4333-8333-333333333333', sha256: hash,
          size_bytes: archiveBytes.length, original_path: `townlight-comms-archive:${id}:${revision}:${hash}`,
          citation: `Townlight communications article ${id}; revision ${revision}; archive sha256 ${hash}.` };
        return { records_request_id: 'fictional-records-request', sha256: hash, tracking: 'fixture' };
      });
      await page.evaluate(async ({ article, portalBaseUrl }) => {
        const { createCommunicationsView } = await import('/src/communications/view.ts');
        window.versionArticle = { id: article.id, current_revision: article.revision, state: 'approved', kind: 'announcement',
          revision: { title: article.title, body: article.body, language: 'en', sha256: article.sha256,
            source_refs: [article.source_ref], attachment_refs: [], access_review: { reviewed: true } }, history: [] };
        window.versionNative = async (_command, { request }) => {
          const current = window.versionArticle;
          if (request.operation === 'articles') return { result: [structuredClone(current)] };
          if (request.operation === 'article') return { result: structuredClone(current) };
          if (request.operation === 'schedule') {
            if (!current.history.length) current.history.push({ id: 'fixture-publication', article_id: current.id,
              revision: current.current_revision, action: request.payload.action, due_at: request.payload.due_at,
              channels: request.payload.channels, state: 'published',
              website_receipt: { status: 'delivered', url: `${portalBaseUrl}/communications/${current.id}/` },
              email_summary: { sent: 1, remaining: 0, failed: 0, uncertain: 0 } });
            current.state = 'published';
            return { result: structuredClone(current) };
          }
          if (request.operation === 'archive-records') return { result: await window.fixtureArchive(current) };
          throw new Error(request.operation);
        };
        const view = createCommunicationsView(window.versionNative);
        document.body.innerHTML = view.render();
        view.bind(document);
      }, { article, portalBaseUrl });
      const native = (command, envelope) => command === 'records_domain_request'
        ? { result: { documents: [recordDocument] } }
        : page.evaluate(({ command, envelope }) => window.versionNative(command, envelope), { command, envelope });
      const staffUrl = page.url();
      let staffPage = page;
      if (mode === 'public-page') {
        publicPage = await page.context().newPage();
        const navigate = publicPage.goto.bind(publicPage);
        publicPage.goto = async (url, options) => {
          publicNavigations.push(url);
          return navigate(url, options);
        };
        staffPage = new Proxy(page, { get(target, key) {
          if (key === 'request' || key === 'goto') throw new Error('staff navigation/controller fetch forbidden');
          const value = Reflect.get(target, key, target);
          return typeof value === 'function' ? value.bind(target) : value;
        } });
      }
      const operation = deliverApprovedCommunicationVersion({ page: staffPage, publicPage, native, article, portalBaseUrl, action,
        subscriberEmail: recipient, fixtureRoot, captureMessage: async () => mail,
        downloadRecordsAttachment: async request => {
          expect(request.expectedSha256).toBe(digest(archiveBytes));
          return archiveBytes;
        }, privateNotes: ['DISTINCT-PRIVATE-NOTE'],
        expectedPublicUrl: action === 'correct' ? `${portalBaseUrl}/communications/${id}/` : undefined });
      if (mode === 'missing-label') await expect(operation).rejects.toThrow('semantic public correction label required');
      else if (mode === 'wrong-record') await expect(operation).rejects.toThrow('records archive original_path');
      else if (mode === 'duplicate-mail') await expect(operation).rejects.toThrow('one exact correlated SMTP message');
      else {
        const result = await operation;
        expect(result.url).toBe(`${portalBaseUrl}/communications/${id}/`);
        expect(result.article.revision).toBe(article.revision);
        expect(result.records.sha256).toBe(digest(archiveBytes));
        expect(result.mail.matchingMessages).toBe(1);
        expect(archiveCalls).toBe(2);
        expect(await page.evaluate(() => window.versionArticle.history.length)).toBe(1);
        if (mode === 'public-page') {
          expect(publicNavigations).toEqual([`${portalBaseUrl}/communications/${id}/`, `${portalBaseUrl}/communications/${id}/sources/0/`]);
          expect(page.url()).toBe(staffUrl);
          expect(publicPage.url()).toBe(publicNavigations[1]);
        }
      }
    } finally {
      if (publicPage) await publicPage.close();
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
      assert.ok(resolve(fixtureRoot).startsWith(resolve(tmpdir()) + sep));
      assert.ok(basename(fixtureRoot).startsWith('ule-version-'));
      await rm(fixtureRoot, { recursive: true, force: true });
    }
  });
}
