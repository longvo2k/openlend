# OpenLend Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a minimal Next.js dApp under `frontend/` that lets users connect a wallet to IOPN testnet (chainId 984) and supply/withdraw/borrow/repay against the deployed `LendingPool`.

**Architecture:** Next.js 14 App Router with a single page. Three sections: PoolStats, AccountStats, Actions (4 action panels). wagmi v2 reads via `useReadContract` (per-block refresh), writes via `useWriteContract` + `useWaitForTransactionReceipt`. Tailwind for styling. RainbowKit for wallet UI. Contract ABI imported directly from Hardhat's compiled artifact; address loaded from `deployments/<network>.json`.

**Tech Stack:**
- Next.js 14.2 (App Router)
- React 18.3
- TypeScript 5.4 strict
- wagmi v2 + viem v2
- @rainbow-me/rainbowkit v2
- @tanstack/react-query v5 (wagmi peer)
- Tailwind CSS v3.4

**Spec reference:** [docs/superpowers/specs/2026-05-29-openlend-frontend-design.md](../specs/2026-05-29-openlend-frontend-design.md)

---

## File Map

| File | Responsibility |
|------|----------------|
| `frontend/package.json` | Deps + scripts (dev/build/start) |
| `frontend/tsconfig.json` | TS strict config |
| `frontend/next.config.js` | Next config (transpile from artifacts) |
| `frontend/tailwind.config.ts` | Tailwind paths + theme |
| `frontend/postcss.config.js` | Tailwind PostCSS pipeline |
| `frontend/.env.example` | WalletConnect project ID placeholder |
| `frontend/.gitignore` | node_modules, .next, .env |
| `frontend/app/layout.tsx` | HTML shell + `<Providers />` |
| `frontend/app/providers.tsx` | Wagmi + RainbowKit + React Query providers |
| `frontend/app/page.tsx` | Top-level page composition |
| `frontend/app/globals.css` | Tailwind directives |
| `frontend/lib/chains.ts` | IOPN testnet chain definition |
| `frontend/lib/wagmi.ts` | wagmi config |
| `frontend/lib/contract.ts` | ABI import + address loader |
| `frontend/lib/format.ts` | bigint/HF/bps display helpers |
| `frontend/components/ConnectGate.tsx` | Wallet + network guard |
| `frontend/components/PoolStats.tsx` | Pool-wide read view |
| `frontend/components/AccountStats.tsx` | Per-user read view |
| `frontend/components/ActionPanel.tsx` | Generic action card (4 variants) |

---

## Task F1: Scaffold Next.js + Tailwind + deps

**Files:**
- Create: `frontend/package.json`
- Create: `frontend/tsconfig.json`
- Create: `frontend/next.config.js`
- Create: `frontend/postcss.config.js`
- Create: `frontend/tailwind.config.ts`
- Create: `frontend/.env.example`
- Create: `frontend/.gitignore`
- Create: `frontend/app/globals.css`
- Create: `frontend/app/layout.tsx` (minimal placeholder)
- Create: `frontend/app/page.tsx` (minimal placeholder)

- [ ] **Step 1: Create `frontend/package.json`**

```json
{
  "name": "openlend-frontend",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@rainbow-me/rainbowkit": "^2.1.0",
    "@tanstack/react-query": "^5.40.0",
    "next": "^14.2.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "viem": "^2.13.0",
    "wagmi": "^2.10.0"
  },
  "devDependencies": {
    "@types/node": "^20.11.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "autoprefixer": "^10.4.19",
    "postcss": "^8.4.38",
    "tailwindcss": "^3.4.0",
    "typescript": "^5.4.0"
  }
}
```

- [ ] **Step 2: Create `frontend/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "ES2022"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Create `frontend/next.config.js`**

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config) => {
    // Silence "indexedDB is not defined" warning from wagmi storage on SSR.
    config.externals.push('pino-pretty', 'lokijs', 'encoding');
    return config;
  },
};
module.exports = nextConfig;
```

- [ ] **Step 4: Create `frontend/postcss.config.js`**

