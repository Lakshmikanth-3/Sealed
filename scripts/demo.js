// End-to-end check (screening checklist): sample log -> daily anchors -> evidence pack ->
// verifier passes untouched pack, fails edited entry, fails edited summary.
// `npm test` forces the mock chain. Live demo execution stays disabled until the
// worker-signed v2 browser, relay and verifier are integrated.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createChain } from '../server/chain.js';
import { buildCase } from '../server/caseAgent.js';
import { merkleRoot, merkleProof, randomSalt } from '../lib/merkle.js';
import { verifyPack } from '../lib/verify.js';

const forceMock = process.argv.includes('--mock');
const env = forceMock ? { NEAR_NETWORK: 'mock' } : process.env;
if (env.NEAR_NETWORK && env.NEAR_NETWORK !== 'mock') throw new Error('Live demo is pending worker-signed v2 integration. Use npm test for the labelled mock demo.');
const dataDir = forceMock ? fs.mkdtempSync(path.join(os.tmpdir(), 'appeal-')) : path.resolve('data');
const chain = createChain(env, dataDir);
const worker = 'w-demo' + Math.random().toString(36).slice(2, 8);

// Sample log: 3 days, ratings slipping, a penalty, then a deactivation notice.
// Timestamps are recent (minutes ago) so they precede the anchor, as they would live.
const now = Date.now();
let n = 0;
const mk = (dayIdx, type, extra = {}) => {
  const ts = new Date(now - (3 - dayIdx) * 60_000 - (60 - n) * 500).toISOString();
  return { id: `e${++n}`, worker, day: `2026-11-${10 + dayIdx}`, ts, type, platform: 'food-delivery',
    capture: 'live-manual', salt: randomSalt(), ...extra };
};
const log = [
  mk(0, 'trip', { amount: 62 }), mk(0, 'trip', { amount: 48 }), mk(0, 'rating', { rating: 4.8 }), mk(0, 'pay', { amount: 410 }),
  mk(1, 'trip', { amount: 55 }), mk(1, 'penalty', { amount: 50, text: 'Late delivery (restaurant delay)' }), mk(1, 'rating', { rating: 4.5 }),
  mk(2, 'trip', { amount: 70 }), mk(2, 'rating', { rating: 4.2 }),
  mk(2, 'deactivation', { text: 'Your account is deactivated due to policy violations.' }),
];

const days = [...new Set(log.map((e) => e.day))];
const draftDays = [];
for (const day of days) {
  const entries = log.filter((e) => e.day === day);
  const root = await merkleRoot(entries);
  const anchor = await chain.anchor({ worker, day, root, count: entries.length });
  console.log(`anchored ${day}  root ${root.slice(0, 12)}…  tx ${anchor.txHash}  (${anchor.network})`);
  draftDays.push({ day, root, count: entries.length, anchor: { network: anchor.network, txHash: anchor.txHash, sender: anchor.sender, ...(anchor.contract ? { contract: anchor.contract } : {}) },
    entries: await Promise.all(entries.map(async (entry, i) => ({ entry, proof: await merkleProof(entries, i) }))) });
}

const pack = await buildCase({ worker: { id: worker, label: 'Demo rider' }, days: draftDays });
console.log('\nSummary:', pack.summary.narrative, '\n');

const fetchAnchor = (ref) => chain.lookup(ref);
const results = [];
const check = async (name, p, expectOk) => {
  const r = await verifyPack(p, fetchAnchor, { deployments: { [chain.network]: { contract: chain.contract, relayer: chain.sender } } });
  const good = r.ok === expectOk;
  results.push(good);
  console.log(`${good ? 'PASS' : 'FAIL'}  ${name}: verifier says ${r.ok ? 'VERIFIED' : 'REJECTED'}`
    + (r.ok ? '' : ' -> ' + r.checks.filter((c) => !c.ok).map((c) => c.msg).concat(r.days.flatMap((d) => d.problems)).join(' | ')));
};

await check('untouched pack', pack, true);

const editedEntry = structuredClone(pack);
editedEntry.days[1].entries[1].entry.amount = 500; // inflate the penalty
await check('edited penalty amount', editedEntry, false);

const editedSummary = structuredClone(pack);
editedSummary.summary.earnings = 99999;
await check('edited summary', editedSummary, false);

const swappedRoot = structuredClone(pack);
swappedRoot.days[0].root = swappedRoot.days[1].root;
await check('root swapped between days', swappedRoot, false);

fs.mkdirSync(dataDir, { recursive: true });
const sampleFile = path.join(dataDir, 'sample-pack.json');
fs.writeFileSync(sampleFile, JSON.stringify(pack, null, 2));
console.log(`\nWrote synthetic demo pack: ${sampleFile} (not real rider data).`);
if (results.includes(false)) { console.error('\nSome checks failed.'); process.exit(1); }
console.log('All checks passed.');
