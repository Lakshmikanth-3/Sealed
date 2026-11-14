// Hero background: thousands of small glyphs tell the Sealed story on a loop.
// drift → a sealed paper forms → it is encrypted (glyphs scramble) → it splits into 3 parts
// → the parts rejoin at the chosen time → decrypted, the lock opens → drift again.
const GLYPHS_CIPHER = '|T-+:#%01/\\<>=*';
const STAGES = [
  { key: 'drift', ms: 2200, label: '' },
  { key: 'paper', ms: 2600, label: '01  sealed' },
  { key: 'cipher', ms: 2600, label: '02  encrypted on your device' },
  { key: 'split', ms: 3400, label: '03  split into 3 parts' },
  { key: 'join', ms: 2400, label: '04  time reached, parts rejoin' },
  { key: 'open', ms: 3000, label: '05  decrypted, opened on time' },
];

export function startHeroAnimation(canvas, { onStage } = {}) {
  const ctx = canvas.getContext('2d');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let W = 0, H = 0, dpr = 1, parts = [], targets = {}, stage = 0, stageAt = performance.now(), raf = 0, mouse = { x: -1e4, y: -1e4 };
  const ink = () => getComputedStyle(canvas).color || '#111';

  function layout() {
    dpr = Math.min(devicePixelRatio || 1, 2);
    W = canvas.clientWidth; H = canvas.clientHeight;
    canvas.width = W * dpr; canvas.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const mobile = W < 760;
    // Paper geometry: right side on desktop, centred and faint on phones.
    const ph = Math.min(H * 0.72, 520), pw = ph * 0.74;
    const cx = mobile ? W * 0.5 : W * 0.72, cy = H * 0.5;
    const x0 = cx - pw / 2, y0 = cy - ph / 2;
    const step = mobile ? 11 : 9;
    const paper = [];
    // outline
    for (let x = x0; x <= x0 + pw; x += step) { paper.push({ x, y: y0, k: 'edge' }); paper.push({ x, y: y0 + ph, k: 'edge' }); }
    for (let y = y0 + step; y < y0 + ph; y += step) { paper.push({ x: x0, y, k: 'edge' }); paper.push({ x: x0 + pw, y, k: 'edge' }); }
    // text lines with ragged ends
    let row = 0;
    for (let y = y0 + ph * 0.2; y < y0 + ph * 0.92; y += step * 2.2, row++) {
      const len = pw * (0.55 + ((row * 37) % 30) / 100);
      for (let x = x0 + pw * 0.1; x < x0 + pw * 0.1 + len * 0.86; x += step * 0.9) paper.push({ x, y, k: 'text' });
    }
    // padlock at the top centre
    const lx = cx, ly = y0 + ph * 0.02, lw = pw * 0.2, lh = lw * 0.75;
    for (let x = lx - lw / 2; x <= lx + lw / 2; x += step * 0.7) for (let y = ly; y <= ly + lh; y += step * 0.7) paper.push({ x, y, k: 'lock' });
    for (let a = Math.PI; a <= Math.PI * 2; a += 0.22) paper.push({ x: lx + Math.cos(a) * lw * 0.32, y: ly + Math.sin(a) * lw * 0.42, k: 'shackle' });
    const n = paper.length;
    const third = (p) => (p.x < x0 + pw / 3 ? 0 : p.x < x0 + (2 * pw) / 3 ? 1 : 2);
    const gap = mobile ? pw * 0.18 : pw * 0.32;
    targets.paper = paper;
    targets.split = paper.map((p) => {
      const t = third(p), dx = (t - 1) * gap, dy = t === 1 ? -ph * 0.06 : ph * 0.04, rot = (t - 1) * 0.08;
      const ox = x0 + pw * (t + 0.5) / 3, oy = cy;
      const rx = ox + (p.x - ox) * Math.cos(rot) - (p.y - oy) * Math.sin(rot), ry = oy + (p.x - ox) * Math.sin(rot) + (p.y - oy) * Math.cos(rot);
      return { x: rx + dx, y: ry + dy };
    });
    targets.open = paper.map((p) => (p.k === 'shackle' ? { x: p.x - lw * 0.18, y: p.y - lw * 0.28 } : p));
    targets.meta = { x0, y0, pw, ph, cx, cy, lw };
    // keep extra free particles drifting in the background for depth
    const free = mobile ? 120 : 320;
    const total = n + free;
    if (parts.length !== total) {
      parts = Array.from({ length: total }, (_, i) => ({ x: Math.random() * W, y: Math.random() * H, vx: 0, vy: 0, i, free: i >= n,
        g: GLYPHS_CIPHER[(Math.random() * GLYPHS_CIPHER.length) | 0], seed: Math.random() }));
    }
  }

  function targetFor(p, key, t) {
    if (p.free || key === 'drift') {
      // slow orbit around the paper centre
      const { cx, cy } = targets.meta, a = p.seed * 6.283 + t * 0.00006 * (p.seed > 0.5 ? 1 : -1);
      const r = (0.25 + p.seed * 0.75) * Math.max(W, H) * 0.55;
      return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r * 0.62 };
    }
    if (key === 'split') return targets.split[p.i];
    if (key === 'open') return targets.open[p.i];
    return targets.paper[p.i];
  }

  function frame(t) {
    const elapsed = t - stageAt;
    if (elapsed > STAGES[stage].ms) { stage = (stage + 1) % STAGES.length; stageAt = t; onStage?.(STAGES[stage]); }
    const key = STAGES[stage].key;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = ink();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const size = W < 760 ? 9 : 10;
    ctx.font = `${size}px ui-monospace, Consolas, monospace`;
    for (const p of parts) {
      const tg = targetFor(p, key, t);
      const k = p.free ? 0.006 : 0.075;
      p.vx = (p.vx + (tg.x - p.x) * k) * 0.8; p.vy = (p.vy + (tg.y - p.y) * k) * 0.8;
      const mdx = p.x - mouse.x, mdy = p.y - mouse.y, md = mdx * mdx + mdy * mdy;
      if (md < 6400) { const f = (6400 - md) / 6400 * 2.2; p.vx += (mdx / Math.sqrt(md + 1)) * f; p.vy += (mdy / Math.sqrt(md + 1)) * f; }
      p.x += p.vx; p.y += p.vy;
      const role = p.free ? 'free' : targets.paper[p.i].k;
      let g, a;
      if (p.free) { g = p.g; a = 0.16; }
      else if (key === 'cipher' || key === 'split' || key === 'join') {
        if (Math.random() < 0.08) p.g = GLYPHS_CIPHER[(Math.random() * GLYPHS_CIPHER.length) | 0];
        g = role === 'edge' ? '|' : role === 'lock' || role === 'shackle' ? '#' : p.g; a = role === 'text' ? 0.75 : 0.9;
      } else if (key === 'drift') { g = p.g; a = 0.3; }
      else { g = role === 'text' ? '-' : role === 'edge' ? (Math.abs(p.y - targets.paper[p.i].y) < 2 && (p.i % 2) ? '-' : '|') : role === 'shackle' ? 'o' : '#'; a = role === 'text' ? 0.55 : 0.85; }
      ctx.globalAlpha = a;
      ctx.fillText(g, p.x, p.y);
    }
    ctx.globalAlpha = 1;
    raf = requestAnimationFrame(frame);
  }

  function still() {
    // reduced motion: draw the sealed paper once
    layout(); ctx.clearRect(0, 0, W, H); ctx.fillStyle = ink(); ctx.globalAlpha = 0.6;
    ctx.font = '10px ui-monospace, Consolas, monospace';
    for (const p of targets.paper) ctx.fillText(p.k === 'text' ? '-' : p.k === 'edge' ? '|' : '#', p.x, p.y);
    onStage?.(STAGES[1]);
  }

  const ro = new ResizeObserver(() => { if (reduce) still(); else layout(); });
  ro.observe(canvas);
  if (reduce) { still(); return; }
  layout();
  canvas.parentElement.addEventListener('pointermove', (e) => { const r = canvas.getBoundingClientRect(); mouse = { x: e.clientX - r.left, y: e.clientY - r.top }; });
  canvas.parentElement.addEventListener('pointerleave', () => { mouse = { x: -1e4, y: -1e4 }; });
  // pause when off screen or tab hidden
  const io = new IntersectionObserver(([e]) => { cancelAnimationFrame(raf); if (e.isIntersecting) raf = requestAnimationFrame(frame); });
  io.observe(canvas);
  document.addEventListener('visibilitychange', () => { cancelAnimationFrame(raf); if (!document.hidden) raf = requestAnimationFrame(frame); });
  onStage?.(STAGES[0]);
}
