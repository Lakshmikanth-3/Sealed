import { test, expect } from '@playwright/test';
test('unconfigured deployment never fabricates an account or an anchor', async ({ page, request }) => {
  const errors = []; page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('#setupStatus')).toContainText('Contract deployment required');
  await expect(page.locator('#net')).toContainText('NEAR testnet');
  await expect(page.locator('#connectWallet')).toBeEnabled();
  await expect(page.locator('#anchorAll')).toBeDisabled();
  await page.locator('#capture').click();
  await expect(page.locator('.toast')).toContainText('Connect your NEAR wallet');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
  expect((await request.get('/api/health')).status()).toBe(503);
  const config = await (await request.get('/api/config')).json();
  expect(config.network).toBe('testnet'); expect(config.contract).toBeNull();
  const write = await request.post('/api/anchor', { data: {} }); expect(write.status()).toBe(403);
});
test('reviewer refuses local-ledger evidence and never displays a successful verdict', async ({ page }) => {
  await page.goto('/verify');
  await page.locator('#file').setInputFiles({ name: 'rejected-ledger.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ version: 1, days: [], worker: { id: 'not-a-wallet' } })) });
  await expect(page.locator('#verdict')).toContainText('Not verified');
  await expect(page.locator('#briefCard')).toBeHidden();
  await expect(page.locator('#aiDraftCard')).toBeHidden();
});
