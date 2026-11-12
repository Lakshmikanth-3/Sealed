// Real SDK signing and exact-byte RPC replay against loopback ONLY.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createHash } from 'node:crypto';
import { KeyPair, PublicKey, SignedTransaction, encodeTransaction, baseEncode } from 'near-api-js';
import { createRelayTransport } from '../server/relayTransport.js';
import { prepareSignedAnchor } from '../server/workerAuthorization.js';
import { workerFixture } from './fixtures/worker-v2.js';
import { policy, authorization } from './fixtures/relay.js';

test('v2 transport signs once, broadcasts saved bytes and distinguishes final inner failure from unavailable RPC', async (t) => {
  const key = KeyPair.fromRandom('ed25519'), auth = await authorization(), prepared = prepareSignedAnchor(auth, policy);
  const fixture = await workerFixture();
  let available = '1000000', registered = true, permission = 'FullAccess', deployed = true, chain = 'testnet', height = 100;
  let txMode = 'unknown', transactionHash, preparedTx, hang = false;
  const broadcasts = [], blockHash = '11111111111111111111111111111111';
  const server = http.createServer(async (req, res) => {
    let body = ''; for await (const chunk of req) body += chunk;
    const { id, method, params } = JSON.parse(body); let result, error;
    if (hang) return;
    if (method === 'status') result = { chain_id: chain };
    if (method === 'EXPERIMENTAL_protocol_config') result = { runtime_config: { storage_amount_per_byte: '1' } };
    if (method === 'query' && params.request_type === 'view_account') result = { amount: available, locked: '0', storage_usage: 10, code_hash: deployed ? '2'.repeat(44) : blockHash };
    if (method === 'query' && params.request_type === 'view_access_key') result = { nonce: 0, permission: params.account_id === policy.relayer ? permission : 'FullAccess', block_hash: blockHash, block_height: height };
    if (method === 'query' && params.request_type === 'call_function') result = { result: [...Buffer.from(JSON.stringify(registered))] };
    if (method === 'block') result = params.block_id ? fixture.data.block : { header: { hash: blockHash, height } };
    if (method === 'send_tx') { broadcasts.push(params); result = { transaction: { hash: transactionHash } }; }
    if (method === 'tx') {
      if (txMode === 'unknown') error = { code: -32000, message: 'UNKNOWN_TRANSACTION' };
      else {
        const d = preparedTx.transaction.actions[0].signedDelegate;
        result = structuredClone(fixture.data.tx); result.transaction.hash = transactionHash;
        const delegate = result.transaction.actions[0].Delegate;
        delegate.delegate_action.public_key = PublicKey.from(d.delegateAction.publicKey).toString();
        delegate.signature = 'ed25519:' + baseEncode(Uint8Array.from(d.signature.ed25519Signature.data));
        delegate.delegate_action.actions[0].FunctionCall.args = auth.delegate.actions[0].argsBase64;
        const receipt = result.receipts_outcome[1].outcome;
        receipt.status = txMode === 'failed' ? { Failure: { ActionError: { index: 0, kind: 'Synthetic failure' } } }
          : { SuccessValue: Buffer.from(JSON.stringify({ ...prepared.args, revision: 1, anchored_at_ns: fixture.record.anchored_at_ns })).toString('base64') };
      }
    }
    res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ jsonrpc: '2.0', id, ...(error ? { error } : { result }) }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); }));
  const transport = createRelayTransport({ ...policy, privateKey: key.toString(), rpcUrl: `http://127.0.0.1:${server.address().port}` });
  await transport.validate(prepared);
  available = '109'; await assert.rejects(transport.validate(prepared), /balance floor/); available = '1000000';
  registered = false; await assert.rejects(transport.validate(prepared), /not registered/); registered = true;
  permission = { FunctionCall: {} }; await assert.rejects(transport.validate(prepared), /full-access/); permission = 'FullAccess';
  deployed = false; await assert.rejects(transport.validate(prepared), /not deployed/); deployed = true;
  chain = 'mainnet'; await assert.rejects(transport.validate(prepared), /network mismatch/); chain = 'testnet';
  height = 150; await assert.rejects(transport.validate(prepared), (e) => e.code === 'DELEGATE_EXPIRED'); height = 100;
  assert.equal(broadcasts.length, 0);
  const signed = await transport.prepare(prepared); transactionHash = signed.hash;
  preparedTx = SignedTransaction.decode(Buffer.from(signed.bytes, 'base64'));
  assert.equal(preparedTx.transaction.receiverId, prepared.worker); assert.equal(preparedTx.transaction.signerId, policy.relayer);
  assert.equal(preparedTx.transaction.actions.length, 1);
  const digest = createHash('sha256').update(encodeTransaction(preparedTx.transaction)).digest();
  assert.equal(baseEncode(digest), signed.hash);
  assert.equal(key.getPublicKey().verify(digest, Uint8Array.from(preparedTx.signature.ed25519Signature.data)), true);
  assert.equal(preparedTx.transaction.actions[0].signedDelegate.delegateAction.nonce, 1n);
  await transport.broadcast(signed.bytes); await transport.broadcast(signed.bytes);
  assert.ok(broadcasts.every((row) => row.signed_tx_base64 === signed.bytes && row.wait_until === 'NONE'));
  const job = { tx_hash: signed.hash };
  await assert.rejects(transport.reconcile(job), (e) => e.code !== 'FINAL_EXECUTION_FAILED');
  txMode = 'failed'; await assert.rejects(transport.reconcile(job), (e) => e.code === 'FINAL_EXECUTION_FAILED');
  txMode = 'confirmed'; const found = await transport.reconcile(job);
  assert.deepEqual(found.args, prepared.args); assert.equal(found.receiptId, fixture.receiptId);
  hang = true;
  const bounded = createRelayTransport({ ...policy, privateKey: key.toString(), rpcUrl: `http://127.0.0.1:${server.address().port}` }, { timeoutMs: 30 });
  await assert.rejects(bounded.broadcast(signed.bytes), (error) => error.name === 'TimeoutError');
});
