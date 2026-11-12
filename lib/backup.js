// Backups never go to the server. Validation establishes local consistency,
// not chain execution, factual truth, account ownership or a trusted timestamp.
import { validateEntry, validDay, validNearAccount, validNearHash, HEX, imageBytes } from './schema.js';
import { merkleRoot, sha256Hex } from './merkle.js';

export const MAX_BACKUP_BYTES = 50 * 1024 * 1024;
const insist = (ok, message) => { if (!ok) throw new Error(message); };
export async function validateBackup(backup) {
  insist(backup && typeof backup === 'object' && !Array.isArray(backup), 'Invalid backup');
  insist(Object.keys(backup).every((key) => ['format', 'version', 'createdAt', 'worker', 'entries', 'anchors'].includes(key)), 'Unexpected backup fields');
  insist(backup.format === undefined || backup.format === 'appeal-backup', 'Unknown backup format');
  insist(backup.version === undefined || backup.version === 1, 'Unsupported backup version');
  insist(typeof backup.worker === 'string' && /^[\w-]{3,64}$/.test(backup.worker), 'Invalid backup worker');
  insist(Array.isArray(backup.entries) && backup.entries.length <= 10000 && Array.isArray(backup.anchors) && backup.anchors.length <= 10000, 'Backup exceeds local import limits');
  const rows = new Map();
  for (const row of backup.entries) {
    insist(row && row.id === row.entry?.id && !rows.has(row.id), 'Invalid or duplicate backup record');
    insist(Object.keys(row).every((key) => ['id', 'entry', 'image'].includes(key)), 'Unexpected record fields');
    validateEntry(row.entry, backup.worker, row.entry.day);
    if (row.entry.imageHash) {
      insist(typeof row.image === 'string', 'Original screenshot is missing');
      insist(await sha256Hex(imageBytes(row.image)) === row.entry.imageHash, 'Screenshot fingerprint mismatch');
    } else insist(!row.image, 'Screenshot has no fingerprint');
    rows.set(row.id, row);
  }
  const keys = new Set();
  for (const anchor of backup.anchors) {
    insist(anchor && validDay(anchor.day) && HEX.test(anchor.root) && !keys.has(anchor.key), 'Invalid or duplicate backup anchor');
    insist(['mock', 'testnet', 'mainnet'].includes(anchor.network), 'Unknown backup network');
    insist(typeof anchor.txHash === 'string' && /^[A-Za-z0-9]{1,128}$/.test(anchor.txHash)
      && anchor.key === `${anchor.day}:${anchor.txHash}`, 'Invalid backup anchor reference');
    insist(anchor.network === 'mock' ? anchor.sender === 'mock-relayer'
      : validNearAccount(anchor.sender) && validNearAccount(anchor.contract) && validNearHash(anchor.txHash), 'Invalid backup deployment');
    insist(Number.isSafeInteger(anchor.timestamp) && anchor.timestamp > 0, 'Invalid backup anchor time');
    insist(Number.isSafeInteger(anchor.count) && anchor.count > 0 && anchor.count <= 10000
      && Array.isArray(anchor.entryIds) && anchor.entryIds.length === anchor.count
      && new Set(anchor.entryIds).size === anchor.count, 'Invalid backup anchor count');
    const entries = anchor.entryIds.map((id) => {
      const row = rows.get(id);
      insist(row?.entry.day === anchor.day, 'Anchor refers to a missing record or different day');
      return row.entry;
    });
    insist(await merkleRoot(entries) === anchor.root, 'Backup records differ from the saved root');
    keys.add(anchor.key);
  }
  return { worker: backup.worker, entries: backup.entries, anchors: backup.anchors.map((anchor) => ({ ...anchor, restored: true })) };
}
