// Authorization for worker-owned v2 anchors. No private worker key is accepted.
// The network is inside the signed arguments: NEP-366 itself is not chain-bound.
import { createHash } from 'node:crypto';
import { PublicKey, KeyType, DelegateAction, Signature, actions, encodeDelegateAction, encodeSignedDelegate } from 'near-api-js';
import { validNearAccount } from '../lib/nearRpc.js';
import { HEX, validDay } from '../lib/schema.js';

const U64_MAX = (1n << 64n) - 1n;
const MAX_GAS = 30_000_000_000_000n;
const demand = (ok, message) => { if (!ok) throw new Error(message); };
const object = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
function exactKeys(value, keys, label) {
  demand(object(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key)), `Invalid ${label} fields`);
}
function integer(value, label) {
  demand(typeof value === 'string' && /^(0|[1-9]\d{0,19})$/.test(value), `Invalid ${label}`);
  const number = BigInt(value);
  demand(number <= U64_MAX, `${label} exceeds u64`);
  return number;
}
function base64(value, maxBytes, label) {
  demand(typeof value === 'string' && value.length <= Math.ceil(maxBytes / 3) * 4 && /^[A-Za-z0-9+/]+={0,2}$/.test(value), `Invalid ${label}`);
  const bytes = Buffer.from(value, 'base64');
  demand(bytes.length <= maxBytes && bytes.toString('base64') === value, `Noncanonical ${label}`);
  return bytes;
}

export function prepareSignedAnchor(payload, { network, contract } = {}) {
  demand(['testnet', 'mainnet'].includes(network) && validNearAccount(contract), 'Expected deployment is required');
  exactKeys(payload, ['protocol', 'network', 'delegate', 'signature'], 'authorization');
  demand(payload.protocol === 2 && payload.network === network, 'Authorization network or protocol mismatch');
  const d = payload.delegate;
  exactKeys(d, ['senderId', 'receiverId', 'publicKey', 'nonce', 'maxBlockHeight', 'actions'], 'delegate');
  demand(validNearAccount(d.senderId) && d.receiverId === contract, 'Unexpected worker or contract');
  demand(typeof d.publicKey === 'string' && /^ed25519:[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(d.publicKey), 'Invalid worker public key');
  const publicKey = PublicKey.from(d.publicKey);
  demand(publicKey.keyType === KeyType.ED25519 && typeof d.publicKey === 'string' && publicKey.toString() === d.publicKey, 'Expected canonical Ed25519 worker key');
  const nonce = integer(d.nonce, 'nonce'), maxBlockHeight = integer(d.maxBlockHeight, 'expiration');
  demand(nonce > 0n && maxBlockHeight > 0n, 'Nonce and expiration must be positive');
  demand(Array.isArray(d.actions) && d.actions.length === 1, 'Only one anchor call may be sponsored');
  const call = d.actions[0];
  exactKeys(call, ['methodName', 'argsBase64', 'gas', 'deposit'], 'action');
  demand(call.methodName === 'anchor', 'Only the anchor method may be sponsored');
  const gas = integer(call.gas, 'gas'), deposit = integer(call.deposit, 'deposit');
  demand(gas > 0n && gas <= MAX_GAS && deposit === 0n, 'Anchor exceeds sponsorship gas or deposit policy');
  const argsBytes = base64(call.argsBase64, 2048, 'anchor arguments');
  const argsText = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(argsBytes);
  const args = JSON.parse(argsText);
  demand(JSON.stringify(args) === argsText, 'Anchor arguments must use compact JSON.stringify encoding');
  exactKeys(args, ['v', 'network', 'worker', 'day', 'root', 'count'], 'anchor');
  demand(args.v === 2 && args.network === network && args.worker === d.senderId, 'Signed anchor identity or network mismatch');
  demand(validDay(args.day) && typeof args.root === 'string' && HEX.test(args.root), 'Invalid signed anchor day or root');
  demand(Number.isSafeInteger(args.count) && args.count > 0 && args.count <= 10000, 'Invalid signed entry count');
  const delegateAction = new DelegateAction({ senderId: d.senderId, receiverId: contract, publicKey, nonce, maxBlockHeight,
    actions: [actions.functionCall('anchor', Uint8Array.from(argsBytes), gas, deposit)] });
  const signature = base64(payload.signature, 64, 'worker signature');
  demand(signature.length === 64, 'Invalid worker signature length');
  const hash = createHash('sha256').update(encodeDelegateAction(delegateAction)).digest();
  demand(publicKey.verify(hash, signature), 'Worker signature is invalid');
  const signedDelegate = { delegateAction, signature: new Signature({ keyType: KeyType.ED25519, data: Uint8Array.from(signature) }) };
  return { signedDelegate, args, worker: d.senderId,
    fingerprint: createHash('sha256').update(encodeSignedDelegate(signedDelegate)).digest('hex') };
}

// Run against final state immediately before sponsorship. The actual NEAR
// execution still checks nonce/key authorization again, protecting against races.
export async function checkWorkerAccess(prepared, provider, { network, contract, maxLifetimeBlocks = 200 } = {}) {
  demand(Number.isSafeInteger(maxLifetimeBlocks) && maxLifetimeBlocks > 0, 'Invalid delegate lifetime policy');
  const delegate = prepared.signedDelegate.delegateAction;
  demand(prepared.args.network === network && delegate.receiverId === contract, 'Unexpected deployment');
  const [node, block, key, registration] = await Promise.all([
    provider.viewNodeStatus(), provider.viewBlock({ finality: 'final' }),
    provider.viewAccessKey({ accountId: delegate.senderId, publicKey: delegate.publicKey, finalityQuery: { finality: 'final' } }),
    provider.query({ request_type: 'call_function', finality: 'final', account_id: contract,
      method_name: 'is_registered', args_base64: Buffer.from(JSON.stringify({ worker: delegate.senderId })).toString('base64') }),
  ]);
  demand(node.chain_id === network, 'RPC network mismatch');
  const height = BigInt(block.header.height);
  if (delegate.maxBlockHeight <= height) {
    const error = new Error('Delegate is expired'); error.code = 'DELEGATE_EXPIRED'; throw error;
  }
  demand(delegate.maxBlockHeight <= height + BigInt(maxLifetimeBlocks), 'Delegate is expired or exceeds lifetime policy');
  demand(delegate.nonce > BigInt(key.nonce), 'Delegate nonce has already been used');
  const permission = key.permission;
  if (permission !== 'FullAccess') {
    const limited = permission?.FunctionCall;
    demand(limited?.receiver_id === contract && Array.isArray(limited.method_names)
      && (!limited.method_names.length || limited.method_names.includes('anchor')), 'Worker key is not authorized for this anchor');
  }
  demand(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(registration.result))) === true, 'Worker storage sponsorship is not registered');
}
