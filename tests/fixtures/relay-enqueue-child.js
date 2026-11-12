import { RelayStore } from '../../server/relayStore.js';
import { prepareSignedAnchor } from '../../server/workerAuthorization.js';
import { policy } from './relay.js';
const store = new RelayStore(process.argv[2], policy);
process.send({ ready: true });
process.on('message', (payload) => {
  try {
    const result = store.enqueue(payload, prepareSignedAnchor(payload, policy), policy);
    process.send({ id: result.id });
  } catch { process.send({ failed: true }); }
  store.close(); process.disconnect();
});
