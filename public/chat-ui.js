// Sealed Chat: a two-person, end-to-end encrypted live chat.
// The AES-256 key lives only in the link fragment (#k=...), which browsers never send to the server.
import { chatCrypto, saveChat, loadChat } from '/chat-store.js';

const $ = (id) => document.getElementById(id);
const chatId = location.pathname.split('/').pop();
const key64 = new URLSearchParams(location.hash.slice(1)).get('k') || loadChat(chatId)?.key;
const toast = (t, ms = 4000) => { const n = $('toast'); n.textContent = t; n.classList.remove('hidden'); clearTimeout(toast.t); toast.t = setTimeout(() => n.classList.add('hidden'), ms); };
const hhmm = (ms) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const dayText = (ms) => { const d = new Date(ms), t = new Date(); const y = new Date(Date.now() - 86400_000);
  return d.toDateString() === t.toDateString() ? 'Today' : d.toDateString() === y.toDateString() ? 'Yesterday' : d.toLocaleDateString([], { day: 'numeric', month: 'long', year: 'numeric' }); };

let me = loadChat(chatId), box, lastIndex = -1, firstLocked = Infinity, other = null, names = {}, polling = 0, readSent = -1, deliveredSent = -1;
const shown = new Map(); // index -> element
const seen = new Map(); // index -> last message data
let lastDay = '';

async function api(path, opts = {}) {
  const r = await fetch(path, { ...opts, headers: { 'content-type': 'application/json', 'x-chat-token': me?.token || '', ...(opts.headers || {}) } });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(body.error || 'Network problem'), { status: r.status });
  return body;
}

async function start() {
  if (!key64) { fatal('This link is missing its secret key. Ask for the full link.'); return; }
  try { box = await chatCrypto(key64); } catch { fatal('This link is damaged. Ask for the full link.'); return; }
  if (me) history.replaceState(null, '', location.pathname); // hide the key once this browser has saved it
  if (!me) { $('joinBox').classList.remove('hidden'); $('joinName').focus(); return; }
  poll();
}
function fatal(t) { $('otherStatus').textContent = t; $('compose').classList.add('hidden'); toast(t, 10000); }

$('joinForm').onsubmit = async (e) => {
  e.preventDefault(); $('joinBtn').disabled = true;
  try {
    const name = $('joinName').value.trim();
    const r = await api(`/api/chat/${chatId}/join`, { method: 'POST', body: JSON.stringify({ name: await box.seal({ name }) }) });
    me = { id: chatId, key: key64, token: r.token, memberId: r.memberId, name, createdAt: Date.now() };
    saveChat(me); history.replaceState(null, '', location.pathname);
    $('joinBox').classList.add('hidden'); poll();
  } catch (err) { toast(err.message, 8000); $('joinBtn').disabled = false; }
};

// ---------- receiving ----------
async function poll() {
  clearTimeout(polling);
  try {
    const after = Math.min(lastIndex, firstLocked - 1);
    const r = await api(`/api/chat/${chatId}/messages?after=${after}`);
    for (const m of r.members) if (!names[m.id]) { try { names[m.id] = (await box.open(m.name)).name; } catch { names[m.id] = 'Unknown'; } }
    other = r.other;
    header();
    firstLocked = Infinity;
    for (const m of r.messages) {
      await render(m);
      if (m.locked) firstLocked = Math.min(firstLocked, m.i);
      lastIndex = Math.max(lastIndex, m.i);
    }
    for (const i of r.gone || []) { const m = seen.get(i); if (m && !m.gone && m.from === me.memberId) await render({ ...m, gone: true, c: undefined }); }
    ticks();
    receipts();
  } catch (err) {
    if (err.status === 403 || err.status === 404) { fatal(err.message); return; }
    $('otherStatus').textContent = 'reconnecting…';
  }
  polling = setTimeout(poll, document.hidden ? 5000 : 1500);
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && me) poll(); });

