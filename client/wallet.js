// Meteor Wallet for people who use their own named NEAR account:
// key holders sign release_part, and viewers on an allow-list sign a NEP-413 message.
import { setupWalletSelector, actionCreators } from '@near-wallet-selector/core';
import { setupMeteorWallet } from '@near-wallet-selector/meteor-wallet';

let selector;
const session = async () => (selector ||= await setupWalletSelector({ network: 'testnet', modules: [setupMeteorWallet()] }));
export async function connectedAccount() {
  return (await session()).store.getState().accounts.find((a) => a.active)?.accountId || null;
}
/** Sign in, scoped to the Sealed contract's release_part method. */
export async function connect(contractId) {
  const wallet = await (await session()).wallet('meteor-wallet');
  await wallet.signIn({ contractId, methodNames: ['release_part'] });
  return connectedAccount();
}
export async function disconnect() { const s = await session(); if (s.store.getState().selectedWalletId) await (await s.wallet()).signOut(); }
/** Holder signs release_part with their own account. */
export async function walletRelease(contractId, sealId, commitment) {
  const wallet = await (await session()).wallet();
  const outcome = await wallet.signAndSendTransaction({ receiverId: contractId,
    actions: [actionCreators.functionCall('release_part', { seal_id: sealId, part_commitment: commitment }, 15_000_000_000_000n, 0n)] });
  const value = outcome?.status?.SuccessValue;
  return { status: value ? JSON.parse(atob(value)) : 'unknown', txHash: outcome?.transaction?.hash || outcome?.transaction_outcome?.id };
}
/** NEP-413 signed message proving control of the account; no transaction, no gas. */
export async function proveAccount({ message, nonce, recipient }) {
  const wallet = await (await session()).wallet();
  const signed = await wallet.signMessage({ message, nonce: Uint8Array.from(atob(nonce), (c) => c.charCodeAt(0)), recipient });
  return { accountId: signed.accountId, publicKey: signed.publicKey, signature: signed.signature };
}
/** Pay for Premium: subscribe(months) on the plans contract with exactly price × months attached. */
export async function walletSubscribe(plansContract, months, totalYocto) {
  const wallet = await (await session()).wallet();
  const outcome = await wallet.signAndSendTransaction({ receiverId: plansContract,
    actions: [actionCreators.functionCall('subscribe', { months }, 30_000_000_000_000n, BigInt(totalYocto))] });
  return { txHash: outcome?.transaction?.hash || outcome?.transaction_outcome?.id };
}
