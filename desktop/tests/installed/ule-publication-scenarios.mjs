import assert from 'node:assert/strict';
import {
  savePublicationSource, approvePublicationSource, handoffPublicationSource,
  approvePublicationCommunication, linkPublicationReceipt, readPublicationHistory,
} from './ule-publication.mjs';
import { deliverApprovedCommunicationVersion, readPublic } from './communications-delivery.mjs';

/** Caller owns fixtures, identity provisioning, process lifetime, and restart/backup. */
export async function installedUlePublications({
  page, residentPage, publicPage = residentPage, native, save, fixtureRoot, portalBaseUrl, actors, switchActor,
  library, elections, subscriberEmail, captureMessage, downloadRecordsAttachment,
  afterLibrarySchedule,
}) {
  assert.equal(typeof switchActor, 'function');
  assert.equal(typeof afterLibrarySchedule, 'function', 'Library requires observed post-exit delivery');
  assert.ok(subscriberEmail && library?.fields && elections?.v1 && elections?.v2);
  for (const key of ['administrator', 'clerk', 'official', 'communicationsApprover']) {
    assert.ok(actors?.[key]?.email, `explicit ${key} actor required`);
  }
  assert.notEqual(actors.clerk.email.toLowerCase(), actors.official.email.toLowerCase());
  assert.notEqual(actors.administrator.email.toLowerCase(), actors.official.email.toLowerCase());
  assert.notEqual(elections.v1.privateNotes, elections.v2.privateNotes);
  const read = async (kind, id, revision) => {
    const value = await native(`${kind}_request`, { request: {
      operation: 'get', id, ...(revision ? { revision } : {}),
    } });
    assert.notEqual(value?.ok, false);
    return value?.result ?? value;
  };
  const actor = async key => {
    const context = await switchActor(key);
    page = context?.page ?? page;
    native = context?.native ?? native;
  };
  const navigate = async kind => {
    await page.locator('[data-surface="Staff"]').click();
    await page.locator(`.sidebar [data-area="${kind}"]`).click();
    await page.locator(kind === 'communications' ? '[data-comms-view]' : `[data-townlight-${kind}]`)
      .waitFor({ state: 'visible' });
  };
  const history = async (kind, source, notes) => {
    await navigate(kind);
    return readPublicationHistory(page, { native, kind, id: source.id,
      revision: source.revision, privateNotes: notes });
  };
  const deniedApproval = async source => {
    await history('elections', source);
    await page.locator('[data-elections-confirm]').check();
    await page.locator('[data-elections-approve]').click();
    await page.waitForFunction(() => {
      const message = document.querySelector('[data-elections-status]')?.textContent;
      return Boolean(message && !['Approved', 'Loaded', 'Saved'].includes(message));
    });
    assert.equal((await read('elections', source.id)).approval, null, 'unauthorized/incomplete approval denied');
  };
  const comms = async (kind, source, expectedArticleId) => {
    await actor('clerk');
    await navigate(kind);
    const article = await handoffPublicationSource(page, { native, kind, id: source.id, expectedArticleId, save });
    await actor('communicationsApprover');
    await navigate('communications');
    return approvePublicationCommunication(page, { native, article });
  };
  const link = async (kind, source, article, requireArchive = true) => {
    await actor('clerk');
    await navigate(kind);
    return linkPublicationReceipt(page, { native, kind, id: source.id,
      sourceRevision: source.revision, articleId: article.id, articleRevision: article.revision, requireArchive });
  };
  const deliver = async (article, options) => {
    await actor('communicationsApprover');
    await navigate('communications');
    const result = await deliverApprovedCommunicationVersion({ page, native, save, article,
      portalBaseUrl, fixtureRoot, captureMessage, downloadRecordsAttachment, publicPage, ...options });
    page = result.page;
    native = result.native;
    const { page: ignoredPage, native: ignoredNative, ...evidence } = result;
    return evidence;
  };

  await actor('clerk');
  await navigate('library');
  let program = await savePublicationSource(page, { native, kind: 'library', ...library });
  await page.locator('[data-library-comms]').click();
  await page.waitForFunction(() => {
    const message = document.querySelector('[data-library-status]')?.textContent;
    return Boolean(message && message !== 'Saved');
  });
  assert.equal(await page.locator('[data-townlight-library]').isVisible(), true, 'unapproved source cannot hand off');
  assert.equal((await read('library', program.id)).approval, null);
  await actor('administrator');
  await navigate('library');
  program = await approvePublicationSource(page, { native, kind: 'library', id: program.id });
  const libraryArticle = await comms('library', program);
  await link('library', program, libraryArticle, false);
  const libraryDelivery = await deliver(libraryArticle, { subscriberEmail,
    privateNotes: [library.privateNotes], afterSchedule: afterLibrarySchedule });
  const libraryLink = await link('library', program, libraryArticle);
  await history('library', program, library.privateNotes);
  if (save) await save('ule-library-workflow', { source: program, delivery: libraryDelivery, link: libraryLink.link });

  // Designation uses host-issued candidates, never a browser-supplied principal or role.
  await actor('administrator');
  await navigate('elections');
  const settingsResult = await native('elections_request', { request: { operation: 'settings' } });
  const settings = settingsResult?.result ?? settingsResult;
  const officialCandidates = settings.candidates.filter(candidate =>
    candidate.email.toLowerCase() === actors.official.email.toLowerCase());
  assert.equal(officialCandidates.length, 1, 'one active host-mapped official candidate');
  const officialId = officialCandidates[0].id;
  await page.locator(`[data-elections-candidates] input[value="${officialId}"]`).check();
  await page.locator('[data-elections-save-settings]').click();
  await page.waitForFunction(() => document.querySelector('[data-elections-status]')?.textContent ===
    'Designated official settings saved');
  const designatedResult = await native('elections_request', { request: { operation: 'settings' } });
  assert.ok((designatedResult?.result ?? designatedResult).elections_official_ids.includes(officialId));

  // Keep the incomplete citation fixture separate: the real first publication remains source revision 1.
  await actor('clerk');
  await navigate('elections');
  const incomplete = await savePublicationSource(page, { native, kind: 'elections',
    fields: { ...elections.v1.fields, title: `${elections.v1.fields.title} — missing citation fixture`,
      official_source: '', source_version: '' }, privateNotes: `${elections.v1.privateNotes} missing-citation` });
  await actor('official');
  await deniedApproval(incomplete);
  await actor('clerk');
  await navigate('elections');
  let first = await savePublicationSource(page, { native, kind: 'elections', ...elections.v1 });
  assert.equal(first.revision, 1);
  await deniedApproval(first);
  await actor('official');
  await navigate('elections');
  first = await approvePublicationSource(page, { native, kind: 'elections', id: first.id });
  assert.equal(first.approval.actor_id, officialId);
  const firstArticle = await comms('elections', first);
  const firstDelivery = await deliver(firstArticle, { privateNotes: [elections.v1.privateNotes] });
  const firstLink = await link('elections', first, firstArticle);

  await navigate('elections');
  let second = await savePublicationSource(page, { native, kind: 'elections', id: first.id, ...elections.v2 });
  assert.equal(second.revision, 2);
  assert.notEqual(second.sha256, first.sha256);
  await deniedApproval(second);
  const oldPublic = await readPublic(page, firstDelivery.url, publicPage);
  assert.equal(oldPublic.status, 200);
  const publicBody = oldPublic.text;
  const sourceURL = `${firstDelivery.url}sources/0/`;
  const oldSource = await readPublic(page, sourceURL, publicPage);
  assert.equal(oldSource.status, 200);
  const captured = await page.evaluate(html => JSON.parse(new DOMParser().parseFromString(html, 'text/html')
    .querySelector('.source-content').textContent), oldSource.text);
  assert.deepEqual(captured, first.content, 'pending correction must preserve published v1 snapshot');
  for (const note of [elections.v1.privateNotes, elections.v2.privateNotes]) assert.ok(!publicBody.includes(note));
  await actor('official');
  await navigate('elections');
  second = await approvePublicationSource(page, { native, kind: 'elections', id: second.id });
  assert.equal(second.approval.actor_id, officialId);
  const secondArticle = await comms('elections', second, firstArticle.id);
  assert.equal(secondArticle.id, firstArticle.id);
  assert.ok(secondArticle.revision > firstArticle.revision);
  const secondDelivery = await deliver(secondArticle, { action: 'correct', expectedPublicUrl: firstDelivery.url,
    privateNotes: [elections.v1.privateNotes, elections.v2.privateNotes] });
  const secondLink = await link('elections', second, secondArticle);
  // Retry historical linking after correction; both immutable receipts must still read back.
  await link('elections', first, firstArticle);
  const historicalFirst = await history('elections', first, elections.v1.privateNotes);
  const historicalSecond = await history('elections', second, elections.v2.privateNotes);
  assert.equal(historicalFirst.sha256, first.sha256);
  assert.equal(historicalSecond.sha256, second.sha256);
  assert.notEqual(firstDelivery.records.sha256, secondDelivery.records.sha256);
  assert.notEqual(firstDelivery.records.attachmentId, secondDelivery.records.attachmentId);
  const result = {
    library: { source: program, article: libraryArticle, delivery: libraryDelivery, link: libraryLink.link },
    elections: { invalidCitation: incomplete.id, officialId,
      v1: { source: historicalFirst, article: firstArticle, delivery: firstDelivery, link: firstLink.link },
      v2: { source: historicalSecond, article: secondArticle, delivery: secondDelivery, link: secondLink.link } },
    recoveryExpected: { library: { id: program.id, revision: program.revision, sha256: program.sha256,
      privateNotes: library.privateNotes, article: libraryArticle, records: libraryDelivery.records },
    elections: [
      { id: first.id, revision: first.revision, sha256: first.sha256, privateNotes: elections.v1.privateNotes,
        article: firstArticle, records: firstDelivery.records },
      { id: second.id, revision: second.revision, sha256: second.sha256, privateNotes: elections.v2.privateNotes,
        article: secondArticle, records: secondDelivery.records },
    ] },
  };
  if (save) await save('ule-publication-scenarios', result);
  return { ...result, page, native };
}
