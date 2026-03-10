# ⛓ FundChain — Stellar Crowdfunding dApp

Decentralized crowdfunding on **Stellar Testnet** using Soroban smart contracts + Vite + Freighter wallet.

## Stack
- **Contract** — Rust + Soroban SDK 23.4.1 → compiled to WASM → deployed on Stellar Testnet
- **Frontend** — Vite 5 + vanilla JS + @stellar/stellar-sdk 14.5.0
- **Wallet** — Freighter (primary), MetaMask, Phantom, Coinbase also supported

## Structure
```
fundchain/
├── contract/     ← Rust/Soroban smart contract
├── frontend/     ← Vite dApp
└── tests/        ← JS unit tests (35 tests, zero deps)
```

## Quick Start

```bash
# 1. Install Rust + Stellar CLI (one time)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
rustup target add wasm32v1-none
cargo install stellar-cli --features opt

# 2. Create & fund a deployer identity
stellar network add --global testnet \
  --rpc-url https://soroban-testnet.stellar.org \
  --network-passphrase "Test SDF Network ; September 2015"
stellar keys generate --global deployer --network testnet --fund

# 3. Build & deploy contract
cd contract
cargo test
stellar contract build
stellar contract deploy \
  --wasm target/wasm32v1-none/release/fundchain.wasm \
  --source deployer --network testnet --alias fundchain

# 4. Save contract ID → frontend
# Copy the printed contract ID into frontend/src/contracts/FundChain.json

# 5. Run frontend
cd ../frontend
npm install
npm run dev          # → http://localhost:3000

# 6. Run JS tests
npm test             # → 35/35 passing
```

## Networks & Faucets
- Stellar Testnet XLM: https://friendbot.stellar.org?addr=YOUR_ADDRESS
- Stellar Expert (explorer): https://stellar.expert/explorer/testnet
- Soroban RPC: https://soroban-testnet.stellar.org