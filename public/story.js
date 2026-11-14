// "How it works" 3D story: write → seal → choose → (A) time → opened, (B) split → merged → opened → live chat.
// Scene states are CSS (data-scene on the root); the pen, writing and NEAR blocks are driven here.
const SCENES = [
  { key: 'write', ms: 6500, title: 'Write it', text: 'Someone writes the paper, or picks any photo, video, audio or document.' },
  { key: 'seal', ms: 4800, title: 'Seal it', text: 'It is encrypted on their own device and locked. Now nobody can read it, not even Sealed.', chain: ['create_seal', 'ok'] },
  { key: 'choose', ms: 4800, title: 'Choose how it unlocks', text: 'Option A: on a date and time. Option B: only when the parts are merged.' },
  { key: 'timeA', ms: 6200, title: 'A. Wait for the time', text: 'It is sent to the receiver. Opening early is refused by NEAR, and the attempt is recorded in public.', chain: ['request_open: too early', 'bad'] },
  { key: 'openA', ms: 4800, title: 'A. Time reached: decrypted', text: 'At 09:00 NEAR allows it. The key is released and the paper is decrypted on the receiver’s device.', chain: ['request_open: open', 'ok'] },
  { key: 'splitB', ms: 5600, title: 'B. Split between people', text: 'The key is split into 3 parts, one for each person. One part alone reveals nothing.', chain: ['3 parts committed', 'ok'] },
  { key: 'mergeB', ms: 5600, title: 'B. Merge the parts: decrypted', text: 'When enough people merge their parts, NEAR records it and the paper is decrypted.', chain: ['release_part ×3, open', 'ok'] },
  { key: 'chat', ms: 13500, title: 'Live chat, encrypted', text: 'Two people chat like WhatsApp. Text, documents, photos, voice and video travel locked and are decrypted only on the phones.', chain: ['server sees only ciphertext', 'ok'] },
];

export function startStory(root) {
  const $ = (s) => root.querySelector(s), $$ = (s) => [...root.querySelectorAll(s)];
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let i = 0, timer = 0, playing = !reduce, visible = false, anims = [];

  const chapters = $('.st-chapters');
  SCENES.forEach((s, n) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'st-chap';
    b.innerHTML = `<span class="mono">0${n + 1}</span>${s.title.replace(/^[AB]\. /, '')}<i></i>`;
    b.onclick = () => { go(n); };
    chapters.append(b);
  });
  $('.st-play').onclick = () => { playing = !playing; $('.st-play').textContent = playing ? '❚❚ Pause' : '▶ Play'; root.classList.toggle('paused', !playing); if (playing) go(i); else clearTimeout(timer); };

  function chainFor(n) {
    // Rebuild the NEAR block row up to this scene, so jumping around stays consistent.
    const row = $('.st-blocks'); row.replaceChildren();
    for (let k = 0; k <= n; k++) {
      if (!SCENES[k].chain) continue;
      if (k >= 3 && k <= 4 && n >= 5) continue; // path B shows its own blocks
      if (k >= 5 && k <= 6 && n < 5) continue;
      const [t, tone] = SCENES[k].chain;
      const b = document.createElement('span'); b.className = `st-blk ${tone}${k === n ? ' new' : ''}`; b.textContent = t; row.append(b);
    }
  }

  function write() {
    // The pen moves across each line while the line segments in the three pieces are revealed.
    const stage = $('.st-stage').getBoundingClientRect(), pen = $('.st-pen');
    const lines = $$('.st-piece')[0].querySelectorAll('.ln').length;
    const seg = 230, start = 500;
    const frames = [];
    let t = start;
    for (let li = 0; li < lines; li++) {
      const segs = $$('.st-piece').map((p) => p.querySelectorAll('.ln')[li]);
      segs.forEach((ln, p) => anims.push(ln.animate([{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], { duration: seg, delay: t + p * seg, fill: 'both', easing: 'linear' })));
      const a = segs[0].getBoundingClientRect(), z = segs[2].getBoundingClientRect();
      const y = a.top - stage.top + a.height / 2;
      frames.push({ x: a.left - stage.left, y, t }, { x: z.right - stage.left, y, t: t + 3 * seg });
      t += 3 * seg + 120;
    }
    const total = t + 300;
    const kf = [{ transform: `translate(${frames[0].x + 30}px, ${frames[0].y - 60}px) rotate(-20deg)`, offset: 0 }];
    for (const f of frames) kf.push({ transform: `translate(${f.x}px, ${f.y}px) rotate(${f === frames[0] ? -5 : 0}deg)`, offset: Math.min(1, f.t / total) });
    kf.push({ transform: `translate(${frames.at(-1).x + 40}px, ${frames.at(-1).y - 70}px) rotate(-25deg)`, offset: 1 });
    anims.push(pen.animate(kf, { duration: total, fill: 'both', easing: 'ease-in-out' }));
  }

  function go(n) {
    clearTimeout(timer);
    anims.forEach((a) => a.cancel()); anims = [];
    i = (n + SCENES.length) % SCENES.length;
    const s = SCENES[i];
    root.dataset.scene = s.key;
    root.style.setProperty('--scene-ms', `${s.ms}ms`);
    $('.st-n').textContent = `0${i + 1}`; $('.st-title').textContent = s.title; $('.st-text').textContent = s.text;
    $$('.st-chap').forEach((b, k) => { b.classList.toggle('on', k === i); b.classList.toggle('done', k < i); });
    chainFor(i);
    // restart CSS keyframe animations inside the stage
    const stage = $('.st-stage'); stage.classList.remove('run'); void stage.offsetWidth; stage.classList.add('run');
    if (s.key === 'write' && !reduce) requestAnimationFrame(write);
    if (playing && visible) timer = setTimeout(() => go(i + 1), s.ms);
  }

  new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    if (visible && playing) go(i); else clearTimeout(timer);
  }, { threshold: 0.35 }).observe(root);
  if (reduce) { playing = false; $('.st-play').textContent = '▶ Play'; root.classList.add('paused'); }
  go(0);
}
