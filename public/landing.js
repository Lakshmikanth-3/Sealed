import { $, api, config, el } from '/common.js';
import { startHeroAnimation } from '/hero-anim.js';
import { startChatAnimation } from '/chat-anim.js';
import { startStory } from '/story.js';

const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const fmt = (n) => Number(n).toLocaleString('en-US');

// Hero: glyph animation of the sealed paper, with the current stage written under the headline.
startHeroAnimation($('heroCanvas'), { onStage: (s) => { $('stageLabel').textContent = s.label; } });
startHeroAnimation($('ctaCanvas'));
startChatAnimation($('chat'));
startStory(document.querySelector('.story'));

// Rotating word in the headline.
const words = ['the exam', 'the result', 'the reveal', 'the deadline', 'the launch', 'the right time'];
let wi = 0;
if (!reduce) setInterval(() => {
  const r = $('rotator'); r.classList.add('out');
  setTimeout(() => { wi = (wi + 1) % words.length; r.textContent = words[wi]; r.classList.remove('out'); }, 350);
}, 2600);

// "How it works" steps advance on their own, each with a progress bar.
const steps = [...$('howSteps').children];
let si = 0;
steps.forEach((li, i) => li.addEventListener('click', () => { si = i; showStep(); }));
function showStep() { steps.forEach((li, i) => li.classList.toggle('active', i === si)); }
if (!reduce) setInterval(() => { si = (si + 1) % steps.length; showStep(); }, 4000);

// Real leak events, shown one at a time.
const LEAKS = [
  { q: 'The exam for about 22.79 lakh students was cancelled after the paper leaked on WhatsApp and Telegram.', k: 'NEET-UG 2026, India', src: 'https://thesouthfirst.com/health/neet-ug-2026-cancelled-after-paper-leak-row-cbi-probe-ordered-re-test-date-awaited/' },
  { q: 'The exam was cancelled a day later after reports the paper was sold online. Investigators later said they found no proof of a leak.', k: 'UGC-NET 2024, India', src: 'https://www.deccanherald.com/amp/story/india%2Fcbi-files-closure-report-in-ugc-net-paper-leak-case-3380116' },
  { q: 'The report could be opened about 40 minutes early just by changing a web address. It was opened over 24,000 times.', k: 'UK Budget report, 2025', src: 'https://rossmartin.co.uk/sme-tax-news/8818-budget-leak-bigger-than-thought-says-nscs' },
  { q: 'A draft ruling leaked. Nearly 100 staff were questioned and the leaker was never found.', k: 'US Supreme Court, 2022', src: 'https://abajournal.com/web/article/who-leaked-dobbs-scotus-investigators-dont-know-despite-97-employee-interviews-and-forensic-sleuthing' },
];
let qi = 0;
const dots = LEAKS.map((_, i) => { const b = el('button', { class: 'q-dot', 'aria-label': `Event ${i + 1}` }); b.onclick = () => { qi = i; showQuote(); }; return b; });
$('qDots').replaceChildren(...dots);
function showQuote() {
  const l = LEAKS[qi];
  $('quote').textContent = `"${l.q}"`; $('quoteKey').textContent = l.k; $('quoteSrc').href = l.src;
  dots.forEach((d, i) => d.classList.toggle('on', i === qi));
}
showQuote();
if (!reduce) setInterval(() => { qi = (qi + 1) % LEAKS.length; showQuote(); }, 7000);

// Live clock.
const clock = () => { $('liveClock').textContent = new Date().toLocaleTimeString('en-US'); };
clock(); setInterval(clock, 1000);

// Count-up for the big numbers.
function countTo(node, value) {
  const from = Number(node.dataset.v || 0); node.dataset.v = value;
  if (reduce || from === value) { node.textContent = fmt(value); return; }
  const t0 = performance.now();
  const step = (t) => { const k = Math.min(1, (t - t0) / 1200); node.textContent = fmt(Math.round(from + (value - from) * (1 - (1 - k) ** 3))); if (k < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}

// Live values from the public record (contract count) and the activity log (each entry has a NEAR tx).
const lines = [];
const log = (t) => { lines.push('> ' + t); while (lines.length > 5) lines.shift(); $('feed').textContent = lines.join('\n'); };
const KIND = { create: 'File locked', fund: 'Trusted person set up', 'open:open': 'Opened on time', 'open:early': 'Early open refused', 'alert:early_open': 'Early attempt alert', 'alert:not_allowed': 'Unallowed account refused', 'alert:cancelled': 'File cancelled', 'alert:viewed_once': 'View-once message opened', 'release:released': 'Trusted person released a part' };
let last;
async function tick() {
  try {
    const cfg = await config();
    $('sContract').textContent = cfg.contract || 'not configured';
    const t0 = performance.now();
    const r = await api('/api/chain');
    const ms = Math.round(performance.now() - t0);
    if (!r.ok) throw new Error(r.body.error || 'unavailable');
    const n = r.body.config.seal_count;
    $('sSeals').textContent = fmt(n); $('sSeals2').textContent = fmt(n); countTo($('nSeals'), n);
    $('sLatency').textContent = `${ms}ms`;
    if (n !== last) log(`${n} files locked so far`);
    last = n;
    $('feedState').replaceChildren(el('span', { class: 'dot live' }), ' All operational');
    const a = await api('/api/activity');
    if (a.ok) {
      const act = a.body.activity || [];
      const blocked = act.filter((x) => x.kind === 'open:early' || x.kind === 'alert:not_allowed').length;
      const opened = act.filter((x) => x.kind === 'open:open').length;
      $('sTx').textContent = fmt(act.length); $('sBlocked').textContent = fmt(blocked);
      countTo($('nTx'), act.length); countTo($('nBlocked'), blocked); countTo($('nOpened'), opened);
      const latest = act[act.length - 1];
      if (latest) { $('sLastKind').textContent = KIND[latest.kind] || latest.kind; $('sLastAt').textContent = new Date(latest.at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }); }
    }
  } catch { $('feedState').textContent = 'Slow, retrying'; log('The public record is slow to answer. Retrying…'); }
}
tick(); setInterval(() => !document.hidden && tick(), 10000);

// Deployment links come only from the committed deployment record.
const { explorer: EXPLORER } = await config();
fetch('/docs-deployment.json').then((r) => (r.ok ? r.json() : null)).catch(() => null).then((d) => {
  if (!d) return;
  const items = [['The program', `${EXPLORER}/address/${d.contract}`, d.contract], ['Put online in', `${EXPLORER}/txns/${d.deployTx}`, d.deployTx.slice(0, 10) + '…'], ['Service account', `${EXPLORER}/address/${d.operator}`, d.operator]];
  $('deployLinks').replaceChildren(...items.map(([k, href, v]) => el('a', { href, target: '_blank', rel: 'noopener' }, el('span', { class: 'stat-label', text: k }), el('code', { text: v }))));
});
