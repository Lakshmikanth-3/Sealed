import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createAlerts, createGeo, createNotifier, deviceFrom, alertHash, ALERT_KINDS } from '../server/alerts.js';
import { openSealStore, sealBox, openBox, escrowKey } from '../server/sealStore.js';

const UA = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/131.0 Mobile Safari/537.36';
function setup({ chainFails = false } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-alerts-'));
  const store = openSealStore(dir);
  store.saveMeta('seal-abc123', { sealId: 'seal-abc123', label: 'Exam paper', alertContacts: [{ email: 'owner@example.com' }, { phone: '+919800000000' }] });
  const anchored = [], sent = [];
  const chain = { recordAlert: async (id, hash, kind) => { if (chainFails) throw new Error('rpc down'); anchored.push({ id, hash, kind }); return { txHash: 'TX' + anchored.length, value: anchored.length }; } };
  const notify = createNotifier({}, { log: (line) => sent.push(line) });
  const alerts = createAlerts({ store, chain, geo: createGeo({ GEOIP_PROVIDER: 'mock' }), notify });
  return { store, alerts, anchored, sent };
}
const settle = () => new Promise((r) => setTimeout(r, 50));

test('every trigger creates an alert with mocked location, device, IST/UTC time and an on-chain hash', async () => {
  const { store, alerts, anchored, sent } = setup();
  for (const kind of ['early_open', 'early_release', 'not_holder', 'wrong_key', 'file_tampered']) {
    const a = await alerts.createAlert({ sealId: 'seal-abc123', kind, ip: '203.0.113.9', userAgent: UA, account: kind === 'not_holder' ? 'mallory.testnet' : null });
    assert.equal(a.kind, kind); assert.equal(a.summary, ALERT_KINDS[kind]);
    assert.equal(a.location.city, 'Chennai'); assert.equal(a.location.approximate, true);
    assert.deepEqual(a.device, { browser: 'Chrome', os: 'Android', mobile: true });
    assert.match(a.atIst, /IST$/); assert.match(a.at, /Z$/);
    const { hash, ...record } = a; assert.equal(hash, alertHash(record), 'hash covers the full record');
  }
  await settle();
  assert.equal(anchored.length, 6, '5 alerts plus one escalation (5 failures from one IP)');
  assert.equal(anchored.filter((x) => x.kind === 'repeated_failures').length, 1);
  const stored = store.readAlerts('seal-abc123');
  assert.ok(stored.every((a) => a.chain.status === 'recorded' && a.chain.tx));
  assert.ok(stored.every((a) => a.notified.some((n) => n.channel === 'email') && a.notified.some((n) => n.channel === 'whatsapp')));
  assert.ok(sent.some((l) => l.includes('owner@example.com')));
  assert.ok(!JSON.stringify(anchored).includes('Chennai'), 'location never goes on-chain');
});

test('GPS is used only when the visitor shared it, rounded', async () => {
  const { alerts } = setup();
  const a = await alerts.createAlert({ sealId: 'seal-abc123', kind: 'early_open', ip: '203.0.113.9', userAgent: UA, gps: { lat: 13.0827123, lon: 80.2707456, accuracy: 12.4 } });
  assert.deepEqual(a.location, { source: 'gps-consented', lat: 13.08271, lon: 80.27075, accuracyM: 12 });
});

test('five failures from one source in two minutes escalate once', async () => {
  let t = 0; const { store, alerts } = setup();
  const make = () => alerts.createAlert({ sealId: 'seal-abc123', kind: 'early_open', ip: '198.51.100.7', userAgent: UA });
  const a = createAlerts({ store, chain: { recordAlert: async () => ({ txHash: 'x', value: 0 }) }, geo: async () => ({ source: 'mock' }), notify: async () => [], now: () => new Date(1_700_000_000_000 + t) });
  for (let i = 0; i < 6; i++) { await a.createAlert({ sealId: 'seal-abc123', kind: 'wrong_key', ip: '198.51.100.7', userAgent: UA }); t += 1000; }
  await settle();
  const kinds = store.readAlerts('seal-abc123').map((x) => x.kind);
  assert.equal(kinds.filter((k) => k === 'repeated_failures').length, 1);
  assert.equal(kinds.filter((k) => k === 'wrong_key').length, 6);
  void make;
});

test('a failed on-chain write is recorded as failed, not hidden', async () => {
  const { store, alerts } = setup({ chainFails: true });
  await alerts.createAlert({ sealId: 'seal-abc123', kind: 'early_open', ip: '203.0.113.9', userAgent: UA });
  await settle();
  assert.equal(store.readAlerts('seal-abc123')[0].chain.status, 'failed');
});

test('private addresses get no location; unknown kinds and seals are rejected', async () => {
  const geo = createGeo({ GEOIP_PROVIDER: 'ipapi' }, { fetcher: () => { throw new Error('must not call'); } });
  assert.equal((await geo('127.0.0.1')).source, 'private-network');
  assert.equal((await geo('192.168.1.4')).source, 'private-network');
  const { alerts } = setup();
  await assert.rejects(alerts.createAlert({ sealId: 'seal-abc123', kind: 'made_up', ip: '1.1.1.1' }), /Unknown alert kind/);
  await assert.rejects(alerts.createAlert({ sealId: 'nope-999999', kind: 'early_open', ip: '1.1.1.1' }), /Unknown seal/);
  assert.equal(deviceFrom('').browser, 'Unknown browser');
});

test('escrow boxes are authenticated and the store rejects bad IDs', () => {
  const key = escrowKey({ SEAL_ESCROW_SECRET: 'test-secret' });
  const box = sealBox(key, Buffer.from('file key bytes'));
  assert.equal(openBox(key, box).toString(), 'file key bytes');
  assert.throws(() => openBox(escrowKey({ SEAL_ESCROW_SECRET: 'other' }), box));
  assert.throws(() => escrowKey({}), /SEAL_ESCROW_SECRET/);
  const store = openSealStore(fs.mkdtempSync(path.join(os.tmpdir(), 'sp-store-')));
  assert.throws(() => store.saveFile('../etc', Buffer.from('x')), /Invalid seal id/);
  store.saveMeta('seal-xyz789', { ownerTokenHash: store.tokenHash('tok') });
  assert.equal(store.checkToken(store.readMeta('seal-xyz789'), 'tok'), true);
  assert.equal(store.checkToken(store.readMeta('seal-xyz789'), 'nope'), false);
});
