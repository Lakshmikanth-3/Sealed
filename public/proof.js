import { $, api, el, istText, short, plainLog } from '/common.js';

const WHAT = { fund: 'A trusted person got a free account to say yes with', 'release:released': 'A trusted person said yes' };
const describe = (e) => (e.kind === 'create' ? (e.mode === 'split' ? `A file was locked (${e.k} of ${e.n} people must agree)` : 'A file was locked (opens by time)') : WHAT[e.kind] || plainLog(e.kind));

async function load() {
  const [a, c] = await Promise.all([api('/api/activity'), api('/api/chain')]);
  if (!a.ok) { $('rows').replaceChildren(el('tr', {}, el('td', { colspan: 4, class: 'muted', text: 'Could not load the list right now.' }))); return; }
  const { explorer, deployment, activity } = a.body;
  if (c.ok) $('pSeals').textContent = c.body.config.seal_count;
  $('pCount').textContent = activity.length;
  $('pBlocked').textContent = activity.filter((e) => /early|not_holder|not_allowed/.test(e.kind)).length;
  const link = (path, text) => el('a', { href: `${explorer}/${path}`, target: '_blank', rel: 'noopener' }, text);
  if (deployment) {
    const items = [['Program (smart contract)', `address/${deployment.contract}`, deployment.contract], ['Put online (deploy transaction)', `txns/${deployment.deployTx}`, deployment.deployTx],
      ...(deployment.upgrades || []).map((u) => ['Updated (upgrade transaction)', `txns/${u.tx}`, u.tx]), ['Service account', `address/${deployment.operator}`, deployment.operator]];
    $('deploy').replaceChildren(...items.map(([k, p, v]) => el('a', { href: `${explorer}/${p}`, target: '_blank', rel: 'noopener' }, el('span', { class: 'stat-label', text: k }), el('code', { text: v }))));
  }
  $('rows').replaceChildren(...(activity.length ? activity.map((e) => el('tr', {},
    el('td', { text: istText(Date.parse(e.at)) }), el('td', { text: describe(e) }),
    el('td', {}, el('a', { href: `/verify?id=${e.sealId}` }, short(e.sealId, 5))),
    el('td', {}, link(`txns/${e.tx}`, short(e.tx, 8) + ' ↗')))) : [el('tr', {}, el('td', { colspan: 4, class: 'muted', text: 'No transactions yet.' }))]));
}
load(); setInterval(() => !document.hidden && load(), 15000);
