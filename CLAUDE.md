# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project: Stratus

A three-primitive DeFi suite on IOPN testnet (chainId 984). One repo holds the contracts, deployment scripts, and a unified Next.js dApp:

- **Lend** (`contracts/LendingPool.sol`) — single-asset native-OPN borrow/lend pool. Compound v2-style global `borrowIndex` (1e18-scaled) for lazy linear interest accrual. Fixed 5% APR, 75% LTV, 80% liquidation threshold, 50% close factor, 5% bonus.
- **Swap** (`contracts/OpenSwapPair.sol`) — UniV2-style constant-product AMM for native OPN ↔ mUSDC. 0.30% fee, ERC20 LP token (OSP-LP), uint112 packed reserves. MINIMUM_LIQUIDITY locked to `address(0xdead)` because OpenZeppelin v5 rejects `_mint(address(0), ...)`.
- **MockUSDC** (`contracts/MockUSDC.sol`) — 6-decimal ERC20 with open faucet capped at 10,000 mUSDC per call.

Frontend (`frontend/`) composes all three on top of a flat sidebar with three sections: **Lending / Trade / Strategy**.

## Common commands

### Root (Hardhat workspace)

```bash
npm run compile             # hardhat compile
npm run test                # full test suite (also: npx hardhat test test/LendingPool.test.ts)
npm run coverage            # solidity-coverage
npm run deploy:testnet      # deploys all 3 contracts, writes deployments/iopnTestnet.json
npx hardhat run scripts/deploy.ts --network localhost   # for a local node
npx hardhat verify --network iopnTestnet <ADDRESS>      # source verification on testnet.iopn.tech
```

Interaction scripts take CLI args after `--`:

```bash
npm run supply -- 5
npm run borrow -- 4 2                # 4 OPN collateral, borrow 2 OPN
npm run liquidate -- 0xUser 0.5
npm run faucet -- 10000
npm run add-liquidity -- 10 1000     # 10 OPN + 1000 mUSDC
npm run swap-opn-for-musdc -- 1 90   # amountIn minOut
```

Run a single Mocha test by name: `npx hardhat test --grep "liquidation"`.

### Frontend (`frontend/`)

```bash
npm run dev
npm run build
npm run typecheck
npm run sync:testnet         # copies deployments/iopnTestnet.json → .env.local (TESTNET keys)
npm run sync:local           # copies deployments/hardhat.json → .env.local (LOCAL keys)
```

There is no lint/test script in the frontend package — `typecheck` is the only static check. Treat `tsc --noEmit` as the gate.

## Deploy → frontend address flow

This is the **only** correct way to wire a fresh deploy to the dApp. Don't hand-edit `.env.local`.

1. `npm run deploy:testnet` writes `deployments/iopnTestnet.json` with `lendingPool`, `mUSDC`, `openSwapPair`.
2. `cd frontend && npm run sync:testnet` rewrites `.env.local` with the three `NEXT_PUBLIC_*_TESTNET` keys.
3. On Vercel: those same three keys must be set under **Settings → Environment Variables**, then redeploy.

Every fresh deploy mints new contract addresses. The Vercel env vars MUST be updated each time or the dApp will say "No deployment for chainId 984".

## Critical: static `process.env` access in `frontend/lib/contract.ts`

Next.js inlines `NEXT_PUBLIC_*` env vars at build time **only when accessed as a literal member expression**. Dynamic access (`process.env[varName]`) returns `undefined` in the browser bundle.

`getLendingPoolAddress`, `getPairAddress`, and `getMockUSDCAddress` are deliberately not DRY'd — each branch reads `process.env.NEXT_PUBLIC_LENDING_POOL_ADDRESS_TESTNET` etc. as static literals. Do not refactor these into a helper that takes the key as a string parameter, or addresses will silently become `null` in production.

## Architecture notes

**ABIs are bundled, not symlinked.** `frontend/lib/abi/*.json` are copies committed to git. The frontend never imports from `../artifacts` or `../deployments` — that decoupling is what makes the frontend buildable in isolation on Vercel with Root Directory = `frontend/`.

