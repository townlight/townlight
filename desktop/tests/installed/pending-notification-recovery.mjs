import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RECIPIENT = /^[^@\s]+@example\.test$/i;
const SETTING_KEYS = ['configured', 'enabled', 'host', 'port', 'sender', 'username', 'password_present'];

function check(condition, message) {
  if (!condition) throw new Error(message);
}

function safeError(message) {
  return new Error(message);
}

async function native(context, operation) {
  try {
    return await context.native('service_requests_request', { request: operation });
  } catch {
    throw safeError('native service request failed');
  }
}

function unwrap(value) {
  return value && typeof value === 'object' && Object.hasOwn(value, 'result') ? value.result : value;
}

function snapshotSettings(value) {
  check(value && typeof value === 'object', 'email settings unavailable');
  const settings = {};
  for (const key of SETTING_KEYS) settings[key] = value[key];
  check(typeof settings.configured === 'boolean', 'invalid configured setting');
  check(typeof settings.enabled === 'boolean', 'invalid enabled setting');
  check(typeof settings.host === 'string', 'invalid host setting');
  check(Number.isInteger(settings.port) && settings.port >= 1 && settings.port <= 65535, 'invalid SMTP port');
  check(typeof settings.sender === 'string', 'invalid sender setting');
  check(typeof settings.username === 'string', 'invalid username setting');
  check(typeof settings.password_present === 'boolean', 'invalid password_present setting');
  return settings;
}

async function readSettings(context) {
  const response = unwrap(await native(context, { operation: 'email-settings' }));
  const value = response?.settings ?? response?.email_settings ?? response;
  return snapshotSettings(value);
}

async function saveSettings(context, source, enabled) {
  await native(context, {
    operation: 'save-email-settings',
    payload: {
      enabled,
      host: source.host,
      port: source.port,
      sender: source.sender,
      username: source.username,
    },
  });
}

function sameSettings(left, right) {
  return SETTING_KEYS.every((key) => Object.is(left[key], right[key]));
}

function inside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function timestamp(value) {
  if (typeof value !== 'string' || !/(?:z|[+-]\d{2}:\d{2})$/i.test(value)) return null;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) ? milliseconds : null;
}

async function fixture(context) {
  const root = context.fixtureRoot;
  check(typeof root === 'string' && path.isAbsolute(root), 'fixture root must be absolute');
  let state;
  try {
    state = JSON.parse(await fs.readFile(path.join(root, 'fixture-state.json'), 'utf8'));
  } catch {
    throw safeError('fixture state unavailable');
  }
  const port = state?.ports?.smtp;
  check(Number.isInteger(port) && port >= 1 && port <= 65535, 'fixture SMTP port invalid');
  const mailPath = state?.paths?.mail;
  check(typeof mailPath === 'string' && mailPath.length > 0, 'fixture mail path invalid');
  const mailDir = path.resolve(root, mailPath);
  check(inside(root, mailDir), 'fixture mail path escapes fixture');
  try {
    check((await fs.stat(mailDir)).isDirectory(), 'fixture mail path invalid');
  } catch {
    throw safeError('fixture mail directory unavailable');
  }
  return { root, port, mailDir };
}

function validateOriginal(settings, fixtureState) {
  check(settings.configured === true, 'fixture settings mismatch');
  check(settings.enabled === true, 'fixture settings mismatch');
  check(settings.host === '127.0.0.1', 'fixture settings mismatch');
  check(settings.port === fixtureState.port, 'fixture settings mismatch');
  check(settings.sender === 'fixture@example.test', 'fixture settings mismatch');
  check(settings.username === '', 'fixture settings mismatch');
  check(settings.password_present === false, 'fixture settings mismatch');
}

async function readRequest(context) {
  const response = unwrap(await native(context, {
    operation: 'request', id: context.requestId,
  }));
  const request = response?.request ?? response;
  check(request && typeof request === 'object', 'request projection unavailable');
  return request;
}

function eventFor(request, message) {
  check(Array.isArray(request.events), 'request event projection unavailable');
  const matches = request.events.filter((event) => (
    event?.kind === 'comment'
    && event?.public === true
    && event?.message === message
  ));
  check(matches.length === 1, 'public comment event mismatch');
  return matches[0];
}

