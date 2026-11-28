import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { requestUleLibraryPostExit } from './ule-host-control.mjs';

for (const fault of ['none', 'nonce', 'request', 'failure', 'still-running']) {
  test(`actual control files retain request binding: ${fault}`, async () => {
    const root = await mkdtemp(join(tmpdir(), 'ule-host-control-'));
    try {
      const nonce = randomUUID();
      const waiting = requestUleLibraryPostExit({ id: randomUUID(), due_at: new Date(Date.now() + 60_000).toISOString() }, { controlRoot: root, nonce, timeoutMs: 3000 });
      const observed = waiting.then(value => ({ value }), error => ({ error }));
      let request;
      for (let i = 0; i < 100; i++) {
        try { request = JSON.parse(await readFile(join(root, 'request.json'), 'utf8')); break; }
        catch (error) { if (error.code !== 'ENOENT') throw error; await new Promise(resolve => setTimeout(resolve, 10)); }
      }
      assert.equal(request.action, 'library-postexit');
      assert.equal(request.nonce, nonce);
      const response = { schema_version: 1, nonce: fault === 'nonce' ? randomUUID() : nonce, id: fault === 'request' ? randomUUID() : request.id, ok: fault !== 'failure', result: { stopped: { exited: fault !== 'still-running', pid: 123 } } };
      await writeFile(join(root, 'response.json'), JSON.stringify(response));
      const outcome = await observed;
      if (fault === 'none') assert.equal(outcome.value.stopped.exited, true);
      else assert.ok(outcome.error, `Expected ${fault} to fail closed`);
    } finally { await rm(root, { recursive: true, force: true }); }
  });
}
