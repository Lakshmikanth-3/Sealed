import test from 'node:test';
import assert from 'node:assert/strict';
import { createChain } from '../server/chain.js';
test('application chain has no unsigned or server-signed anchor method', () => {
  const chain = createChain({ NEAR_NETWORK: 'testnet', ANCHOR_CONTRACT: 'anchors.testnet' });
  assert.equal(chain.anchor, undefined);
  assert.equal(chain.network, 'testnet');
  assert.throws(() => createChain({ NEAR_NETWORK: 'mock' }), /Unsupported/);
});
