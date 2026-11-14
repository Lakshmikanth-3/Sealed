import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createChain } from './chain.js';
import { buildCase } from './caseAgent.js';
import { verifyPack } from '../lib/verify.js';
import { createRelayService } from './relayService.js';
import { openShares } from './shareStore.js';
import { contractReadiness } from './readiness.js';
import { privateBrief, aiReadiness } from './privateBrief.js';
import { publishingOptions } from '../lib/publishing.js';
import { createLiveStatus } from './liveStatus.js';
import { openRedisShares, redisConfig } from './redisShares.js';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
// Serverless hosts (Vercel) only allow writes under /tmp, and it does not persist.
const dataDir = path.resolve(process.env.DATA_DIR || (process.env.VERCEL ? '/tmp/appeal' : path.join(root, 'data')));
fs.mkdirSync(dataDir, { recursive: true });

const chain = createChain(process.env, dataDir);
const liveStatus = createLiveStatus(chain);
const relay = await createRelayService(process.env, dataDir);
const redis = redisConfig();
if (process.env.VERCEL && !redis) console.error('Shared links need Upstash Redis on Vercel (KV_REST_API_URL / KV_REST_API_TOKEN). Publishing is disabled.');
const shares = redis ? openRedisShares(redis) : process.env.VERCEL ? null : openShares(dataDir);
const PORT = Number(process.env.PORT || 8787);
const MAX_BODY = 15 * 1024 * 1024;

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ttf': 'font/ttf', '.woff2': 'font/woff2' };

const send = (res, code, body, type = 'application/json') => {
  res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer', 'x-frame-options': 'DENY',
    'permissions-policy': 'camera=(), microphone=(), geolocation=(self)',
    'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https://rpc.testnet.near.org https://rpc.mainnet.near.org https://wallet.meteorwallet.app https://testnet.meteorwallet.app; font-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self' https://wallet.meteorwallet.app https://testnet.meteorwallet.app" });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
};

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > MAX_BODY) { reject(new Error('body too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch { reject(new Error('invalid JSON')); } });
    req.on('error', reject);
  });
}

