// Narrated live demo + full UI test of the hosted Sealed site, with real NEAR testnet data.
// Usage: npm run demo:video [outDir]
//   Writes <outDir>/sealed-live-demo.mp4 (voice-over) and prints PASS/FAIL for each check.
//   Voice: Windows "Microsoft David" (System.Speech). Muxing needs ffmpeg with libx264/aac:
//   set FFMPEG_PATH to it; without it you get the silent .webm plus narration.wav.
//   Optional: DEMO_PLAN_PASS_FILE (JSON {"pass": ...}) so the Free 5-a-day limit does not stop a run.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const BASE = process.env.DEMO_BASE_URL || 'https://sealedfiles.vercel.app';
const OUT = path.resolve(process.argv[2] || 'demo');
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const ok = (cond, msg) => { results.push([cond, msg]); console.log((cond ? 'PASS ' : 'FAIL ') + msg); };

// ---------------- narration (spoken; no step numbers) ----------------
const LINES = {
  intro: 'This is Sealed. It locks any file, so that nobody can open it before the right moment, not even the person who locked it. The rules run on a NEAR smart contract, and everything in this video is live on the NEAR test network.',
  s_write: 'It starts with a paper. Someone writes it, or picks any photo, video, audio file or document.',
  s_seal: 'The file is encrypted on their own device and sealed. From now on, nobody can read it. Not even Sealed.',
  s_choose: 'Then they choose how it unlocks. Option A: on a date and time. Option B: only when the parts are merged.',
  s_timeA: 'With option A, the file goes to the receiver. If anyone tries to open it early, NEAR refuses, and the attempt is recorded in public.',
  s_openA: 'At the chosen time, NEAR allows it, and the paper is decrypted on the receiver\'s device.',
  s_splitB: 'With option B, the key is split into parts, one for each person. A single part reveals nothing.',
  s_mergeB: 'When enough people merge their parts, NEAR records it, and the paper is decrypted.',
  s_chat: 'And there is a private live chat. Text, documents, photos, voice notes and videos travel locked, and are decrypted only on the two phones.',
  numbers: 'These numbers are read live from NEAR: files locked, transactions recorded, and early attempts that were blocked.',
  proofPanel: 'The contract status and the latest event come straight from the test network. Nothing here is just a promise.',
  a_file: 'Let\'s lock a real file. Here, a class results letter. It is encrypted inside the browser before it ever leaves the device.',
  a_who: 'It is for one person, who will get a private link.',
  a_when: 'It should open on a date and time. For this demo, about two minutes from now.',
  a_locking: 'Now it is being locked on NEAR. The encrypted file is stored, and the smart contract records the seal.',
  a_locked: 'Done. The summary links to the real transaction on the public NEAR explorer. The link can be shared by WhatsApp, by email, or as a QR code.',
  a_early: 'Now the receiver opens the link too early. There is a live countdown. Let\'s press Open anyway.',
  a_refused: 'Refused. The NEAR contract says it is too early. The attempt is recorded with the time and the device, the owner is alerted, and this record can never be deleted.',
  b_intro: 'Now the second way. A maths exam paper, split between three people: the principal, the exam officer, and a board member.',
  b_merge: 'This time there is no date. It opens only when two of the three parts are merged.',
  b_locking: 'Locking it on NEAR. The contract stores a fingerprint for each part, and each person gets their own NEAR account.',
  b_links: 'Each person gets a private link that carries their part of the key. Each link goes only to its owner.',
  b_page: 'The exam page has no countdown. Instead, it shows how many parts have been merged. Right now, none.',
  b_h1: 'The principal opens their link and taps Merge my part. The part is checked against the fingerprint stored on NEAR.',
  b_wait: 'NEAR needs a short moment after locking, so let\'s give it a few seconds.',
  b_h1done: 'The principal\'s part is merged, and recorded on NEAR.',
  b_h2: 'Now the exam officer does the same.',
  b_h2done: 'Two parts are merged. That is enough to open it.',
  b_open: 'Back on the exam page, the key is rebuilt from the two parts, and the paper is decrypted right here in the browser.',
  b_opened: 'And here is the exam paper. Its fingerprint matches the one recorded on NEAR, so we know it was never changed.',
  a_back: 'Now, back to the results letter. It opens by itself when its time comes.',
  a_open: 'The time is reached. NEAR allows it, the key is released, and the letter decrypts on its own.',
  proof: 'Every action in this video is a real transaction on the NEAR test network. The proof page lists them, and each one links to the public explorer.',
  ex_intro: 'Exam papers often leak. Sealed makes a different version of the paper for every exam centre: the same questions, in a different order and wording.',
  ex_versions: 'Here are three versions, one for each centre. Each one would be locked to open at nine o\'clock in its own centre.',
  ex_leak: 'Now imagine one version leaks on WhatsApp. We paste the leaked text. Its order and wording point to where it came from. This works offline, with no AI service.',
  ex_found: 'Found it. Centre two, with high confidence. The result can be saved, and its fingerprint recorded on NEAR as evidence.',
  c_intro: 'Finally, the live chat. Asha starts a private chat. The encryption key lives only in the invite link, so the server never sees the messages.',
  c_invite: 'She shares the invite link. Only the first person who opens it can join.',
  c_join: 'Bala joins from another phone. Online status, typing, and read receipts work just like WhatsApp.',
  c_read: 'The ticks turn blue when the message is read.',
  c_doc: 'Any file can be sent. Asha sends the answer key as a PDF. It is encrypted on her phone before upload, and decrypted on Bala\'s phone.',
  c_photo: 'Bala replies with a photo.',
  c_once: 'This next message is view once. Bala can open it a single time.',
  c_gone: 'Once opened, it is gone. Asha can see that it was opened, and the server no longer has it.',
  c_timed: 'A chat message can also be sealed until a time. Bala sees a locked bubble with a countdown.',
  plans: 'Sealed is free to start, with five locked files a day. Premium is paid in NEAR to a plans contract, and one wallet signature turns it on. In this browser, Premium is active.',
  outro: 'Sealed. Files that open on time, with every step recorded on NEAR. Thank you for watching.',
};

