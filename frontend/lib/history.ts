import { useQuery } from '@tanstack/react-query';
import { useAccount, useChainId, usePublicClient } from 'wagmi';
import { decodeEventLog, parseAbiItem, type Log } from 'viem';
import { getLendingPoolAddress, lendingPoolAbi } from './contract';

export type EventKind =
  | 'Supplied'
  | 'Withdrawn'
  | 'CollateralDeposited'
  | 'CollateralWithdrawn'
  | 'Borrowed'
  | 'Repaid'
  | 'LiquidatedByMe'
  | 'LiquidatedAgainstMe';

export interface HistoryEvent {
  kind: EventKind;
  amount: bigint;
  extra: {
    counterparty?: `0x${string}`;
    shares?: bigint;
    seized?: bigint;
  };
  blockNumber: bigint;
  timestamp: number; // unix seconds; 0 if unavailable
  txHash: `0x${string}`;
  logIndex: number;
}

/**
 * IOPN testnet Blockscout-style explorer API base. Used as the primary
 * log-fetch path on chain 984: one HTTP call returns all logs for the
 * contract within the requested range — no chunking, no 5k-block cap.
 */
const EXPLORER_API_BASE: Record<number, string | undefined> = {
  984: 'https://testnet.iopn.tech/api',
};

/** Default scan window for chains without an explorer (just hardhat). */
const DEFAULT_WINDOW_BLOCKS = 50_000n;
/** RPC fallback chunk size. Many RPCs silently cap eth_getLogs around 5k. */
const RPC_CHUNK_BLOCKS = 4900n;

interface RawLog {
  address: string;
  topics: readonly `0x${string}`[];
  data: `0x${string}`;
  blockNumber: string;     // hex
  transactionHash: `0x${string}`;
  logIndex: string;        // hex
  timeStamp?: string;      // hex (explorer-provided)
}

interface ExplorerResponse {
  status: string;
  message: string;
  result: RawLog[];
}

export function useUserHistory() {
  const chainId = useChainId();
  const { address: user } = useAccount();
  const pool = getLendingPoolAddress(chainId);
  const client = usePublicClient();

  return useQuery<HistoryEvent[]>({
    queryKey: ['lending-pool-history', chainId, pool, user],
    enabled: Boolean(pool && user),
    // Refetch a bit less aggressively, and only when the tab is foregrounded.
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    staleTime: 15_000,
    queryFn: async () => {
      if (!pool || !user) return [];

      const apiBase = EXPLORER_API_BASE[chainId];
      const logs = apiBase
        ? await fetchLogsViaExplorer(apiBase, pool)
        : await fetchLogsViaRpc(client, pool);

      const events: HistoryEvent[] = [];
      for (const raw of logs) {
        const ev = toHistoryEvent(raw, user);
        if (ev) events.push(ev);
      }

      // Newest first; tie-break by logIndex desc within the same block.
      events.sort((a, b) => {
        if (a.blockNumber === b.blockNumber) return b.logIndex - a.logIndex;
        return a.blockNumber > b.blockNumber ? -1 : 1;
      });

      return events;
    },
  });
}

/* -------------------- Explorer (Blockscout / Etherscan) -------------------- */

async function fetchLogsViaExplorer(
  apiBase: string,
  contract: `0x${string}`,
): Promise<RawLog[]> {
  // The explorer handles paginating internally; we don't need to chunk.
  // It also returns timeStamp per-log, saving us a per-block round-trip.
  const url =
    `${apiBase}?module=logs&action=getLogs` +
    `&fromBlock=0&toBlock=latest&address=${contract}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Explorer logs HTTP ${res.status}`);
  const json = (await res.json()) as ExplorerResponse;
  // "No logs found" returns status "0" with empty result; treat as empty.
  if (json.status !== '1') return [];
  return json.result;
}

/* -------------------- RPC fallback (chunked) -------------------- */

