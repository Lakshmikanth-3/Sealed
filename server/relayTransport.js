import { createHash } from 'node:crypto';
import { Account, KeyPairSigner, JsonRpcProvider, actions, encodeTransaction, baseEncode } from 'near-api-js';
import { checkWorkerAccess } from './workerAuthorization.js';
import { lookupNearTx } from '../lib/nearRpc.js';

// No signAndSendTransaction: its InvalidNonce recovery can create a replacement
// transaction. Persist one signature, then use send_tx with those exact bytes.
export function createRelayTransport(policy, { timeoutMs = 20000 } = {}) {
  const provider = new JsonRpcProvider({ url: policy.rpcUrl }, { retries: 1 });
  // The SDK's fetch path has no request deadline. Supply a bounded, single-
  // attempt RPC adapter so an unavailable node cannot hold a job indefinitely.
  provider.sendJsonRpc = async (method, params) => {
    const response = await fetch(policy.rpcUrl, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 'relay', method, params }), signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) throw new Error('Relay RPC unavailable');
    const body = await response.json();
    if (body.error || !body.result || typeof body.result !== 'object') throw new Error('Relay RPC rejected or malformed');
    return body.result;
  };
  const signer = KeyPairSigner.fromSecretKey(policy.privateKey);
  const account = new Account(policy.relayer, provider, signer);
  return {
    async validate(prepared) {
      await checkWorkerAccess(prepared, provider, policy);
      const [balance, protocol, key, deployed] = await Promise.all([
        provider.viewAccount({ accountId: policy.relayer, blockQuery: { finality: 'final' } }),
        provider.sendJsonRpc('EXPERIMENTAL_protocol_config', { finality: 'final' }),
        provider.viewAccessKey({ accountId: policy.relayer, publicKey: await signer.getPublicKey(), finalityQuery: { finality: 'final' } }),
        provider.viewAccount({ accountId: policy.contract, blockQuery: { finality: 'final' } }),
      ]);
      if (key.permission !== 'FullAccess') throw new Error('Sponsor requires a dedicated full-access key');
      if (!deployed.code_hash || deployed.code_hash === '11111111111111111111111111111111') throw new Error('Contract is not deployed');
      const storage = BigInt(balance.storage_usage) * BigInt(protocol.runtime_config.storage_amount_per_byte);
      const locked = BigInt(balance.locked);
      const available = BigInt(balance.amount) - (storage > locked ? storage - locked : 0n);
      if (available < policy.minBalance) throw new Error('Sponsor balance floor reached');
    },
    async prepare(prepared) {
      const signed = await account.createSignedTransaction({ receiverId: prepared.worker,
        actions: [actions.signedDelegate(prepared.signedDelegate)] });
      return { bytes: Buffer.from(encodeTransaction(signed)).toString('base64'),
        hash: baseEncode(createHash('sha256').update(encodeTransaction(signed.transaction)).digest()) };
    },
    broadcast: (bytes) => provider.sendJsonRpc('send_tx', { signed_tx_base64: bytes, wait_until: 'NONE' }),
    async reconcile(job) {
      // lookup validates FINAL, identity, signed arguments and the inner receipt.
      const found = await lookupNearTx(policy.rpcUrl, job.tx_hash, policy.relayer, { ...policy, protocol: 2 });
      return found;
    },
  };
}
