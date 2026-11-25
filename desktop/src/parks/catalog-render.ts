export function renderCatalog(): string {
  return `
    <section class="workflow-editor" data-parks-catalog aria-labelledby="catalog-heading">
      <h2 id="catalog-heading">Parks catalog</h2>
      <p data-status role="status" aria-live="polite"></p>

      <section aria-labelledby="catalog-resources-heading">
        <h3 id="catalog-resources-heading">Resources</h3>
        <label for="catalog-resource-list">Selected resource</label>
        <select id="catalog-resource-list" data-resource-list>
          <option value="">Select a resource</option>
        </select>
        <button type="button" data-catalog-refresh>Reload catalog</button>
        <button type="button" data-new-resource>New resource</button>

        <form data-resource aria-labelledby="catalog-resource-form-heading">
          <h4 id="catalog-resource-form-heading">Resource details</h4>
          <input type="hidden" id="catalog-resource-id" name="id" />
          <input type="hidden" id="catalog-resource-revision" name="revision" />

          <fieldset>
            <legend>Identity and location</legend>
            <label for="catalog-resource-name">Name</label>
            <input id="catalog-resource-name" name="name" type="text" required />

            <label for="catalog-resource-address">Address</label>
            <input id="catalog-resource-address" name="address" type="text" required />

            <label for="catalog-resource-timezone">Time zone</label>
            <input
              id="catalog-resource-timezone"
              name="timezone"
              type="text"
              value="America/Denver"
              required
            />
            <p id="catalog-resource-timezone-hint">
              Use an IANA time zone identifier for this resource.
            </p>

            <label for="catalog-resource-description">Description</label>
            <textarea id="catalog-resource-description" name="description"></textarea>

            <label for="catalog-resource-amenities">Amenities</label>
            <input
              id="catalog-resource-amenities"
              name="amenities"
              type="text"
              aria-describedby="catalog-resource-amenities-hint"
            />
            <p id="catalog-resource-amenities-hint">
              Enter amenities as a comma-separated list, for example: restrooms, picnic tables.
            </p>

            <label for="catalog-resource-accessibility">Accessibility notes</label>
            <textarea
              id="catalog-resource-accessibility"
              name="accessibility"
            ></textarea>

            <label for="catalog-resource-public">
              <input id="catalog-resource-public" name="public" type="checkbox" />
              Publicly listed
            </label>

            <label for="catalog-resource-approval-required">
              <input
                id="catalog-resource-approval-required"
                name="approval_required"
                type="checkbox"
              />
              Reservation approval required
            </label>
          </fieldset>

          <fieldset>
            <legend>Reservation rules and fees</legend>
            <label for="catalog-resource-buffer-before">Buffer before reservation (minutes)</label>
            <input
              id="catalog-resource-buffer-before"
              name="buffer_before_minutes"
              type="number"
              min="0"
              step="1"
              required
            />

            <label for="catalog-resource-buffer-after">Buffer after reservation (minutes)</label>
            <input
              id="catalog-resource-buffer-after"
              name="buffer_after_minutes"
              type="number"
              min="0"
              step="1"
              required
            />

            <label for="catalog-resource-fee-cents">Reservation fee (cents)</label>
            <input
              id="catalog-resource-fee-cents"
              name="fee_cents"
              type="number"
              min="0"
              step="1"
              required
            />

            <label for="catalog-resource-deposit-cents">Deposit (cents)</label>
            <input
              id="catalog-resource-deposit-cents"
              name="deposit_cents"
              type="number"
              min="0"
              step="1"
              required
            />

            <label for="catalog-resource-currency">Currency</label>
            <input
              id="catalog-resource-currency"
              name="currency"
              type="text"
              value="USD"
              readonly
              aria-readonly="true"
            />
            <p id="catalog-resource-currency-hint">
              Fees and deposits are recorded in US dollars.
            </p>
          </fieldset>

          <fieldset>
            <legend>Weekly hours</legend>
            <fieldset>
              <legend>Monday</legend>
              <div data-hours-day="mon" role="group" aria-label="Monday hours intervals"></div>
              <button type="button" data-add-hours="mon">Add Monday hours</button>
            </fieldset>
            <fieldset>
              <legend>Tuesday</legend>
              <div data-hours-day="tue" role="group" aria-label="Tuesday hours intervals"></div>
              <button type="button" data-add-hours="tue">Add Tuesday hours</button>
            </fieldset>
            <fieldset>
              <legend>Wednesday</legend>
              <div data-hours-day="wed" role="group" aria-label="Wednesday hours intervals"></div>
              <button type="button" data-add-hours="wed">Add Wednesday hours</button>
            </fieldset>
            <fieldset>
              <legend>Thursday</legend>
              <div data-hours-day="thu" role="group" aria-label="Thursday hours intervals"></div>
              <button type="button" data-add-hours="thu">Add Thursday hours</button>
            </fieldset>
            <fieldset>
              <legend>Friday</legend>
              <div data-hours-day="fri" role="group" aria-label="Friday hours intervals"></div>
              <button type="button" data-add-hours="fri">Add Friday hours</button>
            </fieldset>
            <fieldset>
              <legend>Saturday</legend>
              <div data-hours-day="sat" role="group" aria-label="Saturday hours intervals"></div>
              <button type="button" data-add-hours="sat">Add Saturday hours</button>
            </fieldset>
            <fieldset>
              <legend>Sunday</legend>
              <div data-hours-day="sun" role="group" aria-label="Sunday hours intervals"></div>
              <button type="button" data-add-hours="sun">Add Sunday hours</button>
            </fieldset>
          </fieldset>

          <button type="submit">Save resource</button>
        </form>
      </section>

      <section aria-labelledby="catalog-programs-heading">
        <h3 id="catalog-programs-heading">Programs</h3>
        <label for="catalog-program-list">Selected program</label>
        <select id="catalog-program-list" data-program-list>
          <option value="">Select a program</option>
        </select>
        <button type="button" data-new-program>New program</button>

        <form data-program aria-labelledby="catalog-program-form-heading">
          <h4 id="catalog-program-form-heading">Program details</h4>
          <input type="hidden" id="catalog-program-id" name="id" />
          <input type="hidden" id="catalog-program-revision" name="revision" />

          <fieldset>
            <legend>Program information</legend>
            <label for="catalog-program-title">Title</label>
            <input id="catalog-program-title" name="title" type="text" required />

            <label for="catalog-program-description">Description</label>
            <textarea id="catalog-program-description" name="description"></textarea>

            <label for="catalog-program-timezone">Time zone</label>
            <input id="catalog-program-timezone" name="timezone" type="text" required />

            <label for="catalog-program-public">
              <input id="catalog-program-public" name="public" type="checkbox" />
              Publicly listed
            </label>
          </fieldset>

          <fieldset>
            <legend>Eligibility</legend>
            <label for="catalog-program-min-age">Minimum age (optional)</label>
            <input
              id="catalog-program-min-age"
              name="min_age"
              type="number"
              min="0"
              step="1"
            />

            <label for="catalog-program-max-age">Maximum age (optional)</label>
            <input
              id="catalog-program-max-age"
              name="max_age"
              type="number"
              min="0"
              step="1"
            />

            <label for="catalog-program-eligibility">Eligibility text</label>
            <textarea id="catalog-program-eligibility" name="eligibility_text"></textarea>

            <label for="catalog-program-accessibility">Accessibility notes</label>
            <textarea id="catalog-program-accessibility" name="accessibility"></textarea>
          </fieldset>

          <button type="submit">Save program</button>
        </form>
      </section>
    </section>
  `;
}
