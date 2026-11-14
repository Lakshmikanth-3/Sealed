# Sealed Paper: project status report

_Status as of 14 November 2026 (hackathon deadline: 14 Nov 23:59 UTC / 15 Nov 05:29 IST)._

## 1. Summary

Sealed Paper locks any file (exam paper, tender, results, will, video) so that nobody can open it before a chosen second. A NEAR testnet contract refuses every early attempt and logs it publicly. The owner gets an alert with the time, device and approximate location. In split mode, K of N key holders must release their parts after the unlock time. Exam mode traces a leaked copy back to its exam centre.

| Item | Status |
|---|---|
| Core loop (seal → refuse early → release → open → detect tampering) | ✅ Working on NEAR testnet, tested end to end |
| NEAR account access (own-account holders, viewer allow-list) | ✅ Working, live-tested with signing in code; Meteor Wallet popup not yet tried by hand |
| Alerts | ✅ Working; email and WhatsApp only print to the console until provider keys are added |
| Sharing (link, WhatsApp, email + .ics, Web Share, QR, .sealed file) | ✅ Working |
| Visual shares | ✅ Working (demonstration only) |
| Exam mode (Setter, Auditor, Investigator) | ✅ Working, rule-based (no AI) |
| Hosting | ❌ Runs locally only |
| Demo video, X post, submission form | ❌ Not done (need the owner) |

## 2. On-chain deployment (NEAR testnet)

