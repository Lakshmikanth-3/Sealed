import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createChain } from './chain.js';
import { buildCase } from './caseAgent.js';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const dataDir = path.join(root, 'data');
const packDir = path.join(dataDir, 'packs');
fs.mkdirSync(packDir, { recursive: true });

const chain = createChain(process.env, dataDir);
const PORT = Number(process.env.PORT || 8787);
const MAX_BODY = 15 * 1024 * 1024;

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png' };

const send = (res, code, body, type = 'application/json') => {
  res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store' });
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

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  try {
    if (p === '/api/config') return send(res, 200, { network: chain.network, sender: chain.sender, rpcUrl: chain.rpcUrl });

    if (p === '/api/anchor' && req.method === 'POST') return send(res, 200, await chain.anchor(await readJson(req)));
    if (p === '/api/anchor' && req.method === 'GET') {
      return send(res, 200, await chain.lookup({ txHash: url.searchParams.get('tx'), sender: url.searchParams.get('sender') }));
    }

    if (p === '/api/case' && req.method === 'POST') {
      const pack = await buildCase(await readJson(req));
      const id = crypto.randomBytes(9).toString('base64url');
      fs.writeFileSync(path.join(packDir, id + '.json'), JSON.stringify(pack));
      return send(res, 200, { id, url: `/verify?id=${id}` });
    }
    const m = p.match(/^\/api\/pack\/([\w-]{6,32})$/);
    if (m) {
      const f = path.join(packDir, m[1] + '.json');
      return fs.existsSync(f) ? send(res, 200, fs.readFileSync(f)) : send(res, 404, { error: 'pack not found' });
    }

    if (p.startsWith('/lib/')) return serveStatic(res, path.join(root, 'lib'), p.slice(5));
    if (p === '/') return serveStatic(res, path.join(root, 'public'), 'index.html');
    if (p === '/verify') return serveStatic(res, path.join(root, 'public'), 'verify.html');
    return serveStatic(res, path.join(root, 'public'), p);
  } catch (e) {
    send(res, 400, { error: e.message });
  }
});

server.listen(PORT, () => {
  console.log(`Appeal Record on http://localhost:${PORT}  (worker app)`);
  console.log(`Verifier:          http://localhost:${PORT}/verify`);
  console.log(`Anchoring network: ${chain.network}${chain.network === 'mock' ? '  (set NEAR_NETWORK=testnet in .env for real anchors)' : ` as ${chain.sender}`}`);
});
