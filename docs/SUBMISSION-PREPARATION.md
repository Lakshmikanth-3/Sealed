# Appeal — submission preparation

This is a local preparation document, not a saved or sent application. The owner confirmed the event and chose MIT. Read [the live event rules](https://nearhackathon.com/HACKATHON.md) again before any submission; the organizer may change them. Deadline: **14 November 2026, 23:59 UTC**, which is **15 November, 05:29 IST**.

## What is ready and what remains

| Item | Current state | Required next evidence or decision |
|---|---|---|
| Project | Appeal, name confirmed | Recheck description against the final runtime |
| License | MIT, owner selected | Preserve third-party font OFL and dependency notices |
| Repository | Owner supplied Lakshmikanth-3/Appeal; local origin configured | Authorized publication with actual timestamps; verify public clone and instructions afterward |
| Working prototype | Live-only wallet flow and separately tested v2 components | Actual successful testnet integration remains pending |
| Video / X post | No public demo link supplied | Human records/publishes the real app, labels any mock/synthetic parts, includes @NEARProtocol and #NEARHackathon |
| Payout | Owner supplied a mainnet account; existence checked | Human confirms the exact payout account in the reviewed payload. No connection, seed phrase or private key is needed for the application |
| Team | Git identity is configured | Git name/email are not automatically approved submission identity. Human supplies lead name, contact email and one allowed team-size value |
| Tracks | Privacy is the working fit; Open Innovation is a candidate | Human selects the final track IDs. No invented AI/TEE or payments claims to qualify for other tracks |
| Contact consent | Not collected for submission | Read the notice below verbatim and obtain explicit agreement |
| Previous submission | No submission sent by this agent | Confirm whether the owner submitted through another route before preparing an API request |
| Other project entry | Unknown | Ask whether the owner is entering a second independent project; Q-015 permits at most two and requires reciprocal README disclosure if so. Do not invent another entry |

The existing mainnet wallet is for prize payout. The development testnet account is separate. Testnet-only entries are eligible under Q-010; Q-011 says track hints and named integrations are optional. This does not remove the need to demonstrate the NEAR integration claimed by the project.

## Before publishing the repository

The original release was pushed with actual dates after explicit authorization. The owner subsequently requested retrospective dates; no rewrite or force-push was performed. Current live-only changes are local and uncommitted. Resolve the publishing/history instructions before another push; disclose any retrospective metadata. Preserve the original staged prototype as an inspectable baseline and separate new work honestly. No minimum line count or a fabricated sequence of past development days is required by the event. Link an actual baseline-to-submission diff after real commits exist; never manufacture historical tags or dates.

Review only source and intentional synthetic presentation assets. Exclude `.env`, account keys, SQLite databases/WAL files, raw worker evidence, filled pilot/cost files, request payloads, tokens and generated build output. A public repository must remain accessible through judging. The rule suggests keeping a hosted demo through 18 November, ideally 25 November; no uptime is claimed without an actual host and checks.

Use a clean clone to run the README commands after publication. A locally passing worktree does not prove that every required untracked file was included in a push.

## Demo recording runbook

Use the real wallet-to-contract flow in README. Record capture, wallet approval, finalized receipt verification, selective sharing, independent verification and tamper rejection. Show actual explorer links. Do not substitute simulated transactions or present the setup-required screen as a completed NEAR integration.

The old demo server and scripts have been removed. A real transaction and contract must exist before recording successful anchoring. If the app remains local-only, the human posts a video with @NEARProtocol and #NEARHackathon. The agent does not post or submit without the required explicit approvals.

Private AI is an explicit additional operation; it must either succeed with verified provider evidence or fail. The reviewer does not independently reverify its exported attestation and must not show an attested badge.

## Exact submission review

Do not create a placeholder payload, store personal application data in Git or send the API request from this document. Collect the actual fields listed in HACKATHON.md. Team-size values are exactly `1`, `2 - 4`, `4 - 6`, `6 - 8`, `8+`. Final track IDs must come from the event list.

Read this contact notice verbatim:

> I agree that the organizers may use these details to review our submission and contact us about this hackathon.

After the human approves their values and consent, prepare exactly these fields: `requestId`, `projectName`, `leadName`, `email`, `size`, `tracks`, `nearAddress`, `projectUrl`, `demoUrl`, `idea`, `consent`. Generate a UUID once for that actual application and retain it privately. Print the **full exact JSON** for review, then wait for explicit confirmation before POSTing it. Do not add `website`; it is a spam trap. A public project/demo link is required; an unpublished draft or localhost URL is not a public demo post.

Validate the actual payload against the current contract: project and lead names 2–80 characters, email at most 160, description 20–2,000, repository/demo URLs at most 300 each, valid lowercase NEAR account syntax, unique supported track IDs and a body no larger than 12,000 bytes. Consent must be the boolean `true` only after the human agrees. Do not infer submission identity from Git author settings or substitute a different email to bypass the entry limit.

Check whether the project was already submitted. A 201 means saved. A 400 requires correcting the reported fields with the same request ID. A 403 requires stopping and explaining, not retrying. A 409 requires checking the existing submission or submission limit, not changing identity/repository to bypass it. A 413 requires shortening the body. A 503 or ambiguous transport failure must not generate a new request ID; follow the allowed retry procedure. This document does not authorize any retry or submission by itself.

For a saved application's errors, the human uses [Request changes](https://nearhackathon.com/request-changes), with the original details. Do not submit the project a second time. A wallet replacement especially requires careful human confirmation.
