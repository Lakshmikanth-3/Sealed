// Live demo + full UI test of https://sealedfiles.vercel.app with real NEAR testnet data.
// Usage: npm run demo:video   (writes demo/sealed-live-demo.webm and prints PASS/FAIL per step)
// Records one continuous video of the main browser page, with captions and a visible cursor.
// The second chat person runs in a separate, unrecorded browser.
import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = 'https://sealedfiles.vercel.app';
const OUT = process.argv[2] || 'demo';
fs.mkdirSync(OUT, { recursive: true });
const results = [];
const ok = (cond, msg) => { results.push([cond, msg]); console.log((cond ? 'PASS ' : 'FAIL ') + msg); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const t0 = Date.now(); const stamp = () => `${Math.round((Date.now() - t0) / 1000)}s`;

const browser = await chromium.launch({ channel: 'chrome', slowMo: 40 });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: { dir: OUT, size: { width: 1280, height: 720 } } });
// Caption bar + visible cursor on every page of the recorded context.
await ctx.addInitScript(() => {
  const mk = () => {
    if (document.getElementById('__demoCap')) return;
    const cap = document.createElement('div'); cap.id = '__demoCap';
    Object.assign(cap.style, { position: 'fixed', left: '16px', bottom: '16px', zIndex: 2147483647, maxWidth: '720px', background: 'rgba(17,17,17,.92)', color: '#fff',
      padding: '12px 16px', borderRadius: '12px', font: '15px/1.4 system-ui, sans-serif', boxShadow: '0 8px 30px rgba(0,0,0,.3)', display: 'none', pointerEvents: 'none' });
    document.documentElement.appendChild(cap);
    const cur = document.createElement('div'); cur.id = '__demoCur';
    Object.assign(cur.style, { position: 'fixed', left: '-40px', top: '-40px', width: '18px', height: '18px', borderRadius: '50%', background: 'rgba(255,107,26,.85)',
      border: '2px solid #fff', boxShadow: '0 0 0 2px rgba(0,0,0,.25)', zIndex: 2147483647, pointerEvents: 'none', transform: 'translate(-50%,-50%)', transition: 'left .08s, top .08s' });
    document.documentElement.appendChild(cur);
    addEventListener('mousemove', (e) => { cur.style.left = e.clientX + 'px'; cur.style.top = e.clientY + 'px'; }, true);
    addEventListener('mousedown', () => { cur.style.transform = 'translate(-50%,-50%) scale(.7)'; }, true);
    addEventListener('mouseup', () => { cur.style.transform = 'translate(-50%,-50%)'; }, true);
  };
  window.__cap = (title, text) => { mk(); const c = document.getElementById('__demoCap');
    c.innerHTML = ''; const b = document.createElement('b'); b.textContent = title; b.style.display = 'block'; b.style.color = '#ffb27a'; b.style.marginBottom = '2px';
    const s = document.createElement('span'); s.textContent = text; c.append(b, s); c.style.display = title ? 'block' : 'none'; };
  if (document.readyState !== 'loading') mk(); else addEventListener('DOMContentLoaded', mk);
});
// Premium pass bought on NEAR just before recording (Free allows 5 locks a day per visitor).
// Optional: a Premium pass (JSON {"pass": ...}) so the 5-a-day Free limit does not stop a long recording.
const pass = (() => { try { return JSON.parse(fs.readFileSync(process.env.DEMO_PLAN_PASS_FILE || 'demo/plan-pass.json', 'utf8')).pass; } catch { return null; } })();
if (pass) await ctx.addInitScript((p) => { try { if (location.hostname.endsWith('vercel.app')) localStorage.setItem('sealed:plan-pass', p); } catch {} }, pass);
const page = await ctx.newPage();
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
const cap = async (title, text, hold = 0) => { await page.evaluate(([a, b]) => window.__cap(a, b), [title, text]).catch(() => {}); if (hold) await sleep(hold); };
const go = async (path) => { await page.goto(BASE + path, { waitUntil: 'domcontentloaded' }); await sleep(900); };
const scrollTo = (sel, block = 'start') => page.evaluate(([s, b]) => document.querySelector(s)?.scrollIntoView({ behavior: 'smooth', block: b }), [sel, block]);
const setUnlockIn = (sec) => page.evaluate((s) => {
  const d = new Date(Date.now() + s * 1000), p = (n) => String(n).padStart(2, '0');
  const el = document.getElementById('unlockAt');
  el.value = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  el.dispatchEvent(new Event('input', { bubbles: true }));
}, sec);

