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
