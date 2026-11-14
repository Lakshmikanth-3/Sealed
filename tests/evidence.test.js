// Synthetic regression fixtures. These are not rider records or pilot metrics.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCase } from '../server/caseAgent.js';
import { buildSummary } from '../lib/summary.js';
import { merkleRoot, merkleProof, randomSalt, sha256Hex, canonical, verifyProof } from '../lib/merkle.js';
import { verifyPack as verifyPackWithPolicy } from '../lib/verify.js';
const verifyPack = (pack, lookup) => verifyPackWithPolicy(pack, lookup, { deployments: { testnet: { contract: 'anchors.testnet', relayer: 'relay.testnet' } } });
import { imageBytes } from '../lib/schema.js';

async function fixture() {
  const ts = new Date(Date.now() - 600000).toISOString();
  const day = ts.slice(0, 10), worker = 'w-synthetic-test';
  const entries = [
    { id: 'synthetic-a', worker, day, ts, type: 'trip', amount: 100, salt: randomSalt() },
    { id: 'synthetic-b', worker, day, ts, type: 'penalty', amount: 10, salt: randomSalt() },
  ];
  const root = await merkleRoot(entries);
  const anchor = { args: { v: 1, worker, day, root, count: entries.length }, timestamp: Date.now(), signer: 'relay.testnet', receiver: 'anchors.testnet', method: 'anchor', network: 'testnet', execution: 'success', finality: 'FINAL', txHash: '2'.repeat(44) };
  const draft = { worker: { id: worker, label: 'Synthetic fixture' }, days: [{ day, root, count: entries.length,
    anchor: { network: 'testnet', sender: 'relay.testnet', contract: 'anchors.testnet', txHash: '2'.repeat(44) },
    entries: await Promise.all(entries.map(async (entry, i) => ({ entry, proof: await merkleProof(entries, i) }))) }] };
  const pack = await buildCase(draft);
  return { pack, anchor, draft };
}

async function recalculate(pack) {
  pack.summary = buildSummary(pack.days.flatMap((d) => d.entries.map((e) => e.entry)));
  pack.summaryHash = await sha256Hex(canonical(pack.summary));
}

test('untouched pack and a selective disclosure verify', async () => {
  const { pack, anchor } = await fixture();
  assert.equal((await verifyPack(pack, async () => anchor)).ok, true);
  pack.days[0].entries.pop();
  await recalculate(pack);
  assert.equal((await verifyPack(pack, async () => anchor)).ok, true);
});

for (const [name, mutate] of [
  ['repeated entry', (p) => { p.days[0].count++; p.days[0].entries.push(structuredClone(p.days[0].entries[0])); }],
  ['repeated day', (p) => p.days.push(structuredClone(p.days[0]))],
  ['false count', (p) => { p.days[0].count = 999; }],
  ['empty pack', (p) => { p.days = []; }],
  ['empty day', (p) => { p.days[0].entries = []; }],
  ['invalid hour', (p) => { p.days[0].entries[0].entry.ts = p.days[0].day + 'T24:00:00Z'; }],
  ['invalid timestamp', (p) => { p.days[0].entries[0].entry.ts = 'not-a-date'; }],
  ['impossible calendar date', (p) => { p.days[0].day = '2026-02-30'; }],
  ['negative amount', (p) => { p.days[0].entries[0].entry.amount = -1; }],
  ['nonfinite amount', (p) => { p.days[0].entries[0].entry.amount = Infinity; }],
  ['rating outside range', (p) => { p.days[0].entries[0].entry.rating = 6; }],
  ['unknown network', (p) => { p.days[0].anchor.network = 'made-up'; }],
  ['worker mismatch', (p) => { p.worker.id = 'another-worker'; }],
  ['invalid proof side', (p) => { p.days[0].entries[0].proof[0].side = 'other'; }],
  ['invalid proof hash', (p) => { p.days[0].entries[0].proof[0].hash = 'zz'.repeat(32); }],
  ['missing proof', (p) => { delete p.days[0].entries[0].proof; }],
  ['edited amount', (p) => { p.days[0].entries[0].entry.amount = 200; }],
  ['swapped root', (p) => { p.days[0].root = '0'.repeat(64); }],
]) {
  test(`rejects ${name} even when summary is recomputed`, async () => {
    const { pack, anchor } = await fixture();
    mutate(pack);
    await recalculate(pack);
    assert.equal((await verifyPack(pack, async () => anchor)).ok, false);
  });
}

