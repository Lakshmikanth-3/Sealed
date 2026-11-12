import { merkleRoot, merkleProof, randomSalt, sha256Hex } from '/lib/merkle.js';

const $ = (id) => document.getElementById(id);
const TYPES = ['trip', 'pay', 'rating', 'penalty', 'notification', 'deactivation'];
let type = 'trip';

// ---------- storage (IndexedDB: entries, anchors) ----------
const dbP = new Promise((resolve, reject) => {
  const r = indexedDB.open('appeal-record', 1);
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
  });
}
const all = (store) => tx(store, 'readonly', (s) => s.getAll());
const put = (store, v, k) => tx(store, 'readwrite', (s) => s.put(v, k));
const getMeta = (k) => tx('meta', 'readonly', (s) => s.get(k));

function toast(msg) {
  const el = document.createElement('div');
  el.className = 'toast'; el.textContent = msg;
  document.body.append(el); setTimeout(() => el.remove(), 3500);
}
const today = () => new Date().toLocaleDateString('en-CA');
const timeOf = (iso) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let worker;
async function init() {
  worker = await getMeta('worker');
  if (!worker) { worker = 'w-' + randomSalt().slice(0, 16); await put('meta', worker, 'worker'); }
  $('wid').textContent = worker;
  try {
    const cfg = await (await fetch('/api/config')).json();
    $('net').textContent = cfg.network === 'mock' ? 'Mock chain (demo)' : `NEAR ${cfg.network}`;
    $('net').className = 'badge ' + (cfg.network === 'mock' ? 'warn' : 'ok');
  } catch { $('net').textContent = 'offline'; }
  $('types').innerHTML = TYPES.map((t) => `<button data-t="${t}" aria-pressed="${t === type}">${t}</button>`).join('');
  $('types').onclick = (e) => { const t = e.target.dataset?.t; if (t) { type = t; syncType(); } };
  syncType();
  render();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
}
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
async function downscale(file) {
  const img = await createImageBitmap(file);
  const s = Math.min(1, 1100 / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.72);
}
const dataUrlBytes = (d) => Uint8Array.from(atob(d.split(',')[1]), (c) => c.charCodeAt(0));

$('capture').onclick = async () => {
  const btn = $('capture'); btn.disabled = true;
  try {
    const ts = new Date().toISOString(); // moment of the tap
    const entry = { id: 'e' + Date.now().toString(36) + randomSalt().slice(0, 4), worker, day: today(), ts, type,
      platform: 'food-delivery', capture: 'live-manual', salt: randomSalt() };
    const amt = $('amount').value, rating = $('rating').value, text = $('text').value.trim();
    if (!$('f-amount').classList.contains('hidden') && amt !== '') entry.amount = Number(amt);
    if (type === 'rating' && rating !== '') entry.rating = Number(rating);
    if (text) entry.text = text.slice(0, 1000);
    let image;
    const f = $('photo').files[0];
    if (f) { image = await downscale(f); entry.imageHash = await sha256Hex(dataUrlBytes(image)); }
    const pos = await position();
    if (pos) entry.geo = pos;
    await put('entries', { entry, image });
    $('amount').value = $('rating').value = $('text').value = ''; $('photo').value = '';
    toast(`Captured live at ${timeOf(ts)}`);
    render();
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
async function anchorDay(day, rows) {
  const entries = rows.map((r) => r.entry);
  const root = await merkleRoot(entries);
  const res = await fetch('/api/anchor', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ worker, day, root, count: entries.length }) });
  const a = await res.json();
  if (!res.ok) throw new Error(a.error);
  await put('anchors', { key: `${day}:${a.txHash}`, day, root, count: entries.length, entryIds: entries.map((e) => e.id), ...a });
}
async function anchorPending() {
  const days = await state();
  let n = 0;
  for (const [day, d] of Object.entries(days)) {
    const last = d.anchors.at(-1);
    if (d.rows.length && (!last || last.count !== d.rows.length)) { await anchorDay(day, d.rows); n++; }
  }
  return n;
}
$('anchorAll').onclick = async () => {
  $('anchorAll').disabled = true;
  try { const n = await anchorPending(); toast(n ? `Saved ${n} day(s) on NEAR` : 'Everything is already saved'); render(); }
  catch (e) { toast('Could not save: ' + e.message); } finally { $('anchorAll').disabled = false; }
};

