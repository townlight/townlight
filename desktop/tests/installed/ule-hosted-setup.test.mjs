import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { compileFunction } from 'node:vm';
import test from 'node:test';
import { createUleFixtureConfig } from './ule-fixture-config.mjs';

// Composition boundary only; the called UI/SMTP helpers have their own checks.
test('hosted prerequisites preserve current-page identity and both real capture call contracts', async () => {
  const source = (await readFile(new URL('./ule-hosted-setup.mjs', import.meta.url), 'utf8'))
    .replace(/^import .*$/gm, '').replace('export async function', 'async function');
  const factory = compileFunction(`${source}\nreturn prepareUleHosted;`, [
    'assert', 'configureEmail', 'waitMailJson', 'ensureResidentSubscriber',
    'createUleFixtureConfig', 'provisionUleActors', 'signInUleActor',
  ]);
  const calls = [], saved = [], initialPage = {}, reopenedPage = { reopened: true };
  let currentPage = initialPage;
  const native = () => { throw new Error('unexpected native call outside prerequisite boundaries'); };
  const prepare = factory(assert,
    async (actualNative, root) => {
      assert.equal(actualNative, native); assert.equal(root, 'fixture-root'); calls.push('email');
    },
    async (...args) => args,
    async ({ fixtureRoot, portalBaseUrl }) => {
      assert.equal(fixtureRoot, 'fixture-root'); assert.equal(portalBaseUrl, 'https://fixture.example.invalid');
      calls.push('subscriber'); return { email: 'confirmed@example.invalid' };
    }, createUleFixtureConfig,
    async (actualNative, actors) => {
      assert.equal(actualNative, native); assert.equal(actors.length, 4);
      assert.ok(actors.every(actor => actor.role !== 'local-admin')); calls.push('actors');
    },
    async (page, actor) => {
      assert.equal(page, reopenedPage); assert.equal(actor.role, 'city-staff'); calls.push('signin');
    });
  const ready = await prepare({ page: initialPage, native, getPage: () => currentPage,
    fixtureRoot: 'fixture-root', portalBaseUrl: 'https://fixture.example.invalid',
    save: async (name, value) => saved.push({ name, value }) });
  assert.deepEqual(calls, ['email', 'actors', 'subscriber']);
  assert.deepEqual(saved, [{ name: 'ule-hosted-prerequisites', value: { actorCount: 4, subscriberConfirmed: true } }]);
  currentPage = reopenedPage;
  assert.deepEqual(await ready.switchActor('official'), { page: reopenedPage, native });
  await assert.rejects(ready.switchActor('unknown'), /unknown ULE actor/);
  assert.deepEqual(await ready.captureMessage('utility@example.invalid', 'utility reply'),
    ['fixture-root', 'utility@example.invalid', 'utility reply']);
  assert.deepEqual(await ready.captureMessage({ id: 'published-version' }, { body: 'approved program body' }),
    ['fixture-root', 'confirmed@example.invalid', 'approved program body']);
  await assert.rejects(ready.captureMessage({ id: 'published-version' }, {}), /body/);
  assert.equal(ready.subscriberEmail, 'confirmed@example.invalid');
});
