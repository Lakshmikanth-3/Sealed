// A deterministic review aid, not AI analysis or a legal conclusion. Every
// source record is cited and only the disclosed pack can contribute content.
export function buildReviewBrief(pack, report) {
  if (!report?.ok || !report.recomputedSummary) throw new Error('Verify this pack before preparing a review brief');
  const entries = pack.days.flatMap((day) => day.entries.map((item) => item.entry))
    .sort((a, b) => a.ts.localeCompare(b.ts) || a.id.localeCompare(b.id));
  const lines = ['APPEAL — EVIDENCE REVIEW', '',
    `Worker reference: ${pack.worker.id}`, `Display name (self-reported): ${pack.worker.label || 'Not supplied'}`,
    `Evidence protocol: v${pack.version}`,
    `Account authorization: ${report.workerAuthorizationVerified ? 'Verified against NEAR execution' : 'Not verified'}`,
    `Environment: ${pack.days.some((day) => day.anchor.network === 'mock') ? 'LOCAL DEMO — not NEAR evidence' : 'NEAR commitments checked through public RPC'}`,
    'TEE attestation: not verified', '', 'RECORDED EVENTS'];
  for (const entry of entries) {
    lines.push(`[E:${entry.id}] ${entry.day} · device time ${entry.ts} · ${entry.type}`);
    if (entry.amount !== undefined) lines.push(`Recorded amount: INR ${entry.amount} (${entry.type}; not a finding of money owed)`);
    if (entry.rating !== undefined) lines.push(`Recorded rating: ${entry.rating}`);
    if (entry.text) lines.push(`Worker-supplied note: ${JSON.stringify(entry.text)}`);
    lines.push(`Capture source: ${entry.capture || 'Not supplied'}`);
    if (entry.imageHash) lines.push(`Screenshot ${pack.attachments?.[entry.imageHash] ? 'disclosed' : 'not disclosed'}; SHA-256 ${entry.imageHash}`);
  }
  lines.push('', 'COMMITMENT REFERENCES');
  for (const day of pack.days) lines.push(`${day.day}: ${day.entries.length}/${day.count} entries disclosed; ${day.anchor.network}; tx ${day.anchor.txHash}; root ${day.root}${day.anchor.receiptId ? '; receipt ' + day.anchor.receiptId : ''}`);
  lines.push('', 'QUESTIONS FOR REVIEW',
    'Which platform decision or payment is being challenged? The pack does not establish the reason for a platform decision.',
    'Which entries are relevant? Confirm them with the worker and request the original platform records where available.',
    'Do trip and pay entries refer to the same money? Do not add overlapping amounts as a loss or debt.',
    'Are screenshots, names or locations needed before wider sharing?', '', 'PROOF LIMITS',
    'Checks establish disclosed content matches commitments by their anchor times. Device times, personal names, notes, truth and completeness are not independently established.',
    'Undisclosed entries are unavailable for review; no inference about their contents is made.',
    'This deterministic brief is not an attested AI output, legal advice or a finding that a platform acted unlawfully.');
  return lines.join('\n');
}
