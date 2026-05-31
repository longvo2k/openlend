# Leveraged LP Composer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Strategy > Leveraged LP composer panel that orchestrates a 4-step user-signed transaction sequence across `LendingPool` + `OpenSwapPair`: deposit OPN collateral → borrow OPN → (optionally approve mUSDC) → add OPN/mUSDC liquidity.

**Architecture:** Frontend only — no new Solidity contracts. A new React panel runs each step as a sequential `writeContractAsync` call against the existing deployed contracts. A new `strategy` section is added to the sidebar with a single `Leveraged LP` entry routed via the existing flat-hash `useHashRoute` hook.

**Tech Stack:** Next.js 14 App Router + TypeScript strict + wagmi v2 + viem v2 + RainbowKit + Tailwind (all already in the project — no new deps).

**Spec reference:** [docs/superpowers/specs/2026-05-31-composer-leveraged-lp-design.md](../specs/2026-05-31-composer-leveraged-lp-design.md)

---

## File Map

| File | Responsibility |
|------|----------------|
| `frontend/lib/route.ts` | Add `strategy` section + `strategy:leveraged-lp` route + `#leveraged-lp` hash |
| `frontend/components/Sidebar.tsx` | Add STRATEGY group with one `Leveraged LP` entry |
| `frontend/components/strategy/LeveragedLPPanel.tsx` | The composer panel (inputs, preview, status list, execute handler) |
| `frontend/app/page.tsx` | Render `LeveragedLPPanel` for `strategy:leveraged-lp` |
| `README.md` | Frontend section addendum noting the new strategy |

No contract changes, no test files. Verification per task: `npm run typecheck` clean.

---

## Task 1: Route + section type for `strategy:leveraged-lp`

**Files:**
- Modify: `frontend/lib/route.ts`

- [ ] **Step 1: Open `frontend/lib/route.ts` and replace its contents with:**

```ts
'use client';

import { useEffect, useState } from 'react';

export type Route =
  | 'lend:dashboard'
  | 'lend:supply'
  | 'lend:withdraw'
  | 'lend:borrow'
  | 'lend:repay'
  | 'lend:liquidate'
  | 'lend:history'
  | 'swap:swap'
  | 'swap:liquidity'
  | 'swap:faucet'
  | 'strategy:leveraged-lp';

export type Section = 'lend' | 'swap' | 'strategy';
export type ActionKind = 'supply' | 'withdraw' | 'borrow' | 'repay';

export function sectionOf(route: Route): Section {
  if (route.startsWith('swap:')) return 'swap';
  if (route.startsWith('strategy:')) return 'strategy';
  return 'lend';
}

/* ----------------------------- Hash routing ----------------------------- */

const HASH_TO_ROUTE: Record<string, Route> = {
  dashboard: 'lend:dashboard',
  supply: 'lend:supply',
  withdraw: 'lend:withdraw',
  borrow: 'lend:borrow',
  repay: 'lend:repay',
  liquidate: 'lend:liquidate',
  history: 'lend:history',
  swap: 'swap:swap',
  liquidity: 'swap:liquidity',
  faucet: 'swap:faucet',
  'leveraged-lp': 'strategy:leveraged-lp',
};

const ROUTE_TO_HASH: Record<Route, string> = Object.fromEntries(
  Object.entries(HASH_TO_ROUTE).map(([k, v]) => [v, k]),
) as Record<Route, string>;

function routeFromHash(hash: string): Route {
  const h = hash.replace('#', '');
  return HASH_TO_ROUTE[h] ?? 'lend:dashboard';
}

export function useHashRoute(): {
  route: Route;
  setRoute: (r: Route) => void;
} {
  const [route, setRoute] = useState<Route>('lend:dashboard');

  useEffect(() => {
    const sync = () => setRoute(routeFromHash(window.location.hash));
    sync();
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, []);

  return {
    route,
    setRoute(r: Route) {
      setRoute(r);
      if (typeof window !== 'undefined') {
        history.replaceState(null, '', `#${ROUTE_TO_HASH[r]}`);
      }
    },
  };
}
```

- [ ] **Step 2: Typecheck**

```bash
cd /Users/long/Code/personal/iopn-builders/frontend && npm run typecheck
```

Expected: no errors. (page.tsx and Sidebar.tsx don't yet reference the new route, so they keep compiling.)

- [ ] **Step 3: Commit**

```bash
cd /Users/long/Code/personal/iopn-builders
git add frontend/lib/route.ts
git -c user.email=vvlong.2k@gmail.com -c user.name="vvlong" commit -m "feat(frontend): add strategy:leveraged-lp route + #leveraged-lp hash"
```

---

## Task 2: Sidebar STRATEGY group

**Files:**
- Modify: `frontend/components/Sidebar.tsx`

- [ ] **Step 1: Open `frontend/components/Sidebar.tsx` and find the `GROUPS` constant. Replace the array with:**

```ts
const GROUPS: NavGroup[] = [
  {
    title: 'Lend',
    items: [
      { route: 'lend:dashboard', label: 'Dashboard', active: 'bg-zinc-200 text-black', glyph: '◧' },
      { route: 'lend:supply', label: 'Supply', active: 'bg-emerald-500 text-black', glyph: '↓' },
      { route: 'lend:withdraw', label: 'Withdraw', active: 'bg-sky-500 text-black', glyph: '↑' },
      { route: 'lend:borrow', label: 'Borrow', active: 'bg-amber-500 text-black', glyph: '↗' },
      { route: 'lend:repay', label: 'Repay', active: 'bg-violet-500 text-black', glyph: '✓' },
      { route: 'lend:liquidate', label: 'Liquidate', active: 'bg-red-500 text-black', glyph: '⚡' },
      { route: 'lend:history', label: 'History', active: 'bg-zinc-400 text-black', glyph: '≡' },
    ],
  },
  {
    title: 'Swap',
    items: [
      { route: 'swap:swap', label: 'Swap', active: 'bg-emerald-500 text-black', glyph: '↔' },
      { route: 'swap:liquidity', label: 'Liquidity', active: 'bg-violet-500 text-black', glyph: '≋' },
      { route: 'swap:faucet', label: 'Faucet', active: 'bg-amber-500 text-black', glyph: '$' },
    ],
  },
  {
    title: 'Strategy',
    items: [
      { route: 'strategy:leveraged-lp', label: 'Leveraged LP', active: 'bg-cyan-500 text-black', glyph: '⏃' },
    ],
  },
];
```

- [ ] **Step 2: Typecheck**

```bash
cd /Users/long/Code/personal/iopn-builders/frontend && npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/long/Code/personal/iopn-builders
git add frontend/components/Sidebar.tsx
git -c user.email=vvlong.2k@gmail.com -c user.name="vvlong" commit -m "feat(frontend): add STRATEGY > Leveraged LP entry to sidebar"
```

---

## Task 3: Page wiring + LeveragedLPPanel skeleton

**Files:**
- Create: `frontend/components/strategy/LeveragedLPPanel.tsx`
- Modify: `frontend/app/page.tsx`

- [ ] **Step 1: Create `frontend/components/strategy/LeveragedLPPanel.tsx` with a skeleton**

```tsx
'use client';

