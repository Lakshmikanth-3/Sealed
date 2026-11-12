import { test, expect } from '@playwright/test';

test('unfinished live setup permits local capture but does not offer unsigned anchoring', async ({ page }) => {
  // Synthetic configuration only: the test server remains on its isolated mock ledger.
  await page.route('**/api/config', (route) => route.fulfill({ contentType: 'application/json',
    body: JSON.stringify({ network: 'testnet', sender: 'sponsor.testnet', contract: 'anchors.testnet', anchoringAvailable: false }) }));
  await page.goto('/');
  await expect(page.locator('#wid')).toHaveText(/^w-/);
  await expect(page.locator('#net')).toContainText('account setup pending');
  await expect(page.locator('#anchorAll')).toBeDisabled();
  await expect(page.locator('#build')).toBeDisabled();
  await page.locator('#gps').uncheck();
  await page.locator('#text').fill('SYNTHETIC local record while account setup is pending');
  await page.locator('#capture').click();
  await expect(page.locator('#days .entry')).toHaveCount(1);
  await expect(page.locator('#anchorAll')).toBeDisabled();
  await expect(page.locator('#build')).toBeDisabled();
});
