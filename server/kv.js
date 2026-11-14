// Small key-value store shared by rate limits, one-time challenges, escalation counters and
// (on Vercel) seal metadata and alerts. Memory locally; Upstash Redis REST when configured,
// so state is shared across serverless instances.
export function kvConfig(env = process.env) {
  const url = env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL, token = env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url: url.replace(/\/+$/, ''), token } : null;
}

export function memoryKv({ now = Date.now } = {}) {
  const data = new Map();
  const live = (k) => { const e = data.get(k); if (!e) return undefined; if (e.exp && e.exp <= now()) { data.delete(k); return undefined; } return e; };
  return {
    kind: 'memory',
    async get(k) { return live(k)?.v ?? null; },
    async set(k, v, ttlSec) { data.set(k, { v, exp: ttlSec ? now() + ttlSec * 1000 : 0 }); if (data.size > 50_000) data.clear(); },
    async del(k) { return data.delete(k) ? 1 : 0; },
    /** Get and delete atomically (one-time tokens). */
    async take(k) { const e = live(k); data.delete(k); return e?.v ?? null; },
    async incr(k, ttlSec) { const e = live(k); const n = (Number(e?.v) || 0) + 1; data.set(k, { v: n, exp: e?.exp || (ttlSec ? now() + ttlSec * 1000 : 0) }); return n; },
    async rpush(k, v) { const e = live(k); const list = e?.v || []; list.push(v); data.set(k, { v: list, exp: 0 }); return list.length; },
    async lrange(k) { return (live(k)?.v || []).slice(); },
    async lset(k, i, v) { const e = live(k); if (e) e.v[i] = v; },
  };
}

export function upstashKv({ url, token }, { fetcher = fetch } = {}) {
  async function cmd(...args) {
    const r = await fetcher(url, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(args.map((a) => (typeof a === 'string' || typeof a === 'number' ? a : JSON.stringify(a)))), signal: AbortSignal.timeout(8000) });
    const body = await r.json().catch(() => ({}));
    if (!r.ok || body.error) throw new Error('Shared storage unavailable');
    return body.result;
  }
  const parse = (v) => { if (v === null || v === undefined) return null; try { return JSON.parse(v); } catch { return v; } };
  return {
    kind: 'upstash',
    async get(k) { return parse(await cmd('GET', k)); },
    async set(k, v, ttlSec) { await (ttlSec ? cmd('SET', k, JSON.stringify(v), 'EX', ttlSec) : cmd('SET', k, JSON.stringify(v))); },
    async del(k) { return cmd('DEL', k); },
    async take(k) { return parse(await cmd('GETDEL', k)); },
    async incr(k, ttlSec) { const n = await cmd('INCR', k); if (n === 1 && ttlSec) await cmd('EXPIRE', k, ttlSec); return n; },
    async rpush(k, v) { return cmd('RPUSH', k, JSON.stringify(v)); },
    async lrange(k) { return (await cmd('LRANGE', k, 0, -1)).map(parse); },
    async lset(k, i, v) { await cmd('LSET', k, i, JSON.stringify(v)); },
  };
}

export const createKv = (env = process.env) => { const c = kvConfig(env); return c ? upstashKv(c) : memoryKv(); };

/** Fixed-window rate limit shared across instances. */
export async function limited(kv, key, max, windowMs) {
  const bucket = Math.floor(Date.now() / windowMs);
  return (await kv.incr(`rl:${key}:${bucket}`, Math.ceil(windowMs / 1000) + 1)) > max;
}
