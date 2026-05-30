# OpenSwap Frontend — Design Spec (v1.1)

**Project:** OpenSwap Frontend
**Date:** 2026-05-29
**Status:** Approved
**Depends on:** [OpenSwap contracts v1](2026-05-29-openswap-design.md)
**Sibling app:** [OpenLend frontend](https://github.com/longvo2k/openlend/tree/main/frontend) — same stack and design language

## 1. Purpose

A minimal Next.js dApp that lets users interact with the deployed
`OpenSwapPair` (native OPN ↔ mUSDC AMM) on the IOPN testnet. Wallet
connect, swap with slippage control, add/remove liquidity, mUSDC faucet.

Goals:
- Browser UX for the swap/LP/faucet flow proven via CLI scripts in v1.
- Auto-prompt MetaMask / OKX / any RainbowKit wallet to add and switch
  to IOPN testnet (chainId 984).
- Read live pool state from chain; write txs via wagmi.
- Vercel-ready: bundled ABI, env-var addresses, builds standalone from
  `frontend/` root.

Non-goals (v1.1): tx history, price chart, multi-pair, limit orders,
mobile-first redesign, theming.

## 2. Stack

- Next.js 14 App Router, TypeScript strict
- React 18
- wagmi v2 + viem v2
- @rainbow-me/rainbowkit v2
- Tailwind CSS v3
- @tanstack/react-query (wagmi v2 peer)

Located at `frontend/` inside the `openswap` repo.

## 3. Network Config

```ts
// frontend/lib/chains.ts
import { defineChain } from 'viem';

export const iopnTestnet = defineChain({
  id: 984,
  name: 'IOPN Testnet',
  nativeCurrency: { name: 'OPN', symbol: 'OPN', decimals: 18 },
  rpcUrls: { default: { http: ['https://testnet-rpc.iopn.tech'] } },
  blockExplorers: {
    default: { name: 'IOPN Explorer', url: 'https://testnet.iopn.tech' },
  },
  testnet: true,
});
```

Hardhat chain (id 31337) is also registered for local dev.

## 4. Repository Layout

```
openswap/
├── (root — contracts/test/scripts unchanged)
├── frontend/
│   ├── app/
│   │   ├── layout.tsx              # html shell + <Providers>
│   │   ├── providers.tsx           # WagmiProvider + RainbowKit + QueryClient
│   │   ├── page.tsx                # header + PoolStats + tabs
│   │   └── globals.css
│   ├── components/
│   │   ├── ConnectGate.tsx         # wallet + chain guard
│   │   ├── PoolStats.tsx           # reserves, price, fee, total LP, user share
│   │   ├── TabSwitcher.tsx         # Swap | Liquidity | Faucet
│   │   ├── SwapPanel.tsx           # from/to + flip + slippage + CTA
│   │   ├── LiquidityPanel.tsx      # Add/Remove sub-toggle, auto-pair
│   │   ├── FaucetPanel.tsx         # mUSDC mint form
│   │   └── ui/
│   │       ├── TokenInput.tsx      # amount input + suffix + MAX chip
│   │       └── SlippageSelector.tsx
│   ├── lib/
│   │   ├── chains.ts
│   │   ├── wagmi.ts
│   │   ├── contract.ts             # ABIs + per-chain address loader
│   │   ├── format.ts               # bigint <> string helpers
│   │   └── abi/
│   │       ├── OpenSwapPair.json   # bundled (no cross-dir imports)
│   │       └── MockUSDC.json
│   ├── public/
│   │   ├── logo.png                # OpenSwap wordmark (user-supplied)
│   │   └── favicon.png
│   ├── package.json
│   ├── next.config.js
│   ├── tailwind.config.ts
│   ├── postcss.config.js
│   ├── tsconfig.json
│   ├── .env.example
│   └── .gitignore
```

Mirrors OpenLend frontend exactly. Anyone who's worked in OpenLend can
navigate this in seconds.

## 5. Page Composition

Single route `/`:

```
[Header]
  OpenSwap logo  +  RainbowKit ConnectButton

[ConnectGate]
  if not connected: prompt + connect button
  else if chain not in {984, 31337}: prompt to switch
  else: render <Dashboard />

[Dashboard]
  <PoolStats />
  <TabSwitcher>
    <SwapPanel />          // tab="swap"   (default)
    <LiquidityPanel />     // tab="liquidity"
    <FaucetPanel />        // tab="faucet"
  </TabSwitcher>
```

The active tab is held in `useState`; URL hash (`#swap`, `#liquidity`,
`#faucet`) syncs for shareable links.

## 6. ABI + Address Loading

**ABIs:** bundled in `frontend/lib/abi/` from a build-time export of the
Hardhat artifacts. The implementer regenerates the JSON when contract
storage changes; for v1 this is a one-time copy at scaffold time.

**Addresses:** env-var per chain. Sample `.env.example`:
```
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=

# IOPN Testnet (chainId 984)
NEXT_PUBLIC_OPENSWAP_PAIR_TESTNET=
NEXT_PUBLIC_MOCK_USDC_TESTNET=

# Hardhat local (chainId 31337)
NEXT_PUBLIC_OPENSWAP_PAIR_LOCAL=
NEXT_PUBLIC_MOCK_USDC_LOCAL=
```

`lib/contract.ts` exposes:
```ts
export const openSwapPairAbi = OpenSwapPairJson.abi;
export const mockUSDCAbi = MockUSDCJson.abi;
export function getPairAddress(chainId: number): `0x${string}` | null { … }
export function getMockUSDCAddress(chainId: number): `0x${string}` | null { … }
```
Returns `null` when env var is missing or malformed (UI surfaces a
"no deployment found" hint).

A `scripts/sync-address.mjs` helper reads
`../deployments/<network>.json` and writes the right env keys into
`.env.local` — same pattern as OpenLend, two npm scripts:
- `npm run sync:local` → writes `_LOCAL` keys
- `npm run sync:testnet` → writes `_TESTNET` keys

## 7. Component Spec

### 7.1 `ConnectGate.tsx`
Renders children only when wallet is connected AND chain is one of
`{ iopnTestnet.id, 31337 }`. Otherwise renders the appropriate prompt
(connect or switch). Identical to OpenLend's ConnectGate.

### 7.2 `PoolStats.tsx`
Reads via batched `useReadContracts`:
- `pair.getReserves()` → `(reserveOPN, reserveMUSDC, _)`
- `pair.totalSupply()` → total LP
- `pair.balanceOf(user)` → user LP (gated on `useAccount`)

Renders:
- Reserves: `10.5000 OPN` / `1,050.0000 mUSDC`
- Spot price: `1 OPN = 100.00 mUSDC` (computed `reserveMUSDC / reserveOPN`)
- Fee: `0.30%` (static)
- Total LP: `0.0316` (formatted from 1e18-scaled supply minus the
  `address(0xdead)` MINIMUM_LIQUIDITY lock)
- Your share: `100.00%` when user holds all unlocked LP

Refetch every 5 seconds (`refetchInterval: 5000`). Header accent: emerald
(matches the "supply" semantic from OpenLend for visual consistency).

### 7.3 `TabSwitcher.tsx`
Three-button segmented control. Active state highlighted; URL hash
mirrors selection (`#swap`, `#liquidity`, `#faucet`). Renders one of the
three panels as children below.

### 7.4 `SwapPanel.tsx`
State:
```ts
type Direction = 'opn-to-musdc' | 'musdc-to-opn';
const [direction, setDirection] = useState<Direction>('opn-to-musdc');
const [amountIn, setAmountIn] = useState('');
const [slippageBps, setSlippageBps] = useState(100); // 1.00% default
```

Reads (debounced 200ms):
- `pair.quoteSwap(parsedAmountIn, direction === 'opn-to-musdc')` → quote
- `mUSDC.allowance(user, pair)` when direction is mUSDC→OPN

Layout (top-to-bottom):
1. **From input** (`TokenInput`): editable. Suffix = OPN or mUSDC depending on direction. MAX chip = wallet balance.
2. **Flip button**: arrow icon between the two inputs; toggles direction, swaps the two amount fields (clears `amountIn`).
3. **To input** (`TokenInput`): read-only. Shows `quoteSwap` output. Suffix = the other token.
4. **SlippageSelector**: chips `[0.5%][1.0%][3.0%][custom]`. Updates `slippageBps`.
5. **Min received** line: `formatted(quote × (10000 − slippageBps) / 10000)` with the destination token suffix.
6. **Swap button**:
   - If direction is mUSDC→OPN and `allowance < amountIn` → label = "Approve mUSDC", click triggers `mUSDC.approve(pair, MaxUint256)`, then auto-issues the swap once the approval confirms.
   - Otherwise → label = "Swap", click triggers the appropriate swap fn.

Tx state machine identical to OpenLend's ActionPanel: `idle → signing →
pending → success`. On success, refetch PoolStats + AccountStats + clear
`amountIn`.

### 7.5 `LiquidityPanel.tsx`
Sub-toggle at top: `Add | Remove`.

**Add mode** state:
```ts
const [opnAmount, setOpnAmount] = useState('');
const [musdcAmount, setMusdcAmount] = useState('');
const [lastEdited, setLastEdited] = useState<'opn' | 'musdc'>('opn');
```

Auto-pair logic (effect on `[opnAmount, musdcAmount, reserves]`):
- If pool has reserves AND `lastEdited === 'opn'`: set
  `musdcAmount = opnAmount × reserveMUSDC / reserveOPN`.
- If pool has reserves AND `lastEdited === 'musdc'`: set
  `opnAmount = musdcAmount × reserveOPN / reserveMUSDC`.
- If pool is empty (bootstrap): both inputs free; no auto-pair.

Hint line: `You'll receive: <quoteAddLiquidity output> LP shares`.

CTA: "Add Liquidity". Issues `mUSDC.approve` if needed, then
`pair.addLiquidity(mUSDCAmount, { value: opnAmount })`.

**Remove mode** state:
```ts
const [lpAmount, setLpAmount] = useState('');
```

Hint line: shows expected OPN + mUSDC payouts computed locally:
```
opnOut   = lpAmount × reserveOPN   / totalSupply
mUSDCOut = lpAmount × reserveMUSDC / totalSupply
```

CTA: "Remove Liquidity" → `pair.removeLiquidity(parsedLP)`.

### 7.6 `FaucetPanel.tsx`
Single input + button. Default value 10,000 (the cap). MAX chip fills
the cap. Disabled with "Above 10k mUSDC cap" helper when input > cap.
CTA: "Mint mUSDC" → `mUSDC.mint(parsedAmount)`.

### 7.7 `TokenInput.tsx` (reused for all amount inputs)
Props:
```ts
interface TokenInputProps {
  label: string;
  value: string;
  onChange?: (s: string) => void;   // omitted → read-only
  unit: 'OPN' | 'mUSDC' | 'LP';
  disabled?: boolean;
  maxValue?: bigint;
  maxLabel?: string;                // e.g. "Wallet", "Available"
  onMax?: () => void;
  accent?: 'emerald' | 'sky' | 'amber' | 'violet';
}
```

Layout: label row (`label` + optional `MAX` chip) → input box (amount +
right-aligned suffix) → optional `Available: X UNIT` line.

Uses the same accent system as OpenLend's `Field`:
- Swap From: emerald, Swap To: sky
- Add LP: emerald, Remove LP: violet
- Faucet: amber

### 7.8 `SlippageSelector.tsx`
Three chips (`0.5%`, `1.0%`, `3.0%`) + a custom-input chip.
- Clicking a preset sets `slippageBps` to 50 / 100 / 300.
- Selecting "custom" reveals an inline `0.00%` input; clamps 0.01–50%.
- Active chip styled with the active-tab accent.

## 8. Hooks / Data Flow

All reads via `useReadContract` / `useReadContracts` with
`refetchInterval: 5000`. Writes via `useWriteContract` paired with the
public client's `waitForTransactionReceipt` (matches OpenLend's
ActionPanel pattern — avoids render-time side effects).

