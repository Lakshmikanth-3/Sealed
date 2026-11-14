// Read finalized execution from a public NEAR RPC. Expected deployment identity
// comes from verifier configuration, never from a pack's untrusted references.
import { validNearAccount, validNearHash, validateAnchorArguments } from './schema.js';
export { validNearAccount } from './schema.js';

function executionFailure(message) {
  const error = new Error(message);
  error.code = 'FINAL_EXECUTION_FAILED';
  return error;
}

async function rpc(url, method, params, fetcher) {
  const response = await fetcher(url, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 'ar', method, params }),
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`NEAR RPC HTTP ${response.status}`);
  const json = await response.json();
  if (json.error) throw new Error(`NEAR RPC ${method} failed`);
  if (!json.result || typeof json.result !== 'object') throw new Error('Malformed NEAR RPC response');
  return json.result;
}

function decodeJson(value, label) {
  try {
    if (typeof value !== 'string' || value.length > 16384 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) throw new Error();
    const binary = atob(value);
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(binary, (c) => c.charCodeAt(0))));
  } catch { throw new Error(`Invalid ${label}`); }
}

// Delegate execution creates another receipt rather than returning the inner
// call's result. Overall SuccessValue alone does not establish contract success.
function findWorkerReceipt(result, worker, contract, args, direct = false) {
  const roots = result.transaction_outcome?.outcome?.receipt_ids;
  const rows = result.receipts_outcome;
  if (!Array.isArray(roots) || !roots.length || roots.length > 256 || !roots.every(validNearHash)
    || !Array.isArray(rows) || !rows.length || rows.length > 256) throw new Error('Missing delegated receipt graph');
  const receipts = new Map();
  for (const row of rows) {
    if (!validNearHash(row?.id) || receipts.has(row.id) || !row.outcome || !Array.isArray(row.outcome.receipt_ids)
      || !row.outcome.receipt_ids.every(validNearHash)) throw new Error('Invalid or duplicate receipt');
    receipts.set(row.id, row);
  }
  const visited = new Set(), matches = [];
  function visit(id, workerSeen, path) {
    if (path.has(id)) throw new Error('Cyclic receipt graph');
    if (visited.has(id)) return;
    visited.add(id);
    const row = receipts.get(id);
    if (!row) return; // An unavailable refund is irrelevant to the contract proof.
    const outcome = row.outcome;
    if (outcome.executor_id === worker && Object.hasOwn(outcome.status || {}, 'Failure')) throw executionFailure('Worker delegation failed');
    if (outcome.executor_id === worker && !(typeof outcome.status?.SuccessValue === 'string' || validNearHash(outcome.status?.SuccessReceiptId))) throw new Error('Worker delegation failed');
    const authorizedPath = workerSeen || outcome.executor_id === worker;
    if (authorizedPath && outcome.executor_id === contract) {
      if (Object.hasOwn(outcome.status || {}, 'Failure')) throw executionFailure('Delegated anchor contract failed');
      const value = outcome.status?.SuccessValue;
      if (typeof value === 'string' && value !== '') {
        const record = decodeJson(value, 'anchor return');
        if (!record || ['v', 'network', 'worker', 'day', 'root', 'count'].some((key) => record[key] !== args[key])
          || !Number.isSafeInteger(record.revision) || record.revision < 1 || record.revision > args.count
          || typeof record.anchored_at_ns !== 'string' || !/^\d{1,20}$/.test(record.anchored_at_ns)) throw new Error('Anchor return differs from signed arguments');
        matches.push({ row, record });
      }
    }
    const next = new Set(path); next.add(id);
    for (const child of outcome.receipt_ids) visit(child, authorizedPath, next);
  }
  for (const id of roots) visit(id, direct, new Set());
  if (matches.length !== 1) throw new Error('Expected one successful worker-authorized contract receipt');
  return matches[0];
}

