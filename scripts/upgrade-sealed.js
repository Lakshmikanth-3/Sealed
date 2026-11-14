// Redeploy Sealed contract code in place (state is kept; no init call).
// Only for changes that keep the storage layout. Signs with SEAL_CONTRACT_PRIVATE_KEY.
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { Account, JsonRpcProvider, KeyPairSigner, actions } from 'near-api-js';

const contract = process.env.SEAL_CONTRACT;
if (process.env.NEAR_NETWORK !== 'testnet' || !contract?.endsWith('.testnet')) throw new Error('Testnet SEAL_CONTRACT required');
const wasm = fs.readFileSync(new URL('../contract/build/sealed_paper.wasm', import.meta.url));
const sha = createHash('sha256').update(wasm).digest('hex');
console.log(JSON.stringify({ contract, action: 'DeployContract (code only)', wasmSha256: sha, wasmBytes: wasm.length }));
if (!process.argv.includes('--broadcast')) { console.log('Plan only. Run with --broadcast to sign.'); process.exit(0); }
const rpc = String(process.env.NEAR_RPC_URLS || '').split(',')[0].trim();
if (!rpc) throw new Error('Set NEAR_RPC_URLS in .env');
const provider = new JsonRpcProvider({ url: rpc });
const account = new Account(contract, provider, KeyPairSigner.fromSecretKey(process.env.SEAL_CONTRACT_PRIVATE_KEY));
const res = await account.signAndSendTransaction({ receiverId: contract, actions: [actions.deployContract(wasm)], waitUntil: 'FINAL', throwOnFailure: true, retries: 0 });
const file = 'docs/SEALED-DEPLOYMENT.json', record = JSON.parse(fs.readFileSync(file, 'utf8'));
record.upgrades = [...(record.upgrades || []), { tx: res.transaction.hash, wasmSha256: sha, at: new Date().toISOString() }];
record.wasmSha256 = sha;
fs.writeFileSync(file, JSON.stringify(record, null, 2) + '\n');
console.log(`Upgraded ${contract}: ${process.env.NEAR_EXPLORER_URL}/txns/${res.transaction.hash}`);
