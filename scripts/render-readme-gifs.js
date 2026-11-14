// Record the live site's 3D animations and convert them to GIFs for the README (GitHub cannot run JS).
// Usage: FFMPEG_PATH=/path/to/ffmpeg node scripts/render-readme-gifs.js [baseUrl]
// Writes docs/brand/hero-3d.gif (paper: written → sealed → encrypted → split → merged → opened)
// and docs/brand/story-3d.gif (the 8-scene "how it works" story, captions included).
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.argv[2] || 'https://sealedfiles.vercel.app';
const FFMPEG = process.env.FFMPEG_PATH;
if (!FFMPEG) throw new Error('Set FFMPEG_PATH');
const out = path.resolve('docs/brand'), tmp = path.resolve('.gif-tmp');
fs.mkdirSync(out, { recursive: true }); fs.rmSync(tmp, { recursive: true, force: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({ channel: 'chrome' });

async function record(name, w, h, run) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, recordVideo: { dir: tmp, size: { width: w, height: h } } });
  const p = await ctx.newPage(); const t0 = Date.now();
  const startAt = await run(p, t0);
  const total = (Date.now() - t0) / 1000;
  const v = p.video(); await ctx.close();
  return { file: await v.path(), start: startAt, dur: total - startAt, name };
}
function toGif({ file, start, dur, name }, width, fps = 12, crop = '') {
  const dest = path.join(out, `${name}.gif`);
  const vf = `${crop}fps=${fps},scale=${width}:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=64:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4`;
  execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-ss', start.toFixed(2), '-t', dur.toFixed(2), '-i', file, '-vf', vf, '-loop', '0', dest]);
  console.log(`${dest}  ${(fs.statSync(dest).size / 1048576).toFixed(2)} MB`);
}

// Hero: hide the headline column so only the 3D paper and its step label show.
const hero = await record('hero-3d', 1100, 640, async (p, t0) => {
  await p.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await p.addStyleTag({ content: '.land-top,.lp-hero-copy>:not(.stage-label),.lp-hero::after{display:none!important}.lp-hero{margin:0!important;padding:0!important;min-height:640px!important;height:640px}.stage-label{position:fixed;left:470px;bottom:18px;margin:0;font-size:15px!important;color:#111!important}' });
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.mouse.move(770, 320);
  // wait for the loop to restart at "written" so the GIF starts at the beginning
  await p.waitForFunction(() => /written/.test(document.getElementById('stageLabel').textContent), null, { timeout: 30000 });
  await p.waitForFunction(() => !/written/.test(document.getElementById('stageLabel').textContent), null, { timeout: 30000 });
  await p.waitForFunction(() => /written/.test(document.getElementById('stageLabel').textContent), null, { timeout: 30000 });
  const start = (Date.now() - t0) / 1000;
  await sleep(17400);
  return start;
});
toGif(hero, 420, 8, 'crop=640:640:440:0,');

// Story: framed stage plus caption bar, chapter by chapter.
const story = await record('story-3d', 1000, 700, async (p, t0) => {
  await p.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await p.addStyleTag({ content: '.land-top{display:none!important}' });
  await p.evaluate(() => { const s = document.querySelector('.story'); if (!s.classList.contains('paused')) s.querySelector('.st-play').click();
    const r = s.getBoundingClientRect(); window.scrollTo({ top: window.scrollY + r.top - 4, behavior: 'instant' }); });
  await p.mouse.move(999, 699);
  const start = (Date.now() - t0) / 1000 + 0.3;
  for (const [i, ms] of [6000, 3600, 3600, 4600, 3800, 4200, 4000, 10500].entries()) {
    await p.evaluate((n) => document.querySelectorAll('.st-chap')[n].click(), i); await sleep(ms);
  }
  return start;
});
toGif(story, 640, 8);

await browser.close();
fs.rmSync(tmp, { recursive: true, force: true });
