import { validNearAccount } from '../lib/schema.js';
import path from 'node:path';

export function relayConfig(env = process.env) {
  if (env.RELAY_ENABLED !== 'true') return { enabled: false };
  const requireValue = (ok, name) => { if (!ok) throw new Error(`Relay configuration requires ${name}`); };
  requireValue(env.NEAR_NETWORK === 'testnet', 'NEAR_NETWORK=testnet');
  requireValue(env.RELAY_PERSISTENT_DISK === 'true' && !!env.DATA_DIR && path.isAbsolute(env.DATA_DIR), 'absolute DATA_DIR on persistent disk and RELAY_PERSISTENT_DISK=true');
  requireValue(validNearAccount(env.NEAR_ACCOUNT_ID), 'NEAR_ACCOUNT_ID');
  requireValue(validNearAccount(env.ANCHOR_CONTRACT), 'ANCHOR_CONTRACT');
  requireValue(!!env.NEAR_PRIVATE_KEY, 'NEAR_PRIVATE_KEY');
  const positive = (name) => {
    requireValue(/^[1-9]\d{0,8}$/.test(env[name] || ''), name);
    return Number(env[name]);
  };
  requireValue(/^[1-9]\d{0,38}$/.test(env.RELAY_MIN_BALANCE_YOCTO || ''), 'RELAY_MIN_BALANCE_YOCTO');
  return { enabled: true, network: 'testnet', contract: env.ANCHOR_CONTRACT, relayer: env.NEAR_ACCOUNT_ID,
    workerDailyLimit: positive('RELAY_WORKER_DAILY_LIMIT'), globalDailyLimit: positive('RELAY_GLOBAL_DAILY_LIMIT'),
    requestsPerMinute: positive('RELAY_REQUESTS_PER_MINUTE'), minBalance: BigInt(env.RELAY_MIN_BALANCE_YOCTO),
    rpcUrl: env.NEAR_RPC_URL || 'https://rpc.testnet.near.org', privateKey: env.NEAR_PRIVATE_KEY };
}
