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
