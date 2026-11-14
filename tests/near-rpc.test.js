// Synthetic RPC responses exercise trust checks; these are not live-chain results.
import test from 'node:test';
import assert from 'node:assert/strict';
import { lookupNearTx } from '../lib/nearRpc.js';
import { createChain } from '../server/chain.js';
import { buildCase } from '../server/caseAgent.js';
import { verifyPack } from '../lib/verify.js';
import { merkleRoot, randomSalt } from '../lib/merkle.js';

const hash = '2'.repeat(44), blockHash = '3'.repeat(44);
const policy = { network: 'testnet', contract: 'anchor.testnet', relayer: 'relay.testnet' };
const args = { v: 1, worker: 'w-synthetic', day: '2026-11-12', root: 'a'.repeat(64), count: 1 };

function responses() {
  return {
    status: { chain_id: 'testnet' },
    tx: { final_execution_status: 'FINAL', status: { SuccessValue: '' },
      transaction: { hash, signer_id: policy.relayer, receiver_id: policy.contract,
        actions: [{ FunctionCall: { method_name: 'anchor', args: Buffer.from(JSON.stringify(args)).toString('base64'), deposit: '0' } }] },
      transaction_outcome: { block_hash: blockHash } },
    block: { header: { hash: blockHash, timestamp_nanosec: '1794430000000000000' } },
  };
}
function fetcher(data, calls = []) {
  return async (url, options) => {
    assert.equal(url, 'https://synthetic-rpc.invalid');
    const request = JSON.parse(options.body);
    calls.push(request);
    return { ok: true, json: async () => ({ result: data[request.method] }) };
  };
}
async function lookup(data, calls = []) {
  return lookupNearTx('https://synthetic-rpc.invalid', hash, policy.relayer, { ...policy, fetcher: fetcher(data, calls) });
}

test('reads a successful finalized anchor from the configured chain and deployment', async () => {
  const calls = [];
  const result = await lookup(responses(), calls);
  assert.deepEqual(result.args, args);
  assert.equal(result.timestamp, 1794430000000);
  assert.equal(result.execution, 'success');
  assert.equal(result.finality, 'FINAL');
  assert.equal(result.receiver, policy.contract);
  assert.equal(calls.find((c) => c.method === 'tx').params.wait_until, 'FINAL');
});

for (const [name, change] of [
  ['different network', (r) => { r.status.chain_id = 'mainnet'; }],
  ['failed execution', (r) => { r.tx.status = { Failure: { ActionError: {} } }; }],
  ['optimistic execution', (r) => { r.tx.final_execution_status = 'EXECUTED_OPTIMISTIC'; }],
  ['missing finality', (r) => { delete r.tx.final_execution_status; }],
  ['wrong transaction', (r) => { r.tx.transaction.hash = '4'.repeat(44); }],
  ['wrong signer', (r) => { r.tx.transaction.signer_id = 'other.testnet'; }],
  ['wrong contract', (r) => { r.tx.transaction.receiver_id = 'other.testnet'; }],
  ['wrong method', (r) => { r.tx.transaction.actions[0].FunctionCall.method_name = 'unrelated'; }],
  ['extra action', (r) => { r.tx.transaction.actions.push('Transfer'); }],
  ['attached deposit', (r) => { r.tx.transaction.actions[0].FunctionCall.deposit = '1'; }],
  ['malformed args', (r) => { r.tx.transaction.actions[0].FunctionCall.args = 'not JSON'; }],
  ['wrong schema version', (r) => { r.tx.transaction.actions[0].FunctionCall.args = Buffer.from(JSON.stringify({ ...args, v: 2 })).toString('base64'); }],
  ['wrong block', (r) => { r.block.header.hash = 'other'; }],
  ['invalid block timestamp', (r) => { r.block.header.timestamp_nanosec = 'NaN'; }],
]) {
  test(`NEAR RPC rejects ${name}`, async () => {
    const data = responses(); change(data);
    await assert.rejects(lookup(data));
  });
}

test('RPC HTTP and JSON-RPC failures cannot become anchor results', async () => {
  for (const response of [{ ok: false, status: 429 }, { ok: true, json: async () => ({ error: { message: 'synthetic error' } }) },
    { ok: true, json: async () => ({ result: null }) }]) {
    await assert.rejects(lookupNearTx('https://synthetic-rpc.invalid', hash, policy.relayer, { ...policy, fetcher: async () => response }));
  }
});

test('live configuration refuses unknown networks and implicit contract fallback', () => {
  assert.throws(() => createChain({ NEAR_NETWORK: 'fake' }), /Unsupported/);
  assert.equal(createChain({ NEAR_NETWORK: 'testnet', NEAR_ACCOUNT_ID: 'relay.testnet' }).contract, null);
});

test('read-only NEAR chain can be configured without a private signing key', async () => {
  const chain = createChain({ NEAR_NETWORK: 'testnet', ANCHOR_CONTRACT: 'anchors.testnet', NEAR_ACCOUNT_ID: 'relay.testnet' });
  assert.equal(chain.contract, 'anchors.testnet');
  assert.equal(chain.anchor, undefined, 'The read-only chain must never sign transactions');
});

test('pack cannot select its own trusted deployment or claim failed execution', async () => {
  const entry = { id: 'synthetic', worker: args.worker, day: args.day, ts: '2026-11-12T00:00:00.000Z', type: 'trip', amount: 1, salt: randomSalt() };
  const root = await merkleRoot([entry]);
  const pack = await buildCase({ worker: { id: entry.worker }, days: [{ day: args.day, root, count: 1,
    anchor: { network: 'testnet', txHash: hash, sender: policy.relayer, contract: policy.contract }, entries: [{ entry, proof: [] }] }] });
  const anchor = { args: { ...args, root }, timestamp: Date.parse(entry.ts) + 1000, signer: policy.relayer,
    receiver: policy.contract, network: 'testnet', txHash: hash, execution: 'success', finality: 'FINAL', method: 'anchor' };
  const options = { deployments: { testnet: policy } };
  assert.equal((await verifyPack(pack, async () => anchor)).ok, false);
  assert.equal((await verifyPack(pack, async () => anchor, options)).ok, true);
  for (const patch of [{ execution: 'failed' }, { finality: 'EXECUTED' }, { receiver: 'other.testnet' }, { method: 'other' }, { network: 'mainnet' }, { txHash: 'other' }]) {
    assert.equal((await verifyPack(pack, async () => ({ ...anchor, ...patch }), options)).ok, false);
  }
  pack.days[0].anchor.contract = 'attacker.testnet';
  assert.equal((await verifyPack(pack, async () => anchor, options)).ok, false);
});
