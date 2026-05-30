# OpenLend + OpenSwap

Two minimal DeFi primitives on the [IOPN testnet](https://iopn.gitbook.io/iopn/developer-docs)
shipped from a single repo:

- **OpenLend** — single-asset native-OPN borrow/lend pool. Supply OPN to
  earn 5% APR, or post OPN as collateral and borrow OPN up to 75% LTV.
  Liquidations: 80% threshold, 50% close factor, 5% bonus.
- **OpenSwap** — UniV2-style constant-product AMM trading native OPN
  against **mUSDC** (a 6-decimal mock USDC with an open faucet). 0.30%
  swap fee retained for LPs.

> Educational projects. Single-asset / single-pair, fixed-rate, no oracle.
> Specs: [OpenLend](docs/superpowers/specs/2026-05-29-iopn-lending-design.md),
> [OpenSwap](docs/superpowers/specs/2026-05-29-openswap-design.md).

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

## Verify on the explorer

The IOPN testnet explorer (`testnet.iopn.tech`) speaks the standard
Etherscan-compatible `/api` endpoint. After deploy:

```bash
npx hardhat verify --network iopnTestnet <CONTRACT_ADDRESS>
```

No API key is required. On success the explorer's contract page exposes a
**Code** tab with the verified source. Example (already verified):
[testnet.iopn.tech/address/0xdb721210c52d64329468975e9e46D39233d36a5d#code](https://testnet.iopn.tech/address/0xdb721210c52d64329468975e9e46D39233d36a5d#code).

## Interact

All amounts are decimal strings (`1.5`, etc). OPN is 18-decimals; mUSDC is 6-decimals.

### OpenLend

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

### OpenSwap

```bash
# Mint 10,000 mUSDC to the deployer wallet (open faucet, max 10k per call)
npm run faucet -- 10000

# Seed pool: 10 OPN + 1,000 mUSDC (sets initial price ≈ 100 mUSDC / OPN)
npm run add-liquidity -- 10 1000

# Swap 1 OPN for at least 90 mUSDC
npm run swap-opn-for-musdc -- 1 90

# Swap 100 mUSDC for at least 0.9 OPN
npm run swap-musdc-for-opn -- 100 0.9

# Burn 0.5 LP shares back to OPN + mUSDC
npm run remove-liquidity -- 0.5
```

## Frontend (optional UI)

A unified Next.js dApp for both protocols lives in `frontend/`. Two top-level
sections (**Lend** / **Swap**) with sub-tabs:

- **Lend** → Dashboard, Actions (Supply/Withdraw/Borrow/Repay), Liquidate, History
- **Swap** → Swap, Liquidity (add/remove), Faucet (mint mUSDC)

To run it:

```bash
# Pre-req: contracts compiled and deployed at least once for the target chain.
npm run compile
npm run deploy:testnet   # (or: npx hardhat run scripts/deploy.ts --network localhost)

cd frontend
npm install
npm run sync:testnet     # copies all 3 addresses from ../deployments/iopnTestnet.json → .env.local
cp .env.example .env     # optional — only needed for WalletConnect v2 support
npm run dev
```

Open http://localhost:3000. Connect a wallet (MetaMask, OKX, RainbowKit-supported)
and either approve the IOPN Testnet network prompt or switch manually.

Stack: Next.js 14 + wagmi v2 + RainbowKit + Tailwind. See specs for
[OpenLend frontend](docs/superpowers/specs/2026-05-29-openlend-frontend-design.md)
and [OpenSwap frontend](docs/superpowers/specs/2026-05-29-openswap-frontend-design.md).

### Deploying the frontend to Vercel

1. Import the GitHub repo at https://vercel.com/new.
2. Set **Root Directory** to `frontend`.
3. Set environment variables under **Settings → Environment Variables**.
   All addresses come from `deployments/iopnTestnet.json` after
   `npm run deploy:testnet`:
   - `NEXT_PUBLIC_LENDING_POOL_ADDRESS_TESTNET` — deployed LendingPool
   - `NEXT_PUBLIC_OPENSWAP_PAIR_TESTNET` — deployed OpenSwapPair
   - `NEXT_PUBLIC_MOCK_USDC_TESTNET` — deployed MockUSDC
   - `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` — *recommended*. Create a free
     project at https://cloud.walletconnect.com/ and paste the
     32-character ID. Without this the dApp still works (MetaMask /
     OKX / injected wallets all connect), but the browser console will
     show noisy `403`/`400` errors from WalletConnect's config endpoint.
4. Click **Deploy**.

## Parameters

### OpenLend (lending)

| Param                   | Value | |
|-------------------------|-------|--|
| Fixed APR               | 5%    | linear |
| Max LTV (borrow)        | 75%   | |
| Liquidation threshold   | 80%   | |
| Liquidation bonus       | 5%    | |
| Close factor            | 50%   | max debt repayable per liquidation |

### OpenSwap (AMM)

| Param                | Value | |
|----------------------|-------|--|
| Swap fee             | 0.30% | retained in pool, accrues to LPs |
| MINIMUM_LIQUIDITY    | 1000  | wei-LP locked at first add (anti-inflation) |
| OPN decimals         | 18    | native |
| mUSDC decimals       | 6     | matches real USDC |
| Max mint per call    | 10,000 mUSDC | open faucet on `MockUSDC` |

## Out of scope

OpenLend: multi-asset, price oracle, kinked rate curve, governance,
upgradeability, flash loans. OpenSwap: factory, router/multi-hop, TWAP
oracle, flash swaps, protocol-fee toggle, WOPN wrapped token. See each
spec's §12.
