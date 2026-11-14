import test from 'node:test';
import assert from 'node:assert/strict';
import { openRedisShares, redisConfig } from '../server/redisShares.js';

function fakeRedis({ fail = false } = {}) {
  const data = new Map(), calls = [];
  const fetcher = async (_url, init) => {
    const [cmd, key, value, , ttl, nx] = JSON.parse(init.body); calls.push({ cmd, key, ttl, auth: init.headers.authorization });
    if (fail) return { ok: false, json: async () => ({ error: 'down' }) };
    let result = null;
    if (cmd === 'SET') { if (nx === 'NX' && data.has(key)) result = null; else { data.set(key, value); result = 'OK'; } }
    if (cmd === 'GET') result = data.get(key) ?? null;
    if (cmd === 'DEL') result = data.delete(key) ? 1 : 0;
    return { ok: true, json: async () => ({ result }) };
  };
  return { data, calls, fetcher };
}

test('config accepts Vercel KV and Upstash variable names', () => {
  assert.deepEqual(redisConfig({ KV_REST_API_URL: 'https://x.upstash.io/', KV_REST_API_TOKEN: 't' }), { url: 'https://x.upstash.io', token: 't' });
  assert.deepEqual(redisConfig({ UPSTASH_REDIS_REST_URL: 'https://y', UPSTASH_REDIS_REST_TOKEN: 'u' }), { url: 'https://y', token: 'u' });
  assert.equal(redisConfig({}), null);
});

test('create, read and revoke with expiry and a hashed management token', async () => {
  let t = 1000; const r = fakeRedis();
  const store = openRedisShares({ url: 'https://r', token: 'secret' }, { fetcher: r.fetcher, now: () => t });
  const share = await store.create({ private: 'test-only record' }, 3600);
  assert.match(share.id, /^[\w-]{32}$/); assert.equal(share.url, `/verify?id=${share.id}`);
  assert.equal(r.calls[0].ttl, 3600); assert.equal(r.calls[0].auth, 'Bearer secret');
  assert.ok(![...r.data.values()][0].includes(share.managementToken), 'raw management token is never stored');
  assert.deepEqual(await store.read(share.id), { private: 'test-only record' });
  assert.equal(await store.revoke(share.id, 'A'.repeat(43)), false, 'wrong token cannot delete');
  assert.equal(await store.revoke(share.id, 'bad'), false);
  assert.equal(await store.revoke(share.id, share.managementToken), true);
  assert.equal(await store.read(share.id), null);
  const later = await store.create({ a: 1 }, 300); t += 301000;
  assert.equal(await store.read(later.id), null, 'expired even if Redis has not evicted yet');
});

test('rejects invalid lifetimes, oversized packs and storage failures', async () => {
  const r = fakeRedis();
  const store = openRedisShares({ url: 'https://r', token: 't' }, { fetcher: r.fetcher, maxPackBytes: 100 });
  await assert.rejects(store.create({}, 60), /between 5 minutes and 7 days/);
  await assert.rejects(store.create({ big: 'x'.repeat(200) }, 3600), /too large for hosted sharing/);
  const down = openRedisShares({ url: 'https://r', token: 't' }, { fetcher: fakeRedis({ fail: true }).fetcher });
  await assert.rejects(down.create({}, 3600), /Shared storage unavailable/);
  await assert.rejects(down.read('abcdef'), /Shared storage unavailable/);
});
