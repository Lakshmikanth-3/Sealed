import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openShares } from '../server/shareStore.js';
test('shares persist across restart and require the deletion capability', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'appeal-share-test-'));
  let store = openShares(dir); const pack = { private: 'test-only record' };
  const share = store.create(pack, 300);
  assert.equal(share.id.length, 32); assert.equal(share.managementToken.length, 43);
  store.close(); store = openShares(dir);
  assert.deepEqual(store.read(share.id), pack);
  assert.equal(store.revoke(share.id, 'x'.repeat(43)), false);
  assert.equal(store.revoke(share.id, share.managementToken), true);
  assert.equal(store.read(share.id), null); store.close();
});
test('expired evidence is deleted and capacity/lifetime limits cannot be bypassed', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'appeal-expiry-test-'));
  const store = openShares(dir, { maxShares: 1, maxBytes: 1000 });
  const first = store.create({ record: 1 });
  assert.throws(() => store.create({ record: 2 }), /capacity/);
  for (const ttl of [0, 299, 604801, '86400']) assert.throws(() => store.create({}, ttl), /lifetime/);
  const db = new DatabaseSync(path.join(dir, 'shares.sqlite'));
  db.prepare('UPDATE shares SET expires = 0 WHERE id = ?').run(first.id); db.close();
  assert.equal(store.read(first.id), null);
  store.create({ record: 2 }); store.close();
});
test('a competing database writer cannot crash scheduled expiry cleanup', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'appeal-share-lock-test-'));
  const store = openShares(dir);
  const share = store.create({ record: 1 });
  const writer = new DatabaseSync(path.join(dir, 'shares.sqlite'));
  try {
    writer.exec('BEGIN IMMEDIATE');
    assert.equal(store.cleanupExpired(), false);
    writer.exec('ROLLBACK');
    assert.equal(store.cleanupExpired(), true);
    assert.deepEqual(store.read(share.id), { record: 1 });
  } finally { writer.close(); store.close(); }
});
