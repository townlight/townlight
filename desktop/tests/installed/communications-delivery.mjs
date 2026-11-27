import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { basename, join } from "node:path";
import { inspectArchive, inspectMail, mailContainsFinalContent, assertMail } from "./communications-postexit.mjs";

const SHA256 = /^[0-9a-f]{64}$/;
const POLL_MS = 1_000;
const TIMEOUT_MS = 60_000;
const RECORDS_LIST_ATTACHMENTS = "list-attachments";
const RECORDS_DOWNLOAD_ATTACHMENT = "download-attachment";

function unwrap(response) {
  return response && typeof response === "object" && "result" in response
    ? response.result
    : response;
}

async function callCommunication(native, request) {
  return unwrap(await native("communications_request", { request }));
}

async function callRecords(native, operation, payload = {}) {
  return unwrap(await native("records_request", { request: { operation, ...payload } }));
}

async function readArticle(native, id) {
  const result = await callCommunication(native, { operation: "article", id });
  return result && typeof result === "object" && result.article ? result.article : result;
}

function historyPublications(article) {
  return article && Array.isArray(article.history) ? article.history : [];
}

function publicationMatches(publication, expected) {
  if (!publication || publication.action !== expected.action) return false;
  if (Number(publication.revision) !== Number(expected.revision)) return false;
  if (!Array.isArray(publication.channels) || !publication.channels.includes(expected.channel)) return false;
  if (publication.state !== expected.state) return false;
  return true;
}

function currentMinuteLocal() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

