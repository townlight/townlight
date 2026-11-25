import assert from "node:assert/strict";

const SHA256 = /^[0-9a-f]{64}$/;

function field(value, name) {
  return value && typeof value === "object" ? value[name] : undefined;
}

function unwrap(response) {
  return response && typeof response === "object" && "result" in response
    ? response.result
    : response;
}

async function nativeResult(native, request) {
  return unwrap(await native("communications_request", { request }));
}

function articleFrom(result) {
  return field(result, "article") ?? result;
}

function revisionInfo(article) {
  const revision = field(article, "current_revision");
  const sha256 = field(field(article, "revision"), "sha256");
  assert.ok(Number.isInteger(revision) && revision > 0, "current revision must be positive");
  assert.match(sha256, SHA256, "current revision sha256 must be present");
  return { revision, sha256 };
}

function sourceRefs(article) {
  const refs = field(field(article, "revision"), "source_refs");
  return Array.isArray(refs) ? refs : [];
}

function assertSourceRetained(article, meetingId) {
  assert.ok(
    sourceRefs(article).some(
      (source) => field(source, "kind") === "meetings" && field(source, "id") === meetingId,
    ),
    "meeting source must remain attached to the revision",
  );
}

function historyEntries(article) {
  const history = field(article, "history");
  if (Array.isArray(history)) {
    return history.flatMap((entry) =>
      Array.isArray(field(entry, "publications")) ? field(entry, "publications") : [entry],
    );
  }
  if (history && Array.isArray(field(history, "publications"))) {
    return field(history, "publications");
  }
  const publications = field(article, "publications");
  return Array.isArray(publications) ? publications : [];
}

async function readArticle(native, id) {
  return articleFrom(await nativeResult(native, { operation: "article", id }));
}

async function waitStatus(page, expected) {
  await page.waitForFunction(
    (text) => document.querySelector("[data-status]")?.textContent === text,
    expected,
  );
}

export async function createApprovedCommunication({ page, native, meetingId }) {
  assert.ok(page && native, "page and native are required");
  assert.ok(meetingId, "meetingId is required");

  const title = "Installed acceptance communication";
  const body = `Summary for public meeting ${meetingId}.`;

  await page.locator("[data-comms-view]").waitFor({ state: "visible" });

  const sourceResult = await nativeResult(native, {
    operation: "source",
    payload: { kind: "meetings", id: meetingId },
  });
  const reference = field(sourceResult, "reference") ?? sourceResult;
  assert.equal(field(reference, "eligible"), true, "meeting source must be eligible");
  assert.equal(field(reference, "id"), meetingId, "source lookup must identify the meeting");

  await page.click("[data-new]");
  await page.fill('form[data-draft] [name="title"]', title);
  await page.fill('form[data-draft] [name="body"]', body);
  await page.selectOption('form[data-draft] [name="kind"]', "meeting_summary");
  await page.fill('form[data-draft] [name="language"]', "en");
  await page.selectOption('form[data-draft] [name="source_kind"]', "meetings");
  await page.fill('form[data-draft] [name="source_id"]', meetingId);
  await page.click("[data-source-add]");
  await page.waitForFunction(
    (id) => document.querySelector("[data-sources]")?.textContent?.includes(`meetings/${id}`),
    meetingId,
  );
  await page.check('form[data-draft] [name="access_reviewed"]');
  await page.click('form[data-draft] button[type="submit"]');
  await waitStatus(page, "Article saved");

  await page.waitForFunction(() => {
    const root = document.querySelector("[data-comms-view]");
    return Boolean(root?.dataset.currentId);
  });
  const id = await page.locator("[data-comms-view]").getAttribute("data-current-id");
  assert.ok(id, "created article id must be available after save");

  let article = await readArticle(native, id);
  assertSourceRetained(article, meetingId);
  let { revision, sha256 } = revisionInfo(article);
  assert.equal(field(field(article, "revision"), "title"), title, "revision title must match");
  assert.equal(field(field(article, "revision"), "body"), body, "revision body must match");

  await page.fill('form[data-review] [name="note"]', "Reviewed by installed acceptance.");
  await page.click('form[data-review] button[type="submit"]');
  await waitStatus(page, "Article sent for review");

  await page.check("[data-approve-confirm]");
  await page.click("[data-approve]");
  await waitStatus(page, "Revision approved");

  article = await readArticle(native, id);
  assert.equal(field(article, "state"), "approved", "article must be approved");
  assert.deepEqual(revisionInfo(article), { revision, sha256 });
  assertSourceRetained(article, meetingId);

  const editedBody = `${body} Revised for new approval coverage.`;
  await page.fill('form[data-draft] [name="body"]', editedBody);
  await page.check('form[data-draft] [name="access_reviewed"]');
  await page.click('form[data-draft] button[type="submit"]');
  await waitStatus(page, "Article saved");

  article = await readArticle(native, id);
  const edited = revisionInfo(article);
  assert.ok(edited.revision > revision, "editing must create a new revision");
  assert.notEqual(edited.sha256, sha256, "edited revision must have a new hash");
  assertSourceRetained(article, meetingId);
  assert.equal(field(field(article, "revision"), "body"), editedBody, "edited body must persist");

  const historyBefore = historyEntries(article).length;
  let rejected = false;
  try {
    await nativeResult(native, {
      operation: "schedule",
      id,
      payload: {
        expected_revision: edited.revision,
        expected_sha256: edited.sha256,
        due_at: new Date(Date.now() + 86_400_000).toISOString(),
        channels: ["website"],
        action: "publish",
        confirm: true,
      },
    });
  } catch {
    rejected = true;
  }
  assert.equal(rejected, true, "scheduling an unapproved edited revision must reject");

  article = await readArticle(native, id);
  assert.notEqual(field(article, "state"), "scheduled", "rejected schedule must not schedule");
  assert.deepEqual(revisionInfo(article), edited, "rejected schedule must not change revision");
  assert.equal(
    historyEntries(article).length,
    historyBefore,
    "rejected schedule must not create publication history",
  );

  await page.check("[data-approve-confirm]");
  await page.click("[data-approve]");
  await waitStatus(page, "Revision approved");

  article = await readArticle(native, id);
  assert.equal(field(article, "state"), "approved", "edited revision must be approved");
  assert.deepEqual(revisionInfo(article), edited);
  assertSourceRetained(article, meetingId);

  const revisionData = field(article, "revision");
  return {
    id,
    revision: edited.revision,
    sha256: edited.sha256,
    title: field(revisionData, "title"),
    body: field(revisionData, "body"),
    sourceId: meetingId,
  };
}
