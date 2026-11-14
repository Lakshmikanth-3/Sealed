import { test, expect } from '@playwright/test';

test('pages load, explain locking, and refuse to seal without a deployed contract', async ({ page, request }) => {
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  for (const path of ['/', '/app', '/verify', '/s/abcdefgh', '/h/abcdefgh']) {
    const r = await request.get(path);
    expect(r.status(), path).toBe(200);
    expect(r.headers()['content-security-policy']).toContain("frame-ancestors 'none'");
  }
  await page.goto('/app#seal');
  await expect(page.locator('#view-seal')).toBeVisible();
  await page.setInputFiles('#file', { name: 'note.txt', mimeType: 'text/plain', buffer: Buffer.from('secret') });
  await page.click('.preset[data-n="5"]');
  await expect(page.locator('#kHint')).toContainText('3 of 5');
  await expect(page.locator('.holder-row:not(.hidden)')).toHaveCount(5);
  await page.click('#sealBtn');
  await expect(page.locator('.toast')).toContainText('Could not seal');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('open page for an unknown seal and the API refuse safely', async ({ page, request }) => {
  await page.goto('/s/doesnotexist1');
  await expect(page.locator('#title')).toHaveText('Seal not found');
  await expect(page.locator('#openBtn')).toBeDisabled();
  expect((await request.post('/api/seals/doesnotexist1/open', { data: {} })).status()).toBe(404);
  expect((await request.post('/api/seals', { data: 'x', headers: { 'content-type': 'text/plain' } })).status()).toBe(415);
  expect((await request.get('/../.env')).status()).toBe(404);
  await page.goto('/h/doesnotexist1');
  await expect(page.locator('#title')).toHaveText('This holder link is incomplete');
});

test('visual shares: each share is noise, all shares together reveal the image', async ({ page }) => {
  await page.goto('/app#visual');
  const png = await page.screenshot({ clip: { x: 0, y: 0, width: 120, height: 90 } });
  await page.setInputFiles('#visualFile', { name: 'shot.png', mimeType: 'image/png', buffer: png });
  await page.fill('#visualN', '3'); await page.click('#visualSplit');
  await expect(page.locator('.share-grid-v canvas')).toHaveCount(3);
  await page.click('#visualMerge');
  await expect(page.locator('canvas.revealed')).toBeVisible({ timeout: 5000 });
});
