// Two separate browsers (two people) use the live chat against a running server.
// Usage: node scripts/chat-smoke.js [baseUrl] [screenshotDir]
import { chromium } from 'playwright';
const base = process.argv[2] || 'http://localhost:8787', out = process.argv[3] || null;
const b = await chromium.launch({ channel: 'chrome' });
const A = await b.newContext({ viewport: { width: 900, height: 820 } }), B = await b.newContext({ viewport: { width: 390, height: 780 } });
const pa = await A.newPage(), pb = await B.newPage();
const errors = []; for (const p of [pa, pb]) p.on('pageerror', (e) => errors.push(e.message));
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };

await pa.goto(base + '/app#message');
await pa.fill('#chatName', 'Asha'); await pa.click('#chatNewBtn');
await pa.waitForURL(/\/c\//); await pa.waitForSelector('#invite:not(.hidden)');
const link = await pa.textContent('#inviteLink');
ok(link.includes('#k='), 'creator gets an invite link with the key in the fragment');
ok(!(await pa.evaluate(() => location.hash)), 'key removed from the address bar');

await pb.goto(link);
await pb.fill('#joinName', 'Bala'); await pb.click('#joinBtn');
await pa.waitForFunction(() => document.getElementById('otherName').textContent === 'Bala', null, { timeout: 15000 });
ok(true, 'creator sees "Bala" joined');
await pb.waitForFunction(() => document.getElementById('otherName').textContent === 'Asha', null, { timeout: 15000 });
ok(true, 'joiner sees "Asha"');

await pa.fill('#text', 'Hi Bala, paper is ready'); await pa.press('#text', 'Enter');
await pb.waitForSelector('.wa-msg.in >> text=Hi Bala, paper is ready', { timeout: 15000 });
ok(true, 'message arrives at the other person');
await pb.bringToFront(); await pb.evaluate(() => window.dispatchEvent(new Event('focus')));
await pa.waitForSelector('.wa-msg.out .wa-tick:text("✓✓")', { timeout: 15000 });
ok(true, 'sender sees double tick');

await pb.type('#text', 'Thanks');
await pa.waitForFunction(() => document.getElementById('otherStatus').textContent === 'typing…', null, { timeout: 15000 });
ok(true, 'typing… shown');
await pb.press('#text', 'Enter');
await pa.waitForSelector('.wa-msg.in >> text=Thanks', { timeout: 15000 });
ok(true, 'reply arrives');

// timed message: opens in 1 minute
await pa.click('#toggleOpts'); await pa.click('[data-min="1"]'); await pa.fill('#text', 'Answer key: B'); await pa.press('#text', 'Enter');
await pb.waitForSelector('.wa-msg.locked', { timeout: 15000 });
ok(!(await pb.locator('text=Answer key: B').count()), 'timed message stays sealed for the other person');
if (out) { await pa.screenshot({ path: out + '/chat-a.png' }); await pb.screenshot({ path: out + '/chat-b.png' }); }

// view once
await pa.click('#toggleOpts'); await pa.check('#viewOnce'); await pa.fill('#text', 'Burn after reading'); await pa.press('#text', 'Enter');
await pb.waitForSelector('.wa-once', { timeout: 15000 }); await pb.click('.wa-once');
ok((await pb.textContent('#viewerBody')).includes('Burn after reading'), 'view-once opens once');
await pb.click('#viewerClose');
await pa.waitForSelector('.wa-msg.out.gone >> text=Opened', { timeout: 15000 });
ok(true, 'sender sees it was opened');

// a third person is refused
const C = await b.newContext(), pc = await C.newPage();
await pc.goto(link); await pc.fill('#joinName', 'Eve'); await pc.click('#joinBtn');
await pc.waitForSelector('.toast:not(.hidden)'); ok((await pc.textContent('.toast')).includes('two people'), 'third person refused');

console.log('waiting for the timed message to open…');
await pb.waitForSelector('.wa-msg.in >> text=Answer key: B', { timeout: 90000 });
ok(true, 'timed message opens on time');
if (out) await pb.screenshot({ path: out + '/chat-b2.png' });
ok(errors.length === 0, 'no page errors ' + errors.join(' | '));
await b.close();
