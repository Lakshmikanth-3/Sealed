// Deterministic case builder. Verified private AI generation is an explicit,
// separately consented operation in privateBrief.js, never a local substitute.

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { validateDraft } from '../lib/schema.js';
import { buildSummary } from '../lib/summary.js';
import { sha256Hex, canonical, verifyProof } from '../lib/merkle.js';

const generatorPath = fileURLToPath(new URL('../lib/summary.js', import.meta.url));

export async function buildCase(draft) {
  validateDraft(draft);
  // Refuse to summarise anything that does not match its own day root.
  for (const d of draft.days) {
    for (const it of d.entries) {
      if (!(await verifyProof(it.entry, it.proof, d.root))) throw new Error(`entry ${it.entry.id} does not match day ${d.day}`);
    }
  }
  const entries = draft.days.flatMap((d) => d.entries.map((x) => x.entry));
  const summary = buildSummary(entries);
  return {
    version: draft.version ?? 1,
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
      note: 'Deterministic summary, independently recomputed from disclosed entries. No TEE attestation applies to this calculation.',
    },
    disclaimer: 'Evidence support only, not legal advice. Checks content committed by the anchor time. Account authorization must be verified against NEAR; personal names and capture timestamps are self-reported. This does not establish truth or completeness.',
  };
}
