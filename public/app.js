import { $, api, config, el, toast, utcText, istText, localText, countdown, bytesText, short, shareButtons, whatsappUrl, mailtoUrl, copy, EXPLORER,
  imageData, visualShares, animateReveal, canvasOf } from '/common.js';
import { encryptFile, splitKey, wrapPart, randomBytes, toB64url, newHolderKey, qrSvg, MAX_FILE_BYTES } from '/assets/sealed.js';

// ---------- navigation ----------
const VIEWS = { overview: 'COMMAND CENTER', seal: 'SEAL A FILE', seals: 'MY SEALS', visual: 'VISUAL SHARES', exam: 'EXAM MODE' };
function showView(view, focus = false) {
  if (!VIEWS[view]) view = 'overview';
  for (const name of Object.keys(VIEWS)) $('view-' + name).classList.toggle('hidden', name !== view);
  for (const b of document.querySelectorAll('[data-view]')) b.toggleAttribute('aria-current', b.dataset.view === view), b.dataset.view === view && b.setAttribute('aria-current', 'page');
  $('crumb').textContent = VIEWS[view];
  if (view === 'seals') renderSeals();
  if (focus) { scrollTo(0, 0); $('view-' + view).querySelector('h1')?.focus({ preventScroll: true }); }
}
for (const b of document.querySelectorAll('[data-view]')) b.onclick = () => { location.hash = b.dataset.view; };
addEventListener('hashchange', () => showView(location.hash.slice(1), true));

// ---------- local seal list (owner tokens never leave this browser) ----------
const KEY = 'sealed-paper:mine';
const mine = () => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } };
const saveMine = (list) => { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { toast('Browser storage is blocked; keep the share link safe.'); } };

// ---------- live chain status ----------
let cfg;
async function chainTick() {
  try {
    cfg ||= await config();
    $('sideContract').textContent = cfg.contract || 'not configured'; $('sideOps').textContent = cfg.operator || '—';
    const r = await api('/api/chain');
    if (!r.ok) throw new Error(r.body.error);
    $('sideSeals').textContent = r.body.config.seal_count; $('lastSync').textContent = utcText(Date.parse(r.body.at));
    $('chainState').textContent = 'CHAIN: ONLINE'; $('chainDot').className = 'dot ok';
    $('net').textContent = 'NEAR testnet · live'; $('net').className = 'badge ok';
  } catch { $('chainState').textContent = 'CHAIN: DEGRADED'; $('chainDot').className = 'dot warn'; $('net').textContent = 'NEAR testnet · degraded'; $('net').className = 'badge warn'; }
}
chainTick(); setInterval(() => !document.hidden && chainTick(), 10000);

// ---------- NEAR account lookup ----------
const ACCOUNT_RE = /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/;
const validAccount = (id) => id.length >= 2 && id.length <= 64 && ACCOUNT_RE.test(id);
const lookups = new Map();
function lookup(id) {
  if (!lookups.has(id)) lookups.set(id, api(`/api/accounts/${encodeURIComponent(id)}`).then((r) => (r.ok ? r.body : { accountId: id, error: r.body.error })).catch(() => ({ accountId: id, error: 'lookup failed' })));
  return lookups.get(id);
}
function describe(info) {
  if (info.error) return { ok: false, text: `${info.accountId}: ${info.error}` };
  if (!info.exists) return { ok: false, text: `✕ ${info.accountId} does not exist on NEAR testnet` };
  return { ok: true, text: `✓ ${info.accountId} · ${info.balanceNear} NEAR · ${info.fullAccessKeys} full-access key${info.fullAccessKeys === 1 ? '' : 's'}${info.hasContract ? ' · has a contract' : ''}` };
}
function debounce(fn, ms = 400) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
async function showLookup(target, id) {
  if (!id) { target.textContent = ''; target.className = 'resolve'; return; }
  if (!validAccount(id)) { target.textContent = `✕ "${id}" is not a valid NEAR account id`; target.className = 'resolve bad'; return; }
  target.textContent = `Looking up ${id}…`; target.className = 'resolve';
  const d = describe(await lookup(id)); target.textContent = d.text; target.className = 'resolve ' + (d.ok ? 'ok' : 'bad');
}
const viewerList = () => [...new Set($('viewers').value.split(/[\s,;]+/).map((v) => v.trim().toLowerCase()).filter(Boolean))];
$('viewers').oninput = debounce(async () => {
  const ids = viewerList();
  $('viewerCheck').replaceChildren(...ids.map((id) => { const p = el('p', { class: 'resolve' }); void showLookup(p, id); return p; }));
});

