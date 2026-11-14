// Exam mode: fingerprinted versions per centre and leak tracing. Rule-based and
// deterministic (no AI): the same exam and centre always produce the same version.
//   Setter       one version per centre: question order, option order and wording differ;
//                the questions, options and correct answers are unchanged.
//   Auditor      checks every version has the same questions, options, answers and similar length.
//   Investigator matches a leaked (possibly partial or retyped) copy to the centre it came from.

// Meaning-preserving wording pairs. Each centre picks one side per pair it can apply.
const WORDING = [
  ['What is', 'Find'], ['Which of the following', 'Which one of these'], ['calculate', 'compute'],
  ['Calculate', 'Compute'], ['approximately', 'roughly'], ['correct', 'right'], ['determine', 'find out'],
  ['Determine', 'Find out'], ['shown', 'given'], ['travels', 'covers'], ['total', 'overall'], ['value of', 'value for'],
];

/** Parse "Q: …" blocks with options "A) …"; mark the correct option with a trailing "*". */
export function parseExam(text) {
  const blocks = String(text).replace(/\r/g, '').split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  if (!blocks.length) throw new Error('Please type at least one question');
  if (blocks.length > 200) throw new Error('At most 200 questions');
  return blocks.map((block, qi) => {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
    const stem = lines[0].replace(/^(Q\d*[:.)]|\d+[.)])\s*/i, '');
    const options = lines.slice(1).map((l) => /^[A-Ha-h][).:]\s*(.+)$/.exec(l)?.[1]).filter(Boolean);
    if (!stem) throw new Error(`Question ${qi + 1} has no text`);
    if (options.length < 2) throw new Error(`Question ${qi + 1} needs at least two options like "A) …"`);
    const correct = options.findIndex((o) => /\*\s*$/.test(o));
    if (correct < 0) throw new Error(`Question ${qi + 1}: mark the correct option with *`);
    if (options.filter((o) => /\*\s*$/.test(o)).length > 1) throw new Error(`Question ${qi + 1}: mark only one correct option`);
    return { id: qi + 1, stem, options: options.map((o) => o.replace(/\s*\*\s*$/, '')), correct };
  });
}

