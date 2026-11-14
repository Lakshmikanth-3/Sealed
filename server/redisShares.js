// Shared evidence packs in Upstash Redis (REST API), for serverless hosts such as Vercel
// where the filesystem does not persist. Same contract as the SQLite store: random IDs,
// only a SHA-256 of the management token is stored, expiry enforced by Redis TTL.
import { randomBytes, createHash } from 'node:crypto';

const digest = (value) => createHash('sha256').update(value).digest('hex');
const PREFIX = 'appeal:share:';

export function redisConfig(env = process.env) {
  const url = env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL;
  const token = env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url: url.replace(/\/+$/, ''), token } : null;
}

export function openRedisShares({ url, token }, { fetcher = fetch, maxPackBytes = 9 * 1024 * 1024, now = Date.now } = {}) {
  async function command(...args) {
    const r = await fetcher(url, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(args), signal: AbortSignal.timeout(10000) });
    const body = await r.json().catch(() => ({}));
    if (!r.ok || body.error) throw new Error('Shared storage unavailable');
    return body.result;
  }
  return {
    async create(pack, ttlSeconds = 86400) {
      if (!Number.isSafeInteger(ttlSeconds) || ttlSeconds < 300 || ttlSeconds > 604800) throw new Error('Share lifetime must be between 5 minutes and 7 days');
      const encoded = JSON.stringify(pack);
      if (Buffer.byteLength(encoded) > maxPackBytes) throw new Error('Pack is too large for hosted sharing. Exclude screenshots or share the downloaded pack file.');
      const id = randomBytes(24).toString('base64url'), managementToken = randomBytes(32).toString('base64url');
      const expiresAt = now() + ttlSeconds * 1000;
      const stored = await command('SET', PREFIX + id, JSON.stringify({ tokenHash: digest(managementToken), expiresAt, pack: encoded }), 'EX', ttlSeconds, 'NX');
      if (stored !== 'OK') throw new Error('Shared storage unavailable');
      return { id, managementToken, expiresAt, url: `/verify?id=${id}` };
    },
    async read(id) {
      const raw = await command('GET', PREFIX + id);
      if (!raw) return null;
      const row = JSON.parse(raw);
      return row.expiresAt > now() ? JSON.parse(row.pack) : null;
    },
    async revoke(id, managementToken) {
      if (typeof managementToken !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(managementToken)) return false;
      const raw = await command('GET', PREFIX + id);
      if (!raw || JSON.parse(raw).tokenHash !== digest(managementToken)) return false;
      return (await command('DEL', PREFIX + id)) === 1;
    },
    cleanupExpired: () => true,
    close() {},
  };
}
