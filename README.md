# Appeal Record

A gig worker's phone keeps a private record of their work, and each day's record is fingerprinted on NEAR. If an algorithm deactivates them, a lawyer or union opens one link and checks that the records were not edited afterwards.

## Run it

```bash
npm install
npm start          # worker app http://localhost:8787 · verifier http://localhost:8787/verify
npm test           # sample log -> anchors -> evidence pack -> verifier passes, then fails on 3 kinds of tampering
```

It runs on a local **mock chain** by default. For real NEAR testnet anchors, copy `.env.example` to `.env` and set `NEAR_NETWORK=testnet`, `NEAR_ACCOUNT_ID` and `NEAR_PRIVATE_KEY` (a funded testnet account that pays for workers' anchors). Then run `npm run demo` to anchor the sample log on testnet.

**Phones need HTTPS.** Browsers only allow the crypto, camera and location APIs on `https://` or `localhost`. To use the app on a rider's phone, expose the server through an HTTPS tunnel (for example `cloudflared tunnel --url http://localhost:8787`) or deploy it.

## How it works

1. **Capture (worker app, PWA).** The worker taps the type of event (trip, pay, rating, penalty, notification, deactivation), adds an amount, the notification text and an optional screenshot, and taps *Capture now*. The time comes from that tap. Location is optional. Entries and screenshots stay in the phone's IndexedDB storage; each screenshot is stored as a SHA-256 hash in its entry.
2. **Daily anchor.** Each day's entries become a Merkle tree. Every entry has a random salt, so the published root reveals nothing. The server acts as a relayer and records `anchor({worker, day, root, count})` in a NEAR transaction, so the worker needs no crypto or gas.
3. **Build my case.** The worker picks days and entries. Each disclosed entry is sent with its Merkle proof; undisclosed entries never leave the phone. The case-builder (`server/caseAgent.js`) checks the proofs and produces a deterministic summary (earnings, rating trend, penalties, deactivation notice).
4. **Verify.** `/verify?id=…` needs no login. For each day it reads the anchor transaction **directly from a public NEAR RPC node**, checks that the root, worker and day match, checks every entry's proof and timestamp (each entry must predate its anchor), checks screenshot hashes, and recomputes the summary itself.

## What it proves, and what it does not

- ✅ Each disclosed record existed when its day was anchored and has not been changed since.
- ✅ The summary was computed only from the disclosed records.
- ❌ It does **not** prove that a record is true. A worker could type in a false entry before anchoring. "Captured live" means the timestamp was taken when the entry was saved in the app, not that the app read it from the platform.
- ❌ The summary is **not TEE-attested yet**. NEAR AI Cloud attestation is stubbed (`attestation.kind = "unattested-local"`) and the verifier says so.
- Anchors are sent by a single relayer account and are tied to a random worker ID, not to a worker-owned NEAR account or passkey (FastAuth isn't built yet).
- If no contract is deployed at `ANCHOR_CONTRACT`, the transaction fails at execution, but its arguments and block time are still permanently on-chain, and that is what the verifier reads. Deploy `contract/anchor.js` for clean, successful calls.

Evidence support, not legal advice.

## Not built yet (from the PRD)

- FastAuth / passkey worker accounts
- NEAR AI Cloud TEE attestation
- Intents support payouts
- Automatic Android notification capture (the PWA uses guided manual and screenshot capture)

## Layout

| Path | What |
|---|---|
| `lib/merkle.js` | Canonical JSON, salted Merkle tree, proofs (browser + Node) |
| `lib/summary.js` | Deterministic case summary |
| `lib/verify.js` | Evidence-pack verification |
| `lib/nearRpc.js` | Reads anchor transactions from NEAR RPC |
| `server/` | HTTP server, relayer and mock chain, case builder |
| `public/` | Worker PWA and verifier page |
| `contract/anchor.js` | Optional near-sdk-js anchor contract |
| `scripts/demo.js` | End-to-end demo and tamper tests |

## Libraries and AI use

- `near-api-js` 5.1.1 (signing relayer transactions). No other runtime dependencies; uses Web Crypto and IndexedDB.
- Most of the code was written with an AI coding assistant (Claude) and reviewed and tested by the team.