function rng(seedText) { // xmur3 + mulberry32: small, deterministic, good enough for shuffling
  let h = 1779033703 ^ seedText.length;
  for (let i = 0; i < seedText.length; i++) { h = Math.imul(h ^ seedText.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  let a = h >>> 0;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function shuffle(list, rand) { const a = list.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function reword(stem, rand) {
  let text = stem; const choices = [];
  for (const [a, b] of WORDING) {
    const from = new RegExp(`\\b${escapeRe(a)}\\b`), to = new RegExp(`\\b${escapeRe(b)}\\b`);
    if (from.test(text) && rand() < 0.5) { text = text.replace(from, b); choices.push(b); }
    else if (to.test(stem) && rand() < 0.5) { text = text.replace(to, a); choices.push(a); }
  }
  return { text, choices };
}

/** Setter: one fingerprinted version per centre. Retries until every version is distinct. */
export function setVersions(questions, centres, examId = 'exam') {
  if (!Number.isInteger(centres) || centres < 2 || centres > 50) throw new Error('Choose 2 to 50 centres');
  const versions = [], seen = new Set();
  for (let c = 1; c <= centres; c++) {
    for (let attempt = 0; attempt < 50; attempt++) {
      const rand = rng(`${examId}|${c}|${attempt}`);
      const order = questions.length > 1 ? shuffle(questions.map((q) => q.id), rand) : [questions[0].id];
      const items = order.map((id) => {
        const q = questions.find((x) => x.id === id);
        const optOrder = shuffle(q.options.map((_, i) => i), rand);
        const { text, choices } = reword(q.stem, rand);
        return { id, stem: text, options: optOrder.map((i) => q.options[i]), correct: optOrder.indexOf(q.correct), optOrder, wording: choices };
      });
      const key = JSON.stringify(items.map((i) => [i.id, i.optOrder, i.stem]));
      if (!seen.has(key)) { seen.add(key); versions.push({ centre: c, items }); break; }
      if (attempt === 49) throw new Error('Not enough variation to give every centre a distinct version; add questions or options');
    }
  }
  return versions;
}

export function renderVersion(version, title = 'Exam') {
  const letters = 'ABCDEFGH';
  return [`${title} · Centre ${version.centre}`, '', ...version.items.flatMap((it, n) => [
    `${n + 1}. ${it.stem}`, ...it.options.map((o, i) => `   ${letters[i]}) ${o}`), '']), ''].join('\n');
}
export const answerKey = (version) => version.items.map((it, n) => `${n + 1}${'ABCDEFGH'[it.correct]}`).join(' ');

/** Auditor: every version must ask the same questions with the same options and answers. */
export function audit(questions, versions) {
  const words = (s) => s.split(/\s+/).length;
  const base = questions.reduce((n, q) => n + words(q.stem), 0);
  const rows = versions.map((v) => {
    const problems = [];
    if (v.items.length !== questions.length) problems.push('question count differs');
    for (const it of v.items) {
      const q = questions.find((x) => x.id === it.id);
      if (!q) { problems.push(`unknown question ${it.id}`); continue; }
      if ([...it.options].sort().join('|') !== [...q.options].sort().join('|')) problems.push(`Q${q.id} options differ`);
      if (it.options[it.correct] !== q.options[q.correct]) problems.push(`Q${q.id} answer differs`);
    }
    const len = v.items.reduce((n, it) => n + words(it.stem), 0);
    const drift = base ? Math.abs(len - base) / base : 0;
    if (drift > 0.1) problems.push(`wording length differs by ${Math.round(drift * 100)}%`);
    return { centre: v.centre, ok: problems.length === 0, lengthDrift: Math.round(drift * 1000) / 10, problems };
  });
  return { ok: rows.every((r) => r.ok), rows };
}

const norm = (s) => s.toLowerCase().replace(/[^a-z0-9.%/+-]+/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * Investigator: score each centre by how well the leak matches its question order,
 * option order and wording. Works on partial and retyped leaks.
 */
export function investigate(leakText, questions, versions) {
  const leak = norm(leakText);
  if (leak.length < 20) throw new Error('Please paste more of the leaked text');
  // Position of every option and question stem in the leak (by distinctive text).
  const posOf = (s) => { const k = norm(s); return k.length >= 2 ? leak.indexOf(k) : -1; };
  const scores = versions.map((v) => {
    let hits = 0, total = 0;
    // Question order: pairs of consecutive questions that appear in the same order.
    const qPos = v.items.map((it) => ({ id: it.id, p: posOf(questions.find((q) => q.id === it.id).stem.split(/\s+/).slice(-6).join(' ')) })).filter((x) => x.p >= 0);
    for (let i = 1; i < qPos.length; i++) { total++; if (qPos[i].p > qPos[i - 1].p) hits++; }
    // Option order within each question found in the leak.
    for (const it of v.items) {
      const ps = it.options.map((o) => posOf(o));
      const found = ps.filter((p) => p >= 0);
      if (found.length < 2) continue;
      for (let i = 1; i < ps.length; i++) if (ps[i] >= 0 && ps[i - 1] >= 0) { total++; if (ps[i] > ps[i - 1]) hits++; }
      // Wording choices this centre made, and the alternatives it did not.
      for (const w of it.wording) { total++; if (leak.includes(norm(w))) hits++; }
    }
    return { centre: v.centre, hits, total, score: total ? hits / total : 0 };
  }).sort((a, b) => b.score - a.score || b.hits - a.hits);
  const [best, second] = scores;
  const evidence = best?.total || 0;
  // Confidence: how clearly the best centre beats the runner-up, scaled by how much evidence there was.
  const margin = best && second ? best.score - second.score : best?.score || 0;
  const confidence = evidence < 3 ? 0 : Math.round(Math.min(0.99, best.score * (0.5 + margin) * Math.min(1, evidence / 12)) * 100);
  return { centre: best?.centre ?? null, confidence, evidence, ranking: scores.slice(0, 5).map((s) => ({ centre: s.centre, score: Math.round(s.score * 100) })),
    verdict: evidence < 3 ? 'Not enough text to find the centre. Paste more of the leak.' : confidence >= 60 ? `Centre ${best.centre}, ${confidence}% confidence` : `Maybe Centre ${best.centre}, but not sure (${confidence}%)` };
}
