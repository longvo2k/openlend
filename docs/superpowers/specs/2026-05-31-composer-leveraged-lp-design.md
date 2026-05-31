# Composer: Leveraged LP — Design Spec (v1)

**Project:** OpenLend + OpenSwap suite — first cross-protocol "strategy" recipe
**Date:** 2026-05-31
**Status:** Approved
**Owner:** vvlong.2k@gmail.com
**Depends on:** [OpenLend contracts](2026-05-29-iopn-lending-design.md), [OpenSwap contracts](2026-05-29-openswap-design.md), [OpenLend frontend](2026-05-29-openlend-frontend-design.md), [OpenSwap frontend](2026-05-29-openswap-frontend-design.md)

## 1. Purpose

A single-screen composer that orchestrates a multi-step *Leveraged LP*
position across both protocols:

1. Lock OPN as collateral on `LendingPool`
2. Borrow OPN against it
3. Pair the borrowed OPN with mUSDC and add liquidity on `OpenSwapPair`

The user signs each step from their own wallet (no router contract), so
all on-chain accounting (`collateral`, `borrowed`, `LP balance`) lands
on their address directly. The composer is the first concrete demo that
the two protocols compose into something more than the sum of their
parts.

**Non-goals (v1):** StrategyRouter contract / atomic one-tx flow,
slippage protection on `addLiquidity`, additional recipes (recursive
loop, leverage-long, position-unwind), APR / earnings projection,
position-close helper.

## 2. Scope

Front-end only. No new Solidity contracts, no new tests for the
protocol layer. The change set is:

- New: `frontend/components/strategy/LeveragedLPPanel.tsx`
- Modified: `frontend/components/Sidebar.tsx` — add a STRATEGY group
- Modified: `frontend/lib/route.ts` — new `strategy:leveraged-lp` route
  + hash `#leveraged-lp`
- Modified: `frontend/app/page.tsx` — render the new panel
- Modified: `README.md` — short note in the Frontend section

## 3. UI

Single-column panel under the new STRATEGY > Leveraged LP sidebar item.
Cyan accent (distinct from Lend emerald, Swap sky, Liquidate red,
Faucet amber).

```
┌─────────────────────────────────────┐
│ ⏃ Leveraged LP                       │
│ Lock OPN, borrow OPN, pair with     │
│ mUSDC, earn LP fees on the          │
│ borrowed capital.                   │
├─────────────────────────────────────┤
│ Collateral                          │
│ [  10.0   ] OPN          [MAX]      │
│ Wallet: 25.50 OPN                   │
│                                     │
│ Borrow LTV  ●──────── 65%           │
│ Borrowing: 6.50 OPN @ 5% APR        │
│                                     │
│ mUSDC to pair                       │
│ [ 650.00  ] mUSDC        [MAX]      │
│ Wallet: 1,000.00 mUSDC              │
│ Auto-paired at pool ratio           │
│                                     │
│ — Preview —                         │
│ + Collateral  10.00 OPN             │
│ + Debt        6.50 OPN @ 5% APR     │
│ + LP added    ~64.8 OSP-LP          │
│ Health factor after: 1.23 (green)   │
│                                     │
│ [    Execute (4 transactions)    ]  │
│                                     │
│ ✓ Step 1: Deposit collateral        │
│ ⏳ Step 2: Borrow (Pending…)        │
│ ─ Step 3: Approve mUSDC             │
│ ─ Step 4: Add liquidity             │
│ [ view tx ↗ ]   [ Cancel ]          │
└─────────────────────────────────────┘
```

### 3.1 Inputs

- **Collateral OPN** (free input, `MAX` = wallet balance minus
  `0.0001 OPN` gas reserve)
- **Borrow LTV** slider, range `0%–70%` (the protocol cap is 75% — we
  clamp 5 percentage points below it so the user lands with HF
  headroom). Default `65%`.
- **mUSDC to pair** (free input, auto-fills whenever the borrow amount
  changes to `borrowOPN × reserveMUSDC / reserveOPN`). User can
  override; off-ratio costs them via the AMM's `min()` formula but the
  contract returns excess to their wallet.

### 3.2 Preview

Computed locally on every input change:

- `borrowOPN = collateralOPN × LTV`
- `mUSDCPaired = mUSDCInput` (post-auto-pair)
- `lpShares = quoteAddLiquidity(borrowOPN, mUSDCPaired)` (live read)
- `hfAfter` — projected health factor *after* both new collateral and
  new debt are accounted for:
  ```
  newCollateral = existingCollateral + collateralOPN
  newDebt       = existingDebt       + borrowOPN
  hfAfter       = newCollateral × LIQ_THRESHOLD_BPS × 1e18 / (newDebt × BPS_DENOM)
  ```
- HF color matches `formatHF` from `lib/format.ts` — red `< 1`, amber
  `< 1.2`, emerald `≥ 1.2`, infinity if `newDebt === 0n`.

### 3.3 Status list

Four rows. Each row's state independent: `idle | sign | pending | done | failed | skipped`.

- Step 1: Deposit collateral
- Step 2: Borrow
- Step 3: Approve mUSDC — automatically marked `skipped` (gray check)
  when `allowance(user, pair) ≥ mUSDCInput`
