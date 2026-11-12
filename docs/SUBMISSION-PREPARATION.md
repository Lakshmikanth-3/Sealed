# Appeal — submission preparation

This is a local preparation document, not a saved or sent application. The owner confirmed the event and chose MIT. Read [the live event rules](https://nearhackathon.com/HACKATHON.md) again before any submission; the organizer may change them. Deadline: **14 November 2026, 23:59 UTC**, which is **15 November, 05:29 IST**.

## What is ready and what remains

| Item | Current state | Required next evidence or decision |
|---|---|---|
| Project | Appeal, name confirmed | Recheck description against the final runtime |
| License | MIT, owner selected | Preserve third-party font OFL and dependency notices |
| Repository | Owner supplied Lakshmikanth-3/Appeal; local origin configured | Authorized publication with actual timestamps; verify public clone and instructions afterward |
| Working prototype | Local mock workflow and separately tested v2 components | Actual successful testnet integration remains pending |
| Video / X post | No public demo link supplied | Human records/publishes the real app, labels any mock/synthetic parts, includes @NEARProtocol and #NEARHackathon |
| Payout | Owner supplied a mainnet account; existence checked | Human confirms the exact payout account in the reviewed payload. No connection, seed phrase or private key is needed for the application |
| Team | Git identity is configured | Git name/email are not automatically approved submission identity. Human supplies lead name, contact email and one allowed team-size value |
| Tracks | Privacy is the working fit; Open Innovation is a candidate | Human selects the final track IDs. No invented AI/TEE or payments claims to qualify for other tracks |
| Contact consent | Not collected for submission | Read the notice below verbatim and obtain explicit agreement |
| Previous submission | No submission sent by this agent | Confirm whether the owner submitted through another route before preparing an API request |
| Other project entry | Unknown | Ask whether the owner is entering a second independent project; Q-015 permits at most two and requires reciprocal README disclosure if so. Do not invent another entry |

The existing mainnet wallet is for prize payout. The development testnet account is separate. Testnet-only entries are eligible under Q-010; Q-011 says track hints and named integrations are optional. This does not remove the need to demonstrate the NEAR integration claimed by the project.

## Before publishing the repository

The owner previously requested a push conditional on retrospective dates. That condition is unresolved; do not push contrary to it and do not falsify timestamps. Actual-date permission is needed before publication. Preserve the original staged prototype as an inspectable baseline and separate new work honestly. No minimum line count or a fabricated sequence of past development days is required by the event. Link an actual baseline-to-submission diff after real commits exist; never manufacture historical tags or dates.

Review only source and intentional synthetic presentation assets. Exclude `.env`, account keys, SQLite databases/WAL files, raw worker evidence, filled pilot/cost files, request payloads, tokens and generated build output. A public repository must remain accessible through judging. The rule suggests keeping a hosted demo through 18 November, ideally 25 November; no uptime is claimed without an actual host and checks.

Use a clean clone to run the README commands after publication. A locally passing worktree does not prove that every required untracked file was included in a push.

## Demo recording runbook

Use `npm run start:demo` for a deliberately isolated **local mock** recording. It uses port 8790 and a temporary ledger, not `.env` or public transactions. Use a fresh browser profile; do not erase a real journal. Record the full interaction, not fabricated screen states. All example notes should say `SYNTHETIC`, and the mock network badge must remain visible when describing anchoring. This video demonstrates current local behavior, not real worker outcomes or a completed NEAR deployment.

1. **Start with the task.** Show Appeal and capture a synthetic work event. State that the worker controls a local journal; do not claim automatic platform capture or employment verification.
2. **Keep one record private.** Capture another synthetic event and open Journal. Save the day to the demo ledger, visibly labelled mock.
3. **Choose and preview.** Open Prepare case, exclude one event, review the exact outgoing entries and screenshot/location counts, then confirm the public-link sharing notice. Show that no link exists before confirmation.
4. **Review independently.** Open the reviewer link, show `Demo verified`, the disclosed-versus-committed count, original screenshot where included, entry citations and the **unattested** review brief. Explain that a successful real NEAR run will use public RPC and finalized inner receipts; do not describe the mock transaction as on-chain.
5. **Break it visibly.** Download the actual JSON, edit a disclosed amount in an editor, reload that file, and show rejection plus the missing brief. Do not merely overlay a fake failure badge.
6. **Close with proof limits.** Content integrity is narrower than truth or legal admissibility. Link the actual public repository and invite concrete worker/reviewer feedback after it is published.

If a real worker-authorized testnet flow is completed, record it instead and show its actual explorer transaction and contract receipt. Record the deployment configuration from a trusted source, not the uploaded pack. Never add a placeholder hash, simulate a payment or call a local summary TEE-attested. When the app remains local-only, Q-012 requires video because judges cannot open the demo; screenshots alone are insufficient in that case.

No fixed video duration is published in the supplied rules. Show a complete task without inventing a mandatory time limit. The owner publishes the X post; drafting does not authorize the agent to post it.

### Current-state description draft

> Appeal lets workers record private work events, select entries and share a tamper-evident pack with a reviewer. The prototype provides salted Merkle proofs, original screenshot checks, independent verification and cited review briefs. A locally tested NEAR v2 contract and sponsored worker-signed relayer are implemented; public deployment and phone account integration remain pending.

This is a review draft for the current implementation, not an approved application field. Rewrite it when actual deployment changes the behavior. Do not include unused future features in a description of what was built.

### Current-state X draft

> Can a reviewer check selected work records without seeing the whole private journal? I built Appeal at NEAR HACKATHON to explore that: capture, selective sharing, a cited review brief and a tamper test. This video shows the local mock workflow; the NEAR worker-owned v2 path is tested locally and still needs public deployment. @NEARProtocol #NEARHackathon

Add the actual public repository link and attach the recorded video only when both exist. If publishing a real testnet demo, replace the mock description with what was actually recorded. The owner approves and publishes their final wording themselves.

## Exact submission review

Do not create a placeholder payload, store personal application data in Git or send the API request from this document. Collect the actual fields listed in HACKATHON.md. Team-size values are exactly `1`, `2 - 4`, `4 - 6`, `6 - 8`, `8+`. Final track IDs must come from the event list.

Read this contact notice verbatim:

> I agree that the organizers may use these details to review our submission and contact us about this hackathon.

After the human approves their values and consent, prepare exactly these fields: `requestId`, `projectName`, `leadName`, `email`, `size`, `tracks`, `nearAddress`, `projectUrl`, `demoUrl`, `idea`, `consent`. Generate a UUID once for that actual application and retain it privately. Print the **full exact JSON** for review, then wait for explicit confirmation before POSTing it. Do not add `website`; it is a spam trap. A public project/demo link is required; an unpublished draft or localhost URL is not a public demo post.

Validate the actual payload against the current contract: project and lead names 2–80 characters, email at most 160, description 20–2,000, repository/demo URLs at most 300 each, valid lowercase NEAR account syntax, unique supported track IDs and a body no larger than 12,000 bytes. Consent must be the boolean `true` only after the human agrees. Do not infer submission identity from Git author settings or substitute a different email to bypass the entry limit.

Check whether the project was already submitted. A 201 means saved. A 400 requires correcting the reported fields with the same request ID. A 403 requires stopping and explaining, not retrying. A 409 requires checking the existing submission or submission limit, not changing identity/repository to bypass it. A 413 requires shortening the body. A 503 or ambiguous transport failure must not generate a new request ID; follow the allowed retry procedure. This document does not authorize any retry or submission by itself.

For a saved application's errors, the human uses [Request changes](https://nearhackathon.com/request-changes), with the original details. Do not submit the project a second time. A wallet replacement especially requires careful human confirmation.
