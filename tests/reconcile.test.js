import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcilePending } from '../lib/reconcile.js';
const hashA = '2'.repeat(44), hashB = '3'.repeat(44);
function setup() {
  const pending = { network: 'testnet', contract: 'anchors.testnet', worker: 'worker.testnet', items: ['2026-11-11', '2026-11-12'].map((day) => ({
    args: { v: 2, network: 'testnet', worker: 'worker.testnet', day, root: 'a'.repeat(64), count: 1 }, entryIds: [day],
  })) };
  const found = (index, hash) => ({ args: pending.items[index].args, workerAccount: pending.worker, network: pending.network,
    receiver: pending.contract, execution: 'success', finality: 'FINAL', txHash: hash, receiptId: '4'.repeat(44), timestamp: Date.now() });
  return { pending, found };
}
test('out-of-order callback hashes match signed arguments instead of batch position', async () => {
  const { pending, found } = setup();
  const result = await reconcilePending(pending, [hashB, hashA], async (hash) => found(hash === hashA ? 0 : 1, hash));
  assert.equal(result.pending, null); assert.equal(result.problems.length, 0);
  assert.deepEqual(result.confirmed.map((row) => row.day), ['2026-11-12', '2026-11-11']);
});
test('partial RPC failure preserves verified days and blocks unresolved work from resigning', async () => {
  const { pending, found } = setup();
  const result = await reconcilePending(pending, [hashA, hashB], async (hash) => {
    if (hash === hashB) throw new Error('RPC unavailable'); return found(0, hash);
  });
  assert.equal(result.confirmed.length, 1);
  assert.deepEqual(result.pending.items, [pending.items[1]]);
  assert.deepEqual(result.pending.hashes, [hashB]);
  assert.equal(pending.items.length, 2, 'Do not mutate the persisted input before the atomic database update');
  const resumed = await reconcilePending(result.pending, [hashB], async (hash) => found(1, hash));
  assert.equal(resumed.pending, null); assert.equal(resumed.confirmed.length, 1);
});
test('unrelated successful transactions cannot resolve or erase a pending request', async () => {
  const { pending, found } = setup();
  const result = await reconcilePending(pending, [hashA], async () => ({ ...found(0, hashA), args: { ...pending.items[0].args, root: 'b'.repeat(64) } }));
  assert.equal(result.confirmed.length, 0); assert.equal(result.pending.items.length, 2);
});
test('failed, nonfinal and wrong-deployment responses retain the pending work', async () => {
  for (const change of [{ execution: 'failed' }, { finality: 'EXECUTED' }, { receiver: 'other.testnet' }, { workerAccount: 'other.testnet' }, { receiptId: null }]) {
    const { pending, found } = setup();
    const result = await reconcilePending(pending, [hashA], async () => ({ ...found(0, hashA), ...change }));
    assert.equal(result.confirmed.length, 0); assert.equal(result.pending.items.length, 2);
  }
});
test('invalid or duplicate transaction hashes never initiate RPC verification', async () => {
  const { pending } = setup();
  for (const hashes of [[], ['invalid'], [hashA, hashA]]) {
    await assert.rejects(reconcilePending(pending, hashes, () => { throw new Error('Must not contact RPC'); }), /distinct NEAR/);
  }
});