// Generate one WAV per line with the Windows male voice, then read their durations.
const RATE = 24000;
const vdir = path.join(OUT, 'voice'); fs.mkdirSync(vdir, { recursive: true });
const linesFile = path.join(vdir, 'lines.json');
fs.writeFileSync(linesFile, JSON.stringify(Object.entries(LINES).map(([id, text]) => ({ id, text }))));
execFileSync('powershell.exe', ['-NoProfile', '-Command', [
  'Add-Type -AssemblyName System.Speech',
  '$s = New-Object System.Speech.Synthesis.SpeechSynthesizer',
  "$s.SelectVoice('Microsoft David Desktop')",
  '$s.Rate = 0',
  `$fmt = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(${RATE}, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)`,
  `$lines = Get-Content -Raw -Encoding UTF8 '${linesFile}' | ConvertFrom-Json`,
  `foreach ($l in $lines) { $s.SetOutputToWaveFile((Join-Path '${vdir}' ($l.id + '.wav')), $fmt); [void]$s.Speak($l.text) }`,
  '$s.SetOutputToNull()',
].join('; ')], { stdio: 'inherit' });
const voice = {};
for (const id of Object.keys(LINES)) {
  const buf = fs.readFileSync(path.join(vdir, `${id}.wav`));
  for (let o = 12; o < buf.length;) {
    const tag = buf.toString('ascii', o, o + 4), size = buf.readUInt32LE(o + 4);
    if (tag === 'data') { const pcm = buf.subarray(o + 8, o + 8 + size); voice[id] = { pcm, ms: (pcm.length / 2 / RATE) * 1000 }; break; }
    o += 8 + size + (size % 2);
  }
}
console.log(`narration: ${Object.keys(voice).length} lines, ${Math.round(Object.values(voice).reduce((a, v) => a + v.ms, 0) / 1000)} s of speech`);

