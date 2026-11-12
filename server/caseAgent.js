// Case-builder agent. Today: deterministic local summary, honestly labelled "unattested-local".
// The verifier recomputes it from the disclosed entries, so it cannot be silently edited.
// TODO(NEAR AI Cloud): when NEARAI_API_KEY is available, run the same generator inside a
// NEAR AI Cloud TEE and attach its attestation report as { kind: 'near-ai-cloud-tee', report }.

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildSummary } from '../lib/summary.js';
import { sha256Hex, canonical, verifyProof } from '../lib/merkle.js';

const generatorPath = fileURLToPath(new URL('../lib/summary.js', import.meta.url));

export async function buildCase(draft) {
  if (!draft?.worker?.id || !Array.isArray(draft.days) || !draft.days.length) throw new Error('pack needs worker and days');
  // Refuse to summarise anything that does not match its own day root.
  for (const d of draft.days) {
    for (const it of d.entries) {
      if (!(await verifyProof(it.entry, it.proof, d.root))) throw new Error(`entry ${it.entry.id} does not match day ${d.day}`);
    }
  }
  const entries = draft.days.flatMap((d) => d.entries.map((x) => x.entry));
  const summary = buildSummary(entries);
  return {
    version: 1,
    createdAt: new Date().toISOString(),
    worker: { id: draft.worker.id, label: String(draft.worker.label || '').slice(0, 60) },
    days: draft.days,
    attachments: draft.attachments || {},
    summary,
    summaryHash: await sha256Hex(canonical(summary)),
    attestation: {
      kind: 'unattested-local',
      generator: summary.generator,
      generatorSha256: await sha256Hex(fs.readFileSync(generatorPath)),
      note: 'Not yet run in a NEAR AI Cloud TEE. Verifier recomputes the summary instead.',
    },
    disclaimer: 'Evidence support only, not legal advice. Proves when records were captured and that they were not edited after anchoring; it does not prove each record is true.',
  };
}
