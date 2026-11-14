# Worker ownership protocol — v2 implementation in progress

The current phone workspace uses account-bound v2 records, direct wallet approvals, persisted redirect reconciliation and finalized receipt verification. The independent verifier accepts direct worker signatures and the separately configured NEP-366 relay. Local-ledger evidence is rejected. Passkey onboarding and actual deployment are not claimed. See LIVE-SETUP.md for live activation.


## What must be authorized

A worker signs a NEP-366 delegate containing exactly one zero-deposit `anchor` call to the configured contract. Signed arguments contain `v: 2`, the actual network, worker account, work day, root and entry count. The signed network prevents reuse on a different network where an account has the same key and nonce.

The signature binds the exact argument bytes, target, method, gas, nonce and expiry. It is not a signature on a login badge. The gas sponsor can wrap this approved action but cannot change its root or label it as another worker. The server verifies the Ed25519 signature with NEAR's domain-separated delegate encoding, then checks final account-key state, nonce, expiry and storage registration.

The relay wire format uses canonical base64 and compact `JSON.stringify` argument encoding. Duplicate JSON keys, extra fields and a leading byte-order mark are rejected before gas can be sponsored. This restriction is for new relay requests; historical receipt verification reads the actual chain arguments.

Source: [NEAR meta-transactions](https://docs.near.org/protocol/transactions/meta-tx). The executing contract identifies the worker by immediate predecessor, not outer transaction signer.

## Contract controls

`contract/src/lib.rs` is the v2 contract. It initializes with a real owner, network and explicit worker/day storage capacities. Only that owner may register workers for storage sponsorship. Registration cannot authorize an anchor as the worker. The worker account must be the predecessor for each anchor, including a gas-sponsored call.

An identical retry returns the same record. A different root for the same day requires a higher entry count; this is a count rule, not a Merkle consistency proof or a guarantee that all earlier entries were retained. Older commitments remain in transaction history. The view returns the latest record, not an archive of every revision.

The contract refuses unknown protocol versions, wrong networks, invalid calendar days, malformed roots, out-of-range counts and exhausted capacities. Capacities are resource limits chosen for deployment, not rider adoption targets. No automatic transfer or real payment is part of anchoring.

The old JavaScript contract is legacy v1 source and must not be used as the account-bound v2 deployment. Use a fresh v2 deployment account; no state migration from that prototype has been implemented.

## Sign-in and recovery

NEAR Auth is the intended passkey/social-login provider. [Official testnet resources](https://docs.auth.near.org/resources/testnet) publish development contracts and a shared public client ID; this is not a secret or an application-specific production credential. Production access needs owner setup. The published SDK currently uses older NEAR API types, so its integration must be checked against actual package behavior rather than assuming compatibility with the server's v7 SDK.

Do not generate a worker private key on the server and call that worker ownership. A real worker-owned NEAR account must exist and authorize calls. Implement login callback recovery and account recovery before claiming them. Never change the worker field of already-anchored v1 entries to manufacture an authenticated history; export the old history separately and start authenticated records under the actual account.

## Privacy and proof limits

Only commitment metadata enters the signature/on-chain flow; undisclosed entries do not. The worker account, day, count and root can be observed by the sign-in/signing provider and on-chain observers. Salts hide guessable entry content, not public metadata. Account ownership does not establish employment, real-world identity, capture time, completeness or factual truth.

## Integration gates still required

1. Completed locally: SDK host tests and optimized WASM build. See the build verification record; sandbox/public-chain execution remains untested.
2. Wire the actual NEAR Auth callback/signature flow, account initialization and storage registration.
3. Implemented locally: persistent invited-worker SQLite relay, worker/global daily job quotas, gas cap, sponsor balance floor, semantic idempotency and ambiguous-timeout reconciliation. See [relay operations](RELAY-OPERATIONS.md). Owner-selected limits and actual deployment/recovery verification are still required. Do not broadcast an arbitrary JWT sign action supplied by a client.
4. Completed with synthetic RPC fixtures: v2 evidence schema, finalized NEP-366 receipt verification, independent CLI and reviewer-page account verdict. Verify the same behavior against actual testnet execution before release.
5. Deploy using real testnet accounts, validate the supported network protocol, verify a worker-created anchor independently and test recovery/failures on a physical phone.

The authorization and optional v2 HTTP relay are validated with ephemeral synthetic keys and local fixtures, not live-chain evidence. The relay is disabled by default and fails startup without complete testnet policy and persistent-disk acknowledgement. The phone's passkey/account/signature path remains unfinished.

## Independent v2 verification

V2 evidence uses a single network, a worker account ID and explicit transaction/contract-receipt references. The trusted contract and relayer come from verifier configuration, never from the evidence pack. The verifier checks the signed delegate's worker and network, then follows the transaction's receipt graph through that worker to the configured contract. A successful outer delegation does not establish that the inner contract call succeeded. The matching inner receipt must succeed and return the expected v2 record.

The commitment-time bound comes from the contract execution block. An identical retry can return an older stored record without a new log; the verifier uses the retry's execution time as a conservative bound, not the stored earlier timestamp as independent proof. It does not require the signing key to remain active today: finalized historical execution establishes the authorization at execution time.

`workerAuthorizationVerified` is true only for a valid v2 pack whose anchor, membership, attachment and summary checks all pass. It stays false for v1, mock evidence and failed checks. This is RPC-based chain verification, not a light-client proof. TEE attestation is separate and remains unverified.

Read-only server/CLI verification needs no private signing key. Private RPC endpoints are not returned by the public configuration API. Source references used for receipt semantics: [NEAR meta-transactions](https://docs.near.org/protocol/transactions/meta-tx) and [nearcore delegate execution](https://github.com/near/nearcore/blob/master/runtime/runtime/src/actions.rs).
