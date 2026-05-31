'use client';

import { useMemo, useState } from 'react';
import {
  useAccount,
  useBalance,
  useChainId,
  usePublicClient,
  useReadContract,
  useReadContracts,
  useWriteContract,
} from 'wagmi';
import { maxUint256 } from 'viem';

import {
  getLendingPoolAddress,
  getPairAddress,
  lendingPoolAbi,
  openSwapPairAbi,
} from '@/lib/contract';
import { formatHF, formatLP, formatMUSDC, formatOPN } from '@/lib/format';
import {
  GAS_RESERVE_WEI,
  LIQUIDATION_THRESHOLD_BPS,
  Row,
  StepRow,
  StepState,
} from './LeveragedLPShared';

type Phase =
  | 'idle'
  | 'remove-sign'
  | 'remove-pending'
  | 'repay-sign'
  | 'repay-pending'
  | 'withdraw-sign'
  | 'withdraw-pending'
  | 'success'
  | 'error';

type StepKey = 'remove' | 'repay' | 'withdraw';

function phaseToStep(phase: Phase): StepKey | null {
  switch (phase) {
    case 'remove-sign':
    case 'remove-pending':
      return 'remove';
    case 'repay-sign':
    case 'repay-pending':
      return 'repay';
    case 'withdraw-sign':
    case 'withdraw-pending':
      return 'withdraw';
    default:
      return null;
  }
}

const phaseSign = (p: Phase) => p.endsWith('-sign');
const phasePending = (p: Phase) => p.endsWith('-pending');

const ORDER: StepKey[] = ['remove', 'repay', 'withdraw'];

