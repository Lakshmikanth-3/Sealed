// Ephemeral synthetic keys and local provider fixtures only; no live transactions.
import test from 'node:test';
import assert from 'node:assert/strict';
import { KeyPair, KeyPairSigner, DelegateAction, actions } from 'near-api-js';
import { prepareSignedAnchor, checkWorkerAccess } from '../server/workerAuthorization.js';

const policy = { network: 'testnet', contract: 'anchors.testnet' };
async function fixture(argsText) {
  const key = KeyPair.fromRandom('ed25519');
  const args = { v: 2, network: 'testnet', worker: 'worker.testnet', day: '2026-11-12', root: 'a'.repeat(64), count: 1 };
  const argsBytes = Buffer.from(argsText ?? JSON.stringify(args));
  const delegate = { senderId: args.worker, receiverId: policy.contract, publicKey: key.getPublicKey().toString(),
    nonce: '1', maxBlockHeight: '150', actions: [{ methodName: 'anchor', argsBase64: argsBytes.toString('base64'), gas: '30000000000000', deposit: '0' }] };
  const action = new DelegateAction({ senderId: delegate.senderId, receiverId: delegate.receiverId,
    publicKey: key.getPublicKey(), nonce: 1n, maxBlockHeight: 150n,
    actions: [actions.functionCall('anchor', argsBytes, 30_000_000_000_000n, 0n)] });
  const { signedDelegate } = await new KeyPairSigner(key).signDelegateAction(action);
  return { protocol: 2, network: 'testnet', delegate, signature: Buffer.from(signedDelegate.signature.data).toString('base64') };
}
function provider({ height = 100, nonce = 0, permission = 'FullAccess', registered = true, network = 'testnet' } = {}) {
  return { viewNodeStatus: async () => ({ chain_id: network }), viewBlock: async () => ({ header: { height } }),
    viewAccessKey: async () => ({ nonce, permission }), query: async () => ({ result: [...Buffer.from(JSON.stringify(registered))] }) };
}

test('valid signatures cannot sponsor duplicate JSON keys or a byte-order mark', async () => {
  const sample = await fixture();
  const text = Buffer.from(sample.delegate.actions[0].argsBase64, 'base64').toString();
  const duplicate = await fixture(text.replace('{"v":2', '{"v":1,"v":2'));
  assert.throws(() => prepareSignedAnchor(duplicate, policy), /compact JSON/);
  const bom = await fixture('\uFEFF' + text);
  assert.throws(() => prepareSignedAnchor(bom, policy));
});

test('real Ed25519 delegate signature binds worker, exact arguments and deployment', async () => {
  const payload = await fixture();
  const prepared = prepareSignedAnchor(payload, policy);
  assert.equal(prepared.worker, 'worker.testnet');
  assert.equal(prepared.args.network, 'testnet');
  assert.equal(prepared.signedDelegate.delegateAction.receiverId, policy.contract);
  assert.equal(prepared.signedDelegate.delegateAction.nonce, 1n);
  assert.match(prepared.fingerprint, /^[a-f0-9]{64}$/);
  assert.equal(prepareSignedAnchor(structuredClone(payload), policy).fingerprint, prepared.fingerprint);
  await checkWorkerAccess(prepared, provider(), policy);
});

for (const [name, mutate] of [
  ['wrong outer network', (p) => { p.network = 'mainnet'; }],
  ['wrong contract', (p) => { p.delegate.receiverId = 'other.testnet'; }],
  ['different worker', (p) => { p.delegate.senderId = 'other.testnet'; }],
  ['extra action', (p) => p.delegate.actions.push(p.delegate.actions[0])],
  ['transfer method', (p) => { p.delegate.actions[0].methodName = 'transfer'; }],
  ['attached deposit', (p) => { p.delegate.actions[0].deposit = '1'; }],
  ['excess gas', (p) => { p.delegate.actions[0].gas = '30000000000001'; }],
  ['nonce tampering', (p) => { p.delegate.nonce = '2'; }],
  ['noncanonical nonce', (p) => { p.delegate.nonce = '01'; }],
  ['u64 overflow', (p) => { p.delegate.nonce = '18446744073709551616'; }],
  ['expiration tampering', (p) => { p.delegate.maxBlockHeight = '151'; }],
  ['signature tampering', (p) => { p.signature = Buffer.alloc(64).toString('base64'); }],
  ['unknown top-level field', (p) => { p.secret = 'must not be accepted'; }],
  ['noncanonical base64', (p) => { p.delegate.actions[0].argsBase64 += '\n'; }],
]) {
  test(`worker authorization rejects ${name}`, async () => {
    const payload = await fixture(); mutate(payload);
    assert.throws(() => prepareSignedAnchor(payload, policy));
  });
}

for (const [name, change] of [
  ['cross-network signed arguments', (args) => { args.network = 'mainnet'; }],
  ['argument worker mismatch', (args) => { args.worker = 'other.testnet'; }],
  ['impossible day', (args) => { args.day = '2026-02-30'; }],
  ['invalid root', (args) => { args.root = 'not-a-hash'; }],
  ['zero entries', (args) => { args.count = 0; }],
]) {
  test(`worker authorization rejects ${name}`, async () => {
    const payload = await fixture();
    const call = payload.delegate.actions[0];
    const args = JSON.parse(Buffer.from(call.argsBase64, 'base64').toString());
    change(args); call.argsBase64 = Buffer.from(JSON.stringify(args)).toString('base64');
    assert.throws(() => prepareSignedAnchor(payload, policy));
  });
}

test('final-state preflight rejects replay, expiry, unauthorized keys and unregistered workers', async () => {
  const prepared = prepareSignedAnchor(await fixture(), policy);
  for (const options of [{ nonce: 1 }, { height: 150 }, { height: 1 }, { registered: false }, { network: 'mainnet' },
    { permission: { FunctionCall: { receiver_id: 'other.testnet', method_names: ['anchor'] } } },
    { permission: { FunctionCall: { receiver_id: policy.contract, method_names: ['other'] } } }]) {
    const limits = { ...policy, maxLifetimeBlocks: options.height === 1 ? 100 : 200 };
    await assert.rejects(checkWorkerAccess(prepared, provider(options), limits));
  }
  await checkWorkerAccess(prepared, provider({ permission: { FunctionCall: { receiver_id: policy.contract, method_names: ['anchor'] } } }), policy);
  await checkWorkerAccess(prepared, provider({ permission: { FunctionCall: { receiver_id: policy.contract, method_names: [] } } }), policy);
});
