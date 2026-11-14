import { $, api, el, toast, utcText, istText, countdown, bytesText, short, explorer } from '/common.js';
import { decryptFile, combineKey, fromB64url, sha256Hex, AuthFailure } from '/assets/sealed.js';

const sealId = location.pathname.split('/').pop();
const EXPLORER = await explorer();
let seal, skew = 0, localCopy = null, opening = false, autoOpened = false;
$('verifyLink').href = `/verify?id=${sealId}`;

async function load() {
  const r = await api(`/api/seals/${sealId}`);
  if (!r.ok) { $('title').textContent = 'Seal not found'; $('state').textContent = 'Unknown'; $('openBtn').disabled = true; return; }
  seal = r.body; skew = seal.now - Date.now();
  document.title = `${seal.label} · Sealed`;
  $('title').textContent = seal.label;
  $('kind').textContent = seal.mode === 'split' ? `Split lock · ${seal.k} of ${seal.n} key holders` : 'Single lock · opens by time';
  $('until').textContent = `Locked until ${istText(seal.unlockAtMs)} · ${utcText(seal.unlockAtMs)}`;
  if (seal.restricted) { $('accessBox').classList.remove('hidden'); $('viewerCount').textContent = seal.viewerCount; void refreshWallet(); }
  renderProgress(); renderLog();
}

// ---------- allow-listed seals: prove the viewer's NEAR account ----------
let walletMod;
const wallet = async () => (walletMod ||= await import('/assets/wallet.js'));
async function refreshWallet() {
  try { const who = await (await wallet()).connectedAccount(); $('walletState').textContent = who ? `Connected as ${who}` : 'Not connected'; return who; }
  catch { $('walletState').textContent = 'Wallet unavailable'; return null; }
}
$('connectBtn').onclick = async () => {
  try { const w = await wallet(); if (await w.connectedAccount()) await w.disconnect(); await w.connect((await api('/api/config')).body.contract); await refreshWallet(); }
  catch (e) { toast('Wallet: ' + e.message, 6000); }
};
async function accountProof() {
  if (!seal.restricted) return null;
  if (!(await refreshWallet())) await $('connectBtn').onclick();
  if (!(await refreshWallet())) throw new Error('Connect your NEAR wallet to prove your account');
  const c = await api(`/api/seals/${sealId}/challenge`);
  $('statusLine').textContent = 'Sign the one-time message in Meteor Wallet…';
  const signed = await (await wallet()).proveAccount(c.body);
  return { ...signed, nonce: c.body.nonce };
}
function renderProgress() {
  if (seal.mode !== 'split') return $('progress').replaceChildren();
  const released = seal.chain?.released || 0;
  $('progress').replaceChildren(...Array.from({ length: seal.n }, (_, i) => el('span', { class: 'pip' + (i < released ? ' on' : '') })), el('small', { text: ` ${released} of ${seal.k} needed parts released on NEAR` }));
}
async function renderLog() {
  const r = await api(`/api/seals/${sealId}/log`);
  $('log').replaceChildren(...(r.ok && r.body.log.length ? r.body.log.slice().reverse().map((e) => el('li', {}, el('time', { text: `${istText(Number(e.at_ms))}` }),
    el('p', {}, el('span', { class: 'accent', text: e.kind.replace(':', ' · ').toUpperCase() }), ` · ${short(e.account, 8)}`))) : [el('li', { class: 'muted', text: 'No entries yet.' })]));
}
function tick() {
  if (!seal) return;
  const left = seal.unlockAtMs - (Date.now() + skew);
  $('count').textContent = left > 0 ? countdown(left) : '00:00:00';
  $('until').textContent = `${left > 0 ? 'Locked until' : 'Unlock time reached'} ${istText(seal.unlockAtMs)} · ${utcText(seal.unlockAtMs)}`;
  const locked = left > 0;
  $('state').textContent = locked ? 'Locked' : seal.mode === 'split' && (seal.chain?.released || 0) < seal.k ? 'Awaiting holders' : 'Unlockable';
  $('state').className = 'badge ' + (locked ? 'warn' : 'ok');
  // Single mode opens automatically at its time; split mode waits for holders.
  if (!locked && !autoOpened && seal.mode === 'single') { autoOpened = true; void openFile(true); }
}
setInterval(tick, 250);
setInterval(async () => { if (!seal || document.hidden) return; const r = await api(`/api/seals/${sealId}`); if (r.ok) { seal = r.body; renderProgress(); } }, 6000);

function gps() {
  if (!$('shareGps').checked || !navigator.geolocation) return Promise.resolve(null);
  return new Promise((resolve) => navigator.geolocation.getCurrentPosition((p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude, accuracy: p.coords.accuracy }), () => resolve(null), { timeout: 8000 }));
}
async function report(kind, detail) {
  await api(`/api/seals/${sealId}/alerts`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind, detail, gps: await gps() }) });
}
function showResult(kind, ...children) { $('result').className = 'result ' + kind; $('result').replaceChildren(...children); }

