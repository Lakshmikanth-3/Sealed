# Appeal: product requirements

Working description: a gig worker keeps private work records, commits their fingerprints on NEAR, and selectively shares independently checkable evidence when preparing an appeal.

Goal: deliver a real application and an evidence-backed grand-prize submission. Judging determines the winner; no score or probability is assumed.

## Problem to validate

Workers may need a usable history of trips, earnings, ratings, penalties and deactivation notices when asking a platform to review a decision. Appeal Record aims to make disclosed records easier to inspect for later changes. Actual worker needs and reviewer usefulness require interviews and a consented pilot. Market size, litigation claims and competitor comparisons are not verified in this project and must not be presented as established research.

## Intended users

- Workers on a selected delivery platform and in a city to be confirmed by the builder.
- A union representative or lawyer reviewing a worker-authorized evidence pack.

Participant availability, device access, platform support and reviewer participation are unknown. No partnership is claimed.

## Product flow and implementation status

| Step | Intended behavior | Current evidence |
|---|---|---|
| Identity | Recoverable worker-owned account with passkey onboarding | V2 contract and signature validation tested locally; sign-in/recovery not integrated; phone ID remains self-reported |
| Capture | Worker-controlled manual capture plus permission-based Android notification capture | Manual PWA capture tested in Chrome; Android capture not implemented |
| Local storage | Private records persist offline with backup and restore | IndexedDB/reload/offline capture implemented; validated empty-journal atomic restore added; physical-device recovery pending |
| Anchoring | Worker-authorized daily roots, sponsored gas, successful NEAR contract execution | V2 Rust WASM built and host-tested; SDK/RPC checks tested locally; live integration and public deployment pending |
| Disclosure | Worker reviews selected days, entries, attachments and location before publishing | Selection preservation, final record/location/attachment preview and explicit public-link consent implemented; hosted expiry/revocation pending |
| Case building | Cited appeal brief from disclosed evidence; deterministic arithmetic | Deterministic summary and cited review brief with print/text export implemented; real AI inference and TEE execution unimplemented |
| Verification | Independent anchor, membership, attachment, summary and attestation checks | Content verification and independent CLI implemented; TEE verification unimplemented |
| Support | Optional authorized Intents payment to the worker | Not implemented; no payment result claimed |

## Required evidence properties

- A matching anchor establishes content commitment by the chain timestamp. The phone's capture timestamp is a claim, not independently authenticated time.
- A Merkle proof establishes membership of disclosed content in a commitment. It does not establish truth, completeness of a worker's history, or independent platform provenance.
- The v1 prototype does not authenticate a worker-owned NEAR identity. Production ownership must be cryptographically bound and independently verifiable.
- Reject edited entries, roots, attachments and summaries; duplicate days or records; malformed fields; and mismatches with trusted chain/deployment configuration.
- Live anchors must execute successfully and finally on the trusted contract. A failed call is not a successful application anchor.
- A deterministic summary is recomputed independently. AI analysis must cite entry IDs and distinguish evidence from inference. An attestation label is insufficient: validate the report and its binding to the actual workload and output.
- Show the distinction between mock, synthetic RPC tests and actual NEAR execution wherever a result is presented.

## Privacy, ownership and reliability

- Keep undisclosed records on the device. Do not send private records to a cloud model or reviewer without explicit worker consent.
- Preserve original screenshot bytes; hashes bind those bytes. Shared screenshots and location may identify people and need a deliberate review step.
- Minimize public metadata and explain which chain commitments cannot be deleted. Hosted packs need defined access, expiry, revocation and deletion behavior.
- Implement authenticated relaying, worker-bound authorization, sponsorship limits, quotas and safe logs before public production exposure.
- Provide recovery and tested backup/restore; local browser storage alone is not durable worker ownership.
- Test on the actual intended Android device and platform before claiming support. A mobile viewport is not a physical-device test.

## Measurement policy

| Measure | Current result | Target |
|---|---|---|
| Real pilot participants | Not measured | Agree after recruitment access is confirmed |
| Real recorded work days | Not measured | Agree with participants |
| Real evidence packs reviewed | Not measured | Agree with reviewer availability |
| Reviewer usefulness feedback | Not collected | Define an interview/checklist with a reviewer |
| Live anchor reliability/latency | Not measured | Measure deployed behavior first |

Synthetic fixtures do not count toward these measures. No testimonial, rider total, earnings number or impact result may be invented. Obtain separate permission for public footage and quotes.

## Demonstration

Show one complete flow: capture a record, get a successful anchor, choose disclosures, build a case, independently verify it, and reject a changed pack. Label synthetic records as synthetic. If real records or a real payment are shown, get consent and link actual evidence. Avoid fabricated history lengths or participant numbers.

## Event and delivery

The owner confirmed NEAR HACKATHON at https://nearhackathon.com/. Verified deadline: 14 November 2026, 23:59 UTC (15 November, 05:29 IST). See [EVENT-REQUIREMENTS.md](EVENT-REQUIREMENTS.md) for sources and publication requirements. Technical implementation, design, impact, originality and sustainability are prior-event guidance; the supplied rules do not publish numerical weights. AI screening checks reproducibility/features and humans decide.

Privacy & Private AI is the proposed primary track; final tracks depend on implemented behavior. Intents and other integrations are not mandatory merely because they appear in track hints. Payments still remain an intended optional product feature and require their own completion evidence and authorization.

Follow [IMPLEMENTATION-PLAN.md](IMPLEMENTATION-PLAN.md) for the phase sequence and exit checks. Dates and scope depend on verified event constraints and real access; an invented hourly schedule is not a delivery commitment.

Potential business model: a free worker app supported by unions/legal-aid organizations or grants. No customer willingness to pay, pricing or revenue is validated. The owner selected MIT for application source; third-party assets retain their own licenses.

Evidence support, not legal advice. The application does not guarantee legal admissibility or a successful appeal.
