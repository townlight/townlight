import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";

function unwrapNative(value) {
  if (value == null) {
    throw new Error("Native command returned no result");
  }
  if (typeof value === "object" && value.ok === false) {
    const detail = value.error?.message ?? value.error ?? "Native command failed";
    throw new Error(String(detail));
  }
  if (typeof value === "object" && "result" in value) {
    return value.result;
  }
  if (typeof value === "object" && "data" in value) {
    return value.data;
  }
  return value;
}

async function communications(native, request) {
  const raw = await native("communications_request", { request });
  return unwrapNative(raw);
}

export async function prepareUnattended({ native, save, linkage }) {
  if (typeof native !== "function") {
    throw new Error("prepareUnattended requires native(command, {request})");
  }
  if (typeof save !== "function") {
    throw new Error("prepareUnattended requires save(key, value)");
  }

  assert.equal(typeof linkage?.articleId, "string");
  assert.equal(typeof linkage?.sourceId, "string");
  assert.match(linkage?.recipientSha256 ?? "", /^[0-9a-f]{64}$/);
  const id = linkage.articleId;
  const previous = await communications(native, { operation: "article", id });
  assert.equal(previous.id, id);
  assert.equal(previous.state, "withdrawn");
  assert.ok(Number.isInteger(previous.current_revision) && previous.current_revision > 0);
  assert.match(previous.revision.sha256, /^[0-9a-f]{64}$/);
  const refs = previous.revision.source_refs;
  assert.ok(Array.isArray(refs) && refs.length === 1);
  const sourceRef = refs[0];
  assert.equal(sourceRef.kind, "meetings");
  assert.equal(sourceRef.id, linkage.sourceId);
  assert.equal(sourceRef.eligible, true);
  assert.match(sourceRef.sha256, /^[0-9a-f]{64}$/);
  assert.equal(sourceRef.revision, sourceRef.sha256);

  const currentSource = await communications(native, {operation: "source", payload: {kind: sourceRef.kind, id: sourceRef.id}});
  assert.deepEqual(currentSource.reference, sourceRef, "source must remain current and eligible");
  const archives = linkage.archives;
  assert.ok(archives?.original && archives?.corrected, "prior archives required");
  for (const archive of Object.values(archives)) {
    assert.equal(archive.articleId, id);
    assert.match(archive.sha256, /^[0-9a-f]{64}$/);
  }
  assert.notEqual(archives.original.attachmentId, archives.corrected.attachmentId);
  assert.equal(archives.corrected.revision, previous.current_revision);
  assert.equal(archives.corrected.contentSha256, previous.revision.sha256);
  const priorHistory = previous.history.filter((row) => row.state === "published").map((row) => ({ id: row.id, revision: row.revision, action: row.action }));
  const oldRevision = previous.current_revision;
  const oldSha256 = previous.revision.sha256;
  const body = `${previous.revision.body}\n\nUnattended ${Date.now()}-${randomUUID()}`;
  await communications(native, {
    operation: "edit",
    id,
    payload: {
      expected_revision: oldRevision,
      title: previous.revision.title,
      body,
      kind: previous.kind,
      language: previous.revision.language,
      sources: [{ kind: sourceRef.kind, id: sourceRef.id }],
      access_reviewed: true,
      translation_provenance: previous.revision.translation_provenance || null,
    },
  });
  const article = await communications(native, { operation: "article", id });
  const revision = article.current_revision;
  const sha256 = article.revision.sha256;
  assert.equal(article.id, id);
  assert.ok(Number.isInteger(revision) && revision > oldRevision);
  assert.match(sha256, /^[0-9a-f]{64}$/);
  assert.notEqual(sha256, oldSha256);
  assert.deepEqual(article.revision.source_refs, previous.revision.source_refs);

  await communications(native, {
    operation: "review",
    id,
    payload: {
      expected_revision: revision,
      note: "Synthetic unattended acceptance",
    },
  });

  await communications(native, {
    operation: "approve",
    id,
    payload: {
      expected_revision: revision,
      expected_sha256: sha256,
      confirm: true,
    },
  });

  const dueAt = new Date(Date.now() + 60_000).toISOString();
  const scheduled = await communications(native, {
    operation: "schedule",
    id,
    payload: {
      expected_revision: revision,
      expected_sha256: sha256,
      due_at: dueAt,
      channels: ["website", "email"],
      action: "publish",
      confirm: true,
    },
  });

  const scheduleRows = scheduled.history.filter((row) => row.article_id === id && row.revision === revision && row.action === "publish" && Array.isArray(row.channels) && row.channels.length === 2 && row.channels.includes("website") && row.channels.includes("email") && Date.parse(row.due_at) === Date.parse(dueAt) && row.state === "pending" && typeof row.id === "string" && row.id.length > 0);
  assert.equal(scheduleRows.length, 1);
  const scheduleRow = scheduleRows[0];
  const pending = { id, body, due_at: dueAt, sha256, revision, source_ref: sourceRef, recipient_sha256: linkage.recipientSha256, publication_id: scheduleRow.id, prior_history: priorHistory, archives };
  await save("communications-unattended-pending", pending);
  return pending;
}

export { verifyUnattended } from "./communications-postexit.mjs";
import { verifyUnattended } from "./communications-postexit.mjs";

const isMain =
  process.argv[1] != null &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isMain) {
  const [, , command, output, portalBaseUrl, fixtureRoot] = process.argv;
  if (command !== "verify" || !output || !portalBaseUrl || !fixtureRoot) {
    console.error(
      "Usage: node communications-unattended.mjs verify <output> <portalBaseUrl> <fixtureRoot>",
    );
    process.exitCode = 1;
  } else {
    try {
      const receipt = await verifyUnattended({ output, portalBaseUrl, fixtureRoot });
      console.log(JSON.stringify({ passed: receipt.passed, id: receipt.id }));
    } catch (error) {
      console.error(error?.stack ?? String(error));
      process.exitCode = 1;
    }
  }
}
