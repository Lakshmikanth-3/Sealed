import test from 'node:test';
import assert from 'node:assert/strict';
import { memoryKv, upstashKv, kvConfig, limited } from '../server/kv.js';
import { openCloudStore } from '../server/sealStore.js';

// A tiny fake of the Upstash REST API (one Redis shared by every "instance").
function fakeUpstash() {
  const data = new Map(), lists = new Map(), calls = [];
  const fetcher = async (_url, init) => {
    const [cmd, k, ...rest] = JSON.parse(init.body); calls.push(cmd);
    let result = null;
    switch (cmd) {
      case 'GET': result = data.get(k) ?? null; break;
      case 'SET': data.set(k, rest[0]); result = 'OK'; break;
      case 'DEL': result = data.delete(k) ? 1 : 0; break;
      case 'GETDEL': result = data.get(k) ?? null; data.delete(k); break;
      case 'INCR': { const n = Number(data.get(k) || 0) + 1; data.set(k, String(n)); result = n; break; }
      case 'EXPIRE': result = 1; break;
      case 'RPUSH': { const l = lists.get(k) || []; l.push(rest[0]); lists.set(k, l); result = l.length; break; }
      case 'LRANGE': result = lists.get(k) || []; break;
      case 'LSET': lists.get(k)[rest[0]] = rest[1]; result = 'OK'; break;
    }
    return { ok: true, json: async () => ({ result }) };
  };
  return { fetcher, calls };
}

test('config accepts Vercel KV and Upstash variable names', () => {
  assert.deepEqual(kvConfig({ KV_REST_API_URL: 'https://x.upstash.io/', KV_REST_API_TOKEN: 't' }), { url: 'https://x.upstash.io', token: 't' });
  assert.deepEqual(kvConfig({ UPSTASH_REDIS_REST_URL: 'https://y', UPSTASH_REDIS_REST_TOKEN: 'u' }), { url: 'https://y', token: 'u' });
  assert.equal(kvConfig({}), null);
});

test('rate limits are shared across two server instances', async () => {
  const redis = fakeUpstash();
  const a = upstashKv({ url: 'https://r', token: 't' }, { fetcher: redis.fetcher });
  const b = upstashKv({ url: 'https://r', token: 't' }, { fetcher: redis.fetcher });
  const results = [];
  for (let i = 0; i < 6; i++) results.push(await limited(i % 2 ? a : b, 'open|seal|1.2.3.4', 4, 60_000));
  assert.deepEqual(results, [false, false, false, false, true, true], 'the 5th call is limited no matter which instance serves it');
  assert.ok(redis.calls.includes('EXPIRE'));
});

test('one-time take, JSON values and lists behave the same in memory and Upstash', async () => {
  for (const kv of [memoryKv(), upstashKv({ url: 'https://r', token: 't' }, { fetcher: fakeUpstash().fetcher })]) {
    await kv.set('ch:1', { sealId: 'abc' }, 300);
    assert.deepEqual(await kv.get('ch:1'), { sealId: 'abc' });
    assert.deepEqual(await kv.take('ch:1'), { sealId: 'abc' });
    assert.equal(await kv.take('ch:1'), null, `${kv.kind}: a challenge cannot be reused`);
    await kv.rpush('alerts:x', { id: 1 }); await kv.rpush('alerts:x', { id: 2 });
    await kv.lset('alerts:x', 1, { id: 2, chain: 'recorded' });
    assert.deepEqual(await kv.lrange('alerts:x'), [{ id: 1 }, { id: 2, chain: 'recorded' }]);
  }
});

test('memory entries expire', async () => {
  let t = 0; const kv = memoryKv({ now: () => t });
  await kv.set('k', 1, 10); t = 11_000; assert.equal(await kv.get('k'), null);
});

test('cloud seal store keeps metadata and alerts in Redis and reads ciphertext from Blob', async () => {
  const kv = upstashKv({ url: 'https://r', token: 't' }, { fetcher: fakeUpstash().fetcher });
  const blob = Buffer.from('SEALPAP1 ciphertext');
  const store = openCloudStore(kv, { fetcher: async (url) => ({ ok: url === 'https://s.public.blob.vercel-storage.com/seals/a.sealedfile', arrayBuffer: async () => blob }) });
  await store.saveMeta('seal-abc123', { sealId: 'seal-abc123', blobUrl: 'https://s.public.blob.vercel-storage.com/seals/a.sealedfile', parts: {} });
  assert.ok((await store.readFile('seal-abc123')).equals(blob));
  await store.updateMeta('seal-abc123', (m) => { m.parts.x = 's.part'; });
  assert.deepEqual((await store.readMeta('seal-abc123')).parts, { x: 's.part' });
  await store.appendAlert('seal-abc123', { id: 'a1', kind: 'early_open' });
  await store.updateAlert('seal-abc123', 'a1', { chain: { status: 'recorded' } });
  assert.equal((await store.readAlerts('seal-abc123'))[0].chain.status, 'recorded');
  assert.equal(await store.readMeta('../etc'), null);
  await assert.rejects(store.saveFile('seal-abc123', blob), /directly to Blob/);
});
