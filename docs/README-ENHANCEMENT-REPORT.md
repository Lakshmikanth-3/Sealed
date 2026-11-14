# README Enhancement Report

Date: 15 November 2026. Scope: add a technical appendix to `README.md` for technical evaluators, without changing the original content.

## 1. Preservation of the original README

| Check | Result |
|---|---|
| Original size | 23,783 bytes |
| Original SHA-256 (saved before editing) | `edbce4532a715c5f0b5383701adec79d80592f5712ffe4a4213b68767f346362` |
| SHA-256 of the first 23,783 bytes of the new README | `edbce4532a715c5f0b5383701adec79d80592f5712ffe4a4213b68767f346362` |
| Original content preserved byte-for-byte as the prefix | **Yes** |
| Sections removed, rewritten or reordered | None |
| New README size | 52,921 bytes |

Method: a copy of the original was saved first; the appendix was then appended with `cat >>`, never edited in place; the prefix was compared byte for byte with Node.js `Buffer.compare`.

To reproduce:

```
git show <commit-before>:README.md > original.md
head -c 23783 README.md | sha256sum      # equals: sha256sum original.md
```

## 2. Sections added (in order, after the original content)

1. Executive Summary for Technical Evaluators
2. System Architecture
3. End-to-End Encryption and Key Lifecycle
4. NEAR Contract Interaction
5. On-Chain vs Off-Chain Architecture
6. Shamir Secret Sharing
7. Threat Model and Security Boundaries
8. Exam Paper Security Workflow
9. Technical Innovation and Differentiation
10. Feature-to-Test Traceability
11. Judge's Quick Evaluation Guide
12. Additional Technical References (includes the data-flow diagram)

## 3. Diagrams created

| File | Type | Shown in README section |
|---|---|---|
| `docs/diagrams/architecture.mmd` | Flowchart | System Architecture |
| `docs/diagrams/encryption-lifecycle.mmd` | Flowchart | End-to-End Encryption and Key Lifecycle |
| `docs/diagrams/near-contract-flow.mmd` | Sequence | NEAR Contract Interaction |
| `docs/diagrams/threat-model.mmd` | Flowchart | Threat Model and Security Boundaries |
| `docs/diagrams/exam-security-flow.mmd` | Flowchart | Exam Paper Security Workflow |
| `docs/diagrams/data-flow.mmd` | Flowchart | Additional Technical References |

The Shamir example diagram is embedded in the README only.

**Validation:** every Mermaid block in the README (8, including the original "How it works" diagram) and every `.mmd` file was parsed and rendered with Mermaid 11.4.1 in Chrome: **13 of 13 succeeded**.

## 4. Source files inspected

- `contract/src/lib.rs`: method names, statuses, checks, log cap.
- `contract-plans/src/lib.rs`: subscribe, get_plan, admin rules.
- `lib/sealcrypto.js`: container format, AAD, SHA-256, Shamir split and combine, part wrapping.
- `lib/exam.js`: `parseExam`, `setVersions`, `audit`, `investigate`.
- `server/index.js`: upload hash check, escrow, open route, parts route, allow-list, alerts, exam report, chat routes, CSP.
- `server/sealStore.js`: escrow key derivation and AES-256-GCM boxes, Redis/Blob store.
- `server/sealChain.js`, `server/nearAuth.js`, `server/alerts.js`, `server/kv.js`, `server/chat.js`.
- `client/sealed.js`: `release_part` signing.
- `public/open.js`: hash comparison source; `public/verify.js`: direct RPC read; `public/holder.js`.
- Tests in `tests/` and `tests/browser/`; `docs/SEALED-DEPLOYMENT.json`; `package.json`.

## 5. Tests executed for this update

| Command | Result |
|---|---|
| `npm test` | 36 / 36 passed |
| `npm run contract:test` | 10 / 10 passed |
| `npm run plans:test` | 8 / 8 passed |
| `npm run test:browser` | 3 / 3 passed |

Live testnet suites (`test:access`, `test:e2e`, `test:chat`) spend testnet NEAR and were **not** re-run for this documentation change; their last results (14 Nov 2026) are labelled "earlier run" in the README.

## 6. Other checks

| Check | Result |
|---|---|
| Relative links in the appendix | 29 checked. All resolve, including the audit and report files created with it. |
| In-page anchors | 2 checked, both resolve |
| External URLs | App, GitHub, Proof and Check pages return HTTP 200. The NEAR explorer returns 403 to automated requests. Both contract accounts were confirmed over RPC: `sealed.kanth_s.testnet` code hash `ARLYJDkW…` (matches the recorded build), `plans.sealops.kanth_s.testnet` code hash `Bkx6EZ9X…`. |
| Production deployments or transactions triggered | **None.** Only read-only RPC queries (`view_account`) and local tests were run. |
| Fabricated statistics or claims | None introduced. Every number comes from a test run or a source file listed above. |

## 7. Unresolved inconsistencies

Recorded in [`docs/README-AUDIT.md`](README-AUDIT.md) and deliberately not changed in the original README:

- Premium is listed as 10 NEAR; the deployed contract charges 1 NEAR.
- The plans-contract test count reads 7; it is now 8, and the 8th covers an undeployed change.
- The live demo row reads 21 / 21, 5:21; later runs differ.
- The build date reads 14 November; commits span 12 to 15 November 2026.

## 8. Remaining documentation gaps

- No public demo-video URL.
- No link to the `shamir-secret-sharing` audit reports.
- No independent security review of Sealed itself.
- The deployed plans-contract version is not stated in the original README.
