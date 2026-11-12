// Shared by server, demo script and browser (verifier + worker app).
// Leaves: SHA-256(0x00 || canonicalJSON(entry)). Nodes: SHA-256(0x01 || left || right).
// An odd node at the end of a level is promoted unchanged (no duplication).
// Every entry carries a random salt so low-entropy fields (pay, times) cannot be brute-forced from the root.

const enc = new TextEncoder();

export function canonical(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  return '{' + Object.keys(v).filter((k) => v[k] !== undefined).sort()
    .map((k) => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}';
}

export const toHex = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
export const fromHex = (h) => Uint8Array.from(h.match(/../g) || [], (x) => parseInt(x, 16));

export async function sha256(bytes) {
  return new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes));
}
export async function sha256Hex(data) {
  return toHex(await sha256(typeof data === 'string' ? enc.encode(data) : data));
}

function cat(...parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

export async function leafHash(entry) {
  return toHex(await sha256(cat(Uint8Array.of(0), enc.encode(canonical(entry)))));
}
async function nodeHash(l, r) {
  return toHex(await sha256(cat(Uint8Array.of(1), fromHex(l), fromHex(r))));
}

async function levels(leaves) {
  if (!leaves.length) throw new Error('cannot build a tree with no entries');
  const lv = [leaves];
  while (lv.at(-1).length > 1) {
    const cur = lv.at(-1), next = [];
    for (let i = 0; i < cur.length; i += 2) next.push(i + 1 < cur.length ? await nodeHash(cur[i], cur[i + 1]) : cur[i]);
    lv.push(next);
  }
  return lv;
}

export async function merkleRoot(entries) {
  const lv = await levels(await Promise.all(entries.map(leafHash)));
  return lv.at(-1)[0];
}

export async function merkleProof(entries, index) {
  if (!Number.isInteger(index) || index < 0 || index >= entries.length) throw new Error('Invalid leaf index');
  const lv = await levels(await Promise.all(entries.map(leafHash)));
  const proof = [];
  for (let d = 0; d < lv.length - 1; d++) {
    const sib = index ^ 1;
    if (sib < lv[d].length) proof.push({ side: index % 2 ? 'L' : 'R', hash: lv[d][sib] });
    index = Math.floor(index / 2);
  }
  return proof;
}

export async function verifyProof(entry, proof, root) {
  if (typeof root !== 'string' || !/^[0-9a-f]{64}$/.test(root) || !Array.isArray(proof) || proof.length > 32) return false;
  if (proof.some((p) => !p || !['L', 'R'].includes(p.side) || typeof p.hash !== 'string' || !/^[0-9a-f]{64}$/.test(p.hash))) return false;
  let h = await leafHash(entry);
  for (const p of proof) h = p.side === 'L' ? await nodeHash(p.hash, h) : await nodeHash(h, p.hash);
  return h === root;
}

export function randomSalt() {
  return toHex(globalThis.crypto.getRandomValues(new Uint8Array(16)));
}
