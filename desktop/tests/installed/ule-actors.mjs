import assert from 'node:assert/strict';

export async function provisionUleActors(native, actors) {
  assert.equal(typeof native, 'function');
  assert.equal(Array.isArray(actors), true);

  for (const actor of actors) {
    assert.equal(actor !== null && typeof actor === 'object', true);
    assert.equal(typeof actor.name === 'string' && actor.name.length > 0, true);
    assert.equal(typeof actor.email === 'string' && actor.email.length > 0, true);
    assert.equal(actor.email.endsWith('@example.invalid'), true);
    assert.equal(typeof actor.passcode === 'string' && actor.passcode.length > 0, true);
    assert.equal(actor.role === 'clerk' || actor.role === 'city-staff' || actor.role === 'records-staff', true);

    const result = await native('auth_action', {
      action: 'create-user',
      payload: {
        userName: actor.name,
        userEmail: actor.email,
        userRole: actor.role,
        userPasscode: actor.passcode
      }
    });

    assert.equal(result.accepted, true);
  }

  return actors.length;
}

export async function signInUleActor(page, actor) {
  assert.equal(typeof actor.email === 'string' && actor.email.length > 0, true);
  assert.equal(typeof actor.passcode === 'string' && actor.passcode.length > 0, true);
  assert.equal(typeof actor.role === 'string' && actor.role.length > 0, true);

  await page.evaluate(async actor=>{const a=window.audit; const settings=async()=>{await a.click('[data-surface="IT/Admin"]',{confirm:false});await a.nav('settings');};await settings();if(document.querySelector('[data-auth-action="sign-out"]')){await a.click('[data-auth-action="sign-out"]');await settings();}a.fill('[data-access-field="email"]',actor.email);a.fill('[data-access-field="passcode"]',actor.passcode);await a.click('[data-auth-action="sign-in"]');await a.until(async()=>{const {access}=await a.native('get_app_state');return access.signed_in&&access.role===actor.role;});},actor);

  return { signedIn: true, role: actor.role };
}