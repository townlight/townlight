export function renderHouseholds(): string {
  return `
<section id="parks-households" class="parks-households" aria-labelledby="parks-households-heading">
  <header>
    <h2 id="parks-households-heading">Households</h2>
    <p>Staff confidential. Do not share resident information.</p>
  </header>

  <section aria-labelledby="parks-household-search-heading">
    <h3 id="parks-household-search-heading">Find household</h3>
    <form data-household-search>
      <label for="parks-household-search">Search households</label>
      <input id="parks-household-search" name="search" type="search" required />
      <button type="submit">Search</button>
    </form>
    <label for="parks-household-list">Household</label>
    <select id="parks-household-list" data-household-list>
      <option value="">Select a household</option>
    </select>
  </section>

  <section aria-labelledby="parks-household-create-heading">
    <h3 id="parks-household-create-heading">Create household</h3>
    <form data-household-create>
      <label for="parks-household-contact-name">Contact name</label>
      <input id="parks-household-contact-name" name="contact_name" type="text" />

      <label for="parks-household-email">Email</label>
      <input id="parks-household-email" name="email" type="email" />

      <label for="parks-household-phone">Phone</label>
      <input id="parks-household-phone" name="phone" type="tel" />

      <label for="parks-household-address">Address</label>
      <input id="parks-household-address" name="address" type="text" />

      <label for="parks-household-language">Language</label>
      <select id="parks-household-language" name="language">
        <option value="en" selected>English</option>
      </select>

      <button type="submit">Create household</button>
    </form>
  </section>

  <section aria-labelledby="parks-participant-heading">
    <h3 id="parks-participant-heading">Participants</h3>
    <label for="parks-participant-list">Participant</label>
    <select id="parks-participant-list" data-participant-list>
      <option value="">Select a participant</option>
    </select>
    <button type="button" data-new-participant>New participant</button>

    <form data-participant>
      <label for="parks-participant-name">Name</label>
      <input id="parks-participant-name" name="name" type="text" />

      <label for="parks-participant-birth-date">Birth date</label>
      <input id="parks-participant-birth-date" name="birth_date" type="date" />

      <label for="parks-participant-accommodations">Accommodations</label>
      <textarea id="parks-participant-accommodations" name="accommodations"></textarea>

      <button type="submit">Save participant</button>
    </form>
  </section>
</section>
`;
}
