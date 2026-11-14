// Prints a concrete deployment plan by default. --broadcast is an explicit
// operator action that signs and spends testnet gas. Never supports mainnet.
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { Account, JsonRpcProvider, KeyPairSigner, actions } from 'near-api-js';
import { validNearAccount } from '../lib/schema.js';
const contract = process.env.ANCHOR_CONTRACT, owner = process.env.CONTRACT_OWNER;
if (process.env.NEAR_NETWORK !== 'testnet') throw new Error('This deployment tool requires explicit NEAR_NETWORK=testnet');
if (!validNearAccount(contract) || !validNearAccount(owner)) throw new Error('Set real ANCHOR_CONTRACT and CONTRACT_OWNER accounts');
const integer = (name, maximum) => {
  const value = process.env[name];
  if (!/^[1-9]\d*$/.test(value || '') || Number(value) > maximum) throw new Error('Choose ' + name);
  return Number(value);
};
const init = { owner, network: 'testnet', max_workers: integer('CONTRACT_MAX_WORKERS', 100000), max_days_per_worker: integer('CONTRACT_MAX_DAYS_PER_WORKER', 36600) };
const bytes = fs.readFileSync(new URL('../contract/build/appeal_anchors.wasm', import.meta.url));
console.log(JSON.stringify({ network: 'testnet', signer: contract, receiver: contract,
  wasmSha256: createHash('sha256').update(bytes).digest('hex'), wasmBytes: bytes.length,
  actions: ['DeployContract', { FunctionCall: { method: 'new', args: init, gas: '50000000000000', deposit: '0' } }] }, null, 2));
if (process.argv.includes('--broadcast')) {
  if (!process.env.CONTRACT_PRIVATE_KEY) throw new Error('Set CONTRACT_PRIVATE_KEY locally; it is never printed');
  const provider = new JsonRpcProvider({ url: process.env.NEAR_RPC_URL || 'https://rpc.testnet.near.org' });
  if ((await provider.viewNodeStatus()).chain_id !== 'testnet') throw new Error('RPC network mismatch');
  const existing = await provider.viewAccount({ accountId: contract, blockQuery: { finality: 'final' } });
  if (existing.code_hash !== '11111111111111111111111111111111') throw new Error('Refusing to overwrite an existing contract');
  const account = new Account(contract, provider, KeyPairSigner.fromSecretKey(process.env.CONTRACT_PRIVATE_KEY));
  const result = await account.signAndSendTransaction({ receiverId: contract,
    actions: [actions.deployContract(bytes), actions.functionCall('new', init, 50000000000000n, 0n)], waitUntil: 'FINAL', throwOnFailure: true, retries: 0 });
  console.log('Finalized deployment transaction: ' + result.transaction.hash);
} else console.log('Plan only. No signature or transaction submitted.');
