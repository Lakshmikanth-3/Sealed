# Sealed: Advocate vs Critic vs Judge, and How AI Screeners Filter

Three independent reviews were run on 15 November 2026 against the repository and the live site (read-only; no transactions). This file records what they found and what the project does about it.

## 1. The debate in brief

| | Advocate | Critic | Judge's finding |
|---|---|---|---|
| Overall score | 8.6 / 10 | 6.2 / 10 | Passes first round likely; grand prize unlikely without the P0/P1 work below |
| Cryptography and contract | Browser AES-256-GCM with chunk binding; Shamir K-of-N with on-chain SHA-256 commitments; block-time checks; refusals logged, not reverted | Familiar pattern; prior art (drand/tlock, Lit Protocol) | **Advocate right.** Verified in `lib/sealcrypto.js` and `contract/src/lib.rs` |
| Trust model | Contract enforces time and holders | The release service escrows keys and receives released parts: a logged custodian | **Critic right.** `server/index.js` lines 3–4, 278–279 |
| AI track | Not argued | No AI in a "Private AI" track | **Critic right.** Fixed: the track claim is now Privacy (main), no AI |
| Real-World Money | Plans contract with a real payment | Testnet only; limits enforced by the server | **Critic mostly right.** Stated plainly in the README |
| Product and demo | Full product, narrated demo, 3D explainer | Scope sprawl, long README | Real work that impresses; lead with one core flow |
| History | Not argued | Started as "Appeal" on 12 Nov; last-hour commits were branding and docs | Facts accurate; all commits are before the deadline (UTC). Now disclosed in the README |

Judge's estimates: first-round pass about 80%, placing in one track 35–45%, grand prize 8–12%. The main gap is operator trust.

## 2. Current status (verified live)

- `GET /api/chain`: contract live, owner `kanth_s.testnet`, operator `sealops.kanth_s.testnet`, seal count above 85, log cap 300.
- `GET /api/plan`: plans contract `plans.sealops.kanth_s.testnet`, 10 NEAR a month; Free 5 locks/day, 10 MB, 3 people; Premium 100 MB, 20 people.
- `npm test`: 36 / 36 pass. `npm run contract:test`: 10 pass. `npm run plans:test`: 8 pass.

## 3. How AI screeners (Codex, Claude) filter a repository

These are the signals that consistently decide whether an AI first-round reviewer advances a project, and where Sealed stands.

| Signal the screener checks | Rewarded | Penalised | Sealed now | Fix |
|---|---|---|---|---|
| First screen of the README | Problem, live link, demo, how to verify, in one screen | Marketing, walls of text | **Pass**: Evaluator Notes at the top | Keep it short |
| Claims match code | Every claim traceable to a file | Features that exist only in the README | **Pass**: file references and traceability table | Keep claims exact |
| Tests actually run | `npm test` passes cleanly | Missing or failing tests | **Pass**: 36 + 10 + 8 | Add CI with both JS and Rust |
| Track fit | Claimed tracks visibly implemented | A track with no matching code | **Fixed**: dropped "Private AI" | Only re-add with a real feature |
| Honesty about limits | Trust assumptions stated up front | Overclaiming ("trustless") | **Pass**: operator trust stated in Evaluator Notes | Remove the trust with the roadmap |
| Real on-chain usage | Deployed contracts, real transactions | Mock chain, local-only | **Pass**: two contracts, linked transactions | — |
| Contract quality | Checks, tests, no panics on expected paths | Unchecked inputs | **Pass**, one gap: log spam | Storage deposit or holder-only logging |
| Focus | One clear core idea | Many unrelated features | **Partial** | Lead with lock and merge; mark chat, exam tools and plans as extras |
| Signs of padding | Organic history | Empty commits, docs about docs, generated filler | **Partial risk**: several report files | Merge redundant docs over time |
| Demo | Short video or live link | None | **Pass**: live site and narrated MP4 | Publish a shorter (2–3 min) cut |

**Disqualifying patterns (never do these):** hidden instructions aimed at AI graders, claiming tracks or features that do not exist, padded or backdated commits, and transaction links that cannot be verified. Screeners and human judges both look for them.

## 4. What is missing to win (prioritised)

| Priority | Change | Why it moves the score | Effort |
|---|---|---|---|
| P0 | Holders combine key parts in their own browsers, so the service never sees parts | Removes the strongest objection in split mode | 1–2 days |
| P0 | Keep the track claim honest (done) and lead the README with Evaluator Notes (done) | Cheapest points to lose or keep | Done |
| P1 | Time-only mode with tlock / drand: the file key is encrypted to a future drand round; NEAR keeps the record | Makes time-only mode trustless; turns prior art into a building block | 2–3 days |
| P1 | Threshold or multi-operator release (several operators with a quorum, or NEAR chain signatures) | Removes the single hot operator key | 3–5 days |
| P1 | Stop log spam: storage deposit per log entry, or log only refusals from holders | Keeps the audit trail useful under attack | 0.5 day |
| P1 | Enforce plan limits in the contract at `create_seal` | The server is no longer the only gate | 1 day |
| P2 | Small mainnet deployment with a real payment | Real-World Money becomes literal | 0.5 day |
| P2 | Rate limits per NEAR account (NEP-413) instead of per IP; indexer events instead of polling | Robustness | 1–2 days |
| P2 | CI badge running JS and Rust tests | Instant credibility for screeners | 2 hours |
| Optional | A real private-AI feature (for example confidential inference that summarises a document only after it unlocks) | Needed only if the Private AI track is claimed again | 1+ day |
