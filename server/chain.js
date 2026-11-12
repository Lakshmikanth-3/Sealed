// Anchor backend. "mock": append-only hash-chained local ledger (data/ledger.json).
// "testnet"/"mainnet": a relayer account signs a function call `anchor({v,worker,day,root,count})`.
// If ANCHOR_CONTRACT has no contract deployed, the call fails at execution but the transaction
// and its args are still permanently on-chain with a block timestamp, which is what the verifier reads.

import fs from 'node:fs';
import path from 'node:path';
import { sha256Hex, canonical } from '../lib/merkle.js';
import { lookupNearTx } from '../lib/nearRpc.js';

const DEFAULT_RPC = { testnet: 'https://rpc.testnet.near.org', mainnet: 'https://rpc.mainnet.near.org' };

export function createChain(env = process.env, dataDir = path.resolve('data')) {
  const network = env.NEAR_NETWORK || 'mock';
  if (network === 'mock') return mockChain(dataDir);
  if (!env.NEAR_ACCOUNT_ID || !env.NEAR_PRIVATE_KEY) {
    throw new Error(`NEAR_NETWORK=${network} needs NEAR_ACCOUNT_ID and NEAR_PRIVATE_KEY in .env`);
  }
  return nearChain({
    network,
    accountId: env.NEAR_ACCOUNT_ID,
    privateKey: env.NEAR_PRIVATE_KEY,
    contract: env.ANCHOR_CONTRACT || env.NEAR_ACCOUNT_ID,
    rpcUrl: env.NEAR_RPC_URL || DEFAULT_RPC[network],
  });
}

function validate(a) {
  if (!/^[\w-]{3,64}$/.test(a.worker || '')) throw new Error('bad worker id');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(a.day || '')) throw new Error('bad day');
  if (!/^[0-9a-f]{64}$/.test(a.root || '')) throw new Error('bad root');
  if (!Number.isInteger(a.count) || a.count < 1) throw new Error('bad count');
  return { v: 1, worker: a.worker, day: a.day, root: a.root, count: a.count };
}

function mockChain(dataDir) {
  const file = path.join(dataDir, 'ledger.json');
  fs.mkdirSync(dataDir, { recursive: true });
  const load = () => (fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : []);
  return {
    network: 'mock',
    sender: 'mock-relayer',
    rpcUrl: null,
    async anchor(input) {
      const args = validate(input);
      const ledger = load();
      const prev = ledger.at(-1)?.txHash || '0'.repeat(64);
      const timestamp = Date.now();
      const txHash = await sha256Hex(prev + canonical(args) + timestamp);
      ledger.push({ txHash, prev, timestamp, args });
      fs.writeFileSync(file, JSON.stringify(ledger, null, 1));
      return { network: 'mock', txHash, sender: 'mock-relayer', timestamp };
    },
    async lookup(ref) {
      const ledger = load();
      let prev = '0'.repeat(64);
      for (const row of ledger) { // re-check the hash chain so ledger edits are detected
        const h = await sha256Hex(prev + canonical(row.args) + row.timestamp);
        if (h !== row.txHash || row.prev !== prev) throw new Error('mock ledger hash chain broken');
        if (row.txHash === ref.txHash) return { args: row.args, timestamp: row.timestamp, signer: 'mock-relayer', execution: 'mock' };
        prev = row.txHash;
      }
      throw new Error('unknown transaction');
    },
  };
}

function nearChain({ network, accountId, privateKey, contract, rpcUrl }) {
  let accountP;
  const account = () => (accountP ||= (async () => {
    const { keyStores, KeyPair, connect } = (await import('near-api-js')).default;
    const keyStore = new keyStores.InMemoryKeyStore();
    await keyStore.setKey(network, accountId, KeyPair.fromString(privateKey));
    const near = await connect({ networkId: network, keyStore, nodeUrl: rpcUrl });
    return near.account(accountId);
  })());

  return {
    network,
    sender: accountId,
    rpcUrl,
    async anchor(input) {
      const args = validate(input);
      const { transactions } = (await import('near-api-js')).default;
      const acc = await account();
      const action = transactions.functionCall('anchor', args, 30_000_000_000_000n, 0n);
      const [, signed] = await acc.signTransaction(contract, [action]);
      const outcome = await acc.connection.provider.sendTransaction(signed);
      const txHash = outcome.transaction.hash;
      const found = await lookupNearTx(rpcUrl, txHash, accountId);
      return { network, txHash, sender: accountId, timestamp: found.timestamp, execution: found.execution };
    },
    lookup: (ref) => lookupNearTx(rpcUrl, ref.txHash, ref.sender || accountId),
  };
}
