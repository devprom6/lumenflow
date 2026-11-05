# Soroban Smart Contracts

> **Status: Scaffolded — requires external audit before mainnet use.**

Contracts live here for fee splitting and time-locked escrow. They are only deployed where native Stellar operations are insufficient.

## Contracts

### fee-splitter
Distributes a token amount proportionally to multiple recipients according to basis-point (bps) shares.
- `initialize(recipients)` — set recipient addresses and their bps shares (must sum to 10 000)
- `split(caller, token, amount)` — pull tokens from caller and fan out to recipients
- `get_recipients()` — read stored recipient list

### escrow
Holds tokens until a Stellar ledger sequence number is reached.
- `initialize(depositor, beneficiary, token, amount, unlock_ledger)` — configure escrow terms
- `deposit()` — depositor transfers tokens into the contract
- `release()` — at or after `unlock_ledger`, beneficiary claims funds
- `refund()` — before `unlock_ledger`, depositor reclaims funds
- `get_state()` — inspect current escrow state

## Prerequisites

```bash
# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Add WebAssembly target
rustup target add wasm32-unknown-unknown

# Install Stellar CLI
cargo install --locked stellar-cli --features opt
```

## Build

```bash
cd contracts

# Build both contracts
cargo build --target wasm32-unknown-unknown --release

# Or use Stellar CLI
stellar contract build
```

Built `.wasm` files appear in `target/wasm32-unknown-unknown/release/`.

## Test

```bash
cd contracts
cargo test
```

## Deploy (Testnet)

```bash
# Deploy fee-splitter
stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/fee_splitter.wasm \
  --network testnet \
  --source <YOUR_SECRET_KEY>

# Deploy escrow
stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/escrow.wasm \
  --network testnet \
  --source <YOUR_SECRET_KEY>
```

## Security

Any contract deployed to **Mainnet** must undergo an independent security audit by a recognized Soroban auditing firm before handling real user funds. See the README for the conditions under which contracts would be added to the production system.

