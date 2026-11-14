import test from 'node:test';
import assert from 'node:assert/strict';
import { aiReadiness, privateBrief } from '../server/privateBrief.js';
test('private AI cannot silently replace a missing configured service', async () => {
  assert.equal(aiReadiness({}).ready, false);
  await assert.rejects(privateBrief({ days: [] }, {}), /requires Node|Configure/);
});
test('approved TEE deployment measurements are required before enabling private AI', () => {
  const result = aiReadiness({ NEARAI_API_KEY: 'test-only', NEARAI_MODEL: 'test-only', AI_ACCESS_TOKEN: 'test-only' });
  assert.equal(result.ready, false);
  assert.match(result.reason, /requires Node|Approve/);
});
