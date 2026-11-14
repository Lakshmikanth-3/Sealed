import { $, api, el, toast, download } from '/common.js';
import { parseExam, setVersions, renderVersion, answerKey, audit, investigate } from '/lib/exam.js';
import { sha256Hex } from '/assets/sealed.js';

let questions, versions, lastReport;

$('genVersions').onclick = () => {
  try {
    questions = parseExam($('examText').value);
    const centres = Number($('centres').value), title = $('examTitleIn').value.trim();
    if (!title) throw new Error('Please type the exam name');
    versions = setVersions(questions, centres, title);
    $('versions').replaceChildren(...versions.map((v) => {
      const text = renderVersion(v, title);
      return el('article', {}, el('b', { text: `Centre ${v.centre}` }), el('p', { class: 'muted', text: `Answer key: ${answerKey(v)}` }), el('pre', { text }),
        el('div', { class: 'share-row' },
          el('button', { type: 'button', class: 'secondary', onclick: () => download(`${title} - centre ${v.centre}.txt`, text, 'text/plain') }, 'Download'),
          el('button', { type: 'button', onclick: () => sealVersion(title, v, text) }, 'Lock this paper')));
    }));
    const report = audit(questions, versions);
    $('auditCard').classList.remove('hidden'); $('investCard').classList.remove('hidden');
    $('auditVerdict').textContent = report.ok ? `Passed: all ${versions.length} papers have the same ${questions.length} questions, choices and right answers. Only the order and wording change.` : 'Not fair: some papers are different. See below.';
    $('auditVerdict').className = report.ok ? 'verified' : 'resolve bad';
    $('auditRows').replaceChildren(...report.rows.map((r) => el('li', {}, el('p', {}, el('span', { class: 'accent', text: `Centre ${r.centre}` }), ` · ${r.ok ? 'fair' : r.problems.join('; ')}`))));
  } catch (e) { toast(e.message, 6000); }
};

// Put the version into the Seal form so it can be time-locked like any other file.
function sealVersion(title, v, text) {
  const file = new File([text], `${title} - centre ${v.centre}.txt`, { type: 'text/plain' });
  const dt = new DataTransfer(); dt.items.add(file);
  $('file').files = dt.files; $('file').dispatchEvent(new Event('change'));
  $('label').value = `${title} · Centre ${v.centre}`;
  location.hash = 'seal';
  toast(`Centre ${v.centre} paper is ready to lock. Pick a time and tap Lock my file.`);
}

$('trace').onclick = async () => {
  if (!versions) return toast('First make the papers (step 1)');
  try {
    const r = investigate($('leakText').value, questions, versions);
    lastReport = { kind: 'leak_report', exam: $('examTitleIn').value, centres: versions.length, result: r, at: new Date().toISOString(), leakSha256: await sha256Hex(new TextEncoder().encode($('leakText').value)) };
    $('traceResult').className = 'result ' + (r.confidence >= 60 ? 'open' : 'waiting');
    const enough = r.evidence >= 3;
    $('traceResult').replaceChildren(el('p', { class: 'eyebrow', text: 'Result' }), el('p', { class: 'trace-big', text: r.verdict }),
      el('p', { class: 'muted', text: enough ? `Based on ${r.evidence} clue${r.evidence === 1 ? '' : 's'} found in the leaked text.` : `Only ${r.evidence} clue${r.evidence === 1 ? '' : 's'} found. At least 3 are needed for a reliable answer.` }),
      ...(enough ? [el('ol', { class: 'activity' }, ...r.ranking.map((x) => el('li', {}, el('p', {}, el('span', { class: 'accent', text: `Centre ${x.centre}` }), ` · ${x.score}% match`))))] : []),
      el('div', { class: 'row' }, el('button', { type: 'button', class: 'secondary', onclick: () => download('leak-report.json', JSON.stringify(lastReport, null, 2), 'application/json') }, 'Download this result')));
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
    $('anchorStatus').replaceChildren('Saved in the public record. ', el('a', { href: r.body.explorer, target: '_blank', rel: 'noopener' }, 'See it →'));
  } catch (e) { toast(e.message, 6000); }
  finally { $('anchorReport').disabled = false; }
};
