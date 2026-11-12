// All accounts, quotas and keys here are synthetic test inputs, not rollout values.
import { KeyPair, KeyPairSigner, DelegateAction, actions } from 'near-api-js';
export const policy = { network: 'testnet', contract: 'anchors.testnet', relayer: 'sponsor.testnet',
  workerDailyLimit: 3, globalDailyLimit: 4, requestsPerMinute: 100, minBalance: 100n };
export async function authorization({ nonce = 1, root = 'a'.repeat(64), worker = 'worker.testnet' } = {}) {
  const key = KeyPair.fromRandom('ed25519');
  const args = { v: 2, network: 'testnet', worker, day: '2026-11-12', root, count: 1 };
  const bytes = Buffer.from(JSON.stringify(args));
  const action = new DelegateAction({ senderId: worker, receiverId: policy.contract, publicKey: key.getPublicKey(),
    nonce: BigInt(nonce), maxBlockHeight: 150n, actions: [actions.functionCall('anchor', bytes, 30_000_000_000_000n, 0n)] });
  const { signedDelegate } = await new KeyPairSigner(key).signDelegateAction(action);
  return { protocol: 2, network: 'testnet', signature: Buffer.from(signedDelegate.signature.data).toString('base64'),
    delegate: { senderId: worker, receiverId: policy.contract, publicKey: key.getPublicKey().toString(), nonce: String(nonce), maxBlockHeight: '150',
      actions: [{ methodName: 'anchor', argsBase64: bytes.toString('base64'), gas: '30000000000000', deposit: '0' }] } };
}
export function confirmed(job, prepared) {
  return { args: prepared.args, workerAccount: prepared.worker, txHash: job.tx_hash,
    protocol: 2, finality: 'FINAL', workerAuthorization: 'nep366', receiptId: '6'.repeat(44),
    signer: policy.relayer, receiver: policy.contract, timestamp: Date.parse('2026-11-12T00:01:00Z') };
}
