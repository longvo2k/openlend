# Pool Charts v1

Date: 2026-05-31
Status: Design approved, ready for implementation plan

## Summary

A single time-series chart on the Lending Dashboard that visualizes Total Supply (TVL) and Utilization since the LendingPool was deployed. Data sourced from the IOPN explorer event log in one HTTP call, mirroring the existing History view pattern. No new write paths, no contract changes, no oracle dependency. v1 covers the Lending side only; Swap reserve, price, and volume charts are deferred to v2.

## Goals

- Surface the historical evolution of supply and utilization so users can see whether the pool is growing or stagnant, and whether utilization stays in a healthy band.
- Reuse the explorer-API event-fetching pattern already established in `lib/history.ts`; do not introduce chunked `eth_getLogs` calls.
- Keep the chart implementation small and contained, so adding swap or volume charts in v2 is a copy-and-extend, not a refactor.
- Add no friction to the existing Lending Dashboard load (lazy-load the chart's data, do not block existing reads).

## Non-goals

- Per-user historical positions. Out of scope. Lives elsewhere (History view already shows user events).
- Real-time block-level updates. Sixty-second polling via TanStack Query is sufficient.
- Multiple time ranges (24h / 7d / 30d toggle). Single all-time view in v1; toggle is a v2 enhancement.
- Swap reserves, price, or volume charts. Deferred to v2.
- Server-side aggregation or indexer. The explorer API is the only data source.
- Annotations for individual transactions on the chart. The History view covers that need.

## Architecture

### Data layer

New file: `frontend/lib/pool-history.ts`.

Exports a single TanStack Query hook:

```ts
export interface PoolHistoryPoint {
  ts: number;            // unix seconds, hourly bucketed
  totalSupply: bigint;   // 1e18-scaled OPN
  totalBorrowed: bigint; // 1e18-scaled OPN
  utilization: number;   // 0..100
}

export function useLendingPoolHistory(): {
  data: PoolHistoryPoint[] | undefined;
  isLoading: boolean;
  isError: boolean;
}
```

Implementation outline:

1. Build the explorer API URL once, against the active chain's LendingPool address. Reuse `lib/contract.ts`'s `getLendingPoolAddress`.
2. Single HTTP GET to `https://testnet.iopn.tech/api?module=logs&action=getLogs&fromBlock=...&toBlock=latest&address=<pool>`. Same query shape as `lib/history.ts`.
3. Decode each log via viem's `decodeEventLog` using the bundled `lendingPoolAbi`. Keep only `Supplied`, `Withdrawn`, `Borrowed`, `Repaid`. Skip `CollateralDeposited` / `CollateralWithdrawn` (collateral is separate from supply, has no effect on TVL or utilization).
4. Sort events by `(blockNumber, logIndex)` ascending.
5. Walk events in order maintaining running `totalSupply` and `totalBorrowed`:
   - `Supplied` += amount → totalSupply
   - `Withdrawn` -= amount → totalSupply
   - `Borrowed` += amount → totalBorrowed
   - `Repaid` -= amount → totalBorrowed
6. Each event becomes a `PoolHistoryPoint` with `utilization = (totalBorrowed * 100) / totalSupply` (handle `totalSupply == 0n` as `utilization = 0`).
7. Bucket into hourly samples: for each hour bucket, keep only the last point in that bucket (gives end-of-hour state). Prepend a synthetic `{ ts: deployHour, totalSupply: 0, totalBorrowed: 0, utilization: 0 }` so the chart starts at zero rather than at the first event.
8. Convert `bigint` values to `number` for the chart (divide by 1e18) at the very last step. Keep bigints internally for accuracy.

Query config:
- `staleTime: 30s`
- `refetchInterval: 60s`
- `refetchIntervalInBackground: false`
- Cache key includes chainId, so chain switches do not show stale data from the wrong chain.

### UI layer

New file: `frontend/components/PoolHistoryChart.tsx`.

Recharts `<ComposedChart>` with two `<Line>` series on dual Y-axes:

- Left axis: Total Supply (OPN), blue line
- Right axis: Utilization (%), red line, 0..100 domain

Around 80 LOC. Wrapped in `<ResponsiveContainer>` so it fills the parent width and adopts a fixed height (260 px).

States:
- Loading: skeleton placeholder (zinc-100 rounded rectangle, same height as the chart)
- Empty (no events yet): centered text "No activity yet. Supply or borrow to populate the chart."
- Error: small inline message "Could not load pool history." with a retry button
- Loaded: the chart itself

### Integration

Modify `frontend/components/DashboardView.tsx`:

- Import `PoolHistoryChart`
- Render it inside a section card directly below the existing `PoolStats` grid
- The section has a small header ("Pool history") and the chart fills the body

No route changes. No sidebar changes. No other components touched.

### Dependency

`frontend/package.json` gains `"recharts": "^2.13.0"` under `dependencies`. Bundle impact ~70 KB gzipped. Locked to the latest 2.x to avoid breaking changes in 3.x.

## File-by-file impact

```
frontend/package.json                       # +recharts
frontend/lib/pool-history.ts                # new, ~120 LOC
frontend/components/PoolHistoryChart.tsx    # new, ~80 LOC
frontend/components/DashboardView.tsx       # modified, ~5 LOC insertion
```

## Testing

Manual against testnet:

1. With no recent activity, confirm the chart shows a single point at 0/0 and the "no activity yet" empty state (depending on whether any events exist).
2. After a Supply transaction, confirm TVL line rises at the right hourly bucket.
3. After a Borrow transaction, confirm utilization line rises proportionally.
4. After a Withdraw + Repay sequence, confirm both lines come back down.
5. Open the Dashboard with a slow network throttled in devtools; confirm skeleton renders and chart appears without layout shift.

`npm run typecheck` is the gate (no frontend lint).

No new contract tests since no contract changes.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Explorer API rate-limits or fails | Same risk as History view today. TanStack Query retries with exponential backoff. The error state surfaces a retry button. |
| Event log grows large after months of activity | At hourly buckets with one or two events per hour, even a year of history is <10k points. Recharts handles 10k points without lag. If it grows beyond that, add a time-range toggle in v2. |
| Recharts version conflict with existing deps | None expected; project has no other charting deps. Pin to `^2.13` to track minor updates only. |
| Synthetic deploy-hour zero point misleading if the first real event is years later | Acceptable for now: contract is a fresh testnet deploy, history is days. Revisit if deployed contracts age beyond a few weeks without activity. |

## Out of scope (deferred to v2)

- Swap reserves chart (OPN reserve, mUSDC reserve over time)
- Swap implied price chart (mUSDC per OPN)
- Swap volume chart (per-hour swap volume in mUSDC equivalent)
- Time range selector (24h / 7d / all)
- Click-through on chart points to corresponding History view event
- Comparing multiple chains side by side

## Open questions

None at design approval time. Library, scope, time range, and integration point were all settled during brainstorming.
