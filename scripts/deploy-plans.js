// Deploy the Premium plans contract to NEAR testnet as plans.<operator account>.
// The operator account creates and funds it; the contract owner (withdraw, set_price) is
// CONTRACT_OWNER. A new key for the plans account is written to .env and never printed.
// Prints the plan by default; --broadcast signs.
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { Account, JsonRpcProvider, KeyPair, KeyPairSigner, actions, parseNearAmount } from 'near-api-js';

const ops = process.env.SEAL_OPS_ACCOUNT, opsKey = process.env.SEAL_OPS_PRIVATE_KEY, owner = process.env.CONTRACT_OWNER;
const rpc = String(process.env.NEAR_RPC_URLS || '').split(',')[0].trim();
if (process.env.NEAR_NETWORK !== 'testnet' || !ops || !opsKey || !owner || !rpc) throw new Error('Testnet SEAL_OPS_ACCOUNT, SEAL_OPS_PRIVATE_KEY, CONTRACT_OWNER and NEAR_RPC_URLS are required');
const plans = process.env.SEAL_PLANS_CONTRACT || `plans.${ops}`;
const priceNear = process.env.SEAL_PLAN_PRICE_NEAR || '1';
const wasm = fs.readFileSync(new URL('../contract-plans/build/sealed_plans.wasm', import.meta.url));
const price = parseNearAmount(priceNear);
console.log(JSON.stringify({ network: 'testnet', creator: ops, contract: plans, owner, pricePerMonthNear: priceNear, wasmSha256: createHash('sha256').update(wasm).digest('hex') }, null, 2));
if (!process.argv.includes('--broadcast')) { console.log('Plan only. Run with --broadcast to sign.'); process.exit(0); }

const provider = new JsonRpcProvider({ url: rpc });
if (await provider.viewAccount({ accountId: plans, blockQuery: { finality: 'final' } }).then(() => true, () => false)) throw new Error(`${plans} already exists`);
const key = KeyPair.fromRandom('ed25519');
fs.appendFileSync('.env', `SEAL_PLANS_CONTRACT=${plans}\nSEAL_PLANS_PRIVATE_KEY=${key.toString()}\n`);
// 1) the operator creates and funds the account; 2) the account deploys and initialises itself
// (init is private, so it must be called by the contract account).
const creator = new Account(ops, provider, KeyPairSigner.fromSecretKey(opsKey));
const created = await creator.signAndSendTransaction({ receiverId: plans, waitUntil: 'FINAL', throwOnFailure: true,
  actions: [actions.createAccount(), actions.transfer(BigInt(parseNearAmount('2.5'))), actions.addFullAccessKey(key.getPublicKey())] });
console.log(`Created ${plans}: ${process.env.NEAR_EXPLORER_URL}/txns/${created.transaction.hash}`);
const self = new Account(plans, provider, KeyPairSigner.fromSecretKey(key.toString()));
const res = await self.signAndSendTransaction({ receiverId: plans, waitUntil: 'FINAL', throwOnFailure: true,
  actions: [actions.deployContract(wasm), actions.functionCall('new', { owner, price_per_month: price }, 50_000_000_000_000n, 0n)] });
const explorer = process.env.NEAR_EXPLORER_URL;
const file = 'docs/SEALED-DEPLOYMENT.json', record = JSON.parse(fs.readFileSync(file, 'utf8'));
record.plans = { contract: plans, owner, pricePerMonthNear: priceNear, createTx: created.transaction.hash, deployTx: res.transaction.hash, deployedAt: new Date().toISOString() };
fs.writeFileSync(file, JSON.stringify(record, null, 2) + '\n');
console.log(`Deployed ${plans}: ${explorer}/txns/${res.transaction.hash}`);