// ---------- seal form ----------
let mode = 'split';
const pad = (n) => String(n).padStart(2, '0');
function setUnlockIn(minutes) {
  const d = new Date(Date.now() + minutes * 60000); d.setMilliseconds(0);
  $('tz').value = 'local';
  $('unlockAt').value = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  previewUnlock();
}
/** Interpret the datetime-local value in the chosen zone. */
function unlockMs() {
  const v = $('unlockAt').value; if (!v) return NaN;
  const [date, time] = v.split('T'); const [y, mo, d] = date.split('-').map(Number); const [h, mi, s = 0] = time.split(':').map(Number);
  if ($('tz').value === 'local') return new Date(y, mo - 1, d, h, mi, s).getTime();
  const offset = $('tz').value === 'Asia/Kolkata' ? 330 : 0;
  return Date.UTC(y, mo - 1, d, h, mi, s) - offset * 60000;
}
function previewUnlock() {
  const ms = unlockMs();
  $('unlockPreview').textContent = Number.isFinite(ms) ? `Unlocks ${istText(ms)} · ${utcText(ms)} · in ${countdown(ms - Date.now())}` : '';
}
for (const b of document.querySelectorAll('.quick')) b.onclick = () => setUnlockIn(Number(b.dataset.min));
$('unlockAt').oninput = previewUnlock; $('tz').onchange = previewUnlock;
setUnlockIn(10);

function renderHolders() {
  const n = Math.min(Math.max(Number($('n').value) || 2, 2), 20);
  const k = Math.min(Math.max(Number($('k').value) || 1, 1), n);
  $('kHint').textContent = `${k} of ${n}: any ${k} holder${k === 1 ? '' : 's'} can unlock after the time; ${k - 1 || 'no'} holder${k - 1 === 1 ? '' : 's'} alone learn${k - 1 === 1 ? 's' : ''} nothing.`;
  const rows = [...$('holders').children];
  while (rows.length < n) {
    const i = rows.length;
    const row = el('fieldset', { class: 'holder-row' }, el('legend', { text: `Holder ${i + 1}` }),
      el('input', { 'aria-label': `Holder ${i + 1} name`, placeholder: 'Name or office', class: 'h-label', maxlength: 80, value: ['Controller', 'Principal', 'Invigilator', 'Trustee', 'Auditor', 'Registrar', 'Dean'][i] || `Holder ${i + 1}` }),
      el('input', { 'aria-label': `Holder ${i + 1} email`, placeholder: 'Email (optional)', type: 'email', class: 'h-email' }),
      el('input', { 'aria-label': `Holder ${i + 1} phone`, placeholder: 'WhatsApp (optional)', type: 'tel', class: 'h-phone' }),
      el('input', { 'aria-label': `Holder ${i + 1} own NEAR account`, placeholder: 'Own NEAR account, e.g. kanth.testnet', class: 'h-near', autocomplete: 'off', spellcheck: 'false' }),
      el('p', { class: 'resolve', text: 'No NEAR account: the app creates a testnet account and puts its key in the holder link.' }));
    const nearInput = row.querySelector('.h-near'), note = row.querySelector('.resolve');
    nearInput.oninput = debounce(() => {
      const id = nearInput.value.trim().toLowerCase();
      if (!id) { note.className = 'resolve'; note.textContent = 'No NEAR account: the app creates a testnet account and puts its key in the holder link.'; return; }
      void showLookup(note, id);
    });
    $('holders').append(row); rows.push(row);
  }
  rows.forEach((r, i) => r.classList.toggle('hidden', i >= n));
}
for (const b of document.querySelectorAll('.preset')) b.onclick = () => { $('n').value = b.dataset.n; $('k').value = b.dataset.k; renderHolders(); };
$('n').oninput = $('k').oninput = renderHolders; renderHolders();
for (const r of document.querySelectorAll('input[name=mode]')) r.onchange = () => { mode = r.value; $('splitBox').classList.toggle('hidden', mode !== 'split'); };
$('file').onchange = () => {
  const f = $('file').files[0];
  $('fileInfo').textContent = f ? `${f.name} · ${f.type || 'unknown type'} · ${bytesText(f.size)}${f.size > MAX_FILE_BYTES ? ' · too large (100 MB max)' : ''}` : 'Nothing chosen.';
  if (f && !$('label').value) $('label').value = f.name.replace(/\.[^.]+$/, '').slice(0, 120);
};
config().then((c) => { if (c.createTokenRequired) { $('createToken').classList.remove('hidden'); $('createTokenLabel').classList.remove('hidden'); } });

