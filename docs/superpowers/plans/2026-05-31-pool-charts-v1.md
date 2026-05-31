# Pool Charts v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a time-series chart to the Lending Dashboard showing Total Supply (TVL) and Utilization since the LendingPool was deployed, sourced from the IOPN explorer event log.

**Architecture:** A new TanStack Query hook in `frontend/lib/pool-history.ts` fetches `Supplied`, `Withdrawn`, `Borrowed`, `Repaid` events via the explorer API (one HTTP call, same pattern as `lib/history.ts`), walks them into running sums, and buckets the result hourly. A new `PoolHistoryChart` component renders the series via Recharts `ComposedChart` on dual Y-axes. `DashboardView` renders the chart below the existing pool stats grid.

**Tech Stack:** Next.js 14 (App Router) · React 18 · TanStack Query v5 · wagmi v2 · viem · Tailwind v3 · Recharts ^2.13 (new dependency)

**Spec:** `docs/superpowers/specs/2026-05-31-pool-charts-v1-design.md`

**Verification model:** The frontend has no test runner; per CLAUDE.md, `npm run typecheck` is the only static gate. Each task ends with a typecheck step. The final task adds a manual UI verification step in the dev server.

---

## Task 1: Branch and add the Recharts dependency

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/package-lock.json` (auto by npm)

- [ ] **Step 1: Create feature branch off epic**

Run from repo root:

```bash
git checkout epic/q3-strategy
git pull
git checkout -b feat/pool-charts
```

Expected: switched to a new branch `feat/pool-charts`.

- [ ] **Step 2: Install Recharts**

Run from `frontend/`:

```bash
cd frontend
npm install recharts@^2.13
```

Expected: `package.json` shows `"recharts": "^2.13.0"` under `dependencies`; lock file updated. No peer-dep warnings (Recharts 2.x supports React 18).

- [ ] **Step 3: Verify typecheck still passes**

Run from `frontend/`:

```bash
npm run typecheck
```

Expected: exit 0, no output beyond the npm header.

- [ ] **Step 4: Commit**

```bash
cd ..
git add frontend/package.json frontend/package-lock.json
git commit -m "$(cat <<'EOF'
chore(frontend): add recharts dependency for pool history chart

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Scaffold `lib/pool-history.ts` with types and an empty hook

This task creates the file with full type definitions and a hook that returns an empty array. No data fetching yet. This lets later tasks add fetching, decoding, and bucketing as focused changes.

**Files:**
- Create: `frontend/lib/pool-history.ts`

- [ ] **Step 1: Create the file with types and a stub hook**

Write `frontend/lib/pool-history.ts`:

```ts
import { useQuery } from '@tanstack/react-query';
import { useChainId } from 'wagmi';
import { getLendingPoolAddress } from './contract';

/**
 * One sampled point on the pool history chart. Times are unix seconds
 * snapped to the start of the hour bucket. `totalSupply` and
 * `totalBorrowed` are kept as bigint for accuracy and converted to
 * number at the chart boundary.
 */
export interface PoolHistoryPoint {
  ts: number;
  totalSupply: bigint;
  totalBorrowed: bigint;
  utilization: number;
}

/**
 * Explorer API base per chain. Only chain 984 (IOPN testnet) is
 * supported; local hardhat has no explorer so the hook returns empty.
 * Matches the table in lib/history.ts.
 */
const EXPLORER_API_BASE: Record<number, string | undefined> = {
  984: 'https://testnet.iopn.tech/api',
};

interface RawLog {
  address: string;
  topics: readonly `0x${string}`[];
  data: `0x${string}`;
  blockNumber: string;
  transactionHash: `0x${string}`;
  logIndex: string;
  timeStamp?: string;
}

interface ExplorerResponse {
  status: string;
  message: string;
  result: RawLog[];
}

/**
 * TanStack Query hook for pool TVL and utilization over time.
 * Returns an array of hourly-bucketed PoolHistoryPoint, or [] when no
 * activity exists yet for the pool on this chain.
 *
 * Task 2 ships the empty-result skeleton; Task 3 adds fetch + decode;
 * Task 4 adds hourly bucketing.
 */
export function useLendingPoolHistory() {
  const chainId = useChainId();
  const pool = getLendingPoolAddress(chainId);

  return useQuery<PoolHistoryPoint[]>({
    queryKey: ['lending-pool-history', chainId, pool],
    enabled: Boolean(pool),
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    staleTime: 30_000,
    queryFn: async () => {
      if (!pool) return [];
      const apiBase = EXPLORER_API_BASE[chainId];
      if (!apiBase) return [];
      // Fetching, decoding, and bucketing are added in later tasks.
      // RawLog and ExplorerResponse types are pre-declared above so
      // Task 3 only needs to add functions, not re-declare types.
      return [];
    },
  });
}
```

