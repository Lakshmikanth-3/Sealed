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

test('exam mode: setter, auditor and investigator in the browser', async ({ page }) => {
  await page.goto('/app#exam');
  const paper = ['Q: Which of the following is a prime number?\nA) 21\nB) 29 *\nC) 33\nD) 39',
    'Q: What is the value of 7 squared?\nA) 14\nB) 42\nC) 49 *\nD) 77',
    'Q: Calculate the total cost of 3 pens at Rs 15 each.\nA) Rs 30\nB) Rs 45 *\nC) Rs 50\nD) Rs 18'].join('\n\n');
  await page.fill('#examText', paper); await page.fill('#examTitleIn', 'Unit test'); await page.fill('#centres', '4'); await page.click('#genVersions');
  await expect(page.locator('#versions article')).toHaveCount(4);
  await expect(page.locator('#auditVerdict')).toContainText('Passed');
  const centre2 = await page.locator('#versions article').nth(1).locator('pre').innerText();
  await page.fill('#leakText', centre2.split('\n').slice(1).join('\n').toLowerCase());
  await page.click('#trace');
  await expect(page.locator('.trace-big')).toContainText(/Centre 2/);
  await page.locator('#versions article button', { hasText: 'Seal this version' }).first().click();
  await expect(page.locator('#view-seal')).toBeVisible();
  await expect(page.locator('#fileInfo')).toContainText('Unit test - centre 1.txt');
});
