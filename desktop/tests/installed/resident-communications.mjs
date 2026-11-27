import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { request as playwrightRequest } from 'playwright';

const WAIT_MS = 120_000;
const POLL_MS = 1_000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fail(stage, message) {
  const error = new Error(`resident-communications ${stage}: ${message}`);
  error.stage = stage;
  throw error;
}

function safeError(error) {
  const text = String(error && error.message ? error.message : error);
  return text
    .replace(/https?:\/\/\S+/gi, '[url]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
    .replace(/[A-Za-z0-9_-]{32,}/g, '[redacted]');
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function splitHeadersBody(raw) {
  const match = raw.match(/\r?\n\r?\n/);
  if (!match) return { headerText: raw, body: '' };
  return {
    headerText: raw.slice(0, match.index),
    body: raw.slice(match.index + match[0].length),
  };
}

function parseHeaders(headerText) {
  const headers = {};
  let current = null;
  for (const line of headerText.replace(/\r/g, '').split('\n')) {
    if (/^[ \t]/.test(line) && current) {
      headers[current] += ` ${line.trim()}`;
      continue;
    }
    const index = line.indexOf(':');
    if (index < 0) continue;
    current = line.slice(0, index).trim().toLowerCase();
    headers[current] = line.slice(index + 1).trim();
  }
  return headers;
}

function mimeParam(header, name) {
  const pattern = new RegExp(
    `(?:^|;)\\s*${escapeRegex(name)}\\s*=\\s*(?:"([^"]*)"|([^;\\s]*))`,
    'i',
  );
  const match = String(header || '').match(pattern);
  return match ? (match[1] ?? match[2]) : null;
}

function decodeQuotedPrintable(latin1) {
  const source = String(latin1).replace(/=\r?\n/g, '');
  const bytes = [];
  for (let index = 0; index < source.length; index += 1) {
    const hex = source.slice(index + 1, index + 3);
    if (source[index] === '=' && /^[0-9A-Fa-f]{2}$/.test(hex)) {
      bytes.push(parseInt(hex, 16));
      index += 2;
    } else {
      bytes.push(source.charCodeAt(index) & 0xff);
    }
  }
  return Buffer.from(bytes).toString('utf8');
}

function decodeBase64(text) {
  return Buffer.from(String(text).replace(/\s+/g, ''), 'base64').toString('utf8');
}

function decodeMimeText(raw, depth = 0) {
  if (depth > 6) return null;
  const { headerText, body } = splitHeadersBody(raw);
  const headers = parseHeaders(headerText);
  const contentType = headers['content-type'] || 'text/plain';

  if (/^multipart\//i.test(contentType)) {
    const boundary = mimeParam(contentType, 'boundary');
    if (boundary) {
      for (const chunk of body.split(`--${boundary}`).slice(1)) {
        if (chunk.startsWith('--')) continue;
        const part = chunk.replace(/^\r?\n/, '').replace(/\r?\n$/, '');
        if (!part.trim()) continue;
        const decoded = decodeMimeText(part, depth + 1);
        if (decoded && decoded.trim()) return decoded;
      }
    }
  }

  const encoding = String(headers['content-transfer-encoding'] || '').toLowerCase();
  let text = body;
  if (encoding.includes('quoted-printable')) {
    text = decodeQuotedPrintable(body);
  } else if (encoding.includes('base64')) {
    text = decodeBase64(body);
  }

  if (/^text\/plain/i.test(contentType) || /^text\/html/i.test(contentType)) {
    return text;
  }
  return null;
}

function extractLinks(text) {
  const source = String(text || '').replace(/&amp;/gi, '&');
  const links = source.match(/https?:\/\/[^\s"'<>]+/gi) || [];
  return links.map((link) => link.replace(/[),.;]+$/, ''));
}

function findLink(links, segment) {
  for (const link of links) {
    try {
      const url = new URL(link);
      if (url.pathname.includes(segment)) return url;
    } catch {
      // Ignore non-URL fragments in email bodies.
    }
  }
  return null;
}

function hiddenInput(html, name) {
  const tag = String(html).match(
    new RegExp(`<input[^>]*name=["']${escapeRegex(name)}["'][^>]*>`, 'i'),
  )?.[0];
  if (!tag) return null;
  const value = tag.match(/value=["']([^"']*)["']/i)?.[1];
  return value ?? null;
}

function csrfToken(html, stage) {
  const token = hiddenInput(html, 'csrfmiddlewaretoken');
  if (!token) fail(stage, 'CSRF token missing from form');
  return token;
}

function queryToken(url) {
  return url.searchParams.get('token');
}

function statusUrlFrom(html, base, stage) {
  const match = String(html).match(
    /\/communications\/subscription-command\/[0-9a-f-]{36}\//i,
  );
  if (match) return new URL(match[0], base).toString();
  if (/request\s+(?:was\s+)?completed|request complete/i.test(String(html))) {
    return null;
  }
  fail(stage, 'command status link missing');
}

function exactOrigin(url, base, stage) {
  if (url.origin !== base.origin) {
    fail(stage, `origin mismatch: ${url.origin} != ${base.origin}`);
  }
  return url;
}

async function waitForStatus(context, statusUrl, stage) {
  const deadline = Date.now() + WAIT_MS;
  while (Date.now() < deadline) {
    const response = await context.get(statusUrl, { failOnStatusCode: false });
    const status = response.status();
    const text = await response.text();

    if (/not\s+completed|request unavailable|could not complete/i.test(text)) {
      fail(stage, 'command reported failure');
    }
    if (/request\s+(?:was\s+)?completed|request complete/i.test(text)) {
      return;
    }
    if (status >= 400 && status !== 429) {
      fail(stage, `command status returned HTTP ${status}`);
    }
    await sleep(POLL_MS);
  }
  fail(stage, `timed out after ${WAIT_MS}ms waiting for command completion`);
}

async function listMailJson(mailDir) {
  try {
    const names = await readdir(mailDir);
    return names.filter((name) => name.endsWith('.json'));
  } catch {
    return [];
  }
}

function recipientMatches(metadata, email) {
  const recipients = Array.isArray(metadata?.recipients) ? metadata.recipients : [];
  const toHeaders = Array.isArray(metadata?.headers?.to) ? metadata.headers.to : [];
  const text = [...recipients, ...toHeaders].join(' ').toLowerCase();
  return text.includes(email.toLowerCase());
}

async function waitForConfirmationEmail(mailDir, email, baseline, stage) {
  const deadline = Date.now() + WAIT_MS;
  while (Date.now() < deadline) {
    for (const name of await listMailJson(mailDir)) {
      if (baseline.has(name)) continue;
      let metadata;
      try {
        metadata = JSON.parse(await readFile(path.join(mailDir, name), 'utf8'));
      } catch {
        continue;
      }
      if (!recipientMatches(metadata, email)) continue;

      const emlName = metadata.eml || name.replace(/\.json$/i, '.eml');
      try {
        const raw = await readFile(path.join(mailDir, emlName), 'latin1');
        return { raw, metadata };
      } catch {
        // The fixture may have written metadata just before the eml file.
      }
    }
    await sleep(POLL_MS);
  }
  fail(stage, `timed out after ${WAIT_MS}ms waiting for captured email`);
}

async function submitForm(context, url, fields, stage) {
  const response = await context.post(url, {
    form: fields,
    failOnStatusCode: false,
    headers: { Origin: new URL(url).origin },
  });
  const status = response.status();
  const text = await response.text();
  if (status !== 200) fail(stage, `form submission returned HTTP ${status}`);
  return text;
}

export async function ensureResidentSubscriber({ portalBaseUrl, fixtureRoot, save } = {}) {
  let stage = 'validate';

  try {
    if (!portalBaseUrl) fail(stage, 'portalBaseUrl is required');
    if (!fixtureRoot) fail(stage, 'fixtureRoot is required');

    const base = new URL(portalBaseUrl);
    const mailDir = path.join(fixtureRoot, 'mail');
    const email = `resident-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}@example.test`;
    const baseline = new Set(await listMailJson(mailDir));

    const context = await playwrightRequest.newContext({ baseURL: base.toString() });
    try {
      const subscribeUrl = new URL('/communications/subscribe/', base).toString();

      stage = 'subscribe-form';
      const subscribeGet = await context.get(subscribeUrl, { failOnStatusCode: false });
      if (subscribeGet.status() !== 200) {
        fail(stage, `subscribe page returned HTTP ${subscribeGet.status()}`);
      }
      const subscribeHtml = await subscribeGet.text();
      const subscribeCsrf = csrfToken(subscribeHtml, stage);

      stage = 'subscribe-submit';
      const subscribeResponse = await submitForm(context, subscribeUrl, {
        csrfmiddlewaretoken: subscribeCsrf,
        email,
        topics: 'all',
        language: 'en',
      }, stage);
      const subscribeStatusUrl = statusUrlFrom(subscribeResponse, base, stage);

      stage = 'subscribe-command';
      if (subscribeStatusUrl) await waitForStatus(context, subscribeStatusUrl, stage);

      stage = 'confirmation-email';
      const { raw } = await waitForConfirmationEmail(
        mailDir,
        email,
        baseline,
        stage,
      );
      const plainText = decodeMimeText(raw);
      if (!plainText) fail(stage, 'captured email has no text body');

      const links = extractLinks(plainText);
      const confirmUrl = findLink(links, '/communications/confirm');
      if (!confirmUrl) fail(stage, 'confirmation URL missing from captured email');
      exactOrigin(confirmUrl, base, 'confirmation-url');

      stage = 'confirm-form';
      const confirmGet = await context.get(confirmUrl.toString(), { failOnStatusCode: false });
      if (confirmGet.status() !== 200) {
        fail(stage, `confirmation form returned HTTP ${confirmGet.status()}`);
      }
      const confirmHtml = await confirmGet.text();
      const confirmCsrf = csrfToken(confirmHtml, stage);
      const confirmToken = hiddenInput(confirmHtml, 'token') || queryToken(confirmUrl);
      if (!confirmToken) fail(stage, 'confirmation token missing');

      stage = 'confirm-submit';
      const confirmResponse = await submitForm(context, confirmUrl.toString(), {
        csrfmiddlewaretoken: confirmCsrf,
        token: confirmToken,
      }, stage);
      const confirmStatusUrl = statusUrlFrom(confirmResponse, base, stage);

      stage = 'confirm-command';
      if (confirmStatusUrl) await waitForStatus(context, confirmStatusUrl, stage);

      let preferencesTested = false;
      const preferencesUrl = findLink(links, '/communications/preferences');
      if (preferencesUrl) {
        exactOrigin(preferencesUrl, base, 'preferences-url');
        preferencesTested = true;

        stage = 'preferences-form';
        const preferencesGet = await context.get(preferencesUrl.toString(), {
          failOnStatusCode: false,
        });
        if (preferencesGet.status() !== 200) {
          fail(stage, `preferences form returned HTTP ${preferencesGet.status()}`);
        }
        const preferencesHtml = await preferencesGet.text();
        const preferencesCsrf = csrfToken(preferencesHtml, stage);
        const preferencesToken =
          hiddenInput(preferencesHtml, 'token') || queryToken(preferencesUrl);
        if (!preferencesToken) fail(stage, 'preferences token missing');

        stage = 'preferences-optout';
        const optOutResponse = await submitForm(context, preferencesUrl.toString(), {
          csrfmiddlewaretoken: preferencesCsrf,
          token: preferencesToken,
          topic: 'all',
          language: 'en',
        }, stage);
        const optOutStatusUrl = statusUrlFrom(optOutResponse, base, stage);
        if (optOutStatusUrl) await waitForStatus(context, optOutStatusUrl, stage);

        stage = 'preferences-backin';
        const backInGet = await context.get(preferencesUrl.toString(), {
          failOnStatusCode: false,
        });
        if (backInGet.status() !== 200) {
          fail(stage, `preferences form refresh returned HTTP ${backInGet.status()}`);
        }
        const backInHtml = await backInGet.text();
        const backInCsrf = csrfToken(backInHtml, stage);
        const backInToken =
          hiddenInput(backInHtml, 'token') || queryToken(preferencesUrl);
        if (!backInToken) fail(stage, 'preferences token missing on back-in');

        const backInResponse = await submitForm(context, preferencesUrl.toString(), {
          csrfmiddlewaretoken: backInCsrf,
          token: backInToken,
          topic: 'all',
          language: 'en',
          active: 'on',
        }, stage);
        const backInStatusUrl = statusUrlFrom(backInResponse, base, stage);
        if (backInStatusUrl) await waitForStatus(context, backInStatusUrl, stage);
      }

      stage = 'save';
      const summary = {
        status: 'confirmed',
        confirmed: true,
        active: true,
        emailCount: 1,
        commandStates: {
          subscribe: 'completed',
          confirm: 'completed',
          preferencesOptOut: preferencesTested ? 'completed' : 'not-tested',
          preferencesBackIn: preferencesTested ? 'completed' : 'not-tested',
        },
      };
      if (typeof save === 'function') {
        await save("resident-communications", summary);
      } else if (save && typeof save.save === 'function') {
        await save.save(summary);
      }

      return { email };
    } finally {
      await context.dispose();
    }
  } catch (error) {
    console.error(
      `[resident-communications] failed stage=${stage} reason=${safeError(error)}`,
    );
    throw error;
  }
}
