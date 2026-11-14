# Sealed Paper contract

Rust (`near-sdk` 5.30) contract for time-locked seals on NEAR testnet. Deployed at `sealed.kanth_s.testnet`.

| Method | Who | What |
|---|---|---|
| `new(owner, operators)` | contract account (init) | Sets the owner and release-service operators |
| `add_operator`, `remove_operator` | owner | Manage operators |
| `create_seal(seal_id, file_hash, unlock_at_ms, mode, holders, commitments, threshold_k, total_n, owner)` | operator | `single` (time only) or `split` (N holders, K needed, one SHA-256 commitment per holder's part) |
| `release_part(seal_id, part_commitment)` | holder | Returns `released`, `early`, `not_holder`, `already_released`, `bad_commitment` or `single_mode`; every call is logged |
| `request_open(seal_id)` | anyone | Returns `early`, `awaiting_parts` or `open`; every call is logged |
| `record_alert(seal_id, alert_hash, kind)` | operator | Logs the SHA-256 of an off-chain alert record |
| `get_seal`, `get_log(seal_id, from, limit)`, `is_unlocked`, `get_config` | view | Read state |

Refusals return a status instead of panicking, so the refusal itself is stored in the log. Logs are capped at 300 entries per seal; extra calls are counted in `dropped_logs`.

```sh
npm run contract:test    # 10 unit tests
npm run contract:build   # contract/build/sealed_paper.wasm
```
