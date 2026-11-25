export function renderFinance(isAdmin: boolean): string {
  const settingsSection = isAdmin
    ? `
      <section class="finance-section" aria-labelledby="finance-settings-heading">
        <div class="finance-section__header">
          <div>
            <h2 id="finance-settings-heading">Payment settings</h2>
            <p class="finance-muted">
              Stripe is optional and configured by the city. Card data is never entered or displayed here.
            </p>
          </div>
          <button type="button" class="finance-button finance-button--secondary" data-settings-refresh>
            Refresh settings
          </button>
        </div>

        <form class="finance-form" data-payment-settings>
          <div class="finance-field finance-field--checkbox">
            <input id="finance-payment-enabled" name="enabled" type="checkbox" />
            <label for="finance-payment-enabled">Enable online payments</label>
          </div>

          <div class="finance-field">
            <label for="finance-payment-secret-key">Stripe secret key</label>
            <input
              id="finance-payment-secret-key"
              name="secret_key"
              type="password"
              autocomplete="new-password"
              spellcheck="false"
              aria-describedby="finance-payment-secret-help"
            />
            <p id="finance-payment-secret-help" class="finance-help">
              Leave blank to keep the current secret. Existing secrets are never displayed.
            </p>
          </div>

          <div class="finance-field finance-field--checkbox">
            <input id="finance-payment-clear-secret" name="clear_secret" type="checkbox" />
            <label for="finance-payment-clear-secret">Clear the stored secret key</label>
          </div>

          <output class="finance-status" data-payment-settings-status role="status" aria-live="polite"></output>

          <div class="finance-actions">
            <button type="submit" class="finance-button">Save payment settings</button>
          </div>
        </form>
      </section>
    `
    : "";

  return `
    <div class="finance-render" role="region" aria-labelledby="finance-heading">
      <header class="finance-header">
        <div>
          <h1 id="finance-heading">Finance</h1>
          <p class="finance-muted">
            Record offline payments and refunds, prepare hosted refunds, and review reconciliation activity.
          </p>
        </div>
        <button type="button" class="finance-button finance-button--secondary" data-finance-refresh>
          Refresh selected obligation
        </button>
      </header>

      <section class="finance-section" aria-labelledby="finance-selected-heading">
        <h2 id="finance-selected-heading">Selected obligation</h2>
        <div class="finance-selected" data-finance-selected aria-live="polite" aria-atomic="true">
          <p class="finance-muted">No booking or registration selected.</p>
        </div>
      </section>

      <section class="finance-section" aria-labelledby="finance-receipt-heading">
        <h2 id="finance-receipt-heading">Receipt</h2>
        <p class="finance-muted">
          Ledger IDs shown here can be selected in the hosted refund form below.
        </p>
        <div class="finance-table-wrap">
          <table class="finance-table" data-finance-receipt>
            <caption>Receipt ledger entries for the selected obligation</caption>
            <thead>
              <tr>
                <th scope="col">Ledger ID</th>
                <th scope="col">Recorded</th>
                <th scope="col">Amount</th>
                <th scope="col">Reference</th>
              </tr>
            </thead>
            <tbody data-finance-receipt-rows>
              <tr>
                <td colspan="4" class="finance-muted">No receipt loaded.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <div class="finance-grid">
        <section class="finance-section" aria-labelledby="finance-offline-payment-heading">
          <h2 id="finance-offline-payment-heading">Offline payment</h2>
          <form class="finance-form" data-offline-payment>
            <div class="finance-field">
              <label for="finance-offline-payment-amount">Amount (cents)</label>
              <input
                id="finance-offline-payment-amount"
                name="amount_cents"
                type="number"
                inputmode="numeric"
                min="1"
                step="1"
                required
                aria-describedby="finance-offline-payment-amount-help"
              />
              <p id="finance-offline-payment-amount-help" class="finance-help">
                Enter a whole number of cents, at least 1.
              </p>
            </div>

            <div class="finance-field">
              <label for="finance-offline-payment-reference">Reference</label>
              <input
                id="finance-offline-payment-reference"
                name="reference"
                type="text"
                autocomplete="off"
                maxlength="200"
              />
            </div>

            <div class="finance-actions">
              <button type="submit" class="finance-button">Record offline payment</button>
            </div>
          </form>
        </section>

        <section class="finance-section" aria-labelledby="finance-offline-refund-heading">
          <h2 id="finance-offline-refund-heading">Offline refund</h2>
          <form class="finance-form" data-offline-refund>
            <div class="finance-field">
              <label for="finance-offline-refund-amount">Amount (cents)</label>
              <input
                id="finance-offline-refund-amount"
                name="amount_cents"
                type="number"
                inputmode="numeric"
                min="1"
                step="1"
                required
                aria-describedby="finance-offline-refund-amount-help"
              />
              <p id="finance-offline-refund-amount-help" class="finance-help">
                Enter a whole number of cents, at least 1.
              </p>
            </div>

            <div class="finance-field">
              <label for="finance-offline-refund-reference">Reference</label>
              <input
                id="finance-offline-refund-reference"
                name="reference"
                type="text"
                autocomplete="off"
                maxlength="200"
              />
            </div>

            <div class="finance-actions">
              <button type="submit" class="finance-button">Record offline refund</button>
            </div>
          </form>
        </section>
      </div>

      <section class="finance-section" aria-labelledby="finance-hosted-refund-heading">
        <div class="finance-section__header">
          <div>
            <h2 id="finance-hosted-refund-heading">Hosted refund</h2>
            <p class="finance-muted">
              Prepare a refund against a receipt ledger entry. No card data is entered here.
            </p>
          </div>
          <button type="button" class="finance-button finance-button--secondary" data-refund-refresh>
            Refresh pending refunds
          </button>
        </div>

        <form class="finance-form" data-hosted-refund>
          <div class="finance-field">
            <label for="finance-hosted-refund-ledger">Payment ledger entry</label>
            <select id="finance-hosted-refund-ledger" name="payment_ledger_id" data-payment-ledger required>
              <option value="">Select a receipt ledger ID</option>
            </select>
            <p class="finance-help">
              Ledger IDs from the receipt table above are available in this list.
            </p>
          </div>

          <div class="finance-field">
            <label for="finance-hosted-refund-amount">Amount (cents)</label>
            <input
              id="finance-hosted-refund-amount"
              name="amount_cents"
              type="number"
              inputmode="numeric"
              min="1"
              step="1"
              required
              aria-describedby="finance-hosted-refund-amount-help"
            />
            <p id="finance-hosted-refund-amount-help" class="finance-help">
              Enter a whole number of cents, at least 1.
            </p>
          </div>

          <div class="finance-field">
            <label for="finance-hosted-refund-reason">Reason</label>
            <textarea
              id="finance-hosted-refund-reason"
              name="reason"
              rows="3"
              maxlength="500"
            ></textarea>
          </div>

          <output class="finance-status" data-refund-status role="status" aria-live="polite"></output>

          <div class="finance-actions">
            <button type="submit" class="finance-button">Prepare hosted refund</button>
          </div>
        </form>
      </section>

      <section class="finance-section" aria-labelledby="finance-reconciliation-heading">
        <div class="finance-section__header">
          <div>
            <h2 id="finance-reconciliation-heading">Reconciliation</h2>
            <p class="finance-muted">
              Review recent ledger activity and payment statuses.
            </p>
          </div>
          <button type="button" class="finance-button finance-button--secondary" data-reconciliation-refresh>
            Refresh reconciliation
          </button>
        </div>

        <div class="finance-table-wrap">
          <table class="finance-table">
            <caption>Recent reconciliation activity</caption>
            <thead>
              <tr>
                <th scope="col">Recorded</th>
                <th scope="col">Ledger ID</th>
                <th scope="col">Type</th>
                <th scope="col">Amount</th>
                <th scope="col">Reference</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody data-reconciliation></tbody>
          </table>
        </div>
      </section>

      ${settingsSection}
    </div>
  `;
}