**Routing is flat hash-based.** `frontend/lib/route.ts` defines `Route = 'lend:dashboard' | 'lend:supply' | ... | 'strategy:leveraged-lp'` (11 routes). `useHashRoute()` reads/writes `window.location.hash` via `replaceState`. No Next.js dynamic routes; the whole app is one `app/page.tsx` switching on the route string.

**Strategy composer has no router contract.** `frontend/components/strategy/LeveragedLPPanel.tsx` orchestrates four sequential transactions (deposit → borrow → approve mUSDC → addLiquidity) entirely client-side, using `writeContractAsync` + `publicClient.waitForTransactionReceipt` between steps. Each tx is signed by the user under their own address, so events attribute correctly.

**History view uses the explorer API, not RPC.** `frontend/lib/history.ts` calls `https://testnet.iopn.tech/api?module=logs&action=getLogs` in one HTTP request, then decodes with viem's `decodeEventLog` and filters client-side. Do not replace this with chunked `eth_getLogs` — IOPN RPC silently caps log ranges and the chunked version generates ~330 calls per refetch.

**Decimal handling.** OPN is 18 decimals, mUSDC is 6, LP token is 18. `frontend/lib/format.ts` has dedicated `formatOPN` / `formatMUSDC` / `formatLP` and matching `parse*` functions — always use these, never raw `formatUnits(x, 18)`.

**MetaMask SDK build workaround.** `frontend/next.config.js` aliases `@react-native-async-storage/async-storage` to `false`. Without this, `npm run build` fails on Vercel even though local dev works.

**Two reentrancy attacker contracts.** `contracts/test/MaliciousReceiver.sol` targets LendingPool; `contracts/test/MaliciousSwapAttacker.sol` targets OpenSwapPair. The Swap one was renamed during the OpenLend+OpenSwap merge to avoid a Solidity name collision — keep them distinct.

**Cannot short OPN with single-asset lending.** Depositing OPN to borrow OPN and swap to mUSDC leaves a net long OPN position (collateral minus borrowed). True shorting requires multi-asset lending (deposit mUSDC, borrow OPN) and is roadmapped to 2027.

## Conventions

**Icons: lucide-react only.** Per persistent user instruction (`memory/MEMORY.md`), every icon in the frontend uses `lucide-react`'s `LucideIcon` type. No inline SVG. No other icon libraries.

**Theme.** Light only — `bg-white text-black` shell, `bg-black text-white` active pills, Tailwind v3.

**Transaction state machines.** All write-flow panels (ActionPanel, SwapPanel, LiquidityPanel, FaucetPanel, LeveragedLPPanel) use the same shape: `Phase = 'idle' | 'signing' | 'pending' | 'success'` with `writeContractAsync` → `waitForTransactionReceipt` → success. Follow this pattern for new write flows.

## Network

| Field        | Value                          |
|--------------|--------------------------------|
| Chain ID     | 984                            |
| RPC          | https://testnet-rpc.iopn.tech  |
| Explorer     | https://testnet.iopn.tech      |
| Faucet (OPN) | https://faucet.iopn.tech       |
| Explorer API | Etherscan-compatible, no API key needed |

Verified contracts:
- LendingPool: `0x55E64b4786966219fb1501094472D356046F864F`
- OpenSwapPair: `0x4A5d5Ea0bE6ac98682D28526F02217e6Fc977B12`
- MockUSDC: `0xFFff7761b5e662D26C7C51C9F80f1324F5e43c00`

## Design docs

Full specs and impl plans under `docs/superpowers/specs/` and `docs/superpowers/plans/` — read these before substantial changes to a primitive's economics, parameters, or invariants.

## Roadmap

`ROADMAP.md` at the repo root is the canonical roadmap. Rules when editing it or any submission-form content (the roadmap file itself stays clean of meta-notes):

- **No em-dashes (`—`).** Use colons, commas, periods, or "and".
- **No Shipped section.** When an item ships, drop the bullet. README + submission description carry the shipped narrative.
- **Keep the *caveat* paragraph honest** about solo / part-time scope. Oracle dependency is real.
- **True shorts stay in 2027.** Single-asset OPN lending cannot do true shorts (depositing OPN to borrow OPN and swap leaves net long). Any "short" feature requires multi-asset lending.
