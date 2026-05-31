# Disconnected-State Hero — Design Spec (v1)

**Project:** Stratus — frontend polish
**Date:** 2026-05-31
**Status:** Approved
**Owner:** vvlong.2k@gmail.com
**Depends on:** [OpenLend frontend](2026-05-29-openlend-frontend-design.md)

## 1. Purpose

Replace the bare "Connect a wallet to use Stratus" card with a proper
hero landing that gives a first-time visitor (a) a one-line idea of what
Stratus is, (b) a visual cue for the three product surfaces (Lend /
Trade / Strategy), and (c) a single bold path to connect.

The current state renders a thin white card in the centre of an
otherwise empty `<main>`. The sidebar is already visible, so the user
has navigation context — what's missing is a reason to connect.

**Non-goals (v1):** marketing landing page outside the app shell,
animations beyond a subtle radial gradient, live protocol stats
(reserved for a possible future "TVL strip" iteration), product-card
deep links, internationalisation.

## 2. Scope

Front-end only. Single-file change plus light edits at the call sites.

- **New:** `frontend/components/DisconnectedHero.tsx`
- **New:** `frontend/components/WrongNetworkHero.tsx`
- **Modified:** `frontend/components/ConnectGate.tsx` — replace the two
  inline branches with the new components
- **Modified (optional):** `frontend/app/page.tsx` — no functional
  change; the `<ConnectGate>` wrapper continues to render the gate

No new dependencies. No CSS additions beyond Tailwind classes already in
use elsewhere in the app.

## 3. UI

The hero fills the right-hand `<main>` area when `!isConnected`. The
sidebar and the sticky header stay exactly as they are today, including
the `<ConnectButton />` in the top-right of the header (so the user has
two equivalent entry points: the header button and the hero CTA).

```
┌──────────────────────────────────────────────────────────┐
│ Lend · Dashboard                       [ Connect Wallet ] │  ← existing header
├──────────────────────────────────────────────────────────┤
│                                                          │
│                                                          │
│                         STRATUS                          │  ← wordmark, tracked
│                                                          │
│                     DeFi suite,                          │  ← h1
│                  on IOPN testnet.                        │
│                                                          │
│      Lend, swap, and run leveraged LP, all on            │  ← sub
│                    one app.                              │
│                                                          │
│       [ ⇣ Lend ]  [ ⇄ Trade ]  [ ▲ Strategy ]            │  ← pills
│                                                          │
│              [  Connect Wallet  →  ]                     │  ← black CTA
│                                                          │
│   Need OPN? Get testnet tokens ↗   ·   View on explorer ↗│  ← helper row
│                                                          │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

### 3.1 Visual tokens

- Background: `#ffffff` base with a subtle radial gradient at the top
  (`radial-gradient(60% 50% at 50% 0%, rgba(24,24,27,0.05), transparent 70%)`)
  to give the hero some depth without breaking the light theme.
- Wordmark: `STRATUS` in `font-extrabold tracking-[0.18em] text-zinc-900 text-sm`.
- H1: `text-4xl md:text-5xl font-extrabold tracking-tight text-zinc-950
  leading-[1.05]`.
- Sub: `text-base text-zinc-600 max-w-md`.
- Pills: `rounded-full bg-zinc-100 border border-zinc-200 px-3 py-1.5
  text-sm font-semibold text-zinc-900` with a 14px leading icon.
- CTA: `rounded-xl bg-zinc-950 hover:bg-zinc-800 text-white font-bold
  px-7 py-3.5 inline-flex items-center gap-2`.
- Helper row: `text-sm text-zinc-500` with `text-zinc-900` underlined
  link tokens.

### 3.2 Vertical rhythm

Hero block is vertically centred inside `<main>` minus the header. To
avoid hard-coding the header height, the change at the layout call
site (see §5) flips `<main>` to `flex flex-col` and the disconnected
branch renders inside a `flex-1` region. The hero shell is then
`flex items-center justify-center px-4 py-12`. Inner block stacks
with `gap-4` between elements; `gap-3` between H1 and sub-copy.

## 4. Components

### 4.1 `DisconnectedHero`

```tsx
'use client';

import { ConnectButton } from '@rainbow-me/rainbowkit';
import { ArrowDownToLine, ArrowLeftRight, Layers, ArrowRight } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface Pill {
  label: string;
  icon: LucideIcon;
}

const PILLS: Pill[] = [
  { label: 'Lend',     icon: ArrowDownToLine },
  { label: 'Trade',    icon: ArrowLeftRight },
  { label: 'Strategy', icon: Layers },
];

export function DisconnectedHero() { /* ... */ }
```

Renders:
- wordmark
- H1 + sub
- pill row (static badges, **not** clickable — they're a visual cue
  for the sidebar groupings, nothing more)
- `<ConnectButton.Custom>` to render a styled hero-sized button that
  still routes through RainbowKit's modal
- helper row with two anchors: faucet (`https://faucet.iopn.tech`,
  `target="_blank"`) and explorer (`https://testnet.iopn.tech`,
  `target="_blank"`)

### 4.2 `WrongNetworkHero`

Same outer hero shell as `DisconnectedHero` to keep the visual rhythm
consistent. The differences:

- Wordmark replaced by an amber `Network warning` chip (`rounded-full
  bg-amber-100 text-amber-900 border border-amber-200 px-3 py-1`).
