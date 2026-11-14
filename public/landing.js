import { $, api, config, el, EXPLORER } from '/common.js';

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
    $('sSeals').textContent = c.seal_count; $('sOwner').textContent = `owner ${c.owner} · operator ${c.operators[0] || '—'}`;
    if (c.seal_count !== last) log(`${cfg.contract} · ${c.seal_count} seal(s) on-chain`);
    last = c.seal_count;
    $('feedState').textContent = 'live'; $('feedState').className = 'badge ok';
  } catch (e) { $('feedState').textContent = 'degraded'; $('feedState').className = 'badge warn'; log('rpc: ' + e.message); }
}
log('read-only · no keys in this page');
log('early release → refused + logged');
tick(); setInterval(() => !document.hidden && tick(), 8000);

fetch('/docs-deployment.json').then((r) => r.ok ? r.json() : null).catch(() => null).then((d) => {
  const items = d ? [['Contract', `${EXPLORER}/address/${d.contract}`, d.contract], ['Deploy transaction', `${EXPLORER}/txns/${d.deployTx}`, d.deployTx], ['Operator account', `${EXPLORER}/address/${d.operator}`, d.operator]]
    : [['Contract', `${EXPLORER}/address/sealed.kanth_s.testnet`, 'sealed.kanth_s.testnet']];
  $('deployLinks').replaceChildren(...items.map(([k, href, v]) => el('a', { href, target: '_blank', rel: 'noopener' }, el('span', { class: 'stat-label', text: k }), el('code', { text: v }))));
});
