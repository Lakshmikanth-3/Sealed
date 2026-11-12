import { verifyPack } from '/lib/verify.js';
import { lookupNearTx, explorerUrl } from '/lib/nearRpc.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const RPC = { testnet: 'https://rpc.testnet.near.org', mainnet: 'https://rpc.mainnet.near.org' };

// NEAR anchors are read straight from a public RPC node (not via our server).
// Mock anchors can only be read from the demo server's local ledger.
async function fetchAnchor(ref) {
  if (RPC[ref.network]) return lookupNearTx(RPC[ref.network], ref.txHash, ref.sender);
  const r = await fetch(`/api/anchor?tx=${encodeURIComponent(ref.txHash)}`);
  const j = await r.json();
  if (!r.ok) throw new Error(j.error);
  return j;
}

async function run(pack) {
  $('verdict').className = 'verdict'; $('verdict').textContent = 'Checking…';
  const rep = await verifyPack(pack, fetchAnchor);
  const mock = pack.days?.some((d) => d.anchor?.network === 'mock');
  $('verdict').className = 'verdict ' + (rep.ok ? 'ok' : 'bad');
  $('verdict').textContent = rep.ok ? `✓ Verified: ${pack.days.length} day(s) untouched since capture` : '✗ Not verified: this pack was changed or does not match its anchors';
  $('checks').innerHTML = rep.checks.map((c) => `<li>${c.ok ? '✅' : '❌'} ${esc(c.msg)}</li>`).join('') +
    (mock ? '<li>⚠️ Anchored on the local demo ledger, not on NEAR.</li>' : '');
  $('att').textContent = rep.attestation;
  $('narr').textContent = rep.recomputedSummary.narrative;
  $('who').textContent = `Worker ${pack.worker?.id}${pack.worker?.label ? ' · ' + pack.worker.label : ''} · pack created ${pack.createdAt}`;

  const all = Object.fromEntries(pack.days.flatMap((d) => d.entries.map((x) => [x.entry.id, x.entry])));
  $('daysOut').innerHTML = rep.days.map((d, i) => {
    const pd = pack.days[i];
    const link = explorerUrl(pd.anchor.network, pd.anchor.txHash);
    const at = d.anchor ? new Date(d.anchor.timestamp).toLocaleString() : '—';
    return `<div class="day-head" style="margin-top:12px"><strong>${esc(d.day)}</strong>
      <span class="badge ${d.ok ? 'ok' : 'bad'}">${d.ok ? 'matches anchor' : 'FAILED'}</span></div>
      <p class="muted">Anchored ${esc(at)} on ${esc(pd.anchor.network)} by ${esc(d.anchor?.signer || pd.anchor.sender)} ·
      ${link ? `<a href="${link}" target="_blank" rel="noopener">view transaction</a>` : `<code>${esc(pd.anchor.txHash.slice(0, 16))}…</code>`}
      · ${pd.entries.length}/${pd.count} entries disclosed</p>
      ${d.problems.length ? `<p class="badge bad">${esc(d.problems.join('; '))}</p>` : ''}
      <div class="scroll"><table><tr><th>Captured</th><th>Type</th><th>Amount / rating</th><th>Note</th><th></th></tr>` +
      d.entries.map((r) => {
        const e = all[r.id], img = e.imageHash && pack.attachments?.[e.imageHash];
        return `<tr><td>${esc(new Date(e.ts).toLocaleString())}</td><td>${esc(e.type)}</td>
          <td>${e.amount != null ? '₹' + esc(e.amount) : ''}${e.rating != null ? '★ ' + esc(e.rating) : ''}</td>
          <td>${esc(e.text || '')}${img ? `<br><a href="${img}" target="_blank"><img src="${img}" alt="screenshot" style="max-width:120px;border-radius:6px"></a>` : ''}</td>
          <td>${r.ok ? '✅' : '❌ ' + esc(r.problems.join(', '))}</td></tr>`;
      }).join('') + '</table></div>';
  }).join('');

  for (const id of ['checksCard', 'sumCard', 'daysCard', 'dlCard']) $(id).classList.remove('hidden');
  $('dl').onclick = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(pack, null, 2)], { type: 'application/json' }));
    a.download = 'evidence-pack.json'; a.click();
  };
}

$('file').onchange = async () => {
  const f = $('file').files[0];
  if (!f) return;
  try { await run(JSON.parse(await f.text())); } catch (e) { $('verdict').className = 'verdict bad'; $('verdict').textContent = 'Could not read pack: ' + e.message; }
};

const id = new URLSearchParams(location.search).get('id');
if (id) {
  fetch(`/api/pack/${encodeURIComponent(id)}`).then(async (r) => {
    if (!r.ok) throw new Error((await r.json()).error);
    return run(await r.json());
  }).catch((e) => { $('verdict').className = 'verdict bad'; $('verdict').textContent = e.message; });
}