$('sealForm').onsubmit = async (e) => {
  e.preventDefault();
  const btn = $('sealBtn'), status = (t) => { $('sealStatus').textContent = t; };
  btn.disabled = true;
  try {
    const f = $('file').files[0];
    if (!f) throw new Error('Choose a file to seal');
    if (f.size > MAX_FILE_BYTES) throw new Error('Files are limited to 100 MB');
    const unlockAtMs = unlockMs();
    if (!Number.isFinite(unlockAtMs) || unlockAtMs < Date.now() + 30_000) throw new Error('Choose an unlock time at least 30 seconds ahead');
    const label = $('label').value.trim() || f.name;
    status('Encrypting in your browser…');
    const { sealed, key, hash } = await encryptFile(new Uint8Array(await f.arrayBuffer()), { name: f.name, type: f.type });
    const viewers = viewerList();
    for (const id of viewers) { const d = describe(await lookup(id)); if (!d.ok) throw new Error(`Who can open: ${d.text.replace(/^✕ /, '')}`); }
    const meta = { label, unlockAtMs, mode, fileHash: hash, viewers, owner: { email: $('ownerEmail').value, phone: $('ownerPhone').value } };
    let holderSecrets = [];
    if (mode === 'single') meta.fileKey = toB64url(key);
    else {
      const n = Number($('n').value), k = Number($('k').value);
      if (!(n >= 2 && n <= 20 && k >= 1 && k <= n)) throw new Error('Choose N from 2 to 20 and K from 1 to N');
      status(`Splitting the key into ${n} parts…`);
      const parts = await splitKey(key, n, k), wrapKey = randomBytes(32);
      const rows = [...$('holders').children].slice(0, n);
      const own = rows.map((r) => r.querySelector('.h-near').value.trim().toLowerCase());
      for (const id of own.filter(Boolean)) { const d = describe(await lookup(id)); if (!d.ok) throw new Error(`Holder account: ${d.text.replace(/^✕ /, '')}`); }
      if (new Set(own.filter(Boolean)).size !== own.filter(Boolean).length) throw new Error('Each holder needs a different NEAR account');
      holderSecrets = await Promise.all(parts.map(async (p, i) => {
        // Own account: the holder signs with their wallet. Otherwise the app creates a testnet account for them.
        const hk = own[i] ? { account: own[i], secretKey: null, own: true } : { ...newHolderKey(), own: false };
        const wrapped = await wrapPart(wrapKey, p.part, hk.account);
        const r = rows[i];
        return { ...hk, wrapped, label: r.querySelector('.h-label').value.trim() || `Holder ${i + 1}`, email: r.querySelector('.h-email').value.trim(), phone: r.querySelector('.h-phone').value.trim() };
      }));
      const { sha256Hex } = await import('/assets/sealed.js');
      meta.n = n; meta.k = k; meta.wrapKey = toB64url(wrapKey);
      meta.holders = await Promise.all(holderSecrets.map(async (h) => ({ account: h.account, own: h.own, commitment: await sha256Hex(new TextEncoder().encode(h.wrapped)), label: h.label, contact: { email: h.email, phone: h.phone } })));
    }
    key.fill(0);
    status(`Uploading ${bytesText(sealed.length)} encrypted and locking on NEAR…`);
    const headers = { 'content-type': 'application/octet-stream', 'x-seal-meta': toB64url(new TextEncoder().encode(JSON.stringify(meta))) };
    if ($('createToken').value) headers['x-create-token'] = $('createToken').value;
    const r = await api('/api/seals', { method: 'POST', headers, body: sealed });
    if (!r.ok) throw new Error(r.body.error || 'Sealing failed');
    const seal = { sealId: r.body.sealId, ownerToken: r.body.ownerToken, label, unlockAtMs, mode, k: meta.k || 0, n: meta.n || 0, createTx: r.body.createTx, fileName: f.name, size: f.size, createdAt: Date.now(), viewers };
    saveMine([seal, ...mine()]);
    showSealed(seal, holderSecrets);
    status(''); renderOverview();
  } catch (err) { status(''); toast('Could not seal: ' + err.message, 6000); }
  finally { btn.disabled = false; }
};

