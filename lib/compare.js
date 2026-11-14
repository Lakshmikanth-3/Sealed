// Compares a worker's journal with a company statement (CSV export, payslip table,
// dashboard copy) and lists every difference. Pure functions: no I/O, no clocks.
export const MAX_STATEMENT_BYTES = 2 * 1024 * 1024;
export const MAX_STATEMENT_ROWS = 5000;
const TYPES = new Set(['trip', 'pay', 'rating', 'penalty', 'notification', 'deactivation']);
const ALIASES = {
  date: ['date', 'day', 'trip_date', 'order_date', 'payout_date'],
  type: ['type', 'kind', 'category', 'event'],
  amount: ['amount', 'earning', 'earnings', 'fare', 'pay', 'payout', 'total', 'inr', '₹'],
  rating: ['rating', 'score', 'stars'],
  ref: ['ref', 'id', 'order', 'order_id', 'trip_id', 'reference', 'booking_id'],
};
const TYPE_WORDS = { delivery: 'trip', order: 'trip', ride: 'trip', journey: 'trip', payment: 'pay', payout: 'pay',
  earning: 'pay', fine: 'penalty', deduction: 'penalty', charge: 'penalty', message: 'notification', blocked: 'deactivation', suspended: 'deactivation' };

export function parseCsv(text) {
  if (typeof text !== 'string') throw new Error('Statement must be text');
  if (text.length > MAX_STATEMENT_BYTES) throw new Error('Statement is larger than 2 MB');
  const rows = []; let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') quoted = false; else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',' || c === ';' || c === '\t') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((v) => v.trim())) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell); if (row.some((v) => v.trim())) rows.push(row);
  if (quoted) throw new Error('Statement has an unclosed quote');
  return rows;
}