// ---------------- 0. Title ----------------
await page.setContent(`<html><body style="margin:0;height:100vh;display:grid;place-items:center;background:#f6f5f3;font-family:system-ui">
  <div style="text-align:center"><div style="font:400 72px system-ui;letter-spacing:-2px">Sealed</div>
  <div style="font:20px ui-monospace,monospace;color:#6f6d69;margin-top:12px">Files that open on time · live demo on NEAR testnet</div>
  <div style="font:16px system-ui;color:#4a4845;margin-top:28px">Lock any file · one person or split between people · open by time or by merging · encrypted live chat</div></div></body></html>`);
await sleep(4000);

// ---------------- 1. Landing + 3D story ----------------
await go('/');
await cap('Sealed', 'Lock any photo, video, audio or document so nobody can open it early, not even you. The rules run on a NEAR smart contract.', 5000);
await page.mouse.move(640, 360);
await scrollTo('#story');
await cap('How it works, as a 3D story', 'A paper is written, sealed and encrypted, then opened either on a date and time (A) or only when its parts are merged (B).', 1500);
const chapters = await page.locator('.st-chap').count();
ok(chapters === 8, `landing story has 8 chapters (${chapters})`);
// let the story play through every chapter
for (let i = 0; i < 8; i++) {
  await page.locator('.st-chap').nth(i).click();
  const title = await page.textContent('.st-title');
  await cap(`Story ${i + 1} of 8: ${title}`, await page.textContent('.st-text'), i === 0 ? 6500 : i === 7 ? 11000 : 5200);
}
await scrollTo('.ticker', 'center');
await cap('Live numbers', 'These are read right now from NEAR and the public activity log: files locked, transactions, blocked attempts.', 3500);
const liveSeals = (await page.textContent('#sSeals')).trim();
ok(/^\d[\d,]*$/.test(liveSeals), `live file count from NEAR shown (${liveSeals})`);
await scrollTo('#proof');
await cap('Checked live, not promised', 'Contract status, response time and the latest recorded event, straight from the NEAR testnet.', 4500);

// ---------------- 2. Lock a file: one person, on a date and time ----------------
await go('/app#seal');
await cap('Lock a file · step 1', 'Choose any file. Here: a results letter. It is encrypted in the browser before it leaves the device.', 1500);
const secretA = `Class 10 results: Asha 92%, Bala 88%. Published ${new Date().toUTCString()}.`;
await page.setInputFiles('#file', { name: 'results-letter.txt', mimeType: 'text/plain', buffer: Buffer.from(secretA) });
await page.fill('#label', 'Class 10 results'); await sleep(800);
await cap('Step 2 · Who is it for?', 'One person, with a private link.', 1200);
await page.check('input[name=mode][value=single]'); await sleep(800);
await cap('Step 3 · How does it unlock?', 'On a date and time. For the demo it opens in about 2 minutes.', 1000);
await page.check('input[name=unlock][value=time]');
await setUnlockIn(130); await sleep(1500);
await scrollTo('#sealBtn', 'center'); await sleep(600);
await page.click('#sealBtn');
await cap('Locking on NEAR…', 'The encrypted file is stored and create_seal is sent to the smart contract.', 0);
await page.waitForSelector('#sealedSummary:not(:empty)', { timeout: 120000 });
const sealA = await page.evaluate(() => JSON.parse(localStorage.getItem('sealed-paper:mine'))[0]);
ok(Boolean(sealA?.sealId && sealA.createTx), `time-locked file created on NEAR (tx ${sealA?.createTx?.slice(0, 10)}…)`);
await scrollTo('#sealedSummary', 'center');
await cap('Locked', 'The summary links to the real transaction on the public NEAR explorer. Share the link by WhatsApp, email or QR.', 4500);

// ---------------- 3. Someone tries to open it early ----------------
await go(`/s/${sealA.sealId}`);
await page.waitForFunction(() => !document.getElementById('openBtn').disabled, null, { timeout: 60000 });
await cap('The receiver opens the link too early', 'There is a live countdown. Pressing Open now asks the NEAR contract, which refuses.', 3000);
await page.click('#openBtn');
await page.waitForSelector('#result:not(.hidden)', { timeout: 90000 });
const early = await page.textContent('#result');
ok(/still locked|too early/i.test(early), 'early opening refused by the contract');
await cap('Refused and recorded', 'The attempt is written to NEAR (time, device, rough location) and the owner is alerted. It cannot be deleted.', 5000);
await scrollTo('#log', 'center'); await sleep(3500);

