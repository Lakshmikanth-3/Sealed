// Executes the real CLI in a child process with an explicitly injected synthetic
// RPC fixture. No test data is sent to NEAR or the application server.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { workerFixture } from './fixtures/worker-v2.js';

function run(f, { contract = f.policy.contract } = {}) {
  const dir = fs.mkdtempSync(path.join(tmpdir(), 'appeal-cli-'));
  const packFile = path.join(dir, 'synthetic-pack.json'), loaderFile = path.join(dir, 'synthetic-rpc.mjs');
  fs.writeFileSync(packFile, JSON.stringify(f.pack));
  fs.writeFileSync(loaderFile, `const data = ${JSON.stringify(f.data)};
globalThis.fetch = async (url, options) => {
  if (url !== 'https://rpc.testnet.near.org') throw new Error('Unexpected fixture destination');
  const request = JSON.parse(options.body);
  return { ok: true, json: async () => ({ result: data[request.method] }) };
};`);
  return spawnSync(process.execPath, ['--import', pathToFileURL(loaderFile).href, 'scripts/verify-pack.js',
    '--file', packFile, '--network', 'testnet', '--contract', contract, '--relayer', f.policy.relayer],
  { cwd: fileURLToPath(new URL('..', import.meta.url)), encoding: 'utf8', windowsHide: true });
}

test('standalone CLI verifies v2 worker authorization without the application server', async () => {
  const f = await workerFixture();
  const result = run(f);
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.ok, true);
  assert.equal(report.workerAuthorizationVerified, true);
  assert.equal(report.attestationVerified, false);
});

test('standalone CLI exits nonzero for failed inner execution, wrong trust and mock evidence', async () => {
  const f = await workerFixture();
  let result = run(f, { contract: 'other.testnet' });
  assert.equal(result.status, 1);
  assert.equal(JSON.parse(result.stdout).workerAuthorizationVerified, false);
  f.data.tx.receipts_outcome[1].outcome.status = { Failure: {} };
  result = run(f);
  assert.equal(result.status, 1);
  assert.equal(JSON.parse(result.stdout).ok, false);
  f.pack.days[0].anchor.network = 'mock';
  result = run(f);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /mock evidence is not accepted/);
});