test('duplicate records with the original anchored count are rejected', async () => {
  const { pack, anchor } = await fixture();
  pack.days[0].entries[1] = structuredClone(pack.days[0].entries[0]);
  await recalculate(pack);
  assert.equal(pack.summary.earnings, 200);
  assert.equal((await verifyPack(pack, async () => anchor)).ok, false);
});

test('edited summary and summary hash are rejected', async () => {
  const { pack, anchor } = await fixture();
  pack.summary.earnings++;
  assert.equal((await verifyPack(pack, async () => anchor)).ok, false);
  await recalculate(pack);
  pack.summaryHash = '0'.repeat(64);
  assert.equal((await verifyPack(pack, async () => anchor)).ok, false);
});

test('missing anchor, invalid anchor timestamp and wrong signer fail closed', async () => {
  const { pack, anchor } = await fixture();
  for (const changed of [null, { ...anchor, timestamp: NaN }, { ...anchor, signer: 'other' }]) {
    assert.equal((await verifyPack(pack, async () => changed)).ok, false);
  }
  assert.equal((await verifyPack(pack, async () => { throw new Error('offline'); })).ok, false);
});

test('claimed capture time after anchor fails without a hidden grace period', async () => {
  const { pack, anchor } = await fixture();
  anchor.timestamp = Date.parse(pack.days[0].entries[0].entry.ts) - 1;
  assert.equal((await verifyPack(pack, async () => anchor)).ok, false);
});

test('odd-sized Merkle trees support all disclosures', async () => {
  for (const count of [1, 3, 5, 9]) {
    const entries = Array.from({ length: count }, (_, id) => ({ id, salt: randomSalt() }));
    const root = await merkleRoot(entries);
    for (let i = 0; i < entries.length; i++) assert.equal(await verifyProof(entries[i], await merkleProof(entries, i), root), true);
    await assert.rejects(merkleProof(entries, -1));
    await assert.rejects(merkleProof(entries, entries.length));
  }
});

test('a claimed attestation kind is never treated as verified attestation', async () => {
  const { pack, anchor } = await fixture();
  pack.attestation = { kind: 'near-ai-cloud-tee', report: 'forged' };
  const result = await verifyPack(pack, async () => anchor);
  assert.equal(result.attestationVerified, false);
  assert.match(result.attestation, /No TEE attestation verified/);
});

test('screenshots match bytes and malicious URL prefixes fail', async () => {
  const { draft, anchor } = await fixture();
  const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1e0AAAAASUVORK5CYII=';
  const hash = await sha256Hex(imageBytes(image));
  const entries = draft.days[0].entries.map((e) => e.entry);
  entries[0].imageHash = hash;
  const root = await merkleRoot(entries);
  draft.days[0].root = anchor.args.root = root;
  draft.days[0].entries = await Promise.all(entries.map(async (entry, i) => ({ entry, proof: await merkleProof(entries, i) })));
  draft.attachments = { [hash]: image };
  const pack = await buildCase(draft);
  assert.equal((await verifyPack(pack, async () => anchor)).ok, true);
  pack.attachments[hash] = 'data:image/png;base64,YWJjZA==';
  assert.equal((await verifyPack(pack, async () => anchor)).ok, false);
  pack.attachments[hash] = image.replace('data:image/png;base64,', 'x" onerror="alert(1)",');
  assert.equal((await verifyPack(pack, async () => anchor)).ok, false);
  await assert.rejects(buildCase(pack));
});

test('malformed packs return structured failure without throwing', async () => {
  for (const pack of [null, [], {}, { version: 1, days: [null] }]) {
    const report = await verifyPack(pack, () => { throw new Error('must not fetch'); });
    assert.equal(report.ok, false);
    assert.ok(report.checks.length);
  }
});

test('case generator refuses duplicate and malformed evidence before summary', async () => {
  const { draft } = await fixture();
  draft.days[0].entries[1] = structuredClone(draft.days[0].entries[0]);
  await assert.rejects(buildCase(draft), /Duplicate entry/);
});
