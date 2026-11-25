export function renderSessions(): string {
  return `
<section class='parks-sessions' aria-labelledby='parks-sessions-heading'>
  <header>
    <h2 id='parks-sessions-heading'>Sessions and registrations</h2>
    <p>Staff confidential. Session rosters are private to staff only. Minor status and accommodations are never public.</p>
  </header>

  <section aria-labelledby='parks-session-program-heading'>
    <h3 id='parks-session-program-heading'>Choose program and session</h3>
    <label for='parks-session-program'>Program</label>
    <select id='parks-session-program' data-session-program required>
      <option value=''>Select a program</option>
    </select>
    <button type='button' data-session-refresh>Refresh sessions</button>

    <label for='parks-session-list'>Session</label>
    <select id='parks-session-list' data-session-list>
      <option value=''>Select a session</option>
    </select>
  </section>

  <section aria-labelledby='parks-session-create-heading'>
    <h3 id='parks-session-create-heading'>Create session</h3>
    <p>Program comes from the selected program above.</p>
    <form data-session-create>
      <label for='parks-session-create-starts-at'>Starts at with timezone offset</label>
      <input id='parks-session-create-starts-at' name='starts_at' type='text' placeholder='2025-06-01T09:00:00-04:00' autocomplete='off' aria-describedby='parks-session-create-timezone-help' required />
      <label for='parks-session-create-ends-at'>Ends at with timezone offset</label>
      <input id='parks-session-create-ends-at' name='ends_at' type='text' placeholder='2025-06-01T10:30:00-04:00' autocomplete='off' aria-describedby='parks-session-create-timezone-help' required />
      <p id='parks-session-create-timezone-help'>Include an explicit UTC offset, for example -05:00 or +00:00.</p>

      <label for='parks-session-create-capacity'>Capacity</label>
      <input id='parks-session-create-capacity' name='capacity' type='number' min='1' max='100000' step='1' required />

      <label for='parks-session-create-fee-cents'>Fee in cents</label>
      <input id='parks-session-create-fee-cents' name='fee_cents' type='number' min='0' step='1' required />

      <label for='parks-session-create-currency'>Currency</label>
      <select id='parks-session-create-currency' name='currency' required>
        <option value='USD' selected>USD</option>
      </select>

      <button type='submit'>Create session</button>
    </form>
  </section>

  <section aria-labelledby='parks-session-edit-heading'>
    <h3 id='parks-session-edit-heading'>Edit selected session</h3>
    <form data-session-edit>
      <label for='parks-session-edit-capacity'>Capacity</label>
      <input id='parks-session-edit-capacity' name='capacity' type='number' min='1' max='100000' step='1' />

      <label for='parks-session-edit-state'>State</label>
      <select id='parks-session-edit-state' name='state'>
        <option value='' selected>Leave unchanged</option>
        <option value='open'>Open</option>
        <option value='closed'>Closed</option>
        <option value='cancelled'>Cancelled</option>
      </select>

      <label for='parks-session-edit-starts-at'>Starts at with timezone offset</label>
      <input id='parks-session-edit-starts-at' name='starts_at' type='text' placeholder='2025-06-01T09:00:00-04:00' autocomplete='off' />
      <label for='parks-session-edit-ends-at'>Ends at with timezone offset</label>
      <input id='parks-session-edit-ends-at' name='ends_at' type='text' placeholder='2025-06-01T10:30:00-04:00' autocomplete='off' />
      <p>Include an explicit UTC offset in any changed times.</p>

      <button type='submit'>Save session changes</button>
    </form>
  </section>

  <section aria-labelledby='parks-registration-create-heading'>
    <h3 id='parks-registration-create-heading'>Register participant</h3>
    <p>Household and participant are selected in <a href='#parks-households'>Households</a>. Registration uses the selected session above.</p>
    <form data-registration-create>
      <label for='parks-registration-participant'>Selected participant</label>
      <input id='parks-registration-participant' data-registration-participant type='text' readonly placeholder='Select a participant in Households' />
      <p>Selected household is linked from <a href='#parks-households'>Households</a>.</p>
      <button type='submit'>Register participant</button>
    </form>
  </section>

  <section aria-labelledby='parks-session-roster-heading'>
    <h3 id='parks-session-roster-heading'>Session roster</h3>
    <p>Private staff only. Do not share or publish. Minor status and accommodations are never public.</p>
    <table>
      <caption>Private roster for the selected session</caption>
      <thead>
        <tr>
          <th scope='col'>Participant</th>
          <th scope='col'>Household</th>
          <th scope='col'>Registration state</th>
          <th scope='col'>Check-in</th>
        </tr>
      </thead>
      <tbody data-session-roster></tbody>
    </table>
  </section>

  <section aria-labelledby='parks-registration-detail-heading'>
    <h3 id='parks-registration-detail-heading'>Registration details</h3>
    <label for='parks-registration-list'>Registration</label>
    <select id='parks-registration-list' data-registration-list>
      <option value=''>Select a registration</option>
    </select>
    <div data-registration-details aria-live='polite'></div>
  </section>

  <section aria-labelledby='parks-registration-actions-heading'>
    <h3 id='parks-registration-actions-heading'>Cancel or check in</h3>
    <form data-registration-cancel>
      <label for='parks-registration-cancel-reason'>Cancellation reason</label>
      <textarea id='parks-registration-cancel-reason' name='reason' required></textarea>
      <button type='submit'>Cancel registration</button>
    </form>

    <form data-registration-check-in>
      <label for='parks-registration-check-in-reason'>Check-in reason</label>
      <textarea id='parks-registration-check-in-reason' name='reason' required></textarea>
      <button type='submit'>Check in registration</button>
    </form>
  </section>
</section>
`;
}