export function LeveragedLPPanel() {
  return (
    <section className="relative overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900 p-4 sm:p-6">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-cyan-500/60 via-transparent to-transparent" />

      <header className="mb-5 flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-400 text-lg font-bold">
          ⏃
        </div>
        <div>
          <h3 className="text-lg font-semibold">Leveraged LP</h3>
          <p className="text-sm text-zinc-400">
            Lock OPN as collateral, borrow OPN, pair with mUSDC, earn 0.30% LP
            fees on the borrowed capital. Four signed transactions (three when
            mUSDC is already approved).
          </p>
        </div>
      </header>

      <p className="text-sm text-zinc-500">Coming together piece by piece — see the next tasks.</p>
    </section>
  );
}
```

- [ ] **Step 2: Open `frontend/app/page.tsx` and update imports + `renderRoute` + `labelFor`. Replace the full file with:**

```tsx
'use client';

import { ConnectButton } from '@rainbow-me/rainbowkit';
import { ConnectGate } from '../components/ConnectGate';
import { Sidebar } from '../components/Sidebar';
import { useHashRoute, sectionOf } from '../lib/route';

import { DashboardView } from '../components/DashboardView';
import { ActionPanel } from '../components/ActionPanel';
import { LiquidatePanel } from '../components/LiquidatePanel';
import { HistoryView } from '../components/HistoryView';

import { SwapPoolStats } from '../components/swap/SwapPoolStats';
import { SwapPanel } from '../components/swap/SwapPanel';
import { LiquidityPanel } from '../components/swap/LiquidityPanel';
import { FaucetPanel } from '../components/swap/FaucetPanel';

import { LeveragedLPPanel } from '../components/strategy/LeveragedLPPanel';

export default function Home() {
  const { route, setRoute } = useHashRoute();

  return (
    <div className="flex min-h-screen">
      <Sidebar route={route} onChange={setRoute} />

      <main className="flex-1 min-w-0">
        <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-zinc-800 bg-zinc-950/80 px-4 py-3 backdrop-blur sm:px-6">
          <div className="w-9 md:hidden" aria-hidden />
          <div className="text-sm text-zinc-400 truncate">{labelFor(route)}</div>
          <ConnectButton />
        </header>

        <div className="px-4 py-5 sm:px-6 sm:py-6 max-w-4xl">
          <ConnectGate>{renderRoute(route)}</ConnectGate>
        </div>
      </main>
    </div>
  );
}

function renderRoute(route: ReturnType<typeof useHashRoute>['route']) {
  switch (route) {
    case 'lend:dashboard':
      return <DashboardView />;
    case 'lend:supply':
      return <SinglePanel><ActionPanel kind="supply" /></SinglePanel>;
    case 'lend:withdraw':
      return <SinglePanel><ActionPanel kind="withdraw" /></SinglePanel>;
    case 'lend:borrow':
      return <SinglePanel><ActionPanel kind="borrow" /></SinglePanel>;
    case 'lend:repay':
      return <SinglePanel><ActionPanel kind="repay" /></SinglePanel>;
    case 'lend:liquidate':
      return <LiquidatePanel />;
    case 'lend:history':
      return <HistoryView />;
    case 'swap:swap':
      return (
        <div className="space-y-4 sm:space-y-6">
          <SwapPoolStats />
          <SinglePanel><SwapPanel /></SinglePanel>
        </div>
      );
    case 'swap:liquidity':
      return (
        <div className="space-y-4 sm:space-y-6">
          <SwapPoolStats />
          <SinglePanel><LiquidityPanel /></SinglePanel>
        </div>
      );
    case 'swap:faucet':
      return (
        <div className="space-y-4 sm:space-y-6">
          <SinglePanel><FaucetPanel /></SinglePanel>
        </div>
      );
    case 'strategy:leveraged-lp':
      return <SinglePanel><LeveragedLPPanel /></SinglePanel>;
  }
}

function SinglePanel({ children }: { children: React.ReactNode }) {
  return <div className="max-w-lg">{children}</div>;
}

function labelFor(route: ReturnType<typeof useHashRoute>['route']): string {
  const section = sectionOf(route);
  const sectionName =
    section === 'lend' ? 'OpenLend' : section === 'swap' ? 'OpenSwap' : 'Strategy';
  const page = route.split(':')[1].replace(/^./, (c) => c.toUpperCase());
  return `${sectionName} · ${page}`;
}
```

- [ ] **Step 3: Typecheck + build**

```bash
cd /Users/long/Code/personal/iopn-builders/frontend && npm run typecheck && npm run build
```

Expected: clean. The new route renders the skeleton panel.

- [ ] **Step 4: Commit**

```bash
cd /Users/long/Code/personal/iopn-builders
git add frontend/components/strategy/LeveragedLPPanel.tsx frontend/app/page.tsx
git -c user.email=vvlong.2k@gmail.com -c user.name="vvlong" commit -m "feat(frontend): wire strategy:leveraged-lp route to skeleton panel"
```

---

## Task 4: Reads + derived state

**Files:**
- Modify: `frontend/components/strategy/LeveragedLPPanel.tsx`

- [ ] **Step 1: Replace `frontend/components/strategy/LeveragedLPPanel.tsx` with:**

```tsx
'use client';

import { useMemo, useState } from 'react';
import {
  useAccount,
  useBalance,
  useChainId,
  useReadContract,
  useReadContracts,
} from 'wagmi';
import { maxUint256 } from 'viem';

import {
  getLendingPoolAddress,
  getMockUSDCAddress,
  getPairAddress,
  lendingPoolAbi,
  mockUSDCAbi,
  openSwapPairAbi,
} from '../../lib/contract';

const GAS_RESERVE_WEI = 100_000_000_000_000n; // 0.0001 OPN
const LTV_CLAMP_BPS = 7000; // user-facing cap, 5 pp below the 7500 protocol cap

