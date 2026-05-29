# OpenLend Frontend — Design Spec (v1.1)

**Project:** OpenLend Frontend
**Date:** 2026-05-29
**Status:** Approved
**Depends on:** [OpenLend contracts v1](2026-05-29-iopn-lending-design.md)

## 1. Purpose

A minimal Next.js dApp that lets users interact with the deployed `LendingPool`
contract on IOPN testnet. Wallet connect, supply/withdraw/borrow/repay, live
account + pool stats. No charts, no history, no admin.

Goals:
- Browser UX for the contract loop already proven via CLI scripts in v1.
- Auto-prompt MetaMask (or any injected/RainbowKit wallet) to add and switch
  to IOPN testnet (chainId 984).
- Read live state from chain; write txs via wagmi.

Non-goals (v1.1): liquidation UI (CLI suffices for now), tx history,
charts/analytics, multi-asset, mobile-first redesign, theming.

## 2. Stack

- Next.js 14 App Router, TypeScript strict
- React 18
- wagmi v2 + viem v2
- @rainbow-me/rainbowkit v2
- Tailwind CSS v3
- `@tanstack/react-query` (wagmi v2 dep)

Located at `frontend/` inside the existing `iopn-builders` monorepo.

## 3. Network Config

```ts
// frontend/lib/chains.ts
export const iopnTestnet = {
  id: 984,
  name: 'IOPN Testnet',
  nativeCurrency: { name: 'OPN', symbol: 'OPN', decimals: 18 },
  rpcUrls: { default: { http: ['https://testnet-rpc.iopn.tech'] } },
  blockExplorers: { default: { name: 'IOPN Explorer', url: 'https://testnet.iopn.tech' } },
  testnet: true,
} as const;
```

The local Hardhat chain (`id: 31337`) is also added for local dev.

## 4. Repository Layout

```
iopn-builders/
├── (root — contracts/test/scripts unchanged)
├── frontend/
│   ├── app/
│   │   ├── layout.tsx              # html shell + Providers
│   │   ├── providers.tsx           # WagmiProvider + RainbowKitProvider + QueryClientProvider
│   │   ├── page.tsx                # main dApp page
│   │   └── globals.css             # tailwind directives
│   ├── components/
│   │   ├── ConnectGate.tsx         # gate: wallet connected + on right chain
│   │   ├── AccountStats.tsx
│   │   ├── PoolStats.tsx
│   │   └── ActionPanel.tsx         # one card per action, configurable
│   ├── lib/
│   │   ├── chains.ts               # iopnTestnet definition
│   │   ├── wagmi.ts                # getDefaultConfig({ chains, projectId, transports })
│   │   ├── contract.ts             # address loader + ABI import
│   │   └── format.ts               # formatOPN, parseOPN, formatHF, formatBps
│   ├── public/                     # static assets (favicon)
│   ├── package.json
│   ├── next.config.js
│   ├── tailwind.config.ts
│   ├── postcss.config.js
│   ├── tsconfig.json
│   ├── .env.example                # NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID, NEXT_PUBLIC_CHAIN_ID
│   └── .gitignore                  # node_modules, .next, .env
```

## 5. ABI + Address Loading

**ABI:**
Imported directly from the compiled artifact:
```ts
import LendingPoolJson from '../../artifacts/contracts/LendingPool.sol/LendingPool.json';
export const lendingPoolAbi = LendingPoolJson.abi as const;
```
Hardhat compile must have run; the artifact path is gitignored but is
guaranteed by the dev/build flow (`npm run compile` from root before
`npm run dev` in frontend).

**Address:**
```ts
// frontend/lib/contract.ts (sketch)
import iopn from '../../deployments/iopnTestnet.json' assert { type: 'json' };
import hardhat from '../../deployments/hardhat.json' assert { type: 'json' };
export function getLendingPoolAddress(chainId: number): `0x${string}` {
  if (chainId === 984) return iopn.lendingPool;
  if (chainId === 31337) return hardhat.lendingPool;
  throw new Error(`Unsupported chain ${chainId}`);
}
```
Both deployments files are gitignored; the user must run the deploy script
once per chain before the frontend can read an address. Missing-file errors
surface a clear UI message.

## 6. Page Composition

Single route: `/` rendered server-side then hydrated.

```
[Header]
  OpenLend logo + RainbowKit ConnectButton

[ConnectGate]
  if !connected: prompt to connect
  else if chainId !== 984: prompt to switch network
  else: render <Dashboard />

[Dashboard]
  <PoolStats />          // totalSupplied, totalBorrowed, available, APR
  <AccountStats />       // user collateral, debt, HF, shares, OPN balance
  <Actions>
    <ActionPanel kind="supply" />
    <ActionPanel kind="withdraw" />
    <ActionPanel kind="borrow" />
    <ActionPanel kind="repay" />
  </Actions>
```

