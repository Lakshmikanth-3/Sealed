// Sealed file encryption (browser and Node, via WebCrypto).
//
// Container format "SEALPAP1":
//   magic (8 bytes) | u32 chunkSize | u32 chunkCount | chunks...
//   chunk = u32 cipherLength | iv (12 bytes) | AES-256-GCM ciphertext+tag
// Chunk 0 holds encrypted metadata (name, type, size); chunks 1..n hold file bytes.
// Each chunk's additional data binds its index and the total count, so reordering,
// dropping or truncating chunks fails authentication.
import { split as shamirSplit, combine as shamirCombine } from 'shamir-secret-sharing';

export const MAX_FILE_BYTES = 100 * 1024 * 1024;
export const CHUNK_BYTES = 1024 * 1024;
const MAGIC = new TextEncoder().encode('SEALPAP1');
const subtle = () => globalThis.crypto.subtle;

export class AuthFailure extends Error {
  constructor(message = 'Decryption failed: wrong key or altered file') { super(message); this.name = 'AuthFailure'; }
}

export function randomBytes(n) {
  const out = new Uint8Array(n); // getRandomValues fills at most 65,536 bytes per call
  for (let i = 0; i < n; i += 65536) globalThis.crypto.getRandomValues(out.subarray(i, Math.min(n, i + 65536)));
  return out;
}
export async function sha256Hex(bytes) {
  const d = new Uint8Array(await subtle().digest('SHA-256', bytes));
  return [...d].map((b) => b.toString(16).padStart(2, '0')).join('');
}
export const toB64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export function fromB64url(text) {
  if (typeof text !== 'string' || !/^[A-Za-z0-9_-]*$/.test(text)) throw new Error('Invalid base64url');
  const s = text.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(s + '='.repeat((4 - s.length % 4) % 4)), (c) => c.charCodeAt(0));
}
const aad = (index, count) => new TextEncoder().encode(`SP1:${index}:${count}`);
const importKey = (raw, usage) => {
  if (!(raw instanceof Uint8Array) || raw.length !== 32) throw new AuthFailure('File key must be 32 bytes');
  return subtle().importKey('raw', raw, 'AES-GCM', false, [usage]);
};

/** Encrypt bytes with metadata. Returns { sealed: Uint8Array, key: Uint8Array(32), hash }. */
export async function encryptFile(bytes, meta, { key = randomBytes(32), chunkBytes = CHUNK_BYTES } = {}) {
  if (!(bytes instanceof Uint8Array)) throw new Error('File bytes required');
  if (bytes.length > MAX_FILE_BYTES) throw new Error('Files are limited to 100 MB');
  const cryptoKey = await importKey(key, 'encrypt');
  const metaBytes = new TextEncoder().encode(JSON.stringify({ name: String(meta?.name || 'file').slice(0, 200), type: String(meta?.type || 'application/octet-stream').slice(0, 100), size: bytes.length }));
  const parts = [metaBytes];
  for (let i = 0; i < bytes.length; i += chunkBytes) parts.push(bytes.subarray(i, i + chunkBytes));
  const count = parts.length;
  const out = [MAGIC, u32(chunkBytes), u32(count)];
  for (let i = 0; i < count; i++) {
    const iv = randomBytes(12);
    const ct = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv, additionalData: aad(i, count) }, cryptoKey, parts[i]));
    out.push(u32(ct.length), iv, ct);
  }
  const sealed = concat(out);
  return { sealed, key, hash: await sha256Hex(sealed) };
}