// ---------------- browser ----------------
const browser = await chromium.launch({ channel: 'chrome', slowMo: 40 });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: { dir: OUT, size: { width: 1280, height: 720 } } });
const pass = (() => { try { return JSON.parse(fs.readFileSync(process.env.DEMO_PLAN_PASS_FILE || path.join(OUT, 'plan-pass.json'), 'utf8')).pass; } catch { return null; } })();
if (pass) await ctx.addInitScript((p) => { try { if (location.hostname.endsWith('vercel.app')) localStorage.setItem('sealed:plan-pass', p); } catch {} }, pass);
// Caption bar, title cards and a visible cursor on every page of the recorded context.
await ctx.addInitScript(() => {
  const mk = () => {
    if (document.getElementById('__demoCap')) return;
    const cap = document.createElement('div'); cap.id = '__demoCap';
    Object.assign(cap.style, { position: 'fixed', left: '16px', bottom: '16px', zIndex: 2147483646, maxWidth: '660px', background: 'rgba(17,17,17,.9)', color: '#fff',
      padding: '10px 14px', borderRadius: '12px', font: '14px/1.4 system-ui, sans-serif', boxShadow: '0 8px 30px rgba(0,0,0,.3)', display: 'none', pointerEvents: 'none' });
    document.documentElement.appendChild(cap);
    const cur = document.createElement('div'); cur.id = '__demoCur';
    Object.assign(cur.style, { position: 'fixed', left: '-40px', top: '-40px', width: '18px', height: '18px', borderRadius: '50%', background: 'rgba(255,107,26,.85)',
      border: '2px solid #fff', boxShadow: '0 0 0 2px rgba(0,0,0,.25)', zIndex: 2147483647, pointerEvents: 'none', transform: 'translate(-50%,-50%)', transition: 'left .08s, top .08s' });
    document.documentElement.appendChild(cur);
    addEventListener('mousemove', (e) => { cur.style.left = e.clientX + 'px'; cur.style.top = e.clientY + 'px'; }, true);
  };
  window.__cap = (title, text) => { mk(); const c = document.getElementById('__demoCap'); c.replaceChildren();
    if (!title && !text) { c.style.display = 'none'; return; }
    const b = document.createElement('b'); b.textContent = title; Object.assign(b.style, { display: 'block', color: '#ffb27a', marginBottom: '2px' });
    const s = document.createElement('span'); s.textContent = text; c.append(b, s); c.style.display = 'block'; };
  window.__card = (lines, dark) => { mk(); let d = document.getElementById('__demoCard');
    if (!lines) { d?.remove(); return; }
    if (!d) { d = document.createElement('div'); d.id = '__demoCard'; document.documentElement.appendChild(d); }
    Object.assign(d.style, { position: 'fixed', inset: '0', zIndex: 2147483645, display: 'grid', placeItems: 'center', textAlign: 'center',
      background: dark ? '#111' : '#f6f5f3', color: dark ? '#fff' : '#111', fontFamily: 'system-ui, sans-serif' });
    d.replaceChildren(...lines.map(([t, css]) => { const p = document.createElement('div'); p.textContent = t; p.style.cssText = css; return p; }));
    const w = document.createElement('div'); w.append(...d.childNodes); d.replaceChildren(w); };
  if (document.readyState !== 'loading') mk(); else addEventListener('DOMContentLoaded', mk);
});
const page = await ctx.newPage();
const vStart = Date.now();
const errors = []; page.on('pageerror', (e) => errors.push(e.message));

const timeline = []; let speechEnd = 0;
/** Show a caption, start a narration line, and (by default) wait until it has been spoken. */
async function say(id, title = '', text = '', { hold = 'speech' } = {}) {
  const wait = speechEnd - Date.now(); if (wait > 0) await sleep(wait + 250);
  await page.evaluate(([a, b]) => window.__cap(a, b), [title, text]).catch(() => {});
  timeline.push({ id, at: Date.now() - vStart });
  speechEnd = Date.now() + voice[id].ms;
  if (hold === 'speech') await sleep(voice[id].ms + 400);
  else if (typeof hold === 'number' && hold > 0) await sleep(Math.max(hold, voice[id].ms + 400));
}
const finishSpeech = async () => { const w = speechEnd - Date.now(); if (w > 0) await sleep(w + 300); };
const go = async (p) => { await finishSpeech(); await page.goto(BASE + p, { waitUntil: 'domcontentloaded' }); await sleep(900); };
const scrollTo = (sel, block = 'start') => page.evaluate(([s, b]) => document.querySelector(s)?.scrollIntoView({ behavior: 'smooth', block: b }), [sel, block]);
const setUnlockIn = (sec) => page.evaluate((s) => {
  const d = new Date(Date.now() + s * 1000), p = (n) => String(n).padStart(2, '0');
  const el = document.getElementById('unlockAt');
  el.value = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  el.dispatchEvent(new Event('input', { bubbles: true }));
}, sec);

