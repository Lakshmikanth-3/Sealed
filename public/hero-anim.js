// Hero background: a 3D paper tells the Sealed idea on a loop.
// written → sealed (padlock drops on) → encrypted (cipher text) → split into 3 parts (swing apart in 3D)
// → merged (green flash) → decrypted and opened (readable text, padlock swings open).
const CIPHER = '#%&@$*+=<>/\\|01ABCDEFXZ';
const INK = '17,17,17', ACCENT = '209,75,31', OK = '31,122,70';
const STAGES = [
  { key: 'write', ms: 3400, label: '01  written' },
  { key: 'seal', ms: 2200, label: '02  sealed' },
  { key: 'encrypt', ms: 2600, label: '03  encrypted on your device' },
  { key: 'split', ms: 3400, label: '04  split into 3 parts' },
  { key: 'merge', ms: 2400, label: '05  parts merged' },
  { key: 'open', ms: 3400, label: '06  decrypted and opened' },
];
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const PIECE_X = [[-150, -50], [-50, 50], [50, 150]]; // the paper is 300 × 400 units, centred on 0

// Text glyphs: one row per line, ragged ends, a bold heading first.
function buildText() {
  const pts = []; let row = 0;
  for (let y = -150; y <= 165; y += 21, row++) {
    const len = row === 0 ? 140 : 165 + ((row * 53) % 75);
    for (let x = -126; x <= -126 + len; x += 9) {
      pts.push({ x, y, head: row === 0, order: row + (x + 126) / 260, piece: x < -50 ? 0 : x < 50 ? 1 : 2, g: CIPHER[(Math.random() * CIPHER.length) | 0] });
    }
  }
  return { pts, rows: row };
}

