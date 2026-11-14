// Browser bundle for Sealed: file encryption, Shamir parts, holder signing, QR codes.
import { Account, JsonRpcProvider, FailoverRpcProvider, KeyPair, KeyPairSigner } from 'near-api-js';
import qrcode from 'qrcode-generator';
export * from '../lib/sealcrypto.js';

/** A fresh holder key; the implicit account id is the hex of its public key. */
export function newHolderKey() {
  const kp = KeyPair.fromRandom('ed25519');
  const account = [...kp.getPublicKey().data].map((b) => b.toString(16).padStart(2, '0')).join('');
  return { account, secretKey: kp.toString() };
}

/** Holder signs release_part with their own key. Returns { status, txHash }. */
export async function releasePart({ rpcUrls, contract, sealId, account, secretKey, commitment }) {
  const provider = new FailoverRpcProvider(rpcUrls.map((url) => new JsonRpcProvider({ url })));
  const acct = new Account(account, provider, KeyPairSigner.fromSecretKey(secretKey));
  const res = await acct.callFunctionRaw({ contractId: contract, methodName: 'release_part', args: { seal_id: sealId, part_commitment: commitment },
    gas: 15_000_000_000_000n, deposit: 0n, waitUntil: 'EXECUTED_OPTIMISTIC' });
  if (res.status?.Failure) throw new Error('Release transaction failed on-chain');
  return { status: JSON.parse(atob(res.status.SuccessValue)), txHash: res.transaction.hash };
}

/** QR code as an SVG string (no external service). */
export function qrSvg(text, cell = 4) {
  const q = qrcode(0, 'M'); q.addData(text); q.make();
  return q.createSvgTag({ cellSize: cell, margin: 2, scalable: true });
}

/** Vercel Blob client upload of ciphertext (one-time token issued by /api/upload). */
export async function uploadToBlob(bytes, sealName, onProgress) {
  const { upload } = await import('@vercel/blob/client');
  const blob = await upload(`seals/${sealName}.sealedfile`, new Blob([bytes], { type: 'application/octet-stream' }),
    { access: 'public', handleUploadUrl: '/api/upload', contentType: 'application/octet-stream', multipart: bytes.length > 8 * 1024 * 1024,
      onUploadProgress: onProgress ? (e) => onProgress(e.percentage) : undefined });
  return blob.url;
}
