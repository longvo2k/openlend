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
import { formatUnits, maxUint256, parseEther, parseUnits } from 'viem';

import {
  getLendingPoolAddress,
  getMockUSDCAddress,
  getPairAddress,
  lendingPoolAbi,
  mockUSDCAbi,
  openSwapPairAbi,
} from '../../lib/contract';
import { iopnTestnet } from '../../lib/chains';
import { formatHF, formatLP, formatMUSDC, formatOPN } from '../../lib/format';

const GAS_RESERVE_WEI = 100_000_000_000_000n;
const LTV_CLAMP_BPS = 7000;
const PROTOCOL_LTV_BPS = 7500;

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
type StepState = 'idle' | 'sign' | 'pending' | 'done' | 'failed' | 'skipped';

function parseMUSDC(s: string): bigint {
  return parseUnits(s.trim(), 6);
}

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

function phaseSign(phase: Phase): boolean {
  return phase.endsWith('-sign');
}

function phasePending(phase: Phase): boolean {
  return phase.endsWith('-pending');
}

export function LeveragedLPPanel() {
  const chainId = useChainId();
  const { address: user } = useAccount();
  const pool = getLendingPoolAddress(chainId);
  const pair = getPairAddress(chainId);
  const mUSDC = getMockUSDCAddress(chainId);
  const publicClient = usePublicClient();

  /* Inputs */
  const [collateralText, setCollateralText] = useState('');
  const [ltvBps, setLtvBps] = useState<number>(6500);
  const [musdcOverride, setMusdcOverride] = useState<string | null>(null);

  /* Tx state */
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
        ? [
            { address: pool, abi: lendingPoolAbi, functionName: 'getAccountData', args: [user] },
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
          { address: pair, abi: openSwapPairAbi, functionName: 'availableLiquidity' },
        ]
      : [],
    query: { enabled: Boolean(pair), refetchInterval: 5000 },
  });
  // `availableLiquidity` is on the LendingPool, not the pair — keep a separate read for it.
  const { data: poolLiquidityRaw } = useReadContract({
    address: pool ?? undefined,
    abi: lendingPoolAbi,
    functionName: 'availableLiquidity',
    query: { enabled: Boolean(pool), refetchInterval: 5000 },
  });
  const poolLiquidity = (poolLiquidityRaw as bigint | undefined) ?? 0n;
  void pairReads;

  const { data: reservesRaw } = useReadContract({
    address: pair ?? undefined,
    abi: openSwapPairAbi,
    functionName: 'getReserves',
    query: { enabled: Boolean(pair), refetchInterval: 5000 },
  });
  const reservesTuple = reservesRaw as readonly [bigint, bigint, number] | undefined;
  const reserveOPN = reservesTuple?.[0] ?? 0n;
  const reserveMUSDC = reservesTuple?.[1] ?? 0n;

  /* Derived */
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
      ? 'text-red-400'
      : hfFmt.tone === 'yellow'
      ? 'text-amber-300'
      : hfFmt.tone === 'green'
      ? 'text-emerald-400'
      : 'text-zinc-300';

  /* MAX helpers */
  const opnMax: bigint | undefined = bal
    ? bal.value - GAS_RESERVE_WEI > 0n
      ? bal.value - GAS_RESERVE_WEI
      : 0n
    : undefined;
  const opnMaxFmt = opnMax === undefined ? '—' : `${formatOPN(opnMax)} OPN`;
  const musdcMax = balMUSDC as bigint | undefined;
  const musdcMaxFmt = musdcMax === undefined ? '—' : `${formatMUSDC(musdcMax)} mUSDC`;

  /* Validation */
  const validation = useMemo(() => {
    if (!pool || !pair || !mUSDC || !user || !publicClient) {
      return { ok: false as const, reason: 'No deployment found for this network.' };
    }
    if (collateralOPN <= 0n) {
      return { ok: false as const, reason: 'Enter collateral > 0.' };
    }
    if (opnMax !== undefined && collateralOPN > opnMax) {
      return {
        ok: false as const,
        reason: `Need ${formatOPN(collateralOPN - opnMax)} more OPN (incl. gas reserve).`,
      };
    }
    if (borrowOPN <= 0n) {
      return { ok: false as const, reason: 'Move the LTV slider above 0%.' };
    }
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
      return {
        ok: false as const,
        reason: 'AMM is empty. Bootstrap via Swap > Liquidity first.',
      };
    }
    if (mUSDCInput <= 0n) {
      return { ok: false as const, reason: 'Enter mUSDC > 0.' };
    }
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

  /* Execute */
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
      // Step 1: depositCollateral
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

      // Step 2: borrow
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

      // Step 3: approve (conditional)
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

      // Step 4: addLiquidity
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

  /* Status list */
  const stepStates: Record<StepKey, StepState> = (() => {
    const currentStep = phaseToStep(phase);
    function stateFor(k: StepKey): StepState {
      if (k === 'approve' && !needsApproval && phase !== 'idle' && phase !== 'error') {
        return 'skipped';
      }
      if (phase === 'success') return 'done';
      if (phase === 'error') {
        if (k === failedStep) return 'failed';
        // Steps before the failed step succeeded; steps after didn't run.
        const order: StepKey[] = ['deposit', 'borrow', 'approve', 'addlp'];
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
      // Step is done if a later step is in flight.
      const order: StepKey[] = ['deposit', 'borrow', 'approve', 'addlp'];
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
        {/* Collateral input */}
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
            disabled={busy}
            className="w-full accent-cyan-500"
          />
          <div className="mt-1 text-[11px] text-zinc-500">
            Borrowing {formatOPN(borrowOPN)} OPN @ 5% APR · protocol cap{' '}
            {PROTOCOL_LTV_BPS / 100}%
          </div>
        </div>

        {/* mUSDC input */}
        <div>
          <div className="mb-1.5 flex items-center justify-between text-xs uppercase tracking-wide">
            <span className="text-zinc-500">mUSDC to pair</span>
            <button
              type="button"
              disabled={busy || !musdcMax || musdcMax === 0n}
              onClick={() => musdcMax && setMusdcOverride(formatUnits(musdcMax, 6))}
              className="rounded bg-zinc-800 px-2 py-0.5 text-[10px] font-semibold tracking-wider text-cyan-400 hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-30"
            >
              MAX
            </button>
          </div>
          <div
            className={`flex items-center rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 focus-within:border-cyan-500 ${
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
                disabled={busy}
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

        {/* Warning / error */}
        {validation.ok && validation.warning && (
          <p className="rounded-lg border border-amber-700/50 bg-amber-950/30 p-3 text-xs text-amber-200">
            {validation.warning}
          </p>
        )}
        {!validation.ok && collateralText !== '' && (
          <p className="rounded-lg border border-red-700/50 bg-red-950/30 p-3 text-xs text-red-200">
            {validation.reason}
          </p>
        )}

        {/* CTA */}
        <button
          onClick={onExecute}
          disabled={busy || !validation.ok}
          className="w-full rounded-lg bg-cyan-500 py-2.5 font-semibold text-black transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-cyan-500"
        >
          {busy
            ? 'Working…'
            : `Execute (${needsApproval ? 4 : 3} transactions)`}
        </button>

        {/* Status list */}
        <ul className="space-y-1.5 text-xs">
          <StepRow
            label="1. Deposit collateral"
            state={stepStates.deposit}
            hash={hashes.deposit}
          />
          <StepRow
            label="2. Borrow OPN"
            state={stepStates.borrow}
            hash={hashes.borrow}
          />
          <StepRow
            label="3. Approve mUSDC"
            state={stepStates.approve}
            hash={hashes.approve}
          />
          <StepRow
            label="4. Add liquidity"
            state={stepStates.addlp}
            hash={hashes.addlp}
          />
        </ul>

        {phase === 'error' && (
          <div className="flex items-center justify-between rounded-lg border border-red-700/50 bg-red-950/30 p-3 text-xs text-red-200">
            <span>Error: {error}</span>
            <button onClick={reset} className="text-red-300 underline">
              reset
            </button>
          </div>
        )}
        {phase === 'success' && (
          <div className="flex items-center justify-between rounded-lg border border-emerald-700/50 bg-emerald-950/30 p-3 text-xs text-emerald-200">
            <span>Position opened ✓ — check Dashboard for the updated HF.</span>
            <button onClick={reset} className="text-emerald-300 underline">
              reset
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

function Field({
  label,
  unit,
  value,
  onChange,
  disabled,
  maxValue,
  maxFormatted,
  onMax,
}: {
  label: string;
  unit: string;
  value: string;
  onChange: (s: string) => void;
  disabled: boolean;
  maxValue?: bigint;
  maxFormatted?: string;
  onMax?: () => void;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-xs uppercase tracking-wide">
        <span className="text-zinc-500">{label}</span>
        {onMax && (
          <button
            type="button"
            disabled={disabled || !maxValue || maxValue === 0n}
            onClick={onMax}
            className="rounded bg-zinc-800 px-2 py-0.5 text-[10px] font-semibold tracking-wider text-cyan-400 hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-30"
          >
            MAX
          </button>
        )}
      </div>
      <div
        className={`flex items-center rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 focus-within:border-cyan-500 ${
          disabled ? 'opacity-60' : ''
        }`}
      >
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="0.0"
          inputMode="decimal"
          disabled={disabled}
          className="min-w-0 flex-1 bg-transparent text-lg font-medium outline-none"
        />
        <span className="ml-2 text-sm font-medium text-zinc-500">{unit}</span>
      </div>
      {maxFormatted && (
        <div className="mt-1 text-[11px] text-zinc-500">Wallet: {maxFormatted}</div>
      )}
    </div>
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

function StepRow({
  label,
  state,
  hash,
}: {
  label: string;
  state: StepState;
  hash?: `0x${string}`;
}) {
  const explorer = hash
    ? `${iopnTestnet.blockExplorers.default.url}/tx/${hash}`
    : null;
  const glyph =
    state === 'done'
      ? '✓'
      : state === 'failed'
      ? '✗'
      : state === 'sign'
      ? '◔'
      : state === 'pending'
      ? '◐'
      : state === 'skipped'
      ? '—'
      : '○';
  const text =
    state === 'done'
      ? 'text-emerald-300'
      : state === 'failed'
      ? 'text-red-300'
      : state === 'sign'
      ? 'text-amber-300'
      : state === 'pending'
      ? 'text-cyan-300'
      : state === 'skipped'
      ? 'text-zinc-600'
      : 'text-zinc-500';
  const detail =
    state === 'sign'
      ? '(confirm in wallet…)'
      : state === 'pending'
      ? '(pending…)'
      : state === 'failed'
      ? '(failed)'
      : state === 'skipped'
      ? '(allowance ok, skipped)'
      : null;
  return (
    <li className="flex items-center gap-2">
      <span className={`${text} w-3 text-center`}>{glyph}</span>
      <span className={text}>{label}</span>
      {detail && <span className="text-zinc-600">{detail}</span>}
      {explorer && (
        <a
          className="text-zinc-400 underline hover:text-zinc-200"
          target="_blank"
          rel="noopener noreferrer"
          href={explorer}
        >
          tx ↗
        </a>
      )}
    </li>
  );
}
