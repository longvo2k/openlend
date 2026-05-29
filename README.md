# OpenLend

Minimal single-asset borrow/lend pool on the [IOPN testnet](https://iopn.gitbook.io/iopn/developer-docs).

Users supply native **OPN** to earn 5% APR. Borrowers post OPN as collateral
and borrow OPN up to 75% LTV. Positions below an 80% liquidation threshold
can be liquidated (50% close factor, 5% bonus to liquidator).

> Educational project. Single-asset, fixed-rate, no oracle.
> See [design spec](docs/superpowers/specs/2026-05-29-iopn-lending-design.md).

## Network

| Field          | Value                                  |
|----------------|----------------------------------------|
| Network        | IOPN Testnet                           |
| Chain ID       | 984                                    |
| RPC            | https://testnet-rpc.iopn.tech          |
| Explorer       | https://testnet.iopn.tech              |
| Faucet         | https://faucet.iopn.tech               |
| Native token   | OPN                                    |

## Setup

```bash
git clone <this repo>
cd openlend
npm install
cp .env.example .env
# edit .env: set PRIVATE_KEY (testnet only — never use a mainnet key)
```

Fund the deployer address from the faucet above.

## Compile & test

```bash
npm run compile
npm run test
npm run coverage
```

## Deploy to IOPN testnet

```bash
npm run deploy:testnet
```

This writes the deployed address to `deployments/iopnTestnet.json`.

## Interact

All amounts are in OPN (decimal strings, e.g. `1.5`).

```bash
# Supply 5 OPN to the pool
npm run supply -- 5

# Withdraw 2 shares
npm run withdraw -- 2

# Deposit 4 OPN collateral and borrow 2 OPN
npm run borrow -- 4 2

# Repay 1 OPN
npm run repay -- 1

# Liquidate a user, paying 0.5 OPN of their debt
npm run liquidate -- 0xUserAddress 0.5
```

## Frontend (optional UI)

A minimal Next.js dApp lives in `frontend/`. To run it:

```bash
# Pre-req: contracts compiled and deployed at least once for the target chain.
npm run compile
npm run deploy:testnet   # (or: npx hardhat run scripts/deploy.ts --network localhost)

cd frontend
cp .env.example .env     # optional — only needed for WalletConnect v2 support
npm install
npm run dev
```

Open http://localhost:3000. Connect a wallet (MetaMask, RainbowKit-supported)
and either approve the IOPN Testnet network prompt or switch manually.
The dApp reads pool/account state directly from the deployed contract via
`deployments/iopnTestnet.json`.

Stack: Next.js 14 + wagmi v2 + RainbowKit + Tailwind. See
[frontend spec](docs/superpowers/specs/2026-05-29-openlend-frontend-design.md).

## Parameters

| Param                   | Value | |
|-------------------------|-------|--|
| Fixed APR               | 5%    | linear |
| Max LTV (borrow)        | 75%   | |
| Liquidation threshold   | 80%   | |
| Liquidation bonus       | 5%    | |
| Close factor            | 50%   | max debt repayable per liquidation |

## Out of scope (v1)

Frontend, multi-asset, price oracle, kinked rate curve, governance,
upgradeability, flash loans. See spec §12.
