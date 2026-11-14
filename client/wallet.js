import { setupWalletSelector, actionCreators } from '@near-wallet-selector/core';
import { setupMeteorWallet } from '@near-wallet-selector/meteor-wallet';
let selector;
let selectedNetwork;
export async function walletSession(network) {
  if (!['testnet', 'mainnet'].includes(network)) throw new Error('Unsupported wallet network');
  if (selectedNetwork && selectedNetwork !== network) throw new Error('Network changed. Reload before connecting a wallet.');
  selectedNetwork = network;
  selector ||= await setupWalletSelector({ network, modules: [setupMeteorWallet()] });
  return selector;
}
export async function connectedAccount(network) {
  const session = await walletSession(network);
  return session.store.getState().accounts.find((account) => account.active)?.accountId || null;
}
export async function connectWallet(network, contractId) {
  const session = await walletSession(network);
  const wallet = await session.wallet('meteor-wallet');
  if (!contractId) throw new Error('The deployed contract is required for Meteor connection');
  // Meteor creates a limited function-call key. Request only Appeal's anchor
  // method; transaction batches still go through Meteor's signing interface.
  await wallet.signIn({ contractId, methodNames: ['anchor'] });
  return connectedAccount(network);
}
export async function signAnchors(network, contract, worker, anchors) {
  const session = await walletSession(network);
  const wallet = await session.wallet();
  if (await connectedAccount(network) !== worker) throw new Error('Connect the wallet that owns this journal');
  return wallet.signAndSendTransactions({ callbackUrl: location.origin + '/app',
    transactions: anchors.map((args) => ({ signerId: worker, receiverId: contract,
      actions: [actionCreators.functionCall('anchor', args, 30000000000000n, 0n)] })),
  });
}