export function LeveragedLPPanel() {
  const chainId = useChainId();
  const { address: user } = useAccount();
  const pool = getLendingPoolAddress(chainId);
  const pair = getPairAddress(chainId);
  const mUSDC = getMockUSDCAddress(chainId);

  // ----- Inputs -----
  const [collateralText, setCollateralText] = useState('');
  const [ltvBps, setLtvBps] = useState<number>(6500);
  const [musdcOverride, setMusdcOverride] = useState<string | null>(null); // null → auto

  // ----- Reads -----
  const { data: bal } = useBalance({
    address: user,
    query: { enabled: Boolean(user), refetchInterval: 5000 },
  });

  const { data: balMUSDC } = useReadContract({
    address: mUSDC ?? undefined,
    abi: mockUSDCAbi,
    functionName: 'balanceOf',
    args: user ? [user] : undefined,
    query: { enabled: Boolean(mUSDC && user), refetchInterval: 5000 },
  });

  const { data: allowanceRaw } = useReadContract({
    address: mUSDC ?? undefined,
    abi: mockUSDCAbi,
    functionName: 'allowance',
    args: user && pair ? [user, pair] : undefined,
    query: { enabled: Boolean(mUSDC && pair && user), refetchInterval: 5000 },
  });
  const allowance = (allowanceRaw as bigint | undefined) ?? 0n;

  const { data: poolReads } = useReadContracts({
    contracts: pool && user
      ? [
          {
            address: pool,
            abi: lendingPoolAbi,
            functionName: 'getAccountData',
            args: [user],
          },
          { address: pool, abi: lendingPoolAbi, functionName: 'LTV_BPS' },
        ]
      : [],
    query: { enabled: Boolean(pool && user), refetchInterval: 5000 },
  });
  const account = poolReads?.[0]?.result as
    | readonly [bigint, bigint, bigint, bigint]
    | undefined;
  const existingCollateral = account?.[0] ?? 0n;
  const existingDebt = account?.[1] ?? 0n;
  const protocolLtvBps = (poolReads?.[1]?.result as bigint | undefined) ?? 7500n;

  const { data: pairReads } = useReadContracts({
    contracts: pair
      ? [
          { address: pair, abi: openSwapPairAbi, functionName: 'getReserves' },
          { address: pair, abi: openSwapPairAbi, functionName: 'totalSupply' },
        ]
      : [],
    query: { enabled: Boolean(pair), refetchInterval: 5000 },
  });
  const reservesTuple = pairReads?.[0]?.result as
    | readonly [bigint, bigint, number]
    | undefined;
  const pairTotalSupply =
    (pairReads?.[1]?.result as bigint | undefined) ?? undefined;
  const reserveOPN = reservesTuple?.[0] ?? 0n;
  const reserveMUSDC = reservesTuple?.[1] ?? 0n;

  // ----- Derived (parsed inputs) -----
  const collateralOPN: bigint = useMemo(() => {
    try {
      return collateralText ? parseEther(collateralText) : 0n;
    } catch {
      return 0n;
    }
  }, [collateralText]);

  const borrowOPN: bigint = useMemo(() => {
    return (collateralOPN * BigInt(ltvBps)) / 10000n;
  }, [collateralOPN, ltvBps]);

  const autoPairedMUSDC: bigint = useMemo(() => {
    if (reserveOPN === 0n || reserveMUSDC === 0n) return 0n;
    return (borrowOPN * reserveMUSDC) / reserveOPN;
  }, [borrowOPN, reserveOPN, reserveMUSDC]);

  const mUSDCInput: bigint = useMemo(() => {
    if (musdcOverride === null) return autoPairedMUSDC;
    try {
      return musdcOverride ? parseMUSDC(musdcOverride) : 0n;
    } catch {
      return 0n;
    }
  }, [musdcOverride, autoPairedMUSDC]);

  // ----- LP-shares preview -----
  const { data: quoteRaw } = useReadContract({
    address: pair ?? undefined,
    abi: openSwapPairAbi,
    functionName: 'quoteAddLiquidity',
    args: borrowOPN > 0n && mUSDCInput > 0n ? [borrowOPN, mUSDCInput] : undefined,
    query: {
      enabled: Boolean(pair && borrowOPN > 0n && mUSDCInput > 0n),
      refetchInterval: 5000,
    },
  });
  const lpShares = (quoteRaw as readonly [bigint, bigint, bigint] | undefined)?.[0];

  // ----- HF after the position is opened -----
  const hfAfter: bigint | 'infinity' = useMemo(() => {
    const newCollateral = existingCollateral + collateralOPN;
    const newDebt = existingDebt + borrowOPN;
    if (newDebt === 0n) return 'infinity';
    // 8000 = LIQ_THRESHOLD_BPS, 10000 = BPS_DENOM, 1e18 = WAD
    return (newCollateral * 8000n * 10n ** 18n) / (newDebt * 10000n);
  }, [existingCollateral, existingDebt, collateralOPN, borrowOPN]);

  // Suppress lint noise — these will all be consumed in the next task.
  void chainId;
  void pool;
  void mUSDC;
  void bal;
  void balMUSDC;
  void allowance;
  void protocolLtvBps;
  void pairTotalSupply;
  void lpShares;
  void hfAfter;
  void maxUint256;
  void LTV_CLAMP_BPS;

  return (
    <section className="relative overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900 p-4 sm:p-6">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-cyan-500/60 via-transparent to-transparent" />

      <header className="mb-5 flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-400 text-lg font-bold">
          ⏃
        </div>
        <div>
          <h3 className="text-lg font-semibold">Leveraged LP</h3>
          <p className="text-sm text-zinc-400">
            Lock OPN as collateral, borrow OPN, pair with mUSDC, earn 0.30% LP
            fees on the borrowed capital. Four signed transactions (three when
            mUSDC is already approved).
          </p>
        </div>
      </header>

      <p className="text-sm text-zinc-500">
        Inputs &amp; preview UI in Task 5; execute handler in Task 6.
      </p>
    </section>
  );
}

/* ----------------------------- helpers ----------------------------- */
import { parseEther, parseUnits } from 'viem';
function parseMUSDC(s: string): bigint {
  return parseUnits(s.trim(), 6);
}
```

- [ ] **Step 2: Typecheck**

```bash
cd /Users/long/Code/personal/iopn-builders/frontend && npm run typecheck
```

Expected: no errors. All reads + derived state are wired but unused; the `void` lines silence the unused-var lint until Task 5 consumes them.

- [ ] **Step 3: Commit**

```bash
cd /Users/long/Code/personal/iopn-builders
git add frontend/components/strategy/LeveragedLPPanel.tsx
git -c user.email=vvlong.2k@gmail.com -c user.name="vvlong" commit -m "feat(frontend): wire reads + derived state for Leveraged LP composer"
```

---

## Task 5: Inputs + preview UI

**Files:**
- Modify: `frontend/components/strategy/LeveragedLPPanel.tsx`

- [ ] **Step 1: Replace the file with the inputs + preview version**

```tsx
'use client';

import { useMemo, useState } from 'react';
import {
  useAccount,
  useBalance,
  useChainId,
  useReadContract,
  useReadContracts,
} from 'wagmi';
import { formatUnits, parseEther, parseUnits } from 'viem';

import {
  getLendingPoolAddress,
  getMockUSDCAddress,
  getPairAddress,
  lendingPoolAbi,
  mockUSDCAbi,
  openSwapPairAbi,
} from '../../lib/contract';
import { formatHF, formatLP, formatMUSDC, formatOPN } from '../../lib/format';

const GAS_RESERVE_WEI = 100_000_000_000_000n; // 0.0001 OPN
const LTV_CLAMP_BPS = 7000; // 70%, 5 pp below the 75% protocol cap

function parseMUSDC(s: string): bigint {
  return parseUnits(s.trim(), 6);
}