- [ ] **Step 2: Run typecheck**

Run from `frontend/`:

```bash
npm run typecheck
```

Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add frontend/lib/pool-history.ts
git commit -m "$(cat <<'EOF'
feat(frontend): scaffold pool-history hook with types

Adds lib/pool-history.ts with the PoolHistoryPoint shape and a
useLendingPoolHistory hook stub that returns empty arrays. Fetching,
decoding, and bucketing arrive in subsequent commits.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Fetch and decode events into an unbucketed running series

This task adds the explorer fetch and the event decoder, walks events into a running `{ ts, totalSupply, totalBorrowed }` list, and returns the unbucketed series. Bucketing comes in Task 4 so each commit is reviewable on its own.

**Files:**
- Modify: `frontend/lib/pool-history.ts`

- [ ] **Step 1: Add the explorer fetch helper**

Replace the entire contents of `frontend/lib/pool-history.ts` with:

```ts
import { useQuery } from '@tanstack/react-query';
import { useChainId } from 'wagmi';
import { decodeEventLog } from 'viem';
import { getLendingPoolAddress, lendingPoolAbi } from './contract';

export interface PoolHistoryPoint {
  ts: number;
  totalSupply: bigint;
  totalBorrowed: bigint;
  utilization: number;
}

const EXPLORER_API_BASE: Record<number, string | undefined> = {
  984: 'https://testnet.iopn.tech/api',
};

interface RawLog {
  address: string;
  topics: readonly `0x${string}`[];
  data: `0x${string}`;
  blockNumber: string;
  transactionHash: `0x${string}`;
  logIndex: string;
  timeStamp?: string;
}

interface ExplorerResponse {
  status: string;
  message: string;
  result: RawLog[];
}

async function fetchLogsViaExplorer(
  apiBase: string,
  contract: `0x${string}`,
): Promise<RawLog[]> {
  const url =
    `${apiBase}?module=logs&action=getLogs` +
    `&fromBlock=0&toBlock=latest&address=${contract}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Explorer logs HTTP ${res.status}`);
  const json = (await res.json()) as ExplorerResponse;
  if (json.status !== '1') return [];
  return json.result;
}

/**
 * Walk raw logs into a chronologically ordered running-sum series.
 * Only Supplied, Withdrawn, Borrowed, Repaid affect the TVL/utilization
 * curves. CollateralDeposited and CollateralWithdrawn are skipped
 * (collateral is separate from supply on the LendingPool contract).
 */
function walkEvents(logs: RawLog[]): PoolHistoryPoint[] {
  const points: PoolHistoryPoint[] = [];
  let totalSupply = 0n;
  let totalBorrowed = 0n;

  const sorted = [...logs].sort((a, b) => {
    const aBlock = BigInt(a.blockNumber);
    const bBlock = BigInt(b.blockNumber);
    if (aBlock !== bBlock) return aBlock < bBlock ? -1 : 1;
    return Number(a.logIndex) - Number(b.logIndex);
  });

  for (const raw of sorted) {
    if (raw.topics.length === 0) continue;
    let decoded: { eventName: string; args: Record<string, unknown> } | null = null;
    try {
      decoded = decodeEventLog({
        abi: lendingPoolAbi,
        data: raw.data,
        topics: raw.topics as [signature: `0x${string}`, ...args: `0x${string}`[]],
      }) as unknown as { eventName: string; args: Record<string, unknown> };
    } catch {
      continue;
    }
    if (!decoded) continue;

    const amount = (decoded.args.amount as bigint | undefined) ?? 0n;
    switch (decoded.eventName) {
      case 'Supplied':
        totalSupply += amount;
        break;
      case 'Withdrawn':
        totalSupply -= amount;
        break;
      case 'Borrowed':
        totalBorrowed += amount;
        break;
      case 'Repaid':
        totalBorrowed -= amount;
        break;
      default:
        continue;
    }
    const ts = raw.timeStamp ? Number(BigInt(raw.timeStamp)) : 0;
    const utilization =
      totalSupply === 0n
        ? 0
        : Number((totalBorrowed * 10000n) / totalSupply) / 100;
    points.push({ ts, totalSupply, totalBorrowed, utilization });
  }

  return points;
}

export function useLendingPoolHistory() {
  const chainId = useChainId();
  const pool = getLendingPoolAddress(chainId);

  return useQuery<PoolHistoryPoint[]>({
    queryKey: ['lending-pool-history', chainId, pool],
    enabled: Boolean(pool),
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    staleTime: 30_000,
    queryFn: async () => {
      if (!pool) return [];
      const apiBase = EXPLORER_API_BASE[chainId];
      if (!apiBase) return [];
      const logs = await fetchLogsViaExplorer(apiBase, pool);
      return walkEvents(logs);
    },
  });
}
```

