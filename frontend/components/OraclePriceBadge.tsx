'use client';

import { useChainId, useReadContract } from 'wagmi';
import { Activity } from 'lucide-react';
import { getPriceOracleAddress, priceOracleAbi } from '@/lib/contract';
import { formatMUSDC } from '@/lib/format';

/**
 * One-row badge that displays the admin-set oracle's current OPN
 * price (in mUSDC). When a proposal is pending, appends a status
 * message indicating whether the commit window has opened.
 *
 * Used inside PoolStats. Silently degrades to "unavailable" if the
 * oracle is not deployed on this chain or the reads fail.
 */
export function OraclePriceBadge() {
  const chainId = useChainId();
  const oracle = getPriceOracleAddress(chainId);

  const { data: currentRaw, isError: priceError } = useReadContract({
    address: oracle ?? undefined,
    abi: priceOracleAbi,
    functionName: 'getPrice',
    query: { enabled: Boolean(oracle), refetchInterval: 30_000, staleTime: 15_000 },
  });

  const { data: pendingRaw } = useReadContract({
    address: oracle ?? undefined,
    abi: priceOracleAbi,
    functionName: 'pendingProposal',
    query: { enabled: Boolean(oracle), refetchInterval: 30_000, staleTime: 15_000 },
  });

  if (!oracle || priceError || currentRaw === undefined) {
    return (
      <div className="flex items-center gap-2 text-xs text-zinc-500">
        <Activity className="h-3.5 w-3.5" aria-hidden />
        <span>OPN price (oracle): unavailable</span>
      </div>
    );
  }

  // currentPrice is 1e18-scaled mUSDC per OPN. Re-use formatMUSDC by
  // treating the value as if it were 18-decimal wei of mUSDC — it
  // collapses to a human-readable number with two decimal places.
  const current = currentRaw as bigint;
  const priceLabel = formatMUSDC(current / 10n ** 12n);

  const pending = pendingRaw as readonly [bigint, bigint, boolean] | undefined;
  const hasPending = pending !== undefined && pending[1] > 0n;

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 px-2.5 py-1 font-medium text-zinc-900">
        <Activity className="h-3.5 w-3.5" aria-hidden />
        OPN price (oracle): {priceLabel} mUSDC
      </span>
      {hasPending && (
        <span className="text-zinc-600">
          {pending![2]
            ? 'pending update ready to commit'
            : `next update unlocks in ${minutesLeft(pending![1])}m`}
        </span>
      )}
    </div>
  );
}

function minutesLeft(unlockTime: bigint): number {
  const nowSec = Math.floor(Date.now() / 1000);
  const diff = Number(unlockTime) - nowSec;
  return diff > 0 ? Math.ceil(diff / 60) : 0;
}
