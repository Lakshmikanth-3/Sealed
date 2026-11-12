# Event requirements and evidence

Event confirmed by the owner supplying the event page and full rules. Live rules rechecked 12 November 2026: [official event](https://nearhackathon.com/), [organizer rules](https://nearhackathon.com/HACKATHON.md), [NEAR AI starter repository](https://github.com/nearai/near-hackathon-prompt-examples). Recheck again before submitting.

| Requirement or rule | Current status | Evidence / next action |
|---|---|---|
| Deadline: 14 November 2026, 23:59 UTC (15 November, 05:29 IST) | Verified from official site | Release and submit before deadline |
| Development: 1–14 November; judging: 16–18 November | Verified from supplied/live rules | Code eligibility starts earlier, at the 19 October announcement |
| Code since 19 October counts; older work is baseline | Verified, organizer Q-001–004 | Preserve actual history; disclose original prototype; no backdating |
| Public repository | Origin configured; no push | Owner's date-conditioned push request is unresolved; do not falsify timestamps or publish contrary to that constraint |
| Reproducible working prototype | Local mock tested | README, npm test, npm run test:browser; real chain proof pending |
| Public X demo and repository links | Pending | Owner posts with @NEARProtocol and #NEARHackathon; local-only demo needs video, not screenshots alone (Q-012) |
| One final submission per project | Pending | Review actual payload and owner details before sending |
| License file | MIT selected by owner and LICENSE added | Root package metadata identifies MIT; third-party font retains its separate OFL license |
| Testnet is eligible; specific integrations are not mandatory | Verified, organizer Q-010–011 | Prioritize evidence integrity and successful NEAR execution |
| Intents has no testnet | Verified, organizer Q-007 | Real payout needs mainnet authorization and funding; quotes do not prove payment |
| Privacy track | Proposed | Best current conceptual fit; private inference/attestation remain unimplemented |
| Human judging and screening | AI checks reproducibility/features; humans decide (Q-017) | Five areas are prior-event guidance, not published numeric weights or a guaranteed score |
| Mainnet payout wallet | Owner supplied lakshmikanth.near; mainnet existence checked | Confirm this exact payout account in the final payload; no wallet connection/private key needed to submit |
| Submission ownership and consent | Pending | Collect actual lead name, contact email, team size, final tracks, demo link and consent; print exact JSON and wait for explicit confirmation |
| One submission; persistent request ID | No submission sent | Generate once only when preparing the real payload; never put personal payload into Git. Reuse ID for permitted retries; request changes rather than submitting twice |
| Other project disclosure (Q-015) | Owner's other entries unknown | At most two independent projects per person; if there is another, each README must name the other. Ask before release, without inventing another project |

Implementation targets and real measurements belong in separate records. No rider counts, testimonials or impact numbers have been verified. The original PRD's forecast and targets are not results.

Current working track: `privacy`; `open` is a candidate for owner selection. These are not submitted selections. TEE, Intents and private inference are not claimed implemented merely because they appear in track hints. The project can pursue testnet eligibility with its own NEAR contract, but still needs actual integration evidence.

NEAR AI access route from Q-000: create credits/API access at https://cloud.near.ai or join https://nearbuilders.org/join and claim the separate builder-credit key at https://nearbuilders.org/dashboard. Builder credits use a separate key/balance and do not appear in the cloud dashboard. Keep actual keys in local secret configuration, never chat or Git. Credit availability is an organizer statement, not a balance verified for this team.
