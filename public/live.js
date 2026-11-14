// Live, read-only NEAR data for the landing page and dashboard. Every value comes from
// /api/config and the server-cached /api/chain snapshot; failures are reported, never replaced with numbers.
export const RPC = { testnet: 'https://rpc.testnet.near.org', mainnet: 'https://rpc.mainnet.near.org' };
export const EXPLORER = { testnet: 'https://testnet.nearblocks.io', mainnet: 'https://nearblocks.io' };

export async function serverConfig() {
  const r = await fetch('/api/config', { cache: 'no-store' });
  if (!r.ok) throw new Error('Server configuration unavailable');
  return r.json();
}

/** One cached snapshot of chain state from the server. Fields are null when a read failed; `errors` says why. */
export async function chainSnapshot(network, contract, worker) {
  const q = worker ? '?worker=' + encodeURIComponent(worker) : '';
  const r = await fetch('/api/chain' + q, { cache: 'no-store', signal: AbortSignal.timeout(12000) });
  const s = await r.json();
  if (!r.ok) throw new Error(s.error || 'Chain status unavailable');
  return { ...s, at: new Date(s.at), blockTime: s.blockTime ? new Date(s.blockTime) : null,
    account: s.storageBytes === null ? null : { storage_usage: s.storageBytes, amount: s.balanceYocto } };
}

export const utc = (d) => d ? d.toISOString().replace('T', ' ').slice(0, 19) + ' UTC' : '—';
export const short = (s, n = 8) => !s ? '—' : s.length > n * 2 + 1 ? `${s.slice(0, n)}…${s.slice(-n)}` : s;
export const nearAmount = (yocto) => yocto ? (Number(BigInt(yocto) / 10n ** 20n) / 10000).toFixed(2) + ' Ⓝ' : '—';
