'use client';

import { useMemo, useState, type ReactNode } from 'react';
import {
  useAccount,
  useBalance,
  useChainId,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
  usePublicClient,
} from 'wagmi';
import { formatUnits } from 'viem';
import type { LucideIcon } from 'lucide-react';
import { ArrowDownToLine, ArrowUpFromLine, ArrowUpRight, Check } from 'lucide-react';
import { lendingPoolAbi, getLendingPoolAddress } from '@/lib/contract';
import { iopnTestnet } from '@/lib/chains';
import { formatOPN, parseOPN } from '@/lib/format';
import { TermHint } from '@/components/ui/TermHint';

type Kind = 'supply' | 'withdraw' | 'borrow' | 'repay';

interface Props {
  kind: Kind;
}

const ACCENT: Record<
  Kind,
  { text: string; bar: string; iconBg: string; icon: string }
> = {
  supply: {
    text: 'text-emerald-700',
    bar: 'from-amber-500/60',
    iconBg: 'bg-zinc-100',
    icon: 'text-black',
  },
  withdraw: {
    text: 'text-sky-700',
    bar: 'from-amber-500/60',
    iconBg: 'bg-zinc-100',
    icon: 'text-black',
  },
  borrow: {
    text: 'text-zinc-900',
    bar: 'from-amber-500/60',
    iconBg: 'bg-zinc-100',
    icon: 'text-black',
  },
  repay: {
    text: 'text-violet-700',
    bar: 'from-amber-500/60',
    iconBg: 'bg-zinc-100',
    icon: 'text-black',
  },
};

const META: Record<
  Kind,
  {
    title: string;
    description: ReactNode;
    primaryLabel: string;
    primaryUnit: 'OPN' | 'shares';
    primaryMaxLabel: string;
    secondaryLabel?: string;
    secondaryUnit?: 'OPN';
    ctaLabel: string;
    icon: LucideIcon;
  }
> = {
  supply: {
    title: 'Supply',
    description: (
      <>
        Deposit OPN. Earn 5% <TermHint term="APR">APR</TermHint> (linear).
      </>
    ),
    primaryLabel: 'Amount to supply',
    primaryUnit: 'OPN',
    primaryMaxLabel: 'Wallet',
    ctaLabel: 'Supply',
    icon: ArrowDownToLine,
  },
  withdraw: {
    title: 'Withdraw',
    description: 'Burn shares. Redeem OPN + accrued interest.',
    primaryLabel: 'Shares to burn',
    primaryUnit: 'shares',
    primaryMaxLabel: 'Available',
    ctaLabel: 'Withdraw',
    icon: ArrowUpFromLine,
  },
  borrow: {
    title: 'Borrow',
    description: (
      <>
        Post OPN <TermHint term="Collateral">collateral</TermHint>, borrow OPN (≤75%{' '}
        <TermHint term="LTV">LTV</TermHint>).
      </>
    ),
    primaryLabel: 'Collateral to add',
    primaryUnit: 'OPN',
    primaryMaxLabel: 'Wallet',
    secondaryLabel: 'Amount to borrow',
    secondaryUnit: 'OPN',
    ctaLabel: 'Borrow',
    icon: ArrowUpRight,
  },
  repay: {
    title: 'Repay',
    description: 'Pay down debt. Excess refunded.',
    primaryLabel: 'Amount to repay',
    primaryUnit: 'OPN',
    primaryMaxLabel: 'Outstanding',
    ctaLabel: 'Repay',
    icon: Check,
  },
};

// Leave a reserve so MAX doesn't leave the wallet with zero for gas.
// IOPN gasPrice ≈ 7 gwei × ~150k gas per tx = ~0.001 OPN per tx; keep 10×
// cushion to cover spikes and follow-up reset/repeat actions.
const GAS_RESERVE_WEI = 10_000_000_000_000_000n; // 0.01 OPN

