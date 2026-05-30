# OpenSwap Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a minimal Next.js dApp under `openswap/frontend/` that lets a wallet-connected user swap native OPN ↔ mUSDC, add/remove liquidity, and mint mUSDC from the faucet against the deployed `OpenSwapPair` (chainId 984).

**Architecture:** Next.js 14 App Router, single page, three tabs (Swap | Liquidity | Faucet) above a sticky pool-stats card. wagmi v2 reads via `useReadContract` (per-block refresh); writes via `useWriteContract.writeContractAsync` + the public client's `waitForTransactionReceipt` for clean tx chaining. ABIs are bundled in `frontend/lib/abi/` so Vercel can build standalone; contract addresses come from per-chain env vars.

**Tech Stack:**
- Next.js 14.2 (App Router)
- React 18.3
- TypeScript 5.4 strict
- wagmi v2 + viem v2
- @rainbow-me/rainbowkit v2
- @tanstack/react-query v5
- Tailwind CSS v3.4

**Spec reference:** [docs/superpowers/specs/2026-05-29-openswap-frontend-design.md](../specs/2026-05-29-openswap-frontend-design.md)

---

## File Map

| File | Responsibility |
|------|----------------|
| `frontend/package.json` | deps + scripts (dev/build/start/typecheck/sync:local/sync:testnet) |
| `frontend/tsconfig.json` | TS strict |
| `frontend/next.config.js` | Next config + MetaMask SDK alias fix |
| `frontend/tailwind.config.ts` | Tailwind content paths |
| `frontend/postcss.config.js` | Tailwind PostCSS |
| `frontend/.env.example` | placeholders for WC + 4 address keys |
| `frontend/.gitignore` | node_modules, .next, .env, etc. |
| `frontend/app/layout.tsx` | HTML shell + `<Providers>` |
| `frontend/app/providers.tsx` | Wagmi + RainbowKit + React Query providers |
| `frontend/app/page.tsx` | Top-level page (header + PoolStats + TabSwitcher) |
| `frontend/app/globals.css` | Tailwind directives |
| `frontend/lib/chains.ts` | IOPN testnet chain definition |
| `frontend/lib/wagmi.ts` | wagmi config |
| `frontend/lib/contract.ts` | ABI imports + per-chain address loaders |
| `frontend/lib/format.ts` | bigint <> string helpers |
| `frontend/lib/abi/OpenSwapPair.json` | bundled ABI |
| `frontend/lib/abi/MockUSDC.json` | bundled ABI |
| `frontend/scripts/sync-address.mjs` | Copy deployment addresses to .env.local |
| `frontend/components/ConnectGate.tsx` | Wallet + network guard |
| `frontend/components/PoolStats.tsx` | Reserves, price, fees, total LP, user share |
| `frontend/components/TabSwitcher.tsx` | Swap / Liquidity / Faucet w/ URL hash sync |
| `frontend/components/SwapPanel.tsx` | From/to inputs, flip, slippage, swap CTA |
| `frontend/components/LiquidityPanel.tsx` | Add/Remove sub-toggle, auto-pair inputs |
| `frontend/components/FaucetPanel.tsx` | mUSDC mint form |
| `frontend/components/ui/TokenInput.tsx` | Reusable amount input + suffix + MAX |
| `frontend/components/ui/SlippageSelector.tsx` | Preset chips + custom input |

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
- Create: `frontend/app/layout.tsx` (placeholder)
- Create: `frontend/app/page.tsx` (placeholder)

- [ ] **Step 1: Create `frontend/package.json`**

```json
{
  "name": "openswap-frontend",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "typecheck": "tsc --noEmit",
    "sync:local": "node scripts/sync-address.mjs hardhat",
    "sync:testnet": "node scripts/sync-address.mjs iopnTestnet"
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
    config.externals.push('pino-pretty', 'lokijs', 'encoding');
    // MetaMask SDK references React-Native async-storage; web builds don't have it.
    config.resolve.alias = {
      ...config.resolve.alias,
      '@react-native-async-storage/async-storage': false,
    };
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
  theme: { extend: {} },
  plugins: [],
};

export default config;
```

- [ ] **Step 6: Create `frontend/.env.example`**

```
# Optional. Get one free at https://cloud.walletconnect.com/.
# Frontend works without it (MetaMask/injected wallets still connect).
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=

# OpenSwap contract addresses (one per chain).
# Set after running `npm run deploy:testnet` from the repo root, then `npm run sync:testnet` here.
NEXT_PUBLIC_OPENSWAP_PAIR_TESTNET=
NEXT_PUBLIC_MOCK_USDC_TESTNET=

# Hardhat local (chainId 31337) — populated by `npm run sync:local`.
NEXT_PUBLIC_OPENSWAP_PAIR_LOCAL=
NEXT_PUBLIC_MOCK_USDC_LOCAL=
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

:root { color-scheme: dark; }
html, body { height: 100%; }
```

- [ ] **Step 9: Create placeholder `frontend/app/layout.tsx`**

```tsx
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'OpenSwap',
  description: 'Minimal OPN/mUSDC AMM on IOPN testnet',
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
      <h1 className="text-3xl font-bold">OpenSwap</h1>
      <p className="text-zinc-400">Frontend scaffold OK.</p>
    </main>
  );
}
```

- [ ] **Step 11: Install deps**

```bash
cd /Users/long/Code/personal/openswap/frontend && npm install
```

Expected: completes without errors.

- [ ] **Step 12: Build smoke test**

```bash
cd /Users/long/Code/personal/openswap/frontend && npm run build
```

Expected: `next build` finishes successfully.

- [ ] **Step 13: Commit**

```bash
cd /Users/long/Code/personal/openswap
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
- Modify: `frontend/app/page.tsx`

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

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? 'openswap-no-wc';

export const wagmiConfig = getDefaultConfig({
  appName: 'OpenSwap',
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

- [ ] **Step 4: Replace `frontend/app/layout.tsx`**

```tsx
import type { Metadata } from 'next';
import { Providers } from './providers';
import './globals.css';

