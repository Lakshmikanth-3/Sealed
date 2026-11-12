# Local verification — 12 November 2026

This records a host build and SDK host tests. It is not a sandbox-chain run, public deployment, worker pilot or legal validation.

| Item | Observed result |
|---|---|
| Rust toolchain | 1.95.0, pinned in rust-toolchain.toml |
| Contract SDK | near-sdk 5.30.1, pinned in Cargo.toml |
| Dependency resolution | Cargo.lock generated and used with --locked |
| Builder | Native cargo-near 0.23.0; optimized with wasm-opt |
| Build command | npm run contract:build |
| Artifact | contract/build/appeal_anchors.wasm |
| Artifact bytes | 133181 |
| SHA-256 | 3252a16cdd067b640a0f5e46109516840d5cb2404045f469eae18235b163fcae |
| Export check | new, register_worker, anchor, get_anchor, is_registered, get_config present |
| SDK host tests | 12 passed; none failed |
| Formatting | cargo fmt -- --check passed |

The tests exercise worker authorization, unauthorized registration, unregistered workers, duplicate retries, count increases, account/day storage limits, network binding and calendar validation. Resource-limit fixture values are synthetic test inputs, not measured rider statistics.

The build uses `non-reproducible-wasm`: it is not claimed to be reproducible across hosts. Rebuilding changed source requires recording the new checksum. Keep generated binaries and target directories out of Git; deploy the reviewed source/artifact only after actual account setup and the remaining v2 client/relayer/verifier integration.