```js
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

- [ ] **Step 5: Create `frontend/tailwind.config.ts`**

```ts
import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};

export default config;
```

- [ ] **Step 6: Create `frontend/.env.example`**

```
# Optional. Get one free at https://cloud.walletconnect.com/.
# Frontend works without it (MetaMask/injected wallets still connect).
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=
```

- [ ] **Step 7: Create `frontend/.gitignore`**

```
node_modules
.next
out
.env
.env.local
*.tsbuildinfo
next-env.d.ts
.DS_Store
```

- [ ] **Step 8: Create `frontend/app/globals.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  color-scheme: dark;
}

html, body {
  height: 100%;
}
```

- [ ] **Step 9: Create placeholder `frontend/app/layout.tsx`**

```tsx
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'OpenLend',
  description: 'Minimal borrow/lend pool on IOPN testnet',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-zinc-950 text-zinc-100 min-h-screen">{children}</body>
    </html>
  );
}
```

- [ ] **Step 10: Create placeholder `frontend/app/page.tsx`**

```tsx
export default function Home() {
  return (
    <main className="max-w-4xl mx-auto p-6">
      <h1 className="text-3xl font-bold">OpenLend</h1>
      <p className="text-zinc-400">Frontend scaffold OK.</p>
    </main>
  );
}
```

- [ ] **Step 11: Install deps**

```bash
cd /Users/long/Code/personal/iopn-builders/frontend && npm install
```

Expected: completes without errors.

- [ ] **Step 12: Build smoke test**

```bash
cd /Users/long/Code/personal/iopn-builders/frontend && npm run build
```

Expected: `next build` finishes successfully. `.next/` populated.

- [ ] **Step 13: Update root `.gitignore`** to also exclude `frontend/node_modules` and `frontend/.next` (root .gitignore patterns are not inherited into subdirs in git unless they start at root level — but `node_modules` already matches everywhere). Verify by `git check-ignore -v frontend/node_modules`. If it's already ignored by the existing root rule, no change needed.

- [ ] **Step 14: Commit**

```bash
cd /Users/long/Code/personal/iopn-builders
git add frontend/package.json frontend/package-lock.json frontend/tsconfig.json frontend/next.config.js frontend/postcss.config.js frontend/tailwind.config.ts frontend/.env.example frontend/.gitignore frontend/app/globals.css frontend/app/layout.tsx frontend/app/page.tsx
git -c user.email=vvlong.2k@gmail.com -c user.name="vvlong" commit -m "chore(frontend): scaffold Next.js 14 + Tailwind + wagmi deps"
```

---

## Task F2: Chain config + wagmi + Providers

**Files:**
- Create: `frontend/lib/chains.ts`
- Create: `frontend/lib/wagmi.ts`
- Create: `frontend/app/providers.tsx`
- Modify: `frontend/app/layout.tsx`

- [ ] **Step 1: Create `frontend/lib/chains.ts`**

```ts
import { defineChain } from 'viem';

export const iopnTestnet = defineChain({
  id: 984,
  name: 'IOPN Testnet',
  nativeCurrency: { name: 'OPN', symbol: 'OPN', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://testnet-rpc.iopn.tech'] },
  },
  blockExplorers: {
    default: { name: 'IOPN Explorer', url: 'https://testnet.iopn.tech' },
  },
  testnet: true,
});
```

- [ ] **Step 2: Create `frontend/lib/wagmi.ts`**

```ts
import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { hardhat } from 'wagmi/chains';
import { http } from 'viem';
import { iopnTestnet } from './chains';

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? 'openlend-no-wc';

export const wagmiConfig = getDefaultConfig({
  appName: 'OpenLend',
  projectId,
  chains: [iopnTestnet, hardhat],
  transports: {
    [iopnTestnet.id]: http(),
    [hardhat.id]: http('http://127.0.0.1:8545'),
  },
  ssr: true,
});
```

- [ ] **Step 3: Create `frontend/app/providers.tsx`**

```tsx
'use client';

import { ReactNode, useState } from 'react';
import { WagmiProvider } from 'wagmi';
import { RainbowKitProvider, darkTheme } from '@rainbow-me/rainbowkit';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@rainbow-me/rainbowkit/styles.css';

