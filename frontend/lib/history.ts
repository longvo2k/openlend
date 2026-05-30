import { useQuery } from '@tanstack/react-query';
import { useAccount, useChainId, usePublicClient } from 'wagmi';
import { parseAbiItem } from 'viem';
import type { Log } from 'viem';
import { getLendingPoolAddress } from './contract';

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
  /** Native OPN amount that moved on this event (always OPN, 18 dec). */
  amount: bigint;
  /** Extra context per kind (counterparty, share/seize amount). */
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

const EVENTS = {
  Supplied: parseAbiItem(
    'event Supplied(address indexed user, uint256 amount, uint256 shares)',
  ),
  Withdrawn: parseAbiItem(
    'event Withdrawn(address indexed user, uint256 amount, uint256 shares)',
  ),
  CollateralDeposited: parseAbiItem(
    'event CollateralDeposited(address indexed user, uint256 amount)',
  ),
  CollateralWithdrawn: parseAbiItem(
    'event CollateralWithdrawn(address indexed user, uint256 amount)',
  ),
  Borrowed: parseAbiItem(
    'event Borrowed(address indexed user, uint256 amount)',
  ),
  Repaid: parseAbiItem('event Repaid(address indexed user, uint256 amount)'),
  Liquidated: parseAbiItem(
    'event Liquidated(address indexed liquidator, address indexed user, uint256 repaid, uint256 seized)',
  ),
} as const;

/**
 * IOPN testnet RPC silently caps `eth_getLogs` ranges — wide queries
 * (e.g. `fromBlock: 'earliest'`) return an empty array instead of
 * paginating or erroring. We chunk every scan into windows that the
 * RPC will accept.
 */
const CHUNK_BLOCKS = 4900n; // small headroom under the apparent ~5k cap
/** How far back to scan when no deploy-block env var is provided. */
const DEFAULT_WINDOW_BLOCKS = 200_000n; // ~2.3 days at 1s blocks

/**
 * Fetches the connected user's history from the LendingPool contract.
 * Chunks the chain scan into 4,900-block windows so the IOPN RPC's
 * silent range cap doesn't drop results.
 *
 * Override the scan start via NEXT_PUBLIC_LENDING_POOL_DEPLOY_BLOCK_TESTNET
 * (or _LOCAL) — set this to the block your LendingPool was deployed in
 * for fastest results on chains with millions of pre-deploy blocks.
 */
export function useUserHistory() {
  const chainId = useChainId();
  const { address: user } = useAccount();
  const pool = getLendingPoolAddress(chainId);
  const client = usePublicClient();

  return useQuery<HistoryEvent[]>({
    queryKey: ['lending-pool-history', chainId, pool, user],
    enabled: Boolean(client && pool && user),
    refetchInterval: 15_000,
    queryFn: async () => {
      if (!client || !pool || !user) return [];

      const latest = await client.getBlockNumber();

      const deployBlockRaw =
        chainId === 984
          ? process.env.NEXT_PUBLIC_LENDING_POOL_DEPLOY_BLOCK_TESTNET
          : chainId === 31337
          ? process.env.NEXT_PUBLIC_LENDING_POOL_DEPLOY_BLOCK_LOCAL
          : undefined;

      const fromBlock: bigint = deployBlockRaw
        ? BigInt(deployBlockRaw)
        : latest > DEFAULT_WINDOW_BLOCKS
        ? latest - DEFAULT_WINDOW_BLOCKS
        : 0n;

      // Build the chunk boundaries upfront, then run all event queries
      // for each chunk in parallel. Chunks are processed serially to keep
      // RPC pressure bounded.
      const chunks: { from: bigint; to: bigint }[] = [];
      for (let start = fromBlock; start <= latest; start += CHUNK_BLOCKS) {
        const end = start + CHUNK_BLOCKS - 1n;
        chunks.push({ from: start, to: end > latest ? latest : end });
      }

      const events: HistoryEvent[] = [];

      for (const { from, to } of chunks) {
        const baseArgs = {
          address: pool,
          fromBlock: from,
          toBlock: to,
        } as const;

        const [
          suppliedLogs,
          withdrawnLogs,
          depColLogs,
          wdrColLogs,
          borrowedLogs,
          repaidLogs,
          liquidatedByMe,
          liquidatedAgainstMe,
        ] = await Promise.all([
          client.getLogs({ ...baseArgs, event: EVENTS.Supplied, args: { user } }),
          client.getLogs({ ...baseArgs, event: EVENTS.Withdrawn, args: { user } }),
          client.getLogs({ ...baseArgs, event: EVENTS.CollateralDeposited, args: { user } }),
          client.getLogs({ ...baseArgs, event: EVENTS.CollateralWithdrawn, args: { user } }),
          client.getLogs({ ...baseArgs, event: EVENTS.Borrowed, args: { user } }),
          client.getLogs({ ...baseArgs, event: EVENTS.Repaid, args: { user } }),
          client.getLogs({ ...baseArgs, event: EVENTS.Liquidated, args: { liquidator: user } }),
          client.getLogs({ ...baseArgs, event: EVENTS.Liquidated, args: { user } }),
        ]);

        for (const log of suppliedLogs) {
          events.push(base(log, 'Supplied', log.args.amount ?? 0n, { shares: log.args.shares }));
        }
        for (const log of withdrawnLogs) {
          events.push(base(log, 'Withdrawn', log.args.amount ?? 0n, { shares: log.args.shares }));
        }
        for (const log of depColLogs) {
          events.push(base(log, 'CollateralDeposited', log.args.amount ?? 0n, {}));
        }
        for (const log of wdrColLogs) {
          events.push(base(log, 'CollateralWithdrawn', log.args.amount ?? 0n, {}));
        }
        for (const log of borrowedLogs) {
          events.push(base(log, 'Borrowed', log.args.amount ?? 0n, {}));
        }
        for (const log of repaidLogs) {
          events.push(base(log, 'Repaid', log.args.amount ?? 0n, {}));
        }
        for (const log of liquidatedByMe) {
          events.push(
            base(log, 'LiquidatedByMe', log.args.repaid ?? 0n, {
              counterparty: log.args.user as `0x${string}` | undefined,
              seized: log.args.seized,
            }),
          );
        }
        for (const log of liquidatedAgainstMe) {
          events.push(
            base(log, 'LiquidatedAgainstMe', log.args.repaid ?? 0n, {
              counterparty: log.args.liquidator as `0x${string}` | undefined,
              seized: log.args.seized,
            }),
          );
        }
      }

      // Enrich with block timestamps (one RPC per unique block, in parallel).
      const uniqueBlocks = Array.from(new Set(events.map((e) => e.blockNumber)));
      const blocks = await Promise.all(
        uniqueBlocks.map((n) => client.getBlock({ blockNumber: n })),
      );
      const tsByBlock = new Map<bigint, number>(
        blocks.map((b) => [b.number, Number(b.timestamp)]),
      );
      for (const e of events) {
        e.timestamp = tsByBlock.get(e.blockNumber) ?? 0;
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

function base(
  log: Log<bigint, number, false>,
  kind: EventKind,
  amount: bigint,
  extra: HistoryEvent['extra'],
): HistoryEvent {
  return {
    kind,
    amount,
    extra,
    blockNumber: log.blockNumber!,
    timestamp: 0,
    txHash: log.transactionHash!,
    logIndex: log.logIndex!,
  };
}
