import { canonical } from './merkle.js';
import { validNearHash } from './schema.js';

// Reconciliation never signs or retries a transaction. A partial response must
// not discard verified days or release unresolved work for another signature.
export async function reconcilePending(pending, hashes, lookup) {
  if (!Array.isArray(hashes) || !hashes.length || hashes.length > 20
    || !hashes.every(validNearHash) || new Set(hashes).size !== hashes.length) {
    throw new Error('Supply 1–20 distinct NEAR transaction hashes');
  }
  const remaining = [...pending.items];
  const confirmed = [], problems = [];
  for (const hash of hashes) {
    try {
      const found = await lookup(hash);
      if (found.workerAccount !== pending.worker || found.network !== pending.network
        || found.receiver !== pending.contract || found.execution !== 'success' || found.finality !== 'FINAL'
        || found.txHash !== hash || !validNearHash(found.receiptId)) throw new Error('Transaction does not match the pending deployment');
      const index = remaining.findIndex((item) => canonical(item.args) === canonical(found.args));
      if (index < 0) throw new Error('Transaction does not match an unresolved day');
      const [item] = remaining.splice(index, 1);
      confirmed.push({ key: `${item.args.day}:${hash}`, day: item.args.day, root: item.args.root,
        count: item.args.count, entryIds: item.entryIds, network: pending.network, contract: pending.contract,
        sender: pending.worker, txHash: hash, receiptId: found.receiptId, timestamp: found.timestamp });
    } catch (error) { problems.push({ hash, message: error.message }); }
  }
  return { confirmed, problems, pending: remaining.length ? { ...pending, items: remaining,
    hashes: hashes.filter((hash) => !confirmed.some((record) => record.txHash === hash)) } : null };
}
