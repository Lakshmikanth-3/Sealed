import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { RelayStore } from '../server/relayStore.js';
import { prepareSignedAnchor } from '../server/workerAuthorization.js';
import { policy, authorization } from './fixtures/relay.js';
import { relayConfig } from '../server/relayConfig.js';

function fixture(t) {
  const dir = mkdtempSync(path.join(tmpdir(), 'appeal-relay-store-'));
  const store = new RelayStore(dir, policy);
  const stores = [store];
  t.after(() => { for (const item of stores) item.close(); rmSync(dir, { recursive: true, force: true }); });
  return { dir, store, stores, put: (a, retry, now) => store.enqueue(a, prepareSignedAnchor(a, policy), policy, retry, now) };
}
test('relay is disabled by default and requires actual owner limits, testnet and persistent disk acknowledgement', () => {
  assert.deepEqual(relayConfig({}), { enabled: false });
  const env = { RELAY_ENABLED: 'true', NEAR_NETWORK: 'testnet', DATA_DIR: path.resolve('synthetic-disk'), RELAY_PERSISTENT_DISK: 'true',
    NEAR_ACCOUNT_ID: policy.relayer, ANCHOR_CONTRACT: policy.contract, NEAR_PRIVATE_KEY: 'synthetic-not-a-key',
    RELAY_WORKER_DAILY_LIMIT: '3', RELAY_GLOBAL_DAILY_LIMIT: '4', RELAY_REQUESTS_PER_MINUTE: '100', RELAY_MIN_BALANCE_YOCTO: '100' };
  assert.equal(relayConfig(env).enabled, true);
  for (const key of Object.keys(env).filter((key) => key !== 'RELAY_ENABLED')) assert.throws(() => relayConfig({ ...env, [key]: '' }), undefined, key);
  assert.throws(() => relayConfig({ ...env, NEAR_NETWORK: 'mainnet' }), /testnet/);
  assert.throws(() => relayConfig({ ...env, RELAY_WORKER_DAILY_LIMIT: '3.1' }));
});
test('approval, signature dedupe and semantic dedupe are transactional across database connections', async (t) => {
  const { dir, store, stores, put } = fixture(t);
  const a = await authorization();
  assert.throws(() => put(a), /WORKER_NOT_APPROVED/);
  store.approve('worker.testnet', true);
  const first = put(a);
  const other = new RelayStore(dir, policy); stores.push(other);
  const b = await authorization({ nonce: 2 });
  const results = await Promise.all(Array.from({ length: 12 }, (_, i) => Promise.resolve().then(() => {
    const target = i % 2 ? other : store;
    return target.enqueue(i % 2 ? b : a, prepareSignedAnchor(i % 2 ? b : a, policy), policy);
  })));
  assert.ok(results.every((row) => row.id === first.id));
  assert.equal(store.list().length, 1);
  assert.equal(store.db.prepare('PRAGMA synchronous').get().synchronous, 2);
  assert.equal(store.db.prepare('PRAGMA journal_mode').get().journal_mode, 'wal');
});
test('quotas use server UTC day and retain failed and uncertain reservations', async (t) => {
  const { store, put } = fixture(t); store.approve('worker.testnet', true); store.approve('other.testnet', true);
  const midnight = Date.parse('2026-11-13T00:00:00Z');
  const a = await authorization(); const first = put(a, undefined, midnight - 1);
  store.transition(first.id, 'failed', 'SYNTHETIC_FAILURE');
  const b = await authorization({ nonce: 2 });
  assert.throws(() => put(b, undefined, midnight - 1), /EXPLICIT_RETRY_REQUIRED/);
  assert.throws(() => put(a, first.id, midnight - 1), /FRESH_AUTHORIZATION/);
  const second = put(b, first.id, midnight - 1); store.transition(second.id, 'unknown');
  put(await authorization({ root: 'b'.repeat(64) }), undefined, midnight - 1);
  const c = await authorization({ root: 'c'.repeat(64) });
  assert.throws(() => put(c, undefined, midnight - 1), /DAILY_QUOTA_EXHAUSTED/);
  put(await authorization({ worker: 'other.testnet' }), undefined, midnight - 1);
  const other = await authorization({ worker: 'other.testnet', root: 'b'.repeat(64) });
  assert.throws(() => put(other, undefined, midnight - 1), /DAILY_QUOTA_EXHAUSTED/);
  assert.equal(put(c, undefined, midnight).state, 'queued');
  assert.equal(store.get(first.id).quota_day, '2026-11-12');
});
test('revocation cancels never-broadcast jobs but preserves submitted jobs for reconciliation', async (t) => {
  const { store, put } = fixture(t); store.approve('worker.testnet', true);
  const a = put(await authorization()), b = put(await authorization({ root: 'b'.repeat(64) }));
  store.transition(a.id, 'prepared', null, { signed_bytes: 'synthetic-bytes', tx_hash: '2'.repeat(44) });
  store.transition(b.id, 'submitted');
  store.approve('worker.testnet', false);
  assert.equal(store.get(a.id).state, 'cancelled'); assert.equal(store.get(b.id).state, 'submitted');
  assert.equal(store.next().id, b.id);
});
test('deployment binding, exclusive renewable lease and rollback on disk failure', async (t) => {
  const { dir, store, put } = fixture(t);
  assert.throws(() => new RelayStore(dir, { ...policy, relayer: 'other.testnet' }), /different deployment/);
  assert.equal(store.acquire('one', 100), true); assert.equal(store.acquire('two', 101), false);
  assert.equal(store.acquire('two', 30100), true);
  assert.throws(() => store.assertLease('one', 30101), /LEASE_LOST/);
  store.approve('worker.testnet', true);
  store.db.exec('PRAGMA query_only=ON');
  const a = await authorization(); assert.throws(() => put(a));
  store.db.exec('PRAGMA query_only=OFF'); assert.equal(store.list().length, 0);
});
