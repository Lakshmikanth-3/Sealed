import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

test('read-only live setup needs no signing key, keeps RPC credentials private and refuses unsigned writes', async (t) => {
  // Never contact a public RPC or use real credentials in this fixture.
  const child = spawn(process.execPath, ['server/index.js'], { cwd: fileURLToPath(new URL('..', import.meta.url)),
    env: { ...process.env, PORT: '0', NEAR_NETWORK: 'testnet', ANCHOR_CONTRACT: 'anchors.testnet',
      NEAR_ACCOUNT_ID: 'sponsor.testnet', NEAR_PRIVATE_KEY: '', NEAR_RPC_URL: 'http://127.0.0.1:9/synthetic-private-api-token',
      DATA_DIR: mkdtempSync(path.join(tmpdir(), 'appeal-route-')) }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  t.after(() => { child.kill(); });
  let log = '';
  const port = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Test server did not start')), 10000);
    child.on('error', (error) => { clearTimeout(timeout); reject(error); });
    child.on('exit', (code) => { if (code !== null) { clearTimeout(timeout); reject(new Error('Test server exited before startup')); } });
    child.stdout.on('data', (chunk) => { log += chunk; const match = log.match(/localhost:(\d+)\s/); if (match) { clearTimeout(timeout); resolve(Number(match[1])); } });
  });
  assert.ok(port > 0);
  const base = `http://127.0.0.1:${port}`;
  const config = await (await fetch(base + '/api/config')).json();
  assert.equal(config.anchoringAvailable, false);
  assert.equal(Object.hasOwn(config, 'rpcUrl'), false);
  assert.equal(JSON.stringify(config).includes('synthetic-private-api-token'), false);
  const response = await fetch(base + '/api/anchor', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ worker: 'w-synthetic', day: '2026-11-12', root: 'a'.repeat(64), count: 1 }) });
  assert.equal(response.status, 403);
  assert.match((await response.json()).error, /Worker-signed v2/);
});
