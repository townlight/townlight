import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';

// Harness-only acknowledgement between the owned Node runner and its owning
// PowerShell wrapper. The request cannot select commands, executables or paths.
export async function requestUleLibraryPostExit(pending, {
  controlRoot = process.env.TOWNLIGHT_ULE_CONTROL_DIR,
  nonce = process.env.TOWNLIGHT_ULE_CONTROL_NONCE,
  timeoutMs = 600_000,
} = {}) {
  assert.ok(controlRoot && nonce, 'Owned ULE controller is required');
  assert.match(String(pending?.id), /^[0-9a-f-]{36}$/i);
  assert.ok(Date.parse(pending.due_at) > Date.now(), 'Library schedule must still be future');
  const id = randomUUID();
  const request = { schema_version: 1, nonce, id, action: 'library-postexit', pending };
  await writeFile(join(controlRoot, 'request.tmp'), JSON.stringify(request), { flag: 'wx' });
  await rename(join(controlRoot, 'request.tmp'), join(controlRoot, 'request.json'));
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    let response;
    try { response = JSON.parse(await readFile(join(controlRoot, 'response.json'), 'utf8')); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      await new Promise(resolve => setTimeout(resolve, 100));
      continue;
    }
    assert.equal(response.schema_version, 1);
    assert.equal(response.nonce, nonce, 'Controller response nonce mismatch');
    assert.equal(response.id, id, 'Controller response request mismatch');
    if (response.ok !== true) throw new Error('LibraryPostExitFailed');
    assert.equal(response.result?.stopped?.exited, true, 'Controller did not verify desktop exit');
    return response.result;
  }
  throw new Error('Owned ULE controller response timed out');
}
