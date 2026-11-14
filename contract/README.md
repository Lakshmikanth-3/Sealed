# Account-bound anchor contract

This is the account-bound Rust v2 deployment target. Workers can approve direct wallet calls; an invited NEP-366 relay is separately supported.

1. Install Rust using [rustup](https://rustup.rs/). The repository pins Rust 1.95.0 and the WASM target in `rust-toolchain.toml`.
2. Install the native `cargo-near` 0.23.0 tool from its [official release](https://github.com/near/cargo-near/releases/tag/cargo-near-v0.23.0). The Node wrapper locates it on PATH or in the normal per-user `.cargo/bin` directory; an explicit `CARGO_NEAR` path can also be supplied. The application does not depend on the npm installer wrapper.
3. From the project root, run `npm run contract:build`. It uses the checked-in Cargo lockfile and cargo-near's WASM optimization step. Expected output is `contract/build/appeal_anchors.wasm`; the wrapper checks required exports and prints its actual SHA-256 hash.
4. Run `npm run contract:test` for the SDK host tests. On Windows, the native SDK test dependencies require Visual Studio C++ build tools and [NASM](https://www.nasm.us/); make NASM available on PATH. These are not a sandbox-chain execution or a deployed transaction.
5. Before deploying, supply actual owner/contract accounts, chosen storage capacities and a funded dedicated testnet sponsor. Keep keys in local secret configuration. A deployment must initialize `new` in the deployment transaction, signed by the contract account, with the actual `owner`, `network`, `max_workers`, and `max_days_per_worker`. No invented account or capacity value is provided here.

Do not deploy to an existing v1 contract account expecting state compatibility. Mainnet deployment and funding need explicit owner authorization. Build artifacts and compiler output are ignored by Git; source and `Cargo.lock` are retained.

See [the ownership protocol](../docs/OWNERSHIP-PROTOCOL.md) for what the contract proves, authorization boundaries and remaining integration work.

Use `npm run contract:deploy` to print a deployment plan. Broadcasting requires the separate explicit `--broadcast` operation; see [live setup](../docs/LIVE-SETUP.md).
