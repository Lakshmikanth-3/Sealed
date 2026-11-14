// A chat-style illustration of Sealed: a locked file is sent in a chat, an early attempt is
// blocked and recorded on NEAR, then it opens by itself on time. Loops; static when motion is reduced.
const SCRIPT = [
  { at: 400, clock: '08:30', type: 'typing', side: 'out' },
  { at: 1400, clock: '08:30', side: 'out', text: 'Here is the paper for Centre B 👇' },
  { at: 2400, clock: '08:31', side: 'out', file: { name: 'maths-paper.pdf', note: 'Locked until 09:00' } },
  { at: 3800, clock: '08:41', type: 'typing', side: 'in' },
  { at: 4900, clock: '08:42', side: 'in', text: 'Can I open it now?' },
  { at: 5900, clock: '08:42', side: 'sys', tone: 'bad', text: 'Opened at 08:42, too early. Blocked and recorded on NEAR.' },
  { at: 7300, clock: '08:43', side: 'out', text: 'Nobody can. Not even me 🙂' },
  { at: 8800, clock: '09:00', side: 'sys', tone: 'ok', text: '09:00 reached. File opened. Same file that was locked ✓' },
  { at: 10200, clock: '09:01', side: 'in', text: 'Got it, thank you!' },
];
const LOOP_MS = 13500;

const h = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };

function bubble(step) {
  if (step.type === 'typing') { const b = h('div', `chat-b ${step.side} typing`); b.append(h('i'), h('i'), h('i')); return b; }
  if (step.side === 'sys') return h('div', `chat-sys ${step.tone}`, step.text);
  const b = h('div', `chat-b ${step.side}`);
  if (step.file) {
    const f = h('div', 'chat-file');
    const ic = h('span', 'chat-lock'); ic.setAttribute('aria-hidden', 'true');
    const tx = h('div'); tx.append(h('b', null, step.file.name), h('small', null, step.file.note));
    f.append(ic, tx); b.append(f);
  } else b.append(document.createTextNode(step.text));
  const meta = h('span', 'chat-meta', step.clock + (step.side === 'out' ? '  ✓✓' : '')); b.append(meta);
  return b;
}

export function startChatAnimation(root) {
  const body = root.querySelector('.chat-body'), clock = root.querySelector('.chat-clock'), status = root.querySelector('.chat-status');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) {
    for (const s of SCRIPT) if (s.type !== 'typing') body.append(bubble(s));
    clock.textContent = '09:01'; return;
  }
  let timers = [];
  const run = () => {
    body.replaceChildren(); clock.textContent = '08:30'; status.textContent = 'online';
    let typing = null;
    for (const s of SCRIPT) timers.push(setTimeout(() => {
      clock.textContent = s.clock;
      if (typing) { typing.remove(); typing = null; }
      const b = bubble(s);
      if (s.type === 'typing') { typing = b; status.textContent = s.side === 'in' ? 'typing…' : 'online'; } else status.textContent = 'online';
      body.append(b);
      requestAnimationFrame(() => b.classList.add('show'));
      body.scrollTo({ top: body.scrollHeight, behavior: 'smooth' });
    }, s.at));
    timers.push(setTimeout(run, LOOP_MS));
  };
  const io = new IntersectionObserver(([e]) => {
    timers.forEach(clearTimeout); timers = [];
    if (e.isIntersecting) run();
  });
  io.observe(root);
}
