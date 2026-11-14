// Tamper and break-in alerts. Full records (with approximate location) stay off-chain;
// only each record's SHA-256 is written on-chain with record_alert.
import { createHash, randomBytes } from 'node:crypto';

export const ALERT_KINDS = {
  early_open: 'Someone attempted to open the file too early',
  early_release: 'A trusted person attempted to say yes too early',
  not_holder: 'Someone who is not a trusted person attempted to unlock it',
  wrong_key: 'A wrong key was used, so nothing was opened',
  file_tampered: 'The file was changed after it was locked',
  repeated_failures: 'Many failed attempts in a row from the same place',
  not_allowed: 'Someone who is not allowed attempted to open the file',
};

// ---------- approximate location from IP ----------
const PRIVATE_IP = /^(::1|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::ffff:127\.|::ffff:10\.|::ffff:192\.168\.|fc|fd|fe80)/i;
export function createGeo(env = process.env, { fetcher = fetch } = {}) {
  // GEOIP_URL: HTTPS lookup template containing {ip}, returning country/region/city JSON. Unset means no IP location.
  const template = env.GEOIP_URL || '';
  const cache = new Map();
  return async function locate(ip) {
    if (!ip) return { source: 'none' };
    if (PRIVATE_IP.test(ip)) return { source: 'private-network', note: 'Local or private network address; no public location', approximate: true };
    if (!/^https:\/\/\S*\{ip\}/.test(template)) return { source: 'disabled' };
    if (cache.has(ip)) return cache.get(ip);
    try {
      const url = template.replace('{ip}', encodeURIComponent(ip));
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
export function createNotifier(env = process.env, { fetcher = fetch } = {}) {
  // Without provider keys nothing is sent; the alert still appears in the owner's feed.
  async function email(to, subject, text) {
    if (!env.RESEND_API_KEY || !env.ALERT_EMAIL_FROM) return { channel: 'email', to, status: 'not_configured' };
    const r = await fetcher('https://api.resend.com/emails', { method: 'POST', signal: AbortSignal.timeout(8000),
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: env.ALERT_EMAIL_FROM, to: [to], subject, text }) });
    return { channel: 'email', to, provider: 'resend', ok: r.ok };
  }
  // WhatsApp / SMS via Twilio when configured.
  async function message(channel, to, text) {
    if (env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_FROM) {
      const from = channel === 'whatsapp' ? `whatsapp:${env.TWILIO_FROM}` : env.TWILIO_FROM;
      const dest = channel === 'whatsapp' ? `whatsapp:${to}` : to;
      const r = await fetcher(`https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`, { method: 'POST', signal: AbortSignal.timeout(8000),
        headers: { authorization: 'Basic ' + Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString('base64'), 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ From: from, To: dest, Body: text }) });
      return { channel, to, provider: 'twilio', ok: r.ok };
    }
    return { channel, to, status: 'not_configured' };
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
export function createAlerts({ store, chain, geo, notify, kv = null, now = () => new Date(), windowMs = 120_000, escalateAt = 5, awaitBackground = false }) {
  const failures = new Map();
  async function countFailure(key) {
    if (kv) return kv.incr(`fail:${key}:${Math.floor(now().getTime() / windowMs)}`, Math.ceil(windowMs / 1000) + 1);
    const t = now().getTime(); const list = (failures.get(key) || []).filter((x) => t - x < windowMs);
    list.push(t); failures.set(key, list);
    if (failures.size > 5000) failures.clear();
    return list.length;
  }
  async function createAlert({ sealId, kind, ip, userAgent, account = null, gps = null, detail = null, escalated = false }) {
    if (!ALERT_KINDS[kind]) throw new Error('Unknown alert kind');
    const meta = await store.readMeta(sealId);
    if (!meta) throw new Error('Unknown seal');
    const at = now();
    const location = gps && Number.isFinite(gps.lat) && Number.isFinite(gps.lon)
      ? { source: 'gps-consented', lat: Math.round(gps.lat * 1e5) / 1e5, lon: Math.round(gps.lon * 1e5) / 1e5, accuracyM: Math.round(gps.accuracy || 0) }
      : await geo(ip);
    const record = { id: randomBytes(9).toString('base64url'), sealId, kind, summary: ALERT_KINDS[kind], at: at.toISOString(), atIst: istTime(at),
      account, device: deviceFrom(userAgent), location, detail: detail ? String(detail).slice(0, 300) : null };
    const hash = alertHash(record);
    await store.appendAlert(sealId, { ...record, hash, chain: { status: 'pending' }, notified: [] });
    // Anchor and notify. Locally this runs after the response; serverless functions may be
    // frozen once they respond, so there it is awaited.
    const background = (async () => {
      let chainState;
      try {
        const r = await chain.recordAlert(sealId, hash, kind); chainState = { status: 'recorded', tx: r.txHash, index: r.value };
        await store.recordActivity?.({ at: new Date().toISOString(), sealId, kind: `alert:${kind}`, tx: r.txHash });
      }
      catch (e) { chainState = { status: 'failed', error: e.message.slice(0, 200) }; }
      const where = location.city ? `${location.city}, ${location.region || ''} ${location.country || ''}`.trim() : location.source === 'gps-consented' ? `GPS ${location.lat}, ${location.lon}` : 'unknown';
      const text = [`${record.summary}.`, `Seal: ${meta.label} (${sealId})`, `Time: ${record.atIst} / ${record.at} UTC`,
        `Account: ${account || 'none'}`, `Device: ${record.device.browser} on ${record.device.os}`, `Approximate location: ${where}`].join('\n');
      const notified = await notify(meta.alertContacts || [], `Sealed Paper alert: ${ALERT_KINDS[kind]}`, text).catch(() => []);
      await store.updateAlert(sealId, record.id, { chain: chainState, notified });
    })();
    if (awaitBackground) await background;
    const key = `${sealId}|${ip || account || 'unknown'}`;
    if (!escalated && (await countFailure(key)) === escalateAt) {
      await createAlert({ sealId, kind: 'repeated_failures', ip, userAgent, account, detail: `${escalateAt} failed attempts within ${windowMs / 60000} minutes`, escalated: true });
    }
    return { ...record, hash };
  }
  return { createAlert };
}
