'use client';

import { useAccount, useBalance, useChainId, useReadContract } from 'wagmi';
import { formatUnits, maxUint256 } from 'viem';
import { lendingPoolAbi, getLendingPoolAddress } from '../lib/contract';
import { formatOPN, formatHF } from '../lib/format';

export function AccountStats() {
  const chainId = useChainId();
  const { address: user } = useAccount();
  const pool = getLendingPoolAddress(chainId);

  const { data: bal } = useBalance({
    address: user,
    query: { refetchInterval: 5000 },
  });

  const { data: acct, isLoading } = useReadContract({
    address: pool ?? undefined,
    abi: lendingPoolAbi,
    functionName: 'getAccountData',
    args: user ? [user] : undefined,
    query: { enabled: Boolean(user && pool), refetchInterval: 5000 },
  });

  const tuple = acct as [bigint, bigint, bigint, bigint] | undefined;
  const collateral = tuple?.[0];
  const debt = tuple?.[1];
  const hf = tuple?.[2];
  const shares = tuple?.[3];

  const hfFmt = formatHF(hf);
  const hfClass =
    hfFmt.tone === 'red'
      ? 'text-red-400'
      : hfFmt.tone === 'yellow'
      ? 'text-amber-300'
      : hfFmt.tone === 'green'
      ? 'text-emerald-400'
      : 'text-zinc-300';
  const hfBarClass =
    hfFmt.tone === 'red'
      ? 'bg-red-400'
      : hfFmt.tone === 'yellow'
      ? 'bg-amber-300'
      : 'bg-emerald-400';

  // Fill: HF [0..2] → [0..1], clipped. ∞ → 100%.
  let hfFill = 0;
  if (hf !== undefined) {
    if (hf === maxUint256) {
      hfFill = 1;
    } else {
      const n = Number(formatUnits(hf, 18));
      hfFill = Math.max(0, Math.min(n / 2, 1));
    }
  }

  const short = user ? `${user.slice(0, 6)}…${user.slice(-4)}` : '';

  return (
    <section className="relative overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900 p-6">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-violet-500/60 via-transparent to-transparent" />

      <header className="flex items-start gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-500/10 text-violet-400">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.25"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <circle cx="12" cy="8" r="4" />
            <path d="M4 21c0-4.418 3.582-8 8-8s8 3.582 8 8" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Your account</h2>
            {short && (
              <code className="rounded bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">
                {short}
              </code>
            )}
          </div>
          <p className="mt-0.5 text-sm text-zinc-400">Wallet + position</p>
        </div>
      </header>

      {/* Wallet balance — primary stat */}
      <div className="mt-6">
        <div className="text-xs uppercase tracking-wide text-zinc-500">
          Wallet balance
        </div>
        <div className="mt-1 text-3xl font-semibold tabular-nums">
          {formatOPN(bal?.value)}
          <span className="ml-1 text-base font-medium text-zinc-500">OPN</span>
        </div>
      </div>

      {/* Position breakdown */}
      <dl className="mt-6 grid grid-cols-3 gap-4 border-t border-zinc-800 pt-5">
        <SmallStat
          label="Supply shares"
          value={isLoading ? '…' : formatOPN(shares)}
          unit="shares"
        />
        <SmallStat
          label="Collateral"
          value={isLoading ? '…' : formatOPN(collateral)}
          unit="OPN"
        />
        <SmallStat
          label="Debt"
          value={isLoading ? '…' : formatOPN(debt)}
          unit="OPN"
        />
      </dl>

      {/* Health factor bar */}
      <div className="mt-6">
        <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-wide">
          <span className="text-zinc-500">Health factor</span>
          <span className={`font-semibold tabular-nums ${hfClass}`}>
            {isLoading ? '…' : hfFmt.text}
          </span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-800">
          <div
            className={`h-full ${hfBarClass} transition-all duration-500`}
            style={{ width: `${hfFill * 100}%` }}
          />
        </div>
        <div className="mt-1 flex justify-between text-[10px] uppercase tracking-wider text-zinc-600">
          <span>liquidatable &lt; 1.0</span>
          <span>healthy</span>
        </div>
      </div>
    </section>
  );
}

function SmallStat({
  label,
  value,
  unit,
}: {
  label: string;
  value: string;
  unit: string;
}) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-zinc-500">{label}</dt>
      <dd className="mt-0.5 text-base font-medium tabular-nums">
        {value}
        <span className="ml-1 text-xs font-normal text-zinc-500">{unit}</span>
      </dd>
    </div>
  );
}
