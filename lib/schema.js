// Shared validation for untrusted evidence and case drafts. These limits are resource
// bounds, not measured product statistics or pilot targets.
export const HEX = /^[0-9a-f]{64}$/;
const TYPES = new Set(['trip', 'pay', 'rating', 'penalty', 'notification', 'deactivation']);
const NETWORKS = new Set(['mock', 'testnet', 'mainnet']);
const object = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const require = (ok, message) => { if (!ok) throw new Error(message); };
const boundedString = (v, max) => typeof v === 'string' && v.length > 0 && v.length <= max;
export const validNearAccount = (value) => typeof value === 'string' && value.length >= 2 && value.length <= 64
  && /^(([a-z0-9]+[-_])*[a-z0-9]+\.)*([a-z0-9]+[-_])*[a-z0-9]+$/.test(value);
export const validNearHash = (value) => typeof value === 'string' && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value);

export function validateAnchorArguments(args, { version, network } = {}) {
  require(object(args) && [1, 2].includes(version) && args.v === version, 'Invalid anchor protocol');
  const keys = version === 2 ? ['v', 'network', 'worker', 'day', 'root', 'count'] : ['v', 'worker', 'day', 'root', 'count'];
  require(Object.keys(args).length === keys.length && keys.every((key) => Object.hasOwn(args, key)), 'Invalid anchor argument fields');
  require(version === 2 ? validNearAccount(args.worker) && args.network === network : typeof args.worker === 'string' && /^[\w-]{3,64}$/.test(args.worker), 'Invalid anchor worker or network');
  require(validDay(args.day) && typeof args.root === 'string' && HEX.test(args.root), 'Invalid anchor day or root');
  require(Number.isSafeInteger(args.count) && args.count >= 1 && args.count <= 10000, 'Invalid anchor count');
}

export function validDay(day) {
  if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const timestamp = Date.parse(day + 'T00:00:00.000Z');
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === day;
}

