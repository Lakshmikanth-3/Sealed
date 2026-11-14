import test from 'node:test';
import assert from 'node:assert/strict';
import { publishingOptions } from '../lib/publishing.js';
test('publishing requires valid lifetime and boolean AI consent before paid generation', () => {
  assert.deepEqual(publishingOptions({}), { ttlSeconds: 86400, aiConsent: false });
  assert.deepEqual(publishingOptions({ ttlSeconds: 300, aiConsent: true }), { ttlSeconds: 300, aiConsent: true });
  for (const body of [null, [], { ttlSeconds: 0 }, { ttlSeconds: 604801 }, { ttlSeconds: '86400' }, { aiConsent: 'true' }, { aiConsent: 1 }]) {
    assert.throws(() => publishingOptions(body));
  }
});
