import assert from 'node:assert/strict';
import { configureEmail, waitMailJson } from './community-workflows.mjs';
import { ensureResidentSubscriber } from './resident-communications.mjs';
import { createUleFixtureConfig } from './ule-fixture-config.mjs';
import { provisionUleActors, signInUleActor } from './ule-actors.mjs';

export async function prepareUleHosted({ page, native, save, fixtureRoot, portalBaseUrl, getPage = () => page } = {}) {
  assert.ok(page, 'page is required');
  assert.ok(native, 'native is required');
  assert.ok(fixtureRoot, 'fixtureRoot is required');
  assert.ok(portalBaseUrl, 'portalBaseUrl is required');

  const fixtures = createUleFixtureConfig();
  assert.ok(fixtures.actors && fixtures.utility && fixtures.library && fixtures.elections, 'ULE fixture config incomplete');

  await configureEmail(native, fixtureRoot);
  const actors = Object.entries(fixtures.actors)
    .filter(([key]) => key !== 'administrator')
    .map(([, actor]) => actor);
  assert.equal(actors.length, 4, 'expected four non-administrator actors');
  await provisionUleActors(native, actors);

  const subscriber = await ensureResidentSubscriber({ portalBaseUrl, fixtureRoot, save });
  assert.ok(subscriber && typeof subscriber.email === 'string' && subscriber.email, 'subscriber email required');

  async function switchActor(key) {
    assert.ok(Object.hasOwn(fixtures.actors, key), `unknown ULE actor: ${key}`);
    const current = getPage();
    assert.ok(current, 'page is required');
    await signInUleActor(current, fixtures.actors[key]);
    return { page: current, native };
  }

  async function captureMessage(arg, bodyOrPending) {
    if (typeof arg === 'string') {
      return waitMailJson(fixtureRoot, arg, bodyOrPending);
    }
    assert.ok(bodyOrPending && typeof bodyOrPending.body === 'string', 'object capture requires bodyOrPending.body');
    return waitMailJson(fixtureRoot, subscriber.email, bodyOrPending.body);
  }

  if (save) await save('ule-hosted-prerequisites', { actorCount: 4, subscriberConfirmed: true });

  return { ...fixtures, subscriberEmail: subscriber.email, switchActor, captureMessage };
}