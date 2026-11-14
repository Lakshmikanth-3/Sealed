# Live-only build status ? 13 November 2026

## Implemented

- Removed local-ledger backend, demo launchers, synthetic-success routes, legacy v1 contract source and obsolete browser demo scenarios.
- Worker-wallet v2 signing with persistent redirect state, explicit reconciliation and finalized contract-receipt verification. No relayer signing key is used by the direct worker flow.
- V2 selective evidence publication with service access tokens, explicit disclosure consent, bounded lifetime, persistent SQLite storage, per-share deletion capabilities and storage/request limits.
- Separate NEAR AI private draft integration: explicit consent, funded service access, bounded requests, E2EE, gateway/model quote checks, UpToDate TCB policy, approved configuration hashes and provider-TEE response signature verification. Verification errors produce no substitute output.
- Deployment/registration plan commands, read-only live-network gate, private database backup command and Docker/Render persistent-host configuration.

## Observed checks

| Check | Result |
| --- | --- |
| Node 24.22.1 tests | 156 passed |
| Portable Chromium real-only setup/reviewer checks | 2 passed |
| Rust SDK host tests | 12 passed |
| Browser wallet bundle | Built successfully |
| NEAR AI authenticated model catalogue | HTTP 200 using the existing local key |
| Default Intel collateral route | Attestation inspection failed: collateral unavailable |
| Explicit documented NEAR PCCS proxy | Gateway and model UpToDate hardware evidence verified for z-ai/glm-5.3-flash |
| Testnet deployment and worker registration | Both FINAL and successful; deployed code hash matches local WASM |
| Actual worker evidence anchor | Not yet executed |
| Paid AI inference | Not requested |
| Dependency audit | 16 low-severity upstream cryptography findings |

Development fixtures exercise hostile data and cryptographic verification only. They do not run as a product mode, establish public-chain execution or count as user adoption. The browser checks cover missing-configuration behavior; they do not establish a successful live wallet round trip.

The actual attestation inspection is in ignored validation-data/ai-attestation-inspection.json. Its measurement hashes are evidence for provenance review, not an automatically approved deployment policy. The reviewer does not independently verify the exported AI receipt; this remains an unfinished integration.

## Required next gates

1. Deployment and registration completed with explicit approval: contract/owner `kanth_s.testnet`, worker `lakshmi_kanth.testnet`, capacities 10 workers and 366 days each.
2. Actual successful wallet transaction, explorer/receipt references and physical Android round-trip testing.
3. Approved AI deployment provenance and a separately authorized funded inference request. No private work records have been sent to a model.
4. Reviewed hosting costs, actual HTTPS/persistent deployment and post-restart checks.
5. Consented worker/reviewer pilot observations, public video and reviewed submission details.

The updated app runs locally on port 8790 with setup-required status. These changes are not committed or pushed while the owner's Git-history instructions remain unresolved. No force-push, contract deployment, token spend, social post or submission was performed.


## Recovery and publication corrections ? 13 November

Pending transaction reconciliation now matches exact signed arguments rather than callback order. Verified days are atomically saved even when another transaction is unresolved; unresolved work remains blocked from resigning. Explicit hashes can recover despite a stale wallet error callback. Invalid or duplicate hashes and unrelated/nonfinal transactions cannot clear pending work.

The disclosure preview snapshots the requested link lifetime and AI opt-in; publication uses those reviewed values. The server validates lifetime and explicit boolean consent before any inference request. Publishing authorization is checked before reading the potentially large evidence body.

Scheduled share cleanup now waits briefly for competing writers and reports/retries lock failures without crashing the server. Request-time read/expiry checks continue to reject unavailable storage. The initial MyNearWallet version requested no contract key. After observed service retirement, Meteor replaces it and requests only a limited anchor-method key for the configured contract; batches use Meteor's signing interface. These paths have automated regression coverage. No new external execution or paid inference is claimed.

## Approved testnet deployment ? 13 November

The owner approved the exact two-transaction plan. Deployment and initialization transaction: `7QGcHbgghNQNVMeopydK43ukuFSjodXRZJnkhGAjKtMa`. Registration transaction: `4o2VD2AsdHHFBJf13YjrDyYgkAo1Lhkan6itM13PjDMt`. Public RPC verified FINAL success, account code hash, initialized settings and worker registration. See TESTNET-DEPLOYMENT.json. Signing used the existing CLI keychain; no key was exported or printed. This does not establish a worker evidence anchor or mobile wallet success.

## Wallet retirement correction ? 13 November

An actual connection attempt showed MyNearWallet no longer accepts new app connections. Replaced its package with the official Meteor Wallet 10.1.4 adapter, scoped login to anchor on the deployed contract, allowed the actual Meteor web origins in CSP and bumped the service-worker cache. Upstream SDK key-object console logging is dropped from the browser bundle. Patched nanoid to 5.1.16 and decode-uri-component to 0.5.1; query-string 7 requires explicit ESM default-function interop during browser bundling. npm audit reports 16 low findings and no high or critical findings after these overrides. Actual Meteor account import/connection still requires the human; no private key was read or exported.
