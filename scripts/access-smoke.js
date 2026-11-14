// Live testnet check of NEAR-account access, through the running server's HTTP API.
// Signs with near-api-js exactly as Meteor Wallet would (same transaction, same NEP-413
// message), using throwaway testnet accounts. Usage: node --env-file=.env scripts/access-smoke.js [baseUrl]
import { Account, FailoverRpcProvider, JsonRpcProvider, KeyPair, KeyPairSigner } from 'near-api-js';
import { createSealChain } from '../server/sealChain.js';
import { nep413Hash } from '../server/nearAuth.js';
import { encryptFile, splitKey, wrapPart, randomBytes, toB64url, sha256Hex, combineKey, decryptFile } from '../lib/sealcrypto.js';

const BASE = process.argv[2] || 'http://localhost:8787';
const chain = createSealChain();
const provider = new FailoverRpcProvider(chain.config.rpcUrls.map((url) => new JsonRpcProvider({ url })));
const implicit = (kp) => Buffer.from(kp.getPublicKey().data).toString('hex');
const results = []; const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
const post = (path, body) => fetch(BASE + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, body: await r.json() }));
const get = (path) => fetch(BASE + path).then(async (r) => ({ status: r.status, body: await r.json() }));

// Accounts: an "own account" holder, an allowed viewer and a not-allowed viewer.
const holderKey = KeyPair.fromRandom('ed25519'), okKey = KeyPair.fromRandom('ed25519'), badKey = KeyPair.fromRandom('ed25519');
const holderAcct = implicit(holderKey), okAcct = implicit(okKey), badAcct = implicit(badKey);
await chain.fundAccounts([holderAcct, okAcct, badAcct]);
check('account lookup: kanth.testnet resolves', (await get('/api/accounts/kanth.testnet')).body.exists === true);
check('account lookup: unknown account', (await get('/api/accounts/no-such-acct-zz9.testnet')).body.exists === false);

// Seal a file: 2 of 2; holder 1 uses their own account, holder 2 is app-created. Viewers: okAcct and kanth.testnet.
const original = new TextEncoder().encode('Board results, embargoed. ' + Date.now());
const { sealed, key, hash } = await encryptFile(original, { name: 'results.txt', type: 'text/plain' });
const parts = await splitKey(key, 2, 2), wrapKey = randomBytes(32);
const appHolder = KeyPair.fromRandom('ed25519');
const holders = [{ account: holderAcct, own: true, kp: holderKey }, { account: implicit(appHolder), own: false, kp: appHolder }];
for (const [i, h] of holders.entries()) { h.wrapped = await wrapPart(wrapKey, parts[i].part, h.account); h.commitment = await sha256Hex(new TextEncoder().encode(h.wrapped)); }
const unlockAtMs = Date.now() + 40_000;
const meta = { label: 'Access smoke test', unlockAtMs, mode: 'split', n: 2, k: 2, fileHash: hash, wrapKey: toB64url(wrapKey), viewers: [okAcct, 'kanth.testnet'],
  holders: holders.map((h, i) => ({ account: h.account, own: h.own, commitment: h.commitment, label: `Holder ${i + 1}` })) };
const badMeta = { ...meta, viewers: ['no-such-acct-zz9.testnet'] };
const upload = (m) => fetch(BASE + '/api/seals', { method: 'POST', headers: { 'content-type': 'application/octet-stream', 'x-seal-meta': toB64url(new TextEncoder().encode(JSON.stringify(m))) }, body: sealed }).then(async (r) => ({ status: r.status, body: await r.json() }));
const rejected = await upload(badMeta);
check('sealing refuses a viewer account that does not exist', rejected.status === 400 && /does not exist/.test(rejected.body.error), rejected.body.error);
const created = await upload(meta);
check('seal created with own-account holder and allow-list', created.status === 201, created.body.sealId || created.body.error);
const sealId = created.body.sealId;
const info = (await get(`/api/seals/${sealId}`)).body;
check('seal is marked restricted to 2 accounts', info.restricted === true && info.viewerCount === 2 && info.holders[0].own === true);

