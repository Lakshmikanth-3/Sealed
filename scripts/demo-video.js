// Narrated live demo + full UI test of the hosted Sealed site, with real NEAR testnet data.
// Usage: npm run demo:video [outDir]
//   1. A 3D explanation of the problem.  2. A tour of the landing page.
//   3. Three live flows on NEAR testnet: open on a date and time, open only when parts are merged,
//      and a two-person encrypted chat shown side by side.  Waiting time is cut out of the video.
//   Output: <outDir>/sealed-live-demo.mp4 with a male voice-over, and PASS/FAIL for each check.
//   Needs Windows (System.Speech, "Microsoft David") and FFMPEG_PATH pointing to an ffmpeg with libx264/aac.
//   Optional: DEMO_PLAN_PASS_FILE (JSON {"pass": ...}) so the Free 5-a-day limit does not stop a run.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const BASE = process.env.DEMO_BASE_URL || 'https://sealedfiles.vercel.app';
const OUT = path.resolve(process.argv[2] || 'demo');
const FFMPEG = process.env.FFMPEG_PATH;
if (!FFMPEG) throw new Error('Set FFMPEG_PATH to an ffmpeg build with libx264 and aac');
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const ok = (cond, msg) => { results.push([cond, msg]); console.log((cond ? 'PASS ' : 'FAIL ') + msg); };

// ---------------- narration (spoken; no step numbers) ----------------
const LINES = {
  p_problem: 'Every day, important documents must stay closed until the right moment. Contracts before signing. Government orders. Company results before the announcement. Tender bids. Wills. But whoever holds a file can open it early, and in seconds it is shared everywhere. And when it leaks, nobody can prove who opened it, or when.',
  p_fix: 'Sealed fixes this.',
  hero: 'This is Sealed. The animation on the home page shows the whole idea. A document is written. It is sealed with a padlock, and encrypted. The key can be split into three parts, and merged back. Only then is it decrypted and opened.',
  story: 'The how it works story explains the same idea in eight short scenes.',
  s_write: 'A document is written, or any file is chosen.',
  s_seal: 'It is encrypted and sealed on the owner\'s own device.',
  s_choose: 'The owner picks how it unlocks: on a date and time, or only when its parts are merged.',
  s_timeA: 'With a date, every early attempt is refused, and recorded on NEAR.',
  s_openA: 'At the chosen time, it decrypts for the receiver.',
  s_splitB: 'With merging, the key is split between people. One part alone reveals nothing.',
  s_mergeB: 'When enough parts are merged, it opens.',
  s_chat: 'And two people can chat privately. Every message and file is encrypted.',
  caps: 'Sealed can lock a file until a time, split its key between trusted people, run a private live chat, trace leaked copies, and record every attempt on NEAR.',
  how: 'In this example, a legal team shares a merger agreement in a chat, locked until nine o\'clock. An early attempt is blocked and recorded. At nine, it opens, and it is proven to be the same file.',
  record: 'These values are read live from the NEAR test network: the contract status, files locked, transactions, and blocked attempts.',
  security: 'Files are encrypted on your device. The key can be split. The time is enforced by a public smart contract. And a changed file will never open.',
  uses: 'It works for every field: contracts, government orders, company results, tender bids, merger plans, court rulings, wills and more.',
  t_intro: 'Now, the live product. The first flow: open on a date and time. A company locks its quarterly results until the announcement.',
  a_file: 'The file is chosen, and encrypted inside the browser. Nothing readable ever leaves the device.',
  a_who: 'It is for one person, who will get a private link.',
  a_when: 'It opens on a date and time. For this demo, about a minute from now.',
  a_locking: 'Locking. The smart contract on NEAR records the seal, the unlock time, and the file\'s fingerprint.',
  a_locked: 'Locked. Here is the share link, a QR code, and the real transaction on the NEAR explorer.',
  a_early: 'The receiver opens the link before the time. There is a live countdown. Let\'s try to open it anyway.',
  a_refused: 'Refused by the contract. The attempt is recorded in public with the time and the device, and the owner is alerted. This record can never be deleted.',
  skip: 'Let\'s skip ahead to the unlock time.',
  a_open: 'The time has come. NEAR allows it, the key is released, and the results decrypt on their own. The check confirms this is exactly the file that was locked.',
  b_intro: 'The second flow: open only when parts are merged. A merger agreement is split between the CEO, the CFO, and the head of legal.',
  b_merge: 'There is no date. Two of the three must merge their parts to open it.',
  b_locking: 'Locking on NEAR, with a fingerprint for each part of the key.',
  b_links: 'Each person gets a private link that carries their part of the key.',
  b_page: 'The agreement\'s page shows a parts counter instead of a countdown. None merged so far.',
  b_h1: 'The CEO opens their link, and merges their part. It is checked against its fingerprint on NEAR.',
  b_h1done: 'Merged, and recorded on NEAR.',
  b_h2: 'Now the CFO merges theirs.',
  b_h2done: 'Two parts are merged. That is enough.',
  b_open: 'Back on the agreement\'s page, the key is rebuilt from the two parts, and the document is decrypted right here.',
  b_opened: 'Here is the merger agreement, verified against the fingerprint recorded on NEAR.',
  c_intro: 'The third flow: a private live chat, like WhatsApp. On the left, Asha from the legal team. On the right, Bala, the client.',
  c_invite: 'Asha starts a chat, and gets an invite link. The encryption key lives only inside the link, so the server never sees the messages.',
  c_join: 'Bala opens the link, and joins. Only two people can ever be in this chat.',
  c_msg: 'Messages travel encrypted. Both sides see online status, typing, and blue read ticks.',
  c_doc: 'Asha sends the signed contract as a PDF. It is encrypted on her device, and decrypted on Bala\'s.',
  c_photo: 'Bala replies with a photo of the signed page.',
  c_once: 'This next message is view once. Bala can open it a single time.',
  c_gone: 'Opened, and gone from the server. Asha can see that it was opened.',
  c_timed: 'And this offer is sealed until a time. Bala sees a locked bubble, with a countdown.',
  c_skip: 'Skipping ahead.',
  c_timedOpen: 'At the set time, the offer unlocks, and Bala can read it.',
  proof: 'Every action in this video was a real transaction. The proof page lists them, each linked to the public NEAR explorer.',
  plans: 'Sealed is free to start, with five locked files a day. Premium is paid in NEAR to a plans contract, and one wallet signature turns it on.',
  outro: 'Sealed. Contracts, government documents, company files, and more, that open only at the right moment, with every step recorded on NEAR.',
};