function holderLink(seal, h) {
  const secret = toB64url(new TextEncoder().encode(JSON.stringify(h.own ? { a: h.account, w: h.wrapped, l: h.label, o: 1 } : { a: h.account, s: h.secretKey, w: h.wrapped, l: h.label })));
  return `${location.origin}/h/${seal.sealId}#${secret}`;
}
function showSealed(seal, holders) {
  $('sealForm').classList.add('hidden'); $('sealed').classList.remove('hidden');
  $('sealedTitle').textContent = seal.label;
  $('sealedSummary').replaceChildren(`Locked until ${istText(seal.unlockAtMs)} (${utcText(seal.unlockAtMs)}). `,
    seal.mode === 'split' ? `${seal.k} of ${seal.n} key holders must release their parts after that time. ` : 'Opens by time alone. ',
    seal.viewers?.length ? `Only ${seal.viewers.join(', ')} can open it, after proving their account. ` : 'Anyone with the link can open it after that. ',
    el('a', { href: `${EXPLORER}/txns/${seal.createTx}`, target: '_blank', rel: 'noopener' }, 'View on NEAR testnet →'));
  $('shareBox').replaceChildren(shareButtons(seal, { qr: qrSvg }));
  $('holderLinks').classList.toggle('hidden', !holders.length);
  $('holderList').replaceChildren(...holders.map((h) => {
    const link = holderLink(seal, h);
    const msg = `You hold key part for "${seal.label}". It can be released only after ${istText(seal.unlockAtMs)}. Keep this link private: ${link}`;
    return el('li', {}, el('b', { text: h.label }), el('p', { class: 'muted', text: h.own ? `Signs with their own NEAR account: ${h.account}` : 'App-created testnet account (key inside the link)' }), el('code', { class: 'link-preview', text: link.slice(0, 64) + '…' }),
      el('div', { class: 'share-row' }, el('button', { type: 'button', class: 'secondary', onclick: () => copy(link, 'Holder link') }, 'Copy'),
        el('a', { class: 'btn ghost', target: '_blank', rel: 'noopener', href: whatsappUrl(msg, h.phone) }, 'WhatsApp'),
        el('a', { class: 'btn ghost', href: mailtoUrl(h.email, `Your key part: ${seal.label}`, msg) }, 'Email'),
        el('a', { class: 'btn ghost', href: link, target: '_blank', rel: 'noopener' }, 'Open')));
  }));
  $('sealed').append(el('div', { class: 'row' }, el('button', { type: 'button', onclick: () => { $('sealed').classList.add('hidden'); $('sealForm').classList.remove('hidden'); $('sealForm').reset(); renderHolders(); setUnlockIn(10); $('sealed').querySelector('.row:last-child')?.remove(); } }, 'Seal another file'),
    el('button', { type: 'button', class: 'secondary', onclick: () => { location.hash = 'seals'; } }, 'Go to my seals')));
}

