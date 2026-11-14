import { $, api, el, toast, download } from '/common.js';
import { parseExam, setVersions, renderVersion, answerKey, audit, investigate } from '/lib/exam.js';
import { sha256Hex } from '/assets/sealed.js';

const SAMPLE = `Q: A train travels 120 km in 2 hours. What is its average speed?
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
D) 45 square metres`;

let questions, versions, lastReport;
$('loadSample').onclick = () => { $('examText').value = SAMPLE; };

$('genVersions').onclick = () => {
  try {
    questions = parseExam($('examText').value);
    const centres = Number($('centres').value), title = $('examTitleIn').value.trim() || 'Exam';
    versions = setVersions(questions, centres, title);
    $('versions').replaceChildren(...versions.map((v) => {
      const text = renderVersion(v, title);
      return el('article', {}, el('b', { text: `Centre ${v.centre}` }), el('p', { class: 'muted', text: `Answer key: ${answerKey(v)}` }), el('pre', { text }),
        el('div', { class: 'share-row' },
          el('button', { type: 'button', class: 'secondary', onclick: () => download(`${title} - centre ${v.centre}.txt`, text, 'text/plain') }, 'Download'),
          el('button', { type: 'button', onclick: () => sealVersion(title, v, text) }, 'Seal this version')));
    }));
    const report = audit(questions, versions);
    $('auditCard').classList.remove('hidden'); $('investCard').classList.remove('hidden');
    $('auditVerdict').textContent = report.ok ? `Passed: all ${versions.length} versions ask the same ${questions.length} questions with the same options and answers; wording length within 10%.` : 'Failed: some versions differ. See below.';
    $('auditVerdict').className = report.ok ? 'verified' : 'resolve bad';
    $('auditRows').replaceChildren(...report.rows.map((r) => el('li', {}, el('p', {}, el('span', { class: 'accent', text: `CENTRE ${r.centre}` }), ` · ${r.ok ? 'equivalent' : r.problems.join('; ')} · wording length ${r.lengthDrift}% from the original`))));
  } catch (e) { toast(e.message, 6000); }
};

// Put the version into the Seal form so it can be time-locked like any other file.
function sealVersion(title, v, text) {
  const file = new File([text], `${title} - centre ${v.centre}.txt`, { type: 'text/plain' });
  const dt = new DataTransfer(); dt.items.add(file);
  $('file').files = dt.files; $('file').dispatchEvent(new Event('change'));
  $('label').value = `${title} · Centre ${v.centre}`;
  location.hash = 'seal';
  toast(`Centre ${v.centre} paper loaded into the Seal form`);
}

$('simLeak').onclick = () => {
  if (!versions) return toast('Generate versions first');
  const v = versions[Math.floor(Math.random() * versions.length)];
  const lines = renderVersion(v).split('\n').slice(1);
  // A leaker retypes part of the paper: lowercase, no brackets, the first 40-80% of it.
  $('leakText').value = lines.slice(0, Math.ceil(lines.length * (0.4 + Math.random() * 0.4))).join('\n').toLowerCase().replace(/[()]/g, '');
  toast('Simulated leak pasted. The source centre is hidden until you trace it.');
};

$('trace').onclick = async () => {
  if (!versions) return toast('Generate versions first');
  try {
    const r = investigate($('leakText').value, questions, versions);
    lastReport = { kind: 'leak_report', exam: $('examTitleIn').value, centres: versions.length, result: r, at: new Date().toISOString(), leakSha256: await sha256Hex(new TextEncoder().encode($('leakText').value)) };
    $('traceResult').className = 'result ' + (r.confidence >= 60 ? 'open' : 'waiting');
    $('traceResult').replaceChildren(el('p', { class: 'eyebrow', text: 'Investigator report' }), el('p', { class: 'trace-big', text: r.verdict }),
      el('p', { class: 'muted', text: `Based on ${r.evidence} fingerprint features found in the leak.` }),
      el('ol', { class: 'activity' }, ...r.ranking.map((x) => el('li', {}, el('p', {}, el('span', { class: 'accent', text: `CENTRE ${x.centre}` }), ` · ${x.score}% of features match`)))),
      el('div', { class: 'row' }, el('button', { type: 'button', class: 'secondary', onclick: () => download('leak-report.json', JSON.stringify(lastReport, null, 2), 'application/json') }, 'Download report')));
    const mine = (() => { try { return JSON.parse(localStorage.getItem('sealed-paper:mine') || '[]'); } catch { return []; } })();
    $('anchorBox').classList.toggle('hidden', !mine.length);
    $('anchorSeal').replaceChildren(...mine.map((s) => el('option', { value: s.sealId, text: s.label })));
    $('anchorStatus').textContent = '';
  } catch (e) { toast(e.message, 6000); }
};

$('anchorReport').onclick = async () => {
  const mine = JSON.parse(localStorage.getItem('sealed-paper:mine') || '[]');
  const seal = mine.find((s) => s.sealId === $('anchorSeal').value);
  if (!seal || !lastReport) return;
  $('anchorReport').disabled = true;
  try {
    const reportHash = await sha256Hex(new TextEncoder().encode(JSON.stringify(lastReport)));
    const r = await api(`/api/seals/${seal.sealId}/exam-report`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: seal.ownerToken, reportHash, kind: 'leak_report' }) });
    if (!r.ok) throw new Error(r.body.error);
    $('anchorStatus').replaceChildren('Report hash recorded on NEAR. ', el('a', { href: r.body.explorer, target: '_blank', rel: 'noopener' }, 'View transaction →'));
  } catch (e) { toast(e.message, 6000); }
  finally { $('anchorReport').disabled = false; }
};
