import test from 'node:test';
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { RelayStore } from '../server/relayStore.js';
import { prepareSignedAnchor } from '../server/workerAuthorization.js';
import { policy, authorization } from './fixtures/relay.js';

for (const phase of ['signing', 'prepared', 'submitted', 'broadcast']) {
  test(`forced process death during ${phase} recovers SQLite job without a second transaction charge`, { timeout: 15000 }, async (t) => {
    const dir = mkdtempSync(path.join(tmpdir(), 'appeal-relay-crash-'));
    const a = await authorization(); let store = new RelayStore(dir, policy);
    store.approve('worker.testnet', true); const job = store.enqueue(a, prepareSignedAnchor(a, policy), policy); store.close(); store = null;
    const children = [];
    t.after(async () => {
      for (const child of children) if (child.exitCode === null && child.signalCode === null) { const done = once(child, 'exit'); child.kill('SIGKILL'); await done; }
      store?.close(); rmSync(dir, { recursive: true, force: true });
    });
    const launch = (mode) => {
      const child = fork(new URL('./fixtures/relay-crash-child.js', import.meta.url), [dir, mode],
        { stdio: ['ignore', 'ignore', 'ignore', 'ipc'], windowsHide: true }); children.push(child); return child;
    };
    const child = launch(phase); const [marker] = await once(child, 'message'); assert.equal(marker.at, phase);
    const died = once(child, 'exit'); child.kill('SIGKILL'); await died;
    store = new RelayStore(dir, policy);
    const row = store.get(job.id);
    assert.equal(row.state, phase === 'signing' ? 'validating' : phase === 'prepared' ? 'prepared' : 'submitted');
    // Advance the abandoned process's lease expiry without making the test wait
    // 30 seconds. This does not alter job state or signed transaction data.
    store.db.prepare('UPDATE lease SET until_ms=0').run(); store.close(); store = null;
    const recovered = launch('recover'); const [result] = await once(recovered, 'message');
    assert.equal(result.state, 'confirmed');
    if (recovered.exitCode === null) await once(recovered, 'exit');
    store = new RelayStore(dir, policy);
    assert.equal(store.get(job.id).state, 'confirmed');
    const remote = JSON.parse(readFileSync(path.join(dir, 'synthetic-remote.json'), 'utf8'));
    assert.equal(remote.chargedHashes.length, 1);
    assert.ok(remote.attempts.every((bytes) => bytes === 'synthetic-exact-signed-bytes'));
    assert.equal(remote.attempts.length, 1);
  });
}

test('simultaneous separate processes reserve one semantic job and one quota slot', { timeout: 15000 }, async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'appeal-relay-contention-'));
  const store = new RelayStore(dir, policy); store.approve('worker.testnet', true); store.close();
  const children = [0, 1].map(() => fork(new URL('./fixtures/relay-enqueue-child.js', import.meta.url), [dir],
    { stdio: ['ignore', 'ignore', 'ignore', 'ipc'], windowsHide: true }));
  const exited = children.map((child) => once(child, 'exit'));
  t.after(async () => {
    for (let i = 0; i < children.length; i++) {
      if (children[i].exitCode === null && children[i].signalCode === null) children[i].kill('SIGKILL');
      await exited[i];
    }
    rmSync(dir, { recursive: true, force: true });
  });
  await Promise.all(children.map((child) => once(child, 'message')));
  const payloads = await Promise.all([authorization(), authorization({ nonce: 2 })]);
  const replies = children.map((child) => once(child, 'message'));
  children.forEach((child, i) => child.send(payloads[i]));
  const results = await Promise.all(replies); await Promise.all(exited);
  assert.ok(results[0][0].id); assert.equal(results[0][0].id, results[1][0].id);
  const check = new RelayStore(dir, policy);
  try { assert.equal(check.list().length, 1); } finally { check.close(); }
});