export async function lookupNearTx(rpcUrl, txHash, sender, { network, contract, relayer, protocol = 1, receiptId, fetcher = fetch } = {}) {
  if (!['testnet', 'mainnet'].includes(network)) throw new Error('Expected NEAR network is required');
  if (!validNearAccount(contract) || !validNearAccount(sender)) throw new Error('Trusted contract and transaction sender are required');
  if (!validNearHash(txHash)) throw new Error('Invalid NEAR transaction hash');
  if (![1, 2].includes(protocol)) throw new Error('Unsupported anchor protocol');

  const status = await rpc(rpcUrl, 'status', [], fetcher);
  if (status.chain_id !== network) throw new Error('RPC is connected to a different network');
  const result = await rpc(rpcUrl, 'tx', { tx_hash: txHash, sender_account_id: sender, wait_until: 'FINAL' }, fetcher);
  if (result.final_execution_status !== 'FINAL') throw new Error('Anchor execution is not final');
  const tx = result.transaction;
  if (!tx || tx.hash !== txHash || tx.signer_id !== sender) throw new Error('Anchor transaction identity mismatch');
  if (!Array.isArray(tx.actions) || tx.actions.length !== 1 || !tx.actions[0] || Object.keys(tx.actions[0]).length !== 1) throw new Error('Expected one anchor action');
  let call, workerAccount;
  const direct = protocol === 2 && !!tx.actions[0].FunctionCall;
  if (!direct && (!validNearAccount(relayer) || sender !== relayer)) throw new Error('Unexpected anchor relayer');
  if (protocol === 2 && !direct) {
    const signed = tx.actions[0].Delegate;
    const delegate = signed?.delegate_action;
    if (!delegate || !validNearAccount(delegate.sender_id) || tx.receiver_id !== delegate.sender_id
      || delegate.receiver_id !== contract || !Array.isArray(delegate.actions) || delegate.actions.length !== 1
      || !delegate.actions[0] || Object.keys(delegate.actions[0]).length !== 1
      || typeof delegate.public_key !== 'string' || !/^ed25519:[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(delegate.public_key)
      || typeof signed.signature !== 'string' || !/^ed25519:[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(signed.signature)) throw new Error('Invalid worker delegate action');
    call = delegate.actions[0].FunctionCall;
    workerAccount = delegate.sender_id;
  } else {
    if (tx.receiver_id !== contract) throw new Error('Anchor transaction receiver mismatch');
    call = tx.actions[0].FunctionCall;
    if (direct) workerAccount = tx.signer_id;
  }
  if (!call) throw new Error('Expected one anchor function call');
  if (call.method_name !== 'anchor' || String(call.deposit) !== '0') throw new Error('Unexpected anchor method or deposit');
  const args = decodeJson(call.args, 'anchor arguments');
  validateAnchorArguments(args, { version: protocol, network });
  if (protocol === 2 && args.worker !== workerAccount) throw new Error('Delegate signer differs from anchored worker');
  if (Object.hasOwn(result.status || {}, 'Failure')) throw executionFailure('Anchor contract execution failed');
  if (typeof result.status?.SuccessValue !== 'string') throw new Error('Anchor contract execution failed');
  const selected = protocol === 2 ? findWorkerReceipt(result, workerAccount, contract, args, direct) : null;
  if (receiptId && selected?.row.id !== receiptId) throw new Error('Contract receipt reference mismatch');
  const blockHash = selected ? selected.row.block_hash : result.transaction_outcome?.block_hash;
  if (typeof blockHash !== 'string') throw new Error('Missing anchor block');
  const block = await rpc(rpcUrl, 'block', { block_id: blockHash }, fetcher);
  if (block.header?.hash !== blockHash || !/^\d{1,20}$/.test(String(block.header.timestamp_nanosec ?? block.header.timestamp))) throw new Error('Invalid anchor block');
  const timestamp = Number(BigInt(block.header.timestamp_nanosec ?? block.header.timestamp) / 1000000n);
  if (!Number.isSafeInteger(timestamp) || timestamp <= 0) throw new Error('Invalid anchor block timestamp');
  if (selected && (BigInt(selected.record.anchored_at_ns) <= 0n
    || BigInt(selected.record.anchored_at_ns) > BigInt(block.header.timestamp_nanosec ?? block.header.timestamp))) throw new Error('Invalid contract record timestamp');
  return { args, timestamp, signer: tx.signer_id, receiver: contract, method: call.method_name,
    execution: 'success', finality: 'FINAL', network, txHash, protocol,
    ...(selected ? { receiptId: selected.row.id, workerAccount, workerAuthorization: direct ? 'wallet' : 'nep366' } : {}) };
}

export const explorerUrl = (network, txHash) =>
  network === 'mainnet' ? `https://nearblocks.io/txns/${encodeURIComponent(txHash)}`
    : network === 'testnet' ? `https://testnet.nearblocks.io/txns/${encodeURIComponent(txHash)}` : null;
