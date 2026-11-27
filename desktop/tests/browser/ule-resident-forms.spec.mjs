import {test, expect} from '@playwright/test';
import {createServer} from 'node:http';
import {randomUUID} from 'node:crypto';
import {installedUtilityResident, readUtilityResident} from '../installed/resident-311.mjs';

// Transport qualification against the actual helpers and resident form contracts.
// Real portal/311/publisher behavior is verified by installed acceptance separately.
const requestId = '11111111-1111-4111-8111-111111111111';
const tracking = `TL311-${requestId.replaceAll('-', '')}`;
const token = 'A'.repeat(40);
const otherToken = 'B'.repeat(40);
const question = 'Which payment options are available?';
const reply = 'Installments are available under city policy 7.3.';
const notes = 'PRIVATE Utilities workpaper ABC-937';
const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

async function fixture() {
  const commands = new Map();
  const posts = [];
  let published = false;
  let leak = false;
  const server = createServer(async (req, res) => {
    const path = new URL(req.url, 'http://localhost').pathname;
    const send = (html, status = 200) => {
      res.writeHead(status, {'Content-Type': 'text/html; charset=utf-8'});
      res.end(`<!doctype html><html><body>${html}</body></html>`);
    };
    const fields = () => `<input type="hidden" name="csrfmiddlewaretoken" value="fixture-csrf"><input type="hidden" name="command_id" value="${randomUUID()}">`;
    if (req.method === 'GET' && path === '/service-requests/') {
      return send(`<form method="post" action="/service-requests/">${fields()}<select name="category"><option value="payment-options">Utilities</option></select><textarea name="description"></textarea><input name="location"><input name="contact_name"><input type="email" name="email"><input name="phone"><button type="submit">Submit request</button></form><a href="/service-requests/lookup/">Track an existing request</a>`);
    }
    if (req.method === 'GET' && path === '/service-requests/lookup/') {
      return send(`<form method="post" action="/service-requests/lookup/">${fields()}<input name="tracking"><input name="access_token"><button type="submit">Look up request</button></form>`);
    }
    if (req.method === 'POST' && ['/service-requests/', '/service-requests/lookup/'].includes(path)) {
      let body = '';
      for await (const chunk of req) body += chunk;
      const data = Object.fromEntries(new URLSearchParams(body));
      if (data.csrfmiddlewaretoken !== 'fixture-csrf' || !/^[0-9a-f-]{36}$/.test(data.command_id ?? '')) return send('Invalid actual form controls', 400);
      posts.push({path, data});
      commands.set(data.command_id, path === '/service-requests/' ? 'create' : data.tracking === tracking && data.access_token === token ? 'read' : 'denied');
      return send(`<a href="/service-requests/commands/${data.command_id}/">Refresh request status</a>`);
    }
    const id = /\/commands\/([0-9a-f-]{36})\//.exec(path)?.[1];
    const command = commands.get(id);
    if (command === 'create') return send(`<h2>Save these private details now</h2><dl><dt>Tracking number</dt><dd><code>${tracking}</code></dd><dt>Access token</dt><dd><code>${token}</code></dd></dl><a href="/service-requests/requests/${requestId}/">Open your request</a>`);
    if (command === 'read') return send(`<h2>Request ${tracking}</h2><p>${escape(question)}</p>${published ? `<p>${escape(reply)}</p>` : ''}${leak ? `<p>${escape(notes)}</p>` : ''}<h3>Add a comment</h3><form method="post" action="/service-requests/requests/${requestId}/"><textarea name="message"></textarea></form>`);
    if (command === 'denied') return send('<h2>Request not completed</h2><p>We could not complete that request. Please try again.</p>', 502);
    return send('Not found', 404);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    posts,
    publish: () => { published = true; },
    leak: () => { leak = true; },
    close: () => new Promise(resolve => server.close(resolve)),
  };
}

for (const browser of [true, false]) {
  test(`focused utility resident forms ${browser ? 'rendered browser' : 'strict request'} transport`, async ({page}) => {
    const host = await fixture();
    const nativeCalls = [];
    const native = async (command, payload) => {
      nativeCalls.push({command, payload});
      expect(command).toBe('service_requests_request');
      expect(payload).toEqual({request: {operation: 'request', id: requestId}});
      return {result: {request: {id: requestId, description: question, revision: 1, events: [], notifications: [{id: 'initial'}]}}};
    };
    const options = browser ? {page} : {};
    try {
      const created = await installedUtilityResident({...options, native, portalBaseUrl: host.url, categoryCode: 'payment-options', description: question});
      expect(created.evidence.requestId).toBe(requestId);
      expect(created.evidence.description).toBe(question);
      expect(created.evidence.baseline).toEqual({revision: 1, eventCount: 0, notificationCount: 1});
      expect(created.private.trackingToken).toBe(token);
      expect(JSON.stringify(created.evidence)).not.toContain(token);
      expect(JSON.stringify(created.evidence)).not.toContain(created.private.contactEmail);
      expect(nativeCalls).toHaveLength(1);
      expect(host.posts[0].data.description).toBe(question);
      expect(host.posts[0].data.csrfmiddlewaretoken).toBe('fixture-csrf');
      expect(host.posts.every(item => !('message' in item.data) && !('action' in item.data))).toBe(true);
      host.publish();
      const denied = await readUtilityResident({...options, portalBaseUrl: host.url, tracking, trackingToken: token, expectedBody: reply, privateNotes: notes, wrongToken: otherToken});
      expect(denied).toEqual({requestId: null, tracking, accessDenied: true, expectedBodyVisible: false, privateNotesAbsent: true, status: 502});
      if (browser) await expect(page.locator('body')).not.toContainText(reply);
      const read = await readUtilityResident({...options, portalBaseUrl: host.url, tracking, trackingToken: token, expectedBody: reply, privateNotes: notes});
      expect(read.requestId).toBe(requestId);
      expect(read.expectedBodyVisible).toBe(true);
      expect(read.privateNotesAbsent).toBe(true);
      host.leak();
      await expect(readUtilityResident({...options, portalBaseUrl: host.url, tracking, trackingToken: token, expectedBody: reply, privateNotes: notes})).rejects.toThrow('private staff notes leaked');
    } finally {
      await host.close();
    }
  });
}
