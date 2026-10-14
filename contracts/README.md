# Soroban Smart Contracts

> **Status: Not part of the MVP.**

Soroban contracts will only be introduced where native Stellar operations are
insufficient (for example fee splitting or escrow). Each contract will require
full tests and an independent audit before mainnet use.

## Prerequisites

- [Rust](https://www.rust-lang.org/tools/install) (stable)
- [Stellar CLI](https://developers.stellar.org/docs/tools/stellar-cli)

## Structure (future)

```
contracts/
├── fee-splitter/     # Split platform fee among recipients
└── escrow/           # Time-locked escrow for OTC / bridge flows
```

## Commands (future)

```bash
pnpm contracts:build   # cargo build --target wasm32-unknown-unknown --release
pnpm contracts:test    # cargo test
```

No contracts are implemented at this stage. See the README and Plan for the
conditions under which they would be added.
