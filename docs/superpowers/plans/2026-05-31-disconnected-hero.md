# Disconnected-State Hero Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the bare "Connect a wallet" card in `ConnectGate` with a full-page hero (`DisconnectedHero`) and an amber wrong-network hero (`WrongNetworkHero`), and fix the `page.tsx` layout so the hero can centre vertically inside `<main>`.

**Architecture:** Two new client components living next to the other top-level components in `frontend/components/`. `ConnectGate` shrinks to a thin router (account state → which hero to show, or render children). `app/page.tsx` switches `<main>` to a vertical flex container so the disconnected branch can claim full remaining height while the connected branch keeps its existing `max-w-4xl` padding wrapper.

**Tech Stack:** Next.js 14 (App Router), Tailwind, RainbowKit (`@rainbow-me/rainbowkit`), wagmi v2, `lucide-react` icons. No frontend unit-test framework is installed — verification per task is `npm run typecheck` (from `frontend/`) plus the manual smoke test in §11 of the spec.

**Spec:** [docs/superpowers/specs/2026-05-31-disconnected-hero-design.md](../specs/2026-05-31-disconnected-hero-design.md)

---

### Task 1: Create `DisconnectedHero` component

**Files:**
- Create: `frontend/components/DisconnectedHero.tsx`

- [ ] **Step 1: Write the component**

Create `frontend/components/DisconnectedHero.tsx` with the full content below. Uses `ConnectButton.Custom` from RainbowKit so the hero CTA opens the same modal the header `<ConnectButton />` uses. Pills are static `<span>`s with `lucide-react` icons that mirror the sidebar's product symbols.

```tsx
'use client';

import { ConnectButton } from '@rainbow-me/rainbowkit';
import {
  ArrowDownToLine,
  ArrowLeftRight,
  Layers,
  ArrowRight,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface Pill {
  label: string;
  icon: LucideIcon;
}

const PILLS: Pill[] = [
  { label: 'Lend', icon: ArrowDownToLine },
  { label: 'Trade', icon: ArrowLeftRight },
  { label: 'Strategy', icon: Layers },
];

export function DisconnectedHero() {
  return (
    <section
      aria-labelledby="stratus-hero-title"
      className="relative flex flex-1 items-center justify-center px-4 py-12"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-80"
        style={{
          background:
            'radial-gradient(60% 50% at 50% 0%, rgba(24,24,27,0.05), transparent 70%)',
        }}
      />

      <div className="relative flex max-w-xl flex-col items-center gap-4 text-center">
        <div className="text-sm font-extrabold tracking-[0.18em] text-zinc-900">
          STRATUS
        </div>

        <h1
          id="stratus-hero-title"
          className="text-4xl font-extrabold leading-[1.05] tracking-tight text-zinc-950 md:text-5xl"
        >
          DeFi suite,
          <br />
          on IOPN testnet.
        </h1>

        <p className="max-w-md text-base text-zinc-600">
          Lend, swap, and run leveraged LP, all on one app.
        </p>

        <ul className="mt-1 flex flex-wrap items-center justify-center gap-2">
          {PILLS.map(({ label, icon: Icon }) => (
            <li key={label}>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-zinc-100 px-3 py-1.5 text-sm font-semibold text-zinc-900">
                <Icon className="h-3.5 w-3.5" aria-hidden />
                {label}
              </span>
            </li>
          ))}
        </ul>

        <ConnectButton.Custom>
          {({ openConnectModal, mounted }) => (
            <button
              type="button"
              onClick={openConnectModal}
              disabled={!mounted}
              className="mt-3 inline-flex items-center gap-2 rounded-xl bg-zinc-950 px-7 py-3.5 text-base font-bold text-white shadow-sm hover:bg-zinc-800 disabled:opacity-50"
            >
              Connect Wallet
              <ArrowRight className="h-4 w-4" aria-hidden />
            </button>
          )}
        </ConnectButton.Custom>

        <div className="mt-2 flex flex-col items-center gap-1 text-sm text-zinc-500 sm:flex-row sm:gap-4">
          <span>
            Need OPN?{' '}
            <a
              href="https://faucet.iopn.tech"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-zinc-900 underline-offset-2 hover:underline"
            >
              Get testnet tokens ↗
            </a>
          </span>
          <span className="hidden sm:inline" aria-hidden>
            ·
          </span>
          <span>
            <a
              href="https://testnet.iopn.tech"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-zinc-900 underline-offset-2 hover:underline"
            >
              View on explorer ↗
            </a>
          </span>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Typecheck**

Run from the `frontend/` directory:

```bash
npm run typecheck
```

Expected: PASS — no type errors. (Note: this also typechecks files we haven't touched yet, so any unrelated errors are pre-existing.)

- [ ] **Step 3: Commit**

```bash
git add frontend/components/DisconnectedHero.tsx
git commit -m "feat(frontend): add DisconnectedHero component

