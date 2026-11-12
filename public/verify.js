import { verifyPack } from '/lib/verify.js';
import { lookupNearTx, explorerUrl } from '/lib/nearRpc.js';
import { buildReviewBrief } from '/lib/brief.js';
import { sha256Hex, canonical } from '/lib/merkle.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const RPC = { testnet: 'https://rpc.testnet.near.org', mainnet: 'https://rpc.mainnet.near.org' };

// NEAR anchors are read straight from a public RPC node (not via our server).
// Mock anchors can only be read from the demo server's local ledger.
let currentPack;
let verificationJob = 0;
let deploymentEdited = false;
const cards = ['checksCard', 'sumCard', 'daysCard', 'dlCard', 'briefCard'];
function beginChecking() {
  $('verdict').className = 'verdict'; $('verdict').textContent = 'Checking…';
  for (const id of cards) $(id).classList.add('hidden');
  $('identity').textContent = '';
  $('dl').onclick = null;
  $('downloadBrief').onclick = null; $('printBrief').onclick = null;
  $('recheck').disabled = true;
}
function showError(error, job) {
  if (job !== verificationJob) return;
  for (const id of cards) $(id).classList.add('hidden');
  $('verdict').className = 'verdict bad';
  $('verdict').textContent = 'Could not read pack: ' + error.message;
  $('recheck').disabled = !currentPack;
}
for (const id of ['verifyNetwork', 'verifyContract', 'verifyRelayer']) {
  $(id).addEventListener('input', () => {
    deploymentEdited = true;
    if (!currentPack) return;
    verificationJob++;
    for (const card of cards) $(card).classList.add('hidden');
    $('dl').onclick = null;
    $('downloadBrief').onclick = null; $('printBrief').onclick = null;
    $('verdict').className = 'verdict';
    $('verdict').textContent = 'Deployment changed. Check again.';
    $('recheck').disabled = false;
  });
}
const configP = fetch('/api/config').then((r) => r.json()).then((config) => {
  if (!deploymentEdited && RPC[config.network] && config.contract) {
    $('verifyNetwork').value = config.network;
    if (!$('verifyContract').value) $('verifyContract').value = config.contract;
    if (!$('verifyRelayer').value) $('verifyRelayer').value = config.sender;
  }
}).catch(() => {});

async function fetchAnchor(ref, deployments, protocol) {
  if (RPC[ref.network]) return lookupNearTx(RPC[ref.network], ref.txHash, ref.sender, { network: ref.network, ...deployments[ref.network], protocol, receiptId: ref.receiptId });
  const r = await fetch(`/api/anchor?tx=${encodeURIComponent(ref.txHash)}`);
  const j = await r.json();
  if (!r.ok) throw new Error(j.error);
  return j;
}

