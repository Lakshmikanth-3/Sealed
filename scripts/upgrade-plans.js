// Upgrade the Premium plans contract in place. The stored state (owner, price, subscriptions)
// is unchanged because the state layout is the same. Signs with the contract account's own key.
// Prints the plan by default; --broadcast signs.
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { Account, JsonRpcProvider, KeyPairSigner, actions } from 'near-api-js';

const { SEAL_PLANS_CONTRACT: contract, SEAL_PLANS_PRIVATE_KEY: key, NEAR_RPC_URLS, NEAR_EXPLORER_URL, NEAR_NETWORK } = process.env;
if (NEAR_NETWORK !== 'testnet' || !contract || !key || !NEAR_RPC_URLS) throw new Error('Testnet SEAL_PLANS_CONTRACT, SEAL_PLANS_PRIVATE_KEY and NEAR_RPC_URLS are required');
const wasm = fs.readFileSync(new URL('../contract-plans/build/sealed_plans.wasm', import.meta.url));
const sha = createHash('sha256').update(wasm).digest('hex');
console.log(JSON.stringify({ network: 'testnet', contract, wasmBytes: wasm.length, wasmSha256: sha }, null, 2));
if (!process.argv.includes('--broadcast')) { console.log('Plan only. Run with --broadcast to sign.'); process.exit(0); }

const provider = new JsonRpcProvider({ url: NEAR_RPC_URLS.split(',')[0].trim() });
const self = new Account(contract, provider, KeyPairSigner.fromSecretKey(key));
const res = await self.signAndSendTransaction({ receiverId: contract, waitUntil: 'FINAL', throwOnFailure: true, actions: [actions.deployContract(wasm)] });
const cfg = await provider.callFunction({ contractId: contract, method: 'get_config', args: {} });
console.log(`Upgraded ${contract}: ${NEAR_EXPLORER_URL}/txns/${res.transaction.hash}`);
console.log('State kept:', JSON.stringify(cfg));
const file = 'docs/SEALED-DEPLOYMENT.json', record = JSON.parse(fs.readFileSync(file, 'utf8'));
record.plans = { ...record.plans, upgradeTx: res.transaction.hash, wasmSha256: sha, upgradedAt: new Date().toISOString() };
fs.writeFileSync(file, JSON.stringify(record, null, 2) + '\n');