export function imageBytes(url) {
  // Only raster images produced by the app; no SVG, arbitrary URL or HTML prefix.
  require(typeof url === 'string' && url.length <= 12 * 1024 * 1024, 'Invalid screenshot size');
  const match = /^data:image\/(?:jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(url);
  require(match && match[1].length % 4 === 0, 'Invalid screenshot data URL');
  const binary = atob(match[1]);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

export function validateEntry(entry, worker, day) {
  require(object(entry), 'Invalid entry');
  require(typeof entry.id === 'string' && /^[\w-]{1,128}$/.test(entry.id), 'Invalid entry ID');
  require(entry.worker === worker && entry.day === day, 'Entry worker or day mismatch');
  require(typeof entry.ts === 'string' && /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?Z$/.test(entry.ts)
    && Number.isFinite(Date.parse(entry.ts)) && validDay(entry.ts.slice(0, 10)), 'Invalid capture timestamp');
  require(TYPES.has(entry.type), 'Invalid entry type');
  require(typeof entry.salt === 'string' && /^[0-9a-f]{32}$/.test(entry.salt), 'Invalid entry salt');
  if (entry.amount !== undefined) require(typeof entry.amount === 'number' && Number.isFinite(entry.amount) && entry.amount >= 0 && entry.amount <= Number.MAX_SAFE_INTEGER / 100, 'Invalid amount');
  if (entry.rating !== undefined) require(typeof entry.rating === 'number' && Number.isFinite(entry.rating) && entry.rating >= 0 && entry.rating <= 5, 'Invalid rating');
  if (entry.text !== undefined) require(typeof entry.text === 'string' && entry.text.length <= 1000, 'Invalid entry text');
  if (entry.imageHash !== undefined) require(typeof entry.imageHash === 'string' && HEX.test(entry.imageHash), 'Invalid screenshot hash');
  if (entry.geo !== undefined) {
    require(object(entry.geo) && Number.isFinite(entry.geo.lat) && Math.abs(entry.geo.lat) <= 90
      && Number.isFinite(entry.geo.lon) && Math.abs(entry.geo.lon) <= 180
      && Number.isFinite(entry.geo.acc) && entry.geo.acc >= 0, 'Invalid location');
  }
}

export function validateDraft(draft) {
  require(object(draft) && object(draft.worker), 'Pack needs a worker');
  const worker = draft.worker.id;
  const version = draft.version ?? 1;
  require([1, 2].includes(version), 'Unsupported evidence protocol');
  require(version === 2 ? validNearAccount(worker) : typeof worker === 'string' && /^[\w-]{3,64}$/.test(worker), 'Invalid worker ID');
  if (draft.worker.label !== undefined) require(typeof draft.worker.label === 'string' && draft.worker.label.length <= 60, 'Invalid worker label');
  require(Array.isArray(draft.days) && draft.days.length > 0 && draft.days.length <= 366, 'Pack needs 1–366 disclosed days');
  const days = new Set(), ids = new Set(), images = new Set();
  let total = 0;
  let v2Network;
  for (const day of draft.days) {
    require(object(day) && validDay(day.day), 'Invalid work day');
    require(!days.has(day.day), 'Duplicate work day'); days.add(day.day);
    require(typeof day.root === 'string' && HEX.test(day.root), 'Invalid Merkle root');
    require(Number.isSafeInteger(day.count) && day.count >= 1 && day.count <= 10000, 'Invalid anchored count');
    require(Array.isArray(day.entries) && day.entries.length > 0 && day.entries.length <= day.count, 'Invalid disclosed count');
    total += day.entries.length;
    require(total <= 10000, 'Too many disclosed entries');
    const ref = day.anchor;
    require(object(ref) && NETWORKS.has(ref.network), 'Unsupported anchor network');
    if (version === 2) {
      require(ref.network !== 'mock' && validNearAccount(ref.contract) && validNearAccount(ref.sender)
        && validNearHash(ref.txHash) && validNearHash(ref.receiptId), 'V2 evidence needs real NEAR transaction and receipt references');
      require(!v2Network || v2Network === ref.network, 'V2 evidence must use one NEAR network');
      v2Network = ref.network;
    }
    if (ref.network !== 'mock') require(typeof ref.contract === 'string' && ref.contract.length <= 64 && /^[a-z0-9._-]+$/.test(ref.contract), 'Missing or invalid anchor contract');
    require(boundedString(ref.txHash, 128) && /^[A-Za-z0-9]+$/.test(ref.txHash), 'Invalid transaction reference');
    require(boundedString(ref.sender, 128) && /^[a-z0-9._-]+$/.test(ref.sender), 'Invalid anchor sender');
    for (const item of day.entries) {
      require(object(item), 'Invalid evidence item');
      validateEntry(item.entry, worker, day.day);
      require(!ids.has(item.entry.id), 'Duplicate entry ID'); ids.add(item.entry.id);
      if (item.entry.imageHash) images.add(item.entry.imageHash);
      require(Array.isArray(item.proof) && item.proof.length <= Math.ceil(Math.log2(day.count)), 'Invalid Merkle proof length');
      for (const step of item.proof) require(object(step) && (step.side === 'L' || step.side === 'R')
        && typeof step.hash === 'string' && HEX.test(step.hash), 'Invalid Merkle proof step');
    }
  }
  if (draft.attachments !== undefined) {
    require(object(draft.attachments), 'Invalid attachments');
    require(Object.keys(draft.attachments).length <= images.size, 'Unexpected attachments');
    for (const [hash, url] of Object.entries(draft.attachments)) {
      require(HEX.test(hash) && images.has(hash), 'Attachment is not part of disclosed evidence');
      imageBytes(url);
    }
  }
}

export function validatePack(pack) {
  require(object(pack) && [1, 2].includes(pack.version), 'Not a supported evidence pack');
  validateDraft(pack);
  require(object(pack.summary) && typeof pack.summaryHash === 'string' && HEX.test(pack.summaryHash), 'Invalid case summary');
}