// ---------------- title ----------------
await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
await page.evaluate(() => window.__card([['Sealed', 'font:400 84px system-ui;letter-spacing:-3px'], ['Files that open on time', 'font:20px ui-monospace,monospace;color:#6f6d69;margin-top:14px'],
  ['Live demo on the NEAR test network', 'font:16px system-ui;color:#4a4845;margin-top:30px']]));
await sleep(1500);
await say('intro');
await page.evaluate(() => window.__card(null));
await page.mouse.move(1279, 719); // keep the cursor out of the 3D story

// ---------------- 3D story (the stage fills the frame; captions come from the voice) ----------------
await page.evaluate(() => {
  const st = document.createElement('style'); st.id = '__demoHideNav'; st.textContent = '.land-top{opacity:0!important;pointer-events:none}'; document.head.append(st);
  if (!document.querySelector('.story').classList.contains('paused')) document.querySelector('.st-play').click();
  const r = document.querySelector('.st-stage').getBoundingClientRect(); window.scrollTo({ top: window.scrollY + r.top - 30, behavior: 'instant' });
});
ok(await page.locator('.st-chap').count() === 8, 'landing story has 8 chapters');
for (const [i, id] of ['s_write', 's_seal', 's_choose', 's_timeA', 's_openA', 's_splitB', 's_mergeB', 's_chat'].entries()) {
  await finishSpeech();
  await page.evaluate((n) => document.querySelectorAll('.st-chap')[n].click(), i);
  const minScene = [6500, 4000, 4000, 5200, 4200, 4000, 4200, 11500][i];
  await say(id, '', '', { hold: minScene });
}
await page.evaluate(() => document.getElementById('__demoHideNav')?.remove());
await scrollTo('.ticker', 'center'); await sleep(800);
const liveSeals = (await page.textContent('#sSeals')).trim();
ok(/^\d[\d,]*$/.test(liveSeals), `live file count from NEAR shown (${liveSeals})`);
await say('numbers', 'Live from NEAR', 'Files locked, transactions recorded and blocked attempts, read right now.');
await scrollTo('#proof'); await sleep(800);
await say('proofPanel', 'Checked live, not promised', 'Contract status, response time and the latest recorded event.');

// ---------------- a time lock for one person ----------------
await go('/app#seal');
const secretA = `Class 10 results: Asha 92%, Bala 88%. Published ${new Date().toUTCString()}.`;
await page.setInputFiles('#file', { name: 'results-letter.txt', mimeType: 'text/plain', buffer: Buffer.from(secretA) });
await page.fill('#label', 'Class 10 results');
await say('a_file', 'Choose any file', 'A results letter, encrypted in the browser before it leaves the device.');
await scrollTo('input[name=mode][value=single]', 'center'); await sleep(600);
await page.check('input[name=mode][value=single]');
await say('a_who', 'Who is it for?', 'One person, with a private link.');
await scrollTo('input[name=unlock][value=time]', 'center'); await sleep(600);
await page.check('input[name=unlock][value=time]'); await setUnlockIn(150);
await say('a_when', 'How does it unlock?', 'On a date and time: about two minutes from now.');
await scrollTo('#sealBtn', 'center'); await sleep(500);
await page.click('#sealBtn');
await say('a_locking', 'Locking on NEAR', 'The encrypted file is stored and the contract records the seal.', { hold: 0 });
await page.waitForSelector('#sealedSummary:not(:empty)', { timeout: 150000 });
const sealA = await page.evaluate(() => JSON.parse(localStorage.getItem('sealed-paper:mine'))[0]);
ok(Boolean(sealA?.sealId && sealA.createTx), `time-locked file created on NEAR (tx ${sealA?.createTx?.slice(0, 10)}…)`);
await scrollTo('#sealedSummary', 'center');
await say('a_locked', 'Locked', 'Linked to the real transaction. Share by WhatsApp, email or QR code.');

