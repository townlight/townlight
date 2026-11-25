import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

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
  const history = article && Array.isArray(article.history) ? article.history : [];
  const publications = [];
  for (const entry of history) {
    if (entry && Array.isArray(entry.publications)) publications.push(...entry.publications);
  }
  return publications;
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

async function waitForPublication(native, id, expected, label) {
  const deadline = Date.now() + TIMEOUT_MS;
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

async function readPublic(page, url) {
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

async function schedule(page, { channels, action }) {
  await page.fill('form[data-schedule] [name="due_at"]', currentMinuteLocal());
  if (channels.includes("website")) await page.check('form[data-schedule] [name="website"]');
  else await page.uncheck('form[data-schedule] [name="website"]');
  if (channels.includes("email")) await page.check('form[data-schedule] [name="email"]');
  else await page.uncheck('form[data-schedule] [name="email"]');
  await page.selectOption('form[data-schedule] [name="action"]', action);
  await page.check('form[data-schedule] [name="confirm"]');
  await page.click('form[data-schedule] button[type="submit"]');
}

async function verifyRecordsArchive(native, requestId, displayedHash, downloadRecordsAttachment) {
  if (typeof downloadRecordsAttachment !== "function") {
    throw new Error("downloadRecordsAttachment callback is required");
  }

  const viewed = unwrap(await native("records_domain_request", { request: { operation: "view", request_id: requestId } }));
  const documents = viewed && Array.isArray(viewed.documents) ? viewed.documents : [];
  assert.ok(documents.length > 0, "records view must return at least one document");

  const normalizedDisplayed = displayedHash ? String(displayedHash).toLowerCase() : null;
  const document = normalizedDisplayed
    ? documents.find(item => item && String(item.sha256 ?? "").toLowerCase() === normalizedDisplayed && (item.attachment_id || item.id))
    : documents.find(item => item && (item.attachment_id || item.id));
  assert.ok(document, "records archive document matching displayed hash");

  const attachmentId = document.attachment_id || document.id;
  assert.ok(attachmentId, "records archive attachment id");
  const expectedSha256 = String(document.sha256 ?? "").toLowerCase();
  assert.match(expectedSha256, SHA256, "records archive attachment sha256");
  if (normalizedDisplayed) assert.equal(expectedSha256, normalizedDisplayed, "records archive attachment hash matches displayed hash");
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

  await schedule(page, { channels: ["website"], action: "withdraw" });
  const withdrawDelivery = await waitForPublication(native, article.id, {
    action: "withdraw",
    revision: correction.revision,
    channel: "website",
    state: "published",
  }, "website withdrawal");
  const removedRead = await waitForRemoval(page, correctedUrl, correctedBody, "website withdrawal removal");

  await page.click("[data-archive-records]");
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
  const archive = await verifyRecordsArchive(native, recordsRequestId, displayedHash, downloadRecordsAttachment);

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
  };

  if (typeof save === "function") await save("communications-delivery", evidence);
  return evidence;
}
