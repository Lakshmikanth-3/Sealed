// NEAR access for the release service. The operator account (SEAL_OPS_ACCOUNT) creates
// seals, logs open attempts and alert hashes, and funds holder accounts. Reads use
// final state. Nothing here ever handles file content or key parts.
import { Account, FailoverRpcProvider, JsonRpcProvider, KeyPairSigner, actions } from 'near-api-js';

export const DEFAULT_RPCS = { testnet: ['https://test.rpc.fastnear.com', 'https://rpc.testnet.near.org'] };
const GAS = 60_000_000_000_000n;
const NEAR = 10n ** 24n;

export function sealChainConfig(env = process.env) {
  const network = env.NEAR_NETWORK || 'testnet';
  if (network !== 'testnet') throw new Error('Sealed Paper runs on testnet only');
  const urls = [env.NEAR_RPC_URL, ...DEFAULT_RPCS.testnet].filter(Boolean);
  return { network, contract: env.SEAL_CONTRACT || null, ops: env.SEAL_OPS_ACCOUNT || null, opsKey: env.SEAL_OPS_PRIVATE_KEY || null, rpcUrls: [...new Set(urls)] };
}

export function createSealChain(config = sealChainConfig()) {
  const provider = new FailoverRpcProvider(config.rpcUrls.map((url) => new JsonRpcProvider({ url })));
  const account = config.ops && config.opsKey ? new Account(config.ops, provider, KeyPairSigner.fromSecretKey(config.opsKey)) : null;
  const requireWrite = () => {
    if (!config.contract) throw new Error('SEAL_CONTRACT is not configured');
    if (!account) throw new Error('SEAL_OPS_ACCOUNT and SEAL_OPS_PRIVATE_KEY are not configured');
  };
  async function view(methodName, args = {}) {
    if (!config.contract) throw new Error('SEAL_CONTRACT is not configured');
    return provider.callFunction({ contractId: config.contract, method: methodName, args, blockQuery: { finality: 'final' } });
  }
  // Serialize writes so the operator key's nonce never races.
  let queue = Promise.resolve();
  const serial = (fn) => { const run = queue.then(fn, fn); queue = run.catch(() => {}); return run; };
  async function call(methodName, args) {
    requireWrite();
    return serial(async () => {
      const res = await account.callFunctionRaw({ contractId: config.contract, methodName, args, gas: GAS, deposit: 0n, waitUntil: 'EXECUTED_OPTIMISTIC' });
      const status = res.status || {};
      if (status.Failure) throw new Error(`Contract call ${methodName} failed: ${JSON.stringify(status.Failure).slice(0, 300)}`);
      const raw = status.SuccessValue ? Buffer.from(status.SuccessValue, 'base64').toString('utf8') : '';
      return { txHash: res.transaction.hash, value: raw ? JSON.parse(raw) : null };
    });
  }
  return {
    config,
    explorerTx: (hash) => `https://testnet.nearblocks.io/txns/${hash}`,
    getConfig: () => view('get_config'),
    getSeal: (sealId) => view('get_seal', { seal_id: sealId }),
    getLog: (sealId, from = 0, limit = 100) => view('get_log', { seal_id: sealId, from, limit }),
    isUnlocked: (sealId) => view('is_unlocked', { seal_id: sealId }),
    createSeal: (args) => call('create_seal', args),
    requestOpen: (sealId) => call('request_open', { seal_id: sealId }),
    recordAlert: (sealId, alertHash, kind) => call('record_alert', { seal_id: sealId, alert_hash: alertHash, kind }),
    /** Fund new holder accounts (implicit accounts derived from keys the owner's browser generated). */
    fundAccounts: (accountIds, yocto = NEAR / 20n) => {
      requireWrite();
      return serial(async () => {
        const hashes = [];
        for (const id of accountIds) {
          const res = await account.signAndSendTransaction({ receiverId: id, actions: [actions.transfer(yocto)], waitUntil: 'EXECUTED_OPTIMISTIC', throwOnFailure: true });
          hashes.push(res.transaction.hash);
        }
        return hashes;
      });
    },
  };
}