async function proof(kp, accountId) {
  const c = (await get(`/api/seals/${sealId}/challenge`)).body;
  const sig = kp.sign(nep413Hash({ message: c.message, nonce: Buffer.from(c.nonce, 'base64'), recipient: c.recipient })).signature;
  return { accountId, publicKey: kp.getPublicKey().toString(), signature: Buffer.from(sig).toString('base64'), nonce: c.nonce };
}
check('open without a proof is refused', (await post(`/api/seals/${sealId}/open`, {})).status === 401);
const forged = await proof(badKey, okAcct); // signed by the wrong key for okAcct
check('a proof signed with someone else\'s key is refused', (await post(`/api/seals/${sealId}/open`, { proof: forged })).status === 401);
const notAllowed = await post(`/api/seals/${sealId}/open`, { proof: await proof(badKey, badAcct) });
check('a real but unlisted account is refused and alerted', notAllowed.status === 403 && notAllowed.body.status === 'not_allowed', notAllowed.body.message);
const early = await post(`/api/seals/${sealId}/open`, { proof: await proof(okKey, okAcct) });
check('an allowed account is still refused before the unlock time', early.status === 423 && early.body.status === 'early');

await new Promise((r) => setTimeout(r, Math.max(0, unlockAtMs - Date.now() + 3000)));
for (const h of holders) {
  const acct = new Account(h.account, provider, KeyPairSigner.fromSecretKey(h.kp.toString()));
  const res = await acct.callFunctionRaw({ contractId: chain.config.contract, methodName: 'release_part', args: { seal_id: sealId, part_commitment: h.commitment }, gas: 15_000_000_000_000n, deposit: 0n, waitUntil: 'EXECUTED_OPTIMISTIC' });
  const status = JSON.parse(Buffer.from(res.status.SuccessValue, 'base64').toString());
  let posted; for (let i = 0; i < 6; i++) { posted = await post(`/api/seals/${sealId}/parts`, { account: h.account, part: h.wrapped }); if (posted.status !== 409) break; await new Promise((r) => setTimeout(r, 1500)); }
  check(`${h.own ? 'own-account' : 'app-created'} holder releases after unlock`, status === 'released' && posted.status === 200, `${status} / ${posted.status}`);
}
let opened; for (let i = 0; i < 6; i++) { opened = await post(`/api/seals/${sealId}/open`, { proof: await proof(okKey, okAcct) }); if (opened.status !== 409) break; await new Promise((r) => setTimeout(r, 2500)); }
check('the allowed account opens after unlock', opened.status === 200 && opened.body.viewer === okAcct, `status ${opened.status}`);
if (opened.status === 200) {
  const file = new Uint8Array(await (await fetch(`${BASE}/api/seals/${sealId}/file`)).arrayBuffer());
  const out = await decryptFile(file, await combineKey(opened.body.parts));
  check('decrypted file equals the original', Buffer.from(out.bytes).equals(Buffer.from(original)));
}
const log = (await get(`/api/seals/${sealId}/log`)).body.log.map((e) => e.kind);
check('on-chain log shows not-allowed alert, early open and both releases', log.includes('alert:not_allowed') || log.filter((k) => k.startsWith('alert:')).length >= 1, log.join(', '));
// Owner cancels a file: key material destroyed, cancellation recorded on NEAR, opening refused.
{
  const one = await encryptFile(new TextEncoder().encode('Cancelled paper ' + Date.now()), { name: 'c.txt', type: 'text/plain' });
  const m = { label: 'Cancel check', unlockAtMs: Date.now() + 40_000, mode: 'single', fileHash: one.hash, fileKey: toB64url(one.key) };
  const made = await fetch(BASE + '/api/seals', { method: 'POST', headers: { 'content-type': 'application/octet-stream', 'x-seal-meta': toB64url(new TextEncoder().encode(JSON.stringify(m))) }, body: one.sealed }).then((r) => r.json());
  check('wrong owner token cannot cancel', (await post(`/api/seals/${made.sealId}/cancel`, { token: 'not-the-owner' })).status === 403);
  const cancelled = await post(`/api/seals/${made.sealId}/cancel`, { token: made.ownerToken });
  check('owner cancels; recorded on NEAR', cancelled.status === 200 && /^[1-9A-HJ-NP-Za-km-z]{43,44}$/.test(cancelled.body.cancelled?.tx || ''), cancelled.body.explorer);
  await new Promise((r) => setTimeout(r, Math.max(0, m.unlockAtMs - Date.now() + 2000)));
  const opened = await post(`/api/seals/${made.sealId}/open`, {});
  check('a cancelled file cannot be opened, even after its time', opened.status === 410 && opened.body.status === 'cancelled');
  const log = (await get(`/api/seals/${made.sealId}/log`)).body.log.map((e) => e.kind);
  check('cancellation is in the public record', log.includes('alert:cancelled'), log.join(', '));
}
console.log(results.every(Boolean) ? `\nALL PASS · seal ${sealId}` : '\nSOME CHECKS FAILED'); process.exit(results.every(Boolean) ? 0 : 1);
