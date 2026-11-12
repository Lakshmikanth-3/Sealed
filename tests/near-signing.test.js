// Exercises the real SDK signer against a synthetic loopback RPC only. The
// ephemeral key is never funded, persisted, printed or sent to a public node.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { KeyPair, SignedTransaction } from 'near-api-js';
import { createChain } from '../server/chain.js';

test('relayer signs the expected anchor with SDK v7 and waits for final execution', async (t) => {
  const hash = '2'.repeat(44), blockHash = '11111111111111111111111111111111';
  const key = KeyPair.fromRandom('ed25519');
  const args = { v: 1, worker: 'w-synthetic', day: '2026-11-12', root: 'a'.repeat(64), count: 1 };
  const transaction = { hash, signer_id: 'relay.testnet', receiver_id: 'anchor.testnet', actions: [{ FunctionCall: {
    method_name: 'anchor', args: Buffer.from(JSON.stringify(args)).toString('base64'), deposit: '0' } }] };
  const outcome = { final_execution_status: 'FINAL', status: { SuccessValue: '' }, transaction,
    transaction_outcome: { id: hash, block_hash: blockHash }, receipts_outcome: [] };
  let sent;
  let chainId = 'testnet';
  let deployed = true;
  let broadcasts = 0;
  const server = http.createServer(async (request, response) => {
    let body = '';
    for await (const chunk of request) body += chunk;
    const { id, method, params } = JSON.parse(body);
    let result;
    if (method === 'status') result = { chain_id: chainId };
    if (method === 'query' && params.request_type === 'view_account') result = { amount: '1000000000000000000000000', locked: '0', code_hash: deployed ? hash : blockHash, storage_usage: 0 };
    if (method === 'query' && params.request_type === 'view_access_key') result = { nonce: 0, permission: 'FullAccess', block_hash: blockHash, block_height: 1 };
    if (method === 'block') result = { header: { hash: blockHash, height: 1, timestamp_nanosec: String(BigInt(Date.now()) * 1000000n) } };
    if (method === 'send_tx') { broadcasts++; sent = params; result = outcome; }
    if (method === 'tx') result = outcome;
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify(result ? { jsonrpc: '2.0', id, result } : { jsonrpc: '2.0', id, error: { code: -32601, message: 'Unexpected fixture method' } }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); }));
  const chain = createChain({ NEAR_NETWORK: 'testnet', NEAR_ACCOUNT_ID: 'relay.testnet', NEAR_PRIVATE_KEY: key.toString(),
    ANCHOR_CONTRACT: 'anchor.testnet', NEAR_RPC_URL: `http://127.0.0.1:${server.address().port}` });
  const anchor = await chain.anchor(args);
  assert.equal(anchor.txHash, hash);
  assert.equal(anchor.contract, 'anchor.testnet');
  assert.equal(anchor.finality, 'FINAL');
  assert.equal(sent.wait_until, 'FINAL');
  const signed = SignedTransaction.decode(Buffer.from(sent.signed_tx_base64, 'base64'));
  assert.equal(signed.transaction.signerId, 'relay.testnet');
  assert.equal(signed.transaction.receiverId, 'anchor.testnet');
  assert.equal(signed.transaction.publicKey.toString(), key.getPublicKey().toString());
  assert.equal(signed.transaction.actions.length, 1);
  const call = signed.transaction.actions[0].functionCall;
  assert.equal(call.methodName, 'anchor');
  assert.equal(call.deposit, 0n);
  assert.deepEqual(JSON.parse(new TextDecoder().decode(Uint8Array.from(call.args))), args);
  chainId = 'mainnet';
  await assert.rejects(chain.anchor(args), /different network/);
  chainId = 'testnet'; deployed = false;
  await assert.rejects(chain.anchor(args), /not deployed/);
  assert.equal(broadcasts, 1, 'failed preflight must never broadcast a transaction');
});