function serveStatic(res, base, rel) {
  const file = path.resolve(base, '.' + path.posix.normalize('/' + rel));
  if (!file.startsWith(base + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return send(res, 404, { error: 'not found' });
  send(res, 200, fs.readFileSync(file), TYPES[path.extname(file)] || 'application/octet-stream');
}

let rateWindow = Date.now();
const rates = new Map();
let aiBusy = false;
export async function handler(req, res) {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  try {
    if (p.startsWith('/api/')) {
      if (Date.now() - rateWindow > 60000) { rates.clear(); rateWindow = Date.now(); }
      const address = req.socket.remoteAddress;
      if (rates.size > 10000 || (rates.get(address) || 0) >= 90) return send(res, 429, { error: 'Request limit reached. Try again in one minute.' });
      rates.set(address, (rates.get(address) || 0) + 1);
    }
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      if (!req.headers['content-type']?.startsWith('application/json')) return send(res, 415, { error: 'JSON content type required' });
      if (req.headers['sec-fetch-site'] === 'cross-site') return send(res, 403, { error: 'Cross-site writes refused' });
      const proto = process.env.VERCEL && req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
      if (req.headers.origin && req.headers.origin !== (process.env.PUBLIC_ORIGIN || `${proto}://${req.headers.host}`)) return send(res, 403, { error: 'Unexpected request origin' });
    }
    if (p === '/api/config') return send(res, 200, { network: chain.network, sender: chain.sender, contract: chain.contract, anchoringAvailable: false, walletSigning: true, ai: aiReadiness(), relay: relay.readiness() });
    if (p === '/api/chain' && req.method === 'GET') {
      try { return send(res, 200, await liveStatus(url.searchParams.get('worker') || undefined)); }
      catch (error) { return send(res, 400, { error: error.message }); }
    }
    if (p === '/api/health' && req.method === 'GET') {
      try { return send(res, 200, await contractReadiness(chain, url.searchParams.get('worker'))); }
      catch (error) { return send(res, 503, { ready: false, error: error.message }); }
    }
    if (await relay.handle(req, res, p, send)) return;

    if (p === '/api/anchor' && req.method === 'POST') {
      return send(res, 403, { error: 'Worker-signed v2 transactions must be approved in the worker wallet. Unsigned writes are disabled.' });
    }
    if (p === '/api/anchor' && req.method === 'GET') {
      return send(res, 200, await chain.lookup({ txHash: url.searchParams.get('tx'), sender: url.searchParams.get('sender'), receiptId: url.searchParams.get('receipt') }, { protocol: 2 }));
    }

    if (p === '/api/case' && req.method === 'POST') {
      const publishingToken = req.headers['x-publish-token'];
      const expectedToken = process.env.PUBLISH_ACCESS_TOKEN;
      if (!expectedToken) return send(res, 503, { error: 'Publishing is disabled until the operator configures PUBLISH_ACCESS_TOKEN' });
      if (!shares) return send(res, 503, { error: 'Publishing is disabled until the operator connects shared storage' });
      if (typeof publishingToken !== 'string' || Buffer.byteLength(publishingToken) !== Buffer.byteLength(expectedToken)
        || !crypto.timingSafeEqual(Buffer.from(publishingToken), Buffer.from(expectedToken))) return send(res, 403, { error: 'Publishing access token required' });
      const body = await readJson(req);
      const options = publishingOptions(body);
      if (body.version !== 2) return send(res, 400, { error: 'Only wallet-authorized v2 evidence can be published' });
      const pack = await buildCase(body);
      const report = await verifyPack(pack, async (ref, context) => {
        if (ref.network !== chain.network) throw new Error('Anchor network differs from server');
        return chain.lookup(ref, context);
      }, { deployments: { [chain.network]: { contract: chain.contract, relayer: chain.sender } } });
      if (!report.ok) throw new Error('Case evidence failed anchor verification');
      if (options.aiConsent) {
        const token = req.headers.authorization?.replace(/^Bearer /, '') || '';
        if (!process.env.AI_ACCESS_TOKEN || Buffer.byteLength(token) !== Buffer.byteLength(process.env.AI_ACCESS_TOKEN)
          || !crypto.timingSafeEqual(Buffer.from(token), Buffer.from(process.env.AI_ACCESS_TOKEN))) return send(res, 403, { error: 'AI access token required' });
        if (aiBusy) return send(res, 429, { error: 'An AI request is already running' });
        aiBusy = true;
        try { pack.aiBrief = await privateBrief(pack); }
        catch { return send(res, 503, { error: 'Verified AI generation failed. No unverified or local replacement was produced.' }); }
        finally { aiBusy = false; }
      }
      return send(res, 201, await shares.create(pack, options.ttlSeconds));
    }
    const m = p.match(/^\/api\/pack\/([\w-]{6,32})$/);
    if (m) {
      if (req.method === 'DELETE') {
        const token = req.headers.authorization?.replace(/^Bearer /, '');
        if (!shares) return send(res, 503, { error: 'Shared storage is not configured' });
        return await shares.revoke(m[1], token) ? send(res, 200, { deleted: true }) : send(res, 404, { error: 'Share not found or management token invalid' });
      }
      if (req.method !== 'GET') return send(res, 405, { error: 'Method not allowed' });
      if (!shares) return send(res, 503, { error: 'Shared storage is not configured' });
      const pack = await shares.read(m[1]);
      return pack ? send(res, 200, pack) : send(res, 404, { error: 'Share expired, revoked or unavailable' });
    }

    if (p.startsWith('/lib/')) return serveStatic(res, path.join(root, 'lib'), p.slice(5));
    if (p === '/') return serveStatic(res, path.join(root, 'public'), 'landing.html');
    if (p === '/app') return serveStatic(res, path.join(root, 'public'), 'index.html');
    if (p === '/verify') return serveStatic(res, path.join(root, 'public'), 'verify.html');
    return serveStatic(res, path.join(root, 'public'), p);
  } catch (e) {
    send(res, 400, { error: e.message });
  }
}

// Long-running server for local use, Docker and Render. On Vercel, api/index.js imports `handler`.
if (!process.env.VERCEL) {
  const server = http.createServer(handler);
  server.requestTimeout = 120000;
  server.headersTimeout = 15000;
  server.keepAliveTimeout = 5000;
  server.listen(PORT, () => {
    const listeningPort = server.address().port;
    console.log(`Appeal on http://localhost:${listeningPort}  (landing; worker app at /app)`);
    console.log(`Verifier:          http://localhost:${listeningPort}/verify`);
    console.log(`Anchoring network: ${chain.network}; contract: ${chain.contract || 'not configured'}`);
  });
  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return; shuttingDown = true;
    await new Promise((resolve) => server.close(resolve));
    await relay.close();
    shares?.close();
  };
  process.on('SIGTERM', () => { void shutdown(); });
  process.on('SIGINT', () => { void shutdown(); });
}
