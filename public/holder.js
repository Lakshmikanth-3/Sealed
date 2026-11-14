import { $, api, config, el, toast, utcText, istText, countdown, short, explorer } from '/common.js';
import { releasePart, sha256Hex, fromB64url } from '/assets/sealed.js';

const sealId = location.pathname.split('/').pop();
const EXPLORER = await explorer();
let secret, seal, skew = 0, busy = false;
// Each person's part is in the link after "#". Pasting another person's link into this tab
// changes only that part, which does not reload the page, so reload to show the new person.
addEventListener('hashchange', () => location.reload());
$('openLink').href = `/s/${sealId}`;
try {
  secret = JSON.parse(new TextDecoder().decode(fromB64url(location.hash.slice(1))));
  const named = /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/;
  if (!named.test(secret.a || '') || !secret.w?.startsWith('w.') || (secret.s && !secret.s.startsWith('ed25519:'))) throw new Error();
  if (!secret.s && !secret.o) throw new Error();
} catch { secret = null; }

async function load() {
  if (!secret) { $('title').textContent = 'This link is not complete. Ask the owner to send it again.'; $('releaseBtn').disabled = true; $('state').textContent = 'Broken link'; return; }
  const r = await api(`/api/seals/${sealId}`);
  if (!r.ok) { $('title').textContent = 'We could not find this file.'; $('releaseBtn').disabled = true; return; }
  seal = r.body; skew = seal.now - Date.now();
  if (seal.cancelled) {
    $('title').textContent = seal.label; $('count').textContent = 'CANCELLED';
    $('result').className = 'result tampered';
    $('result').replaceChildren(el('h2', { text: 'Cancelled by the owner' }), el('p', { text: 'This file can no longer be opened. Its key was destroyed. Ask the sender for the new link.' }));
    for (const id of ['openBtn', 'releaseBtn']) if ($(id)) $(id).disabled = true;
    return;
  }
  $('title').textContent = seal.label; $('who').textContent = `${secret.l ? secret.l + ', you' : 'You'} are 1 of ${seal.n} trusted people · ${seal.k} must say yes`;
  $('until').textContent = seal.unlockBy === 'merge' ? `No time limit. It opens when ${seal.k} of ${seal.n} parts are merged.` : `You can say yes from ${istText(seal.unlockAtMs)}`;
  if (seal.unlockBy === 'merge') $('who').textContent = `${secret.l ? secret.l + ', you' : 'You'} hold part of the key · ${seal.k} of ${seal.n} parts must be merged`;
  $('account').textContent = secret.s ? '' : `Your NEAR account: ${secret.a}`;
  if (!secret.s) { $('walletBox').classList.remove('hidden'); $('ownAccount').textContent = secret.a; void refreshWallet(); }
  if (!seal.chain?.releasedAccounts?.includes(secret.a)) { $('releaseBtn').textContent = seal.unlockBy === 'merge' ? 'Merge my part' : 'Say yes'; $('releaseBtn').disabled = false; }
  render();
}
function render() {
  const released = seal.chain?.releasedAccounts || [];
  $('progress').replaceChildren(...Array.from({ length: seal.n }, (_, i) => el('span', { class: 'pip' + (i < released.length ? ' on' : '') })), el('small', { text: seal.unlockBy === 'merge' ? ` ${released.length} of ${seal.k} parts merged` : ` ${released.length} of ${seal.k} have said yes` }));
  if (released.includes(secret.a)) { $('releaseBtn').disabled = true; $('releaseBtn').textContent = seal.unlockBy === 'merge' ? 'Your part is merged ✓' : 'You said yes ✓'; }
}
setInterval(() => {
  if (!seal || seal.cancelled) return;
  const left = seal.unlockAtMs - (Date.now() + skew);
  $('count').textContent = seal.unlockBy === 'merge' ? `${seal.chain?.releasedAccounts?.length || 0} / ${seal.k}` : countdown(left);
  $('state').textContent = left > 0 ? 'Wait' : seal.unlockBy === 'merge' ? 'You can merge your part now' : 'You can say yes now'; $('state').className = 'badge ' + (left > 0 ? 'warn' : 'ok');
}, 250);
setInterval(async () => { if (!seal || document.hidden) return; const r = await api(`/api/seals/${sealId}`); if (r.ok) { seal = r.body; render(); } }, 6000);

