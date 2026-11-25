export function createEmailSettings(call: (operation: string, extra?: Record<string, unknown>) => Promise<any>) {
  const bound = new WeakSet<HTMLElement>();

  function render(): string {
    return `
      <details>
        <summary>Notification email settings</summary>
        <form data-email-settings>
        <label>
          <input type="checkbox" name="enabled" />
          Enabled
        </label>
        <label>
          Host
          <input type="text" name="host" required autocomplete="off" />
        </label>
        <label>
          Port
          <input type="number" name="port" value="587" min="1" max="65535" />
        </label>
        <label>
          Sender email
          <input type="email" name="sender" autocomplete="off" />
        </label>
        <label>
          Username
          <input type="text" name="username" autocomplete="username" />
        </label>
        <label>
          Password
          <input
            type="password"
            name="password"
            autocomplete="new-password"
            placeholder="Leave blank to keep current password"
          />
        </label>
        <span data-password-present></span>
        <label>
          <input type="checkbox" name="clear_password" />
          Clear saved password
        </label>
        <button type="submit">Save</button>
        <div role="status" aria-live="polite"></div>
        </form>
      </details>
    `;
  }

  function bind(root: HTMLElement): void {
    if (bound.has(root)) return;
    bound.add(root);

    const form = root.matches('[data-email-settings]')
      ? (root as HTMLFormElement)
      : root.querySelector<HTMLFormElement>('[data-email-settings]');

    if (!form) return;

    const enabled = form.querySelector<HTMLInputElement>('input[name="enabled"]');
    const host = form.querySelector<HTMLInputElement>('input[name="host"]');
    const port = form.querySelector<HTMLInputElement>('input[name="port"]');
    const sender = form.querySelector<HTMLInputElement>('input[name="sender"]');
    const username = form.querySelector<HTMLInputElement>('input[name="username"]');
    const password = form.querySelector<HTMLInputElement>('input[name="password"]');
    const clearPassword = form.querySelector<HTMLInputElement>('input[name="clear_password"]');
    const passwordPresent = form.querySelector<HTMLElement>('[data-password-present]');
    const status = form.querySelector<HTMLElement>('[role="status"]');
    const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]');

    function setStatus(message: string): void {
      if (status) status.textContent = message;
    }

    function setPending(pending: boolean): void {
      if (submit) submit.disabled = pending;
    }

    function setPasswordPresent(present: boolean): void {
      if (passwordPresent) {
        passwordPresent.textContent = present ? 'Password is set.' : 'No password is set.';
      }
    }

    function errorMessage(error: unknown, fallback: string): string {
      if (error && typeof error === 'object' && 'message' in error) {
        const message = (error as { message?: unknown }).message;
        if (typeof message === 'string' && message.trim()) return message;
      }
      return fallback;
    }

    async function load(): Promise<void> {
      setPending(true);
      try {
        const data = await call('email-settings');
        if (data && typeof data === 'object') {
          if (enabled) enabled.checked = Boolean(data.enabled);
          if (host && data.host != null) host.value = String(data.host);
          if (port && data.port != null) port.value = String(data.port);
          if (sender && data.sender != null) sender.value = String(data.sender);
          if (username && data.username != null) username.value = String(data.username);
          setPasswordPresent(Boolean(data.password_present));
        }
      } catch (error) {
        setStatus(errorMessage(error, 'Unable to load email settings.'));
      } finally {
        setPending(false);
      }
    }

    form.addEventListener('submit', async (event: Event) => {
      event.preventDefault();

      if (submit && submit.disabled) return;

      const passwordChanged = Boolean(password && password.value !== '');
      const clearRequested = Boolean(clearPassword && clearPassword.checked);

      const payload: Record<string, unknown> = {
        enabled: enabled ? enabled.checked : false,
        host: host ? host.value.trim() : '',
        port: port && port.value !== '' ? Number(port.value) : 587,
        sender: sender ? sender.value.trim() : '',
        username: username ? username.value.trim() : '',
        clear_password: clearRequested
      };

      if (passwordChanged) {
        payload.password = password!.value;
      }

      setPending(true);
      setStatus('Saving email settings...');

      try {
        await call('save-email-settings', { payload });

        if (password) password.value = '';
        if (clearPassword) clearPassword.checked = false;

        if (passwordChanged) {
          setPasswordPresent(true);
        } else if (clearRequested) {
          setPasswordPresent(false);
        }

        setStatus('Email settings saved.');
      } catch (error) {
        setStatus(errorMessage(error, 'Unable to save email settings.'));
      } finally {
        setPending(false);
      }
    });

    void load();
  }

  return { render, bind };
}