// Demo delivery-app simulator. Generates trips with GPS routes and the pay a platform
// would show; optional injected underpayment. Output is a statement CSV for Appeal's
// Check company page. All data here is simulated.
const $ = (id) => document.getElementById(id);
const SIM_KEY = 'appeal:simulator-statement';
const START = { lat: 13.0827, lon: 80.2707 }; // Chennai
let cards, shift = [];

function haversineKm(a, b) {
  const R = 6371, rad = (d) => d * Math.PI / 180;
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
function route(from, legs) {
  const pts = [from];
  for (let i = 0; i < legs; i++) {
    const p = pts.at(-1);
    pts.push({ lat: p.lat + (Math.random() - 0.3) * 0.022, lon: p.lon + (Math.random() - 0.3) * 0.022 });
  }
  return pts;
}
const round1 = (n) => Math.round(n * 10) / 10;
const rs = (n) => '₹' + Math.round(n).toLocaleString('en-IN');

function generate() {
  const n = Math.min(Math.max(Number($('tripCount').value) || 5, 1), 20);
  const card = cards.DemoEats, today = new Date().toLocaleDateString('en-CA');
  let from = START, t = new Date(); t.setHours(11, 0, 0, 0);
  const victim = $('inject').checked ? Math.min(2, n - 1) : -1;
  shift = Array.from({ length: n }, (_, i) => {
    const pts = route(from, 4 + Math.floor(Math.random() * 4)); from = pts.at(-1);
    let gpsKm = 0; for (let k = 1; k < pts.length; k++) gpsKm += haversineKm(pts[k - 1], pts[k]);
    gpsKm = round1(Math.max(gpsKm, 1.5));
    const incentivePromised = i % 2 === 0 ? 15 : 0;
    const trip = { tripId: 'DE' + (4470 + i), date: today, start: new Date(t), gpsKm, shownKm: gpsKm, incentivePromised, incentivePaid: incentivePromised, penalty: 0, penaltyReason: '', points: pts.length };
    if (i === victim) { trip.shownKm = round1(gpsKm * 0.65); trip.incentivePromised = 15; trip.incentivePaid = 0; trip.penalty = 10; }
    trip.pay = Math.round(Math.max(card.baseFare + trip.shownKm * card.perKm, card.minFare) + trip.incentivePaid - trip.penalty);
    t = new Date(t.getTime() + (25 + Math.random() * 20) * 60000);
    return trip;
  });
  render();
  const csv = toCsv();
  try { localStorage.setItem(SIM_KEY, JSON.stringify({ csv, name: `demoeats-shift-${today}.csv`, at: Date.now() })); } catch { /* storage blocked: CSV download still works */ }
  $('toAppeal').disabled = $('download').disabled = false;
  $('simStatus').textContent = `Generated ${n} trips${victim >= 0 ? `; trip ${shift[victim].tripId} is underpaid` : ''}. Saved for Appeal on this device.`;
}
function render() {
  $('shiftTotal').textContent = rs(shift.reduce((a, t) => a + t.pay, 0));
  $('trips').replaceChildren(...shift.map((t) => {
    const li = document.createElement('li');
    li.innerHTML = '<div class="sim-row"><b></b><span class="sim-pay"></span></div><small></small>';
    li.querySelector('b').textContent = `${t.tripId} · ${t.start.toTimeString().slice(0, 5)}`;
    li.querySelector('.sim-pay').textContent = rs(t.pay);
    li.querySelector('small').textContent = `${t.shownKm.toFixed(1)} km${t.incentivePaid ? ` · incentive ${rs(t.incentivePaid)}` : ''}${t.penalty ? ` · penalty ${rs(t.penalty)}` : ''} · ${t.points} GPS points`;
    return li;
  }));
}
function toCsv() {
  const cols = ['trip_id', 'date', 'type', 'platform', 'gps_km', 'shown_km', 'amount', 'incentive_promised', 'incentive_paid', 'penalty', 'penalty_reason'];
  const rows = shift.map((t) => [t.tripId, t.date, 'trip', 'DemoEats', t.gpsKm, t.shownKm, t.pay, t.incentivePromised, t.incentivePaid, t.penalty, t.penaltyReason]);
  return [cols, ...rows].map((r) => r.map((v) => /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v).join(',')).join('\n') + '\n';
}

$('generate').onclick = generate;
$('toAppeal').onclick = () => { location.href = '/app?fromSimulator=1#check'; };
$('download').onclick = () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([toCsv()], { type: 'text/csv' })); a.download = `demoeats-shift-${shift[0]?.date || 'today'}.csv`;
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};
fetch('/ratecards.json').then((r) => r.json()).then((c) => { cards = c; $('generate').disabled = false; })
  .catch(() => { $('simStatus').textContent = 'Rate cards unavailable.'; });
$('generate').disabled = true;