- [ ] **Step 2: Run typecheck**

Run from `frontend/`:

```bash
npm run typecheck
```

Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add frontend/lib/pool-history.ts
git commit -m "$(cat <<'EOF'
feat(frontend): fetch and decode LendingPool events into running series

Pool-history hook now hits the IOPN explorer API for all LendingPool
logs in one HTTP call, decodes Supplied/Withdrawn/Borrowed/Repaid
via viem, and walks them in (block, logIndex) order into a running
{totalSupply, totalBorrowed, utilization} time series. Bucketing
comes next.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Hourly bucketing and synthetic zero anchor

The chart should show one point per hour bucket (end-of-hour state), and start at zero rather than at the first event so users can see growth from the deploy moment.

**Files:**
- Modify: `frontend/lib/pool-history.ts`

- [ ] **Step 1: Add the bucketing function**

Append to `frontend/lib/pool-history.ts` (before the `useLendingPoolHistory` export, after `walkEvents`):

```ts
const SECONDS_PER_HOUR = 3600;

/**
 * Snap a unix-second timestamp to the start of its hour bucket.
 */
function hourBucket(ts: number): number {
  return Math.floor(ts / SECONDS_PER_HOUR) * SECONDS_PER_HOUR;
}

/**
 * Reduce a per-event series to one point per hour bucket (the last
 * event in each bucket). Prepends a synthetic zero point one hour
 * before the first real event so the chart begins at the origin.
 */
function bucketHourly(points: PoolHistoryPoint[]): PoolHistoryPoint[] {
  if (points.length === 0) return [];

  // Group by hour bucket, keep the last point per bucket.
  const byBucket = new Map<number, PoolHistoryPoint>();
  for (const p of points) {
    if (p.ts === 0) continue; // explorer didn't supply a timestamp
    byBucket.set(hourBucket(p.ts), { ...p, ts: hourBucket(p.ts) });
  }

  const result = Array.from(byBucket.values()).sort((a, b) => a.ts - b.ts);
  if (result.length === 0) return [];

  // Prepend a synthetic zero point one bucket before the first.
  result.unshift({
    ts: result[0].ts - SECONDS_PER_HOUR,
    totalSupply: 0n,
    totalBorrowed: 0n,
    utilization: 0,
  });

  return result;
}
```

- [ ] **Step 2: Wire the bucketer into the hook**

In the same file, change the `queryFn` body from:

```ts
      const logs = await fetchLogsViaExplorer(apiBase, pool);
      return walkEvents(logs);
```

to:

```ts
      const logs = await fetchLogsViaExplorer(apiBase, pool);
      const walked = walkEvents(logs);
      return bucketHourly(walked);
```

- [ ] **Step 3: Run typecheck**

Run from `frontend/`:

```bash
npm run typecheck
```

Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add frontend/lib/pool-history.ts
git commit -m "$(cat <<'EOF'
feat(frontend): bucket pool history hourly with synthetic zero anchor

Reduces the per-event series to one point per hour (last event in
each bucket) so chart point count stays bounded. Prepends a synthetic
zero point one bucket before the first real event so the chart starts
at the origin rather than at the first activity, making early growth
visible.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Build the `PoolHistoryChart` component

The component owns its own data fetching via the hook and renders loading/empty/error/loaded states. Recharts is SSR-unsafe (uses `window`), so the actual chart only mounts after the first client render.

**Files:**
- Create: `frontend/components/PoolHistoryChart.tsx`

- [ ] **Step 1: Create the component file**

