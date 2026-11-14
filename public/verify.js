import { $, config, el, toast, utcText, istText, short, EXPLORER } from '/common.js';
import { sha256Hex } from '/assets/sealed.js';

const RPCS = ['https://test.rpc.fastnear.com', 'https://rpc.testnet.near.org'];
async function view(contract, method, args) {
  let last;
  for (const url of RPCS) {
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(10000),
        body: JSON.stringify({ jsonrpc: '2.0', id: 'verify', method: 'query', params: { request_type: 'call_function', finality: 'final', account_id: contract, method_name: method, args_base64: btoa(JSON.stringify(args)) } }) });
      const j = await r.json();
      if (j.error) throw new Error(j.error.data || j.error.message);
      return JSON.parse(new TextDecoder().decode(Uint8Array.from(j.result.result)));
    } catch (e) { last = e; }
  }
  throw last;
}
const row = (k, v) => el('p', {}, el('span', { text: k }), el('b', { text: v }));

async function check() {
  const raw = $('sealId').value.trim();
  const sealId = (raw.match(/\/s\/([A-Za-z0-9_-]{6,64})/) || raw.match(/^([A-Za-z0-9_-]{6,64})$/) || [])[1];
  const doc = $('doc').files[0] ? JSON.parse(await $('doc').files[0].text()) : null;
  const id = sealId || doc?.sealId;
  if (!id) return toast('Enter a seal ID or link, or choose a .sealed file');
  $('check').disabled = true;
  try {
    const { contract } = await config();
    const [seal, unlocked] = await Promise.all([view(contract, 'get_seal', { seal_id: id }), view(contract, 'is_unlocked', { seal_id: id })]);
    if (!seal) { $('verdict').className = 'verdict bad'; $('verdict').textContent = `No seal "${id}" on ${contract}`; return; }
    const log = await view(contract, 'get_log', { seal_id: id, from: Math.max(0, seal.log_count - 100), limit: 100 });
    let fileLine = 'not checked (no .sealed file chosen)', bad = false;
    if (doc) {
      if (doc.sealId !== id) throw new Error('The .sealed file is for a different seal');
      const actual = await sha256Hex(Uint8Array.from(atob(doc.encrypted), (c) => c.charCodeAt(0)));
      bad = actual !== seal.file_hash;
      fileLine = bad ? `DOES NOT MATCH (this copy ${actual.slice(0, 16)}…)` : 'matches the on-chain hash';
    }
    const early = log.filter((e) => /early|not_holder/.test(e.kind)).length;
    $('verdict').className = 'verdict ' + (bad ? 'bad' : 'ok');
    $('verdict').textContent = bad ? 'FILE TAMPERED: this copy differs from what was sealed' : `Seal verified on NEAR · ${unlocked ? 'unlocked' : 'still locked'} · ${early} refused attempt${early === 1 ? '' : 's'} logged`;
    $('fields').replaceChildren(row('Contract', contract), row('Seal ID', id), row('Mode', seal.mode === 'split' ? `split · ${seal.threshold_k} of ${seal.total_n}` : 'single'),
      row('Unlock time', `${istText(Number(seal.unlock_at_ms))} · ${utcText(Number(seal.unlock_at_ms))}`), row('Sealed at', utcText(Number(seal.created_at_ms))),
      row('File hash (SHA-256)', short(seal.file_hash, 12)), row('.sealed file', fileLine), row('Holders', String(seal.holders.length)),
      row('Parts released', `${seal.released.length}${seal.mode === 'split' ? ' of ' + seal.threshold_k + ' needed' : ''}`), row('Unlocked now', unlocked ? 'yes' : 'no'),
      row('Log entries', `${seal.log_count}${seal.dropped_logs ? ` (+${seal.dropped_logs} over cap)` : ''}`));
    $('log').replaceChildren(...log.slice().reverse().map((e) => el('li', {}, el('time', { text: `${istText(Number(e.at_ms))} · ${utcText(Number(e.at_ms))}` }),
      el('p', {}, el('span', { class: 'accent', text: e.kind.replace(':', ' · ').toUpperCase() }), ` · ${short(e.account, 8)}${e.detail ? ' · ' + short(e.detail, 6) : ''}`))));
    $('record').classList.remove('hidden'); $('logBox').classList.remove('hidden');
    $('fields').append(el('p', {}, el('a', { href: `${EXPLORER}/address/${contract}`, target: '_blank', rel: 'noopener' }, 'Contract on NearBlocks →')));
  } catch (e) { toast('Verification failed: ' + e.message, 6000); }
  finally { $('check').disabled = false; }
}
$('check').onclick = check;
const q = new URLSearchParams(location.search).get('id');
if (q) { $('sealId').value = q; check(); }
