# PRD: Sealed Paper v2: time-locked, 3-part sealed files on NEAR

NEAR Hackathon submission. Deadline: 14 Nov 2026, 23:59 UTC (15 Nov, 05:29 IST). About 19 hours of build time remain from 10:30 IST, 14 Nov.

Honest target score if fully built and demoed with real users: **about 72/100**. Nothing guarantees a win. A working build, real users and a demo that works on the first try decide it.

---

## 1. One-line pitch
Seal any file (PDF, image, video or text) so that **nobody, not even you, can open it before the exact date and time you choose**. Optionally split the key into **any number of parts** (2, 3, 5, 7 or more) that must be merged to unlock, and get an **instant alert with time, device and approximate location** if anyone tries to break in. Send it anywhere: a link, email, WhatsApp or SMS.

## 2. Flagship use case
**Exam papers.** NEET 2026 was cancelled after a leak. With Sealed Paper:
- the paper is encrypted and split into 3 key parts held by 3 different people or offices
- it unlocks only at 10:00:00 on exam day, and only when the 3 parts are merged
- each exam center gets its own fingerprinted copy, so a leaked copy, even a retyped one, is traced to its center

**Other uses (same engine):**
- Company results or press releases embargoed until a set time.
- Tender or bid documents opened only at the deadline.
- Wills or legal documents released on a date, with 3 trustees.
- Time-capsule messages and surprise videos.
- Product launch assets shared early with partners but locked until launch.

## 3. Problem
- Sensitive files leak before their release time (exam papers, tenders, results).
- Today's protections depend on trusting one admin or one server. Whoever holds the key can open the file early.
- QR codes and serial numbers on papers are lost when a leaker retypes or rewords the content.
- Nobody can prove afterwards who accessed what, and when.

## 3A. Real-world pain: leaks that really happened

These are real events. Each one shows a failure Sealed Paper is designed to address.

| # | Event | What went wrong | How Sealed Paper helps |
|---|---|---|---|
| 1 | **NEET-UG 2026 cancelled (India, May 2026)** | The 3 May exam, taken by about 22.79 lakh students at 5,400+ centres, was cancelled on 12 May. A "guess paper" shared on WhatsApp and Telegram before the test matched about 120 to 150 real questions. It was the first full cancellation of NEET-UG for malpractice. A CBI probe followed. | The paper stays sealed until the exam second, behind 3 key holders. Each centre's version is fingerprinted, so a leaked copy names its centre. |
| 2 | **NEET-UG 2024 leak (India)** | The paper leaked in Bihar. The Supreme Court intervened, the CBI investigated and arrests were made across several states. Leaders count at least four NEET leaks: 2016, 2021, 2024 and 2026. | The same problem keeps repeating: no single admin should be able to open the paper early, and leaks must be traceable. |
| 3 | **UGC-NET June 2024 cancelled (India)** | Over 9 lakh candidates sat the 18 June exam. It was cancelled the next day after reports said the paper was on the darknet and sold on Telegram for ₹5,000 to ₹10,000. (The CBI later filed a closure report saying it found no evidence of a leak; the exam had already been cancelled.) | A public, tamper-proof access log shows who could open the paper and when. That settles "was it really leaked?" questions quickly instead of after months. |
| 4 | **UK Budget report published early (Nov 2025)** | The OBR's Budget analysis became reachable about 40 minutes before the Chancellor's speech, simply by changing "March" to "November" in a web address. It moved bond and currency markets. The NCSC later found it was accessed over 24,000 times before the speech, and that the March 2025 report had also been accessed early. | Embargoed reports stay encrypted until the release second, so guessing a URL is useless. Contract-enforced time replaces a fragile web publishing process. |
| 5 | **US Supreme Court Dobbs draft leak (2022)** | A draft opinion was leaked to Politico before the ruling. Investigators interviewed nearly 100 staff and still could not identify the leaker. | Fingerprinted copies per recipient plus an access log would narrow a leak to one copy holder. |
| 6 | **Pentagon documents on Discord (2023)** | An airman with access posted hundreds of classified documents on Discord. The leak spread for months before the source was found. He was later sentenced. | Per-recipient fingerprinting and a permanent access log speed up tracing a leaked copy back to its source. |
| 7 | **Samsung source code pasted into ChatGPT (2023)** | Engineers pasted confidential source code and meeting notes into ChatGPT, and Samsung then banned generative AI tools at work. | Partial fit: shows that sensitive company files leave through normal tools. Sealed Paper keeps critical files encrypted and logs every opening. It does not stop someone pasting text they can already read. |