Write `frontend/components/PoolHistoryChart.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from 'recharts';
import { useLendingPoolHistory, type PoolHistoryPoint } from '../lib/pool-history';
import { formatOPN } from '../lib/format';

const CHART_HEIGHT = 260;

interface ChartDatum {
  ts: number;
  totalSupplyOPN: number;
  utilization: number;
  label: string;
}

function toChartData(points: PoolHistoryPoint[]): ChartDatum[] {
  return points.map((p) => ({
    ts: p.ts,
    totalSupplyOPN: Number(p.totalSupply) / 1e18,
    utilization: p.utilization,
    label: new Date(p.ts * 1000).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
    }),
  }));
}

export function PoolHistoryChart() {
  // Recharts hits window/document on mount; defer to client render.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const { data, isLoading, isError, refetch } = useLendingPoolHistory();

  if (!mounted || isLoading) {
    return (
      <div
        className="w-full animate-pulse rounded-xl bg-zinc-100"
        style={{ height: CHART_HEIGHT }}
        aria-label="Loading pool history"
      />
    );
  }

  if (isError) {
    return (
      <div
        className="flex w-full items-center justify-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 text-sm text-red-800"
        style={{ height: CHART_HEIGHT }}
      >
        <span>Could not load pool history.</span>
        <button
          type="button"
          onClick={() => refetch()}
          className="rounded-md bg-red-100 px-2 py-1 text-xs font-semibold text-red-900 hover:bg-red-200"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div
        className="flex w-full items-center justify-center rounded-xl border border-dashed border-zinc-300 bg-white text-sm text-zinc-600"
        style={{ height: CHART_HEIGHT }}
      >
        No activity yet. Supply or borrow to populate the chart.
      </div>
    );
  }

  const chartData = toChartData(data);

  return (
    <div style={{ width: '100%', height: CHART_HEIGHT }}>
      <ResponsiveContainer>
        <ComposedChart data={chartData} margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
          <CartesianGrid stroke="#f4f4f5" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: '#52525b' }}
            stroke="#d4d4d8"
          />
          <YAxis
            yAxisId="supply"
            tick={{ fontSize: 11, fill: '#52525b' }}
            stroke="#d4d4d8"
            tickFormatter={(v: number) => formatOPN(BigInt(Math.round(v * 1e18)), 2)}
            width={64}
          />
          <YAxis
            yAxisId="util"
            orientation="right"
            domain={[0, 100]}
            tick={{ fontSize: 11, fill: '#52525b' }}
            stroke="#d4d4d8"
            tickFormatter={(v: number) => `${v.toFixed(0)}%`}
            width={48}
          />
          <Tooltip
            formatter={(value: number | string, name: string) => {
              if (name === 'TVL (OPN)') {
                const num = typeof value === 'number' ? value : Number(value);
                return [formatOPN(BigInt(Math.round(num * 1e18)), 4) + ' OPN', name];
              }
              if (name === 'Utilization') {
                const num = typeof value === 'number' ? value : Number(value);
                return [`${num.toFixed(2)}%`, name];
              }
              return [value, name];
            }}
            labelFormatter={(label) => `As of ${label}`}
            contentStyle={{ fontSize: 12 }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line
            yAxisId="supply"
            dataKey="totalSupplyOPN"
            name="TVL (OPN)"
            type="monotone"
            stroke="#2563eb"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
          <Line
            yAxisId="util"
            dataKey="utilization"
            name="Utilization"
            type="monotone"
            stroke="#dc2626"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
```

- [ ] **Step 2: Run typecheck**

Run from `frontend/`:

```bash
npm run typecheck
```

Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add frontend/components/PoolHistoryChart.tsx
git commit -m "$(cat <<'EOF'
feat(frontend): PoolHistoryChart component (recharts dual-axis)

Renders the lending pool's TVL (blue, left axis) and Utilization (red,
right axis, 0-100%) as a dual-axis ComposedChart. Loading skeleton,
error-with-retry, and empty states included. Defers chart mount until
after the first client render to side-step Recharts' SSR
incompatibility with window/document.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Integrate the chart into `DashboardView` and manually verify

**Files:**
- Modify: `frontend/components/DashboardView.tsx`

- [ ] **Step 1: Update DashboardView**

Replace the entire contents of `frontend/components/DashboardView.tsx` with:

