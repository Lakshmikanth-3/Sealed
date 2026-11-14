// Tamper and break-in alerts. Full records (with approximate location) stay off-chain;
// only each record's SHA-256 is written on-chain with record_alert.
import { createHash, randomBytes } from 'node:crypto';

export const ALERT_KINDS = {
  early_open: 'Someone tried to open the file before the unlock time',
  early_release: 'A key holder tried to release their part before the unlock time',
  not_holder: 'An account that is not a key holder tried to release a part',
  wrong_key: 'A wrong key or key part was used (decryption authentication failed)',
  file_tampered: 'The stored encrypted file does not match the hash on NEAR',
  repeated_failures: 'Repeated failed attempts from the same source',
  not_allowed: 'A NEAR account that is not on the allow-list tried to open the file',
};

// ---------- approximate location from IP ----------
const PRIVATE_IP = /^(::1|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::ffff:127\.|::ffff:10\.|::ffff:192\.168\.|fc|fd|fe80)/i;
export function createGeo(env = process.env, { fetcher = fetch } = {}) {
  const provider = env.GEOIP_PROVIDER || 'ipapi';
  const cache = new Map();
  return async function locate(ip) {
    if (!ip) return { source: 'none' };
    if (provider === 'mock') return { source: 'mock', country: 'India', region: 'Tamil Nadu', city: 'Chennai', approximate: true };
    if (PRIVATE_IP.test(ip)) return { source: 'private-network', note: 'Local or private network address; no public location', approximate: true };
    if (provider === 'off') return { source: 'disabled' };
    if (cache.has(ip)) return cache.get(ip);
    try {
      const url = (env.GEOIP_URL || 'https://ipapi.co/{ip}/json/').replace('{ip}', encodeURIComponent(ip));
      const r = await fetcher(url, { signal: AbortSignal.timeout(4000), headers: { 'user-agent': 'sealed-paper-alerts' } });
      const j = await r.json();
      const out = j.error || j.status === 'fail' ? { source: 'lookup-failed' }
        : { source: 'ip', country: j.country_name || j.country, region: j.region || j.regionName, city: j.city, approximate: true };
      if (cache.size > 1000) cache.clear();
      cache.set(ip, out);
      return out;
    } catch { return { source: 'lookup-failed' }; }
  };
}

// ---------- notification providers ----------
export function createNotifier(env = process.env, { fetcher = fetch, log = console.log } = {}) {
  async function email(to, subject, text) {
    if (!env.RESEND_API_KEY || !env.ALERT_EMAIL_FROM) { log(`[alert email → ${to}] ${subject}`); return { channel: 'email', to, provider: 'console' }; }
    const r = await fetcher('https://api.resend.com/emails', { method: 'POST', signal: AbortSignal.timeout(8000),
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: env.ALERT_EMAIL_FROM, to: [to], subject, text }) });
    return { channel: 'email', to, provider: 'resend', ok: r.ok };
  }
  // WhatsApp / SMS: pluggable. Twilio when configured; otherwise a console provider.
  async function message(channel, to, text) {
    if (env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_FROM) {
      const from = channel === 'whatsapp' ? `whatsapp:${env.TWILIO_FROM}` : env.TWILIO_FROM;
      const dest = channel === 'whatsapp' ? `whatsapp:${to}` : to;
      const r = await fetcher(`https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`, { method: 'POST', signal: AbortSignal.timeout(8000),
        headers: { authorization: 'Basic ' + Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString('base64'), 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ From: from, To: dest, Body: text }) });
      return { channel, to, provider: 'twilio', ok: r.ok };
    }
    log(`[alert ${channel} → ${to}] ${text.split('\n')[0]}`);
    return { channel, to, provider: 'console' };
  }
  return async function notify(contacts, subject, text) {
    const sent = [];
    for (const c of contacts) {
      try {
        if (c.email) sent.push(await email(c.email, subject, text));
        if (c.phone) sent.push(await message(c.whatsapp === false ? 'sms' : 'whatsapp', c.phone, `${subject}\n${text}`));
      } catch (e) { sent.push({ channel: 'error', error: e.message }); }
    }
    return sent;
  };
}

export const istTime = (d) => d.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: false }) + ' IST';
export const alertHash = (record) => createHash('sha256').update(JSON.stringify(record)).digest('hex');

export function deviceFrom(ua = '') {
  const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Unknown browser';
  const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : 'Unknown OS';
  return { browser, os, mobile: /Mobile|Android|iPhone/.test(ua) };
}

/**
 * Alert service. createAlert records, hashes, anchors and notifies; repeated failures from
 * one source within 2 minutes escalate once per window.
 */
export function createAlerts({ store, chain, geo, notify, now = () => new Date(), windowMs = 120_000, escalateAt = 5 }) {
  const failures = new Map();
  function countFailure(key) {
    const t = now().getTime(); const list = (failures.get(key) || []).filter((x) => t - x < windowMs);
    list.push(t); failures.set(key, list);
    if (failures.size > 5000) failures.clear();
    return list.length;
  }
  async function createAlert({ sealId, kind, ip, userAgent, account = null, gps = null, detail = null, escalated = false }) {
    if (!ALERT_KINDS[kind]) throw new Error('Unknown alert kind');
    const meta = store.readMeta(sealId);
    if (!meta) throw new Error('Unknown seal');
    const at = now();
    const location = gps && Number.isFinite(gps.lat) && Number.isFinite(gps.lon)
      ? { source: 'gps-consented', lat: Math.round(gps.lat * 1e5) / 1e5, lon: Math.round(gps.lon * 1e5) / 1e5, accuracyM: Math.round(gps.accuracy || 0) }
      : await geo(ip);
    const record = { id: randomBytes(9).toString('base64url'), sealId, kind, summary: ALERT_KINDS[kind], at: at.toISOString(), atIst: istTime(at),
      account, device: deviceFrom(userAgent), location, detail: detail ? String(detail).slice(0, 300) : null };
    const hash = alertHash(record);
    store.appendAlert(sealId, { ...record, hash, chain: { status: 'pending' }, notified: [] });
    // Anchor and notify without blocking the response.
    void (async () => {
      let chainState;
      try { const r = await chain.recordAlert(sealId, hash, kind); chainState = { status: 'recorded', tx: r.txHash, index: r.value }; }
      catch (e) { chainState = { status: 'failed', error: e.message.slice(0, 200) }; }
      const where = location.city ? `${location.city}, ${location.region || ''} ${location.country || ''}`.trim() : location.source === 'gps-consented' ? `GPS ${location.lat}, ${location.lon}` : 'unknown';
      const text = [`${record.summary}.`, `Seal: ${meta.label} (${sealId})`, `Time: ${record.atIst} / ${record.at} UTC`,
        `Account: ${account || 'none'}`, `Device: ${record.device.browser} on ${record.device.os}`, `Approximate location: ${where}`].join('\n');
      const notified = await notify(meta.alertContacts || [], `Sealed Paper alert: ${kind.replace('_', ' ')}`, text).catch(() => []);
      store.updateAlert(sealId, record.id, { chain: chainState, notified });
    })();
    const key = `${sealId}|${ip || account || 'unknown'}`;
    if (!escalated && countFailure(key) === escalateAt) {
      await createAlert({ sealId, kind: 'repeated_failures', ip, userAgent, account, detail: `${escalateAt} failed attempts within ${windowMs / 60000} minutes`, escalated: true });
    }
    return { ...record, hash };
  }
  return { createAlert };
}