function header() {
  const o = other;
  $('invite').classList.toggle('hidden', Boolean(o));
  if (!o) {
    $('otherName').textContent = 'Waiting for someone to join'; $('otherAv').textContent = '…';
    $('otherStatus').textContent = 'share the invite link below';
    const link = `${location.origin}/c/${chatId}#k=${key64}`;
    $('inviteLink').textContent = link;
    $('waShare').href = `https://wa.me/?text=${encodeURIComponent('Join my private chat on Sealed: ' + link)}`;
    return;
  }
  const n = names[o.id] || 'Them';
  $('otherName').textContent = n; $('otherAv').textContent = n.slice(0, 1).toUpperCase();
  $('otherStatus').textContent = o.typing ? 'typing…' : o.online ? 'online' : o.lastSeen ? `last seen ${dayText(o.lastSeen).toLowerCase()} at ${hhmm(o.lastSeen)}` : 'has not opened the chat yet';
  $('otherStatus').classList.toggle('typing', o.typing);
}
$('copyLink').onclick = async () => { try { await navigator.clipboard.writeText($('inviteLink').textContent); toast('Link copied'); } catch { toast('Select the link and copy it'); } };

async function render(m) {
  seen.set(m.i, m);
  const mine = m.from === me.memberId;
  let node = shown.get(m.i);
  if (node && node.dataset.state === state(m)) return;
  const day = dayText(m.at);
  if (!node && day !== lastDay) { lastDay = day; const d = document.createElement('p'); d.className = 'wa-day'; d.textContent = day; $('msgs').append(d); }
  const b = document.createElement('div');
  b.className = `wa-msg ${mine ? 'out' : 'in'}`; b.dataset.i = m.i; b.dataset.state = state(m);
  const meta = document.createElement('span'); meta.className = 'wa-meta';
  meta.textContent = (m.openAtMs ? '⏱ ' : '') + hhmm(m.at);
  if (mine) { const t = document.createElement('span'); t.className = 'wa-tick'; t.textContent = '✓'; meta.append(t); }

  if (m.locked) {
    b.classList.add('locked');
    b.append(line('🔒', `Sealed message. Opens ${dayText(m.openAtMs).toLowerCase()} at ${hhmm(m.openAtMs)}`), countdown(m.openAtMs));
  } else if (m.gone) {
    b.classList.add('gone');
    b.append(line(mine ? '👁' : '⊘', mine ? (m.viewOnce ? 'Opened' : 'Deleted') : 'Opened, view once'));
  } else if (mine && m.viewOnce) {
    b.append(line('①', m.kind === 'photo' ? 'Photo, view once' : 'Message, view once'));
  } else {
    let body;
    try { body = await box.open(m.c); } catch { body = { t: '⚠ This message could not be decrypted' }; }
    if (!mine && m.viewOnce) {
      const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'wa-once';
      btn.textContent = m.kind === 'photo' ? '① Photo, tap to view once' : '① Message, tap to view once';
      btn.onclick = () => { viewOnce(body); btn.replaceWith(line('⊘', 'Opened')); };
      b.append(btn);
    } else {
      if (body.img) { const img = new Image(); img.src = body.img; img.alt = 'Photo'; img.className = 'wa-img'; img.onclick = () => window.open(body.img); b.append(img); }
      if (body.t) { const p = document.createElement('p'); p.textContent = body.t; b.append(p); }
      if (m.openAtMs && m.openAtMs <= Date.now()) b.prepend(line('🔓', `Sealed until ${hhmm(m.openAtMs)}, now open`, 'wa-unsealed'));
    }
  }
  b.append(meta);
  if (node) node.replaceWith(b); else $('msgs').append(b);
  shown.set(m.i, b);
  $('msgs').scrollTo({ top: $('msgs').scrollHeight, behavior: node ? 'auto' : 'smooth' });
}
const state = (m) => (m.locked ? 'locked' : m.gone ? 'gone' : 'open');
function line(icon, text, cls = 'wa-sys-line') { const p = document.createElement('p'); p.className = cls; p.textContent = `${icon} ${text}`; return p; }
function countdown(at) {
  const s = document.createElement('small'); s.className = 'wa-count mono';
  const f = () => { const d = Math.max(0, at - Date.now()), h = Math.floor(d / 3600_000), mi = Math.floor(d / 60_000) % 60, se = Math.floor(d / 1000) % 60;
    s.textContent = d ? `opens in ${h ? h + 'h ' : ''}${mi}m ${String(se).padStart(2, '0')}s` : 'opening…'; if (d && s.isConnected !== false) setTimeout(f, 1000); };
  f(); return s;
}
function viewOnce(body) {
  const v = $('viewerBody'); v.replaceChildren();
  if (body.img) { const img = new Image(); img.src = body.img; img.alt = 'Photo'; v.append(img); }
  if (body.t) { const p = document.createElement('p'); p.textContent = body.t; v.append(p); }
  $('viewer').classList.remove('hidden');
}
$('viewerClose').onclick = () => { $('viewer').classList.add('hidden'); $('viewerBody').replaceChildren(); };