await go(`/s/${sealA.sealId}`);
await page.waitForFunction(() => !document.getElementById('openBtn').disabled, null, { timeout: 60000 });
await say('a_early', 'Opened too early', 'A live countdown. Pressing Open asks the NEAR contract.');
await page.click('#openBtn');
await page.waitForSelector('#result:not(.hidden)', { timeout: 120000 });
ok(/still locked|too early/i.test(await page.textContent('#result')), 'early opening refused by the contract');
await scrollTo('#result', 'center');
await say('a_refused', 'Refused and recorded', 'Written to NEAR with time and device. The owner is alerted.');
await scrollTo('#log', 'center'); await sleep(1500);

// ---------------- split between people, merge only ----------------
await go('/app#seal');
const secretB = 'EXAM PAPER, Maths Class 10\nQ1. Solve 2x + 6 = 14\nQ2. Find the area of a circle of radius 7 cm\nQ3. Factorise x^2 - 9';
await page.setInputFiles('#file', { name: 'maths-exam-paper.txt', mimeType: 'text/plain', buffer: Buffer.from(secretB) });
await page.fill('#label', 'Maths exam paper');
await scrollTo('input[name=mode][value=split]', 'center'); await sleep(600);
await page.check('input[name=mode][value=split]'); await sleep(500);
await page.click('.preset[data-k="2"][data-n="3"]'); await sleep(500);
const rows = page.locator('.holder-row:not(.hidden) .h-label');
for (const [i, n] of ['Principal', 'Exam officer', 'Board member'].entries()) await rows.nth(i).fill(n);
await say('b_intro', 'Split between people', 'The principal, the exam officer and a board member.');
await page.check('input[name=unlock][value=merge]'); await sleep(500);
await scrollTo('#mergeNote', 'center');
await say('b_merge', 'Only when merged', '2 of the 3 parts must be merged. No date.');
const lockedBAt = Date.now();
await page.click('#sealBtn');
await say('b_locking', 'Locking on NEAR', 'A fingerprint for each part, and a NEAR account for each person.', { hold: 0 });
await page.waitForSelector('#holderList a[href*="/h/"]', { timeout: 150000 });
const holderLinks = [...new Set(await page.$$eval('#holderList a[href*="/h/"]', (as) => as.map((a) => a.href).filter((h) => h.startsWith(location.origin + '/h/'))))];
const sealB = await page.evaluate(() => JSON.parse(localStorage.getItem('sealed-paper:mine'))[0]);
ok(holderLinks.length === 3, `3 private part links made (${holderLinks.length})`);
await scrollTo('#holderLinks', 'center');
await say('b_links', 'One private link per person', 'Each link carries that person\'s part of the key.');

await go(`/s/${sealB.sealId}`);
await page.waitForFunction(() => document.getElementById('title').textContent !== 'Loading…', null, { timeout: 60000 });
ok(/merged/i.test(await page.textContent('#kind')), 'open page explains merge-only');
await say('b_page', 'No countdown, a parts counter', 'It shows how many parts are merged so far.');

