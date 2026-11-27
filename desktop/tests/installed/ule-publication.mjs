import assert from 'node:assert/strict';

const SHA = /^[0-9a-f]{64}$/;
const FIELDS = {
  library: ['title', 'starts_at', 'location', 'description'],
  elections: ['title', 'jurisdiction', 'election', 'official_source', 'source_version', 'description'],
};

function kindFields(kind) {
  assert.ok(Object.hasOwn(FIELDS, kind), 'kind must be library or elections');
  return FIELDS[kind];
}
async function call(native, command, request) {
  assert.equal(typeof native, 'function', 'trusted native read callback required');
  const result = await native(command, { request });
  assert.notEqual(result?.ok, false, 'native read failed');
  return result?.result ?? result;
}
async function sourceRead(native, kind, id, revision) {
  kindFields(kind);
  const source = await call(native, `${kind}_request`, {
    operation: 'get', id, ...(revision ? { revision } : {}),
  });
  assert.equal(source.id, id);
  assert.match(source.sha256, SHA);
  if (revision) assert.equal(source.revision, revision);
  return source;
}
async function sourceRoot(page, kind) {
  kindFields(kind);
  const root = page.locator(`[data-townlight-${kind}]`);
  await root.waitFor({ state: 'visible' });
  return root;
}
async function waitSourceForm(page, kind, id, revision) {
  await page.waitForFunction(({ kind, id, revision }) => {
    const form = document.querySelector(`[data-${kind}-form]`);
    return form?.dataset.currentId === id && (!revision || Number(form.dataset.currentRevision) === revision);
  }, { kind, id, revision });
}
async function statusIs(page, kind, text) {
  await page.waitForFunction(({ kind, text }) =>
    document.querySelector(`[data-${kind}-status]`)?.textContent === text, { kind, text });
}
async function openSource(page, kind, id, revision) {
  const root = await sourceRoot(page, kind);
  await root.locator(`[data-${kind}-refresh]`).click();
  await page.waitForFunction(kind => {
    const text = document.querySelector(`[data-${kind}-status]`)?.textContent;
    return text === '' || text === 'No records';
  }, kind);
  await root.locator(`[data-${kind}-list]`).selectOption(id);
  await waitSourceForm(page, kind, id);
  if (revision) {
    await root.locator(`[data-${kind}-history]`).selectOption(String(revision));
    await waitSourceForm(page, kind, id, revision);
  }
  return root;
}
function noPrivate(text, source) {
  if (source.private_notes) assert.ok(!text.includes(source.private_notes), 'private notes leaked');
  assert.ok(!Object.hasOwn(source.content, 'private_notes'), 'private content in public source');
}
function publicText(kind, content) {
  return kind === 'elections'
    ? `Jurisdiction: ${content.jurisdiction}\nElection: ${content.election}\n\n${content.description}\n\nOfficial source: ${content.official_source}\nSource version: ${content.source_version}`
    : [content.title, content.starts_at, content.location, '', content.description].join('\n');
}
async function readArticle(native, id) {
  const result = await call(native, 'communications_request', { operation: 'article', id });
  return result?.article ?? result;
}
function articleDescriptor(article, source, reference) {
  assert.ok(Number.isInteger(article.current_revision) && article.current_revision > 0);
  assert.match(article.revision.sha256, SHA);
  assert.deepEqual(article.revision.source_refs, [reference]);
  return { id: article.id, revision: article.current_revision, sha256: article.revision.sha256,
    title: article.revision.title, body: article.revision.body, sourceId: source.id,
    sourceRevision: source.revision, source_ref: reference };
}

