import test from 'node:test';
import assert from 'node:assert/strict';
import { workerFixture } from './fixtures/worker-v2.js';
import { lookupNearTx } from '../lib/nearRpc.js';
import { verifyPack } from '../lib/verify.js';
async function directFixture() {
  const f = await workerFixture();
  const tx = f.data.tx.transaction;
  tx.actions = [tx.actions[0].Delegate.delegate_action.actions[0]];
  tx.signer_id = f.pack.worker.id; tx.receiver_id = f.policy.contract;
  f.data.tx.transaction_outcome.outcome.receipt_ids = [f.receiptId];
  f.data.tx.receipts_outcome = f.data.tx.receipts_outcome.filter((row) => row.id === f.receiptId);
  f.pack.days[0].anchor.sender = f.pack.worker.id;
  f.lookup = () => lookupNearTx('http://unit-test', f.txHash, tx.signer_id, { network: 'testnet', contract: f.policy.contract, protocol: 2, fetcher: f.fetcher });
  return f;
}
test('direct worker wallet call requires successful contract receipt and verifies v2 evidence', async () => {
  const f = await directFixture();
  const anchor = await f.lookup();
  assert.equal(anchor.workerAuthorization, 'wallet');
  assert.equal(anchor.workerAccount, f.pack.worker.id);
  assert.equal(anchor.receiptId, f.receiptId);
  const report = await verifyPack(f.pack, f.lookup, { deployments: { testnet: { contract: f.policy.contract } } });
  assert.equal(report.ok, true); assert.equal(report.workerAuthorizationVerified, true);
});
for (const [name, mutate] of [
  ['wrong signer', (f) => { f.data.tx.transaction.signer_id = 'attacker.testnet'; }],
  ['wrong receiver', (f) => { f.data.tx.transaction.receiver_id = 'attacker.testnet'; }],
  ['failed receipt', (f) => { f.data.tx.receipts_outcome[0].outcome.status = { Failure: {} }; }],
  ['unreachable receipt', (f) => { f.data.tx.transaction_outcome.outcome.receipt_ids = ['9'.repeat(44)]; }],
  ['altered return', (f) => { const row = f.data.tx.receipts_outcome[0]; row.outcome.status.SuccessValue = Buffer.from(JSON.stringify({ ...f.record, root: 'b'.repeat(64) })).toString('base64'); }],
]) test(`direct wallet rejects ${name}`, async () => { const f = await directFixture(); mutate(f); await assert.rejects(f.lookup()); });