export function startHeroAnimation(canvas, { onStage } = {}) {
  const ctx = canvas.getContext('2d');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const { pts, rows } = buildText();
  const dust = Array.from({ length: 120 }, () => ({ a: Math.random() * Math.PI * 2, r: 260 + Math.random() * 420, y: (Math.random() - 0.5) * 700, s: 0.2 + Math.random() * 0.6, g: CIPHER[(Math.random() * CIPHER.length) | 0] }));
  let W = 0, H = 0, cx = 0, cy = 0, scale = 1, stage = 0, stageAt = performance.now(), raf = 0, mx = 0, my = 0, tmx = 0, tmy = 0;

  function layout() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    W = canvas.clientWidth; H = canvas.clientHeight;
    canvas.width = W * dpr; canvas.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const mobile = W < 760;
    cx = mobile ? W * 0.5 : Math.max(W * 0.7, W - 330); cy = H * 0.53;
    scale = Math.min((H * 0.72) / 480, (mobile ? W * 0.62 : W * 0.3) / 330);
  }

  // Each piece's placement for this stage: offset and rotation about its own vertical axis.
  function pieceT(i, key, p) {
    const side = i - 1;
    const apart = { dx: side * 70, dy: i === 1 ? -26 : 16, dz: i === 1 ? 110 : 30, ry: -side * 0.62, rz: side * 0.05 };
    const none = { dx: 0, dy: 0, dz: 0, ry: 0, rz: 0 };
    const mix = (a, b, t) => Object.fromEntries(Object.keys(a).map((k) => [k, a[k] + (b[k] - a[k]) * t]));
    if (key === 'split') return mix(none, apart, ease(clamp(p * 1.4)));
    if (key === 'merge') return mix(apart, none, ease(clamp(p * 1.3)));
    return none;
  }
  // Local paper point (x, y, z) of piece i → world, then camera projection.
  function place(i, T, x, y, z) {
    const pcx = (PIECE_X[i][0] + PIECE_X[i][1]) / 2, lx = x - pcx;
    const cR = Math.cos(T.ry), sR = Math.sin(T.ry), cZ = Math.cos(T.rz), sZ = Math.sin(T.rz);
    const rx = lx * cR + z * sR, rz = -lx * sR + z * cR;
    return [pcx + rx * cZ - y * sZ + T.dx, rx * sZ + y * cZ + T.dy, rz - T.dz];
  }
  let rotY = 0, rotX = 0;
  function project([x, y, z]) {
    const cY = Math.cos(rotY), sY = Math.sin(rotY), cX = Math.cos(rotX), sX = Math.sin(rotX);
    const x1 = x * cY + z * sY, z1 = -x * sY + z * cY, y1 = y * cX - z1 * sX, z2 = y * sX + z1 * cX;
    const f = 900 / (900 + z2);
    return { sx: cx + x1 * scale * f, sy: cy + y1 * scale * f, f, z: z2 };
  }

  function drawLock(state, now) {
    // Vector padlock sitting on the top edge of the paper (local y = -200).
    const { drop, open, green } = state;
    if (drop <= 0) return;
    const base = project(place(1, { dx: 0, dy: 0, dz: 0, ry: 0, rz: 0 }, 0, -205 - (1 - drop) * 230, -(1 - drop) * 150));
    const s = scale * base.f, w = 64 * s, h = 48 * s, col = green ? OK : INK;
    ctx.save(); ctx.globalAlpha = clamp(drop * 1.5); ctx.translate(base.sx, base.sy);
    ctx.shadowColor = 'rgba(0,0,0,.25)'; ctx.shadowBlur = 18 * s; ctx.shadowOffsetY = 8 * s;
    // shackle (swings open about its right foot)
    ctx.save(); ctx.translate(18 * s, -h / 2); ctx.rotate(-0.95 * open); ctx.translate(-18 * s, -14 * s * open);
    ctx.strokeStyle = `rgb(${col})`; ctx.lineWidth = 9 * s; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-18 * s, 0); ctx.lineTo(-18 * s, -14 * s); ctx.arc(0, -14 * s, 18 * s, Math.PI, 0); ctx.lineTo(18 * s, 0); ctx.stroke(); ctx.restore();
    // body
    ctx.fillStyle = `rgb(${col})`; ctx.beginPath(); ctx.roundRect(-w / 2, -h / 2, w, h, 9 * s); ctx.fill();
    ctx.shadowColor = 'transparent'; ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(0, -4 * s, 6 * s, 0, Math.PI * 2); ctx.fill(); ctx.fillRect(-2.5 * s, -2 * s, 5 * s, 14 * s);
    ctx.restore();
  }

  function draw(now) {
    const st = STAGES[stage], key = st.key, p = clamp((now - stageAt) / st.ms);
    mx += (tmx - mx) * 0.05; my += (tmy - my) * 0.05;
    rotY = Math.sin(now / 2600) * 0.28 + mx * 0.35; rotX = -0.1 + Math.cos(now / 3400) * 0.05 + my * 0.16;
    ctx.clearRect(0, 0, W, H);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';

    // floating cipher dust for depth
    for (const d of dust) {
      const a = d.a + now / (9000 / d.s), q = project([Math.cos(a) * d.r, d.y, Math.sin(a) * d.r]);
      if (q.f <= 0) continue;
      ctx.font = `${Math.round(10 * q.f * (scale + 0.4))}px ui-monospace, Consolas, monospace`;
      ctx.fillStyle = `rgba(${INK},${clamp(0.06 + 0.14 * q.f)})`; ctx.fillText(d.g, q.sx, q.sy);
    }

    const writeP = key === 'write' ? p : 1;
    const cipher = key === 'encrypt' ? clamp(p * 1.6) : key === 'split' || key === 'merge' ? 1 : key === 'open' ? 1 - clamp(p * 1.8) : 0;
    const lock = { drop: key === 'write' || key === 'split' ? 0 : key === 'seal' ? ease(clamp(p * 1.3)) : key === 'merge' ? ease(clamp((p - 0.55) * 3)) : 1,
      open: key === 'open' ? ease(clamp((p - 0.3) * 2.2)) : 0, green: key === 'open' && p > 0.4 };
    const flash = key === 'merge' ? clamp(1 - Math.abs(p - 0.7) * 3.5) : 0;

    // Pieces, back to front: a white sheet with a dark border and a soft shadow, then its text.
    const pieces = [0, 1, 2].map((i) => {
      const T = pieceT(i, key, p), [x0, x1] = PIECE_X[i];
      const corners = [[x0, -200], [x1, -200], [x1, 200], [x0, 200]].map(([x, y]) => project(place(i, T, x, y, 0)));
      return { i, T, corners, depth: corners.reduce((a, c) => a + c.z, 0) / 4 };
    }).sort((a, b) => b.depth - a.depth);
    const apart = key === 'split' || (key === 'merge' && p < 0.75);
    for (const pc of pieces) {
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,.18)'; ctx.shadowBlur = 30 * scale; ctx.shadowOffsetY = 14 * scale;
      ctx.beginPath(); pc.corners.forEach((c, k) => (k ? ctx.lineTo(c.sx, c.sy) : ctx.moveTo(c.sx, c.sy))); ctx.closePath();
      ctx.fillStyle = '#ffffff'; ctx.fill();
      ctx.shadowColor = 'transparent'; ctx.lineWidth = Math.max(1.2, 2 * scale); ctx.strokeStyle = `rgb(${INK})`;
      if (apart) ctx.stroke();
      else { // one sheet: outer edges only, faint seams
        const [a, b, c, d] = pc.corners;
        ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.moveTo(c.sx, c.sy); ctx.lineTo(d.sx, d.sy);
        if (pc.i === 0) { ctx.moveTo(d.sx, d.sy); ctx.lineTo(a.sx, a.sy); }
        if (pc.i === 2) { ctx.moveTo(b.sx, b.sy); ctx.lineTo(c.sx, c.sy); }
        ctx.stroke();
        if (cipher > 0) { ctx.setLineDash([3, 5]); ctx.lineWidth = 1; ctx.strokeStyle = `rgba(${INK},.25)`; ctx.beginPath(); if (pc.i > 0) { ctx.moveTo(a.sx, a.sy); ctx.lineTo(d.sx, d.sy); } ctx.stroke(); ctx.setLineDash([]); }
      }
      ctx.restore();
      for (const pt of pts) {
        if (pt.piece !== pc.i || pt.order > writeP * rows) continue;
        if (Math.random() < 0.05) pt.g = CIPHER[(Math.random() * CIPHER.length) | 0];
        const enc = Math.random() < cipher;
        const q = project(place(pc.i, pc.T, pt.x, pt.y, 0));
        ctx.font = `${pt.head || enc ? 700 : 600} ${Math.max(8, Math.round(13 * q.f * scale + 2))}px ui-monospace, Consolas, monospace`;
        ctx.fillStyle = enc ? `rgba(${ACCENT},.95)` : `rgba(${INK},${pt.head ? 1 : 0.88})`;
        ctx.fillText(enc ? pt.g : pt.head ? '▬' : '—', q.sx, q.sy);
      }
      if (apart && key === 'split' && p > 0.45) {
        const q = project(place(pc.i, pc.T, (PIECE_X[pc.i][0] + PIECE_X[pc.i][1]) / 2, 232, 0));
        ctx.font = `700 ${Math.round(11 + 5 * scale)}px ui-monospace, Consolas, monospace`;
        ctx.fillStyle = `rgba(${INK},${clamp((p - 0.45) * 3)})`; ctx.fillText(`🔑 part ${pc.i + 1}`, q.sx, q.sy);
      }
    }
    if (flash > 0) {
      const a = project([-158, -208, 0]), b = project([158, 208, 0]);
      ctx.strokeStyle = `rgba(${OK},${flash})`; ctx.lineWidth = 3 + 5 * flash;
      ctx.beginPath(); ctx.roundRect(a.sx - 8 * flash, a.sy - 8 * flash, b.sx - a.sx + 16 * flash, b.sy - a.sy + 16 * flash, 6); ctx.stroke();
    }
    drawLock(lock, now);
  }

  function frame(now) {
    if (now - stageAt > STAGES[stage].ms) { stage = (stage + 1) % STAGES.length; stageAt = now; onStage?.(STAGES[stage]); }
    draw(now);
    raf = requestAnimationFrame(frame);
  }
  const still = () => { stage = 2; stageAt = performance.now() - 1e6; draw(performance.now()); };
  new ResizeObserver(() => { layout(); if (reduce) still(); }).observe(canvas);
  layout();
  if (reduce) { onStage?.(STAGES[2]); still(); return; }
  canvas.parentElement.addEventListener('pointermove', (e) => { const r = canvas.getBoundingClientRect(); tmx = (e.clientX - r.left) / r.width - 0.5; tmy = (e.clientY - r.top) / r.height - 0.5; });
  canvas.parentElement.addEventListener('pointerleave', () => { tmx = 0; tmy = 0; });
  new IntersectionObserver(([e]) => { cancelAnimationFrame(raf); if (e.isIntersecting && !document.hidden) raf = requestAnimationFrame(frame); }).observe(canvas);
  document.addEventListener('visibilitychange', () => { cancelAnimationFrame(raf); if (!document.hidden) raf = requestAnimationFrame(frame); });
  onStage?.(STAGES[0]);
}
