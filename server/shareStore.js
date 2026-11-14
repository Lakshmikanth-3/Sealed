import { DatabaseSync } from 'node:sqlite';
import { randomBytes, createHash } from 'node:crypto';
import path from 'node:path';
const digest = (value) => createHash('sha256').update(value).digest('hex');
export function openShares(directory, { maxBytes = 512 * 1024 * 1024, maxShares = 10000 } = {}) {
  const db = new DatabaseSync(path.join(directory, 'shares.sqlite'));
  db.exec('PRAGMA busy_timeout=1000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA secure_delete=ON; CREATE TABLE IF NOT EXISTS shares (id TEXT PRIMARY KEY, token_hash TEXT NOT NULL, expires INTEGER NOT NULL, pack TEXT NOT NULL)');
  const purge = () => db.prepare('DELETE FROM shares WHERE expires <= ?').run(Date.now());
  purge();
  const cleanupExpired = () => {
    try { purge(); return true; }
    catch { console.error('Shared evidence cleanup failed; retrying on the next scheduled pass.'); return false; }
  };
  const cleanup = setInterval(cleanupExpired, 60000);
  cleanup.unref();
  return {
    cleanupExpired,
    create(pack, ttlSeconds = 86400) {
      if (!Number.isSafeInteger(ttlSeconds) || ttlSeconds < 300 || ttlSeconds > 604800) throw new Error('Share lifetime must be between 5 minutes and 7 days');
      purge();
      const encoded = JSON.stringify(pack);
      db.exec('BEGIN IMMEDIATE');
      try {
        const used = db.prepare('SELECT COUNT(*) AS n, COALESCE(SUM(length(CAST(pack AS BLOB))), 0) AS bytes FROM shares').get();
        if (used.n >= maxShares || used.bytes + Buffer.byteLength(encoded) > maxBytes) throw new Error('Shared storage capacity reached');
        const id = randomBytes(24).toString('base64url'), managementToken = randomBytes(32).toString('base64url');
        const expiresAt = Date.now() + ttlSeconds * 1000;
        db.prepare('INSERT INTO shares VALUES (?, ?, ?, ?)').run(id, digest(managementToken), expiresAt, encoded);
        db.exec('COMMIT');
        return { id, managementToken, expiresAt, url: `/verify?id=${id}` };
      } catch (error) { db.exec('ROLLBACK'); throw error; }
    },
    read(id) { purge(); const row = db.prepare('SELECT pack FROM shares WHERE id = ? AND expires > ?').get(id, Date.now()); return row ? JSON.parse(row.pack) : null; },
    revoke(id, token) {
      if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) return false;
      return db.prepare('DELETE FROM shares WHERE id = ? AND token_hash = ?').run(id, digest(token)).changes === 1;
    },
    close() { clearInterval(cleanup); db.close(); },
  };
}