- H1 reads "Wrong network." sub reads "Stratus lives on IOPN Testnet
  (chainId 984). Switch to keep going."
- Pills row is hidden (they would imply Stratus is unusable here).
- CTA becomes a `<button>` that calls `switchChain({ chainId:
  iopnTestnet.id })`; label is `Switch to IOPN Testnet` and disabled
  state is `Switching…`.
- Helper row stays (faucet + explorer).

### 4.3 `ConnectGate` after refactor

```tsx
export function ConnectGate({ children }: Props) {
  const { isConnected } = useAccount();
  const chainId = useChainId();

  if (!isConnected) return <DisconnectedHero />;
  if (chainId !== iopnTestnet.id && chainId !== 31337) return <WrongNetworkHero />;
  return <>{children}</>;
}
```

The hooks `useSwitchChain` and the amber-card markup move into
`WrongNetworkHero`. `ConnectGate` becomes a thin router.

## 5. Layout call site

The hero needs the full main height (minus the header) to centre
vertically. Today `page.tsx` wraps `<ConnectGate>` in a `px-4 py-5
sm:px-6 sm:py-6 max-w-4xl` container, which would crop the hero. Fix:

- `<main>` becomes `flex-1 min-w-0 flex flex-col` so its children can
  use `flex-1` to claim the remaining vertical space below the sticky
  header.
- `<ConnectGate>` is rendered inside a `<div className="flex-1
  flex">` so both the connected route and the hero get the full
  remaining height.
- The `px-4 py-5 sm:px-6 sm:py-6 max-w-4xl` padding/width wrapper
  moves *inside* the connected branch (e.g. into `renderRoute()` or a
  new `<ConnectedContainer>` component). The hero branches render at
  full main width and centre themselves.

This is a small mechanical refactor of `page.tsx` and is in-scope for
this spec.

## 6. Copy

Locked at "ship-it" defaults:

- H1: **DeFi suite, on IOPN testnet.**
- Sub: **Lend, swap, and run leveraged LP, all on one app.**
- CTA: **Connect Wallet**
- Pills: **Lend**, **Trade**, **Strategy** (label-only — keep them
  matching the sidebar group titles exactly).
- Helper row: **Need OPN?** [Get testnet tokens ↗] **·** [View on
  explorer ↗]
- Wrong-network H1: **Wrong network.**
- Wrong-network sub: **Stratus lives on IOPN Testnet (chainId 984).
  Switch to keep going.**
- Wrong-network CTA: **Switch to IOPN Testnet** (disabled label:
  **Switching…**)

## 7. Behaviour

- The header `<ConnectButton />` stays. Clicking either it or the
  hero CTA opens the same RainbowKit modal.
- After a successful connect, the gate re-renders to the requested
  route's content (no full page transition needed — Wagmi's
  `useAccount` triggers re-render).
- After a successful chain switch from the wrong-network hero, same:
  gate re-renders.
- No animation on enter/exit beyond the natural React mount/unmount.

## 8. Accessibility

- Hero `<section>` has `aria-labelledby="stratus-hero-title"` pointing
  at the H1.
- CTA is a real `<button>` (rendered inside `<ConnectButton.Custom>`)
  so it gets keyboard focus and Enter/Space activation for free.
- Pills are rendered as `<span>` (decorative). Their leading icons
  carry `aria-hidden`.
- Colour contrast: the CTA is `#0a0a0a` on `#ffffff` (>14:1). Helper
  links are `text-zinc-900` (`#18181b`) on `#ffffff` (>15:1).
- The radial gradient sits on a white base — text is rendered on
  effectively flat white, so no contrast loss from the decoration.
- Min CTA hit target is 44×44 (the `py-3.5 px-7` gives ~52×48).

## 9. Mobile

- At `<sm`, H1 drops to `text-3xl` and the pill row wraps.
- Helper row stacks vertically (`flex-col` at `<sm`, `flex-row` at
  `sm+`).
- The mobile drawer trigger (the existing `☰` button at top-left
  of the page) is unaffected.

## 10. Out of scope

- Animated transitions / entrance choreography.
- Live protocol stats strip (TVL / APR / 24h volume) — explicitly
  parked.
- Pill click-through to specific sections (they stay static).
- Marketing-grade illustrations or hero image.
- Dark theme — the app is light-only today; that doesn't change here.

## 11. Test plan

Manual, in `npm run dev`:

1. **Disconnected, IOPN-correct chain (or no chain):** load `/` →
   should see the hero with all elements visible. Header still shows
   the small `<ConnectButton />`.
2. **Click hero CTA →** RainbowKit modal opens, completing the connect
   transitions to the originally-requested route.
3. **Click header `<ConnectButton />` →** same modal, same outcome.
4. **Connected, wrong chain (e.g., Mainnet):** should see
   `WrongNetworkHero` with amber chip + switch CTA.
5. **Click "Switch to IOPN Testnet" →** wallet prompts; on accept,
   page transitions to the requested route.
6. **Resize to 375px wide:** layout still legible; helper row stacks;
   no horizontal scrollbar.
7. **Tab through:** focus order is wordmark → CTA → helper-link 1 →
   helper-link 2. CTA shows a visible focus ring.

Type-check: `npm run typecheck` from `frontend/`. Should pass.