import { wagmiConfig } from '../lib/wagmi';

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={darkTheme()}>{children}</RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
```

- [ ] **Step 4: Wire `frontend/app/layout.tsx` to use Providers**

Replace the file content:

```tsx
import type { Metadata } from 'next';
import { Providers } from './providers';
import './globals.css';

export const metadata: Metadata = {
  title: 'OpenLend',
  description: 'Minimal borrow/lend pool on IOPN testnet',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-zinc-950 text-zinc-100 min-h-screen">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

- [ ] **Step 5: Add ConnectButton to page (sanity check)**

Replace `frontend/app/page.tsx`:

```tsx
'use client';

import { ConnectButton } from '@rainbow-me/rainbowkit';

export default function Home() {
  return (
    <main className="max-w-4xl mx-auto p-6">
      <header className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold">OpenLend</h1>
        <ConnectButton />
      </header>
      <p className="text-zinc-400">Wallet provider wired. Dashboard next.</p>
    </main>
  );
}
```

- [ ] **Step 6: Build + dev smoke test**

```bash
cd /Users/long/Code/personal/iopn-builders/frontend && npm run build
```

Expected: succeeds. Then optionally `npm run dev` and load `http://localhost:3000` to see the ConnectButton. Kill the dev server before continuing.

- [ ] **Step 7: Commit**

```bash
cd /Users/long/Code/personal/iopn-builders
git add frontend/lib/chains.ts frontend/lib/wagmi.ts frontend/app/providers.tsx frontend/app/layout.tsx frontend/app/page.tsx
git -c user.email=vvlong.2k@gmail.com -c user.name="vvlong" commit -m "feat(frontend): wagmi + RainbowKit providers, IOPN chain config"
```

---

## Task F3: ABI + address loader + format helpers

**Files:**
- Create: `frontend/lib/contract.ts`
- Create: `frontend/lib/format.ts`

**Pre-req:** Hardhat artifacts must exist. From repo root: `npm run compile` (if not already). The implementer should run this if `artifacts/contracts/LendingPool.sol/LendingPool.json` is absent.

- [ ] **Step 1: Verify artifact exists**

Run from repo root:
```bash
ls /Users/long/Code/personal/iopn-builders/artifacts/contracts/LendingPool.sol/LendingPool.json
```

If missing, run: `cd /Users/long/Code/personal/iopn-builders && npm run compile`.

- [ ] **Step 2: Create `frontend/lib/contract.ts`**

```ts
import lendingPoolArtifact from '../../artifacts/contracts/LendingPool.sol/LendingPool.json';

export const lendingPoolAbi = lendingPoolArtifact.abi;

type DeploymentRecord = { lendingPool: `0x${string}`; chainId: number };

export const SUPPORTED_CHAIN_IDS = [984, 31337] as const;
export type SupportedChainId = (typeof SUPPORTED_CHAIN_IDS)[number];

export function getLendingPoolAddress(chainId: number): `0x${string}` | null {
  try {
    if (chainId === 984) {
      const d = require('../../deployments/iopnTestnet.json') as DeploymentRecord;
      return d.lendingPool;
    }
    if (chainId === 31337) {
      const d = require('../../deployments/hardhat.json') as DeploymentRecord;
      return d.lendingPool;
    }
  } catch {
    return null;
  }
  return null;
}
```

> Note: `require` is used (not `import`) because the deployment JSON files
> are optional at build time. If a file is missing, `require` throws, we
> catch, return `null`, and the UI surfaces a "deploy contract first"
> message.

- [ ] **Step 3: Create `frontend/lib/format.ts`**

```ts
import { formatUnits, parseUnits, maxUint256 } from 'viem';

export function formatOPN(wei: bigint | undefined, decimals = 4): string {
  if (wei === undefined) return '—';
  const full = formatUnits(wei, 18);
  const [intPart, fracPart = ''] = full.split('.');
  if (decimals <= 0) return intPart;
  return `${intPart}.${(fracPart + '0'.repeat(decimals)).slice(0, decimals)}`;
}

export function parseOPN(s: string): bigint {
  if (!s || s.trim() === '') throw new Error('empty');
  return parseUnits(s.trim(), 18);
}

export function formatHF(hf: bigint | undefined): { text: string; tone: 'green' | 'yellow' | 'red' | 'neutral' } {
  if (hf === undefined) return { text: '—', tone: 'neutral' };
  if (hf === maxUint256) return { text: '∞', tone: 'green' };
  const asNum = Number(formatUnits(hf, 18));
  const text = asNum.toFixed(2);
  if (asNum < 1) return { text, tone: 'red' };
  if (asNum < 1.2) return { text, tone: 'yellow' };
  return { text, tone: 'green' };
}

export function bpsToPct(bps: number): string {
  return `${(bps / 100).toFixed(2)}%`;
}

export function utilization(supplied: bigint | undefined, borrowed: bigint | undefined): string {
  if (!supplied || supplied === 0n) return '0.00%';
  if (!borrowed) return '0.00%';
  const pct = (Number(borrowed) / Number(supplied)) * 100;
  return `${pct.toFixed(2)}%`;
}
```

- [ ] **Step 4: Typecheck**

```bash
cd /Users/long/Code/personal/iopn-builders/frontend && npm run typecheck
```

Expected: no errors. If `require` complains in strict mode, ensure `tsconfig.json` has `"esModuleInterop": true` (it does per Task F1).

- [ ] **Step 5: Commit**

```bash
cd /Users/long/Code/personal/iopn-builders
git add frontend/lib/contract.ts frontend/lib/format.ts
git -c user.email=vvlong.2k@gmail.com -c user.name="vvlong" commit -m "feat(frontend): ABI import + address loader + format helpers"
```

---

## Task F4: ConnectGate component

**Files:**
- Create: `frontend/components/ConnectGate.tsx`

- [ ] **Step 1: Create `frontend/components/ConnectGate.tsx`**

```tsx
'use client';

import { ReactNode } from 'react';
import { useAccount, useChainId, useSwitchChain } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { iopnTestnet } from '../lib/chains';

interface Props {
  children: ReactNode;
}

export function ConnectGate({ children }: Props) {
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain, isPending: switching } = useSwitchChain();

  if (!isConnected) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-8 text-center">
        <p className="text-zinc-400 mb-4">Connect a wallet to use OpenLend.</p>
        <div className="inline-block">
          <ConnectButton />
        </div>
      </div>
    );
  }

  if (chainId !== iopnTestnet.id && chainId !== 31337) {
    return (
      <div className="rounded-xl border border-amber-700 bg-amber-950/40 p-8 text-center">
        <p className="text-amber-200 mb-4">
          Wrong network. OpenLend lives on IOPN Testnet (chainId 984).
        </p>
        <button
          onClick={() => switchChain({ chainId: iopnTestnet.id })}
          disabled={switching}
          className="rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-medium px-4 py-2"
        >
          {switching ? 'Switching…' : 'Switch to IOPN Testnet'}
        </button>
      </div>
    );
  }

  return <>{children}</>;
}
```

- [ ] **Step 2: Typecheck**

```bash
cd /Users/long/Code/personal/iopn-builders/frontend && npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/long/Code/personal/iopn-builders
git add frontend/components/ConnectGate.tsx
git -c user.email=vvlong.2k@gmail.com -c user.name="vvlong" commit -m "feat(frontend): ConnectGate gates UI on wallet + IOPN chain"
```

---

## Task F5: PoolStats component

**Files:**
- Create: `frontend/components/PoolStats.tsx`

- [ ] **Step 1: Create `frontend/components/PoolStats.tsx`**

```tsx
'use client';

import { useChainId, useReadContracts } from 'wagmi';
import { lendingPoolAbi, getLendingPoolAddress } from '../lib/contract';
import { formatOPN, bpsToPct, utilization } from '../lib/format';

export function PoolStats() {
  const chainId = useChainId();
  const address = getLendingPoolAddress(chainId);

  if (!address) {
    return (
      <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-6">
        <h2 className="text-xl font-semibold mb-2">Pool</h2>
        <p className="text-amber-200">
          No deployment found for chainId {chainId}. Run <code>npm run deploy:testnet</code> from the repo root first.
        </p>
      </section>
    );
  }

  const { data, isLoading } = useReadContracts({
    contracts: [
      { address, abi: lendingPoolAbi, functionName: 'totalSupplied' },
      { address, abi: lendingPoolAbi, functionName: 'totalBorrowed' },
      { address, abi: lendingPoolAbi, functionName: 'availableLiquidity' },
      { address, abi: lendingPoolAbi, functionName: 'RATE_BPS' },
    ],
    query: { refetchInterval: 5000 },
  });

  const supplied = data?.[0]?.result as bigint | undefined;
  const borrowed = data?.[1]?.result as bigint | undefined;
  const available = data?.[2]?.result as bigint | undefined;
  const rateBps = data?.[3]?.result as bigint | undefined;

  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-6">
      <h2 className="text-xl font-semibold mb-4">Pool</h2>
      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Stat label="Total supplied" value={isLoading ? '…' : `${formatOPN(supplied)} OPN`} />
        <Stat label="Total borrowed" value={isLoading ? '…' : `${formatOPN(borrowed)} OPN`} />
        <Stat label="Available" value={isLoading ? '…' : `${formatOPN(available)} OPN`} />
        <Stat label="APR / Utilization" value={isLoading ? '…' : `${bpsToPct(Number(rateBps ?? 0n))} / ${utilization(supplied, borrowed)}`} />
      </dl>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-zinc-500">{label}</dt>
      <dd className="text-lg font-medium">{value}</dd>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd /Users/long/Code/personal/iopn-builders/frontend && npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/long/Code/personal/iopn-builders
git add frontend/components/PoolStats.tsx
git -c user.email=vvlong.2k@gmail.com -c user.name="vvlong" commit -m "feat(frontend): PoolStats reads totals + APR with auto-refresh"
```

---

## Task F6: AccountStats component

**Files:**
- Create: `frontend/components/AccountStats.tsx`

- [ ] **Step 1: Create `frontend/components/AccountStats.tsx`**

```tsx
'use client';

import { useAccount, useBalance, useChainId, useReadContract } from 'wagmi';
import { lendingPoolAbi, getLendingPoolAddress } from '../lib/contract';
import { formatOPN, formatHF } from '../lib/format';

export function AccountStats() {
  const chainId = useChainId();
  const { address: user } = useAccount();
  const pool = getLendingPoolAddress(chainId);

  const { data: bal } = useBalance({ address: user, query: { refetchInterval: 5000 } });

  const { data: acct, isLoading } = useReadContract({
    address: pool ?? undefined,
    abi: lendingPoolAbi,
    functionName: 'getAccountData',
    args: user ? [user] : undefined,
    query: { enabled: Boolean(user && pool), refetchInterval: 5000 },
  });

  // getAccountData returns (uint256 userCollateral, uint256 userDebt, uint256 hf, uint256 shares)
  const tuple = acct as [bigint, bigint, bigint, bigint] | undefined;
  const collateral = tuple?.[0];
  const debt = tuple?.[1];
  const hf = tuple?.[2];
  const shares = tuple?.[3];

  const hfFmt = formatHF(hf);
  const hfClass =
    hfFmt.tone === 'red'
      ? 'text-red-400'
      : hfFmt.tone === 'yellow'
      ? 'text-amber-300'
      : hfFmt.tone === 'green'
      ? 'text-emerald-400'
      : 'text-zinc-300';

  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-6">
      <h2 className="text-xl font-semibold mb-4">Your account</h2>
      <dl className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <Stat label="Wallet balance" value={`${formatOPN(bal?.value)} OPN`} />
        <Stat label="Collateral" value={isLoading ? '…' : `${formatOPN(collateral)} OPN`} />
        <Stat label="Debt" value={isLoading ? '…' : `${formatOPN(debt)} OPN`} />
        <Stat label="Supply shares" value={isLoading ? '…' : formatOPN(shares)} />
        <Stat label="Health factor" value={isLoading ? '…' : hfFmt.text} valueClass={hfClass} />
      </dl>
    </section>
  );
}

function Stat({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-zinc-500">{label}</dt>
      <dd className={`text-lg font-medium ${valueClass ?? ''}`}>{value}</dd>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd /Users/long/Code/personal/iopn-builders/frontend && npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/long/Code/personal/iopn-builders
git add frontend/components/AccountStats.tsx
git -c user.email=vvlong.2k@gmail.com -c user.name="vvlong" commit -m "feat(frontend): AccountStats reads getAccountData + native balance"
```

---

## Task F7: ActionPanel component (supply/withdraw/borrow/repay)

**Files:**
- Create: `frontend/components/ActionPanel.tsx`

- [ ] **Step 1: Create `frontend/components/ActionPanel.tsx`**

```tsx
'use client';

import { useState } from 'react';
import {
  useChainId,
  useWriteContract,
  useWaitForTransactionReceipt,
  usePublicClient,
} from 'wagmi';
import { lendingPoolAbi, getLendingPoolAddress } from '../lib/contract';
import { iopnTestnet } from '../lib/chains';
import { parseOPN } from '../lib/format';

type Kind = 'supply' | 'withdraw' | 'borrow' | 'repay';

interface Props {
  kind: Kind;
}

const META: Record<
  Kind,
  {
    title: string;
    primaryLabel: string;
    secondaryLabel?: string;
    primaryPlaceholder: string;
    secondaryPlaceholder?: string;
    description: string;
  }
> = {
  supply: {
    title: 'Supply',
    primaryLabel: 'OPN to supply',
    primaryPlaceholder: '0.0',
    description: 'Deposit OPN into the pool. Receive shares; earn 5% APR.',
  },
  withdraw: {
    title: 'Withdraw',
    primaryLabel: 'Shares to burn',
    primaryPlaceholder: '0.0',
    description: 'Burn shares to redeem underlying OPN + accrued interest.',
  },
  borrow: {
    title: 'Borrow',
    primaryLabel: 'Collateral OPN to add',
    secondaryLabel: 'OPN to borrow',
    primaryPlaceholder: '0.0',
    secondaryPlaceholder: '0.0',
    description: 'Deposit collateral and borrow OPN (up to 75% LTV).',
  },
  repay: {
    title: 'Repay',
    primaryLabel: 'OPN to repay',
    primaryPlaceholder: '0.0',
    description: 'Repay outstanding debt. Excess refunded.',
  },
};

export function ActionPanel({ kind }: Props) {
  const meta = META[kind];
  const chainId = useChainId();
  const pool = getLendingPoolAddress(chainId);
  const publicClient = usePublicClient();
  const [primary, setPrimary] = useState('');
  const [secondary, setSecondary] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<'idle' | 'signing' | 'pending' | 'success'>('idle');

  const { writeContractAsync, data: txHash, reset } = useWriteContract();
  const { isLoading: receiptLoading, isSuccess: receiptSuccess } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  const reload = () => {
    setError(null);
    setPhase('idle');
    setPrimary('');
    setSecondary('');
    reset();
  };

  const onSubmit = async () => {
    if (!pool) {
      setError('No deployment for this network.');
      return;
    }
    if (!publicClient) {
      setError('No RPC client available.');
      return;
    }
    setError(null);
    try {
      setPhase('signing');
      if (kind === 'supply') {
        const value = parseOPN(primary);
        if (value <= 0n) throw new Error('Amount must be > 0');
        const hash = await writeContractAsync({
          address: pool,
          abi: lendingPoolAbi,
          functionName: 'supply',
          value,
        });
        setPhase('pending');
        await publicClient.waitForTransactionReceipt({ hash });
      } else if (kind === 'withdraw') {
        const shares = parseOPN(primary);
        if (shares <= 0n) throw new Error('Shares must be > 0');
        const hash = await writeContractAsync({
          address: pool,
          abi: lendingPoolAbi,
          functionName: 'withdraw',
          args: [shares],
        });
        setPhase('pending');
        await publicClient.waitForTransactionReceipt({ hash });
      } else if (kind === 'borrow') {
        const collateral = parseOPN(primary);
        const amount = parseOPN(secondary);
        if (collateral <= 0n || amount <= 0n) throw new Error('Both amounts must be > 0');
        const h1 = await writeContractAsync({
          address: pool,
          abi: lendingPoolAbi,
          functionName: 'depositCollateral',
          value: collateral,
        });
        setPhase('pending');
        await publicClient.waitForTransactionReceipt({ hash: h1 });
        setPhase('signing');
        const h2 = await writeContractAsync({
          address: pool,
          abi: lendingPoolAbi,
          functionName: 'borrow',
          args: [amount],
        });
        setPhase('pending');
        await publicClient.waitForTransactionReceipt({ hash: h2 });
      } else if (kind === 'repay') {
        const value = parseOPN(primary);
        if (value <= 0n) throw new Error('Amount must be > 0');
        const hash = await writeContractAsync({
          address: pool,
          abi: lendingPoolAbi,
          functionName: 'repay',
          value,
        });
        setPhase('pending');
        await publicClient.waitForTransactionReceipt({ hash });
      }
      setPhase('success');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // User rejected in wallet → friendlier message.
      setError(msg.includes('User rejected') ? 'Rejected in wallet.' : msg);
      setPhase('idle');
    }
  };

  const status =
    error ? `Error: ${error}` :
    phase === 'signing' ? 'Confirm in wallet…' :
    phase === 'pending' ? 'Pending…' :
    phase === 'success' ? 'Confirmed ✓' :
    '';

  const explorer = txHash ? `${iopnTestnet.blockExplorers.default.url}/tx/${txHash}` : null;

  const busy = phase === 'signing' || phase === 'pending';

  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-6">
      <h3 className="text-lg font-semibold mb-1">{meta.title}</h3>
      <p className="text-sm text-zinc-400 mb-4">{meta.description}</p>
      <div className="space-y-3">
        <label className="block">
          <span className="text-xs uppercase tracking-wide text-zinc-500">{meta.primaryLabel}</span>
          <input
            value={primary}
            onChange={(e) => setPrimary(e.target.value)}
            placeholder={meta.primaryPlaceholder}
            inputMode="decimal"
            disabled={busy}
            className="mt-1 w-full rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 outline-none focus:border-emerald-500 disabled:opacity-50"
          />
        </label>
        {meta.secondaryLabel && (
          <label className="block">
            <span className="text-xs uppercase tracking-wide text-zinc-500">{meta.secondaryLabel}</span>
            <input
              value={secondary}
              onChange={(e) => setSecondary(e.target.value)}
              placeholder={meta.secondaryPlaceholder}
              inputMode="decimal"
              disabled={busy}
              className="mt-1 w-full rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 outline-none focus:border-emerald-500 disabled:opacity-50"
            />
          </label>
        )}
        <button
          onClick={onSubmit}
          disabled={busy || !pool}
          className="w-full rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-medium px-4 py-2"
        >
          {busy ? '…' : meta.title}
        </button>
        {status && (
          <div className="text-sm text-zinc-400 flex items-center gap-2">
            <span>{status}</span>
            {explorer && (
              <a
                className="text-emerald-400 underline"
                target="_blank"
                rel="noopener noreferrer"
                href={explorer}
              >
                tx
              </a>
            )}
            {phase === 'success' && (
              <button className="text-zinc-500 underline" onClick={reload}>
                reset
              </button>
            )}
          </div>
        )}
      </div>
      {/* Touched only to satisfy the linter — these hooks drive the wagmi cache invalidation. */}
      <span className="hidden">{receiptLoading ? '1' : '0'}{receiptSuccess ? '1' : '0'}</span>
    </section>
  );
}
```

> Note: We use `writeContractAsync` + `publicClient.waitForTransactionReceipt`
> to chain transactions cleanly (especially the two-step borrow flow). The
> `useWaitForTransactionReceipt` hook is kept so wagmi's read cache invalidates
> on confirmation; its values are read but not displayed (the local `phase`
> state machine drives UI).

- [ ] **Step 2: Typecheck**

```bash
cd /Users/long/Code/personal/iopn-builders/frontend && npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/long/Code/personal/iopn-builders
git add frontend/components/ActionPanel.tsx
git -c user.email=vvlong.2k@gmail.com -c user.name="vvlong" commit -m "feat(frontend): ActionPanel for supply/withdraw/borrow/repay"
```

---

## Task F8: Compose page + final smoke test

**Files:**
- Modify: `frontend/app/page.tsx`

- [ ] **Step 1: Replace `frontend/app/page.tsx` with the full dashboard**

```tsx
'use client';

import { ConnectButton } from '@rainbow-me/rainbowkit';
import { ConnectGate } from '../components/ConnectGate';
import { PoolStats } from '../components/PoolStats';
import { AccountStats } from '../components/AccountStats';
import { ActionPanel } from '../components/ActionPanel';

export default function Home() {
  return (
    <main className="max-w-4xl mx-auto p-6 space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">OpenLend</h1>
          <p className="text-sm text-zinc-400">Single-asset borrow/lend on IOPN testnet</p>
        </div>
        <ConnectButton />
      </header>

      <ConnectGate>
        <PoolStats />
        <AccountStats />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <ActionPanel kind="supply" />
          <ActionPanel kind="withdraw" />
          <ActionPanel kind="borrow" />
          <ActionPanel kind="repay" />
        </div>
      </ConnectGate>
    </main>
  );
}
```

- [ ] **Step 2: Build**

```bash
cd /Users/long/Code/personal/iopn-builders/frontend && npm run build
```

Expected: succeeds with no errors.

- [ ] **Step 3: Typecheck**

```bash
cd /Users/long/Code/personal/iopn-builders/frontend && npm run typecheck
```

Expected: no errors.

- [ ] **Step 4: (Optional but recommended) Local end-to-end smoke test**

In two terminals:

```bash
# Terminal 1 — local node
cd /Users/long/Code/personal/iopn-builders && npx hardhat node
```

```bash
# Terminal 2 — deploy + dev server
cd /Users/long/Code/personal/iopn-builders
npx hardhat run scripts/deploy.ts --network localhost
cd frontend && npm run dev
```

Visit http://localhost:3000. Connect via MetaMask (add `localhost:8545` chainId 31337 as a custom network), import one of the Hardhat default accounts, and verify:
- ConnectGate works
- PoolStats renders zeros
- Supply 1 OPN: wallet pops, tx confirms, PoolStats refreshes
- Borrow flow: enter collateral=2 and borrow=1, confirm both txs, AccountStats reflects debt

Document any issues. If everything works, kill both servers.

- [ ] **Step 5: Commit**

```bash
cd /Users/long/Code/personal/iopn-builders
git add frontend/app/page.tsx
git -c user.email=vvlong.2k@gmail.com -c user.name="vvlong" commit -m "feat(frontend): compose dashboard page with stats + 4 action panels"
```

---

## Task F9: Root README addendum + dev workflow note

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Append a "Frontend" section to root README**

After the "Interact" section in `README.md`, add:

```markdown
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
```

- [ ] **Step 2: Commit**

```bash
cd /Users/long/Code/personal/iopn-builders
git add README.md
git -c user.email=vvlong.2k@gmail.com -c user.name="vvlong" commit -m "docs: add frontend section to README"
```

---

## Self-Review Checklist

- All spec sections covered (§1–§14)
- No placeholders / TBDs
- ABI import path correct relative to `frontend/lib/contract.ts` → `../../artifacts/contracts/LendingPool.sol/LendingPool.json`
- Address loader handles missing deployment JSON gracefully (returns null)
- Types consistent: `getAccountData` returns `[bigint, bigint, bigint, bigint]`
- `getLendingPoolAddress` typed `(chainId: number) => 0x${string} | null`
- All write actions wired to wagmi `useWriteContract`
- No client-only code (`use client` directives) leaks into server components
- Tailwind content paths cover `app/` and `components/`
- Tests not required for frontend in v1.1 (manual smoke test in F8 Step 4)