function notificationFor(request, eventId) {
  check(Array.isArray(request.notifications), 'request notification projection unavailable');
  const matches = request.notifications.filter((item) => item?.event_id === eventId);
  check(matches.length === 1, 'notification identity mismatch');
  return matches[0];
}

function validateRequestIdentity(context, request) {
  check(request.id === context.requestId, 'request identity changed');
  check(Number.isInteger(request.revision) && request.revision > 0, 'request revision invalid');
  check(request.revision === context.revision, 'request revision changed');
  check(request.state === context.requestState, 'request state changed');
  check(request.tracking === context.tracking, 'tracking changed');
  check(request.contact?.email === context.recipient, 'recipient changed');
}

function validateEvent(context, event) {
  check(event.id === context.eventId, 'event identity changed');
  check(event.kind === 'comment', 'event kind changed');
  check(event.public === true, 'event visibility changed');
  check(event.message === context.message, 'event message changed');
  check(event.created_at === context.eventCreatedAt, 'event timestamp changed');
}

function validateNotification(context, notification) {
  check(notification.id === context.notificationId, 'notification identity changed');
  check(notification.event_id === context.eventId, 'notification event changed');
  check(notification.created_at === context.notificationCreatedAt, 'notification timestamp changed');
}

function messageId(context) {
  return `<${context.notificationId}@townlight.local>`;
}

function metadataMessageIds(metadata) {
  const headers = metadata?.headers;
  check(headers && typeof headers === 'object', 'unsafe mail metadata');
  const ids = headers['message-id'] ?? headers['Message-ID'];
  check(Array.isArray(ids) && ids.every((id) => typeof id === 'string'), 'unsafe mail metadata');
  return ids;
}

async function matchingMail(context) {
  let names;
  try {
    names = await fs.readdir(context.mailDir);
  } catch {
    throw safeError('fixture mail directory unavailable');
  }
  const wanted = messageId(context);
  const found = [];
  for (const name of names) {
    if (!name.endsWith('.json')) continue;
    let text;
    try {
      text = await fs.readFile(path.join(context.mailDir, name), 'utf8');
    } catch {
      continue;
    }
    if (!text.includes(context.notificationId)) continue;
    let metadata;
    try {
      metadata = JSON.parse(text);
    } catch {
      throw safeError('unsafe matching mail metadata');
    }
    if (metadataMessageIds(metadata).includes(wanted)) found.push(metadata);
  }
  return found;
}

async function assertNoMail(context) {
  check((await matchingMail(context)).length === 0, 'unexpected matching mail capture');
}

export async function preparePendingNotification({ native: nativeFn, requestId, fixtureRoot, quiesce }) {
  check(typeof nativeFn === 'function', 'native function required');
  check(typeof requestId === 'string' && UUID.test(requestId), 'request id must be UUID');
  check(typeof quiesce === 'function', 'quiesce function required');
  const context = {
    native: nativeFn,
    requestId,
    fixtureRoot,
    quiesce,
    changed: false,
    restored: false,
  };
  const fixtureState = await fixture(context);
  context.mailDir = fixtureState.mailDir;
  const original = await readSettings(context);
  validateOriginal(original, fixtureState);
  context.original = original;
  try {
    context.changed = true;
    await saveSettings(context, original, false);
    const disabled = await readSettings(context);
    check(sameSettings(disabled, { ...original, enabled: false }), 'settings did not disable');
    await quiesce();
    check(sameSettings(await readSettings(context), { ...original, enabled: false }), 'settings changed during quiesce');

    const initial = await readRequest(context);
    check(initial.id === requestId, 'request identity mismatch');
    check(Number.isInteger(initial.revision) && initial.revision > 0, 'request revision invalid');
    check(typeof initial.tracking === 'string' && initial.tracking.trim().length > 0, 'request tracking invalid');
    check(typeof initial.contact?.email === 'string' && RECIPIENT.test(initial.contact.email), 'request recipient invalid');
    check(typeof initial.state === 'string' && initial.state.length > 0, 'request state invalid');
    context.tracking = initial.tracking;
    context.recipient = initial.contact.email;
    context.requestState = initial.state;

    const message = `Pending recovery ${randomUUID()}`;
    await native(context, {
      operation: 'comment',
      id: requestId,
      payload: { expected_revision: initial.revision, message, public: true },
    });
    const updated = await readRequest(context);
    check(updated.id === requestId, 'request identity changed');
    check(updated.revision === initial.revision + 1, 'request revision did not advance');
    check(updated.state === initial.state, 'request state changed');
    check(updated.tracking === initial.tracking, 'tracking changed');
    check(updated.contact?.email === initial.contact.email, 'recipient changed');
    const event = eventFor(updated, message);
    check(typeof event.id === 'string' && event.id.length > 0, 'event identity invalid');
    check(typeof event.created_at === 'string' && event.created_at.length > 0, 'event timestamp invalid');
    const notification = notificationFor(updated, event.id);
    check(typeof notification.id === 'string' && UUID.test(notification.id), 'notification id must be UUID');
    check(notification.state === 'pending', 'notification did not remain pending');
    check(notification.attempts === 0, 'notification attempts invalid');
    check(notification.next_attempt_at === null, 'notification next attempt invalid');
    check(notification.sent_at === null, 'notification sent timestamp invalid');
    check(typeof notification.created_at === 'string' && notification.created_at.length > 0, 'notification timestamp invalid');

    context.message = message;
    context.revision = updated.revision;
    context.eventId = event.id;
    context.eventCreatedAt = event.created_at;
    context.notificationId = notification.id;
    context.notificationCreatedAt = notification.created_at;
    await assertNoMail(context);
    return context;
  } catch (error) {
    if (context.changed && !context.restored) {
      try {
        await restorePendingNotificationSettings(context);
      } catch {
        throw safeError('pending notification cleanup incomplete');
      }
    }
    throw error instanceof Error ? error : safeError('pending notification preparation failed');
  }
}

