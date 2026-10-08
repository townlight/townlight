import { expect, test } from "@playwright/test";

async function confirmWorkAction(page, actionLabel, confirmLabel = actionLabel) {
  await page.getByRole("button", { name: actionLabel, exact: true }).click();
  await expect(page.locator('[data-guided-review="work"]')).toBeVisible();
  await page.getByRole("button", { name: `Confirm ${confirmLabel}`, exact: true }).click();
  await expect(page.locator('[data-guided-review="work"]')).toHaveCount(0);
}

test("Townlight Records beta completes the fictional request-to-release journey", async ({ page }) => {
  await page.addInitScript(() => {
    const module = (id, displayName, role) => ({
      id,
      display_name: displayName,
      role,
      version: "beta",
      required: id === "civiccore",
      selectable: id !== "civiccore",
      installed: true,
      enabled: true,
      contract_ready: true,
      blocked_reason: null,
      dependencies: id === "civiccore" ? [] : ["civiccore"],
      proof_required: ["records-beta-acceptance"],
      backup_restore_hooks: [],
      route_count: 1,
      service_count: 1,
      permission_count: 1,
      task_count: 1,
      model_required: false
    });

    const emptyWork = () => ({
      schema_version: 1,
      demo_fixture: null,
      meeting_bodies: [],
      meeting_members: [],
      agenda_intakes: [],
      meetings: [],
      records_requests: [],
      code_sources: [],
      code_handoffs: [],
      adopted_legislation: [],
      audit_entries: [],
      publication_events: [],
      notification_events: [],
      access: { reviews: [], audit_events: [] }
    });

    const request = {
      id: "records-request-demo-1",
      created_at_unix_seconds: 1,
      updated_at_unix_seconds: 1,
      requester: "Fictional requester",
      requester_contact: "demo-requester@example.invalid",
      submitted_via: "synthetic fixture",
      public_tracking_number: "REQ-DEMO-0001",
      summary: "Trail maintenance schedules and utility sampling records",
      deadline: "",
      deadline_basis: "",
      status: "received",
      assigned_to: "",
      citations: [],
      search_notes: [],
      search_sessions: [],
      exemption_reviews: [],
      exemption_decisions: [],
      fee_line_items: [],
      approval_notes: [],
      messages: [],
      documents: [{
        id: "demo-record-1",
        title: "Fictional trail maintenance schedule",
        status: "source",
        sha256: "5f0d63cfe7cfc9e163742c9b613244732154e64dd1cfa73fc555550455269c34",
        citation: "fixture://redstone-valley-records-demo/demo-record-1"
      }],
      release_packages: [],
      exports: [],
      timeline: [],
      public_status_events: [],
      response_draft: "",
      approved_at_unix_seconds: null,
      fulfilled_at_unix_seconds: null
    };

    let work = emptyWork();
    const appState = {
      product_name: "Townlight",
      status_label: "Townlight Records public beta",
      local_only: true,
      modules: [
        module("civiccore", "Townlight Core", "shared platform"),
        module("civicrecords-ai", "Townlight Records", "records workflow"),
        module("civicnotice", "Townlight Notice", "public notice workflow"),
        module("civicaccess", "Townlight Access", "accessibility review")
      ],
      module_profiles: [{
        id: "records-beta",
        label: "Townlight Records",
        description: "Core + Records + Notice + Access",
        selected: true,
        disabled: false,
        module_count: 4
      }],
      module_selection: {
        profile_id: "records-beta",
        profile_label: "Townlight Records",
        installed_module_ids: ["civiccore", "civicrecords-ai", "civicnotice", "civicaccess"],
        enabled_module_ids: ["civiccore", "civicrecords-ai", "civicnotice", "civicaccess"],
        disabled_module_ids: ["civicclerk", "civiccode"],
        last_updated_unix_seconds: 1
      },
      first_run: { finished: true, status: "Ready", steps: [], locations: {} },
      access: {
        configured: true,
        signed_in: true,
        role: "local-admin",
        operator_email: "beta-admin@example.invalid"
      },
      health: [],
      city_work: work
    };

    window.__recordsBetaInvocations = [];
    window.__TAURI_INTERNALS__ = {
      invoke: async (cmd, args = {}) => {
        if (cmd === "get_app_state") {
          appState.city_work = work;
          return structuredClone(appState);
        }
        if (cmd === "supervisor_action") {
          window.__recordsBetaInvocations.push({ cmd, action: args.action });
          return {
            accepted: true,
            action: args.action,
            service_id: null,
            status: args.action === "backup" ? "Backup created" : "Restore verified",
            message: args.action === "backup"
              ? "Created a verified Townlight backup for the fictional beta profile."
              : "Restored and verified the fictional Townlight beta profile.",
            next_action: "Continue the acceptance journey."
          };
        }
        if (cmd !== "city_work_action") {
          throw new Error(`Unexpected Tauri command: ${cmd}`);
        }

        const action = args.action;
        window.__recordsBetaInvocations.push({ cmd, action, payload: structuredClone(args.payload || {}) });
        if (action === "load-demo-town") {
          work = emptyWork();
          work.demo_fixture = {
            fixture_id: "redstone-valley-records-demo",
            fixture_version: "1.0.0",
            fixture_sha256: "a9c242a3f2618a69d7effb1d0d17d2df06f6744c8c351bba4065d315c94575b4",
            municipality_name: "Town of Redstone Valley (Fictional)",
            watermark: "SYNTHETIC DEMONSTRATION DATA - NOT A REAL MUNICIPAL RECORD",
            loaded_at_unix_seconds: 2
          };
          work.records_requests = [structuredClone(request)];
        } else {
          const active = work.records_requests[0];
          if (action === "calculate-records-deadline") {
            active.deadline = "2026-08-20";
            active.deadline_basis = args.payload.deadlineBasis;
            active.status = "deadline calculated";
          } else if (action === "assign-records-request") {
            active.assigned_to = args.payload.assignedTo;
            active.status = "assigned";
          } else if (action === "record-records-search-session") {
            active.search_sessions.push({
              id: "search-session-1",
              query: args.payload.searchQuery,
              locations: args.payload.searchLocations,
              reviewer: args.payload.searchReviewer,
              results: [{
                title: args.payload.searchResultTitle,
                citation: args.payload.searchResultCitation,
                summary: args.payload.searchResultSummary,
                status: args.payload.searchResultStatus
              }]
            });
            active.citations.push(args.payload.searchResultCitation);
            active.status = "search complete";
          } else if (action === "add-records-exemption-decision") {
            active.exemption_decisions.push({
              source: args.payload.exemptionSource,
              kind: args.payload.exemptionKind,
              finding: args.payload.exemptionFinding,
              decision: args.payload.exemptionDecision,
              basis: args.payload.exemptionBasis,
              reviewer: args.payload.exemptionReviewer
            });
            active.status = "human review complete";
          } else if (action === "accessibility-review") {
            work.access.reviews.push({
              review_id: "access-review-1",
              created_at_unix_seconds: 3,
              title: args.payload.title,
              status: "passes-sample-checks",
              findings: [],
              language: args.payload.language,
              has_alt_text: args.payload.hasAltText
            });
          } else if (action === "suggest-records-response") {
            // UI adapter contract only; real model inference is installed acceptance.
            active.response_draft = "Synthetic adapter-generated draft for human editing.";
            active.approved_at_unix_seconds = null;
            active.status = "local AI draft ready for review";
          } else if (action === "draft-records-response") {
            active.response_draft = args.payload.responseDraft;
            active.status = "drafted";
          } else if (action === "approve-records-response") {
            active.approved_at_unix_seconds = 4;
            active.approval_notes.push(args.payload.approvalNote);
            active.status = "approved";
          } else if (action === "build-records-release-package") {
            active.release_packages.push({
              id: "release-package-1",
              manifest_hash: "7b0fb85627bb8bd66c93348542f1243196beab5ff7eb8f30b4c14a163cd27fd8",
              status: "release-ready"
            });
          } else if (action === "export-records-response") {
            active.exports.push({ id: "export-1", sha256: "9cb4deef37edc890631bacb6048b27ff7b1479ea3d182d8f72e799a3584cb1c4" });
            active.status = "exported";
          } else if (action === "fulfill-records-request") {
            active.fulfilled_at_unix_seconds = 5;
            active.status = "fulfilled";
            active.public_status_events.push({
              label: "Response released",
              status: "fulfilled",
              summary: "Released response available",
              created_at_unix_seconds: 5
            });
          } else if (action === "close-records-request") {
            active.status = "closed";
          }
        }

        appState.city_work = work;
        return {
          accepted: true,
          status: action === "load-demo-town" ? "Demo town loaded" : "Action complete",
          message: action === "load-demo-town" ? "Loaded the canonical fictional Records fixture." : `${action} completed.`,
          next_action: "Continue the beta acceptance journey.",
          state: structuredClone(work),
          search_results: []
        };
      }
    };
  });

  await page.goto("/");
  const primaryNav = page.getByRole("navigation", { name: "Primary" });
  await expect(primaryNav.getByRole("button", { name: /Meetings & Notices/ })).toHaveCount(0);
  await expect(primaryNav.getByRole("button", { name: /Code & Ordinances/ })).toHaveCount(0);
  await primaryNav.getByRole("button", { name: /Settings/ }).click();
  await expect(page.getByLabel(/Townlight Records/).first()).toBeChecked();
  await expect(page.locator('[data-module-toggle="civicrecords-ai"]')).toBeChecked();
  await expect(page.locator('[data-module-toggle="civicnotice"]')).toBeChecked();
  await expect(page.locator('[data-module-toggle="civicaccess"]')).toBeChecked();
  await expect(page.locator('[data-module-toggle="civicclerk"]')).toHaveCount(0);
  await expect(page.locator('[data-module-toggle="civiccode"]')).toHaveCount(0);
  await primaryNav.getByRole("button", { name: /Records Requests/ }).click();

  await page.getByRole("button", { name: "Load demo town" }).click();
  await expect(page.getByText("Town of Redstone Valley (Fictional)")).toBeVisible();
  await expect(page.getByText("SYNTHETIC DEMONSTRATION DATA - NOT A REAL MUNICIPAL RECORD")).toBeVisible();
  await expect(page.getByRole("button", { name: "Load demo town" })).toHaveCount(0);

  await page.getByLabel("Received date").fill("2026-08-17");
  await page.getByLabel("Deadline rule").fill("Fictional three-business-day rule");
  await page.getByLabel("Deadline day count").fill("3");
  await page.getByLabel("Deadline basis").fill("Synthetic policy basis; demo only");
  await confirmWorkAction(page, "Calculate Deadline");
  await expect(page.getByText("Due 2026-08-20")).toBeVisible();

  await page.getByLabel("Assign to").fill("Records Officer");
  await page.getByRole("button", { name: "Assign", exact: true }).click();
  await expect(page.getByText("Assigned: Records Officer")).toBeVisible();

  await page.getByLabel("Records search query").fill("trail maintenance schedule");
  await page.getByLabel("Searched locations").fill("fictional parks and council records");
  await page.getByLabel("Search result title").fill("Trail maintenance schedule");
  await page.getByLabel("Search result citation").fill("fixture://redstone-valley-records-demo/demo-record-1");
  await page.getByLabel("Search result summary").fill("Synthetic responsive record located.");
  await confirmWorkAction(page, "Save Search Session");
  await expect(page.getByText("trail maintenance schedule", { exact: true })).toBeVisible();
  await expect(page.getByText("fixture://redstone-valley-records-demo/demo-record-1", { exact: true })).toBeVisible();

  await page.getByLabel("Exemption source").fill("demo-record-1 page 1");
  await page.getByLabel("Exemption category").fill("none - release review");
  await page.getByLabel("Staff finding").fill("No exemption applies to this fictional record.");
  await page.getByLabel("Decision", { exact: true }).selectOption("release");
  await page.getByLabel("Decision basis").fill("Synthetic demo policy; release approved by human reviewer");
  await page.getByLabel("Exemption reviewer").fill("Records Officer");
  await confirmWorkAction(page, "Save Exemption Decision");
  await expect(page.locator("details").filter({ hasText: "Exemption Decisions" }))
    .toContainText("No exemption applies to this fictional record.");

  await primaryNav.getByRole("button", { name: /Accessibility/ }).click();
  await page.getByLabel("Document title *").fill("Fictional records response");
  await page.getByLabel("Public text *").fill("The requested fictional trail maintenance schedule is ready.");
  await page.getByLabel("All images / visuals have alternative text").check();
  await confirmWorkAction(page, "Run Review & Save");
  await expect(page.getByText("No findings (advisory)")).toBeVisible();

  await primaryNav.getByRole("button", { name: /Records Requests/ }).click();
  await confirmWorkAction(page, "Generate Local AI Draft", "Generate Draft");
  await expect(page.locator('[data-work-field="responseDraft"]'))
    .toHaveValue("Synthetic adapter-generated draft for human editing.");
  await page.getByLabel("Response draft").fill("Attached is the approved fictional response with its cited source.");
  await page.getByRole("button", { name: "Save Draft", exact: true }).click();
  await page.getByLabel("Approval note").fill("Human-reviewed for release and accessibility.");
  await confirmWorkAction(page, "Approve Response");
  await expect(page.getByText("Approval: human-approved")).toBeVisible();
  await confirmWorkAction(page, "Build Release Package");
  await confirmWorkAction(page, "Export Response");
  await confirmWorkAction(page, "Mark Fulfilled");
  await expect(page.getByText("Fulfillment: released to requester")).toBeVisible();
  await confirmWorkAction(page, "Close Request");
  await expect(page.locator(".workflow-record").filter({ hasText: "Fictional requester" }).getByText("closed", { exact: true })).toBeVisible();

  await page.getByRole("tab", { name: "Resident/Public" }).click();
  await expect(page.getByText("REQ-DEMO-0001")).toBeVisible();
  await expect(page.getByText("Released response available")).toBeVisible();
  await expect(page.getByLabel("Exemption reviewer")).toHaveCount(0);

  await page.getByRole("tab", { name: "Staff" }).click();
  await primaryNav.getByRole("button", { name: /System Health/ }).click();
  await page.getByRole("button", { name: "Backup Now" }).click();
  await page.getByRole("button", { name: "Confirm Backup Now" }).click();
  await expect(page.getByText("Created a verified Townlight backup for the fictional beta profile.")).toBeVisible();
  await page.getByRole("button", { name: "Restore Latest Backup" }).click();
  await page.getByRole("button", { name: "Confirm Restore Latest Backup" }).click();
  await expect(page.getByText("Restored and verified the fictional Townlight beta profile.")).toBeVisible();

  const actions = await page.evaluate(() => window.__recordsBetaInvocations.map((entry) => entry.action));
  expect(actions).toEqual([
    "load-demo-town",
    "calculate-records-deadline",
    "assign-records-request",
    "record-records-search-session",
    "add-records-exemption-decision",
    "accessibility-review",
    "suggest-records-response",
    "draft-records-response",
    "approve-records-response",
    "build-records-release-package",
    "export-records-response",
    "fulfill-records-request",
    "close-records-request",
    "backup",
    "restore"
  ]);
});
