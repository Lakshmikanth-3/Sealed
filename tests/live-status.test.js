import test from 'node:test';
import assert from 'node:assert/strict';
import { createLiveStatus } from '../server/liveStatus.js';

const chain = { network: 'testnet', contract: 'kanth_s.testnet', rpcUrl: 'https://rpc.example' };
const enc = (v) => [...Buffer.from(JSON.stringify(v))];
function fakeRpc(log, { failBlock = false } = {}) {
  return async (_url, init) => {
    const { method, params } = JSON.parse(init.body); log.push(params.method_name || params.request_type || method);
    const ok = (result) => ({ ok: true, json: async () => ({ result }) });
    if (method === 'block') return failBlock ? { ok: false, status: 429 } : ok({ header: { height: 123, hash: 'abc', timestamp_nanosec: '1763000000000000000' } });
    if (params.request_type === 'view_account') return ok({ storage_usage: 2048, amount: '10000000000000000000000000' });
    if (params.method_name === 'get_config') return ok({ result: enc({ protocol: 2, registered_workers: 1, max_workers: 10 }) });
    if (params.method_name === 'is_registered') return ok({ result: enc(JSON.parse(Buffer.from(params.args_base64, 'base64')).worker === 'lakshmi_kanth.testnet') });
    throw new Error('unexpected');
  };
}

test('one upstream read per cache window serves every caller', async () => {
  let t = 0; const log = [];
  const live = createLiveStatus(chain, { fetcher: fakeRpc(log), now: () => t });
  const [a, b] = await Promise.all([live(), live()]);
  assert.equal(a.block, 123); assert.equal(a.config.registered_workers, 1); assert.equal(a.storageBytes, 2048); assert.deepEqual(a.errors, []);
  assert.equal(b.block, 123); assert.equal(log.length, 3, 'concurrent callers share one read');
  await live(); assert.equal(log.length, 3);
  t = 6000; await live(); assert.equal(log.length, 6, 'refreshes after the TTL');
});

test('worker registration is read from the contract and validated', async () => {
  const live = createLiveStatus(chain, { fetcher: fakeRpc([]), now: () => 0 });
  assert.equal((await live('lakshmi_kanth.testnet')).registered, true);
  assert.equal((await live('someone.testnet')).registered, false);
  assert.equal((await live()).registered, null);
  await assert.rejects(live('Bad Account!'), /Invalid worker/);
});

test('failed reads are reported, not replaced with values', async () => {
  const live = createLiveStatus(chain, { fetcher: fakeRpc([], { failBlock: true }), now: () => 0 });
  const s = await live();
  assert.equal(s.block, null); assert.match(s.errors[0], /RPC HTTP 429/);
  assert.equal(s.config.max_workers, 10, 'other reads still succeed');
});

test('falls back to the next RPC on rate limit, then backs off', async () => {
  let t = 0; const hits = [];
  const fetcher = async (url, init) => { hits.push(url); if (url === 'https://primary') return { ok: false, status: 429 }; return fakeRpc([])(url, init); };
  const live = createLiveStatus(chain, { fetcher, now: () => t, endpoints: ['https://primary', 'https://fallback'] });
  const s = await live();
  assert.equal(s.block, 123); assert.deepEqual(s.errors, []);
  assert.ok(hits.includes('https://fallback'));
});

test('serves the last good reading marked stale when every read fails', async () => {
  let t = 0, down = false;
  const fetcher = async (url, init) => down ? { ok: false, status: 429 } : fakeRpc([])(url, init);
  const live = createLiveStatus(chain, { fetcher, now: () => t, endpoints: ['https://only'] });
  const good = await live(); assert.equal(good.stale, false);
  down = true; t = 6000;
  const stale = await live();
  assert.equal(stale.stale, true); assert.equal(stale.block, 123); assert.equal(stale.at, good.at, 'keeps the original reading time');
  assert.match(stale.errors[0], /429/);
  t = 20000; await live(); // inside the 30 s back-off: no new upstream read
  down = false; t = 37000; assert.equal((await live()).stale, false);
});

test('fallback list: default, custom, disabled', async () => {
  const { rpcEndpoints } = await import('../server/liveStatus.js');
  const c = { network: 'testnet', rpcUrl: 'https://rpc.testnet.near.org' };
  assert.deepEqual(rpcEndpoints(c, {}), ['https://rpc.testnet.near.org', 'https://test.rpc.fastnear.com']);
  assert.deepEqual(rpcEndpoints(c, { NEAR_RPC_FALLBACK_URLS: '' }), ['https://rpc.testnet.near.org', 'https://test.rpc.fastnear.com']);
  assert.deepEqual(rpcEndpoints(c, { NEAR_RPC_FALLBACK_URLS: 'https://a.example, http://insecure, https://b.example' }), ['https://rpc.testnet.near.org', 'https://a.example', 'https://b.example']);
  assert.deepEqual(rpcEndpoints(c, { NEAR_RPC_FALLBACK_URLS: 'none' }), ['https://rpc.testnet.near.org']);
});
