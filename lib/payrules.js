// Pay-mismatch rules: expected pay from a published rate card versus the pay the
// platform showed. Pure functions, shared by the browser and tests. Explanations are
// deterministic templates (English and Tamil), not AI output.
import { parseCsv } from './compare.js';

export const DEFAULT_THRESHOLDS = { rupees: 5, percent: 5, distancePercent: 10, distanceKm: 0.5 };
const round2 = (n) => Math.round(n * 100) / 100;
const rs = (n) => '₹' + round2(n).toLocaleString('en-IN', { maximumFractionDigits: 2 });
const km = (n) => round2(n).toFixed(1);

export function validateRateCards(cards) {
  if (!cards || typeof cards !== 'object' || Array.isArray(cards)) throw new Error('Rate cards must be an object keyed by platform');
  for (const [name, c] of Object.entries(cards)) {
    if (!/^[\w .-]{1,40}$/.test(name)) throw new Error(`Invalid platform name "${name}"`);
    for (const f of ['baseFare', 'perKm']) if (typeof c?.[f] !== 'number' || !(c[f] >= 0) || c[f] > 10000) throw new Error(`${name}: ${f} must be a number from 0 to 10000`);
    if (c.minFare !== undefined && (typeof c.minFare !== 'number' || !(c.minFare >= 0))) throw new Error(`${name}: minFare must be a non-negative number`);
  }
  return cards;
}

/** Expected pay for one trip. Distance uses the worker's own GPS when present. */
export function expectedPay(trip, card) {
  const distance = trip.gpsKm ?? trip.shownKm ?? 0;
  const fare = Math.max(card.baseFare + distance * card.perKm, card.minFare ?? 0);
  const penalty = trip.penalty && trip.penaltyReason ? trip.penalty : 0; // unexplained penalties are not accepted
  return { fare: round2(fare), distance, incentive: trip.incentivePromised ?? 0, penalty, total: round2(fare + (trip.incentivePromised ?? 0) - penalty) };
}

function severity(shortfall, expected) {
  const pct = expected > 0 ? shortfall / expected * 100 : 0;
  if (shortfall >= 20 || pct >= 20) return 'high';
  if (shortfall >= 10 || pct >= 10) return 'medium';
  return 'low';
}
const SEVERITY_TA = { low: 'குறைவு', medium: 'நடுத்தரம்', high: 'அதிகம்' };

/** Check one trip. Returns { expected, shown, shortfall, flags[], severity, en, ta }. */
export function checkTrip(trip, card, thresholds = DEFAULT_THRESHOLDS) {
  const exp = expectedPay(trip, card), shown = trip.shownPay ?? 0;
  const shortfall = round2(exp.total - shown);
  const flags = [], en = [], ta = [];
  if (shortfall > thresholds.rupees || (exp.total > 0 && shortfall / exp.total * 100 > thresholds.percent)) {
    flags.push('PAY_MISMATCH');
    en.push(`Expected ${rs(exp.total)} (base ${rs(card.baseFare)} + ${km(exp.distance)} km × ${rs(card.perKm)}${exp.incentive ? ` + incentive ${rs(exp.incentive)}` : ''}${exp.penalty ? ` − penalty ${rs(exp.penalty)}` : ''}) but the app showed ${rs(shown)}: ${rs(shortfall)} short.`);
    ta.push(`எதிர்பார்க்கப்பட்ட தொகை ${rs(exp.total)}, ஆனால் செயலியில் காட்டப்பட்டது ${rs(shown)}: ${rs(shortfall)} குறைவு.`);
  }
  if (trip.gpsKm !== undefined && trip.shownKm !== undefined) {
    const gap = trip.gpsKm - trip.shownKm;
    if (gap > thresholds.distanceKm && gap / trip.gpsKm * 100 > thresholds.distancePercent) {
      flags.push('DISTANCE_GAP');
      en.push(`The app counted ${km(trip.shownKm)} km but your phone's GPS measured ${km(trip.gpsKm)} km.`);
      ta.push(`செயலி ${km(trip.shownKm)} கி.மீ. மட்டுமே கணக்கிட்டது, ஆனால் உங்கள் தொலைபேசி GPS ${km(trip.gpsKm)} கி.மீ. அளந்தது.`);
    }
  }
  if ((trip.incentivePromised ?? 0) > 0 && (trip.incentivePaid ?? 0) < trip.incentivePromised) {
    flags.push('MISSING_INCENTIVE');
    en.push(`Promised incentive ${rs(trip.incentivePromised)} was ${trip.incentivePaid ? `only partly paid (${rs(trip.incentivePaid)})` : 'not paid'}.`);
    ta.push(`வாக்களிக்கப்பட்ட ஊக்கத்தொகை ${rs(trip.incentivePromised)} ${trip.incentivePaid ? `பகுதியாக மட்டுமே (${rs(trip.incentivePaid)}) வழங்கப்பட்டது` : 'வழங்கப்படவில்லை'}.`);
  }
  if ((trip.penalty ?? 0) > 0 && !trip.penaltyReason) {
    flags.push('PENALTY_NO_REASON');
    en.push(`A ${rs(trip.penalty)} penalty was applied with no reason given.`);
    ta.push(`காரணம் எதுவும் சொல்லாமல் ${rs(trip.penalty)} அபராதம் விதிக்கப்பட்டது.`);
  }
  const sev = flags.length ? severity(Math.max(shortfall, 0), exp.total) : null;
  return { expected: exp.total, shown, shortfall: flags.length ? Math.max(shortfall, 0) : 0, flags, severity: sev,
    severityTa: sev ? SEVERITY_TA[sev] : null, en: en.join(' '), ta: ta.join(' ') };
}

