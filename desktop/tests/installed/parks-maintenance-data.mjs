import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { verifyPublishedDataset } from "./dataset-artifact.mjs";

const PRIVATE_KEY = /(^|_)(resident|household|private|account|card|bank|routing|ssn|dob)(_|$)/i;
const ROW_KEYS = ["metric", "state", "count", "amount_cents", "minutes"];

async function call(native, command, request) {
  assert.equal(typeof native, "function", "native transport is required");
  const response = await native(command, { request });
  if (response && typeof response === "object" && Object.prototype.hasOwnProperty.call(response, "result")) {
    return response.result;
  }
  return response;
}

function unwrapRequest(value) {
  if (value && typeof value === "object" && value.request && typeof value.request === "object") {
    return value.request;
  }
  return value;
}

function assertNoPrivateFinance(value, where, seen = new Set()) {
  if (!value || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  for (const [key, child] of Object.entries(value)) {
    assert.ok(!PRIVATE_KEY.test(key), `${where} leaked private field ${key}`);
    assertNoPrivateFinance(child, where, seen);
  }
}

function parseRows(rows) {
  return rows.map((cells) => {
    assert.equal(cells.length, ROW_KEYS.length, "unexpected aggregate column count");
    const row = {
      metric: cells[0],
      state: cells[1],
      count: Number(cells[2]),
      amount_cents: Number(cells[3]),
      minutes: Number(cells[4]),
    };
    assert.ok(row.metric.length > 0 && row.state.length > 0);
    for (const key of ["count", "amount_cents", "minutes"]) {
      assert.ok(Number.isSafeInteger(row[key]) && row[key] >= 0, `invalid ${key}`);
    }
    assert.deepEqual(Object.keys(row).sort(), [...ROW_KEYS].sort());
    assertNoPrivateFinance(row, "aggregate row");
    return row;
  });
}

function chooseAssignee(value) {
  const rows = Array.isArray(value) ? value : [];
  const isUuid = (candidate) =>
    typeof candidate === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(candidate.trim());
  for (const row of rows) {
    if (typeof row === "string") {
      if (isUuid(row)) return row.trim();
      continue;
    }
    if (row && typeof row === "object" && isUuid(row.id)) {
      return row.id.trim();
    }
  }
  throw new Error("No service request assignee was returned.");
}

export async function installedParksMaintenanceData({ page, native, save, resourceId, portalBaseUrl }) {
  assert.ok(resourceId, "resourceId is required");
  const description = `installed parks maintenance ${randomUUID()}`;

  const root = page.locator("[data-parks-maintenance]");
  await root.waitFor({ state: "visible" });
  await root.evaluate((node, id) => {
    node.dispatchEvent(new CustomEvent("parks-resource-selected", { detail: { id }, bubbles: true }));
  }, resourceId);

  await page.locator("[data-maintenance-create]").waitFor({ state: "visible" });
  await page.waitForFunction(
    () => {
      const select = document.querySelector("[data-maintenance-category]");
      return select && select.options.length > 1;
    },
    undefined,
    { timeout: 15000 },
  );

  const category = await page
    .locator('[data-maintenance-category] option:not([value=""])')
    .first()
    .getAttribute("value");
  assert.ok(category, "no maintenance category was available");
  await page.locator("[data-maintenance-category]").selectOption(category);
  await page.locator("[data-maintenance-description]").fill(description);
  await page.locator("[data-maintenance-submit]").click();

  let link;
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const list = await call(native, "parks_request", {
      operation: "maintenance-list",
      resource_id: resourceId,
      limit: 100,
    });
    assert.ok(Array.isArray(list), "maintenance-list did not return an array");
    link = list.find((entry) => entry?.request?.description === description);
    if (link) break;
    await page.waitForTimeout(200);
  }
  assert.ok(link, "the maintenance request created through the UI was not returned");
  assert.equal(link.request.state, "submitted");
  const requestId = link.request.id;
  const linkId = link.link.id;
  assert.ok(requestId && linkId);
  assertNoPrivateFinance(link, "maintenance list entry");

  const assignees = await call(native, "service_requests_request", { operation: "assignees" });
  const assignee = chooseAssignee(assignees);

  let current = unwrapRequest(
    await call(native, "service_requests_request", { operation: "request", id: requestId }),
  );
  assert.equal(current.id, requestId);
  assert.equal(current.state, "submitted");

  const revisionBeforeUpload = current.revision;
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
    "base64",
  );
  assert.ok(png.length > 0, "synthetic PNG must not be empty");
  const photoSha256 = createHash("sha256").update(png).digest("hex");
  const photoName = `maintenance-${String(requestId).replace(/[^a-zA-Z0-9._-]/g, "_")}.png`;
  const uploaded = await call(native, "service_requests_request", {
    operation: "attach",
    id: requestId,
    payload: {
      expected_revision: revisionBeforeUpload,
      name: photoName,
      media_type: "image/png",
      content_base64: png.toString("base64"),
      public: false,
    },
  });
  assert.ok(uploaded && typeof uploaded === "object", "attachment upload did not return an object");
  assert.match(
    String(uploaded.id),
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    "attachment upload did not return a canonical UUID",
  );
  assert.equal(uploaded.request_id, requestId);
  assert.equal(uploaded.name, photoName);
  assert.equal(uploaded.media_type, "image/png");
  assert.equal(uploaded.size, png.length);
  assert.equal(uploaded.sha256, photoSha256);
  assert.equal(uploaded.public, false);

  current = unwrapRequest(
    await call(native, "service_requests_request", { operation: "request", id: requestId }),
  );
  assert.equal(current.id, requestId);
  assert.equal(current.state, "submitted");
  assert.ok(
    Number.isSafeInteger(current.revision) && current.revision > revisionBeforeUpload,
    "attachment upload did not advance the request revision",
  );
  assert.ok(Array.isArray(current.attachments), "request readback did not include attachments");
  const currentAttachment = current.attachments.find((attachment) => attachment?.id === uploaded.id);
  assert.ok(currentAttachment, "uploaded attachment was not present in request readback");
  assert.equal(currentAttachment.name, photoName);
  assert.equal(currentAttachment.media_type, "image/png");
  assert.equal(currentAttachment.size, png.length);
  assert.equal(currentAttachment.sha256, photoSha256);
  assert.equal(currentAttachment.public, false);

  const download = await call(native, "service_requests_request", {
    operation: "download-attachment",
    id: requestId,
    payload: { attachment_id: uploaded.id },
  });
  assert.ok(download && typeof download === "object", "attachment download did not return an object");
  assert.ok(typeof download.path === "string" && download.path.length > 0, "attachment download path is empty");
  assert.match(String(download.sha256), /^[0-9a-f]{64}$/);
  assert.ok(Number.isSafeInteger(download.size_bytes) && download.size_bytes > 0);
  const downloadedPhotoBytes = await readFile(download.path);
  assert.ok(Buffer.isBuffer(downloadedPhotoBytes));
  assert.equal(createHash("sha256").update(downloadedPhotoBytes).digest("hex"), photoSha256);
  assert.equal(download.sha256, photoSha256);
  assert.equal(download.size_bytes, png.length);
  assert.ok(downloadedPhotoBytes.equals(png), "downloaded attachment bytes did not match the synthetic PNG");

  async function transition(state, reason, extra = {}) {
    const previous = current.revision;
    const payload = { expected_revision: previous, target: state, reason, ...extra };
    assertNoPrivateFinance(payload, "service request transition");
    await call(native, "service_requests_request", {
      operation: "transition",
      id: requestId,
      payload,
    });
    current = unwrapRequest(
      await call(native, "service_requests_request", { operation: "request", id: requestId }),
    );
    assert.equal(current.state, state);
    assert.ok(Number.isSafeInteger(current.revision) && current.revision > previous);
    if (extra.assignee) assert.equal(current.assignee, extra.assignee);
  }

  await transition("triaged", "maintenance triage");
  await transition("assigned", "assign public works", { assignee });
  await transition("in_progress", "work started");
  await transition("resolved", "work completed");
  await transition("closed", "request closed");
  assert.equal(current.state, "closed");
  assert.ok(Array.isArray(current.events) && current.events.length > 0);
  const last = current.events[current.events.length - 1];
  assert.equal(last.kind, "state_changed");
  assert.equal(last.payload?.to, "closed");

  const parksReadback = await call(native, "parks_request", {
    operation: "maintenance-get",
    link_id: linkId,
  });
  assert.ok(parksReadback && typeof parksReadback === "object", "maintenance-get did not return an object");
  assert.ok(parksReadback.link && parksReadback.request, "maintenance-get did not return link and request");
  assert.equal(parksReadback.link.id, linkId);
  assert.equal(parksReadback.link.request_id, requestId);
  assert.equal(parksReadback.request.id, requestId);
  assert.equal(parksReadback.request.state, current.state);
  assert.equal(parksReadback.request.state, "closed");
  assert.equal(parksReadback.request.revision, current.revision);
  assert.ok(Array.isArray(parksReadback.request.attachments), "Parks request did not include attachments");
  const parksAttachment = parksReadback.request.attachments.find((attachment) => attachment?.id === uploaded.id);
  assert.ok(parksAttachment, "uploaded attachment was not present in the Parks request");
  assert.equal(parksAttachment.name, photoName);
  assert.equal(parksAttachment.media_type, "image/png");
  assert.equal(parksAttachment.size, png.length);
  assert.equal(parksAttachment.sha256, photoSha256);
  assert.equal(parksAttachment.public, false);

  await root.locator("[data-maintenance-refresh]").click();
  await page.locator(`[data-maintenance-list] button[data-link-id="${linkId}"]`).click();
  const expectedPhotoUi = {
    name: photoName,
    mediaType: "image/png",
    sizeText: `${png.length} bytes`,
    sha256: photoSha256,
  };
  await page.waitForFunction(
    (expected) => {
      const detail = document.querySelector("[data-maintenance-detail]");
      if (!detail || !detail.textContent.includes("State: closed")) return false;
      const items = Array.from(detail.querySelectorAll(".maintenance-attachments li"));
      return items.some((item) => {
        const text = item.textContent || "";
        return (
          text.includes(expected.name) &&
          text.includes(expected.mediaType) &&
          text.includes(expected.sizeText) &&
          text.includes(expected.sha256)
        );
      });
    },
    expectedPhotoUi,
    { timeout: 15000 },
  );

  const data = page.locator("[data-parks-data-publication]");
  await data.waitFor({ state: "visible" });
  await data.locator('[data-parks-action="preview"]').click();
  await page.waitForFunction(
    () => {
      const id = document.querySelector("[data-parks-preview-id]");
      const hash = document.querySelector("[data-parks-preview-hash]");
      return id?.textContent.trim() && /^[0-9a-f]{64}$/.test(hash?.textContent.trim() || "");
    },
    undefined,
    { timeout: 15000 },
  );

  const previewId = (await data.locator("[data-parks-preview-id]").innerText()).trim();
  const previewSha256 = (await data.locator("[data-parks-preview-hash]").innerText()).trim();
  assert.ok(/^[0-9a-f]{64}$/.test(previewSha256));
  const previewRows = parseRows(
    await data.locator("[data-parks-preview-rows] tr").evaluateAll((rows) =>
      rows.map((row) => Array.from(row.cells, (cell) => cell.textContent.trim())),
    ),
  );

  const status = await call(native, "parks_request", { operation: "data-status" });
  assert.equal(status.configured, true, "public data publication is not configured");
  const publishPayload = { id: previewId, expected_sha256: previewSha256, confirm: true };
  assertNoPrivateFinance(publishPayload, "data publish");
  const receipt = await call(native, "parks_request", {
    operation: "data-publish",
    payload: publishPayload,
  });
  assert.ok(receipt && typeof receipt === "object", "data-publish did not return a receipt");
  assertNoPrivateFinance(receipt, "data publish receipt");

  assert.ok(portalBaseUrl, "portalBaseUrl is required to verify the delivered public aggregate");
  const url = new URL(portalBaseUrl);
  assert.ok(url.protocol === "http:" || url.protocol === "https:");
  const api = page.request;
  assert.ok(api, "page.request is required for portal verification");

  assert.ok(Number.isSafeInteger(receipt?.sequence), "data-publish receipt did not include a delivery sequence");
  let job;
  const deliveryDeadline = Date.now() + 30000;
  while (Date.now() < deliveryDeadline) {
    const latest = await call(native, "parks_request", { operation: "data-status" });
    const publications = Array.isArray(latest?.publications) ? latest.publications : [];
    job = publications.find(
      (entry) =>
        entry?.action === "publish" &&
        entry?.sequence === receipt.sequence &&
        entry?.state === "delivered",
    );
    if (job) break;
    if (publications.some((entry) => entry?.sequence === receipt.sequence && entry?.state === "rejected")) {
      throw new Error("public data publication was rejected");
    }
    await page.waitForTimeout(500);
  }
  assert.ok(job, "public data publication was not delivered");
  const datasetId = job.meeting_id ?? receipt.meeting_id;
  assert.ok(datasetId, "delivered publication did not include a dataset id");

  const revision = await call(native, "parks_request", {
    operation: "data-revision",
    revision_id: previewId,
  });
  assert.ok(revision && typeof revision === "object", "data-revision did not return the stored revision");
  assert.equal(String(revision.id), String(previewId), "stored revision id did not match the preview");
  assert.equal(revision.sha256, previewSha256, "stored revision hash did not match the preview");
  assert.ok(revision.approved_at, "stored revision was not approved");

  let downloaded;
  let body;
  const until = Date.now() + 15000;
  while (Date.now() < until) {
    const response = await api.get(new URL(`/datasets/${datasetId}/dataset.json`, portalBaseUrl).href, {
      failOnStatusCode: false,
    });
    if (response.status() === 200) {
      downloaded = await response.body();
      body = JSON.parse(downloaded.toString("utf8"));
      break;
    }
    await page.waitForTimeout(500);
  }
  assert.ok(body, "delivered aggregate did not appear on the public portal");
  const datasetVerification = verifyPublishedDataset(revision, downloaded);
  assert.deepEqual(body, previewRows, "delivered aggregate rows did not match the preview");
  assertNoPrivateFinance(body, "approved aggregate");
  const portal = { approval: receipt, pending: false, passed: true, status: 200, body, job, datasetVerification, revisionSha256: revision.sha256 };

  const result = {
    linkId,
    requestId,
    assignee,
    finalState: current.state,
    finalRevision: current.revision,
    photo: {
      attachmentId: uploaded.id,
      requestId,
      linkId,
      name: photoName,
      sha256: photoSha256,
      sizeBytes: png.length,
      public: false,
      downloadedSha256: download.sha256,
      parksState: parksReadback.request.state,
      parksRevision: parksReadback.request.revision,
    },
    previewId,
    previewSha256,
    receipt,
    ...portal,
  };
  if (typeof save === "function") await save("parks-maintenance-data", result);
  return result;
}
