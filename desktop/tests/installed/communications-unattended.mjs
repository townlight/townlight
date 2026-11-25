import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const PENDING_FILE = "communications-unattended-pending.json";
const STOPPED_FILE = "communications-app-stopped.json";
const RECEIPT_FILE = "communications-unattended.json";
const POLL_INTERVAL_MS = 500;
const POLL_TIMEOUT_MS = 120_000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

function requireString(value, label) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

function asTimestamp(value, label) {
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) {
    throw new Error(`${label} must be a valid timestamp`);
  }
  return timestamp;
}

function decodeQuotedPrintable(input) {
  const source = String(input).replace(/=\r?\n/g, "");
  const bytes = [];
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const hex = source.slice(index + 1, index + 3);
    if (char === "=" && /^[0-9A-Fa-f]{2}$/.test(hex)) {
      bytes.push(parseInt(hex, 16));
      index += 2;
    } else {
      bytes.push(source.charCodeAt(index) & 0xff);
    }
  }
  return Buffer.from(bytes).toString("utf8");
}

export async function prepareUnattended({ native, save }) {
  if (typeof native !== "function") {
    throw new Error("prepareUnattended requires native(command, {request})");
  }
  if (typeof save !== "function") {
    throw new Error("prepareUnattended requires save(key, value)");
  }

  const stamp = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const title = `Unattended acceptance ${stamp}`;
  const body = `Synthetic unattended acceptance body ${stamp}`;

  const created = await communications(native, {
    operation: "create",
    payload: {
      title,
      body,
      kind: "announcement",
      language: "en",
      sources: [],
      access_reviewed: true,
    },
  });

  const id = requireString(
    created.id ?? created.article?.id ?? created.article_id,
    "created announcement id",
  );

  const article = await communications(native, { operation: "article", id });
  const revision =
    article.current_revision ??
    article.revision?.current_revision ??
    article.article?.current_revision;
  const sha256 =
    article.revision?.sha256 ??
    article.article?.revision?.sha256 ??
    article.sha256;

  if (!Number.isInteger(revision) || revision < 1) {
    throw new Error("article current_revision must be a positive integer");
  }
  requireString(sha256, "article revision.sha256");

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
  await communications(native, {
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

  const pending = { id, body, due_at: dueAt, sha256, revision };
  await save("communications-unattended-pending", pending);
  return pending;
}

export async function verifyUnattended({ output, portalBaseUrl, fixtureRoot }) {
  requireString(output, "output");
  requireString(portalBaseUrl, "portalBaseUrl");
  requireString(fixtureRoot, "fixtureRoot");

  const pendingPath = path.join(output, PENDING_FILE);
  const stoppedPath = path.join(output, STOPPED_FILE);
  const receiptPath = path.join(output, RECEIPT_FILE);

  const pending = JSON.parse(await readFile(pendingPath, "utf8"));
  const stopped = JSON.parse(await readFile(stoppedPath, "utf8"));

  requireString(pending.id, "pending id");
  requireString(pending.body, "pending body");
  requireString(pending.sha256, "pending sha256");
  const dueAt = asTimestamp(pending.due_at, "pending due_at");

  if (stopped.exited !== true) {
    throw new Error("communications-app-stopped.json must set exited:true");
  }
  requireString(String(stopped.pid ?? ""), "stopped pid");
  const stoppedAt = asTimestamp(stopped.at, "stopped at");
  if (!(stoppedAt.getTime() < dueAt.getTime())) {
    throw new Error("stopped.at must be earlier than pending due_at");
  }

  const baseUrl = portalBaseUrl.replace(/\/+$/, "");
  const articleUrl = `${baseUrl}/communications/${encodeURIComponent(pending.id)}/`;
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  let page;

  while (Date.now() <= deadline) {
    try {
      const response = await fetch(articleUrl, {
        signal: AbortSignal.timeout(15_000),
      });
      const text = await response.text();
      if (response.status === 200 && text.includes(pending.body)) {
        page = { url: articleUrl, status: response.status };
        break;
      }
    } catch {
      // Portal not ready yet; bounded polling continues.
    }
    if (Date.now() + POLL_INTERVAL_MS > deadline) {
      break;
    }
    await sleep(POLL_INTERVAL_MS);
  }

  if (!page) {
    throw new Error("Portal article did not become visible with the expected body within 120s");
  }

  const mailDir = path.join(fixtureRoot, "mail");
  let capturedMail;

  while (!capturedMail && Date.now() <= deadline) {
    const mailEntries = await readdir(mailDir, { withFileTypes: true });
    for (const entry of mailEntries) {
      if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".json")) {
        continue;
      }
      const record = JSON.parse(await readFile(path.join(mailDir, entry.name), "utf8"));
      if (typeof record.eml !== "string" || record.recipients == null) {
        continue;
      }
      if (path.basename(record.eml) !== record.eml) {
        throw new Error("mail record.eml must be a file name without path separators");
      }
      const receivedAt = asTimestamp(record.received_at, "mail received_at");
      if (!(receivedAt.getTime() >= stoppedAt.getTime())) {
        continue;
      }
      const decoded = decodeQuotedPrintable(await readFile(path.join(mailDir, record.eml), "latin1"));
      if (!decoded.includes(pending.body)) {
        continue;
      }
      capturedMail = {
        file: entry.name,
        recipients: record.recipients,
        received_at: record.received_at,
        message_id: record.message_id ?? null,
        subject: record.subject ?? null,
      };
      break;
    }
    if (capturedMail || Date.now() + POLL_INTERVAL_MS > deadline) {
      break;
    }
    await sleep(POLL_INTERVAL_MS);
  }

  if (!capturedMail) {
    throw new Error("No real captured mail contains the announcement body after stopped.at");
  }

  const receipt = {
    passed: true,
    synthetic: true,
    id: pending.id,
    body_sha256: pending.sha256,
    revision: pending.revision,
    stopped: { pid: stopped.pid, exited: true, at: stopped.at },
    publish: { url: page.url, status: page.status },
    captured_mail: capturedMail,
    checked_at: new Date().toISOString(),
  };

  await mkdir(output, { recursive: true });
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
  return receipt;
}

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
