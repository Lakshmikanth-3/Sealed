// Independent CLI verifier. Reads a local pack and public NEAR RPC only; it does
// not fetch the application server or load relayer secrets from .env.
import fs from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { verifyPack } from '../lib/verify.js';
import { lookupNearTx, validNearAccount } from '../lib/nearRpc.js';

try {
  const { values } = parseArgs({ options: { file: { type: 'string' }, network: { type: 'string' },
    contract: { type: 'string' }, relayer: { type: 'string' }, help: { type: 'boolean' } }, allowPositionals: false });
  if (values.help) {
    console.log('node scripts/verify-pack.js --file PATH --network testnet|mainnet --contract ACCOUNT --relayer ACCOUNT');
    console.log('Use independently confirmed deployment accounts. Mock-ledger packs are not NEAR evidence.');
  } else {
    if (!values.file || !['testnet', 'mainnet'].includes(values.network) || !validNearAccount(values.contract) || !validNearAccount(values.relayer)) {
      throw new Error('Supply --file, --network, --contract and --relayer. Use --help for syntax.');
    }
    const pack = JSON.parse(await fs.readFile(values.file, 'utf8'));
    if (!Array.isArray(pack?.days) || !pack.days.length || pack.days.some((d) => d?.anchor?.network !== values.network)) {
      throw new Error('Every anchor must use the explicitly selected NEAR network; mock evidence is not accepted.');
    }
    const deployment = { contract: values.contract, relayer: values.relayer };
    const deployments = { [values.network]: deployment };
    const urls = { testnet: 'https://rpc.testnet.near.org', mainnet: 'https://rpc.mainnet.near.org' };
    const report = await verifyPack(pack, (ref) => lookupNearTx(urls[values.network], ref.txHash, ref.sender,
      { network: values.network, ...deployment, protocol: pack.version, receiptId: ref.receiptId }), { deployments });
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.ok ? 0 : 1;
  }
} catch (error) {
  console.error('Verification failed: ' + error.message);
  process.exitCode = 1;
}
