'use client';

import { useChainId, useReadContracts } from 'wagmi';
import { lendingPoolAbi, getLendingPoolAddress } from '../lib/contract';
import { formatOPN, bpsToPct, utilization } from '../lib/format';

export function PoolStats() {
  const chainId = useChainId();
  const address = getLendingPoolAddress(chainId);

  if (!address) {
    return (
      <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-6">
        <h2 className="text-xl font-semibold mb-2">Pool</h2>
        <p className="text-amber-200">
          No deployment found for chainId {chainId}. Run <code>npm run deploy:testnet</code> from the repo root first.
        </p>
      </section>
    );
  }

  const { data, isLoading } = useReadContracts({
    contracts: [
      { address, abi: lendingPoolAbi, functionName: 'totalSupplied' },
      { address, abi: lendingPoolAbi, functionName: 'totalBorrowed' },
      { address, abi: lendingPoolAbi, functionName: 'availableLiquidity' },
      { address, abi: lendingPoolAbi, functionName: 'RATE_BPS' },
    ],
    query: { refetchInterval: 5000 },
  });

  const supplied = data?.[0]?.result as bigint | undefined;
  const borrowed = data?.[1]?.result as bigint | undefined;
  const available = data?.[2]?.result as bigint | undefined;
  const rateBps = data?.[3]?.result as bigint | undefined;

  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-6">
      <h2 className="text-xl font-semibold mb-4">Pool</h2>
      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Stat label="Total supplied" value={isLoading ? '…' : `${formatOPN(supplied)} OPN`} />
        <Stat label="Total borrowed" value={isLoading ? '…' : `${formatOPN(borrowed)} OPN`} />
        <Stat label="Available" value={isLoading ? '…' : `${formatOPN(available)} OPN`} />
        <Stat label="APR / Utilization" value={isLoading ? '…' : `${bpsToPct(Number(rateBps ?? 0n))} / ${utilization(supplied, borrowed)}`} />
      </dl>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-zinc-500">{label}</dt>
      <dd className="text-lg font-medium">{value}</dd>
    </div>
  );
}
