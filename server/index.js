// Sealed Paper release service. It stores encrypted files, logs open attempts on NEAR,
// creates alerts, and hands out key material only after the contract says the seal is open:
//   single mode: the escrowed file key, after request_open returns "open"
//   split mode:  parts that holders released on-chain and then posted here
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createHash, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createSealChain, sealChainConfig } from './sealChain.js';
import { openSealStore, escrowKey, sealBox, openBox } from './sealStore.js';
import { createAlerts, createGeo, createNotifier } from './alerts.js';
import { unwrapPart } from '../lib/sealcrypto.js';
import { createChallenges, verifyProof, validAccountId } from './nearAuth.js';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const dataDir = path.resolve(process.env.DATA_DIR || path.join(root, 'data'));
fs.mkdirSync(dataDir, { recursive: true });

const PORT = Number(process.env.PORT || 8787);
const MAX_FILE = 100 * 1024 * 1024 + 2 * 1024 * 1024; // 100 MB plus container overhead
const MAX_JSON = 64 * 1024;
const chain = createSealChain(sealChainConfig());
const store = openSealStore(dataDir);
const alerts = createAlerts({ store, chain, geo: createGeo(), notify: createNotifier() });
const challenges = createChallenges();
let escrow = null; try { escrow = escrowKey(); } catch { /* single mode disabled until configured */ }

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.ics': 'text/calendar' };
const RPC_HOSTS = 'https://test.rpc.fastnear.com https://rpc.testnet.near.org';
const WALLET_HOSTS = 'https://wallet.meteorwallet.app https://testnet.meteorwallet.app';
const CSP = `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; frame-src 'self' blob:; object-src 'none'; connect-src 'self' ${RPC_HOSTS} ${WALLET_HOSTS}; font-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self' ${WALLET_HOSTS}`;

function send(res, code, body, type = 'application/json', extra = {}) {
  res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer',
    'x-frame-options': 'DENY', 'permissions-policy': 'camera=(), microphone=(), geolocation=(self)', 'content-security-policy': CSP, ...extra });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}