function ticks() {
  if (!other) return;
  for (const [i, b] of shown) {
    const t = b.querySelector('.wa-tick'); if (!t) continue;
    const read = i <= other.readUpTo, del = i <= other.delivered;
    t.textContent = read || del ? '✓✓' : '✓'; t.classList.toggle('read', read);
  }
}
async function receipts() {
  const theirs = [...shown.keys()].filter((i) => shown.get(i).classList.contains('in'));
  const latest = theirs.length ? Math.max(...theirs) : -1;
  const body = {};
  if (latest > deliveredSent) body.delivered = deliveredSent = latest;
  if (!document.hidden && document.hasFocus() && latest > readSent) body.read = readSent = latest;
  if (Object.keys(body).length) api(`/api/chat/${chatId}/state`, { method: 'POST', body: JSON.stringify(body) }).catch(() => {});
}
window.addEventListener('focus', () => receipts());

// ---------- sending ----------
let openMin = 0;
$('toggleOpts').onclick = () => { const o = $('opts'); o.classList.toggle('hidden'); $('toggleOpts').setAttribute('aria-expanded', String(!o.classList.contains('hidden'))); };
for (const c of $('whenChips').children) c.onclick = () => {
  for (const x of $('whenChips').children) x.classList.toggle('on', x === c);
  openMin = c.dataset.min; $('whenAt').classList.toggle('hidden', openMin !== 'custom');
  if (openMin === 'custom' && !$('whenAt').value) { const d = new Date(Date.now() + 3600_000); d.setSeconds(0, 0); $('whenAt').value = new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); }
  pendingNote();
};
$('viewOnce').onchange = pendingNote;
function openAt() {
  if (openMin === 'custom') return new Date($('whenAt').value).getTime() || 0;
  if (openMin === 'tomorrow') { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); return d.getTime(); }
  return Number(openMin) ? Date.now() + Number(openMin) * 60_000 : 0;
}
function pendingNote() {
  const at = openAt(), once = $('viewOnce').checked, bits = [];
  if (at) bits.push(`⏱ opens ${dayText(at).toLowerCase()} at ${hhmm(at)}`); if (once) bits.push('① view once');
  $('pending').textContent = bits.join(' · '); $('pending').classList.toggle('hidden', !bits.length);
  $('toggleOpts').classList.toggle('on', bits.length > 0);
}
const text = $('text');
let typingSent = 0;
text.oninput = () => {
  text.style.height = 'auto'; text.style.height = Math.min(text.scrollHeight, 140) + 'px';
  if (Date.now() - typingSent > 2500 && me) { typingSent = Date.now(); api(`/api/chat/${chatId}/state`, { method: 'POST', body: JSON.stringify({ typing: true }) }).catch(() => {}); }
};
text.onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey && matchMedia('(pointer: fine)').matches) { e.preventDefault(); $('compose').requestSubmit(); } };

async function send(body, kind) {
  if (!me) return;
  const at = openAt();
  if (at && at < Date.now() + 20_000) { toast('Choose a time at least a minute from now'); return false; }
  $('sendBtn').disabled = true;
  try {
    await api(`/api/chat/${chatId}/messages`, { method: 'POST', body: JSON.stringify({ c: await box.seal(body), kind, openAtMs: at, viewOnce: $('viewOnce').checked }) });
    $('viewOnce').checked = false; openMin = 0; for (const x of $('whenChips').children) x.classList.toggle('on', x.dataset.min === '0');
    $('whenAt').classList.add('hidden'); $('opts').classList.add('hidden'); pendingNote();
    poll(); return true;
  } catch (err) { toast('Not sent: ' + err.message, 6000); return false; }
  finally { $('sendBtn').disabled = false; }
}
$('compose').onsubmit = async (e) => {
  e.preventDefault();
  const t = text.value.trim(); if (!t) return;
  if (await send({ t }, 'text')) { text.value = ''; text.style.height = 'auto'; text.focus(); }
};
$('photo').onchange = async () => {
  const f = $('photo').files[0]; $('photo').value = ''; if (!f) return;
  try { const img = await shrink(f); await send({ img, t: text.value.trim() }, 'photo'); text.value = ''; }
  catch { toast('That photo could not be read'); }
};
async function shrink(file) {
  const bmp = await createImageBitmap(file);
  const s = Math.min(1, 1280 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.8);
}

start();
