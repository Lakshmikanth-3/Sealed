// Shared by the chat page and the app: AES-256-GCM with the chat key, and the list of my chats.
const b64u = {
  enc: (u8) => btoa(String.fromCharCode(...u8)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
  dec: (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0)),
};
const encB64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };

export const newChatKey = () => b64u.enc(crypto.getRandomValues(new Uint8Array(32)));

export async function chatCrypto(key64) {
  const raw = b64u.dec(key64);
  if (raw.length !== 32) throw new Error('bad key');
  const key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
  return {
    async seal(obj) {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(obj))));
      const out = new Uint8Array(12 + ct.length); out.set(iv); out.set(ct, 12);
      return encB64(out);
    },
    // Files: raw bytes in, iv || ciphertext out.
    async sealBytes(u8) {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, u8));
      const out = new Uint8Array(12 + ct.length); out.set(iv); out.set(ct, 12);
      return out;
    },
    async openBytes(u8) { return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: u8.subarray(0, 12) }, key, u8.subarray(12))); },
    async open(s) {
      const u = b64u.dec(s);
      const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: u.subarray(0, 12) }, key, u.subarray(12));
      return JSON.parse(new TextDecoder().decode(pt));
    },
  };
}

const LIST = 'sealed:chats';
export const listChats = () => { try { return JSON.parse(localStorage.getItem(LIST) || '[]'); } catch { return []; } };
export const loadChat = (id) => listChats().find((c) => c.id === id) || null;
export function saveChat(c) { try { localStorage.setItem(LIST, JSON.stringify([c, ...listChats().filter((x) => x.id !== c.id)].slice(0, 50))); } catch { /* chat still works for this visit */ } }