| Item | Value |
|---|---|
| Contract | [`sealed.kanth_s.testnet`](https://testnet.nearblocks.io/address/sealed.kanth_s.testnet) |
| Deploy transaction | [`Dhev12vVQfyvRNyovugpNHJ3YwLQGPFPAPedrV3AMNmC`](https://testnet.nearblocks.io/txns/Dhev12vVQfyvRNyovugpNHJ3YwLQGPFPAPedrV3AMNmC) |
| Code upgrade (holder check before time check) | [`8YRc1AFZD273JpJGWs4h8uNHfUSwoF2XBq8Ai99JqJXv`](https://testnet.nearblocks.io/txns/8YRc1AFZD273JpJGWs4h8uNHfUSwoF2XBq8Ai99JqJXv) |
| Contract owner | `kanth_s.testnet` |
| Release-service operator | [`sealops.kanth_s.testnet`](https://testnet.nearblocks.io/address/sealops.kanth_s.testnet) (funded with 3 testnet NEAR; pays for seals, logs and holder funding) |
| Seals on-chain | 22, all from testing |
| Record | [docs/SEALED-DEPLOYMENT.json](SEALED-DEPLOYMENT.json) |

Private keys for the contract and operator were generated locally into `.env` (git-ignored). They have never been printed or committed.

### Contract methods

| Method | Caller | Behaviour |
|---|---|---|
| `new(owner, operators)` | contract (init) | Sets owner and operators |
| `add_operator` / `remove_operator` | owner | Manage operators |
| `create_seal(...)` | operator | `single` (time only) or `split` (N holders, K needed, one SHA-256 commitment per part); validates N 2–20, 1 ≤ K ≤ N, unique holders, future unlock time |
| `release_part(seal_id, commitment)` | holder | Returns `released` / `early` / `not_holder` / `already_released` / `bad_commitment` / `single_mode`; every call logged |
| `request_open(seal_id)` | anyone (operator on behalf of viewers) | Returns `early` / `awaiting_parts` / `open`; every call logged |
| `record_alert(seal_id, hash, kind)` | operator | Logs the hash of an off-chain alert or exam report |
| `get_seal`, `get_log`, `is_unlocked`, `get_config` | view | Read state |

Refusals return a status instead of panicking, so they stay in the permanent log. Logs are capped at 300 entries per seal; extra calls are counted.

## 3. Architecture

```
Browser                         Node server (release service)          NEAR testnet
──────────────────────────      ──────────────────────────────         ────────────────────
Encrypt file (AES-256-GCM) ──►  Store ciphertext only (data/seals)
Split key (Shamir K-of-N)       Escrow: single-mode key / part wrap key
Wrap each part per holder       (encrypted at rest)
                                Fund app-created holder accounts ────► transfers
                                create_seal ─────────────────────────► stores hashes, holders, time
Holder page: release_part (own key or Meteor Wallet) ────────────────► refuses early / non-holders
Holder posts wrapped part ───►  checks release on NEAR, then unwraps
Viewer: open ────────────────►  allow-list proof (NEP-413) → request_open ► refuses early, logs
                                returns K parts or escrowed key (only if "open")
Viewer: hash check vs NEAR, rebuild key, decrypt
                                Alerts: record off-chain, hash ───────► record_alert
```

| Layer | Files |
|---|---|
| Contract (Rust, near-sdk 5.30) | `contract/src/lib.rs` |
| Crypto (browser + Node) | `lib/sealcrypto.js` |
| Exam engine | `lib/exam.js` |
| Server | `server/index.js` (routes), `sealChain.js` (NEAR client), `sealStore.js` (files, escrow), `alerts.js` (alerts, geo, notifications), `nearAuth.js` (account lookup, NEP-413) |
| Browser bundles | `client/sealed.js` → `public/assets/sealed.js` (crypto, Shamir, holder signing, QR); `client/wallet.js` → `public/assets/wallet.js` (Meteor Wallet, loaded on demand) |
| Pages | `public/landing.html`, `index.html` (app), `open.html`, `holder.html`, `verify.html` + matching `.js`, shared `common.js`, `exam-ui.js`, `style.css` |

Size: about 2,200 lines of application code across 58 tracked files and 33 commits.

## 4. Features in detail

### 4.1 Sealing
- Any file up to 100 MB. It is encrypted in the browser in 1 MB AES-256-GCM chunks, each bound to its position, so reordering, dropping or truncating chunks is detected.
- **Single lock:** the key is escrowed by the server and released only after the contract says `open`.
- **Split lock:** the key is split into N Shamir parts with K needed, using the audited `shamir-secret-sharing` library. Presets are 2 of 2, 2 of 3, 3 of 5 and 5 of 7, or any custom N and K.
- **Wrapped parts:** each part is encrypted with a per-seal key held only by the server and bound to the holder's account. Holders cannot pool their parts offline before the time.
- Unlock time can be entered in the device's time zone, IST or UTC, with quick buttons (+2 min, +10 min, +1 hour, +1 day).

### 4.2 Key holders
- **App-created account** (default): the app creates a testnet account and funds it with 0.05 NEAR. Its key travels inside the holder's private link.
- **Own NEAR account:** type `kanth.testnet`. It is looked up live (✓ balance and full-access keys, or ✕ does not exist). The holder signs in Meteor Wallet, and the link alone can't release anything.
- Holder links are shown once after sealing and never stored.

### 4.3 Who can open (allow-list)
- Optional list of up to 50 NEAR accounts, each checked live.
- The viewer connects Meteor Wallet and signs a one-time challenge (NEP-413). It is single use, bound to the seal, expires in 5 minutes, and costs nothing.
- The server verifies the signature and that the key is a full-access key of that account on-chain.
- Unlisted accounts get "Not allowed" plus a `not_allowed` alert.
- Enforced by the release service, not the contract.

### 4.4 Opening
- Live countdown synced to server time.
- Before the unlock time: "Refused: still locked", logged on-chain, and an alert is raised.
- After the unlock time (and K releases): the downloaded file is checked against the on-chain hash. A mismatch shows **FILE TAMPERED**. Otherwise the key is rebuilt and the file decrypted in the browser.
- Previews: PDF (inline viewer), image (animated visual-share reveal), video, audio and text. A download button is always shown.
- Single-lock seals open automatically when the time arrives.
- A downloaded `.sealed` file can replace the server copy; it is still checked against NEAR.

### 4.5 Alerts
| Trigger | Kind |
|---|---|
| Open before unlock | `early_open` |
| Holder release before unlock | `early_release` |
| Release by a non-holder | `not_holder` |
| Unlisted account tries to open | `not_allowed` |
| Wrong key (AES-GCM authentication failure) | `wrong_key` |
| File hash differs from NEAR | `file_tampered` |
| 5 failures from one source within 2 minutes | `repeated_failures` (escalation) |

Each alert contains:
- the event and the time in IST and UTC
- the NEAR account, if any
- browser and operating system
- approximate location from the IP address (ipapi.co; private addresses are skipped; a mock is used in tests)
- GPS only when the visitor ticks the consent box

The full record stays off-chain and its SHA-256 goes on-chain. Notifications go by email (Resend) and WhatsApp/SMS (Twilio), with a console fallback when keys are missing. Every alert also appears in the in-app feed.

### 4.6 Sharing
Copy link, WhatsApp (pre-filled), email (pre-filled) plus a downloadable `.ics` calendar invite with a 5-minute reminder, the phone's share sheet (Web Share), an on-screen and printable QR code (generated locally), and a downloadable `.sealed` file.

### 4.7 Visual shares
An image is split into 2–7 shares that each look like random noise; combining all of them reveals the image, with an animation. This demonstrates the idea; it is not what protects the key.

### 4.8 Exam mode (rule-based, in the browser)
- **Setter:** one distinct version per centre (2–50 centres). Question order, option order and wording differ (e.g. "What is" ↔ "Find"); questions, options and answers are identical. It is deterministic, and each version can be downloaded or loaded straight into the Seal form.
- **Auditor:** checks the same questions, options and correct answers, and wording length within 10%.
- **Investigator:** paste a leak (partial or retyped) and get "Centre N, NN% confidence" plus a ranking. The report can be downloaded, and its hash recorded on NEAR (owner only).
- **Measured on simulated leaks** (30–90% of the paper, lowercase, without brackets): 100 of 100 traced correctly with 3, 8 and 20 centres, with median confidence 94%, 86% and 80%. Heavy paraphrasing or photographed pages would be harder, and there is no OCR.

## 5. UI layout

All pages share one theme:
- near-black background (`#0a0a0a`), dark panels (`#141414`) and 1 px borders (`#2a2a2a`)
- **orange accent `#ff6b1a`**, monospace type throughout, uppercase headings with wide letter spacing
- green for success, amber for warnings, red for refusals and tampering
- no external fonts or CDNs; the Content Security Policy blocks third-party scripts

### 5.1 Landing page `/`
```
┌──────────────────────────────────────────────────────────────────────┐
│ SEALED PAPER  time-locked files on NEAR    HOW · WHY · LIVE · VERIFY [SEAL A FILE] │
├──────────────────────────────────────┬───────────────────────────────┤
│ ● Live on NEAR testnet               │ CONTRACT FEED          [LIVE] │
│ NOBODY OPENS IT EARLY.               │        (radar sweep)          │
│ NOT EVEN THE KEY HOLDERS. (orange)   │ > read-only · no keys         │
│ lede paragraph                       │ > sealed… · 22 seal(s)        │
│ [SEAL A FILE →] [VERIFY A SEAL]      │                               │
├──────────┬──────────┬──────────┬─────┴──────────┐                    │
│ SEALS    │ KEY PARTS│ CONTRACT │ ENCRYPTION     │  live stat cards   │
│ 22       │ 2 – 20   │ sealed…  │ AES-256        │                    │
├──────────┴──────────┴──────────┴────────────────┤                    │
│ // HOW IT WORKS: 01 Encrypt · 02 Split · 03 Lock · 04 Release      │
│ // LEAKS THAT REALLY HAPPENED: NEET 2026, UGC-NET 2024, UK Budget, Dobbs (with sources) │
│ // WHAT NEAR ENFORCES (✓ list)   │ // HONEST LIMITS (✕ list)        │
│ // DEPLOYMENT EVIDENCE: contract, deploy tx, operator links        │
└──────────────────────────────────────────────────────────────────────┘
```

### 5.2 App `/app`: left sidebar and five views
```
┌───────────────┬──────────────────────────────────────────────────────┐
│ SEALED PAPER  │ SEALED PAPER / COMMAND CENTER   LAST SYNC: … [NEAR TESTNET · LIVE] │
│               ├──────────────────────────────────────────────────────┤
│ [00 COMMAND   │  (current view)                                       │
│     CENTER]   │                                                       │
│  01 SEAL A FILE                                                       │
│  02 MY SEALS  │                                                       │
│  03 VISUAL    │                                                       │
│  04 EXAM MODE │                                                       │
│               │                                                       │
│ ┌───────────┐ │                                                       │
│ │● CHAIN:   │ │                                                       │
│ │  ONLINE   │ │                                                       │
│ │CONTRACT … │ │                                                       │
│ │SEALS 22   │ │                                                       │
│ │OPERATOR … │ │                                                       │
│ │Verify →   │ │                                                       │
│ └───────────┘ │                                                       │
└───────────────┴──────────────────────────────────────────────────────┘
```
- **Sidebar:** brand, numbered navigation (the active tab is filled orange), and a live chain status box refreshed every 10 seconds.
- **Header:** breadcrumb (`SEALED PAPER / <VIEW>`), last sync time in UTC and a network badge. It stays fixed while scrolling.

**00 Command center** (3-column grid of panels):
| Panel | Content |
|---|---|
| Seal allocation | Seals / Locked / Unlocked counts, then the last 5 seals with status dots |
| Alert log | Newest alerts across your seals (time in IST, kind, seal) |
| Next unlock | Radar animation and a large countdown to the next unlocking seal |
| How a seal opens (2 columns wide) | Four steps: Encrypt, Split, Lock, Release |
| Protection | Counts of refused attempts (early opens, early releases, non-holders) and integrity events (wrong keys, tampered files, escalations) |

**01 Seal a file** (single card form with numbered sections):
1. **File:** picker, file info, display name.
2. **Lock mode:** two selectable tiles (Split lock or Single lock). For split: preset buttons, N and K inputs, an explanation line, and one row per holder (name, email, WhatsApp, own NEAR account), each with a live lookup line in green or red.
3. **Who can open:** comma-separated NEAR accounts with live lookups.
4. **Unlock time:** date and time, time zone, and +2 min / +10 min / +1 hour / +1 day buttons, with a preview line in IST, UTC and countdown.
5. **Alerts:** owner email and WhatsApp.

The footer has **SEAL AND LOCK ON NEAR** and a status line. After sealing, the form is replaced by a result card: summary with a link to the NEAR transaction, a row of share buttons and a QR code, and the "send each holder their private link now" list (Copy, WhatsApp, Email or Open per holder, shown once).

**02 My seals:** one card per seal with:
- name and Locked/Unlockable badge, plus a live countdown (`LOCKED · 00:01:42`)
- mode, file, size and unlock time
- release progress (one square per part, orange when released)
- share buttons and QR code, plus Open page / Verify / Create tx
- collapsible **Alerts** (time, kind, device, location, link to the on-chain hash) and **On-chain access log**

**03 Visual shares:** image picker, number of shares, Split and Combine buttons. The shares are shown as a grid of noise images; Combine slides them together and reveals the image.

**04 Exam mode:** three cards:
1. **Setter:** question text area (with a "Load sample paper" button), exam name, number of centres, then a grid of version cards (answer key, preview, Download, Seal this version).
2. **Auditor:** pass/fail verdict and one line per centre.
3. **Investigator:** leak text area, **Trace the leak** and **Simulate a leak**. The result shows a large "Centre N, NN% confidence", the ranking, Download report, and Record on NEAR (choose one of your seals).

### 5.3 Share / open page `/s/<id>` (centred, single column)
```
            SPLIT LOCK · 2 OF 3 KEY HOLDERS
              EXAM PAPER · PHYSICS
   ┌──────────────────────────────────────────┐
   │              (radar sweep)               │
   │            00:01:42  (huge, orange)       │
   │  Locked until 14 Nov 2026, 11:36:44 IST · UTC │
   │        ■ ■ □  1 of 2 needed parts released   │
   └──────────────────────────────────────────┘
   ▌Notice: attempts are logged, including approximate location…
   ┌ [Restricted file: connect Meteor Wallet] (only for allow-listed seals)
   │ ☐ Share my exact location (optional)
   │ [OPEN FILE] [VERIFY ON NEAR]
   │ ▸ Have a downloaded .sealed file?
   └
   ┌ Result card: amber "REFUSED: STILL LOCKED" · red "FILE TAMPERED" / "NOT ALLOWED"
   │ · green "Verified: matches the hash on NEAR" + PDF/video/image/text preview + DOWNLOAD
   └
   ON-CHAIN ACCESS LOG (newest first: RELEASE · RELEASED, OPEN · EARLY, ALERT · …)
```

### 5.4 Holder page `/h/<id>#<private part>`
Same layout as the open page: role ("Principal · 2 of 3 needed"), seal name, countdown and progress squares. Below that:
- an explanation of the holder's role and a logging notice
- for own-account holders, a dashed **Connect Meteor Wallet** box showing which account is connected
- **RELEASE MY PART** and **OPEN PAGE**, then a result card ("Refused: too early" in amber, "Your part is released" in green, with a link to the transaction)

### 5.5 Verify page `/verify`
- seal ID or link input, plus an optional `.sealed` file and **VERIFY ON NEAR**
- a verdict bar (green "Seal verified on NEAR · unlocked · 4 refused attempts logged", or red "FILE TAMPERED")
- the seal record: contract, mode, unlock time, file hash, holders, parts released, log count
- the full access log with time in IST and UTC

All of this is read directly from NEAR RPC in the browser.

### 5.6 Mobile (under 760 px)
- The sidebar collapses. The five tabs move to a **fixed bottom tab bar**, and the chain status box is hidden.
- Every grid becomes a single column: dashboard panels, form rows, holder rows, landing sections.
- No horizontal scrolling (checked in browser tests at 390 px).
- Motion is turned off when the device asks for reduced motion.

## 6. Security and trust model

| Enforced by | Guarantee |
|---|---|
| NEAR contract | No release or open succeeds before the unlock time; only listed holders, once each, with the committed part; K parts needed; every attempt logged publicly |
| Cryptography | The server stores only ciphertext; fewer than K parts reveal nothing; wrapped parts stop holders pooling early; AES-GCM and the on-chain hash detect tampering |
| Release service | Escrowed single-mode key; wrap key; allow-list (NEP-413 plus an on-chain key check); rate limits; holder funding |

What must be trusted:
- **Split mode:** the server together with K holders could collude to open early; neither can alone.
- **Single mode:** the server holds the key until the time. This is escrow, not a cryptographic time-lock.
- **The person who seals** already has the original file.
- **After opening**, nothing stops copying.
- **IP location** is approximate.
- **App-created holder links** contain a key, so anyone with the link can act as that holder.

Other protections:
- **Request checks:** strict Content Security Policy; cross-site and foreign-origin writes refused; path-traversal checks.
- **Rate limits:** 120 API calls per minute per IP, and 20 seals per hour per IP. An optional creation token can be required.
- **Chain writes:** each has a 30-second deadline, so one slow RPC call can't stall the others.
- **Dependencies:** the high-severity issues were fixed with version overrides; a few low-severity findings remain in upstream cryptography code.

## 7. Testing

| Suite | Command | Result |
|---|---|---|
| Unit | `npm test` | **21 passed**: crypto round-trips (PDF, image, video, text); Shamir 2-of-2, 3-of-5, 5-of-7; K−1 parts fail; wrong part, tamper, reorder, truncate; wrapped parts; alerts and escalation; escrow; NEP-413 (forged key, function-call key, replay, expiry); exam mode (at least 18 of 20 leaks traced) |
| Contract | `npm run contract:test` | **10 passed** |
| Offline browser | `npm run test:browser` | **4 passed**: pages and headers, safe refusals, visual shares, exam mode |
| Live chain | `npm run test:chain` | **passed**: early refusal, non-holder refusal, 2-of-3 unlock |
| Live access | `npm run test:access` | **14 / 14 passed**: account lookup, own-account holder, allow-list (no proof, forged key, unlisted, early, allowed opens and decrypts) |
| Live browser end to end | `npm run test:e2e` | **passed** (about 2 min): split PDF and single text, early release and open refused with alerts, release after unlock, PDF identical to the original, single opens automatically, tamper detected, alerts with location and on-chain hashes, verify page |
| Exam report anchoring (manual) | API call | Report hash recorded (`alert:leak_report`); wrong owner token refused |

Not automated: the Meteor Wallet popup itself (the tests sign the same messages in code) and real email or WhatsApp delivery.

## 8. How to run

```sh
npm ci
cp .env.example .env     # fill SEAL_OPS_PRIVATE_KEY and SEAL_ESCROW_SECRET (already set on the dev machine)
npm run dev:all          # http://localhost:8787
```

**Currently running** at http://localhost:8788. Port 8787 is held by an old server from the previous project (process 33692), which should be stopped.

## 9. What is not done

| Item | Owner | Notes |
|---|---|---|
| Try the Meteor Wallet steps by hand | You | Seal with `kanth.testnet` as a holder and a viewer; release and open |
| Demo video | You | Script in [docs/SUBMISSION.md](SUBMISSION.md) |
| X post (required) | You | Text in `docs/SUBMISSION.md` |
| Submission form | You | Description (1,757 characters), tracks and fields in `docs/SUBMISSION.md` |
| Rename the GitHub repo (still "Appeal") | You | Then the links need updating |
| Hosting | You and me | Render needs a login and about $7/month for its disk; Vercel can't keep the stored files |
| Real email and WhatsApp alerts | You | Add Resend or Twilio keys to `.env` |
| AI agents and OCR in exam mode | Not built | Needs NEAR AI credits (not approved) |
| Passkey / FastAuth login | Not built | Holders use app-created accounts or Meteor Wallet |
| Mock exam pilot with real students | You | Needed before quoting any impact numbers |
| Delete local leftovers `IMPLEMENTATION-PLAN.md`, `validation-data/` | You confirm | Never committed |

## 10. Libraries

near-sdk 5.30 (Rust); near-api-js 7.2; shamir-secret-sharing 0.0.4 (audited by Cure53 and Zellic); qrcode-generator 1.4.4; @near-wallet-selector/core and meteor-wallet 10.1.4; buffer, process and util (browser shims); esbuild and Playwright (development only); WebCrypto (built in).

Code was written with AI assistance (Claude Code) under the author's direction. MIT licence.
