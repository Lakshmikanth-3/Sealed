import { $, api, config, el } from '/common.js';

const lines = [];
const log = (t) => { lines.push('> ' + t); while (lines.length > 9) lines.shift(); $('feed').textContent = lines.join('\n'); };
let last;
async function tick() {
  try {
    const cfg = await config();
    $('sContract').textContent = cfg.contract || 'not configured';
    const r = await api('/api/chain');
    if (!r.ok) throw new Error(r.body.error || 'unavailable');
    const c = r.body.config;
    $('sSeals').textContent = c.seal_count;
    if (c.seal_count !== last) log(`${c.seal_count} files locked so far`);
    last = c.seal_count;
    $('feedState').textContent = 'online'; $('feedState').className = 'badge ok';
  } catch (e) { $('feedState').textContent = 'slow'; $('feedState').className = 'badge warn'; log('The public record is slow to answer. Retrying…'); }
}
tick(); setInterval(() => !document.hidden && tick(), 8000);

// Deployment links come only from the committed deployment record.
const { explorer: EXPLORER } = await config();
fetch('/docs-deployment.json').then((r) => (r.ok ? r.json() : null)).catch(() => null).then((d) => {
  if (!d) { $('deployLinks').replaceChildren(el('p', { class: 'muted', text: 'Details are not available right now.' })); return; }
  const items = [['The program', `${EXPLORER}/address/${d.contract}`, d.contract], ['When it was put online', `${EXPLORER}/txns/${d.deployTx}`, d.deployTx], ['Our service account', `${EXPLORER}/address/${d.operator}`, d.operator]];
  $('deployLinks').replaceChildren(...items.map(([k, href, v]) => el('a', { href, target: '_blank', rel: 'noopener' }, el('span', { class: 'stat-label', text: k }), el('code', { text: v }))));
});