## 7. Hooks / Data Flow

All reads via `useReadContract`, refreshed on every block:
- `usePoolStats()` → reads `totalSupplied`, `totalBorrowed`, `borrowIndex`
- `useAccountData(address)` → reads `getAccountData(user)` + native balance
- `useExchangeRate()` → reads `exchangeRate()`

All writes via `useWriteContract`:
- Supply: `pool.supply({ value })`
- Withdraw: `pool.withdraw(shares)`
- Borrow path: two-step — `pool.depositCollateral({ value })` then `pool.borrow(amount)`
- Repay: `pool.repay({ value })`

Tx status via `useWaitForTransactionReceipt`. UI states: idle → signing →
pending → success | error. After success, invalidate read queries.

## 8. Component Spec

### 8.1 `ConnectGate.tsx`
Renders children only when `useAccount().isConnected && chain?.id === 984`.
Otherwise renders a centered call to action (connect / switch).

### 8.2 `PoolStats.tsx`
Card showing:
- Total supplied (OPN)
- Total borrowed (OPN)
- Available liquidity (OPN)
- Fixed APR: `5.00%`
- Utilization (computed: totalBorrowed / totalSupplied * 100%)

### 8.3 `AccountStats.tsx`
Card showing:
- Wallet OPN balance
- Collateral deposited
- Debt outstanding
- Supply shares
- Health factor (display "∞" when no debt; format to 2 decimals otherwise;
  red text when < 1.0, yellow < 1.2, else green)

### 8.4 `ActionPanel.tsx`
Reusable card, props:
```ts
type ActionKind = 'supply' | 'withdraw' | 'borrow' | 'repay';
interface Props {
  kind: ActionKind;
}
```
- `supply`: single input (OPN), button → `supply({ value })`
- `withdraw`: single input (shares), button → `withdraw(shares)`
- `borrow`: two inputs (collateral OPN, borrow OPN), button → two sequential txs
- `repay`: single input (OPN), button → `repay({ value })`

Each shows tx status inline + the resulting tx hash with a link to the
IOPN explorer.

### 8.5 `format.ts`
- `formatOPN(wei: bigint, decimals = 4): string` — e.g. `1.2345`
- `parseOPN(s: string): bigint` — wraps `parseEther`
- `formatHF(hf: bigint): string` — `∞` for `MaxUint256`, else `(hf / 1e18).toFixed(2)`
- `bpsToPct(bps: number): string` — e.g. 500 → `5.00%`

## 9. Styling

Tailwind v3 with default config. Color palette:
- Background: `bg-zinc-950`
- Text: `text-zinc-100`
- Cards: `bg-zinc-900` w/ `border-zinc-800` 1px
- Primary button: `bg-emerald-500 hover:bg-emerald-400 text-black`
- Inputs: `bg-zinc-950` w/ `border-zinc-700`
- Health factor coloring as in §8.3

Layout: max-width container `max-w-4xl mx-auto p-6`, vertical stack with `gap-6`.

No animations beyond Tailwind defaults.

## 10. Env / Config

`frontend/.env.example`:
```
# Get one free at https://cloud.walletconnect.com/
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=
```

Frontend `.gitignore`: `node_modules`, `.next`, `.env`, `out`, `coverage`.

## 11. Build & Run

From `frontend/`:
- `npm install`
- `npm run dev` — local dev server at http://localhost:3000
- `npm run build && npm run start` — production

Pre-req from root:
- `npm run compile` (so artifact ABI exists)
- `npm run deploy:testnet` (so address exists in deployments/iopnTestnet.json)

## 12. Acceptance Criteria

- `npm run build` in `frontend/` succeeds with no TS errors.
- Loads at http://localhost:3000.
- "Connect Wallet" opens RainbowKit modal.
- After connecting on the wrong chain, prompts to switch to IOPN testnet (984).
- After deployment exists, the Pool and Account stats render real numbers.
- Each of the 4 actions:
  - Validates input (rejects 0, NaN, negatives).
  - Pops the wallet for signature.
  - Shows tx pending → confirmed (or error).
  - Refreshes stats automatically after confirmation.
- No console errors during golden path.

## 13. Open Questions

None blocking. WalletConnect project ID is optional — RainbowKit works
without one but loses the WalletConnect option (injected/MetaMask still
fine). For v1.1 we proceed without requiring a project ID; users who want
WC v2 can add one to `.env`.

## 14. Out of Scope (v1.1)

Liquidation UI, transaction history, charts, multi-asset routing, slippage
controls, theming, i18n, mobile-only redesign. All defer to v1.2+.
