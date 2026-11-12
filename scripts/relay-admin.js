// Local operator only. This CLI never signs, funds, registers or broadcasts.
import path from 'node:path';
import { RelayStore } from '../server/relayStore.js';
import { validNearAccount } from '../lib/schema.js';

const [command, worker, ...extra] = process.argv.slice(2);
if (!['approve', 'revoke', 'jobs'].includes(command) || extra.length || (command === 'jobs' ? !!worker : !validNearAccount(worker))) {
  console.error('Usage: npm run relay:admin -- approve <account.testnet> | revoke <account.testnet> | jobs');
  process.exitCode = 1;
} else if (process.env.NEAR_NETWORK !== 'testnet' || !process.env.DATA_DIR
  || !validNearAccount(process.env.NEAR_ACCOUNT_ID) || !validNearAccount(process.env.ANCHOR_CONTRACT)) {
  console.error('Set testnet, DATA_DIR, NEAR_ACCOUNT_ID and ANCHOR_CONTRACT locally first. No private key is needed for this command.');
  process.exitCode = 1;
} else {
  let store;
  try {
    store = new RelayStore(path.resolve(process.env.DATA_DIR), { network: 'testnet', relayer: process.env.NEAR_ACCOUNT_ID, contract: process.env.ANCHOR_CONTRACT });
    if (command === 'jobs') console.log(JSON.stringify(store.list(), null, 2));
    else { store.approve(worker, command === 'approve'); console.log(command === 'approve' ? 'Local approval saved. On-chain registration is still required.' : 'Approval revoked. Unbroadcast jobs cancelled; broadcast jobs still reconcile.'); }
  } catch { console.error('Local relay administration failed. Check database configuration and permissions.'); process.exitCode = 1; }
  finally { store?.close(); }
}