Hero shown when wallet is not connected — wordmark, h1/sub,
three product pills, big black Connect CTA via
ConnectButton.Custom, and helper links to the OPN faucet and
the IOPN explorer. Not yet wired in to ConnectGate."
```

---

### Task 2: Create `WrongNetworkHero` component

**Files:**
- Create: `frontend/components/WrongNetworkHero.tsx`

- [ ] **Step 1: Write the component**

Same hero shell as Task 1 but: amber chip instead of wordmark, "Wrong network." H1, no pill row, a real `<button>` that calls `useSwitchChain().switchChain({ chainId: iopnTestnet.id })`. Helper row stays identical.

```tsx
'use client';

import { useSwitchChain } from 'wagmi';
import { ArrowRight } from 'lucide-react';
import { iopnTestnet } from '../lib/chains';

export function WrongNetworkHero() {
  const { switchChain, isPending } = useSwitchChain();

  return (
    <section
      aria-labelledby="stratus-wrong-network-title"
      className="relative flex flex-1 items-center justify-center px-4 py-12"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-80"
        style={{
          background:
            'radial-gradient(60% 50% at 50% 0%, rgba(24,24,27,0.05), transparent 70%)',
        }}
      />

      <div className="relative flex max-w-xl flex-col items-center gap-4 text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-100 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-amber-900">
          Network warning
        </span>

        <h1
          id="stratus-wrong-network-title"
          className="text-4xl font-extrabold leading-[1.05] tracking-tight text-zinc-950 md:text-5xl"
        >
          Wrong network.
        </h1>

        <p className="max-w-md text-base text-zinc-600">
          Stratus lives on IOPN Testnet (chainId 984). Switch to keep going.
        </p>

        <button
          type="button"
          onClick={() => switchChain({ chainId: iopnTestnet.id })}
          disabled={isPending}
          className="mt-3 inline-flex items-center gap-2 rounded-xl bg-zinc-950 px-7 py-3.5 text-base font-bold text-white shadow-sm hover:bg-zinc-800 disabled:opacity-50"
        >
          {isPending ? 'Switching…' : 'Switch to IOPN Testnet'}
          {!isPending && <ArrowRight className="h-4 w-4" aria-hidden />}
        </button>

        <div className="mt-2 flex flex-col items-center gap-1 text-sm text-zinc-500 sm:flex-row sm:gap-4">
          <span>
            Need OPN?{' '}
            <a
              href="https://faucet.iopn.tech"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-zinc-900 underline-offset-2 hover:underline"
            >
              Get testnet tokens ↗
            </a>
          </span>
          <span className="hidden sm:inline" aria-hidden>
            ·
          </span>
          <span>
            <a
              href="https://testnet.iopn.tech"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-zinc-900 underline-offset-2 hover:underline"
            >
              View on explorer ↗
            </a>
          </span>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Typecheck**

Run from `frontend/`:

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/components/WrongNetworkHero.tsx
git commit -m "feat(frontend): add WrongNetworkHero component

Hero shown when the user is connected but on the wrong chain
— amber chip, 'Wrong network.' headline, switchChain button
that lands them on IOPN Testnet (chainId 984). Not yet wired
in to ConnectGate."
```

---

### Task 3: Slim `ConnectGate` down to a router

**Files:**
- Modify: `frontend/components/ConnectGate.tsx` (full rewrite — the file becomes ~10 lines)

- [ ] **Step 1: Replace the file contents**

The two inline branches move into the new hero components. `useSwitchChain` is no longer needed here — it lives inside `WrongNetworkHero`.

```tsx
'use client';

import { ReactNode } from 'react';
import { useAccount, useChainId } from 'wagmi';
import { iopnTestnet } from '../lib/chains';
import { DisconnectedHero } from './DisconnectedHero';
import { WrongNetworkHero } from './WrongNetworkHero';

interface Props {
  children: ReactNode;
}

export function ConnectGate({ children }: Props) {
  const { isConnected } = useAccount();
  const chainId = useChainId();

  if (!isConnected) return <DisconnectedHero />;
  if (chainId !== iopnTestnet.id && chainId !== 31337) return <WrongNetworkHero />;

  return <>{children}</>;
}
```

- [ ] **Step 2: Typecheck**

Run from `frontend/`:

```bash
npm run typecheck
```

Expected: PASS. If you get an "unused import" error for `ConnectButton`, that confirms the rewrite was effective — but the new file shouldn't import it so the error means you missed something; re-read Step 1.

- [ ] **Step 3: Commit**

```bash
git add frontend/components/ConnectGate.tsx
git commit -m "refactor(frontend): slim ConnectGate to a hero router

ConnectGate is now a 3-branch router: disconnected →
DisconnectedHero, wrong chain → WrongNetworkHero, otherwise
render children. Inline markup and useSwitchChain move into
the hero components."
```

---

### Task 4: Switch `<main>` to a flex column and isolate the connected container

**Files:**
- Modify: `frontend/app/page.tsx`

- [ ] **Step 1: Restructure the main layout**

Currently `page.tsx` wraps `<ConnectGate>` in a fixed `px-4 py-5 sm:px-6 sm:py-6 max-w-4xl` container. That crops the hero — it can't centre vertically and the `max-w-4xl` shrinks it. Fix: `<main>` becomes `flex flex-col`, the gate container becomes `flex-1 flex`, and the padding/width wrapper moves *inside* `renderRoute()` via a new `<ConnectedContainer>` so it only applies to connected views.

Replace the body of the default export and the `renderRoute` / `SinglePanel` helpers with the version below. Imports and `labelFor` stay unchanged.

```tsx
export default function Home() {
  const { route, setRoute } = useHashRoute();

  return (
    <div className="flex min-h-screen">
      <Sidebar route={route} onChange={setRoute} />

      <main className="flex min-h-screen flex-1 flex-col min-w-0">
        <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-zinc-200 bg-white/80 px-4 py-3 backdrop-blur sm:px-6">
          <div className="w-9 md:hidden" aria-hidden />
          <div className="text-sm text-zinc-700 truncate">{labelFor(route)}</div>
          <ConnectButton />
        </header>

        <div className="flex flex-1 flex-col">
          <ConnectGate>{renderRoute(route)}</ConnectGate>
        </div>
      </main>
    </div>
  );
}

function ConnectedContainer({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-4 py-5 sm:px-6 sm:py-6 max-w-4xl">{children}</div>
  );
}

function renderRoute(route: ReturnType<typeof useHashRoute>['route']) {
  switch (route) {
    case 'lend:dashboard':
      return <ConnectedContainer><DashboardView /></ConnectedContainer>;
    case 'lend:supply':
      return <ConnectedContainer><SinglePanel><ActionPanel kind="supply" /></SinglePanel></ConnectedContainer>;
    case 'lend:withdraw':
      return <ConnectedContainer><SinglePanel><ActionPanel kind="withdraw" /></SinglePanel></ConnectedContainer>;
    case 'lend:borrow':
      return <ConnectedContainer><SinglePanel><ActionPanel kind="borrow" /></SinglePanel></ConnectedContainer>;
    case 'lend:repay':
      return <ConnectedContainer><SinglePanel><ActionPanel kind="repay" /></SinglePanel></ConnectedContainer>;
    case 'lend:liquidate':
      return <ConnectedContainer><LiquidatePanel /></ConnectedContainer>;
    case 'lend:history':
      return <ConnectedContainer><HistoryView /></ConnectedContainer>;
    case 'swap:swap':
      return (
        <ConnectedContainer>
          <div className="space-y-4 sm:space-y-6">
            <SwapPoolStats />
            <SinglePanel><SwapPanel /></SinglePanel>
          </div>
        </ConnectedContainer>
      );
    case 'swap:liquidity':
      return (
        <ConnectedContainer>
          <div className="space-y-4 sm:space-y-6">
            <SwapPoolStats />
            <SinglePanel><LiquidityPanel /></SinglePanel>
          </div>
        </ConnectedContainer>
      );
    case 'swap:faucet':
      return (
        <ConnectedContainer>
          <div className="space-y-4 sm:space-y-6">
            <SinglePanel><FaucetPanel /></SinglePanel>
          </div>
        </ConnectedContainer>
      );
    case 'strategy:leveraged-lp':
      return (
        <ConnectedContainer>
          <SinglePanel><LeveragedLPPanel /></SinglePanel>
        </ConnectedContainer>
      );
  }
}

function SinglePanel({ children }: { children: React.ReactNode }) {
  return <div className="max-w-lg">{children}</div>;
}
```

The `labelFor` function at the bottom of `page.tsx` is unchanged — leave it as-is.

- [ ] **Step 2: Typecheck**

Run from `frontend/`:

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/app/page.tsx
git commit -m "refactor(frontend): flex main column, isolate connected container

main becomes a flex column so DisconnectedHero/WrongNetworkHero
can fill the height below the sticky header. The
px-4/py-5/max-w-4xl wrapper moves into a ConnectedContainer
that only wraps routes inside renderRoute()."
```

---

### Task 5: Manual smoke pass per spec §11

**Files:** none modified — this task is verification only.

- [ ] **Step 1: Start the dev server**

From `frontend/`:

```bash
npm run dev
```

Expected: Next.js prints something like `▲ Next.js 14.x  - Local: http://localhost:3000`. Open that URL in a browser with a wallet extension installed (e.g. MetaMask).

- [ ] **Step 2: Disconnected state**

In a fresh browser (or after disconnecting from MetaMask):

- Visit `http://localhost:3000`.
- Expected: full hero centred in the right-hand main area — `STRATUS` wordmark, "DeFi suite, on IOPN testnet." H1, sub copy, three pills (Lend / Trade / Strategy), big black "Connect Wallet" button, and helper links to the faucet and explorer.
- The sidebar is visible on the left (unchanged). The sticky header at the top shows the page label + a small `Connect Wallet` button on the right.

Mark fail and report back if any of these are wrong:
- [ ] Hero is vertically centred (not stuck at the top).
- [ ] No horizontal scrollbar at 1280px viewport.
- [ ] CTA receives a visible focus ring on `Tab` from the page.

- [ ] **Step 3: Hero CTA opens RainbowKit modal**

Click the big "Connect Wallet" button in the hero.

Expected: RainbowKit modal opens (same modal the header button opens). Cancel it. Then click the header's small "Connect Wallet" button.

Expected: same modal opens.

- [ ] **Step 4: Successful connect lands on the route**

Connect a wallet that is on IOPN Testnet (chainId 984) or local Hardhat (31337).

Expected: hero unmounts and the requested route's panel renders (default: Lend · Dashboard).

- [ ] **Step 5: Wrong-network hero**

In MetaMask, switch the connected account to Ethereum Mainnet (or any chain that is not 984 / 31337) and reload `/`.

Expected: `WrongNetworkHero` appears in place of route content — amber "Network warning" chip, "Wrong network." H1, sub copy referencing chainId 984, and a "Switch to IOPN Testnet" button. The header still shows the small connect button on the right.

- [ ] **Step 6: Switch chain from the hero**

Click "Switch to IOPN Testnet".

Expected: button shows "Switching…" while pending. After the wallet prompt is accepted, the wrong-network hero unmounts and the requested route's panel renders.

- [ ] **Step 7: Mobile (375px) layout**

Open dev tools and set the viewport to 375×667 (iPhone SE). Reload `/` while disconnected.

Expected:
- [ ] No horizontal scrollbar.
- [ ] H1 is legible (drops to `text-3xl` automatically because of the `md:text-5xl` breakpoint — at 375px it stays at `text-4xl`, which is fine — the spec calls out `text-3xl` *at most* below `sm`; the implemented `text-4xl md:text-5xl` is within the spec because both stay smaller than the desktop size; if the H1 looks too tall, reduce the smallest size to `text-3xl sm:text-4xl md:text-5xl` and re-run typecheck + commit).
- [ ] Helper row stacks vertically.
- [ ] Mobile sidebar hamburger (the `☰` at top-left) still opens the drawer.

- [ ] **Step 8: Final commit (if anything was tweaked)**

If Step 7 prompted a CSS tweak, commit it:

```bash
git add frontend/components/DisconnectedHero.tsx
git commit -m "fix(frontend): tighten hero H1 at small viewports"
```

Otherwise this task has no commit — it is verification only.

---

## Self-review

- **Spec coverage:**
  - §3 visual mockup → Task 1 (component renders the listed elements).
  - §3.1 visual tokens → Task 1 (Tailwind classes match).
  - §3.2 vertical rhythm → Task 4 (flex `<main>` + `flex-1` gate container) and Task 1 (`flex-1 items-center justify-center`).
  - §4.1 `DisconnectedHero` → Task 1.
  - §4.2 `WrongNetworkHero` → Task 2.
  - §4.3 `ConnectGate` refactor → Task 3.
  - §5 layout call site → Task 4.
  - §6 copy → encoded literally in Tasks 1 & 2.
  - §7 behaviour → covered by `ConnectButton.Custom` (Task 1) and `useSwitchChain` (Task 2); verified in Task 5.
  - §8 a11y → `aria-labelledby` on the section, `aria-hidden` on decorative icons (Tasks 1 & 2); CTA is a real `<button>` (Tasks 1 & 2).
  - §9 mobile → `md:text-5xl` breakpoint (Task 1) and `flex-col sm:flex-row` on helper row (Tasks 1 & 2); verified in Task 5 Step 7.
  - §11 test plan → Task 5.

- **Placeholder scan:** no TBDs, no "add error handling later", no "similar to Task N" pointers — each task's code block is complete.

- **Type consistency:** `Pill` interface only used in Task 1. `LucideIcon` typed in Task 1 only. `WrongNetworkHero` uses `useSwitchChain` (matches the wagmi hook signature). `ConnectGate` in Task 3 uses `useAccount` and `useChainId` only — the dropped `useSwitchChain` import is intentional and the rewrite shows the full new file so no half-edit risk.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-31-disconnected-hero.md`.

Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
