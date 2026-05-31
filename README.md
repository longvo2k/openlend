# Stratus

A minimal DeFi suite on the [IOPN testnet](https://iopn.gitbook.io/iopn/developer-docs).
Three primitives shipped from a single repo:

- **Lend** — single-asset native-OPN borrow/lend pool. Supply OPN to
  earn 5% APR, or post OPN as collateral and borrow OPN up to 75% LTV.
  Liquidations: 80% threshold, 50% close factor, 5% bonus.
- **Swap** — UniV2-style constant-product AMM trading native OPN
  against **mUSDC** (a 6-decimal mock USDC with an open faucet). 0.30%
  swap fee retained for LPs.
- **Leveraged LP** — strategy composer layered on top of Lend +
  Swap. Loop borrow → swap → LP to lever an OPN/mUSDC LP position.

> Educational projects. Single-asset / single-pair, fixed-rate, no oracle.
> Specs: [Lend](docs/superpowers/specs/2026-05-29-iopn-lending-design.md),
> [Swap](docs/superpowers/specs/2026-05-29-openswap-design.md).

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
cd stratus
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

### Lend

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

### Swap

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

A unified Next.js dApp for the whole suite lives in `frontend/`. Three
top-level sidebar sections:

- **Lending** → Dashboard (pool TVL + utilization chart + account stats),
  Supply, Withdraw, Borrow, Repay, Liquidate, History
- **Trade** → Swap, Liquidity (add/remove), Faucet (mint mUSDC)
- **Strategy** → Positions (open-position dashboard with live HF),
  Leveraged LP (open + close/rebalance composer)

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
[Lend frontend](docs/superpowers/specs/2026-05-29-openlend-frontend-design.md)
and [Swap frontend](docs/superpowers/specs/2026-05-29-openswap-frontend-design.md).

### Strategy: Leveraged LP, Close/Rebalance, and Positions

A cross-protocol composer lives at `#leveraged-lp` (Sidebar → Strategy →
Leveraged LP). The panel has an **Open** mode and a **Close / Rebalance**
mode, switched via a pill toggle in the header.

**Open** runs a 4-step sequence: deposit OPN as collateral on Lend,
borrow OPN against it (up to 70% LTV in the UI, 5 pp below the protocol
cap for HF headroom), optionally approve mUSDC, then add OPN+mUSDC
liquidity to Swap. The panel previews the resulting health factor, LP
shares, and debt before any wallet signing, and surfaces a per-step
status list with explorer-linked tx hashes.

**Close / Rebalance** runs the inverse: a 0–100% LP-burn slider drives
a 3-step unwind (remove liquidity, repay debt with the received OPN,
withdraw collateral). The collateral-withdraw amount is computed to
preserve the pre-close health factor, so any partial close is a true
rebalance rather than a leverage shift. Steps that would no-op (no
debt to repay, no collateral to withdraw) are skipped automatically.

Frontend-only orchestration — no router contract — so each step records
correctly under the user's address.

The **Positions** view at `#positions` (Sidebar → Strategy → Positions)
surfaces the active Leveraged LP position with live collateral, debt,
LP balance, derived mUSDC-equivalent net value, and a color-coded
Health Factor badge. Risk banners appear when HF drops below 1.2
(warning) or below 1.0 (liquidatable). The "Manage position" CTA
deep-links back into the composer.

### Price oracle (testnet stopgap)

`contracts/PriceOracle.sol` is a single-price admin-set oracle for the
OPN/mUSDC pair with a 1-hour propose-then-commit timelock. The current
price surfaces as the bottom row of the Lending Dashboard's PoolStats
card. v1 has no contract consumers; multi-asset lending will integrate
it later when Pyth or another external feed is unavailable on IOPN.

Owner-only CLI flow (current Hardhat 2.28 ignores positional script
args, so the propose price is passed via the `ORACLE_PRICE` env var):

```bash
npm run oracle:show
ORACLE_PRICE=105 npm run oracle:propose       # propose 105 mUSDC per OPN
# ... wait at least one hour ...
npm run oracle:commit
# or, to back out before commit:
npm run oracle:cancel
```

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

### Lend

| Param                   | Value | |
|-------------------------|-------|--|
| Fixed APR               | 5%    | linear |
| Max LTV (borrow)        | 75%   | |
| Liquidation threshold   | 80%   | |
| Liquidation bonus       | 5%    | |
| Close factor            | 50%   | max debt repayable per liquidation |

### Swap (AMM)

| Param                | Value | |
|----------------------|-------|--|
| Swap fee             | 0.30% | retained in pool, accrues to LPs |
| MINIMUM_LIQUIDITY    | 1000  | wei-LP locked at first add (anti-inflation) |
| OPN decimals         | 18    | native |
| mUSDC decimals       | 6     | matches real USDC |
| Max mint per call    | 10,000 mUSDC | open faucet on `MockUSDC` |

## Out of scope

Lend: multi-asset, price oracle, kinked rate curve, governance,
upgradeability, flash loans. Swap: factory, router/multi-hop, TWAP
oracle, flash swaps, protocol-fee toggle, WOPN wrapped token. See each
spec's §12.
