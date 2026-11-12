import { test, expect } from '@playwright/test';
import { workerFixture } from '../fixtures/worker-v2.js';

test('v2 file upload verifies account authorization and rejects inner-call failure', async ({ page }) => {
  // The public RPC is intercepted. This is not a live-chain or real-worker test.
  const f = await workerFixture();
  await page.route('https://rpc.testnet.near.org/', async (route) => {
    const rpc = route.request().postDataJSON();
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ jsonrpc: '2.0', id: rpc.id, result: f.data[rpc.method] }) });
  });
  await page.goto('/verify');
  await page.getByText('Trusted NEAR deployment', { exact: true }).click();
  await page.locator('#verifyContract').fill(f.policy.contract);
  await page.locator('#verifyRelayer').fill(f.policy.relayer);
  await page.locator('#file').setInputFiles({ name: 'synthetic-worker-v2.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(f.pack)) });
  await expect(page.locator('#verdict')).toContainText('Worker-authorized content verified');
  await expect(page.locator('#identity')).toContainText('worker.testnet authorized these anchor calls');
  await expect(page.locator('#identity')).toContainText("does not establish the person's name");
  await expect(page.locator('#att')).toContainText('No TEE attestation verified');
  await expect(page.locator('#briefCard')).toBeVisible();
  await expect(page.locator('#reviewBrief')).toContainText('[E:synthetic-trip]');
  await expect(page.locator('#reviewBrief')).toContainText('TEE attestation: not verified');
  await page.locator('#verifyContract').fill('other.testnet');
  await expect(page.locator('#verdict')).toContainText('Deployment changed. Check again.');
  await expect(page.locator('#daysCard')).toBeHidden();
  await expect(page.locator('#briefCard')).toBeHidden();
  await page.locator('#verifyContract').fill(f.policy.contract);
  await page.locator('#recheck').click();
  await expect(page.locator('#verdict')).toContainText('Worker-authorized content verified');
  f.data.tx.receipts_outcome[1].outcome.status = { Failure: {} };
  await page.locator('#recheck').click();
  await expect(page.locator('#verdict')).toContainText('Not verified');
  await expect(page.locator('#briefCard')).toBeHidden();
  await expect(page.locator('#identity')).toContainText('has not been verified');
  await expect(page.locator('#daysOut')).toContainText('Delegated anchor contract failed');
  await page.locator('#file').setInputFiles({ name: 'synthetic-malformed.json', mimeType: 'application/json', buffer: Buffer.from('{not valid json') });
  await expect(page.locator('#verdict')).toContainText('Could not read pack');
  for (const id of ['checksCard', 'sumCard', 'daysCard', 'dlCard']) await expect(page.locator('#' + id)).toBeHidden();
});