function readBody(req, max) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > max) { reject(Object.assign(new Error('Request too large'), { code: 413 })); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
const readJson = async (req) => { try { return JSON.parse((await readBody(req, MAX_JSON)).toString('utf8') || '{}'); } catch (e) { throw e.code ? e : new Error('Invalid JSON'); } };
function serveStatic(res, rel, as) {
  const base = path.join(root, 'public');
  const file = path.resolve(base, '.' + path.posix.normalize('/' + rel));
  if (!file.startsWith(base + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return send(res, 404, { error: 'not found' });
  send(res, 200, fs.readFileSync(file), as || TYPES[path.extname(file)] || 'application/octet-stream');
}
const clientIp = (req) => (process.env.TRUST_PROXY ? String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() : '') || req.socket.remoteAddress || '';
const sha256 = (b) => createHash('sha256').update(b).digest('hex');

// ---------- rate limits ----------
const buckets = new Map();
function limited(key, max, windowMs) {
  const now = Date.now(), b = buckets.get(key);
  if (!b || now - b.start > windowMs) { buckets.set(key, { start: now, n: 1 }); if (buckets.size > 20000) buckets.clear(); return false; }
  return ++b.n > max;
}

// ---------- seal validation ----------
// Holders are either app-created implicit accounts (64 hex) or the person's own NEAR account (e.g. kanth.testnet).
const ACCOUNT = { test: (id) => validAccountId(id) };
const MAX_VIEWERS = 50;
const HEX64 = /^[0-9a-f]{64}$/;
function cleanContact(c) {
  const out = {};
  if (typeof c?.email === 'string' && /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/.test(c.email.trim())) out.email = c.email.trim().slice(0, 254);
  if (typeof c?.phone === 'string' && /^\+?[0-9 ]{8,18}$/.test(c.phone.trim())) out.phone = c.phone.replace(/ /g, '');
  if (typeof c?.near === 'string' && /^[a-z0-9._-]{2,64}$/.test(c.near.trim())) out.near = c.near.trim();
  return out;
}
function validateMeta(m) {
  const fail = (msg) => { throw new Error(msg); };
  if (!m || typeof m !== 'object') fail('Seal details are required');
  const label = String(m.label || '').trim().slice(0, 120) || 'Sealed file';
  if (!HEX64.test(m.fileHash || '')) fail('fileHash must be SHA-256 hex');
  const unlockAtMs = Number(m.unlockAtMs);
  if (!Number.isSafeInteger(unlockAtMs) || unlockAtMs < Date.now() + 20_000) fail('Unlock time must be at least 20 seconds in the future');
  if (unlockAtMs > Date.now() + 366 * 86400_000) fail('Unlock time must be within a year');
  const owner = cleanContact(m.owner || {});
  // Optional allow-list: only these NEAR accounts may open, after proving ownership with their wallet.
  const viewers = Array.isArray(m.viewers) ? [...new Set(m.viewers.map((v) => String(v).trim().toLowerCase()).filter(Boolean))] : [];
  if (viewers.length > MAX_VIEWERS) fail(`At most ${MAX_VIEWERS} viewer accounts`);
  for (const v of viewers) if (!validAccountId(v)) fail(`"${v}" is not a valid NEAR account`);
  if (m.mode === 'single') {
    if (typeof m.fileKey !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(m.fileKey)) fail('Single mode needs the 32-byte file key');
    return { label, unlockAtMs, mode: 'single', k: 0, n: 0, holders: [], owner, viewers };
  }
  if (m.mode !== 'split') fail('Mode must be single or split');
  if (typeof m.wrapKey !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(m.wrapKey)) fail('Split mode needs the 32-byte part wrap key');
  const n = Number(m.n), k = Number(m.k);
  if (!Number.isInteger(n) || n < 2 || n > 20) fail('N must be between 2 and 20');
  if (!Number.isInteger(k) || k < 1 || k > n) fail('K must be between 1 and N');
  if (!Array.isArray(m.holders) || m.holders.length !== n) fail('Need exactly N holders');
  const holders = m.holders.map((h, i) => {
    if (!ACCOUNT.test(h?.account || '')) fail(`Holder ${i + 1}: invalid account`);
    if (!HEX64.test(h?.commitment || '')) fail(`Holder ${i + 1}: invalid commitment`);
    return { account: h.account, own: h.own === true, commitment: h.commitment, label: String(h.label || `Holder ${i + 1}`).trim().slice(0, 80), contact: cleanContact(h.contact || {}) };
  });
  if (new Set(holders.map((h) => h.account)).size !== n) fail('Holder accounts must be unique');
  for (const h of holders) if (!h.own && !/^[0-9a-f]{64}$/.test(h.account)) fail(`${h.account}: app-created holder accounts must be implicit`);
  return { label, unlockAtMs, mode: 'split', k, n, holders, owner, viewers };
}
const publicMeta = (meta) => ({ sealId: meta.sealId, label: meta.label, mode: meta.mode, k: meta.k, n: meta.n, unlockAtMs: meta.unlockAtMs,
  fileHash: meta.fileHash, size: meta.size, createdAt: meta.createdAt, createTx: meta.createTx, contract: chain.config.contract,
  holders: meta.holders.map((h) => ({ label: h.label, account: h.account, own: Boolean(h.own) })), releasedParts: Object.keys(meta.parts || {}).length,
  restricted: Boolean(meta.viewers?.length), viewerCount: meta.viewers?.length || 0 });

// ---------- request handler ----------
async function handler(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const p = url.pathname, ip = clientIp(req), ua = String(req.headers['user-agent'] || '').slice(0, 300);
  try {
    if (p.startsWith('/api/') && limited('api|' + ip, 120, 60_000)) return send(res, 429, { error: 'Too many requests. Try again in a minute.' });
    if (['POST', 'PUT', 'DELETE'].includes(req.method)) {
      if (req.headers['sec-fetch-site'] === 'cross-site') return send(res, 403, { error: 'Cross-site writes refused' });
      const proto = process.env.TRUST_PROXY && req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
      if (req.headers.origin && req.headers.origin !== (process.env.PUBLIC_ORIGIN || `${proto}://${req.headers.host}`)) return send(res, 403, { error: 'Unexpected request origin' });
    }

    if (p === '/api/config') return send(res, 200, { network: chain.config.network, contract: chain.config.contract, operator: chain.config.ops,
      rpc: chain.config.rpcUrls[0], explorer: 'https://testnet.nearblocks.io', singleModeAvailable: Boolean(escrow), createTokenRequired: Boolean(process.env.SEAL_CREATE_TOKEN) });
    if (p === '/api/chain') {
      try { return send(res, 200, { ok: true, config: await chain.getConfig(), at: new Date().toISOString() }); }
      catch (e) { return send(res, 503, { ok: false, error: e.message }); }
    }

    const acct = p.match(/^\/api\/accounts\/([^/]{2,64})$/);
    if (acct && req.method === 'GET') {
      const id = decodeURIComponent(acct[1]).toLowerCase();
      if (!validAccountId(id)) return send(res, 400, { error: 'Not a valid NEAR account id' });
      return send(res, 200, await chain.lookupAccount(id));
    }

    if (p === '/api/seals' && req.method === 'POST') {
      if (process.env.SEAL_CREATE_TOKEN) {
        const t = String(req.headers['x-create-token'] || ''), want = process.env.SEAL_CREATE_TOKEN;
        if (t.length !== want.length || !timingSafeEqual(Buffer.from(t), Buffer.from(want))) return send(res, 403, { error: 'Seal creation token required' });
      }
      if (limited('create|' + ip, Number(process.env.SEAL_CREATE_PER_HOUR || 20), 3600_000)) return send(res, 429, { error: 'Seal limit reached for this hour' });
      if (!req.headers['content-type']?.startsWith('application/octet-stream')) return send(res, 415, { error: 'Send the encrypted file as application/octet-stream' });
      let raw; try { raw = JSON.parse(Buffer.from(String(req.headers['x-seal-meta'] || ''), 'base64url').toString('utf8')); } catch { return send(res, 400, { error: 'Invalid x-seal-meta header' }); }
      const meta = validateMeta(raw);
      if (!escrow) return send(res, 503, { error: 'Key escrow is not configured on this server (SEAL_ESCROW_SECRET)' });
      const bytes = await readBody(req, MAX_FILE);
      if (bytes.length < 16 || bytes.subarray(0, 8).toString() !== 'SEALPAP1') return send(res, 400, { error: 'Body must be a Sealed Paper encrypted file' });
      if (sha256(bytes) !== raw.fileHash) return send(res, 400, { error: 'File hash does not match the uploaded bytes' });
      // Named accounts (holders and viewers) must exist on NEAR testnet.
      for (const id of [...meta.holders.filter((h) => h.own).map((h) => h.account), ...meta.viewers]) {
        const info = await chain.lookupAccount(id);
        if (!info.exists) return send(res, 400, { error: `NEAR account ${id} does not exist on testnet` });
      }
      const sealId = store.newId(), ownerToken = store.newToken();
      const fundTxs = meta.mode === 'split' ? await chain.fundAccounts(meta.holders.filter((h) => !h.own).map((h) => h.account)) : [];
      const created = await chain.createSeal({ seal_id: sealId, file_hash: raw.fileHash, unlock_at_ms: String(meta.unlockAtMs), mode: meta.mode,
        holders: meta.holders.map((h) => h.account), commitments: meta.holders.map((h) => h.commitment), threshold_k: meta.k, total_n: meta.n, owner: meta.label.slice(0, 120) });
      store.saveFile(sealId, bytes);
      store.saveMeta(sealId, { sealId, label: meta.label, mode: meta.mode, k: meta.k, n: meta.n, unlockAtMs: meta.unlockAtMs, fileHash: raw.fileHash,
        size: bytes.length, createdAt: new Date().toISOString(), createTx: created.txHash, fundTxs, holders: meta.holders, owner: meta.owner, viewers: meta.viewers,
        ownerTokenHash: store.tokenHash(ownerToken), escrowedKey: meta.mode === 'single' ? sealBox(escrow, Buffer.from(raw.fileKey, 'base64url')) : null,
        escrowedWrapKey: meta.mode === 'split' ? sealBox(escrow, Buffer.from(raw.wrapKey, 'base64url')) : null,
        alertContacts: [meta.owner, ...meta.holders.map((h) => h.contact)].filter((c) => c.email || c.phone), parts: {} });
      return send(res, 201, { sealId, ownerToken, createTx: created.txHash, explorer: chain.explorerTx(created.txHash), fundTxs });
    }

    const m = p.match(/^\/api\/seals\/([A-Za-z0-9_-]{6,64})(?:\/(file|log|open|parts|alerts|challenge))?$/);
    if (m) {
      const [, sealId, action] = m;
      const meta = store.readMeta(sealId);
      if (!meta) return send(res, 404, { error: 'Seal not found' });
      if (!action && req.method === 'GET') {
        const onChain = await chain.getSeal(sealId).catch(() => null);
        return send(res, 200, { ...publicMeta(meta), chain: onChain && { unlockAtMs: Number(onChain.unlock_at_ms), released: onChain.released.length,
          releasedAccounts: onChain.released, threshold: onChain.threshold_k, fileHash: onChain.file_hash, logCount: onChain.log_count }, now: Date.now() });
      }
      if (action === 'file' && req.method === 'GET') {
        const bytes = store.readFile(sealId);
        return bytes ? send(res, 200, bytes, 'application/octet-stream', { 'content-disposition': `attachment; filename="${sealId}.sealedfile"` }) : send(res, 404, { error: 'File missing' });
      }
      if (action === 'log' && req.method === 'GET') return send(res, 200, { log: await chain.getLog(sealId, Number(url.searchParams.get('from') || 0), 100) });

      if (action === 'challenge' && req.method === 'GET') return send(res, 200, challenges.issue(sealId, chain.config.contract));

      if (action === 'open' && req.method === 'POST') {
        const body = await readJson(req);
        if (limited(`open|${sealId}|${ip}`, 20, 60_000)) return send(res, 429, { error: 'Too many open attempts' });
        let viewer = null;
        if (meta.viewers?.length) {
          // Allow-listed seal: the viewer proves their NEAR account with a wallet-signed, one-time challenge.
          const challenge = challenges.take(String(body.proof?.nonce || ''), sealId);
          const proof = challenge ? await verifyProof(body.proof, challenge, (a, k) => chain.viewAccessKey(a, k)) : { ok: false, reason: 'Missing or expired challenge' };
          if (!proof.ok) return send(res, 401, { status: 'unverified', error: `Prove your NEAR account to open this file (${proof.reason})` });
          viewer = proof.accountId;
          if (!meta.viewers.includes(viewer)) {
            const alert = await alerts.createAlert({ sealId, kind: 'not_allowed', ip, userAgent: ua, gps: body.gps, account: viewer });
            return send(res, 403, { status: 'not_allowed', account: viewer, alertId: alert.id, message: `${viewer} is not allowed to open this file. The attempt was logged.` });
          }
        }
        const r = await chain.requestOpen(sealId);
        const status = r.value;
        if (status === 'early') {
          const alert = await alerts.createAlert({ sealId, kind: 'early_open', ip, userAgent: ua, gps: body.gps, account: viewer });
          return send(res, 423, { status, unlockAtMs: meta.unlockAtMs, tx: r.txHash, alertId: alert.id, message: 'Locked. This attempt was refused by the contract and logged.' });
        }
        if (status === 'awaiting_parts') return send(res, 409, { status, tx: r.txHash, released: Object.keys(meta.parts || {}).length, k: meta.k, message: `Waiting for key holders: ${meta.k} parts are needed.` });
        if (status !== 'open') return send(res, 502, { error: 'Unexpected contract status' });
        if (meta.mode === 'single') return send(res, 200, { status, tx: r.txHash, mode: 'single', viewer, key: openBox(escrow, meta.escrowedKey).toString('base64url') });
        return send(res, 200, { status, tx: r.txHash, mode: 'split', viewer, parts: Object.values(meta.parts || {}) });
      }

      if (action === 'parts' && req.method === 'POST') {
        const body = await readJson(req);
        if (typeof body.part !== 'string' || body.part.length > 300 || !ACCOUNT.test(body.account || '')) return send(res, 400, { error: 'account and wrapped part are required' });
        const onChain = await chain.getSeal(sealId);
        const i = onChain.holders.indexOf(body.account);
        if (i < 0) return send(res, 403, { error: 'Not a holder of this seal' });
        if (!onChain.released.includes(body.account)) return send(res, 409, { error: 'Release your part on NEAR first; the contract has not recorded it yet' });
        if (sha256(Buffer.from(body.part, 'utf8')) !== onChain.commitments[i]) return send(res, 400, { error: 'Part does not match the on-chain commitment' });
        // Only now, after the contract recorded this holder's release, is the part unwrapped.
        const plain = await unwrapPart(new Uint8Array(openBox(escrow, meta.escrowedWrapKey)), body.part, body.account);
        const next = store.updateMeta(sealId, (x) => { x.parts = { ...(x.parts || {}), [body.account]: plain }; });
        return send(res, 200, { stored: true, released: Object.keys(next.parts).length, k: meta.k });
      }

      if (action === 'alerts' && req.method === 'POST') {
        const body = await readJson(req);
        const allowed = ['wrong_key', 'file_tampered', 'early_release', 'not_holder'];
        if (!allowed.includes(body.kind)) return send(res, 400, { error: 'Unsupported alert kind' });
        if (limited(`alert|${sealId}|${ip}`, 15, 60_000)) return send(res, 429, { error: 'Too many alerts' });
        let detail = typeof body.detail === 'string' ? body.detail : null;
        if (body.kind === 'file_tampered') {
          const stored = store.readFile(sealId), onChain = await chain.getSeal(sealId).catch(() => null);
          detail = `Reported by viewer. Server copy ${stored && onChain && sha256(stored) === onChain.file_hash ? 'matches' : 'does NOT match'} the on-chain hash.`;
        }
        const account = typeof body.account === 'string' && /^[a-z0-9._-]{2,64}$/.test(body.account) ? body.account : null;
        const alert = await alerts.createAlert({ sealId, kind: body.kind, ip, userAgent: ua, gps: body.gps, account, detail });
        return send(res, 201, { alertId: alert.id, hash: alert.hash });
      }
      if (action === 'alerts' && req.method === 'GET') {
        if (!store.checkToken(meta, url.searchParams.get('token'))) return send(res, 403, { error: 'Owner token required' });
        return send(res, 200, { alerts: store.readAlerts(sealId).reverse() });
      }
      return send(res, 405, { error: 'Method not allowed' });
    }

    if (p === '/') return serveStatic(res, 'landing.html');
    if (p === '/app') return serveStatic(res, 'index.html');
    if (/^\/s\/[A-Za-z0-9_-]{6,64}$/.test(p)) return serveStatic(res, 'open.html');
    if (/^\/h\/[A-Za-z0-9_-]{6,64}$/.test(p)) return serveStatic(res, 'holder.html');
    if (p === '/verify') return serveStatic(res, 'verify.html');
    if (p === '/docs-deployment.json') {
      try { return send(res, 200, fs.readFileSync(path.join(root, 'docs', 'SEALED-DEPLOYMENT.json'))); } catch { return send(res, 404, { error: 'not found' }); }
    }
    if (p.startsWith('/lib/')) {
      const base = path.join(root, 'lib'), file = path.resolve(base, '.' + path.posix.normalize('/' + p.slice(5)));
      if (!file.startsWith(base + path.sep) || !fs.existsSync(file)) return send(res, 404, { error: 'not found' });
      return send(res, 200, fs.readFileSync(file), TYPES[path.extname(file)] || 'text/plain');
    }
    return serveStatic(res, p);
  } catch (e) {
    send(res, e.code === 413 ? 413 : 400, { error: e.message });
  }
}

{
  const server = http.createServer(handler);
  server.requestTimeout = 300_000; server.headersTimeout = 15_000;
  server.listen(PORT, () => {
    console.log(`Sealed Paper on http://localhost:${server.address().port}  (app at /app)`);
    console.log(`Contract: ${chain.config.contract || 'not configured'} · operator: ${chain.config.ops || 'not configured'}`);
  });
}