Hooks:
- `usePoolStats()` → batched reads of reserves + total LP
- `useUserBalances()` → native + mUSDC + LP + mUSDC allowance
- `useSwapQuote(amountIn, direction)` → debounced `quoteSwap`
- `useAddLiquidityQuote(opn, musdc)` → `quoteAddLiquidity`
- `useSlippage()` → small `useState` wrapper exposing `(bps, setBps,
  minOutFor: (quote) => bigint)`

## 9. Math (slippage / price impact)

```
minOut = quoteOut × (10000 − slippageBps) / 10000
```

Default `slippageBps = 100` (1.00%). Custom input clamps `1..5000`.

Optional v1 polish — **price impact** below "Min received":
```
spotOut    = (amountIn × reserveOut) / reserveIn       // pre-fee
priceImpact = 1 − (quoteOut / spotOut)                 // 0..1
```
Display formatted to 2 decimals as a %. Color tone:
- `green` if < 0.5%
- `yellow` if 0.5% – 2.0%
- `red` if ≥ 2.0%

Adds ~20 LOC. Build it if the implementer has time; skip if not.

## 10. Styling

Tailwind v3, no theme overrides beyond what OpenLend uses:
- Background `bg-zinc-950`, body text `text-zinc-100`
- Cards `bg-zinc-900 border border-zinc-800` with a 1px top accent
- Primary CTA `bg-emerald-500 hover:bg-emerald-400 text-black`
- Per-section accent: Swap=emerald, Liquidity=violet, Faucet=amber
- HF coloring not relevant (no liquidations on DEX)

