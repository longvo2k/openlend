'use client';

import { useMemo, useState } from 'react';
import { maxUint256, parseEther, parseUnits } from 'viem';
import {
  useAccount,
  useBalance,
  useChainId,
  useReadContract,
  useReadContracts,
} from 'wagmi';

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

function parseMUSDC(s: string): bigint {
  return parseUnits(s.trim(), 6);
}

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
  void GAS_RESERVE_WEI;
  void setCollateralText;
  void setLtvBps;
  void setMusdcOverride;

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