async function openFile(auto = false) {
  if (opening || !seal) return; opening = true; $('openBtn').disabled = true;
  try {
    $('statusLine').textContent = 'Asking the NEAR contract…';
    const proof = await accountProof();
    const r = await api(`/api/seals/${sealId}/open`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ gps: await gps(), proof }) });
    if (r.status === 401 || r.status === 403) {
      showResult('tampered', el('h2', { text: r.status === 403 ? 'Not allowed' : 'Account not verified' }), el('p', { text: r.body.message || r.body.error }));
      $('statusLine').textContent = ''; return renderLog();
    }
    const txLink = r.body.tx ? el('a', { href: `${EXPLORER}/txns/${r.body.tx}`, target: '_blank', rel: 'noopener' }, 'See the refusal on NEAR →') : null;
    if (r.status === 423) {
      showResult('locked', el('h2', { text: 'Refused: still locked' }), el('p', { text: `The contract refused this request because the unlock time (${istText(seal.unlockAtMs)}) has not arrived. The attempt was logged and the owner was alerted.` }), txLink);
      $('statusLine').textContent = ''; return renderLog();
    }
    if (r.status === 409) {
      showResult('waiting', el('h2', { text: 'Time reached · waiting for key holders' }), el('p', { text: `${r.body.released} of ${r.body.k} parts released. The file opens when ${r.body.k} holders release their parts on NEAR.` }));
      $('statusLine').textContent = ''; return renderLog();
    }
    if (!r.ok) throw new Error(r.body.error || 'Open failed');

    $('statusLine').textContent = 'Checking the encrypted file against the hash on NEAR…';
    const bytes = localCopy || new Uint8Array((await api(`/api/seals/${sealId}/file`)).body);
    const fresh = await api(`/api/seals/${sealId}`);
    const chainHash = fresh.body.chain?.fileHash;
    const actual = await sha256Hex(bytes);
    if (!chainHash || actual !== chainHash) {
      await report('file_tampered', `Viewer computed ${actual.slice(0, 16)}…, chain has ${String(chainHash).slice(0, 16)}…`);
      showResult('tampered', el('h2', { text: 'FILE TAMPERED' }), el('p', { text: 'The encrypted file does not match the hash recorded on NEAR when it was sealed. It was not opened. The owner has been alerted.' }),
        el('p', { class: 'mono', text: `On-chain: ${chainHash}` }), el('p', { class: 'mono', text: `This copy: ${actual}` }));
      $('statusLine').textContent = ''; return renderLog();
    }
    $('statusLine').textContent = 'Rebuilding the key in your browser…';
    const key = r.body.mode === 'single' ? fromB64url(r.body.key) : await combineKey(r.body.parts);
    let out;
    try { out = await decryptFile(bytes, key); }
    catch (e) {
      if (e instanceof AuthFailure) { await report('wrong_key', e.message); showResult('tampered', el('h2', { text: 'Wrong key' }), el('p', { text: 'Decryption failed its authentication check. Nothing was shown. The owner has been alerted.' })); $('statusLine').textContent = ''; return; }
      throw e;
    }
    $('statusLine').textContent = '';
    await renderFile(out, actual, auto);
    renderLog();
  } catch (e) { $('statusLine').textContent = ''; toast(e.message, 6000); }
  finally { opening = false; $('openBtn').disabled = false; }
}
$('openBtn').onclick = () => openFile(false);

async function renderFile({ bytes, meta }, hash, auto) {
  const blob = new Blob([bytes], { type: meta.type || 'application/octet-stream' }), url = URL.createObjectURL(blob);
  const t = meta.type || '';
  const head = [el('p', { class: 'eyebrow', text: auto ? 'Opened automatically at its time' : 'Unlocked' }), el('h2', { text: meta.name }),
    el('p', { class: 'verified', text: `Verified: matches the hash on NEAR (${hash.slice(0, 16)}…) · ${bytesText(meta.size)}` })];
  const dl = el('a', { class: 'btn', href: url, download: meta.name }, 'Download');
  let view;
  if (t.startsWith('image/')) view = el('img', { src: url, alt: meta.name, class: 'media-view' });
  else if (t === 'application/pdf') view = el('iframe', { class: 'pdf-view', src: url, title: meta.name });
  else if (t.startsWith('video/')) view = el('video', { src: url, controls: true, class: 'media-view' });
  else if (t.startsWith('audio/')) view = el('audio', { src: url, controls: true });
  else if (t.startsWith('text/') || /\.(txt|md|csv|json)$/i.test(meta.name)) view = el('pre', { class: 'text-view', text: new TextDecoder().decode(bytes.subarray(0, 200_000)) });
  else view = el('p', { class: 'muted', text: 'Preview is not available for this file type. Download it to open.' });
  showResult('open', ...head, view, el('div', { class: 'row' }, dl));
}

$('sealedDoc').onchange = async () => {
  const f = $('sealedDoc').files[0]; if (!f) return;
  try {
    const doc = JSON.parse(await f.text());
    if (doc.format !== 'sealed-paper/1' || doc.sealId !== sealId) throw new Error('This .sealed file belongs to a different seal');
    localCopy = Uint8Array.from(atob(doc.encrypted), (c) => c.charCodeAt(0));
    $('docNote').textContent = `Using ${f.name} (${bytesText(localCopy.length)} encrypted). It is checked against NEAR before opening.`;
  } catch (e) { toast(e.message); }
};
await load(); tick();