// ---------------- 4. Split between people, unlock only when merged ----------------
await go('/app#seal');
await cap('Second way: split between people', 'An exam paper whose key is split into 3 parts. No time: it opens only when 2 of the 3 parts are merged.', 1500);
const secretB = 'EXAM PAPER, Maths Class 10\nQ1. Solve 2x + 6 = 14\nQ2. Find the area of a circle of radius 7 cm\nQ3. Factorise x^2 - 9';
await page.setInputFiles('#file', { name: 'maths-exam-paper.txt', mimeType: 'text/plain', buffer: Buffer.from(secretB) });
await page.fill('#label', 'Maths exam paper');
await page.check('input[name=mode][value=split]'); await sleep(700);
await page.click('.preset[data-k="2"][data-n="3"]'); await sleep(700);
const rows = page.locator('.holder-row:not(.hidden) .h-label');
for (const [i, n] of ['Principal', 'Exam officer', 'Board member'].entries()) await rows.nth(i).fill(n);
await page.check('input[name=unlock][value=merge]'); await sleep(900);
await scrollTo('#mergeNote', 'center');
await cap('Only when merged', 'Each person gets one part. One part alone reveals nothing. 2 of 3 parts must be merged to open it.', 3000);
const lockedBAt = Date.now();
await page.click('#sealBtn');
await cap('Locking on NEAR…', 'The contract stores a commitment for each part, and a NEAR account is set up for each person.', 0);
await page.waitForSelector('#holderList a[href*="/h/"]', { timeout: 150000 });
const holderLinks = [...new Set(await page.$$eval('#holderList a[href*="/h/"]', (as) => as.map((a) => a.href).filter((h) => h.startsWith(location.origin + '/h/'))))];
const sealB = await page.evaluate(() => JSON.parse(localStorage.getItem('sealed-paper:mine'))[0]);
ok(holderLinks.length === 3, `3 private part links made (${holderLinks.length})`);
await scrollTo('#holderLinks', 'center');
await cap('One private link per person', 'Each link carries that person\'s encrypted key part. Send each one only to its owner.', 4000);

await go(`/s/${sealB.sealId}`);
await page.waitForFunction(() => document.getElementById('title').textContent !== 'Loading…', null, { timeout: 60000 });
const kindB = (await page.textContent('#kind')).trim();
ok(/merged/i.test(kindB), `open page explains merge-only (${kindB})`);
await cap('No countdown, a parts counter', 'This file has no time limit: it shows how many parts are merged so far (0 of 2).', 4000);

// the contract needs its earliest time (about 45 s after locking) before parts can be merged
for (const [i, link] of holderLinks.slice(0, 2).entries()) {
  await page.goto(link); await page.waitForFunction(() => document.getElementById('title').textContent !== 'Loading…', null, { timeout: 60000 });
  await sleep(1000);
  await cap(`Person ${i + 1} opens their private link`, 'They see the file name and a "Merge my part" button. Their part is sent to the contract and checked against its commitment.', 2500);
  const wait = 50000 - (Date.now() - lockedBAt);
  if (wait > 0) { await cap('A few seconds…', 'NEAR needs the unlock time to be in the future, so merge-only files accept parts about 45 seconds after locking.', wait); }
  await page.click('#releaseBtn');
  await page.waitForSelector('#result:not(.hidden)', { timeout: 120000 });
  const res = await page.textContent('#result h2');
  ok(/merged|recorded/i.test(res), `person ${i + 1} merged their part (${res.trim()})`);
  await cap(res.trim(), 'release_part is recorded on NEAR.', 3000);
}
await go(`/s/${sealB.sealId}`);
await page.waitForFunction(() => !document.getElementById('openBtn').disabled, null, { timeout: 60000 });
await cap('2 of 3 parts merged', 'Now anyone with the link can open it. The key is rebuilt from the parts and the file is decrypted in this browser.', 2500);
let openedB = false;
for (let i = 0; i < 6 && !openedB; i++) {
  await page.click('#openBtn'); await page.waitForSelector('#result:not(.hidden)', { timeout: 120000 });
  openedB = (await page.textContent('#result')).includes('Solve 2x + 6 = 14');
  if (!openedB) await sleep(4000);
}
ok(openedB, 'merged file opened and decrypted to the original text');
await scrollTo('#result', 'center');
await cap('Opened by merging', 'The decrypted exam paper. Its fingerprint matches the one recorded on NEAR when it was locked, so it was not changed.', 6000);

