// Synthetic remote ledger persists across a killed child process. No network,
// funds or private worker/sponsor keys are involved in this crash fixture.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { RelayStore } from '../../server/relayStore.js';
import { RelayRunner } from '../../server/relayRunner.js';
import { prepareSignedAnchor } from '../../server/workerAuthorization.js';
import { policy, confirmed } from './relay.js';

const [dir, phase] = process.argv.slice(2);
const store = new RelayStore(dir, policy);
function freeze(at) {
  if (phase !== at) return;
  process.send({ at });
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0);
}
// Freeze after a committed transaction, not inside the SQLite transaction.
const locked = store.locked.bind(store);
store.locked = (owner, fn) => {
  const value = locked(owner, fn);
  const row = store.next();
  if (row?.state === 'prepared') freeze('prepared');
  if (row?.state === 'submitted') freeze('submitted');
  return value;
};
const remoteFile = path.join(dir, 'synthetic-remote.json');
const load = () => existsSync(remoteFile) ? JSON.parse(readFileSync(remoteFile, 'utf8')) : { attempts: [], chargedHashes: [] };
const transport = {
  validate: async () => {},
  prepare: async () => { freeze('signing'); return { bytes: 'synthetic-exact-signed-bytes', hash: '2'.repeat(44) }; },
  broadcast: async (bytes) => {
    const remote = load(); remote.attempts.push(bytes);
    if (!remote.chargedHashes.includes('2'.repeat(44))) remote.chargedHashes.push('2'.repeat(44));
    writeFileSync(remoteFile, JSON.stringify(remote)); freeze('broadcast');
  },
  reconcile: async (job) => {
    if (!load().chargedHashes.includes(job.tx_hash)) throw new Error('UNKNOWN_TRANSACTION');
    return confirmed(job, prepareSignedAnchor(JSON.parse(job.authorization), policy));
  },
};
const runner = new RelayRunner(store, transport, policy);
runner.start();
for (let i = 0; i < 4; i++) await runner.tick();
if (phase === 'recover') {
  process.send({ state: store.list()[0].state }); await runner.stop(); store.close(); process.disconnect();
}
