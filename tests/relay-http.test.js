import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRelayService } from '../server/relayService.js';
import { RelayStore } from '../server/relayStore.js';
import { policy, authorization } from './fixtures/relay.js';

test('HTTP relay enforces invitations, exact signed wire format, small bodies, opaque status and secret-safe errors', async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'appeal-relay-http-'));
  const env = { RELAY_ENABLED: 'true', RELAY_PERSISTENT_DISK: 'true', DATA_DIR: dir, NEAR_NETWORK: 'testnet',
    NEAR_ACCOUNT_ID: policy.relayer, ANCHOR_CONTRACT: policy.contract, NEAR_PRIVATE_KEY: 'synthetic-secret-never-return',
    RELAY_WORKER_DAILY_LIMIT: '3', RELAY_GLOBAL_DAILY_LIMIT: '4', RELAY_REQUESTS_PER_MINUTE: '100', RELAY_MIN_BALANCE_YOCTO: '100' };
  const store = new RelayStore(dir, policy);
  // Deliberately inert runner: HTTP acceptance tests must never sign/broadcast.
  const runner = { healthy: true, stopped: false, start() {}, async stop() {} };
  const relay = await createRelayService(env, dir, { store, runner });
  const send = (res, status, body) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
  const server = http.createServer(async (req, res) => {
    if (!await relay.handle(req, res, new URL(req.url, 'http://local').pathname, send)) send(res, 404, {});
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); await relay.close(); rmSync(dir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (value) => fetch(base + '/api/relay/anchors', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(value) });
  const a = await authorization();
  assert.equal((await post({ authorization: a })).status, 403);
  store.approve('worker.testnet', true);
  assert.equal((await post({ authorization: a, privateKey: 'forbidden' })).status, 400);
  const tamper = structuredClone(a); tamper.delegate.nonce = '2';
  assert.equal((await post({ authorization: tamper })).status, 400);
  const accepted = await post({ authorization: a }); assert.equal(accepted.status, 202);
  const job = await accepted.json(); assert.match(job.id, /^[A-Za-z0-9_-]{32}$/);
  assert.deepEqual(await (await post({ authorization: await authorization({ nonce: 2 }) })).json(), job);
  const status = await (await fetch(base + job.pollUrl)).json(); assert.deepEqual(status, job);
  assert.equal(JSON.stringify(status).includes(a.signature), false);
  assert.equal((await fetch(base + '/api/relay/jobs/' + 'x'.repeat(32))).status, 404);
  assert.equal((await fetch(base + '/api/relay/anchors', { method: 'POST', body: '{}' })).status, 415);
  assert.equal((await post({ text: 'x'.repeat(16384) })).status, 413);
  runner.healthy = false;
  const unavailable = await post({ authorization: a }); assert.equal(unavailable.status, 503);
  assert.equal((await unavailable.text()).includes(env.NEAR_PRIVATE_KEY), false);
  runner.healthy = true;
  const original = store.enqueue;
  store.enqueue = () => { throw new Error('synthetic-secret-never-return'); };
  const failure = await post({ authorization: a }); assert.equal(failure.status, 503);
  assert.equal((await failure.text()).includes('synthetic-secret-never-return'), false);
  store.enqueue = original;
  for (let i = 0; i < 100; i++) await fetch(base + job.pollUrl);
  assert.equal((await post({ authorization: a })).status, 429);
});

test('disabled relay exposes no submit or status capability', async () => {
  const relay = await createRelayService({}, 'unused'); let result;
  const handled = await relay.handle({ method: 'POST' }, {}, '/api/relay/anchors', (_res, status, body) => { result = { status, body }; });
  assert.equal(handled, true); assert.equal(result.status, 503); assert.equal(relay.readiness().accepting, false);
});