export function ActionPanel({ kind }: Props) {
  const meta = META[kind];
  const accent = ACCENT[kind];
  const chainId = useChainId();
  const pool = getLendingPoolAddress(chainId);
  const publicClient = usePublicClient();
  const { address: user } = useAccount();

  const [primary, setPrimary] = useState('');
  const [secondary, setSecondary] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<'idle' | 'signing' | 'pending' | 'success'>(
    'idle',
  );

  const { writeContractAsync, data: txHash, reset } = useWriteContract();
  const { isLoading: receiptLoading, isSuccess: receiptSuccess } =
    useWaitForTransactionReceipt({ hash: txHash });

  // Per-kind reads for the Available / MAX hint.
  const { data: bal } = useBalance({
    address: user,
    query: {
      enabled: Boolean((kind === 'supply' || kind === 'borrow') && user),
      refetchInterval: 5000,
    },
  });
  const { data: sharesRaw } = useReadContract({
    address: pool ?? undefined,
    abi: lendingPoolAbi,
    functionName: 'supplyShares',
    args: user ? [user] : undefined,
    query: {
      enabled: Boolean(kind === 'withdraw' && user && pool),
      refetchInterval: 5000,
    },
  });
  const { data: debtRaw } = useReadContract({
    address: pool ?? undefined,
    abi: lendingPoolAbi,
    functionName: 'debtOf',
    args: user ? [user] : undefined,
    query: {
      enabled: Boolean(kind === 'repay' && user && pool),
      refetchInterval: 5000,
    },
  });

  const primaryMax: bigint | undefined = useMemo(() => {
    if (kind === 'supply' || kind === 'borrow') {
      if (!bal) return undefined;
      const m = bal.value - GAS_RESERVE_WEI;
      return m > 0n ? m : 0n;
    }
    if (kind === 'withdraw') return sharesRaw as bigint | undefined;
    if (kind === 'repay') {
      // Cap at wallet balance minus gas reserve so MAX never asks for more
      // OPN than the wallet can actually send. Contract caps at current debt
      // internally, so undershoot is fine and overshoot is the real risk.
      const debt = debtRaw as bigint | undefined;
      if (debt === undefined) return undefined;
      if (!bal) return debt;
      const spendable = bal.value > GAS_RESERVE_WEI ? bal.value - GAS_RESERVE_WEI : 0n;
      return debt < spendable ? debt : spendable;
    }
    return undefined;
  }, [kind, bal, sharesRaw, debtRaw]);

  const reload = () => {
    setError(null);
    setPhase('idle');
    setPrimary('');
    setSecondary('');
    reset();
  };

  const onSubmit = async () => {
    if (!pool) {
      setError('No deployment for this network.');
      return;
    }
    if (!publicClient) {
      setError('No RPC client available.');
      return;
    }
    setError(null);
    try {
      setPhase('signing');
      if (kind === 'supply') {
        const value = parseOPN(primary);
        if (value <= 0n) throw new Error('Amount must be > 0');
        const hash = await writeContractAsync({
          address: pool,
          abi: lendingPoolAbi,
          functionName: 'supply',
          value,
        });
        setPhase('pending');
        await publicClient.waitForTransactionReceipt({ hash });
      } else if (kind === 'withdraw') {
        const shares = parseOPN(primary);
        if (shares <= 0n) throw new Error('Shares must be > 0');
        const hash = await writeContractAsync({
          address: pool,
          abi: lendingPoolAbi,
          functionName: 'withdraw',
          args: [shares],
        });
        setPhase('pending');
        await publicClient.waitForTransactionReceipt({ hash });
      } else if (kind === 'borrow') {
        const collateral = parseOPN(primary);
        const amount = parseOPN(secondary);
        if (collateral <= 0n || amount <= 0n) {
          throw new Error('Both amounts must be > 0');
        }
        const h1 = await writeContractAsync({
          address: pool,
          abi: lendingPoolAbi,
          functionName: 'depositCollateral',
          value: collateral,
        });
        setPhase('pending');
        await publicClient.waitForTransactionReceipt({ hash: h1 });
        setPhase('signing');
        const h2 = await writeContractAsync({
          address: pool,
          abi: lendingPoolAbi,
          functionName: 'borrow',
          args: [amount],
        });
        setPhase('pending');
        await publicClient.waitForTransactionReceipt({ hash: h2 });
      } else if (kind === 'repay') {
        const value = parseOPN(primary);
        if (value <= 0n) throw new Error('Amount must be > 0');
        const hash = await writeContractAsync({
          address: pool,
          abi: lendingPoolAbi,
          functionName: 'repay',
          value,
        });
        setPhase('pending');
        await publicClient.waitForTransactionReceipt({ hash });
      }
      setPhase('success');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg.includes('User rejected') ? 'Rejected in wallet.' : msg);
      setPhase('idle');
    }
  };

  const status =
    error
      ? `Error: ${error}`
      : phase === 'signing'
      ? 'Confirm in wallet…'
      : phase === 'pending'
      ? 'Pending…'
      : phase === 'success'
      ? 'Confirmed ✓'
      : '';

  const explorer = txHash
    ? `${iopnTestnet.blockExplorers.default.url}/tx/${txHash}`
    : null;

  const busy = phase === 'signing' || phase === 'pending';

  return (
    <section className="relative overflow-hidden rounded-xl bg-white p-4 sm:p-6">
      <header className="flex items-start gap-3 mb-1">
        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${accent.iconBg} ${accent.icon}`}
        >
          {(() => { const Icon = meta.icon; return <Icon className="h-5 w-5" aria-hidden />; })()}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-semibold leading-tight">{meta.title}</h3>
          <p className="mt-0.5 text-sm text-zinc-800">{meta.description}</p>
        </div>
      </header>

      <div className="mt-5 space-y-4">
        <Field
          label={meta.primaryLabel}
          unit={meta.primaryUnit}
          value={primary}
          onChange={setPrimary}
          disabled={busy}
          maxLabel={meta.primaryMaxLabel}
          maxValue={primaryMax}
          maxAccent="text-black"
          onMax={() => primaryMax && setPrimary(formatUnits(primaryMax, 18))}
        />

        {meta.secondaryLabel && meta.secondaryUnit && (
          <Field
            label={meta.secondaryLabel}
            unit={meta.secondaryUnit}
            value={secondary}
            onChange={setSecondary}
            disabled={busy}
          />
        )}

        <button
          onClick={onSubmit}
          disabled={busy || !pool}
          className="w-full rounded-lg bg-black py-2.5 font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-black"
        >
          {busy ? 'Working…' : meta.ctaLabel}
        </button>

        {status && (
          <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-900">
            <span>{status}</span>
            {explorer && (
              <a
                className={`underline ${accent.text} hover:opacity-80`}
                target="_blank"
                rel="noopener noreferrer"
                href={explorer}
              >
                view tx ↗
              </a>
            )}
            {phase === 'success' && (
              <button className="text-zinc-700 underline" onClick={reload}>
                reset
              </button>
            )}
          </div>
        )}
      </div>

      {/* Touched only to satisfy the linter — these hooks drive the wagmi cache invalidation. */}
      <span className="hidden">
        {receiptLoading ? '1' : '0'}
        {receiptSuccess ? '1' : '0'}
      </span>
    </section>
  );
}

interface FieldProps {
  label: string;
  unit: 'OPN' | 'shares';
  value: string;
  onChange: (s: string) => void;
  disabled: boolean;
  maxLabel?: string;
  maxValue?: bigint;
  maxAccent?: string;
  onMax?: () => void;
}

function Field({
  label,
  unit,
  value,
  onChange,
  disabled,
  maxLabel,
  maxValue,
  maxAccent,
  onMax,
}: FieldProps) {
  const hasMax = onMax !== undefined;
  const maxDisabled = disabled || !maxValue || maxValue === 0n;
  return (
    <div>
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2 text-xs uppercase tracking-wide">
        <span className="text-zinc-700">{label}</span>
        {hasMax && (
          <button
            type="button"
            disabled={maxDisabled}
            onClick={onMax}
            className={`rounded bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold tracking-wider transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-30 ${maxAccent ?? ''}`}
          >
            MAX
          </button>
        )}
      </div>
      <div
        className={`flex items-center rounded-lg border border-zinc-300 bg-white px-3 py-2.5 transition focus-within:border-amber-500 ${
          disabled ? 'opacity-50' : ''
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
        <span className="ml-2 text-sm font-medium text-zinc-700">{unit}</span>
      </div>
      {hasMax && (
        <div className="mt-1 text-[11px] text-zinc-700">
          {maxLabel}:{' '}
          {maxValue === undefined
            ? '—'
            : `${formatOPN(maxValue)} ${unit}`}
        </div>
      )}
    </div>
  );
}