Layout container: `max-w-4xl mx-auto p-6` with `space-y-6`.

## 11. Env / Config

`frontend/.env.example`:
```
# Optional. Get one free at https://cloud.walletconnect.com/.
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=

# IOPN Testnet (chainId 984)
NEXT_PUBLIC_OPENSWAP_PAIR_TESTNET=
NEXT_PUBLIC_MOCK_USDC_TESTNET=

# Hardhat local (chainId 31337)
NEXT_PUBLIC_OPENSWAP_PAIR_LOCAL=
NEXT_PUBLIC_MOCK_USDC_LOCAL=
```

`.gitignore` excludes `node_modules`, `.next`, `.env`, `out`, `coverage`,
`*.tsbuildinfo`, `next-env.d.ts`.

`next.config.js` includes the same MetaMask-SDK fix as OpenLend:
```js
config.resolve.alias = {
  ...config.resolve.alias,
  '@react-native-async-storage/async-storage': false,
};
```

## 12. Build & Run

From `openswap/frontend/`:
```bash
npm install
npm run dev                 # http://localhost:3000
npm run build && npm run start
```

Pre-req from `openswap/` root:
```bash
npm run compile             # generates ABI artifacts (one-time copy to frontend/lib/abi/)
npm run deploy:testnet      # writes deployments/iopnTestnet.json
cd frontend && npm run sync:testnet   # copies addresses to .env.local
```