// ---------- render ----------
async function render() {
  const days = await state();
  const keys = Object.keys(days).sort().reverse();
  $('days').innerHTML = keys.length ? keys.map((day) => {
    const d = days[day], last = d.anchors.at(-1);
    const status = !last ? '<span class="badge warn">not saved</span>'
      : last.count === d.rows.length ? `<span class="badge ok">saved on ${esc(last.network)}</span>`
        : `<span class="badge warn">${d.rows.length - last.count} new since save</span>`;
    return `<div class="card" style="margin:8px 0"><div class="day-head"><strong>${day}</strong>${status}</div>` +
      d.rows.map(({ entry: e, image }) => `<div class="entry">${image ? `<img src="${image}" alt="">` : ''}<div>
        <span class="t">${e.type}</span> ${e.amount != null ? '₹' + e.amount : ''} ${e.rating != null ? '★ ' + e.rating : ''}
        <div class="muted">${esc(e.text || '')}</div>
        <span class="badge live">captured live ${timeOf(e.ts)}</span> ${e.geo ? '<span class="badge">📍</span>' : ''}</div></div>`).join('') + '</div>';
  }).join('') : '<p class="muted">Nothing logged yet.</p>';

  const anchored = keys.filter((k) => days[k].anchors.length);
  $('caseDays').innerHTML = anchored.length ? anchored.map((day) => {
    const a = days[day].anchors.at(-1);
    const rows = days[day].rows.filter((r) => a.entryIds.includes(r.entry.id));
    return `<details><summary><label class="row" style="display:inline-flex;margin:0;color:inherit">
      <input type="checkbox" class="pickday" data-day="${day}" style="width:auto" checked> ${day} · ${rows.length} entries</label></summary>` +
      rows.map(({ entry: e }) => `<label class="row" style="margin:4px 0 0 24px;color:inherit"><input type="checkbox" class="pick" data-day="${day}" data-id="${e.id}" style="width:auto" checked>
        ${e.type} ${e.amount != null ? '₹' + e.amount : ''} ${esc((e.text || '').slice(0, 40))} <span class="muted">${timeOf(e.ts)}</span></label>`).join('') +
      '</details>';
  }).join('') : 'Save at least one day on NEAR first.';
}

// ---------- case ----------
$('build').onclick = async () => {
  const btn = $('build'); btn.disabled = true;
  try {
    const pending = await anchorPending(); // make sure everything captured is anchored first
    if (pending) await render();
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
        anchor: { network: a.network, txHash: a.txHash, sender: a.sender }, entries: disclosed });
    }
    if (!outDays.length) throw new Error('pick at least one entry');
    const res = await fetch('/api/case', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ worker: { id: worker, label: $('label').value.trim() }, days: outDays, attachments }) });
    const out = await res.json();
    if (!res.ok) throw new Error(out.error);
    const link = location.origin + out.url;
    $('caseLink').textContent = link; $('open').href = link;
    $('caseOut').classList.remove('hidden');
    $('share').onclick = () => navigator.share ? navigator.share({ title: 'My work record', url: link }).catch(() => {}) : toast('Use Copy');
    $('copy').onclick = () => navigator.clipboard.writeText(link).then(() => toast('Copied'));
  } catch (e) { toast('Could not build case: ' + e.message); } finally { btn.disabled = false; }
};

$('export').onclick = async () => {
  const blob = new Blob([JSON.stringify({ worker, entries: await all('entries'), anchors: await all('anchors') })], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `appeal-record-${worker}.json`; a.click();
};

init();
