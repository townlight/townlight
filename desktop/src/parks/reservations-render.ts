export function renderReservations(): string {
  return `
<section aria-labelledby="parks-reservation-title">
  <h2 id="parks-reservation-title">Reservations</h2>
  <p id="parks-reservation-intro">Manage park reservations, booking states, reschedules, availability, and closures. Household selection is linked from the Households area.</p>

  <section aria-labelledby="parks-reservation-resource-heading">
    <h3 id="parks-reservation-resource-heading">Resource and household</h3>

    <div>
      <label for="parks-reservation-resource">Resource</label>
      <select
        id="parks-reservation-resource"
        name="resource"
        data-booking-resource
        required
        aria-describedby="parks-reservation-resource-help"
      >
        <option value="">Select a resource</option>
      </select>
      <p id="parks-reservation-resource-help">Select the resource for this reservation.</p>
    </div>

    <div>
      <button type="button" id="parks-reservation-refresh" data-booking-refresh>
        Refresh resources
      </button>
    </div>

    <div>
      <label for="parks-reservation-household">Household ID</label>
      <input
        id="parks-reservation-household"
        name="household_id"
        data-booking-household
        type="text"
        readonly
        aria-describedby="parks-reservation-household-help"
      />
      <p id="parks-reservation-household-help">
        Choose the household in
        <a href="#parks-households">Households</a>.
        The linked household selection fills this readonly household_id field.
      </p>
    </div>
  </section>

  <section aria-labelledby="parks-reservation-availability-heading">
    <h3 id="parks-reservation-availability-heading">Availability</h3>
    <button type="button" id="parks-reservation-availability" data-booking-availability>
      Check availability
    </button>
    <div
      id="parks-reservation-availability-status"
      data-availability
      role="status"
      aria-live="polite"
    >
      No availability check requested.
    </div>
  </section>

  <section aria-labelledby="parks-reservation-create-heading">
    <h3 id="parks-reservation-create-heading">Create reservation</h3>

    <form id="parks-reservation-create" data-booking-create aria-labelledby="parks-reservation-create-heading">
      <fieldset>
        <legend>Reservation details</legend>

        <p id="parks-reservation-date-help">
          Enter starts_at and ends_at as ISO 8601 date-times with an explicit timezone offset,
          for example 2025-03-09T09:00:00-05:00. When repeats is greater than 1, review each
          occurrence across daylight saving time (DST) because local clock times and offsets may change.
        </p>

        <div>
          <label for="parks-reservation-create-starts-at">Starts at</label>
          <input
            id="parks-reservation-create-starts-at"
            name="starts_at"
            type="text"
            placeholder="2025-03-09T09:00:00-05:00"
            required
            aria-describedby="parks-reservation-date-help"
          />
        </div>

        <div>
          <label for="parks-reservation-create-ends-at">Ends at</label>
          <input
            id="parks-reservation-create-ends-at"
            name="ends_at"
            type="text"
            placeholder="2025-03-09T11:00:00-05:00"
            required
            aria-describedby="parks-reservation-date-help"
          />
        </div>

        <div>
          <label for="parks-reservation-create-purpose">Purpose</label>
          <textarea
            id="parks-reservation-create-purpose"
            name="purpose"
            rows="3"
            aria-describedby="parks-reservation-date-help"
          ></textarea>
        </div>

        <div>
          <label for="parks-reservation-create-repeats">Repeats</label>
          <input
            id="parks-reservation-create-repeats"
            name="repeats"
            type="number"
            min="1"
            max="52"
            value="1"
            required
          />
        </div>

        <div>
          <button type="button" id="parks-reservation-preview" data-preview-occurrences>
            Preview occurrences
          </button>
        </div>

        <div
          id="parks-reservation-occurrences"
          data-occurrences
          role="status"
          aria-live="polite"
        >
          Occurrence previews will appear here as editable individual date pairs.
        </div>

        <div>
          <button type="submit" id="parks-reservation-create-submit">Reserve</button>
        </div>
      </fieldset>
    </form>
  </section>

  <section aria-labelledby="parks-reservation-bookings-heading">
    <h3 id="parks-reservation-bookings-heading">Bookings</h3>

    <div>
      <label for="parks-reservation-booking-list">Booking</label>
      <select id="parks-reservation-booking-list" data-booking-list>
        <option value="">Select a booking</option>
      </select>
    </div>

    <dl id="parks-reservation-booking-details" data-booking-details aria-live="polite">
      <dt>Booking</dt>
      <dd>No booking selected.</dd>
      <dt>Status</dt>
      <dd>&mdash;</dd>
      <dt>Resource</dt>
      <dd>&mdash;</dd>
      <dt>Household</dt>
      <dd>&mdash;</dd>
      <dt>Starts at</dt>
      <dd>&mdash;</dd>
      <dt>Ends at</dt>
      <dd>&mdash;</dd>
    </dl>

    <section aria-labelledby="parks-reservation-transition-heading">
      <h4 id="parks-reservation-transition-heading">Update booking state</h4>
      <form
        id="parks-reservation-transition"
        data-booking-transition
        aria-labelledby="parks-reservation-transition-heading"
      >
        <fieldset>
          <legend>Booking state change</legend>

          <div>
            <label for="parks-reservation-transition-state">State</label>
            <select id="parks-reservation-transition-state" name="state" required>
              <option value="">Select a state</option>
              <option value="confirmed">confirmed</option>
              <option value="rejected">rejected</option>
              <option value="cancelled">cancelled</option>
            </select>
          </div>

          <div>
            <label for="parks-reservation-transition-reason">Reason</label>
            <textarea
              id="parks-reservation-transition-reason"
              name="reason"
              rows="3"
              required
            ></textarea>
          </div>

          <div>
            <button type="submit" id="parks-reservation-transition-submit">Update state</button>
          </div>
        </fieldset>
      </form>
    </section>

    <section aria-labelledby="parks-reservation-reschedule-heading">
      <h4 id="parks-reservation-reschedule-heading">Reschedule booking</h4>
      <form
        id="parks-reservation-reschedule"
        data-booking-reschedule
        aria-labelledby="parks-reservation-reschedule-heading"
      >
        <fieldset>
          <legend>New booking dates</legend>

          <p>
            Use ISO 8601 date-times with an explicit timezone offset. When a booking repeats,
            review each occurrence across daylight saving time (DST).
          </p>

          <div>
            <label for="parks-reservation-reschedule-starts-at">Starts at</label>
            <input
              id="parks-reservation-reschedule-starts-at"
              name="starts_at"
              type="text"
              placeholder="2025-03-09T09:00:00-05:00"
              required
              aria-describedby="parks-reservation-date-help"
            />
          </div>

          <div>
            <label for="parks-reservation-reschedule-ends-at">Ends at</label>
            <input
              id="parks-reservation-reschedule-ends-at"
              name="ends_at"
              type="text"
              placeholder="2025-03-09T11:00:00-05:00"
              required
              aria-describedby="parks-reservation-date-help"
            />
          </div>

          <div>
            <label for="parks-reservation-reschedule-reason">Reason</label>
            <textarea
              id="parks-reservation-reschedule-reason"
              name="reason"
              rows="3"
              required
            ></textarea>
          </div>

          <div>
            <button type="submit" id="parks-reservation-reschedule-submit">Reschedule</button>
          </div>
        </fieldset>
      </form>
    </section>
  </section>

  <section aria-labelledby="parks-reservation-closures-heading">
    <h3 id="parks-reservation-closures-heading">Closures</h3>

    <div>
      <label for="parks-reservation-closure-list">Closure</label>
      <select id="parks-reservation-closure-list" data-closure-list>
        <option value="">Select a closure</option>
      </select>
    </div>

    <section aria-labelledby="parks-reservation-closure-add-heading">
      <h4 id="parks-reservation-closure-add-heading">Add closure</h4>
      <form
        id="parks-reservation-closure-add"
        data-closure-add
        aria-labelledby="parks-reservation-closure-add-heading"
      >
        <fieldset>
          <legend>Closure dates</legend>

          <p>
            Enter closure dates as ISO 8601 date-times with an explicit timezone offset.
            Review repeats across daylight saving time (DST).
          </p>

          <div>
            <label for="parks-reservation-closure-add-starts-at">Starts at</label>
            <input
              id="parks-reservation-closure-add-starts-at"
              name="starts_at"
              type="text"
              placeholder="2025-03-09T09:00:00-05:00"
              required
              aria-describedby="parks-reservation-date-help"
            />
          </div>

          <div>
            <label for="parks-reservation-closure-add-ends-at">Ends at</label>
            <input
              id="parks-reservation-closure-add-ends-at"
              name="ends_at"
              type="text"
              placeholder="2025-03-09T11:00:00-05:00"
              required
              aria-describedby="parks-reservation-date-help"
            />
          </div>

          <div>
            <label for="parks-reservation-closure-add-reason">Reason</label>
            <textarea
              id="parks-reservation-closure-add-reason"
              name="reason"
              rows="3"
              required
            ></textarea>
          </div>

          <div>
            <button type="submit" id="parks-reservation-closure-add-submit">Add closure</button>
          </div>
        </fieldset>
      </form>
    </section>

    <section aria-labelledby="parks-reservation-closure-remove-heading">
      <h4 id="parks-reservation-closure-remove-heading">Remove closure</h4>
      <div>
        <label for="parks-reservation-closure-remove-reason">Removal reason</label>
        <input
          id="parks-reservation-closure-remove-reason"
          name="closure_reason"
          data-closure-reason
          type="text"
          required
        />
      </div>
      <div>
        <button type="button" id="parks-reservation-closure-remove" data-closure-remove>
          Remove selected closure
        </button>
      </div>
    </section>
  </section>
</section>
`;
}
