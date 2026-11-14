// Shared browser helpers for Sealed Paper pages.
export const $ = (id) => document.getElementById(id);

export async function api(path, opts = {}) {
  const r = await fetch(path, { cache: 'no-store', ...opts });
  const type = r.headers.get('content-type') || '';
  const body = type.includes('json') ? await r.json() : await r.arrayBuffer();
  return { ok: r.ok, status: r.status, body };
}
let configP;
export const config = () => (configP ||= api('/api/config').then((r) => r.body));
/** Block explorer base URL from the server's configuration (NEAR_EXPLORER_URL). */
export const explorer = async () => (await config()).explorer;

export function el(tag, attrs = {}, ...children) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') n.className = v; else if (k === 'text') n.textContent = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else n.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c !== null && c !== undefined) n.append(c);
  return n;
}

export function toast(msg, ms = 3500) {
  document.querySelector('.toast')?.remove();
  const t = el('div', { class: 'toast', role: 'status', text: msg }); document.body.append(t);
  setTimeout(() => t.remove(), ms);
}

export const utcText = (ms) => new Date(ms).toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
export const istText = (ms) => new Date(ms).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: false, day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' IST';
export const localText = (ms) => new Date(ms).toLocaleString([], { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
export function countdown(ms) {
  if (ms <= 0) return '00:00:00';
  const s = Math.floor(ms / 1000), d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60), sec = s % 60;
  const hms = [h, m, sec].map((x) => String(x).padStart(2, '0')).join(':');
  return d ? `${d}d ${hms}` : hms;
}
export const bytesText = (n) => n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : n > 1024 ? (n / 1024).toFixed(1) + ' KB' : n + ' B';
export const short = (s, n = 6) => !s ? '—' : s.length > n * 2 + 1 ? `${s.slice(0, n)}…${s.slice(-n)}` : s;

// ---------- sharing ----------
export const shareUrl = (sealId) => `${location.origin}/s/${sealId}`;
export function shareText(seal) {
  return `"${seal.label}" is locked until ${istText(seal.unlockAtMs)}. Nobody can open it before then. Open it here at that time: ${shareUrl(seal.sealId)}`;
}
export const whatsappUrl = (text, phone) => `https://wa.me/${phone ? phone.replace(/[^0-9]/g, '') : ''}?text=${encodeURIComponent(text)}`;
export const mailtoUrl = (to, subject, body) => `mailto:${encodeURIComponent(to || '')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
export function icsFile(seal) {
  const stamp = (ms) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const esc = (s) => String(s).replace(/[\\,;]/g, (c) => '\\' + c).replace(/\n/g, '\\n');
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Sealed Paper//EN', 'BEGIN:VEVENT', `UID:${seal.sealId}@sealed-paper`, `DTSTAMP:${stamp(Date.now())}`,
    `DTSTART:${stamp(seal.unlockAtMs)}`, `DTEND:${stamp(seal.unlockAtMs + 15 * 60000)}`, `SUMMARY:${esc('Opens: ' + seal.label)}`,
    `DESCRIPTION:${esc(shareText(seal))}`, `URL:${shareUrl(seal.sealId)}`, 'BEGIN:VALARM', 'TRIGGER:-PT5M', 'ACTION:DISPLAY', 'DESCRIPTION:Sealed file unlocks in 5 minutes', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
}
export function download(name, data, type) {
  const a = el('a', { href: URL.createObjectURL(new Blob([data], { type })), download: name });
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
export async function copy(text, what = 'Link') {
  try { await navigator.clipboard.writeText(text); toast(`${what} copied`); } catch { prompt('Copy this:', text); }
}
/** .sealed document: the encrypted file plus the seal reference. Useless before unlock. */
export async function sealedDocument(seal) {
  const r = await api(`/api/seals/${seal.sealId}/file`);
  const b64 = btoa(Array.from(new Uint8Array(r.body), (c) => String.fromCharCode(c)).join(''));
  return JSON.stringify({ format: 'sealed-paper/1', sealId: seal.sealId, origin: location.origin, label: seal.label, unlockAtMs: seal.unlockAtMs, encrypted: b64 });
}

export function shareButtons(seal, { qr } = {}) {
  const text = shareText(seal), url = shareUrl(seal.sealId);
  const wrap = el('div', { class: 'share-row' },
    el('button', { type: 'button', class: 'secondary', onclick: () => copy(url) }, 'Copy link'),
    el('a', { class: 'btn ghost', href: whatsappUrl(text), target: '_blank', rel: 'noopener' }, 'WhatsApp'),
    el('a', { class: 'btn ghost', href: mailtoUrl('', `Locked until ${istText(seal.unlockAtMs)}: ${seal.label}`, text) }, 'Email'),
    el('button', { type: 'button', class: 'secondary', onclick: () => download(`${seal.sealId}.ics`, icsFile(seal), 'text/calendar') }, 'Add to calendar'),
    navigator.share ? el('button', { type: 'button', class: 'secondary', onclick: () => navigator.share({ title: seal.label, text, url }).catch(() => {}) }, 'More ways to share') : null,
    el('button', { type: 'button', class: 'secondary', onclick: async () => download(`${seal.sealId}.sealed`, await sealedDocument(seal), 'application/json') }, 'Download locked copy'),
  );
  if (qr) {
    const box = el('div', { class: 'qr-box' }); box.innerHTML = qr(url, 4);
    const qrWrap = el('div', { class: 'qr-wrap' }, box, el('button', { type: 'button', class: 'secondary', onclick: () => printQr(seal, qr(url, 8)) }, 'Print QR code'));
    return el('div', { class: 'share-block' }, wrap, qrWrap);
  }
  return wrap;
}
function printQr(seal, svg) {
  const w = window.open('', '_blank', 'width=480,height=640');
  if (!w) return toast('Allow pop-ups to print the QR code');
  w.document.write(`<!doctype html><title>${seal.label.replace(/</g, '&lt;')}</title><body style="font-family:sans-serif;text-align:center;padding:24px"><h2>${seal.label.replace(/</g, '&lt;')}</h2><p>Locked until ${istText(seal.unlockAtMs)}. Scan to open it then.</p><div style="width:320px;margin:auto">${svg}</div><p>${shareUrl(seal.sealId)}</p></body>`);
  w.document.close(); w.print();
}

// ---------- plain-language names for the public record ----------
const LOG_WORDS = {
  create: 'File locked', 'release:released': 'A trusted person said yes', 'release:early': 'A trusted person attempted too early (blocked)',
  'release:not_holder': 'Someone not on the list attempted (blocked)', 'release:already_released': 'The same person said yes again',
  'release:bad_commitment': 'A wrong key piece was used (blocked)', 'release:single_mode': 'Not needed for this file',
  'open:early': 'Someone attempted to open it too early (blocked)', 'open:awaiting_parts': 'Someone attempted to open it (waiting for people)', 'open:open': 'The file was opened',
  'alert:early_open': 'Owner told: early opening attempt', 'alert:early_release': 'Owner told: early yes', 'alert:not_holder': 'Owner told: stranger attempted',
  'alert:not_allowed': 'Owner told: someone not allowed attempted', 'alert:wrong_key': 'Owner told: wrong key', 'alert:file_tampered': 'Owner told: file was changed',
  'alert:repeated_failures': 'Owner told: many attempts in a row', 'alert:leak_report': 'Leak report saved', 'alert:exam_audit': 'Exam check saved',
};
export const plainLog = (kind) => LOG_WORDS[kind] || kind;
const ALERT_WORDS = { early_open: 'Attempted to open too early', early_release: 'Trusted person attempted too early', not_holder: 'Stranger attempted to unlock',
  not_allowed: 'Someone not allowed attempted', wrong_key: 'Wrong key used', file_tampered: 'File was changed', repeated_failures: 'Many attempts in a row' };
export const plainAlert = (kind) => ALERT_WORDS[kind] || kind;