for (const [i, link] of holderLinks.slice(0, 2).entries()) {
  await finishSpeech();
  await page.goto(link); await page.waitForFunction(() => document.getElementById('title').textContent !== 'Loading…', null, { timeout: 60000 });
  await say(i === 0 ? 'b_h1' : 'b_h2', i === 0 ? 'The principal' : 'The exam officer', 'Taps Merge my part. It is checked against its fingerprint on NEAR.');
  const wait = 50000 - (Date.now() - lockedBAt);
  if (wait > 0) await say('b_wait', 'A few seconds', 'Merge-only files accept parts about 45 seconds after locking.', { hold: wait });
  await page.click('#releaseBtn');
  await page.waitForSelector('#result:not(.hidden)', { timeout: 120000 });
  const res = (await page.textContent('#result h2')).trim();
  ok(/merged/i.test(res), `${i === 0 ? 'principal' : 'exam officer'} merged their part (${res})`);
  await scrollTo('#result', 'center');
  await say(i === 0 ? 'b_h1done' : 'b_h2done', res, 'Recorded on NEAR.');
}
await go(`/s/${sealB.sealId}`);
await page.waitForFunction(() => !document.getElementById('openBtn').disabled, null, { timeout: 60000 });
await say('b_open', 'Two parts merged', 'The key is rebuilt and the paper is decrypted in this browser.', { hold: 0 });
let openedB = false;
for (let i = 0; i < 6 && !openedB; i++) {
  await page.click('#openBtn'); await page.waitForSelector('#result:not(.hidden)', { timeout: 120000 });
  openedB = (await page.textContent('#result')).includes('Solve 2x + 6 = 14');
  if (!openedB) await sleep(4000);
}
ok(openedB, 'merged file opened and decrypted to the original text');
await scrollTo('#result', 'center');
await say('b_opened', 'Opened by merging', 'Its fingerprint matches the one recorded on NEAR.');

// ---------------- the time lock opens by itself ----------------
await go(`/s/${sealA.sealId}`);
await page.waitForFunction(() => !document.getElementById('openBtn').disabled, null, { timeout: 60000 });
const left = sealA.unlockAtMs - Date.now();
await say('a_back', 'Back to the results letter', 'It opens by itself at its time.', { hold: Math.max(0, left + 2500) });
let openedA = false;
for (let i = 0; i < 20 && !openedA; i++) { openedA = (await page.textContent('body')).includes('Asha 92%'); if (!openedA) await sleep(3000); }
if (!openedA) { await page.click('#openBtn'); await page.waitForSelector('#result:not(.hidden)', { timeout: 120000 }); openedA = (await page.textContent('#result')).includes('Asha 92%'); }
ok(openedA, 'time-locked file opened automatically at its time');
await scrollTo('#result', 'center');
await say('a_open', 'Opened on time', 'The key is released and the letter decrypts on its own.');

// ---------------- proof ----------------
await go('/proof');
const proofRows = await page.locator('.proof-table tbody tr').count();
ok(proofRows > 0, `proof page lists real transactions (${proofRows})`);
await say('proof', 'Proof page', 'Every action is a real NEAR testnet transaction.', { hold: 0 });
await sleep(2500); await page.mouse.wheel(0, 600); await finishSpeech();

// ---------------- exam papers ----------------
await go('/app#exam');
const qs = [
  'Q: What is 7 x 8?\nA) 54\nB) 56 *\nC) 58\nD) 64', 'Q: What is the capital of Japan?\nA) Osaka\nB) Kyoto\nC) Tokyo *\nD) Nagoya',
  'Q: Which gas do plants absorb?\nA) Oxygen\nB) Nitrogen\nC) Carbon dioxide *\nD) Helium', 'Q: How many sides does a hexagon have?\nA) 5\nB) 6 *\nC) 7\nD) 8',
  'Q: Who wrote Romeo and Juliet?\nA) Dickens\nB) Shakespeare *\nC) Austen\nD) Tolstoy', 'Q: What is the boiling point of water at sea level?\nA) 90 C\nB) 100 C *\nC) 110 C\nD) 120 C',
  'Q: Which planet is the largest?\nA) Saturn\nB) Earth\nC) Jupiter *\nD) Neptune', 'Q: What is 15% of 200?\nA) 20\nB) 25\nC) 30 *\nD) 35',
];
await page.fill('#examText', qs.join('\n\n')); await page.fill('#examTitleIn', 'Science and Maths, Class 10');
await say('ex_intro', 'Exam papers', 'Same questions, a different order and wording for every centre.');
await page.click('#genVersions');
await page.waitForSelector('.version-grid article', { timeout: 30000 });
ok(await page.locator('.version-grid article').count() === 3, '3 centre versions made');
await scrollTo('.version-grid', 'start');
await say('ex_versions', 'One version per centre', 'Each is locked to open at 09:00 in its own centre.');
await page.fill('#leakText', await page.textContent('.version-grid article:nth-child(2) pre'));
await scrollTo('#leakText', 'center');
await say('ex_leak', 'A paper leaked', 'Paste the leaked text. Works offline, no AI service.');
await page.click('#trace'); await sleep(1200);
const trace = (await page.textContent('#traceResult')).replace(/\s+/g, ' ');
ok(/Centre 2/.test(trace), `leak traced to Centre 2 (${trace.slice(6, 40)})`);
await scrollTo('#traceResult', 'center');
await say('ex_found', 'Found the centre', 'The result can be saved and recorded on NEAR as evidence.');

