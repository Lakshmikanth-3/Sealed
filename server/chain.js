// Anchor backend. "mock": append-only hash-chained local ledger (data/ledger.json).
// "testnet"/"mainnet": a relayer account signs a function call `anchor({v,worker,day,root,count})`.
// Live anchors require successful finalized execution on an explicitly configured contract.

import fs from 'node:fs';
import path from 'node:path';
import { sha256Hex, canonical } from '../lib/merkle.js';
import { validDay } from '../lib/schema.js';
import { lookupNearTx, validNearAccount } from '../lib/nearRpc.js';

const DEFAULT_RPC = { testnet: 'https://rpc.testnet.near.org', mainnet: 'https://rpc.mainnet.near.org' };

export function createChain(env = process.env, dataDir = path.resolve('data')) {
  const network = env.NEAR_NETWORK || 'mock';
  if (network === 'mock') return mockChain(dataDir);
  if (!['testnet', 'mainnet'].includes(network)) throw new Error('Unsupported NEAR network');
  if (!validNearAccount(env.ANCHOR_CONTRACT)) throw new Error('Set ANCHOR_CONTRACT to the deployed contract account');
  if (!validNearAccount(env.NEAR_ACCOUNT_ID)) throw new Error('Invalid NEAR relayer account');
  return nearChain({
    network,
    accountId: env.NEAR_ACCOUNT_ID,
    privateKey: env.NEAR_PRIVATE_KEY,
    contract: env.ANCHOR_CONTRACT,
    rpcUrl: env.NEAR_RPC_URL || DEFAULT_RPC[network],
  });
}

function validate(a) {
  if (!/^[\w-]{3,64}$/.test(a.worker || '')) throw new Error('bad worker id');
  if (!validDay(a.day)) throw new Error('bad day');
  if (!/^[0-9a-f]{64}$/.test(a.root || '')) throw new Error('bad root');
  if (!Number.isSafeInteger(a.count) || a.count < 1 || a.count > 10000) throw new Error('bad count');
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
  const policy = { network, contract, relayer: accountId };
  const account = () => (accountP ||= (async () => {
    if (!privateKey) throw new Error('NEAR_PRIVATE_KEY is required for transaction submission, not read-only verification');
    const { Account, KeyPairSigner, JsonRpcProvider } = await import('near-api-js');
    return new Account(accountId, new JsonRpcProvider({ url: rpcUrl }), KeyPairSigner.fromSecretKey(privateKey));
  })());

  return {
    network,
    sender: accountId,
    contract,
    rpcUrl,
    async anchor(input) {
      const args = validate(input);
      const acc = await account();
      const [node, deployed] = await Promise.all([acc.provider.viewNodeStatus(), acc.provider.viewAccount({ accountId: contract, blockQuery: { finality: 'final' } })]);
      if (node.chain_id !== network) throw new Error('RPC is connected to a different network');
      if (!deployed.code_hash || deployed.code_hash === '11111111111111111111111111111111') throw new Error('Anchor contract is not deployed');
      const outcome = await acc.callFunctionRaw({ contractId: contract, methodName: 'anchor', args,
        gas: 30_000_000_000_000n, deposit: 0n, waitUntil: 'FINAL' });
      const txHash = outcome.transaction.hash;
      const found = await lookupNearTx(rpcUrl, txHash, accountId, policy);
      return { network, txHash, sender: accountId, contract, timestamp: found.timestamp, execution: found.execution, finality: found.finality };
    },
    lookup: (ref, { protocol = 1 } = {}) => lookupNearTx(rpcUrl, ref.txHash, ref.sender || accountId, { ...policy, protocol, receiptId: ref.receiptId }),
  };
}
