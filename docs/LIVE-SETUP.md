# Appeal live setup

## Existing worker account

Use an existing NEAR testnet wallet account. The public account ID is visible in the wallet and commonly ends in `.testnet`. MyNearWallet no longer accepts new app connections. Appeal now uses the official Meteor Wallet adapter for web/extension testnet connections. The previously verified NEAR CLI faucet route is documented at https://docs.near.org/tools/cli . Never paste recovery phrases or keys into chat.

## Dedicated contract account

There is no deployed Appeal contract yet. Choose an existing **dedicated** testnet account that has no deployed contract; do not use an account holding an unrelated contract. Put its public ID in `ANCHOR_CONTRACT`, the selected administrator in `CONTRACT_OWNER`, and the actual storage limits in `CONTRACT_MAX_WORKERS` and `CONTRACT_MAX_DAYS_PER_WORKER`. Keep its signing key only in local `CONTRACT_PRIVATE_KEY`.

Run `npm run contract:build`, then `npm run contract:deploy`. The latter prints a plan with the real artifact hash and selected accounts and **does not sign**. After inspecting and explicitly approving that exact plan, the human can run `npm run contract:deploy -- --broadcast`. This submits testnet deployment and initialization atomically and refuses to overwrite an existing contract. Ambiguous broadcast failures must be checked on-chain before retrying.

The contract owner registers the real worker using `npm run contract:register` to inspect the plan, then `npm run contract:register -- --broadcast` only after explicitly approving it. Set `WORKER_ACCOUNT_ID` and local `CONTRACT_OWNER_PRIVATE_KEY` first. It takes zero deposit but uses gas and the contract's storage balance. `npm run test:live` checks registration and an actual worker transaction. Keep sponsor relaying disabled when using direct wallet approvals.

## NEAR AI account and trust policy

1. Sign in at https://cloud.near.ai . Create an API key named Appeal under **API Keys** and fund the **Credits** balance as desired. Set the actual key in local `NEARAI_API_KEY`.
2. Select a supported NEAR-hosted TEE model from https://docs.near.ai/cloud/models and put its exact identifier in `NEARAI_MODEL`. There is no assumed model alias.
3. `npm run ai:inspect -- MODEL_ID` performs read-only cryptographic attestation inspection without inference. It saves actual public evidence in ignored `validation-data/ai-attestation-inspection.json`. Review the gateway and model deployment evidence using https://docs.near.ai/cloud/verification/verification-center . Independently compare their measured deployment configuration with the approved NEAR AI release. Set the SHA-256 of the exact approved `appCompose` UTF-8 bytes in `NEARAI_GATEWAY_COMPOSE_SHA256` and `NEARAI_MODEL_COMPOSE_SHA256`. Do not blindly trust a hash supplied by an unverified response.
4. Create a strong private `AI_ACCESS_TOKEN` for invited users. Put it in the UI only when requesting an AI draft. The SDK requires Node 24.22.1+.
5. AI generation has explicit per-request consent, a bounded input/output, one concurrent request per server process and no automatic completion retry. Only successful provider-TEE verification permits returning a draft. This concurrency limit is not a monetary budget; monitor provider credits and restrict the access token.

The draft's exported verification receipt is server-verified metadata. Independent verification of the encrypted exchange and the displayed plaintext is not implemented in the reviewer. No attested badge is awarded to it.

## Publishing and host

Create a strong `PUBLISH_ACCESS_TOKEN`; invited workers enter it before publishing. This is service access control, separate from the worker's on-chain signature. A deletion token is generated separately for each share and retained in this device's IndexedDB. If that browser storage is lost, deletion access is lost; the share still expires automatically.

`render.yaml` prepares a Docker web service with a persistent disk. The user creates/connects a Render account at https://dashboard.render.com and reviews any hosting charges before creation. Configure the exact HTTPS origin as `PUBLIC_ORIGIN`, the actual contract, tokens and optional AI secrets. Keep one service instance unless shared rate/AI policy controls are added; the current rate and AI concurrency limits are per process. The database is not an encrypted-at-rest vault: configure provider disk protection and private backups.

Physical Android, restart, HTTPS, wallet redirect, share expiry/deletion and actual network execution must be observed after deployment. Configuration files alone do not establish those results.

The direct Intel collateral endpoint was unavailable during inspection. An explicit inspection using NEAR's documented PCCS proxy (`https://cloud.near.ai/api/proxy/pccs`) successfully verified UpToDate gateway and model evidence for `z-ai/glm-5.3-flash`. No completion was requested. Review the actual deployment provenance before approving its measured configuration; do not treat hardware attestation alone as code/model provenance.

Meteor login is scoped to the configured contract and the anchor method. The SDK generates and stores a limited function-call key in browser storage; the worker's full-access key must stay inside the wallet. Transaction batches use the wallet signing interface. Import your existing worker account into Meteor privately, select Testnet and review the requested permission; do not create a replacement account or paste a key into Appeal/chat.
