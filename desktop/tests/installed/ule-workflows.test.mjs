import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compileFunction } from 'node:vm';

const source = readFileSync(new URL('./ule-workflows.mjs', import.meta.url), 'utf8');
const marker = '  const publications = await installedUlePublications(config);';
const start = source.indexOf(marker);
assert.notEqual(start, -1, 'workflow suffix marker not found');
const end = source.lastIndexOf('}');
assert.ok(end > start, 'workflow closing brace not found');
const suffix = source.slice(start, end);

const unauthorizedStart = source.indexOf(`  await config.switchActor('unauthorized');`);
const unauthorizedEnd = source.indexOf(marker);
assert.notEqual(unauthorizedStart, -1, 'unauthorized phase marker not found');
assert.ok(unauthorizedEnd > unauthorizedStart, 'unauthorized phase end marker not found');
const unauthorizedPhase = source.slice(unauthorizedStart, unauthorizedEnd);
const runUnauthorizedPhase = compileFunction(`return (async () => {
${unauthorizedPhase}
})();`, ['config', 'firstID', 'assert']);

test('unauthorized phase accepts only access-denied with outcome_unknown false and saves safe receipt', async () => {
  const firstID = 'req-unauthorized-denied';
  const typedError = Object.assign(new Error('denied'), { code: 'access-denied', outcome_unknown: false });
  let actor = 'clerk';
  const saved = [];
  const calls = [];
  const config = {
    async switchActor(next) { actor = next; },
    async native(operation, payload) {
      calls.push({ operation, payload });
      assert.equal(operation, 'utilities_request');
      assert.deepEqual(payload, { request: { operation: 'open-request', request_id: firstID } });
      throw typedError;
    },
    async save(key, value) { saved.push({ key, value }); },
  };

  await runUnauthorizedPhase(config, firstID, assert);
  assert.equal(actor, 'administrator');
  assert.deepEqual(saved, [{ key: 'ule-utility-unauthorized-denied', value: { requestId: firstID, code: 'access-denied', denied: true } }]);
  assert.equal(calls.length, 1);
});

test('unauthorized phase rejects service-unavailable typed errors without saving receipt or continuing', async () => {
  const firstID = 'req-unauthorized-unavailable';
  const typedError = Object.assign(new Error('unavailable'), { code: 'service-unavailable', outcome_unknown: true });
  let actor = 'clerk';
  const saved = [];
  const calls = [];
  const config = {
    async switchActor(next) { actor = next; },
    async native(operation, payload) {
      calls.push({ operation, payload });
      assert.equal(operation, 'utilities_request');
      assert.deepEqual(payload, { request: { operation: 'open-request', request_id: firstID } });
      throw typedError;
    },
    async save(key, value) { saved.push({ key, value }); },
  };

  await assert.rejects(
    () => runUnauthorizedPhase(config, firstID, assert),
    (error) => {
      assert.equal(error?.code, 'ERR_ASSERTION');
      return true;
    }
  );
  assert.equal(actor, 'unauthorized');
  assert.deepEqual(saved, []);
  assert.equal(calls.length, 1);
});

test('final phase authorizes recovery through administrator and persists identities/recovery', async () => {
  let actor = 'clerk';
  const saved = [];

  const config = {
    switchActor(name) {
      actor = name;
    },
    native: {},
    save(name, value) {
      saved.push({ name, value });
    },
  };

  const first = { requestId: 'one' };
  const second = { requestId: 'two' };

  const installedUlePublications = async () => {
    actor = 'clerk';
    return { recoveryExpected: { expected: true } };
  };

  const captureUleRecovery = async (input) => {
    assert.equal(actor, 'administrator');
    assert.deepEqual(input.utilityRequestIds, ['one', 'two']);
    return { retained: true };
  };

  const run = compileFunction(
    'return (async()=>{' + suffix + '})()',
    ['config', 'firstID', 'secondID', 'first', 'second', 'installedUlePublications', 'captureUleRecovery']
  );

  const result = await run(
    config,
    'one',
    'two',
    first,
    second,
    installedUlePublications,
    captureUleRecovery
  );

  assert.deepEqual(result.recovery, { retained: true });
  assert.deepEqual(saved.map(({ name }) => name), ['ule-identities', 'ule-recovery']);
});
