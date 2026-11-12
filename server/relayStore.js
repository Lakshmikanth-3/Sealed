// Single-host durable relay queue. Every state transition and quota reservation
// commits before a network side effect. Status capabilities must not be logged.
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

export class RelayError extends Error {
  constructor(code, status = 409) { super(code); this.code = code; this.status = status; }
}
const id = () => randomBytes(24).toString('base64url');
const terminal = ['failed', 'expired', 'cancelled'];
export const intentHash = (prepared, policy) => createHash('sha256').update(JSON.stringify([
  policy.network, policy.contract, prepared.worker, prepared.args.day, prepared.args.root, prepared.args.count,
])).digest('hex');

export class RelayStore {
  constructor(dataDir, policy) {
    mkdirSync(dataDir, { recursive: true });
    this.db = new DatabaseSync(path.join(dataDir, 'relay.sqlite'));
    try {
      this.db.exec(`PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
        PRAGMA foreign_keys=ON;
        CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS approvals (worker TEXT PRIMARY KEY, approved INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS jobs (
          id TEXT PRIMARY KEY, intent TEXT NOT NULL, fingerprint TEXT UNIQUE NOT NULL,
          worker TEXT NOT NULL, quota_day TEXT NOT NULL, state TEXT NOT NULL,
          authorization TEXT NOT NULL, created INTEGER NOT NULL, updated INTEGER NOT NULL,
          code TEXT, signed_bytes TEXT, tx_hash TEXT, reference TEXT, attempts INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS job_intent ON jobs(intent, created);
        CREATE INDEX IF NOT EXISTS job_quota ON jobs(quota_day, worker);
        CREATE TABLE IF NOT EXISTS transitions (
          seq INTEGER PRIMARY KEY, job TEXT NOT NULL REFERENCES jobs(id), state TEXT NOT NULL,
          code TEXT, at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS lease (key INTEGER PRIMARY KEY CHECK(key=1), owner TEXT, until_ms INTEGER);
        INSERT OR IGNORE INTO lease VALUES(1, NULL, 0);`);
      this.transaction(() => {
        const version = this.db.prepare('SELECT value FROM meta WHERE key=?').get('schema');
        if (version && version.value !== '1') throw new Error('Unsupported relay database version');
        this.db.prepare('INSERT OR IGNORE INTO meta VALUES(?, ?)').run('schema', '1');
        const binding = JSON.stringify([policy.network, policy.contract, policy.relayer]);
        const previous = this.db.prepare('SELECT value FROM meta WHERE key=?').get('deployment');
        if (previous && previous.value !== binding) throw new Error('Relay database belongs to a different deployment');
        this.db.prepare('INSERT OR IGNORE INTO meta VALUES(?, ?)').run('deployment', binding);
      });
    } catch (error) { this.db.close(); throw error; }
  }
  transaction(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = fn(); this.db.exec('COMMIT'); return result; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  close() { this.db.close(); }
  approved(worker) { return this.db.prepare('SELECT approved FROM approvals WHERE worker=?').get(worker)?.approved === 1; }
  approve(worker, approved, now = Date.now()) {
    this.transaction(() => {
      this.db.prepare('INSERT INTO approvals VALUES (?, ?) ON CONFLICT(worker) DO UPDATE SET approved=excluded.approved').run(worker, approved ? 1 : 0);
      if (!approved) {
        for (const job of this.db.prepare("SELECT * FROM jobs WHERE worker=? AND state IN ('queued','validating','prepared')").all(worker)) {
          this.transition(job.id, 'cancelled', 'APPROVAL_REVOKED', {}, now);
        }
      }
    });
  }
  get(jobId) { return this.db.prepare('SELECT * FROM jobs WHERE id=?').get(jobId); }
  list() { return this.db.prepare('SELECT id,worker,state,code,tx_hash,created,updated FROM jobs ORDER BY created DESC LIMIT 100').all(); }
  publicJob(jobId) {
    const row = this.get(jobId);
    if (!row) throw new RelayError('JOB_NOT_FOUND', 404);
    return { id: row.id, state: row.state, code: row.code, pollUrl: `/api/relay/jobs/${row.id}`,
      ...(row.reference ? { anchor: JSON.parse(row.reference) } : {}) };
  }
  enqueue(authorization, prepared, policy, retryOf, now = Date.now()) {
    return this.transaction(() => {
      if (!this.approved(prepared.worker)) throw new RelayError('WORKER_NOT_APPROVED', 403);
      const fingerprint = this.db.prepare('SELECT * FROM jobs WHERE fingerprint=?').get(prepared.fingerprint);
      if (fingerprint) {
        if (retryOf) throw new RelayError('RETRY_REQUIRES_FRESH_AUTHORIZATION');
        return this.publicJob(fingerprint.id);
      }
      const intent = intentHash(prepared, policy);
      const prior = this.db.prepare('SELECT * FROM jobs WHERE intent=? ORDER BY rowid DESC LIMIT 1').get(intent);
      if (prior) {
        if (!terminal.includes(prior.state)) return this.publicJob(prior.id);
        if (retryOf !== prior.id) throw new RelayError('EXPLICIT_RETRY_REQUIRED');
      } else if (retryOf) throw new RelayError('RETRY_INTENT_MISMATCH');
      const day = new Date(now).toISOString().slice(0, 10);
      const quota = this.db.prepare('SELECT count(*) AS total, coalesce(sum(worker=?),0) AS worker FROM jobs WHERE quota_day=?').get(prepared.worker, day);
      if (quota.total >= policy.globalDailyLimit || quota.worker >= policy.workerDailyLimit) throw new RelayError('DAILY_QUOTA_EXHAUSTED', 429);
      const jobId = id();
      this.db.prepare(`INSERT INTO jobs (id,intent,fingerprint,worker,quota_day,state,authorization,created,updated)
        VALUES (?,?,?,?,?,'queued',?,?,?)`).run(jobId, intent, prepared.fingerprint, prepared.worker, day, JSON.stringify(authorization), now, now);
      this.db.prepare('INSERT INTO transitions(job,state,at) VALUES (?, ?, ?)').run(jobId, 'queued', now);
      return this.publicJob(jobId);
    });
  }
  transition(jobId, state, code = null, fields = {}, now = Date.now()) {
    const allowed = ['signed_bytes', 'tx_hash', 'reference', 'attempts'];
    if (Object.keys(fields).some((key) => !allowed.includes(key))) throw new Error('Invalid relay transition');
    this.db.prepare(`UPDATE jobs SET state=?,code=?,updated=?${Object.keys(fields).map((key) => `,${key}=?`).join('')} WHERE id=?`)
      .run(state, code, now, ...Object.values(fields), jobId);
    this.db.prepare('INSERT INTO transitions(job,state,code,at) VALUES (?,?,?,?)').run(jobId, state, code, now);
  }
  acquire(owner, now = Date.now()) {
    return this.db.prepare('UPDATE lease SET owner=?,until_ms=? WHERE key=1 AND (owner=? OR until_ms<=?)')
      .run(owner, now + 30000, owner, now).changes === 1;
  }
  release(owner) { this.db.prepare('UPDATE lease SET owner=NULL,until_ms=0 WHERE owner=?').run(owner); }
  assertLease(owner, now = Date.now()) {
    const row = this.db.prepare('SELECT * FROM lease WHERE key=1').get();
    if (row.owner !== owner || row.until_ms <= now) throw new RelayError('LEASE_LOST', 503);
  }
  locked(owner, fn) { return this.transaction(() => { this.assertLease(owner); return fn(); }); }
  next() {
    // An unresolved broadcast blocks all new sponsor signing, including after restart.
    return this.db.prepare(`SELECT * FROM jobs WHERE state IN ('submitted','unknown','prepared','validating','queued')
      ORDER BY CASE state WHEN 'unknown' THEN 0 WHEN 'submitted' THEN 0 WHEN 'prepared' THEN 1 ELSE 2 END, rowid LIMIT 1`).get();
  }
}
