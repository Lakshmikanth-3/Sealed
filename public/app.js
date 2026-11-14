import { validateEntry, imageBytes } from '/lib/schema.js';
import { merkleRoot, merkleProof, randomSalt, sha256Hex } from '/lib/merkle.js';
import { validateBackup, MAX_BACKUP_BYTES } from '/lib/backup.js';
import { connectedAccount, connectWallet, signAnchors } from '/assets/wallet.js';
import { lookupNearTx } from '/lib/nearRpc.js';
import { reconcilePending } from '/lib/reconcile.js';

const $ = (id) => document.getElementById(id);
const TYPES = ['trip', 'pay', 'rating', 'penalty', 'notification', 'deactivation'];
let type = 'trip';
let anchoringAvailable = false;
let pendingDisclosure;
let pendingRestore;
let restoreJob = 0;
let liveConfig;
const PUBLIC_RPC = { testnet: 'https://rpc.testnet.near.org', mainnet: 'https://rpc.mainnet.near.org' };

const VIEWS = ['capture', 'journal', 'case', 'backup'];
function showView(view, focus = false) {
  if (!VIEWS.includes(view)) view = 'capture';
  for (const name of VIEWS) $('view-' + name).classList.toggle('hidden', name !== view);
  for (const button of document.querySelectorAll('[data-view]')) {
    if (button.dataset.view === view) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  }
  if (focus) { window.scrollTo(0, 0); $('view-' + view).querySelector('h1').focus({ preventScroll: true }); }
}
for (const button of document.querySelectorAll('[data-view]')) button.onclick = () => { location.hash = button.dataset.view; };
window.addEventListener('hashchange', () => showView(location.hash.slice(1), true));
showView(location.hash.slice(1));
function connectivity() { $('connection').classList.toggle('hidden', navigator.onLine); }
window.addEventListener('online', connectivity); window.addEventListener('offline', connectivity); connectivity();
window.addEventListener('online', () => { void refreshConfig(); });
window.addEventListener('offline', () => { anchoringAvailable = false; $('anchorAll').disabled = $('build').disabled = true; });

// ---------- storage (IndexedDB: entries, anchors) ----------
const dbP = new Promise((resolve, reject) => {
  const r = indexedDB.open('appeal-live-v2', 1);
  r.onupgradeneeded = () => {
    r.result.createObjectStore('entries', { keyPath: 'id' });
    r.result.createObjectStore('anchors', { keyPath: 'key' });
    r.result.createObjectStore('meta');
  };
  r.onsuccess = () => resolve(r.result);
  r.onerror = () => reject(r.error);
});
async function tx(store, mode, fn) {
  const db = await dbP;
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode), s = t.objectStore(store);
    const req = fn(s);
    t.oncomplete = () => resolve(req?.result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('Storage transaction aborted'));
  });
}
const all = (store) => tx(store, 'readonly', (s) => s.getAll());
const put = (store, v, k) => tx(store, 'readwrite', (s) => s.put(v, k));
const getMeta = (k) => tx('meta', 'readonly', (s) => s.get(k));

