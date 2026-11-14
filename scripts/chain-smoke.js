// Live testnet check of the core loop: create a 2-of-3 seal unlocking in ~45 s, prove an
// early release is refused and logged, a non-holder is refused, then release 2 parts
// after unlock and confirm is_unlocked. Spends a little testnet NEAR from the operator.
import { Account, FailoverRpcProvider, JsonRpcProvider, KeyPair, KeyPairSigner } from 'near-api-js';
import { createSealChain, sealChainConfig } from '../server/sealChain.js';
import { splitKey, randomBytes, sha256Hex } from '../lib/sealcrypto.js';

// Test scripts sign with their own operator key so they never collide with a running server's nonce.
const chain = createSealChain({ ...sealChainConfig(), opsKey: process.env.SEAL_OPS_PRIVATE_KEY_TESTS || process.env.SEAL_OPS_PRIVATE_KEY });
const provider = new FailoverRpcProvider(chain.config.rpcUrls.map((url) => new JsonRpcProvider({ url })));
const implicit = (kp) => Buffer.from(kp.getPublicKey().data).toString('hex');
const holders = [0, 1, 2].map(() => { const kp = KeyPair.fromRandom('ed25519'); return { kp, id: implicit(kp) }; });
const outsider = KeyPair.fromRandom('ed25519');
const parts = await splitKey(randomBytes(32), 3, 2);
const sealId = 'smoke-' + Date.now().toString(36);
const unlockAt = Date.now() + 45_000;

const step = (label, value) => console.log(`${label.padEnd(34)} ${typeof value === 'string' ? value : JSON.stringify(value)}`);
step('funding holders + outsider', (await chain.fundAccounts([...holders.map((h) => h.id), implicit(outsider)])).length + ' transfers');
const created = await chain.createSeal({ seal_id: sealId, file_hash: await sha256Hex(randomBytes(64)), unlock_at_ms: String(unlockAt),
  mode: 'split', holders: holders.map((h) => h.id), commitments: parts.map((p) => p.commitment), threshold_k: 2, total_n: 3, owner: 'chain-smoke' });
step('create_seal', chain.explorerTx(created.txHash));

async function release(kp, id, part) {
  const acct = new Account(id, provider, KeyPairSigner.fromSecretKey(kp.toString()));
  const res = await acct.callFunctionRaw({ contractId: chain.config.contract, methodName: 'release_part',
    args: { seal_id: sealId, part_commitment: part.commitment }, gas: 15_000_000_000_000n, deposit: 0n, waitUntil: 'EXECUTED_OPTIMISTIC' });
  return { status: JSON.parse(Buffer.from(res.status.SuccessValue, 'base64').toString()), tx: res.transaction.hash };
}
const early = await release(holders[0].kp, holders[0].id, parts[0]);
step('early release (expect early)', early.status);
const outsiderTry = await release(outsider, implicit(outsider), parts[0]);
step('non-holder (expect not_holder)', outsiderTry.status);
step('request_open early (expect early)', (await chain.requestOpen(sealId)).value);
step('is_unlocked before', await chain.isUnlocked(sealId));

const wait = unlockAt - Date.now() + 3000;
if (wait > 0) { step('waiting for unlock', `${Math.ceil(wait / 1000)} s`); await new Promise((r) => setTimeout(r, wait)); }
step('holder 1 release', (await release(holders[0].kp, holders[0].id, parts[0])).status);
step('is_unlocked after 1 of 2', await chain.isUnlocked(sealId));
step('holder 3 release', (await release(holders[2].kp, holders[2].id, parts[2])).status);
await new Promise((r) => setTimeout(r, 2500)); // let final state catch up
step('is_unlocked after 2 of 2', await chain.isUnlocked(sealId));
const log = await chain.getLog(sealId);
step('on-chain log', log.map((e) => e.kind).join(', '));
const ok = early.status === 'early' && outsiderTry.status === 'not_holder' && await chain.isUnlocked(sealId);
console.log(ok ? `PASS  seal ${sealId}` : 'FAIL'); process.exit(ok ? 0 : 1);
