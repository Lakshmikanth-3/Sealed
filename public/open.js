import { $, api, el, toast, utcText, istText, countdown, bytesText, short, explorer, plainLog } from '/common.js';
import { decryptFile, combineKey, fromB64url, sha256Hex, AuthFailure } from '/assets/sealed.js';

const sealId = location.pathname.split('/').pop();
const EXPLORER = await explorer();
let seal, skew = 0, localCopy = null, opening = false, autoOpened = false;
$('verifyLink').href = `/verify?id=${sealId}`;

async function load() {
  const r = await api(`/api/seals/${sealId}`);
  if (!r.ok) { $('title').textContent = 'We could not find this file. Check the link.'; $('state').textContent = 'Unknown'; $('openBtn').disabled = true; return; }
  seal = r.body; skew = seal.now - Date.now();
  document.title = `${seal.label} · Sealed`;
  $('title').textContent = seal.label;
  $('kind').textContent = seal.mode === 'split' ? `Locked file · ${seal.k} of ${seal.n} trusted people must agree` : 'Locked file · opens by itself on time';
  $('until').textContent = `Opens on ${istText(seal.unlockAtMs)}`;
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
  if (!(await refreshWallet())) throw new Error('Please connect your NEAR wallet app first');
  const c = await api(`/api/seals/${sealId}/challenge`);
  $('statusLine').textContent = 'Please confirm in your NEAR wallet app…';
  const signed = await (await wallet()).proveAccount(c.body);
  return { ...signed, nonce: c.body.nonce };
}
function renderProgress() {
  if (seal.mode !== 'split') return $('progress').replaceChildren();
  const released = seal.chain?.released || 0;
  $('progress').replaceChildren(...Array.from({ length: seal.n }, (_, i) => el('span', { class: 'pip' + (i < released ? ' on' : '') })), el('small', { text: ` ${released} of ${seal.k} people have said yes` }));
}
async function renderLog() {
  const r = await api(`/api/seals/${sealId}/log`);
  $('log').replaceChildren(...(r.ok && r.body.log.length ? r.body.log.slice().reverse().map((e) => el('li', {}, el('time', { text: `${istText(Number(e.at_ms))}` }),
    el('p', {}, el('span', { class: 'accent', text: plainLog(e.kind) })))) : [el('li', { class: 'muted', text: 'Nothing recorded yet.' })]));
}
function tick() {
  if (!seal) return;
  const left = seal.unlockAtMs - (Date.now() + skew);
  $('count').textContent = left > 0 ? countdown(left) : '00:00:00';
  $('until').textContent = `${left > 0 ? 'Opens on' : 'Opening time was'} ${istText(seal.unlockAtMs)}`;
  const locked = left > 0;
  $('state').textContent = locked ? 'Locked' : seal.mode === 'split' && (seal.chain?.released || 0) < seal.k ? 'Waiting for people' : 'Ready';
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
    $('statusLine').textContent = 'Checking…';
    const proof = await accountProof();
    const r = await api(`/api/seals/${sealId}/open`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ gps: await gps(), proof }) });
    if (r.status === 401 || r.status === 403) {
      showResult('tampered', el('h2', { text: r.status === 403 ? 'Not allowed' : 'Please confirm who you are' }), el('p', { text: r.body.message || r.body.error }));
      $('statusLine').textContent = ''; return renderLog();
    }
    const txLink = r.body.tx ? el('a', { href: `${EXPLORER}/txns/${r.body.tx}`, target: '_blank', rel: 'noopener' }, 'See the public record →') : null;
    if (r.status === 423) {
      showResult('locked', el('h2', { text: 'Still locked' }), el('p', { text: `It is too early. This file opens on ${istText(seal.unlockAtMs)}. Your try has been recorded and the owner has been told.` }), txLink);
      $('statusLine').textContent = ''; return renderLog();
    }
    if (r.status === 409) {
      showResult('waiting', el('h2', { text: 'Almost ready' }), el('p', { text: `The time has come. Now ${r.body.k} trusted people must say yes. So far ${r.body.released} have. Try again in a little while.` }));
      $('statusLine').textContent = ''; return renderLog();
    }
    if (!r.ok) throw new Error(r.body.error || 'Open failed');

    $('statusLine').textContent = 'Making sure nobody changed the file…';
    const bytes = localCopy || new Uint8Array((await api(`/api/seals/${sealId}/file`)).body);
    const fresh = await api(`/api/seals/${sealId}`);
    const chainHash = fresh.body.chain?.fileHash;
    const actual = await sha256Hex(bytes);
    if (!chainHash || actual !== chainHash) {
      await report('file_tampered', `Viewer computed ${actual.slice(0, 16)}…, chain has ${String(chainHash).slice(0, 16)}…`);
      showResult('tampered', el('h2', { text: 'FILE TAMPERED' }), el('p', { text: 'Someone changed this file after it was locked, so we did not open it. The owner has been told.' }),
        el('details', {}, el('summary', { text: 'Technical details' }), el('p', { class: 'mono', text: `Recorded fingerprint: ${chainHash}` }), el('p', { class: 'mono', text: `This copy: ${actual}` })));
      $('statusLine').textContent = ''; return renderLog();
    }
    $('statusLine').textContent = 'Opening…';
    const key = r.body.mode === 'single' ? fromB64url(r.body.key) : await combineKey(r.body.parts);
    let out;
    try { out = await decryptFile(bytes, key); }
    catch (e) {
      if (e instanceof AuthFailure) { await report('wrong_key', e.message); showResult('tampered', el('h2', { text: 'Wrong key' }), el('p', { text: 'The key did not fit, so nothing was opened. The owner has been told.' })); $('statusLine').textContent = ''; return; }
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
  const head = [el('p', { class: 'eyebrow', text: auto ? 'Opened automatically on time' : 'Open' }), el('h2', { text: meta.name }),
    el('p', { class: 'verified', text: `✓ Checked: this is the same file that was locked (${bytesText(meta.size)})` })];
  const dl = el('a', { class: 'btn', href: url, download: meta.name }, 'Download');
  let view;
  if (t.startsWith('image/')) view = el('img', { src: url, alt: meta.name, class: 'media-view' });
  else if (t === 'application/pdf') view = el('iframe', { class: 'pdf-view', src: url, title: meta.name });
  else if (t.startsWith('video/')) view = el('video', { src: url, controls: true, class: 'media-view' });
  else if (t.startsWith('audio/')) view = el('audio', { src: url, controls: true });
  else if (t.startsWith('text/') || /\.(txt|md|csv|json)$/i.test(meta.name)) view = el('pre', { class: 'text-view', text: new TextDecoder().decode(bytes.subarray(0, 200_000)) });
  else view = el('p', { class: 'muted', text: 'We cannot show this type of file here. Tap Download to open it.' });
  showResult('open', ...head, view, el('div', { class: 'row' }, dl));
}

$('sealedDoc').onchange = async () => {
  const f = $('sealedDoc').files[0]; if (!f) return;
  try {
    const doc = JSON.parse(await f.text());
    if (doc.format !== 'sealed-paper/1' || doc.sealId !== sealId) throw new Error('This .sealed file belongs to a different seal');
    localCopy = Uint8Array.from(atob(doc.encrypted), (c) => c.charCodeAt(0));
    $('docNote').textContent = `Using your copy: ${f.name}. It is still checked before opening.`;
  } catch (e) { toast(e.message); }
};
await load(); tick();
