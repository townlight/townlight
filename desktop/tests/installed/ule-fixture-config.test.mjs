import test from 'node:test';
import assert from 'node:assert/strict';
import { createUleFixtureConfig } from './ule-fixture-config.mjs';

test('ULE fixture config is valid and isolated', () => {
  const c = createUleFixtureConfig();
  assert.deepEqual(Object.values(c.actors).map((a) => a.role), ['local-admin', 'clerk', 'city-staff', 'city-staff', 'records-staff']);
  const emails = Object.values(c.actors).map((a) => a.email);
  assert.equal(new Set(emails).size, 5);
  assert.ok(emails.every((e) => e.endsWith('@example.invalid')));
  assert.equal(c.utility.policy.approved, true);
  assert.ok(Number.isInteger(c.utility.policy.version));
  assert.equal(c.utility.approverName, c.actors.clerk.name);
  const start = Date.parse(c.library.fields.starts_at);
  assert.ok(start > Date.now() && start % 60000 === 0);
  assert.notEqual(c.elections.v1.fields.description, c.elections.v2.fields.description);
  assert.match(c.elections.v1.fields.official_source, /^https:\/\//);
  assert.match(c.elections.v2.fields.official_source, /^https:\/\//);
  const name = c.actors.clerk.name;
  c.actors.clerk.name = 'mutated';
  assert.equal(createUleFixtureConfig().actors.clerk.name, name);
});