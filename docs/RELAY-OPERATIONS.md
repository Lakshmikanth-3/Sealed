# Invited-worker testnet relay

This milestone implements the server component. The phone still needs the NEAR Auth account/signature flow. Local tests use synthetic identities, unfunded ephemeral keys and loopback RPC responses; they do not establish live testnet success.

## Before enabling

1. Use Node 22.21 or newer. The tested runtime is 22.21.0. Its built-in SQLite API prints an experimental-feature warning; no third-party database driver is installed.
2. Create actual testnet accounts for the dedicated sponsor, the contract deployment and the initial worker using the [NEAR CLI account creation guide](https://docs.near.org/tools/cli). The observed MyNearWallet page no longer creates accounts. Install the official CLI with `npm install -g near-cli-rs@latest`, then use `near account create-account sponsor-by-faucet-service <chosen-account.testnet> autogenerate-new-keypair save-to-keychain network-config testnet create`. Replace the account with an available name. Save recovery material privately. Public account IDs may be shared; private keys and recovery phrases must stay out of chat and Git.
3. Build and review the v2 contract using [contract/README.md](../contract/README.md). Deploy and initialize it with owner-selected worker/day capacities, then have its owner register each actual worker. This relay does not create, fund or register worker accounts.
4. Copy `.env.example` to `.env` if you have not already done so. Configure the actual `NEAR_NETWORK=testnet`, `NEAR_ACCOUNT_ID`, `ANCHOR_CONTRACT` and dedicated sponsor `NEAR_PRIVATE_KEY`. Use this sponsor key exclusively with this relay database. Another application or database must not independently use the key.
5. Set `DATA_DIR` to an absolute directory on an attached persistent local disk. On a host, mount its persistent disk first, put `DATA_DIR` under that mount, use one instance and disable horizontal scaling. Network/shared SQLite filesystems and ephemeral serverless filesystems are unsupported. Set `RELAY_PERSISTENT_DISK=true` only after checking the host's disk settings. This is an owner acknowledgement: the app cannot prove the host will retain a volume. Without it, enabling the relay fails startup.
6. Choose positive integers for `RELAY_WORKER_DAILY_LIMIT`, `RELAY_GLOBAL_DAILY_LIMIT` and `RELAY_REQUESTS_PER_MINUTE`. These are operator policies, not numbers obtained from a wallet. Choose `RELAY_MIN_BALANCE_YOCTO` after measuring actual testnet costs and deciding the reserve to retain. One NEAR is 10^24 yoctoNEAR; keep this value as an integer string. No default spending values are supplied.
7. Approve each public account locally with `npm run relay:admin -- approve <actual-worker-account>`. The CLI loads the local `.env`; it needs public deployment settings and the database path, but no signing key. Approval and on-chain registration are both required. There is no public approval endpoint.
8. Set `RELAY_ENABLED=true` and run `npm start`. Check `/api/config`: `relay.enabled` and `relay.accepting` describe queue readiness, not a successful chain deployment. `anchoringAvailable` still describes the existing v1/mock phone flow and stays false on live networks. Mainnet sponsorship is refused.

No key or transaction submission is needed to run `npm test`. Keep `RELAY_ENABLED=false` while access, account ownership or budget choices are undecided. Never put actual credentials into `.env.example`.

## HTTP protocol

`POST /api/relay/anchors` accepts `Content-Type: application/json`, a maximum 16 KiB body and exactly:

```text
{ "authorization": <worker-signed v2 wire object>, "retryOf": <optional terminal job ID> }
```

The authorization object is the exact `protocol`, `network`, `delegate` and `signature` shape defined by `prepareSignedAnchor` in `server/workerAuthorization.js`. It contains a domain-separated Ed25519 NEP-366 signature, not a private key, login token or arbitrary transaction request. The allowed action is one `anchor` call to the configured contract, with zero deposit and at most 30 TGas. All worker/network/day/root/count arguments are signed. Final-state checks verify registration, the active key permission, nonce and expiry within the next 200 blocks. The sponsor must have a full-access key, deployed contract and sufficient liquid balance after storage staking.

Acceptance returns HTTP 202 with `{id,state,code,pollUrl}`. Poll `GET /api/relay/jobs/:id`. Confirmed jobs include `anchor: {network,txHash,sender,contract,receiptId,timestamp}` for a v2 evidence pack. The worker must preserve the poll URL locally before relying on the submission. Repeating the same authorization returns the same job. A newly signed nonce/key for the same commitment also returns the existing active or confirmed job.

The 192-bit opaque ID is the read capability. Anyone who knows it can see job state and its final public anchor reference. Public responses omit raw authorization, signed sponsor bytes, private keys, RPC URLs and internal errors. The app writes no request-access log. Configure any proxy/hosting access logs to redact relay URLs and request bodies. Screenshots and journal entries never enter this API or database; signed commitment metadata does.

The shared request limit applies to submissions and polling before signature verification or database access. It limits one server process and resets at process restart. Worker and global job quotas persist across restart and concurrent processes: every accepted job reserves a slot on the server's UTC date, regardless of its signed work day. Failed, cancelled and uncertain jobs retain reservations. Duplicates do not reserve again. Quotas and a gas cap do not establish a monetary fee ceiling. The balance floor is a preflight stop condition, not a guarantee the post-transaction balance stays above it.

## Recovery and operations

The database uses SQLite WAL, full synchronous writes, transactional quota claims, a deployment binding and a single renewable 30-second worker lease. A second server with the same database cannot start its relay while that lease is held. A killed process can leave the lease held until it expires. Local admin commands can run alongside the server using SQLite locking.

Jobs move through `queued → validating → prepared → submitted → confirmed`. The exact sponsor-signed transaction bytes and computed hash are committed in `prepared` before any broadcast. `submitted` is committed before sending and means **broadcast may have happened**. The transport sends stored bytes directly and never uses SDK transaction replacement or automatic nonce retry. RPC requests have deadlines.

After a timeout or restart, the runner reconciles the saved transaction hash. It may resend that identical transaction at most three total broadcast attempts; it never re-signs an uncertain job. Missing/optimistic/malformed RPC results, `UNKNOWN_TRANSACTION` and unavailable receipt history keep the job `unknown`, preserving its quota and blocking all new sponsor signing. Polling continues after the resend limit. No automatic job expiry or operator force-failure clears an ambiguous broadcast. Restore RPC access/history and let the original transaction reconcile; do not delete its database, clear its state or move the key to a fresh queue.

Confirmation requires the finalized v2 verifier to follow the worker delegate to a successful inner contract receipt, then match the signed semantic intent. Outer success alone cannot confirm the job. A proven final execution failure is terminal. Expiry is terminal only for a never-broadcast job. Other preflight rejections are failed without spending; a transient preflight failure also requires a fresh explicit retry. A retry must name the latest failed/expired/cancelled job, carry a fresh valid authorization for the same commitment and reserve another quota slot. Signature replay cannot create a paid retry.

Run `npm run relay:admin -- jobs` locally to inspect recent states and transaction hashes. Treat its job IDs as capabilities. Run `npm run relay:admin -- revoke <actual-worker-account>` to cancel queued, validating and prepared jobs. Already-submitted jobs still reconcile; revocation prevents further retransmission for that worker. A transaction already sent cannot be recalled. Shutdown stops new work and waits for the current operation before releasing the lease. Database/lease failures stop the runner; public errors remain generic.

Keep the database, WAL and shared-memory files on the same disk. Stop the service cleanly before a filesystem backup; do not copy only the main database while it is running. Restoring an old backup cannot safely authorize new spending without reconciling transactions missing from that snapshot. If the disk is lost, stop using the sponsor key until its complete transaction history has been reconciled. The `.gitignore` excludes SQLite files, but host backups and access controls remain operator responsibilities.

## Verification scope

The test suite checks approvals/revocation, tampered authorizations, expiry, persistent UTC quotas, semantic/signature deduplication, independent-process contention, lease loss, simulated write failure, small request bodies, response redaction, timeouts and uncertain outcomes. Forced process deaths during signing, after preparation, before broadcast and after broadcast recover through the same SQLite database. A synthetic remote ledger records one transaction identity; a separate loopback RPC test uses the real SDK to verify sponsor signatures, exact-byte replay and inner receipt checking.

These are local component/integration tests. Live contract deployment, actual NEAR transaction costs, hosted-disk restart behavior, NEAR Auth callbacks and physical-phone recovery still require real access and independent checks. They are not marked complete by this milestone.
