import { useQuery } from '@tanstack/react-query';
import { useChainId } from 'wagmi';
import { getLendingPoolAddress } from './contract';

/**
 * One sampled point on the pool history chart. Times are unix seconds
 * snapped to the start of the hour bucket. `totalSupply` and
 * `totalBorrowed` are kept as bigint for accuracy and converted to
 * number at the chart boundary.
 */
export interface PoolHistoryPoint {
  ts: number;
  totalSupply: bigint;
  totalBorrowed: bigint;
  utilization: number;
}

/**
 * Explorer API base per chain. Only chain 984 (IOPN testnet) is
 * supported; local hardhat has no explorer so the hook returns empty.
 * Matches the table in lib/history.ts.
 */
const EXPLORER_API_BASE: Record<number, string | undefined> = {
  984: 'https://testnet.iopn.tech/api',
};

interface RawLog {
  address: string;
  topics: readonly `0x${string}`[];
  data: `0x${string}`;
  blockNumber: string;
  transactionHash: `0x${string}`;
  logIndex: string;
  timeStamp?: string;
}

interface ExplorerResponse {
  status: string;
  message: string;
  result: RawLog[];
}

/**
 * TanStack Query hook for pool TVL and utilization over time.
 * Returns an array of hourly-bucketed PoolHistoryPoint, or [] when no
 * activity exists yet for the pool on this chain.
 *
 * Task 2 ships the empty-result skeleton; Task 3 adds fetch + decode;
 * Task 4 adds hourly bucketing.
 */
export function useLendingPoolHistory() {
  const chainId = useChainId();
  const pool = getLendingPoolAddress(chainId);

  return useQuery<PoolHistoryPoint[]>({
    queryKey: ['lending-pool-history', chainId, pool],
    enabled: Boolean(pool),
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    staleTime: 30_000,
    queryFn: async () => {
      if (!pool) return [];
      const apiBase = EXPLORER_API_BASE[chainId];
      if (!apiBase) return [];
      // Fetching, decoding, and bucketing are added in later tasks.
      // RawLog and ExplorerResponse types are pre-declared above so
      // Task 3 only needs to add functions, not re-declare types.
      return [];
    },
  });
}
