import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlans, planLimits } from '../server/plans.js';
import { memoryKv } from '../server/kv.js';

function setup({ active = true } = {}) {
  let t = 1_000_000, reads = 0;
  const chain = { viewOn: async (contract, method, args) => { reads++; assert.equal(method, 'get_plan'); return { account: args.account, active, premium_until_ms: String(t + 86400_000) }; } };
  const plans = createPlans({ chain, kv: memoryKv({ now: () => t }), secret: 'test-secret', contract: 'plans.testnet', now: () => t });
  return { plans, tick: (ms) => { t += ms; }, reads: () => reads };
}

test('limits come from configuration with sensible defaults', () => {
  assert.deepEqual(planLimits({}).free, { dailyLocks: 5, maxFileMb: 10, maxPeople: 3 });
  assert.equal(planLimits({ FREE_DAILY_LOCKS: '2' }).free.dailyLocks, 2);
  assert.equal(planLimits({ SEAL_MAX_FILE_MB: '50' }).premium.maxFileMb, 50);
});

test('a Premium pass identifies the account, cannot be forged and expires after 24 hours', () => {
  const { plans, tick } = setup();
  const pass = plans.issuePass('kanth.testnet');
  assert.equal(plans.readPass(pass), 'kanth.testnet');
  const [body] = pass.split('.');
  const forgedBody = Buffer.from(JSON.stringify({ account: 'other.testnet', exp: Date.now() * 2 })).toString('base64url');
  assert.equal(plans.readPass(`${forgedBody}.${pass.split('.')[1]}`), null, 'changing the account breaks the signature');
  assert.equal(plans.readPass(`${body}.AAAA`), null);
  assert.equal(plans.readPass(''), null);
  const other = createPlans({ chain: {}, kv: memoryKv(), secret: 'different', contract: 'x' });
  assert.equal(other.readPass(pass), null, 'a pass from another server secret is rejected');
  tick(24 * 3600_000 + 1);
  assert.equal(plans.readPass(pass), null, 'expired');
});

test('Premium status is read from the contract and cached for 60 seconds', async () => {
  const { plans, tick, reads } = setup();
  assert.equal((await plans.plan('kanth.testnet')).active, true);
  await plans.plan('kanth.testnet'); assert.equal(reads(), 1);
  tick(61_000); await plans.plan('kanth.testnet'); assert.equal(reads(), 2);
  assert.equal((await setup({ active: false }).plans.plan('a.testnet')).active, false);
});

test('Free plan: the daily limit counts per visitor and resets the next day', async () => {
  const { plans, tick } = setup();
  for (let i = 0; i < 3; i++) assert.ok((await plans.useFreeLock('1.2.3.4', 3)) >= 0);
  assert.equal(await plans.useFreeLock('1.2.3.4', 3), -1, 'fourth lock refused');
  assert.ok((await plans.useFreeLock('5.6.7.8', 3)) >= 0, 'other visitors are separate');
  tick(24 * 3600_000);
  assert.ok((await plans.useFreeLock('1.2.3.4', 3)) >= 0, 'new day');
});