export const metadata: Metadata = {
  title: 'OpenSwap',
  description: 'Minimal OPN/mUSDC AMM on IOPN testnet',
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

- [ ] **Step 5: Replace `frontend/app/page.tsx` with ConnectButton sanity**

```tsx
'use client';

import { ConnectButton } from '@rainbow-me/rainbowkit';

export default function Home() {
  return (
    <main className="max-w-4xl mx-auto p-6">
      <header className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold">OpenSwap</h1>
        <ConnectButton />
      </header>
      <p className="text-zinc-400">Wallet provider wired. Dashboard next.</p>
    </main>
  );
}
```

- [ ] **Step 6: Build smoke test**

```bash
cd /Users/long/Code/personal/openswap/frontend && npm run build
```

Expected: succeeds.

- [ ] **Step 7: Commit**

```bash
cd /Users/long/Code/personal/openswap
git add frontend/lib/chains.ts frontend/lib/wagmi.ts frontend/app/providers.tsx frontend/app/layout.tsx frontend/app/page.tsx
git -c user.email=vvlong.2k@gmail.com -c user.name="vvlong" commit -m "feat(frontend): wagmi + RainbowKit providers, IOPN chain config"
```

---

## Task F3: Bundled ABIs + address loader + format helpers + sync script

**Files:**
- Create: `frontend/lib/abi/OpenSwapPair.json`
- Create: `frontend/lib/abi/MockUSDC.json`
- Create: `frontend/lib/contract.ts`
- Create: `frontend/lib/format.ts`
- Create: `frontend/scripts/sync-address.mjs`

- [ ] **Step 1: Extract ABIs from artifacts**

Run from `openswap/` root (artifacts must exist; if not, `npm run compile` first):

```bash
mkdir -p /Users/long/Code/personal/openswap/frontend/lib/abi
node -e "const a=require('/Users/long/Code/personal/openswap/artifacts/contracts/OpenSwapPair.sol/OpenSwapPair.json');require('fs').writeFileSync('/Users/long/Code/personal/openswap/frontend/lib/abi/OpenSwapPair.json',JSON.stringify({abi:a.abi},null,2));"
node -e "const a=require('/Users/long/Code/personal/openswap/artifacts/contracts/MockUSDC.sol/MockUSDC.json');require('fs').writeFileSync('/Users/long/Code/personal/openswap/frontend/lib/abi/MockUSDC.json',JSON.stringify({abi:a.abi},null,2));"
```

Verify:
```bash
ls -la /Users/long/Code/personal/openswap/frontend/lib/abi/
```

Expected: two `.json` files, non-zero size.

- [ ] **Step 2: Create `frontend/lib/contract.ts`**

```ts
import OpenSwapPairJson from './abi/OpenSwapPair.json';
import MockUSDCJson from './abi/MockUSDC.json';

export const openSwapPairAbi = OpenSwapPairJson.abi;
export const mockUSDCAbi = MockUSDCJson.abi;

type Hex = `0x${string}`;
const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

export const SUPPORTED_CHAIN_IDS = [984, 31337] as const;
export type SupportedChainId = (typeof SUPPORTED_CHAIN_IDS)[number];

/**
 * Address sources:
 *   - chainId 984   → NEXT_PUBLIC_OPENSWAP_PAIR_TESTNET / NEXT_PUBLIC_MOCK_USDC_TESTNET
 *   - chainId 31337 → NEXT_PUBLIC_OPENSWAP_PAIR_LOCAL   / NEXT_PUBLIC_MOCK_USDC_LOCAL
 * Set via .env.local (dev) or Vercel project settings (prod).
 */
export function getPairAddress(chainId: number): Hex | null {
  const raw =
    chainId === 984
      ? process.env.NEXT_PUBLIC_OPENSWAP_PAIR_TESTNET
      : chainId === 31337
      ? process.env.NEXT_PUBLIC_OPENSWAP_PAIR_LOCAL
      : undefined;
  if (raw && ADDRESS_RE.test(raw)) return raw as Hex;
  return null;
}

export function getMockUSDCAddress(chainId: number): Hex | null {
  const raw =
    chainId === 984
      ? process.env.NEXT_PUBLIC_MOCK_USDC_TESTNET
      : chainId === 31337
      ? process.env.NEXT_PUBLIC_MOCK_USDC_LOCAL
      : undefined;
  if (raw && ADDRESS_RE.test(raw)) return raw as Hex;
  return null;
}
```

- [ ] **Step 3: Create `frontend/lib/format.ts`**

```ts
import { formatUnits, parseUnits } from 'viem';

export function formatOPN(wei: bigint | undefined, decimals = 4): string {
  return formatBigInt(wei, 18, decimals);
}

export function formatMUSDC(value: bigint | undefined, decimals = 2): string {
  return formatBigInt(value, 6, decimals);
}

/** LP token is 18-decimals (ERC20 default). */
export function formatLP(value: bigint | undefined, decimals = 4): string {
  return formatBigInt(value, 18, decimals);
}

function formatBigInt(value: bigint | undefined, unitDecimals: number, displayDecimals: number): string {
  if (value === undefined) return '—';
  const full = formatUnits(value, unitDecimals);
  const [intPart, fracPart = ''] = full.split('.');
  if (displayDecimals <= 0) return intPart;
  return `${intPart}.${(fracPart + '0'.repeat(displayDecimals)).slice(0, displayDecimals)}`;
}

export function parseOPN(s: string): bigint {
  if (!s || s.trim() === '') throw new Error('empty');
  return parseUnits(s.trim(), 18);
}

export function parseMUSDC(s: string): bigint {
  if (!s || s.trim() === '') throw new Error('empty');
  return parseUnits(s.trim(), 6);
}

export function parseLP(s: string): bigint {
  if (!s || s.trim() === '') throw new Error('empty');
  return parseUnits(s.trim(), 18);
}

/**
 * minOut = quote × (10000 - slippageBps) / 10000
 */
export function applySlippage(quote: bigint, slippageBps: number): bigint {
  const bps = BigInt(Math.max(0, Math.min(10000, Math.floor(slippageBps))));
  return (quote * (10000n - bps)) / 10000n;
}
```

- [ ] **Step 4: Create `frontend/scripts/sync-address.mjs`**

```javascript
#!/usr/bin/env node
/* eslint-disable */
// Sync OpenSwap pair + mUSDC addresses from ../deployments/<network>.json
// into frontend/.env.local. Usage:
//   node scripts/sync-address.mjs hardhat        → writes _LOCAL keys
//   node scripts/sync-address.mjs iopnTestnet    → writes _TESTNET keys
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const network = process.argv[2];
if (!network) {
  console.error('Usage: node scripts/sync-address.mjs <hardhat|iopnTestnet>');
  process.exit(1);
}

const SUFFIX =
  network === 'iopnTestnet' ? 'TESTNET' :
  network === 'hardhat' ? 'LOCAL' :
  null;
if (!SUFFIX) {
  console.error(`Unknown network "${network}". Use "hardhat" or "iopnTestnet".`);
  process.exit(1);
}

const deploymentFile = path.join(here, '..', '..', 'deployments', `${network}.json`);
if (!fs.existsSync(deploymentFile)) {
  console.error(`Missing ${deploymentFile}. Deploy contracts first.`);
  process.exit(1);
}

const d = JSON.parse(fs.readFileSync(deploymentFile, 'utf8'));
if (!d.openSwapPair || !d.mUSDC) {
  console.error(`Missing openSwapPair or mUSDC in ${deploymentFile}`);
  process.exit(1);
}

const envFile = path.join(here, '..', '.env.local');
let current = fs.existsSync(envFile) ? fs.readFileSync(envFile, 'utf8') : '';

function setKey(key, value) {
  const re = new RegExp(`^${key}=.*$`, 'm');
  const line = `${key}=${value}`;
  if (re.test(current)) {
    current = current.replace(re, line);
  } else {
    current = current.trim() + (current.trim() ? '\n' : '') + line + '\n';
  }
}

setKey(`NEXT_PUBLIC_OPENSWAP_PAIR_${SUFFIX}`, d.openSwapPair);
setKey(`NEXT_PUBLIC_MOCK_USDC_${SUFFIX}`, d.mUSDC);

fs.writeFileSync(envFile, current);
console.log(`Wrote ${SUFFIX} addresses → ${envFile}`);
console.log(`  NEXT_PUBLIC_OPENSWAP_PAIR_${SUFFIX}=${d.openSwapPair}`);
console.log(`  NEXT_PUBLIC_MOCK_USDC_${SUFFIX}=${d.mUSDC}`);
```

- [ ] **Step 5: Typecheck**

```bash
cd /Users/long/Code/personal/openswap/frontend && npm run typecheck
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
cd /Users/long/Code/personal/openswap
git add frontend/lib/abi/OpenSwapPair.json frontend/lib/abi/MockUSDC.json frontend/lib/contract.ts frontend/lib/format.ts frontend/scripts/sync-address.mjs
git -c user.email=vvlong.2k@gmail.com -c user.name="vvlong" commit -m "feat(frontend): bundled ABIs, address loaders, format helpers, sync script"
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
        <p className="text-zinc-400 mb-4">Connect a wallet to use OpenSwap.</p>
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
          Wrong network. OpenSwap lives on IOPN Testnet (chainId 984).
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
cd /Users/long/Code/personal/openswap/frontend && npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/long/Code/personal/openswap
git add frontend/components/ConnectGate.tsx
git -c user.email=vvlong.2k@gmail.com -c user.name="vvlong" commit -m "feat(frontend): ConnectGate gates UI on wallet + IOPN chain"
```

---

## Task F5: Shared UI primitives — TokenInput + SlippageSelector

**Files:**
- Create: `frontend/components/ui/TokenInput.tsx`
- Create: `frontend/components/ui/SlippageSelector.tsx`

- [ ] **Step 1: Create `frontend/components/ui/TokenInput.tsx`**

```tsx
'use client';

type Unit = 'OPN' | 'mUSDC' | 'LP';
type Accent = 'emerald' | 'sky' | 'amber' | 'violet';

const ACCENT_TEXT: Record<Accent, string> = {
  emerald: 'text-emerald-400',
  sky: 'text-sky-400',
  amber: 'text-amber-400',
  violet: 'text-violet-400',
};

export interface TokenInputProps {
  label: string;
  value: string;
  onChange?: (s: string) => void; // omit → read-only
  unit: Unit;
  disabled?: boolean;
  placeholder?: string;
  maxValue?: bigint;
  maxLabel?: string;
  maxFormatted?: string; // human-readable "1.2345 OPN" — caller formats
  onMax?: () => void;
  accent?: Accent;
}

export function TokenInput({
  label,
  value,
  onChange,
  unit,
  disabled,
  placeholder = '0.0',
  maxValue,
  maxLabel,
  maxFormatted,
  onMax,
  accent = 'emerald',
}: TokenInputProps) {
  const readOnly = onChange === undefined;
  const hasMax = onMax !== undefined;
  const maxDisabled = disabled || !maxValue || maxValue === 0n;
  const accentClass = ACCENT_TEXT[accent];

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-xs uppercase tracking-wide">
        <span className="text-zinc-500">{label}</span>
        {hasMax && (
          <button
            type="button"
            disabled={maxDisabled}
            onClick={onMax}
            className={`rounded bg-zinc-800 px-2 py-0.5 text-[10px] font-semibold tracking-wider transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-30 ${accentClass}`}
          >
            MAX
          </button>
        )}
      </div>
      <div
        className={`flex items-center rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 transition focus-within:border-emerald-500 ${
          disabled || readOnly ? 'opacity-80' : ''
        }`}
      >
        <input
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          placeholder={placeholder}
          inputMode="decimal"
          readOnly={readOnly}
          disabled={disabled}
          className="min-w-0 flex-1 bg-transparent text-lg font-medium outline-none disabled:opacity-50"
        />
        <span className="ml-2 text-sm font-medium text-zinc-500">{unit}</span>
      </div>
      {hasMax && (maxFormatted || maxLabel) && (
        <div className="mt-1 text-[11px] text-zinc-500">
          {maxLabel ?? 'Available'}: {maxFormatted ?? '—'}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create `frontend/components/ui/SlippageSelector.tsx`**

```tsx
'use client';

import { useState } from 'react';

const PRESETS: { label: string; bps: number }[] = [
  { label: '0.5%', bps: 50 },
  { label: '1.0%', bps: 100 },
  { label: '3.0%', bps: 300 },
];

export interface SlippageSelectorProps {
  valueBps: number;
  onChange: (bps: number) => void;
  disabled?: boolean;
}

export function SlippageSelector({ valueBps, onChange, disabled }: SlippageSelectorProps) {
  const matchesPreset = PRESETS.some((p) => p.bps === valueBps);
  const [showCustom, setShowCustom] = useState(!matchesPreset);
  const [customText, setCustomText] = useState(
    matchesPreset ? '' : (valueBps / 100).toFixed(2),
  );

  const onPresetClick = (bps: number) => {
    setShowCustom(false);
    onChange(bps);
  };

  const onCustomClick = () => {
    setShowCustom(true);
    if (customText === '') {
      setCustomText('1.00');
      onChange(100);
    }
  };

  const onCustomChange = (s: string) => {
    setCustomText(s);
    const parsed = parseFloat(s);
    if (!Number.isFinite(parsed)) return;
    const bps = Math.max(1, Math.min(5000, Math.round(parsed * 100)));
    onChange(bps);
  };

  return (
    <div>
      <div className="mb-1.5 text-xs uppercase tracking-wide text-zinc-500">Slippage</div>
      <div className="flex flex-wrap items-center gap-2">
        {PRESETS.map((p) => {
          const active = !showCustom && p.bps === valueBps;
          return (
            <button
              key={p.bps}
              type="button"
              disabled={disabled}
              onClick={() => onPresetClick(p.bps)}
              className={
                'rounded-md px-3 py-1 text-sm font-medium transition disabled:opacity-50 ' +
                (active
                  ? 'bg-emerald-500 text-black'
                  : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700')
              }
            >
              {p.label}
            </button>
          );
        })}
        <button
          type="button"
          disabled={disabled}
          onClick={onCustomClick}
          className={
            'rounded-md px-3 py-1 text-sm font-medium transition disabled:opacity-50 ' +
            (showCustom
              ? 'bg-emerald-500 text-black'
              : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700')
          }
        >
          Custom
        </button>
        {showCustom && (
          <div className="flex items-center gap-1 rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1">
            <input
              value={customText}
              onChange={(e) => onCustomChange(e.target.value)}
              placeholder="0.00"
              inputMode="decimal"
              disabled={disabled}
              className="w-14 bg-transparent text-sm text-zinc-200 outline-none"
            />
            <span className="text-xs text-zinc-500">%</span>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

```bash
cd /Users/long/Code/personal/openswap/frontend && npm run typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd /Users/long/Code/personal/openswap
git add frontend/components/ui/TokenInput.tsx frontend/components/ui/SlippageSelector.tsx
git -c user.email=vvlong.2k@gmail.com -c user.name="vvlong" commit -m "feat(frontend): TokenInput + SlippageSelector primitives"
```

---

## Task F6: PoolStats component

**Files:**
- Create: `frontend/components/PoolStats.tsx`

- [ ] **Step 1: Create `frontend/components/PoolStats.tsx`**

```tsx
'use client';

import { useAccount, useChainId, useReadContracts } from 'wagmi';
import { openSwapPairAbi, getPairAddress } from '../lib/contract';
import { formatOPN, formatMUSDC, formatLP } from '../lib/format';

export function PoolStats() {
  const chainId = useChainId();
  const { address: user } = useAccount();
  const pair = getPairAddress(chainId);

  const { data, isLoading } = useReadContracts({
    contracts: pair
      ? [
          { address: pair, abi: openSwapPairAbi, functionName: 'getReserves' },
          { address: pair, abi: openSwapPairAbi, functionName: 'totalSupply' },
          {
            address: pair,
            abi: openSwapPairAbi,
            functionName: 'balanceOf',
            args: user ? [user] : undefined,
          },
        ]
      : [],
    query: {
      refetchInterval: 5000,
      enabled: Boolean(pair),
    },
  });

  const reservesTuple = data?.[0]?.result as
    | readonly [bigint, bigint, number]
    | undefined;
  const totalSupply = data?.[1]?.result as bigint | undefined;
  const userLP = data?.[2]?.result as bigint | undefined;

  const reserveOPN = reservesTuple?.[0];
  const reserveMUSDC = reservesTuple?.[1];

  // Spot price: mUSDC per 1 OPN, accounting for decimals (mUSDC 6, OPN 18).
  let priceText = '—';
  if (reserveOPN && reserveMUSDC && reserveOPN > 0n) {
    // (reserveMUSDC * 1e18) / reserveOPN scaled then format using 6 decimals of mUSDC.
    const priceWei = (reserveMUSDC * 10n ** 18n) / reserveOPN;
    priceText = formatMUSDC(priceWei);
  }

  // User share excluding the MINIMUM_LIQUIDITY lock at 0xdead.
  let sharePct = '—';
  if (totalSupply !== undefined && totalSupply > 0n && userLP !== undefined) {
    const pctBp = Number((userLP * 10000n) / totalSupply);
    sharePct = (pctBp / 100).toFixed(2);
  }

  if (!pair) {
    return (
      <Card>
        <Header />
        <p className="mt-4 text-sm text-amber-300/90">
          No OpenSwap deployment for chainId {chainId}. Run{' '}
          <code className="text-amber-200">npm run deploy:testnet</code> from the repo root,
          then <code className="text-amber-200">npm run sync:testnet</code> in this folder.
        </p>
      </Card>
    );
  }

  return (
    <Card>
      <Header />
      <dl className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="OPN reserves" value={isLoading ? '…' : `${formatOPN(reserveOPN)} OPN`} />
        <Stat label="mUSDC reserves" value={isLoading ? '…' : `${formatMUSDC(reserveMUSDC)} mUSDC`} />
        <Stat label="Spot price" value={isLoading ? '…' : `${priceText} mUSDC/OPN`} />
        <Stat label="Your LP share" value={isLoading ? '…' : `${sharePct}%`} />
      </dl>
      <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-zinc-500">
        <span>Total LP: {isLoading ? '…' : formatLP(totalSupply)}</span>
        <span>•</span>
        <span>Swap fee: 0.30%</span>
        <span>•</span>
        <span>Your LP: {isLoading ? '…' : formatLP(userLP)}</span>
      </div>
    </Card>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <section className="relative overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900 p-6">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-emerald-500/60 via-transparent to-transparent" />
      {children}
    </section>
  );
}

function Header() {
  return (
    <header className="flex items-start gap-3">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.25"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M7 7h10v10H7z" />
          <path d="M3 11l4-4M21 13l-4 4" />
        </svg>
      </div>
      <div className="flex-1 min-w-0">
        <h2 className="text-lg font-semibold">Pool</h2>
        <p className="mt-0.5 text-sm text-zinc-400">OPN / mUSDC constant-product AMM on IOPN testnet</p>
      </div>
    </header>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-zinc-500">{label}</dt>
      <dd className="mt-1 text-lg font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd /Users/long/Code/personal/openswap/frontend && npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/long/Code/personal/openswap
git add frontend/components/PoolStats.tsx
git -c user.email=vvlong.2k@gmail.com -c user.name="vvlong" commit -m "feat(frontend): PoolStats with reserves, spot price, LP share, auto-refresh"
```

---

## Task F7: TabSwitcher with URL hash sync

**Files:**
- Create: `frontend/components/TabSwitcher.tsx`

- [ ] **Step 1: Create `frontend/components/TabSwitcher.tsx`**

```tsx
'use client';

import { ReactNode, useEffect, useState } from 'react';

export type TabKey = 'swap' | 'liquidity' | 'faucet';

const TABS: { key: TabKey; label: string; accent: string }[] = [
  { key: 'swap', label: 'Swap', accent: 'bg-emerald-500 text-black' },
  { key: 'liquidity', label: 'Liquidity', accent: 'bg-violet-500 text-black' },
  { key: 'faucet', label: 'Faucet', accent: 'bg-amber-500 text-black' },
];

interface Props {
  swap: ReactNode;
  liquidity: ReactNode;
  faucet: ReactNode;
}

function readHash(): TabKey {
  if (typeof window === 'undefined') return 'swap';
  const h = window.location.hash.replace('#', '');
  if (h === 'liquidity' || h === 'faucet') return h;
  return 'swap';
}

export function TabSwitcher({ swap, liquidity, faucet }: Props) {
  const [active, setActive] = useState<TabKey>('swap');

  useEffect(() => {
    setActive(readHash());
    const onHash = () => setActive(readHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const select = (k: TabKey) => {
    setActive(k);
    if (typeof window !== 'undefined') {
      // Update hash without scrolling/jumping.
      history.replaceState(null, '', `#${k}`);
    }
  };

  return (
    <div className="space-y-4">
      <nav className="inline-flex rounded-xl border border-zinc-800 bg-zinc-900 p-1" role="tablist">
        {TABS.map((t) => {
          const isActive = t.key === active;
          return (
            <button
              key={t.key}
              role="tab"
              aria-selected={isActive}
              onClick={() => select(t.key)}
              className={
                'rounded-lg px-4 py-1.5 text-sm font-medium transition ' +
                (isActive ? t.accent : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200')
              }
            >
              {t.label}
            </button>
          );
        })}
      </nav>
      <div>
        {active === 'swap' && swap}
        {active === 'liquidity' && liquidity}
        {active === 'faucet' && faucet}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd /Users/long/Code/personal/openswap/frontend && npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/long/Code/personal/openswap
git add frontend/components/TabSwitcher.tsx
git -c user.email=vvlong.2k@gmail.com -c user.name="vvlong" commit -m "feat(frontend): TabSwitcher with URL hash sync and per-tab accents"
```

---

## Task F8: SwapPanel

**Files:**
- Create: `frontend/components/SwapPanel.tsx`

- [ ] **Step 1: Create `frontend/components/SwapPanel.tsx`**

```tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import { maxUint256 } from 'viem';
import {
  useAccount,
  useBalance,
  useChainId,
  usePublicClient,
  useReadContract,
  useWriteContract,
} from 'wagmi';
import {
  getMockUSDCAddress,
  getPairAddress,
  mockUSDCAbi,
  openSwapPairAbi,
} from '../lib/contract';
import { iopnTestnet } from '../lib/chains';
import {
  applySlippage,
  formatMUSDC,
  formatOPN,
  parseMUSDC,
  parseOPN,
} from '../lib/format';
import { TokenInput } from './ui/TokenInput';
import { SlippageSelector } from './ui/SlippageSelector';

type Direction = 'opn-to-musdc' | 'musdc-to-opn';
type Phase = 'idle' | 'approving' | 'signing' | 'pending' | 'success';

const GAS_RESERVE_WEI = 100_000_000_000_000n; // 0.0001 OPN

export function SwapPanel() {
  const chainId = useChainId();
  const pair = getPairAddress(chainId);
  const mUSDC = getMockUSDCAddress(chainId);
  const publicClient = usePublicClient();
  const { address: user } = useAccount();

  const [direction, setDirection] = useState<Direction>('opn-to-musdc');
  const [amountIn, setAmountIn] = useState('');
  const [slippageBps, setSlippageBps] = useState(100); // 1.00%
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>();

  const { writeContractAsync } = useWriteContract();

  // ----- Reads -----
  const opnIsInput = direction === 'opn-to-musdc';

  const { data: balOPN } = useBalance({
    address: user,
    query: { enabled: Boolean(user && opnIsInput), refetchInterval: 5000 },
  });

  const { data: balMUSDC } = useReadContract({
    address: mUSDC ?? undefined,
    abi: mockUSDCAbi,
    functionName: 'balanceOf',
    args: user ? [user] : undefined,
    query: { enabled: Boolean(mUSDC && user && !opnIsInput), refetchInterval: 5000 },
  });

  const { data: allowanceRaw } = useReadContract({
    address: mUSDC ?? undefined,
    abi: mockUSDCAbi,
    functionName: 'allowance',
    args: user && pair ? [user, pair] : undefined,
    query: { enabled: Boolean(mUSDC && pair && user && !opnIsInput), refetchInterval: 5000 },
  });
  const allowance = (allowanceRaw as bigint | undefined) ?? 0n;

  // Parse amount in (raw bigint, units matching the input token).
  const parsedAmountIn: bigint | null = useMemo(() => {
    if (!amountIn) return null;
    try {
      return opnIsInput ? parseOPN(amountIn) : parseMUSDC(amountIn);
    } catch {
      return null;
    }
  }, [amountIn, opnIsInput]);

  const { data: quoteRaw } = useReadContract({
    address: pair ?? undefined,
    abi: openSwapPairAbi,
    functionName: 'quoteSwap',
    args: parsedAmountIn ? [parsedAmountIn, opnIsInput] : undefined,
    query: {
      enabled: Boolean(pair && parsedAmountIn && parsedAmountIn > 0n),
      refetchInterval: 5000,
    },
  });
  const quote = quoteRaw as bigint | undefined;
  const minOut = quote ? applySlippage(quote, slippageBps) : undefined;

  // ----- MAX -----
  const primaryMax: bigint | undefined = useMemo(() => {
    if (opnIsInput) {
      if (!balOPN) return undefined;
      const m = balOPN.value - GAS_RESERVE_WEI;
      return m > 0n ? m : 0n;
    }
    return balMUSDC as bigint | undefined;
  }, [opnIsInput, balOPN, balMUSDC]);

  const primaryMaxLabel = 'Wallet';
  const primaryMaxFormatted = primaryMax === undefined
    ? '—'
    : opnIsInput
    ? `${formatOPN(primaryMax)} OPN`
    : `${formatMUSDC(primaryMax)} mUSDC`;

  const onMaxPrimary = () => {
    if (!primaryMax) return;
    setAmountIn(opnIsInput ? formatOPN(primaryMax, 18) : formatMUSDC(primaryMax, 6));
  };

  // ----- Flip -----
  const flip = () => {
    setDirection((d) => (d === 'opn-to-musdc' ? 'musdc-to-opn' : 'opn-to-musdc'));
    setAmountIn('');
    setError(null);
    setPhase('idle');
    setTxHash(undefined);
  };

  const reset = () => {
    setAmountIn('');
    setError(null);
    setPhase('idle');
    setTxHash(undefined);
  };

  // Reset transient phase when direction changes.
  useEffect(() => {
    if (phase === 'success' || phase === 'pending' || phase === 'signing' || phase === 'approving') {
      reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [direction]);

  const busy = phase === 'approving' || phase === 'signing' || phase === 'pending';

  const needsApproval =
    !opnIsInput && parsedAmountIn !== null && allowance < parsedAmountIn;

  const ctaLabel = needsApproval ? 'Approve mUSDC' : opnIsInput ? 'Swap' : 'Swap';

  const onSubmit = async () => {
    if (!pair || !publicClient) {
      setError('No deployment for this network.');
      return;
    }
    if (!parsedAmountIn || parsedAmountIn <= 0n) {
      setError('Enter an amount > 0');
      return;
    }
    if (minOut === undefined) {
      setError('Waiting for quote — try again');
      return;
    }
    setError(null);
    try {
      // mUSDC → OPN: ensure allowance.
      if (!opnIsInput && allowance < parsedAmountIn) {
        if (!mUSDC) {
          setError('mUSDC address not found');
          return;
        }
        setPhase('approving');
        const approveHash = await writeContractAsync({
          address: mUSDC,
          abi: mockUSDCAbi,
          functionName: 'approve',
          args: [pair, maxUint256],
        });
        await publicClient.waitForTransactionReceipt({ hash: approveHash });
      }

      setPhase('signing');
      let hash: `0x${string}`;
      if (opnIsInput) {
        hash = await writeContractAsync({
          address: pair,
          abi: openSwapPairAbi,
          functionName: 'swapOPNForMUSDC',
          args: [minOut],
          value: parsedAmountIn,
        });
      } else {
        hash = await writeContractAsync({
          address: pair,
          abi: openSwapPairAbi,
          functionName: 'swapMUSDCForOPN',
          args: [parsedAmountIn, minOut],
        });
      }
      setTxHash(hash);
      setPhase('pending');
      await publicClient.waitForTransactionReceipt({ hash });
      setPhase('success');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg.includes('User rejected') ? 'Rejected in wallet.' : msg);
      setPhase('idle');
    }
  };

  const status =
    error ? `Error: ${error}` :
    phase === 'approving' ? 'Approve in wallet…' :
    phase === 'signing' ? 'Confirm swap in wallet…' :
    phase === 'pending' ? 'Pending…' :
    phase === 'success' ? 'Swapped ✓' :
    '';
  const explorer = txHash ? `${iopnTestnet.blockExplorers.default.url}/tx/${txHash}` : null;

  const fromUnit = opnIsInput ? 'OPN' : 'mUSDC';
  const toUnit = opnIsInput ? 'mUSDC' : 'OPN';
  const quoteText = quote === undefined
    ? ''
    : opnIsInput
    ? formatMUSDC(quote, 6)
    : formatOPN(quote, 8);
  const minOutText = minOut === undefined
    ? '—'
    : opnIsInput
    ? `${formatMUSDC(minOut)} mUSDC`
    : `${formatOPN(minOut)} OPN`;

  return (
    <section className="relative overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900 p-6">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-emerald-500/60 via-transparent to-transparent" />

      <header className="mb-5 flex items-start gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400 text-lg font-bold">↔</div>
        <div>
          <h3 className="text-lg font-semibold">Swap</h3>
          <p className="text-sm text-zinc-400">Trade native OPN ↔ mUSDC. 0.30% fee retained for LPs.</p>
        </div>
      </header>

      <div className="space-y-4">
        <TokenInput
          label="From"
          value={amountIn}
          onChange={setAmountIn}
          unit={fromUnit}
          disabled={busy}
          maxValue={primaryMax}
          maxLabel={primaryMaxLabel}
          maxFormatted={primaryMaxFormatted}
          onMax={onMaxPrimary}
          accent="emerald"
        />

        <div className="flex justify-center">
          <button
            type="button"
            onClick={flip}
            disabled={busy}
            aria-label="Flip swap direction"
            className="rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1 text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
          >
            ⇅
          </button>
        </div>

        <TokenInput
          label="To (estimated)"
          value={quoteText}
          unit={toUnit}
          disabled={busy}
          accent="sky"
        />

        <SlippageSelector valueBps={slippageBps} onChange={setSlippageBps} disabled={busy} />

        <div className="text-xs text-zinc-500">
          Min received at {(slippageBps / 100).toFixed(2)}% slippage: <span className="text-zinc-300">{minOutText}</span>
        </div>

        <button
          onClick={onSubmit}
          disabled={busy || !pair || !parsedAmountIn || parsedAmountIn <= 0n}
          className="w-full rounded-lg bg-emerald-500 py-2.5 font-semibold text-black transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-emerald-500"
        >
          {busy ? 'Working…' : ctaLabel}
        </button>

        {status && (
          <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-400">
            <span>{status}</span>
            {explorer && (
              <a className="text-emerald-400 underline hover:opacity-80" target="_blank" rel="noopener noreferrer" href={explorer}>
                view tx ↗
              </a>
            )}
            {phase === 'success' && (
              <button className="text-zinc-500 underline" onClick={reset}>reset</button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd /Users/long/Code/personal/openswap/frontend && npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/long/Code/personal/openswap
git add frontend/components/SwapPanel.tsx
git -c user.email=vvlong.2k@gmail.com -c user.name="vvlong" commit -m "feat(frontend): SwapPanel — flip + quote + slippage + auto-approve mUSDC"
```

---

## Task F9: LiquidityPanel (Add / Remove)

**Files:**
- Create: `frontend/components/LiquidityPanel.tsx`

- [ ] **Step 1: Create `frontend/components/LiquidityPanel.tsx`**

```tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import { maxUint256 } from 'viem';
import {
  useAccount,
  useBalance,
  useChainId,
  usePublicClient,
  useReadContract,
  useReadContracts,
  useWriteContract,
} from 'wagmi';
import {
  getMockUSDCAddress,
  getPairAddress,
  mockUSDCAbi,
  openSwapPairAbi,
} from '../lib/contract';
import { iopnTestnet } from '../lib/chains';
import {
  formatLP,
  formatMUSDC,
  formatOPN,
  parseLP,
  parseMUSDC,
  parseOPN,
} from '../lib/format';
import { TokenInput } from './ui/TokenInput';

type Mode = 'add' | 'remove';
type Phase = 'idle' | 'approving' | 'signing' | 'pending' | 'success';

const GAS_RESERVE_WEI = 100_000_000_000_000n; // 0.0001 OPN

export function LiquidityPanel() {
  const chainId = useChainId();
  const pair = getPairAddress(chainId);
  const mUSDC = getMockUSDCAddress(chainId);
  const publicClient = usePublicClient();
  const { address: user } = useAccount();

  const [mode, setMode] = useState<Mode>('add');
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>();
  const { writeContractAsync } = useWriteContract();

  // Reads needed for both modes.
  const { data: reservesData } = useReadContracts({
    contracts: pair
      ? [
          { address: pair, abi: openSwapPairAbi, functionName: 'getReserves' },
          { address: pair, abi: openSwapPairAbi, functionName: 'totalSupply' },
        ]
      : [],
    query: { refetchInterval: 5000, enabled: Boolean(pair) },
  });
  const reserves = reservesData?.[0]?.result as readonly [bigint, bigint, number] | undefined;
  const totalSupply = reservesData?.[1]?.result as bigint | undefined;
  const reserveOPN = reserves?.[0];
  const reserveMUSDC = reserves?.[1];

  // ----- Add mode state -----
  const [opnAmount, setOpnAmount] = useState('');
  const [musdcAmount, setMusdcAmount] = useState('');
  const [lastEdited, setLastEdited] = useState<'opn' | 'musdc'>('opn');

  const { data: balOPN } = useBalance({
    address: user,
    query: { enabled: Boolean(user && mode === 'add'), refetchInterval: 5000 },
  });
  const { data: balMUSDC } = useReadContract({
    address: mUSDC ?? undefined,
    abi: mockUSDCAbi,
    functionName: 'balanceOf',
    args: user ? [user] : undefined,
    query: { enabled: Boolean(mUSDC && user && mode === 'add'), refetchInterval: 5000 },
  });
  const { data: allowanceRaw } = useReadContract({
    address: mUSDC ?? undefined,
    abi: mockUSDCAbi,
    functionName: 'allowance',
    args: user && pair ? [user, pair] : undefined,
    query: { enabled: Boolean(mUSDC && pair && user && mode === 'add'), refetchInterval: 5000 },
  });
  const allowance = (allowanceRaw as bigint | undefined) ?? 0n;

  // Auto-pair: when the pool has reserves, fill the other side to match the ratio.
  useEffect(() => {
    if (mode !== 'add') return;
    if (!reserveOPN || !reserveMUSDC || reserveOPN === 0n || reserveMUSDC === 0n) return;
    if (lastEdited === 'opn') {
      if (opnAmount === '') {
        setMusdcAmount('');
        return;
      }
      try {
        const opn = parseOPN(opnAmount);
        const musdc = (opn * reserveMUSDC) / reserveOPN;
        setMusdcAmount(formatMUSDC(musdc, 6));
      } catch {
        /* invalid input */
      }
    } else {
      if (musdcAmount === '') {
        setOpnAmount('');
        return;
      }
      try {
        const musdc = parseMUSDC(musdcAmount);
        const opn = (musdc * reserveOPN) / reserveMUSDC;
        setOpnAmount(formatOPN(opn, 18));
      } catch {
        /* invalid input */
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opnAmount, musdcAmount, lastEdited, reserveOPN, reserveMUSDC, mode]);

  const parsedOPN: bigint | null = useMemo(() => {
    try { return opnAmount ? parseOPN(opnAmount) : null; } catch { return null; }
  }, [opnAmount]);
  const parsedMUSDC: bigint | null = useMemo(() => {
    try { return musdcAmount ? parseMUSDC(musdcAmount) : null; } catch { return null; }
  }, [musdcAmount]);

  const { data: quoteAddRaw } = useReadContract({
    address: pair ?? undefined,
    abi: openSwapPairAbi,
    functionName: 'quoteAddLiquidity',
    args: parsedOPN && parsedMUSDC ? [parsedOPN, parsedMUSDC] : undefined,
    query: {
      enabled: Boolean(pair && parsedOPN && parsedOPN > 0n && parsedMUSDC && parsedMUSDC > 0n),
      refetchInterval: 5000,
    },
  });
  const quotedLP = (quoteAddRaw as readonly [bigint, bigint, bigint] | undefined)?.[0];

  // ----- Remove mode state -----
  const [lpText, setLpText] = useState('');
  const { data: userLP } = useReadContract({
    address: pair ?? undefined,
    abi: openSwapPairAbi,
    functionName: 'balanceOf',
    args: user ? [user] : undefined,
    query: { enabled: Boolean(pair && user && mode === 'remove'), refetchInterval: 5000 },
  });
  const parsedLP: bigint | null = useMemo(() => {
    try { return lpText ? parseLP(lpText) : null; } catch { return null; }
  }, [lpText]);

  const removePreview = useMemo(() => {
    if (!parsedLP || !totalSupply || totalSupply === 0n || !reserveOPN || !reserveMUSDC) {
      return null;
    }
    return {
      opnOut: (parsedLP * reserveOPN) / totalSupply,
      mUSDCOut: (parsedLP * reserveMUSDC) / totalSupply,
    };
  }, [parsedLP, totalSupply, reserveOPN, reserveMUSDC]);

  // ----- MAX helpers -----
  const opnMax: bigint | undefined = balOPN
    ? balOPN.value - GAS_RESERVE_WEI > 0n
      ? balOPN.value - GAS_RESERVE_WEI
      : 0n
    : undefined;
  const opnMaxFormatted = opnMax === undefined ? '—' : `${formatOPN(opnMax)} OPN`;
  const onMaxOPN = () => {
    if (!opnMax) return;
    setLastEdited('opn');
    setOpnAmount(formatOPN(opnMax, 18));
  };

  const musdcMax = balMUSDC as bigint | undefined;
  const musdcMaxFormatted = musdcMax === undefined ? '—' : `${formatMUSDC(musdcMax)} mUSDC`;
  const onMaxMUSDC = () => {
    if (!musdcMax) return;
    setLastEdited('musdc');
    setMusdcAmount(formatMUSDC(musdcMax, 6));
  };

  const lpMaxFormatted = userLP === undefined ? '—' : `${formatLP(userLP as bigint)} LP`;
  const onMaxLP = () => {
    if (!userLP) return;
    setLpText(formatLP(userLP as bigint, 18));
  };

  // ----- Submit -----
  const reset = () => {
    setOpnAmount('');
    setMusdcAmount('');
    setLpText('');
    setError(null);
    setPhase('idle');
    setTxHash(undefined);
  };

  const busy = phase !== 'idle' && phase !== 'success';

  const switchMode = (m: Mode) => {
    setMode(m);
    reset();
  };

  const onSubmit = async () => {
    if (!pair || !publicClient) {
      setError('No deployment for this network.');
      return;
    }
    setError(null);
    try {
      if (mode === 'add') {
        if (!parsedOPN || !parsedMUSDC || parsedOPN <= 0n || parsedMUSDC <= 0n) {
          throw new Error('Enter both amounts > 0');
        }
        if (allowance < parsedMUSDC) {
          if (!mUSDC) throw new Error('mUSDC address not found');
          setPhase('approving');
          const h0 = await writeContractAsync({
            address: mUSDC,
            abi: mockUSDCAbi,
            functionName: 'approve',
            args: [pair, maxUint256],
          });
          await publicClient.waitForTransactionReceipt({ hash: h0 });
        }
        setPhase('signing');
        const h = await writeContractAsync({
          address: pair,
          abi: openSwapPairAbi,
          functionName: 'addLiquidity',
          args: [parsedMUSDC],
          value: parsedOPN,
        });
        setTxHash(h);
        setPhase('pending');
        await publicClient.waitForTransactionReceipt({ hash: h });
        setPhase('success');
      } else {
        if (!parsedLP || parsedLP <= 0n) throw new Error('Enter LP > 0');
        setPhase('signing');
        const h = await writeContractAsync({
          address: pair,
          abi: openSwapPairAbi,
          functionName: 'removeLiquidity',
          args: [parsedLP],
        });
        setTxHash(h);
        setPhase('pending');
        await publicClient.waitForTransactionReceipt({ hash: h });
        setPhase('success');
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg.includes('User rejected') ? 'Rejected in wallet.' : msg);
      setPhase('idle');
    }
  };

  const status =
    error ? `Error: ${error}` :
    phase === 'approving' ? 'Approve in wallet…' :
    phase === 'signing' ? 'Confirm in wallet…' :
    phase === 'pending' ? 'Pending…' :
    phase === 'success' ? 'Confirmed ✓' :
    '';
  const explorer = txHash ? `${iopnTestnet.blockExplorers.default.url}/tx/${txHash}` : null;

  const ctaLabel =
    mode === 'add'
      ? (parsedMUSDC && allowance < parsedMUSDC ? 'Approve & Add Liquidity' : 'Add Liquidity')
      : 'Remove Liquidity';

  return (
    <section className="relative overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900 p-6">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-violet-500/60 via-transparent to-transparent" />

      <header className="mb-5 flex items-start gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-500/10 text-violet-400 text-lg font-bold">≋</div>
        <div>
          <h3 className="text-lg font-semibold">Liquidity</h3>
          <p className="text-sm text-zinc-400">Provide both assets to earn 0.30% on every swap.</p>
        </div>
      </header>

      <div className="mb-4 inline-flex rounded-lg border border-zinc-800 bg-zinc-950 p-1">
        <button
          type="button"
          onClick={() => switchMode('add')}
          className={
            'rounded-md px-3 py-1 text-sm font-medium transition ' +
            (mode === 'add' ? 'bg-violet-500 text-black' : 'text-zinc-400 hover:bg-zinc-800')
          }
        >
          Add
        </button>
        <button
          type="button"
          onClick={() => switchMode('remove')}
          className={
            'rounded-md px-3 py-1 text-sm font-medium transition ' +
            (mode === 'remove' ? 'bg-violet-500 text-black' : 'text-zinc-400 hover:bg-zinc-800')
          }
        >
          Remove
        </button>
      </div>

      {mode === 'add' && (
        <div className="space-y-4">
          <TokenInput
            label="OPN amount"
            value={opnAmount}
            onChange={(s) => { setLastEdited('opn'); setOpnAmount(s); }}
            unit="OPN"
            disabled={busy}
            maxValue={opnMax}
            maxLabel="Wallet"
            maxFormatted={opnMaxFormatted}
            onMax={onMaxOPN}
            accent="emerald"
          />
          <TokenInput
            label="mUSDC amount"
            value={musdcAmount}
            onChange={(s) => { setLastEdited('musdc'); setMusdcAmount(s); }}
            unit="mUSDC"
            disabled={busy}
            maxValue={musdcMax}
            maxLabel="Wallet"
            maxFormatted={musdcMaxFormatted}
            onMax={onMaxMUSDC}
            accent="emerald"
          />
          <div className="text-xs text-zinc-500">
            You'll receive: <span className="text-zinc-300">{quotedLP === undefined ? '—' : `${formatLP(quotedLP)} LP`}</span>
          </div>
          <button
            onClick={onSubmit}
            disabled={busy || !pair || !parsedOPN || !parsedMUSDC}
            className="w-full rounded-lg bg-emerald-500 py-2.5 font-semibold text-black transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-emerald-500"
          >
            {busy ? 'Working…' : ctaLabel}
          </button>
        </div>
      )}

      {mode === 'remove' && (
        <div className="space-y-4">
          <TokenInput
            label="LP to burn"
            value={lpText}
            onChange={setLpText}
            unit="LP"
            disabled={busy}
            maxValue={userLP as bigint | undefined}
            maxLabel="Available"
            maxFormatted={lpMaxFormatted}
            onMax={onMaxLP}
            accent="violet"
          />
          <div className="text-xs text-zinc-500">
            You'll receive: <span className="text-zinc-300">
              {removePreview
                ? `≈ ${formatOPN(removePreview.opnOut)} OPN + ${formatMUSDC(removePreview.mUSDCOut)} mUSDC`
                : '—'}
            </span>
          </div>
          <button
            onClick={onSubmit}
            disabled={busy || !pair || !parsedLP}
            className="w-full rounded-lg bg-violet-500 py-2.5 font-semibold text-black transition hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-violet-500"
          >
            {busy ? 'Working…' : ctaLabel}
          </button>
        </div>
      )}

      {status && (
        <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-zinc-400">
          <span>{status}</span>
          {explorer && (
            <a className="text-emerald-400 underline hover:opacity-80" target="_blank" rel="noopener noreferrer" href={explorer}>
              view tx ↗
            </a>
          )}
          {phase === 'success' && (
            <button className="text-zinc-500 underline" onClick={reset}>reset</button>
          )}
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd /Users/long/Code/personal/openswap/frontend && npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/long/Code/personal/openswap
git add frontend/components/LiquidityPanel.tsx
git -c user.email=vvlong.2k@gmail.com -c user.name="vvlong" commit -m "feat(frontend): LiquidityPanel — auto-pair Add + pro-rata Remove preview"
```

---

## Task F10: FaucetPanel

**Files:**
- Create: `frontend/components/FaucetPanel.tsx`

- [ ] **Step 1: Create `frontend/components/FaucetPanel.tsx`**

```tsx
'use client';

import { useMemo, useState } from 'react';
import {
  useAccount,
  useChainId,
  usePublicClient,
  useReadContract,
  useWriteContract,
} from 'wagmi';
import { getMockUSDCAddress, mockUSDCAbi } from '../lib/contract';
import { iopnTestnet } from '../lib/chains';
import { formatMUSDC, parseMUSDC } from '../lib/format';
import { TokenInput } from './ui/TokenInput';

type Phase = 'idle' | 'signing' | 'pending' | 'success';

export function FaucetPanel() {
  const chainId = useChainId();
  const mUSDC = getMockUSDCAddress(chainId);
  const publicClient = usePublicClient();
  const { address: user } = useAccount();

  const [text, setText] = useState('10000');
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>();
  const { writeContractAsync } = useWriteContract();

  const { data: capRaw } = useReadContract({
    address: mUSDC ?? undefined,
    abi: mockUSDCAbi,
    functionName: 'MAX_MINT_PER_CALL',
    query: { enabled: Boolean(mUSDC) },
  });
  const cap = capRaw as bigint | undefined;
  const capFormatted = cap === undefined ? '—' : `${formatMUSDC(cap)} mUSDC`;

  const { data: balRaw } = useReadContract({
    address: mUSDC ?? undefined,
    abi: mockUSDCAbi,
    functionName: 'balanceOf',
    args: user ? [user] : undefined,
    query: { enabled: Boolean(mUSDC && user), refetchInterval: 5000 },
  });
  const bal = balRaw as bigint | undefined;

  const parsed: bigint | null = useMemo(() => {
    try { return text ? parseMUSDC(text) : null; } catch { return null; }
  }, [text]);

  const overCap = cap !== undefined && parsed !== null && parsed > cap;
  const onMax = () => {
    if (!cap) return;
    setText(formatMUSDC(cap, 6));
  };

  const reset = () => {
    setText('10000');
    setError(null);
    setPhase('idle');
    setTxHash(undefined);
  };

  const busy = phase !== 'idle' && phase !== 'success';

  const onSubmit = async () => {
    if (!mUSDC || !publicClient) {
      setError('No mUSDC deployment for this network.');
      return;
    }
    if (!parsed || parsed <= 0n) {
      setError('Enter an amount > 0');
      return;
    }
    if (overCap) {
      setError(`Above ${capFormatted} cap`);
      return;
    }
    setError(null);
    try {
      setPhase('signing');
      const h = await writeContractAsync({
        address: mUSDC,
        abi: mockUSDCAbi,
        functionName: 'mint',
        args: [parsed],
      });
      setTxHash(h);
      setPhase('pending');
      await publicClient.waitForTransactionReceipt({ hash: h });
      setPhase('success');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg.includes('User rejected') ? 'Rejected in wallet.' : msg);
      setPhase('idle');
    }
  };

  const status =
    error ? `Error: ${error}` :
    phase === 'signing' ? 'Confirm in wallet…' :
    phase === 'pending' ? 'Pending…' :
    phase === 'success' ? `Minted ✓ — balance ${bal === undefined ? '—' : formatMUSDC(bal)} mUSDC` :
    '';
  const explorer = txHash ? `${iopnTestnet.blockExplorers.default.url}/tx/${txHash}` : null;

  return (
    <section className="relative overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900 p-6">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-amber-500/60 via-transparent to-transparent" />

      <header className="mb-5 flex items-start gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/10 text-amber-400 text-lg font-bold">$</div>
        <div>
          <h3 className="text-lg font-semibold">Faucet</h3>
          <p className="text-sm text-zinc-400">Mint test mUSDC. Max {capFormatted} per call.</p>
        </div>
      </header>

      <div className="space-y-4">
        <TokenInput
          label="Amount"
          value={text}
          onChange={setText}
          unit="mUSDC"
          disabled={busy}
          maxValue={cap}
          maxLabel="Cap"
          maxFormatted={capFormatted}
          onMax={onMax}
          accent="amber"
        />

        {overCap && (
          <div className="text-xs text-amber-300">Above {capFormatted} cap — lower the amount.</div>
        )}

        <button
          onClick={onSubmit}
          disabled={busy || overCap || !mUSDC || !parsed}
          className="w-full rounded-lg bg-amber-500 py-2.5 font-semibold text-black transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-amber-500"
        >
          {busy ? 'Working…' : 'Mint mUSDC'}
        </button>

        {status && (
          <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-400">
            <span>{status}</span>
            {explorer && (
              <a className="text-amber-400 underline hover:opacity-80" target="_blank" rel="noopener noreferrer" href={explorer}>
                view tx ↗
              </a>
            )}
            {phase === 'success' && (
              <button className="text-zinc-500 underline" onClick={reset}>reset</button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd /Users/long/Code/personal/openswap/frontend && npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/long/Code/personal/openswap
git add frontend/components/FaucetPanel.tsx
git -c user.email=vvlong.2k@gmail.com -c user.name="vvlong" commit -m "feat(frontend): FaucetPanel — mUSDC mint w/ cap enforcement"
```

---

## Task F11: Compose page + build verification

**Files:**
- Modify: `frontend/app/page.tsx`

- [ ] **Step 1: Replace `frontend/app/page.tsx`**

```tsx
'use client';

import { ConnectButton } from '@rainbow-me/rainbowkit';
import { ConnectGate } from '../components/ConnectGate';
import { PoolStats } from '../components/PoolStats';
import { TabSwitcher } from '../components/TabSwitcher';
import { SwapPanel } from '../components/SwapPanel';
import { LiquidityPanel } from '../components/LiquidityPanel';
import { FaucetPanel } from '../components/FaucetPanel';

export default function Home() {
  return (
    <main className="max-w-4xl mx-auto p-6 space-y-6">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">OpenSwap</h1>
          <p className="text-sm text-zinc-400">Native OPN ↔ mUSDC AMM on IOPN testnet</p>
        </div>
        <ConnectButton />
      </header>

      <ConnectGate>
        <PoolStats />
        <TabSwitcher
          swap={<SwapPanel />}
          liquidity={<LiquidityPanel />}
          faucet={<FaucetPanel />}
        />
      </ConnectGate>
    </main>
  );
}
```

- [ ] **Step 2: Build**

```bash
cd /Users/long/Code/personal/openswap/frontend && npm run build
```

Expected: succeeds with no errors. May warn about wagmi/MetaMask transitive deprecations — acceptable.

- [ ] **Step 3: Typecheck**

```bash
cd /Users/long/Code/personal/openswap/frontend && npm run typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd /Users/long/Code/personal/openswap
git add frontend/app/page.tsx
git -c user.email=vvlong.2k@gmail.com -c user.name="vvlong" commit -m "feat(frontend): compose dashboard page with stats + tab switcher"
```

---

## Task F12: README addendum

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Append a "Frontend" section to root README**

After the "Interact" section in `README.md`, append:

```markdown
## Frontend (optional UI)

A minimal Next.js dApp lives in `frontend/`. To run it:

\`\`\`bash
# Pre-req: contracts compiled and deployed at least once for the target chain.
npm run compile
npm run deploy:testnet   # (or: npx hardhat run scripts/deploy.ts --network localhost)

cd frontend
cp .env.example .env     # optional — only needed for WalletConnect v2 support
npm install
npm run sync:testnet     # copies pair + mUSDC addresses from ../deployments/iopnTestnet.json to .env.local
npm run dev
\`\`\`

Open http://localhost:3000. Connect a wallet (MetaMask, OKX, RainbowKit-supported)
and either approve the IOPN Testnet network prompt or switch manually.

The dApp has three tabs:

- **Swap** — trade OPN ↔ mUSDC with preset/custom slippage; auto-approves mUSDC when needed.
- **Liquidity** — Add (auto-pairs the other side at current ratio) or Remove (shows the expected payouts).
- **Faucet** — mint test mUSDC up to the 10k-per-call cap.

Stack: Next.js 14 + wagmi v2 + RainbowKit + Tailwind. See
[frontend spec](docs/superpowers/specs/2026-05-29-openswap-frontend-design.md).
```

(The `\`\`\`bash` and `\`\`\`` markers above are placeholders; in the file, use actual triple-backtick code fences.)

- [ ] **Step 2: Commit**

```bash
cd /Users/long/Code/personal/openswap
git add README.md
git -c user.email=vvlong.2k@gmail.com -c user.name="vvlong" commit -m "docs: add frontend section to README"
```

---

## Self-Review

**Spec coverage:**

- §1 Purpose → covered by F1-F11 building the dApp
- §2 Stack → F1 package.json
- §3 Network config → F2 `lib/chains.ts`
- §4 Repo layout → F1-F10 create each listed file
- §5 Page composition → F4 ConnectGate, F11 page composition
- §6 ABI + address loading → F3 ABI bundling + loaders + sync-address script
- §7.1 ConnectGate → F4
- §7.2 PoolStats → F6
- §7.3 TabSwitcher → F7
- §7.4 SwapPanel (flip, slippage, two-tx approve) → F8
- §7.5 LiquidityPanel (auto-pair Add, Remove preview) → F9
- §7.6 FaucetPanel (cap enforcement) → F10
- §7.7 TokenInput → F5
- §7.8 SlippageSelector → F5
- §8 Hooks (writeContractAsync + waitForReceipt pattern) → F8/F9/F10 onSubmit handlers
- §9 Math (`applySlippage`) → F3 `format.ts`; price impact noted as optional polish (deferred)
- §10 Styling → tailwind config in F1, accents per component
- §11 Env → F1 `.env.example` + F3 sync script
- §12 Build & run → F11 build verification + F12 README
- §13 Acceptance criteria → F11 build/typecheck pass, manual smoke per F12 instructions

Note: the optional "price impact" polish in spec §9 is intentionally not a separate task — the spec marks it optional, the implementer can add it if there's time, and skipping it is acceptable per spec.

**Placeholder scan:** No TODO / TBD / "add validation later" patterns. All code blocks are complete.

**Type consistency:**

- `getPairAddress(chainId)` / `getMockUSDCAddress(chainId)` — defined F3, used F6/F8/F9/F10 ✓
- `openSwapPairAbi`, `mockUSDCAbi` — defined F3, used F6/F8/F9/F10 ✓
- `formatOPN`, `formatMUSDC`, `formatLP`, `parseOPN`, `parseMUSDC`, `parseLP`, `applySlippage` — defined F3, used throughout ✓
- `TokenInputProps` shape — defined F5, consumed F8/F9/F10 ✓
- `SlippageSelectorProps` shape — defined F5, consumed F8 ✓
- `TabKey = 'swap' | 'liquidity' | 'faucet'` — defined F7, used in URL hash and page composition F11 ✓
- Direction in SwapPanel: `'opn-to-musdc' | 'musdc-to-opn'` — single-file enum, fine ✓
- `Mode = 'add' | 'remove'` in LiquidityPanel — single-file enum ✓
- Phase state machine: `'idle' | 'approving' | 'signing' | 'pending' | 'success'` — consistent across SwapPanel, LiquidityPanel, FaucetPanel (FaucetPanel omits `'approving'` because it has no approve step — narrower union is fine since no shared interface depends on it)
- `iopnTestnet` import — defined F2, referenced F4/F8/F9/F10 ✓
- ABIs come from contracts in the openswap repo built via T1-T11 of the contract plan; F3 step 1 extracts them once and bundles ✓

All signatures, props, and helper names check out.
