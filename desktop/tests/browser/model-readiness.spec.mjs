import { expect, test } from "@playwright/test";

test("home surface keeps local model setup behind first-admin sign-in", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Work that needs attention" })).toBeVisible();
  // C2: the first-run wizard is gated on a confirmed real get_app_state load
  // (appStateLoaded). In a pure browser preview there is no Tauri bridge, so the
  // app is on intentional fallback state and the wizard must NOT render — that
  // gate is what stops a swallowed load error from showing a pristine wizard.
  await expect(page.getByRole("heading", { name: "City Core setup checklist" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Gemma 4 12B QAT Q4_0" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Download / Resume" })).toHaveCount(0);
  await expect(page.getByText("Create the first Townlight admin and sign in before changing local model setup.")).toHaveCount(0);
  await expect(page.getByText("6 local components are part of this Windows profile.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Townlight Core" })).toBeVisible();

  await expect(page.getByText("Start Docker")).toHaveCount(0);
  await expect(page.getByText("Install WSL")).toHaveCount(0);
});

test("system health shows model readiness with pre-admin actions locked", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /System Health/ }).click();

  await expect(page.getByRole("heading", { name: "Gemma 4 12B QAT Q4_0" })).toBeVisible();
  await expect(page.getByText("No silent download starts from this screen.")).toBeVisible();
  await expect(page.getByText("93567e57a8fe10b23569b9d9ec38cd005deedf71e29477c421a4b83f418a538b")).toBeVisible();
  await expect(page.getByText("hf.co/google/gemma-4-12B-it-qat-q4_0-gguf:Q4_0")).toBeVisible();
  await expect(page.getByText("Download progress")).toBeVisible();
  await expect(page.getByText("No verified or partial Gemma model download is saved on this machine.")).toBeVisible();
  await expect(page.getByText("Needs verification")).toBeVisible();
  await expect(page.getByText("Create the first Townlight admin and sign in before changing local model setup.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Open Model Folder" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Download / Resume" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Verify Checksum" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Retry Setup" })).toBeDisabled();
});

test("system health keeps full model readiness visible", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /System Health/ }).click();

  await expect(page.getByRole("heading", { name: "System Health" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Gemma 4 12B QAT Q4_0" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Local model file" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Checksum verification" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Local model runtime" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Local model registry" })).toBeVisible();
  await expect(page.getByText("explicit setup consent required")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Backup, Restore, Uninstall" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "City data folder" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Backup folder" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Task queue schema" })).toBeVisible();
  await expect(page.getByText("City workflow services are not running yet")).toBeVisible();
  await expect(page.locator('[aria-label="City data folder actions"]')).toHaveCount(0);
  await expect(page.locator('[aria-label="Backup folder actions"]')).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Backup Now" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open Backup Folder" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Create Support Bundle" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Restore Latest Backup" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Prepare Uninstall" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Install$/ }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: /^Start$/ }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: /^Repair$/ }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: /^Logs$/ }).first()).toBeVisible();
});

test("browser preview explains supervisor actions require the desktop bridge", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /System Health/ }).click();
  await page.getByRole("button", { name: "Open Backup Folder" }).click();

  await expect(page.getByText("Desktop app required")).toBeVisible();
  await expect(page.getByText("Runtime service changes are saved by the Windows desktop app, not the browser preview.")).toBeVisible();

  await page.getByRole("button", { name: "Backup Now" }).click();

  await expect(page.locator('[data-guided-review="supervisor"]')).toBeVisible();
  await expect(page.getByRole("heading", { name: "Review Before Backing Up Local Profile" })).toBeVisible();
  await expect(page.getByText("What will change")).toBeVisible();
  await expect(page.getByText("Sources and evidence")).toBeVisible();
  await expect(page.getByRole("button", { name: "Confirm Backup Now" })).toBeVisible();
  await expect(page.getByText("Desktop app required")).toHaveCount(0);

  await page.getByRole("button", { name: "Confirm Backup Now" }).click();
  await expect(page.getByText("Desktop app required")).toBeVisible();
  await expect(page.getByText("Runtime service changes are saved by the Windows desktop app, not the browser preview.")).toBeVisible();
});

test("desktop restore result leaves Working state with bounded service-start follow-up", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    window.__supervisorInvocations = [];
    window.__TAURI_INTERNALS__ = {
      invoke: async (cmd, args = {}) => {
        if (cmd === "get_app_state") {
          return new Promise(() => {});
        }
        if (cmd === "supervisor_action") {
          window.__supervisorInvocations.push({ cmd, args });
          if (args.action !== "restore") {
            throw new Error(`Unexpected supervisor action: ${args.action}`);
          }
          await new Promise((resolve) => window.setTimeout(resolve, 250));
          return {
            accepted: false,
            action: "restore",
            service_id: null,
            status: "Restore needs service start",
            message:
              "Restored Townlight local data and setup. Data old folder cleanup is pending at C:\\Townlight\\Data.restore-old. Config old folder cleanup is pending at C:\\Townlight\\config.restore-old.",
            next_action:
              "Use Start, then Check or Repair from System Health so the restored profile verifies database, task queue, and service health."
          };
        }
        throw new Error(`Unexpected Tauri command: ${cmd}`);
      }
    };
  });

  await page.getByRole("button", { name: /System Health/ }).click();
  await page.getByRole("button", { name: "Restore Latest Backup" }).click();

  await expect(page.locator('[data-guided-review="supervisor"]')).toBeVisible();
  await expect(page.getByRole("heading", { name: "Review Before Restoring Latest Backup" })).toBeVisible();

  await page.getByRole("button", { name: "Confirm Restore Latest Backup" }).click();

  await expect(page.locator('[data-guided-review="supervisor"]')).toHaveCount(0);
  await expect(page.locator(".action-result").getByText("Working", { exact: true })).toBeVisible();
  await expect(page.getByText("Running Restore Latest Backup from the desktop app.")).toBeVisible();

  await expect(page.locator(".action-result").getByText("Restore needs service start", { exact: true })).toBeVisible();
  await expect(page.getByText("Data old folder cleanup is pending")).toBeVisible();
  await expect(page.getByText("Config old folder cleanup is pending")).toBeVisible();
  await expect(page.getByText("Use Start, then Check or Repair from System Health")).toBeVisible();
  await expect(page.locator(".action-result").getByText("Working", { exact: true })).toHaveCount(0);

  const supervisorInvocations = await page.evaluate(() => window.__supervisorInvocations);
  expect(supervisorInvocations).toEqual([
    {
      cmd: "supervisor_action",
      args: {
        action: "restore",
        serviceId: null
      }
    }
  ]);
});

