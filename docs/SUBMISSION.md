# Submission kit

## Demo video script (about 2.5 minutes)

Before recording:
- Run `npm run dev:all`.
- Open `/app` in one window and keep a second window for holder links.
- Use a short PDF exam paper and one image.
- If you can, enter your own `kanth.testnet` as Holder 1 so the Meteor Wallet step appears on screen.

| Time | Scene | What to show |
|---|---|---|
| 0:00–0:15 | Hook | Landing page. Say: "NEET-UG 2026 was cancelled for 22 lakh students after a leak. What if nobody could open the paper early, not even the people holding the key?" |
| 0:15–0:45 | Seal | **Seal a file** → PDF → preset **3 of 5** (or 2 of 3) → Holder 1 = `kanth.testnet` (shows ✓ and balance) → **+2 min** → **Seal and lock on NEAR**. Click the transaction link to show the seal on NearBlocks. |
| 0:45–1:05 | Share | WhatsApp, Email with calendar invite, QR code. Open the share link: countdown and the logging notice. |
| 1:05–1:25 | Early attempt | On a holder link, click **Release my part**: "Refused: too early". On the share page, click **Open file**: "Refused: still locked". Show the on-chain access log, then the owner's alert in **My seals** (time in IST and UTC, device, approximate location). |
| 1:25–1:55 | Unlock | When the countdown ends, release from the holder links (Holder 1 signs in Meteor Wallet). Open the share page: "Verified: matches the hash on NEAR", PDF preview. For the image seal, the shares slide together. |
| 1:55–2:20 | Leak traced | **Exam mode** → sample paper → 3 centres → **Generate versions** (Auditor: passed) → **Simulate a leak** → **Trace the leak**: "Centre N, NN% confidence" → **Record on NEAR**. |
| 2:20–2:35 | Close | Change one byte of a stored file to show **FILE TAMPERED**, or show `/verify`. Say: "Sealed until the second. Logged forever." |

Only state results you actually observed. For example, don't quote pilot numbers unless the mock exam happened.

## Form description (under 2,000 characters)

> Sealed Paper seals any file (exam paper, tender, results, will, video) so that nobody can open it before a chosen second. The file is encrypted in the browser with AES-256-GCM. In split mode its key becomes N Shamir parts (2 to 20, any K needed). Each part is additionally wrapped, so holders cannot pool parts early.
>
> A Rust contract on NEAR testnet (sealed.kanth_s.testnet) stores only the file hash, holders, part commitments and unlock time. It refuses every early release or open, refuses non-holders, and writes every attempt, refusals included, to a public on-chain log.
>
> Holders release with app-created testnet accounts or their own NEAR account in Meteor Wallet. An optional allow-list limits opening to named NEAR accounts (e.g. kanth.testnet), which prove ownership with a NEP-413 signature checked against an on-chain full-access key.
>
> Viewers' browsers check the file against the on-chain hash before decrypting, so a modified file shows FILE TAMPERED. Early attempts, wrong keys, tampering, non-holders and unlisted accounts trigger alerts: time in IST/UTC, device, approximate IP location, and GPS only with consent. Each alert's hash goes on-chain.
>
> Sharing: link, WhatsApp, email with calendar invite, Web Share, printable QR, and a .sealed file.
>
> Exam mode gives each centre a version with different question order, option order and wording. A retyped leak is traced to its centre with a confidence score, and the report hash is recorded on NEAR.
>
> Honest limits: the release service plus K holders could collude; single mode trusts the service with the key; exam mode is rule-based (no AI or OCR); email and WhatsApp need provider keys.
>
> Tests: 21 unit, 10 contract, 4 offline browser, and live-testnet end-to-end and access tests.

## X post (required)

> We built Sealed Paper at #NEARHackathon 🔒
>
> Seal an exam paper until 10:00:00. Even the key holders can't open it early: the @NEARProtocol contract refuses and logs every attempt. Leaked copy? It's traced to its exam centre.
>
> github.com/Lakshmikanth-3/Appeal

Attach the demo video. Change the link if you rename the repository.

## Form fields

- **Tracks:** Privacy & Private AI, Open Innovation
- **Repository:** https://github.com/Lakshmikanth-3/Appeal (or the renamed URL)
- **Demo post:** your X post link
- **Wallet:** the NEAR account where prizes should be sent