/** Decrypt a container. Throws AuthFailure for a wrong key or any altered byte. */
export async function decryptFile(sealed, key) {
  if (!(sealed instanceof Uint8Array) || sealed.length < 16 || !MAGIC.every((b, i) => sealed[i] === b)) throw new AuthFailure('Not a Sealed file');
  const view = new DataView(sealed.buffer, sealed.byteOffset, sealed.byteLength);
  const count = view.getUint32(12);
  if (count < 1 || count > Math.ceil(MAX_FILE_BYTES / 1024) + 1) throw new AuthFailure('Corrupt container');
  const cryptoKey = await importKey(key, 'decrypt');
  let offset = 16; const chunks = [];
  for (let i = 0; i < count; i++) {
    if (offset + 16 > sealed.length) throw new AuthFailure('Truncated file');
    const len = view.getUint32(offset); const iv = sealed.subarray(offset + 4, offset + 16);
    const ct = sealed.subarray(offset + 16, offset + 16 + len);
    if (ct.length !== len) throw new AuthFailure('Truncated file');
    try { chunks.push(new Uint8Array(await subtle().decrypt({ name: 'AES-GCM', iv, additionalData: aad(i, count) }, cryptoKey, ct))); }
    catch { throw new AuthFailure(); }
    offset += 16 + len;
  }
  if (offset !== sealed.length) throw new AuthFailure('Unexpected trailing data');
  const meta = JSON.parse(new TextDecoder().decode(chunks[0]));
  const bytes = concat(chunks.slice(1));
  if (bytes.length !== meta.size) throw new AuthFailure('Size mismatch');
  return { bytes, meta };
}

/** Split a 32-byte key into N parts, K needed. Fewer than K parts reveal nothing. */
export async function splitKey(key, n, k) {
  if (!Number.isInteger(n) || n < 2 || n > 20) throw new Error('N must be between 2 and 20');
  if (!Number.isInteger(k) || k < 1 || k > n) throw new Error('K must be between 1 and N');
  // The library requires a threshold of at least 2; K = 1 means every part is the whole key.
  // Parts are tagged: "s." Shamir share, "k." the whole key (K = 1). The commitment covers the full tagged string.
  const raw = k === 1 ? Array.from({ length: n }, () => key) : await shamirSplit(key, n, k);
  const tag = k === 1 ? 'k.' : 's.';
  return Promise.all(raw.map(async (p) => { const part = tag + toB64url(p); return { part, commitment: await partCommitment(part) }; }));
}

/** SHA-256 of a tagged part string; this is what the contract stores and checks. */
export const partCommitment = (part) => sha256Hex(new TextEncoder().encode(part));

/** Rebuild the key from K or more tagged parts. */
export async function combineKey(parts) {
  if (!Array.isArray(parts) || !parts.length) throw new AuthFailure('Not enough key parts');
  if (parts.every((p) => typeof p === 'string' && p.startsWith('k.'))) return fromB64url(parts[0].slice(2));
  if (!parts.every((p) => typeof p === 'string' && p.startsWith('s.'))) throw new AuthFailure('Invalid key part');
  if (parts.length < 2) throw new AuthFailure('Not enough key parts');
  return shamirCombine([...new Set(parts)].map((p) => fromB64url(p.slice(2))));
}

function u32(n) { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, n); return b; }
function concat(list) {
  const out = new Uint8Array(list.reduce((n, b) => n + b.length, 0)); let o = 0;
  for (const b of list) { out.set(b, o); o += b.length; }
  return out;
}

// ---------- wrapped parts ----------
// Each holder's part is encrypted with a per-seal wrap key that only the release service
// holds, bound to the holder's account. Holders alone cannot combine parts; the service
// unwraps a part only after the contract records that holder's release.
export async function wrapPart(wrapKey, part, account) {
  const k = await subtle().importKey('raw', wrapKey, 'AES-GCM', false, ['encrypt']);
  const iv = randomBytes(12);
  const ct = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode('holder:' + account) }, k, new TextEncoder().encode(part)));
  return `w.${toB64url(iv)}.${toB64url(ct)}`;
}
export async function unwrapPart(wrapKey, wrapped, account) {
  const m = /^w\.([A-Za-z0-9_-]{16})\.([A-Za-z0-9_-]{20,200})$/.exec(wrapped || '');
  if (!m) throw new AuthFailure('Invalid wrapped part');
  const k = await subtle().importKey('raw', wrapKey, 'AES-GCM', false, ['decrypt']);
  try {
    return new TextDecoder().decode(await subtle().decrypt({ name: 'AES-GCM', iv: fromB64url(m[1]), additionalData: new TextEncoder().encode('holder:' + account) }, k, fromB64url(m[2])));
  } catch { throw new AuthFailure('Wrapped part does not belong to this seal or holder'); }
}
