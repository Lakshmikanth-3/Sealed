// Browser fixtures are synthetic and run in an isolated mock ledger/profile.
import { test, expect } from '@playwright/test';

async function openWorker(page) {
  await page.goto('/');
  await expect(page.locator('#wid')).toHaveText(/^w-/);
  await page.locator('#gps').uncheck();
}

async function record(page, note, amount = '') {
  await page.locator('[data-view=capture]').click();
  await page.locator('#text').fill(note);
  if (amount !== '') await page.locator('#amount').fill(amount);
  const before = await page.locator('#days .entry').count();
  await page.locator('#capture').click();
  await expect(page.locator('#days .entry')).toHaveCount(before + 1);
}


async function confirmSharing(page) {
  await expect(page.locator('#disclosureDialog')).toBeVisible();
  await page.locator('#disclosureConsent').check();
  await page.locator('#publish').click();
}

test('capture persists; pending anchoring preserves selective disclosure', async ({ page, request }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await openWorker(page);
  await record(page, 'SYNTHETIC: disclose this trip', '100');
  await record(page, 'SYNTHETIC: keep this private', '50');
  await page.reload();
  await expect(page.locator('#days .entry')).toHaveCount(2);
  await expect(page.locator('#wid')).toHaveText(/^w-/);
  await page.locator('#gps').uncheck();
  await page.locator('[data-view=journal]').click();
  await page.locator('#anchorAll').click();
  await expect(page.locator('.pick')).toHaveCount(2);
  await page.locator('#caseDays details').evaluate((el) => { el.open = true; });
  await page.locator('[data-view=case]').click();
  await page.locator('.pick').nth(1).uncheck();
  await record(page, 'SYNTHETIC: new and not approved for sharing', '25');
  await expect(page.locator('.pick').nth(1)).not.toBeChecked();
  let publications = 0;
  page.on('request', (r) => { if (r.method() === 'POST' && r.url().endsWith('/api/case')) publications++; });
  await page.locator('[data-view=case]').click();
  await page.locator('#build').click();
  await expect(page.locator('.pick')).toHaveCount(3);
  await expect(page.locator('#build')).toBeEnabled();
  expect(publications).toBe(0);
  await expect(page.locator('.pick').nth(0)).toBeChecked();
  await expect(page.locator('.pick').nth(1)).not.toBeChecked();
  await expect(page.locator('.pick').nth(2)).not.toBeChecked();
  await page.locator('#label').fill('Synthetic browser fixture');
  const publish = page.waitForRequest((r) => r.method() === 'POST' && r.url().endsWith('/api/case'));
  await page.locator('[data-view=case]').click();
  await page.locator('#build').click();
  await confirmSharing(page);
  const draft = (await publish).postDataJSON();
  expect(draft.days[0].entries).toHaveLength(1);
  expect(JSON.stringify(draft)).not.toContain('keep this private');
  expect(JSON.stringify(draft)).not.toContain('not approved');
  await expect(page.locator('#caseOut')).toBeVisible();
  const link = await page.locator('#open').getAttribute('href');
  const id = new URL(link).searchParams.get('id');
  const pack = await (await request.get(`/api/pack/${id}`)).json();
  expect(pack.summary.earnings).toBe(100);
  await page.goto(link);
  await expect(page.locator('#verdict')).toContainText('Demo verified');
  await expect(page.locator('#att')).toContainText('No TEE attestation verified');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('#file').setInputFiles({ name: 'synthetic-invalid.json', mimeType: 'application/json', buffer: Buffer.from('{"version":1,"days":[]}') });
  await expect(page.locator('#verdict')).toContainText('Not verified');
  await expect(page.locator('#daysCard')).toBeHidden();
  await expect(page.locator('#sumCard')).toBeHidden();
  expect(errors).toEqual([]);
});

test('capture works offline after reload and can be anchored on reconnect', async ({ page, context }) => {
  await openWorker(page);
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  // Give the controlled reload a chance to establish the active worker.
  await page.reload();
  await expect(page.locator('#wid')).toHaveText(/^w-/);
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('#wid')).toHaveText(/^w-/);
  await page.locator('#gps').uncheck();
  await record(page, 'SYNTHETIC offline trip', '20');
  await context.setOffline(false);
  await page.locator('[data-view=journal]').click();
  await page.locator('#anchorAll').click();
  await expect(page.locator('.pick')).toHaveCount(1);
});

test('a screenshot survives capture, hashing, publication and verification', async ({ page }) => {
  await openWorker(page);
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 8;
    canvas.getContext('2d').fillRect(0, 0, 8, 8);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await page.locator('#photo').setInputFiles({ name: 'synthetic-pixel.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
  await record(page, 'SYNTHETIC screenshot fixture', '30');
  await page.locator('[data-view=journal]').click();
  await page.locator('#anchorAll').click();
  await expect(page.locator('.pick')).toHaveCount(1);
  const publication = page.waitForRequest((r) => r.method() === 'POST' && r.url().endsWith('/api/case'));
  await page.locator('[data-view=case]').click();
  await page.locator('#build').click();
  await confirmSharing(page);
  const published = (await publication).postDataJSON();
  expect(Object.values(published.attachments)).toEqual([`data:image/png;base64,${png}`]);
  await expect(page.locator('#caseOut')).toBeVisible();
  await page.goto(await page.locator('#open').getAttribute('href'));
  await expect(page.locator('#verdict')).toContainText('Demo verified');
  const image = page.locator('#daysOut img');
  await expect(image).toBeVisible();
  expect(await image.evaluate((el) => el.complete && el.naturalWidth > 0)).toBe(true);
});

test('all six event types publish and verify with validated amounts and ratings', async ({ page }) => {
  await openWorker(page);
  for (const type of ['trip', 'pay', 'rating', 'penalty', 'notification', 'deactivation']) {
    await page.locator(`#types button[data-t="${type}"]`).click();
    if (type === 'rating') await page.locator('#rating').fill('4.5');
    await record(page, `SYNTHETIC ${type} fixture`, ['trip', 'pay', 'penalty'].includes(type) ? '10' : '');
  }
  await page.locator('[data-view=journal]').click();
  await page.locator('#anchorAll').click();
  await expect(page.locator('.pick')).toHaveCount(6);
  await page.locator('[data-view=case]').click();
  await page.locator('#build').click();
  await confirmSharing(page);
  await expect(page.locator('#caseOut')).toBeVisible();
  await page.goto(await page.locator('#open').getAttribute('href'));
  await expect(page.locator('#verdict')).toContainText('Demo verified');
  await expect(page.locator('#daysOut table tr')).toHaveCount(7);
});