async function run(pack, job = ++verificationJob) {
  if (job !== verificationJob) return;
  currentPack = pack;
  beginChecking();
  await configP;
  if (job !== verificationJob) return;
  const deployments = { [$('verifyNetwork').value]: { contract: $('verifyContract').value.trim(), relayer: $('verifyRelayer').value.trim() } };
  $('verdict').className = 'verdict'; $('verdict').textContent = 'Checking…';
  const rep = await verifyPack(pack, (ref, context) => fetchAnchor(ref, deployments, context.protocol), { deployments });
  if (job !== verificationJob) return;
  $('recheck').disabled = false;
  const mock = Array.isArray(pack?.days) && pack.days.some((d) => d?.anchor?.network === 'mock');
  $('verdict').className = 'verdict ' + (rep.ok ? 'ok' : 'bad');
  $('verdict').textContent = rep.ok ? (mock ? `Demo verified: ${pack.days.length} day(s) match the local ledger`
    : rep.workerAuthorizationVerified ? `Worker-authorized content verified: ${pack.days.length} day(s)`
      : `Content verified: ${pack.days.length} day(s) match NEAR commitments`) : 'Not verified: this pack was changed or does not match its anchors';
  $('checks').innerHTML = rep.checks.map((c) => `<li>${c.ok ? '✅' : '❌'} ${esc(c.msg)}</li>`).join('') +
    (mock ? '<li>⚠️ Anchored on the local demo ledger, not on NEAR.</li>' : '');
  $('att').textContent = rep.attestation;
  $('identity').textContent = rep.identity;
  $('narr').textContent = rep.recomputedSummary?.narrative || '';
  if (!rep.recomputedSummary) {
    $('checksCard').classList.remove('hidden');
    for (const id of ['sumCard', 'daysCard', 'dlCard']) $(id).classList.add('hidden');
    $('daysOut').replaceChildren();
    return;
  }
  $('who').textContent = `Worker ${pack.worker?.id}${pack.worker?.label ? ' · ' + pack.worker.label : ''} · pack created ${pack.createdAt}`;

  const all = Object.fromEntries(pack.days.flatMap((d) => d.entries.map((x) => [x.entry.id, x.entry])));
  $('daysOut').innerHTML = rep.days.map((d, i) => {
    const pd = pack.days[i];
    const link = explorerUrl(pd.anchor.network, pd.anchor.txHash);
    const at = d.anchor ? new Date(d.anchor.timestamp).toLocaleString() : '—';
    return `<div class="day-head" style="margin-top:12px"><strong>${esc(d.day)}</strong>
      <span class="badge ${d.ok ? 'ok' : 'bad'}">${d.ok ? 'matches anchor' : 'FAILED'}</span></div>
      <p class="muted">Anchored ${esc(at)} on ${esc(pd.anchor.network)} by ${esc(d.anchor?.signer || pd.anchor.sender)} ·
      ${link ? `<a href="${esc(link)}" target="_blank" rel="noopener">view transaction</a>` : `<code>${esc(pd.anchor.txHash.slice(0, 16))}…</code>`}
      · ${pd.entries.length}/${pd.count} entries disclosed</p>
      ${d.problems.length ? `<p class="badge bad">${esc(d.problems.join('; '))}</p>` : ''}
      <div class="scroll"><table><tr><th>Captured</th><th>Type</th><th>Amount / rating</th><th>Note</th><th></th></tr>` +
      d.entries.map((r) => {
        const e = all[r.id], img = e.imageHash && pack.attachments?.[e.imageHash];
        return `<tr><td>${esc(new Date(e.ts).toLocaleString())}</td><td>${esc(e.type)}</td>
          <td>${e.amount != null ? '₹' + esc(e.amount) : ''}${e.rating != null ? '★ ' + esc(e.rating) : ''}</td>
          <td>${esc(e.text || '')}${img ? `<br><a href="${esc(img)}" target="_blank" rel="noopener noreferrer"><img src="${esc(img)}" alt="screenshot" style="max-width:120px;border-radius:6px"></a>` : ''}</td>
          <td>${r.ok ? '✅' : '❌ ' + esc(r.problems.join(', '))}</td></tr>`;
      }).join('') + '</table></div>';
  }).join('');

  for (const id of ['checksCard', 'sumCard', 'daysCard', 'dlCard']) $(id).classList.remove('hidden');
  if (rep.ok) {
    const brief = buildReviewBrief(pack, rep);
    const digest = await sha256Hex(canonical(pack));
    if (job !== verificationJob) return;
    $('packDigest').textContent = 'Pack SHA-256 (canonical JSON): ' + digest;
    $('reviewBrief').textContent = brief;
    $('briefCard').classList.remove('hidden');
    $('printBrief').onclick = () => window.print();
    $('downloadBrief').onclick = () => {
      const url = URL.createObjectURL(new Blob([brief + '\n\nCanonical pack SHA-256: ' + digest], { type: 'text/plain;charset=utf-8' }));
      const link = document.createElement('a'); link.href = url; link.download = 'appeal-evidence-review.txt'; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
  }
  $('dl').onclick = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(pack, null, 2)], { type: 'application/json' }));
    a.download = 'evidence-pack.json'; a.click();
  };
}

$('file').onchange = async () => {
  const f = $('file').files[0];
  if (!f) return;
  const job = ++verificationJob;
  currentPack = undefined;
  beginChecking();
  try { await run(JSON.parse(await f.text()), job); } catch (e) { showError(e, job); }
};

const id = new URLSearchParams(location.search).get('id');
if (id) {
  const job = ++verificationJob;
  beginChecking();
  fetch(`/api/pack/${encodeURIComponent(id)}`).then(async (r) => {
    if (!r.ok) throw new Error((await r.json()).error);
    return run(await r.json(), job);
  }).catch((e) => showError(e, job));
}

$('recheck').onclick = () => {
  if (!currentPack) return;
  const job = ++verificationJob;
  run(currentPack, job).catch((e) => showError(e, job));
};