const norm = (s) => s.replace(/^﻿/, '').trim().toLowerCase().replace(/[\s-]+/g, '_');
const money = (v) => {
  const n = Number(String(v).replace(/[₹$,\s]|rs\.?|inr/gi, ''));
  return String(v).trim() === '' || !Number.isFinite(n) ? undefined : Math.round(n * 100) / 100;
};
function toDay(v) {
  const s = String(v).trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s); // Indian format: DD/MM/YYYY
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return undefined;
}
function toType(v) {
  const s = String(v ?? '').trim().toLowerCase();
  if (TYPES.has(s)) return s;
  for (const [word, type] of Object.entries(TYPE_WORDS)) if (s.includes(word)) return type;
  return undefined;
}
/** Reference such as "#4471" or "order 4471" found in free text. */
export const refFromText = (text) => /(?:#|order\s*|trip\s*|id\s*)([A-Za-z0-9-]{3,40})/i.exec(text || '')?.[1]?.toLowerCase();

export function statementFromCsv(text) {
  const rows = parseCsv(text);
  if (rows.length < 2) throw new Error('Statement needs a header row and at least one record');
  if (rows.length - 1 > MAX_STATEMENT_ROWS) throw new Error(`Statement has more than ${MAX_STATEMENT_ROWS} rows`);
  const header = rows[0].map(norm), col = {};
  for (const [field, names] of Object.entries(ALIASES)) col[field] = header.findIndex((h) => names.includes(h));
  if (col.date < 0) throw new Error('Statement needs a date column');
  if (col.amount < 0 && col.rating < 0) throw new Error('Statement needs an amount or rating column');
  return rows.slice(1).map((r, i) => {
    const day = toDay(r[col.date] ?? '');
    if (!day) throw new Error(`Row ${i + 2}: unreadable date "${r[col.date] ?? ''}"`);
    const rec = { line: i + 2, day, type: (col.type >= 0 && toType(r[col.type])) || (col.amount >= 0 ? 'pay' : 'rating') };
    if (col.amount >= 0) rec.amount = money(r[col.amount] ?? '');
    if (col.rating >= 0) rec.rating = money(r[col.rating] ?? '');
    if (col.ref >= 0 && String(r[col.ref] ?? '').trim()) rec.ref = String(r[col.ref]).trim().replace(/^#/, '').toLowerCase();
    return rec;
  });
}

const near = (a, b) => a !== undefined && b !== undefined && Math.abs(a - b) < 0.005;
const label = (r) => `${r.type}${r.ref ? ' #' + r.ref : ''}${r.amount !== undefined ? ' ₹' + r.amount : ''}${r.rating !== undefined ? ' ★' + r.rating : ''}`;

/**
 * journal: [{ id, day, type, amount?, rating?, text? }]  statement: output of statementFromCsv.
 * Only days present in the statement are compared, so older journal days are not flagged.
 */
export function compareRecords(journal, statement) {
  const days = new Set(statement.map((s) => s.day));
  const mine = journal.filter((e) => days.has(e.day) && e.type !== 'notification')
    .map((e) => ({ ...e, ref: e.ref || refFromText(e.text) }));
  const theirs = statement.map((s) => ({ ...s })), issues = [], matched = [];
  const used = new Set();
  const pair = (m, t) => {
    used.add(t);
    const diffs = [];
    if (m.amount !== undefined && t.amount !== undefined && !near(m.amount, t.amount)) diffs.push(`amount ₹${m.amount} in your journal, ₹${t.amount} in company record`);
    if (m.rating !== undefined && t.rating !== undefined && !near(m.rating, t.rating)) diffs.push(`rating ★${m.rating} in your journal, ★${t.rating} in company record`);
    if (diffs.length) issues.push({ kind: 'value', day: m.day, entryId: m.id, line: t.line, ref: m.ref || t.ref,
      delta: (t.amount ?? 0) - (m.amount ?? 0), message: `${m.day} ${label(m)}: ${diffs.join('; ')}` });
    else matched.push({ entryId: m.id, line: t.line });
  };
  // 1. same reference, 2. same day+type+value, 3. same day+type (value differs)
  const passes = [
    (m, t) => m.ref && t.ref && m.ref === t.ref,
    (m, t) => m.day === t.day && m.type === t.type && (near(m.amount, t.amount) || (m.amount === undefined && near(m.rating, t.rating))),
    (m, t) => m.day === t.day && m.type === t.type && !(m.ref && t.ref),
  ];
  let left = mine;
  for (const fits of passes) {
    const next = [];
    for (const m of left) {
      const t = theirs.find((c) => !used.has(c) && fits(m, c));
      if (t) pair(m, t); else next.push(m);
    }
    left = next;
  }
  for (const m of left) issues.push({ kind: 'missing', day: m.day, entryId: m.id, ref: m.ref, delta: -(m.amount ?? 0),
    message: `${m.day} ${label(m)}: in your journal but missing from company record` });
  for (const t of theirs) if (!used.has(t)) issues.push({ kind: 'extra', day: t.day, line: t.line, ref: t.ref, delta: t.amount ?? 0,
    message: `${t.day} ${label(t)}: in company record (line ${t.line}) but not in your journal` });
  // Net pay for the day: trips and payouts add, penalties subtract; ratings and notices carry no money.
  const sign = { trip: 1, pay: 1, penalty: -1 };
  const sum = (list, d) => Math.round(list.filter((r) => r.day === d && sign[r.type]).reduce((a, r) => a + sign[r.type] * (r.amount ?? 0), 0) * 100) / 100;
  const totals = [...days].sort().map((d) => ({ day: d, journal: sum(mine, d), company: sum(theirs, d) }))
    .map((t) => ({ ...t, difference: Math.round((t.company - t.journal) * 100) / 100 }));
  issues.sort((a, b) => a.day.localeCompare(b.day) || a.kind.localeCompare(b.kind));
  return { matched, issues, totals, ok: issues.length === 0 };
}

/** Text for the journal record that commits the check result. Bounded to the schema's 1000 characters. */
export function mismatchSummary(report, fileHash, fileName) {
  const head = `Company record check (${String(fileName).slice(0, 60)}, sha256 ${fileHash}): ${report.matched.length} matched, ${report.issues.length} mismatch${report.issues.length === 1 ? '' : 'es'}.`;
  let text = head;
  for (const i of report.issues) {
    const line = ' • ' + i.message;
    if (text.length + line.length > 990) { text += ' …'; break; }
    text += line;
  }
  return text;
}
