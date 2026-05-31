'use client';

import {
  useAccount,
  useChainId,
  useReadContract,
  useReadContracts,
} from 'wagmi';
// Keep useReadContracts for getAccountData (still convenient for one tuple);
// individual useReadContract is used for pair reads to avoid mixed-args quirks.
import { maxUint256 } from 'viem';
import { Briefcase, Layers } from 'lucide-react';

import {
  getLendingPoolAddress,
  getPairAddress,
  lendingPoolAbi,
  openSwapPairAbi,
} from '@/lib/contract';
import { formatHF, formatLP, formatMUSDC, formatOPN } from '@/lib/format';

const LIQUIDATION_THRESHOLD_BPS = 8000;

/**
 * One-stop view of the user's open Strategy positions.
 *
 * v1 surfaces Leveraged LP only. Future composer positions (looper, etc.)
 * stack as additional cards alongside. Navigation to the composer uses
 * anchor hrefs so the parent's useHashRoute hook picks the change up
 * without prop drilling.
 */
export function PositionsDashboard() {
  const chainId = useChainId();
  const { address: user } = useAccount();
  const pool = getLendingPoolAddress(chainId);
  const pair = getPairAddress(chainId);

  /* Account data: collateral, debt */
  const { data: poolReads } = useReadContracts({
    contracts:
      pool && user
        ? [{ address: pool, abi: lendingPoolAbi, functionName: 'getAccountData', args: [user] }]
        : [],
    query: { enabled: Boolean(pool && user), refetchInterval: 5000 },
  });
  const account = poolReads?.[0]?.result as readonly [bigint, bigint, bigint, bigint] | undefined;
  const collateral = account?.[0] ?? 0n;
  const debt = account?.[1] ?? 0n;

  /* LP balance: separate read so the args:[user] is unambiguous and we
   * never accidentally lose this value to a sibling contract error. */
  const { data: lpBalRaw } = useReadContract({
    address: pair ?? undefined,
    abi: openSwapPairAbi,
    functionName: 'balanceOf',
    args: user ? [user] : undefined,
    query: { enabled: Boolean(pair && user), refetchInterval: 5000 },
  });
  const lpBalance = (lpBalRaw as bigint | undefined) ?? 0n;

  /* Pool state for value derivation */
  const { data: lpTotalSupplyRaw } = useReadContract({
    address: pair ?? undefined,
    abi: openSwapPairAbi,
    functionName: 'totalSupply',
    query: { enabled: Boolean(pair), refetchInterval: 5000 },
  });
  const lpTotalSupply = (lpTotalSupplyRaw as bigint | undefined) ?? 0n;

  const { data: reservesRaw } = useReadContract({
    address: pair ?? undefined,
    abi: openSwapPairAbi,
    functionName: 'getReserves',
    query: { enabled: Boolean(pair), refetchInterval: 5000 },
  });
  const reserves = reservesRaw as readonly [bigint, bigint, number] | undefined;
  const reserveOPN = reserves?.[0] ?? 0n;
  const reserveMUSDC = reserves?.[1] ?? 0n;

  /* Derived */
  const lpOpnShare =
    lpTotalSupply === 0n ? 0n : (lpBalance * reserveOPN) / lpTotalSupply;
  const lpMUSDCShare =
    lpTotalSupply === 0n ? 0n : (lpBalance * reserveMUSDC) / lpTotalSupply;

  const hf =
    debt === 0n
      ? maxUint256
      : (collateral * BigInt(LIQUIDATION_THRESHOLD_BPS) * 10n ** 18n) / (debt * 10000n);
  const hfFmt = formatHF(hf);
  const hfTone =
    hfFmt.tone === 'red'
      ? 'bg-red-100 text-red-800 border-red-300'
      : hfFmt.tone === 'yellow'
      ? 'bg-amber-100 text-amber-900 border-amber-300'
      : hfFmt.tone === 'green'
      ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
      : 'bg-zinc-100 text-zinc-700 border-zinc-300';

  /* Net position value, in mUSDC-equivalent (mUSDC anchors $1). */
  const collateralUSD =
    reserveOPN === 0n ? 0n : (collateral * reserveMUSDC) / reserveOPN;
  const debtUSD = reserveOPN === 0n ? 0n : (debt * reserveMUSDC) / reserveOPN;
  const lpUSD = lpMUSDCShare * 2n; // both halves at $1 ratio
  const netUSD = collateralUSD + lpUSD - debtUSD;

  const hasPosition = collateral > 0n || debt > 0n || lpBalance > 0n;

  return (
    <div className="space-y-4">
      <header className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-black">
          <Briefcase className="h-5 w-5" aria-hidden />
        </div>
        <div>
          <h2 className="text-lg font-semibold">Positions</h2>
          <p className="text-sm text-zinc-700">
            Open Strategy composer positions for this wallet. Live HF and value
            refresh every five seconds.
          </p>
        </div>
      </header>

      {!user && (
        <div className="rounded-lg border border-zinc-300 bg-zinc-50 p-4 text-sm text-zinc-700">
          Connect a wallet to see your positions.
        </div>
      )}

      {user && !hasPosition && (
        <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-6 text-center">
          <Layers className="mx-auto mb-2 h-8 w-8 text-zinc-400" aria-hidden />
          <p className="text-sm font-medium text-zinc-900">No open positions.</p>
          <p className="mt-1 text-xs text-zinc-600">
            Open a Leveraged LP to deploy collateral against the OPN/mUSDC pool.
          </p>
          <a
            href="#leveraged-lp"
            className="mt-3 inline-flex rounded-lg bg-black px-3 py-1.5 text-xs font-semibold text-white hover:bg-zinc-800"
          >
            Open Leveraged LP
          </a>
        </div>
      )}

      {user && hasPosition && (
        <article className="rounded-xl border border-zinc-200 bg-white p-4 sm:p-5 shadow-sm">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-black">
                <Layers className="h-5 w-5" aria-hidden />
              </div>
              <div>
                <h3 className="text-base font-semibold">Leveraged LP</h3>
                <p className="text-xs text-zinc-700">OPN collateral, OPN debt, OPN/mUSDC LP.</p>
              </div>
            </div>
            <span
              className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${hfTone}`}
              title="Health factor"
            >
              HF {hfFmt.text}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <Cell label="Collateral" value={`${formatOPN(collateral)} OPN`} sub={`≈ ${formatMUSDC(collateralUSD)} mUSDC`} />
            <Cell label="Debt" value={`${formatOPN(debt)} OPN`} sub={`≈ ${formatMUSDC(debtUSD)} mUSDC @ 5% APR`} />
            <Cell
              label="LP balance"
              value={`${formatLP(lpBalance)} OSP-LP`}
              sub={
                lpBalance > 0n
                  ? `${formatOPN(lpOpnShare)} OPN + ${formatMUSDC(lpMUSDCShare)} mUSDC`
                  : 'no LP shares'
              }
            />
            <Cell
              label="Net value"
              value={`${formatMUSDC(netUSD)} mUSDC`}
              sub="collateral + LP − debt"
            />
          </div>

          <a
            href="#leveraged-lp"
            className="mt-4 block rounded-lg bg-black px-3 py-2 text-center text-sm font-semibold text-white hover:bg-zinc-800"
          >
            Manage position
          </a>

          {hfFmt.tone === 'red' && (
            <p className="mt-3 rounded-lg border border-red-300 bg-red-50 p-3 text-xs text-red-800">
              Position is liquidatable (HF below 1.0). Repay debt or close LP to recover collateral.
            </p>
          )}
          {hfFmt.tone === 'yellow' && (
            <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
              HF is approaching 1.0. Consider partial close or topping up collateral.
            </p>
          )}
        </article>
      )}
    </div>
  );
}

function Cell({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
        {label}
      </div>
      <div className="mt-0.5 text-sm font-medium text-zinc-900 tabular-nums">{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-zinc-600 tabular-nums">{sub}</div>}
    </div>
  );
}