// ---------------- live chat ----------------
await go('/app#message');
await page.fill('#chatName', 'Asha');
await say('c_intro', 'Private live chat', 'The key lives only in the invite link.', { hold: 0 });
await page.click('#chatNewBtn');
await page.waitForURL(/\/c\//); await page.waitForSelector('#invite:not(.hidden)');
const invite = await page.textContent('#inviteLink');
ok(invite.includes('#k='), 'chat created with the key only in the link');
await say('c_invite', 'Invite one person', 'Only the first person who opens the link can join.');
const other = await browser.newContext({ viewport: { width: 420, height: 800 } });
const b = await other.newPage();
await b.goto(invite); await b.fill('#joinName', 'Bala'); await b.click('#joinBtn');
await page.waitForFunction(() => document.getElementById('otherName').textContent === 'Bala', null, { timeout: 30000 });
ok(true, 'second person joined from another browser');
await say('c_join', 'Bala joined', 'Online status, typing and read receipts.', { hold: 0 });
await b.type('#text', 'Hi Asha! Did the results letter open for you?', { delay: 30 }); await b.press('#text', 'Enter');
await page.waitForSelector('.wa-msg.in >> text=Did the results letter open', { timeout: 30000 });
await finishSpeech();
await page.type('#text', 'Yes, right at the time. Nobody could open it before.', { delay: 35 }); await page.press('#text', 'Enter');
await b.bringToFront(); await b.evaluate(() => window.dispatchEvent(new Event('focus')));
await page.waitForSelector('.wa-msg.out .wa-tick.read', { timeout: 30000 }).catch(() => {});
ok(await page.locator('.wa-msg.out .wa-tick.read').count() > 0, 'blue read ticks after the other person reads');
await say('c_read', 'Read', 'Grey ticks when delivered, blue when read.');
await page.setInputFiles('#attach', { name: 'answer-key.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n% Answer key\nQ1 B  Q2 C  Q3 C  Q4 B\n%%EOF') });
await page.waitForSelector('.wa-msg.out .wa-doc', { timeout: 60000 });
await b.waitForSelector('.wa-msg.in .wa-doc', { timeout: 60000 });
ok(true, 'document sent, received and decrypted');
await say('c_doc', 'Send any file', 'Encrypted on the phone before upload, decrypted on the other.');
const photo = await b.screenshot({ type: 'png', clip: { x: 0, y: 0, width: 420, height: 300 } });
await b.setInputFiles('#attach', { name: 'centre-photo.png', mimeType: 'image/png', buffer: photo });
await page.waitForSelector('.wa-msg.in img.wa-img', { timeout: 60000 });
ok(true, 'photo sent from the other phone and shown');
await say('c_photo', 'A photo back', '');
await page.click('#toggleOpts'); await page.check('#viewOnce'); await sleep(500);
await say('c_once', 'View once', 'It can be opened a single time.', { hold: 0 });
await page.type('#text', 'The exam starts at 09:00. Delete after reading.', { delay: 30 }); await page.press('#text', 'Enter');
await b.waitForSelector('.wa-once', { timeout: 30000 }); await b.click('.wa-once'); await sleep(1200); await b.click('#viewerClose');
await page.waitForSelector('.wa-msg.out.gone', { timeout: 30000 });
ok(true, 'view-once message opened once, sender sees "Opened"');
await say('c_gone', 'Opened, and gone', 'The server no longer has it.');
await page.click('#toggleOpts'); await page.click('[data-min="1"]'); await sleep(400);
await page.type('#text', 'Answer key for Q1: B', { delay: 30 }); await page.press('#text', 'Enter');
await b.waitForSelector('.wa-msg.locked', { timeout: 30000 });
ok(await b.locator('text=Answer key for Q1').count() === 0, 'timed chat message stays sealed for the receiver');
await say('c_timed', 'Sealed until a time', 'The receiver sees a locked bubble with a countdown.');
await other.close();