**The pattern:** exam boards, governments, courts and companies all rely on trusting whoever holds the file. When a leak happens, they cannot tell who leaked or when. Sealed Paper answers both: **nobody opens early, and every copy is traceable.**

**Sources**
- NEET 2026: [The Quint](https://www.thequint.com/news/breaking-news/neet-ug-2026-cancelled-paper-leak-cbi-probe), [The Week](https://www.theweek.in/news/india/2026/05/12/neet-ug-2026-exam-cancelled-after-paper-leak-row-nta-to-announce-fresh-date-soon.amp.html), [The South First](https://thesouthfirst.com/health/neet-ug-2026-cancelled-after-paper-leak-row-cbi-probe-ordered-re-test-date-awaited/), [Kerala Kaumudi](https://keralakaumudi.com/en/news/india/general/-1746339-amp)
- NEET 2024: [Onmanorama](https://www.onmanorama.com/news/india/2026/05/12/neet-ug-2026-exam-cancelled-nta.amp.html)
- UGC-NET 2024: [Business Today](https://www.businesstoday.in/education/story/telegram-was-epicentre-of-ugc-net-paper-leak-question-papers-sold-for-rs-5000-10000-report-434285-2024-06-21), [ThePrint](https://theprint.in/india/screenshot-of-ugc-net-paper-leaked-on-telegram-day-before-exam-cbi-begins-probe/2140420), [Deccan Herald (closure report)](https://www.deccanherald.com/amp/story/india%2Fcbi-files-closure-report-in-ugc-net-paper-leak-case-3380116)
- UK OBR: [Holyrood](https://www.holyrood.com/news/view,obr-calls-in-cyber-expert-over-leaked-budget-analysis), [Ross Martin (NCSC review)](https://rossmartin.co.uk/sme-tax-news/8818-budget-leak-bigger-than-thought-says-nscs)
- Dobbs: [ABA Journal](https://abajournal.com/web/article/who-leaked-dobbs-scotus-investigators-dont-know-despite-97-employee-interviews-and-forensic-sleuthing)
- Pentagon: [Semafor](https://www.semafor.com/article/03/04/2024/jack-teixeira-pleads-guilty-to-leaking-sensitive-pentagon-documents), [Wikipedia](https://en.wikipedia.org/wiki/2022%E2%80%932023_Pentagon_document_leaks)
- Samsung: [Fortune](https://fortune.com/2023/05/02/samsung-bans-employee-use-chatgpt-data-leak/)

## 4. Users
| User | Need |
|---|---|
| Exam controller (college, coaching center) | Paper stays sealed until exam time; leaks are traced |
| Key holders (3 officials or trustees) | Each holds one part, so no single person can open it early |
| Recipients (exam centers, partners, family) | Receive a link and open it only at release time |
| Verifier (anyone) | Checks the file was not opened or changed early |

**Hackathon pilot:** a real mock exam in your department. 3 classrooms act as 3 centers, 3 faculty members or classmates hold the 3 key parts, and 30+ students take part.

## 5. How it works

### 5.1 Seal
1. The owner uploads any file: PDF, image (JPG or PNG), video (MP4), audio or plain text.
2. The app encrypts it in the browser with **AES-256-GCM** using a random file key. The plain file never leaves the device unencrypted.
3. The owner chooses the **lock mode** (see section 5.7): **single lock** (no split, opens by time only) or **split lock** (the key is split into any number of parts, such as 2, 3, 5, 7 or more, using **Shamir Secret Sharing**, with a chosen number of parts needed to unlock).
4. The owner chooses an **unlock date and time** and the **3 key holders** (by NEAR account, email or phone).
5. A **NEAR smart contract** stores the seal record: file hash, unlock time, key-holder accounts, the hash of each part, and the access rules.
6. The encrypted file is stored off-chain (IPFS or the app's storage). Only its hash goes on-chain.

### 5.2 Hold the key parts
- Each key holder receives their part, encrypted to their own account, in their inbox in the app.
- No holder can open the file alone.
- Before the unlock time, the contract **refuses to accept part submissions**, so even all 3 holders together cannot unlock early.

### 5.3 Unlock (merge the three parts)
1. At the unlock time the contract opens the **merge window**.
2. Each holder taps "Release my part" and signs with a passkey.
3. When all 3 parts are on record (or 2 of 3 if configured), the app rebuilds the file key.
4. Authorized recipients can download and decrypt the file.
5. Every attempt, early or on time, is logged on-chain with time and account.

### 5.4 The "three split images" visual
For the demo and for visual content, an image or video frame can also be split into **3 visual shares** (visual cryptography). Each share looks like random noise, and only when all 3 are overlaid does the picture appear. This makes the cryptographic idea visible on screen.

### 5.5 Fingerprinted copies (exam mode)
- The **Setter agent** (AI on NEAR AI Cloud) creates one version per center. The versions keep the same meaning and difficulty but use different numbers, option order and wording.
- The **Auditor agent** checks every version is equally difficult.
- The **Investigator agent** takes a leaked copy (photo, screenshot or retyped text), runs OCR, matches it to a version, and names the center with a confidence score in an attested report.

### 5.6 Send
After sealing, the owner shares the sealed file in any of these ways:

| Channel | What is sent |
|---|---|
| **Link** | `sealedpaper.app/s/<id>` opens a countdown page. Before the time it shows "Locked until 10:00:00". |
| **Email** | An email with the link, the unlock time and an .ics calendar invite |
| **WhatsApp** | Share button with a pre-filled message and link (wa.me share URL) |
| **SMS / Telegram / any app** | The phone's native share sheet (Web Share API) |
| **QR code** | Printable QR that opens the link, useful for exam halls |
| **Document** | A downloadable `.sealed` file (encrypted file plus seal ID) that anyone can open in the app at unlock time |

A link or file shared early is useless before the unlock time, because the key does not exist until the 3 parts merge.

### 5.7 Lock modes: choose how many parts

| Mode | How it works | Unlocks when | Best for |
|---|---|---|---|
| **Single lock (no split)** | One key, held by the contract-gated release flow | **The date and time arrive.** No merge is needed: the authorized recipient opens it at the time | Personal time capsules, scheduled announcements, simple embargoes |
| **Split lock (N parts, K needed)** | The key is split into **N parts** (any number from 2 to 20, such as 2, 5 or 7), and **K of them** must be merged | **The date and time arrive AND K holders release their parts** | Exam papers, tenders, board results, wills, classified files |

**Examples of split choices**
- **2-of-2:** two officials must both agree (a simple "two-person rule").
- **3-of-5:** five trustees; any three can unlock, so one or two can be absent.
- **5-of-7:** a large committee where a strong majority is needed.
- **N-of-N:** every holder must take part (the strictest).

**Rules for every mode**
- Before the unlock time, the contract refuses every release, whatever the mode.
- In split mode, fewer than K parts reveal **nothing** about the file (a property of Shamir Secret Sharing).
- Holders, N and K are fixed at sealing time and recorded on-chain, so they cannot be changed later without a new seal.

**Visual shares:** for images, the visual-share demo uses the same N chosen by the owner (for example 3 or 5 noise images that reveal the picture only when combined).

### 5.8 Tamper and break-in alerts

Every attempt to open, change or break a sealed file is detected, logged on NEAR, and reported to the owner straight away.

**What triggers an alert**

| Event | Detection |
|---|---|
| Someone tries to open the file **before the unlock time** | The contract refuses `release_part` or `request_open`, and the attempt is logged |
| A **wrong key or wrong part** is used | Decryption fails the AES-GCM authentication check, so the app knows a bad key was tried |
| The encrypted file is **changed or replaced** | Its hash no longer matches the hash stored on-chain |
| **Repeated failed attempts** from the same source | Rate limits plus an escalating alert ("5 failed attempts in 2 minutes") |
| A **holder who isn't on the list** tries to release a part | The contract rejects the account, and the attempt is logged |

**Who is notified, and how:** the owner and all key holders, by email, WhatsApp message (via a business messaging API), SMS, push notification and the in-app alert feed. Each alert also gets a permanent entry in the on-chain access log.

**What an alert contains**
- What was attempted (early open, wrong key, file changed).
- Date and time (IST and UTC).
- The NEAR account used, if any.
- **Approximate location** from the IP address (country, region, city), plus device and browser type.
- **Exact GPS location only if the person opening the link has agreed** to share it on the open page.

**Honest limits and legal care**
- IP-based location is approximate and can be hidden by a VPN, so treat it as a lead, not proof.
- Precise GPS needs the visitor's permission; the app must never collect it secretly.
- The open page shows a clear notice: "Attempts to open this file are logged, including approximate location." This keeps it within privacy laws such as India's DPDP Act 2023.
- Location and device data are stored off-chain; only a hash of each alert record goes on NEAR.

## 6. Why NEAR (essential, not decoration)

| NEAR feature | Role |
|---|---|
| Smart contract time | The unlock time is enforced by the contract, not by a server admin who could cheat |
| Accounts and function-call keys | Each key holder and center has an account with a key that can only call "release my part" or "fetch my copy" |
| On-chain access log | Public, permanent record of every attempt, which nobody can edit |
| NEAR AI Cloud (TEE + attestation) | The Setter, Auditor and Investigator agents run privately, and their reports are attested |
| FastAuth / passkeys | Officials and recipients sign in without crypto knowledge or seed phrases |
| Intents (mainnet only) | Optional: a center's deposit is forfeited and fees are refunded on a proven leak |

**Honest limit:** the contract controls *when* parts can be released. Strict cryptographic time-lock (unlock without any participant) would need extra tools such as drand timelock. If used, list it in the README.

## 7. Functional requirements (MVP)
1. Upload and encrypt any file type in the browser (PDF, JPG/PNG, MP4, TXT).
2. Lock modes: single lock (time only, no split) or split lock with any N parts and K needed (for example 2-of-2, 3-of-5, 5-of-7).
3. Set the unlock date and time and the key holders.
3a. Tamper and break-in alerts: early-open attempts, wrong keys, changed files and unknown accounts trigger instant alerts (email, WhatsApp, SMS, push) with time, account, device and approximate location, logged on NEAR.
4. NEAR testnet contract: create seal, refuse early release, accept parts after the unlock time, log every attempt.
5. Countdown page at the share link.
6. Release-my-part flow for each holder, and automatic decrypt when the parts are complete.
7. Share by link, email, WhatsApp, native share sheet, QR code and `.sealed` file download.
8. Visual 3-share image demo (overlay reveals the image).
9. Exam mode: Setter, Auditor and Investigator agents, with leak tracing.
10. Verify page: file hash, unlock time and access log checked against the chain.

## 8. Non-goals (for the hackathon)
- Stopping a person from photographing a file *after* it opens. The product controls early access and traces leaks; it does not prevent copying after release.
- Large video streaming. Files are capped at about 100 MB for the demo.
- Mainnet payments. Testnet only, and Intents has no testnet.

## 9. Security and privacy
- Encryption and decryption happen in the user's browser. The server only ever sees encrypted data.
- Key parts are encrypted to each holder's account.
- Only hashes and seal metadata go on-chain, never file contents.
- Every early-open attempt is refused and logged.
- Secrets are kept in `.env` and never committed.

## 10. Wow moment (demo)
1. A real exam paper PDF and a short video are sealed until **10:00:00**, with 3 key holders.
2. The link is shared on WhatsApp and by email live on screen.
3. At **09:59:55** a holder tries to release their part, and the contract refuses on screen.
4. At **10:00:00** all 3 holders tap release. The 3 noisy image shares slide together, the picture appears, and the PDF and video unlock.
5. A phone photo of a retyped leaked page is uploaded. The Investigator says **"Center 3, 94% confidence"**, and the attested report appears with the on-chain record.

## 11. Demo video script (about 2.5 minutes)
| Time | Scene |
|---|---|
| 0:00–0:15 | Hook: the NEET 2026 cancellation headline. "What if no one could open the paper early, not even the board?" |
| 0:15–0:45 | Seal a PDF and a video, set 10:00:00, and pick 3 key holders |
| 0:45–1:05 | Share by WhatsApp, email and QR, and show the countdown page |
| 1:05–1:25 | Early attempt at 09:59:55 is refused, and the log appears on NEAR testnet |
| 1:25–1:55 | 10:00:00: the 3 parts merge, the 3 image shares combine, the files unlock |
| 1:55–2:20 | Retyped leak is traced: "Center 3, 94%" |
| 2:20–2:35 | Impact: "34 students, 3 centers, 18 of 20 leaks traced." Close: "Sealed until the second. Traced after." |

## 12. Requirements check (honest)

| Judge requirement | Rating | Why |
|---|---|---|
| Real problem | ✅ Strong (9) | Exam leaks (NEET 2026), embargoes, tenders |
| Innovation | ⚠️ Medium (6) | Time-lock encryption and Shamir sharing exist (drand tlock, secret-sharing apps); the new part is contract-enforced release time, 3-holder merge and AI leak tracing together |
| Why NEAR | ⚠️ Medium-strong (7) | Contract time, scoped keys, permanent access log, attested agents, passkeys |
| AI agents | ✅ Good (7) | Setter, Auditor and Investigator agents |
| Security and privacy | ✅ Strong (8) | Browser encryption, 3-part key, no plain data on-chain |
| UX | ✅ Good (7) | Link, WhatsApp and email sharing; countdown page; passkey sign-in |
| Real users | ⚠️ Medium (6–7) | Strong only if the mock exam with 30+ students happens |
| Technical execution | ⚠️ Medium (6) | Large scope for about 19 hours |
| Measurable impact | ⚠️ Medium (6) | Early attempts refused, leaks traced correctly, students in the pilot |
| Demo | ✅ Strong (9) | Countdown, refusal, 3-part merge, visual reveal, leak traced |
| **Estimated total** | **about 70–72** | Built and demoed with real users |

**Grand-prize questions**
- Real problem? **Yes.**
- Innovative? **Partly.** It combines known tools in a new way for a new use.
- Does NEAR make it possible or better? **Better:** no single admin controls the release time, and the log is public.
- Does it work? **Only once built.** The demo must run live.
- Could it be a business? **Plausibly:** per-exam fees for coaching centers and universities, plus embargo and tender tools.

**Honest position:** this is a strong, demo-friendly entry. It is not a guaranteed winner. The biggest risks are scope and time.

## 13. Competitive comparison

| Feature | QR codes on papers | Password-protected PDF | drand timelock tools | **Sealed Paper v2** |
|---|---|---|---|---|
| Nobody can open early | ❌ | ❌ (password holder can) | ✅ | ✅ (contract time + 3 parts) |
| 3 people must agree | ❌ | ❌ | ❌ | ✅ |
| Any file type | ❌ | PDF only | ✅ | ✅ |
| Share by WhatsApp or email | ❌ | ✅ | Partly | ✅ |
| Public access log | ❌ | ❌ | ❌ | ✅ (NEAR) |
| Traces a retyped leak | ❌ | ❌ | ❌ | ✅ (AI agents) |

## 14. Tracks
1. **Privacy & Private AI** (main)
2. **Real-World Money** (deposit and refund, if built)
3. **Open Innovation**

Skip AI Security & Defense and Agent Economy, which are the most crowded.

## 15. Architecture

```
Browser (Next.js PWA)
 ├─ Encrypt / decrypt (WebCrypto AES-256-GCM)
 ├─ Shamir split / merge (3 parts)
 ├─ Visual 3-share image generator
 └─ Share: link · email · WhatsApp · Web Share · QR · .sealed file
        │
Backend (Node.js + TypeScript)
 ├─ Encrypted file storage (IPFS or S3-compatible)
 ├─ Email sender (SMTP or Resend) with .ics invite
 ├─ AI agents via NEAR AI Cloud: Setter · Auditor · Investigator
 └─ near-api-js
        │
NEAR testnet contract (Rust)
 ├─ create_seal(file_hash, unlock_at, holders, threshold)
 ├─ release_part(seal_id, part_hash)   // refused before unlock_at
 ├─ get_seal / get_log
 └─ record_leak_report(seal_id, report_hash)
```

## 16. Build plan (about 19 hours from 10:30 IST)

| Hours | Work |
|---|---|
| 0–2 | Contract: create seal, refuse early release, log; deploy to testnet |
| 2–6 | Browser encryption plus Shamir 3-part split and merge for any file type |
| 6–9 | Countdown page, release-my-part flow, unlock and decrypt |
| 9–11 | Sharing: link, email, WhatsApp, Web Share, QR, `.sealed` file |
| 11–12 | Visual 3-share image demo |
| 12–15 | Exam mode: Setter and Investigator agents (Auditor if time allows) |
| 15–16 | Mock exam with classmates; run 20 leak-trace tests |
| 16–18 | Record demo video, write README, post on X |
| 18–19 | Submit, with buffer time |

**If time runs short, keep this core:** seal, refuse early, merge 3 parts, unlock, share by link and WhatsApp.

## 17. Screening checklist (Claude and Codex)
- One command starts the app (`npm run dev:all`).
- A sample file seals, refuses to open before the unlock time, and opens after the 3 parts merge.
- The contract rejects `release_part` before `unlock_at`.
- The share link shows a countdown and then unlocks.
- A sample leaked text is traced to the right center.
- The README lists every library, which code is AI-generated, and what is real vs simulated. No overclaims.

## 18. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Scope too large for 19 hours | Build the core first; agents and visual shares come after |
| Judges say time-lock already exists | Lead with 3-holder merge, contract-enforced time, access log and leak tracing together |
| Large video files are slow | Cap at 100 MB; encrypt in chunks |
| A key holder is unavailable at unlock | Offer a 2-of-3 option |
| Mock exam permission | Ask faculty today; fallback: a club or study-group test |

## 18A. Worldwide impact if it succeeds

These are the changes the project aims for if it is adopted widely. They are goals, not results the hackathon version has already achieved.

| Area | Today | If Sealed Paper is adopted |
|---|---|---|
| **National exams** (NEET, UGC-NET, state exams, SAT/GCSE-style exams abroad) | One leak can cancel an exam for 22+ lakh students and cost months | Papers cannot be opened early, leaked copies trace to a centre, fewer full cancellations |
| **Government budgets and economic data** | A URL guess released the UK Budget report early and moved markets | Embargoed reports stay encrypted until the release second |
| **Courts and legal rulings** | Draft rulings leak and the source is never found | Fingerprinted drafts and a permanent access log narrow down the source |
| **Company results, mergers and product launches** | Early leaks enable insider trading and spoil launches | Files stay locked until announcement time; every opening is logged |
| **Tenders and procurement** | Bids can be opened early to favour one bidder | Bids open only at the deadline, with multiple officials releasing parts together |
| **Wills, estates and family documents** | Depend on one lawyer or family member | Released on a date or event, with trustees holding parts |
| **Journalism and whistleblowing** | Sources fear exposure; embargoes break | Safe time-released publication with a verifiable timeline |
| **Personal use** | Time capsules and surprises rely on trust | Messages, photos and videos open exactly when chosen |

**Measures of success after launch**
- Number of exams and documents sealed.
- Early-open attempts blocked.
- Leaks traced to a source, and time taken to trace them.
- Exams that did *not* need to be cancelled.
- Institutions using it (coaching centres, universities, exam boards, companies).

**Big picture:** the project shifts trust from "trust whoever holds the file" to "trust the time and the math." Nobody, not even the owner, can open a file early, and everyone can check the record.

## 19. Business model
- Per-exam fee for coaching centers, colleges and universities.
- Subscription for companies (embargoed results, tenders).
- Free personal tier (time capsules, gifts).

## 20. README headline and X post
- **README:** "Sealed Paper: files nobody can open early. 3-part keys, contract-enforced unlock time, AI leak tracing on NEAR."
- **X post:** "We sealed our own exam paper until 10:00:00. Even the 3 key holders couldn't open it early. Then we leaked it, and the chain told us which center did it. Built on @NEARProtocol"
