export function renderCommunications(): string {
  return `
    <main class="workflow-editor" data-comms-view aria-labelledby="comms-heading">
      <h2 id="comms-heading">Communications</h2>
      <p data-status role="status" aria-live="polite"></p>
      <section aria-labelledby="comms-queue-heading">
        <h3 id="comms-queue-heading">Article queue</h3>
        <button type="button" data-refresh>Refresh articles</button>
        <button type="button" data-new>New article</button>
        <ul data-articles aria-label="Articles"></ul>
      </section>
      <section aria-labelledby="comms-draft-heading">
        <h3 id="comms-draft-heading">Draft article</h3>
        <p>Archive the published revision in Records before editing, correcting, or withdrawing.</p>
        <form data-draft>
          <fieldset>
            <legend>Article content</legend>
            <label for="comms-title">Title</label>
            <input id="comms-title" name="title" type="text" required />
            <label for="comms-body">Body</label>
            <textarea id="comms-body" name="body" required></textarea>
            <label for="comms-kind">Kind</label>
            <select id="comms-kind" name="kind" required>
              <option value="">Select kind</option>
              <option value="meeting_summary">Meeting summary</option>
              <option value="ordinance_explainer">Ordinance explainer</option>
              <option value="announcement">Announcement</option>
              <option value="faq">FAQ</option>
              <option value="newsletter">Newsletter</option>
            </select>
            <label for="comms-language">Language code</label>
            <input id="comms-language" name="language" type="text" value="en" required />
          </fieldset>
          <fieldset>
            <legend>Sources</legend>
            <label for="comms-source-kind">Source kind</label>
            <select id="comms-source-kind" name="source_kind">
              <option value="">Select source kind</option>
              <option value="meetings">Meetings</option>
              <option value="code">Code</option>
              <option value="notice">Notice</option>
              <option value="311">311</option>
              <option value="parks">Parks</option>
            </select>
            <label for="comms-source-id">Source ID</label>
            <input id="comms-source-id" name="source_id" type="text" />
            <button type="button" data-source-lookup>Look up source</button>
            <button type="button" data-source-add>Add selected source</button>
            <ul data-sources aria-label="Selected sources"></ul>
            <p>Selected sources are checked against public records.</p>
          </fieldset>
          <fieldset>
            <legend>Accessibility review</legend>
            <button type="button" data-access-review>Check accessibility</button>
            <pre data-access-report aria-label="Accessibility report"></pre>
            <label for="comms-access-reviewed">
              <input id="comms-access-reviewed" name="access_reviewed" type="checkbox" required />
              I reviewed accessibility findings; source approval handled separately.
            </label>
          </fieldset>
          <fieldset>
            <legend>Translation provenance</legend>
            <label for="comms-translation-source-language">Source language</label>
            <input id="comms-translation-source-language" name="translation_source_language" type="text" />
            <label for="comms-translation-method">Translation method</label>
            <input id="comms-translation-method" name="translation_method" type="text" />
            <label for="comms-translation-reviewer">Translation reviewer</label>
            <input id="comms-translation-reviewer" name="translation_reviewer" type="text" />
            <label for="comms-translation-original-text">Original text</label>
            <textarea id="comms-translation-original-text" name="translation_original_text"></textarea>
          </fieldset>
          <button type="submit">Save revision</button>
        </form>
        <button type="button" data-preview-draft>Preview draft</button>
        <div data-preview aria-live="polite" aria-label="Draft preview"></div>
      </section>
      <section aria-labelledby="comms-current-heading">
        <h3 id="comms-current-heading">Selected article</h3>
        <div data-current aria-live="polite"></div>
        <form data-review>
          <fieldset>
            <legend>Review article</legend>
            <label for="comms-review-note">Review note</label>
            <textarea id="comms-review-note" name="note"></textarea>
            <button type="submit">Send for review</button>
          </fieldset>
        </form>
        <label for="comms-approve-confirm">
          <input id="comms-approve-confirm" name="approve_confirm" type="checkbox" data-approve-confirm required />
          I confirm this revision is ready to approve.
        </label>
        <button type="button" data-approve>Approve revision</button>
      </section>
      <section aria-labelledby="comms-schedule-heading">
        <h3 id="comms-schedule-heading">Schedule</h3>
        <form data-schedule>
          <fieldset>
            <legend>Publication schedule</legend>
            <label for="comms-due-at">Due at</label>
            <input id="comms-due-at" name="due_at" type="datetime-local" required />
            <label for="comms-website">
              <input id="comms-website" name="website" type="checkbox" checked /> Website
            </label>
            <label for="comms-email">
              <input id="comms-email" name="email" type="checkbox" /> Email
            </label>
            <label for="comms-action">Action</label>
            <select id="comms-action" name="action" required>
              <option value="">Select action</option>
              <option value="publish">Publish</option>
              <option value="correct">Correct</option>
              <option value="withdraw">Withdraw</option>
            </select>
            <label for="comms-schedule-confirm">
              <input id="comms-schedule-confirm" name="confirm" type="checkbox" required />
              I confirm this scheduled action.
            </label>
            <button type="submit">Schedule article</button>
          </fieldset>
        </form>
      </section>
      <section aria-labelledby="comms-history-heading">
        <h3 id="comms-history-heading">Revision history</h3>
        <pre data-history aria-label="Revision history"></pre>
      </section>
      <section aria-labelledby="comms-attachments-heading">
        <h3 id="comms-attachments-heading">Attachments</h3>
        <form data-attachment>
          <fieldset>
            <legend>Add attachment</legend>
            <label for="comms-attachment-file">File</label>
            <input id="comms-attachment-file" name="file" type="file" required />
            <label for="comms-attachment-public">
              <input id="comms-attachment-public" name="public" type="checkbox" /> Public
            </label>
            <button type="submit">Add attachment</button>
          </fieldset>
        </form>
        <ul data-attachments aria-label="Article attachments"></ul>
      </section>
      <section aria-labelledby="comms-records-heading">
        <h3 id="comms-records-heading">Records</h3>
        <button type="button" data-archive-records>Archive published revision in Records</button>
        <div data-records aria-live="polite"></div>
      </section>
    </main>
  `;
}
