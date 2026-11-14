// Free and Premium plans. Premium is bought on the plans contract (subscribe), read live from
// NEAR (get_plan, cached 60 s), and proven by the buyer once with a NEP-413 signature. The
// server then issues a signed 24-hour pass so the browser does not have to sign every lock.
import { createHmac, timingSafeEqual } from 'node:crypto';

export function planLimits(env = process.env) {
  const n = (k, d) => (Number.isFinite(Number(env[k])) && Number(env[k]) > 0 ? Number(env[k]) : d);
  return {
    free: { dailyLocks: n('FREE_DAILY_LOCKS', 5), maxFileMb: n('FREE_MAX_FILE_MB', 10), maxPeople: n('FREE_MAX_PEOPLE', 3) },
    premium: { dailyLocks: null, maxFileMb: n('SEAL_MAX_FILE_MB', 100), maxPeople: 20 },
  };
}

export function createPlans({ chain, kv, secret, contract, now = Date.now }) {
  const cache = new Map();
  const passKey = createHmac('sha256', 'sealed-plan-pass-v1').update(String(secret || '')).digest();
  async function plan(account) {
    if (!contract) return { account, active: false, premiumUntilMs: 0 };
    const hit = cache.get(account);
    if (hit && now() - hit.at < 60_000) return hit.value;
    const p = await chain.viewOn(contract, 'get_plan', { account });
    const value = { account, active: Boolean(p.active), premiumUntilMs: Number(p.premium_until_ms) };
    cache.set(account, { at: now(), value });
    return value;
  }
  const sign = (body) => createHmac('sha256', passKey).update(body).digest('base64url');
  return {
    contract,
    plan,
    issuePass(account) {
      const body = Buffer.from(JSON.stringify({ account, exp: now() + 24 * 3600_000 })).toString('base64url');
      return `${body}.${sign(body)}`;
    },
    /** Returns the account for a valid, unexpired pass, else null. */
    readPass(pass) {
      const [body, sig] = String(pass || '').split('.');
      if (!body || !sig) return null;
      const want = Buffer.from(sign(body)), got = Buffer.from(sig);
      if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
      try { const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); return p.exp > now() ? p.account : null; } catch { return null; }
    },
    /** Free plan: count today's locks per visitor; returns remaining or -1 when the limit is reached. */
    async useFreeLock(visitor, limit) {
      const day = new Date(now()).toISOString().slice(0, 10);
      const used = await kv.incr(`free:${day}:${visitor}`, 26 * 3600);
      return used > limit ? -1 : limit - used;
    },
  };
}