test("desktop backup and support results render before slow health refresh", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    window.__supervisorInvocations = [];
    window.__TAURI_INTERNALS__ = {
      invoke: async (cmd, args = {}) => {
        if (cmd === "get_app_state") {
          return new Promise(() => {});
        }
        if (cmd === "supervisor_action") {
          window.__supervisorInvocations.push({ cmd, args });
          await new Promise((resolve) => window.setTimeout(resolve, 250));
          if (args.action === "backup") {
            return {
              accepted: true,
              action: "backup",
              service_id: null,
              status: "Backup created",
              message:
                "Created a verified Townlight backup at C:\\Townlight Backups\\civicsuite-manual-backup-123.",
              next_action:
                "Keep this backup folder available for restore or reinstall recovery."
            };
          }
          if (args.action === "support-bundle") {
            return {
              accepted: true,
              action: "support-bundle",
              service_id: null,
              status: "Support bundle created",
              message:
                "Created a Townlight support bundle at C:\\Townlight Backups\\support-bundles\\bundle-123.",
              next_action:
                "Share this support bundle folder only with trusted Townlight support or city IT."
            };
          }
          throw new Error(`Unexpected supervisor action: ${args.action}`);
        }
        throw new Error(`Unexpected Tauri command: ${cmd}`);
      }
    };
  });

  await page.getByRole("button", { name: /System Health/ }).click();
  await page.getByRole("button", { name: "Backup Now" }).click();
  await page.getByRole("button", { name: "Confirm Backup Now" }).click();

  await expect(page.locator('[data-guided-review="supervisor"]')).toHaveCount(0);
  await expect(page.locator(".action-result").getByText("Working", { exact: true })).toBeVisible();
  await expect(page.getByText("Running Backup Now from the desktop app.")).toBeVisible();
  await expect(page.locator(".action-result").getByText("Backup created", { exact: true })).toBeVisible();
  await expect(page.getByText("Created a verified Townlight backup")).toBeVisible();
  await expect(page.locator(".action-result").getByText("Working", { exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: "Create Support Bundle" }).click();
  await page.getByRole("button", { name: "Confirm Create Support Bundle" }).click();

  await expect(page.locator('[data-guided-review="supervisor"]')).toHaveCount(0);
  await expect(page.locator(".action-result").getByText("Working", { exact: true })).toBeVisible();
  await expect(page.getByText("Running Create Support Bundle from the desktop app.")).toBeVisible();
  await expect(page.locator(".action-result").getByText("Support bundle created", { exact: true })).toBeVisible();
  await expect(page.getByText("Created a Townlight support bundle")).toBeVisible();
  await expect(page.locator(".action-result").getByText("Working", { exact: true })).toHaveCount(0);

  const supervisorInvocations = await page.evaluate(() => window.__supervisorInvocations);
  expect(supervisorInvocations).toEqual([
    {
      cmd: "supervisor_action",
      args: {
        action: "backup",
        serviceId: null
      }
    },
    {
      cmd: "supervisor_action",
      args: {
        action: "support-bundle",
        serviceId: null
      }
    }
  ]);
});

test("system health repair and uninstall actions require guided review", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /System Health/ }).click();

  await page.getByRole("button", { name: /^Repair$/ }).first().click();
  await expect(page.getByRole("heading", { name: "Review Before Repairing Local data store" })).toBeVisible();
  await expect(page.getByText("Rechecks portable runtime files")).toBeVisible();
  await page.getByRole("button", { name: "Cancel Review" }).click();
  await expect(page.getByRole("heading", { name: "Review Before Repairing Local data store" })).toHaveCount(0);

  await page.getByRole("button", { name: /^Stop$/ }).first().click();
  await expect(page.getByRole("heading", { name: "Review Before Stopping Local data store" })).toBeVisible();
  await expect(page.getByText("Staff workflows may be unavailable until services restart.")).toBeVisible();
  await page.getByRole("button", { name: "Cancel Review" }).click();

  await page.getByRole("button", { name: "Create Support Bundle" }).click();
  await expect(page.getByRole("heading", { name: "Review Before Creating Support Bundle" })).toBeVisible();
  await expect(page.getByText("health, runtime-state, and selected service logs")).toBeVisible();
  await expect(page.getByText("does not copy city records")).toBeVisible();
  await expect(page.getByRole("button", { name: "Confirm Create Support Bundle" })).toBeVisible();
  await page.getByRole("button", { name: "Cancel Review" }).click();

  await page.getByRole("button", { name: "Prepare Uninstall" }).click();
  await expect(page.getByRole("heading", { name: "Review Before Preparing Uninstall" })).toBeVisible();
  await expect(page.getByText("final-uninstall backup")).toBeVisible();
  await expect(page.getByRole("button", { name: "Open Windows Uninstall" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Confirm Prepare Uninstall" })).toBeVisible();
});
