export function renderServiceRequests(isAdmin: boolean): string {
  const adminForm = isAdmin
    ? `
        <form data-category>
          <fieldset>
            <legend>Category configuration</legend>
            <label for="sr-category-code">Code</label>
            <input id="sr-category-code" name="code" type="text" required />
            <label for="sr-category-name">Name</label>
            <input id="sr-category-name" name="name" type="text" required />
            <label for="sr-category-department">Department</label>
            <input id="sr-category-department" name="department" type="text" required />
            <label for="sr-category-active">
              <input id="sr-category-active" name="active" type="checkbox" /> Active
            </label>
            <button type="submit">Save category</button>
          </fieldset>
        </form>`
    : "";

  return `
    <main class="workflow-editor" data-service-requests-view>
      <h2>Service requests</h2>
      <form data-filter>
        <fieldset>
          <legend>Queue filter</legend>
          <label for="sr-filter-department">Department</label>
          <select id="sr-filter-department" name="department">
            <option value="">All departments</option>
          </select>
          <label for="sr-filter-state">State</label>
          <select id="sr-filter-state" name="state">
            <option value="">All states</option>
            <option value="submitted">Submitted</option>
            <option value="triaged">Triaged</option>
            <option value="assigned">Assigned</option>
            <option value="in_progress">In progress</option>
            <option value="resolved">Resolved</option>
            <option value="closed">Closed</option>
            <option value="rejected">Rejected</option>
            <option value="duplicate">Duplicate</option>
            <option value="reopened">Reopened</option>
          </select>
          <button type="submit">Apply filters</button>
        </fieldset>
      </form>
      <table>
        <caption>Request queue</caption>
        <thead>
          <tr><th scope="col">Request</th><th scope="col">Description</th><th scope="col">Department</th><th scope="col">State</th></tr>
        </thead>
        <tbody data-requests></tbody>
      </table>
      <nav aria-label="Request pages">
        <button type="button" data-prev>Previous</button>
        <p data-page></p>
        <button type="button" data-next>Next</button>
      </nav>
      <form data-create>
        <fieldset>
          <legend>Create service request</legend>
          <label for="sr-create-category">Category</label>
          <select id="sr-create-category" name="category" required>
            <option value="">Select category</option>
          </select>
          <label for="sr-create-description">Description</label>
          <textarea id="sr-create-description" name="description" required></textarea>
          <label for="sr-create-location">Location</label>
          <input id="sr-create-location" name="location" type="text" required />
          <label for="sr-create-contact-name">Contact name</label>
          <input id="sr-create-contact-name" name="contact_name" type="text" />
          <label for="sr-create-contact-email">Contact email</label>
          <input id="sr-create-contact-email" name="contact_email" type="email" />
          <label for="sr-create-contact-phone">Contact phone</label>
          <input id="sr-create-contact-phone" name="contact_phone" type="tel" />
          <button type="submit">Create request</button>
        </fieldset>
      </form>
      <p data-status role="status" aria-live="polite"></p>
      <section data-detail aria-label="Service request detail"></section>
      <section data-tracking hidden aria-label="Private tracking"></section>
      ${adminForm}
    </main>
  `;
}

export function renderDetailForms(): string {
  return `
    <div class="workflow-editor">
      <h3 data-detail-title>Selected request</h3>
      <p data-detail-meta></p>
      <form data-transition>
        <fieldset>
          <legend>Transition request</legend>
          <label for="sr-transition-target">Target state</label>
          <select id="sr-transition-target" name="target" required>
            <option value="">Select target state</option>
            <option value="triaged">Triaged</option>
            <option value="assigned">Assigned</option>
            <option value="in_progress">In progress</option>
            <option value="resolved">Resolved</option>
            <option value="closed">Closed</option>
            <option value="rejected">Rejected</option>
            <option value="duplicate">Duplicate</option>
            <option value="reopened">Reopened</option>
          </select>
          <label for="sr-transition-reason">Reason</label>
          <textarea id="sr-transition-reason" name="reason" required></textarea>
          <label for="sr-transition-department">Department</label>
          <input id="sr-transition-department" name="department" type="text" />
          <label for="sr-transition-assignee">Assignee</label>
          <select id="sr-transition-assignee" name="assignee">
            <option value="">Select assignee</option>
          </select>
          <label for="sr-transition-priority">Priority</label>
          <select id="sr-transition-priority" name="priority">
            <option value="">Select priority</option>
            <option value="low">Low</option>
            <option value="normal">Normal</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
          <label for="sr-transition-due">Due at</label>
          <input id="sr-transition-due" name="due_at" type="datetime-local" />
          <label for="sr-transition-duplicate">Duplicate of</label>
          <input id="sr-transition-duplicate" name="duplicate_of" type="text" />
          <button type="submit">Transition request</button>
        </fieldset>
      </form>
      <form data-comment>
        <fieldset>
          <legend>Add comment</legend>
          <label for="sr-comment-message">Message</label>
          <textarea id="sr-comment-message" name="message" required></textarea>
          <label for="sr-comment-public">
            <input id="sr-comment-public" name="public" type="checkbox" /> Public
          </label>
          <button type="submit">Add comment</button>
        </fieldset>
      </form>
      <form data-attach>
        <fieldset>
          <legend>Attach file</legend>
          <label for="sr-attach-file">File</label>
          <input id="sr-attach-file" name="file" type="file" accept="image/png,image/jpeg,application/pdf,text/plain" required />
          <label for="sr-attach-public">
            <input id="sr-attach-public" name="public" type="checkbox" /> Public
          </label>
          <button type="submit">Attach file</button>
        </fieldset>
      </form>
      <div>
        <button type="button" data-refresh-detail>Refresh detail</button>
        <button type="button" data-archive>Archive</button>
      </div>
      <section>
        <h3>Events</h3>
        <ol data-events></ol>
      </section>
      <section>
        <h3>Attachments</h3>
        <ul data-attachments></ul>
      </section>
      <section>
        <h3>Notification delivery</h3>
        <p>SMTP acceptance is Sent; failures and uncertain outcomes remain visible in the notification state.</p>
        <ul data-delivery></ul>
      </section>
    </div>
  `;
}

