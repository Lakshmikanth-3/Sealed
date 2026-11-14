import { $, api, config, el, toast, utcText, istText, countdown, short, EXPLORER } from '/common.js';
import { releasePart, sha256Hex, fromB64url } from '/assets/sealed.js';

const sealId = location.pathname.split('/').pop();
let secret, seal, skew = 0, busy = false;
$('openLink').href = `/s/${sealId}`;
try {
  secret = JSON.parse(new TextDecoder().decode(fromB64url(location.hash.slice(1))));
  if (!/^[0-9a-f]{64}$/.test(secret.a) || !secret.s?.startsWith('ed25519:') || !secret.w?.startsWith('w.')) throw new Error();
} catch { secret = null; }

async function load() {
  if (!secret) { $('title').textContent = 'This holder link is incomplete'; $('releaseBtn').disabled = true; $('state').textContent = 'Invalid'; return; }
  const r = await api(`/api/seals/${sealId}`);
  if (!r.ok) { $('title').textContent = 'Seal not found'; $('releaseBtn').disabled = true; return; }
  seal = r.body; skew = seal.now - Date.now();
  $('title').textContent = seal.label; $('who').textContent = `${secret.l || 'Key holder'} · ${seal.k} of ${seal.n} needed`;
  $('until').textContent = `Release opens at ${istText(seal.unlockAtMs)} · ${utcText(seal.unlockAtMs)}`;
  $('account').textContent = `Your testnet account: ${short(secret.a, 10)}`;
  render();
}
function render() {
  const released = seal.chain?.releasedAccounts || [];
  $('progress').replaceChildren(...Array.from({ length: seal.n }, (_, i) => el('span', { class: 'pip' + (i < released.length ? ' on' : '') })), el('small', { text: ` ${released.length} of ${seal.k} released` }));
  if (released.includes(secret.a)) { $('releaseBtn').disabled = true; $('releaseBtn').textContent = 'Part released'; }
}
setInterval(() => {
  if (!seal) return;
  const left = seal.unlockAtMs - (Date.now() + skew);
  $('count').textContent = countdown(left);
  $('state').textContent = left > 0 ? 'Locked' : 'Release open'; $('state').className = 'badge ' + (left > 0 ? 'warn' : 'ok');
}, 250);
setInterval(async () => { if (!seal || document.hidden) return; const r = await api(`/api/seals/${sealId}`); if (r.ok) { seal = r.body; render(); } }, 6000);

function show(kind, ...children) { $('result').className = 'result ' + kind; $('result').replaceChildren(...children); }
$('releaseBtn').onclick = async () => {
  if (busy || !secret) return; busy = true; $('releaseBtn').disabled = true;
  try {
    const cfg = await config();
    $('status').textContent = 'Signing release_part on NEAR testnet…';
    const commitment = await sha256Hex(new TextEncoder().encode(secret.w));
    const { status, txHash } = await releasePart({ rpcUrls: [cfg.rpc, 'https://rpc.testnet.near.org'], contract: cfg.contract, sealId, account: secret.a, secretKey: secret.s, commitment });
    const tx = el('a', { href: `${EXPLORER}/txns/${txHash}`, target: '_blank', rel: 'noopener' }, 'Transaction on NEAR →');
    if (status === 'early' || status === 'not_holder') {
      await api(`/api/seals/${sealId}/alerts`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: status === 'early' ? 'early_release' : 'not_holder', account: secret.a, detail: `release_part returned ${status} in ${txHash}` }) });
      show('locked', el('h2', { text: status === 'early' ? 'Refused: too early' : 'Refused: not a holder' }),
        el('p', { text: status === 'early' ? `The contract refused your release because ${istText(seal.unlockAtMs)} has not arrived. The attempt is logged on NEAR and the owner was alerted.` : 'This account is not a holder of this seal.' }), tx);
      $('status').textContent = ''; $('releaseBtn').disabled = status !== 'early'; return;
    }
    if (status !== 'released' && status !== 'already_released') { show('tampered', el('h2', { text: `Refused: ${status.replace(/_/g, ' ')}` }), tx); $('status').textContent = ''; return; }
    $('status').textContent = 'Recorded on NEAR. Handing your wrapped part to the release service…';
    let posted;
    for (let i = 0; i < 6; i++) { // final state can lag the optimistic receipt by a block or two
      posted = await api(`/api/seals/${sealId}/parts`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ account: secret.a, part: secret.w }) });
      if (posted.status !== 409) break;
      await new Promise((r) => setTimeout(r, 1500));
    }
    if (!posted.ok) throw new Error(posted.body.error || 'Could not hand over the part');
    show('open', el('h2', { text: 'Your part is released' }), el('p', { text: `${posted.body.released} of ${posted.body.k} needed parts are in. The file opens for viewers once ${posted.body.k} are released.` }), tx);
    $('status').textContent = ''; $('releaseBtn').textContent = 'Part released';
    const r = await api(`/api/seals/${sealId}`); if (r.ok) { seal = r.body; render(); }
  } catch (e) { $('status').textContent = ''; toast(e.message, 6000); $('releaseBtn').disabled = false; }
  finally { busy = false; }
};
await load();
