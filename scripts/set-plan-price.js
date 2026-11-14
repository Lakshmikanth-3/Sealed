// Change the Premium price on the plans contract. Only the contract owner (CONTRACT_OWNER) can.
// Usage: node --env-file=.env scripts/set-plan-price.js 10            (prints the plan)
//        node --env-file=.env scripts/set-plan-price.js 10 --broadcast  (signs with CONTRACT_OWNER_PRIVATE_KEY)
// Without the owner key in .env, it prints the NEAR CLI command to sign with your own wallet.
import { Account, JsonRpcProvider, KeyPairSigner, actions, parseNearAmount } from 'near-api-js';

const near = process.argv[2];
if (!near || !(Number(near) > 0)) throw new Error('Give the new price in NEAR per month, e.g. 10');
const { SEAL_PLANS_CONTRACT: contract, CONTRACT_OWNER: owner, CONTRACT_OWNER_PRIVATE_KEY: key, NEAR_RPC_URLS, NEAR_EXPLORER_URL } = process.env;
if (!contract || !owner || !NEAR_RPC_URLS) throw new Error('SEAL_PLANS_CONTRACT, CONTRACT_OWNER and NEAR_RPC_URLS are required');
const yocto = parseNearAmount(String(near));
const provider = new JsonRpcProvider({ url: NEAR_RPC_URLS.split(',')[0].trim() });
const current = await provider.callFunction({ contractId: contract, method: 'get_config', args: {} }).catch(() => null);
console.log(JSON.stringify({ contract, owner, currentPriceYocto: current?.price_per_month_yocto ?? 'unknown', newPriceNear: near, newPriceYocto: yocto }, null, 2));

if (!process.argv.includes('--broadcast')) { console.log('Plan only. Run with --broadcast to sign.'); process.exit(0); }
if (!key) {
  console.log(`\nCONTRACT_OWNER_PRIVATE_KEY is not in .env. Sign it yourself with NEAR CLI as ${owner}:\n`);
  console.log(`near contract call-function as-transaction ${contract} set_price json-args '{"price_per_month":"${yocto}"}' prepaid-gas '30 Tgas' attached-deposit '0 NEAR' sign-as ${owner} network-config testnet sign-with-keychain send`);
  process.exit(1);
}
const acct = new Account(owner, provider, KeyPairSigner.fromSecretKey(key));
const res = await acct.signAndSendTransaction({ receiverId: contract, waitUntil: 'FINAL', throwOnFailure: true,
  actions: [actions.functionCall('set_price', { price_per_month: yocto }, 30_000_000_000_000n, 0n)] });
console.log(`Price set to ${near} NEAR / month: ${NEAR_EXPLORER_URL}/txns/${res.transaction.hash}`);