export function fillSelect(
  select: HTMLSelectElement | null,
  items: any[],
  value: (item: any) => string,
  label: (item: any) => string,
  placeholder: string,
): void {
  if (!select) return;
  const previous = select.value;
  const doc = select.ownerDocument;
  select.replaceChildren();
  const first = doc.createElement("option");
  first.value = "";
  first.textContent = placeholder;
  select.append(first);
  for (const item of items) {
    const option = doc.createElement("option");
    option.value = value(item);
    option.textContent = label(item);
    select.append(option);
  }
  if (Array.from(select.options).some((option) => option.value === previous)) select.value = previous;
}

export function renderQueueInto(body: HTMLTableSectionElement | null, items: any[]): void {
  if (!body) return;
  const doc = body.ownerDocument;
  body.replaceChildren();
  for (const item of items) {
    const row = doc.createElement("tr");
    const requestCell = doc.createElement("td");
    const open = doc.createElement("button");
    open.type = "button";
    open.dataset.open = String(item?.id ?? "");
    open.textContent = String(item?.tracking ?? item?.id ?? "");
    requestCell.append(open);
    row.append(requestCell);
    for (const value of [item?.description, item?.department, item?.state]) {
      const cell = doc.createElement("td");
      cell.textContent = String(value ?? "");
      row.append(cell);
    }
    body.append(row);
  }
}

export function renderEventsInto(list: HTMLOListElement | null, events: any[]): void {
  if (!list) return;
  const doc = list.ownerDocument;
  list.replaceChildren();
  for (const event of events) {
    const item = doc.createElement("li");
    item.textContent = [event?.kind, event?.message, event?.actor, event?.public ? "public" : "private"]
      .filter((part) => part !== undefined && part !== null && part !== "")
      .map(String)
      .join(" · ");
    list.append(item);
  }
}

export function renderAttachmentsInto(list: HTMLUListElement | null, attachments: any[]): void {
  if (!list) return;
  const doc = list.ownerDocument;
  list.replaceChildren();
  for (const attachment of attachments) {
    const item = doc.createElement("li");
    const label = doc.createElement("span");
    label.textContent = [
      attachment?.name,
      attachment?.media_type,
      attachment?.size === undefined ? "" : `${String(attachment.size)} bytes`,
      attachment?.sha256,
      attachment?.public ? "public" : "private",
    ].filter((part) => part !== undefined && part !== null && part !== "").map(String).join(" · ");
    const download = doc.createElement("button");
    download.type = "button";
    download.dataset.download = String(attachment?.id ?? "");
    download.textContent = "Download";
    item.append(label, download);
    list.append(item);
  }
}

export function renderDeliveryInto(list: HTMLUListElement | null, notifications: any[]): void {
  if (!list) return;
  const doc = list.ownerDocument;
  list.replaceChildren();
  if (notifications.length === 0) {
    const item = doc.createElement("li");
    item.textContent = "No email notifications queued.";
    list.append(item);
    return;
  }
  for (const notification of notifications) {
    const item = doc.createElement("li");
    item.textContent = [
      `State: ${String(notification?.state ?? "unknown")}`,
      `Attempts: ${String(notification?.attempts ?? 0)}`,
      `Next attempt: ${String(notification?.next_attempt_at ?? "none")}`,
      `Sent: ${String(notification?.sent_at ?? "not yet")}`,
    ].join(" · ");
    list.append(item);
  }
}

export function renderTrackingInto(section: HTMLElement | null, tracking: string, token: string): void {
  if (!section) return;
  const doc = section.ownerDocument;
  section.replaceChildren();
  section.hidden = false;
  const heading = doc.createElement("h3");
  heading.textContent = "Private tracking";
  const warning = doc.createElement("p");
  warning.textContent = "Keep this private. The resident token is shown only once and grants access to this request.";
  const trackingText = doc.createElement("p");
  trackingText.textContent = `Tracking: ${tracking || "Unavailable"}`;
  const tokenText = doc.createElement("p");
  tokenText.textContent = `Resident token (shown once): ${token || "Unavailable"}`;
  const copy = doc.createElement("button");
  copy.type = "button";
  copy.dataset.copyTracking = "";
  copy.textContent = "Copy tracking";
  copy.disabled = !tracking;
  section.append(heading, warning, trackingText, tokenText, copy);
}