export function CloseLeveragedLPForm() {
  const chainId = useChainId();
  const { address: user } = useAccount();
  const pool = getLendingPoolAddress(chainId);
  const pair = getPairAddress(chainId);
  const publicClient = usePublicClient();

  const [lpPercent, setLpPercent] = useState<number>(100);

  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [hashes, setHashes] = useState<Partial<Record<StepKey, `0x${string}`>>>({});
  const [failedStep, setFailedStep] = useState<StepKey | null>(null);

  const { writeContractAsync } = useWriteContract();

  /* Reads */
  const { data: bal } = useBalance({
    address: user,
    query: { enabled: Boolean(user), refetchInterval: 5000 },
  });

  const { data: poolReads } = useReadContracts({
    contracts:
      pool && user
        ? [{ address: pool, abi: lendingPoolAbi, functionName: 'getAccountData', args: [user] }]
        : [],
    query: { enabled: Boolean(pool && user), refetchInterval: 5000 },
  });
  const account = poolReads?.[0]?.result as readonly [bigint, bigint, bigint, bigint] | undefined;
  const currentCollateral = account?.[0] ?? 0n;
  const currentDebt = account?.[1] ?? 0n;

  const { data: pairReads } = useReadContracts({
    contracts:
      pair && user
        ? [
            { address: pair, abi: openSwapPairAbi, functionName: 'balanceOf', args: [user] },
            { address: pair, abi: openSwapPairAbi, functionName: 'totalSupply' },
            { address: pair, abi: openSwapPairAbi, functionName: 'getReserves' },
          ]
        : [],
    query: { enabled: Boolean(pair && user), refetchInterval: 5000 },
  });
  const lpBalance = (pairReads?.[0]?.result as bigint | undefined) ?? 0n;
  const lpTotalSupply = (pairReads?.[1]?.result as bigint | undefined) ?? 0n;
  const reserves = pairReads?.[2]?.result as readonly [bigint, bigint, number] | undefined;
  const reserveOPN = reserves?.[0] ?? 0n;
  const reserveMUSDC = reserves?.[1] ?? 0n;

  /* Derived amounts */
  const lpAmount = useMemo<bigint>(() => {
    if (lpBalance === 0n) return 0n;
    return (lpBalance * BigInt(lpPercent)) / 100n;
  }, [lpBalance, lpPercent]);

  const opnReceived = useMemo<bigint>(() => {
    if (lpAmount === 0n || lpTotalSupply === 0n) return 0n;
    return (lpAmount * reserveOPN) / lpTotalSupply;
  }, [lpAmount, reserveOPN, lpTotalSupply]);

  const musdcReceived = useMemo<bigint>(() => {
    if (lpAmount === 0n || lpTotalSupply === 0n) return 0n;
    return (lpAmount * reserveMUSDC) / lpTotalSupply;
  }, [lpAmount, reserveMUSDC, lpTotalSupply]);

  const repayAmount = useMemo<bigint>(() => {
    if (currentDebt === 0n) return 0n;
    return opnReceived < currentDebt ? opnReceived : currentDebt;
  }, [opnReceived, currentDebt]);

  const newDebt = currentDebt - repayAmount;
  const netOpnToWallet = opnReceived - repayAmount;

  /* HF-preserving collateral withdrawal.
   *
   * Current HF = collateral * LT / debt (LT = 80%).
   * To keep the same HF after close, the new collateral must satisfy:
   *   newCollateral = (HF * newDebt) / LT
   * Withdraw = currentCollateral - newCollateral.
   *
   * If newDebt = 0: withdraw all collateral (HF goes to infinity).
   * If lpPercent < 100 and newDebt > 0: HF-preserving partial withdrawal.
   */
  const currentHF = useMemo<bigint>(() => {
    if (currentDebt === 0n) return maxUint256;
    return (currentCollateral * BigInt(LIQUIDATION_THRESHOLD_BPS) * 10n ** 18n) /
      (currentDebt * 10000n);
  }, [currentCollateral, currentDebt]);

  const collateralWithdraw = useMemo<bigint>(() => {
    if (currentCollateral === 0n) return 0n;
    if (newDebt === 0n) return currentCollateral;
    // newCollateral = (HF * newDebt * 10000) / (LT * 1e18)
    const newCollateral =
      (currentHF * newDebt * 10000n) / (BigInt(LIQUIDATION_THRESHOLD_BPS) * 10n ** 18n);
    if (newCollateral >= currentCollateral) return 0n;
    return currentCollateral - newCollateral;
  }, [currentCollateral, newDebt, currentHF]);

  const newCollateral = currentCollateral - collateralWithdraw;

  const hfAfter = useMemo<bigint>(() => {
    if (newDebt === 0n) return maxUint256;
    return (newCollateral * BigInt(LIQUIDATION_THRESHOLD_BPS) * 10n ** 18n) /
      (newDebt * 10000n);
  }, [newCollateral, newDebt]);

  const hfFmt = formatHF(hfAfter);
  const hfClass =
    hfFmt.tone === 'red'
      ? 'text-red-700'
      : hfFmt.tone === 'yellow'
      ? 'text-zinc-900'
      : hfFmt.tone === 'green'
      ? 'text-emerald-700'
      : 'text-zinc-900';

  const currentHFFmt = formatHF(currentHF);

  /* Validation */
  const opnBalance = bal?.value ?? 0n;
  const validation = useMemo(() => {
    if (!pool || !pair || !user || !publicClient) {
      return { ok: false as const, reason: 'No deployment found for this network.' };
    }
    if (lpBalance === 0n) {
      return { ok: false as const, reason: 'No LP balance to close. Open a position first.' };
    }
    if (lpPercent === 0 || lpAmount === 0n) {
      return { ok: false as const, reason: 'Move the slider above 0%.' };
    }
    if (opnBalance < GAS_RESERVE_WEI) {
      return { ok: false as const, reason: 'Need a small OPN reserve in your wallet for gas.' };
    }
    if (hfAfter < 10n ** 18n) {
      return {
        ok: false as const,
        reason: 'Result would leave HF below 1.0. Increase the LP burn % or top up debt manually.',
      };
    }
    let warning: string | null = null;
    if (opnReceived < currentDebt && lpPercent === 100) {
      warning = `LP burn yields only ${formatOPN(opnReceived)} OPN, less than the ${formatOPN(currentDebt)} OPN of debt. Residual ${formatOPN(currentDebt - opnReceived)} OPN of debt will remain.`;
    }
    return { ok: true as const, warning };
  }, [
    pool,
    pair,
    user,
    publicClient,
    lpBalance,
    lpPercent,
    lpAmount,
    opnBalance,
    hfAfter,
    opnReceived,
    currentDebt,
  ]);

  const busy = phase !== 'idle' && phase !== 'success' && phase !== 'error';

  const needsRepay = repayAmount > 0n;
  const needsWithdraw = collateralWithdraw > 0n;

  const reset = () => {
    setPhase('idle');
    setError(null);
    setHashes({});
    setFailedStep(null);
  };

  const onExecute = async () => {
    if (!validation.ok || !pool || !pair || !publicClient) return;
    setError(null);
    setHashes({});
    setFailedStep(null);
    const recordHash = (k: StepKey, h: `0x${string}`) =>
      setHashes((prev) => ({ ...prev, [k]: h }));

    try {
      // Step 1: removeLiquidity
      setPhase('remove-sign');
      const h1 = await writeContractAsync({
        address: pair,
        abi: openSwapPairAbi,
        functionName: 'removeLiquidity',
        args: [lpAmount],
      });
      recordHash('remove', h1);
      setPhase('remove-pending');
      await publicClient.waitForTransactionReceipt({ hash: h1 });

      // Step 2: repay (skip if no debt to repay)
      if (needsRepay) {
        setPhase('repay-sign');
        const h2 = await writeContractAsync({
          address: pool,
          abi: lendingPoolAbi,
          functionName: 'repay',
          value: repayAmount,
        });
        recordHash('repay', h2);
        setPhase('repay-pending');
        await publicClient.waitForTransactionReceipt({ hash: h2 });
      }

      // Step 3: withdrawCollateral (skip if nothing to withdraw)
      if (needsWithdraw) {
        setPhase('withdraw-sign');
        const h3 = await writeContractAsync({
          address: pool,
          abi: lendingPoolAbi,
          functionName: 'withdrawCollateral',
          args: [collateralWithdraw],
        });
        recordHash('withdraw', h3);
        setPhase('withdraw-pending');
        await publicClient.waitForTransactionReceipt({ hash: h3 });
      }

      setPhase('success');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg.includes('User rejected') ? 'Rejected in wallet.' : msg);
      setFailedStep(phaseToStep(phase));
      setPhase('error');
    }
  };

  const stepStates: Record<StepKey, StepState> = (() => {
    const currentStep = phaseToStep(phase);
    function stateFor(k: StepKey): StepState {
      if (k === 'repay' && !needsRepay && phase !== 'idle' && phase !== 'error') return 'skipped';
      if (k === 'withdraw' && !needsWithdraw && phase !== 'idle' && phase !== 'error') {
        return 'skipped';
      }
      if (phase === 'success') return 'done';
      if (phase === 'error') {
        if (k === failedStep) return 'failed';
        const failedIdx = failedStep ? ORDER.indexOf(failedStep) : -1;
        const thisIdx = ORDER.indexOf(k);
        if (failedIdx === -1) return 'idle';
        if (thisIdx < failedIdx) return 'done';
        return 'idle';
      }
      if (k === currentStep) {
        if (phaseSign(phase)) return 'sign';
        if (phasePending(phase)) return 'pending';
      }
      if (currentStep && ORDER.indexOf(k) < ORDER.indexOf(currentStep)) return 'done';
      return 'idle';
    }
    return {
      remove: stateFor('remove'),
      repay: stateFor('repay'),
      withdraw: stateFor('withdraw'),
    };
  })();

  /* Active-tx count for CTA label */
  const txCount = 1 + (needsRepay ? 1 : 0) + (needsWithdraw ? 1 : 0);
  const isFullClose = lpPercent === 100 && newDebt === 0n;

  if (lpBalance === 0n) {
    return (
      <div className="rounded-lg border border-zinc-300 bg-zinc-50 p-4 text-sm text-zinc-700">
        No LP balance found for this wallet. Open a Leveraged LP position first.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* LP burn slider */}
      <div>
        <div className="mb-1.5 flex items-center justify-between text-xs uppercase tracking-wide">
          <span className="text-zinc-700">LP to burn</span>
          <span className="text-zinc-900 font-medium">{lpPercent}%</span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={lpPercent}
          onChange={(e) => setLpPercent(Number(e.target.value))}
          disabled={busy}
          className="w-full accent-black"
        />
        <div className="mt-1 flex justify-between text-[11px] text-zinc-700">
          <span>{formatLP(lpAmount)} OSP-LP</span>
          <span>of {formatLP(lpBalance)} held</span>
        </div>
      </div>

      {/* Preview */}
      <div className="rounded-lg border border-zinc-300 bg-white p-3 text-xs space-y-1">
        <Row label="OPN received from LP" value={`${formatOPN(opnReceived)} OPN`} />
        <Row label="mUSDC received from LP" value={`${formatMUSDC(musdcReceived)} mUSDC`} />
        <div className="my-1 border-t border-zinc-200" />
        <Row label="Debt repaid" value={`${formatOPN(repayAmount)} OPN`} />
        <Row label="Collateral withdrawn" value={`${formatOPN(collateralWithdraw)} OPN`} />
        <div className="my-1 border-t border-zinc-200" />
        <Row label="Net OPN to wallet" value={`${formatOPN(netOpnToWallet + collateralWithdraw)} OPN`} />
        <Row label="mUSDC to wallet" value={`${formatMUSDC(musdcReceived)} mUSDC`} />
        <div className="my-1 border-t border-zinc-200" />
        <Row label="Health factor before" value={currentHFFmt.text} />
        <Row label="Health factor after" value={hfFmt.text} valueClass={`font-semibold ${hfClass}`} />
      </div>

      {validation.ok && validation.warning && (
        <p className="rounded-lg border border-amber-300 bg-amber-100 p-3 text-xs text-amber-900">
          {validation.warning}
        </p>
      )}
      {!validation.ok && lpBalance > 0n && (
        <p className="rounded-lg border border-red-700 bg-red-100 p-3 text-xs text-red-900">
          {validation.reason}
        </p>
      )}

      <button
        onClick={onExecute}
        disabled={busy || !validation.ok}
        className="w-full rounded-lg bg-black py-2.5 font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-black"
      >
        {busy
          ? 'Working…'
          : isFullClose
          ? `Close position (${txCount} transactions)`
          : `Rebalance ${lpPercent}% (${txCount} transactions)`}
      </button>

      <ul className="space-y-1.5 text-xs">
        <StepRow label="1. Remove liquidity" state={stepStates.remove} hash={hashes.remove} />
        <StepRow label="2. Repay debt" state={stepStates.repay} hash={hashes.repay} />
        <StepRow
          label="3. Withdraw collateral"
          state={stepStates.withdraw}
          hash={hashes.withdraw}
        />
      </ul>

      {phase === 'error' && (
        <div className="flex items-center justify-between rounded-lg border border-red-700 bg-red-100 p-3 text-xs text-red-900">
          <span>Error: {error}</span>
          <button onClick={reset} className="text-red-700 underline">
            reset
          </button>
        </div>
      )}
      {phase === 'success' && (
        <div className="flex items-center justify-between rounded-lg border border-emerald-700 bg-emerald-100 p-3 text-xs text-emerald-900">
          <span>
            {isFullClose
              ? 'Position closed ✓ — collateral and LP returned to wallet.'
              : `Rebalanced ✓ — ${lpPercent}% of LP unwound, HF preserved.`}
          </span>
          <button onClick={reset} className="text-emerald-700 underline">
            reset
          </button>
        </div>
      )}
    </div>
  );
}
