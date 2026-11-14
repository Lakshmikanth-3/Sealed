import { $, config, el, toast, utcText, istText, short, plainLog } from '/common.js';
import { sha256Hex } from '/assets/sealed.js';

// Reads go straight from this browser to the NEAR RPC endpoints the deployment publishes.
async function view(contract, method, args) {
  let last;
  for (const url of (await config()).rpcUrls) {
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
  if (!id) return toast('Please paste the link you were sent');
  $('check').disabled = true;
  try {
    const { contract, explorer: EXPLORER } = await config();
    const [seal, unlocked] = await Promise.all([view(contract, 'get_seal', { seal_id: id }), view(contract, 'is_unlocked', { seal_id: id })]);
    if (!seal) { $('verdict').className = 'verdict bad'; $('verdict').textContent = 'We could not find this file in the public record. Check the link.'; return; }
    const log = await view(contract, 'get_log', { seal_id: id, from: Math.max(0, seal.log_count - 100), limit: 100 });
    let fileLine = 'Not checked (no copy chosen)', bad = false;
    if (doc) {
      if (doc.sealId !== id) throw new Error('This downloaded copy belongs to a different file');
      const actual = await sha256Hex(Uint8Array.from(atob(doc.encrypted), (c) => c.charCodeAt(0)));
      bad = actual !== seal.file_hash;
      fileLine = bad ? 'NO: it was changed' : 'Yes, unchanged';
    }
    const early = log.filter((e) => /early|not_holder/.test(e.kind)).length;
    $('verdict').className = 'verdict ' + (bad ? 'bad' : 'ok');
    $('verdict').textContent = bad ? 'FILE TAMPERED: this copy was changed after it was locked' : `✓ Real locked file · ${unlocked ? 'open now' : 'still locked'} · ${early} early tr${early === 1 ? 'y' : 'ies'} blocked`;
    $('fields').replaceChildren(row('Opens on', istText(Number(seal.unlock_at_ms))), row('Locked on', istText(Number(seal.created_at_ms))),
      row('Who must agree', seal.mode === 'split' ? `${seal.threshold_k} of ${seal.total_n} trusted people` : 'Nobody, it opens on time'),
      row('People who said yes', seal.mode === 'split' ? `${seal.released.length} of ${seal.threshold_k} needed` : '—'), row('Can it be opened now?', unlocked ? 'Yes' : 'No'),
      row('Downloaded copy unchanged?', fileLine), row('Tries recorded', String(seal.log_count)));
    $('fields').append(el('details', { class: 'tech' }, el('summary', { text: 'Technical details' }), row('Contract', contract), row('File ID', id), row('File fingerprint (SHA-256)', short(seal.file_hash, 12))));
    $('log').replaceChildren(...log.slice().reverse().map((e) => el('li', {}, el('time', { text: `${istText(Number(e.at_ms))} · ${utcText(Number(e.at_ms))}` }),
      el('p', {}, el('span', { class: 'accent', text: plainLog(e.kind) })))));
    $('record').classList.remove('hidden'); $('logBox').classList.remove('hidden');
    $('fields').append(el('p', {}, el('a', { href: `${EXPLORER}/address/${contract}`, target: '_blank', rel: 'noopener' }, 'See it on the public explorer →')));
  } catch (e) { toast('Could not check: ' + e.message, 6000); }
  finally { $('check').disabled = false; }
}
$('check').onclick = check;
const q = new URLSearchParams(location.search).get('id');
if (q) { $('sealId').value = q; check(); }
