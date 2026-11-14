// Read-only chain access. Workers sign in their own wallet.
import { lookupNearTx, validNearAccount } from '../lib/nearRpc.js';
export const PUBLIC_RPC = { testnet: 'https://rpc.testnet.near.org', mainnet: 'https://rpc.mainnet.near.org' };
export function createChain(env = process.env) {
  const network = env.NEAR_NETWORK || 'testnet';
  if (!PUBLIC_RPC[network]) throw new Error('Unsupported NEAR network; local ledgers are not supported');
  const contract = env.ANCHOR_CONTRACT || null, sender = env.NEAR_ACCOUNT_ID || null;
  if (contract && !validNearAccount(contract)) throw new Error('Invalid ANCHOR_CONTRACT');
  if (sender && !validNearAccount(sender)) throw new Error('Invalid NEAR relayer account');
  const rpcUrl = env.NEAR_RPC_URL || PUBLIC_RPC[network];
  return { network, contract, sender, rpcUrl,
    async lookup(ref, { protocol = 2 } = {}) {
      if (!contract) throw new Error('Deploy the Appeal contract and configure ANCHOR_CONTRACT');
      return lookupNearTx(rpcUrl, ref.txHash, ref.sender, { network, contract, relayer: sender, protocol, receiptId: ref.receiptId });
    },
  };
}
