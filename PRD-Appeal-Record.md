# PRD: Appeal Record

NEAR Hackathon grand-prize candidate. Deadline: 14 Nov 2026, 23:59 UTC (15 Nov, 05:29 IST).
Honest target score if fully built with real users: about 73/100. Not guaranteed to win; execution, real users and a first-try demo decide.

## 1. One-line pitch
A gig worker's phone keeps a private, tamper-proof record of their work, so when an algorithm bans them, a lawyer or union can verify the evidence in one click.

## 2. Problem
- Delivery and ride-hailing workers in India are deactivated by algorithms with little explanation.
- Karnataka litigation is testing algorithmic deactivation; a 2026 essay called for an "algorithmic appeal record".
- Workers have screenshots, but nobody trusts them: they could be edited.

## 3. Users
- **Primary:** food-delivery riders and ride-hailing drivers.
- **Secondary:** unions, labour lawyers, legal-aid clinics.
- **Hackathon pilot:** riders from a delivery WhatsApp group or union; fallback: 10 part-time workers you know.

## 4. Goals and success metrics
| Metric | Target by 14 Nov |
|---|---|
| Real workers logging | 20+ (minimum 10) |
| Verified work days recorded | 50+ |
| Evidence packs generated and verified | at least 3 |
| Lawyer or union reviewer on camera | 1 |

## 5. Solution overview
- **Logger agent (on phone):** captures trips, pay, ratings, penalties and app notifications as they arrive, with GPS and timestamps. Raw data stays on the phone.
- **Daily anchor:** each day's log is hashed and stored in the worker's own NEAR account.
- **Case-builder agent:** on deactivation, runs in NEAR AI Cloud, summarises the history (earnings, ratings trend, penalties) and produces an attested evidence pack.
- **Verifier page:** a lawyer or union opens a link and checks hashes and attestation without logging in.
- **Support fund:** unions or supporters send help through Intents.

## 6. Why NEAR (load-bearing)
| NEAR feature | Role |
|---|---|
| Worker-owned account | Record belongs to the worker; platform cannot delete it |
| On-chain daily anchors | Proves records were not edited later |
| NEAR AI Cloud attestation | Proves the summary was produced by stated code, unaltered |
| FastAuth | Workers sign in with passkey, no crypto knowledge |
| Intents | Union support payouts in any token |

## 7. User flow
1. Worker installs and signs in with a passkey.
2. Logger captures work automatically each shift.
3. Daily anchor saved on NEAR.
4. Worker is deactivated and taps "Build my case".
5. Evidence pack produced; link shared with lawyer or union.
6. Reviewer verifies; support payout can follow.

## 8. Functional requirements (MVP)
- Android capture of notifications and pay screens for one platform type (food delivery).
- Live-capture badge ("captured live, not uploaded later").
- Daily hash anchoring to the worker's NEAR account.
- Attested case summary from NEAR AI Cloud.
- Public verifier page.
- Intents support payout (small amounts).

## 9. Non-goals
- Proving that every captured item is true (it proves when it was captured and that it was not edited).
- Covering all platforms in the hackathon.

## 10. Security, privacy and legal
- Raw screenshots and GPS stay on the phone; only hashes and summaries leave.
- Explicit worker consent; worker-initiated capture only.
- Disclaimer: evidence support, not legal advice.

## 11. Wow moment (demo)
A rider is "deactivated". One tap builds the case. A labour lawyer opens the link on camera and verifies 90 days of untouched records. A union support payment lands.

## 12. Demo video script (2-3 minutes)
1. **Hook (0:00-0:15):** "The algorithm fired him. His phone kept the receipts."
2. **Problem (0:15-0:40):** Karnataka case, workers with no trusted proof.
3. **Logging (0:40-1:10):** a real shift captured live; daily anchor on NEAR.
4. **Ban and case (1:10-1:50):** deactivation, one tap, evidence pack.
5. **Verify (1:50-2:20):** lawyer verifies; attestation shown.
6. **Impact (2:20-2:40):** "23 riders, 61 verified days"; support payout.

## 13. Competitive comparison
| Feature | Screenshots | FareShare / WeClock | Appeal Record |
|---|---|---|---|
| Tamper-proof | No | No | Yes (on-chain anchors) |
| Worker owns the record | Yes | Partly | Yes |
| Lawyer can verify in one click | No | No | Yes |
| Attested AI summary | No | No | Yes |

## 14. Tracks
Privacy & Private AI, Social Money, Real-World Money.

## 15. Business model
Free for workers; unions and legal-aid groups pay per seat for the reviewer dashboard; grants from labour-rights funders.

## 16. Risks and mitigations
| Risk | Mitigation |
|---|---|
| Can't reach real workers in time | Message rider WhatsApp groups and one union today; fallback 10 known part-timers |
| Android capture blocked | Fallback: guided in-app screenshot capture with live timestamp |
| Platform terms of service | Worker-initiated, on-device, consent first |
| Scope too big | One platform type only |

## 17. Build plan (about 41 hours from Thu 12:15 IST)
| Hours | Work |
|---|---|
| 0-2 | Spike: Android notification capture; NEAR anchor transaction |
| 2-12 | Logger app with live-capture badge; FastAuth |
| 12-20 | Daily anchoring and verifier page |
| 20-28 | Case-builder agent on NEAR AI Cloud; evidence pack |
| 28-32 | Intents support payout |
| 32-36 | Onboard real riders; collect logs |
| 36-40 | Lawyer or union review on camera; demo; README; X post |
| 40-41 | Submit; buffer |

## 18. Screening checklist (Claude / Codex)
- One command starts the server and verifier page.
- Sample log produces anchors and an evidence pack.
- Verifier page passes for an untouched pack and fails for an edited one.
- README lists libraries and AI-generated code; no overclaims.
