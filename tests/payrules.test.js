import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { expectedPay, checkTrip, checkTrips, tripsFromCsv, validateRateCards } from '../lib/payrules.js';

const cards = validateRateCards(JSON.parse(fs.readFileSync(new URL('../public/ratecards.json', import.meta.url))));
const eats = cards.DemoEats;

test('demo case: 7 km trip shown at ₹40 is ₹22 short of ₹62', () => {
  const r = checkTrip({ gpsKm: 7, shownKm: 7, shownPay: 40 }, eats);
  assert.equal(r.expected, 62); assert.equal(r.shortfall, 22);
  assert.deepEqual(r.flags, ['PAY_MISMATCH']); assert.equal(r.severity, 'high'); assert.equal(r.severityTa, 'அதிகம்');
  assert.match(r.en, /Expected ₹62 .* showed ₹40: ₹22 short/); assert.match(r.ta, /₹22 குறைவு/);
});

test('fair pay within the ₹5 / 5% threshold is not flagged', () => {
  assert.deepEqual(checkTrip({ gpsKm: 7, shownPay: 62 }, eats).flags, []);
  assert.deepEqual(checkTrip({ gpsKm: 7, shownPay: 59 }, eats).flags, [], '₹3 short (4.8%) stays under both thresholds');
  assert.deepEqual(checkTrip({ gpsKm: 7, shownPay: 56 }, eats).flags, ['PAY_MISMATCH'], '₹6 short crosses ₹5');
  assert.equal(checkTrip({ gpsKm: 7, shownPay: 70 }, eats).shortfall, 0, 'overpayment is never a shortfall');
});

test('minimum fare, promised incentive and penalties with reasons', () => {
  assert.equal(expectedPay({ gpsKm: 0.2 }, eats).total, 25, 'minimum fare');
  assert.equal(expectedPay({ gpsKm: 5, incentivePromised: 15 }, eats).total, 65);
  assert.equal(expectedPay({ gpsKm: 5, penalty: 10, penaltyReason: 'Late by 20 min' }, eats).total, 40, 'explained penalty deducted');
  assert.equal(expectedPay({ gpsKm: 5, penalty: 10 }, eats).total, 50, 'unexplained penalty not accepted');
});

test('flags distance gap, missing incentive and unexplained penalty together', () => {
  const r = checkTrip({ gpsKm: 8, shownKm: 5, shownPay: 30, incentivePromised: 15, incentivePaid: 0, penalty: 10 }, eats);
  assert.deepEqual(r.flags, ['PAY_MISMATCH', 'DISTANCE_GAP', 'MISSING_INCENTIVE', 'PENALTY_NO_REASON']);
  assert.equal(r.expected, 83); assert.equal(r.shortfall, 53);
  assert.match(r.en, /counted 5\.0 km .* GPS measured 8\.0 km/); assert.match(r.ta, /அபராதம்/);
  assert.deepEqual(checkTrip({ gpsKm: 5.3, shownKm: 5, shownPay: 52 }, eats).flags, [], 'small GPS noise is not a distance gap');
});

test('reads simulator CSV and totals shortfall across trips', () => {
  const csv = 'trip_id,date,platform,gps_km,shown_km,amount,incentive_promised,incentive_paid,penalty,penalty_reason\n'
    + 'T1,2026-11-10,DemoEats,7.0,7.0,62,0,0,0,\nT2,2026-11-10,DemoEats,7.0,7.0,40,0,0,0,\nT3,2026-11-10,DemoBus,3,3,40,0,0,0,\n';
  const trips = tripsFromCsv(csv);
  assert.equal(trips.length, 3); assert.equal(trips[1].shownPay, 40);
  const report = checkTrips(trips, cards);
  assert.equal(report.flagged.length, 1); assert.equal(report.totalShortfall, 22);
  assert.deepEqual(report.unknown, ['DemoBus'], 'unknown platforms are reported, not guessed');
  assert.deepEqual(tripsFromCsv('date,amount\n2026-11-10,5'), [], 'plain statements carry no rate-card inputs');
  assert.throws(() => tripsFromCsv('platform,gps_km,amount\nDemoEats,abc,5'), /not a valid gpsKm/);
});

test('rate card validation', () => {
  assert.throws(() => validateRateCards({ X: { baseFare: -1, perKm: 1 } }), /baseFare/);
  assert.throws(() => validateRateCards([]), /object/);
  assert.throws(() => validateRateCards({ '<script>': { baseFare: 1, perKm: 1 } }), /Invalid platform/);
});
