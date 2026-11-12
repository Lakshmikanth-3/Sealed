// Read an anchor transaction straight from a NEAR RPC node (works in browser and Node).
// The verifier calls this directly, so it does not have to trust the Appeal Record server.

async function rpc(url, method, params) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 'ar', method, params }),
  });
  const j = await res.json();
  if (j.error) throw new Error(`${method}: ${j.error.cause?.name || j.error.message || 'RPC error'}`);
  return j.result;
}

function decodeArgs(b64) {
  const bin = atob(b64);
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))));
}

export async function lookupNearTx(rpcUrl, txHash, sender) {
  const r = await rpc(rpcUrl, 'tx', { tx_hash: txHash, sender_account_id: sender, wait_until: 'FINAL' });
  const fc = r.transaction.actions.map((a) => a.FunctionCall).find(Boolean);
  if (!fc) throw new Error('transaction has no function call');
  const block = await rpc(rpcUrl, 'block', { block_id: r.transaction_outcome.block_hash });
  const ok = r.status && Object.prototype.hasOwnProperty.call(r.status, 'SuccessValue');
  return {
    args: decodeArgs(fc.args),
    timestamp: Number(BigInt(block.header.timestamp) / 1000000n),
    signer: r.transaction.signer_id,
    receiver: r.transaction.receiver_id,
    execution: ok ? 'success' : 'failed (args still recorded on-chain)',
  };
}

export const explorerUrl = (network, txHash) =>
  network === 'mainnet' ? `https://nearblocks.io/txns/${txHash}`
    : network === 'testnet' ? `https://testnet.nearblocks.io/txns/${txHash}` : null;