// ---------- my seals ----------
async function renderSeals() {
  const list = mine();
  if (!list.length) return $('sealCards').replaceChildren(el('p', { class: 'muted', text: 'No seals yet. Seal a file first.' }));
  $('sealCards').replaceChildren(...list.map((seal) => {
    const card = el('section', { class: 'card seal-card', 'data-id': seal.sealId },
      el('div', { class: 'day-head' }, el('h2', { text: seal.label }), el('span', { class: 'badge', 'data-badge': '' }, '…')),
      el('p', { class: 'countdown-sm', 'data-count': '' }),
      el('p', { class: 'muted', text: `${seal.mode === 'split' ? `${seal.k} of ${seal.n} holders` : 'Single lock'} · ${seal.fileName || ''} · ${bytesText(seal.size || 0)} · unlocks ${istText(seal.unlockAtMs)}` }),
      el('div', { class: 'progress', 'data-progress': '' }),
      shareButtons(seal, { qr: qrSvg }),
      el('div', { class: 'row' }, el('a', { class: 'btn', href: `/s/${seal.sealId}`, target: '_blank', rel: 'noopener' }, 'Open page'), el('a', { class: 'btn ghost', href: `/verify?id=${seal.sealId}`, target: '_blank', rel: 'noopener' }, 'Verify'),
        el('a', { class: 'btn ghost', href: `${EXPLORER}/txns/${seal.createTx}`, target: '_blank', rel: 'noopener' }, 'Create tx')),
      el('details', {}, el('summary', { text: 'Alerts' }), el('ol', { class: 'activity', 'data-alerts': '' }, el('li', { class: 'muted', text: 'Loading…' }))),
      el('details', {}, el('summary', { text: 'On-chain access log' }), el('ol', { class: 'activity', 'data-log': '' }, el('li', { class: 'muted', text: 'Loading…' }))));
    void fillSeal(card, seal);
    return card;
  }));
}
async function fillSeal(card, seal) {
  const [s, a, l] = await Promise.all([api(`/api/seals/${seal.sealId}`), api(`/api/seals/${seal.sealId}/alerts?token=${encodeURIComponent(seal.ownerToken)}`), api(`/api/seals/${seal.sealId}/log`)]);
  if (s.ok && seal.mode === 'split') card.querySelector('[data-progress]').replaceChildren(...Array.from({ length: seal.n }, (_, i) => el('span', { class: 'pip' + (i < (s.body.chain?.released || 0) ? ' on' : ''), title: `part ${i + 1}` })), el('small', { text: ` ${s.body.chain?.released || 0} of ${seal.k} needed parts released` }));
  card.querySelector('[data-alerts]').replaceChildren(...(a.ok && a.body.alerts.length ? a.body.alerts.map(alertItem) : [el('li', { class: 'muted', text: 'No alerts.' })]));
  card.querySelector('[data-log]').replaceChildren(...(l.ok && l.body.log.length ? l.body.log.slice().reverse().map((e) => el('li', {}, el('time', { text: utcText(Number(e.at_ms)) }), el('p', {}, el('span', { class: 'accent', text: e.kind.toUpperCase() }), ` · ${short(e.account, 8)}`))) : [el('li', { class: 'muted', text: 'No entries.' })]));
}
function alertItem(a) {
  const loc = a.location?.city ? `${a.location.city}, ${a.location.region || ''} ${a.location.country || ''}` : a.location?.source === 'gps-consented' ? `GPS ${a.location.lat}, ${a.location.lon} (shared by visitor)` : a.location?.note || a.location?.source || 'unknown';
  return el('li', { class: 'alert-item' }, el('time', { text: `${a.atIst} · ${utcText(Date.parse(a.at))}` }),
    el('p', {}, el('span', { class: 'accent', text: a.kind.replace(/_/g, ' ').toUpperCase() }), ' ', a.summary),
    el('p', { class: 'muted', text: `${a.device.browser} on ${a.device.os} · approx. location: ${loc}${a.account ? ' · account ' + short(a.account, 6) : ''}` }),
    el('p', { class: 'muted' }, a.chain?.status === 'recorded' ? el('a', { href: `${EXPLORER}/txns/${a.chain.tx}`, target: '_blank', rel: 'noopener' }, 'Alert hash on NEAR →') : `On-chain: ${a.chain?.status || 'pending'}`));
}
setInterval(() => {
  for (const card of document.querySelectorAll('.seal-card')) {
    const seal = mine().find((s) => s.sealId === card.dataset.id); if (!seal) continue;
    const left = seal.unlockAtMs - Date.now();
    card.querySelector('[data-count]').textContent = left > 0 ? `LOCKED · ${countdown(left)}` : 'TIME REACHED';
    const b = card.querySelector('[data-badge]'); b.textContent = left > 0 ? 'Locked' : 'Unlockable'; b.className = 'badge ' + (left > 0 ? 'warn' : 'ok');
  }
}, 1000);