function toast(msg) {
  const el = document.createElement('div');
  el.className = 'toast'; el.setAttribute('role', 'status'); el.textContent = msg;
  document.body.append(el); setTimeout(() => el.remove(), 3500);
}
const today = () => new Date().toLocaleDateString('en-CA');
const timeOf = (iso) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let worker;
async function refreshConfig() {
  try {
    const response = await fetch('/api/config', { signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error('Configuration unavailable');
    const cfg = await response.json();
    liveConfig = cfg;
    $('aiStatus').textContent = cfg.ai?.ready ? 'Verified private AI is configured.' : (cfg.ai?.reason || 'AI is not configured');
    $('usePrivateAI').disabled = !cfg.ai?.ready;
    if (!PUBLIC_RPC[cfg.network]) throw new Error('Unsupported network');
    const account = await connectedAccount(cfg.network);
    if (account && (!worker || worker === account)) { worker = account; await put('meta', worker, 'worker'); }
    anchoringAvailable = !!(cfg.contract && account && worker === account);
    $('connectWallet').disabled = false;
    $('connectWallet').textContent = account || 'Connect Meteor Wallet';
    $('setupStatus').textContent = cfg.contract ? `Contract: ${cfg.contract}. Your wallet approves each save and pays network fees.` : 'Contract deployment required for NEAR commitments. You can connect your wallet and keep a private journal now.';
    $('net').textContent = `NEAR ${cfg.network}${anchoringAvailable ? ' · wallet connected' : ' · setup required'}`;
    $('wid').textContent = worker || 'No wallet connected';
    $('net').className = 'badge warn';
    $('anchorAll').textContent = 'Save all days on NEAR';
  } catch { anchoringAvailable = false; $('net').textContent = 'Offline · local capture'; }
  $('anchorAll').disabled = $('build').disabled = !anchoringAvailable;
}
async function init() {
  worker = await getMeta('worker');
  $('wid').textContent = worker || 'Connect your NEAR wallet before recording';
  $('timezone').textContent = `Work days follow this device’s timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}.`;
  $('anchorAll').disabled = $('build').disabled = true;
  await refreshConfig();
  try { await recoverAnchors(); } catch (error) { toast(error.message); }
  const hints = ['A completed journey', 'A payment received', 'A score changed', 'A deduction or charge', 'A message from the app', 'Access to work stopped'];
  $('types').innerHTML = TYPES.map((t, i) => `<button data-t="${t}" aria-pressed="${t === type}">${t}<small>${hints[i]}</small></button>`).join('');
  $('types').onclick = (e) => { const t = e.target.closest('button')?.dataset.t; if (t) { type = t; syncType(); } };
  syncType();
  await render();
  await renderShares();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
}
$('connectWallet').onclick = async () => {
  try {
    if (!liveConfig?.network) throw new Error('Network configuration is unavailable');
    await connectWallet(liveConfig.network, liveConfig.contract);
    await refreshConfig();
  } catch (error) { toast('Wallet connection failed: ' + error.message); }
};
$('recoverAnchors').onclick = async () => {
  try { await recoverAnchors($('transactionHashes').value.trim()); await render(); }
  catch (error) { toast('Verification failed: ' + error.message); }
};
function syncType() {
  for (const b of $('types').children) b.setAttribute('aria-pressed', b.dataset.t === type);
  $('f-amount').classList.toggle('hidden', !['trip', 'pay', 'penalty'].includes(type));
  $('f-rating').classList.toggle('hidden', type !== 'rating');
}

// ---------- capture ----------
function position() {
  return new Promise((resolve) => {
    if (!$('gps').checked || !navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: +p.coords.latitude.toFixed(5), lon: +p.coords.longitude.toFixed(5), acc: Math.round(p.coords.accuracy) }),
      () => resolve(null), { timeout: 6000, maximumAge: 60000 });
  });
}
async function readScreenshot(file) {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('Choose a PNG, JPEG or WebP screenshot');
  if (file.size > 8 * 1024 * 1024) throw new Error('Screenshot must be 8 MB or smaller');
  const bitmap = await createImageBitmap(file); // reject unreadable images before saving
  bitmap.close();
  // Hash and retain the original bytes; recompression would change the evidence.
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
const dataUrlBytes = (d) => Uint8Array.from(atob(d.split(',')[1]), (c) => c.charCodeAt(0));

$('capture').onclick = async () => {
  const btn = $('capture'); btn.disabled = true;
  try {
    if (!worker) throw new Error('Connect your NEAR wallet before recording');
    const ts = new Date().toISOString(); // device-reported moment of the tap
    const entry = { id: 'e' + Date.now().toString(36) + randomSalt().slice(0, 4), worker, day: today(), ts, type,
      capture: 'live-manual', timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, salt: randomSalt() };
    if ($('platform').value.trim()) entry.platform = $('platform').value.trim();
    const amt = $('amount').value, rating = $('rating').value, text = $('text').value.trim();
    if (!$('f-amount').classList.contains('hidden') && amt !== '') entry.amount = Number(amt);
    if (type === 'rating' && rating !== '') entry.rating = Number(rating);
    if (text) entry.text = text.slice(0, 1000);
    let image;
    const f = $('photo').files[0];
    if (f) { image = await readScreenshot(f); entry.imageHash = await sha256Hex(dataUrlBytes(image)); }
    const pos = await position();
    if (pos) entry.geo = pos;
    validateEntry(entry, worker, entry.day);
    await put('entries', { id: entry.id, entry, image });
    $('amount').value = $('rating').value = $('text').value = ''; $('photo').value = '';
    toast(`Recorded at ${timeOf(ts)}`);
    await render();
  } catch (e) { toast('Capture failed: ' + e.message); } finally { btn.disabled = false; }
};

// ---------- anchoring ----------
async function state() {
  const rows = (await all('entries')).sort((a, b) => a.entry.ts.localeCompare(b.entry.ts));
  const anchors = await all('anchors');
  const days = {};
  for (const r of rows) (days[r.entry.day] ||= { rows: [], anchors: [] }).rows.push(r);
  for (const a of anchors) (days[a.day] ||= { rows: [], anchors: [] }).anchors.push(a);
  for (const d of Object.values(days)) d.anchors.sort((a, b) => a.timestamp - b.timestamp);
  return days;
}
async function recoverAnchors(explicitHashes) {
  const pending = await getMeta('pendingAnchors');
  if (!pending) return;
  $('pendingTransaction').classList.remove('hidden');
  const params = new URLSearchParams(location.search);
  if (params.has('errorCode') && !explicitHashes && !pending.hashes?.length) throw new Error('Wallet did not complete signing. Pending details are retained for transaction reconciliation.');
  const hashes = (explicitHashes || params.get('transactionHashes') || pending.hashes?.join(',') || '').split(',').map((hash) => hash.trim()).filter(Boolean);
  if (!hashes.length) return;
  pending.hashes = hashes;
  await put('meta', pending, 'pendingAnchors');
  const result = await reconcilePending(pending, hashes, (hash) => lookupNearTx(PUBLIC_RPC[pending.network], hash, pending.worker,
    { network: pending.network, contract: pending.contract, protocol: 2 }));
  const db = await dbP;
  await new Promise((resolve, reject) => {
    const t = db.transaction(['anchors', 'meta'], 'readwrite');
    for (const record of result.confirmed) t.objectStore('anchors').put(record);
    if (result.pending) t.objectStore('meta').put(result.pending, 'pendingAnchors');
    else t.objectStore('meta').delete('pendingAnchors');
    t.oncomplete = resolve; t.onerror = () => reject(t.error); t.onabort = () => reject(t.error);
  });
  $('pendingTransaction').classList.toggle('hidden', !result.pending);
  history.replaceState(null, '', location.pathname + location.hash);
  $('pendingStatus').textContent = result.pending
    ? `${result.confirmed.length} day(s) verified; ${result.pending.items.length} still unresolved. ${result.problems.map((problem) => problem.message).join('; ')}`
    : 'All submitted commitments verified.';
  toast(`${result.confirmed.length} day(s) verified on NEAR${result.pending ? '; unresolved transactions retained' : ''}`);
}
async function anchorPending() {
  if (await getMeta('pendingAnchors')) throw new Error('Reconcile the pending wallet transactions before signing again');
  const days = await state();
  const items = [];
  for (const [day, d] of Object.entries(days)) {
    const last = d.anchors.at(-1);
    if (d.rows.length && (!last || last.count !== d.rows.length)) {
      const entries = d.rows.map((row) => row.entry);
      if (entries.some((entry) => entry.worker !== worker)) throw new Error('Journal belongs to a different wallet');
      items.push({ args: { v: 2, network: liveConfig.network, worker, day, root: await merkleRoot(entries), count: entries.length }, entryIds: entries.map((entry) => entry.id) });
    }
  }
  if (!items.length) return 0;
  if (items.length > 20) throw new Error('At most 20 days can be signed in one batch');
  const health = await fetch('/api/health?worker=' + encodeURIComponent(worker));
  if (!health.ok) throw new Error('The configured NEAR contract is not ready');
  const pending = { network: liveConfig.network, contract: liveConfig.contract, worker, items };
  await put('meta', pending, 'pendingAnchors');
  $('pendingTransaction').classList.remove('hidden');
  const outcomes = await signAnchors(pending.network, pending.contract, worker, items.map((item) => item.args));
  if (outcomes?.length) await recoverAnchors(outcomes.map((outcome) => outcome.transaction.hash).join(','));
  return items.length;
}
$('anchorAll').onclick = async () => {
  $('anchorAll').disabled = true;
  try { if (!anchoringAvailable) throw new Error('Connect your journal wallet first'); const n = await anchorPending(); toast(n ? 'Check the transaction verification status' : 'Everything is already saved'); await render(); }
  catch (e) { toast('Could not save: ' + e.message); } finally { $('anchorAll').disabled = !anchoringAvailable; }
};

// ---------- render ----------
async function render() {
  const dayChoices = new Map([...document.querySelectorAll('.pickday')].map((e) => [e.dataset.day, e.checked]));
  const entryChoices = new Map([...document.querySelectorAll('.pick')].map((e) => [e.dataset.id, e.checked]));
  const checked = (choices, key) => (choices.has(key) ? choices.get(key) : choices.size === 0) ? 'checked' : '';
  const days = await state();
  const keys = Object.keys(days).sort().reverse();
  const recordCount = Object.values(days).reduce((n, day) => n + day.rows.length, 0);
  $('journalCount').textContent = `${recordCount} local record${recordCount === 1 ? '' : 's'} · ${keys.length} day${keys.length === 1 ? '' : 's'}`;
  $('anchorAll').textContent = 'Save all days on NEAR';
  $('days').innerHTML = keys.length ? keys.map((day) => {
    const d = days[day], last = d.anchors.at(-1);
    const status = !last ? '<span class="badge warn">not saved</span>'
      : last.count === d.rows.length ? `<span class="badge ${last.restored ? 'warn' : 'ok'}">${last.restored ? 'restored; not rechecked' : `saved on ${esc(last.network)}`}</span>`
        : `<span class="badge warn">${d.rows.length - last.count} new since save</span>`;
    return `<div class="card" style="margin:8px 0"><div class="day-head"><strong>${day}</strong>${status}</div>` +
      d.rows.map(({ entry: e, image }) => `<div class="entry">${image ? `<img src="${image}" alt="">` : ''}<div>
        <span class="t">${e.type}</span> ${e.amount != null ? '₹' + e.amount : ''} ${e.rating != null ? '★ ' + e.rating : ''}
        <div class="muted">${esc(e.text || '')}</div>
        <span class="badge live">${e.capture === 'live-manual' ? 'manually recorded' : 'self-reported record'} ${timeOf(e.ts)}</span> ${e.geo ? '<span class="badge">location included</span>' : ''}</div></div>`).join('') + '</div>';
  }).join('') : '<p class="muted">Nothing logged yet.</p>';

  const anchored = keys.filter((k) => days[k].anchors.length);
  $('caseDays').innerHTML = anchored.length ? anchored.map((day) => {
    const a = days[day].anchors.at(-1);
    const rows = days[day].rows.filter((r) => a.entryIds.includes(r.entry.id));
    return `<details><summary><label class="row" style="display:inline-flex;margin:0;color:inherit">
      <input type="checkbox" class="pickday" data-day="${day}" style="width:auto" ${checked(dayChoices, day)}> ${day} · ${rows.length} entries</label></summary>` +
      rows.map(({ entry: e }) => `<label class="row" style="margin:4px 0 0 24px;color:inherit"><input type="checkbox" class="pick" data-day="${day}" data-id="${e.id}" style="width:auto" ${checked(entryChoices, e.id)}>
        ${e.type} ${e.amount != null ? '₹' + e.amount : ''} ${esc((e.text || '').slice(0, 40))} <span class="muted">${timeOf(e.ts)}</span></label>`).join('') +
      '</details>';
  }).join('') : 'Save at least one day on NEAR first.';
}

// ---------- case ----------
$('build').onclick = async () => {
  const btn = $('build'); btn.disabled = true;
  try {
    if (!anchoringAvailable) throw new Error('Account setup is pending');
    const pending = await anchorPending(); // make sure everything captured is anchored first
    if (pending) {
      await render();
      toast('New records saved. Review your selection, then build again.');
      return;
    }
    const days = await state();
    const picked = [...document.querySelectorAll('.pickday:checked')].map((x) => x.dataset.day);
    const chosen = new Set([...document.querySelectorAll('.pick:checked')].map((x) => x.dataset.id));
    const outDays = [], attachments = {};
    for (const day of picked) {
      const a = days[day].anchors.at(-1);
      const byId = Object.fromEntries(days[day].rows.map((r) => [r.entry.id, r]));
      const entries = a.entryIds.map((id) => byId[id].entry);
      const disclosed = [];
      for (let i = 0; i < entries.length; i++) {
        if (!chosen.has(entries[i].id)) continue;
        disclosed.push({ entry: entries[i], proof: await merkleProof(entries, i) });
        const img = byId[entries[i].id].image;
        if ($('incImg').checked && img) attachments[entries[i].imageHash] = img;
      }
      if (disclosed.length) outDays.push({ day, root: a.root, count: a.count,
        anchor: { network: a.network, txHash: a.txHash, sender: a.sender, contract: a.contract, receiptId: a.receiptId }, entries: disclosed });
    }
    if (!outDays.length) throw new Error('pick at least one entry');
    pendingDisclosure = { version: 2, worker: { id: worker, label: $('label').value.trim() }, days: outDays, attachments,
      ttlSeconds: Number($('shareLifetime').value), aiConsent: $('usePrivateAI').checked };
    const records = outDays.flatMap((day) => day.entries.map((item) => item.entry));
    $('disclosureSummary').textContent = `${outDays.length} day(s), ${records.length} record(s), ${Object.keys(attachments).length} screenshot(s), ${records.filter((entry) => entry.geo).length} location(s). Display name: ${pendingDisclosure.worker.label || 'not supplied'}.`;
    $('disclosureSummary').textContent += ` Link expires after ${pendingDisclosure.ttlSeconds / 3600} hour(s). `
      + (pendingDisclosure.aiConsent ? 'Selected text, dates, amounts and ratings will also be sent to NEAR AI for a draft. Images and location are excluded from the AI request.' : 'No AI inference requested.');
    $('disclosureRecords').innerHTML = records.map((entry) => `<article><strong>${esc(entry.type)} · ${esc(entry.day)}</strong><p>${esc(entry.text || 'No note')}</p><p>${entry.amount != null ? `₹${esc(entry.amount)} · ` : ''}${entry.rating != null ? `Rating ${esc(entry.rating)} · ` : ''}${esc(entry.ts)}</p>${entry.geo ? `<p>Location: ${esc(entry.geo.lat)}, ${esc(entry.geo.lon)}</p>` : ''}<code>${esc(entry.id)}</code></article>`).join('');
    $('disclosureConsent').checked = false; $('disclosureError').textContent = '';
    $('disclosureDialog').showModal();
  } catch (e) { toast('Could not prepare case: ' + e.message); } finally { btn.disabled = !anchoringAvailable; }
};
$('cancelDisclosure').onclick = () => { pendingDisclosure = undefined; $('disclosureDialog').close(); };
$('disclosureDialog').addEventListener('cancel', () => { pendingDisclosure = undefined; });
$('publish').onclick = async () => {
  if (!pendingDisclosure || !$('disclosureConsent').checked) { $('disclosureError').textContent = 'Review the records and confirm sharing before continuing.'; return; }
  $('publish').disabled = true;
  try {
    const res = await fetch('/api/case', { method: 'POST', headers: { 'content-type': 'application/json', 'x-publish-token': $('publishAccessToken').value, ...(pendingDisclosure.aiConsent ? { authorization: 'Bearer ' + $('aiAccessToken').value } : {}) }, body: JSON.stringify(pendingDisclosure) });
    const out = await res.json();
    if (!res.ok) throw new Error(out.error);
    const links = await getMeta('sharedLinks') || [];
    links.push({ id: out.id, token: out.managementToken, expiresAt: out.expiresAt, url: out.url });
    await put('meta', links, 'sharedLinks');
    await renderShares();
    const link = location.origin + out.url;
    $('caseLink').textContent = link; $('open').href = link;
    $('caseOut').classList.remove('hidden');
    $('disclosureDialog').close(); pendingDisclosure = undefined;
    $('share').onclick = () => navigator.share ? navigator.share({ title: 'My work record', url: link }).catch(() => {}) : toast('Use Copy');
    $('copy').onclick = () => navigator.clipboard.writeText(link).then(() => toast('Copied'));
  } catch (e) { $('disclosureError').textContent = 'Could not publish: ' + e.message; } finally { $('publish').disabled = false; }
};

$('export').onclick = async () => {
  try {
    const db = await dbP;
    const snapshot = await new Promise((resolve, reject) => {
      const transaction = db.transaction(['entries', 'anchors', 'meta'], 'readonly');
      const entries = transaction.objectStore('entries').getAll(), anchors = transaction.objectStore('anchors').getAll();
      const reference = transaction.objectStore('meta').get('worker');
      transaction.oncomplete = () => resolve({ worker: reference.result, entries: entries.result, anchors: anchors.result });
      transaction.onabort = transaction.onerror = () => reject(transaction.error || new Error('Backup snapshot failed'));
    });
    const blob = new Blob([JSON.stringify({ format: 'appeal-backup', version: 1, createdAt: new Date().toISOString(), ...snapshot })], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `appeal-record-${snapshot.worker}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    if (blob.size > MAX_BACKUP_BYTES) toast('Downloaded. This file exceeds the 50 MB automatic restore limit; keep it private and seek help for recovery.');
  } catch (e) { toast('Backup failed: ' + e.message); }
};

$('restoreFile').onchange = async () => {
  const job = ++restoreJob; pendingRestore = undefined; $('restore').classList.add('hidden');
  const file = $('restoreFile').files[0]; if (!file) return;
  $('restoreStatus').textContent = 'Checking backup locally…';
  try {
    if (file.size > MAX_BACKUP_BYTES) throw new Error('Backup must be 50 MB or smaller');
    if ((await all('entries')).length || (await all('anchors')).length) throw new Error('Restore needs an empty journal. Your current records have not been changed.');
    const backup = await validateBackup(JSON.parse(await file.text()));
    for (const row of backup.entries) if (row.image) {
      const bitmap = await createImageBitmap(new Blob([imageBytes(row.image)])); bitmap.close();
    }
    if (job !== restoreJob) return;
    pendingRestore = backup;
    $('restoreStatus').textContent = `Ready to restore ${backup.entries.length} record(s) and ${backup.anchors.length} anchor reference(s) for ${backup.worker}. References have not been checked against the chain. Nothing has been uploaded.`;
    $('restore').classList.remove('hidden');
  } catch (e) { if (job === restoreJob) $('restoreStatus').textContent = 'Restore refused: ' + e.message; }
};
$('restore').onclick = async () => {
  const backup = pendingRestore; if (!backup) return;
  $('restore').disabled = true;
  try {
    const db = await dbP;
    await new Promise((resolve, reject) => {
      const transaction = db.transaction(['entries', 'anchors', 'meta'], 'readwrite');
      const entries = transaction.objectStore('entries'), anchors = transaction.objectStore('anchors');
      let failure;
      const countEntries = entries.count(), countAnchors = anchors.count();
      countAnchors.onsuccess = () => {
        if (countEntries.result || countAnchors.result) { failure = new Error('Journal is no longer empty; no records were changed'); transaction.abort(); return; }
        for (const row of backup.entries) entries.add(row);
        for (const anchor of backup.anchors) anchors.add(anchor);
        transaction.objectStore('meta').put(backup.worker, 'worker');
      };
      transaction.oncomplete = resolve;
      transaction.onabort = transaction.onerror = () => reject(failure || transaction.error || new Error('Restore transaction failed'));
    });
    worker = backup.worker; $('wid').textContent = worker; pendingRestore = undefined;
    $('restore').classList.add('hidden'); $('restoreStatus').textContent = 'Backup restored locally. Saved references still require chain verification.';
    await render();
  } catch (e) { $('restoreStatus').textContent = 'Restore refused: ' + e.message; }
  finally { $('restore').disabled = false; }
};

init().catch((e) => toast('Could not open local storage: ' + e.message));

async function renderShares() {
  const links = await getMeta('sharedLinks') || [];
  $('sharedLinks').replaceChildren();
  if (!links.length) { $('sharedLinks').textContent = 'No links created on this device.'; return; }
  for (const link of links) {
    const row = document.createElement('div'); row.className = 'row';
    const anchor = document.createElement('a'); anchor.href = link.url; anchor.textContent = 'Open reviewer link';
    const status = document.createElement('span'); status.textContent = new Date(link.expiresAt).toLocaleString();
    const remove = document.createElement('button'); remove.className = 'secondary'; remove.textContent = 'Delete hosted share';
    remove.onclick = async () => {
      if (!confirm('Delete this hosted share? Downloaded copies and chain commitments remain.')) return;
      try {
        const response = await fetch('/api/pack/' + link.id, { method: 'DELETE', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + link.token } });
        if (!response.ok && response.status !== 404) throw new Error('Share deletion failed');
        await put('meta', links.filter((item) => item.id !== link.id), 'sharedLinks'); await renderShares();
      } catch (error) { toast(error.message); }
    };
    row.append(anchor, status, remove); $('sharedLinks').append(row);
  }
}