export async function readPendingNotification(context) {
  const disabled = await readSettings(context);
  check(sameSettings(disabled, { ...context.original, enabled: false }), 'email settings are not disabled');
  const request = await readRequest(context);
  validateRequestIdentity(context, request);
  const event = eventFor(request, context.message);
  validateEvent(context, event);
  const notification = notificationFor(request, context.eventId);
  validateNotification(context, notification);
  check(notification.state === 'pending', 'notification is not pending');
  check(notification.attempts === 0, 'notification attempts changed');
  check(notification.next_attempt_at === null, 'notification schedule changed');
  check(notification.sent_at === null, 'notification sent prematurely');
  await assertNoMail(context);
  return {
    requestId: context.requestId,
    eventId: context.eventId,
    notificationId: context.notificationId,
    revision: context.revision,
    requestState: context.requestState,
    notification: {
      id: notification.id,
      event_id: notification.event_id,
      state: notification.state,
      attempts: notification.attempts,
      created_at: notification.created_at,
      next_attempt_at: notification.next_attempt_at,
      sent_at: notification.sent_at,
    },
    mailCount: 0,
  };
}

export async function restorePendingNotificationSettings(context) {
  check(context?.original && typeof context.original === 'object', 'original settings unavailable');
  const current = await readSettings(context);
  const original = snapshotSettings(context.original);
  if (context.restored) {
    check(sameSettings(current, original), 'restored settings changed');
    return { restored: true, enabled: true };
  }
  await saveSettings(context, original, original.enabled);
  const verified = await readSettings(context);
  check(sameSettings(verified, original), 'settings restore failed');
  check(verified.configured === true && verified.enabled === true, 'settings restore invalid');
  context.restored = true;
  return { restored: true, enabled: true };
}

const MIME_SCRIPT = String.raw`
import sys, json
from email import policy
from email.parser import BytesParser
from email.utils import getaddresses
msg = BytesParser(policy=policy.default).parsebytes(sys.stdin.buffer.read())
plains = []
for part in msg.walk():
    if part.get_content_type() == 'text/plain' and not part.is_multipart():
        value = part.get_content()
        plains.append(value if isinstance(value, str) else '')
to = [address for _, address in getaddresses(msg.get_all('To', []))]
sender = [address for _, address in getaddresses(msg.get_all('From', []))]
mids = [str(value) for value in msg.get_all('Message-ID', [])]
print(json.dumps({
    'body': plains[0] if len(plains) == 1 else None,
    'plain_count': len(plains),
    'message_ids': mids,
    'to': to,
    'from': sender,
    'subject': str(msg.get('Subject', '')),
}))
`;

function parseMime(raw) {
  const python = process.env.TOWNLIGHT_TEST_PYTHON || 'python';
  let output;
  try {
    output = execFileSync(python, ['-c', MIME_SCRIPT], {
      input: raw,
      encoding: 'utf8',
      timeout: 10000,
      maxBuffer: 1024 * 1024,
    });
  } catch {
    throw safeError('captured MIME parse failed');
  }
  try {
    return JSON.parse(output);
  } catch {
    throw safeError('captured MIME output invalid');
  }
}