// ---------- command center ----------
async function renderOverview() {
  const list = mine(), now = Date.now();
  const locked = list.filter((s) => s.unlockAtMs > now);
  $('oTotal').textContent = list.length; $('oLocked').textContent = locked.length; $('oOpen').textContent = list.length - locked.length;
  $('oList').replaceChildren(...(list.length ? list.slice(0, 5).map((s) => el('li', {}, el('span', { class: 'dot ' + (s.unlockAtMs > now ? 'warn' : 'ok') }),
    el('span', {}, el('b', { text: s.label }), el('small', { text: `${s.mode === 'split' ? `${s.k} of ${s.n}` : 'single'} · ${s.unlockAtMs > now ? 'locked' : 'time reached'} · ${localText(s.unlockAtMs)}` })))) : [el('li', { class: 'muted', text: 'No seals on this device yet.' })]));
  const alerts = (await Promise.all(list.slice(0, 10).map((s) => api(`/api/seals/${s.sealId}/alerts?token=${encodeURIComponent(s.ownerToken)}`).then((r) => r.ok ? r.body.alerts.map((a) => ({ ...a, label: s.label })) : [])))).flat()
    .sort((a, b) => b.at.localeCompare(a.at)).slice(0, 12);
  $('oAlerts').replaceChildren(...(alerts.length ? alerts.map((a) => el('li', {}, el('time', { text: a.atIst }), el('p', {}, el('span', { class: 'accent', text: a.kind.replace(/_/g, ' ').toUpperCase() }), ` · ${a.label}`))) : [el('li', { class: 'muted', text: 'No alerts yet.' })]));
  const kinds = (k) => alerts.filter((a) => a.kind === k).length;
  $('oInfo').replaceChildren(...[['Refused', 'head'], ['Early open attempts', kinds('early_open')], ['Early releases', kinds('early_release')], ['Non-holder attempts', kinds('not_holder')],
    ['Integrity', 'bad'], ['Wrong keys', kinds('wrong_key')], ['Tampered files', kinds('file_tampered')], ['Escalations', kinds('repeated_failures')]].map(([k, v]) => {
    if (v === 'head' || v === 'bad') return el('p', { class: 'info-head' + (v === 'bad' ? ' bad' : '') }, el('span', { class: 'dot' }), ' ' + k);
    return el('p', {}, el('span', { text: k }), el('b', { text: String(v) }));
  }));
}
function tickNext() {
  const next = mine().filter((s) => s.unlockAtMs > Date.now()).sort((a, b) => a.unlockAtMs - b.unlockAtMs)[0];
  $('oNext').textContent = next ? countdown(next.unlockAtMs - Date.now()) : '—';
  $('oNextLabel').textContent = next ? `${next.label} · ${istText(next.unlockAtMs)}` : 'Nothing scheduled';
}
renderOverview(); tickNext(); setInterval(tickNext, 1000); setInterval(() => !document.hidden && renderOverview(), 15000);

// ---------- visual shares demo ----------
let visual;
$('visualFile').onchange = () => { $('visualSplit').disabled = !$('visualFile').files[0]; $('visualMerge').disabled = true; };
$('visualSplit').onclick = async () => {
  const img = await imageData($('visualFile').files[0]);
  const n = Math.min(Math.max(Number($('visualN').value) || 3, 2), 7);
  visual = visualShares(img, n);
  $('visualStage').replaceChildren(el('div', { class: 'share-grid-v' }, ...visual.map((s, i) => el('figure', {}, canvasOf(s), el('figcaption', { text: `Share ${i + 1}` })))));
  $('visualMerge').disabled = false;
};
$('visualMerge').onclick = () => visual && animateReveal($('visualStage'), visual, `All ${visual.length} shares combined`);

// Initial view last, after every module-level binding above exists.
showView(location.hash.slice(1));
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