/** Caller owns login and module navigation; native is used for authenticated reads only. */
export async function savePublicationSource(page, { native, kind, id, fields, privateNotes }) {
  const names = kindFields(kind);
  assert.equal(typeof privateNotes, 'string');
  const previous = id ? await sourceRead(native, kind, id) : null;
  const root = id ? await openSource(page, kind, id, previous.revision) : await sourceRoot(page, kind);
  if (!id) await root.locator(`[data-${kind}-new]`).click();
  const form = root.locator(`[data-${kind}-form]`);
  for (const name of names) {
    assert.equal(typeof fields[name], 'string', `fixture ${name} required`);
    let value = fields[name];
    if (kind === 'library' && name === 'starts_at') {
      assert.ok(Number.isFinite(Date.parse(value)), 'fixture starts_at must be an ISO timestamp');
      value = await page.evaluate(value => {
        const date = new Date(value);
        return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
      }, value);
    }
    await form.locator(`[name="${name}"]`).fill(value);
  }
  await form.locator('[name="private_notes"]').fill(privateNotes);
  await form.locator('button[type="submit"]').click();
  await page.waitForFunction(({ kind, previous }) => {
    const form = document.querySelector(`[data-${kind}-form]`);
    return Boolean(form?.dataset.currentId) && Number(form.dataset.currentRevision) > previous;
  }, { kind, previous: previous?.revision ?? 0 });
  await statusIs(page, kind, 'Saved');
  const savedId = await form.getAttribute('data-current-id');
  assert.ok(savedId);
  if (id) assert.equal(savedId, id);
  const saved = await sourceRead(native, kind, savedId);
  assert.equal(saved.revision, (previous?.revision ?? 0) + 1);
  assert.equal(saved.private_notes, privateNotes);
  assert.equal(saved.approval, null, 'a new revision must invalidate source approval');
  for (const name of names) {
    if (name === 'starts_at') assert.equal(Date.parse(saved.content[name]), Date.parse(fields[name]));
    else assert.equal(saved.content[name], fields[name]);
  }
  const preview = await root.locator(`[data-${kind}-public-preview]`).innerText();
  assert.ok(preview.includes(fields.title), 'public preview must contain the saved source');
  noPrivate(preview, saved);
  return saved;
}

export async function approvePublicationSource(page, { native, kind, id }) {
  const before = await sourceRead(native, kind, id);
  const root = await openSource(page, kind, id, before.revision);
  await root.locator(`[data-${kind}-confirm]`).check();
  await root.locator(`[data-${kind}-approve]`).click();
  await statusIs(page, kind, 'Approved');
  const approved = await sourceRead(native, kind, id);
  assert.equal(approved.revision, before.revision);
  assert.equal(approved.sha256, before.sha256);
  assert.equal(approved.approval?.revision, approved.revision);
  assert.equal(approved.approval?.sha256, approved.sha256);
  assert.ok(approved.approval.actor_id);
  if (kind === 'elections') assert.notEqual(approved.approval.actor_id, approved.author.actor_id);
  return approved;
}

/** Saves and requests review; approval remains an explicit caller-controlled action. */
export async function handoffPublicationSource(page, { native, kind, id, expectedArticleId }) {
  const source = await sourceRead(native, kind, id);
  assert.equal(source.approval?.sha256, source.sha256, 'source must be approved');
  if (kind === 'elections' && source.revision > 1) assert.ok(expectedArticleId, 'correction target required');
  const resolved = await call(native, 'communications_request', {
    operation: 'source', payload: { kind, id },
  });
  const reference = resolved.reference;
  assert.deepEqual(reference, { kind, id, revision: source.sha256, sha256: source.sha256,
    title: source.content.title, url: `/desktop/v1/${kind}/items/${id}/source`, eligible: true });
  assert.deepEqual(resolved.content, source.content);
  const root = await openSource(page, kind, id, source.revision);
  await root.locator(`[data-${kind}-comms]`).click();
  const comms = page.locator('[data-comms-view]');
  await comms.waitFor({ state: 'visible' });
  await page.waitForFunction(() => document.querySelector('[data-status]')?.textContent ===
    'Prepared unsaved draft from verified source; review required before saving.');
  if (expectedArticleId) assert.equal(await comms.getAttribute('data-current-id'), expectedArticleId);
  const form = comms.locator('form[data-draft]');
  const title = await form.locator('[name="title"]').inputValue();
  const body = await form.locator('[name="body"]').inputValue();
  assert.equal(title, source.content.title);
  assert.equal(body, publicText(kind, source.content));
  noPrivate(body, source);
  await form.locator('[name="access_reviewed"]').check();
  await form.locator('button[type="submit"]').click();
  await page.waitForFunction(() => document.querySelector('[data-status]')?.textContent === 'Article saved');
  const articleId = await comms.getAttribute('data-current-id');
  assert.ok(articleId);
  if (expectedArticleId) assert.equal(articleId, expectedArticleId);
  let article = await readArticle(native, articleId);
  assert.equal(article.revision.title, title);
  assert.equal(article.revision.body, body);
  const descriptor = articleDescriptor(article, source, reference);
  await comms.locator('form[data-review] [name="note"]').fill('Synthetic installed publication acceptance review.');
  await comms.locator('form[data-review] button[type="submit"]').click();
  await page.waitForFunction(() => document.querySelector('[data-status]')?.textContent === 'Article sent for review');
  article = await readArticle(native, articleId);
  assert.equal(article.state, 'review');
  assert.equal(article.current_revision, descriptor.revision);
  return descriptor;
}

