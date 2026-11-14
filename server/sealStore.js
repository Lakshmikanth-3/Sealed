// Off-chain storage for the release service: encrypted files, seal metadata, released key
// parts and alert records. Files are already encrypted in the owner's browser. The single-
// mode file key is additionally encrypted at rest with a server escrow key.
import fs from 'node:fs';
import path from 'node:path';
import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto';

const ID = /^[A-Za-z0-9_-]{6,64}$/;
const sha = (v) => createHash('sha256').update(v).digest('hex');

export function escrowKey(env = process.env) {
  const secret = env.SEAL_ESCROW_SECRET || env.SEAL_OPS_PRIVATE_KEY;
  if (!secret) throw new Error('SEAL_ESCROW_SECRET (or SEAL_OPS_PRIVATE_KEY) is required for single-mode seals');
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

export function openSealStore(dir) {
  const root = path.resolve(dir, 'seals');
  fs.mkdirSync(root, { recursive: true });
  const file = (id, ext) => {
    if (!ID.test(id)) throw new Error('Invalid seal id');
    return path.join(root, `${id}.${ext}`);
  };
  const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } };
  const writeJson = (p, v) => { const tmp = p + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(v)); fs.renameSync(tmp, p); };
  return {
    newId: () => randomBytes(12).toString('base64url'),
    newToken: () => randomBytes(24).toString('base64url'),
    tokenHash: sha,
    checkToken(meta, token) {
      if (typeof token !== 'string' || !meta?.ownerTokenHash) return false;
      const a = Buffer.from(sha(token)), b = Buffer.from(meta.ownerTokenHash);
      return a.length === b.length && timingSafeEqual(a, b);
    },
    saveFile: (id, bytes) => fs.writeFileSync(file(id, 'sealed'), bytes),
    readFile: (id) => { try { return fs.readFileSync(file(id, 'sealed')); } catch { return null; } },
    fileExists: (id) => fs.existsSync(file(id, 'sealed')),
    saveMeta: (id, meta) => writeJson(file(id, 'json'), meta),
    readMeta: (id) => readJson(file(id, 'json')),
    updateMeta(id, fn) { const m = readJson(file(id, 'json')); if (!m) return null; const next = fn(m) || m; writeJson(file(id, 'json'), next); return next; },
    appendAlert: (id, alert) => fs.appendFileSync(file(id, 'alerts'), JSON.stringify(alert) + '\n'),
    readAlerts(id) {
      try { return fs.readFileSync(file(id, 'alerts'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; }
    },
    updateAlert(id, alertId, patch) {
      const list = this.readAlerts(id).map((a) => (a.id === alertId ? { ...a, ...patch } : a));
      fs.writeFileSync(file(id, 'alerts'), list.map((a) => JSON.stringify(a)).join('\n') + '\n');
    },
  };
}
