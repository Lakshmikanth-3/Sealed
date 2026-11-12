// Optional NEAR contract (near-sdk-js). Without it, anchors still work: the relayer's
// transaction args are recorded on-chain even though the call fails at execution.
// Deploying it makes anchors succeed cleanly and queryable by view call.
//
// Build/deploy (needs: npm i -D near-sdk-js, near-cli-rs):
//   npx near-sdk-js build contract/anchor.js build/anchor.wasm
//   near contract deploy <ANCHOR_CONTRACT> use-file build/anchor.wasm without-init-call network-config testnet sign-with-keychain send
import { NearBindgen, call, view, near, LookupMap } from 'near-sdk-js';

@NearBindgen({})
class AppealAnchors {
  anchors = new LookupMap('a');

  @call({})
  anchor({ v, worker, day, root, count }) {
    if (!/^[0-9a-f]{64}$/.test(root)) throw new Error('bad root');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error('bad day');
    const key = `${worker}:${day}`;
    const list = this.anchors.get(key) || [];
    list.push({ v, root, count, ts: near.blockTimestamp().toString(), by: near.predecessorAccountId() });
    this.anchors.set(key, list);
    near.log(`anchor ${key} ${root}`);
  }

  @view({})
  get_anchors({ worker, day }) {
    return this.anchors.get(`${worker}:${day}`) || [];
  }
}
