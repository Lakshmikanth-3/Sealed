import test from 'node:test';
import assert from 'node:assert/strict';
import { parseExam, setVersions, renderVersion, answerKey, audit, investigate } from '../lib/exam.js';

export const PAPER = `Q: A train travels 120 km in 2 hours. What is its average speed?
A) 60 km/h *
B) 40 km/h
C) 80 km/h
D) 240 km/h

Q: Which of the following is a prime number?
A) 21
B) 27
C) 29 *
D) 33

Q: Calculate the total cost of 3 pens at Rs 15 each.
A) Rs 30
B) Rs 45 *
C) Rs 50
D) Rs 18

Q: What is the value of 7 squared?
A) 14
B) 42
C) 49 *
D) 77

Q: Which of the following gases do plants absorb for photosynthesis?
A) Oxygen
B) Nitrogen
C) Carbon dioxide *
D) Hydrogen

Q: Determine the area of a rectangle 8 m long and 5 m wide.
A) 13 square metres
B) 26 square metres
C) 40 square metres *
D) 45 square metres

Q: What is approximately the value of pi?
A) 2.14
B) 3.14 *
C) 4.13
D) 1.41

Q: Which of the following is the capital of India?
A) Mumbai
B) Kolkata
C) New Delhi *
D) Chennai`;

test('parses questions, options and the marked answer', () => {
  const q = parseExam(PAPER);
  assert.equal(q.length, 8); assert.equal(q[1].options[q[1].correct], '29'); assert.equal(q[0].stem, 'A train travels 120 km in 2 hours. What is its average speed?');
  assert.throws(() => parseExam('Q: x\nA) a\nB) b'), /mark the correct option/);
  assert.throws(() => parseExam('Q: x\nA) a *'), /at least two options/);
});

test('setter gives every centre a distinct version; auditor finds them equivalent', () => {
  const q = parseExam(PAPER), v = setVersions(q, 10, 'exam-1');
  assert.equal(v.length, 10);
  assert.equal(new Set(v.map((x) => renderVersion(x))).size, 10, 'all versions differ');
  assert.deepEqual(setVersions(q, 10, 'exam-1'), v, 'deterministic');
  const report = audit(q, v); assert.ok(report.ok, JSON.stringify(report.rows.filter((r) => !r.ok)));
  assert.match(answerKey(v[0]), /^1[A-D] 2[A-D]/);
  const broken = structuredClone(v); broken[0].items[0].correct = (broken[0].items[0].correct + 1) % 4;
  assert.equal(audit(q, broken).ok, false, 'auditor catches a changed answer');
});

test('investigator traces a retyped, partial leak to its centre', () => {
  const q = parseExam(PAPER), v = setVersions(q, 5, 'exam-2');
  const leaked = renderVersion(v[2]).toUpperCase().replace(/\)/g, '.').split('\n').slice(0, 26).join(' ');
  const r = investigate(leaked, q, v);
  assert.equal(r.centre, 3); assert.ok(r.confidence >= 60, r.verdict); assert.match(r.verdict, /^Centre 3, \d+% confidence$/);
  assert.throws(() => investigate('too short', q, v), /more of the leaked text/);
});

test('accuracy over 20 leaked copies: at least 18 traced correctly', () => {
  const q = parseExam(PAPER), v = setVersions(q, 8, 'exam-3');
  let correct = 0;
  for (let i = 0; i < 20; i++) {
    const c = (i * 5) % 8; // spread over centres
    const lines = renderVersion(v[c]).split('\n');
    const keep = lines.slice(0, Math.ceil(lines.length * (0.5 + (i % 5) / 10))); // 50% to 90% of the paper
    const retyped = keep.join('\n').toLowerCase().replace(/[()]/g, '').replace(/ km\/h/g, 'kmph');
    if (investigate(retyped, q, v).centre === c + 1) correct++;
  }
  assert.ok(correct >= 18, `${correct} of 20 traced`);
});
