// Plans tab: shows Free vs Premium (limits read from the server), pays for Premium through
// the person's NEAR wallet, and activates a 24-hour Premium pass after a one-time signature.
import { $, api, config, el, toast, istText } from '/common.js';

const PASS = 'sealed:plan-pass';
export const planPass = () => { try { return localStorage.getItem(PASS) || ''; } catch { return ''; } };
let walletMod; const wallet = async () => (walletMod ||= await import('/assets/wallet.js'));
const near = (yocto) => (yocto ? (Number(BigInt(yocto) / 10n ** 20n) / 10000).toString() : '—');

async function refresh() {
  const r = await api('/api/plan', { headers: { 'x-plan-pass': planPass() } });
  if (!r.ok) return;
  const { limits, pricePerMonthYocto, premium, premiumUntilMs, account, contract } = r.body;
  $('freeList').replaceChildren(...[`${limits.free.dailyLocks} locked files per day`, `Files up to ${limits.free.maxFileMb} MB`, `Up to ${limits.free.maxPeople} trusted people`, 'Live chat, secret links, alerts, proof page'].map((t) => el('li', { text: t })));
  $('premiumList').replaceChildren(...['Unlimited locked files', `Files up to ${limits.premium.maxFileMb} MB`, 'Up to 20 trusted people', 'Everything in Free'].map((t) => el('li', { text: t })));
  $('planPrice').textContent = `${near(pricePerMonthYocto)} NEAR / month`;
  $('planStatus').replaceChildren(premium ? el('b', { text: `Premium is active for ${account} until ${istText(premiumUntilMs)}.` }) : document.createTextNode(account ? `${account} is on the Free plan.` : 'You are on the Free plan.'));
  $('planBuy').disabled = !contract; $('planProve').disabled = !contract;
  if (!contract) $('planNote').textContent = 'Premium is not set up on this server.';
  return r.body;
}
async function connected() { try { return await (await wallet()).connectedAccount(); } catch { return null; } }
async function showWallet() { const who = await connected(); $('planWallet').textContent = who ? `Connected as ${who}` : 'Not connected'; return who; }

$('planConnect').onclick = async () => {
  try { const cfg = await config(); const w = await wallet(); if (await w.connectedAccount()) await w.disconnect(); await w.connect(cfg.contract); await showWallet(); }
  catch (e) { toast('Wallet: ' + e.message, 6000); }
};
// One signature proves the account; the server checks Premium on NEAR and returns a 24 h pass.
async function activate() {
  const who = await showWallet();
  if (!who) throw new Error('Please connect your NEAR wallet first');
  const c = await api('/api/plan/challenge');
  const proof = { ...(await (await wallet()).proveAccount(c.body)), nonce: c.body.nonce };
  const r = await api('/api/plan/pass', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ proof }) });
  if (!r.ok) throw new Error(r.body.error);
  try { localStorage.setItem(PASS, r.body.pass); } catch { /* pass kept for this page only */ }
  return r.body;
}
$('planProve').onclick = async () => {
  try { const p = await activate(); toast(p.premium ? 'Premium is active in this browser.' : 'No Premium plan found for this account yet.', 6000); await refresh(); }
  catch (e) { toast(e.message, 7000); }
};
$('planBuy').onclick = async () => {
  $('planBuy').disabled = true;
  try {
    const info = await refresh();
    if (!(await showWallet())) throw new Error('Please connect your NEAR wallet first');
    const months = Number($('planMonths').value);
    const total = (BigInt(info.pricePerMonthYocto) * BigInt(months)).toString();
    $('planResult').textContent = `Please approve ${near(total)} NEAR in your wallet…`;
    const { txHash } = await (await wallet()).walletSubscribe(info.contract, months, total);
    const cfg = await config();
    $('planResult').replaceChildren('Payment sent. ', txHash ? el('a', { href: `${cfg.explorer}/txns/${txHash}`, target: '_blank', rel: 'noopener' }, 'See the payment on the public record →') : '', ' Now confirm once with your wallet to turn Premium on here.');
    await new Promise((r) => setTimeout(r, 2500));
    const p = await activate();
    toast(p.premium ? 'Premium is active.' : 'Payment is still being confirmed. Tap "I already paid" in a minute.', 7000);
    await refresh();
  } catch (e) { $('planResult').textContent = ''; toast('Upgrade: ' + e.message, 7000); }
  finally { $('planBuy').disabled = false; }
};
refresh(); showWallet();
