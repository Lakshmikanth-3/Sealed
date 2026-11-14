import test from 'node:test';
import assert from 'node:assert/strict';
import { KeyPair } from 'near-api-js';
import { nep413Hash, createChallenges, verifyProof, validAccountId } from '../server/nearAuth.js';
import { memoryKv } from '../server/kv.js';
const challenges = (opts = {}) => createChallenges({ kv: memoryKv(opts), ...opts });

const kp = KeyPair.fromRandom('ed25519');
const pub = kp.getPublicKey().toString();
function sign(challenge, keyPair = kp) {
  const hash = nep413Hash({ message: challenge.message, nonce: Buffer.from(challenge.nonce, 'base64'), recipient: challenge.recipient });
  return { accountId: 'kanth.testnet', publicKey: keyPair.getPublicKey().toString(), signature: Buffer.from(keyPair.sign(hash).signature).toString('base64'), nonce: challenge.nonce };
}
const onChain = (permission = 'FullAccess') => async (account, key) => (account === 'kanth.testnet' && key === pub ? { permission } : null);

test('a wallet-signed challenge proves the account', async () => {
  const ch = await challenges().issue('seal-abc123', 'sealed.kanth_s.testnet');
  assert.match(ch.message, /seal-abc123/);
  const r = await verifyProof(sign(ch), ch, onChain());
  assert.deepEqual(r, { ok: true, accountId: 'kanth.testnet' });
});

test('rejects a bad signature, a foreign key, a function-call key and a malformed proof', async () => {
  const ch = await challenges().issue('seal-abc123', 'sealed.kanth_s.testnet');
  const good = sign(ch);
  assert.equal((await verifyProof({ ...good, signature: Buffer.alloc(64).toString('base64') }, ch, onChain())).reason, 'Signature does not verify');
  assert.equal((await verifyProof({ ...good, message: 'x' }, { ...ch, message: 'Open something else' }, onChain())).reason, 'Signature does not verify');
  const other = KeyPair.fromRandom('ed25519');
  assert.equal((await verifyProof(sign(ch, other), ch, onChain())).reason, 'Key is not on this account');
  assert.equal((await verifyProof(good, ch, onChain('FunctionCall'))).reason, 'Proof must be signed with a full-access key');
  assert.equal((await verifyProof({ ...good, accountId: 'BAD ACCOUNT' }, ch, onChain())).reason, 'Malformed proof');
  assert.equal((await verifyProof({ ...good, accountId: 'someone.testnet' }, ch, onChain())).reason, 'Key is not on this account');
});

test('challenges are one-time, bound to the seal and expire', async () => {
  let t = 0; const c = challenges({ ttlMs: 1000, now: () => t });
  const a = await c.issue('seal-abc123', 'r');
  assert.equal(await c.take(a.nonce, 'seal-other1'), null, 'wrong seal');
  assert.equal(await c.take(a.nonce, 'seal-abc123'), null, 'consumed by the failed attempt');
  const b = await c.issue('seal-abc123', 'r'); assert.ok(await c.take(b.nonce, 'seal-abc123'));
  assert.equal(await c.take(b.nonce, 'seal-abc123'), null, 'no replay');
  const d = await c.issue('seal-abc123', 'r'); t = 2000; assert.equal(await c.take(d.nonce, 'seal-abc123'), null, 'expired');
});

test('account id validation', () => {
  for (const ok of ['kanth.testnet', 'lakshmi_kanth.testnet', 'a1-b2.near', '4f'.repeat(32)]) assert.ok(validAccountId(ok), ok);
  for (const bad of ['Kanth.testnet', 'a', 'kanth..testnet', 'kanth.testnet.', 'x'.repeat(65), 12]) assert.ok(!validAccountId(bad), String(bad));
});