async function waitForPublication(native, id, expected, label, timeoutMs = TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  let last = [];
  while (Date.now() < deadline) {
    const article = await readArticle(native, id);
    last = historyPublications(article);
    const publication = last.find((entry) => publicationMatches(entry, expected));
    if (publication) return { article, publication, publications: last };
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
  throw new Error(`unresolved: ${label}; last publications ${JSON.stringify(last)}`);
}

async function waitForRevision(native, id, previousRevision, label) {
  const deadline = Date.now() + TIMEOUT_MS;
  let article;
  while (Date.now() < deadline) {
    article = await readArticle(native, id);
    const revision = Number(article && article.current_revision);
    if (Number.isInteger(revision) && revision > previousRevision) {
      const sha256 = article && article.revision && article.revision.sha256;
      assert.match(String(sha256), SHA256, `${label} revision sha256`);
      return { article, revision, sha256 };
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
  throw new Error(`unresolved: ${label}; actual article ${JSON.stringify(article)}`);
}

function publicationUrl(publication, portalBaseUrl, articleId) {
  const receipt = publication && publication.website_receipt;
  const stored = receipt && typeof receipt === "object" ? receipt.url : undefined;
  if (typeof stored === "string" && stored.trim()) {
    return new URL(stored, portalBaseUrl).toString();
  }
  const base = portalBaseUrl.endsWith("/") ? portalBaseUrl : `${portalBaseUrl}/`;
  return new URL(encodeURIComponent(articleId), base).toString();
}

export async function readPublic(page, url, publicPage) {
  if (publicPage) {
    assert.notEqual(publicPage, page, 'public browser must be separate from staff WebView');
    const response = await publicPage.goto(url, { waitUntil: 'domcontentloaded' });
    assert.ok(response, 'public browser navigation must return a response');
    return { url, status: response.status(), text: await response.text() };
  }
  const response = await page.request.get(url);
  return { url, status: response.status(), text: await response.text() };
}

async function waitForRemoval(page, url, body, label) {
  const deadline = Date.now() + TIMEOUT_MS;
  let last;
  while (Date.now() < deadline) {
    last = await readPublic(page, url);
    if (last.status === 404 || last.status === 410 || !last.text.includes(body)) return last;
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
  throw new Error(`unresolved: ${label}; last public read ${JSON.stringify(last)}`);
}

async function waitForStatus(page, text) {
  await page.waitForFunction(
    (expected) => document.querySelector("[data-status]")?.textContent === expected,
    text,
    { timeout: TIMEOUT_MS },
  );
}

async function schedule(page, { channels, action, dueAt }) {
  const local = dueAt ? await page.evaluate(value => {
    const date = new Date(value);
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  }, dueAt) : currentMinuteLocal();
  await page.fill('form[data-schedule] [name="due_at"]', local);
  if (channels.includes("website")) await page.check('form[data-schedule] [name="website"]');
  else await page.uncheck('form[data-schedule] [name="website"]');
  if (channels.includes("email")) await page.check('form[data-schedule] [name="email"]');
  else await page.uncheck('form[data-schedule] [name="email"]');
  await page.selectOption('form[data-schedule] [name="action"]', action);
  await page.check('form[data-schedule] [name="confirm"]');
  await page.click('form[data-schedule] button[type="submit"]');
}

async function verifyRecordsArchive(native, requestId, displayedHash, downloadRecordsAttachment, expected) {
  if (typeof downloadRecordsAttachment !== "function") {
    throw new Error("downloadRecordsAttachment callback is required");
  }
  assert.ok(expected && typeof expected === "object", "expected archive identity is required");
  assert.ok(typeof expected.articleId === "string" && expected.articleId, "expected archive article id");
  assert.ok(Number.isInteger(expected.revision) && expected.revision > 0, "expected archive revision");
  assert.match(String(expected.contentSha256), SHA256, "expected archive content sha256");

  const viewed = unwrap(await native("records_domain_request", { request: { operation: "view", request_id: requestId } }));
  const documents = viewed && Array.isArray(viewed.documents) ? viewed.documents : [];
  assert.ok(documents.length > 0, "records view must return at least one document");

  const normalizedDisplayed = String(displayedHash).toLowerCase();
  assert.match(normalizedDisplayed, SHA256, "records displayed archive sha256");
  const document = documents.find(item => item && String(item.sha256 ?? "").toLowerCase() === normalizedDisplayed && (item.attachment_id || item.id));
  assert.ok(document, "records archive document matching displayed hash");

  const attachmentId = document.attachment_id || document.id;
  assert.ok(attachmentId, "records archive attachment id");
  const expectedSha256 = String(document.sha256 ?? "").toLowerCase();
  assert.match(expectedSha256, SHA256, "records archive attachment sha256");
  assert.equal(expectedSha256, normalizedDisplayed, "records archive attachment hash matches displayed hash");
  assert.equal(document.original_path, `townlight-comms-archive:${expected.articleId}:${expected.revision}:${expectedSha256}`, "records archive original_path");
  assert.equal(document.citation, `Townlight communications article ${expected.articleId}; revision ${expected.revision}; archive sha256 ${expectedSha256}.`, "records archive citation");
  const expectedSize = Number(document.size_bytes);
  assert.ok(Number.isSafeInteger(expectedSize) && expectedSize > 0, "records archive attachment size");

  const actualBuffer = await downloadRecordsAttachment({
    requestId,
    attachmentId: String(attachmentId),
    expectedSha256,
    expectedSize,
  });
  assert.ok(Buffer.isBuffer(actualBuffer), "downloadRecordsAttachment must return a Buffer");
  assert.equal(actualBuffer.length, expectedSize, "records archive attachment size");

  const digest = createHash("sha256").update(actualBuffer).digest("hex");
  assert.equal(digest, expectedSha256, "records archive attachment downloaded hash");
  return {
    requestId,
    attachmentId: String(attachmentId),
    sha256: expectedSha256,
    sizeBytes: actualBuffer.length,
    articleId: expected.articleId,
    revision: expected.revision,
    contentSha256: expected.contentSha256,
  };
}

export async function installedCommunicationsDelivery({
  page,
  native,
  save,
  article,
  portalBaseUrl,
  subscriberEmail,
  captureMessage,
  downloadRecordsAttachment,
} = {}) {
  assert.ok(page && native, "page and native are required");
  assert.ok(typeof portalBaseUrl === "string" && portalBaseUrl, "portalBaseUrl is required");
  assert.ok(article && typeof article === "object", "article is required");
  assert.ok(typeof article.id === "string" && article.id, "article id is required");
  assert.ok(Number.isInteger(article.revision) && article.revision > 0, "article revision is required");
  assert.match(String(article.sha256), SHA256, "article sha256 is required");
  assert.ok(typeof article.body === "string" && article.body.length > 0, "article body is required");

  await page.locator("[data-comms-view]").waitFor({ state: "visible" });

  const initial = await readArticle(native, article.id);
  assert.equal(Number(initial.current_revision), article.revision, "initial actual revision");
  assert.equal(initial.revision && initial.revision.sha256, article.sha256, "initial actual sha256");

  const archiveCurrent = async (revision, contentSha256) => {
    const actualArticle = await readArticle(native, article.id);
    assert.equal(actualArticle && actualArticle.id, article.id, "actual archive article id");
    assert.equal(Number(actualArticle && actualArticle.current_revision), Number(revision), "actual archive revision");
    assert.equal(actualArticle && actualArticle.revision && actualArticle.revision.sha256, contentSha256, "actual archive content sha256");

    await page.click("[data-archive-records]");
    await waitForStatus(page, "Records request created");
    await page.waitForFunction(
      () => Boolean(document.querySelector("[data-records] [data-records-request-id]")?.dataset.recordsRequestId),
      undefined,
      { timeout: TIMEOUT_MS },
    );
    const recordsRequestId = await page
      .locator("[data-records] [data-records-request-id]")
      .getAttribute("data-records-request-id");
    assert.ok(recordsRequestId, "actual UI records request id");
    const recordsInfo = await page.locator("[data-records] p").first().textContent();
    const displayedHash = /Hash:\s*([0-9a-f]{64})/i.exec(recordsInfo ?? "")?.[1];
    return verifyRecordsArchive(native, recordsRequestId, displayedHash, downloadRecordsAttachment, {
      articleId: article.id,
      revision,
      contentSha256,
    });
  };

  const channels = subscriberEmail ? ["website", "email"] : ["website"];
  await schedule(page, { channels, action: "publish" });

  const published = await waitForPublication(native, article.id, {
    action: "publish",
    revision: article.revision,
    channel: "website",
    state: "published",
  }, "initial website publication");

  const publicUrl = publicationUrl(published.publication, portalBaseUrl, article.id);
  const publicRead = await readPublic(page, publicUrl);
  assert.equal(publicRead.status, 200, `public article ${publicUrl}`);
  assert.ok(publicRead.text.includes(article.body), "public article body");

  let emailEvidence = null;
  if (subscriberEmail) {
    const email = await waitForPublication(native, article.id, {
      action: "publish",
      revision: article.revision,
      channel: "email",
      state: "published",
    }, "required email publication");
    const summary = email.publication.email_summary;
    assert.ok(summary && typeof summary === "object", "required email summary is missing");
    assert.ok(Number(summary.sent) > 0, "required email capture is missing: no sent messages");
    emailEvidence = { summary };
    if (typeof captureMessage === "function") await captureMessage(email.publication);
  }

  const originalArchive = await archiveCurrent(article.revision, article.sha256);
  const correctedBody = `${article.body} Corrected at ${new Date().toISOString()}.`;
  await page.fill('form[data-draft] [name="body"]', correctedBody);
  await page.check('form[data-draft] [name="access_reviewed"]');
  await page.click('form[data-draft] button[type="submit"]');
  await waitForStatus(page, "Article saved");

  const correction = await waitForRevision(native, article.id, article.revision, "corrected revision");
  assert.notEqual(correction.sha256, article.sha256, "correction must produce a new sha256");

  await page.fill('form[data-review] [name="note"]', "Installed delivery correction review.");
  await page.click('form[data-review] button[type="submit"]');
  await waitForStatus(page, "Article sent for review");

  await page.check("[data-approve-confirm]");
  await page.click("[data-approve]");
  await waitForStatus(page, "Revision approved");

  await schedule(page, { channels: ["website"], action: "correct" });
  const correctionDelivery = await waitForPublication(native, article.id, {
    action: "correct",
    revision: correction.revision,
    channel: "website",
    state: "published",
  }, "corrected website publication");

  const correctedUrl = publicationUrl(correctionDelivery.publication, portalBaseUrl, article.id);
  const correctedRead = await readPublic(page, correctedUrl);
  assert.equal(correctedRead.status, 200, `corrected public article ${correctedUrl}`);
  assert.ok(correctedRead.text.includes(correctedBody), "corrected public body");

  const oldPublicationRetained = correctionDelivery.publications.some((publication) =>
    publicationMatches(publication, {
      action: "publish",
      revision: article.revision,
      channel: "website",
      state: "published",
    })
  );
  assert.ok(oldPublicationRetained, "actual history must retain the old published revision");

  const archive = await archiveCurrent(correction.revision, correction.sha256);
  await schedule(page, { channels: ["website"], action: "withdraw" });
  const withdrawDelivery = await waitForPublication(native, article.id, {
    action: "withdraw",
    revision: correction.revision,
    channel: "website",
    state: "published",
  }, "website withdrawal");
  const removedRead = await waitForRemoval(page, correctedUrl, correctedBody, "website withdrawal removal");
  assert.notEqual(originalArchive.attachmentId, archive.attachmentId, "archive attachments must differ");

  const evidence = {
    id: article.id,
    publication: {
      revision: article.revision,
      sha256: article.sha256,
      url: publicUrl,
      bodyVerified: true,
    },
    email: emailEvidence,
    correction: {
      revision: correction.revision,
      sha256: correction.sha256,
      url: correctedUrl,
      bodyVerified: true,
      oldPublicationRetained: true,
    },
    withdrawal: {
      revision: correction.revision,
      action: withdrawDelivery.publication.action,
      state: withdrawDelivery.publication.state,
      publicStatus: removedRead.status,
      removed: true,
    },
    records: archive,
    originalRecords: originalArchive,
  };

  if (typeof save === "function") await save("communications-delivery", evidence);
  return evidence;
}

/** Deliver one already-approved version; never edits source text or withdraws. */
export async function deliverApprovedCommunicationVersion({
  page, native, save, article, portalBaseUrl, action = 'publish', subscriberEmail,
  fixtureRoot, captureMessage, downloadRecordsAttachment, privateNotes = [],
  expectedPublicUrl, afterSchedule, timeoutMs = 180_000, publicPage,
} = {}) {
  assert.ok(['publish', 'correct'].includes(action));
  assert.ok(article?.id && article.source_ref, 'exact approved article and source reference required');
  assert.match(article.sha256, SHA256);
  assert.equal(typeof downloadRecordsAttachment, 'function');
  const initial = await readArticle(native, article.id);
  assert.equal(initial.id, article.id);
  assert.equal(initial.current_revision, article.revision);
  assert.equal(initial.revision.sha256, article.sha256);
  assert.equal(initial.revision.body, article.body);
  assert.deepEqual(initial.revision.source_refs, [article.source_ref]);
  assert.equal(initial.state, 'approved');
  const selected = page.locator('[data-comms-view]');
  await selected.waitFor({ state: 'visible' });
  if (await selected.getAttribute('data-current-id') !== article.id) {
    await selected.locator('[data-refresh]').click();
    await selected.locator(`[data-article-id="${article.id}"]`).click();
    await page.waitForFunction(id => document.querySelector('[data-comms-view]')?.dataset.currentId === id, article.id);
  }
  const channels = subscriberEmail ? ['website', 'email'] : ['website'];
  if (subscriberEmail) {
    assert.equal(typeof captureMessage, 'function', 'controlled SMTP capture required');
    assert.ok(fixtureRoot, 'mail fixture root required');
  }
  // A whole future minute leaves time for the caller to stop the desktop before due.
  const dueAt = new Date(afterSchedule ? Math.ceil((Date.now() + 30_000) / 60_000) * 60_000 :
    Math.floor(Date.now() / 60_000) * 60_000).toISOString();
  await schedule(page, { channels, action, dueAt });
  await waitForStatus(page, 'Article scheduled');
  // Retry exactly the same request, preserving due time, channels, actor, and revision.
  await page.locator('[data-comms-view] [data-refresh]').click();
  await waitForStatus(page, 'Articles reloaded');
  await schedule(page, { channels, action, dueAt });
  await waitForStatus(page, 'Article scheduled');
  const scheduled = await readArticle(native, article.id);
  const rows = historyPublications(scheduled).filter(row => row.article_id === article.id &&
    row.revision === article.revision && row.action === action &&
    (!dueAt || Date.parse(row.due_at) === Date.parse(dueAt)) &&
    JSON.stringify([...row.channels].sort()) === JSON.stringify([...channels].sort()));
  assert.equal(rows.length, 1, 'one exact scheduled publication');
  const pending = { ...article, action, due_at: rows[0].due_at, publication_id: rows[0].id,
    prior_history: historyPublications(initial).filter(row => row.state === 'published')
      .map(row => ({ id: row.id, revision: row.revision, action: row.action })), archives: {},
    recipient_sha256: subscriberEmail ? createHash('sha256').update(subscriberEmail.trim().toLowerCase()).digest('hex') : null };
  if (save) await save(`ule-${article.source_ref.kind}-${action}-pending`, pending);
  let stopped = null;
  if (afterSchedule) {
    const resumed = await afterSchedule(pending);
    assert.equal(resumed?.stopped?.exited, true, 'caller must return the verified desktop stop receipt');
    stopped = resumed.stopped;
    assert.ok(Number.isInteger(stopped.pid) && stopped.pid > 0);
    assert.ok(Date.parse(stopped.at) < Date.parse(pending.due_at), 'desktop must stop before due');
    page = resumed.page ?? page;
    native = resumed.native ?? native;
  }
  const delivered = await waitForPublication(native, article.id, {
    action, revision: article.revision, channel: 'website', state: 'published',
  }, `${action} exact approved version`, timeoutMs);
  const publication = delivered.publication;
  assert.equal(publication.id, pending.publication_id);
  assert.equal(publication.website_receipt?.status, 'delivered');
  const url = publicationUrl(publication, portalBaseUrl, article.id);
  assert.equal(new URL(url).pathname, `/communications/${article.id}/`);
  if (expectedPublicUrl) assert.equal(url, expectedPublicUrl, 'correction must keep the original URL');
  const publicRead = await readPublic(page, url, publicPage);
  assert.equal(publicRead.status, 200);
  const escaped = text => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#x27;');
  for (const paragraph of article.body.split(/\n{2,}/)) {
    assert.ok(publicRead.text.includes(escaped(paragraph).replaceAll('\n', '<br>')), 'public approved body');
  }
  if (action === 'correct') {
    const label = await page.evaluate(html => new DOMParser().parseFromString(html, 'text/html')
      .querySelector('.corrected-publication')?.textContent?.trim(), publicRead.text);
    assert.equal(label, 'Corrected', 'semantic public correction label required');
  }
  const sourceResponse = await readPublic(page, `${url}sources/0/`, publicPage);
  assert.equal(sourceResponse.status, 200);
  let mail = null;
  if (subscriberEmail) {
    assert.ok(publication.email_summary?.sent > 0);
    for (const key of ['remaining', 'failed', 'uncertain']) assert.equal(publication.email_summary[key], 0);
    const record = await captureMessage(publication, pending);
    assert.ok(record && typeof record.eml === 'string' && record.eml === basename(record.eml), 'actual captured EML basename required');
    const raw = await readFile(join(fixtureRoot, 'mail', record.eml));
    const parts = inspectMail(raw);
    assert.ok(mailContainsFinalContent(parts, pending, url), 'decoded SMTP body and stable article URL');
    assert.deepEqual(record.recipients.map(value => value.trim().toLowerCase()), [subscriberEmail.trim().toLowerCase()]);
    assert.ok(record.headers?.['message-id']?.[0]);
    assert.ok(Date.parse(record.received_at) >= Date.parse(pending.due_at));
    if (stopped) assertMail(record, parts, pending, stopped, url);
    // Count the exact recipient/body/URL correlation, preserving unrelated fixture mail.
    let matching = 0;
    for (const name of await readdir(join(fixtureRoot, 'mail'))) {
      if (!name.endsWith('.json')) continue;
      const item = JSON.parse(await readFile(join(fixtureRoot, 'mail', name), 'utf8'));
      if (!Array.isArray(item.recipients) || !item.recipients.some(value => value.trim().toLowerCase() === subscriberEmail.trim().toLowerCase())) continue;
      if (typeof item.eml !== 'string' || basename(item.eml) !== item.eml) continue;
      if (mailContainsFinalContent(inspectMail(await readFile(join(fixtureRoot, 'mail', item.eml))), pending, url)) matching += 1;
    }
    assert.equal(matching, 1, 'one exact correlated SMTP message');
    for (const note of privateNotes.filter(Boolean)) assert.ok(parts.every(text => !text.includes(note)), 'private notes in mail');
    mail = { eml: record.eml, messageId: record.headers['message-id'][0], receivedAt: record.received_at,
      recipientSha256: pending.recipient_sha256, matchingMessages: matching, meaning: 'SMTP acceptance only' };
  }
  // The caller may have reopened the app; select this same article before archiving.
  const comms = page.locator('[data-comms-view]');
  await comms.waitFor({ state: 'visible' });
  if (await comms.getAttribute('data-current-id') !== article.id) {
    await comms.locator('[data-refresh]').click();
    await comms.locator(`[data-article-id="${article.id}"]`).click();
    await page.waitForFunction(id => document.querySelector('[data-comms-view]')?.dataset.currentId === id, article.id);
  }
  await page.click('[data-archive-records]');
  await waitForStatus(page, 'Records request created');
  const requestId = await page.locator('[data-records] [data-records-request-id]').getAttribute('data-records-request-id');
  assert.ok(requestId);
  const info = await page.locator('[data-records] p').first().textContent();
  const displayedHash = /Hash:\s*([0-9a-f]{64})/i.exec(info ?? '')?.[1];
  let bytes;
  const records = await verifyRecordsArchive(native, requestId, displayedHash, async request => {
    bytes = await downloadRecordsAttachment(request);
    return bytes;
  }, { articleId: article.id, revision: article.revision, contentSha256: article.sha256 });
  const extracted = inspectArchive(bytes);
  assert.equal(extracted.article.article_id, article.id);
  assert.equal(extracted.article.revision, article.revision);
  assert.equal(extracted.article.sha256, article.sha256);
  assert.equal(extracted.article.title, article.title);
  assert.equal(extracted.article.body, article.body);
  assert.deepEqual(extracted.article.source_refs, [article.source_ref]);
  assert.equal(extracted.article.source_snapshots.length, 1);
  assert.deepEqual(extracted.article.source_snapshots[0].reference, article.source_ref);
  assert.deepEqual(extracted.source_digests, [article.source_ref.sha256]);
  assert.equal(extracted.receipts.article_id, article.id);
  assert.equal(extracted.receipts.revision, article.revision);
  assert.equal(extracted.receipts.content_sha256, article.sha256);
  assert.ok(extracted.receipts.publication_receipts.some(row => row.action === action &&
    row.state === 'published' && Date.parse(row.due_at) === Date.parse(pending.due_at) &&
    row.website_receipt?.url === url), 'actual delivered receipt in archive');
  const publishedSource = await page.evaluate(html => {
    const text = new DOMParser().parseFromString(html, 'text/html').querySelector('.source-content')?.textContent;
    if (!text) throw new Error('published captured source content missing');
    return JSON.parse(text);
  }, sourceResponse.text);
  assert.deepEqual(publishedSource, extracted.article.source_snapshots[0].content);
  // Retry archive creation through the same UI and prove the same durable attachment.
  await comms.locator('[data-refresh]').click();
  await waitForStatus(page, 'Articles reloaded');
  await page.click('[data-archive-records]');
  await waitForStatus(page, 'Records request created');
  const retryRequestId = await page.locator('[data-records] [data-records-request-id]').getAttribute('data-records-request-id');
  const retryInfo = await page.locator('[data-records] p').first().textContent();
  assert.equal(retryRequestId, records.requestId, 'archive retry must reuse its Records request');
  assert.equal(/Hash:\s*([0-9a-f]{64})/i.exec(retryInfo ?? '')?.[1], records.sha256);
  const recordView = unwrap(await native('records_domain_request', {
    request: { operation: 'view', request_id: records.requestId },
  }));
  const exactDocuments = (recordView.documents ?? []).filter(document =>
    document.original_path === `townlight-comms-archive:${article.id}:${article.revision}:${records.sha256}`);
  assert.equal(exactDocuments.length, 1, 'archive retry must not create a duplicate document');
  assert.equal(String(exactDocuments[0].attachment_id ?? exactDocuments[0].id), records.attachmentId);
  for (const note of privateNotes.filter(Boolean)) {
    assert.ok(!publicRead.text.includes(note) && !publicRead.text.includes(escaped(note)), 'private notes in public page');
    assert.ok(!sourceResponse.text.includes(note) && !sourceResponse.text.includes(escaped(note)), 'private notes in captured public source');
    assert.ok(!JSON.stringify(extracted).includes(note), 'private notes in Records archive');
  }
  const result = { article, action, publication, url, records, mail, stopped, retrySchedule: true, retryArchive: true,
    sourceSnapshot: extracted.article.source_snapshots[0], publicationId: pending.publication_id };
  if (save) await save(`ule-${article.source_ref.kind}-${action}-delivered`, result);
  return { ...result, page, native };
}
