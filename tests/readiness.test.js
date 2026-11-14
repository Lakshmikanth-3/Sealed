import test from 'node:test';
import assert from 'node:assert/strict';
import { contractReadiness } from '../server/readiness.js';

const chain = { network: 'testnet', contract: 'kanth_s.testnet', rpcUrl: 'https://primary' };
const enc = (v) => [...Buffer.from(JSON.stringify(v))];
function node({ registered = true, chainId = 'testnet' } = {}) {
  return async (_url, init) => {
    const { method, params } = JSON.parse(init.body);
    const ok = (result) => ({ ok: true, json: async () => ({ result }) });
    if (method === 'status') return ok({ chain_id: chainId });
    if (params.method_name === 'get_config') return ok({ result: enc({ protocol: 2, network: 'testnet' }) });
    if (params.method_name === 'is_registered') return ok({ result: enc(registered) });
    throw new Error('unexpected');
  };
}

test('uses the fallback RPC when the primary is rate-limited', async () => {
  const healthy = node();
  const fetcher = (url, init) => url === 'https://primary' ? Promise.resolve({ ok: false, status: 429 }) : healthy(url, init);
  const r = await contractReadiness(chain, 'lakshmi_kanth.testnet', { endpoints: ['https://primary', 'https://fallback'], fetcher });
  assert.equal(r.ready, true);
});

test('reports unavailability only when every RPC fails', async () => {
  const fetcher = async () => ({ ok: false, status: 429 });
  await assert.rejects(contractReadiness(chain, undefined, { endpoints: ['https://a', 'https://b'], fetcher }), /NEAR RPC unavailable/);
  await assert.rejects(contractReadiness(chain, undefined, { endpoints: ['https://a'], fetcher: () => Promise.reject(new Error('offline')) }), /NEAR RPC unavailable/);
});

test('still refuses unregistered workers and wrong networks', async () => {
  await assert.rejects(contractReadiness(chain, 'x.testnet', { endpoints: ['https://a'], fetcher: node({ registered: false }) }), /must register/);
  await assert.rejects(contractReadiness(chain, undefined, { endpoints: ['https://a'], fetcher: node({ chainId: 'mainnet' }) }), /network mismatch/);
});
