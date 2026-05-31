'use client';

import { useChainId, useReadContracts } from 'wagmi';
import { Database } from 'lucide-react';
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
        <p className="mt-4 text-sm text-zinc-900">
          No deployment found for chainId {chainId}. Run{' '}
          <code className="bg-zinc-100 px-1 rounded text-black">npm run deploy:testnet</code> from the repo root first.
        </p>
      </Card>
    );
  }

  return (
    <Card>
      <Header rateBps={rateBps} />

      <dl className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <BigStat label="Total supplied" value={supplied} loading={isLoading} />
        <BigStat label="Total borrowed" value={borrowed} loading={isLoading} />
        <BigStat label="Available" value={available} loading={isLoading} />
      </dl>

      <div className="mt-6">
        <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-wide">
          <span className="text-zinc-700">Utilization</span>
          <span className="font-semibold tabular-nums text-zinc-900">{utilPct}%</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-100">
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
    <section className="relative overflow-hidden rounded-xl bg-white p-4 sm:p-6">
      {children}
    </section>
  );
}

function Header({ rateBps }: { rateBps?: bigint }) {
  return (
    <header className="flex items-start gap-3">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-100 text-black">
        <Database className="h-[18px] w-[18px]" aria-hidden />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Pool</h2>
          {rateBps !== undefined && (
            <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
              {bpsToPct(Number(rateBps))} APR
            </span>
          )}
        </div>
        <p className="mt-0.5 text-sm text-zinc-800">IOPN testnet single-asset pool</p>
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
      <dt className="text-xs uppercase tracking-wide text-zinc-700">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold tabular-nums">
        {loading ? '…' : formatOPN(value)}
        <span className="ml-1 text-sm font-medium text-zinc-700">OPN</span>
      </dd>
    </div>
  );
}