export async function approvePublicationCommunication(page, { native, article }) {
  const comms = page.locator('[data-comms-view]');
  await comms.waitFor({ state: 'visible' });
  if (await comms.getAttribute('data-current-id') !== article.id) {
    await comms.locator('[data-refresh]').click();
    await comms.locator(`[data-article-id="${article.id}"]`).click();
    await page.waitForFunction(id => document.querySelector('[data-comms-view]')?.dataset.currentId === id, article.id);
  }
  assert.equal(await comms.getAttribute('data-current-id'), article.id);
  const before = await readArticle(native, article.id);
  assert.equal(before.current_revision, article.revision);
  assert.equal(before.revision.sha256, article.sha256);
  await comms.locator('[data-approve-confirm]').check();
  await comms.locator('[data-approve]').click();
  await page.waitForFunction(() => document.querySelector('[data-status]')?.textContent === 'Revision approved');
  const approved = await readArticle(native, article.id);
  assert.equal(approved.state, 'approved');
  assert.equal(approved.current_revision, article.revision);
  assert.equal(approved.revision.sha256, article.sha256);
  return article;
}

export async function linkPublicationReceipt(page, {
  native, kind, id, sourceRevision, articleId, articleRevision, requireArchive = true,
}) {
  const root = await openSource(page, kind, id, sourceRevision);
  const form = root.locator(`[data-${kind}-receipts]`);
  await form.locator('[name="article_id"]').fill(articleId);
  await form.locator('[name="article_revision"]').fill(String(articleRevision));
  await form.locator('button[type="submit"]').click();
  await statusIs(page, kind, 'Linked');
  const source = await sourceRead(native, kind, id, sourceRevision);
  const matches = source.links.filter(link => link.article_id === articleId && link.article_revision === articleRevision);
  assert.equal(matches.length, 1, 'exactly one durable source/article link');
  const link = matches[0];
  assert.equal(link.source_revision, sourceRevision);
  const receipt = link.records_receipt;
  if (requireArchive) assert.ok(receipt, 'actual Records receipt required');
  if (receipt) {
    assert.equal(receipt.article_id, articleId);
    assert.equal(receipt.revision, articleRevision);
    assert.match(receipt.archive_sha256, SHA);
    assert.ok(receipt.records_id && receipt.file_id, 'actual Records identities required');
  }
  assert.deepEqual(JSON.parse(await root.locator(`[data-${kind}-links]`).innerText()), source.links);
  return { source, link };
}

export async function readPublicationHistory(page, { native, kind, id, revision, privateNotes }) {
  assert.ok(Number.isInteger(revision) && revision > 0);
  const latest = await sourceRead(native, kind, id);
  const root = await openSource(page, kind, id, revision);
  const source = await sourceRead(native, kind, id, revision);
  if (privateNotes !== undefined) {
    assert.equal(source.private_notes, privateNotes);
    assert.equal(await root.locator(`[data-${kind}-form] [name="private_notes"]`).inputValue(), privateNotes);
  }
  if (revision < latest.revision) {
    for (const selector of [`[data-${kind}-form] button[type="submit"]`, `[data-${kind}-approve]`, `[data-${kind}-comms]`]) {
      assert.equal(await root.locator(selector).isDisabled(), true, 'historical source must be readonly');
    }
  }
  assert.deepEqual(JSON.parse(await root.locator(`[data-${kind}-links]`).innerText()), source.links);
  return source;
}
