// Secret messages: text plus an optional photo or file, encrypted together on this device,
// locked on NEAR until a time, optionally view-once and limited to one NEAR account.
import { $, api, config, el, toast, istText, shareButtons } from '/common.js';
import { encryptFile, toB64url, randomBytes, qrSvg } from '/assets/sealed.js';

export const MESSAGE_TYPE = 'application/vnd.sealed.message+json';
const ACCOUNT_RE = /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/;
const pad = (n) => String(n).padStart(2, '0');
const local = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; };

for (const r of document.querySelectorAll('input[name=msgWhen]')) r.onchange = () => {
  const at = document.querySelector('input[name=msgWhen]:checked').value === 'at';
  $('msgAtBox').classList.toggle('hidden', !at);
  if (at && !$('msgAt').value) $('msgAt').value = local(Date.now() + 3600_000);
};
$('msgFile').onchange = () => {
  const f = $('msgFile').files[0];
  $('msgFileInfo').textContent = f ? `${f.name} (${(f.size / 1048576).toFixed(1)} MB)` : 'No photo or file added.';
};
$('msgOnly').oninput = async () => {
  const id = $('msgOnly').value.trim().toLowerCase();
  if (!id) return void ($('msgOnlyCheck').textContent = '');
  if (!ACCOUNT_RE.test(id)) return void ($('msgOnlyCheck').textContent = `✕ "${id}" does not look like a NEAR account`);
  const r = await api(`/api/accounts/${encodeURIComponent(id)}`);
  $('msgOnlyCheck').textContent = r.ok && r.body.exists ? `✓ ${id} found` : `✕ ${id} was not found`;
};

async function bundle(text, file) {
  // Text and attachment are encrypted together as one JSON document.
  let attachment = null;
  if (file) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    attachment = { name: file.name, type: file.type || 'application/octet-stream', data: toB64url(bytes) };
  }
  return new TextEncoder().encode(JSON.stringify({ v: 1, text, attachment }));
}

$('msgForm').onsubmit = async (e) => {
  e.preventDefault();
  const btn = $('msgBtn'), status = (t) => { $('msgStatus').textContent = t; };
  btn.disabled = true;
  try {
    const cfg = await config();
    if (cfg.storageReady === false) throw new Error('The service is still being set up. Please come back later.');
    const text = $('msgText').value.trim(), file = $('msgFile').files[0];
    if (!text && !file) throw new Error('Please write a message or add a photo or file');
    if (file && file.size > 25 * 1048576) throw new Error('Attachments are limited to 25 MB');
    const when = document.querySelector('input[name=msgWhen]:checked').value;
    const unlockAtMs = when === 'soon' ? Math.ceil((Date.now() + 30_000) / 1000) * 1000 : new Date($('msgAt').value).getTime();
    if (!Number.isFinite(unlockAtMs) || unlockAtMs < Date.now() + 25_000) throw new Error('Please choose a time at least 1 minute from now');
    const only = $('msgOnly').value.trim().toLowerCase();
    if (only && !$('msgOnlyCheck').textContent.startsWith('✓')) throw new Error('Please check the NEAR account name');
    status('Scrambling your message on this device…');
    const { sealed, key, hash } = await encryptFile(await bundle(text, file), { name: 'secret-message.json', type: 'application/vnd.sealed.message+json' });
    const from = $('msgFrom').value.trim();
    const meta = { label: from ? `A secret message from ${from}` : 'A secret message', unlockAtMs, mode: 'single', kind: 'message', fileHash: hash,
      fileKey: toB64url(key), viewOnce: $('msgOnce').checked, viewers: only ? [only] : [] };
    key.fill(0);
    status('Locking it… (about 10 seconds)');
    const headers = { 'content-type': 'application/octet-stream', 'x-seal-meta': toB64url(new TextEncoder().encode(JSON.stringify(meta))) };
    try { const pass = localStorage.getItem('sealed:plan-pass'); if (pass) headers['x-plan-pass'] = pass; } catch { /* Free plan */ }
    let r;
    if (cfg.upload === 'blob') {
      const { uploadToBlob } = await import('/assets/sealed.js');
      const blobUrl = await uploadToBlob(sealed, toB64url(randomBytes(18)));
      r = await api('/api/seals', { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify({ blobUrl }) });
    } else r = await api('/api/seals', { method: 'POST', headers, body: sealed });
    if (!r.ok) throw new Error(r.body.error || 'Sending failed');
    const seal = { sealId: r.body.sealId, ownerToken: r.body.ownerToken, label: meta.label, unlockAtMs, mode: 'single', k: 0, n: 0, createTx: r.body.createTx,
      fileName: file ? file.name : 'message', size: sealed.length, createdAt: Date.now(), viewers: meta.viewers, kind: 'message' };
    try { localStorage.setItem('sealed-paper:mine', JSON.stringify([seal, ...JSON.parse(localStorage.getItem('sealed-paper:mine') || '[]')])); } catch { /* list is a convenience */ }
    $('msgForm').classList.add('hidden'); $('msgSent').classList.remove('hidden');
    $('msgSummary').replaceChildren(`It can be read from ${istText(unlockAtMs)}. `, meta.viewOnce ? 'It will be destroyed after it is opened once. ' : '',
      only ? `Only ${only} can read it. ` : 'Anyone with the link can read it. ',
      el('a', { href: `${cfg.explorer}/txns/${r.body.createTx}`, target: '_blank', rel: 'noopener' }, 'See the public record →'));
    $('msgShare').replaceChildren(shareButtons(seal, { qr: qrSvg }));
    status('');
  } catch (err) { status(''); toast('Could not send: ' + err.message, 7000); }
  finally { btn.disabled = false; }
};
$('msgAgain').onclick = () => { $('msgForm').reset(); $('msgFileInfo').textContent = 'No photo or file added.'; $('msgAtBox').classList.add('hidden'); $('msgSent').classList.add('hidden'); $('msgForm').classList.remove('hidden'); };
