import test from 'node:test';
import assert from 'node:assert/strict';
import { validateBackup } from '../lib/backup.js';
import { merkleRoot, sha256Hex } from '../lib/merkle.js';
import { buildReviewBrief } from '../lib/brief.js';
import { workerFixture } from './fixtures/worker-v2.js';
import { verifyPack } from '../lib/verify.js';
import { lookupNearTx } from '../lib/nearRpc.js';

async function backup() {
  const entry = { id: 'synthetic-entry', worker: 'w-synthetic', day: '2026-11-12', ts: '2026-11-12T00:00:00Z', type: 'trip', amount: 10, salt: 'a'.repeat(32) };
  const root = await merkleRoot([entry]);
  return { format: 'appeal-backup', version: 1, worker: entry.worker, entries: [{ id: entry.id, entry }],
    anchors: [{ day: entry.day, key: entry.day + ':' + '2'.repeat(44), root, count: 1, entryIds: [entry.id], txHash: '2'.repeat(44), network: 'testnet', sender: 'relay.testnet', contract: 'anchors.testnet', timestamp: Date.parse('2026-11-12T00:01:00Z') }] };
}
test('backup restores consistent legacy and versioned journals without claiming chain execution', async () => {
  const source = await backup(); const result = await validateBackup(source);
  assert.equal(result.anchors[0].restored, true); assert.deepEqual(result.entries, source.entries);
  delete source.format; delete source.version;
  assert.equal((await validateBackup(source)).worker, source.worker);
});
for (const [name, mutate] of [
  ['edited anchored amount', (b) => { b.entries[0].entry.amount = 20; }],
  ['duplicate records', (b) => b.entries.push(b.entries[0])],
  ['mixed workers', (b) => { b.entries[0].entry.worker = 'w-other'; }],
  ['duplicate anchor members', (b) => { b.anchors[0].entryIds.push(b.entries[0].id); b.anchors[0].count++; }],
  ['missing anchor member', (b) => { b.entries = []; }],
  ['unexpected backup fields', (b) => { b.privateKey = 'must-not-import'; }],
  ['unsupported version', (b) => { b.version = 2; }],
  ['missing screenshot', (b) => { b.entries[0].entry.imageHash = 'b'.repeat(64); }],
  ['unknown network', (b) => { b.anchors[0].network = 'unknown'; }],
  ['mismatched reference key', (b) => { b.anchors[0].key = 'other'; }],
]) test(`backup refuses ${name}`, async () => { const b = await backup(); mutate(b); await assert.rejects(validateBackup(b)); });

test('backup binds original screenshot bytes and refuses executable attachment formats', async () => {
  const b = await backup(); b.anchors = [];
  const bytes = new Uint8Array([1, 2, 3]); b.entries[0].entry.imageHash = await sha256Hex(bytes);
  b.entries[0].image = 'data:image/png;base64,AQID'; await validateBackup(b);
  b.entries[0].image = 'data:image/png;base64,AQIE'; await assert.rejects(validateBackup(b), /fingerprint/);
  b.entries[0].image = 'data:image/svg+xml;base64,AQID'; await assert.rejects(validateBackup(b));
});

test('review brief cites disclosed records, keeps amount categories distinct and refuses failed verification', async () => {
  const f = await workerFixture();
  const report = await verifyPack(f.pack, (ref) => lookupNearTx('http://synthetic', ref.txHash, ref.sender,
    { ...f.policy, protocol: 2, receiptId: ref.receiptId, fetcher: f.fetcher }),
    { deployments: { testnet: { contract: f.policy.contract, relayer: f.policy.relayer } } });
  assert.equal(report.ok, true);
  const brief = buildReviewBrief(f.pack, report);
  for (const entry of f.pack.days.flatMap((day) => day.entries.map((item) => item.entry))) assert.ok(brief.includes(`[E:${entry.id}]`));
  assert.match(brief, /not a finding of money owed/); assert.match(brief, /TEE attestation: not verified/);
  assert.match(brief, /Do not add overlapping amounts/); assert.match(brief, /Undisclosed entries are unavailable/);
  assert.throws(() => buildReviewBrief(f.pack, { ...report, ok: false }), /Verify this pack/);
});
