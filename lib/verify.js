// Content-integrity verification. Capture time and worker identity in v1 are
// self-reported; a valid proof establishes commitment by the anchor time only.
import { verifyProof, sha256Hex, canonical } from './merkle.js';
import { buildSummary } from './summary.js';
import { validatePack, imageBytes } from './schema.js';

export async function verifyPack(pack, fetchAnchor, { deployments = {} } = {}) {
  const report = { ok: true, checks: [], days: [], attestationVerified: false, workerAuthorizationVerified: false,
    identity: 'Worker account authorization has not been verified.',
    attestation: 'No TEE attestation verified. This verifier checks content integrity only.' };
  const fail = (msg) => { report.ok = false; report.checks.push({ ok: false, msg }); };
  const pass = (msg) => report.checks.push({ ok: true, msg });
  try { validatePack(pack); }
  catch (e) { fail(e.message); return report; }
  if (pack.version === 1) report.identity = 'Worker identity is self-reported in v1 evidence. No account authorization is verified.';
  const worker = pack.worker.id;
  const disclosed = [];
  for (const d of pack.days) {
    const day = { day: d.day, ok: true, problems: [], entries: [], anchor: null };
    const bad = (message) => { day.ok = false; day.problems.push(message); };
    let anchor;
    try {
      {
        const expected = deployments[d.anchor.network];
        if (!expected?.contract) throw new Error('No trusted NEAR deployment configured');
        if (d.anchor.contract !== expected.contract || (d.anchor.sender !== expected.relayer && !(pack.version === 2 && d.anchor.sender === worker))) throw new Error('Pack differs from trusted NEAR deployment');
      }
      anchor = await fetchAnchor(d.anchor, { protocol: pack.version });
      if ((anchor?.execution !== 'success' || anchor?.finality !== 'FINAL'
        || anchor?.receiver !== d.anchor.contract || anchor?.method !== 'anchor' || anchor?.network !== d.anchor.network
        || anchor?.txHash !== d.anchor.txHash)) throw new Error('Not a successful finalized anchor on the trusted deployment');
      if (pack.version === 2 && (anchor?.protocol !== 2 || !['nep366', 'wallet'].includes(anchor?.workerAuthorization)
        || anchor?.workerAccount !== worker || anchor?.receiptId !== d.anchor.receiptId)) throw new Error('Worker account authorization or receipt reference mismatch');
      if (!anchor || !Number.isFinite(anchor.timestamp) || anchor.timestamp <= 0) throw new Error('Invalid anchor timestamp');
      day.anchor = anchor;
    } catch (e) { anchor = null; bad(`Anchor unavailable: ${e.message}`); }
    if (anchor) {
      const a = anchor.args || {};
      if (a.v !== pack.version) bad('Anchor protocol differs from the evidence pack');
      if (pack.version === 2 && a.network !== d.anchor.network) bad('Signed anchor network differs from pack');
      if (a.root !== d.root) bad('On-chain root differs from the pack root');
      if (a.worker !== worker) bad('Anchor belongs to a different worker');
      if (a.day !== d.day) bad('Anchor is for a different day');
      if (a.count !== d.count) bad('Anchored entry count differs from pack');
      if (anchor.signer !== d.anchor.sender) bad('Anchor signer differs from pack');
    }
    for (const item of d.entries) {
      const e = item.entry;
      const r = { id: e.id, ok: true, problems: [] };
      const entryBad = (message) => { r.ok = false; r.problems.push(message); };
      if (!(await verifyProof(e, item.proof, d.root))) entryBad('edited or not in the anchored log');
      // No clock-skew allowance: an entry claiming a later time cannot establish
      // existence by that time. A bad device clock must be corrected, not hidden.
      if (anchor && Date.parse(e.ts) > anchor.timestamp) entryBad('claimed capture timestamp is after the anchor');
      if (e.imageHash && Object.hasOwn(pack.attachments || {}, e.imageHash)) {
        if ((await sha256Hex(imageBytes(pack.attachments[e.imageHash]))) !== e.imageHash) entryBad('screenshot does not match its hash');
      }
      if (!r.ok) bad(`Entry ${e.id}: ${r.problems.join(', ')}`);
      day.entries.push(r);
      disclosed.push(e);
    }
    if (!day.ok) report.ok = false;
    report.days.push(day);
  }
  const okDays = report.days.filter((d) => d.ok).length;
  (okDays === report.days.length ? pass : fail)(`${okDays}/${report.days.length} days match their anchor commitments`);
  const recomputed = buildSummary(disclosed);
  const sumHash = await sha256Hex(canonical(recomputed));
  if (canonical(recomputed) !== canonical(pack.summary)) fail('Case summary was edited (does not match the disclosed entries)');
  else if (sumHash !== pack.summaryHash) fail('Summary hash mismatch');
  else pass('Case summary recomputed from disclosed entries and matches');
  report.recomputedSummary = recomputed;
  if (pack.version === 2 && report.ok) {
    report.workerAuthorizationVerified = true;
    report.identity = `NEAR account ${worker} authorized these anchor calls. This does not establish the person's name, employment or capture time.`;
    pass('Worker account authorization verified through finalized NEAR execution');
  }
  return report;
}