function casefold(value) {
  return String(value).toLowerCase();
}

async function capturedMail(context, metadata) {
  const ids = metadataMessageIds(metadata);
  const wanted = messageId(context);
  check(ids.length === 1 && ids[0] === wanted, 'duplicate or altered Message-ID metadata');
  check(Array.isArray(metadata.recipients) && metadata.recipients.length === 1, 'mail recipients invalid');
  check(casefold(metadata.recipients[0]) === casefold(context.recipient), 'mail recipient mismatch');
  check(metadata.mail_from === context.original.sender, 'mail sender mismatch');
  const received = timestamp(metadata.received_at);
  check(received !== null, 'mail received timestamp invalid');
  const eml = metadata.eml;
  check(typeof eml === 'string' && eml.endsWith('.eml') && !eml.includes('/') && !eml.includes('\\'), 'mail filename unsafe');
  check(path.basename(eml) === eml, 'mail filename unsafe');
  const emlPath = path.resolve(context.mailDir, eml);
  check(inside(context.mailDir, emlPath), 'mail path escapes fixture');
  let raw;
  try {
    raw = await fs.readFile(emlPath);
  } catch {
    throw safeError('captured message unavailable');
  }
  return { metadata, received, eml, raw };
}

export async function deliverPendingNotification(context, { timeoutMs = 60000, pollMs = 200 } = {}) {
  const enableStartedAt = Date.now();
  await restorePendingNotificationSettings(context);
  const deadline = Date.now() + timeoutMs;
  let final = null;
  for (;;) {
    const request = await readRequest(context);
    validateRequestIdentity(context, request);
    const event = eventFor(request, context.message);
    validateEvent(context, event);
    const notification = notificationFor(request, context.eventId);
    validateNotification(context, notification);
    if (notification.state === 'sent') {
      check(notification.attempts === 1, 'notification attempts invalid after send');
      check(notification.next_attempt_at === null, 'notification schedule remained after send');
      const sentAt = timestamp(notification.sent_at);
      check(sentAt !== null, 'notification sent timestamp invalid');
      final = { request, notification, sentAt };
      break;
    }
    check((notification.state === 'pending' && notification.attempts === 0) || (notification.state === 'sending' && notification.attempts === 1), 'notification state/attempts invalid');
    check(notification.sent_at === null && notification.next_attempt_at === null, 'notification timestamps changed');
    check(Date.now() < deadline, 'notification delivery timed out');
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }

  const matches = await matchingMail(context);
  check(matches.length === 1, 'expected exactly one matching mail capture');
  const capture = await capturedMail(context, matches[0]);
  check(enableStartedAt <= capture.received, 'mail capture preceded settings restoration');
  check(capture.received <= final.sentAt, 'mail capture occurred after send completion');

  const mime = parseMime(capture.raw);
  check(mime.plain_count === 1 && typeof mime.body === 'string', 'message must contain one text/plain part');
  check(mime.message_ids.length === 1 && mime.message_ids[0] === messageId(context), 'Message-ID mismatch');
  check(mime.to.length === 1 && casefold(mime.to[0]) === casefold(context.recipient), 'To address mismatch');
  check(mime.from.length === 1 && casefold(mime.from[0]) === casefold(context.original.sender), 'From address mismatch');
  check(mime.subject === `Townlight 311 ${context.tracking} update: ${context.requestState}`, 'Subject mismatch');
  const body = mime.body.replace(/\r\n/g, '\n').trim();
  const expectedBody = `Tracking: ${context.tracking}\nState: ${context.requestState}\n\n${context.message}`;
  check(body === expectedBody, 'message body mismatch');
  check(final.notification.event_id === context.eventId, 'notification event changed');

  return {
    passed: true,
    requestId: context.requestId,
    eventId: context.eventId,
    notificationId: context.notificationId,
    notification: { state: 'sent', attempts: 1, sentAt: final.notification.sent_at },
    mail: {
      count: 1,
      file: capture.eml,
      sha256: createHash('sha256').update(capture.raw).digest('hex'),
      receivedAt: capture.metadata.received_at,
    },
    settingsRestored: true,
  };
}
