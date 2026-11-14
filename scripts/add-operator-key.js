// Add a second full-access key to the operator account for another server instance
// (for example the hosted copy). Each NEAR access key has its own nonce, so two servers
// must never share one key. The new key is written to .env as SEAL_OPS_PRIVATE_KEY_<NAME>
// and never printed. Usage: node --env-file=.env scripts/add-operator-key.js HOSTED
import fs from 'node:fs';
import { Account, JsonRpcProvider, KeyPair, KeyPairSigner, actions } from 'near-api-js';

const name = (process.argv[2] || '').toUpperCase();
if (!/^[A-Z0-9_]{2,20}$/.test(name)) throw new Error('Give a name for the new key, e.g. HOSTED');
const varName = `SEAL_OPS_PRIVATE_KEY_${name}`;
if (new RegExp(`^${varName}=`, 'm').test(fs.readFileSync('.env', 'utf8'))) throw new Error(`${varName} already exists in .env`);
const rpc = String(process.env.NEAR_RPC_URLS || '').split(',')[0].trim();
const ops = process.env.SEAL_OPS_ACCOUNT, current = process.env.SEAL_OPS_PRIVATE_KEY;
if (!rpc || !ops || !current) throw new Error('NEAR_RPC_URLS, SEAL_OPS_ACCOUNT and SEAL_OPS_PRIVATE_KEY are required');
const key = KeyPair.fromRandom('ed25519');
fs.appendFileSync('.env', `${varName}=${key.toString()}\n`); // saved before broadcasting
const account = new Account(ops, new JsonRpcProvider({ url: rpc }), KeyPairSigner.fromSecretKey(current));
const res = await account.signAndSendTransaction({ receiverId: ops, actions: [actions.addFullAccessKey(key.getPublicKey())], waitUntil: 'FINAL', throwOnFailure: true });
console.log(`Added a key to ${ops} (saved as ${varName}): ${process.env.NEAR_EXPLORER_URL}/txns/${res.transaction.hash}`);
