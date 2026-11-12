import test from 'node:test';
import assert from 'node:assert/strict';
import { lookupNearTx } from '../lib/nearRpc.js';
import { verifyPack } from '../lib/verify.js';
import { buildSummary } from '../lib/summary.js';
import { sha256Hex, canonical } from '../lib/merkle.js';
import { validateDraft } from '../lib/schema.js';
import { workerFixture } from './fixtures/worker-v2.js';

const lookup = (f, extra = {}) => lookupNearTx('https://synthetic-rpc.invalid', f.txHash, f.policy.relayer,
  { ...f.policy, protocol: 2, receiptId: f.pack.days[0].anchor.receiptId, fetcher: f.fetcher, ...extra });
async function verify(f) {
  return verifyPack(f.pack, async (ref, context) => {
    assert.equal(context.protocol, 2);
    return lookup(f, { receiptId: ref.receiptId });
  }, { deployments: { testnet: f.policy } });
}
function updateReturn(f, patch) {
  const record = { ...f.record, ...patch };
  f.data.tx.receipts_outcome[1].outcome.status.SuccessValue = Buffer.from(JSON.stringify(record)).toString('base64');
}

test('v2 proof checks worker authorization and uses the contract execution block', async () => {
  const f = await workerFixture();
  assert.equal(f.pack.version, 2);
  const anchor = await lookup(f);
  assert.equal(anchor.workerAccount, f.pack.worker.id);
  assert.equal(anchor.receiptId, f.receiptId);
  assert.equal(anchor.workerAuthorization, 'nep366');
  assert.equal(anchor.timestamp, Date.parse('2026-11-12T00:01:00.000Z'));
  const report = await verify(f);
  assert.equal(report.ok, true);
  assert.equal(report.workerAuthorizationVerified, true);
  assert.equal(report.attestationVerified, false);
  assert.match(report.identity, /does not establish the person's name/);
});

for (const [name, mutate] of [
  ['worker mismatch', (f) => { f.data.tx.transaction.actions[0].Delegate.delegate_action.sender_id = 'other.testnet'; }],
  ['wrong outer receiver', (f) => { f.data.tx.transaction.receiver_id = f.policy.contract; }],
  ['wrong delegate receiver', (f) => { f.data.tx.transaction.actions[0].Delegate.delegate_action.receiver_id = 'other.testnet'; }],
  ['extra inner action', (f) => { const d = f.data.tx.transaction.actions[0].Delegate.delegate_action; d.actions.push(d.actions[0]); }],
  ['ambiguous outer action', (f) => { f.data.tx.transaction.actions[0].FunctionCall = {}; }],
  ['ambiguous inner action', (f) => { f.data.tx.transaction.actions[0].Delegate.delegate_action.actions[0].Transfer = {}; }],
  ['missing worker signature', (f) => { delete f.data.tx.transaction.actions[0].Delegate.signature; }],
  ['missing worker outcome', (f) => { f.data.tx.receipts_outcome.shift(); }],
  ['failed worker outcome', (f) => { f.data.tx.receipts_outcome[0].outcome.status = { Failure: {} }; }],
  ['unknown worker outcome', (f) => { f.data.tx.receipts_outcome[0].outcome.status = {}; }],
  ['inner failure despite outer success', (f) => { f.data.tx.receipts_outcome[1].outcome.status = { Failure: {} }; }],
  ['missing inner outcome', (f) => { f.data.tx.receipts_outcome.pop(); }],
  ['unrelated contract', (f) => { f.data.tx.receipts_outcome[1].outcome.executor_id = 'other.testnet'; }],
  ['disconnected target receipt', (f) => { f.data.tx.receipts_outcome[0].outcome.receipt_ids = []; }],
  ['duplicate receipt ID', (f) => { f.data.tx.receipts_outcome.push(structuredClone(f.data.tx.receipts_outcome[1])); }],
  ['cyclic receipt graph', (f) => { f.data.tx.receipts_outcome[1].outcome.receipt_ids.push(f.workerReceipt); }],
  ['wrong receipt reference', (f) => { f.pack.days[0].anchor.receiptId = '7'.repeat(44); }],
  ['edited return root', (f) => updateReturn(f, { root: 'b'.repeat(64) })],
  ['edited return worker', (f) => updateReturn(f, { worker: 'other.testnet' })],
  ['edited return count', (f) => updateReturn(f, { count: 999 })],
  ['edited return network', (f) => updateReturn(f, { network: 'mainnet' })],
  ['future contract timestamp', (f) => updateReturn(f, { anchored_at_ns: '18446744073709551615' })],
  ['invalid revision', (f) => updateReturn(f, { revision: 999 })],
  ['empty inner return', (f) => { f.data.tx.receipts_outcome[1].outcome.status.SuccessValue = ''; }],
]) {
  test(`v2 lookup rejects ${name}`, async () => {
    const f = await workerFixture(); mutate(f);
    await assert.rejects(lookup(f));
    assert.equal((await verify(f)).workerAuthorizationVerified, false);
  });
}

test('legacy protocol cannot interpret a delegated transaction as a v1 anchor', async () => {
  const f = await workerFixture();
  await assert.rejects(lookup(f, { protocol: 1 }));
});

test('idempotent retry may return its prior record without an event log', async () => {
  const f = await workerFixture();
  updateReturn(f, { anchored_at_ns: String(BigInt(f.record.anchored_at_ns) - 1000000000n) });
  assert.equal((await verify(f)).ok, true);
});

test('a refund receipt does not become an authorization proof', async () => {
  const f = await workerFixture();
  const refund = '7'.repeat(44);
  f.data.tx.receipts_outcome[0].outcome.receipt_ids.push(refund);
  f.data.tx.receipts_outcome.push({ id: refund, block_hash: f.data.block.header.hash,
    outcome: { executor_id: f.policy.relayer, receipt_ids: [], status: { SuccessValue: '' } } });
  assert.equal((await verify(f)).ok, true);
});

test('v2 schema rejects mock, missing receipt and mixed networks', async () => {
  for (const mutate of [
    (p) => { p.days[0].anchor.network = 'mock'; },
    (p) => { delete p.days[0].anchor.receiptId; },
    (p) => { p.days[0].anchor.contract = ''; },
    (p) => { const d = structuredClone(p.days[0]); d.day = '2026-11-13'; d.anchor.network = 'mainnet'; p.days.push(d); },
  ]) {
    const f = await workerFixture(); mutate(f.pack);
    assert.throws(() => validateDraft(f.pack));
    assert.equal((await verify(f)).workerAuthorizationVerified, false);
    assert.equal(f.calls.length, 0);
  }
});

test('edited evidence cannot receive the worker-authorized verdict even with a matching summary', async () => {
  const f = await workerFixture();
  f.pack.days[0].entries[0].entry.amount++;
  f.pack.summary = buildSummary(f.pack.days[0].entries.map((it) => it.entry));
  f.pack.summaryHash = await sha256Hex(canonical(f.pack.summary));
  const report = await verify(f);
  assert.equal(report.ok, false);
  assert.equal(report.workerAuthorizationVerified, false);
});

test('v2 pack cannot trust forged callback ownership metadata or a v1 protocol', async () => {
  const f = await workerFixture();
  const anchor = await lookup(f);
  for (const patch of [{ workerAuthorization: undefined }, { workerAccount: 'other.testnet' }, { protocol: 1 },
    { args: { ...anchor.args, v: 1 } }, { args: { ...anchor.args, network: 'mainnet' } }]) {
    const report = await verifyPack(f.pack, async () => ({ ...anchor, ...patch }), { deployments: { testnet: f.policy } });
    assert.equal(report.ok, false);
    assert.equal(report.workerAuthorizationVerified, false);
  }
});
