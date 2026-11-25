import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

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

  await root.locator("[data-maintenance-refresh]").click();
  await page.locator(`[data-maintenance-list] button[data-link-id="${linkId}"]`).click();
  await page.waitForFunction(
    () => {
      const detail = document.querySelector("[data-maintenance-detail]");
      return detail && detail.textContent.includes("State: closed");
    },
    undefined,
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
  const deliveredSha256 = job.artifact_sha256 ?? receipt.artifact_sha256;
  assert.equal(deliveredSha256, previewSha256, "delivered aggregate hash did not match the preview");
  const datasetId = job.meeting_id ?? receipt.meeting_id;
  assert.ok(datasetId, "delivered publication did not include a dataset id");

  let body;
  const until = Date.now() + 15000;
  while (Date.now() < until) {
    const response = await api.get(new URL(`/datasets/${datasetId}/dataset.json`, portalBaseUrl).href, {
      failOnStatusCode: false,
    });
    if (response.status() === 200) {
      body = await response.json();
      break;
    }
    await page.waitForTimeout(500);
  }
  assert.ok(body, "delivered aggregate did not appear on the public portal");
  assert.deepEqual(body, previewRows, "delivered aggregate rows did not match the preview");
  assertNoPrivateFinance(body, "approved aggregate");
  const portal = { approval: receipt, pending: false, passed: true, status: 200, body, job };

  const result = {
    linkId,
    requestId,
    assignee,
    finalState: current.state,
    finalRevision: current.revision,
    previewId,
    previewSha256,
    receipt,
    ...portal,
  };
  if (typeof save === "function") await save("parks-maintenance-data", result);
  return result;
}
