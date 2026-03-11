# ⛓ FundChain — Decentralized Crowdfunding on Stellar

> A trustless crowdfunding dApp built on **Stellar Soroban** smart contracts. Create campaigns, contribute XLM, and withdraw funds — fully on-chain, fully transparent.

---

## 🌐 Live Demo

🔗 **[stellar-fundchain-git-main-rushi380s-projects.vercel.app)**


---

## 🎥 Demo Video

📹 **[https://www.loom.com/share/c523b2ee9ab9485b95bd40900131537c)**


---

## 📸 Test Output Screenshot 


<img width="861" height="483" alt="Screenshot 2026-03-06 182528" src="https://github.com/user-attachments/assets/d308e82a-e6e0-450d-9d72-688369863286" />


---

## 🛠 Tech Stack

| Layer | Technology |
|---|---|
| Smart Contract | Rust + Soroban SDK 23.4.1 → WASM |
| Blockchain | Stellar Testnet |
| Frontend | Vite 5 + Vanilla JavaScript |
| Wallet | Freighter (Stellar), MetaMask, Phantom |
| Stellar SDK | @stellar/stellar-sdk 14.5.0 |
| Deployment | Vercel |

---

## ✨ Features

- 🚀 **Create Campaigns** — Deploy a crowdfunding campaign as a Soroban smart contract
- 💰 **Contribute XLM** — Back campaigns with Stellar's native token
- 🏆 **Withdraw Funds** — Campaign owner withdraws when goal is reached
- 🔄 **Refunds** — Backers get refunded if goal is not met by deadline
- 🔗 **Multi-Wallet** — Freighter, MetaMask, and Phantom support
- 🔍 **Filter & Search** — Browse campaigns by category or keyword
- ⚡ **Real-time Updates** — Optimistic UI updates with on-chain sync

---

## 📁 Project Structure

```
fundchain/
├── contract/                          # Rust Soroban smart contract
│   └── contracts/fundchain/
│       └── src/
│           ├── lib.rs                 # Contract logic
│           └── test.rs                # Rust unit tests
├── frontend/                          # Vite frontend
│   └── src/
│       ├── components/
│       │   ├── App.js                 # Root component
│       │   └── index.js               # UI components
│       ├── utils/
│       │   ├── contractClient.js      # Soroban RPC calls
│       │   ├── walletConnector.js     # Multi-wallet support
│       │   ├── store.js               # Reactive state
│       │   └── cache.js               # Two-layer cache
│       ├── contracts/
│       │   └── FundChain.json         # Contract ID config
│       └── styles/
│           └── main.css               # Dark theme UI
└── tests/
    └── fundchain.test.js              # 10 JS unit tests
```

---

## 🚀 Local Setup

### Prerequisites
- Node.js 20+
- Rust + Cargo
- Stellar CLI
- Freighter browser extension

### 1. Install Rust and Stellar CLI
```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
rustup target add wasm32v1-none
cargo install stellar-cli --features opt
```

### 2. Set up Stellar Testnet identity
```bash
stellar network add --global testnet \
  --rpc-url https://soroban-testnet.stellar.org \
  --network-passphrase "Test SDF Network ; September 2015"

stellar keys generate --global deployer --network testnet --fund
```

### 3. Build and deploy the contract
```bash
cd contract
cargo test
stellar contract build
stellar contract deploy \
  --wasm target/wasm32v1-none/release/fundchain.wasm \
  --source deployer \
  --network testnet \
  --alias fundchain
```

Copy the printed Contract ID.

### 4. Configure the frontend
Paste your Contract ID into `frontend/src/contracts/FundChain.json`:
```json
{
  "contractId": "YOUR_CONTRACT_ID_HERE",
  "network": "testnet",
  "rpcUrl": "https://soroban-testnet.stellar.org",
  "passphrase": "Test SDF Network ; September 2015"
}
```

### 5. Run the frontend
```bash
cd frontend
npm install
npm run dev
```

Open **http://localhost:3000**

### 6. Run tests
```bash
node tests/fundchain.test.js
# → 10 passed, 0 failed
```

---

## 🔑 Smart Contract Functions

| Function | Description | Who can call |
|---|---|---|
| `create_campaign` | Deploy a new campaign | Anyone |
| `contribute` | Send XLM to a campaign | Anyone |
| `withdraw` | Pull funds after goal met | Campaign owner |
| `refund` | Reclaim XLM if goal not met | Backers |
| `get_campaign` | Read campaign data | Anyone |
| `get_campaign_count` | Total campaigns | Anyone |
| `get_contribution` | Check a backer's total | Anyone |

---

## 💡 How It Works

```
User creates campaign
        ↓
Soroban contract stores: title, goal, deadline, raised = 0
        ↓
Backers contribute XLM
        ↓
  ┌─────────────────────────────────┐
  │ Goal reached before deadline?   │
  └─────────────────────────────────┘
        ↓ YES                 ↓ NO
  Owner withdraws      Backers get refund
```

---

## 🌐 Useful Links

| Resource | Link |
|---|---|
| Stellar Testnet Explorer | https://stellar.expert/explorer/testnet |
| Get free testnet XLM | https://friendbot.stellar.org |
| Freighter Wallet | https://freighter.app |
| Soroban Docs | https://developers.stellar.org/docs/smart-contracts |
| GitHub Repo | https://github.com/rushi380/Stellar_Fundchain |

---

## 👤 Author

**Rushikesh** — [@rushi380](https://github.com/rushi380)

---

## 📄 License

MIT — free to use and modify.