// ---------------- 5. Back to the time-locked file ----------------
const left = sealA.unlockAtMs - Date.now();
await go(`/s/${sealA.sealId}`);
await page.waitForFunction(() => !document.getElementById('openBtn').disabled, null, { timeout: 60000 });
if (left > 0) await cap('Back to the results letter', `It opens by itself at the chosen time. ${Math.ceil(left / 1000)} seconds to go…`, left + 2500);
await cap('The time is reached', 'The contract now says "open", the key is released and the letter decrypts on its own.', 0);
let openedA = false;
for (let i = 0; i < 20 && !openedA; i++) { openedA = (await page.textContent('body')).includes('Asha 92%'); if (!openedA) await sleep(3000); }
if (!openedA) { await page.click('#openBtn'); await page.waitForSelector('#result:not(.hidden)', { timeout: 120000 }); openedA = (await page.textContent('#result')).includes('Asha 92%'); }
ok(openedA, 'time-locked file opened automatically at its time');
await scrollTo('#result', 'center'); await sleep(4000);

// ---------------- 6. Proof page ----------------
await go('/proof'); await sleep(1500);
await cap('Proof page', 'Every action above is a real NEAR testnet transaction. Each line links to the public explorer.', 3000);
const rowsProof = await page.locator('.proof-table tbody tr').count();
ok(rowsProof > 0, `proof page lists real transactions (${rowsProof})`);
await page.mouse.wheel(0, 700); await sleep(4000);

// ---------------- 7. Exam papers + leak tracing ----------------
await go('/app#exam');
await cap('Exam papers', 'One paper per centre: same questions, different order and wording. If a copy leaks, find the centre.', 1500);
const qs = [
  'Q: What is 7 x 8?\nA) 54\nB) 56 *\nC) 58\nD) 64', 'Q: What is the capital of Japan?\nA) Osaka\nB) Kyoto\nC) Tokyo *\nD) Nagoya',
  'Q: Which gas do plants absorb?\nA) Oxygen\nB) Nitrogen\nC) Carbon dioxide *\nD) Helium', 'Q: How many sides does a hexagon have?\nA) 5\nB) 6 *\nC) 7\nD) 8',
  'Q: Who wrote Romeo and Juliet?\nA) Dickens\nB) Shakespeare *\nC) Austen\nD) Tolstoy', 'Q: What is the boiling point of water at sea level?\nA) 90 C\nB) 100 C *\nC) 110 C\nD) 120 C',
  'Q: Which planet is the largest?\nA) Saturn\nB) Earth\nC) Jupiter *\nD) Neptune', 'Q: What is 15% of 200?\nA) 20\nB) 25\nC) 30 *\nD) 35',
];
await page.fill('#examText', qs.join('\n\n')); await page.fill('#examTitleIn', 'Science and Maths, Class 10');
await page.click('#genVersions');
await page.waitForSelector('.version-grid article', { timeout: 30000 });
const versions = await page.locator('.version-grid article').count();
ok(versions === 3, `3 centre versions made (${versions})`);
await scrollTo('.version-grid', 'start');
await cap('3 different papers', 'Each centre gets its own version. Lock each one with "Lock a file" so it opens at 09:00 in that centre.', 4500);
const leak = await page.textContent('.version-grid article:nth-child(2) pre');
await page.fill('#leakText', leak);
await scrollTo('#leakText', 'center');
await cap('A paper leaked on WhatsApp', 'Paste the leaked text. The order and wording point to the centre it came from. Works offline, no AI service.', 2000);
await page.click('#trace'); await sleep(1500);
const trace = (await page.textContent('#traceResult')).replace(/\s+/g, ' ');
ok(/Centre 2/.test(trace), `leak traced to Centre 2 (${trace.slice(0, 70)})`);
await scrollTo('#traceResult', 'center');
await cap('Found the centre', 'The result can be saved and its fingerprint recorded on NEAR as evidence.', 5000);