export function LeveragedLPPanel() {
  const chainId = useChainId();
  const { address: user } = useAccount();
  const pool = getLendingPoolAddress(chainId);
  const pair = getPairAddress(chainId);
  const mUSDC = getMockUSDCAddress(chainId);

  const [collateralText, setCollateralText] = useState('');
  const [ltvBps, setLtvBps] = useState<number>(6500);
  const [musdcOverride, setMusdcOverride] = useState<string | null>(null);

  /* ----- Reads ----- */
  const { data: bal } = useBalance({
    address: user,
    query: { enabled: Boolean(user), refetchInterval: 5000 },
  });
  const { data: balMUSDC } = useReadContract({
    address: mUSDC ?? undefined,
    abi: mockUSDCAbi,
    functionName: 'balanceOf',
    args: user ? [user] : undefined,
    query: { enabled: Boolean(mUSDC && user), refetchInterval: 5000 },
  });
  const { data: poolReads } = useReadContracts({
    contracts:
      pool && user
        ? [
            { address: pool, abi: lendingPoolAbi, functionName: 'getAccountData', args: [user] },
            { address: pool, abi: lendingPoolAbi, functionName: 'LTV_BPS' },
          ]
        : [],
    query: { enabled: Boolean(pool && user), refetchInterval: 5000 },
  });
  const account = poolReads?.[0]?.result as readonly [bigint, bigint, bigint, bigint] | undefined;
  const existingCollateral = account?.[0] ?? 0n;
  const existingDebt = account?.[1] ?? 0n;

  const { data: pairReads } = useReadContracts({
    contracts: pair
      ? [
          { address: pair, abi: openSwapPairAbi, functionName: 'getReserves' },
          { address: pair, abi: openSwapPairAbi, functionName: 'totalSupply' },
        ]
      : [],
    query: { enabled: Boolean(pair), refetchInterval: 5000 },
  });
  const reservesTuple = pairReads?.[0]?.result as readonly [bigint, bigint, number] | undefined;
  const reserveOPN = reservesTuple?.[0] ?? 0n;
  const reserveMUSDC = reservesTuple?.[1] ?? 0n;
  void pairReads;

  /* ----- Derived ----- */
  const collateralOPN = useMemo<bigint>(() => {
    try {
      return collateralText ? parseEther(collateralText) : 0n;
    } catch {
      return 0n;
    }
  }, [collateralText]);

  const borrowOPN = useMemo<bigint>(() => {
    return (collateralOPN * BigInt(ltvBps)) / 10000n;
  }, [collateralOPN, ltvBps]);

  const autoPairedMUSDC = useMemo<bigint>(() => {
    if (reserveOPN === 0n || reserveMUSDC === 0n) return 0n;
    return (borrowOPN * reserveMUSDC) / reserveOPN;
  }, [borrowOPN, reserveOPN, reserveMUSDC]);

  const mUSDCInput = useMemo<bigint>(() => {
    if (musdcOverride === null) return autoPairedMUSDC;
    try {
      return musdcOverride ? parseMUSDC(musdcOverride) : 0n;
    } catch {
      return 0n;
    }
  }, [musdcOverride, autoPairedMUSDC]);

  const { data: quoteRaw } = useReadContract({
    address: pair ?? undefined,
    abi: openSwapPairAbi,
    functionName: 'quoteAddLiquidity',
    args: borrowOPN > 0n && mUSDCInput > 0n ? [borrowOPN, mUSDCInput] : undefined,
    query: {
      enabled: Boolean(pair && borrowOPN > 0n && mUSDCInput > 0n),
      refetchInterval: 5000,
    },
  });
  const lpShares = (quoteRaw as readonly [bigint, bigint, bigint] | undefined)?.[0];

  const hfAfter = useMemo<bigint>(() => {
    const newCollateral = existingCollateral + collateralOPN;
    const newDebt = existingDebt + borrowOPN;
    if (newDebt === 0n) return (1n << 256n) - 1n; // sentinel "infinity"
    return (newCollateral * 8000n * 10n ** 18n) / (newDebt * 10000n);
  }, [existingCollateral, existingDebt, collateralOPN, borrowOPN]);
  const hfFmt = formatHF(hfAfter);
  const hfClass =
    hfFmt.tone === 'red'
      ? 'text-red-400'
      : hfFmt.tone === 'yellow'
      ? 'text-amber-300'
      : hfFmt.tone === 'green'
      ? 'text-emerald-400'
      : 'text-zinc-300';

  /* ----- MAX helpers ----- */
  const opnMax: bigint | undefined = bal
    ? bal.value - GAS_RESERVE_WEI > 0n
      ? bal.value - GAS_RESERVE_WEI
      : 0n
    : undefined;
  const opnMaxFmt = opnMax === undefined ? '—' : `${formatOPN(opnMax)} OPN`;
  const musdcMax = balMUSDC as bigint | undefined;
  const musdcMaxFmt = musdcMax === undefined ? '—' : `${formatMUSDC(musdcMax)} mUSDC`;

  /* ----- Render ----- */
  return (
    <section className="relative overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900 p-4 sm:p-6">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-cyan-500/60 via-transparent to-transparent" />

      <header className="mb-5 flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-400 text-lg font-bold">
          ⏃
        </div>
        <div>
          <h3 className="text-lg font-semibold">Leveraged LP</h3>
          <p className="text-sm text-zinc-400">
            Lock OPN as collateral, borrow OPN, pair with mUSDC, earn 0.30% LP
            fees on the borrowed capital.
          </p>
        </div>
      </header>

      <div className="space-y-4">
        {/* Collateral */}
        <div>
          <div className="mb-1.5 flex items-center justify-between text-xs uppercase tracking-wide">
            <span className="text-zinc-500">Collateral</span>
            <button
              type="button"
              disabled={!opnMax || opnMax === 0n}
              onClick={() => opnMax && setCollateralText(formatUnits(opnMax, 18))}
              className="rounded bg-zinc-800 px-2 py-0.5 text-[10px] font-semibold tracking-wider text-cyan-400 hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-30"
            >
              MAX
            </button>
          </div>
          <div className="flex items-center rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 focus-within:border-cyan-500">
            <input
              value={collateralText}
              onChange={(e) => setCollateralText(e.target.value)}
              placeholder="0.0"
              inputMode="decimal"
              className="min-w-0 flex-1 bg-transparent text-lg font-medium outline-none"
            />
            <span className="ml-2 text-sm font-medium text-zinc-500">OPN</span>
          </div>
          <div className="mt-1 text-[11px] text-zinc-500">Wallet: {opnMaxFmt}</div>
        </div>

        {/* LTV slider */}
        <div>
          <div className="mb-1.5 flex items-center justify-between text-xs uppercase tracking-wide">
            <span className="text-zinc-500">Borrow LTV</span>
            <span className="text-zinc-300 font-medium">{(ltvBps / 100).toFixed(0)}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={LTV_CLAMP_BPS}
            step={500}
            value={ltvBps}
            onChange={(e) => setLtvBps(Number(e.target.value))}
            className="w-full accent-cyan-500"
          />
          <div className="mt-1 text-[11px] text-zinc-500">
            Borrowing {formatOPN(borrowOPN)} OPN @ 5% APR · protocol cap {(LTV_CLAMP_BPS + 500) / 100}%
          </div>
        </div>

        {/* mUSDC */}
        <div>
          <div className="mb-1.5 flex items-center justify-between text-xs uppercase tracking-wide">
            <span className="text-zinc-500">mUSDC to pair</span>
            <button
              type="button"
              disabled={!musdcMax || musdcMax === 0n}
              onClick={() => musdcMax && setMusdcOverride(formatUnits(musdcMax, 6))}
              className="rounded bg-zinc-800 px-2 py-0.5 text-[10px] font-semibold tracking-wider text-cyan-400 hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-30"
            >
              MAX
            </button>
          </div>
          <div className="flex items-center rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 focus-within:border-cyan-500">
            <input
              value={
                musdcOverride !== null
                  ? musdcOverride
                  : autoPairedMUSDC > 0n
                  ? formatUnits(autoPairedMUSDC, 6)
                  : ''
              }
              onChange={(e) => setMusdcOverride(e.target.value)}
              placeholder="0.00"
              inputMode="decimal"
              className="min-w-0 flex-1 bg-transparent text-lg font-medium outline-none"
            />
            <span className="ml-2 text-sm font-medium text-zinc-500">mUSDC</span>
          </div>
          <div className="mt-1 flex items-center justify-between text-[11px] text-zinc-500">
            <span>
              Wallet: {musdcMaxFmt}
              {musdcOverride === null && ' · auto at pool ratio'}
            </span>
            {musdcOverride !== null && (
              <button
                type="button"
                onClick={() => setMusdcOverride(null)}
                className="text-cyan-400 hover:opacity-80"
              >
                reset to auto
              </button>
            )}
          </div>
        </div>

        {/* Preview */}
        <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3 text-xs space-y-1">
          <Row label="Collateral added" value={`${formatOPN(collateralOPN)} OPN`} />
          <Row label="Debt added" value={`${formatOPN(borrowOPN)} OPN @ 5% APR`} />
          <Row
            label="Liquidity added"
            value={`${formatOPN(borrowOPN)} OPN + ${formatMUSDC(mUSDCInput)} mUSDC`}
          />
          <Row
            label="LP shares minted"
            value={lpShares === undefined ? '—' : `${formatLP(lpShares)} OSP-LP`}
          />
          <Row
            label="Health factor after"
            value={hfFmt.text}
            valueClass={`font-semibold ${hfClass}`}
          />
        </div>

        <p className="text-sm text-zinc-500">Execute handler lands in Task 6.</p>
      </div>
    </section>
  );
}

