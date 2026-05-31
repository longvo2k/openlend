import { useQuery } from '@tanstack/react-query';
import { useChainId } from 'wagmi';
import { decodeEventLog } from 'viem';
import { getLendingPoolAddress, lendingPoolAbi } from './contract';

export interface PoolHistoryPoint {
  ts: number;
  totalSupply: bigint;
  totalBorrowed: bigint;
  utilization: number;
}

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

async function fetchLogsViaExplorer(
  apiBase: string,
  contract: `0x${string}`,
): Promise<RawLog[]> {
  const url =
    `${apiBase}?module=logs&action=getLogs` +
    `&fromBlock=0&toBlock=latest&address=${contract}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Explorer logs HTTP ${res.status}`);
  const json = (await res.json()) as ExplorerResponse;
  if (json.status !== '1') return [];
  return json.result;
}

/**
 * Walk raw logs into a chronologically ordered running-sum series.
 * Supplied/Withdrawn change totalSupply. Borrowed/Repaid change
 * totalBorrowed. Liquidated also reduces totalBorrowed (the contract
 * decrements totalBorrowed inside liquidate() but emits Liquidated
 * instead of Repaid). CollateralDeposited/CollateralWithdrawn are
 * skipped — collateral is tracked separately from supply on the
 * LendingPool contract.
 */
function walkEvents(logs: RawLog[]): PoolHistoryPoint[] {
  const points: PoolHistoryPoint[] = [];
  let totalSupply = 0n;
  let totalBorrowed = 0n;

  const sorted = [...logs].sort((a, b) => {
    const aBlock = BigInt(a.blockNumber);
    const bBlock = BigInt(b.blockNumber);
    if (aBlock !== bBlock) return aBlock < bBlock ? -1 : 1;
    return Number(a.logIndex) - Number(b.logIndex);
  });

  for (const raw of sorted) {
    if (raw.topics.length === 0) continue;
    let decoded: { eventName: string; args: Record<string, unknown> } | null = null;
    try {
      decoded = decodeEventLog({
        abi: lendingPoolAbi,
        data: raw.data,
        topics: raw.topics as [signature: `0x${string}`, ...args: `0x${string}`[]],
      }) as unknown as { eventName: string; args: Record<string, unknown> };
    } catch {
      continue;
    }
    if (!decoded) continue;

    const amount = (decoded.args.amount as bigint | undefined) ?? 0n;
    switch (decoded.eventName) {
      case 'Supplied':
        totalSupply += amount;
        break;
      case 'Withdrawn':
        totalSupply -= amount;
        break;
      case 'Borrowed':
        totalBorrowed += amount;
        break;
      case 'Repaid':
        totalBorrowed -= amount;
        break;
      case 'Liquidated':
        totalBorrowed -= (decoded.args.repaid as bigint | undefined) ?? 0n;
        break;
      default:
        continue;
    }
    const ts = raw.timeStamp ? Number(BigInt(raw.timeStamp)) : 0;
    const utilization =
      totalSupply === 0n
        ? 0
        : Number((totalBorrowed * 10000n) / totalSupply) / 100;
    points.push({ ts, totalSupply, totalBorrowed, utilization });
  }

  return points;
}

const SECONDS_PER_HOUR = 3600;

/**
 * Snap a unix-second timestamp to the start of its hour bucket.
 */
function hourBucket(ts: number): number {
  return Math.floor(ts / SECONDS_PER_HOUR) * SECONDS_PER_HOUR;
}

/**
 * Reduce a per-event series to one point per hour bucket (the last
 * event in each bucket). Prepends a synthetic zero point one hour
 * before the first real event so the chart begins at the origin.
 */
function bucketHourly(points: PoolHistoryPoint[]): PoolHistoryPoint[] {
  if (points.length === 0) return [];

  // Group by hour bucket, keep the last point per bucket.
  const byBucket = new Map<number, PoolHistoryPoint>();
  for (const p of points) {
    if (p.ts === 0) continue; // explorer didn't supply a timestamp
    byBucket.set(hourBucket(p.ts), { ...p, ts: hourBucket(p.ts) });
  }

  const result = Array.from(byBucket.values()).sort((a, b) => a.ts - b.ts);
  if (result.length === 0) return [];

  // Prepend a synthetic zero point one bucket before the first.
  result.unshift({
    ts: result[0].ts - SECONDS_PER_HOUR,
    totalSupply: 0n,
    totalBorrowed: 0n,
    utilization: 0,
  });

  return result;
}

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
      const logs = await fetchLogsViaExplorer(apiBase, pool);
      const walked = walkEvents(logs);
      return bucketHourly(walked);
    },
  });
}