// ---------------- 8. Live chat (two people) ----------------
await go('/app#message');
await cap('Live chat, like WhatsApp', 'Two people, end-to-end encrypted. The key is only in the invite link, so the server never sees the messages.', 2000);
await page.fill('#chatName', 'Asha'); await page.click('#chatNewBtn');
await page.waitForURL(/\/c\//); await page.waitForSelector('#invite:not(.hidden)');
const invite = await page.textContent('#inviteLink');
ok(invite.includes('#k='), 'chat created with the key only in the link');
await cap('Invite one person', 'Share the link on WhatsApp or copy it. Only the first person who opens it can join.', 3500);

const other = await browser.newContext({ viewport: { width: 420, height: 800 } });
const b = await other.newPage();
await b.goto(invite); await b.fill('#joinName', 'Bala'); await b.click('#joinBtn');
await page.waitForFunction(() => document.getElementById('otherName').textContent === 'Bala', null, { timeout: 30000 });
ok(true, 'second person joined from another browser');
await cap('Bala joined from another phone', 'Online status, typing… and read ticks work like WhatsApp.', 2500);
await b.type('#text', 'Hi Asha! Did the results letter open for you?', { delay: 30 });
await b.press('#text', 'Enter');
await page.waitForSelector('.wa-msg.in >> text=Did the results letter open', { timeout: 30000 });
await sleep(1500);
await page.type('#text', 'Yes, right at the time. Nobody could open it before.', { delay: 35 }); await page.press('#text', 'Enter');
await b.bringToFront(); await b.evaluate(() => window.dispatchEvent(new Event('focus')));
await page.waitForSelector('.wa-msg.out .wa-tick.read', { timeout: 30000 }).catch(() => {});
ok(await page.locator('.wa-msg.out .wa-tick.read').count() > 0, 'blue read ticks after the other person reads');
await cap('Read ticks', 'Grey ✓✓ when delivered, blue ✓✓ when read.', 2500);
await cap('Send any file', 'Documents, photos, videos, audio and voice notes are encrypted on the phone before upload.', 0);
await page.setInputFiles('#attach', { name: 'answer-key.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n% Answer key\nQ1 B  Q2 C  Q3 C  Q4 B\n%%EOF') });
await b.waitForSelector('.wa-msg.in .wa-doc', { timeout: 60000 });
ok(true, 'document sent, received and decrypted');
await sleep(2500);
const photo = await b.screenshot({ type: 'png', clip: { x: 0, y: 0, width: 420, height: 300 } });
await b.setInputFiles('#attach', { name: 'centre-photo.png', mimeType: 'image/png', buffer: photo });
await page.waitForSelector('.wa-msg.in img.wa-img', { timeout: 60000 });
ok(true, 'photo sent from the other phone and shown');
await sleep(3000);
await cap('View once', 'This message can be opened once. After that it is deleted from the server.', 0);
await page.click('#toggleOpts'); await page.check('#viewOnce'); await sleep(800);
await page.type('#text', 'The exam starts at 09:00. Delete after reading.', { delay: 30 }); await page.press('#text', 'Enter');
await b.waitForSelector('.wa-once', { timeout: 30000 }); await b.click('.wa-once'); await sleep(1200); await b.click('#viewerClose');
await page.waitForSelector('.wa-msg.out.gone', { timeout: 30000 });
ok(true, 'view-once message opened once, sender sees "Opened"');
await cap('Opened, and gone', 'The sender sees it was opened. The server no longer has it.', 3500);
await cap('Sealed until a time, inside chat', 'The ⏱ button seals a message until a time. The other person sees a locked bubble with a countdown.', 0);
await page.click('#toggleOpts'); await page.click('[data-min="1"]'); await sleep(600);
await page.type('#text', 'Answer key for Q1: B', { delay: 30 }); await page.press('#text', 'Enter');
await b.waitForSelector('.wa-msg.locked', { timeout: 30000 });
ok(await b.locator('text=Answer key for Q1').count() === 0, 'timed chat message stays sealed for the receiver');
await sleep(4000);
await other.close();

// ---------------- 9. Plans ----------------
await go('/app#plans'); await sleep(1500);
const planText = (await page.textContent('#planStatus')).trim();
ok(/Premium is active/i.test(planText), `Premium shown as active (${planText.slice(0, 60)})`);
await scrollTo('#planStatus', 'center');
await cap('Free and Premium', 'Free: 5 files a day. Premium was paid in NEAR to the plans contract before this recording, and one signature activated it here.', 6000);

// ---------------- 10. End ----------------
ok(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
await cap('', '');
await page.setContent(`<html><body style="margin:0;height:100vh;display:grid;place-items:center;background:#111;color:#fff;font-family:system-ui">
  <div style="text-align:center"><div style="font:400 64px system-ui;letter-spacing:-2px">Sealed</div>
  <div style="font:18px ui-monospace,monospace;color:#bbb;margin-top:12px">sealedfiles.vercel.app · github.com/Lakshmikanth-3/Sealed</div>
  <div style="font:16px system-ui;color:#999;margin-top:24px">Every step in this video was a real transaction on NEAR testnet.</div></div></body></html>`);
await sleep(4500);

await cap('', '');
const video = page.video();
await page.close(); await ctx.close(); await browser.close();
const src = await video.path();
const dest = `${OUT}/sealed-live-demo.webm`;
fs.copyFileSync(src, dest);
const fails = results.filter(([c]) => !c).length;
console.log(`\n${results.length - fails}/${results.length} checks passed · video ${dest} · ${(fs.statSync(dest).size / 1048576).toFixed(1)} MB · ${stamp()}`);