const num = (v) => { const s = String(v ?? '').replace(/[₹,\s]|rs\.?|inr|km/gi, ''); if (s === '') return undefined; const n = Number(s); return Number.isFinite(n) && n >= 0 ? n : NaN; };
const COLUMNS = { tripId: ['trip_id', 'order_id', 'id', 'ref'], date: ['date', 'day', 'trip_date'], platform: ['platform', 'app'],
  gpsKm: ['gps_km', 'gps_distance_km'], shownKm: ['shown_km', 'distance_km', 'app_km'], shownPay: ['amount', 'pay', 'shown_pay', 'earnings'],
  incentivePromised: ['incentive_promised', 'promised_incentive'], incentivePaid: ['incentive_paid', 'incentive'],
  penalty: ['penalty', 'penalty_amount'], penaltyReason: ['penalty_reason', 'reason'] };

/** Trip rows from a statement CSV that carries rate-card inputs. Returns [] when the CSV has no distance columns. */
export function tripsFromCsv(text) {
  const rows = parseCsv(text);
  if (rows.length < 2) return [];
  const header = rows[0].map((h) => h.replace(/^﻿/, '').trim().toLowerCase().replace(/[\s-]+/g, '_'));
  const col = Object.fromEntries(Object.entries(COLUMNS).map(([k, names]) => [k, header.findIndex((h) => names.includes(h))]));
  if (col.platform < 0 || (col.gpsKm < 0 && col.shownKm < 0) || col.shownPay < 0) return [];
  return rows.slice(1).map((r, i) => {
    const t = { line: i + 2, platform: String(r[col.platform] ?? '').trim() };
    for (const k of ['tripId', 'date', 'penaltyReason']) if (col[k] >= 0 && String(r[col[k]] ?? '').trim()) t[k] = String(r[col[k]]).trim().slice(0, 120);
    for (const k of ['gpsKm', 'shownKm', 'shownPay', 'incentivePromised', 'incentivePaid', 'penalty']) {
      if (col[k] < 0) continue;
      const v = num(r[col[k]]);
      if (Number.isNaN(v)) throw new Error(`Row ${i + 2}: "${r[col[k]]}" is not a valid ${k}`);
      if (v !== undefined) t[k] = v;
    }
    return t;
  });
}

/** Check every trip against its platform's rate card. Unknown platforms are reported, not guessed. */
export function checkTrips(trips, cards, thresholds = DEFAULT_THRESHOLDS) {
  const results = trips.map((t) => {
    const card = cards[t.platform];
    return card ? { trip: t, ...checkTrip(t, card, thresholds) } : { trip: t, unknownPlatform: true, flags: [], shortfall: 0 };
  });
  const flagged = results.filter((r) => r.flags.length);
  return { results, flagged, totalShortfall: round2(flagged.reduce((n, r) => n + r.shortfall, 0)),
    unknown: [...new Set(results.filter((r) => r.unknownPlatform).map((r) => r.trip.platform))] };
}
