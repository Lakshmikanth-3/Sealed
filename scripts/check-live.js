// Read-only public-network gate. Never signs, broadcasts or fabricates an anchor.
import { createChain } from '../server/chain.js';
import { contractReadiness } from '../server/readiness.js';
import { lookupNearTx } from '../lib/nearRpc.js';
const chain = createChain();
try {
  const readiness = await contractReadiness(chain, process.env.WORKER_ACCOUNT_ID);
  console.log(JSON.stringify(readiness));
  if (!process.env.LIVE_TX_HASH || !process.env.WORKER_ACCOUNT_ID) throw new Error('Set WORKER_ACCOUNT_ID and LIVE_TX_HASH to verify an actual worker transaction');
  const result = await lookupNearTx(chain.rpcUrl, process.env.LIVE_TX_HASH, process.env.WORKER_ACCOUNT_ID,
    { network: chain.network, contract: chain.contract, protocol: 2 });
  if (result.workerAccount !== process.env.WORKER_ACCOUNT_ID) throw new Error('Unexpected worker');
  console.log(JSON.stringify(result, null, 2));
} catch (error) { console.error('Live verification incomplete: ' + error.message); process.exitCode = 1; }
