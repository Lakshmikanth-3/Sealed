// Synthetic keys, records and RPC responses. Never count these as pilot activity.
import { KeyPair, KeyPairSigner, DelegateAction, actions, baseEncode } from 'near-api-js';
import { merkleRoot, merkleProof, randomSalt } from '../../lib/merkle.js';
import { buildCase } from '../../server/caseAgent.js';

export async function workerFixture() {
  const policy = { network: 'testnet', contract: 'anchors.testnet', relayer: 'sponsor.testnet' };
  const worker = 'worker.testnet', day = '2026-11-12';
  const entries = [
    { id: 'synthetic-trip', worker, day, ts: day + 'T00:00:00.000Z', type: 'trip', amount: 100, salt: randomSalt() },
    { id: 'synthetic-penalty', worker, day, ts: day + 'T00:00:01.000Z', type: 'penalty', amount: 10, salt: randomSalt() },
  ];
  const root = await merkleRoot(entries);
  const args = { v: 2, network: policy.network, worker, day, root, count: entries.length };
  const argsBytes = Buffer.from(JSON.stringify(args));
  const key = KeyPair.fromRandom('ed25519');
  const delegate = new DelegateAction({ senderId: worker, receiverId: policy.contract, publicKey: key.getPublicKey(),
    nonce: 1n, maxBlockHeight: 150n, actions: [actions.functionCall('anchor', argsBytes, 30_000_000_000_000n, 0n)] });
  const { signedDelegate } = await new KeyPairSigner(key).signDelegateAction(delegate);
  const txHash = '2'.repeat(44), outerBlock = '3'.repeat(44), contractBlock = '4'.repeat(44);
  const workerReceipt = '5'.repeat(44), receiptId = '6'.repeat(44);
  const timestampNs = String(BigInt(Date.parse(day + 'T00:01:00.000Z')) * 1000000n);
  const record = { ...args, revision: 1, anchored_at_ns: timestampNs };
  const data = {
    status: { chain_id: 'testnet' },
    tx: { final_execution_status: 'FINAL', status: { SuccessValue: '' },
      transaction: { hash: txHash, signer_id: policy.relayer, receiver_id: worker, actions: [{ Delegate: {
        delegate_action: { sender_id: worker, receiver_id: policy.contract, public_key: key.getPublicKey().toString(),
          nonce: 1, max_block_height: 150, actions: [{ FunctionCall: { method_name: 'anchor', args: argsBytes.toString('base64'), gas: '30000000000000', deposit: '0' } }] },
        signature: 'ed25519:' + baseEncode(signedDelegate.signature.data) } }] },
      transaction_outcome: { block_hash: outerBlock, outcome: { executor_id: policy.relayer, receipt_ids: [workerReceipt], status: { SuccessReceiptId: workerReceipt } } },
      receipts_outcome: [
        { id: workerReceipt, block_hash: outerBlock, outcome: { executor_id: worker, receipt_ids: [receiptId], logs: [], status: { SuccessValue: '' } } },
        { id: receiptId, block_hash: contractBlock, outcome: { executor_id: policy.contract, receipt_ids: [], logs: [],
          status: { SuccessValue: Buffer.from(JSON.stringify(record)).toString('base64') } } },
      ] },
    block: { header: { hash: contractBlock, timestamp_nanosec: timestampNs } },
  };
  const draft = { version: 2, worker: { id: worker, label: 'Synthetic v2 fixture' }, days: [{ day, root, count: entries.length,
    anchor: { network: 'testnet', txHash, sender: policy.relayer, contract: policy.contract, receiptId },
    entries: await Promise.all(entries.map(async (entry, i) => ({ entry, proof: await merkleProof(entries, i) }))) }] };
  const pack = await buildCase(draft);
  const calls = [];
  const fetcher = async (_url, options) => {
    const request = JSON.parse(options.body); calls.push(request);
    if (request.method === 'block' && request.params.block_id !== contractBlock) throw new Error('Must use contract execution block');
    return { ok: true, json: async () => ({ result: data[request.method] }) };
  };
  return { pack, draft, args, data, policy, txHash, receiptId, workerReceipt, record, fetcher, calls };
}
