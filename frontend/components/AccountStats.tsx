'use client';

import { useAccount, useBalance, useChainId, useReadContract } from 'wagmi';
import { formatUnits, maxUint256 } from 'viem';
import { User } from 'lucide-react';
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
      ? 'text-red-700'
      : hfFmt.tone === 'yellow'
      ? 'text-zinc-900'
      : hfFmt.tone === 'green'
      ? 'text-emerald-700'
      : 'text-zinc-900';
  const hfBarClass =
    hfFmt.tone === 'red'
      ? 'bg-red-600'
      : hfFmt.tone === 'yellow'
      ? 'bg-zinc-900'
      : 'bg-emerald-600';

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
    <section className="relative overflow-hidden rounded-xl bg-white p-4 sm:p-6">

      <header className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-black">
          <User className="h-[18px] w-[18px]" aria-hidden />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">Your account</h2>
            {short && (
              <code className="rounded bg-zinc-100 px-2 py-0.5 text-[10px] sm:text-xs text-black">
                {short}
              </code>
            )}
          </div>
          <p className="mt-0.5 text-sm text-zinc-800">Wallet + position</p>
        </div>
      </header>

      {/* Wallet balance — primary stat */}
      <div className="mt-6">
        <div className="text-xs uppercase tracking-wide text-zinc-700">
          Wallet balance
        </div>
        <div className="mt-1 text-2xl sm:text-3xl font-semibold tabular-nums">
          {formatOPN(bal?.value)}
          <span className="ml-1 text-sm sm:text-base font-medium text-zinc-700">OPN</span>
        </div>
      </div>

      {/* Position breakdown */}
      <dl className="mt-6 grid grid-cols-1 gap-4 border-t border-zinc-200 pt-5 sm:grid-cols-3">
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
          <span className="text-zinc-700">Health factor</span>
          <span className={`font-semibold tabular-nums ${hfClass}`}>
            {isLoading ? '…' : hfFmt.text}
          </span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-100">
          <div
            className={`h-full ${hfBarClass} transition-all duration-500`}
            style={{ width: `${hfFill * 100}%` }}
          />
        </div>
        <div className="mt-1 flex justify-between text-[10px] uppercase tracking-wider text-zinc-800">
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
      <dt className="text-xs uppercase tracking-wide text-zinc-700">{label}</dt>
      <dd className="mt-0.5 text-base font-medium tabular-nums">
        {value}
        <span className="ml-1 text-xs font-normal text-zinc-700">{unit}</span>
      </dd>
    </div>
  );
}
