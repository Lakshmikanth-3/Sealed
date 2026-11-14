// Two-person live chat. Messages are encrypted in the browser with a key that only exists in the
// invite link (#k=...), so this server stores ciphertext it cannot read. The server does enforce:
// at most two people per chat, "opens at" times (ciphertext is withheld until then) and
// view-once (ciphertext is deleted once the other person has received it).
import crypto from 'node:crypto';

const ID_RE = /^[A-Za-z0-9_-]{16}$/;
const B64_RE = /^[A-Za-z0-9_-]+$/;
const MAX_CIPHER = 1_400_000;   // ~1 MB photo after base64
const ONLINE_MS = 12_000;
const TYPING_MS = 5_000;

const rid = (n) => crypto.randomBytes(n).toString('base64url').slice(0, Math.ceil(n * 4 / 3));
const hash = (t) => crypto.createHash('sha256').update(String(t)).digest('base64url');

export function createChat({ kv, now = Date.now }) {
  const metaKey = (id) => `chat:${id}:meta`, msgKey = (id) => `chat:${id}:msgs`, stKey = (id, m) => `chat:${id}:st:${m}`;

  async function member(id, token) {
    if (!ID_RE.test(id)) return { error: 'Chat not found', code: 404 };
    const meta = await kv.get(metaKey(id));
    if (!meta) return { error: 'Chat not found', code: 404 };
    const m = meta.members.find((x) => x.tokenHash === hash(token || ''));
    if (!m) return { error: 'You are not part of this chat', code: 403, meta };
    return { meta, m };
  }
  const checkName = (name) => typeof name === 'string' && name.length <= 400 && B64_RE.test(name);

  return {
    async create({ name }) {
      if (!checkName(name)) return { error: 'Bad name', code: 400 };
      const id = rid(12).slice(0, 16), token = rid(24), memberId = 'a';
      await kv.set(metaKey(id), { createdAt: now(), members: [{ id: memberId, tokenHash: hash(token), name }] });
      return { chatId: id, memberId, token };
    },
    async join(id, { name }) {
      if (!ID_RE.test(id)) return { error: 'Chat not found', code: 404 };
      if (!checkName(name)) return { error: 'Bad name', code: 400 };
      const meta = await kv.get(metaKey(id));
      if (!meta) return { error: 'Chat not found', code: 404 };
      if (meta.members.length >= 2) return { error: 'This chat already has two people. Ask for a new invite.', code: 409 };
      const token = rid(24), memberId = 'b';
      meta.members.push({ id: memberId, tokenHash: hash(token), name });
      await kv.set(metaKey(id), meta);
      return { chatId: id, memberId, token };
    },
    async post(id, token, { c, kind = 'text', openAtMs = 0, viewOnce = false }) {
      const r = await member(id, token); if (r.error) return r;
      if (typeof c !== 'string' || !c || c.length > MAX_CIPHER || !B64_RE.test(c)) return { error: 'Message is empty or too large', code: 400 };
      if (!['text', 'photo'].includes(kind)) return { error: 'Bad message type', code: 400 };
      const at = now(), open = Number(openAtMs) || 0;
      if (open && (open < at || open > at + 366 * 86400_000)) return { error: 'Choose a time in the future (within a year)', code: 400 };
      const msg = { id: rid(9), from: r.m.id, at, kind, c, openAtMs: open, viewOnce: Boolean(viewOnce), gone: false };
      const n = await kv.rpush(msgKey(id), msg);
      return { index: n - 1, id: msg.id, at };
    },
    async read(id, token, { after = -1 } = {}) {
      const r = await member(id, token); if (r.error) return r;
      const t = now(), me = r.m.id, list = await kv.lrange(msgKey(id));
      const out = [];
      for (let i = 0; i < list.length; i++) {
        const m = list[i];
        if (i <= after) continue;
        const mine = m.from === me;
        const locked = !mine && m.openAtMs > t;
        const view = { i, id: m.id, from: m.from, at: m.at, kind: m.kind, openAtMs: m.openAtMs, viewOnce: m.viewOnce, locked, gone: m.gone };
        if (!locked && !m.gone && !(mine && m.viewOnce)) view.c = m.c;
        if (!locked && !m.gone && !mine && m.viewOnce) { m.gone = true; await kv.lset(msgKey(id), i, { ...m, c: '' }); }
        out.push(view);
      }
      const st = {};
      for (const x of r.meta.members) st[x.id] = (await kv.get(stKey(id, x.id))) || {};
      const other = r.meta.members.find((x) => x.id !== me);
      const os = other ? st[other.id] : {};
      await kv.set(stKey(id, me), { ...st[me], seen: t }, 30 * 86400);
      return {
        me, total: list.length, messages: out, gone: list.map((m, i) => (m.gone ? i : -1)).filter((i) => i >= 0),
        members: r.meta.members.map((x) => ({ id: x.id, name: x.name })),
        other: other ? { id: other.id, online: t - (os.seen || 0) < ONLINE_MS, lastSeen: os.seen || 0, typing: t - (os.typing || 0) < TYPING_MS,
          delivered: os.delivered ?? -1, readUpTo: os.read ?? -1 } : null,
      };
    },
    async state(id, token, { typing = false, delivered, read }) {
      const r = await member(id, token); if (r.error) return r;
      const k = stKey(id, r.m.id), s = (await kv.get(k)) || {};
      if (typing) s.typing = now();
      if (Number.isInteger(delivered) && delivered > (s.delivered ?? -1)) s.delivered = delivered;
      if (Number.isInteger(read) && read > (s.read ?? -1)) s.read = read;
      s.seen = now();
      await kv.set(k, s, 30 * 86400);
      return { ok: true };
    },
  };
}
