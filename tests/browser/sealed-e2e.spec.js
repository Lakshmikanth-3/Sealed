// Live end-to-end on NEAR testnet (npm run test:e2e). Follows the PRD flow:
// seal split + single, early refusals with alerts, release after unlock, open, tamper.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';

const DATA = path.join(tmpdir(), 'sealed-paper-e2e', 'seals');
const pdf = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/MediaBox[0 0 200 200]/Parent 2 0 R>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n' + 'Q1. Exam question text. '.repeat(200));
const pad = (n) => String(n).padStart(2, '0');
const local = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; };

test('seal, refuse early, release K of N, open, auto-open single, detect tampering', async ({ page, context }) => {
  const errors = []; context.on('page', (p) => p.on('pageerror', (e) => errors.push(e.message))); page.on('pageerror', (e) => errors.push(e.message));
  async function seal({ name, mime, bytes, mode, k, n, inSec }) {
    await page.goto('/app?t=' + Date.now() + '#seal');
    await page.setInputFiles('#file', { name, mimeType: mime, buffer: bytes });
    await page.fill('#label', `E2E ${name}`);
    await page.check(`input[name=mode][value=${mode}]`);
    if (mode === 'split') { await page.fill('#n', String(n)); await page.fill('#k', String(k)); await page.dispatchEvent('#n', 'input'); }
    await page.fill('#ownerEmail', 'owner@example.com');
    const unlockAt = Math.ceil((Date.now() + inSec * 1000) / 1000) * 1000;
    await page.selectOption('#tz', 'local'); await page.fill('#unlockAt', local(unlockAt));
    await page.click('#sealBtn');
    await expect(page.locator('#sealed')).toBeVisible({ timeout: 120_000 });
    const sealId = await page.evaluate(() => JSON.parse(localStorage.getItem('sealed-paper:mine'))[0].sealId);
    return { sealId, unlockAt, holders: await page.$$eval('#holderList a[href*="/h/"]', (as) => as.map((a) => a.href)) };
  }
  async function release(url) {
    const p = await context.newPage(); await p.goto(url); await expect(p.locator('#title')).not.toHaveText('Loading…');
    await p.click('#releaseBtn'); await expect(p.locator('#result')).toBeVisible({ timeout: 90_000 });
    const h = await p.locator('#result h2').innerText(); await p.close(); return h;
  }
  async function open(sealId, until) {
    const p = await context.newPage(); await p.goto(`/s/${sealId}`); await expect(p.locator('#title')).not.toHaveText('Loading…');
    for (let i = 0; i < 6; i++) {
      await p.click('#openBtn'); await expect(p.locator('#result')).toBeVisible({ timeout: 90_000 });
      if (!(await p.locator('#result.waiting').count()) || !until) break; // holders' releases may still be propagating
      await p.waitForTimeout(4000);
    }
    return p;
  }

  const split = await seal({ name: 'exam-paper.pdf', mime: 'application/pdf', bytes: pdf, mode: 'split', k: 2, n: 3, inSec: 75 });
  expect(split.holders).toHaveLength(3);
  expect(fs.readFileSync(path.join(DATA, `${split.sealId}.sealed`)).includes(Buffer.from('Exam question text'))).toBe(false);

  expect(await release(split.holders[0])).toMatch(/too early/i);
  let p = await open(split.sealId); await expect(p.locator('#result h2')).toHaveText(/still locked/i); await p.close();

  const single = await seal({ name: 'note.txt', mime: 'text/plain', bytes: Buffer.from('Results are embargoed until the bell.\n'), mode: 'single', inSec: 45 });

  await page.waitForTimeout(Math.max(0, split.unlockAt - Date.now() + 4000));
  expect(await release(split.holders[0])).toMatch(/yes is recorded/i);
  expect(await release(split.holders[2])).toMatch(/yes is recorded/i);
  p = await open(split.sealId, true);
  await expect(p.locator('#result.open')).toContainText(/same file that was locked/i);
  const download = p.waitForEvent('download'); await p.click('#result a[download]');
  expect(fs.readFileSync(await (await download).path()).equals(pdf)).toBe(true);
  await p.close();

  p = await context.newPage(); await p.goto(`/s/${single.sealId}`);
  await expect(p.locator('#result.open')).toContainText(/embargoed until the bell/, { timeout: 120_000 });
  await expect(p.locator('#result.open')).toContainText(/Opened automatically/i); await p.close();

  const file = path.join(DATA, `${split.sealId}.sealed`), bytes = fs.readFileSync(file); bytes[bytes.length - 5] ^= 0xff; fs.writeFileSync(file, bytes);
  p = await open(split.sealId); await expect(p.locator('#result h2')).toHaveText(/FILE TAMPERED/i); await p.close();

  await page.waitForTimeout(8000);
  await page.goto('/app?r=' + Date.now() + '#seals');
  const card = page.locator(`.seal-card[data-id="${split.sealId}"]`);
  await card.locator('details').first().click();
  const alerts = card.locator('[data-alerts]');
  await expect(alerts).toContainText(/Trusted person attempted too early/i); await expect(alerts).toContainText(/Attempted to open too early/i);
  await expect(alerts).toContainText(/File was changed/i); await expect(alerts).toContainText(/approx\. location/i);
  expect(await alerts.locator('a', { hasText: 'Saved in the public record' }).count()).toBeGreaterThanOrEqual(2);

  await page.goto(`/verify?id=${split.sealId}`);
  await expect(page.locator('#verdict')).toHaveText(/Real locked file · open now/i, { timeout: 30_000 });
  expect(errors).toEqual([]);
});