- Step 4: Add liquidity

Each completed row exposes a `view tx ↗` link to the explorer.

## 4. Data flow

### 4.1 Reads (per-render, refetched every ~5s)

| Source | Call | Use |
|---|---|---|
| `useBalance(user)` | RPC | Wallet OPN balance + MAX |
| `mUSDC.balanceOf(user)` | wagmi | Wallet mUSDC |
| `mUSDC.allowance(user, pair)` | wagmi | Skip step 3 when sufficient |
| `lendingPool.getAccountData(user)` | wagmi | Existing collateral/debt for hf-after |
| `lendingPool.LTV_BPS()` | wagmi (cached) | Authoritative cap |
| `openSwapPair.getReserves()` | wagmi | Auto-pair ratio |
| `openSwapPair.totalSupply()` | wagmi | LP-share preview |
| `openSwapPair.quoteAddLiquidity(opn, musdc)` | wagmi | Exact LP minted |

All reads use the existing `getLendingPoolAddress` / `getPairAddress` /
`getMockUSDCAddress` loaders. Same `enabled` guards as the existing
panels (require pool + user before firing).

### 4.2 Writes (sequential, awaited)

Single `onExecute` handler. Phases advance only after each
`waitForTransactionReceipt` resolves.

```ts
type Phase =
  | 'idle'
  | 'deposit-sign' | 'deposit-pending'
  | 'borrow-sign'  | 'borrow-pending'
  | 'approve-sign' | 'approve-pending'  // skipped when allowance ok
  | 'addlp-sign'   | 'addlp-pending'
  | 'success'
  | 'error';
```

```
1. lendingPool.depositCollateral({ value: collateralOPN })
   → wait receipt
2. lendingPool.borrow(borrowOPN)
   → wait receipt
3. if (allowance < mUSDCInput):
     mockUSDC.approve(pair, MaxUint256)
     → wait receipt
4. openSwapPair.addLiquidity(mUSDCInput, { value: borrowOPN })
   → wait receipt
   → setPhase('success')
```

Each `writeContractAsync` call records the resulting hash so the status
row can render an explorer link as the tx confirms.

## 5. Errors & edge cases

| Condition | Behaviour |
|---|---|
| Wallet OPN < `collateralOPN + 0.0001 reserve` | CTA disabled, helper "Need X more OPN (incl. gas reserve)" |
| `mUSDC.balanceOf(user) < mUSDCInput` | CTA disabled, helper links to `#faucet` |
| `getReserves()` returns `(0, 0, _)` | CTA disabled, helper "Bootstrap the pool first via Swap > Liquidity" |
| Slider implies borrow > available pool liquidity | CTA disabled, helper "Pool only has Y OPN free" |
| `hfAfter < 1e18` | CTA disabled (red), helper "Health factor would go below 1.0" |
| `1e18 ≤ hfAfter < 1.2e18` | CTA enabled, soft warning above ("HF will be low: Z") |
| User rejects in wallet mid-sequence | Phase → `error`, failed step row red, finished steps stay green, "What to do" hint per step |
| Step succeeds on-chain but the receipt times out | Treated as error; the actual chain state is correct, the panel just can't proceed automatically. Hint to retry from where the visible state left off. |
| Step 4 reverts due to AMM ratio drift | Excess of one side stays in user wallet (per `addLiquidity` impl); panel shows the tx-revert reason |

## 6. Testing

No contract changes → no Hardhat tests added. Verification is:

1. `npm run typecheck` clean
2. `npm run build` clean
3. **Manual e2e** against the deployed IOPN testnet contracts:
   - Open `#leveraged-lp`, default values shown
   - Enter 1 OPN collateral, 65% LTV → previews populate
   - Click Execute → 3 wallet popups (allowance already set in our flow) → all 4 steps land green → success state
4. **Manual failure modes**:
   - Reject step 2 → red row with hint, steps 3-4 stay grey
   - Insufficient mUSDC → CTA disabled with faucet link
   - Empty pool → CTA disabled with liquidity link

## 7. Acceptance criteria

- New sidebar group STRATEGY with one entry "Leveraged LP" (cyan-accent
  glyph, e.g. `⏃`)
- `#leveraged-lp` hash route renders the panel; deep-linking works
- Panel reads + preview update on every input change without spamming
  the RPC (each read query has `refetchInterval: 5000`,
  `staleTime: 2000`)
- Submit triggers exactly 3 (with prior allowance) or 4 (without) txs,
  each tracked in the status list
- On `success`, the Dashboard + History tabs reflect the new collateral,
  debt, and LP balance within one refetch cycle
- TypeScript strict, no `any` casts beyond the documented JSON-ABI ones
  used in `decodeEventLog` elsewhere

## 8. Out of scope (v1)

- StrategyRouter contract, atomic bundling, ERC-4626 position wrapper
- Slippage param on `addLiquidity` (existing contract takes none)
- Position close / unwind composer ("withdraw LP → repay → withdraw
  collateral") — natural v2
- Recipe library / templating (when v2 adds more recipes, lift the
  shared bits into a `lib/strategy/` module)
- APR / fee-earnings forecast — needs historical swap volume, deferred
- Mobile-specific tweaks beyond reusing the current responsive grid
