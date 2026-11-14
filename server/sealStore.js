// Off-chain storage for the release service: encrypted files, seal metadata, released key
// parts and alert records. Files are already encrypted in the owner's browser; the
// single-mode file key and split-mode wrap key are additionally encrypted at rest.
//   local:  files and JSON on disk (DATA_DIR)
//   cloud:  ciphertext in Vercel Blob, metadata and alerts in Redis (Upstash)
import fs from 'node:fs';
import path from 'node:path';
import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto';

const ID = /^[A-Za-z0-9_-]{6,64}$/;
const sha = (v) => createHash('sha256').update(v).digest('hex');
const checkId = (id) => { if (!ID.test(id)) throw new Error('Invalid seal id'); return id; };

export function escrowKey(env = process.env) {
  const secret = env.SEAL_ESCROW_SECRET;
  if (!secret) throw new Error('SEAL_ESCROW_SECRET is required');
  return createHash('sha256').update('sealed-paper-escrow-v1:' + secret).digest();
}
export function sealBox(key, plaintext) {
  const iv = randomBytes(12), c = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([c.update(plaintext), c.final()]);
  return [iv, c.getAuthTag(), ct].map((b) => b.toString('base64url')).join('.');
}
export function openBox(key, box) {
  const [iv, tag, ct] = box.split('.').map((s) => Buffer.from(s, 'base64url'));
  const d = createDecipheriv('aes-256-gcm', key, iv); d.setAuthTag(tag);
  return Buffer.concat([d.update(ct), d.final()]);
}

const common = {
  newId: () => randomBytes(12).toString('base64url'),
  newToken: () => randomBytes(24).toString('base64url'),
  tokenHash: sha,
  checkToken(meta, token) {
    if (typeof token !== 'string' || !meta?.ownerTokenHash) return false;
    const a = Buffer.from(sha(token)), b = Buffer.from(meta.ownerTokenHash);
    return a.length === b.length && timingSafeEqual(a, b);
  },
};

/** Local disk backend (also used by tests). */
export function openSealStore(dir) {
  const root = path.resolve(dir, 'seals');
  fs.mkdirSync(root, { recursive: true });
  const file = (id, ext) => path.join(root, `${checkId(id)}.${ext}`);
  const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } };
  const writeJson = (p, v) => { const tmp = p + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(v)); fs.renameSync(tmp, p); };
  const alerts = (id) => { try { return fs.readFileSync(file(id, 'alerts'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } };
  return {
    ...common, kind: 'disk',
    async saveFile(id, bytes) { fs.writeFileSync(file(id, 'sealed'), bytes); },
    async readFile(id) { try { return fs.readFileSync(file(id, 'sealed')); } catch { return null; } },
    async saveMeta(id, meta) { writeJson(file(id, 'json'), meta); },
    async readMeta(id) { return readJson(file(id, 'json')); },
    async updateMeta(id, fn) { const m = readJson(file(id, 'json')); if (!m) return null; const next = fn(m) || m; writeJson(file(id, 'json'), next); return next; },
    async appendAlert(id, alert) { fs.appendFileSync(file(id, 'alerts'), JSON.stringify(alert) + '\n'); },
    async readAlerts(id) { return alerts(id); },
    async updateAlert(id, alertId, patch) {
      const list = alerts(id).map((a) => (a.id === alertId ? { ...a, ...patch } : a));
      fs.writeFileSync(file(id, 'alerts'), list.map((a) => JSON.stringify(a)).join('\n') + '\n');
    },
  };
}

/** Vercel backend: ciphertext in Blob (uploaded directly by the browser), records in Redis. */
export function openCloudStore(kv, { fetcher = fetch } = {}) {
  return {
    ...common, kind: 'cloud',
    // In the cloud the browser uploads ciphertext to Blob itself; meta.blobUrl points to it.
    async saveFile() { throw new Error('Cloud uploads go directly to Blob'); },
    async readFile(id) {
      const meta = await kv.get(`seal:${checkId(id)}`);
      if (!meta?.blobUrl) return null;
      const r = await fetcher(meta.blobUrl, { cache: 'no-store' });
      return r.ok ? Buffer.from(await r.arrayBuffer()) : null;
    },
    async saveMeta(id, meta) { await kv.set(`seal:${checkId(id)}`, meta); },
    async readMeta(id) { return ID.test(id) ? kv.get(`seal:${id}`) : null; },
    async updateMeta(id, fn) { const m = await kv.get(`seal:${checkId(id)}`); if (!m) return null; const next = fn(m) || m; await kv.set(`seal:${id}`, next); return next; },
    async appendAlert(id, alert) { await kv.rpush(`alerts:${checkId(id)}`, alert); },
    async readAlerts(id) { return kv.lrange(`alerts:${checkId(id)}`); },
    async updateAlert(id, alertId, patch) {
      const list = await kv.lrange(`alerts:${checkId(id)}`);
      const i = list.findIndex((a) => a.id === alertId);
      if (i >= 0) await kv.lset(`alerts:${id}`, i, { ...list[i], ...patch });
    },
  };
}