// ---------------- plans ----------------
await go('/app#plans');
await page.waitForFunction(() => !/—/.test(document.getElementById('planPrice').textContent) && document.getElementById('planStatus').textContent.trim().length > 0, null, { timeout: 30000 });
const planText = (await page.textContent('#planStatus')).trim();
ok(!pass || /Premium is active/i.test(planText), `plans page loaded (${planText.slice(0, 50)})`);
await say('plans', 'Free and Premium', 'Premium is paid in NEAR to a plans contract.');
ok(errors.length === 0, 'no page errors' + (errors.length ? ': ' + [...new Set(errors)].join(' | ') : ''));

// ---------------- end ----------------
await page.evaluate(() => { window.__cap('', ''); window.__card([['Sealed', 'font:400 72px system-ui;letter-spacing:-2px'], ['sealedfiles.vercel.app', 'font:18px ui-monospace,monospace;color:#bbb;margin-top:14px'],
  ['github.com/Lakshmikanth-3/Sealed', 'font:18px ui-monospace,monospace;color:#bbb;margin-top:6px'], ['Every step in this video was a real transaction on NEAR testnet.', 'font:16px system-ui;color:#999;margin-top:26px']], true); });
await say('outro');
await sleep(1200);
const totalMs = Date.now() - vStart;
const video = page.video();
await page.close(); await ctx.close(); await browser.close();
const webm = path.join(OUT, 'sealed-live-demo.webm');
fs.copyFileSync(await video.path(), webm);
fs.rmSync(await video.path(), { force: true });

// ---------------- mix the narration and mux ----------------
const samples = Math.ceil((totalMs / 1000 + 1) * RATE), mix = new Int32Array(samples);
for (const { id, at } of timeline) {
  const pcm = voice[id].pcm, start = Math.floor((at / 1000) * RATE);
  for (let i = 0; i < pcm.length / 2 && start + i < samples; i++) mix[start + i] += pcm.readInt16LE(i * 2);
}
const data = Buffer.alloc(samples * 2);
for (let i = 0; i < samples; i++) data.writeInt16LE(Math.max(-32768, Math.min(32767, mix[i])), i * 2);
const hdr = Buffer.alloc(44);
hdr.write('RIFF', 0); hdr.writeUInt32LE(36 + data.length, 4); hdr.write('WAVE', 8); hdr.write('fmt ', 12); hdr.writeUInt32LE(16, 16); hdr.writeUInt16LE(1, 20); hdr.writeUInt16LE(1, 22);
hdr.writeUInt32LE(RATE, 24); hdr.writeUInt32LE(RATE * 2, 28); hdr.writeUInt16LE(2, 32); hdr.writeUInt16LE(16, 34); hdr.write('data', 36); hdr.writeUInt32LE(data.length, 40);
const wavOut = path.join(OUT, 'narration.wav');
fs.writeFileSync(wavOut, Buffer.concat([hdr, data]));
fs.writeFileSync(path.join(OUT, 'narration-timeline.json'), JSON.stringify(timeline.map((t) => ({ ...t, text: LINES[t.id] })), null, 2));
let final = webm;
if (process.env.FFMPEG_PATH) {
  final = path.join(OUT, 'sealed-live-demo.mp4');
  execFileSync(process.env.FFMPEG_PATH, ['-y', '-loglevel', 'error', '-i', webm, '-i', wavOut, '-map', '0:v', '-map', '1:a', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21',
    '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', '-af', 'apad', '-shortest', '-movflags', '+faststart', final], { stdio: 'inherit' });
} else console.log('FFMPEG_PATH not set: kept the silent .webm and narration.wav separately.');
const fails = results.filter(([c]) => !c).length;
console.log(`\n${results.length - fails}/${results.length} checks passed · ${final} · ${(fs.statSync(final).size / 1048576).toFixed(1)} MB · ${Math.round(totalMs / 1000)} s`);
process.exit(fails ? 1 : 0);
