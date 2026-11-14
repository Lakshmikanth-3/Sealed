import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, statementFromCsv, compareRecords, mismatchSummary, refFromText } from '../lib/compare.js';

const journal = [
  { id: 'a', day: '2026-11-10', type: 'trip', amount: 42, text: 'Delivery #4471 lunch' },
  { id: 'b', day: '2026-11-10', type: 'trip', amount: 55, text: 'order 4472' },
  { id: 'c', day: '2026-11-10', type: 'trip', amount: 38 },
  { id: 'd', day: '2026-11-10', type: 'rating', rating: 4.8 },
  { id: 'old', day: '2026-11-01', type: 'trip', amount: 99 },
];

test('parses quoted CSV, semicolons and BOM', () => {
  assert.deepEqual(parseCsv('﻿a,b\r\n"x, y","say ""hi"""\n'), [['﻿a', 'b'], ['x, y', 'say "hi"']]);
  assert.deepEqual(parseCsv('a;b\n1;2'), [['a', 'b'], ['1', '2']]);
  assert.throws(() => parseCsv('a\n"open'), /unclosed/);
});

test('reads Indian dates, rupee amounts and header aliases', () => {
  const s = statementFromCsv('Order ID,Trip Date,Category,Earnings\n#4471,10/11/2026,Delivery,"₹1,042.50"\n');
  assert.deepEqual(s, [{ line: 2, day: '2026-11-10', type: 'trip', amount: 1042.5, ref: '4471' }]);
  assert.throws(() => statementFromCsv('foo,bar\n1,2'), /date column/);
  assert.throws(() => statementFromCsv('date,amount\nyesterday,4'), /Row 2: unreadable date/);
  assert.throws(() => statementFromCsv('date,amount'), /at least one record/);
});

test('fully matching statement reports no issues', () => {
  const csv = 'date,type,amount,rating,ref\n2026-11-10,trip,42,,4471\n2026-11-10,trip,55,,4472\n2026-11-10,trip,38,,\n2026-11-10,rating,,4.8,\n';
  const r = compareRecords(journal, statementFromCsv(csv));
  assert.equal(r.ok, true); assert.equal(r.matched.length, 4);
  assert.deepEqual(r.totals, [{ day: '2026-11-10', journal: 135, company: 135, difference: 0 }]);
});

test('detects underpayment, missing trip, extra charge and changed rating', () => {
  const csv = 'date,type,amount,rating,ref\n2026-11-10,trip,30,,4471\n2026-11-10,trip,38,,\n2026-11-10,penalty,20,,\n2026-11-10,rating,,4.2,\n';
  const r = compareRecords(journal, statementFromCsv(csv));
  assert.equal(r.ok, false);
  const kinds = r.issues.map((i) => `${i.kind}:${i.entryId ?? 'line' + i.line}`).sort();
  assert.deepEqual(kinds, ['extra:line4', 'missing:b', 'value:a', 'value:d']);
  assert.match(r.issues.find((i) => i.entryId === 'a').message, /₹42 in your journal, ₹30 in company/);
  assert.match(r.issues.find((i) => i.entryId === 'd').message, /★4.8 in your journal, ★4.2/);
  assert.equal(r.totals[0].company, 30 + 38 - 20, 'penalties reduce net pay');
  assert.equal(r.totals[0].difference, (30 + 38 - 20) - 135);
  assert.ok(!r.issues.some((i) => i.entryId === 'old'), 'days absent from the statement are not compared');
});

test('reference match wins over amount coincidence', () => {
  const csv = 'date,type,amount,ref\n2026-11-10,trip,55,4471\n2026-11-10,trip,42,4472\n';
  const r = compareRecords(journal.slice(0, 2), statementFromCsv(csv));
  assert.equal(r.issues.filter((i) => i.kind === 'value').length, 2);
});

test('summary fits the journal text limit and names the file fingerprint', () => {
  const csv = 'date,amount\n' + Array.from({ length: 200 }, (_, i) => `2026-11-10,${i + 1}`).join('\n');
  const text = mismatchSummary(compareRecords([], statementFromCsv(csv)), 'ab'.repeat(32), 'payout.csv');
  assert.ok(text.length <= 1000); assert.match(text, /sha256 abab/); assert.match(text, /200 mismatches/);
  assert.equal(refFromText('Delivery #A-77 done'), 'a-77'); assert.equal(refFromText('no ref'), undefined);
});
