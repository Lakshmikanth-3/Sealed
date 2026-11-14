// NEAR account lookup and NEP-413 proof of account ownership.
// A viewer on a seal's allow-list proves control of their account by signing a one-time
// challenge in their wallet. The signature must verify, and the signing key must be a
// full-access key of that account on-chain right now.
import { createHash, randomBytes } from 'node:crypto';
import { PublicKey } from 'near-api-js';

export const NAMED = /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/;
export const validAccountId = (id) => typeof id === 'string' && id.length >= 2 && id.length <= 64 && NAMED.test(id);
const NEP413_TAG = 2 ** 31 + 413;

/** Borsh-serialized NEP-413 payload, hashed: what the wallet actually signs. */
export function nep413Hash({ message, nonce, recipient, callbackUrl = null }) {
  const str = (s) => { const b = Buffer.from(s, 'utf8'); const len = Buffer.alloc(4); len.writeUInt32LE(b.length); return Buffer.concat([len, b]); };
  if (nonce.length !== 32) throw new Error('Nonce must be 32 bytes');
  const tag = Buffer.alloc(4); tag.writeUInt32LE(NEP413_TAG);
  const cb = callbackUrl === null ? Buffer.from([0]) : Buffer.concat([Buffer.from([1]), str(callbackUrl)]);
  return createHash('sha256').update(Buffer.concat([tag, str(message), Buffer.from(nonce), str(recipient), cb])).digest();
}

/** One-time challenges, kept in the shared KV store so any server instance can verify them. */
export function createChallenges({ kv, ttlMs = 5 * 60_000, now = Date.now }) {
  return {
    async issue(sealId, recipient) {
      const nonce = randomBytes(32).toString('base64');
      const message = `Open Sealed seal ${sealId}`;
      await kv.set(`ch:${nonce}`, { sealId, message, recipient, expires: now() + ttlMs }, Math.ceil(ttlMs / 1000));
      return { nonce, message, recipient };
    },
    /** One-time use: a challenge is consumed whether or not the proof verifies. */
    async take(nonce, sealId) {
      if (typeof nonce !== 'string' || !nonce) return null;
      const c = await kv.take(`ch:${nonce}`);
      if (!c || c.sealId !== sealId || c.expires < now()) return null;
      return c;
    },
  };
}

/** Verify a wallet's NEP-413 proof. lookupKey(accountId, publicKey) returns the on-chain access key or null. */
export async function verifyProof(proof, challenge, lookupKey) {
  if (!proof || !validAccountId(proof.accountId) || typeof proof.publicKey !== 'string' || typeof proof.signature !== 'string') return { ok: false, reason: 'Malformed proof' };
  let key, sig;
  try { key = PublicKey.fromString(proof.publicKey); sig = Buffer.from(proof.signature, 'base64'); } catch { return { ok: false, reason: 'Malformed key or signature' }; }
  const hash = nep413Hash({ message: challenge.message, nonce: Buffer.from(proof.nonce || '', 'base64'), recipient: challenge.recipient });
  if (!key.verify(hash, sig)) return { ok: false, reason: 'Signature does not verify' };
  const access = await lookupKey(proof.accountId, proof.publicKey).catch(() => null);
  if (!access) return { ok: false, reason: 'Key is not on this account' };
  if (access.permission !== 'FullAccess') return { ok: false, reason: 'Proof must be signed with a full-access key' };
  return { ok: true, accountId: proof.accountId };
}
