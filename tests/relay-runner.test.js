import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { RelayStore } from '../server/relayStore.js';
import { RelayRunner } from '../server/relayRunner.js';
import { prepareSignedAnchor } from '../server/workerAuthorization.js';
import { policy, authorization, confirmed } from './fixtures/relay.js';

async function fixture(t, overrides = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'appeal-relay-runner-'));
  const store = new RelayStore(dir, policy); store.approve('worker.testnet', true);
  const auth = await authorization(), prepared = prepareSignedAnchor(auth, policy);
  const job = store.enqueue(auth, prepared, policy);
  const calls = { signs: 0, broadcasts: [] };
  const transport = { validate: async () => {},
    prepare: async () => { calls.signs++; return { bytes: 'synthetic-signed-bytes', hash: '2'.repeat(44) }; },
    broadcast: async (bytes) => { calls.broadcasts.push(bytes); },
    reconcile: async (row) => confirmed(row, prepared), ...overrides };
  const runner = new RelayRunner(store, transport, policy); store.acquire(runner.owner);
  t.after(async () => { await runner.stop(); store.close(); rmSync(dir, { recursive: true, force: true }); });
  return { store, runner, transport, calls, auth, prepared, job };
}
test('persists signature before broadcast and confirms only verified inner receipt with matching intent', async (t) => {
  const f = await fixture(t);
  f.transport.broadcast = async (bytes) => {
    const row = f.store.get(f.job.id);
    assert.equal(row.state, 'submitted'); assert.equal(row.signed_bytes, bytes);
    assert.equal(row.tx_hash, '2'.repeat(44)); f.calls.broadcasts.push(bytes);
  };
  await Promise.all([f.runner.tick(), f.runner.tick(), f.runner.tick()]);
  assert.equal(f.store.get(f.job.id).state, 'confirmed'); assert.equal(f.calls.signs, 1);
  assert.equal(f.calls.broadcasts.length, 1);
  const result = f.store.publicJob(f.job.id);
  assert.equal(result.anchor.receiptId, '6'.repeat(44));
  assert.equal(JSON.stringify(result).includes('synthetic-signed-bytes'), false);
  assert.equal(JSON.stringify(result).includes(f.auth.signature), false);
});
test('unavailable transaction holds queue and retransmits only the exact stored transaction', async (t) => {
  const f = await fixture(t, { reconcile: async () => { throw new Error('UNKNOWN_TRANSACTION'); } });
  const other = await authorization({ root: 'b'.repeat(64) });
  const queued = f.store.enqueue(other, prepareSignedAnchor(other, policy), policy);
  await f.runner.tick();
  assert.equal(f.store.get(f.job.id).state, 'unknown');
  for (let i = 0; i < 5; i++) await f.runner.tick();
  assert.equal(f.calls.signs, 1); assert.equal(f.calls.broadcasts.length, 3);
  assert.equal(new Set(f.calls.broadcasts).size, 1);
  assert.equal(f.store.get(queued.id).state, 'queued');
  f.transport.reconcile = async (row) => confirmed(row, f.prepared);
  await f.runner.tick(); assert.equal(f.store.get(f.job.id).state, 'confirmed');
});
test('mismatched or outer-success-only proof stays unknown; proven final failure permits explicit fresh retry', async (t) => {
  const f = await fixture(t, { reconcile: async () => ({ finality: 'FINAL', txHash: '2'.repeat(44) }) });
  await f.runner.tick(); assert.equal(f.store.get(f.job.id).state, 'unknown');
  f.transport.reconcile = async (row) => ({ ...confirmed(row, f.prepared), args: { ...f.prepared.args, root: 'b'.repeat(64) } });
  await f.runner.tick(); assert.equal(f.store.get(f.job.id).state, 'unknown');
  f.transport.reconcile = async () => { const e = new Error('Synthetic final inner failure'); e.code = 'FINAL_EXECUTION_FAILED'; throw e; };
  await f.runner.tick(); assert.equal(f.store.get(f.job.id).state, 'failed');
  const fresh = await authorization({ nonce: 2 });
  const retry = f.store.enqueue(fresh, prepareSignedAnchor(fresh, policy), policy, f.job.id);
  assert.notEqual(retry.id, f.job.id);
});
test('revocation during asynchronous preflight prevents signing; broadcast jobs reconcile without retransmission', async (t) => {
  const f = await fixture(t);
  f.transport.validate = async () => { f.store.approve('worker.testnet', false); };
  await f.runner.tick(); assert.equal(f.calls.signs, 0); assert.equal(f.store.get(f.job.id).state, 'cancelled');
  f.store.transition(f.job.id, 'submitted', null, { signed_bytes: 'old-signature', tx_hash: '2'.repeat(44) });
  f.transport.reconcile = async () => { throw new Error('unavailable'); };
  await f.runner.tick(); assert.equal(f.calls.broadcasts.length, 0); assert.equal(f.store.get(f.job.id).state, 'unknown');
  f.transport.reconcile = async (row) => confirmed(row, f.prepared);
  await f.runner.tick(); assert.equal(f.store.get(f.job.id).state, 'confirmed');
});
test('expiry before broadcast spends nothing; expired unknown transactions remain unresolved', async (t) => {
  const expired = () => { const e = new Error('expired'); e.code = 'DELEGATE_EXPIRED'; throw e; };
  const f = await fixture(t, { validate: async () => expired() });
  await f.runner.tick(); assert.equal(f.store.get(f.job.id).state, 'expired'); assert.equal(f.calls.signs, 0);
  f.store.transition(f.job.id, 'unknown', null, { signed_bytes: 'old-signature', tx_hash: '2'.repeat(44), attempts: 3 });
  f.transport.reconcile = async () => expired();
  await f.runner.tick(); assert.equal(f.store.get(f.job.id).state, 'unknown'); assert.equal(f.calls.signs, 0);
});
test('persistence failure and lost lease prevent broadcast', async (t) => {
  const f = await fixture(t);
  const transition = f.store.transition.bind(f.store);
  f.store.transition = (...args) => { if (args[1] === 'prepared') throw new Error('Synthetic disk full'); return transition(...args); };
  await assert.rejects(f.runner.tick(), /disk full/); assert.equal(f.calls.broadcasts.length, 0);
  assert.equal(f.store.get(f.job.id).signed_bytes, null);
  f.store.transition = transition;
  f.transport.prepare = async () => {
    f.store.db.prepare('UPDATE lease SET owner=? WHERE key=1').run('other-process');
    return { bytes: 'uncommitted', hash: '2'.repeat(44) };
  };
  await assert.rejects(f.runner.tick(), /LEASE_LOST/); assert.equal(f.calls.broadcasts.length, 0);
});
test('prepared recovery revalidates without a replacement signature', async (t) => {
  const f = await fixture(t);
  f.store.transition(f.job.id, 'prepared', null, { signed_bytes: 'persisted-before-restart', tx_hash: '2'.repeat(44) });
  await f.runner.tick(); assert.equal(f.calls.signs, 0);
  assert.deepEqual(f.calls.broadcasts, ['persisted-before-restart']); assert.equal(f.store.get(f.job.id).state, 'confirmed');
});
