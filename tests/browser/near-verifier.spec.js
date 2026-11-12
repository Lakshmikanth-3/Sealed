// The RPC is intercepted with synthetic responses. This is a browser trust-policy
// test, not evidence of a live NEAR transaction or deployed contract.
import { test, expect } from '@playwright/test';

test('uploaded pack cannot choose trust; explicit deployment permits finalized RPC verification', async ({ page, request }) => {
  await page.goto('/');
  await expect(page.locator('#wid')).toHaveText(/^w-/);
  await page.locator('#gps').uncheck();
  await page.locator('#text').fill('SYNTHETIC NEAR RPC trust fixture');
  await page.locator('#capture').click();
  await expect(page.locator('#days .entry')).toHaveCount(1);
  await page.locator('[data-view=journal]').click();
  await page.locator('#anchorAll').click();
  await expect(page.locator('.pick')).toHaveCount(1);
  await page.locator('[data-view=case]').click();
  await page.locator('#build').click();
  await page.locator('#disclosureConsent').check();
  await page.locator('#publish').click();
  await expect(page.locator('#caseOut')).toBeVisible();
  const link = await page.locator('#open').getAttribute('href');
  const packId = new URL(link).searchParams.get('id');
  const pack = await (await request.get(`/api/pack/${packId}`)).json();
  const hash = '2'.repeat(44), blockHash = '3'.repeat(44);
  pack.days[0].anchor = { network: 'testnet', txHash: hash, sender: 'relay.testnet', contract: 'anchor.testnet' };
  let calls = 0;
  await page.route('https://rpc.testnet.near.org/', async (route) => {
    calls++;
    const rpc = route.request().postDataJSON();
    const data = {
      status: { chain_id: 'testnet' },
      tx: { final_execution_status: 'FINAL', status: { SuccessValue: '' }, transaction: {
        hash, signer_id: 'relay.testnet', receiver_id: 'anchor.testnet', actions: [{ FunctionCall: {
          method_name: 'anchor', deposit: '0', args: Buffer.from(JSON.stringify({ v: 1, worker: pack.worker.id,
            day: pack.days[0].day, root: pack.days[0].root, count: 1 })).toString('base64') } }] }, transaction_outcome: { block_hash: blockHash } },
      block: { header: { hash: blockHash, timestamp_nanosec: String(BigInt(Date.now()) * 1000000n) } },
    };
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ jsonrpc: '2.0', id: rpc.id, result: data[rpc.method] }) });
  });
  await page.goto('/verify');
  await page.locator('#file').setInputFiles({ name: 'synthetic-rpc-pack.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(pack)) });
  await expect(page.locator('#verdict')).toContainText('Not verified');
  await expect(page.locator('#daysOut')).toContainText('No trusted NEAR deployment configured');
  expect(calls).toBe(0);
  await page.getByText('Trusted NEAR deployment', { exact: true }).click();
  await page.locator('#verifyContract').fill('anchor.testnet');
  await page.locator('#verifyRelayer').fill('relay.testnet');
  await page.locator('#recheck').click();
  await expect(page.locator('#verdict')).toContainText('Content verified');
  await expect(page.locator('#identity')).toContainText('self-reported in v1');
  expect(calls).toBe(3);
  await page.locator('#verifyRelayer').fill('wrong.testnet');
  await page.locator('#recheck').click();
  await expect(page.locator('#verdict')).toContainText('Not verified');
  expect(calls).toBe(3);
});