## 13. Acceptance Criteria

- `npm run build` succeeds with zero TS errors and no warnings beyond
  the known wagmi/MetaMask transitive deprecations.
- Loads at http://localhost:3000.
- "Connect Wallet" opens RainbowKit modal.
- Wrong-chain connect prompts to switch to IOPN testnet (984).
- After deployments + env vars: Pool Stats and per-account reads render
  real numbers.
- **Swap tab**: enters amount → live quote appears → slippage chip
  changes Min received → click "Swap" → wallet pops → tx pending → tx
  confirmed → stats refresh. mUSDC→OPN auto-approves first if allowance
  is short.
- **Liquidity tab — Add**: editing one input auto-fills the other at
  current ratio. Empty pool allows free entry. CTA approves mUSDC if
  needed, then adds.
- **Liquidity tab — Remove**: shows expected payouts pre-submit; CTA
  burns LP and receives both assets.
- **Faucet tab**: mints up to 10,000 mUSDC; over-cap input disables the
  CTA with a helper message.
- Vercel deploy from `frontend/` root with the four address env vars
  set produces a working production build.

## 14. Out of Scope (v1.1)

- Transaction history
- Price chart / TWAP feed
- LP value over time
- Multi-asset / token search
- Slippage warning interstitial
- Limit orders / TWAP / DCA
- Permit2 / ERC2612 signature approvals (full `approve` flow only)
- Mobile-only redesign (default responsive is acceptable)
