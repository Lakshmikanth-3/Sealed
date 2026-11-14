import test from 'node:test';
import assert from 'node:assert/strict';
import { encryptFile, decryptFile, splitKey, combineKey, partCommitment, sha256Hex, AuthFailure, randomBytes } from '../lib/sealcrypto.js';

const fileBytes = (header, size) => { const b = randomBytes(size); b.set(new TextEncoder().encode(header)); return b; };
const FILES = {
  'paper.pdf': ['application/pdf', fileBytes('%PDF-1.7\n', 40_000)],
  'photo.png': ['image/png', fileBytes('\x89PNG\r\n\x1a\n', 25_000)],
  'clip.mp4': ['video/mp4', fileBytes('\0\0\0\x18ftypmp42', 150_000)],
  'note.txt': ['text/plain', new TextEncoder().encode('Question 1: What is 2 + 2?\n'.repeat(100))],
};

test('round-trips PDF, image, video and text, across multiple chunks', async () => {
  for (const [name, [type, bytes]] of Object.entries(FILES)) {
    const { sealed, key, hash } = await encryptFile(bytes, { name, type }, { chunkBytes: 16_384 });
    assert.equal(hash, await sha256Hex(sealed));
    assert.ok(!Buffer.from(sealed).includes(Buffer.from(bytes.subarray(0, 64))), `${name}: plaintext not visible`);
    const out = await decryptFile(sealed, key);
    assert.deepEqual(out.meta, { name, type, size: bytes.length });
    assert.ok(Buffer.from(out.bytes).equals(Buffer.from(bytes)), `${name} round-trips`);
  }
});

test('Shamir (2,2), (3,5), (5,7): any K parts rebuild, K-1 parts cannot decrypt', async () => {
  const { sealed, key } = await encryptFile(FILES['paper.pdf'][1], { name: 'paper.pdf' });
  for (const [k, n] of [[2, 2], [3, 5], [5, 7]]) {
    const parts = await splitKey(key, n, k);
    assert.equal(parts.length, n);
    const pick = parts.slice(n - k).map((p) => p.part); // any K
    assert.ok(Buffer.from(await combineKey(pick)).equals(Buffer.from(key)), `${k}-of-${n} rebuilds`);
    if (k > 2) {
      const short = await combineKey(pick.slice(1)).catch(() => randomBytes(32));
      await assert.rejects(decryptFile(sealed, short), AuthFailure, `${k - 1} of ${n} parts cannot decrypt`);
    }
  }
  const two = await splitKey(key, 2, 2);
  await assert.rejects(combineKey([two[0].part]), /Not enough key parts/);
});

test('wrong part, wrong key and any altered byte fail authentication', async () => {
  const { sealed, key } = await encryptFile(FILES['note.txt'][1], { name: 'note.txt' }, { chunkBytes: 1000 });
  const parts = await splitKey(key, 3, 2);
  const other = await splitKey(randomBytes(32), 3, 2);
  const mixed = await combineKey([parts[0].part, other[1].part]);
  await assert.rejects(decryptFile(sealed, mixed), AuthFailure, 'a part from another seal');
  await assert.rejects(decryptFile(sealed, randomBytes(32)), AuthFailure);
  for (const at of [20, 40, sealed.length - 1]) {
    const bad = sealed.slice(); bad[at] ^= 1;
    await assert.rejects(decryptFile(bad, key), AuthFailure, `flip at ${at}`);
  }
  await assert.rejects(decryptFile(sealed.subarray(0, sealed.length - 100), key), AuthFailure, 'truncated');
  await assert.rejects(decryptFile(new TextEncoder().encode('not a sealed file at all'), key), AuthFailure);
});

test('reordering chunks fails even with the right key', async () => {
  const { sealed, key } = await encryptFile(new Uint8Array(3000).fill(1), { name: 'x' }, { chunkBytes: 1000 });
  // chunks 1 and 2 have equal length; swap them
  const view = new DataView(sealed.buffer); let o = 16; const spans = [];
  for (let i = 0; i < 4; i++) { const len = view.getUint32(o); spans.push([o, o + 16 + len]); o += 16 + len; }
  const [a, b] = [spans[1], spans[2]];
  const swapped = new Uint8Array([...sealed.subarray(0, a[0]), ...sealed.subarray(b[0], b[1]), ...sealed.subarray(a[0], a[1]), ...sealed.subarray(b[1])]);
  await assert.rejects(decryptFile(swapped, key), AuthFailure);
});

test('commitments are per part and K = 1 hands every holder the whole key', async () => {
  const key = randomBytes(32);
  const parts = await splitKey(key, 3, 2);
  assert.equal(new Set(parts.map((p) => p.commitment)).size, 3);
  assert.equal(parts[0].commitment, await partCommitment(parts[0].part));
  const one = await splitKey(key, 3, 1);
  assert.ok(Buffer.from(await combineKey([one[2].part])).equals(Buffer.from(key)));
  await assert.rejects(splitKey(key, 21, 2), /N must be between 2 and 20/);
  await assert.rejects(splitKey(key, 3, 4), /K must be between 1 and N/);
  await assert.rejects(combineKey(['x.abc', 's.abc']), /Invalid key part/);
});

test('rejects files over 100 MB', async () => {
  await assert.rejects(encryptFile({ length: 101 * 1024 * 1024, subarray() {} , __proto__: Uint8Array.prototype }, {}), /100 MB/);
});

test('wrapped parts: holders cannot read them; only the right seal and holder unwrap', async () => {
  const { wrapPart, unwrapPart } = await import('../lib/sealcrypto.js');
  const key = randomBytes(32), wrapKey = randomBytes(32);
  const parts = await splitKey(key, 3, 2);
  const wrapped = await Promise.all(parts.map((p, i) => wrapPart(wrapKey, p.part, 'holder' + i)));
  assert.ok(wrapped.every((w, i) => w.startsWith('w.') && !w.includes(parts[i].part.slice(2, 20))));
  await assert.rejects(combineKey(wrapped.slice(0, 2)), /Invalid key part/, 'holders cannot combine wrapped parts');
  const plain = await Promise.all([0, 2].map((i) => unwrapPart(wrapKey, wrapped[i], 'holder' + i)));
  assert.ok(Buffer.from(await combineKey(plain)).equals(Buffer.from(key)));
  await assert.rejects(unwrapPart(wrapKey, wrapped[0], 'holder1'), AuthFailure, 'bound to the holder account');
  await assert.rejects(unwrapPart(randomBytes(32), wrapped[0], 'holder0'), AuthFailure, 'bound to the seal wrap key');
});
