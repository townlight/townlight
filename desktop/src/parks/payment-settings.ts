// desktop/src/parks/payment-settings.ts

/**
 * Binds the admin-only "Payment settings" form rendered by renderFinance().
 *
 * The backend enforces local-admin authorization on both native ops, so this
 * binder must not attempt its own auth checks. If the admin markup is absent
 * (non-admin render), the returned refresh() is a no-op.
 *
 * The Stripe secret key is only ever *sent* inside the put payload and is
 * never echoed, stored, or displayed. Settings responses are inspected for
 * the actual public fields (enabled / mode / secret_configured) and only those
 * non-secret fields are surfaced to the UI.
 */

type PaymentSettingsCtx = {
  call: (op: string, extra?: unknown) => Promise<unknown>;
  run: <T>(label: string, task: () => Promise<T>) => Promise<T>;
  status?: (message: string, isError?: boolean) => void;
};

type PublicPaymentSettings = {
  configured?: boolean;
  enabled?: boolean;
  provider?: string;
  mode?: string | null;
  secret_configured?: boolean;
  has_secret?: boolean;
  currency?: string;
};

type PaymentSettingsPutPayload = {
  enabled: boolean;
  clear_secret: boolean;
  secret_key?: string;
};

const NOOP = async (): Promise<void> => {
  /* noop: admin markup not present; backend auth enforces admin */
};

const asPublicSettings = (raw: unknown): PublicPaymentSettings => {
  if (raw && typeof raw === "object") {
    return raw as PublicPaymentSettings;
  }
  return {};
};

const hasStoredSecret = (settings: PublicPaymentSettings): boolean =>
  settings.secret_configured === true || settings.has_secret === true;

export function bindPaymentSettings(
  root: HTMLElement,
  ctx: PaymentSettingsCtx,
): { refresh: () => Promise<void> } {
  const form = root.querySelector<HTMLFormElement>("form[data-payment-settings]");
  const enabledInput = root.querySelector<HTMLInputElement>("#finance-payment-enabled");
  const secretInput = root.querySelector<HTMLInputElement>("#finance-payment-secret-key");
  const clearInput = root.querySelector<HTMLInputElement>("#finance-payment-clear-secret");
  const statusEl = root.querySelector<HTMLElement>("[data-payment-settings-status]");
  const refreshBtn = root.querySelector<HTMLButtonElement>("[data-settings-refresh]");

  // Admin markup absent (or incomplete): no-op refresh; backend already blocks
  // non-admin callers on the native ops.
  if (!form || !enabledInput || !statusEl) {
    return { refresh: NOOP };
  }

  const report = (message: string, isError = false): void => {
    statusEl.textContent = message;
    statusEl.classList.toggle("finance-status--error", isError);
    if (typeof ctx.status === "function") {
      try {
        ctx.status(message, isError);
      } catch {
        // Status reporting must never break the flow.
      }
    }
  };

  // Apply safe fields from a public settings response. Never touches the
  // secret input: only the enabled checkbox is populated from the server.
  const fillFromPublic = (raw: unknown): PublicPaymentSettings => {
    const settings = asPublicSettings(raw);
    enabledInput.checked = settings.enabled === true;
    return settings;
  };

  const describePublic = (settings: PublicPaymentSettings): string => {
    const enabledText = settings.enabled === true ? "enabled" : "disabled";
    const modeText =
      typeof settings.mode === "string" && settings.mode.length > 0
        ? settings.mode
        : "not set";
    const secretText = hasStoredSecret(settings) ? "configured" : "not configured";
    return `Online payments ${enabledText}. Mode: ${modeText}. Secret ${secretText}.`;
  };

  const refresh = async (): Promise<void> => {
    await ctx.run("payment-settings-refresh", async () => {
      try {
        const result = await ctx.call("payment-settings-get");
        const settings = fillFromPublic(result);
        report(describePublic(settings), false);
      } catch {
        // Non-secret failure status; leave the enabled checkbox untouched.
        report("Could not load payment settings.", true);
      }
    });
  };

  if (refreshBtn) {
    refreshBtn.addEventListener("click", (event) => {
      event.preventDefault();
      void refresh().catch(() => {
        /* refresh already reports internally; swallow only stray rejections */
      });
    });
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();

    void ctx
      .run("payment-settings-save", async () => {
        const wantEnabled = enabledInput.checked;
        const wantClear = clearInput ? clearInput.checked === true : false;
        const typedSecret = secretInput ? secretInput.value : "";

        // Build the native put payload. The secret is included only when the
        // user actually typed something non-empty.
        const payload: PaymentSettingsPutPayload = {
          enabled: wantEnabled,
          clear_secret: wantClear,
        };
        if (typedSecret.length > 0) {
          payload.secret_key = typedSecret;
        }

        report("Saving payment settings...", false);

        let saved = false;
        try {
          await ctx.call("payment-settings-put", { payload });
          saved = true;
        } catch {
          // Swallow the rejection; a fixed non-secret message is reported
          // below. The raw error (which could carry secret material from a
          // transport) is never surfaced.
        } finally {
          // Clear the password field the moment the call settles, whether it
          // succeeded or failed. No secret is retained in the DOM or storage.
          if (secretInput) secretInput.value = "";
          if (clearInput) clearInput.checked = false;
        }

        if (!saved) {
          // Retain the enabled checkbox state and use a non-secret status.
          enabledInput.checked = wantEnabled;
          report("Could not save payment settings.", true);
          return;
        }

        // Re-read the actual settings so the display reflects real state.
        try {
          const after = await ctx.call("payment-settings-get");
          const settings = fillFromPublic(after);
          report(describePublic(settings), false);
        } catch {
          enabledInput.checked = wantEnabled;
          report("Payment settings saved.", false);
        }
      })
      .catch(() => {
        // Defensive: never let an unexpected run() rejection leave the UI
        // spinning. Still clear the secret input and show a safe status.
        if (secretInput) secretInput.value = "";
        if (clearInput) clearInput.checked = false;
        report("Could not save payment settings.", true);
      });
  });

  return { refresh };
}
