// Evidence-pack verification. Shared by the browser verifier page and the demo/test script.
// fetchAnchor(anchorRef) -> { args:{worker,day,root,count}, timestamp(ms), signer, execution }

import { verifyProof, sha256Hex, canonical } from './merkle.js';
import { buildSummary } from './summary.js';

const SKEW_MS = 5 * 60 * 1000;

export async function verifyPack(pack, fetchAnchor) {
  const report = { ok: true, checks: [], days: [] };
  const fail = (msg) => { report.ok = false; report.checks.push({ ok: false, msg }); };
  const pass = (msg) => report.checks.push({ ok: true, msg });

  if (!pack || pack.version !== 1 || !Array.isArray(pack.days)) { fail('Not a valid v1 evidence pack'); return report; }
  const worker = pack.worker?.id;
  const disclosed = [];

  for (const d of pack.days) {
    const day = { day: d.day, ok: true, problems: [], entries: [], anchor: null };
    const bad = (m) => { day.ok = false; day.problems.push(m); };
    let anchor;
    try {
      anchor = await fetchAnchor(d.anchor);
      day.anchor = anchor;
    } catch (e) { bad(`Anchor not found on ${d.anchor?.network}: ${e.message}`); }

    if (anchor) {
      const a = anchor.args || {};
      if (a.root !== d.root) bad('On-chain root differs from the pack root');
      if (a.worker !== worker) bad('Anchor belongs to a different worker');
      if (a.day !== d.day) bad('Anchor is for a different day');
      if (d.anchor.sender && anchor.signer && anchor.signer !== d.anchor.sender) bad('Anchor signer differs from pack');
    }

    for (const item of d.entries) {
      const e = item.entry;
      const r = { id: e.id, ok: true, problems: [] };
      if (!(await verifyProof(e, item.proof, d.root))) { r.ok = false; r.problems.push('edited or not in the anchored log'); }
      if (e.worker !== worker) { r.ok = false; r.problems.push('different worker'); }
      if (e.day !== d.day) { r.ok = false; r.problems.push('different day'); }
      if (anchor && Date.parse(e.ts) > anchor.timestamp + SKEW_MS) { r.ok = false; r.problems.push('timestamp is after the anchor'); }
      if (e.imageHash && pack.attachments?.[e.imageHash]) {
        const bytes = Uint8Array.from(atob(pack.attachments[e.imageHash].split(',')[1]), (c) => c.charCodeAt(0));
        if ((await sha256Hex(bytes)) !== e.imageHash) { r.ok = false; r.problems.push('screenshot does not match its hash'); }
      }
      if (!r.ok) bad(`Entry ${e.id}: ${r.problems.join(', ')}`);
      day.entries.push(r);
      disclosed.push(e);
    }
    if (!day.ok) report.ok = false;
    report.days.push(day);
  }

  const okDays = report.days.filter((d) => d.ok).length;
  (okDays === report.days.length ? pass : fail)(`${okDays}/${report.days.length} days match their on-chain anchors`);

  const recomputed = buildSummary(disclosed);
  const sumHash = await sha256Hex(canonical(recomputed));
  if (canonical(recomputed) !== canonical(pack.summary)) fail('Case summary was edited (does not match the disclosed entries)');
  else if (sumHash !== pack.summaryHash) fail('Summary hash mismatch');
  else pass('Case summary recomputed from disclosed entries and matches');

  report.attestation = pack.attestation?.kind === 'unattested-local'
    ? 'Summary is NOT TEE-attested yet (local deterministic generator). Recomputed independently above.'
    : `Attestation: ${pack.attestation?.kind || 'none'}`;
  report.recomputedSummary = recomputed;
  return report;
}
