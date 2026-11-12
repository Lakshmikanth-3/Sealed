import test from 'node:test';
import assert from 'node:assert/strict';
import { assessEconomics } from '../lib/economics.js';
// Synthetic arithmetic fixtures; not proposed prices, costs or business results.
const fixture = () => ({ currency: 'INR', period: 'synthetic period', fixedCosts: [{ label: 'synthetic fixed', amountMinor: '101', source: 'synthetic fixture' }],
  variableCostsPerPack: [{ label: 'synthetic variable', amountMinor: '2', source: 'synthetic fixture' }],
  pricePerPackMinor: '12', priceSource: 'synthetic fixture', priceBasis: 'proposed' });
test('cost scenarios use exact integer arithmetic and distinguish hypotheses from customer evidence', () => {
  const out = assessEconomics(fixture()); assert.equal(out.breakEvenPacksPerPeriod, '11');
  assert.equal(out.contributionPerPackMinor, '10'); assert.match(out.interpretation, /not proof of demand/);
  const input = fixture(); input.pricePerPackMinor = '2'; assert.equal(assessEconomics(input).breakEvenPacksPerPeriod, null);
  input.pricePerPackMinor = '1'; assert.equal(assessEconomics(input).contributionPerPackMinor, '-1');
  input.fixedCosts[0].amountMinor = '90071992547409930'; input.pricePerPackMinor = '12';
  assert.equal(assessEconomics(input).breakEvenPacksPerPeriod, '9007199254740993');
});
test('cost scenarios refuse missing provenance, blank prices and currency-unit mistakes', () => {
  for (const mutate of [
    (i) => { i.fixedCosts[0].source = ''; }, (i) => { i.pricePerPackMinor = null; },
    (i) => { i.pricePerPackMinor = '1.2'; }, (i) => { i.currency = ''; },
    (i) => { i.priceBasis = 'validated'; }, (i) => { i.variableCostsPerPack = []; },
  ]) { const input = fixture(); mutate(input); assert.throws(() => assessEconomics(input)); }
});