async function fetchLogsViaRpc(
  client: ReturnType<typeof usePublicClient>,
  contract: `0x${string}`,
): Promise<RawLog[]> {
  if (!client) return [];
  const latest = await client.getBlockNumber();
  const from = latest > DEFAULT_WINDOW_BLOCKS ? latest - DEFAULT_WINDOW_BLOCKS : 0n;

  const out: RawLog[] = [];
  for (let start = from; start <= latest; start += RPC_CHUNK_BLOCKS) {
    const end = start + RPC_CHUNK_BLOCKS - 1n > latest ? latest : start + RPC_CHUNK_BLOCKS - 1n;
    const logs = await client.getLogs({
      address: contract,
      fromBlock: start,
      toBlock: end,
    });
    // Need timestamps. Batch by unique block.
    const blocks = new Map<bigint, number>();
    const uniqueBlocks = Array.from(new Set(logs.map((l) => l.blockNumber!)));
    const blockMeta = await Promise.all(
      uniqueBlocks.map((n) => client.getBlock({ blockNumber: n })),
    );
    for (const b of blockMeta) blocks.set(b.number, Number(b.timestamp));

    for (const l of logs) {
      out.push({
        address: l.address,
        topics: l.topics as readonly `0x${string}`[],
        data: l.data,
        blockNumber: `0x${(l.blockNumber ?? 0n).toString(16)}`,
        transactionHash: l.transactionHash!,
        logIndex: `0x${(l.logIndex ?? 0).toString(16)}`,
        timeStamp: `0x${(blocks.get(l.blockNumber ?? 0n) ?? 0).toString(16)}`,
      });
    }
  }
  return out;
}

/* -------------------- Decoding -------------------- */

function toHistoryEvent(raw: RawLog, user: `0x${string}`): HistoryEvent | null {
  // viem expects topics to be a tuple. The first element is the event sig.
  if (raw.topics.length === 0) return null;
  // Loose typing: lendingPoolAbi comes from a JSON import, so viem can't
  // narrow eventName/args. Cast through unknown to satisfy TS while keeping
  // the runtime decode strict.
  let decoded: { eventName: string; args: Record<string, unknown> } | null = null;
  try {
    decoded = decodeEventLog({
      abi: lendingPoolAbi,
      data: raw.data,
      topics: raw.topics as [signature: `0x${string}`, ...args: `0x${string}`[]],
    }) as unknown as { eventName: string; args: Record<string, unknown> };
  } catch {
    // Not one of the events we know about (e.g. InterestAccrued has no user).
    return null;
  }
  if (!decoded) return null;

  const args = decoded.args;
  const userLower = user.toLowerCase();

  const blockNumber = BigInt(raw.blockNumber);
  const logIndex = Number(raw.logIndex);
  const timestamp = raw.timeStamp ? Number(BigInt(raw.timeStamp)) : 0;
  const txHash = raw.transactionHash;

  function mk(
    kind: EventKind,
    amount: bigint,
    extra: HistoryEvent['extra'],
  ): HistoryEvent {
    return { kind, amount, extra, blockNumber, timestamp, txHash, logIndex };
  }

  switch (decoded.eventName) {
    case 'Supplied': {
      if (String(args.user).toLowerCase() !== userLower) return null;
      return mk('Supplied', (args.amount as bigint) ?? 0n, {
        shares: args.shares as bigint | undefined,
      });
    }
    case 'Withdrawn': {
      if (String(args.user).toLowerCase() !== userLower) return null;
      return mk('Withdrawn', (args.amount as bigint) ?? 0n, {
        shares: args.shares as bigint | undefined,
      });
    }
    case 'CollateralDeposited': {
      if (String(args.user).toLowerCase() !== userLower) return null;
      return mk('CollateralDeposited', (args.amount as bigint) ?? 0n, {});
    }
    case 'CollateralWithdrawn': {
      if (String(args.user).toLowerCase() !== userLower) return null;
      return mk('CollateralWithdrawn', (args.amount as bigint) ?? 0n, {});
    }
    case 'Borrowed': {
      if (String(args.user).toLowerCase() !== userLower) return null;
      return mk('Borrowed', (args.amount as bigint) ?? 0n, {});
    }
    case 'Repaid': {
      if (String(args.user).toLowerCase() !== userLower) return null;
      return mk('Repaid', (args.amount as bigint) ?? 0n, {});
    }
    case 'Liquidated': {
      const liquidator = String(args.liquidator).toLowerCase();
      const borrower = String(args.user).toLowerCase();
      const repaid = (args.repaid as bigint) ?? 0n;
      const seized = args.seized as bigint | undefined;
      if (liquidator === userLower) {
        return mk('LiquidatedByMe', repaid, {
          counterparty: args.user as `0x${string}`,
          seized,
        });
      }
      if (borrower === userLower) {
        return mk('LiquidatedAgainstMe', repaid, {
          counterparty: args.liquidator as `0x${string}`,
          seized,
        });
      }
      return null;
    }
    default:
      return null; // e.g. InterestAccrued
  }
}

// Keep parseAbiItem import alive for potential future use in tests.
export const _unused_parseAbiItem = parseAbiItem;
// Type assertion helper kept for older callers (no-op).
export type RawLogShape = Log<bigint, number, false>;
