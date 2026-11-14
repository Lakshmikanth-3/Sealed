# README Audit

Audit of the claims in the original `README.md` (the 23,783 bytes before the technical appendix), checked against the source code, the deployed contracts and test runs on 15 November 2026. **The original README was not edited.** Issues are listed here so they can be fixed deliberately.

Statuses: **Verified** (checked in code or on chain) · **Verified earlier** (live run on 14 November 2026, not repeated) · **Needs evidence** · **Inconsistent**.

## 1. Inconsistencies

| # | Where in the original README | Claim | What was found | Suggested fix |
|---|---|---|---|---|
| 1 | Plans table (`Premium (10 testnet NEAR / month)`) | Premium costs 10 NEAR a month | The deployed plans contract returns 1 NEAR (`/api/plan` → `pricePerMonthYocto` = 10^24 on 15 Nov 2026). `docs/SEALED-DEPLOYMENT.json` also records `pricePerMonthNear: "1"`. Evidence row 12 ("exactly 1 NEAR attached") is correct for when it happened. | Run `npm run plans:upgrade -- --broadcast` then `npm run plans:price -- 10 --broadcast`, or change the table to 1 NEAR |
| 2 | Tests table, Plans contract row | **7 passed** | `npm run plans:test` now runs **8** tests, all passing. The header row correctly says 18 contract tests (10 + 8). | Change 7 to 8 |
| 3 | Tests table, Plans contract row and header | Plans tests describe the deployed contract | The 8th test (`owner_or_contract_account_sets_price`) covers a change that is **not deployed**: the on-chain code hash of `plans.sealops.kanth_s.testnet` is `Bkx6EZ9X…`, the local build is `6YRJLitx…`. | Note that it applies after `plans:upgrade` |
| 4 | Tests table, Live demo row | **21 / 21 passed**, 5:21 video | Later recordings ran 22/22 (8:11 and 8:41 videos) and, most recently, 21/21 for an 8:16 cut video with a different scene set. The number depends on the script version. | Quote the latest run with its date, or drop the duration |
| 5 | AI assistance and licence | Built "on 14 November 2026" | Git history has 4 commits on 12 Nov, 78 on 14 Nov and further commits on 15 Nov 2026. The README also says earlier commits belong to an abandoned idea, which matches. | Say "12 to 15 November 2026" |
| 6 | Status | "all unit, contract, browser and live testnet suites pass" | True for the runs listed, but the live suites were last run on 14 Nov 2026 and are not run on every change. | Add the date of the last live run |

## 2. Claims verified in code or on chain

| Claim (original README) | Status | Evidence |
|---|---|---|
| AES-256-GCM, 1 MB chunks bound to their position | Verified | `lib/sealcrypto.js` `encryptFile` (AAD `SP1:index:count`), `CHUNK_BYTES` |
| Server and Blob only hold ciphertext; SHA-256 goes on-chain | Verified | `server/index.js` checks the uploaded bytes against `fileHash` and passes it to `create_seal` |
| Shamir split K-of-N using `shamir-secret-sharing` | Verified | `splitKey`, `combineKey`; dependency 0.0.4 in `package.json` |
| Pieces wrapped with a per-file key held by the service, bound to the account | Verified | `wrapPart` / `unwrapPart` (AAD `holder:<account>`); wrap key escrowed (`escrowedWrapKey`) |
| Contract stores hash, time, people, commitments, K | Verified | `create_seal` in `contract/src/lib.rs` |
| Each person signs `release_part`; refused if not listed, early or wrong piece; every call logged | Verified | `release_part` statuses `not_holder`, `early`, `bad_commitment`, `already_released`; `self.log` on every call |
| Service unwraps a piece only after NEAR records the release | Verified | `server/index.js` `parts` route checks `onChain.released` and the commitment before `unwrapPart` |
| Every open is a `request_open` transaction, refused and logged before the time | Verified | `server/index.js` `open` route calls `chain.requestOpen`; contract logs `open:<status>` |
| Viewer checks the file against the on-chain hash before decrypting | Verified, with a nuance | `public/open.js` compares SHA-256 with `chain.fileHash` returned by the service's `/api/seals/:id`; the Check page (`public/verify.js`) reads `get_seal` from NEAR directly over RPC |
| 300 log entries per file; extra attempts are counted | Verified | `MAX_LOG_PER_SEAL = 300`, `dropped_logs`; contract test `log_is_capped_but_calls_still_answer` |
| Only allow-listed accounts can open, by NEP-413 plus an on-chain full-access-key check | Verified | `server/index.js` `open` route; `server/nearAuth.js` `verifyProof`; `tests/near-auth.test.js` |
| Time-only files: the service holds the key until NEAR says open (escrow, not a time-lock) | Verified | `escrowedKey` released only when `request_open` returns `open` |
| Lock contract deployed as recorded | Verified | On-chain code hash `ARLYJDkW…` equals the local `contract/build/sealed_paper.wasm` and the `wasmSha256` `8bf5371a…` in `docs/SEALED-DEPLOYMENT.json` |
| 36 unit tests | Verified | `npm test`: 36 pass |
| 10 lock-contract tests | Verified | `npm run contract:test`: 10 pass |
| 3 offline browser tests | Verified | `npm run test:browser`: 3 pass |
| 22 / 22 live access checks | Verified earlier | 14 Nov 2026 run; spends testnet NEAR |
| 17 / 17 live chat checks | Verified earlier | 14 Nov 2026 run against the hosted site |
| Live end-to-end suite | Verified earlier | 14 Nov 2026 run (about 2 minutes) |

## 3. Claims needing additional evidence

| Claim | What is missing |
|---|---|
| `shamir-secret-sharing` "audited by Cure53 and Zellic" | No link to the audit reports in the README |
| The 12 evidence transactions | Links are present; the NEAR explorer blocks automated checks (HTTP 403), so they were not re-fetched here. Both contract accounts were confirmed on chain over RPC. |
| Rough location for alerts | Depends on `GEOIP_URL` being set on the deployment; not verified on the hosted copy |
| Email / WhatsApp alert delivery | Delivery depends on external configuration; tests cover alert creation, not delivery |
| Demo video | No public URL in the README; the file is local (`demo/`, ignored by Git) |

## 4. Outdated or missing deployment information

- `docs/SEALED-DEPLOYMENT.json` has no entry for the plans-contract upgrade, because it has not been run.
- The README does not state the deployed plans-contract code hash, so an evaluator cannot tell which version is live. It is `Bkx6EZ9X5sgRhVdDzpesct5gy49Y3xLXSmewK9nH4hsA` on 15 Nov 2026.
- No public demo-video link.

## 5. Not checked

- Mainnet (the project is testnet only).
- Independent cryptographic review of the implementation.
- Load or performance behaviour.