function Row({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-zinc-500">{label}</span>
      <span className={`tabular-nums ${valueClass ?? 'text-zinc-200'}`}>{value}</span>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd /Users/long/Code/personal/iopn-builders/frontend && npm run typecheck
```

Expected: no errors. (We import `pairReads` and `void` it; this is fine — we'll consume it later if needed.)

- [ ] **Step 3: Commit**

```bash
cd /Users/long/Code/personal/iopn-builders
git add frontend/components/strategy/LeveragedLPPanel.tsx
git -c user.email=vvlong.2k@gmail.com -c user.name="vvlong" commit -m "feat(frontend): Leveraged LP inputs + live preview"
```

---

## Task 6: Execute handler — 4-step orchestration + status list

**Files:**
- Modify: `frontend/components/strategy/LeveragedLPPanel.tsx`

- [ ] **Step 1: Replace the file with the version that adds the execute handler, status list, CTA, and validation**

```tsx
'use client';

import { useMemo, useState } from 'react';
import {
  useAccount,
  useBalance,
  useChainId,
  usePublicClient,
  useReadContract,
  useReadContracts,
  useWriteContract,
} from 'wagmi';
import { formatUnits, maxUint256, parseEther, parseUnits } from 'viem';

import {
  getLendingPoolAddress,
  getMockUSDCAddress,
  getPairAddress,
  lendingPoolAbi,
  mockUSDCAbi,
  openSwapPairAbi,
} from '../../lib/contract';
import { iopnTestnet } from '../../lib/chains';
import { formatHF, formatLP, formatMUSDC, formatOPN } from '../../lib/format';

const GAS_RESERVE_WEI = 100_000_000_000_000n;
const LTV_CLAMP_BPS = 7000;
const PROTOCOL_LTV_BPS = 7500;

type Phase =
  | 'idle'
  | 'deposit-sign'
  | 'deposit-pending'
  | 'borrow-sign'
  | 'borrow-pending'
  | 'approve-sign'
  | 'approve-pending'
  | 'addlp-sign'
  | 'addlp-pending'
  | 'success'
  | 'error';

type StepKey = 'deposit' | 'borrow' | 'approve' | 'addlp';
type StepState = 'idle' | 'sign' | 'pending' | 'done' | 'failed' | 'skipped';

function parseMUSDC(s: string): bigint {
  return parseUnits(s.trim(), 6);
}

function phaseToStep(phase: Phase): StepKey | null {
  switch (phase) {
    case 'deposit-sign':
    case 'deposit-pending':
      return 'deposit';
    case 'borrow-sign':
    case 'borrow-pending':
      return 'borrow';
    case 'approve-sign':
    case 'approve-pending':
      return 'approve';
    case 'addlp-sign':
    case 'addlp-pending':
      return 'addlp';
    default:
      return null;
  }
}

function phaseSign(phase: Phase): boolean {
  return phase.endsWith('-sign');
}

function phasePending(phase: Phase): boolean {
  return phase.endsWith('-pending');
}

export function LeveragedLPPanel() {
  const chainId = useChainId();
  const { address: user } = useAccount();
  const pool = getLendingPoolAddress(chainId);
  const pair = getPairAddress(chainId);
  const mUSDC = getMockUSDCAddress(chainId);
  const publicClient = usePublicClient();

  /* Inputs */
  const [collateralText, setCollateralText] = useState('');
  const [ltvBps, setLtvBps] = useState<number>(6500);
  const [musdcOverride, setMusdcOverride] = useState<string | null>(null);

  /* Tx state */
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [hashes, setHashes] = useState<Partial<Record<StepKey, `0x${string}`>>>({});
  const [failedStep, setFailedStep] = useState<StepKey | null>(null);

  const { writeContractAsync } = useWriteContract();

  /* Reads */
  const { data: bal } = useBalance({
    address: user,
    query: { enabled: Boolean(user), refetchInterval: 5000 },
  });
  const { data: balMUSDC } = useReadContract({
    address: mUSDC ?? undefined,
    abi: mockUSDCAbi,
    functionName: 'balanceOf',
    args: user ? [user] : undefined,
    query: { enabled: Boolean(mUSDC && user), refetchInterval: 5000 },
  });
  const { data: allowanceRaw } = useReadContract({
    address: mUSDC ?? undefined,
    abi: mockUSDCAbi,
    functionName: 'allowance',
    args: user && pair ? [user, pair] : undefined,
    query: { enabled: Boolean(mUSDC && pair && user), refetchInterval: 5000 },
  });
  const allowance = (allowanceRaw as bigint | undefined) ?? 0n;
  const { data: poolReads } = useReadContracts({
    contracts:
      pool && user
        ? [
            { address: pool, abi: lendingPoolAbi, functionName: 'getAccountData', args: [user] },
          ]
        : [],
    query: { enabled: Boolean(pool && user), refetchInterval: 5000 },
  });
  const account = poolReads?.[0]?.result as readonly [bigint, bigint, bigint, bigint] | undefined;
  const existingCollateral = account?.[0] ?? 0n;
  const existingDebt = account?.[1] ?? 0n;
  const { data: pairReads } = useReadContracts({
    contracts: pair
      ? [
          { address: pair, abi: openSwapPairAbi, functionName: 'getReserves' },
          { address: pair, abi: openSwapPairAbi, functionName: 'availableLiquidity' },
        ]
      : [],
    query: { enabled: Boolean(pair), refetchInterval: 5000 },
  });
  // `availableLiquidity` is on the LendingPool, not the pair — keep a separate read for it.
  const { data: poolLiquidityRaw } = useReadContract({
    address: pool ?? undefined,
    abi: lendingPoolAbi,
    functionName: 'availableLiquidity',
    query: { enabled: Boolean(pool), refetchInterval: 5000 },
  });
  const poolLiquidity = (poolLiquidityRaw as bigint | undefined) ?? 0n;
  void pairReads;

  const { data: reservesRaw } = useReadContract({
    address: pair ?? undefined,
    abi: openSwapPairAbi,
    functionName: 'getReserves',
    query: { enabled: Boolean(pair), refetchInterval: 5000 },
  });
  const reservesTuple = reservesRaw as readonly [bigint, bigint, number] | undefined;
  const reserveOPN = reservesTuple?.[0] ?? 0n;
  const reserveMUSDC = reservesTuple?.[1] ?? 0n;

  /* Derived */
  const collateralOPN = useMemo<bigint>(() => {
    try {
      return collateralText ? parseEther(collateralText) : 0n;
    } catch {
      return 0n;
    }
  }, [collateralText]);
  const borrowOPN = useMemo<bigint>(() => {
    return (collateralOPN * BigInt(ltvBps)) / 10000n;
  }, [collateralOPN, ltvBps]);
  const autoPairedMUSDC = useMemo<bigint>(() => {
    if (reserveOPN === 0n || reserveMUSDC === 0n) return 0n;
    return (borrowOPN * reserveMUSDC) / reserveOPN;
  }, [borrowOPN, reserveOPN, reserveMUSDC]);
  const mUSDCInput = useMemo<bigint>(() => {
    if (musdcOverride === null) return autoPairedMUSDC;
    try {
      return musdcOverride ? parseMUSDC(musdcOverride) : 0n;
    } catch {
      return 0n;
    }
  }, [musdcOverride, autoPairedMUSDC]);
  const needsApproval = allowance < mUSDCInput;

  const { data: quoteRaw } = useReadContract({
    address: pair ?? undefined,
    abi: openSwapPairAbi,
    functionName: 'quoteAddLiquidity',
    args: borrowOPN > 0n && mUSDCInput > 0n ? [borrowOPN, mUSDCInput] : undefined,
    query: {
      enabled: Boolean(pair && borrowOPN > 0n && mUSDCInput > 0n),
      refetchInterval: 5000,
    },
  });
  const lpShares = (quoteRaw as readonly [bigint, bigint, bigint] | undefined)?.[0];

  const hfAfter = useMemo<bigint>(() => {
    const newCollateral = existingCollateral + collateralOPN;
    const newDebt = existingDebt + borrowOPN;
    if (newDebt === 0n) return maxUint256;
    return (newCollateral * 8000n * 10n ** 18n) / (newDebt * 10000n);
  }, [existingCollateral, existingDebt, collateralOPN, borrowOPN]);
  const hfFmt = formatHF(hfAfter);
  const hfClass =
    hfFmt.tone === 'red'
      ? 'text-red-400'
      : hfFmt.tone === 'yellow'
      ? 'text-amber-300'
      : hfFmt.tone === 'green'
      ? 'text-emerald-400'
      : 'text-zinc-300';

  /* MAX helpers */
  const opnMax: bigint | undefined = bal
    ? bal.value - GAS_RESERVE_WEI > 0n
      ? bal.value - GAS_RESERVE_WEI
      : 0n
    : undefined;
  const opnMaxFmt = opnMax === undefined ? '—' : `${formatOPN(opnMax)} OPN`;
  const musdcMax = balMUSDC as bigint | undefined;
  const musdcMaxFmt = musdcMax === undefined ? '—' : `${formatMUSDC(musdcMax)} mUSDC`;

  /* Validation */
  const validation = useMemo(() => {
    if (!pool || !pair || !mUSDC || !user || !publicClient) {
      return { ok: false as const, reason: 'No deployment found for this network.' };
    }
    if (collateralOPN <= 0n) {
      return { ok: false as const, reason: 'Enter collateral > 0.' };
    }
    if (opnMax !== undefined && collateralOPN > opnMax) {
      return {
        ok: false as const,
        reason: `Need ${formatOPN(collateralOPN - opnMax)} more OPN (incl. gas reserve).`,
      };
    }
    if (borrowOPN <= 0n) {
      return { ok: false as const, reason: 'Move the LTV slider above 0%.' };
    }
    if ((collateralOPN * BigInt(PROTOCOL_LTV_BPS)) / 10000n < borrowOPN) {
      return {
        ok: false as const,
        reason: `Borrow would exceed the protocol ${PROTOCOL_LTV_BPS / 100}% LTV cap.`,
      };
    }
    if (borrowOPN > poolLiquidity) {
      return {
        ok: false as const,
        reason: `Pool only has ${formatOPN(poolLiquidity)} OPN free to borrow.`,
      };
    }
    if (reserveOPN === 0n || reserveMUSDC === 0n) {
      return {
        ok: false as const,
        reason: 'AMM is empty. Bootstrap via Swap > Liquidity first.',
      };
    }
    if (mUSDCInput <= 0n) {
      return { ok: false as const, reason: 'Enter mUSDC > 0.' };
    }
    if (musdcMax === undefined || mUSDCInput > musdcMax) {
      return {
        ok: false as const,
        reason: 'Not enough mUSDC. Mint some via the Faucet tab first.',
      };
    }
    if (hfAfter < 10n ** 18n) {
      return { ok: false as const, reason: 'Health factor after would be below 1.0.' };
    }
    let warning: string | null = null;
    if (hfAfter < (12n * 10n ** 18n) / 10n) {
      warning = `Health factor will be low (${hfFmt.text}). Consider lowering the LTV.`;
    }
    return { ok: true as const, warning };
  }, [
    pool,
    pair,
    mUSDC,
    user,
    publicClient,
    collateralOPN,
    opnMax,
    borrowOPN,
    poolLiquidity,
    reserveOPN,
    reserveMUSDC,
    mUSDCInput,
    musdcMax,
    hfAfter,
    hfFmt.text,
  ]);

  /* Execute */
  const busy = phase !== 'idle' && phase !== 'success' && phase !== 'error';

  const reset = () => {
    setPhase('idle');
    setError(null);
    setHashes({});
    setFailedStep(null);
  };

  const onExecute = async () => {
    if (!validation.ok || !pool || !pair || !mUSDC || !publicClient) return;
    setError(null);
    setHashes({});
    setFailedStep(null);
    const recordHash = (k: StepKey, h: `0x${string}`) =>
      setHashes((prev) => ({ ...prev, [k]: h }));

    try {
      // Step 1: depositCollateral
      setPhase('deposit-sign');
      const h1 = await writeContractAsync({
        address: pool,
        abi: lendingPoolAbi,
        functionName: 'depositCollateral',
        value: collateralOPN,
      });
      recordHash('deposit', h1);
      setPhase('deposit-pending');
      await publicClient.waitForTransactionReceipt({ hash: h1 });

      // Step 2: borrow
      setPhase('borrow-sign');
      const h2 = await writeContractAsync({
        address: pool,
        abi: lendingPoolAbi,
        functionName: 'borrow',
        args: [borrowOPN],
      });
      recordHash('borrow', h2);
      setPhase('borrow-pending');
      await publicClient.waitForTransactionReceipt({ hash: h2 });

      // Step 3: approve (conditional)
      if (allowance < mUSDCInput) {
        setPhase('approve-sign');
        const h3 = await writeContractAsync({
          address: mUSDC,
          abi: mockUSDCAbi,
          functionName: 'approve',
          args: [pair, maxUint256],
        });
        recordHash('approve', h3);
        setPhase('approve-pending');
        await publicClient.waitForTransactionReceipt({ hash: h3 });
      }

      // Step 4: addLiquidity
      setPhase('addlp-sign');
      const h4 = await writeContractAsync({
        address: pair,
        abi: openSwapPairAbi,
        functionName: 'addLiquidity',
        args: [mUSDCInput],
        value: borrowOPN,
      });
      recordHash('addlp', h4);
      setPhase('addlp-pending');
      await publicClient.waitForTransactionReceipt({ hash: h4 });

      setPhase('success');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg.includes('User rejected') ? 'Rejected in wallet.' : msg);
      setFailedStep(phaseToStep(phase));
      setPhase('error');
    }
  };

  /* Status list */
  const stepStates: Record<StepKey, StepState> = (() => {
    const currentStep = phaseToStep(phase);
    function stateFor(k: StepKey): StepState {
      if (k === 'approve' && !needsApproval && phase !== 'idle' && phase !== 'error') {
        return 'skipped';
      }
      if (phase === 'success') return 'done';
      if (phase === 'error') {
        if (k === failedStep) return 'failed';
        // Steps before the failed step succeeded; steps after didn't run.
        const order: StepKey[] = ['deposit', 'borrow', 'approve', 'addlp'];
        const failedIdx = failedStep ? order.indexOf(failedStep) : -1;
        const thisIdx = order.indexOf(k);
        if (failedIdx === -1) return 'idle';
        if (thisIdx < failedIdx) return 'done';
        return 'idle';
      }
      if (k === currentStep) {
        if (phaseSign(phase)) return 'sign';
        if (phasePending(phase)) return 'pending';
      }
      // Step is done if a later step is in flight.
      const order: StepKey[] = ['deposit', 'borrow', 'approve', 'addlp'];
      if (currentStep && order.indexOf(k) < order.indexOf(currentStep)) {
        return 'done';
      }
      return 'idle';
    }
    return {
      deposit: stateFor('deposit'),
      borrow: stateFor('borrow'),
      approve: stateFor('approve'),
      addlp: stateFor('addlp'),
    };
  })();

  return (
    <section className="relative overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900 p-4 sm:p-6">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-cyan-500/60 via-transparent to-transparent" />

      <header className="mb-5 flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-400 text-lg font-bold">
          ⏃
        </div>
        <div>
          <h3 className="text-lg font-semibold">Leveraged LP</h3>
          <p className="text-sm text-zinc-400">
            Lock OPN as collateral, borrow OPN, pair with mUSDC, earn 0.30% LP
            fees on the borrowed capital.
          </p>
        </div>
      </header>

      <div className="space-y-4">
        {/* Collateral input */}
        <Field
          label="Collateral"
          unit="OPN"
          value={collateralText}
          onChange={setCollateralText}
          disabled={busy}
          maxValue={opnMax}
          maxFormatted={opnMaxFmt}
          onMax={() => opnMax && setCollateralText(formatUnits(opnMax, 18))}
        />

        {/* LTV slider */}
        <div>
          <div className="mb-1.5 flex items-center justify-between text-xs uppercase tracking-wide">
            <span className="text-zinc-500">Borrow LTV</span>
            <span className="text-zinc-300 font-medium">{(ltvBps / 100).toFixed(0)}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={LTV_CLAMP_BPS}
            step={500}
            value={ltvBps}
            onChange={(e) => setLtvBps(Number(e.target.value))}
            disabled={busy}
            className="w-full accent-cyan-500"
          />
          <div className="mt-1 text-[11px] text-zinc-500">
            Borrowing {formatOPN(borrowOPN)} OPN @ 5% APR · protocol cap{' '}
            {PROTOCOL_LTV_BPS / 100}%
          </div>
        </div>

        {/* mUSDC input */}
        <div>
          <div className="mb-1.5 flex items-center justify-between text-xs uppercase tracking-wide">
            <span className="text-zinc-500">mUSDC to pair</span>
            <button
              type="button"
              disabled={busy || !musdcMax || musdcMax === 0n}
              onClick={() => musdcMax && setMusdcOverride(formatUnits(musdcMax, 6))}
              className="rounded bg-zinc-800 px-2 py-0.5 text-[10px] font-semibold tracking-wider text-cyan-400 hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-30"
            >
              MAX
            </button>
          </div>
          <div
            className={`flex items-center rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 focus-within:border-cyan-500 ${
              busy ? 'opacity-60' : ''
            }`}
          >
            <input
              value={
                musdcOverride !== null
                  ? musdcOverride
                  : autoPairedMUSDC > 0n
                  ? formatUnits(autoPairedMUSDC, 6)
                  : ''
              }
              onChange={(e) => setMusdcOverride(e.target.value)}
              placeholder="0.00"
              inputMode="decimal"
              disabled={busy}
              className="min-w-0 flex-1 bg-transparent text-lg font-medium outline-none"
            />
            <span className="ml-2 text-sm font-medium text-zinc-500">mUSDC</span>
          </div>
          <div className="mt-1 flex items-center justify-between text-[11px] text-zinc-500">
            <span>
              Wallet: {musdcMaxFmt}
              {musdcOverride === null && ' · auto at pool ratio'}
            </span>
            {musdcOverride !== null && (
              <button
                type="button"
                onClick={() => setMusdcOverride(null)}
                className="text-cyan-400 hover:opacity-80"
                disabled={busy}
              >
                reset to auto
              </button>
            )}
          </div>
        </div>

        {/* Preview */}
        <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3 text-xs space-y-1">
          <Row label="Collateral added" value={`${formatOPN(collateralOPN)} OPN`} />
          <Row label="Debt added" value={`${formatOPN(borrowOPN)} OPN @ 5% APR`} />
          <Row
            label="Liquidity added"
            value={`${formatOPN(borrowOPN)} OPN + ${formatMUSDC(mUSDCInput)} mUSDC`}
          />
          <Row
            label="LP shares minted"
            value={lpShares === undefined ? '—' : `${formatLP(lpShares)} OSP-LP`}
          />
          <Row
            label="Health factor after"
            value={hfFmt.text}
            valueClass={`font-semibold ${hfClass}`}
          />
        </div>

        {/* Warning / error */}
        {validation.ok && validation.warning && (
          <p className="rounded-lg border border-amber-700/50 bg-amber-950/30 p-3 text-xs text-amber-200">
            {validation.warning}
          </p>
        )}
        {!validation.ok && collateralText !== '' && (
          <p className="rounded-lg border border-red-700/50 bg-red-950/30 p-3 text-xs text-red-200">
            {validation.reason}
          </p>
        )}

        {/* CTA */}
        <button
          onClick={onExecute}
          disabled={busy || !validation.ok}
          className="w-full rounded-lg bg-cyan-500 py-2.5 font-semibold text-black transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-cyan-500"
        >
          {busy
            ? 'Working…'
            : `Execute (${needsApproval ? 4 : 3} transactions)`}
        </button>

        {/* Status list */}
        <ul className="space-y-1.5 text-xs">
          <StepRow
            label="1. Deposit collateral"
            state={stepStates.deposit}
            hash={hashes.deposit}
          />
          <StepRow
            label="2. Borrow OPN"
            state={stepStates.borrow}
            hash={hashes.borrow}
          />
          <StepRow
            label="3. Approve mUSDC"
            state={stepStates.approve}
            hash={hashes.approve}
          />
          <StepRow
            label="4. Add liquidity"
            state={stepStates.addlp}
            hash={hashes.addlp}
          />
        </ul>

        {phase === 'error' && (
          <div className="flex items-center justify-between rounded-lg border border-red-700/50 bg-red-950/30 p-3 text-xs text-red-200">
            <span>Error: {error}</span>
            <button onClick={reset} className="text-red-300 underline">
              reset
            </button>
          </div>
        )}
        {phase === 'success' && (
          <div className="flex items-center justify-between rounded-lg border border-emerald-700/50 bg-emerald-950/30 p-3 text-xs text-emerald-200">
            <span>Position opened ✓ — check Dashboard for the updated HF.</span>
            <button onClick={reset} className="text-emerald-300 underline">
              reset
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

function Field({
  label,
  unit,
  value,
  onChange,
  disabled,
  maxValue,
  maxFormatted,
  onMax,
}: {
  label: string;
  unit: string;
  value: string;
  onChange: (s: string) => void;
  disabled: boolean;
  maxValue?: bigint;
  maxFormatted?: string;
  onMax?: () => void;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-xs uppercase tracking-wide">
        <span className="text-zinc-500">{label}</span>
        {onMax && (
          <button
            type="button"
            disabled={disabled || !maxValue || maxValue === 0n}
            onClick={onMax}
            className="rounded bg-zinc-800 px-2 py-0.5 text-[10px] font-semibold tracking-wider text-cyan-400 hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-30"
          >
            MAX
          </button>
        )}
      </div>
      <div
        className={`flex items-center rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 focus-within:border-cyan-500 ${
          disabled ? 'opacity-60' : ''
        }`}
      >
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="0.0"
          inputMode="decimal"
          disabled={disabled}
          className="min-w-0 flex-1 bg-transparent text-lg font-medium outline-none"
        />
        <span className="ml-2 text-sm font-medium text-zinc-500">{unit}</span>
      </div>
      {maxFormatted && (
        <div className="mt-1 text-[11px] text-zinc-500">Wallet: {maxFormatted}</div>
      )}
    </div>
  );
}

function Row({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-zinc-500">{label}</span>
      <span className={`tabular-nums ${valueClass ?? 'text-zinc-200'}`}>{value}</span>
    </div>
  );
}

function StepRow({
  label,
  state,
  hash,
}: {
  label: string;
  state: StepState;
  hash?: `0x${string}`;
}) {
  const explorer = hash
    ? `${iopnTestnet.blockExplorers.default.url}/tx/${hash}`
    : null;
  const glyph =
    state === 'done'
      ? '✓'
      : state === 'failed'
      ? '✗'
      : state === 'sign'
      ? '◔'
      : state === 'pending'
      ? '◐'
      : state === 'skipped'
      ? '—'
      : '○';
  const text =
    state === 'done'
      ? 'text-emerald-300'
      : state === 'failed'
      ? 'text-red-300'
      : state === 'sign'
      ? 'text-amber-300'
      : state === 'pending'
      ? 'text-cyan-300'
      : state === 'skipped'
      ? 'text-zinc-600'
      : 'text-zinc-500';
  const detail =
    state === 'sign'
      ? '(confirm in wallet…)'
      : state === 'pending'
      ? '(pending…)'
      : state === 'failed'
      ? '(failed)'
      : state === 'skipped'
      ? '(allowance ok, skipped)'
      : null;
  return (
    <li className="flex items-center gap-2">
      <span className={`${text} w-3 text-center`}>{glyph}</span>
      <span className={text}>{label}</span>
      {detail && <span className="text-zinc-600">{detail}</span>}
      {explorer && (
        <a
          className="text-zinc-400 underline hover:text-zinc-200"
          target="_blank"
          rel="noopener noreferrer"
          href={explorer}
        >
          tx ↗
        </a>
      )}
    </li>
  );
}
```

- [ ] **Step 2: Typecheck + build**

```bash
cd /Users/long/Code/personal/iopn-builders/frontend && npm run typecheck && npm run build
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
cd /Users/long/Code/personal/iopn-builders
git add frontend/components/strategy/LeveragedLPPanel.tsx
git -c user.email=vvlong.2k@gmail.com -c user.name="vvlong" commit -m "feat(frontend): Leveraged LP execute handler + per-step status list"
```

---

## Task 7: README addendum

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Open `README.md`, find the existing "Frontend (optional UI)" section, and add a paragraph at the bottom (just before the "### Deploying the frontend to Vercel" sub-section):**

```markdown
### Strategy: Leveraged LP

A cross-protocol composer lives at `#leveraged-lp` (Sidebar > Strategy >
Leveraged LP). One panel runs a 4-step sequence: deposit OPN as
collateral on OpenLend, borrow OPN against it (up to 70% LTV in the UI,
5 pp below the protocol cap for HF headroom), optionally approve mUSDC,
then add OPN+mUSDC liquidity to OpenSwap. The panel previews the
resulting health factor, LP shares, and debt before any wallet signing,
and surfaces a per-step status list with explorer-linked tx hashes.

Frontend-only orchestration — no router contract — so each step records
correctly under the user's address.
```

- [ ] **Step 2: Commit**

```bash
cd /Users/long/Code/personal/iopn-builders
git add README.md
git -c user.email=vvlong.2k@gmail.com -c user.name="vvlong" commit -m "docs: add Leveraged LP strategy section to README"
```

---

## Task 8: Final verification

**Files:** (verify-only)

- [ ] **Step 1: Clean build**

```bash
cd /Users/long/Code/personal/iopn-builders/frontend && rm -rf .next && npm run typecheck && npm run build
```

Expected: clean. Bundle size for `/` ~25 kB ± a few.

- [ ] **Step 2: Manual smoke on localhost**

In one terminal:
```bash
cd /Users/long/Code/personal/iopn-builders/frontend && npm run dev
```

Open `http://localhost:3000#leveraged-lp` (or 3001 if 3000 is in use).

Verify:
- Sidebar shows a third STRATEGY group with "Leveraged LP" entry
- Clicking the entry updates the URL hash to `#leveraged-lp`
- Header label reads "Strategy · Leveraged-lp"
- With a connected testnet wallet that has OPN, mUSDC, and a seeded
  pool: typing a collateral value populates the preview rows and the HF
  color reflects the result

Don't execute a live tx unless you want to — the manual e2e is for the
user, not CI. If anything reads `—` indefinitely, double-check
`.env.local` (run `npm run sync:testnet` from `frontend/` against the
latest `deployments/iopnTestnet.json`).

- [ ] **Step 3: If anything changed during verification, commit**

```bash
cd /Users/long/Code/personal/iopn-builders
git status
# only if dirty:
git add -A
git -c user.email=vvlong.2k@gmail.com -c user.name="vvlong" commit -m "chore: final verification pass"
```

- [ ] **Step 4: Push the feature branch**

```bash
git push origin feat/composer
```

Open a PR from `feat/composer` → `main` (or merge fast-forward if
working solo).

---

## Self-Review

**Spec coverage:**

- §1 Purpose → covered by Tasks 1-7 (route + sidebar + panel + docs)
- §2 Scope → file map in this plan matches the spec's file map exactly
- §3 UI → Task 3 (skeleton) + Task 5 (inputs + preview) + Task 6 (status list, CTA)
- §3.1 Inputs (collateral, LTV slider, mUSDC override) → Task 5
- §3.2 Preview (LP shares + HF after) → Task 5 + Task 6
- §3.3 Status list (4 rows, skipped, explorer link) → Task 6 `StepRow`
- §4.1 Reads (8 sources) → Tasks 4 + 6 wire all of them
- §4.2 Writes (4-step state machine + skip-on-allowance) → Task 6 `onExecute`
- §5 Errors / edge cases → Task 6 `validation` memo covers every row in the spec's table
- §6 Testing (typecheck, build, manual smoke) → Task 8
- §7 Acceptance criteria → covered by Tasks 2 (sidebar), 1 (route), 4-6 (panel features), 8 (build acceptance)
- §8 Out of scope → respected; no router contract, no slippage flag, no extra recipes

**Placeholder scan:** No TODO/TBD/"add validation later". Task 5 ends with a "Task 6 lands the execute handler" note — that is a narrative pointer, not a placeholder; Task 5 is self-contained and committable.

**Type consistency:**

- `Route` union extended with `'strategy:leveraged-lp'` in Task 1 and consumed in Tasks 2 + 3 + page.tsx ✓
- `Section` union extended with `'strategy'` in Task 1 and consumed in `sectionOf` + page.tsx `labelFor` ✓
- `Phase` type defined in Task 6 and used by `phaseToStep`, `phaseSign`, `phasePending`, and the render switch ✓
- `StepKey = 'deposit' | 'borrow' | 'approve' | 'addlp'` consistent across `phaseToStep`, `stepStates`, `recordHash`, `hashes`, `failedStep`, `StepRow` ✓
- `StepState = 'idle' | 'sign' | 'pending' | 'done' | 'failed' | 'skipped'` consistent in `stateFor` and `StepRow` glyph/text/detail dispatch ✓
- Address loaders (`getLendingPoolAddress`, `getPairAddress`, `getMockUSDCAddress`) called with `chainId` everywhere ✓
- ABI imports (`lendingPoolAbi`, `openSwapPairAbi`, `mockUSDCAbi`) match the existing `lib/contract.ts` exports ✓
- `formatHF`, `formatLP`, `formatMUSDC`, `formatOPN` match the existing `lib/format.ts` exports — no new helpers introduced ✓
