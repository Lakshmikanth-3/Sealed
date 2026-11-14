// Render the brand images: docs/brand/banner.png (1280 × 640, GitHub social preview)
// and docs/brand/logo-512.png from public/logo.svg. Usage: node scripts/render-brand.js
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const out = path.join(root, 'docs', 'brand');
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });
const banner = await browser.newPage({ viewport: { width: 1280, height: 640 } });
await banner.goto(pathToFileURL(path.join(out, 'banner.html')).href);
await banner.waitForTimeout(500);
await banner.screenshot({ path: path.join(out, 'banner.png') });
const logo = await browser.newPage({ viewport: { width: 512, height: 512 } });
await logo.setContent(`<body style="margin:0;background:transparent">${fs.readFileSync(path.join(root, 'public', 'logo.svg'), 'utf8')}</body>`);
await logo.screenshot({ path: path.join(out, 'logo-512.png'), omitBackground: true });
await browser.close();
console.log('wrote docs/brand/banner.png and docs/brand/logo-512.png');
