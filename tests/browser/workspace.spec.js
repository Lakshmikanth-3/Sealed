import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';

test('sharing requires explicit preview consent; a verified cited brief clears after tampering', async ({ page, request }) => {
  await page.goto('/'); await expect(page.locator('#wid')).toHaveText(/^w-/);
  await expect(page.locator('#gps')).not.toBeChecked();
  await page.locator('#text').fill('SYNTHETIC: reviewer reference, not a real worker event');
  await page.locator('#amount').fill('12'); await page.locator('#capture').click();
  await expect(page.locator('#journalCount')).toContainText('1 local record');
  await page.locator('[data-view=journal]').click(); await page.locator('#anchorAll').click();
  await expect(page.locator('.pick')).toHaveCount(1);
  await page.locator('[data-view=case]').click();
  let publishes = 0;
  page.on('request', (r) => { if (r.url().endsWith('/api/case') && r.method() === 'POST') publishes++; });
  await page.locator('#build').click();
  await expect(page.locator('#disclosureRecords')).toContainText('SYNTHETIC: reviewer reference');
  await page.locator('#publish').click();
  await expect(page.locator('#disclosureError')).toContainText('confirm sharing'); expect(publishes).toBe(0);
  await page.locator('#cancelDisclosure').click(); expect(publishes).toBe(0);
  await page.locator('#build').click(); await expect(page.locator('#disclosureConsent')).not.toBeChecked();
  await page.locator('#disclosureConsent').check(); await page.locator('#publish').click();
  await expect(page.locator('#caseOut')).toBeVisible(); expect(publishes).toBe(1);
  const link = await page.locator('#open').getAttribute('href');
  const pack = await (await request.get('/api/pack/' + new URL(link).searchParams.get('id'))).json();
  const entryId = pack.days[0].entries[0].entry.id;
  await page.goto(link); await expect(page.locator('#briefCard')).toBeVisible();
  await expect(page.locator('#reviewBrief')).toContainText(`[E:${entryId}]`);
  await expect(page.locator('#reviewBrief')).toContainText('LOCAL DEMO');
  const download = page.waitForEvent('download'); await page.locator('#downloadBrief').click();
  const artifact = await download; const text = await fs.readFile(await artifact.path(), 'utf8');
  expect(text).toContain('Canonical pack SHA-256:'); expect(text).toContain(`[E:${entryId}]`);
  pack.days[0].entries[0].entry.amount++;
  await page.locator('#file').setInputFiles({ name: 'synthetic-tamper.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(pack)) });
  await expect(page.locator('#verdict')).toContainText('Not verified'); await expect(page.locator('#briefCard')).toBeHidden();
});

test('backup restores atomically on an empty journal and never overwrites or uploads private records', async ({ page, browser }) => {
  await page.goto('/'); await expect(page.locator('#wid')).toHaveText(/^w-/);
  const png = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = c.height = 4; return c.toDataURL('image/png'); });
  await page.locator('#photo').setInputFiles({ name: 'synthetic.png', mimeType: 'image/png', buffer: Buffer.from(png.split(',')[1], 'base64') });
  await page.locator('#text').fill('SYNTHETIC private backup record'); await page.locator('#capture').click();
  await expect(page.locator('#journalCount')).toContainText('1 local record');
  await page.locator('[data-view=journal]').click(); await page.locator('#anchorAll').click();
  await expect(page.locator('.pick')).toHaveCount(1); await page.locator('[data-view=backup]').click();
  const download = page.waitForEvent('download'); await page.locator('#export').click();
  const file = await download; const backupBytes = await fs.readFile(await file.path());
  const backup = JSON.parse(backupBytes);
  expect(backup.entries[0].image).toBe(png);
  await page.locator('#restoreFile').setInputFiles({ name: 'synthetic-backup.json', mimeType: 'application/json', buffer: backupBytes });
  await expect(page.locator('#restoreStatus')).toContainText('empty journal');
  await expect(page.locator('#journalCount')).toContainText('1 local record');
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  try {
    const fresh = await context.newPage(); let uploaded = false;
    fresh.on('request', (r) => { if (r.method() === 'POST') uploaded = true; });
    await fresh.goto('/#backup'); await expect(fresh.locator('#wid')).toHaveText(/^w-/);
    const tampered = structuredClone(backup); tampered.entries[0].entry.text = 'Changed after anchoring';
    await fresh.locator('#restoreFile').setInputFiles({ name: 'synthetic-damaged.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(tampered)) });
    await expect(fresh.locator('#restoreStatus')).toContainText('differ from the saved root');
    await expect(fresh.locator('#journalCount')).toContainText('0 local records');
    await fresh.locator('#restoreFile').setInputFiles({ name: 'synthetic-backup.json', mimeType: 'application/json', buffer: backupBytes });
    await expect(fresh.locator('#restoreStatus')).toContainText('Ready to restore'); await fresh.locator('#restore').click();
    await expect(fresh.locator('#restoreStatus')).toContainText('restored locally');
    await expect(fresh.locator('#wid')).toHaveText(backup.worker);
    await fresh.reload(); await expect(fresh.locator('#journalCount')).toContainText('1 local record');
    await fresh.locator('[data-view=journal]').click(); await expect(fresh.locator('#days')).toContainText('restored; not rechecked');
    expect(await fresh.locator('#days img').getAttribute('src')).toBe(png); expect(uploaded).toBe(false);
  } finally { await context.close(); }
});

test('mobile and desktop workspace remain usable with local fonts, keyboard focus and no horizontal overflow', async ({ page }, testInfo) => {
  await page.goto('/'); await expect(page.locator('#wid')).toHaveText(/^w-/);
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    for (const view of ['capture', 'journal', 'case', 'backup']) {
      await page.locator(`[data-view=${view}]`).click();
      await expect(page.locator('#view-' + view)).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await page.locator('[data-view=capture]').click();
    await page.evaluate(() => document.fonts.ready);
    expect(await page.evaluate(() => document.fonts.check('16px "Bricolage Grotesque"'))).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`appeal-worker-${width}.png`), fullPage: true });
  }
  await page.goto('/verify'); await page.screenshot({ path: testInfo.outputPath('appeal-reviewer.png'), fullPage: true });
});
