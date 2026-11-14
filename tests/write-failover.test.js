import test from 'node:test';
import assert from 'node:assert/strict';
import { JsonRpcProvider } from 'near-api-js';
import { WriteFailoverProvider } from '../server/sealChain.js';

class InvalidNonceError extends Error {}
const providers = () => [new JsonRpcProvider({ url: 'https://a.example' }), new JsonRpcProvider({ url: 'https://b.example' })];

test('a stale-nonce error is passed straight back so near-api-js can retry with a fresh nonce', async () => {
  const p = new WriteFailoverProvider(providers());
  let calls = 0;
  await assert.rejects(p.withBackoff(async () => { calls++; throw new InvalidNonceError('Invalid nonce'); }), InvalidNonceError);
  assert.equal(calls, 1, 'the same stale nonce is not sent to the next endpoint');
});

test('other failures move to the next endpoint and report the real last error', async () => {
  const p = new WriteFailoverProvider(providers());
  let calls = 0;
  await assert.rejects(p.withBackoff(async () => { calls++; throw new Error(`endpoint ${calls} down`); }), /endpoint 2 down/);
  assert.equal(calls, 2);
  const q = new WriteFailoverProvider(providers());
  let n = 0;
  assert.equal(await q.withBackoff(async () => { if (n++ === 0) throw new Error('first down'); return 'ok'; }), 'ok', 'the second endpoint answers');
});