```tsx
'use client';

import { PoolStats } from './PoolStats';
import { AccountStats } from './AccountStats';
import { PoolHistoryChart } from './PoolHistoryChart';

export function DashboardView() {
  return (
    <div className="space-y-4 sm:space-y-6">
      <PoolStats />
      <AccountStats />
      <section className="rounded-2xl border border-zinc-200 bg-white p-4 sm:p-5 shadow-sm">
        <header className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-semibold">Pool history</h3>
          <span className="text-xs text-zinc-500">TVL and utilization since deploy</span>
        </header>
        <PoolHistoryChart />
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Run typecheck**

Run from `frontend/`:

```bash
npm run typecheck
```

Expected: exit 0.

- [ ] **Step 3: Start the dev server and visually verify**

From `frontend/`:

```bash
npm run dev
```

Open http://localhost:3000 (or 3001 if 3000 is occupied), connect a wallet, navigate to **Lending → Dashboard**. Confirm:

1. The chart section appears below the existing pool stats and account stats.
2. If the pool has activity: a blue TVL line and red Utilization line render with a legend and tooltips.
3. If the pool is empty: the empty-state message "No activity yet. Supply or borrow to populate the chart." appears.
4. Hover a chart point: tooltip shows formatted OPN amount and percentage with the bucket time.
5. The chart resizes responsively when the browser is narrowed.
6. Hard-refresh (Cmd-Shift-R): the skeleton renders briefly, then the chart populates without layout shift.

Stop the dev server with Ctrl-C once visual verification passes.

- [ ] **Step 4: Commit**

```bash
git add frontend/components/DashboardView.tsx
git commit -m "$(cat <<'EOF'
feat(frontend): mount PoolHistoryChart on the Lending Dashboard

Embeds the new dual-axis pool history chart below the existing
PoolStats and AccountStats grids, wrapped in a card with a "Pool
history" header for context. Completes the Pool Charts v1 feature
described in the spec.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Update the roadmap and push the branch

**Files:**
- Modify: `ROADMAP.md`

- [ ] **Step 1: Drop the Pool charts bullet from ROADMAP**

Open `ROADMAP.md` and remove the bullet starting with `**Pool charts**:` from the Q3 2026 section. Per the rules in `CLAUDE.md`, shipped items get dropped (no separate Shipped section). The README and submission description carry the shipped narrative.

After editing, the Q3 2026 section should still have its other bullets intact: Close & rebalance, Leverage-long looper, Permit2, Price oracle, Position dashboard.

- [ ] **Step 2: Commit**

```bash
git add ROADMAP.md
git commit -m "$(cat <<'EOF'
docs: drop Pool charts bullet from ROADMAP (shipped)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 3: Push the feature branch**

```bash
git push -u origin feat/pool-charts
```

Expected: branch created on origin, upstream tracking set. PR URL printed by the remote.

- [ ] **Step 4: Open the PR**

Target the PR at `epic/q3-strategy`, not `main` or `develop`, to keep the epic stack clean:

```bash
gh pr create --base epic/q3-strategy --title "feat(frontend): Pool Charts v1" --body "$(cat <<'EOF'
## Summary
- New `lib/pool-history.ts` TanStack Query hook fetches LendingPool events via the IOPN explorer API in one HTTP call, walks them into running sums, and buckets hourly with a synthetic zero anchor
- New `PoolHistoryChart` component renders TVL and Utilization on a Recharts ComposedChart with dual Y-axes; ships loading/empty/error states
- Embedded on the Lending Dashboard below the existing pool and account stats grids
- Drops the corresponding ROADMAP bullet per the shipped-items rule

## Test plan
- [ ] `npm run typecheck` passes
- [ ] Dev server: chart renders with sensible curves matching the current pool state
- [ ] Empty pool state shows the placeholder message
- [ ] Tooltip shows formatted OPN values and percentages
- [ ] Hard-refresh shows skeleton then chart without layout shift

Spec: `docs/superpowers/specs/2026-05-31-pool-charts-v1-design.md`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: PR URL printed; PR open against `epic/q3-strategy`.

---

## Spec coverage check

| Spec section | Covered by |
|---|---|
| `useLendingPoolHistory` hook shape | Task 2 (types), Task 3 (fetch + decode), Task 4 (bucketing) |
| Explorer API URL pattern matches `lib/history.ts` | Task 3 Step 1 |
| Event filter to Supplied/Withdrawn/Borrowed/Repaid only | Task 3 walkEvents switch |
| Running sums for totalSupply, totalBorrowed | Task 3 walkEvents |
| Hourly buckets, last point per bucket | Task 4 bucketHourly |
| Synthetic zero anchor one bucket before first event | Task 4 bucketHourly unshift |
| Bigint internally, convert at chart boundary | Task 5 toChartData |
| TanStack Query config (60s refetch, 30s stale, no bg refetch, chainId in key) | Task 2 + Task 3 |
| Dual Y-axes ComposedChart, Total Supply blue / Utilization red | Task 5 chart body |
| Loading / empty / error states | Task 5 conditional returns |
| ResponsiveContainer 260 px height | Task 5 |
| Integration below PoolStats grid on Dashboard | Task 6 |
| Recharts dependency added | Task 1 |
| ROADMAP bullet drop on ship | Task 7 |
