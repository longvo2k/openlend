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
import { formatUnits, maxUint256, parseEther } from 'viem';

import {
  getLendingPoolAddress,
  getMockUSDCAddress,
  getPairAddress,
  lendingPoolAbi,
  mockUSDCAbi,
  openSwapPairAbi,
} from '@/lib/contract';
import { formatHF, formatLP, formatMUSDC, formatOPN } from '@/lib/format';
import {
  Field,
  GAS_RESERVE_WEI,
  LTV_CLAMP_BPS,
  PROTOCOL_LTV_BPS,
  Row,
  StepRow,
  StepState,
  parseMUSDC,
} from './LeveragedLPShared';

type Phase =
  | 'idle'
  | 'deposit-sign'
  | 'deposit-pending'
  | 'borrow-sign'
  | 'borrow-pending'
  | 'approve-sign'
  | 'approve-pending'
  | 'addlp-sign'
  | 'addlp-pending'
  | 'success'
  | 'error';

type StepKey = 'deposit' | 'borrow' | 'approve' | 'addlp';

function phaseToStep(phase: Phase): StepKey | null {
  switch (phase) {
    case 'deposit-sign':
    case 'deposit-pending':
      return 'deposit';
    case 'borrow-sign':
    case 'borrow-pending':
      return 'borrow';
    case 'approve-sign':
    case 'approve-pending':
      return 'approve';
    case 'addlp-sign':
    case 'addlp-pending':
      return 'addlp';
    default:
      return null;
  }
}

const phaseSign = (p: Phase) => p.endsWith('-sign');
const phasePending = (p: Phase) => p.endsWith('-pending');

