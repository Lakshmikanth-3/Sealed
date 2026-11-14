import { serverConfig, chainSnapshot, utc, short, nearAmount, EXPLORER } from '/live.js';
const $ = (id) => document.getElementById(id);
const DEPLOY = [['Deploy + init', '7QGcHbgghNQNVMeopydK43ukuFSjodXRZJnkhGAjKtMa'], ['Worker registration', '4o2VD2AsdHHFBJf13YjrDyYgkAo1Lhkan6itM13PjDMt']];
const lines = [];
function log(text) { lines.push('> ' + text); while (lines.length > 9) lines.shift(); $('feed').textContent = lines.join('\n'); }

let config, lastBlock, lastWorkers;
async function tick() {
  try {
    config ||= await serverConfig();
    $('heroNet').textContent = config.network;
    if (!config.contract) { $('feedState').textContent = 'no contract'; $('feedState').className = 'badge warn'; log('server has no ANCHOR_CONTRACT configured'); return; }
    const s = await chainSnapshot(config.network, config.contract);
    if (s.block) {
      $('sBlock').textContent = s.block.toLocaleString('en-US'); $('sBlockTime').textContent = utc(s.blockTime);
      if (s.block !== lastBlock) log(`block #${s.block.toLocaleString('en-US')} final · ${short(s.blockHash, 6)}`);
      lastBlock = s.block;
    }
    if (s.config) {
      $('sWorkers').textContent = `${s.config.registered_workers} / ${s.config.max_workers}`;
      $('sCap').textContent = `${s.config.max_days_per_worker} days per worker · protocol v${s.config.protocol}`;
      $('sOwner').textContent = 'owner ' + s.config.owner;
    }
    $('sContract').textContent = config.contract;
    if (s.account) { $('sStorage').textContent = (s.account.storage_usage / 1024).toFixed(1) + ' KB'; $('sBalance').textContent = 'balance ' + nearAmount(s.account.amount); }
    if (s.stale) { $('feedState').textContent = 'stale'; $('feedState').className = 'badge warn'; log(`rpc busy · showing reading from ${utc(new Date(s.at))}`); }
    else if (s.errors.length) { $('feedState').textContent = 'degraded'; $('feedState').className = 'badge warn'; log('rpc error: ' + s.errors[0]); }
    else { $('feedState').textContent = 'live'; $('feedState').className = 'badge ok'; if (s.config && s.config.registered_workers !== lastWorkers) log(`${config.contract} · ${s.config.registered_workers} worker(s) registered`); lastWorkers = s.config?.registered_workers; }
  } catch (e) { $('feedState').textContent = 'offline'; $('feedState').className = 'badge bad'; log('unreachable: ' + e.message); }
}
for (const [label, hash] of DEPLOY) {
  const a = document.createElement('a'); a.href = `${EXPLORER.testnet}/txns/${hash}`; a.rel = 'noopener'; a.target = '_blank';
  a.innerHTML = `<span class="stat-label"></span><code></code>`; a.firstChild.textContent = label; a.lastChild.textContent = hash;
  $('deployLinks').append(a);
}
log('read-only session · no keys, no signing');
void tick(); setInterval(tick, 6000);
