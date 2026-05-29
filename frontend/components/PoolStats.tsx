'use client';

import { useChainId, useReadContracts } from 'wagmi';
import { lendingPoolAbi, getLendingPoolAddress } from '../lib/contract';
import { formatOPN, bpsToPct } from '../lib/format';

export function PoolStats() {
  const chainId = useChainId();
  const address = getLendingPoolAddress(chainId);

  const { data, isLoading } = useReadContracts({
    contracts: address
      ? [
          { address, abi: lendingPoolAbi, functionName: 'totalSupplied' },
          { address, abi: lendingPoolAbi, functionName: 'totalBorrowed' },
          { address, abi: lendingPoolAbi, functionName: 'availableLiquidity' },
          { address, abi: lendingPoolAbi, functionName: 'RATE_BPS' },
        ]
      : [],
    query: { refetchInterval: 5000, enabled: Boolean(address) },
  });

  const supplied = data?.[0]?.result as bigint | undefined;
  const borrowed = data?.[1]?.result as bigint | undefined;
  const available = data?.[2]?.result as bigint | undefined;
  const rateBps = data?.[3]?.result as bigint | undefined;

  const utilNum =
    supplied && supplied > 0n && borrowed !== undefined
      ? Number(borrowed) / Number(supplied)
      : 0;
  const utilFill = Math.min(utilNum, 1);
  const utilPct = (utilNum * 100).toFixed(2);

  if (!address) {
    return (
      <Card>
        <Header rateBps={undefined} />
        <p className="mt-4 text-sm text-amber-300/90">
          No deployment found for chainId {chainId}. Run{' '}
          <code className="text-amber-200">npm run deploy:testnet</code> from the repo root first.
        </p>
      </Card>
    );
  }

  return (
    <Card>
      <Header rateBps={rateBps} />

      <dl className="mt-6 grid grid-cols-3 gap-4">
        <BigStat label="Total supplied" value={supplied} loading={isLoading} />
        <BigStat label="Total borrowed" value={borrowed} loading={isLoading} />
        <BigStat label="Available" value={available} loading={isLoading} />
      </dl>

      <div className="mt-6">
        <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-wide">
          <span className="text-zinc-500">Utilization</span>
          <span className="font-semibold tabular-nums text-zinc-300">{utilPct}%</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-800">
          <div
            className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-500"
            style={{ width: `${utilFill * 100}%` }}
          />
        </div>
      </div>
    </Card>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <section className="relative overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900 p-6">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-emerald-500/60 via-transparent to-transparent" />
      {children}
    </section>
  );
}

function Header({ rateBps }: { rateBps?: bigint }) {
  return (
    <header className="flex items-start gap-3">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
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
          <ellipse cx="12" cy="6" rx="9" ry="3" />
          <path d="M3 6v6c0 1.66 4.03 3 9 3s9-1.34 9-3V6" />
          <path d="M3 12v6c0 1.66 4.03 3 9 3s9-1.34 9-3v-6" />
        </svg>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Pool</h2>
          {rateBps !== undefined && (
            <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-400">
              {bpsToPct(Number(rateBps))} APR
            </span>
          )}
        </div>
        <p className="mt-0.5 text-sm text-zinc-400">IOPN testnet single-asset pool</p>
      </div>
    </header>
  );
}

function BigStat({
  label,
  value,
  loading,
}: {
  label: string;
  value?: bigint;
  loading: boolean;
}) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-zinc-500">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold tabular-nums">
        {loading ? '…' : formatOPN(value)}
        <span className="ml-1 text-sm font-medium text-zinc-500">OPN</span>
      </dd>
    </div>
  );
}