// ---------- own NEAR account: sign with Meteor Wallet ----------
let walletMod;
const wallet = async () => (walletMod ||= await import('/assets/wallet.js'));
async function refreshWallet() {
  try {
    const who = await (await wallet()).connectedAccount();
    $('walletState').textContent = who ? (who === secret.a ? `Connected as ${who}` : `Connected as ${who}, not ${secret.a}`) : 'Not connected';
    $('walletState').className = who === secret.a ? 'resolve ok' : 'muted';
    $('connectBtn').textContent = who && who !== secret.a ? 'Switch account' : 'Connect my wallet';
    return who;
  } catch { $('walletState').textContent = 'Wallet unavailable'; return null; }
}
$('connectBtn').onclick = async () => {
  try {
    const cfg = await config(), w = await wallet();
    if (await w.connectedAccount()) await w.disconnect();
    await w.connect(cfg.contract);
    await refreshWallet();
  } catch (e) { toast('Wallet: ' + e.message, 6000); }
};

function show(kind, ...children) { $('result').className = 'result ' + kind; $('result').replaceChildren(...children); }
$('releaseBtn').onclick = async () => {
  if (busy || !secret) return; busy = true; $('releaseBtn').disabled = true;
  try {
    const cfg = await config();
    $('status').textContent = 'Recording your yes…';
    const commitment = await sha256Hex(new TextEncoder().encode(secret.w));
    let status, txHash;
    if (secret.s) ({ status, txHash } = await releasePart({ rpcUrls: cfg.rpcUrls, contract: cfg.contract, sealId, account: secret.a, secretKey: secret.s, commitment }));
    else {
      const who = await refreshWallet();
      if (who !== secret.a) throw new Error(`Please connect ${secret.a} in your NEAR wallet app first`);
      $('status').textContent = 'Please approve in your NEAR wallet app…';
      ({ status, txHash } = await (await wallet()).walletRelease(cfg.contract, sealId, commitment));
    }
    const tx = el('a', { href: `${EXPLORER}/txns/${txHash}`, target: '_blank', rel: 'noopener' }, 'See the public record →');
    if (status === 'early' || status === 'not_holder') {
      await api(`/api/seals/${sealId}/alerts`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: status === 'early' ? 'early_release' : 'not_holder', account: secret.a, detail: `release_part returned ${status} in ${txHash}` }) });
      show('locked', el('h2', { text: status === 'early' ? 'Too early' : 'Not on the list' }),
        el('p', { text: status === 'early' ? `Please wait until ${istText(seal.unlockAtMs)}, then tap the button again. This early attempt was recorded and the owner was told.` : 'This account is not one of the trusted people for this file.' }), tx);
      $('status').textContent = ''; $('releaseBtn').disabled = status !== 'early'; return;
    }
    if (status !== 'released' && status !== 'already_released') { show('tampered', el('h2', { text: 'Could not record your yes' }), el('p', { text: `Reason: ${status.replace(/_/g, ' ')}. Ask the owner for a new link.` }), tx); $('status').textContent = ''; return; }
    $('status').textContent = 'Recorded. Finishing up…';
    let posted;
    for (let i = 0; i < 6; i++) { // final state can lag the optimistic receipt by a block or two
      posted = await api(`/api/seals/${sealId}/parts`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ account: secret.a, part: secret.w, txHash }) });
      if (posted.status !== 409) break;
      await new Promise((r) => setTimeout(r, 1500));
    }
    if (!posted.ok) throw new Error(posted.body.error || 'Could not hand over the part');
    show('open', el('h2', { text: seal.unlockBy === 'merge' ? 'Thank you. Your part is merged.' : 'Thank you. Your yes is recorded.' }), el('p', { text: seal.unlockBy === 'merge' ? `${posted.body.released} of ${posted.body.k} parts are merged.` : `${posted.body.released} of ${posted.body.k} people have said yes. The file opens when ${posted.body.k} have.` }), tx);
    $('status').textContent = ''; $('releaseBtn').textContent = 'You said yes ✓';
    const r = await api(`/api/seals/${sealId}`); if (r.ok) { seal = r.body; render(); }
  } catch (e) { $('status').textContent = ''; toast(e.message, 6000); $('releaseBtn').disabled = false; }
  finally { busy = false; }
};
await load();
