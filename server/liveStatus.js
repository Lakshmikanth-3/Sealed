// Cached, read-only chain snapshot for the landing page and dashboard. One upstream
// read per TTL serves every browser, so public RPC rate limits are not multiplied by
// open tabs. Failures are reported per field; values are never invented. When every
// read fails, the last good snapshot is returned marked `stale` with its age.
// Evidence verification does not use this module; it keeps the configured RPC only.
import { validNearAccount } from '../lib/schema.js';

const TTL_MS = 5000, BACKOFF_MS = 30000, MAX_WORKERS_CACHED = 500;
export const FALLBACK_RPC = { testnet: ['https://test.rpc.fastnear.com'], mainnet: ['https://free.rpc.fastnear.com'] };

export function rpcEndpoints(chain, env = process.env) {
  // Empty or unset means the default fallback; "none" disables fallbacks.
  if (env.NEAR_RPC_FALLBACK_URLS?.trim() === 'none') return [chain.rpcUrl];
  const extra = env.NEAR_RPC_FALLBACK_URLS?.trim()
    ? env.NEAR_RPC_FALLBACK_URLS.split(',').map((u) => u.trim()).filter((u) => /^https:\/\/[^\s]+$/.test(u))
    : FALLBACK_RPC[chain.network] || [];
  return [...new Set([chain.rpcUrl, ...extra])];
}

export function createLiveStatus(chain, { fetcher = fetch, now = Date.now, endpoints = rpcEndpoints(chain) } = {}) {
  let shared, sharedAt = 0, ttl = TTL_MS, lastGood, inflight;
  const workers = new Map();

  async function rpc(method, params) {
    let last;
    for (const url of endpoints) {
      try {
        const r = await fetcher(url, { method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 'appeal-live', method, params }), signal: AbortSignal.timeout(8000) });
        if (!r.ok) throw new Error(`RPC HTTP ${r.status}`);
        const body = await r.json();
        // A JSON-RPC error is a real answer (for example, unknown account); do not retry it elsewhere.
        if (body.error) throw Object.assign(new Error(String(body.error.data || body.error.message || 'RPC error').slice(0, 200)), { final: true });
        return body.result;
      } catch (e) { last = e; if (e.final) break; }
    }
    throw last;
  }
  const view = async (method, args) => {
    const res = await rpc('query', { request_type: 'call_function', finality: 'final', account_id: chain.contract,
      method_name: method, args_base64: Buffer.from(JSON.stringify(args)).toString('base64') });
    return JSON.parse(Buffer.from(res.result).toString('utf8'));
  };

  async function readShared() {
    const snap = { at: new Date(now()).toISOString(), network: chain.network, contract: chain.contract,
      block: null, blockHash: null, blockTime: null, config: null, storageBytes: null, balanceYocto: null, stale: false, errors: [] };
    const tasks = [rpc('block', { finality: 'final' }).then((b) => {
      snap.block = b.header.height; snap.blockHash = b.header.hash;
      snap.blockTime = new Date(Number(BigInt(b.header.timestamp_nanosec) / 1000000n)).toISOString();
    })];
    if (chain.contract) {
      tasks.push(view('get_config', {}).then((c) => { snap.config = c; }));
      tasks.push(rpc('query', { request_type: 'view_account', finality: 'final', account_id: chain.contract })
        .then((a) => { snap.storageBytes = a.storage_usage; snap.balanceYocto = a.amount; }));
    }
    const results = await Promise.allSettled(tasks);
    for (const r of results) if (r.status === 'rejected') snap.errors.push(r.reason?.message || 'RPC error');
    const allFailed = results.every((r) => r.status === 'rejected');
    ttl = snap.errors.some((e) => /HTTP 429/.test(e)) ? BACKOFF_MS : TTL_MS;
    if (allFailed && lastGood) return { ...lastGood, stale: true, errors: snap.errors, checkedAt: snap.at };
    if (!allFailed) lastGood = snap;
    return snap;
  }

  async function registered(worker) {
    const hit = workers.get(worker);
    if (hit && now() - hit.at < Math.max(ttl, TTL_MS)) return hit.value;
    const value = await view('is_registered', { worker });
    if (workers.size >= MAX_WORKERS_CACHED) workers.delete(workers.keys().next().value);
    workers.set(worker, { at: now(), value: value === true });
    return value === true;
  }

  return async function snapshot(worker) {
    if (worker !== undefined && worker !== null && !validNearAccount(worker)) throw new Error('Invalid worker account');
    if (!shared || now() - sharedAt >= ttl) {
      inflight ||= readShared().then((s) => { shared = s; sharedAt = now(); return s; }).finally(() => { inflight = undefined; });
      await inflight;
    }
    const out = { ...shared, errors: [...shared.errors], registered: null };
    if (worker && chain.contract) {
      try { out.registered = await registered(worker); } catch (e) { out.errors.push(e.message); }
    }
    return out;
  };
}
