import { Account, JsonRpcProvider, KeyPairSigner } from 'near-api-js';
import { validNearAccount } from '../lib/schema.js';
const contract = process.env.ANCHOR_CONTRACT, owner = process.env.CONTRACT_OWNER, worker = process.env.WORKER_ACCOUNT_ID;
if (process.env.NEAR_NETWORK !== 'testnet' || ![contract, owner, worker].every(validNearAccount)) throw new Error('Set testnet ANCHOR_CONTRACT, CONTRACT_OWNER and WORKER_ACCOUNT_ID');
console.log(JSON.stringify({ network: 'testnet', signer: owner, receiver: contract,
  method: 'register_worker', args: { worker }, deposit: '0', gas: '30000000000000' }, null, 2));
if (process.argv.includes('--broadcast')) {
  if (!process.env.CONTRACT_OWNER_PRIVATE_KEY) throw new Error('Configure CONTRACT_OWNER_PRIVATE_KEY locally');
  const provider = new JsonRpcProvider({ url: process.env.NEAR_RPC_URL || 'https://rpc.testnet.near.org' });
  if ((await provider.viewNodeStatus()).chain_id !== 'testnet') throw new Error('RPC network mismatch');
  const config = await provider.callFunction({ contractId: contract, method: 'get_config', args: {}, blockQuery: { finality: 'final' } });
  if (config?.owner !== owner || config?.protocol !== 2 || config?.network !== 'testnet') throw new Error('Owner or deployment mismatch');
  if (await provider.callFunction({ contractId: contract, method: 'is_registered', args: { worker }, blockQuery: { finality: 'final' } })) throw new Error('Worker is already registered; no transaction needed');
  const account = new Account(owner, provider, KeyPairSigner.fromSecretKey(process.env.CONTRACT_OWNER_PRIVATE_KEY));
  const result = await account.callFunctionRaw({ contractId: contract, methodName: 'register_worker', args: { worker }, gas: 30000000000000n, deposit: 0n, waitUntil: 'FINAL' });
  console.log('Registration transaction: ' + result.transaction.hash);
} else console.log('Plan only. No signature or transaction submitted.');
