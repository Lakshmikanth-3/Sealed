// Deterministic case summary. Runs on the server (case-builder agent) and again in the
// verifier, so anyone can check the summary was derived from the disclosed entries only.
// Pure function, no randomness, no clock.

const round2 = (n) => Math.round(n * 100) / 100;

export function buildSummary(entries) {
  const sorted = [...entries].sort((a, b) => a.ts.localeCompare(b.ts));
  const byType = {};
  for (const e of sorted) byType[e.type] = (byType[e.type] || 0) + 1;

  const days = [...new Set(sorted.map((e) => e.day))].sort();
  const earnings = sorted.filter((e) => e.type === 'pay' || e.type === 'trip')
    .reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const penalties = sorted.filter((e) => e.type === 'penalty');
  const penaltyTotal = penalties.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const ratings = sorted.filter((e) => e.type === 'rating' && e.rating != null).map((e) => Number(e.rating));
  const half = Math.ceil(ratings.length / 2);
  const avg = (a) => (a.length ? round2(a.reduce((s, x) => s + x, 0) / a.length) : null);
  const firstHalf = avg(ratings.slice(0, half)), secondHalf = avg(ratings.slice(half));
  const deactivations = sorted.filter((e) => e.type === 'deactivation');
  const trips = byType.trip || 0;

  let trend = 'not enough ratings';
  if (ratings.length >= 2 && firstHalf != null && secondHalf != null) {
    const d = round2(secondHalf - firstHalf);
    trend = Math.abs(d) < 0.05 ? 'stable' : d > 0 ? `rising (+${d})` : `falling (${d})`;
  }

  const lines = [
    `Records cover ${days.length} work day(s) from ${days[0] || '-'} to ${days.at(-1) || '-'}, ${sorted.length} disclosed entries.`,
    `Trips logged: ${trips}. Earnings logged: ₹${round2(earnings)}${days.length ? ` (avg ₹${round2(earnings / days.length)}/day)` : ''}.`,
    ratings.length
      ? `Ratings: ${ratings.length} recorded, average ${avg(ratings)}, trend ${trend}.`
      : 'No ratings recorded.',
    penalties.length
      ? `Penalties: ${penalties.length}, total ₹${round2(penaltyTotal)}.`
      : 'No penalties recorded.',
    deactivations.length
      ? `Deactivation notice captured at ${deactivations[0].ts}${deactivations[0].text ? `: "${deactivations[0].text}"` : ''}.`
      : 'No deactivation notice in disclosed entries.',
  ];

  return {
    generator: 'appeal-record/summary.js v1',
    period: { from: days[0] || null, to: days.at(-1) || null, days: days.length },
    counts: byType,
    trips,
    earnings: round2(earnings),
    ratings: { count: ratings.length, average: avg(ratings), firstHalf, secondHalf, trend },
    penalties: { count: penalties.length, total: round2(penaltyTotal) },
    deactivation: deactivations[0] ? { ts: deactivations[0].ts, text: deactivations[0].text || '' } : null,
    narrative: lines.join(' '),
  };
}