export function OpenLeveragedLPForm() {
  const chainId = useChainId();
  const { address: user } = useAccount();
  const pool = getLendingPoolAddress(chainId);
  const pair = getPairAddress(chainId);
  const mUSDC = getMockUSDCAddress(chainId);
  const publicClient = usePublicClient();

  const [collateralText, setCollateralText] = useState('');
  const [ltvBps, setLtvBps] = useState<number>(6500);
  const [musdcOverride, setMusdcOverride] = useState<string | null>(null);

  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [hashes, setHashes] = useState<Partial<Record<StepKey, `0x${string}`>>>({});
  const [failedStep, setFailedStep] = useState<StepKey | null>(null);

  const { writeContractAsync } = useWriteContract();

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
    contracts:
      pool && user
        ? [{ address: pool, abi: lendingPoolAbi, functionName: 'getAccountData', args: [user] }]
        : [],
    query: { enabled: Boolean(pool && user), refetchInterval: 5000 },
  });
  const account = poolReads?.[0]?.result as readonly [bigint, bigint, bigint, bigint] | undefined;
  const existingCollateral = account?.[0] ?? 0n;
  const existingDebt = account?.[1] ?? 0n;
  const { data: poolLiquidityRaw } = useReadContract({
    address: pool ?? undefined,
    abi: lendingPoolAbi,
    functionName: 'availableLiquidity',
    query: { enabled: Boolean(pool), refetchInterval: 5000 },
  });
  const poolLiquidity = (poolLiquidityRaw as bigint | undefined) ?? 0n;

  const { data: reservesRaw } = useReadContract({
    address: pair ?? undefined,
    abi: openSwapPairAbi,
    functionName: 'getReserves',
    query: { enabled: Boolean(pair), refetchInterval: 5000 },
  });
  const reservesTuple = reservesRaw as readonly [bigint, bigint, number] | undefined;
  const reserveOPN = reservesTuple?.[0] ?? 0n;
  const reserveMUSDC = reservesTuple?.[1] ?? 0n;

  const collateralOPN = useMemo<bigint>(() => {
    try {
      return collateralText ? parseEther(collateralText) : 0n;
    } catch {
      return 0n;
    }
  }, [collateralText]);
  const borrowOPN = useMemo<bigint>(
    () => (collateralOPN * BigInt(ltvBps)) / 10000n,
    [collateralOPN, ltvBps],
  );
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
  const needsApproval = allowance < mUSDCInput;

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
    if (newDebt === 0n) return maxUint256;
    return (newCollateral * 8000n * 10n ** 18n) / (newDebt * 10000n);
  }, [existingCollateral, existingDebt, collateralOPN, borrowOPN]);
  const hfFmt = formatHF(hfAfter);
  const hfClass =
    hfFmt.tone === 'red'
      ? 'text-red-700'
      : hfFmt.tone === 'yellow'
      ? 'text-zinc-900'
      : hfFmt.tone === 'green'
      ? 'text-emerald-700'
      : 'text-zinc-900';

  const opnMax: bigint | undefined = bal
    ? bal.value - GAS_RESERVE_WEI > 0n
      ? bal.value - GAS_RESERVE_WEI
      : 0n
    : undefined;
  const opnMaxFmt = opnMax === undefined ? '—' : `${formatOPN(opnMax)} OPN`;
  const musdcMax = balMUSDC as bigint | undefined;
  const musdcMaxFmt = musdcMax === undefined ? '—' : `${formatMUSDC(musdcMax)} mUSDC`;

  const validation = useMemo(() => {
    if (!pool || !pair || !mUSDC || !user || !publicClient) {
      return { ok: false as const, reason: 'No deployment found for this network.' };
    }
    if (collateralOPN <= 0n) return { ok: false as const, reason: 'Enter collateral > 0.' };
    if (opnMax !== undefined && collateralOPN > opnMax) {
      return {
        ok: false as const,
        reason: `Need ${formatOPN(collateralOPN - opnMax)} more OPN (incl. gas reserve).`,
      };
    }
    if (borrowOPN <= 0n) return { ok: false as const, reason: 'Move the LTV slider above 0%.' };
    if ((collateralOPN * BigInt(PROTOCOL_LTV_BPS)) / 10000n < borrowOPN) {
      return {
        ok: false as const,
        reason: `Borrow would exceed the protocol ${PROTOCOL_LTV_BPS / 100}% LTV cap.`,
      };
    }
    if (borrowOPN > poolLiquidity) {
      return {
        ok: false as const,
        reason: `Pool only has ${formatOPN(poolLiquidity)} OPN free to borrow.`,
      };
    }
    if (reserveOPN === 0n || reserveMUSDC === 0n) {
      return { ok: false as const, reason: 'AMM is empty. Bootstrap via Swap > Liquidity first.' };
    }
    if (mUSDCInput <= 0n) return { ok: false as const, reason: 'Enter mUSDC > 0.' };
    if (musdcMax === undefined || mUSDCInput > musdcMax) {
      return {
        ok: false as const,
        reason: 'Not enough mUSDC. Mint some via the Faucet tab first.',
      };
    }
    if (hfAfter < 10n ** 18n) {
      return { ok: false as const, reason: 'Health factor after would be below 1.0.' };
    }
    let warning: string | null = null;
    if (hfAfter < (12n * 10n ** 18n) / 10n) {
      warning = `Health factor will be low (${hfFmt.text}). Consider lowering the LTV.`;
    }
    return { ok: true as const, warning };
  }, [
    pool,
    pair,
    mUSDC,
    user,
    publicClient,
    collateralOPN,
    opnMax,
    borrowOPN,
    poolLiquidity,
    reserveOPN,
    reserveMUSDC,
    mUSDCInput,
    musdcMax,
    hfAfter,
    hfFmt.text,
  ]);

  const busy = phase !== 'idle' && phase !== 'success' && phase !== 'error';

  const reset = () => {
    setPhase('idle');
    setError(null);
    setHashes({});
    setFailedStep(null);
  };

  const onExecute = async () => {
    if (!validation.ok || !pool || !pair || !mUSDC || !publicClient) return;
    setError(null);
    setHashes({});
    setFailedStep(null);
    const recordHash = (k: StepKey, h: `0x${string}`) =>
      setHashes((prev) => ({ ...prev, [k]: h }));

    try {
      setPhase('deposit-sign');
      const h1 = await writeContractAsync({
        address: pool,
        abi: lendingPoolAbi,
        functionName: 'depositCollateral',
        value: collateralOPN,
      });
      recordHash('deposit', h1);
      setPhase('deposit-pending');
      await publicClient.waitForTransactionReceipt({ hash: h1 });

      setPhase('borrow-sign');
      const h2 = await writeContractAsync({
        address: pool,
        abi: lendingPoolAbi,
        functionName: 'borrow',
        args: [borrowOPN],
      });
      recordHash('borrow', h2);
      setPhase('borrow-pending');
      await publicClient.waitForTransactionReceipt({ hash: h2 });

      if (allowance < mUSDCInput) {
        setPhase('approve-sign');
        const h3 = await writeContractAsync({
          address: mUSDC,
          abi: mockUSDCAbi,
          functionName: 'approve',
          args: [pair, maxUint256],
        });
        recordHash('approve', h3);
        setPhase('approve-pending');
        await publicClient.waitForTransactionReceipt({ hash: h3 });
      }

      setPhase('addlp-sign');
      const h4 = await writeContractAsync({
        address: pair,
        abi: openSwapPairAbi,
        functionName: 'addLiquidity',
        args: [mUSDCInput],
        value: borrowOPN,
      });
      recordHash('addlp', h4);
      setPhase('addlp-pending');
      await publicClient.waitForTransactionReceipt({ hash: h4 });

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
    const order: StepKey[] = ['deposit', 'borrow', 'approve', 'addlp'];
    function stateFor(k: StepKey): StepState {
      if (k === 'approve' && !needsApproval && phase !== 'idle' && phase !== 'error') {
        return 'skipped';
      }
      if (phase === 'success') return 'done';
      if (phase === 'error') {
        if (k === failedStep) return 'failed';
        const failedIdx = failedStep ? order.indexOf(failedStep) : -1;
        const thisIdx = order.indexOf(k);
        if (failedIdx === -1) return 'idle';
        if (thisIdx < failedIdx) return 'done';
        return 'idle';
      }
      if (k === currentStep) {
        if (phaseSign(phase)) return 'sign';
        if (phasePending(phase)) return 'pending';
      }
      if (currentStep && order.indexOf(k) < order.indexOf(currentStep)) {
        return 'done';
      }
      return 'idle';
    }
    return {
      deposit: stateFor('deposit'),
      borrow: stateFor('borrow'),
      approve: stateFor('approve'),
      addlp: stateFor('addlp'),
    };
  })();

  return (
    <div className="space-y-4">
      <Field
        label="Collateral"
        unit="OPN"
        value={collateralText}
        onChange={setCollateralText}
        disabled={busy}
        maxValue={opnMax}
        maxFormatted={opnMaxFmt}
        onMax={() => opnMax && setCollateralText(formatUnits(opnMax, 18))}
      />

      <div>
        <div className="mb-1.5 flex items-center justify-between text-xs uppercase tracking-wide">
          <span className="text-zinc-700">Borrow LTV</span>
          <span className="text-zinc-900 font-medium">{(ltvBps / 100).toFixed(0)}%</span>
        </div>
        <input
          type="range"
          min={0}
          max={LTV_CLAMP_BPS}
          step={500}
          value={ltvBps}
          onChange={(e) => setLtvBps(Number(e.target.value))}
          disabled={busy}
          className="w-full accent-black"
        />
        <div className="mt-1 text-[11px] text-zinc-700">
          Borrowing {formatOPN(borrowOPN)} OPN @ 5% APR · protocol cap{' '}
          {PROTOCOL_LTV_BPS / 100}%
        </div>
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between text-xs uppercase tracking-wide">
          <span className="text-zinc-700">mUSDC to pair</span>
          <button
            type="button"
            disabled={busy || !musdcMax || musdcMax === 0n}
            onClick={() => musdcMax && setMusdcOverride(formatUnits(musdcMax, 6))}
            className="rounded bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold tracking-wider text-black hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-30"
          >
            MAX
          </button>
        </div>
        <div
          className={`flex items-center rounded-lg border border-zinc-300 bg-white px-3 py-2.5 focus-within:border-amber-500 ${
            busy ? 'opacity-60' : ''
          }`}
        >
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
            disabled={busy}
            className="min-w-0 flex-1 bg-transparent text-lg font-medium outline-none"
          />
          <span className="ml-2 text-sm font-medium text-zinc-700">mUSDC</span>
        </div>
        <div className="mt-1 flex items-center justify-between text-[11px] text-zinc-700">
          <span>
            Wallet: {musdcMaxFmt}
            {musdcOverride === null && ' · auto at pool ratio'}
          </span>
          {musdcOverride !== null && (
            <button
              type="button"
              onClick={() => setMusdcOverride(null)}
              className="text-zinc-900 hover:opacity-80 underline"
              disabled={busy}
            >
              reset to auto
            </button>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-zinc-300 bg-white p-3 text-xs space-y-1">
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

      {validation.ok && validation.warning && (
        <p className="rounded-lg border border-amber-300 bg-amber-100 p-3 text-xs text-amber-900">
          {validation.warning}
        </p>
      )}
      {!validation.ok && collateralText !== '' && (
        <p className="rounded-lg border border-red-700 bg-red-100 p-3 text-xs text-red-900">
          {validation.reason}
        </p>
      )}

      <button
        onClick={onExecute}
        disabled={busy || !validation.ok}
        className="w-full rounded-lg bg-black py-2.5 font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-black"
      >
        {busy ? 'Working…' : `Execute (${needsApproval ? 4 : 3} transactions)`}
      </button>

      <ul className="space-y-1.5 text-xs">
        <StepRow label="1. Deposit collateral" state={stepStates.deposit} hash={hashes.deposit} />
        <StepRow label="2. Borrow OPN" state={stepStates.borrow} hash={hashes.borrow} />
        <StepRow label="3. Approve mUSDC" state={stepStates.approve} hash={hashes.approve} />
        <StepRow label="4. Add liquidity" state={stepStates.addlp} hash={hashes.addlp} />
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
          <span>Position opened ✓ — check Dashboard for the updated HF.</span>
          <button onClick={reset} className="text-emerald-700 underline">
            reset
          </button>
        </div>
      )}
    </div>
  );
}