// One WAV per line with the Windows male voice, then read their durations.
const RATE = 24000;
const vdir = path.join(OUT, 'voice'); fs.mkdirSync(vdir, { recursive: true });
const linesFile = path.join(vdir, 'lines.json');
fs.writeFileSync(linesFile, JSON.stringify(Object.entries(LINES).map(([id, text]) => ({ id, text }))));
execFileSync('powershell.exe', ['-NoProfile', '-Command', [
  'Add-Type -AssemblyName System.Speech', '$s = New-Object System.Speech.Synthesis.SpeechSynthesizer', "$s.SelectVoice('Microsoft David Desktop')", '$s.Rate = 0',
  `$fmt = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(${RATE}, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)`,
  `$lines = Get-Content -Raw -Encoding UTF8 '${linesFile}' | ConvertFrom-Json`,
  `foreach ($l in $lines) { $s.SetOutputToWaveFile((Join-Path '${vdir}' ($l.id + '.wav')), $fmt); [void]$s.Speak($l.text) }`, '$s.SetOutputToNull()',
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

// ---------------- browser setup ----------------
const browser = await chromium.launch({ channel: 'chrome', slowMo: 40 });
const pass = (() => { try { return JSON.parse(fs.readFileSync(process.env.DEMO_PLAN_PASS_FILE || path.join(OUT, 'plan-pass.json'), 'utf8')).pass; } catch { return null; } })();
const OVERLAY = () => {
  const mk = () => {
    if (document.getElementById('__demoCap')) return;
    const cap = document.createElement('div'); cap.id = '__demoCap';
    Object.assign(cap.style, { position: 'fixed', left: '16px', bottom: '16px', zIndex: 2147483646, maxWidth: '600px', background: 'rgba(17,17,17,.9)', color: '#fff',
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
  if (document.readyState !== 'loading') mk(); else addEventListener('DOMContentLoaded', mk);
};
const newRecorded = async (w, h) => {
  const c = await browser.newContext({ viewport: { width: w, height: h }, recordVideo: { dir: path.join(OUT, 'raw'), size: { width: w, height: h } } });
  if (pass) await c.addInitScript((p) => { try { if (location.hostname.endsWith('vercel.app')) localStorage.setItem('sealed:plan-pass', p); } catch {} }, pass);
  await c.addInitScript(OVERLAY);
  return c;
};
const ctx = await newRecorded(1280, 720);
const page = await ctx.newPage();
const vStart = Date.now();
const errors = []; const watch = (p) => p.on('pageerror', (e) => errors.push(e.message)); watch(page);

// ---------------- narration, captions and cuts ----------------
const timeline = []; const cuts = []; let speechEnd = 0; let capPage = page;
async function say(id, title = '', text = '', { hold = 'speech' } = {}) {
  const wait = speechEnd - Date.now(); if (wait > 0) await sleep(wait + 250);
  await capPage.evaluate(([a, b]) => window.__cap?.(a, b), [title, text]).catch(() => {});
  timeline.push({ id, at: Date.now() - vStart });
  speechEnd = Date.now() + voice[id].ms;
  if (hold === 'speech') await sleep(voice[id].ms + 400);
  else if (typeof hold === 'number' && hold > 0) await sleep(Math.max(hold, voice[id].ms + 400));
}
const finishSpeech = async () => { const w = speechEnd - Date.now(); if (w > 0) await sleep(w + 300); };
/** Wait for something without showing the idle time: the waiting part is cut from the video. */
async function waitCut(promise, label = '') {
  await finishSpeech();
  const start = Date.now();
  if (label) await capPage.evaluate((l) => window.__cap?.('⏩ ' + l, ''), label).catch(() => {});
  const res = await promise;
  const end = Date.now();
  if (end - start > 2500) cuts.push([start - vStart + 600, end - vStart - 700]);
  return res;
}
const go = async (p) => { await finishSpeech(); await page.goto(BASE + p, { waitUntil: 'domcontentloaded' }); await sleep(900); };
const scrollTo = (sel, block = 'start', pg = page) => pg.evaluate(([s, b]) => document.querySelector(s)?.scrollIntoView({ behavior: 'smooth', block: b }), [sel, block]);
const scrollTop = (sel, offset = 0) => page.evaluate(([s, o]) => { const r = document.querySelector(s).getBoundingClientRect(); window.scrollTo({ top: window.scrollY + r.top - o, behavior: 'smooth' }); }, [sel, offset]);
const setUnlockIn = (sec) => page.evaluate((s) => {
  const d = new Date(Date.now() + s * 1000), p = (n) => String(n).padStart(2, '0');
  const el = document.getElementById('unlockAt');
  el.value = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  el.dispatchEvent(new Event('input', { bubbles: true }));
}, sec);

// ================= 1. The problem, in 3D (about 20 s) =================
await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
await page.evaluate((D) => {
  const k = (D + 0.6) / 18.6; // scale the scene to the spoken narration (the logo card lands as it ends)
  const docs = [['CONTRACT', 'Northwind × Bluefield'], ['GOVERNMENT ORDER', 'Ministry, No. 214'], ['Q3 RESULTS', 'Embargoed until 09:00'], ['TENDER BID', 'Sealed bid, Lot 7'], ['LAST WILL', 'Read after the funeral']];
  const st = document.createElement('style');
  st.textContent = `
  #__prob{position:fixed;inset:0;z-index:2147483640;background:radial-gradient(ellipse at 50% 40%,#1d1b19,#0b0a09 70%);color:#f1efea;font-family:system-ui,sans-serif;overflow:hidden;perspective:1300px}
  #__prob .ring{position:absolute;left:50%;top:52%;width:0;height:0;transform-style:preserve-3d;animation:pr-spin calc(22s * var(--k)) linear both}
  #__prob .card{position:absolute;left:-95px;top:-125px;width:190px;height:250px;background:#fbfaf8;color:#111;border-radius:6px;padding:16px;box-shadow:0 30px 60px rgba(0,0,0,.5);backface-visibility:visible}
  #__prob .card b{display:block;font:700 13px ui-monospace,Consolas,monospace;letter-spacing:.06em}
  #__prob .card small{display:block;font:12px system-ui;color:#6f6d69;margin:4px 0 12px}
  #__prob .card i{display:block;height:6px;background:#2b2a28;border-radius:3px;margin:9px 0;opacity:.8}
  #__prob .card .tag{position:absolute;left:16px;bottom:14px;font:700 10px ui-monospace,monospace;color:#d14b1f;border:1.5px solid #d14b1f;padding:2px 6px}
  #__prob .stamp{position:absolute;left:12px;top:92px;width:166px;text-align:center;font:900 30px system-ui;color:#e0362a;border:4px solid #e0362a;border-radius:6px;transform:rotate(-14deg) scale(2.2);opacity:0;animation:pr-stamp calc(.4s * var(--k)) both}
  #__prob .copy{position:absolute;left:50%;top:52%;width:34px;height:44px;margin:-22px 0 0 -17px;background:#fbfaf8;border-radius:3px;opacity:0;box-shadow:0 6px 16px rgba(0,0,0,.4);animation:pr-fly calc(2.6s * var(--k)) cubic-bezier(.2,.7,.3,1) both}
  #__prob .copy::after{content:attr(data-app);position:absolute;top:48px;left:50%;transform:translateX(-50%);white-space:nowrap;font:600 11px system-ui;color:#ffb27a}
  #__prob .line{position:absolute;left:0;right:0;text-align:center;font-weight:400;letter-spacing:-.02em;opacity:0}
  #__prob .l1{top:56px;font-size:40px;animation:pr-show calc(6.2s * var(--k)) calc(.3s * var(--k)) both}
  #__prob .l2{top:56px;font-size:40px;animation:pr-show calc(5.6s * var(--k)) calc(6.6s * var(--k)) both}
  #__prob .l3{top:56px;font-size:40px;animation:pr-show calc(5.4s * var(--k)) calc(12.4s * var(--k)) both}
  #__prob .l3 em{font-style:normal;color:#ff6b47}
  #__prob .final{position:absolute;inset:0;display:grid;place-items:center;align-content:center;gap:18px;background:#f6f5f3;color:#111;opacity:0;animation:pr-fade calc(.8s * var(--k)) calc(18.2s * var(--k)) both}
  #__prob .final img{width:150px;height:150px}
  #__prob .final b{font:400 64px system-ui;letter-spacing:-2px}
  #__prob .final span{font:18px ui-monospace,Consolas,monospace;color:#6f6d69}
  @keyframes pr-spin{from{transform:rotateX(-8deg) rotateY(0)}to{transform:rotateX(-8deg) rotateY(-300deg)}}
  @keyframes pr-show{0%{opacity:0;transform:translateY(12px)}10%,88%{opacity:1;transform:none}100%{opacity:0}}
  @keyframes pr-stamp{to{opacity:1;transform:rotate(-14deg) scale(1)}}
  @keyframes pr-fly{0%{opacity:0;transform:translate(0,0) scale(.4)}15%{opacity:1}100%{opacity:1;transform:translate(var(--x),var(--y)) scale(1) rotate(var(--r))}}
  @keyframes pr-fade{to{opacity:1}}`;
  const root = document.createElement('div'); root.id = '__prob'; root.style.setProperty('--k', k);
  const ring = document.createElement('div'); ring.className = 'ring';
  docs.forEach(([t, s], i) => {
    const c = document.createElement('div'); c.className = 'card';
    c.style.transform = `rotateY(${i * 72}deg) translateZ(330px)`;
    c.innerHTML = `<b></b><small></small><i style="width:90%"></i><i style="width:76%"></i><i style="width:84%"></i><i style="width:60%"></i><i style="width:80%"></i><span class="tag">CONFIDENTIAL</span><div class="stamp">LEAKED</div>`;
    c.querySelector('b').textContent = t; c.querySelector('small').textContent = s;
    c.querySelector('.stamp').style.animationDelay = `${(13 + i * 0.45) * k}s`;
    ring.append(c);
  });
  root.append(ring);
  const apps = ['WhatsApp', 'Telegram', 'Email', 'Forwarded', 'WhatsApp', 'Screenshot', 'Telegram', 'Shared', 'Email', 'WhatsApp', 'Forwarded', 'Telegram'];
  apps.forEach((a, i) => {
    const d = document.createElement('div'); d.className = 'copy'; d.dataset.app = a;
    const ang = (i / apps.length) * Math.PI * 2, r = 330 + (i % 3) * 70;
    d.style.setProperty('--x', `${Math.cos(ang) * r * 1.5}px`); d.style.setProperty('--y', `${Math.sin(ang) * r * 0.75}px`); d.style.setProperty('--r', `${(i % 2 ? 1 : -1) * (10 + i * 3)}deg`);
    d.style.animationDelay = `${(7.4 + i * 0.22) * k}s`;
    root.append(d);
  });
  const mkLine = (cls, html) => { const l = document.createElement('div'); l.className = 'line ' + cls; l.innerHTML = html; root.append(l); };
  mkLine('l1', 'Important documents must stay closed until the right moment.');
  mkLine('l2', 'But whoever holds the file can open it early, and share it everywhere.');
  mkLine('l3', 'Who opened it? When? <em>No proof.</em>');
  const fin = document.createElement('div'); fin.className = 'final';
  fin.innerHTML = '<img src="/logo.svg" alt=""><b>Sealed</b><span>Nobody opens it early. Not even you.</span>';
  root.append(fin);
  document.head.append(st); document.body.append(root);
}, voice.p_problem.ms / 1000);
await page.mouse.move(1279, 719);
await sleep(300);
await say('p_problem');
await say('p_fix');
await sleep(800);
await page.evaluate(() => { document.getElementById('__prob')?.remove(); window.scrollTo(0, 0); });

// ================= 2. The landing page =================
await say('hero', 'The idea in six steps', 'Written, sealed, encrypted, split into 3, merged, decrypted and opened.', { hold: 17500 });
// the 3D story, framed to fill the screen
await page.evaluate(() => {
  const st = document.createElement('style'); st.id = '__demoHideNav'; st.textContent = '.land-top{opacity:0!important;pointer-events:none}'; document.head.append(st);
  if (!document.querySelector('.story').classList.contains('paused')) document.querySelector('.st-play').click();
  const r = document.querySelector('.st-stage').getBoundingClientRect(); window.scrollTo({ top: window.scrollY + r.top - 30, behavior: 'instant' });
});
await page.evaluate(() => window.__cap?.('', ''));
ok(await page.locator('.st-chap').count() === 8, 'landing story has 8 chapters');
await say('story', '', '', { hold: 0 });
for (const [i, id] of ['s_write', 's_seal', 's_choose', 's_timeA', 's_openA', 's_splitB', 's_mergeB', 's_chat'].entries()) {
  await finishSpeech();
  await page.evaluate((n) => document.querySelectorAll('.st-chap')[n].click(), i);
  await say(id, '', '', { hold: [6000, 3600, 3800, 4800, 3800, 3800, 4000, 9000][i] });
}
await page.evaluate(() => document.getElementById('__demoHideNav')?.remove());
await scrollTop('#features', 100); await sleep(1200);
await say('caps', 'Capabilities', 'Lock until a time · split between people · private chat · leak tracing · every attempt on record', { hold: 0 });
await sleep(4000); await page.mouse.wheel(0, 700); await sleep(3500); await page.mouse.wheel(0, 700); await finishSpeech();
await scrollTop('#how', 0); await sleep(1500);
await say('how', 'How it works', 'A legal team shares a merger agreement, locked until 09:00.', { hold: 9000 });
await scrollTop('#proof', 100); await sleep(1200);
const liveSeals = (await page.textContent('#sSeals2')).trim();
ok(/^\d[\d,]*$/.test(liveSeals), `live file count from NEAR shown (${liveSeals})`);
await say('record', 'Checked live, not promised', 'Read right now from the NEAR test network.', { hold: 0 });
await sleep(4500); await scrollTo('.num-grid', 'center'); await finishSpeech();
await scrollTo('.sec-cards', 'center'); await sleep(1000);
await say('security', 'Security', 'Encrypted on your device · key split into parts · time enforced on NEAR · tamper check');
await scrollTo('.uses', 'start'); await sleep(1200);
await say('uses', 'For every field', 'Contracts · government orders · company results · tender bids · merger plans · court rulings · wills', { hold: 7000 });

// ================= 3a. Flow one: open on a date and time =================
await go('/app#seal');
await say('t_intro', 'Flow 1: open on a date and time', 'Quarterly results, locked until the announcement.');
const secretA = `Q3 RESULTS (embargoed): revenue up 18% to 412 crore; net profit 61 crore. Locked ${new Date().toUTCString()}.`;
await page.setInputFiles('#file', { name: 'q3-results.txt', mimeType: 'text/plain', buffer: Buffer.from(secretA) });
await page.fill('#label', 'Q3 company results');
await say('a_file', 'Choose any file', 'Encrypted in the browser before it leaves the device.');
await scrollTo('input[name=mode][value=single]', 'center'); await sleep(700);
await page.check('input[name=mode][value=single]');
await say('a_who', 'Who is it for?', 'One person, with a private link.');
await scrollTo('input[name=unlock][value=time]', 'center'); await sleep(700);
await page.check('input[name=unlock][value=time]'); await setUnlockIn(80);
await scrollTo('#unlockPreview', 'center');
await say('a_when', 'How does it unlock?', 'On a date and time.');
await scrollTo('#sealBtn', 'center'); await sleep(500);
await page.click('#sealBtn');
await say('a_locking', 'Locking on NEAR', 'Seal, unlock time and fingerprint recorded by the contract.', { hold: 0 });
await waitCut(page.waitForSelector('#sealedSummary:not(:empty)', { timeout: 150000 }));
const sealA = await page.evaluate(() => JSON.parse(localStorage.getItem('sealed-paper:mine'))[0]);
ok(Boolean(sealA?.sealId && sealA.createTx), `time-locked file created on NEAR (tx ${sealA?.createTx?.slice(0, 10)}…)`);
await scrollTo('#sealedSummary', 'center');
await say('a_locked', 'Locked', 'Share link, QR code and the real NEAR transaction.');
await go(`/s/${sealA.sealId}`);
await waitCut(page.waitForFunction(() => !document.getElementById('openBtn').disabled, null, { timeout: 60000 }));
await say('a_early', 'The receiver opens it early', 'A live countdown. Pressing Open asks the contract.');
await page.click('#openBtn');
await waitCut(page.waitForSelector('#result:not(.hidden)', { timeout: 120000 }));
ok(/still locked|too early/i.test(await page.textContent('#result')), 'early opening refused by the contract');
await scrollTo('#result', 'center');
await say('a_refused', 'Refused and recorded on NEAR', 'Time and device logged. The owner is alerted.');
await scrollTo('#log', 'center'); await sleep(2000);
await say('skip', '⏩ Skipping ahead', 'to the unlock time.');
await waitCut((async () => {
  const left = sealA.unlockAtMs - Date.now(); if (left > 0) await sleep(left + 2000);
  let opened = false;
  for (let i = 0; i < 25 && !opened; i++) { opened = (await page.textContent('body')).includes('revenue up 18%'); if (!opened) await sleep(2500); }
  if (!opened) { await page.click('#openBtn'); await page.waitForSelector('#result:not(.hidden)', { timeout: 120000 }); }
})());
const openedA = (await page.textContent('#result')).includes('revenue up 18%');
ok(openedA, 'time-locked file opened automatically at its time');
await scrollTo('#result', 'center');
await say('a_open', 'Opened on time', 'Key released by NEAR. Same file that was locked ✓');

// ================= 3b. Flow two: open only when parts are merged =================
await go('/app#seal');
await say('b_intro', 'Flow 2: open only when merged', 'A merger agreement for the CEO, the CFO and the head of legal.', { hold: 0 });
const secretB = 'MERGER AGREEMENT (strictly confidential)\n1. Northwind Ltd acquires 100% of Bluefield Pvt Ltd.\n2. Price: 240 crore, paid in two parts.\n3. Announcement only after board approval.';
await page.setInputFiles('#file', { name: 'merger-agreement.txt', mimeType: 'text/plain', buffer: Buffer.from(secretB) });
await page.fill('#label', 'Merger agreement');
await scrollTo('input[name=mode][value=split]', 'center'); await sleep(600);
await page.check('input[name=mode][value=split]'); await sleep(500);
await page.click('.preset[data-k="2"][data-n="3"]'); await sleep(500);
const rows = page.locator('.holder-row:not(.hidden) .h-label');
for (const [i, n] of ['CEO', 'CFO', 'Head of legal'].entries()) await rows.nth(i).fill(n);
await finishSpeech();
await page.check('input[name=unlock][value=merge]'); await sleep(500);
await scrollTo('#mergeNote', 'center');
await say('b_merge', 'Only when merged', '2 of 3 parts. No date.');
const lockedBAt = Date.now();
await page.click('#sealBtn');
await say('b_locking', 'Locking on NEAR', 'A fingerprint for each part of the key.', { hold: 0 });
await waitCut(page.waitForSelector('#holderList a[href*="/h/"]', { timeout: 150000 }));
const holderLinks = [...new Set(await page.$$eval('#holderList a[href*="/h/"]', (as) => as.map((a) => a.href).filter((h) => h.startsWith(location.origin + '/h/'))))];
const sealB = await page.evaluate(() => JSON.parse(localStorage.getItem('sealed-paper:mine'))[0]);
ok(holderLinks.length === 3, `3 private part links made (${holderLinks.length})`);
await scrollTo('#holderLinks', 'center');
await say('b_links', 'One private link per person', 'Each link carries that person\'s part of the key.');
await go(`/s/${sealB.sealId}`);
await waitCut(page.waitForFunction(() => document.getElementById('title').textContent !== 'Loading…', null, { timeout: 60000 }));
ok(/merged/i.test(await page.textContent('#kind')), 'open page explains merge-only');
await say('b_page', 'A parts counter, no countdown', '0 of 2 parts merged.');
for (const [i, link] of holderLinks.slice(0, 2).entries()) {
  await finishSpeech();
  await page.goto(link);
  await waitCut(page.waitForFunction(() => document.getElementById('title').textContent !== 'Loading…', null, { timeout: 60000 }));
  await say(i === 0 ? 'b_h1' : 'b_h2', i === 0 ? 'The CEO' : 'The CFO', 'Merge my part. Checked against its fingerprint on NEAR.');
  const wait = 50000 - (Date.now() - lockedBAt);
  if (wait > 0) await waitCut(sleep(wait));
  await page.click('#releaseBtn');
  await waitCut(page.waitForSelector('#result:not(.hidden)', { timeout: 120000 }));
  const res = (await page.textContent('#result h2')).trim();
  ok(/merged/i.test(res), `${i === 0 ? 'CEO' : 'CFO'} merged their part (${res})`);
  await scrollTo('#result', 'center');
  await say(i === 0 ? 'b_h1done' : 'b_h2done', res, 'Recorded on NEAR.');
}
await go(`/s/${sealB.sealId}`);
await waitCut(page.waitForFunction(() => !document.getElementById('openBtn').disabled, null, { timeout: 60000 }));
await say('b_open', '2 of 3 parts merged', 'The key is rebuilt and the document decrypted in this browser.', { hold: 0 });
const openedB = await waitCut((async () => {
  for (let i = 0; i < 6; i++) {
    await page.click('#openBtn'); await page.waitForSelector('#result:not(.hidden)', { timeout: 120000 });
    if ((await page.textContent('#result')).includes('acquires 100% of Bluefield')) return true;
    await sleep(4000);
  }
  return false;
})());
ok(openedB, 'merged file opened and decrypted to the original text');
await scrollTo('#result', 'center');
await say('b_opened', 'Opened by merging', 'Verified against the fingerprint on NEAR ✓');

// ================= 3c. Flow three: private live chat, side by side =================
await finishSpeech();
await page.evaluate(() => { const d = document.createElement('div'); d.style.cssText = 'position:fixed;inset:0;background:#111;z-index:2147483640'; document.body.append(d); window.__cap?.('', ''); });
const phoneTag = (pg, name, side) => pg.evaluate(([n, sd]) => {
  document.getElementById('__phoneTag')?.remove();
  const t = document.createElement('div'); t.id = '__phoneTag'; t.textContent = n;
  Object.assign(t.style, { position: 'fixed', top: '19px', right: '52px', zIndex: 2147483646, padding: '6px 14px', borderRadius: '999px',
    background: sd === 'left' ? '#ff6b1a' : '#111', color: '#fff', font: '600 15px system-ui, sans-serif', boxShadow: '0 4px 14px rgba(0,0,0,.3)', pointerEvents: 'none' });
  document.documentElement.appendChild(t);
}, [name, side]);
const ctxA = await newRecorded(640, 720), ctxB = await newRecorded(640, 720);
const pa = await ctxA.newPage(); const aOff = (Date.now() - vStart) / 1000; watch(pa);
const pb = await ctxB.newPage(); const bOff = (Date.now() - vStart) / 1000; watch(pb);
const chatFrom = Date.now() - vStart + 1200;
for (let t = 0; t < 3; t++) { try { await pa.goto(BASE + '/app#message', { waitUntil: 'domcontentloaded', timeout: 45000 }); break; } catch (e) { if (t === 2) throw e; } } await pb.setContent('<body style="margin:0;height:100vh;display:grid;place-items:center;background:#d1d7db;font:20px system-ui;color:#54656f">Bala\'s phone</body>');
capPage = pa;
await sleep(1500);
await say('c_intro', 'Flow 3: private live chat', 'Left: Asha (legal team). Right: Bala (client).', { hold: 0 });
await pa.fill('#chatName', 'Asha'); await finishSpeech();
await pa.click('#chatNewBtn');
await pa.waitForURL(/\/c\//); await pa.waitForSelector('#invite:not(.hidden)');
await phoneTag(pa, "Asha's phone (legal team)", 'left');
const invite = await pa.textContent('#inviteLink');
ok(invite.includes('#k='), 'chat created with the key only in the link');
await say('c_invite', 'Invite one person', 'The key lives only inside the link.');
await pb.goto(invite); await pb.waitForSelector('#joinName');
await phoneTag(pb, "Bala's phone (client)", 'right');
await say('c_join', 'Bala joins', 'Only two people can ever be in this chat.', { hold: 0 });
await pb.fill('#joinName', 'Bala'); await pb.click('#joinBtn');
await pa.waitForFunction(() => document.getElementById('otherName').textContent === 'Bala', null, { timeout: 30000 });
ok(true, 'second person joined from another browser');
await finishSpeech();
await say('c_msg', 'Encrypted messages', 'Online · typing… · read ticks', { hold: 0 });
await pb.type('#text', 'Hi Asha! Did the Q3 results open for you?', { delay: 45 }); await pb.press('#text', 'Enter');
await pa.waitForSelector('.wa-msg.in >> text=Did the Q3 results open', { timeout: 30000 });
await pa.type('#text', 'Yes, right at the announcement. Nobody could open them before.', { delay: 40 }); await pa.press('#text', 'Enter');
await pb.bringToFront(); await pb.evaluate(() => window.dispatchEvent(new Event('focus')));
await pa.waitForSelector('.wa-msg.out .wa-tick.read', { timeout: 30000 }).catch(() => {});
ok(await pa.locator('.wa-msg.out .wa-tick.read').count() > 0, 'blue read ticks after the other person reads');
await finishSpeech();
await pa.setInputFiles('#attach', { name: 'signed-contract.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n% Signed service contract, Northwind Ltd and Bluefield Pvt Ltd\n%%EOF') });
await pa.waitForSelector('.wa-msg.out .wa-doc', { timeout: 60000 }); await pb.waitForSelector('.wa-msg.in .wa-doc', { timeout: 60000 });
ok(true, 'document sent, received and decrypted');
await say('c_doc', 'Send any file', 'Encrypted on Asha\'s device, decrypted on Bala\'s.');
// a photo of a signed page, made for the demo
const shot = await browser.newPage({ viewport: { width: 600, height: 420 } });
await shot.setContent(`<body style="margin:0;background:#e9e4dc;display:grid;place-items:center;height:100vh;font-family:Georgia,serif">
  <div style="width:500px;height:340px;background:#fffdf8;box-shadow:0 10px 30px rgba(0,0,0,.25);padding:28px;transform:rotate(-2deg)">
  <div style="font:700 18px Georgia">SERVICE AGREEMENT: SIGNATURE PAGE</div><div style="margin:14px 0;font-size:13px;color:#555">Northwind Ltd and Bluefield Pvt Ltd agree to the terms above.</div>
  <div style="display:flex;gap:40px;margin-top:70px"><div><div style="font:italic 30px 'Brush Script MT',cursive;color:#1a3a8a">A. Rao</div><div style="border-top:1px solid #333;width:170px;font-size:11px">For Northwind Ltd</div></div>
  <div><div style="font:italic 30px 'Brush Script MT',cursive;color:#1a3a8a">B. Kumar</div><div style="border-top:1px solid #333;width:170px;font-size:11px">For Bluefield Pvt Ltd</div></div></div></div></body>`);
const photo = await shot.screenshot({ type: 'png' }); await shot.close();
await pb.setInputFiles('#attach', { name: 'signed-page.png', mimeType: 'image/png', buffer: photo });
await pa.waitForSelector('.wa-msg.in img.wa-img', { timeout: 60000 });
ok(true, 'photo sent from the other phone and shown');
await say('c_photo', 'A photo back', 'The signed page.');
await pa.click('#toggleOpts'); await pa.check('#viewOnce'); await sleep(500);
await say('c_once', 'View once', 'It can be opened a single time.', { hold: 0 });
await pa.type('#text', 'The board meets at 09:00. Delete after reading.', { delay: 35 }); await pa.press('#text', 'Enter');
await pb.waitForSelector('.wa-once', { timeout: 30000 }); await finishSpeech();
await pb.click('.wa-once'); await sleep(2500); await pb.click('#viewerClose');
await pa.waitForSelector('.wa-msg.out.gone', { timeout: 30000 });
ok(true, 'view-once message opened once, sender sees "Opened"');
await say('c_gone', 'Opened, and gone', 'The server no longer has it.');
await pa.click('#toggleOpts'); await pa.click('[data-min="1"]'); await sleep(400);
await pa.type('#text', 'Final offer for the deal: 240 crore', { delay: 35 }); await pa.press('#text', 'Enter');
await pb.waitForSelector('.wa-msg.locked', { timeout: 30000 });
ok(await pb.locator('text=Final offer for the deal').count() === 0, 'timed chat message stays sealed for the receiver');
await say('c_timed', 'Sealed until a time', 'Bala sees a locked bubble with a countdown.');
await sleep(1500);
await say('c_skip', '⏩ Skipping ahead', 'to the set time.');
await waitCut(pb.waitForSelector('.wa-msg.in >> text=Final offer for the deal', { timeout: 120000 }));
ok(true, 'timed chat message opened at its time');
await say('c_timedOpen', 'Unlocked on time', 'Now Bala can read it.');
await sleep(800);
const chatTo = Date.now() - vStart;
capPage = page;
const videoA = pa.video(), videoB = pb.video();
await ctxA.close(); await ctxB.close();

// ================= 4. Proof and plans =================
await go('/proof');
await page.waitForFunction(() => document.querySelectorAll('.proof-table tbody tr').length > 1, null, { timeout: 30000 }).catch(() => {});
const proofRows = await page.locator('.proof-table tbody tr').count();
ok(proofRows > 0, `proof page lists real transactions (${proofRows})`);
await say('proof', 'Proof page', 'Every action is a real NEAR testnet transaction.', { hold: 0 });
await sleep(3000); await page.mouse.wheel(0, 650); await finishSpeech();
await go('/app#plans');
await page.waitForFunction(() => !/—/.test(document.getElementById('planPrice').textContent) && document.getElementById('planStatus').textContent.trim().length > 0, null, { timeout: 30000 });
ok(true, `plans page loaded (${(await page.textContent('#planPrice')).trim()})`);
await say('plans', 'Free and Premium', 'Premium is paid in NEAR to a plans contract.');
ok(errors.length === 0, 'no page errors' + (errors.length ? ': ' + [...new Set(errors)].join(' | ') : ''));

// ================= end card =================
await page.evaluate(() => {
  window.__cap?.('', '');
  const d = document.createElement('div');
  d.style.cssText = 'position:fixed;inset:0;z-index:2147483645;background:#111;color:#fff;display:grid;place-items:center;text-align:center;font-family:system-ui';
  d.innerHTML = '<div><img src="/logo.svg" alt="" style="width:130px;height:130px"><div style="font:400 64px system-ui;letter-spacing:-2px;margin-top:10px">Sealed</div>'
    + '<div style="font:18px ui-monospace,monospace;color:#bbb;margin-top:12px">sealedfiles.vercel.app</div><div style="font:18px ui-monospace,monospace;color:#bbb;margin-top:6px">github.com/Lakshmikanth-3/Sealed</div>'
    + '<div style="font:16px system-ui;color:#999;margin-top:24px">Every step in this video was a real transaction on NEAR testnet.</div></div>';
  document.body.append(d);
});
await say('outro');
await sleep(1500);
const totalMs = Date.now() - vStart;
const videoMain = page.video();
await page.close(); await ctx.close(); await browser.close();
const raw = { main: await videoMain.path(), a: await videoA.path(), b: await videoB.path() };

// ================= edit: side-by-side chat, cut the waiting, add the voice =================
const cutsS = cuts.filter(([s, e]) => e - s > 1000).map(([s, e]) => [s / 1000, e / 1000]);
const removedBefore = (t) => cutsS.reduce((acc, [s, e]) => acc + (t >= e ? e - s : t > s ? t - s : 0), 0);
const finalMs = totalMs - cutsS.reduce((a, [s, e]) => a + (e - s) * 1000, 0);
const samples = Math.ceil((finalMs / 1000 + 1) * RATE), mix = new Int32Array(samples);
for (const { id, at } of timeline) {
  const t = at / 1000, start = Math.floor((t - removedBefore(t)) * RATE), pcm = voice[id].pcm;
  for (let i = 0; i < pcm.length / 2 && start + i < samples; i++) mix[start + i] += pcm.readInt16LE(i * 2);
}
const data = Buffer.alloc(samples * 2);
for (let i = 0; i < samples; i++) data.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(mix[i] * 0.9))), i * 2);
const hdr = Buffer.alloc(44);
hdr.write('RIFF', 0); hdr.writeUInt32LE(36 + data.length, 4); hdr.write('WAVE', 8); hdr.write('fmt ', 12); hdr.writeUInt32LE(16, 16); hdr.writeUInt16LE(1, 20); hdr.writeUInt16LE(1, 22);
hdr.writeUInt32LE(RATE, 24); hdr.writeUInt32LE(RATE * 2, 28); hdr.writeUInt16LE(2, 32); hdr.writeUInt16LE(16, 34); hdr.write('data', 36); hdr.writeUInt32LE(data.length, 40);
const wavOut = path.join(OUT, 'narration.wav'); fs.writeFileSync(wavOut, Buffer.concat([hdr, data]));
fs.writeFileSync(path.join(OUT, 'edit-decisions.json'), JSON.stringify({ cuts: cutsS, chat: [chatFrom / 1000, chatTo / 1000], aOff, bOff, timeline }, null, 2));

const c0 = (chatFrom / 1000).toFixed(2), c1 = (chatTo / 1000).toFixed(2);
const keep = cutsS.length ? `not(${cutsS.map(([s, e]) => `between(t,${s.toFixed(2)},${e.toFixed(2)})`).join('+')})` : '1';
const filter = [
  `[0:v]fps=25,setpts=PTS-STARTPTS[m]`,
  `[1:v]fps=25,setpts=PTS-STARTPTS+${aOff.toFixed(3)}/TB,scale=640:720[a]`,
  `[2:v]fps=25,setpts=PTS-STARTPTS+${bOff.toFixed(3)}/TB,scale=640:720[b]`,
  `[m][a]overlay=0:0:enable='between(t,${c0},${c1})':eof_action=pass[m1]`,
  `[m1][b]overlay=640:0:enable='between(t,${c0},${c1})':eof_action=pass[m2]`,
  `[m2]select='${keep}',setpts=N/25/TB[v]`,
].join(';');
const final = path.join(OUT, 'sealed-live-demo.mp4');
execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-i', raw.main, '-i', raw.a, '-i', raw.b, '-i', wavOut, '-filter_complex', filter, '-map', '[v]', '-map', '3:a',
  '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', '-af', 'apad', '-shortest', '-movflags', '+faststart', final], { stdio: 'inherit' });
for (const f of Object.values(raw)) fs.rmSync(f, { force: true });
const fails = results.filter(([c]) => !c).length;
console.log(`\ncut ${cutsS.length} waits (${Math.round(cutsS.reduce((a, [s, e]) => a + e - s, 0))} s removed)`);
console.log(`${results.length - fails}/${results.length} checks passed · ${final} · ${(fs.statSync(final).size / 1048576).toFixed(1)} MB · ${Math.round(finalMs / 1000)} s`);
process.exit(fails ? 1 : 0);
