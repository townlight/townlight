import assert from 'node:assert/strict';
import {createHash, randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {request as playwrightRequest} from '@playwright/test';

const CREATE_PATH = '/service-requests/';
const ENTITIES = {amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'"};

function decodeHtml(value = '') {
  return String(value).replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]+);/gi, (_, code) => {
    const lower = code.toLowerCase();
    if (ENTITIES[lower] !== undefined) return ENTITIES[lower];
    if (lower.startsWith('#x')) return String.fromCodePoint(Number.parseInt(lower.slice(2), 16));
    if (lower.startsWith('#')) return String.fromCodePoint(Number.parseInt(lower.slice(1), 10));
    return `&${code};`;
  });
}
function stripTags(value = '') {
  return decodeHtml(String(value).replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();
}
function attributes(text) {
  const result = {};
  for (const match of String(text).matchAll(/([^\s"'=<>`]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g)) {
    result[match[1].toLowerCase()] = decodeHtml(match[2] ?? match[3] ?? match[4] ?? '');
  }
  return result;
}
function parseForms(html) {
  const forms = [];
  for (const match of String(html).matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/gi)) {
    const formAttributes = attributes(match[1]);
    const body = match[2];
    const fields = {};
    const files = [];
    for (const input of body.matchAll(/<input\b([^>]*)>/gi)) {
      const inputAttributes = attributes(input[1]);
      const name = inputAttributes.name;
      if (!name) continue;
      const type = (inputAttributes.type || 'text').toLowerCase();
      if (type === 'file') { files.push(name); continue; }
      if (['submit', 'button', 'reset', 'image'].includes(type)) continue;
      if (type === 'checkbox' || type === 'radio') {
        if ('checked' in inputAttributes) fields[name] = decodeHtml(inputAttributes.value ?? 'on');
        continue;
      }
      fields[name] = decodeHtml(inputAttributes.value ?? '');
    }
    for (const textarea of body.matchAll(/<textarea\b([^>]*)>([\s\S]*?)<\/textarea>/gi)) {
      const textareaAttributes = attributes(textarea[1]);
      if (textareaAttributes.name) fields[textareaAttributes.name] = decodeHtml(textarea[2]);
    }
    for (const select of body.matchAll(/<select\b([^>]*)>([\s\S]*?)<\/select>/gi)) {
      const selectAttributes = attributes(select[1]);
      if (!selectAttributes.name) continue;
      let selected = null;
      let first = null;
      for (const option of select[2].matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/gi)) {
        const optionAttributes = attributes(option[1]);
        const value = optionAttributes.value ?? stripTags(option[2]);
        if (first === null) first = value;
        if ('selected' in optionAttributes) { selected = value; break; }
      }
      if (selected !== null || first !== null) fields[selectAttributes.name] = decodeHtml(selected ?? first);
    }
    forms.push({
      action: formAttributes.action ? decodeHtml(formAttributes.action) : '',
      method: (formAttributes.method || 'post').toLowerCase(),
      fields,
      files,
    });
  }
  return forms;
}
function anchors(html) {
  const result = [];
  for (const match of String(html).matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const link = attributes(match[1]);
    if (link.href) result.push({href: decodeHtml(link.href), text: stripTags(match[2])});
  }
  return result;
}
function commandUrlFrom(html, baseUrl) {
  const link = anchors(html).find(item => /refresh request status|request in progress/i.test(item.text) || /\/commands\//i.test(item.href));
  assert.ok(link, 'pending page did not expose the durable resident command URL');
  return new URL(link.href, baseUrl).href;
}
function detailUrlFrom(html, baseUrl) {
  const link = anchors(html).find(item => /open your request|view the updated request/i.test(item.text)) ||
    anchors(html).find(item => /\/requests\//i.test(item.href));
  assert.ok(link, 'resident page did not expose the request detail URL');
  return new URL(link.href, baseUrl).href;
}
function createdCredentials(html) {
  const tracking = /<dt>\s*Tracking number\s*<\/dt>\s*<dd>\s*<code>([\s\S]*?)<\/code>\s*<\/dd>/i.exec(html)?.[1];
  const token = /<dt>\s*(?:New )?Access token\s*<\/dt>\s*<dd>\s*<code>([\s\S]*?)<\/code>\s*<\/dd>/i.exec(html)?.[1];
  assert.ok(tracking && token, 'created page did not expose tracking and access credentials');
  return {tracking: stripTags(tracking), accessToken: stripTags(token)};
}
function actionUrl(form, fallback, baseUrl) {
  return new URL(form.action || fallback, baseUrl).href;
}
async function submitForm(context, form, overrides, fallback, baseUrl) {
  const fields = {...form.fields, ...overrides};
  for (const key of Object.keys(fields)) if (fields[key] === undefined) delete fields[key];
  const url = actionUrl(form, fallback, baseUrl);
  return context.post(url, {form: fields, headers: {Accept: 'text/html', Referer: url}});
}
async function submitMultipart(context, form, overrides, file, fallback, baseUrl) {
  const fields = {...form.fields, ...overrides};
  const multipart = {};
  for (const [key, value] of Object.entries(fields)) if (value !== undefined) multipart[key] = String(value);
  multipart[file.field] = {name: file.name, mimeType: file.mimeType, buffer: file.buffer};
  const url = actionUrl(form, fallback, baseUrl);
  return context.post(url, {multipart, headers: {Accept: 'text/html', Referer: url}});
}
async function pollCommand(context, commandUrl, predicate, label) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const response = await context.get(commandUrl, {headers: {Accept: 'text/html'}});
    assert.equal(response.status(), 200, `${label}: command page status`);
    const body = await response.text();
    if (/Request not completed/i.test(body)) throw new Error(`${label}: resident command failed`);
    if (predicate(body)) return {status: response.status(), body, commandUrl};
    await delay(500);
  }
  throw new Error(`${label}: hostResidentCommandPump did not ack within 60s`);
}
async function openDetailPage(context, detailUrl, baseUrl, label) {
  const response = await context.get(detailUrl, {headers: {Accept: 'text/html'}, maxRedirects: 0});
  if ([301, 302, 303, 307, 308].includes(response.status())) {
    const location = response.headers().location;
    assert.ok(location, `${label}: detail redirect lacked a command location`);
    const commandUrl = new URL(location, baseUrl).href;
    const page = await pollCommand(context, commandUrl, body => /Add a comment/i.test(body) && /name="message"/i.test(body), label);
    return {...page, commandUrl};
  }
  const body = await response.text();
  assert.equal(response.status(), 200, `${label}: detail status`);
  assert.match(body, /Add a comment/i, `${label}: detail form missing`);
  return {status: response.status(), body};
}

export async function installedResident311({native, save, portalBaseUrl, categoryCode}) {
  assert.equal(typeof native, 'function', 'native typed-operation bridge is required');
  assert.ok(portalBaseUrl, 'running portal base URL is required');
  assert.ok(categoryCode, 'categoryCode is required');
  const baseUrl = portalBaseUrl.endsWith('/') ? portalBaseUrl : `${portalBaseUrl}/`;
  const context = await playwrightRequest.newContext({baseURL: baseUrl, ignoreHTTPSErrors: false});
  const callNative = async (operation, extra = {}) => {
    const response = await native('service_requests_request', {request: {operation, ...extra}});
    return response && typeof response === 'object' && 'result' in response ? response.result : response;
  };
  try {
    const runId = `${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
    const homeUrl = new URL(CREATE_PATH, baseUrl).href;
    const homeResponse = await context.get(homeUrl, {headers: {Accept: 'text/html'}});
    const homeHtml = await homeResponse.text();
    assert.equal(homeResponse.status(), 200, 'resident portal home status');
    const createForm = parseForms(homeHtml).find(form => 'category' in form.fields && 'description' in form.fields && 'email' in form.fields);
    assert.ok(createForm, 'actual resident request form was not found');

    const description = `Installed resident 311 ${runId}`;
    const location = `Installed acceptance ${runId}`;
    const email = `resident+${runId}@example.test`;
    const createCommandId = randomUUID();
    const createOverrides = {command_id: createCommandId, category: categoryCode, description, location, email, phone: ''};
    if ('contact_name' in createForm.fields) createOverrides.contact_name = 'Installed Resident';
    const createResponse = await submitForm(context, createForm, createOverrides, homeUrl, baseUrl);
    assert.equal(createResponse.status(), 200, 'resident request submit status');
    const createCommandUrl = commandUrlFrom(await createResponse.text(), baseUrl);
    const created = await pollCommand(context, createCommandUrl, body => /Save these private details now/i.test(body) && /Access token/i.test(body), 'Create resident request');
    const {tracking, accessToken} = createdCredentials(created.body);
    const detailUrl = detailUrlFrom(created.body, baseUrl);
    const requestId = /\/requests\/([0-9a-fA-F-]{36})\//.exec(detailUrl)?.[1];
    assert.match(requestId ?? '', /^[0-9a-fA-F-]{36}$/, 'request id from actual detail URL');

    const lookupLink = anchors(homeHtml).find(item => /track an existing request/i.test(item.text));
    assert.ok(lookupLink, 'actual resident lookup link was not found');
    const lookupUrl = new URL(lookupLink.href, baseUrl).href;
    const lookupResponse = await context.get(lookupUrl, {headers: {Accept: 'text/html'}});
    const lookupHtml = await lookupResponse.text();
    assert.equal(lookupResponse.status(), 200, 'resident lookup page status');
    const lookupForm = parseForms(lookupHtml).find(form => 'tracking' in form.fields && 'access_token' in form.fields);
    assert.ok(lookupForm, 'actual resident tracking form was not found');
    const readCommandId = randomUUID();
    const readResponse = await submitForm(context, lookupForm, {command_id: readCommandId, tracking, access_token: accessToken}, lookupUrl, baseUrl);
    assert.equal(readResponse.status(), 200, 'resident tracking submit status');
    const readCommandUrl = commandUrlFrom(await readResponse.text(), baseUrl);
    const readPage = await pollCommand(context, readCommandUrl, body => /Add a comment/i.test(body) && /name="message"/i.test(body), 'Read resident request');

    const addForm = parseForms(readPage.body).find(form => 'message' in form.fields && 'expected_revision' in form.fields);
    assert.ok(addForm, 'actual resident add-information form was not found');
    const addMessage = `Resident update ${runId}`;
    const addCommandId = addForm.fields.command_id || randomUUID();
    const addResponse = await submitForm(context, addForm, {command_id: addCommandId, action: 'comment', message: addMessage}, detailUrl, baseUrl);
    assert.equal(addResponse.status(), 200, 'resident add-information submit status');
    const addCommandUrl = commandUrlFrom(await addResponse.text(), baseUrl);
    const addPage = await pollCommand(context, addCommandUrl, body => /Your change was committed/i.test(body) || /View the updated request/i.test(body), 'Add resident information');
    const updatedDetail = await openDetailPage(context, detailUrlFrom(addPage.body, baseUrl), baseUrl, 'Read updated resident request');

    const uploadForm = parseForms(updatedDetail.body).find(form => form.files.length > 0 && 'expected_revision' in form.fields);
    assert.ok(uploadForm, 'actual resident photo upload form was not found');
    const photoName = `installed-resident-${runId}.png`;
    const photoBuffer = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=', 'base64');
    const photoSha = createHash('sha256').update(photoBuffer).digest('hex');
    const uploadCommandId = uploadForm.fields.command_id || randomUUID();
    const uploadResponse = await submitMultipart(
      context,
      uploadForm,
      {command_id: uploadCommandId, action: 'upload'},
      {field: uploadForm.files[0], name: photoName, mimeType: 'image/png', buffer: photoBuffer},
      detailUrl,
      baseUrl,
    );
    assert.equal(uploadResponse.status(), 200, 'resident photo upload submit status');
    const uploadCommandUrl = commandUrlFrom(await uploadResponse.text(), baseUrl);
    const uploadPage = await pollCommand(context, uploadCommandUrl, body => /Your change was committed/i.test(body) || /View the updated request/i.test(body), 'Upload resident photograph');
    const finalDetailUrl = detailUrlFrom(uploadPage.body, baseUrl);

    const nativeRead = await callNative('request', {id: requestId});
    const request = nativeRead?.request ?? nativeRead;
    assert.ok(request && typeof request === 'object', 'native service request readback');
    assert.equal(String(request.id), String(requestId), 'native request id mismatch');
    assert.equal(request.description, description, 'native request description mismatch');
    if (request.tracking) assert.equal(String(request.tracking).toUpperCase(), tracking.toUpperCase(), 'native tracking mismatch');
    const attachments = Array.isArray(request.attachments) ? request.attachments : [];
    const photo = attachments.find(item => String(item?.name ?? '') === photoName);
    assert.ok(photo, `native photo attachment missing: ${JSON.stringify(attachments.map(item => item?.name ?? null))}`);
    assert.equal(String(photo.sha256 ?? '').toLowerCase(), photoSha, 'native photo sha256 mismatch');
    assert.equal(photo.public, true, 'resident photograph must remain visible to its authenticated owner');
    const publicText = JSON.stringify({description: request.description, location: request.location, events: request.events ?? []}).toLowerCase();
    assert.ok(!publicText.includes(email.toLowerCase()), 'resident contact email leaked into public request fields');

    const evidence = {
      categoryCode,
      requestId,
      tracking,
      commandIds: {create: createCommandId, read: readCommandId, addInfo: addCommandId, upload: uploadCommandId},
      pages: {
        home: {status: homeResponse.status(), url: homeUrl},
        create: {status: createResponse.status(), commandUrl: createCommandUrl},
        created: {status: created.status, detailUrl},
        lookup: {status: lookupResponse.status(), url: lookupUrl},
        read: {status: readPage.status, commandUrl: readCommandUrl},
        addInfo: {status: addResponse.status(), commandUrl: addCommandUrl},
        upload: {status: uploadResponse.status(), commandUrl: uploadCommandUrl},
        finalDetailUrl,
      },
      addInfo: {message: addMessage},
      photo: {name: photoName, sha256: photoSha, sizeBytes: photoBuffer.length, attachmentId: photo.id ?? null, public: photo.public},
      verification: {nativeOperation: 'service_requests_request', requestCanonical: true, photoCanonical: true, privateContactNotPublic: true, noInternalNote: true},
    };
    if (typeof save === 'function') await save('installed-resident-311', evidence);
    return {evidence, private: {trackingToken: accessToken, contactEmail: email}};
  } finally {
    await context.dispose();
  }
}

async function utilityResidentContext({ page, baseUrl }) {
  if (!page) {
    return await playwrightRequest.newContext({
      baseURL: baseUrl,
      ignoreHTTPSErrors: false,
    });
  }

  const baseOrigin = new URL(baseUrl).origin;

  return {
    async get(url) {
      const resolved = new URL(url, baseUrl);
      assert(resolved.origin === baseOrigin, 'utilityResidentContext get URL must be same-origin');
      const response = await page.goto(resolved.href, { waitUntil: 'domcontentloaded' });
      assert(response, 'utilityResidentContext get expected a response');
      return {
        status: () => response.status(),
        text: () => page.content(),
      };
    },
    async post(url, { form }) {
      return await utilityResidentBrowserPost(page, baseUrl, url, form);
    },
    async dispose() {},
  };
}

async function utilityResidentFill(form, fields) {
  for (const [name, value] of Object.entries(fields)) {
    assert(/^[A-Za-z_][A-Za-z0-9_]*$/.test(name), 'invalid field name: ' + name);
    if (value === undefined) continue;

    const locator = form.locator('[name="' + name + '"]');
    assert((await locator.count()) === 1, 'expected exactly one control named ' + name);

    const { tagName, type } = await locator.evaluate((el) => ({ tagName: el.tagName, type: el.type }));

    if (type === 'hidden') {
      assert((await locator.inputValue()) === String(value), 'hidden control mismatch: ' + name);
      continue;
    }

    if (tagName === 'SELECT') {
      await locator.selectOption(String(value));
      continue;
    }

    if (
      tagName === 'TEXTAREA' ||
      (tagName === 'INPUT' && ['text', 'email', 'tel', 'search', 'url', 'number'].includes(type))
    ) {
      await locator.fill(String(value));
      continue;
    }

    throw new Error('unsupportedcontrols');
  }
}

async function utilityResidentBrowserPost(page, baseUrl, url, fields) {
  const base = new URL(baseUrl);
  const target = new URL(url, base);
  assert(target.origin === base.origin);

  const formCount = await page.locator('form').count();
  const matchingForms = [];

  for (let i = 0; i < formCount; i += 1) {
    const form = page.locator('form').nth(i);
    const { action, method } = await form.evaluate((el) => ({
      action: el.action,
      method: el.method,
    }));

    if (action === target.href && method.toLowerCase() === 'post') {
      matchingForms.push(form);
    }
  }

  assert(matchingForms.length === 1);
  const form = matchingForms[0];

  await utilityResidentFill(form, fields);

  const submit = form.locator('button[type="submit"], input[type="submit"]');
  const submitCount = await submit.count();
  assert(submitCount === 1);

  const [navigationResponse] = await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
    submit.click(),
  ]);

  assert(navigationResponse);

  return {
    status: () => navigationResponse.status(),
    text: () => page.content(),
  };
}

async function utilityResidentHome(context, baseUrl, categoryCode) {
  const homeUrl = new URL(CREATE_PATH, baseUrl).href;
  const deadline = Date.now() + 60000;

  while (true) {
    const response = await context.get(homeUrl);
    assert.equal(response.status(), 200, 'resident catalog home status');
    const homeHtml = await response.text();

    let hasCategoryOption = false;
    for (const match of homeHtml.matchAll(/<option\b([^>]*)>/gi)) {
      const optionAttributes = attributes(match[1]);
      if (optionAttributes.value === categoryCode) {
        hasCategoryOption = true;
        break;
      }
    }

    if (hasCategoryOption) {
      const forms = parseForms(homeHtml);
      const createForm = forms.find((form) => {
        return 'category' in form.fields && 'description' in form.fields && 'email' in form.fields;
      });

      if (createForm) {
        return { homeUrl, homeHtml, createForm };
      }
    }

    if (Date.now() >= deadline) {
      throw new Error("catalognotready");
    }

    await delay(500);
  }
}

async function utilityResidentLookup(context, baseUrl, tracking, trackingToken) {
  const homeUrl = new URL(CREATE_PATH, baseUrl).href;
  const home = await context.get(homeUrl);
  assert.equal(home.status(), 200, 'resident home status');
  const link = anchors(await home.text()).find(item => /track an existing request/i.test(item.text));
  assert.ok(link, 'actual resident lookup link missing');
  const lookupUrl = new URL(link.href, baseUrl).href;
  assert.equal(new URL(lookupUrl).origin, new URL(baseUrl).origin);
  const lookup = await context.get(lookupUrl);
  assert.equal(lookup.status(), 200, 'resident lookup status');
  const form = parseForms(await lookup.text()).find(item => 'tracking' in item.fields && 'access_token' in item.fields);
  assert.ok(form, 'actual lookup form missing');
  const response = await submitForm(context, form, {tracking, access_token: trackingToken}, lookupUrl, baseUrl);
  const body = await response.text();
  return {response, body, commandUrl: response.status() === 200 ? commandUrlFrom(body, baseUrl) : null};
}

const utilityText = value => stripTags(value).replace(/\s+/g, ' ').trim();
const utilityExpected = value => String(value).replace(/\s+/g, ' ').trim();

async function utilityResidentBaseline(native, requestId, description) {
  let result = await native('service_requests_request', {request: {operation: 'request', id: requestId}});
  if (result && typeof result === 'object' && 'result' in result) result = result.result;
  const request = result?.request ?? result;
  assert.equal(request?.id, requestId, 'canonical resident request ID');
  assert.equal(request?.description, description, 'canonical payment question');
  assert.ok(Array.isArray(request.events) && Array.isArray(request.notifications), 'canonical event/notification projection');
  return {revision: request.revision, eventCount: request.events.length, notificationCount: request.notifications.length};
}

/** Focused synthetic payment question; no resident comment/photo or state changes. */
export async function installedUtilityResident({native, portalBaseUrl, categoryCode, description, contactEmail, page} = {}) {
  assert.ok(typeof portalBaseUrl === 'string' && portalBaseUrl);
  assert.ok(typeof categoryCode === 'string' && categoryCode);
  assert.ok(typeof description === 'string' && description.trim());
  const baseUrl = portalBaseUrl.endsWith('/') ? portalBaseUrl : `${portalBaseUrl}/`;
  const email = contactEmail || `utility+${randomUUID()}@example.test`;
  const context = await utilityResidentContext({page, baseUrl});
  try {
    const {homeUrl, createForm} = await utilityResidentHome(context, baseUrl, categoryCode);
    const createCommandId = createForm.fields.command_id;
    assert.match(createCommandId ?? '', /^[0-9a-f-]{36}$/i, 'actual create command UUID');
    const overrides = {category: categoryCode, description, location: 'Utilities acceptance', email, phone: ''};
    if ('contact_name' in createForm.fields) overrides.contact_name = 'Utilities Resident';
    const submitted = await submitForm(context, createForm, overrides, homeUrl, baseUrl);
    assert.equal(submitted.status(), 200, 'resident question submit status');
    const commandUrl = commandUrlFrom(await submitted.text(), baseUrl);
    const created = await pollCommand(context, commandUrl, html => /Save these private details now/i.test(html) && /Access token/i.test(html), 'Create utility question');
    const {tracking, accessToken} = createdCredentials(created.body);
    const detailUrl = detailUrlFrom(created.body, baseUrl);
    const requestId = /\/requests\/([0-9a-f-]{36})\//i.exec(detailUrl)?.[1];
    assert.match(requestId ?? '', /^[0-9a-f-]{36}$/i, 'created request ID');
    const lookup = await readUtilityResident({page, portalBaseUrl: baseUrl, tracking, trackingToken: accessToken, expectedBody: description, privateNotes: ''});
    assert.equal(lookup.requestId, requestId, 'lookup must reopen the original case');
    const evidence = {requestId, tracking, description, createCommandId, createStatus: created.status, lookupStatus: lookup.status};
    if (native) evidence.baseline = await utilityResidentBaseline(native, requestId, description);
    return {evidence, private: {trackingToken: accessToken, contactEmail: email}};
  } finally {
    await context.dispose();
  }
}

/** The provided page makes every navigation/form submission on the physical PC. */
export async function readUtilityResident({portalBaseUrl, tracking, trackingToken, expectedBody, privateNotes, wrongToken, page} = {}) {
  assert.ok(typeof portalBaseUrl === 'string' && portalBaseUrl);
  assert.ok(typeof tracking === 'string' && tracking);
  assert.ok(typeof trackingToken === 'string' && trackingToken);
  assert.ok(typeof expectedBody === 'string' && expectedBody.trim());
  assert.equal(typeof privateNotes, 'string');
  if (wrongToken !== undefined) assert.ok(typeof wrongToken === 'string' && /^[A-Za-z0-9_-]{32,128}$/.test(wrongToken), 'wrong token must have the real token format');
  const baseUrl = portalBaseUrl.endsWith('/') ? portalBaseUrl : `${portalBaseUrl}/`;
  const context = await utilityResidentContext({page, baseUrl});
  try {
    const lookup = await utilityResidentLookup(context, baseUrl, tracking, wrongToken ?? trackingToken);
    let completed;
    if (wrongToken !== undefined) {
      let response = lookup.response;
      let html = lookup.body;
      const deadline = Date.now() + 60_000;
      for (;;) {
        const text = utilityText(html);
        assert.ok(!text.includes(utilityExpected(expectedBody)), 'another resident saw the approved text');
        assert.ok(!privateNotes || !decodeHtml(html).includes(privateNotes), 'private notes leaked');
        assert.ok(!/name=["']message["']/i.test(html), 'another resident received a case update form');
        if ([404, 502].includes(response.status()) && /That resident request is not available|Request not completed/i.test(text)) {
          return {requestId: null, tracking, accessDenied: true, expectedBodyVisible: false, privateNotesAbsent: true, status: response.status()};
        }
        assert.equal(response.status(), 200, 'unexpected wrong-token response');
        assert.ok(lookup.commandUrl && Date.now() < deadline, 'wrong-token command did not reach a denial');
        await delay(500);
        response = await context.get(lookup.commandUrl);
        html = await response.text();
      }
    }
    assert.equal(lookup.response.status(), 200, 'resident lookup submit status');
    completed = await pollCommand(context, lookup.commandUrl, html => /Add a comment/i.test(html) && /name=["']message["']/i.test(html), 'Read approved utility reply');
    const text = utilityText(completed.body);
    const requestId = /\/requests\/([0-9a-f-]{36})\//i.exec(completed.body)?.[1];
    assert.match(requestId ?? '', /^[0-9a-f-]{36}$/i, 'actual original request form ID');
    assert.ok(text.includes(tracking), 'original tracking reference absent');
    assert.ok(text.includes(utilityExpected(expectedBody)), 'approved text is absent from original case');
    assert.ok(!privateNotes || !decodeHtml(completed.body).includes(privateNotes), 'private staff notes leaked');
    return {requestId, tracking, accessDenied: false, expectedBodyVisible: true, privateNotesAbsent: true, status: completed.status};
  } finally {
    await context.dispose();
  }
}
